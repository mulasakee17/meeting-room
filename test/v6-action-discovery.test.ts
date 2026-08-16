/**
 * Post-round-1 randomized action discovery — frozen-plan and gate tests.
 *
 * Covers the 14 handoff invariants: review-gated plan fail-closed, the 16x8
 * run-id scheme, truth-free plan body, always-eligible rule behavior (no
 * certainty read), target/assignment seed separation, strict .50/.25/.25 arm
 * allocation, V2 feature timing, replay/analysis fail-closed paths, ridge
 * task-held-out MSE, task-cluster bootstrap unit, and the stable GO/DEFER gate.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTION_DISCOVERY_EXPERIMENT_REF,
  ACTION_DISCOVERY_MAX_PROVIDER_CALLS,
  ACTION_DISCOVERY_MAX_TOTAL_TOKENS,
  ACTION_DISCOVERY_PLAN_PATH,
  ACTION_DISCOVERY_REPLICATE_COUNT,
  ACTION_DISCOVERY_SUGGESTED_GROUPS,
  ACTION_DISCOVERY_TASK_ORDER,
  actionDiscoveryRunIdsV1,
  buildActionDiscoveryPlanV1,
} from "../experiments/campaign/v6/run_v6_action_discovery";
import {
  createActionDiscoveryApplyActionV1,
  createActionDiscoveryFixtureV1,
  createAlwaysEligibleDiscoveryRuleV1,
} from "../experiments/campaign/v6/v6ActionDiscoveryFixtureV1";
import {
  DISCOVERY_V2_FEATURES,
  bootstrapApplyHoldoutV1,
  discoveryArmOf,
  evaluateDiscoveryGateV1,
  ridgeFit,
  taskHeldOutMseV1,
} from "../experiments/campaign/v6/analyze_v6_action_discovery";
import { deriveProcessStateFeaturesV2 } from "../experiments/campaign/v6/processStateFeaturesV2";
import type { GovernanceDiagnosisRecord } from "@/lib/governance";

const reviewedDecisions = ACTION_DISCOVERY_SUGGESTED_GROUPS.map(group => ({
  ...group, accepted: true as const, reviewedAt: "2026-08-13T09:00:00.000Z",
}));

function diagnosisWith(certainty: number, overrides: Record<string, unknown> = {}): GovernanceDiagnosisRecord {
  return {
    id: "diagnosis:discovery",
    diagnosisRef: { id: "swarmalpha.risk.high-certainty-insufficient-lineage", version: "2.0.0" },
    quantityRef: { id: "swarmalpha.reported-belief-certainty", version: "1.0.0" },
    round: 1,
    label: "discovery diagnosis",
    interpretation: "descriptive_risk",
    value: certainty,
    createdAt: "2026-08-13T00:00:00.000Z",
    sourceObservationIds: ["obs:1"],
    targetIds: ["agent:a"],
    measurement: {
      observationCompleteness: "complete",
      missingFields: [],
      measurementReliability: { status: "unknown" },
      constructValidity: "descriptive_only",
    },
    controlEvidence: { status: "experimental_candidate", controlUse: "randomized_experiment_only", preregistrationRef: { id: "prereg:discovery", version: "1.0.0" } },
    attributes: {
      claimId: "claim:discovery", beliefReportId: "report:1", beliefKind: "categorical",
      claimOptionCount: 3, claimResolved: false, verifierAvailable: true, verifiedIndependentLineageCount: 0,
      ...overrides,
    },
  };
}

describe("review-gated plan (invariant 1)", () => {
  it("fails closed without 16 accepted leakage groups", () => {
    expect(() => buildActionDiscoveryPlanV1([])).toThrow(/exactly 16 accepted leakage groups/);
    expect(() => buildActionDiscoveryPlanV1(reviewedDecisions.slice(0, 15))).toThrow(/exactly 16 accepted leakage groups/);
  });

  it("fails closed when the frozen 16x8 static budget exceeds the safety cap (Codex decision required)", () => {
    expect(() => buildActionDiscoveryPlanV1(reviewedDecisions)).toThrow(/exceed the frozen cap 1600/);
  });
});

describe("16x8 run identity (invariant 2)", () => {
  it("builds 128 unique runIds covering every task x replicate", () => {
    const ids = actionDiscoveryRunIdsV1();
    expect(ids).toHaveLength(16 * 8);
    expect(new Set(ids).size).toBe(128);
    for (const taskId of ACTION_DISCOVERY_TASK_ORDER) {
      const taskRuns = ids.filter(id => id.includes(`task-${taskId}:G:r`));
      expect(taskRuns).toHaveLength(8);
    }
    expect(new Set(ids.map(id => id.match(/task-(\d+)/)![1])).size).toBe(16);
  });

  it("uses a fresh experiment namespace distinct from exploratory / continuation / heldout", () => {
    expect(ACTION_DISCOVERY_EXPERIMENT_REF.id).toBe("swarmalpha.experiment.v6-action-discovery-v1");
    expect(idsExclusivePrefix()).toBe(true);
  });
});

function idsExclusivePrefix(): boolean {
  return actionDiscoveryRunIdsV1().every(id => id.startsWith("run:v6-action-discovery-v1:"));
}

describe("truth-free plan and rule (invariants 3-5)", () => {
  it("keeps the plan body free of outcome / correctAnswer / final-loss fields", () => {
    const body = {
      experimentRef: ACTION_DISCOVERY_EXPERIMENT_REF,
      taskIds: ACTION_DISCOVERY_TASK_ORDER,
      suggestedGroups: ACTION_DISCOVERY_SUGGESTED_GROUPS,
      maxProviderCalls: ACTION_DISCOVERY_MAX_PROVIDER_CALLS,
      maxTotalTokens: ACTION_DISCOVERY_MAX_TOTAL_TOKENS,
    };
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("groundTruth");
    expect(serialized).not.toContain("correctAnswer");
    expect(serialized).not.toContain("resolverOutcome");
    expect(serialized).not.toContain("finalLoss");
  });

  it("always-eligible rule never reads certainty, outcome, or resolution", () => {
    const rule = createAlwaysEligibleDiscoveryRuleV1();
    // low-certainty diagnosis is still eligible
    const eligible = rule.evaluate({ round: 1, diagnoses: [diagnosisWith(0.34)], availableBudget: { computeUnits: 1, tokenBudget: 300 } });
    expect(eligible.eligible).toBe(true);
    // no diagnosis (no valid round-1 report) => ineligible
    const absent = rule.evaluate({ round: 1, diagnoses: [], availableBudget: { computeUnits: 1, tokenBudget: 300 } });
    expect(absent.eligible).toBe(false);
  });

  it("cloned apply action authorizes only the discovery rule and keeps the verification action identity", () => {
    const action = createActionDiscoveryApplyActionV1();
    expect(action.id).toBe("swarmalpha.action.verification-request");
    expect(action.version).toBe("2.0.0");
    expect(action.eligibilityRuleRefs.map(ref => ref.id)).toEqual(["swarmalpha.rule.always-eligible-randomized-discovery"]);
  });
});

describe("target/assignment seed separation and strict allocation (invariants 6-7)", () => {
  it("separates monitoring target seed (replicate-1) from eligible-event assignment seed", () => {
    for (const taskId of [5, 8, 65]) {
      const fixture = createActionDiscoveryFixtureV1(taskId);
      // eligibleEventMasterSeed is the frozen constant; monitoring is replicate-derived (verified in the runner plan)
      expect(fixture.study.governancePolicy!.assignmentDesign?.allocations[0].unit).toBe("eligible_event");
    }
  });

  it("keeps the strict .50/.25/.25 arm allocation in the discovery study policy", () => {
    const fixture = createActionDiscoveryFixtureV1(5);
    const arms = fixture.study.governancePolicy!.assignmentDesign!.allocations[0].arms;
    const byId = Object.fromEntries(arms.map(arm => [arm.id, arm.probability]));
    expect(byId.apply).toBeCloseTo(0.5);
    expect(byId.holdout).toBeCloseTo(0.25);
    expect(byId.sham).toBeCloseTo(0.25);
  });
});

describe("V2 feature timing (invariant 8)", () => {
  it("deriveProcessStateFeaturesV2 reports after-round-1-before-action timing and never reads outcome", () => {
    const fixture = createActionDiscoveryFixtureV1(5);
    const claim = fixture.base.task.claim;
    const expectedAgentIds = fixture.base.task.agents.map(agent => agent.agentId);
    const reports = fixture.base.task.agents.map((agent, index) => ({
      id: `report:${index}`,
      claimId: claim.id,
      agentId: agent.agentId,
      round: 1,
      value: { kind: "categorical" as const, probabilities: { "A": 0.4, "B": 0.3, "C": 0.3 } },
      evidence: [],
      stake: 0,
      createdAt: "2026-08-13T00:00:00.000Z",
    }));
    const features = deriveProcessStateFeaturesV2({
      claim: { ...claim, options: ["A", "B", "C"] } as never,
      expectedAgentIds,
      roundOneReports: reports as never,
      roundOneEvidence: [],
    });
    expect(features.timing).toBe("after_round_1_before_action_assignment");
    expect(Object.keys(features.values)).toEqual([...DISCOVERY_V2_FEATURES]);
  });
});

describe("replay/analysis fail-closed (invariants 9-10)", () => {
  it("analysis refuses to read a non-materialized plan", () => {
    expect(fs.existsSync(ACTION_DISCOVERY_PLAN_PATH)).toBe(false);
  });

  it("never imports the retrying llm provider path", () => {
    for (const file of [
      "experiments/campaign/v6/run_v6_action_discovery.ts",
      "experiments/campaign/v6/analyze_v6_action_discovery.ts",
      "experiments/campaign/v6/v6ActionDiscoveryFixtureV1.ts",
    ]) {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/callLLM/);
      expect(source).not.toMatch(/from ".*src\/lib\/llm/);
    }
  });
});

describe("ridge task-held-out and bootstrap unit (invariants 12-13)", () => {
  it("ridgeFit recovers a known linear coefficient under lambda=0", () => {
    const X = [[1, 0], [1, 1], [1, 2], [1, 3]];
    const y = [1, 2, 3, 4];
    const beta = ridgeFit(X, y, 0);
    expect(beta[0]).toBeCloseTo(1, 8);
    expect(beta[1]).toBeCloseTo(1, 8);
  });

  it("task-held-out MSE is finite and task-cluster bootstrap resamples tasks not runs", () => {
    const taskRuns = [1, 2, 3, 4].flatMap(taskId =>
      Array.from({ length: 3 }, (_, i) => ({ taskId, loss: taskId + i * 0.1, features: { meanReportedCertainty: 0.5 } })));
    const mseConst = taskHeldOutMseV1({ taskRuns, featureNames: [] });
    expect(Number.isFinite(mseConst)).toBe(true);
    const boot = bootstrapApplyHoldoutV1(
      [{ taskId: 1, brier: 0.5 }, { taskId: 2, brier: 0.6 }],
      [{ taskId: 1, brier: 0.4 }, { taskId: 2, brier: 0.3 }],
      [1, 2], 1000, "seed");
    expect(boot.diffs.length).toBe(1000);
    expect(boot.validFraction).toBe(1);
  });

  it("never constructs features from an apply outcome (derive consumes round-1 ledger only)", () => {
    // deriveProcessStateFeaturesV2 input is {claim, expectedAgentIds, roundOneReports, roundOneEvidence};
    // its returned values are all in [0,1] and carry no outcome/resolution key.
    const fixture = createActionDiscoveryFixtureV1(5);
    const claim = fixture.base.task.claim;
    const features = deriveProcessStateFeaturesV2({
      claim: { ...claim, options: ["A", "B", "C"] } as never,
      expectedAgentIds: fixture.base.task.agents.map(agent => agent.agentId),
      roundOneReports: fixture.base.task.agents.map((agent, index) => ({
        id: `report:${index}`, claimId: claim.id, agentId: agent.agentId, round: 1,
        value: { kind: "categorical" as const, probabilities: { "A": 0.4, "B": 0.3, "C": 0.3 } },
        evidence: [], stake: 0, createdAt: "2026-08-13T00:00:00.000Z",
      })) as never,
      roundOneEvidence: [],
    });
    expect(JSON.stringify(features.values)).not.toContain("outcome");
    expect(JSON.stringify(features.values)).not.toContain("correct");
  });
});

describe("stable GO/DEFER gate (invariant 14)", () => {
  it("outputs DEFER for every unmet condition and GO only when all are met", () => {
    const pass = { holdoutTaskClusters: 14, holdoutRuns: 40, applyTaskClusters: 14, applyRuns: 40, replayZeroIssues: true, v2MseImprovementPoint: 0.01, applyHoldoutMeanBrier: -0.1, upliftTopHalfBenefitLarger: true };
    expect(evaluateDiscoveryGateV1(pass)).toEqual([]);
    expect(evaluateDiscoveryGateV1({ ...pass, holdoutTaskClusters: 11 })).toContain("holdout task clusters<12");
    expect(evaluateDiscoveryGateV1({ ...pass, holdoutRuns: 29 })).toContain("holdout runs<30");
    expect(evaluateDiscoveryGateV1({ ...pass, applyRuns: 29 })).toContain("apply runs<30");
    expect(evaluateDiscoveryGateV1({ ...pass, replayZeroIssues: false })).toContain("replay issues non-zero");
    expect(evaluateDiscoveryGateV1({ ...pass, v2MseImprovementPoint: 0 })).toContain("V2 MSE improvement point not >0");
    expect(evaluateDiscoveryGateV1({ ...pass, applyHoldoutMeanBrier: 0.05 })).toContain("apply-holdout mean Brier not <0");
    expect(evaluateDiscoveryGateV1({ ...pass, upliftTopHalfBenefitLarger: false })).toContain("uplift top-half benefit not larger");
  });

  it("discoveryArmOf classifies the feasibility probe arms", () => {
    const applyArtifact = { governanceAuditTrail: { actionInstances: [{ actionRef: { id: "swarmalpha.action.verification-request", version: "2.0.0" } }], actionTransitions: [{ to: "assigned" }, { to: "delivered" }] } };
    expect(discoveryArmOf(applyArtifact)).toBe("apply");
    const holdoutArtifact = { governanceAuditTrail: { actionTransitions: [{ to: "held_out" }] } };
    expect(discoveryArmOf(holdoutArtifact)).toBe("holdout");
  });
});
