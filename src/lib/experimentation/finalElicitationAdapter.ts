import { createHash } from "node:crypto";
import {
  governanceRefKey,
  validateGovernanceRef,
  validateReplayableGovernanceValue,
  type VersionedGovernanceRef,
} from "../governance/controlContracts";
import type { EpistemicClaim } from "../epistemic/types";
import {
  FINAL_ELICITATION_RESPONSE_SCHEMA_V1,
  FinalOutcomeSession,
  buildFinalElicitationPrompt,
  validateFinalElicitationContract,
  validateFinalElicitationView,
  type FinalElicitationContractV1,
  type FinalElicitationDiagnosticCode,
  type FinalElicitationViewV1,
  type FinalOutcomeArtifactV1,
} from "./finalOutcome";
import { rethrowProviderExecutionHalt } from "./providerExecution";

export const FINAL_ELICITATION_ADAPTER_REQUEST_V1 = Object.freeze({
  id: "swarmalpha.final-elicitation.adapter-request",
  version: "1.0.0",
});

export const FINAL_ELICITATION_COLLECTION_V1 = Object.freeze({
  id: "swarmalpha.final-elicitation.collection",
  version: "1.0.0",
});

export interface FinalElicitationAdapterContractV1 {
  id: string;
  version: string;
  adapterRef: VersionedGovernanceRef;
  agentBindings: Array<{
    agentId: string;
    modelRef: VersionedGovernanceRef;
    invocationConfig: Record<string, unknown>;
  }>;
  timeoutMs: number;
  retryPolicy: "none";
  executionOrder: "sequential_precommitted";
}

/** Truth-free provider request. Secrets are adapter-internal and never data. */
export interface FinalElicitationAdapterRequestV1 {
  requestSchemaRef: typeof FINAL_ELICITATION_ADAPTER_REQUEST_V1;
  runId: string;
  agentId: string;
  sequence: number;
  prompt: string;
  responseSchemaRef: typeof FINAL_ELICITATION_RESPONSE_SCHEMA_V1;
  modelRef: VersionedGovernanceRef;
  invocationConfig: Record<string, unknown>;
}

/** Provider accounting observed at the single-attempt boundary. */
export interface FinalElicitationUsageV1 {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
}

export type FinalElicitationAdapterResultV1 =
  | { status: "response"; rawResponse: string; usage?: FinalElicitationUsageV1 }
  | {
      status: "unavailable";
      diagnosticCode: Extract<FinalElicitationDiagnosticCode, "provider_error" | "adapter_unavailable">;
      usage?: FinalElicitationUsageV1;
    };

export interface FinalElicitationAdapterV1 {
  readonly contract: FinalElicitationAdapterContractV1;
  elicit(
    request: Readonly<FinalElicitationAdapterRequestV1>,
    signal: AbortSignal,
  ): Promise<FinalElicitationAdapterResultV1>;
}

export interface FinalElicitationCollectionRecordV1 {
  agentId: string;
  sequence: number;
  requestedAt: string;
  recordedAt: string;
  promptHash: string;
  finalResponseRecordId: string;
  status: "answered" | "abstained" | "invalid" | "unavailable";
  diagnosticCode: FinalElicitationDiagnosticCode;
  usage?: FinalElicitationUsageV1;
}

export interface FinalElicitationCollectionArtifactV1 {
  artifactSchemaRef: typeof FINAL_ELICITATION_COLLECTION_V1;
  runId: string;
  finalElicitationContractRef: VersionedGovernanceRef;
  adapterContract: FinalElicitationAdapterContractV1;
  records: FinalElicitationCollectionRecordV1[];
  contentHash: string;
}

const CREDENTIAL_KEY_RE = /(^|[_-])(api[-_]?key|secret|password|authorization|credential|access[-_]?token|refresh[-_]?token)($|[_-])/i;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/;

