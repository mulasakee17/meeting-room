import {
  canonicalizeEstimatorValue,
  fingerprintEstimatorValue,
} from "../epistemic/estimators";
import {
  validateCollectiveEpistemicStateV1,
  type CollectiveEpistemicStateV1,
} from "../epistemic/collectiveState";

export const ONLINE_EPISTEMIC_RISK_V1 = Object.freeze({
  id: "swarmalpha.online-epistemic-risk",
  version: "1.0.0",
});

export const SOURCE_NOVELTY_ACTION_POLICY_V1 = Object.freeze({
  id: "swarmalpha.policy.source-novelty-lexicographic",
  version: "1.0.0",
});

export const TRUTH_BLIND_ACTION_DECISION_V1 = Object.freeze({
  id: "swarmalpha.truth-blind-action-decision",
  version: "1.0.0",
});

export type DeclaredConsequenceLevel = "low" | "moderate" | "high" | "critical";

export interface DeclaredConsequenceV1 {
  level: DeclaredConsequenceLevel;
  contractRef: { id: string; version: string };
}

export interface QualifiedPromptSensitivityObservationV1 {
  status: "measurement_qualified";
  claimId: string;
  asOfRound: number;
  methodRef: { id: string; version: string };
  /** Maximum belief distance within one frozen prompt-equivalence family. */
  maxPairwiseBeliefDistance: number;
  sourceArtifactHashes: string[];
}

export type OnlineRiskDimensionV1 =
  | {
      status: "available";
      value: number;
      interpretation: string;
      sourceRefs: string[];
    }
  | {
      status: "missing";
      reason:
        | "declared_lineage_incomplete"
        | "qualified_prompt_perturbation_absent"
        | "qualified_support_observation_absent"
        | "exposure_conditioned_response_absent";
      interpretation: string;
      sourceRefs: string[];
    };

/**
 * A truth-blind, non-compensatory projection. Dimensions are not summed into a
 * risk score: they describe different observable failure surfaces and retain
 * missingness explicitly.
 */
export interface OnlineEpistemicRiskV1 {
  artifactSchemaRef: typeof ONLINE_EPISTEMIC_RISK_V1;
  inferenceStatus: "online_descriptive_risk_only";
  claimId: string;
  asOfRound: number;
  consequence: DeclaredConsequenceV1;
  dimensions: {
    promptConditionedDisagreement: OnlineRiskDimensionV1;
    declaredSourceConcentration: OnlineRiskDimensionV1;
    promptSensitivity: OnlineRiskDimensionV1;
    observedResponseConcentration: OnlineRiskDimensionV1;
    qualifiedUnsupportedness: OnlineRiskDimensionV1;
  };
  sourceCollectiveStateHash: string;
  contentHash: string;
}

export type SourceDistinctnessStatusV1 =
  | "verified_distinct_identity"
  | "declared_distinct_identity"
  | "unknown_relation"
  | "same_declared_lineage";

export type InformationAccessModeV1 =
  | "new_external_observation"
  | "new_private_report"
  | "public_reanalysis_only";

/**
 * `verified_distinct_identity` is an identity/provenance statement only. It is
 * not statistical independence and does not imply a lower error correlation.
 */
export interface ActiveInformationActionCandidateV1 {
  id: string;
  claimId: string;
  eligibilityDecisionId: string;
  actionRef: { id: string; version: string };
  targetIds: string[];
  sourceDistinctness: SourceDistinctnessStatusV1;
  /** Authority records supporting the stated relation; empty only for unknown. */
  sourceRelationRefs: string[];
  informationAccess: InformationAccessModeV1;
  expectedObservationKinds: Array<"evidence" | "belief_report" | "provenance_record">;
  cost: {
    computeUnits: number;
    latencyUnits: number;
  };
  available: boolean;
}

/**
 * Candidates are assumed to have passed a separately frozen eligibility rule.
 * This kernel arbitrates among them; it does not decide that a claim is risky
 * enough to create a candidate.
 */

