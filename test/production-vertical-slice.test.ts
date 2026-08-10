import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGovernanceEventAssignment,
  createVerificationRequestEligibilityRule,
  HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2,
  VERIFICATION_ATTENTION_SHAM_V2,
  VERIFICATION_REQUEST_V2,
  type GovernancePolicyContract,
} from "@/lib/governance";
import { REPORTED_BELIEF_CERTAINTY_V1 } from "@/lib/epistemic";
import {
  OPERATIONAL_POOLED_BRIER_ESTIMAND_V1,
  PRIMARY_ASSIGNMENT_ALGORITHM_V1,
  computePrimaryAssignmentExecutionPayloadHash,
  createPrimaryArmExecutionRegistryV1,
  createPrimaryAssignmentV1,
  type FinalElicitationAdapterV1,
  type GovernanceStudyContract,
  type PrimaryAssignmentDesignV1,
} from "@/lib/experimentation";
import {
  runV6ProductionVerticalSlice,
  type V6BinaryTaskV1,
  type V6DiscussionAdapterV1,
  type V6InteractionProtocol,
  type V6VerificationAdapterV1,
} from "../experiments/campaign/v6/productionVerticalSlice";
import { verifyRawRunData } from "../experiments/campaign/replayVerifier";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const PREREG = { id: "swarmalpha.prereg.v6-vertical-test", version: "1.0.0" } as const;
const TASK_FAMILY = { id: "swarmalpha.task.distributed-binary", version: "1.0.0" } as const;
const protocols: V6InteractionProtocol[] = [
  "text_communication_v1",
  "explicit_belief_v1",
  "epistemic_governance_v1",
];