function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be non-empty`);
  }
}

function requireTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${field} must be a canonical ISO timestamp`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${field} must be a canonical ISO timestamp`);
  }
}

function rejectCredentialKeys(value: unknown, field: string): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectCredentialKeys(child, `${field}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (CREDENTIAL_KEY_RE.test(key)) {
      throw new Error(`${field} must not persist credential-like field ${key}`);
    }
    rejectCredentialKeys(child, `${field}.${key}`);
  }
}

function validateUsage(value: unknown, field: string): asserts value is FinalElicitationUsageV1 | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  const usage = value as Record<string, unknown>;
  const allowed = new Set(["promptTokens", "completionTokens", "totalTokens", "latencyMs"]);
  if (Object.keys(usage).some(key => !allowed.has(key))) {
    throw new Error(`${field} contains an unexpected field`);
  }
  for (const key of ["promptTokens", "completionTokens", "totalTokens"] as const) {
    const amount = usage[key];
    if (amount !== undefined && (!Number.isSafeInteger(amount) || (amount as number) < 0)) {
      throw new Error(`${field}.${key} must be a non-negative safe integer`);
    }
  }
  if (usage.latencyMs !== undefined
    && (!Number.isFinite(usage.latencyMs) || (usage.latencyMs as number) < 0)) {
    throw new Error(`${field}.latencyMs must be a non-negative finite number`);
  }
  if (usage.promptTokens !== undefined && usage.completionTokens !== undefined
    && usage.totalTokens !== undefined
    && usage.totalTokens !== (usage.promptTokens as number) + (usage.completionTokens as number)) {
    throw new Error(`${field}.totalTokens must equal promptTokens + completionTokens`);
  }
}

