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
      expertise: ["finance", "technology"],
      trustLevel: 0.8,
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
        Array.from({ length: agentsPerRound }, (_, i) => [`agent_${i}`, 0.5 + Math.random() * 0.2])
      ),
      consensus: 0.7,
    }));
  };

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

  it("should evaluate reliability with ground truth match", () => {
    const decisions = createMockDecisions(5, 0.7, 85);
    const history = createMockHistory(3, 5);
    
    const result = engine.evaluateReliability(
      decisions,
      "This is the correct decision",
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
      "This is the decision"
    );
    
    expect(result.groundTruthMatch).toBeUndefined();
    expect(result.crossValidationScore).toBeDefined();
  });

  it("should evaluate explainability with detailed reasoning", () => {
    const decisions = createMockDecisions(5, 0.6, 80);
    const history = createMockHistory(5, 5);
    
    const result = engine.evaluateExplainability(decisions, history);
    
    expect(result.score).toBeGreaterThan(60);
    expect(result.reasoningLength).toBeGreaterThan(0);
  });

  it("should evaluate robustness with consistent decisions", () => {
    const decisions = createMockDecisions(5, 0.6, 85);
    const history = createMockHistory(3, 5);
    
    const result = engine.evaluateRobustness(decisions, history);
    
    expect(result.score).toBeGreaterThan(40);
    expect(result.perturbationTests.inputNoise).toBeGreaterThan(0);
  });

  it("should evaluate stability across rounds", () => {
    const history = createMockHistory(5, 5);
    
    const result = engine.evaluateStability(history);
    
    expect(result.score).toBeGreaterThan(0);
    expect(result.roundConsistency).toBeGreaterThan(0);
  });

  it("should evaluate manipulation resistance with normal distribution", () => {
    const decisions = createMockDecisions(5, 0.5, 80);
    const agents = createMockAgents(5);
    
    const result = engine.evaluateManipulationResistance(decisions, agents);
    
    expect(result.score).toBeGreaterThan(40);
    expect(result.biasDetection).toBeGreaterThan(0);
  });

  it("should evaluate influence analysis with proper attribution", () => {
    const decisions = createMockDecisions(5, 0.5, 80);
    const agents = createMockAgents(5);
    const history = createMockHistory(3, 5);
    
    const result = engine.evaluateInfluenceAnalysis(decisions, agents, history);
    
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.giniCoefficient).toBeGreaterThanOrEqual(0);
    expect(result.attribution.length).toBe(5);
  });

  it("should compute overall score with default weights", () => {
    const decisions = createMockDecisions(5, 0.6, 80);
    const agents = createMockAgents(5);
    const history = createMockHistory(3, 5);
    
    const result = engine.evaluate(decisions, agents, history, "Final decision");
    
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(result.dimensions).toHaveProperty("consensus");
    expect(result.dimensions).toHaveProperty("reliability");
    expect(result.dimensions).toHaveProperty("explainability");
    expect(result.dimensions).toHaveProperty("robustness");
    expect(result.dimensions).toHaveProperty("stability");
    expect(result.dimensions).toHaveProperty("manipulationResistance");
    expect(result.dimensions).toHaveProperty("influenceAnalysis");
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