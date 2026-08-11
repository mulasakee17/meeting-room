import type {
  GovernanceDiagnosisRecord,
  GovernanceEligibilityEvaluation,
  GovernanceEligibilityRule,
} from "./controlContracts";
import {
  REPORTED_BELIEF_CERTAINTY_V1,
  epistemicRefKey,
} from "../epistemic";
import {
  evaluateScalarThresholdPolicy,
  type ScalarThresholdPolicyV1,
} from "./thresholdPolicy";
import {
  DUPLICATED_LINEAGE_POOL_RULE_V1,
  HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2,
  PRE_EXPOSURE_COUNTERCHECK_RULE_V1,
} from "./standardEpistemicActions";

export const HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_V2 = Object.freeze({
  id: "swarmalpha.risk.high-certainty-insufficient-lineage",
  version: "2.0.0",
});

export const PRE_EXPOSURE_COUNTERCHECK_OPPORTUNITY_V1 = Object.freeze({
  id: "swarmalpha.opportunity.pre-exposure-countercheck",
  version: "1.0.0",
});

export const DUPLICATED_LINEAGE_POOL_DIAGNOSIS_V1 = Object.freeze({
  id: "swarmalpha.risk.duplicated-lineage-pool",
  version: "1.0.0",
});

type EvaluationWithoutConfig = Omit<GovernanceEligibilityEvaluation, "ruleConfig">;

function diagnosisKey(diagnosis: GovernanceDiagnosisRecord): string {
  return `${diagnosis.diagnosisRef.id}@${diagnosis.diagnosisRef.version}`;
}

function findDiagnosis(
  diagnoses: readonly GovernanceDiagnosisRecord[],
  ref: { id: string; version: string },
): GovernanceDiagnosisRecord | undefined {
  const matches = diagnoses.filter(diagnosis => diagnosisKey(diagnosis) === `${ref.id}@${ref.version}`);
  if (matches.length > 1) throw new Error(`Expected at most one diagnosis for ${ref.id}@${ref.version}`);
  return matches[0];
}

function stringAttribute(diagnosis: GovernanceDiagnosisRecord, key: string): string {
  const value = diagnosis.attributes[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Diagnosis ${diagnosis.id} attributes.${key} must be a non-empty string`);
  }
  return value;
}

function booleanAttribute(diagnosis: GovernanceDiagnosisRecord, key: string): boolean {
  const value = diagnosis.attributes[key];
  if (typeof value !== "boolean") throw new Error(`Diagnosis ${diagnosis.id} attributes.${key} must be boolean`);
  return value;
}

function numberAttribute(diagnosis: GovernanceDiagnosisRecord, key: string): number {
  const value = diagnosis.attributes[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Diagnosis ${diagnosis.id} attributes.${key} must be finite`);
  }
  return value;
}

function stringArrayAttribute(diagnosis: GovernanceDiagnosisRecord, key: string): string[] {
  const value = diagnosis.attributes[key];
  if (!Array.isArray(value)
    || value.some(item => typeof item !== "string" || item.trim().length === 0)
    || new Set(value).size !== value.length) {
    throw new Error(`Diagnosis ${diagnosis.id} attributes.${key} must contain unique non-empty strings`);
  }
  return [...value].sort();
}

function ineligible(
  ruleRef: { id: string; version: string },
  reason: string,
  diagnosis?: GovernanceDiagnosisRecord,
): EvaluationWithoutConfig {
  return {
    ruleRef,
    eligible: false,
    reason,
    sourceDiagnosisIds: diagnosis ? [diagnosis.id] : [],
  };
}

export interface VerificationEligibilityConfig {
  certaintyThresholdPolicy: ScalarThresholdPolicyV1;
  /**
   * Frozen comparability domain for the certainty threshold. Omission is the
   * legacy binary/K=2 domain so historical v2 rule registries remain replayable.
   * A categorical rule must declare its option count explicitly; thresholds
   * must never migrate silently across belief kinds or values of K.
   */
  beliefDomain?: {
    beliefKind: "binary" | "categorical";
    claimOptionCount: number;
  };
  maxVerifiedIndependentLineages: number;
  verifierId: string;
  matchedTokenBudget: number;
  expectedModelCalls: number;
  priority: number;
}

