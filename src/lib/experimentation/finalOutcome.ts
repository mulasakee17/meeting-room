import {
  containsForbiddenTruthKey,
  type ExperimentTaskBundle,
} from "../experiment-contracts/contracts";
import {
  ABSTAIN_ON_TIE_DECISION_V1,
  EQUAL_WEIGHT_LINEAR_POOL_V1,
  decidePooledBelief,
  equalWeightLinearPool,
  type BeliefPoolResult,
  type PooledDecision,
} from "../epistemic/aggregation";
import {
  defaultBeliefContractRegistry,
  type BeliefContractRegistry,
  validateEpistemicClaim,
} from "../epistemic/contracts";
import { scoreBeliefReport } from "../epistemic/scoring";
import {
  validateTaskOutcome,
  type CostRecord,
  type TaskOutcomeRecord,
} from "./lifecycle";
import type {
  BeliefReport,
  BeliefValue,
  ClaimResolution,
  EpistemicClaim,
} from "../epistemic/types";

export const FINAL_ELICITATION_RESPONSE_SCHEMA_V1 = Object.freeze({
  id: "swarmalpha.final-elicitation.response",
  version: "1.0.0",
});

export const FINAL_ELICITATION_PROMPT_V1 = Object.freeze({
  id: "swarmalpha.final-elicitation.prompt",
  version: "1.0.0",
});

export const FINAL_OUTCOME_ARTIFACT_V1 = Object.freeze({
  id: "swarmalpha.final-outcome",
  version: "1.0.0",
});

export const FINAL_OUTCOME_TASK_EVALUATION_V1 = Object.freeze({
  id: "swarmalpha.final-outcome.pooled-decision-accuracy",
  version: "1.0.0",
});

export interface FinalElicitationContractV1 {
  id: string;
  version: string;
  promptTemplateRef: { id: string; version: string };
  responseSchemaRef: { id: string; version: string };
  claimIds: string[];
  timing: "post_discussion_pre_resolution";
  privacy: "isolated_per_agent";
  feedback: "measurement_only_no_discussion_reentry";
  truthAccess: "forbidden_until_elicitation_closed";
  missingnessPolicy: "explicit_terminal_record";
  agentOrderPolicy: "precommitted_exact_order";
  requireAllClaims: true;
  aggregationRef: { id: string; version: string };
  decisionRef: { id: string; version: string };
}

export interface FinalElicitationTranscriptEntry {
  round: number;
  agentId: string;
  content: string;
}

/**
 * The only information surface accepted by the final measurement prompt.
 * It is deliberately agent-specific: callers must provide only that agent's
 * private information, never the full task bundle or another agent's private
 * information.
 */
export interface FinalElicitationViewV1 {
  publicContext: string;
  ownPrivateInformation: string;
  discussionTranscript: FinalElicitationTranscriptEntry[];
}

export interface FinalElicitedReport {
  id: string;
  claimId: string;
  agentId: string;
  value: BeliefValue;
}

export type FinalElicitationTerminalStatus =
  | "answered"
  | "abstained"
  | "invalid"
  | "unavailable";

export type FinalElicitationDiagnosticCode =
  | "none"
  | "explicit_abstention"
  | "invalid_json"
  | "invalid_response_shape"
  | "duplicate_claim"
  | "unknown_claim"
  | "missing_claim"
  | "invalid_belief_value"
  | "provider_error"
  | "timeout"
  | "adapter_unavailable";

export interface FinalElicitationRecord {
  id: string;
  agentId: string;
  sequence: number;
  recordedAt: string;
  status: FinalElicitationTerminalStatus;
  parseMode: "strict_json" | "code_fence_json" | "none";
  diagnosticCode: FinalElicitationDiagnosticCode;
  reports: FinalElicitedReport[];
  missingClaimIds: string[];
  rawResponse?: string;
}

export interface FinalIndividualReportScore {
  reportId: string;
  agentId: string;
  properLoss: number;
}

export interface FinalClaimOutcome {
  claimId: string;
  reportCoverage: number;
  answeredAgentIds: string[];
  missingAgentIds: string[];
  excludedAgentIdsByStatus: {
    abstained: string[];
    invalid: string[];
    unavailable: string[];
  };
  individualScores: FinalIndividualReportScore[];
  meanIndividualProperLoss: number | null;
  pooledBelief: BeliefPoolResult;
  pooledDecision: PooledDecision;
  pooledProperLoss: number | null;
  /** Structural comparison only; external truth commitment is a separate artifact concern. */
  pooledDecisionMatchesResolution: boolean | null;
}

export interface FinalOutcomeArtifactV1 {
  artifactSchemaRef: { id: string; version: string };
  runId: string;
  taskId: string;
  contract: FinalElicitationContractV1;
  claims: EpistemicClaim[];
  expectedAgentIds: string[];
  status: "scored";
  discussionCompleted: {
    sequence: 0;
    completedAt: string;
    totalRounds: number;
  };
  elicitationRecords: FinalElicitationRecord[];
  elicitationClosed: { sequence: number; closedAt: string };
  resolutionsRecorded: { sequence: number; recordedAt: string };
  scoringCompleted: { sequence: number; completedAt: string };
  resolutions: ClaimResolution[];
  claimOutcomes: FinalClaimOutcome[];
}

/**
 * Schema-5 scalar task projection. Proper losses remain claim-level primary
 * measurements; this scalar is only the equal-weight accuracy of non-tied
 * pooled decisions across the task's registered claims.
 */
