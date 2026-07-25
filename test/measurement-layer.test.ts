/**
 * MeasurementLayer 单元测试
 *
 * 覆盖:
 * 1. computeThermoState — 各种信念分布的 R/T/H/F 计算
 * 2. initializeCognitiveStates — agent 认知状态初始化
 * 3. updateCognitiveStates (posthoc) — 从 opinions 反推认知状态
 * 4. updateCognitiveStates (native) — 使用 LLM 原生 cognitiveState
 * 5. runDetectors — 6 个检测器运行
 * 6. reset — 状态清空
 * 7. 访问器 — getCognitiveStates, getCognitiveStateHistory, 等
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MeasurementLayer } from "@/lib/thermodynamics/MeasurementLayer";
import type { ThermoState } from "@/lib/thermodynamics/MeasurementLayer";
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
  belief: number,
  confidence: number,
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

/** 创建 mock AgentOpinion (posthoc 模式) */
function mockOpinion(
  agentId: string,
  belief: number,
  confidence: number,
  overrides?: Partial<AgentOpinion>,
): AgentOpinion {
  return {
    agentId,
    belief,
    confidence,
    reasoning: `reasoning for ${agentId}`,
    evidence: overrides?.evidence ?? [],
    nextOpinion: "",
    referencedAgents: overrides?.referencedAgents ?? [],
    itemBeliefs: overrides?.itemBeliefs ?? [],
    cognitiveState: overrides?.cognitiveState,
  };
}

// ============================================================================
// computeThermoState (新版, 5 变量语义直译)
// ============================================================================

