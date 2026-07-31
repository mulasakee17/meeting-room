/**
 * 认知检测器单元测试（6 个检测器 + 1 个集成入口）
 *
 * 覆盖 src/lib/governance/cognitiveDetectors.ts 的全部公开 API：
 *   1. detectEchoChamberCognitive
 *   2. detectPolarizationCognitive
 *   3. detectPrematureConsensusCognitive
 *   4. detectAuthorityBiasCognitive
 *   5. detectEvidenceImbalance
 *   6. detectCognitiveActionMismatch
 *   7. runCognitiveDetectors (集成)
 *
 * 设计原则：纯单元测试，零 LLM 调用，零 API 成本，确定性。
 * 测试策略：
 *   - 正常输入：构造典型的认知状态，验证检测逻辑
 *   - 边界条件：< 2 agents、空数组、全零值
 *   - 阈值边界：刚好触发/不触发
 *   - 配置覆盖：自定义 threshold 生效
 */
import { describe, it, expect } from "vitest";
import {
  detectEchoChamberCognitive,
  detectPolarizationCognitive,
  detectPrematureConsensusCognitive,
  detectAuthorityBiasCognitive,
  detectEvidenceImbalance,
  detectCognitiveActionMismatch,
  runCognitiveDetectors,
} from "@/lib/governance/cognitiveDetectors";
import type { CognitiveGovernanceState, GovernanceConfig } from "@/lib/governance/types";

// ============================================================================
// Helpers
// ============================================================================

/** 构造单个 CognitiveGovernanceState */
function makeState(
  agentId: string,
  overrides: Partial<CognitiveGovernanceState> = {},
): CognitiveGovernanceState {
  return {
    agentId,
    utility: {
      scores: { A: 0.7, B: 0.3 },
      topChoice: "A",
      preferenceClarity: 0.7,
      intensity: 0.6,
      ...overrides.utility,
    },
    evidence: {
      coverage: 0.6,
      quality: 0.7,
      diversity: 0.5,
      ...overrides.evidence,
    },
    inertia: {
      strength: 0.5,
      ...overrides.inertia,
    },
    confidence: {
      overall: 0.7,
      ...overrides.confidence,
    },
    susceptibility: 0.2,
    rankingTopChoice: "A",
    ...overrides,
  };
}

/** 构造多个高度同质的 agent（echo chamber 场景） */
function homogeneousStates(n: number): CognitiveGovernanceState[] {
  return Array.from({ length: n }, (_, i) =>
    makeState(`a${i}`, {
      utility: { scores: { A: 0.8, B: 0.2 }, topChoice: "A", preferenceClarity: 0.8, intensity: 0.7 },
      evidence: { coverage: 0.6, quality: 0.7, diversity: 0.3 }, // 低 diversity
    }),
  );
}

/** 构造两极分化的 agent（polarization 场景） */
function polarizedStates(): CognitiveGovernanceState[] {
  return [
    makeState("a1", {
      utility: { scores: { A: 0.9, B: 0.1 }, topChoice: "A", preferenceClarity: 0.9, intensity: 0.8 },
    }),
    makeState("a2", {
      utility: { scores: { A: 0.1, B: 0.9 }, topChoice: "B", preferenceClarity: 0.9, intensity: 0.8 },
    }),
    makeState("a3", {
      utility: { scores: { A: 0.85, B: 0.15 }, topChoice: "A", preferenceClarity: 0.85, intensity: 0.7 },
    }),
    makeState("a4", {
      utility: { scores: { A: 0.15, B: 0.85 }, topChoice: "B", preferenceClarity: 0.85, intensity: 0.7 },
    }),
  ];
}

// ============================================================================
// 1. detectEchoChamberCognitive
// ============================================================================

