/**
 * Gate D4: the v6 kernel executes TWO binary distributed-information task
 * families through ONE runner via the V6TaskAdapterV1 boundary. The kernel
 * (production vertical slice) never imports a concrete task module. Everything
 * here uses a mock invoker; no real or paid LLM call, no network, no credentials.
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
  planV6SmokeRuns,
  type V6SmokeFixtureV1,
} from "../experiments/campaign/v6/v6BinarySmokeFixture";
import { createV6TaskAdapter } from "../experiments/campaign/v6/taskAdapters";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const smokeFixture = createV6BinarySmokeFixture();
const netFixture = createV6BinarySmokeFixture({ taskFamily: "network-fault" });

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v6-task-"));
  tempDirs.push(dir);
  return dir;
}

/** Mock invoker that reports the correct claim id in final elicitation. */
function defaultInvoker(claimId: string): { invoker: SingleAttemptTextInvoker; invoke: ReturnType<typeof vi.fn> } {
  const invoke = vi.fn(async (request: SingleAttemptTextInvokeRequest) => {
    if (request.requestId.startsWith("final:")) {
      return {
        rawContent: JSON.stringify({
          status: "answered",
          reports: [{ claimId, value: { kind: "binary", probability: 0.4 } }],
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
    return {
      rawContent: JSON.stringify({
        message: "public message",
        belief: { kind: "binary", probability: 0.6 },
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

describe("v6 task adapters", () => {
  it("wraps the frozen v1 distributed-binary task byte-for-byte", () => {
    const adapter = createV6TaskAdapter("distributed-binary");
    expect(adapter.taskFamilyRef).toEqual({ id: "swarmalpha.task.distributed-binary", version: "1.0.0" });
    expect(adapter.task).toEqual(smokeFixture.task);
    expect(smokeFixture.task.id).toBe("task:v6-smoke-route");
    expect(smokeFixture.study.id).toBe("swarmalpha.study.v6-smoke");
    expect(smokeFixture.stratum).toEqual({ taskFamily: "distributed-binary" });
  });

  it("exposes a distinct, deep-frozen network-fault family/task", () => {
    const adapter = createV6TaskAdapter("network-fault");
    expect(adapter.taskFamilyRef).toEqual({ id: "swarmalpha.task.network-fault", version: "1.0.0" });
    expect(adapter.task.id).toBe("task:v6-network-fault");
    expect(adapter.task.claim.resolutionPolicy.kind).toBe("binary");
    expect(adapter.task.claim.resolutionPolicy.resolverId).toBe("resolver:v6-network-fault");
    expect(adapter.task.agents).toHaveLength(2);
    expect(typeof adapter.task.outcome).toBe("boolean");
    expect(Object.isFrozen(adapter.task)).toBe(true);
    expect(Object.isFrozen(adapter.task.claim)).toBe(true);
    expect(Object.isFrozen(adapter.task.agents)).toBe(true);
    expect(netFixture.study.id).toBe("swarmalpha.study.v6-network-fault");
    expect(netFixture.study.taskFamilyRef).toEqual(adapter.taskFamilyRef);
    expect(netFixture.stratum).toEqual({ taskFamily: "network-fault" });
  });

  it("runs BOTH families through the same runner and replays clean", async () => {
    for (const family of ["distributed-binary", "network-fault"] as const) {
      const fixture = family === "distributed-binary" ? smokeFixture : netFixture;
      const prefix = family === "distributed-binary" ? "run:v6-smoke" : "run:v6-network-fault";
      const outputDir = tmpDir();
      const m = defaultInvoker(fixture.task.claim.id);
      const { results } = await runV6SmokeExecute({
        outputDir,
        fixture,
        invoker: m.invoker,
        maxProviderCalls: 20,
        maxTotalTokens: 100_000,
        plannedRuns: planV6SmokeRuns(fixture, prefix),
      });
      expect(results).toHaveLength(3);
      expect(results.map(r => r.run.runId).every(id => id.startsWith(`${prefix}:`))).toBe(true);
      for (const protocol of ["text_communication_v1", "explicit_belief_v1", "epistemic_governance_v1"]) {
        const artifact = loadRawRun(outputDir, `${prefix}:${protocol}`);
        const replay = verifyRawRunData(`(${family}/${protocol})`, artifact, { governanceRules: [fixture.rule] });
        expect(replay.governanceAuditStatus).toBe("sealed_decision_replay_verified");
        expect(replay.runIssues).toEqual([]);
      }
    }
  });

  it("leaks no truth and no other-agent private view into network-fault requests", async () => {
    const outputDir = tmpDir();
    const m = defaultInvoker(netFixture.task.claim.id);
    await runV6SmokeExecute({
      outputDir,
      fixture: netFixture,
      invoker: m.invoker,
      maxProviderCalls: 20,
      maxTotalTokens: 100_000,
      plannedRuns: planV6SmokeRuns(netFixture, "run:v6-network-fault"),
    });
    const privateA = netFixture.task.agents[0].privateInformation;
    const privateB = netFixture.task.agents[1].privateInformation;
    const aRequests: SingleAttemptTextInvokeRequest[] = [];
    for (const call of m.invoke.mock.calls) {
      const request = call[0] as SingleAttemptTextInvokeRequest;
      const serialized = JSON.stringify(request);
      for (const forbidden of ["groundTruth", "correctAnswer", "correct_answer", "resolution", "scoringKey", "scoring_key"]) {
        expect(serialized).not.toContain(forbidden);
      }
      // Classify by own-private-view content (the request type carries no agentId).
      if (serialized.includes(privateA)) {
        aRequests.push(request);
        expect(serialized).not.toContain(privateB);
      }
      if (serialized.includes(privateB)) {
        expect(serialized).not.toContain(privateA);
      }
    }
    // Sanity: agent a still sees its own private view in discussion.
    expect(aRequests.some(request => request.userPrompt.includes(privateA))).toBe(true);
  });

  it("rejects claim drift on a completed run with zero new provider calls", async () => {
    const outputDir = tmpDir();
    const m = defaultInvoker(smokeFixture.task.claim.id);
    await runV6SmokeExecute({
      outputDir,
      fixture: smokeFixture,
      invoker: m.invoker,
      maxProviderCalls: 20,
      maxTotalTokens: 100_000,
    });
    const callsAfterFirst = m.invoke.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const mutated: V6SmokeFixtureV1 = {
      ...smokeFixture,
      task: {
        ...smokeFixture.task,
        claim: { ...smokeFixture.task.claim, proposition: "The emergency route is definitely not viable." },
      },
    };
    await expect(runV6SmokeExecute({
      outputDir,
      fixture: mutated,
      invoker: m.invoker,
      maxProviderCalls: 20,
      maxTotalTokens: 100_000,
    })).rejects.toThrow(/task manifest does not match|conflicts/);
    expect(m.invoke.mock.calls.length).toBe(callsAfterFirst);
  });

  it("keeps replay family-isolated: a network-fault artifact fails under the smoke rule", async () => {
    const outputDir = tmpDir();
    const m = defaultInvoker(netFixture.task.claim.id);
    await runV6SmokeExecute({
      outputDir,
      fixture: netFixture,
      invoker: m.invoker,
      maxProviderCalls: 20,
      maxTotalTokens: 100_000,
      plannedRuns: planV6SmokeRuns(netFixture, "run:v6-network-fault"),
    });
    const artifact = loadRawRun(outputDir, "run:v6-network-fault:text_communication_v1");
    const own = verifyRawRunData("(net-own)", artifact, { governanceRules: [netFixture.rule] });
    expect(own.governanceAuditStatus).toBe("sealed_decision_replay_verified");
    expect(own.runIssues).toEqual([]);
    const cross = verifyRawRunData("(net-cross)", artifact, { governanceRules: [smokeFixture.rule] });
    expect(cross.runIssues.length).toBeGreaterThan(0);
  });

  it("plans a network-fault dry-run via the CLI with no artifacts", async () => {
    const outputDir = tmpDir();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await main(["--dry-run", "--task-family", "network-fault", "--output-dir", outputDir]);
    expect(code).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(fs.readdirSync(outputDir)).toHaveLength(0);
    await expect(main(["--dry-run", "--task-family", "bogus", "--output-dir", tmpDir()]))
      .rejects.toThrow(/one of distributed-binary, network-fault/);
  });

  it("retains network-fault v1 for audit but refuses real CLI execution before credential use", async () => {
    const outputDir = tmpDir();
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await main(["--execute", "--task-family", "network-fault", "--output-dir", outputDir]);
    expect(code).toBe(4);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("task_family_not_admitted_for_execution");
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("deepseek_api_key_unavailable");
    expect(fs.readdirSync(outputDir)).toHaveLength(0);
  });
});
