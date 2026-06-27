/**
 * SwarmAlpha — Nonlinear Consensus Aggregation v2
 *
 * 7 种纯数学非线性共识方法，突破线性加权平均的信息论天花板。
 *
 * 核心洞察:
 *   线性共识 = Σ(belief × weight) / Σ(weight) — 输出永远在输入凸包内, 不能创造信息。
 *   非线性方法通过修饰信念值或权重来突破此约束:
 *     - 幂律: 放大极端信念的信号强度
 *     - 熵权: 分歧大时压缩权重 (噪音环境降低信噪比)
 *     - 修剪均值: 移除极端值, 降低少数派绑架风险
 *     - 中位数: 完全免疫极端值
 *     - 缩尾: 限制极端值但不移除
 *     - 几何平均: 零信念强抑制, 对极端值鲁棒
 *     - 动态集成: 多方法加权混合, 信号质量自适应
 *
 * 全部纯数学，零 LLM 调用。
 *
 * 使用:
 *   import { computeNonlinearConsensus } from "./nonlinearConsensus";
 *   const result = computeNonlinearConsensus({ agents, states, kuramotoR }, { method: "dynamic_ensemble" });
 */

import { V9AgentDefinition, V9AgentState } from "./types";

// ==================== 类型定义 ====================

/** 内部使用的加权信念条目 */
interface BeliefEntry {
  agentId: string;
  belief: number;
  weight: number;
  confidence: number;
}

/** 非线性共识输入 */
export interface NonlinearConsensusInput {
  agents: V9AgentDefinition[];
  states: Record<string, V9AgentState>;
  /** Kuramoto 序参量 (可选, 用于信号质量评分) */
  kuramotoR?: number;
}

/** 非线性共识输出 */
export interface NonlinearConsensusOutput {
  consensus: number;        // -100 .. +100
  method: string;           // 方法标识符
  confidence: number;       // 0-100
  metadata: {
    signalQuality: number;  // 集成权重用的信号质量分 (0-1)
    details: Record<string, number>;  // 额外诊断信息
  };
}

/** 非线性共识配置 */
export interface NonlinearConfig {
  /** 方法选择 */
  method: "power_law" | "entropy_weighted" | "trimmed_mean" | "median" |
         "winsorized" | "geometric_mean" | "dynamic_ensemble" | "linear_baseline";

  // --- 幂律参数 ---
  /** 幂指数 (1.0=线性, >1 放大极端, <1 压缩极端). 默认 1.5 */
  powerAlpha?: number;

  // --- 修剪均值参数 ---
  /** 从两端各移除几个 Agent. 默认 1 */
  trimCount?: number;

  // --- 缩尾参数 ---
  /** 下百分位阈值 (0-100). 默认 20 */
  winsorLowerPct?: number;
  /** 上百分位阈值 (0-100). 默认 80 */
  winsorUpperPct?: number;

  // --- 集成参数 ---
  /** 集成中包含的方法列表. 默认全部 6 种非线性方法 */
  ensembleMethods?: string[];
  /** 固定权重覆盖 (key: method name). 设置后跳过信号质量评分 */
  ensembleWeights?: Record<string, number>;

  // --- 通用 ---
  /** 信念钳制范围. 默认 [-100, 100] */
  clampRange?: [number, number];
}

/** 默认配置 */
export const DEFAULT_NONLINEAR_CONFIG: NonlinearConfig = {
  method: "dynamic_ensemble",
  powerAlpha: 1.5,
  trimCount: 1,
  winsorLowerPct: 20,
  winsorUpperPct: 80,
  ensembleMethods: ["power_law", "entropy_weighted", "trimmed_mean", "median", "winsorized", "geometric_mean"],
};

// ==================== 辅助函数 ====================

/** 从 agents + states 构建加权信念条目列表 */
function buildEntries(
  agents: V9AgentDefinition[],
  states: Record<string, V9AgentState>
): BeliefEntry[] {
  const entries: BeliefEntry[] = [];
  for (const agent of agents) {
    const state = states[agent.id];
    if (!state) continue;
    entries.push({
      agentId: agent.id,
      belief: state.belief,
      weight: agent.influenceWeight * (state.confidence / 100),
      confidence: state.confidence,
    });
  }
  return entries;
}

