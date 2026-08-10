import { describe, expect, it } from "vitest";
import { MINIMAL_EPISTEMIC_GOVERNANCE_POLICY_V2 } from "@/lib/governance";
import {
  FinalOutcomeSession,
  OPERATIONAL_POOLED_BRIER_ESTIMAND_V1,
  PRIMARY_ASSIGNMENT_ALGORITHM_V1,
  computeOperationalAnalysisUnitHashV1,
  computeOperationalOutcomeArtifactHashV1,
  computePrimaryAssignmentManifestHash,
  createFinalElicitationContract,
  createOperationalAnalysisUnitV1,
  createOperationalOutcomeArtifactV1,
  createPrimaryAssignmentManifestV1,
  createPrimaryAssignmentV1,
  deriveOperationalReferenceDistributionV1,
  validateOperationalAnalysisUnitV1,
  validateOperationalOutcomeArtifactV1,
  validateOperationalOutcomeContractV1,
  type FinalOutcomeArtifactV1,
  type GovernanceStudyContract,
  type OperationalAnalysisUnitV1,
  type OperationalOutcomeArtifactV1,
  type PrimaryAssignmentDesignV1,
  type PrimaryAssignmentManifestV1,
} from "@/lib/experimentation";
import type { EpistemicClaim } from "@/lib/epistemic";

const HASH = `sha256:${"a".repeat(64)}`;
const PREREGISTRATION = structuredClone(
  MINIMAL_EPISTEMIC_GOVERNANCE_POLICY_V2.preregistrationRef!,
);

function design(
  estimandRef: { id: string; version: string } = {
    id: OPERATIONAL_POOLED_BRIER_ESTIMAND_V1.id,
    version: OPERATIONAL_POOLED_BRIER_ESTIMAND_V1.version,
  },
): PrimaryAssignmentDesignV1 {
  return {
    id: "swarmalpha.primary-design.operational-outcome-test",
    version: "1.0.0",
    schemaVersion: "1.0.0",
    preregistrationRef: structuredClone(PREREGISTRATION),
    unit: "run",
    assignmentAlgorithmRef: structuredClone(PRIMARY_ASSIGNMENT_ALGORITHM_V1),
    seedNamespace: "swarmalpha.operational-outcome.test.v1",
    arms: [
      {
        armRef: { id: "swarmalpha.arm.text", version: "1.0.0" },
        allocationProbability: 0.5,
        implementationRef: { id: "swarmalpha.runtime.text", version: "1.0.0" },
        implementationConfigHash: HASH,
        budgetContractRef: { id: "swarmalpha.budget.test", version: "1.0.0" },
        budgetContractHash: HASH,
      },
      {
        armRef: { id: "swarmalpha.arm.belief", version: "1.0.0" },
        allocationProbability: 0.5,
        implementationRef: { id: "swarmalpha.runtime.belief", version: "1.0.0" },
        implementationConfigHash: HASH,
        budgetContractRef: { id: "swarmalpha.budget.test", version: "1.0.0" },
        budgetContractHash: HASH,
      },
    ],
    stratification: {
      fields: ["taskFamily"],
      missingFieldPolicy: "reject",
      extraFieldPolicy: "reject",
    },
    analysisPopulation: "intention_to_treat",
    primaryEstimandRef: estimandRef,
    retryPolicy: "reuse_assignment",
  };
}

function study(primaryDesign = design()): GovernanceStudyContract {
  return {
    id: "swarmalpha.study.operational-outcome-test",
    version: "1.0.0",
    governanceArchitecture: "auditable_epistemic_v1",
    inferenceIntent: "confirmatory",
    taskFamilyRef: { id: "swarmalpha.task.test", version: "1.0.0" },
    evaluationContractRef: { id: "swarmalpha.eval.test", version: "1.0.0" },
    artifactSchemaRef: { id: "swarmalpha.raw-run", version: "5.0.0" },
    governancePolicy: structuredClone(MINIMAL_EPISTEMIC_GOVERNANCE_POLICY_V2),
    preregistrationRef: structuredClone(PREREGISTRATION),
    frozenAt: "2026-08-10T00:00:00.000Z",
    primaryAssignmentUnit: "run",
    primaryAssignmentDesign: primaryDesign,
    eligibleEventEstimand: "exploratory_only",
  };
}

function manifest(primaryDesign = design()): PrimaryAssignmentManifestV1 {
  const assignment = createPrimaryAssignmentV1({
    id: "assignment:operational-run",
    runId: "run:operational",
    studyRef: { id: "swarmalpha.study.operational-outcome-test", version: "1.0.0" },
    design: primaryDesign,
    stratum: { taskFamily: "test" },
    masterSeed: 41,
    assignedAt: "2026-08-10T00:00:01.000Z",
  });
  return createPrimaryAssignmentManifestV1({
    runId: assignment.runId,
    studyRef: assignment.studyRef,
    design: primaryDesign,
    assignment,
    createdAt: "2026-08-10T00:00:02.000Z",
  });
}