export function projectFinalOutcomeTaskRecord(input: {
  artifact: FinalOutcomeArtifactV1;
  runAssignmentId: string;
  cost: CostRecord;
}): TaskOutcomeRecord {
  validateFinalOutcomeArtifact(input.artifact);
  requireNonEmpty(input.runAssignmentId, "taskOutcome.runAssignmentId");
  const matches = input.artifact.claimOutcomes.map(outcome => outcome.pooledDecisionMatchesResolution);
  const fullyObserved = matches.length > 0 && matches.every(value => value !== null);
  const taskOutcome: TaskOutcomeRecord = {
    runAssignmentId: input.runAssignmentId,
    evaluationContractRef: FINAL_OUTCOME_TASK_EVALUATION_V1,
    sourceFinalOutcomeRef: {
      id: input.artifact.artifactSchemaRef.id,
      version: input.artifact.artifactSchemaRef.version,
      runId: input.artifact.runId,
    },
    quality: fullyObserved
      ? matches.reduce<number>((sum, value) => sum + (value === true ? 1 : 0), 0) / matches.length
      : null,
    cost: structuredClone(input.cost),
    status: fullyObserved ? "scored" : "unresolved",
  };
  validateTaskOutcome(taskOutcome);
  return taskOutcome;
}

export type FinalOutcomeResolutionFunction = (
  claim: EpistemicClaim,
  scoringTask: ExperimentTaskBundle["scoringTask"],
  resolvedAt: string,
) => ClaimResolution;

interface ParsedResponse {
  status: "answered" | "abstained" | "invalid";
  parseMode: FinalElicitationRecord["parseMode"];
  diagnosticCode: FinalElicitationDiagnosticCode;
  reports: Array<{ claimId: string; value: BeliefValue }>;
  missingClaimIds: string[];
}

function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function requireTimestamp(value: unknown, field: string): asserts value is string {
  requireNonEmpty(value, field);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${field} must be a canonical ISO timestamp`);
  }
}

function requireNotBefore(value: string, lowerBound: string, field: string, lowerField: string): void {
  if (Date.parse(value) < Date.parse(lowerBound)) {
    throw new Error(`${field} must not precede ${lowerField}`);
  }
}

function uniqueNonEmpty(values: unknown, field: string, sort = true): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${field} must contain at least one entry`);
  }
  for (const value of values) requireNonEmpty(value, `${field} entry`);
  if (new Set(values).size !== values.length) throw new Error(`${field} must contain unique entries`);
  return sort ? [...values].sort() : [...values];
}

function stableJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

function refsEqual(
  left: { id: string; version: string },
  right: { id: string; version: string },
): boolean {
  return left.id === right.id && left.version === right.version;
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[], field: string): void {
  const unexpected = Object.keys(value).filter(key => !allowed.includes(key));
  if (unexpected.length > 0) throw new Error(`${field} contains unexpected fields: ${unexpected.sort().join(",")}`);
}

export function validateFinalElicitationContract(
  value: unknown,
): asserts value is FinalElicitationContractV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("FinalElicitationContractV1 must be an object");
  }
  const contract = value as Record<string, unknown>;
  assertExactKeys(contract, [
    "id", "version", "promptTemplateRef", "responseSchemaRef", "claimIds",
    "timing", "privacy", "feedback", "truthAccess", "missingnessPolicy",
    "agentOrderPolicy", "requireAllClaims", "aggregationRef", "decisionRef",
  ], "finalElicitationContract");
  requireNonEmpty(contract.id, "finalElicitationContract.id");
  requireNonEmpty(contract.version, "finalElicitationContract.version");
  const claimIds = uniqueNonEmpty(contract.claimIds, "finalElicitationContract.claimIds");
  if (stableJson(claimIds) !== stableJson(contract.claimIds)) {
    throw new Error("finalElicitationContract.claimIds must be in canonical sorted order");
  }
  if (contract.timing !== "post_discussion_pre_resolution"
    || contract.privacy !== "isolated_per_agent"
    || contract.feedback !== "measurement_only_no_discussion_reentry"
    || contract.truthAccess !== "forbidden_until_elicitation_closed"
    || contract.missingnessPolicy !== "explicit_terminal_record"
    || contract.agentOrderPolicy !== "precommitted_exact_order"
    || contract.requireAllClaims !== true) {
    throw new Error("final elicitation v1 must preserve timing, privacy, truth, feedback, and missingness invariants");
  }
  for (const [field, expected] of [
    ["promptTemplateRef", FINAL_ELICITATION_PROMPT_V1],
    ["responseSchemaRef", FINAL_ELICITATION_RESPONSE_SCHEMA_V1],
    ["aggregationRef", EQUAL_WEIGHT_LINEAR_POOL_V1],
    ["decisionRef", ABSTAIN_ON_TIE_DECISION_V1],
  ] as const) {
    const actual = contract[field];
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)
      || !refsEqual(actual as { id: string; version: string }, expected)) {
      throw new Error(`finalElicitationContract.${field} must reference ${expected.id}@${expected.version}`);
    }
    assertExactKeys(
      actual as Record<string, unknown>,
      Object.keys(expected),
      `finalElicitationContract.${field}`,
    );
  }
}

export function createFinalElicitationContract(input: {
  id: string;
  version: string;
  claimIds: readonly string[];
}): FinalElicitationContractV1 {
  const contract: FinalElicitationContractV1 = {
    id: input.id,
    version: input.version,
    promptTemplateRef: FINAL_ELICITATION_PROMPT_V1,
    responseSchemaRef: FINAL_ELICITATION_RESPONSE_SCHEMA_V1,
    claimIds: [...input.claimIds].sort(),
    timing: "post_discussion_pre_resolution",
    privacy: "isolated_per_agent",
    feedback: "measurement_only_no_discussion_reentry",
    truthAccess: "forbidden_until_elicitation_closed",
    missingnessPolicy: "explicit_terminal_record",
    agentOrderPolicy: "precommitted_exact_order",
    requireAllClaims: true,
    aggregationRef: EQUAL_WEIGHT_LINEAR_POOL_V1,
    decisionRef: ABSTAIN_ON_TIE_DECISION_V1,
  };
  validateFinalElicitationContract(contract);
  return structuredClone(contract);
}

