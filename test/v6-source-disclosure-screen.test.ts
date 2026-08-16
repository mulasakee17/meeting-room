/**
 * V6 Source-Disclosure mechanism screen — deterministic tests.
 *
 * Covers the Phase 1 handoff invariants (§6): 40-run/10-task/8-group/20-pair
 * structure; H/D per-block source identity binding; deterministic
 * arm/order/run/seed; no truth/outcome/private plaintext in the plan; H keeps
 * base publicContext and D only adds the disclosure block; both arms share
 * model/config/protocol/round/call ceiling; always-ineligible yields zero
 * action/verification through the real slice; --plan/--replay/--execute are
 * zero-provider and fail-closed; partial state rejects before provider;
 * non-escaping paths and plan no-replace; analyzer completeness fail-closed;
 * hand-checked paired arithmetic and leakage-group bootstrap; single-group
 * robustness; deterministic status gate; no network/sleep/flaky provider.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ALWAYS_INELIGIBLE_DISCLOSURE_RULE_REF,
  SOURCE_DISCLOSURE_SCREEN_MAX_PROVIDER_CALLS,
  SOURCE_DISCLOSURE_SCREEN_MAX_TOTAL_TOKENS,
  SOURCE_DISCLOSURE_SCREEN_OUTPUT_DIR,
  SOURCE_DISCLOSURE_SCREEN_PLAN_PATH,
  SOURCE_DISCLOSURE_SCREEN_TASK_ORDER,
  buildSourceDisclosureFixtureV1,
  buildSourceDisclosureScreenPlanV1,
  assertFrozenSourceDisclosureScreenPlanV1,
  createAlwaysIneligibleDisclosureRuleV1,
  disclosureScreenAllRuns,
  runExecuteCli,
  runPlan,
  runReplayCli,
  runSourceDisclosureScreenExecute,
  runSourceDisclosureScreenReplayV1,
  sourceDisclosureExecuteGateV1,
  sourceDisclosureKeyPresenceV1,
  type SourceDisclosureRunPlanV1,
} from "../experiments/campaign/v6/run_v6_source_disclosure_screen";
import {
  assertDisclosureArtifactCompletenessV1,
  computePairedDifferencesV1,
  decideDisclosureScreenStatusV1,
  leakageGroupClusterBootstrapV1,
  type DisclosureArtifactV1,
} from "../experiments/campaign/v6/analyze_v6_source_disclosure_screen";
import { createHiddenBenchTaskProjectionV1 } from "../experiments/campaign/v6/hiddenBenchTaskAdapter";
import { createSourceDisclosureTaskVariantV1 } from "../experiments/campaign/v6/sourceDisclosureInterventionV1";
import { resolveV6AuditableRawRunPath } from "../experiments/campaign/v6/productionVerticalSlice";
import { preflightIncompleteRuns, V6ProviderCallBudget } from "../experiments/campaign/v6/run_v6_smoke";
import { ProviderExecutionHaltError } from "../src/lib/experimentation";
import { resolveV6TaskManifestV1Path } from "../experiments/campaign/v6/v6TaskManifest";
import type { SingleAttemptTextInvoker, SingleAttemptTextInvokeRequest } from "../experiments/campaign/v6/providerAdapters";

function sha256Text(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "v6-disclosure-"));
}

const plan = buildSourceDisclosureScreenPlanV1();
const runs = disclosureScreenAllRuns(plan);

describe("frozen plan structure (invariant 1, 2, 3, 10)", () => {
  it("is exactly 40 runs, 10 tasks, 8 leakage groups, 20 H/D pairs", () => {
    expect(plan.totalRuns).toBe(40);
    expect(plan.taskIds).toEqual([13, 18, 28, 33, 38, 39, 45, 47, 50, 55]);
    expect(SOURCE_DISCLOSURE_SCREEN_TASK_ORDER).toEqual([13, 18, 28, 33, 38, 39, 45, 47, 50, 55]);
    expect(plan.leakageGroups).toHaveLength(8);
    const blocks = plan.tasks.flatMap(task => task.blocks);
    expect(blocks).toHaveLength(20);
    expect(new Set(runs.map(run => run.runId)).size).toBe(40);
    for (const block of blocks) {
      expect(block.runs).toHaveLength(2);
      expect(block.runs[0].arm).toBe("holdout");
      expect(block.runs[1].arm).toBe("forced_source_disclosure");
    }
  });

  it("binds the same source identity/hash/key across H and D of each block", () => {
    for (const task of plan.tasks) {
      for (const block of task.blocks) {
        const [h, d] = block.runs;
        expect(h.sourceSelectionSeed).toBe(d.sourceSelectionSeed);
        expect(h.sourceSelectionKeyHash).toBe(d.sourceSelectionKeyHash);
        expect(h.sourceAgentId).toBe(d.sourceAgentId);
        expect(h.sourcePrivateInformationHash).toBe(d.sourcePrivateInformationHash);
        expect(block.sourceSelectionKeyHash).toBe(h.sourceSelectionKeyHash);
        expect(block.sourceAgentId).toBe(h.sourceAgentId);
      }
    }
  });

  it("is deterministic with a distinct execution order and per-arm identical call ceiling", () => {
    const second = buildSourceDisclosureScreenPlanV1();
    expect(second).toEqual(plan);
    expect(plan.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(new Set(runs.map(run => run.order)).size).toBe(40);
    for (const task of plan.tasks) {
      for (const block of task.blocks) {
        const [h, d] = block.runs;
        expect(h.plannedProviderCalls).toBe(d.plannedProviderCalls);
        expect(h.estimatedTokens).toBe(d.estimatedTokens);
        expect(h.leakageGroup).toBe(d.leakageGroup);
        expect(h.blockId).toBe(d.blockId);
        expect(h.protocol).toBe("epistemic_governance_v1");
        expect(d.protocol).toBe("epistemic_governance_v1");
      }
    }
    expect(plan.protocol).toBe("epistemic_governance_v1");
    expect(plan.providerModelRef.id).toBe("deepseek:deepseek-chat");
    expect(plan.maxProviderCalls).toBe(SOURCE_DISCLOSURE_SCREEN_MAX_PROVIDER_CALLS);
    expect(plan.maxTotalTokens).toBe(SOURCE_DISCLOSURE_SCREEN_MAX_TOTAL_TOKENS);
  });

  it("keeps plan and output paths inside the repository", () => {
    const repo = path.resolve(process.cwd());
    expect(SOURCE_DISCLOSURE_SCREEN_PLAN_PATH.startsWith(repo)).toBe(true);
    expect(SOURCE_DISCLOSURE_SCREEN_OUTPUT_DIR.startsWith(repo)).toBe(true);
    expect(SOURCE_DISCLOSURE_SCREEN_PLAN_PATH).not.toContain("..");
    expect(SOURCE_DISCLOSURE_SCREEN_OUTPUT_DIR).not.toContain("..");
  });

  it("plan is no-replace and never drifts from disk", () => {
    expect(fs.existsSync(SOURCE_DISCLOSURE_SCREEN_PLAN_PATH)).toBe(true);
    const existing = JSON.parse(fs.readFileSync(SOURCE_DISCLOSURE_SCREEN_PLAN_PATH, "utf8"));
    expect(existing).toEqual(plan);
  });
});

describe("plan truth/privacy firewall (invariant 4, 5, 6)", () => {
  it("contains no truth, outcome, resolution, final loss, or private plaintext", () => {
    const raw = JSON.stringify(plan);
    for (const keyword of ["correct_answer", "outcome", "resolution", "finalLoss", "groundTruth", "privateInformation"]) {
      expect(raw).not.toContain(keyword);
    }
  });

  it("H commits the base publicContext and D commits the disclosure-augmented context", () => {
    for (const taskPlan of plan.tasks) {
      const fixture = buildSourceDisclosureFixtureV1(taskPlan.taskId);
      const baseTask = fixture.projection.adapter.task;
      for (const block of taskPlan.blocks) {
        expect(block.runs[0].publicContextHash).toBe(sha256Text(baseTask.publicContext));
        const disclosure = createSourceDisclosureTaskVariantV1({
          runId: `probe:test:${taskPlan.taskId}:${block.blockId}`,
          blockId: block.blockId,
          task: baseTask,
          arm: "forced_source_disclosure",
          sourceSelectionSeed: block.sourceSelectionSeed,
        });
        expect(block.runs[1].publicContextHash).toBe(sha256Text(disclosure.task.publicContext));
        // Only publicContext may differ between the arms.
        const variantWithoutContext = { ...disclosure.task, publicContext: baseTask.publicContext };
        expect(variantWithoutContext).toEqual(baseTask);
      }
    }
  });

  it("planned provider calls are exactly agentCount*3 with no verification call", () => {
    for (const taskId of plan.taskIds) {
      const agentCount = buildSourceDisclosureFixtureV1(taskId).projection.adapter.task.agents.length;
      const taskPlan = plan.tasks.find(task => task.taskId === taskId)!;
      for (const block of taskPlan.blocks) {
        expect(block.runs[0].plannedProviderCalls).toBe(agentCount * 3);
        expect(block.runs[1].plannedProviderCalls).toBe(agentCount * 3);
      }
    }
    expect(plan.totalPlannedProviderCalls).toBeLessThanOrEqual(plan.maxProviderCalls);
  });
});

describe("always-ineligible governance rule (invariant 7, 8)", () => {
  it("returns ineligible even when a high-certainty, verifier-available diagnosis is present", () => {
    const rule = createAlwaysIneligibleDisclosureRuleV1();
    // The rule never inspects context: it is ineligible regardless of certainty.
    const result = rule.evaluate({
      diagnoses: [{
        id: "d1",
        diagnosisRef: { id: "swarmalpha.risk.high-certainty-insufficient-lineage", version: "2.0.0" },
        attributes: { claimId: "claim:x", beliefReportId: "b1", beliefKind: "categorical", claimResolved: false, verifierAvailable: true },
        targetIds: ["agent:1"],
      }],
    } as never);
    expect(result.eligible).toBe(false);
    expect(result.ruleRef.id).toBe(ALWAYS_INELIGIBLE_DISCLOSURE_RULE_REF.id);
  });

  it("runs the real slice with a mock invoker and yields zero verification calls", async () => {
    const taskId = 13;
    const options = createHiddenBenchTaskProjectionV1({ sourceTaskId: taskId }).adapter.task.claim.options;
    // High-certainty round-1 reports: if the always-ineligible rule were leaky,
    // the standard threshold rule would fire an eligible event + verification call.
    const highCertainty = Object.fromEntries(options.map((option, index) => [option, index === 0 ? 0.99 : 0.01 / (options.length - 1)]));
    const claimId = `claim:hiddenbench:${taskId}:answer`;
    const counts = { calls: 0 };
    const invoke = async (request: SingleAttemptTextInvokeRequest) => {
      counts.calls += 1;
      const usage = { promptTokens: 10, completionTokens: 10, totalTokens: 20 };
      if (request.requestId.startsWith("final:")) {
        return { rawContent: JSON.stringify({ status: "answered", reports: [{ claimId, value: { kind: "categorical", probabilities: highCertainty } }] }), usage };
      }
      return { rawContent: JSON.stringify({ message: "mock", belief: { kind: "categorical", probabilities: highCertainty }, evidence: [] }), usage };
    };
    const base = tempRoot();
    const outputDir = path.join(base, "out"); // must not pre-exist (execute refuses existing roots)
    try {
      const result = await runSourceDisclosureScreenExecute({
        plan,
        invoker: { invoke } as SingleAttemptTextInvoker,
        outputDir,
        taskIds: [taskId],
      });
      expect(result.results).toHaveLength(4);
      const expectedCalls = plan.tasks.find(t => t.taskId === taskId)!.blocks[0].runs[0].plannedProviderCalls;
      for (const item of result.results) {
        const artifact = JSON.parse(fs.readFileSync(item.absolutePath, "utf8")) as Record<string, unknown>;
        const sourceEvents = ((artifact.governanceAuditTrail as Record<string, unknown>)?.sourceEvents as Array<Record<string, unknown>>) ?? [];
        const verification = sourceEvents.filter(ev => ((ev.eventRef as { id?: string })?.id ?? "").includes("verification-result"));
        expect(verification).toHaveLength(0);
        const transitions = ((artifact.governanceAuditTrail as Record<string, unknown>)?.actionTransitions as Array<{ to: string }>) ?? [];
        expect(transitions.every(t => t.to !== "assigned" && t.to !== "queued" && t.to !== "delivered")).toBe(true);
        const manifest = artifact.v6TaskManifest as { publicContextHash?: string; taskDefinitionHash?: string };
        expect(manifest.publicContextHash).toBe(item.run.publicContextHash);
        expect(manifest.taskDefinitionHash).toBe(item.run.taskDefinitionHash);
      }
      // 4 runs * expectedCalls each, zero verification.
      expect(counts.calls).toBe(4 * expectedCalls);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("CLI plan/replay/execute are zero-provider and fail-closed", async () => {
    delete process.env.RUN_AUTHORIZED;
    delete process.env.SOURCE_DISCLOSURE_TASK_SET;
    expect(runPlan()).toBe(0);
    // State-aware: before the screen ran the output root is absent (replay -> 4);
    // after the real screen run it contains 40/40 verified artifacts (replay -> 0).
    const hasAllArtifacts = fs.existsSync(SOURCE_DISCLOSURE_SCREEN_OUTPUT_DIR)
      && fs.readdirSync(SOURCE_DISCLOSURE_SCREEN_OUTPUT_DIR).filter(f => f.endsWith(".raw-run.v5.json")).length === plan.totalRuns;
    expect(runReplayCli()).toBe(hasAllArtifacts ? 0 : 4);
    // Without the literal RUN_AUTHORIZED=yes gate, --execute is blocked before
    // any credential/provider access.
    expect(await runExecuteCli()).toBe(5);
    // replay against an empty root reports explicit absent, not a forged success
    const replay = runSourceDisclosureScreenReplayV1({ plan, outputDir: tempRoot() });
    expect(replay.present).toBe(0);
    expect(replay.issues).toEqual([]);
  });

  it("blocks on the RUN_AUTHORIZED gate before any invoker call, and on a missing key post-dotenv", () => {
    expect(sourceDisclosureExecuteGateV1({})).toEqual({ ok: false, code: 5, reason: expect.stringContaining("RUN_AUTHORIZED") });
    expect(sourceDisclosureExecuteGateV1({ RUN_AUTHORIZED: "yes" })).toEqual({ ok: true, code: 0, reason: "" });
    expect(sourceDisclosureKeyPresenceV1({})).toEqual({ ok: false, code: 3 });
    expect(sourceDisclosureKeyPresenceV1({ DEEPSEEK_API_KEY: "present" })).toEqual({ ok: true, code: 0 });
    // Neither boundary ever returns the key value, only presence/absence.
    const keyBoundary = sourceDisclosureKeyPresenceV1({ DEEPSEEK_API_KEY: "secret-value" });
    expect(JSON.stringify(keyBoundary)).not.toContain("secret-value");
  });

  it("never imports a retrying provider or callLLM", () => {
    const source = fs.readFileSync("experiments/campaign/v6/run_v6_source_disclosure_screen.ts", "utf8");
    expect(source).not.toMatch(/callLLM/);
    expect(source).not.toMatch(/from ".*src\/lib\/llm/);
    expect(source).toMatch(/createDeepSeekSingleAttemptInvoker/);
    expect(source).toMatch(/createMeteredSingleAttemptInvoker/);
  });

  it("a budget cap halts before issuing the next call", () => {
    const budget = new V6ProviderCallBudget(2, 1000);
    budget.beforeProviderCall();
    budget.beforeProviderCall();
    expect(() => budget.beforeProviderCall()).toThrow(ProviderExecutionHaltError);
  });
});

describe("partial state and exact retry (invariant 9)", () => {
  it("refuses a partial run in an existing output root before provider", async () => {
    const outputDir = tempRoot();
    try {
      const first = runs[0];
      fs.writeFileSync(resolveV6TaskManifestV1Path(outputDir, first.runId), "{}", "utf8");
      await expect(runSourceDisclosureScreenExecute({
        plan,
        invoker: { invoke: async () => { throw new Error("must not be called"); } } as unknown as SingleAttemptTextInvoker,
        outputDir,
        taskIds: [13],
      })).rejects.toThrow(/incomplete_v6_run/);
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("reuses complete replay-verified runs with zero new provider calls", async () => {
    const outputDir = path.join(tempRoot(), "out");
    const taskId = 13;
    const options = createHiddenBenchTaskProjectionV1({ sourceTaskId: taskId }).adapter.task.claim.options;
    const probabilities = Object.fromEntries(options.map((option, index) => [option, index === 0 ? 0.8 : 0.2 / (options.length - 1)]));
    const claimId = `claim:hiddenbench:${taskId}:answer`;
    let calls = 0;
    const invoker = { invoke: async (request: SingleAttemptTextInvokeRequest) => {
      calls += 1;
      const usage = { promptTokens: 10, completionTokens: 10, totalTokens: 20 };
      if (request.requestId.startsWith("final:")) {
        return { rawContent: JSON.stringify({ status: "answered", reports: [{ claimId, value: { kind: "categorical", probabilities } }] }), usage };
      }
      return { rawContent: JSON.stringify({ message: "mock", belief: { kind: "categorical", probabilities }, evidence: [] }), usage };
    } } as SingleAttemptTextInvoker;
    try {
      const first = await runSourceDisclosureScreenExecute({ plan, invoker, outputDir, taskIds: [taskId] });
      expect(first.results.every(result => !result.reused)).toBe(true);
      const firstCalls = calls;
      const second = await runSourceDisclosureScreenExecute({ plan, invoker, outputDir, taskIds: [taskId] });
      expect(second.results.every(result => result.reused)).toBe(true);
      expect(calls).toBe(firstCalls);
    } finally {
      fs.rmSync(path.dirname(outputDir), { recursive: true, force: true });
    }
  });

  it("rejects a self-consistent-looking plan that is not the frozen design", () => {
    const tampered = structuredClone(plan);
    tampered.tasks[0].blocks[0].runs[0].estimatedTokens += 1;
    expect(() => assertFrozenSourceDisclosureScreenPlanV1(tampered)).toThrow(/frozen-design/);
  });

  it("preflight treats a raw-run as complete and never re-draws (plan is immutable)", () => {
    const temp = tempRoot();
    try {
      const first = runs[0];
      fs.writeFileSync(resolveV6AuditableRawRunPath(temp, first.runId), "{}", "utf8");
      expect(preflightIncompleteRuns(temp, runs as unknown as Parameters<typeof preflightIncompleteRuns>[1])).toEqual([]);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});

describe("analyzer completeness fail-closed (invariant 11)", () => {
  it("rejects empty, extra, and 40-artifact sets correctly", () => {
    const empty = tempRoot();
    try {
      expect(() => assertDisclosureArtifactCompletenessV1(plan, empty)).toThrow(/artifacts|mismatch/);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
    const extra = tempRoot();
    try {
      fs.writeFileSync(path.join(extra, "run_fake_extra_0000000000.raw-run.v5.json"), "{}", "utf8");
      expect(() => assertDisclosureArtifactCompletenessV1(plan, extra)).toThrow(/extra|mismatch/);
    } finally {
      fs.rmSync(extra, { recursive: true, force: true });
    }
    const full = tempRoot();
    try {
      for (const run of runs) {
        fs.writeFileSync(resolveV6AuditableRawRunPath(full, run.runId), "{}", "utf8");
      }
      expect(() => assertDisclosureArtifactCompletenessV1(plan, full)).not.toThrow();
    } finally {
      fs.rmSync(full, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers for paired-difference / status tests
// ---------------------------------------------------------------------------

function mkArtifact(run: SourceDisclosureRunPlanV1, brier: number): DisclosureArtifactV1 {
  return {
    run,
    file: `/${run.runId}.raw-run.v5.json`,
    artifact: {},
    finalBrier: brier,
    publicContextHash: run.publicContextHash,
    actualProviderCalls: run.plannedProviderCalls,
    verificationCalls: 0,
    uptakeObservable: true,
    uptakeHits: 0,
    accuracy: null,
    tokens: 0,
    invalidOrFailed: 0,
    latencyMs: 0,
  };
}

function pairFor(taskId: number, blockIndex: number): { h: DisclosureArtifactV1; d: DisclosureArtifactV1 } {
  const task = plan.tasks.find(t => t.taskId === taskId)!;
  const block = task.blocks[blockIndex];
  return { h: mkArtifact(block.runs[0], 0.5), d: mkArtifact(block.runs[1], 0.3) };
}

describe("paired arithmetic and leakage-group bootstrap (invariant 12)", () => {
  it("computes hand-checkable paired differences deterministically", () => {
    const artifacts = [
      pairFor(13, 0).h, pairFor(13, 0).d, // task13 block1: D 0.3 - H 0.5 = -0.2
      pairFor(13, 1).h, pairFor(13, 1).d, // task13 block2: -0.2
    ];
    // Hand-computable: H brier 0.5, D brier 0.3 -> pairedDiff -0.2.
    artifacts[1].finalBrier = 0.3; // D
    artifacts[0].finalBrier = 0.5; // H
    artifacts[3].finalBrier = 0.3; // D
    artifacts[2].finalBrier = 0.5; // H
    const pairs = computePairedDifferencesV1(artifacts);
    expect(pairs).toHaveLength(2); // one pair per block (task13 b1, task13 b2)
    for (const pair of pairs) {
      expect(pair.pairedDiff).toBeCloseTo(-0.2, 12);
      expect(pair.leakageGroup).toBe("investigation");
    }

    const boot1 = leakageGroupClusterBootstrapV1({ pairs, groupIds: ["investigation"], count: 1000, seed: "test-seed" });
    const boot2 = leakageGroupClusterBootstrapV1({ pairs, groupIds: ["investigation"], count: 1000, seed: "test-seed" });
    expect(boot1).toEqual(boot2);
    expect(boot1.validFraction).toBe(1);
    expect(boot1.diffs.every(diff => diff === -0.2)).toBe(true);
  });

  it("fails closed rather than silently dropping an incomplete pair", () => {
    const { h } = pairFor(13, 0);
    expect(() => computePairedDifferencesV1([h])).toThrow(/invalid-pair/);
  });
});

describe("screen status gate (invariant 13, 14)", () => {
  const base = {
    groupIds: ["g1", "g2"],
    bootstrap: { lower: -0.5, upper: -0.1, median: -0.3, validFraction: 1 },
    expectedPairCount: 4,
  };
  const negPairs = [
    { taskId: 1, leakageGroup: "g1", blockId: "b1", pairedDiff: -0.4 },
    { taskId: 1, leakageGroup: "g1", blockId: "b2", pairedDiff: -0.3 },
    { taskId: 2, leakageGroup: "g2", blockId: "b1", pairedDiff: -0.5 },
    { taskId: 2, leakageGroup: "g2", blockId: "b2", pairedDiff: -0.2 },
  ];

  it("maps PASS, MECHANISM_STOP, QUALITY_STOP, DEFER deterministically", () => {
    expect(decideDisclosureScreenStatusV1({ pairs: negPairs, ...base, deliveryObserved: true, uptakeMeasurable: true, uptakeHits: 2 })).toBe("SCREEN_PASS");
    expect(decideDisclosureScreenStatusV1({ pairs: negPairs, ...base, deliveryObserved: false, uptakeMeasurable: true, uptakeHits: 2 })).toBe("MECHANISM_STOP");
    expect(decideDisclosureScreenStatusV1({ pairs: negPairs, ...base, deliveryObserved: true, uptakeMeasurable: true, uptakeHits: 0 })).toBe("SCREEN_PASS");
    const posPairs = negPairs.map(p => ({ ...p, pairedDiff: 0.3 }));
    expect(decideDisclosureScreenStatusV1({ pairs: posPairs, ...base, deliveryObserved: true, uptakeMeasurable: true, uptakeHits: 1 })).toBe("QUALITY_STOP");
    expect(decideDisclosureScreenStatusV1({ pairs: [], ...base, deliveryObserved: true, uptakeMeasurable: true, uptakeHits: 1 })).toBe("DEFER");
    expect(decideDisclosureScreenStatusV1({ pairs: negPairs, ...base, deliveryObserved: true, uptakeMeasurable: false, uptakeHits: 0 })).toBe("SCREEN_PASS");
    expect(decideDisclosureScreenStatusV1({ pairs: negPairs, ...base, expectedPairCount: 5, deliveryObserved: true, uptakeMeasurable: true, uptakeHits: 1 })).toBe("DEFER");
    expect(decideDisclosureScreenStatusV1({ pairs: negPairs, ...base, bootstrap: { ...base.bootstrap, validFraction: 0.9 }, deliveryObserved: true, uptakeMeasurable: true, uptakeHits: 1 })).toBe("DEFER");
  });

  it("never misreads a single-group improvement as screen-wide robust direction", () => {
    const singleGroupDriven = [
      ...negPairs.filter(p => p.leakageGroup === "g1"), // all negative in g1
      { taskId: 3, leakageGroup: "g2", blockId: "c1", pairedDiff: 0.05 },
      { taskId: 3, leakageGroup: "g2", blockId: "c2", pairedDiff: 0.05 },
    ];
    const status = decideDisclosureScreenStatusV1({ pairs: singleGroupDriven, ...base, deliveryObserved: true, uptakeMeasurable: true, uptakeHits: 1 });
    expect(status).not.toBe("SCREEN_PASS");
  });
});
