import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BeliefReport, EpistemicEvidence } from "@/lib/epistemic";
import {
  createV6MonitoringSelectionV1,
  deriveVerifiedIndependentLineageCountV1,
} from "../experiments/campaign/v6/monitoringDesign";
import {
  computeV6TaskDefinitionHashV1,
  createV6TaskManifestV1,
  validateV6TaskManifestOpeningV1,
} from "../experiments/campaign/v6/v6TaskManifest";
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
  loadVerifiedV6CalibrationDatasetV1,
  verifyV6CalibrationArtifactsV1,
  type V6CalibrationDatasetSpecV1,
} from "../experiments/campaign/v6/verifiedCalibrationDataset";
import {
  aggregateV6CalibrationTable,
  analyzeVerifiedV6Run,
} from "../experiments/campaign/v6/analyzeV6Calibration";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v6-authority-"));
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

function specOf(fixture: V6SmokeFixtureV1): V6CalibrationDatasetSpecV1 {
  return {
    datasetRef: { id: "swarmalpha.dataset.v6-authority-test", version: "1.0.0" },
    studies: [{
      studyRef: { id: fixture.study.id, version: fixture.study.version },
      governanceRules: [fixture.rule],
      allocationMode: "scheduled_engineering",
      allowedTaskDefinitionHashes: [computeV6TaskDefinitionHashV1(fixture.task, authorityOf(fixture))],
    }],
  };
}

function unresolvedInvoker(claimId: string) {
  const invoke = vi.fn(async (request: SingleAttemptTextInvokeRequest) => {
    const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
    if (request.requestId.startsWith("final:")) {
      const probability = request.requestId.includes("agent:a") ? 0.4 : 0.6;
      return {
        rawContent: JSON.stringify({
          status: "answered",
          reports: [{ claimId, value: { kind: "binary", probability } }],
        }),
        usage,
      };
    }
    if (request.userPrompt.includes("plain text only")) {
      return { rawContent: `${request.requestId} public view`, usage };
    }
    return {
      rawContent: JSON.stringify({
        message: "public message",
        belief: { kind: "binary", probability: 0.6 },
        evidence: [{ content: "public evidence", relation: "supports" }],
      }),
      usage,
    };
  });
  return { invoker: { invoke } as SingleAttemptTextInvoker, invoke };
}

