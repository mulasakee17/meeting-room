/**
 * v6 δ 诊断层 + ProgressiveEstimator 单元测试
 *
 * 覆盖:
 * 1. ProgressiveEstimator — estimateInertia / estimateConfidence / estimateSusceptibility
 * 2. computeDelta — 6 个 δ 指标
 * 3. 自适应阈值 — 低置信度 → 更保守
 * 4. 置信度感知干预降级 — generateCognitiveInterventions + progressiveEstimates
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  estimateInertia,
  estimateConfidence,
  estimateSusceptibility,
  estimateAll,
  detectBehaviorEvents,
  createInitialBehaviorEvents,
  type ProgressiveEstimates,
} from "@/lib/thermodynamics/ProgressiveEstimator";
import {
  computeDeltaPolarization,
  computeDelta1DMask,
  computeDeltaEvidenceSilence,
  computeDeltaConfidenceGap,
  computeDeltaStanceFlip,
  computeDeltaNoResponse,
  computeDeltaConcentration,
  computeDeltaConsistency,
  computeDeltaDiagnosis,
  type DeltaDiagnosis,
  type DeltaConfig,
} from "@/lib/thermodynamics/computeDelta";
import type { AgentCognitiveState, BehaviorEvents } from "@/lib/agent/cognitiveState";
import { MeasurementLayer } from "@/lib/thermodynamics/MeasurementLayer";
import type { ThermoState } from "@/lib/thermodynamics/MeasurementLayer";

// ============================================================================
// Mock AgentCognitiveState 工厂
// ============================================================================

function makeBehaviorEvents(overrides?: Partial<BehaviorEvents>): BehaviorEvents {
  return {
    timesRefuted: 0,
    timesChangedAfterRefutation: 0,
    spontaneousFlips: 0,
    timesExposed: 0,
    timesRespondedAfterExposure: 0,
    ...overrides,
  };
}

function makeCognitiveState(
  agentId: string,
  overrides?: Partial<AgentCognitiveState> & {
    utilityScores?: Record<string, number>;
    utilityTopChoice?: string;
    utilityHistory?: Array<{ round: number; scores: Record<string, number> }>;
    evidenceItems?: any[];
    inertiaEstimate?: number;
    inertiaConfidence?: number;
    confidenceStated?: number;
    confidenceOverall?: number;
    behaviorEvents?: Partial<BehaviorEvents>;
    statedOpenness?: number;
  },
): AgentCognitiveState {
  const scores = overrides?.utilityScores ?? { A: 0.6, B: 0.3, C: 0.1 };
  return {
    agentId,
    agentName: `Agent_${agentId}`,
    agentRole: overrides?.agentRole ?? "analyst",
    utility: {
      scores,
      topChoice: overrides?.utilityTopChoice ?? Object.keys(scores)[0],
      preferenceClarity: 0.5,
      intensity: 0.6,
    },
    evidence: {
      items: overrides?.evidenceItems ?? [],
      coverage: 0.5,
      quality: 0.6,
      diversity: 0.4,
      recentGain: 0,
    },
    inertia: {
      estimate: overrides?.inertiaEstimate ?? 0.5,
      confidence: overrides?.inertiaConfidence ?? 0.3,
      sourceWeights: { stated: 0.5, rolePrior: 0.5, behavioral: 0 },
      strength: 0.5,
      source: { evidenceBased: 0, expressionBased: 0, roleBased: 0.5 },
      recentRefutations: 0,
    },
    confidence: {
      estimate: overrides?.confidenceStated ?? 0.6,
      confidence: 0.3,
      stated: overrides?.confidenceStated ?? 0.6,
      stability: 0.5,
      sourceWeights: { stated: 1.0, stability: 0 },
      overall: overrides?.confidenceOverall ?? 0.6,
      evidenceBased: 0.5,
      stabilityBased: 0.5,
    },
    susceptibility: {
      estimate: 0.5,
      confidence: 0.05,
      usable: false,
    },
    behaviorEvents: makeBehaviorEvents(overrides?.behaviorEvents),
    spokeThisRound: true,
    utilityHistory: overrides?.utilityHistory ?? [
      { round: 1, scores },
    ],
    statedOpenness: overrides?.statedOpenness,
  };
}

// ============================================================================
// 1. ProgressiveEstimator
// ============================================================================

describe("ProgressiveEstimator", () => {
  describe("estimateInertia", () => {
    it("无行为事件时由 statedOpenness + 角色先验主导（置信度 0.10）", () => {
      const cs = makeCognitiveState("a1", { statedOpenness: 0.3 });
      const result = estimateInertia(cs, 1);
      expect(result.estimate).toBeGreaterThan(0);
      expect(result.estimate).toBeLessThan(1);
      expect(result.confidence).toBeCloseTo(0.10, 1);
      expect(result.sourceWeights.behavioral).toBe(0);
    });

    it("statedOpenness=0.8 → 低惯性", () => {
      const cs = makeCognitiveState("a1", { statedOpenness: 0.8 });
      const result = estimateInertia(cs, 1);
      expect(result.estimate).toBeLessThan(0.5);
    });

    it("expert 角色 → 更高惯性", () => {
      const expert = makeCognitiveState("a1", { agentRole: "expert", statedOpenness: 0.5 });
      const novice = makeCognitiveState("a2", { agentRole: "novice", statedOpenness: 0.5 });
      const expertResult = estimateInertia(expert, 1);
      const noviceResult = estimateInertia(novice, 1);
      expect(expertResult.estimate).toBeGreaterThan(noviceResult.estimate);
    });

    it("被反驳后未改变立场 → 高惯性行为信号", () => {
      const cs = makeCognitiveState("a1", {
        statedOpenness: 0.5,
        behaviorEvents: { timesRefuted: 5, timesChangedAfterRefutation: 0, spontaneousFlips: 0, timesExposed: 0, timesRespondedAfterExposure: 0 },
      });
      const result = estimateInertia(cs, 5);
      expect(result.behavioralRatio).toBeGreaterThan(0.5);
      expect(result.confidence).toBeGreaterThan(0.10);
      expect(result.sourceWeights.behavioral).toBeGreaterThan(0);
    });

    it("被反驳后改变立场 → 低惯性行为信号", () => {
      const cs = makeCognitiveState("a1", {
        statedOpenness: 0.5,
        behaviorEvents: { timesRefuted: 5, timesChangedAfterRefutation: 5, spontaneousFlips: 0, timesExposed: 0, timesRespondedAfterExposure: 0 },
      });
      const result = estimateInertia(cs, 5);
      expect(result.behavioralRatio).toBe(0);
    });

    it("自发翻转 → 低惯性方向", () => {
      const cs = makeCognitiveState("a1", {
        statedOpenness: 0.5,
        behaviorEvents: { spontaneousFlips: 3, timesRefuted: 0, timesChangedAfterRefutation: 0, timesExposed: 0, timesRespondedAfterExposure: 0 },
      });
      const result = estimateInertia(cs, 3);
      // 所有事件都是低惯性信号
      expect(result.behavioralRatio).toBe(0);
    });

    it("事件越多置信度越高（上限 0.90）", () => {
      const cs = makeCognitiveState("a1", {
        behaviorEvents: { timesRefuted: 20, timesChangedAfterRefutation: 10, spontaneousFlips: 0, timesExposed: 0, timesRespondedAfterExposure: 0 },
      });
      const result = estimateInertia(cs, 20);
      expect(result.confidence).toBeCloseTo(0.90, 1);
    });
  });

  describe("estimateConfidence", () => {
    it("Round 1: 100% 自报", () => {
      const cs = makeCognitiveState("a1", { confidenceStated: 0.7 });
      const result = estimateConfidence(cs, 1);
      expect(result.sourceWeights.stated).toBe(1.0);
      expect(result.estimate).toBeCloseTo(0.7, 1);
    });

    it("Round 5+: 行为稳定性权重增加", () => {
      const cs = makeCognitiveState("a1", {
        confidenceStated: 0.7,
        utilityHistory: [
          { round: 3, scores: { A: 0.5, B: 0.3 } },
          { round: 4, scores: { A: 0.5, B: 0.3 } },
          { round: 5, scores: { A: 0.5, B: 0.3 } },
        ],
      });
      const result = estimateConfidence(cs, 5);
      expect(result.sourceWeights.stated).toBeLessThan(1.0);
    });

    it("stated 为 undefined 时 fallback 到 overall", () => {
      // 直接构造 AgentCognitiveState，确保 stated 字段为 undefined
      const cs: AgentCognitiveState = {
        ...makeCognitiveState("a1"),
        confidence: {
          estimate: 0.5,
          confidence: 0.3,
          stated: undefined as any,
          stability: 0.5,
          sourceWeights: { stated: 1.0, stability: 0 },
          overall: 0.5,
          evidenceBased: 0.5,
          stabilityBased: 0.5,
        },
      };
      const result = estimateConfidence(cs, 1);
      expect(result.estimate).toBeCloseTo(0.5, 1);
    });

    it("稳定性高 → C 高", () => {
      const cs = makeCognitiveState("a1", {
        confidenceStated: 0.5,
        utilityHistory: [
          { round: 1, scores: { A: 0.5, B: 0.3 } },
          { round: 2, scores: { A: 0.5, B: 0.3 } },
          { round: 3, scores: { A: 0.5, B: 0.3 } },
        ],
      });
      const result = estimateConfidence(cs, 3);
      expect(result.estimate).toBeGreaterThan(0.5);
    });

    it("β 边界保护：round<2 且 stabilityAvailable 时 β ≤ 1.0", () => {
      // 异常调用场景：history 已有 3 条（stabilityAvailable=true）但 round=1
      // 修复前 β = max(0.3, 1.0 - (1-2)*0.12) = 1.12 > 1.0，违反加权平均语义
      // 修复后 β = min(1.0, max(0.3, 1.12)) = 1.0
      const cs = makeCognitiveState("a1", {
        confidenceStated: 1.0,
        utilityHistory: [
          { round: 1, scores: { A: 0.5, B: 0.3 } },
          { round: 2, scores: { A: 0.5, B: 0.3 } },
          { round: 3, scores: { A: 0.5, B: 0.3 } },
        ],
      });
      const result = estimateConfidence(cs, 1);
      expect(result.sourceWeights.stated).toBeLessThanOrEqual(1.0);
      expect(result.estimate).toBeLessThanOrEqual(1.0);
      expect(result.estimate).toBeGreaterThanOrEqual(0);
    });
  });

  describe("estimateSusceptibility", () => {
    it("暴露事件 < 2 → 不可用", () => {
      const cs = makeCognitiveState("a1", {
        behaviorEvents: { timesExposed: 1, timesRespondedAfterExposure: 1, timesRefuted: 0, timesChangedAfterRefutation: 0, spontaneousFlips: 0 },
      });
      const result = estimateSusceptibility(cs);
      expect(result.usable).toBe(false);
    });

    it("暴露事件 ≥ 2 → 可用", () => {
      const cs = makeCognitiveState("a1", {
        behaviorEvents: { timesExposed: 3, timesRespondedAfterExposure: 2, timesRefuted: 0, timesChangedAfterRefutation: 0, spontaneousFlips: 0 },
      });
      const result = estimateSusceptibility(cs);
      expect(result.usable).toBe(true);
      expect(result.estimate).toBeCloseTo(2 / 3, 1);
    });

    it("从未响应 → Λ≈0.05", () => {
      const cs = makeCognitiveState("a1", {
        behaviorEvents: { timesExposed: 3, timesRespondedAfterExposure: 0, timesRefuted: 0, timesChangedAfterRefutation: 0, spontaneousFlips: 0 },
      });
      const result = estimateSusceptibility(cs);
      expect(result.estimate).toBeCloseTo(0.05, 1);
    });
  });

  describe("estimateAll", () => {
    it("返回所有 agent 的完整估计", () => {
      const states = new Map<string, AgentCognitiveState>();
      states.set("a1", makeCognitiveState("a1", { statedOpenness: 0.5 }));
      states.set("a2", makeCognitiveState("a2", { statedOpenness: 0.3 }));
      const results = estimateAll(states, 2);
      expect(results.size).toBe(2);
      for (const [, est] of results) {
        expect(est.inertia).toBeDefined();
        expect(est.confidence).toBeDefined();
        expect(est.susceptibility).toBeDefined();
        expect(est.inertia.estimate).toBeGreaterThanOrEqual(0.05);
        expect(est.inertia.estimate).toBeLessThanOrEqual(0.95);
      }
    });
  });

  describe("detectBehaviorEvents", () => {
    it("防御性初始化：旧 cognitive state 无 behaviorEvents 不崩溃", () => {
      const cs = makeCognitiveState("a1");
      (cs as any).behaviorEvents = undefined;
      const states = new Map<string, AgentCognitiveState>();
      states.set("a1", cs);
      const refutationMap = new Map<string, boolean>();
      const interventionTargets = new Map<string, boolean>();
      expect(() => detectBehaviorEvents(states, 1, refutationMap, interventionTargets)).not.toThrow();
      expect(cs.behaviorEvents).toBeDefined();
    });

    it("被反驳 + 改变立场 → timesRefuted++ & timesChangedAfterRefutation++", () => {
      const cs = makeCognitiveState("a1", {
        utilityHistory: [
          { round: 1, scores: { A: 0.6, B: 0.3 } },
          { round: 2, scores: { A: 0.3, B: 0.6 } },
        ],
      });
      const states = new Map<string, AgentCognitiveState>();
      states.set("a1", cs);
      const refutationMap = new Map([["a1", true]]);
      const interventionTargets = new Map<string, boolean>();
      detectBehaviorEvents(states, 2, refutationMap, interventionTargets);
      expect(cs.behaviorEvents.timesRefuted).toBe(1);
      expect(cs.behaviorEvents.timesChangedAfterRefutation).toBe(1);
    });

    it("被反驳但未改变立场 → timesRefuted++ 但 unchanged", () => {
      const cs = makeCognitiveState("a1", {
        utilityHistory: [
          { round: 1, scores: { A: 0.6, B: 0.3 } },
          { round: 2, scores: { A: 0.6, B: 0.3 } },
        ],
      });
      const states = new Map<string, AgentCognitiveState>();
      states.set("a1", cs);
      const refutationMap = new Map([["a1", true]]);
      const interventionTargets = new Map<string, boolean>();
      detectBehaviorEvents(states, 2, refutationMap, interventionTargets);
      expect(cs.behaviorEvents.timesRefuted).toBe(1);
      expect(cs.behaviorEvents.timesChangedAfterRefutation).toBe(0);
    });

    it("暴露于干预 + 响应 → timesExposed++ & timesRespondedAfterExposure++", () => {
      const cs = makeCognitiveState("a1", {
        utilityHistory: [
          { round: 1, scores: { A: 0.6, B: 0.3 } },
          { round: 2, scores: { A: 0.3, B: 0.6 } },
        ],
      });
      const states = new Map<string, AgentCognitiveState>();
      states.set("a1", cs);
      const refutationMap = new Map<string, boolean>();
      const interventionTargets = new Map([["a1", true]]);
      detectBehaviorEvents(states, 2, refutationMap, interventionTargets);
      expect(cs.behaviorEvents.timesExposed).toBe(1);
      expect(cs.behaviorEvents.timesRespondedAfterExposure).toBe(1);
    });
  });
});

// ============================================================================
// 2. computeDelta — 6 个 δ 指标
// ============================================================================

describe("computeDelta", () => {
  const emptyEstimates = new Map<string, ProgressiveEstimates>();
  const boilerplateThermo: ThermoState = { R: 0.5, T: 0.3, H: 0.4, F: 0.6 };

  describe("δ_polarization", () => {
    it("agent 不足 → 不触发", () => {
      const result = computeDeltaPolarization([]);
      expect(result.triggered).toBe(false);
    });

    it("U 向量完全一致 → 不触发", () => {
      const states = [
        makeCognitiveState("a1", { utilityScores: { A: 0.5, B: 0.5 } }),
        makeCognitiveState("a2", { utilityScores: { A: 0.5, B: 0.5 } }),
      ];
      const result = computeDeltaPolarization(states);
      expect(result.triggered).toBe(false);
      expect(result.value).toBeCloseTo(0, 1);
    });

    it("U 向量完全相反 → 触发", () => {
      const states = [
        makeCognitiveState("a1", { utilityScores: { A: 1, B: 0 } }),
        makeCognitiveState("a2", { utilityScores: { A: 0, B: 1 } }),
      ];
      const result = computeDeltaPolarization(states, { polarizationThreshold: 0.10 });
      expect(result.triggered).toBe(true);
      expect(result.value).toBeGreaterThan(0.5);
    });

    it("阈值可配置", () => {
      const states = [
        makeCognitiveState("a1", { utilityScores: { A: 0.6, B: 0.4 } }),
        makeCognitiveState("a2", { utilityScores: { A: 0.4, B: 0.6 } }),
      ];
      const strict = computeDeltaPolarization(states, { polarizationThreshold: 0.99 });
      expect(strict.triggered).toBe(false);
    });
  });

  describe("δ_1d_mask", () => {
    it("R 高 + U 向量分歧大 → 触发", () => {
      const states = [
        makeCognitiveState("a1", { utilityScores: { A: 1, B: 0 } }),
        makeCognitiveState("a2", { utilityScores: { A: 0, B: 1 } }),
      ];
      const thermo: ThermoState = { R: 0.9, T: 0.3, H: 0.4, F: 0.6 };
      const result = computeDelta1DMask(states, thermo, { oneDMaskThreshold: 0.20 });
      expect(result.triggered).toBe(true);
    });

    it("R 低 → 不触发", () => {
      const states = [
        makeCognitiveState("a1", { utilityScores: { A: 1, B: 0 } }),
        makeCognitiveState("a2", { utilityScores: { A: 0, B: 1 } }),
      ];
      const thermo: ThermoState = { R: 0.1, T: 0.3, H: 0.4, F: 0.6 };
      const result = computeDelta1DMask(states, thermo);
      expect(result.triggered).toBe(false);
    });
  });

  describe("δ_evidence_silence", () => {
    it("无共享证据 → 不触发", () => {
      const states = [
        makeCognitiveState("a1"),
        makeCognitiveState("a2"),
      ];
      const result = computeDeltaEvidenceSilence(states);
      expect(result.triggered).toBe(false);
    });

    it("有 agent 证据被系统性忽视 → 触发", () => {
      const states = [
        makeCognitiveState("a1", {
          evidenceItems: [
            { id: "e1", content: "test", shared: true, sharedCount: 3, roundIntroduced: 1 },
            { id: "e2", content: "test", shared: true, sharedCount: 3, roundIntroduced: 1 },
            { id: "e3", content: "test", shared: true, sharedCount: 3, roundIntroduced: 1 },
          ],
        }),
        makeCognitiveState("a2", {
          evidenceItems: [
            { id: "e4", content: "test", shared: false, sharedCount: 0, roundIntroduced: 1 },
          ],
        }),
      ];
      const result = computeDeltaEvidenceSilence(states, { evidenceSilenceThreshold: 0.90 });
      // a2 shared=0, a1 shared=3, mean=1.5, min=0, value=0 → triggered
      expect(result.triggered).toBe(true);
      expect(result.silencedAgents).toContain("Agent_a2");
    });
  });

  describe("δ_confidence_gap", () => {
    it("所有人信心一致 → 不触发", () => {
      const states = [
        makeCognitiveState("a1", { confidenceStated: 0.5, utilityScores: { A: 0.5, B: 0.5 } }),
        makeCognitiveState("a2", { confidenceStated: 0.5, utilityScores: { A: 0.5, B: 0.5 } }),
      ];
      const result = computeDeltaConfidenceGap(states);
      expect(result.triggered).toBe(false);
    });

    it("高信心 + 偏离群体 → 触发", () => {
      const states = [
        makeCognitiveState("a1", { confidenceStated: 0.9, utilityScores: { A: 1, B: 0, C: 0 } }),
        makeCognitiveState("a2", { confidenceStated: 0.5, utilityScores: { A: 0, B: 1, C: 0 } }),
        makeCognitiveState("a3", { confidenceStated: 0.5, utilityScores: { A: 0, B: 1, C: 0 } }),
      ];
      const result = computeDeltaConfidenceGap(states);
      expect(result.triggered).toBe(true);
      expect(result.overconfidentAgents).toContain("Agent_a1");
    });
  });

  describe("δ_stance_flip", () => {
    it("无历史 → 不触发", () => {
      const cs = makeCognitiveState("a1", { utilityHistory: [{ round: 1, scores: { A: 0.6, B: 0.3 } }] });
      const result = computeDeltaStanceFlip([cs]);
      expect(result.triggered).toBe(false);
    });

    it("≥2 人同时翻转 → 触发", () => {
      const states = [
        makeCognitiveState("a1", {
          utilityHistory: [
            { round: 1, scores: { A: 0.6, B: 0.3 } },
            { round: 2, scores: { A: 0.3, B: 0.6 } },
          ],
        }),
        makeCognitiveState("a2", {
          utilityHistory: [
            { round: 1, scores: { A: 0.3, B: 0.6 } },
            { round: 2, scores: { A: 0.6, B: 0.3 } },
          ],
        }),
      ];
      const result = computeDeltaStanceFlip(states);
      expect(result.triggered).toBe(true);
      expect(result.flippedAgents.length).toBe(2);
    });

    it("单人翻转 → 不触发", () => {
      const states = [
        makeCognitiveState("a1", {
          utilityHistory: [
            { round: 1, scores: { A: 0.6, B: 0.3 } },
            { round: 2, scores: { A: 0.3, B: 0.6 } },
          ],
        }),
        makeCognitiveState("a2", {
          utilityHistory: [
            { round: 1, scores: { A: 0.6, B: 0.3 } },
            { round: 2, scores: { A: 0.6, B: 0.3 } },
          ],
        }),
      ];
      const result = computeDeltaStanceFlip(states);
      expect(result.triggered).toBe(false);
    });
  });

  describe("δ_no_response", () => {
    it("暴露过但从未响应 → 触发（susceptibility 可用）", () => {
      const states = [
        makeCognitiveState("a1", {
          behaviorEvents: { timesExposed: 2, timesRespondedAfterExposure: 0, timesRefuted: 0, timesChangedAfterRefutation: 0, spontaneousFlips: 0 },
        }),
      ];
      // v6: 需要提供 usable 的 susceptibility 估计作为门控
      const estimates = new Map<string, ProgressiveEstimates>([
        ["a1", {
          inertia: { estimate: 0.5, confidence: 0.5, sourceWeights: { stated: 0.5, rolePrior: 0.5, behavioral: 0 }, behavioralRatio: 0.5 },
          confidence: { estimate: 0.5, confidence: 0.5, sourceWeights: { stated: 0.5, stability: 0.5 } },
          susceptibility: { estimate: 0.5, confidence: 0.5, usable: true },
        }],
      ]);
      const result = computeDeltaNoResponse(states, estimates);
      expect(result.triggered).toBe(true);
      expect(result.unresponsiveAgents).toContain("Agent_a1");
    });

    it("暴露过但 susceptibility 不可用 → 不触发（门控）", () => {
      const states = [
        makeCognitiveState("a1", {
          behaviorEvents: { timesExposed: 1, timesRespondedAfterExposure: 0, timesRefuted: 0, timesChangedAfterRefutation: 0, spontaneousFlips: 0 },
        }),
      ];
      // susceptibility 不可用（暴露事件不足）→ 门控拦截
      const estimates = new Map<string, ProgressiveEstimates>([
        ["a1", {
          inertia: { estimate: 0.5, confidence: 0.3, sourceWeights: { stated: 0.5, rolePrior: 0.5, behavioral: 0 }, behavioralRatio: 0.5 },
          confidence: { estimate: 0.5, confidence: 0.3, sourceWeights: { stated: 0.5, stability: 0.5 } },
          susceptibility: { estimate: 0.5, confidence: 0.1, usable: false },
        }],
      ]);
      const result = computeDeltaNoResponse(states, estimates);
      expect(result.triggered).toBe(false);
    });

    it("暴露过且响应过 → 不触发", () => {
      const states = [
        makeCognitiveState("a1", {
          behaviorEvents: { timesExposed: 2, timesRespondedAfterExposure: 2, timesRefuted: 0, timesChangedAfterRefutation: 0, spontaneousFlips: 0 },
        }),
      ];
      const estimates = new Map<string, ProgressiveEstimates>([
        ["a1", {
          inertia: { estimate: 0.5, confidence: 0.5, sourceWeights: { stated: 0.5, rolePrior: 0.5, behavioral: 0 }, behavioralRatio: 0.5 },
          confidence: { estimate: 0.5, confidence: 0.5, sourceWeights: { stated: 0.5, stability: 0.5 } },
          susceptibility: { estimate: 0.5, confidence: 0.5, usable: true },
        }],
      ]);
      const result = computeDeltaNoResponse(states, estimates);
      expect(result.triggered).toBe(false);
    });
  });

  describe("δ_concentration", () => {
    it("I 置信度不足 → 跳过", () => {
      const states = [
        makeCognitiveState("a1"),
        makeCognitiveState("a2"),
      ];
      const estimates = new Map<string, ProgressiveEstimates>();
      estimates.set("a1", {
        inertia: { estimate: 0.5, confidence: 0.10, sourceWeights: { stated: 0.5, rolePrior: 0.5, behavioral: 0 }, behavioralRatio: 0.5 },
        confidence: { estimate: 0.5, confidence: 0.3, sourceWeights: { stated: 1, stability: 0 } },
        susceptibility: { estimate: 0.5, confidence: 0.05, usable: false },
      });
      estimates.set("a2", {
        inertia: { estimate: 0.5, confidence: 0.10, sourceWeights: { stated: 0.5, rolePrior: 0.5, behavioral: 0 }, behavioralRatio: 0.5 },
        confidence: { estimate: 0.5, confidence: 0.3, sourceWeights: { stated: 1, stability: 0 } },
        susceptibility: { estimate: 0.5, confidence: 0.05, usable: false },
      });
      const result = computeDeltaConcentration(estimates, states);
      expect(result.triggered).toBe(false);
      expect(result.explanation).toContain("置信度不足");
    });

    it("高置信度 + 惯性集中 → 触发", () => {
      const states = [
        makeCognitiveState("a1", { inertiaEstimate: 0.9, inertiaConfidence: 0.6 }),
        makeCognitiveState("a2", { inertiaEstimate: 0.3, inertiaConfidence: 0.6 }),
        makeCognitiveState("a3", { inertiaEstimate: 0.3, inertiaConfidence: 0.6 }),
      ];
      const estimates = new Map<string, ProgressiveEstimates>();
      for (const s of states) {
        estimates.set(s.agentId, {
          inertia: { estimate: s.inertia.estimate, confidence: s.inertia.confidence, sourceWeights: { stated: 0, rolePrior: 0, behavioral: 0.9 }, behavioralRatio: 0.5 },
          confidence: { estimate: 0.5, confidence: 0.5, sourceWeights: { stated: 0.5, stability: 0.5 } },
          susceptibility: { estimate: 0.5, confidence: 0.5, usable: true },
        });
      }
      const result = computeDeltaConcentration(estimates, states, { concentrationThreshold: 1.5 });
      expect(result.triggered).toBe(true);
    });
  });

  describe("δ_consistency", () => {
    it("I 置信度不足 → 使用严格阈值", () => {
      const states = [makeCognitiveState("a1", {
        utilityHistory: [
          { round: 1, scores: { A: 0.6, B: 0.3 } },
          { round: 2, scores: { A: 0.1, B: 0.9 } },
        ],
      })];
      const estimates = new Map<string, ProgressiveEstimates>();
      estimates.set("a1", {
        inertia: { estimate: 0.5, confidence: 0.10, sourceWeights: { stated: 0.5, rolePrior: 0.5, behavioral: 0 }, behavioralRatio: 0.5 },
        confidence: { estimate: 0.5, confidence: 0.3, sourceWeights: { stated: 1, stability: 0 } },
        susceptibility: { estimate: 0.5, confidence: 0.05, usable: false },
      });
      const result = computeDeltaConsistency(estimates, states);
      // 低置信度 → 严格阈值 2.0*1.5=3.0，ΔU/I 可能不触发
      expect(result.minConfidence).toBeLessThan(0.25);
    });
  });

  describe("computeDeltaDiagnosis（集成）", () => {
    it("所有 δ 都计算，正常状态返回 summary", () => {
      const states = [
        makeCognitiveState("a1", { utilityScores: { A: 0.5, B: 0.5 } }),
        makeCognitiveState("a2", { utilityScores: { A: 0.5, B: 0.5 } }),
      ];
      const thermo: ThermoState = { R: 0.5, T: 0.3, H: 0.4, F: 0.6 };
      const estimates = new Map<string, ProgressiveEstimates>();
      for (const s of states) {
        estimates.set(s.agentId, {
          inertia: { estimate: 0.5, confidence: 0.3, sourceWeights: { stated: 0.5, rolePrior: 0.5, behavioral: 0 }, behavioralRatio: 0.5 },
          confidence: { estimate: 0.5, confidence: 0.3, sourceWeights: { stated: 1, stability: 0 } },
          susceptibility: { estimate: 0.5, confidence: 0.05, usable: false },
        });
      }
      const diagnosis = computeDeltaDiagnosis(states, thermo, estimates);
      expect(diagnosis.polarization).toBeDefined();
      expect(diagnosis.oneDMask).toBeDefined();
      expect(diagnosis.evidenceSilence).toBeDefined();
      expect(diagnosis.confidenceGap).toBeDefined();
      expect(diagnosis.stanceFlip).toBeDefined();
      expect(diagnosis.noResponse).toBeDefined();
      expect(diagnosis.summary).toBeDefined();
      expect(diagnosis.summary.length).toBeGreaterThan(0);
    });
  });

  describe("自适应阈值", () => {
    it("高置信度 → 阈值接近 base", () => {
      const states = [
        makeCognitiveState("a1", { utilityScores: { A: 0.6, B: 0.4 } }),
        makeCognitiveState("a2", { utilityScores: { A: 0.4, B: 0.6 } }),
      ];
      // polarization 使用 minC=1.0，阈值接近 base
      const result = computeDeltaPolarization(states, { polarizationThreshold: 0.15 });
      expect(result.effectiveThreshold).toBeCloseTo(0.15, 2);
    });
  });
});

// ============================================================================
// 3. 置信度感知干预降级
// ============================================================================

import {
  generateCognitiveInterventions,
} from "@/lib/governance/cognitiveInterventions";
import type {
  CognitiveGovernanceState,
  GovernanceIssue,
} from "@/lib/governance/types";

function makeGovState(agentId: string): CognitiveGovernanceState {
  return {
    agentId,
    utility: { scores: { A: 0.5, B: 0.3, C: 0.2 }, topChoice: "A", preferenceClarity: 0.5, intensity: 0.5 },
    evidence: { coverage: 0.5, quality: 0.5, diversity: 0.3 },
    inertia: { strength: 0.5 },
    confidence: { overall: 0.6 },
    susceptibility: 0.4,
  };
}

function makeGovStatesMap(ids: string[]): Map<string, CognitiveGovernanceState> {
  const m = new Map<string, CognitiveGovernanceState>();
  for (const id of ids) m.set(id, makeGovState(id));
  return m;
}

function makeEstimates(ids: string[], inertiaConf: number, confidenceConf: number): Map<string, ProgressiveEstimates> {
  const m = new Map<string, ProgressiveEstimates>();
  for (const id of ids) {
    m.set(id, {
      inertia: { estimate: 0.5, confidence: inertiaConf, sourceWeights: { stated: 0.5, rolePrior: 0.5, behavioral: 0 }, behavioralRatio: 0.5 },
      confidence: { estimate: 0.5, confidence: confidenceConf, sourceWeights: { stated: 1, stability: 0 } },
      susceptibility: { estimate: 0.5, confidence: 0.05, usable: false },
    });
  }
  return m;
}

describe("置信度感知干预降级", () => {
  it("无 estimates → 正常干预（不降级）", () => {
    const states = makeGovStatesMap(["a1", "a2", "a3"]);
    const issue: GovernanceIssue = {
      type: "echo_chamber_cognitive",
      severity: "medium",
      description: "test",
      agents: ["a1"],
      source: "custom",
      suggestedIntervention: { type: "rebalance_attention", targetAgents: ["a1"], reason: "test" },
    };
    const result = generateCognitiveInterventions([issue], states);
    expect(result.interventions.length).toBeGreaterThan(0);
    // 默认 rebalance_attention
    expect(result.interventions[0].type).toBe("rebalance_attention");
  });

  it("I 置信度低 → rebalance_attention 降级为 inject_evidence", () => {
    const states = makeGovStatesMap(["a1", "a2", "a3"]);
    const estimates = makeEstimates(["a1", "a2", "a3"], 0.15, 0.5);
    const issue: GovernanceIssue = {
      type: "echo_chamber_cognitive",
      severity: "medium",
      description: "test",
      agents: ["a1"],
      source: "custom",
      suggestedIntervention: { type: "rebalance_attention", targetAgents: ["a1"], reason: "test" },
    };
    const result = generateCognitiveInterventions([issue], states, undefined, undefined, estimates);
    expect(result.interventions.length).toBeGreaterThan(0);
    expect(result.interventions[0].type).toBe("inject_evidence");
    expect(result.interventions[0].effect).toContain("degraded");
  });

  it("C 置信度低 → inject_evidence 降级为 evidence guidance", () => {
    const states = makeGovStatesMap(["a1", "a2", "a3"]);
    const estimates = makeEstimates(["a1", "a2", "a3"], 0.5, 0.15);
    const issue: GovernanceIssue = {
      type: "polarization_cognitive",
      severity: "medium",
      description: "test",
      agents: ["a1"],
      source: "custom",
      suggestedIntervention: { type: "inject_evidence", targetAgents: ["a1"], reason: "test" },
    };
    const result = generateCognitiveInterventions([issue], states, undefined, undefined, estimates);
    expect(result.interventions.length).toBeGreaterThan(0);
    expect(result.interventions[0].effect).toContain("degraded");
    expect(result.interventions[0].effect).toContain("Evidence guidance");
  });

  it("置信度充足 → 不降级", () => {
    const states = makeGovStatesMap(["a1", "a2", "a3"]);
    const estimates = makeEstimates(["a1", "a2", "a3"], 0.5, 0.5);
    const issue: GovernanceIssue = {
      type: "authority_bias_cognitive",
      severity: "medium",
      description: "test",
      agents: ["a1"],
      source: "custom",
      suggestedIntervention: { type: "rebalance_attention", targetAgents: ["a1"], reason: "test" },
    };
    const result = generateCognitiveInterventions([issue], states, undefined, undefined, estimates);
    expect(result.interventions.length).toBeGreaterThan(0);
    expect(result.interventions[0].type).toBe("rebalance_attention");
    expect(result.interventions[0].effect).not.toContain("degraded");
  });
});

// ============================================================================
// 5. Evidence Shared 检测（Layer 1 数学匹配）
// ============================================================================

/** 创建带 cognitive states 的 MeasurementLayer 实例 */
function makeMeasurementLayerWithStates(states: AgentCognitiveState[]): MeasurementLayer {
  const ml = new MeasurementLayer();
  const map = new Map<string, AgentCognitiveState>();
  for (const s of states) map.set(s.agentId, s);
  ml.setCognitiveStates(map);
  return ml;
}

