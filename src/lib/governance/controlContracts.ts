/**
 * Governance control contracts.
 *
 * These objects deliberately separate an observed risk signal from a policy
 * decision. A detector may describe a pattern without thereby gaining
 * permission to control the system.
 */

export interface VersionedGovernanceRef {
  id: string;
  version: string;
}

export type GovernanceControlMode =
  | "observe_only"
  | "randomized_experiment"
  | "operational";

export type GovernanceTargetKind = "agent" | "group" | "claim" | "protocol";

export type InterventionFamily =
  | "information_acquisition"
  | "information_exposure"
  | "deliberation_process"
  | "aggregation"
  | "participation"
  | "resource_exit";

export type InterventionDeliveryMode =
  | "prompt"
  | "tool_request"
  | "state_mutation"
  | "aggregation_rule"
  | "protocol_change";

export type ComplianceObservability = "observable" | "unobservable";

export type DiagnosisControlEvidence =
  | {
      status: "descriptive_only";
      controlUse: "observe_only";
    }
  | {
      status: "experimental_candidate";
      controlUse: "randomized_experiment_only";
      preregistrationRef: VersionedGovernanceRef;
    }
  | {
      status: "calibrated";
      controlUse: "randomized_experiment_only" | "operational";
      calibrationArtifactRef: VersionedGovernanceRef;
      calibrationDomain: string;
    };

export interface GovernanceMeasurementQuality {
  observationCompleteness: "complete" | "partial" | "missing";
  missingFields: string[];
  measurementReliability:
    | { status: "unknown" }
    | {
        status: "estimated" | "validated";
        score: number;
        methodRef: VersionedGovernanceRef;
      };
  constructValidity: "descriptive_only" | "predictive_candidate" | "validated";
}

/** A versioned interpretation of observable records, not a latent diagnosis. */
export interface GovernanceDiagnosisRecord {
  id: string;
  diagnosisRef: VersionedGovernanceRef;
  /** Semantic identity of the scalar observation interpreted by this diagnosis. */
  quantityRef: VersionedGovernanceRef;
  round: number;
  label: string;
  interpretation: "descriptive_risk" | "predictive_risk";
  value: number;
  /** Versioned diagnosis-specific observables; replayable data only. */
  attributes: Record<string, unknown>;
  targetIds: string[];
  /** Versioned observation records supporting this interpretation. */
  sourceObservationIds: string[];
  measurement: GovernanceMeasurementQuality;
  controlEvidence: DiagnosisControlEvidence;
  createdAt: string;
}

export interface InterventionMediatorContract {
  metricRef: VersionedGovernanceRef;
  expectedDirection: "increase" | "decrease" | "non_inferiority";
  /** Offset relative to the delivery round. */
  window: { startOffset: number; endOffset: number };
}

export interface InterventionRandomizationContract {
  unit: "run" | "eligible_event";
  applyArm: string;
  holdoutArm: string;
  shamArm?: string;
  shamActionRef?: VersionedGovernanceRef;
  shamCostPolicy?: "match_apply_candidate";
}

/**
 * Immutable semantic definition of an action. It defines what is manipulated,
 * what delivery means, and what mediator should move. It does not claim that
 * the mediator or final task outcome actually changed.
 */
export interface InterventionContract {
  id: string;
  version: string;
  label: string;
  family: InterventionFamily;
  targetKind: GovernanceTargetKind;
  deliveryMode: InterventionDeliveryMode;
  complianceObservability: ComplianceObservability;
  targetCardinality: { min: number; max?: number };
  parameterContract: { required: string[]; allowed: string[] };
  eligibilityRuleRefs: VersionedGovernanceRef[];
  mediators: InterventionMediatorContract[];
  costDimensions: string[];
  contraindicationCodes: string[];
  conflictsWithActionIds: string[];
  randomization: InterventionRandomizationContract;
  /** Core actions are opt-in until a policy explicitly selects them. */
  enabledByDefault: false;
}