export function validateFinalElicitationView(value: unknown): asserts value is FinalElicitationViewV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("FinalElicitationViewV1 must be an object");
  }
  const view = value as Record<string, unknown>;
  assertExactKeys(view, ["publicContext", "ownPrivateInformation", "discussionTranscript"], "finalElicitationView");
  if (typeof view.publicContext !== "string" || typeof view.ownPrivateInformation !== "string") {
    throw new Error("final elicitation view context fields must be strings");
  }
  if (!Array.isArray(view.discussionTranscript)) {
    throw new Error("finalElicitationView.discussionTranscript must be an array");
  }
  for (const entry of view.discussionTranscript) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("final elicitation transcript entries must be objects");
    }
    const record = entry as Record<string, unknown>;
    assertExactKeys(record, ["round", "agentId", "content"], "final elicitation transcript entry");
    if (!Number.isSafeInteger(record.round) || (record.round as number) < 1) {
      throw new Error("final elicitation transcript round must be a positive integer");
    }
    requireNonEmpty(record.agentId, "final elicitation transcript agentId");
    if (typeof record.content !== "string") throw new Error("final elicitation transcript content must be a string");
  }
  const leak = containsForbiddenTruthKey(view);
  if (leak) throw new Error(`final elicitation view leaks scoring truth at ${leak}`);
}

/** Build an arm-invariant measurement prompt from a truth-free, agent-private view. */
export function buildFinalElicitationPrompt(input: {
  view: FinalElicitationViewV1;
  contract: FinalElicitationContractV1;
  claims: readonly EpistemicClaim[];
  contractRegistry?: BeliefContractRegistry;
}): string {
  validateFinalElicitationView(input.view);
  validateFinalElicitationContract(input.contract);
  const registry = input.contractRegistry ?? defaultBeliefContractRegistry;
  const claimById = new Map(input.claims.map(claim => [claim.id, claim]));
  if (claimById.size !== input.claims.length) throw new Error("final elicitation claims must have unique ids");
  if (input.contract.claimIds.some(id => !claimById.has(id))
    || input.claims.some(claim => !input.contract.claimIds.includes(claim.id))) {
    throw new Error("final elicitation claims must exactly match the frozen contract");
  }
  for (const claim of input.claims) {
    validateEpistemicClaim(claim, registry);
    requireTimestamp(claim.createdAt, `final elicitation claim ${claim.id}.createdAt`);
  }

  const transcript = input.view.discussionTranscript
    .map(entry => `[round ${entry.round}] ${entry.agentId}: ${entry.content}`)
    .join("\n");
  const claimInstructions = input.contract.claimIds.map(claimId => {
    const claim = claimById.get(claimId)!;
    let outcomes: string;
    if (claim.resolutionPolicy.kind === "binary") {
      outcomes = "Return P(true) as a number from 0 to 1.";
    } else if (claim.resolutionPolicy.kind === "categorical" && "options" in claim) {
      outcomes = `Return a probability for every canonical outcome: ${claim.options.join(" | ")}. The probabilities must sum to 1.`;
    } else {
      throw new Error(`final elicitation prompt does not support claim kind ${(claim.resolutionPolicy as { kind: string }).kind}`);
    }
    return `- claimId=${claim.id}: ${claim.proposition}\n  ${outcomes}`;
  }).join("\n");

  return `The discussion is complete. This is a private outcome measurement. Other agents will not see your response, and your response will not re-enter the discussion. No correctness feedback is available yet.\n\nPublic task context:\n${input.view.publicContext}\n\nYour original private information:\n${input.view.ownPrivateInformation}\n\nCompleted discussion transcript:\n${transcript || "(no discussion messages were recorded)"}\n\nReport your final probabilities for every registered claim:\n${claimInstructions}\n\nReturn only one JSON object. To answer, use:\n{"status":"answered","reports":[{"claimId":"<id>","value":{"kind":"binary","probability":0.5}}]}\nFor categorical claims use value={"kind":"categorical","probabilities":{"<canonical outcome>":0.5,"<other outcome>":0.5}}. To decline, use {"status":"abstained"}. Do not include evidence, rationale, confidence labels, scores, or any additional fields.`;
}

function parseJsonObject(rawResponse: string): {
  value: Record<string, unknown> | null;
  mode: "strict_json" | "code_fence_json" | "none";
} {
  const parse = (text: string): Record<string, unknown> | null => {
    try {
      const value = JSON.parse(text) as unknown;
      return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  };
  const strict = parse(rawResponse.trim());
  if (strict) return { value: strict, mode: "strict_json" };
  const fenced = rawResponse.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    const value = parse(fenced[1]);
    if (value) return { value, mode: "code_fence_json" };
  }
  return { value: null, mode: "none" };
}

