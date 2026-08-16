/**
 * Minimal active information control — adversarial tests (WP-A eligibility,
 * WP-B completion).
 *
 * These pin the truth-blind eligibility and completion boundaries described in
 * NO_GROUND_TRUTH_ACTIVE_EPISTEMIC_GOVERNANCE_V1.md. Eligibility reasons are
 * multi-label, non-weighted, and bound to the risk state + authority snapshot;
 * completion asserts acquisition of a new declared observation, never
 * effectiveness/correctness/verification/benefit.
 *
 * No src/** change; no provider; no credentials.
 */

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
  type ActiveInformationObservationRefV1,
  type GovernanceActionInstance,
  type GovernanceActionTransition,
} from "@/lib/governance";

const claim: EpistemicClaim = {
  id: "claim:control-adv",
  proposition: "Proceed?",
  domain: "test",
  createdAt: "2026-08-13T00:00:00.000Z",
  resolutionPolicy: { kind: "binary", resolverId: "offline-only" },
};

function evidence(id: string, lineageId: string): EpistemicEvidence {
  return {
    id, content: id, createdAt: "2026-08-13T00:00:00.000Z",
    provenance: { sourceKind: "dataset", sourceId: `source:${id}`, contentHash: `sha256:${id}`, lineageId },
  };
}

function report(id: string, agentId: string, probability: number, evidenceId: string): BeliefReport {
  return {
    id, claimId: claim.id, agentId, round: 1,
    value: { kind: "binary", probability }, evidence: [{ evidenceId, relation: "supports" }], stake: 0,
    createdAt: "2026-08-13T00:00:01.000Z",
  };
}

function riskOf(lineages: string[], probabilities: number[], level: "low" | "moderate" | "high" | "critical" = "high") {
  const state = projectCollectiveEpistemicStateV1({
    claim,
    reports: probabilities.map((probability, index) => report(`r${index}`, `a${index}`, probability, `e${index}`)),
    evidence: lineages.map((lineage, index) => evidence(`e${index}`, lineage)),
    exposures: [], asOfRound: 1,
  });
  return projectOnlineEpistemicRiskV1({
    collectiveState: state,
    consequence: { level, contractRef: { id: "stakes", version: "1.0.0" } },
  });
}

const sharedConcentratedRisk = () => riskOf(["lineage:s", "lineage:s"], [0.9, 0.9], "high");
const lowRisk = () => riskOf(["lineage:a", "lineage:b"], [0.9, 0.9], "low");

