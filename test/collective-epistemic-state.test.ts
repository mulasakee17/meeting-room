import { describe, expect, it } from "vitest";
import {
  fingerprintEstimatorValue,
  projectCollectiveEpistemicStateV1,
  replayCollectiveEpistemicStateV1,
  validateCollectiveEpistemicStateV1,
  type BeliefExposure,
  type BeliefReport,
  type CategoricalEpistemicClaim,
  type EpistemicClaim,
  type EpistemicEvidence,
} from "@/lib/epistemic";

const binaryClaim: EpistemicClaim = {
  id: "claim:macro:binary",
  proposition: "The proposal is correct.",
  domain: "test",
  createdAt: "2026-08-12T00:00:00.000Z",
  resolutionPolicy: { kind: "binary", resolverId: "resolver:test" },
};

function evidence(id: string, lineageId?: string): EpistemicEvidence {
  return {
    id,
    content: id,
    createdAt: "2026-08-12T00:00:00.000Z",
    provenance: { sourceKind: "dataset", sourceId: `source:${id}`, contentHash: `sha256:${id}`, lineageId },
  };
}

function binaryReport(input: {
  id: string; agentId: string; probability: number; round?: number; evidenceId?: string;
  supersedesReportId?: string; observedReportIds?: string[];
}): BeliefReport {
  return {
    id: input.id,
    claimId: binaryClaim.id,
    agentId: input.agentId,
    round: input.round ?? 1,
    value: { kind: "binary", probability: input.probability },
    evidence: input.evidenceId ? [{ evidenceId: input.evidenceId, relation: "supports" }] : [],
    stake: 0,
    createdAt: `2026-08-12T00:00:0${input.round ?? 1}.000Z`,
    ...(input.supersedesReportId === undefined ? {} : { supersedesReportId: input.supersedesReportId }),
    ...(input.observedReportIds === undefined ? {} : { observedReportIds: input.observedReportIds }),
  };
}

