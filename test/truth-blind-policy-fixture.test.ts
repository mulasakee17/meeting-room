/**
 * Truth-blind policy fixture tests.
 *
 * Verifies the two-sided information isolation (policy-visible packet vs
 * evaluator-only envelope), the eligibility -> arbitration closure, the four
 * frozen scenario decisions, and the computed deterministic baselines. The
 * envelope's `preActionReferenceLoss` is a pre-action reference, never a
 * governance-effect comparison. Everything is a DETERMINISTIC FIXTURE.
 */

import { describe, expect, it } from "vitest";
import {
  createTruthBlindPolicyFixtureV1,
  certaintyOnlyBaselineV1,
  disagreementOnlyBaselineV1,
  randomComparatorBaselineV1,
  TRUTH_BLIND_POLICY_FIXTURE_LABEL,
} from "../experiments/campaign/v6/truthBlindPolicyFixtureV1";

const fixture = createTruthBlindPolicyFixtureV1();
const byId = new Map(fixture.map(scenario => [scenario.scenarioId, scenario]));

describe("truth-blind policy fixture isolation (WP-B)", () => {
  it("labels every scenario a DETERMINISTIC FIXTURE", () => {
    for (const scenario of fixture) expect(scenario.label).toBe(TRUTH_BLIND_POLICY_FIXTURE_LABEL);
  });

  it("keeps truth / outcome / loss entirely out of the policy-visible packet", () => {
    for (const scenario of fixture) {
      const serialized = JSON.stringify(scenario.policyVisiblePacket);
      expect(serialized).not.toContain("syntheticOutcome");
      expect(serialized).not.toContain("groundTruth");
      expect(serialized).not.toContain("correctAnswer");
      expect(serialized).not.toContain("resolverOutcome");
      expect(serialized).not.toContain("properLoss");
      expect(serialized).not.toContain("preActionReferenceLoss");
      expect(scenario.policyVisiblePacket.policyRef.id).toContain("source-novelty");
    }
  });

  it("never passes the evaluator envelope into the selection path", () => {
    for (const scenario of fixture) {
      expect(scenario.decision.sourceRiskHash).toBe(scenario.policyVisiblePacket.risk.contentHash);
      expect(scenario.evaluatorOnlyEnvelope.observedDecisionHash).toBe(scenario.decision.contentHash);
      expect("evaluatorOnlyEnvelope" in scenario.decision).toBe(false);
      expect("syntheticOutcome" in scenario.decision).toBe(false);
    }
  });

  it("deep-freezes the packet, eligibility, decision, envelope, and scenario", () => {
    for (const scenario of fixture) {
      expect(Object.isFrozen(scenario)).toBe(true);
      expect(Object.isFrozen(scenario.policyVisiblePacket.risk)).toBe(true);
      expect(Object.isFrozen(scenario.eligibility)).toBe(true);
      expect(Object.isFrozen(scenario.decision)).toBe(true);
      expect(Object.isFrozen(scenario.evaluatorOnlyEnvelope)).toBe(true);
    }
  });
});

describe("eligibility -> arbitration closure (WP-C #4)", () => {
  it("only eligible candidates matching a frozen risk reason enter arbitration", () => {
    for (const scenario of fixture) {
      const eligible = scenario.decision.consideredCandidateIds;
      for (const id of eligible) {
        expect(scenario.eligibility.eligibleCandidateIds).toContain(id);
      }
      // a reanalysis-only candidate is never eligible under source concentration
      const reanalysis = scenario.policyVisiblePacket.candidates.find(candidate => candidate.informationAccess === "public_reanalysis_only");
      if (reanalysis && scenario.policyVisiblePacket.risk.dimensions.declaredSourceConcentration.status === "available") {
        expect(scenario.eligibility.eligibleCandidateIds).not.toContain(reanalysis.id);
      }
    }
  });
});

describe("four frozen scenario decisions (WP-B/WP-C)", () => {
  it("A: prefers a verified-distinct new observation over a free same-lineage reanalysis", () => {
    const scenario = byId.get("scenario-a-shared-lineage-new-observation")!;
    expect(scenario.decision.selectedAction?.id).toBe("new-observation");
    expect(scenario.baseline.kind).toBe("certainty_only");
    expect(scenario.baseline.selectedActionId).toBeNull(); // certainty-only abstains here
  });

  it("B: breaks a same-rank tie by stable id when sources are already distinct", () => {
    const scenario = byId.get("scenario-b-high-disagreement-sources-distinct")!;
    expect(scenario.decision.selectedAction?.id).toBe("first-tool");
    expect(scenario.baseline.kind).toBe("disagreement_only");
    expect(scenario.baseline.selectedActionId).toBe("first-tool"); // disagreement baseline selects it too
  });

  it("C: escalates a critical-consequence claim when every action exceeds budget", () => {
    const scenario = byId.get("scenario-c-high-consequence-all-over-budget")!;
    expect(scenario.decision.decision).toBe("escalate");
    expect(scenario.decision.reasonCode).toBe("no_admissible_action_high_consequence");
    expect(scenario.decision.selectedAction).toBeUndefined();
    expect(scenario.baseline.kind).toBe("random");
    expect(scenario.baseline.selectedActionId).toBeNull(); // nothing affordable
  });

  it("D: picks the new tool over a free public reanalysis under the same declared distinctness", () => {
    const scenario = byId.get("scenario-d-cheap-reanalysis-vs-new-tool")!;
    expect(scenario.decision.selectedAction?.id).toBe("new-tool");
    expect(scenario.baseline.kind).toBe("random");
  });

  it("records a pre-action reference loss in the evaluator envelope (not a governance effect)", () => {
    for (const scenario of fixture) {
      expect(Number.isFinite(scenario.evaluatorOnlyEnvelope.preActionReferenceLoss)).toBe(true);
      expect(scenario.evaluatorOnlyEnvelope.utilityContractRef.id).toContain("binary-proper-loss");
    }
  });
});

describe("computed deterministic baselines (WP-C #2)", () => {
  it("certainty-only abstains when reported disagreement is low", () => {
    const scenario = byId.get("scenario-a-shared-lineage-new-observation")!;
    const result = certaintyOnlyBaselineV1({
      risk: scenario.policyVisiblePacket.risk,
      candidates: scenario.policyVisiblePacket.candidates,
      availableBudget: scenario.policyVisiblePacket.availableBudget,
      certaintyThreshold: 0.7,
    });
    expect(result.selectedActionId).toBe(scenario.baseline.selectedActionId);
  });

  it("disagreement-only selects the cheapest eligible external-evidence candidate when disagreement is high", () => {
    const scenario = byId.get("scenario-b-high-disagreement-sources-distinct")!;
    const result = disagreementOnlyBaselineV1({
      risk: scenario.policyVisiblePacket.risk,
      candidates: scenario.policyVisiblePacket.candidates,
      availableBudget: scenario.policyVisiblePacket.availableBudget,
      disagreementThreshold: 0.5,
    });
    expect(result.selectedActionId).toBe(scenario.baseline.selectedActionId);
  });

  it("random comparator is deterministic under a frozen seed and replayable", () => {
    const scenario = byId.get("scenario-c-high-consequence-all-over-budget")!;
    const args = {
      seed: 17,
      candidates: scenario.policyVisiblePacket.candidates,
      availableBudget: scenario.policyVisiblePacket.availableBudget,
    };
    expect(randomComparatorBaselineV1(args).selectedActionId).toBe(randomComparatorBaselineV1(args).selectedActionId);
    expect(randomComparatorBaselineV1(args).selectedActionId).toBeNull(); // nothing affordable
  });
});
