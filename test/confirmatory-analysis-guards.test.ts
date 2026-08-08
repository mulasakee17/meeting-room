/**
 * confirmatory-analysis-guards.test.ts — E6/E8 confirmatory 状态机对抗性守卫测试
 *
 * 覆盖交接计划 §5（Task B）的必需 case：
 *   - E6：malformed snapshot → invalid_data；usable=false → unusable；
 *         schema-1 → legacy_mixed_excluded；eligible runs <2 → insufficient_data；
 *         2 runs × ≥5 usable → computed；无 NaN/Infinity/null 序列化；VIF 封顶。
 *   - E8：malformed transition → invalid_data（即使有 ≥3 个可辨识 transition）；
 *         usable=false → unusable；schema-1 → legacy；<3 / 不可辨识 → insufficient；
 *         可辨识 → computed 且持久化数字全部有限。
 *   - Consumer：runTests 对非 computed E6/E8 不产生显著性 claim；
 *         forged computed E6 缺 bootstrap → invalid_data。
 *
 * 全部使用本地构造的 raw-run fixture，不使用真实实验数据。
 */

import { describe, expect, it } from "vitest";
import { computeE6Decoupling, computeE8Susceptibility } from "../experiments/campaign/pipeline/MetricComputer";
import { runTests } from "../experiments/campaign/pipeline/StatisticalTest";
import type { ExperimentMetrics, CognitiveStateSnapshot, RawRunData } from "../experiments/campaign/types";

// ============================================================================
// Fixture builders
// ============================================================================

function makeSnapshot(over: Partial<CognitiveStateSnapshot> = {}): CognitiveStateSnapshot {
  return {
    round: 1,
    agentId: "a",
    agentName: "A",
    utility: { A: 0.5, B: 0.4 },
    utilityTopChoice: "A",
    utilityPreferenceClarity: 0.1,
    utilityIntensity: 0.6,
    evidenceCoverage: 0.5,
    evidenceQuality: 0.5,
    evidenceDiversity: 0.5,
    evidenceRecentGain: 0,
    inertiaStrength: 0.5,
    confidenceOverall: 0.7,
    susceptibility: 0.15,
    socialUpdateGain: 0.15,
    behavioralSusceptibilityEstimate: 0.5,
    behavioralSusceptibilityConfidence: 0.5,
    behavioralSusceptibilityUsable: true,
    statedStance: 0.5,
    belief: 0.5,
    oldConfidence: 70,
    spokeThisRound: true,
    ...over,
  };
}

function makeRun(snaps: CognitiveStateSnapshot[], schema: string | undefined): RawRunData {
  return {
    runId: "fixture_run",
    experimentId: "confirmatory_fixture",
    runtimeMode: "native_cognitive",
    seed: 1,
    runIndex: 0,
    timestamp: "t",
    scenario: "ma",
    agentCount: 1,
    maxRounds: snaps.length,
    totalRounds: snaps.length,
    converged: false,
    finalRanking: [],
    finalKendallTau: 0,
    finalAccuracy: 0,
    beliefTrajectory: [],
    cognitiveTrajectory: snaps,
    rawSchemaVersion: schema as RawRunData["rawSchemaVersion"],
  } as unknown as RawRunData;
}

/** 一个 schema-2 合法 snapshot，数值随 (round, seed) 变化，供 E6 聚合。 */
function validSnap(round: number, seed: number): CognitiveStateSnapshot {
  return makeSnapshot({
    round,
    agentId: `a${seed}`,
    utilityIntensity: 0.5 + seed * 0.1 + round * 0.01,
    evidenceCoverage: 0.4 + seed * 0.05,
    evidenceQuality: 0.5,
    evidenceDiversity: 0.4 + seed * 0.03,
    inertiaStrength: 0.3 + seed * 0.1 + round * 0.02,
    confidenceOverall: 0.6 + seed * 0.05,
    behavioralSusceptibilityEstimate: 0.4 + seed * 0.1 + round * 0.01,
    behavioralSusceptibilityConfidence: 0.5,
    behavioralSusceptibilityUsable: true,
    belief: 0.5 + round * 0.02,
    oldConfidence: 60 + round,
    utility: { A: 0.5 + round * 0.02, B: 0.4 - round * 0.01 },
  });
}