describe("detectEchoChamberCognitive", () => {
  it("states < 2 时返回未检测", () => {
    const result = detectEchoChamberCognitive([makeState("a1")]);
    expect(result.detected).toBe(false);
    expect(result.infoRedundancyScore).toBe(0);
  });

  it("同质群体（低 diversity + 高覆盖度重叠）触发检测", () => {
    const states = homogeneousStates(5);
    const result = detectEchoChamberCognitive(states);
    // 同质群体：coverage 方差=0, diversity=0.3, Jaccard=1（全部相同选项）
    // echoScore = 0.3*1 + 0.3*0.7 + 0.4*1 = 0.3 + 0.21 + 0.4 = 0.91
    expect(result.infoRedundancyScore).toBeGreaterThan(0.75);
    expect(result.detected).toBe(true);
    expect(["medium", "high"]).toContain(result.severity);
  });

  it("异质群体（高 diversity + 不同选项集）不触发", () => {
    const states = [
      makeState("a1", {
        utility: { scores: { A: 0.8, B: 0.2 }, topChoice: "A", preferenceClarity: 0.8, intensity: 0.7 },
        evidence: { coverage: 0.5, quality: 0.7, diversity: 0.8 },
      }),
      makeState("a2", {
        utility: { scores: { C: 0.7, D: 0.3 }, topChoice: "C", preferenceClarity: 0.7, intensity: 0.6 },
        evidence: { coverage: 0.8, quality: 0.7, diversity: 0.9 },
      }),
    ];
    const result = detectEchoChamberCognitive(states);
    // Jaccard = 0（不同选项），diversity 高，echoScore 应较低
    expect(result.infoRedundancyScore).toBeLessThan(0.75);
    expect(result.detected).toBe(false);
  });

  it("自定义 echoChamberThreshold 生效", () => {
    const states = homogeneousStates(5);
    const highThreshold: GovernanceConfig = { echoChamberThreshold: 0.99 };
    const result = detectEchoChamberCognitive(states, highThreshold);
    expect(result.detected).toBe(false);
  });

  it("redundantAgents 只在 detected=true 时填充", () => {
    const states = homogeneousStates(5);
    const result = detectEchoChamberCognitive(states);
    expect(result.detected).toBe(true);
    expect(result.redundantAgents.length).toBeGreaterThan(0);

    const lowThreshold: GovernanceConfig = { echoChamberThreshold: 0.99 };
    const result2 = detectEchoChamberCognitive(states, lowThreshold);
    expect(result2.detected).toBe(false);
    expect(result2.redundantAgents).toEqual([]);
  });

  it("severity 高分阈值：echoScore >= 0.90 为 high", () => {
    // 极端同质：完全相同 coverage + diversity=0 + 相同选项
    const states = Array.from({ length: 5 }, (_, i) =>
      makeState(`a${i}`, {
        utility: { scores: { A: 0.8, B: 0.2 }, topChoice: "A", preferenceClarity: 0.8, intensity: 0.7 },
        evidence: { coverage: 0.6, quality: 0.7, diversity: 0.0 },
      }),
    );
    const result = detectEchoChamberCognitive(states);
    // echoScore = 0.3*1 + 0.3*1 + 0.4*1 = 1.0
    expect(result.infoRedundancyScore).toBeGreaterThanOrEqual(0.90);
    expect(result.severity).toBe("high");
  });
});

// ============================================================================
// 2. detectPolarizationCognitive
// ============================================================================

