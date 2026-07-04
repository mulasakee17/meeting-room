/**
 * 干预策略测试 — reduceWeight, forceReflection, introduceDiversity, continueDiscussion
 */
import { describe, it, expect } from "vitest";
import { ReduceWeightIntervention } from "@/lib/governance/interventions/reduceWeight";
import { ForceReflectionIntervention } from "@/lib/governance/interventions/forceReflection";
import { IntroduceDiversityIntervention } from "@/lib/governance/interventions/introduceDiversity";
import { ContinueDiscussionIntervention } from "@/lib/governance/interventions/continueDiscussion";
import type { GovernanceState, Intervention } from "@/lib/governance/types";

const makeState = (overrides?: Partial<GovernanceState>): GovernanceState => ({
  agentBeliefs: [
    { agentId: "a1", belief: 0.9, confidence: 95 },
    { agentId: "a2", belief: 0.3, confidence: 70 },
    { agentId: "a3", belief: -0.6, confidence: 85 },
  ],
  messages: [],
  agentIds: ["a1", "a2", "a3"],
  interactionGraph: {
    nodes: ["a1", "a2", "a3"],
    edges: [
      { source: "a1", target: "a2", weight: 0.8, type: "agreement" },
      { source: "a1", target: "a3", weight: 0.6, type: "persuasion" },
      { source: "a2", target: "a3", weight: 0.3, type: "reference" },
    ],
  },
  ...overrides,
});

describe("ReduceWeight", () => {
  const strategy = new ReduceWeightIntervention();

  it("应该削减目标Agent的出边权重", () => {
    const state = makeState();
    const result = strategy.apply(
      { type: "reduce_weight", targetAgentId: "a1", parameters: { reductionFactor: 0.5 }, effect: "", applied: false },
      state,
    );
    expect(result.success).toBe(true);
    expect(result.stateChanges?.updatedEdges).toBeDefined();
    // a1 的两条出边应该被削减
    const a1Edges = result.stateChanges!.updatedEdges!.filter((e: any) => e.source === "a1");
    expect(a1Edges[0].weight).toBeLessThan(0.8);
    expect(a1Edges[1].weight).toBeLessThan(0.6);
  });

  it("没有 targetAgentId 应失败", () => {
    const result = strategy.apply(
      { type: "reduce_weight", parameters: {}, effect: "", applied: false },
      makeState(),
    );
    expect(result.success).toBe(false);
  });

  it("错误类型应失败", () => {
    const result = strategy.apply(
      { type: "force_reflection" as any, targetAgentId: "a1", parameters: {}, effect: "", applied: false },
      makeState(),
    );
    expect(result.success).toBe(false);
  });
});

describe("ForceReflection", () => {
  const strategy = new ForceReflectionIntervention();

  it("应该将目标Agent信念向均值拉近", () => {
    const state = makeState();
    const result = strategy.apply(
      { type: "force_reflection", targetAgents: ["a1"], parameters: { reflectionFactor: 0.5 }, effect: "", applied: false },
      state,
    );
    expect(result.success).toBe(true);
    const updated = result.stateChanges?.updatedBeliefs;
    expect(updated).toBeDefined();
    // a1 信念 0.9, 均值 = (0.9+0.3-0.6)/3 = 0.2, 向 0.2 拉
    const a1 = updated!.find((b: any) => b.agentId === "a1");
    expect(a1!.belief).toBeLessThan(0.9); // 被拉下来了
  });

  it("无目标Agent应失败", () => {
    const result = strategy.apply(
      { type: "force_reflection", targetAgents: [], parameters: {}, effect: "", applied: false },
      makeState(),
    );
    expect(result.success).toBe(false);
  });
});

describe("IntroduceDiversity", () => {
  const strategy = new IntroduceDiversityIntervention();

  it("应该对目标Agent信念加扰动", () => {
    const state = makeState();
    const result = strategy.apply(
      { type: "introduce_diversity", targetAgents: ["a2", "a3"], parameters: { perturbationAmount: 0.3 }, effect: "", applied: false },
      state,
    );
    expect(result.success).toBe(true);
    const updated = result.stateChanges?.updatedBeliefs;
    expect(updated).toBeDefined();
    // a2 信念应该被扰动
    const a2 = updated!.find((b: any) => b.agentId === "a2");
    expect(a2!.belief).not.toBe(0.3);
  });

  it("无目标Agent应失败", () => {
    const result = strategy.apply(
      { type: "introduce_diversity", targetAgents: [], parameters: {}, effect: "", applied: false },
      makeState(),
    );
    expect(result.success).toBe(false);
  });
});

describe("ContinueDiscussion", () => {
  const strategy = new ContinueDiscussionIntervention();

  it("应该建议追加讨论轮数", () => {
    const result = strategy.apply(
      { type: "continue_discussion", parameters: { additionalRounds: 3, reason: "test" }, effect: "", applied: false },
      makeState(),
    );
    expect(result.success).toBe(true);
    expect(result.intervention.effect).toContain("3");
  });

  it("无 additionalRounds 应使用默认值", () => {
    const result = strategy.apply(
      { type: "continue_discussion", parameters: {}, effect: "", applied: false },
      makeState(),
    );
    expect(result.success).toBe(true);
    expect(result.intervention.effect).toContain("additional");
  });
});
