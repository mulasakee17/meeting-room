import { describe, expect, it } from "vitest";
import {
  GovernanceActionLedger,
  GovernanceDecisionEngine,
  MINIMAL_EPISTEMIC_GOVERNANCE_POLICY_V2,
  STANDARD_EPISTEMIC_INTERVENTION_CONTRACTS,
  validateGovernanceDiagnosis,
  validateGovernancePolicy,
  validateInterventionContract,
  type GovernanceActionCandidate,
  type GovernanceActionInstance,
  type GovernanceActionTransition,
  type GovernanceDiagnosisRecord,
  type GovernanceEligibilityRule,
  type GovernancePolicyContract,
  type InterventionContract,
} from "@/lib/governance";

const RULE_REF = { id: "swarmalpha.rule.verify-low-lineage", version: "1.0.0" } as const;
const ACTION_REF = { id: "swarmalpha.action.verification-request", version: "1.0.0" } as const;

function diagnosis(
  control: "descriptive" | "experimental" | "operational" = "experimental",
): GovernanceDiagnosisRecord {
  const common: Omit<GovernanceDiagnosisRecord, "interpretation" | "measurement" | "controlEvidence"> = {
    id: "diag:1",
    diagnosisRef: { id: "swarmalpha.risk.high-certainty-low-lineage", version: "1.0.0" },
    quantityRef: { id: "swarmalpha.reported-belief-certainty", version: "1.0.0" },
    round: 2,
    label: "High reported probability with insufficient independent lineage",
    value: 0.91,
    attributes: {},
    targetIds: ["agent:a1"],
    sourceObservationIds: ["observation:1"],
    createdAt: "2026-08-09T00:00:00.000Z",
  };
  if (control === "descriptive") {
    return {
      ...common,
      interpretation: "descriptive_risk",
      measurement: {
        observationCompleteness: "complete",
        missingFields: [],
        measurementReliability: { status: "unknown" },
        constructValidity: "descriptive_only",
      },
      controlEvidence: { status: "descriptive_only", controlUse: "observe_only" },
    };
  }
  if (control === "operational") {
    return {
      ...common,
      interpretation: "predictive_risk",
      measurement: {
        observationCompleteness: "complete",
        missingFields: [],
        measurementReliability: {
          status: "validated",
          score: 0.82,
          methodRef: { id: "swarmalpha.measurement.report-parser", version: "1.0.0" },
        },
        constructValidity: "validated",
      },
      controlEvidence: {
        status: "calibrated",
        controlUse: "operational",
        calibrationArtifactRef: { id: "calibration:test", version: "1.0.0" },
        calibrationDomain: "binary-verifiable:test",
      },
    };
  }
  return {
    ...common,
    interpretation: "descriptive_risk",
    measurement: {
      observationCompleteness: "complete",
      missingFields: [],
      measurementReliability: {
        status: "estimated",
        score: 0.75,
        methodRef: { id: "swarmalpha.measurement.report-parser", version: "1.0.0" },
      },
      constructValidity: "predictive_candidate",
    },
    controlEvidence: {
      status: "experimental_candidate",
      controlUse: "randomized_experiment_only",
      preregistrationRef: { id: "prereg:verification-pilot", version: "1.0.0" },
    },
  };
}

function candidate(): GovernanceActionCandidate {
  return {
    actionRef: ACTION_REF,
    targetIds: ["agent:a1"],
    sourceDiagnosisIds: ["diag:1"],
    priority: 10,
    parameters: { claimId: "claim:1" },
    expectedCost: { modelCalls: 1, tokenBudget: 500 },
    rationale: "Request verification before aggregation.",
  };
}

function rule(): GovernanceEligibilityRule {
  return {
    ...RULE_REF,
    config: { threshold: 0.9 },
    evaluate(context) {
      const eligible = context.diagnoses.some(item => item.id === "diag:1" && item.value >= 0.9);
      return {
        ruleRef: RULE_REF,
        eligible,
        reason: eligible ? "Threshold and lineage condition met." : "Eligibility condition not met.",
        sourceDiagnosisIds: ["diag:1"],
        ...(eligible ? { candidate: candidate() } : {}),
      };
    },
  };
}

