/**
 * v2.1 非破坏性认知干预测试
 *
 * 覆盖 3 个 active 干预：
 *   - inject_evidence (applyInjectEvidence)
 *   - rebalance_attention (applyRebalanceAttention)
 *   - shuffle_knowledge (applyShuffleKnowledge)
 *
 * 以及 generateCognitiveInterventions 的 issue → intervention 映射。
 */
import { describe, it, expect } from "vitest";
import {
  applyInjectEvidence,
  applyRebalanceAttention,
  applyShuffleKnowledge,
  generateCognitiveInterventions,
} from "@/lib/governance/cognitiveInterventions";
import type {
  CognitiveGovernanceState,
  GovernanceIssue,
  CognitiveStateModification,
} from "@/lib/governance/types";

// ============================================================================
// Helpers
// ============================================================================

function makeCognitiveState(
  overrides?: Partial<CognitiveGovernanceState>,
): CognitiveGovernanceState {
  return {
    agentId: "a1",
    utility: [0.5, 0.3, 0.2],
    evidence: { coverage: 0.7, recentGain: 0.1, quality: 0.6 },
    inertia: 0.5,
    confidence: 0.8,
    susceptibility: 0.4,
    ...overrides,
  } as CognitiveGovernanceState;
}

function makeCognitiveStatesMap(
  agentIds: string[],
): Map<string, CognitiveGovernanceState> {
  const map = new Map<string, CognitiveGovernanceState>();
  for (const id of agentIds) {
    map.set(id, makeCognitiveState({ agentId: id } as any));
  }
  return map;
}

function makeIssue(
  type: GovernanceIssue["type"],
  targetAgents: string[],
  suggestedInterventionType?: string,
): GovernanceIssue {
  return {
    type,
    severity: "medium",
    description: `test issue: ${type}`,
    detectedAt: 1,
    affectedAgents: targetAgents,
    suggestedIntervention: suggestedInterventionType
      ? {
          type: suggestedInterventionType as any,
          targetAgents,
          reason: "test reason",
        }
      : undefined,
  } as GovernanceIssue;
}

// ============================================================================
// applyInjectEvidence
// ============================================================================

describe("applyInjectEvidence", () => {
  it("有 agentKnowledge 时，注入私有知识到 injectPrompt", () => {
    const states = makeCognitiveStatesMap(["a1", "a2"]);
    const knowledge = new Map<string, string[]>([
      ["a1", ["数据点A", "数据点B", "数据点C", "数据点D"]],
      ["a2", ["证据X"]],
    ]);

    const mods = applyInjectEvidence(["a1", "a2"], states, knowledge);

    const a1Mod = mods.get("a1")!;
    expect(a1Mod.injectPrompt).toBeDefined();
    expect(a1Mod.injectPrompt).toContain("数据点A");
    expect(a1Mod.injectPrompt).toContain("数据点B");
    expect(a1Mod.injectPrompt).toContain("数据点C");
    // slice(0, 3) 只取前 3 条
    expect(a1Mod.injectPrompt).not.toContain("数据点D");
    expect(a1Mod.injectPrompt).toContain("[信息注入]");

    const a2Mod = mods.get("a2")!;
    expect(a2Mod.injectPrompt).toContain("证据X");
  });

  it("无 agentKnowledge 时，降级为 evidenceGuidance", () => {
    const states = makeCognitiveStatesMap(["a1"]);
    const mods = applyInjectEvidence(["a1"], states, undefined);

    const a1Mod = mods.get("a1")!;
    expect(a1Mod.injectPrompt).toBeUndefined();
    expect(a1Mod.evidenceGuidance).toBeDefined();
    expect(a1Mod.evidenceGuidance).toContain("evidence_coverage");
    expect(a1Mod.evidenceGuidance).toContain("evidence_diversity");
    expect(a1Mod.evidenceGuidance).toContain("alternative_perspectives");
  });

  it("agentKnowledge 为空数组时，也降级为 evidenceGuidance", () => {
    const states = makeCognitiveStatesMap(["a1"]);
    const knowledge = new Map<string, string[]>([["a1", []]]);
    const mods = applyInjectEvidence(["a1"], states, knowledge);

    const a1Mod = mods.get("a1")!;
    expect(a1Mod.injectPrompt).toBeUndefined();
    expect(a1Mod.evidenceGuidance).toBeDefined();
  });

  it("对每个目标 agent 同时注入 evidenceGuidance（让所有人关注被忽略证据维度）", () => {
    const states = makeCognitiveStatesMap(["a1", "a2"]);
    const knowledge = new Map<string, string[]>([["a1", ["证据A"]]]);
    const mods = applyInjectEvidence(["a1", "a2"], states, knowledge);

    // a1 有知识 → injectPrompt + evidenceGuidance
    const a1Mod = mods.get("a1")!;
    expect(a1Mod.injectPrompt).toBeDefined();
    expect(a1Mod.evidenceGuidance).toBeDefined();

    // a2 无知识 → 只有 evidenceGuidance
    const a2Mod = mods.get("a2")!;
    expect(a2Mod.injectPrompt).toBeUndefined();
    expect(a2Mod.evidenceGuidance).toBeDefined();
  });

  it("空 targetAgentIds 返回空 Map", () => {
    const states = makeCognitiveStatesMap(["a1"]);
    const mods = applyInjectEvidence([], states);
    expect(mods.size).toBe(0);
  });
});