export function createVerificationRequestEligibilityRule(
  config: VerificationEligibilityConfig,
): GovernanceEligibilityRule {
  const threshold = config.certaintyThresholdPolicy;
  const beliefDomain = config.beliefDomain ?? { beliefKind: "binary" as const, claimOptionCount: 2 };
  if ((beliefDomain.beliefKind !== "binary" && beliefDomain.beliefKind !== "categorical")
    || !Number.isSafeInteger(beliefDomain.claimOptionCount)
    || beliefDomain.claimOptionCount < 2
    || (beliefDomain.beliefKind === "binary" && beliefDomain.claimOptionCount !== 2)) {
    throw new Error("verification beliefDomain must identify binary/K=2 or categorical/K>=2");
  }
  if (epistemicRefKey(threshold.quantityRef) !== epistemicRefKey(REPORTED_BELIEF_CERTAINTY_V1)) {
    throw new Error("verification eligibility must use the registered reported-belief certainty quantity");
  }
  if (threshold.authority.kind !== "randomized_experiment_only") {
    throw new Error("v2 verification eligibility only permits preregistered randomized-experiment thresholds");
  }
  const uninformativeCertainty = 1 / beliefDomain.claimOptionCount;
  if (threshold.operator !== "gte"
    || threshold.bounds.lower === undefined
    || threshold.bounds.lower <= uninformativeCertainty) {
    throw new Error(
      `verification certainty threshold must be a frozen gte bound above the ${beliefDomain.beliefKind}/K=${beliefDomain.claimOptionCount} uniform baseline`,
    );
  }
  // Full quantity-domain, cost, missingness and authority validation.
  evaluateScalarThresholdPolicy(
    threshold,
    REPORTED_BELIEF_CERTAINTY_V1,
    {
      id: "validation:certainty-threshold",
      quantityRef: threshold.quantityRef,
      observedAt: threshold.frozenAt,
      sourceObservationIds: ["validation:source"],
      value: threshold.bounds.lower,
    },
    threshold.frozenAt,
  );
  if (!Number.isSafeInteger(config.maxVerifiedIndependentLineages)
    || config.maxVerifiedIndependentLineages < 0) {
    throw new Error("maxVerifiedIndependentLineages must be a non-negative safe integer");
  }
  if (config.verifierId.trim().length === 0) throw new Error("verifierId must be non-empty");
  if (!Number.isSafeInteger(config.matchedTokenBudget) || config.matchedTokenBudget < 0) {
    throw new Error("matchedTokenBudget must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(config.expectedModelCalls) || config.expectedModelCalls < 0) {
    throw new Error("expectedModelCalls must be a non-negative safe integer");
  }
  if (!Number.isFinite(config.priority)) throw new Error("priority must be finite");
  const frozenConfig = Object.freeze(structuredClone(config));
  const frozenBeliefDomain = Object.freeze(structuredClone(beliefDomain));
  return {
    ...HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2,
    config: frozenConfig,
    evaluate(context): EvaluationWithoutConfig {
      const diagnosis = findDiagnosis(context.diagnoses, HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_V2);
      if (!diagnosis) return ineligible(HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2, "Required diagnosis is absent.");
      if (epistemicRefKey(diagnosis.quantityRef) !== epistemicRefKey(REPORTED_BELIEF_CERTAINTY_V1)) {
        throw new Error("Verification diagnosis must carry the registered reported-belief certainty quantity");
      }
      const claimId = stringAttribute(diagnosis, "claimId");
      stringAttribute(diagnosis, "beliefReportId");
      const beliefKind = stringAttribute(diagnosis, "beliefKind");
      if (beliefKind !== "binary" && beliefKind !== "categorical") {
        throw new Error("Verification diagnosis attributes.beliefKind must be binary or categorical");
      }
      const rawOptionCount = diagnosis.attributes.claimOptionCount;
      const diagnosisOptionCount = rawOptionCount === undefined && beliefKind === "binary"
        ? 2
        : numberAttribute(diagnosis, "claimOptionCount");
      if (!Number.isSafeInteger(diagnosisOptionCount) || diagnosisOptionCount < 2
        || (beliefKind === "binary" && diagnosisOptionCount !== 2)) {
        throw new Error("Verification diagnosis attributes.claimOptionCount is incompatible with beliefKind");
      }
      const claimResolved = booleanAttribute(diagnosis, "claimResolved");
      const verifierAvailable = booleanAttribute(diagnosis, "verifierAvailable");
      const lineageCount = numberAttribute(diagnosis, "verifiedIndependentLineageCount");
      if (!Number.isSafeInteger(lineageCount) || lineageCount < 0) {
        throw new Error("verifiedIndependentLineageCount must be a non-negative safe integer");
      }
      if (claimResolved) return ineligible(HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2, "Claim is already resolved.", diagnosis);
      if (!verifierAvailable) return ineligible(HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2, "Verifier is unavailable.", diagnosis);
      if (beliefKind !== frozenBeliefDomain.beliefKind
        || diagnosisOptionCount !== frozenBeliefDomain.claimOptionCount) {
        return ineligible(
          HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2,
          "Reported certainty is outside the rule's frozen belief calibration domain.",
          diagnosis,
        );
      }
      const thresholdEvaluation = evaluateScalarThresholdPolicy(
        frozenConfig.certaintyThresholdPolicy,
        REPORTED_BELIEF_CERTAINTY_V1,
        {
          id: `threshold-observation:${diagnosis.id}`,
          quantityRef: diagnosis.quantityRef,
          observedAt: diagnosis.createdAt,
          sourceObservationIds: diagnosis.sourceObservationIds,
          value: diagnosis.value,
        },
        diagnosis.createdAt,
      );
      if (!thresholdEvaluation.eligible) {
        return ineligible(HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2, "Reported certainty is below the frozen threshold.", diagnosis);
      }
      if (lineageCount > frozenConfig.maxVerifiedIndependentLineages) {
        return ineligible(HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2, "Independent lineage support is sufficient.", diagnosis);
      }
      if (diagnosis.targetIds.length !== 1) {
        throw new Error("Verification diagnosis must target exactly one agent");
      }
      return {
        ruleRef: HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2,
        eligible: true,
        reason: "High reported probability lacks sufficient verified independent lineage support.",
        sourceDiagnosisIds: [diagnosis.id],
        candidate: {
          actionRef: { id: "swarmalpha.action.verification-request", version: "2.0.0" },
          targetIds: [...diagnosis.targetIds],
          sourceDiagnosisIds: [diagnosis.id],
          priority: frozenConfig.priority,
          parameters: {
            claimId,
            verifierId: frozenConfig.verifierId,
            matchedTokenBudget: frozenConfig.matchedTokenBudget,
          },
          expectedCost: {
            modelCalls: frozenConfig.expectedModelCalls,
            tokenBudget: frozenConfig.matchedTokenBudget,
          },
          rationale: "Request verification without assuming that the high-probability report is wrong.",
        },
      };
    },
  };
}

export interface CountercheckEligibilityConfig {
  matchedTokenBudgetPerAgent: number;
  priority: number;
}

export function createIndependentCountercheckEligibilityRule(
  config: CountercheckEligibilityConfig,
): GovernanceEligibilityRule {
  if (!Number.isSafeInteger(config.matchedTokenBudgetPerAgent)
    || config.matchedTokenBudgetPerAgent < 0) {
    throw new Error("matchedTokenBudgetPerAgent must be a non-negative safe integer");
  }
  if (!Number.isFinite(config.priority)) throw new Error("priority must be finite");
  const frozenConfig = Object.freeze({ ...config });
  return {
    ...PRE_EXPOSURE_COUNTERCHECK_RULE_V1,
    config: frozenConfig,
    evaluate(context): EvaluationWithoutConfig {
      const diagnosis = findDiagnosis(context.diagnoses, PRE_EXPOSURE_COUNTERCHECK_OPPORTUNITY_V1);
      if (!diagnosis) return ineligible(PRE_EXPOSURE_COUNTERCHECK_RULE_V1, "Required opportunity record is absent.");
      const claimId = stringAttribute(diagnosis, "claimId");
      const claimResolved = booleanAttribute(diagnosis, "claimResolved");
      const excludedReportIds = stringArrayAttribute(diagnosis, "excludedReportIds");
      if (claimResolved) return ineligible(PRE_EXPOSURE_COUNTERCHECK_RULE_V1, "Claim is already resolved.", diagnosis);
      if (diagnosis.targetIds.length === 0) {
        return ineligible(PRE_EXPOSURE_COUNTERCHECK_RULE_V1, "No unexposed target agent is available.", diagnosis);
      }
      return {
        ruleRef: PRE_EXPOSURE_COUNTERCHECK_RULE_V1,
        eligible: true,
        reason: "At least one agent can provide a pre-exposure independent countercheck.",
        sourceDiagnosisIds: [diagnosis.id],
        candidate: {
          actionRef: { id: "swarmalpha.action.independent-countercheck", version: "1.0.0" },
          targetIds: [...diagnosis.targetIds].sort(),
          sourceDiagnosisIds: [diagnosis.id],
          priority: frozenConfig.priority,
          parameters: {
            claimId,
            excludedReportIds,
            matchedTokenBudget: frozenConfig.matchedTokenBudgetPerAgent * diagnosis.targetIds.length,
          },
          expectedCost: {
            modelCalls: diagnosis.targetIds.length,
            tokenBudget: frozenConfig.matchedTokenBudgetPerAgent * diagnosis.targetIds.length,
          },
          rationale: "Collect independent reports before exposing targets to the disputed report.",
        },
      };
    },
  };
}

export interface LineageCapEligibilityConfig {
  maxWeightPerLineage: number;
  expectedComputeUnits: number;
  priority: number;
}

export function createLineageCapEligibilityRule(
  config: LineageCapEligibilityConfig,
): GovernanceEligibilityRule {
  if (!Number.isFinite(config.maxWeightPerLineage) || config.maxWeightPerLineage <= 0) {
    throw new Error("maxWeightPerLineage must be positive and finite");
  }
  if (!Number.isFinite(config.expectedComputeUnits) || config.expectedComputeUnits < 0) {
    throw new Error("expectedComputeUnits must be non-negative and finite");
  }
  if (!Number.isFinite(config.priority)) throw new Error("priority must be finite");
  const frozenConfig = Object.freeze({ ...config });
  return {
    ...DUPLICATED_LINEAGE_POOL_RULE_V1,
    config: frozenConfig,
    evaluate(context): EvaluationWithoutConfig {
      const diagnosis = findDiagnosis(context.diagnoses, DUPLICATED_LINEAGE_POOL_DIAGNOSIS_V1);
      if (!diagnosis) return ineligible(DUPLICATED_LINEAGE_POOL_RULE_V1, "Required diagnosis is absent.");
      const claimId = stringAttribute(diagnosis, "claimId");
      const claimResolved = booleanAttribute(diagnosis, "claimResolved");
      const duplicateLineageCount = numberAttribute(diagnosis, "duplicateLineageCount");
      if (!Number.isSafeInteger(duplicateLineageCount) || duplicateLineageCount < 0) {
        throw new Error("duplicateLineageCount must be a non-negative safe integer");
      }
      if (claimResolved) return ineligible(DUPLICATED_LINEAGE_POOL_RULE_V1, "Claim is already resolved.", diagnosis);
      if (duplicateLineageCount === 0) {
        return ineligible(DUPLICATED_LINEAGE_POOL_RULE_V1, "No duplicated lineage is present.", diagnosis);
      }
      if (diagnosis.targetIds.length !== 1 || diagnosis.targetIds[0] !== claimId) {
        throw new Error("Lineage-pool diagnosis must target exactly its claimId");
      }
      return {
        ruleRef: DUPLICATED_LINEAGE_POOL_RULE_V1,
        eligible: true,
        reason: "Multiple active reports share at least one declared source lineage.",
        sourceDiagnosisIds: [diagnosis.id],
        candidate: {
          actionRef: { id: "swarmalpha.action.lineage-capped-pool", version: "1.0.0" },
          targetIds: [claimId],
          sourceDiagnosisIds: [diagnosis.id],
          priority: frozenConfig.priority,
          parameters: { claimId, maxWeightPerLineage: frozenConfig.maxWeightPerLineage },
          expectedCost: { computeUnits: frozenConfig.expectedComputeUnits },
          rationale: "Cap correlated source mass without inferring that duplicated reports are false.",
        },
      };
    },
  };
}