function action(): InterventionContract {
  return {
    ...ACTION_REF,
    label: "Verification request",
    family: "information_acquisition",
    targetKind: "agent",
    deliveryMode: "tool_request",
    complianceObservability: "observable",
    targetCardinality: { min: 1, max: 1 },
    parameterContract: { required: ["claimId"], allowed: ["claimId"] },
    eligibilityRuleRefs: [RULE_REF],
    mediators: [{
      metricRef: { id: "swarmalpha.metric.verification-completion", version: "1.0.0" },
      expectedDirection: "increase",
      window: { startOffset: 0, endOffset: 1 },
    }],
    costDimensions: ["modelCalls", "tokenBudget"],
    contraindicationCodes: ["no_verifier"],
    conflictsWithActionIds: [],
    randomization: {
      unit: "eligible_event",
      applyArm: "apply",
      holdoutArm: "holdout",
    },
    enabledByDefault: false,
  };
}

function policy(controlMode: GovernancePolicyContract["controlMode"]): GovernancePolicyContract {
  return {
    id: `swarmalpha.policy.${controlMode}`,
    version: "1.0.0",
    controlMode,
    ...(controlMode === "randomized_experiment"
      ? {
          preregistrationRef: { id: "prereg:verification-pilot", version: "1.0.0" },
          assignmentDesign: {
            designRef: { id: "assignment:verification-pilot", version: "1.0.0" },
            seedNamespace: "test:verification-pilot",
            allocations: [{
              actionRef: ACTION_REF,
              unit: "eligible_event" as const,
              arms: [
                { id: "apply", probability: 0.5 },
                { id: "holdout", probability: 0.5 },
              ],
            }],
          },
        }
      : {}),
    eligibilityRuleRefs: [RULE_REF],
    maxActionsPerDecision: 1,
    arbitration: "priority_then_stable_id",
    onlineAdaptation: "forbidden",
  };
}

function engine(): GovernanceDecisionEngine {
  const result = new GovernanceDecisionEngine();
  result.registerAction(action());
  result.registerRule(rule());
  return result.seal();
}

