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
});
