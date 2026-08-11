/**
 * Minimal, frozen binary distributed-information smoke fixture for the v6
 * production vertical slice. Deterministic helpers find the master seeds that
 * assign each Stage-1 protocol without modifying manifests, redrawing a run, or
 * overwriting an assignment.
 */

import {
  createVerificationRequestEligibilityRule,
  HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2,
  VERIFICATION_ATTENTION_SHAM_V2,
  VERIFICATION_REQUEST_V2,
  type GovernancePolicyContract,
  type InterventionContract,
} from "../../../src/lib/governance";
import { REPORTED_BELIEF_CERTAINTY_V1 } from "../../../src/lib/epistemic";
import {
  OPERATIONAL_POOLED_BRIER_ESTIMAND_V1,
  PRIMARY_ASSIGNMENT_ALGORITHM_V1,
  computePrimaryAssignmentExecutionPayloadHash,
  createPrimaryArmExecutionRegistryV1,
  createPrimaryAssignmentV1,
  type GovernanceStudyContract,
  type PrimaryArmExecutionRegistryV1,
  type PrimaryAssignmentDesignV1,
} from "../../../src/lib/experimentation";
import type { GovernanceEligibilityRule } from "../../../src/lib/governance";
import type {
  V6BinaryTaskV1,
  V6DiscussionAdapterContractV1,
  V6InteractionProtocol,
  V6TaskV1,
  V6VerificationAdapterContractV1,
} from "./productionVerticalSlice";
import type { FinalElicitationAdapterContractV1 } from "../../../src/lib/experimentation";
import {
  DISTRIBUTED_BINARY_TASK_FAMILY,
  createV6TaskAdapter,
  type V6TaskAdapterV1,
  type V6TaskFamilyKey,
} from "./taskAdapters";
import {
  createV6MonitoringDesignV1,
  type V6MonitoringDesignV1,
} from "./monitoringDesign";
import type { V6TaskBankManifestV1, V6TaskSplit } from "./taskBank";

export const V6_SMOKE_PROTOCOLS: readonly V6InteractionProtocol[] = [
  "text_communication_v1",
  "explicit_belief_v1",
  "epistemic_governance_v1",
];

/** The frozen v1 distributed-binary family ref (re-exported from taskAdapters). */
export const V6_SMOKE_TASK_FAMILY = DISTRIBUTED_BINARY_TASK_FAMILY;

export const V6_SMOKE_PREREG = Object.freeze({
  id: "swarmalpha.prereg.v6-smoke",
  version: "1.0.0",
});

export const V6_SMOKE_STRATUM = Object.freeze({ taskFamily: "distributed-binary" });
/** Engineering-only seed that yields non-holdout delivery for the frozen G run. */
export const V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED = 0;

export interface V6SmokeFixtureV1<TTask extends V6TaskV1 = V6TaskV1> {
  rule: GovernanceEligibilityRule;
  policy: GovernancePolicyContract;
  design: PrimaryAssignmentDesignV1;
  study: GovernanceStudyContract;
  registry: PrimaryArmExecutionRegistryV1;
  taskAdapter: V6TaskAdapterV1<TTask>;
  monitoringDesign: V6MonitoringDesignV1;
  /** Values supplied to Stage-1 primary assignment; keys exactly match the design. */
  stratum: Record<string, string | number | boolean>;
  task: TTask;
  discussionContract: V6DiscussionAdapterContractV1;
  verificationContract: V6VerificationAdapterContractV1;
  finalContract: FinalElicitationAdapterContractV1;
  interventionContracts: InterventionContract[];
  /** Canonical first timestamp used by the deterministic engineering clock. */
  clockStartAt: string;
  /** Optional external task-bank gate; validated before any provider call. */
  taskBankAdmission?: {
    bank: V6TaskBankManifestV1;
    requiredSplit: V6TaskSplit;
  };
}

/** One planned smoke run: a deterministic Stage-1 assignment for a protocol. */
export interface V6SmokePlannedRun {
  runId: string;
  protocol: V6InteractionProtocol;
  primaryMasterSeed: number;
  eligibleEventMasterSeed: number;
  monitoringMasterSeed: number;
  /** Upper bound of single-attempt provider calls for one run. */
  plannedProviderCalls: number;
  /** Planning estimate only; actual provider-reported usage is authoritative. */
  estimatedTokens: number;
}

/**
 * Options for the v6 binary smoke fixture. The default reproduces the frozen
 * v1 smoke identity set byte-for-byte. `calibration` re-versions the
 * threshold/study/preregistration identities for a calibration split: a
 * versioned threshold change, never a mutation of the frozen smoke contracts.
 */
