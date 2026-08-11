import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  GovernanceDecisionEngine,
  HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_V2,
  createGovernanceEventAssignment,
  governanceRefKey,
  toGovernanceActionAssignmentRef,
  validateGovernanceActionInstance,
  validateGovernanceActionTransition,
  validateGovernanceDiagnosis,
  validateGovernanceRef,
  validateReplayableGovernanceValue,
  type GovernanceActionInstance,
  type GovernanceActionTransition,
  type GovernanceDiagnosisRecord,
  type GovernanceEligibilityRule,
  type InterventionContract,
  type VersionedGovernanceRef,
} from "../../../src/lib/governance";
import {
  defaultBeliefContractRegistry,
  EpistemicLedger,
  REPORTED_BELIEF_CERTAINTY_V1,
  computeEvidenceContentHash,
  validateEpistemicClaim,
  type BeliefEvidenceReference,
  type BeliefExposure,
  type BeliefReport,
  type BeliefValue,
  type ClaimResolution,
  type EpistemicClaim,
  type EpistemicEvidence,
  type EpistemicEvent,
} from "../../../src/lib/epistemic";
import {
  GovernanceAuditTrailBuilder,
  buildFinalElicitationPrompt,
  collectFinalElicitationV1,
  computeGovernanceSourceEventHash,
  createOperationalAnalysisUnitV1,
  createOperationalOutcomeArtifactV1,
  loadOrCreateOperationalAnalysisUnitV1,
  projectFinalOutcomeTaskRecord,
  readOperationalAnalysisUnitV1,
  readPrimaryAssignmentManifestV1,
  rethrowProviderExecutionHalt,
  replayGovernanceAuditTrailDecisions,
  validateFinalElicitationAdapterContractV1,
  validateFinalElicitationCollectionForOutcomeV1,
  validateGovernanceAuditTrail,
  validateGovernanceStudyContract,
  validateOperationalOutcomeArtifactV1,
  validatePrimaryArmExecutionRegistryV1,
  type FinalElicitationAdapterV1,
  type FinalElicitationViewV1,
  type GovernanceAuditTrail,
  type GovernanceObservationRecord,
  type GovernanceSourceEvent,
  type GovernanceStudyContract,
  type OperationalAnalysisUnitV1,
  type PrimaryArmExecutionRegistryV1,
} from "../../../src/lib/experimentation";
import { FinalOutcomeSession, createFinalElicitationContract } from "../../../src/lib/experimentation/finalOutcome";
import { preparePrimaryAssignedRunV1 } from "../primaryAssignedRun";
import { verifyRawRunData } from "../replayVerifier";
import type { AuditableRawRunDataV5 } from "../types";
import {
  V6_VERIFIED_LINEAGE_MEASUREMENT_V1,
  createV6MonitoringSelectionV1,
  deriveVerifiedIndependentLineageCountV1,
  validateV6MonitoringDesignV1,
  validateV6MonitoringSelectionV1,
  type V6MonitoringDesignV1,
  type V6MonitoringSelectionV1,
} from "./monitoringDesign";
import {
  createV6TaskManifestV1,
  loadOrCreateV6TaskManifestV1,
  readV6TaskManifestV1,
  validateV6TaskManifestOpeningV1,
  validateV6TaskManifestV1,
  type V6TaskAuthorityV1,
  type V6TaskManifestV1,
} from "./v6TaskManifest";

export type V6InteractionProtocol =
  | "text_communication_v1"
  | "explicit_belief_v1"
  | "epistemic_governance_v1";

interface V6TaskBaseV1 {
  id: string;
  taskFamilyRef: VersionedGovernanceRef;
  publicContext: string;
  agents: Array<{ agentId: string; privateInformation: string }>;
}

export interface V6BinaryTaskV1 extends V6TaskBaseV1 {
  claim: Extract<EpistemicClaim, { resolutionPolicy: { kind: "binary" } }>;
  outcome: boolean;
}

export interface V6CategoricalTaskV1 extends V6TaskBaseV1 {
  claim: Extract<EpistemicClaim, { resolutionPolicy: { kind: "categorical" } }>;
  outcome: string;
}

/** The V6 kernel is claim-kind generic; task-family adapters remain narrow. */
export type V6TaskV1 = V6BinaryTaskV1 | V6CategoricalTaskV1;

export interface V6DiscussionAdapterContractV1 {
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
  executionOrder: "round_then_precommitted_agent";
}

export interface V6DiscussionRequestV1 {
  requestSchemaRef: { id: "swarmalpha.v6.discussion-request"; version: "1.0.0" };
  requestId: string;
  runId: string;
  taskId: string;
  agentId: string;
  round: 1 | 2;
  protocol: V6InteractionProtocol;
  publicContext: string;
  ownPrivateInformation: string;
  claim: EpistemicClaim;
  visibleTranscript: V6PublicTranscriptEntry[];
  responseContract: "plain_text" | "belief_json_v1";
  modelRef: VersionedGovernanceRef;
  invocationConfig: Record<string, unknown>;
}

export type V6ProviderUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
};

export type V6DiscussionAdapterResultV1 =
  | { status: "response"; rawResponse: string; usage?: V6ProviderUsage }
  | { status: "unavailable"; diagnosticCode: "provider_error" | "adapter_unavailable"; usage?: V6ProviderUsage };

export interface V6DiscussionAdapterV1 {
  readonly contract: V6DiscussionAdapterContractV1;
  respond(request: Readonly<V6DiscussionRequestV1>, signal: AbortSignal): Promise<V6DiscussionAdapterResultV1>;
}

export interface V6VerificationAdapterContractV1 {
  id: string;
  version: string;
  adapterRef: VersionedGovernanceRef;
  modelRef: VersionedGovernanceRef;
  invocationConfig: Record<string, unknown>;
  timeoutMs: number;
  retryPolicy: "none";
}

export interface V6VerificationRequestV1 {
  requestSchemaRef: { id: "swarmalpha.v6.verification-request"; version: "1.0.0" };
  requestId: string;
  runId: string;
  taskId: string;
  actionRef: VersionedGovernanceRef;
  targetAgentId: string;
  claim: EpistemicClaim;
  publicContext: string;
  targetPublicMessage: string;
  matchedTokenBudget: number;
  modelRef: VersionedGovernanceRef;
  invocationConfig: Record<string, unknown>;
}

export type V6VerificationAdapterResultV1 =
  | { status: "response"; publicContent: string; usage?: V6ProviderUsage }
  | { status: "unavailable"; diagnosticCode: "provider_error" | "adapter_unavailable"; usage?: V6ProviderUsage };

export interface V6VerificationAdapterV1 {
  readonly contract: V6VerificationAdapterContractV1;
  verify(request: Readonly<V6VerificationRequestV1>, signal: AbortSignal): Promise<V6VerificationAdapterResultV1>;
}

export interface V6PublicTranscriptEntry {
  round: number;
  agentId: string;
  content: string;
  source: "agent" | "governance";
}

export interface V6DiscussionCallRecordV1 {
  requestId: string;
  round: 1 | 2;
  sequence: number;
  agentId: string;
  requestedAt: string;
  recordedAt: string;
  requestHash: string;
  status: "answered" | "invalid" | "unavailable";
  diagnosticCode: "none" | "invalid_response" | "provider_error" | "adapter_unavailable" | "timeout";
  publicMessage?: string;
  beliefReportId?: string;
}

export interface V6InteractionTraceV1 {
  artifactSchemaRef: { id: "swarmalpha.v6.interaction-trace"; version: "1.0.0" };
  runId: string;
  taskId: string;
  primaryAssignmentId: string;
  assignedArmRef: VersionedGovernanceRef;
  protocol: V6InteractionProtocol;
  expectedAgentIds: string[];
  discussionAdapterContract: V6DiscussionAdapterContractV1;
  verificationAdapterContract?: V6VerificationAdapterContractV1;
  discussionCalls: V6DiscussionCallRecordV1[];
  publicTranscript: V6PublicTranscriptEntry[];
  epistemicEvents: EpistemicEvent[];
  monitoringSelection?: V6MonitoringSelectionV1;
  contentHash: string;
}

export type V6AuditableRawRunData = AuditableRawRunDataV5 & {
  v6TaskManifest: V6TaskManifestV1;
  v6MonitoringDesign: V6MonitoringDesignV1;
  v6InteractionTrace: V6InteractionTraceV1;
};

export interface V6ProductionVerticalSliceInput {
  outputDir: string;
  runId: string;
  experimentId: string;
  seed: number;
  runIndex: number;
  study: GovernanceStudyContract;
  registry: PrimaryArmExecutionRegistryV1;
  stratum: Record<string, string | number | boolean>;
  primaryMasterSeed: number;
  eligibleEventMasterSeed: number;
  monitoringMasterSeed: number;
  task: V6TaskV1;
  taskAuthority: V6TaskAuthorityV1;
  monitoringDesign: V6MonitoringDesignV1;
  discussionAdapter: V6DiscussionAdapterV1;
  finalElicitationAdapter: FinalElicitationAdapterV1;
  governanceRule: GovernanceEligibilityRule;
  interventionContracts: InterventionContract[];
  verificationAdapter?: V6VerificationAdapterV1;
  clock?: () => string;
}

export interface V6ProductionVerticalSliceResult {
  artifact: V6AuditableRawRunData;
  absolutePath: string;
  reused: boolean;
}

