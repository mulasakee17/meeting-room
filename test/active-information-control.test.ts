import { describe, expect, it } from "vitest";
import {
  projectCollectiveEpistemicStateV1,
  type BeliefReport,
  type EpistemicClaim,
  type EpistemicEvidence,
} from "@/lib/epistemic";
import {
  assertActiveInformationActionCompletionV1,
  evaluateActiveInformationEligibilityV1,
  projectOnlineEpistemicRiskV1,
  selectEligibleTruthBlindInformationActionV1,
  type ActiveInformationActionCandidateV1,
  type ActiveInformationEligibilityPolicyV1,
  type GovernanceActionInstance,
  type GovernanceActionTransition,
} from "@/lib/governance";

const claim: EpistemicClaim = {
  id: "claim:control",
  proposition: "Proceed?",
  domain: "test",
  createdAt: "2026-08-13T00:00:00.000Z",
  resolutionPolicy: { kind: "binary", resolverId: "offline-only" },
};

function evidence(id: string, lineageId: string): EpistemicEvidence {
  return {
    id,
    content: id,
    createdAt: "2026-08-13T00:00:00.000Z",
    provenance: { sourceKind: "dataset", sourceId: `source:${id}`, contentHash: `sha256:${id}`, lineageId },
  };
}

function report(id: string, agentId: string, evidenceId: string): BeliefReport {
  return {
    id, claimId: claim.id, agentId, round: 1,
    value: { kind: "binary", probability: 0.9 },
    evidence: [{ evidenceId, relation: "supports" }], stake: 0,
    createdAt: "2026-08-13T00:00:01.000Z",
  };
}

function risk() {
  const state = projectCollectiveEpistemicStateV1({
    claim,
    reports: [report("r1", "a1", "e1"), report("r2", "a2", "e2")],
    evidence: [evidence("e1", "lineage:shared"), evidence("e2", "lineage:shared")],
    exposures: [], asOfRound: 1,
  });
  return projectOnlineEpistemicRiskV1({
    collectiveState: state,
    consequence: { level: "high", contractRef: { id: "stakes", version: "1.0.0" } },
  });
}

const policy: ActiveInformationEligibilityPolicyV1 = {
  id: "policy:eligibility",
  version: "1.0.0",
  authority: "randomized_experiment_only",
  sourceConcentrationThreshold: 0.8,
  disagreementThreshold: 0.5,
  promptSensitivityThreshold: 0.5,
};

function candidate(input: Partial<ActiveInformationActionCandidateV1> & { id: string }): ActiveInformationActionCandidateV1 {
  const { id, ...rest } = input;
  return {
    id, claimId: claim.id, eligibilityDecisionId: "eligibility:1",
    actionRef: { id: "action:acquire", version: "1.0.0" },
    targetIds: ["source:new"], sourceDistinctness: "unknown_relation",
    sourceRelationRefs: [], informationAccess: "new_external_observation",
    expectedObservationKinds: ["evidence"],
    cost: { computeUnits: 1, latencyUnits: 1 }, available: true,
    ...rest,
  };
}

function lifecycle(action: ActiveInformationActionCandidateV1) {
  const instance: GovernanceActionInstance = {
    id: "instance:1", decisionId: "decision:1", actionRef: action.actionRef,
    targetIds: [...action.targetIds], sourceDiagnosisIds: ["diagnosis:1"],
    parameters: {}, expectedCost: { ...action.cost }, assignmentId: "assignment:1",
    plannedWindow: { startRound: 2, endRound: 2 }, createdAt: "2026-08-13T00:00:02.000Z",
  };
  const transition = (
    id: string,
    from: GovernanceActionTransition["from"],
    to: GovernanceActionTransition["to"],
    round: number,
    sourceEventIds: string[],
  ): GovernanceActionTransition => ({
    id, actionInstanceId: instance.id, from, to, round,
    occurredAt: `2026-08-13T00:00:0${round + 2}.000Z`, sourceEventIds,
    ...(to === "compliance_observed" ? { observation: { acquired: true } } : {}),
  });
  const transitions = [
    transition("t1", null, "proposed", 1, ["eligibility:1"]),
    transition("t2", "proposed", "eligible", 1, ["eligibility:1"]),
    transition("t3", "eligible", "assigned", 1, ["assignment:1"]),
    transition("t4", "assigned", "queued", 1, ["request:1"]),
    transition("t5", "queued", "delivered", 2, ["request:1"]),
    transition("t6", "delivered", "compliance_observed", 2, ["evidence:new"]),
    transition("t7", "compliance_observed", "completed", 2, ["evidence:new"]),
  ];
  return { instance, transitions };
}

