/**
 * Explicitly gated paid engineering canary. It is skipped in every normal
 * test run and must never be used as confirmatory or calibration evidence.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import { describe, expect, it } from "vitest";
import { main } from "../experiments/campaign/v6/run_v6_smoke";

const PAID_EXPLORATORY = process.env.SWARMALPHA_RUN_PAID_EXPLORATORY === "1";
const TASK_IDS = [1, 4, 9] as const;

describe("paid HiddenBench exploratory canary", () => {
  it.runIf(PAID_EXPLORATORY)("runs frozen T/B/G once for tasks 1, 4, and 9", async () => {
    loadEnv({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
    expect(process.env.DEEPSEEK_API_KEY).toBeTruthy();
    const root = path.resolve(
      process.cwd(),
      "experiments/campaign/pilot_output/v6-hiddenbench-exploratory-20260811-01",
    );
    expect(fs.existsSync(root)).toBe(false);

    for (const taskId of TASK_IDS) {
      const code = await main([
        "--execute",
        "--task-family", "hiddenbench-categorical",
        "--hiddenbench-task-id", String(taskId),
        "--output-dir", path.join(root, `task-${taskId}`),
        "--max-provider-calls", "40",
        "--max-total-tokens", "100000",
      ]);
      expect(code, `task ${taskId} exploratory execution`).toBe(0);
    }
  }, 900_000);
});
