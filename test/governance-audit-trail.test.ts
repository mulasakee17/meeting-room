import { describe, expect, it } from "vitest";
import {
  createGovernanceEventAssignment,
  deriveGovernanceAssignmentSeed,
  deriveGovernanceAssignmentUnitId,
  createVerificationRequestEligibilityRule,
  GovernanceDecisionEngine,
  HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_V2,
  VERIFICATION_ATTENTION_SHAM_V2,
  VERIFICATION_REQUEST_V2,
  toGovernanceActionAssignmentRef,
  type GovernanceActionInstance,
  type GovernanceActionTransition,
  type GovernanceDecisionRecord,
  type GovernanceDiagnosisRecord,
  type GovernanceEligibilityRule,
  type GovernancePolicyContract,
} from "@/lib/governance";
import {
  computeGovernanceSourceEventHash,
  GovernanceAuditTrailBuilder,
  OPERATIONAL_POOLED_BRIER_ESTIMAND_V1,
  PRIMARY_ASSIGNMENT_ALGORITHM_V1,
  FINAL_OUTCOME_TASK_EVALUATION_V1,
  computePrimaryArmExecutionBindingHash,
  computePrimaryAssignmentExecutionPayloadHash,
  computeOperationalAnalysisUnitHashV1,
  computeOperationalOutcomeArtifactHashV1,
  createPrimaryArmExecutionRegistryV1,
  createPrimaryAssignmentManifestV1,
  createPrimaryAssignmentV1,
  createOperationalAnalysisUnitV1,
  createOperationalOutcomeArtifactV1,
  replayGovernanceAuditTrailDecisions,
  resolvePrimaryArmExecutionBindingV1,
  validateGovernanceAuditTrail,
  type GovernanceAuditAppendBatch,
  type GovernanceAuditTrail,
  type GovernanceSourceEvent,
  type OperationalAnalysisUnitV1,
  type PrimaryArmExecutionBindingV1,
  type PrimaryAssignmentDesignV1,
} from "@/lib/experimentation";
import { mulberry32 } from "@/lib/utils/statsUtils";
import { verifyRawRunData } from "../experiments/campaign/replayVerifier";
import {
  createFinalElicitationContract,
  FinalOutcomeSession,
  projectFinalOutcomeTaskRecord,
  type FinalOutcomeArtifactV1,
} from "@/lib/experimentation/finalOutcome";
import type { TaskOutcomeRecord } from "@/lib/experimentation/lifecycle";
import type { EpistemicClaim } from "@/lib/epistemic";

const PREREGISTRATION = { id: "swarmalpha.prereg.audit-fixture", version: "1.0.0" } as const;
const PRIMARY_IMPLEMENTATIONS = {
  text: { protocol: "text_baseline" },
  epistemic: { protocol: "epistemic_governance" },
  budget: { maxRounds: 3 },
} as const;

