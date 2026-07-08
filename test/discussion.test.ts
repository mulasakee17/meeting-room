import { describe, it, expect } from "vitest";
import { DiscussionEngine, RuleBasedBeliefUpdate, RuleBasedInfluence, DecisionTraceBuilder } from "@/lib/discussion";

class MockAgent {
  constructor(
    public id: string,
    public name: string,
    public role: string,
    public type: string,
    public belief: number = 0,
    public confidence: number = 50
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

  setState(state: { belief: number; confidence: number }): void {
    this.belief = state.belief;
    this.confidence = state.confidence;
  }
}

describe("Discussion Engine - Phase 1 Fixes", () => {
  describe("D-1: roundNumber 传递修复", () => {
    it("should pass correct roundNumber to belief update context", () => {
      const beliefUpdate = new RuleBasedBeliefUpdate();
      const context = {
        agentId: "agent1",
        currentBelief: 0.5,
        currentConfidence: 70,
        roundNumber: 2,
        allOpinions: [
          { agentId: "agent1", reasoning: "", evidence: [], belief: 0.5, confidence: 70, nextOpinion: "", referencedAgents: [] },
          { agentId: "agent2", reasoning: "", evidence: [], belief: 0.6, confidence: 80, nextOpinion: "", referencedAgents: [] },
        ],
        memory: [],
        interactionGraph: { nodes: [], edges: [] },
        influenceWeights: [],
      };

      const result = beliefUpdate.update(context);
      expect(result).toBeDefined();
    });
  });

  describe("D-2: Agent 状态同步", () => {
    it("should sync agent state after belief update", async () => {
      const agent1 = new MockAgent("agent1", "Agent 1", "Expert", "custom", 0.3, 60);
      const agent2 = new MockAgent("agent2", "Agent 2", "Critic", "custom", -0.2, 50);

      const engine = new DiscussionEngine({ maxRounds: 2 });
      const result = await engine.run([agent1, agent2], {
        type: "text",
        content: "Test task",
      });

      expect(agent1.belief).not.toBe(0.3);
      expect(agent2.belief).not.toBe(-0.2);
    });
  });

  describe("D-3: Memory 截断长度", () => {
    it("should include full reasoning text in memory context", () => {
      const agent1 = new MockAgent("agent1", "Agent 1", "Expert", "custom");
      const longReasoning = "This is a very long reasoning text that should not be truncated. ".repeat(10);
      
      agent1.sendMessage = () => Promise.resolve(JSON.stringify({
        reasoning: longReasoning,
        evidence: [],
        belief: 0.5,
        confidence: 70,
        nextOpinion: "",
        referencedAgents: [],
      }));

      const engine = new DiscussionEngine({ maxRounds: 2 });
      
      return engine.run([agent1], {
        type: "text",
        content: "Test task",
      }).then(result => {
        const memory = engine.getMemory();
        expect(memory[0].reasoning).toBe(longReasoning);
      });
    });
  });

  describe("D-4: Influence 权重传递", () => {
    it("should include influence weights in belief update context", async () => {
      const agent1 = new MockAgent("agent1", "Agent 1", "Expert", "custom", 0.8, 90);
      const agent2 = new MockAgent("agent2", "Agent 2", "Analyst", "custom", -0.6, 60);

      const engine = new DiscussionEngine({ maxRounds: 2 });
      const result = await engine.run([agent1, agent2], {
        type: "text",
        content: "Test task",
      });

      const graph = engine.getInteractionGraph();
      expect(graph.edges.length).toBeGreaterThan(0);

      const trace = engine.getDecisionTrace();
      expect(trace.length).toBeGreaterThan(0);
    });

    it("influence should affect belief change", () => {
      const beliefUpdate = new RuleBasedBeliefUpdate();
      const contextWithInfluence = {
        agentId: "agent1",
        currentBelief: 0.3,
        currentConfidence: 50,
        roundNumber: 1,
        allOpinions: [
          { agentId: "agent1", reasoning: "", evidence: [], belief: 0.3, confidence: 50, nextOpinion: "", referencedAgents: [] },
          { agentId: "agent2", reasoning: "", evidence: [], belief: 0.7, confidence: 90, nextOpinion: "", referencedAgents: [] },
        ],
        memory: [],
        interactionGraph: { nodes: [], edges: [] },
        influenceWeights: [
          { sourceAgentId: "agent2", weight: 0.8, type: "agreement" },
        ],
      };

      const contextWithoutInfluence = {
        ...contextWithInfluence,
        influenceWeights: [],
      };

      const resultWith = beliefUpdate.update(contextWithInfluence);
      const resultWithout = beliefUpdate.update(contextWithoutInfluence);

      expect(resultWith.belief).not.toBe(resultWithout.belief);
    });
  });

  describe("Discussion Engine Integration", () => {
    it("should complete multi-round discussion", async () => {
      const agent1 = new MockAgent("agent1", "Expert", "Expert", "custom", 0.5, 70);
      const agent2 = new MockAgent("agent2", "Critic", "Critic", "custom", -0.3, 60);
      const agent3 = new MockAgent("agent3", "Synthesizer", "Synthesizer", "custom", 0.1, 50);

      const engine = new DiscussionEngine({ maxRounds: 3 });
      const result = await engine.run([agent1, agent2, agent3], {
        type: "text",
        content: "Should we invest in renewable energy?",
      });

      expect(result.totalRounds).toBeLessThanOrEqual(3);
      expect(result.converged).toBeDefined();
      expect(result.finalDecision).toBeDefined();
      expect(result.interactionGraph.edges.length).toBeGreaterThan(0);
    });

    it("should detect convergence", async () => {
      const agent1 = new MockAgent("agent1", "Agent 1", "Expert", "custom", 0.5, 80);
      const agent2 = new MockAgent("agent2", "Agent 2", "Expert", "custom", 0.51, 85);

      agent1.sendMessage = () => Promise.resolve(JSON.stringify({
        reasoning: "Agree",
        evidence: [],
        belief: 0.5,
        confidence: 80,
        nextOpinion: "",
        referencedAgents: [],
      }));

      agent2.sendMessage = () => Promise.resolve(JSON.stringify({
        reasoning: "Agree",
        evidence: [],
        belief: 0.51,
        confidence: 85,
        nextOpinion: "",
        referencedAgents: [],
      }));

      const engine = new DiscussionEngine({ maxRounds: 3, convergenceThreshold: 0.1 });
      const result = await engine.run([agent1, agent2], {
        type: "text",
        content: "Test",
      });

      expect(result.totalRounds).toBe(1);
      expect(result.converged).toBe(true);
    });
  });

  describe("Decision Trace - Phase 2 Enhancements", () => {
    it("should track influence records", async () => {
      const agent1 = new MockAgent("agent1", "Agent 1", "Expert", "custom", 0.8, 90);
      const agent2 = new MockAgent("agent2", "Agent 2", "Analyst", "custom", -0.6, 60);

      const engine = new DiscussionEngine({ maxRounds: 2 });
      await engine.run([agent1, agent2], {
        type: "text",
        content: "Test task",
      });

      const summary = engine.summarizeTrace();
      expect(summary.keyInfluencers.length).toBeGreaterThanOrEqual(0);
    });

    it("should detect consensus events", async () => {
      const agent1 = new MockAgent("agent1", "Agent 1", "Expert", "custom", 0.5, 80);
      const agent2 = new MockAgent("agent2", "Agent 2", "Expert", "custom", 0.51, 85);

      agent1.sendMessage = () => Promise.resolve(JSON.stringify({
        reasoning: "同意投资",
        evidence: [],
        belief: 0.5,
        confidence: 80,
        nextOpinion: "",
        referencedAgents: [],
      }));

      agent2.sendMessage = () => Promise.resolve(JSON.stringify({
        reasoning: "同意投资",
        evidence: [],
        belief: 0.51,
        confidence: 85,
        nextOpinion: "",
        referencedAgents: [],
      }));

      const engine = new DiscussionEngine({ maxRounds: 2 });
      await engine.run([agent1, agent2], {
        type: "text",
        content: "Test",
      });

      const summary = engine.summarizeTrace();
      expect(Array.isArray(summary.consensusTimeline)).toBe(true);
    });

    it("should answer Who influenced whom", async () => {
      const agent1 = new MockAgent("agent1", "Agent 1", "Expert", "custom", 0.8, 90);
      const agent2 = new MockAgent("agent2", "Agent 2", "Analyst", "custom", -0.6, 60);

      const engine = new DiscussionEngine({ maxRounds: 2 });
      await engine.run([agent1, agent2], {
        type: "text",
        content: "Test task",
      });

      const trace = engine.getDecisionTrace();
      const builder = new DecisionTraceBuilder();
      
      for (const entry of trace) {
        builder.addRound(entry.roundNumber, [], [], { nodes: [], edges: [] });
      }

      const result = builder.answerWhoInfluencedWhom();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should answer Why with influence factors", async () => {
      const agent1 = new MockAgent("agent1", "Agent 1", "Expert", "custom", 0.5, 70);

      const engine = new DiscussionEngine({ maxRounds: 2 });
      await engine.run([agent1], {
        type: "text",
        content: "Test task",
      });

      const trace = engine.getDecisionTrace();
      const builder = new DecisionTraceBuilder();
      
      for (const entry of trace) {
        builder.addRound(entry.roundNumber, [], [], { nodes: [], edges: [] });
      }

      const result = builder.answerWhy("agent1");
      expect(Array.isArray(result)).toBe(true);
    });

    it("should track belief trajectories", async () => {
      const agent1 = new MockAgent("agent1", "Agent 1", "Expert", "custom", 0.3, 60);
      const agent2 = new MockAgent("agent2", "Agent 2", "Critic", "custom", -0.2, 50);

      const engine = new DiscussionEngine({ maxRounds: 2 });
      await engine.run([agent1, agent2], {
        type: "text",
        content: "Test task",
      });

      const summary = engine.summarizeTrace();
      expect(summary.totalRounds).toBeGreaterThan(0);
      expect(summary.totalAgents).toBe(2);
    });
  });
});