describe("GovernanceDecisionEngine", () => {
  it("ships only opt-in, frozen minimal epistemic action contracts", () => {
    expect(STANDARD_EPISTEMIC_INTERVENTION_CONTRACTS).toHaveLength(4);
    expect(STANDARD_EPISTEMIC_INTERVENTION_CONTRACTS.every(
      contract => contract.enabledByDefault === false && Object.isFrozen(contract),
    )).toBe(true);
    expect(MINIMAL_EPISTEMIC_GOVERNANCE_POLICY_V2).toMatchObject({
      controlMode: "randomized_experiment",
      maxActionsPerDecision: 1,
      onlineAdaptation: "forbidden",
    });
  });

  it("does not let descriptive diagnoses acquire control permission", () => {
    const result = engine().decide({
      id: "decision:observe",
      policy: policy("randomized_experiment"),
      diagnoses: [diagnosis("descriptive")],
      availableBudget: { modelCalls: 1, tokenBudget: 500 },
      round: 2,
      decidedAt: "2026-08-09T00:00:00.000Z",
      sourceEventIds: ["report:1"],
    });

    expect(result.outcome).toBe("no_eligible_action");
    expect(result.candidateActions).toEqual([]);
  });

  it("requires eligible-event assignment before an experimental action", () => {
    const result = engine().decide({
      id: "decision:awaiting",
      policy: policy("randomized_experiment"),
      diagnoses: [diagnosis("experimental")],
      availableBudget: { modelCalls: 1, tokenBudget: 500 },
      round: 2,
      decidedAt: "2026-08-09T00:00:00.000Z",
      sourceEventIds: ["report:1"],
    });

    expect(result.outcome).toBe("awaiting_assignment");
    expect(result.selectedActions).toEqual([]);
    expect(result.candidateActions).toHaveLength(1);
  });

  it("binds experimental control permission to the exact preregistration", () => {
    const mismatchedPolicy = {
      ...policy("randomized_experiment"),
      preregistrationRef: { id: "prereg:other", version: "1.0.0" },
    } as GovernancePolicyContract;
    const result = engine().decide({
      id: "decision:wrong-preregistration",
      policy: mismatchedPolicy,
      diagnoses: [diagnosis("experimental")],
      availableBudget: { modelCalls: 1, tokenBudget: 500 },
      round: 2,
      decidedAt: "2026-08-09T00:00:00.000Z",
      sourceEventIds: ["report:1"],
    });

    expect(result.outcome).toBe("no_eligible_action");
    expect(result.candidateActions).toEqual([]);
  });

  it("rejects malformed runtime enum values rather than trusting TypeScript", () => {
    const malformed = diagnosis("experimental");
    malformed.interpretation = "causal_fact" as never;
    expect(() => engine().decide({
      id: "decision:malformed",
      policy: policy("randomized_experiment"),
      diagnoses: [malformed],
      availableBudget: { modelCalls: 1, tokenBudget: 500 },
      round: 2,
      decidedAt: "2026-08-09T00:00:00.000Z",
      sourceEventIds: ["report:1"],
    })).toThrow("diagnosis.interpretation is invalid");
  });

  it("honors apply and holdout assignments without inventing effectiveness", () => {
    const base = {
      policy: policy("randomized_experiment"),
      diagnoses: [diagnosis("experimental")],
      availableBudget: { modelCalls: 1, tokenBudget: 500 },
      round: 2,
      decidedAt: "2026-08-09T00:00:00.000Z",
      sourceEventIds: ["report:1"],
    };
    const apply = engine().decide({
      ...base,
      id: "decision:apply",
      assignment: {
        id: "assignment:apply",
        unitKind: "eligible_event",
        assignedArm: "apply",
        assignmentProbability: 0.5,
        assignedAt: "2026-08-09T00:00:00.000Z",
      },
    });
    const holdout = engine().decide({
      ...base,
      id: "decision:holdout",
      assignment: {
        id: "assignment:holdout",
        unitKind: "eligible_event",
        assignedArm: "holdout",
        assignmentProbability: 0.5,
        assignedAt: "2026-08-09T00:00:00.000Z",
      },
    });

    expect(apply.outcome).toBe("selected");
    expect(apply.selectedActions).toEqual([candidate()]);
    expect(apply.budgetCommitted).toEqual({ modelCalls: 1, tokenBudget: 500 });
    expect(Object.isFrozen(apply)).toBe(true);
    expect(holdout.outcome).toBe("held_out");
    expect(holdout.selectedActions).toEqual([]);
  });

  it("requires calibrated operational evidence outside randomized experiments", () => {
    const experimental = engine().decide({
      id: "decision:operational-block",
      policy: policy("operational"),
      diagnoses: [diagnosis("experimental")],
      availableBudget: { modelCalls: 1, tokenBudget: 500 },
      round: 2,
      decidedAt: "2026-08-09T00:00:00.000Z",
      sourceEventIds: ["report:1"],
    });
    const calibrated = engine().decide({
      id: "decision:operational-allow",
      policy: policy("operational"),
      diagnoses: [diagnosis("operational")],
      availableBudget: { modelCalls: 1, tokenBudget: 500 },
      round: 2,
      decidedAt: "2026-08-09T00:00:00.000Z",
      sourceEventIds: ["report:1"],
    });

    expect(experimental.outcome).toBe("no_eligible_action");
    expect(calibrated.outcome).toBe("selected");
  });

  it("fails closed when the candidate cannot fit the declared budget", () => {
    const result = engine().decide({
      id: "decision:budget",
      policy: policy("operational"),
      diagnoses: [diagnosis("operational")],
      availableBudget: { modelCalls: 0, tokenBudget: 499 },
      round: 2,
      decidedAt: "2026-08-09T00:00:00.000Z",
      sourceEventIds: ["report:1"],
    });

    expect(result.outcome).toBe("no_eligible_action");
    expect(result.selectedActions).toEqual([]);
  });
});