function fixture(runId: string) {
  const rule = createVerificationRequestEligibilityRule({
    certaintyThresholdPolicy: {
      id: "swarmalpha.threshold.v6-vertical-test",
      version: "1.0.0",
      quantityRef: REPORTED_BELIEF_CERTAINTY_V1,
      operator: "gte",
      bounds: { lower: 0.9 },
      authority: { kind: "randomized_experiment_only", preregistrationRef: PREREG },
      selection: {
        kind: "fixed_preregistered",
        methodRef: { id: "swarmalpha.method.fixed-threshold", version: "1.0.0" },
      },
      costs: { falsePositive: 1, falseNegative: 1, abstention: 1, action: 1 },
      missingResult: "ineligible",
      frozenAt: "2026-08-10T00:00:00.000Z",
    },
    maxVerifiedIndependentLineages: 0,
    verifierId: "verifier:test",
    matchedTokenBudget: 300,
    expectedModelCalls: 1,
    priority: 100,
  });
  const policy: GovernancePolicyContract = {
    id: "swarmalpha.policy.v6-vertical-test",
    version: "1.0.0",
    controlMode: "randomized_experiment",
    preregistrationRef: PREREG,
    eligibilityRuleRefs: [HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2],
    maxActionsPerDecision: 1,
    arbitration: "priority_then_stable_id",
    assignmentDesign: {
      designRef: { id: "swarmalpha.assignment.v6-vertical-test", version: "1.0.0" },
      seedNamespace: "swarmalpha:v6-vertical-test:event:v1",
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
  const implementations = protocols.map(protocol => ({ protocol }));
  const budget = { maxDiscussionCalls: 6, maxFinalCalls: 3, maxVerificationCalls: 1 };
  const arms = protocols.map((protocol, index) => ({
    armRef: { id: `swarmalpha.arm.${protocol}`, version: "1.0.0" },
    allocationProbability: 1 / 3,
    implementationRef: { id: `swarmalpha.runtime.${protocol}`, version: "1.0.0" },
    implementationConfigHash: computePrimaryAssignmentExecutionPayloadHash(implementations[index]),
    budgetContractRef: { id: "swarmalpha.budget.v6-vertical-test", version: "1.0.0" },
    budgetContractHash: computePrimaryAssignmentExecutionPayloadHash(budget),
  }));
  const design: PrimaryAssignmentDesignV1 = {
    id: "swarmalpha.primary-design.v6-vertical-test",
    version: "1.0.0",
    schemaVersion: "1.0.0",
    preregistrationRef: PREREG,
    unit: "run",
    assignmentAlgorithmRef: PRIMARY_ASSIGNMENT_ALGORITHM_V1,
    seedNamespace: "swarmalpha:v6-vertical-test:primary:v1",
    arms,
    stratification: {
      fields: ["taskFamily"],
      missingFieldPolicy: "reject",
      extraFieldPolicy: "reject",
    },
    analysisPopulation: "intention_to_treat",
    primaryEstimandRef: OPERATIONAL_POOLED_BRIER_ESTIMAND_V1,
    retryPolicy: "reuse_assignment",
  };
  const study: GovernanceStudyContract = {
    id: "swarmalpha.study.v6-vertical-test",
    version: "1.0.0",
    governanceArchitecture: "auditable_epistemic_v1",
    inferenceIntent: "confirmatory",
    taskFamilyRef: TASK_FAMILY,
    evaluationContractRef: { id: "swarmalpha.eval.v6-binary", version: "1.0.0" },
    artifactSchemaRef: { id: "swarmalpha.raw-run", version: "5.0.0" },
    governancePolicy: policy,
    preregistrationRef: PREREG,
    frozenAt: "2026-08-10T00:00:00.000Z",
    primaryAssignmentUnit: "run",
    primaryAssignmentDesign: design,
    eligibleEventEstimand: "exploratory_only",
  };
  const registry = createPrimaryArmExecutionRegistryV1({
    studyRef: { id: study.id, version: study.version },
    design,
    entries: protocols.map((protocol, index) => ({
      armRef: arms[index].armRef,
      implementationRef: arms[index].implementationRef,
      implementationConfig: implementations[index],
      budgetContractRef: arms[index].budgetContractRef,
      budgetContract: budget,
    })),
  });
  const task: V6BinaryTaskV1 = {
    id: "task:v6-vertical-test",
    taskFamilyRef: TASK_FAMILY,
    publicContext: "A remote station must decide whether the emergency route is viable.",
    claim: {
      id: "claim:v6-route-viable",
      proposition: "The emergency route is viable.",
      domain: "distributed-binary-test",
      createdAt: "2026-08-10T00:00:00.000Z",
      resolutionPolicy: { kind: "binary", resolverId: "resolver:v6-test" },
    },
    agents: [
      { agentId: "agent:a", privateInformation: "Sensor A reports a clear route." },
      { agentId: "agent:b", privateInformation: "Sensor B reports unstable ice." },
    ],
    outcome: false,
  };
  return { rule, policy, design, study, registry, task };
}

function primarySeedForProtocol(
  runId: string,
  study: GovernanceStudyContract,
  design: PrimaryAssignmentDesignV1,
  protocol: V6InteractionProtocol,
): number {
  for (let seed = 0; seed < 10_000; seed++) {
    const assignment = createPrimaryAssignmentV1({
      id: `primary-assignment:${runId}`,
      runId,
      studyRef: { id: study.id, version: study.version },
      design,
      stratum: { taskFamily: "distributed-binary" },
      masterSeed: seed,
      assignedAt: "2026-08-10T00:00:01.000Z",
    });
    if (assignment.assignedArmRef.id === `swarmalpha.arm.${protocol}`) return seed;
  }
  throw new Error(`no primary seed found for ${protocol}`);
}

function deterministicClock() {
  let tick = 0;
  return () => new Date(Date.parse("2026-08-10T00:00:01.000Z") + tick++ * 1000).toISOString();
}

describe("v6 production vertical slice", () => {
  for (const protocol of protocols) {
    it(`executes, atomically persists, and immediately replays ${protocol}`, async () => {
      const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "swarmalpha-v6-slice-"));
      tempDirs.push(outputDir);
      const runId = `run:v6:${protocol}`;
      const { rule, design, study, registry, task } = fixture(runId);
      const discussionRequests: unknown[] = [];
      const discussionAdapter: V6DiscussionAdapterV1 = {
        contract: {
          id: "swarmalpha.adapter.discussion-test",
          version: "1.0.0",
          adapterRef: { id: "swarmalpha.provider.mock", version: "1.0.0" },
          agentBindings: task.agents.map(agent => ({
            agentId: agent.agentId,
            modelRef: { id: `model:${agent.agentId}`, version: "1.0.0" },
            invocationConfig: { temperature: 0 },
          })),
          timeoutMs: 1_000,
          retryPolicy: "none",
          executionOrder: "round_then_precommitted_agent",
        },
        respond: vi.fn(async request => {
          discussionRequests.push(structuredClone(request));
          if (request.responseContract === "plain_text") {
            return { status: "response", rawResponse: `${request.agentId} public view r${request.round}` } as const;
          }
          return {
            status: "response",
            rawResponse: JSON.stringify({
              message: `${request.agentId} explicit view r${request.round}`,
              belief: {
                kind: "binary",
                probability: request.round === 1 && request.agentId === "agent:a" ? 0.95 : 0.6,
              },
              evidence: [{
                content: `public evidence from ${request.agentId} r${request.round}`,
                relation: "supports",
                lineageId: `declared:${request.agentId}`,
              }],
            }),
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, latencyMs: 1 },
          } as const;
        }),
      };
      const finalRequests: unknown[] = [];
      const finalAdapter: FinalElicitationAdapterV1 = {
        contract: {
          id: "swarmalpha.adapter.final-test",
          version: "1.0.0",
          adapterRef: { id: "swarmalpha.provider.mock-final", version: "1.0.0" },
          agentBindings: task.agents.map(agent => ({
            agentId: agent.agentId,
            modelRef: { id: `model:${agent.agentId}`, version: "1.0.0" },
            invocationConfig: { temperature: 0, responseFormat: "json" },
          })),
          timeoutMs: 1_000,
          retryPolicy: "none",
          executionOrder: "sequential_precommitted",
        },
        elicit: vi.fn(async request => {
          finalRequests.push(structuredClone(request));
          return {
            status: "response",
            rawResponse: JSON.stringify({
              status: "answered",
              reports: [{
                claimId: task.claim.id,
                value: { kind: "binary", probability: request.agentId === "agent:a" ? 0.3 : 0.2 },
              }],
            }),
          } as const;
        }),
      };
      const verificationRequests: unknown[] = [];
      const verificationAdapter: V6VerificationAdapterV1 = {
        contract: {
          id: "swarmalpha.adapter.verification-test",
          version: "1.0.0",
          adapterRef: { id: "swarmalpha.provider.mock-verifier", version: "1.0.0" },
          modelRef: { id: "model:verifier", version: "1.0.0" },
          invocationConfig: { temperature: 0 },
          timeoutMs: 1_000,
          retryPolicy: "none",
        },
        verify: vi.fn(async request => {
          verificationRequests.push(structuredClone(request));
          return {
            status: "response",
            publicContent: "Independent verification found the route evidence inconclusive.",
            usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12, latencyMs: 1 },
          } as const;
        }),
      };
      const primaryMasterSeed = primarySeedForProtocol(runId, study, design, protocol);
      const result = await runV6ProductionVerticalSlice({
        outputDir,
        runId,
        experimentId: "experiment:v6-vertical-test",
        seed: 17,
        runIndex: 0,
        study,
        registry,
        stratum: { taskFamily: "distributed-binary" },
        primaryMasterSeed,
        eligibleEventMasterSeed: 1,
        task,
        discussionAdapter,
        finalElicitationAdapter: finalAdapter,
        governanceRule: rule,
        interventionContracts: [
          structuredClone(VERIFICATION_REQUEST_V2),
          structuredClone(VERIFICATION_ATTENTION_SHAM_V2),
        ],
        verificationAdapter,
        clock: deterministicClock(),
      });

      expect(result.reused).toBe(false);
      expect(fs.existsSync(result.absolutePath)).toBe(true);
      expect(result.artifact.rawSchemaVersion).toBe("5.0");
      expect(result.artifact.v6InteractionTrace.protocol).toBe(protocol);
      expect(Date.parse(result.artifact.operationalAnalysisUnit.committedAt))
        .toBeLessThanOrEqual(Date.parse(result.artifact.primaryAssignmentManifest.assignment.assignedAt));
      expect(result.artifact.operationalOutcome.primaryMetric.value).toBeCloseTo(0.0625, 12);
      expect(result.artifact.taskOutcome.quality).toBe(1);
      expect(discussionRequests).toHaveLength(4);
      expect(finalRequests).toHaveLength(2);
      expect(JSON.stringify(discussionRequests)).not.toContain("groundTruth");
      expect(JSON.stringify(finalRequests)).not.toContain("groundTruth");
      expect(JSON.stringify(finalRequests)).not.toContain("outcome\":false");
      const replay = verifyRawRunData(result.absolutePath, result.artifact, { governanceRules: [rule] });
      expect(replay.runIssues).toEqual([]);
      expect(replay.governanceAuditStatus).toBe("sealed_decision_replay_verified");
      if (protocol === "text_communication_v1") {
        expect(result.artifact.v6InteractionTrace.epistemicEvents
          .filter(event => event.type === "belief_reported")).toHaveLength(0);
        expect(result.artifact.governanceAuditTrail.decisions).toHaveLength(0);
      } else {
        expect(result.artifact.v6InteractionTrace.epistemicEvents
          .filter(event => event.type === "belief_reported")).toHaveLength(4);
      }
      if (protocol === "epistemic_governance_v1") {
        expect(result.artifact.governanceAuditTrail.decisions.length).toBeGreaterThan(0);
        expect(result.artifact.governanceAuditTrail.status).toBe("sealed");
        expect(verificationRequests).toHaveLength(1);
        expect(result.artifact.governanceAuditTrail.actionTransitions
          .map(item => item.to)).toEqual([
            "proposed", "eligible", "assigned", "queued", "delivered", "compliance_observed", "completed",
          ]);
        expect(result.artifact.governanceAuditTrail.actionTransitions
          .find(item => item.to === "compliance_observed")?.observation)
          .toEqual({ complied: true });
      } else {
        expect(verificationRequests).toHaveLength(0);
      }

      const callsBeforeRetry = (discussionAdapter.respond as ReturnType<typeof vi.fn>).mock.calls.length;
      const retried = await runV6ProductionVerticalSlice({
        outputDir,
        runId,
        experimentId: "experiment:v6-vertical-test",
        seed: 17,
        runIndex: 0,
        study,
        registry,
        stratum: { taskFamily: "distributed-binary" },
        primaryMasterSeed,
        eligibleEventMasterSeed: 999,
        task,
        discussionAdapter,
        finalElicitationAdapter: finalAdapter,
        governanceRule: rule,
        interventionContracts: [
          structuredClone(VERIFICATION_REQUEST_V2),
          structuredClone(VERIFICATION_ATTENTION_SHAM_V2),
        ],
        verificationAdapter,
        clock: deterministicClock(),
      });
      expect(retried.reused).toBe(true);
      expect((discussionAdapter.respond as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(callsBeforeRetry);
      expect(retried.artifact).toEqual(result.artifact);
    });
  }

  it("rejects a pre-existing assignment when the analysis-unit commitment is absent", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "swarmalpha-v6-slice-"));
    tempDirs.push(outputDir);
    const runId = "run:v6:missing-analysis-unit";
    const { rule, design, study, registry, task } = fixture(runId);
    const assignmentSeed = primarySeedForProtocol(runId, study, design, "text_communication_v1");
    const assignment = createPrimaryAssignmentV1({
      id: `primary-assignment:${runId}`,
      runId,
      studyRef: { id: study.id, version: study.version },
      design,
      stratum: { taskFamily: "distributed-binary" },
      masterSeed: assignmentSeed,
      assignedAt: "2026-08-10T00:00:02.000Z",
    });
    const { createPrimaryAssignmentManifestV1, resolvePrimaryAssignmentManifestV1Path } = await import("@/lib/experimentation");
    const manifest = createPrimaryAssignmentManifestV1({
      runId, studyRef: assignment.studyRef, design, assignment, createdAt: "2026-08-10T00:00:03.000Z",
    });
    fs.writeFileSync(resolvePrimaryAssignmentManifestV1Path(outputDir, runId), `${JSON.stringify(manifest)}\n`);
    const discussionAdapter = {
      contract: {
        id: "adapter:test", version: "1.0.0",
        adapterRef: { id: "provider:test", version: "1.0.0" },
        agentBindings: task.agents.map(agent => ({
          agentId: agent.agentId,
          modelRef: { id: `model:${agent.agentId}`, version: "1.0.0" }, invocationConfig: {},
        })),
        timeoutMs: 1000, retryPolicy: "none", executionOrder: "round_then_precommitted_agent",
      },
      respond: vi.fn(),
    } as V6DiscussionAdapterV1;
    const finalAdapter = {
      contract: {
        id: "final:test", version: "1.0.0",
        adapterRef: { id: "provider:final", version: "1.0.0" },
        agentBindings: task.agents.map(agent => ({
          agentId: agent.agentId,
          modelRef: { id: `model:${agent.agentId}`, version: "1.0.0" }, invocationConfig: {},
        })),
        timeoutMs: 1000, retryPolicy: "none", executionOrder: "sequential_precommitted",
      },
      elicit: vi.fn(),
    } as FinalElicitationAdapterV1;
    await expect(runV6ProductionVerticalSlice({
      outputDir, runId, experimentId: "experiment:test", seed: 1, runIndex: 0,
      study, registry, stratum: { taskFamily: "distributed-binary" },
      primaryMasterSeed: assignmentSeed, eligibleEventMasterSeed: 1, task,
      discussionAdapter, finalElicitationAdapter: finalAdapter, governanceRule: rule,
      interventionContracts: [structuredClone(VERIFICATION_REQUEST_V2), structuredClone(VERIFICATION_ATTENTION_SHAM_V2)],
      clock: deterministicClock(),
    })).rejects.toThrow("assignment but no pre-assignment operational analysis unit");
    expect(discussionAdapter.respond).not.toHaveBeenCalled();
    expect(finalAdapter.elicit).not.toHaveBeenCalled();
  });
});
