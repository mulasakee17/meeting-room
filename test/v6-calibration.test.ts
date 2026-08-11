/**
 * v6 calibration-split tests. The calibration variant re-versions the
 * eligibility threshold (0.65) and the study/prereg identity without mutating
 * the frozen v1 smoke fixture. Everything here uses a mock invoker; no real or
 * paid LLM call, no network, no credentials.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyRawRunData } from "../experiments/campaign/replayVerifier";
import { resolveV6AuditableRawRunPath } from "../experiments/campaign/v6/productionVerticalSlice";
import type { SingleAttemptTextInvokeRequest, SingleAttemptTextInvoker } from "../experiments/campaign/v6/providerAdapters";
import { main, runV6SmokeExecute } from "../experiments/campaign/v6/run_v6_smoke";
import {
  createV6BinarySmokeFixture,
  planV6CalibrationRuns,
} from "../experiments/campaign/v6/v6BinarySmokeFixture";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const smokeFixture = createV6BinarySmokeFixture();
const calFixture = createV6BinarySmokeFixture({ calibration: true });

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v6-cal-"));
  tempDirs.push(dir);
  return dir;
}

/**
 * Mock invoker: agent A round 1 reports p=0.70 (derived certainty 0.70 —
 * below the frozen smoke threshold 0.9, at/above the calibration threshold
 * 0.65). All other reports are moderate.
 */
function p07Invoker(): { invoker: SingleAttemptTextInvoker; invoke: ReturnType<typeof vi.fn> } {
  const invoke = vi.fn(async (request: SingleAttemptTextInvokeRequest) => {
    if (request.requestId.startsWith("final:")) {
      return {
        rawContent: JSON.stringify({
          status: "answered",
          reports: [{
            claimId: "claim:v6-smoke-route-viable",
            value: { kind: "binary", probability: 0.4 },
          }],
        }),
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
      };
    }
    if (request.userPrompt.includes("matched process-control request")) {
      return {
        rawContent: JSON.stringify({ acknowledgment: "acknowledged" }),
        usage: { promptTokens: 4, completionTokens: 4, totalTokens: 8 },
      };
    }
    if (request.systemPrompt === "You are an independent verifier.") {
      return {
        rawContent: JSON.stringify({ publicContent: "Independent verification found the route evidence inconclusive." }),
        usage: { promptTokens: 4, completionTokens: 4, totalTokens: 8 },
      };
    }
    if (request.userPrompt.includes("plain text only")) {
      return { rawContent: `${request.requestId} public view`, usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 } };
    }
    const isAgentARound1 = request.userPrompt.includes("Sensor A reports a clear route.")
      && !request.userPrompt.includes("[round 1]");
    return {
      rawContent: JSON.stringify({
        message: "public message",
        belief: { kind: "binary", probability: isAgentARound1 ? 0.7 : 0.55 },
        evidence: [{ content: "evidence", relation: "supports" }],
      }),
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
    };
  });
  return { invoker: { invoke } as SingleAttemptTextInvoker, invoke };
}

function loadRawRun(outputDir: string, runId: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(resolveV6AuditableRawRunPath(outputDir, runId), "utf8")) as Record<string, unknown>;
}