function certaintyThresholdPolicy() {
  return {
    id: "swarmalpha.threshold.reported-belief-certainty",
    version: "1.0.0",
    quantityRef: { id: "swarmalpha.reported-belief-certainty", version: "1.0.0" },
    operator: "gte" as const,
    bounds: { lower: 0.9 },
    authority: {
      kind: "randomized_experiment_only" as const,
      preregistrationRef: { id: "swarmalpha.prereg.audit-fixture", version: "1.0.0" },
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

function auditPrimaryDesign(): PrimaryAssignmentDesignV1 {
  return {
    id: "swarmalpha.primary-design.audit-fixture",
    version: "1.0.0",
    schemaVersion: "1.0.0",
    preregistrationRef: structuredClone(PREREGISTRATION),
    unit: "run",
    assignmentAlgorithmRef: structuredClone(PRIMARY_ASSIGNMENT_ALGORITHM_V1),
    seedNamespace: "swarmalpha.audit-fixture.primary.v1",
    arms: [
      {
        armRef: { id: "swarmalpha.arm.text-baseline", version: "1.0.0" },
        allocationProbability: 0.5,
        implementationRef: { id: "swarmalpha.runtime.text-baseline", version: "1.0.0" },
        implementationConfigHash: computePrimaryAssignmentExecutionPayloadHash(PRIMARY_IMPLEMENTATIONS.text),
        budgetContractRef: { id: "swarmalpha.budget.audit-fixture", version: "1.0.0" },
        budgetContractHash: computePrimaryAssignmentExecutionPayloadHash(PRIMARY_IMPLEMENTATIONS.budget),
      },
      {
        armRef: { id: "swarmalpha.arm.epistemic-governance", version: "1.0.0" },
        allocationProbability: 0.5,
        implementationRef: { id: "swarmalpha.runtime.epistemic-governance", version: "1.0.0" },
        implementationConfigHash: computePrimaryAssignmentExecutionPayloadHash(PRIMARY_IMPLEMENTATIONS.epistemic),
        budgetContractRef: { id: "swarmalpha.budget.audit-fixture", version: "1.0.0" },
        budgetContractHash: computePrimaryAssignmentExecutionPayloadHash(PRIMARY_IMPLEMENTATIONS.budget),
      },
    ],
    stratification: {
      fields: ["model", "taskFamily"],
      missingFieldPolicy: "reject",
      extraFieldPolicy: "reject",
    },
    analysisPopulation: "intention_to_treat",
    primaryEstimandRef: {
      id: OPERATIONAL_POOLED_BRIER_ESTIMAND_V1.id,
      version: OPERATIONAL_POOLED_BRIER_ESTIMAND_V1.version,
    },
    retryPolicy: "reuse_assignment",
  };
}

function fixture(): { trail: GovernanceAuditTrail; rule: ReturnType<typeof createVerificationRequestEligibilityRule> } {
  const rule = createVerificationRequestEligibilityRule({
    certaintyThresholdPolicy: certaintyThresholdPolicy(),
    maxVerifiedIndependentLineages: 1,
    verifierId: "verifier:test",
    matchedTokenBudget: 300,
    expectedModelCalls: 1,
    priority: 100,
  });
  const policy: GovernancePolicyContract = {
    id: "swarmalpha.policy.audit-fixture",
    version: "1.0.0",
    controlMode: "randomized_experiment",
    preregistrationRef: PREREGISTRATION,
    eligibilityRuleRefs: [{ id: rule.id, version: rule.version }],
    maxActionsPerDecision: 1,
    arbitration: "priority_then_stable_id",
    assignmentDesign: {
      designRef: { id: "swarmalpha.assignment.audit-fixture", version: "1.0.0" },
      seedNamespace: "test:audit-fixture",
      allocations: [{
        actionRef: { id: VERIFICATION_REQUEST_V2.id, version: VERIFICATION_REQUEST_V2.version },
        unit: "eligible_event",
        arms: [
          { id: "apply", probability: 0.5 },
          { id: "holdout", probability: 0.25 },
          { id: "sham", probability: 0.25 },
        ],
      }],
    },
    onlineAdaptation: "forbidden",
  };
  const sourceBase = {
    eventRef: { id: "swarmalpha.event.belief-report", version: "1.0.0" },
    kind: "belief_report" as const,
    round: 1,
    payload: { reportId: "report:1", claimId: "claim:1", probability: 0.95 },
  };
  const sourceEvent: GovernanceSourceEvent = {
    id: "event:report:1",
    ...sourceBase,
    contentHash: computeGovernanceSourceEventHash(sourceBase),
    recordedAt: "2026-08-09T00:00:00.000Z",
  };
  const diagnosis: GovernanceDiagnosisRecord = {
    id: "diagnosis:1",
    diagnosisRef: HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_V2,
    quantityRef: { id: "swarmalpha.reported-belief-certainty", version: "1.0.0" },
    round: 2,
    label: "High reported probability with insufficient independent lineage",
    interpretation: "descriptive_risk",
    value: 0.95,
    attributes: {
      claimId: "claim:1",
      beliefReportId: "report:1",
      beliefKind: "binary",
      claimResolved: false,
      verifierAvailable: true,
      verifiedIndependentLineageCount: 0,
    },
    targetIds: ["agent:a1"],
    sourceObservationIds: ["observation:1"],
    measurement: {
      observationCompleteness: "complete",
      missingFields: [],
      measurementReliability: {
        status: "estimated",
        score: 0.8,
        methodRef: { id: "swarmalpha.measurement.audit-fixture", version: "1.0.0" },
      },
      constructValidity: "predictive_candidate",
    },
    controlEvidence: {
      status: "experimental_candidate",
      controlUse: "randomized_experiment_only",
      preregistrationRef: PREREGISTRATION,
    },
    createdAt: "2026-08-09T00:00:01.000Z",
  };
  const engine = new GovernanceDecisionEngine();
  engine.registerAction(structuredClone(VERIFICATION_REQUEST_V2));
  engine.registerAction(structuredClone(VERIFICATION_ATTENTION_SHAM_V2));
  engine.registerRule(rule);
  engine.seal();
  const decisionBase = {
    policy,
    diagnoses: [diagnosis],
    availableBudget: { modelCalls: 1, tokenBudget: 300 },
    round: 2,
    decidedAt: "2026-08-09T00:00:02.000Z",
    sourceEventIds: ["observation:1"],
  };
  const eligibilityDecision = engine.decide({ id: "decision:eligibility", ...decisionBase });

  let assignment = createGovernanceEventAssignment({
    id: "assignment:1",
    runId: "run:audit-fixture",
    unitKind: "eligible_event",
    eligibilityDecision,
    policy,
    masterSeed: 1,
    assignedAt: "2026-08-09T00:00:03.000Z",
  });
  for (let masterSeed = 2; assignment.assignedArm !== "apply" && masterSeed < 100; masterSeed++) {
    assignment = createGovernanceEventAssignment({
      id: "assignment:1",
      runId: "run:audit-fixture",
      unitKind: "eligible_event",
      eligibilityDecision,
      policy,
      masterSeed,
      assignedAt: "2026-08-09T00:00:03.000Z",
    });
  }
  if (assignment.assignedArm !== "apply") throw new Error("fixture could not produce apply assignment");
  const finalDecision = engine.decide({
    id: "decision:final",
    ...decisionBase,
    assignment: toGovernanceActionAssignmentRef(assignment),
    decidedAt: "2026-08-09T00:00:03.500Z",
  });
  const selected = finalDecision.selectedActions[0];
  const actionInstance: GovernanceActionInstance = {
    id: "action:1",
    decisionId: finalDecision.id,
    actionRef: structuredClone(selected.actionRef),
    targetIds: [...selected.targetIds],
    sourceDiagnosisIds: [...selected.sourceDiagnosisIds],
    parameters: structuredClone(selected.parameters),
    expectedCost: structuredClone(selected.expectedCost),
    assignmentId: assignment.id,
    plannedWindow: { startRound: 3, endRound: 4 },
    createdAt: "2026-08-09T00:00:04.000Z",
  };
  const transition = (
    id: string,
    from: GovernanceActionTransition["from"],
    to: GovernanceActionTransition["to"],
    round: number,
    extra: Partial<GovernanceActionTransition> = {},
  ): GovernanceActionTransition => ({
    id,
    actionInstanceId: actionInstance.id,
    from,
    to,
    round,
    occurredAt: `2026-08-09T00:00:${String(4 + Number(id.split(":")[1])).padStart(2, "0")}.000Z`,
    sourceEventIds: [],
    ...extra,
  });
  const trail: GovernanceAuditTrail = {
    artifactType: "swarmalpha.governance-audit-trail",
    schemaVersion: "1.0.0",
    runId: "run:audit-fixture",
    status: "sealed",
    studyContract: {
      id: "swarmalpha.study.audit-fixture",
      version: "1.0.0",
      governanceArchitecture: "auditable_epistemic_v1",
      inferenceIntent: "exploratory",
      taskFamilyRef: { id: "swarmalpha.task.distributed-categorical", version: "1.0.0" },
      evaluationContractRef: { id: "swarmalpha.eval.proper-score", version: "1.0.0" },
      artifactSchemaRef: { id: "swarmalpha.raw-run", version: "5.0.0" },
      governancePolicy: policy,
      eligibleEventEstimand: "exploratory_only",
    },
    ruleSnapshots: [{ ruleRef: { id: rule.id, version: rule.version }, config: rule.config }],
    interventionContracts: [
      structuredClone(VERIFICATION_REQUEST_V2),
      structuredClone(VERIFICATION_ATTENTION_SHAM_V2),
    ],
    sourceEvents: [sourceEvent],
    observations: [{
      id: "observation:1",
      observationRef: { id: "swarmalpha.observation.reported-probability-lineage", version: "1.0.0" },
      round: 1,
      subjectIds: ["agent:a1", "claim:1"],
      completeness: "complete",
      missingFields: [],
      values: { probability: 0.95, verifiedIndependentLineageCount: 0 },
      sourceEventIds: [sourceEvent.id],
      observedAt: "2026-08-09T00:00:01.000Z",
    }],
    diagnoses: [diagnosis],
    eventAssignments: [assignment],
    decisions: [eligibilityDecision, finalDecision],
    actionInstances: [actionInstance],
    actionTransitions: [
      transition("transition:0", null, "proposed", 2),
      transition("transition:1", "proposed", "eligible", 2),
      transition("transition:2", "eligible", "assigned", 2),
      transition("transition:3", "assigned", "queued", 2),
      transition("transition:4", "queued", "delivered", 3),
      transition("transition:5", "delivered", "compliance_observed", 3, {
        observation: { promptDelivered: true, responseReceived: true },
      }),
      transition("transition:6", "compliance_observed", "completed", 4),
    ],
    createdAt: "2026-08-09T00:00:00.000Z",
    sealedAt: "2026-08-09T00:00:11.000Z",
  };
  return { trail, rule };
}

function scoredFinalOutcomeCarrier(runId: string): {
  artifact: FinalOutcomeArtifactV1;
  taskOutcome: TaskOutcomeRecord;
} {
  const claims: EpistemicClaim[] = [
    {
      id: "claim:binary",
      proposition: "Will the safety constraint hold?",
      domain: "fixture",
      createdAt: "2026-08-08T23:59:58.000Z",
      resolutionPolicy: { kind: "binary", resolverId: "resolver:fixture" },
    },
  ];
  const contract = createFinalElicitationContract({
    id: "fixture.final-elicitation",
    version: "1.0.0",
    claimIds: claims.map(claim => claim.id),
  });
  const session = new FinalOutcomeSession({
    runId,
    taskId: "task:fixture",
    contract,
    claims,
    expectedAgentIds: ["a", "b"],
    discussionCompletedAt: "2026-08-10T00:01:00.000Z",
    totalRounds: 3,
    scoringTask: {
      groundTruth: {
        taskId: "task:fixture",
        resolverId: "resolver:fixture",
        resolverVersion: "1.0.0",
        value: { "claim:binary": true },
      },
      evaluationContractRef: { id: "fixture.evaluation", version: "1.0.0" },
    },
  });
  const answered = (binary: number): string => JSON.stringify({
    status: "answered",
    reports: [
      { claimId: "claim:binary", value: { kind: "binary", probability: binary } },
    ],
  });
  session.recordRawResponse("a", answered(0.7), "2026-08-10T00:02:00.000Z");
  session.recordRawResponse("b", answered(0.7), "2026-08-10T00:02:01.000Z");
  session.closeElicitation("2026-08-10T00:03:00.000Z");
  session.resolveClaims((claim, releasedScoringTask, resolvedAt) => ({
    claimId: claim.id,
    resolverId: claim.resolutionPolicy.resolverId,
    resolvedAt,
    kind: claim.resolutionPolicy.kind,
    outcome: (releasedScoringTask.groundTruth.value as Record<string, boolean | string>)[claim.id] as never,
  }), "2026-08-10T00:04:00.000Z");
  const artifact = session.score("2026-08-10T00:05:00.000Z");
  return {
    artifact,
    taskOutcome: projectFinalOutcomeTaskRecord({
      artifact,
      runAssignmentId: "assignment:audit-fixture",
      cost: { totalTokens: 10 },
    }),
  };
}

function schema5Carrier(
  trail: GovernanceAuditTrail,
  outcome = scoredFinalOutcomeCarrier(trail.runId),
) {
  const carrierTrail = structuredClone(trail);
  const design = carrierTrail.studyContract.primaryAssignmentDesign ?? auditPrimaryDesign();
  carrierTrail.studyContract.preregistrationRef ??= structuredClone(PREREGISTRATION);
  carrierTrail.studyContract.primaryAssignmentUnit = "run";
  carrierTrail.studyContract.primaryAssignmentDesign = design;
  const assignment = createPrimaryAssignmentV1({
    id: "assignment:audit-fixture",
    runId: carrierTrail.runId,
    studyRef: { id: carrierTrail.studyContract.id, version: carrierTrail.studyContract.version },
    design,
    stratum: { model: "fixture", taskFamily: "audit" },
    masterSeed: 42,
    assignedAt: "2026-08-09T00:00:00.000Z",
  });
  const primaryAssignmentManifest = createPrimaryAssignmentManifestV1({
    runId: carrierTrail.runId,
    studyRef: assignment.studyRef,
    design,
    assignment,
    createdAt: "2026-08-09T00:00:00.000Z",
  });
  const primaryArmExecutionRegistry = createPrimaryArmExecutionRegistryV1({
    studyRef: assignment.studyRef,
    design,
    entries: [
      {
        armRef: design.arms[0].armRef,
        implementationRef: design.arms[0].implementationRef,
        implementationConfig: PRIMARY_IMPLEMENTATIONS.text,
        budgetContractRef: design.arms[0].budgetContractRef,
        budgetContract: PRIMARY_IMPLEMENTATIONS.budget,
      },
      {
        armRef: design.arms[1].armRef,
        implementationRef: design.arms[1].implementationRef,
        implementationConfig: PRIMARY_IMPLEMENTATIONS.epistemic,
        budgetContractRef: design.arms[1].budgetContractRef,
        budgetContract: PRIMARY_IMPLEMENTATIONS.budget,
      },
    ],
  });
  const primaryArmExecution = resolvePrimaryArmExecutionBindingV1({
    manifest: primaryAssignmentManifest,
    registry: primaryArmExecutionRegistry,
    resolvedAt: "2026-08-09T00:00:00.000Z",
  });
  const operationalAnalysisUnit = createOperationalAnalysisUnitV1({
    runId: carrierTrail.runId,
    taskId: outcome.artifact.taskId,
    studyRef: assignment.studyRef,
    primaryClaim: outcome.artifact.claims[0],
    expectedAgentIds: outcome.artifact.expectedAgentIds,
    committedAt: "2026-08-08T23:59:59.000Z",
  });
  const operationalOutcome = createOperationalOutcomeArtifactV1({
    study: carrierTrail.studyContract,
    primaryAssignmentManifest,
    analysisUnit: operationalAnalysisUnit,
    finalOutcome: outcome.artifact,
    computedAt: "2026-08-10T00:06:00.000Z",
  });
  return {
    runId: carrierTrail.runId,
    rawSchemaVersion: "5.0",
    governanceStudy: carrierTrail.studyContract,
    governanceAuditTrail: carrierTrail,
    primaryAssignmentManifest,
    primaryArmExecutionRegistry,
    primaryArmExecution,
    finalOutcome: outcome.artifact,
    operationalAnalysisUnit,
    operationalOutcome,
    taskOutcome: outcome.taskOutcome,
  };
}

describe("GovernanceAuditTrail", () => {
  it("constructs and seals one append-only trail through atomic validated batches", () => {
    const { trail } = fixture();
    const builder = new GovernanceAuditTrailBuilder({
      runId: trail.runId,
      studyContract: trail.studyContract,
      ruleSnapshots: trail.ruleSnapshots,
      interventionContracts: trail.interventionContracts,
      createdAt: trail.createdAt,
    });
    const empty = builder.snapshot();
    const duplicated = structuredClone(trail.sourceEvents[0]);
    expect(() => builder.commit({ sourceEvents: [duplicated, duplicated] }))
      .toThrow(/ids must be unique/);
    expect(builder.snapshot()).toEqual(empty);

    builder.commit({
      sourceEvents: trail.sourceEvents,
      observations: trail.observations,
      diagnoses: trail.diagnoses,
      decisions: trail.decisions,
      eventAssignments: trail.eventAssignments,
      actionInstances: trail.actionInstances,
      actionTransitions: trail.actionTransitions,
    });
    const sealed = builder.seal(trail.sealedAt!);
    expect(validateGovernanceAuditTrail(sealed).status)
      .toBe("sealed_structural_replay_verified");
    expect(() => builder.commit({ sourceEvents: trail.sourceEvents }))
      .toThrow(/immutable/);
  });

  it("distinguishes structural replay from executable decision replay", () => {
    const { trail, rule } = fixture();
    expect(validateGovernanceAuditTrail(trail)).toMatchObject({
      status: "sealed_structural_replay_verified",
      decisionReplay: "not_performed",
    });
    expect(replayGovernanceAuditTrailDecisions(trail, [rule])).toMatchObject({
      status: "sealed_decision_replay_verified",
      decisionReplay: "verified",
    });
  });

  it("detects source-event payload tampering", () => {
    const { trail } = fixture();
    trail.sourceEvents[0].payload.probability = 0.2;
    expect(() => validateGovernanceAuditTrail(trail)).toThrow("contentHash does not match");
  });

  it("binds assignment to the exact eligible candidate set", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    tampered.decisions[0].candidateActions[0].parameters.claimId = "claim:tampered";
    if (!tampered.decisions[0].evaluations[0].candidate) throw new Error("fixture missing candidate");
    tampered.decisions[0].evaluations[0].candidate.parameters.claimId = "claim:tampered";
    expect(() => validateGovernanceAuditTrail(tampered)).toThrow("does not match its eligibility decision");
  });

  it("rejects a self-consistent draw whose probabilities differ from preregistration", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    const assignment = tampered.eventAssignments[0];
    assignment.arms = [
      { id: "apply", probability: 0.9 },
      { id: "holdout", probability: 0.05 },
      { id: "sham", probability: 0.05 },
    ];
    assignment.derivedSeed = deriveGovernanceAssignmentSeed(assignment);
    assignment.randomDraw = mulberry32(assignment.derivedSeed)();
    let cumulative = 0;
    const selected = assignment.arms.find(arm => {
      cumulative += arm.probability;
      return assignment.randomDraw < cumulative;
    }) ?? assignment.arms[assignment.arms.length - 1];
    assignment.assignedArm = selected.id;
    assignment.assignmentProbability = selected.probability;
    const finalDecision = tampered.decisions.find(decision => decision.assignment);
    if (!finalDecision?.assignment) throw new Error("fixture missing final decision");
    finalDecision.assignment.assignedArm = assignment.assignedArm;
    finalDecision.assignment.assignmentProbability = assignment.assignmentProbability;

    expect(() => validateGovernanceAuditTrail(tampered)).toThrow(
      "does not match the preregistered assignment design",
    );
  });

  it("cross-checks the assignment's eligible rule identities", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    tampered.eventAssignments[0].eligibilityRuleRefs = [{ id: "rule:other", version: "1.0.0" }];
    expect(() => validateGovernanceAuditTrail(tampered)).toThrow(
      "eligibility rules do not match",
    );
  });

  it("rejects action instances whose delivered parameters differ from selection", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    tampered.actionInstances[0].parameters.claimId = "claim:other";
    expect(() => validateGovernanceAuditTrail(tampered)).toThrow("does not match a decision action");
  });

  it("requires every sealed assignment to have exactly one closing decision", () => {
    const { trail } = fixture();
    trail.decisions = trail.decisions.filter(decision => decision.outcome === "awaiting_assignment");
    trail.actionInstances = [];
    trail.actionTransitions = [];
    expect(() => validateGovernanceAuditTrail(trail)).toThrow("exactly one decision closing each assignment");
  });

  it("accepts an exploratory schema-5 carrier after structural replay", () => {
    const { trail } = fixture();
    const result = verifyRawRunData("run.json", schema5Carrier(trail));
    expect(result.runIssues).toEqual([]);
    expect(result.governanceAuditStatus).toBe("sealed_structural_replay_verified");
  });

  it("rejects schema-4 treatment authority fields inside a schema-5 carrier", () => {
    const { trail } = fixture();
    const raw = {
      ...schema5Carrier(trail),
      treatmentAssignment: null,
      applicationReceipts: [],
    };
    const result = verifyRawRunData("run.json", raw);
    expect(result.runIssues.some(issue =>
      issue.code === "schema5_legacy_treatment_authority_present")).toBe(true);
  });

  it("requires executable decision replay before confirmatory schema-5 use", () => {
    const { trail, rule } = fixture();
    const confirmatory = structuredClone(trail);
    confirmatory.studyContract.inferenceIntent = "confirmatory";
    confirmatory.studyContract.preregistrationRef = PREREGISTRATION;
    confirmatory.studyContract.frozenAt = "2026-08-09T00:00:00.000Z";
    confirmatory.studyContract.primaryAssignmentUnit = "run";
    confirmatory.studyContract.primaryAssignmentDesign = auditPrimaryDesign();
    const raw = schema5Carrier(confirmatory);

    const structuralOnly = verifyRawRunData("run.json", raw);
    expect(structuralOnly.governanceAuditStatus).toBe("decision_replay_required");
    expect(structuralOnly.runIssues.some(issue =>
      issue.code === "governance_decision_replay_required")).toBe(true);

    const replayed = verifyRawRunData("run.json", raw, { governanceRules: [rule] });
    expect(replayed.runIssues).toEqual([]);
    expect(replayed.governanceAuditStatus).toBe("sealed_decision_replay_verified");
  });

  it("fails closed when a schema-5 carrier omits its authoritative trail", () => {
    const { trail } = fixture();
    const result = verifyRawRunData("run.json", {
      runId: trail.runId,
      rawSchemaVersion: "5.0",
      governanceStudy: trail.studyContract,
    });
    expect(result.runIssues.some(issue => issue.code === "missing_governance_audit_trail")).toBe(true);
  });
});

