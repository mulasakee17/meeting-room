/**
 * V6 Source-Disclosure mechanism screen — minimal runner / plan builder / CLI.
 *
 * Frozen design (docs/plans/CLAUDE_CODE_SOURCE_DISCLOSURE_PHASE1_HANDOFF_2026-08-14.md):
 *   - 10 tasks x 2 paired blocks x 2 arms (holdout / forced_source_disclosure)
 *     = 40 planned runs;
 *   - the arm is frozen in the plan; the only task difference between arms is
 *     the publicContext disclosure block built by createSourceDisclosureTaskVariantV1;
 *   - an experiment-side always-ineligible governance rule guarantees zero
 *     eligible events, so verification/governance provider calls are always 0;
 *   - source selection key = {namespace, blockId, taskId, sourceSelectionSeed},
 *     so H and D of the same block share the same potential source identity/hash.
 *
 * This phase authorizes only --plan (zero provider), a fail-closed --execute,
 * and --replay (zero provider). Real provider execution is NOT authorized.
 * No runtime, schema, production slice, or provider adapter is modified.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { verifyRawRunData } from "../replayVerifier";
import { createDeepSeekSingleAttemptInvoker } from "./deepseekSingleAttemptInvoker";
import { resolveV6AuditableRawRunPath } from "./productionVerticalSlice";
import {
  runV6ProductionVerticalSlice,
  type V6CategoricalTaskV1,
} from "./productionVerticalSlice";
import {
  createV6HiddenBenchSmokeFixtureV1,
  type V6HiddenBenchSmokeFixtureV1,
} from "./v6HiddenBenchSmokeFixture";
import {
  createHiddenBenchTaskProjectionV1,
  type HiddenBenchTaskProjectionV1,
} from "./hiddenBenchTaskAdapter";
import {
  createSourceDisclosureTaskVariantV1,
  type SourceDisclosureScreenArmV1,
} from "./sourceDisclosureInterventionV1";
import {
  createV6Adapters,
  type SingleAttemptTextInvoker,
} from "./providerAdapters";
import {
  createMeteredSingleAttemptInvoker,
  preflightIncompleteRuns,
  V6ProviderCallBudget,
} from "./run_v6_smoke";
import {
  primarySeedForProtocol,
  V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED,
} from "./v6BinarySmokeFixture";
import { computeV6TaskDefinitionHashV1 } from "./v6TaskManifest";
import { mulberry32 } from "../../../src/lib/utils/statsUtils";
import { ProviderExecutionHaltError, type GovernanceStudyContract } from "../../../src/lib/experimentation";
import { validateInterventionContract, type GovernanceEligibilityRule, type InterventionContract } from "../../../src/lib/governance";

// ---------------------------------------------------------------------------
// Frozen constants
// ---------------------------------------------------------------------------

export const SOURCE_DISCLOSURE_SCREEN_EXPERIMENT_REF = Object.freeze({
  id: "swarmalpha.experiment.v6-source-disclosure-screen-v1",
  version: "1.0.0",
});
export const SOURCE_DISCLOSURE_SCREEN_PROFILE = "source-disclosure-screen-v1" as const;
export const SOURCE_DISCLOSURE_SCREEN_REVIEW_REF = Object.freeze({
  id: "swarmalpha.review.v6-source-disclosure-screen",
  version: "1.0.0",
});

/** Frozen task order (must not change). */
export const SOURCE_DISCLOSURE_SCREEN_TASK_ORDER: readonly number[] = Object.freeze([13, 18, 28, 33, 38, 39, 45, 47, 50, 55]);

/** Frozen leakage groups (cluster bootstrap unit). */
export const SOURCE_DISCLOSURE_LEAKAGE_GROUPS: ReadonlyArray<{ groupId: string; taskIds: readonly number[] }> = Object.freeze([
  { groupId: "investigation", taskIds: Object.freeze([13, 47]) },
  { groupId: "urgent-transfer", taskIds: Object.freeze([33, 55]) },
  { groupId: "expedition-basecamp", taskIds: Object.freeze([18]) },
  { groupId: "rescue-route", taskIds: Object.freeze([28]) },
  { groupId: "relief-clinic", taskIds: Object.freeze([38]) },
  { groupId: "aircraft-landing", taskIds: Object.freeze([39]) },
  { groupId: "post-earthquake-lab", taskIds: Object.freeze([45]) },
  { groupId: "secure-meeting-room", taskIds: Object.freeze([50]) },
]);