// ============================================================================
// applyRebalanceAttention
// ============================================================================

describe("applyRebalanceAttention", () => {
  it("对 dominant agent 设置 lowerSpeakingPriority", () => {
    const mods = applyRebalanceAttention(["a1"], ["a2"]);

    const a1Mod = mods.get("a1")!;
    expect(a1Mod.lowerSpeakingPriority).toBe(true);
    expect(a1Mod.higherSpeakingPriority).toBeUndefined();
  });

  it("对 marginalized agent 设置 higherSpeakingPriority", () => {
    const mods = applyRebalanceAttention(["a1"], ["a2"]);

    const a2Mod = mods.get("a2")!;
    expect(a2Mod.higherSpeakingPriority).toBe(true);
    expect(a2Mod.lowerSpeakingPriority).toBeUndefined();
  });

  it("同一 agent 同时是 dominant 和 marginalized 时，两个字段都为 true", () => {
    const mods = applyRebalanceAttention(["a1", "a2"], ["a2", "a3"]);

    const a2Mod = mods.get("a2")!;
    expect(a2Mod.lowerSpeakingPriority).toBe(true);
    expect(a2Mod.higherSpeakingPriority).toBe(true);
  });

  it("空数组返回空 Map", () => {
    const mods = applyRebalanceAttention([], []);
    expect(mods.size).toBe(0);
  });
});

// ============================================================================
// applyShuffleKnowledge
// ============================================================================

describe("applyShuffleKnowledge", () => {
  it("返回 __governance__ 键的 modification，shuffleKnowledge=true", () => {
    const states = makeCognitiveStatesMap(["a1", "a2"]);
    const mods = applyShuffleKnowledge(states);

    expect(mods.size).toBe(1);
    const govMod = mods.get("__governance__")!;
    expect(govMod.shuffleKnowledge).toBe(true);
  });
});

// ============================================================================
// generateCognitiveInterventions — issue → intervention 映射
// ============================================================================