export interface V6SmokeFixtureOptions {
  /** Build the calibration-split variant with re-versioned identities. Default false. */
  calibration?: boolean;
  /** Task family whose adapter drives the projected task. Default "distributed-binary". */
  taskFamily?: V6TaskFamilyKey;
  /** Identity namespace; default "v6-smoke" (or "v6-smoke-cal" when calibration). */
  namespace?: string;
  /** Eligibility certainty lower bound; must be within (0.5,1]. Smoke default 0.9. */
  certaintyLowerBound?: number;
}

export interface V6SmokeFixtureFromAdapterOptionsV1<TTask extends V6TaskV1> {
  adapter: V6TaskAdapterV1<TTask>;
  namespace: string;
  calibration?: boolean;
  certaintyLowerBound?: number;
  stratum: Record<string, string | number | boolean>;
  evaluationContractRef: { id: string; version: string };
  /** Preserve the frozen binary adapter identities while allowing external-task identities. */
  adapterContractNamespace?: string;
  budgetContractRef?: { id: string; version: string };
  frozenAt?: string;
  clockStartAt?: string;
}

/**
 * Task-kind-generic smoke fixture builder. It freezes experiment mechanics
 * around a versioned task adapter; it never selects a task, split, or outcome.
 */
export function createV6SmokeFixtureFromAdapterV1<TTask extends V6TaskV1>(
  options: V6SmokeFixtureFromAdapterOptionsV1<TTask>,
): V6SmokeFixtureV1<TTask> {
  const isCalibration = options.calibration === true;
  const adapter = options.adapter;
  const ns = options.namespace;
  const lowerBound = options.certaintyLowerBound ?? (isCalibration ? 0.65 : 0.9);
  const stratum = Object.freeze(structuredClone(options.stratum));
  const adapterContractNamespace = options.adapterContractNamespace ?? ns;
  const budgetContractRef = options.budgetContractRef ?? {
    id: `swarmalpha.budget.${ns}`,
    version: "1.0.0",
  };
  // The deterministic 08-10 clock (assignment/observation timestamps) fixes one
  // frozenAt for both variants; identity versioning is carried by the
  // re-versioned IDs and seed namespaces, not by the frozen timestamp.
  const frozenAt = options.frozenAt ?? "2026-08-10T00:00:00.000Z";
  const clockStartAt = options.clockStartAt ?? "2026-08-10T00:00:01.000Z";
  const prereg = Object.freeze({ id: `swarmalpha.prereg.${ns}`, version: "1.0.0" });
  const monitoringDesign = createV6MonitoringDesignV1({
    designRef: { id: `swarmalpha.monitoring.${ns}`, version: "1.0.0" },
    preregistrationRef: prereg,
    seedNamespace: `swarmalpha:${ns}:monitoring:v1`,
    frozenAt,
  });
  const beliefDomain = "options" in adapter.task.claim
    ? {
        beliefKind: "categorical" as const,
        claimOptionCount: adapter.task.claim.options.length,
      }
    : undefined;
  const rule = createVerificationRequestEligibilityRule({
    certaintyThresholdPolicy: {
      id: `swarmalpha.threshold.${ns}`,
      version: "1.0.0",
      quantityRef: REPORTED_BELIEF_CERTAINTY_V1,
      operator: "gte",
      bounds: { lower: lowerBound },
      authority: { kind: "randomized_experiment_only", preregistrationRef: prereg },
      selection: {
        kind: "fixed_preregistered",
        methodRef: { id: "swarmalpha.method.fixed-threshold", version: "1.0.0" },
      },
      costs: { falsePositive: 1, falseNegative: 1, abstention: 1, action: 1 },
      missingResult: "ineligible",
      frozenAt,
    },
    ...(beliefDomain === undefined ? {} : { beliefDomain }),
    maxVerifiedIndependentLineages: 0,
    verifierId: `verifier:${adapterContractNamespace}`,
    matchedTokenBudget: 300,
    expectedModelCalls: 1,
    priority: 100,
  });
  const policy: GovernancePolicyContract = {
    id: `swarmalpha.policy.${ns}`,
    version: "1.0.0",
    controlMode: "randomized_experiment",
    preregistrationRef: prereg,
    eligibilityRuleRefs: [HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2],
    maxActionsPerDecision: 1,
    arbitration: "priority_then_stable_id",
    assignmentDesign: {
      designRef: { id: `swarmalpha.assignment.${ns}`, version: "1.0.0" },
      seedNamespace: `swarmalpha:${ns}:event:v1`,
      allocations: [{
        actionRef: { id: VERIFICATION_REQUEST_V2.id, version: VERIFICATION_REQUEST_V2.version },
        unit: "eligible_event",
        arms: [
          { id: "apply", probability: 0.5 },
          { id: "holdout", probability: 0.25 },
          { id: "sham", probability: 0.25 },
        ],
      }],
    },
    onlineAdaptation: "forbidden",
  };
  const implementations = V6_SMOKE_PROTOCOLS.map(protocol => ({ protocol }));
  const budget = {
    maxDiscussionCalls: Math.max(6, adapter.task.agents.length * 2),
    maxFinalCalls: Math.max(3, adapter.task.agents.length),
    maxVerificationCalls: 1,
  };
  const arms = V6_SMOKE_PROTOCOLS.map((protocol, index) => ({
    armRef: { id: `swarmalpha.arm.${protocol}`, version: "1.0.0" },
    allocationProbability: 1 / 3,
    implementationRef: { id: `swarmalpha.runtime.${protocol}`, version: "1.0.0" },
    implementationConfigHash: computePrimaryAssignmentExecutionPayloadHash(implementations[index]),
    budgetContractRef: structuredClone(budgetContractRef),
    budgetContractHash: computePrimaryAssignmentExecutionPayloadHash(budget),
  }));
  const design: PrimaryAssignmentDesignV1 = {
    id: `swarmalpha.primary-design.${ns}`,
    version: "1.0.0",
    schemaVersion: "1.0.0",
    preregistrationRef: prereg,
    unit: "run",
    assignmentAlgorithmRef: PRIMARY_ASSIGNMENT_ALGORITHM_V1,
    seedNamespace: `swarmalpha:${ns}:primary:v1`,
    arms,
    stratification: {
      fields: Object.keys(stratum).sort(),
      missingFieldPolicy: "reject",
      extraFieldPolicy: "reject",
    },
    analysisPopulation: "intention_to_treat",
    primaryEstimandRef: OPERATIONAL_POOLED_BRIER_ESTIMAND_V1,
    retryPolicy: "reuse_assignment",
  };
  const study: GovernanceStudyContract = {
    id: `swarmalpha.study.${ns}`,
    version: "1.0.0",
    governanceArchitecture: "auditable_epistemic_v1",
    inferenceIntent: "engineering",
    taskFamilyRef: adapter.taskFamilyRef,
    evaluationContractRef: structuredClone(options.evaluationContractRef),
    artifactSchemaRef: { id: "swarmalpha.raw-run", version: "5.0.0" },
    governancePolicy: policy,
    preregistrationRef: prereg,
    frozenAt,
    primaryAssignmentUnit: "run",
    primaryAssignmentDesign: design,
    eligibleEventEstimand: "exploratory_only",
  };
  const registry = createPrimaryArmExecutionRegistryV1({
    studyRef: { id: study.id, version: study.version },
    design,
    entries: V6_SMOKE_PROTOCOLS.map((protocol, index) => ({
      armRef: arms[index].armRef,
      implementationRef: arms[index].implementationRef,
      implementationConfig: implementations[index],
      budgetContractRef: arms[index].budgetContractRef,
      budgetContract: budget,
    })),
  });
  const task: TTask = adapter.task;
  const agentBindings = task.agents.map(agent => ({
    agentId: agent.agentId,
    modelRef: { id: "deepseek:deepseek-chat", version: "1.0.0" },
    invocationConfig: { temperature: 0, maxTokens: 256 },
  }));
  const discussionContract: V6DiscussionAdapterContractV1 = {
    id: `swarmalpha.adapter.discussion-${adapterContractNamespace}`,
    version: "1.0.0",
    adapterRef: { id: "swarmalpha.provider.single-attempt", version: "1.0.0" },
    agentBindings,
    timeoutMs: 120_000,
    retryPolicy: "none",
    executionOrder: "round_then_precommitted_agent",
  };
  const verificationContract: V6VerificationAdapterContractV1 = {
    id: `swarmalpha.adapter.verification-${adapterContractNamespace}`,
    version: "1.0.0",
    adapterRef: { id: "swarmalpha.provider.single-attempt-verifier", version: "1.0.0" },
    modelRef: { id: "deepseek:deepseek-chat", version: "1.0.0" },
    invocationConfig: { temperature: 0, maxTokens: 256 },
    timeoutMs: 120_000,
    retryPolicy: "none",
  };
  const finalContract: FinalElicitationAdapterContractV1 = {
    id: `swarmalpha.adapter.final-${adapterContractNamespace}`,
    version: "1.0.0",
    adapterRef: { id: "swarmalpha.provider.single-attempt-final", version: "1.0.0" },
    agentBindings,
    timeoutMs: 120_000,
    retryPolicy: "none",
    executionOrder: "sequential_precommitted",
  };
  return {
    rule,
    policy,
    design,
    study,
    registry,
    taskAdapter: adapter,
    monitoringDesign,
    stratum,
    task,
    discussionContract,
    verificationContract,
    finalContract,
    clockStartAt,
    interventionContracts: [
      structuredClone(VERIFICATION_REQUEST_V2),
      structuredClone(VERIFICATION_ATTENTION_SHAM_V2),
    ],
  };
}

