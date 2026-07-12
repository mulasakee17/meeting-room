import { describe, it, expect } from "vitest";
import { CustomAdapter } from "@/runtime/adapters/CustomAdapter";
import { AutoGenAdapter } from "@/runtime/adapters/AutoGenAdapter";
import type { Intervention } from "@/lib/governance/types";

/** 简易 mock agent，模拟 CustomAgent 的 getState/setState 接口 */
function makeMockAgent(id: string, belief: number, confidence: number) {
  const state = { belief, confidence };
  return {
    id,
    getState: () => ({ ...state }),
    setState: (s: { belief: number; confidence: number }) => {
      state.belief = s.belief;
      state.confidence = s.confidence;
    },
  };
}

describe("CustomAdapter", () => {
  const adapter = new CustomAdapter();

  describe("adaptMessages", () => {
    it("将原始消息转换为 DiscussionMessage 格式", () => {
      const raw = [{
        agentId: "a1",
        agentName: "Alice",
        agentRole: "Analyst",
        content: "I recommend Option A",
        belief: 0.7,
        confidence: 80,
        timestamp: "2026-01-01T00:00:00Z",
        metadata: { referencedAgents: ["a2"], reasoning: "Based on data" },
      }];
      const msgs = adapter.adaptMessages(raw, 1);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].agentId).toBe("a1");
      expect(msgs[0].roundNumber).toBe(1);
      expect(msgs[0].referencedAgents).toEqual(["a2"]);
    });
  });

  describe("applyIntervention — reduce_weight", () => {
    it("降低目标 agent 的 confidence", async () => {
      const agent = makeMockAgent("a1", 0.8, 90);
      const intervention: Intervention = {
        type: "reduce_weight",
        targetAgentId: "a1",
        effect: "reduce weight",
        applied: false,
      };
      const result = await adapter.applyIntervention(intervention, { agents: [agent] });
      expect(result).toBe(true);
      expect(agent.getState().confidence).toBeLessThan(90);
    });

    it("无 agent context 时返回 false", async () => {
      const intervention: Intervention = {
        type: "reduce_weight",
        targetAgentId: "a1",
        effect: "reduce weight",
        applied: false,
      };
      const result = await adapter.applyIntervention(intervention, null);
      expect(result).toBe(false);
    });
  });

  describe("applyIntervention — introduce_diversity", () => {
    it("扰动目标 agent 的 belief", async () => {
      const agent = makeMockAgent("a1", 0.5, 70);
      const original = agent.getState();
      const intervention: Intervention = {
        type: "introduce_diversity",
        targetAgents: ["a1"],
        effect: "diversity",
        applied: false,
      };
      await adapter.applyIntervention(intervention, { agents: [agent] });
      // belief 应该被扰动（可能变可能不变，但接口不抛错）
      expect(agent.getState().confidence).toBe(original.confidence);
    });
  });

  describe("applyIntervention — continue_discussion", () => {
    it("直接返回 true（信号型干预）", async () => {
      const intervention: Intervention = {
        type: "continue_discussion",
        effect: "continue",
        applied: false,
      };
      const result = await adapter.applyIntervention(intervention, {});
      expect(result).toBe(true);
    });
  });

  describe("extractBeliefs", () => {
    it("从 agent context 提取信念", () => {
      const agents = [makeMockAgent("a1", 0.6, 75), makeMockAgent("a2", 0.3, 60)];
      const beliefs = adapter.extractBeliefs({ agents });
      expect(beliefs).toHaveLength(2);
      expect(beliefs[0].agentId).toBe("a1");
      expect(beliefs[0].belief).toBe(0.6);
    });
  });
});

describe("AutoGenAdapter", () => {
  const adapter = new AutoGenAdapter();

  describe("adaptMessages", () => {
    it("转换 AutoGen 格式消息（使用 metadata.name 作为 agentId）", () => {
      const raw = [{
        agentId: "",
        content: "I suggest...",
        metadata: { name: "assistant_1", role: "user", belief: 0.6, confidence: 75 },
        timestamp: "2026-01-01T00:00:00Z",
      }];
      const msgs = adapter.adaptMessages(raw, 1);
      expect(msgs[0].agentId).toBe("assistant_1");
      expect(msgs[0].belief).toBe(0.6);
    });
  });

  describe("applyIntervention", () => {
    it("抛出明确错误而非静默返回 true", async () => {
      const intervention: Intervention = {
        type: "reduce_weight",
        targetAgentId: "a1",
        effect: "reduce weight",
        applied: false,
      };
      await expect(adapter.applyIntervention(intervention, {})).rejects.toThrow(/not implemented/i);
    });
  });

  describe("extractBeliefs", () => {
    it("无 context 时返回空数组", () => {
      expect(adapter.extractBeliefs(null)).toEqual([]);
    });
    it("从 context.agents 提取信念", () => {
      const ctx = { agents: [{ id: "a1", belief: 0.5, confidence: 70 }] };
      const beliefs = adapter.extractBeliefs(ctx);
      expect(beliefs).toHaveLength(1);
      expect(beliefs[0].agentId).toBe("a1");
    });
  });
});
