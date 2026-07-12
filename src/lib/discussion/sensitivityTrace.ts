/**
 * Dropout-Based Sensitivity Analysis
 *
 * Core insight: traditional influence graphs only record correlation
 * ("Agent A has weight 0.8 → Agent B"), but correlation ≠ influence.
 * Agent B's belief change could be caused by A's persuasion or by B's
 * own independent reasoning.
 *
 * This module uses agent dropout to estimate how sensitive the
 * discussion outcome is to each agent's presence:
 *
 * 1. Each round, one randomly selected agent is dropped (counterfactual dropout)
 * 2. Compare other agents' beliefs "with A" vs "without A"
 * 3. Estimate the observed belief difference attributable to each agent
 * 4. Build a sensitivity graph showing which agents the outcome is
 *    most sensitive to
 *
 * IMPORTANT LIMITATIONS (not causal inference):
 * - SUTVA is violated: dropping an agent doesn't prevent others from
 *   referencing their prior statements
 * - No identification strategy: this is observational sensitivity analysis,
 *   not a formal causal identification with do-calculus
 * - Thresholds are heuristic, not statistically calibrated
 *
 * This is a sensitivity diagnostic tool, not a causal inference method.
 */

import type { AgentOpinion, InteractionGraph, InteractionEdge } from "./types";

// ============================================================================
// 类型定义
// ============================================================================

/** Single dropout observation — records target belief with/without source agent */
export interface DropoutObservation {
  round: number;
  sourceAgentId: string;
  targetAgentId: string;
  sourcePresent: boolean;
  sourceBelief: number;
  targetBelief: number;
}

/** Single dropout effect estimate for one (source, target) pair */
export interface DropoutEffect {
  /** Source agent (the one being dropped) */
  sourceAgentId: string;
  /** Target agent (the one being measured) */
  targetAgentId: string;
  /** Discussion round */
  round: number;
  /** Target's average belief when source is present */
  beliefWithSource: number;
  /** Target's average belief when source is absent (dropout condition) */
  beliefWithoutSource: number;
  /** Observed belief difference: with - without */
  observedBeliefDifference: number;
  /** Effect classification */
  effectType: "persuasion" | "suppression" | "no_effect" | "dropout_unavailable";
  /** Confidence level based on observation count */
  confidence: number;
}

/** Full sensitivity trace across all rounds */
export interface SensitivityTrace {
  /** Per-round dropout effects */
  roundEffects: Map<number, DropoutEffect[]>;
  /** Average effect per (source, target) pair */
  avgEffectMap: Map<string, number>;
  /** Sensitivity graph (only statistically notable edges) */
  sensitivityGraph: SensitivityEdge[];
  /** Proportion of inferences supported by dropout data */
  dropoutCoverage: number;
  /** Total dropout trials conducted */
  totalDropoutTrials: number;
}

export interface SensitivityEdge {
  source: string;
  target: string;
  avgEffect: number;
  effectType: "persuasion" | "suppression";
  significance: "high" | "medium" | "low";
  trials: number;
}

// ============================================================================
// Agent Dropout Mechanism
// ============================================================================

/**
 * Select one agent at random for dropout in a given round.
 *
 * The selected agent is excluded from that round's discussion. Comparing
 * other agents' beliefs "with vs without" this agent provides a
 * sensitivity estimate: how much does the outcome depend on this agent?
 *
 * Each agent has equal probability of being selected, independent across rounds.
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
// Dropout Effect Estimation
// ============================================================================

/**
 * Estimate the effect of Agent A's presence on Agent B's belief.
 *
 * Effect(A→B) = E[belief_B | A_present] - E[belief_B | A_absent]
 *
 * Positive = A's presence pulls B's belief toward A (persuasion-like)
 * Negative = A's presence pushes B's belief away from A (suppression-like)
 * Near-zero = no observable effect
 */
export function estimateDropoutEffect(
  sourceAgentId: string,
  targetAgentId: string,
  observations: Array<{
    round: number;
    sourcePresent: boolean;
    sourceBelief: number;
    targetBelief: number;
  }>,
): DropoutEffect | null {
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
        observedBeliefDifference: 0,
        effectType: "dropout_unavailable",
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
  let effectType: DropoutEffect["effectType"];
  if (absEffect < 0.05) {
    effectType = "no_effect";
  } else if ((ite > 0 && beliefGap > 0) || (ite < 0 && beliefGap < 0)) {
    // target 的信念朝 source 方向移动 → 说服
    effectType = "persuasion";
  } else {
    // target 的信念背离 source 方向 → 逆反
    effectType = "suppression";
  }

  // Confidence = observation count normalized (need ≥5 pairs for high confidence)
  const n = Math.min(withObs.length, withoutObs.length);
  const confidence = clamp(n / 5, 0.2, 1.0);

  return {
    sourceAgentId, targetAgentId,
    round: withObs[0].round,
    beliefWithSource: avgWith,
    beliefWithoutSource: avgWithout,
    observedBeliefDifference: Math.round(ite * 1000) / 1000,
    effectType,
    confidence: Math.round(confidence * 100) / 100,
  };
}