function stableJson(value: unknown): string {
  const normalize = (child: unknown): unknown => {
    if (Array.isArray(child)) return child.map(normalize);
    if (child !== null && typeof child === "object") {
      return Object.fromEntries(
        Object.entries(child as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    return child;
  };
  return JSON.stringify(normalize(value));
}

function hashValue(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value), "utf8").digest("hex")}`;
}

function collectionBody(
  artifact: FinalElicitationCollectionArtifactV1,
): Omit<FinalElicitationCollectionArtifactV1, "contentHash"> {
  const { contentHash: _contentHash, ...body } = artifact;
  return body;
}

export function computeFinalElicitationCollectionHash(
  artifact: Omit<FinalElicitationCollectionArtifactV1, "contentHash">,
): string {
  validateReplayableGovernanceValue(artifact, "finalElicitationCollection");
  return hashValue(artifact);
}

export function validateFinalElicitationAdapterContractV1(
  contract: FinalElicitationAdapterContractV1,
): void {
  if (!contract || typeof contract !== "object") {
    throw new Error("finalElicitationAdapter contract must be an object");
  }
  validateGovernanceRef(contract, "finalElicitationAdapter");
  validateGovernanceRef(contract.adapterRef, "finalElicitationAdapter.adapterRef");
  if (!Array.isArray(contract.agentBindings) || contract.agentBindings.length === 0) {
    throw new Error("finalElicitationAdapter.agentBindings must be non-empty");
  }
  const seenAgents = new Set<string>();
  for (const [index, binding] of contract.agentBindings.entries()) {
    requireNonEmpty(binding?.agentId, `finalElicitationAdapter.agentBindings[${index}].agentId`);
    if (seenAgents.has(binding.agentId)) {
      throw new Error("finalElicitationAdapter.agentBindings must identify each agent once");
    }
    seenAgents.add(binding.agentId);
    validateGovernanceRef(binding.modelRef, `finalElicitationAdapter.agentBindings[${index}].modelRef`);
    if (!binding.invocationConfig || typeof binding.invocationConfig !== "object"
      || Array.isArray(binding.invocationConfig)) {
      throw new Error(`finalElicitationAdapter.agentBindings[${index}].invocationConfig must be an object`);
    }
    validateReplayableGovernanceValue(
      binding.invocationConfig,
      `finalElicitationAdapter.agentBindings[${index}].invocationConfig`,
    );
    rejectCredentialKeys(
      binding.invocationConfig,
      `finalElicitationAdapter.agentBindings[${index}].invocationConfig`,
    );
  }
  if (!Number.isSafeInteger(contract.timeoutMs) || contract.timeoutMs < 1) {
    throw new Error("finalElicitationAdapter.timeoutMs must be a positive safe integer");
  }
  if (contract.retryPolicy !== "none") {
    throw new Error("final elicitation v1 forbids retries because they induce selective measurement");
  }
  if (contract.executionOrder !== "sequential_precommitted") {
    throw new Error("final elicitation v1 requires sequential precommitted execution order");
  }
}

export function validateFinalElicitationCollectionArtifactV1(
  artifact: FinalElicitationCollectionArtifactV1,
): void {
  if (!artifact || artifact.artifactSchemaRef?.id !== FINAL_ELICITATION_COLLECTION_V1.id
    || artifact.artifactSchemaRef?.version !== FINAL_ELICITATION_COLLECTION_V1.version) {
    throw new Error("finalElicitationCollection artifact/schema mismatch");
  }
  requireNonEmpty(artifact.runId, "finalElicitationCollection.runId");
  validateGovernanceRef(
    artifact.finalElicitationContractRef,
    "finalElicitationCollection.finalElicitationContractRef",
  );
  validateFinalElicitationAdapterContractV1(artifact.adapterContract);
  if (!Array.isArray(artifact.records)
    || artifact.records.length !== artifact.adapterContract.agentBindings.length) {
    throw new Error("finalElicitationCollection records must cover every adapter binding");
  }
  for (let index = 0; index < artifact.records.length; index++) {
    const record = artifact.records[index];
    const binding = artifact.adapterContract.agentBindings[index];
    if (record.agentId !== binding.agentId || record.sequence !== index + 1) {
      throw new Error("finalElicitationCollection record order does not match adapter bindings");
    }
    requireTimestamp(record.requestedAt, "finalElicitationCollection.requestedAt");
    requireTimestamp(record.recordedAt, "finalElicitationCollection.recordedAt");
    if (Date.parse(record.recordedAt) < Date.parse(record.requestedAt)) {
      throw new Error("finalElicitationCollection recordedAt cannot precede requestedAt");
    }
    if (!SHA256_RE.test(record.promptHash)) {
      throw new Error("finalElicitationCollection.promptHash must be a canonical sha256 hash");
    }
    if (record.finalResponseRecordId !== `final-response:${artifact.runId}:${record.agentId}`) {
      throw new Error("finalElicitationCollection final response identity mismatch");
    }
    if (!["answered", "abstained", "invalid", "unavailable"].includes(record.status)) {
      throw new Error("finalElicitationCollection status is invalid");
    }
    if (record.status === "answered" && record.diagnosticCode !== "none") {
      throw new Error("answered finalElicitationCollection records require diagnosticCode=none");
    }
    if (record.status === "unavailable"
      && !["provider_error", "timeout", "adapter_unavailable"].includes(record.diagnosticCode)) {
      throw new Error("unavailable finalElicitationCollection record has invalid diagnosticCode");
    }
    validateUsage(record.usage, "finalElicitationCollection.usage");
  }
  if (!SHA256_RE.test(artifact.contentHash)
    || artifact.contentHash !== computeFinalElicitationCollectionHash(collectionBody(artifact))) {
    throw new Error("finalElicitationCollection contentHash mismatch");
  }
}

export function validateFinalElicitationCollectionForOutcomeV1(
  collection: FinalElicitationCollectionArtifactV1,
  outcome: FinalOutcomeArtifactV1,
): void {
  validateFinalElicitationCollectionArtifactV1(collection);
  if (collection.runId !== outcome.runId
    || governanceRefKey(collection.finalElicitationContractRef)
      !== governanceRefKey(outcome.contract)) {
    throw new Error("finalElicitationCollection does not belong to finalOutcome");
  }
  if (collection.records.length !== outcome.elicitationRecords.length) {
    throw new Error("finalElicitationCollection does not cover finalOutcome records");
  }
  for (let index = 0; index < collection.records.length; index++) {
    const collected = collection.records[index];
    const recorded = outcome.elicitationRecords[index];
    if (collected.agentId !== recorded.agentId
      || collected.sequence !== recorded.sequence
      || collected.recordedAt !== recorded.recordedAt
      || collected.status !== recorded.status
      || collected.diagnosticCode !== recorded.diagnosticCode
      || collected.finalResponseRecordId !== recorded.id) {
      throw new Error("finalElicitationCollection record differs from finalOutcome");
    }
  }
}

function validateAdapterResult(value: unknown): asserts value is FinalElicitationAdapterResultV1 {
  if (!value || typeof value !== "object") throw new Error("final elicitation adapter returned no result");
  const result = value as Record<string, unknown>;
  if (result.status === "response") {
    if (typeof result.rawResponse !== "string"
      || Object.keys(result).some(key => !["status", "rawResponse", "usage"].includes(key))) {
      throw new Error("final elicitation adapter response is malformed");
    }
    validateUsage(result.usage, "final elicitation adapter usage");
    return;
  }
  if (result.status === "unavailable"
    && (result.diagnosticCode === "provider_error" || result.diagnosticCode === "adapter_unavailable")
    && Object.keys(result).every(key => ["status", "diagnosticCode", "usage"].includes(key))) {
    validateUsage(result.usage, "final elicitation adapter usage");
    return;
  }
  throw new Error("final elicitation adapter result is malformed");
}

async function elicitWithTimeout(
  adapter: FinalElicitationAdapterV1,
  request: FinalElicitationAdapterRequestV1,
): Promise<FinalElicitationAdapterResultV1 | { status: "timeout" }> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutResult = new Promise<{ status: "timeout" }>(resolve => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve({ status: "timeout" });
      }, adapter.contract.timeoutMs);
    });
    return await Promise.race([adapter.elicit(structuredClone(request), controller.signal), timeoutResult]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/**
 * Execute only the arm-invariant measurement phase. The adapter receives no
 * scoring task, resolution function, other agent's private view, or mutable
 * discussion engine. Resolution remains an explicit later state transition.
 */
export async function collectFinalElicitationV1(input: {
  runId: string;
  contract: FinalElicitationContractV1;
  claims: readonly EpistemicClaim[];
  expectedAgentIds: readonly string[];
  viewsByAgent: Readonly<Record<string, FinalElicitationViewV1>>;
  session: FinalOutcomeSession;
  adapter: FinalElicitationAdapterV1;
  clock?: () => string;
}): Promise<FinalElicitationCollectionArtifactV1> {
  requireNonEmpty(input.runId, "finalElicitation.runId");
  validateFinalElicitationContract(input.contract);
  validateFinalElicitationAdapterContractV1(input.adapter.contract);
  if (input.session.state !== "elicitation_open") {
    throw new Error("final elicitation collection requires an open outcome session");
  }
  if (input.session.runId !== input.runId
    || stableJson(input.session.contract) !== stableJson(input.contract)
    || stableJson(input.session.expectedAgentIds) !== stableJson(input.expectedAgentIds)
    || stableJson(input.session.claims)
      !== stableJson([...input.claims].sort((left, right) => left.id.localeCompare(right.id)))) {
    throw new Error("final elicitation collection inputs do not match the outcome session");
  }
  const agentIds = [...input.expectedAgentIds];
  if (agentIds.length === 0 || new Set(agentIds).size !== agentIds.length
    || agentIds.some(agentId => typeof agentId !== "string" || agentId.trim().length === 0)) {
    throw new Error("final elicitation expectedAgentIds must be unique non-empty strings");
  }
  const viewKeys = Object.keys(input.viewsByAgent).sort();
  if (JSON.stringify(viewKeys) !== JSON.stringify([...agentIds].sort())) {
    throw new Error("final elicitation views must cover exactly the precommitted agents");
  }
  if (stableJson(input.adapter.contract.agentBindings.map(binding => binding.agentId))
    !== stableJson(agentIds)) {
    throw new Error("final elicitation adapter bindings must exactly follow precommitted agent order");
  }
  const claimById = new Map(input.claims.map(claim => [claim.id, claim]));
  if (claimById.size !== input.claims.length
    || input.contract.claimIds.some(claimId => !claimById.has(claimId))) {
    throw new Error("final elicitation claims must cover the frozen contract claimIds");
  }
  const clock = input.clock ?? (() => new Date().toISOString());
  const records: FinalElicitationCollectionRecordV1[] = [];

  for (let index = 0; index < agentIds.length; index++) {
    const agentId = agentIds[index];
    const agentBinding = input.adapter.contract.agentBindings[index];
    const view = input.viewsByAgent[agentId];
    validateFinalElicitationView(view);
    const prompt = buildFinalElicitationPrompt({
      view,
      contract: input.contract,
      claims: input.claims,
    });
    const requestedAt = clock();
    requireTimestamp(requestedAt, "finalElicitation.requestedAt");
    if (Date.parse(requestedAt) < Date.parse(input.session.discussionCompletedAt)) {
      throw new Error("final elicitation cannot begin before discussion completion");
    }
    let result: FinalElicitationAdapterResultV1 | { status: "timeout" };
    try {
      result = await elicitWithTimeout(input.adapter, {
        requestSchemaRef: FINAL_ELICITATION_ADAPTER_REQUEST_V1,
        runId: input.runId,
        agentId,
        sequence: index + 1,
        prompt,
        responseSchemaRef: FINAL_ELICITATION_RESPONSE_SCHEMA_V1,
        modelRef: structuredClone(agentBinding.modelRef),
        invocationConfig: structuredClone(agentBinding.invocationConfig),
      });
      if (result.status !== "timeout") validateAdapterResult(result);
    } catch (error) {
      rethrowProviderExecutionHalt(error);
      result = { status: "unavailable", diagnosticCode: "provider_error" };
    }
    const recordedAt = clock();
    requireTimestamp(recordedAt, "finalElicitation.recordedAt");
    if (Date.parse(recordedAt) < Date.parse(requestedAt)) {
      throw new Error("final elicitation recordedAt cannot precede requestedAt");
    }
    const record = result.status === "response"
      ? input.session.recordRawResponse(agentId, result.rawResponse, recordedAt)
      : input.session.recordUnavailable(
          agentId,
          result.status === "timeout" ? "timeout" : result.diagnosticCode,
          recordedAt,
        );
    records.push({
      agentId,
      sequence: index + 1,
      requestedAt,
      recordedAt,
      promptHash: hashValue(prompt),
      finalResponseRecordId: record.id,
      status: record.status,
      diagnosticCode: record.diagnosticCode,
      ...(result.status !== "timeout" && result.usage
        ? { usage: structuredClone(result.usage) }
        : {}),
    });
  }

  const body: Omit<FinalElicitationCollectionArtifactV1, "contentHash"> = {
    artifactSchemaRef: FINAL_ELICITATION_COLLECTION_V1,
    runId: input.runId,
    finalElicitationContractRef: { id: input.contract.id, version: input.contract.version },
    adapterContract: structuredClone(input.adapter.contract),
    records,
  };
  const artifact: FinalElicitationCollectionArtifactV1 = {
    ...body,
    contentHash: computeFinalElicitationCollectionHash(body),
  };
  validateFinalElicitationCollectionArtifactV1(artifact);
  return artifact;
}
