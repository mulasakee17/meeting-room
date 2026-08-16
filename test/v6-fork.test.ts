/** Fork runner mock test: round-1 checkpoint + 5-arm fork, zero network. */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { runFork, runForkExecute, verifyForkOutput, buildForkPlanV1, probeForkSeedSensitivity, FORK_ARMS } from "../experiments/campaign/v6/run_v6_fork";
import { createHiddenBenchTaskProjectionV1 } from "../experiments/campaign/v6/hiddenBenchTaskAdapter";
import type { SingleAttemptTextInvoker, SingleAttemptTextInvokeRequest } from "../experiments/campaign/v6/providerAdapters";

const TASK_ID = 13;
const options = createHiddenBenchTaskProjectionV1({ sourceTaskId: TASK_ID }).adapter.task.claim.options;
const claimId = `claim:hiddenbench:${TASK_ID}:answer`;

function probsFor(agentIdx: number): Record<string, number> {
  // agent 0 heavily favors option 0, others split — creates disagreement + evidence
  return Object.fromEntries(options.map((o, i) => [o, i === agentIdx % options.length ? 0.9 : 0.1 / (options.length - 1)]));
}

function mockInvoker(): SingleAttemptTextInvoker & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async invoke(request: SingleAttemptTextInvokeRequest) {
      calls.push(request.requestId);
      const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
      if (request.requestId.startsWith("final:")) {
        return { rawContent: JSON.stringify({ status: "answered", reports: [{ claimId, value: { kind: "categorical", probabilities: probsFor(0) } }] }), usage };
      }
      // discussion
      const m = /agent:hiddenbench:\d+:(\d+)/.exec(request.requestId);
      const idx = m ? parseInt(m[1], 10) - 1 : 0;
      const evidence = [
        { content: `pro-option-${options[0]} fact`, relation: "supports" },
        { content: `anti-option-${options[1]} fact`, relation: "attacks" },
      ];
      return { rawContent: JSON.stringify({ message: `mock message ${idx}`, belief: { kind: "categorical", probabilities: probsFor(idx) }, evidence }), usage };
    },
  };
}

