import { createHash } from "node:crypto";
import {
  GovernanceActionLedger,
  GovernanceDecisionEngine,
  computeGovernanceCandidateSetHash,
  deriveGovernanceAssignmentUnitId,
  governanceRefKey,
  validateGovernanceActionInstance,
  validateGovernanceDecisionRecord,
  validateGovernanceDiagnosis,
  validateGovernanceEventAssignment,
  validateGovernanceRef,
  validateInterventionContract,
  validateReplayableGovernanceValue,
  type GovernanceActionCandidate,
  type GovernanceActionInstance,
  type GovernanceActionTransition,
  type GovernanceDecisionRecord,
  type GovernanceDiagnosisRecord,
  type GovernanceEligibilityRule,
  type GovernanceEventAssignment,
  type InterventionContract,
  type VersionedGovernanceRef,
} from "../governance";
import {
  validateGovernanceStudyContract,
  type GovernanceStudyContract,
} from "./governanceStudy";

export const GOVERNANCE_AUDIT_TRAIL_SCHEMA_V1 = Object.freeze({
  id: "swarmalpha.governance-audit-trail",
  version: "1.0.0",
});

export type GovernanceSourceEventKind =
  | "belief_report"
  | "belief_exposure"
  | "evidence"
  | "evidence_verification"
  | "tool_result"
  | "protocol_event";

/** Immutable, content-addressed input available to an observation projection. */
export interface GovernanceSourceEvent {
  id: string;
  eventRef: VersionedGovernanceRef;
  kind: GovernanceSourceEventKind;
  round: number;
  payload: Record<string, unknown>;
  contentHash: string;
  recordedAt: string;
}

/** A task adapter's descriptive projection; it contains no control permission. */
export interface GovernanceObservationRecord {
  id: string;
  observationRef: VersionedGovernanceRef;
  round: number;
  subjectIds: string[];
  completeness: "complete" | "partial" | "missing";
  missingFields: string[];
  values: Record<string, unknown>;
  sourceEventIds: string[];
  observedAt: string;
}

export interface GovernanceRuleSnapshot {
  ruleRef: VersionedGovernanceRef;
  config: Record<string, unknown>;
}

export interface GovernanceAuditTrail {
  artifactType: "swarmalpha.governance-audit-trail";
  schemaVersion: "1.0.0";
  runId: string;
  status: "open" | "sealed";
  studyContract: GovernanceStudyContract;
  ruleSnapshots: GovernanceRuleSnapshot[];
  interventionContracts: InterventionContract[];
  sourceEvents: GovernanceSourceEvent[];
  observations: GovernanceObservationRecord[];
  diagnoses: GovernanceDiagnosisRecord[];
  eventAssignments: GovernanceEventAssignment[];
  decisions: GovernanceDecisionRecord[];
  actionInstances: GovernanceActionInstance[];
  actionTransitions: GovernanceActionTransition[];
  createdAt: string;
  sealedAt?: string;
}

export interface GovernanceAuditVerification {
  status:
    | "open_structural_replay_verified"
    | "sealed_structural_replay_verified"
    | "open_decision_replay_verified"
    | "sealed_decision_replay_verified";
  runId: string;
  counts: {
    sourceEvents: number;
    observations: number;
    diagnoses: number;
    assignments: number;
    decisions: number;
    actionInstances: number;
    actionTransitions: number;
  };
  /** Structural verification alone does not rerun executable eligibility rules. */
  decisionReplay: "not_performed" | "verified";
}

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const TERMINAL_ACTION_STATES = new Set([
  "completed",
  "censored",
  "held_out",
  "inapplicable",
  "failed",
]);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be non-empty`);
  }
}

function requireTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} must be an ISO-compatible timestamp`);
  }
}

function requireNotBefore(
  value: string,
  lowerBound: string,
  field: string,
  lowerBoundField: string,
): void {
  if (Date.parse(value) < Date.parse(lowerBound)) {
    throw new Error(`${field} must not precede ${lowerBoundField}`);
  }
}

