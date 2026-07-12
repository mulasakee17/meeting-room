import { describe, it, expect } from "vitest";
import { GovernanceEngine, AgentBelief, MessageInfo, GovernanceConfig } from "@/lib/governance";

describe("GovernanceEngine", () => {
  const engine = new GovernanceEngine();

  const createMockBeliefs = (count: number, belief: number = 0.5): AgentBelief[] => {
    return Array.from({ length: count }, (_, i) => ({
      agentId: `agent_${i}`,
      belief,
      confidence: 70 + (i * 7) % 25,  // deterministic: 70, 77, 84, 91, 73, ...
      timestamp: new Date().toISOString(),
    }));
  };

  const createMockMessages = (count: number, dominantAgent?: string): MessageInfo[] => {
    const messages: MessageInfo[] = [];
    for (let i = 0; i < count; i++) {
      const agentId = dominantAgent && i < count * 0.6 ? dominantAgent : `agent_${i % 5}`;
      messages.push({
        agentId,
        content: `Message ${i} from ${agentId}`,
        timestamp: new Date().toISOString(),
      });
    }
    return messages;
  };

  /** 创建带引用网络的 mock 消息——其他 agent 引用 dominantAgent */
  const createMockMessagesWithRefs = (count: number, dominantAgent?: string): MessageInfo[] => {
    const messages: MessageInfo[] = [];
    const agents = ["agent_0", "agent_1", "agent_2", "agent_3", "agent_4"];
    for (let i = 0; i < count; i++) {
      const agentId = `agent_${i % 5}`;
      // 60% 的消息引用 dominantAgent，模拟权威偏差
      const refs = dominantAgent && i < count * 0.6 && agentId !== dominantAgent
        ? [dominantAgent]
        : [];
      messages.push({
        agentId,
        content: `Message ${i} from ${agentId} ${"x".repeat(20 + i * 5)}`,
        timestamp: new Date().toISOString(),
        referencedAgents: refs,
      });
    }
    return messages;
  };

  const agentIds = ["agent_0", "agent_1", "agent_2", "agent_3", "agent_4"];

  it("should detect echo chamber with highly similar beliefs", () => {
    const beliefs = createMockBeliefs(5, 0.85);
    const messages = createMockMessages(10);
    
    const result = engine.detectEchoChamber(beliefs, messages, {
      enableEchoChamberDetection: true,
      echoChamberThreshold: 0.7,
      interventionLevel: "medium",
    });
    
    expect(result.detected).toBe(true);
    expect(result.severity).toBeOneOf(["low", "medium", "high"]);
    expect(result.infoRedundancyScore).toBeGreaterThan(0.6);
  });

  it("should have proper echo chamber detection logic", () => {
    const beliefs = [
      ...createMockBeliefs(2, 0.2),
      ...createMockBeliefs(2, 0.8),
      ...createMockBeliefs(1, 0.5),
    ];
    const messages = createMockMessages(10);
    
    const result = engine.detectEchoChamber(beliefs, messages, {
      enableEchoChamberDetection: true,
      echoChamberThreshold: 0.7,
      interventionLevel: "none",
    });
    
    expect(result.infoRedundancyScore).toBeDefined();
    expect(result.redundantAgents).toBeDefined();
  });

  it("should detect authority bias with dominant agent", () => {
    const beliefs = createMockBeliefs(5, 0.5);
    // 用引用网络模拟：其他 agent 引用 agent_0 → agent_0 是权威
    const messages = createMockMessagesWithRefs(10, "agent_0");

    const result = engine.detectAuthorityBias(beliefs, messages, {
      enableAuthorityBiasDetection: true,
      authorityBiasThreshold: 0.4,
      interventionLevel: "medium",
    });

    expect(result.detected).toBe(true);
    expect(result.dominantAgent).toBe("agent_0");
    expect(result.influenceRatio).toBeGreaterThan(0.4);
  });

  it("should not detect authority bias with balanced contributions", () => {
    const beliefs = createMockBeliefs(5, 0.5);
    // 无引用数据，均匀内容长度 → 不应触发
    const messages = createMockMessagesWithRefs(10);

    const result = engine.detectAuthorityBias(beliefs, messages, {
      enableAuthorityBiasDetection: true,
      authorityBiasThreshold: 0.4,
      interventionLevel: "none",
    });

    expect(result.detected).toBe(false);
    expect(result.intervention.applied).toBe(false);
  });

  it("should have proper polarization detection logic", () => {
    const beliefs = [
      ...createMockBeliefs(3, 0.15),
      ...createMockBeliefs(3, 0.85),
    ];
    
    const result = engine.detectPolarization(beliefs, {
      enablePolarizationDetection: true,
      polarizationThreshold: 0.5,
      interventionLevel: "medium",
    });
    
    expect(result.polarizationIndex).toBeGreaterThan(0.3);
    expect(result.groups.length).toBeGreaterThanOrEqual(2);
  });

  it("should not detect polarization with moderate beliefs", () => {
    const beliefs = createMockBeliefs(6, 0.5);
    
    const result = engine.detectPolarization(beliefs, {
      enablePolarizationDetection: true,
      polarizationThreshold: 0.5,
      interventionLevel: "none",
    });
    
    expect(result.detected).toBe(false);
    expect(result.intervention.applied).toBe(false);
  });

  it("should apply light intervention for echo chamber", () => {
    const beliefs = createMockBeliefs(5, 0.9);
    const messages = createMockMessages(10);
    
    const result = engine.detectEchoChamber(beliefs, messages, {
      enableEchoChamberDetection: true,
      echoChamberThreshold: 0.7,
      interventionLevel: "light",
    });
    
    expect(result.intervention.applied).toBe(true);
    expect(result.intervention.type).toBe("introduce_diversity");
  });

  it("should apply medium intervention for authority bias", () => {
    const beliefs = createMockBeliefs(5, 0.5);
    const messages = createMockMessagesWithRefs(10, "agent_0");

    const result = engine.detectAuthorityBias(beliefs, messages, {
      enableAuthorityBiasDetection: true,
      authorityBiasThreshold: 0.4,
      interventionLevel: "medium",
    });

    expect(result.intervention.applied).toBe(true);
    expect(result.intervention.type).toBe("reduce_weight");
  });

  it("should cluster agents by belief into groups", () => {
    const beliefs = [
      { agentId: "agent_0", belief: 0.1, confidence: 80, timestamp: new Date().toISOString() },
      { agentId: "agent_1", belief: 0.2, confidence: 80, timestamp: new Date().toISOString() },
      { agentId: "agent_2", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
      { agentId: "agent_3", belief: 0.8, confidence: 80, timestamp: new Date().toISOString() },
      { agentId: "agent_4", belief: 0.9, confidence: 80, timestamp: new Date().toISOString() },
    ];
    
    const result = engine.detectPolarization(beliefs, {
      enablePolarizationDetection: true,
      polarizationThreshold: 0.3,
      interventionLevel: "none",
    });
    
    expect(result.groups.length).toBeGreaterThanOrEqual(2);
    const labels = result.groups.map(g => g.label);
    expect(labels).toContain("positive");
    expect(labels).toContain("negative");
  });

  it("should generate summary with no interventions", () => {
    const beliefs = createMockBeliefs(5, 0.5);
    const messages = createMockMessages(10);
    
    const result = engine.diagnose(beliefs, messages, agentIds, {
      interventionLevel: "none",
    });
    
    expect(result.interventionCount).toBe(0);
  });

  it("should generate summary with multiple issues", () => {
    const beliefs = [
      ...createMockBeliefs(3, 0.9),
      ...createMockBeliefs(2, 0.9),
    ];
    const messages = createMockMessages(10, "agent_0");
    
    const result = engine.diagnose(beliefs, messages, agentIds);
    
    expect(result.summary).toContain("issue");
    expect(result.otherIssues.length).toBeGreaterThan(0);
  });

  it("should handle small agent counts gracefully", () => {
    const beliefs = createMockBeliefs(2, 0.5);
    const messages = createMockMessages(2);
    
    const result = engine.diagnose(beliefs, messages, ["agent_0", "agent_1"]);
    
    expect(result.echoChamber.detected).toBe(false);
    expect(result.polarization.detected).toBe(false);
  });
});