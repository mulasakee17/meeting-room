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

  // ==========================================================================
  // 社会热力学 F 分解驱动的干预优先级排序
  // ==========================================================================

  it("F 分解排序：极化（结构性主导）时 reduce_weight 排在 force_reflection 前（回测证伪后修正）", () => {
    // 极化双峰信念：structural(1-R)=0.786 > thermal(T·H)=0.390，结构性无序主导（极化）。
    // 经数学验证：R≈0.214, T≈0.932, H≈0.418, F≈1.175。
    // 回测证伪原假设后修正：force_reflection 在极化时有害（Δτ=-0.033），
    // 故修正后 force_reflection 评分 = thermal*(1-structural) = 0.390*0.214 = 0.083（极化时降权），
    // reduce_weight 评分 = thermal = 0.390 → reduce_weight 应排在前面。
    const beliefs: AgentBelief[] = [
      { agentId: "a1", belief: -1.0, confidence: 80, timestamp: new Date().toISOString() },
      { agentId: "a2", belief: -0.9, confidence: 80, timestamp: new Date().toISOString() },
      { agentId: "a3", belief:  0.9, confidence: 80, timestamp: new Date().toISOString() },
      { agentId: "a4", belief:  1.0, confidence: 80, timestamp: new Date().toISOString() },
      { agentId: "a5", belief: -0.95, confidence: 80, timestamp: new Date().toISOString() },
    ];
    const messages = createMockMessagesWithRefs(15, "a3");
    const config: GovernanceConfig = {
      enableEchoChamberDetection: true,
      enableAuthorityBiasDetection: true,
      enablePolarizationDetection: true,
      enablePrematureConsensusDetection: true,
      interventionLevel: "medium",
      currentRound: 2,
      maxRounds: 5,
    };

    const { interventions } = engine.diagnoseAndIntervene(beliefs, messages, agentIds, config);

    // 非守卫断言：必须同时触发两种干预，否则测试失败（避免空过）
    const types = interventions.map(i => i.type);
    expect(types).toContain("force_reflection");
    expect(types).toContain("reduce_weight");
    const rwIdx = types.indexOf("reduce_weight");
    const frIdx = types.indexOf("force_reflection");
    // 极化时 force_reflection 降权 → reduce_weight 应排在前面
    expect(rwIdx).toBeLessThan(frIdx);
  });

  it("F 分解排序：单一干预触发时排序为 no-op（安全性）", () => {
    // 虚假共识信念 [0.8,0.82,0.79,0.81,0.8]：R≈1.0, H≈0, F≈0。
    // mock 消息内容相似度不足以触发 echo chamber（需内容 Jaccard > 阈值），
    // 故 introduce_diversity 不会触发——此测试只验证 no-op 安全性，
    // 不验证 introduce_diversity 优先级（该验证需真实 LLM 消息，留实验室）。
    const beliefs: AgentBelief[] = [
      { agentId: "a1", belief: 0.8, confidence: 90, timestamp: new Date().toISOString() },
      { agentId: "a2", belief: 0.82, confidence: 90, timestamp: new Date().toISOString() },
      { agentId: "a3", belief: 0.79, confidence: 90, timestamp: new Date().toISOString() },
      { agentId: "a4", belief: 0.81, confidence: 90, timestamp: new Date().toISOString() },
      { agentId: "a5", belief: 0.8, confidence: 90, timestamp: new Date().toISOString() },
    ];
    const messages = createMockMessages(10, "a1");
    const config: GovernanceConfig = {
      enableEchoChamberDetection: true,
      enableAuthorityBiasDetection: true,
      enablePolarizationDetection: true,
      enablePrematureConsensusDetection: true,
      interventionLevel: "medium",
      currentRound: 2,
      maxRounds: 5,
      disabledInterventions: [],
    };

    const { interventions } = engine.diagnoseAndIntervene(beliefs, messages, agentIds, config);

    // 单一干预时排序应不改变结果（返回原数组）
    expect(interventions.length).toBeLessThanOrEqual(1);
  });

  // ==========================================================================
  // A3 (MAST) 检测器：FM-2.4 / FM-2.5 / FM-2.6
  // ==========================================================================

  describe("A3 MAST 检测器", () => {
    const a3engine = new GovernanceEngine();

    // ---- FM-2.4 Information Withholding ----

    it("FM-2.4: 检测 agent evidence 为空但他人有 evidence", () => {
      const beliefs: AgentBelief[] = [
        { agentId: "a1", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a2", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a3", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
      ];
      const messages: MessageInfo[] = [
        { agentId: "a1", content: "msg1", timestamp: new Date().toISOString(), evidence: ["e1", "e2"] },
        { agentId: "a2", content: "msg2", timestamp: new Date().toISOString(), evidence: ["e3"] },
        { agentId: "a3", content: "msg3", timestamp: new Date().toISOString(), evidence: [] },
      ];

      const result = a3engine.detectInformationWithholding(beliefs, messages, {
        enableInformationWithholdingDetection: true,
        interventionLevel: "medium",
      });

      expect(result.detected).toBe(true);
      expect(result.withholdingAgents).toEqual(["a3"]);
      expect(result.intervention.type).toBe("force_reflection");
      expect(result.intervention.applied).toBe(true);
    });

    it("FM-2.4: 所有 agent 都有 evidence 时不检测", () => {
      const beliefs: AgentBelief[] = [
        { agentId: "a1", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a2", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
      ];
      const messages: MessageInfo[] = [
        { agentId: "a1", content: "msg1", timestamp: new Date().toISOString(), evidence: ["e1"] },
        { agentId: "a2", content: "msg2", timestamp: new Date().toISOString(), evidence: ["e2"] },
      ];

      const result = a3engine.detectInformationWithholding(beliefs, messages, {
        enableInformationWithholdingDetection: true,
        interventionLevel: "medium",
      });

      expect(result.detected).toBe(false);
      expect(result.withholdingAgents).toEqual([]);
    });

    it("FM-2.4: V1 数据（无 evidence 字段）安全降级为 notDetected", () => {
      const beliefs: AgentBelief[] = [
        { agentId: "a1", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a2", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
      ];
      const messages: MessageInfo[] = [
        { agentId: "a1", content: "msg1", timestamp: new Date().toISOString() },
        { agentId: "a2", content: "msg2", timestamp: new Date().toISOString() },
      ];

      const result = a3engine.detectInformationWithholding(beliefs, messages, {
        enableInformationWithholdingDetection: true,
        interventionLevel: "medium",
      });

      expect(result.detected).toBe(false);
    });

    it("FM-2.4: 禁用检测器时返回 notDetected", () => {
      const beliefs: AgentBelief[] = [
        { agentId: "a1", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a2", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
      ];
      const messages: MessageInfo[] = [
        { agentId: "a1", content: "msg1", timestamp: new Date().toISOString(), evidence: ["e1"] },
        { agentId: "a2", content: "msg2", timestamp: new Date().toISOString(), evidence: [] },
      ];

      const result = a3engine.detectInformationWithholding(beliefs, messages, {
        enableInformationWithholdingDetection: false,
        interventionLevel: "medium",
      });

      expect(result.detected).toBe(false);
    });

    // ---- FM-2.5 Ignored Input ----

    it("FM-2.5: 检测被引用 ≥2 次但未回引的 agent", () => {
      const beliefs: AgentBelief[] = [
        { agentId: "a1", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a2", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a3", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
      ];
      // a2 和 a3 都引用 a1，但 a1 不引用任何人
      const messages: MessageInfo[] = [
        { agentId: "a1", content: "msg1", timestamp: new Date().toISOString(), referencedAgents: [] },
        { agentId: "a2", content: "msg2", timestamp: new Date().toISOString(), referencedAgents: ["a1"] },
        { agentId: "a3", content: "msg3", timestamp: new Date().toISOString(), referencedAgents: ["a1"] },
      ];

      const result = a3engine.detectIgnoredInput(beliefs, messages, {
        enableIgnoredInputDetection: true,
        interventionLevel: "medium",
      });

      expect(result.detected).toBe(true);
      expect(result.ignoringAgents).toEqual(["a1"]);
      expect(result.intervention.type).toBe("force_reflection");
    });

    it("FM-2.5: agent 被引用但自己也引用他人时不检测", () => {
      const beliefs: AgentBelief[] = [
        { agentId: "a1", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a2", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a3", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
      ];
      // a1 被引用但自己也引用 a2 → 不算 ignoring
      const messages: MessageInfo[] = [
        { agentId: "a1", content: "msg1", timestamp: new Date().toISOString(), referencedAgents: ["a2"] },
        { agentId: "a2", content: "msg2", timestamp: new Date().toISOString(), referencedAgents: ["a1"] },
        { agentId: "a3", content: "msg3", timestamp: new Date().toISOString(), referencedAgents: ["a1"] },
      ];

      const result = a3engine.detectIgnoredInput(beliefs, messages, {
        enableIgnoredInputDetection: true,
        interventionLevel: "medium",
      });

      expect(result.detected).toBe(false);
    });

    it("FM-2.5: V1 数据（无 referencedAgents 字段）安全降级", () => {
      const beliefs: AgentBelief[] = [
        { agentId: "a1", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a2", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
      ];
      const messages: MessageInfo[] = [
        { agentId: "a1", content: "msg1", timestamp: new Date().toISOString() },
        { agentId: "a2", content: "msg2", timestamp: new Date().toISOString() },
      ];

      const result = a3engine.detectIgnoredInput(beliefs, messages, {
        enableIgnoredInputDetection: true,
        interventionLevel: "medium",
      });

      expect(result.detected).toBe(false);
    });

    // ---- FM-2.6 Reasoning-Action Mismatch ----

    it("FM-2.6: 检测 rank=1 的 item belief 不是最高且差距 >0.3", () => {
      const beliefs: AgentBelief[] = [
        { agentId: "a1", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a2", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
      ];
      // a1: rank=1 的 item 是 "A" 但 belief=0.2，而 "B" rank=2 但 belief=0.8（差距 0.6 > 0.3）→ mismatch
      const messages: MessageInfo[] = [
        {
          agentId: "a1", content: "msg1", timestamp: new Date().toISOString(),
          itemBeliefs: [
            { item: "A", rank: 1, belief: 0.2, confidence: 70 },
            { item: "B", rank: 2, belief: 0.8, confidence: 70 },
          ],
        },
        {
          agentId: "a2", content: "msg2", timestamp: new Date().toISOString(),
          itemBeliefs: [
            { item: "A", rank: 1, belief: 0.9, confidence: 70 },
            { item: "B", rank: 2, belief: 0.1, confidence: 70 },
          ],
        },
      ];

      const result = a3engine.detectReasoningActionMismatch(beliefs, messages, {
        enableReasoningActionMismatchDetection: true,
        interventionLevel: "medium",
      });

      expect(result.detected).toBe(true);
      expect(result.mismatchAgents).toEqual(["a1"]);
      expect(result.intervention.type).toBe("force_reflection");
    });

    it("FM-2.6: rank 和 belief 一致时不检测", () => {
      const beliefs: AgentBelief[] = [
        { agentId: "a1", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a2", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
      ];
      const messages: MessageInfo[] = [
        {
          agentId: "a1", content: "msg1", timestamp: new Date().toISOString(),
          itemBeliefs: [
            { item: "A", rank: 1, belief: 0.9, confidence: 70 },
            { item: "B", rank: 2, belief: 0.1, confidence: 70 },
          ],
        },
        {
          agentId: "a2", content: "msg2", timestamp: new Date().toISOString(),
          itemBeliefs: [
            { item: "A", rank: 1, belief: 0.8, confidence: 70 },
            { item: "B", rank: 2, belief: 0.2, confidence: 70 },
          ],
        },
      ];

      const result = a3engine.detectReasoningActionMismatch(beliefs, messages, {
        enableReasoningActionMismatchDetection: true,
        interventionLevel: "medium",
      });

      expect(result.detected).toBe(false);
    });

    it("FM-2.6: 差距 ≤0.3 时不检测（避免误报）", () => {
      const beliefs: AgentBelief[] = [
        { agentId: "a1", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
      ];
      // rank=1 belief=0.4，rank=2 belief=0.5，差距 0.1 ≤ 0.3 → 不检测
      const messages: MessageInfo[] = [
        {
          agentId: "a1", content: "msg1", timestamp: new Date().toISOString(),
          itemBeliefs: [
            { item: "A", rank: 1, belief: 0.4, confidence: 70 },
            { item: "B", rank: 2, belief: 0.5, confidence: 70 },
          ],
        },
      ];

      const result = a3engine.detectReasoningActionMismatch(beliefs, messages, {
        enableReasoningActionMismatchDetection: true,
        interventionLevel: "medium",
      });

      expect(result.detected).toBe(false);
    });

    it("FM-2.6: V1 数据（无 itemBeliefs 字段）安全降级", () => {
      const beliefs: AgentBelief[] = [
        { agentId: "a1", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a2", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
      ];
      const messages: MessageInfo[] = [
        { agentId: "a1", content: "msg1", timestamp: new Date().toISOString() },
        { agentId: "a2", content: "msg2", timestamp: new Date().toISOString() },
      ];

      const result = a3engine.detectReasoningActionMismatch(beliefs, messages, {
        enableReasoningActionMismatchDetection: true,
        interventionLevel: "medium",
      });

      expect(result.detected).toBe(false);
    });

    // ---- diagnose() 集成测试 ----

    it("diagnose() 返回的 GovernanceResult 包含 3 个新字段", () => {
      const beliefs: AgentBelief[] = [
        { agentId: "a1", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a2", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a3", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
      ];
      const messages: MessageInfo[] = [
        { agentId: "a1", content: "msg1", timestamp: new Date().toISOString(), evidence: ["e1"], referencedAgents: [] },
        { agentId: "a2", content: "msg2", timestamp: new Date().toISOString(), evidence: ["e2"], referencedAgents: ["a1"] },
        { agentId: "a3", content: "msg3", timestamp: new Date().toISOString(), evidence: [], referencedAgents: ["a1"] },
      ];

      const result = a3engine.diagnose(beliefs, messages, ["a1", "a2", "a3"], {
        enableInformationWithholdingDetection: true,
        enableIgnoredInputDetection: true,
        enableReasoningActionMismatchDetection: true,
        interventionLevel: "none",
      });

      expect(result.informationWithholding).toBeDefined();
      expect(result.ignoredInput).toBeDefined();
      expect(result.reasoningActionMismatch).toBeDefined();
      // a3 evidence 为空，a1/a2 有 → 触发 FM-2.4
      expect(result.informationWithholding.detected).toBe(true);
      expect(result.informationWithholding.withholdingAgents).toContain("a3");
    });

    it("diagnoseAndIntervene() 为 FM-2.4 触发 force_reflection 干预", () => {
      const beliefs: AgentBelief[] = [
        { agentId: "a1", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a2", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
        { agentId: "a3", belief: 0.5, confidence: 80, timestamp: new Date().toISOString() },
      ];
      const messages: MessageInfo[] = [
        { agentId: "a1", content: "msg1", timestamp: new Date().toISOString(), evidence: ["e1"], referencedAgents: [] },
        { agentId: "a2", content: "msg2", timestamp: new Date().toISOString(), evidence: ["e2"], referencedAgents: [] },
        { agentId: "a3", content: "msg3", timestamp: new Date().toISOString(), evidence: [], referencedAgents: [] },
      ];

      const { interventions } = a3engine.diagnoseAndIntervene(beliefs, messages, ["a1", "a2", "a3"], undefined, {
        enableInformationWithholdingDetection: true,
        enableIgnoredInputDetection: true,
        enableReasoningActionMismatchDetection: true,
        interventionLevel: "medium",
        currentRound: 1,
        maxRounds: 3,
        disabledInterventions: ["introduce_diversity", "continue_discussion"],
      });

      const forceReflections = interventions.filter(i => i.type === "force_reflection");
      expect(forceReflections.length).toBeGreaterThan(0);
      // a3 应在 targetAgents 中
      const targets = forceReflections.flatMap(i => i.targetAgents || []);
      expect(targets).toContain("a3");
    });
  });
});