function requireWithinAuditWindow(
  trail: GovernanceAuditTrail,
  value: string,
  field: string,
): void {
  requireNotBefore(value, trail.createdAt, field, "governanceAuditTrail.createdAt");
  if (trail.status === "sealed" && Date.parse(value) > Date.parse(trail.sealedAt!)) {
    throw new Error(`${field} must not follow governanceAuditTrail.sealedAt`);
  }
}

function requireUniqueIds<T extends { id: string }>(records: readonly T[], field: string): Map<string, T> {
  if (!Array.isArray(records)) throw new Error(`${field} must be an array`);
  const result = new Map<string, T>();
  for (const record of records) {
    requireNonEmpty(record?.id, `${field}.id`);
    if (result.has(record.id)) throw new Error(`${field} ids must be unique`);
    result.set(record.id, record);
  }
  return result;
}

function requireUniqueNonEmptyStrings(values: readonly string[], field: string): void {
  if (!Array.isArray(values)
    || values.some(value => typeof value !== "string" || value.trim().length === 0)
    || new Set(values).size !== values.length) {
    throw new Error(`${field} must contain unique non-empty strings`);
  }
}

export function computeGovernanceSourceEventHash(input: {
  eventRef: VersionedGovernanceRef;
  kind: GovernanceSourceEventKind;
  round: number;
  payload: Record<string, unknown>;
}): string {
  const content = canonicalJson({
    eventRef: input.eventRef,
    kind: input.kind,
    round: input.round,
    payload: input.payload,
  });
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

export function validateGovernanceSourceEvent(event: GovernanceSourceEvent): void {
  requireNonEmpty(event?.id, "governanceSourceEvent.id");
  validateGovernanceRef(event.eventRef, "governanceSourceEvent.eventRef");
  if (!["belief_report", "belief_exposure", "evidence", "evidence_verification", "tool_result", "protocol_event"]
    .includes(event.kind)) {
    throw new Error("governanceSourceEvent.kind is invalid");
  }
  if (!Number.isSafeInteger(event.round) || event.round < 0) {
    throw new Error("governanceSourceEvent.round must be a non-negative safe integer");
  }
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    throw new Error("governanceSourceEvent.payload must be an object");
  }
  validateReplayableGovernanceValue(event.payload, "governanceSourceEvent.payload");
  if (!SHA256_RE.test(event.contentHash)
    || computeGovernanceSourceEventHash(event) !== event.contentHash) {
    throw new Error("governanceSourceEvent.contentHash does not match canonical content");
  }
  requireTimestamp(event.recordedAt, "governanceSourceEvent.recordedAt");
}

export function validateGovernanceObservationRecord(
  observation: GovernanceObservationRecord,
): void {
  requireNonEmpty(observation?.id, "governanceObservation.id");
  validateGovernanceRef(observation.observationRef, "governanceObservation.observationRef");
  if (!Number.isSafeInteger(observation.round) || observation.round < 0) {
    throw new Error("governanceObservation.round must be a non-negative safe integer");
  }
  requireUniqueNonEmptyStrings(observation.subjectIds, "governanceObservation.subjectIds");
  if (observation.subjectIds.length === 0) throw new Error("governanceObservation.subjectIds must be non-empty");
  if (!["complete", "partial", "missing"].includes(observation.completeness)) {
    throw new Error("governanceObservation.completeness is invalid");
  }
  requireUniqueNonEmptyStrings(observation.missingFields, "governanceObservation.missingFields");
  if (observation.completeness === "complete" && observation.missingFields.length > 0) {
    throw new Error("complete governanceObservation must not list missingFields");
  }
  if (observation.completeness !== "complete" && observation.missingFields.length === 0) {
    throw new Error("partial/missing governanceObservation must list missingFields");
  }
  if (!observation.values || typeof observation.values !== "object" || Array.isArray(observation.values)) {
    throw new Error("governanceObservation.values must be an object");
  }
  validateReplayableGovernanceValue(observation.values, "governanceObservation.values");
  requireUniqueNonEmptyStrings(observation.sourceEventIds, "governanceObservation.sourceEventIds");
  if (observation.sourceEventIds.length === 0) {
    throw new Error("governanceObservation.sourceEventIds must be non-empty");
  }
  requireTimestamp(observation.observedAt, "governanceObservation.observedAt");
}

