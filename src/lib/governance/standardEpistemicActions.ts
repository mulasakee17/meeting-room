import {
  validateGovernancePolicy,
  validateInterventionContract,
  type GovernancePolicyContract,
  type InterventionContract,
  type VersionedGovernanceRef,
} from "./controlContracts";

export const HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2: VersionedGovernanceRef = Object.freeze({
  id: "swarmalpha.rule.high-certainty-low-lineage",
  version: "2.0.0",
});

export const PRE_EXPOSURE_COUNTERCHECK_RULE_V1: VersionedGovernanceRef = Object.freeze({
  id: "swarmalpha.rule.pre-exposure-countercheck",
  version: "1.0.0",
});

export const DUPLICATED_LINEAGE_POOL_RULE_V1: VersionedGovernanceRef = Object.freeze({
  id: "swarmalpha.rule.duplicated-lineage-pool",
  version: "1.0.0",
});

export const VERIFICATION_SHAM_ACTION_REF_V2: VersionedGovernanceRef = Object.freeze({
  id: "swarmalpha.action.verification-attention-sham",
  version: "2.0.0",
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function defineAction(contract: InterventionContract): Readonly<InterventionContract> {
  validateInterventionContract(contract);
  return deepFreeze(structuredClone(contract));
}

export const VERIFICATION_ATTENTION_SHAM_V2 = defineAction({
  ...VERIFICATION_SHAM_ACTION_REF_V2,
  label: "Attention-matched verification sham",
  family: "deliberation_process",
  targetKind: "agent",
  deliveryMode: "prompt",
  complianceObservability: "observable",
  targetCardinality: { min: 1, max: 1 },
  parameterContract: {
    required: ["claimId", "matchedTokenBudget"],
    allowed: ["claimId", "matchedTokenBudget"],
  },
  eligibilityRuleRefs: [HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2],
  mediators: [{
    metricRef: { id: "swarmalpha.metric.sham-response-received", version: "1.0.0" },
    expectedDirection: "non_inferiority",
    window: { startOffset: 0, endOffset: 1 },
  }],
  costDimensions: ["modelCalls", "tokenBudget"],
  contraindicationCodes: [],
  conflictsWithActionIds: [
    "swarmalpha.action.verification-request",
    "swarmalpha.action.independent-countercheck",
  ],
  randomization: {
    unit: "eligible_event",
    applyArm: "sham",
    holdoutArm: "holdout",
  },
  enabledByDefault: false,
});

export const VERIFICATION_REQUEST_V2 = defineAction({
  id: "swarmalpha.action.verification-request",
  version: "2.0.0",
  label: "Verification request",
  family: "information_acquisition",
  targetKind: "agent",
  deliveryMode: "tool_request",
  complianceObservability: "observable",
  targetCardinality: { min: 1, max: 1 },
  parameterContract: {
    required: ["claimId", "verifierId", "matchedTokenBudget"],
    allowed: ["claimId", "verifierId", "matchedTokenBudget"],
  },
  eligibilityRuleRefs: [HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2],
  mediators: [
    {
      metricRef: { id: "swarmalpha.metric.verification-completion", version: "1.0.0" },
      expectedDirection: "increase",
      window: { startOffset: 0, endOffset: 1 },
    },
    {
      metricRef: { id: "swarmalpha.metric.verified-independent-lineages", version: "1.0.0" },
      expectedDirection: "increase",
      window: { startOffset: 0, endOffset: 1 },
    },
  ],
  costDimensions: ["modelCalls", "tokenBudget"],
  contraindicationCodes: ["claim_resolved", "verifier_unavailable", "verification_budget_exhausted"],
  conflictsWithActionIds: [VERIFICATION_SHAM_ACTION_REF_V2.id],
  randomization: {
    unit: "eligible_event",
    applyArm: "apply",
    holdoutArm: "holdout",
    shamArm: "sham",
    shamActionRef: VERIFICATION_SHAM_ACTION_REF_V2,
    shamCostPolicy: "match_apply_candidate",
  },
  enabledByDefault: false,
});

export const INDEPENDENT_COUNTERCHECK_V1 = defineAction({
  id: "swarmalpha.action.independent-countercheck",
  version: "1.0.0",
  label: "Independent pre-exposure countercheck",
  family: "deliberation_process",
  targetKind: "agent",
  deliveryMode: "prompt",
  complianceObservability: "observable",
  targetCardinality: { min: 1 },
  parameterContract: {
    required: ["claimId", "excludedReportIds"],
    allowed: ["claimId", "excludedReportIds", "matchedTokenBudget"],
  },
  eligibilityRuleRefs: [PRE_EXPOSURE_COUNTERCHECK_RULE_V1],
  mediators: [{
    metricRef: { id: "swarmalpha.metric.pre-exposure-independent-reports", version: "1.0.0" },
    expectedDirection: "increase",
    window: { startOffset: 0, endOffset: 1 },
  }],
  costDimensions: ["modelCalls", "tokenBudget"],
  contraindicationCodes: ["no_unexposed_agent", "claim_resolved", "countercheck_budget_exhausted"],
  conflictsWithActionIds: [VERIFICATION_SHAM_ACTION_REF_V2.id],
  randomization: {
    unit: "eligible_event",
    applyArm: "apply",
    holdoutArm: "holdout",
  },
  enabledByDefault: false,
});

export const LINEAGE_CAPPED_POOL_V1 = defineAction({
  id: "swarmalpha.action.lineage-capped-pool",
  version: "1.0.0",
  label: "Lineage-capped opinion pool",
  family: "aggregation",
  targetKind: "claim",
  deliveryMode: "aggregation_rule",
  complianceObservability: "observable",
  targetCardinality: { min: 1, max: 1 },
  parameterContract: {
    required: ["claimId", "maxWeightPerLineage"],
    allowed: ["claimId", "maxWeightPerLineage"],
  },
  eligibilityRuleRefs: [DUPLICATED_LINEAGE_POOL_RULE_V1],
  mediators: [
    {
      metricRef: { id: "swarmalpha.metric.effective-independent-source-count", version: "1.0.0" },
      expectedDirection: "increase",
      window: { startOffset: 0, endOffset: 0 },
    },
    {
      metricRef: { id: "swarmalpha.metric.pooled-source-concentration", version: "1.0.0" },
      expectedDirection: "decrease",
      window: { startOffset: 0, endOffset: 0 },
    },
  ],
  costDimensions: ["computeUnits"],
  contraindicationCodes: ["lineage_missing", "claim_resolved"],
  conflictsWithActionIds: [],
  randomization: {
    unit: "eligible_event",
    applyArm: "apply",
    holdoutArm: "holdout",
  },
  enabledByDefault: false,
});

export const MINIMAL_EPISTEMIC_GOVERNANCE_POLICY_V2: Readonly<GovernancePolicyContract> = (() => {
  const policy: GovernancePolicyContract = {
    id: "swarmalpha.policy.minimal-epistemic-governance",
    version: "2.0.0",
    controlMode: "randomized_experiment",
    preregistrationRef: { id: "swarmalpha.prereg.minimal-epistemic-governance", version: "1.0.0" },
    eligibilityRuleRefs: [
      HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2,
      PRE_EXPOSURE_COUNTERCHECK_RULE_V1,
      DUPLICATED_LINEAGE_POOL_RULE_V1,
    ],
    maxActionsPerDecision: 1,
    arbitration: "priority_then_stable_id",
    assignmentDesign: {
      designRef: { id: "swarmalpha.assignment.minimal-epistemic-governance", version: "1.0.0" },
      seedNamespace: "swarmalpha:minimal-epistemic-governance:v1",
      allocations: [
        {
          actionRef: { id: VERIFICATION_REQUEST_V2.id, version: VERIFICATION_REQUEST_V2.version },
          unit: "eligible_event",
          arms: [
            { id: "apply", probability: 0.5 },
            { id: "holdout", probability: 0.25 },
            { id: "sham", probability: 0.25 },
          ],
        },
        {
          actionRef: { id: INDEPENDENT_COUNTERCHECK_V1.id, version: INDEPENDENT_COUNTERCHECK_V1.version },
          unit: "eligible_event",
          arms: [
            { id: "apply", probability: 0.5 },
            { id: "holdout", probability: 0.5 },
          ],
        },
        {
          actionRef: { id: LINEAGE_CAPPED_POOL_V1.id, version: LINEAGE_CAPPED_POOL_V1.version },
          unit: "eligible_event",
          arms: [
            { id: "apply", probability: 0.5 },
            { id: "holdout", probability: 0.5 },
          ],
        },
      ],
    },
    onlineAdaptation: "forbidden",
  };
  validateGovernancePolicy(policy);
  return deepFreeze(structuredClone(policy));
})();

export const STANDARD_EPISTEMIC_INTERVENTION_CONTRACTS = Object.freeze([
  VERIFICATION_ATTENTION_SHAM_V2,
  VERIFICATION_REQUEST_V2,
  INDEPENDENT_COUNTERCHECK_V1,
  LINEAGE_CAPPED_POOL_V1,
] as const);
