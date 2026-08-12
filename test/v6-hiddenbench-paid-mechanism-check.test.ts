/** Paid engineering-only check of Stage-2 governance execution at threshold 0.7. */
import * as fs from "node:fs";
import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import { describe, expect, it } from "vitest";
import { createDeepSeekSingleAttemptInvoker } from "../experiments/campaign/v6/deepseekSingleAttemptInvoker";
import { runV6SmokeExecute } from "../experiments/campaign/v6/run_v6_smoke";
import { planV6SmokeRuns } from "../experiments/campaign/v6/v6BinarySmokeFixture";
import { createV6HiddenBenchSmokeFixtureV1 } from "../experiments/campaign/v6/v6HiddenBenchSmokeFixture";

const ENABLED = process.env.SWARMALPHA_RUN_PAID_MECHANISM_CHECK === "1";

describe("paid HiddenBench governance mechanism check", () => {
  it.runIf(ENABLED)("runs one Task 9 G arm under isolated threshold-0.7 authority", async () => {
    loadEnv({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
    expect(process.env.DEEPSEEK_API_KEY).toBeTruthy();
    const outputDir = path.resolve(
      process.cwd(),
      "experiments/campaign/pilot_output/v6-hiddenbench-mechanism-check-07-v1-20260812/task-9",
    );
    expect(fs.existsSync(outputDir)).toBe(false);
    const fixture = createV6HiddenBenchSmokeFixtureV1({
      sourceTaskId: 9,
      profile: "mechanism-check-07-v1",
    });
    const run = planV6SmokeRuns(fixture, "run:v6-hiddenbench-mechanism-check-07-v1:9")
      .find(item => item.protocol === "epistemic_governance_v1")!;
    const result = await runV6SmokeExecute({
      outputDir,
      fixture,
      invoker: createDeepSeekSingleAttemptInvoker(),
      plannedRuns: [run],
      maxProviderCalls: 20,
      maxTotalTokens: 50_000,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].reused).toBe(false);
  }, 300_000);
});
