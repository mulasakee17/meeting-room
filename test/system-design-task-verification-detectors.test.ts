/**
 * FC1/FC3 (MAST) 检测器单元测试
 *
 * 覆盖：
 *   - systemDesignDetectors.ts: detectRoleViolation (FM-1.2), detectStepRepetition (FM-1.3)
 *   - taskVerificationDetectors.ts: detectPrematureTermination (FM-3.1)
 *   - 集成入口: runSystemDesignDetectors, runTaskVerificationDetectors
 *
 * 设计原则：纯单元测试，零 LLM 调用，零 API 成本，确定性。
 * 测试策略：
 *   - 正常输入：构造典型失败场景，验证检测逻辑
 *   - 边界条件：空数组、单 agent、单 message
 *   - 与现有检测器的区分：FM-1.3 vs echo_chamber，FM-3.1 vs premature_consensus
 *   - 配置覆盖：自定义 threshold 生效
 *   - 干预类型约束：仅推荐 v2.1 非破坏性干预
 */
import { describe, it, expect } from "vitest";
import {
  detectRoleViolation,
  detectStepRepetition,
  runSystemDesignDetectors,
} from "@/lib/governance/systemDesignDetectors";
import {
  detectPrematureTermination,
  countTerminationSignals,
  runTaskVerificationDetectors,
} from "@/lib/governance/taskVerificationDetectors";
import type { MessageInfo, GovernanceConfig } from "@/lib/governance/types";

// ============================================================================
// Helpers
// ============================================================================

function makeMessage(
  agentId: string,
  content: string,
  overrides: Partial<MessageInfo> = {},
): MessageInfo {
  return {
    agentId,
    content,
    timestamp: `2026-01-01T00:00:0${Math.floor(Math.random() * 9)}Z`,
    ...overrides,
  };
}

function makeMessages(
  agentId: string,
  contents: string[],
  evidence?: string[],
): MessageInfo[] {
  return contents.map((content, i) => makeMessage(
    agentId,
    content,
    {
      timestamp: `2026-01-01T00:0${i}:00:00Z`,
      evidence: evidence ?? [],
    },
  ));
}

// ============================================================================
// 1. detectRoleViolation (FM-1.2)
// ============================================================================

describe("detectRoleViolation (FM-1.2)", () => {
  it("应该检测出 agent 发言与 role 严重偏离", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "I think we should consider the weather today and the football match."),
      makeMessage("a1", "Let's talk about movies instead of analyzing data."),
    ];
    const agentRoles = new Map([["a1", "data analyst"]]);

    const result = detectRoleViolation(messages, agentRoles);

    expect(result.detected).toBe(true);
    expect(result.violationAgents).toContain("a1");
    expect(result.severity).toBe("medium");
    expect(result.roleAlignmentScores.a1).toBeLessThan(0.15);
  });

  it("应该不报错当 agent 发言与 role 一致", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "Based on my analysis of the data, the evidence supports option A."),
      makeMessage("a1", "The analysis shows clear evidence that data trends favor A."),
    ];
    const agentRoles = new Map([["a1", "data analyst"]]);

    const result = detectRoleViolation(messages, agentRoles);

    expect(result.detected).toBe(false);
    expect(result.violationAgents).toHaveLength(0);
    expect(result.roleAlignmentScores.a1).toBeGreaterThan(0.1);
  });

  it("应该跳过未匹配角色模式（避免误报）", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "anything goes here"),
    ];
    const agentRoles = new Map([["a1", "unknown role xyz"]]);

    const result = detectRoleViolation(messages, agentRoles);

    expect(result.detected).toBe(false);
    expect(result.roleAlignmentScores.a1).toBe(1);  // 默认 perfect alignment
  });

  it("应该支持中文 role 和中文 message", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "今天天气不错，我们去玩吧。"),
      makeMessage("a1", "足球比赛很精彩。"),
    ];
    const agentRoles = new Map([["a1", "数据分析师"]]);

    const result = detectRoleViolation(messages, agentRoles);

    expect(result.detected).toBe(true);
    expect(result.violationAgents).toContain("a1");
  });

  it("应该处理空输入", () => {
    expect(detectRoleViolation([], new Map()).detected).toBe(false);
    expect(detectRoleViolation([makeMessage("a1", "test")], new Map()).detected).toBe(false);
  });

  it("应该支持自定义 threshold", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "the data analysis shows some evidence for the data-driven conclusion"),
    ];
    const agentRoles = new Map([["a1", "data analyst"]]);

    // 默认阈值 0.15 — 不应触发
    const result1 = detectRoleViolation(messages, agentRoles);
    expect(result1.detected).toBe(false);

    // 严格阈值 0.5 — 应触发
    const config: GovernanceConfig = { roleViolationThreshold: 0.5 };
    const result2 = detectRoleViolation(messages, agentRoles, config);
    expect(result2.detected).toBe(true);
  });

  it("应该把多个违规 agent 标记为 high severity", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "weather football movie"),
      makeMessage("a2", "weather football movie"),
    ];
    const agentRoles = new Map([
      ["a1", "data analyst"],
      ["a2", "data analyst"],
    ]);

    const result = detectRoleViolation(messages, agentRoles);

    expect(result.detected).toBe(true);
    expect(result.severity).toBe("high");
    expect(result.violationAgents).toHaveLength(2);
  });
});

