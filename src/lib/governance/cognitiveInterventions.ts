/**
 * Phase 4B: Cognitive State Driven Interventions
 *
 * 认知干预策略（v2.1 — 非破坏性干预重构）：
 *   - inject_evidence (NEW): 向讨论注入被忽略的私有证据，不改变权重
 *   - rebalance_attention (NEW): 调整发言优先级，让被忽视的 agent 先发言
 *   - shuffle_knowledge (NEW): 触发知识重排（结构性干预，最有效）
 *   - reduce_weight (DEPRECATED): 降低权重 → 压制关键信息，级联误伤
 *   - force_reflection (DEPRECATED): 降低惯性 → 对立场固化 agent 反向强化
 *   - introduce_diversity (DEPRECATED): 引导证据多样性 → 效果微弱
 *
 * 设计原则（v2.1）：
 * - 干预应改变信息流向，而非信念权重
 * - 不压制任何 agent，只增加信息或调整发言顺序
 * - 所有干预通过 CognitiveStateModification 传递，在下一轮生效
 */

import type {
  CognitiveGovernanceState,
  CognitiveStateModification,
  GovernanceIssue,
  GovernanceConfig,
  Intervention,
} from "./types";
import type { ProgressiveEstimates } from "../thermodynamics/ProgressiveEstimator";

// ============================================================================
// Intervention 4: Inject Evidence (NEW v2.1)
// ============================================================================

/**
 * 向讨论注入被忽略的私有证据。
 *
 * 机制：不修改任何 agent 的权重或惯性。仅将目标 agent 的私有知识
 * 作为 governance prompt 注入到讨论中，让所有 agent 都能看到被忽略的信息。
 *
 * 这需要 DiscussionEngine 或 NativeCognitiveEngine 提供 agentKnowledge。
 * 如果没有 agentKnowledge，则降级为 evidenceGuidance（仅提示关注证据）。
 *
 * 设计原则：增加信息，不压制任何人。
 */
export function applyInjectEvidence(
  targetAgentIds: string[],
  _cognitiveStates: Map<string, CognitiveGovernanceState>,
  /** 每个 agent 的私有知识（可选，来自 agentKnowledge） */
  agentKnowledge?: Map<string, string[]>,
): Map<string, CognitiveStateModification> {
  const modifications = new Map<string, CognitiveStateModification>();

  // 修复（2026-08-03）：inject_evidence 的目标是"打破信息壁垒，让所有 agent
  // 看到被忽略的私有证据"——但旧实现把 holder 的知识写回 holder 本人
  // （modifications.set(agentId, ...) → governancePrompts.get(agentId)），
  // 其他 agent 永远看不到，信息壁垒未被打破，违背论文设计哲学。
  // 修复：把目标 agent 的私有知识写为全局 prompt（key="*"），所有 agent
  // 在 buildPrompt 中都能看到（index.ts:742-744 读取 "*"）。
  const injectedEvidence: string[] = [];
  for (const agentId of targetAgentIds) {
    const knowledge = agentKnowledge?.get(agentId);
    if (knowledge && knowledge.length > 0) {
      injectedEvidence.push(...knowledge.slice(0, 3));
    }
  }

  if (injectedEvidence.length > 0) {
    modifications.set("*", {
      injectPrompt: `[信息注入] 以下是讨论中被忽略的关键信息，请所有成员纳入判断：${injectedEvidence.join("；")}`,
    });
    // 同时给目标 agent 补充 evidenceGuidance（他们本人已知知识，但需关注多维度）
    for (const agentId of targetAgentIds) {
      modifications.set(agentId, {
        evidenceGuidance: ["evidence_coverage", "evidence_diversity", "alternative_perspectives"],
      });
    }
  } else {
    // 无私有知识：降级为 evidenceGuidance（针对目标 agent）
    for (const agentId of targetAgentIds) {
      modifications.set(agentId, {
        evidenceGuidance: ["evidence_coverage", "evidence_diversity", "alternative_perspectives"],
      });
    }
  }

  return modifications;
}

