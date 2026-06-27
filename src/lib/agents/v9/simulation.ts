/**
 * SwarmAlpha v9.3 — 正交五因子 + 非对称门控 + 四规则 Neutral 检测
 *
 * 流程:
 *   News → 正交因子提取 (5因子) → Agent 各自解释 → Kuramoto 序参量
 *   → 同时计算 KMeans聚类共识 + 线性加权共识
 *   → 非对称门控: KMeans < -15 → 采信KMeans; else → 采信线性
 *   → v9.3 Neutral Detection Engine (四规则) → Decision
 *
 * LLM 成本: 1 次调用 (因子提取), 或 0 次 (模板模式)
 *
 * v9.3 变更 (vs v9.2-Hybrid):
 *   - 🛡️ Neutral Detection Engine 四规则体系:
 *     Rule 1: abs(consensus) < 15 → Neutral (弱共识)
 *     Rule 2: belief_std > 45 → Neutral candidate (高分歧)
 *     Rule 3: kuramoto_r < 0.4 → Neutral candidate (低同步)
 *     Rule 4: uncertainty > 70 AND abs(consensus) < 25 → Neutral (高不确定+弱共识)
 *     Compound: Rule2 AND Rule3 → Neutral (分歧+失同步)
 *     方向判定: consensus >= 15 → UP, else → DOWN
 *
 * v9.2-Hybrid 变更 (vs v9.1):
 *   - 🚀 非对称门控共识 (Asymmetric Gating)
 *   - 📐 序参量 EMA 平滑
 *   - 🎯 共识质量引擎 divergenceThreshold 45→55
 */

import { V9SwarmResult, V9RoundState, V9SimConfig, V9AgentState, PriceFeedbackState } from "./types";
import { extractFactors, templateFactorExtraction } from "./factorExtraction";
import { computeAllAgentStates } from "./agentInterpretation";
import { makeDecision } from "./uncertaintyEngine";
import { getAllAgents, computeBlindnessStats, META_FACTORS } from "./agentDefinitions";
import { generateDiagnostics } from "./diagnostics";
import { V9AgentDefinition } from "./types";
import {
  computeNonlinearConsensus,
  NonlinearConsensusOutput,
  NonlinearConfig,
  DEFAULT_NONLINEAR_CONFIG,
} from "./nonlinearConsensus";
import { CONSENSUS_CONFIG } from "./config";
import { agentLogger } from "../../utils/logger";
import {
  runPriceFeedback,
  getPriceFeedbackSignal,
  formatPriceFeedbackSummary,
} from "./priceFeedback";

// ==================== Kuramoto 序参量 ====================

/** 信念 → 相位 (-100..+100 → -π/2..+π/2) */
function beliefToPhase(belief: number): number {
  return (belief / 100) * (Math.PI / 2);
}

/** 计算 Kuramoto 序参量 r = |Σ e^(iθ_j)| / N */
function computeOrderParameter(phases: number[]): number {
  const n = phases.length;
  if (n === 0) return 0;
  let sumReal = 0, sumImag = 0;
  for (const phase of phases) {
    sumReal += Math.cos(phase);
    sumImag += Math.sin(phase);
  }
  return Math.sqrt(sumReal * sumReal + sumImag * sumImag) / n;
}

// ==================== 共识计算引擎 ====================

interface BeliefEntry {
  agentId: string;
  belief: number;
  weight: number;
}

/**
 * 1D 加权 K-means 聚类共识
 */
