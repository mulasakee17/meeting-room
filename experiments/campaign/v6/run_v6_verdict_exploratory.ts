/**
 * v6 Verification Verdict V2 — medium-scale exploratory batch runner.
 *
 * Frozen by Codex (no adaptation to mid-run results):
 *   - 20 HiddenBench tasks (fixed order), dev tasks {1,4,8,9,17} excluded.
 *   - Per task: B-arm (explicit_belief_v1) x2 replicates, G-arm
 *     (epistemic_governance_v1) x2 replicates, interleaved B-r1 -> G-r1 ->
 *     B-r2 -> G-r2; task order fixed.
 *   - profile = mechanism-verdict-v2-v1, certainty threshold 0.7,
 *     stage-2 allocation apply 0.50 / sham 0.25 / holdout 0.25.
 *   - Stage-1 primary seed via primarySeedForProtocol per runId;
 *     eligibleEventMasterSeed = frozen V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED;
 *     monitoringMasterSeed r1=0, r2=1.
 *   - Hard budget: maxProviderCalls 1200, maxTotalTokens 1,500,000.
 *   - Sequential, single-attempt, no retry, no re-draw, no re-run.
 *
 * Modes:
 *   --plan    build the frozen no-replace plan JSON and print the dry-run plan
 *             (no provider call, no credential read).
 *   --execute real provider execution (loads DEEPSEEK_API_KEY from .env.local).
 *   --replay  load every raw-run artifact and run verifyRawRunData + the frozen
 *             V2 safety checks (apply / sham / holdout), zero provider calls.
 *
 * Stop rules: any structural slice error, budget halt, or >=5 runs that cannot
 * complete stops the batch; all produced artifacts are kept and never deleted.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  ProviderExecutionHaltError,
  validateGovernanceStudyContract,
  validatePrimaryArmExecutionRegistryV1,
} from "../../../src/lib/experimentation";
import {
  resolveV6AuditableRawRunPath,
  runV6ProductionVerticalSlice,
  type V6InteractionProtocol,
} from "./productionVerticalSlice";
import { createV6Adapters, type SingleAttemptTextInvoker } from "./providerAdapters";
import { createDeepSeekSingleAttemptInvoker } from "./deepseekSingleAttemptInvoker";
import {
  createMeteredSingleAttemptInvoker,
  preflightIncompleteRuns,
  V6ProviderCallBudget,
} from "./run_v6_smoke";
import {
  primarySeedForProtocol,
  V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED,
  type V6SmokeFixtureV1,
} from "./v6BinarySmokeFixture";
import { createV6HiddenBenchSmokeFixtureV1 } from "./v6HiddenBenchSmokeFixture";
import { computeV6TaskDefinitionHashV1 } from "./v6TaskManifest";
import { verifyRawRunData } from "../replayVerifier";
import dotenv from "dotenv";

// ---------------------------------------------------------------------------
// Frozen constants
// ---------------------------------------------------------------------------

export const VERDICT_EXPLORATORY_EXPERIMENT_REF = Object.freeze({
  id: "swarmalpha.experiment.v6-verdict-exploratory-v1",
  version: "1.0.0",
});

/** Frozen task order; selected by SHA-256 of `swarmalpha-v2-exploratory-v1:${taskId}` within task strata. */
export const VERDICT_EXPLORATORY_TASK_IDS: readonly number[] = [
  43, 41, 10, 36, 46,
  62, 59, 56, 2, 42,
  44, 48, 60, 26, 58,
  6, 30, 34, 25, 53,
];

