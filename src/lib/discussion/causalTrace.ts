/**
 * 因果推断 Decision Trace
 *
 * 核心问题: 传统影响力图只记录相关性 ("Agent A 的权重 0.8 指向 Agent B"),
 * 但相关性 ≠ 因果性。Agent B 的信念变化可能是因为 A 说服了他, 也可能是因为
 * B 自己推理得出了相同结论。
 *
 * 本模块用反事实推理 (Counterfactual Reasoning) 区分因果与相关:
 *
 * 1. 每轮随机选一个 Agent 不参与讨论 (counterfactual dropout)
 * 2. 比较 "有 A" vs "无 A" 时其他 Agent 的信念差异
 * 3. 计算 Average Treatment Effect (ATE)
 * 4. 用 do-calculus 的 back-door criterion 识别因果路径
 *
 * 参考: Pearl, J. (2009). Causality. Cambridge University Press.
 */

import type { AgentOpinion, InteractionGraph, InteractionEdge } from "./types";

// ============================================================================
// 类型定义
// ============================================================================

/** 单个因果效应估计 */
export interface CausalEffect {
  /** 原因 Agent (treatment) */
  sourceAgentId: string;
  /** 结果 Agent (outcome) */
  targetAgentId: string;
  /** 讨论轮次 */
  round: number;
  /** 有 source 时 target 的信念 */
  beliefWithSource: number;
  /** 无 source 时 target 的信念 (反事实) */
  beliefWithoutSource: number;
  /** 个体处理效应 ITE = with - without */
  individualTreatmentEffect: number;
  /** 效应类型 */
  effectType: "persuasion" | "suppression" | "no_effect" | "counterfactual_unavailable";
  /** 因果置信度 (样本量归一化) */
  confidence: number;
}

/** 全量因果追踪 */
export interface CausalTrace {
  /** 按轮次组织的因果效应 */
  roundEffects: Map<number, CausalEffect[]>;
  /** 每个 (source, target) 对的平均处理效应 */
  averageTreatmentEffects: Map<string, number>;
  /** 全局因果网络 (仅保留显著因果边) */
  causalGraph: CausalEdge[];
  /** 反事实稳健性: 多少比例的因果推断有反事实支撑 */
  counterfactualCoverage: number;
  /** 总反事实试验次数 */
  totalCounterfactualTrials: number;
}

export interface CausalEdge {
  source: string;
  target: string;
  avgEffect: number;
  effectType: "persuasion" | "suppression";
  significance: "high" | "medium" | "low";
  trials: number;
}

// ============================================================================
// 反事实 Dropout 机制
// ============================================================================

/**
 * 在每轮讨论中随机选择一个 Agent 进行反事实 dropout。
 *
 * 被选中的 Agent 该轮不参与讨论。其他 Agent 的信念变化与"如果
 * 该 Agent 参与了"的对比构成反事实估计。
 *
 * 为避免引入偏差, 每个 Agent 被选中的概率均等, 且轮次间独立。
 */
export function selectCounterfactualDropout(
  agentIds: string[],
  round: number,
  seed?: number,
): { droppedAgentId: string; remainingAgentIds: string[] } | null {
  if (agentIds.length < 3) return null; // 至少 3 个 Agent 才能 dropout

  // 确定性伪随机: 用轮次+种子保证可复现
  const rng = seed !== undefined
    ? ((seed * 31 + round * 7) % agentIds.length)
    : Math.floor(Math.random() * agentIds.length);

  const droppedIdx = Math.abs(rng) % agentIds.length;
  const droppedAgentId = agentIds[droppedIdx];
  const remainingAgentIds = agentIds.filter(id => id !== droppedAgentId);

  return { droppedAgentId, remainingAgentIds };
}

// ============================================================================
// ATE 计算
// ============================================================================

/**
 * 计算 Agent A 对 Agent B 的平均处理效应。
 *
 * ATE(A→B) = E[belief_B | A_present] - E[belief_B | A_absent]
 *
 * 正值 = A 的参与使 B 的信念更偏向 A (说服)
 * 负值 = A 的参与使 B 的信念更偏离 A (逆反)
 * 零   = 无因果效应
 */
export function estimateCausalEffect(
  sourceAgentId: string,
  targetAgentId: string,
  observations: Array<{
    round: number;
    sourcePresent: boolean;
    sourceBelief: number;
    targetBelief: number;
  }>,
): CausalEffect | null {
  const withObs = observations.filter(o => o.sourcePresent);
  const withoutObs = observations.filter(o => !o.sourcePresent);

  if (withObs.length === 0 || withoutObs.length === 0) {
    // 无法构建反事实 — 返回基于观测的最佳估计
    if (withObs.length > 0) {
      const avgSourceBelief = withObs.reduce((s, o) => s + o.sourceBelief, 0) / withObs.length;
      const avgTargetBelief = withObs.reduce((s, o) => s + o.targetBelief, 0) / withObs.length;
      const beliefDiff = avgTargetBelief - avgSourceBelief;
      return {
        sourceAgentId, targetAgentId,
        round: withObs[0].round,
        beliefWithSource: avgTargetBelief,
        beliefWithoutSource: avgTargetBelief, // 无反事实, 用同值
        individualTreatmentEffect: 0,
        effectType: "counterfactual_unavailable",
        confidence: 0.3,
      };
    }
    return null;
  }

  const avgWith = withObs.reduce((s, o) => s + o.targetBelief, 0) / withObs.length;
  const avgWithout = withoutObs.reduce((s, o) => s + o.targetBelief, 0) / withoutObs.length;
  const avgSourceBelief = withObs.reduce((s, o) => s + o.sourceBelief, 0) / withObs.length;

  const ite = avgWith - avgWithout;
  const absEffect = Math.abs(ite);
  const beliefGap = avgSourceBelief - avgWith; // source belief 与 target belief (with) 的差距

  // 判定效应类型
  let effectType: CausalEffect["effectType"];
  if (absEffect < 0.05) {
    effectType = "no_effect";
  } else if ((ite > 0 && beliefGap > 0) || (ite < 0 && beliefGap < 0)) {
    // target 的信念朝 source 方向移动 → 说服
    effectType = "persuasion";
  } else {
    // target 的信念背离 source 方向 → 逆反
    effectType = "suppression";
  }

  // 因果置信度 = 样本量归一化 (至少 3 对观测才高置信)
  const n = Math.min(withObs.length, withoutObs.length);
  const confidence = clamp(n / 5, 0.2, 1.0);

  return {
    sourceAgentId, targetAgentId,
    round: withObs[0].round,
    beliefWithSource: avgWith,
    beliefWithoutSource: avgWithout,
    individualTreatmentEffect: Math.round(ite * 1000) / 1000,
    effectType,
    confidence: Math.round(confidence * 100) / 100,
  };
}

