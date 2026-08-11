/**
 * Day 5 offline/mock calibration matrix. Full-slice mock runs across 2 task
 * families × 4 final terminal statuses, plus the six matrix invariants:
 *   - operational Brier finite + replay-clean under every terminal status;
 *   - T/B/G final measurement structurally homomorphic;
 *   - G apply/sham/holdout arms are deterministic fixtures;
 *   - sham delivers matched-control content (no model/task evidence);
 *   - a tampered artifact is rejected by cross-object replay;
 *   - Gate D5: the calibration table regenerates deterministically from
 *     pure fixture artifacts (no manual metric copying).
 * All mock invokers; no real or paid LLM call, no network, no credentials.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyRawRunData } from "../experiments/campaign/replayVerifier";
import { resolveV6AuditableRawRunPath } from "../experiments/campaign/v6/productionVerticalSlice";
import type { SingleAttemptTextInvokeRequest, SingleAttemptTextInvoker } from "../experiments/campaign/v6/providerAdapters";
import { runV6SmokeExecute } from "../experiments/campaign/v6/run_v6_smoke";
import {
  createV6BinarySmokeFixture,
  planV6CalibrationRuns,
  planV6SmokeRuns,
  type V6SmokeFixtureV1,
  type V6SmokePlannedRun,
} from "../experiments/campaign/v6/v6BinarySmokeFixture";
import {
  analyzeV6CalibrationDir,
  analyzeVerifiedV6Run,
} from "../experiments/campaign/v6/analyzeV6Calibration";
import {
  verifyV6CalibrationArtifactsV1,
  type V6CalibrationDatasetSpecV1,
} from "../experiments/campaign/v6/verifiedCalibrationDataset";
import { computeV6TaskDefinitionHashV1 } from "../experiments/campaign/v6/v6TaskManifest";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const smokeFixture = createV6BinarySmokeFixture();
const netFixture = createV6BinarySmokeFixture({ taskFamily: "network-fault" });
const datasetSpec: V6CalibrationDatasetSpecV1 = {
  datasetRef: { id: "swarmalpha.dataset.v6-matrix-test", version: "1.0.0" },
  studies: [smokeFixture, netFixture].map(fixture => ({
    studyRef: { id: fixture.study.id, version: fixture.study.version },
    governanceRules: [fixture.rule],
    allocationMode: "scheduled_engineering" as const,
    allowedTaskDefinitionHashes: [computeV6TaskDefinitionHashV1(fixture.task, {
      adapterRef: fixture.taskAdapter.adapterRef,
      taskSchemaRef: fixture.taskAdapter.taskSchemaRef,
      resolution: fixture.taskAdapter.resolution,
    })],
  })),
};

function analyzeArtifact(sourcePath: string, artifact: Record<string, unknown>) {
  const [verified] = verifyV6CalibrationArtifactsV1({
    artifacts: [{ sourcePath, artifact }],
    spec: datasetSpec,
  });
  return analyzeVerifiedV6Run(verified);
}

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v6-matrix-"));
  tempDirs.push(dir);
  return dir;
}

type FinalMode = "answered" | "abstained" | "invalid" | "unavailable";

/** Mock invoker. Agent A round 1 reports p=0.95 (derived certainty 0.9, fires
 * the smoke threshold); final-phase behavior is selected by `finalMode`. */