// ============================================================================
// Intervention 5: Rebalance Attention (NEW v2.1)
// ============================================================================

/**
 * 调整发言优先级，让被忽视的 agent 先发言。
 *
 * 机制：通过 speakingPriority 字段标记 agent 的发言优先级。
 * - 对 dominant agent（被检测到的权威/极化方）：设置 lowerSpeakingPriority = true
 * - 对 marginalized agent（被忽视的）：设置 higherSpeakingPriority = true
 * - 不修改任何权重或惯性
 *
 * 在 buildPrompt 中，speakingPriority 会被 engine 用于调整发言顺序。
 * 如果 engine 不支持 speaking priority，则降级为 evidenceGuidance。
 *
 * 设计原则：调整发言顺序，不压制任何人。
 */
export function applyRebalanceAttention(
  dominantAgentIds: string[],
  marginalizedAgentIds: string[],
): Map<string, CognitiveStateModification> {
  const modifications = new Map<string, CognitiveStateModification>();

  for (const agentId of dominantAgentIds) {
    modifications.set(agentId, {
      lowerSpeakingPriority: true,
    });
  }

  for (const agentId of marginalizedAgentIds) {
    const existing = modifications.get(agentId);
    if (existing) {
      existing.higherSpeakingPriority = true;
    } else {
      modifications.set(agentId, {
        higherSpeakingPriority: true,
      });
    }
  }

  return modifications;
}

// ============================================================================
// Intervention 6: Shuffle Knowledge (NEW v2.1)
// ============================================================================

/**
 * 触发知识重排——将 agent 的私有知识轮转。
 *
 * 这是最有效的结构性干预（shuffle d=1.44 vs governance d=0.92）。
 * 机制：通过 shuffleKnowledge 标记通知 engine 在下一轮重排知识分配。
 * 实际的知识重排由 engine 在执行时处理。
 *
 * 设计原则：改变信息分布，而非压制任何人。
 */
export function applyShuffleKnowledge(
  _cognitiveStates: Map<string, CognitiveGovernanceState>,
): Map<string, CognitiveStateModification> {
  const modifications = new Map<string, CognitiveStateModification>();
  // 标记 shuffle 请求——engine 在 buildPrompt 中检测此标记并执行知识轮转
  modifications.set("__governance__", {
    shuffleKnowledge: true,
  });
  return modifications;
}

/**
 * 从认知检测结果生成干预。
 *
 * 映射规则（v2.1 — 非破坏性干预）：
 *   - echo_chamber → rebalance_attention（让被忽视 agent 发言，非降低惯性）
 *   - polarization → inject_evidence（注入被忽略证据，非降低权重）
 *   - premature_consensus → inject_evidence（注入多方证据，非引导多样性）
 *   - authority_bias → rebalance_attention（调整发言顺序，非降低权重）
 *   - evidence_imbalance → inject_evidence（注入证据贫乏 agent 私有信息）
 *   - cognitive_action_mismatch → rebalance_attention（调整发言顺序）
 */