describe("markEvidenceSharing — Layer 1 数学匹配", () => {
  // 通过 MeasurementLayer 实例直接调用生产代码 markEvidenceSharing()

  it("精确匹配 → shared=true", () => {
    const state1 = makeCognitiveState("a1", {
      evidenceItems: [
        { id: "a1_ev_1_0", content: "大学A的科研经费充足", supports: "A", strength: 0.8, source: "a1", sourceReliability: 0.8, acquiredAt: 1, shared: false },
      ],
    });
    const state2 = makeCognitiveState("a2", {
      evidenceItems: [
        { id: "a2_ev_1_0", content: "大学A的科研经费充足", supports: "A", strength: 0.8, source: "a2", sourceReliability: 0.8, acquiredAt: 1, shared: false },
      ],
    });

    const ml = makeMeasurementLayerWithStates([state1, state2]);
    ml.markEvidenceSharing();

    expect(state1.evidence.items[0].shared).toBe(true);
    expect(state2.evidence.items[0].shared).toBe(true);
  });

  it("子串匹配 → shared=true（一方包含另一方）", () => {
    const state1 = makeCognitiveState("a1", {
      evidenceItems: [
        { id: "a1_ev_1_0", content: "大学A的科研经费非常充足，位居全国前列", supports: "A", strength: 0.8, source: "a1", sourceReliability: 0.8, acquiredAt: 1, shared: false },
      ],
    });
    const state2 = makeCognitiveState("a2", {
      evidenceItems: [
        { id: "a2_ev_1_0", content: "大学A的科研经费", supports: "A", strength: 0.8, source: "a2", sourceReliability: 0.8, acquiredAt: 1, shared: false },
      ],
    });

    const ml = makeMeasurementLayerWithStates([state1, state2]);
    ml.markEvidenceSharing();

    expect(state1.evidence.items[0].shared).toBe(true);
    expect(state2.evidence.items[0].shared).toBe(true);
  });

  it("无匹配 → shared=false（独有信息）", () => {
    const state1 = makeCognitiveState("a1", {
      evidenceItems: [
        { id: "a1_ev_1_0", content: "大学A的学术声誉全球领先", supports: "A", strength: 0.8, source: "a1", sourceReliability: 0.8, acquiredAt: 1, shared: false },
      ],
    });
    const state2 = makeCognitiveState("a2", {
      evidenceItems: [
        { id: "a2_ev_1_0", content: "大学B的就业率高达95%", supports: "B", strength: 0.7, source: "a2", sourceReliability: 0.8, acquiredAt: 1, shared: false },
      ],
    });

    const ml = makeMeasurementLayerWithStates([state1, state2]);
    ml.markEvidenceSharing();

    expect(state1.evidence.items[0].shared).toBe(false);
    expect(state2.evidence.items[0].shared).toBe(false);
  });

  it("同义改写 → 数学匹配失败（Layer 2 补判场景）", () => {
    const state1 = makeCognitiveState("a1", {
      evidenceItems: [
        { id: "a1_ev_1_0", content: "财务不稳定", supports: "A", strength: 0.8, source: "a1", sourceReliability: 0.8, acquiredAt: 1, shared: false },
      ],
    });
    const state2 = makeCognitiveState("a2", {
      evidenceItems: [
        { id: "a2_ev_1_0", content: "资产负债率高", supports: "A", strength: 0.7, source: "a2", sourceReliability: 0.8, acquiredAt: 1, shared: false },
      ],
    });

    const ml = makeMeasurementLayerWithStates([state1, state2]);
    ml.markEvidenceSharing();

    // Layer 1 数学匹配无法识别同义改写 → 保持 shared=false，需 Layer 2 补判
    expect(state1.evidence.items[0].shared).toBe(false);
    expect(state2.evidence.items[0].shared).toBe(false);
  });

  it("supports 不同 → 不匹配（H6 跨选项保护）", () => {
    const state1 = makeCognitiveState("a1", {
      evidenceItems: [
        { id: "a1_ev_1_0", content: "大学A的科研经费充足", supports: "A", strength: 0.8, source: "a1", sourceReliability: 0.8, acquiredAt: 1, shared: false },
      ],
    });
    const state2 = makeCognitiveState("a2", {
      evidenceItems: [
        { id: "a2_ev_1_0", content: "大学A的科研经费充足", supports: "B", strength: 0.8, source: "a2", sourceReliability: 0.8, acquiredAt: 1, shared: false },
      ],
    });

    const ml = makeMeasurementLayerWithStates([state1, state2]);
    ml.markEvidenceSharing();

    // 文本完全相同但 supports 不同 → 不应标记为 shared
    expect(state1.evidence.items[0].shared).toBe(false);
    expect(state2.evidence.items[0].shared).toBe(false);
  });

  it("δ_evidence_silence 在有 unshared evidence 时可触发", () => {
    // 一个 agent 的 evidence 全部 shared，另一个有 unshared
    const states: AgentCognitiveState[] = [
      makeCognitiveState("a1", {
        evidenceItems: [
          { id: "a1_ev_1_0", content: "共享信息", supports: "A", strength: 0.8, source: "a1", sourceReliability: 0.8, acquiredAt: 1, shared: true },
        ],
      }),
      makeCognitiveState("a2", {
        evidenceItems: [
          { id: "a2_ev_1_0", content: "独有信息", supports: "B", strength: 0.7, source: "a2", sourceReliability: 0.8, acquiredAt: 1, shared: false },
        ],
      }),
    ];

    const result = computeDeltaEvidenceSilence(states);
    // a1 shared=1, a2 shared=0 → min=0, mean=0.5 → value = 0/0.5 = 0 < threshold → triggered
    expect(result.value).toBe(0);
    expect(result.triggered).toBe(true);
    expect(result.silencedAgents).toContain("Agent_a2");
  });

  it("δ_evidence_silence 在所有 evidence shared 时不触发", () => {
    const states: AgentCognitiveState[] = [
      makeCognitiveState("a1", {
        evidenceItems: [
          { id: "a1_ev_1_0", content: "信息A", supports: "A", strength: 0.8, source: "a1", sourceReliability: 0.8, acquiredAt: 1, shared: true },
          { id: "a1_ev_1_1", content: "信息B", supports: "B", strength: 0.6, source: "a1", sourceReliability: 0.8, acquiredAt: 1, shared: true },
        ],
      }),
      makeCognitiveState("a2", {
        evidenceItems: [
          { id: "a2_ev_1_0", content: "信息C", supports: "C", strength: 0.7, source: "a2", sourceReliability: 0.8, acquiredAt: 1, shared: true },
          { id: "a2_ev_1_1", content: "信息D", supports: "A", strength: 0.5, source: "a2", sourceReliability: 0.8, acquiredAt: 1, shared: true },
        ],
      }),
    ];

    const result = computeDeltaEvidenceSilence(states);
    // 所有 shared → min/mean = 1.0 → 不触发
    expect(result.value).toBe(1);
    expect(result.triggered).toBe(false);
  });
});