describe("CC-3A schema 5 adversarial carriers", () => {
  it("fails closed when a schema-5 carrier sets governanceStudy to null", () => {
    const { trail } = fixture();
    const result = verifyRawRunData("run.json", {
      runId: trail.runId,
      rawSchemaVersion: "5.0",
      governanceStudy: null,
      governanceAuditTrail: trail,
    });
    expect(result.runIssues.some(issue => issue.code === "missing_governance_study_contract")).toBe(true);
    expect(result.governanceAuditStatus).toBeUndefined();
  });

  it("emits a stable error when a schema-5 carrier sets governanceAuditTrail to null", () => {
    const { trail } = fixture();
    const result = verifyRawRunData("run.json", {
      runId: trail.runId,
      rawSchemaVersion: "5.0",
      governanceStudy: trail.studyContract,
      governanceAuditTrail: null,
    });
    expect(result.runIssues.some(issue => issue.code === "missing_governance_audit_trail")).toBe(true);
  });

  it("rejects a schema-5 carrier whose runId differs from the audit trail", () => {
    const { trail } = fixture();
    const result = verifyRawRunData("run.json", {
      runId: "run:different",
      rawSchemaVersion: "5.0",
      governanceStudy: trail.studyContract,
      governanceAuditTrail: trail,
    });
    expect(result.runIssues.some(issue => issue.code === "governance_audit_run_mismatch")).toBe(true);
  });

  it("rejects a schema-5 carrier whose governanceStudy differs from the audit study contract", () => {
    const { trail } = fixture();
    const study = structuredClone(trail.studyContract);
    study.version = "1.0.1";
    const result = verifyRawRunData("run.json", {
      runId: trail.runId,
      rawSchemaVersion: "5.0",
      governanceStudy: study,
      governanceAuditTrail: trail,
    });
    expect(result.runIssues.some(issue => issue.code === "governance_audit_study_mismatch")).toBe(true);
  });

  it("rejects a schema-5 study that does not declare swarmalpha.raw-run@5.0.0", () => {
    const { trail } = fixture();
    const carrier = structuredClone(trail);
    carrier.studyContract.artifactSchemaRef = { id: "swarmalpha.raw-run", version: "4.0.0" };
    const result = verifyRawRunData("run.json", {
      runId: carrier.runId,
      rawSchemaVersion: "5.0",
      governanceStudy: carrier.studyContract,
      governanceAuditTrail: carrier,
    });
    expect(result.runIssues.some(issue => issue.code === "governance_audit_schema_ref_mismatch")).toBe(true);
  });

  it("rejects an open audit trail as a successful schema-5 carrier", () => {
    const { trail } = fixture();
    const open = structuredClone(trail);
    open.status = "open";
    delete open.sealedAt;
    const result = verifyRawRunData("run.json", {
      runId: open.runId,
      rawSchemaVersion: "5.0",
      governanceStudy: open.studyContract,
      governanceAuditTrail: open,
    });
    expect(result.governanceAuditStatus).toBe("open_structural_replay_verified");
    expect(result.runIssues.some(issue => issue.code === "unsealed_governance_audit_trail")).toBe(true);
  });

  it("keeps an exploratory schema-5 carrier at sealed structural replay without claiming decision replay", () => {
    const { trail } = fixture();
    const result = verifyRawRunData("run.json", schema5Carrier(trail));
    expect(result.runIssues).toEqual([]);
    expect(result.governanceAuditStatus).toBe("sealed_structural_replay_verified");
    expect(result.governanceAuditStatus).not.toMatch(/decision_replay_verified/);
  });

  it("blocks decision replay when the rule registry is missing, extra, wrong-versioned, or config-mismatched", () => {
    const { trail, rule } = fixture();
    const extraRule: GovernanceEligibilityRule = {
      id: "swarmalpha.rule.unrelated",
      version: "1.0.0",
      config: {},
      evaluate() {
        return {
          ruleRef: { id: "swarmalpha.rule.unrelated", version: "1.0.0" },
          eligible: false,
          reason: "unrelated rule",
          sourceDiagnosisIds: [],
        };
      },
    };

    expect(() => replayGovernanceAuditTrailDecisions(trail, []))
      .toThrow("decision replay rules must exactly match the study policy");
    expect(() => replayGovernanceAuditTrailDecisions(trail, [rule, extraRule]))
      .toThrow("decision replay rules must exactly match the study policy");
    expect(() => replayGovernanceAuditTrailDecisions(trail, [{ ...rule, version: "1.0.1" }]))
      .toThrow("decision replay rules must exactly match the study policy");
    expect(() => replayGovernanceAuditTrailDecisions(trail, [{
      ...rule,
      config: {
        ...rule.config,
        certaintyThresholdPolicy: {
          ...(rule.config.certaintyThresholdPolicy as Record<string, unknown>),
          bounds: { lower: 0.95 },
        },
      },
    }]))
      .toThrow("decision replay rule config does not match the audit snapshot");
  });

  it("blocks confirmatory decision replay at the carrier when the provided registry mismatches", () => {
    const { trail, rule } = fixture();
    const confirmatory = structuredClone(trail);
    confirmatory.studyContract.inferenceIntent = "confirmatory";
    confirmatory.studyContract.preregistrationRef = PREREGISTRATION;
    confirmatory.studyContract.frozenAt = "2026-08-09T00:00:00.000Z";
    confirmatory.studyContract.primaryAssignmentUnit = "run";
    confirmatory.studyContract.primaryAssignmentDesign = auditPrimaryDesign();
    const raw = {
      runId: confirmatory.runId,
      rawSchemaVersion: "5.0",
      governanceStudy: confirmatory.studyContract,
      governanceAuditTrail: confirmatory,
    };
    const result = verifyRawRunData("run.json", raw, {
      governanceRules: [{ ...rule, version: "1.0.1" }],
    });
    expect(result.runIssues.some(issue => issue.code === "malformed_governance_audit_trail")).toBe(true);
  });

  it("rejects action instances whose expectedCost differs from the final decision", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    tampered.actionInstances[0].expectedCost.modelCalls = 99;
    expect(() => validateGovernanceAuditTrail(tampered)).toThrow("does not match a decision action");
  });

  it("rejects action instances whose actionRef differs from the final decision", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    tampered.actionInstances[0].actionRef = { id: "swarmalpha.action.wrong", version: "1.0.0" };
    expect(() => validateGovernanceAuditTrail(tampered)).toThrow("does not match a decision action");
  });

  it("rejects action instances whose targetIds differ from the final decision", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    tampered.actionInstances[0].targetIds = ["agent:other"];
    expect(() => validateGovernanceAuditTrail(tampered)).toThrow("does not match a decision action");
  });

  it("rejects a sealed trail where one assignment has multiple closing decisions", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    const final = tampered.decisions.find((decision: GovernanceDecisionRecord) => decision.assignment);
    if (!final) throw new Error("fixture missing final decision");
    tampered.decisions.push({ ...structuredClone(final), id: "decision:final-clone" });
    expect(() => validateGovernanceAuditTrail(tampered))
      .toThrow("exactly one decision closing each assignment");
  });

  it("rejects a sealed trail whose selected action has no action instance", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    tampered.actionInstances = [];
    tampered.actionTransitions = [];
    expect(() => validateGovernanceAuditTrail(tampered)).toThrow("action-instance cardinality mismatch");
  });

  it("rejects a sealed trail whose action never reached a terminal state", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    tampered.actionTransitions = tampered.actionTransitions.filter(t => t.to !== "completed");
    expect(() => validateGovernanceAuditTrail(tampered)).toThrow("non-terminal action");
  });

  it("rejects an observation supported by a future source event", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    const source = tampered.sourceEvents[0];
    source.round = 5;
    source.contentHash = computeGovernanceSourceEventHash({
      eventRef: source.eventRef,
      kind: source.kind,
      round: 5,
      payload: source.payload,
    });
    expect(() => validateGovernanceAuditTrail(tampered))
      .toThrow("governanceObservation cannot use a future source event");
  });

  it("rejects a lifecycle transition supported by a future source event", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    const futureBase = {
      eventRef: { id: "swarmalpha.event.delivery", version: "1.0.0" },
      kind: "tool_result" as const,
      round: 9,
      payload: { note: "future" },
    };
    tampered.sourceEvents.push({
      id: "event:future",
      ...futureBase,
      contentHash: computeGovernanceSourceEventHash(futureBase),
      recordedAt: "2026-08-09T00:00:09.000Z",
    });
    const transition = tampered.actionTransitions.find(t => t.round === 2);
    if (!transition) throw new Error("fixture missing round-2 transition");
    transition.sourceEventIds = ["event:future"];
    expect(() => validateGovernanceAuditTrail(tampered))
      .toThrow("governance action transition cannot use a future source event");
  });

  it("treats censored as an explicit terminal state distinct from completed and failed", () => {
    const { trail } = fixture();
    const censored = structuredClone(trail);
    const last = censored.actionTransitions[censored.actionTransitions.length - 1];
    last.to = "censored";
    last.observation = { censoredAtRound: 4, reason: "observation window abandoned" };
    expect(censored.actionTransitions.some(t => t.to === "censored")).toBe(true);
    expect(validateGovernanceAuditTrail(censored).status).toBe("sealed_structural_replay_verified");
  });

  it("requires an explicit censoring observation for a censored transition", () => {
    const { trail } = fixture();
    const censored = structuredClone(trail);
    const last = censored.actionTransitions[censored.actionTransitions.length - 1];
    last.to = "censored";
    delete last.observation;
    expect(() => validateGovernanceAuditTrail(censored))
      .toThrow("censored action transition must record censoring observation");
  });
});