export interface TruthBlindActionDecisionV1 {
  artifactSchemaRef: typeof TRUTH_BLIND_ACTION_DECISION_V1;
  policyRef: typeof SOURCE_NOVELTY_ACTION_POLICY_V1;
  inferenceStatus: "frozen_heuristic_not_value_optimal";
  claimId: string;
  decision: "selected" | "abstain" | "escalate";
  reasonCode:
    | "source_novelty_candidate_selected"
    | "no_admissible_action"
    | "no_admissible_action_high_consequence";
  consideredCandidateIds: string[];
  selectedAction?: ActiveInformationActionCandidateV1;
  budgetBefore: { computeUnits: number; latencyUnits: number };
  sourceRiskHash: string;
  contentHash: string;
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

function requireVersionedRef(value: { id: string; version: string }, field: string): void {
  requireExactKeys(value, ["id", "version"], field);
  requireNonEmpty(value.id, `${field}.id`);
  if (!/^\d+\.\d+\.\d+$/.test(value.version)) throw new Error(`${field}.version must be semantic x.y.z`);
}

function requireUnitInterval(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be finite within [0,1]`);
  }
}

function requireUniqueNonEmpty(values: readonly string[], field: string): void {
  if (!Array.isArray(values) || values.some(value => typeof value !== "string" || value.trim().length === 0)) {
    throw new Error(`${field} must contain non-empty strings`);
  }
  if (new Set(values).size !== values.length) throw new Error(`${field} must not contain duplicates`);
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

function finalize<T>(value: T): Readonly<T> {
  return deepFreeze(clone(value));
}

function availableDimension(
  value: number,
  interpretation: string,
  sourceRefs: string[],
): OnlineRiskDimensionV1 {
  requireUnitInterval(value, "online risk dimension");
  return { status: "available", value, interpretation, sourceRefs: [...sourceRefs].sort() };
}

function missingDimension(
  reason: Extract<OnlineRiskDimensionV1, { status: "missing" }>['reason'],
  interpretation: string,
  sourceRefs: string[] = [],
): OnlineRiskDimensionV1 {
  return { status: "missing", reason, interpretation, sourceRefs: [...sourceRefs].sort() };
}

function validateConsequence(value: DeclaredConsequenceV1): void {
  requireExactKeys(value, ["level", "contractRef"], "consequence");
  if (!["low", "moderate", "high", "critical"].includes(value.level)) {
    throw new Error("consequence.level is invalid");
  }
  requireVersionedRef(value.contractRef, "consequence.contractRef");
}

function validatePromptSensitivity(value: QualifiedPromptSensitivityObservationV1): void {
  requireExactKeys(value, [
    "status", "claimId", "asOfRound", "methodRef", "maxPairwiseBeliefDistance", "sourceArtifactHashes",
  ], "promptSensitivity");
  if (value.status !== "measurement_qualified") throw new Error("promptSensitivity is not measurement-qualified");
  requireNonEmpty(value.claimId, "promptSensitivity.claimId");
  if (!Number.isSafeInteger(value.asOfRound) || value.asOfRound < 0) throw new Error("promptSensitivity.asOfRound is invalid");
  requireVersionedRef(value.methodRef, "promptSensitivity.methodRef");
  requireUnitInterval(value.maxPairwiseBeliefDistance, "promptSensitivity.maxPairwiseBeliefDistance");
  requireUniqueNonEmpty(value.sourceArtifactHashes, "promptSensitivity.sourceArtifactHashes");
  if (value.sourceArtifactHashes.length === 0) throw new Error("promptSensitivity requires source artifacts");
}

export function projectOnlineEpistemicRiskV1(input: {
  collectiveState: CollectiveEpistemicStateV1;
  consequence: DeclaredConsequenceV1;
  promptSensitivity?: QualifiedPromptSensitivityObservationV1;
}): Readonly<OnlineEpistemicRiskV1> {
  requireExactKeys(
    input,
    input.promptSensitivity === undefined
      ? ["collectiveState", "consequence"]
      : ["collectiveState", "consequence", "promptSensitivity"],
    "online epistemic risk input",
  );
  validateCollectiveEpistemicStateV1(input.collectiveState);
  validateConsequence(input.consequence);
  if (input.promptSensitivity) {
    validatePromptSensitivity(input.promptSensitivity);
    if (input.promptSensitivity.claimId !== input.collectiveState.claimId
      || input.promptSensitivity.asOfRound > input.collectiveState.asOfRound) {
      throw new Error("promptSensitivity is not aligned with the collective state");
    }
  }

  const lineage = input.collectiveState.declaredLineageDiversity;
  const response = input.collectiveState.observedResponseConcentration;
  const body: Omit<OnlineEpistemicRiskV1, "contentHash"> = {
    artifactSchemaRef: ONLINE_EPISTEMIC_RISK_V1,
    inferenceStatus: "online_descriptive_risk_only",
    claimId: input.collectiveState.claimId,
    asOfRound: input.collectiveState.asOfRound,
    consequence: clone(input.consequence),
    dimensions: {
      promptConditionedDisagreement: availableDimension(
        input.collectiveState.betweenAgentDisagreement,
        "Disagreement among reports elicited under the recorded prompt contract; not latent disagreement.",
        input.collectiveState.latestReportIds,
      ),
      declaredSourceConcentration: lineage.completeness === "complete"
        ? availableDimension(
            1 - lineage.normalizedLineageEntropy!,
            "Concentration of declared lineage identities; not statistical error correlation or source independence.",
            input.collectiveState.latestReportIds,
          )
        : missingDimension(
            "declared_lineage_incomplete",
            "No numeric concentration is emitted when any active report lacks declared lineage.",
            lineage.missingLineageReportIds,
          ),
      promptSensitivity: input.promptSensitivity
        ? availableDimension(
            input.promptSensitivity.maxPairwiseBeliefDistance,
            "Maximum response distance within one measurement-qualified frozen prompt family.",
            input.promptSensitivity.sourceArtifactHashes,
          )
        : missingDimension(
            "qualified_prompt_perturbation_absent",
            "Prompt sensitivity is unknown; absence is not encoded as zero.",
          ),
      observedResponseConcentration: response.status === "available"
        ? availableDimension(
            response.normalizedHerfindahl!,
            "Concentration of architecture-observed response mass; not causal influence.",
            Object.keys(response.responseMassBySourceAgent),
          )
        : missingDimension(
            "exposure_conditioned_response_absent",
            "No exposure-conditioned response mass is available; absence is not encoded as zero.",
          ),
      qualifiedUnsupportedness: missingDimension(
        "qualified_support_observation_absent",
        "Lineage identity and citation presence do not establish factual support; a qualified support instrument is required.",
      ),
    },
    sourceCollectiveStateHash: input.collectiveState.contentHash,
  };
  const result: OnlineEpistemicRiskV1 = { ...body, contentHash: fingerprintEstimatorValue(body) };
  return finalize(result);
}

function validateCandidate(candidate: ActiveInformationActionCandidateV1): void {
  requireExactKeys(candidate, [
    "id", "claimId", "eligibilityDecisionId", "actionRef", "targetIds", "sourceDistinctness",
    "sourceRelationRefs", "informationAccess", "expectedObservationKinds", "cost", "available",
  ], `candidate:${candidate.id || "unknown"}`);
  requireNonEmpty(candidate.id, "candidate.id");
  requireNonEmpty(candidate.claimId, "candidate.claimId");
  requireNonEmpty(candidate.eligibilityDecisionId, "candidate.eligibilityDecisionId");
  requireVersionedRef(candidate.actionRef, "candidate.actionRef");
  requireUniqueNonEmpty(candidate.targetIds, "candidate.targetIds");
  if (candidate.targetIds.length === 0) throw new Error("candidate.targetIds must not be empty");
  if (!["verified_distinct_identity", "declared_distinct_identity", "unknown_relation", "same_declared_lineage"]
    .includes(candidate.sourceDistinctness)) throw new Error("candidate.sourceDistinctness is invalid");
  requireUniqueNonEmpty(candidate.sourceRelationRefs, "candidate.sourceRelationRefs");
  if (candidate.sourceDistinctness !== "unknown_relation" && candidate.sourceRelationRefs.length === 0) {
    throw new Error("a known source relation requires authority references");
  }
  if (!["new_external_observation", "new_private_report", "public_reanalysis_only"]
    .includes(candidate.informationAccess)) throw new Error("candidate.informationAccess is invalid");
  requireUniqueNonEmpty(candidate.expectedObservationKinds, "candidate.expectedObservationKinds");
  if (candidate.expectedObservationKinds.length === 0
    || candidate.expectedObservationKinds.some(kind => !["evidence", "belief_report", "provenance_record"].includes(kind))) {
    throw new Error("candidate.expectedObservationKinds is invalid");
  }
  requireExactKeys(candidate.cost, ["computeUnits", "latencyUnits"], "candidate.cost");
  if (!Number.isFinite(candidate.cost.computeUnits) || candidate.cost.computeUnits < 0
    || !Number.isFinite(candidate.cost.latencyUnits) || candidate.cost.latencyUnits < 0) {
    throw new Error("candidate.cost must be finite and non-negative");
  }
  if (typeof candidate.available !== "boolean") throw new Error("candidate.available must be boolean");
}

function distinctnessRank(value: SourceDistinctnessStatusV1): number {
  return {
    verified_distinct_identity: 4,
    declared_distinct_identity: 3,
    unknown_relation: 2,
    same_declared_lineage: 1,
  }[value];
}

function accessRank(value: InformationAccessModeV1): number {
  return {
    new_external_observation: 3,
    new_private_report: 2,
    public_reanalysis_only: 1,
  }[value];
}

function compareCandidates(
  left: ActiveInformationActionCandidateV1,
  right: ActiveInformationActionCandidateV1,
): number {
  const distinctness = distinctnessRank(right.sourceDistinctness) - distinctnessRank(left.sourceDistinctness);
  if (distinctness !== 0) return distinctness;
  const access = accessRank(right.informationAccess) - accessRank(left.informationAccess);
  if (access !== 0) return access;
  if (left.cost.computeUnits !== right.cost.computeUnits) return left.cost.computeUnits - right.cost.computeUnits;
  if (left.cost.latencyUnits !== right.cost.latencyUnits) return left.cost.latencyUnits - right.cost.latencyUnits;
  return left.id.localeCompare(right.id);
}

function riskBody(value: OnlineEpistemicRiskV1): Omit<OnlineEpistemicRiskV1, "contentHash"> {
  const { contentHash: _contentHash, ...body } = value;
  return body;
}

export function validateOnlineEpistemicRiskV1(value: OnlineEpistemicRiskV1): void {
  requireExactKeys(value, [
    "artifactSchemaRef", "inferenceStatus", "claimId", "asOfRound", "consequence",
    "dimensions", "sourceCollectiveStateHash", "contentHash",
  ], "online epistemic risk");
  requireExactKeys(value.artifactSchemaRef, ["id", "version"], "online epistemic risk schema ref");
  if (canonicalizeEstimatorValue(value.artifactSchemaRef) !== canonicalizeEstimatorValue(ONLINE_EPISTEMIC_RISK_V1)) {
    throw new Error("online epistemic risk schema ref is invalid");
  }
  if (value.inferenceStatus !== "online_descriptive_risk_only") throw new Error("online epistemic risk overclaims authority");
  requireNonEmpty(value.claimId, "online epistemic risk claimId");
  if (!Number.isSafeInteger(value.asOfRound) || value.asOfRound < 0) throw new Error("online epistemic risk round is invalid");
  validateConsequence(value.consequence);
  requireExactKeys(value.dimensions, [
    "promptConditionedDisagreement", "declaredSourceConcentration", "promptSensitivity",
    "observedResponseConcentration", "qualifiedUnsupportedness",
  ], "online epistemic risk dimensions");
  for (const [name, dimension] of Object.entries(value.dimensions)) {
    if (dimension.status === "available") {
      requireExactKeys(dimension, ["status", "value", "interpretation", "sourceRefs"], `dimension:${name}`);
      requireUnitInterval(dimension.value, `dimension:${name}.value`);
    } else if (dimension.status === "missing") {
      requireExactKeys(dimension, ["status", "reason", "interpretation", "sourceRefs"], `dimension:${name}`);
      if (!["declared_lineage_incomplete", "qualified_prompt_perturbation_absent",
        "qualified_support_observation_absent", "exposure_conditioned_response_absent"].includes(dimension.reason)) {
        throw new Error(`dimension:${name}.reason is invalid`);
      }
    } else {
      throw new Error(`dimension:${name}.status is invalid`);
    }
    requireNonEmpty(dimension.interpretation, `dimension:${name}.interpretation`);
    requireUniqueNonEmpty(dimension.sourceRefs, `dimension:${name}.sourceRefs`);
  }
  requireNonEmpty(value.sourceCollectiveStateHash, "online epistemic risk sourceCollectiveStateHash");
  if (value.contentHash !== fingerprintEstimatorValue(riskBody(value))) throw new Error("online epistemic risk contentHash mismatch");
}

function decisionBody(value: TruthBlindActionDecisionV1): Omit<TruthBlindActionDecisionV1, "contentHash"> {
  const { contentHash: _contentHash, ...body } = value;
  return body;
}

export function selectTruthBlindInformationActionV1(input: {
  risk: OnlineEpistemicRiskV1;
  candidates: ActiveInformationActionCandidateV1[];
  availableBudget: { computeUnits: number; latencyUnits: number };
}): Readonly<TruthBlindActionDecisionV1> {
  requireExactKeys(input, ["risk", "candidates", "availableBudget"], "truth-blind action input");
  validateOnlineEpistemicRiskV1(input.risk);
  requireExactKeys(input.availableBudget, ["computeUnits", "latencyUnits"], "availableBudget");
  if (!Number.isFinite(input.availableBudget.computeUnits) || input.availableBudget.computeUnits < 0
    || !Number.isFinite(input.availableBudget.latencyUnits) || input.availableBudget.latencyUnits < 0) {
    throw new Error("availableBudget must be finite and non-negative");
  }
  if (!Array.isArray(input.candidates)) throw new Error("candidates must be an array");
  input.candidates.forEach(validateCandidate);
  requireUniqueNonEmpty(input.candidates.map(candidate => candidate.id), "candidate ids");
  if (input.candidates.some(candidate => candidate.claimId !== input.risk.claimId)) {
    throw new Error("all candidates must target the risk claim");
  }
  const consideredCandidateIds = input.candidates.map(candidate => candidate.id).sort();
  const admissible = input.candidates
    .filter(candidate => candidate.available
      && candidate.cost.computeUnits <= input.availableBudget.computeUnits
      && candidate.cost.latencyUnits <= input.availableBudget.latencyUnits)
    .map(clone)
    .sort(compareCandidates);

  const selected = admissible[0];
  const highConsequence = input.risk.consequence.level === "high" || input.risk.consequence.level === "critical";
  const base: Omit<TruthBlindActionDecisionV1, "contentHash"> = selected
    ? {
        artifactSchemaRef: TRUTH_BLIND_ACTION_DECISION_V1,
        policyRef: SOURCE_NOVELTY_ACTION_POLICY_V1,
        inferenceStatus: "frozen_heuristic_not_value_optimal",
        claimId: input.risk.claimId,
        decision: "selected",
        reasonCode: "source_novelty_candidate_selected",
        consideredCandidateIds,
        selectedAction: selected,
        budgetBefore: clone(input.availableBudget),
        sourceRiskHash: input.risk.contentHash,
      }
    : {
        artifactSchemaRef: TRUTH_BLIND_ACTION_DECISION_V1,
        policyRef: SOURCE_NOVELTY_ACTION_POLICY_V1,
        inferenceStatus: "frozen_heuristic_not_value_optimal",
        claimId: input.risk.claimId,
        decision: highConsequence ? "escalate" : "abstain",
        reasonCode: highConsequence ? "no_admissible_action_high_consequence" : "no_admissible_action",
        consideredCandidateIds,
        budgetBefore: clone(input.availableBudget),
        sourceRiskHash: input.risk.contentHash,
      };
  return finalize({ ...base, contentHash: fingerprintEstimatorValue(base) });
}

export function validateTruthBlindActionDecisionV1(value: TruthBlindActionDecisionV1): void {
  requireExactKeys(value,
    value.decision === "selected"
      ? ["artifactSchemaRef", "policyRef", "inferenceStatus", "claimId", "decision", "reasonCode",
          "consideredCandidateIds", "selectedAction", "budgetBefore", "sourceRiskHash", "contentHash"]
      : ["artifactSchemaRef", "policyRef", "inferenceStatus", "claimId", "decision", "reasonCode",
          "consideredCandidateIds", "budgetBefore", "sourceRiskHash", "contentHash"],
    "truth-blind action decision",
  );
  if (canonicalizeEstimatorValue(value.artifactSchemaRef)
    !== canonicalizeEstimatorValue(TRUTH_BLIND_ACTION_DECISION_V1)) {
    throw new Error("truth-blind action decision schema ref is invalid");
  }
  if (canonicalizeEstimatorValue(value.policyRef) !== canonicalizeEstimatorValue(SOURCE_NOVELTY_ACTION_POLICY_V1)) {
    throw new Error("truth-blind action policy ref is invalid");
  }
  if (value.inferenceStatus !== "frozen_heuristic_not_value_optimal") {
    throw new Error("truth-blind action decision overclaims value optimality");
  }
  requireNonEmpty(value.claimId, "truth-blind action decision claimId");
  requireUniqueNonEmpty(value.consideredCandidateIds, "consideredCandidateIds");
  if ([...value.consideredCandidateIds].sort().some((id, index) => id !== value.consideredCandidateIds[index])) {
    throw new Error("consideredCandidateIds must use canonical lexical order");
  }
  requireExactKeys(value.budgetBefore, ["computeUnits", "latencyUnits"], "budgetBefore");
  if (!Number.isFinite(value.budgetBefore.computeUnits) || value.budgetBefore.computeUnits < 0
    || !Number.isFinite(value.budgetBefore.latencyUnits) || value.budgetBefore.latencyUnits < 0) {
    throw new Error("budgetBefore must be finite and non-negative");
  }
  if (value.decision === "selected") {
    if (value.reasonCode !== "source_novelty_candidate_selected" || !value.selectedAction) {
      throw new Error("selected action decision is inconsistent");
    }
    validateCandidate(value.selectedAction);
    if (!value.consideredCandidateIds.includes(value.selectedAction.id)) throw new Error("selected action was not considered");
    if (!value.selectedAction.available
      || value.selectedAction.claimId !== value.claimId
      || value.selectedAction.cost.computeUnits > value.budgetBefore.computeUnits
      || value.selectedAction.cost.latencyUnits > value.budgetBefore.latencyUnits) {
      throw new Error("selected action is not admissible under the recorded decision boundary");
    }
  } else if (value.decision === "escalate") {
    if (value.reasonCode !== "no_admissible_action_high_consequence") throw new Error("escalation reason is inconsistent");
  } else if (value.decision === "abstain") {
    if (value.reasonCode !== "no_admissible_action") throw new Error("abstention reason is inconsistent");
  } else {
    throw new Error("truth-blind action decision is invalid");
  }
  requireNonEmpty(value.sourceRiskHash, "sourceRiskHash");
  if (value.contentHash !== fingerprintEstimatorValue(decisionBody(value))) {
    throw new Error("truth-blind action decision contentHash mismatch");
  }
}

export function replayTruthBlindInformationActionV1(input: {
  risk: OnlineEpistemicRiskV1;
  candidates: ActiveInformationActionCandidateV1[];
  availableBudget: { computeUnits: number; latencyUnits: number };
  stored: TruthBlindActionDecisionV1;
}): Readonly<TruthBlindActionDecisionV1> {
  requireExactKeys(input, ["risk", "candidates", "availableBudget", "stored"], "truth-blind action replay input");
  validateTruthBlindActionDecisionV1(input.stored);
  const replayed = selectTruthBlindInformationActionV1({
    risk: input.risk,
    candidates: input.candidates,
    availableBudget: input.availableBudget,
  });
  if (replayed.contentHash !== input.stored.contentHash) throw new Error("truth-blind action replay mismatch");
  return replayed;
}
