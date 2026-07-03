/**
 * 自适应剂量治理 — 干预强度根据偏差严重度和上下文动态调整
 *
 * 核心理念: 固定干预强度 (如 "削减权重 50%") 忽视了每个偏差的
 * 严重度和背景。自适应剂量像医生开药——根据病情轻重调整药量。
 *
 * 三个输入维度:
 * 1. Deviation severity  — 偏差有多严重 (0=无, 1=最严重)
 * 2. Information coverage — 独有信息被利用了多少 (0=没用, 1=全覆盖)
 * 3. History effectiveness — 之前的同类型干预效果如何 (-1=恶化, 1=改善)
 *
 * 输出: 每种干预的动态强度参数
 */

import { clamp } from "./adaptiveThresholds";

// ============================================================================
// 类型
// ============================================================================

export interface DosageContext {
  /** 偏差严重度 [0,1] — 来自 getSeverity() 的归一化 */
  severity: number;
  /** 信息利用度 [0,1] — 来自 Hidden Profile 实验 */
  informationCoverage: number;
  /** 历史干预效果 [-1,1] — 上次同类干预的效果 (1=很好, -1=恶化) */
  historyEffectiveness: number;
  /** 当前轮次进度 [0,1] = currentRound / maxRounds */
  roundProgress: number;
  /** Agent 数量 */
  agentCount: number;
}

export interface AdaptiveDosage {
  /** 追加讨论轮数 (continue_discussion) */
  additionalRounds: number;
  /** 权重削减比例 [0,1] (reduce_weight) */
  weightReduction: number;
  /** 反思强度 [0,1] (force_reflection) */
  reflectionStrength: number;
  /** 多样性扰动幅度 [0,1] (introduce_diversity) */
  perturbationAmount: number;
}

// ============================================================================
// 剂量计算
// ============================================================================

/**
 * 继续讨论 — 追加轮数
 *
 * 公式:
 *   ΔT = ⌈T_max × (θ - ρ_t) × (1 - η) × (1 + max(0, -history))⌉
 *
 * - 共识越早 (ρ_t 越小): 追加越多
 * - 信息利用度越低 (η 越低): 追加越多 — 说明还需要更多讨论
 * - 如果上次干预效果差 (history < 0): 额外加量
 */
function dosageContinueDiscussion(ctx: DosageContext, baseMaxRounds: number): number {
  const roundGap = Math.max(0, 0.5 - ctx.roundProgress);  // 与阈值 0.5 的差距
  const infoGap = 1 - ctx.informationCoverage;              // 还未利用的信息
  const historyBoost = 1 + Math.max(0, -ctx.historyEffectiveness) * 0.5;

  const base = baseMaxRounds * roundGap * infoGap * historyBoost;
  // 至少 1 轮, 最多 baseMaxRounds / 2 + 1
  return clamp(Math.ceil(base), 1, Math.ceil(baseMaxRounds / 2) + 1);
}

/**
 * 权重削减 — 削减比例
 *
 * 公式:
 *   reduction = 0.3 + severity × 0.4 × (2 - informationCoverage) × (1 - historyEffectiveness/2)
 *
 * - severity 越高: 削减越多
 * - 信息利用度越低: 削减越多 (暗示被主导者压抑了信息共享)
 * - 历史效果越差: 削减越多 (上次没效, 这次加量)
 *
 * 输出区间: [0.2, 0.8]
 */
function dosageReduceWeight(ctx: DosageContext): number {
  const base = 0.3;
  const severityFactor = ctx.severity * 0.4;
  const infoFactor = 2 - ctx.informationCoverage;  // η 低 → 因子高
  const historyFactor = 1 - ctx.historyEffectiveness * 0.5;

  return clamp(base + severityFactor * infoFactor * historyFactor, 0.2, 0.8);
}

/**
 * 强制反思 — 反思强度
 *
 * 公式:
 *   strength = 0.15 + severity × 0.35 × polarization_boost × (1 - consensus) × history_factor
 *
 * - severity 越高: 反思越深
 * - 共识越低 (1-consensus 越高): 反思越强 — 分歧大时需要更强的反思
 * - 历史效果越好: 保持当前强度
 *
 * 输出区间: [0.1, 0.6]
 */
