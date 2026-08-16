/**
 * V6 Verification Verdict — frozen task-heldout replication runner.
 *
 * Re-runs the SAME epistemic_governance_v1 public-only verification verdict
 * mechanism on a task set that is semantically disjoint from the already
 * observed development tasks (design:
 * V6_VERDICT_TASK_HELDOUT_REPLICATION_DESIGN_2026-08-13.md). This is a
 * task-heldout replication, NOT a confirmatory study.
 *
 * The plan reuses the existing exploratory runner's build/run/replay path and
 * its V2 fixture (profile mechanism-verdict-v2-v1, certainty 0.7, allocation
 * apply .50 / sham .25 / holdout .25, single-attempt, no retry). It never
 * modifies the production slice, prompts, threshold, model, allocation, or
 * schema. Modes: --plan (zero provider), --execute (implemented entry only —
 * not to be run by this agent), --replay (zero provider).
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
import { computeV6TaskDefinitionHashV1 } from "./v6TaskManifest";
import {
  VERDICT_EXPLORATORY_ANALYSIS_CONTRACT,
  VERDICT_EXPLORATORY_PROFILE,
  VERDICT_EXPLORATORY_STAGE2,
  buildVerdictExploratoryPlan,
  runVerdictExploratoryExecute,
  type VerdictExploratoryPlan,
  type VerdictExploratoryPlanBody,
  type VerdictExploratoryRunPlan,
} from "./run_v6_verdict_exploratory";
export type { VerdictExploratoryPlan } from "./run_v6_verdict_exploratory";
import { preflightIncompleteRuns } from "./run_v6_smoke";

export const VERDICT_TASK_HELDOUT_EXPERIMENT_REF = Object.freeze({
  id: "swarmalpha.experiment.v6-verdict-task-heldout-replication-v1",
  version: "1.0.0",
});

/** Frozen held-out task set (order must not change). */
export const VERDICT_TASK_HELDOUT_TASK_IDS: readonly number[] = [5, 7, 14, 21, 57, 61, 64, 65];

/** 12 G replicates per task, replicate = 1..12. */
export const VERDICT_TASK_HELDOUT_REPLICATE_COUNT = 12;

export const VERDICT_TASK_HELDOUT_MAX_PROVIDER_CALLS = 1_300;
export const VERDICT_TASK_HELDOUT_MAX_TOTAL_TOKENS = 1_600_000;
export const VERDICT_TASK_HELDOUT_REVIEWED_AT = "2026-08-13T08:00:00.000Z";
export const VERDICT_TASK_HELDOUT_PLAN_CREATED_AT = "2026-08-13T10:00:00.000Z";

export const VERDICT_TASK_HELDOUT_REVIEW_REF = Object.freeze({
  id: "swarmalpha.review.v6-verdict-task-heldout-replication",
  version: "1.0.0",
});

/** Human-accepted leakage groups (design §3.2) — task-heldout boundary only. */
export const VERDICT_TASK_HELDOUT_LEAKAGE_GROUPS: ReadonlyArray<{ taskId: number; leakageGroup: string }> = Object.freeze([
  { taskId: 5, leakageGroup: "hb-v6r1:academic-leadership-selection" },
  { taskId: 7, leakageGroup: "hb-v6r1:requirements-proposal-evaluation" },
  { taskId: 14, leakageGroup: "hb-v6r1:everyday-constraint-choice" },
  { taskId: 21, leakageGroup: "hb-v6r1:emergency-transport-routing" },
  { taskId: 57, leakageGroup: "hb-v6r1:archaeological-site-preservation" },
  { taskId: 61, leakageGroup: "hb-v6r1:infrastructure-fault-diagnosis" },
  { taskId: 64, leakageGroup: "hb-v6r1:public-health-causal-diagnosis" },
  { taskId: 65, leakageGroup: "hb-v6r1:medical-delivery-location-trace" },
]);