// ============================================================================
// 2. detectStepRepetition (FM-1.3)
// ============================================================================

describe("detectStepRepetition (FM-1.3)", () => {
  it("应该检测出同一 agent 跨轮次重复发言", () => {
    const repeated = "I think we should choose option A because of the data analysis.";
    const messages: MessageInfo[] = [
      makeMessage("a1", repeated, { timestamp: "2026-01-01T00:01:00Z" }),
      makeMessage("a1", repeated, { timestamp: "2026-01-01T00:02:00Z" }),
    ];

    const result = detectStepRepetition(messages);

    expect(result.detected).toBe(true);
    expect(result.repetitionAgents).toContain("a1");
    expect(result.maxSimilarityByAgent.a1).toBeGreaterThanOrEqual(0.7);
    expect(result.severity).toBe("medium");
  });

  it("应该不报错当 agent 跨轮次发言不同", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "First, let's analyze the data from experiment one.", { timestamp: "2026-01-01T00:01:00Z" }),
      makeMessage("a1", "Now considering the risk factors, option B seems safer.", { timestamp: "2026-01-01T00:02:00Z" }),
      makeMessage("a1", "To conclude, the consensus supports a hybrid approach.", { timestamp: "2026-01-01T00:03:00Z" }),
    ];

    const result = detectStepRepetition(messages);

    expect(result.detected).toBe(false);
    expect(result.repetitionAgents).toHaveLength(0);
  });

  it("应该区分 FM-1.3（个体层）与 echo_chamber（群体层）", () => {
    // 同一 agent 跨轮重复 — FM-1.3 应触发
    const repeated = "I think we should choose option A because of the data.";
    const messages: MessageInfo[] = [
      makeMessage("a1", repeated, { timestamp: "2026-01-01T00:01:00Z" }),
      makeMessage("a1", repeated, { timestamp: "2026-01-01T00:02:00Z" }),
      // a2 也是相同内容（这是 echo chamber 的场景，但 FM-1.3 也应同时检测到 a2 重复）
      makeMessage("a2", "Different agent different message.", { timestamp: "2026-01-01T00:01:00Z" }),
      makeMessage("a2", "Another different message entirely.", { timestamp: "2026-01-01T00:02:00Z" }),
    ];

    const result = detectStepRepetition(messages);

    expect(result.detected).toBe(true);
    expect(result.repetitionAgents).toContain("a1");
    expect(result.repetitionAgents).not.toContain("a2");
  });

  it("应该处理 agent 只有一条 message 的情况", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "single message"),
    ];

    const result = detectStepRepetition(messages);

    expect(result.detected).toBe(false);
    expect(result.maxSimilarityByAgent.a1).toBe(0);
  });

  it("应该处理空输入", () => {
    const result = detectStepRepetition([]);
    expect(result.detected).toBe(false);
    expect(result.meanMaxSimilarity).toBe(0);
  });

  it("应该支持自定义 threshold", () => {
    // 构造部分重叠的句子：Jaccard ≈ 0.36（5 共同 / 14 并集）
    const messages: MessageInfo[] = [
      makeMessage("a1", "option good because data supports analysis here only sentence", { timestamp: "2026-01-01T00:01:00Z" }),
      makeMessage("a1", "option good because data supports conclusion different words second round", { timestamp: "2026-01-01T00:02:00Z" }),
    ];

    // 默认阈值 0.7 — 不应触发（相似度 ~0.36）
    const result1 = detectStepRepetition(messages);
    expect(result1.detected).toBe(false);

    // 宽松阈值 0.3 — 应触发（相似度 0.36 > 0.3）
    const config: GovernanceConfig = { stepRepetitionThreshold: 0.3 };
    const result2 = detectStepRepetition(messages, config);
    expect(result2.detected).toBe(true);
  });

  it("应该按 timestamp 排序确保相邻轮次", () => {
    // 故意打乱输入顺序
    const repeated = "I think we should choose option A because of the data analysis.";
    const messages: MessageInfo[] = [
      makeMessage("a1", repeated, { timestamp: "2026-01-01T00:02:00Z" }),  // 后
      makeMessage("a1", repeated, { timestamp: "2026-01-01T00:01:00Z" }),  // 前
    ];

    const result = detectStepRepetition(messages);

    expect(result.detected).toBe(true);
  });
});

