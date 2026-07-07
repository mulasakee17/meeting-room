import { describe, it, expect } from "vitest";
import { EvaluationEngine, AgentDecision, AgentInfo, InteractionRound } from "@/lib/evaluation";

describe("EvaluationEngine", () => {
  const engine = new EvaluationEngine();

  const createMockDecisions = (count: number, belief: number = 0.5, confidence: number = 80): AgentDecision[] => {
    return Array.from({ length: count }, (_, i) => ({
      agentId: `agent_${i}`,
      content: `Decision for agent ${i} with belief ${belief}`,
      belief,
      confidence,
      reasoning: "This is a detailed reasoning for the decision",
      timestamp: new Date().toISOString(),
    }));
  };

  const createMockAgents = (count: number): AgentInfo[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `agent_${i}`,
      name: `Agent ${i}`,
      role: "expert",
      type: "default",
    }));
  };

  const createMockHistory = (rounds: number, agentsPerRound: number): InteractionRound[] => {
    return Array.from({ length: rounds }, (_, r) => ({
      round: r + 1,
      messages: Array.from({ length: agentsPerRound }, (_, i) => ({
        agentId: `agent_${i}`,
        content: `Message from agent ${i} in round ${r + 1}`,
        timestamp: new Date().toISOString(),
      })),
      beliefs: Object.fromEntries(
        Array.from({ length: agentsPerRound }, (_, i) => [`agent_${i}`, 0.55 + i * 0.04])  // deterministic: 0.55, 0.59, 0.63, ...
      ),
      beliefChanges: {},
      converged: r === rounds - 1,
    }));
  };

  // ---- Consensus ----

  it("should evaluate consensus with high agreement", () => {
    const decisions = createMockDecisions(5, 0.8, 90);
    const history = createMockHistory(3, 5);

    const result = engine.evaluateConsensus(decisions, history);

    expect(result.score).toBeGreaterThan(50);
    expect(result.kuramotoOrder).toBeGreaterThan(0.5);
    expect(result.beliefStd).toBeLessThan(0.5);
  });

  it("should evaluate consensus with diverse beliefs", () => {
    const decisions = [
      ...createMockDecisions(2, 0.2, 70),
      ...createMockDecisions(2, 0.8, 70),
      { ...createMockDecisions(1, 0.5, 70)[0], content: "Completely different decision" },
    ];
    const history = createMockHistory(3, 5);

    const result = engine.evaluateConsensus(decisions, history);

    expect(result.beliefStd).toBeDefined();
    expect(result.details).toContain("consensus");
  });

  // ---- Reliability ----

  it("should evaluate reliability with ground truth match", () => {
    const decisions = createMockDecisions(5, 0.7, 85);
    const history = createMockHistory(3, 5);

    const result = engine.evaluateReliability(
      decisions,
      "This is the correct decision",
      history,
      { content: "This is the correct decision" }
    );

    expect(result.groundTruthMatch).toBe(true);
    expect(result.crossValidationScore).toBeDefined();
  });

  it("should evaluate reliability without ground truth", () => {
    const decisions = createMockDecisions(5, 0.7, 85);
    const history = createMockHistory(3, 5);

    const result = engine.evaluateReliability(
      decisions,
      "This is the decision",
      history,
    );

    expect(result.groundTruthMatch).toBeUndefined();
    expect(result.crossValidationScore).toBeDefined();
  });

  it("roundConsistencyAlpha should be null when < 3 rounds", () => {
    const decisions = createMockDecisions(5, 0.6, 80);
    const history = createMockHistory(2, 5);

    const result = engine.evaluateReliability(decisions, "Decision", history);

    expect(result.roundConsistencyAlpha).toBeNull();
  });

  it("roundConsistencyAlpha should be a number when >= 3 rounds", () => {
    const decisions = createMockDecisions(5, 0.6, 80);
    const history = createMockHistory(3, 5);

    const result = engine.evaluateReliability(decisions, "Decision", history);

    expect(result.roundConsistencyAlpha).not.toBeNull();
    expect(typeof result.roundConsistencyAlpha).toBe("number");
    if (result.roundConsistencyAlpha !== null) {
      expect(result.roundConsistencyAlpha).toBeGreaterThanOrEqual(0);
      expect(result.roundConsistencyAlpha).toBeLessThanOrEqual(1);
    }
  });

  // ---- Dispersion (formerly Robustness) ----

  it("should evaluate dispersion with consistent decisions", () => {
    const decisions = createMockDecisions(5, 0.6, 85);
    const history = createMockHistory(3, 5);

    const result = engine.evaluateDispersion(decisions, history);

    expect(result.score).toBeGreaterThan(0);
    expect(result.beliefDispersion).toBeGreaterThan(0);
    expect(result.confidenceDispersion).toBeGreaterThan(0);
    expect(result.roundVariability).toBeGreaterThan(0);
  });

  // ---- Stability ----

  it("should evaluate stability across rounds", () => {
    const history = createMockHistory(5, 5);

    const result = engine.evaluateStability(history);

    expect(result.score).toBeGreaterThan(0);
    expect(result.roundConsistency).toBeGreaterThan(0);
  });

  // ---- Influence Analysis ----

  it("should evaluate influence analysis with proper attribution", () => {
    const decisions = createMockDecisions(5, 0.5, 80);
    const agents = createMockAgents(5);
    const history = createMockHistory(3, 5);

    const result = engine.evaluateInfluenceAnalysis(decisions, agents, history);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.giniCoefficient).toBeGreaterThanOrEqual(0);
    expect(result.attribution.length).toBe(5);
  });

  // ---- Full evaluation ----

  it("should compute overall score with default weights (5 dimensions)", () => {
    const decisions = createMockDecisions(5, 0.6, 80);
    const agents = createMockAgents(5);
    const history = createMockHistory(3, 5);

    const result = engine.evaluate(decisions, agents, history, "Final decision");

    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    // 5 dimensions only — no explainability, no manipulationResistance
    expect(result.dimensions).toHaveProperty("consensus");
    expect(result.dimensions).toHaveProperty("reliability");
    expect(result.dimensions).toHaveProperty("dispersion");
    expect(result.dimensions).toHaveProperty("stability");
    expect(result.dimensions).toHaveProperty("influenceAnalysis");
    expect(result.dimensions).not.toHaveProperty("explainability");
    expect(result.dimensions).not.toHaveProperty("manipulationResistance");
  });

  it("should assign correct grade based on score", () => {
    const decisions = createMockDecisions(5, 0.9, 95);
    const agents = createMockAgents(5);
    const history = createMockHistory(5, 5);

    const result = engine.evaluate(decisions, agents, history, "Excellent decision");

    expect(result.grade).toBeOneOf(["excellent", "good", "fair", "poor", "critical"]);
  });

  it("should handle empty input gracefully", () => {
    const result = engine.evaluate([], [], [], "");

    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.consensus.score).toBe(0);
    expect(result.dimensions.reliability.score).toBe(0);
  });
});