export const SOURCE_DISCLOSURE_SCREEN_BLOCK_COUNT = 2;
export const SOURCE_DISCLOSURE_SCREEN_MAX_PROVIDER_CALLS = 600;
export const SOURCE_DISCLOSURE_SCREEN_MAX_TOTAL_TOKENS = 1_600_000;
export const SOURCE_DISCLOSURE_SCREEN_PLAN_CREATED_AT = "2026-08-14T00:00:00.000Z";
/** Frozen master seed for the deterministic arm/run execution order. */
export const SOURCE_DISCLOSURE_SCREEN_ORDER_MASTER_SEED = 0x5EEDD1CE;

export const SOURCE_DISCLOSURE_SCREEN_OUTPUT_DIR = path.resolve(
  process.cwd(),
  "experiments/campaign/pilot_output/v6-source-disclosure-screen-v1-20260814",
);
export const SOURCE_DISCLOSURE_SCREEN_PLAN_PATH = path.resolve(
  process.cwd(),
  "experiments/campaign/v6/v6_source_disclosure_screen_v1.plan.json",
);

// ---------------------------------------------------------------------------
// Independent replication config (frozen 2026-08-14): 8 new untouched tasks,
// same protocol/estimand/disclosure mechanism as the screen. Selected via
// SOURCE_DISCLOSURE_TASK_SET=replication; default (absent) stays the screen.
// ---------------------------------------------------------------------------

export const SOURCE_DISCLOSURE_REPLICATION_EXPERIMENT_REF = Object.freeze({
  id: "swarmalpha.experiment.v6-source-disclosure-replication-v1",
  version: "1.0.0",
});
export const SOURCE_DISCLOSURE_REPLICATION_REVIEW_REF = Object.freeze({
  id: "swarmalpha.review.v6-source-disclosure-replication",
  version: "1.0.0",
});
export const SOURCE_DISCLOSURE_REPLICATION_PROFILE = "source-disclosure-replication-v1" as const;
export const SOURCE_DISCLOSURE_REPLICATION_TASK_ORDER: readonly number[] = Object.freeze([19, 24, 32, 40, 49, 51, 54, 63]);
export const SOURCE_DISCLOSURE_REPLICATION_LEAKAGE_GROUPS: ReadonlyArray<{ groupId: string; taskIds: readonly number[] }> = Object.freeze([
  { groupId: "storm-shelter-siting", taskIds: Object.freeze([19]) },
  { groupId: "offline-data-backup", taskIds: Object.freeze([24]) },
  { groupId: "emergency-vaccine-transit", taskIds: Object.freeze([32]) },
  { groupId: "emergency-hospital-transit", taskIds: Object.freeze([40]) },
  { groupId: "field-station-siting", taskIds: Object.freeze([49]) },
  { groupId: "disaster-supply-distribution", taskIds: Object.freeze([51]) },
  { groupId: "island-research-base-siting", taskIds: Object.freeze([54]) },
  { groupId: "event-relocation", taskIds: Object.freeze([63]) },
]);
export const SOURCE_DISCLOSURE_REPLICATION_BLOCK_COUNT = 2;
export const SOURCE_DISCLOSURE_REPLICATION_MAX_PROVIDER_CALLS = 500;
export const SOURCE_DISCLOSURE_REPLICATION_MAX_TOTAL_TOKENS = 1_600_000;
export const SOURCE_DISCLOSURE_REPLICATION_PLAN_CREATED_AT = "2026-08-14T12:00:00.000Z";
export const SOURCE_DISCLOSURE_REPLICATION_ORDER_MASTER_SEED = 0x5EED1C01;
export const SOURCE_DISCLOSURE_REPLICATION_OUTPUT_DIR = path.resolve(
  process.cwd(),
  "experiments/campaign/pilot_output/v6-source-disclosure-replication-v1-20260814",
);
export const SOURCE_DISCLOSURE_REPLICATION_PLAN_PATH = path.resolve(
  process.cwd(),
  "experiments/campaign/v6/v6_source_disclosure_replication_v1.plan.json",
);