function dosageForceReflection(ctx: DosageContext): number {
  const base = 0.15;
  const severityFactor = ctx.severity * 0.35;
  const consensusGap = 1 - ctx.informationCoverage;  // proxy for consensus
  const historyFactor = 1 + ctx.historyEffectiveness * 0.3;

  return clamp(base + severityFactor * consensusGap * historyFactor, 0.1, 0.6);
}

/**
 * 引入多样性 — 扰动幅度
 *
 * 公式:
 *   perturbation = 0.15 + severity × 0.25 × (1 - informationCoverage)
 *
 * - severity 越高: 扰动越大
 * - 信息覆盖度越低: 扰动越大 — 需要引入更多外部信息
 *
 * 输出区间: [0.1, 0.5]
 */
function dosageIntroduceDiversity(ctx: DosageContext): number {
  const base = 0.15;
  const severityFactor = ctx.severity * 0.25;
  const infoGap = 1 - ctx.informationCoverage;

  return clamp(base + severityFactor * infoGap, 0.1, 0.5);
}

// ============================================================================
// 主入口
// ============================================================================

/**
 * 根据治理诊断上下文计算自适应干预剂量。
 *
 * @param severity 偏差严重度 (0-1, 来自 getSeverity 归一化)
 * @param informationCoverage 信息利用度 (0-1, 可选, 默认 0.5)
 * @param historyEffectiveness 历史干预效果 (-1 到 1, 可选, 默认 0)
 * @param roundProgress 当前轮次进度 (0-1)
 * @param agentCount Agent 数量
 * @param baseMaxRounds 基准最大轮数 (用于 continue_discussion)
 */
export function computeAdaptiveDosage(params: {
  severity: number;
  informationCoverage?: number;
  historyEffectiveness?: number;
  roundProgress: number;
  agentCount: number;
  baseMaxRounds?: number;
}): AdaptiveDosage {
  const ctx: DosageContext = {
    severity: clamp(params.severity, 0, 1),
    informationCoverage: clamp(params.informationCoverage ?? 0.5, 0, 1),
    historyEffectiveness: clamp(params.historyEffectiveness ?? 0, -1, 1),
    roundProgress: clamp(params.roundProgress, 0, 1),
    agentCount: params.agentCount,
  };

  const maxRounds = params.baseMaxRounds || 5;

  return {
    additionalRounds: dosageContinueDiscussion(ctx, maxRounds),
    weightReduction: Math.round(dosageReduceWeight(ctx) * 100) / 100,
    reflectionStrength: Math.round(dosageForceReflection(ctx) * 100) / 100,
    perturbationAmount: Math.round(dosageIntroduceDiversity(ctx) * 100) / 100,
  };
}

/**
 * 从治理严重度字符串创建 DosageContext。
 *
 * 严重度映射: high → 0.85, medium → 0.55, low → 0.25
 */
export function severityToNumber(level: string): number {
  switch (level) {
    case "high": return 0.85;
    case "medium": return 0.55;
    case "low": return 0.25;
    default: return 0.5;
  }
}

/**
 * 从干预效果指标计算历史有效性。
 *
 * 指标来源: evaluateEffects() 返回的 Record<string, number>
 * - belief_diversity_change > 0 → 正面 (减少了共识/强制了多样性)
 * - belief_mean_change 的绝对值 → 干预是否产生了实质变化
 */
export function computeHistoryEffectiveness(
  previousEffects: Record<string, number>,
): number {
  const diversityChange = previousEffects["belief_diversity_change"] || 0;
  const meanChange = Math.abs(previousEffects["belief_mean_change"] || 0);
  const successRate = previousEffects["successful_interventions"] || 0;

  // 多样性增加 + 有实质变化 + 有成功案例 → 正面
  const raw = diversityChange * 0.4 + meanChange * 0.3 + Math.min(successRate, 1) * 0.3;
  return clamp(raw, -1, 1);
}