describe("v6 task and monitoring authority boundaries", () => {
  it("selects a monitoring target independently of input ordering and reaches both roster positions across seeds", () => {
    const fixture = createV6BinarySmokeFixture();
    const base = {
      design: fixture.monitoringDesign,
      runId: "run:monitoring-order",
      selectedAt: "2026-08-10T00:00:01.000Z",
    };
    const forward = createV6MonitoringSelectionV1({
      ...base,
      candidateReportIds: ["report:a", "report:b"],
      masterSeed: 7,
    });
    const reversed = createV6MonitoringSelectionV1({
      ...base,
      candidateReportIds: ["report:b", "report:a"],
      masterSeed: 7,
    });
    expect(reversed).toEqual(forward);
    const selected = new Set(Array.from({ length: 32 }, (_, masterSeed) =>
      createV6MonitoringSelectionV1({
        ...base,
        candidateReportIds: ["report:a", "report:b"],
        masterSeed,
      }).selectedReportId));
    expect(selected).toEqual(new Set(["report:a", "report:b"]));
  });

  it("records an explicit empty monitoring population instead of inventing a target", () => {
    const fixture = createV6BinarySmokeFixture();
    const selection = createV6MonitoringSelectionV1({
      design: fixture.monitoringDesign,
      runId: "run:monitoring-empty",
      candidateReportIds: [],
      masterSeed: 7,
      selectedAt: "2026-08-10T00:00:01.000Z",
    });
    expect(selection.status).toBe("empty_population");
    expect(selection.candidateReportIds).toEqual([]);
    expect(selection.selectedReportId).toBeNull();
    expect(selection.selectionProbability).toBe(0);
  });

  it("does not promote self-declared agent lineage to verified independent support", () => {
    const report: BeliefReport = {
      id: "report:a", claimId: "claim:a", agentId: "agent:a", round: 1,
      value: { kind: "binary", probability: 0.9 }, stake: 0, createdAt: "2026-08-10T00:00:00.000Z",
      evidence: [{ evidenceId: "e:agent", relation: "supports" }, { evidenceId: "e:tool", relation: "supports" }],
    };
    const evidence: EpistemicEvidence[] = [
      { id: "e:agent", content: "self report", createdAt: report.createdAt, provenance: { sourceKind: "agent", sourceId: "agent:a", lineageId: "L1", contentHash: "sha256:" + "1".repeat(64) } },
      { id: "e:tool", content: "tool result", createdAt: report.createdAt, provenance: { sourceKind: "tool", sourceId: "tool:a", lineageId: "L2", contentHash: "sha256:" + "2".repeat(64) } },
    ];
    expect(deriveVerifiedIndependentLineageCountV1({ report, evidence, verifiedEvidenceIds: ["e:agent"] })).toBe(0);
    expect(deriveVerifiedIndependentLineageCountV1({ report, evidence, verifiedEvidenceIds: ["e:agent", "e:tool"] })).toBe(1);
  });

  it("binds public/private task inputs and ground truth before assignment", () => {
    const fixture = createV6BinarySmokeFixture();
    const manifest = createV6TaskManifestV1({
      runId: "run:task-manifest",
      studyRef: fixture.study,
      task: fixture.task,
      authority: authorityOf(fixture),
      monitoringDesignRef: fixture.monitoringDesign.designRef,
      monitoringDesignHash: fixture.monitoringDesign.contentHash,
      committedAt: "2026-08-10T00:00:00.000Z",
    });
    expect(() => validateV6TaskManifestOpeningV1(manifest, {
      ...fixture.task,
      outcome: !fixture.task.outcome,
    }, authorityOf(fixture))).toThrow(/task manifest does not match/);
    expect(() => validateV6TaskManifestOpeningV1(manifest, {
      ...fixture.task,
      agents: fixture.task.agents.map((agent, index) => index === 0
        ? { ...agent, privateInformation: `${agent.privateInformation} drift` }
        : agent),
    }, authorityOf(fixture))).toThrow(/task manifest does not match/);
  });

  it("rejects outcome drift on exact retry with zero new provider calls", async () => {
    const fixture = createV6BinarySmokeFixture();
    const outputDir = tmpDir();
    const mock = unresolvedInvoker(fixture.task.claim.id);
    const plannedRuns = planV6SmokeRuns(fixture, "run:v6-authority")
      .filter(run => run.protocol === "text_communication_v1");
    await runV6SmokeExecute({
      outputDir, fixture, invoker: mock.invoker, plannedRuns,
      maxProviderCalls: 10, maxTotalTokens: 10_000,
    });
    const calls = mock.invoke.mock.calls.length;
    const drifted: V6SmokeFixtureV1 = {
      ...fixture,
      task: { ...fixture.task, outcome: !fixture.task.outcome },
    };
    await expect(runV6SmokeExecute({
      outputDir, fixture: drifted, invoker: mock.invoker, plannedRuns,
      maxProviderCalls: 10, maxTotalTokens: 10_000,
    })).rejects.toThrow(/task manifest does not match/);
    expect(mock.invoke).toHaveBeenCalledTimes(calls);
  });

  it("admits only replay-clean unique runs and preserves unresolved task outcomes", async () => {
    const fixture = createV6BinarySmokeFixture();
    const outputDir = tmpDir();
    const mock = unresolvedInvoker(fixture.task.claim.id);
    const plannedRuns = planV6SmokeRuns(fixture, "run:v6-verified")
      .filter(run => run.protocol === "text_communication_v1");
    const executed = await runV6SmokeExecute({
      outputDir, fixture, invoker: mock.invoker, plannedRuns,
      maxProviderCalls: 10, maxTotalTokens: 10_000,
    });
    const spec = specOf(fixture);
    const verified = loadVerifiedV6CalibrationDatasetV1({ directories: [outputDir], spec });
    expect(verified).toHaveLength(1);
    expect(Object.isFrozen(verified[0].artifact)).toBe(true);
    expect(Object.isFrozen(verified[0].artifact.operationalOutcome.primaryMetric)).toBe(true);
    expect(Reflect.set(verified[0].artifact.operationalOutcome.primaryMetric, "value", 999)).toBe(false);
    const row = analyzeVerifiedV6Run(verified[0]);
    expect(row.taskOutcomeStatus).toBe("unresolved");
    expect(row.accuracy).toBeNull();
    const aggregate = aggregateV6CalibrationTable([row])[0];
    expect(aggregate.taskOutcomeStatusCounts).toEqual({ scored: 0, unresolved: 1, invalid: 0 });
    expect(aggregate.scoredRunRate).toBe(0);

    const artifact = JSON.parse(fs.readFileSync(executed.results[0].absolutePath, "utf8"));
    expect(() => verifyV6CalibrationArtifactsV1({
      artifacts: [
        { sourcePath: "a.json", artifact },
        { sourcePath: "b.json", artifact: structuredClone(artifact) },
      ],
      spec,
    })).toThrow(/duplicate runId/);
    const missingUsage = structuredClone(artifact) as any;
    delete missingUsage.tokenUsage;
    expect(() => verifyV6CalibrationArtifactsV1({
      artifacts: [{ sourcePath: "missing-usage.json", artifact: missingUsage }],
      spec,
    })).toThrow(/prompt tokens/);
    expect(() => verifyV6CalibrationArtifactsV1({
      artifacts: [{ sourcePath: "invalid-spec.json", artifact }],
      spec: {
        ...spec,
        studies: [{ ...spec.studies[0], allocationMode: "adaptive" as any }],
      },
    })).toThrow(/allocationMode/);
  });
});
