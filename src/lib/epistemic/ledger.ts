import type {
  BeliefReport,
  BeliefExposure,
  ClaimResolution,
  EpistemicClaim,
  EpistemicEvent,
  EpistemicEvidence,
} from "./types";
import {
  defaultBeliefContractRegistry,
  type BeliefContractRegistry,
  validateEpistemicClaim,
} from "./contracts";

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
  private readonly exposures = new Map<string, BeliefExposure>();
  private readonly resolutions = new Map<string, ClaimResolution>();
  private readonly latestReportByAgentClaim = new Map<string, string>();
  private readonly events: EpistemicEvent[] = [];

  private readonly contractRegistry: BeliefContractRegistry;

  constructor(contractRegistry: BeliefContractRegistry = defaultBeliefContractRegistry) {
    this.contractRegistry = contractRegistry.snapshot().seal();
  }

  registerClaim(claim: EpistemicClaim): void {
    validateEpistemicClaim(claim, this.contractRegistry);
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
    const claim = this.claims.get(report.claimId)!;
    const normalizedValue = this.contractRegistry.get(claim.resolutionPolicy.kind)
      .normalizeValue(claim, report.value);
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
      const hasExposure = [...this.exposures.values()].some(exposure =>
        exposure.sourceReportId === observedId
        && exposure.targetAgentId === report.agentId
        && exposure.round <= report.round
      );
      if (!hasExposure) {
        throw new Error(`Observed report ${observedId} has no matching architecture-recorded exposure for ${report.agentId}`);
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

    const stored = structuredClone({ ...report, value: normalizedValue });
    this.reports.set(stored.id, stored);
    this.latestReportByAgentClaim.set(agentClaimKey, stored.id);
    this.events.push({ type: "belief_reported", report: stored });
  }

  appendExposure(exposure: BeliefExposure): void {
    requireNonEmpty(exposure.id, "exposure.id");
    requireNonEmpty(exposure.targetAgentId, "exposure.targetAgentId");
    if (this.exposures.has(exposure.id)) throw new Error(`Exposure ${exposure.id} already exists`);
    const source = this.reports.get(exposure.sourceReportId);
    if (!source) throw new Error(`Unknown source report ${exposure.sourceReportId}`);
    if (source.claimId !== exposure.claimId) {
      throw new Error(`Exposure ${exposure.id} claim does not match its source report`);
    }
    if (!Number.isInteger(exposure.round) || exposure.round < source.round) {
      throw new Error(`Exposure ${exposure.id} must occur at or after its source report`);
    }
    const stored = structuredClone(exposure);
    this.exposures.set(stored.id, stored);
    this.events.push({ type: "belief_exposed", exposure: stored });
  }

  /**
   * Validate a whole round against an isolated clone, then commit it. This is
   * the ledger-side transaction boundary used by finalizeRound: a bad report
   * or exposure cannot leave a partially appended round behind.
   */
  commitRound(batch: {
    evidence: EpistemicEvidence[];
    reports: BeliefReport[];
    exposures: BeliefExposure[];
  }): void {
    const staged = this.clone();
    staged.applyBatch(batch);
    staged.assertObservedReportsWereExposed(batch.reports);
    this.applyBatch(batch);
  }

  resolveClaim(resolution: ClaimResolution): void {
    const claim = this.claims.get(resolution.claimId);
    if (!claim) throw new Error(`Unknown claim ${resolution.claimId}`);
    if (this.resolutions.has(resolution.claimId)) throw new Error(`Claim ${resolution.claimId} is already resolved`);
    if (resolution.resolverId !== claim.resolutionPolicy.resolverId) {
      throw new Error(`Resolver ${resolution.resolverId} is not authorized for claim ${resolution.claimId}`);
    }
    this.contractRegistry.get(claim.resolutionPolicy.kind).validateResolution(claim, resolution);
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

  getExposuresForClaim(claimId: string): BeliefExposure[] {
    return structuredClone([...this.exposures.values()].filter(exposure => exposure.claimId === claimId));
  }

  getReport(reportId: string): BeliefReport | undefined {
    const report = this.reports.get(reportId);
    return report ? structuredClone(report) : undefined;
  }

  getClaim(claimId: string): EpistemicClaim | undefined {
    const claim = this.claims.get(claimId);
    return claim ? structuredClone(claim) : undefined;
  }

  getEvidence(evidenceId: string): EpistemicEvidence | undefined {
    const item = this.evidence.get(evidenceId);
    return item ? structuredClone(item) : undefined;
  }

  getResolution(claimId: string): ClaimResolution | undefined {
    const resolution = this.resolutions.get(claimId);
    return resolution ? structuredClone(resolution) : undefined;
  }


  private applyBatch(batch: {
    evidence: EpistemicEvidence[];
    reports: BeliefReport[];
    exposures: BeliefExposure[];
  }): void {
    for (const item of batch.evidence) this.registerEvidence(item);
    const pendingExposures = [...batch.exposures];
    for (const report of batch.reports) {
      for (const observedReportId of report.observedReportIds ?? []) {
        const exposureIndex = pendingExposures.findIndex(exposure =>
          exposure.sourceReportId === observedReportId
          && exposure.targetAgentId === report.agentId
        );
        if (exposureIndex >= 0) {
          this.appendExposure(pendingExposures[exposureIndex]);
          pendingExposures.splice(exposureIndex, 1);
        }
      }
      this.appendBeliefReport(report);
    }
    for (const exposure of pendingExposures) this.appendExposure(exposure);
  }

  private assertObservedReportsWereExposed(reports: BeliefReport[]): void {
    for (const report of reports) {
      for (const observedReportId of report.observedReportIds ?? []) {
        const matchedExposure = [...this.exposures.values()].some(exposure =>
          exposure.sourceReportId === observedReportId
          && exposure.targetAgentId === report.agentId
          && exposure.round <= report.round
        );
        if (!matchedExposure) {
          throw new Error(`Observed report ${observedReportId} has no matching architecture-recorded exposure for ${report.agentId}`);
        }
      }
    }
  }

  private clone(): EpistemicLedger {
    const clone = new EpistemicLedger(this.contractRegistry);
    for (const event of this.events) {
      if (event.type === "claim_registered") clone.registerClaim(event.claim);
      else if (event.type === "evidence_registered") clone.registerEvidence(event.evidence);
      else if (event.type === "belief_reported") clone.appendBeliefReport(event.report);
      else if (event.type === "belief_exposed") clone.appendExposure(event.exposure);
      else clone.resolveClaim(event.resolution);
    }
    return clone;
  }
}
