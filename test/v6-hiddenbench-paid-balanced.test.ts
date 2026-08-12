/** Explicitly gated, order-balanced paid engineering replication. */
import * as fs from "node:fs";
import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import { describe, expect, it } from "vitest";
import { createDeepSeekSingleAttemptInvoker } from "../experiments/campaign/v6/deepseekSingleAttemptInvoker";
import { runV6SmokeExecute } from "../experiments/campaign/v6/run_v6_smoke";
import {
  planV6SmokeRuns,
  type V6SmokePlannedRun,
} from "../experiments/campaign/v6/v6BinarySmokeFixture";
import { createV6HiddenBenchSmokeFixtureV1 } from "../experiments/campaign/v6/v6HiddenBenchSmokeFixture";
import type { V6InteractionProtocol } from "../experiments/campaign/v6/productionVerticalSlice";

const PAID_BALANCED = process.env.SWARMALPHA_RUN_PAID_BALANCED === "1";
const ROOT_NAME = "v6-hiddenbench-exploratory-20260812-02-balanced";

const BLOCKS: readonly {
  taskId: 4 | 9;
  replicate: 1 | 2;
  order: readonly V6InteractionProtocol[];
}[] = [
  { taskId: 4, replicate: 1, order: ["text_communication_v1", "explicit_belief_v1", "epistemic_governance_v1"] },
  { taskId: 4, replicate: 2, order: ["epistemic_governance_v1", "explicit_belief_v1", "text_communication_v1"] },
  { taskId: 9, replicate: 1, order: ["explicit_belief_v1", "epistemic_governance_v1", "text_communication_v1"] },
  { taskId: 9, replicate: 2, order: ["epistemic_governance_v1", "text_communication_v1", "explicit_belief_v1"] },
] as const;

function ordered(plans: readonly V6SmokePlannedRun[], order: readonly V6InteractionProtocol[]) {
  expect(new Set(order)).toEqual(new Set(plans.map(plan => plan.protocol)));
  return order.map(protocol => plans.find(plan => plan.protocol === protocol)!);
}

describe("paid HiddenBench order-balanced exploratory replication", () => {
  it.runIf(PAID_BALANCED)("runs two frozen, differently ordered T/B/G blocks per task", async () => {
    loadEnv({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
    expect(process.env.DEEPSEEK_API_KEY).toBeTruthy();
    const root = path.resolve(process.cwd(), "experiments/campaign/pilot_output", ROOT_NAME);
    expect(fs.existsSync(root)).toBe(false);
    for (const block of BLOCKS) {
      const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: block.taskId });
      const prefix = `run:v6-hiddenbench-balanced:${block.taskId}:r${block.replicate}`;
      const plans = ordered(planV6SmokeRuns(fixture, prefix), block.order);
      const result = await runV6SmokeExecute({
        outputDir: path.join(root, `task-${block.taskId}`, `rep-${block.replicate}`),
        fixture,
        invoker: createDeepSeekSingleAttemptInvoker(),
        plannedRuns: plans,
        maxProviderCalls: 40,
        maxTotalTokens: 100_000,
      });
      expect(result.results.map(item => item.run.protocol)).toEqual(block.order);
      expect(result.results.every(item => !item.reused)).toBe(true);
    }
  }, 900_000);
});