// ============================================================================
// 3. detectPrematureTermination (FM-3.1)
// ============================================================================

describe("detectPrematureTermination (FM-3.1)", () => {
  it("应该检测出终止信号 + evidence 不足", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "The final answer is option A.", { evidence: [] }),
    ];

    const result = detectPrematureTermination(messages);

    expect(result.detected).toBe(true);
    expect(result.prematureAgents).toContain("a1");
    expect(result.details.a1.hasTerminationSignal).toBe(true);
    expect(result.details.a1.evidenceCount).toBe(0);
    expect(result.details.a1.isPremature).toBe(true);
    expect(result.severity).toBe("medium");
  });

  it("应该不报错当终止信号 + evidence 充分", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "The final answer is option A.", {
        evidence: ["evidence 1", "evidence 2", "evidence 3"],
      }),
    ];

    const result = detectPrematureTermination(messages);

    expect(result.detected).toBe(false);
    expect(result.details.a1.hasTerminationSignal).toBe(true);
    expect(result.details.a1.evidenceCount).toBe(3);
    expect(result.details.a1.isPremature).toBe(false);
  });

  it("应该不报错当无终止信号（即使 evidence 少）", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "I think we need more analysis.", { evidence: [] }),
    ];

    const result = detectPrematureTermination(messages);

    expect(result.detected).toBe(false);
    expect(result.details.a1.hasTerminationSignal).toBe(false);
    expect(result.details.a1.isPremature).toBe(false);
  });

  it("应该支持中文终止信号", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "最终答案是选项A。", { evidence: [] }),
    ];

    const result = detectPrematureTermination(messages);

    expect(result.detected).toBe(true);
    expect(result.details.a1.hasTerminationSignal).toBe(true);
  });

  it("应该检测 reasoning 字段中的终止信号", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "Some content here.", {
        reasoning: "I have finished the analysis.",
        evidence: [],
      }),
    ];

    const result = detectPrematureTermination(messages);

    expect(result.detected).toBe(true);
    expect(result.details.a1.hasTerminationSignal).toBe(true);
  });

  it("应该取每个 agent 最新的 message 检测", () => {
    const messages: MessageInfo[] = [
      // a1 早期有终止信号但 evidence 充分
      makeMessage("a1", "The final answer is A.", {
        evidence: ["e1", "e2"],
        timestamp: "2026-01-01T00:01:00Z",
      }),
      // a1 最新 message 无终止信号
      makeMessage("a1", "Wait, let me reconsider.", {
        evidence: [],
        timestamp: "2026-01-01T00:02:00Z",
      }),
    ];

    const result = detectPrematureTermination(messages);

    expect(result.detected).toBe(false);
    expect(result.details.a1.hasTerminationSignal).toBe(false);
  });

  it("应该处理空输入", () => {
    const result = detectPrematureTermination([]);
    expect(result.detected).toBe(false);
    expect(result.prematureAgents).toHaveLength(0);
  });

  it("应该支持自定义 evidence threshold", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "The final answer is A.", { evidence: ["e1"] }),
    ];

    // 默认阈值 2 — 应触发（evidence=1 < 2）
    const result1 = detectPrematureTermination(messages);
    expect(result1.detected).toBe(true);

    // 宽松阈值 1 — 不应触发（evidence=1 >= 1）
    const config: GovernanceConfig = { prematureTerminationEvidenceThreshold: 1 };
    const result2 = detectPrematureTermination(messages, config);
    expect(result2.detected).toBe(false);
  });

  it("应该把多个过早终止 agent 标记为 high severity", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "final answer is A.", { evidence: [] }),
      makeMessage("a2", "task complete.", { evidence: [] }),
    ];

    const result = detectPrematureTermination(messages);

    expect(result.detected).toBe(true);
    expect(result.severity).toBe("high");
    expect(result.prematureAgents).toHaveLength(2);
  });
});

