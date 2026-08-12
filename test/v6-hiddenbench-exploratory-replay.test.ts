/** Local exploratory artifact replay; skipped in normal test runs. */
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SingleAttemptTextInvoker } from "../experiments/campaign/v6/providerAdapters";
import { runV6SmokeExecute } from "../experiments/campaign/v6/run_v6_smoke";
import { planV6SmokeRuns } from "../experiments/campaign/v6/v6BinarySmokeFixture";
import { createV6HiddenBenchSmokeFixtureV1 } from "../experiments/campaign/v6/v6HiddenBenchSmokeFixture";

const REPLAY_LOCAL = process.env.SWARMALPHA_REPLAY_EXPLORATORY === "1";

describe("local HiddenBench exploratory artifact replay", () => {
  it.runIf(REPLAY_LOCAL)("replays all nine artifacts without a provider call", async () => {
    const invoke = vi.fn(async () => {
      throw new Error("provider_must_not_be_called_during_exact_retry");
    });
    const invoker = { invoke } as SingleAttemptTextInvoker;
    const root = path.resolve(
      process.cwd(),
      "experiments/campaign/pilot_output/v6-hiddenbench-exploratory-20260811-01",
    );
    for (const taskId of [1, 4, 9]) {
      const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: taskId });
      const result = await runV6SmokeExecute({
        outputDir: path.join(root, `task-${taskId}`),
        fixture,
        invoker,
        plannedRuns: planV6SmokeRuns(fixture, `run:v6-hiddenbench:${taskId}`),
        maxProviderCalls: 40,
        maxTotalTokens: 100_000,
      });
      expect(result.results).toHaveLength(3);
      expect(result.results.every(run => run.reused)).toBe(true);
      expect(result.budget.callCount).toBe(0);
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it.runIf(REPLAY_LOCAL)("replays all expanded balanced artifacts without a provider call", async () => {
    const invoke = vi.fn(async () => {
      throw new Error("provider_must_not_be_called_during_exact_retry");
    });
    const invoker = { invoke } as SingleAttemptTextInvoker;
    const root = path.resolve(
      process.cwd(),
      "experiments/campaign/pilot_output/v6-hiddenbench-expanded-json-v2-balanced-20260812",
    );
    for (const taskId of [4, 9]) {
      for (const replicate of [1, 2]) {
        const fixture = createV6HiddenBenchSmokeFixtureV1({
          sourceTaskId: taskId,
          profile: "expanded-json-v2",
        });
        const prefix = `run:v6-hiddenbench-expanded-json-v2:${taskId}:r${replicate}`;
        const result = await runV6SmokeExecute({
          outputDir: path.join(root, `task-${taskId}`, `rep-${replicate}`),
          fixture,
          invoker,
          plannedRuns: planV6SmokeRuns(fixture, prefix),
          maxProviderCalls: 40,
          maxTotalTokens: 150_000,
        });
        expect(result.results.every(run => run.reused)).toBe(true);
        expect(result.budget.callCount).toBe(0);
      }
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it.runIf(REPLAY_LOCAL)("replays the isolated mechanism-check artifact without a provider call", async () => {
    const invoke = vi.fn(async () => {
      throw new Error("provider_must_not_be_called_during_exact_retry");
    });
    const fixture = createV6HiddenBenchSmokeFixtureV1({
      sourceTaskId: 9,
      profile: "mechanism-check-07-v1",
    });
    const result = await runV6SmokeExecute({
      outputDir: path.resolve(
        process.cwd(),
        "experiments/campaign/pilot_output/v6-hiddenbench-mechanism-check-07-v1-20260812/task-9",
      ),
      fixture,
      invoker: { invoke } as SingleAttemptTextInvoker,
      plannedRuns: planV6SmokeRuns(fixture, "run:v6-hiddenbench-mechanism-check-07-v1:9")
        .filter(run => run.protocol === "epistemic_governance_v1"),
      maxProviderCalls: 20,
      maxTotalTokens: 50_000,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.reused).toBe(true);
    expect(result.budget.callCount).toBe(0);
    expect(invoke).not.toHaveBeenCalled();
  });
});