describe("schema 5 finalOutcome and taskOutcome adversarial carriers", () => {
  it("emits stable missing finalOutcome and taskOutcome codes", () => {
    const { trail } = fixture();
    const outcome = scoredFinalOutcomeCarrier(trail.runId);
    const withoutFinal = verifyRawRunData("run.json", {
      runId: trail.runId,
      rawSchemaVersion: "5.0",
      governanceStudy: trail.studyContract,
      governanceAuditTrail: trail,
      taskOutcome: outcome.taskOutcome,
    });
    expect(withoutFinal.runIssues.some(issue => issue.code === "missing_final_outcome")).toBe(true);

    const withoutTask = verifyRawRunData("run.json", {
      runId: trail.runId,
      rawSchemaVersion: "5.0",
      governanceStudy: trail.studyContract,
      governanceAuditTrail: trail,
      finalOutcome: outcome.artifact,
    });
    expect(withoutTask.runIssues.some(issue => issue.code === "missing_task_outcome")).toBe(true);

    const malformedTask = scoredFinalOutcomeCarrier(trail.runId);
    malformedTask.taskOutcome.cost = { totalTokens: -1 };
    const malformedTaskResult = verifyRawRunData("run.json", schema5Carrier(trail, malformedTask));
    expect(malformedTaskResult.runIssues.some(issue => issue.code === "malformed_task_outcome")).toBe(true);
  });

  it("emits a stable error for malformed or cross-run finalOutcome artifacts", () => {
    const { trail } = fixture();
    const malformedCarrier = schema5Carrier(trail);
    malformedCarrier.finalOutcome.claimOutcomes[0].pooledProperLoss = 0;
    const malformedResult = verifyRawRunData("run.json", malformedCarrier);
    expect(malformedResult.runIssues.some(issue => issue.code === "malformed_final_outcome")).toBe(true);

    const crossRun = scoredFinalOutcomeCarrier("run:different");
    const crossRunResult = verifyRawRunData("run.json", {
      runId: trail.runId,
      rawSchemaVersion: "5.0",
      governanceStudy: trail.studyContract,
      governanceAuditTrail: trail,
      finalOutcome: crossRun.artifact,
      taskOutcome: crossRun.taskOutcome,
    });
    expect(crossRunResult.runIssues.some(issue => issue.code === "final_outcome_run_mismatch")).toBe(true);
  });

  it("binds schema-5 taskOutcome to the final measurement source and projection", () => {
    const { trail } = fixture();

    const wrongSource = scoredFinalOutcomeCarrier(trail.runId);
    wrongSource.taskOutcome.sourceFinalOutcomeRef!.runId = "run:other";
    const sourceResult = verifyRawRunData("run.json", schema5Carrier(trail, wrongSource));
    expect(sourceResult.runIssues.some(issue => issue.code === "task_outcome_final_source_mismatch")).toBe(true);

    const wrongEvaluation = scoredFinalOutcomeCarrier(trail.runId);
    wrongEvaluation.taskOutcome.evaluationContractRef = { id: "swarmalpha.eval.wrong", version: "1.0.0" };
    const evaluationResult = verifyRawRunData("run.json", schema5Carrier(trail, wrongEvaluation));
    expect(evaluationResult.runIssues.some(issue => issue.code === "task_outcome_final_evaluation_mismatch")).toBe(true);

    const wrongProjection = scoredFinalOutcomeCarrier(trail.runId);
    wrongProjection.taskOutcome.quality = 0;
    const projectionResult = verifyRawRunData("run.json", schema5Carrier(trail, wrongProjection));
    expect(projectionResult.runIssues.some(issue => issue.code === "task_outcome_final_projection_mismatch")).toBe(true);
  });
});

