/**
 * susceptibility-split.test.ts — behavioralSusceptibility 与 socialUpdateGain 语义拆分测试
 *
 * 覆盖计划 Batch B §5.6 的核心断言：
 *   1. computeSusceptibility 为 computeSocialUpdateGain 的精确别名；
 *   2. updateUtility 保持精确 DeGroot 公式（无行为回退）；
 *   3. unusable 行为易感性绝不变成公式值；
 *   4. detector input 同时含两量且 provenance 分离；
 *   5. native engine / MeasurementLayer / GovernanceRuntime 统一 helper（含 floor）；
 *   6. authority detector 消费 socialUpdateGain；
 *   7. schema-2 快照的 susceptibility 恒等于 socialUpdateGain（不混合）；
 *   8. E8 对 schema-1 混合易感性 fail-closed，只用 schema-2 usable 行为估计；
 *   9. 新字段不被描述为 probability / causal effect。
 */

import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

import {
  computeSocialUpdateGain,
  computeSusceptibility,
  updateUtility,
  beliefToCognitiveState,
  type Inertia,
  type Confidence,
  type Utility,
} from "@/lib/agent/cognitiveState";
import { MeasurementLayer } from "@/lib/thermodynamics/MeasurementLayer";
import { detectAuthorityBiasCognitive } from "@/lib/governance/cognitiveDetectors";
import type { CognitiveGovernanceState } from "@/lib/governance/types";
import { computeE8Susceptibility } from "../experiments/campaign/pipeline/MetricComputer";
import type { CognitiveStateSnapshot, RawRunData } from "../experiments/campaign/types";

function makeInertia(strength: number): Inertia {
  return {
    estimate: strength,
    confidence: 0.1,
    sourceWeights: { stated: 0.5, rolePrior: 0.5, behavioral: 0 },
    strength,
    source: { evidenceBased: 0, expressionBased: 0, roleBased: strength },
    recentRefutations: 0,
  };
}

function makeConfidence(overall: number): Confidence {
  return {
    estimate: overall,
    confidence: 0.1,
    stated: overall,
    stability: 0.5,
    sourceWeights: { stated: 1, stability: 0 },
    overall,
    evidenceBased: overall,
    stabilityBased: 0.5,
  };
}