export interface GovernanceActionCandidate {
  actionRef: VersionedGovernanceRef;
  targetIds: string[];
  sourceDiagnosisIds: string[];
  priority: number;
  parameters: Record<string, unknown>;
  expectedCost: Record<string, number>;
  rationale: string;
}

export interface GovernanceEligibilityEvaluation {
  ruleRef: VersionedGovernanceRef;
  ruleConfig: Record<string, unknown>;
  eligible: boolean;
  reason: string;
  sourceDiagnosisIds: string[];
  candidate?: GovernanceActionCandidate;
}

export interface GovernanceEligibilityContext {
  round: number;
  diagnoses: readonly GovernanceDiagnosisRecord[];
  availableBudget: Readonly<Record<string, number>>;
}

/** Pure, versioned policy rule. Runtime state must arrive through context. */
export interface GovernanceEligibilityRule {
  id: string;
  version: string;
  config: Record<string, unknown>;
  evaluate(context: GovernanceEligibilityContext): Omit<GovernanceEligibilityEvaluation, "ruleConfig">;
}

export interface GovernancePolicyContract {
  id: string;
  version: string;
  controlMode: GovernanceControlMode;
  preregistrationRef?: VersionedGovernanceRef;
  eligibilityRuleRefs: VersionedGovernanceRef[];
  maxActionsPerDecision: number;
  arbitration: "priority_then_stable_id";
  assignmentDesign?: {
    designRef: VersionedGovernanceRef;
    seedNamespace: string;
    allocations: Array<{
      actionRef: VersionedGovernanceRef;
      unit: "run" | "eligible_event";
      arms: Array<{ id: string; probability: number }>;
    }>;
  };
  /** Confirmatory policies cannot mutate thresholds/dosage from run outcomes. */
  onlineAdaptation: "forbidden" | "exploratory_only";
}

export interface GovernanceActionAssignmentRef {
  id: string;
  unitKind: "run" | "eligible_event";
  assignedArm: string;
  assignmentProbability: number;
  assignedAt: string;
}

export type GovernanceDecisionOutcome =
  | "observe_only"
  | "no_eligible_action"
  | "awaiting_assignment"
  | "held_out"
  | "selected";

export interface GovernanceDecisionRecord {
  id: string;
  policyRef: VersionedGovernanceRef;
  round: number;
  diagnosisIds: string[];
  evaluations: GovernanceEligibilityEvaluation[];
  candidateActions: GovernanceActionCandidate[];
  selectedActions: GovernanceActionCandidate[];
  assignment?: GovernanceActionAssignmentRef;
  outcome: GovernanceDecisionOutcome;
  arbitrationReason: string;
  budgetBefore: Record<string, number>;
  budgetCommitted: Record<string, number>;
  sourceEventIds: string[];
  decidedAt: string;
}

const VERSION_RE = /^\d+\.\d+\.\d+$/;

export function governanceRefKey(ref: VersionedGovernanceRef): string {
  return `${ref.id}@${ref.version}`;
}

export function validateGovernanceRef(ref: VersionedGovernanceRef, field: string): void {
  if (!ref || typeof ref.id !== "string" || ref.id.trim().length === 0) {
    throw new Error(`${field}.id must be non-empty`);
  }
  if (typeof ref.version !== "string" || !VERSION_RE.test(ref.version)) {
    throw new Error(`${field}.version must be semantic x.y.z`);
  }
}

function requireUniqueNonEmpty(values: readonly string[], field: string): void {
  if (values.some(value => typeof value !== "string" || value.trim().length === 0)) {
    throw new Error(`${field} must contain only non-empty strings`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`${field} must not contain duplicates`);
  }
}

function validateFiniteUnit(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be finite within [0,1]`);
  }
}

function assertOneOf(value: unknown, allowed: readonly string[], field: string): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${field} is invalid`);
  }
}