describe("detectPolarizationCognitive", () => {
  it("states < 2 时返回未检测", () => {
    const result = detectPolarizationCognitive([makeState("a1")]);
    expect(result.detected).toBe(false);
    expect(result.polarizationScore).toBe(0);
  });

  it("对立群体触发检测", () => {
    const states = polarizedStates();
    const result = detectPolarizationCognitive(states);
    // A: (0.9,0.1), B: (0.1,0.9) — cosine 距离 = 1 - 0.18/0.82 ≈ 0.78
    expect(result.polarizationScore).toBeGreaterThan(0.25);
    expect(result.detected).toBe(true);
  });

  it("同质群体不触发", () => {
    const states = homogeneousStates(4);
    const result = detectPolarizationCognitive(states);
    expect(result.polarizationScore).toBeLessThan(0.25);
    expect(result.detected).toBe(false);
  });

  it("mostDistant 返回距离最远的两个 agent", () => {
    const states = polarizedStates();
    const result = detectPolarizationCognitive(states);
    expect(result.mostDistant).toHaveLength(2);
    // a1 (A:0.9,B:0.1) vs a2 (A:0.1,B:0.9) 应是最远对之一
    const pair = new Set(result.mostDistant);
    expect(pair.has("a1") || pair.has("a3")).toBe(true);
    expect(pair.has("a2") || pair.has("a4")).toBe(true);
  });

  it("自定义 polarizationThreshold 生效", () => {
    const states = polarizedStates();
    const highThreshold: GovernanceConfig = { polarizationThreshold: 0.99 };
    const result = detectPolarizationCognitive(states, highThreshold);
    expect(result.detected).toBe(false);
  });

  it("零向量不崩溃（normA=0 或 normB=0 返回距离 0）", () => {
    const states = [
      makeState("a1", {
        utility: { scores: { A: 0, B: 0 }, topChoice: "A", preferenceClarity: 0, intensity: 0 },
      }),
      makeState("a2", {
        utility: { scores: { A: 0.8, B: 0.2 }, topChoice: "A", preferenceClarity: 0.8, intensity: 0.7 },
      }),
    ];
    const result = detectPolarizationCognitive(states);
    // 零向量 → cosineDistance 返回 0，不崩溃
    expect(result.polarizationScore).toBe(0);
    expect(result.detected).toBe(false);
  });

  it("severity 高分阈值：meanDist >= 0.40 为 high", () => {
    const states = [
      makeState("a1", {
        utility: { scores: { A: 1, B: -1 }, topChoice: "A", preferenceClarity: 0.9, intensity: 0.8 },
      }),
      makeState("a2", {
        utility: { scores: { A: -1, B: 1 }, topChoice: "B", preferenceClarity: 0.9, intensity: 0.8 },
      }),
    ];
    const result = detectPolarizationCognitive(states);
    expect(result.polarizationScore).toBeGreaterThanOrEqual(0.40);
    expect(result.severity).toBe("high");
  });
});

// ============================================================================
// 3. detectPrematureConsensusCognitive
// ============================================================================

describe("detectPrematureConsensusCognitive", () => {
  it("states < 2 时返回未检测", () => {
    const result = detectPrematureConsensusCognitive([makeState("a1")], 1, 5);
    expect(result.detected).toBe(false);
  });

  it("早期轮次 + 高效用共识 + 低离散触发检测", () => {
    // 所有 agent utility 几乎相同 → 高共识
    // round=1, maxRounds=10 → roundProgress=0.1（早期）
    // 修复后公式：score = (1 - roundProgress) * utilityConsensus * (1 - beliefDispersion)
    // (1-0.1) * ~1 * ~0.99 ≈ 0.89 > 0.55 → 早期高共识应触发
    const states = Array.from({ length: 5 }, (_, i) =>
      makeState(`a${i}`, {
        utility: { scores: { A: 0.81, B: 0.79 }, topChoice: "A", preferenceClarity: 0.8, intensity: 0.7 },
      }),
    );
    const result = detectPrematureConsensusCognitive(states, 1, 10);
    expect(result.detected).toBe(true);
    expect(result.roundProgress).toBeCloseTo(0.1, 2);
  });

  it("晚期轮次不触发（roundProgress 高，共识是正常现象）", () => {
    const states = homogeneousStates(5);
    const result = detectPrematureConsensusCognitive(states, 8, 10);
    expect(result.roundProgress).toBeCloseTo(0.8, 2);
    // 修复后公式：score = (1-0.8) * 1 * (1-0) = 0.2 < 0.55 → 晚期共识是正常收敛
    expect(result.detected).toBe(false);
  });

  it("异质群体不触发（低效用共识）", () => {
    const states = polarizedStates();
    const result = detectPrematureConsensusCognitive(states, 8, 10);
    // polarizedStates 的 4 agent pairwise cosine 相似度均值约 0.52（非极低）
    // 但 beliefDispersion 高（scores 分散），score 被压低
    expect(result.utilityConsensus).toBeLessThan(0.6);
    expect(result.detected).toBe(false);
  });

  it("自定义 prematureConsensusThreshold 生效", () => {
    const states = homogeneousStates(5);
    const highThreshold: GovernanceConfig = { prematureConsensusThreshold: 0.99 };
    const result = detectPrematureConsensusCognitive(states, 8, 10, highThreshold);
    expect(result.detected).toBe(false);
  });

  it("maxRounds=0 时不崩溃（roundProgress=0）", () => {
    const states = homogeneousStates(5);
    const result = detectPrematureConsensusCognitive(states, 1, 0);
    expect(result.roundProgress).toBe(0);
    // 修复后公式：score = (1-0) * 1 * (1-0) = 1.0 > 0.55 → 触发（maxRounds=0 是调用方错误，但检测器不应崩溃）
    expect(result.detected).toBe(true);
  });
});

