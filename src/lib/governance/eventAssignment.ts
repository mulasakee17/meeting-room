import { createHash } from "node:crypto";
import { mulberry32 } from "../utils/statsUtils";
import {
  governanceRefKey,
  validateGovernanceDecisionRecord,
  validateGovernancePolicy,
  validateGovernanceRef,
  type GovernanceActionAssignmentRef,
  type GovernanceActionCandidate,
  type GovernanceDecisionRecord,
  type GovernancePolicyContract,
  type VersionedGovernanceRef,
} from "./controlContracts";

export interface GovernanceAssignmentArm {
  id: string;
  probability: number;
}

/** Full, replayable assignment created from an awaiting-assignment decision. */
export interface GovernanceEventAssignment {
  id: string;
  schemaVersion: "1.0.0";
  unitId: string;
  unitKind: "run" | "eligible_event";
  policyRef: VersionedGovernanceRef;
  assignmentDesignRef: VersionedGovernanceRef;
  actionRef: VersionedGovernanceRef;
  seedNamespace: string;
  eligibilityDecisionId: string;
  eligibilityRuleRefs: VersionedGovernanceRef[];
  sourceDiagnosisIds: string[];
  candidateSetHash: string;
  arms: GovernanceAssignmentArm[];
  assignedArm: string;
  assignmentProbability: number;
  masterSeed: number;
  derivedSeed: number;
  randomDraw: number;
  assignedAt: string;
}

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;

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

function canonicalCandidate(candidate: GovernanceActionCandidate): unknown {
  return canonicalize({
    ...candidate,
    targetIds: [...candidate.targetIds].sort(),
    sourceDiagnosisIds: [...candidate.sourceDiagnosisIds].sort(),
  });
}

export function computeGovernanceCandidateSetHash(
  candidates: readonly GovernanceActionCandidate[],
): string {
  const canonicalCandidates = candidates
    .map(candidate => JSON.stringify(canonicalCandidate(candidate)))
    .sort();
  const payload = `[${canonicalCandidates.join(",")}]`;
  return `sha256:${createHash("sha256").update(payload, "utf8").digest("hex")}`;
}

export function deriveGovernanceAssignmentSeed(input: {
  masterSeed: number;
  unitId: string;
  unitKind: "run" | "eligible_event";
  policyRef: VersionedGovernanceRef;
  candidateSetHash: string;
  assignmentDesignRef: VersionedGovernanceRef;
  actionRef: VersionedGovernanceRef;
  seedNamespace: string;
  arms: readonly GovernanceAssignmentArm[];
}): number {
  // A run-randomized action family must keep the same arm throughout the run.
  // Candidate-set identity is therefore part of an eligible-event draw only;
  // including it in a run-level draw would silently turn cluster assignment
  // into event-level assignment whenever the candidates changed.
  const unitSpecificIdentity = input.unitKind === "eligible_event"
    ? input.candidateSetHash
    : "run-level";
  const digest = createHash("sha256")
    .update([
      String(input.masterSeed),
      input.unitKind,
      input.unitId,
      governanceRefKey(input.policyRef),
      unitSpecificIdentity,
      governanceRefKey(input.assignmentDesignRef),
      governanceRefKey(input.actionRef),
      input.seedNamespace,
      JSON.stringify(canonicalize(input.arms)),
    ].join("|"), "utf8")
    .digest();
  return digest.readUInt32BE(0) >>> 0;
}

/**
 * Canonical randomization-unit identity. Callers may not choose this string:
 * otherwise they could redraw an eligible event until a preferred arm appears.
 */
export function deriveGovernanceAssignmentUnitId(input: {
  runId: string;
  unitKind: "run" | "eligible_event";
  eligibilityDecisionId: string;
}): string {
  if (typeof input.runId !== "string" || input.runId.trim().length === 0) {
    throw new Error("governance assignment runId must be non-empty");
  }
  if (typeof input.eligibilityDecisionId !== "string"
    || input.eligibilityDecisionId.trim().length === 0) {
    throw new Error("governance assignment eligibilityDecisionId must be non-empty");
  }
  return input.unitKind === "run"
    ? input.runId
    : `${input.runId}:eligible:${input.eligibilityDecisionId}`;
}

