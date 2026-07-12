/**
 * 共享影响力计算工具
 *
 * 解决 discussion/influence.ts 与 inference/index.ts 中
 * 四个影响力公式完全重复的问题 (~40 行)。
 */

import type { AgentOpinion, InfluenceType } from "../discussion/types";
import {
  INFLUENCE_AGREEMENT_COEFF,
  INFLUENCE_DISAGREEMENT_COEFF,
  INFLUENCE_REFERENCE_COEFF,
  INFLUENCE_PERSUASION_COEFF,
  INFLUENCE_REASONING_MAX_LENGTH,
  INFLUENCE_CONFIDENCE_NORM_FACTOR,
  INFLUENCE_DISAGREEMENT_BELIEF_THRESHOLD,
  INFLUENCE_PERSUASION_CONFIDENCE_GAP,
  INFLUENCE_IMPACT_AGREEMENT_BELIEF_COEFF,
  INFLUENCE_IMPACT_AGREEMENT_CONFIDENCE_COEFF,
  INFLUENCE_IMPACT_DISAGREEMENT_BELIEF_COEFF,
  INFLUENCE_IMPACT_DISAGREEMENT_CONFIDENCE_COEFF,
  INFLUENCE_IMPACT_REFERENCE_BELIEF_COEFF,
  INFLUENCE_IMPACT_REFERENCE_CONFIDENCE_COEFF,
  INFLUENCE_IMPACT_PERSUASION_BELIEF_COEFF,
  INFLUENCE_IMPACT_PERSUASION_CONFIDENCE_COEFF,
} from "../constants";

/**
 * 根据意见相似度和差异确定影响力类型
 *
 * 优先使用显式引用（reference），没有引用时才回退到数值推断。
 * 原因：数值差推断的是虚假影响力——belief 接近 ≠ 同意，confidence 高 ≠ 说服。
 * 显式引用是 agent 主动表达的认知关联，可信度高于数值巧合。
 */
export function determineInfluenceType(
  source: AgentOpinion,
  target: AgentOpinion
): InfluenceType {
  // 优先：显式引用是真实认知关联
  if (target.referencedAgents.includes(source.agentId)) {
    return "reference";
  }
  // 回退：无显式引用时用数值推断（保留 belief 更新连续性，避免破坏过大）
  if (Math.abs(source.belief - target.belief) > INFLUENCE_DISAGREEMENT_BELIEF_THRESHOLD) {
    return "disagreement";
  }
  if (source.confidence > target.confidence + INFLUENCE_PERSUASION_CONFIDENCE_GAP) {
    return "persuasion";
  }
  return "agreement";
}

/**
 * 共享的四类型影响力权重计算公式
 *
 * 之前 discussion/influence.ts 和 inference/index.ts 各有一套独立但
 * 完全相同的公式实现，修改一处容易遗漏另一处。
 */
export function computeInfluenceWeight(
  type: InfluenceType,
  source: AgentOpinion,
  target: AgentOpinion
): number {
  switch (type) {
    case "agreement": {
      const beliefSimilarity = 1 - Math.abs(source.belief - target.belief);
      const confidenceBonus = source.confidence / INFLUENCE_CONFIDENCE_NORM_FACTOR;
      return beliefSimilarity * confidenceBonus * INFLUENCE_AGREEMENT_COEFF;
    }
    case "disagreement": {
      const beliefDiff = Math.abs(source.belief - target.belief);
      const confidenceBonus = source.confidence / INFLUENCE_CONFIDENCE_NORM_FACTOR;
      return beliefDiff * confidenceBonus * INFLUENCE_DISAGREEMENT_COEFF;
    }
    case "reference": {
      const sourceConfidence = source.confidence / INFLUENCE_CONFIDENCE_NORM_FACTOR;
      const reasoningQuality = Math.min(1, source.reasoning.length / INFLUENCE_REASONING_MAX_LENGTH);
      return sourceConfidence * reasoningQuality * INFLUENCE_REFERENCE_COEFF;
    }
    case "persuasion": {
      const confidenceDiff = (source.confidence - target.confidence) / INFLUENCE_CONFIDENCE_NORM_FACTOR;
      const beliefDiff = Math.abs(source.belief - target.belief);
      return Math.max(0, confidenceDiff) * (1 - beliefDiff) * INFLUENCE_PERSUASION_COEFF;
    }
    default:
      return 0;
  }
}

/**
 * 共享的四类型影响力冲击计算（对信念和信心的影响）
 */
export function computeInfluenceImpact(
  type: InfluenceType,
  weight: number,
  source: AgentOpinion,
  target: AgentOpinion
): { beliefChange: number; confidenceChange: number } {
  const beliefDiff = source.belief - target.belief;

  switch (type) {
    case "agreement":
      return {
        beliefChange: beliefDiff * weight * INFLUENCE_IMPACT_AGREEMENT_BELIEF_COEFF,
        confidenceChange: weight * INFLUENCE_IMPACT_AGREEMENT_CONFIDENCE_COEFF,
      };
    case "disagreement":
      return {
        beliefChange: beliefDiff * weight * INFLUENCE_IMPACT_DISAGREEMENT_BELIEF_COEFF,
        confidenceChange: -weight * INFLUENCE_IMPACT_DISAGREEMENT_CONFIDENCE_COEFF,
      };
    case "reference":
      return {
        beliefChange: beliefDiff * weight * INFLUENCE_IMPACT_REFERENCE_BELIEF_COEFF,
        confidenceChange: weight * INFLUENCE_IMPACT_REFERENCE_CONFIDENCE_COEFF,
      };
    case "persuasion":
      return {
        beliefChange: beliefDiff * weight * INFLUENCE_IMPACT_PERSUASION_BELIEF_COEFF,
        confidenceChange: weight * INFLUENCE_IMPACT_PERSUASION_CONFIDENCE_COEFF,
      };
    default:
      return { beliefChange: 0, confidenceChange: 0 };
  }
}
