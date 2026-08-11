import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeV6TaskDefinitionHashV1 } from "../experiments/campaign/v6/v6TaskManifest";
import {
  createV6BinarySmokeFixture,
  planV6SmokeRuns,
  type V6SmokeFixtureV1,
} from "../experiments/campaign/v6/v6BinarySmokeFixture";
import { runV6SmokeExecute } from "../experiments/campaign/v6/run_v6_smoke";
import type {
  SingleAttemptTextInvokeRequest,
  SingleAttemptTextInvoker,
} from "../experiments/campaign/v6/providerAdapters";
import {
  verifyV6CalibrationArtifactsV1,
  type V6CalibrationDatasetSpecV1,
  type VerifiedV6CalibrationArtifactV1,
} from "../experiments/campaign/v6/verifiedCalibrationDataset";
import {
  createV6DetectionValidationRecordV1,
  isVerifiedV6DetectionValidationRecordV1,
  summarizeV6DetectionValidationV1,
  validateV6DetectionValidationRecordV1,
} from "../experiments/campaign/v6/detectionValidation";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v6-detection-validation-"));
  tempDirs.push(dir);
  return dir;
}

function authorityOf(fixture: V6SmokeFixtureV1) {
  return {
    adapterRef: fixture.taskAdapter.adapterRef,
    taskSchemaRef: fixture.taskAdapter.taskSchemaRef,
    resolution: fixture.taskAdapter.resolution,
  };
}

function invokerFor(probability: number, claimId: string): SingleAttemptTextInvoker {
  return {
    invoke: vi.fn(async (request: SingleAttemptTextInvokeRequest) => {
      const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
      if (request.requestId.startsWith("final:")) {
        return {
          rawContent: JSON.stringify({
            status: "answered",
            reports: [{ claimId, value: { kind: "binary", probability } }],
          }),
          usage,
        };
      }
      return {
        rawContent: JSON.stringify({
          message: `public belief p=${probability}`,
          belief: { kind: "binary", probability },
          evidence: [{ content: "agent-reported evidence", relation: "supports" }],
        }),
        usage,
      };
    }),
  };
}

async function createVerifiedCohort(): Promise<VerifiedV6CalibrationArtifactV1[]> {
  const base = createV6BinarySmokeFixture({
    calibration: true,
    namespace: "v6-detection-validation",
    certaintyLowerBound: 0.65,
  });
  const outputDir = tmpDir();
  const artifacts: Array<{ sourcePath: string; artifact: unknown }> = [];
  const taskHashes = new Set<string>();
  const cases = [
    { suffix: "flag-correct", probability: 0.7, outcome: true },
    { suffix: "flag-incorrect", probability: 0.7, outcome: false },
    { suffix: "clear-correct", probability: 0.6, outcome: true },
    { suffix: "clear-incorrect", probability: 0.6, outcome: false },
  ] as const;
  for (const item of cases) {
    const fixture: V6SmokeFixtureV1 = {
      ...base,
      task: { ...base.task, outcome: item.outcome },
    };
    taskHashes.add(computeV6TaskDefinitionHashV1(fixture.task, authorityOf(fixture)));
    const plannedRuns = planV6SmokeRuns(fixture, `run:v6-detection:${item.suffix}`)
      .filter(run => run.protocol === "epistemic_governance_v1");
    const executed = await runV6SmokeExecute({
      outputDir,
      fixture,
      invoker: invokerFor(item.probability, fixture.task.claim.id),
      plannedRuns,
      maxProviderCalls: 10,
      maxTotalTokens: 10_000,
    });
    const sourcePath = executed.results[0].absolutePath;
    artifacts.push({ sourcePath, artifact: JSON.parse(fs.readFileSync(sourcePath, "utf8")) });
  }
  const spec: V6CalibrationDatasetSpecV1 = {
    datasetRef: { id: "swarmalpha.dataset.v6-detection-validation", version: "1.0.0" },
    studies: [{
      studyRef: { id: base.study.id, version: base.study.version },
      governanceRules: [base.rule],
      allocationMode: "scheduled_engineering",
      allowedTaskDefinitionHashes: [...taskHashes],
    }],
  };
  return verifyV6CalibrationArtifactsV1({ artifacts, spec });
}