export function generateCognitiveInterventions(
  issues: GovernanceIssue[],
  cognitiveStates: Map<string, CognitiveGovernanceState>,
  config?: GovernanceConfig,
  /** 可选：agent 私有知识，用于 inject_evidence */
  agentKnowledge?: Map<string, string[]>,
  /** v6：渐进估计结果，用于置信度感知的干预降级 */
  progressiveEstimates?: Map<string, ProgressiveEstimates>,
): {
  interventions: Intervention[];
  cognitiveModifications: Map<string, CognitiveStateModification>;
} {
  const interventions: Intervention[] = [];
  const allModifications = new Map<string, CognitiveStateModification>();

  // 禁用的干预类型（默认禁用旧系统的破坏性干预）
  const disabledTypes = new Set(config?.disabledInterventions ?? [
    "reduce_weight", "force_reflection", "introduce_diversity", "continue_discussion",
  ]);

  /** 置信度阈值：低于此值时降级更具针对性的干预 */
  const CONFIDENCE_THRESHOLD = 0.30;

  for (const issue of issues) {
    const suggestedType = issue.suggestedIntervention?.type;
    if (!suggestedType || suggestedType === "none") continue;
    if (disabledTypes.has(suggestedType)) continue;

    switch (issue.type) {
      case "echo_chamber_cognitive": {
        // 默认：rebalance_attention
        // 降级：若 I 置信度不足 → inject_evidence
        const redundantAgents = issue.suggestedIntervention?.targetAgents ?? [];
        const allAgentIds = [...cognitiveStates.keys()];
        const marginalizedAgents = allAgentIds.filter(id => !redundantAgents.includes(id));

        const minInertiaConf = getMinConfidence(
          progressiveEstimates, redundantAgents, "inertia",
        );

        if (minInertiaConf < CONFIDENCE_THRESHOLD) {
          // 降级：rebalance_attention → inject_evidence（对目标 agent 范围更广）
          const allTargets = [...new Set([...redundantAgents, ...marginalizedAgents])];
          const mods = applyInjectEvidence(allTargets, cognitiveStates, agentKnowledge);
          mergeModifications(allModifications, mods);
          interventions.push({
            type: "inject_evidence",
            targetAgents: allTargets.length > 0 ? allTargets : undefined,
            effect: `[degraded: I.conf=${minInertiaConf.toFixed(2)}] Inject evidence to break echo chamber`,
            applied: true,
            parameters: {
              mechanism: "inject_evidence",
              degradedFrom: "rebalance_attention",
              reason: `Inertia estimate confidence too low (${minInertiaConf.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`,
              ...issue.suggestedIntervention?.reason ? { originalReason: issue.suggestedIntervention.reason } : {},
            },
          });
        } else {
          const mods = applyRebalanceAttention(redundantAgents, marginalizedAgents);
          mergeModifications(allModifications, mods);
          interventions.push({
            type: "rebalance_attention",
            targetAgents: redundantAgents.length > 0 ? redundantAgents : undefined,
            effect: "Rebalance speaking order: surface marginalized voices to break echo chamber",
            applied: true,
            parameters: {
              mechanism: "rebalance_attention",
              dominantAgents: redundantAgents,
              marginalizedAgents,
              reason: issue.suggestedIntervention?.reason,
            },
          });
        }
        break;
      }

      case "polarization_cognitive": {
        const targetAgents = issue.suggestedIntervention?.targetAgents ?? [];
        const minConfidenceConf = getMinConfidence(
          progressiveEstimates, targetAgents, "confidence",
        );

        if (minConfidenceConf < CONFIDENCE_THRESHOLD) {
          // 降级：inject_evidence → 仅 evidenceGuidance（无针对性注入）
          const mods = new Map<string, CognitiveStateModification>();
          for (const agentId of targetAgents) {
            mods.set(agentId, {
              evidenceGuidance: ["evidence_coverage", "evidence_diversity", "alternative_perspectives"],
            });
          }
          mergeModifications(allModifications, mods);
          interventions.push({
            type: "inject_evidence",
            targetAgents: targetAgents.length > 0 ? targetAgents : undefined,
            effect: `[degraded: C.conf=${minConfidenceConf.toFixed(2)}] Evidence guidance only (no targeted injection)`,
            applied: true,
            parameters: {
              mechanism: "evidence_guidance",
              degradedFrom: "inject_evidence",
              reason: `Confidence estimate confidence too low (${minConfidenceConf.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`,
              ...issue.suggestedIntervention?.reason ? { originalReason: issue.suggestedIntervention.reason } : {},
            },
          });
        } else {
          const mods = applyInjectEvidence(targetAgents, cognitiveStates, agentKnowledge);
          mergeModifications(allModifications, mods);
          interventions.push({
            type: "inject_evidence",
            targetAgents: targetAgents.length > 0 ? targetAgents : undefined,
            effect: "Inject ignored private evidence of polarized agents to bridge opinion gap",
            applied: true,
            parameters: {
              mechanism: "inject_evidence",
              targetAgents,
              reason: issue.suggestedIntervention?.reason,
            },
          });
        }
        break;
      }

      case "premature_consensus_cognitive": {
        // 向所有 agent 注入证据多样性引导
        // 此干预影响范围广，使用 C 置信度检查
        const allIds = [...cognitiveStates.keys()];
        const minConfidenceConf = getMinConfidence(
          progressiveEstimates, allIds, "confidence",
        );

        if (minConfidenceConf < CONFIDENCE_THRESHOLD) {
          // 降级：仅 evidenceGuidance
          const mods = new Map<string, CognitiveStateModification>();
          for (const agentId of allIds) {
            mods.set(agentId, {
              evidenceGuidance: ["evidence_coverage", "evidence_diversity"],
            });
          }
          mergeModifications(allModifications, mods);
          interventions.push({
            type: "inject_evidence",
            effect: `[degraded: C.conf=${minConfidenceConf.toFixed(2)}] Evidence guidance only to prevent premature consensus`,
            applied: true,
            parameters: {
              mechanism: "evidence_guidance",
              degradedFrom: "inject_evidence",
              reason: `Confidence estimate confidence too low (${minConfidenceConf.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`,
              ...issue.suggestedIntervention?.reason ? { originalReason: issue.suggestedIntervention.reason } : {},
            },
          });
        } else {
          const mods = applyInjectEvidence(allIds, cognitiveStates, agentKnowledge);
          mergeModifications(allModifications, mods);
          interventions.push({
            type: "inject_evidence",
            effect: "Inject diverse evidence to prevent premature consensus lock-in",
            applied: true,
            parameters: {
              mechanism: "inject_evidence",
              reason: issue.suggestedIntervention?.reason,
            },
          });
        }
        break;
      }

      case "authority_bias_cognitive": {
        const dominantAgents = issue.suggestedIntervention?.targetAgents ?? [];
        const allAgentIds = [...cognitiveStates.keys()];
        const marginalizedAgents = allAgentIds.filter(id => !dominantAgents.includes(id));

        const minInertiaConf = getMinConfidence(
          progressiveEstimates, dominantAgents, "inertia",
        );

        if (minInertiaConf < CONFIDENCE_THRESHOLD) {
          // 降级：rebalance_attention → inject_evidence
          const allTargets = [...new Set([...dominantAgents, ...marginalizedAgents])];
          const mods = applyInjectEvidence(allTargets, cognitiveStates, agentKnowledge);
          mergeModifications(allModifications, mods);
          interventions.push({
            type: "inject_evidence",
            targetAgents: allTargets.length > 0 ? allTargets : undefined,
            effect: `[degraded: I.conf=${minInertiaConf.toFixed(2)}] Inject evidence to counter authority bias`,
            applied: true,
            parameters: {
              mechanism: "inject_evidence",
              degradedFrom: "rebalance_attention",
              reason: `Inertia estimate confidence too low (${minInertiaConf.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`,
              ...issue.suggestedIntervention?.reason ? { originalReason: issue.suggestedIntervention.reason } : {},
            },
          });
        } else {
          const mods = applyRebalanceAttention(dominantAgents, marginalizedAgents);
          mergeModifications(allModifications, mods);
          interventions.push({
            type: "rebalance_attention",
            targetAgents: dominantAgents.length > 0 ? dominantAgents : undefined,
            effect: "Rebalance speaking order: let marginalized agents speak before dominant agent",
            applied: true,
            parameters: {
              mechanism: "rebalance_attention",
              dominantAgents,
              marginalizedAgents,
              reason: issue.suggestedIntervention?.reason,
            },
          });
        }
        break;
      }

      case "evidence_imbalance": {
        const targetAgents = issue.suggestedIntervention?.targetAgents ?? [];
        const minConfidenceConf = getMinConfidence(
          progressiveEstimates, targetAgents, "confidence",
        );

        if (minConfidenceConf < CONFIDENCE_THRESHOLD) {
          // 降级：inject_evidence → 仅 evidenceGuidance
          const mods = new Map<string, CognitiveStateModification>();
          for (const agentId of targetAgents) {
            mods.set(agentId, {
              evidenceGuidance: ["evidence_coverage", "evidence_diversity"],
            });
          }
          mergeModifications(allModifications, mods);
          interventions.push({
            type: "inject_evidence",
            targetAgents: targetAgents.length > 0 ? targetAgents : undefined,
            effect: `[degraded: C.conf=${minConfidenceConf.toFixed(2)}] Evidence guidance only for evidence-poor agents`,
            applied: true,
            parameters: {
              mechanism: "evidence_guidance",
              degradedFrom: "inject_evidence",
              reason: `Confidence estimate confidence too low (${minConfidenceConf.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`,
              ...issue.suggestedIntervention?.reason ? { originalReason: issue.suggestedIntervention.reason } : {},
            },
          });
        } else {
          const mods = applyInjectEvidence(targetAgents, cognitiveStates, agentKnowledge);
          mergeModifications(allModifications, mods);
          interventions.push({
            type: "inject_evidence",
            targetAgents: targetAgents.length > 0 ? targetAgents : undefined,
            effect: "Inject private evidence of evidence-poor agents into discussion",
            applied: true,
            parameters: {
              mechanism: "inject_evidence",
              targetAgents,
              reason: issue.suggestedIntervention?.reason,
            },
          });
        }
        break;
      }

      case "cognitive_action_mismatch": {
        const targetAgents = issue.suggestedIntervention?.targetAgents ?? [];
        const allAgentIds = [...cognitiveStates.keys()];
        const others = allAgentIds.filter(id => !targetAgents.includes(id));

        const minInertiaConf = getMinConfidence(
          progressiveEstimates, targetAgents, "inertia",
        );

        if (minInertiaConf < CONFIDENCE_THRESHOLD) {
          // 降级：rebalance_attention → inject_evidence
          const allTargets = [...new Set([...targetAgents, ...others])];
          const mods = applyInjectEvidence(allTargets, cognitiveStates, agentKnowledge);
          mergeModifications(allModifications, mods);
          interventions.push({
            type: "inject_evidence",
            targetAgents: allTargets.length > 0 ? allTargets : undefined,
            effect: `[degraded: I.conf=${minInertiaConf.toFixed(2)}] Inject evidence for mismatched agents`,
            applied: true,
            parameters: {
              mechanism: "inject_evidence",
              degradedFrom: "rebalance_attention",
              reason: `Inertia estimate confidence too low (${minInertiaConf.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`,
              ...issue.suggestedIntervention?.reason ? { originalReason: issue.suggestedIntervention.reason } : {},
            },
          });
        } else {
          const mods = applyRebalanceAttention(targetAgents, others);
          mergeModifications(allModifications, mods);
          interventions.push({
            type: "rebalance_attention",
            targetAgents: targetAgents.length > 0 ? targetAgents : undefined,
            effect: "Rebalance speaking order: let mismatched agents reconsider their position",
            applied: true,
            parameters: {
              mechanism: "rebalance_attention",
              targetAgents,
              reason: issue.suggestedIntervention?.reason,
            },
          });
        }
        break;
      }

      // 保留旧系统兼容性（deprecated，但不过度使用）
      case "echo_chamber": {
        if (disabledTypes.has("rebalance_attention")) continue;
        const targetAgents = issue.suggestedIntervention?.targetAgents ?? [];
        const allIds = [...cognitiveStates.keys()];
        const marginalized = allIds.filter(id => !targetAgents.includes(id));

        const minInertiaConf = getMinConfidence(
          progressiveEstimates, targetAgents, "inertia",
        );

        if (minInertiaConf < CONFIDENCE_THRESHOLD) {
          const allTargets = [...new Set([...targetAgents, ...marginalized])];
          const mods = applyInjectEvidence(allTargets, cognitiveStates, agentKnowledge);
          mergeModifications(allModifications, mods);
          interventions.push({
            type: "inject_evidence",
            targetAgents: allTargets.length > 0 ? allTargets : undefined,
            effect: `[degraded: I.conf=${minInertiaConf.toFixed(2)}] Inject evidence to break echo chamber`,
            applied: true,
            parameters: {
              mechanism: "inject_evidence",
              degradedFrom: "rebalance_attention",
              reason: `Inertia estimate confidence too low (${minInertiaConf.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`,
            },
          });
        } else {
          const mods = applyRebalanceAttention(targetAgents, marginalized);
          mergeModifications(allModifications, mods);
          interventions.push({
            type: "rebalance_attention",
            targetAgents: targetAgents.length > 0 ? targetAgents : undefined,
            effect: "Rebalance speaking order to break echo chamber",
            applied: true,
            parameters: { mechanism: "rebalance_attention", reason: issue.suggestedIntervention?.reason },
          });
        }
        break;
      }

      // ── v6: δ 诊断 issues（δ_1d_mask, δ_polarization, δ_evidence_silence, δ_stance_flip,
      //        δ_confidence_gap, δ_no_response, δ_concentration, δ_consistency）──
      // δ 诊断生成的 issue.type 以 "δ_" 开头，suggestedIntervention.type 指定干预类型。
      // 此 default 分支根据 suggestedIntervention.type 分发到 inject_evidence / rebalance_attention，
      // 并应用与旧检测器 case 相同的置信度感知降级。
      default: {
        if (!issue.type.startsWith("δ_")) break;

        const suggestedType = issue.suggestedIntervention?.type;
        if (!suggestedType || suggestedType === "none") break;

        const targetAgents = issue.suggestedIntervention?.targetAgents
          ?? issue.agents
          ?? [];
        // 空目标列表 → 全体 agent
        const effectiveTargets = targetAgents.length > 0
          ? targetAgents
          : [...cognitiveStates.keys()];
        const marginalized = [...cognitiveStates.keys()].filter(
          id => !effectiveTargets.includes(id),
        );

        const minInertiaConf = getMinConfidence(
          progressiveEstimates, effectiveTargets, "inertia",
        );

        if (suggestedType === "inject_evidence") {
          if (disabledTypes.has("inject_evidence")) break;

          // 置信度不足时降级为 evidenceGuidance（无针对性注入）
          if (minInertiaConf < CONFIDENCE_THRESHOLD) {
            const mods = applyInjectEvidence(effectiveTargets, cognitiveStates, agentKnowledge);
            mergeModifications(allModifications, mods);
            interventions.push({
              type: "inject_evidence",
              targetAgents: effectiveTargets,
              effect: `[degraded: I.conf=${minInertiaConf.toFixed(2)}] ${issue.type}: inject evidence (low confidence)`,
              applied: true,
              parameters: {
                mechanism: "inject_evidence",
                degradedFrom: "inject_evidence",
                deltaSource: issue.type,
                reason: issue.suggestedIntervention?.reason
                  ?? `Inertia confidence too low (${minInertiaConf.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`,
              },
            });
          } else {
            const mods = applyInjectEvidence(effectiveTargets, cognitiveStates, agentKnowledge);
            mergeModifications(allModifications, mods);
            interventions.push({
              type: "inject_evidence",
              targetAgents: effectiveTargets,
              effect: `${issue.type}: inject evidence`,
              applied: true,
              parameters: {
                mechanism: "inject_evidence",
                deltaSource: issue.type,
                reason: issue.suggestedIntervention?.reason,
              },
            });
          }
        } else if (suggestedType === "rebalance_attention") {
          if (disabledTypes.has("rebalance_attention")) break;

          // 置信度不足时降级为 inject_evidence
          if (minInertiaConf < CONFIDENCE_THRESHOLD) {
            const allTargets = [...new Set([...effectiveTargets, ...marginalized])];
            const mods = applyInjectEvidence(allTargets, cognitiveStates, agentKnowledge);
            mergeModifications(allModifications, mods);
            interventions.push({
              type: "inject_evidence",
              targetAgents: allTargets,
              effect: `[degraded: I.conf=${minInertiaConf.toFixed(2)}] ${issue.type}: inject evidence (from rebalance)`,
              applied: true,
              parameters: {
                mechanism: "inject_evidence",
                degradedFrom: "rebalance_attention",
                deltaSource: issue.type,
                reason: `Inertia confidence too low (${minInertiaConf.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`,
              },
            });
          } else {
            const mods = applyRebalanceAttention(effectiveTargets, marginalized);
            mergeModifications(allModifications, mods);
            interventions.push({
              type: "rebalance_attention",
              targetAgents: effectiveTargets,
              effect: `${issue.type}: rebalance attention`,
              applied: true,
              parameters: {
                mechanism: "rebalance_attention",
                deltaSource: issue.type,
                reason: issue.suggestedIntervention?.reason,
              },
            });
          }
        }
        break;
      }
    }
  }

  return { interventions, cognitiveModifications: allModifications };
}

