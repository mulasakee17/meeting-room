import { describe, it, expect } from "vitest";
import { ObservationLayer } from "@/lib/observation";
import { InferenceLayer } from "@/lib/inference";
import type { ObserverAgent } from "@/lib/observation";
import type { RuntimeContext } from "@/lib/runtime/types";

class MockObserverAgent implements ObserverAgent {
  constructor(
    public id: string,
    public name: string,
    public role: string,
    private belief: number = 0,
    private confidence: number = 50
  ) {}

  sendMessage(message: string): Promise<string> {
    return Promise.resolve(JSON.stringify({
      reasoning: `Analysis for ${this.id}`,
      evidence: ["evidence1"],
      belief: this.belief,
      confidence: this.confidence,
      nextOpinion: "",
      referencedAgents: [],
    }));
  }

  getState(): { belief: number; confidence: number } {
    return { belief: this.belief, confidence: this.confidence };
  }
}

function createMockContext(round: number = 1): RuntimeContext {
  return {
    experiment: {
      id: "exp-001",
      taskId: "task-001",
      config: {
        maxRounds: 10,
        agentCount: 3,
        agentTypes: [],
        beliefUpdateStrategy: "rule_based",
        influenceStrategy: "rule_based",
        memoryStrategy: "default",
        terminationConditions: [],
        evaluationConfig: {},
        governanceConfig: {},
      },
      status: "running",
      createdAt: new Date().toISOString(),
    },
    session: {
      id: "session-001",
      experimentId: "exp-001",
      runtimeContext: {} as any,
      status: "running",
      startTime: new Date().toISOString(),
    },
    task: {
      id: "task-001",
      description: "Test task",
      type: "discussion",
      content: "Should we adopt AI in healthcare?",
      status: "processing",
      createdAt: new Date().toISOString(),
      metadata: {},
    },
    round: {
      current: round,
      max: 10,
      startedAt: new Date().toISOString(),
    },
    state: {
      agentStates: new Map(),
      interactionGraph: { nodes: [], edges: [] },
      beliefTrajectories: {},
      decisionTrace: {
        entries: [],
        decisions: [],
        influences: [],
        causalGraph: { nodes: [], edges: [] },
        summary: { totalRounds: 0, finalDecision: "", consensusLevel: 0 },
      },
    },
    metrics: {
      evaluation: null,
      previousEvaluation: null,
      delta: {},
      history: [],
    },
    governance: {
      issues: [],
      interventions: [],
      appliedInterventions: [],
      status: "clean",
    },
    agents: {
      getById: () => null,
      getAll: () => [],
      add: () => {},
      remove: () => {},
      count: () => 0,
    },
    config: {
      loggingLevel: "info",
      maxConcurrentAgents: 10,
      timeout: 30000,
    },
    timeline: [],
    artifact: {
      experimentId: "exp-001",
      task: {} as any,
      config: {} as any,
      snapshots: {
        rounds: [],
        states: [],
        evaluations: [],
        governances: [],
        decisions: [],
      },
      timeline: [],
      metadata: {
        startTime: new Date().toISOString(),
        endTime: "",
        totalRounds: 0,
        converged: false,
        elapsedMs: 0,
      },
      terminationReason: "",
    },
  };
}

describe("Runtime Integration Tests", () => {
  describe("ObservationLayer", () => {
    it("should observe agent opinions", async () => {
      const observationLayer = new ObservationLayer();
      const agents: ObserverAgent[] = [
        new MockObserverAgent("agent1", "Agent 1", "Analyst", 0.5, 70),
        new MockObserverAgent("agent2", "Agent 2", "Expert", -0.3, 60),
      ];

      const context = createMockContext();
      const task = {
        id: "task-001",
        description: "Test",
        type: "discussion",
        content: "Test content",
        status: "processing",
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      const observations = await observationLayer.observe(agents, task, 1, context);

      expect(observations).toHaveLength(2);
      expect(observations[0].agentId).toBe("agent1");
      expect(observations[0].parsedOpinion.belief).toBe(0.5);
      expect(observations[0].parsedOpinion.confidence).toBe(70);
      expect(observations[1].agentId).toBe("agent2");
      expect(observations[1].parsedOpinion.belief).toBe(-0.3);
    });
  });

  describe("InferenceLayer", () => {
    it("should infer state deltas from observations", () => {
      const inferenceLayer = new InferenceLayer();
      const observations = [
        { parsedOpinion: { agentId: "agent1", reasoning: "", evidence: [], belief: 0.5, confidence: 70, nextOpinion: "", referencedAgents: [] } },
        { parsedOpinion: { agentId: "agent2", reasoning: "", evidence: [], belief: 0.3, confidence: 80, nextOpinion: "", referencedAgents: [] } },
      ];

      const context = createMockContext();
      context.state.agentStates.set("agent1", { agentId: "agent1", belief: 0.5, confidence: 70, opinion: "" });
      context.state.agentStates.set("agent2", { agentId: "agent2", belief: 0.3, confidence: 80, opinion: "" });

      const deltas = inferenceLayer.infer(observations, context.state, context);

      expect(deltas).toHaveLength(2);
      expect(deltas[0].agentId).toBe("agent1");
      expect(deltas[1].agentId).toBe("agent2");
    });
  });

  describe("Observation → Inference Pipeline", () => {
    it("should flow data from observation to inference correctly", async () => {
      const observationLayer = new ObservationLayer();
      const inferenceLayer = new InferenceLayer();

      const agents: ObserverAgent[] = [
        new MockObserverAgent("agent1", "Agent 1", "Analyst", 0.5, 70),
        new MockObserverAgent("agent2", "Agent 2", "Expert", -0.3, 60),
      ];

      const context = createMockContext();
      context.state.agentStates.set("agent1", { agentId: "agent1", belief: 0.5, confidence: 70, opinion: "" });
      context.state.agentStates.set("agent2", { agentId: "agent2", belief: -0.3, confidence: 60, opinion: "" });

      const task = {
        id: "task-001",
        description: "Test",
        type: "discussion",
        content: "Test content",
        status: "processing",
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      const observations = await observationLayer.observe(agents, task, 1, context);

      expect(observations.length).toBe(2);

      const deltas = inferenceLayer.infer(observations, context.state, context);

      expect(deltas.length).toBe(2);
      deltas.forEach((delta) => {
        expect(delta.agentId).toBeDefined();
        expect(typeof delta.beliefChange).toBe("number");
        expect(typeof delta.confidenceChange).toBe("number");
        expect(delta.reason).toBeDefined();
      });
    });
  });
});
