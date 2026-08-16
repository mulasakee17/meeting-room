import {
  canonicalizeEstimatorValue,
  fingerprintEstimatorValue,
} from "../epistemic/estimators";
import {
  GovernanceActionLedger,
  type GovernanceActionInstance,
  type GovernanceActionTransition,
} from "./actionLifecycle";
import {
  selectTruthBlindInformationActionV1,
  validateOnlineEpistemicRiskV1,
  type ActiveInformationActionCandidateV1,
  type OnlineEpistemicRiskV1,
  type TruthBlindActionDecisionV1,
} from "./activeInformationGovernance";

export const ACTIVE_INFORMATION_ELIGIBILITY_V1 = Object.freeze({
  id: "swarmalpha.active-information-eligibility",
  version: "1.0.0",
});

export interface ActiveInformationEligibilityPolicyV1 {
  id: string;
  version: string;
  authority: "randomized_experiment_only";
  sourceConcentrationThreshold: number;
  disagreementThreshold: number;
  promptSensitivityThreshold: number;
}

export type ActiveInformationEligibilityReasonV1 =
  | "lineage_identity_missing"
  | "declared_source_concentrated"
  | "prompt_conditioned_disagreement_high"
  | "prompt_sensitivity_high"
  | "high_consequence_support_missing";

export interface ActiveInformationCandidateEvaluationV1 {
  candidateId: string;
  eligible: boolean;
  matchedReasonCodes: ActiveInformationEligibilityReasonV1[];
}

export interface ActiveInformationEligibilityDecisionV1 {
  artifactSchemaRef: typeof ACTIVE_INFORMATION_ELIGIBILITY_V1;
  inferenceStatus: "experimental_eligibility_not_effectiveness";
  id: string;
  claimId: string;
  riskHash: string;
  policy: ActiveInformationEligibilityPolicyV1;
  sourceRelationAuthorityIds: string[];
  evaluations: ActiveInformationCandidateEvaluationV1[];
  eligibleCandidateIds: string[];
  contentHash: string;
}

export interface ActiveInformationObservationRefV1 {
  kind: "evidence" | "belief_report" | "provenance_record";
  id: string;
}

function requireExactKeys(value: object, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${field} fields differ from the frozen schema`);
  }
}

function requireNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be non-empty`);
}

function requireUniqueNonEmpty(values: readonly string[], field: string): void {
  if (!Array.isArray(values) || values.some(value => typeof value !== "string" || value.trim().length === 0)) {
    throw new Error(`${field} must contain non-empty strings`);
  }
  if (new Set(values).size !== values.length) throw new Error(`${field} must not contain duplicates`);
}