function ruleEmitting(
  ruleRef: { id: string; version: string },
  priority: number,
  emittedActionRef: { id: string; version: string } = ACTION_REF,
): GovernanceEligibilityRule {
  return {
    ...ruleRef,
    config: { priority },
    evaluate() {
      return {
        ruleRef,
        eligible: true,
        reason: "Rule-driven candidate emission.",
        sourceDiagnosisIds: ["diag:1"],
        candidate: { ...candidate(), actionRef: emittedActionRef, priority },
      };
    },
  };
}

describe("runtime contract validation edges", () => {
  it.each([
    ["family", "resource_leak", "interventionContract.family is invalid"],
    ["targetKind", "organization", "interventionContract.targetKind is invalid"],
    ["deliveryMode", "telepathy", "interventionContract.deliveryMode is invalid"],
    ["complianceObservability", "maybe", "interventionContract.complianceObservability is invalid"],
  ])("rejects an invalid runtime value for intervention %s", (field, value, message) => {
    const bad = action();
    (bad as unknown as Record<string, unknown>)[field] = value;
    expect(() => validateInterventionContract(bad)).toThrow(message);
  });

  it("rejects invalid mediator direction and randomization unit values", () => {
    const badDirection = action();
    (badDirection.mediators[0] as { expectedDirection: string }).expectedDirection = "sideways";
    expect(() => validateInterventionContract(badDirection))
      .toThrow("interventionContract.mediators[0].expectedDirection is invalid");

    const badUnit = action();
    (badUnit.randomization as { unit: string }).unit = "group";
    expect(() => validateInterventionContract(badUnit))
      .toThrow("interventionContract.randomization.unit is invalid");
  });

  it.each([
    ["controlMode", "anarchic", "governancePolicy.controlMode is invalid"],
    ["arbitration", "flip_coin", "governancePolicy.arbitration is invalid"],
    ["onlineAdaptation", "aggressive", "governancePolicy.onlineAdaptation is invalid"],
  ])("rejects an invalid runtime value for policy %s", (field, value, message) => {
    const bad = policy("observe_only");
    (bad as unknown as Record<string, unknown>)[field] = value;
    expect(() => validateGovernancePolicy(bad)).toThrow(message);
  });

  it("rejects a randomized policy that lacks preregistration", () => {
    const bad = policy("randomized_experiment");
    delete (bad as Partial<GovernancePolicyContract>).preregistrationRef;
    expect(() => validateGovernancePolicy(bad))
      .toThrow("randomized experimental policy must declare preregistrationRef");
    // The decision kernel also rejects it at runtime rather than trusting TypeScript.
    expect(() => engine().decide({
      id: "decision:no-prereg",
      policy: bad,
      diagnoses: [diagnosis("experimental")],
      availableBudget: { modelCalls: 1, tokenBudget: 500 },
      round: 2,
      decidedAt: "2026-08-09T00:00:00.000Z",
      sourceEventIds: ["report:1"],
    })).toThrow("randomized experimental policy must declare preregistrationRef");
  });

  it.each(["partial", "missing"])(
    "requires named missingFields for %s diagnosis observations",
    (completeness) => {
      const bad = diagnosis("experimental");
      bad.measurement.observationCompleteness = completeness as "partial" | "missing";
      bad.measurement.missingFields = [];
      expect(() => validateGovernanceDiagnosis(bad))
        .toThrow("partial or missing diagnosis measurement must list missingFields");
    },
  );

  it("rejects a complete diagnosis that still names missingFields", () => {
    const bad = diagnosis("experimental");
    bad.measurement.observationCompleteness = "complete";
    bad.measurement.missingFields = ["reportedProbability"];
    expect(() => validateGovernanceDiagnosis(bad))
      .toThrow("complete diagnosis measurement must not list missingFields");
  });

  it("deduplicates identical candidates emitted by different rules and keeps the higher priority", () => {
    const RULE_HIGH = { id: "swarmalpha.rule.high-priority", version: "1.0.0" };
    const RULE_LOW = { id: "swarmalpha.rule.low-priority", version: "1.0.0" };
    const engine = new GovernanceDecisionEngine();
    engine.registerAction({ ...action(), eligibilityRuleRefs: [RULE_HIGH, RULE_LOW] });
    engine.registerRule(ruleEmitting(RULE_HIGH, 10));
    engine.registerRule(ruleEmitting(RULE_LOW, 5));
    engine.seal();

    const result = engine.decide({
      id: "decision:dedupe",
      policy: {
        ...policy("randomized_experiment"),
        eligibilityRuleRefs: [RULE_HIGH, RULE_LOW],
        maxActionsPerDecision: 2,
      },
      diagnoses: [diagnosis("experimental")],
      availableBudget: { modelCalls: 2, tokenBudget: 1000 },
      round: 2,
      decidedAt: "2026-08-09T00:00:00.000Z",
      sourceEventIds: ["report:1"],
      assignment: {
        id: "assignment:apply",
        unitKind: "eligible_event",
        assignedArm: "apply",
        assignmentProbability: 0.5,
        assignedAt: "2026-08-09T00:00:00.000Z",
      },
    });

    expect(result.outcome).toBe("selected");
    expect(result.candidateActions).toHaveLength(1);
    expect(result.selectedActions).toHaveLength(1);
    expect(result.selectedActions[0].priority).toBe(10);
  });

  it("does not select a secondary candidate whose randomization unit conflicts with the recorded assignment", () => {
    const RULE_RUN = { id: "swarmalpha.rule.run-unit", version: "1.0.0" };
    const RUN_ACTION = { id: "swarmalpha.action.run-unit", version: "1.0.0" };
    const engine = new GovernanceDecisionEngine();
    engine.registerAction(action());
    engine.registerAction({
      ...action(),
      id: RUN_ACTION.id,
      version: RUN_ACTION.version,
      eligibilityRuleRefs: [RULE_RUN],
      randomization: { unit: "run", applyArm: "apply", holdoutArm: "holdout" },
    });
    engine.registerRule(rule());
    engine.registerRule(ruleEmitting(RULE_RUN, 5, RUN_ACTION));
    engine.seal();

    const result = engine.decide({
      id: "decision:unit-conflict",
      policy: {
        ...policy("randomized_experiment"),
        eligibilityRuleRefs: [RULE_REF, RULE_RUN],
        maxActionsPerDecision: 2,
      },
      diagnoses: [diagnosis("experimental")],
      availableBudget: { modelCalls: 2, tokenBudget: 1000 },
      round: 2,
      decidedAt: "2026-08-09T00:00:00.000Z",
      sourceEventIds: ["report:1"],
      assignment: {
        id: "assignment:apply",
        unitKind: "eligible_event",
        assignedArm: "apply",
        assignmentProbability: 0.5,
        assignedAt: "2026-08-09T00:00:00.000Z",
      },
    });

    // Both candidates remain eligible and visible; the run-unit secondary must
    // not be selected because the recorded assignment unit is eligible_event.
    expect(result.candidateActions).toHaveLength(2);
    expect(result.selectedActions).toHaveLength(1);
    expect(result.selectedActions[0]).toMatchObject({ actionRef: ACTION_REF, priority: 10 });
  });
});


