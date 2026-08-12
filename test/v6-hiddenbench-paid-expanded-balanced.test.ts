/** Explicitly gated, order-balanced replication using expanded-json-v2. */
import * as fs from "node:fs";
import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import { describe, expect, it } from "vitest";
import { createDeepSeekSingleAttemptInvoker } from "../experiments/campaign/v6/deepseekSingleAttemptInvoker";
import type { V6InteractionProtocol } from "../experiments/campaign/v6/productionVerticalSlice";
import { runV6SmokeExecute } from "../experiments/campaign/v6/run_v6_smoke";
import { planV6SmokeRuns } from "../experiments/campaign/v6/v6BinarySmokeFixture";
import { createV6HiddenBenchSmokeFixtureV1 } from "../experiments/campaign/v6/v6HiddenBenchSmokeFixture";

const ENABLED = process.env.SWARMALPHA_RUN_PAID_EXPANDED_BALANCED === "1";
const BLOCKS = [
  { taskId: 4, replicate: 1, order: ["text_communication_v1", "explicit_belief_v1", "epistemic_governance_v1"] },
  { taskId: 4, replicate: 2, order: ["epistemic_governance_v1", "explicit_belief_v1", "text_communication_v1"] },
  { taskId: 9, replicate: 1, order: ["explicit_belief_v1", "epistemic_governance_v1", "text_communication_v1"] },
  { taskId: 9, replicate: 2, order: ["epistemic_governance_v1", "text_communication_v1", "explicit_belief_v1"] },
] as const satisfies readonly {
  taskId: 4 | 9;
  replicate: 1 | 2;
  order: readonly V6InteractionProtocol[];
}[];

describe("paid HiddenBench expanded order-balanced replication", () => {
  it.runIf(ENABLED)("runs two expanded-json-v2 T/B/G blocks per task", async () => {
    loadEnv({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
    expect(process.env.DEEPSEEK_API_KEY).toBeTruthy();
    const root = path.resolve(
      process.cwd(),
      "experiments/campaign/pilot_output/v6-hiddenbench-expanded-json-v2-balanced-20260812",
    );
    expect(fs.existsSync(root)).toBe(false);
    for (const block of BLOCKS) {
      const fixture = createV6HiddenBenchSmokeFixtureV1({
        sourceTaskId: block.taskId,
        profile: "expanded-json-v2",
      });
      const prefix = `run:v6-hiddenbench-expanded-json-v2:${block.taskId}:r${block.replicate}`;
      const plans = planV6SmokeRuns(fixture, prefix);
      const ordered = block.order.map(protocol => plans.find(plan => plan.protocol === protocol)!);
      const result = await runV6SmokeExecute({
        outputDir: path.join(root, `task-${block.taskId}`, `rep-${block.replicate}`),
        fixture,
        invoker: createDeepSeekSingleAttemptInvoker(),
        plannedRuns: ordered,
        maxProviderCalls: 40,
        maxTotalTokens: 150_000,
      });
      expect(result.results.map(item => item.run.protocol)).toEqual(block.order);
      expect(result.results.every(item => !item.reused)).toBe(true);
    }
  }, 900_000);
});
