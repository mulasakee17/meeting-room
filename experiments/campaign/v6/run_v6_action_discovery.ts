/**
 * Post-round-1 randomized action discovery runner.
 *
 * 16 fresh task clusters x 8 G replicates = 128 planned runs. Every G run with
 * at least one valid round-1 report enters the existing eligible-event
 * assignment (apply .50 / holdout .25 / sham .25) via an experiment-only
 * always-eligible rule; no certainty threshold selects the discovery sample.
 *
 * Modes: --plan (zero provider), --execute (implemented entry only — not to be
 * run by this agent), --replay (zero provider). The plan is no-replace and is
 * generated only after exactly 16 unique semantic leakage groups are externally
 * marked accepted (fail-closed otherwise).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { verifyRawRunData } from "../replayVerifier";
import { resolveV6AuditableRawRunPath, runV6ProductionVerticalSlice } from "./productionVerticalSlice";
import { createDeepSeekSingleAttemptInvoker } from "./deepseekSingleAttemptInvoker";
import { createV6Adapters, type SingleAttemptTextInvoker } from "./providerAdapters";
import { primarySeedForProtocol, V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED } from "./v6BinarySmokeFixture";
import {
  ACTION_DISCOVERY_PROFILE,
  createActionDiscoveryFixtureV1,
} from "./v6ActionDiscoveryFixtureV1";
import { VERDICT_EXPLORATORY_ANALYSIS_CONTRACT } from "./run_v6_verdict_exploratory";
import {
  createMeteredSingleAttemptInvoker,
  preflightIncompleteRuns,
  V6ProviderCallBudget,
} from "./run_v6_smoke";
import type { VerdictExploratoryPlan, VerdictExploratoryRunPlan } from "./run_v6_verdict_exploratory";

export const ACTION_DISCOVERY_EXPERIMENT_REF = Object.freeze({
  id: "swarmalpha.experiment.v6-action-discovery-v1",
  version: "1.0.0",
});

/** Frozen task set: 8 already-reviewed + 8 additional candidates (packet-gated). */
export const ACTION_DISCOVERY_TASK_ORDER: readonly number[] = [5, 7, 14, 21, 57, 61, 64, 65, 8, 13, 18, 28, 33, 39, 45, 55];

export const ACTION_DISCOVERY_REPLICATE_COUNT = 8;
export const ACTION_DISCOVERY_MAX_PROVIDER_CALLS = 1_600;
export const ACTION_DISCOVERY_MAX_TOTAL_TOKENS = 2_000_000;
export const ACTION_DISCOVERY_REVIEWED_AT = "2026-08-13T08:00:00.000Z";
export const ACTION_DISCOVERY_PLAN_CREATED_AT = "2026-08-13T10:00:00.000Z";
export const ACTION_DISCOVERY_REVIEW_REF = Object.freeze({
  id: "swarmalpha.review.v6-action-discovery",
  version: "1.0.0",
});

export const ACTION_DISCOVERY_OUTPUT_DIR = path.resolve(
  process.cwd(),
  "experiments/campaign/pilot_output/v6-action-discovery-v1-20260813",
);
export const ACTION_DISCOVERY_PLAN_PATH = path.resolve(
  process.cwd(),
  "experiments/campaign/v6/v6_action_discovery_v1.plan.json",
);

export const ACTION_DISCOVERY_SUGGESTED_GROUPS: ReadonlyArray<{ taskId: number; leakageGroup: string }> = Object.freeze([
  { taskId: 5, leakageGroup: "hb-v6r1:academic-leadership-selection" },
  { taskId: 7, leakageGroup: "hb-v6r1:requirements-proposal-evaluation" },
  { taskId: 14, leakageGroup: "hb-v6r1:everyday-constraint-choice" },
  { taskId: 21, leakageGroup: "hb-v6r1:emergency-transport-routing" },
  { taskId: 57, leakageGroup: "hb-v6r1:archaeological-site-preservation" },
  { taskId: 61, leakageGroup: "hb-v6r1:infrastructure-fault-diagnosis" },
  { taskId: 64, leakageGroup: "hb-v6r1:public-health-causal-diagnosis" },
  { taskId: 65, leakageGroup: "hb-v6r1:medical-delivery-location-trace" },
  { taskId: 8, leakageGroup: "hb-v6r1:hidden-profile-discussion-integration" },
  { taskId: 13, leakageGroup: "hb-v6r1:laboratory-theft-deduction" },
  { taskId: 18, leakageGroup: "hb-v6r1:expedition-basecamp-selection" },
  { taskId: 28, leakageGroup: "hb-v6r1:lost-researcher-rescue-coordination" },
  { taskId: 33, leakageGroup: "hb-v6r1:critical-sample-transfer" },
  { taskId: 39, leakageGroup: "hb-v6r1:emergency-aircraft-landing-site" },
  { taskId: 45, leakageGroup: "hb-v6r1:post-seismic-lab-selection" },
  { taskId: 55, leakageGroup: "hb-v6r1:emergency-drone-delivery" },
]);

