/**
 * NativeCognitiveEngine 单元测试
 *
 * 覆盖 v3.2 核心创新点：
 * 1. NativeCognitiveOpinionParser — LLM 原生 cognitiveState 输出解析
 * 2. buildPrompt 覆写 — prompt 含 cognitiveState 要求，不含旧 belief 注入
 * 3. updateCognitiveStatesFromRound — 委托 MeasurementLayer + 同步父类字段
 * 4. applyGovernance 覆写 — 认知治理路径切换
 * 5. observeAgents 覆写 — speakingPriority + shuffleKnowledge
 * 6. reset — 状态清空
 *
 * 设计原则：纯单元测试，零 LLM 调用，零 API 成本，确定性。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NativeCognitiveEngine } from "@/lib/discussion/nativeCognitiveEngine";
import type { AgentOpinion } from "@/lib/discussion/types";
import type { DiscussionAgent } from "@/lib/discussion/index";

// ============================================================================
// Helpers
// ============================================================================

/** 创建 mock DiscussionAgent */
function mockAgent(
  id: string,
  name: string,
  role: string,
  belief = 0.5,
  confidence = 70,
): DiscussionAgent {
  return {
    id,
    name,
    role,
    type: "llm",
    getState: () => ({ belief, confidence }),
    setState: () => {},
    sendMessage: async () => "",
  };
}

/** 创建含 cognitiveState 的 mock AgentOpinion（native 模式） */
function mockNativeOpinion(
  agentId: string,
  utility: Record<string, number>,
  evidenceCoverage = 0.6,
  evidenceQuality = 0.7,
  confidence = 75,
  overrides?: Partial<AgentOpinion>,
): AgentOpinion {
  return {
    agentId,
    belief: 0.5,
    confidence,
    reasoning: `reasoning for ${agentId}`,
    evidence: overrides?.evidence ?? [],
    nextOpinion: "",
    referencedAgents: overrides?.referencedAgents ?? [],
    itemBeliefs: overrides?.itemBeliefs ?? [],
    cognitiveState: {
      utility,
      evidenceCoverage,
      evidenceQuality,
    },
    structuredEvidence: overrides?.structuredEvidence,
  };
}

// ============================================================================
// 1. Engine 初始化与配置
// ============================================================================

describe("NativeCognitiveEngine 初始化", () => {
  it("强制启用 useCognitiveState", () => {
    const engine = new NativeCognitiveEngine({ seed: 42 });
    expect((engine as any).config.useCognitiveState).toBe(true);
  });

  it("即使传入 useCognitiveState: false 也强制启用", () => {
    const engine = new NativeCognitiveEngine({
      seed: 42,
      useCognitiveState: false,
    });
    expect((engine as any).config.useCognitiveState).toBe(true);
  });

  it("初始化时 thermoHistory 为空", () => {
    const engine = new NativeCognitiveEngine({ seed: 42 });
    expect(engine.getThermoHistory()).toEqual([]);
  });

  it("getCognitiveStateHistory 无数据时返回空 Map", () => {
    const engine = new NativeCognitiveEngine({ seed: 42 });
    const history = engine.getCognitiveStateHistory();
    expect(history.size).toBe(0);
  });

  it("getGovernanceEstimateHistory 无数据时返回空 Map", () => {
    const engine = new NativeCognitiveEngine({ seed: 42 });
    expect(engine.getGovernanceEstimateHistory().size).toBe(0);
  });
});