describe("minimal active information control", () => {
  it("generates eligibility from non-compensatory reasons and filters unrelated reanalysis", () => {
    const acquire = candidate({
      id: "acquire", sourceDistinctness: "verified_distinct_identity",
      sourceRelationRefs: ["relation:new"], expectedObservationKinds: ["evidence"],
    });
    const reanalyse = candidate({
      id: "reanalyse", informationAccess: "public_reanalysis_only",
      expectedObservationKinds: ["belief_report"],
    });
    const eligibility = evaluateActiveInformationEligibilityV1({
      id: "eligibility:1", risk: risk(), candidates: [reanalyse, acquire], policy,
      sourceRelationAuthorityIds: ["relation:new"],
    });
    expect(eligibility.eligibleCandidateIds).toEqual(["acquire"]);
    expect(eligibility.evaluations.find(item => item.candidateId === "acquire")?.matchedReasonCodes)
      .toEqual(["declared_source_concentrated", "high_consequence_support_missing"]);
    const decision = selectEligibleTruthBlindInformationActionV1({
      risk: risk(), candidates: [reanalyse, acquire], eligibility,
      availableBudget: { computeUnits: 1, latencyUnits: 1 },
    });
    expect(decision.selectedAction?.id).toBe("acquire");
  });

  it("rejects an unregistered source-relation authority", () => {
    expect(() => evaluateActiveInformationEligibilityV1({
      id: "eligibility:1", risk: risk(),
      candidates: [candidate({ id: "x", sourceDistinctness: "verified_distinct_identity", sourceRelationRefs: ["forged"] })],
      policy, sourceRelationAuthorityIds: [],
    })).toThrow("outside the authority snapshot");
  });

  it("does not grant operational authority to the eligibility policy", () => {
    expect(() => evaluateActiveInformationEligibilityV1({
      id: "eligibility:1", risk: risk(), candidates: [],
      policy: { ...policy, authority: "operational" as never }, sourceRelationAuthorityIds: [],
    })).toThrow("not authorized for operational control");
  });

  it("accepts completion only when terminal history binds a new declared observation", () => {
    const action = candidate({ id: "acquire" });
    const { instance, transitions } = lifecycle(action);
    expect(() => assertActiveInformationActionCompletionV1({
      candidate: action, instance, transitions,
      preActionEventIds: ["evidence:old"],
      observations: [{ kind: "evidence", id: "evidence:new" }],
    })).not.toThrow();
  });

  it("rejects completed-without-new-information and public reanalysis posing as evidence acquisition", () => {
    const action = candidate({ id: "acquire" });
    const { instance, transitions } = lifecycle(action);
    expect(() => assertActiveInformationActionCompletionV1({
      candidate: action, instance, transitions, preActionEventIds: [], observations: [],
    })).toThrow("requires a new observation");
    const reanalysis = candidate({
      id: "reanalysis", informationAccess: "public_reanalysis_only",
      expectedObservationKinds: ["evidence"],
    });
    expect(() => assertActiveInformationActionCompletionV1({
      candidate: reanalysis,
      instance: { ...instance, actionRef: reanalysis.actionRef, targetIds: reanalysis.targetIds, expectedCost: reanalysis.cost },
      transitions, preActionEventIds: [], observations: [{ kind: "evidence", id: "evidence:new" }],
    })).toThrow("may only produce a new belief report");
  });
});
