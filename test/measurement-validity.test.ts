/**
 * Measurement Validity v1 — adversarial tests (36 matrix items + extras) and
 * the Codex red-light tests (P0-D). Every tamper must be rejected or
 * equivalently fail closed; nothing claims external authenticity, tamper-proofing,
 * or latent-belief access. All fixtures deterministic; no LLM.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1,
  createMeasurementValidityDesignV1,
  createMeasurementValidityFreezeV1,
  createMeasurementValidityResultIndexV1,
  deriveMeasurementApplicableMetricsV1,
  loadOrCreateMeasurementValidityDesignV1,
  loadOrCreateMeasurementValidityFreezeV1,
  loadOrCreateMeasurementValidityResultIndexV1,
  readMeasurementValidityDesignV1,
  readMeasurementValidityResultIndexV1,
  resolveMeasurementValidityResultIndexV1Path,
  validateFreezeAgainstDesignV1,
  validateFreezeTaskBankBindingV1,
  validateMeasurementLeakageGroupIsolationV1,
  validateMeasurementValidityDesignAgainstAdmissionV1,
  validateMeasurementValidityDesignV1,
  validateMeasurementValidityFreezeV1,
  validateMeasurementValidityResultIndexAgainstSourcesV1,
  validateMeasurementValidityResultIndexV1,
  validateResultIndexAgainstFreezeV1,
  type MeasurementRegisteredCellV1,
  type MeasurementValidityDesignV1,
  type MeasurementValidityFreezeV1,
  type MeasurementValidityResultCellV1,
  type MeasurementValidityResultIndexV1,
} from "../experiments/campaign/measurement/measurementValidity";
import {
  adjacentMonotonicityViolationRateV1,
  argmaxSetAgreementV1,
  argmaxSetV1,
  blockSpearmanV1,
  brierDeltaV1,
  clusterBootstrapV1,
  computeCoverageV1,
  computePairCoverageV1,
  directionalEvidenceResponseV1,
  evaluateMeasurementGateV1,
  jsdBase2V1,
  optionEquivarianceV1,
  paraphraseStabilityV1,
  signalToNuisanceRatioV1,
  totalVariationV1,
  validateProbabilityVectorV1,
} from "../experiments/campaign/measurement/measurementValidityAnalysis";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mv-"));
  tempDirs.push(dir);
  return dir;
}

const H = (salt: string) => `sha256:${Array.from({ length: 64 }, (_, i) => (salt.charCodeAt(i % salt.length) % 16).toString(16)).join("")}`;
const ACCEPTED = { status: "accepted" as const, reviewProtocolRef: { id: "review:v1", version: "1.0.0" }, reviewedAt: "2026-08-10T00:00:00.000Z" };
const BEFORE = "2026-08-10T00:00:00.000Z";
const FREEZE_AT = "2026-08-11T00:00:00.000Z";
const PROVIDER = "2026-08-12T00:00:00.000Z";
const AFTER = "2026-08-12T01:00:00.000Z";

function designInput(overrides: Partial<MeasurementValidityDesignV1> = {}) {
  const base: Omit<MeasurementValidityDesignV1, "artifactSchemaRef" | "contentHash"> = {
    designRef: { id: "swarmalpha.measurement.design.v1", version: "1.0.0" },
    instrumentKind: "in_process_explicit",
    measurementRole: "measurement_development",
    beliefKind: "categorical",
    claimOptionCount: 3,
    taskFamilyRef: { id: "swarmalpha.task.hiddenbench-categorical", version: "1.0.0" },
    modelRef: { id: "deepseek:deepseek-chat", version: "1.0.0" },
    invocationConfigHash: H("a"),
    promptRef: { id: "swarmalpha.prompt.v1", version: "1.0.0" },
    baseSemanticTasks: [{ sourceTaskRef: { id: "swarmalpha.task.hiddenbench.1", version: "1.0.0" }, taskDefinitionHash: H("b"), leakageGroupId: "lg:1", semanticReview: ACCEPTED }],
    variants: [
      { variantId: "v:paraphrase", baseSemanticTaskRef: { id: "swarmalpha.task.hiddenbench.1", version: "1.0.0" }, variantTaskDefinitionHash: H("c"), condition: "semantic_paraphrase", semanticReview: ACCEPTED },
      { variantId: "v:perm", baseSemanticTaskRef: { id: "swarmalpha.task.hiddenbench.1", version: "1.0.0" }, variantTaskDefinitionHash: H("d"), condition: "option_permutation", optionMap: { "A": "A", "B": "B", "C": "C" }, semanticReview: ACCEPTED },
      { variantId: "v:strength", baseSemanticTaskRef: { id: "swarmalpha.task.hiddenbench.1", version: "1.0.0" }, variantTaskDefinitionHash: H("e"), condition: "evidence_strength", evidenceLadderId: "ladder:1" },
      { variantId: "v:direction", baseSemanticTaskRef: { id: "swarmalpha.task.hiddenbench.1", version: "1.0.0" }, variantTaskDefinitionHash: H("f"), condition: "evidence_direction", evidenceLadderId: "ladder:1" },
    ],
    evidenceLadders: [{
      ladderId: "ladder:1",
      levels: [
        { level: 1, designatedTarget: "A", payloadHash: H("g") },
        { level: 2, designatedTarget: "A", payloadHash: H("h") },
        { level: 3, designatedTarget: "A", payloadHash: H("i") },
      ],
    }],
    registeredCells: [
      { cellId: "cell:1", blockKey: "block:1", variantId: "v:paraphrase", replicateIndex: 0, conditionAssignedAt: BEFORE },
      { cellId: "cell:2", blockKey: "block:1", variantId: "v:perm", replicateIndex: 0, conditionAssignedAt: BEFORE },
      { cellId: "cell:3", blockKey: "block:2", variantId: "v:strength", replicateIndex: 0, conditionAssignedAt: BEFORE },
      { cellId: "cell:4", blockKey: "block:3", variantId: "v:direction", replicateIndex: 0, conditionAssignedAt: BEFORE },
    ],
    clusterUnit: "leakage_group",
    bootstrapCount: MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1.bootstrapCount,
    bootstrapSeed: "mv-test-seed",
    bootstrapVersion: "1.0.0",
    missingnessPolicy: { policyRef: { id: "swarmalpha.missingness.v1", version: "1.0.0" }, retryPolicy: "none" },
    baselineSelectionRule: "development-strongest-eligible-baseline",
    firstProviderAtBoundary: PROVIDER,
    createdAt: BEFORE,
  };
  return { ...base, ...overrides } as Omit<MeasurementValidityDesignV1, "artifactSchemaRef" | "contentHash">;
}
function makeDesign(overrides: Partial<MeasurementValidityDesignV1> = {}): MeasurementValidityDesignV1 {
  return createMeasurementValidityDesignV1(designInput(overrides));
}
function makeFreeze(design: MeasurementValidityDesignV1): MeasurementValidityFreezeV1 {
  return createMeasurementValidityFreezeV1({
    freezeRef: { id: `${design.designRef.id}:freeze`, version: "1.0.0" },
    designRef: design.designRef,
    designContentHash: design.contentHash,
    instrumentKind: design.instrumentKind,
    measurementRole: design.measurementRole,
    beliefKind: design.beliefKind,
    claimOptionCount: design.claimOptionCount,
    taskBankRef: { id: "swarmalpha.task-bank.v1", version: "1.0.0" },
    taskBankContentHash: H("tb"),
    registeredCells: design.registeredCells,
    registeredPairCount: design.registeredCells.length,
    bootstrap: { clusterUnit: design.clusterUnit, count: design.bootstrapCount, seed: design.bootstrapSeed, version: design.bootstrapVersion },
    thresholds: MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1,
    applicableMetrics: deriveMeasurementApplicableMetricsV1(design),
    baselineRef: { id: "swarmalpha.baseline.development", version: "1.0.0" },
    createdAt: FREEZE_AT,
  });
}
function resultCell(cell: MeasurementRegisteredCellV1, status: string = "valid", instrumentKind: "final_outcome" | "in_process_explicit" = "in_process_explicit"): MeasurementValidityResultCellV1 {
  if (status === "provider_error" || status === "timeout" || status === "unavailable") {
    return { cellId: cell.cellId, status, runId: `run:${cell.cellId}`, absentFields: ["rawArtifactHash", "taskManifestHash"], reason: "provider failure", firstProviderAt: PROVIDER, terminalAt: AFTER };
  }
  const base = { cellId: cell.cellId, runId: `run:${cell.cellId}`, taskManifestHash: H("j"), rawArtifactHash: H("k"), firstProviderAt: PROVIDER, terminalAt: AFTER };
  if (status === "invalid_response") return { ...base, status: "invalid_response" as const };
  if (instrumentKind === "final_outcome") return { ...base, status: "valid" as const, instrumentKind: "final_outcome" as const, finalOutcomeHash: H("l") };
  return { ...base, status: "valid" as const, instrumentKind: "in_process_explicit" as const, interactionTraceHash: H("m") };
}
function makeIndex(freeze: MeasurementValidityFreezeV1, statuses: string[] = [], instrumentKind: "final_outcome" | "in_process_explicit" = "in_process_explicit"): MeasurementValidityResultIndexV1 {
  return createMeasurementValidityResultIndexV1({
    resultIndexRef: { id: `${freeze.freezeRef.id}:index`, version: "1.0.0" },
    designRef: freeze.designRef, designContentHash: freeze.designContentHash,
    freezeRef: freeze.freezeRef, freezeContentHash: freeze.contentHash,
    registeredCellCount: freeze.registeredCells.length,
    cells: freeze.registeredCells.map((cell, i) => resultCell(cell, statuses[i] ?? "valid", instrumentKind)),
    sealedAt: AFTER,
  });
}

// ============================================================================
// B1 Design authority
// ============================================================================

describe("B1 design authority", () => {
  it("rejects duplicate block identity", () => {
    const design = designInput();
    design.registeredCells = [
      { cellId: "cell:1", blockKey: "block:1", variantId: "v:paraphrase", replicateIndex: 0, conditionAssignedAt: BEFORE },
      { cellId: "cell:2", blockKey: "block:1", variantId: "v:paraphrase", replicateIndex: 0, conditionAssignedAt: BEFORE },
    ];
    expect(() => createMeasurementValidityDesignV1(design)).toThrow(/duplicate block/);
  });
  it("rejects duplicate variant identity", () => {
    const design = designInput();
    design.variants = [design.variants[0], { ...design.variants[0], variantTaskDefinitionHash: H("z") }];
    expect(() => createMeasurementValidityDesignV1(design)).toThrow(/variant ids must be unique/);
  });
  it("rejects a referenced taskDefinitionHash not admitted by the task bank", () => {
    const design = makeDesign();
    expect(() => validateMeasurementValidityDesignAgainstAdmissionV1(design, [H("b")])).toThrow(/not admitted/);
    expect(() => validateMeasurementValidityDesignAgainstAdmissionV1(design, [H("b"), H("c"), H("d"), H("e"), H("f")])).not.toThrow();
  });
  it("rejects invalid model/config/prompt identity (drift is a new design)", () => {
    const design = designInput();
    design.modelRef = { id: "", version: "1.0.0" };
    expect(() => createMeasurementValidityDesignV1(design)).toThrow(/modelRef/);
    const d1 = makeDesign();
    const d2 = makeDesign({ modelRef: { id: "other-model", version: "1.0.0" } });
    expect(d2.contentHash).not.toBe(d1.contentHash);
  });
  it("rejects condition assignment at or after the first provider boundary", () => {
    const design = designInput();
    design.registeredCells[0].conditionAssignedAt = PROVIDER;
    expect(() => createMeasurementValidityDesignV1(design)).toThrow(/must precede the first provider/);
  });
  it("rejects a retry log masquerading as a replicate (single-attempt enforced)", () => {
    const design = designInput();
    (design as unknown as Record<string, unknown>).retryLog = [{ cellId: "cell:1", attempt: 2 }];
    expect(() => createMeasurementValidityDesignV1(design)).toThrow(/fields differ/);
    expect(design.missingnessPolicy.retryPolicy).toBe("none");
  });
  it("rejects non-finite numbers, cycles, class instances, sparse arrays, and unexpected fields", () => {
    const nan = designInput();
    (nan as { bootstrapCount: unknown }).bootstrapCount = Number.NaN;
    expect(() => createMeasurementValidityDesignV1(nan)).toThrow(/finite/);
    const cyclic = designInput() as unknown as Record<string, unknown>;
    const self: Record<string, unknown> = {};
    self.designRef = self;
    cyclic.designRef = self;
    expect(() => createMeasurementValidityDesignV1(cyclic as never)).toThrow(/cycles/);
    const klass = designInput() as unknown as Record<string, unknown>;
    class Foo { kind = "x"; }
    klass.baseSemanticTasks = [new Foo()];
    expect(() => createMeasurementValidityDesignV1(klass as never)).toThrow(/plain objects/);
    const sparse = designInput();
    const arr = new Array(3);
    arr[0] = { variantId: "v", baseSemanticTaskRef: { id: "x", version: "1.0.0" }, variantTaskDefinitionHash: H("c"), condition: "exact_repeat" };
    (sparse as unknown as Record<string, unknown>).variants = arr;
    expect(() => createMeasurementValidityDesignV1(sparse as never)).toThrow(/sparse/);
  });
  it("publishes no-replace with read isolation and per-ref paths", () => {
    const outputDir = tmpDir();
    const created = makeDesign();
    const first = loadOrCreateMeasurementValidityDesignV1({ outputDir, designRef: created.designRef, contentHash: created.contentHash, createDesign: () => created });
    const second = loadOrCreateMeasurementValidityDesignV1({ outputDir, designRef: created.designRef, contentHash: created.contentHash, createDesign: () => created });
    expect(second.contentHash).toBe(first.contentHash);
    // A conflicting design with a different contentHash lands on a different path; the first path is untouched.
    const conflicting = makeDesign({ modelRef: { id: "other", version: "1.0.0" } });
    expect(conflicting.contentHash).not.toBe(first.contentHash);
    const read = readMeasurementValidityDesignV1({ outputDir, designRef: first.designRef, contentHash: first.contentHash });
    expect(read).not.toBeNull();
    read!.baseSemanticTasks[0].leakageGroupId = "mutated";
    const readAgain = readMeasurementValidityDesignV1({ outputDir, designRef: first.designRef, contentHash: first.contentHash });
    expect(readAgain!.baseSemanticTasks[0].leakageGroupId).toBe("lg:1");
  });
});

// ============================================================================
// B2 Perturbation semantics
// ============================================================================

describe("B2 perturbation semantics", () => {
  it("rejects a paraphrase variant without accepted semantic review", () => {
    const design = designInput();
    design.variants[0] = { ...design.variants[0], semanticReview: { status: "not_reviewed" } };
    expect(() => createMeasurementValidityDesignV1(design)).toThrow(/accepted semantic review/);
  });
  it("rejects a non-bijective option map", () => {
    const design = designInput();
    design.variants[1] = { ...design.variants[1], optionMap: { "A": "A", "B": "A", "C": "C" } };
    expect(() => createMeasurementValidityDesignV1(design)).toThrow(/bijection|bijective/);
    design.variants[1] = { ...design.variants[1], optionMap: { "A": "A", "B": "B", "C": "A" } };
    expect(() => createMeasurementValidityDesignV1(design)).toThrow(/bijection|bijective/);
  });
  it("fails closed on option-map claim drift (remap to a non-canonical base option)", () => {
    const probs = (opts: string[]) => opts.map((option, i) => ({ option, probability: i === 0 ? 0.6 : 0.2 }));
    expect(() => optionEquivarianceV1({ pairs: [{ base: probs(["A", "B", "C"]), variant: probs(["X", "Y", "Z"]), optionMap: { "X": "A", "Y": "D", "Z": "C" } }] })).toThrow(/mapping drift/);
    // A missing variant mapping is also fail-closed.
    expect(() => optionEquivarianceV1({ pairs: [{ base: probs(["A", "B", "C"]), variant: probs(["X", "Y", "Z"]), optionMap: { "X": "A", "Y": "B" } }] })).toThrow(/mapping drift/);
  });
  it("rejects an invalid evidence ladder", () => {
    const two = designInput();
    two.evidenceLadders = [{ ladderId: "ladder:1", levels: [{ level: 1, designatedTarget: "A", payloadHash: H("g") }, { level: 2, designatedTarget: "A", payloadHash: H("h") }] }];
    expect(() => createMeasurementValidityDesignV1(two)).toThrow(/at least three/);
    const mixedTarget = designInput();
    mixedTarget.evidenceLadders = [{ ladderId: "ladder:1", levels: [{ level: 1, designatedTarget: "A", payloadHash: H("g") }, { level: 2, designatedTarget: "B", payloadHash: H("h") }, { level: 3, designatedTarget: "A", payloadHash: H("i") }] }];
    expect(() => createMeasurementValidityDesignV1(mixedTarget)).toThrow(/single consistent target/);
  });
  it("rejects a natural task masquerading as a known-strength fixture (no frozen ladder)", () => {
    const design = designInput();
    delete (design.variants[2] as { evidenceLadderId?: string }).evidenceLadderId;
    expect(() => createMeasurementValidityDesignV1(design)).toThrow(/frozen evidence ladder/);
    const unregistered = designInput();
    unregistered.variants[2] = { ...unregistered.variants[2], evidenceLadderId: "ladder:nonexistent" };
    expect(() => createMeasurementValidityDesignV1(unregistered)).toThrow(/must reference a registered ladder/);
  });
  it("keeps information add/remove and model stratum distinct", () => {
    const d1 = makeDesign();
    const d2 = makeDesign({ modelRef: { id: "other", version: "1.0.0" } });
    expect(d2.contentHash).not.toBe(d1.contentHash);
  });
});

// ============================================================================
// B3 Missingness
// ============================================================================

describe("B3 missingness", () => {
  it("rejects multiple terminal records for one registered request", () => {
    expect(() => computeCoverageV1({ registeredRequests: 2, terminalStatuses: ["valid", "valid", "valid"], validStatuses: ["valid"] })).toThrow(/exactly one/);
  });
  it("keeps registered requests without terminal records in the denominator", () => {
    const coverage = computeCoverageV1({ registeredRequests: 4, terminalStatuses: ["valid", "valid", "provider_error", "timeout"], validStatuses: ["valid"] });
    expect(coverage.terminalCoverage).toBe(1);
    expect(coverage.validCoverage).toBe(0.5);
  });
  it("keeps invalid/unavailable in the denominator, counted separately", () => {
    const coverage = computeCoverageV1({ registeredRequests: 5, terminalStatuses: ["valid", "invalid_response", "provider_error", "timeout", "unavailable"], validStatuses: ["valid"] });
    expect(coverage.validCoverage).toBe(0.2);
    expect(coverage.terminalCounts).toEqual({ valid: 1, invalid_response: 1, provider_error: 1, timeout: 1, unavailable: 1 });
  });
  it("rejects a retry policy that could erase a terminal failure", () => {
    const design = designInput();
    (design.missingnessPolicy as { retryPolicy: string }).retryPolicy = "retry_once";
    expect(() => createMeasurementValidityDesignV1(design)).toThrow(/retryPolicy must be none/);
  });
  it("excludes incomplete pairs from the paired numerator but still reports pair coverage", () => {
    expect(computePairCoverageV1({ registeredPairs: 10, completePairs: 7 })).toBe(0.7);
    const stability = paraphraseStabilityV1({ pairs: [{ left: [{ option: "A", probability: 0.9 }, { option: "B", probability: 0.1 }], right: [{ option: "A", probability: 0.85 }, { option: "B", probability: 0.15 }] }] });
    expect(Number.isFinite(stability.medianJsd)).toBe(true);
  });
  it("does not mask a failing stratum behind a passing overall average", () => {
    const design = makeDesign();
    const gate = evaluateMeasurementGateV1({ freeze: makeFreeze(design), metrics: passMetrics({ stratumCoverage: [{ stratum: "s1", coverage: 0.7 }] }) });
    expect(gate.blockedGates).toContain("stratum:s1");
  });
});

// ============================================================================
// B4 Analysis replay
// ============================================================================

describe("B4 analysis replay", () => {
  it("uses base-2 JSD: closed-form value 1 for (1,0) vs (0,1)", () => {
    expect(jsdBase2V1([1, 0], [0, 1])).toBeCloseTo(1, 12);
    expect(jsdBase2V1([1, 0], [1, 0])).toBeCloseTo(0, 12);
  });
  it("remaps variant probabilities to canonical coordinates before comparing", () => {
    const result = optionEquivarianceV1({ pairs: [{
      base: [{ option: "A", probability: 0.8 }, { option: "B", probability: 0.2 }],
      variant: [{ option: "B", probability: 0.2 }, { option: "A", probability: 0.8 }],
      optionMap: { "A": "A", "B": "B" },
    }] });
    expect(result.medianTv).toBeCloseTo(0, 12);
  });
  it("keeps ties as sets, never broken by option order", () => {
    const setA = argmaxSetV1([{ option: "A", probability: 0.5 }, { option: "B", probability: 0.5 }, { option: "C", probability: 0 }]);
    const setB = argmaxSetV1([{ option: "B", probability: 0.5 }, { option: "C", probability: 0 }, { option: "A", probability: 0.5 }]);
    expect(setA).toEqual(["A", "B"]);
    expect(argmaxSetAgreementV1(setA, setB)).toBe(1);
  });
  it("uses the correct TV factor", () => {
    expect(totalVariationV1([1, 0], [0, 1])).toBe(1);
    expect(totalVariationV1([0.5, 0.5], [0.25, 0.75])).toBeCloseTo(0.25, 12);
  });
  it("keeps the directional evidence response sign correct", () => {
    expect(directionalEvidenceResponseV1({ supportProbabilityOfTarget: 0.8, counterProbabilityOfTarget: 0.3 })).toBeCloseTo(0.5, 12);
  });
  it("co-reports the SNR numerator and denominator", () => {
    const snr = signalToNuisanceRatioV1({ medianEvidencePairJsd: 0.2, medianParaphrasePairJsd: 0.05, epsilonFrozen: 0.01 });
    expect(snr.numerator).toBe(0.2);
    expect(snr.denominator).toBe(0.05);
    expect(snr.ratio).toBe(4);
  });
  it("freezes the baseline and computes Brier delta via the claim contract", () => {
    const claim = {
      id: "c", proposition: "p", domain: "d", createdAt: BEFORE,
      options: ["A", "B", "C"], resolutionPolicy: { kind: "categorical" as const, resolverId: "r" },
    };
    const delta = brierDeltaV1({
      claim,
      reportValue: { kind: "categorical", probabilities: { "A": 0.9, "B": 0.05, "C": 0.05 } },
      baselineValue: { kind: "categorical", probabilities: { "A": 1 / 3, "B": 1 / 3, "C": 1 / 3 } },
      resolution: { claimId: "c", kind: "categorical", outcome: "A", resolverId: "r", resolvedAt: AFTER },
    });
    // Report Brier 0.015 minus uniform-baseline Brier 2/3.
    expect(delta).toBeCloseTo(0.015 - 2 / 3, 10);
  });
  it("resamples the primary uncertainty at the leakage/base-task cluster level", () => {
    const boot = clusterBootstrapV1({ clusters: [{ clusterId: "c1", values: [1] }, { clusterId: "c2", values: [2] }, { clusterId: "c3", values: [3] }], seed: "s", count: 100, lowerAlpha: 0.05, upperAlpha: 0.95 });
    expect(boot.resamples.length).toBe(100);
    expect(boot.lower).toBeLessThanOrEqual(boot.upper);
  });
  it("rejects a freeze whose bootstrap count or thresholds differ from the frozen gate", () => {
    const design = makeDesign();
    const freezeInput = {
      freezeRef: { id: `${design.designRef.id}:freeze`, version: "1.0.0" },
      designRef: design.designRef, designContentHash: design.contentHash,
      instrumentKind: design.instrumentKind, measurementRole: design.measurementRole,
      beliefKind: design.beliefKind, claimOptionCount: design.claimOptionCount,
      taskBankRef: { id: "swarmalpha.task-bank.v1", version: "1.0.0" }, taskBankContentHash: H("tb"),
      registeredCells: design.registeredCells, registeredPairCount: design.registeredCells.length,
      bootstrap: { clusterUnit: design.clusterUnit, count: 500, seed: design.bootstrapSeed, version: design.bootstrapVersion },
      thresholds: MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1,
      applicableMetrics: deriveMeasurementApplicableMetricsV1(design),
      baselineRef: { id: "swarmalpha.baseline.development", version: "1.0.0" }, createdAt: FREEZE_AT,
    };
    expect(() => createMeasurementValidityFreezeV1(freezeInput)).toThrow(/bootstrap count/);
    expect(() => createMeasurementValidityFreezeV1({ ...freezeInput, bootstrap: { ...freezeInput.bootstrap, count: 10000 } })).not.toThrow();
  });
  it("rejects a sealed-then-rewrite via the no-replace store", () => {
    const outputDir = tmpDir();
    const design = makeDesign();
    const freeze = makeFreeze(design);
    const index = makeIndex(freeze);
    const first = loadOrCreateMeasurementValidityResultIndexV1({ outputDir, resultIndexRef: index.resultIndexRef, contentHash: index.contentHash, createIndex: () => index });
    const tamperedCell = { ...(resultCell(freeze.registeredCells[0]) as Extract<MeasurementValidityResultCellV1, { status: "valid"; instrumentKind: "in_process_explicit" }>), rawArtifactHash: H("0") };
    const tamperedCells: MeasurementValidityResultCellV1[] = [tamperedCell, ...freeze.registeredCells.slice(1).map(cell => resultCell(cell))];
    const tampered = createMeasurementValidityResultIndexV1({
      resultIndexRef: { id: `${freeze.freezeRef.id}:index`, version: "1.0.0" },
      designRef: freeze.designRef, designContentHash: freeze.designContentHash,
      freezeRef: freeze.freezeRef, freezeContentHash: freeze.contentHash,
      registeredCellCount: freeze.registeredCells.length, cells: tamperedCells, sealedAt: AFTER,
    });
    // A self-consistent rehash has a different contentHash and cannot overwrite
    // the sealed artifact at the original ref path.
    const raced = loadOrCreateMeasurementValidityResultIndexV1({ outputDir, resultIndexRef: tampered.resultIndexRef, contentHash: tampered.contentHash, createIndex: () => tampered });
    expect(raced.contentHash).not.toBe(first.contentHash);
    expect(fs.existsSync(resolveMeasurementValidityResultIndexV1Path(outputDir, index.resultIndexRef, index.contentHash))).toBe(true);
    expect(readMeasurementValidityResultIndexV1({ outputDir, resultIndexRef: index.resultIndexRef, contentHash: index.contentHash })!.contentHash).toBe(first.contentHash);
  });
});

// ============================================================================
// B5 Gate state
// ============================================================================

function passMetrics(overrides: Partial<Parameters<typeof evaluateMeasurementGateV1>[0]["metrics"]> = {}) {
  return {
    validCoverage: 0.95, validCoverageClusterLowerBound: 0.85, stratumCoverage: [{ stratum: "s1", coverage: 0.9 }],
    pairCompleteness: 0.9, terminalFailureStratum: [{ stratum: "s1", failureRate: 0.05 }],
    paraphraseMedianJsd: 0.02, paraphraseP90Jsd: 0.08, paraphraseArgmaxAgreement: 0.95,
    equivarianceMedianTv: 0.02, equivarianceP90Tv: 0.08, equivarianceArgmaxAgreement: 0.95,
    directionLowerBound: 0.2, directionPairedMedian: 0.3, strengthDirectionLowerBound: 0.1, strengthViolationRate: 0.05,
    snrPoint: 3, snrLowerBound: 1.5, predictiveUpperBound: -0.05, independentClusterCount: 25,
    transportStrata: ["model:deepseek", "task-family:hiddenbench"], unexplainedDirectionReversalCount: 0,
    ...overrides,
  };
}

describe("B5 gate state", () => {
  it("does not skip Q levels: a failing Q1 gate blocks Q2 even when predictive increment passes", () => {
    const design = makeDesign();
    const gate = evaluateMeasurementGateV1({ freeze: makeFreeze(design), metrics: passMetrics({ paraphraseMedianJsd: 0.4 }) });
    expect(gate.q0).toBe(true);
    expect(gate.q1).toBe(false);
    expect(gate.q2).toBe(false);
    expect(gate.q3).toBe(false);
  });
  it("declares DEFER_INSUFFICIENT rather than GO when independent clusters are scarce", () => {
    const gate = evaluateMeasurementGateV1({ freeze: makeFreeze(makeDesign()), metrics: passMetrics({ independentClusterCount: 5 }) });
    expect(gate.conclusion).toBe("DEFER_INSUFFICIENT");
  });
  it("is non-compensatory: one failing gate cannot be offset by others", () => {
    const gate = evaluateMeasurementGateV1({ freeze: makeFreeze(makeDesign()), metrics: passMetrics({ directionLowerBound: -0.1 }) });
    expect(gate.blockedGates).toContain("directionResponse");
    expect(gate.conclusion).not.toBe("GO");
  });
  it("does not let explicit Q1 automatically grant detector/control authority", () => {
    const gate = evaluateMeasurementGateV1({ freeze: makeFreeze(makeDesign()), metrics: passMetrics() });
    expect(gate.q1).toBe(true);
    expect("detectorAuthorized" in gate).toBe(false);
  });
  it("does not let final Q2 overclaim latent belief or governance effect", () => {
    const gate = evaluateMeasurementGateV1({ freeze: makeFreeze(makeDesign()), metrics: passMetrics() });
    expect(gate.q2).toBe(true);
    expect("latentBeliefMeasured" in gate).toBe(false);
    expect("governanceEffective" in gate).toBe(false);
  });
});

// ============================================================================
// Required extras (from the original handoff)
// ============================================================================

describe("required extras", () => {
  it("freeze cannot contain future raw/final hashes", () => {
    const design = makeDesign();
    const freeze = makeFreeze(design);
    expect("rawArtifactHash" in freeze).toBe(false);
    expect("finalOutcomeHash" in freeze).toBe(false);
    const tampered = { ...freeze, futureRawHash: H("f") };
    expect(() => validateMeasurementValidityFreezeV1(tampered as never)).toThrow(/fields differ/);
  });
  it("result index cannot seal before every registered cell is terminal", () => {
    const design = makeDesign();
    const freeze = makeFreeze(design);
    expect(() => createMeasurementValidityResultIndexV1({
      resultIndexRef: { id: `${freeze.freezeRef.id}:index`, version: "1.0.0" },
      designRef: freeze.designRef, designContentHash: freeze.designContentHash,
      freezeRef: freeze.freezeRef, freezeContentHash: freeze.contentHash,
      registeredCellCount: freeze.registeredCells.length, cells: [resultCell(freeze.registeredCells[0])], sealedAt: AFTER,
    })).toThrow(/cell count/);
  });
  it("result index cannot add, delete, or replace registered cells", () => {
    const design = makeDesign();
    const freeze = makeFreeze(design);
    const index = makeIndex(freeze);
    expect(() => validateResultIndexAgainstFreezeV1(index, freeze)).not.toThrow();
    const extra = { ...index, cells: [...index.cells, resultCell(freeze.registeredCells[0])] };
    expect(() => validateResultIndexAgainstFreezeV1(extra, freeze)).toThrow(/cell count|cell set differs/);
  });
  it("isolates measurement roles from task-bank splits and from each other", () => {
    const dev = makeDesign();
    const heldout = makeDesign({ measurementRole: "sealed_measurement_heldout", baseSemanticTasks: [{ sourceTaskRef: { id: "swarmalpha.task.hiddenbench.2", version: "1.0.0" }, taskDefinitionHash: H("n"), leakageGroupId: "lg:heldout", semanticReview: ACCEPTED }], variants: designInput().variants.map(variant => ({ ...variant, baseSemanticTaskRef: { id: "swarmalpha.task.hiddenbench.2", version: "1.0.0" } })) });
    expect(() => validateMeasurementLeakageGroupIsolationV1([dev, heldout])).not.toThrow();
    const heldoutSameGroup = makeDesign({ measurementRole: "sealed_measurement_heldout" });
    expect(() => validateMeasurementLeakageGroupIsolationV1([dev, heldoutSameGroup])).toThrow(/crosses measurement roles/);
  });
  it("an in-process instrument cannot silently inherit Q1; it carries its own frozen contract identity", () => {
    const design = designInput();
    delete (design as { modelRef?: unknown }).modelRef;
    expect(() => createMeasurementValidityDesignV1(design)).toThrow(/fields differ|modelRef/);
    const d1 = makeDesign();
    const d2 = makeDesign({ promptRef: { id: "swarmalpha.prompt.v2", version: "1.0.0" } });
    expect(d2.contentHash).not.toBe(d1.contentHash);
  });
  it("detects a natural-log JSD through the closed-form base-2 fixture", () => {
    expect(jsdBase2V1([1, 0], [0, 1])).toBeCloseTo(1, 12);
    expect(jsdBase2V1([1, 0], [0, 1])).not.toBeCloseTo(Math.log(2), 6);
  });
  it("allows permutation variant probabilities to differ: the difference is the equivariance estimand", () => {
    const result = optionEquivarianceV1({ pairs: [{
      base: [{ option: "A", probability: 0.8 }, { option: "B", probability: 0.2 }],
      variant: [{ option: "A", probability: 0.2 }, { option: "B", probability: 0.8 }],
      optionMap: { "A": "A", "B": "B" },
    }] });
    expect(result.medianTv).toBeCloseTo(0.6, 12);
  });
  it("still computes complete-block estimands below the pair-coverage gate, but must not GO", () => {
    const stability = paraphraseStabilityV1({ pairs: [{ left: [{ option: "A", probability: 0.9 }, { option: "B", probability: 0.1 }], right: [{ option: "A", probability: 0.85 }, { option: "B", probability: 0.15 }] }] });
    expect(Number.isFinite(stability.medianJsd)).toBe(true);
    const gate = evaluateMeasurementGateV1({ freeze: makeFreeze(makeDesign()), metrics: passMetrics({ pairCompleteness: 0.5 }) });
    expect(gate.blockedGates).toContain("pairCompleteness");
    expect(gate.conclusion).not.toBe("GO");
  });
  it("does not claim external authenticity for the result index", () => {
    const index = makeIndex(makeFreeze(makeDesign()));
    expect("signature" in index).toBe(false);
    expect("trustedTimestamp" in index).toBe(false);
    expect(() => validateMeasurementValidityResultIndexV1(index)).not.toThrow();
  });
});

// ============================================================================
// P0-A authority closure (Codex red-light)
// ============================================================================

describe("P0-A authority closure", () => {
  it("binds the freeze to the design: content drift is rejected", () => {
    const design = makeDesign();
    const freeze = makeFreeze(design);
    expect(() => validateFreezeAgainstDesignV1(freeze, design)).not.toThrow();
    const drifted = makeDesign({ modelRef: { id: "other", version: "1.0.0" } });
    expect(() => validateFreezeAgainstDesignV1(freeze, drifted)).toThrow(/does not bind the supplied design/);
    // Cells are covered by the design content hash; any cell change is a design
    // drift and is caught by the design-binding check.
    const driftedCells = makeDesign({ registeredCells: design.registeredCells.slice(0, 1) });
    expect(() => validateFreezeAgainstDesignV1(freeze, driftedCells)).toThrow(/does not bind/);
  });

  it("enforces design/freeze time ordering", () => {
    const design = makeDesign();
    const lateFreeze = createMeasurementValidityFreezeV1({
      freezeRef: { id: `${design.designRef.id}:freeze`, version: "1.0.0" }, designRef: design.designRef, designContentHash: design.contentHash,
      instrumentKind: design.instrumentKind, measurementRole: design.measurementRole, beliefKind: design.beliefKind, claimOptionCount: design.claimOptionCount,
      taskBankRef: { id: "swarmalpha.task-bank.v1", version: "1.0.0" }, taskBankContentHash: H("tb"),
      registeredCells: design.registeredCells, registeredPairCount: design.registeredCells.length,
      bootstrap: { clusterUnit: design.clusterUnit, count: design.bootstrapCount, seed: design.bootstrapSeed, version: design.bootstrapVersion },
      thresholds: MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1, applicableMetrics: deriveMeasurementApplicableMetricsV1(design),
      baselineRef: { id: "b", version: "1.0.0" }, createdAt: AFTER, // after provider boundary
    });
    expect(() => validateFreezeAgainstDesignV1(lateFreeze, design)).toThrow(/must precede the first provider/);
  });

  it("binds the freeze to the validated task bank", () => {
    const design = makeDesign();
    const freeze = makeFreeze(design);
    expect(() => validateFreezeTaskBankBindingV1(freeze, freeze.taskBankContentHash)).not.toThrow();
    expect(() => validateFreezeTaskBankBindingV1(freeze, H("zz"))).toThrow(/differs from the validated task bank/);
  });

  it("binds the result index to the freeze: design and freeze hash drift are rejected", () => {
    const design = makeDesign();
    const freeze = makeFreeze(design);
    const index = makeIndex(freeze);
    expect(() => validateResultIndexAgainstFreezeV1(index, freeze)).not.toThrow();
    const badDesign = createMeasurementValidityResultIndexV1({
      resultIndexRef: index.resultIndexRef, designRef: index.designRef, designContentHash: H("zz"),
      freezeRef: index.freezeRef, freezeContentHash: index.freezeContentHash,
      registeredCellCount: index.registeredCellCount, cells: index.cells, sealedAt: index.sealedAt,
    });
    expect(() => validateResultIndexAgainstFreezeV1(badDesign, freeze)).toThrow(/design binding differs/);
    const badFreeze = createMeasurementValidityResultIndexV1({
      resultIndexRef: index.resultIndexRef, designRef: index.designRef, designContentHash: index.designContentHash,
      freezeRef: index.freezeRef, freezeContentHash: H("yy"),
      registeredCellCount: index.registeredCellCount, cells: index.cells, sealedAt: index.sealedAt,
    });
    expect(() => validateResultIndexAgainstFreezeV1(badFreeze, freeze)).toThrow(/freeze binding differs/);
  });

  it("requires firstProviderAt after the freeze and sealedAt after every terminalAt", () => {
    const design = makeDesign();
    const freeze = makeFreeze(design);
    const index = makeIndex(freeze);
    expect(() => validateResultIndexAgainstFreezeV1(index, freeze)).not.toThrow();
    const earlyProvider = createMeasurementValidityResultIndexV1({
      resultIndexRef: index.resultIndexRef, designRef: index.designRef, designContentHash: index.designContentHash,
      freezeRef: index.freezeRef, freezeContentHash: index.freezeContentHash,
      registeredCellCount: index.registeredCellCount,
      cells: index.cells.map(cell => ({ ...cell, firstProviderAt: FREEZE_AT })),
      sealedAt: index.sealedAt,
    });
    expect(() => validateResultIndexAgainstFreezeV1(earlyProvider, freeze)).toThrow(/firstProviderAt must follow the freeze/);
    const lateTerminal = createMeasurementValidityResultIndexV1({
      resultIndexRef: index.resultIndexRef, designRef: index.designRef, designContentHash: index.designContentHash,
      freezeRef: index.freezeRef, freezeContentHash: index.freezeContentHash,
      registeredCellCount: index.registeredCellCount,
      cells: index.cells.map(cell => ({ ...cell, terminalAt: "2026-08-12T02:00:00.000Z" })),
      sealedAt: index.sealedAt,
    });
    expect(() => validateResultIndexAgainstFreezeV1(lateTerminal, freeze)).toThrow(/must not follow sealedAt/);
  });

  it("enforces status-specific source requirements: failure cells need no fabricated hashes", () => {
    const design = makeDesign();
    const freeze = makeFreeze(design);
    const failureIndex = makeIndex(freeze, ["provider_error", "valid", "valid", "valid"]);
    expect(() => validateMeasurementValidityResultIndexV1(failureIndex)).not.toThrow();
    const fabricated = failureIndex.cells[0] as { absentFields: string[] } & { rawArtifactHash?: string };
    const forged = { ...failureIndex, cells: [{ ...failureIndex.cells[0], rawArtifactHash: H("x") }, ...failureIndex.cells.slice(1)] };
    expect(() => validateMeasurementValidityResultIndexV1(forged)).toThrow(/fields differ/);
  });

  it("cross-replays source hashes against the actual artifacts", () => {
    const design = makeDesign();
    const freeze = makeFreeze(design);
    const index = makeIndex(freeze);
    const sources = index.cells.map(cell => ({ cellId: cell.cellId, hashes: extractHashes(cell) }));
    expect(() => validateMeasurementValidityResultIndexAgainstSourcesV1(index, sources)).not.toThrow();
    const bad = sources.map((source, i) => i === 0 ? { ...source, hashes: { ...source.hashes, rawArtifactHash: H("00") } } : source);
    expect(() => validateMeasurementValidityResultIndexAgainstSourcesV1(index, bad)).toThrow(/do not match the actual artifact/);
    const failureIndex = makeIndex(freeze, ["provider_error", "valid", "valid", "valid"]);
    // A failure cell carrying fabricated source hashes must be rejected.
    const fabricated = failureIndex.cells.map(cell => cell.status === "provider_error"
      ? { cellId: cell.cellId, hashes: { rawArtifactHash: H("x"), taskManifestHash: H("y") } }
      : { cellId: cell.cellId, hashes: extractHashes(cell) });
    expect(() => validateMeasurementValidityResultIndexAgainstSourcesV1(failureIndex, fabricated)).toThrow(/must not carry fabricated source hashes/);
  });

  it("keeps two result indexes in the same directory collision-free (per-ref paths)", () => {
    const outputDir = tmpDir();
    const design = makeDesign();
    const freeze = makeFreeze(design);
    const indexA = makeIndex(freeze);
    const indexB = createMeasurementValidityResultIndexV1({
      resultIndexRef: { id: `${freeze.freezeRef.id}:index:v2`, version: "1.0.0" }, designRef: freeze.designRef, designContentHash: freeze.designContentHash,
      freezeRef: freeze.freezeRef, freezeContentHash: freeze.contentHash, registeredCellCount: freeze.registeredCells.length,
      cells: freeze.registeredCells.map(cell => resultCell(cell)), sealedAt: AFTER,
    });
    loadOrCreateMeasurementValidityResultIndexV1({ outputDir, resultIndexRef: indexA.resultIndexRef, contentHash: indexA.contentHash, createIndex: () => indexA });
    loadOrCreateMeasurementValidityResultIndexV1({ outputDir, resultIndexRef: indexB.resultIndexRef, contentHash: indexB.contentHash, createIndex: () => indexB });
    const files = fs.readdirSync(outputDir).filter(f => f.includes("measurement-result-index"));
    expect(files.length).toBe(2);
  });

  it("fails closed when the existing artifact contentHash differs from the caller's expectation", () => {
    const outputDir = tmpDir();
    const design = makeDesign();
    const freeze = makeFreeze(design);
    const index = makeIndex(freeze);
    loadOrCreateMeasurementValidityResultIndexV1({ outputDir, resultIndexRef: index.resultIndexRef, contentHash: index.contentHash, createIndex: () => index });
    const tampered = createMeasurementValidityResultIndexV1({
      resultIndexRef: index.resultIndexRef, designRef: index.designRef, designContentHash: index.designContentHash,
      freezeRef: index.freezeRef, freezeContentHash: index.freezeContentHash, registeredCellCount: index.registeredCellCount,
      cells: index.cells, sealedAt: index.sealedAt,
    });
    expect(() => loadOrCreateMeasurementValidityResultIndexV1({
      outputDir, resultIndexRef: tampered.resultIndexRef, contentHash: tampered.contentHash, createIndex: () => tampered, expectedContentHash: H("zz"),
    })).toThrow(/differs from the caller's expected/);
  });

  it("evaluates the create callback at most once (reuse does not re-create)", () => {
    const outputDir = tmpDir();
    const index = makeIndex(makeFreeze(makeDesign()));
    const createIndex = vi.fn(() => index);
    loadOrCreateMeasurementValidityResultIndexV1({ outputDir, resultIndexRef: index.resultIndexRef, contentHash: index.contentHash, createIndex });
    expect(createIndex).toHaveBeenCalledTimes(1);
    loadOrCreateMeasurementValidityResultIndexV1({ outputDir, resultIndexRef: index.resultIndexRef, contentHash: index.contentHash, createIndex });
    expect(createIndex).toHaveBeenCalledTimes(1);
  });
});

function extractHashes(cell: MeasurementValidityResultCellV1): Record<string, string> {
  if (cell.status === "valid" && cell.instrumentKind === "final_outcome") return { taskManifestHash: cell.taskManifestHash, rawArtifactHash: cell.rawArtifactHash, finalOutcomeHash: cell.finalOutcomeHash };
  if (cell.status === "valid" && cell.instrumentKind === "in_process_explicit") return { taskManifestHash: cell.taskManifestHash, rawArtifactHash: cell.rawArtifactHash, interactionTraceHash: cell.interactionTraceHash };
  if (cell.status === "invalid_response") return { taskManifestHash: cell.taskManifestHash, rawArtifactHash: cell.rawArtifactHash };
  return {};
}

// ============================================================================
// P0-B statistics kernel (Codex red-light)
// ============================================================================

describe("P0-B statistics kernel", () => {
  it("singleton-cluster bootstrap is non-degenerate: distribution contains 0, 5, and 10", () => {
    const boot = clusterBootstrapV1({ clusters: [{ clusterId: "c1", values: [0] }, { clusterId: "c2", values: [10] }], seed: "s", count: 1000, lowerAlpha: 0.05, upperAlpha: 0.95 });
    const set = new Set(boot.resamples);
    expect(set.has(0)).toBe(true);
    expect(set.has(10)).toBe(true);
    expect(set.has(5)).toBe(true);
    expect(set.size).toBeGreaterThan(1);
  });

  it("partial argmax-set agreement is exactly 0", () => {
    expect(argmaxSetAgreementV1(["A", "B"], ["A"])).toBe(0);
    expect(argmaxSetAgreementV1(["A", "B"], ["A", "C"])).toBe(0);
    expect(argmaxSetAgreementV1(["A", "B"], ["A", "B"])).toBe(1);
  });

  it("rejects non-normalized and invalid probability vectors", () => {
    expect(() => validateProbabilityVectorV1([{ option: "A", probability: 0.6 }, { option: "B", probability: 0.3 }])).toThrow(/sum to 1/);
    expect(() => validateProbabilityVectorV1([{ option: "A", probability: 1.2 }])).toThrow(/within \[0,1\]/);
    expect(() => validateProbabilityVectorV1([])).toThrow(/non-empty/);
    expect(() => validateProbabilityVectorV1([{ option: "A", probability: 0.5 }, { option: "A", probability: 0.5 }])).toThrow(/unique/);
  });

  it("rejects pair-specific option-set drift (no cross-pair union)", () => {
    // A single pair whose remapped variant option set drifts from the base is
    // rejected; the kernel must not use a union across pairs to paper over it.
    expect(() => optionEquivarianceV1({ pairs: [{
      base: [{ option: "A", probability: 0.5 }, { option: "B", probability: 0.5 }],
      variant: [{ option: "A", probability: 1 }],
      optionMap: { "A": "A" },
    }] })).toThrow(/same canonical option set|mapping drift/);
    // Two pairs with genuinely different canonical sets are each valid per-pair.
    const ok = optionEquivarianceV1({ pairs: [
      { base: [{ option: "A", probability: 1 }], variant: [{ option: "A", probability: 1 }], optionMap: { "A": "A" } },
      { base: [{ option: "B", probability: 1 }], variant: [{ option: "B", probability: 1 }], optionMap: { "B": "B" } },
    ] });
    expect(Number.isFinite(ok.medianTv)).toBe(true);
  });

  it("rejects a two-level Spearman and keeps unique levels", () => {
    expect(() => blockSpearmanV1({ levels: [1, 2], targetProbabilities: [0.5, 0.6] })).toThrow(/at least three/);
    expect(() => blockSpearmanV1({ levels: [1, 1, 3], targetProbabilities: [0.5, 0.6, 0.7] })).toThrow(/unique/);
  });

  it("binary Brier does not fall back to the first option when the report is malformed", () => {
    const claim = { id: "c", proposition: "p", domain: "d", createdAt: BEFORE, resolutionPolicy: { kind: "binary" as const, resolverId: "r" } };
    expect(() => brierDeltaV1({
      claim,
      reportValue: { kind: "categorical", probabilities: { "A": 0.5 } } as never,
      baselineValue: { kind: "binary", probability: 0.5 },
      resolution: { claimId: "c", kind: "binary", outcome: true, resolverId: "r", resolvedAt: AFTER },
    })).toThrow();
    const delta = brierDeltaV1({
      claim,
      reportValue: { kind: "binary", probability: 0.9 },
      baselineValue: { kind: "binary", probability: 0.5 },
      resolution: { claimId: "c", kind: "binary", outcome: true, resolverId: "r", resolvedAt: AFTER },
    });
    expect(delta).toBeCloseTo(0.01 - 0.25, 12);
  });
});

// ============================================================================
// P0-C Gate fail-closed (Codex red-light)
// ============================================================================

describe("P0-C gate fail-closed", () => {
  it("does not accept caller-supplied thresholds or metric applicability", () => {
    const design = makeDesign();
    // The freeze carries frozen thresholds and derived applicability; the gate
    // has no thresholds / metricApplicable inputs.
    const gate = evaluateMeasurementGateV1({ freeze: makeFreeze(design), metrics: passMetrics() });
    expect(gate.q1).toBe(true);
  });

  it("all metrics disabled cannot GO", () => {
    const design = makeDesign();
    const noMetrics = createMeasurementValidityFreezeV1({
      freezeRef: { id: `${design.designRef.id}:freeze:none`, version: "1.0.0" }, designRef: design.designRef, designContentHash: design.contentHash,
      instrumentKind: design.instrumentKind, measurementRole: design.measurementRole, beliefKind: design.beliefKind, claimOptionCount: design.claimOptionCount,
      taskBankRef: { id: "swarmalpha.task-bank.v1", version: "1.0.0" }, taskBankContentHash: H("tb"),
      registeredCells: design.registeredCells, registeredPairCount: design.registeredCells.length,
      bootstrap: { clusterUnit: design.clusterUnit, count: design.bootstrapCount, seed: design.bootstrapSeed, version: design.bootstrapVersion },
      thresholds: MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1,
      applicableMetrics: { paraphrase: false, optionEquivariance: false, directionResponse: false, strengthResponse: false, predictiveIncrement: false },
      baselineRef: { id: "b", version: "1.0.0" }, createdAt: FREEZE_AT,
    });
    // Derived applicability would reject this freeze against the design; the
    // gate itself must not GO with all metrics disabled.
    expect(() => validateFreezeAgainstDesignV1(noMetrics, design)).toThrow(/applicable metrics differ/);
    const gate = evaluateMeasurementGateV1({ freeze: noMetrics, metrics: passMetrics() });
    expect(gate.q1).toBe(false);
    expect(gate.conclusion).not.toBe("GO");
  });

  it("null cluster count or coverage CI yields DEFER_INSUFFICIENT, never GO", () => {
    const design = makeDesign();
    expect(evaluateMeasurementGateV1({ freeze: makeFreeze(design), metrics: passMetrics({ independentClusterCount: null }) }).conclusion).toBe("DEFER_INSUFFICIENT");
    expect(evaluateMeasurementGateV1({ freeze: makeFreeze(design), metrics: passMetrics({ validCoverageClusterLowerBound: null }) }).conclusion).toBe("DEFER_INSUFFICIENT");
    expect(evaluateMeasurementGateV1({ freeze: makeFreeze(design), metrics: passMetrics({ paraphraseMedianJsd: null }) }).conclusion).toBe("DEFER_INSUFFICIENT");
  });

  it("relaxed caller thresholds cannot change the result", () => {
    const design = makeDesign();
    expect(() => createMeasurementValidityFreezeV1({
      freezeRef: { id: `${design.designRef.id}:freeze:relaxed`, version: "1.0.0" }, designRef: design.designRef, designContentHash: design.contentHash,
      instrumentKind: design.instrumentKind, measurementRole: design.measurementRole, beliefKind: design.beliefKind, claimOptionCount: design.claimOptionCount,
      taskBankRef: { id: "swarmalpha.task-bank.v1", version: "1.0.0" }, taskBankContentHash: H("tb"),
      registeredCells: design.registeredCells, registeredPairCount: design.registeredCells.length,
      bootstrap: { clusterUnit: design.clusterUnit, count: design.bootstrapCount, seed: design.bootstrapSeed, version: design.bootstrapVersion },
      thresholds: { ...MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1, paraphrase: { medianJsd: 1, p90Jsd: 1, argmaxAgreement: 0 } },
      applicableMetrics: deriveMeasurementApplicableMetricsV1(design),
      baselineRef: { id: "b", version: "1.0.0" }, createdAt: FREEZE_AT,
    })).toThrow(/must equal the frozen v1 gate values/);
    // An unvalidated freeze that bypasses the creator (relaxed thresholds on a
    // raw object) must also fail closed at the gate itself.
    const raw = { ...makeFreeze(design), thresholds: { ...MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1, paraphrase: { medianJsd: 1, p90Jsd: 1, argmaxAgreement: 0 } } } as MeasurementValidityFreezeV1;
    expect(() => evaluateMeasurementGateV1({ freeze: raw, metrics: passMetrics() })).toThrow();
  });

  it("Q3 requires explicit transport strata and no unexplained direction reversal", () => {
    const design = makeDesign();
    const pass = evaluateMeasurementGateV1({ freeze: makeFreeze(design), metrics: passMetrics() });
    expect(pass.q3).toBe(true);
    const noStrata = evaluateMeasurementGateV1({ freeze: makeFreeze(design), metrics: passMetrics({ transportStrata: [] }) });
    expect(noStrata.q3).toBe(false);
    const reversal = evaluateMeasurementGateV1({ freeze: makeFreeze(design), metrics: passMetrics({ unexplainedDirectionReversalCount: 1 }) });
    expect(reversal.q3).toBe(false);
  });
});
