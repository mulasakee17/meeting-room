import { describe, expect, it, vi } from "vitest";
import type { EpistemicClaim } from "@/lib/epistemic";
import {
  FinalOutcomeSession,
  collectFinalElicitationV1,
  computeFinalElicitationCollectionHash,
  createFinalElicitationContract,
  validateFinalElicitationAdapterContractV1,
  validateFinalElicitationCollectionArtifactV1,
  validateFinalElicitationCollectionForOutcomeV1,
  type FinalElicitationAdapterContractV1,
  type FinalElicitationAdapterV1,
} from "@/lib/experimentation";

const claims: EpistemicClaim[] = [{
  id: "claim:binary",
  proposition: "Will the constraint hold?",
  domain: "fixture",
  createdAt: "2026-08-10T00:00:00.000Z",
  resolutionPolicy: { kind: "binary", resolverId: "resolver:fixture" },
}];
const contract = createFinalElicitationContract({
  id: "elicitation:test",
  version: "1.0.0",
  claimIds: ["claim:binary"],
});
const scoringTask = {
  groundTruth: {
    taskId: "task:fixture",
    resolverId: "resolver:fixture",
    resolverVersion: "1.0.0",
    value: { "claim:binary": true },
  },
  evaluationContractRef: { id: "evaluation:fixture", version: "1.0.0" },
};

function adapterContract(): FinalElicitationAdapterContractV1 {
  return {
    id: "final-adapter:test",
    version: "1.0.0",
    adapterRef: { id: "provider-adapter:test", version: "1.0.0" },
    agentBindings: ["a", "b"].map(agentId => ({
      agentId,
      modelRef: { id: `model:${agentId}`, version: "1.0.0" },
      invocationConfig: { temperature: 0, responseFormat: "json" },
    })),
    timeoutMs: 1000,
    retryPolicy: "none",
    executionOrder: "sequential_precommitted",
  };
}

function session(): FinalOutcomeSession {
  return new FinalOutcomeSession({
    runId: "run:fixture",
    taskId: "task:fixture",
    contract,
    claims,
    expectedAgentIds: ["a", "b"],
    discussionCompletedAt: "2026-08-10T00:01:00.000Z",
    totalRounds: 2,
    scoringTask,
  });
}

const views = {
  a: { publicContext: "public", ownPrivateInformation: "private-a", discussionTranscript: [] },
  b: { publicContext: "public", ownPrivateInformation: "private-b", discussionTranscript: [] },
};

describe("final elicitation production adapter boundary", () => {
  it("passes only a truth-free request and records provider failure as terminal missingness", async () => {
    const elicit = vi.fn<FinalElicitationAdapterV1["elicit"]>()
      .mockResolvedValueOnce({
        status: "response",
        rawResponse: JSON.stringify({
          status: "answered",
          reports: [{ claimId: "claim:binary", value: { kind: "binary", probability: 0.7 } }],
        }),
        usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10, latencyMs: 5 },
      })
      .mockRejectedValueOnce(new Error("provider failed"));
    const adapter: FinalElicitationAdapterV1 = { contract: adapterContract(), elicit };
    const times = [
      "2026-08-10T00:02:00.000Z",
      "2026-08-10T00:02:01.000Z",
      "2026-08-10T00:02:02.000Z",
      "2026-08-10T00:02:03.000Z",
    ];
    const outcomeSession = session();
    const collection = await collectFinalElicitationV1({
      runId: "run:fixture",
      contract,
      claims,
      expectedAgentIds: ["a", "b"],
      viewsByAgent: views,
      session: outcomeSession,
      adapter,
      clock: () => times.shift()!,
    });
    expect(elicit).toHaveBeenCalledTimes(2);
    expect(elicit.mock.calls.map(call => call[0].agentId)).toEqual(["a", "b"]);
    expect(JSON.stringify(elicit.mock.calls[0][0])).not.toContain("groundTruth");
    expect(JSON.stringify(elicit.mock.calls[0][0])).not.toContain("resolver:fixture");
    expect(collection.records.map(record => record.status)).toEqual(["answered", "unavailable"]);
    expect(collection.records[0].usage).toEqual({
      promptTokens: 7, completionTokens: 3, totalTokens: 10, latencyMs: 5,
    });
    expect(collection.records[1].usage).toBeUndefined();
    expect(collection.records[1].diagnosticCode).toBe("provider_error");
    expect(outcomeSession.state).toBe("elicitation_open");
    expect(() => outcomeSession.resolveClaims(() => { throw new Error("truth used"); }, "2026-08-10T00:03:00.000Z"))
      .toThrow("after final elicitation closes");
  });

  it("rejects persisted credentials and retry-enabled measurement policies", () => {
    expect(() => validateFinalElicitationAdapterContractV1({
      ...adapterContract(),
      agentBindings: [{
        ...adapterContract().agentBindings[0],
        invocationConfig: { apiKey: "secret" },
      }],
    })).toThrow("must not persist credential-like field");
    expect(() => validateFinalElicitationAdapterContractV1({
      ...adapterContract(),
      retryPolicy: "retry_once" as never,
    })).toThrow("forbids retries");
  });

  it("rejects collection inputs that do not exactly match the session", async () => {
    const adapter: FinalElicitationAdapterV1 = {
      contract: adapterContract(),
      elicit: vi.fn(),
    };
    await expect(collectFinalElicitationV1({
      runId: "run:other",
      contract,
      claims,
      expectedAgentIds: ["a", "b"],
      viewsByAgent: views,
      session: session(),
      adapter,
    })).rejects.toThrow("do not match the outcome session");
    expect(adapter.elicit).not.toHaveBeenCalled();
  });
});