export const VERDICT_EXPLORATORY_PROFILE = "mechanism-verdict-v2-v1" as const;
export const VERDICT_EXPLORATORY_CERTAINTY_THRESHOLD = 0.7;
export const VERDICT_EXPLORATORY_STAGE2 = Object.freeze({ apply: 0.5, sham: 0.25, holdout: 0.25 });
export const VERDICT_EXPLORATORY_MAX_PROVIDER_CALLS = 1200;
export const VERDICT_EXPLORATORY_MAX_TOTAL_TOKENS = 1_500_000;
export const VERDICT_EXPLORATORY_PLAN_CREATED_AT = "2026-08-12T00:00:00.000Z";
export const VERDICT_EXPLORATORY_ANALYSIS_CONTRACT = Object.freeze({
  id: "swarmalpha.analysis.v6-verdict-exploratory-v1",
  version: "1.0.0",
  rqM: "B-arm round-1 explicit belief reports only: coverage, exact-repeat stability (base-2 JSD / argmax / tie-aware agreement), categorical-K calibration & predictive characterization (multiclass Brier, certainty>=0.7 flag, P(error|flag), Brier gap, precision/recall/specificity, reliability/ECE secondary)",
  rqG: "eligible randomized G events only: primary mean(final pooled Brier | apply) - mean(final pooled Brier | holdout); secondary apply-sham, sham-holdout, accuracy, token cost, invalid/unavailable rate, verdict distribution; 10,000 task-cluster percentile bootstrap 95% interval; DEFER_INSUFFICIENT if any arm n<5 or task clusters<5 or bootstrap valid fraction<0.95",
  bootstrapCount: 10_000,
  bootstrapUnit: "task_cluster",
  ci: 0.95,
  ittMissingness: "reference_distribution_for_non_answered",
});

export const VERDICT_EXPLORATORY_OUTPUT_DIR = path.resolve(
  process.cwd(),
  "experiments/campaign/pilot_output/v6-verdict-exploratory-v1-20260812",
);
export const VERDICT_EXPLORATORY_PLAN_PATH = path.resolve(
  process.cwd(),
  "experiments/campaign/v6/v6_verdict_exploratory_plan_v1.json",
);

const PROVIDER_MODEL_REF = Object.freeze({ id: "deepseek:deepseek-chat", version: "1.0.0" });

// ---------------------------------------------------------------------------
// Canonical hashing helpers (JSON-only, deterministic)
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function canonicalize(value: unknown, field = "value", ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${field} must contain only finite numbers`);
    return value;
  }
  if (typeof value !== "object") throw new Error(`${field} must contain only JSON data`);
  if (ancestors.has(value)) throw new Error(`${field} must not contain cycles`);
  const next = new Set(ancestors);
  next.add(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new Error(`${field} must not be sparse`);
    return value.map((entry, index) => canonicalize(entry, `${field}[${index}]`, next));
  }
  if (!isPlainObject(value)) throw new Error(`${field} must contain only plain objects`);
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key], `${field}.${key}`, next)]));
}
function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
function hashCanonical(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value), "utf8").digest("hex")}`;
}

// ---------------------------------------------------------------------------
// Plan types
// ---------------------------------------------------------------------------

export interface VerdictExploratoryRunPlan {
  runId: string;
  taskId: number;
  protocol: V6InteractionProtocol;
  /** Replicate index is frozen by each plan; v1 used 1..2, continuations may extend it. */
  replicate: number;
  primaryMasterSeed: number;
  eligibleEventMasterSeed: number;
  monitoringMasterSeed: number;
  plannedProviderCalls: number;
  estimatedTokens: number;
}
export interface VerdictExploratoryTaskPlan {
  taskId: number;
  taskDefinitionHash: string;
  studyRef: { id: string; version: string };
  thresholdContract: { id: string; version: string; hash: string };
  runs: VerdictExploratoryRunPlan[];
}
export interface VerdictExploratoryPlanBody {
  experimentRef: { id: string; version: string };
  profile: typeof VERDICT_EXPLORATORY_PROFILE;
  taskIds: number[];
  bReplicateCount: number;
  gReplicateCount: number;
  certaintyThreshold: number;
  stage2Allocation: { apply: number; sham: number; holdout: number };
  verificationResponseContract: "verdict_json_v2";
  providerModelRef: { id: string; version: string };
  providerInvocationConfigHash: string;
  maxProviderCalls: number;
  maxTotalTokens: number;
  eligibleEventMasterSeed: number;
  tasks: VerdictExploratoryTaskPlan[];
  totalRuns: number;
  totalPlannedProviderCalls: number;
  totalEstimatedTokens: number;
  analysisContract: typeof VERDICT_EXPLORATORY_ANALYSIS_CONTRACT;
  createdAt: string;
}
export interface VerdictExploratoryPlan extends VerdictExploratoryPlanBody {
  contentHash: string;
}