// ============================================================================
// 4. countTerminationSignals utility
// ============================================================================

describe("countTerminationSignals", () => {
  it("应该匹配英文终止信号", () => {
    expect(countTerminationSignals("The final answer is A.")).toBeGreaterThanOrEqual(1);
    expect(countTerminationSignals("I'm done with the task.")).toBeGreaterThanOrEqual(1);
    expect(countTerminationSignals("Task is complete.")).toBeGreaterThanOrEqual(1);
  });

  it("应该匹配中文终止信号", () => {
    expect(countTerminationSignals("最终答案是A")).toBeGreaterThanOrEqual(1);
    expect(countTerminationSignals("任务完成")).toBeGreaterThanOrEqual(1);
  });

  it("应该返回 0 当无终止信号", () => {
    expect(countTerminationSignals("Let's analyze the data.")).toBe(0);
    expect(countTerminationSignals("")).toBe(0);
  });

  it("应该计数多个匹配", () => {
    const text = "The final answer is A. Task is complete. I'm done.";
    const count = countTerminationSignals(text);
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// 5. runSystemDesignDetectors (集成)
// ============================================================================

describe("runSystemDesignDetectors", () => {
  it("应该同时运行 FM-1.2 和 FM-1.3 检测器", () => {
    const repeated = "I think we should choose option A because of the data analysis.";
    const messages: MessageInfo[] = [
      // a1: role violation + step repetition
      makeMessage("a1", "weather football movie", { timestamp: "2026-01-01T00:01:00Z" }),
      makeMessage("a1", "weather football movie", { timestamp: "2026-01-01T00:02:00Z" }),
    ];
    const agentRoles = new Map([["a1", "data analyst"]]);

    const result = runSystemDesignDetectors(messages, agentRoles);

    expect(result.roleViolation.detected).toBe(true);
    expect(result.stepRepetition.detected).toBe(true);
    expect(result.issues).toHaveLength(2);

    // 验证 issue type
    const issueTypes = result.issues.map(i => i.type);
    expect(issueTypes).toContain("fm_1_2_role_violation");
    expect(issueTypes).toContain("fm_1_3_step_repetition");

    // 验证干预类型约束（仅 v2.1 非破坏性）
    const interventionTypes = result.issues.map(i => i.suggestedIntervention?.type);
    expect(interventionTypes).toContain("rebalance_attention");
    expect(interventionTypes).toContain("inject_evidence");
    // 不应包含破坏性干预
    expect(interventionTypes).not.toContain("reduce_weight");
    expect(interventionTypes).not.toContain("force_reflection");
  });

  it("应该处理无 issue 的情况", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "Based on my data analysis, the evidence supports A.", { timestamp: "2026-01-01T00:01:00Z" }),
      makeMessage("a1", "Further analysis of new data suggests B is better.", { timestamp: "2026-01-01T00:02:00Z" }),
    ];
    const agentRoles = new Map([["a1", "data analyst"]]);

    const result = runSystemDesignDetectors(messages, agentRoles);

    expect(result.issues).toHaveLength(0);
  });

  it("应该在 issues 中填充 detectionMetrics", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "weather football"),
      makeMessage("a1", "weather football"),
    ];
    const agentRoles = new Map([["a1", "data analyst"]]);

    const result = runSystemDesignDetectors(messages, agentRoles);

    for (const issue of result.issues) {
      expect(issue.detectionMetrics).toBeDefined();
      expect(Object.keys(issue.detectionMetrics!).length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// 6. runTaskVerificationDetectors (集成)
// ============================================================================

describe("runTaskVerificationDetectors", () => {
  it("应该运行 FM-3.1 检测器并生成 issue", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "The final answer is A.", { evidence: [] }),
    ];

    const result = runTaskVerificationDetectors(messages);

    expect(result.prematureTermination.detected).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("fm_3_1_premature_termination");
    expect(result.issues[0].suggestedIntervention?.type).toBe("inject_evidence");
    expect(result.issues[0].detectionMetrics).toBeDefined();
    expect(result.issues[0].detectionMetrics?.evidenceCount).toBe(0);
  });

  it("应该不生成 issue 当无过早终止", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "Need more analysis.", { evidence: ["e1"] }),
    ];

    const result = runTaskVerificationDetectors(messages);

    expect(result.issues).toHaveLength(0);
  });

  it("应该为每个过早终止 agent 生成独立 issue", () => {
    const messages: MessageInfo[] = [
      makeMessage("a1", "final answer is A.", { evidence: [] }),
      makeMessage("a2", "task complete.", { evidence: [] }),
    ];

    const result = runTaskVerificationDetectors(messages);

    expect(result.issues).toHaveLength(2);
    expect(result.issues.map(i => i.agents?.[0]).sort()).toEqual(["a1", "a2"]);
  });
});

