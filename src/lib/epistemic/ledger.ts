import type {
  BeliefReport,
  ClaimResolution,
  EpistemicClaim,
  EpistemicEvent,
  EpistemicEvidence,
} from "./types";

function requireNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) throw new Error(`${field} must not be empty`);
}

function requireUnique(values: string[], field: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${field} must not contain duplicates`);
}

/**
 * Minimal append-only epistemic ledger.
 *
 * It deliberately stores observations and resolutions, not mutable reputation.
 * Reputation and capital settlement are projections over this audit log, which
 * prevents a governance policy from rewriting the underlying belief history.
 */
export class EpistemicLedger {
  private readonly claims = new Map<string, EpistemicClaim>();
  private readonly evidence = new Map<string, EpistemicEvidence>();
  private readonly reports = new Map<string, BeliefReport>();
  private readonly resolutions = new Map<string, ClaimResolution>();
  private readonly latestReportByAgentClaim = new Map<string, string>();
  private readonly events: EpistemicEvent[] = [];

  registerClaim(claim: EpistemicClaim): void {
    requireNonEmpty(claim.id, "claim.id");
    requireNonEmpty(claim.proposition, "claim.proposition");
    requireNonEmpty(claim.domain, "claim.domain");
    requireNonEmpty(claim.resolutionPolicy.resolverId, "claim.resolutionPolicy.resolverId");
    if (this.claims.has(claim.id)) throw new Error(`Claim ${claim.id} already exists`);
    const stored = structuredClone(claim);
    this.claims.set(stored.id, stored);
    this.events.push({ type: "claim_registered", claim: stored });
  }

  registerEvidence(item: EpistemicEvidence): void {
    requireNonEmpty(item.id, "evidence.id");
    requireNonEmpty(item.content, "evidence.content");
    requireNonEmpty(item.provenance.sourceId, "evidence.provenance.sourceId");
    requireNonEmpty(item.provenance.contentHash, "evidence.provenance.contentHash");
    if (this.evidence.has(item.id)) throw new Error(`Evidence ${item.id} already exists`);
    const stored = structuredClone(item);
    this.evidence.set(stored.id, stored);
    this.events.push({ type: "evidence_registered", evidence: stored });
  }

  appendBeliefReport(report: BeliefReport): void {
    requireNonEmpty(report.id, "report.id");
    requireNonEmpty(report.agentId, "report.agentId");
    if (this.reports.has(report.id)) throw new Error(`Belief report ${report.id} already exists`);
    if (!this.claims.has(report.claimId)) throw new Error(`Unknown claim ${report.claimId}`);
    if (this.resolutions.has(report.claimId)) throw new Error(`Claim ${report.claimId} is already resolved`);
    if (!Number.isInteger(report.round) || report.round < 0) {
      throw new Error("report.round must be a non-negative integer");
    }
    if (!Number.isFinite(report.probability) || report.probability < 0 || report.probability > 1) {
      throw new Error("report.probability must be finite and within [0, 1]");
    }
    if (!Number.isFinite(report.stake) || report.stake < 0) {
      throw new Error("report.stake must be finite and non-negative");
    }

    const evidenceIds = report.evidence.map(reference => reference.evidenceId);
    requireUnique(evidenceIds, "report.evidence");
    for (const evidenceId of evidenceIds) {
      if (!this.evidence.has(evidenceId)) throw new Error(`Unknown evidence ${evidenceId}`);
    }

    const observedReportIds = report.observedReportIds ?? [];
    requireUnique(observedReportIds, "report.observedReportIds");
    for (const observedId of observedReportIds) {
      const observed = this.reports.get(observedId);
      if (!observed) throw new Error(`Unknown observed report ${observedId}`);
      if (observed.claimId !== report.claimId) {
        throw new Error(`Observed report ${observedId} belongs to a different claim`);
      }
      if (observed.round > report.round) {
        throw new Error(`Observed report ${observedId} is from a future round`);
      }
    }

    const agentClaimKey = `${report.agentId}\u0000${report.claimId}`;
    const latestId = this.latestReportByAgentClaim.get(agentClaimKey);
    if (latestId && report.supersedesReportId !== latestId) {
      throw new Error(`Report ${report.id} must supersede latest report ${latestId}`);
    }
    if (!latestId && report.supersedesReportId !== undefined) {
      throw new Error(`Report ${report.id} cannot supersede a non-existent prior report`);
    }

    const stored = structuredClone(report);
    this.reports.set(stored.id, stored);
    this.latestReportByAgentClaim.set(agentClaimKey, stored.id);
    this.events.push({ type: "belief_reported", report: stored });
  }

  resolveClaim(resolution: ClaimResolution): void {
    const claim = this.claims.get(resolution.claimId);
    if (!claim) throw new Error(`Unknown claim ${resolution.claimId}`);
    if (this.resolutions.has(resolution.claimId)) throw new Error(`Claim ${resolution.claimId} is already resolved`);
    if (resolution.resolverId !== claim.resolutionPolicy.resolverId) {
      throw new Error(`Resolver ${resolution.resolverId} is not authorized for claim ${resolution.claimId}`);
    }
    for (const evidenceId of resolution.evidenceIds ?? []) {
      if (!this.evidence.has(evidenceId)) throw new Error(`Unknown resolution evidence ${evidenceId}`);
    }
    const stored = structuredClone(resolution);
    this.resolutions.set(stored.claimId, stored);
    this.events.push({ type: "claim_resolved", resolution: stored });
  }

  getEvents(): EpistemicEvent[] {
    return structuredClone(this.events);
  }

  getReportsForClaim(claimId: string): BeliefReport[] {
    return structuredClone([...this.reports.values()].filter(report => report.claimId === claimId));
  }

  getResolution(claimId: string): ClaimResolution | undefined {
    const resolution = this.resolutions.get(claimId);
    return resolution ? structuredClone(resolution) : undefined;
  }
}