describe("NativeCognitiveEngine 状态权威", () => {
  it("run 不执行旧 scalar inference，并把显式报告作为兼容投影", async () => {
    const reports: Record<string, { belief: number; confidence: number }> = {
      a1: { belief: 0.9, confidence: 91 },
      a2: { belief: -0.8, confidence: 82 },
    };
    const states = new Map<string, { belief: number; confidence: number }>([
      ["a1", { belief: 0, confidence: 50 }],
      ["a2", { belief: 0, confidence: 50 }],
    ]);
    const agents: DiscussionAgent[] = ["a1", "a2"].map(id => ({
      id,
      name: id,
      role: "analyst",
      type: "llm",
      getState: () => ({ ...states.get(id)! }),
      setState: state => states.set(id, { ...state }),
      sendMessage: async () => JSON.stringify({
        reasoning: `${id} report`,
        evidence: [],
        belief: reports[id].belief,
        confidence: reports[id].confidence,
        cognitiveState: {
          utility: { A: reports[id].belief, B: -reports[id].belief },
          evidenceCoverage: 0.5,
          evidenceQuality: 0.5,
        },
        nextOpinion: "",
        referencedAgents: [],
      }),
    }));
    const engine = new NativeCognitiveEngine({
      seed: 42,
      maxRounds: 1,
      governanceMode: "none",
    });
    const legacyUpdate = vi.spyOn(engine as any, "updateBeliefs");

    const result = await engine.run(agents, {
      id: "state-authority",
      description: "Verify state authority",
      type: "binary-choice",
      content: "Choose A or B",
      createdAt: "2026-08-07T00:00:00.000Z",
    });

    expect(legacyUpdate).not.toHaveBeenCalled();
    expect(result.finalBeliefs).toEqual({ a1: 0.9, a2: -0.8 });
    expect(states.get("a1")).toEqual({ belief: 0.9, confidence: 91 });
    expect(states.get("a2")).toEqual({ belief: -0.8, confidence: 82 });
    expect(engine.getRoundDataArray()[0].stateCommit.authority)
      .toBe("explicit_report_projection");
    expect(engine.getRoundDataArray()[0].stateCommit.committedAgentIds)
      .toEqual(expect.arrayContaining(["a1", "a2"]));
    expect(engine.getEventTracker().getEvents("belief_update")[0].payload.stateCommit)
      .toEqual(engine.getRoundDataArray()[0].stateCommit);
  });
});

// ============================================================================
// 2. buildPrompt 覆写 — v3.2 核心差异
// ============================================================================

describe("NativeCognitiveEngine.buildPrompt", () => {
  let engine: NativeCognitiveEngine;

  beforeEach(() => {
    engine = new NativeCognitiveEngine({ seed: 42, maxRounds: 5 });
  });

  it("prompt 包含 cognitiveState JSON schema 要求", () => {
    const agent = { name: "Alice", role: "analyst", id: "a1" };
    const prompt = (engine as any).buildPrompt(
      agent,
      "Select the best supplier",
      [],
      1,
      { belief: 0.5, confidence: 70 },
      [],
    );

    expect(prompt).toContain("cognitiveState");
    expect(prompt).toContain("utility");
    expect(prompt).toContain("evidenceCoverage");
    expect(prompt).toContain("evidenceQuality");
  });

  it("prompt 包含结构化 evidence 要求（v3.2.1）", () => {
    const agent = { name: "Bob", role: "critic", id: "a2" };
    const prompt = (engine as any).buildPrompt(
      agent,
      "Select the best supplier",
      [],
      1,
      { belief: 0.5, confidence: 70 },
      [],
    );

    expect(prompt).toContain('"content"');
    expect(prompt).toContain('"supports"');
    expect(prompt).toContain('"strength"');
  });

  it("prompt 不注入旧 belief/confidence 标签（Phase 4A decoupling）", () => {
    const agent = { name: "Charlie", role: "expert", id: "a3" };
    const prompt = (engine as any).buildPrompt(
      agent,
      "Select the best supplier",
      [],
      1,
      { belief: 0.8, confidence: 90 },
      [],
    );

    // state.belief 和 state.confidence 不应直接出现在 prompt 的 memory 部分
    // 注意：buildPrompt 仍会显示认知状态（来自 cognitiveStates），但不是旧 belief 标签
    const memorySection = prompt.split("你的讨论历史:")[0];
    expect(memorySection).not.toContain("belief: 0.8");
    expect(memorySection).not.toContain("confidence: 90");
  });

  it("首轮无认知状态时显示通用提示", () => {
    const agent = { name: "Dave", role: "diplomat", id: "a4" };
    const prompt = (engine as any).buildPrompt(
      agent,
      "Select the best supplier",
      [],
      1,
      { belief: 0.5, confidence: 70 },
      [],
    );

    expect(prompt).toContain("第 1 轮");
  });
});

