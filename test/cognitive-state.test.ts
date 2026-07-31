/**
 * cognitiveState.test.ts — 5 维认知状态核心库单元测试
 *
 * cognitiveState.ts 此前仅被 measurement-layer 间接覆盖，无专属单测。
 * 本测试覆盖：beliefToCognitiveState 工厂、utilityFromItemBeliefs、
 * stanceFromItemBeliefs、computeSusceptibility、utilityDistance、utilityStd、
 * 向后兼容转换函数。
 */

import { describe, it, expect } from "vitest";
import {
  beliefToCognitiveState,
  utilityFromItemBeliefs,
  stanceFromItemBeliefs,
  computeSusceptibility,
  utilityDistance,
  utilityStd,
  cognitiveStateToBelief,
  cognitiveStateToConfidence,
  cognitiveStateToAgentState,
  extractOptionsFromItemBeliefs,
  type AgentCognitiveState,
} from "@/lib/agent/cognitiveState";

// ---- beliefToCognitiveState ------------------------------------------------

describe("beliefToCognitiveState", () => {
  it("正向 belief → topChoice 为第一个选项", () => {
    const state = beliefToCognitiveState("a1", "Agent 1", "analyst", 0.8, 75, ["A", "B"]);
    expect(state.utility.topChoice).toBe("A");
    expect(state.utility.scores.A).toBe(0.8);
    expect(state.utility.scores.B).toBe(0);
  });

  it("负向 belief → topChoice 为第二个选项", () => {
    const state = beliefToCognitiveState("a1", "Agent 1", "analyst", -0.6, 75, ["A", "B"]);
    expect(state.utility.topChoice).toBe("B");
  });

  it("confidence 从 0-100 归一化到 0-1", () => {
    const state = beliefToCognitiveState("a1", "Agent 1", "analyst", 0.5, 80);
    expect(state.confidence.estimate).toBeCloseTo(0.8, 5);
    expect(state.confidence.stated).toBeCloseTo(0.8, 5);
    expect(state.confidence.overall).toBeCloseTo(0.8, 5);
  });

  it("preferenceClarity：2 选项时为 top - second", () => {
    const state = beliefToCognitiveState("a1", "Agent 1", "analyst", 0.7, 50, ["A", "B"]);
    expect(state.utility.preferenceClarity).toBeCloseTo(0.7, 5);
  });

  it("intensity：scores 的 L2 范数", () => {
    const state = beliefToCognitiveState("a1", "Agent 1", "analyst", 0.6, 50, ["A", "B"]);
    // scores = {A: 0.6, B: 0} → intensity = sqrt(0.36) = 0.6
    expect(state.utility.intensity).toBeCloseTo(0.6, 5);
  });

  it("默认选项为 ['A', 'B']", () => {
    const state = beliefToCognitiveState("a1", "Agent 1", "analyst", 0.5, 50);
    expect(state.utility.scores.A).toBe(0.5);
    expect(state.utility.scores.B).toBe(0);
  });

  it("多选项（5 个）：第一个得 belief，其余得 0", () => {
    const state = beliefToCognitiveState("a1", "Agent 1", "analyst", 0.9, 50, ["A", "B", "C", "D", "E"]);
    expect(state.utility.scores.A).toBe(0.9);
    expect(state.utility.scores.B).toBe(0);
    expect(state.utility.scores.E).toBe(0);
  });

  it("初始 susceptibility.usable 为 false", () => {
    const state = beliefToCognitiveState("a1", "Agent 1", "analyst", 0.5, 50);
    expect(state.susceptibility.usable).toBe(false);
  });

  it("初始 behaviorEvents 全为 0", () => {
    const state = beliefToCognitiveState("a1", "Agent 1", "analyst", 0.5, 50);
    expect(state.behaviorEvents.timesRefuted).toBe(0);
    expect(state.behaviorEvents.spontaneousFlips).toBe(0);
    expect(state.behaviorEvents.timesExposed).toBe(0);
  });

  it("role prior 影响 inertia.estimate", () => {
    const analyst = beliefToCognitiveState("a1", "A", "analyst", 0.5, 50);
    const devils_advocate = beliefToCognitiveState("a2", "B", "devils_advocate", 0.5, 50);
    // 不同角色应有不同的 inertia 先验
    expect(analyst.inertia.estimate).not.toBe(devils_advocate.inertia.estimate);
  });
});