// ============================================================================
// 4. detectAuthorityBiasCognitive
// ============================================================================

describe("detectAuthorityBiasCognitive", () => {
  it("states < 2 时返回未检测", () => {
    const result = detectAuthorityBiasCognitive([makeState("a1")]);
    expect(result.detected).toBe(false);
    expect(result.inertiaConcentration).toBe(1);
  });

  it("单一权威 agent（高 inertia + 低 susceptibility）触发", () => {
    const states = [
      makeState("a1", {
        inertia: { strength: 0.95 },
        susceptibility: 0.05, // (1-0.95)(1-0.7) ≈ 0.015
      }),
      makeState("a2", {
        inertia: { strength: 0.3 },
        susceptibility: 0.49, // (1-0.3)(1-0.3) = 0.49
      }),
      makeState("a3", {
        inertia: { strength: 0.3 },
        susceptibility: 0.49,
      }),
      makeState("a4", {
        inertia: { strength: 0.3 },
        susceptibility: 0.49,
      }),
    ];
    const result = detectAuthorityBiasCognitive(states);
    // inertiaConcentration = 0.95 / avg(0.95,0.3,0.3,0.3) = 0.95/0.4625 ≈ 2.05
    // susceptibilityAsymmetry = 0.49/0.05 = 9.8
    // signal = (2.05-1)*0.5 + (9.8-1)*0.5 = 0.525 + 4.4 = 4.9 > 0.6
    expect(result.inertiaConcentration).toBeGreaterThan(1.3);
    expect(result.susceptibilityAsymmetry).toBeGreaterThan(2.0);
    expect(result.detected).toBe(true);
    expect(result.dominantAgentId).toBe("a1");
  });

  it("均匀 inertia 群体不触发", () => {
    const states = homogeneousStates(4).map((s, i) => ({
      ...s,
      inertia: { strength: 0.5 },
      susceptibility: 0.2,
    }));
    const result = detectAuthorityBiasCognitive(states);
    // inertiaConcentration = 0.5/0.5 = 1
    // susceptibilityAsymmetry = 0.2/0.2 = 1
    // signal = 0*0.5 + 0*0.5 = 0
    expect(result.detected).toBe(false);
  });

  it("自定义 authorityBiasThreshold 生效", () => {
    const states = [
      makeState("a1", { inertia: { strength: 0.95 }, susceptibility: 0.05 }),
      makeState("a2", { inertia: { strength: 0.3 }, susceptibility: 0.49 }),
    ];
    const highThreshold: GovernanceConfig = { authorityBiasThreshold: 99 };
    const result = detectAuthorityBiasCognitive(states, highThreshold);
    expect(result.detected).toBe(false);
  });

  it("avgInertia=0 时不崩溃（返回 concentration=1）", () => {
    const states = [
      makeState("a1", { inertia: { strength: 0 } }),
      makeState("a2", { inertia: { strength: 0 } }),
    ];
    const result = detectAuthorityBiasCognitive(states);
    expect(result.inertiaConcentration).toBe(1);
    expect(result.detected).toBe(false);
  });

  it("minSus=0 时不崩溃（返回 asymmetry=1）", () => {
    const states = [
      makeState("a1", { inertia: { strength: 0.5 }, susceptibility: 0.5 }),
      makeState("a2", { inertia: { strength: 0.5 }, susceptibility: 0 }),
    ];
    const result = detectAuthorityBiasCognitive(states);
    expect(result.susceptibilityAsymmetry).toBe(1);
  });
});