function finalOutcome(input: {
  claim?: EpistemicClaim;
  claims?: EpistemicClaim[];
  agents?: readonly ("answered" | "abstained" | "invalid" | "unavailable")[];
  answeredProbability?: number;
} = {}): FinalOutcomeArtifactV1 {
  const defaultClaim: EpistemicClaim = input.claim ?? {
    id: "claim:primary",
    proposition: "Does the condition hold?",
    domain: "fixture",
    createdAt: "2026-08-10T00:00:00.000Z",
    resolutionPolicy: { kind: "binary", resolverId: "resolver:fixture" },
  };
  const claims = input.claims ?? [defaultClaim];
  const statuses = input.agents ?? ["answered", "abstained", "invalid"];
  const expectedAgentIds = statuses.map((_, index) => `agent:${index + 1}`);
  const contract = createFinalElicitationContract({
    id: "fixture.final-elicitation.operational",
    version: "1.0.0",
    claimIds: claims.map(claim => claim.id),
  });
  const resolutionValues = Object.fromEntries(claims.map(claim => [
    claim.id,
    claim.resolutionPolicy.kind === "binary"
      ? true
      : ("options" in claim ? claim.options[0] : (() => { throw new Error("invalid categorical claim"); })()),
  ]));
  const session = new FinalOutcomeSession({
    runId: "run:operational",
    taskId: "task:operational",
    contract,
    claims,
    expectedAgentIds,
    discussionCompletedAt: "2026-08-10T00:01:00.000Z",
    totalRounds: 2,
    scoringTask: {
      groundTruth: {
        taskId: "task:operational",
        resolverId: "resolver:fixture",
        resolverVersion: "1.0.0",
        value: resolutionValues,
      },
      evaluationContractRef: { id: "fixture.eval", version: "1.0.0" },
    },
  });
  statuses.forEach((status, index) => {
    const agentId = expectedAgentIds[index];
    const recordedAt = `2026-08-10T00:02:0${index}.000Z`;
    if (status === "answered") {
      session.recordRawResponse(agentId, JSON.stringify({
        status: "answered",
        reports: claims.map(claim => ({
          claimId: claim.id,
          value: claim.resolutionPolicy.kind === "binary"
            ? { kind: "binary" as const, probability: input.answeredProbability ?? 0.8 }
            : "options" in claim ? {
                kind: "categorical" as const,
                probabilities: Object.fromEntries(claim.options.map((option, optionIndex) => [
                  option,
                  optionIndex === 0 ? 1 : 0,
                ])),
              } : (() => { throw new Error("invalid categorical claim"); })(),
        })),
      }), recordedAt);
    } else if (status === "abstained") {
      session.recordRawResponse(agentId, '{"status":"abstained"}', recordedAt);
    } else if (status === "invalid") {
      session.recordRawResponse(agentId, "not-json", recordedAt);
    } else {
      session.recordUnavailable(agentId, "timeout", recordedAt);
    }
  });
  session.closeElicitation("2026-08-10T00:03:00.000Z");
  session.resolveClaims((registeredClaim, scoringTask, resolvedAt) => ({
    claimId: registeredClaim.id,
    resolverId: registeredClaim.resolutionPolicy.resolverId,
    resolvedAt,
    kind: registeredClaim.resolutionPolicy.kind,
    outcome: (scoringTask.groundTruth.value as Record<string, boolean | string>)[registeredClaim.id] as never,
  }), "2026-08-10T00:04:00.000Z");
  return session.score("2026-08-10T00:05:00.000Z");
}

function createFixtureArtifact(input: Parameters<typeof finalOutcome>[0] = {}) {
  const frozenDesign = design();
  const frozenStudy = study(frozenDesign);
  const assignmentManifest = manifest(frozenDesign);
  const outcome = finalOutcome(input);
  const analysisUnit = createOperationalAnalysisUnitV1({
    runId: outcome.runId,
    taskId: outcome.taskId,
    studyRef: { id: frozenStudy.id, version: frozenStudy.version },
    primaryClaim: outcome.claims[0],
    expectedAgentIds: outcome.expectedAgentIds,
    committedAt: "2026-08-10T00:00:00.500Z",
  });
  const artifact = createOperationalOutcomeArtifactV1({
    study: frozenStudy,
    primaryAssignmentManifest: assignmentManifest,
    analysisUnit,
    finalOutcome: outcome,
    computedAt: "2026-08-10T00:06:00.000Z",
  });
  return { artifact, frozenStudy, assignmentManifest, analysisUnit, outcome };
}