describe("schema 5 operational primary-outcome authority", () => {
  it("requires both the pre-assignment analysis unit and operational outcome", () => {
    const { trail } = fixture();
    const withoutUnit = schema5Carrier(trail);
    delete (withoutUnit as Partial<typeof withoutUnit>).operationalAnalysisUnit;
    const missingUnit = verifyRawRunData("run.json", withoutUnit);
    expect(missingUnit.runIssues.some(issue => issue.code === "missing_operational_analysis_unit"))
      .toBe(true);

    const withoutOutcome = schema5Carrier(trail);
    delete (withoutOutcome as Partial<typeof withoutOutcome>).operationalOutcome;
    const missingOutcome = verifyRawRunData("run.json", withoutOutcome);
    expect(missingOutcome.runIssues.some(issue => issue.code === "missing_operational_outcome"))
      .toBe(true);
  });

  it("emits stable malformed and run-mismatch issues", () => {
    const { trail } = fixture();
    const malformedUnit = schema5Carrier(trail);
    malformedUnit.operationalAnalysisUnit.contentHash = `sha256:${"f".repeat(64)}`;
    const malformedResult = verifyRawRunData("run.json", malformedUnit);
    expect(malformedResult.runIssues.some(issue => issue.code === "malformed_operational_analysis_unit"))
      .toBe(true);

    const wrongRun = schema5Carrier(trail);
    wrongRun.operationalOutcome.runId = "run:other";
    const { contentHash: _old, ...body } = wrongRun.operationalOutcome;
    wrongRun.operationalOutcome.contentHash = computeOperationalOutcomeArtifactHashV1(body);
    const wrongRunResult = verifyRawRunData("run.json", wrongRun);
    expect(wrongRunResult.runIssues.some(issue => issue.code === "operational_outcome_run_mismatch"))
      .toBe(true);
  });

  it("distinguishes source, primary-estimand, and deterministic replay mismatch", () => {
    const { trail } = fixture();
    const sourceMismatch = schema5Carrier(trail);
    sourceMismatch.operationalOutcome.sourceFinalOutcomeHash = `sha256:${"e".repeat(64)}`;
    let { contentHash: _old, ...body } = sourceMismatch.operationalOutcome;
    sourceMismatch.operationalOutcome.contentHash = computeOperationalOutcomeArtifactHashV1(body);
    const sourceResult = verifyRawRunData("run.json", sourceMismatch);
    expect(sourceResult.runIssues.some(issue => issue.code === "operational_outcome_source_mismatch"))
      .toBe(true);

    const wrongEstimand = schema5Carrier(trail);
    wrongEstimand.operationalOutcome.primaryMetric.metricRef = {
      id: "swarmalpha.estimand.wrong",
      version: "1.0.0",
    };
    ({ contentHash: _old, ...body } = wrongEstimand.operationalOutcome);
    wrongEstimand.operationalOutcome.contentHash = computeOperationalOutcomeArtifactHashV1(body);
    const estimandResult = verifyRawRunData("run.json", wrongEstimand);
    expect(estimandResult.runIssues.some(issue => issue.code === "operational_primary_estimand_mismatch"))
      .toBe(true);

    const replayMismatch = schema5Carrier(trail);
    replayMismatch.operationalOutcome.claimOutcome.contributions[0].value = {
      kind: "binary",
      probability: 0.1,
    };
    ({ contentHash: _old, ...body } = replayMismatch.operationalOutcome);
    replayMismatch.operationalOutcome.contentHash = computeOperationalOutcomeArtifactHashV1(body);
    const replayResult = verifyRawRunData("run.json", replayMismatch);
    expect(replayResult.runIssues.some(issue => issue.code === "operational_outcome_replay_mismatch"))
      .toBe(true);
  });
});

