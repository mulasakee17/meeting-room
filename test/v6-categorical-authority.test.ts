/**
 * V6 categorical authority adversarial tests (handoff Work Packages A/B/C).
 *
 * Covers: categorical commitment V2 manifests and their openings; malformed
 * categorical probability vectors never forming a belief report and never
 * retrying; categorical schema-5 runs replaying sealed with multiclass Brier;
 * tamper resistance at the manifest/admission boundary; threshold
 * calibration-domain isolation (beliefDomain); and the categorical provider /
 * truth firewall. All mock invokers; no real or paid LLM call, no network,
 * no credentials.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_V2,
  createVerificationRequestEligibilityRule,
  type GovernanceDiagnosisRecord,
  type GovernanceEligibilityRule,
} from "@/lib/governance";
import { REPORTED_BELIEF_CERTAINTY_V1 } from "@/lib/epistemic";
import {
  computeV6TaskDefinitionHashV1,
  createV6TaskManifestV1,
  validateV6TaskManifestOpeningV1,
  validateV6TaskManifestResolutionV1,
} from "../experiments/campaign/v6/v6TaskManifest";
import {
  createV6BinarySmokeFixture,
  planV6SmokeRuns,
  type V6SmokeFixtureV1,
} from "../experiments/campaign/v6/v6BinarySmokeFixture";
import { runV6SmokeExecute } from "../experiments/campaign/v6/run_v6_smoke";
import {
  createV6DiscussionAdapter,
  type SingleAttemptTextInvokeRequest,
  type SingleAttemptTextInvoker,
} from "../experiments/campaign/v6/providerAdapters";
import {
  createV6DetectionValidationRecordV1,
  createV6DetectionValidationRecordV2,
  projectV6PreActionDetectionCensusV1,
  summarizeV6DetectionValidationV2,
  validateV6DetectionValidationRecordV2,
} from "../experiments/campaign/v6/detectionValidation";
import {
  verifyV6CalibrationArtifactsV1,
  type V6CalibrationDatasetSpecV1,
} from "../experiments/campaign/v6/verifiedCalibrationDataset";
import { verifyRawRunData } from "../experiments/campaign/replayVerifier";
import {
  resolveV6AuditableRawRunPath,
  type V6DiscussionRequestV1,
} from "../experiments/campaign/v6/productionVerticalSlice";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v6-cat-"));
  tempDirs.push(dir);
  return dir;
}

const CATEGORICAL_OPTIONS = ["Option A", "Option B", "Option C"];

interface CategoricalFixture {
  fixture: V6SmokeFixtureV1;
  options: string[];
  claim: {
    id: string;
    proposition: string;
    domain: string;
    createdAt: string;
    options: string[];
    resolutionPolicy: { kind: "categorical"; resolverId: string };
  };
}

function categoricalRule(optionCount: number, threshold = 0.7): GovernanceEligibilityRule {
  return createVerificationRequestEligibilityRule({
    certaintyThresholdPolicy: {
      id: "swarmalpha.threshold.v6-cat-test",
      version: "1.0.0",
      quantityRef: REPORTED_BELIEF_CERTAINTY_V1,
      operator: "gte",
      bounds: { lower: threshold },
      authority: {
        kind: "randomized_experiment_only",
        preregistrationRef: { id: "swarmalpha.prereg.v6-cat-test", version: "1.0.0" },
      },
      selection: {
        kind: "fixed_preregistered",
        methodRef: { id: "swarmalpha.method.fixed-threshold", version: "1.0.0" },
      },
      costs: { falsePositive: 1, falseNegative: 1, abstention: 1, action: 1 },
      missingResult: "ineligible",
      frozenAt: "2026-08-10T00:00:00.000Z",
    },
    beliefDomain: { beliefKind: "categorical", claimOptionCount: optionCount },
    maxVerifiedIndependentLineages: 0,
    verifierId: "verifier:cat",
    matchedTokenBudget: 300,
    expectedModelCalls: 1,
    priority: 100,
  });
}

/** Categorical fixture reusing the smoke contracts/registry but swapping the
 * task to a categorical claim and the rule to a categorical/K domain. */
function categoricalFixture(optionCount = 3): CategoricalFixture {
  const base = createV6BinarySmokeFixture();
  const options = CATEGORICAL_OPTIONS.slice(0, optionCount);
  const claim = {
    id: "claim:v6-cat",
    proposition: "Which option is the correct answer?",
    domain: "categorical-test",
    createdAt: "2026-08-10T00:00:00.000Z",
    options,
    resolutionPolicy: { kind: "categorical" as const, resolverId: "resolver:v6-cat" },
  };
  const task = {
    id: "task:v6-cat",
    taskFamilyRef: base.task.taskFamilyRef,
    publicContext: "Choose the single best option.",
    claim,
    agents: base.task.agents,
    outcome: options[0],
  };
  const fixture: V6SmokeFixtureV1 = {
    ...base,
    task: task as unknown as V6SmokeFixtureV1["task"],
    rule: categoricalRule(optionCount),
    taskAdapter: {
      ...base.taskAdapter,
      resolution: { kind: "from_task_outcome" as const, resolverId: "resolver:v6-cat" },
    },
  };
  return { fixture, options, claim };
}