describe("operational outcome v1", () => {
  it("keeps every registered agent in the ITT pool and preserves terminal identities", () => {
    const { artifact, frozenStudy, assignmentManifest, analysisUnit, outcome } = createFixtureArtifact();
    expect(artifact.claimOutcome).toMatchObject({
      registeredAgentCount: 3,
      answeredAgentCount: 1,
      terminalStatusCounts: { answered: 1, abstained: 1, invalid: 1, unavailable: 0 },
      referenceDistribution: { kind: "binary", probability: 0.5 },
      pooledBelief: { kind: "binary", probability: 0.6 },
    });
    expect(artifact.claimOutcome.operationalProperLoss).toBeCloseTo(0.16, 12);
    expect(artifact.claimOutcome.contributions.map(contribution => contribution.valueSource))
      .toEqual(["reported", "reference_distribution", "reference_distribution"]);
    expect(artifact.primaryMetric.value).toBe(artifact.claimOutcome.operationalProperLoss);
    expect(() => validateOperationalOutcomeArtifactV1(artifact, {
      study: frozenStudy,
      primaryAssignmentManifest: assignmentManifest,
      analysisUnit,
      finalOutcome: outcome,
    })).not.toThrow();
  });

  it("produces a finite uniform-reference loss when every agent is unavailable", () => {
    const claim: EpistemicClaim = {
      id: "claim:primary",
      proposition: "Which outcome holds?",
      domain: "fixture",
      createdAt: "2026-08-10T00:00:00.000Z",
      options: ["A", "B", "C"],
      resolutionPolicy: { kind: "categorical", resolverId: "resolver:fixture" },
    };
    const { artifact } = createFixtureArtifact({
      claim,
      agents: ["unavailable", "unavailable"],
    });
    expect(artifact.claimOutcome.registeredAgentCount).toBe(2);
    expect(artifact.claimOutcome.answeredAgentCount).toBe(0);
    expect(artifact.claimOutcome.pooledBelief).toEqual({
      kind: "categorical",
      probabilities: { A: 1 / 3, B: 1 / 3, C: 1 / 3 },
    });
    expect(artifact.claimOutcome.operationalProperLoss).toBeCloseTo(2 / 3, 12);
  });

  it("rejects a Stage-1 design that did not freeze the registered estimand", () => {
    const otherDesign = design({ id: "swarmalpha.estimand.other", version: "1.0.0" });
    const outcome = finalOutcome();
    expect(() => createOperationalOutcomeArtifactV1({
      study: study(otherDesign),
      primaryAssignmentManifest: manifest(otherDesign),
      analysisUnit: createOperationalAnalysisUnitV1({
        runId: outcome.runId,
        taskId: outcome.taskId,
        studyRef: { id: "swarmalpha.study.operational-outcome-test", version: "1.0.0" },
        primaryClaim: outcome.claims[0],
        expectedAgentIds: outcome.expectedAgentIds,
        committedAt: "2026-08-10T00:00:00.500Z",
      }),
      finalOutcome: outcome,
      computedAt: "2026-08-10T00:06:00.000Z",
    })).toThrow(/frozen operational-pooled-Brier estimand ref/);
  });

  it("rejects contract mutation instead of allowing a caller-selected fallback", () => {
    expect(() => validateOperationalOutcomeContractV1({
      ...OPERATIONAL_POOLED_BRIER_ESTIMAND_V1,
      referenceDistributionPolicy: "caller_supplied",
    })).toThrow(/exactly match/);
  });

  it("requires the primary claim and registered-agent denominator to be committed before assignment", () => {
    const outcome = finalOutcome();
    const lateUnit = createOperationalAnalysisUnitV1({
      runId: outcome.runId,
      taskId: outcome.taskId,
      studyRef: { id: "swarmalpha.study.operational-outcome-test", version: "1.0.0" },
      primaryClaim: outcome.claims[0],
      expectedAgentIds: outcome.expectedAgentIds,
      committedAt: "2026-08-10T00:00:01.001Z",
    });
    expect(() => createOperationalOutcomeArtifactV1({
      study: study(),
      primaryAssignmentManifest: manifest(),
      analysisUnit: lateUnit,
      finalOutcome: outcome,
      computedAt: "2026-08-10T00:06:00.000Z",
    })).toThrow(/committed before assignment/);

    const wrongRoster = createOperationalAnalysisUnitV1({
      runId: outcome.runId,
      taskId: outcome.taskId,
      studyRef: { id: "swarmalpha.study.operational-outcome-test", version: "1.0.0" },
      primaryClaim: outcome.claims[0],
      expectedAgentIds: ["agent:1", "agent:2"],
      committedAt: "2026-08-10T00:00:00.500Z",
    });
    expect(() => createOperationalOutcomeArtifactV1({
      study: study(),
      primaryAssignmentManifest: manifest(),
      analysisUnit: wrongRoster,
      finalOutcome: outcome,
      computedAt: "2026-08-10T00:06:00.000Z",
    })).toThrow(/differs from the pre-assignment analysis unit/);
  });

  it("rejects multi-claim outcomes because v1 has one primary claim per run", () => {
    const twoClaimOutcome = finalOutcome({ claims: [
      {
        id: "claim:primary",
        proposition: "Primary claim",
        domain: "fixture",
        createdAt: "2026-08-10T00:00:00.000Z",
        resolutionPolicy: { kind: "binary", resolverId: "resolver:fixture" },
      },
      {
        id: "claim:second",
        proposition: "Second claim",
        domain: "fixture",
        createdAt: "2026-08-10T00:00:00.000Z",
        resolutionPolicy: { kind: "binary", resolverId: "resolver:fixture" },
      },
    ] });
    expect(() => createOperationalOutcomeArtifactV1({
      study: study(),
      primaryAssignmentManifest: manifest(),
      analysisUnit: createOperationalAnalysisUnitV1({
        runId: twoClaimOutcome.runId,
        taskId: twoClaimOutcome.taskId,
        studyRef: { id: "swarmalpha.study.operational-outcome-test", version: "1.0.0" },
        primaryClaim: twoClaimOutcome.claims[0],
        expectedAgentIds: twoClaimOutcome.expectedAgentIds,
        committedAt: "2026-08-10T00:00:00.500Z",
      }),
      finalOutcome: twoClaimOutcome,
      computedAt: "2026-08-10T00:06:00.000Z",
    })).toThrow(/differs from the pre-assignment analysis unit/);
  });

  it("rejects a manifest created after discussion completion", () => {
    const frozenDesign = design();
    const lateManifest = manifest(frozenDesign);
    lateManifest.createdAt = "2026-08-10T00:01:01.000Z";
    const { contentHash: _contentHash, ...body } = lateManifest;
    lateManifest.contentHash = computePrimaryAssignmentManifestHash(body);
    const outcome = finalOutcome();
    expect(() => createOperationalOutcomeArtifactV1({
      study: study(frozenDesign),
      primaryAssignmentManifest: lateManifest,
      analysisUnit: createOperationalAnalysisUnitV1({
        runId: outcome.runId,
        taskId: outcome.taskId,
        studyRef: { id: "swarmalpha.study.operational-outcome-test", version: "1.0.0" },
        primaryClaim: outcome.claims[0],
        expectedAgentIds: outcome.expectedAgentIds,
        committedAt: "2026-08-10T00:00:00.500Z",
      }),
      finalOutcome: outcome,
      computedAt: "2026-08-10T00:06:00.000Z",
    })).toThrow();
  });

  it("rejects outcome computation before final scoring completes", () => {
    const outcome = finalOutcome();
    expect(() => createOperationalOutcomeArtifactV1({
      study: study(),
      primaryAssignmentManifest: manifest(),
      analysisUnit: createOperationalAnalysisUnitV1({
        runId: outcome.runId,
        taskId: outcome.taskId,
        studyRef: { id: "swarmalpha.study.operational-outcome-test", version: "1.0.0" },
        primaryClaim: outcome.claims[0],
        expectedAgentIds: outcome.expectedAgentIds,
        committedAt: "2026-08-10T00:00:00.500Z",
      }),
      finalOutcome: outcome,
      computedAt: "2026-08-10T00:04:59.000Z",
    })).toThrow(/cannot precede/);
  });

  it("rejects self-rehashed metric and contribution tampering by deterministic replay", () => {
    const { artifact, frozenStudy, assignmentManifest, analysisUnit, outcome } = createFixtureArtifact();
    const tampered = structuredClone(artifact);
    tampered.claimOutcome.contributions[1].value = { kind: "binary", probability: 0.9 };
    tampered.claimOutcome.pooledBelief = { kind: "binary", probability: 0.7333333333333334 };
    tampered.claimOutcome.operationalProperLoss = (1 - 0.7333333333333334) ** 2;
    tampered.primaryMetric.value = tampered.claimOutcome.operationalProperLoss;
    const { contentHash: _contentHash, ...body } = tampered;
    tampered.contentHash = computeOperationalOutcomeArtifactHashV1(body);
    expect(() => validateOperationalOutcomeArtifactV1(tampered, {
      study: frozenStudy,
      primaryAssignmentManifest: assignmentManifest,
      analysisUnit,
      finalOutcome: outcome,
    })).toThrow(/does not replay/);
  });
});