describe("v6 detector validation projection", () => {
  it("projects only verified, pre-intervention selected reports into truth-labeled records", async () => {
    const verified = await createVerifiedCohort();
    const records = verified.map(createV6DetectionValidationRecordV1);
    expect(records).toHaveLength(4);
    for (const record of records) {
      expect(() => validateV6DetectionValidationRecordV1(record)).not.toThrow();
      expect(record.selectionProbability).toBe(0.5);
      expect(record.inclusionWeight).toBe(2);
      expect(record.verifiedIndependentLineageRecordCount).toBe(0);
      expect(Object.isFrozen(record)).toBe(true);
      expect(Object.isFrozen(record.sourceRefs)).toBe(true);
      expect(isVerifiedV6DetectionValidationRecordV1(record)).toBe(true);
    }
    expect(records.filter(record => record.operationalRiskPredicate)).toHaveLength(2);
    expect(records.filter(record => record.hardOutcomeLabel === "incorrect")).toHaveLength(2);
    expect(() => createV6DetectionValidationRecordV1(verified[0].artifact as never))
      .toThrow(/verified calibration loader/);
  });

  it("reports weighted descriptive confusion metrics without claiming causal validity", async () => {
    const records = (await createVerifiedCohort()).map(createV6DetectionValidationRecordV1);
    const summary = summarizeV6DetectionValidationV1(records);
    expect(summary.inferenceStatus).toBe("descriptive_calibration_only");
    expect(summary.recordCount).toBe(4);
    expect(summary.weightedPopulationSize).toBe(8);
    expect(summary.weightedMeanReportBrier).toBeCloseTo(0.275, 12);
    expect(summary.weightedFlaggedMeanReportBrier).toBeCloseTo(0.29, 12);
    expect(summary.weightedUnflaggedMeanReportBrier).toBeCloseTo(0.26, 12);
    expect(summary.weightedBrierRiskGap).toBeCloseTo(0.03, 12);
    expect(summary.weightedRiskFlagRate).toBe(0.5);
    expect(summary.weightedTieRate).toBe(0);
    expect(summary.confusionWeights).toEqual({
      truePositive: 2,
      falsePositive: 2,
      falseNegative: 2,
      trueNegative: 2,
    });
    expect(summary.precision).toBe(0.5);
    expect(summary.recall).toBe(0.5);
    expect(summary.specificity).toBe(0.5);
  });

  it("rejects post-projection predicate and loss tampering", async () => {
    const record = createV6DetectionValidationRecordV1((await createVerifiedCohort())[0]);
    expect(() => validateV6DetectionValidationRecordV1({
      ...record,
      operationalRiskPredicate: !record.operationalRiskPredicate,
    })).toThrow(/predicate fields/);
    expect(() => validateV6DetectionValidationRecordV1({
      ...record,
      reportBrierLoss: record.reportBrierLoss + 0.1,
    })).toThrow(/Brier loss/);
    expect(() => validateV6DetectionValidationRecordV1({
      ...record,
      unexpectedAuthority: true,
    } as any)).toThrow(/fields differ/);
    expect(() => validateV6DetectionValidationRecordV1({
      ...record,
      verifierAvailable: "yes",
    } as any)).toThrow(/must be boolean/);
  });

  it("does not treat a serialized self-consistent record as source-bound authority", async () => {
    const record = createV6DetectionValidationRecordV1((await createVerifiedCohort())[0]);
    const serialized = JSON.parse(JSON.stringify(record));
    expect(() => validateV6DetectionValidationRecordV1(serialized)).not.toThrow();
    expect(isVerifiedV6DetectionValidationRecordV1(serialized)).toBe(false);
    expect(() => summarizeV6DetectionValidationV1([serialized]))
      .toThrow(/source-bound verified projections/);
  });
});