describe("CC-4A normalized randomization, time causality, and builder", () => {
  function makeBuilder(trail: GovernanceAuditTrail): GovernanceAuditTrailBuilder {
    return new GovernanceAuditTrailBuilder({
      runId: trail.runId,
      studyContract: trail.studyContract,
      ruleSnapshots: trail.ruleSnapshots,
      interventionContracts: trail.interventionContracts,
      createdAt: trail.createdAt,
    });
  }

  function fullBatch(trail: GovernanceAuditTrail): GovernanceAuditAppendBatch {
    return {
      sourceEvents: trail.sourceEvents,
      observations: trail.observations,
      diagnoses: trail.diagnoses,
      decisions: trail.decisions,
      eventAssignments: trail.eventAssignments,
      actionInstances: trail.actionInstances,
      actionTransitions: trail.actionTransitions,
    };
  }

  // ── A. normalized randomization unit ──────────────────────────────────────

  it("derives eligible-event unit ids from runId + eligibilityDecisionId, not caller choice", () => {
    expect(deriveGovernanceAssignmentUnitId({
      runId: "run:audit-fixture",
      unitKind: "eligible_event",
      eligibilityDecisionId: "decision:eligibility",
    })).toBe("run:audit-fixture:eligible:decision:eligibility");
    expect(deriveGovernanceAssignmentUnitId({
      runId: "run:audit-fixture",
      unitKind: "run",
      eligibilityDecisionId: "decision:eligibility",
    })).toBe("run:audit-fixture");
    const { trail } = fixture();
    expect(trail.eventAssignments[0].unitId)
      .toBe("run:audit-fixture:eligible:decision:eligibility");
  });

  it("rejects a unitId tamper even after a self-consistent seed/draw recomputation", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    const assignment = tampered.eventAssignments[0];
    assignment.unitId = "run:evil:eligible:decision:eligibility";
    assignment.derivedSeed = deriveGovernanceAssignmentSeed(assignment);
    assignment.randomDraw = mulberry32(assignment.derivedSeed)();
    let cumulative = 0;
    const selected = assignment.arms.find(arm => {
      cumulative += arm.probability;
      return assignment.randomDraw < cumulative;
    }) ?? assignment.arms[assignment.arms.length - 1];
    assignment.assignedArm = selected.id;
    assignment.assignmentProbability = selected.probability;
    const finalDecision = tampered.decisions.find(decision => decision.assignment);
    if (!finalDecision?.assignment) throw new Error("fixture missing final decision");
    finalDecision.assignment.assignedArm = assignment.assignedArm;
    finalDecision.assignment.assignmentProbability = assignment.assignmentProbability;

    expect(() => validateGovernanceAuditTrail(tampered))
      .toThrow("governanceEventAssignment unitId is not canonically derived");
  });

  it("keeps run-level draws fixed across candidate-set changes but binds eligible-event draws to the candidate set", () => {
    const base = {
      masterSeed: 1,
      unitId: "run:audit-fixture",
      policyRef: { id: "swarmalpha.policy.audit-fixture", version: "1.0.0" },
      assignmentDesignRef: { id: "swarmalpha.assignment.audit-fixture", version: "1.0.0" },
      actionRef: { id: VERIFICATION_REQUEST_V2.id, version: VERIFICATION_REQUEST_V2.version },
      seedNamespace: "test:audit-fixture",
      arms: [
        { id: "apply", probability: 0.5 },
        { id: "holdout", probability: 0.5 },
      ],
    };
    const runSeedA = deriveGovernanceAssignmentSeed({
      ...base, unitKind: "run" as const, candidateSetHash: "sha256:" + "a".repeat(64),
    });
    const runSeedB = deriveGovernanceAssignmentSeed({
      ...base, unitKind: "run" as const, candidateSetHash: "sha256:" + "b".repeat(64),
    });
    expect(runSeedA).toBe(runSeedB);
    expect(mulberry32(runSeedA)()).toBe(mulberry32(runSeedB)());

    const eventSeedA = deriveGovernanceAssignmentSeed({
      ...base, unitKind: "eligible_event" as const, candidateSetHash: "sha256:" + "a".repeat(64),
    });
    const eventSeedB = deriveGovernanceAssignmentSeed({
      ...base, unitKind: "eligible_event" as const, candidateSetHash: "sha256:" + "b".repeat(64),
    });
    expect(eventSeedA).not.toBe(eventSeedB);
  });

  it("binds eligible-event draws to a new unit identity when the eligibility decision changes", () => {
    const unitA = deriveGovernanceAssignmentUnitId({
      runId: "run:x", unitKind: "eligible_event", eligibilityDecisionId: "decision:a",
    });
    const unitB = deriveGovernanceAssignmentUnitId({
      runId: "run:x", unitKind: "eligible_event", eligibilityDecisionId: "decision:b",
    });
    expect(unitA).not.toBe(unitB);
    const base = {
      masterSeed: 1,
      unitKind: "eligible_event" as const,
      policyRef: { id: "swarmalpha.policy.audit-fixture", version: "1.0.0" },
      assignmentDesignRef: { id: "swarmalpha.assignment.audit-fixture", version: "1.0.0" },
      actionRef: { id: VERIFICATION_REQUEST_V2.id, version: VERIFICATION_REQUEST_V2.version },
      seedNamespace: "test:audit-fixture",
      arms: [
        { id: "apply", probability: 0.5 },
        { id: "holdout", probability: 0.5 },
      ],
    };
    const seedA = deriveGovernanceAssignmentSeed({
      ...base, unitId: unitA, candidateSetHash: "sha256:" + "a".repeat(64),
    });
    const seedB = deriveGovernanceAssignmentSeed({
      ...base, unitId: unitB, candidateSetHash: "sha256:" + "b".repeat(64),
    });
    expect(seedA).not.toBe(seedB);
  });

  it("changes the seed commitment when actionRef, seedNamespace, probabilities, or arm order change", () => {
    const base = {
      masterSeed: 1,
      unitKind: "eligible_event" as const,
      unitId: "run:x:eligible:decision:y",
      policyRef: { id: "swarmalpha.policy.audit-fixture", version: "1.0.0" },
      assignmentDesignRef: { id: "swarmalpha.assignment.audit-fixture", version: "1.0.0" },
      actionRef: { id: VERIFICATION_REQUEST_V2.id, version: VERIFICATION_REQUEST_V2.version },
      seedNamespace: "test:audit-fixture",
      arms: [
        { id: "apply", probability: 0.5 },
        { id: "holdout", probability: 0.5 },
      ],
      candidateSetHash: "sha256:" + "a".repeat(64),
    };
    const reference = deriveGovernanceAssignmentSeed(base);
    expect(deriveGovernanceAssignmentSeed({
      ...base, actionRef: { id: "swarmalpha.action.other", version: "1.0.0" },
    })).not.toBe(reference);
    expect(deriveGovernanceAssignmentSeed({ ...base, seedNamespace: "test:other" })).not.toBe(reference);
    expect(deriveGovernanceAssignmentSeed({
      ...base, arms: [
        { id: "apply", probability: 0.6 },
        { id: "holdout", probability: 0.4 },
      ],
    })).not.toBe(reference);
    expect(deriveGovernanceAssignmentSeed({
      ...base, arms: [
        { id: "holdout", probability: 0.5 },
        { id: "apply", probability: 0.5 },
      ],
    })).not.toBe(reference);
  });

  it("does not accept a caller-chosen unit id, so a unit cannot be redrawn to a preferred arm", () => {
    const { trail } = fixture();
    const eligibility = trail.decisions.find(decision => decision.outcome === "awaiting_assignment");
    if (!eligibility || !trail.studyContract.governancePolicy) throw new Error("fixture missing eligibility");
    // createGovernanceEventAssignment takes runId (not unitId); the unitId is derived canonically.
    const assignment = createGovernanceEventAssignment({
      id: "assignment:redraw-probe",
      runId: trail.runId,
      unitKind: "eligible_event",
      eligibilityDecision: eligibility,
      policy: trail.studyContract.governancePolicy,
      masterSeed: 12345,
      assignedAt: "2026-08-09T00:00:03.000Z",
    });
    expect(assignment.unitId).toBe(deriveGovernanceAssignmentUnitId({
      runId: trail.runId,
      unitKind: "eligible_event",
      eligibilityDecisionId: assignment.eligibilityDecisionId,
    }));
    // No loop over unit ids can select an arm; any redraw loop would have to change
    // masterSeed, which the audit validator does not treat as a production pattern.
    // (Production redraw by changing masterSeed is explicitly forbidden; the fixture's
    // own masterSeed loop exists only to synthesize a deterministic apply draw.)
  });

  // ── B. time/causal constraints ────────────────────────────────────────────

  it("rejects an observation observed before its source event", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    tampered.sourceEvents[0].recordedAt = "2026-08-09T00:00:02.000Z";
    expect(() => validateGovernanceAuditTrail(tampered))
      .toThrow("governanceObservation.observedAt must not precede its source event");
  });

  it("rejects a diagnosis created before its source observation", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    tampered.diagnoses[0].createdAt = "2026-08-09T00:00:00.500Z";
    expect(() => validateGovernanceAuditTrail(tampered))
      .toThrow("governanceDiagnosis.createdAt must not precede its source observation");
  });

  it("rejects a decision that references a future source event, observation, or diagnosis", () => {
    const { trail } = fixture();

    const futureEvent = structuredClone(trail);
    const eventBase = {
      eventRef: { id: "swarmalpha.event.future", version: "1.0.0" },
      kind: "tool_result" as const,
      round: 9,
      payload: { note: "future event" },
    };
    futureEvent.sourceEvents.push({
      id: "event:future",
      ...eventBase,
      contentHash: computeGovernanceSourceEventHash(eventBase),
      recordedAt: "2026-08-09T00:00:09.000Z",
    });
    futureEvent.decisions[0].sourceEventIds = [...futureEvent.decisions[0].sourceEventIds, "event:future"];
    expect(() => validateGovernanceAuditTrail(futureEvent))
      .toThrow("governanceDecision cannot use a future source record");

    const futureObservation = structuredClone(trail);
    futureObservation.observations.push({
      id: "observation:future",
      observationRef: { id: "swarmalpha.observation.future", version: "1.0.0" },
      round: 9,
      subjectIds: ["agent:a1"],
      completeness: "complete",
      missingFields: [],
      values: { probability: 0.5 },
      sourceEventIds: [trail.sourceEvents[0].id],
      observedAt: "2026-08-09T00:00:09.000Z",
    });
    futureObservation.decisions[0].sourceEventIds = [
      ...futureObservation.decisions[0].sourceEventIds, "observation:future",
    ];
    expect(() => validateGovernanceAuditTrail(futureObservation))
      .toThrow("governanceDecision cannot use a future source record");

    const futureDiagnosis = structuredClone(trail);
    futureDiagnosis.diagnoses.push({
      ...structuredClone(trail.diagnoses[0]),
      id: "diagnosis:future",
      round: 9,
      createdAt: "2026-08-09T00:00:09.000Z",
    });
    futureDiagnosis.decisions[0].sourceEventIds = [
      ...futureDiagnosis.decisions[0].sourceEventIds, "diagnosis:future",
    ];
    expect(() => validateGovernanceAuditTrail(futureDiagnosis))
      .toThrow("governanceDecision cannot use a future source record");
  });

  it("rejects an assignment recorded before its eligibility decision", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    tampered.eventAssignments[0].assignedAt = "2026-08-09T00:00:01.500Z";
    expect(() => validateGovernanceAuditTrail(tampered))
      .toThrow("governanceEventAssignment.assignedAt must not precede its eligibility decision");
  });

  it("rejects a closing decision recorded before its assignment", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    const final = tampered.decisions.find(decision => decision.assignment);
    if (!final) throw new Error("fixture missing final decision");
    final.decidedAt = "2026-08-09T00:00:02.500Z";
    expect(() => validateGovernanceAuditTrail(tampered))
      .toThrow("closing governanceDecision.decidedAt must not precede its assignment");
  });

  it("rejects an action window that starts before its decision round", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    tampered.actionInstances[0].plannedWindow = { startRound: 1, endRound: 4 };
    expect(() => validateGovernanceAuditTrail(tampered))
      .toThrow("governance action window cannot start before its decision round");
  });

  it("rejects an action instance created before its decision", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    tampered.actionInstances[0].createdAt = "2026-08-09T00:00:03.250Z";
    expect(() => validateGovernanceAuditTrail(tampered))
      .toThrow("governance action createdAt must not precede its decision");
  });

  it("rejects a lifecycle transition that precedes its decision round", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    const first = tampered.actionTransitions.find(t => t.from === null);
    if (!first) throw new Error("fixture missing initial transition");
    first.round = 1;
    expect(() => validateGovernanceAuditTrail(tampered))
      .toThrow("governance action transition cannot precede its decision round");
  });

  it("rejects a transition recorded before its action instance was created", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    const first = tampered.actionTransitions.find(t => t.from === null);
    if (!first) throw new Error("fixture missing initial transition");
    first.occurredAt = "2026-08-09T00:00:03.900Z";
    expect(() => validateGovernanceAuditTrail(tampered))
      .toThrow("governance action transition occurredAt must not precede its action instance");
  });

  it("rejects a seal timestamp that precedes recorded entities", () => {
    const { trail } = fixture();
    const tampered = structuredClone(trail);
    tampered.sealedAt = "2026-08-09T00:00:09.000Z";
    expect(() => validateGovernanceAuditTrail(tampered))
      .toThrow("must not follow governanceAuditTrail.sealedAt");
  });

  // ── C. GovernanceAuditTrailBuilder ────────────────────────────────────────

  it("rolls back the whole batch and preserves the prior snapshot when a record is corrupted", () => {
    const { trail } = fixture();
    const builder = makeBuilder(trail);
    const before = builder.snapshot();
    const corrupted = structuredClone(trail);
    corrupted.sourceEvents[0].payload.probability = 0.2; // breaks content hash
    expect(() => builder.commit({
      sourceEvents: corrupted.sourceEvents,
      observations: corrupted.observations,
      diagnoses: corrupted.diagnoses,
      decisions: corrupted.decisions,
      eventAssignments: corrupted.eventAssignments,
      actionInstances: corrupted.actionInstances,
      actionTransitions: corrupted.actionTransitions,
    })).toThrow("contentHash does not match");
    expect(builder.snapshot()).toEqual(before);
  });

  it("rejects an empty commit batch", () => {
    const { trail } = fixture();
    const builder = makeBuilder(trail);
    expect(() => builder.commit({})).toThrow("must be non-empty");
  });

  it("keeps builder state isolated from snapshot mutations", () => {
    const { trail } = fixture();
    const builder = makeBuilder(trail);
    const snap = builder.snapshot();
    snap.studyContract.version = "9.9.9";
    snap.ruleSnapshots = [];
    expect(builder.snapshot().studyContract.version).toBe(trail.studyContract.version);
    builder.commit({ sourceEvents: trail.sourceEvents });
    expect(builder.snapshot().sourceEvents).toHaveLength(1);
    expect(builder.snapshot().studyContract.version).toBe(trail.studyContract.version);
  });

  it("rejects a second seal after the trail is already sealed", () => {
    const { trail } = fixture();
    const builder = makeBuilder(trail);
    builder.commit(fullBatch(trail));
    builder.seal(trail.sealedAt!);
    expect(() => builder.seal("2026-08-09T00:00:12.000Z"))
      .toThrow("sealed governance audit trail is immutable");
  });

  it("refuses to seal a trail with an unassigned eligible decision", () => {
    const { trail } = fixture();
    const builder = makeBuilder(trail);
    builder.commit({
      sourceEvents: trail.sourceEvents,
      observations: trail.observations,
      diagnoses: trail.diagnoses,
      decisions: trail.decisions.filter(decision => decision.outcome === "awaiting_assignment"),
    });
    expect(() => builder.seal(trail.sealedAt!))
      .toThrow("unassigned eligible decision");
  });

  it("refuses to seal a trail with a non-terminal action", () => {
    const { trail } = fixture();
    const builder = makeBuilder(trail);
    builder.commit({
      sourceEvents: trail.sourceEvents,
      observations: trail.observations,
      diagnoses: trail.diagnoses,
      decisions: trail.decisions,
      eventAssignments: trail.eventAssignments,
      actionInstances: trail.actionInstances,
      actionTransitions: trail.actionTransitions
        .filter(t => ["proposed", "eligible", "assigned"].includes(t.to)),
    });
    expect(() => builder.seal(trail.sealedAt!)).toThrow("non-terminal action");
  });

  it("accepts one batch that introduces the full source-to-eligibility chain", () => {
    const { trail } = fixture();
    const builder = makeBuilder(trail);
    builder.commit({
      sourceEvents: trail.sourceEvents,
      observations: trail.observations,
      diagnoses: trail.diagnoses,
      decisions: trail.decisions.filter(decision => decision.outcome === "awaiting_assignment"),
    });
    const snap = builder.snapshot();
    expect(snap.sourceEvents).toHaveLength(1);
    expect(snap.observations).toHaveLength(1);
    expect(snap.diagnoses).toHaveLength(1);
    expect(snap.decisions).toHaveLength(1);
    expect(snap.decisions[0].outcome).toBe("awaiting_assignment");
    expect(validateGovernanceAuditTrail(snap).status).toBe("open_structural_replay_verified");
  });

  it("builds the complete chain in one batch and seals it", () => {
    const { trail } = fixture();
    const builder = makeBuilder(trail);
    builder.commit(fullBatch(trail));
    const sealed = builder.seal(trail.sealedAt!);
    expect(validateGovernanceAuditTrail(sealed).status).toBe("sealed_structural_replay_verified");
    // The builder provides in-process batch atomicity only. It does not provide
    // durable-storage atomicity or external authenticity; those are out of scope.
    expect(builder.snapshot().status).toBe("sealed");
  });
});

