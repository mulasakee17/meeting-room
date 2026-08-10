import { describe, expect, it } from "vitest";
import {
  ABSTAIN_ON_TIE_DECISION_V1,
  decidePooledBelief,
  equalWeightLinearPool,
  lineageCappedLinearPool,
  selectLatestBeliefReports,
  type BeliefReport,
  type BinaryEpistemicClaim,
  type CategoricalEpistemicClaim,
  type EpistemicEvidence,
} from "@/lib/epistemic";

const claim: BinaryEpistemicClaim = {
  id: "claim:binary",
  proposition: "The proposition is true",
  domain: "test",
  createdAt: "2026-08-09T00:00:00.000Z",
  resolutionPolicy: { kind: "binary", resolverId: "oracle:test" },
};

function evidence(id: string, lineageId?: string): EpistemicEvidence {
  return {
    id,
    content: `evidence ${id}`,
    createdAt: "2026-08-09T00:00:00.000Z",
    provenance: {
      sourceKind: "dataset",
      sourceId: `source:${id}`,
      contentHash: `sha256:${id}`,
      lineageId,
    },
  };
}

function report(
  id: string,
  agentId: string,
  probability: number,
  evidenceId?: string,
  stake = 0,
): BeliefReport {
  return {
    id,
    claimId: claim.id,
    agentId,
    round: 1,
    value: { kind: "binary", probability },
    evidence: evidenceId ? [{ evidenceId, relation: "supports" }] : [],
    stake,
    createdAt: "2026-08-09T00:00:00.000Z",
  };
}