describe("CollectiveEpistemicStateV1", () => {
  it("separates within-agent uncertainty from between-agent disagreement", () => {
    const items = [evidence("e1", "lineage:1"), evidence("e2", "lineage:2")];
    const state = projectCollectiveEpistemicStateV1({
      claim: binaryClaim,
      reports: [
        binaryReport({ id: "r1", agentId: "a1", probability: 0.9, evidenceId: "e1" }),
        binaryReport({ id: "r2", agentId: "a2", probability: 0.1, evidenceId: "e2" }),
      ],
      evidence: items,
      exposures: [],
      asOfRound: 1,
      expectedAgentIds: ["a1", "a2", "a3"],
    });
    expect(state.withinAgentUncertainty).toBeCloseTo(0.4689956);
    expect(state.pooledUncertainty).toBeCloseTo(1);
    expect(state.betweenAgentDisagreement).toBeCloseTo(0.5310044);
    expect(state.pooledBelief).toEqual({ kind: "binary", probability: 0.5 });
    expect(state.pooledPredictedOutcomes).toEqual([false, true]);
    expect(state.missingExpectedAgentIds).toEqual(["a3"]);
    expect(state.declaredLineageDiversity.effectiveLineageCount).toBeCloseTo(2);
    expect(state.inferenceStatus).toBe("descriptive_macrostate_only");
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("treats same-lineage corroboration as one effective declared source", () => {
    const state = projectCollectiveEpistemicStateV1({
      claim: binaryClaim,
      reports: [
        binaryReport({ id: "r1", agentId: "a1", probability: 0.9, evidenceId: "e1" }),
        binaryReport({ id: "r2", agentId: "a2", probability: 0.8, evidenceId: "e2" }),
      ],
      evidence: [evidence("e1", "lineage:shared"), evidence("e2", "lineage:shared")],
      exposures: [],
      asOfRound: 1,
    });
    expect(state.declaredLineageDiversity).toMatchObject({
      completeness: "complete",
      distinctDeclaredLineageCount: 1,
      effectiveLineageCount: 1,
      normalizedLineageEntropy: 0,
    });
  });

  it("represents missing lineage as unavailable rather than zero diversity", () => {
    const state = projectCollectiveEpistemicStateV1({
      claim: binaryClaim,
      reports: [
        binaryReport({ id: "r1", agentId: "a1", probability: 0.9, evidenceId: "e1" }),
        binaryReport({ id: "r2", agentId: "a2", probability: 0.8 }),
      ],
      evidence: [evidence("e1", "lineage:known")],
      exposures: [],
      asOfRound: 1,
    });
    expect(state.declaredLineageDiversity).toMatchObject({
      completeness: "partial",
      missingLineageReportIds: ["r2"],
      effectiveLineageCount: null,
      normalizedLineageEntropy: null,
    });
  });

  it("attributes only architecture-observed response mass and does not call it causal influence", () => {
    const r1 = binaryReport({ id: "r1", agentId: "source-a", probability: 0.9, evidenceId: "e1" });
    const r2 = binaryReport({ id: "r2", agentId: "source-b", probability: 0.2, evidenceId: "e2" });
    const priorA = binaryReport({ id: "a0", agentId: "target-a", probability: 0.5, evidenceId: "e3" });
    const nextA = binaryReport({
      id: "a1", agentId: "target-a", probability: 0.8, round: 2, evidenceId: "e3",
      supersedesReportId: "a0", observedReportIds: ["r1"],
    });
    const priorB = binaryReport({ id: "b0", agentId: "target-b", probability: 0.5, evidenceId: "e4" });
    const nextB = binaryReport({
      id: "b1", agentId: "target-b", probability: 0.6, round: 2, evidenceId: "e4",
      supersedesReportId: "b0", observedReportIds: ["r1", "r2"],
    });
    const exposures: BeliefExposure[] = [
      { id: "x1", claimId: binaryClaim.id, sourceReportId: "r1", targetAgentId: "target-a", round: 1, channel: "current_round", exposedAt: "2026-08-12T00:00:01.000Z" },
      { id: "x2", claimId: binaryClaim.id, sourceReportId: "r1", targetAgentId: "target-b", round: 1, channel: "current_round", exposedAt: "2026-08-12T00:00:01.000Z" },
      { id: "x3", claimId: binaryClaim.id, sourceReportId: "r2", targetAgentId: "target-b", round: 1, channel: "current_round", exposedAt: "2026-08-12T00:00:01.000Z" },
    ];
    const state = projectCollectiveEpistemicStateV1({
      claim: binaryClaim,
      reports: [r1, r2, priorA, nextA, priorB, nextB],
      evidence: [evidence("e1", "l1"), evidence("e2", "l2"), evidence("e3", "l3"), evidence("e4", "l4")],
      exposures,
      asOfRound: 2,
    });
    expect(state.exposureConditionedRevision).toMatchObject({ revisionCount: 2, targetAgentCount: 2 });
    expect(state.exposureConditionedRevision.totalBeliefDistance).toBeCloseTo(0.4);
    expect(state.exposureConditionedRevision.meanBeliefDistance).toBeCloseTo(0.2);
    expect(state.observedResponseConcentration.status).toBe("available");
    expect(state.observedResponseConcentration.responseMassBySourceAgent["source-a"]).toBeCloseTo(0.35);
    expect(state.observedResponseConcentration.responseMassBySourceAgent["source-b"]).toBeCloseTo(0.05);
  });

  it("is categorical-option-order invariant for symmetric permutations", () => {
    const claim: CategoricalEpistemicClaim = {
      id: "claim:cat", proposition: "Choose", domain: "test", createdAt: "2026-08-12T00:00:00.000Z",
      options: ["b", "a", "c"], resolutionPolicy: { kind: "categorical", resolverId: "resolver:test" },
    };
    const reports: BeliefReport[] = [
      { id: "c1", claimId: claim.id, agentId: "a1", round: 1, value: { kind: "categorical", probabilities: { a: 0.7, b: 0.2, c: 0.1 } }, evidence: [], stake: 0, createdAt: claim.createdAt },
      { id: "c2", claimId: claim.id, agentId: "a2", round: 1, value: { kind: "categorical", probabilities: { c: 0.1, b: 0.2, a: 0.7 } }, evidence: [], stake: 0, createdAt: claim.createdAt },
    ];
    const state = projectCollectiveEpistemicStateV1({ claim, reports, evidence: [], exposures: [], asOfRound: 1 });
    expect(state.pooledBelief).toEqual({ kind: "categorical", probabilities: { a: 0.7, b: 0.2, c: 0.1 } });
    expect(state.pooledPredictedOutcomes).toEqual(["a"]);
    expect(state.betweenAgentDisagreement).toBeCloseTo(0);
  });

  it("replays deterministically and rejects a self-inconsistent mutation", () => {
    const input = {
      claim: binaryClaim,
      reports: [binaryReport({ id: "r1", agentId: "a1", probability: 0.8, evidenceId: "e1" })],
      evidence: [evidence("e1", "l1")],
      exposures: [] as BeliefExposure[],
      asOfRound: 1,
    };
    const state = projectCollectiveEpistemicStateV1(input);
    expect(replayCollectiveEpistemicStateV1(input, state)).toEqual(state);
    const tampered = structuredClone(state) as unknown as {
      pooledCertainty: number;
    } & Parameters<typeof validateCollectiveEpistemicStateV1>[0];
    tampered.pooledCertainty = 0.1;
    expect(() => validateCollectiveEpistemicStateV1(tampered)).toThrow("pooled belief geometry is inconsistent");
  });

  it("fails closed when an observed report lacks architecture-recorded exposure", () => {
    expect(() => projectCollectiveEpistemicStateV1({
      claim: binaryClaim,
      reports: [
        binaryReport({ id: "r1", agentId: "source", probability: 0.8 }),
        binaryReport({ id: "a0", agentId: "target", probability: 0.5 }),
        binaryReport({ id: "a1", agentId: "target", probability: 0.6, round: 2, supersedesReportId: "a0", observedReportIds: ["r1"] }),
      ],
      evidence: [], exposures: [], asOfRound: 2,
    })).toThrow("no matching exposure");
  });

  it("is invariant to source array order and excludes future/cross-claim reports", () => {
    const r1 = binaryReport({ id: "r1", agentId: "a1", probability: 0.8, evidenceId: "e1" });
    const r2 = binaryReport({ id: "r2", agentId: "a2", probability: 0.3, evidenceId: "e2" });
    const future = binaryReport({ id: "future", agentId: "a1", probability: 0.1, round: 3, supersedesReportId: "r1" });
    const crossClaim = { ...binaryReport({ id: "other", agentId: "z", probability: 0.9 }), claimId: "claim:other" };
    const e1 = evidence("e1", "l1");
    const e2 = evidence("e2", "l2");
    const left = projectCollectiveEpistemicStateV1({
      claim: binaryClaim, reports: [r1, r2, future, crossClaim], evidence: [e1, e2], exposures: [], asOfRound: 1,
    });
    const right = projectCollectiveEpistemicStateV1({
      claim: binaryClaim, reports: [crossClaim, future, r2, r1],
      evidence: [evidence("unreferenced", "irrelevant"), e2, e1], exposures: [], asOfRound: 1,
    });
    expect(right).toEqual(left);
    expect(left.latestReportIds).toEqual(["r1", "r2"]);
  });

  it("rejects unknown carrier fields even when the content hash is self-consistent", () => {
    const state = projectCollectiveEpistemicStateV1({
      claim: binaryClaim,
      reports: [binaryReport({ id: "r1", agentId: "a1", probability: 0.8 })],
      evidence: [], exposures: [], asOfRound: 1,
    });
    const hostile = { ...structuredClone(state), unexpectedAuthority: "control" } as unknown as Parameters<
      typeof validateCollectiveEpistemicStateV1
    >[0];
    const { contentHash: _oldHash, ...body } = hostile as typeof hostile & { contentHash: string };
    hostile.contentHash = fingerprintEstimatorValue(body);
    expect(() => validateCollectiveEpistemicStateV1(hostile)).toThrow("fields differ from the frozen schema");
  });

  it("rejects a self-consistent source-fingerprint forgery during deterministic replay", () => {
    const input = {
      claim: binaryClaim,
      reports: [binaryReport({ id: "r1", agentId: "a1", probability: 0.8 })],
      evidence: [] as EpistemicEvidence[], exposures: [] as BeliefExposure[], asOfRound: 1,
    };
    const state = projectCollectiveEpistemicStateV1(input);
    const forged = structuredClone(state) as unknown as Parameters<typeof replayCollectiveEpistemicStateV1>[1];
    forged.sourceFingerprints.claim = fingerprintEstimatorValue({ forged: true });
    const { contentHash: _oldHash, ...body } = forged;
    forged.contentHash = fingerprintEstimatorValue(body);
    expect(() => replayCollectiveEpistemicStateV1(input, forged)).toThrow("deterministic replay mismatch");
  });
});