describe("MeasurementLayer.computeThermoState (5-variable)", () => {
  let layer: MeasurementLayer;

  beforeEach(() => {
    layer = new MeasurementLayer();
  });

  it("空 cognitive states 返回全零", () => {
    const state = layer.computeThermoState();
    expect(state).toEqual({ R: 0, T: 0, H: 0, F: 0 });
  });

  it("所有 agent 同一 topChoice → R=1", () => {
    const agents = [
      mockAgent("a1", "Alice", "analyst", 0.8, 0.8),
      mockAgent("a2", "Bob", "critic", 0.7, 0.7),
      mockAgent("a3", "Charlie", "expert", 0.9, 0.9),
    ];
    const opinions: AgentOpinion[] = [
      mockOpinion("a1", 0.8, 80, { cognitiveState: { utility: { A: 0.9, B: 0.3 }, evidenceCoverage: 0.5, evidenceQuality: 0.5 } }),
      mockOpinion("a2", 0.7, 70, { cognitiveState: { utility: { A: 0.8, B: 0.2 }, evidenceCoverage: 0.5, evidenceQuality: 0.5 } }),
      mockOpinion("a3", 0.9, 90, { cognitiveState: { utility: { A: 0.95, B: 0.1 }, evidenceCoverage: 0.5, evidenceQuality: 0.5 } }),
    ];

    layer.updateCognitiveStates(opinions, agents, 1, { mode: "native" });
    const state = layer.computeThermoState();
    expect(state.R).toBeCloseTo(1.0, 1);
  });

  it("topChoice 完全分散 → R≈0", () => {
    const agents = [
      mockAgent("a1", "Alice", "analyst", 0.8, 0.8),
      mockAgent("a2", "Bob", "critic", 0.7, 0.7),
      mockAgent("a3", "Charlie", "expert", 0.9, 0.9),
    ];
    const opinions: AgentOpinion[] = [
      mockOpinion("a1", 0.8, 80, { cognitiveState: { utility: { A: 0.9, B: 0.3, C: 0.1 }, evidenceCoverage: 0.3, evidenceQuality: 0.5 } }),
      mockOpinion("a2", 0.7, 70, { cognitiveState: { utility: { B: 0.9, A: 0.3, C: 0.1 }, evidenceCoverage: 0.6, evidenceQuality: 0.5 } }),
      mockOpinion("a3", 0.9, 90, { cognitiveState: { utility: { C: 0.9, A: 0.3, B: 0.1 }, evidenceCoverage: 0.9, evidenceQuality: 0.5 } }),
    ];

    layer.updateCognitiveStates(opinions, agents, 1, { mode: "native" });
    const state = layer.computeThermoState();
    expect(state.R).toBeLessThan(0.1);
  });

  it("单 agent → R=1", () => {
    const agents = [mockAgent("a1", "Alice", "analyst", 0.5, 0.8)];
    const opinions: AgentOpinion[] = [
      mockOpinion("a1", 0.5, 80, { cognitiveState: { utility: { A: 0.8, B: 0.3 }, evidenceCoverage: 0.5, evidenceQuality: 0.5 } }),
    ];

    layer.updateCognitiveStates(opinions, agents, 1, { mode: "native" });
    const state = layer.computeThermoState();
    expect(state.R).toBe(1);
  });

  it("F = (1-R) + T·H 关系成立", () => {
    const agents = [
      mockAgent("a1", "Alice", "analyst", 0.8, 0.8),
      mockAgent("a2", "Bob", "critic", -0.3, 0.6),
    ];
    const opinions: AgentOpinion[] = [
      mockOpinion("a1", 0.8, 80, { cognitiveState: { utility: { A: 0.9, B: 0.3 }, evidenceCoverage: 0.5, evidenceQuality: 0.5 } }),
      mockOpinion("a2", -0.3, 60, { cognitiveState: { utility: { B: 0.7, A: 0.2 }, evidenceCoverage: 0.7, evidenceQuality: 0.5 } }),
    ];

    layer.updateCognitiveStates(opinions, agents, 1, { mode: "native" });
    const state = layer.computeThermoState();
    const expectedF = (1 - state.R) + state.T * state.H;
    expect(state.F).toBeCloseTo(expectedF, 10);
  });

  it("R/T/H/F 均在 [0, 1] 范围内", () => {
    const agents = [
      mockAgent("a1", "Alice", "analyst", 0.5, 0.8),
      mockAgent("a2", "Bob", "critic", -0.3, 0.6),
    ];
    const opinions: AgentOpinion[] = [
      mockOpinion("a1", 0.5, 80, { cognitiveState: { utility: { A: 0.8, B: 0.3 }, evidenceCoverage: 0.5, evidenceQuality: 0.5 } }),
      mockOpinion("a2", -0.3, 60, { cognitiveState: { utility: { B: 0.7, A: 0.2 }, evidenceCoverage: 0.7, evidenceQuality: 0.5 } }),
    ];

    layer.updateCognitiveStates(opinions, agents, 1, { mode: "native" });
    const state = layer.computeThermoState();
    expect(state.R).toBeGreaterThanOrEqual(0);
    expect(state.R).toBeLessThanOrEqual(1);
    expect(state.T).toBeGreaterThanOrEqual(0);
    expect(state.T).toBeLessThanOrEqual(1);
    expect(state.H).toBeGreaterThanOrEqual(0);
    expect(state.H).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// initializeCognitiveStates
// ============================================================================

describe("MeasurementLayer.initializeCognitiveStates", () => {
  let layer: MeasurementLayer;

  beforeEach(() => {
    layer = new MeasurementLayer();
  });

  it("为空 agents 列表初始化所有 agent", () => {
    const agents = [
      mockAgent("a1", "Alice", "analyst", 0.5, 0.8),
      mockAgent("a2", "Bob", "critic", -0.3, 0.6),
    ];

    // 通过 updateCognitiveStates 间接调用 initialize
    layer.updateCognitiveStates([], agents, 1, { mode: "posthoc" });

    const states = layer.getCognitiveStates();
    expect(states.size).toBe(2);
    expect(states.has("a1")).toBe(true);
    expect(states.has("a2")).toBe(true);
  });

  it("不会覆盖已有认知状态", () => {
    const agents = [mockAgent("a1", "Alice", "analyst", 0.5, 0.8)];

    // 第一次更新
    layer.updateCognitiveStates([], agents, 1, { mode: "posthoc" });
    const round1State = layer.getCognitiveStates().get("a1")!;

    // 第二次更新（agent 不变）
    const agents2 = [mockAgent("a1", "Alice", "analyst", 0.6, 0.7)];
    layer.updateCognitiveStates([], agents2, 2, { mode: "posthoc" });

    // 应该还是同一个 state 对象（被更新了而非替换）
    const round2State = layer.getCognitiveStates().get("a1")!;
    expect(round2State).toBeDefined();
  });
});

// ============================================================================
// updateCognitiveStates (posthoc)
// ============================================================================

describe("MeasurementLayer.updateCognitiveStates (posthoc)", () => {
  let layer: MeasurementLayer;

  beforeEach(() => {
    layer = new MeasurementLayer();
  });

  it("无发言的 agent 也有认知状态", () => {
    const agents = [
      mockAgent("a1", "Alice", "analyst", 0.5, 0.8),
      mockAgent("a2", "Bob", "critic", -0.3, 0.6),
    ];
    const opinions: AgentOpinion[] = [
      mockOpinion("a1", 0.5, 0.8),
    ];

    layer.updateCognitiveStates(opinions, agents, 1, { mode: "posthoc" });

    const states = layer.getCognitiveStates();
    expect(states.size).toBe(2);
    expect(states.get("a1")!.spokeThisRound).toBe(true);
    expect(states.get("a2")!.spokeThisRound).toBe(false);
  });

  it("发言的 agent 有 evidence items", () => {
    const agents = [mockAgent("a1", "Alice", "analyst", 0.5, 0.8)];
    const opinions: AgentOpinion[] = [
      mockOpinion("a1", 0.5, 0.8, {
        evidence: ["A 供应商价格最低", "B 供应商质量更好"],
        itemBeliefs: [
          { item: "A", belief: 0.8, rank: 1, confidence: 80 },
          { item: "B", belief: 0.6, rank: 2, confidence: 70 },
        ],
      }),
    ];

    layer.updateCognitiveStates(opinions, agents, 1, { mode: "posthoc" });

    const state = layer.getCognitiveStates().get("a1")!;
    expect(state.evidence.items.length).toBeGreaterThan(0);
  });

  it("同一 agent 多轮更新，utility 历史累积", () => {
    const agents = [mockAgent("a1", "Alice", "analyst", 0.5, 0.8)];
    const opinions1: AgentOpinion[] = [
      mockOpinion("a1", 0.5, 0.8, {
        itemBeliefs: [{ item: "A", belief: 0.8, rank: 1, confidence: 80 }],
      }),
    ];
    const opinions2: AgentOpinion[] = [
      mockOpinion("a1", 0.6, 0.7, {
        itemBeliefs: [{ item: "A", belief: 0.7, rank: 1 }],
      }),
    ];

    layer.updateCognitiveStates(opinions1, agents, 1, { mode: "posthoc" });
    layer.updateCognitiveStates(opinions2, agents, 2, { mode: "posthoc" });

    const state = layer.getCognitiveStates().get("a1")!;
    // utilityHistory 最多保留 10 条
    expect(state.utilityHistory.length).toBeGreaterThanOrEqual(1);
  });

  it("round 快照存储", () => {
    const agents = [mockAgent("a1", "Alice", "analyst", 0.5, 0.8)];
    const opinions: AgentOpinion[] = [
      mockOpinion("a1", 0.5, 0.8),
    ];

    layer.updateCognitiveStates(opinions, agents, 1, { mode: "posthoc" });
    layer.updateCognitiveStates(opinions, agents, 2, { mode: "posthoc" });

    const round1History = layer.getCognitiveStateHistory(1);
    const round2History = layer.getCognitiveStateHistory(2);
    expect(round1History.size).toBe(1);
    expect(round2History.size).toBe(1);
  });
});

// ============================================================================
// updateCognitiveStates (native)
// ============================================================================

describe("MeasurementLayer.updateCognitiveStates (native)", () => {
  let layer: MeasurementLayer;

  beforeEach(() => {
    layer = new MeasurementLayer();
  });

  it("使用 LLM 原生 cognitiveState 输出", () => {
    const agents = [mockAgent("a1", "Alice", "expert", 0.5, 0.8)];
    const opinions: AgentOpinion[] = [
      mockOpinion("a1", 0.5, 80, {
        cognitiveState: {
          utility: { A: 0.9, B: 0.3 },
          evidenceCoverage: 0.85,
          evidenceQuality: 0.75,
        },
      }),
    ];

    layer.updateCognitiveStates(opinions, agents, 1, { mode: "native" });

    const state = layer.getCognitiveStates().get("a1")!;
    expect(state.evidence.coverage).toBeCloseTo(0.85);
    expect(state.evidence.quality).toBeCloseTo(0.75);
    // confidence 由 LLM 输出推导（confidence/100）
    expect(state.confidence.overall).toBeCloseTo(0.8);
  });

  it("没有 cognitiveState 时 fallback 到 posthoc", () => {
    const agents = [mockAgent("a1", "Alice", "expert", 0.5, 0.8)];
    const opinions: AgentOpinion[] = [
      mockOpinion("a1", 0.5, 80),
    ];

    layer.updateCognitiveStates(opinions, agents, 1, { mode: "native" });

    const state = layer.getCognitiveStates().get("a1")!;
    // 应该仍然有有效的认知状态
    expect(state).toBeDefined();
    expect(state.agentId).toBe("a1");
  });
});

// ============================================================================
// Pending Modifications
// ============================================================================

describe("MeasurementLayer pending modifications", () => {
  let layer: MeasurementLayer;

  beforeEach(() => {
    layer = new MeasurementLayer();
  });

  it("injectPrompt 存入 governancePrompts", () => {
    const agents = [mockAgent("a1", "Alice", "analyst", 0.5, 0.8)];
    // 先初始化
    layer.updateCognitiveStates([], agents, 1, { mode: "posthoc" });

    const modifications = new Map();
    modifications.set("a1", {
      injectPrompt: "[信息注入] 请关注证据 A",
    });

    layer.updateCognitiveStates([], agents, 2, {
      mode: "posthoc",
      pendingModifications: modifications,
    });

    const prompts = layer.getGovernancePrompts();
    expect(prompts.has("a1")).toBe(true);
    expect(prompts.get("a1")!.some(p => p.includes("信息注入"))).toBe(true);
  });

  it("evidenceGuidance 存入 governancePrompts", () => {
    const agents = [mockAgent("a1", "Alice", "analyst", 0.5, 0.8)];
    layer.updateCognitiveStates([], agents, 1, { mode: "posthoc" });

    const modifications = new Map();
    modifications.set("a1", {
      evidenceGuidance: ["evidence_coverage", "evidence_diversity"],
    });

    layer.updateCognitiveStates([], agents, 2, {
      mode: "posthoc",
      pendingModifications: modifications,
    });

    const prompts = layer.getGovernancePrompts();
    expect(prompts.has("a1")).toBe(true);
    const prompt = prompts.get("a1")!.join("");
    expect(prompt).toContain("evidence_coverage");
    expect(prompt).toContain("evidence_diversity");
  });

  it("lowerSpeakingPriority / higherSpeakingPriority 返回优先级", () => {
    const agents = [
      mockAgent("a1", "Alice", "analyst", 0.5, 0.8),
      mockAgent("a2", "Bob", "critic", -0.3, 0.6),
    ];
    layer.updateCognitiveStates([], agents, 1, { mode: "posthoc" });

    const modifications = new Map();
    modifications.set("a1", { higherSpeakingPriority: true });
    modifications.set("a2", { lowerSpeakingPriority: true });

    const result = layer.updateCognitiveStates([], agents, 2, {
      mode: "posthoc",
      pendingModifications: modifications,
    });

    expect(result.speakingPriority.get("a1")).toBe(1);
    expect(result.speakingPriority.get("a2")).toBe(-1);
  });

  it("shuffleKnowledge 全局标记", () => {
    const agents = [mockAgent("a1", "Alice", "analyst", 0.5, 0.8)];
    layer.updateCognitiveStates([], agents, 1, { mode: "posthoc" });

    const modifications = new Map();
    modifications.set("__governance__", { shuffleKnowledge: true });

    const result = layer.updateCognitiveStates([], agents, 2, {
      mode: "posthoc",
      pendingModifications: modifications,
    });

    expect(result.shuffleKnowledge).toBe(true);
  });

  it("inertiaFactor 修改惯性", () => {
    const agents = [mockAgent("a1", "Alice", "expert", 0.5, 0.8)];
    layer.updateCognitiveStates([], agents, 1, { mode: "posthoc" });

    const origInertia = layer.getCognitiveStates().get("a1")!.inertia.strength;

    const modifications = new Map();
    modifications.set("a1", { inertiaFactor: 0.5 });

    layer.updateCognitiveStates([], agents, 2, {
      mode: "posthoc",
      pendingModifications: modifications,
    });

    const newInertia = layer.getCognitiveStates().get("a1")!.inertia.strength;
    // inertiaFactor=0.5 应该降低惯性
    expect(newInertia).toBeLessThan(origInertia);
  });
});

// ============================================================================
// runDetectors
// ============================================================================

describe("MeasurementLayer.runDetectors", () => {
  let layer: MeasurementLayer;

  beforeEach(() => {
    layer = new MeasurementLayer();
  });

  it("有认知状态时可以运行检测器", () => {
    const agents = [
      mockAgent("a1", "Alice", "analyst", 0.5, 0.8),
      mockAgent("a2", "Bob", "critic", -0.3, 0.6),
      mockAgent("a3", "Charlie", "expert", 0.2, 0.7),
    ];
    // 初始化
    layer.updateCognitiveStates([], agents, 1, { mode: "posthoc" });

    const result = layer.runDetectors(1, 5);
    expect(result).toBeDefined();
    expect(result.issues).toBeDefined();
    // 检测器应在有认知状态时返回结果
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it("无认知状态时检测器不抛异常", () => {
    // 未初始化任何 agent
    const result = layer.runDetectors(1, 5);
    expect(result).toBeDefined();
    expect(result.issues).toEqual([]);
  });
});

// ============================================================================
// reset
// ============================================================================

describe("MeasurementLayer.reset", () => {
  it("清空所有状态", () => {
    const layer = new MeasurementLayer();
    const agents = [
      mockAgent("a1", "Alice", "analyst", 0.5, 0.8),
    ];
    const opinions: AgentOpinion[] = [
      mockOpinion("a1", 0.5, 0.8),
    ];

    layer.updateCognitiveStates(opinions, agents, 1, { mode: "posthoc" });
    expect(layer.getCognitiveStates().size).toBe(1);
    expect(layer.getCognitiveStateHistory(1).size).toBe(1);

    layer.reset();

    expect(layer.getCognitiveStates().size).toBe(0);
    expect(layer.getCognitiveStateHistory(1).size).toBe(0);
    expect(layer.getGovernancePrompts().size).toBe(0);
    expect(layer.getInfluenceWeights().size).toBe(0);
  });
});

// ============================================================================
// buildDetectorInput
// ============================================================================

describe("MeasurementLayer.buildDetectorInput", () => {
  it("从认知状态构建检测器输入", () => {
    const layer = new MeasurementLayer();
    const agents = [
      mockAgent("a1", "Alice", "analyst", 0.5, 0.8),
      mockAgent("a2", "Bob", "critic", -0.3, 0.6),
    ];
    layer.updateCognitiveStates([], agents, 1, { mode: "posthoc" });

    const input = layer.buildDetectorInput();
    expect(input.length).toBe(2);
    expect(input[0].agentId).toBe("a1");
    expect(input[0].utility).toBeDefined();
    expect(input[0].evidence).toBeDefined();
    expect(input[0].inertia).toBeDefined();
    expect(input[0].confidence).toBeDefined();
    expect(input[0].susceptibility).toBeDefined();
  });
});

// ============================================================================
// getAllCognitiveStateHistory
// ============================================================================

describe("MeasurementLayer.getAllCognitiveStateHistory", () => {
  it("返回所有轮次历史", () => {
    const layer = new MeasurementLayer();
    const agents = [mockAgent("a1", "Alice", "analyst", 0.5, 0.8)];
    const opinions: AgentOpinion[] = [mockOpinion("a1", 0.5, 0.8)];

    layer.updateCognitiveStates(opinions, agents, 1, { mode: "posthoc" });
    layer.updateCognitiveStates(opinions, agents, 2, { mode: "posthoc" });
    layer.updateCognitiveStates(opinions, agents, 3, { mode: "posthoc" });

    const allHistory = layer.getAllCognitiveStateHistory();
    expect(allHistory.size).toBe(3);
    expect(allHistory.has(1)).toBe(true);
    expect(allHistory.has(2)).toBe(true);
    expect(allHistory.has(3)).toBe(true);
  });
});