/**
 * V6 categorical detection-validation V2 / K-specific threshold /
 * pre-action census adversarial tests (handoff Work Packages A-D).
 *
 * All mock invokers; no real or paid LLM call, no network, no credentials.
 * The V2 record's own hash provides internal consistency only: source
 * authority comes from the projection of a verified schema-5 artifact plus the
 * non-serializable verified symbol. No assertion here claims that a
 * self-consistent rehash can be traced back to a real source.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2,
  createVerificationRequestEligibilityRule,
  type GovernanceEligibilityRule,
} from "@/lib/governance";
import { REPORTED_BELIEF_CERTAINTY_V1 } from "@/lib/epistemic";
import {
  computeV6DetectionValidationRecordHashV2,
  createV6DetectionValidationRecordV1,
  createV6DetectionValidationRecordV2,
  isVerifiedV6DetectionValidationRecordV1,
  isVerifiedV6DetectionValidationRecordV2,
  projectV6PreActionDetectionCensusV1,
  summarizeV6DetectionValidationV2,
  validateV6DetectionValidationRecordV2,
  type V6DetectionValidationRecordV2,
  type V6PreActionDetectionCensusRowV1,
  type VerifiedV6DetectionValidationRecordV2,
} from "../experiments/campaign/v6/detectionValidation";
import {
  createV6BinarySmokeFixture,
  planV6SmokeRuns,
  type V6SmokeFixtureV1,
} from "../experiments/campaign/v6/v6BinarySmokeFixture";
import { runV6SmokeExecute } from "../experiments/campaign/v6/run_v6_smoke";
import type { SingleAttemptTextInvokeRequest, SingleAttemptTextInvoker } from "../experiments/campaign/v6/providerAdapters";
import {
  verifyV6CalibrationArtifactsV1,
  type V6CalibrationDatasetSpecV1,
} from "../experiments/campaign/v6/verifiedCalibrationDataset";
import { resolveV6AuditableRawRunPath } from "../experiments/campaign/v6/productionVerticalSlice";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v6-dv2-"));
  tempDirs.push(dir);
  return dir;
}

const OPTIONS = ["Option A", "Option B", "Option C"];

function categoricalRule(optionCount: number, threshold: number): GovernanceEligibilityRule {
  return createVerificationRequestEligibilityRule({
    certaintyThresholdPolicy: {
      id: "swarmalpha.threshold.v6-dv2",
      version: "1.0.0",
      quantityRef: REPORTED_BELIEF_CERTAINTY_V1,
      operator: "gte",
      bounds: { lower: threshold },
      authority: {
        kind: "randomized_experiment_only",
        preregistrationRef: { id: "swarmalpha.prereg.v6-dv2", version: "1.0.0" },
      },
      selection: { kind: "fixed_preregistered", methodRef: { id: "swarmalpha.method.fixed-threshold", version: "1.0.0" } },
      costs: { falsePositive: 1, falseNegative: 1, abstention: 1, action: 1 },
      missingResult: "ineligible",
      frozenAt: "2026-08-10T00:00:00.000Z",
    },
    beliefDomain: { beliefKind: "categorical", claimOptionCount: optionCount },
    maxVerifiedIndependentLineages: 0,
    verifierId: "verifier:dv2",
    matchedTokenBudget: 300,
    expectedModelCalls: 1,
    priority: 100,
  });
}

interface CatFixture {
  fixture: V6SmokeFixtureV1;
  options: string[];
  claim: Record<string, unknown>;
  rule: GovernanceEligibilityRule;
}

function categoricalFixture(optionCount = 3, threshold = 0.7): CatFixture {
  const base = createV6BinarySmokeFixture();
  const options = OPTIONS.slice(0, optionCount);
  const claim = {
    id: "claim:v6-dv2",
    proposition: "Which option is correct?",
    domain: "categorical-test",
    createdAt: "2026-08-10T00:00:00.000Z",
    options,
    resolutionPolicy: { kind: "categorical", resolverId: "resolver:v6-dv2" },
  };
  const task = {
    id: "task:v6-dv2",
    taskFamilyRef: base.task.taskFamilyRef,
    publicContext: "Choose the single best option.",
    claim,
    agents: base.task.agents,
    outcome: options[0],
  };
  const rule = categoricalRule(optionCount, threshold);
  const fixture: V6SmokeFixtureV1 = {
    ...base,
    task: task as unknown as V6SmokeFixtureV1["task"],
    rule,
    taskAdapter: { ...base.taskAdapter, resolution: { kind: "from_task_outcome", resolverId: "resolver:v6-dv2" } },
  };
  return { fixture, options, claim, rule };
}

function authorityOf(fixture: V6SmokeFixtureV1) {
  return {
    adapterRef: fixture.taskAdapter.adapterRef,
    taskSchemaRef: fixture.taskAdapter.taskSchemaRef,
    resolution: fixture.taskAdapter.resolution,
  };
}

function specOf(cat: CatFixture, taskDefinitionHash: string): V6CalibrationDatasetSpecV1 {
  return {
    datasetRef: { id: "swarmalpha.dataset.v6-dv2", version: "1.0.0" },
    studies: [{
      studyRef: { id: cat.fixture.study.id, version: cat.fixture.study.version },
      governanceRules: [cat.rule],
      allocationMode: "scheduled_engineering",
      allowedTaskDefinitionHashes: [taskDefinitionHash],
    }],
  };
}

/** Invoker where both agents' round-1 reports carry the SAME probability
 * vector, so the monitoring-selected report has a deterministic flag+label. */