function candidateMatchesInstance(
  candidate: GovernanceActionCandidate,
  instance: GovernanceActionInstance,
): boolean {
  return canonicalJson({
    actionRef: candidate.actionRef,
    targetIds: [...candidate.targetIds].sort(),
    sourceDiagnosisIds: [...candidate.sourceDiagnosisIds].sort(),
    parameters: candidate.parameters,
    expectedCost: candidate.expectedCost,
  }) === canonicalJson({
    actionRef: instance.actionRef,
    targetIds: [...instance.targetIds].sort(),
    sourceDiagnosisIds: [...instance.sourceDiagnosisIds].sort(),
    parameters: instance.parameters,
    expectedCost: instance.expectedCost,
  });
}

function verificationResult(
  trail: GovernanceAuditTrail,
  decisionReplay: GovernanceAuditVerification["decisionReplay"],
): GovernanceAuditVerification {
  return {
    status: `${trail.status}_${decisionReplay === "verified"
      ? "decision_replay_verified"
      : "structural_replay_verified"}` as GovernanceAuditVerification["status"],
    runId: trail.runId,
    counts: {
      sourceEvents: trail.sourceEvents.length,
      observations: trail.observations.length,
      diagnoses: trail.diagnoses.length,
      assignments: trail.eventAssignments.length,
      decisions: trail.decisions.length,
      actionInstances: trail.actionInstances.length,
      actionTransitions: trail.actionTransitions.length,
    },
    decisionReplay,
  };
}

/**
 * Replays hashes, references, event assignments, and action lifecycles without
 * executing eligibility-rule code. This is deliberately named structural
 * replay; use `replayGovernanceAuditTrailDecisions` for full decision replay.
 */
