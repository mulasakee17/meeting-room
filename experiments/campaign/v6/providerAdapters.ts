/**
 * Provider-neutral, credential-free, single-attempt adapter scaffolding for the
 * v6 production vertical slice.
 *
 * These adapters own no credentials, read no environment, and never retry. The
 * single-attempt boundary is injected as `SingleAttemptTextInvoker`; the smoke
 * CLI supplies the separately audited DeepSeek implementation only when the
 * operator explicitly passes `--execute`.
 *
 * Each adapter calls the invoker at most once per adapter call, passes the
 * AbortSignal through, and does not swallow timeouts/aborts: on invoker error
 * the error propagates and the vertical slice / collection layer maps it to an
 * explicit unavailable/provider_error terminal state.
 */

import {
  VERIFICATION_SHAM_ACTION_REF_V2,
  governanceRefKey,
  type VersionedGovernanceRef,
} from "../../../src/lib/governance";
import type {
  FinalElicitationAdapterContractV1,
  FinalElicitationAdapterRequestV1,
  FinalElicitationAdapterV1,
} from "../../../src/lib/experimentation";
import type {
  V6DiscussionAdapterContractV1,
  V6DiscussionAdapterV1,
  V6DiscussionRequestV1,
  V6ProviderUsage,
  V6VerificationAdapterContractV1,
  V6VerificationAdapterV1,
  V6VerificationRequestV1,
} from "./productionVerticalSlice";

/** A single, non-retrying text completion request. */
export interface SingleAttemptTextInvokeRequest {
  requestId: string;
  systemPrompt: string;
  userPrompt: string;
  /** Derived from the frozen response contract, never selected by the model. */
  responseFormat: "text" | "json";
  modelRef: VersionedGovernanceRef;
  invocationConfig: Record<string, unknown>;
}

export interface SingleAttemptTextInvokeResult {
  rawContent: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs?: number;
  };
}

/** The only provider boundary the v6 adapters may use. */
export interface SingleAttemptTextInvoker {
  invoke(
    request: Readonly<SingleAttemptTextInvokeRequest>,
    signal: AbortSignal,
  ): Promise<SingleAttemptTextInvokeResult>;
}

const CREDENTIAL_KEY_RE = /(^|[_-])(api[-_]?key|secret|password|authorization|credential|access[-_]?token|refresh[-_]?token)($|[_-])/i;