// ---- utilityFromItemBeliefs ------------------------------------------------

describe("utilityFromItemBeliefs", () => {
  it("从 itemBeliefs 构建 scores", () => {
    const ib = [
      { item: "A", rank: 1, belief: 0.8, confidence: 80 },
      { item: "B", rank: 2, belief: 0.2, confidence: 60 },
    ];
    const util = utilityFromItemBeliefs(ib);
    expect(util.scores.A).toBe(0.8);
    expect(util.scores.B).toBe(0.2);
  });

  it("topChoice 是 belief 最高的选项", () => {
    const ib = [
      { item: "A", rank: 2, belief: 0.3, confidence: 50 },
      { item: "B", rank: 1, belief: 0.9, confidence: 90 },
    ];
    const util = utilityFromItemBeliefs(ib);
    expect(util.topChoice).toBe("B");
  });

  it("preferenceClarity：2+ 选项时为 top - second", () => {
    const ib = [
      { item: "A", rank: 1, belief: 0.7, confidence: 80 },
      { item: "B", rank: 2, belief: 0.2, confidence: 60 },
    ];
    const util = utilityFromItemBeliefs(ib);
    expect(util.preferenceClarity).toBeCloseTo(0.5, 5);
  });

  it("preferenceClarity：1 选项时为 abs(belief)", () => {
    const ib = [{ item: "A", rank: 1, belief: 0.6, confidence: 70 }];
    const util = utilityFromItemBeliefs(ib);
    expect(util.preferenceClarity).toBeCloseTo(0.6, 5);
  });

  it("intensity：L2 范数", () => {
    const ib = [
      { item: "A", rank: 1, belief: 0.3, confidence: 50 },
      { item: "B", rank: 2, belief: 0.4, confidence: 50 },
    ];
    const util = utilityFromItemBeliefs(ib);
    expect(util.intensity).toBeCloseTo(0.5, 1); // sqrt(0.09+0.16)=0.5
  });

  it("空 itemBeliefs 返回空 utility", () => {
    const util = utilityFromItemBeliefs([]);
    expect(util.scores).toEqual({});
    expect(util.topChoice).toBe("");
    expect(util.intensity).toBe(0);
  });
});

// ---- stanceFromItemBeliefs -------------------------------------------------

describe("stanceFromItemBeliefs", () => {
  it("top rank 项的 belief 决定 stance", () => {
    const ib = [
      { item: "A", rank: 1, belief: 0.7, confidence: 80 },
      { item: "B", rank: 2, belief: -0.3, confidence: 60 },
    ];
    expect(stanceFromItemBeliefs(ib)).toBeCloseTo(0.7, 5);
  });

  it("空数组返回 0", () => {
    expect(stanceFromItemBeliefs([])).toBe(0);
  });

  it("belief 被 clamp 到 [-1, 1]", () => {
    const ib = [{ item: "A", rank: 1, belief: 1.5, confidence: 80 }];
    expect(stanceFromItemBeliefs(ib)).toBe(1);
  });
});

// ---- computeSusceptibility -------------------------------------------------

describe("computeSusceptibility", () => {
  it("高 inertia + 高 confidence → 低 susceptibility（0.05 兜底）", () => {
    const inertia = { strength: 0.9 } as any;
    const confidence = { overall: 0.9 } as any;
    // (1-0.9)*(1-0.9) = 0.01 < 0.05 → 返回 0.05 兜底
    expect(computeSusceptibility(inertia, confidence)).toBe(0.05);
  });

  it("低 inertia + 低 confidence → 高 susceptibility", () => {
    const inertia = { strength: 0.1 } as any;
    const confidence = { overall: 0.1 } as any;
    expect(computeSusceptibility(inertia, confidence)).toBeCloseTo(0.81, 2);
  });

  it("最小值 0.05 兜底", () => {
    const inertia = { strength: 1.0 } as any;
    const confidence = { overall: 1.0 } as any;
    expect(computeSusceptibility(inertia, confidence)).toBe(0.05);
  });

  it("inertia=0.5, confidence=0.5 → 0.25", () => {
    const inertia = { strength: 0.5 } as any;
    const confidence = { overall: 0.5 } as any;
    expect(computeSusceptibility(inertia, confidence)).toBeCloseTo(0.25, 2);
  });
});