/** 安全钳制 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 计算信念数组的标准差 */
function computeStd(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

/** 计算信念分布的 Shannon 熵 (归一化到 0-1) */
function computeNormalizedEntropy(entries: BeliefEntry[]): number {
  if (entries.length <= 1) return 0;
  const beliefs = entries.map(e => e.belief);
  const min = Math.min(...beliefs);
  const max = Math.max(...beliefs);
  if (max === min) return 0;

  const bins = 10;
  const binWidth = (max - min) / bins;
  const histogram = new Array(bins).fill(0);
  let totalWeight = 0;

  for (const e of entries) {
    const idx = Math.min(bins - 1, Math.floor((e.belief - min) / binWidth));
    histogram[idx] += e.weight;
    totalWeight += e.weight;
  }

  let entropy = 0;
  const maxEntropy = Math.log(bins);
  for (const count of histogram) {
    if (count > 0) {
      const p = count / totalWeight;
      entropy -= p * Math.log(p);
    }
  }

  return entropy / maxEntropy;
}

/** 将信念转换为相位 (-π/2 到 +π/2) */
function beliefToPhase(belief: number): number {
  return (belief / 100) * (Math.PI / 2);
}

/** 计算 Kuramoto 序参量 (若未提供) */
function computeOrderParameter(entries: BeliefEntry[]): number {
  if (entries.length === 0) return 0;
  const n = entries.length;
  let sumReal = 0, sumImag = 0;
  for (const e of entries) {
    const phase = beliefToPhase(e.belief);
    sumReal += Math.cos(phase);
    sumImag += Math.sin(phase);
  }
  return Math.sqrt(sumReal * sumReal + sumImag * sumImag) / n;
}

/** 构建元数据对象 */
function makeOutput(
  consensus: number,
  method: string,
  confidence: number,
  signalQuality: number,
  extraDetails: Record<string, number> = {}
): NonlinearConsensusOutput {
  return {
    consensus: clamp(Math.round(consensus * 100) / 100, -100, 100),
    method,
    confidence: clamp(Math.round(confidence), 0, 100),
    metadata: {
      signalQuality: clamp(signalQuality, 0, 1),
      details: extraDetails,
    },
  };
}

// ==================== 方法 1: 线性基线 ====================

/**
 * 线性加权共识 — 与 simulation.ts 中的 computeLinearConsensus 等价。
 * 作为所有非线性方法的对比基线。
 */
export function computeLinearBaselineConsensus(
  input: NonlinearConsensusInput
): NonlinearConsensusOutput {
  const entries = buildEntries(input.agents, input.states);
  if (entries.length === 0) return makeOutput(0, "linear_baseline", 10, 0.5);

  let weightedSum = 0, totalWeight = 0;
  for (const e of entries) {
    weightedSum += e.belief * e.weight;
    totalWeight += e.weight;
  }
  const consensus = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // 信号质量: 基于信念一致性
  const beliefs = entries.map(e => e.belief);
  const std = computeStd(beliefs);
  const strengthScore = clamp(Math.abs(consensus) / 50, 0, 1);
  const agreementScore = clamp(1 - std / 100, 0, 1);
  const signalQuality = 0.5 * strengthScore + 0.5 * agreementScore;

  return makeOutput(consensus, "linear_baseline", 40 + signalQuality * 40, signalQuality, {
    totalWeight: Math.round(totalWeight * 10) / 10,
    beliefStd: Math.round(std * 10) / 10,
  });
}

// ==================== 方法 2: 幂律共识 ====================

/**
 * Power-Law Consensus
 *
 * sign(belief) × |belief/100|^α × 100
 *
 * α > 1: 放大极端信念 (少数派的强信念获得更大权重)
 * α = 1: 等同于线性
 * α < 1: 压缩极端信念
 *
 * 默认 α = 1.5 — 适度放大极端信号。
 */
export function computePowerLawConsensus(
  input: NonlinearConsensusInput,
  alpha: number = 1.5
): NonlinearConsensusOutput {
  const entries = buildEntries(input.agents, input.states);
  if (entries.length === 0) return makeOutput(0, "power_law", 10, 0.5);

  let weightedSum = 0, totalWeight = 0;
  const transformed: number[] = [];

  for (const e of entries) {
    const sign = Math.sign(e.belief);
    const magnitude = Math.abs(e.belief) / 100;
    const powered = sign * Math.pow(magnitude, alpha) * 100;
    transformed.push(powered);
    weightedSum += powered * e.weight;
    totalWeight += e.weight;
  }

  const consensus = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const std = computeStd(transformed);

  // 信号质量: 幂律变换后的信念一致性
  const strengthScore = clamp(Math.abs(consensus) / 50, 0, 1);
  const agreementScore = clamp(1 - std / 100, 0, 1);
  const signalQuality = 0.5 * strengthScore + 0.5 * agreementScore;

  return makeOutput(consensus, `power_law(α=${alpha})`, 35 + signalQuality * 40, signalQuality, {
    alpha,
    transformedStd: Math.round(std * 10) / 10,
    maxTransformed: Math.round(Math.max(...transformed.map(Math.abs)) * 10) / 10,
  });
}

// ==================== 方法 3: 熵权共识 ====================

/**
 * Entropy-Weighted Consensus
 *
 * 信念分布熵高 (Agent 分歧大) → 压缩权重到均匀 (降低信噪比)
 * 信念分布熵低 (Agent 一致)   → 保持原有权重
 *
 * weight'_i = weight_i × (1 - 0.6 × normalizedEntropy)
 *
 * 物理直觉: 噪音环境中不应过度信任任何单一信号。
 */
export function computeEntropyWeightedConsensus(
  input: NonlinearConsensusInput
): NonlinearConsensusOutput {
  const entries = buildEntries(input.agents, input.states);
  if (entries.length === 0) return makeOutput(0, "entropy_weighted", 10, 0.5);

  const entropy = computeNormalizedEntropy(entries);
  const compression = 0.6 * entropy;  // 最大压缩 60%
  const keepFactor = 1 - compression; // 保留因子

  let weightedSum = 0, totalWeight = 0;
  for (const e of entries) {
    const adjustedWeight = e.weight * keepFactor + (1 / entries.length) * compression;
    weightedSum += e.belief * adjustedWeight;
    totalWeight += adjustedWeight;
  }

  const consensus = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // 信号质量: 低熵 = 高信心
  const signalQuality = clamp(1 - entropy, 0.05, 1);

  return makeOutput(consensus, `entropy_weighted(H=${entropy.toFixed(2)})`, 30 + signalQuality * 40, signalQuality, {
    entropy: Math.round(entropy * 100) / 100,
    compression: Math.round(compression * 100) / 100,
  });
}

// ==================== 方法 4: 修剪均值 ====================

/**
 * Trimmed Mean Consensus
 *
 * 按信念排序，从两端各移除 k 个最极端 Agent，
 * 对剩余 Agent 做加权平均。
 *
 * 默认 k=1: 在 9 Agent 设置中修剪 22% 的极端值。
 * 自动适配 Agent 数量: k 不超过 floor(N/3)。
 */
export function computeTrimmedMeanConsensus(
  input: NonlinearConsensusInput,
  trimCount: number = 1
): NonlinearConsensusOutput {
  const entries = buildEntries(input.agents, input.states);
  if (entries.length === 0) return makeOutput(0, "trimmed_mean", 10, 0.5);

  const sorted = [...entries].sort((a, b) => a.belief - b.belief);
  const maxTrim = Math.floor(sorted.length / 3);
  const k = Math.min(trimCount, maxTrim);

  if (k === 0 || sorted.length <= 2 * k) {
    // 修剪后无 Agent 剩余 → 回退到中位数
    const mid = sorted[Math.floor(sorted.length / 2)];
    return makeOutput(mid.belief, "trimmed_mean(fallback_median)", 30, 0.3, {
      trimCount: 0,
      remainingAgents: 1,
    });
  }

  const remaining = sorted.slice(k, sorted.length - k);
  let weightedSum = 0, totalWeight = 0;
  for (const e of remaining) {
    weightedSum += e.belief * e.weight;
    totalWeight += e.weight;
  }

  const consensus = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // 信号质量: 修剪后的一致性
  const beliefs = remaining.map(e => e.belief);
  const std = computeStd(beliefs);
  const signalQuality = clamp(1 - std / 80, 0.1, 1);

  return makeOutput(consensus, `trimmed_mean(k=${k})`, 35 + signalQuality * 35, signalQuality, {
    trimCount: k,
    remainingAgents: remaining.length,
    trimmedStd: Math.round(std * 10) / 10,
  });
}

// ==================== 方法 5: 加权中位数 ====================

/**
 * Weighted Median Consensus
 *
 * 按信念排序，沿排序列表累加权重直到超过总权重的 50%。
 * 在 straddling 的两个信念之间做线性插值。
 *
 * 中位数完全免疫极端值 — 即使一个 Agent 的信念是 ±100，
 * 只要它的权重不超过 50%，中位数就不会被拉动。
 */
export function computeMedianConsensus(
  input: NonlinearConsensusInput
): NonlinearConsensusOutput {
  const entries = buildEntries(input.agents, input.states);
  if (entries.length === 0) return makeOutput(0, "median", 10, 0.5);
  if (entries.length === 1) return makeOutput(entries[0].belief, "median", entries[0].confidence, 0.5);

  const sorted = [...entries].sort((a, b) => a.belief - b.belief);
  const totalWeight = sorted.reduce((s, e) => s + e.weight, 0);
  const halfWeight = totalWeight / 2;

  let cumulative = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumulative += sorted[i].weight;
    if (cumulative >= halfWeight) {
      // 找到了包含中位数的 Agent
      if (cumulative === halfWeight && i < sorted.length - 1) {
        // 恰好边界: 与下一个取平均
        const consensus = (sorted[i].belief + sorted[i + 1].belief) / 2;
        return makeOutput(consensus, "median(interpolated)", 35, 0.6, {
          pivotIndex: i,
          totalWeight: Math.round(totalWeight * 10) / 10,
        });
      }
      // 检查是否需要插值
      const beforeWeight = cumulative - sorted[i].weight;
      if (beforeWeight > 0 && beforeWeight < halfWeight) {
        // 中位数在两个 Agent 之间: 插值
        const prev = i > 0 ? sorted[i - 1].belief : sorted[i].belief;
        const curr = sorted[i].belief;
        const frac = (halfWeight - (cumulative - sorted[i].weight)) / sorted[i].weight;
        const consensus = prev + (curr - prev) * frac;
        return makeOutput(consensus, "median(interpolated)", 35, 0.6, {
          pivotIndex: i,
          interpolationFraction: Math.round(frac * 100) / 100,
        });
      }
      return makeOutput(sorted[i].belief, "median(exact)", 35, 0.6, {
        pivotIndex: i,
        totalWeight: Math.round(totalWeight * 10) / 10,
      });
    }
  }

  // Fallback (不应到达)
  return makeOutput(sorted[Math.floor(sorted.length / 2)].belief, "median(fallback)", 20, 0.3);
}

