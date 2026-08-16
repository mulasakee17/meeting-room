import { describe, expect, it } from "vitest";
import type { BeliefReport, EpistemicClaim, EpistemicEvidence } from "../src/lib/epistemic/types";
import { deriveProcessStateFeaturesV2 } from "../experiments/campaign/v6/processStateFeaturesV2";

const claim: EpistemicClaim = {
  id: "claim:1",
  proposition: "choose",
  domain: "test",
  createdAt: "2026-08-13T00:00:00.000Z",
  options: ["x", "y", "z"],
  resolutionPolicy: { kind: "categorical", resolverId: "resolver:1" },
};

function evidence(id: string, hash: string): EpistemicEvidence {
  return {
    id,
    content: id,
    createdAt: "2026-08-13T00:00:01.000Z",
    provenance: { sourceKind: "agent", sourceId: "source", contentHash: hash },
  };
}

function report(agentId: string, probabilities: Record<string, number>, ids: string[]): BeliefReport {
  return {
    id: `report:${agentId}`,
    claimId: claim.id,
    agentId,
    round: 1,
    value: { kind: "categorical", probabilities },
    evidence: ids.map(evidenceId => ({ evidenceId, relation: "supports" as const })),
    stake: 0,
    createdAt: "2026-08-13T00:00:02.000Z",
  };
}

describe("prospective process-state features v2", () => {
  it("derives minority strength and content-hash overlap with hand-checkable semantics", () => {
    const state = deriveProcessStateFeaturesV2({
      claim,
      expectedAgentIds: ["a", "b", "c"],
      roundOneReports: [
        report("a", { x: 0.8, y: 0.1, z: 0.1 }, ["e1", "e2"]),
        report("b", { x: 0.7, y: 0.2, z: 0.1 }, ["e3", "e4"]),
        report("c", { x: 0.1, y: 0.85, z: 0.05 }, ["e5"]),
      ],
      roundOneEvidence: [
        evidence("e1", "sha256:shared"), evidence("e2", "sha256:a"),
        evidence("e3", "sha256:shared"), evidence("e4", "sha256:b"),
        evidence("e5", "sha256:c"),
      ],
    });
    expect(state.values.argmaxVoteConcentration).toBeCloseTo(2 / 3);
    expect(state.values.minorityMaxCertainty).toBeCloseTo(0.85);
    expect(state.values.meanEvidenceContentOverlap).toBeCloseTo((1 / 3) / 3);
    expect(state.values.evidenceReferenceCoverage).toBe(1);
    expect(state.values.inverseOptionCount).toBeCloseTo(1 / 3);
  });

  it("splits tied argmax vote mass and does not invent a minority", () => {
    const state = deriveProcessStateFeaturesV2({
      claim,
      expectedAgentIds: ["a", "b"],
      roundOneReports: [
        report("a", { x: 0.5, y: 0.5, z: 0 }, []),
        report("b", { x: 0.5, y: 0.5, z: 0 }, []),
      ],
      roundOneEvidence: [],
    });
    expect(state.values.argmaxVoteConcentration).toBe(0.5);
    expect(state.values.minorityMaxCertainty).toBe(0);
    expect(state.diagnostics.minorityReportCount).toBe(0);
  });

  it("treats empty evidence as missing overlap rather than independence", () => {
    const state = deriveProcessStateFeaturesV2({
      claim,
      expectedAgentIds: ["a", "b"],
      roundOneReports: [
        report("a", { x: 1, y: 0, z: 0 }, []),
        report("b", { x: 0, y: 1, z: 0 }, []),
      ],
      roundOneEvidence: [],
    });
    expect(state.values.meanEvidenceContentOverlap).toBe(0);
    expect(state.values.evidenceReferenceCoverage).toBe(0);
  });

  it("fails closed on cross-round reports, duplicate agents, and missing evidence", () => {
    const late = report("a", { x: 1, y: 0, z: 0 }, []);
    late.round = 2;
    expect(() => deriveProcessStateFeaturesV2({ claim, expectedAgentIds: ["a", "b"], roundOneReports: [late], roundOneEvidence: [] }))
      .toThrow(/round 1/);
    expect(() => deriveProcessStateFeaturesV2({
      claim,
      expectedAgentIds: ["a", "b"],
      roundOneReports: [report("a", { x: 1, y: 0, z: 0 }, []), report("a", { x: 0, y: 1, z: 0 }, [])],
      roundOneEvidence: [],
    })).toThrow(/unique members/);
    expect(() => deriveProcessStateFeaturesV2({
      claim,
      expectedAgentIds: ["a", "b"],
      roundOneReports: [report("a", { x: 1, y: 0, z: 0 }, ["missing"])],
      roundOneEvidence: [],
    })).toThrow(/missing round-1 evidence/);
  });

  it("returns frozen values and exposes no outcome/action field", () => {
    const state = deriveProcessStateFeaturesV2({
      claim,
      expectedAgentIds: ["a", "b"],
      roundOneReports: [report("a", { x: 1, y: 0, z: 0 }, []), report("b", { x: 0, y: 1, z: 0 }, [])],
      roundOneEvidence: [],
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.values)).toBe(true);
    expect(Object.keys(state)).toEqual(["measurementRef", "timing", "values", "diagnostics"]);
    expect(Object.keys(state.values)).not.toContain("outcome");
    expect(Object.keys(state.values)).not.toContain("resolution");
    expect(Object.keys(state.values)).not.toContain("action");
  });
});