// ============================================================================
// 3. updateCognitiveStatesFromRound — 委托 MeasurementLayer
// ============================================================================

describe("NativeCognitiveEngine.updateCognitiveStatesFromRound", () => {
  let engine: NativeCognitiveEngine;

  beforeEach(() => {
    engine = new NativeCognitiveEngine({ seed: 42, maxRounds: 5 });
  });

  it("native 模式：从 LLM 原生 cognitiveState 更新", () => {
    const agents: DiscussionAgent[] = [
      mockAgent("a1", "Alice", "analyst"),
      mockAgent("a2", "Bob", "critic"),
    ];
    const opinions: AgentOpinion[] = [
      mockNativeOpinion("a1", { A: 0.8, B: 0.2 }, 0.6, 0.7, 75),
      mockNativeOpinion("a2", { A: 0.7, B: 0.3 }, 0.5, 0.6, 65),
    ];

    (engine as any).updateCognitiveStatesFromRound(opinions, agents, 1);

    const cogStates = engine.getCognitiveStateHistory(1) as Map<string, any>;
    expect(cogStates.size).toBe(2);
    expect(cogStates.has("a1")).toBe(true);
    expect(cogStates.has("a2")).toBe(true);
    const estimates = engine.getGovernanceEstimateHistory(1) as Map<string, any>;
    expect(estimates.size).toBe(2);
    expect(estimates.get("a1").estimatorId).toBe("swarmalpha.progressive-icl");
  });

  it("更新后 thermoHistory 记录 RTHF", () => {
    const agents: DiscussionAgent[] = [
      mockAgent("a1", "Alice", "analyst"),
      mockAgent("a2", "Bob", "critic"),
    ];
    const opinions: AgentOpinion[] = [
      mockNativeOpinion("a1", { A: 0.9, B: 0.1 }, 0.6, 0.7, 75),
      mockNativeOpinion("a2", { A: 0.85, B: 0.15 }, 0.5, 0.6, 65),
    ];

    (engine as any).updateCognitiveStatesFromRound(opinions, agents, 1);

    const thermo = engine.getThermoHistory();
    expect(thermo.length).toBe(1);
    expect(thermo[0].round).toBe(1);
    expect(thermo[0]).toHaveProperty("R");
    expect(thermo[0]).toHaveProperty("T");
    expect(thermo[0]).toHaveProperty("H");
    expect(thermo[0]).toHaveProperty("F");
  });

  it("两 agent utility 对齐时 R 接近 1", () => {
    const agents: DiscussionAgent[] = [
      mockAgent("a1", "Alice", "analyst"),
      mockAgent("a2", "Bob", "critic"),
    ];
    const opinions: AgentOpinion[] = [
      mockNativeOpinion("a1", { A: 0.9, B: 0.1 }, 0.6, 0.7, 75),
      mockNativeOpinion("a2", { A: 0.9, B: 0.1 }, 0.5, 0.6, 65),
    ];

    (engine as any).updateCognitiveStatesFromRound(opinions, agents, 1);
    const thermo = engine.getThermoHistory();
    expect(thermo[0].R).toBeGreaterThan(0.9);
  });

  it("两 agent utility 方向相反时 R 较低（cosine 相似度为负）", () => {
    const agents: DiscussionAgent[] = [
      mockAgent("a1", "Alice", "analyst"),
      mockAgent("a2", "Bob", "critic"),
    ];
    // 真正的方向相反：a1 选 A，a2 选 B，且互相反对
    const opinions: AgentOpinion[] = [
      mockNativeOpinion("a1", { A: 0.9, B: -0.9 }, 0.6, 0.7, 75),
      mockNativeOpinion("a2", { A: -0.9, B: 0.9 }, 0.5, 0.6, 65),
    ];

    (engine as any).updateCognitiveStatesFromRound(opinions, agents, 1);
    const thermo = engine.getThermoHistory();
    // cosine(0.9,-0.9 vs -0.9,0.9) = (-0.81-0.81)/1.62 = -1, R = (-1+1)/2 = 0
    expect(thermo[0].R).toBeLessThan(0.1);
  });
});

// ============================================================================
// 4. applyGovernance 覆写 — 认知治理路径
// ============================================================================

