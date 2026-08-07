import { describe, expect, it } from "vitest";
import {
  BeliefContractRegistry,
  EpistemicLedger,
  ResolverRegistry,
  createDefaultBeliefContractRegistry,
  getBeliefContract,
  scoreBeliefReport,
  scoreBinaryReport,
} from "@/lib/epistemic";
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

const categoricalClaim: EpistemicClaim = {
  id: "claim-category",
  proposition: "Which option is correct?",
  domain: "benchmark",
  createdAt: "2026-08-07T00:00:00.000Z",
  options: ["A", "B", "C"],
  resolutionPolicy: { kind: "categorical", resolverId: "category-oracle" },
};

function report(overrides: Partial<BeliefReport> = {}): BeliefReport {
  return {
    id: "report-1",
    claimId: claim.id,
    agentId: "agent-1",
    round: 1,
    value: { kind: "binary", probability: 0.8 },
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
    ledger.appendExposure({
      id: "exposure-1",
      claimId: claim.id,
      sourceReportId: "report-1",
      targetAgentId: "agent-1",
      round: 2,
      channel: "memory",
      exposedAt: "2026-08-07T00:00:02.500Z",
    });
    ledger.appendBeliefReport(report({
      id: "report-2",
      round: 2,
      value: { kind: "binary", probability: 0.6 },
      supersedesReportId: "report-1",
      observedReportIds: ["report-1"],
    }));
    ledger.resolveClaim({
      claimId: claim.id,
      kind: "binary",
      outcome: true,
      resolverId: "benchmark-oracle",
      resolvedAt: "2026-08-07T00:00:03.000Z",
      evidenceIds: [evidence.id],
    });

    expect(ledger.getEvents().map(event => event.type)).toEqual([
      "claim_registered",
      "evidence_registered",
      "belief_reported",
      "belief_exposed",
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
      kind: "binary",
      outcome: false,
      resolverId: "benchmark-oracle",
      resolvedAt: "2026-08-07T00:00:03.000Z",
    });

    expect(() => ledger.appendBeliefReport(report({ evidence: [] })))
      .toThrow("already resolved");
  });

  it("does not partially append a round when an exposure is invalid", () => {
    const ledger = new EpistemicLedger();
    ledger.registerClaim(claim);

    expect(() => ledger.commitRound({
      evidence: [evidence],
      reports: [report()],
      exposures: [{
        id: "exposure-1",
        claimId: claim.id,
        sourceReportId: "missing-report",
        targetAgentId: "agent-2",
        round: 1,
        channel: "current_round",
        exposedAt: "2026-08-07T00:00:03.000Z",
      }],
    })).toThrow("Unknown source report missing-report");

    expect(ledger.getEvents().map(event => event.type)).toEqual(["claim_registered"]);
    expect(ledger.getReportsForClaim(claim.id)).toEqual([]);
  });

  it("validates a categorical belief against its claim-owned simplex", () => {
    const ledger = new EpistemicLedger();
    ledger.registerClaim(categoricalClaim);

    expect(() => ledger.appendBeliefReport({
      id: "categorical-report-invalid",
      claimId: categoricalClaim.id,
      agentId: "agent-1",
      round: 1,
      value: { kind: "categorical", probabilities: { A: 0.5, B: 0.5 } },
      evidence: [],
      stake: 0,
      createdAt: "2026-08-07T00:00:01.000Z",
    })).toThrow("assign every canonical option exactly once");

    ledger.appendBeliefReport({
      id: "categorical-report-valid",
      claimId: categoricalClaim.id,
      agentId: "agent-1",
      round: 1,
      value: { kind: "categorical", probabilities: { A: 0.2, B: 0.7, C: 0.1 } },
      evidence: [],
      stake: 0,
      createdAt: "2026-08-07T00:00:01.000Z",
    });
    expect(ledger.getReportsForClaim(categoricalClaim.id)).toHaveLength(1);
  });

  it("resolves through an identity- and kind-checked resolver registry", () => {
    const registry = new ResolverRegistry();
    registry.register({
      id: "category-oracle",
      kind: "categorical",
      resolve: (_claim, input) => input,
    });
    const resolution = registry.resolve(categoricalClaim, "B", {
      resolvedAt: "2026-08-07T00:00:03.000Z",
    });
    expect(resolution).toMatchObject({
      claimId: categoricalClaim.id,
      kind: "categorical",
      outcome: "B",
      resolverId: "category-oracle",
    });

    expect(() => registry.resolve(categoricalClaim, "invented", {
      resolvedAt: "2026-08-07T00:00:03.000Z",
    })).toThrow("not a canonical option");
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

describe("scoreBeliefReport", () => {
  it("applies multiclass Brier loss through the categorical contract", () => {
    const resolution = {
      claimId: categoricalClaim.id,
      kind: "categorical" as const,
      outcome: "B",
      resolverId: "category-oracle",
      resolvedAt: "2026-08-07T00:00:03.000Z",
    };
    const wrongAndCertain = scoreBeliefReport(categoricalClaim, {
      claimId: categoricalClaim.id,
      value: { kind: "categorical", probabilities: { A: 0.95, B: 0.03, C: 0.02 } },
      stake: 10,
    }, resolution);
    const uncertain = scoreBeliefReport(categoricalClaim, {
      claimId: categoricalClaim.id,
      value: { kind: "categorical", probabilities: { A: 0.34, B: 0.33, C: 0.33 } },
      stake: 10,
    }, resolution);

    expect(wrongAndCertain.kind).toBe("categorical");
    expect(wrongAndCertain.properLoss).toBeGreaterThan(uncertain.properLoss);
    expect(wrongAndCertain.stakeWeightedLoss).toBeCloseTo(wrongAndCertain.properLoss * 10);
  });
});

describe("Belief contracts", () => {
  it("rejects duplicate registration and mutation after sealing", () => {
    const registry = createDefaultBeliefContractRegistry();
    expect(registry.listKinds()).toEqual(["binary", "categorical"]);
    expect(() => registry.register(registry.get("binary"))).toThrow("already exists");

    registry.seal();
    expect(Object.isFrozen(registry.get("binary"))).toBe(true);
    expect(() => registry.register(registry.get("binary"))).toThrow("is sealed");
  });

  it("defines binary total-variation distance and normalized entropy", () => {
    const binary = getBeliefContract("binary");
    expect(binary.distance(
      { kind: "binary", probability: 0.2 },
      { kind: "binary", probability: 0.6 },
    )).toBeCloseTo(0.4);
    expect(binary.uncertainty({ kind: "binary", probability: 0.5 })).toBeCloseTo(1);
    expect(binary.uncertainty({ kind: "binary", probability: 0 })).toBe(0);
    expect(binary.uncertainty({ kind: "binary", probability: 1 })).toBe(0);
    expect(() => binary.distance(
      { kind: "binary", probability: -0.1 },
      { kind: "binary", probability: 0.5 },
    )).toThrow("within [0, 1]");
  });

  it("defines categorical total-variation distance and normalized entropy", () => {
    const categorical = getBeliefContract("categorical");
    expect(categorical.distance(
      { kind: "categorical", probabilities: { A: 1, B: 0, C: 0 } },
      { kind: "categorical", probabilities: { A: 0, B: 1, C: 0 } },
    )).toBeCloseTo(1);
    expect(categorical.uncertainty({
      kind: "categorical",
      probabilities: { A: 1 / 3, B: 1 / 3, C: 1 / 3 },
    })).toBeCloseTo(1);
    expect(categorical.uncertainty({
      kind: "categorical",
      probabilities: { A: 1, B: 0, C: 0 },
    })).toBe(0);
    expect(() => categorical.distance(
      { kind: "categorical", probabilities: { A: 0.2, B: 0.2, C: 0.2 } },
      { kind: "categorical", probabilities: { A: 0.3, B: 0.3, C: 0.4 } },
    )).toThrow("sum to 1");
  });

  it("preserves an injected registry across atomic ledger staging", () => {
    const base = getBeliefContract("binary");
    let claimValidations = 0;
    let normalizations = 0;
    const registry = new BeliefContractRegistry([{
      ...base,
      validateClaim(candidate) {
        claimValidations++;
        base.validateClaim(candidate);
      },
      normalizeValue(candidate, value) {
        normalizations++;
        return base.normalizeValue(candidate, value);
      },
    }]);
    const ledger = new EpistemicLedger(registry);
    ledger.registerClaim(claim);
    ledger.commitRound({
      evidence: [evidence],
      reports: [report()],
      exposures: [],
    });

    expect(claimValidations).toBeGreaterThanOrEqual(2);
    expect(normalizations).toBe(2);
    expect(ledger.getReportsForClaim(claim.id)).toHaveLength(1);
  });
});