describe("susceptibility split — naming & formula equivalence", () => {
  it("computeSusceptibility is an exact deprecated alias of computeSocialUpdateGain", () => {
    const cases: Array<[number, number]> = [
      [0.6, 0.8],
      [0.1, 0.1],
      [0.95, 0.7],
      [0.5, 0.5],
    ];
    for (const [i, c] of cases) {
      expect(computeSusceptibility(makeInertia(i), makeConfidence(c)))
        .toBe(computeSocialUpdateGain(makeInertia(i), makeConfidence(c)));
    }
  });

  it("computeSocialUpdateGain applies the 0.05 floor", () => {
    expect(computeSocialUpdateGain(makeInertia(0.95), makeConfidence(0.7))).toBe(0.05);
    expect(computeSocialUpdateGain(makeInertia(0.3), makeConfidence(0.3))).toBeCloseTo(0.49, 10);
  });

  it("updateUtility keeps the exact DeGroot formula via socialUpdateGain", () => {
    const utility: Utility = {
      scores: { A: 0.5, B: 0.2 },
      topChoice: "A",
      preferenceClarity: 0.3,
      intensity: 0.6,
    };
    const inertia = makeInertia(0.5);
    const confidence = makeConfidence(0.7);
    const others = [{
      agentId: "b",
      utility: { scores: { A: 0.1, B: 0.8 }, topChoice: "B", preferenceClarity: 0.7, intensity: 0.8 },
    }];
    const gain = computeSocialUpdateGain(inertia, confidence);
    const out = updateUtility(utility, true, others, inertia, confidence, ["A", "B"]);
    expect(out.scores.A).toBeCloseTo((1 - gain) * 0.5 + gain * 0.1, 10);
    expect(out.scores.B).toBeCloseTo((1 - gain) * 0.2 + gain * 0.8, 10);
  });

  it("new production code no longer calls the deprecated computeSusceptibility", () => {
    const files = [
      "src/lib/agent/cognitiveState.ts",
      "src/lib/thermodynamics/MeasurementLayer.ts",
      "src/lib/discussion/nativeCognitiveEngine.ts",
      "src/runtime/GovernanceRuntime.ts",
      "experiments/campaign/pipeline/Runner.ts",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      // 逐行检查：跳过函数定义/别名自身，其余不得出现 `computeSusceptibility(` 调用。
      for (const line of src.split("\n")) {
        if (/function\s+computeSusceptibility\s*\(/.test(line)) continue;
        expect(line).not.toMatch(/computeSusceptibility\s*\(/);
      }
    }
  });
});

describe("susceptibility split — builder provenance separation", () => {
  it("unusable behavioral susceptibility never becomes a formula value", () => {
    const layer = new MeasurementLayer();
    const state = beliefToCognitiveState("a1", "Alice", "analyst", 0.5, 0.5);
    state.susceptibility = { estimate: 0.5, confidence: 0.05, usable: false };
    state.inertia.strength = 0.9;
    state.confidence.overall = 0.9;
    layer.setCognitiveStates(new Map([["a1", state]]));

    const input = layer.buildDetectorInput();
    expect(input[0].behavioralSusceptibility!.usable).toBe(false);
    // socialUpdateGain 仍为公式值（含 floor），绝不回退到行为估计。
    expect(input[0].socialUpdateGain).toBeCloseTo(
      computeSocialUpdateGain(state.inertia, state.confidence),
      10,
    );
    expect(input[0].susceptibility).toBe(input[0].socialUpdateGain);
    expect(input[0].behavioralSusceptibility!.estimate).toBe(0.5); // 行为估计保持原样
  });

  it("detector input carries both quantities with distinct provenance", () => {
    const layer = new MeasurementLayer();
    const state = beliefToCognitiveState("a1", "Alice", "analyst", 0.5, 0.5);
    state.susceptibility = { estimate: 0.8, confidence: 0.7, usable: true };
    state.inertia.strength = 0.5;
    state.confidence.overall = 0.7;
    layer.setCognitiveStates(new Map([["a1", state]]));

    const input = layer.buildDetectorInput();
    expect(input[0].socialUpdateGain).toBeCloseTo(0.15, 10); // (1-0.5)(1-0.7)
    expect(input[0].behavioralSusceptibility!.estimate).toBe(0.8);
    expect(input[0].behavioralSusceptibility!.usable).toBe(true);
    expect(input[0].socialUpdateGain).not.toBe(input[0].behavioralSusceptibility!.estimate);
  });

  it("native engine and GovernanceRuntime builders use the shared helper (no inline formula)", () => {
    for (const rel of ["src/lib/discussion/nativeCognitiveEngine.ts", "src/runtime/GovernanceRuntime.ts"]) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src).toContain("computeSocialUpdateGain");
      // 不得再出现手写 (1-strength)*(1-overall) 内联公式。
      expect(src).not.toMatch(/\(1\s*-\s*[A-Za-z_.]+\s*\)\s*\*\s*\(1\s*-\s*[A-Za-z_.]+\s*\)/);
    }
  });

  it("authority detector consumes socialUpdateGain (not behavioral susceptibility)", () => {
    const states: CognitiveGovernanceState[] = [
      makeGovState("a", 0.9, 0.05, 0.5),
      makeGovState("b", 0.3, 0.49, 0.2),
    ];
    const result = detectAuthorityBiasCognitive(states);
    // 不对称度基于 socialUpdateGain：0.49 / 0.05 = 9.8（而非 susceptibility 的 0.5/0.2=2.5）。
    expect(result.socialUpdateGainAsymmetry).toBeCloseTo(9.8, 5);
    expect(result.susceptibilityAsymmetry).toBe(result.socialUpdateGainAsymmetry);
  });
});