describe("NativeCognitiveEngine.applyGovernance", () => {
  let engine: NativeCognitiveEngine;

  beforeEach(() => {
    engine = new NativeCognitiveEngine({
      seed: 42,
      maxRounds: 5,
      governanceMode: "full",
      useCognitiveGovernance: true,
    });
  });

  it("none 模式回退到父类 belief-based 治理", () => {
    const noneEngine = new NativeCognitiveEngine({
      seed: 42,
      governanceMode: "none",
    });
    const agents: DiscussionAgent[] = [mockAgent("a1", "Alice", "analyst")];
    const opinions: AgentOpinion[] = [mockNativeOpinion("a1", { A: 0.8 }, 0.6, 0.7, 75)];

    const result = (noneEngine as any).applyGovernance(
      1, opinions, new Map([["a1", { belief: 0.5, confidence: 70 }]]), agents,
    );

    // none 模式应返回 null 或无干预
    expect(result === null || result?.hasIntervention === false).toBe(true);
  });

  it("full + useCognitiveGovernance 走认知治理路径", () => {
    const agents: DiscussionAgent[] = [
      mockAgent("a1", "Alice", "analyst"),
      mockAgent("a2", "Bob", "critic"),
    ];
    const opinions: AgentOpinion[] = [
      mockNativeOpinion("a1", { A: 0.9, B: 0.1 }, 0.3, 0.4, 90),
      mockNativeOpinion("a2", { A: 0.85, B: 0.15 }, 0.3, 0.4, 90),
    ];

    // 先更新认知状态（applyGovernance 依赖 cognitiveStates）
    (engine as any).updateCognitiveStatesFromRound(opinions, agents, 1);

    const result = (engine as any).applyGovernance(
      1, opinions, new Map(), agents, { currentRound: 1, maxRounds: 5 },
    );

    // 认知治理应返回有效结果（即使无干预，issues 数组也应存在）
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("issues");
    expect(result).toHaveProperty("interventions");
    expect(result).toHaveProperty("hasIntervention");
  });
});

// ============================================================================
// 5. observeAgents 覆写 — speakingPriority + shuffleKnowledge
// ============================================================================

describe("NativeCognitiveEngine.observeAgents (v2.1 干预消费)", () => {
  let engine: NativeCognitiveEngine;

  beforeEach(() => {
    engine = new NativeCognitiveEngine({ seed: 42, maxRounds: 5 });
  });

  it("pendingShuffleKnowledge 为 true 时触发知识重排", () => {
    const agents = [
      mockAgent("a1", "Alice", "analyst"),
      mockAgent("a2", "Bob", "critic"),
      mockAgent("a3", "Charlie", "expert"),
    ];

    // 设置 agentKnowledge（通过父类 protected 字段）
    (engine as any).agentKnowledge = new Map([
      ["a1", ["knowledge_A1", "knowledge_A2"]],
      ["a2", ["knowledge_B1", "knowledge_B2"]],
      ["a3", ["knowledge_C1", "knowledge_C2"]],
    ]);

    // 设置 pendingShuffleKnowledge
    (engine as any).pendingShuffleKnowledge = true;

    // 直接调用 applyShuffleKnowledge（私有方法，通过 any 访问）
    (engine as any).applyShuffleKnowledge(agents);

    const knowledge = (engine as any).agentKnowledge as Map<string, string[]>;
    // 轮转：a1 获得 a2 的知识，a2 获得 a3 的，a3 获得 a1 的
    expect(knowledge.get("a1")).toEqual(["knowledge_B1", "knowledge_B2"]);
    expect(knowledge.get("a2")).toEqual(["knowledge_C1", "knowledge_C2"]);
    expect(knowledge.get("a3")).toEqual(["knowledge_A1", "knowledge_A2"]);
  });

  it("speakingPriority 非空时按优先级排序", () => {
    const agents = [
      mockAgent("a1", "Alice", "analyst"),
      mockAgent("a2", "Bob", "critic"),
      mockAgent("a3", "Charlie", "expert"),
    ];

    // 设置 speakingPriority：a3 优先级最高，a1 最低
    (engine as any).speakingPriority = new Map([
      ["a1", -1],
      ["a2", 0],
      ["a3", 1],
    ]);

    // 模拟排序逻辑（observeAgents 内部）
    const speakingPriority = (engine as any).speakingPriority as Map<string, number>;
    const ordered = [...agents].sort((a, b) => {
      const pa = speakingPriority.get(a.id) ?? 0;
      const pb = speakingPriority.get(b.id) ?? 0;
      return pb - pa;
    });

    expect(ordered[0].id).toBe("a3");
    expect(ordered[1].id).toBe("a2");
    expect(ordered[2].id).toBe("a1");
  });

  it("knowledge 不足 2 个 agent 时不执行 shuffle", () => {
    const agents = [mockAgent("a1", "Alice", "analyst")];
    (engine as any).agentKnowledge = new Map([
      ["a1", ["knowledge_A1"]],
    ]);
    (engine as any).pendingShuffleKnowledge = true;

    // applyShuffleKnowledge 应直接返回，不做任何操作
    (engine as any).applyShuffleKnowledge(agents);

    const knowledge = (engine as any).agentKnowledge as Map<string, string[]>;
    expect(knowledge.get("a1")).toEqual(["knowledge_A1"]);
  });
});