describe("epistemic aggregation contracts", () => {
  it("uses equal report weight, ignores stake, and abstains on exact ties", () => {
    const pool = equalWeightLinearPool({
      claim,
      latestReports: [
        report("r1", "a1", 0.8, undefined, 0),
        report("r2", "a2", 0.2, undefined, 100),
      ],
      abstainedAgentIds: ["a4", "a3", "a4"],
    });

    expect(pool.status).toBe("available");
    if (pool.status !== "available") throw new Error("expected available pool");
    expect(pool.value).toEqual({ kind: "binary", probability: 0.5 });
    expect(pool.contributions.map(item => item.normalizedWeight)).toEqual([0.5, 0.5]);
    expect(pool.abstainedAgentIds).toEqual(["a3", "a4"]);
    expect(decidePooledBelief(pool)).toMatchObject({ status: "abstained", reason: "exact_tie" });
  });

  it("prevents same-lineage Sybil reports from adding independent mass", () => {
    const evidenceItems = [
      evidence("e1", "lineage:sybil"),
      evidence("e2", "lineage:sybil"),
      evidence("e3", "lineage:independent"),
    ];
    const withDuplicate = lineageCappedLinearPool({
      claim,
      latestReports: [
        report("r1", "a1", 0.9, "e1"),
        report("r2", "a2", 0.9, "e2"),
        report("r3", "a3", 0.1, "e3"),
      ],
      evidence: evidenceItems,
      maxWeightPerLineage: 1,
    });
    const withoutDuplicate = lineageCappedLinearPool({
      claim,
      latestReports: [
        report("r1", "a1", 0.9, "e1"),
        report("r3", "a3", 0.1, "e3"),
      ],
      evidence: evidenceItems,
      maxWeightPerLineage: 1,
    });

    expect(withDuplicate.status).toBe("available");
    expect(withoutDuplicate.status).toBe("available");
    if (withDuplicate.status !== "available" || withoutDuplicate.status !== "available") {
      throw new Error("expected available pools");
    }
    expect(withDuplicate.value).toEqual(withoutDuplicate.value);
    expect(withDuplicate.value).toEqual({ kind: "binary", probability: 0.5 });
    expect(withDuplicate.contributions.map(item => item.effectiveWeight)).toEqual([0.5, 0.5, 1]);
  });

  it("fails closed when lineage is missing instead of inventing independence", () => {
    const pool = lineageCappedLinearPool({
      claim,
      latestReports: [report("r1", "a1", 0.9, "e1")],
      evidence: [evidence("e1")],
      maxWeightPerLineage: 1,
      abstainedAgentIds: ["a2"],
    });

    expect(pool).toEqual({
      status: "unavailable",
      policyRef: {
        id: "swarmalpha.aggregation.lineage-capped-linear-pool",
        version: "1.0.0",
      },
      claimId: claim.id,
      reason: "missing_lineage",
      missingLineageReportIds: ["r1"],
      abstainedAgentIds: ["a2"],
    });
    expect(decidePooledBelief(pool)).toMatchObject({ status: "abstained", reason: "pool_unavailable" });
  });

  it("enforces every overlapping lineage cap using the tightest dependency", () => {
    const pool = lineageCappedLinearPool({
      claim,
      latestReports: [
        {
          ...report("r1", "a1", 0.9),
          evidence: [
            { evidenceId: "e:shared", relation: "supports" },
            { evidenceId: "e:left", relation: "supports" },
          ],
        },
        {
          ...report("r2", "a2", 0.1),
          evidence: [
            { evidenceId: "e:shared", relation: "supports" },
            { evidenceId: "e:right", relation: "supports" },
          ],
        },
        report("r3", "a3", 0.8, "e:left"),
      ],
      evidence: [
        evidence("e:shared", "lineage:shared"),
        evidence("e:left", "lineage:left"),
        evidence("e:right", "lineage:right"),
      ],
      maxWeightPerLineage: 1,
    });

    expect(pool.status).toBe("available");
    if (pool.status !== "available") throw new Error("expected available pool");
    expect(pool.contributions.map(item => item.effectiveWeight)).toEqual([0.5, 0.5, 0.5]);
    const weightByReport = new Map(pool.contributions.map(item => [item.reportId, item.effectiveWeight]));
    expect((weightByReport.get("r1") ?? 0) + (weightByReport.get("r2") ?? 0)).toBeLessThanOrEqual(1);
    expect((weightByReport.get("r1") ?? 0) + (weightByReport.get("r3") ?? 0)).toBeLessThanOrEqual(1);
  });

  it("rejects contradictory active-report and abstention records", () => {
    expect(() => equalWeightLinearPool({
      claim,
      latestReports: [report("r1", "a1", 0.8)],
      abstainedAgentIds: ["a1"],
    })).toThrow("Abstained agents must not have active reports");
  });

  it("selects one terminal revision per agent and rejects ambiguous histories", () => {
    const first = report("r1", "a1", 0.4);
    const second = { ...report("r2", "a1", 0.7), round: 2, supersedesReportId: "r1" };
    expect(selectLatestBeliefReports(claim.id, [first, second])).toEqual([second]);
    expect(() => selectLatestBeliefReports(claim.id, [
      first,
      { ...report("r3", "a1", 0.8), round: 2 },
    ])).toThrow("ambiguous latest-report history");
  });

  it("abstains on exact categorical ties regardless of option order and picks the true winner otherwise", () => {
    function categoricalClaim(id: string, options: string[]): CategoricalEpistemicClaim {
      return {
        id,
        proposition: `Categorical claim ${id}`,
        domain: "test",
        createdAt: "2026-08-09T00:00:00.000Z",
        options,
        resolutionPolicy: { kind: "categorical", resolverId: "oracle:test" },
      };
    }
    function categoricalReport(
      id: string,
      agentId: string,
      probabilities: Record<string, number>,
      claimId: string,
    ): BeliefReport {
      return {
        id,
        claimId,
        agentId,
        round: 1,
        value: { kind: "categorical", probabilities },
        evidence: [],
        stake: 0,
        createdAt: "2026-08-09T00:00:00.000Z",
      };
    }

    const claimAB = categoricalClaim("claim:cat:ab", ["A", "B"]);
    const claimBA = categoricalClaim("claim:cat:ba", ["B", "A"]);

    // Exact tie: equal pooled mass across both options abstains no matter which
    // option is listed first.
    for (const candidateClaim of [claimAB, claimBA]) {
      const pool = equalWeightLinearPool({
        claim: candidateClaim,
        latestReports: [
          categoricalReport("r1", "a1", { A: 0.5, B: 0.5 }, candidateClaim.id),
          categoricalReport("r2", "a2", { A: 0.5, B: 0.5 }, candidateClaim.id),
        ],
      });
      expect(pool.status).toBe("available");
      if (pool.status !== "available") throw new Error("expected available pool");
      expect(decidePooledBelief(pool)).toMatchObject({ status: "abstained", reason: "exact_tie" });
    }

    // Non-tie: the same winner is selected regardless of canonical option order.
    const winnerAB = decidePooledBelief(equalWeightLinearPool({
      claim: claimAB,
      latestReports: [
        categoricalReport("r3", "a1", { A: 0.6, B: 0.4 }, claimAB.id),
        categoricalReport("r4", "a2", { A: 0.6, B: 0.4 }, claimAB.id),
      ],
    }));
    const winnerBA = decidePooledBelief(equalWeightLinearPool({
      claim: claimBA,
      latestReports: [
        categoricalReport("r5", "a1", { B: 0.4, A: 0.6 }, claimBA.id),
        categoricalReport("r6", "a2", { B: 0.4, A: 0.6 }, claimBA.id),
      ],
    }));
    expect(winnerAB).toEqual({
      status: "decided",
      decisionContractRef: ABSTAIN_ON_TIE_DECISION_V1,
      claimId: claimAB.id,
      outcome: "A",
    });
    expect(winnerBA).toEqual({
      status: "decided",
      decisionContractRef: ABSTAIN_ON_TIE_DECISION_V1,
      claimId: claimBA.id,
      outcome: "A",
    });
  });
});
