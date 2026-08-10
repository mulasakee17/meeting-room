import { describe, expect, it } from "vitest";
import {
  createIndependentCountercheckEligibilityRule,
  createLineageCapEligibilityRule,
  createVerificationRequestEligibilityRule,
  DUPLICATED_LINEAGE_POOL_DIAGNOSIS_V1,
  GovernanceDecisionEngine,
  HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_V2,
  INDEPENDENT_COUNTERCHECK_V1,
  LINEAGE_CAPPED_POOL_V1,
  PRE_EXPOSURE_COUNTERCHECK_OPPORTUNITY_V1,
  VERIFICATION_ATTENTION_SHAM_V2,
  VERIFICATION_REQUEST_V2,
  type GovernanceDiagnosisRecord,
  type GovernanceEligibilityRule,
  type GovernancePolicyContract,
  type InterventionContract,
} from "@/lib/governance";

function diagnosis(input: {
  id: string;
  ref: { id: string; version: string };
  quantityRef?: { id: string; version: string };
  value: number;
  targetIds: string[];
  attributes: Record<string, unknown>;
}): GovernanceDiagnosisRecord {
  return {
    id: input.id,
    diagnosisRef: input.ref,
    quantityRef: input.quantityRef ?? { id: `${input.ref.id}.value`, version: input.ref.version },
    round: 2,
    label: input.ref.id,
    interpretation: "descriptive_risk",
    value: input.value,
    attributes: input.attributes,
    targetIds: input.targetIds,
    sourceObservationIds: [`observation:${input.id}`],
    measurement: {
      observationCompleteness: "complete",
      missingFields: [],
      measurementReliability: {
        status: "estimated",
        score: 0.8,
        methodRef: { id: "swarmalpha.measurement.epistemic-ledger", version: "1.0.0" },
      },
      constructValidity: "predictive_candidate",
    },
    controlEvidence: {
      status: "experimental_candidate",
      controlUse: "randomized_experiment_only",
      preregistrationRef: { id: "swarmalpha.prereg.epistemic-pilot", version: "1.0.0" },
    },
    createdAt: "2026-08-09T00:00:00.000Z",
  };
}

function policy(rule: GovernanceEligibilityRule): GovernancePolicyContract {
  const action = rule.id === "swarmalpha.rule.high-certainty-low-lineage"
    ? VERIFICATION_REQUEST_V2
    : rule.id === "swarmalpha.rule.pre-exposure-countercheck"
      ? INDEPENDENT_COUNTERCHECK_V1
      : LINEAGE_CAPPED_POOL_V1;
  const arms = action.randomization.shamArm
    ? [
        { id: action.randomization.applyArm, probability: 0.5 },
        { id: action.randomization.holdoutArm, probability: 0.25 },
        { id: action.randomization.shamArm, probability: 0.25 },
      ]
    : [
        { id: action.randomization.applyArm, probability: 0.5 },
        { id: action.randomization.holdoutArm, probability: 0.5 },
      ];
  return {
    id: `policy:${rule.id}`,
    version: "1.0.0",
    controlMode: "randomized_experiment",
    preregistrationRef: { id: "swarmalpha.prereg.epistemic-pilot", version: "1.0.0" },
    eligibilityRuleRefs: [{ id: rule.id, version: rule.version }],
    maxActionsPerDecision: 1,
    arbitration: "priority_then_stable_id",
    assignmentDesign: {
      designRef: { id: `assignment:${rule.id}`, version: "1.0.0" },
      seedNamespace: `test:${rule.id}`,
      allocations: [{
        actionRef: { id: action.id, version: action.version },
        unit: action.randomization.unit,
        arms,
      }],
    },
    onlineAdaptation: "forbidden",
  };
}

function certaintyThresholdPolicy() {
  return {
    id: "swarmalpha.threshold.reported-belief-certainty",
    version: "1.0.0",
    quantityRef: { id: "swarmalpha.reported-belief-certainty", version: "1.0.0" },
    operator: "gte" as const,
    bounds: { lower: 0.9 },
    authority: {
      kind: "randomized_experiment_only" as const,
      preregistrationRef: { id: "swarmalpha.prereg.epistemic-pilot", version: "1.0.0" },
    },
    selection: {
      kind: "fixed_preregistered" as const,
      methodRef: { id: "swarmalpha.method.fixed-threshold", version: "1.0.0" },
    },
    costs: { falsePositive: 1, falseNegative: 1, abstention: 1, action: 1 },
    missingResult: "ineligible" as const,
    frozenAt: "2026-08-09T00:00:00.000Z",
  };
}

