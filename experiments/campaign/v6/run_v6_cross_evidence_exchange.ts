/**
 * Cross-evidence exchange — 有治理 vs 无治理 2-arm mechanism screen runner.
 *
 * Frozen design (owner 2026-08-15): both arms run the standard 2-round +
 * final-private protocol on the base task (no disclosure variant). The
 * governance arm applies the disagreement rule; on eligible (max pairwise TV
 * >= 0.8) runs it randomizes exchange(0.5)/holdout(0.5) and the exchange
 * deterministically surfaces each side's registered supporting evidence to the
 * group (zero extra provider calls). The no-governance arm is a matched
 * control: identical task, exchange action/arms, and contract, but the
 * always-ineligible rule never fires the exchange.
 *
 * Primary estimand: ITT mean final pooled Brier(governance) - mean(no-governance).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { resolveV6AuditableRawRunPath, runV6ProductionVerticalSlice, type V6CategoricalTaskV1 } from "./productionVerticalSlice";
import { createV6HiddenBenchSmokeFixtureV1 } from "./v6HiddenBenchSmokeFixture";
import { createHiddenBenchTaskProjectionV1 } from "./hiddenBenchTaskAdapter";
import { createV6Adapters, type SingleAttemptTextInvoker } from "./providerAdapters";
import { createMeteredSingleAttemptInvoker, preflightIncompleteRuns, V6ProviderCallBudget } from "./run_v6_smoke";
import { primarySeedForProtocol, V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED } from "./v6BinarySmokeFixture";
import { computeV6TaskDefinitionHashV1 } from "./v6TaskManifest";
import { mulberry32 } from "../../../src/lib/utils/statsUtils";
import { ProviderExecutionHaltError, type GovernanceStudyContract } from "../../../src/lib/experimentation";
import { createDeepSeekSingleAttemptInvoker } from "./deepseekSingleAttemptInvoker";
import {
  ALWAYS_INELIGIBLE_EXCHANGE_RULE_REF,
  createAlwaysIneligibleExchangeRuleV1,
  createCrossEvidenceExchangeContractV1,
  createCrossEvidenceSelectorV1,
  createDisconfirmingEvidenceSelectorV1,
  createDisagreementExchangeRuleV1,
  DISAGREEMENT_EXCHANGE_RULE_REF,
} from "./disagreementExchangeGovernanceV1";

export const CROSS_EVIDENCE_EXCHANGE_EXPERIMENT_REF = Object.freeze({
  id: "swarmalpha.experiment.v6-cross-evidence-exchange-v1",
  version: "1.0.0",
});
export const CROSS_EVIDENCE_EXCHANGE_EXPERIMENT_REF_FULL = Object.freeze({
  id: "swarmalpha.experiment.v6-cross-evidence-exchange-v1",
  version: "1.0.0",
});
export const CROSS_EVIDENCE_EXCHANGE_PROFILE = "cross-evidence-exchange-v1" as const;
export const CROSS_EVIDENCE_EXCHANGE_BLOCK_COUNT = 2;
export const CROSS_EVIDENCE_EXCHANGE_MAX_PROVIDER_CALLS = 700;
export const CROSS_EVIDENCE_EXCHANGE_MAX_TOTAL_TOKENS = 1_500_000;
export const CROSS_EVIDENCE_EXCHANGE_PLAN_CREATED_AT = "2026-08-15T00:00:00.000Z";
export const CROSS_EVIDENCE_EXCHANGE_ORDER_MASTER_SEED = 0xE2C41;
/**
 * Frozen eligible-event master seed. NOT searched for arm distribution: it is
 * the natural first seed, so the declared exchange(0.5)/holdout(0.5) split is a
 * genuine randomized draw across eligible governance runs. The within-governance
 * exchange-vs-holdout contrast is therefore honest but low-power; the primary
 * ITT (governance vs no-governance) does not depend on it.
 */
export const CROSS_EVIDENCE_EXCHANGE_ELIGIBLE_EVENT_MASTER_SEED = 0;
/**
 * Frozen disclosure-direction seed: deterministically assigns each eligible
 * exchange run to `supports` or `attacks` (roughly 50/50) via a hash of the
 * seed and the runId. This makes disclosure direction a within-round randomized
 * contrast, independent of outcome; it is NOT compile-time-global (the earlier
 * DISCLOSURE_MODE) and is not outcome-selected.
 */