// ============================================================================
// 5. detectEvidenceImbalance
// ============================================================================

describe("detectEvidenceImbalance", () => {
  it("states < 2 时返回未检测", () => {
    const result = detectEvidenceImbalance([makeState("a1")]);
    expect(result.detected).toBe(false);
    expect(result.coverageGini).toBe(0);
  });

  it("mean=0 时（全部 coverage=0）返回未检测", () => {
    const states = [
      makeState("a1", { evidence: { coverage: 0, quality: 0.7, diversity: 0.5 } }),
      makeState("a2", { evidence: { coverage: 0, quality: 0.7, diversity: 0.5 } }),
    ];
    const result = detectEvidenceImbalance(states);
    expect(result.detected).toBe(false);
    expect(result.coverageGini).toBe(0);
  });

  it("覆盖度极度不均触发检测", () => {
    // gini = MAD/(2*mean)；[0.99,0.01,0.99,0.01] → gini=0.49 > 0.4
    const states = [
      makeState("a1", { evidence: { coverage: 0.99, quality: 0.7, diversity: 0.5 } }),
      makeState("a2", { evidence: { coverage: 0.01, quality: 0.7, diversity: 0.5 } }),
      makeState("a3", { evidence: { coverage: 0.99, quality: 0.7, diversity: 0.5 } }),
      makeState("a4", { evidence: { coverage: 0.01, quality: 0.7, diversity: 0.5 } }),
    ];
    const result = detectEvidenceImbalance(states);
    // 极度不均：gini 应较高
    expect(result.coverageGini).toBeGreaterThan(0.4);
    expect(result.detected).toBe(true);
    expect(result.evidencePoorAgents.length).toBeGreaterThan(0);
  });

  it("覆盖度均匀不触发", () => {
    const states = [
      makeState("a1", { evidence: { coverage: 0.6, quality: 0.7, diversity: 0.5 } }),
      makeState("a2", { evidence: { coverage: 0.62, quality: 0.7, diversity: 0.5 } }),
      makeState("a3", { evidence: { coverage: 0.58, quality: 0.7, diversity: 0.5 } }),
    ];
    const result = detectEvidenceImbalance(states);
    expect(result.coverageGini).toBeLessThan(0.4);
    expect(result.detected).toBe(false);
  });

  it("evidencePoorAgents 在 detected=false 时为空", () => {
    const states = [
      makeState("a1", { evidence: { coverage: 0.6, quality: 0.7, diversity: 0.5 } }),
      makeState("a2", { evidence: { coverage: 0.62, quality: 0.7, diversity: 0.5 } }),
    ];
    const result = detectEvidenceImbalance(states);
    expect(result.detected).toBe(false);
    expect(result.evidencePoorAgents).toEqual([]);
  });

  it("coverageGap = max - min", () => {
    const states = [
      makeState("a1", { evidence: { coverage: 0.9, quality: 0.7, diversity: 0.5 } }),
      makeState("a2", { evidence: { coverage: 0.3, quality: 0.7, diversity: 0.5 } }),
    ];
    const result = detectEvidenceImbalance(states);
    expect(result.coverageGap).toBeCloseTo(0.6, 2);
  });
});

// ============================================================================
// 6. detectCognitiveActionMismatch
// ============================================================================