// ============================================================================
// Confidence-Aware Helpers
// ============================================================================

/**
 * 获取指定 agent 集合中某个估计维度的最小置信度。
 *
 * @param estimates 渐进估计结果 map
 * @param agentIds 目标 agent ID 列表
 * @param dimension 估计维度："inertia" | "confidence" | "susceptibility"
 * @returns 最小置信度（若无 estimates 则返回 1.0——不降级）
 */
function getMinConfidence(
  estimates: Map<string, ProgressiveEstimates> | undefined,
  agentIds: string[],
  dimension: "inertia" | "confidence" | "susceptibility",
): number {
  if (!estimates || estimates.size === 0 || agentIds.length === 0) {
    return 1.0; // 无数据 → 不降级
  }

  let min = 1.0;
  for (const id of agentIds) {
    const est = estimates.get(id);
    if (!est) continue;
    let conf: number;
    switch (dimension) {
      case "inertia": conf = est.inertia.confidence; break;
      case "confidence": conf = est.confidence.confidence; break;
      case "susceptibility": conf = est.susceptibility.confidence; break;
    }
    if (conf < min) min = conf;
  }
  return min;
}

// ============================================================================
// Helpers
// ============================================================================

/** 合并两次修改，同一 agent 的修改做深度合并 */
function mergeModifications(
  target: Map<string, CognitiveStateModification>,
  source: Map<string, CognitiveStateModification>,
): void {
  for (const [agentId, mod] of source) {
    const existing = target.get(agentId);
    if (existing) {
      target.set(agentId, {
        influenceWeights: { ...existing.influenceWeights, ...mod.influenceWeights },
        inertiaFactor: mod.inertiaFactor ?? existing.inertiaFactor,
        evidenceGuidance: [...(existing.evidenceGuidance ?? []), ...(mod.evidenceGuidance ?? [])],
        // v2.1: 合并新干预字段
        injectPrompt: mod.injectPrompt ?? existing.injectPrompt,
        lowerSpeakingPriority: (existing.lowerSpeakingPriority || mod.lowerSpeakingPriority) ?? undefined,
        higherSpeakingPriority: (existing.higherSpeakingPriority || mod.higherSpeakingPriority) ?? undefined,
        shuffleKnowledge: (existing.shuffleKnowledge || mod.shuffleKnowledge) ?? undefined,
      });
    } else {
      target.set(agentId, mod);
    }
  }
}