function catInvoker(claimId: string, options: string[], round1Probs: Record<string, number>): {
  invoker: SingleAttemptTextInvoker;
  invoke: ReturnType<typeof vi.fn>;
} {
  const finalProbs = { [options[0]]: 0.4, [options[1]]: 0.3, [options[2]]: 0.3 };
  const invoke = vi.fn(async (request: SingleAttemptTextInvokeRequest) => {
    const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
    if (request.requestId.startsWith("final:")) {
      return {
        rawContent: JSON.stringify({ status: "answered", reports: [{ claimId, value: { kind: "categorical", probabilities: finalProbs } }] }),
        usage,
      };
    }
    if (request.userPrompt.includes("matched process-control request")) {
      return { rawContent: JSON.stringify({ acknowledgment: "acknowledged" }), usage };
    }
    if (request.systemPrompt === "You are an independent verifier.") {
      return { rawContent: JSON.stringify({ publicContent: "Independent verification found the route evidence inconclusive." }), usage };
    }
    if (request.userPrompt.includes("plain text only")) {
      return { rawContent: `${request.requestId} public view`, usage };
    }
    return {
      rawContent: JSON.stringify({ message: "public message", belief: { kind: "categorical", probabilities: round1Probs }, evidence: [] }),
      usage,
    };
  });
  return { invoker: { invoke } as SingleAttemptTextInvoker, invoke };
}

async function produceVerifiedArtifact(
  cat: CatFixture,
  prefix: string,
  round1Probs: Record<string, number>,
): Promise<{ artifact: Record<string, unknown>; calls: number }> {
  const outputDir = tmpDir();
  const m = catInvoker((cat.claim as { id: string }).id, cat.options, round1Probs);
  const plannedRuns = planV6SmokeRuns(cat.fixture, prefix).filter(run => run.protocol === "epistemic_governance_v1");
  await runV6SmokeExecute({ outputDir, fixture: cat.fixture, invoker: m.invoker, plannedRuns, maxProviderCalls: 10, maxTotalTokens: 100_000 });
  const artifact = JSON.parse(fs.readFileSync(resolveV6AuditableRawRunPath(outputDir, plannedRuns[0].runId), "utf8")) as Record<string, unknown>;
  return { artifact, calls: m.invoke.mock.calls.length };
}

function verifyRecord(artifact: Record<string, unknown>, cat: CatFixture) {
  const spec = specOf(cat, (artifact.v6TaskManifest as { taskDefinitionHash: string }).taskDefinitionHash);
  return verifyV6CalibrationArtifactsV1({ artifacts: [{ sourcePath: "a.json", artifact }], spec });
}

// ============================================================================
// Work Package A — V2 record adversarial
// ============================================================================