describe("v6 calibration fixture versioning", () => {
  it("re-versions the threshold and study identity without mutating v1", () => {
    expect(smokeFixture.study.id).toBe("swarmalpha.study.v6-smoke");
    expect(calFixture.study.id).toBe("swarmalpha.study.v6-smoke-cal");
    expect(calFixture.study.version).toBe(smokeFixture.study.version);
    expect(calFixture.study.preregistrationRef?.id).toBe("swarmalpha.prereg.v6-smoke-cal");
    expect(smokeFixture.study.preregistrationRef?.id).toBe("swarmalpha.prereg.v6-smoke");
    const thresholdOf = (rule: { config: unknown }) =>
      (rule.config as { certaintyThresholdPolicy: { id: string; bounds: { lower: number } } }).certaintyThresholdPolicy;
    expect(thresholdOf(calFixture.rule).id).toBe("swarmalpha.threshold.v6-smoke-cal");
    expect(thresholdOf(calFixture.rule).bounds.lower).toBe(0.65);
    expect(thresholdOf(smokeFixture.rule).id).toBe("swarmalpha.threshold.v6-smoke");
    expect(thresholdOf(smokeFixture.rule).bounds.lower).toBe(0.9);
    // Identity versioning is via IDs/namespaces; the frozen timestamp stays on
    // the deterministic 08-10 clock so assignment ordering validates.
    expect(smokeFixture.study.frozenAt).toBe("2026-08-10T00:00:00.000Z");
    expect(calFixture.study.frozenAt).toBe("2026-08-10T00:00:00.000Z");
    // inference intent stays engineering; artifacts remain calibration-only.
    expect(calFixture.study.inferenceIntent).toBe("engineering");
  });

  it("plans a deterministic calibration batch of 2 replicates per protocol", () => {
    const runs = planV6CalibrationRuns(calFixture);
    expect(runs).toHaveLength(6);
    expect(runs.map(run => run.protocol)).toEqual([
      "text_communication_v1", "text_communication_v1",
      "explicit_belief_v1", "explicit_belief_v1",
      "epistemic_governance_v1", "epistemic_governance_v1",
    ]);
    expect(runs.map(run => run.runId)).toEqual([
      "run:v6-cal:text_communication_v1:1", "run:v6-cal:text_communication_v1:2",
      "run:v6-cal:explicit_belief_v1:1", "run:v6-cal:explicit_belief_v1:2",
      "run:v6-cal:epistemic_governance_v1:1", "run:v6-cal:epistemic_governance_v1:2",
    ]);
    expect(runs.map(run => run.primaryMasterSeed)).toEqual(
      planV6CalibrationRuns(calFixture).map(run => run.primaryMasterSeed),
    );
    expect(runs.every(run => run.plannedProviderCalls >= 6)).toBe(true);
  });

  it("keeps the frozen v1 threshold discriminating: p=0.70 does not trigger at 0.9", async () => {
    const outputDir = tmpDir();
    const m = p07Invoker();
    const { results } = await runV6SmokeExecute({
      outputDir,
      fixture: smokeFixture,
      invoker: m.invoker,
      maxProviderCalls: 20,
      maxTotalTokens: 100_000,
    });
    const g = loadRawRun(outputDir, "run:v6-smoke:epistemic_governance_v1");
    const trail = g.governanceAuditTrail as {
      actionTransitions: Array<{ to: string }>;
      eventAssignments: Array<{ assignedArm: string }>;
    };
    expect(trail.actionTransitions).toHaveLength(0);
    expect(trail.eventAssignments).toHaveLength(0);
    expect(results.every(result => result.reused === false)).toBe(true);
  });

  it("triggers governance at the calibration threshold 0.65 and replays clean", async () => {
    const outputDir = tmpDir();
    const m = p07Invoker();
    const { results } = await runV6SmokeExecute({
      outputDir,
      fixture: calFixture,
      invoker: m.invoker,
      maxProviderCalls: 40,
      maxTotalTokens: 100_000,
      plannedRuns: planV6CalibrationRuns(calFixture),
    });
    expect(results).toHaveLength(6);
    const g = loadRawRun(outputDir, "run:v6-cal:epistemic_governance_v1:1");
    const trail = g.governanceAuditTrail as {
      actionTransitions: Array<{ to: string }>;
      eventAssignments: Array<{ assignedArm: string }>;
    };
    const transitions = trail.actionTransitions;
    const assignments = trail.eventAssignments;
    expect(assignments).toHaveLength(1);
    expect(["apply", "sham", "holdout"]).toContain(assignments[0].assignedArm);
    expect(transitions.some(t => t.to === "compliance_observed")).toBe(true);
    // Replay with the calibration rule; the frozen smoke rule must not replay a cal artifact.
    const replay = verifyRawRunData("(cal)", g, { governanceRules: [calFixture.rule] });
    expect(replay.governanceAuditStatus).toBe("sealed_decision_replay_verified");
    expect(replay.runIssues).toEqual([]);
    const v1Replay = verifyRawRunData("(cal-v1-rule)", g, { governanceRules: [smokeFixture.rule] });
    expect(v1Replay.runIssues.length).toBeGreaterThan(0);
  });

  it("plans a calibration dry-run with no artifacts and explicit caps", async () => {
    const outputDir = tmpDir();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await main(["--dry-run", "--calibration", "--output-dir", outputDir, "--max-provider-calls", "40"]);
    expect(code).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(fs.readdirSync(outputDir)).toHaveLength(0);
  });

  it("refuses paid calibration before task-bank split admission and before credential use", async () => {
    const outputDir = tmpDir();
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await main([
      "--execute", "--calibration", "--output-dir", outputDir, "--max-provider-calls", "40",
    ]);
    expect(code).toBe(5);
    const errors = errorSpy.mock.calls.flat().join(" ");
    expect(errors).toContain("calibration_task_bank_not_admitted");
    expect(errors).not.toContain("deepseek_api_key_unavailable");
    expect(fs.readdirSync(outputDir)).toHaveLength(0);
  });
});

describe("v6 calibration threshold exploration (0.7 knife-edge variant)", () => {
  const thresholdOf = (rule: { config: unknown }) =>
    (rule.config as { certaintyThresholdPolicy: { id: string; bounds: { lower: number } } }).certaintyThresholdPolicy;

  const cal07 = createV6BinarySmokeFixture({
    calibration: true,
    namespace: "v6-smoke-cal07",
    certaintyLowerBound: 0.7,
  });

  it("creates a distinct identity for the 0.7 threshold without mutating 0.65 or v1", () => {
    expect(cal07.study.id).toBe("swarmalpha.study.v6-smoke-cal07");
    expect(thresholdOf(cal07.rule).id).toBe("swarmalpha.threshold.v6-smoke-cal07");
    expect(thresholdOf(cal07.rule).bounds.lower).toBe(0.7);
    // The 0.65 calibration and the frozen smoke identities are untouched.
    expect(calFixture.study.id).toBe("swarmalpha.study.v6-smoke-cal");
    expect(thresholdOf(calFixture.rule).bounds.lower).toBe(0.65);
    expect(smokeFixture.study.id).toBe("swarmalpha.study.v6-smoke");
    expect(thresholdOf(smokeFixture.rule).bounds.lower).toBe(0.9);
  });

  it("plans 0.7-variant runs with a distinct run-id prefix", () => {
    const runs = planV6CalibrationRuns(cal07, 3, "run:v6-cal07");
    expect(runs).toHaveLength(9);
    expect(runs.map(run => run.runId).slice(0, 3)).toEqual([
      "run:v6-cal07:text_communication_v1:1",
      "run:v6-cal07:text_communication_v1:2",
      "run:v6-cal07:text_communication_v1:3",
    ]);
    expect(runs.every(run => run.runId.startsWith("run:v6-cal07:"))).toBe(true);
  });
});