export function validateGovernanceAuditTrail(
  trail: GovernanceAuditTrail,
): GovernanceAuditVerification {
  if (!trail || trail.artifactType !== "swarmalpha.governance-audit-trail"
    || trail.schemaVersion !== "1.0.0") {
    throw new Error("governanceAuditTrail artifact/schema mismatch");
  }
  requireNonEmpty(trail.runId, "governanceAuditTrail.runId");
  if (trail.status !== "open" && trail.status !== "sealed") {
    throw new Error("governanceAuditTrail.status is invalid");
  }
  requireTimestamp(trail.createdAt, "governanceAuditTrail.createdAt");
  if (trail.status === "sealed") requireTimestamp(trail.sealedAt, "governanceAuditTrail.sealedAt");
  else if (trail.sealedAt !== undefined) throw new Error("open governanceAuditTrail must not have sealedAt");

  validateGovernanceStudyContract(trail.studyContract);
  if (trail.studyContract.governanceArchitecture !== "auditable_epistemic_v1"
    || !trail.studyContract.governancePolicy) {
    throw new Error("governanceAuditTrail requires auditable_epistemic_v1 study policy");
  }
  const policy = trail.studyContract.governancePolicy;

  const ruleSnapshots = new Map<string, GovernanceRuleSnapshot>();
  for (const snapshot of trail.ruleSnapshots) {
    validateGovernanceRef(snapshot.ruleRef, "governanceAuditTrail.ruleSnapshot.ruleRef");
    validateReplayableGovernanceValue(snapshot.config, "governanceAuditTrail.ruleSnapshot.config");
    const key = governanceRefKey(snapshot.ruleRef);
    if (ruleSnapshots.has(key)) throw new Error("governanceAuditTrail rule snapshots must be unique");
    ruleSnapshots.set(key, snapshot);
  }
  const policyRuleKeys = policy.eligibilityRuleRefs.map(governanceRefKey).sort();
  if (canonicalJson([...ruleSnapshots.keys()].sort()) !== canonicalJson(policyRuleKeys)) {
    throw new Error("governanceAuditTrail rule snapshots must exactly match policy rules");
  }

  const contracts = new Map<string, InterventionContract>();
  for (const contract of trail.interventionContracts) {
    validateInterventionContract(contract);
    const key = governanceRefKey(contract);
    if (contracts.has(key)) throw new Error("governanceAuditTrail intervention contracts must be unique");
    contracts.set(key, contract);
  }
  for (const allocation of policy.assignmentDesign!.allocations) {
    const contract = contracts.get(governanceRefKey(allocation.actionRef));
    if (!contract) throw new Error("governance policy allocation references an unknown intervention contract");
    const expectedArms = [
      contract.randomization.applyArm,
      contract.randomization.holdoutArm,
      ...(contract.randomization.shamArm ? [contract.randomization.shamArm] : []),
    ].sort();
    if (allocation.unit !== contract.randomization.unit
      || canonicalJson(allocation.arms.map(arm => arm.id).sort()) !== canonicalJson(expectedArms)) {
      throw new Error("governance policy allocation does not match its intervention contract");
    }
  }

  const sourceEvents = requireUniqueIds(trail.sourceEvents, "governanceAuditTrail.sourceEvents");
  for (const event of sourceEvents.values()) {
    validateGovernanceSourceEvent(event);
    requireWithinAuditWindow(trail, event.recordedAt, "governanceSourceEvent.recordedAt");
  }
  const observations = requireUniqueIds(trail.observations, "governanceAuditTrail.observations");
  for (const observation of observations.values()) {
    validateGovernanceObservationRecord(observation);
    requireWithinAuditWindow(trail, observation.observedAt, "governanceObservation.observedAt");
    for (const sourceId of observation.sourceEventIds) {
      const source = sourceEvents.get(sourceId);
      if (!source) throw new Error(`governanceObservation references unknown source event ${sourceId}`);
      if (source.round > observation.round) throw new Error("governanceObservation cannot use a future source event");
      requireNotBefore(
        observation.observedAt,
        source.recordedAt,
        "governanceObservation.observedAt",
        "its source event",
      );
    }
  }

  const diagnoses = requireUniqueIds(trail.diagnoses, "governanceAuditTrail.diagnoses");
  for (const diagnosis of diagnoses.values()) {
    validateGovernanceDiagnosis(diagnosis);
    requireWithinAuditWindow(trail, diagnosis.createdAt, "governanceDiagnosis.createdAt");
    for (const observationId of diagnosis.sourceObservationIds) {
      const observation = observations.get(observationId);
      if (!observation) throw new Error(`governanceDiagnosis references unknown observation ${observationId}`);
      if (observation.round > diagnosis.round) throw new Error("governanceDiagnosis cannot use a future observation");
      requireNotBefore(
        diagnosis.createdAt,
        observation.observedAt,
        "governanceDiagnosis.createdAt",
        "its source observation",
      );
    }
  }

  const decisions = requireUniqueIds(trail.decisions, "governanceAuditTrail.decisions");
  for (const decision of decisions.values()) {
    validateGovernanceDecisionRecord(decision);
    requireWithinAuditWindow(trail, decision.decidedAt, "governanceDecision.decidedAt");
    if (governanceRefKey(decision.policyRef) !== governanceRefKey(policy)) {
      throw new Error("governanceDecision policy does not match study policy");
    }
    for (const diagnosisId of decision.diagnosisIds) {
      const diagnosis = diagnoses.get(diagnosisId);
      if (!diagnosis) throw new Error(`governanceDecision references unknown diagnosis ${diagnosisId}`);
      if (diagnosis.round > decision.round) throw new Error("governanceDecision cannot use a future diagnosis");
    }
    for (const sourceId of decision.sourceEventIds) {
      const source = sourceEvents.get(sourceId)
        ?? observations.get(sourceId)
        ?? diagnoses.get(sourceId);
      if (!source) {
        throw new Error(`governanceDecision references unknown source record ${sourceId}`);
      }
      if (source.round > decision.round) {
        throw new Error("governanceDecision cannot use a future source record");
      }
      const sourceTime = "recordedAt" in source
        ? source.recordedAt
        : "observedAt" in source
          ? source.observedAt
          : source.createdAt;
      requireNotBefore(
        decision.decidedAt,
        sourceTime,
        "governanceDecision.decidedAt",
        "its source record",
      );
    }
    for (const evaluation of decision.evaluations) {
      const snapshot = ruleSnapshots.get(governanceRefKey(evaluation.ruleRef));
      if (!snapshot || canonicalJson(snapshot.config) !== canonicalJson(evaluation.ruleConfig)) {
        throw new Error("governanceDecision rule config does not match audit snapshot");
      }
    }
    for (const candidate of decision.candidateActions) {
      if (!contracts.has(governanceRefKey(candidate.actionRef))) {
        throw new Error("governanceDecision candidate references an unknown intervention contract");
      }
    }
  }

  const assignments = requireUniqueIds(
    trail.eventAssignments,
    "governanceAuditTrail.eventAssignments",
  );
  for (const assignment of assignments.values()) {
    validateGovernanceEventAssignment(assignment);
    requireWithinAuditWindow(trail, assignment.assignedAt, "governanceEventAssignment.assignedAt");
    const eligibilityDecision = decisions.get(assignment.eligibilityDecisionId);
    if (!eligibilityDecision || eligibilityDecision.outcome !== "awaiting_assignment") {
      throw new Error("governanceEventAssignment requires a known awaiting-assignment decision");
    }
    const expectedUnitId = deriveGovernanceAssignmentUnitId({
      runId: trail.runId,
      unitKind: assignment.unitKind,
      eligibilityDecisionId: assignment.eligibilityDecisionId,
    });
    if (assignment.unitId !== expectedUnitId) {
      throw new Error("governanceEventAssignment unitId is not canonically derived");
    }
    requireNotBefore(
      assignment.assignedAt,
      eligibilityDecision.decidedAt,
      "governanceEventAssignment.assignedAt",
      "its eligibility decision",
    );
    if (governanceRefKey(assignment.policyRef) !== governanceRefKey(eligibilityDecision.policyRef)
      || canonicalJson(assignment.sourceDiagnosisIds)
        !== canonicalJson([...eligibilityDecision.diagnosisIds].sort())
      || assignment.candidateSetHash
        !== computeGovernanceCandidateSetHash(eligibilityDecision.candidateActions)) {
      throw new Error("governanceEventAssignment does not match its eligibility decision");
    }
    const primary = eligibilityDecision.candidateActions[0];
    const primaryContract = contracts.get(governanceRefKey(primary.actionRef));
    if (!primaryContract || primaryContract.randomization.unit !== assignment.unitKind) {
      throw new Error("governanceEventAssignment unit does not match the primary intervention");
    }
    const expectedArms = [
      primaryContract.randomization.applyArm,
      primaryContract.randomization.holdoutArm,
      ...(primaryContract.randomization.shamArm ? [primaryContract.randomization.shamArm] : []),
    ].sort();
    if (canonicalJson(assignment.arms.map(arm => arm.id).sort()) !== canonicalJson(expectedArms)) {
      throw new Error("governanceEventAssignment arms do not match the primary intervention");
    }
    const design = policy.assignmentDesign!;
    const allocation = design.allocations.find(item =>
      governanceRefKey(item.actionRef) === governanceRefKey(primary.actionRef));
    if (!allocation
      || governanceRefKey(assignment.assignmentDesignRef) !== governanceRefKey(design.designRef)
      || governanceRefKey(assignment.actionRef) !== governanceRefKey(primary.actionRef)
      || assignment.seedNamespace !== design.seedNamespace
      || assignment.unitKind !== allocation.unit
      || canonicalJson(assignment.arms) !== canonicalJson(allocation.arms)) {
      throw new Error("governanceEventAssignment does not match the preregistered assignment design");
    }
    const eligibleRuleRefs = eligibilityDecision.evaluations
      .filter(evaluation => evaluation.eligible)
      .map(evaluation => governanceRefKey(evaluation.ruleRef))
      .sort();
    if (canonicalJson(assignment.eligibilityRuleRefs.map(governanceRefKey).sort())
      !== canonicalJson(eligibleRuleRefs)) {
      throw new Error("governanceEventAssignment eligibility rules do not match its decision");
    }
  }

  for (const decision of decisions.values()) {
    if (!decision.assignment) continue;
    const assignment = assignments.get(decision.assignment.id);
    if (!assignment
      || assignment.unitKind !== decision.assignment.unitKind
      || assignment.assignedArm !== decision.assignment.assignedArm
      || assignment.assignmentProbability !== decision.assignment.assignmentProbability
      || assignment.assignedAt !== decision.assignment.assignedAt) {
      throw new Error("governanceDecision assignment ref does not match its event assignment");
    }
    const eligibilityDecision = decisions.get(assignment.eligibilityDecisionId)!;
    if (decision.id === eligibilityDecision.id
      || decision.round !== eligibilityDecision.round
      || governanceRefKey(decision.policyRef) !== governanceRefKey(eligibilityDecision.policyRef)
      || canonicalJson(decision.diagnosisIds) !== canonicalJson(eligibilityDecision.diagnosisIds)
      || computeGovernanceCandidateSetHash(decision.candidateActions) !== assignment.candidateSetHash) {
      throw new Error("assigned governanceDecision does not close its eligibility decision");
    }
    requireNotBefore(
      decision.decidedAt,
      assignment.assignedAt,
      "closing governanceDecision.decidedAt",
      "its assignment",
    );
    const primary = eligibilityDecision.candidateActions[0];
    const contract = contracts.get(governanceRefKey(primary.actionRef))!;
    const randomization = contract.randomization;
    if (assignment.assignedArm === randomization.holdoutArm) {
      if (decision.outcome !== "held_out") {
        throw new Error("holdout assignment must produce a held_out decision");
      }
    } else if (assignment.assignedArm === randomization.applyArm) {
      if (decision.outcome === "selected"
        && governanceRefKey(decision.selectedActions[0].actionRef) !== governanceRefKey(primary.actionRef)) {
        throw new Error("apply assignment selected the wrong intervention");
      }
    } else if (assignment.assignedArm === randomization.shamArm) {
      if (decision.outcome === "selected"
        && governanceRefKey(decision.selectedActions[0].actionRef)
          !== governanceRefKey(randomization.shamActionRef!)) {
        throw new Error("sham assignment selected the wrong intervention");
      }
    }
  }

  const instances = requireUniqueIds(trail.actionInstances, "governanceAuditTrail.actionInstances");
  for (const instance of instances.values()) {
    validateGovernanceActionInstance(instance);
    requireWithinAuditWindow(trail, instance.createdAt, "governance action createdAt");
    const decision = decisions.get(instance.decisionId);
    if (!decision) throw new Error(`governance action references unknown decision ${instance.decisionId}`);
    if (instance.assignmentId !== decision.assignment?.id) {
      throw new Error("governance action assignment does not match its decision");
    }
    if (instance.plannedWindow.startRound < decision.round) {
      throw new Error("governance action window cannot start before its decision round");
    }
    requireNotBefore(
      instance.createdAt,
      decision.decidedAt,
      "governance action createdAt",
      "its decision",
    );
    const candidates = decision.outcome === "held_out"
      ? decision.candidateActions.slice(0, 1)
      : decision.selectedActions;
    if (!candidates.some(candidate => candidateMatchesInstance(candidate, instance))) {
      throw new Error("governance action instance does not match a decision action");
    }
  }

  const transitionIds = new Set<string>();
  const ledger = new GovernanceActionLedger();
  for (const transition of trail.actionTransitions) {
    requireNonEmpty(transition?.id, "governanceAuditTrail.actionTransition.id");
    if (transitionIds.has(transition.id)) throw new Error("governance action transition ids must be unique");
    transitionIds.add(transition.id);
    requireWithinAuditWindow(trail, transition.occurredAt, "governance action transition occurredAt");
    const instance = instances.get(transition.actionInstanceId);
    if (!instance) throw new Error("governance action transition references unknown instance");
    const decision = decisions.get(instance.decisionId)!;
    if (transition.round < decision.round) {
      throw new Error("governance action transition cannot precede its decision round");
    }
    requireNotBefore(
      transition.occurredAt,
      instance.createdAt,
      "governance action transition occurredAt",
      "its action instance",
    );
    for (const sourceEventId of transition.sourceEventIds) {
      const sourceEvent = sourceEvents.get(sourceEventId);
      if (!sourceEvent) {
        throw new Error(`governance action transition references unknown source event ${sourceEventId}`);
      }
      if (sourceEvent.round > transition.round) {
        throw new Error("governance action transition cannot use a future source event");
      }
    }
    if (transition.from === null) ledger.register(instance, transition);
    else ledger.append(transition);
  }
  for (const instance of instances.values()) {
    if (ledger.getCurrentState(instance.id) === undefined) {
      throw new Error(`governance action instance ${instance.id} has no lifecycle`);
    }
  }

  if (trail.status === "sealed") {
    for (const assignment of assignments.values()) {
      const closing = [...decisions.values()].filter(decision => decision.assignment?.id === assignment.id);
      if (closing.length !== 1) {
        throw new Error("sealed governance audit requires exactly one decision closing each assignment");
      }
    }
    for (const decision of decisions.values()) {
      if (decision.outcome === "awaiting_assignment"
        && ![...assignments.values()].some(assignment => assignment.eligibilityDecisionId === decision.id)) {
        throw new Error("sealed governance audit contains an unassigned eligible decision");
      }
      const expectedActions = decision.outcome === "selected"
        ? decision.selectedActions
        : decision.outcome === "held_out"
          ? decision.candidateActions.slice(0, 1)
          : [];
      const linked = [...instances.values()].filter(instance => instance.decisionId === decision.id);
      if (linked.length !== expectedActions.length) {
        throw new Error("sealed governance audit action-instance cardinality mismatch");
      }
      for (const expected of expectedActions) {
        if (linked.filter(instance => candidateMatchesInstance(expected, instance)).length !== 1) {
          throw new Error("sealed governance audit requires one action instance per decided action");
        }
      }
    }
    for (const instance of instances.values()) {
      const state = ledger.getCurrentState(instance.id)!;
      if (!TERMINAL_ACTION_STATES.has(state)) {
        throw new Error("sealed governance audit contains a non-terminal action");
      }
      const decision = decisions.get(instance.decisionId)!;
      if (decision.outcome === "held_out" && state !== "held_out") {
        throw new Error("held-out decision must end in held_out action state");
      }
      if (decision.outcome === "selected" && state === "held_out") {
        throw new Error("selected decision cannot end in held_out action state");
      }
    }
  }

  return verificationResult(trail, "not_performed");
}