function decide(input: {
  rule: GovernanceEligibilityRule;
  actions: ReadonlyArray<Readonly<InterventionContract>>;
  diagnosis: GovernanceDiagnosisRecord;
  arm?: string;
  budget: Record<string, number>;
}) {
  const engine = new GovernanceDecisionEngine();
  for (const action of input.actions) engine.registerAction(structuredClone(action));
  engine.registerRule(input.rule);
  engine.seal();
  return engine.decide({
    id: `decision:${input.diagnosis.id}:${input.arm ?? "none"}`,
    policy: policy(input.rule),
    diagnoses: [input.diagnosis],
    availableBudget: input.budget,
    round: 2,
    decidedAt: "2026-08-09T00:00:00.000Z",
    sourceEventIds: input.diagnosis.sourceObservationIds,
    ...(input.arm ? {
      assignment: {
        id: `assignment:${input.arm}`,
        unitKind: "eligible_event" as const,
        assignedArm: input.arm,
        assignmentProbability: input.arm === "apply" ? 0.5 : 0.25,
        assignedAt: "2026-08-09T00:00:00.000Z",
      },
    } : {}),
  });
}

describe("minimal epistemic governance rules", () => {
  it("makes high certainty + insufficient lineage eligible without calling it wrong", () => {
    const rule = createVerificationRequestEligibilityRule({
      certaintyThresholdPolicy: certaintyThresholdPolicy(),
      maxVerifiedIndependentLineages: 1,
      verifierId: "verifier:test",
      matchedTokenBudget: 300,
      expectedModelCalls: 1,
      priority: 100,
    });
    const risk = diagnosis({
      id: "diag:verify",
      ref: HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_V2,
      quantityRef: { id: "swarmalpha.reported-belief-certainty", version: "1.0.0" },
      value: 0.95,
      targetIds: ["agent:a1"],
      attributes: {
        claimId: "claim:1",
        beliefReportId: "report:1",
        beliefKind: "binary",
        claimResolved: false,
        verifierAvailable: true,
        verifiedIndependentLineageCount: 0,
      },
    });
    const result = decide({
      rule,
      actions: [VERIFICATION_REQUEST_V2, VERIFICATION_ATTENTION_SHAM_V2],
      diagnosis: risk,
      arm: "apply",
      budget: { modelCalls: 1, tokenBudget: 300 },
    });

    expect(result.outcome).toBe("selected");
    expect(result.selectedActions[0]).toMatchObject({
      actionRef: { id: "swarmalpha.action.verification-request", version: "2.0.0" },
      parameters: { claimId: "claim:1", verifierId: "verifier:test", matchedTokenBudget: 300 },
    });
    expect(result.evaluations[0].ruleConfig).toMatchObject({
      certaintyThresholdPolicy: { bounds: { lower: 0.9 } },
    });
    expect(result.evaluations[0].reason).not.toMatch(/wrong|false|miscalibrat/i);
  });

  it("constructs an attention-matched sham from the same eligible event", () => {
    const rule = createVerificationRequestEligibilityRule({
      certaintyThresholdPolicy: certaintyThresholdPolicy(),
      maxVerifiedIndependentLineages: 1,
      verifierId: "verifier:test",
      matchedTokenBudget: 300,
      expectedModelCalls: 1,
      priority: 100,
    });
    const result = decide({
      rule,
      actions: [VERIFICATION_REQUEST_V2, VERIFICATION_ATTENTION_SHAM_V2],
      diagnosis: diagnosis({
        id: "diag:sham",
        ref: HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_V2,
        quantityRef: { id: "swarmalpha.reported-belief-certainty", version: "1.0.0" },
        value: 0.95,
        targetIds: ["agent:a1"],
        attributes: {
          claimId: "claim:1",
          beliefReportId: "report:sham",
          beliefKind: "binary",
          claimResolved: false,
          verifierAvailable: true,
          verifiedIndependentLineageCount: 0,
        },
      }),
      arm: "sham",
      budget: { modelCalls: 1, tokenBudget: 300 },
    });

    expect(result.outcome).toBe("selected");
    expect(result.selectedActions[0]).toMatchObject({
      actionRef: { id: "swarmalpha.action.verification-attention-sham", version: "2.0.0" },
      parameters: { claimId: "claim:1", matchedTokenBudget: 300 },
      expectedCost: { modelCalls: 1, tokenBudget: 300 },
    });
    expect(result.selectedActions[0].parameters).not.toHaveProperty("verifierId");
  });

  it("only counterchecks agents that remain unexposed", () => {
    const rule = createIndependentCountercheckEligibilityRule({
      matchedTokenBudgetPerAgent: 200,
      priority: 80,
    });
    const result = decide({
      rule,
      actions: [INDEPENDENT_COUNTERCHECK_V1],
      diagnosis: diagnosis({
        id: "diag:countercheck",
        ref: PRE_EXPOSURE_COUNTERCHECK_OPPORTUNITY_V1,
        value: 1,
        targetIds: ["agent:a3", "agent:a2"],
        attributes: {
          claimId: "claim:1",
          claimResolved: false,
          excludedReportIds: ["report:disputed"],
        },
      }),
      arm: "apply",
      budget: { modelCalls: 2, tokenBudget: 400 },
    });

    expect(result.selectedActions[0]).toMatchObject({
      targetIds: ["agent:a2", "agent:a3"],
      expectedCost: { modelCalls: 2, tokenBudget: 400 },
    });
  });

  it("treats duplicate lineage as an aggregation condition, not a truth verdict", () => {
    const rule = createLineageCapEligibilityRule({
      maxWeightPerLineage: 1,
      expectedComputeUnits: 1,
      priority: 60,
    });
    const result = decide({
      rule,
      actions: [LINEAGE_CAPPED_POOL_V1],
      diagnosis: diagnosis({
        id: "diag:lineage",
        ref: DUPLICATED_LINEAGE_POOL_DIAGNOSIS_V1,
        value: 2,
        targetIds: ["claim:1"],
        attributes: {
          claimId: "claim:1",
          claimResolved: false,
          duplicateLineageCount: 2,
        },
      }),
      arm: "apply",
      budget: { computeUnits: 1 },
    });

    expect(result.selectedActions[0]).toMatchObject({
      parameters: { claimId: "claim:1", maxWeightPerLineage: 1 },
    });
    expect(result.selectedActions[0].rationale).toContain("without inferring");
  });

  it("does not let a missing-observation diagnosis acquire control permission", () => {
    const rule = createVerificationRequestEligibilityRule({
      certaintyThresholdPolicy: certaintyThresholdPolicy(),
      maxVerifiedIndependentLineages: 1,
      verifierId: "verifier:test",
      matchedTokenBudget: 300,
      expectedModelCalls: 1,
      priority: 100,
    });
    const missing = diagnosis({
      id: "diag:missing",
      ref: HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_V2,
      quantityRef: { id: "swarmalpha.reported-belief-certainty", version: "1.0.0" },
      value: 0.95,
      targetIds: ["agent:a1"],
      attributes: {
        claimId: "claim:1",
        beliefReportId: "report:missing",
        beliefKind: "binary",
        claimResolved: false,
        verifierAvailable: true,
        verifiedIndependentLineageCount: 0,
      },
    });
    missing.interpretation = "descriptive_risk";
    missing.measurement = {
      observationCompleteness: "missing",
      missingFields: ["reportedProbability"],
      measurementReliability: { status: "unknown" },
      constructValidity: "descriptive_only",
    };
    missing.controlEvidence = { status: "descriptive_only", controlUse: "observe_only" };

    const result = decide({
      rule,
      actions: [VERIFICATION_REQUEST_V2, VERIFICATION_ATTENTION_SHAM_V2],
      diagnosis: missing,
      arm: "apply",
      budget: { modelCalls: 1, tokenBudget: 300 },
    });

    // The rule emits an eligible candidate, but missing observations are
    // fail-closed: no control permission, so nothing is selected.
    expect(result.outcome).toBe("no_eligible_action");
    expect(result.candidateActions).toEqual([]);
  });
});
