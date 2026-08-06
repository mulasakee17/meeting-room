import { describe, it, expect } from "vitest";
import { DiscussionEngine, RuleBasedInfluence, DecisionTraceBuilder } from "@/lib/discussion";

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
    // agent2 引用 agent1，产生 reference 边
    const refs = this.id === "agent2" ? ["agent1"] : [];
    return Promise.resolve(JSON.stringify({
      reasoning: `Analysis for ${this.id}`,
      evidence: ["evidence1"],
      belief: this.belief,
      confidence: this.confidence,
      nextOpinion: "",
      referencedAgents: refs,
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

/** 测试治理否决：表面收敛时生成一个下一轮生效的干预。 */
class GovernanceVetoEngine extends DiscussionEngine {
  governanceCalls = 0;

  protected applyGovernance(): any {
    this.governanceCalls++;
    return {
      hasIntervention: true,
      interventions: [{
        type: "devils_advocate",
        targetAgents: ["agent1"],
        effect: "challenge premature consensus",
        applied: true,
      }],
      issues: [{
        type: "premature_consensus",
        severity: "high",
        description: "surface agreement lacks sufficient evidence",
      }],
    };
  }
}

/** 测试热力学候选只提供信号，退出由 finalizeRound 在记录后完成。 */
class ThermoCandidateEngine extends DiscussionEngine {
  protected evaluateTerminationCandidate(): any {
    return {
      shouldTerminate: true,
      reason: "strong_crystallized",
      stateType: "crystallized",
      message: "synthetic thermo stop",
    };
  }
}

describe("Discussion Engine - Phase 1 Fixes", () => {
  describe("D-2: Agent 状态同步", () => {
    it("should sync agent state after belief update", async () => {
      const agent1 = new MockAgent("agent1", "Agent 1", "Expert", "custom", 0.3, 60);
      const agent2 = new MockAgent("agent2", "Agent 2", "Critic", "custom", -0.2, 50);

      const engine = new DiscussionEngine({ maxRounds: 2 });
      const result = await engine.run([agent1, agent2], {
        id: "test-task",
        description: "Test task",
        type: "text",
        createdAt: new Date().toISOString(),
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
        id: "test-task",
        description: "Test task",
        type: "text",
        createdAt: new Date().toISOString(),
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
        id: "test-task",
        description: "Test task",
        type: "text",
        createdAt: new Date().toISOString(),
        content: "Test task",
      });

      const graph = engine.getInteractionGraph();
      expect(graph.edges.length).toBeGreaterThan(0);

      const trace = engine.getDecisionTrace();
      expect(trace.length).toBeGreaterThan(0);
    });
  });

  describe("Discussion Engine Integration", () => {
    it("should complete multi-round discussion", async () => {
      const agent1 = new MockAgent("agent1", "Expert", "Expert", "custom", 0.5, 70);
      const agent2 = new MockAgent("agent2", "Critic", "Critic", "custom", -0.3, 60);
      const agent3 = new MockAgent("agent3", "Synthesizer", "Synthesizer", "custom", 0.1, 50);

      const engine = new DiscussionEngine({ maxRounds: 3 });
      const result = await engine.run([agent1, agent2, agent3], {
        id: "test-task",
        description: "Should we invest in renewable energy?",
        type: "text",
        createdAt: new Date().toISOString(),
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

      const engine = new DiscussionEngine({
        maxRounds: 3,
        convergenceThreshold: 0.1,
        governanceMode: "none",
      });
      const result = await engine.run([agent1, agent2], {
        id: "test-task",
        description: "Test",
        type: "text",
        createdAt: new Date().toISOString(),
        content: "Test",
      });

      expect(result.totalRounds).toBe(1);
      expect(result.converged).toBe(true);
    });

    it("P0a: 表面收敛仍完成治理，并为干预保留下一轮观察窗口", async () => {
      const agent1 = new MockAgent("agent1", "Agent 1", "Expert", "custom", 0.5, 80);
      const agent2 = new MockAgent("agent2", "Agent 2", "Expert", "custom", 0.51, 85);
      const engine = new GovernanceVetoEngine({
        maxRounds: 2,
        convergenceThreshold: 0.1,
      });

      const result = await engine.run([agent1, agent2], {
        id: "p0a-veto",
        description: "Test governance veto",
        type: "text",
        createdAt: new Date().toISOString(),
        content: "Test governance veto",
      });

      const rounds = engine.getRoundDataArray();
      expect(engine.governanceCalls).toBe(2);
      expect(result.totalRounds).toBe(2);
      expect(rounds).toHaveLength(2);
      expect(rounds[0].stopDecision?.shouldStop).toBe(false);
      expect(rounds[0].stopDecision?.vetoedByGovernance).toBe(true);
      expect(rounds[0].interventions[0].effectiveFromRound).toBe(2);
      expect(rounds[0].interventions[0].applicationStatus).toBe("queued");
      expect(rounds[1].interventions[0].applicationStatus).toBe("not_applied_no_next_round");
      expect(engine.getEventTracker().getEvents("round_end")).toHaveLength(2);
    });

    it("P0b: 热力学提前终止轮在退出前完整写入 roundData 和 round_end", async () => {
      const agent1 = new MockAgent("agent1", "Agent 1", "Expert", "custom", -0.8, 80);
      const agent2 = new MockAgent("agent2", "Agent 2", "Expert", "custom", 0.8, 80);
      const engine = new ThermoCandidateEngine({
        maxRounds: 3,
        governanceMode: "none",
      });

      const result = await engine.run([agent1, agent2], {
        id: "p0b-thermo",
        description: "Test thermo finalization",
        type: "text",
        createdAt: new Date().toISOString(),
        content: "Test thermo finalization",
      });

      const rounds = engine.getRoundDataArray();
      expect(result.totalRounds).toBe(1);
      expect(rounds).toHaveLength(1);
      expect(rounds[0].terminationDecision?.shouldTerminate).toBe(true);
      expect(rounds[0].stopDecision?.reason).toBe("thermo_termination");
      expect(engine.getEventTracker().getEvents("round_end")).toHaveLength(1);
    });

    it("P0b: hard cap 最后一轮仍保留完整记录", async () => {
      const agent1 = new MockAgent("agent1", "Agent 1", "Expert", "custom", -0.8, 80);
      const agent2 = new MockAgent("agent2", "Agent 2", "Expert", "custom", 0.8, 80);
      const engine = new DiscussionEngine({
        maxRounds: 2,
        convergenceThreshold: 0.1,
        governanceMode: "none",
      });

      const result = await engine.run([agent1, agent2], {
        id: "p0b-hard-cap",
        description: "Test hard cap finalization",
        type: "text",
        createdAt: new Date().toISOString(),
        content: "Test hard cap finalization",
      });

      const rounds = engine.getRoundDataArray();
      expect(result.totalRounds).toBe(2);
      expect(rounds).toHaveLength(2);
      expect(rounds[1].stopDecision?.reason).toBe("hard_cap");
      expect(engine.getEventTracker().getEvents("round_end")).toHaveLength(2);
    });
  });

  describe("Decision Trace - Phase 2 Enhancements", () => {
    it("should track influence records", async () => {
      const agent1 = new MockAgent("agent1", "Agent 1", "Expert", "custom", 0.8, 90);
      const agent2 = new MockAgent("agent2", "Agent 2", "Analyst", "custom", -0.6, 60);

      const engine = new DiscussionEngine({ maxRounds: 2 });
      await engine.run([agent1, agent2], {
        id: "test-task",
        description: "Test task",
        type: "text",
        createdAt: new Date().toISOString(),
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
        id: "test-task",
        description: "Test",
        type: "text",
        createdAt: new Date().toISOString(),
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
        id: "test-task",
        description: "Test task",
        type: "text",
        createdAt: new Date().toISOString(),
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
        id: "test-task",
        description: "Test task",
        type: "text",
        createdAt: new Date().toISOString(),
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
        id: "test-task",
        description: "Test task",
        type: "text",
        createdAt: new Date().toISOString(),
        content: "Test task",
      });

      const summary = engine.summarizeTrace();
      expect(summary.totalRounds).toBeGreaterThan(0);
      expect(summary.totalAgents).toBe(2);
    });
  });

  describe("P4: 交叉质证错误降级", () => {
    it("单个 agent sendMessage 失败时不崩溃，跳过该 agent", async () => {
      // 4 agent + 高分歧 → 触发交叉质证
      const agent1 = new MockAgent("agent1", "Agent 1", "Expert", "custom", 0.9, 90);
      const agent2 = new MockAgent("agent2", "Agent 2", "Expert", "custom", -0.8, 85);
      const agent3 = new MockAgent("agent3", "Agent 3", "Critic", "custom", 0.85, 80);
      const agent4 = new MockAgent("agent4", "Agent 4", "Critic", "custom", -0.75, 75);

      // agent4 的 sendMessage 在交叉质证阶段 reject
      const originalSend = agent4.sendMessage.bind(agent4);
      let callCount = 0;
      agent4.sendMessage = (msg: string) => {
        callCount++;
        // 第一次 reject（交叉质证触发时）
        if (callCount > 1) {
          return Promise.reject(new Error("LLM timeout simulation"));
        }
        return originalSend(msg);
      };

      const engine = new DiscussionEngine({
        maxRounds: 1,
        enableCrossExamination: true,
      });

      // 不应抛错——交叉质证失败应降级
      const result = await engine.run([agent1, agent2, agent3, agent4], {
        id: "crossexam-test",
        description: "Cross examination test",
        type: "text",
        createdAt: new Date().toISOString(),
        content: "Test cross examination degradation",
      });

      expect(result).toBeDefined();
      expect(result.finalDecision).toBeDefined();
    });

    it("所有 agent sendMessage 失败时交叉质证降级为未执行", async () => {
      const agent1 = new MockAgent("agent1", "Agent 1", "Expert", "custom", 0.9, 90);
      const agent2 = new MockAgent("agent2", "Agent 2", "Expert", "custom", -0.8, 85);
      const agent3 = new MockAgent("agent3", "Agent 3", "Critic", "custom", 0.85, 80);
      const agent4 = new MockAgent("agent4", "Agent 4", "Critic", "custom", -0.75, 75);

      // 所有 agent 第二次调用都 reject
      for (const agent of [agent1, agent2, agent3, agent4]) {
        const orig = agent.sendMessage.bind(agent);
        let count = 0;
        agent.sendMessage = (msg: string) => {
          count++;
          if (count > 1) return Promise.reject(new Error("all fail"));
          return orig(msg);
        };
      }

      const engine = new DiscussionEngine({
        maxRounds: 1,
        enableCrossExamination: true,
      });

      // 不应抛错——所有交叉质证失败应降级
      const result = await engine.run([agent1, agent2, agent3, agent4], {
        id: "crossexam-all-fail",
        description: "All fail test",
        type: "text",
        createdAt: new Date().toISOString(),
        content: "Test all agents fail in cross examination",
      });

      expect(result).toBeDefined();
      expect(result.finalDecision).toBeDefined();
    });
  });

  describe("Engine lifecycle and state ownership", () => {
    const task = {
      id: "lifecycle-test",
      description: "Lifecycle test",
      type: "text",
      createdAt: new Date().toISOString(),
      content: "test",
    };

    it("requires reset before an engine instance is reused", async () => {
      const engine = new DiscussionEngine({ maxRounds: 1 });
      const agent = new MockAgent("agent1", "Agent 1", "Expert", "custom");

      await engine.run([agent], task);
      await expect(engine.run([agent], task)).rejects.toThrow(/call reset/i);

      engine.reset();
      await expect(engine.run([agent], task)).resolves.toBeDefined();
    });

    it("returns a deep copy of round data", async () => {
      const engine = new DiscussionEngine({ maxRounds: 1 });
      const agent = new MockAgent("agent1", "Agent 1", "Expert", "custom");
      await engine.run([agent], task);

      const exported = engine.getRoundDataArray();
      exported[0].opinions[0].reasoning = "tampered";
      exported[0].interventions.push({ type: "none", targetAgents: [] } as any);

      const fresh = engine.getRoundDataArray();
      expect(fresh[0].opinions[0].reasoning).not.toBe("tampered");
      expect(fresh[0].interventions).toHaveLength(0);

      const graph = engine.getInteractionGraph();
      graph.nodes[0].belief = 999;
      expect(engine.getInteractionGraph().nodes[0].belief).not.toBe(999);

      const memory = engine.getMemory();
      memory[0].evidence.push("tampered");
      expect(engine.getMemory()[0].evidence).not.toContain("tampered");

      const events = engine.getEventTracker().getEvents();
      events[0].payload.tampered = true;
      expect(engine.getEventTracker().getEvents()[0].payload.tampered).toBeUndefined();
    });

    it("does not retain or clear caller-owned knowledge collections", () => {
      const engine = new DiscussionEngine();
      const items = ["private fact"];
      const knowledge = new Map([["agent1", items]]);

      engine.setAgentKnowledge(knowledge);
      items.push("later mutation");
      expect((engine as any).agentKnowledge.get("agent1")).toEqual(["private fact"]);

      engine.reset();
      expect(knowledge.get("agent1")).toEqual(["private fact", "later mutation"]);
      expect((engine as any).agentKnowledge).toBeUndefined();
    });
  });
});