// ==================== 方法 6: 缩尾共识 ====================

/**
 * Winsorized Consensus
 *
 * 将极端信念截尾到指定百分位阈值，然后做加权平均。
 * 与修剪均值不同: 不丢弃 Agent，而是限制其影响力。
 *
 * 默认: 20th 和 80th 百分位。
 */
export function computeWinsorizedConsensus(
  input: NonlinearConsensusInput,
  lowerPct: number = 20,
  upperPct: number = 80
): NonlinearConsensusOutput {
  const entries = buildEntries(input.agents, input.states);
  if (entries.length === 0) return makeOutput(0, "winsorized", 10, 0.5);
  if (entries.length <= 2) {
    // Agent 太少, 退化为线性
    return computeLinearBaselineConsensus(input);
  }

  const sorted = [...entries].sort((a, b) => a.belief - b.belief);

  // 计算加权百分位值
  const totalWeight = sorted.reduce((s, e) => s + e.weight, 0);
  const lowerTarget = totalWeight * (lowerPct / 100);
  const upperTarget = totalWeight * (upperPct / 100);

  let lowerValue = sorted[0].belief;
  let upperValue = sorted[sorted.length - 1].belief;

  let cumWeight = 0;
  for (const e of sorted) {
    cumWeight += e.weight;
    if (cumWeight >= lowerTarget && lowerValue === sorted[0].belief) {
      lowerValue = e.belief;
    }
    if (cumWeight >= upperTarget) {
      upperValue = e.belief;
      break;
    }
  }

  // 缩尾: 钳制每个信念到 [lowerValue, upperValue]
  let weightedSum = 0;
  let totalW = 0;
  for (const e of entries) {
    const clamped = clamp(e.belief, lowerValue, upperValue);
    weightedSum += clamped * e.weight;
    totalW += e.weight;
  }

  const consensus = totalW > 0 ? weightedSum / totalW : 0;

  // 信号质量: 缩尾范围越窄越一致
  const range = Math.abs(upperValue - lowerValue);
  const signalQuality = clamp(1 - range / 150, 0.1, 1);

  return makeOutput(consensus, `winsorized(${lowerPct}p/${upperPct}p)`, 35 + signalQuality * 35, signalQuality, {
    lowerBound: Math.round(lowerValue * 10) / 10,
    upperBound: Math.round(upperValue * 10) / 10,
    range: Math.round(range * 10) / 10,
  });
}

