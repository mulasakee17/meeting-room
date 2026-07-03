/**
 * 自适应阈值 + 因果推断 单元测试
 */
import { describe, it, expect } from "vitest";
import {
  computeCalibrationMetrics,
  computeAdaptiveThresholds,
} from "@/lib/governance/adaptiveThresholds";
import {
  selectCounterfactualDropout,
  estimateCausalEffect,
  buildCausalGraph,
  answerWhoCausedChange,
  decomposeBeliefChange,
} from "@/lib/discussion/causalTrace";

describe("Adaptive Thresholds", () => {
  it("应该从校准数据计算指标", () => {
    const metrics = computeCalibrationMetrics({
      convergenceRounds: 2,
      maxRounds: 5,
      beliefs: [0.5, 0.6, 0.4, 0.55, 0.45],
      messages: [
        { agentId: "a1", content: "氧气瓶最重要 因为没有氧气会死", timestamp: "", referencedAgents: [] },
        { agentId: "a2", content: "水也很重要 人体需要水", timestamp: "", referencedAgents: [] },
      ],
      agentCount: 5,
    });
    expect(metrics.convergenceSpeed).toBeCloseTo(0.4);
    expect(metrics.agentCount).toBe(5);
  });

  it("应该生成自适应阈值", () => {
    const metrics = computeCalibrationMetrics({
      convergenceRounds: 3, maxRounds: 5,
      beliefs: [0.5, 0.6, 0.4, 0.55, 0.45],
      messages: [
        { agentId: "a1", content: "test message one", timestamp: "", referencedAgents: [] },
        { agentId: "a2", content: "test message two different", timestamp: "", referencedAgents: [] },
      ],
      agentCount: 5,
    });
    const thresholds = computeAdaptiveThresholds(metrics);
    expect(thresholds.echoChamberThreshold).toBeGreaterThan(0.4);
    expect(thresholds.echoChamberThreshold).toBeLessThan(0.9);
    expect(thresholds.authorityBiasThreshold).toBeGreaterThan(0.2);
    expect(thresholds.prematureConsensusThreshold).toBeGreaterThan(0.25);
  });

  it("快收敛应降低过早共识阈值", () => {
    const fast = computeCalibrationMetrics({
      convergenceRounds: 1, maxRounds: 5, beliefs: [0.9, 0.9, 0.9, 0.9, 0.9],
      messages: [], agentCount: 5,
    });
    const slow = computeCalibrationMetrics({
      convergenceRounds: 5, maxRounds: 5, beliefs: [0.5, -0.3, 0.8, -0.6, 0.1],
      messages: [], agentCount: 5,
    });
    const fastThresholds = computeAdaptiveThresholds(fast);
    const slowThresholds = computeAdaptiveThresholds(slow);
    // 快收敛 → 阈值应更低 (更容易触发过早共识检测)
    expect(fastThresholds.prematureConsensusThreshold!).toBeLessThan(
      slowThresholds.prematureConsensusThreshold!
    );
  });
});

describe("Causal Trace", () => {
  it("应该选择反事实 dropout Agent", () => {
    const result = selectCounterfactualDropout(["a1", "a2", "a3", "a4", "a5"], 1, 42);
    expect(result).not.toBeNull();
    expect(result!.remainingAgentIds.length).toBe(4);
    expect(result!.remainingAgentIds).not.toContain(result!.droppedAgentId);
  });

  it("少于 3 个 Agent 时不应 dropout", () => {
    expect(selectCounterfactualDropout(["a1", "a2"], 1)).toBeNull();
  });

  it("应该估计因果效应", () => {
    const effect = estimateCausalEffect("a1", "a2", [
      { round: 1, sourcePresent: true, sourceBelief: 0.8, targetBelief: 0.6 },
      { round: 2, sourcePresent: true, sourceBelief: 0.7, targetBelief: 0.55 },
      { round: 3, sourcePresent: false, sourceBelief: 0.6, targetBelief: 0.3 },
      { round: 4, sourcePresent: false, sourceBelief: 0.5, targetBelief: 0.35 },
    ]);
    expect(effect).not.toBeNull();
    expect(effect!.effectType).toBe("persuasion"); // with a1 → higher belief
    expect(effect!.individualTreatmentEffect).toBeGreaterThan(0);
  });

  it("应该构建因果图", () => {
    const effects = [
      {
        sourceAgentId: "a1", targetAgentId: "a2", round: 1,
        beliefWithSource: 0.6, beliefWithoutSource: 0.3,
        individualTreatmentEffect: 0.3, effectType: "persuasion" as const,
        confidence: 0.8,
      },
    ];
    const graph = buildCausalGraph(effects);
    expect(graph.edges.length).toBe(1);
    expect(graph.edges[0].effectType).toBe("persuasion");
  });

  it("answerWhoCausedChange 应该返回有因果效应的 Agent", () => {
    const graph = buildCausalGraph([
      { sourceAgentId: "a1", targetAgentId: "a2", round: 1, beliefWithSource: 0.6, beliefWithoutSource: 0.3, individualTreatmentEffect: 0.3, effectType: "persuasion" as const, confidence: 0.9 },
      { sourceAgentId: "a1", targetAgentId: "a2", round: 2, beliefWithSource: 0.5, beliefWithoutSource: 0.25, individualTreatmentEffect: 0.25, effectType: "persuasion" as const, confidence: 0.85 },
      { sourceAgentId: "a1", targetAgentId: "a2", round: 3, beliefWithSource: 0.55, beliefWithoutSource: 0.28, individualTreatmentEffect: 0.27, effectType: "persuasion" as const, confidence: 0.88 },
    ]);
    const causes = answerWhoCausedChange("a2", graph);
    expect(causes.length).toBe(1);
    expect(causes[0].source).toBe("a1");
  });

  it("decomposeBeliefChange 应该分解信念变化来源", () => {
    const graph = buildCausalGraph([
      { sourceAgentId: "a1", targetAgentId: "a2", round: 1, beliefWithSource: 0.6, beliefWithoutSource: 0.3, individualTreatmentEffect: 0.3, effectType: "persuasion" as const, confidence: 0.9 },
    ]);
    const { independentReasoning, socialInfluence } = decomposeBeliefChange("a2", 0.5, graph);
    expect(independentReasoning + socialInfluence).toBeCloseTo(1);
  });
});