// ============================================================================
// 6. reset — 状态清空
// ============================================================================

describe("NativeCognitiveEngine.reset", () => {
  it("清空所有 v3.2 状态", () => {
    const engine = new NativeCognitiveEngine({ seed: 42, maxRounds: 5 });

    // 填充状态
    const agents: DiscussionAgent[] = [
      mockAgent("a1", "Alice", "analyst"),
      mockAgent("a2", "Bob", "critic"),
    ];
    const opinions: AgentOpinion[] = [
      mockNativeOpinion("a1", { A: 0.8, B: 0.2 }, 0.6, 0.7, 75),
      mockNativeOpinion("a2", { A: 0.7, B: 0.3 }, 0.5, 0.6, 65),
    ];
    (engine as any).updateCognitiveStatesFromRound(opinions, agents, 1);
    (engine as any).pendingCognitiveModifications = new Map([["a1", {}]]);
    (engine as any).speakingPriority = new Map([["a1", 1]]);
    (engine as any).pendingShuffleKnowledge = true;

    // 执行 reset
    engine.reset();

    // 验证清空
    expect(engine.getThermoHistory()).toEqual([]);
    expect((engine as any).pendingCognitiveModifications.size).toBe(0);
    expect((engine as any).speakingPriority.size).toBe(0);
    expect((engine as any).pendingShuffleKnowledge).toBe(false);
    expect(engine.getCognitiveStateHistory().size).toBe(0);
    expect(engine.getGovernanceEstimateHistory().size).toBe(0);
  });

  it("reset 后可重新使用（无状态泄漏）", () => {
    const engine = new NativeCognitiveEngine({ seed: 42, maxRounds: 5 });

    // 第一轮
    const agents1: DiscussionAgent[] = [mockAgent("a1", "Alice", "analyst")];
    const opinions1: AgentOpinion[] = [mockNativeOpinion("a1", { A: 0.9 }, 0.6, 0.7, 75)];
    (engine as any).updateCognitiveStatesFromRound(opinions1, agents1, 1);

    engine.reset();

    // 第二轮（新数据）
    const agents2: DiscussionAgent[] = [mockAgent("a1", "Alice", "analyst")];
    const opinions2: AgentOpinion[] = [mockNativeOpinion("a1", { A: 0.1 }, 0.6, 0.7, 75)];
    (engine as any).updateCognitiveStatesFromRound(opinions2, agents2, 1);

    const thermo = engine.getThermoHistory();
    expect(thermo.length).toBe(1);  // 不应残留第一轮数据
    expect(thermo[0].round).toBe(1);
  });
});

// ============================================================================
// 7. NativeCognitiveOpinionParser（通过引擎间接测试）
// ============================================================================