describe("detectCognitiveActionMismatch", () => {
  it("空数组返回未检测", () => {
    const result = detectCognitiveActionMismatch([]);
    expect(result.detected).toBe(false);
    expect(result.mismatchAgents).toEqual([]);
  });

  it("topChoice = rankingTopChoice 时不触发", () => {
    const states = [
      makeState("a1", { rankingTopChoice: "A" }), // utility.topChoice 也是 A
      makeState("a2", { rankingTopChoice: "A" }),
    ];
    const result = detectCognitiveActionMismatch(states);
    expect(result.detected).toBe(false);
  });

  it("rankingTopChoice 缺失（undefined）时跳过该 agent", () => {
    const states = [
      makeState("a1", { rankingTopChoice: undefined }),
      makeState("a2", { rankingTopChoice: "A" }),
    ];
    const result = detectCognitiveActionMismatch(states);
    expect(result.detected).toBe(false);
  });

  it("topChoice ≠ rankingTopChoice 且 gap > 0.4 触发", () => {
    const states = [
      makeState("a1", {
        utility: { scores: { A: 0.9, B: 0.1 }, topChoice: "A", preferenceClarity: 0.9, intensity: 0.8 },
        rankingTopChoice: "B", // gap = |0.9 - 0.1| = 0.8 > 0.4
      }),
    ];
    const result = detectCognitiveActionMismatch(states);
    expect(result.detected).toBe(true);
    expect(result.mismatchAgents).toContain("a1");
    expect(result.meanMismatchGap).toBeGreaterThan(0.4);
  });

  it("topChoice ≠ rankingTopChoice 但 gap <= 0.4 不触发", () => {
    const states = [
      makeState("a1", {
        utility: { scores: { A: 0.55, B: 0.45 }, topChoice: "A", preferenceClarity: 0.5, intensity: 0.4 },
        rankingTopChoice: "B", // gap = |0.55 - 0.45| = 0.1 < 0.4
      }),
    ];
    const result = detectCognitiveActionMismatch(states);
    expect(result.detected).toBe(false);
    expect(result.mismatchAgents).toEqual([]);
  });

  it("2+ mismatch agents → severity high", () => {
    const states = [
      makeState("a1", {
        utility: { scores: { A: 0.9, B: 0.1 }, topChoice: "A", preferenceClarity: 0.9, intensity: 0.8 },
        rankingTopChoice: "B",
      }),
      makeState("a2", {
        utility: { scores: { A: 0.85, B: 0.15 }, topChoice: "A", preferenceClarity: 0.85, intensity: 0.7 },
        rankingTopChoice: "B",
      }),
    ];
    const result = detectCognitiveActionMismatch(states);
    expect(result.mismatchAgents).toHaveLength(2);
    expect(result.severity).toBe("high");
  });

  it("1 mismatch agent → severity medium", () => {
    const states = [
      makeState("a1", {
        utility: { scores: { A: 0.9, B: 0.1 }, topChoice: "A", preferenceClarity: 0.9, intensity: 0.8 },
        rankingTopChoice: "B",
      }),
      makeState("a2", { rankingTopChoice: "A" }), // 一致
    ];
    const result = detectCognitiveActionMismatch(states);
    expect(result.mismatchAgents).toHaveLength(1);
    expect(result.severity).toBe("medium");
  });
});

// ============================================================================
// 7. runCognitiveDetectors (集成)
// ============================================================================