describe("F5 schema-5 single treatment authority", () => {
  it("emits missing_primary_assignment_manifest when the Stage-1 manifest is absent", () => {
    const { trail } = fixture();
    const raw = schema5Carrier(trail);
    delete (raw as Record<string, unknown>).primaryAssignmentManifest;
    const result = verifyRawRunData("run.json", raw);
    expect(result.runIssues.some(issue => issue.code === "missing_primary_assignment_manifest")).toBe(true);
  });

  it("emits missing_primary_arm_execution_registry when the registry is absent", () => {
    const { trail } = fixture();
    const raw = schema5Carrier(trail);
    delete (raw as Record<string, unknown>).primaryArmExecutionRegistry;
    const result = verifyRawRunData("run.json", raw);
    expect(result.runIssues.some(issue => issue.code === "missing_primary_arm_execution_registry")).toBe(true);
  });

  it("emits missing_primary_arm_execution_binding when the binding is absent", () => {
    const { trail } = fixture();
    const raw = schema5Carrier(trail);
    delete (raw as Record<string, unknown>).primaryArmExecution;
    const result = verifyRawRunData("run.json", raw);
    expect(result.runIssues.some(issue => issue.code === "missing_primary_arm_execution_binding")).toBe(true);
  });

  it("emits malformed_primary_assignment_chain for a tampered execution binding", () => {
    const { trail } = fixture();
    const raw = schema5Carrier(trail);
    raw.primaryArmExecution.implementationConfig = { protocol: "forged" };
    const result = verifyRawRunData("run.json", raw);
    expect(result.runIssues.some(issue => issue.code === "malformed_primary_assignment_chain")).toBe(true);
  });

  it("emits primary_assignment_run_mismatch when the carrier runId differs from the Stage-1 chain", () => {
    const { trail } = fixture();
    const raw = { ...schema5Carrier(trail), runId: "run:other" };
    const result = verifyRawRunData("run.json", raw);
    expect(result.runIssues.some(issue => issue.code === "primary_assignment_run_mismatch")).toBe(true);
  });

  it("emits primary_assignment_study_mismatch for a self-consistent registry from another study", () => {
    const { trail } = fixture();
    const raw = schema5Carrier(trail);
    const design = raw.governanceStudy.primaryAssignmentDesign!;
    const manifest = raw.primaryAssignmentManifest;
    const foreignRegistry = createPrimaryArmExecutionRegistryV1({
      studyRef: { id: "study:other", version: "1.0.0" },
      design,
      entries: [
        {
          armRef: design.arms[0].armRef,
          implementationRef: design.arms[0].implementationRef,
          implementationConfig: PRIMARY_IMPLEMENTATIONS.text,
          budgetContractRef: design.arms[0].budgetContractRef,
          budgetContract: PRIMARY_IMPLEMENTATIONS.budget,
        },
        {
          armRef: design.arms[1].armRef,
          implementationRef: design.arms[1].implementationRef,
          implementationConfig: PRIMARY_IMPLEMENTATIONS.epistemic,
          budgetContractRef: design.arms[1].budgetContractRef,
          budgetContract: PRIMARY_IMPLEMENTATIONS.budget,
        },
      ],
    });
    const entry = foreignRegistry.entries.find(
      candidate => candidate.armRef.id === manifest.assignment.assignedArmRef.id,
    )!;
    const body = {
      artifactType: "swarmalpha.primary-arm-execution-binding" as const,
      schemaVersion: "1.0.0" as const,
      runId: manifest.runId,
      studyRef: manifest.studyRef,
      assignmentId: manifest.assignment.id,
      primaryAssignmentManifestHash: manifest.contentHash,
      registryHash: foreignRegistry.contentHash,
      assignedArmRef: manifest.assignment.assignedArmRef,
      assignmentProbability: manifest.assignment.assignmentProbability,
      implementationRef: entry.implementationRef,
      implementationConfig: entry.implementationConfig,
      implementationConfigHash: entry.implementationConfigHash,
      budgetContractRef: entry.budgetContractRef,
      budgetContract: entry.budgetContract,
      budgetContractHash: entry.budgetContractHash,
      resolvedAt: "2026-08-09T00:00:00.000Z",
    };
    const foreignBinding: PrimaryArmExecutionBindingV1 = {
      ...body,
      contentHash: computePrimaryArmExecutionBindingHash(body),
    };
    const result = verifyRawRunData("run.json", {
      ...raw,
      primaryArmExecutionRegistry: foreignRegistry,
      primaryArmExecution: foreignBinding,
    });
    expect(result.runIssues.some(issue => issue.code === "primary_assignment_study_mismatch")).toBe(true);
  });

  it("emits task_outcome_primary_assignment_mismatch when taskOutcome references another assignment", () => {
    const { trail } = fixture();
    const raw = schema5Carrier(trail);
    raw.taskOutcome = { ...raw.taskOutcome, runAssignmentId: "assignment:other" };
    const result = verifyRawRunData("run.json", raw);
    expect(result.runIssues.some(issue => issue.code === "task_outcome_primary_assignment_mismatch")).toBe(true);
  });

  it("emits primary_assignment_after_audit_open when the binding is resolved after the audit trail opens", () => {
    const { trail } = fixture();
    const raw = schema5Carrier(trail);
    const { contentHash: _old, ...body } = raw.primaryArmExecution;
    raw.primaryArmExecution = {
      ...body,
      resolvedAt: "2026-08-10T00:00:00.000Z",
      contentHash: computePrimaryArmExecutionBindingHash({
        ...body,
        resolvedAt: "2026-08-10T00:00:00.000Z",
      }),
    };
    const result = verifyRawRunData("run.json", raw);
    expect(result.runIssues.some(issue => issue.code === "primary_assignment_after_audit_open")).toBe(true);
  });

  it("rejects each legacy treatment authority present on schema 5, including empty values", () => {
    const { trail } = fixture();
    for (const [field, value] of [
      ["assignmentManifest", null],
      ["proximalOutcomes", []],
      ["treatmentAssignment", { id: "legacy" }],
      ["applicationReceipts", []],
    ] as const) {
      const raw = { ...schema5Carrier(trail), [field]: value };
      const result = verifyRawRunData("run.json", raw);
      expect(
        result.runIssues.some(issue => issue.code === "schema5_legacy_treatment_authority_present"),
        `expected schema5_legacy for ${field}`,
      ).toBe(true);
    }
  });

  it("keeps schema-4 artifacts readable without the schema-5 single-authority gates", () => {
    const result = verifyRawRunData("run.json", {
      runId: "x",
      rawSchemaVersion: "4.0",
      treatmentAssignment: null,
      assignmentManifest: null,
      applicationReceipts: [],
      proximalOutcomes: [],
    });
    expect(result.schemaVersion).toBe("4.0");
    expect(result.runIssues.some(issue => issue.code === "schema5_legacy_treatment_authority_present")).toBe(false);
    expect(result.runIssues.some(issue => issue.code === "missing_primary_assignment_manifest")).toBe(false);
  });
});