export const CROSS_EVIDENCE_EXCHANGE_DIRECTION_SEED = 0x5D1C7;
/** Deterministic supports/attacks direction for a run, frozen by DIRECTION_SEED. */
export function directionForRun(runId: string): "supports" | "attacks" {
  const h = createHash("sha256").update(`${CROSS_EVIDENCE_EXCHANGE_DIRECTION_SEED}:${runId}`, "utf8").digest("hex");
  return parseInt(h.slice(0, 2), 16) % 2 === 0 ? "supports" : "attacks";
}
/**
 * Frozen screen status. Rounds 1-2 (supports) DEFER; rounds 3-5 (attacks) show a
 * robust effect (n=30). Round 6 (20-task 3-arm within-round direction contrast)
 * is parked: the disclosure-direction question is superseded by the fork
 * experiment (`run_v6_fork.ts`), so this screen stays fail-closed. `--execute`
 * fails while true.
 */
export const CROSS_EVIDENCE_EXCHANGE_DISABLED = true;
/**
 * Frozen round-3 disclosure mode: what the governance arm surfaces when eligible.
 * `supports` = confirming evidence (rounds 1-2, recorded); `attacks` = disconfirming
 * evidence from ALL agents, deduplicated (round 3).
 */
export const CROSS_EVIDENCE_EXCHANGE_DISCLOSURE_MODE: "supports" | "attacks" = "attacks";
/**
 * Frozen round-2 arm allocation (2026-08-15): when a governance run is eligible
 * (round-1 max pairwise TV >= 0.8), deliver exchange with 0.9 and holdout with
 * 0.1. This maximizes mechanism exposure for the screen while retaining a small
 * holdout arm for the within-governance contrast. Pre-specified design amendment
 * over round 1 (0.5/0.5); the disagreement threshold and task set are unchanged.
 */
export const CROSS_EVIDENCE_EXCHANGE_ARMS: ReadonlyArray<{ id: string; probability: number }> = Object.freeze([
  { id: "exchange", probability: 0.9 },
  { id: "holdout", probability: 0.1 },
]);
/**
 * Frozen 20-task set (2026-08-15): the original 8 high-disagreement tasks plus
 * the first 12 contiguous tasks, to raise the task-cluster count from 8 to 20.
 * Frozen before outcomes; not result-selected.
 */
export const CROSS_EVIDENCE_EXCHANGE_TASK_IDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 24, 28, 32, 33, 39, 45, 54];
export const CROSS_EVIDENCE_EXCHANGE_OUTPUT_DIR = path.resolve(
  process.cwd(),
  "experiments/campaign/pilot_output/v6-cross-evidence-exchange-v1-20260815-r6-3arm",
);
export const CROSS_EVIDENCE_EXCHANGE_PLAN_PATH = path.resolve(
  process.cwd(),
  "experiments/campaign/v6/v6_cross_evidence_exchange_v1.plan.json",
);

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
  if (Array.isArray(value)) return value.map((entry, index) => canonicalize(entry, `${field}[${index}]`, next));
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
  let tick = 0;
  return () => new Date(start + tick++ * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Exchange fixture: governance-on (disagreement rule + exchange contract)
// ---------------------------------------------------------------------------

export interface ExchangeFixtureV1 {
  base: ReturnType<typeof createV6HiddenBenchSmokeFixtureV1>;
  projection: ReturnType<typeof createHiddenBenchTaskProjectionV1>;
  rule: ReturnType<typeof createDisagreementExchangeRuleV1>;
  study: GovernanceStudyContract;
  interventionContracts: ReturnType<typeof createCrossEvidenceExchangeContractV1>[];
  crossEvidenceSelector: ReturnType<typeof createCrossEvidenceSelectorV1>;
}

/** Mode-appropriate governance-arm disclosure selector (frozen by DISCLOSURE_MODE). */
function disclosureSelector() {
  return CROSS_EVIDENCE_EXCHANGE_DISCLOSURE_MODE === "attacks"
    ? createDisconfirmingEvidenceSelectorV1()
    : createCrossEvidenceSelectorV1();
}

export function buildDisagreementExchangeFixtureV1(sourceTaskId: number): ExchangeFixtureV1 {
  const projection = createHiddenBenchTaskProjectionV1({ sourceTaskId });
  const base = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId, profile: "mechanism-verdict-v2-v1" });
  const rule = createDisagreementExchangeRuleV1();
  const study = structuredClone(base.study) as GovernanceStudyContract;
  const policy = structuredClone(base.study.governancePolicy) as typeof base.study.governancePolicy;
  if (!policy || !policy.assignmentDesign || policy.assignmentDesign.allocations.length !== 1) {
    throw new Error("exchange base study must have exactly one governance policy allocation");
  }
  policy.eligibilityRuleRefs = [structuredClone(DISAGREEMENT_EXCHANGE_RULE_REF)];
  policy.assignmentDesign.allocations[0] = {
    ...policy.assignmentDesign.allocations[0],
    actionRef: structuredClone({ id: "swarmalpha.action.cross-evidence-exchange", version: "1.0.0" }),
    arms: CROSS_EVIDENCE_EXCHANGE_ARMS.map(arm => ({ ...arm })),
  };
  study.governancePolicy = policy;
  const interventionContracts = [createCrossEvidenceExchangeContractV1()];
  const crossEvidenceSelector = disclosureSelector();
  return { base, projection, rule, study, interventionContracts, crossEvidenceSelector };
}