function computeClusterConsensus(
  entries: BeliefEntry[],
  k: number
): { consensus: number; largestClusterRatio: number; clusterMethod: string } {
  if (entries.length === 0) return { consensus: 0, largestClusterRatio: 0, clusterMethod: "empty" };
  if (entries.length === 1) return { consensus: entries[0].belief, largestClusterRatio: 1, clusterMethod: "single" };

  const effectiveK = Math.max(2, Math.min(k, entries.length));
  const sorted = [...entries].sort((a, b) => a.belief - b.belief);
  const n = sorted.length;
  const clusterSize = Math.ceil(n / effectiveK);
  const clusters: BeliefEntry[][] = [];

  for (let i = 0; i < effectiveK; i++) {
    const start = i * clusterSize;
    const end = Math.min(start + clusterSize, n);
    if (start < n) clusters.push(sorted.slice(start, end));
  }

  let bestCluster = clusters[0];
  let bestWeight = clusters[0].reduce((s, e) => s + e.weight, 0);
  for (const cluster of clusters) {
    const clusterWeight = cluster.reduce((s, e) => s + e.weight, 0);
    if (clusterWeight > bestWeight) {
      bestWeight = clusterWeight;
      bestCluster = cluster;
    }
  }

  let weightedSum = 0, totalW = 0;
  for (const e of bestCluster) {
    weightedSum += e.belief * e.weight;
    totalW += e.weight;
  }
  const consensus = totalW > 0
    ? Math.round((weightedSum / totalW) * 100) / 100
    : 0;

  const largestClusterRatio = bestCluster.length / n;

  return { consensus, largestClusterRatio, clusterMethod: `k=${effectiveK}` };
}

/**
 * 线性加权共识 — v9.1 原始算法
 */
function computeLinearConsensus(
  agents: V9AgentDefinition[],
  states: Record<string, V9AgentState>
): number {
  let weightedSum = 0, totalWeight = 0;
  for (const agent of agents) {
    const state = states[agent.id];
    if (!state) continue;
    const weight = agent.influenceWeight * (state.confidence / 100);
    weightedSum += state.belief * weight;
    totalWeight += weight;
  }
  return totalWeight > 0
    ? Math.round((weightedSum / totalWeight) * 100) / 100
    : 0;
}

// ==================== 非对称门控 ====================

/** 非对称门控阈值: 低于此值的 KMeans 共识被视为强空头信号 (从集中配置读取) */
const ASYMMETRIC_GATE_THRESHOLD = CONSENSUS_CONFIG.asymmetricGateThreshold;

interface GatedConsensus {
  consensus: number;
  method: "cluster" | "linear";
  gateReason: string;
  clusterConsensus: number;
  linearConsensus: number;
}

function applyAsymmetricGate(
  clusterConsensus: number,
  linearConsensus: number
): GatedConsensus {
  if (clusterConsensus < ASYMMETRIC_GATE_THRESHOLD) {
    return {
      consensus: clusterConsensus,
      method: "cluster",
      gateReason: `KMeans=${clusterConsensus.toFixed(1)} < ${ASYMMETRIC_GATE_THRESHOLD} → 强空头, 采信聚类`,
      clusterConsensus,
      linearConsensus,
    };
  }
  return {
    consensus: linearConsensus,
    method: "linear",
    gateReason: `KMeans=${clusterConsensus.toFixed(1)} >= ${ASYMMETRIC_GATE_THRESHOLD} → 多头/模糊, Fallback线性`,
    clusterConsensus,
    linearConsensus,
  };
}

// ==================== 主循环 ====================

