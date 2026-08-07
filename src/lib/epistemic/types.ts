export type ClaimId = string;
export type EvidenceId = string;
export type BeliefReportId = string;
export type BeliefExposureId = string;

export interface BinaryResolutionPolicy {
  kind: "binary";
  /** Stable identity of the oracle, evaluator, or adjudication procedure. */
  resolverId: string;
  resolveBy?: string;
}

export interface EpistemicClaim {
  id: ClaimId;
  proposition: string;
  domain: string;
  createdAt: string;
  resolutionPolicy: BinaryResolutionPolicy;
}

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

/**
 * An append-only, architecture-observed probability report.
 * `supersedesReportId` makes one agent's revision history explicit, while
 * `observedReportIds` records the reports available before this transition.
 */
export interface BeliefReport {
  id: BeliefReportId;
  claimId: ClaimId;
  agentId: string;
  round: number;
  probability: number;
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

export interface ClaimResolution {
  claimId: ClaimId;
  outcome: boolean;
  resolverId: string;
  resolvedAt: string;
  evidenceIds?: EvidenceId[];
}

export type EpistemicEvent =
  | { type: "claim_registered"; claim: EpistemicClaim }
  | { type: "evidence_registered"; evidence: EpistemicEvidence }
  | { type: "belief_reported"; report: BeliefReport }
  | { type: "belief_exposed"; exposure: BeliefExposure }
  | { type: "claim_resolved"; resolution: ClaimResolution };