describe("CC-7 schema-5 operational carrier", () => {
  function rehashOperationalOutcome(raw: ReturnType<typeof schema5Carrier>): void {
    const { contentHash: _old, ...body } = raw.operationalOutcome;
    raw.operationalOutcome.contentHash = computeOperationalOutcomeArtifactHashV1(body);
  }

  function operationalIssues(raw: ReturnType<typeof schema5Carrier>) {
    return verifyRawRunData("run.json", raw).runIssues
      .filter(issue => issue.code.startsWith("operational_"));
  }

  // ── CC-7A carrier presence and legacy isolation ──────────────────────────

  it("treats null operational analysis-unit and outcome fields as missing on schema 5", () => {
    const { trail } = fixture();
    const nullUnit = { ...schema5Carrier(trail), operationalAnalysisUnit: null };
    const unitResult = verifyRawRunData("run.json", nullUnit);
    expect(unitResult.runIssues.some(issue => issue.code === "missing_operational_analysis_unit"))
      .toBe(true);

    const nullOutcome = { ...schema5Carrier(trail), operationalOutcome: null };
    const outcomeResult = verifyRawRunData("run.json", nullOutcome);
    expect(outcomeResult.runIssues.some(issue => issue.code === "missing_operational_outcome"))
      .toBe(true);
  });

  it("keeps schema 1-4 artifacts readable without operational issues", () => {
    for (const version of ["1.0", "2.0", "3.0", "4.0"]) {
      const result = verifyRawRunData("run.json", { runId: "x", rawSchemaVersion: version });
      expect(result.runIssues.some(issue => issue.code.startsWith("operational_")),
        `schema ${version} should not emit operational issues`).toBe(false);
    }
  });

  it("does not treat reserved operational fields on schema 4 as schema-5 authority", () => {
    const { trail } = fixture();
    const schema4 = {
      ...schema5Carrier(trail),
      rawSchemaVersion: "4.0",
    };
    const result = verifyRawRunData("run.json", schema4);
    expect(result.schemaVersion).toBe("4.0");
    expect(result.runIssues.some(issue => issue.code.startsWith("operational_"))).toBe(false);
  });

  it("produces no operational issues for a valid schema-5 carrier", () => {
    const { trail } = fixture();
    expect(operationalIssues(schema5Carrier(trail))).toEqual([]);
  });

  it("keeps taskOutcome as the required secondary accuracy projection, not a primary estimand", () => {
    const { trail } = fixture();
    const raw = schema5Carrier(trail);
    expect(raw.taskOutcome.evaluationContractRef).toEqual({
      id: FINAL_OUTCOME_TASK_EVALUATION_V1.id,
      version: FINAL_OUTCOME_TASK_EVALUATION_V1.version,
    });
    // The primary estimand is operational pooled Brier, carried by primaryMetric.
    expect(raw.operationalOutcome.primaryMetric.metricRef).toEqual({
      id: OPERATIONAL_POOLED_BRIER_ESTIMAND_V1.id,
      version: OPERATIONAL_POOLED_BRIER_ESTIMAND_V1.version,
    });
    // taskOutcome is not a legacy treatment authority.
    const result = verifyRawRunData("run.json", raw);
    expect(result.runIssues.some(issue => issue.code === "schema5_legacy_treatment_authority_present"))
      .toBe(false);
  });

  it("still rejects a schema-5 carrier that also carries a legacy treatment authority", () => {
    const { trail } = fixture();
    const raw = { ...schema5Carrier(trail), treatmentAssignment: null };
    const result = verifyRawRunData("run.json", raw);
    expect(result.runIssues.some(issue => issue.code === "schema5_legacy_treatment_authority_present"))
      .toBe(true);
  });

  // ── CC-7B analysis-unit carrier ──────────────────────────────────────────

  it("emits operational_analysis_unit_run_mismatch when the analysis-unit runId drifts", () => {
    const { trail } = fixture();
    const raw = schema5Carrier(trail);
    raw.operationalAnalysisUnit.runId = "run:other";
    const { contentHash: _old, ...unitBody } = raw.operationalAnalysisUnit;
    raw.operationalAnalysisUnit.contentHash = computeOperationalAnalysisUnitHashV1(unitBody);
    const result = verifyRawRunData("run.json", raw);
    expect(result.runIssues.some(issue => issue.code === "operational_analysis_unit_run_mismatch"))
      .toBe(true);
  });

  it("emits malformed_operational_analysis_unit for structural damage without throwing", () => {
    const { trail } = fixture();
    const cases: Array<[string, (unit: OperationalAnalysisUnitV1) => void]> = [
      ["schema ref", unit => { unit.artifactSchemaRef = { id: "swarmalpha.other", version: "1.0.0" }; }],
      ["roster", unit => { unit.expectedAgentIds = ["a", "a"]; }],
      ["claim", unit => { unit.primaryClaim = { id: "", proposition: "", domain: "", createdAt: "x", resolutionPolicy: { kind: "binary", resolverId: "" } }; }],
      ["time", unit => { unit.committedAt = "not-a-date"; }],
      ["contentHash", unit => { unit.contentHash = `sha256:${"f".repeat(64)}`; }],
    ];
    for (const [label, mutate] of cases) {
      const raw = schema5Carrier(trail);
      mutate(raw.operationalAnalysisUnit);
      // verifyRawRunData never throws; a throw here would fail this test.
      const result = verifyRawRunData("run.json", raw);
      expect(result.runIssues.some(issue => issue.code === "malformed_operational_analysis_unit"),
        `expected malformed_operational_analysis_unit for ${label}`).toBe(true);
    }
  });

  it("maps hostile accessor/proxy carriers to verifier_error without throwing", () => {
    const { trail } = fixture();
    const hostile = new Proxy(schema5Carrier(trail), {
      get() { throw new Error("hostile access"); },
    });
    // verifyRawRunData never throws; the hostile access is mapped to verifier_error.
    const result = verifyRawRunData("run.json", hostile);
    expect(result.runIssues.some(issue => issue.code === "verifier_error")).toBe(true);
  });

  // ── CC-7C source binding (self-consistent rehash) ────────────────────────

  it("emits operational_outcome_source_mismatch when any source-binding hash drifts after self-rehash", () => {
    const { trail } = fixture();
    const cases: Array<[string, (raw: ReturnType<typeof schema5Carrier>) => void]> = [
      ["analysisUnitHash", raw => { raw.operationalOutcome.analysisUnitHash = `sha256:${"d".repeat(64)}`; }],
      ["primaryAssignmentManifestHash", raw => { raw.operationalOutcome.primaryAssignmentManifestHash = `sha256:${"c".repeat(64)}`; }],
      ["sourceFinalOutcomeHash", raw => { raw.operationalOutcome.sourceFinalOutcomeHash = `sha256:${"e".repeat(64)}`; }],
    ];
    for (const [label, mutate] of cases) {
      const raw = schema5Carrier(trail);
      mutate(raw);
      rehashOperationalOutcome(raw);
      const result = verifyRawRunData("run.json", raw);
      expect(result.runIssues.some(issue => issue.code === "operational_outcome_source_mismatch"),
        `expected source mismatch for ${label}`).toBe(true);
    }
  });

  // ── CC-7D primary vs secondary authority ─────────────────────────────────

  it("emits operational_primary_estimand_mismatch for missing or malformed primary metric refs", () => {
    const { trail } = fixture();

    const missingRef = schema5Carrier(trail);
    delete (missingRef.operationalOutcome.primaryMetric as { metricRef?: unknown }).metricRef;
    rehashOperationalOutcome(missingRef);
    const missingResult = verifyRawRunData("run.json", missingRef);
    expect(missingResult.runIssues.some(issue => issue.code === "operational_primary_estimand_mismatch"))
      .toBe(true);

    const malformedRef = schema5Carrier(trail);
    malformedRef.operationalOutcome.primaryMetric.metricRef = { id: "", version: "" };
    rehashOperationalOutcome(malformedRef);
    const malformedResult = verifyRawRunData("run.json", malformedRef);
    expect(malformedResult.runIssues.some(issue => issue.code === "operational_primary_estimand_mismatch"))
      .toBe(true);
  });

  it("emits operational_primary_estimand_mismatch when the Stage-1 estimand ref drifts", () => {
    const { trail } = fixture();
    const raw = schema5Carrier(trail);
    // Minimal repro: a drifted Stage-1 estimand ref is read by the operational
    // gate and fails the primary-estimand cross-check. A fully self-consistent
    // drift would require rebuilding the assignment seed/design chain, which is
    // returned to Codex rather than constructed here.
    raw.primaryAssignmentManifest.designSnapshot.primaryEstimandRef = {
      id: "swarmalpha.estimand.other",
      version: "1.0.0",
    };
    const result = verifyRawRunData("run.json", raw);
    expect(result.runIssues.some(issue => issue.code === "operational_primary_estimand_mismatch"))
      .toBe(true);
  });

  // ── CC-7E deterministic replay (self-consistent rehash) ──────────────────

  it("emits operational_outcome_replay_mismatch for every self-rehashed claim-outcome tamper", () => {
    const { trail } = fixture();
    const cases: Array<[string, (raw: ReturnType<typeof schema5Carrier>) => void]> = [
      ["contribution value", raw => { raw.operationalOutcome.claimOutcome.contributions[0].value = { kind: "binary", probability: 0.1 }; }],
      ["contribution source", raw => { raw.operationalOutcome.claimOutcome.contributions[0].valueSource = "reference_distribution"; }],
      ["contribution status", raw => { raw.operationalOutcome.claimOutcome.contributions[0].terminalStatus = "abstained"; }],
      ["terminalStatusCounts", raw => { raw.operationalOutcome.claimOutcome.terminalStatusCounts.answered = 99; }],
      ["registeredAgentCount", raw => { raw.operationalOutcome.claimOutcome.registeredAgentCount = 99; }],
      ["answeredAgentCount", raw => { raw.operationalOutcome.claimOutcome.answeredAgentCount = 99; }],
      ["referenceDistribution", raw => { raw.operationalOutcome.claimOutcome.referenceDistribution = { kind: "binary", probability: 0.1 }; }],
      ["pooledBelief", raw => { raw.operationalOutcome.claimOutcome.pooledBelief = { kind: "binary", probability: 0.99 }; }],
      ["operationalProperLoss", raw => { raw.operationalOutcome.claimOutcome.operationalProperLoss = 0.0; }],
      ["primaryMetric.value", raw => { raw.operationalOutcome.primaryMetric.value = 0.0; }],
      ["primaryMetric.direction", raw => { (raw.operationalOutcome.primaryMetric as { direction: string }).direction = "higher_is_better"; }],
      ["unexpected extra field", raw => { (raw.operationalOutcome as unknown as Record<string, unknown> & { surprise?: unknown }).surprise = 1; }],
    ];
    for (const [label, mutate] of cases) {
      const raw = schema5Carrier(trail);
      mutate(raw);
      rehashOperationalOutcome(raw);
      const result = verifyRawRunData("run.json", raw);
      expect(result.runIssues.some(issue => issue.code === "operational_outcome_replay_mismatch"),
        `expected replay mismatch for ${label}`).toBe(true);
    }
  });

  it("emits malformed_operational_outcome when computedAt precedes final scoring", () => {
    const { trail } = fixture();
    const raw = schema5Carrier(trail);
    raw.operationalOutcome.computedAt = "2026-08-10T00:04:59.000Z";
    rehashOperationalOutcome(raw);
    const result = verifyRawRunData("run.json", raw);
    // The recompute fails the ordering bound, so the issue is structural
    // (malformed) rather than a replay mismatch.
    expect(result.runIssues.some(issue => issue.code === "malformed_operational_outcome"))
      .toBe(true);
  });
});