export const VERDICT_TASK_HELDOUT_OUTPUT_DIR = path.resolve(
  process.cwd(),
  "experiments/campaign/pilot_output/v6-verdict-task-heldout-replication-v1-20260813",
);
export const VERDICT_TASK_HELDOUT_PLAN_PATH = path.resolve(
  process.cwd(),
  "experiments/campaign/v6/v6_verdict_task_heldout_replication_v1.plan.json",
);
export const VERDICT_TASK_HELDOUT_MANIFEST_PATH = path.resolve(
  process.cwd(),
  "experiments/campaign/v6/v6_verdict_task_heldout_replication_v1.manifest.json",
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

export interface VerdictTaskHeldoutManifestV1 {
  experimentRef: { id: string; version: string };
  reviewProtocolRef: { id: string; version: string };
  reviewedAt: string;
  planCreatedAt: string;
  taskLeakageGroups: ReadonlyArray<{ taskId: number; leakageGroup: string }>;
  scopeNote: string;
  contentHash: string;
}

export function buildVerdictTaskHeldoutManifestV1(): VerdictTaskHeldoutManifestV1 {
  const body = {
    experimentRef: { ...VERDICT_TASK_HELDOUT_EXPERIMENT_REF },
    reviewProtocolRef: { ...VERDICT_TASK_HELDOUT_REVIEW_REF },
    reviewedAt: VERDICT_TASK_HELDOUT_REVIEWED_AT,
    planCreatedAt: VERDICT_TASK_HELDOUT_PLAN_CREATED_AT,
    taskLeakageGroups: VERDICT_TASK_HELDOUT_LEAKAGE_GROUPS,
    scopeNote: "task-heldout replication boundary only; not confirmatory task-bank admission; not wired into production",
  };
  return { ...body, contentHash: hashPlan(body) };
}

export function ensureTaskHeldoutManifestV1(): { wrote: boolean; contentHash: string } {
  const manifest = buildVerdictTaskHeldoutManifestV1();
  if (fs.existsSync(VERDICT_TASK_HELDOUT_MANIFEST_PATH)) {
    const existing = JSON.parse(fs.readFileSync(VERDICT_TASK_HELDOUT_MANIFEST_PATH, "utf8")) as VerdictTaskHeldoutManifestV1;
    if (existing.contentHash !== manifest.contentHash) {
      throw new Error("task-heldout manifest no-replace conflict");
    }
    return { wrote: false, contentHash: manifest.contentHash };
  }
  fs.mkdirSync(path.dirname(VERDICT_TASK_HELDOUT_MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(VERDICT_TASK_HELDOUT_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return { wrote: true, contentHash: manifest.contentHash };
}

/** Frozen before observing any held-out outcome. */
export function buildVerdictTaskHeldoutReplicationPlan(): VerdictExploratoryPlan {
  const original = buildVerdictExploratoryPlan();
  const tasks = VERDICT_TASK_HELDOUT_TASK_IDS.map(taskId => {
    const fixture = createV6HiddenBenchSmokeFixtureV1({
      sourceTaskId: taskId,
      profile: VERDICT_EXPLORATORY_PROFILE,
    });
    const budget = plannedBudget(fixture.task.agents.length);
    const runs: VerdictExploratoryRunPlan[] = Array.from({ length: VERDICT_TASK_HELDOUT_REPLICATE_COUNT }, (_, index) => {
      const replicate = index + 1;
      const runId = `run:v6-verdict-task-heldout-replication-v1:task-${taskId}:G:r${replicate}`;
      return {
        runId,
        taskId,
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
    const thresholdPolicy = (fixture.rule.config as { certaintyThresholdPolicy?: { id: string; version: string } })
      .certaintyThresholdPolicy;
    if (!thresholdPolicy) throw new Error(`task ${taskId} rule config lacks certaintyThresholdPolicy`);
    return {
      taskId,
      taskDefinitionHash: computeV6TaskDefinitionHashV1(fixture.task, fixture.taskAdapter),
      studyRef: { id: fixture.study.id, version: fixture.study.version },
      thresholdContract: { id: thresholdPolicy.id, version: thresholdPolicy.version, hash: hashPlan(thresholdPolicy) },
      runs,
    };
  });
  const allRuns = tasks.flatMap(task => task.runs);
  const body: VerdictExploratoryPlanBody = {
    experimentRef: { ...VERDICT_TASK_HELDOUT_EXPERIMENT_REF },
    profile: VERDICT_EXPLORATORY_PROFILE,
    taskIds: [...VERDICT_TASK_HELDOUT_TASK_IDS],
    bReplicateCount: 0,
    gReplicateCount: VERDICT_TASK_HELDOUT_REPLICATE_COUNT,
    certaintyThreshold: original.certaintyThreshold,
    stage2Allocation: { ...VERDICT_EXPLORATORY_STAGE2 },
    verificationResponseContract: original.verificationResponseContract,
    providerModelRef: { ...original.providerModelRef },
    providerInvocationConfigHash: original.providerInvocationConfigHash,
    maxProviderCalls: VERDICT_TASK_HELDOUT_MAX_PROVIDER_CALLS,
    maxTotalTokens: VERDICT_TASK_HELDOUT_MAX_TOTAL_TOKENS,
    eligibleEventMasterSeed: V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED,
    tasks,
    totalRuns: allRuns.length,
    totalPlannedProviderCalls: allRuns.reduce((sum, run) => sum + run.plannedProviderCalls, 0),
    totalEstimatedTokens: allRuns.reduce((sum, run) => sum + run.estimatedTokens, 0),
    analysisContract: { ...VERDICT_EXPLORATORY_ANALYSIS_CONTRACT },
    createdAt: VERDICT_TASK_HELDOUT_PLAN_CREATED_AT,
  };
  return { ...body, contentHash: hashPlan(body) };
}

function ensurePlan(plan: VerdictExploratoryPlan): void {
  if (fs.existsSync(VERDICT_TASK_HELDOUT_PLAN_PATH)) {
    const existing = JSON.parse(fs.readFileSync(VERDICT_TASK_HELDOUT_PLAN_PATH, "utf8")) as VerdictExploratoryPlan;
    const { contentHash, ...existingBody } = existing;
    if (contentHash !== plan.contentHash || hashPlan(existingBody) !== contentHash) {
      throw new Error("task-heldout-plan-no-replace-conflict");
    }
    return;
  }
  fs.mkdirSync(path.dirname(VERDICT_TASK_HELDOUT_PLAN_PATH), { recursive: true });
  fs.writeFileSync(VERDICT_TASK_HELDOUT_PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
}

function runPlan(): number {
  const manifest = ensureTaskHeldoutManifestV1();
  const plan = buildVerdictTaskHeldoutReplicationPlan();
  ensurePlan(plan);
  const blockers = preflightIncompleteRuns(VERDICT_TASK_HELDOUT_OUTPUT_DIR, plan.tasks.flatMap(task => task.runs));
  if (blockers.length > 0) throw new Error(blockers.join(";"));
  console.log(JSON.stringify({
    mode: "plan",
    contentHash: plan.contentHash,
    manifestContentHash: manifest.contentHash,
    taskIds: plan.taskIds,
    runs: plan.totalRuns,
    plannedCalls: plan.totalPlannedProviderCalls,
    maxCalls: plan.maxProviderCalls,
    estimatedTokens: plan.totalEstimatedTokens,
    outputDir: VERDICT_TASK_HELDOUT_OUTPUT_DIR,
    claims: ["task-heldout replication exploratory eligible-event effect only"],
    forbidden: ["confirmatory", "general efficacy", "detector validity", "latent belief", "production-ready", "AAMAS-ready"],
  }, null, 2));
  return 0;
}

async function runExecute(): Promise<number> {
  const plan = buildVerdictTaskHeldoutReplicationPlan();
  ensurePlan(plan);
  const blockers = preflightIncompleteRuns(VERDICT_TASK_HELDOUT_OUTPUT_DIR, plan.tasks.flatMap(task => task.runs));
  if (blockers.length > 0) throw new Error(blockers.join(";"));
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error("deepseek_api_key_unavailable");
    return 3;
  }
  const { results, budget } = await runVerdictExploratoryExecute({
    plan,
    invoker: createDeepSeekSingleAttemptInvoker(),
    outputDir: VERDICT_TASK_HELDOUT_OUTPUT_DIR,
  });
  console.log(JSON.stringify({ runs: results.length, calls: budget.callCount, tokens: budget.tokenCount }, null, 2));
  return 0;
}

export function runTaskHeldoutReplayV1(): { verified: number; expected: number } {
  const plan = buildVerdictTaskHeldoutReplicationPlan();
  ensurePlan(plan);
  let verified = 0;
  for (const taskPlan of plan.tasks) {
    const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: taskPlan.taskId, profile: VERDICT_EXPLORATORY_PROFILE });
    for (const run of taskPlan.runs) {
      const file = resolveV6AuditableRawRunPath(VERDICT_TASK_HELDOUT_OUTPUT_DIR, run.runId);
      if (!fs.existsSync(file)) throw new Error(`task-heldout-missing-artifact:${run.runId}`);
      const artifact = JSON.parse(fs.readFileSync(file, "utf8"));
      const replay = verifyRawRunData(file, artifact, { governanceRules: [fixture.rule] });
      if (replay.runIssues.length > 0 || replay.governanceAuditStatus !== "sealed_decision_replay_verified") {
        throw new Error(`task-heldout-replay-failed:${run.runId}:${replay.runIssues.map(issue => issue.code).join(",")}`);
      }
      verified += 1;
    }
  }
  return { verified, expected: plan.totalRuns };
}

async function main(): Promise<number> {
  if (process.argv.includes("--plan")) return runPlan();
  if (process.argv.includes("--execute")) return runExecute();
  if (process.argv.includes("--replay")) {
    const result = runTaskHeldoutReplayV1();
    console.log(JSON.stringify({ mode: "replay", verified: result.verified, expected: result.expected }, null, 2));
    return result.verified === result.expected ? 0 : 4;
  }
  console.error("usage: --plan | --execute | --replay");
  return 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 4;
  });
}