/** Task-set selector: absent -> screen (frozen, hash-identical); "replication" -> replication. */
export function resolvedDisclosureConfig(): {
  experimentRef: { id: string; version: string };
  reviewProtocolRef: { id: string; version: string };
  profile: string;
  analysisContractId: string;
  taskOrder: readonly number[];
  leakageGroups: ReadonlyArray<{ groupId: string; taskIds: readonly number[] }>;
  blockCount: number;
  maxProviderCalls: number;
  maxTotalTokens: number;
  planCreatedAt: string;
  orderMasterSeed: number;
  runIdNamespace: string;
  outputDir: string;
  planPath: string;
} {
  const replication = process.env.SOURCE_DISCLOSURE_TASK_SET === "replication";
  return replication
    ? {
        experimentRef: { ...SOURCE_DISCLOSURE_REPLICATION_EXPERIMENT_REF },
        reviewProtocolRef: { ...SOURCE_DISCLOSURE_REPLICATION_REVIEW_REF },
        profile: SOURCE_DISCLOSURE_REPLICATION_PROFILE,
        analysisContractId: "swarmalpha.analysis.v6-source-disclosure-replication-v1",
        taskOrder: SOURCE_DISCLOSURE_REPLICATION_TASK_ORDER,
        leakageGroups: SOURCE_DISCLOSURE_REPLICATION_LEAKAGE_GROUPS,
        blockCount: SOURCE_DISCLOSURE_REPLICATION_BLOCK_COUNT,
        maxProviderCalls: SOURCE_DISCLOSURE_REPLICATION_MAX_PROVIDER_CALLS,
        maxTotalTokens: SOURCE_DISCLOSURE_REPLICATION_MAX_TOTAL_TOKENS,
        planCreatedAt: SOURCE_DISCLOSURE_REPLICATION_PLAN_CREATED_AT,
        orderMasterSeed: SOURCE_DISCLOSURE_REPLICATION_ORDER_MASTER_SEED,
        runIdNamespace: "v6-source-disclosure-replication-v1",
        outputDir: SOURCE_DISCLOSURE_REPLICATION_OUTPUT_DIR,
        planPath: SOURCE_DISCLOSURE_REPLICATION_PLAN_PATH,
      }
    : {
        experimentRef: { ...SOURCE_DISCLOSURE_SCREEN_EXPERIMENT_REF },
        reviewProtocolRef: { ...SOURCE_DISCLOSURE_SCREEN_REVIEW_REF },
        profile: SOURCE_DISCLOSURE_SCREEN_PROFILE,
        analysisContractId: "swarmalpha.analysis.v6-source-disclosure-screen-v1",
        taskOrder: SOURCE_DISCLOSURE_SCREEN_TASK_ORDER,
        leakageGroups: SOURCE_DISCLOSURE_LEAKAGE_GROUPS,
        blockCount: SOURCE_DISCLOSURE_SCREEN_BLOCK_COUNT,
        maxProviderCalls: SOURCE_DISCLOSURE_SCREEN_MAX_PROVIDER_CALLS,
        maxTotalTokens: SOURCE_DISCLOSURE_SCREEN_MAX_TOTAL_TOKENS,
        planCreatedAt: SOURCE_DISCLOSURE_SCREEN_PLAN_CREATED_AT,
        orderMasterSeed: SOURCE_DISCLOSURE_SCREEN_ORDER_MASTER_SEED,
        runIdNamespace: "v6-source-disclosure-screen-v1",
        outputDir: SOURCE_DISCLOSURE_SCREEN_OUTPUT_DIR,
        planPath: SOURCE_DISCLOSURE_SCREEN_PLAN_PATH,
      };
}