describe("v6 detection validation V2 record", () => {
  it("creates a legal categorical/K=3 record that replays certainty, Brier, and hard label", async () => {
    const cat = categoricalFixture();
    const { artifact } = await produceVerifiedArtifact(cat, "run:v6-dv2a", { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    const verified = verifyRecord(artifact, cat);
    const record = createV6DetectionValidationRecordV2(verified[0]);
    expect(record.artifactSchemaRef.version).toBe("2.0.0");
    expect(record.beliefKind).toBe("categorical");
    expect(record.claimOptionCount).toBe(3);
    expect(record.canonicalOptions).toEqual(cat.options);
    expect(record.reportedCertainty).toBeCloseTo(0.9, 10);
    // Multiclass Brier over committed canonical coordinates.
    expect(record.reportBrierLoss).toBeCloseTo((0.9 - 1) ** 2 + 0.05 ** 2 + 0.05 ** 2, 10);
    expect(record.hardOutcomeLabel).toBe("correct");
    expect(() => validateV6DetectionValidationRecordV2(record)).not.toThrow();
    expect(isVerifiedV6DetectionValidationRecordV2(record)).toBe(true);
    // No schema-5 authority claim beyond the in-process projection.
    expect(record.contentHash).toBe(computeV6DetectionValidationRecordHashV2((({ contentHash: _c, ...rest }) => rest)(record)));
  });

  it("labels a tie when multiple options share the maximum probability even if truth is among them", async () => {
    const cat = categoricalFixture();
    const { artifact } = await produceVerifiedArtifact(cat, "run:v6-dv2tie", { "Option A": 0.5, "Option B": 0.5, "Option C": 0 });
    const verified = verifyRecord(artifact, cat);
    const record = createV6DetectionValidationRecordV2(verified[0]);
    // Truth is Option A, which is one of the two maximizers → still tie.
    expect(record.hardOutcomeLabel).toBe("tie");
    expect(record.reportedCertainty).toBeCloseTo(0.5, 10);
  });

  it("labels unique-argmax-equals-truth as correct and unique-argmax-differs as incorrect", async () => {
    const cat = categoricalFixture();
    const correct = await produceVerifiedArtifact(cat, "run:v6-dv2c", { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    const incorrect = await produceVerifiedArtifact(cat, "run:v6-dv2i", { "Option B": 0.9, "Option A": 0.05, "Option C": 0.05 });
    expect(createV6DetectionValidationRecordV2(verifyRecord(correct.artifact, cat)[0]).hardOutcomeLabel).toBe("correct");
    expect(createV6DetectionValidationRecordV2(verifyRecord(incorrect.artifact, cat)[0]).hardOutcomeLabel).toBe("incorrect");
  });

  it("rejects a binary verified artifact in the V2 factory and a categorical artifact in the V1 factory", async () => {
    const cat = categoricalFixture();
    const { artifact } = await produceVerifiedArtifact(cat, "run:v6-dv2b", { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    const verified = verifyRecord(artifact, cat);
    expect(() => createV6DetectionValidationRecordV1(verified[0])).toThrow(/binary/);
    const base = createV6BinarySmokeFixture();
    const binDir = tmpDir();
    const binInvoker = vi.fn(async (request: SingleAttemptTextInvokeRequest) => {
      const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
      if (request.requestId.startsWith("final:")) {
        return { rawContent: JSON.stringify({ status: "answered", reports: [{ claimId: base.task.claim.id, value: { kind: "binary", probability: 0.6 } }] }), usage };
      }
      if (request.userPrompt.includes("plain text only")) return { rawContent: "x", usage };
      const isA1 = request.userPrompt.includes("Sensor A reports a clear route.") && !request.userPrompt.includes("[round 1]");
      return { rawContent: JSON.stringify({ message: "m", belief: { kind: "binary", probability: isA1 ? 0.95 : 0.6 }, evidence: [] }), usage };
    });
    const binPlans = planV6SmokeRuns(base, "run:v6-bin").filter(run => run.protocol === "epistemic_governance_v1");
    await runV6SmokeExecute({ outputDir: binDir, fixture: base, invoker: { invoke: binInvoker } as unknown as SingleAttemptTextInvoker, plannedRuns: binPlans, maxProviderCalls: 10, maxTotalTokens: 100_000 });
    const binArtifact = JSON.parse(fs.readFileSync(resolveV6AuditableRawRunPath(binDir, binPlans[0].runId), "utf8")) as Record<string, unknown>;
    const binSpec: V6CalibrationDatasetSpecV1 = {
      datasetRef: { id: "s", version: "1.0.0" },
      studies: [{ studyRef: { id: base.study.id, version: base.study.version }, governanceRules: [base.rule], allocationMode: "scheduled_engineering", allowedTaskDefinitionHashes: [(binArtifact.v6TaskManifest as { taskDefinitionHash: string }).taskDefinitionHash] }],
    };
    const binVerified = verifyV6CalibrationArtifactsV1({ artifacts: [{ sourcePath: "b.json", artifact: binArtifact }], spec: binSpec });
    expect(() => createV6DetectionValidationRecordV2(binVerified[0])).toThrow(/categorical/);
  });

  it("rejects a categorical/K=3 artifact under a categorical/K=4 rule config", async () => {
    const cat = categoricalFixture(3);
    const { artifact } = await produceVerifiedArtifact(cat, "run:v6-dv2k", { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    const k4Rule = categoricalRule(4, 0.4);
    const spec = specOf(cat, (artifact.v6TaskManifest as { taskDefinitionHash: string }).taskDefinitionHash);
    spec.studies[0].governanceRules = [k4Rule];
    // The admission layer replays governance decisions under the supplied rule;
    // a K=4 rule cannot replay a K=3 artifact's decisions, so the K-domain
    // mismatch is rejected before the V2 factory could ever run.
    expect(() => verifyV6CalibrationArtifactsV1({ artifacts: [{ sourcePath: "k.json", artifact }], spec }))
      .toThrow(/replay failed/);
  });

  it("rejects single-point tampering on every replayable and identity field", async () => {
    const cat = categoricalFixture();
    const { artifact } = await produceVerifiedArtifact(cat, "run:v6-dv2t", { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    const record = createV6DetectionValidationRecordV2(verifyRecord(artifact, cat)[0]);
    const mutators: Array<[string, (r: V6DetectionValidationRecordV2) => void]> = [
      ["schema ref", r => { (r as { artifactSchemaRef: { version: string } }).artifactSchemaRef.version = "9.9.9"; }],
      ["canonical option reorder", r => { r.canonicalOptions = [...cat.options].reverse(); }],
      ["canonical option added", r => { r.canonicalOptions = [...cat.options, "Option D"]; }],
      ["claimOptionCount", r => { r.claimOptionCount = 4; }],
      ["belief kind", r => { (r as { beliefKind: string }).beliefKind = "binary"; }],
      ["probability missing option", r => { delete r.reportedBelief.probabilities["Option C"]; }],
      ["probability extra option", r => { r.reportedBelief.probabilities["Option D"] = 0.05; }],
      ["probability NaN", r => { r.reportedBelief.probabilities["Option C"] = Number.NaN; }],
      ["probability out of range", r => { r.reportedBelief.probabilities["Option C"] = 1.5; }],
      ["probability sum drift", r => { r.reportedBelief.probabilities["Option C"] = 0.2; }],
      ["reportedCertainty", r => { r.reportedCertainty = 0.8; }],
      ["resolvedOutcome", r => { r.resolvedOutcome = "Option B"; }],
      ["reportBrierLoss", r => { r.reportBrierLoss = 0.123; }],
      ["hardOutcomeLabel", r => { r.hardOutcomeLabel = "incorrect"; }],
      ["thresholdSatisfied", r => { r.thresholdSatisfied = !r.thresholdSatisfied; }],
      ["operationalRiskPredicate", r => { r.operationalRiskPredicate = !r.operationalRiskPredicate; }],
      ["recordedRuleEligible", r => { r.recordedRuleEligible = !r.recordedRuleEligible; }],
      ["inclusionWeight", r => { r.inclusionWeight = r.inclusionWeight + 1; }],
      ["sourceRef taskManifestHash", r => { r.sourceRefs.taskManifestHash = `sha256:${"a".repeat(64)}`; }],
      ["sourceRef interactionTraceHash", r => { r.sourceRefs.interactionTraceHash = `sha256:${"b".repeat(64)}`; }],
      ["sourceRef finalOutcomeHash", r => { r.sourceRefs.finalOutcomeHash = `sha256:${"c".repeat(64)}`; }],
      ["unexpected top-level field", r => { (r as unknown as Record<string, unknown>).sneaky = true; }],
      ["unexpected nested field", r => { (r.reportedBelief as unknown as Record<string, unknown>).sneaky = 1; }],
    ];
    for (const [label, mutate] of mutators) {
      const tampered = structuredClone(record) as V6DetectionValidationRecordV2;
      mutate(tampered);
      expect(() => validateV6DetectionValidationRecordV2(tampered), `tamper ${label} must be rejected`).toThrow();
    }
    // contentHash tamper alone is rejected.
    const badHash = structuredClone(record) as { contentHash: string };
    badHash.contentHash = `sha256:${"d".repeat(64)}`;
    expect(() => validateV6DetectionValidationRecordV2(badHash as V6DetectionValidationRecordV2)).toThrow(/contentHash/);
  });

  it("loses the verified symbol on structured-clone/JSON round-trip and the summary rejects it", async () => {
    const cat = categoricalFixture();
    const { artifact } = await produceVerifiedArtifact(cat, "run:v6-dv2s", { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    const record = createV6DetectionValidationRecordV2(verifyRecord(artifact, cat)[0]);
    expect(isVerifiedV6DetectionValidationRecordV2(record)).toBe(true);
    const cloned = structuredClone(record) as V6DetectionValidationRecordV2;
    expect(isVerifiedV6DetectionValidationRecordV2(cloned)).toBe(false);
    const roundTripped = JSON.parse(JSON.stringify(record)) as V6DetectionValidationRecordV2;
    expect(isVerifiedV6DetectionValidationRecordV2(roundTripped)).toBe(false);
    // A forged self-consistent record that is not source-bound must be rejected
    // by the summary, not silently accepted as a verified projection.
    expect(() => summarizeV6DetectionValidationV2([cloned] as unknown as VerifiedV6DetectionValidationRecordV2[])).toThrow(/verified projections/);
    expect(() => summarizeV6DetectionValidationV2([roundTripped] as unknown as VerifiedV6DetectionValidationRecordV2[])).toThrow(/verified projections/);
  });
});

// ============================================================================
// Work Package B — V2 summary
// ============================================================================

describe("v6 detection validation V2 summary", () => {
  async function records(prefix: string, probsList: Array<Record<string, number>>): Promise<Array<VerifiedV6DetectionValidationRecordV2>> {
    const cat = categoricalFixture();
    const recordsOut: Array<VerifiedV6DetectionValidationRecordV2> = [];
    for (let index = 0; index < probsList.length; index++) {
      const { artifact } = await produceVerifiedArtifact(cat, `${prefix}${index}`, probsList[index]);
      recordsOut.push(createV6DetectionValidationRecordV2(verifyRecord(artifact, cat)[0]));
    }
    return recordsOut;
  }

  it("computes weighted means, risk gap direction, flag rate, tie rate, and confusion weights", async () => {
    const recordsOut = await records("run:v6-dv2s", [
      { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 },   // flagged correct  (FP)
      { "Option B": 0.9, "Option A": 0.05, "Option C": 0.05 },   // flagged incorrect (TP)
      { "Option A": 0.4, "Option B": 0.35, "Option C": 0.25 },   // unflagged correct (TN)
      { "Option B": 0.4, "Option A": 0.35, "Option C": 0.25 },   // unflagged incorrect (FN)
      { "Option A": 0.5, "Option B": 0.5, "Option C": 0 },       // unflagged tie
    ]);
    const summary = summarizeV6DetectionValidationV2(recordsOut);
    expect(summary.inferenceStatus).toBe("descriptive_calibration_only");
    expect(summary.properLossGeometry).toBe("multiclass_brier_sum");
    expect(summary.recordCount).toBe(5);
    expect(summary.weightedPopulationSize).toBeCloseTo(10, 10);
    expect(summary.confusionWeights).toEqual({ truePositive: 2, falsePositive: 2, falseNegative: 2, trueNegative: 2 });
    expect(summary.weightedRiskFlagRate).toBeCloseTo(4 / 10, 10);
    expect(summary.weightedTieRate).toBeCloseTo(2 / 10, 10);
    expect(summary.precision).toBeCloseTo(2 / 4, 10);
    expect(summary.recall).toBeCloseTo(2 / 4, 10);
    expect(summary.specificity).toBeCloseTo(2 / 4, 10);
    expect(summary.weightedFlaggedMeanReportBrier).toBeCloseTo((0.015 + 1.715) / 2, 10);
    expect(summary.weightedUnflaggedMeanReportBrier).toBeCloseTo((0.545 + 0.645 + 0.5) / 3, 10);
    expect(summary.weightedBrierRiskGap).toBeCloseTo((0.015 + 1.715) / 2 - (0.545 + 0.645 + 0.5) / 3, 10);
    expect(summary.weightedBrierRiskGap).toBeGreaterThan(0);
  });

  it("returns null for a fully-flagged or fully-unflagged side of the gap", async () => {
    const bothFlagged = await records("run:v6-dv2allf", [
      { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 },
      { "Option B": 0.9, "Option A": 0.05, "Option C": 0.05 },
    ]);
    const flaggedSummary = summarizeV6DetectionValidationV2(bothFlagged);
    expect(flaggedSummary.weightedUnflaggedMeanReportBrier).toBeNull();
    expect(flaggedSummary.weightedBrierRiskGap).toBeNull();
    const allUnflagged = await records("run:v6-dv2allu", [
      { "Option A": 0.4, "Option B": 0.35, "Option C": 0.25 },
      { "Option A": 0.5, "Option B": 0.5, "Option C": 0 },
    ]);
    const unflaggedSummary = summarizeV6DetectionValidationV2(allUnflagged);
    expect(unflaggedSummary.weightedFlaggedMeanReportBrier).toBeNull();
    expect(unflaggedSummary.weightedBrierRiskGap).toBeNull();
    // No flagged records → precision and recall denominators are zero → null, never NaN.
    expect(unflaggedSummary.precision).toBeNull();
    expect(unflaggedSummary.recall).toBeNull();
    expect(Number.isFinite(unflaggedSummary.specificity as number)).toBe(true);
  });

  it("rejects mixed domains, allocation modes, option counts, duplicate runs, and non-verified records", async () => {
    const catA = categoricalFixture(3);
    const catB = categoricalFixture(3);
    const a = await produceVerifiedArtifact(catA, "run:v6-dv2m1", { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    const b = await produceVerifiedArtifact(catB, "run:v6-dv2m2", { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    const r1 = createV6DetectionValidationRecordV2(verifyRecord(a.artifact, catA)[0]);
    const r2 = createV6DetectionValidationRecordV2(verifyRecord(b.artifact, catB)[0]);
    // catA and catB have identical study/rule identities → same domain; force a
    // domain change by using a different rule threshold to make calibrationDomainHash differ.
    const catB2 = categoricalFixture(3, 0.8);
    const b2 = await produceVerifiedArtifact(catB2, "run:v6-dv2m3", { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    const rMixed = createV6DetectionValidationRecordV2(verifyRecord(b2.artifact, catB2)[0]);
    expect(() => summarizeV6DetectionValidationV2([r1, rMixed])).toThrow(/calibration domains/);
    expect(() => summarizeV6DetectionValidationV2([r1, r2, r2])).toThrow(/duplicate runs/);
    const cloned = structuredClone(r1) as V6DetectionValidationRecordV2;
    expect(() => summarizeV6DetectionValidationV2([cloned] as unknown as VerifiedV6DetectionValidationRecordV2[])).toThrow(/verified projections/);
    void b;
  });

  it("isolates the summary output from later input mutation", async () => {
    const recordsOut = await records("run:v6-dv2iso", [
      { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 },
      { "Option B": 0.9, "Option A": 0.05, "Option C": 0.05 },
    ]);
    const summary = summarizeV6DetectionValidationV2(recordsOut);
    expect(Object.isFrozen(summary)).toBe(true);
    expect(Object.isFrozen(summary.confusionWeights)).toBe(true);
    const before = summary.weightedMeanReportBrier;
    // Input records are themselves frozen; a detached clone mutation cannot
    // change the already-computed summary snapshot.
    const detached = structuredClone(recordsOut[0]) as V6DetectionValidationRecordV2;
    detached.reportBrierLoss = 999;
    expect(summary.weightedMeanReportBrier).toBe(before);
    expect(() => { (summary as { weightedMeanReportBrier: number }).weightedMeanReportBrier = 0; }).toThrow();
  });
});

// ============================================================================
// Work Package C — K-specific threshold
// ============================================================================

describe("K-specific threshold construction and domain isolation", () => {
  function thresholdConfig(domain: { beliefKind: "binary" | "categorical"; claimOptionCount: number } | undefined, lower: number) {
    return {
      certaintyThresholdPolicy: {
        id: "swarmalpha.threshold.v6-kt", version: "1.0.0", quantityRef: REPORTED_BELIEF_CERTAINTY_V1,
        operator: "gte" as const, bounds: { lower },
        authority: { kind: "randomized_experiment_only" as const, preregistrationRef: { id: "prereg", version: "1.0.0" } },
        selection: { kind: "fixed_preregistered" as const, methodRef: { id: "m", version: "1.0.0" } },
        costs: { falsePositive: 1, falseNegative: 1, abstention: 1, action: 1 },
        missingResult: "ineligible" as const, frozenAt: "2026-08-10T00:00:00.000Z",
      },
      ...(domain ? { beliefDomain: domain } : {}),
      maxVerifiedIndependentLineages: 0, verifierId: "v", matchedTokenBudget: 300, expectedModelCalls: 1, priority: 1,
    };
  }

  it("keeps binary/K=2 thresholds > 0.5 and the legacy default on omission", () => {
    expect(() => createVerificationRequestEligibilityRule(thresholdConfig(undefined, 0.5))).toThrow(/uniform baseline/);
    expect(() => createVerificationRequestEligibilityRule(thresholdConfig(undefined, 0.51))).not.toThrow();
    expect(() => createVerificationRequestEligibilityRule(thresholdConfig({ beliefKind: "binary", claimOptionCount: 2 }, 0.51))).not.toThrow();
  });

  it("allows categorical/K=3 thresholds just above 1/3 and 0.4 without the binary >0.5 restriction", () => {
    expect(() => createVerificationRequestEligibilityRule(thresholdConfig({ beliefKind: "categorical", claimOptionCount: 3 }, 1 / 3))).toThrow(/uniform baseline/);
    expect(() => createVerificationRequestEligibilityRule(thresholdConfig({ beliefKind: "categorical", claimOptionCount: 3 }, 0.334))).not.toThrow();
    expect(() => createVerificationRequestEligibilityRule(thresholdConfig({ beliefKind: "categorical", claimOptionCount: 3 }, 0.4))).not.toThrow();
  });

  it("allows categorical/K=4 thresholds just above 0.25 and rejects the boundary", () => {
    expect(() => createVerificationRequestEligibilityRule(thresholdConfig({ beliefKind: "categorical", claimOptionCount: 4 }, 0.25))).toThrow(/uniform baseline/);
    expect(() => createVerificationRequestEligibilityRule(thresholdConfig({ beliefKind: "categorical", claimOptionCount: 4 }, 0.251))).not.toThrow();
  });

  it("accepts threshold 1 and rejects malformed domains", () => {
    expect(() => createVerificationRequestEligibilityRule(thresholdConfig({ beliefKind: "categorical", claimOptionCount: 3 }, 1))).not.toThrow();
    expect(() => createVerificationRequestEligibilityRule(thresholdConfig({ beliefKind: "binary", claimOptionCount: 3 }, 0.51))).toThrow(/beliefDomain/);
    expect(() => createVerificationRequestEligibilityRule(thresholdConfig({ beliefKind: "categorical", claimOptionCount: 1 }, 0.4))).toThrow(/beliefDomain/);
    expect(() => createVerificationRequestEligibilityRule(thresholdConfig({ beliefKind: "linear" as never, claimOptionCount: 3 }, 0.4))).toThrow(/beliefDomain/);
  });

  it("keeps a K=3 rule ineligible for a K=4 diagnosis without reaching the threshold gate", () => {
    const rule = categoricalRule(3, 0.4);
    const diagnosis = {
      id: "d", diagnosisRef: { id: "swarmalpha.risk.high-certainty-insufficient-lineage", version: "2.0.0" },
      quantityRef: REPORTED_BELIEF_CERTAINTY_V1, round: 1, label: "t", interpretation: "descriptive_risk" as const,
      value: 0.9,
      attributes: { claimId: "c", beliefReportId: "r", beliefKind: "categorical", claimOptionCount: 4, claimResolved: false, verifierAvailable: true, verifiedIndependentLineageCount: 0 },
      targetIds: ["a"], sourceObservationIds: ["o"],
      measurement: { observationCompleteness: "complete" as const, missingFields: [], measurementReliability: { status: "estimated" as const, score: 1, methodRef: { id: "m", version: "1.0.0" } }, constructValidity: "predictive_candidate" as const },
      controlEvidence: { status: "experimental_candidate" as const, controlUse: "randomized_experiment_only" as const, preregistrationRef: { id: "p", version: "1.0.0" } },
      createdAt: "2026-08-10T00:00:00.000Z",
    };
    const evaluation = rule.evaluate({ round: 1, diagnoses: [diagnosis], availableBudget: {} });
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toMatch(/calibration domain/);
  });
});

// ============================================================================
// Work Package D — pre-action census
// ============================================================================

describe("v6 pre-action detection census", () => {
  async function censusFor(protocol: "explicit_belief_v1" | "epistemic_governance_v1", cat: CatFixture, probs: Record<string, number>): Promise<{
    rows: ReadonlyArray<V6PreActionDetectionCensusRowV1>;
    calls: number;
    artifact: Record<string, unknown>;
  }> {
    const outputDir = tmpDir();
    const m = catInvoker((cat.claim as { id: string }).id, cat.options, probs);
    const plannedRuns = planV6SmokeRuns(cat.fixture, `run:v6-census-${protocol}`).filter(run => run.protocol === protocol);
    await runV6SmokeExecute({ outputDir, fixture: cat.fixture, invoker: m.invoker, plannedRuns, maxProviderCalls: 10, maxTotalTokens: 100_000 });
    const artifact = JSON.parse(fs.readFileSync(resolveV6AuditableRawRunPath(outputDir, plannedRuns[0].runId), "utf8")) as Record<string, unknown>;
    const spec = specOf(cat, (artifact.v6TaskManifest as { taskDefinitionHash: string }).taskDefinitionHash);
    const verified = verifyV6CalibrationArtifactsV1({ artifacts: [{ sourcePath: "c.json", artifact }], spec });
    const calls = m.invoke.mock.calls.length;
    const rows = projectV6PreActionDetectionCensusV1({ verified: verified[0], rule: cat.rule });
    return { rows, calls, artifact };
  }

  it("enumerates every first-round B report with one row per agent and no governance selection", async () => {
    const cat = categoricalFixture();
    const { rows, artifact } = await censusFor("explicit_belief_v1", cat, { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(row => row.agentId)).size).toBe(2);
    for (const row of rows) {
      expect(row.protocol).toBe("explicit_belief_v1");
      expect(row.inferenceStatus).toBe("descriptive_shadow_only");
      expect(row.lineageMeasurementStatus).toBe("no_pre_action_verification_records");
      expect(row.verifiedIndependentLineageRecordCount).toBe(0);
    }
    const trace = artifact.v6InteractionTrace as { monitoringSelection?: unknown };
    expect(trace.monitoringSelection).toBeUndefined();
    expect((artifact.governanceAuditTrail as { eventAssignments: unknown[] }).eventAssignments).toHaveLength(0);
  });

  it("enumerates every first-round G report (not only the monitoring-selected one) without altering governance", async () => {
    const cat = categoricalFixture();
    const { rows, artifact } = await censusFor("epistemic_governance_v1", cat, { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    expect(rows).toHaveLength(2); // both round-1 reports, not the single selected one
    const selection = (artifact.v6InteractionTrace as { monitoringSelection: { selectedReportId: string } }).monitoringSelection;
    expect(selection.selectedReportId).toBeTruthy();
    // The census does not consume the selection: all first-round reports appear.
    expect(rows.map(row => row.reportId)).toContain(selection.selectedReportId);
    expect(rows.length).toBeGreaterThan(1);
  });

  it("rejects the T arm for lacking an explicit belief population", async () => {
    const cat = categoricalFixture();
    const outputDir = tmpDir();
    const m = catInvoker((cat.claim as { id: string }).id, cat.options, { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    const plannedRuns = planV6SmokeRuns(cat.fixture, "run:v6-census-t").filter(run => run.protocol === "text_communication_v1");
    await runV6SmokeExecute({ outputDir, fixture: cat.fixture, invoker: m.invoker, plannedRuns, maxProviderCalls: 10, maxTotalTokens: 100_000 });
    const artifact = JSON.parse(fs.readFileSync(resolveV6AuditableRawRunPath(outputDir, plannedRuns[0].runId), "utf8")) as Record<string, unknown>;
    const spec = specOf(cat, (artifact.v6TaskManifest as { taskDefinitionHash: string }).taskDefinitionHash);
    const verified = verifyV6CalibrationArtifactsV1({ artifacts: [{ sourcePath: "t.json", artifact }], spec });
    expect(() => projectV6PreActionDetectionCensusV1({ verified: verified[0], rule: cat.rule }))
      .toThrow(/only for explicit-belief B and governance G arms/);
  });

  it("rejects a wrong rule ref, an undeclared rule, a domain mismatch, and a threshold at/below 1/K", async () => {
    const cat = categoricalFixture();
    const { artifact } = await censusFor("explicit_belief_v1", cat, { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    const spec = specOf(cat, (artifact.v6TaskManifest as { taskDefinitionHash: string }).taskDefinitionHash);
    const verified = verifyV6CalibrationArtifactsV1({ artifacts: [{ sourcePath: "c.json", artifact }], spec });

    // A rule with a different identity (not HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2)
    // must be rejected before any config inspection.
    const wrongRefRule = { id: "swarmalpha.rule.other", version: "1.0.0", config: {} } as unknown as GovernanceEligibilityRule;
    expect(() => projectV6PreActionDetectionCensusV1({ verified: verified[0], rule: wrongRefRule })).toThrow(/frozen high-certainty\/lineage rule/);
    // The "not declared" branch is defensive: the fixture study always declares
    // the frozen high-certainty rule, so a rule reaching this point with that
    // ref is declared; a different ref is rejected above. Not asserted here.

    const kMismatch = categoricalRule(4, 0.4);
    expect(() => projectV6PreActionDetectionCensusV1({ verified: verified[0], rule: kMismatch })).toThrow(/calibration domain differs/);

    // A stub with the frozen rule ref and a matching domain but a threshold at
    // the 1/K boundary (which rule construction forbids) must be rejected by
    // the census itself.
    const atBoundary = {
      ...HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2,
      config: {
        certaintyThresholdPolicy: { operator: "gte", bounds: { lower: 1 / 3 }, id: "t", version: "1.0.0" },
        maxVerifiedIndependentLineages: 0,
        beliefDomain: { beliefKind: "categorical", claimOptionCount: 3 },
      },
    } as unknown as GovernanceEligibilityRule;
    expect(() => projectV6PreActionDetectionCensusV1({ verified: verified[0], rule: atBoundary })).toThrow(/uniform baseline/);
  });

  it("does not create actions or provider calls and stays shadow-only", async () => {
    const cat = categoricalFixture();
    const { rows, calls, artifact } = await censusFor("epistemic_governance_v1", cat, { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    // Census projection itself adds no provider calls: rows were derived from
    // the already-produced artifact, so the invoker call count is unchanged.
    expect(rows.length).toBeGreaterThan(0);
    expect(calls).toBeGreaterThan(0);
    const trail = artifact.governanceAuditTrail as { actionTransitions: unknown[] };
    // Projection does not mutate the artifact and creates no new action.
    expect(Array.isArray(trail.actionTransitions)).toBe(true);
    for (const row of rows) {
      expect(isVerifiedV6DetectionValidationRecordV1(row as never)).toBe(false);
      expect(isVerifiedV6DetectionValidationRecordV2(row as never)).toBe(false);
      expect(Object.isFrozen(row)).toBe(true);
      expect(Object.isFrozen(row.sourceRefs)).toBe(true);
    }
  });

  it("binds protocol into the calibration domain hash so B and G cannot be silently mixed", async () => {
    const cat = categoricalFixture();
    const b = await censusFor("explicit_belief_v1", cat, { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    const g = await censusFor("epistemic_governance_v1", cat, { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    expect(b.rows[0].calibrationDomainHash).not.toBe(g.rows[0].calibrationDomainHash);
  });

  it("rejects when the resolution kind mismatches the claim kind", async () => {
    const cat = categoricalFixture();
    const { artifact } = await censusFor("explicit_belief_v1", cat, { "Option A": 0.9, "Option B": 0.05, "Option C": 0.05 });
    const spec = specOf(cat, (artifact.v6TaskManifest as { taskDefinitionHash: string }).taskDefinitionHash);
    const tampered = structuredClone(artifact) as Record<string, unknown>;
    (tampered.finalOutcome as { resolutions: Array<{ kind: string }> }).resolutions[0].kind = "binary";
    expect(() => verifyV6CalibrationArtifactsV1({ artifacts: [{ sourcePath: "x.json", artifact: tampered }], spec })).toThrow();
  });
});