// ==================== 方法 7: 几何平均共识 ====================

/**
 * Geometric Mean Consensus
 *
 * 1. 将所有信念平移 +101 → 范围 [1, 201] (避免 log(0))
 * 2. 计算加权几何平均: exp(Σ(weight_i × ln(shifted_i)) / Σ(weight_i))
 * 3. 平移回去 -101
 *
 * 几何平均对异常值的敏感度远低于算术平均:
 *   若 8 个 Agent 信念 ~0, 1 个 Agent 信念 100,
 *   算术平均 → ~11, 几何平均 → ~1 (几乎不受极端值影响)
 *
 * 零信念 (原始 ~0) 具有强抑制效果 — 这是非线性特性的核心来源。
 */
export function computeGeometricMeanConsensus(
  input: NonlinearConsensusInput
): NonlinearConsensusOutput {
  const entries = buildEntries(input.agents, input.states);
  if (entries.length === 0) return makeOutput(0, "geometric_mean", 10, 0.5);

  const SHIFT = 101; // 信念范围 [-100, 100] → [1, 201]

  let weightedLogSum = 0;
  let totalWeight = 0;

  for (const e of entries) {
    const shifted = e.belief + SHIFT;
    if (shifted <= 0) continue; // 安全守卫 (不应发生)
    weightedLogSum += Math.log(shifted) * e.weight;
    totalWeight += e.weight;
  }

  if (totalWeight === 0) return makeOutput(0, "geometric_mean", 10, 0.3);

  const geometricMeanShifted = Math.exp(weightedLogSum / totalWeight);
  const consensus = geometricMeanShifted - SHIFT;

  // 信号质量: 基于信念的变异系数
  const beliefs = entries.map(e => e.belief + SHIFT);
  const std = computeStd(beliefs);
  const mean = beliefs.reduce((s, v) => s + v, 0) / beliefs.length;
  const cv = mean > 0 ? std / mean : 1;
  const signalQuality = clamp(1 - cv, 0.05, 1);

  return makeOutput(consensus, "geometric_mean", 30 + signalQuality * 30, signalQuality, {
    geometricMeanShifted: Math.round(geometricMeanShifted * 10) / 10,
    cv: Math.round(cv * 100) / 100,
  });
}