/** 4 个有序 snapshot（1 agent），inertia 单调、易感性之字形、utility 变化 → 3 个可辨识 transition。 */
function identifiableE8Snaps(): CognitiveStateSnapshot[] {
  return [
    makeSnapshot({ round: 1, inertiaStrength: 0.35, behavioralSusceptibilityEstimate: 0.45, utility: { A: 0.6, B: 0.4 } }),
    makeSnapshot({ round: 2, inertiaStrength: 0.40, behavioralSusceptibilityEstimate: 0.52, utility: { A: 0.5, B: 0.5 } }),
    makeSnapshot({ round: 3, inertiaStrength: 0.45, behavioralSusceptibilityEstimate: 0.47, utility: { A: 0.4, B: 0.6 } }),
    makeSnapshot({ round: 4, inertiaStrength: 0.50, behavioralSusceptibilityEstimate: 0.58, utility: { A: 0.3, B: 0.7 } }),
  ];
}

// ============================================================================
// E6
// ============================================================================

describe("E6 confirmatory guards", () => {
  it("two runs with at least five usable snapshots each return computed", () => {
    const runA = makeRun([1, 2, 3, 4, 5].map(r => validSnap(r, 1)), "2.0");
    const runB = makeRun([1, 2, 3, 4, 5].map(r => validSnap(r, 2)), "2.0");
    const metrics = computeE6Decoupling([runA, runB]);
    expect(metrics.stateDecoupling?.status).toBe("computed");
    expect(metrics.stateDecoupling?.eligibleRunCount).toBe(2);
    expect(metrics.stateDecoupling?.correlationMatrix).toBeDefined();
  });

  it("one malformed snapshot invalidates the whole result (invalid_data, no inferential fields)", () => {
    const runA = makeRun(
      [1, 2, 3, 4, 5].map(r => validSnap(r, 1)).concat(
        [makeSnapshot({ round: 6, agentId: "a1", susceptibility: 0.5, socialUpdateGain: 0.15, behavioralSusceptibilityUsable: true })],
      ),
      "2.0",
    );
    const runB = makeRun([1, 2, 3, 4, 5].map(r => validSnap(r, 2)), "2.0");
    const metrics = computeE6Decoupling([runA, runB]);
    const sd = metrics.stateDecoupling!;
    expect(sd.status).toBe("invalid_data");
    expect(sd.malformedObservationCount).toBeGreaterThan(0);
    expect(sd.correlationMatrix).toBeUndefined();
    expect(sd.maxCorrCognitive).toBeUndefined();
  });

  it("each schema-2 contract violation is malformed (not silently selected around)", () => {
    const violations: Array<Partial<CognitiveStateSnapshot>> = [
      { behavioralSusceptibilityUsable: undefined as unknown as boolean },
      { behavioralSusceptibilityEstimate: undefined as unknown as number },
      { behavioralSusceptibilityConfidence: undefined as unknown as number },
      { behavioralSusceptibilityEstimate: Number.NaN },
      { behavioralSusceptibilityEstimate: Number.POSITIVE_INFINITY },
      { behavioralSusceptibilityEstimate: 1.5 },
      { behavioralSusceptibilityEstimate: -0.2 },
      { behavioralSusceptibilityConfidence: Number.NaN },
      { behavioralSusceptibilityConfidence: Number.POSITIVE_INFINITY },
      { behavioralSusceptibilityConfidence: 1.1 },
      { behavioralSusceptibilityConfidence: -0.1 },
      { susceptibility: Number.NaN, socialUpdateGain: Number.NaN },
      { susceptibility: Number.POSITIVE_INFINITY, socialUpdateGain: Number.POSITIVE_INFINITY },
      { susceptibility: 1.1, socialUpdateGain: 1.1 },
      { susceptibility: -0.1, socialUpdateGain: -0.1 },
      { socialUpdateGain: 0.5 }, // 破坏 susceptibility === socialUpdateGain
      { susceptibility: 0.5 },
      { utility: { A: Number.NaN, B: 0.4 } },
      { utilityIntensity: Number.POSITIVE_INFINITY },
    ];
    for (const violation of violations) {
      const runA = makeRun(
        [1, 2, 3, 4, 5].map(r => validSnap(r, 1)).concat([makeSnapshot({ round: 6, agentId: "a1", ...violation })]),
        "2.0",
      );
      const runB = makeRun([1, 2, 3, 4, 5].map(r => validSnap(r, 2)), "2.0");
      const metrics = computeE6Decoupling([runA, runB]);
      expect(metrics.stateDecoupling?.status, JSON.stringify(violation)).toBe("invalid_data");
      expect(metrics.stateDecoupling?.malformedObservationCount, JSON.stringify(violation)).toBe(1);
    }
  });

  it("usable=false is counted as unusable, not malformed", () => {
    const runA = makeRun(
      [1, 2, 3, 4, 5].map(r => makeSnapshot({ round: r, agentId: "a1", behavioralSusceptibilityUsable: false })),
      "2.0",
    );
    const runB = makeRun([1, 2, 3, 4, 5].map(r => validSnap(r, 2)), "2.0");
    const metrics = computeE6Decoupling([runA, runB]);
    // runA 全 unusable → 不进入；runB 5 usable → 但只有 1 个 eligible run。
    expect(metrics.stateDecoupling?.unusableObservationCount).toBe(5);
    expect(metrics.stateDecoupling?.malformedObservationCount).toBe(0);
    expect(metrics.stateDecoupling?.status).toBe("insufficient_data");
  });

  it("schema-1-only input returns legacy_mixed_excluded with no inferential fields", () => {
    const runA = makeRun([1, 2, 3, 4, 5].map(r => validSnap(r, 1)), "1.0");
    const runB = makeRun([1, 2, 3, 4, 5].map(r => validSnap(r, 2)), "1.0");
    const metrics = computeE6Decoupling([runA, runB]);
    const sd = metrics.stateDecoupling!;
    expect(sd.status).toBe("legacy_mixed_excluded");
    expect(sd.legacyMixedExcludedCount).toBe(10);
    expect(sd.correlationMatrix).toBeUndefined();
    expect(sd.maxCorrCognitive).toBeUndefined();
  });

  it("fewer than two eligible runs returns insufficient_data", () => {
    const runA = makeRun([1, 2, 3, 4, 5].map(r => validSnap(r, 1)), "2.0");
    const metrics = computeE6Decoupling([runA]);
    expect(metrics.stateDecoupling?.status).toBe("insufficient_data");
  });

  it("computed result serializes without NaN/Infinity/null and VIF is capped", () => {
    const runA = makeRun([1, 2, 3, 4, 5].map(r => validSnap(r, 1)), "2.0");
    const runB = makeRun([1, 2, 3, 4, 5].map(r => validSnap(r, 2)), "2.0");
    const metrics = computeE6Decoupling([runA, runB]);
    expect(metrics.stateDecoupling?.status).toBe("computed");
    const json = JSON.stringify(metrics);
    expect(json).not.toMatch(/NaN|Infinity|null/);
    // 完全共线（同一序列）→ VIF 显式封顶，不得为 Infinity。
    const runC = makeRun([1, 2, 3, 4, 5].map(r => {
      const s = validSnap(r, 3);
      return makeSnapshot({ ...s, round: r, utilityIntensity: s.evidenceCoverage });
    }), "2.0");
    const collinear = computeE6Decoupling([runC, runC]);
    expect(collinear.stateDecoupling?.status).toBe("computed");
    expect(Number.isFinite(collinear.stateDecoupling?.vifMax)).toBe(true);
    expect(collinear.stateDecoupling?.vifMax).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// E8
// ============================================================================

describe("E8 confirmatory guards", () => {
  it("an identifiable fixture returns computed with all finite persisted numbers", () => {
    const metrics = computeE8Susceptibility([makeRun(identifiableE8Snaps(), "2.0")]);
    const sm = metrics.susceptibilityMediation!;
    expect(sm.status).toBe("computed");
    expect(sm.usableObservationCount).toBe(3);
    expect(Number.isFinite(sm.indirectEffect)).toBe(true);
    expect(Number.isFinite(sm.mediationRatio)).toBe(true);
    expect(JSON.stringify(sm)).not.toMatch(/NaN|Infinity|null/);
  });

  it("one malformed transition plus otherwise identifiable transitions returns invalid_data, never computed", () => {
    const snaps = identifiableE8Snaps();
    // 在 4 个快照中插入一个 malformed snapshot（round 重复/契约破坏）→ 至少 1 个 malformed transition。
    const broken = makeSnapshot({ round: 2, agentId: "a", behavioralSusceptibilityEstimate: Number.NaN, behavioralSusceptibilityUsable: true });
    const metrics = computeE8Susceptibility([makeRun([snaps[0], broken, snaps[1], snaps[2], snaps[3]], "2.0")]);
    const sm = metrics.susceptibilityMediation!;
    expect(sm.status).toBe("invalid_data");
    expect(sm.malformedObservationCount).toBeGreaterThan(0);
    expect(sm.indirectEffect).toBeUndefined();
  });

  it("each schema-2 transition violation is malformed", () => {
    const violations: Array<{ label: string; patch: (s: CognitiveStateSnapshot[]) => CognitiveStateSnapshot[] }> = [
      { label: "missing usability", patch: snaps => [makeSnapshot({ ...snaps[0], behavioralSusceptibilityUsable: undefined as unknown as boolean }), ...snaps.slice(1)] },
      { label: "missing estimate", patch: snaps => [makeSnapshot({ ...snaps[0], behavioralSusceptibilityEstimate: undefined as unknown as number }), ...snaps.slice(1)] },
      { label: "NaN estimate", patch: snaps => [makeSnapshot({ ...snaps[0], behavioralSusceptibilityEstimate: Number.NaN }), ...snaps.slice(1)] },
      { label: "Infinity estimate", patch: snaps => [makeSnapshot({ ...snaps[0], behavioralSusceptibilityEstimate: Number.POSITIVE_INFINITY }), ...snaps.slice(1)] },
      { label: "out-of-range estimate", patch: snaps => [makeSnapshot({ ...snaps[0], behavioralSusceptibilityEstimate: 1.5 }), ...snaps.slice(1)] },
      { label: "missing confidence", patch: snaps => [makeSnapshot({ ...snaps[0], behavioralSusceptibilityConfidence: undefined as unknown as number }), ...snaps.slice(1)] },
      { label: "NaN confidence", patch: snaps => [makeSnapshot({ ...snaps[0], behavioralSusceptibilityConfidence: Number.NaN }), ...snaps.slice(1)] },
      { label: "Infinity confidence", patch: snaps => [makeSnapshot({ ...snaps[0], behavioralSusceptibilityConfidence: Number.POSITIVE_INFINITY }), ...snaps.slice(1)] },
      { label: "out-of-range confidence", patch: snaps => [makeSnapshot({ ...snaps[0], behavioralSusceptibilityConfidence: -0.1 }), ...snaps.slice(1)] },
      { label: "non-finite social gain", patch: snaps => [makeSnapshot({ ...snaps[0], susceptibility: Number.NaN, socialUpdateGain: Number.NaN }), ...snaps.slice(1)] },
      { label: "out-of-range social gain", patch: snaps => [makeSnapshot({ ...snaps[0], susceptibility: 1.1, socialUpdateGain: 1.1 }), ...snaps.slice(1)] },
      { label: "broken invariant", patch: snaps => [makeSnapshot({ ...snaps[0], susceptibility: 0.5 }), ...snaps.slice(1)] },
      { label: "non-finite utility", patch: snaps => [makeSnapshot({ ...snaps[0], utility: { A: Number.NaN, B: 0.4 } }), ...snaps.slice(1)] },
      { label: "duplicate round order", patch: snaps => [makeSnapshot({ ...snaps[0], round: 1 }), makeSnapshot({ ...snaps[1], round: 1 }), ...snaps.slice(2)] },
      { label: "out-of-order unique rounds", patch: snaps => [makeSnapshot({ ...snaps[0], round: 2 }), makeSnapshot({ ...snaps[1], round: 1 }), ...snaps.slice(2)] },
    ];
    for (const { label, patch } of violations) {
      const metrics = computeE8Susceptibility([makeRun(patch(identifiableE8Snaps()), "2.0")]);
      expect(metrics.susceptibilityMediation?.status, label).toBe("invalid_data");
      expect(metrics.susceptibilityMediation?.malformedObservationCount, label).toBeGreaterThan(0);
    }
  });

  it("usable=false is counted as unusable and may yield insufficient_data", () => {
    const snaps = identifiableE8Snaps().map((s, i) =>
      i === 0 ? makeSnapshot({ ...s, behavioralSusceptibilityUsable: false }) : s,
    );
    const metrics = computeE8Susceptibility([makeRun(snaps, "2.0")]);
    expect(metrics.susceptibilityMediation?.unusableObservationCount).toBe(1);
    expect(metrics.susceptibilityMediation?.malformedObservationCount).toBe(0);
    // 剩余 2 个 transition < MIN_TRANSITIONS(3) → insufficient_data。
    expect(metrics.susceptibilityMediation?.status).toBe("insufficient_data");
  });

  it("schema-1-only transitions return legacy_mixed_excluded", () => {
    const metrics = computeE8Susceptibility([makeRun(identifiableE8Snaps(), "1.0")]);
    const sm = metrics.susceptibilityMediation!;
    expect(sm.status).toBe("legacy_mixed_excluded");
    expect(sm.legacyMixedExcludedCount).toBe(3); // 4 snapshot → 3 transition
    expect(sm.indirectEffect).toBeUndefined();
  });

  it("fewer than three usable transitions or an unidentifiable design returns insufficient_data without effects/CI", () => {
    const twoTransitions = computeE8Susceptibility([makeRun(identifiableE8Snaps().slice(0, 3), "2.0")]);
    expect(twoTransitions.susceptibilityMediation?.status).toBe("insufficient_data");
    expect(twoTransitions.susceptibilityMediation?.indirectEffect).toBeUndefined();

    // 无变化（estimate 恒 0.5）→ unidentifiable。
    const constant = identifiableE8Snaps().map(s => makeSnapshot({ ...s, behavioralSusceptibilityEstimate: 0.5 }));
    const unidentifiable = computeE8Susceptibility([makeRun(constant, "2.0")]);
    expect(unidentifiable.susceptibilityMediation?.status).toBe("insufficient_data");
    expect(unidentifiable.susceptibilityMediation?.indirectEffect).toBeUndefined();
  });
});

// ============================================================================
// Consumers
// ============================================================================

describe("confirmatory consumers (runTests)", () => {
  it("maps every non-computed E6 status to significant=false, pValue=1, analysisStatus, no-confirmatory conclusion", () => {
    const statuses = ["insufficient_data", "legacy_mixed_excluded", "invalid_data"] as const;
    for (const status of statuses) {
      const metrics: ExperimentMetrics = {
        experimentId: "e6_decoupling",
        runtimeMode: "cognitive",
        sampleSize: 0,
        stateDecoupling: {
          status,
          usableObservationCount: 0,
          legacyMixedExcludedCount: 0,
          unusableObservationCount: 0,
          malformedObservationCount: 0,
          eligibleRunCount: 0,
        },
      };
      const results = runTests(metrics);
      const test = results.find(r => r.experimentId === "e6_decoupling")!;
      expect(test.significant, status).toBe(false);
      expect(test.pValue, status).toBe(1);
      expect(test.analysisStatus, status).toBe(status);
      expect(test.conclusion, status).toMatch(/no confirmatory/);
    }
  });

  it("maps every non-computed E8 status to significant=false, pValue=1, analysisStatus, no-confirmatory conclusion", () => {
    const statuses = ["insufficient_data", "legacy_mixed_excluded", "invalid_data"] as const;
    for (const status of statuses) {
      const metrics: ExperimentMetrics = {
        experimentId: "e8_susceptibility",
        runtimeMode: "cognitive",
        sampleSize: 0,
        susceptibilityMediation: {
          status,
          usableObservationCount: 0,
          legacyMixedExcludedCount: 0,
          unusableObservationCount: 0,
          malformedObservationCount: 0,
        },
      };
      const results = runTests(metrics);
      const test = results.find(r => r.experimentId === "e8_susceptibility")!;
      expect(test.significant, status).toBe(false);
      expect(test.pValue, status).toBe(1);
      expect(test.analysisStatus, status).toBe(status);
      // 显式拒绝确认性 claim 的结论：legacy 用 "cannot support a confirmatory mediation claim"，
      // 其余用 "no confirmatory mediation claim"。
      expect(test.conclusion, status).toMatch(/no confirmatory mediation|cannot support a confirmatory mediation/);
    }
  });

  it("a forged computed E6 missing bootstrap data fails closed as invalid_data (no Fisher-z)", () => {
    const metrics: ExperimentMetrics = {
      experimentId: "e6_decoupling",
      runtimeMode: "cognitive",
      sampleSize: 10,
      stateDecoupling: {
        status: "computed",
        usableObservationCount: 10,
        legacyMixedExcludedCount: 0,
        unusableObservationCount: 0,
        malformedObservationCount: 0,
        eligibleRunCount: 2,
        maxCorrCognitive: 0.3,
        maxCorrBelief: 0.8,
        // 缺 _bootstrapData → 不得用 Fisher-z 兜底。
      },
    };
    const results = runTests(metrics);
    const test = results.find(r => r.experimentId === "e6_decoupling")!;
    expect(test.analysisStatus).toBe("invalid_data");
    expect(test.significant).toBe(false);
    expect(test.pValue).toBe(1);
    expect(test.conclusion).toMatch(/no confirmatory/);
  });
});