/**
 * Matched no-governance control for the exchange screen. Identical to the
 * governance fixture in every respect — same base task/projection, same study
 * identity, same cross-evidence-exchange actionRef and exchange/holdout arms,
 * same exchange contract and selector — except the eligibility rule is
 * always-ineligible (the contract is re-authorized accordingly). This makes the
 * governance/no-governance ITT contrast a pure on/off difference at the rule
 * level, with no residual source-disclosure structure.
 */
export function buildDisagreementExchangeNoGovernanceFixtureV1(sourceTaskId: number): ExchangeFixtureV1 {
  const projection = createHiddenBenchTaskProjectionV1({ sourceTaskId });
  const base = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId, profile: "mechanism-verdict-v2-v1" });
  const rule = createAlwaysIneligibleExchangeRuleV1();
  const study = structuredClone(base.study) as GovernanceStudyContract;
  const policy = structuredClone(base.study.governancePolicy) as typeof base.study.governancePolicy;
  if (!policy || !policy.assignmentDesign || policy.assignmentDesign.allocations.length !== 1) {
    throw new Error("exchange no-governance base study must have exactly one governance policy allocation");
  }
  policy.eligibilityRuleRefs = [structuredClone(ALWAYS_INELIGIBLE_EXCHANGE_RULE_REF)];
  policy.assignmentDesign.allocations[0] = {
    ...policy.assignmentDesign.allocations[0],
    actionRef: structuredClone({ id: "swarmalpha.action.cross-evidence-exchange", version: "1.0.0" }),
    arms: CROSS_EVIDENCE_EXCHANGE_ARMS.map(arm => ({ ...arm })),
  };
  study.governancePolicy = policy;
  const interventionContracts = [createCrossEvidenceExchangeContractV1(ALWAYS_INELIGIBLE_EXCHANGE_RULE_REF)];
  const crossEvidenceSelector = disclosureSelector();
  return { base, projection, rule, study, interventionContracts, crossEvidenceSelector };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface CrossEvidenceRunPlanV1 {
  runId: string;
  taskId: number;
  blockId: string;
  governanceArm: "governance" | "no_governance";
  order: number;
  protocol: "epistemic_governance_v1";
  primaryMasterSeed: number;
  eligibleEventMasterSeed: number;
  monitoringMasterSeed: number;
  taskDefinitionHash: string;
  publicContextHash: string;
  plannedProviderCalls: number;
  estimatedTokens: number;
}

export interface CrossEvidenceExchangePlanV1 {
  experimentRef: { id: string; version: string };
  profile: string;
  taskIds: number[];
  blockCount: number;
  protocol: "epistemic_governance_v1";
  maxProviderCalls: number;
  maxTotalTokens: number;
  eligibleEventMasterSeed: number;
  disagreementThreshold: number;
  runs: CrossEvidenceRunPlanV1[];
  totalRuns: number;
  totalPlannedProviderCalls: number;
  totalEstimatedTokens: number;
  createdAt: string;
  contentHash: string;
}

function runIdFor(taskId: number, blockIndex: number, arm: "governance" | "no_governance"): string {
  return `run:v6-cross-evidence-exchange-v1:task-${taskId}:block-${blockIndex + 1}:${arm === "governance" ? "GOV" : "NG"}`;
}

