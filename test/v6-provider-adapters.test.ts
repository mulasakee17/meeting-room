/**
 * v6 provider-neutral adapter tests. All adapters wrap an injected
 * SingleAttemptTextInvoker; nothing here reads credentials, retries, or touches
 * the network.
 */

import { describe, expect, it, vi } from "vitest";
import {
  FINAL_ELICITATION_ADAPTER_REQUEST_V1,
  FINAL_ELICITATION_RESPONSE_SCHEMA_V1,
  buildFinalElicitationPrompt,
  createFinalElicitationContract,
  type FinalElicitationAdapterRequestV1,
} from "@/lib/experimentation";
import {
  createV6DiscussionAdapter,
  createV6FinalElicitationAdapter,
  createV6VerificationAdapter,
  type SingleAttemptTextInvokeRequest,
  type SingleAttemptTextInvokeResult,
  type SingleAttemptTextInvoker,
} from "../experiments/campaign/v6/providerAdapters";
import { createV6BinarySmokeFixture } from "../experiments/campaign/v6/v6BinarySmokeFixture";
import { VERIFICATION_SHAM_ACTION_REF_V2 } from "@/lib/governance";
import type {
  V6DiscussionRequestV1,
  V6VerificationRequestV1,
} from "../experiments/campaign/v6/productionVerticalSlice";

const fixture = createV6BinarySmokeFixture();

function mockInvoker(
  handler: (request: SingleAttemptTextInvokeRequest, signal: AbortSignal) => Promise<SingleAttemptTextInvokeResult>,
) {
  const invoke = vi.fn(handler);
  return {
    invoker: { invoke } as SingleAttemptTextInvoker,
    invoke,
  };
}

function discussionRequest(overrides: Partial<V6DiscussionRequestV1> = {}): V6DiscussionRequestV1 {
  return {
    requestSchemaRef: { id: "swarmalpha.v6.discussion-request", version: "1.0.0" },
    requestId: "discussion:run:v6:r1:agent:a",
    runId: "run:v6",
    taskId: fixture.task.id,
    agentId: "agent:a",
    round: 1,
    protocol: "explicit_belief_v1",
    publicContext: fixture.task.publicContext,
    ownPrivateInformation: fixture.task.agents[0].privateInformation,
    claim: fixture.task.claim,
    visibleTranscript: [],
    responseContract: "belief_json_v1",
    modelRef: { id: "model:agent:a", version: "1.0.0" },
    invocationConfig: { temperature: 0 },
    ...overrides,
  };
}

function verificationRequest(overrides: Partial<V6VerificationRequestV1> = {}): V6VerificationRequestV1 {
  return {
    requestSchemaRef: { id: "swarmalpha.v6.verification-request", version: "1.0.0" },
    requestId: "verification:run:v6:action:1",
    runId: "run:v6",
    taskId: fixture.task.id,
    actionRef: { id: "swarmalpha.action.verification-request", version: "2.0.0" },
    targetAgentId: "agent:a",
    claim: fixture.task.claim,
    publicContext: fixture.task.publicContext,
    targetPublicMessage: "The route is reported as clear.",
    matchedTokenBudget: 300,
    modelRef: { id: "model:verifier", version: "1.0.0" },
    invocationConfig: { temperature: 0 },
    ...overrides,
  };
}

function finalRequest(): FinalElicitationAdapterRequestV1 {
  const contract = createFinalElicitationContract({
    id: "fixture.final.smoke",
    version: "1.0.0",
    claimIds: [fixture.task.claim.id],
  });
  const prompt = buildFinalElicitationPrompt({
    view: {
      publicContext: fixture.task.publicContext,
      ownPrivateInformation: fixture.task.agents[0].privateInformation,
      discussionTranscript: [],
    },
    contract,
    claims: [fixture.task.claim],
  });
  return {
    requestSchemaRef: FINAL_ELICITATION_ADAPTER_REQUEST_V1,
    runId: "run:v6",
    agentId: "agent:a",
    sequence: 1,
    prompt,
    responseSchemaRef: FINAL_ELICITATION_RESPONSE_SCHEMA_V1,
    modelRef: { id: "model:agent:a", version: "1.0.0" },
    invocationConfig: { temperature: 0, responseFormat: "json" },
  };
}

const beliefResponse = JSON.stringify({
  message: "public message",
  belief: { kind: "binary", probability: 0.6 },
  evidence: [{ content: "evidence", relation: "supports" }],
});

const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15, latencyMs: 1 };