function transition(
  id: string,
  from: GovernanceActionTransition["from"],
  to: GovernanceActionTransition["to"],
  round: number,
  extra: Partial<GovernanceActionTransition> = {},
): GovernanceActionTransition {
  return {
    id,
    actionInstanceId: "action-instance:1",
    from,
    to,
    round,
    occurredAt: `2026-08-09T00:00:0${round}.000Z`,
    sourceEventIds: [],
    ...extra,
  };
}

function instance(assignmentId = "assignment:apply"): GovernanceActionInstance {
  return {
    id: "action-instance:1",
    decisionId: "decision:apply",
    actionRef: ACTION_REF,
    targetIds: ["agent:a1"],
    sourceDiagnosisIds: ["diag:1"],
    parameters: { claimId: "claim:1" },
    expectedCost: { modelCalls: 1, tokenBudget: 500 },
    assignmentId,
    plannedWindow: { startRound: 3, endRound: 4 },
    createdAt: "2026-08-09T00:00:00.000Z",
  };
}

describe("GovernanceActionLedger", () => {
  it("separates queue, delivery, compliance observation, and completion", () => {
    const ledger = new GovernanceActionLedger();
    ledger.register(instance(), transition("tx:0", null, "proposed", 2));
    ledger.commit([
      transition("tx:1", "proposed", "eligible", 2),
      transition("tx:2", "eligible", "assigned", 2),
      transition("tx:3", "assigned", "queued", 2),
      transition("tx:4", "queued", "delivered", 3),
      transition("tx:5", "delivered", "compliance_observed", 3, {
        observation: { promptDelivered: true, responseReceived: true },
      }),
      transition("tx:6", "compliance_observed", "completed", 4),
    ]);

    expect(ledger.getCurrentState("action-instance:1")).toBe("completed");
    expect(ledger.getHistory("action-instance:1").map(item => item.to)).toEqual([
      "proposed",
      "eligible",
      "assigned",
      "queued",
      "delivered",
      "compliance_observed",
      "completed",
    ]);
  });

  it("rejects applied/effective shortcuts and keeps batch commits atomic", () => {
    const ledger = new GovernanceActionLedger();
    ledger.register(instance(), transition("tx:0", null, "proposed", 2));

    expect(() => ledger.commit([
      transition("tx:1", "proposed", "eligible", 2),
      transition("tx:2", "eligible", "delivered", 3),
    ])).toThrow("Illegal action transition");
    expect(ledger.getCurrentState("action-instance:1")).toBe("proposed");
    expect(ledger.getHistory("action-instance:1")).toHaveLength(1);
  });

  it("keeps batch commits atomic when a later transition violates round ordering", () => {
    const ledger = new GovernanceActionLedger();
    ledger.register(instance(), transition("tx:0", null, "proposed", 2));

    expect(() => ledger.commit([
      transition("tx:1", "proposed", "eligible", 2),
      transition("tx:2", "eligible", "assigned", 1),
    ])).toThrow("rounds must be non-decreasing");
    expect(ledger.getCurrentState("action-instance:1")).toBe("proposed");
    expect(ledger.getHistory("action-instance:1")).toHaveLength(1);
  });

  it("requires an explicit assignment before held-out or assigned states", () => {
    const ledger = new GovernanceActionLedger();
    expect(() => ledger.register(
      instance(""),
      transition("tx:0", null, "proposed", 2),
    )).toThrow("assignmentId must be non-empty");
  });

  it("rejects invalid lifecycle states from parsed artifacts", () => {
    const ledger = new GovernanceActionLedger();
    expect(() => ledger.register(
      instance(),
      transition("tx:0", null, "applied" as never, 2),
    )).toThrow("actionTransition.to is invalid");
  });

  it("records right-censoring explicitly instead of calling an unfinished window complete", () => {
    const ledger = new GovernanceActionLedger();
    ledger.register(instance(), transition("tx:0", null, "proposed", 2));
    ledger.commit([
      transition("tx:1", "proposed", "eligible", 2),
      transition("tx:2", "eligible", "assigned", 2),
      transition("tx:3", "assigned", "queued", 2),
      transition("tx:4", "queued", "delivered", 3),
      transition("tx:5", "delivered", "censored", 3, {
        observation: { reason: "run_ended_before_window_close" },
      }),
    ]);
    expect(ledger.getCurrentState("action-instance:1")).toBe("censored");
  });
});
