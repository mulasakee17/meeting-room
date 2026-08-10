import { describe, expect, it, vi } from "vitest";
import {
  FinalOutcomeSession,
  buildFinalElicitationPrompt,
  createFinalElicitationContract,
  projectFinalOutcomeTaskRecord,
  validateFinalElicitationContract,
  validateFinalOutcomeArtifact,
  type FinalOutcomeResolutionFunction,
} from "../src/lib/experimentation/finalOutcome";
import type { EpistemicClaim } from "../src/lib/epistemic";

const claims: EpistemicClaim[] = [
  {
    id: "claim:binary",
    proposition: "Will the safety constraint hold?",
    domain: "fixture",
    createdAt: "2026-08-10T00:00:00.000Z",
    resolutionPolicy: { kind: "binary", resolverId: "resolver:fixture" },
  },
  {
    id: "claim:choice",
    proposition: "Which option is best?",
    domain: "fixture",
    createdAt: "2026-08-10T00:00:00.000Z",
    options: ["A", "B"],
    resolutionPolicy: { kind: "categorical", resolverId: "resolver:fixture" },
  },
];

const contract = createFinalElicitationContract({
  id: "fixture.final-elicitation",
  version: "1.0.0",
  claimIds: claims.map(claim => claim.id),
});

const scoringTask = {
  groundTruth: {
    taskId: "task:fixture",
    resolverId: "resolver:fixture",
    resolverVersion: "1.0.0",
    value: { "claim:binary": true, "claim:choice": "A" },
  },
  evaluationContractRef: { id: "fixture.evaluation", version: "1.0.0" },
};

const resolver: FinalOutcomeResolutionFunction = (claim, releasedScoringTask, resolvedAt) => ({
  claimId: claim.id,
  resolverId: claim.resolutionPolicy.resolverId,
  resolvedAt,
  kind: claim.resolutionPolicy.kind,
  outcome: (releasedScoringTask.groundTruth.value as Record<string, boolean | string>)[claim.id] as never,
});

function createSession(expectedAgentIds: string[] = ["a", "b"]): FinalOutcomeSession {
  return new FinalOutcomeSession({
    runId: "run:fixture",
    taskId: "task:fixture",
    contract,
    claims,
    expectedAgentIds,
    discussionCompletedAt: "2026-08-10T00:01:00.000Z",
    totalRounds: 3,
    scoringTask,
  });
}

function answered(choiceA: number, binary: number): string {
  return JSON.stringify({
    status: "answered",
    reports: [
      { claimId: "claim:binary", value: { kind: "binary", probability: binary } },
      { claimId: "claim:choice", value: { kind: "categorical", probabilities: { A: choiceA, B: 1 - choiceA } } },
    ],
  });
}

