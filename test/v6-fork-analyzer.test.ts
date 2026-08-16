/** Fork analyzer + preflight mock tests (zero network). */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { analyzeForkRows, runForkPreflight, runForkPreflightExecute, runForkDevAnalysis } from "../experiments/campaign/v6/analyze_v6_fork";
import { createHiddenBenchTaskProjectionV1 } from "../experiments/campaign/v6/hiddenBenchTaskAdapter";
import type { ForkArm, ForkRow } from "../experiments/campaign/v6/run_v6_fork";
import type { SingleAttemptTextInvoker, SingleAttemptTextInvokeRequest } from "../experiments/campaign/v6/providerAdapters";

const ARMS: ForkArm[] = ["CONTROL", "SUPPORTS", "ATTACKS"];

function row(taskId: number, seed: number, arm: ForkArm, brier: number | null): ForkRow {
  return {
    taskId, seed, model: "deepseek:deepseek-chat", round1StateHash: `h:${taskId}:${seed}`, arm,
    disclosedEvidenceCount: 0, disclosedPoolSize: 0,
    disclosedTokenCount: 0, disclosedCoveredOptionIds: [], disclosedCoveredOptionCount: 0, disclosedSourceAgentCount: 0,
    alignmentR: 0.5, maxPairwiseTV: 0.5, evidenceReuse: 0, evidenceDiversity: 0.5,
    round2Belief: { A: 0.5, B: 0.5 }, round2AlignmentR: 0.5, round2MaxPairwiseTV: 0.5,
    evidenceReuseR2: 0, evidenceDiversityR2: 0.5, beliefShiftR1ToR2: 0.1,
    finalBrier: brier, finalAccuracy: null, finalBelief: null, finalReportedCount: 0,
    resolvedOption: "A",
    round1AgentBeliefs: [], round2AgentBeliefs: [], round2EvidenceContentHashes: [], finalAgentBeliefs: [],
    round1EvidenceContents: [], round2EvidenceContents: [],
  };
}

describe("analyzeForkRows (task-level paired)", () => {
  it("computes H1 = ATTACKS - SUPPORTS and H2 = ATTACKS - CONTROL as paired differences", () => {
    const briers: Record<ForkArm, number | null> = {
      CONTROL: 0.8, SUPPORTS: 0.5, ATTACKS: 0.1,
    };
    const rows = ARMS.map(arm => row(13, 0, arm, briers[arm]));
    const result = analyzeForkRows(rows, 1000);

    expect(result.h1.mean).toBeCloseTo(0.1 - 0.5, 10); // -0.4 (ATTACKS better)
    expect(result.h2.mean).toBeCloseTo(0.1 - 0.8, 10); // -0.7 (ATTACKS better)
    expect(result.h1.negativeTasks).toBe(1);
    expect(result.h1.positiveTasks).toBe(0);
    expect(result.h1.taskCount).toBe(1);
    expect(result.blockCount).toBe(1);
    // CI fully below 0 -> detected in predicted direction.
    expect(result.h1.verdict).toBe("direction effect detected in predicted direction");
  });

  it("averages across seeds within a task before computing the task effect", () => {
    const mk = (seed: number, arm: ForkArm, brier: number) => row(13, seed, arm, brier);
    const rows = [
      mk(0, "SUPPORTS", 0.5), mk(0, "ATTACKS", 0.1),
      mk(1, "SUPPORTS", 0.3), mk(1, "ATTACKS", 0.1),
    ];
    const result = analyzeForkRows(rows, 1000);
    // per-seed deltas: -0.4 and -0.2; task mean = -0.3.
    expect(result.h1.mean).toBeCloseTo(-0.3, 10);
    expect(result.h1.taskCount).toBe(1);
  });

  it("preflight READY on a complete block, BLOCKED on an incomplete one", () => {
    const complete = ARMS.map(arm => row(13, 0, arm, 0.3));
    expect(runForkPreflight(complete, null).summary).toBe("READY");
    expect(runForkPreflight(complete.slice(0, 2), null).summary).toBe("BLOCKED");
  });
});

describe("runForkPreflightExecute (mock invoker, zero network)", () => {
  const TASK_ID = 13;
  const opts = createHiddenBenchTaskProjectionV1({ sourceTaskId: TASK_ID }).adapter.task.claim.options;
  const cid = `claim:hiddenbench:${TASK_ID}:answer`;

  function probs(agentIdx: number): Record<string, number> {
    return Object.fromEntries(opts.map((o, i) => [o, i === agentIdx % opts.length ? 0.9 : 0.1 / (opts.length - 1)]));
  }

  function mockInvoker(): SingleAttemptTextInvoker {
    return {
      async invoke(request: SingleAttemptTextInvokeRequest) {
        const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
        if (request.requestId.startsWith("final:")) {
          return { rawContent: JSON.stringify({ status: "answered", reports: [{ claimId: cid, value: { kind: "categorical", probabilities: probs(0) } }] }), usage };
        }
        const m = /agent:hiddenbench:\d+:(\d+)/.exec(request.requestId);
        const idx = m ? parseInt(m[1], 10) - 1 : 0;
        return {
          rawContent: JSON.stringify({
            message: `mock ${idx}`,
            belief: { kind: "categorical", probabilities: probs(idx) },
            evidence: [{ content: `supports ${idx}`, relation: "supports" }, { content: `attacks ${idx}`, relation: "attacks" }],
          }),
          usage,
        };
      },
    };
  }

  it("runs fork + preflight end-to-end (zero provider) and reports READY", async () => {
    const { rows, preflight } = await runForkPreflightExecute({
      taskIds: [TASK_ID], seeds: [0], invoker: mockInvoker(), includeSeedProbe: false,
    });
    expect(rows).toHaveLength(3);
    expect(preflight.summary).toBe("READY");
    expect(new Set(rows.map(r => r.round1StateHash)).size).toBe(1);
  });

  it("runForkDevAnalysis persists JSONL and returns H1/H2 (mock, temp dir)", async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "fork-dev-"));
    try {
      const result = await runForkDevAnalysis({ invoker: mockInvoker(), taskIds: [TASK_ID], seeds: [0], outputDir });
      expect(result.rows).toHaveLength(3);
      expect(result.h1.taskCount).toBe(1);
      expect(typeof result.h1.mean).toBe("number");
      expect(typeof result.h2.mean).toBe("number");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