function rejectCredentialKeys(value: unknown, field: string): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectCredentialKeys(child, `${field}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (CREDENTIAL_KEY_RE.test(key)) throw new Error(`${field} must not carry credential-like field ${key}`);
    rejectCredentialKeys(child, `${field}.${key}`);
  }
}

function nonSecretConfig(config: Record<string, unknown>, field: string): Record<string, unknown> {
  rejectCredentialKeys(config, field);
  return structuredClone(config);
}

function withUsage(result: SingleAttemptTextInvokeResult): { usage?: V6ProviderUsage } {
  if (!result.usage) return {};
  return {
    usage: {
      ...(result.usage.promptTokens !== undefined ? { promptTokens: result.usage.promptTokens } : {}),
      ...(result.usage.completionTokens !== undefined ? { completionTokens: result.usage.completionTokens } : {}),
      ...(result.usage.totalTokens !== undefined ? { totalTokens: result.usage.totalTokens } : {}),
      ...(result.usage.latencyMs !== undefined ? { latencyMs: result.usage.latencyMs } : {}),
    },
  };
}

function buildDiscussionPrompts(request: V6DiscussionRequestV1): { systemPrompt: string; userPrompt: string } {
  const transcript = request.visibleTranscript
    .map(entry => `[round ${entry.round}] ${entry.agentId}${entry.source === "governance" ? " (governance)" : ""}: ${entry.content}`)
    .join("\n");
  const categoricalOptions = "options" in request.claim ? request.claim.options : undefined;
  const beliefInstruction = request.claim.resolutionPolicy.kind === "binary"
    ? "Return exactly one strict JSON object with fields: message (string), belief ({kind:'binary', probability: 0..1}), evidence (array of {content, relation:'supports'|'attacks', lineageId?}). No other fields."
    : `Return exactly one strict JSON object with fields: message (string), belief ({kind:'categorical', probabilities:{...}}), evidence (array of {content, relation:'supports'|'attacks', lineageId?}). The probabilities object must contain exactly these canonical options in this order and sum to 1: ${(categoricalOptions ?? []).join(" | ")}. No other fields.`;
  const userPrompt = [
    `Task public context:\n${request.publicContext}`,
    `Your private information:\n${request.ownPrivateInformation}`,
    `Visible discussion transcript:\n${transcript || "(none)"}`,
    `Claim ${request.claim.id}: ${request.claim.proposition}`,
    request.responseContract === "plain_text"
      ? "Return your public view as plain text only."
      : beliefInstruction,
  ].join("\n\n");
  return {
    systemPrompt: request.responseContract === "plain_text"
      ? "You are an analyst in a multi-agent group discussion."
      : "You are an analyst in a multi-agent group discussion. Report your final belief as strict JSON.",
    userPrompt,
  };
}

/**
 * Discussion adapter. For T it passes the model's plain text through; for B/G
 * it instructs the strict belief-JSON shape that the vertical slice parses. It
 * never repairs or re-asks for malformed JSON; a malformed raw response becomes
 * an explicit invalid discussion call in the vertical slice.
 */
export function createV6DiscussionAdapter(input: {
  contract: V6DiscussionAdapterContractV1;
  invoker: SingleAttemptTextInvoker;
}): V6DiscussionAdapterV1 {
  return {
    contract: input.contract,
    async respond(request: Readonly<V6DiscussionRequestV1>, signal: AbortSignal) {
      const { systemPrompt, userPrompt } = buildDiscussionPrompts(request);
      const result = await input.invoker.invoke({
        requestId: request.requestId,
        systemPrompt,
        userPrompt,
        responseFormat: request.responseContract === "plain_text" ? "text" : "json",
        modelRef: structuredClone(request.modelRef),
        invocationConfig: nonSecretConfig(request.invocationConfig, "v6 discussion invocationConfig"),
      }, signal);
      return { status: "response", rawResponse: result.rawContent, ...withUsage(result) };
    },
  };
}

/**
 * Verification adapter. Its prompt contains only public context, the claim,
 * the target public message, and the action/request identity — never task truth
 * or any agent's private information. A valid response establishes delivery,
 * so compliance is set by the architecture; the model never self-reports it.
 * This observation does not claim that the intervention was effective.
 */
export function createV6VerificationAdapter(input: {
  contract: V6VerificationAdapterContractV1;
  invoker: SingleAttemptTextInvoker;
}): V6VerificationAdapterV1 {
  return {
    contract: input.contract,
    async verify(request: Readonly<V6VerificationRequestV1>, signal: AbortSignal) {
      const isSham = governanceRefKey(request.actionRef) === governanceRefKey(VERIFICATION_SHAM_ACTION_REF_V2);
      const userPrompt = isSham
        ? [
            "This is a matched process-control request.",
            "Do not assess any claim, message, evidence, or likely answer.",
            "Return exactly one strict JSON object with one field: acknowledgment (string). No other fields.",
          ].join("\n\n")
        : [
            `Task public context:\n${request.publicContext}`,
            `Claim ${request.claim.id}: ${request.claim.proposition}`,
            `Public message to verify:\n${request.targetPublicMessage}`,
            "Give an independent verification of the public message relative to the claim.",
            'Return exactly one strict JSON object with one field: publicContent (string). No other fields.',
          ].join("\n\n");
      const result = await input.invoker.invoke({
        requestId: request.requestId,
        systemPrompt: isSham
          ? "You are executing a matched process-control call; provide no task evidence."
          : "You are an independent verifier.",
        userPrompt,
        responseFormat: "json",
        modelRef: structuredClone(request.modelRef),
        invocationConfig: nonSecretConfig(request.invocationConfig, "v6 verification invocationConfig"),
      }, signal);
      if (isSham) {
        let parsed: { acknowledgment?: unknown } | null = null;
        try {
          parsed = JSON.parse(result.rawContent) as { acknowledgment?: unknown };
        } catch {
          parsed = null;
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
          || typeof parsed.acknowledgment !== "string" || parsed.acknowledgment.trim().length === 0
          || Object.keys(parsed).some(key => key !== "acknowledgment")) {
          return { status: "unavailable", diagnosticCode: "adapter_unavailable", ...withUsage(result) };
        }
        return {
          status: "response",
          publicContent: "Matched control completed; no new evidence was introduced.",
          ...withUsage(result),
        };
      }
      let parsed: { publicContent?: unknown } | null = null;
      try {
        parsed = JSON.parse(result.rawContent) as { publicContent?: unknown };
      } catch {
        parsed = null;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
        || typeof parsed.publicContent !== "string" || parsed.publicContent.trim().length === 0
        || Object.keys(parsed).some(key => key !== "publicContent")) {
        return { status: "unavailable", diagnosticCode: "adapter_unavailable", ...withUsage(result) };
      }
      return {
        status: "response",
        publicContent: parsed.publicContent,
        ...withUsage(result),
      };
    },
  };
}

/**
 * Final elicitation adapter. It sends the final prompt verbatim with no
 * correctness feedback and never retries; an invoker failure propagates and is
 * mapped to provider_error by the collection layer (never a fabricated answer).
 */
export function createV6FinalElicitationAdapter(input: {
  contract: FinalElicitationAdapterContractV1;
  invoker: SingleAttemptTextInvoker;
}): FinalElicitationAdapterV1 {
  return {
    contract: input.contract,
    async elicit(request: Readonly<FinalElicitationAdapterRequestV1>, signal: AbortSignal) {
      const result = await input.invoker.invoke({
        requestId: `final:${request.runId}:${request.agentId}`,
        systemPrompt: "You are completing a private outcome measurement.",
        userPrompt: request.prompt,
        responseFormat: "json",
        modelRef: structuredClone(request.modelRef),
        invocationConfig: nonSecretConfig(request.invocationConfig, "v6 final invocationConfig"),
      }, signal);
      return { status: "response", rawResponse: result.rawContent, ...withUsage(result) };
    },
  };
}

/** Build all three adapters from one injected invoker. */
export function createV6Adapters(input: {
  discussionContract: V6DiscussionAdapterContractV1;
  verificationContract: V6VerificationAdapterContractV1;
  finalContract: FinalElicitationAdapterContractV1;
  invoker: SingleAttemptTextInvoker;
}) {
  return {
    discussionAdapter: createV6DiscussionAdapter({ contract: input.discussionContract, invoker: input.invoker }),
    verificationAdapter: createV6VerificationAdapter({ contract: input.verificationContract, invoker: input.invoker }),
    finalElicitationAdapter: createV6FinalElicitationAdapter({ contract: input.finalContract, invoker: input.invoker }),
  };
}
