/**
 * Frozen continuation of the 2026-08-12 V6 verdict experiment.
 *
 * Purpose: increase the number of randomized eligible-event apply/sham/holdout
 * observations without changing the task set, model, prompts, threshold,
 * verification contract, outcome, or production slice. This is exploratory.
 * It does not validate the detector or establish general governance efficacy.
 *
 * Modes:
 *   --plan     persist/verify the no-replace plan; zero provider calls
 *   --execute  sequential single-attempt DeepSeek execution
 *   --replay   verify every continuation artifact; zero provider calls
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { verifyRawRunData } from "../replayVerifier";
import { resolveV6AuditableRawRunPath } from "./productionVerticalSlice";
import { createDeepSeekSingleAttemptInvoker } from "./deepseekSingleAttemptInvoker";
import { createV6HiddenBenchSmokeFixtureV1 } from "./v6HiddenBenchSmokeFixture";
import {
  primarySeedForProtocol,
  V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED,
} from "./v6BinarySmokeFixture";
import {
  VERDICT_EXPLORATORY_ANALYSIS_CONTRACT,
  VERDICT_EXPLORATORY_PROFILE,
  VERDICT_EXPLORATORY_STAGE2,
  VERDICT_EXPLORATORY_TASK_IDS,
  buildVerdictExploratoryPlan,
  runVerdictExploratoryExecute,
  type VerdictExploratoryPlan,
  type VerdictExploratoryPlanBody,
  type VerdictExploratoryRunPlan,
} from "./run_v6_verdict_exploratory";
import { preflightIncompleteRuns } from "./run_v6_smoke";

export const VERDICT_CONTINUATION_EXPERIMENT_REF = Object.freeze({
  id: "swarmalpha.experiment.v6-verdict-randomized-continuation-v1",
  version: "1.0.0",
});
export const VERDICT_CONTINUATION_REPLICATES = Object.freeze([3, 4, 5, 6]);
export const VERDICT_CONTINUATION_MAX_PROVIDER_CALLS = 1_100;
export const VERDICT_CONTINUATION_MAX_TOTAL_TOKENS = 1_400_000;
export const VERDICT_CONTINUATION_CREATED_AT = "2026-08-13T12:00:00.000Z";
export const VERDICT_CONTINUATION_OUTPUT_DIR = path.resolve(
  process.cwd(),
  "experiments/campaign/pilot_output/v6-verdict-randomized-continuation-v1-20260813",
);
export const VERDICT_CONTINUATION_PLAN_PATH = path.resolve(
  process.cwd(),
  "experiments/campaign/v6/v6_verdict_randomized_continuation_v1.plan.json",
);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonical(child)]));
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("plan values must be finite");
  return value;
}

function hashPlan(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value)), "utf8").digest("hex")}`;
}

function plannedBudget(agentCount: number): { calls: number; tokens: number } {
  const calls = agentCount * 3 + 1;
  return { calls, tokens: agentCount * 45 + 12 };
}

/** Frozen before observing continuation outcomes. */
export function buildVerdictRandomizedContinuationPlan(): VerdictExploratoryPlan {
  const original = buildVerdictExploratoryPlan();
  const tasks = original.tasks.map(originalTask => {
    const fixture = createV6HiddenBenchSmokeFixtureV1({
      sourceTaskId: originalTask.taskId,
      profile: VERDICT_EXPLORATORY_PROFILE,
    });
    const budget = plannedBudget(fixture.task.agents.length);
    const runs: VerdictExploratoryRunPlan[] = VERDICT_CONTINUATION_REPLICATES.map(replicate => {
      const runId = `run:v6-verdict-randomized-continuation-v1:task-${originalTask.taskId}:G:r${replicate}`;
      return {
        runId,
        taskId: originalTask.taskId,
        protocol: "epistemic_governance_v1",
        replicate,
        primaryMasterSeed: primarySeedForProtocol(
          runId,
          fixture.study,
          fixture.design,
          "epistemic_governance_v1",
          fixture.stratum,
        ),
        eligibleEventMasterSeed: V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED,
        monitoringMasterSeed: replicate - 1,
        plannedProviderCalls: budget.calls,
        estimatedTokens: budget.tokens,
      };
    });
    return { ...originalTask, runs };
  });
  const totalRuns = tasks.reduce((sum, task) => sum + task.runs.length, 0);
  const totalPlannedProviderCalls = tasks.flatMap(task => task.runs)
    .reduce((sum, run) => sum + run.plannedProviderCalls, 0);
  const totalEstimatedTokens = tasks.flatMap(task => task.runs)
    .reduce((sum, run) => sum + run.estimatedTokens, 0);
  const body: VerdictExploratoryPlanBody = {
    experimentRef: { ...VERDICT_CONTINUATION_EXPERIMENT_REF },
    profile: VERDICT_EXPLORATORY_PROFILE,
    taskIds: [...VERDICT_EXPLORATORY_TASK_IDS],
    bReplicateCount: 0,
    gReplicateCount: VERDICT_CONTINUATION_REPLICATES.length,
    certaintyThreshold: original.certaintyThreshold,
    stage2Allocation: { ...VERDICT_EXPLORATORY_STAGE2 },
    verificationResponseContract: original.verificationResponseContract,
    providerModelRef: { ...original.providerModelRef },
    providerInvocationConfigHash: original.providerInvocationConfigHash,
    maxProviderCalls: VERDICT_CONTINUATION_MAX_PROVIDER_CALLS,
    maxTotalTokens: VERDICT_CONTINUATION_MAX_TOTAL_TOKENS,
    eligibleEventMasterSeed: V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED,
    tasks,
    totalRuns,
    totalPlannedProviderCalls,
    totalEstimatedTokens,
    analysisContract: { ...VERDICT_EXPLORATORY_ANALYSIS_CONTRACT },
    createdAt: VERDICT_CONTINUATION_CREATED_AT,
  };
  return { ...body, contentHash: hashPlan(body) };
}