export function buildCrossEvidenceExchangePlanV1(taskIds: readonly number[]): CrossEvidenceExchangePlanV1 {
  const runs: CrossEvidenceRunPlanV1[] = [];
  for (const taskId of taskIds) {
    const fixture = buildDisagreementExchangeFixtureV1(taskId);
    const baseTask = fixture.projection.adapter.task;
    const agentCount = baseTask.agents.length;
    const budget = { calls: agentCount * 3, tokens: agentCount * 6_000 };
    const taskHash = computeV6TaskDefinitionHashV1(baseTask, fixture.projection.adapter);
    const ctxHash = sha256Text(baseTask.publicContext);
    for (let blockIndex = 0; blockIndex < CROSS_EVIDENCE_EXCHANGE_BLOCK_COUNT; blockIndex++) {
      for (const arm of ["governance"] as const) {
        const runId = runIdFor(taskId, blockIndex, arm);
        runs.push({
          runId,
          taskId,
          blockId: `task:${taskId}:block:${blockIndex + 1}`,
          governanceArm: arm,
          order: 0,
          protocol: "epistemic_governance_v1",
          primaryMasterSeed: primarySeedForProtocol(runId, fixture.base.study, fixture.base.design, "epistemic_governance_v1", fixture.base.stratum),
          eligibleEventMasterSeed: CROSS_EVIDENCE_EXCHANGE_ELIGIBLE_EVENT_MASTER_SEED,
          monitoringMasterSeed: blockIndex,
          taskDefinitionHash: taskHash,
          publicContextHash: ctxHash,
          plannedProviderCalls: budget.calls,
          estimatedTokens: budget.tokens,
        });
      }
    }
  }
  const rng = mulberry32(CROSS_EVIDENCE_EXCHANGE_ORDER_MASTER_SEED >>> 0);
  const ids = runs.map(r => r.runId);
  const shuffled = [...ids];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const orderById = new Map(shuffled.map((id, index) => [id, index + 1]));
  for (const run of runs) run.order = orderById.get(run.runId)!;
  const body: Omit<CrossEvidenceExchangePlanV1, "contentHash"> = {
    experimentRef: { ...CROSS_EVIDENCE_EXCHANGE_EXPERIMENT_REF },
    profile: CROSS_EVIDENCE_EXCHANGE_PROFILE,
    taskIds: [...taskIds],
    blockCount: CROSS_EVIDENCE_EXCHANGE_BLOCK_COUNT,
    protocol: "epistemic_governance_v1",
    maxProviderCalls: CROSS_EVIDENCE_EXCHANGE_MAX_PROVIDER_CALLS,
    maxTotalTokens: CROSS_EVIDENCE_EXCHANGE_MAX_TOTAL_TOKENS,
    eligibleEventMasterSeed: CROSS_EVIDENCE_EXCHANGE_ELIGIBLE_EVENT_MASTER_SEED,
    disagreementThreshold: 0.8,
    runs,
    totalRuns: runs.length,
    totalPlannedProviderCalls: runs.reduce((s, r) => s + r.plannedProviderCalls, 0),
    totalEstimatedTokens: runs.reduce((s, r) => s + r.estimatedTokens, 0),
    createdAt: CROSS_EVIDENCE_EXCHANGE_PLAN_CREATED_AT,
  };
  return { ...body, contentHash: hashCanonical(body) };
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

export async function runCrossEvidenceExchangeExecute(input: {
  plan: CrossEvidenceExchangePlanV1;
  invoker: SingleAttemptTextInvoker;
  outputDir?: string;
  taskIds?: readonly number[];
}): Promise<{ runs: number; budget: V6ProviderCallBudget }> {
  const outputDir = input.outputDir ?? CROSS_EVIDENCE_EXCHANGE_OUTPUT_DIR;
  fs.mkdirSync(outputDir, { recursive: true });
  const blockers = preflightIncompleteRuns(outputDir, input.plan.runs.map(r => ({ runId: r.runId })) as unknown as Parameters<typeof preflightIncompleteRuns>[1]);
  if (blockers.length > 0) throw new Error(blockers.join(";"));
  const budget = new V6ProviderCallBudget(input.plan.maxProviderCalls, input.plan.maxTotalTokens);
  const metered = createMeteredSingleAttemptInvoker(input.invoker, budget);
  const taskSet = input.taskIds ? new Set(input.taskIds) : null;
  const ordered = input.plan.runs.filter(r => taskSet === null || taskSet.has(r.taskId)).sort((a, b) => a.order - b.order);
  let uncompletable = 0;
  for (const run of ordered) {
    const fixture = buildDisagreementExchangeFixtureV1(run.taskId);
    // Within-round disclosure-direction randomization: frozen per run.
    const crossEvidenceSelector = directionForRun(run.runId) === "attacks"
      ? createDisconfirmingEvidenceSelectorV1()
      : createCrossEvidenceSelectorV1();
    const baseTask = fixture.projection.adapter.task;
    const adapters = createV6Adapters({
      discussionContract: fixture.base.discussionContract,
      verificationContract: fixture.base.verificationContract,
      finalContract: fixture.base.finalContract,
      invoker: metered,
    });
    const clock = deterministicV6Clock(fixture.base.clockStartAt);
    const reused = fs.existsSync(resolveV6AuditableRawRunPath(outputDir, run.runId));
    budget.assertCanStartRun(reused ? 0 : run.plannedProviderCalls, reused ? 0 : run.estimatedTokens);
    try {
      await runV6ProductionVerticalSlice({
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
        task: baseTask as V6CategoricalTaskV1,
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
        crossEvidenceSelector,
        clock,
      });
    } catch (error) {
      if (error instanceof ProviderExecutionHaltError) throw error;
      uncompletable += 1;
      console.error(`  run ${run.runId} could not complete: ${error instanceof Error ? error.message : String(error)}`);
      if (uncompletable >= 5) throw new Error(`provider_failures_ge_5: ${uncompletable}`);
      throw error;
    }
    console.log(`  completed ${run.runId} (${reused ? "reused" : "written"}) calls=${budget.callCount} tokens=${budget.tokenCount}`);
  }
  return { runs: ordered.length, budget };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function runPlan(): number {
  const plan = buildCrossEvidenceExchangePlanV1(CROSS_EVIDENCE_EXCHANGE_TASK_IDS);
  if (fs.existsSync(CROSS_EVIDENCE_EXCHANGE_PLAN_PATH)) {
    const existing = JSON.parse(fs.readFileSync(CROSS_EVIDENCE_EXCHANGE_PLAN_PATH, "utf8"));
    if (existing.contentHash !== plan.contentHash) throw new Error("exchange-plan-no-replace-conflict");
  } else {
    fs.mkdirSync(path.dirname(CROSS_EVIDENCE_EXCHANGE_PLAN_PATH), { recursive: true });
    fs.writeFileSync(CROSS_EVIDENCE_EXCHANGE_PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
  }
  console.log(JSON.stringify({ mode: "plan", contentHash: plan.contentHash, runs: plan.totalRuns, calls: plan.totalPlannedProviderCalls, tokens: plan.totalEstimatedTokens, outputDir: CROSS_EVIDENCE_EXCHANGE_OUTPUT_DIR }, null, 2));
  return 0;
}

export function runExecuteCli(): Promise<number> {
  if (CROSS_EVIDENCE_EXCHANGE_DISABLED) {
    console.error("execute_blocked: cross-evidence-exchange screen is DEFER and parked; re-execution requires an owner re-frozen plan (see docs/experiments/V6_CROSS_EVIDENCE_EXCHANGE_RESULTS_2026-08-15.md)");
    return Promise.resolve(6);
  }
  if (process.env.RUN_AUTHORIZED !== "yes") { console.error("execute_blocked: RUN_AUTHORIZED=yes not present"); return Promise.resolve(5); }
  const plan = buildCrossEvidenceExchangePlanV1(CROSS_EVIDENCE_EXCHANGE_TASK_IDS);
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  if (!process.env.DEEPSEEK_API_KEY) { console.error("deepseek_api_key_unavailable"); return Promise.resolve(3); }
  return runCrossEvidenceExchangeExecute({ plan, invoker: createDeepSeekSingleAttemptInvoker() })
    .then(({ runs, budget }) => { console.log(JSON.stringify({ runs, calls: budget.callCount, tokens: budget.tokenCount })); return 0; })
    .catch(error => { console.error(error instanceof Error ? error.message : String(error)); return 4; });
}

async function main(): Promise<number> {
  if (process.argv.includes("--plan")) return runPlan();
  if (process.argv.includes("--execute")) return runExecuteCli();
  console.error("usage: --plan | --execute");
  return 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 4; });
}
