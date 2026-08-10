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
  V6VerificationAdapterContractV1,
} from "./productionVerticalSlice";
import type { FinalElicitationAdapterContractV1 } from "../../../src/lib/experimentation";

export const V6_SMOKE_PROTOCOLS: readonly V6InteractionProtocol[] = [
  "text_communication_v1",
  "explicit_belief_v1",
  "epistemic_governance_v1",
];

export const V6_SMOKE_TASK_FAMILY = Object.freeze({
  id: "swarmalpha.task.distributed-binary",
  version: "1.0.0",
});

export const V6_SMOKE_PREREG = Object.freeze({
  id: "swarmalpha.prereg.v6-smoke",
  version: "1.0.0",
});

export const V6_SMOKE_STRATUM = Object.freeze({ taskFamily: "distributed-binary" });
/** Engineering-only seed that yields non-holdout delivery for the frozen G run. */
export const V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED = 0;

export interface V6SmokeFixtureV1 {
  rule: GovernanceEligibilityRule;
  policy: GovernancePolicyContract;
  design: PrimaryAssignmentDesignV1;
  study: GovernanceStudyContract;
  registry: PrimaryArmExecutionRegistryV1;
  task: V6BinaryTaskV1;
  discussionContract: V6DiscussionAdapterContractV1;
  verificationContract: V6VerificationAdapterContractV1;
  finalContract: FinalElicitationAdapterContractV1;
  interventionContracts: InterventionContract[];
}

/** One planned smoke run: a deterministic Stage-1 assignment for a protocol. */
export interface V6SmokePlannedRun {
  runId: string;
  protocol: V6InteractionProtocol;
  primaryMasterSeed: number;
  eligibleEventMasterSeed: number;
  /** Upper bound of single-attempt provider calls for one run. */
  plannedProviderCalls: number;
  /** Planning estimate only; actual provider-reported usage is authoritative. */
  estimatedTokens: number;
}