function parseFinalElicitationResponse(input: {
  rawResponse: string;
  contract: FinalElicitationContractV1;
  claims: readonly EpistemicClaim[];
  contractRegistry: BeliefContractRegistry;
}): ParsedResponse {
  const parsed = parseJsonObject(input.rawResponse);
  if (!parsed.value) {
    return {
      status: "invalid",
      parseMode: "none",
      diagnosticCode: "invalid_json",
      reports: [],
      missingClaimIds: [...input.contract.claimIds],
    };
  }
  const payload = parsed.value;
  if (payload.status === "abstained") {
    if (Object.keys(payload).some(key => !["status"].includes(key))) {
      return {
        status: "invalid", parseMode: parsed.mode, diagnosticCode: "invalid_response_shape",
        reports: [], missingClaimIds: [...input.contract.claimIds],
      };
    }
    return {
      status: "abstained",
      parseMode: parsed.mode,
      diagnosticCode: "explicit_abstention",
      reports: [],
      missingClaimIds: [...input.contract.claimIds],
    };
  }
  if (payload.status !== "answered" || !Array.isArray(payload.reports)
    || Object.keys(payload).some(key => !["status", "reports"].includes(key))) {
    return {
      status: "invalid", parseMode: parsed.mode, diagnosticCode: "invalid_response_shape",
      reports: [], missingClaimIds: [...input.contract.claimIds],
    };
  }
  const claimById = new Map(input.claims.map(claim => [claim.id, claim]));
  const reports: Array<{ claimId: string; value: BeliefValue }> = [];
  const seen = new Set<string>();
  for (const report of payload.reports) {
    if (report === null || typeof report !== "object" || Array.isArray(report)) {
      return {
        status: "invalid", parseMode: parsed.mode, diagnosticCode: "invalid_response_shape",
        reports: [], missingClaimIds: [...input.contract.claimIds],
      };
    }
    const record = report as Record<string, unknown>;
    if (Object.keys(record).some(key => !["claimId", "value"].includes(key))
      || typeof record.claimId !== "string"
      || record.value === null || typeof record.value !== "object" || Array.isArray(record.value)) {
      return {
        status: "invalid", parseMode: parsed.mode, diagnosticCode: "invalid_response_shape",
        reports: [], missingClaimIds: [...input.contract.claimIds],
      };
    }
    if (seen.has(record.claimId)) {
      return {
        status: "invalid", parseMode: parsed.mode, diagnosticCode: "duplicate_claim",
        reports: [], missingClaimIds: [...input.contract.claimIds],
      };
    }
    const claim = claimById.get(record.claimId);
    if (!claim || !input.contract.claimIds.includes(record.claimId)) {
      return {
        status: "invalid", parseMode: parsed.mode, diagnosticCode: "unknown_claim",
        reports: [], missingClaimIds: [...input.contract.claimIds],
      };
    }
    try {
      const value = input.contractRegistry.get(claim.resolutionPolicy.kind)
        .normalizeValue(claim, record.value as BeliefValue);
      reports.push({ claimId: claim.id, value });
      seen.add(claim.id);
    } catch {
      return {
        status: "invalid", parseMode: parsed.mode, diagnosticCode: "invalid_belief_value",
        reports: [], missingClaimIds: [...input.contract.claimIds],
      };
    }
  }
  const missingClaimIds = input.contract.claimIds.filter(id => !seen.has(id));
  if (missingClaimIds.length > 0) {
    return {
      status: "invalid", parseMode: parsed.mode, diagnosticCode: "missing_claim",
      // The partial reports are discarded, so every required claim is missing
      // from the terminal measurement record, not only the omitted subset.
      reports: [], missingClaimIds: [...input.contract.claimIds],
    };
  }
  return {
    status: "answered",
    parseMode: parsed.mode,
    diagnosticCode: "none",
    reports: reports.sort((left, right) => left.claimId.localeCompare(right.claimId)),
    missingClaimIds: [],
  };
}

function finalReportToBeliefReport(
  report: FinalElicitedReport,
  recordedAt: string,
  finalRound: number,
): BeliefReport {
  return {
    id: report.id,
    claimId: report.claimId,
    agentId: report.agentId,
    round: finalRound,
    value: structuredClone(report.value),
    evidence: [],
    stake: 0,
    createdAt: recordedAt,
  };
}