// ============================================================================
// Sensitivity Graph Construction
// ============================================================================

/**
 * Build a sensitivity graph from multi-round dropout observations.
 *
 * Unlike correlation-based influence graphs, the sensitivity graph only
 * retains edges supported by dropout data, and labels each edge with
 * its observed effect size and significance.
 */
export function buildSensitivityGraph(
  allEffects: DropoutEffect[],
  significanceThreshold: number = 0.05,
): SensitivityGraph {
  // Aggregate by (source, target) pairs
  const pairMap = new Map<string, DropoutEffect[]>();
  for (const effect of allEffects) {
    const key = `${effect.sourceAgentId}→${effect.targetAgentId}`;
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key)!.push(effect);
  }

  const edges: SensitivityEdge[] = [];
  const avgEffectMap = new Map<string, number>();

  Array.from(pairMap.entries()).forEach(([key, effects]) => {
    const [source, target] = key.split("→");
    const validEffects = effects.filter((e: DropoutEffect) => e.effectType !== "dropout_unavailable");
    if (validEffects.length === 0) return;

    const avgEffect = validEffects.reduce((s: number, e: DropoutEffect) => s + e.observedBeliefDifference, 0) / validEffects.length;
    const absAvg = Math.abs(avgEffect);

    let significance: SensitivityEdge["significance"];
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

    avgEffectMap.set(key, Math.round(avgEffect * 1000) / 1000);
  });

  // Coverage: proportion of edges supported by dropout data
  const totalEffects = allEffects.length;
  const dropoutEffects = allEffects.filter(
    e => e.effectType !== "dropout_unavailable"
  ).length;

  return {
    edges,
    avgEffectMap,
    dropoutCoverage: totalEffects > 0
      ? Math.round((dropoutEffects / totalEffects) * 100) / 100
      : 0,
    totalDropoutTrials: dropoutEffects,
  };
}

// ============================================================================
// Sensitivity Query API
// ============================================================================

/**
 * "Which agents most influenced Agent X's belief changes?"
 *
 * Returns agents with significant observed effects on X (sorted by effect size),
 * only including edges supported by dropout evidence.
 */
export function answerWhatInfluencedChange(
  targetAgentId: string,
  sensitivityGraph: SensitivityGraph,
): SensitivityEdge[] {
  return sensitivityGraph.edges
    .filter(e => e.target === targetAgentId && e.significance !== "low")
    .sort((a, b) => Math.abs(b.avgEffect) - Math.abs(a.avgEffect));
}

/**
 * "How much of Agent X's belief change comes from independent reasoning
 *  vs social influence?"
 *
 * independentReasoning = 1 - (sum of observed dropout effects on X) / (total belief change of X)
 * → 1 = mostly independent thought
 * → 0 = mostly influenced by others
 */
export function decomposeBeliefChange(
  targetAgentId: string,
  totalBeliefChange: number,
  sensitivityGraph: SensitivityGraph,
): { independentReasoning: number; socialInfluence: number } {
  const effectsOnTarget = sensitivityGraph.edges.filter(e => e.target === targetAgentId);
  const totalDropoutEffect = effectsOnTarget.reduce((s, e) => s + Math.abs(e.avgEffect), 0);

  if (totalBeliefChange === 0) {
    return { independentReasoning: 1, socialInfluence: 0 };
  }

  const socialInfluence = clamp(totalDropoutEffect / Math.abs(totalBeliefChange), 0, 1);
  return {
    independentReasoning: Math.round((1 - socialInfluence) * 100) / 100,
    socialInfluence: Math.round(socialInfluence * 100) / 100,
  };
}

// ============================================================================
// Aggregate Types
// ============================================================================

export interface SensitivityGraph {
  edges: SensitivityEdge[];
  avgEffectMap: Map<string, number>;
  dropoutCoverage: number;
  totalDropoutTrials: number;
}

// ============================================================================
// Backward-compatible aliases (deprecated — remove in v3.0)
// ============================================================================

/** @deprecated Use {@link DropoutObservation}. Removed in v3.0. */
export type CausalObservation = DropoutObservation;
/** @deprecated Use {@link DropoutEffect}. Removed in v3.0. */
export type CausalEffect = DropoutEffect;
/** @deprecated Use {@link SensitivityTrace}. Removed in v3.0. */
export type CausalTrace = SensitivityTrace;
/** @deprecated Use {@link SensitivityEdge}. Removed in v3.0. */
export type CausalEdge = SensitivityEdge;
/** @deprecated Use {@link SensitivityGraph}. Removed in v3.0. */
export type CausalGraph = SensitivityGraph;
/** @deprecated Use {@link estimateDropoutEffect}. Removed in v3.0. */
export const estimateCausalEffect = estimateDropoutEffect;
/** @deprecated Use {@link buildSensitivityGraph}. Removed in v3.0. */
export const buildCausalGraph = buildSensitivityGraph;
/** @deprecated Use {@link answerWhatInfluencedChange}. Removed in v3.0. */
export const answerWhoCausedChange = answerWhatInfluencedChange;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
