export type ClaimId = string;
export type EvidenceId = string;
export type BeliefReportId = string;
export type BeliefExposureId = string;
export type BeliefKind = "binary" | "categorical";

interface ResolutionPolicyBase {
  /** Stable identity of the oracle, evaluator, or adjudication procedure. */
  resolverId: string;
  resolveBy?: string;
}

export interface BinaryResolutionPolicy extends ResolutionPolicyBase {
  kind: "binary";
}

export interface CategoricalResolutionPolicy extends ResolutionPolicyBase {
  kind: "categorical";
}

interface EpistemicClaimBase {
  id: ClaimId;
  proposition: string;
  domain: string;
  createdAt: string;
}

export interface BinaryEpistemicClaim extends EpistemicClaimBase {
  resolutionPolicy: BinaryResolutionPolicy;
}

export interface CategoricalEpistemicClaim extends EpistemicClaimBase {
  /** Canonical, exhaustive and mutually exclusive outcomes. */
  options: string[];
  resolutionPolicy: CategoricalResolutionPolicy;
}

/** A claim carries the task-specific semantics needed to validate beliefs. */
export type EpistemicClaim = BinaryEpistemicClaim | CategoricalEpistemicClaim;

export type EvidenceSourceKind = "agent" | "tool" | "dataset" | "external";

export interface EvidenceProvenance {
  sourceKind: EvidenceSourceKind;
  sourceId: string;
  /** Supplied by the ingestion boundary; the ledger does not hash content implicitly. */
  contentHash: string;
  /** Identifies correlated origins such as model family + prompt lineage. */
  lineageId?: string;
}

export interface EpistemicEvidence {
  id: EvidenceId;
  content: string;
  createdAt: string;
  provenance: EvidenceProvenance;
}

export type EvidenceRelation = "supports" | "attacks";

export interface BeliefEvidenceReference {
  evidenceId: EvidenceId;
  relation: EvidenceRelation;
}

export interface BinaryBeliefValue {
  kind: "binary";
  probability: number;
}

export interface CategoricalBeliefValue {
  kind: "categorical";
  /** Probability mass keyed by the claim's canonical options. */
  probabilities: Record<string, number>;
}

export type BeliefValue = BinaryBeliefValue | CategoricalBeliefValue;

/**
 * An append-only, architecture-observed belief report.
 * `supersedesReportId` makes one agent's revision history explicit, while
 * `observedReportIds` records the reports available before this transition.
 */
export interface BeliefReport {
  id: BeliefReportId;
  claimId: ClaimId;
  agentId: string;
  round: number;
  value: BeliefValue;
  evidence: BeliefEvidenceReference[];
  stake: number;
  createdAt: string;
  supersedesReportId?: BeliefReportId;
  observedReportIds?: BeliefReportId[];
}

/** Records architecture-observed delivery, not a citation inferred from text. */
export interface BeliefExposure {
  id: BeliefExposureId;
  claimId: ClaimId;
  sourceReportId: BeliefReportId;
  targetAgentId: string;
  round: number;
  channel: "memory" | "current_round";
  exposedAt: string;
}

interface ClaimResolutionBase {
  claimId: ClaimId;
  resolverId: string;
  resolvedAt: string;
  evidenceIds?: EvidenceId[];
}

export interface BinaryClaimResolution extends ClaimResolutionBase {
  kind: "binary";
  outcome: boolean;
}

export interface CategoricalClaimResolution extends ClaimResolutionBase {
  kind: "categorical";
  outcome: string;
}

export type ClaimResolution = BinaryClaimResolution | CategoricalClaimResolution;

export type EpistemicEvent =
  | { type: "claim_registered"; claim: EpistemicClaim }
  | { type: "evidence_registered"; evidence: EpistemicEvidence }
  | { type: "belief_reported"; report: BeliefReport }
  | { type: "belief_exposed"; exposure: BeliefExposure }
  | { type: "claim_resolved"; resolution: ClaimResolution };
