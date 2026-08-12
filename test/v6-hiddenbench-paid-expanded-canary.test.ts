/** Explicitly gated paid check that the versioned 768-token profile removes truncation. */
import * as fs from "node:fs";
import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import { describe, expect, it } from "vitest";
import { createDeepSeekSingleAttemptInvoker } from "../experiments/campaign/v6/deepseekSingleAttemptInvoker";
import { runV6SmokeExecute } from "../experiments/campaign/v6/run_v6_smoke";
import { planV6SmokeRuns } from "../experiments/campaign/v6/v6BinarySmokeFixture";
import { createV6HiddenBenchSmokeFixtureV1 } from "../experiments/campaign/v6/v6HiddenBenchSmokeFixture";

const ENABLED = process.env.SWARMALPHA_RUN_PAID_EXPANDED_CANARY === "1";

describe("paid HiddenBench expanded JSON canary", () => {
  it.runIf(ENABLED)("runs one Task 4 B arm with the versioned 768-token profile", async () => {
    loadEnv({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
    expect(process.env.DEEPSEEK_API_KEY).toBeTruthy();
    const outputDir = path.resolve(
      process.cwd(),
      "experiments/campaign/pilot_output/v6-hiddenbench-expanded-json-v2-canary-20260812/task-4",
    );
    expect(fs.existsSync(outputDir)).toBe(false);
    const fixture = createV6HiddenBenchSmokeFixtureV1({
      sourceTaskId: 4,
      profile: "expanded-json-v2",
    });
    const run = planV6SmokeRuns(fixture, "run:v6-hiddenbench-expanded-json-v2:4")
      .find(item => item.protocol === "explicit_belief_v1")!;
    const result = await runV6SmokeExecute({
      outputDir,
      fixture,
      invoker: createDeepSeekSingleAttemptInvoker(),
      plannedRuns: [run],
      maxProviderCalls: 10,
      maxTotalTokens: 30_000,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].reused).toBe(false);
  }, 300_000);
});