describe("generateCognitiveInterventions", () => {
  const states = makeCognitiveStatesMap(["a1", "a2", "a3"]);

  it("echo_chamber_cognitive → rebalance_attention", () => {
    const issues = [makeIssue("echo_chamber_cognitive", ["a1"], "rebalance_attention")];
    const result = generateCognitiveInterventions(issues, states);

    expect(result.interventions).toHaveLength(1);
    expect(result.interventions[0].type).toBe("rebalance_attention");
    expect(result.interventions[0].applied).toBe(true);

    // a1 是冗余 agent → lowerSpeakingPriority
    const a1Mod = result.cognitiveModifications.get("a1")!;
    expect(a1Mod.lowerSpeakingPriority).toBe(true);
    // a2, a3 是被忽视 agent → higherSpeakingPriority
    const a2Mod = result.cognitiveModifications.get("a2")!;
    expect(a2Mod.higherSpeakingPriority).toBe(true);
  });

  it("polarization_cognitive → inject_evidence", () => {
    const issues = [makeIssue("polarization_cognitive", ["a1", "a3"], "inject_evidence")];
    const knowledge = new Map<string, string[]>([
      ["a1", ["极化证据A"]],
      ["a3", ["极化证据C"]],
    ]);
    const result = generateCognitiveInterventions(issues, states, undefined, knowledge);

    expect(result.interventions).toHaveLength(1);
    expect(result.interventions[0].type).toBe("inject_evidence");

    const a1Mod = result.cognitiveModifications.get("a1")!;
    expect(a1Mod.injectPrompt).toContain("极化证据A");
  });

  it("premature_consensus_cognitive → inject_evidence（所有 agent）", () => {
    const issues = [makeIssue("premature_consensus_cognitive", [], "inject_evidence")];
    const result = generateCognitiveInterventions(issues, states);

    expect(result.interventions).toHaveLength(1);
    expect(result.interventions[0].type).toBe("inject_evidence");
    // 所有 agent 都应收到 evidenceGuidance
    expect(result.cognitiveModifications.get("a1")).toBeDefined();
    expect(result.cognitiveModifications.get("a2")).toBeDefined();
    expect(result.cognitiveModifications.get("a3")).toBeDefined();
  });

  it("authority_bias_cognitive → rebalance_attention", () => {
    const issues = [makeIssue("authority_bias_cognitive", ["a1"], "rebalance_attention")];
    const result = generateCognitiveInterventions(issues, states);

    expect(result.interventions).toHaveLength(1);
    expect(result.interventions[0].type).toBe("rebalance_attention");
    expect(result.cognitiveModifications.get("a1")!.lowerSpeakingPriority).toBe(true);
    expect(result.cognitiveModifications.get("a2")!.higherSpeakingPriority).toBe(true);
  });

  it("evidence_imbalance → inject_evidence", () => {
    const issues = [makeIssue("evidence_imbalance", ["a2"], "inject_evidence")];
    const knowledge = new Map<string, string[]>([["a2", ["a2 私有数据"]]]);
    const result = generateCognitiveInterventions(issues, states, undefined, knowledge);

    expect(result.interventions).toHaveLength(1);
    expect(result.interventions[0].type).toBe("inject_evidence");
    expect(result.cognitiveModifications.get("a2")!.injectPrompt).toContain("a2 私有数据");
  });

  it("cognitive_action_mismatch → rebalance_attention", () => {
    const issues = [makeIssue("cognitive_action_mismatch", ["a1"], "rebalance_attention")];
    const result = generateCognitiveInterventions(issues, states);

    expect(result.interventions).toHaveLength(1);
    expect(result.interventions[0].type).toBe("rebalance_attention");
  });

  it("默认禁用 reduce_weight / force_reflection / introduce_diversity / continue_discussion", () => {
    const issues = [
      makeIssue("echo_chamber_cognitive", ["a1"], "reduce_weight"),
      makeIssue("polarization_cognitive", ["a1"], "force_reflection"),
    ];
    const result = generateCognitiveInterventions(issues, states);

    // 禁用的 suggestedIntervention type 被跳过
    expect(result.interventions).toHaveLength(0);
  });

  it("config.disabledInterventions 可覆盖默认禁用列表", () => {
    const issues = [makeIssue("echo_chamber_cognitive", ["a1"], "rebalance_attention")];
    const config = {
      disabledInterventions: ["rebalance_attention"],
    } as any;
    const result = generateCognitiveInterventions(issues, states, config);

    expect(result.interventions).toHaveLength(0);
  });

  it("空 issues 返回空结果", () => {
    const result = generateCognitiveInterventions([], states);
    expect(result.interventions).toHaveLength(0);
    expect(result.cognitiveModifications.size).toBe(0);
  });

  it("suggestedIntervention.type === 'none' 时跳过", () => {
    const issues = [makeIssue("echo_chamber_cognitive", ["a1"], "none")];
    const result = generateCognitiveInterventions(issues, states);
    expect(result.interventions).toHaveLength(0);
  });

  it("多个 issue 合并 modifications 到同一 agent", () => {
    const issues = [
      makeIssue("polarization_cognitive", ["a1"], "inject_evidence"),
      makeIssue("authority_bias_cognitive", ["a1"], "rebalance_attention"),
    ];
    const knowledge = new Map<string, string[]>([["a1", ["共享证据"]]]);
    const result = generateCognitiveInterventions(issues, states, undefined, knowledge);

    // a1 应同时有 injectPrompt（来自 polarization）和 lowerSpeakingPriority（来自 authority_bias）
    const a1Mod = result.cognitiveModifications.get("a1")!;
    expect(a1Mod.injectPrompt).toContain("共享证据");
    expect(a1Mod.lowerSpeakingPriority).toBe(true);
  });
});

// ============================================================================
// 旧系统兼容性（echo_chamber → rebalance_attention）
// ============================================================================

describe("generateCognitiveInterventions 旧系统兼容", () => {
  it("echo_chamber（非 cognitive 版本）→ rebalance_attention", () => {
    const states = makeCognitiveStatesMap(["a1", "a2"]);
    const issues = [makeIssue("echo_chamber", ["a1"], "rebalance_attention")];
    const result = generateCognitiveInterventions(issues, states);

    expect(result.interventions).toHaveLength(1);
    expect(result.interventions[0].type).toBe("rebalance_attention");
    expect(result.cognitiveModifications.get("a1")!.lowerSpeakingPriority).toBe(true);
  });
});