function makeGovState(
  agentId: string,
  inertiaStrength: number,
  socialGain: number,
  susceptibility: number,
): CognitiveGovernanceState {
  return {
    agentId,
    utility: { scores: { A: 0.5 }, topChoice: "A", preferenceClarity: 0.3, intensity: 0.5 },
    evidence: { coverage: 0.5, quality: 0.5, diversity: 0.3 },
    inertia: { strength: inertiaStrength },
    confidence: { overall: 0.7 },
    susceptibility,
    socialUpdateGain: socialGain,
  };
}

describe("susceptibility split — campaign schema and E8 fail-closed", () => {
  it("schema-2 snapshot keeps susceptibility pinned to socialUpdateGain (no mixed behavior)", () => {
    const snap: CognitiveStateSnapshot = makeE8Snapshot({
      inertiaStrength: 0.5,
      confidenceOverall: 0.7,
      susceptibility: 0.15,
      socialUpdateGain: 0.15,
      behavioralSusceptibilityEstimate: 0.8,
      behavioralSusceptibilityUsable: true,
    });
    expect(snap.susceptibility).toBe(snap.socialUpdateGain);
    expect(snap.susceptibility).not.toBe(snap.behavioralSusceptibilityEstimate);
  });

  /** 4 个有序 snapshot，inertia 单调、易感性之字形（残差有变化）、utility 变化 → 3 个有效 transition。 */
  function makeUsableSchema2Run(): RawRunData {
    return makeE8Run([
      makeE8Snapshot({ round: 1, inertiaStrength: 0.35, behavioralSusceptibilityEstimate: 0.45, behavioralSusceptibilityUsable: true, utility: { A: 0.6, B: 0.4 } }),
      makeE8Snapshot({ round: 2, inertiaStrength: 0.40, behavioralSusceptibilityEstimate: 0.52, behavioralSusceptibilityUsable: true, utility: { A: 0.5, B: 0.5 } }),
      makeE8Snapshot({ round: 3, inertiaStrength: 0.45, behavioralSusceptibilityEstimate: 0.47, behavioralSusceptibilityUsable: true, utility: { A: 0.4, B: 0.6 } }),
      makeE8Snapshot({ round: 4, inertiaStrength: 0.50, behavioralSusceptibilityEstimate: 0.58, behavioralSusceptibilityUsable: true, utility: { A: 0.3, B: 0.7 } }),
    ], "2.0");
  }

  it("E8 uses schema-2 usable behavior only and counts legacy by transition", () => {
    const schema1Run = makeE8Run([
      makeE8Snapshot({ round: 1, susceptibility: 0.4 }),
      makeE8Snapshot({ round: 2, susceptibility: 0.42 }),
    ], "1.0");
    const schema2Run = makeUsableSchema2Run();

    const metrics = computeE8Susceptibility([schema1Run, schema2Run]);
    expect(metrics.susceptibilityMediation?.status).toBe("computed");
    // 2 个 schema-1 snapshot → 1 个候选 transition。
    expect(metrics.susceptibilityMediation?.legacyMixedExcludedCount).toBe(1);
    expect(metrics.susceptibilityMediation?.usableObservationCount).toBe(3);
    // confirmatory 系列只用 schema-2 usable 行为估计，绝不含 schema-1 混合值。
    expect(metrics.susceptibilityMediation?._bootstrapData?.susceptibilityValues).toEqual([0.45, 0.52, 0.47]);
  });

  it("E8 reports legacy_mixed_excluded when only schema-1 data exists", () => {
    const schema1Run = makeE8Run([
      makeE8Snapshot({ round: 1, susceptibility: 0.4 }),
      makeE8Snapshot({ round: 2, susceptibility: 0.42 }),
    ], "1.0");
    const metrics = computeE8Susceptibility([schema1Run]);
    expect(metrics.susceptibilityMediation?.status).toBe("legacy_mixed_excluded");
    expect(metrics.susceptibilityMediation?.legacyMixedExcludedCount).toBe(1); // n=2 → 1 transition
    expect(metrics.susceptibilityMediation?.indirectEffect).toBeUndefined();
  });

  it("E8 fails closed on a single usable transition (insufficient_data)", () => {
    const run = makeE8Run([
      makeE8Snapshot({ round: 1, behavioralSusceptibilityEstimate: 0.45, behavioralSusceptibilityUsable: true, utility: { A: 0.6, B: 0.4 } }),
      makeE8Snapshot({ round: 2, behavioralSusceptibilityEstimate: 0.52, behavioralSusceptibilityUsable: true, utility: { A: 0.5, B: 0.5 } }),
    ], "2.0");
    const metrics = computeE8Susceptibility([run]);
    expect(metrics.susceptibilityMediation?.status).toBe("insufficient_data");
    expect(metrics.susceptibilityMediation?.usableObservationCount).toBe(1);
    expect(metrics.susceptibilityMediation?.indirectEffect).toBeUndefined();
  });

  it("E8 fails closed on malformed schema-2 estimates (missing/NaN/Infinity/out-of-range)", () => {
    const malformed: Array<{ est: number | undefined; tag: string }> = [
      { est: undefined, tag: "missing" },
      { est: Number.NaN, tag: "NaN" },
      { est: Number.POSITIVE_INFINITY, tag: "Infinity" },
      { est: 1.5, tag: "out-of-range-high" },
      { est: -0.2, tag: "out-of-range-low" },
    ];
    for (const { est, tag } of malformed) {
      const run = makeE8Run([
        makeE8Snapshot({ round: 1, behavioralSusceptibilityUsable: true, behavioralSusceptibilityEstimate: est, utility: { A: 0.6, B: 0.4 } }),
        makeE8Snapshot({ round: 2, behavioralSusceptibilityUsable: true, behavioralSusceptibilityEstimate: est, utility: { A: 0.5, B: 0.5 } }),
      ], "2.0");
      const metrics = computeE8Susceptibility([run]);
      expect(metrics.susceptibilityMediation?.status, `case=${tag}`).not.toBe("computed");
      expect(metrics.susceptibilityMediation?.malformedObservationCount, `case=${tag}`).toBe(1);
      expect(metrics.susceptibilityMediation?.indirectEffect, `case=${tag}`).toBeUndefined();
    }
  });

  it("E8 counts unusable schema-2 transitions separately and never computes on no variation", () => {
    const run = makeE8Run([
      makeE8Snapshot({ round: 1, behavioralSusceptibilityUsable: false, behavioralSusceptibilityEstimate: 0.8 }),
      makeE8Snapshot({ round: 2, behavioralSusceptibilityUsable: true, behavioralSusceptibilityEstimate: 0.8 }),
      makeE8Snapshot({ round: 3, behavioralSusceptibilityUsable: true, behavioralSusceptibilityEstimate: 0.8 }),
      makeE8Snapshot({ round: 4, behavioralSusceptibilityUsable: true, behavioralSusceptibilityEstimate: 0.8 }),
    ], "2.0");
    const metrics = computeE8Susceptibility([run]);
    // transition1（snap1 不可用）→ unusableObservationCount=1；
    // 其余 2 个 transition 的 estimate 恒 0.8（无变化）→ insufficient_data。
    expect(metrics.susceptibilityMediation?.unusableObservationCount).toBe(1);
    expect(metrics.susceptibilityMediation?.usableObservationCount).toBe(2);
    expect(metrics.susceptibilityMediation?.status).toBe("insufficient_data");
  });
});

function makeE8Snapshot(over: Partial<CognitiveStateSnapshot> = {}): CognitiveStateSnapshot {
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

function makeE8Run(snaps: CognitiveStateSnapshot[], schema: string | undefined): RawRunData {
  return {
    runId: "r",
    experimentId: "e8_susceptibility",
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
