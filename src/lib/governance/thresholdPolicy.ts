import {
  epistemicRefKey,
  validateCalibrationArtifact,
  validateEpistemicRef,
  validateEpistemicQuantityContract,
  type CalibrationArtifactV1,
  type EpistemicQuantityContractV1,
  type VersionedEpistemicRef,
} from "../epistemic";

export type ScalarThresholdOperator = "gte" | "lte" | "between" | "outside";

export interface ScalarThresholdPolicyV1 {
  id: string;
  version: string;
  quantityRef: VersionedEpistemicRef;
  operator: ScalarThresholdOperator;
  bounds: { lower?: number; upper?: number };
  authority:
    | {
        kind: "randomized_experiment_only";
        preregistrationRef: VersionedEpistemicRef;
      }
    | {
        kind: "calibrated_randomized_experiment" | "operational";
        calibrationArtifactRef: VersionedEpistemicRef;
        calibrationDomain: string;
      };
  selection:
    | {
        kind: "fixed_preregistered";
        methodRef: VersionedEpistemicRef;
      }
    | {
        kind: "calibration_derived";
        methodRef: VersionedEpistemicRef;
        calibrationArtifactRef: VersionedEpistemicRef;
      };
  costs: {
    falsePositive: number;
    falseNegative: number;
    abstention: number;
    action: number;
  };
  missingResult: "ineligible";
  frozenAt: string;
}

export interface ScalarQuantityObservation {
  id: string;
  quantityRef: VersionedEpistemicRef;
  observedAt: string;
  sourceObservationIds: string[];
  value?: number;
  missing?: {
    reason: string;
    missingFields: string[];
  };
}

export interface ScalarThresholdEvaluation {
  policyRef: VersionedEpistemicRef;
  quantityRef: VersionedEpistemicRef;
  observationId: string;
  outcome: "eligible" | "ineligible" | "missing";
  eligible: boolean;
  reason: string;
  evaluatedAt: string;
}

const VERSION_RE = /^\d+\.\d+\.\d+$/;

function requireNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be non-empty`);
}

function requireUniqueNonEmpty(values: readonly string[], field: string): void {
  if (!Array.isArray(values) || values.length === 0
    || values.some(value => typeof value !== "string" || value.trim().length === 0)
    || new Set(values).size !== values.length) {
    throw new Error(`${field} must contain unique non-empty strings`);
  }
}

function scalarDomain(contract: EpistemicQuantityContractV1): { min: number; max: number } {
  if (contract.valueDomain.kind === "probability") return { min: 0, max: 1 };
  if (contract.valueDomain.kind === "bounded_scalar") return contract.valueDomain;
  if (contract.valueDomain.kind === "nonnegative_count") return { min: 0, max: Number.MAX_SAFE_INTEGER };
  throw new Error("threshold policies require a scalar quantity contract");
}

function validateBound(value: number | undefined, field: string): void {
  if (value !== undefined && !Number.isFinite(value)) throw new Error(`${field} must be finite when present`);
}

export function validateScalarThresholdPolicy(
  policy: ScalarThresholdPolicyV1,
  quantity: EpistemicQuantityContractV1,
  calibrationArtifact?: CalibrationArtifactV1,
): void {
  if (!policy || typeof policy !== "object") throw new Error("threshold policy must be an object");
  requireNonEmpty(policy.id, "thresholdPolicy.id");
  if (!VERSION_RE.test(policy.version)) throw new Error("thresholdPolicy.version must be semantic x.y.z");
  validateEpistemicQuantityContract(quantity);
  if (epistemicRefKey(policy.quantityRef) !== epistemicRefKey(quantity)) {
    throw new Error("threshold policy quantityRef does not match the supplied quantity contract");
  }
  if (!quantity.allowedUses.includes("eligibility")) {
    throw new Error("threshold policy quantity is not authorized for eligibility use");
  }
  if (quantity.truthAccess === "required" || quantity.availableFrom === "post_resolution") {
    throw new Error("post-resolution or truth-dependent quantities cannot drive threshold eligibility");
  }
  if (!(["gte", "lte", "between", "outside"] as const).includes(policy.operator)) {
    throw new Error("thresholdPolicy.operator is not supported");
  }
  validateBound(policy.bounds.lower, "thresholdPolicy.bounds.lower");
  validateBound(policy.bounds.upper, "thresholdPolicy.bounds.upper");
  if ((policy.operator === "gte" || policy.operator === "lte")
    && (policy.bounds.lower === undefined || policy.bounds.upper !== undefined)) {
    throw new Error("gte/lte threshold policies require exactly bounds.lower");
  }
  if ((policy.operator === "between" || policy.operator === "outside")
    && (policy.bounds.lower === undefined
      || policy.bounds.upper === undefined
      || policy.bounds.lower > policy.bounds.upper)) {
    throw new Error("between/outside threshold policies require lower <= upper");
  }
  const domain = scalarDomain(quantity);
  for (const [field, bound] of Object.entries(policy.bounds)) {
    if (bound !== undefined && (bound < domain.min || bound > domain.max)) {
      throw new Error(`thresholdPolicy.bounds.${field} is outside the quantity domain`);
    }
  }
  if (policy.missingResult !== "ineligible") {
    throw new Error("threshold policy missing observations must be ineligible");
  }
  for (const [name, cost] of Object.entries(policy.costs)) {
    if (!Number.isFinite(cost) || cost < 0) {
      throw new Error(`thresholdPolicy.costs.${name} must be finite and non-negative`);
    }
  }
  if (!Number.isFinite(Date.parse(policy.frozenAt))) {
    throw new Error("thresholdPolicy.frozenAt must be an ISO timestamp");
  }
  validateEpistemicRef(policy.selection.methodRef, "thresholdPolicy.selection.methodRef");
  if (policy.authority.kind === "randomized_experiment_only") {
    validateEpistemicRef(policy.authority.preregistrationRef, "thresholdPolicy.authority.preregistrationRef");
    if (policy.selection.kind !== "fixed_preregistered") {
      throw new Error("uncalibrated randomized thresholds must be fixed and preregistered");
    }
    if (calibrationArtifact !== undefined) {
      throw new Error("randomized-experiment-only threshold policy must not receive a calibration artifact");
    }
  } else {
    validateEpistemicRef(
      policy.authority.calibrationArtifactRef,
      "thresholdPolicy.authority.calibrationArtifactRef",
    );
    requireNonEmpty(policy.authority.calibrationDomain, "thresholdPolicy.authority.calibrationDomain");
    if (policy.selection.kind !== "calibration_derived") {
      throw new Error("calibrated threshold authority requires calibration-derived selection");
    }
    validateEpistemicRef(
      policy.selection.calibrationArtifactRef,
      "thresholdPolicy.selection.calibrationArtifactRef",
    );
    if (!calibrationArtifact) throw new Error("calibrated threshold authority requires its calibration artifact");
    validateCalibrationArtifact(calibrationArtifact);
    if (calibrationArtifact.status !== "held_out_evaluated") {
      throw new Error("calibrated threshold authority requires held-out evaluation");
    }
    const artifactKey = epistemicRefKey(calibrationArtifact.artifactRef);
    if (epistemicRefKey(policy.authority.calibrationArtifactRef) !== artifactKey
      || epistemicRefKey(policy.selection.calibrationArtifactRef) !== artifactKey) {
      throw new Error("threshold policy calibration artifact references do not match the supplied artifact");
    }
    if (epistemicRefKey(calibrationArtifact.quantityRef) !== epistemicRefKey(quantity)) {
      throw new Error("threshold calibration artifact was fitted for a different quantity");
    }
    if (calibrationArtifact.domain.calibrationDomain !== policy.authority.calibrationDomain) {
      throw new Error("threshold policy calibration domain does not match the artifact");
    }
    if (policy.authority.kind === "operational"
      && !quantity.allowedUses.includes("operational_control")) {
      throw new Error("quantity contract does not permit operational control");
    }
  }
}

export function defineScalarThresholdPolicy(
  policy: ScalarThresholdPolicyV1,
  quantity: EpistemicQuantityContractV1,
  calibrationArtifact?: CalibrationArtifactV1,
): Readonly<ScalarThresholdPolicyV1> {
  validateScalarThresholdPolicy(policy, quantity, calibrationArtifact);
  return deepFreeze(structuredClone(policy));
}

export function evaluateScalarThresholdPolicy(
  policy: ScalarThresholdPolicyV1,
  quantity: EpistemicQuantityContractV1,
  observation: ScalarQuantityObservation,
  evaluatedAt: string,
  calibrationArtifact?: CalibrationArtifactV1,
): ScalarThresholdEvaluation {
  validateScalarThresholdPolicy(policy, quantity, calibrationArtifact);
  requireNonEmpty(observation.id, "thresholdObservation.id");
  validateEpistemicRef(observation.quantityRef, "thresholdObservation.quantityRef");
  if (epistemicRefKey(observation.quantityRef) !== epistemicRefKey(policy.quantityRef)) {
    throw new Error("threshold observation quantityRef does not match the policy");
  }
  const observedAtMs = Date.parse(observation.observedAt);
  const evaluatedAtMs = Date.parse(evaluatedAt);
  if (!Number.isFinite(observedAtMs)) {
    throw new Error("thresholdObservation.observedAt must be an ISO timestamp");
  }
  if (!Number.isFinite(evaluatedAtMs)) throw new Error("evaluatedAt must be an ISO timestamp");
  if (Date.parse(policy.frozenAt) > observedAtMs) {
    throw new Error("threshold policy must be frozen before the observation it evaluates");
  }
  if (evaluatedAtMs < observedAtMs) {
    throw new Error("threshold evaluation cannot precede its observation");
  }
  requireUniqueNonEmpty(observation.sourceObservationIds, "thresholdObservation.sourceObservationIds");
  const hasValue = observation.value !== undefined;
  const hasMissing = observation.missing !== undefined;
  if (hasValue === hasMissing) {
    throw new Error("threshold observation must contain exactly one of value or missing");
  }
  const policyRef = { id: policy.id, version: policy.version };
  if (observation.missing) {
    requireNonEmpty(observation.missing.reason, "thresholdObservation.missing.reason");
    requireUniqueNonEmpty(observation.missing.missingFields, "thresholdObservation.missing.missingFields");
    return {
      policyRef,
      quantityRef: structuredClone(observation.quantityRef),
      observationId: observation.id,
      outcome: "missing",
      eligible: false,
      reason: `Observation missing: ${observation.missing.reason}`,
      evaluatedAt,
    };
  }
  const value = observation.value as number;
  if (!Number.isFinite(value)) throw new Error("threshold observation value must be finite");
  const domain = scalarDomain(quantity);
  if (value < domain.min || value > domain.max) {
    throw new Error("threshold observation value is outside the quantity domain");
  }
  const lower = policy.bounds.lower as number;
  const upper = policy.bounds.upper;
  const eligible = policy.operator === "gte"
    ? value >= lower
    : policy.operator === "lte"
      ? value <= lower
      : policy.operator === "between"
        ? value >= lower && value <= (upper as number)
        : value < lower || value > (upper as number);
  return {
    policyRef,
    quantityRef: structuredClone(observation.quantityRef),
    observationId: observation.id,
    outcome: eligible ? "eligible" : "ineligible",
    eligible,
    reason: eligible ? "Frozen threshold condition satisfied." : "Frozen threshold condition not satisfied.",
    evaluatedAt,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