// ==================== 方法 8: 动态集成 ====================

/**
 * Dynamic Ensemble Consensus
 *
 * 运行所有配置的非线性方法，按信号质量评分加权混合。
 *
 * 信号质量评分 (每个方法):
 *   1. 共识强度 (33%): |consensus| 越大 → 方向信号越清晰
 *   2. 稳定性 (33%): 1 / (1 + withinMethodCV) — 通过留一法估计
 *   3. Kuramoto 对齐 (33%): 高同步度 → 惩罚激进偏离的方法
 *
 * 权重上限: 单个方法最多占 50% (防止单一方法绑架集成)
 *
 * 每轮独立计算，集成权重自适应变化。
 */
export function computeDynamicEnsembleConsensus(
  input: NonlinearConsensusInput,
  config?: NonlinearConfig
): NonlinearConsensusOutput {
  const entries = buildEntries(input.agents, input.states);
  if (entries.length === 0) return makeOutput(0, "dynamic_ensemble", 10, 0.3);

  const cfg = config ?? DEFAULT_NONLINEAR_CONFIG;
  const methodNames = cfg.ensembleMethods ?? DEFAULT_NONLINEAR_CONFIG.ensembleMethods!;
  const r = input.kuramotoR ?? computeOrderParameter(entries);

  // 定义方法工厂
  const methodFactories: Array<{
    name: string;
    fn: (input: NonlinearConsensusInput) => NonlinearConsensusOutput;
  }> = [
    { name: "power_law", fn: (i) => computePowerLawConsensus(i, cfg.powerAlpha ?? 1.5) },
    { name: "entropy_weighted", fn: computeEntropyWeightedConsensus },
    { name: "trimmed_mean", fn: (i) => computeTrimmedMeanConsensus(i, cfg.trimCount ?? 1) },
    { name: "median", fn: computeMedianConsensus },
    { name: "winsorized", fn: (i) => computeWinsorizedConsensus(i, cfg.winsorLowerPct ?? 20, cfg.winsorUpperPct ?? 80) },
    { name: "geometric_mean", fn: computeGeometricMeanConsensus },
  ];

  // 筛选出配置中要求的方法
  const activeMethods = methodFactories.filter(m => methodNames.includes(m.name));
  if (activeMethods.length === 0) {
    return computeLinearBaselineConsensus(input);
  }

  // 运行所有方法
  const results = activeMethods.map(m => ({
    name: m.name,
    output: m.fn(input),
  }));

  // 为每个方法计算信号质量评分
  const scores: Array<{ name: string; consensus: number; confidence: number; score: number }> = [];

  for (const result of results) {
    const c = result.output.consensus;

    // 1. 共识强度 (0-1): 绝对值越大越好
    const strengthScore = clamp(Math.abs(c) / 50, 0.05, 1);

    // 2. 稳定性 (0-1): 通过留一法估计
    let stabilityScore = 0.5;
    if (entries.length > 2) {
      const looResults: number[] = [];
      for (let i = 0; i < entries.length; i++) {
        const leftOutAgentId = entries[i].agentId;
        const looAgents = input.agents.filter(a => a.id !== leftOutAgentId);
        const looStates: Record<string, V9AgentState> = {};
        for (const a of looAgents) {
          if (input.states[a.id]) looStates[a.id] = input.states[a.id];
        }
        const looInput: NonlinearConsensusInput = { agents: looAgents, states: looStates, kuramotoR: r };
        try {
          const looResult = result.output.metadata?.details?.["loo_consensus"] ??
            (() => {
              const factory = methodFactories.find(mf => mf.name === result.name);
              return factory ? factory.fn(looInput).consensus : c;
            })();
          looResults.push(typeof looResult === "number" ? looResult : c);
        } catch {
          looResults.push(c);
        }
      }
      const looStd = computeStd(looResults);
      stabilityScore = clamp(1 / (1 + looStd / 20), 0.1, 1);
    }

    // 3. Kuramoto 对齐 (0-1): 高同步 → 对激进偏差惩罚
    //    当 r > 0.7 (高度同步): 惩罚与群体方向不一致的方法
    //    当 r < 0.3 (分散): 所有方法平等 (没有清晰的"正确"方向)
    const directionSign = Math.sign(c);
    const majoritySign = entries.reduce((s, e) => s + Math.sign(e.belief) * e.weight, 0) > 0 ? 1 : -1;
    const alignmentBonus = directionSign === majoritySign ? r : (1 - r) * 0.5;
    const kuramotoScore = clamp(alignmentBonus, 0.1, 1);

    // 综合评分 (等权重)
    const score = (strengthScore + stabilityScore + kuramotoScore) / 3;

    scores.push({ name: result.name, consensus: c, confidence: result.output.confidence, score });
  }

  // 权重上限: 单方法最多 50%
  const totalScore = scores.reduce((s, sc) => s + sc.score, 0);
  const maxShare = 0.5;
  const weights: Record<string, number> = {};

  for (const sc of scores) {
    let rawWeight = totalScore > 0 ? sc.score / totalScore : 1 / scores.length;
    weights[sc.name] = Math.min(rawWeight, maxShare);
  }

  // 重新归一化 (处理截断后的剩余分配)
  const weightSum = Object.values(weights).reduce((s, w) => s + w, 0);
  if (weightSum > 0) {
    for (const key of Object.keys(weights)) {
      weights[key] = weights[key] / weightSum;
    }
  }

  // 加权混合
  let blendedConsensus = 0;
  for (const sc of scores) {
    blendedConsensus += sc.consensus * (weights[sc.name] ?? 0);
  }

  // 计算集成置信度 (基于权重分布的集中度)
  const weightVariance = computeStd(Object.values(weights));
  const ensembleConfidence = clamp(50 + (1 - weightVariance * 2) * 30, 20, 85);

  return makeOutput(blendedConsensus, "dynamic_ensemble", ensembleConfidence, r, {
    methodCount: scores.length,
    maxWeight: Math.max(...Object.values(weights)),
    ...Object.fromEntries(scores.map(s => [`${s.name}_consensus`, s.consensus])),
    ...Object.fromEntries(scores.map(s => [`${s.name}_weight`, Math.round((weights[s.name] ?? 0) * 1000) / 1000])),
  });
}