export function createV6BinarySmokeFixture(): V6SmokeFixtureV1 {
  const rule = createVerificationRequestEligibilityRule({
    certaintyThresholdPolicy: {
      id: "swarmalpha.threshold.v6-smoke",
      version: "1.0.0",
      quantityRef: REPORTED_BELIEF_CERTAINTY_V1,
      operator: "gte",
      bounds: { lower: 0.9 },
      authority: { kind: "randomized_experiment_only", preregistrationRef: V6_SMOKE_PREREG },
      selection: {
        kind: "fixed_preregistered",
        methodRef: { id: "swarmalpha.method.fixed-threshold", version: "1.0.0" },
      },
      costs: { falsePositive: 1, falseNegative: 1, abstention: 1, action: 1 },
      missingResult: "ineligible",
      frozenAt: "2026-08-10T00:00:00.000Z",
    },
    maxVerifiedIndependentLineages: 0,
    verifierId: "verifier:smoke",
    matchedTokenBudget: 300,
    expectedModelCalls: 1,
    priority: 100,
  });
  const policy: GovernancePolicyContract = {
    id: "swarmalpha.policy.v6-smoke",
    version: "1.0.0",
    controlMode: "randomized_experiment",
    preregistrationRef: V6_SMOKE_PREREG,
    eligibilityRuleRefs: [HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2],
    maxActionsPerDecision: 1,
    arbitration: "priority_then_stable_id",
    assignmentDesign: {
      designRef: { id: "swarmalpha.assignment.v6-smoke", version: "1.0.0" },
      seedNamespace: "swarmalpha:v6-smoke:event:v1",
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
  const budget = { maxDiscussionCalls: 6, maxFinalCalls: 3, maxVerificationCalls: 1 };
  const arms = V6_SMOKE_PROTOCOLS.map((protocol, index) => ({
    armRef: { id: `swarmalpha.arm.${protocol}`, version: "1.0.0" },
    allocationProbability: 1 / 3,
    implementationRef: { id: `swarmalpha.runtime.${protocol}`, version: "1.0.0" },
    implementationConfigHash: computePrimaryAssignmentExecutionPayloadHash(implementations[index]),
    budgetContractRef: { id: "swarmalpha.budget.v6-smoke", version: "1.0.0" },
    budgetContractHash: computePrimaryAssignmentExecutionPayloadHash(budget),
  }));
  const design: PrimaryAssignmentDesignV1 = {
    id: "swarmalpha.primary-design.v6-smoke",
    version: "1.0.0",
    schemaVersion: "1.0.0",
    preregistrationRef: V6_SMOKE_PREREG,
    unit: "run",
    assignmentAlgorithmRef: PRIMARY_ASSIGNMENT_ALGORITHM_V1,
    seedNamespace: "swarmalpha:v6-smoke:primary:v1",
    arms,
    stratification: {
      fields: ["taskFamily"],
      missingFieldPolicy: "reject",
      extraFieldPolicy: "reject",
    },
    analysisPopulation: "intention_to_treat",
    primaryEstimandRef: OPERATIONAL_POOLED_BRIER_ESTIMAND_V1,
    retryPolicy: "reuse_assignment",
  };
  const study: GovernanceStudyContract = {
    id: "swarmalpha.study.v6-smoke",
    version: "1.0.0",
    governanceArchitecture: "auditable_epistemic_v1",
    inferenceIntent: "engineering",
    taskFamilyRef: V6_SMOKE_TASK_FAMILY,
    evaluationContractRef: { id: "swarmalpha.eval.v6-binary", version: "1.0.0" },
    artifactSchemaRef: { id: "swarmalpha.raw-run", version: "5.0.0" },
    governancePolicy: policy,
    preregistrationRef: V6_SMOKE_PREREG,
    frozenAt: "2026-08-10T00:00:00.000Z",
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
  const task: V6BinaryTaskV1 = {
    id: "task:v6-smoke-route",
    taskFamilyRef: V6_SMOKE_TASK_FAMILY,
    publicContext: "A remote station must decide whether the emergency route is viable.",
    claim: {
      id: "claim:v6-smoke-route-viable",
      proposition: "The emergency route is viable.",
      domain: "distributed-binary-smoke",
      createdAt: "2026-08-10T00:00:00.000Z",
      resolutionPolicy: { kind: "binary", resolverId: "resolver:v6-smoke" },
    },
    agents: [
      { agentId: "agent:a", privateInformation: "Sensor A reports a clear route." },
      { agentId: "agent:b", privateInformation: "Sensor B reports unstable ice." },
    ],
    outcome: false,
  };
  const agentBindings = task.agents.map(agent => ({
    agentId: agent.agentId,
    modelRef: { id: "deepseek:deepseek-chat", version: "1.0.0" },
    invocationConfig: { temperature: 0, maxTokens: 256 },
  }));
  const discussionContract: V6DiscussionAdapterContractV1 = {
    id: "swarmalpha.adapter.discussion-smoke",
    version: "1.0.0",
    adapterRef: { id: "swarmalpha.provider.single-attempt", version: "1.0.0" },
    agentBindings,
    timeoutMs: 120_000,
    retryPolicy: "none",
    executionOrder: "round_then_precommitted_agent",
  };
  const verificationContract: V6VerificationAdapterContractV1 = {
    id: "swarmalpha.adapter.verification-smoke",
    version: "1.0.0",
    adapterRef: { id: "swarmalpha.provider.single-attempt-verifier", version: "1.0.0" },
    modelRef: { id: "deepseek:deepseek-chat", version: "1.0.0" },
    invocationConfig: { temperature: 0, maxTokens: 256 },
    timeoutMs: 120_000,
    retryPolicy: "none",
  };
  const finalContract: FinalElicitationAdapterContractV1 = {
    id: "swarmalpha.adapter.final-smoke",
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
    task,
    discussionContract,
    verificationContract,
    finalContract,
    interventionContracts: [
      structuredClone(VERIFICATION_REQUEST_V2),
      structuredClone(VERIFICATION_ATTENTION_SHAM_V2),
    ],
  };
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
): number {
  for (let seed = 0; seed < 10_000; seed++) {
    const assignment = createPrimaryAssignmentV1({
      id: `primary-assignment:${runId}`,
      runId,
      studyRef: { id: study.id, version: study.version },
      design,
      stratum: V6_SMOKE_STRATUM,
      masterSeed: seed,
      assignedAt: "2026-08-10T00:00:01.000Z",
    });
    if (assignment.assignedArmRef.id === `swarmalpha.arm.${protocol}`) return seed;
  }
  throw new Error(`no primary seed found for ${protocol}`);
}

/** Provider-call upper bound plus a non-authoritative token planning estimate. */
function plannedBudgetFor(protocol: V6InteractionProtocol): { calls: number; tokens: number } {
  const discussionCalls = 4;
  const finalCalls = 2;
  const verificationCalls = protocol === "epistemic_governance_v1" ? 1 : 0;
  const tokens = discussionCalls * 15 + finalCalls * 15 + verificationCalls * 12;
  return { calls: discussionCalls + finalCalls + verificationCalls, tokens };
}

/** Plan one deterministic run per Stage-1 protocol with distinct run ids. */
export function planV6SmokeRuns(fixture: V6SmokeFixtureV1): V6SmokePlannedRun[] {
  return V6_SMOKE_PROTOCOLS.map(protocol => {
    const runId = `run:v6-smoke:${protocol}`;
    const budget = plannedBudgetFor(protocol);
    return {
      runId,
      protocol,
      primaryMasterSeed: primarySeedForProtocol(runId, fixture.study, fixture.design, protocol),
      eligibleEventMasterSeed: V6_SMOKE_ELIGIBLE_EVENT_MASTER_SEED,
      plannedProviderCalls: budget.calls,
      estimatedTokens: budget.tokens,
    };
  });
}