/** Preserve the frozen binary fixture API and identities byte-for-byte. */
export function createV6BinarySmokeFixture(
  options: V6SmokeFixtureOptions = {},
): V6SmokeFixtureV1<V6BinaryTaskV1> {
  const isCalibration = options.calibration === true;
  const taskFamily = options.taskFamily ?? "distributed-binary";
  const adapter = createV6TaskAdapter(taskFamily);
  const defaultNs = taskFamily === "distributed-binary"
    ? (isCalibration ? "v6-smoke-cal" : "v6-smoke")
    : (isCalibration ? `v6-${taskFamily}-cal` : `v6-${taskFamily}`);
  return createV6SmokeFixtureFromAdapterV1({
    adapter,
    namespace: options.namespace ?? defaultNs,
    calibration: isCalibration,
    certaintyLowerBound: options.certaintyLowerBound,
    stratum: { taskFamily },
    evaluationContractRef: { id: "swarmalpha.eval.v6-binary", version: "1.0.0" },
    adapterContractNamespace: "smoke",
    budgetContractRef: { id: "swarmalpha.budget.v6-smoke", version: "1.0.0" },
  });
}

/**
 * Deterministically find the first master seed that assigns the requested
 * protocol for an engineering smoke run. This creates protocol coverage, not
 * randomized evidence: outputs from these seed-targeted runs are forbidden in
 * confirmatory estimation. The manifest is never modified or redrawn.
 */