function plannedBudgetFor(protocol: V6InteractionProtocol, agentCount: number): { calls: number; tokens: number } {
  const discussionCalls = agentCount * 2;
  const finalCalls = agentCount;
  const verificationCalls = protocol === "epistemic_governance_v1" ? 1 : 0;
  const tokens = discussionCalls * 15 + finalCalls * 15 + verificationCalls * 12;
  return { calls: discussionCalls + finalCalls + verificationCalls, tokens };
}

function interleavedRunPlan(
  taskId: number,
  fixture: V6SmokeFixtureV1,
  runIdPrefix: (protocol: V6InteractionProtocol, rep: 1 | 2) => string,
): VerdictExploratoryRunPlan[] {
  const order: Array<{ protocol: V6InteractionProtocol; rep: 1 | 2 }> = [
    { protocol: "explicit_belief_v1", rep: 1 },
    { protocol: "epistemic_governance_v1", rep: 1 },
    { protocol: "explicit_belief_v1", rep: 2 },
    { protocol: "epistemic_governance_v1", rep: 2 },
  ];
  return order.map(({ protocol, rep }) => {
    const runId = runIdPrefix(protocol, rep);
    const budget = plannedBudgetFor(protocol, fixture.task.agents.length);
    return {
      runId,
      taskId,
      protocol,
      replicate: rep,
      primaryMasterSeed: primarySeedForProtocol(runId, fixture.study, fixture.design, protocol, fixture.stratum),
      eligibleEventMasterSeed: V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED,
      monitoringMasterSeed: rep - 1,
      plannedProviderCalls: budget.calls,
      estimatedTokens: budget.tokens,
    };
  });
}

/** Deterministic, credential-free plan builder (no provider call). */
export function buildVerdictExploratoryPlan(): VerdictExploratoryPlan {
  const body: VerdictExploratoryPlanBody = {
    experimentRef: { id: VERDICT_EXPLORATORY_EXPERIMENT_REF.id, version: VERDICT_EXPLORATORY_EXPERIMENT_REF.version },
    profile: VERDICT_EXPLORATORY_PROFILE,
    taskIds: [...VERDICT_EXPLORATORY_TASK_IDS],
    bReplicateCount: 2,
    gReplicateCount: 2,
    certaintyThreshold: VERDICT_EXPLORATORY_CERTAINTY_THRESHOLD,
    stage2Allocation: { ...VERDICT_EXPLORATORY_STAGE2 },
    verificationResponseContract: "verdict_json_v2",
    providerModelRef: { ...PROVIDER_MODEL_REF },
    providerInvocationConfigHash: hashCanonical({
      discussion: { temperature: 0, maxTokens: 768 },
      verification: { temperature: 0, maxTokens: 256 },
      final: { temperature: 0, maxTokens: 256 },
    }),
    maxProviderCalls: VERDICT_EXPLORATORY_MAX_PROVIDER_CALLS,
    maxTotalTokens: VERDICT_EXPLORATORY_MAX_TOTAL_TOKENS,
    eligibleEventMasterSeed: V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED,
    tasks: [],
    totalRuns: 0,
    totalPlannedProviderCalls: 0,
    totalEstimatedTokens: 0,
    analysisContract: { ...VERDICT_EXPLORATORY_ANALYSIS_CONTRACT },
    createdAt: VERDICT_EXPLORATORY_PLAN_CREATED_AT,
  };
  let totalCalls = 0;
  let totalTokens = 0;
  let totalRuns = 0;
  for (const taskId of VERDICT_EXPLORATORY_TASK_IDS) {
    const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: taskId, profile: VERDICT_EXPLORATORY_PROFILE });
    const taskDefinitionHash = computeV6TaskDefinitionHashV1(fixture.task, fixture.taskAdapter);
    const thresholdPolicy = (fixture.rule.config as { certaintyThresholdPolicy?: { id: string; version: string } })
      .certaintyThresholdPolicy;
    if (!thresholdPolicy) throw new Error(`task ${taskId} rule config lacks certaintyThresholdPolicy`);
    const runs = interleavedRunPlan(
      taskId,
      fixture,
      (protocol, rep) =>
        `run:v6-verdict-exploratory-v1:task-${taskId}:${protocol === "explicit_belief_v1" ? "B" : "G"}:r${rep}`,
    );
    totalCalls += runs.reduce((sum, run) => sum + run.plannedProviderCalls, 0);
    totalTokens += runs.reduce((sum, run) => sum + run.estimatedTokens, 0);
    totalRuns += runs.length;
    body.tasks.push({
      taskId,
      taskDefinitionHash,
      studyRef: { id: fixture.study.id, version: fixture.study.version },
      thresholdContract: { id: thresholdPolicy.id, version: thresholdPolicy.version, hash: hashCanonical(thresholdPolicy) },
      runs,
    });
  }
  body.totalRuns = totalRuns;
  body.totalPlannedProviderCalls = totalCalls;
  body.totalEstimatedTokens = totalTokens;
  const contentHash = hashCanonical(body);
  return { ...body, contentHash };
}