// ---- utilityDistance -------------------------------------------------------

describe("utilityDistance", () => {
  it("相同 utility 距离为 0", () => {
    const a = { scores: { A: 0.5, B: 0.3 } } as any;
    const b = { scores: { A: 0.5, B: 0.3 } } as any;
    expect(utilityDistance(a, b)).toBe(0);
  });

  it("L2 距离计算正确", () => {
    const a = { scores: { A: 1, B: 0 } } as any;
    const b = { scores: { A: 0, B: 1 } } as any;
    expect(utilityDistance(a, b)).toBeCloseTo(Math.sqrt(2), 5);
  });

  it("不同 key 集合：缺失 key 视为 0", () => {
    const a = { scores: { A: 0.5 } } as any;
    const b = { scores: { B: 0.5 } } as any;
    expect(utilityDistance(a, b)).toBeCloseTo(Math.sqrt(0.5), 5);
  });
});

// ---- utilityStd ------------------------------------------------------------

describe("utilityStd", () => {
  it("单个 utility 返回 0", () => {
    const utils = [{ scores: { A: 0.5 } } as any];
    expect(utilityStd(utils, "A")).toBe(0);
  });

  it("相同值返回 0", () => {
    const utils = [
      { scores: { A: 0.5 } } as any,
      { scores: { A: 0.5 } } as any,
    ];
    expect(utilityStd(utils, "A")).toBe(0);
  });

  it("计算标准差正确", () => {
    const utils = [
      { scores: { A: 0.0 } } as any,
      { scores: { A: 1.0 } } as any,
    ];
    // std of [0, 1] = sqrt(((0-0.5)^2 + (1-0.5)^2)/2) = sqrt(0.25) = 0.5
    expect(utilityStd(utils, "A")).toBeCloseTo(0.5, 5);
  });

  it("缺失 option 视为 0", () => {
    const utils = [
      { scores: { B: 0.5 } } as any,  // A 缺失 → 0
      { scores: { A: 1.0 } } as any,
    ];
    // values = [0, 1.0], std = 0.5
    expect(utilityStd(utils, "A")).toBeCloseTo(0.5, 5);
  });
});

// ---- 向后兼容转换 ----------------------------------------------------------

describe("向后兼容转换函数", () => {
  const state = beliefToCognitiveState("a1", "Agent 1", "analyst", 0.7, 85, ["A", "B"]);

  it("cognitiveStateToBelief 返回 topChoice 的 score", () => {
    expect(cognitiveStateToBelief(state)).toBe(0.7);
  });

  it("cognitiveStateToConfidence 从 0-1 转回 0-100", () => {
    expect(cognitiveStateToConfidence(state)).toBe(85);
  });

  it("cognitiveStateToAgentState 返回 {belief, confidence} 格式", () => {
    const agentState = cognitiveStateToAgentState(state);
    expect(agentState.belief).toBe(0.7);
    expect(agentState.confidence).toBe(85);
  });
});

// ---- extractOptionsFromItemBeliefs -----------------------------------------

describe("extractOptionsFromItemBeliefs", () => {
  it("提取 item 列表", () => {
    const ib = [
      { item: "A", rank: 1, belief: 0.5, confidence: 50 },
      { item: "B", rank: 2, belief: 0.3, confidence: 60 },
    ];
    expect(extractOptionsFromItemBeliefs(ib)).toEqual(["A", "B"]);
  });

  it("空数组返回空数组", () => {
    expect(extractOptionsFromItemBeliefs([])).toEqual([]);
  });
});