// ==================== 调度器 ====================

/**
 * 统一的非线性共识入口。
 *
 * @param input  — Agent 定义 + 状态 + 可选 Kuramoto r
 * @param config — 方法选择和参数 (默认: dynamic_ensemble)
 * @returns 共识值 + 方法 + 置信度 + 元数据
 */
export function computeNonlinearConsensus(
  input: NonlinearConsensusInput,
  config?: NonlinearConfig
): NonlinearConsensusOutput {
  const cfg = config ?? DEFAULT_NONLINEAR_CONFIG;

  switch (cfg.method) {
    case "linear_baseline":
      return computeLinearBaselineConsensus(input);

    case "power_law":
      return computePowerLawConsensus(input, cfg.powerAlpha ?? 1.5);

    case "entropy_weighted":
      return computeEntropyWeightedConsensus(input);

    case "trimmed_mean":
      return computeTrimmedMeanConsensus(input, cfg.trimCount ?? 1);

    case "median":
      return computeMedianConsensus(input);

    case "winsorized":
      return computeWinsorizedConsensus(
        input,
        cfg.winsorLowerPct ?? 20,
        cfg.winsorUpperPct ?? 80
      );

    case "geometric_mean":
      return computeGeometricMeanConsensus(input);

    case "dynamic_ensemble":
      return computeDynamicEnsembleConsensus(input, cfg);

    default:
      console.warn(`[Nonlinear] 未知方法 "${cfg.method}", 回退到 dynamic_ensemble`);
      return computeDynamicEnsembleConsensus(input, cfg);
  }
}