// ============================================================================
// 7. 与现有检测器的语义区分（学术诚信守护）
// ============================================================================

describe("与现有检测器的语义区分", () => {
  it("FM-1.3 不应替代 echo_chamber（不同维度）", () => {
    // echo_chamber 场景：不同 agent 复述相同信息（群体层冗余）
    // FM-1.3 应该不报错（每个 agent 只有一条 message，没有跨轮重复）
    const sharedContent = "I agree with the previous speaker about option A.";
    const messages: MessageInfo[] = [
      makeMessage("a1", sharedContent, { timestamp: "2026-01-01T00:01:00Z" }),
      makeMessage("a2", sharedContent, { timestamp: "2026-01-01T00:01:00Z" }),
      makeMessage("a3", sharedContent, { timestamp: "2026-01-01T00:01:00Z" }),
    ];

    const result = detectStepRepetition(messages);

    // FM-1.3 不应触发（没有同一 agent 跨轮重复）
    expect(result.detected).toBe(false);
  });

  it("FM-3.1 不应替代 premature_consensus（前兆 vs 事后）", () => {
    // premature_consensus 场景：早期高共识但无终止信号
    // FM-3.1 应该不报错（没有终止信号）
    const messages: MessageInfo[] = [
      makeMessage("a1", "I agree with the consensus on A.", { evidence: ["e1", "e2"] }),
    ];

    const result = detectPrematureTermination(messages);

    // FM-3.1 不应触发（没有终止信号）
    expect(result.detected).toBe(false);
  });
});