/** Full replay using executable, version-matched eligibility rules. */
export function replayGovernanceAuditTrailDecisions(
  trail: GovernanceAuditTrail,
  rules: readonly GovernanceEligibilityRule[],
): GovernanceAuditVerification {
  validateGovernanceAuditTrail(trail);
  const policy = trail.studyContract.governancePolicy!;
  const ruleByKey = new Map(rules.map(rule => [governanceRefKey(rule), rule]));
  const expectedRuleKeys = policy.eligibilityRuleRefs.map(governanceRefKey).sort();
  if (canonicalJson([...ruleByKey.keys()].sort()) !== canonicalJson(expectedRuleKeys)) {
    throw new Error("decision replay rules must exactly match the study policy");
  }
  for (const snapshot of trail.ruleSnapshots) {
    const rule = ruleByKey.get(governanceRefKey(snapshot.ruleRef))!;
    if (canonicalJson(rule.config) !== canonicalJson(snapshot.config)) {
      throw new Error("decision replay rule config does not match the audit snapshot");
    }
  }

  const engine = new GovernanceDecisionEngine();
  for (const contract of trail.interventionContracts) engine.registerAction(structuredClone(contract));
  for (const rule of rules) engine.registerRule(rule);
  engine.seal();
  const diagnosisById = new Map(trail.diagnoses.map(diagnosis => [diagnosis.id, diagnosis]));
  for (const stored of trail.decisions) {
    const replayed = engine.decide({
      id: stored.id,
      policy: structuredClone(policy),
      diagnoses: stored.diagnosisIds.map(id => structuredClone(diagnosisById.get(id)!)),
      availableBudget: structuredClone(stored.budgetBefore),
      round: stored.round,
      decidedAt: stored.decidedAt,
      sourceEventIds: [...stored.sourceEventIds],
      ...(stored.assignment ? { assignment: structuredClone(stored.assignment) } : {}),
    });
    if (canonicalJson(replayed) !== canonicalJson(stored)) {
      throw new Error(`governance decision replay mismatch for ${stored.id}`);
    }
  }
  return verificationResult(trail, "verified");
}