describe("v6 provider-neutral adapters", () => {
  it("calls the invoker exactly once per adapter call", async () => {
    const m = mockInvoker(async () => ({ rawContent: beliefResponse, usage }));
    const adapter = createV6DiscussionAdapter({ contract: fixture.discussionContract, invoker: m.invoker });
    const result = await adapter.respond(discussionRequest(), new AbortController().signal);
    expect(m.invoke).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("response");
    expect(m.invoke.mock.calls[0][0].responseFormat).toBe("json");

    const v = mockInvoker(async () => ({ rawContent: JSON.stringify({ publicContent: "verified" }) }));
    const verificationAdapter = createV6VerificationAdapter({ contract: fixture.verificationContract, invoker: v.invoker });
    const vResult = await verificationAdapter.verify(verificationRequest(), new AbortController().signal);
    expect(v.invoke).toHaveBeenCalledTimes(1);
    expect(vResult.status).toBe("response");

    const f = mockInvoker(async () => ({
      rawContent: JSON.stringify({ status: "answered", reports: [] }),
      usage,
    }));
    const finalAdapter = createV6FinalElicitationAdapter({ contract: fixture.finalContract, invoker: f.invoker });
    const fResult = await finalAdapter.elicit(finalRequest(), new AbortController().signal);
    expect(f.invoke).toHaveBeenCalledTimes(1);
    expect(fResult.status).toBe("response");
    if (fResult.status === "response") expect(fResult.usage).toEqual(usage);
    expect(f.invoke.mock.calls[0][0].responseFormat).toBe("json");
  });

  it("never retries when the invoker throws; the error propagates", async () => {
    const m = mockInvoker(async () => { throw new Error("provider down"); });
    const adapter = createV6DiscussionAdapter({ contract: fixture.discussionContract, invoker: m.invoker });
    await expect(adapter.respond(discussionRequest(), new AbortController().signal)).rejects.toThrow("provider down");
    expect(m.invoke).toHaveBeenCalledTimes(1);

    const f = mockInvoker(async () => { throw new Error("provider down"); });
    const finalAdapter = createV6FinalElicitationAdapter({ contract: fixture.finalContract, invoker: f.invoker });
    await expect(finalAdapter.elicit(finalRequest(), new AbortController().signal)).rejects.toThrow("provider down");
    expect(f.invoke).toHaveBeenCalledTimes(1);
  });

  it("passes the AbortSignal through to the invoker", async () => {
    let seenSignal: AbortSignal | undefined;
    const m = mockInvoker(async (_request, signal) => { seenSignal = signal; return { rawContent: beliefResponse }; });
    const adapter = createV6DiscussionAdapter({ contract: fixture.discussionContract, invoker: m.invoker });
    const controller = new AbortController();
    await adapter.respond(discussionRequest(), controller.signal);
    expect(seenSignal).toBe(controller.signal);
  });

  it("builds a discussion request without ground truth or resolver outcome", async () => {
    const m = mockInvoker(async () => ({ rawContent: beliefResponse }));
    const adapter = createV6DiscussionAdapter({ contract: fixture.discussionContract, invoker: m.invoker });
    await adapter.respond(discussionRequest(), new AbortController().signal);
    const sent = JSON.stringify(m.invoke.mock.calls[0][0]);
    expect(sent).not.toContain("groundTruth");
    expect(sent).not.toContain("resolver:v6-smoke");
    expect(sent).not.toContain("outcome");
    expect(sent).toContain("Sensor A reports a clear route.");
    expect(sent).not.toContain("Sensor B reports unstable ice.");
  });

  it("sends the final prompt verbatim with no truth, resolver outcome, or other-agent private view", async () => {
    const m = mockInvoker(async () => ({ rawContent: JSON.stringify({ status: "answered", reports: [] }) }));
    const adapter = createV6FinalElicitationAdapter({ contract: fixture.finalContract, invoker: m.invoker });
    const request = finalRequest();
    await adapter.elicit(request, new AbortController().signal);
    const sent = m.invoke.mock.calls[0][0];
    expect(sent.userPrompt).toBe(request.prompt);
    const serialized = JSON.stringify(sent);
    expect(serialized).not.toContain("groundTruth");
    expect(serialized).not.toContain("resolver:v6-smoke");
    expect(serialized).not.toContain("Sensor B reports unstable ice.");
  });

  it("builds a verification request with no private information", async () => {
    const m = mockInvoker(async () => ({ rawContent: JSON.stringify({ publicContent: "verified" }) }));
    const adapter = createV6VerificationAdapter({ contract: fixture.verificationContract, invoker: m.invoker });
    await adapter.verify(verificationRequest(), new AbortController().signal);
    const serialized = JSON.stringify(m.invoke.mock.calls[0][0]);
    // The prompt carries the public message to verify, but never any agent's
    // privateInformation and never task truth.
    expect(serialized).toContain("The route is reported as clear.");
    expect(serialized).not.toContain("Sensor A reports a clear route.");
    expect(serialized).not.toContain("Sensor B reports unstable ice.");
    expect(serialized).not.toContain("groundTruth");
  });

  it("accepts only public verification content and rejects model-supplied compliance", async () => {
    const valid = mockInvoker(async () => ({
      rawContent: JSON.stringify({ publicContent: "verified" }),
      usage,
    }));
    const adapter = createV6VerificationAdapter({ contract: fixture.verificationContract, invoker: valid.invoker });
    const result = await adapter.verify(verificationRequest(), new AbortController().signal);
    expect(result).toEqual({ status: "response", publicContent: "verified", usage });

    const selfReported = mockInvoker(async () => ({
      rawContent: JSON.stringify({ publicContent: "verified", complied: false }),
      usage,
    }));
    const rejected = await createV6VerificationAdapter({
      contract: fixture.verificationContract,
      invoker: selfReported.invoker,
    }).verify(verificationRequest(), new AbortController().signal);
    expect(rejected).toEqual({ status: "unavailable", diagnosticCode: "adapter_unavailable", usage });
    expect(selfReported.invoke).toHaveBeenCalledTimes(1);
  });

  it("makes the matched sham truth-free and discards model-authored content", async () => {
    const sham = mockInvoker(async () => ({
      rawContent: JSON.stringify({ acknowledgment: "control completed with a substantive-looking payload" }),
      usage,
    }));
    const adapter = createV6VerificationAdapter({ contract: fixture.verificationContract, invoker: sham.invoker });
    const result = await adapter.verify(verificationRequest({
      actionRef: VERIFICATION_SHAM_ACTION_REF_V2,
    }), new AbortController().signal);
    expect(result).toEqual({
      status: "response",
      publicContent: "Matched control completed; no new evidence was introduced.",
      usage,
    });
    const sent = JSON.stringify(sham.invoke.mock.calls[0][0]);
    expect(sent).not.toContain(fixture.task.claim.proposition);
    expect(sent).not.toContain("The route is reported as clear.");
    expect(sent).not.toContain(fixture.task.publicContext);
    expect(JSON.stringify(result)).not.toContain("substantive-looking payload");
  });

  it("rejects credential-like invocation config before any provider call", async () => {
    const m = mockInvoker(async () => ({ rawContent: beliefResponse }));
    const adapter = createV6DiscussionAdapter({ contract: fixture.discussionContract, invoker: m.invoker });
    await expect(adapter.respond(
      discussionRequest({ invocationConfig: { apiKey: "secret" } as never }),
      new AbortController().signal,
    )).rejects.toThrow(/credential-like/);
    expect(m.invoke).not.toHaveBeenCalled();
  });

  it("does not issue a second request for a malformed response", async () => {
    const d = mockInvoker(async () => ({ rawContent: "not-json", usage }));
    const adapter = createV6DiscussionAdapter({ contract: fixture.discussionContract, invoker: d.invoker });
    const result = await adapter.respond(discussionRequest(), new AbortController().signal);
    expect(result.status).toBe("response");
    if (result.status === "response") expect(result.rawResponse).toBe("not-json");
    expect(d.invoke).toHaveBeenCalledTimes(1);

    const v = mockInvoker(async () => ({ rawContent: "not-json" }));
    const verificationAdapter = createV6VerificationAdapter({ contract: fixture.verificationContract, invoker: v.invoker });
    const vResult = await verificationAdapter.verify(verificationRequest(), new AbortController().signal);
    expect(vResult).toEqual({ status: "unavailable", diagnosticCode: "adapter_unavailable" });
    expect(v.invoke).toHaveBeenCalledTimes(1);
  });

  it("maps usage through to the adapter result", async () => {
    const m = mockInvoker(async () => ({ rawContent: beliefResponse, usage }));
    const adapter = createV6DiscussionAdapter({ contract: fixture.discussionContract, invoker: m.invoker });
    const result = await adapter.respond(discussionRequest(), new AbortController().signal);
    expect(result.status).toBe("response");
    if (result.status === "response") expect(result.usage).toEqual(usage);
  });

  it("passes the precommitted model ref and invocation config through unchanged", async () => {
    const m = mockInvoker(async () => ({ rawContent: beliefResponse }));
    const adapter = createV6DiscussionAdapter({ contract: fixture.discussionContract, invoker: m.invoker });
    const request = discussionRequest();
    await adapter.respond(request, new AbortController().signal);
    expect(m.invoke.mock.calls[0][0].modelRef).toEqual(request.modelRef);
    expect(m.invoke.mock.calls[0][0].invocationConfig).toEqual(request.invocationConfig);

    const v = mockInvoker(async () => ({ rawContent: JSON.stringify({ publicContent: "verified" }) }));
    const verificationAdapter = createV6VerificationAdapter({ contract: fixture.verificationContract, invoker: v.invoker });
    const vRequest = verificationRequest();
    await verificationAdapter.verify(vRequest, new AbortController().signal);
    expect(v.invoke.mock.calls[0][0].modelRef).toEqual(vRequest.modelRef);
    expect(v.invoke.mock.calls[0][0].invocationConfig).toEqual(vRequest.invocationConfig);
  });
});