export interface ActionDiscoveryReviewDecisionV1 {
  taskId: number;
  leakageGroup: string;
  accepted: true;
  reviewedAt: string;
}

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

/** Pure 16x8 run-id scheme (used for identity tests independent of the cap check). */
export function actionDiscoveryRunIdsV1(): string[] {
  const ids: string[] = [];
  for (const taskId of ACTION_DISCOVERY_TASK_ORDER) {
    for (let replicate = 1; replicate <= ACTION_DISCOVERY_REPLICATE_COUNT; replicate++) {
      ids.push(`run:v6-action-discovery-v1:task-${taskId}:G:r${replicate}`);
    }
  }
  return ids;
}

/**
 * Build the frozen plan. Fails closed unless exactly 16 unique semantic leakage
 * groups are externally marked accepted and each accepted group maps to a task
 * in the frozen discovery order with the suggested group id.
 */
export function buildActionDiscoveryPlanV1(
  reviewDecisions: ReadonlyArray<ActionDiscoveryReviewDecisionV1>,
): VerdictExploratoryPlan {
  const accepted = new Set<string>();
  for (const decision of reviewDecisions) {
    if (decision.accepted !== true) throw new Error(`discovery review not accepted for task ${decision.taskId}`);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(decision.reviewedAt)) {
      throw new Error(`discovery reviewedAt must be canonical for task ${decision.taskId}`);
    }
    accepted.add(decision.leakageGroup);
  }
  if (accepted.size !== ACTION_DISCOVERY_TASK_ORDER.length) {
    throw new Error(`discovery plan requires exactly ${ACTION_DISCOVERY_TASK_ORDER.length} accepted leakage groups; got ${accepted.size}`);
  }
  const suggested = new Map(ACTION_DISCOVERY_SUGGESTED_GROUPS.map(group => [group.taskId, group.leakageGroup]));
  const tasks = ACTION_DISCOVERY_TASK_ORDER.map(taskId => {
    const expectedGroup = suggested.get(taskId);
    const decision = reviewDecisions.find(item => item.taskId === taskId);
    if (!decision || !expectedGroup || decision.leakageGroup !== expectedGroup) {
      throw new Error(`discovery review mismatch for task ${taskId}`);
    }
    const fixture = createActionDiscoveryFixtureV1(taskId);
    const budget = plannedBudget(fixture.base.task.agents.length);
    const runs: VerdictExploratoryRunPlan[] = Array.from({ length: ACTION_DISCOVERY_REPLICATE_COUNT }, (_, index) => {
      const replicate = index + 1;
      const runId = `run:v6-action-discovery-v1:task-${taskId}:G:r${replicate}`;
      return {
        runId,
        taskId,
        protocol: "epistemic_governance_v1",
        replicate,
        primaryMasterSeed: primarySeedForProtocol(runId, fixture.study, fixture.base.design, "epistemic_governance_v1", fixture.base.stratum),
        eligibleEventMasterSeed: V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED,
        monitoringMasterSeed: replicate - 1,
        plannedProviderCalls: budget.calls,
        estimatedTokens: budget.tokens,
      };
    });
    return {
      taskId,
      taskDefinitionHash: hashPlan({ taskId, expectedGroup }),
      studyRef: { id: fixture.study.id, version: fixture.study.version },
      thresholdContract: { id: ACTION_DISCOVERY_EXPERIMENT_REF.id, version: ACTION_DISCOVERY_EXPERIMENT_REF.version, hash: hashPlan(expectedGroup) },
      runs,
    };
  });
  const allRuns = tasks.flatMap(task => task.runs);
  const body = {
    experimentRef: { ...ACTION_DISCOVERY_EXPERIMENT_REF },
    profile: ACTION_DISCOVERY_PROFILE,
    taskIds: [...ACTION_DISCOVERY_TASK_ORDER],
    bReplicateCount: 0,
    gReplicateCount: ACTION_DISCOVERY_REPLICATE_COUNT,
    certaintyThreshold: 0.7,
    stage2Allocation: { apply: 0.5, sham: 0.25, holdout: 0.25 },
    verificationResponseContract: "verdict_json_v2" as const,
    providerModelRef: { id: "deepseek:deepseek-chat", version: "1.0.0" },
    providerInvocationConfigHash: hashPlan({ note: "frozen in the V2 fixture", model: "deepseek:deepseek-chat" }),
    maxProviderCalls: ACTION_DISCOVERY_MAX_PROVIDER_CALLS,
    maxTotalTokens: ACTION_DISCOVERY_MAX_TOTAL_TOKENS,
    eligibleEventMasterSeed: V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED,
    tasks,
    totalRuns: allRuns.length,
    totalPlannedProviderCalls: allRuns.reduce((sum, run) => sum + run.plannedProviderCalls, 0),
    totalEstimatedTokens: allRuns.reduce((sum, run) => sum + run.estimatedTokens, 0),
    analysisContract: { ...VERDICT_EXPLORATORY_ANALYSIS_CONTRACT },
    createdAt: ACTION_DISCOVERY_PLAN_CREATED_AT,
  };
  if (body.totalPlannedProviderCalls > body.maxProviderCalls) {
    // Frozen safety ceiling: do not expand. Return the exact shortfall to Codex.
    throw new Error(
      `action-discovery planned provider calls ${body.totalPlannedProviderCalls} exceed the frozen cap ${body.maxProviderCalls}; `
      + `exact calculation: ${JSON.stringify(allRuns.reduce((acc, run) => {
        acc[`task:${run.taskId}`] = (acc[`task:${run.taskId}`] ?? 0) + run.plannedProviderCalls;
        return acc;
      }, {} as Record<string, number>))}`,
    );
  }
  return { ...body, contentHash: hashPlan(body) };
}