const DISCUSSION_REQUEST_REF = Object.freeze({
  id: "swarmalpha.v6.discussion-request" as const,
  version: "1.0.0" as const,
});
const VERIFICATION_REQUEST_REF = Object.freeze({
  id: "swarmalpha.v6.verification-request" as const,
  version: "1.0.0" as const,
});
const INTERACTION_TRACE_REF = Object.freeze({
  id: "swarmalpha.v6.interaction-trace" as const,
  version: "1.0.0" as const,
});
const PROTOCOLS = new Set<V6InteractionProtocol>([
  "text_communication_v1",
  "explicit_belief_v1",
  "epistemic_governance_v1",
]);
const CREDENTIAL_KEY_RE = /(^|[_-])(api[-_]?key|secret|password|authorization|credential|access[-_]?token|refresh[-_]?token)($|[_-])/i;

function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be non-empty`);
}

function requireTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${field} must be a canonical ISO timestamp`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${field} must be a canonical ISO timestamp`);
  }
}

function stableJson(value: unknown): string {
  const normalize = (child: unknown): unknown => {
    if (Array.isArray(child)) return child.map(normalize);
    if (child !== null && typeof child === "object") {
      return Object.fromEntries(Object.entries(child as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, normalize(nested)]));
    }
    return child;
  };
  return JSON.stringify(normalize(value));
}

function hashValue(value: unknown): string {
  validateReplayableGovernanceValue(value, "v6 vertical-slice hash input");
  return `sha256:${createHash("sha256").update(stableJson(value), "utf8").digest("hex")}`;
}

function rejectCredentialKeys(value: unknown, field: string): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectCredentialKeys(child, `${field}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (CREDENTIAL_KEY_RE.test(key)) throw new Error(`${field} must not persist credential-like field ${key}`);
    rejectCredentialKeys(child, `${field}.${key}`);
  }
}

function validateUsage(usage: V6ProviderUsage | undefined, field: string): void {
  if (usage === undefined) return;
  validateReplayableGovernanceValue(usage, field);
  const allowed = new Set(["promptTokens", "completionTokens", "totalTokens", "latencyMs"]);
  if (Object.keys(usage).some(key => !allowed.has(key))) {
    throw new Error(`${field} contains an unexpected field`);
  }
  for (const key of ["promptTokens", "completionTokens", "totalTokens"] as const) {
    const value = usage[key];
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`${field}.${key} must be a non-negative safe integer`);
    }
  }
  if (usage.latencyMs !== undefined && (!Number.isFinite(usage.latencyMs) || usage.latencyMs < 0)) {
    throw new Error(`${field}.latencyMs must be a non-negative finite number`);
  }
  if (usage.promptTokens !== undefined && usage.completionTokens !== undefined
    && usage.totalTokens !== undefined
    && usage.totalTokens !== usage.promptTokens + usage.completionTokens) {
    throw new Error(`${field}.totalTokens must equal promptTokens + completionTokens`);
  }
}

function validateTask(task: V6TaskV1): void {
  requireNonEmpty(task?.id, "v6 task.id");
  validateGovernanceRef(task.taskFamilyRef, "v6 task.taskFamilyRef");
  requireNonEmpty(task.publicContext, "v6 task.publicContext");
  if (!task.claim) throw new Error("v6 vertical slice requires exactly one registered claim");
  validateEpistemicClaim(task.claim, defaultBeliefContractRegistry);
  requireTimestamp(task.claim.createdAt, "v6 task.claim.createdAt");
  if (!Array.isArray(task.agents) || task.agents.length < 2) {
    throw new Error("v6 task requires at least two agents");
  }
  const ids = task.agents.map(agent => agent.agentId);
  if (new Set(ids).size !== ids.length) throw new Error("v6 task agent ids must be unique");
  for (const agent of task.agents) {
    requireNonEmpty(agent.agentId, "v6 task agent id");
    requireNonEmpty(agent.privateInformation, `v6 task private information for ${agent.agentId}`);
  }
  if (task.claim.resolutionPolicy.kind === "binary") {
    if (typeof task.outcome !== "boolean") throw new Error("binary v6 task outcome must be boolean");
  } else if (typeof task.outcome !== "string" || !task.claim.options.includes(task.outcome)) {
    throw new Error("categorical v6 task outcome must be one canonical claim option");
  }
}

function validateDiscussionAdapterContract(
  contract: V6DiscussionAdapterContractV1,
  expectedAgentIds: readonly string[],
): void {
  validateGovernanceRef(contract, "v6 discussion adapter");
  validateGovernanceRef(contract.adapterRef, "v6 discussion adapter.adapterRef");
  if (contract.retryPolicy !== "none" || contract.executionOrder !== "round_then_precommitted_agent") {
    throw new Error("v6 discussion adapter requires no retry and precommitted round/agent order");
  }
  if (!Number.isSafeInteger(contract.timeoutMs) || contract.timeoutMs <= 0) {
    throw new Error("v6 discussion adapter timeoutMs must be a positive safe integer");
  }
  if (stableJson(contract.agentBindings.map(binding => binding.agentId)) !== stableJson(expectedAgentIds)) {
    throw new Error("v6 discussion adapter bindings must exactly follow the precommitted agent order");
  }
  for (const binding of contract.agentBindings) {
    validateGovernanceRef(binding.modelRef, "v6 discussion adapter modelRef");
    validateReplayableGovernanceValue(binding.invocationConfig, "v6 discussion invocationConfig");
    rejectCredentialKeys(binding.invocationConfig, "v6 discussion invocationConfig");
  }
}

function validateVerificationAdapterContract(contract: V6VerificationAdapterContractV1): void {
  validateGovernanceRef(contract, "v6 verification adapter");
  validateGovernanceRef(contract.adapterRef, "v6 verification adapter.adapterRef");
  validateGovernanceRef(contract.modelRef, "v6 verification adapter.modelRef");
  validateReplayableGovernanceValue(contract.invocationConfig, "v6 verification invocationConfig");
  rejectCredentialKeys(contract.invocationConfig, "v6 verification invocationConfig");
  if (contract.retryPolicy !== "none") throw new Error("v6 verification adapter forbids retries");
  if (!Number.isSafeInteger(contract.timeoutMs) || contract.timeoutMs <= 0) {
    throw new Error("v6 verification adapter timeoutMs must be a positive safe integer");
  }
}

class MonotonicClock {
  private last = -Infinity;
  constructor(private readonly clock: () => string) {}
  next(field: string): string {
    const value = this.clock();
    requireTimestamp(value, field);
    const parsed = Date.parse(value);
    if (parsed < this.last) throw new Error(`${field} must not move backward`);
    this.last = parsed;
    return value;
  }
}

async function withTimeout<T>(timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T | { status: "timeout" }> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutResult = new Promise<{ status: "timeout" }>(resolve => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve({ status: "timeout" });
      }, timeoutMs);
    });
    return await Promise.race([operation(controller.signal), timeoutResult]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

interface ParsedBeliefResponse {
  message: string;
  value: BeliefValue;
  evidence: Array<{ content: string; relation: "supports" | "attacks"; lineageId?: string }>;
}

function parseBeliefResponse(raw: string, claim: EpistemicClaim): ParsedBeliefResponse | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !["message", "belief", "evidence"].includes(key))
    || typeof record.message !== "string" || record.message.trim().length === 0
    || !record.belief || typeof record.belief !== "object" || Array.isArray(record.belief)
    || !Array.isArray(record.evidence)) return null;
  const belief = record.belief as Record<string, unknown>;
  let normalizedBelief: BeliefValue;
  try {
    normalizedBelief = defaultBeliefContractRegistry.get(claim.resolutionPolicy.kind)
      .normalizeValue(claim, belief as unknown as BeliefValue);
  } catch {
    return null;
  }
  const evidence: ParsedBeliefResponse["evidence"] = [];
  for (const item of record.evidence) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const entry = item as Record<string, unknown>;
    if (Object.keys(entry).some(key => !["content", "relation", "lineageId"].includes(key))
      || typeof entry.content !== "string" || entry.content.trim().length === 0
      || (entry.relation !== "supports" && entry.relation !== "attacks")
      || (entry.lineageId !== undefined
        && (typeof entry.lineageId !== "string" || entry.lineageId.trim().length === 0))) return null;
    evidence.push({
      content: entry.content,
      relation: entry.relation,
      ...(typeof entry.lineageId === "string" ? { lineageId: entry.lineageId } : {}),
    });
  }
  return { message: record.message, value: normalizedBelief, evidence };
}

/** Maximum mass of the explicit report; comparable only within kind and option count. */
function deriveReportedCertainty(claim: EpistemicClaim, value: BeliefValue): number {
  const normalized = defaultBeliefContractRegistry.get(claim.resolutionPolicy.kind)
    .normalizeValue(claim, value);
  if (normalized.kind === "binary") {
    return Math.max(normalized.probability, 1 - normalized.probability);
  }
  if (!("options" in claim)) throw new Error("categorical report requires canonical claim options");
  return Math.max(...claim.options.map(option => normalized.probabilities[option]));
}

function claimOptionCount(claim: EpistemicClaim): number {
  if (claim.resolutionPolicy.kind === "binary") return 2;
  if (!("options" in claim)) throw new Error("categorical claim requires canonical options");
  return claim.options.length;
}