function requireUnitInterval(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be finite within [0,1]`);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function validatePolicy(policy: ActiveInformationEligibilityPolicyV1): void {
  requireExactKeys(policy, [
    "id", "version", "authority", "sourceConcentrationThreshold",
    "disagreementThreshold", "promptSensitivityThreshold",
  ], "active information eligibility policy");
  requireNonEmpty(policy.id, "active information eligibility policy.id");
  if (!/^\d+\.\d+\.\d+$/.test(policy.version)) {
    throw new Error("active information eligibility policy.version must be semantic x.y.z");
  }
  if (policy.authority !== "randomized_experiment_only") {
    throw new Error("active information eligibility is not authorized for operational control");
  }
  requireUnitInterval(policy.sourceConcentrationThreshold, "sourceConcentrationThreshold");
  requireUnitInterval(policy.disagreementThreshold, "disagreementThreshold");
  requireUnitInterval(policy.promptSensitivityThreshold, "promptSensitivityThreshold");
}

function dimensionAtLeast(
  dimension: OnlineEpistemicRiskV1["dimensions"][keyof OnlineEpistemicRiskV1["dimensions"]],
  threshold: number,
): boolean {
  return dimension.status === "available" && dimension.value >= threshold;
}

function candidateReasons(
  risk: OnlineEpistemicRiskV1,
  candidate: ActiveInformationActionCandidateV1,
  policy: ActiveInformationEligibilityPolicyV1,
): ActiveInformationEligibilityReasonV1[] {
  const reasons: ActiveInformationEligibilityReasonV1[] = [];
  const dimensions = risk.dimensions;
  const canAddSourceIdentity = candidate.informationAccess === "new_external_observation"
    && candidate.expectedObservationKinds.includes("provenance_record");
  if (dimensions.declaredSourceConcentration.status === "missing" && canAddSourceIdentity) {
    reasons.push("lineage_identity_missing");
  }
  const distinctSource = candidate.sourceDistinctness === "verified_distinct_identity"
    || candidate.sourceDistinctness === "declared_distinct_identity";
  if (dimensionAtLeast(dimensions.declaredSourceConcentration, policy.sourceConcentrationThreshold)
    && distinctSource
    && candidate.informationAccess !== "public_reanalysis_only") {
    reasons.push("declared_source_concentrated");
  }
  if (dimensionAtLeast(dimensions.promptConditionedDisagreement, policy.disagreementThreshold)
    && candidate.informationAccess === "new_external_observation"
    && candidate.expectedObservationKinds.includes("evidence")) {
    reasons.push("prompt_conditioned_disagreement_high");
  }
  if (dimensionAtLeast(dimensions.promptSensitivity, policy.promptSensitivityThreshold)
    && (candidate.informationAccess === "new_private_report"
      || candidate.informationAccess === "public_reanalysis_only")
    && candidate.expectedObservationKinds.includes("belief_report")) {
    reasons.push("prompt_sensitivity_high");
  }
  const highConsequence = risk.consequence.level === "high" || risk.consequence.level === "critical";
  if (highConsequence
    && dimensions.qualifiedUnsupportedness.status === "missing"
    && candidate.informationAccess === "new_external_observation"
    && candidate.expectedObservationKinds.includes("evidence")) {
    reasons.push("high_consequence_support_missing");
  }
  return reasons.sort();
}

function eligibilityBody(
  decision: ActiveInformationEligibilityDecisionV1,
): Omit<ActiveInformationEligibilityDecisionV1, "contentHash"> {
  const { contentHash: _contentHash, ...body } = decision;
  return body;
}

export function evaluateActiveInformationEligibilityV1(input: {
  id: string;
  risk: OnlineEpistemicRiskV1;
  candidates: ActiveInformationActionCandidateV1[];
  policy: ActiveInformationEligibilityPolicyV1;
  sourceRelationAuthorityIds: string[];
}): Readonly<ActiveInformationEligibilityDecisionV1> {
  requireExactKeys(input, ["id", "risk", "candidates", "policy", "sourceRelationAuthorityIds"], "eligibility input");
  requireNonEmpty(input.id, "eligibility input.id");
  validateOnlineEpistemicRiskV1(input.risk);
  validatePolicy(input.policy);
  requireUniqueNonEmpty(input.sourceRelationAuthorityIds, "sourceRelationAuthorityIds");
  const authority = new Set(input.sourceRelationAuthorityIds);
  requireUniqueNonEmpty(input.candidates.map(candidate => candidate.id), "candidate ids");
  for (const candidate of input.candidates) {
    if (candidate.claimId !== input.risk.claimId) throw new Error("eligibility candidate targets another claim");
    if (candidate.eligibilityDecisionId !== input.id) throw new Error("candidate is not bound to this eligibility decision");
    if (candidate.sourceRelationRefs.some(ref => !authority.has(ref))) {
      throw new Error("candidate cites a source relation outside the authority snapshot");
    }
  }
  // Reuse the strict candidate validator and truth firewall at zero budget.
  selectTruthBlindInformationActionV1({
    risk: input.risk,
    candidates: input.candidates,
    availableBudget: { computeUnits: 0, latencyUnits: 0 },
  });
  const evaluations = input.candidates
    .map(candidate => {
      const matchedReasonCodes = candidateReasons(input.risk, candidate, input.policy);
      return { candidateId: candidate.id, eligible: matchedReasonCodes.length > 0, matchedReasonCodes };
    })
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  const body: Omit<ActiveInformationEligibilityDecisionV1, "contentHash"> = {
    artifactSchemaRef: ACTIVE_INFORMATION_ELIGIBILITY_V1,
    inferenceStatus: "experimental_eligibility_not_effectiveness",
    id: input.id,
    claimId: input.risk.claimId,
    riskHash: input.risk.contentHash,
    policy: clone(input.policy),
    sourceRelationAuthorityIds: [...input.sourceRelationAuthorityIds].sort(),
    evaluations,
    eligibleCandidateIds: evaluations.filter(item => item.eligible).map(item => item.candidateId),
  };
  return deepFreeze(clone({ ...body, contentHash: fingerprintEstimatorValue(body) }));
}

export function validateActiveInformationEligibilityDecisionV1(
  decision: ActiveInformationEligibilityDecisionV1,
): void {
  requireExactKeys(decision, [
    "artifactSchemaRef", "inferenceStatus", "id", "claimId", "riskHash", "policy",
    "sourceRelationAuthorityIds", "evaluations", "eligibleCandidateIds", "contentHash",
  ], "active information eligibility decision");
  if (canonicalizeEstimatorValue(decision.artifactSchemaRef)
    !== canonicalizeEstimatorValue(ACTIVE_INFORMATION_ELIGIBILITY_V1)) {
    throw new Error("active information eligibility schema ref is invalid");
  }
  if (decision.inferenceStatus !== "experimental_eligibility_not_effectiveness") {
    throw new Error("active information eligibility overclaims control authority");
  }
  requireNonEmpty(decision.id, "active information eligibility decision.id");
  requireNonEmpty(decision.claimId, "active information eligibility decision.claimId");
  requireNonEmpty(decision.riskHash, "active information eligibility decision.riskHash");
  validatePolicy(decision.policy);
  requireUniqueNonEmpty(decision.sourceRelationAuthorityIds, "sourceRelationAuthorityIds");
  requireUniqueNonEmpty(decision.evaluations.map(item => item.candidateId), "eligibility evaluation candidate ids");
  requireUniqueNonEmpty(decision.eligibleCandidateIds, "eligibleCandidateIds");
  const allowedReasons: ActiveInformationEligibilityReasonV1[] = [
    "lineage_identity_missing", "declared_source_concentrated",
    "prompt_conditioned_disagreement_high", "prompt_sensitivity_high",
    "high_consequence_support_missing",
  ];
  for (const evaluation of decision.evaluations) {
    requireExactKeys(evaluation, ["candidateId", "eligible", "matchedReasonCodes"], "eligibility evaluation");
    requireNonEmpty(evaluation.candidateId, "eligibility evaluation candidateId");
    if (typeof evaluation.eligible !== "boolean") throw new Error("eligibility evaluation eligible must be boolean");
    requireUniqueNonEmpty(evaluation.matchedReasonCodes, "matchedReasonCodes");
    if (evaluation.matchedReasonCodes.some(reason => !allowedReasons.includes(reason))) {
      throw new Error("eligibility evaluation reason is invalid");
    }
    if (evaluation.eligible !== (evaluation.matchedReasonCodes.length > 0)) {
      throw new Error("eligibility evaluation differs from matched reasons");
    }
  }
  const derived = decision.evaluations.filter(item => item.eligible).map(item => item.candidateId).sort();
  if (canonicalizeEstimatorValue(derived) !== canonicalizeEstimatorValue(decision.eligibleCandidateIds)) {
    throw new Error("eligibleCandidateIds differ from evaluations");
  }
  if (decision.contentHash !== fingerprintEstimatorValue(eligibilityBody(decision))) {
    throw new Error("active information eligibility contentHash mismatch");
  }
}

export function selectEligibleTruthBlindInformationActionV1(input: {
  risk: OnlineEpistemicRiskV1;
  candidates: ActiveInformationActionCandidateV1[];
  eligibility: ActiveInformationEligibilityDecisionV1;
  availableBudget: { computeUnits: number; latencyUnits: number };
}): Readonly<TruthBlindActionDecisionV1> {
  requireExactKeys(input, ["risk", "candidates", "eligibility", "availableBudget"], "eligible action input");
  validateOnlineEpistemicRiskV1(input.risk);
  validateActiveInformationEligibilityDecisionV1(input.eligibility);
  if (input.eligibility.riskHash !== input.risk.contentHash || input.eligibility.claimId !== input.risk.claimId) {
    throw new Error("eligibility decision is not bound to this risk state");
  }
  const candidatesById = new Map(input.candidates.map(candidate => [candidate.id, candidate]));
  if (candidatesById.size !== input.candidates.length) throw new Error("candidate ids must not contain duplicates");
  const eligibleCandidates = input.eligibility.eligibleCandidateIds.map(id => {
    const candidate = candidatesById.get(id);
    if (!candidate) throw new Error("eligibility decision references an absent candidate");
    if (candidate.eligibilityDecisionId !== input.eligibility.id) {
      throw new Error("candidate is not bound to the eligibility decision");
    }
    return candidate;
  });
  return selectTruthBlindInformationActionV1({
    risk: input.risk,
    candidates: eligibleCandidates,
    availableBudget: input.availableBudget,
  });
}

/**
 * Reuses the existing action ledger and transition source-event links. A
 * completed information action must bind at least one new, expected observation.
 * This establishes acquisition, not correctness or decision improvement.
 */
export function assertActiveInformationActionCompletionV1(input: {
  candidate: ActiveInformationActionCandidateV1;
  instance: GovernanceActionInstance;
  transitions: GovernanceActionTransition[];
  preActionEventIds: string[];
  observations: ActiveInformationObservationRefV1[];
}): void {
  requireExactKeys(input, ["candidate", "instance", "transitions", "preActionEventIds", "observations"], "completion input");
  requireUniqueNonEmpty(input.preActionEventIds, "preActionEventIds");
  requireUniqueNonEmpty(input.observations.map(item => item.id), "observation ids");
  if (input.observations.length === 0) throw new Error("completed information action requires a new observation");
  for (const observation of input.observations) {
    requireExactKeys(observation, ["kind", "id"], "active information observation ref");
    if (!input.candidate.expectedObservationKinds.includes(observation.kind)) {
      throw new Error("observation kind was not declared by the selected candidate");
    }
    if (input.preActionEventIds.includes(observation.id)) {
      throw new Error("information action observation predates the action");
    }
  }
  if (input.candidate.informationAccess === "public_reanalysis_only"
    && input.observations.some(item => item.kind !== "belief_report")) {
    throw new Error("public reanalysis may only produce a new belief report");
  }
  if (canonicalizeEstimatorValue(input.instance.actionRef)
    !== canonicalizeEstimatorValue(input.candidate.actionRef)
    || canonicalizeEstimatorValue([...input.instance.targetIds].sort())
      !== canonicalizeEstimatorValue([...input.candidate.targetIds].sort())) {
    throw new Error("action instance differs from the selected candidate");
  }
  if (canonicalizeEstimatorValue(input.instance.expectedCost)
    !== canonicalizeEstimatorValue(input.candidate.cost)) {
    throw new Error("action instance cost differs from the selected candidate");
  }
  if (input.transitions.length === 0) throw new Error("completion requires an action transition history");
  const ledger = new GovernanceActionLedger();
  ledger.register(input.instance, input.transitions[0]);
  for (const transition of input.transitions.slice(1)) ledger.append(transition);
  if (ledger.getCurrentState(input.instance.id) !== "completed") {
    throw new Error("information action is not completed");
  }
  const terminalEvidenceIds = new Set(input.transitions
    .filter(item => item.to === "compliance_observed"
      || item.to === "compliance_unobservable"
      || item.to === "completed")
    .flatMap(item => item.sourceEventIds));
  if (input.observations.some(item => !terminalEvidenceIds.has(item.id))) {
    throw new Error("new observation is not bound to the terminal action history");
  }
}