function ensurePlan(plan: VerdictExploratoryPlan): void {
  if (fs.existsSync(ACTION_DISCOVERY_PLAN_PATH)) {
    const existing = JSON.parse(fs.readFileSync(ACTION_DISCOVERY_PLAN_PATH, "utf8")) as VerdictExploratoryPlan;
    const { contentHash, ...existingBody } = existing;
    if (contentHash !== plan.contentHash || hashPlan(existingBody) !== contentHash) {
      throw new Error("action-discovery-plan-no-replace-conflict");
    }
    return;
  }
  fs.mkdirSync(path.dirname(ACTION_DISCOVERY_PLAN_PATH), { recursive: true });
  fs.writeFileSync(ACTION_DISCOVERY_PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
}

function loadDecisions(p: string): ActionDiscoveryReviewDecisionV1[] {
  const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as ActionDiscoveryReviewDecisionV1[];
  if (!Array.isArray(parsed) || parsed.some(decision =>
    typeof decision !== "object" || decision.accepted !== true
    || typeof decision.taskId !== "number"
    || typeof decision.leakageGroup !== "string"
    || typeof decision.reviewedAt !== "string")) {
    throw new Error("discovery review decisions must be [{taskId, leakageGroup, accepted:true, reviewedAt}]");
  }
  return parsed;
}

async function runExecuteImpl(plan: VerdictExploratoryPlan, invoker: SingleAttemptTextInvoker): Promise<{ calls: number; tokens: number }> {
  const budget = new V6ProviderCallBudget(plan.maxProviderCalls, plan.maxTotalTokens);
  const metered = createMeteredSingleAttemptInvoker(invoker, budget);
  for (const taskPlan of plan.tasks) {
    const fixture = createActionDiscoveryFixtureV1(taskPlan.taskId);
    const adapters = createV6Adapters({
      discussionContract: fixture.base.discussionContract,
      verificationContract: fixture.base.verificationContract,
      finalContract: fixture.base.finalContract,
      invoker: metered,
    });
    for (const run of taskPlan.runs) {
      const reused = fs.existsSync(resolveV6AuditableRawRunPath(ACTION_DISCOVERY_OUTPUT_DIR, run.runId));
      budget.assertCanStartRun(reused ? 0 : run.plannedProviderCalls, reused ? 0 : run.estimatedTokens);
      const result = await runV6ProductionVerticalSlice({
        outputDir: ACTION_DISCOVERY_OUTPUT_DIR,
        runId: run.runId,
        experimentId: `experiment:${ACTION_DISCOVERY_EXPERIMENT_REF.id}`,
        seed: 17,
        runIndex: plan.tasks.indexOf(taskPlan) * ACTION_DISCOVERY_REPLICATE_COUNT + run.replicate - 1,
        study: fixture.study,
        registry: fixture.base.registry,
        stratum: fixture.base.stratum,
        primaryMasterSeed: run.primaryMasterSeed,
        eligibleEventMasterSeed: run.eligibleEventMasterSeed,
        monitoringMasterSeed: run.monitoringMasterSeed,
        task: fixture.base.task,
        taskAuthority: {
          adapterRef: fixture.base.taskAdapter.adapterRef,
          taskSchemaRef: fixture.base.taskAdapter.taskSchemaRef,
          resolution: fixture.base.taskAdapter.resolution,
        },
        monitoringDesign: fixture.base.monitoringDesign,
        discussionAdapter: adapters.discussionAdapter,
        finalElicitationAdapter: adapters.finalElicitationAdapter,
        governanceRule: fixture.rule,
        interventionContracts: fixture.interventionContracts,
        verificationAdapter: adapters.verificationAdapter,
      });
      if (!reused) {
        const bytes = fs.readFileSync(result.absolutePath);
        void bytes;
      }
    }
  }
  return { calls: budget.callCount, tokens: budget.tokenCount };
}

export function buildActionDiscoveryReplayV1(): { verified: number; expected: number } {
  const plan = JSON.parse(fs.readFileSync(ACTION_DISCOVERY_PLAN_PATH, "utf8")) as VerdictExploratoryPlan;
  let verified = 0;
  for (const taskPlan of plan.tasks) {
    const fixture = createActionDiscoveryFixtureV1(taskPlan.taskId);
    for (const run of taskPlan.runs) {
      const file = resolveV6AuditableRawRunPath(ACTION_DISCOVERY_OUTPUT_DIR, run.runId);
      if (!fs.existsSync(file)) throw new Error(`action-discovery-missing-artifact:${run.runId}`);
      const artifact = JSON.parse(fs.readFileSync(file, "utf8"));
      const replay = verifyRawRunData(file, artifact, { governanceRules: [fixture.rule] });
      if (replay.runIssues.length > 0 || replay.governanceAuditStatus !== "sealed_decision_replay_verified") {
        throw new Error(`action-discovery-replay-failed:${run.runId}:${replay.runIssues.map(issue => issue.code).join(",")}`);
      }
      verified += 1;
    }
  }
  return { verified, expected: plan.totalRuns };
}

function runPlan(): number {
  console.log(JSON.stringify({
    mode: "plan",
    state: "review_gated",
    experimentRef: ACTION_DISCOVERY_EXPERIMENT_REF,
    taskOrder: ACTION_DISCOVERY_TASK_ORDER,
    suggestedGroups: ACTION_DISCOVERY_SUGGESTED_GROUPS,
    replicates: ACTION_DISCOVERY_REPLICATE_COUNT,
    maxCalls: ACTION_DISCOVERY_MAX_PROVIDER_CALLS,
    maxTokens: ACTION_DISCOVERY_MAX_TOTAL_TOKENS,
    outputDir: ACTION_DISCOVERY_OUTPUT_DIR,
    claims: ["always-eligible randomized action discovery; no certainty-selected eligibility"],
  }, null, 2));
  return 0;
}

async function runExecute(): Promise<number> {
  const decisionsPath = process.argv[process.argv.indexOf("--review-decisions") + 1];
  if (!decisionsPath) { console.error("--execute requires --review-decisions <file.json>"); return 2; }
  const decisions = loadDecisions(decisionsPath);
  const plan = buildActionDiscoveryPlanV1(decisions);
  ensurePlan(plan);
  const blockers = preflightIncompleteRuns(ACTION_DISCOVERY_OUTPUT_DIR, plan.tasks.flatMap(task => task.runs));
  if (blockers.length > 0) throw new Error(blockers.join(";"));
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  if (!process.env.DEEPSEEK_API_KEY) { console.error("deepseek_api_key_unavailable"); return 3; }
  const { calls, tokens } = await runExecuteImpl(plan, createDeepSeekSingleAttemptInvoker());
  console.log(JSON.stringify({ runs: plan.totalRuns, calls, tokens }, null, 2));
  return 0;
}

async function main(): Promise<number> {
  if (process.argv.includes("--plan")) return runPlan();
  if (process.argv.includes("--execute")) return runExecute();
  if (process.argv.includes("--replay")) {
    const result = buildActionDiscoveryReplayV1();
    console.log(JSON.stringify({ mode: "replay", verified: result.verified, expected: result.expected }, null, 2));
    return result.verified === result.expected ? 0 : 4;
  }
  console.error("usage: --plan | --execute --review-decisions <file.json> | --replay");
  return 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 4;
  });
}