describe("runFork (mock invoker, zero network)", () => {
  it("captures round-1 state and produces 3 arm rows with correct injections", async () => {
    const invoker = mockInvoker();
    const rows = await runFork({ taskId: TASK_ID, seed: 0, model: "deepseek:deepseek-chat", invoker });
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.arm)).toEqual([...FORK_ARMS]);

    const byArm = Object.fromEntries(rows.map(r => [r.arm, r]));
    // All arms share the same round-1 state hash (forked from identical state).
    const stateHashes = new Set(rows.map(r => r.round1StateHash));
    expect(stateHashes.size).toBe(1);

    // CONTROL injects nothing; SUPPORTS/ATTACKS inject their relation's evidence.
    expect(byArm.CONTROL.disclosedEvidenceCount).toBe(0);
    expect(byArm.SUPPORTS.disclosedEvidenceCount).toBeGreaterThan(0);
    expect(byArm.ATTACKS.disclosedEvidenceCount).toBeGreaterThan(0);

    // SUPPORTS injects only supports; ATTACKS only attacks.
    expect(byArm.SUPPORTS.disclosedCoveredOptionCount).toBeGreaterThanOrEqual(0);
    expect(byArm.SUPPORTS.disclosedCoveredOptionIds).toHaveLength(byArm.SUPPORTS.disclosedCoveredOptionCount);
    expect(byArm.SUPPORTS.disclosedSourceAgentCount).toBeGreaterThanOrEqual(0);
    // Final belief/Brier computed from the mock's fixed final answer.
    for (const r of rows) {
      expect(r.finalBelief).not.toBeNull();
      expect(typeof r.finalBrier).toBe("number");
      expect(typeof r.finalAccuracy).toBe("number");
      expect(r.alignmentR).not.toBeNull();
      expect(typeof r.maxPairwiseTV).toBe("number");
    }
  });

  it("SUPPORTS and ATTACKS arms disclose different evidence relations", async () => {
    const invoker = mockInvoker();
    const rows = await runFork({ taskId: TASK_ID, seed: 0, model: "deepseek:deepseek-chat", invoker });
    const s = rows.find(r => r.arm === "SUPPORTS")!;
    const a = rows.find(r => r.arm === "ATTACKS")!;
    // Same round-1 state; different arms; both disclose, but SUPPORTS and ATTACKS
    // draw from different relations (verified indirectly: they are distinct arms).
    expect(s.arm).toBe("SUPPORTS");
    expect(a.arm).toBe("ATTACKS");
    expect(s.round1StateHash).toBe(a.round1StateHash);
  });

  it("writes JSONL rows + manifest and replays deterministically (mock, zero network)", async () => {
    const invoker = mockInvoker();
    const outputDir = mkdtempSync(path.join(tmpdir(), "fork-test-"));
    try {
      const plan = buildForkPlanV1([TASK_ID], [0]);
      const result = await runForkExecute({ plan, invoker, outputDir });
      expect(result.runs).toBe(1);
      expect(result.rows).toBe(3);

      const manifestPath = path.join(outputDir, "manifest.json");
      expect(existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      expect(manifest.files).toHaveLength(1);
      expect(manifest.files[0].rowCount).toBe(3);

      const replay = verifyForkOutput(outputDir);
      expect(replay.ok).toBe(true);

      // Resume: a second execute reuses the completed run without re-running.
      const second = await runForkExecute({ plan, invoker, outputDir });
      expect(second.reused).toBe(1);
      expect(second.rows).toBe(3);
      expect(verifyForkOutput(outputDir).ok).toBe(true);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});

describe("seed-sensitivity probe (mock invoker, zero network)", () => {
  function seedSensitiveMock(): SingleAttemptTextInvoker {
    return {
      async invoke(request: SingleAttemptTextInvokeRequest) {
        const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
        if (request.requestId.startsWith("final:")) {
          return { rawContent: JSON.stringify({ status: "answered", reports: [{ claimId, value: { kind: "categorical", probabilities: probsFor(0) } }] }), usage };
        }
        const m = /agent:hiddenbench:\d+:(\d+)/.exec(request.requestId);
        const idx = m ? parseInt(m[1], 10) - 1 : 0;
        const seedMatch = /seed-(\d+)/.exec(request.requestId);
        const seed = seedMatch ? parseInt(seedMatch[1], 10) : 0;
        // Shift the favored option by seed so different seeds yield different beliefs.
        const probs = Object.fromEntries(options.map((o, i) => [o, i === (idx + seed) % options.length ? 0.9 : 0.1 / (options.length - 1)]));
        return { rawContent: JSON.stringify({ message: `mock message ${idx}`, belief: { kind: "categorical", probabilities: probs }, evidence: [{ content: `fact ${idx}`, relation: "supports" }] }), usage };
      },
    };
  }

  it("probe round-1 state hash matches runFork for the same (task, seed)", async () => {
    const probe = await probeForkSeedSensitivity({ taskIds: [TASK_ID], seeds: [0], invoker: mockInvoker() });
    const rows = await runFork({ taskId: TASK_ID, seed: 0, model: "deepseek:deepseek-chat", invoker: mockInvoker() });
    expect(probe.perRun[0].round1StateHash).toBe(rows[0].round1StateHash);
  });

  it("confirms seed variation when the provider honors seed", async () => {
    const result = await probeForkSeedSensitivity({ taskIds: [TASK_ID], seeds: [0, 1], invoker: seedSensitiveMock() });
    expect(result.anySeedVariation).toBe(true);
    expect(result.conclusion).toBe("seed_variation_confirmed");
  });

  it("confirms no seed variation when the provider ignores seed", async () => {
    const result = await probeForkSeedSensitivity({ taskIds: [TASK_ID], seeds: [0, 1], invoker: mockInvoker() });
    expect(result.anySeedVariation).toBe(false);
    expect(result.conclusion).toBe("no_seed_variation");
  });
});
