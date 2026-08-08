import type { BeliefKind, BeliefReportId, BeliefValue, ClaimId } from "./types";

/**
 * Semantic layers are intentionally disjoint. Crossing a layer requires an
 * explicit projection carrying its method identity and source observations.
 */
export type EpistemicQuantityLayer =
  | "reported_belief"
  | "reported_state"
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

/**
 * A structured self-report that is not a probability-bearing belief about a
 * registered claim (for example a utility vector or an evidence annotation).
 * It is observable as output, but must not be presented as latent cognition.
 */
export interface ReportedAgentState<T = unknown> {
  layer: "reported_state";
  reportId: string;
  agentId: string;
  schemaId: string;
  schemaVersion: string;
  value: T;
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

/**
 * Task-specific latent-state proxy such as utility, inertia or susceptibility.
 *
 * Since schema 2.0 the record persists its exact canonicalized input snapshot
 * (`input`) in addition to the fingerprint, so a third party can replay the
 * projection from the record alone. Records without `input` are legacy and
 * unverifiable by design (see `src/lib/epistemic/replay.ts`).
 */
export interface GovernanceEstimate<
  Output = unknown,
  Input = unknown,
  Config extends object = object,
> {
  layer: "governance_estimate";
  name: string;
  estimatorId: string;
  estimatorVersion: string;
  sourceEventIds: string[];
  /** Exact canonicalized estimator input used for execution. */
  input: Input;
  inputFingerprint: string;
  /** Full configuration used for execution, not a partial merge. */
  config: Config;
  configFingerprint: string;
  outputFingerprint: string;
  determinism:
    | { kind: "deterministic" }
    | { kind: "seeded"; seed: number; seedField: string };
  value: Output;
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
  | ReportedAgentState
  | DerivedEpistemicEstimate
  | GovernanceEstimate
  | BehavioralTelemetry
  | OutcomeEvaluation
  | GovernanceState;
