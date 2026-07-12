/**
 * Adaptive Thresholds + Dropout Sensitivity Analysis — Unit Tests
 */
import { describe, it, expect } from "vitest";
import {
  computeCalibrationMetrics,
  computeAdaptiveThresholds,
} from "@/lib/governance/adaptiveThresholds";
import {
  selectCounterfactualDropout,
  estimateDropoutEffect,
  buildSensitivityGraph,
  answerWhatInfluencedChange,
  decomposeBeliefChange,
} from "@/lib/discussion/sensitivityTrace";

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

describe("Dropout Sensitivity Analysis", () => {
  it("should select a dropout agent", () => {
    const result = selectCounterfactualDropout(["a1", "a2", "a3", "a4", "a5"], 1, 42);
    expect(result).not.toBeNull();
    expect(result!.remainingAgentIds.length).toBe(4);
    expect(result!.remainingAgentIds).not.toContain(result!.droppedAgentId);
  });

  it("should not dropout with fewer than 3 agents", () => {
    expect(selectCounterfactualDropout(["a1", "a2"], 1)).toBeNull();
  });

  it("should estimate dropout effect", () => {
    const effect = estimateDropoutEffect("a1", "a2", [
      { round: 1, sourcePresent: true, sourceBelief: 0.8, targetBelief: 0.6 },
      { round: 2, sourcePresent: true, sourceBelief: 0.7, targetBelief: 0.55 },
      { round: 3, sourcePresent: false, sourceBelief: 0.6, targetBelief: 0.3 },
      { round: 4, sourcePresent: false, sourceBelief: 0.5, targetBelief: 0.35 },
    ]);
    expect(effect).not.toBeNull();
    expect(effect!.effectType).toBe("persuasion"); // with a1 → higher belief
    expect(effect!.observedBeliefDifference).toBeGreaterThan(0);
  });

  it("should build sensitivity graph", () => {
    const effects = [
      {
        sourceAgentId: "a1", targetAgentId: "a2", round: 1,
        beliefWithSource: 0.6, beliefWithoutSource: 0.3,
        observedBeliefDifference: 0.3, effectType: "persuasion" as const,
        confidence: 0.8,
      },
    ];
    const graph = buildSensitivityGraph(effects);
    expect(graph.edges.length).toBe(1);
    expect(graph.edges[0].effectType).toBe("persuasion");
  });

  it("answerWhatInfluencedChange should return agents with significant effect", () => {
    const graph = buildSensitivityGraph([
      { sourceAgentId: "a1", targetAgentId: "a2", round: 1, beliefWithSource: 0.6, beliefWithoutSource: 0.3, observedBeliefDifference: 0.3, effectType: "persuasion" as const, confidence: 0.9 },
      { sourceAgentId: "a1", targetAgentId: "a2", round: 2, beliefWithSource: 0.5, beliefWithoutSource: 0.25, observedBeliefDifference: 0.25, effectType: "persuasion" as const, confidence: 0.85 },
      { sourceAgentId: "a1", targetAgentId: "a2", round: 3, beliefWithSource: 0.55, beliefWithoutSource: 0.28, observedBeliefDifference: 0.27, effectType: "persuasion" as const, confidence: 0.88 },
    ]);
    const causes = answerWhatInfluencedChange("a2", graph);
    expect(causes.length).toBe(1);
    expect(causes[0].source).toBe("a1");
  });

  it("decomposeBeliefChange should decompose belief change sources", () => {
    const graph = buildSensitivityGraph([
      { sourceAgentId: "a1", targetAgentId: "a2", round: 1, beliefWithSource: 0.6, beliefWithoutSource: 0.3, observedBeliefDifference: 0.3, effectType: "persuasion" as const, confidence: 0.9 },
    ]);
    const { independentReasoning, socialInfluence } = decomposeBeliefChange("a2", 0.5, graph);
    expect(independentReasoning + socialInfluence).toBeCloseTo(1);
  });
});