export function validateReplayableGovernanceValue(
  value: unknown,
  field: string,
  ancestors = new Set<object>(),
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${field} must contain only finite numbers`);
    return;
  }
  if (typeof value !== "object") throw new Error(`${field} must be replayable JSON data`);
  if (ancestors.has(value)) throw new Error(`${field} must not contain cycles`);
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${field} must contain only plain objects and arrays`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new Error(`${field} must not contain sparse arrays`);
        }
        validateReplayableGovernanceValue(value[index], `${field}[${index}]`, ancestors);
      }
    } else {
      for (const [key, child] of Object.entries(value)) {
        validateReplayableGovernanceValue(child, `${field}.${key}`, ancestors);
      }
    }
  } finally {
    ancestors.delete(value);
  }
}

export function validateGovernanceDiagnosis(record: GovernanceDiagnosisRecord): void {
  if (!record || typeof record.id !== "string" || record.id.trim().length === 0) {
    throw new Error("diagnosis.id must be non-empty");
  }
  validateGovernanceRef(record.diagnosisRef, "diagnosis.diagnosisRef");
  validateGovernanceRef(record.quantityRef, "diagnosis.quantityRef");
  if (!Number.isSafeInteger(record.round) || record.round < 1) {
    throw new Error("diagnosis.round must be a positive safe integer");
  }
  if (record.label.trim().length === 0) throw new Error("diagnosis.label must be non-empty");
  assertOneOf(record.interpretation, ["descriptive_risk", "predictive_risk"], "diagnosis.interpretation");
  if (!Number.isFinite(record.value)) throw new Error("diagnosis.value must be finite");
  if (!record.attributes || typeof record.attributes !== "object" || Array.isArray(record.attributes)) {
    throw new Error("diagnosis.attributes must be an object");
  }
  validateReplayableGovernanceValue(record.attributes, "diagnosis.attributes");
  requireUniqueNonEmpty(record.targetIds, "diagnosis.targetIds");
  requireUniqueNonEmpty(record.sourceObservationIds, "diagnosis.sourceObservationIds");
  if (record.targetIds.length === 0) throw new Error("diagnosis.targetIds must be non-empty");
  if (record.sourceObservationIds.length === 0) {
    throw new Error("diagnosis.sourceObservationIds must be non-empty");
  }
  assertOneOf(
    record.measurement.observationCompleteness,
    ["complete", "partial", "missing"],
    "diagnosis.measurement.observationCompleteness",
  );
  assertOneOf(
    record.measurement.constructValidity,
    ["descriptive_only", "predictive_candidate", "validated"],
    "diagnosis.measurement.constructValidity",
  );
  requireUniqueNonEmpty(record.measurement.missingFields, "diagnosis.measurement.missingFields");
  if (record.measurement.observationCompleteness === "complete"
    && record.measurement.missingFields.length > 0) {
    throw new Error("complete diagnosis measurement must not list missingFields");
  }
  if (record.measurement.observationCompleteness !== "complete"
    && record.measurement.missingFields.length === 0) {
    throw new Error("partial or missing diagnosis measurement must list missingFields");
  }
  if (record.measurement.observationCompleteness === "missing"
    && record.controlEvidence.controlUse !== "observe_only") {
    throw new Error("missing observations cannot receive control permission");
  }
  const reliability = record.measurement.measurementReliability;
  assertOneOf(reliability.status, ["unknown", "estimated", "validated"], "diagnosis.measurement.measurementReliability.status");
  if (reliability.status !== "unknown") {
    validateFiniteUnit(reliability.score, "diagnosis.measurement.measurementReliability.score");
    validateGovernanceRef(reliability.methodRef, "diagnosis.measurement.measurementReliability.methodRef");
  }
  const evidence = record.controlEvidence;
  assertOneOf(
    evidence.status,
    ["descriptive_only", "experimental_candidate", "calibrated"],
    "diagnosis.controlEvidence.status",
  );
  if (evidence.status === "descriptive_only") {
    assertOneOf(evidence.controlUse, ["observe_only"], "diagnosis.controlEvidence.controlUse");
    if (record.interpretation !== "descriptive_risk"
      || record.measurement.constructValidity !== "descriptive_only") {
      throw new Error("descriptive-only control evidence requires descriptive interpretation and construct validity");
    }
  } else if (evidence.status === "experimental_candidate") {
    assertOneOf(
      evidence.controlUse,
      ["randomized_experiment_only"],
      "diagnosis.controlEvidence.controlUse",
    );
    validateGovernanceRef(evidence.preregistrationRef, "diagnosis.controlEvidence.preregistrationRef");
    if (record.measurement.constructValidity === "validated") {
      throw new Error("experimental candidate cannot claim validated construct validity");
    }
  } else {
    assertOneOf(
      evidence.controlUse,
      ["randomized_experiment_only", "operational"],
      "diagnosis.controlEvidence.controlUse",
    );
    validateGovernanceRef(evidence.calibrationArtifactRef, "diagnosis.controlEvidence.calibrationArtifactRef");
    if (evidence.calibrationDomain.trim().length === 0) {
      throw new Error("calibrated diagnosis must declare calibrationDomain");
    }
    if (record.interpretation !== "predictive_risk"
      || record.measurement.constructValidity !== "validated") {
      throw new Error("calibrated control evidence requires predictive interpretation and validated construct validity");
    }
  }
  if (typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))) {
    throw new Error("diagnosis.createdAt must be an ISO-compatible timestamp");
  }
}