function computeClaimOutcomes(input: {
  claims: readonly EpistemicClaim[];
  expectedAgentIds: readonly string[];
  records: readonly FinalElicitationRecord[];
  resolutions: readonly ClaimResolution[];
  finalRound: number;
  contractRegistry: BeliefContractRegistry;
}): FinalClaimOutcome[] {
  const recordByAgent = new Map(input.records.map(record => [record.agentId, record]));
  const resolutionByClaim = new Map(input.resolutions.map(resolution => [resolution.claimId, resolution]));
  return [...input.claims].sort((left, right) => left.id.localeCompare(right.id)).map(claim => {
    const resolution = resolutionByClaim.get(claim.id);
    if (!resolution) throw new Error(`Missing final resolution for claim ${claim.id}`);
    const reports: BeliefReport[] = [];
    for (const agentId of input.expectedAgentIds) {
      const record = recordByAgent.get(agentId)!;
      const report = record.reports.find(candidate => candidate.claimId === claim.id);
      if (report) reports.push(finalReportToBeliefReport(report, record.recordedAt, input.finalRound));
    }
    const answeredAgentIds = reports.map(report => report.agentId).sort();
    const missingAgentIds = input.expectedAgentIds.filter(id => !answeredAgentIds.includes(id)).sort();
    const excludedAgentIdsByStatus = {
      abstained: input.records.filter(record => record.status === "abstained"
        && !record.reports.some(report => report.claimId === claim.id)).map(record => record.agentId).sort(),
      invalid: input.records.filter(record => record.status === "invalid"
        && !record.reports.some(report => report.claimId === claim.id)).map(record => record.agentId).sort(),
      unavailable: input.records.filter(record => record.status === "unavailable"
        && !record.reports.some(report => report.claimId === claim.id)).map(record => record.agentId).sort(),
    };
    const individualScores = reports.map(report => ({
      reportId: report.id,
      agentId: report.agentId,
      properLoss: scoreBeliefReport(claim, report, resolution, input.contractRegistry).properLoss,
    })).sort((left, right) => left.agentId.localeCompare(right.agentId));
    if (individualScores.some(score => !Number.isFinite(score.properLoss))) {
      throw new Error(`final outcome produced a non-finite individual proper loss for claim ${claim.id}`);
    }
    const pooledBelief = equalWeightLinearPool({
      claim,
      latestReports: reports,
      abstainedAgentIds: missingAgentIds,
      contractRegistry: input.contractRegistry,
    });
    const pooledDecision = decidePooledBelief(pooledBelief);
    const pooledProperLoss = pooledBelief.status === "available"
      ? scoreBeliefReport(claim, {
          claimId: claim.id,
          value: pooledBelief.value,
          stake: 0,
        }, resolution, input.contractRegistry).properLoss
      : null;
    if (pooledProperLoss !== null && !Number.isFinite(pooledProperLoss)) {
      throw new Error(`final outcome produced a non-finite pooled proper loss for claim ${claim.id}`);
    }
    const pooledDecisionMatchesResolution = pooledDecision.status === "decided"
      ? pooledDecision.outcome === resolution.outcome
      : null;
    return {
      claimId: claim.id,
      reportCoverage: reports.length / input.expectedAgentIds.length,
      answeredAgentIds,
      missingAgentIds,
      excludedAgentIdsByStatus,
      individualScores,
      meanIndividualProperLoss: individualScores.length > 0
        ? individualScores.reduce((sum, score) => sum + score.properLoss, 0) / individualScores.length
        : null,
      pooledBelief,
      pooledDecision,
      pooledProperLoss,
      pooledDecisionMatchesResolution,
    };
  });
}

/**
 * Single-writer outcome lifecycle. Scoring truth is held in a JavaScript
 * private field and is passed to the resolver only after every expected agent
 * has a terminal elicitation record and the elicitation has been closed.
 */
export class FinalOutcomeSession {
  readonly #runId: string;
  readonly #taskId: string;
  readonly #contract: FinalElicitationContractV1;
  readonly #claims: EpistemicClaim[];
  readonly #expectedAgentIds: string[];
  readonly #discussionCompletedAt: string;
  readonly #totalRounds: number;
  readonly #scoringTask: ExperimentTaskBundle["scoringTask"];
  readonly #contractRegistry: BeliefContractRegistry;
  readonly #records: FinalElicitationRecord[] = [];
  #state: "elicitation_open" | "elicitation_closed" | "resolved" | "scored" = "elicitation_open";
  #elicitationClosed: FinalOutcomeArtifactV1["elicitationClosed"] | undefined;
  #resolutionsRecorded: FinalOutcomeArtifactV1["resolutionsRecorded"] | undefined;
  #scoringCompleted: FinalOutcomeArtifactV1["scoringCompleted"] | undefined;
  #resolutions: ClaimResolution[] = [];
  #claimOutcomes: FinalClaimOutcome[] = [];

  constructor(input: {
    runId: string;
    taskId: string;
    contract: FinalElicitationContractV1;
    claims: readonly EpistemicClaim[];
    expectedAgentIds: readonly string[];
    discussionCompletedAt: string;
    totalRounds: number;
    scoringTask: ExperimentTaskBundle["scoringTask"];
    contractRegistry?: BeliefContractRegistry;
  }) {
    requireNonEmpty(input.runId, "finalOutcome.runId");
    requireNonEmpty(input.taskId, "finalOutcome.taskId");
    requireTimestamp(input.discussionCompletedAt, "finalOutcome.discussionCompletedAt");
    if (!Number.isSafeInteger(input.totalRounds) || input.totalRounds < 0) {
      throw new Error("finalOutcome.totalRounds must be a non-negative integer");
    }
    validateFinalElicitationContract(input.contract);
    const expectedAgentIds = uniqueNonEmpty([...input.expectedAgentIds], "finalOutcome.expectedAgentIds", false);
    const registry = (input.contractRegistry ?? defaultBeliefContractRegistry).snapshot().seal();
    const claims = input.claims.map(claim => structuredClone(claim)).sort((left, right) => left.id.localeCompare(right.id));
    if (new Set(claims.map(claim => claim.id)).size !== claims.length
      || stableJson(claims.map(claim => claim.id)) !== stableJson(input.contract.claimIds)) {
      throw new Error("final outcome claims must exactly match contract.claimIds");
    }
    for (const claim of claims) {
      validateEpistemicClaim(claim, registry);
      requireTimestamp(claim.createdAt, `final outcome claim ${claim.id}.createdAt`);
    }
    if (input.scoringTask === null || typeof input.scoringTask !== "object") {
      throw new Error("finalOutcome.scoringTask must be an object");
    }
    if (input.scoringTask.groundTruth.taskId !== input.taskId) {
      throw new Error("final outcome taskId does not match scoring truth taskId");
    }
    this.#runId = input.runId;
    this.#taskId = input.taskId;
    this.#contract = structuredClone(input.contract);
    this.#claims = claims;
    this.#expectedAgentIds = expectedAgentIds;
    this.#discussionCompletedAt = input.discussionCompletedAt;
    this.#totalRounds = input.totalRounds;
    this.#scoringTask = structuredClone(input.scoringTask);
    this.#contractRegistry = registry;
  }

  get state(): "elicitation_open" | "elicitation_closed" | "resolved" | "scored" {
    return this.#state;
  }