export async function runSwarmV9(
  config: V9SimConfig,
  useLLM: boolean = false
): Promise<V9SwarmResult> {
  const apiKey = useLLM ? process.env.DEEPSEEK_API_KEY : undefined;
  const includePolicy = !config.ablation?.disablePolicyAgent;
  const useHybridGating = !config.ablation?.disableClustering;
  const useNeutralR1 = !config.ablation?.disableNeutralRule1;
  const useNeutralR2_3 = !config.ablation?.disableNeutralRule2_3;
  const useNeutralR4 = !config.ablation?.disableNeutralRule4;
  const useNonlinear = !!config.ablation?.nonlinearMethod;

  const nonlinearLabel = useNonlinear ? ` 🔮Nonlinear=${config.ablation!.nonlinearMethod}` : "";
  const usePriceFeedback = config.enablePriceFeedback === true;
  agentLogger.debug(`[V9] 🧬 v9.3 — LLM=${useLLM ? "ON" : "OFF"} Policy=${includePolicy ? "ON" : "OFF"} Neutral=${!config.ablation?.disableUncertainty ? "ON" : "OFF"} Blindness=${!config.ablation?.disableBlindness ? "ON" : "OFF"} HybridGating=${useHybridGating ? "ON" : "OFF"}${nonlinearLabel} | R1=${useNeutralR1 ? "✓" : "✗"} R2∧3=${useNeutralR2_3 ? "✓" : "✗"} R4=${useNeutralR4 ? "✓" : "✗"}${usePriceFeedback ? " 💰PriceFeedback=ON" : ""}`);

  // ── 1. 正交因子提取 ──
  const factorVector = apiKey
    ? await extractFactors(config.news, config.marketData, apiKey)
    : templateFactorExtraction(config.news, config.marketData);

  // 因子值与 uncertainty
  const dirFactors = factorVector.factors.filter(f => !META_FACTORS.includes(f.category));
  const uncFactor = factorVector.factors.find(f => f.category === "uncertainty");
  const uncertaintyFactor = uncFactor?.value ?? 50;
  const factorStr = dirFactors.map(f => `${f.category}:${f.value > 0 ? "+" : ""}${f.value}`).join(" ");
  const uncStr = uncFactor ? ` U:${uncFactor.value}` : "";
  agentLogger.debug(`[V9] 📊 ${factorStr}${uncStr}`);

  if (factorVector.metadata.detectedAnomalies.length > 0) {
    for (const anomaly of factorVector.metadata.detectedAnomalies) {
      agentLogger.debug(`[V9] ⚠️ ${anomaly}`);
    }
  }

  // ── 2. Agent 集合 ──
  const agents = getAllAgents(includePolicy);
  if (!config.ablation?.disableBlindness) {
    const stats = computeBlindnessStats(agents);
    const totalPairs = (agents.length * (agents.length - 1)) / 2;
    const dirOverlapCount = Object.values(stats.directionalOverlapMatrix).reduce((s, arr) => s + arr.length, 0) / 2;
    const blindPairs = totalPairs - dirOverlapCount;
    const blindPct = totalPairs > 0 ? Math.round(blindPairs / totalPairs * 100) : 0;
    agentLogger.debug(`[V9] 🎭 ${agents.length} Agents, 方向因子盲区: ${blindPct}% Agent对无重叠`);
  }

  // ── 3. 主循环 (v9.3: Kuramoto + 动态K + 非对称门控 + Neutral引擎) ──
  const roundResults: V9RoundState[] = [];
  const beliefStdHistory: number[] = [];
  let previousStates: Record<string, any> | undefined;
  let rSmooth: number | undefined;
  let lastNonlinearResult: NonlinearConsensusOutput | null = null;  // 🆕 v9.7: 用于返回元数据

  // ── 🆕 v10: 价格反馈闭环状态初始化 ──
  let priceFeedbackState: PriceFeedbackState | undefined;
  const BASE_VOLATILITY = 0.02; // 2% 基础波动率

  for (let r = 1; r <= config.rounds; r++) {
    // ── 🆕 v10: 获取价格反馈信号 ──
    const priceSignal = priceFeedbackState
      ? getPriceFeedbackSignal(priceFeedbackState.price, "")
      : undefined;

    const { states, beliefStd } = computeAllAgentStates(factorVector, agents, {
      disableBlindness: config.ablation?.disableBlindness,
      previousStates,
      hysteresisFactor: 0.2,
      marketData: { rsi: config.marketData.rsi, vix: config.marketData.vix },
      disableMeanReversion: (config as any).disableMeanReversion === true,
      priceSignal,
      roundNoise: config.rounds > 1,
    });

    previousStates = states;
    beliefStdHistory.push(beliefStd);

    let consensus: number;
    let clusterRatio: number;
    let clusterK: number;
    let gateResult: GatedConsensus | null = null;

    const entries: BeliefEntry[] = agents.map(agent => ({
      agentId: agent.id,
      belief: states[agent.id]?.belief ?? 0,
      weight: agent.influenceWeight * ((states[agent.id]?.confidence ?? 50) / 100),
    }));

    // Kuramoto 序参量
    const phases = agents.map(a => beliefToPhase(states[a.id]?.belief ?? 0));
    const rRaw = computeOrderParameter(phases);
    rSmooth = rSmooth !== undefined
      ? 0.7 * rSmooth + 0.3 * rRaw
      : rRaw;

    if (rSmooth > 0.7) {
      clusterK = 2;
    } else if (rSmooth < 0.3) {
      clusterK = 3;
    } else {
      clusterK = 2;
    }

    // 计算两种共识 (始终计算线性共识用于 baseline 对比)
    const clusterResult = computeClusterConsensus(entries, clusterK);
    const clusterConsensus = clusterResult.consensus;
    clusterRatio = clusterResult.largestClusterRatio;
    const linearConsensus = computeLinearConsensus(agents, states);

    // ── 🆕 v9.7: 非线性共识 (当设置时替代 linear+cluster+gating pipeline) ──
    let nonlinearResult: NonlinearConsensusOutput | null = null;

    if (useNonlinear) {
      const nonlinearConfig: NonlinearConfig = {
        method: (config.ablation!.nonlinearMethod as NonlinearConfig["method"]) ?? "dynamic_ensemble",
        powerAlpha: (config.ablation!.nonlinearConfig as any)?.powerAlpha ?? DEFAULT_NONLINEAR_CONFIG.powerAlpha,
        trimCount: (config.ablation!.nonlinearConfig as any)?.trimCount ?? DEFAULT_NONLINEAR_CONFIG.trimCount,
        winsorLowerPct: (config.ablation!.nonlinearConfig as any)?.winsorLowerPct ?? DEFAULT_NONLINEAR_CONFIG.winsorLowerPct,
        winsorUpperPct: (config.ablation!.nonlinearConfig as any)?.winsorUpperPct ?? DEFAULT_NONLINEAR_CONFIG.winsorUpperPct,
        ensembleMethods: (config.ablation!.nonlinearConfig as any)?.ensembleMethods ?? DEFAULT_NONLINEAR_CONFIG.ensembleMethods,
      };
      nonlinearResult = computeNonlinearConsensus(
        { agents, states, kuramotoR: rRaw },
        nonlinearConfig
      );
      consensus = nonlinearResult.consensus;
      gateResult = null;  // nonlinear replaces gating entirely
      lastNonlinearResult = nonlinearResult;  // 保存供返回元数据
    } else if (useHybridGating) {
      // 非对称门控 (原有逻辑)
      gateResult = applyAsymmetricGate(clusterConsensus, linearConsensus);
      consensus = gateResult.consensus;
    } else {
      consensus = linearConsensus;
      clusterRatio = 0;
      clusterK = 0;
    }

    agentLogger.debug(`[V9] R${r} Kuramoto r=${rRaw.toFixed(2)} rSmooth=${rSmooth.toFixed(2)} → K=${clusterK} | KMeans=${clusterConsensus.toFixed(1)} Linear=${linearConsensus.toFixed(1)}${nonlinearResult ? ` ${"🔮"}Nonlinear(${nonlinearResult.method})=${nonlinearResult.consensus.toFixed(1)}` : ""}`);
    if (gateResult) {
      agentLogger.debug(`[V9] 🔀 Gate=${gateResult.method} | ${gateResult.gateReason}`);
    }

    // ── v9.3: Neutral Detection Engine ──
    const decision = makeDecision(
      consensus,
      beliefStd,
      states,
      config.ablation?.disableUncertainty,
      {
        kuramotoR: rRaw,
        uncertaintyFactor,
        // v9.3: Neutral 检测使用门控前的线性共识 + 聚类共识 (用于分歧检测)
        neutralConsensus: linearConsensus,
        clusterConsensus,
        vix: config.marketData.vix,  // 🆕 v9.5.1: 市场 VIX 用于 Rule 4 客观不确定性
        ablation: {
          disableRule1: !useNeutralR1,
          disableRule2_3: !useNeutralR2_3,
          disableRule4: !useNeutralR4,
        },
        // 🆕 v9.5.2: 可配置方向阈值 (模板=-5, LLM=15)
        directionThreshold: (config as any).directionThreshold,
      }
    );

    if (useHybridGating && clusterRatio > 0) {
      (decision as any).largestClusterRatio = clusterRatio;
    }

    roundResults.push({ round: r, factorVector, agents: states, decision });

    // 日志: 包含 Neutral 追踪
    const gateLabel = gateResult ? ` Gate=${gateResult.method}` : "";
    const trace = decision.neutralTrace;
    const neutralInfo = trace
      ? ` | Neutral=${trace.finalNeutral ? "⚠️" : "→"} R1=${trace.rule1_fired ? "✓" : "·"} R2=${trace.rule2_fired ? "✓" : "·"} R3=${trace.rule3_fired ? "✓" : "·"} R4=${trace.rule4_fired ? "✓" : "·"}`
      : "";
    agentLogger.debug(`[V9] R${r} 共识=${consensus.toFixed(1)} 方向=${decision.direction} std=${beliefStd.toFixed(1)} 置信=${decision.confidence}${gateLabel}${useHybridGating ? ` 簇=${(clusterRatio*100).toFixed(0)}%` : ""}${neutralInfo}`);

    // ── 🆕 v10: 价格反馈闭环 (仅当 enablePriceFeedback=true 时启用) ──
    if (usePriceFeedback && (r > 1 || priceFeedbackState)) {
      // 初始化价格状态（如果尚未初始化）
      const currentPriceState = priceFeedbackState?.price || {
        currentPrice: 100,
        previousPrice: 100,
        priceChange: 0,
        cumulativeReturn: 0,
        volatility: BASE_VOLATILITY,
      };

      // 初始化持仓（如果尚未初始化）
      const currentPositions = priceFeedbackState?.positions || {};

      priceFeedbackState = runPriceFeedback(agents, states, currentPriceState, currentPositions);

      // 日志价格反馈结果
      agentLogger.debug(`[V9] 💰 R${r} 价格反馈: ${currentPriceState.currentPrice.toFixed(2)} → ${priceFeedbackState.price.currentPrice.toFixed(2)} (${priceFeedbackState.price.priceChange >= 0 ? "+" : ""}${priceFeedbackState.price.priceChange.toFixed(2)}%) | 累计: ${priceFeedbackState.price.cumulativeReturn >= 0 ? "+" : ""}${priceFeedbackState.price.cumulativeReturn.toFixed(2)}%`);

      // 如果有活跃持仓，输出持仓详情
      const activePositions = Object.values(priceFeedbackState.positions).filter(p => p.position !== 0);
      if (activePositions.length > 0) {
        const posDetails = activePositions.map(p =>
          `${p.agentId}:${p.position > 0 ? "多" : "空"}${Math.abs(p.position).toFixed(1)}(${p.unrealizedPnL >= 0 ? "+" : ""}${p.unrealizedPnL.toFixed(1)}%)`
        ).join(" | ");
        agentLogger.debug(`[V9] 📊 持仓: ${posDetails}`);
      }
    }
  }

  const final = roundResults[roundResults.length - 1];

  // ── 群体行为诊断 (纯数学，毫秒级) ──
  const diagnostics = generateDiagnostics(
    agents,
    final.agents,
    final.decision.consensus,
    final.decision.direction,
    final.decision.beliefStd,
    { factors: factorVector.factors },
    !config.ablation?.disableBlindness
  );

  return {
    news: config.news,
    rounds: roundResults,
    finalDecision: final.decision,
    ablationMetrics: {
      policyAgentActive: includePolicy,
      uncertaintyActive: !config.ablation?.disableUncertainty,
      blindnessActive: !config.ablation?.disableBlindness,
      beliefStdHistory,
    },
    diagnostics,
    // 🆕 v9.7: 非线性共识元数据
    nonlinearConsensus: lastNonlinearResult ? {
      method: lastNonlinearResult.method,
      individualResults: lastNonlinearResult.metadata.details
        ? Object.entries(lastNonlinearResult.metadata.details)
            .filter(([k]) => k.endsWith("_consensus"))
            .map(([k, v]) => {
              const methodName = k.replace("_consensus", "");
              const weightKey = `${methodName}_weight`;
              return {
                method: methodName,
                consensus: v as number,
                confidence: 0,
                signalQuality: (lastNonlinearResult.metadata.details?.[weightKey] as number) ?? 0,
              };
            })
        : undefined,
      ensembleWeights: lastNonlinearResult.metadata.details
        ? Object.fromEntries(
            Object.entries(lastNonlinearResult.metadata.details)
              .filter(([k]) => k.endsWith("_weight"))
              .map(([k, v]) => [k.replace("_weight", ""), v as number])
          )
        : undefined,
    } : undefined,
    // 🆕 v10: 价格反馈闭环
    priceFeedback: usePriceFeedback ? priceFeedbackState : undefined,
  };
}