function invokerFor(claimId: string, finalMode: FinalMode): { invoker: SingleAttemptTextInvoker; invoke: ReturnType<typeof vi.fn> } {
  const invoke = vi.fn(async (request: SingleAttemptTextInvokeRequest) => {
    const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
    if (request.requestId.startsWith("final:")) {
      switch (finalMode) {
        case "answered":
          return { rawContent: JSON.stringify({ status: "answered", reports: [{ claimId, value: { kind: "binary", probability: 0.4 } }] }), usage };
        case "abstained":
          return { rawContent: JSON.stringify({ status: "abstained" }), usage };
        case "invalid":
          return { rawContent: "not-json", usage };
        case "unavailable":
          throw new Error("provider down for final");
      }
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
    const isFirstRound = !request.userPrompt.includes("[round 1]");
    return {
      rawContent: JSON.stringify({
        message: "public message",
        belief: { kind: "binary", probability: isFirstRound ? 0.95 : 0.6 },
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

function textPlan(fixture: V6SmokeFixtureV1, prefix: string): V6SmokePlannedRun[] {
  return planV6SmokeRuns(fixture, prefix).filter(run => run.protocol === "text_communication_v1");
}

describe("v6 calibration offline matrix", () => {
  it("keeps operational Brier finite and replay-clean under all four terminal statuses (both families)", async () => {
    const fixtures: Array<[string, V6SmokeFixtureV1]> = [["smoke", smokeFixture], ["net", netFixture]];
    for (const [label, fixture] of fixtures) {
      for (const mode of ["answered", "abstained", "invalid", "unavailable"] as FinalMode[]) {
        const outputDir = tmpDir();
        const prefix = `run:v6-m-${label}-${mode}`;
        const m = invokerFor(fixture.task.claim.id, mode);
        await runV6SmokeExecute({
          outputDir,
          fixture,
          invoker: m.invoker,
          maxProviderCalls: 20,
          maxTotalTokens: 100_000,
          plannedRuns: textPlan(fixture, prefix),
        });
        const artifact = loadRawRun(outputDir, `${prefix}:text_communication_v1`);
        const row = analyzeArtifact("(matrix)", artifact);
        const expectedCounts = mode === "answered"
          ? { answered: 2, abstained: 0, invalid: 0, unavailable: 0 }
          : { answered: 0, abstained: mode === "abstained" ? 2 : 0, invalid: mode === "invalid" ? 2 : 0, unavailable: mode === "unavailable" ? 2 : 0 };
        expect(row.terminalCounts).toEqual(expectedCounts);
        expect(row.operationalBrier).toBeCloseTo(mode === "answered" ? 0.16 : 0.25, 10);
        expect(row.operationalBrier !== null && Number.isFinite(row.operationalBrier)).toBe(true);
        const replay = verifyRawRunData("(matrix)", artifact, { governanceRules: [fixture.rule] });
        expect(replay.governanceAuditStatus).toBe("sealed_decision_replay_verified");
        expect(replay.runIssues).toEqual([]);
      }
    }
  });

  it("keeps the T/B/G final measurement structurally homomorphic", async () => {
    for (const [label, fixture] of [["smoke", smokeFixture], ["net", netFixture]] as Array<[string, V6SmokeFixtureV1]>) {
      const outputDir = tmpDir();
      const prefix = `run:v6-h-${label}`;
      const m = invokerFor(fixture.task.claim.id, "answered");
      await runV6SmokeExecute({
        outputDir,
        fixture,
        invoker: m.invoker,
        maxProviderCalls: 20,
        maxTotalTokens: 100_000,
        plannedRuns: planV6SmokeRuns(fixture, prefix),
      });
      const shapes: string[] = [];
      for (const protocol of ["text_communication_v1", "explicit_belief_v1", "epistemic_governance_v1"]) {
        const artifact = loadRawRun(outputDir, `${prefix}:${protocol}`);
        const records = (artifact.finalElicitationCollection as { records: Array<Record<string, unknown>> }).records;
        expect(records).toHaveLength(2);
        expect(records.every(record => record.status === "answered")).toBe(true);
        shapes.push(records.map(record => Object.keys(record).sort().join(",")).join(";"));
      }
      expect(new Set(shapes).size).toBe(1);
    }
  });

  it("assigns G events to deterministic apply/sham/holdout arms and delivers matched-control content on sham", async () => {
    const outputDir = tmpDir();
    const m = invokerFor(smokeFixture.task.claim.id, "answered");
    const gRuns = planV6CalibrationRuns(smokeFixture, 10, "run:v6-matg")
      .filter(run => run.protocol === "epistemic_governance_v1");
    expect(gRuns).toHaveLength(10);
    await runV6SmokeExecute({
      outputDir,
      fixture: smokeFixture,
      invoker: m.invoker,
      maxProviderCalls: 80,
      maxTotalTokens: 100_000,
      plannedRuns: gRuns,
    });
    const arms: string[] = [];
    for (const run of gRuns) {
      const artifact = loadRawRun(outputDir, run.runId);
      const trail = artifact.governanceAuditTrail as { eventAssignments?: Array<{ assignedArm?: string }> };
      const assigned = trail.eventAssignments?.[0]?.assignedArm;
      expect(["apply", "sham", "holdout"]).toContain(assigned);
      arms.push(assigned!);
    }
    expect(new Set(arms).size).toBeGreaterThanOrEqual(2);
    const shamRun = gRuns[arms.findIndex(arm => arm === "sham")];
    if (shamRun) {
      const serialized = JSON.stringify(loadRawRun(outputDir, shamRun.runId));
      expect(serialized).toContain("Matched control completed; no new evidence was introduced.");
      expect(serialized).not.toContain("acknowledged");
    }
    // Determinism: the same runId in a fresh directory assigns the same arm.
    const firstArm = arms[0];
    const rerunDir = tmpDir();
    const m2 = invokerFor(smokeFixture.task.claim.id, "answered");
    await runV6SmokeExecute({
      outputDir: rerunDir,
      fixture: smokeFixture,
      invoker: m2.invoker,
      maxProviderCalls: 20,
      maxTotalTokens: 100_000,
      plannedRuns: [gRuns[0]],
    });
    const rerun = loadRawRun(rerunDir, gRuns[0].runId);
    const rerunTrail = rerun.governanceAuditTrail as { eventAssignments?: Array<{ assignedArm?: string }> };
    expect(rerunTrail.eventAssignments?.[0]?.assignedArm).toBe(firstArm);
  });

  it("rejects a tampered artifact via cross-object replay", async () => {
    const outputDir = tmpDir();
    const m = invokerFor(smokeFixture.task.claim.id, "answered");
    await runV6SmokeExecute({
      outputDir,
      fixture: smokeFixture,
      invoker: m.invoker,
      maxProviderCalls: 20,
      maxTotalTokens: 100_000,
      plannedRuns: planV6SmokeRuns(smokeFixture, "run:v6-tamper"),
    });
    const artifact = loadRawRun(outputDir, "run:v6-tamper:text_communication_v1");
    const clean = verifyRawRunData("(clean)", artifact, { governanceRules: [smokeFixture.rule] });
    expect(clean.runIssues).toEqual([]);
    const tampered = structuredClone(artifact);
    (tampered.operationalOutcome as { primaryMetric: { value: number } }).primaryMetric.value = 0.9;
    const dirty = verifyRawRunData("(tampered)", tampered, { governanceRules: [smokeFixture.rule] });
    expect(dirty.runIssues.length).toBeGreaterThan(0);
  });

  it("Gate D5: regenerates the frozen calibration table deterministically from fixture artifacts", async () => {
    const outputDir = tmpDir();
    for (const [label, fixture] of [["smoke", smokeFixture], ["net", netFixture]] as Array<[string, V6SmokeFixtureV1]>) {
      const m = invokerFor(fixture.task.claim.id, "answered");
      await runV6SmokeExecute({
        outputDir,
        fixture,
        invoker: m.invoker,
        maxProviderCalls: 40,
        maxTotalTokens: 100_000,
        plannedRuns: planV6SmokeRuns(fixture, `run:v6-d5-${label}`),
      });
    }
    const table = analyzeV6CalibrationDir(outputDir, datasetSpec);
    expect(table).toContain("text_communication_v1 | scheduled_engineering | 1 |");
    expect(table).toContain("explicit_belief_v1 | scheduled_engineering | 1 |");
    expect(table).toContain("epistemic_governance_v1 | scheduled_engineering | 1 |");
    // Deterministic regeneration: identical table on a second pass.
    expect(analyzeV6CalibrationDir(outputDir, datasetSpec)).toBe(table);
    // The table is derived from the artifacts, not hand-copied: the raw rows
    // and the per-run analysis agree.
    const rawRows = fs.readdirSync(outputDir)
      .filter(file => file.endsWith(".raw-run.v5.json"))
      .map(file => analyzeArtifact(
        path.join(outputDir, file),
        JSON.parse(fs.readFileSync(path.join(outputDir, file), "utf8")) as Record<string, unknown>,
      ));
    const answeredRows = rawRows.filter(row => row.protocol === "text_communication_v1" && row.family.includes("distributed-binary"));
    expect(answeredRows).toHaveLength(1);
    expect(answeredRows[0].operationalBrier).toBeCloseTo(0.16, 10);
  });
});