function createMonitoredBeliefPayload(
  claim: EpistemicClaim,
  report: BeliefReport,
  monitoringSelectionHash: string,
): Record<string, unknown> {
  if (report.claimId !== claim.id) {
    throw new Error("monitored belief report differs from its committed claim");
  }
  const value = defaultBeliefContractRegistry.get(claim.resolutionPolicy.kind)
    .normalizeValue(claim, report.value);
  const common = {
    reportId: report.id,
    claimId: report.claimId,
    agentId: report.agentId,
    evidenceReferenceCount: report.evidence.length,
    monitoringSelectionHash,
  };
  // Preserve the frozen binary payload byte-for-byte for existing artifacts.
  return value.kind === "binary"
    ? { ...common, probability: value.probability }
    : {
        ...common,
        beliefValue: value,
        reportedCertainty: deriveReportedCertainty(claim, value),
        claimOptionCount: claimOptionCount(claim),
      };
}

function interactionTraceBody(trace: V6InteractionTraceV1): Omit<V6InteractionTraceV1, "contentHash"> {
  const { contentHash: _contentHash, ...body } = trace;
  return body;
}

export function computeV6InteractionTraceHashV1(
  trace: Omit<V6InteractionTraceV1, "contentHash">,
): string {
  return hashValue(trace);
}

function replayEpistemicEvents(events: readonly EpistemicEvent[]): EpistemicLedger {
  const ledger = new EpistemicLedger();
  for (const event of events) {
    if (event.type === "claim_registered") ledger.registerClaim(event.claim);
    else if (event.type === "evidence_registered") ledger.registerEvidence(event.evidence);
    else if (event.type === "belief_reported") ledger.appendBeliefReport(event.report);
    else if (event.type === "belief_exposed") ledger.appendExposure(event.exposure);
    else ledger.resolveClaim(event.resolution);
  }
  return ledger;
}

export function validateV6InteractionTraceV1(trace: V6InteractionTraceV1, input: {
  task: V6TaskV1;
  primaryAssignmentId: string;
  assignedArmRef: VersionedGovernanceRef;
  protocol: V6InteractionProtocol;
  monitoringDesign: V6MonitoringDesignV1;
}): void {
  if (!trace || stableJson(trace.artifactSchemaRef) !== stableJson(INTERACTION_TRACE_REF)) {
    throw new Error("v6 interaction trace artifact/schema mismatch");
  }
  if (trace.runId.trim().length === 0 || trace.taskId !== input.task.id
    || trace.primaryAssignmentId !== input.primaryAssignmentId
    || governanceRefKey(trace.assignedArmRef) !== governanceRefKey(input.assignedArmRef)
    || trace.protocol !== input.protocol) {
    throw new Error("v6 interaction trace source identity mismatch");
  }
  const expectedAgentIds = input.task.agents.map(agent => agent.agentId);
  if (stableJson(trace.expectedAgentIds) !== stableJson(expectedAgentIds)) {
    throw new Error("v6 interaction trace agent roster mismatch");
  }
  validateDiscussionAdapterContract(trace.discussionAdapterContract, expectedAgentIds);
  if (trace.protocol === "epistemic_governance_v1") {
    if (!trace.verificationAdapterContract) {
      throw new Error("governance interaction trace requires its verification adapter contract");
    }
    validateVerificationAdapterContract(trace.verificationAdapterContract);
  } else if (trace.verificationAdapterContract !== undefined) {
    throw new Error("non-governance interaction trace must not claim a verification adapter");
  }
  if (!Array.isArray(trace.discussionCalls)
    || trace.discussionCalls.length !== expectedAgentIds.length * 2) {
    throw new Error("v6 interaction trace requires one terminal discussion call per agent per round");
  }
  const reportIds = new Set<string>();
  for (let index = 0; index < trace.discussionCalls.length; index++) {
    const call = trace.discussionCalls[index];
    const round = (Math.floor(index / expectedAgentIds.length) + 1) as 1 | 2;
    const agentId = expectedAgentIds[index % expectedAgentIds.length];
    if (call.round !== round || call.sequence !== index + 1 || call.agentId !== agentId
      || call.requestId !== `discussion:${trace.runId}:r${round}:${agentId}`) {
      throw new Error("v6 discussion call order/identity differs from the precommitment");
    }
    requireTimestamp(call.requestedAt, "v6 discussion requestedAt");
    requireTimestamp(call.recordedAt, "v6 discussion recordedAt");
    if (Date.parse(call.recordedAt) < Date.parse(call.requestedAt)) {
      throw new Error("v6 discussion response cannot precede its request");
    }
    if (!/^sha256:[0-9a-f]{64}$/.test(call.requestHash)) throw new Error("v6 discussion requestHash is malformed");
    const binding = trace.discussionAdapterContract.agentBindings[index % expectedAgentIds.length];
    const visibleTranscript = trace.publicTranscript.filter(entry =>
      entry.round < round || (entry.round === round && entry.source === "governance"));
    const expectedRequest: V6DiscussionRequestV1 = {
      requestSchemaRef: DISCUSSION_REQUEST_REF,
      requestId: call.requestId,
      runId: trace.runId,
      taskId: trace.taskId,
      agentId,
      round,
      protocol: trace.protocol,
      publicContext: input.task.publicContext,
      ownPrivateInformation: input.task.agents[index % expectedAgentIds.length].privateInformation,
      claim: structuredClone(input.task.claim),
      visibleTranscript: structuredClone(visibleTranscript),
      responseContract: trace.protocol === "text_communication_v1" ? "plain_text" : "belief_json_v1",
      modelRef: structuredClone(binding.modelRef),
      invocationConfig: structuredClone(binding.invocationConfig),
    };
    if (call.requestHash !== hashValue(expectedRequest)) {
      throw new Error("v6 discussion requestHash does not replay from the frozen task/adapter/trace");
    }
    if (call.beliefReportId) reportIds.add(call.beliefReportId);
    if (trace.protocol === "text_communication_v1" && call.beliefReportId !== undefined) {
      throw new Error("text communication arm cannot claim explicit discussion belief reports");
    }
    if (call.status === "answered" && (typeof call.publicMessage !== "string" || call.publicMessage.length === 0)) {
      throw new Error("answered v6 discussion call requires a public message");
    }
    const matchingMessages = trace.publicTranscript.filter(entry =>
      entry.source === "agent" && entry.round === call.round && entry.agentId === call.agentId);
    if (call.status === "answered") {
      if (matchingMessages.length !== 1 || matchingMessages[0].content !== call.publicMessage) {
        throw new Error("answered discussion call must match exactly one public transcript message");
      }
    } else if (matchingMessages.length !== 0) {
      throw new Error("non-answered discussion call cannot produce a public transcript message");
    }
  }
  const ledger = replayEpistemicEvents(trace.epistemicEvents);
  const reports = ledger.getReportsForClaim(input.task.claim.id);
  if (reports.length !== reportIds.size || reports.some(report => !reportIds.has(report.id))) {
    throw new Error("v6 interaction trace discussion records do not match replayed belief reports");
  }
  if (trace.protocol !== "text_communication_v1"
    && reports.some(report => report.stake !== 0)) {
    throw new Error("v6 production slice records discussion reports with zero economic stake");
  }
  if (trace.protocol === "epistemic_governance_v1") {
    if (!trace.monitoringSelection) throw new Error("governance interaction trace requires a monitoring selection");
    validateV6MonitoringSelectionV1(trace.monitoringSelection, input.monitoringDesign);
    const firstRoundReportIds = reports
      .filter(report => report.round === 1)
      .map(report => report.id)
      .sort();
    if (trace.monitoringSelection.runId !== trace.runId
      || stableJson(trace.monitoringSelection.candidateReportIds) !== stableJson(firstRoundReportIds)) {
      throw new Error("v6 monitoring selection population differs from the recorded first-round reports");
    }
  } else if (trace.monitoringSelection !== undefined) {
    throw new Error("non-governance interaction trace cannot claim a monitoring selection");
  }
  let previousRound = 0;
  for (const entry of trace.publicTranscript) {
    if (!Number.isSafeInteger(entry.round) || entry.round < previousRound || entry.round < 1 || entry.round > 2) {
      throw new Error("v6 public transcript rounds must be chronological within the two-round protocol");
    }
    previousRound = entry.round;
    requireNonEmpty(entry.agentId, "v6 public transcript agentId");
    requireNonEmpty(entry.content, "v6 public transcript content");
  }
  for (const round of [1, 2]) {
    const agentOrder = trace.publicTranscript
      .filter(entry => entry.round === round && entry.source === "agent")
      .map(entry => entry.agentId);
    const expectedOrder = expectedAgentIds.filter(agentId => agentOrder.includes(agentId));
    if (stableJson(agentOrder) !== stableJson(expectedOrder)) {
      throw new Error("v6 public transcript agent messages must follow precommitted roster order");
    }
    if (round === 2) {
      const firstAgentIndex = trace.publicTranscript.findIndex(entry => entry.round === 2 && entry.source === "agent");
      const lateGovernance = trace.publicTranscript.findIndex((entry, index) =>
        index > firstAgentIndex && entry.round === 2 && entry.source === "governance");
      if (firstAgentIndex >= 0 && lateGovernance >= 0) {
        throw new Error("round-2 governance context must be committed before round-2 agent calls");
      }
    }
  }
  if (trace.contentHash !== computeV6InteractionTraceHashV1(interactionTraceBody(trace))) {
    throw new Error("v6 interaction trace contentHash mismatch");
  }
}

function safeRunStem(runId: string): string {
  const stem = runId.replace(/[^A-Za-z0-9._-]/g, "_");
  const suffix = createHash("sha256").update(runId, "utf8").digest("hex").slice(0, 12);
  return `${stem}.${suffix}`;
}

export function resolveV6AuditableRawRunPath(outputDir: string, runId: string): string {
  requireNonEmpty(runId, "v6 raw runId");
  return path.resolve(outputDir, `${safeRunStem(runId)}.raw-run.v5.json`);
}