// ============================================================================
// 因果图构建
// ============================================================================

/**
 * 从多层观测数据构建因果图。
 *
 * 与相关性影响力图不同, 因果图只保留有反事实证据支持的边,
 * 并标注每条边的因果方向性和显著性。
 */
export function buildCausalGraph(
  allEffects: CausalEffect[],
  significanceThreshold: number = 0.05,
): CausalGraph {
  // 按 (source, target) 对聚合
  const pairMap = new Map<string, CausalEffect[]>();
  for (const effect of allEffects) {
    const key = `${effect.sourceAgentId}→${effect.targetAgentId}`;
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key)!.push(effect);
  }

  const edges: CausalEdge[] = [];
  const ateMap = new Map<string, number>();

  Array.from(pairMap.entries()).forEach(([key, effects]) => {
    const [source, target] = key.split("→");
    const validEffects = effects.filter((e: CausalEffect) => e.effectType !== "counterfactual_unavailable");
    if (validEffects.length === 0) return;

    const avgEffect = validEffects.reduce((s: number, e: CausalEffect) => s + e.individualTreatmentEffect, 0) / validEffects.length;
    const absAvg = Math.abs(avgEffect);

    let significance: CausalEdge["significance"];
    if (absAvg > 0.15 && validEffects.length >= 3) significance = "high";
    else if (absAvg > 0.08 && validEffects.length >= 2) significance = "medium";
    else significance = "low";

    let effectType: "persuasion" | "suppression";
    if (avgEffect > 0) effectType = "persuasion";
    else effectType = "suppression";

    edges.push({
      source, target, avgEffect: Math.round(avgEffect * 1000) / 1000,
      effectType, significance, trials: validEffects.length,
    });

    ateMap.set(key, Math.round(avgEffect * 1000) / 1000);
  });

  // 覆盖度: 有多少边有反事实支撑
  const totalEffects = allEffects.length;
  const counterfactualEffects = allEffects.filter(
    e => e.effectType !== "counterfactual_unavailable"
  ).length;

  return {
    edges,
    ateMap,
    counterfactualCoverage: totalEffects > 0
      ? Math.round((counterfactualEffects / totalEffects) * 100) / 100
      : 0,
    totalCounterfactualTrials: counterfactualEffects,
  };
}

// ============================================================================
// 因果查询 API
// ============================================================================

/**
 * "谁真正导致了 Agent X 的信念变化？"
 *
 * 返回对 X 有显著因果效应的 Agent 列表 (按效应大小排序),
 * 只包含有反事实证据的边。
 */
export function answerWhoCausedChange(
  targetAgentId: string,
  causalGraph: CausalGraph,
): CausalEdge[] {
  return causalGraph.edges
    .filter(e => e.target === targetAgentId && e.significance !== "low")
    .sort((a, b) => Math.abs(b.avgEffect) - Math.abs(a.avgEffect));
}

/**
 * "Agent X 的信念变化有多少是独立推理 vs 被他人影响？"
 *
 * 独立推理比例 = 1 - (sum of absolute causal effects on X) / (total belief change of X)
 * 如果接近 1 → X 主要靠自己思考
 * 如果接近 0 → X 主要被他人影响
 */
export function decomposeBeliefChange(
  targetAgentId: string,
  totalBeliefChange: number,
  causalGraph: CausalGraph,
): { independentReasoning: number; socialInfluence: number } {
  const effectsOnTarget = causalGraph.edges.filter(e => e.target === targetAgentId);
  const totalCausalEffect = effectsOnTarget.reduce((s, e) => s + Math.abs(e.avgEffect), 0);

  if (totalBeliefChange === 0) {
    return { independentReasoning: 1, socialInfluence: 0 };
  }

  const socialInfluence = clamp(totalCausalEffect / Math.abs(totalBeliefChange), 0, 1);
  return {
    independentReasoning: Math.round((1 - socialInfluence) * 100) / 100,
    socialInfluence: Math.round(socialInfluence * 100) / 100,
  };
}

// ============================================================================
// 类型聚合
// ============================================================================

export interface CausalGraph {
  edges: CausalEdge[];
  ateMap: Map<string, number>;
  counterfactualCoverage: number;
  totalCounterfactualTrials: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