export function validateInterventionContract(contract: InterventionContract): void {
  validateGovernanceRef(contract, "interventionContract");
  if (contract.label.trim().length === 0) throw new Error("interventionContract.label must be non-empty");
  assertOneOf(contract.family, [
    "information_acquisition",
    "information_exposure",
    "deliberation_process",
    "aggregation",
    "participation",
    "resource_exit",
  ], "interventionContract.family");
  assertOneOf(contract.targetKind, ["agent", "group", "claim", "protocol"], "interventionContract.targetKind");
  assertOneOf(contract.deliveryMode, [
    "prompt",
    "tool_request",
    "state_mutation",
    "aggregation_rule",
    "protocol_change",
  ], "interventionContract.deliveryMode");
  assertOneOf(
    contract.complianceObservability,
    ["observable", "unobservable"],
    "interventionContract.complianceObservability",
  );
  if (contract.enabledByDefault !== false) {
    throw new Error("interventionContract.enabledByDefault must be false");
  }
  if (!Number.isSafeInteger(contract.targetCardinality.min)
    || contract.targetCardinality.min < 0
    || (contract.targetCardinality.max !== undefined
      && (!Number.isSafeInteger(contract.targetCardinality.max)
        || contract.targetCardinality.max < contract.targetCardinality.min))) {
    throw new Error("interventionContract.targetCardinality must be a valid non-negative interval");
  }
  requireUniqueNonEmpty(contract.parameterContract.required, "interventionContract.parameterContract.required");
  requireUniqueNonEmpty(contract.parameterContract.allowed, "interventionContract.parameterContract.allowed");
  if (contract.parameterContract.required.some(key => !contract.parameterContract.allowed.includes(key))) {
    throw new Error("interventionContract required parameters must be allowed");
  }
  if (contract.eligibilityRuleRefs.length === 0) {
    throw new Error("interventionContract.eligibilityRuleRefs must be non-empty");
  }
  if (new Set(contract.eligibilityRuleRefs.map(governanceRefKey)).size
    !== contract.eligibilityRuleRefs.length) {
    throw new Error("interventionContract.eligibilityRuleRefs must not contain duplicates");
  }
  if (contract.mediators.length === 0) {
    throw new Error("interventionContract.mediators must be non-empty");
  }
  for (const [index, ref] of contract.eligibilityRuleRefs.entries()) {
    validateGovernanceRef(ref, `interventionContract.eligibilityRuleRefs[${index}]`);
  }
  for (const [index, mediator] of contract.mediators.entries()) {
    validateGovernanceRef(mediator.metricRef, `interventionContract.mediators[${index}].metricRef`);
    assertOneOf(
      mediator.expectedDirection,
      ["increase", "decrease", "non_inferiority"],
      `interventionContract.mediators[${index}].expectedDirection`,
    );
    if (!Number.isSafeInteger(mediator.window.startOffset)
      || !Number.isSafeInteger(mediator.window.endOffset)
      || mediator.window.startOffset < 0
      || mediator.window.endOffset < mediator.window.startOffset) {
      throw new Error("intervention mediator window must be a non-negative ordered interval");
    }
  }
  requireUniqueNonEmpty(contract.costDimensions, "interventionContract.costDimensions");
  if (contract.costDimensions.length === 0) {
    throw new Error("interventionContract.costDimensions must be non-empty");
  }
  requireUniqueNonEmpty(contract.contraindicationCodes, "interventionContract.contraindicationCodes");
  requireUniqueNonEmpty(contract.conflictsWithActionIds, "interventionContract.conflictsWithActionIds");
  const randomization = contract.randomization;
  assertOneOf(randomization.unit, ["run", "eligible_event"], "interventionContract.randomization.unit");
  if (randomization.applyArm.trim().length === 0 || randomization.holdoutArm.trim().length === 0) {
    throw new Error("intervention randomization applyArm/holdoutArm must be non-empty");
  }
  if (randomization.applyArm === randomization.holdoutArm) {
    throw new Error("intervention randomization applyArm and holdoutArm must differ");
  }
  if (randomization.shamArm !== undefined) {
    if (randomization.shamArm.trim().length === 0
      || randomization.shamArm === randomization.applyArm
      || randomization.shamArm === randomization.holdoutArm) {
      throw new Error("intervention randomization shamArm must be unique and non-empty");
    }
    if (!randomization.shamActionRef) {
      throw new Error("intervention randomization shamArm requires shamActionRef");
    }
    if (randomization.shamCostPolicy !== "match_apply_candidate") {
      throw new Error("intervention randomization shamArm requires match_apply_candidate cost policy");
    }
    validateGovernanceRef(randomization.shamActionRef, "interventionContract.randomization.shamActionRef");
  } else if (randomization.shamActionRef !== undefined || randomization.shamCostPolicy !== undefined) {
    throw new Error("intervention randomization shamActionRef/shamCostPolicy require shamArm");
  }
}