function ensurePlan(plan: VerdictExploratoryPlan): void {
  if (fs.existsSync(VERDICT_CONTINUATION_PLAN_PATH)) {
    const existing = JSON.parse(fs.readFileSync(VERDICT_CONTINUATION_PLAN_PATH, "utf8")) as VerdictExploratoryPlan;
    const { contentHash, ...existingBody } = existing;
    if (contentHash !== plan.contentHash || hashPlan(existingBody) !== contentHash) {
      throw new Error("continuation_plan_no_replace_conflict");
    }
    return;
  }
  fs.writeFileSync(VERDICT_CONTINUATION_PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
}

function runPlan(): number {
  const plan = buildVerdictRandomizedContinuationPlan();
  ensurePlan(plan);
  const blockers = preflightIncompleteRuns(
    VERDICT_CONTINUATION_OUTPUT_DIR,
    plan.tasks.flatMap(task => task.runs),
  );
  if (blockers.length > 0) throw new Error(blockers.join(";"));
  console.log(JSON.stringify({
    mode: "plan",
    contentHash: plan.contentHash,
    tasks: plan.taskIds.length,
    runs: plan.totalRuns,
    plannedCalls: plan.totalPlannedProviderCalls,
    maxCalls: plan.maxProviderCalls,
    estimatedTokens: plan.totalEstimatedTokens,
    outputDir: VERDICT_CONTINUATION_OUTPUT_DIR,
    claims: ["exploratory randomized eligible-event effect only"],
  }, null, 2));
  return 0;
}

async function runExecute(): Promise<number> {
  const plan = buildVerdictRandomizedContinuationPlan();
  ensurePlan(plan);
  const blockers = preflightIncompleteRuns(
    VERDICT_CONTINUATION_OUTPUT_DIR,
    plan.tasks.flatMap(task => task.runs),
  );
  if (blockers.length > 0) throw new Error(blockers.join(";"));
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error("deepseek_api_key_unavailable");
    return 3;
  }
  const { results, budget } = await runVerdictExploratoryExecute({
    plan,
    invoker: createDeepSeekSingleAttemptInvoker(),
    outputDir: VERDICT_CONTINUATION_OUTPUT_DIR,
  });
  console.log(JSON.stringify({ runs: results.length, calls: budget.callCount, tokens: budget.tokenCount }, null, 2));
  return 0;
}

function runReplay(): number {
  const plan = buildVerdictRandomizedContinuationPlan();
  ensurePlan(plan);
  let verified = 0;
  for (const taskPlan of plan.tasks) {
    const fixture = createV6HiddenBenchSmokeFixtureV1({
      sourceTaskId: taskPlan.taskId,
      profile: VERDICT_EXPLORATORY_PROFILE,
    });
    for (const run of taskPlan.runs) {
      const file = resolveV6AuditableRawRunPath(VERDICT_CONTINUATION_OUTPUT_DIR, run.runId);
      if (!fs.existsSync(file)) throw new Error(`continuation_missing_artifact:${run.runId}`);
      const artifact = JSON.parse(fs.readFileSync(file, "utf8"));
      const replay = verifyRawRunData(file, artifact, { governanceRules: [fixture.rule] });
      if (replay.runIssues.length > 0 || replay.governanceAuditStatus !== "sealed_decision_replay_verified") {
        throw new Error(`continuation_replay_failed:${run.runId}:${replay.runIssues.map(issue => issue.code).join(",")}`);
      }
      verified += 1;
    }
  }
  console.log(JSON.stringify({ mode: "replay", verified, expected: plan.totalRuns }, null, 2));
  return verified === plan.totalRuns ? 0 : 4;
}

async function main(): Promise<number> {
  if (process.argv.includes("--plan")) return runPlan();
  if (process.argv.includes("--execute")) return runExecute();
  if (process.argv.includes("--replay")) return runReplay();
  console.error("usage: --plan | --execute | --replay");
  return 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 4;
  });
}