describe("CC-6B operational outcome adversarial edges", () => {
  function validAnalysisUnit(): OperationalAnalysisUnitV1 {
    return createOperationalAnalysisUnitV1({
      runId: "run:operational",
      taskId: "task:operational",
      studyRef: { id: "swarmalpha.study.operational-outcome-test", version: "1.0.0" },
      primaryClaim: {
        id: "claim:primary",
        proposition: "Does the condition hold?",
        domain: "fixture",
        createdAt: "2026-08-10T00:00:00.000Z",
        resolutionPolicy: { kind: "binary", resolverId: "resolver:fixture" },
      },
      expectedAgentIds: ["agent:1", "agent:2", "agent:3"],
      committedAt: "2026-08-10T00:00:00.500Z",
    });
  }

  function unitWith(overrides: Record<string, unknown>): OperationalAnalysisUnitV1 {
    const { contentHash: _old, ...body } = validAnalysisUnit();
    const merged = { ...body, ...overrides };
    return { ...merged, contentHash: computeOperationalAnalysisUnitHashV1(merged) } as OperationalAnalysisUnitV1;
  }

  function rehashArtifact(artifact: OperationalOutcomeArtifactV1): OperationalOutcomeArtifactV1 {
    const { contentHash: _old, ...body } = artifact;
    return { ...body, contentHash: computeOperationalOutcomeArtifactHashV1(body) };
  }

  function assertRejectsOnReplay(artifact: OperationalOutcomeArtifactV1): void {
    const { frozenStudy, assignmentManifest, analysisUnit, outcome } = createFixtureArtifact();
    expect(() => validateOperationalOutcomeArtifactV1(artifact, {
      study: frozenStudy,
      primaryAssignmentManifest: assignmentManifest,
      analysisUnit,
      finalOutcome: outcome,
    })).toThrow(/does not replay/);
  }

  // ── A. Analysis unit contract ─────────────────────────────────────────────

  it("rejects missing, extra, or empty analysis-unit fields", () => {
    const valid = validAnalysisUnit();
    const { artifactSchemaRef: _a, ...withoutSchema } = valid;
    expect(() => validateOperationalAnalysisUnitV1(withoutSchema as never))
      .toThrow("artifact schema ref is invalid");

    expect(() => validateOperationalAnalysisUnitV1(unitWith({ runId: " " })))
      .toThrow("runId must be non-empty");
    expect(() => validateOperationalAnalysisUnitV1(unitWith({ taskId: "" })))
      .toThrow("taskId must be non-empty");
    expect(() => validateOperationalAnalysisUnitV1(unitWith({
      studyRef: { id: "", version: "1.0.0" },
    }))).toThrow("studyRef.id must be non-empty");
    expect(() => validateOperationalAnalysisUnitV1(unitWith({ surprise: 1 })))
      .toThrow("unexpected or missing fields");
  });

  it("rejects duplicate, empty, or empty-array analysis-unit rosters", () => {
    expect(() => validateOperationalAnalysisUnitV1(unitWith({ expectedAgentIds: [] })))
      .toThrow("unique non-empty strings");
    expect(() => validateOperationalAnalysisUnitV1(unitWith({ expectedAgentIds: ["a", "a"] })))
      .toThrow("unique non-empty strings");
    expect(() => validateOperationalAnalysisUnitV1(unitWith({ expectedAgentIds: ["a", " "] })))
      .toThrow("unique non-empty strings");
  });

  it("rejects a primary claim registered after the analysis-unit commitment", () => {
    const lateClaim: EpistemicClaim = {
      id: "claim:primary",
      proposition: "Late claim",
      domain: "fixture",
      createdAt: "2026-08-10T00:00:01.000Z",
      resolutionPolicy: { kind: "binary", resolverId: "resolver:fixture" },
    };
    expect(() => validateOperationalAnalysisUnitV1(unitWith({ primaryClaim: lateClaim })))
      .toThrow("cannot precede primary-claim registration");
  });

  it("rejects non-canonical timestamps on the analysis unit", () => {
    expect(() => validateOperationalAnalysisUnitV1(unitWith({ committedAt: "2026-08-10T00:00:00Z" })))
      .toThrow("must be a canonical ISO timestamp");
    expect(() => validateOperationalAnalysisUnitV1(unitWith({ committedAt: "not-a-date" })))
      .toThrow("must be a canonical ISO timestamp");
  });

  it("rejects analysis-unit contentHash tampering", () => {
    const tampered = validAnalysisUnit();
    tampered.contentHash = `sha256:${"b".repeat(64)}`;
    expect(() => validateOperationalAnalysisUnitV1(tampered)).toThrow("contentHash mismatch");
  });

  it("rejects a self-consistently rehashed unit whose roster/task/claim/study differs, at the operational boundary", () => {
    const outcome = finalOutcome();
    const makeUnit = (overrides: Parameters<typeof createOperationalAnalysisUnitV1>[0]) =>
      createOperationalAnalysisUnitV1(overrides);
    const base = {
      runId: outcome.runId,
      taskId: outcome.taskId,
      studyRef: { id: "swarmalpha.study.operational-outcome-test", version: "1.0.0" },
      primaryClaim: outcome.claims[0],
      expectedAgentIds: outcome.expectedAgentIds,
      committedAt: "2026-08-10T00:00:00.500Z",
    };
    const cases: Array<[string, Parameters<typeof createOperationalAnalysisUnitV1>[0]]> = [
      ["roster", { ...base, expectedAgentIds: ["agent:9", "agent:8"] }],
      ["task", { ...base, taskId: "task:other" }],
      ["claim", { ...base, primaryClaim: {
        id: "claim:other",
        proposition: "Other claim",
        domain: "fixture",
        createdAt: "2026-08-10T00:00:00.000Z",
        resolutionPolicy: { kind: "binary", resolverId: "resolver:fixture" },
      } }],
      ["study", { ...base, studyRef: { id: "swarmalpha.study.other", version: "1.0.0" } }],
      ["run", { ...base, runId: "run:other" }],
    ];
    for (const [label, overrides] of cases) {
      const unit = makeUnit(overrides); // self-consistently rehashed by the creator
      expect(() => createOperationalOutcomeArtifactV1({
        study: study(),
        primaryAssignmentManifest: manifest(),
        analysisUnit: unit,
        finalOutcome: outcome,
        computedAt: "2026-08-10T00:06:00.000Z",
      }), `expected rejection for mismatched ${label}`).toThrow();
    }
  });

  it("rejects categorical option-order tampering because it changes the analysis-unit hash", () => {
    const outcome = finalOutcome();
    const categoricalClaim: EpistemicClaim = {
      id: "claim:primary",
      proposition: "Which option?",
      domain: "fixture",
      createdAt: "2026-08-10T00:00:00.000Z",
      options: ["A", "B", "C"],
      resolutionPolicy: { kind: "categorical", resolverId: "resolver:fixture" },
    };
    // Registering the canonical order then reordering in the unit changes the
    // committed claim, so the operational boundary must reject the drift.
    const reorderedUnit = createOperationalAnalysisUnitV1({
      runId: outcome.runId,
      taskId: outcome.taskId,
      studyRef: { id: "swarmalpha.study.operational-outcome-test", version: "1.0.0" },
      primaryClaim: { ...categoricalClaim, options: ["C", "B", "A"] },
      expectedAgentIds: outcome.expectedAgentIds,
      committedAt: "2026-08-10T00:00:00.500Z",
    });
    const categoricalOutcome = finalOutcome({ claim: categoricalClaim, agents: ["unavailable"] });
    expect(() => createOperationalOutcomeArtifactV1({
      study: study(),
      primaryAssignmentManifest: manifest(),
      analysisUnit: reorderedUnit,
      finalOutcome: categoricalOutcome,
      computedAt: "2026-08-10T00:06:00.000Z",
    })).toThrow(/differs from the pre-assignment analysis unit/);
  });

  it("fails closed on sparse, non-finite, function, class-instance, and cyclic claim carriers", () => {
    const binary = {
      id: "claim:primary",
      proposition: "P",
      domain: "fixture",
      createdAt: "2026-08-10T00:00:00.000Z",
      resolutionPolicy: { kind: "binary", resolverId: "resolver:fixture" },
    };
    const make = (mutate: (claim: Record<string, unknown>) => void) => {
      const claim = structuredClone(binary) as Record<string, unknown>;
      mutate(claim);
      return claim;
    };
    const sparseOptions = (() => {
      const options = ["A", "B", "C"] as unknown[];
      delete options[1];
      return options;
    })();
    const cyclic: Record<string, unknown> = structuredClone(binary);
    (cyclic as { self?: unknown }).self = cyclic;
    const cases: Array<[string, unknown]> = [
      // Non-finite values in a required string field are rejected by the claim validator.
      ["NaN", make(c => { c.proposition = Number.NaN; })],
      ["Infinity", make(c => { c.proposition = Number.POSITIVE_INFINITY; })],
      // structuredClone rejects functions, class instances, and cycles at the public boundary.
      ["function", make(c => { c.proposition = (() => 1) as never; })],
      ["class instance", make(c => { c.resolutionPolicy = new Date() as never; })],
      ["cycle", cyclic],
      // A sparse canonical option array fails closed in the categorical claim validator.
      ["sparse array", make(c => { c.options = sparseOptions; c.resolutionPolicy = { kind: "categorical", resolverId: "r" }; })],
    ];
    for (const [label, claim] of cases) {
      expect(() => createOperationalAnalysisUnitV1({
        runId: "run:operational",
        taskId: "task:operational",
        studyRef: { id: "swarmalpha.study.operational-outcome-test", version: "1.0.0" },
        primaryClaim: claim as EpistemicClaim,
        expectedAgentIds: ["agent:1"],
        committedAt: "2026-08-10T00:00:00.500Z",
      }), `expected ${label} claim to fail closed`).toThrow();
    }
  });

  it("rejects unhashed custom, symbol, and non-enumerable carrier properties", () => {
    const withCustomArrayProperty = validAnalysisUnit();
    Object.assign(withCustomArrayProperty.expectedAgentIds, { hiddenMeaning: "x" });
    expect(() => computeOperationalAnalysisUnitHashV1((({ contentHash: _hash, ...body }) => body)(
      withCustomArrayProperty,
    ))).toThrow(/canonical index properties/);

    const withSymbol = validAnalysisUnit() as OperationalAnalysisUnitV1 & Record<symbol, unknown>;
    withSymbol[Symbol("hidden")] = "x";
    expect(() => computeOperationalAnalysisUnitHashV1((({ contentHash: _hash, ...body }) => body)(withSymbol)))
      .toThrow(/symbol properties/);

    const withNonEnumerable = validAnalysisUnit();
    Object.defineProperty(withNonEnumerable.primaryClaim, "hidden", {
      value: "x",
      enumerable: false,
    });
    expect(() => computeOperationalAnalysisUnitHashV1((({ contentHash: _hash, ...body }) => body)(
      withNonEnumerable,
    ))).toThrow(/enumerable data property/);
  });

  // ── B. Frozen estimand and missingness ────────────────────────────────────

  it("rejects any mutation of the frozen pooling/missingness/reference policy or field set", () => {
    expect(() => validateOperationalOutcomeContractV1({
      ...OPERATIONAL_POOLED_BRIER_ESTIMAND_V1,
      poolingPolicy: "weighted_registered_agents",
    })).toThrow(/exactly match/);
    expect(() => validateOperationalOutcomeContractV1({
      ...OPERATIONAL_POOLED_BRIER_ESTIMAND_V1,
      missingnessPolicy: "complete_case_only",
    })).toThrow(/exactly match/);
    expect(() => validateOperationalOutcomeContractV1({
      ...OPERATIONAL_POOLED_BRIER_ESTIMAND_V1,
      properLossPolicy: "accuracy",
    })).toThrow(/exactly match/);
    const { terminalStatusesUsingReference: _t, ...withoutStatuses } = OPERATIONAL_POOLED_BRIER_ESTIMAND_V1;
    expect(() => validateOperationalOutcomeContractV1(withoutStatuses)).toThrow(/exactly match/);
    expect(() => validateOperationalOutcomeContractV1({
      ...OPERATIONAL_POOLED_BRIER_ESTIMAND_V1,
      extra: 1,
    })).toThrow(/exactly match/);
  });

  it("keeps four terminal identities distinct while pooling all at the reference denominator", () => {
    const { artifact } = createFixtureArtifact({
      agents: ["answered", "abstained", "invalid", "unavailable"],
    });
    expect(artifact.claimOutcome.registeredAgentCount).toBe(4);
    expect(artifact.claimOutcome.answeredAgentCount).toBe(1);
    expect(artifact.claimOutcome.terminalStatusCounts).toEqual({
      answered: 1, abstained: 1, invalid: 1, unavailable: 1,
    });
    expect(artifact.claimOutcome.contributions.map(contribution => contribution.valueSource))
      .toEqual(["reported", "reference_distribution", "reference_distribution", "reference_distribution"]);
    // pooled = (0.8 + 0.5 + 0.5 + 0.5)/4 = 0.575; resolution = true
    expect(artifact.claimOutcome.pooledBelief).toEqual({ kind: "binary", probability: 0.575 });
    expect(artifact.claimOutcome.operationalProperLoss).toBeCloseTo((1 - 0.575) ** 2, 12);
  });

  it("produces a finite uniform-reference loss for an all-unanswered binary run", () => {
    const { artifact } = createFixtureArtifact({ agents: ["unavailable", "unavailable"] });
    expect(artifact.claimOutcome.pooledBelief).toEqual({ kind: "binary", probability: 0.5 });
    expect(artifact.claimOutcome.operationalProperLoss).toBeCloseTo((1 - 0.5) ** 2, 12);
    expect(artifact.claimOutcome.terminalStatusCounts).toEqual({
      answered: 0, abstained: 0, invalid: 0, unavailable: 2,
    });
  });

  it("emits the categorical uniform reference in canonical registered option order", () => {
    const claim: EpistemicClaim = {
      id: "claim:primary",
      proposition: "Which option?",
      domain: "fixture",
      createdAt: "2026-08-10T00:00:00.000Z",
      options: ["B", "A", "C"],
      resolutionPolicy: { kind: "categorical", resolverId: "resolver:fixture" },
    };
    const { artifact } = createFixtureArtifact({ claim, agents: ["unavailable"] });
    const reference = artifact.claimOutcome.referenceDistribution as { probabilities: Record<string, number> };
    expect(Object.keys(reference.probabilities)).toEqual(["B", "A", "C"]);
    expect(artifact.claimOutcome.referenceDistribution).toEqual({
      kind: "categorical",
      probabilities: { B: 1 / 3, A: 1 / 3, C: 1 / 3 },
    });
  });

  it("derives the uniform reference from the registered claim with no caller-supplied path", () => {
    const binaryClaim: EpistemicClaim = {
      id: "claim:primary",
      proposition: "P",
      domain: "fixture",
      createdAt: "2026-08-10T00:00:00.000Z",
      resolutionPolicy: { kind: "binary", resolverId: "resolver:fixture" },
    };
    const categoricalClaim: EpistemicClaim = {
      id: "claim:primary",
      proposition: "Q",
      domain: "fixture",
      createdAt: "2026-08-10T00:00:00.000Z",
      options: ["A", "B"],
      resolutionPolicy: { kind: "categorical", resolverId: "resolver:fixture" },
    };
    expect(deriveOperationalReferenceDistributionV1(binaryClaim)).toEqual({ kind: "binary", probability: 0.5 });
    expect(deriveOperationalReferenceDistributionV1(categoricalClaim)).toEqual({
      kind: "categorical",
      probabilities: { A: 0.5, B: 0.5 },
    });
    // v1 freezes the uniform-over-registered policy; no nonuniform path exists.
    expect(OPERATIONAL_POOLED_BRIER_ESTIMAND_V1.referenceDistributionPolicy)
      .toBe("uniform_over_registered_outcomes");
    expect(OPERATIONAL_POOLED_BRIER_ESTIMAND_V1.terminalStatusesUsingReference)
      .toEqual(["abstained", "invalid", "unavailable"]);
  });

  // ── C. Source binding and replay ──────────────────────────────────────────

  it("rejects self-rehashed tampering of every source-binding hash and identity", () => {
    const { artifact } = createFixtureArtifact();
    const cases: Array<[string, (value: OperationalOutcomeArtifactV1) => void]> = [
      ["primaryAssignmentId", value => { value.primaryAssignmentId = "assignment:other"; }],
      ["assignedArmRef", value => { value.assignedArmRef = { id: "swarmalpha.arm.other", version: "1.0.0" }; }],
      ["primaryAssignmentManifestHash", value => { value.primaryAssignmentManifestHash = `sha256:${"c".repeat(64)}`; }],
      ["analysisUnitHash", value => { value.analysisUnitHash = `sha256:${"d".repeat(64)}`; }],
      ["sourceFinalOutcomeHash", value => { value.sourceFinalOutcomeHash = `sha256:${"e".repeat(64)}`; }],
    ];
    for (const [label, mutate] of cases) {
      const tampered = structuredClone(artifact);
      mutate(tampered);
      assertRejectsOnReplay(rehashArtifact(tampered));
    }
  });

  it("rejects self-rehashed tampering of counts, reference distribution, pool, loss, and primary metric", () => {
    const { artifact } = createFixtureArtifact();
    const cases: Array<[string, (value: OperationalOutcomeArtifactV1) => void]> = [
      ["statusCounts", value => { value.claimOutcome.terminalStatusCounts.answered = 99; }],
      ["answeredAgentCount", value => { value.claimOutcome.answeredAgentCount = 99; }],
      ["registeredAgentCount", value => { value.claimOutcome.registeredAgentCount = 99; }],
      ["referenceDistribution", value => { value.claimOutcome.referenceDistribution = { kind: "binary", probability: 0.1 }; }],
      ["pooledBelief", value => { value.claimOutcome.pooledBelief = { kind: "binary", probability: 0.99 }; }],
      ["operationalProperLoss", value => { value.claimOutcome.operationalProperLoss = 0.0; }],
      ["primaryMetric.value", value => { value.primaryMetric.value = 0.0; }],
    ];
    for (const [label, mutate] of cases) {
      const tampered = structuredClone(artifact);
      mutate(tampered);
      assertRejectsOnReplay(rehashArtifact(tampered));
    }
  });

  it("rejects unexpected artifact fields even after self-rehash", () => {
    const { artifact } = createFixtureArtifact();
    const tampered = structuredClone(artifact) as OperationalOutcomeArtifactV1 & { surprise: unknown };
    tampered.surprise = 1;
    assertRejectsOnReplay(rehashArtifact(tampered));
  });

  it("rejects a manifest whose run/study/assignment identity drifts", () => {
    const outcome = finalOutcome();
    const frozenDesign = design();
    const drifted = manifest(frozenDesign);
    drifted.runId = "run:drifted";
    drifted.assignment.runId = "run:drifted";
    const { contentHash: _old, ...body } = drifted;
    drifted.contentHash = computePrimaryAssignmentManifestHash(body);
    // The drift is caught at the manifest binding boundary (a changed runId
    // breaks seed/unit replay or the run binding), never silently accepted.
    expect(() => createOperationalOutcomeArtifactV1({
      study: study(frozenDesign),
      primaryAssignmentManifest: drifted,
      analysisUnit: createOperationalAnalysisUnitV1({
        runId: outcome.runId,
        taskId: outcome.taskId,
        studyRef: { id: "swarmalpha.study.operational-outcome-test", version: "1.0.0" },
        primaryClaim: outcome.claims[0],
        expectedAgentIds: outcome.expectedAgentIds,
        committedAt: "2026-08-10T00:00:00.500Z",
      }),
      finalOutcome: outcome,
      computedAt: "2026-08-10T00:06:00.000Z",
    })).toThrow();
  });

  it("isolates inputs from the returned analysis unit and final-outcome from the artifact", () => {
    const { artifact, outcome } = createFixtureArtifact();
    // The artifact must not hold references into the final outcome.
    outcome.elicitationRecords[0].reports[0].value = { kind: "binary", probability: 0.1 };
    expect(artifact.claimOutcome.contributions[0].value).toEqual({ kind: "binary", probability: 0.8 });

    // The analysis unit clones its primary-claim input.
    const claim: EpistemicClaim = {
      id: "claim:primary",
      proposition: "P",
      domain: "fixture",
      createdAt: "2026-08-10T00:00:00.000Z",
      resolutionPolicy: { kind: "binary", resolverId: "resolver:fixture" },
    };
    const unit = createOperationalAnalysisUnitV1({
      runId: "run:operational",
      taskId: "task:operational",
      studyRef: { id: "swarmalpha.study.operational-outcome-test", version: "1.0.0" },
      primaryClaim: claim,
      expectedAgentIds: ["agent:1"],
      committedAt: "2026-08-10T00:00:00.500Z",
    });
    claim.proposition = "mutated";
    expect(unit.primaryClaim.proposition).toBe("P");
  });
});