function authorityOf(fixture: V6SmokeFixtureV1) {
  return {
    adapterRef: fixture.taskAdapter.adapterRef,
    taskSchemaRef: fixture.taskAdapter.taskSchemaRef,
    resolution: fixture.taskAdapter.resolution,
  };
}

function manifestFor(fixture: V6SmokeFixtureV1, runId = "run:cat") {
  return createV6TaskManifestV1({
    runId,
    studyRef: fixture.study,
    task: fixture.task as never,
    authority: authorityOf(fixture),
    monitoringDesignRef: fixture.monitoringDesign.designRef,
    monitoringDesignHash: fixture.monitoringDesign.contentHash,
    committedAt: "2026-08-10T00:00:01.000Z",
  });
}

function specOf(fixture: V6SmokeFixtureV1): V6CalibrationDatasetSpecV1 {
  return {
    datasetRef: { id: "swarmalpha.dataset.v6-cat-test", version: "1.0.0" },
    studies: [{
      studyRef: { id: fixture.study.id, version: fixture.study.version },
      governanceRules: [fixture.rule],
      allocationMode: "scheduled_engineering",
      allowedTaskDefinitionHashes: [
        computeV6TaskDefinitionHashV1(fixture.task as never, authorityOf(fixture)),
      ],
    }],
  };
}

/** Valid categorical discussion/final/verification mock. Agent A round 1 gives
 * max probability 0.7 so the categorical/K=3 rule triggers at threshold 0.7. */