function drawAssignment(derivedSeed: number, arms: readonly GovernanceAssignmentArm[]): {
  assignedArm: string;
  assignmentProbability: number;
  randomDraw: number;
} {
  const randomDraw = mulberry32(derivedSeed)();
  let cumulative = 0;
  for (const arm of arms) {
    cumulative += arm.probability;
    if (randomDraw < cumulative) {
      return {
        assignedArm: arm.id,
        assignmentProbability: arm.probability,
        randomDraw,
      };
    }
  }
  const fallback = arms[arms.length - 1];
  return {
    assignedArm: fallback.id,
    assignmentProbability: fallback.probability,
    randomDraw,
  };
}

function validateAssignmentArms(arms: readonly GovernanceAssignmentArm[]): void {
  if (!Array.isArray(arms) || arms.length < 2) {
    throw new Error("governanceEventAssignment.arms must contain at least two arms");
  }
  const armIds = arms.map(arm => arm.id);
  if (armIds.some(id => typeof id !== "string" || id.trim().length === 0)
    || new Set(armIds).size !== armIds.length) {
    throw new Error("governanceEventAssignment arm ids must be unique and non-empty");
  }
  for (const arm of arms) {
    if (!Number.isFinite(arm.probability) || arm.probability <= 0 || arm.probability > 1) {
      throw new Error("governanceEventAssignment arm probabilities must be within (0,1]");
    }
  }
  const total = arms.reduce((sum, arm) => sum + arm.probability, 0);
  if (Math.abs(total - 1) > 1e-9) {
    throw new Error("governanceEventAssignment arm probabilities must sum to 1");
  }
}

export function validateGovernanceEventAssignment(
  value: GovernanceEventAssignment,
): void {
  if (!value || typeof value.id !== "string" || value.id.trim().length === 0) {
    throw new Error("governanceEventAssignment.id must be non-empty");
  }
  if (value.schemaVersion !== "1.0.0") {
    throw new Error("governanceEventAssignment.schemaVersion must be 1.0.0");
  }
  if (typeof value.unitId !== "string" || value.unitId.trim().length === 0) {
    throw new Error("governanceEventAssignment.unitId must be non-empty");
  }
  if (value.unitKind !== "run" && value.unitKind !== "eligible_event") {
    throw new Error("governanceEventAssignment.unitKind is invalid");
  }
  validateGovernanceRef(value.policyRef, "governanceEventAssignment.policyRef");
  validateGovernanceRef(
    value.assignmentDesignRef,
    "governanceEventAssignment.assignmentDesignRef",
  );
  validateGovernanceRef(value.actionRef, "governanceEventAssignment.actionRef");
  if (typeof value.seedNamespace !== "string" || value.seedNamespace.trim().length === 0) {
    throw new Error("governanceEventAssignment.seedNamespace must be non-empty");
  }
  if (typeof value.eligibilityDecisionId !== "string" || value.eligibilityDecisionId.trim().length === 0) {
    throw new Error("governanceEventAssignment.eligibilityDecisionId must be non-empty");
  }
  if (!Array.isArray(value.eligibilityRuleRefs) || value.eligibilityRuleRefs.length === 0) {
    throw new Error("governanceEventAssignment.eligibilityRuleRefs must be non-empty");
  }
  const ruleKeys = value.eligibilityRuleRefs.map(ref => {
    validateGovernanceRef(ref, "governanceEventAssignment.eligibilityRuleRef");
    return governanceRefKey(ref);
  });
  if (new Set(ruleKeys).size !== ruleKeys.length) {
    throw new Error("governanceEventAssignment.eligibilityRuleRefs must be unique");
  }
  if (!Array.isArray(value.sourceDiagnosisIds) || value.sourceDiagnosisIds.length === 0
    || value.sourceDiagnosisIds.some(id => typeof id !== "string" || id.trim().length === 0)
    || new Set(value.sourceDiagnosisIds).size !== value.sourceDiagnosisIds.length) {
    throw new Error("governanceEventAssignment.sourceDiagnosisIds must contain unique non-empty ids");
  }
  if (!SHA256_RE.test(value.candidateSetHash)) {
    throw new Error("governanceEventAssignment.candidateSetHash must be canonical sha256");
  }
  validateAssignmentArms(value.arms);
  const assigned = value.arms.find(arm => arm.id === value.assignedArm);
  if (!assigned || assigned.probability !== value.assignmentProbability) {
    throw new Error("governanceEventAssignment assigned arm/probability mismatch");
  }
  if (!Number.isSafeInteger(value.masterSeed) || !Number.isSafeInteger(value.derivedSeed)) {
    throw new Error("governanceEventAssignment seeds must be safe integers");
  }
  const derivedSeed = deriveGovernanceAssignmentSeed(value);
  if (derivedSeed !== value.derivedSeed) {
    throw new Error("governanceEventAssignment derived seed is not reproducible");
  }
  const replay = drawAssignment(value.derivedSeed, value.arms);
  if (replay.assignedArm !== value.assignedArm
    || replay.assignmentProbability !== value.assignmentProbability
    || replay.randomDraw !== value.randomDraw) {
    throw new Error("governanceEventAssignment draw is not reproducible");
  }
  if (typeof value.assignedAt !== "string" || !Number.isFinite(Date.parse(value.assignedAt))) {
    throw new Error("governanceEventAssignment.assignedAt must be an ISO-compatible timestamp");
  }
}