/**
 * Cross-carrier binding for the V6 monitoring decision. This proves only
 * internal consistency among the interaction trace, epistemic report, and
 * governance audit source event. It does not authenticate wall-clock time or
 * prevent an attacker from reconstructing the entire artifact chain.
 */
export function validateV6MonitoringAuditBindingV1(artifact: V6AuditableRawRunData): void {
  const selection = artifact.v6InteractionTrace.monitoringSelection;
  const beliefSourceEvents = artifact.governanceAuditTrail.sourceEvents
    .filter(event => event.kind === "belief_report");
  if (!selection) {
    if (beliefSourceEvents.length > 0) {
      throw new Error("v6 governance belief source event requires a monitoring selection");
    }
    return;
  }
  validateV6MonitoringSelectionV1(selection, artifact.v6MonitoringDesign);
  const reports = artifact.v6InteractionTrace.epistemicEvents
    .filter(event => event.type === "belief_reported")
    .map(event => event.report);
  const reportById = new Map(reports.map(report => [report.id, report]));
  const candidates = selection.candidateReportIds.map(reportId => reportById.get(reportId));
  if (candidates.some(report => report === undefined)) {
    throw new Error("v6 monitoring selection references a missing epistemic report");
  }
  if (selection.status === "empty_population") {
    if (beliefSourceEvents.length > 0) {
      throw new Error("v6 empty monitoring population cannot produce a governance belief source event");
    }
    return;
  }
  if (selection.status !== "selected" || typeof selection.selectedReportId !== "string") {
    throw new Error("v6 non-empty monitoring selection must identify one selected report");
  }
  const selectedReport = reportById.get(selection.selectedReportId);
  if (!selectedReport || selectedReport.claimId !== artifact.v6TaskManifest.primaryClaim.id) {
    throw new Error("v6 monitoring selection does not identify a report for the committed claim");
  }
  if (beliefSourceEvents.length !== 1) {
    throw new Error("v6 selected monitoring report must bind exactly one governance belief source event");
  }
  const sourceEvent = beliefSourceEvents[0];
  const expectedPayload = createMonitoredBeliefPayload(
    artifact.v6TaskManifest.primaryClaim,
    selectedReport,
    selection.contentHash,
  );
  if (sourceEvent.id !== `governance-source:${selectedReport.id}`
    || sourceEvent.round !== selectedReport.round
    || stableJson(sourceEvent.payload) !== stableJson(expectedPayload)) {
    throw new Error("v6 monitoring selection differs from its governance belief source event");
  }
  const candidateCreatedTimes = candidates.map(report => Date.parse(report!.createdAt));
  if (candidateCreatedTimes.some(timestamp => !Number.isFinite(timestamp))) {
    throw new Error("v6 monitoring candidate report has an invalid createdAt timestamp");
  }
  const latestCandidateCreatedAt = Math.max(...candidateCreatedTimes);
  if (Date.parse(selection.selectedAt) < latestCandidateCreatedAt) {
    throw new Error("v6 monitoring selection cannot precede its frozen candidate population");
  }
  if (Date.parse(sourceEvent.recordedAt) < Date.parse(selection.selectedAt)) {
    throw new Error("v6 governance belief source event cannot precede monitoring selection");
  }
}

function validateCompletedArtifact(artifact: V6AuditableRawRunData, input: {
  task: V6TaskV1;
  taskAuthority: V6TaskAuthorityV1;
  monitoringDesign: V6MonitoringDesignV1;
  study: GovernanceStudyContract;
  registry: PrimaryArmExecutionRegistryV1;
  governanceRule: GovernanceEligibilityRule;
}): void {
  const replay = verifyRawRunData("(v6-production-vertical-slice)", artifact, {
    governanceRules: [input.governanceRule],
  });
  if (replay.runIssues.length > 0 || replay.governanceAuditStatus !== "sealed_decision_replay_verified") {
    throw new Error(`v6 raw run failed immediate replay: ${replay.runIssues.map(issue => issue.code).join(",")}`);
  }
  validateV6TaskManifestV1(artifact.v6TaskManifest);
  validateV6MonitoringDesignV1(artifact.v6MonitoringDesign);
  validateV6TaskManifestOpeningV1(artifact.v6TaskManifest, input.task, input.taskAuthority);
  if (stableJson(artifact.v6MonitoringDesign) !== stableJson(input.monitoringDesign)
    || artifact.v6TaskManifest.runId !== artifact.runId
    || governanceRefKey(artifact.v6TaskManifest.studyRef) !== governanceRefKey(input.study)
    || artifact.v6TaskManifest.monitoringDesignHash !== artifact.v6MonitoringDesign.contentHash) {
    throw new Error("existing v6 raw run conflicts with the task/monitoring precommitment");
  }
  if (artifact.runId !== artifact.v6InteractionTrace.runId
    || stableJson(artifact.governanceStudy) !== stableJson(input.study)
    || artifact.primaryArmExecutionRegistry.contentHash !== input.registry.contentHash
    || artifact.operationalAnalysisUnit.taskId !== input.task.id
    || stableJson(artifact.operationalAnalysisUnit.primaryClaim) !== stableJson(input.task.claim)
    || stableJson(artifact.operationalAnalysisUnit.expectedAgentIds)
      !== stableJson(input.task.agents.map(agent => agent.agentId))) {
    throw new Error("existing v6 raw run conflicts with the requested study/task/registry");
  }
  const protocol = artifact.primaryArmExecution.implementationConfig.protocol;
  if (typeof protocol !== "string" || !PROTOCOLS.has(protocol as V6InteractionProtocol)) {
    throw new Error("v6 primary execution binding has an unknown protocol");
  }
  validateV6InteractionTraceV1(artifact.v6InteractionTrace, {
    task: input.task,
    primaryAssignmentId: artifact.primaryAssignmentManifest.assignment.id,
    assignedArmRef: artifact.primaryAssignmentManifest.assignment.assignedArmRef,
    protocol: protocol as V6InteractionProtocol,
    monitoringDesign: input.monitoringDesign,
  });
  validateV6MonitoringAuditBindingV1(artifact);
  if (!artifact.finalElicitationCollection) throw new Error("v6 raw run requires finalElicitationCollection");
  validateFinalElicitationCollectionForOutcomeV1(
    artifact.finalElicitationCollection,
    artifact.finalOutcome,
  );
  const transcript = artifact.v6InteractionTrace.publicTranscript.map(entry => ({
    round: entry.round,
    agentId: entry.agentId,
    content: entry.content,
  }));
  for (let index = 0; index < input.task.agents.length; index++) {
    const agent = input.task.agents[index];
    const prompt = buildFinalElicitationPrompt({
      view: {
        publicContext: input.task.publicContext,
        ownPrivateInformation: agent.privateInformation,
        discussionTranscript: transcript,
      },
      contract: artifact.finalOutcome.contract,
      claims: artifact.finalOutcome.claims,
    });
    if (artifact.finalElicitationCollection.records[index]?.promptHash !== hashValue(prompt)) {
      throw new Error("final elicitation promptHash does not replay from the interaction trace and private task view");
    }
  }
  const toolResults = artifact.governanceAuditTrail.sourceEvents
    .filter(event => event.kind === "tool_result");
  const governanceMessages = artifact.v6InteractionTrace.publicTranscript
    .filter(entry => entry.source === "governance");
  if (toolResults.length !== governanceMessages.length) {
    throw new Error("v6 governance transcript must match delivered tool-result events exactly");
  }
  for (const event of toolResults) {
    const payload = event.payload;
    const actionInstanceId = payload.actionInstanceId;
    const requestId = payload.requestId;
    const requestHash = payload.requestHash;
    const publicContent = payload.publicContent;
    if (typeof actionInstanceId !== "string" || typeof requestId !== "string"
      || typeof requestHash !== "string" || typeof publicContent !== "string") {
      throw new Error("v6 verification result event is missing its request/content commitment");
    }
    const instance = artifact.governanceAuditTrail.actionInstances
      .find(candidate => candidate.id === actionInstanceId);
    const diagnosis = instance
      ? artifact.governanceAuditTrail.diagnoses.find(candidate =>
          candidate.id === instance.sourceDiagnosisIds[0])
      : undefined;
    const beliefReportId = diagnosis?.attributes.beliefReportId;
    const targetPublicMessage = typeof beliefReportId === "string"
      ? artifact.v6InteractionTrace.discussionCalls
          .find(call => call.beliefReportId === beliefReportId)?.publicMessage
      : undefined;
    const contract = artifact.v6InteractionTrace.verificationAdapterContract;
    if (!instance || !contract || typeof targetPublicMessage !== "string") {
      throw new Error("v6 verification result cannot be linked to its action, diagnosis, and public report");
    }
    const matchedTokenBudget = instance.parameters.matchedTokenBudget;
    if (!Number.isSafeInteger(matchedTokenBudget) || (matchedTokenBudget as number) < 0) {
      throw new Error("v6 verification action has invalid matchedTokenBudget");
    }
    const expectedRequest: V6VerificationRequestV1 = {
      requestSchemaRef: VERIFICATION_REQUEST_REF,
      requestId,
      runId: artifact.runId,
      taskId: input.task.id,
      actionRef: structuredClone(instance.actionRef),
      targetAgentId: instance.targetIds[0],
      claim: structuredClone(input.task.claim),
      publicContext: input.task.publicContext,
      targetPublicMessage,
      matchedTokenBudget: matchedTokenBudget as number,
      modelRef: structuredClone(contract.modelRef),
      invocationConfig: structuredClone(contract.invocationConfig),
    };
    if (requestHash !== hashValue(expectedRequest)) {
      throw new Error("v6 verification requestHash does not replay from frozen sources");
    }
    const expectedAgentId = `governance:${governanceRefKey(instance.actionRef)}`;
    if (!governanceMessages.some(message =>
      message.round === event.round && message.agentId === expectedAgentId
      && message.content === publicContent)) {
      throw new Error("v6 verification result differs from the public governance transcript");
    }
  }
}