const PROVIDER_MODEL_REF = Object.freeze({ id: "deepseek:deepseek-chat", version: "1.0.0" });
const PROVIDER_INVOCATION_CONFIG_HASH = (() => {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]));
    }
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("plan values must be finite");
    return value;
  };
  const stable = (value: unknown): string => JSON.stringify(canonical(value));
  return `sha256:${createHash("sha256").update(stable({
    discussion: { temperature: 0, maxTokens: 768 },
    verification: { temperature: 0, maxTokens: 256 },
    final: { temperature: 0, maxTokens: 256 },
  }), "utf8").digest("hex")}`;
})();

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
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new Error(`${field} must contain only plain objects`);
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map(key => [key, canonicalize(record[key], `${field}.${key}`, next)]));
}
function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
function hashCanonical(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value), "utf8").digest("hex")}`;
}
function sha256Text(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
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
// Experiment-side always-ineligible governance rule (never creates an action)
// ---------------------------------------------------------------------------

export const ALWAYS_INELIGIBLE_DISCLOSURE_RULE_REF = Object.freeze({
  id: "swarmalpha.rule.always-ineligible-source-disclosure-screen",
  version: "1.0.0",
});

/**
 * Always-ineligible: regardless of round-1 certainty or lineage, this rule never
 * returns eligible, so the vertical slice never forms an eligible event and never
 * makes a verification/governance provider call. The tests prove high certainty
 * still triggers zero action.
 */
export function createAlwaysIneligibleDisclosureRuleV1(): GovernanceEligibilityRule {
  return {
    ...ALWAYS_INELIGIBLE_DISCLOSURE_RULE_REF,
    config: { note: "experiment-only always-ineligible; never triggers an eligible event or verification action" },
    evaluate() {
      return {
        ruleRef: ALWAYS_INELIGIBLE_DISCLOSURE_RULE_REF,
        eligible: false,
        reason: "source-disclosure screen never triggers a governance action",
        sourceDiagnosisIds: [],
      };
    },
  };
}

export interface SourceDisclosureFixtureV1 {
  projection: HiddenBenchTaskProjectionV1;
  base: V6HiddenBenchSmokeFixtureV1;
  rule: GovernanceEligibilityRule;
  study: GovernanceStudyContract;
  interventionContracts: InterventionContract[];
}

/**
 * Base-task fixture with the always-ineligible rule. The study policy's
 * assignment allocation references the verification-request actionRef, so the
 * audit builder requires a matching intervention contract; the contract is
 * cloned from the base fixture and re-authorized to the always-ineligible rule
 * only, so it is registered but can never fire (zero verification calls).
 */
export function buildSourceDisclosureFixtureV1(sourceTaskId: number): SourceDisclosureFixtureV1 {
  const projection = createHiddenBenchTaskProjectionV1({ sourceTaskId });
  const base = createV6HiddenBenchSmokeFixtureV1({
    sourceTaskId,
    profile: "mechanism-verdict-v2-v1",
  });
  const rule = createAlwaysIneligibleDisclosureRuleV1();
  const study = structuredClone(base.study) as GovernanceStudyContract;
  const policy = structuredClone(base.study.governancePolicy) as typeof base.study.governancePolicy | undefined;
  if (!policy) throw new Error("source-disclosure base study lacks a governance policy");
  policy.eligibilityRuleRefs = [structuredClone(ALWAYS_INELIGIBLE_DISCLOSURE_RULE_REF)];
  study.governancePolicy = policy;
  const placeholder = structuredClone(base.interventionContracts[0]) as InterventionContract;
  placeholder.eligibilityRuleRefs = [structuredClone(ALWAYS_INELIGIBLE_DISCLOSURE_RULE_REF)];
  validateInterventionContract(placeholder);
  return { projection, base, rule, study, interventionContracts: [placeholder] };
}

function plannedBudget(agentCount: number): { calls: number; tokens: number } {
  // 2 discussion rounds + 1 final elicitation per agent; no verification call.
  // Reserve 6k total tokens per agent/run. This is a conservative preflight
  // estimate informed by the prior paid V6 batches, not a claim about actual
  // usage. The metered global cap remains authoritative during execution.
  return { calls: agentCount * 3, tokens: agentCount * 6_000 };
}

// ---------------------------------------------------------------------------
// Plan types and builder
// ---------------------------------------------------------------------------

export interface SourceDisclosureRunPlanV1 {
  runId: string;
  taskId: number;
  leakageGroup: string;
  blockId: string;
  arm: SourceDisclosureScreenArmV1;
  order: number;
  protocol: "epistemic_governance_v1";
  primaryMasterSeed: number;
  eligibleEventMasterSeed: number;
  monitoringMasterSeed: number;
  sourceSelectionSeed: number;
  sourceSelectionKeyHash: string;
  sourceAgentId: string;
  sourcePrivateInformationHash: string;
  taskDefinitionHash: string;
  publicContextHash: string;
  plannedProviderCalls: number;
  estimatedTokens: number;
}

export interface SourceDisclosureBlockPlanV1 {
  blockId: string;
  sourceSelectionSeed: number;
  sourceSelectionKeyHash: string;
  sourceAgentId: string;
  sourcePrivateInformationHash: string;
  runs: [SourceDisclosureRunPlanV1, SourceDisclosureRunPlanV1];
}

export interface SourceDisclosureTaskPlanV1 {
  taskId: number;
  leakageGroup: string;
  studyRef: { id: string; version: string };
  blocks: SourceDisclosureBlockPlanV1[];
}

export interface SourceDisclosureScreenAnalysisContractV1 {
  id: string;
  version: string;
  clusterUnit: "leakage_group";
  bootstrapCount: number;
  ci: number;
  missingnessPolicy: string;
}

export interface SourceDisclosureScreenPlanBodyV1 {
  experimentRef: { id: string; version: string };
  reviewProtocolRef: { id: string; version: string };
  profile: string;
  taskIds: number[];
  leakageGroups: Array<{ groupId: string; taskIds: number[] }>;
  blockCount: number;
  protocol: "epistemic_governance_v1";
  providerModelRef: { id: string; version: string };
  providerInvocationConfigHash: string;
  maxProviderCalls: number;
  maxTotalTokens: number;
  eligibleEventMasterSeed: number;
  tasks: SourceDisclosureTaskPlanV1[];
  totalRuns: number;
  totalPlannedProviderCalls: number;
  totalEstimatedTokens: number;
  analysisContract: SourceDisclosureScreenAnalysisContractV1;
  createdAt: string;
}

export interface SourceDisclosureScreenPlanV1 extends SourceDisclosureScreenPlanBodyV1 {
  contentHash: string;
}

function runIdFor(namespace: string, taskId: number, blockIndex: number, arm: SourceDisclosureScreenArmV1): string {
  // The arm suffix must contain no underscores: safeRunStem maps ':' to '_', and
  // the artifact-filename reverse-parse maps '_' back to ':', so an underscore
  // inside the arm token would make the parse ambiguous.
  const suffix = arm === "holdout" ? "H" : "D";
  return `run:${namespace}:task-${taskId}:block-${blockIndex + 1}:${suffix}`;
}

/** Deterministic execution order for the runs from a frozen master seed. */
function assignExecutionOrder(runs: SourceDisclosureRunPlanV1[], orderMasterSeed: number): void {
  const ids = runs.map(run => run.runId);
  const rng = mulberry32(orderMasterSeed >>> 0);
  const shuffled = [...ids];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const orderById = new Map(shuffled.map((id, index) => [id, index + 1]));
  for (const run of runs) run.order = orderById.get(run.runId)!;
}

function buildDisclosurePlanCoreV1(config: ReturnType<typeof resolvedDisclosureConfig>): SourceDisclosureScreenPlanV1 {
  const tasks: SourceDisclosureTaskPlanV1[] = [];
  const allRuns: SourceDisclosureRunPlanV1[] = [];
  for (let taskIndex = 0; taskIndex < config.taskOrder.length; taskIndex++) {
    const taskId = config.taskOrder[taskIndex];
    const fixture = buildSourceDisclosureFixtureV1(taskId);
    const baseTask = fixture.projection.adapter.task;
    const leakageGroup = config.leakageGroups.find(group => group.taskIds.includes(taskId))!.groupId;
    const agentCount = baseTask.agents.length;
    const budget = plannedBudget(agentCount);
    const blocks: SourceDisclosureBlockPlanV1[] = [];
    for (let blockIndex = 0; blockIndex < config.blockCount; blockIndex++) {
      const blockId = `task:${taskId}:block:${blockIndex + 1}`;
      const sourceSelectionSeed = 10_000 + taskIndex * 100 + blockIndex;
      // Arm-independent source selection probe (same source for H and D).
      const probe = createSourceDisclosureTaskVariantV1({
        runId: `probe:${blockId}`,
        blockId,
        task: baseTask,
        arm: "holdout",
        sourceSelectionSeed,
      });
      const disclosureVariant = createSourceDisclosureTaskVariantV1({
        runId: `probe:${blockId}:d`,
        blockId,
        task: baseTask,
        arm: "forced_source_disclosure",
        sourceSelectionSeed,
      });
      const hTaskHash = computeV6TaskDefinitionHashV1(baseTask, fixture.projection.adapter);
      const dTaskHash = computeV6TaskDefinitionHashV1(disclosureVariant.task, fixture.projection.adapter);
      const hContextHash = sha256Text(baseTask.publicContext);
      const dContextHash = sha256Text(disclosureVariant.task.publicContext);
      const hRunId = runIdFor(config.runIdNamespace, taskId, blockIndex, "holdout");
      const dRunId = runIdFor(config.runIdNamespace, taskId, blockIndex, "forced_source_disclosure");
      const mkRun = (runId: string, arm: SourceDisclosureScreenArmV1, taskHash: string, contextHash: string): SourceDisclosureRunPlanV1 => ({
        runId,
        taskId,
        leakageGroup,
        blockId,
        arm,
        order: 0,
        protocol: "epistemic_governance_v1",
        primaryMasterSeed: primarySeedForProtocol(runId, fixture.base.study, fixture.base.design, "epistemic_governance_v1", fixture.base.stratum),
        eligibleEventMasterSeed: V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED,
        monitoringMasterSeed: blockIndex,
        sourceSelectionSeed,
        sourceSelectionKeyHash: probe.selection.sourceSelectionKeyHash,
        sourceAgentId: probe.selection.sourceAgentId,
        sourcePrivateInformationHash: probe.selection.sourcePrivateInformationHash,
        taskDefinitionHash: taskHash,
        publicContextHash: contextHash,
        plannedProviderCalls: budget.calls,
        estimatedTokens: budget.tokens,
      });
      const hRun = mkRun(hRunId, "holdout", hTaskHash, hContextHash);
      const dRun = mkRun(dRunId, "forced_source_disclosure", dTaskHash, dContextHash);
      allRuns.push(hRun, dRun);
      blocks.push({
        blockId,
        sourceSelectionSeed,
        sourceSelectionKeyHash: probe.selection.sourceSelectionKeyHash,
        sourceAgentId: probe.selection.sourceAgentId,
        sourcePrivateInformationHash: probe.selection.sourcePrivateInformationHash,
        runs: [hRun, dRun],
      });
    }
    tasks.push({
      taskId,
      leakageGroup,
      studyRef: { id: fixture.base.study.id, version: fixture.base.study.version },
      blocks,
    });
  }
  assignExecutionOrder(allRuns, config.orderMasterSeed);
  const body: SourceDisclosureScreenPlanBodyV1 = {
    experimentRef: { ...config.experimentRef },
    reviewProtocolRef: { ...config.reviewProtocolRef },
    profile: config.profile,
    taskIds: [...config.taskOrder],
    leakageGroups: config.leakageGroups.map(group => ({ groupId: group.groupId, taskIds: [...group.taskIds] })),
    blockCount: config.blockCount,
    protocol: "epistemic_governance_v1",
    providerModelRef: { ...PROVIDER_MODEL_REF },
    providerInvocationConfigHash: PROVIDER_INVOCATION_CONFIG_HASH,
    maxProviderCalls: config.maxProviderCalls,
    maxTotalTokens: config.maxTotalTokens,
    eligibleEventMasterSeed: V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED,
    tasks,
    totalRuns: allRuns.length,
    totalPlannedProviderCalls: allRuns.reduce((sum, run) => sum + run.plannedProviderCalls, 0),
    totalEstimatedTokens: allRuns.reduce((sum, run) => sum + run.estimatedTokens, 0),
    analysisContract: {
      id: config.analysisContractId,
      version: "1.0.0",
      clusterUnit: "leakage_group",
      bootstrapCount: 10_000,
      ci: 0.95,
      missingnessPolicy: "reference_distribution_for_non_answered",
    },
    createdAt: config.planCreatedAt,
  };
  return { ...body, contentHash: hashCanonical(body) };
}

export function buildSourceDisclosureScreenPlanV1(): SourceDisclosureScreenPlanV1 {
  return buildDisclosurePlanCoreV1(resolvedDisclosureConfig());
}

export function disclosureScreenAllRuns(plan: SourceDisclosureScreenPlanV1): SourceDisclosureRunPlanV1[] {
  return plan.tasks.flatMap(task => task.blocks.flatMap(block => block.runs));
}

/** Reject a self-consistent but non-frozen plan before any execution/replay. */
export function assertFrozenSourceDisclosureScreenPlanV1(plan: SourceDisclosureScreenPlanV1): void {
  const expected = buildSourceDisclosureScreenPlanV1();
  if (plan.contentHash !== expected.contentHash || stableJson(plan) !== stableJson(expected)) {
    throw new Error("source-disclosure-plan-does-not-match-frozen-design");
  }
}

function ensurePlan(plan: SourceDisclosureScreenPlanV1, planPath: string): void {
  if (fs.existsSync(planPath)) {
    const existing = JSON.parse(fs.readFileSync(planPath, "utf8")) as SourceDisclosureScreenPlanV1;
    if (existing.contentHash !== plan.contentHash || stableJson(existing) !== stableJson(plan)) {
      throw new Error("source-disclosure-plan-no-replace-conflict");
    }
    return;
  }
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
}

// ---------------------------------------------------------------------------
// Execute path (injected invoker only; CLI blocks real execution)
// ---------------------------------------------------------------------------

export interface SourceDisclosureExecuteResultV1 {
  run: SourceDisclosureRunPlanV1;
  absolutePath: string;
  reused: boolean;
}

export async function runSourceDisclosureScreenExecute(input: {
  plan: SourceDisclosureScreenPlanV1;
  invoker: SingleAttemptTextInvoker;
  outputDir?: string;
  taskIds?: readonly number[];
}): Promise<{ results: SourceDisclosureExecuteResultV1[]; budget: V6ProviderCallBudget }> {
  assertFrozenSourceDisclosureScreenPlanV1(input.plan);
  const outputDir = input.outputDir ?? resolvedDisclosureConfig().outputDir;
  fs.mkdirSync(outputDir, { recursive: true });
  const preflightBlockers = preflightIncompleteRuns(outputDir, disclosureScreenAllRuns(input.plan));
  if (preflightBlockers.length > 0) throw new Error(preflightBlockers.join(";"));
  const budget = new V6ProviderCallBudget(input.plan.maxProviderCalls, input.plan.maxTotalTokens);
  const metered = createMeteredSingleAttemptInvoker(input.invoker, budget);
  const taskIds = input.taskIds ? new Set(input.taskIds) : null;
  const orderedRuns = disclosureScreenAllRuns(input.plan)
    .filter(run => taskIds === null || taskIds.has(run.taskId))
    .sort((a, b) => a.order - b.order);
  const results: SourceDisclosureExecuteResultV1[] = [];
  let uncompletableRuns = 0;
  for (const run of orderedRuns) {
    const fixture = buildSourceDisclosureFixtureV1(run.taskId);
    const variant = createSourceDisclosureTaskVariantV1({
      runId: run.runId,
      blockId: run.blockId,
      task: fixture.projection.adapter.task,
      arm: run.arm,
      sourceSelectionSeed: run.sourceSelectionSeed,
    });
    const adapters = createV6Adapters({
      discussionContract: fixture.base.discussionContract,
      verificationContract: fixture.base.verificationContract,
      finalContract: fixture.base.finalContract,
      invoker: metered,
    });
    const clock = deterministicV6Clock(fixture.base.clockStartAt);
    const reused = fs.existsSync(resolveV6AuditableRawRunPath(outputDir, run.runId));
    if (reused) {
      const rawPath = resolveV6AuditableRawRunPath(outputDir, run.runId);
      const artifact = JSON.parse(fs.readFileSync(rawPath, "utf8")) as Record<string, unknown>;
      const replay = verifyRawRunData(rawPath, artifact, { governanceRules: [fixture.rule] });
      if (artifact.runId !== run.runId
        || replay.runIssues.length > 0
        || replay.governanceAuditStatus !== "sealed_decision_replay_verified") {
        throw new Error(`existing_source_disclosure_run_failed_replay:${run.runId}`);
      }
    }
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
        registry: fixture.base.registry,
        stratum: fixture.base.stratum,
        primaryMasterSeed: run.primaryMasterSeed,
        eligibleEventMasterSeed: run.eligibleEventMasterSeed,
        monitoringMasterSeed: run.monitoringMasterSeed,
        task: variant.task as V6CategoricalTaskV1,
        taskAuthority: {
          adapterRef: fixture.projection.adapter.adapterRef,
          taskSchemaRef: fixture.projection.adapter.taskSchemaRef,
          resolution: fixture.projection.adapter.resolution,
        },
        monitoringDesign: fixture.base.monitoringDesign,
        discussionAdapter: adapters.discussionAdapter,
        finalElicitationAdapter: adapters.finalElicitationAdapter,
        governanceRule: fixture.rule,
        interventionContracts: fixture.interventionContracts,
        verificationAdapter: adapters.verificationAdapter,
        clock,
      });
    } catch (error) {
      if (error instanceof ProviderExecutionHaltError) throw error;
      uncompletableRuns += 1;
      console.error(`  run ${run.runId} could not complete: ${error instanceof Error ? error.message : String(error)}`);
      if (uncompletableRuns >= 5) {
        throw new Error(`provider_failures_ge_5: ${uncompletableRuns} runs could not complete; stopping and keeping artifacts`);
      }
      throw error;
    }
    results.push({ run, absolutePath: sliceResult.absolutePath, reused: sliceResult.reused });
    console.log(`  completed ${run.runId} (${reused ? "reused" : "written"}) calls=${budget.callCount} tokens=${budget.tokenCount}`);
  }
  return { results, budget };
}

// ---------------------------------------------------------------------------
// Replay (zero provider)
// ---------------------------------------------------------------------------

export function runSourceDisclosureScreenReplayV1(input: {
  plan: SourceDisclosureScreenPlanV1;
  outputDir?: string;
}): { present: number; expected: number; issues: string[] } {
  assertFrozenSourceDisclosureScreenPlanV1(input.plan);
  const outputDir = input.outputDir ?? resolvedDisclosureConfig().outputDir;
  const issues: string[] = [];
  let present = 0;
  for (const run of disclosureScreenAllRuns(input.plan)) {
    const file = resolveV6AuditableRawRunPath(outputDir, run.runId);
    if (!fs.existsSync(file)) continue;
    present += 1;
    const artifact = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    const fixture = buildSourceDisclosureFixtureV1(run.taskId);
    const replay = verifyRawRunData(file, artifact, { governanceRules: [fixture.rule] });
    if (replay.runIssues.length > 0 || replay.governanceAuditStatus !== "sealed_decision_replay_verified") {
      issues.push(`replay_failed:${run.runId}:${replay.runIssues.map(issue => issue.code).join(",")}`);
    }
  }
  return { present, expected: disclosureScreenAllRuns(input.plan).length, issues };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function runPlan(): number {
  const config = resolvedDisclosureConfig();
  const plan = buildSourceDisclosureScreenPlanV1();
  ensurePlan(plan, config.planPath);
  const blockers = preflightIncompleteRuns(config.outputDir, disclosureScreenAllRuns(plan));
  if (blockers.length > 0) throw new Error(blockers.join(";"));
  const runs = disclosureScreenAllRuns(plan);
  console.log(JSON.stringify({
    mode: "plan",
    contentHash: plan.contentHash,
    experiment: plan.experimentRef.id,
    taskSet: process.env.SOURCE_DISCLOSURE_TASK_SET ?? "screen",
    tasks: plan.taskIds,
    leakageGroups: plan.leakageGroups.length,
    blocks: plan.blockCount,
    runs: plan.totalRuns,
    pairs: runs.length / 2,
    plannedCalls: plan.totalPlannedProviderCalls,
    maxCalls: plan.maxProviderCalls,
    estimatedTokens: plan.totalEstimatedTokens,
    maxTokens: plan.maxTotalTokens,
    outputDir: config.outputDir,
    verificationCalls: 0,
    claims: ["non-confirmatory mechanism screen only"],
    forbidden: ["effect-established", "governance-effective", "confirmatory"],
  }, null, 2));
  return 0;
}

/**
 * Authorization gate (testable boundary, no provider/credential access): paid
 * execution requires the literal `RUN_AUTHORIZED=yes`. This is checked before
 * loading .env.local, so an unauthorized invocation never touches credentials.
 */
export function sourceDisclosureExecuteGateV1(env: {
  RUN_AUTHORIZED?: string;
}): { ok: boolean; code: number; reason: string } {
  if (env.RUN_AUTHORIZED !== "yes") {
    return { ok: false, code: 5, reason: "execute_blocked: RUN_AUTHORIZED=yes not present" };
  }
  return { ok: true, code: 0, reason: "" };
}

/**
 * Post-dotenv key presence boundary: only existence is checked, never the value.
 * Kept separate from the authorization gate because the key lives in .env.local,
 * which is loaded only after authorization.
 */
export function sourceDisclosureKeyPresenceV1(env: {
  DEEPSEEK_API_KEY?: string;
}): { ok: boolean; code: number } {
  return env.DEEPSEEK_API_KEY ? { ok: true, code: 0 } : { ok: false, code: 3 };
}

export function runExecuteCli(): Promise<number> {
  // Authorization before credentials: an unauthorized invocation never loads
  // .env.local or touches the provider.
  const gate = sourceDisclosureExecuteGateV1(process.env as { RUN_AUTHORIZED?: string });
  if (!gate.ok) {
    console.error(gate.reason);
    return Promise.resolve(gate.code);
  }
  const plan = buildSourceDisclosureScreenPlanV1();
  assertFrozenSourceDisclosureScreenPlanV1(plan);
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  const keyPresence = sourceDisclosureKeyPresenceV1(process.env as { DEEPSEEK_API_KEY?: string });
  if (!keyPresence.ok) {
    console.error("deepseek_api_key_unavailable: set DEEPSEEK_API_KEY before --execute");
    return Promise.resolve(3);
  }
  return runSourceDisclosureScreenExecute({
    plan,
    invoker: createDeepSeekSingleAttemptInvoker(),
  }).then(({ results, budget }) => {
    const written = results.filter(result => !result.reused).length;
    const reused = results.filter(result => result.reused).length;
    console.log(JSON.stringify({ runs: results.length, written, reused, calls: budget.callCount, tokens: budget.tokenCount }));
    return 0;
  }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    return 4;
  });
}

export function runReplayCli(): number {
  const plan = buildSourceDisclosureScreenPlanV1();
  ensurePlan(plan, resolvedDisclosureConfig().planPath);
  const result = runSourceDisclosureScreenReplayV1({ plan });
  console.log(JSON.stringify({
    mode: "replay",
    present: result.present,
    expected: result.expected,
    issues: result.issues,
    status: result.present === 0 ? "absent" : result.issues.length === 0 && result.present === result.expected ? "verified" : "failed",
  }, null, 2));
  if (result.present === 0) return 4; // explicit absent, not a forged success
  return result.issues.length === 0 && result.present === result.expected ? 0 : 4;
}

async function main(): Promise<number> {
  if (process.argv.includes("--plan")) return runPlan();
  if (process.argv.includes("--execute")) return runExecuteCli();
  if (process.argv.includes("--replay")) return runReplayCli();
  console.error("usage: --plan | --execute | --replay");
  return 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 4;
  });
}