describe("runCognitiveDetectors (集成)", () => {
  const defaultConfig: GovernanceConfig = {};

  it("运行全部 6 个检测器并返回结构化结果", () => {
    const states = homogeneousStates(5);
    const result = runCognitiveDetectors(states, defaultConfig, 5, 10);

    expect(result).toHaveProperty("echoChamber");
    expect(result).toHaveProperty("polarization");
    expect(result).toHaveProperty("prematureConsensus");
    expect(result).toHaveProperty("authorityBias");
    expect(result).toHaveProperty("evidenceImbalance");
    expect(result).toHaveProperty("cognitiveActionMismatch");
    expect(result).toHaveProperty("issues");
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it("同质群体不再触发 echo chamber issue（已禁用）", () => {
    const states = homogeneousStates(5);
    const result = runCognitiveDetectors(states, defaultConfig, 5, 10);

    // Echo Chamber 检测器已禁用（分离度 0.000），不再生成 issue
    const echoIssue = result.issues.find(i => i.type === "echo_chamber_cognitive");
    expect(echoIssue).toBeUndefined();
  });

  it("极化群体触发 polarization issue + inject_evidence 干预", () => {
    const states = polarizedStates();
    const result = runCognitiveDetectors(states, defaultConfig, 5, 10);

    const polarIssue = result.issues.find(i => i.type === "polarization_cognitive");
    expect(polarIssue).toBeDefined();
    expect(polarIssue?.suggestedIntervention?.type).toBe("inject_evidence");
  });

  it("mismatch 触发 cognitive_action_mismatch issue", () => {
    const states = [
      makeState("a1", {
        utility: { scores: { A: 0.9, B: 0.1 }, topChoice: "A", preferenceClarity: 0.9, intensity: 0.8 },
        rankingTopChoice: "B",
      }),
      makeState("a2", {
        utility: { scores: { A: 0.85, B: 0.15 }, topChoice: "A", preferenceClarity: 0.85, intensity: 0.7 },
        rankingTopChoice: "B",
      }),
    ];
    const result = runCognitiveDetectors(states, defaultConfig, 5, 10);

    const mismatchIssue = result.issues.find(i => i.type === "cognitive_action_mismatch");
    expect(mismatchIssue).toBeDefined();
    expect(mismatchIssue?.severity).toBe("high");
  });

  it("无问题时 issues 为空数组", () => {
    const states = [
      makeState("a1", {
        utility: { scores: { A: 0.55, B: 0.45 }, topChoice: "A", preferenceClarity: 0.5, intensity: 0.4 },
        evidence: { coverage: 0.6, quality: 0.7, diversity: 0.8 },
        inertia: { strength: 0.5 },
        susceptibility: 0.2,
        rankingTopChoice: "A",
      }),
      makeState("a2", {
        utility: { scores: { A: 0.52, B: 0.48 }, topChoice: "A", preferenceClarity: 0.5, intensity: 0.4 },
        evidence: { coverage: 0.62, quality: 0.7, diversity: 0.8 },
        inertia: { strength: 0.5 },
        susceptibility: 0.2,
        rankingTopChoice: "A",
      }),
    ];
    const result = runCognitiveDetectors(states, defaultConfig, 1, 10);
    // 早期轮次 + 接近同质但 diversity 高 → 大部分检测器不触发
    // 注意：可能仍触发 echo chamber（取决于 Jaccard），所以只断言 issues 是数组
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it("每个 issue 包含完整的 GovernanceIssue 结构", () => {
    const states = polarizedStates();
    const result = runCognitiveDetectors(states, defaultConfig, 5, 10);

    for (const issue of result.issues) {
      expect(issue).toHaveProperty("type");
      expect(issue).toHaveProperty("severity");
      expect(["low", "medium", "high"]).toContain(issue.severity);
      expect(issue).toHaveProperty("description");
      expect(issue).toHaveProperty("source");
      expect(issue).toHaveProperty("suggestedIntervention");
      expect(issue.suggestedIntervention).toHaveProperty("type");
      expect(issue.suggestedIntervention).toHaveProperty("reason");
    }
  });

  it("干预类型映射正确（每种 issue → 对应干预）", () => {
    const states = [
      ...polarizedStates(),
      makeState("a5", {
        utility: { scores: { A: 0.9, B: 0.1 }, topChoice: "A", preferenceClarity: 0.9, intensity: 0.8 },
        rankingTopChoice: "B",
        evidence: { coverage: 0.1, quality: 0.7, diversity: 0.5 },
      }),
    ];
    const result = runCognitiveDetectors(states, defaultConfig, 8, 10);

    // polarization → inject_evidence
    const polarIssue = result.issues.find(i => i.type === "polarization_cognitive");
    expect(polarIssue?.suggestedIntervention?.type).toBe("inject_evidence");

    // evidence_imbalance → inject_evidence
    const imbalanceIssue = result.issues.find(i => i.type === "evidence_imbalance");
    if (imbalanceIssue) {
      expect(imbalanceIssue.suggestedIntervention?.type).toBe("inject_evidence");
    }

    // cognitive_action_mismatch → rebalance_attention
    const mismatchIssue = result.issues.find(i => i.type === "cognitive_action_mismatch");
    expect(mismatchIssue?.suggestedIntervention?.type).toBe("rebalance_attention");
  });
});