export function validateGovernancePolicy(contract: GovernancePolicyContract): void {
  validateGovernanceRef(contract, "governancePolicy");
  assertOneOf(contract.controlMode, ["observe_only", "randomized_experiment", "operational"], "governancePolicy.controlMode");
  assertOneOf(contract.arbitration, ["priority_then_stable_id"], "governancePolicy.arbitration");
  assertOneOf(contract.onlineAdaptation, ["forbidden", "exploratory_only"], "governancePolicy.onlineAdaptation");
  if (contract.eligibilityRuleRefs.length === 0) {
    throw new Error("governancePolicy.eligibilityRuleRefs must be non-empty");
  }
  if (new Set(contract.eligibilityRuleRefs.map(governanceRefKey)).size
    !== contract.eligibilityRuleRefs.length) {
    throw new Error("governancePolicy.eligibilityRuleRefs must not contain duplicates");
  }
  for (const [index, ref] of contract.eligibilityRuleRefs.entries()) {
    validateGovernanceRef(ref, `governancePolicy.eligibilityRuleRefs[${index}]`);
  }
  if (!Number.isSafeInteger(contract.maxActionsPerDecision)
    || contract.maxActionsPerDecision < 1) {
    throw new Error("governancePolicy.maxActionsPerDecision must be a positive safe integer");
  }
  if (contract.controlMode === "operational" && contract.onlineAdaptation !== "forbidden") {
    throw new Error("operational governance policy must forbid online adaptation");
  }
  if (contract.controlMode === "randomized_experiment") {
    if (!contract.preregistrationRef) {
      throw new Error("randomized experimental policy must declare preregistrationRef");
    }
    validateGovernanceRef(contract.preregistrationRef, "governancePolicy.preregistrationRef");
    const design = contract.assignmentDesign;
    if (!design) throw new Error("randomized experimental policy must declare assignmentDesign");
    validateGovernanceRef(design.designRef, "governancePolicy.assignmentDesign.designRef");
    if (typeof design.seedNamespace !== "string" || design.seedNamespace.trim().length === 0) {
      throw new Error("governancePolicy.assignmentDesign.seedNamespace must be non-empty");
    }
    if (!Array.isArray(design.allocations) || design.allocations.length === 0) {
      throw new Error("governancePolicy.assignmentDesign.allocations must be non-empty");
    }
    const allocationKeys = new Set<string>();
    for (const allocation of design.allocations) {
      validateGovernanceRef(allocation.actionRef, "governancePolicy.assignmentDesign.actionRef");
      const key = governanceRefKey(allocation.actionRef);
      if (allocationKeys.has(key)) throw new Error("governancePolicy assignment allocations must be unique by action");
      allocationKeys.add(key);
      assertOneOf(allocation.unit, ["run", "eligible_event"], "governancePolicy.assignmentDesign.unit");
      if (!Array.isArray(allocation.arms) || allocation.arms.length < 2) {
        throw new Error("governancePolicy assignment allocation requires at least two arms");
      }
      const armIds = allocation.arms.map(arm => arm.id);
      if (armIds.some(id => typeof id !== "string" || id.trim().length === 0)
        || new Set(armIds).size !== armIds.length) {
        throw new Error("governancePolicy assignment arm ids must be unique and non-empty");
      }
      for (const arm of allocation.arms) {
        if (!Number.isFinite(arm.probability) || arm.probability <= 0 || arm.probability > 1) {
          throw new Error("governancePolicy assignment probabilities must be within (0,1]");
        }
      }
      const total = allocation.arms.reduce((sum, arm) => sum + arm.probability, 0);
      if (Math.abs(total - 1) > 1e-9) {
        throw new Error("governancePolicy assignment probabilities must sum to 1");
      }
    }
  } else if (contract.preregistrationRef !== undefined) {
    validateGovernanceRef(contract.preregistrationRef, "governancePolicy.preregistrationRef");
    if (contract.assignmentDesign !== undefined) {
      throw new Error("non-randomized governance policy must not declare assignmentDesign");
    }
  } else if (contract.assignmentDesign !== undefined) {
    throw new Error("non-randomized governance policy must not declare assignmentDesign");
  }
}

