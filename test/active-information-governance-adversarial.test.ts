/**
 * Truth-blind active information governance — adversarial tests.
 *
 * These harden the truth-blind boundary described in
 * NO_GROUND_TRUTH_ACTIVE_EPISTEMIC_GOVERNANCE_V1.md and verify the 11 WP-A
 * invariants that the baseline test does not already pin: truth-like extra
 * fields at every boundary, missing-never-zero, lineage-partial-missing,
 * identity-only distinctness, reanalysis-after-observation, inadmissible
 * candidate exclusion, order independence, consequence-aware escalate/abstain,
 * replay tamper rejection, abnormal-value fail-closed, and deep-freeze +
 * mutation isolation.
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
  projectOnlineEpistemicRiskV1,
  replayTruthBlindInformationActionV1,
  selectTruthBlindInformationActionV1,
  validateTruthBlindActionDecisionV1,
  type ActiveInformationActionCandidateV1,
  type OnlineEpistemicRiskV1,
} from "@/lib/governance";

const claim: EpistemicClaim = {
  id: "claim:truth-blind-adv",
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

function riskWith(
  lineages: Array<string | undefined> = ["lineage:shared", "lineage:shared"],
  level: "low" | "moderate" | "high" | "critical" = "high",
): OnlineEpistemicRiskV1 {
  return projectOnlineEpistemicRiskV1({
    collectiveState: collectiveStateWith(lineages),
    consequence: { level, contractRef: { id: "contract:stakes", version: "1.0.0" } },
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

function decide(risk: OnlineEpistemicRiskV1, candidates: ActiveInformationActionCandidateV1[], budget = { computeUnits: 5, latencyUnits: 5 }) {
  return selectTruthBlindInformationActionV1({ risk, candidates, availableBudget: budget });
}

describe("truth-blind boundary rejects truth-like input everywhere (WP-A #1)", () => {
  it("rejects groundTruth / correctAnswer / resolverOutcome on the risk projection input", () => {
    for (const extra of [{ groundTruth: true }, { correctAnswer: "yes" }, { resolverOutcome: true }, { loss: 0.5 }]) {
      expect(() => projectOnlineEpistemicRiskV1({
        collectiveState: collectiveStateWith(),
        consequence: { level: "high", contractRef: { id: "c", version: "1.0.0" } },
        ...extra,
      } as never)).toThrow("fields differ from the frozen schema");
    }
  });

  it("rejects truth-like extra fields on an action candidate and on action-selection input", () => {
    for (const extra of [{ groundTruth: true }, { correctAnswer: "yes" }, { resolverOutcome: "a" }, { trueOutcome: "b" }]) {
      expect(() => decide(riskWith(), [candidate({ id: "x", ...extra } as never)]))
        .toThrow("fields differ from the frozen schema");
    }
    expect(() => selectTruthBlindInformationActionV1({
      risk: riskWith(),
      candidates: [],
      availableBudget: { computeUnits: 1, latencyUnits: 1 },
      groundTruth: true,
    } as never)).toThrow("fields differ from the frozen schema");
  });

  it("rejects a decision that later gains a truth-like field", () => {
    const decision = decide(riskWith(), [candidate({ id: "a" })]);
    const hostile = { ...structuredClone(decision), resolverOutcome: "yes" } as never;
    expect(() => validateTruthBlindActionDecisionV1(hostile)).toThrow("fields differ from the frozen schema");
  });
});

describe("missingness is explicit, never zero (WP-A #2/#3)", () => {
  it("keeps prompt sensitivity missing when no qualified perturbation exists", () => {
    const risk = riskWith();
    const dim = risk.dimensions.promptSensitivity;
    expect(dim.status).toBe("missing");
    if (dim.status === "missing") expect(dim.reason).toBe("qualified_prompt_perturbation_absent");
  });

  it("keeps declared source concentration missing when any active report lacks lineage", () => {
    const risk = riskWith(["lineage:known", undefined]);
    const dim = risk.dimensions.declaredSourceConcentration;
    expect(dim.status).toBe("missing");
    if (dim.status === "missing") expect(dim.reason).toBe("declared_lineage_incomplete");
  });

  it("never fabricates a numeric value for missing unsupportedness", () => {
    const risk = riskWith();
    expect(risk.dimensions.qualifiedUnsupportedness.status).toBe("missing");
  });
});

describe("distinct identity is identity-only (WP-A #4)", () => {
  it("emits no independence / expectedValue / correctness fields on a selected action", () => {
    const risk = riskWith();
    const decision = decide(risk, [candidate({
      id: "verified",
      sourceDistinctness: "verified_distinct_identity",
      sourceRelationRefs: ["verification:src"],
    })]);
    const decisionKeys = Object.keys(decision);
    expect(decisionKeys).not.toContain("independence");
    expect(decisionKeys).not.toContain("expectedValue");
    expect(decisionKeys).not.toContain("correctness");
    expect(decisionKeys).not.toContain("errorCorrelation");
  });
});

describe("source-novelty ordering (WP-A #5/#7)", () => {
  it("ranks a same-distinctness new observation above a free reanalysis", () => {
    const risk = riskWith();
    const decision = decide(risk, [
      candidate({ id: "free-reanalysis", sourceDistinctness: "declared_distinct_identity", sourceRelationRefs: ["relation:r"], informationAccess: "public_reanalysis_only", cost: { computeUnits: 0, latencyUnits: 0 } }),
      candidate({ id: "new-observation", sourceDistinctness: "declared_distinct_identity", sourceRelationRefs: ["relation:r"], informationAccess: "new_external_observation", cost: { computeUnits: 3, latencyUnits: 3 } }),
    ], { computeUnits: 3, latencyUnits: 3 });
    expect(decision.selectedAction?.id).toBe("new-observation");
  });

  it("is invariant to candidate array order and breaks same-rank ties by stable id", () => {
    const risk = riskWith();
    const baseCandidates = [
      candidate({ id: "b", sourceDistinctness: "unknown_relation", informationAccess: "new_private_report", cost: { computeUnits: 2, latencyUnits: 1 } }),
      candidate({ id: "a", sourceDistinctness: "unknown_relation", informationAccess: "new_private_report", cost: { computeUnits: 2, latencyUnits: 1 } }),
    ];
    const forward = decide(risk, [...baseCandidates]);
    const reversed = decide(risk, [...baseCandidates].reverse());
    expect(forward.contentHash).toBe(reversed.contentHash);
    // same distinctness/access/cost/latency -> stable id wins
    expect(forward.selectedAction?.id).toBe("a");
  });
});

describe("admissibility (WP-A #6)", () => {
  it("does not select over-budget or unavailable candidates; cross-claim fails the whole boundary", () => {
    const risk = riskWith();
    const overBudget = candidate({ id: "over", cost: { computeUnits: 99, latencyUnits: 99 } });
    const unavailable = candidate({ id: "down", available: false });
    const decision = decide(risk, [overBudget, unavailable], { computeUnits: 5, latencyUnits: 5 });
    expect(decision.decision).toBe("escalate");
    expect(decision.selectedAction).toBeUndefined();
    expect(decision.consideredCandidateIds).toContain("over");
    // a cross-claim candidate is rejected at the boundary, not silently ignored
    expect(() => decide(risk, [candidate({ id: "other-claim", claimId: "claim:other" })])).toThrow(/must target the risk claim/);
  });
});

describe("consequence-aware no-action terminal (WP-A #8)", () => {
  it("escalates high/critical and abstains low/moderate when nothing is admissible", () => {
    const high = decide(riskWith(["l1", "l2"], "high"), [candidate({ id: "too-costly", cost: { computeUnits: 9, latencyUnits: 9 } })], { computeUnits: 1, latencyUnits: 1 });
    expect(high.decision).toBe("escalate");
    expect(high.reasonCode).toBe("no_admissible_action_high_consequence");
    const critical = decide(riskWith(["l1", "l2"], "critical"), [], { computeUnits: 0, latencyUnits: 0 });
    expect(critical.decision).toBe("escalate");
    const low = decide(riskWith(["l1", "l2"], "low"), [candidate({ id: "too-costly", cost: { computeUnits: 9, latencyUnits: 9 } })], { computeUnits: 1, latencyUnits: 1 });
    expect(low.decision).toBe("abstain");
    expect(low.reasonCode).toBe("no_admissible_action");
  });
});

describe("replay rejects tampering (WP-A #9)", () => {
  const storedFor = (risk: OnlineEpistemicRiskV1, candidates: ActiveInformationActionCandidateV1[], budget = { computeUnits: 5, latencyUnits: 5 }) =>
    decide(risk, candidates, budget);

  it("rejects a replayed decision whose sourceRiskHash, budget, candidate, or selectedAction was tampered", () => {
    const risk = riskWith();
    const candidates = [candidate({ id: "t", sourceDistinctness: "declared_distinct_identity", sourceRelationRefs: ["relation:r"] })];
    const stored = storedFor(risk, candidates);
    const replayArgs = { risk, candidates, availableBudget: { computeUnits: 5, latencyUnits: 5 }, stored };
    expect(replayTruthBlindInformationActionV1(replayArgs)).toEqual(stored);

    const tamperedRiskHash = { ...stored, sourceRiskHash: "sha256:" + "0".repeat(64) } as never;
    expect(() => replayTruthBlindInformationActionV1({ ...replayArgs, stored: tamperedRiskHash as never })).toThrow();

    const tamperedBudget = { ...stored, budgetBefore: { computeUnits: 1, latencyUnits: 1 } } as never;
    expect(() => replayTruthBlindInformationActionV1({ ...replayArgs, stored: tamperedBudget as never })).toThrow();

    const tamperedConsidered = { ...stored, consideredCandidateIds: ["t", "z"] } as never;
    expect(() => replayTruthBlindInformationActionV1({ ...replayArgs, stored: tamperedConsidered as never })).toThrow();

    const tamperedSelected = stored.selectedAction
      ? { ...stored, selectedAction: { ...stored.selectedAction, cost: { computeUnits: 7, latencyUnits: 7 } } } as never
      : stored;
    expect(() => replayTruthBlindInformationActionV1({ ...replayArgs, stored: tamperedSelected as never })).toThrow();
  });

  it("rejects replay when the live input differs from what produced the stored decision", () => {
    const risk = riskWith();
    const candidates = [candidate({ id: "a" })];
    const stored = storedFor(risk, candidates);
    const changedBudget = { computeUnits: 1, latencyUnits: 1 };
    expect(() => replayTruthBlindInformationActionV1({ risk, candidates, availableBudget: changedBudget, stored })).toThrow();
  });
});

describe("abnormal values fail closed (WP-A #10)", () => {
  it("rejects NaN / Infinity / negative cost and budget", () => {
    const risk = riskWith();
    expect(() => decide(risk, [candidate({ id: "nan", cost: { computeUnits: Number.NaN, latencyUnits: 1 } })])).toThrow(/finite/);
    expect(() => decide(risk, [candidate({ id: "inf", cost: { computeUnits: 1, latencyUnits: Infinity } })])).toThrow(/finite/);
    expect(() => selectTruthBlindInformationActionV1({
      risk, candidates: [], availableBudget: { computeUnits: Number.NaN, latencyUnits: 1 },
    })).toThrow(/finite/);
    expect(() => selectTruthBlindInformationActionV1({
      risk, candidates: [], availableBudget: { computeUnits: -1, latencyUnits: 1 },
    })).toThrow(/finite and non-negative/);
  });

  it("rejects sparse candidate arrays and duplicate ids", () => {
    const risk = riskWith();
    const sparse = new Array(2);
    sparse[0] = candidate({ id: "a" });
    expect(() => decide(risk, sparse as never)).toThrow();
    expect(() => decide(risk, [candidate({ id: "dup" }), candidate({ id: "dup" })])).toThrow(/must not contain duplicates/);
  });

  it("rejects empty strings and invalid enums on candidates", () => {
    const risk = riskWith();
    expect(() => decide(risk, [candidate({ id: "" } as never)])).toThrow(/non-empty/);
    expect(() => decide(risk, [candidate({ id: "x", sourceDistinctness: "independent" as never })])).toThrow(/invalid/);
    expect(() => decide(risk, [candidate({ id: "x", informationAccess: "ground_truth_read" as never })])).toThrow(/invalid/);
    expect(() => decide(risk, [candidate({ id: "x", targetIds: [] })])).toThrow(/must not be empty/);
  });
});

describe("deep freeze and mutation isolation (WP-A #11)", () => {
  it("returns a deep-frozen decision and stays isolated from later input mutation", () => {
    const risk = riskWith();
    const candidates = [candidate({ id: "iso", cost: { computeUnits: 2, latencyUnits: 2 } })];
    const decision = decide(risk, candidates);
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.selectedAction)).toBe(true);
    // mutating the (mutable) source candidates afterwards does not change the decision
    candidates[0].cost.computeUnits = 99;
    candidates[0].informationAccess = "public_reanalysis_only";
    expect(decision.selectedAction?.cost.computeUnits).toBe(2);
    expect(decision.selectedAction?.informationAccess).toBe("new_external_observation");
  });

  it("freezes the risk projection", () => {
    const risk = riskWith();
    expect(Object.isFrozen(risk)).toBe(true);
    expect(Object.isFrozen(risk.dimensions)).toBe(true);
  });
});