export function createGovernanceEventAssignment(input: {
  id: string;
  runId: string;
  unitKind: "run" | "eligible_event";
  eligibilityDecision: GovernanceDecisionRecord;
  policy: GovernancePolicyContract;
  masterSeed: number;
  assignedAt: string;
}): GovernanceEventAssignment {
  validateGovernanceDecisionRecord(input.eligibilityDecision);
  if (input.eligibilityDecision.outcome !== "awaiting_assignment") {
    throw new Error("governance assignment requires an awaiting_assignment decision");
  }
  if (input.eligibilityDecision.candidateActions.length === 0) {
    throw new Error("governance assignment requires at least one eligible candidate");
  }
  validateGovernancePolicy(input.policy);
  if (governanceRefKey(input.policy) !== governanceRefKey(input.eligibilityDecision.policyRef)
    || !input.policy.assignmentDesign) {
    throw new Error("governance assignment policy does not match the eligibility decision");
  }
  const primaryAction = input.eligibilityDecision.candidateActions[0].actionRef;
  const allocation = input.policy.assignmentDesign.allocations.find(candidate =>
    governanceRefKey(candidate.actionRef) === governanceRefKey(primaryAction));
  if (!allocation) throw new Error("governance assignment policy has no allocation for primary action");
  if (allocation.unit !== input.unitKind) {
    throw new Error("governance assignment unit does not match the preregistered allocation");
  }
  const candidateSetHash = computeGovernanceCandidateSetHash(
    input.eligibilityDecision.candidateActions,
  );
  const unitId = deriveGovernanceAssignmentUnitId({
    runId: input.runId,
    unitKind: input.unitKind,
    eligibilityDecisionId: input.eligibilityDecision.id,
  });
  const derivedSeed = deriveGovernanceAssignmentSeed({
    masterSeed: input.masterSeed,
    unitId,
    unitKind: input.unitKind,
    policyRef: input.eligibilityDecision.policyRef,
    candidateSetHash,
    assignmentDesignRef: input.policy.assignmentDesign.designRef,
    actionRef: primaryAction,
    seedNamespace: input.policy.assignmentDesign.seedNamespace,
    arms: allocation.arms,
  });
  const arms = allocation.arms.map(arm => ({ ...arm }));
  validateAssignmentArms(arms);
  const draw = drawAssignment(derivedSeed, arms);
  const assignment: GovernanceEventAssignment = {
    id: input.id,
    schemaVersion: "1.0.0",
    unitId,
    unitKind: input.unitKind,
    policyRef: structuredClone(input.eligibilityDecision.policyRef),
    assignmentDesignRef: structuredClone(input.policy.assignmentDesign.designRef),
    actionRef: structuredClone(primaryAction),
    seedNamespace: input.policy.assignmentDesign.seedNamespace,
    eligibilityDecisionId: input.eligibilityDecision.id,
    eligibilityRuleRefs: input.eligibilityDecision.evaluations
      .filter(evaluation => evaluation.eligible)
      .map(evaluation => structuredClone(evaluation.ruleRef)),
    sourceDiagnosisIds: [...input.eligibilityDecision.diagnosisIds].sort(),
    candidateSetHash,
    arms,
    ...draw,
    masterSeed: input.masterSeed,
    derivedSeed,
    assignedAt: input.assignedAt,
  };
  validateGovernanceEventAssignment(assignment);
  return structuredClone(assignment);
}

export function toGovernanceActionAssignmentRef(
  assignment: GovernanceEventAssignment,
): GovernanceActionAssignmentRef {
  validateGovernanceEventAssignment(assignment);
  return {
    id: assignment.id,
    unitKind: assignment.unitKind,
    assignedArm: assignment.assignedArm,
    assignmentProbability: assignment.assignmentProbability,
    assignedAt: assignment.assignedAt,
  };
}