describe("final private outcome lifecycle", () => {
  it("canonicalizes and validates the arm-invariant elicitation contract", () => {
    expect(contract.claimIds).toEqual(["claim:binary", "claim:choice"]);
    expect(() => validateFinalElicitationContract({ ...contract, privacy: "public" })).toThrow(/invariants/);
    expect(() => validateFinalElicitationContract({ ...contract, armLabel: "treatment" })).toThrow(/unexpected fields/);
  });

  it("builds the prompt from an agent-private truth-free view only", () => {
    const prompt = buildFinalElicitationPrompt({
      view: {
        publicContext: "Choose carefully.",
        ownPrivateInformation: "Private fact A.",
        discussionTranscript: [{ round: 1, agentId: "a", content: "I prefer A." }],
      },
      contract,
      claims,
    });
    expect(prompt).toContain("Other agents will not see your response");
    expect(prompt).not.toContain("resolver:fixture");
    expect(() => buildFinalElicitationPrompt({
      view: {
        publicContext: "x",
        ownPrivateInformation: "y",
        discussionTranscript: [],
        groundTruth: "A",
      } as never,
      contract,
      claims,
    })).toThrow(/unexpected fields|truth/);
  });

  it("does not release scoring truth before every agent has a terminal record", () => {
    const session = createSession();
    const resolutionSpy = vi.fn(resolver);
    session.recordRawResponse("a", answered(0.8, 0.7), "2026-08-10T00:02:00.000Z");
    expect(() => session.resolveClaims(resolutionSpy, "2026-08-10T00:04:00.000Z")).toThrow(/after final elicitation closes/);
    expect(() => session.closeElicitation("2026-08-10T00:03:00.000Z")).toThrow(/terminal records/);
    expect(resolutionSpy).not.toHaveBeenCalled();
  });

  it("records abstention as missingness rather than a zero-valued report", () => {
    const session = createSession();
    session.recordRawResponse("a", answered(0.8, 0.7), "2026-08-10T00:02:00.000Z");
    session.recordRawResponse("b", '{"status":"abstained"}', "2026-08-10T00:02:01.000Z");
    session.closeElicitation("2026-08-10T00:03:00.000Z");
    session.resolveClaims(resolver, "2026-08-10T00:04:00.000Z");
    const artifact = session.score("2026-08-10T00:05:00.000Z");
    expect(artifact.claimOutcomes.every(outcome => outcome.reportCoverage === 0.5)).toBe(true);
    expect(artifact.claimOutcomes.every(outcome => outcome.missingAgentIds.includes("b"))).toBe(true);
    expect(artifact.claimOutcomes.every(outcome => outcome.individualScores.length === 1)).toBe(true);
    expect(artifact.claimOutcomes.every(outcome => outcome.excludedAgentIdsByStatus.abstained.includes("b"))).toBe(true);
    expect(() => validateFinalOutcomeArtifact(artifact)).not.toThrow();
    const taskOutcome = projectFinalOutcomeTaskRecord({
      artifact,
      runAssignmentId: "assignment:fixture",
      cost: { totalTokens: 10 },
    });
    expect(taskOutcome).toMatchObject({
      status: "scored",
      sourceFinalOutcomeRef: { runId: "run:fixture" },
    });
  });

  it("turns malformed or partial responses into explicit terminal invalid records", () => {
    const session = createSession();
    const malformed = session.recordRawResponse("a", "not json", "2026-08-10T00:02:00.000Z");
    const partial = session.recordRawResponse("b", JSON.stringify({
      status: "answered",
      reports: [{ claimId: "claim:binary", value: { kind: "binary", probability: 0.6 } }],
    }), "2026-08-10T00:02:01.000Z");
    expect(malformed).toMatchObject({ status: "invalid", diagnosticCode: "invalid_json", reports: [] });
    expect(partial).toMatchObject({
      status: "invalid",
      diagnosticCode: "missing_claim",
      reports: [],
      missingClaimIds: contract.claimIds,
    });
    session.closeElicitation("2026-08-10T00:03:00.000Z");
    session.resolveClaims(resolver, "2026-08-10T00:04:00.000Z");
    expect(() => validateFinalOutcomeArtifact(session.score("2026-08-10T00:05:00.000Z"))).not.toThrow();
  });

  it("accepts an isolated code-fenced JSON object but records parse provenance", () => {
    const session = createSession(["a"]);
    const record = session.recordRawResponse(
      "a",
      `\`\`\`json\n${answered(0.6, 0.6)}\n\`\`\``,
      "2026-08-10T00:02:00.000Z",
    );
    expect(record).toMatchObject({ status: "answered", parseMode: "code_fence_json" });
  });

  it("rejects duplicate agent terminals and post-close mutation", () => {
    const session = createSession(["a"]);
    session.recordRawResponse("a", answered(0.7, 0.7), "2026-08-10T00:02:00.000Z");
    expect(() => session.recordUnavailable("a", "timeout", "2026-08-10T00:02:01.000Z")).toThrow(/already has/);
    session.closeElicitation("2026-08-10T00:03:00.000Z");
    expect(() => session.recordUnavailable("a", "timeout", "2026-08-10T00:03:01.000Z")).toThrow(/closed/);
  });

  it("enforces the precommitted isolated-agent elicitation order", () => {
    const session = createSession(["b", "a"]);
    expect(() => session.recordRawResponse("a", answered(0.7, 0.7), "2026-08-10T00:02:00.000Z"))
      .toThrow(/precommitted/);
    expect(() => session.recordRawResponse("b", answered(0.7, 0.7), "2026-08-10T00:02:00.000Z"))
      .not.toThrow();
  });

  it("keeps artifact snapshots isolated from the session", () => {
    const session = createSession(["a"]);
    session.recordRawResponse("a", answered(0.9, 0.8), "2026-08-10T00:02:00.000Z");
    session.closeElicitation("2026-08-10T00:03:00.000Z");
    session.resolveClaims(resolver, "2026-08-10T00:04:00.000Z");
    const first = session.score("2026-08-10T00:05:00.000Z");
    first.claims[0].proposition = "tampered";
    expect(session.toArtifact().claims[0].proposition).not.toBe("tampered");
  });

  it("replay rejects score, order, and report-identity tampering", () => {
    const session = createSession(["a"]);
    session.recordRawResponse("a", answered(0.9, 0.8), "2026-08-10T00:02:00.000Z");
    session.closeElicitation("2026-08-10T00:03:00.000Z");
    session.resolveClaims(resolver, "2026-08-10T00:04:00.000Z");
    const artifact = session.score("2026-08-10T00:05:00.000Z");

    const scoreTamper = structuredClone(artifact);
    scoreTamper.claimOutcomes[0].pooledProperLoss = 0;
    expect(() => validateFinalOutcomeArtifact(scoreTamper)).toThrow(/do not replay/);

    const orderTamper = structuredClone(artifact);
    orderTamper.scoringCompleted.sequence += 1;
    expect(() => validateFinalOutcomeArtifact(orderTamper)).toThrow(/scoring sequence/);

    const identityTamper = structuredClone(artifact);
    identityTamper.elicitationRecords[0].reports[0].id = "model-chosen-id";
    expect(() => validateFinalOutcomeArtifact(identityTamper)).toThrow(/identity/);

    const rawTamper = structuredClone(artifact);
    rawTamper.elicitationRecords[0].rawResponse = answered(0.1, 0.1);
    expect(() => validateFinalOutcomeArtifact(rawTamper)).toThrow(/does not replay from its rawResponse/);
  });

  it("rejects future/past lifecycle timestamps and resolver metadata drift", () => {
    const tooEarly = createSession(["a"]);
    expect(() => tooEarly.recordRawResponse("a", answered(0.5, 0.5), "2026-08-09T23:59:00.000Z")).toThrow(/must not precede/);

    const session = createSession(["a"]);
    session.recordRawResponse("a", answered(0.5, 0.5), "2026-08-10T00:02:00.000Z");
    session.closeElicitation("2026-08-10T00:03:00.000Z");
    expect(() => session.resolveClaims((claim, _truth, resolvedAt) => ({
      claimId: claim.id,
      resolverId: "wrong-resolver",
      resolvedAt,
      kind: claim.resolutionPolicy.kind,
      outcome: true as never,
    }), "2026-08-10T00:04:00.000Z")).toThrow(/metadata/);
  });
});
