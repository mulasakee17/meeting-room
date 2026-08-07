import { describe, expect, it } from "vitest";
import { EpistemicLedger, scoreBinaryReport } from "@/lib/epistemic";
import type { BeliefReport, EpistemicClaim, EpistemicEvidence } from "@/lib/epistemic";

const claim: EpistemicClaim = {
  id: "claim-1",
  proposition: "Option A is correct",
  domain: "benchmark",
  createdAt: "2026-08-07T00:00:00.000Z",
  resolutionPolicy: { kind: "binary", resolverId: "benchmark-oracle" },
};

const evidence: EpistemicEvidence = {
  id: "evidence-1",
  content: "Held-out observation supports A",
  createdAt: "2026-08-07T00:00:01.000Z",
  provenance: {
    sourceKind: "dataset",
    sourceId: "hidden-benchmark",
    contentHash: "sha256:abc",
    lineageId: "dataset:v1",
  },
};

function report(overrides: Partial<BeliefReport> = {}): BeliefReport {
  return {
    id: "report-1",
    claimId: claim.id,
    agentId: "agent-1",
    round: 1,
    probability: 0.8,
    evidence: [{ evidenceId: evidence.id, relation: "supports" }],
    stake: 10,
    createdAt: "2026-08-07T00:00:02.000Z",
    ...overrides,
  };
}

describe("EpistemicLedger", () => {
  it("records an auditable claim → evidence → belief → resolution history", () => {
    const ledger = new EpistemicLedger();
    ledger.registerClaim(claim);
    ledger.registerEvidence(evidence);
    ledger.appendBeliefReport(report());
    ledger.appendBeliefReport(report({
      id: "report-2",
      round: 2,
      probability: 0.6,
      supersedesReportId: "report-1",
      observedReportIds: ["report-1"],
    }));
    ledger.resolveClaim({
      claimId: claim.id,
      outcome: true,
      resolverId: "benchmark-oracle",
      resolvedAt: "2026-08-07T00:00:03.000Z",
      evidenceIds: [evidence.id],
    });

    expect(ledger.getEvents().map(event => event.type)).toEqual([
      "claim_registered",
      "evidence_registered",
      "belief_reported",
      "belief_reported",
      "claim_resolved",
    ]);
    expect(ledger.getReportsForClaim(claim.id)).toHaveLength(2);
    expect(ledger.getResolution(claim.id)?.outcome).toBe(true);
  });

  it("rejects an unverifiable branch in one agent's belief history", () => {
    const ledger = new EpistemicLedger();
    ledger.registerClaim(claim);
    ledger.registerEvidence(evidence);
    ledger.appendBeliefReport(report());

    expect(() => ledger.appendBeliefReport(report({ id: "report-2", round: 2 })))
      .toThrow("must supersede latest report report-1");
  });

  it("rejects forward or unknown provenance references", () => {
    const ledger = new EpistemicLedger();
    ledger.registerClaim(claim);

    expect(() => ledger.appendBeliefReport(report()))
      .toThrow("Unknown evidence evidence-1");
  });

  it("does not allow reports after resolution", () => {
    const ledger = new EpistemicLedger();
    ledger.registerClaim(claim);
    ledger.resolveClaim({
      claimId: claim.id,
      outcome: false,
      resolverId: "benchmark-oracle",
      resolvedAt: "2026-08-07T00:00:03.000Z",
    });

    expect(() => ledger.appendBeliefReport(report({ evidence: [] })))
      .toThrow("already resolved");
  });
});

describe("scoreBinaryReport", () => {
  it("charges high-confidence wrong reports more than calibrated uncertainty", () => {
    const wrongAndCertain = scoreBinaryReport(
      { claimId: claim.id, probability: 0.99, stake: 10 },
      { claimId: claim.id, outcome: false },
    );
    const uncertain = scoreBinaryReport(
      { claimId: claim.id, probability: 0.6, stake: 10 },
      { claimId: claim.id, outcome: false },
    );

    expect(wrongAndCertain.brierLoss).toBeCloseTo(0.9801);
    expect(wrongAndCertain.stakeWeightedLoss).toBeGreaterThan(uncertain.stakeWeightedLoss);
  });

  it("keeps outcome loss separate from evidence-process enforcement", () => {
    const score = scoreBinaryReport(
      { claimId: claim.id, probability: 0.8, stake: 5 },
      { claimId: claim.id, outcome: true },
    );
    expect(score.brierLoss).toBeCloseTo(0.04);
    expect(score.stakeWeightedLoss).toBeCloseTo(0.2);
  });
});