/** No-replace plan persistence; a different existing plan stops with zero provider calls. */
function ensurePlanFile(plan: VerdictExploratoryPlan): { existed: boolean; written: boolean } {
  if (fs.existsSync(VERDICT_EXPLORATORY_PLAN_PATH)) {
    const existing = JSON.parse(fs.readFileSync(VERDICT_EXPLORATORY_PLAN_PATH, "utf8")) as VerdictExploratoryPlan;
    if (existing.contentHash !== plan.contentHash || stableJson(existing) !== stableJson(plan)) {
      throw new Error("plan_no_replace_conflict: existing plan differs from the frozen plan; provider zero calls");
    }
    return { existed: true, written: false };
  }
  fs.mkdirSync(path.dirname(VERDICT_EXPLORATORY_PLAN_PATH), { recursive: true });
  const temporary = `${VERDICT_EXPLORATORY_PLAN_PATH}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    fs.linkSync(temporary, VERDICT_EXPLORATORY_PLAN_PATH);
    fs.unlinkSync(temporary);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    if (fs.existsSync(VERDICT_EXPLORATORY_PLAN_PATH)) {
      const raced = JSON.parse(fs.readFileSync(VERDICT_EXPLORATORY_PLAN_PATH, "utf8")) as VerdictExploratoryPlan;
      if (raced.contentHash !== plan.contentHash || stableJson(raced) !== stableJson(plan)) {
        throw new Error("plan_no_replace_conflict: raced plan differs from the frozen plan");
      }
      return { existed: true, written: false };
    }
    throw error;
  }
  return { existed: false, written: true };
}

function deterministicV6Clock(startAt: string): () => string {
  const start = Date.parse(startAt);
  if (!Number.isFinite(start) || new Date(start).toISOString() !== startAt) {
    throw new Error("fixture clockStartAt must be a canonical ISO timestamp");
  }
  let tick = 0;
  return () => new Date(start + tick++ * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Dry-run / plan mode
// ---------------------------------------------------------------------------

function printDryRunPlan(plan: VerdictExploratoryPlan): void {
  console.log("=== v6 verdict exploratory dry-run ===");
  console.log(`  experiment: ${plan.experimentRef.id}@${plan.experimentRef.version}`);
  console.log(`  plan contentHash: ${plan.contentHash}`);
  console.log(`  profile: ${plan.profile}; certainty threshold ${plan.certaintyThreshold}`);
  console.log(`  tasks (${plan.taskIds.length}): ${plan.taskIds.join(", ")}`);
  for (const task of plan.tasks) {
    console.log(`  task ${task.taskId}: hash=${task.taskDefinitionHash} study=${task.studyRef.id}@${task.studyRef.version}`);
    for (const run of task.runs) {
      console.log(
        `    ${run.runId} -> ${run.protocol} (primarySeed=${run.primaryMasterSeed}, eventSeed=${run.eligibleEventMasterSeed}, monitoringSeed=${run.monitoringMasterSeed}, up to ${run.plannedProviderCalls} calls, ~${run.estimatedTokens} tokens)`,
      );
    }
  }
  console.log(
    `  total runs: ${plan.totalRuns} (B=${plan.bReplicateCount * plan.taskIds.length}, G=${plan.gReplicateCount * plan.taskIds.length})`,
  );
  console.log(
    `  total planned provider calls: ${plan.totalPlannedProviderCalls} (cap ${plan.maxProviderCalls}); estimated tokens: ${plan.totalEstimatedTokens} (cap ${plan.maxTotalTokens})`,
  );
  console.log(`  output dir: ${VERDICT_EXPLORATORY_OUTPUT_DIR}`);
  if (fs.existsSync(VERDICT_EXPLORATORY_OUTPUT_DIR)) {
    console.error(`  ✗ output root already exists: ${VERDICT_EXPLORATORY_OUTPUT_DIR}`);
  }
}

function runPlanMode(): number {
  const plan = buildVerdictExploratoryPlan();
  const planState = ensurePlanFile(plan);
  printDryRunPlan(plan);
  if (plan.totalRuns !== 80) {
    console.error(`  ✗ expected exactly 80 runs, got ${plan.totalRuns}`);
    return 2;
  }
  if (plan.totalPlannedProviderCalls > plan.maxProviderCalls) {
    console.error(`  ✗ planned calls ${plan.totalPlannedProviderCalls} exceed cap ${plan.maxProviderCalls}`);
    return 2;
  }
  if (plan.totalEstimatedTokens > plan.maxTotalTokens) {
    console.error(`  ✗ estimated tokens ${plan.totalEstimatedTokens} exceed cap ${plan.maxTotalTokens}`);
    return 2;
  }
  if (fs.existsSync(VERDICT_EXPLORATORY_OUTPUT_DIR)) {
    console.error("  ✗ output root must not exist before execution");
    return 2;
  }
  for (const task of plan.tasks) {
    const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: task.taskId, profile: VERDICT_EXPLORATORY_PROFILE });
    validateGovernanceStudyContract(fixture.study);
    validatePrimaryArmExecutionRegistryV1(fixture.registry, fixture.design);
    const order = task.runs.map(run => run.protocol === "explicit_belief_v1" ? `B-r${run.replicate}` : `G-r${run.replicate}`);
    if (stableJson(order) !== stableJson(["B-r1", "G-r1", "B-r2", "G-r2"])) {
      console.error(`  ✗ task ${task.taskId} run order deviates from frozen B-r1 -> G-r1 -> B-r2 -> G-r2`);
      return 2;
    }
  }
  console.log(`  plan file: ${planState.written ? "written (no-replace)" : "already exists (matched, read-only)"} -> ${VERDICT_EXPLORATORY_PLAN_PATH}`);
  return 0;
}

// ---------------------------------------------------------------------------
// Execute mode (real provider, sequential, budgeted)
// ---------------------------------------------------------------------------

export interface VerdictExploratoryExecuteResult {
  run: VerdictExploratoryRunPlan;
  absolutePath: string;
  reused: boolean;
}

export async function runVerdictExploratoryExecute(input: {
  plan: VerdictExploratoryPlan;
  invoker: SingleAttemptTextInvoker;
  /** Scratch override for plumbing smoke tests; defaults to the frozen output root. */
  outputDir?: string;
  /** Scratch override to run a single task only (plumbing smoke tests). */
  taskIds?: readonly number[];
}): Promise<{ results: VerdictExploratoryExecuteResult[]; budget: V6ProviderCallBudget }> {
  const outputDir = input.outputDir ?? VERDICT_EXPLORATORY_OUTPUT_DIR;
  if (fs.existsSync(outputDir)) {
    throw new Error("output_root_exists: refusing to execute into an existing output directory");
  }
  const budget = new V6ProviderCallBudget(input.plan.maxProviderCalls, input.plan.maxTotalTokens);
  const metered = createMeteredSingleAttemptInvoker(input.invoker, budget);
  const results: VerdictExploratoryExecuteResult[] = [];
  let uncompletableRuns = 0;
  const taskPlans = input.taskIds
    ? input.plan.tasks.filter(task => input.taskIds!.includes(task.taskId))
    : input.plan.tasks;
  for (const taskPlan of taskPlans) {
    const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: taskPlan.taskId, profile: VERDICT_EXPLORATORY_PROFILE });
    const adapters = createV6Adapters({
      discussionContract: fixture.discussionContract,
      verificationContract: fixture.verificationContract,
      finalContract: fixture.finalContract,
      invoker: metered,
    });
    const clock = deterministicV6Clock(fixture.clockStartAt);
    for (const run of taskPlan.runs) {
      const reused = fs.existsSync(resolveV6AuditableRawRunPath(outputDir, run.runId));
      budget.assertCanStartRun(reused ? 0 : run.plannedProviderCalls, reused ? 0 : run.estimatedTokens);
      let sliceResult;
      try {
        sliceResult = await runV6ProductionVerticalSlice({
          outputDir,
          runId: run.runId,
          experimentId: `experiment:${input.plan.experimentRef.id}`,
          seed: 17,
          runIndex: 0,
          study: fixture.study,
          registry: fixture.registry,
          stratum: fixture.stratum,
          primaryMasterSeed: run.primaryMasterSeed,
          eligibleEventMasterSeed: run.eligibleEventMasterSeed,
          monitoringMasterSeed: run.monitoringMasterSeed,
          task: fixture.task,
          taskAuthority: {
            adapterRef: fixture.taskAdapter.adapterRef,
            taskSchemaRef: fixture.taskAdapter.taskSchemaRef,
            resolution: fixture.taskAdapter.resolution,
          },
          monitoringDesign: fixture.monitoringDesign,
          discussionAdapter: adapters.discussionAdapter,
          finalElicitationAdapter: adapters.finalElicitationAdapter,
          governanceRule: fixture.rule,
          interventionContracts: fixture.interventionContracts,
          verificationAdapter: adapters.verificationAdapter,
          clock,
        });
      } catch (error) {
        if (error instanceof ProviderExecutionHaltError) throw error; // budget halt: stop, keep artifacts
        uncompletableRuns += 1;
        console.error(`  run ${run.runId} could not complete: ${error instanceof Error ? error.message : String(error)}`);
        if (uncompletableRuns >= 5) {
          throw new Error(`provider_failures_ge_5: ${uncompletableRuns} runs could not complete; stopping and keeping artifacts`);
        }
        throw error; // structural defect: stop immediately, keep artifacts
      }
      results.push({ run, absolutePath: sliceResult.absolutePath, reused: sliceResult.reused });
      console.log(
        `  completed ${run.runId} (${reused ? "reused" : "written"}) calls=${budget.callCount} tokens=${budget.tokenCount}`,
      );
    }
  }
  return { results, budget };
}

function runExecuteMode(): Promise<number> {
  const plan = buildVerdictExploratoryPlan();
  const planState = ensurePlanFile(plan);
  if (planState.existed && plan.contentHash !== (JSON.parse(fs.readFileSync(VERDICT_EXPLORATORY_PLAN_PATH, "utf8")) as VerdictExploratoryPlan).contentHash) {
    console.error("plan_no_replace_conflict: existing plan differs; provider zero calls");
    return Promise.resolve(2);
  }
  if (fs.existsSync(VERDICT_EXPLORATORY_OUTPUT_DIR)) {
    console.error(`output_root_exists: ${VERDICT_EXPLORATORY_OUTPUT_DIR}`);
    return Promise.resolve(2);
  }
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error("deepseek_api_key_unavailable: set DEEPSEEK_API_KEY before --execute");
    return Promise.resolve(3);
  }
  return runVerdictExploratoryExecute({
    plan,
    invoker: createDeepSeekSingleAttemptInvoker(),
  }).then(({ results, budget }) => {
    console.log(
      `v6 verdict exploratory execute complete: ${results.length} runs, ${budget.callCount} calls, ${budget.tokenCount} tokens`,
    );
    return 0;
  }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    return 4;
  });
}

// ---------------------------------------------------------------------------
// Replay mode (zero provider calls)
// ---------------------------------------------------------------------------

interface V2SafetyReport {
  runId: string;
  arm: "apply" | "sham" | "holdout" | "ineligible";
  replayStatus: "verified" | "failed";
  issues: string[];
  verdict?: string;
  evidenceScope?: string;
  eventVersion?: string;
}

function governanceArmOf(artifact: Record<string, unknown>): "apply" | "sham" | "holdout" | "ineligible" {
  const trail = artifact.governanceAuditTrail as Record<string, unknown> | undefined;
  if (!trail) return "ineligible";
  const transitions = ((trail.actionTransitions as Array<Record<string, unknown>> | undefined) ?? []).map(t => t.to);
  // Every eligible event carries a candidate action instance; the arm is decided
  // by the closing decision. held_out is decisive and must be checked first.
  if (transitions.includes("held_out")) return "holdout";
  if (transitions.includes("assigned")) {
    const ref = ((trail.actionInstances as Array<Record<string, unknown>> | undefined)?.[0]?.actionRef as { id?: string } | undefined)?.id;
    return ref === "swarmalpha.action.verification-attention-sham" ? "sham" : "apply";
  }
  return "ineligible";
}

function v2SafetyCheck(artifact: Record<string, unknown>, arm: "apply" | "sham" | "holdout"): string[] {
  const issues: string[] = [];
  const trail = artifact.governanceAuditTrail as Record<string, unknown>;
  const sourceEvents = (trail.sourceEvents as Array<Record<string, unknown>>) ?? [];
  const verificationEvents = sourceEvents.filter(ev => {
    const id = (ev.eventRef as { id?: string })?.id ?? "";
    return id.includes("verification-result");
  });
  const trace = artifact.v6InteractionTrace as Record<string, unknown>;
  const transcript = (trace.publicTranscript as Array<Record<string, unknown>>) ?? [];
  if (arm === "apply") {
    if (verificationEvents.length === 0) {
      // Assigned apply whose delivery failed (queued -> failed): a provider
      // failure note, not a verdict-authority violation.
      issues.push("NOTE: apply assigned but verification delivery failed (no verification-result event)");
    }
    if (verificationEvents.length !== 1) {
      issues.push(`apply expects exactly one verification-result event, got ${verificationEvents.length}`);
    }
    for (const ev of verificationEvents) {
      const payload = ev.payload as Record<string, unknown>;
      const eventVersion = (ev.eventRef as { version?: string })?.version;
      if (eventVersion !== "2.0.0") issues.push(`apply verification event version ${String(eventVersion)} != 2.0.0`);
      if (payload.evidenceScope !== "public_only") issues.push(`apply evidenceScope ${String(payload.evidenceScope)} != public_only`);
      const verdict = payload.verdict as string;
      if (!["supported", "contradicted", "insufficient_evidence"].includes(verdict)) issues.push(`apply verdict ${String(verdict)} outside frozen enum`);
      for (const forbidden of ["alternativeOutcome", "correctAnswer", "recommendedAnswer"]) {
        if (forbidden in payload) issues.push(`apply payload carries forbidden field ${forbidden}`);
      }
    }
    const governanceMessages = transcript.filter((entry: Record<string, unknown>) => entry.source === "governance");
    const sourceContent = verificationEvents.length === 1
      ? stableJson({
          evidenceScope: (verificationEvents[0].payload as Record<string, unknown>).evidenceScope,
          verdict: (verificationEvents[0].payload as Record<string, unknown>).verdict,
          explanation: (verificationEvents[0].payload as Record<string, unknown>).explanation,
        })
      : null;
    if (sourceContent !== null
      && !governanceMessages.some((entry: Record<string, unknown>) => entry.content === sourceContent)) {
      issues.push("apply source event payload does not match the governance transcript");
    }
  } else if (arm === "sham") {
    if (verificationEvents.length === 0) {
      issues.push("NOTE: sham assigned but matched-attention provider delivery failed");
    }
    if (verificationEvents.length !== 1) issues.push(`sham expects exactly one verification-result event, got ${verificationEvents.length}`);
    for (const ev of verificationEvents) {
      const payload = ev.payload as Record<string, unknown>;
      const eventVersion = (ev.eventRef as { version?: string })?.version;
      if (eventVersion !== "1.0.0") issues.push(`sham verification event version ${String(eventVersion)} != 1.0.0`);
      if ("verdict" in payload) issues.push("sham event carries verdict authority");
      if ("evidenceScope" in payload) issues.push("sham event carries evidenceScope authority");
      if ("publicContent" in payload
        && payload.publicContent !== "Matched control completed; no new evidence was introduced.") {
        issues.push("sham event does not carry the fixed matched-control text");
      }
    }
  } else if (arm === "holdout") {
    if (verificationEvents.length !== 0) issues.push(`holdout must have no verification-result event, got ${verificationEvents.length}`);
    const actionTransitions = (trail.actionTransitions as Array<Record<string, unknown>>) ?? [];
    if (!actionTransitions.some(t => t.to === "held_out")) issues.push("holdout run lacks an eligible -> held_out transition");
  }
  return issues;
}

function runReplayMode(): number {
  const plan = buildVerdictExploratoryPlan();
  const reports: V2SafetyReport[] = [];
  let verified = 0;
  let failed = 0;
  for (const taskPlan of plan.tasks) {
    const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: taskPlan.taskId, profile: VERDICT_EXPLORATORY_PROFILE });
    for (const run of taskPlan.runs) {
      const file = resolveV6AuditableRawRunPath(VERDICT_EXPLORATORY_OUTPUT_DIR, run.runId);
      if (!fs.existsSync(file)) {
        reports.push({ runId: run.runId, arm: "ineligible", replayStatus: "failed", issues: ["raw artifact missing"] });
        failed += 1;
        continue;
      }
      const artifact = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      const replay = verifyRawRunData(file, artifact, { governanceRules: [fixture.rule] });
      const arm = run.protocol === "epistemic_governance_v1"
        ? governanceArmOf(artifact)
        : run.protocol;
      const issues: string[] = [];
      if (replay.runIssues.length > 0) issues.push(...replay.runIssues.map(String));
      if (replay.governanceAuditStatus !== "sealed_decision_replay_verified") {
        issues.push(`governance audit status: ${String(replay.governanceAuditStatus)}`);
      }
      if (run.protocol === "epistemic_governance_v1") {
        issues.push(...v2SafetyCheck(artifact, arm as "apply" | "sham" | "holdout"));
      }
      const hardFailures = issues.filter(issue => !issue.startsWith("NOTE:"));
      reports.push({
        runId: run.runId,
        arm: arm as "apply" | "sham" | "holdout" | "ineligible",
        replayStatus: hardFailures.length === 0 ? "verified" : "failed",
        issues,
        verdict: run.protocol === "epistemic_governance_v1"
          ? undefined : undefined,
      });
      if (hardFailures.length === 0) verified += 1; else failed += 1;
    }
  }
  console.log(`=== v6 verdict exploratory replay ===`);
  console.log(`  artifacts checked: ${reports.length}; verified: ${verified}; failed: ${failed}`);
  for (const report of reports) {
    if (report.replayStatus === "failed") {
      console.error(`  ✗ ${report.runId} [${report.arm}]: ${report.issues.join("; ")}`);
    } else {
      console.log(`  ✓ ${report.runId} [${report.arm}]`);
    }
  }
  if (failed > 0) {
    console.error(`  replay failure count: ${failed}`);
    return 4;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export async function main(argv: readonly string[]): Promise<number> {
  const mode = argv[0] ?? "--plan";
  if (mode === "--plan") return runPlanMode();
  if (mode === "--execute") {
    dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
    return runExecuteMode();
  }
  if (mode === "--replay") return runReplayMode();
  console.error(`unknown mode: ${mode}; expected --plan | --execute | --replay`);
  return 2;
}

function isMainModule(): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(argv1).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  void main(process.argv.slice(2)).then(code => {
    process.exitCode = code;
  }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