function validCategoricalInvoker(claimId: string, options: string[]): {
  invoker: SingleAttemptTextInvoker;
  invoke: ReturnType<typeof vi.fn>;
} {
  const probs = { [options[0]]: 0.7, [options[1]]: 0.2, [options[2]]: 0.1 };
  const finalProbs = { [options[0]]: 0.6, [options[1]]: 0.3, [options[2]]: 0.1 };
  const invoke = vi.fn(async (request: SingleAttemptTextInvokeRequest) => {
    const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
    if (request.requestId.startsWith("final:")) {
      return {
        rawContent: JSON.stringify({
          status: "answered",
          reports: [{ claimId, value: { kind: "categorical", probabilities: finalProbs } }],
        }),
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
      rawContent: JSON.stringify({
        message: "public message",
        belief: { kind: "categorical", probabilities: probs },
        evidence: [{ content: "evidence", relation: "supports" }],
      }),
      usage,
    };
  });
  return { invoker: { invoke } as SingleAttemptTextInvoker, invoke };
}

/** Binary mock for binary-claim runs; agent A round 1 reports p=0.95 so a
 * binary/K=2 rule at threshold 0.9 triggers the governance arm. */
function binaryInvoker(claimId: string): { invoker: SingleAttemptTextInvoker; invoke: ReturnType<typeof vi.fn> } {
  const invoke = vi.fn(async (request: SingleAttemptTextInvokeRequest) => {
    const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
    if (request.requestId.startsWith("final:")) {
      return {
        rawContent: JSON.stringify({ status: "answered", reports: [{ claimId, value: { kind: "binary", probability: 0.6 } }] }),
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
    const isAgentARound1 = request.userPrompt.includes("Sensor A reports a clear route.")
      && !request.userPrompt.includes("[round 1]");
    return {
      rawContent: JSON.stringify({
        message: "public message",
        belief: { kind: "binary", probability: isAgentARound1 ? 0.95 : 0.6 },
        evidence: [{ content: "evidence", relation: "supports" }],
      }),
      usage,
    };
  });
  return { invoker: { invoke } as SingleAttemptTextInvoker, invoke };
}

function loadRawRun(outputDir: string, runId: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(resolveV6AuditableRawRunPath(outputDir, runId), "utf8")) as Record<string, unknown>;
}

function discussionRequest(cat: CategoricalFixture, malformedBelief: unknown): SingleAttemptTextInvokeRequest {
  return {
    requestId: "discussion:run:v6:r1:agent:a",
    systemPrompt: "You are an analyst in a multi-agent group discussion.",
    userPrompt: "Return exactly one strict JSON object with fields: message, belief, evidence.",
    responseFormat: "json",
    modelRef: { id: "model:a", version: "1.0.0" },
    invocationConfig: { temperature: 0 },
  };
}

// ============================================================================
// Work Package A — categorical authority
// ============================================================================

describe("v6 categorical authority: manifest and commitment V2", () => {
  it("commits a categorical manifest with commitment V2 and opens correctly", () => {
    const cat = categoricalFixture();
    const manifest = manifestFor(cat.fixture);
    expect(manifest.groundTruthCommitment.commitmentRef.id).toBe("swarmalpha.commitment.v6-claim-ground-truth");
    expect(manifest.groundTruthCommitment.commitmentRef.version).toBe("2.0.0");
    expect(manifest.primaryClaim).toEqual(cat.claim);
    expect(manifest.taskDefinitionHash).toBe(computeV6TaskDefinitionHashV1(cat.fixture.task as never, authorityOf(cat.fixture)));
    expect(() => validateV6TaskManifestOpeningV1(manifest, cat.fixture.task as never, authorityOf(cat.fixture))).not.toThrow();
    expect(() => validateV6TaskManifestResolutionV1(manifest, {
      claimId: cat.claim.id,
      resolverId: cat.claim.resolutionPolicy.resolverId,
      kind: "categorical",
      outcome: cat.fixture.task.outcome as unknown as string,
    })).not.toThrow();
  });

  it("keeps the binary manifest on commitment V1 (no drift)", () => {
    const base = createV6BinarySmokeFixture();
    const manifest = createV6TaskManifestV1({
      runId: "run:bin",
      studyRef: base.study,
      task: base.task as never,
      authority: authorityOf(base),
      monitoringDesignRef: base.monitoringDesign.designRef,
      monitoringDesignHash: base.monitoringDesign.contentHash,
      committedAt: "2026-08-10T00:00:01.000Z",
    });
    expect(manifest.groundTruthCommitment.commitmentRef.id).toBe("swarmalpha.commitment.v6-binary-ground-truth");
    expect(manifest.groundTruthCommitment.commitmentRef.version).toBe("1.0.0");
    expect(manifest.groundTruthCommitment.confidentiality).toBe("integrity_only_not_hiding");
  });

  it("rejects a categorical outcome outside the canonical options before manifest creation", () => {
    const cat = categoricalFixture();
    const badTask = {
      ...cat.fixture.task,
      outcome: "Option X",
    };
    expect(() => createV6TaskManifestV1({
      runId: "run:badout",
      studyRef: cat.fixture.study,
      task: badTask as never,
      authority: authorityOf(cat.fixture),
      monitoringDesignRef: cat.fixture.monitoringDesign.designRef,
      monitoringDesignHash: cat.fixture.monitoringDesign.contentHash,
      committedAt: "2026-08-10T00:00:01.000Z",
    })).toThrow(/one canonical claim option/);
  });

  it("rejects opening with mismatched kind, claimId, resolverId, or outcome", () => {
    const cat = categoricalFixture();
    const manifest = manifestFor(cat.fixture);
    const correct = {
      claimId: cat.claim.id,
      resolverId: cat.claim.resolutionPolicy.resolverId,
      kind: "categorical" as const,
      outcome: cat.fixture.task.outcome as unknown as string,
    };
    expect(() => validateV6TaskManifestResolutionV1(manifest, { ...correct, kind: "binary", outcome: true } as never)).toThrow();
    expect(() => validateV6TaskManifestResolutionV1(manifest, { ...correct, claimId: "claim:other" })).toThrow(/identity mismatch/);
    expect(() => validateV6TaskManifestResolutionV1(manifest, { ...correct, resolverId: "resolver:other" })).toThrow(/identity mismatch/);
    expect(() => validateV6TaskManifestResolutionV1(manifest, { ...correct, outcome: cat.options[1] }))
      .toThrow(/does not match its pre-assignment commitment/);
  });

  it("rejects option order or content drift at opening even if the peripheral hash is recomputed", () => {
    const cat = categoricalFixture();
    const manifest = manifestFor(cat.fixture);
    const reorderedTask = {
      ...cat.fixture.task,
      claim: { ...cat.fixture.task.claim, options: [...cat.options].reverse() },
    };
    // A self-consistent manifest recomputation (new taskDefinitionHash) still
    // cannot be a valid opening of the committed manifest.
    expect(() => validateV6TaskManifestOpeningV1(manifest, reorderedTask as never, authorityOf(cat.fixture)))
      .toThrow(/does not match/);
    const driftedTask = {
      ...cat.fixture.task,
      claim: { ...cat.fixture.task.claim, options: [...cat.options.slice(0, 2), "Option Z"] },
    };
    expect(() => validateV6TaskManifestOpeningV1(manifest, driftedTask as never, authorityOf(cat.fixture)))
      .toThrow(/does not match/);
  });
});

describe("v6 categorical authority: malformed probability vectors", () => {
  async function runMalformedB(malformed: unknown): Promise<{
    artifact: Record<string, unknown>;
    calls: number;
  }> {
    const cat = categoricalFixture();
    const outputDir = tmpDir();
    const invoke = vi.fn(async (request: SingleAttemptTextInvokeRequest) => {
      const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
      if (request.requestId.startsWith("final:")) {
        return {
          rawContent: JSON.stringify({
            status: "answered",
            reports: [{ claimId: cat.claim.id, value: { kind: "categorical", probabilities: { [cat.options[0]]: 0.6, [cat.options[1]]: 0.3, [cat.options[2]]: 0.1 } } }],
          }),
          usage,
        };
      }
      if (request.userPrompt.includes("plain text only")) {
        return { rawContent: `${request.requestId} public view`, usage };
      }
      return { rawContent: JSON.stringify(malformed), usage };
    });
    const plannedRuns = planV6SmokeRuns(cat.fixture, "run:v6-catb")
      .filter(run => run.protocol === "explicit_belief_v1");
    await runV6SmokeExecute({
      outputDir,
      fixture: cat.fixture,
      invoker: { invoke } as SingleAttemptTextInvoker,
      plannedRuns,
      maxProviderCalls: 20,
      maxTotalTokens: 100_000,
    });
    return { artifact: loadRawRun(outputDir, plannedRuns[0].runId), calls: invoke.mock.calls.length };
  }

  const malformedVectors: Array<[string, unknown]> = [
    ["missing option", { message: "m", belief: { kind: "categorical", probabilities: { "Option A": 0.5, "Option B": 0.5 } }, evidence: [] }],
    ["extra option", { message: "m", belief: { kind: "categorical", probabilities: { "Option A": 0.4, "Option B": 0.3, "Option C": 0.2, "Option D": 0.1 } }, evidence: [] }],
    ["sum not 1", { message: "m", belief: { kind: "categorical", probabilities: { "Option A": 0.5, "Option B": 0.3, "Option C": 0.1 } }, evidence: [] }],
    ["out-of-range", { message: "m", belief: { kind: "categorical", probabilities: { "Option A": 0.5, "Option B": 0.3, "Option C": 1.5 } }, evidence: [] }],
    ["non-numeric", { message: "m", belief: { kind: "categorical", probabilities: { "Option A": 0.5, "Option B": 0.3, "Option C": "Infinity" } }, evidence: [] }],
    ["wrong kind", { message: "m", belief: { kind: "binary", probability: 0.9 }, evidence: [] }],
  ];

  for (const [label, malformed] of malformedVectors) {
    it(`never forms a belief report and never retries for: ${label}`, async () => {
      const { artifact, calls } = await runMalformedB(malformed);
      const beliefEvents = (artifact.v6InteractionTrace as { epistemicEvents: Array<{ type: string }> }).epistemicEvents
        .filter(event => event.type === "belief_reported");
      expect(beliefEvents).toHaveLength(0);
      const invalidCalls = (artifact.v6InteractionTrace as { discussionCalls: Array<{ status: string; diagnosticCode: string }> }).discussionCalls
        .filter(call => call.status === "invalid" && call.diagnosticCode === "invalid_response");
      expect(invalidCalls.length).toBeGreaterThan(0);
      // 4 discussion requests (2 agents × 2 rounds) + 2 final = 6, no retries.
      expect(calls).toBe(6);
    });
  }
});

describe("v6 categorical authority: schema-5 run, replay, and tamper", () => {
  it("runs a categorical T/B/G slice with replay sealed and multiclass Brier", async () => {
    const cat = categoricalFixture();
    const outputDir = tmpDir();
    const m = validCategoricalInvoker(cat.claim.id, cat.options);
    const { results } = await runV6SmokeExecute({
      outputDir,
      fixture: cat.fixture,
      invoker: m.invoker,
      maxProviderCalls: 30,
      maxTotalTokens: 100_000,
      plannedRuns: planV6SmokeRuns(cat.fixture, "run:v6-cat"),
    });
    expect(results).toHaveLength(3);
    const g = loadRawRun(outputDir, "run:v6-cat:epistemic_governance_v1");
    const manifest = g.v6TaskManifest as { groundTruthCommitment: { commitmentRef: { id: string; version: string } } };
    expect(manifest.groundTruthCommitment.commitmentRef.id).toBe("swarmalpha.commitment.v6-claim-ground-truth");
    const finalRecords = (g.finalElicitationCollection as { records: Array<{ status: string; value?: { kind: string } }> }).records;
    expect(finalRecords.length).toBe(2);
    expect(finalRecords.every(record => record.status === "answered")).toBe(true);
    const replay = verifyRawRunData("(cat)", g, { governanceRules: [cat.fixture.rule] });
    expect(replay.governanceAuditStatus).toBe("sealed_decision_replay_verified");
    expect(replay.runIssues).toEqual([]);
    for (const protocol of ["text_communication_v1", "explicit_belief_v1"]) {
      const artifact = loadRawRun(outputDir, `run:v6-cat:${protocol}`);
      const r = verifyRawRunData("(cat)", artifact, { governanceRules: [cat.fixture.rule] });
      expect(r.governanceAuditStatus).toBe("sealed_decision_replay_verified");
      expect(r.runIssues).toEqual([]);
    }
  });

  it("rejects a resolution tamper via the manifest commitment even after a self-consistent rehash of the outcome carrier", async () => {
    const cat = categoricalFixture();
    const outputDir = tmpDir();
    const m = validCategoricalInvoker(cat.claim.id, cat.options);
    const plannedRuns = planV6SmokeRuns(cat.fixture, "run:v6-catt").filter(run => run.protocol === "text_communication_v1");
    await runV6SmokeExecute({ outputDir, fixture: cat.fixture, invoker: m.invoker, plannedRuns, maxProviderCalls: 10, maxTotalTokens: 100_000 });
    const artifact = loadRawRun(outputDir, plannedRuns[0].runId);
    const tampered = structuredClone(artifact) as Record<string, unknown>;
    const resolution = (tampered.finalOutcome as { resolutions: Array<{ outcome: string }> }).resolutions[0];
    resolution.outcome = cat.options[1];
    // The manifest commitment check does not depend on the outcome carrier hash:
    // even a fully self-consistent rehash of finalOutcome/operationalOutcome
    // cannot make a different outcome open the committed manifest.
    expect(() => verifyV6CalibrationArtifactsV1({ artifacts: [{ sourcePath: "tampered.json", artifact: tampered }], spec: specOf(cat.fixture) }))
      .toThrow(/does not match its pre-assignment commitment/);
  });

  it("rejects beliefValue / reportedCertainty / claimOptionCount tamper without rehash", async () => {
    const cat = categoricalFixture();
    const outputDir = tmpDir();
    const m = validCategoricalInvoker(cat.claim.id, cat.options);
    const plannedRuns = planV6SmokeRuns(cat.fixture, "run:v6-catt2").filter(run => run.protocol === "epistemic_governance_v1");
    await runV6SmokeExecute({ outputDir, fixture: cat.fixture, invoker: m.invoker, plannedRuns, maxProviderCalls: 10, maxTotalTokens: 100_000 });
    const artifact = loadRawRun(outputDir, plannedRuns[0].runId);
    const clean = verifyV6CalibrationArtifactsV1({ artifacts: [{ sourcePath: "clean.json", artifact }], spec: specOf(cat.fixture) });
    expect(clean).toHaveLength(1);
    for (const mutate of [
      (a: Record<string, unknown>) => {
        const payload = (a.v6InteractionTrace as { epistemicEvents: Array<{ type: string; report: { value: { kind: string; probabilities: Record<string, number> } } }> }).epistemicEvents
          .find(event => event.type === "belief_reported");
        payload!.report.value.probabilities[cat.options[0]] = 0.5;
      },
      (a: Record<string, unknown>) => {
        const payload = (a.v6InteractionTrace as { epistemicEvents: Array<{ type: string; report: { value: { kind: string; probabilities: Record<string, number> } } }> }).epistemicEvents
          .find(event => event.type === "belief_reported");
        payload!.report.value.kind = "binary" as never;
      },
      (a: Record<string, unknown>) => {
        const diagnosis = (a.governanceAuditTrail as { diagnoses: Array<{ attributes: Record<string, unknown> }> }).diagnoses.find(d => d.attributes.beliefKind === "categorical");
        if (diagnosis) diagnosis.attributes.claimOptionCount = 4;
      },
    ]) {
      const tampered = structuredClone(artifact) as Record<string, unknown>;
      mutate(tampered);
      // The admission layer re-checks the trace contentHash and the governance
      // decision replay, so a peripheral rehash cannot mask these tamperers.
      expect(() => verifyV6CalibrationArtifactsV1({ artifacts: [{ sourcePath: "t.json", artifact: tampered }], spec: specOf(cat.fixture) })).toThrow();
    }
  });
});

describe("v6 categorical detector validation v2 and pre-action census", () => {
  it("projects and summarizes a source-bound categorical/K=3 detector record", async () => {
    const cat = categoricalFixture();
    const outputDir = tmpDir();
    const mock = validCategoricalInvoker(cat.claim.id, cat.options);
    const plannedRuns = planV6SmokeRuns(cat.fixture, "run:v6-cat-v2")
      .filter(run => run.protocol === "epistemic_governance_v1");
    await runV6SmokeExecute({
      outputDir,
      fixture: cat.fixture,
      invoker: mock.invoker,
      plannedRuns,
      maxProviderCalls: 10,
      maxTotalTokens: 100_000,
    });
    const artifact = loadRawRun(outputDir, plannedRuns[0].runId);
    const [verified] = verifyV6CalibrationArtifactsV1({
      artifacts: [{ sourcePath: "categorical-v2.json", artifact }],
      spec: specOf(cat.fixture),
    });
    const record = createV6DetectionValidationRecordV2(verified);
    expect(record).toMatchObject({
      beliefKind: "categorical",
      claimOptionCount: 3,
      reportedCertainty: 0.7,
      hardOutcomeLabel: "correct",
    });
    expect(record.reportBrierLoss).toBeCloseTo(0.14, 12);
    expect(() => validateV6DetectionValidationRecordV2(record)).not.toThrow();
    const summary = summarizeV6DetectionValidationV2([record]);
    expect(summary).toMatchObject({
      inferenceStatus: "descriptive_calibration_only",
      beliefKind: "categorical",
      claimOptionCount: 3,
      properLossGeometry: "multiclass_brier_sum",
      recordCount: 1,
    });
  });

  it("projects every B-arm first-round report without creating control authority", async () => {
    const cat = categoricalFixture();
    const outputDir = tmpDir();
    const mock = validCategoricalInvoker(cat.claim.id, cat.options);
    const plannedRuns = planV6SmokeRuns(cat.fixture, "run:v6-cat-shadow")
      .filter(run => run.protocol === "explicit_belief_v1");
    await runV6SmokeExecute({
      outputDir,
      fixture: cat.fixture,
      invoker: mock.invoker,
      plannedRuns,
      maxProviderCalls: 10,
      maxTotalTokens: 100_000,
    });
    const artifact = loadRawRun(outputDir, plannedRuns[0].runId);
    const [verified] = verifyV6CalibrationArtifactsV1({
      artifacts: [{ sourcePath: "categorical-shadow.json", artifact }],
      spec: specOf(cat.fixture),
    });
    const rows = projectV6PreActionDetectionCensusV1({ verified, rule: cat.fixture.rule });
    expect(rows).toHaveLength(cat.fixture.task.agents.length);
    expect(rows.every(row => row.inferenceStatus === "descriptive_shadow_only"
      && row.protocol === "explicit_belief_v1"
      && row.verifiedIndependentLineageRecordCount === 0
      && row.lineageMeasurementStatus === "no_pre_action_verification_records"))
      .toBe(true);
    expect((artifact.v6InteractionTrace as { monitoringSelection?: unknown }).monitoringSelection).toBeUndefined();
    expect((artifact.governanceAuditTrail as { decisions: unknown[] }).decisions).toHaveLength(0);
  });

  it("permits a categorical threshold above 1/K even when it is below 0.5", () => {
    expect(() => categoricalRule(3, 0.4)).not.toThrow();
    expect(() => categoricalRule(3, 1 / 3)).toThrow(/uniform baseline/);
  });
});

// ============================================================================
// Work Package B — threshold calibration-domain isolation
// ============================================================================

function diagnosisFor(overrides: {
  beliefKind: "binary" | "categorical";
  claimOptionCount?: number;
  value?: number;
  claimResolved?: boolean;
  verifierAvailable?: boolean;
  lineageCount?: number;
}): GovernanceDiagnosisRecord {
  const attributes: Record<string, unknown> = {
    claimId: "claim:x",
    beliefReportId: "report:x",
    beliefKind: overrides.beliefKind,
    claimResolved: overrides.claimResolved ?? false,
    verifierAvailable: overrides.verifierAvailable ?? true,
    verifiedIndependentLineageCount: overrides.lineageCount ?? 0,
  };
  if (overrides.claimOptionCount !== undefined || overrides.beliefKind === "categorical") {
    attributes.claimOptionCount = overrides.claimOptionCount ?? 3;
  }
  return {
    id: "diag:x",
    diagnosisRef: HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_V2,
    quantityRef: REPORTED_BELIEF_CERTAINTY_V1,
    round: 1,
    label: "test",
    interpretation: "descriptive_risk",
    value: overrides.value ?? 0.9,
    attributes,
    targetIds: ["agent:a"],
    sourceObservationIds: ["obs:x"],
    measurement: {
      observationCompleteness: "complete",
      missingFields: [],
      measurementReliability: { status: "estimated", score: 1, methodRef: { id: "m", version: "1.0.0" } },
      constructValidity: "predictive_candidate",
    },
    controlEvidence: {
      status: "experimental_candidate",
      controlUse: "randomized_experiment_only",
      preregistrationRef: { id: "prereg:x", version: "1.0.0" },
    },
    createdAt: "2026-08-10T00:00:00.000Z",
  };
}

describe("v6 threshold calibration-domain isolation", () => {
  function evaluate(rule: GovernanceEligibilityRule, diagnosis: GovernanceDiagnosisRecord) {
    return rule.evaluate({ round: 1, diagnoses: [diagnosis], availableBudget: {} });
  }

  it("defaults to the legacy binary/K=2 domain when beliefDomain is omitted", () => {
    const rule = createVerificationRequestEligibilityRule({
      certaintyThresholdPolicy: {
        id: "swarmalpha.threshold.v6-default", version: "1.0.0", quantityRef: REPORTED_BELIEF_CERTAINTY_V1,
        operator: "gte" as const, bounds: { lower: 0.7 },
        authority: { kind: "randomized_experiment_only", preregistrationRef: { id: "prereg:default", version: "1.0.0" } },
        selection: { kind: "fixed_preregistered", methodRef: { id: "m", version: "1.0.0" } },
        costs: { falsePositive: 1, falseNegative: 1, abstention: 1, action: 1 },
        missingResult: "ineligible", frozenAt: "2026-08-10T00:00:00.000Z",
      },
      maxVerifiedIndependentLineages: 0, verifierId: "v", matchedTokenBudget: 300, expectedModelCalls: 1, priority: 1,
    });
    // A binary/K=2 diagnosis (claimOptionCount absent) is in-domain.
    expect(evaluate(rule, diagnosisFor({ beliefKind: "binary" })).eligible).toBe(true);
    // A categorical diagnosis is out-of-domain.
    expect(evaluate(rule, diagnosisFor({ beliefKind: "categorical", claimOptionCount: 3 })).eligible).toBe(false);
  });

  it("makes a binary/K=2 rule ineligible for a categorical/K=3 diagnosis", () => {
    const rule = createVerificationRequestEligibilityRule({
      certaintyThresholdPolicy: {
        id: "swarmalpha.threshold.v6-bin", version: "1.0.0", quantityRef: REPORTED_BELIEF_CERTAINTY_V1,
        operator: "gte" as const, bounds: { lower: 0.7 },
        authority: { kind: "randomized_experiment_only", preregistrationRef: { id: "prereg:bin", version: "1.0.0" } },
        selection: { kind: "fixed_preregistered", methodRef: { id: "m", version: "1.0.0" } },
        costs: { falsePositive: 1, falseNegative: 1, abstention: 1, action: 1 },
        missingResult: "ineligible", frozenAt: "2026-08-10T00:00:00.000Z",
      },
      beliefDomain: { beliefKind: "binary", claimOptionCount: 2 },
      maxVerifiedIndependentLineages: 0, verifierId: "v", matchedTokenBudget: 300, expectedModelCalls: 1, priority: 1,
    });
    expect(evaluate(rule, diagnosisFor({ beliefKind: "categorical", claimOptionCount: 3 })).eligible).toBe(false);
  });

  it("lets a categorical/K=3 rule proceed past the domain gate for a matching diagnosis", () => {
    const rule = categoricalRule(3);
    expect(evaluate(rule, diagnosisFor({ beliefKind: "categorical", claimOptionCount: 3 })).eligible).toBe(true);
    // Below-threshold value is still in-domain but not eligible.
    const low = evaluate(rule, diagnosisFor({ beliefKind: "categorical", claimOptionCount: 3, value: 0.6 }));
    expect(low.eligible).toBe(false);
    expect(low.reason).toMatch(/below the frozen threshold/);
  });

  it("makes a categorical/K=3 rule ineligible for a categorical/K=4 diagnosis", () => {
    const rule = categoricalRule(3);
    expect(evaluate(rule, diagnosisFor({ beliefKind: "categorical", claimOptionCount: 4 })).eligible).toBe(false);
  });

  it("rejects construction of binary/K!=2, categorical/K<2, and invalid beliefKind rules", () => {
    const baseConfig = {
      certaintyThresholdPolicy: {
        id: "swarmalpha.threshold.v6-bad", version: "1.0.0", quantityRef: REPORTED_BELIEF_CERTAINTY_V1,
        operator: "gte" as const, bounds: { lower: 0.7 },
        authority: { kind: "randomized_experiment_only" as const, preregistrationRef: { id: "prereg:bad", version: "1.0.0" } },
        selection: { kind: "fixed_preregistered" as const, methodRef: { id: "m", version: "1.0.0" } },
        costs: { falsePositive: 1, falseNegative: 1, abstention: 1, action: 1 },
        missingResult: "ineligible" as const, frozenAt: "2026-08-10T00:00:00.000Z",
      },
      maxVerifiedIndependentLineages: 0, verifierId: "v", matchedTokenBudget: 300, expectedModelCalls: 1, priority: 1,
    };
    expect(() => createVerificationRequestEligibilityRule({
      ...baseConfig, beliefDomain: { beliefKind: "binary", claimOptionCount: 3 },
    })).toThrow(/beliefDomain/);
    expect(() => createVerificationRequestEligibilityRule({
      ...baseConfig, beliefDomain: { beliefKind: "categorical", claimOptionCount: 1 },
    })).toThrow(/beliefDomain/);
    expect(() => createVerificationRequestEligibilityRule({
      ...baseConfig, beliefDomain: { beliefKind: "linear" as never, claimOptionCount: 3 },
    })).toThrow(/beliefDomain/);
  });

  it("fails closed when a categorical diagnosis omits claimOptionCount", () => {
    const rule = categoricalRule(3);
    const diagnosis = diagnosisFor({ beliefKind: "categorical", claimOptionCount: 3 });
    delete diagnosis.attributes.claimOptionCount;
    expect(() => evaluate(rule, diagnosis)).toThrow(/claimOptionCount/);
  });

  it("keeps detectionValidation V1 binary-only: absent domain and explicit binary/K=2 are readable; categorical/K=3 is rejected", async () => {
    const cat = categoricalFixture();
    const outputDir = tmpDir();
    const m = validCategoricalInvoker(cat.claim.id, cat.options);
    const plannedRuns = planV6SmokeRuns(cat.fixture, "run:v6-dv").filter(run => run.protocol === "epistemic_governance_v1");
    await runV6SmokeExecute({ outputDir, fixture: cat.fixture, invoker: m.invoker, plannedRuns, maxProviderCalls: 10, maxTotalTokens: 100_000 });
    const artifact = loadRawRun(outputDir, plannedRuns[0].runId);
    const verified = verifyV6CalibrationArtifactsV1({ artifacts: [{ sourcePath: "cat.json", artifact }], spec: specOf(cat.fixture) });
    expect(() => createV6DetectionValidationRecordV1(verified[0])).toThrow(/binary/);
    // A binary run with an explicit binary/K=2 rule is still readable.
    const base = createV6BinarySmokeFixture();
    const explicitBinary = { ...base, rule: createVerificationRequestEligibilityRule({
      certaintyThresholdPolicy: {
        id: "swarmalpha.threshold.v6-bin2", version: "1.0.0", quantityRef: REPORTED_BELIEF_CERTAINTY_V1,
        operator: "gte" as const, bounds: { lower: 0.9 },
        authority: { kind: "randomized_experiment_only", preregistrationRef: base.study.preregistrationRef! },
        selection: { kind: "fixed_preregistered", methodRef: { id: "m", version: "1.0.0" } },
        costs: { falsePositive: 1, falseNegative: 1, abstention: 1, action: 1 },
        missingResult: "ineligible", frozenAt: "2026-08-10T00:00:00.000Z",
      },
      beliefDomain: { beliefKind: "binary", claimOptionCount: 2 },
      maxVerifiedIndependentLineages: 0, verifierId: "v", matchedTokenBudget: 300, expectedModelCalls: 1, priority: 1,
    }) };
    const binDir = tmpDir();
    const m2 = binaryInvoker(base.task.claim.id);
    const binPlans = planV6SmokeRuns(explicitBinary, "run:v6-dvb").filter(run => run.protocol === "epistemic_governance_v1");
    await runV6SmokeExecute({ outputDir: binDir, fixture: explicitBinary, invoker: m2.invoker, plannedRuns: binPlans, maxProviderCalls: 10, maxTotalTokens: 100_000 });
    const binArtifact = loadRawRun(binDir, binPlans[0].runId);
    const binVerified = verifyV6CalibrationArtifactsV1({
      artifacts: [{ sourcePath: "bin.json", artifact: binArtifact }],
      spec: {
        datasetRef: { id: "swarmalpha.dataset.v6-bin", version: "1.0.0" },
        studies: [{
          studyRef: { id: explicitBinary.study.id, version: explicitBinary.study.version },
          governanceRules: [explicitBinary.rule],
          allocationMode: "scheduled_engineering",
          allowedTaskDefinitionHashes: [computeV6TaskDefinitionHashV1(explicitBinary.task as never, authorityOf(explicitBinary))],
        }],
      },
    });
    expect(() => createV6DetectionValidationRecordV1(binVerified[0])).not.toThrow();
  });
});

// ============================================================================
// Work Package C — provider / truth firewall
// ============================================================================

describe("v6 categorical provider and truth firewall", () => {
  it("includes all canonical options in the categorical discussion prompt without truth", async () => {
    const cat = categoricalFixture();
    const m = { invoke: vi.fn(async (_request: SingleAttemptTextInvokeRequest) => ({ rawContent: JSON.stringify({ message: "m", belief: { kind: "categorical", probabilities: {} }, evidence: [] }) })) };
    const adapter = createV6DiscussionAdapter({ contract: cat.fixture.discussionContract, invoker: { invoke: m.invoke } as unknown as SingleAttemptTextInvoker });
    const req: V6DiscussionRequestV1 = {
      requestSchemaRef: { id: "swarmalpha.v6.discussion-request", version: "1.0.0" },
      requestId: "discussion:run:v6:r1:agent:a",
      runId: "run:v6",
      taskId: "task:v6-cat",
      agentId: "agent:a",
      round: 1,
      protocol: "explicit_belief_v1",
      publicContext: cat.fixture.task.publicContext,
      ownPrivateInformation: cat.fixture.task.agents[0].privateInformation,
      claim: cat.claim,
      visibleTranscript: [],
      responseContract: "belief_json_v1",
      modelRef: { id: "model:a", version: "1.0.0" },
      invocationConfig: { temperature: 0 },
    };
    await adapter.respond(req, new AbortController().signal);
    const sent = m.invoke.mock.calls[0][0] as SingleAttemptTextInvokeRequest;
    expect(sent.userPrompt).toContain("Option A");
    expect(sent.userPrompt).toContain("Option B");
    expect(sent.userPrompt).toContain("Option C");
    // The outcome label is a canonical option and legitimately appears; what
    // must not appear is any signal of which option is the correct one.
    for (const forbidden of ["correct_answer", "groundTruth", "correctAnswer", "resolver:v6-cat", "is correct", "correct option"]) {
      expect(sent.userPrompt).not.toContain(forbidden);
    }
    expect(sent.userPrompt.indexOf("Option A")).toBeLessThan(sent.userPrompt.indexOf("Option B"));
    expect(sent.userPrompt.indexOf("Option B")).toBeLessThan(sent.userPrompt.indexOf("Option C"));
  });

  it("calls the invoker at most once and never retries a malformed categorical response", async () => {
    const cat = categoricalFixture();
    const m = { invoke: vi.fn(async (_request: SingleAttemptTextInvokeRequest) => ({ rawContent: "not-json" })) };
    const adapter = createV6DiscussionAdapter({ contract: cat.fixture.discussionContract, invoker: { invoke: m.invoke } as unknown as SingleAttemptTextInvoker });
    const req: V6DiscussionRequestV1 = {
      requestSchemaRef: { id: "swarmalpha.v6.discussion-request", version: "1.0.0" },
      requestId: "discussion:run:v6:r1:agent:a",
      runId: "run:v6", taskId: "task:v6-cat", agentId: "agent:a", round: 1,
      protocol: "explicit_belief_v1", publicContext: "c", ownPrivateInformation: "p", claim: cat.claim,
      visibleTranscript: [], responseContract: "belief_json_v1", modelRef: { id: "m", version: "1.0.0" }, invocationConfig: {},
    };
    await adapter.respond(req, new AbortController().signal);
    expect(m.invoke).toHaveBeenCalledTimes(1);
  });

  it("keeps the final elicitation request free of other-agent private views and truth", async () => {
    const cat = categoricalFixture();
    const m = validCategoricalInvoker(cat.claim.id, cat.options);
    const outputDir = tmpDir();
    const plannedRuns = planV6SmokeRuns(cat.fixture, "run:v6-catf").filter(run => run.protocol === "explicit_belief_v1");
    await runV6SmokeExecute({ outputDir, fixture: cat.fixture, invoker: m.invoker, plannedRuns, maxProviderCalls: 10, maxTotalTokens: 100_000 });
    const privateA = cat.fixture.task.agents[0].privateInformation;
    const privateB = cat.fixture.task.agents[1].privateInformation;
    const finalRequests = m.invoke.mock.calls
      .map(call => call[0] as SingleAttemptTextInvokeRequest)
      .filter(request => request.requestId.startsWith("final:"));
    expect(finalRequests).toHaveLength(2);
    for (const request of finalRequests) {
      const serialized = JSON.stringify(request);
      // Each agent sees its own private view; the OTHER agent's private view
      // and the truth must never appear.
      const isAgentA = request.requestId.includes("agent:a");
      expect(serialized).not.toContain(isAgentA ? privateB : privateA);
      for (const forbidden of ["groundTruth", "correctAnswer", "correct_answer", "resolver:v6-cat"]) {
        expect(serialized).not.toContain(forbidden);
      }
    }
  });
});
