import type { BeliefKind, BeliefReportId, BeliefValue, ClaimId } from "./types";

/**
 * Semantic layers are intentionally disjoint. Crossing a layer requires an
 * explicit projection carrying its method identity and source observations.
 */
export type EpistemicQuantityLayer =
  | "reported_belief"
  | "derived_epistemic"
  | "governance_estimate"
  | "behavioral_telemetry"
  | "outcome_evaluation"
  | "governance_state";

export interface ReportedBeliefState {
  layer: "reported_belief";
  reportId: BeliefReportId;
  claimId: ClaimId;
  agentId: string;
  value: BeliefValue;
}

/** An aggregate or transformation; never overwrite the source reports. */
export interface DerivedEpistemicEstimate {
  layer: "derived_epistemic";
  claimId: ClaimId;
  beliefKind: BeliefKind;
  methodId: string;
  sourceReportIds: BeliefReportId[];
  value: BeliefValue;
}

/** Task-specific latent-state proxy such as utility, inertia or susceptibility. */
export interface GovernanceEstimate<T = unknown> {
  layer: "governance_estimate";
  name: string;
  estimatorId: string;
  estimatorVersion: string;
  sourceEventIds: string[];
  inputFingerprint: string;
  config: object;
  configFingerprint: string;
  outputFingerprint: string;
  determinism:
    | { kind: "deterministic" }
    | { kind: "seeded"; seed: number; seedField: string };
  value: T;
}

/** Directly observed runtime behavior; interpretation belongs to a collector. */
export interface BehavioralTelemetry<T = unknown> {
  layer: "behavioral_telemetry";
  name: string;
  eventId: string;
  observedAt: string;
  value: T;
}

/** Requires a resolved claim; calibration is computed over multiple records. */
export interface OutcomeEvaluation<T = unknown> {
  layer: "outcome_evaluation";
  claimId: ClaimId;
  resolverId: string;
  metricId: string;
  sourceReportIds: BeliefReportId[];
  value: T;
}

/** Mutable policy state projected from the audit log, never part of belief history. */
export interface GovernanceState<T = unknown> {
  layer: "governance_state";
  name: string;
  policyId: string;
  updatedFromEventIds: string[];
  value: T;
}

export type EpistemicSemanticQuantity =
  | ReportedBeliefState
  | DerivedEpistemicEstimate
  | GovernanceEstimate
  | BehavioralTelemetry
  | OutcomeEvaluation
  | GovernanceState;
