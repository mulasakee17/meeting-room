/**
 * v6 smoke CLI tests. Everything here uses a mock invoker; no real or paid LLM
 * call, no network, no credentials.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveOperationalAnalysisUnitV1Path } from "../src/lib/experimentation/operationalAnalysisUnitStore";
import { resolveV6AuditableRawRunPath } from "../experiments/campaign/v6/productionVerticalSlice";
import type { SingleAttemptTextInvokeRequest, SingleAttemptTextInvoker } from "../experiments/campaign/v6/providerAdapters";
import {
  V6ProviderCallBudget,
  main,
  parseSmokeArgs,
  preflightIncompleteRuns,
  runV6SmokeExecute,
} from "../experiments/campaign/v6/run_v6_smoke";
import {
  createV6BinarySmokeFixture,
  planV6SmokeRuns,
} from "../experiments/campaign/v6/v6BinarySmokeFixture";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const fixture = createV6BinarySmokeFixture();

function defaultInvoker(): { invoker: SingleAttemptTextInvoker; invoke: ReturnType<typeof vi.fn> } {
  const invoke = vi.fn(async (request: SingleAttemptTextInvokeRequest) => {
    if (request.requestId.startsWith("final:")) {
      return {
        rawContent: JSON.stringify({
          status: "answered",
          reports: [{
            claimId: fixture.task.claim.id,
            value: { kind: "binary", probability: 0.2 },
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
        belief: { kind: "binary", probability: isAgentARound1 ? 0.95 : 0.6 },
        evidence: [{ content: "evidence", relation: "supports" }],
      }),
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
    };
  });
  return { invoker: { invoke } as SingleAttemptTextInvoker, invoke };
}

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v6-smoke-"));
  tempDirs.push(dir);
  return dir;
}

describe("v6 smoke CLI", () => {
  it("defaults to an engineering dry-run with no artifacts created", async () => {
    const outputDir = tmpDir();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await main(["--dry-run", "--output-dir", outputDir]);
    expect(code).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(fs.readdirSync(outputDir)).toHaveLength(0);
    expect(parseSmokeArgs([]).execute).toBe(false);
    expect(fixture.study.inferenceIntent).toBe("engineering");
  });

  it("plans one deterministic T/B/G assignment each", () => {
    const runs = planV6SmokeRuns(fixture);
    expect(runs.map(run => run.protocol)).toEqual([
      "text_communication_v1",
      "explicit_belief_v1",
      "epistemic_governance_v1",
    ]);
    expect(new Set(runs.map(run => run.runId)).size).toBe(3);
    // Deterministic: repeated planning yields identical seeds.
    expect(runs.map(run => run.primaryMasterSeed)).toEqual(
      planV6SmokeRuns(fixture).map(run => run.primaryMasterSeed),
    );
    // Every planned run carries a positive provider-call budget.
    expect(runs.every(run => run.plannedProviderCalls >= 6)).toBe(true);
  });

  it("fails closed on --execute without a DeepSeek credential", async () => {
    const outputDir = tmpDir();
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await main(["--execute", "--output-dir", outputDir]);
    expect(code).toBe(3);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("deepseek_api_key_unavailable");
  });

  it("never imports the retrying callLLM or constructs fetch in CLI/adapters", () => {
    for (const file of ["run_v6_smoke.ts", "providerAdapters.ts"]) {
      const src = fs.readFileSync(path.join(process.cwd(), "experiments/campaign/v6", file), "utf8");
      expect(src).not.toMatch(/import\s*[^;]*callLLM/);
      expect(src).not.toMatch(/fetch\s*\(/);
    }
    const bridge = fs.readFileSync(
      path.join(process.cwd(), "experiments/campaign/v6/deepseekSingleAttemptInvoker.ts"),
      "utf8",
    );
    expect(bridge).toContain("callDeepSeekOnce");
    expect(bridge).not.toMatch(/\bcallLLM\b/);
    expect(bridge).not.toMatch(/fetch\s*\(/);
  });

  it("enforces the provider-call budget before starting a run that cannot fit", async () => {
    const outputDir = tmpDir();
    const m = defaultInvoker();
    await expect(runV6SmokeExecute({
      outputDir,
      fixture,
      invoker: m.invoker,
      maxProviderCalls: 6,
      maxTotalTokens: 100_000,
    })).rejects.toThrow("provider_call_budget_exceeded");
    // T (6 planned calls) runs; the B run must not start.
    expect(m.invoke).toHaveBeenCalledTimes(6);
  });

  it("stops after the first single attempt whose reported usage exceeds the token cap", async () => {
    const outputDir = tmpDir();
    const invoke = vi.fn(async () => ({
      rawContent: "A sufficiently long public response.",
      usage: { promptTokens: 150, completionTokens: 150, totalTokens: 300 },
    }));
    await expect(runV6SmokeExecute({
      outputDir,
      fixture,
      invoker: { invoke },
      maxProviderCalls: 20,
      maxTotalTokens: 282,
    })).rejects.toThrow("token_budget_exceeded");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(resolveV6AuditableRawRunPath(
      outputDir,
      "run:v6-smoke:text_communication_v1",
    ))).toBe(false);
  });

  it("requires provider-reported token usage for budget enforcement", () => {
    const budget = new V6ProviderCallBudget(20, 10);
    expect(() => budget.assertCanStartRun(1, 20)).toThrow("token_budget_exceeded");
    const second = new V6ProviderCallBudget(20, 100);
    second.beforeProviderCall();
    second.recordProviderUsage({ promptTokens: 40, completionTokens: 50, totalTokens: 90 });
    expect(second.callCount).toBe(1);
    expect(second.tokenCount).toBe(90);
    expect(() => second.recordProviderUsage({})).toThrow("provider_usage_required_for_budget");
  });

  it("rejects a dry-run plan that exceeds explicit caps", async () => {
    const outputDir = tmpDir();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await main(["--dry-run", "--output-dir", outputDir, "--max-provider-calls", "1"]))
      .toBe(2);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("smoke_plan_budget_exceeded");
    expect(fs.readdirSync(outputDir)).toHaveLength(0);
  });

  it("rejects an incomplete run before any provider call", async () => {
    const outputDir = tmpDir();
    const runId = "run:v6-smoke:text_communication_v1";
    const unitPath = resolveOperationalAnalysisUnitV1Path(outputDir, runId);
    fs.writeFileSync(unitPath, "{}", "utf8");

    expect(preflightIncompleteRuns(outputDir, planV6SmokeRuns(fixture)))
      .toContain(`incomplete_v6_run_requires_fresh_run_id: ${runId}`);

    const m = defaultInvoker();
    await expect(runV6SmokeExecute({
      outputDir,
      fixture,
      invoker: m.invoker,
      maxProviderCalls: 20,
      maxTotalTokens: 100_000,
    })).rejects.toThrow("incomplete_v6_run_requires_fresh_run_id");
    expect(m.invoke).not.toHaveBeenCalled();
  });

  it("reuses completed runs on an exact retry with zero new provider calls", async () => {
    const outputDir = tmpDir();
    const m = defaultInvoker();
    const first = await runV6SmokeExecute({
      outputDir,
      fixture,
      invoker: m.invoker,
      maxProviderCalls: 20,
      maxTotalTokens: 100_000,
    });
    expect(first.results).toHaveLength(3);
    expect(first.results.every(result => result.reused === false)).toBe(true);
    expect(first.budget.callCount).toBe(18);
    expect(first.budget.tokenCount).toBe(180);
    const textArtifact = JSON.parse(fs.readFileSync(first.results[0].absolutePath, "utf8")) as {
      tokenUsage: { totalTokens: number };
      finalElicitationCollection: { records: Array<{ usage?: { totalTokens?: number } }> };
    };
    expect(textArtifact.tokenUsage.totalTokens).toBe(60);
    expect(textArtifact.finalElicitationCollection.records.map(record => record.usage?.totalTokens))
      .toEqual([10, 10]);
    const governanceArtifact = JSON.parse(fs.readFileSync(first.results[2].absolutePath, "utf8")) as {
      v6InteractionTrace: {
        monitoringSelection: { candidateReportIds: string[]; selectedReportId: string | null };
      };
      governanceAuditTrail: {
        eventAssignments: Array<{ assignedArm: string }>;
        actionTransitions: Array<{ to: string; observation?: { complied?: boolean } }>;
      };
    };
    expect(governanceArtifact.v6InteractionTrace.monitoringSelection.candidateReportIds).toHaveLength(2);
    expect(governanceArtifact.v6InteractionTrace.monitoringSelection.candidateReportIds)
      .toContain(governanceArtifact.v6InteractionTrace.monitoringSelection.selectedReportId);
    expect(governanceArtifact.governanceAuditTrail.eventAssignments.length).toBeLessThanOrEqual(1);
    const compliance = governanceArtifact.governanceAuditTrail.actionTransitions
      .find(item => item.to === "compliance_observed");
    if (compliance) expect(compliance.observation).toEqual({ complied: true });
    const callsAfterFirst = m.invoke.mock.calls.length;

    const m2 = defaultInvoker();
    const retry = await runV6SmokeExecute({
      outputDir,
      fixture,
      invoker: m2.invoker,
      maxProviderCalls: 20,
      maxTotalTokens: 100_000,
    });
    expect(retry.results.every(result => result.reused === true)).toBe(true);
    expect(m2.invoke).toHaveBeenCalledTimes(0);
    expect(callsAfterFirst).toBeGreaterThan(0);
  });

  it("never writes an artifact outside the output directory", async () => {
    const outputDir = tmpDir();
    const m = defaultInvoker();
    const { results } = await runV6SmokeExecute({
      outputDir,
      fixture,
      invoker: m.invoker,
      maxProviderCalls: 20,
      maxTotalTokens: 100_000,
    });
    const root = path.resolve(outputDir);
    for (const result of results) {
      expect(result.absolutePath.startsWith(root + path.sep)).toBe(true);
    }
    // A hostile run id cannot escape the output dir.
    expect(path.dirname(resolveV6AuditableRawRunPath(outputDir, "../../etc/passwd"))).toBe(root);
  });
});