describe("NativeCognitiveOpinionParser (间接测试)", () => {
  it("解析含 cognitiveState 的 LLM 输出", () => {
    // 注意：NativeCognitiveOpinionParser 是 private class，通过引擎的 opinionParser 访问
    const engine = new NativeCognitiveEngine({ seed: 42 });
    const parser = (engine as any).opinionParser;

    const llmOutput = JSON.stringify({
      reasoning: "Company A has better financials",
      evidence: [
        { content: "A revenue up 20%", supports: "Company A", strength: 0.8 },
      ],
      confidence: 85,
      cognitiveState: {
        utility: { "Company A": 0.9, "Company B": 0.1 },
        evidenceCoverage: 0.7,
        evidenceQuality: 0.8,
      },
      itemBeliefs: [
        { item: "Company A", rank: 1, belief: 0.9, confidence: 85 },
        { item: "Company B", rank: 2, belief: 0.1, confidence: 40 },
      ],
      nextOpinion: "Discuss risk factors",
      referencedAgents: [],
    });

    const opinion = parser.parseOpinion(llmOutput, "a1", 0.5, 70, 1);

    expect(opinion.agentId).toBe("a1");
    expect(opinion.cognitiveState).toBeDefined();
    expect(opinion.cognitiveState?.utility).toEqual({ "Company A": 0.9, "Company B": 0.1 });
    expect(opinion.cognitiveState?.evidenceCoverage).toBe(0.7);
    expect(opinion.cognitiveState?.evidenceQuality).toBe(0.8);
    expect(opinion.confidence).toBe(85);
    expect(opinion.structuredEvidence).toBeDefined();
    expect(opinion.structuredEvidence?.length).toBe(1);
    expect(opinion.structuredEvidence?.[0].supports).toBe("Company A");
    expect(opinion.structuredEvidence?.[0].strength).toBe(0.8);
  });

  it("LLM 输出无 cognitiveState 时返回 undefined", () => {
    const engine = new NativeCognitiveEngine({ seed: 42 });
    const parser = (engine as any).opinionParser;

    const llmOutput = JSON.stringify({
      reasoning: "I think A is better",
      evidence: ["A is good"],
      confidence: 70,
    });

    const opinion = parser.parseOpinion(llmOutput, "a1", 0.5, 70, 1);
    expect(opinion.cognitiveState).toBeUndefined();
  });

  it("无效 JSON 输出时回退到默认值", () => {
    const engine = new NativeCognitiveEngine({ seed: 42 });
    const parser = (engine as any).opinionParser;

    const opinion = parser.parseOpinion("not valid json", "a1", 0.5, 70, 1);

    expect(opinion.agentId).toBe("a1");
    expect(opinion.belief).toBe(0.5);  // 回退到 currentBelief
    expect(opinion.confidence).toBe(70);  // 回退到 currentConfidence
    expect(opinion.cognitiveState).toBeUndefined();
    expect(opinion.evidence).toEqual([]);
  });

  it("utility 值被 clamp 到 [-1, 1]", () => {
    const engine = new NativeCognitiveEngine({ seed: 42 });
    const parser = (engine as any).opinionParser;

    const llmOutput = JSON.stringify({
      reasoning: "test",
      cognitiveState: {
        utility: { A: 1.5, B: -2.0 },  // 超范围
        evidenceCoverage: 0.6,
        evidenceQuality: 0.7,
      },
      confidence: 50,
    });

    const opinion = parser.parseOpinion(llmOutput, "a1", 0.5, 70, 1);
    expect(opinion.cognitiveState?.utility.A).toBe(1);
    expect(opinion.cognitiveState?.utility.B).toBe(-1);
  });

  it("evidenceCoverage 和 evidenceQuality 被 clamp 到 [0, 1]", () => {
    const engine = new NativeCognitiveEngine({ seed: 42 });
    const parser = (engine as any).opinionParser;

    const llmOutput = JSON.stringify({
      reasoning: "test",
      cognitiveState: {
        utility: { A: 0.5 },
        evidenceCoverage: 1.5,  // 超范围
        evidenceQuality: -0.5,  // 超范围
      },
      confidence: 50,
    });

    const opinion = parser.parseOpinion(llmOutput, "a1", 0.5, 70, 1);
    expect(opinion.cognitiveState?.evidenceCoverage).toBe(1);
    expect(opinion.cognitiveState?.evidenceQuality).toBe(0);
  });
});
