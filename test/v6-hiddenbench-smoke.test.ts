/**
 * Core HiddenBench categorical smoke wiring tests. All provider interactions
 * use one-shot mocks; no network, credentials, retries, or paid calls.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyRawRunData } from "../experiments/campaign/replayVerifier";
import {
  resolveV6AuditableRawRunPath,
} from "../experiments/campaign/v6/productionVerticalSlice";
import type {
  SingleAttemptTextInvokeRequest,
  SingleAttemptTextInvoker,
} from "../experiments/campaign/v6/providerAdapters";
import {
  main,
  parseSmokeArgs,
  runV6SmokeExecute,
} from "../experiments/campaign/v6/run_v6_smoke";
import { planV6SmokeRuns } from "../experiments/campaign/v6/v6BinarySmokeFixture";
import { createV6HiddenBenchSmokeFixtureV1 } from "../experiments/campaign/v6/v6HiddenBenchSmokeFixture";
import { V6ProviderInvocationError } from "../experiments/campaign/v6/providerDiagnostics";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v6-hb-smoke-"));
  tempDirs.push(dir);
  return dir;
}

function categoricalInvoker(claimId: string, options: readonly string[]) {
  const probabilities = Object.fromEntries(options.map((option, index) => [
    option,
    index === 0 ? 0.9 : 0.1 / (options.length - 1),
  ]));
  const invoke = vi.fn(async (request: SingleAttemptTextInvokeRequest) => {
    const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
    if (request.requestId.startsWith("final:")) {
      return {
        rawContent: JSON.stringify({
          status: "answered",
          reports: [{
            claimId,
            value: { kind: "categorical", probabilities },
          }],
        }),
        usage,
      };
    }
    if (request.userPrompt.includes("matched process-control request")) {
      return { rawContent: JSON.stringify({ acknowledgment: "acknowledged" }), usage };
    }
    if (request.systemPrompt === "You are an independent verifier.") {
      return {
        rawContent: JSON.stringify({ publicContent: "The public argument should be checked cautiously." }),
        usage,
      };
    }
    if (request.userPrompt.includes("plain text only")) {
      return { rawContent: `${request.requestId} public discussion`, usage };
    }
    return {
      rawContent: JSON.stringify({
        message: "public categorical report",
        belief: { kind: "categorical", probabilities },
        evidence: [],
      }),
      usage,
    };
  });
  return { invoker: { invoke } as SingleAttemptTextInvoker, invoke };
}

function containsForbiddenKey(value: unknown, forbidden: ReadonlySet<string>): boolean {
  if (Array.isArray(value)) return value.some(entry => containsForbiddenKey(entry, forbidden));
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>)
    .some(([key, child]) => forbidden.has(key.toLowerCase()) || containsForbiddenKey(child, forbidden));
}

describe("HiddenBench categorical engineering smoke", () => {
  it("builds task 1 with pinned K/roster authority and an engineering-only bank", () => {
    const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: 1 });
    expect(fixture.task.claim.resolutionPolicy.kind).toBe("categorical");
    expect(fixture.task.claim.options).toHaveLength(3);
    expect(fixture.task.agents).toHaveLength(4);
    expect(fixture.stratum).toEqual({
      taskFamily: "hiddenbench-categorical",
      taskId: "task:hiddenbench:1",
      claimOptionCount: 3,
      agentCount: 4,
    });
    expect((fixture.rule.config as unknown as { beliefDomain: unknown }).beliefDomain).toEqual({
      beliefKind: "categorical",
      claimOptionCount: 3,
    });
    expect(fixture.taskBankAdmission.requiredSplit).toBe("engineering_canary");
    expect(fixture.taskBankAdmission.bank.purpose).toBe("engineering_only");
    expect(Date.parse(fixture.clockStartAt)).toBeGreaterThan(Date.parse(fixture.task.claim.createdAt));
  });

  it("derives provider-call bounds from roster size without changing protocol count", () => {
    const fourAgents = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: 1 });
    const fourPlan = planV6SmokeRuns(fourAgents, "run:test:hb1");
    expect(fourPlan.map(run => run.plannedProviderCalls)).toEqual([12, 12, 13]);
    const threeAgents = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: 4 });
    const threePlan = planV6SmokeRuns(threeAgents, "run:test:hb4");
    expect(threeAgents.task.claim.options).toHaveLength(4);
    expect(threeAgents.task.agents).toHaveLength(3);
    expect(threePlan.map(run => run.plannedProviderCalls)).toEqual([9, 9, 10]);
  });

  it("versions the expanded JSON profile without changing legacy fixture identity", () => {
    const legacy = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: 4 });
    const expanded = createV6HiddenBenchSmokeFixtureV1({
      sourceTaskId: 4,
      profile: "expanded-json-v2",
    });
    expect(legacy.discussionContract.agentBindings
      .every(binding => binding.invocationConfig.maxTokens === 256)).toBe(true);
    expect(expanded.discussionContract.agentBindings
      .every(binding => binding.invocationConfig.maxTokens === 768)).toBe(true);
    expect(expanded.finalContract.agentBindings
      .every(binding => binding.invocationConfig.maxTokens === 256)).toBe(true);
    expect(expanded.study.id).not.toBe(legacy.study.id);
    expect(expanded.design.id).not.toBe(legacy.design.id);
    expect(expanded.registry.contentHash).not.toBe(legacy.registry.contentHash);
  });

  it("isolates the 0.7 mechanism check from detector-validity identities", () => {
    const expanded = createV6HiddenBenchSmokeFixtureV1({
      sourceTaskId: 9,
      profile: "expanded-json-v2",
    });
    const mechanism = createV6HiddenBenchSmokeFixtureV1({
      sourceTaskId: 9,
      profile: "mechanism-check-07-v1",
    });
    const threshold = (mechanism.rule.config as unknown as {
      certaintyThresholdPolicy: { bounds: { lower: number } };
    }).certaintyThresholdPolicy;
    expect(threshold.bounds.lower).toBe(0.7);
    expect(mechanism.study.id).toContain("mechanism-check-07-v1");
    expect(mechanism.study.id).not.toBe(expanded.study.id);
    expect(mechanism.policy.id).not.toBe(expanded.policy.id);
    expect(mechanism.discussionContract.agentBindings
      .every(binding => binding.invocationConfig.maxTokens === 768)).toBe(true);
  });

  it("requires an explicit HiddenBench task ID and rejects cross-family ID use", () => {
    expect(() => parseSmokeArgs(["--task-family", "hiddenbench-categorical"]))
      .toThrow(/requires --hiddenbench-task-id/);
    expect(() => parseSmokeArgs(["--hiddenbench-task-id", "1"]))
      .toThrow(/valid only/);
    expect(() => parseSmokeArgs([
      "--task-family", "hiddenbench-categorical", "--hiddenbench-task-id", "0",
    ])).toThrow(/1 to 65/);
    const parsed = parseSmokeArgs([
      "--task-family", "hiddenbench-categorical", "--hiddenbench-task-id", "4",
    ]);
    expect(parsed.hiddenBenchTaskId).toBe(4);
  });

  it("runs a zero-artifact HiddenBench dry-run with a roster-derived default cap", async () => {
    const outputDir = tmpDir();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await main([
      "--dry-run",
      "--task-family", "hiddenbench-categorical",
      "--hiddenbench-task-id", "1",
      "--output-dir", outputDir,
    ]);
    expect(code).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(fs.readdirSync(outputDir)).toHaveLength(0);
  });

  it("blocks categorical calibration without semantic splits before any execution", async () => {
    const outputDir = tmpDir();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await main([
      "--dry-run", "--calibration",
      "--task-family", "hiddenbench-categorical",
      "--hiddenbench-task-id", "1",
      "--output-dir", outputDir,
    ]);
    expect(code).toBe(5);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("scientific_task_bank_not_admitted");
    expect(fs.readdirSync(outputDir)).toHaveLength(0);
  });

  it("admits only engineering HiddenBench execution and still requires a credential", async () => {
    const outputDir = tmpDir();
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await main([
      "--execute",
      "--task-family", "hiddenbench-categorical",
      "--hiddenbench-task-id", "1",
      "--output-dir", outputDir,
    ]);
    const errors = errorSpy.mock.calls.flat().join(" ");
    expect(code).toBe(3);
    expect(errors).toContain("deepseek_api_key_unavailable");
    expect(fs.readdirSync(outputDir)).toHaveLength(0);
  });

  it("fails task-bank split drift before invoking a mock provider", async () => {
    const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: 1 });
    const drifted = {
      ...fixture,
      taskBankAdmission: {
        ...fixture.taskBankAdmission,
        requiredSplit: "threshold_calibration" as const,
      },
    };
    const mock = categoricalInvoker(fixture.task.claim.id, fixture.task.claim.options);
    await expect(runV6SmokeExecute({
      outputDir: tmpDir(),
      fixture: drifted,
      invoker: mock.invoker,
      plannedRuns: planV6SmokeRuns(drifted, "run:test:drift").slice(0, 1),
      maxProviderCalls: 20,
      maxTotalTokens: 100_000,
    })).rejects.toThrow(/required split|not admitted/);
    expect(mock.invoke).not.toHaveBeenCalled();
  });

  it("records a sanitized provider failure class without storing its message", async () => {
    const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: 1 });
    const valid = categoricalInvoker(fixture.task.claim.id, fixture.task.claim.options);
    const invoke = vi.fn(async (request: SingleAttemptTextInvokeRequest, signal: AbortSignal) => {
      if (request.requestId.startsWith("discussion:")) {
        throw new V6ProviderInvocationError("provider_rate_limit");
      }
      return valid.invoker.invoke(request, signal);
    });
    const outputDir = tmpDir();
    const run = planV6SmokeRuns(fixture, "run:test:provider-diagnostic")[0];
    const result = await runV6SmokeExecute({
      outputDir,
      fixture,
      invoker: { invoke },
      plannedRuns: [run],
      maxProviderCalls: 20,
      maxTotalTokens: 100_000,
    });
    const artifact = JSON.parse(fs.readFileSync(result.results[0].absolutePath, "utf8")) as {
      v6InteractionTrace: { discussionCalls: Array<{
        status: string;
        diagnosticCode: string;
      }> };
    };
    const calls = artifact.v6InteractionTrace.discussionCalls;
    expect(calls.every(call => call.status === "unavailable"
      && call.diagnosticCode === "provider_rate_limit")).toBe(true);
    expect(JSON.stringify(artifact)).not.toContain("DeepSeek API");
  });

  it("records bounded invalid-response diagnostics and usage without raw content", async () => {
    const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: 1 });
    const valid = categoricalInvoker(fixture.task.claim.id, fixture.task.claim.options);
    const invalidRaw = "{not-json-and-must-not-be-persisted";
    const usage = { promptTokens: 10, completionTokens: 256, totalTokens: 266, latencyMs: 5 };
    const invoke = vi.fn(async (request: SingleAttemptTextInvokeRequest, signal: AbortSignal) => {
      if (request.requestId.startsWith("discussion:")) return { rawContent: invalidRaw, usage };
      return valid.invoker.invoke(request, signal);
    });
    const outputDir = tmpDir();
    const run = planV6SmokeRuns(fixture, "run:test:invalid-diagnostic")
      .find(item => item.protocol === "explicit_belief_v1")!;
    const result = await runV6SmokeExecute({
      outputDir,
      fixture,
      invoker: { invoke },
      plannedRuns: [run],
      maxProviderCalls: 20,
      maxTotalTokens: 100_000,
    });
    const artifact = JSON.parse(fs.readFileSync(result.results[0].absolutePath, "utf8")) as {
      v6InteractionTrace: { discussionCalls: Array<{
        status: string;
        diagnosticCode: string;
        usage?: { totalTokens?: number };
        responseDiagnostics?: {
          parseFailureCode: string;
          rawCharacterCount: number;
          reachedMaxTokens: boolean | null;
        };
      }> };
    };
    const calls = artifact.v6InteractionTrace.discussionCalls;
    expect(calls.every(call => call.status === "invalid"
      && call.diagnosticCode === "invalid_response"
      && call.usage?.totalTokens === 266
      && call.responseDiagnostics?.parseFailureCode === "malformed_json"
      && call.responseDiagnostics?.rawCharacterCount === invalidRaw.length
      && call.responseDiagnostics?.reachedMaxTokens === true)).toBe(true);
    expect(JSON.stringify(artifact)).not.toContain(invalidRaw);
  });

  it("executes mock T/B/G runs through one categorical vertical slice and replays each clean", async () => {
    const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: 1 });
    const plannedRuns = planV6SmokeRuns(fixture, "run:test:hb-tbg");
    const outputDir = tmpDir();
    const mock = categoricalInvoker(fixture.task.claim.id, fixture.task.claim.options);
    const result = await runV6SmokeExecute({
      outputDir,
      fixture,
      invoker: mock.invoker,
      plannedRuns,
      maxProviderCalls: 40,
      maxTotalTokens: 100_000,
    });
    expect(result.results).toHaveLength(3);
    expect(new Set(plannedRuns.map(run => run.protocol))).toEqual(new Set([
      "text_communication_v1",
      "explicit_belief_v1",
      "epistemic_governance_v1",
    ]));
    expect(mock.invoke).toHaveBeenCalledTimes(37);
    for (const run of plannedRuns) {
      const artifact = JSON.parse(fs.readFileSync(
        resolveV6AuditableRawRunPath(outputDir, run.runId),
        "utf8",
      )) as Record<string, unknown>;
      const replay = verifyRawRunData(`(hiddenbench/mock-${run.protocol})`, artifact, {
        governanceRules: [fixture.rule],
      });
      expect(replay.governanceAuditStatus).toBe("sealed_decision_replay_verified");
      expect(replay.runIssues).toEqual([]);
    }
    const forbidden = new Set(["groundtruth", "correctanswer", "correct_answer", "resolveroutcome"]);
    for (const call of mock.invoke.mock.calls) {
      expect(containsForbiddenKey(call[0], forbidden)).toBe(false);
    }
  });
});