describe("F5 final elicitation adapter adversarial edges", () => {
  const answeredResponse = JSON.stringify({
    status: "answered",
    reports: [{ claimId: "claim:binary", value: { kind: "binary", probability: 0.7 } }],
  });

  function successAdapter(): FinalElicitationAdapterV1 {
    return {
      contract: adapterContract(),
      elicit: vi.fn().mockResolvedValue({ status: "response", rawResponse: answeredResponse }),
    };
  }

  function runCollection(
    adapter: FinalElicitationAdapterV1,
    clock = (() => {
      const times = [
        "2026-08-10T00:02:00.000Z",
        "2026-08-10T00:02:01.000Z",
        "2026-08-10T00:02:02.000Z",
        "2026-08-10T00:02:03.000Z",
      ];
      return () => times.shift()!;
    })(),
  ) {
    return collectFinalElicitationV1({
      runId: "run:fixture",
      contract,
      claims,
      expectedAgentIds: ["a", "b"],
      viewsByAgent: views,
      session: session(),
      adapter,
      clock,
    });
  }

  it("resolves heterogeneous modelRef/invocationConfig in exact precommitted order", async () => {
    const adapter = successAdapter();
    const collection = await runCollection(adapter);
    const calls = (adapter.elicit as ReturnType<typeof vi.fn>).mock.calls as Array<[FinalElicitationAdapterV1["elicit"] extends (...a: infer P) => unknown ? P[0] : never]>;
    const contract = adapter.contract;
    expect(calls.map(call => call[0].modelRef)).toEqual(contract.agentBindings.map(binding => binding.modelRef));
    expect(calls.map(call => call[0].invocationConfig))
      .toEqual(contract.agentBindings.map(binding => binding.invocationConfig));
    expect(collection.records.map(record => record.agentId)).toEqual(["a", "b"]);
  });

  it("rejects missing, extra, or reordered agent bindings before any provider call", async () => {
    const base = adapterContract();
    const missing: FinalElicitationAdapterContractV1 = {
      ...base,
      agentBindings: base.agentBindings.slice(0, 1),
    };
    await expect(runCollection({ contract: missing, elicit: vi.fn() }))
      .rejects.toThrow("must exactly follow precommitted agent order");

    const extra: FinalElicitationAdapterContractV1 = {
      ...base,
      agentBindings: [
        ...base.agentBindings,
        { agentId: "c", modelRef: { id: "model:c", version: "1.0.0" }, invocationConfig: {} },
      ],
    };
    await expect(runCollection({ contract: extra, elicit: vi.fn() }))
      .rejects.toThrow("must exactly follow precommitted agent order");

    const reordered: FinalElicitationAdapterContractV1 = {
      ...base,
      agentBindings: [base.agentBindings[1], base.agentBindings[0]],
    };
    await expect(runCollection({ contract: reordered, elicit: vi.fn() }))
      .rejects.toThrow("must exactly follow precommitted agent order");

    expect(() => validateFinalElicitationAdapterContractV1({
      ...base,
      agentBindings: [base.agentBindings[0], { ...base.agentBindings[0] }],
    })).toThrow("identify each agent once");
  });

  it("rejects extra or missing private views before any provider call", async () => {
    const adapter = successAdapter();
    await expect(collectFinalElicitationV1({
      runId: "run:fixture",
      contract,
      claims,
      expectedAgentIds: ["a", "b"],
      viewsByAgent: { a: views.a },
      session: session(),
      adapter,
      clock: () => "2026-08-10T00:02:00.000Z",
    })).rejects.toThrow("views must cover exactly the precommitted agents");
    await expect(collectFinalElicitationV1({
      runId: "run:fixture",
      contract,
      claims,
      expectedAgentIds: ["a", "b"],
      viewsByAgent: { ...views, c: views.a },
      session: session(),
      adapter,
      clock: () => "2026-08-10T00:02:00.000Z",
    })).rejects.toThrow("views must cover exactly the precommitted agents");
    expect(adapter.elicit).not.toHaveBeenCalled();
  });

  it("passes no other-agent private view, scoring truth, resolver, or discussion engine in the request", async () => {
    const adapter = successAdapter();
    await runCollection(adapter);
    const calls = (adapter.elicit as ReturnType<typeof vi.fn>).mock.calls as Array<[{ prompt: string }]>;
    expect(calls[0][0].prompt).not.toContain("private-b");
    for (const call of calls) {
      const serialized = JSON.stringify(call[0]);
      expect(serialized).not.toContain("groundTruth");
      expect(serialized).not.toContain("resolver:fixture");
      expect(serialized).not.toContain("discussionEngine");
      expect(serialized).not.toContain("apiKey");
    }
  });

  it("rejects nested or case-varied credential-like invocation config keys", () => {
    const base = adapterContract();
    expect(() => validateFinalElicitationAdapterContractV1({
      ...base,
      agentBindings: [{ ...base.agentBindings[0], invocationConfig: { nested: { api_key: "x" } } }],
    })).toThrow("must not persist credential-like field");
    expect(() => validateFinalElicitationAdapterContractV1({
      ...base,
      agentBindings: [{ ...base.agentBindings[0], invocationConfig: { Authorization_TOKEN: "x" } }],
    })).toThrow("must not persist credential-like field");
  });

  it("rejects a request before discussion completion and noncanonical timestamps", async () => {
    const adapter = successAdapter();
    await expect(collectFinalElicitationV1({
      runId: "run:fixture",
      contract,
      claims,
      expectedAgentIds: ["a", "b"],
      viewsByAgent: views,
      session: session(),
      adapter,
      clock: () => "2026-08-10T00:00:30.000Z",
    })).rejects.toThrow("cannot begin before discussion completion");

    const nonCanonical = successAdapter();
    await expect(collectFinalElicitationV1({
      runId: "run:fixture",
      contract,
      claims,
      expectedAgentIds: ["a", "b"],
      viewsByAgent: views,
      session: session(),
      adapter: nonCanonical,
      clock: () => "2026-08-10T00:02:00Z",
    })).rejects.toThrow("must be a canonical ISO timestamp");
    expect(adapter.elicit).not.toHaveBeenCalled();
    expect(nonCanonical.elicit).not.toHaveBeenCalled();
  });

  it("maps malformed results, explicit unavailable, and timeout to one terminal record per agent without retry", async () => {
    const malformed = successAdapter();
    malformed.elicit = vi.fn().mockResolvedValue({ status: "response", rawResponse: "not json", extra: 1 });
    const c1 = await runCollection(malformed);
    expect(c1.records.every(record => record.status === "unavailable" && record.diagnosticCode === "provider_error")).toBe(true);
    expect(malformed.elicit).toHaveBeenCalledTimes(2);

    const unavailable: FinalElicitationAdapterV1 = {
      contract: adapterContract(),
      elicit: vi.fn().mockResolvedValue({ status: "unavailable", diagnosticCode: "adapter_unavailable" }),
    };
    const c2 = await runCollection(unavailable);
    expect(c2.records.every(record => record.status === "unavailable" && record.diagnosticCode === "adapter_unavailable")).toBe(true);
    expect(unavailable.elicit).toHaveBeenCalledTimes(2);

    const timeout: FinalElicitationAdapterV1 = {
      contract: { ...adapterContract(), timeoutMs: 5 },
      elicit: vi.fn().mockReturnValue(new Promise(() => {})),
    };
    const c3 = await runCollection(timeout);
    expect(c3.records.every(record => record.status === "unavailable" && record.diagnosticCode === "timeout")).toBe(true);
    expect(timeout.elicit).toHaveBeenCalledTimes(2);
  });

  it("rejects collection contentHash, promptHash, and status tampering", async () => {
    const collection = await runCollection(successAdapter());

    const hashTamper = structuredClone(collection);
    hashTamper.contentHash = `sha256:${"a".repeat(64)}`;
    expect(() => validateFinalElicitationCollectionArtifactV1(hashTamper))
      .toThrow("contentHash mismatch");

    const promptTamper = structuredClone(collection);
    promptTamper.records[0].promptHash = `sha256:${"b".repeat(64)}`;
    expect(() => validateFinalElicitationCollectionArtifactV1(promptTamper))
      .toThrow("contentHash mismatch");

    const statusTamper = structuredClone(collection);
    statusTamper.records[0].status = "unavailable";
    const { contentHash: _ch, ...body } = statusTamper;
    statusTamper.contentHash = computeFinalElicitationCollectionHash(body);
    expect(() => validateFinalElicitationCollectionArtifactV1(statusTamper))
      .toThrow("invalid diagnosticCode");
  });

  it("commits provider usage and rejects malformed or tampered accounting", async () => {
    const adapter = successAdapter();
    adapter.elicit = vi.fn().mockResolvedValue({
      status: "response",
      rawResponse: answeredResponse,
      usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10, latencyMs: 4 },
    });
    const collection = await runCollection(adapter);
    expect(collection.records.every(record => record.usage?.totalTokens === 10)).toBe(true);

    const tampered = structuredClone(collection);
    tampered.records[0].usage!.totalTokens = 11;
    const { contentHash: _contentHash, ...body } = tampered;
    tampered.contentHash = computeFinalElicitationCollectionHash(body);
    expect(() => validateFinalElicitationCollectionArtifactV1(tampered))
      .toThrow("totalTokens must equal promptTokens + completionTokens");

    const malformed = successAdapter();
    malformed.elicit = vi.fn().mockResolvedValue({
      status: "response",
      rawResponse: answeredResponse,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 5 },
    });
    const mapped = await runCollection(malformed);
    expect(mapped.records.every(record => record.status === "unavailable"
      && record.diagnosticCode === "provider_error" && record.usage === undefined)).toBe(true);
  });

  it("rejects a collection that disagrees with the final outcome artifact", async () => {
    const collection = await runCollection(successAdapter());
    const outcomeSession = session();
    outcomeSession.recordRawResponse("a", answeredResponse, "2026-08-10T00:03:00.000Z");
    outcomeSession.recordRawResponse("b", answeredResponse, "2026-08-10T00:03:01.000Z");
    outcomeSession.closeElicitation("2026-08-10T00:04:00.000Z");
    outcomeSession.resolveClaims((claim, releasedScoringTask, resolvedAt) => ({
      claimId: claim.id,
      resolverId: claim.resolutionPolicy.resolverId,
      resolvedAt,
      kind: claim.resolutionPolicy.kind,
      outcome: (releasedScoringTask.groundTruth.value as Record<string, boolean | string>)[claim.id] as never,
    }), "2026-08-10T00:05:00.000Z");
    const outcome = outcomeSession.score("2026-08-10T00:06:00.000Z");
    expect(() => validateFinalElicitationCollectionForOutcomeV1(collection, outcome))
      .toThrow("record differs from finalOutcome");
  });
});
