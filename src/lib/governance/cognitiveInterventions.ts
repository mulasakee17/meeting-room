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

// ============================================================================
// Intervention 1: Reduce Influence Weight
// ============================================================================

/**
 * 降低目标 agent 在加权 DeGroot 更新中的影响力。
 *
 * 机制：设置 influenceWeights[targetAgentId] = β（默认 0.3），
 * 使其他 agent 在更新 utility 时降低对该 agent 的权重。
 *
 * 注意：这只降低权重，不阻止 agent 发言。
 */
export function applyReduceWeightCognitive(
  targetAgentId: string,
  cognitiveStates: Map<string, CognitiveGovernanceState>,
  factor: number = 0.3,
): Map<string, CognitiveStateModification> {
  const modifications = new Map<string, CognitiveStateModification>();

  // 对所有其他 agent 降低对 targetAgentId 的权重
  for (const [agentId] of cognitiveStates) {
    if (agentId === targetAgentId) continue;
    modifications.set(agentId, {
      influenceWeights: { [targetAgentId]: factor },
    });
  }

  return modifications;
}

// ============================================================================
// Intervention 2: Adjust Inertia (Force Reflection)
// ============================================================================

/**
 * 降低目标 agent 的认知惯性（force_reflection 的认知版本）。
 *
 * 机制：设置 inertiaFactor = 0.5，使 agent 更易受他人影响。
 * 只修改 inertia.strength，不修改 confidence（LLM 原生输出）。
 *
 * 注意：这与旧 force_reflection 不同——旧版本通过 prompt 注入实现，
 * 新版本通过修改认知状态参数实现。
 */
export function applyAdjustInertia(
  targetAgentId: string,
  factor: number = 0.5,
): Map<string, CognitiveStateModification> {
  const modifications = new Map<string, CognitiveStateModification>();
  modifications.set(targetAgentId, {
    inertiaFactor: factor,
  });
  return modifications;
}

// ============================================================================
// Intervention 3: Guide Evidence Diversity
// ============================================================================

/**
 * 引导 agent 关注更广泛的证据维度。
 *
 * 机制：为证据贫乏的 agent 设置 evidenceGuidance，
 * 提示其在下一轮关注被忽略的证据维度。
 * 这通过 prompt 实现（在 buildPrompt 中注入），而非伪造证据。
 */
export function applyEvidenceGuidance(
  targetAgentIds: string[],
  evidenceDimensions: string[],
): Map<string, CognitiveStateModification> {
  const modifications = new Map<string, CognitiveStateModification>();
  for (const agentId of targetAgentIds) {
    modifications.set(agentId, {
      evidenceGuidance: evidenceDimensions,
    });
  }
  return modifications;
}

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

  for (const agentId of targetAgentIds) {
    const knowledge = agentKnowledge?.get(agentId);
    if (knowledge && knowledge.length > 0) {
      // 有私有知识：注入到 governance prompt
      const evidenceText = knowledge.slice(0, 3).join("；");
      modifications.set(agentId, {
        injectPrompt: `[信息注入] 以下是被忽略的关键信息，请将其纳入你的判断：${evidenceText}`,
      });
    } else {
      // 无私有知识：降级为 evidenceGuidance
      modifications.set(agentId, {
        evidenceGuidance: ["evidence_coverage", "evidence_diversity", "alternative_perspectives"],
      });
    }
  }

  // 同时给所有 agent 注入 evidenceGuidance（让所有人都关注被忽略的证据维度）
  for (const agentId of targetAgentIds) {
    const mod = modifications.get(agentId)!;
    if (!mod.evidenceGuidance) {
      mod.evidenceGuidance = ["evidence_coverage", "evidence_diversity"];
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

  for (const issue of issues) {
    const suggestedType = issue.suggestedIntervention?.type;
    if (!suggestedType || suggestedType === "none") continue;
    if (disabledTypes.has(suggestedType)) continue;

    switch (issue.type) {
      case "echo_chamber_cognitive": {
        // rebalance_attention: 让冗余 agent 降低发言优先级，其他 agent 提高
        const redundantAgents = issue.suggestedIntervention?.targetAgents ?? [];
        const allAgentIds = [...cognitiveStates.keys()];
        const marginalizedAgents = allAgentIds.filter(id => !redundantAgents.includes(id));
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
        break;
      }

      case "polarization_cognitive": {
        const targetAgents = issue.suggestedIntervention?.targetAgents ?? [];
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
        break;
      }

      case "premature_consensus_cognitive": {
        // 向所有 agent 注入证据多样性引导
        const allIds = [...cognitiveStates.keys()];
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
        break;
      }

      case "authority_bias_cognitive": {
        const dominantAgents = issue.suggestedIntervention?.targetAgents ?? [];
        const allAgentIds = [...cognitiveStates.keys()];
        const marginalizedAgents = allAgentIds.filter(id => !dominantAgents.includes(id));
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
        break;
      }

      case "evidence_imbalance": {
        const targetAgents = issue.suggestedIntervention?.targetAgents ?? [];
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
        break;
      }

      case "cognitive_action_mismatch": {
        const targetAgents = issue.suggestedIntervention?.targetAgents ?? [];
        const allAgentIds = [...cognitiveStates.keys()];
        const others = allAgentIds.filter(id => !targetAgents.includes(id));
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
        break;
      }

      // 保留旧系统兼容性（deprecated，但不过度使用）
      case "echo_chamber": {
        if (disabledTypes.has("rebalance_attention")) continue;
        const targetAgents = issue.suggestedIntervention?.targetAgents ?? [];
        const allIds = [...cognitiveStates.keys()];
        const marginalized = allIds.filter(id => !targetAgents.includes(id));
        const mods = applyRebalanceAttention(targetAgents, marginalized);
        mergeModifications(allModifications, mods);
        interventions.push({
          type: "rebalance_attention",
          targetAgents: targetAgents.length > 0 ? targetAgents : undefined,
          effect: "Rebalance speaking order to break echo chamber",
          applied: true,
          parameters: { mechanism: "rebalance_attention", reason: issue.suggestedIntervention?.reason },
        });
        break;
      }
    }
  }

  return { interventions, cognitiveModifications: allModifications };
}

// ============================================================================
// Helpers
// ============================================================================

function applyReduceWeightCognitiveByIds(
  targetAgentIds: string[],
  cognitiveStates: Map<string, CognitiveGovernanceState>,
  factor: number,
): Map<string, CognitiveStateModification> {
  const allMods = new Map<string, CognitiveStateModification>();
  for (const id of targetAgentIds) {
    const mods = applyReduceWeightCognitive(id, cognitiveStates, factor);
    mergeModifications(allMods, mods);
  }
  return allMods;
}

function applyAdjustInertiaByIds(
  targetAgentIds: string[],
  factor: number,
): Map<string, CognitiveStateModification> {
  const allMods = new Map<string, CognitiveStateModification>();
  for (const id of targetAgentIds) {
    const mods = applyAdjustInertia(id, factor);
    mergeModifications(allMods, mods);
  }
  return allMods;
}

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