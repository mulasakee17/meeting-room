import { describe, expect, it } from "vitest";
import {
  projectCollectiveEpistemicStateV1,
  type BeliefReport,
  type EpistemicClaim,
  type EpistemicEvidence,
} from "@/lib/epistemic";
import {
  projectOnlineEpistemicRiskV1,
  replayTruthBlindInformationActionV1,
  selectTruthBlindInformationActionV1,
  validateTruthBlindActionDecisionV1,
  type ActiveInformationActionCandidateV1,
} from "@/lib/governance";

const claim: EpistemicClaim = {
  id: "claim:truth-blind",
  proposition: "The proposed action should be accepted.",
  domain: "test",
  createdAt: "2026-08-13T00:00:00.000Z",
  resolutionPolicy: { kind: "binary", resolverId: "offline-only" },
};

function evidence(id: string, lineageId?: string): EpistemicEvidence {
  return {
    id,
    content: id,
    createdAt: "2026-08-13T00:00:00.000Z",
    provenance: {
      sourceKind: "dataset",
      sourceId: `source:${id}`,
      contentHash: `sha256:${id}`,
      ...(lineageId === undefined ? {} : { lineageId }),
    },
  };
}

function report(id: string, agentId: string, probability: number, evidenceId?: string): BeliefReport {
  return {
    id,
    claimId: claim.id,
    agentId,
    round: 1,
    value: { kind: "binary", probability },
    evidence: evidenceId ? [{ evidenceId, relation: "supports" }] : [],
    stake: 0,
    createdAt: "2026-08-13T00:00:01.000Z",
  };
}

function collectiveStateWith(lineages: Array<string | undefined> = ["lineage:shared", "lineage:shared"]) {
  const items = lineages.map((lineage, index) => evidence(`e${index}`, lineage));
  return projectCollectiveEpistemicStateV1({
    claim,
    reports: [report("r1", "a1", 0.9, "e0"), report("r2", "a2", 0.8, "e1")],
    evidence: items,
    exposures: [],
    asOfRound: 1,
  });
}

function riskWith(lineages: Array<string | undefined> = ["lineage:shared", "lineage:shared"]) {
  return projectOnlineEpistemicRiskV1({
    collectiveState: collectiveStateWith(lineages),
    consequence: { level: "high", contractRef: { id: "contract:stakes", version: "1.0.0" } },
  });
}

function candidate(input: Partial<ActiveInformationActionCandidateV1> & { id: string }): ActiveInformationActionCandidateV1 {
  const { id, ...overrides } = input;
  return {
    id,
    claimId: claim.id,
    eligibilityDecisionId: `eligibility:${id}`,
    actionRef: { id: "action:query", version: "1.0.0" },
    targetIds: ["source:new"],
    sourceDistinctness: "unknown_relation",
    sourceRelationRefs: [],
    informationAccess: "new_external_observation",
    expectedObservationKinds: ["evidence"],
    cost: { computeUnits: 1, latencyUnits: 1 },
    available: true,
    ...overrides,
  };
}

describe("truth-blind active information governance", () => {
  it("keeps prompt sensitivity and factual support missing instead of treating absence as zero", () => {
    const risk = riskWith();
    expect(risk.dimensions.promptSensitivity).toMatchObject({
      status: "missing", reason: "qualified_prompt_perturbation_absent",
    });
    expect(risk.dimensions.qualifiedUnsupportedness).toMatchObject({
      status: "missing", reason: "qualified_support_observation_absent",
    });
  });

  it("does not emit numeric source concentration for incomplete declared lineage", () => {
    const risk = riskWith(["lineage:known", undefined]);
    expect(risk.dimensions.declaredSourceConcentration).toMatchObject({
      status: "missing", reason: "declared_lineage_incomplete",
    });
  });

  it("rejects a ground-truth field at the online risk boundary before projection", () => {
    expect(() => projectOnlineEpistemicRiskV1({
      collectiveState: collectiveStateWith(),
      consequence: { level: "high", contractRef: { id: "contract:stakes", version: "1.0.0" } },
      groundTruth: true,
    } as never)).toThrow("fields differ from the frozen schema");
  });

  it("prefers a verified-distinct identity that acquires new information over a cheaper same-lineage reanalysis", () => {
    const risk = riskWith();
    const decision = selectTruthBlindInformationActionV1({
      risk,
      candidates: [
        candidate({
          id: "cheap-public",
          sourceDistinctness: "same_declared_lineage",
          sourceRelationRefs: ["relation:shared"],
          informationAccess: "public_reanalysis_only",
          cost: { computeUnits: 0, latencyUnits: 0 },
        }),
        candidate({
          id: "new-tool",
          sourceDistinctness: "verified_distinct_identity",
          sourceRelationRefs: ["verification:source-new"],
          informationAccess: "new_external_observation",
          cost: { computeUnits: 2, latencyUnits: 2 },
        }),
      ],
      availableBudget: { computeUnits: 2, latencyUnits: 2 },
    });
    expect(decision.selectedAction?.id).toBe("new-tool");
    expect(decision.inferenceStatus).toBe("frozen_heuristic_not_value_optimal");
    expect(replayTruthBlindInformationActionV1({
      risk,
      candidates: [
        candidate({ id: "cheap-public", sourceDistinctness: "same_declared_lineage", sourceRelationRefs: ["relation:shared"], informationAccess: "public_reanalysis_only", cost: { computeUnits: 0, latencyUnits: 0 } }),
        candidate({ id: "new-tool", sourceDistinctness: "verified_distinct_identity", sourceRelationRefs: ["verification:source-new"], informationAccess: "new_external_observation", cost: { computeUnits: 2, latencyUnits: 2 } }),
      ],
      availableBudget: { computeUnits: 2, latencyUnits: 2 },
      stored: decision,
    })).toEqual(decision);
  });

  it("rejects an asserted known source relation without an authority record", () => {
    expect(() => selectTruthBlindInformationActionV1({
      risk: riskWith(),
      candidates: [candidate({
        id: "unbacked-distinctness",
        sourceDistinctness: "verified_distinct_identity",
        sourceRelationRefs: [],
      })],
      availableBudget: { computeUnits: 2, latencyUnits: 2 },
    })).toThrow("requires authority references");
  });

  it("escalates a high-consequence claim when no action fits the budget", () => {
    const decision = selectTruthBlindInformationActionV1({
      risk: riskWith(),
      candidates: [candidate({ id: "too-costly", cost: { computeUnits: 3, latencyUnits: 3 } })],
      availableBudget: { computeUnits: 1, latencyUnits: 1 },
    });
    expect(decision).toMatchObject({
      decision: "escalate", reasonCode: "no_admissible_action_high_consequence",
    });
  });

  it("rejects unexpected decision authority even with an otherwise plausible carrier", () => {
    const decision = selectTruthBlindInformationActionV1({
      risk: riskWith(),
      candidates: [],
      availableBudget: { computeUnits: 0, latencyUnits: 0 },
    });
    const hostile = { ...structuredClone(decision), groundTruth: true } as never;
    expect(() => validateTruthBlindActionDecisionV1(hostile)).toThrow("fields differ from the frozen schema");
  });
});