export function validateGovernanceActionCandidate(candidate: GovernanceActionCandidate): void {
  validateGovernanceRef(candidate.actionRef, "candidate.actionRef");
  requireUniqueNonEmpty(candidate.targetIds, "candidate.targetIds");
  requireUniqueNonEmpty(candidate.sourceDiagnosisIds, "candidate.sourceDiagnosisIds");
  if (!Number.isFinite(candidate.priority)) throw new Error("candidate.priority must be finite");
  if (candidate.rationale.trim().length === 0) throw new Error("candidate.rationale must be non-empty");
  if (!candidate.parameters || typeof candidate.parameters !== "object" || Array.isArray(candidate.parameters)) {
    throw new Error("candidate.parameters must be an object");
  }
  validateReplayableGovernanceValue(candidate.parameters, "candidate.parameters");
  if (!candidate.expectedCost || typeof candidate.expectedCost !== "object" || Array.isArray(candidate.expectedCost)) {
    throw new Error("candidate.expectedCost must be an object");
  }
  for (const [dimension, value] of Object.entries(candidate.expectedCost)) {
    if (dimension.trim().length === 0 || !Number.isFinite(value) || value < 0) {
      throw new Error("candidate.expectedCost must contain non-negative finite values under non-empty dimensions");
    }
  }
}