export function primarySeedForProtocol(
  runId: string,
  study: GovernanceStudyContract,
  design: PrimaryAssignmentDesignV1,
  protocol: V6InteractionProtocol,
  stratum: Record<string, string | number | boolean> = V6_SMOKE_STRATUM,
): number {
  for (let seed = 0; seed < 10_000; seed++) {
    const assignment = createPrimaryAssignmentV1({
      id: `primary-assignment:${runId}`,
      runId,
      studyRef: { id: study.id, version: study.version },
      design,
      stratum,
      masterSeed: seed,
      assignedAt: "2026-08-10T00:00:01.000Z",
    });
    if (assignment.assignedArmRef.id === `swarmalpha.arm.${protocol}`) return seed;
  }
  throw new Error(`no primary seed found for ${protocol}`);
}

/** Provider-call upper bound plus a non-authoritative token planning estimate. */
function plannedBudgetFor(
  protocol: V6InteractionProtocol,
  agentCount: number,
): { calls: number; tokens: number } {
  const discussionCalls = agentCount * 2;
  const finalCalls = agentCount;
  const verificationCalls = protocol === "epistemic_governance_v1" ? 1 : 0;
  const tokens = discussionCalls * 15 + finalCalls * 15 + verificationCalls * 12;
  return { calls: discussionCalls + finalCalls + verificationCalls, tokens };
}

/** Plan one deterministic run per Stage-1 protocol with distinct run ids. */
export function planV6SmokeRuns(
  fixture: V6SmokeFixtureV1,
  runIdPrefix = "run:v6-smoke",
): V6SmokePlannedRun[] {
  return V6_SMOKE_PROTOCOLS.map(protocol => {
    const runId = `${runIdPrefix}:${protocol}`;
    const budget = plannedBudgetFor(protocol, fixture.task.agents.length);
    return {
      runId,
      protocol,
      primaryMasterSeed: primarySeedForProtocol(runId, fixture.study, fixture.design, protocol, fixture.stratum),
      eligibleEventMasterSeed: V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED,
      monitoringMasterSeed: 0,
      plannedProviderCalls: budget.calls,
      estimatedTokens: budget.tokens,
    };
  });
}

/**
 * Plan a small calibration batch for the re-versioned (calibration) fixture:
 * `replicates` deterministic runs per protocol with distinct cal run ids.
 * Like the smoke plan, seeds are engineering-targeted; outputs are calibration
 * data only and are never confirmatory.
 */
export function planV6CalibrationRuns(
  fixture: V6SmokeFixtureV1,
  replicates = 2,
  runIdPrefix = "run:v6-cal",
): V6SmokePlannedRun[] {
  const runs: V6SmokePlannedRun[] = [];
  for (const protocol of V6_SMOKE_PROTOCOLS) {
    for (let rep = 1; rep <= replicates; rep++) {
      const runId = `${runIdPrefix}:${protocol}:${rep}`;
      const budget = plannedBudgetFor(protocol, fixture.task.agents.length);
      runs.push({
        runId,
        protocol,
        primaryMasterSeed: primarySeedForProtocol(runId, fixture.study, fixture.design, protocol, fixture.stratum),
        eligibleEventMasterSeed: V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED,
        monitoringMasterSeed: rep - 1,
        plannedProviderCalls: budget.calls,
        estimatedTokens: budget.tokens,
      });
    }
  }
  return runs;
}