const policy: ActiveInformationEligibilityPolicyV1 = {
  id: "policy:eligibility", version: "1.0.0", authority: "randomized_experiment_only",
  sourceConcentrationThreshold: 0.8, disagreementThreshold: 0.5, promptSensitivityThreshold: 0.5,
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

function evaluate(cands: ActiveInformationActionCandidateV1[], authority: string[] = [], risk = sharedConcentratedRisk()) {
  return evaluateActiveInformationEligibilityV1({
    id: "eligibility:1", risk, candidates: cands, policy, sourceRelationAuthorityIds: authority,
  });
}

// ---------------------------------------------------------------------------
// WP-A: eligibility
// ---------------------------------------------------------------------------

describe("eligibility policy shape (WP-A #1)", () => {
  it("rejects thresholds outside [0,1] and non-randomized authority", () => {
    const risk = sharedConcentratedRisk();
    for (const bad of [
      { ...policy, sourceConcentrationThreshold: 1.5 },
      { ...policy, disagreementThreshold: -0.1 },
      { ...policy, promptSensitivityThreshold: Number.NaN },
    ]) {
      expect(() => evaluateActiveInformationEligibilityV1({
        id: "eligibility:1", risk, candidates: [], policy: bad, sourceRelationAuthorityIds: [],
      })).toThrow("finite within [0,1]");
    }
    expect(() => evaluateActiveInformationEligibilityV1({
      id: "eligibility:1", risk, candidates: [],
      policy: { ...policy, authority: "operational" as never }, sourceRelationAuthorityIds: [],
    })).toThrow("not authorized for operational control");
  });
});

describe("candidate binding (WP-A #2)", () => {
  it("requires the candidate to bind the current eligibility id and claim", () => {
    const risk = sharedConcentratedRisk();
    expect(() => evaluate([candidate({ id: "x", eligibilityDecisionId: "eligibility:other" })])).toThrow("not bound to this eligibility decision");
    expect(() => evaluate([candidate({ id: "x", claimId: "claim:other" })])).toThrow("targets another claim");
  });
});

describe("source relation authority (WP-A #3)", () => {
  it("rejects a known distinct relation not in the authority snapshot", () => {
    expect(() => evaluate([candidate({ id: "x", sourceDistinctness: "verified_distinct_identity", sourceRelationRefs: ["forged"] })], [])).toThrow("outside the authority snapshot");
  });
  it("accepts unknown_relation with empty refs (not disguised as distinct)", () => {
    const risk = lowRisk();
    const eligibility = evaluate([candidate({ id: "free-unknown", sourceDistinctness: "unknown_relation", cost: { computeUnits: 0, latencyUnits: 0 } })], [], risk);
    expect(eligibility.evaluations.find(item => item.candidateId === "free-unknown")?.eligible).toBe(false);
  });
});

describe("reason-specific eligibility (WP-A #4-#8)", () => {
  it("lineage missing requires an external observation that adds a provenance record", () => {
    // one active report carries no evidence -> declared lineage incomplete
    const state = projectCollectiveEpistemicStateV1({
      claim,
      reports: [
        report("r0", "a0", 0.9, "e0"),
        { ...report("r1", "a1", 0.9, "e0"), evidence: [] }, // r1 carries no evidence -> lineage incomplete
      ],
      evidence: [evidence("e0", "lineage:a")],
      exposures: [], asOfRound: 1,
    });
    const missingRisk = projectOnlineEpistemicRiskV1({
      collectiveState: state, consequence: { level: "moderate", contractRef: { id: "stakes", version: "1.0.0" } },
    });
    const provenanceCapable = candidate({ id: "capable", expectedObservationKinds: ["provenance_record"] });
    const evidenceOnly = candidate({ id: "evidence-only", expectedObservationKinds: ["evidence"] });
    const eligibility = evaluate([provenanceCapable, evidenceOnly], [], missingRisk);
    expect(eligibility.evaluations.find(item => item.candidateId === "capable")?.matchedReasonCodes).toContain("lineage_identity_missing");
    expect(eligibility.evaluations.find(item => item.candidateId === "evidence-only")?.matchedReasonCodes).not.toContain("lineage_identity_missing");
  });

  it("source concentration only fires for a distinct source that is not public reanalysis", () => {
    const distinct = candidate({ id: "distinct", sourceDistinctness: "declared_distinct_identity", sourceRelationRefs: ["relation:r"] });
    const reanalysis = candidate({ id: "reanalysis", informationAccess: "public_reanalysis_only", expectedObservationKinds: ["belief_report"] });
    const eligibility = evaluate([distinct, reanalysis], ["relation:r"]);
    expect(eligibility.evaluations.find(item => item.candidateId === "distinct")?.matchedReasonCodes).toContain("declared_source_concentrated");
    expect(eligibility.evaluations.find(item => item.candidateId === "reanalysis")?.matchedReasonCodes).not.toContain("declared_source_concentrated");
  });

  it("high disagreement only fires for an external observation that adds evidence", () => {
    const risk = riskOf(["lineage:a", "lineage:b"], [0.95, 0.15], "moderate"); // disagreement high
    const externalEvidence = candidate({ id: "external", expectedObservationKinds: ["evidence"] });
    const privateReport = candidate({ id: "private", informationAccess: "new_private_report", expectedObservationKinds: ["belief_report"] });
    const eligibility = evaluate([externalEvidence, privateReport], [], risk);
    expect(eligibility.evaluations.find(item => item.candidateId === "external")?.matchedReasonCodes).toContain("prompt_conditioned_disagreement_high");
    expect(eligibility.evaluations.find(item => item.candidateId === "private")?.matchedReasonCodes).not.toContain("prompt_conditioned_disagreement_high");
  });

  it("high-consequence support missing allows evidence acquisition without claiming the answer is wrong", () => {
    const eligibility = evaluate([candidate({ id: "acquire", sourceDistinctness: "declared_distinct_identity", sourceRelationRefs: ["relation:r"] })], ["relation:r"]);
    const reasons = eligibility.evaluations.find(item => item.candidateId === "acquire")!.matchedReasonCodes;
    expect(reasons).toContain("high_consequence_support_missing");
    expect(reasons.some(reason => /wrong|incorrect|false/.test(reason))).toBe(false);
    expect(eligibility.inferenceStatus).toBe("experimental_eligibility_not_effectiveness");
  });

  it("a low-risk scenario with no matching reason stays ineligible even when the candidate is free", () => {
    const risk = lowRisk();
    const eligibility = evaluate([candidate({ id: "free", cost: { computeUnits: 0, latencyUnits: 0 } })], [], risk);
    expect(eligibility.evaluations.find(item => item.candidateId === "free")?.eligible).toBe(false);
    expect(eligibility.eligibleCandidateIds).toEqual([]);
  });
});

describe("multi-label, reorder-invariant eligibility (WP-A #10)", () => {
  it("keeps reasons as a non-weighted multi-label set and is invariant to candidate order", () => {
    const candidates = [
      candidate({ id: "b", sourceDistinctness: "declared_distinct_identity", sourceRelationRefs: ["relation:r"] }),
      candidate({ id: "a", sourceDistinctness: "declared_distinct_identity", sourceRelationRefs: ["relation:r"] }),
    ];
    const forward = evaluate(candidates, ["relation:r"]);
    const reversed = evaluate([...candidates].reverse(), ["relation:r"]);
    expect(forward.contentHash).toBe(reversed.contentHash);
    expect(forward.eligibleCandidateIds).toEqual(["a", "b"]);
    // both matched the same multi-label reasons
    expect(forward.evaluations.find(item => item.candidateId === "a")!.matchedReasonCodes).toEqual(
      forward.evaluations.find(item => item.candidateId === "b")!.matchedReasonCodes,
    );
  });
});

describe("selection rejects drifted eligibility (WP-A #11)", () => {
  it("rejects a tampered eligibility, a drifted risk hash, or a drifted authority snapshot", () => {
    const risk = sharedConcentratedRisk();
    const cands = [candidate({ id: "acquire", sourceDistinctness: "declared_distinct_identity", sourceRelationRefs: ["relation:r"] })];
    const eligibility = evaluate(cands, ["relation:r"]);
    const budget = { computeUnits: 1, latencyUnits: 1 };
    expect(selectEligibleTruthBlindInformationActionV1({ risk, candidates: cands, eligibility, availableBudget: budget }).selectedAction?.id).toBe("acquire");

    const driftedRisk = riskOf(["lineage:a", "lineage:b"], [0.9, 0.9], "high");
    expect(() => selectEligibleTruthBlindInformationActionV1({ risk: driftedRisk, candidates: cands, eligibility, availableBudget: budget })).toThrow("not bound to this risk state");

    const tampered = { ...structuredClone(eligibility), riskHash: "sha256:" + "0".repeat(64) } as never;
    expect(() => selectEligibleTruthBlindInformationActionV1({ risk, candidates: cands, eligibility: tampered as never, availableBudget: budget })).toThrow();

    const authorityDrifted = { ...structuredClone(eligibility), sourceRelationAuthorityIds: ["other-authority"] } as never;
    expect(() => selectEligibleTruthBlindInformationActionV1({ risk, candidates: cands, eligibility: authorityDrifted as never, availableBudget: budget })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// WP-B: completion
// ---------------------------------------------------------------------------

function instanceFor(action: ActiveInformationActionCandidateV1, overrides: Partial<GovernanceActionInstance> = {}): GovernanceActionInstance {
  return {
    id: "instance:1", decisionId: "decision:1", actionRef: action.actionRef,
    targetIds: [...action.targetIds], sourceDiagnosisIds: ["diagnosis:1"],
    parameters: {}, expectedCost: { ...action.cost }, assignmentId: "assignment:1",
    plannedWindow: { startRound: 2, endRound: 2 }, createdAt: "2026-08-13T00:00:02.000Z",
    ...overrides,
  };
}

function transition(
  instance: GovernanceActionInstance,
  id: string,
  from: GovernanceActionTransition["from"],
  to: GovernanceActionTransition["to"],
  round: number,
  sourceEventIds: string[],
): GovernanceActionTransition {
  return {
    id, actionInstanceId: instance.id, from, to, round,
    occurredAt: `2026-08-13T00:00:0${round + 2}.000Z`, sourceEventIds,
    ...(to === "compliance_observed" ? { observation: { acquired: true } } : {}),
    ...(to === "failed" ? { failureCode: "provider_error" } : {}),
  };
}

function completedTransitions(instance: GovernanceActionInstance, observationId = "evidence:new"): GovernanceActionTransition[] {
  return [
    transition(instance, "t1", null, "proposed", 1, ["eligibility:1"]),
    transition(instance, "t2", "proposed", "eligible", 1, ["eligibility:1"]),
    transition(instance, "t3", "eligible", "assigned", 1, ["assignment:1"]),
    transition(instance, "t4", "assigned", "queued", 1, ["request:1"]),
    transition(instance, "t5", "queued", "delivered", 2, ["request:1"]),
    transition(instance, "t6", "delivered", "compliance_observed", 2, [observationId]),
    transition(instance, "t7", "compliance_observed", "completed", 2, [observationId]),
  ];
}

function assertCompletion(action: ActiveInformationActionCandidateV1, overrides: {
  instance?: Partial<GovernanceActionInstance>;
  transitions?: GovernanceActionTransition[];
  preActionEventIds?: string[];
  observations?: ActiveInformationObservationRefV1[];
} = {}) {
  const instance = instanceFor(action, overrides.instance);
  return assertActiveInformationActionCompletionV1({
    candidate: action,
    instance,
    transitions: overrides.transitions ?? completedTransitions(instance),
    preActionEventIds: overrides.preActionEventIds ?? [],
    observations: overrides.observations ?? [{ kind: "evidence", id: "evidence:new" }],
  });
}

describe("completion rejects non-acquisition terminals (WP-B #1/#7)", () => {
  it("does not accept failed / censored / held_out histories as acquisition completed", () => {
    const action = candidate({ id: "acquire" });
    const instance = instanceFor(action);
    const failed = [
      transition(instance, "t1", null, "proposed", 1, ["eligibility:1"]),
      transition(instance, "t2", "proposed", "failed", 1, ["eligibility:1"]),
    ];
    expect(() => assertCompletion(action, { transitions: failed })).toThrow("is not completed");

    const censored = [
      transition(instance, "t1", null, "proposed", 1, ["eligibility:1"]),
      transition(instance, "t2", "proposed", "eligible", 1, ["eligibility:1"]),
      transition(instance, "t3", "eligible", "assigned", 1, ["assignment:1"]),
      transition(instance, "t4", "assigned", "censored", 1, ["eligibility:1"]),
    ];
    // censored requires an observation in the validator
    censored[3] = { ...censored[3], observation: { reason: "withdrawn" } };
    expect(() => assertCompletion(action, { transitions: censored })).toThrow("is not completed");

    const heldOut = [
      transition(instance, "t1", null, "proposed", 1, ["eligibility:1"]),
      transition(instance, "t2", "proposed", "eligible", 1, ["eligibility:1"]),
      transition(instance, "t3", "eligible", "held_out", 1, ["eligibility:1"]),
    ];
    expect(() => assertCompletion(action, { transitions: heldOut })).toThrow("is not completed");
  });

  it("rejects an empty observation list even when the lifecycle completed", () => {
    const action = candidate({ id: "acquire" });
    expect(() => assertCompletion(action, { observations: [] })).toThrow("requires a new observation");
  });
});

describe("observation binding (WP-B #2/#3/#4)", () => {
  it("rejects an observation that predates the action", () => {
    const action = candidate({ id: "acquire" });
    expect(() => assertCompletion(action, { preActionEventIds: ["evidence:new"] })).toThrow("predates the action");
  });

  it("rejects an observation kind not declared by the candidate", () => {
    const action = candidate({ id: "acquire", expectedObservationKinds: ["belief_report"] });
    expect(() => assertCompletion(action, { observations: [{ kind: "evidence", id: "evidence:new" }] })).toThrow("observation kind was not declared");
  });

  it("rejects an observation not bound to the terminal transition history", () => {
    const action = candidate({ id: "acquire", expectedObservationKinds: ["evidence", "belief_report"] });
    expect(() => assertCompletion(action, { observations: [{ kind: "evidence", id: "evidence:orphan" }] })).toThrow("not bound to the terminal action history");
  });

  it("accepts each declared observation kind (evidence / belief_report / provenance_record)", () => {
    for (const [kind, id] of [["evidence", "evidence:new"], ["belief_report", "report:new"], ["provenance_record", "provenance:new"]] as const) {
      const action = candidate({ id: `acquire-${kind}`, expectedObservationKinds: [kind] });
      const instance = instanceFor(action);
      expect(() => assertActiveInformationActionCompletionV1({
        candidate: action,
        instance,
        transitions: completedTransitions(instance, id),
        preActionEventIds: [],
        observations: [{ kind, id }],
      })).not.toThrow();
    }
  });
});

describe("instance drift (WP-B #5)", () => {
  it("rejects a completed action whose instance actionRef / targets / cost drift from the candidate", () => {
    const action = candidate({ id: "acquire", actionRef: { id: "action:acquire", version: "1.0.0" }, targetIds: ["source:new"], cost: { computeUnits: 1, latencyUnits: 1 } });
    expect(() => assertCompletion(action, { instance: { actionRef: { id: "action:other", version: "1.0.0" } } })).toThrow("differs from the selected candidate");
    expect(() => assertCompletion(action, { instance: { targetIds: ["source:other"] } })).toThrow("differs from the selected candidate");
    expect(() => assertCompletion(action, { instance: { expectedCost: { computeUnits: 5, latencyUnits: 5 } } })).toThrow("differs from the selected candidate");
  });
});

describe("public reanalysis completion (WP-B #6)", () => {
  it("rejects a public reanalysis producing anything other than a belief report", () => {
    const reanalysis = candidate({ id: "reanalysis", informationAccess: "public_reanalysis_only", expectedObservationKinds: ["evidence"] });
    expect(() => assertCompletion(reanalysis, { observations: [{ kind: "evidence", id: "evidence:new" }] })).toThrow("may only produce a new belief report");
    const validReanalysis = candidate({ id: "reanalysis-ok", informationAccess: "public_reanalysis_only", expectedObservationKinds: ["belief_report"] });
    const instance = instanceFor(validReanalysis);
    expect(() => assertActiveInformationActionCompletionV1({
      candidate: validReanalysis,
      instance,
      transitions: completedTransitions(instance, "report:new"),
      preActionEventIds: [],
      observations: [{ kind: "belief_report", id: "report:new" }],
    })).not.toThrow();
  });
});

describe("mutation isolation and no effectiveness claim (WP-B #9/#10)", () => {
  it("keeps the generated eligibility/decision isolated from later input mutation", () => {
    const risk = sharedConcentratedRisk();
    const cands = [candidate({ id: "acquire", sourceDistinctness: "declared_distinct_identity", sourceRelationRefs: ["relation:r"] })];
    const eligibility = evaluate(cands, ["relation:r"]);
    expect(Object.isFrozen(eligibility)).toBe(true);
    cands[0].cost.computeUnits = 99;
    expect(eligibility.eligibleCandidateIds).toEqual(["acquire"]);
  });

  it("asserts acquisition only and never returns an effectiveness/correctness/verification claim", () => {
    const action = candidate({ id: "acquire" });
    const result = assertCompletion(action);
    expect(result).toBeUndefined();
    const instance = instanceFor(action);
    expect("effective" in instance).toBe(false);
    expect("correct" in instance).toBe(false);
    expect("verified" in instance).toBe(false);
    expect("beneficial" in instance).toBe(false);
  });
});