  /** Read-only identity surface for a truth-free production collection adapter. */
  get runId(): string {
    return this.#runId;
  }

  get discussionCompletedAt(): string {
    return this.#discussionCompletedAt;
  }

  get contract(): FinalElicitationContractV1 {
    return structuredClone(this.#contract);
  }

  get expectedAgentIds(): string[] {
    return [...this.#expectedAgentIds];
  }

  get claims(): EpistemicClaim[] {
    return structuredClone(this.#claims);
  }

  recordRawResponse(agentId: string, rawResponse: string, recordedAt: string): FinalElicitationRecord {
    if (this.#state !== "elicitation_open") throw new Error("final elicitation is already closed");
    this.#assertNewAgent(agentId);
    requireTimestamp(recordedAt, "finalElicitationRecord.recordedAt");
    requireNotBefore(recordedAt, this.#discussionCompletedAt, "finalElicitationRecord.recordedAt", "discussionCompletedAt");
    const parsed = parseFinalElicitationResponse({
      rawResponse,
      contract: this.#contract,
      claims: this.#claims,
      contractRegistry: this.#contractRegistry,
    });
    const reports = parsed.status === "answered"
      ? parsed.reports.map(report => ({
          id: `final-report:${this.#runId}:${agentId}:${report.claimId}`,
          claimId: report.claimId,
          agentId,
          value: structuredClone(report.value),
        }))
      : [];
    const record: FinalElicitationRecord = {
      id: `final-response:${this.#runId}:${agentId}`,
      agentId,
      sequence: this.#records.length + 1,
      recordedAt,
      status: parsed.status,
      parseMode: parsed.parseMode,
      diagnosticCode: parsed.diagnosticCode,
      reports,
      missingClaimIds: [...parsed.missingClaimIds],
      rawResponse,
    };
    this.#records.push(structuredClone(record));
    return structuredClone(record);
  }

  recordUnavailable(
    agentId: string,
    diagnosticCode: "provider_error" | "timeout" | "adapter_unavailable",
    recordedAt: string,
  ): FinalElicitationRecord {
    if (this.#state !== "elicitation_open") throw new Error("final elicitation is already closed");
    this.#assertNewAgent(agentId);
    requireTimestamp(recordedAt, "finalElicitationRecord.recordedAt");
    requireNotBefore(recordedAt, this.#discussionCompletedAt, "finalElicitationRecord.recordedAt", "discussionCompletedAt");
    const record: FinalElicitationRecord = {
      id: `final-response:${this.#runId}:${agentId}`,
      agentId,
      sequence: this.#records.length + 1,
      recordedAt,
      status: "unavailable",
      parseMode: "none",
      diagnosticCode,
      reports: [],
      missingClaimIds: [...this.#contract.claimIds],
    };
    this.#records.push(structuredClone(record));
    return structuredClone(record);
  }

  closeElicitation(closedAt: string): void {
    if (this.#state !== "elicitation_open") throw new Error("final elicitation can only close once");
    const recorded = new Set(this.#records.map(record => record.agentId));
    const missing = this.#expectedAgentIds.filter(agentId => !recorded.has(agentId));
    if (missing.length > 0) {
      throw new Error(`final elicitation cannot close without terminal records for: ${missing.join(",")}`);
    }
    requireTimestamp(closedAt, "finalOutcome.elicitationClosed.closedAt");
    for (const record of this.#records) {
      requireNotBefore(closedAt, record.recordedAt, "finalOutcome.elicitationClosed.closedAt", `record ${record.id}`);
    }
    this.#elicitationClosed = { sequence: this.#records.length + 1, closedAt };
    this.#state = "elicitation_closed";
  }

  resolveClaims(resolve: FinalOutcomeResolutionFunction, recordedAt: string): void {
    if (this.#state !== "elicitation_closed" || !this.#elicitationClosed) {
      throw new Error("claims can only resolve after final elicitation closes");
    }
    requireTimestamp(recordedAt, "finalOutcome.resolutionsRecorded.recordedAt");
    requireNotBefore(recordedAt, this.#elicitationClosed.closedAt, "finalOutcome.resolutionsRecorded.recordedAt", "elicitationClosed.closedAt");
    const resolutions = this.#claims.map(claim => {
      const resolution = resolve(structuredClone(claim), structuredClone(this.#scoringTask), recordedAt);
      if (resolution.claimId !== claim.id
        || resolution.resolverId !== claim.resolutionPolicy.resolverId
        || resolution.resolvedAt !== recordedAt) {
        throw new Error(`resolution metadata does not match final claim ${claim.id}`);
      }
      this.#contractRegistry.get(claim.resolutionPolicy.kind).validateResolution(claim, resolution);
      return structuredClone(resolution);
    });
    if (new Set(resolutions.map(resolution => resolution.claimId)).size !== this.#claims.length) {
      throw new Error("final outcome resolutions must be unique");
    }
    this.#resolutions = resolutions.sort((left, right) => left.claimId.localeCompare(right.claimId));
    this.#resolutionsRecorded = { sequence: this.#elicitationClosed.sequence + 1, recordedAt };
    this.#state = "resolved";
  }

  score(completedAt: string): FinalOutcomeArtifactV1 {
    if (this.#state !== "resolved" || !this.#resolutionsRecorded) {
      throw new Error("final outcome can only score after claim resolution");
    }
    requireTimestamp(completedAt, "finalOutcome.scoringCompleted.completedAt");
    requireNotBefore(completedAt, this.#resolutionsRecorded.recordedAt, "finalOutcome.scoringCompleted.completedAt", "resolutionsRecorded.recordedAt");
    this.#claimOutcomes = computeClaimOutcomes({
      claims: this.#claims,
      expectedAgentIds: this.#expectedAgentIds,
      records: this.#records,
      resolutions: this.#resolutions,
      finalRound: this.#totalRounds + 1,
      contractRegistry: this.#contractRegistry,
    });
    this.#scoringCompleted = { sequence: this.#resolutionsRecorded.sequence + 1, completedAt };
    this.#state = "scored";
    return this.toArtifact();
  }

  toArtifact(): FinalOutcomeArtifactV1 {
    if (this.#state !== "scored" || !this.#elicitationClosed
      || !this.#resolutionsRecorded || !this.#scoringCompleted) {
      throw new Error("final outcome artifact is unavailable before scoring completes");
    }
    return structuredClone({
      artifactSchemaRef: FINAL_OUTCOME_ARTIFACT_V1,
      runId: this.#runId,
      taskId: this.#taskId,
      contract: this.#contract,
      claims: this.#claims,
      expectedAgentIds: this.#expectedAgentIds,
      status: "scored",
      discussionCompleted: {
        sequence: 0,
        completedAt: this.#discussionCompletedAt,
        totalRounds: this.#totalRounds,
      },
      elicitationRecords: this.#records,
      elicitationClosed: this.#elicitationClosed,
      resolutionsRecorded: this.#resolutionsRecorded,
      scoringCompleted: this.#scoringCompleted,
      resolutions: this.#resolutions,
      claimOutcomes: this.#claimOutcomes,
    });
  }

  #assertNewAgent(agentId: string): void {
    requireNonEmpty(agentId, "finalElicitationRecord.agentId");
    if (!this.#expectedAgentIds.includes(agentId)) throw new Error(`Unexpected final elicitation agent ${agentId}`);
    if (this.#records.some(record => record.agentId === agentId)) {
      throw new Error(`Agent ${agentId} already has a terminal final elicitation record`);
    }
    const expectedNext = this.#expectedAgentIds[this.#records.length];
    if (agentId !== expectedNext) {
      throw new Error(`Final elicitation agent order is precommitted; expected ${expectedNext}, received ${agentId}`);
    }
  }
}

/** Structural and decision replay for a completed final-outcome artifact. */
export function validateFinalOutcomeArtifact(
  artifact: FinalOutcomeArtifactV1,
  contractRegistry: BeliefContractRegistry = defaultBeliefContractRegistry,
): void {
  if (artifact === null || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new Error("FinalOutcomeArtifactV1 must be an object");
  }
  if (!refsEqual(artifact.artifactSchemaRef, FINAL_OUTCOME_ARTIFACT_V1)) {
    throw new Error(`final outcome artifact must use ${FINAL_OUTCOME_ARTIFACT_V1.id}@${FINAL_OUTCOME_ARTIFACT_V1.version}`);
  }
  requireNonEmpty(artifact.runId, "finalOutcome.runId");
  requireNonEmpty(artifact.taskId, "finalOutcome.taskId");
  if (artifact.status !== "scored") throw new Error("final outcome artifact must be scored");
  validateFinalElicitationContract(artifact.contract);
  const expectedAgentIds = uniqueNonEmpty(artifact.expectedAgentIds, "finalOutcome.expectedAgentIds", false);
  const registry = contractRegistry.snapshot().seal();
  if (!Array.isArray(artifact.claims) || artifact.claims.length === 0) {
    throw new Error("finalOutcome.claims must be non-empty");
  }
  const claims = [...artifact.claims].sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(claims.map(claim => claim.id)).size !== claims.length
    || stableJson(claims.map(claim => claim.id)) !== stableJson(artifact.contract.claimIds)
    || stableJson(claims) !== stableJson(artifact.claims)) {
    throw new Error("finalOutcome.claims must uniquely and canonically match contract.claimIds");
  }
  for (const claim of claims) {
    validateEpistemicClaim(claim, registry);
    requireTimestamp(claim.createdAt, `final outcome claim ${claim.id}.createdAt`);
  }
  if (artifact.discussionCompleted.sequence !== 0
    || !Number.isSafeInteger(artifact.discussionCompleted.totalRounds)
    || artifact.discussionCompleted.totalRounds < 0) {
    throw new Error("finalOutcome.discussionCompleted is malformed");
  }
  requireTimestamp(artifact.discussionCompleted.completedAt, "finalOutcome.discussionCompleted.completedAt");
  if (!Array.isArray(artifact.elicitationRecords)
    || artifact.elicitationRecords.length !== expectedAgentIds.length) {
    throw new Error("finalOutcome requires exactly one terminal record per expected agent");
  }
  const recordAgents = new Set<string>();
  for (let index = 0; index < artifact.elicitationRecords.length; index++) {
    const record = artifact.elicitationRecords[index];
    requireNonEmpty(record.id, "finalElicitationRecord.id");
    requireNonEmpty(record.agentId, "finalElicitationRecord.agentId");
    if (!expectedAgentIds.includes(record.agentId) || recordAgents.has(record.agentId)) {
      throw new Error("final outcome records must identify each expected agent exactly once");
    }
    recordAgents.add(record.agentId);
    if (record.agentId !== expectedAgentIds[index]
      || record.id !== `final-response:${artifact.runId}:${record.agentId}`
      || record.sequence !== index + 1) {
      throw new Error("final outcome record identity/sequence does not match the precommitted agent order");
    }
    requireTimestamp(record.recordedAt, "finalElicitationRecord.recordedAt");
    requireNotBefore(record.recordedAt, artifact.discussionCompleted.completedAt, "finalElicitationRecord.recordedAt", "discussionCompleted.completedAt");
    if (!["answered", "abstained", "invalid", "unavailable"].includes(record.status)) {
      throw new Error("final elicitation record has an invalid terminal status");
    }
    if (record.status === "answered") {
      if (record.diagnosticCode !== "none" || record.parseMode === "none"
        || record.missingClaimIds.length !== 0
        || record.reports.length !== artifact.contract.claimIds.length) {
        throw new Error("answered final elicitation records must contain every claim and no missingness");
      }
      const reportClaims = record.reports.map(report => report.claimId).sort();
      if (stableJson(reportClaims) !== stableJson(artifact.contract.claimIds)) {
        throw new Error("answered final elicitation record does not match contract claims");
      }
      for (const report of record.reports) {
        const claim = claims.find(candidate => candidate.id === report.claimId)!;
        if (report.id !== `final-report:${artifact.runId}:${record.agentId}:${report.claimId}`
          || report.agentId !== record.agentId) {
          throw new Error("final elicited report identity is not canonical");
        }
        registry.get(claim.resolutionPolicy.kind).validateValue(claim, report.value);
      }
    } else if (record.reports.length !== 0
      || stableJson([...record.missingClaimIds].sort()) !== stableJson(artifact.contract.claimIds)) {
      throw new Error("non-answered final elicitation records must explicitly mark every claim missing");
    }
    if (record.status === "unavailable") {
      if (record.parseMode !== "none"
        || !["provider_error", "timeout", "adapter_unavailable"].includes(record.diagnosticCode)
        || record.rawResponse !== undefined) {
        throw new Error("unavailable final elicitation records must carry only an adapter/provider diagnostic");
      }
    } else {
      if (typeof record.rawResponse !== "string") {
        throw new Error("model-produced final elicitation records must preserve rawResponse");
      }
      const reparsed = parseFinalElicitationResponse({
        rawResponse: record.rawResponse,
        contract: artifact.contract,
        claims,
        contractRegistry: registry,
      });
      const expectedReports: FinalElicitedReport[] = reparsed.status === "answered"
        ? reparsed.reports.map(report => ({
            id: `final-report:${artifact.runId}:${record.agentId}:${report.claimId}`,
            claimId: report.claimId,
            agentId: record.agentId,
            value: report.value,
          }))
        : [];
      if (record.status !== reparsed.status
        || record.parseMode !== reparsed.parseMode
        || record.diagnosticCode !== reparsed.diagnosticCode
        || stableJson(record.missingClaimIds) !== stableJson(reparsed.missingClaimIds)
        || stableJson(record.reports) !== stableJson(expectedReports)) {
        throw new Error("final elicitation record does not replay from its rawResponse");
      }
    }
  }
  requireTimestamp(artifact.elicitationClosed.closedAt, "finalOutcome.elicitationClosed.closedAt");
  if (artifact.elicitationClosed.sequence !== artifact.elicitationRecords.length + 1) {
    throw new Error("final outcome elicitation-close sequence is invalid");
  }
  for (const record of artifact.elicitationRecords) {
    requireNotBefore(artifact.elicitationClosed.closedAt, record.recordedAt, "finalOutcome.elicitationClosed.closedAt", `record ${record.id}`);
  }
  requireTimestamp(artifact.resolutionsRecorded.recordedAt, "finalOutcome.resolutionsRecorded.recordedAt");
  if (artifact.resolutionsRecorded.sequence !== artifact.elicitationClosed.sequence + 1) {
    throw new Error("final outcome resolution sequence is invalid");
  }
  requireNotBefore(artifact.resolutionsRecorded.recordedAt, artifact.elicitationClosed.closedAt, "finalOutcome.resolutionsRecorded.recordedAt", "elicitationClosed.closedAt");
  requireTimestamp(artifact.scoringCompleted.completedAt, "finalOutcome.scoringCompleted.completedAt");
  if (artifact.scoringCompleted.sequence !== artifact.resolutionsRecorded.sequence + 1) {
    throw new Error("final outcome scoring sequence is invalid");
  }
  requireNotBefore(artifact.scoringCompleted.completedAt, artifact.resolutionsRecorded.recordedAt, "finalOutcome.scoringCompleted.completedAt", "resolutionsRecorded.recordedAt");
  if (!Array.isArray(artifact.resolutions) || artifact.resolutions.length !== claims.length) {
    throw new Error("finalOutcome.resolutions must cover every claim exactly once");
  }
  const resolutions = [...artifact.resolutions].sort((left, right) => left.claimId.localeCompare(right.claimId));
  if (stableJson(resolutions) !== stableJson(artifact.resolutions)) {
    throw new Error("finalOutcome.resolutions must be in canonical claim order");
  }
  for (const claim of claims) {
    const resolution = resolutions.find(candidate => candidate.claimId === claim.id);
    if (!resolution || resolution.resolverId !== claim.resolutionPolicy.resolverId
      || resolution.resolvedAt !== artifact.resolutionsRecorded.recordedAt) {
      throw new Error(`final outcome resolution metadata is invalid for claim ${claim.id}`);
    }
    registry.get(claim.resolutionPolicy.kind).validateResolution(claim, resolution);
  }
  const recomputed = computeClaimOutcomes({
    claims,
    expectedAgentIds,
    records: artifact.elicitationRecords,
    resolutions,
    finalRound: artifact.discussionCompleted.totalRounds + 1,
    contractRegistry: registry,
  });
  if (stableJson(recomputed) !== stableJson(artifact.claimOutcomes)) {
    throw new Error("final outcome claim scores do not replay from elicitation records and resolutions");
  }
}
