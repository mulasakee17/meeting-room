/**
 * Fresh-identity retry-1 plan after the original continuation was invalidated
 * before analysis: every provider call ended in provider_network/provider_error
 * with zero usage. The invalidated artifacts remain untouched and are excluded.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { createDeepSeekSingleAttemptInvoker } from "./deepseekSingleAttemptInvoker";
import {
  buildVerdictRandomizedContinuationPlan,
} from "./run_v6_verdict_randomized_continuation";
import {
  runVerdictExploratoryExecute,
  VERDICT_EXPLORATORY_PROFILE,
  type VerdictExploratoryPlan,
  type VerdictExploratoryPlanBody,
} from "./run_v6_verdict_exploratory";
import { createV6HiddenBenchSmokeFixtureV1 } from "./v6HiddenBenchSmokeFixture";
import { primarySeedForProtocol } from "./v6BinarySmokeFixture";

export const RETRY1_OUTPUT_DIR = path.resolve(
  process.cwd(),
  "experiments/campaign/pilot_output/v6-verdict-randomized-continuation-retry1-20260813",
);
export const RETRY1_PLAN_PATH = path.resolve(
  process.cwd(),
  "experiments/campaign/v6/v6_verdict_randomized_continuation_retry1.plan.json",
);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}
function hash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}

export function buildRetry1Plan(): VerdictExploratoryPlan {
  const invalidated = buildVerdictRandomizedContinuationPlan();
  const body: VerdictExploratoryPlanBody = {
    ...invalidated,
    experimentRef: { id: "swarmalpha.experiment.v6-verdict-randomized-continuation-retry1", version: "1.0.0" },
    tasks: invalidated.tasks.map(task => {
      const fixture = createV6HiddenBenchSmokeFixtureV1({
        sourceTaskId: task.taskId,
        profile: VERDICT_EXPLORATORY_PROFILE,
      });
      return {
        ...task,
        runs: task.runs.map(run => {
          const runId = run.runId.replace("randomized-continuation-v1", "randomized-continuation-retry1");
          return {
            ...run,
            runId,
            primaryMasterSeed: primarySeedForProtocol(
              runId,
              fixture.study,
              fixture.design,
              "epistemic_governance_v1",
              fixture.stratum,
            ),
          };
        }),
      };
    }),
    createdAt: "2026-08-13T12:30:00.000Z",
  };
  return { ...body, contentHash: hash(body) };
}

function ensurePlan(plan: VerdictExploratoryPlan): void {
  if (fs.existsSync(RETRY1_PLAN_PATH)) {
    const existing = JSON.parse(fs.readFileSync(RETRY1_PLAN_PATH, "utf8")) as VerdictExploratoryPlan;
    if (existing.contentHash !== plan.contentHash) throw new Error("retry1_plan_no_replace_conflict");
    return;
  }
  fs.writeFileSync(RETRY1_PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
}

async function main(): Promise<number> {
  const plan = buildRetry1Plan();
  ensurePlan(plan);
  if (process.argv.includes("--plan")) {
    console.log(JSON.stringify({ hash: plan.contentHash, runs: plan.totalRuns, calls: plan.totalPlannedProviderCalls }, null, 2));
    return 0;
  }
  if (!process.argv.includes("--execute")) throw new Error("usage: --plan | --execute");
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  if (!process.env.DEEPSEEK_API_KEY) throw new Error("deepseek_api_key_unavailable");
  const taskArgIndex = process.argv.indexOf("--task-ids");
  const taskIds = taskArgIndex >= 0
    ? process.argv[taskArgIndex + 1]?.split(",").map(value => Number.parseInt(value, 10))
    : undefined;
  if (taskArgIndex >= 0 && (!taskIds || taskIds.length === 0 || taskIds.some(value => !Number.isInteger(value)))) {
    throw new Error("--task-ids requires a comma-separated integer list");
  }
  const outputArgIndex = process.argv.indexOf("--output-dir");
  const outputDir = outputArgIndex >= 0
    ? path.resolve(process.argv[outputArgIndex + 1] ?? "")
    : RETRY1_OUTPUT_DIR;
  if (outputArgIndex >= 0 && !process.argv[outputArgIndex + 1]) throw new Error("--output-dir requires a path");
  const result = await runVerdictExploratoryExecute({
    plan,
    invoker: createDeepSeekSingleAttemptInvoker(),
    outputDir,
    ...(taskIds ? { taskIds } : {}),
  });
  console.log(JSON.stringify({ runs: result.results.length, calls: result.budget.callCount, tokens: result.budget.tokenCount }, null, 2));
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 4;
  });
}