function readCompletedArtifact(input: {
  outputDir: string;
  runId: string;
  task: V6TaskV1;
  taskAuthority: V6TaskAuthorityV1;
  monitoringDesign: V6MonitoringDesignV1;
  study: GovernanceStudyContract;
  registry: PrimaryArmExecutionRegistryV1;
  governanceRule: GovernanceEligibilityRule;
}): V6ProductionVerticalSliceResult | null {
  const absolutePath = resolveV6AuditableRawRunPath(input.outputDir, input.runId);
  if (!fs.existsSync(absolutePath)) return null;
  let artifact: V6AuditableRawRunData;
  try {
    artifact = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as V6AuditableRawRunData;
  } catch (error) {
    throw new Error(`v6 raw run is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const persistedTaskManifest = readV6TaskManifestV1({ outputDir: input.outputDir, runId: input.runId });
  if (!persistedTaskManifest
    || persistedTaskManifest.manifest.contentHash !== artifact.v6TaskManifest?.contentHash) {
    throw new Error("v6 raw run has no matching pre-assignment task manifest");
  }
  validateCompletedArtifact(artifact, input);
  return { artifact: structuredClone(artifact), absolutePath, reused: true };
}

function publishCompletedArtifact(input: {
  outputDir: string;
  artifact: V6AuditableRawRunData;
  task: V6TaskV1;
  taskAuthority: V6TaskAuthorityV1;
  monitoringDesign: V6MonitoringDesignV1;
  study: GovernanceStudyContract;
  registry: PrimaryArmExecutionRegistryV1;
  governanceRule: GovernanceEligibilityRule;
}): V6ProductionVerticalSliceResult {
  validateCompletedArtifact(input.artifact, input);
  fs.mkdirSync(input.outputDir, { recursive: true });
  const absolutePath = resolveV6AuditableRawRunPath(input.outputDir, input.artifact.runId);
  const temporaryPath = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
  const text = `${JSON.stringify(input.artifact, null, 2)}\n`;
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporaryPath, "wx");
    fs.writeFileSync(descriptor, text, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.linkSync(temporaryPath, absolutePath);
    try { fs.unlinkSync(temporaryPath); } catch { /* authoritative link exists */ }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    if (!fs.existsSync(absolutePath)) throw error;
    const raced = readCompletedArtifact({ ...input, runId: input.artifact.runId });
    if (!raced) throw error;
    return raced;
  }
  const persisted = readCompletedArtifact({ ...input, runId: input.artifact.runId });
  if (!persisted) throw new Error("published v6 raw run could not be read back");
  return { ...persisted, reused: false };
}

function createEvidenceAndReferences(input: {
  runId: string;
  round: number;
  agentId: string;
  parsed: ParsedBeliefResponse;
  createdAt: string;
}): { evidence: EpistemicEvidence[]; references: BeliefEvidenceReference[] } {
  const evidence = input.parsed.evidence.map((item, index): EpistemicEvidence => ({
    id: `evidence:${input.runId}:r${input.round}:${input.agentId}:${index + 1}`,
    content: item.content,
    createdAt: input.createdAt,
    provenance: {
      sourceKind: "agent",
      sourceId: input.agentId,
      contentHash: computeEvidenceContentHash(item.content),
      ...(item.lineageId ? { lineageId: item.lineageId } : {}),
    },
  }));
  return {
    evidence,
    references: evidence.map((item, index) => ({
      evidenceId: item.id,
      relation: input.parsed.evidence[index].relation,
    })),
  };
}

function buildGovernanceDiagnosis(input: {
  claim: EpistemicClaim;
  report: BeliefReport;
  observationId: string;
  preregistrationRef: VersionedGovernanceRef;
  verifierAvailable: boolean;
  verifiedIndependentLineageCount: number;
  createdAt: string;
}): GovernanceDiagnosisRecord {
  if (input.report.claimId !== input.claim.id) {
    throw new Error("v6 verification diagnosis report differs from its registered claim");
  }
  const certainty = deriveReportedCertainty(input.claim, input.report.value);
  const diagnosis: GovernanceDiagnosisRecord = {
    id: `diagnosis:${input.report.id}`,
    diagnosisRef: structuredClone(HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_V2),
    quantityRef: structuredClone(REPORTED_BELIEF_CERTAINTY_V1),
    round: input.report.round,
    label: "High reported certainty with unverified independent lineage",
    interpretation: "descriptive_risk",
    value: certainty,
    attributes: {
      claimId: input.report.claimId,
      beliefReportId: input.report.id,
      beliefKind: input.claim.resolutionPolicy.kind,
      claimOptionCount: claimOptionCount(input.claim),
      claimResolved: false,
      verifierAvailable: input.verifierAvailable,
      verifiedIndependentLineageCount: input.verifiedIndependentLineageCount,
      lineageMeasurementRef: structuredClone(V6_VERIFIED_LINEAGE_MEASUREMENT_V1),
    },
    targetIds: [input.report.agentId],
    sourceObservationIds: [input.observationId],
    measurement: {
      observationCompleteness: "complete",
      missingFields: [],
      measurementReliability: {
        status: "estimated",
        score: 1,
        methodRef: { id: "swarmalpha.measurement.architecture-observed-report", version: "1.0.0" },
      },
      constructValidity: "predictive_candidate",
    },
    controlEvidence: {
      status: "experimental_candidate",
      controlUse: "randomized_experiment_only",
      preregistrationRef: structuredClone(input.preregistrationRef),
    },
    createdAt: input.createdAt,
  };
  validateGovernanceDiagnosis(diagnosis);
  return diagnosis;
}

function transition(input: {
  runId: string;
  instance: GovernanceActionInstance;
  sequence: number;
  from: GovernanceActionTransition["from"];
  to: GovernanceActionTransition["to"];
  round: number;
  occurredAt: string;
  sourceEventIds?: string[];
  observation?: Record<string, string | number | boolean | null>;
  failureCode?: string;
}): GovernanceActionTransition {
  const value: GovernanceActionTransition = {
    id: `transition:${input.runId}:${input.instance.id}:${input.sequence}`,
    actionInstanceId: input.instance.id,
    from: input.from,
    to: input.to,
    round: input.round,
    occurredAt: input.occurredAt,
    sourceEventIds: [...(input.sourceEventIds ?? [])],
    ...(input.observation ? { observation: structuredClone(input.observation) } : {}),
    ...(input.failureCode ? { failureCode: input.failureCode } : {}),
  };
  validateGovernanceActionTransition(value);
  return value;
}

export async function runV6ProductionVerticalSlice(
  input: V6ProductionVerticalSliceInput,
): Promise<V6ProductionVerticalSliceResult> {
  validateTask(input.task);
  validateGovernanceStudyContract(input.study);
  validateGovernanceRef(input.taskAuthority.adapterRef, "v6 task authority adapterRef");
  validateGovernanceRef(input.taskAuthority.taskSchemaRef, "v6 task authority taskSchemaRef");
  validateV6MonitoringDesignV1(input.monitoringDesign);
  if (input.taskAuthority.resolution.kind !== "from_task_outcome"
    || input.taskAuthority.resolution.resolverId !== input.task.claim.resolutionPolicy.resolverId
    || governanceRefKey(input.monitoringDesign.preregistrationRef)
      !== governanceRefKey(input.study.preregistrationRef!)) {
    throw new Error("v6 task/monitoring authority differs from the frozen claim/study");
  }
  if (!input.study.primaryAssignmentDesign
    || governanceRefKey(input.study.taskFamilyRef) !== governanceRefKey(input.task.taskFamilyRef)) {
    throw new Error("v6 vertical slice requires an auditable study with a primary assignment design matching the task family");
  }
  validatePrimaryArmExecutionRegistryV1(input.registry, input.study.primaryAssignmentDesign);
  if (governanceRefKey(input.registry.studyRef) !== governanceRefKey(input.study)) {
    throw new Error("v6 execution registry belongs to another study");
  }
  const policy = input.study.governancePolicy!;
  if (policy.eligibilityRuleRefs.length !== 1
    || governanceRefKey(policy.eligibilityRuleRefs[0]) !== governanceRefKey(input.governanceRule)) {
    throw new Error("v6 vertical slice freezes exactly one executable governance rule");
  }
  if (!policy.assignmentDesign || policy.assignmentDesign.allocations.length !== 1) {
    throw new Error("v6 vertical slice freezes exactly one eligible-event action allocation");
  }
  const expectedAgentIds = input.task.agents.map(agent => agent.agentId);
  validateDiscussionAdapterContract(input.discussionAdapter.contract, expectedAgentIds);
  validateFinalElicitationAdapterContractV1(input.finalElicitationAdapter.contract);
  if (stableJson(input.finalElicitationAdapter.contract.agentBindings.map(binding => binding.agentId))
    !== stableJson(expectedAgentIds)) {
    throw new Error("v6 final elicitation bindings must exactly follow the precommitted agent order");
  }
  const existing = readCompletedArtifact(input);
  if (existing) return existing;

  const clock = new MonotonicClock(input.clock ?? (() => new Date().toISOString()));
  let persistedTaskManifest = readV6TaskManifestV1({ outputDir: input.outputDir, runId: input.runId });
  if (!persistedTaskManifest) {
    const existingAssignment = readPrimaryAssignmentManifestV1({
      outputDir: input.outputDir,
      runId: input.runId,
      study: input.study,
    });
    if (existingAssignment) throw new Error("v6 run has an assignment but no pre-assignment task manifest");
    persistedTaskManifest = loadOrCreateV6TaskManifestV1({
      outputDir: input.outputDir,
      runId: input.runId,
      createManifest: () => createV6TaskManifestV1({
        runId: input.runId,
        studyRef: { id: input.study.id, version: input.study.version },
        task: input.task,
        authority: input.taskAuthority,
        monitoringDesignRef: input.monitoringDesign.designRef,
        monitoringDesignHash: input.monitoringDesign.contentHash,
        committedAt: clock.next("v6 task manifest committedAt"),
      }),
    });
  }
  validateV6TaskManifestOpeningV1(persistedTaskManifest.manifest, input.task, input.taskAuthority);
  if (governanceRefKey(persistedTaskManifest.manifest.studyRef) !== governanceRefKey(input.study)
    || persistedTaskManifest.manifest.monitoringDesignHash !== input.monitoringDesign.contentHash) {
    throw new Error("existing v6 task manifest conflicts with the requested study/monitoring design");
  }
  let persistedUnit = readOperationalAnalysisUnitV1({ outputDir: input.outputDir, runId: input.runId });
  if (!persistedUnit) {
    const existingAssignment = readPrimaryAssignmentManifestV1({
      outputDir: input.outputDir,
      runId: input.runId,
      study: input.study,
    });
    if (existingAssignment) {
      throw new Error("v6 run has an assignment but no pre-assignment operational analysis unit");
    }
    persistedUnit = loadOrCreateOperationalAnalysisUnitV1({
      outputDir: input.outputDir,
      runId: input.runId,
      createAnalysisUnit: () => createOperationalAnalysisUnitV1({
        runId: input.runId,
        taskId: input.task.id,
        studyRef: { id: input.study.id, version: input.study.version },
        primaryClaim: input.task.claim,
        expectedAgentIds,
        committedAt: clock.next("operational analysis unit committedAt"),
      }),
    });
  }
  const expectedUnitIdentity = {
    taskId: input.task.id,
    studyRef: { id: input.study.id, version: input.study.version },
    primaryClaim: input.task.claim,
    expectedAgentIds,
  };
  if (stableJson({
    taskId: persistedUnit.analysisUnit.taskId,
    studyRef: persistedUnit.analysisUnit.studyRef,
    primaryClaim: persistedUnit.analysisUnit.primaryClaim,
    expectedAgentIds: persistedUnit.analysisUnit.expectedAgentIds,
  }) !== stableJson(expectedUnitIdentity)) {
    throw new Error("existing operational analysis unit conflicts with requested task/study/roster");
  }
  if (Date.parse(persistedTaskManifest.manifest.committedAt) > Date.parse(persistedUnit.analysisUnit.committedAt)) {
    throw new Error("v6 task manifest must be committed no later than the operational analysis unit");
  }

  const prepared = preparePrimaryAssignedRunV1({
    outputDir: input.outputDir,
    runId: input.runId,
    study: input.study,
    registry: input.registry,
    stratum: input.stratum,
    masterSeed: input.primaryMasterSeed,
    clock: () => clock.next("primary assignment lifecycle time"),
  });
  const protocolValue = prepared.execution.binding.implementationConfig.protocol;
  if (typeof protocolValue !== "string" || !PROTOCOLS.has(protocolValue as V6InteractionProtocol)) {
    throw new Error("assigned arm implementationConfig.protocol is not a supported v6 protocol");
  }
  const protocol = protocolValue as V6InteractionProtocol;
  const executionConfigKeys = Object.keys(prepared.execution.binding.implementationConfig).sort();
  if (stableJson(executionConfigKeys) !== stableJson(["protocol"])) {
    throw new Error("v6 implementationConfig v1 must contain exactly protocol");
  }
  const budget = prepared.execution.binding.budgetContract;
  const budgetKeys = Object.keys(budget).sort();
  if (stableJson(budgetKeys) !== stableJson([
    "maxDiscussionCalls", "maxFinalCalls", "maxVerificationCalls",
  ].sort())) {
    throw new Error("v6 budgetContract v1 has an unknown or missing field");
  }
  for (const key of budgetKeys) {
    if (!Number.isSafeInteger(budget[key]) || (budget[key] as number) < 0) {
      throw new Error(`v6 budgetContract.${key} must be a non-negative safe integer`);
    }
  }
  if ((budget.maxDiscussionCalls as number) < expectedAgentIds.length * 2
    || (budget.maxFinalCalls as number) < expectedAgentIds.length
    || (protocol === "epistemic_governance_v1" && (budget.maxVerificationCalls as number) < 1)) {
    throw new Error("assigned v6 budgetContract cannot cover the frozen protocol");
  }
  if (protocol === "epistemic_governance_v1") {
    if (!input.verificationAdapter) throw new Error("governance arm requires a verification adapter");
    validateVerificationAdapterContract(input.verificationAdapter.contract);
  }

  const auditBuilder = new GovernanceAuditTrailBuilder({
    runId: input.runId,
    studyContract: input.study,
    ruleSnapshots: [{
      ruleRef: { id: input.governanceRule.id, version: input.governanceRule.version },
      config: structuredClone(input.governanceRule.config),
    }],
    interventionContracts: structuredClone(input.interventionContracts),
    createdAt: clock.next("governance audit createdAt"),
  });
  const decisionEngine = new GovernanceDecisionEngine();
  for (const contract of input.interventionContracts) decisionEngine.registerAction(structuredClone(contract));
  decisionEngine.registerRule(input.governanceRule);
  decisionEngine.seal();
  const ledger = new EpistemicLedger();
  ledger.registerClaim(input.task.claim);
  const transcript: V6PublicTranscriptEntry[] = [];
  const discussionCalls: V6DiscussionCallRecordV1[] = [];
  const firstRoundReports: BeliefReport[] = [];
  let monitoringSelection: V6MonitoringSelectionV1 | undefined;
  let providerFailures = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let latencyMs = 0;

  const accountUsage = (usage: V6ProviderUsage | undefined, field: string): void => {
    validateUsage(usage, field);
    promptTokens += usage?.promptTokens ?? 0;
    completionTokens += usage?.completionTokens ?? 0;
    latencyMs += usage?.latencyMs ?? 0;
  };

  for (const round of [1, 2] as const) {
    const roundEvidence: EpistemicEvidence[] = [];
    const roundReports: BeliefReport[] = [];
    const visibleAtRoundStart = transcript.map(entry => structuredClone(entry));
    const exposures: BeliefExposure[] = protocol === "text_communication_v1" || round === 1
      ? []
      : firstRoundReports.flatMap(report => expectedAgentIds.map(agentId => ({
          id: `exposure:${input.runId}:r2:${report.id}:${agentId}`,
          claimId: input.task.claim.id,
          sourceReportId: report.id,
          targetAgentId: agentId,
          round: 2,
          channel: "current_round" as const,
          exposedAt: clock.next("belief exposure time"),
        })));
    for (let agentIndex = 0; agentIndex < input.task.agents.length; agentIndex++) {
      const agent = input.task.agents[agentIndex];
      const binding = input.discussionAdapter.contract.agentBindings[agentIndex];
      const request: V6DiscussionRequestV1 = {
        requestSchemaRef: DISCUSSION_REQUEST_REF,
        requestId: `discussion:${input.runId}:r${round}:${agent.agentId}`,
        runId: input.runId,
        taskId: input.task.id,
        agentId: agent.agentId,
        round,
        protocol,
        publicContext: input.task.publicContext,
        ownPrivateInformation: agent.privateInformation,
        claim: structuredClone(input.task.claim),
        visibleTranscript: structuredClone(visibleAtRoundStart),
        responseContract: protocol === "text_communication_v1" ? "plain_text" : "belief_json_v1",
        modelRef: structuredClone(binding.modelRef),
        invocationConfig: structuredClone(binding.invocationConfig),
      };
      const requestedAt = clock.next("discussion requestedAt");
      let result: V6DiscussionAdapterResultV1 | { status: "timeout" };
      try {
        result = await withTimeout(input.discussionAdapter.contract.timeoutMs, signal =>
          input.discussionAdapter.respond(structuredClone(request), signal));
      } catch (error) {
        rethrowProviderExecutionHalt(error);
        result = { status: "unavailable", diagnosticCode: "provider_error" };
      }
      const recordedAt = clock.next("discussion recordedAt");
      const callBase = {
        requestId: request.requestId,
        round,
        sequence: discussionCalls.length + 1,
        agentId: agent.agentId,
        requestedAt,
        recordedAt,
        requestHash: hashValue(request),
      };
      if (result.status === "timeout") {
        providerFailures += 1;
        discussionCalls.push({ ...callBase, status: "unavailable", diagnosticCode: "timeout" });
        continue;
      }
      accountUsage(result.usage, "v6 discussion usage");
      if (result.status === "unavailable") {
        providerFailures += 1;
        discussionCalls.push({ ...callBase, status: "unavailable", diagnosticCode: result.diagnosticCode });
        continue;
      }
      if (protocol === "text_communication_v1") {
        if (typeof result.rawResponse !== "string" || result.rawResponse.trim().length === 0) {
          discussionCalls.push({ ...callBase, status: "invalid", diagnosticCode: "invalid_response" });
          continue;
        }
        const publicEntry: V6PublicTranscriptEntry = {
          round, agentId: agent.agentId, content: result.rawResponse, source: "agent",
        };
        transcript.push(publicEntry);
        discussionCalls.push({
          ...callBase, status: "answered", diagnosticCode: "none", publicMessage: result.rawResponse,
        });
        continue;
      }
      const parsed = parseBeliefResponse(result.rawResponse, input.task.claim);
      if (!parsed) {
        discussionCalls.push({ ...callBase, status: "invalid", diagnosticCode: "invalid_response" });
        continue;
      }
      const evidenceBundle = createEvidenceAndReferences({
        runId: input.runId, round, agentId: agent.agentId, parsed, createdAt: recordedAt,
      });
      roundEvidence.push(...evidenceBundle.evidence);
      const previous = round === 2
        ? firstRoundReports.find(report => report.agentId === agent.agentId)
        : undefined;
      const report: BeliefReport = {
        id: `report:${input.runId}:r${round}:${agent.agentId}`,
        claimId: input.task.claim.id,
        agentId: agent.agentId,
        round,
        value: structuredClone(parsed.value),
        evidence: evidenceBundle.references,
        stake: 0,
        createdAt: recordedAt,
        ...(previous ? { supersedesReportId: previous.id } : {}),
        ...(round === 2 ? { observedReportIds: firstRoundReports.map(report => report.id) } : {}),
      };
      roundReports.push(report);
      const publicEntry: V6PublicTranscriptEntry = {
        round, agentId: agent.agentId, content: parsed.message, source: "agent",
      };
      transcript.push(publicEntry);
      discussionCalls.push({
        ...callBase,
        status: "answered",
        diagnosticCode: "none",
        publicMessage: parsed.message,
        beliefReportId: report.id,
      });
    }
    if (protocol !== "text_communication_v1") {
      ledger.commitRound({ evidence: roundEvidence, reports: roundReports, exposures });
      if (round === 1) firstRoundReports.push(...roundReports.map(report => structuredClone(report)));
    }

    if (round === 1 && protocol === "epistemic_governance_v1" && firstRoundReports.length > 0) {
      monitoringSelection = createV6MonitoringSelectionV1({
        design: input.monitoringDesign,
        runId: input.runId,
        candidateReportIds: firstRoundReports.map(report => report.id),
        masterSeed: input.monitoringMasterSeed,
        selectedAt: clock.next("governance monitoring selectedAt"),
      });
      const target = firstRoundReports.find(report => report.id === monitoringSelection!.selectedReportId);
      if (!target) throw new Error("v6 monitoring selection references an unknown first-round report");
      const referencedEvidence = target.evidence
        .map(reference => ledger.getEvidence(reference.evidenceId))
        .filter((evidence): evidence is EpistemicEvidence => evidence !== undefined);
      const verifiedIndependentLineageCount = deriveVerifiedIndependentLineageCountV1({
        report: target,
        evidence: referencedEvidence,
        // The v1 provider slice has no pre-action provenance-verification
        // records. Therefore self-declared lineage ids correctly contribute 0.
        verifiedEvidenceIds: [],
      });
      const sourceBase = {
        eventRef: { id: "swarmalpha.event.architecture-belief-report", version: "1.0.0" },
        kind: "belief_report" as const,
        round: 1,
        payload: createMonitoredBeliefPayload(
          input.task.claim,
          target,
          monitoringSelection.contentHash,
        ),
      };
      const sourceEvent: GovernanceSourceEvent = {
        id: `governance-source:${target.id}`,
        ...sourceBase,
        contentHash: computeGovernanceSourceEventHash(sourceBase),
        recordedAt: clock.next("governance belief source recordedAt"),
      };
      const observation: GovernanceObservationRecord = {
        id: `observation:${target.id}`,
        observationRef: { id: "swarmalpha.observation.reported-certainty-lineage", version: "1.0.0" },
        round: 1,
        subjectIds: [target.agentId, target.claimId],
        completeness: "complete",
        missingFields: [],
        values: {
          certainty: deriveReportedCertainty(input.task.claim, target.value),
          beliefKind: input.task.claim.resolutionPolicy.kind,
          claimOptionCount: claimOptionCount(input.task.claim),
          verifiedIndependentLineageCount,
          lineageMeasurementRef: structuredClone(V6_VERIFIED_LINEAGE_MEASUREMENT_V1),
        },
        sourceEventIds: [sourceEvent.id],
        observedAt: clock.next("governance observation observedAt"),
      };
      const diagnosis = buildGovernanceDiagnosis({
        claim: input.task.claim,
        report: target,
        observationId: observation.id,
        preregistrationRef: input.study.preregistrationRef!,
        verifierAvailable: Boolean(input.verificationAdapter),
        verifiedIndependentLineageCount,
        createdAt: clock.next("governance diagnosis createdAt"),
      });
      const decisionBase = {
        policy,
        diagnoses: [diagnosis],
        availableBudget: { modelCalls: 1, tokenBudget: 300 },
        round: 1,
        sourceEventIds: [observation.id],
      };
      const eligibilityDecision = decisionEngine.decide({
        id: `decision:${input.runId}:eligibility`,
        ...decisionBase,
        decidedAt: clock.next("governance eligibility decidedAt"),
      });
      const auditBatch: Parameters<GovernanceAuditTrailBuilder["commit"]>[0] = {
        sourceEvents: [sourceEvent], observations: [observation], diagnoses: [diagnosis], decisions: [eligibilityDecision],
      };
      if (eligibilityDecision.outcome === "awaiting_assignment") {
        const eventAssignment = createGovernanceEventAssignment({
          id: `governance-assignment:${input.runId}:1`,
          runId: input.runId,
          unitKind: "eligible_event",
          eligibilityDecision,
          policy,
          masterSeed: input.eligibleEventMasterSeed,
          assignedAt: clock.next("governance event assignedAt"),
        });
        const closingDecision = decisionEngine.decide({
          id: `decision:${input.runId}:assigned`,
          ...decisionBase,
          decidedAt: clock.next("governance assigned decision decidedAt"),
          assignment: toGovernanceActionAssignmentRef(eventAssignment),
        });
        auditBatch.eventAssignments = [eventAssignment];
        auditBatch.decisions!.push(closingDecision);
        const selected = closingDecision.outcome === "held_out"
          ? closingDecision.candidateActions[0]
          : closingDecision.selectedActions[0];
        if (!selected) throw new Error("assigned governance decision has no action candidate");
        const instance: GovernanceActionInstance = {
          id: `action:${input.runId}:1`,
          decisionId: closingDecision.id,
          actionRef: structuredClone(selected.actionRef),
          targetIds: [...selected.targetIds],
          sourceDiagnosisIds: [...selected.sourceDiagnosisIds],
          parameters: structuredClone(selected.parameters),
          expectedCost: structuredClone(selected.expectedCost),
          assignmentId: eventAssignment.id,
          plannedWindow: { startRound: 2, endRound: 2 },
          createdAt: clock.next("governance action createdAt"),
        };
        validateGovernanceActionInstance(instance);
        const transitions: GovernanceActionTransition[] = [];
        const addTransition = (
          from: GovernanceActionTransition["from"],
          to: GovernanceActionTransition["to"],
          extra: Partial<GovernanceActionTransition> = {},
        ): void => {
          transitions.push(transition({
            runId: input.runId,
            instance,
            sequence: transitions.length + 1,
            from,
            to,
            round: to === "delivered" || to === "compliance_observed" || to === "completed" ? 2 : 1,
            occurredAt: clock.next(`governance transition ${to} occurredAt`),
            sourceEventIds: extra.sourceEventIds,
            observation: extra.observation,
            failureCode: extra.failureCode,
          }));
        };
        addTransition(null, "proposed");
        addTransition("proposed", "eligible");
        if (closingDecision.outcome === "held_out") {
          addTransition("eligible", "held_out");
        } else {
          addTransition("eligible", "assigned");
          addTransition("assigned", "queued");
          const verificationAdapter = input.verificationAdapter!;
          const matchedTokenBudget = selected.parameters.matchedTokenBudget;
          if (!Number.isSafeInteger(matchedTokenBudget) || (matchedTokenBudget as number) < 0) {
            throw new Error("selected governance action has invalid matchedTokenBudget");
          }
          const verificationRequest: V6VerificationRequestV1 = {
            requestSchemaRef: VERIFICATION_REQUEST_REF,
            requestId: `verification:${input.runId}:${instance.id}`,
            runId: input.runId,
            taskId: input.task.id,
            actionRef: structuredClone(instance.actionRef),
            targetAgentId: instance.targetIds[0],
            claim: structuredClone(input.task.claim),
            publicContext: input.task.publicContext,
            targetPublicMessage: discussionCalls.find(call => call.beliefReportId === target.id)?.publicMessage ?? "",
            matchedTokenBudget: matchedTokenBudget as number,
            modelRef: structuredClone(verificationAdapter.contract.modelRef),
            invocationConfig: structuredClone(verificationAdapter.contract.invocationConfig),
          };
          const verificationRequestHash = hashValue(verificationRequest);
          let verificationResult: V6VerificationAdapterResultV1 | { status: "timeout" };
          try {
            verificationResult = await withTimeout(verificationAdapter.contract.timeoutMs, signal =>
              verificationAdapter.verify(structuredClone(verificationRequest), signal));
          } catch (error) {
            rethrowProviderExecutionHalt(error);
            verificationResult = { status: "unavailable", diagnosticCode: "provider_error" };
          }
          if (verificationResult.status === "timeout" || verificationResult.status === "unavailable") {
            providerFailures += 1;
            if (verificationResult.status === "unavailable") {
              accountUsage(verificationResult.usage, "v6 verification usage");
            }
            addTransition("queued", "failed", {
              failureCode: verificationResult.status === "timeout" ? "timeout" : verificationResult.diagnosticCode,
            });
          } else {
            accountUsage(verificationResult.usage, "v6 verification usage");
            requireNonEmpty(verificationResult.publicContent, "v6 verification publicContent");
            const resultBase = {
              eventRef: { id: "swarmalpha.event.verification-result", version: "1.0.0" },
              kind: "tool_result" as const,
              round: 2,
              payload: {
                requestId: verificationRequest.requestId,
                requestHash: verificationRequestHash,
                actionInstanceId: instance.id,
                actionRef: instance.actionRef,
                complied: true,
                publicContent: verificationResult.publicContent,
              },
            };
            const resultEvent: GovernanceSourceEvent = {
              id: `governance-source:${verificationRequest.requestId}`,
              ...resultBase,
              contentHash: computeGovernanceSourceEventHash(resultBase),
              recordedAt: clock.next("verification result recordedAt"),
            };
            auditBatch.sourceEvents!.push(resultEvent);
            addTransition("queued", "delivered", { sourceEventIds: [resultEvent.id] });
            addTransition("delivered", "compliance_observed", {
              sourceEventIds: [resultEvent.id], observation: { complied: true },
            });
            addTransition("compliance_observed", "completed", { sourceEventIds: [resultEvent.id] });
            transcript.push({
              round: 2,
              agentId: `governance:${governanceRefKey(instance.actionRef)}`,
              content: verificationResult.publicContent,
              source: "governance",
            });
          }
        }
        auditBatch.actionInstances = [instance];
        auditBatch.actionTransitions = transitions;
      }
      auditBuilder.commit(auditBatch);
    }
    if (round === 1 && protocol === "epistemic_governance_v1" && firstRoundReports.length === 0) {
      monitoringSelection = createV6MonitoringSelectionV1({
        design: input.monitoringDesign,
        runId: input.runId,
        candidateReportIds: [],
        masterSeed: input.monitoringMasterSeed,
        selectedAt: clock.next("governance empty monitoring population recordedAt"),
      });
    }
  }

  const discussionCompletedAt = clock.next("discussion completedAt");
  const governanceAuditTrail: GovernanceAuditTrail = auditBuilder.seal(
    clock.next("governance audit sealedAt"),
  );
  validateGovernanceAuditTrail(governanceAuditTrail);
  replayGovernanceAuditTrailDecisions(governanceAuditTrail, [input.governanceRule]);

  const finalContract = createFinalElicitationContract({
    id: "swarmalpha.final-elicitation.v6-binary-production",
    version: "1.0.0",
    claimIds: [input.task.claim.id],
  });
  const session = new FinalOutcomeSession({
    runId: input.runId,
    taskId: input.task.id,
    contract: finalContract,
    claims: [input.task.claim],
    expectedAgentIds,
    discussionCompletedAt,
    totalRounds: 2,
    scoringTask: {
      groundTruth: {
        taskId: input.task.id,
        resolverId: input.task.claim.resolutionPolicy.resolverId,
        resolverVersion: "1.0.0",
        value: { [input.task.claim.id]: input.task.outcome },
      },
      evaluationContractRef: structuredClone(input.study.evaluationContractRef),
    },
  });
  const viewsByAgent = Object.fromEntries(input.task.agents.map(agent => [agent.agentId, {
    publicContext: input.task.publicContext,
    ownPrivateInformation: agent.privateInformation,
    discussionTranscript: transcript.map(entry => ({
      round: entry.round, agentId: entry.agentId, content: entry.content,
    })),
  } satisfies FinalElicitationViewV1]));
  const finalElicitationCollection = await collectFinalElicitationV1({
    runId: input.runId,
    contract: finalContract,
    claims: [input.task.claim],
    expectedAgentIds,
    viewsByAgent,
    session,
    adapter: input.finalElicitationAdapter,
    clock: () => clock.next("final elicitation collection time"),
  });
  for (const record of finalElicitationCollection.records) {
    accountUsage(record.usage, `v6 final elicitation usage for ${record.agentId}`);
  }
  session.closeElicitation(clock.next("final elicitation closedAt"));
  session.resolveClaims((claim, scoringTask, resolvedAt): ClaimResolution => {
    const outcome = (scoringTask.groundTruth.value as Record<string, boolean | string>)[claim.id];
    return claim.resolutionPolicy.kind === "binary"
      ? {
          claimId: claim.id,
          resolverId: claim.resolutionPolicy.resolverId,
          resolvedAt,
          kind: "binary",
          outcome: outcome as boolean,
        }
      : {
          claimId: claim.id,
          resolverId: claim.resolutionPolicy.resolverId,
          resolvedAt,
          kind: "categorical",
          outcome: outcome as string,
        };
  }, clock.next("final resolution recordedAt"));
  const finalOutcome = session.score(clock.next("final scoring completedAt"));
  validateFinalElicitationCollectionForOutcomeV1(finalElicitationCollection, finalOutcome);
  ledger.resolveClaim(finalOutcome.resolutions[0]);
  const operationalOutcome = createOperationalOutcomeArtifactV1({
    study: input.study,
    primaryAssignmentManifest: prepared.assignment.manifest,
    analysisUnit: persistedUnit.analysisUnit,
    finalOutcome,
    computedAt: clock.next("operational outcome computedAt"),
  });
  validateOperationalOutcomeArtifactV1(operationalOutcome, {
    study: input.study,
    primaryAssignmentManifest: prepared.assignment.manifest,
    analysisUnit: persistedUnit.analysisUnit,
    finalOutcome,
  });
  const taskOutcome = projectFinalOutcomeTaskRecord({
    artifact: finalOutcome,
    runAssignmentId: prepared.assignment.manifest.assignment.id,
    cost: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      totalLatencyMs: latencyMs,
      invalidOrFailed: providerFailures
        + discussionCalls.filter(call => call.status === "invalid").length
        + finalOutcome.elicitationRecords.filter(record => record.status !== "answered").length,
    },
  });

  const traceBody: Omit<V6InteractionTraceV1, "contentHash"> = {
    artifactSchemaRef: INTERACTION_TRACE_REF,
    runId: input.runId,
    taskId: input.task.id,
    primaryAssignmentId: prepared.assignment.manifest.assignment.id,
    assignedArmRef: structuredClone(prepared.assignment.manifest.assignment.assignedArmRef),
    protocol,
    expectedAgentIds,
    discussionAdapterContract: structuredClone(input.discussionAdapter.contract),
    ...(protocol === "epistemic_governance_v1"
      ? { verificationAdapterContract: structuredClone(input.verificationAdapter!.contract) }
      : {}),
    discussionCalls,
    publicTranscript: structuredClone(transcript),
    epistemicEvents: ledger.getEvents(),
    ...(monitoringSelection ? { monitoringSelection: structuredClone(monitoringSelection) } : {}),
  };
  const v6InteractionTrace: V6InteractionTraceV1 = {
    ...traceBody,
    contentHash: computeV6InteractionTraceHashV1(traceBody),
  };
  validateV6InteractionTraceV1(v6InteractionTrace, {
    task: input.task,
    primaryAssignmentId: prepared.assignment.manifest.assignment.id,
    assignedArmRef: prepared.assignment.manifest.assignment.assignedArmRef,
    protocol,
    monitoringDesign: input.monitoringDesign,
  });

  const artifact: V6AuditableRawRunData = {
    runId: input.runId,
    experimentId: input.experimentId,
    runtimeMode: "belief",
    seed: input.seed,
    runIndex: input.runIndex,
    timestamp: clock.next("raw run timestamp"),
    scenario: input.task.claim.resolutionPolicy.kind === "binary" ? "v6_binary" : "v6_categorical",
    agentCount: expectedAgentIds.length,
    maxRounds: 2,
    totalRounds: 2,
    converged: false,
    finalRanking: [],
    finalKendallTau: 0,
    rankingMetricApplicable: false,
    finalAccuracy: taskOutcome.quality ?? 0,
    rawSchemaVersion: "5.0",
    governanceStudy: structuredClone(input.study),
    governanceAuditTrail,
    primaryAssignmentManifest: prepared.assignment.manifest,
    primaryArmExecutionRegistry: structuredClone(input.registry),
    primaryArmExecution: prepared.execution.binding,
    finalOutcome,
    operationalAnalysisUnit: persistedUnit.analysisUnit,
    operationalOutcome,
    taskOutcome,
    finalElicitationCollection,
    beliefTrajectory: [],
    interventions: [],
    governanceIssues: [],
    tokenUsage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      totalLatencyMs: latencyMs,
    },
    v6TaskManifest: persistedTaskManifest.manifest,
    v6MonitoringDesign: structuredClone(input.monitoringDesign),
    v6InteractionTrace,
  };
  return publishCompletedArtifact({
    outputDir: input.outputDir,
    artifact,
    task: input.task,
    taskAuthority: input.taskAuthority,
    monitoringDesign: input.monitoringDesign,
    study: input.study,
    registry: input.registry,
    governanceRule: input.governanceRule,
  });
}

export type { OperationalAnalysisUnitV1 };