export function validateGovernanceActionAssignmentRef(
  assignment: GovernanceActionAssignmentRef,
): void {
  if (!assignment || typeof assignment.id !== "string" || assignment.id.trim().length === 0) {
    throw new Error("assignment.id must be non-empty");
  }
  assertOneOf(assignment.unitKind, ["run", "eligible_event"], "assignment.unitKind");
  if (typeof assignment.assignedArm !== "string" || assignment.assignedArm.trim().length === 0) {
    throw new Error("assignment.assignedArm must be non-empty");
  }
  if (!Number.isFinite(assignment.assignmentProbability)
    || assignment.assignmentProbability <= 0
    || assignment.assignmentProbability > 1) {
    throw new Error("assignment.assignmentProbability must be finite within (0,1]");
  }
  if (typeof assignment.assignedAt !== "string" || !Number.isFinite(Date.parse(assignment.assignedAt))) {
    throw new Error("assignment.assignedAt must be an ISO-compatible timestamp");
  }
}

function canonicalReplayableValue(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

function validateCostRecord(cost: Record<string, number>, field: string): void {
  if (!cost || typeof cost !== "object" || Array.isArray(cost)) {
    throw new Error(`${field} must be an object`);
  }
  for (const [dimension, value] of Object.entries(cost)) {
    if (dimension.trim().length === 0 || !Number.isFinite(value) || value < 0) {
      throw new Error(`${field} must contain non-negative finite values under non-empty dimensions`);
    }
  }
}

/** Structural validation for persisted decision records; it does not rerun rules. */
export function validateGovernanceDecisionRecord(record: GovernanceDecisionRecord): void {
  if (!record || typeof record.id !== "string" || record.id.trim().length === 0) {
    throw new Error("governanceDecision.id must be non-empty");
  }
  validateGovernanceRef(record.policyRef, "governanceDecision.policyRef");
  if (!Number.isSafeInteger(record.round) || record.round < 1) {
    throw new Error("governanceDecision.round must be a positive safe integer");
  }
  requireUniqueNonEmpty(record.diagnosisIds, "governanceDecision.diagnosisIds");
  requireUniqueNonEmpty(record.sourceEventIds, "governanceDecision.sourceEventIds");
  if (!Array.isArray(record.evaluations)) throw new Error("governanceDecision.evaluations must be an array");
  const evaluationKeys = new Set<string>();
  for (const evaluation of record.evaluations) {
    validateGovernanceRef(evaluation.ruleRef, "governanceDecision.evaluation.ruleRef");
    const ruleKey = governanceRefKey(evaluation.ruleRef);
    if (evaluationKeys.has(ruleKey)) throw new Error("governanceDecision evaluations must have unique rule refs");
    evaluationKeys.add(ruleKey);
    validateReplayableGovernanceValue(evaluation.ruleConfig, "governanceDecision.evaluation.ruleConfig");
    if (typeof evaluation.eligible !== "boolean") {
      throw new Error("governanceDecision.evaluation.eligible must be boolean");
    }
    if (typeof evaluation.reason !== "string" || evaluation.reason.trim().length === 0) {
      throw new Error("governanceDecision.evaluation.reason must be non-empty");
    }
    requireUniqueNonEmpty(
      evaluation.sourceDiagnosisIds,
      "governanceDecision.evaluation.sourceDiagnosisIds",
    );
    if (evaluation.sourceDiagnosisIds.some(id => !record.diagnosisIds.includes(id))) {
      throw new Error("governanceDecision evaluation references an undeclared diagnosis");
    }
    if (evaluation.eligible !== Boolean(evaluation.candidate)) {
      throw new Error("eligible governanceDecision evaluation must have exactly one candidate");
    }
    if (evaluation.candidate) validateGovernanceActionCandidate(evaluation.candidate);
  }
  if (!Array.isArray(record.candidateActions) || !Array.isArray(record.selectedActions)) {
    throw new Error("governanceDecision candidateActions/selectedActions must be arrays");
  }
  for (const candidate of record.candidateActions) validateGovernanceActionCandidate(candidate);
  for (const selected of record.selectedActions) validateGovernanceActionCandidate(selected);
  const candidateValues = record.candidateActions.map(canonicalReplayableValue);
  if (new Set(candidateValues).size !== candidateValues.length) {
    throw new Error("governanceDecision.candidateActions must not contain duplicates");
  }
  const evaluatedCandidateValues = record.evaluations
    .filter(evaluation => evaluation.eligible && evaluation.candidate)
    .map(evaluation => canonicalReplayableValue(evaluation.candidate));
  if (candidateValues.some(candidateValue => !evaluatedCandidateValues.includes(candidateValue))) {
    throw new Error("governanceDecision candidateActions must originate from eligible evaluations");
  }
  const isCandidateRealization = (selected: GovernanceActionCandidate): boolean =>
    record.candidateActions.some(candidate => {
      if (canonicalReplayableValue(candidate) === canonicalReplayableValue(selected)) return true;
      if (!record.assignment
        || canonicalReplayableValue([...candidate.targetIds].sort())
          !== canonicalReplayableValue([...selected.targetIds].sort())
        || canonicalReplayableValue([...candidate.sourceDiagnosisIds].sort())
          !== canonicalReplayableValue([...selected.sourceDiagnosisIds].sort())
        || candidate.priority !== selected.priority
        || canonicalReplayableValue(candidate.expectedCost)
          !== canonicalReplayableValue(selected.expectedCost)) return false;
      return Object.entries(selected.parameters).every(([key, value]) =>
        canonicalReplayableValue(candidate.parameters[key]) === canonicalReplayableValue(value));
    });
  for (const selected of record.selectedActions) {
    if (!isCandidateRealization(selected)) {
      throw new Error("governanceDecision selected action is not a realization of candidateActions");
    }
  }
  if (new Set(record.selectedActions.map(canonicalReplayableValue)).size !== record.selectedActions.length) {
    throw new Error("governanceDecision.selectedActions must not contain duplicates");
  }
  if (record.assignment !== undefined) validateGovernanceActionAssignmentRef(record.assignment);
  assertOneOf(record.outcome, [
    "observe_only",
    "no_eligible_action",
    "awaiting_assignment",
    "held_out",
    "selected",
  ], "governanceDecision.outcome");
  if (typeof record.arbitrationReason !== "string" || record.arbitrationReason.trim().length === 0) {
    throw new Error("governanceDecision.arbitrationReason must be non-empty");
  }
  validateCostRecord(record.budgetBefore, "governanceDecision.budgetBefore");
  validateCostRecord(record.budgetCommitted, "governanceDecision.budgetCommitted");
  const recomputedCost: Record<string, number> = {};
  for (const selected of record.selectedActions) {
    for (const [dimension, value] of Object.entries(selected.expectedCost)) {
      recomputedCost[dimension] = (recomputedCost[dimension] ?? 0) + value;
    }
  }
  if (canonicalReplayableValue(recomputedCost) !== canonicalReplayableValue(record.budgetCommitted)) {
    throw new Error("governanceDecision.budgetCommitted must equal selected action costs");
  }
  for (const [dimension, value] of Object.entries(record.budgetCommitted)) {
    if (value > (record.budgetBefore[dimension] ?? 0)) {
      throw new Error("governanceDecision committed budget exceeds available budget");
    }
  }
  if (record.outcome === "selected" && record.selectedActions.length === 0) {
    throw new Error("selected governanceDecision must contain selectedActions");
  }
  if (record.outcome !== "selected" && record.selectedActions.length > 0) {
    throw new Error("only selected governanceDecision may contain selectedActions");
  }
  if (record.outcome === "awaiting_assignment" && record.assignment !== undefined) {
    throw new Error("awaiting_assignment governanceDecision must not contain assignment");
  }
  if (record.outcome === "held_out" && record.assignment === undefined) {
    throw new Error("held_out governanceDecision requires assignment");
  }
  if (typeof record.decidedAt !== "string" || !Number.isFinite(Date.parse(record.decidedAt))) {
    throw new Error("governanceDecision.decidedAt must be an ISO-compatible timestamp");
  }
}
