/**
 * Measurement Validity Development Pilot v1 — task bank.
 *
 * Frozen candidate order, K=3 only, base/variant payload separation, and an
 * authority-side truth metadata boundary. This module:
 *   - never lets resolution / ground-truth / correct_answer / reviewer verdict
 *     reach a provider projection;
 *   - generates paraphrase / option-permutation / evidence variants as
 *     REVIEWER-GATED candidates (semanticReview stays `not_reviewed` until the
 *     owner explicitly accepts);
 *   - derives syntactic leakage groups from the pinned catalog (semantic
 *     review may merge them later, never split a distinct group into fake N).
 *
 * No provider call, no credential read, no self-issued accepted review.
 */

import { createHash } from "node:crypto";
import type { VersionedGovernanceRef } from "../../../src/lib/governance";
import type {
  MeasurementCondition,
  MeasurementRegisteredCellV1,
  MeasurementSemanticReviewV1,
  MeasurementVariantV1,
} from "./measurementValidity";
import {
  createHiddenBenchTaskProjectionV1,
  listHiddenBenchTaskCatalogV1,
  HIDDENBENCH_PINNED_DATA_TASK_ADAPTER_V1,
  type HiddenBenchTaskProjectionV1,
} from "../v6/hiddenBenchTaskAdapter";
import { computeV6TaskDefinitionHashV1, type V6TaskAuthorityV1 } from "../v6/v6TaskManifest";
import type { V6CategoricalTaskV1 } from "../v6/productionVerticalSlice";

/** Frozen K=3 candidate priority order (plan §2.3). */
export const MEASUREMENT_PILOT_CANDIDATE_ORDER_V1: readonly number[] = [
  1, 9, 10, 11, 12, 15, 16, 18, 21, 13,
  31, 5, 7, 8, 14, 30, 57, 59, 60, 61,
  62, 64, 65,
];

export const MEASUREMENT_PILOT_REQUIRED_CLUSTERS_V1 = 20;
export const MEASUREMENT_PILOT_PROFILE_V1 = "hiddenbench-k3-development" as const;
export const MEASUREMENT_PILOT_REVIEW_PROTOCOL_REF_V1: VersionedGovernanceRef = Object.freeze({
  id: "swarmalpha.review.measurement-pilot-semantic",
  version: "1.0.0",
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function canonicalize(value: unknown, field = "value", ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${field} must contain only finite numbers`);
    return value;
  }
  if (typeof value !== "object") throw new Error(`${field} must contain only JSON data`);
  if (ancestors.has(value)) throw new Error(`${field} must not contain cycles`);
  const next = new Set(ancestors);
  next.add(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new Error(`${field} must not be sparse`);
    return value.map((entry, index) => canonicalize(entry, `${field}[${index}]`, next));
  }
  if (!isPlainObject(value)) throw new Error(`${field} must contain only plain objects`);
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key], `${field}.${key}`, next)]));
}
function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
function hashCanonical(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value), "utf8").digest("hex")}`;
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function notReviewed(): MeasurementSemanticReviewV1 {
  return { status: "not_reviewed" };
}

// ---------------------------------------------------------------------------
// Authority-side truth metadata (NEVER projected into a provider request)
// ---------------------------------------------------------------------------

export interface MeasurementPilotTruthMetadataV1 {
  clusterId: string;
  sourceTaskId: number;
  /** Canonical option that the authorized resolution opens to. */
  correctOption: string;
  /** Study E: whether the designated evidence target equals the resolution. */
  designatedTargetIsResolution: boolean;
}

export interface MeasurementPilotEvidenceCandidateV1 {
  variantId: string;
  level: "weak" | "medium" | "strong" | "counter";
  /** Payload text shown to the model. Must never state correctness meta-labels. */
  payload: string;
  /** Authority side only: this variant's ordinal level (counter = direction flip). */
  ordinal?: number;
}

export interface MeasurementPilotClusterCandidatesV1 {
  clusterId: string;
  sourceTaskId: number;
  syntacticLeakageGroupId: string;
  baseTaskId: string;
  baseTaskDefinitionHash: string;
  baseOptions: string[];
  baseAgentCount: number;
  basePublicContext: string;
  truth: MeasurementPilotTruthMetadataV1;
  paraphraseCandidate?: { variantId: string; paraphrasedPublicContext: string; paraphrasedPrivateInfo: string[] };
  permutationCandidate?: { variantId: string; optionMap: Record<string, string>; permutedOptions: string[] };
  evidenceCandidates: MeasurementPilotEvidenceCandidateV1[];
}

// ---------------------------------------------------------------------------
// Deterministic variant content generation (reviewer-gated candidates)
// ---------------------------------------------------------------------------

function permutationMap(options: string[], shift: number): { optionMap: Record<string, string>; permutedOptions: string[] } {
  const n = options.length;
  const permuted = options.map((_, index) => options[(index + shift) % n]);
  const optionMap: Record<string, string> = {};
  options.forEach((option, index) => { optionMap[permuted[index]] = option; });
  return { optionMap, permutedOptions: permuted };
}

function deterministicParaphrase(publicContext: string, privateInfo: string[]): { paraphrasedPublicContext: string; paraphrasedPrivateInfo: string[] } {
  // Deterministic, semantically neutral surface rephrasings (reviewer must
  // confirm preservation). Sentence-order rotation + connective rewording.
  const sentences = publicContext.split(/(?<=\.)\s+/).filter(Boolean);
  const rotated = sentences.length > 1 ? [...sentences.slice(1), sentences[0]] : sentences;
  const lead = "Carefully consider the following scenario description, then answer the question that follows.\n\n";
  return {
    paraphrasedPublicContext: lead + rotated.join(" "),
    paraphrasedPrivateInfo: privateInfo.map((info, index) => `Private note ${index + 1}: ${info.trim().replace(/\.$/, "")}.`),
  };
}

function evidencePayloadFor(task: HiddenBenchTaskProjectionV1, level: "weak" | "medium" | "strong" | "counter", designatedTarget: string): string {
  // Deterministic evidence payloads built from the task's own SHARED facts only.
  // weak = one ambiguous shared fact; medium = the most task-relevant shared
  // fact; strong = several corroborating shared facts; counter = a fact that
  // opposes the designated target. The reviewer must verify the ordering and
  // that no meta-language ("correct", "ground truth", "resolution") is emitted.
  const shared = task.adapter.task.publicContext;
  const sentences = shared.split(/(?<=\.)\s+/).filter(Boolean);
  const pick = (indexes: number[]) => indexes.filter(i => i < sentences.length).map(i => sentences[i]).join(" ");
  const target = designatedTarget;
  if (level === "weak") return `Consider the following observation: ${pick([1]) || pick([0])} This observation may or may not relate to "${target}".`;
  if (level === "medium") return `Observation: ${pick([2]) || pick([1])} This observation is most consistent with "${target}" among the options.`;
  if (level === "strong") return `Observations: ${pick([1, 2, 3]) || pick([0, 1])} Together these observations jointly support "${target}".`;
  // counter: pick a fact that points away from the target
  return `Observation: ${pick([0]) || pick([1])} This observation is inconsistent with "${target}".`;
}

function clusterCandidates(projection: HiddenBenchTaskProjectionV1, candidateIndex: number): MeasurementPilotClusterCandidatesV1 {
  const task = projection.adapter.task;
  const options = task.claim.options;
  const truth: MeasurementPilotTruthMetadataV1 = {
    clusterId: `cluster:pilot:${candidateIndex + 1}`,
    sourceTaskId: projection.sourceRef.sourceTaskId,
    correctOption: task.outcome,
    designatedTargetIsResolution: (candidateIndex % 2) === 0,
  };
  const paraphrase = deterministicParaphrase(task.publicContext, task.agents.map(agent => agent.privateInformation));
  const perm = permutationMap(options, 1);
  const designatedTarget = truth.designatedTargetIsResolution
    ? truth.correctOption
    : options.find(option => option !== truth.correctOption) ?? truth.correctOption;
  return deepFreeze({
    clusterId: truth.clusterId,
    sourceTaskId: projection.sourceRef.sourceTaskId,
    syntacticLeakageGroupId: projection.syntacticLeakageGroupId,
    baseTaskId: task.id,
    baseTaskDefinitionHash: computeV6TaskDefinitionHashV1(task, projection.adapter as unknown as V6TaskAuthorityV1),
    baseOptions: structuredClone(options),
    baseAgentCount: task.agents.length,
    basePublicContext: task.publicContext,
    truth,
    paraphraseCandidate: { variantId: `variant:paraphrase:${truth.clusterId}`, ...paraphrase },
    permutationCandidate: { variantId: `variant:permutation:${truth.clusterId}`, ...perm },
    evidenceCandidates: [
      { variantId: `variant:strength:weak:${truth.clusterId}`, level: "weak", payload: evidencePayloadFor(projection, "weak", designatedTarget), ordinal: 1 },
      { variantId: `variant:strength:medium:${truth.clusterId}`, level: "medium", payload: evidencePayloadFor(projection, "medium", designatedTarget), ordinal: 2 },
      { variantId: `variant:strength:strong:${truth.clusterId}`, level: "strong", payload: evidencePayloadFor(projection, "strong", designatedTarget), ordinal: 3 },
      { variantId: `variant:direction:counter:${truth.clusterId}`, level: "counter", payload: evidencePayloadFor(projection, "counter", designatedTarget) },
    ],
  });
}

// ---------------------------------------------------------------------------
// Task bank
// ---------------------------------------------------------------------------

export interface MeasurementPilotTaskBankV1 {
  profile: typeof MEASUREMENT_PILOT_PROFILE_V1;
  candidateOrder: readonly number[];
  clusters: readonly MeasurementPilotClusterCandidatesV1[];
  clusterCount: number;
  insufficientClusterSupport: boolean;
  contentHash: string;
}

export function createMeasurementPilotTaskBankV1(): MeasurementPilotTaskBankV1 {
  const catalog = listHiddenBenchTaskCatalogV1();
  const byId = new Map(catalog.map(entry => [entry.sourceTaskId, entry]));
  const clusters: MeasurementPilotClusterCandidatesV1[] = [];
  for (const sourceTaskId of MEASUREMENT_PILOT_CANDIDATE_ORDER_V1) {
    if (clusters.length >= MEASUREMENT_PILOT_REQUIRED_CLUSTERS_V1) break;
    const entry = byId.get(sourceTaskId);
    if (!entry) continue;
    if (entry.optionCount !== 3) continue;
    const projection = createHiddenBenchTaskProjectionV1({ sourceTaskId });
    clusters.push(clusterCandidates(projection, clusters.length));
  }
  const body = {
    profile: MEASUREMENT_PILOT_PROFILE_V1,
    candidateOrder: [...MEASUREMENT_PILOT_CANDIDATE_ORDER_V1],
    clusters,
    clusterCount: clusters.length,
    insufficientClusterSupport: clusters.length < MEASUREMENT_PILOT_REQUIRED_CLUSTERS_V1,
  };
  return deepFreeze({ ...body, contentHash: hashCanonical(body) });
}

// ---------------------------------------------------------------------------
// Provider projection (truth-free) + variant task builders
// ---------------------------------------------------------------------------

export interface MeasurementPilotProviderProjectionV1 {
  clusterId: string;
  sourceTaskId: number;
  variantId: string;
  condition: MeasurementCondition;
  task: V6CategoricalTaskV1;
  taskDefinitionHash: string;
}

function authorityFor(projection: HiddenBenchTaskProjectionV1): V6TaskAuthorityV1 {
  return {
    adapterRef: structuredClone(projection.adapter.adapterRef),
    taskSchemaRef: structuredClone(projection.adapter.taskSchemaRef),
    resolution: structuredClone(projection.adapter.resolution),
  };
}

function taskWith(base: V6CategoricalTaskV1, overrides: Partial<V6CategoricalTaskV1>): V6CategoricalTaskV1 {
  return { ...structuredClone(base), ...structuredClone(overrides) };
}

/**
 * Build the truth-free provider projection for one variant of one cluster.
 * Resolution / correct_answer / reviewer verdict are never fields here; the
 * claim.resolutionPolicy.resolverId is the only resolution-related identity and
 * the resolver opens only after elicitation closes (existing V6 authority).
 */
export function projectMeasurementPilotVariantV1(input: {
  bank: MeasurementPilotTaskBankV1;
  clusterId: string;
  variantId: string;
}): MeasurementPilotProviderProjectionV1 {
  const cluster = input.bank.clusters.find(candidate => candidate.clusterId === input.clusterId);
  if (!cluster) throw new Error(`measurement pilot cluster not in the frozen bank: ${input.clusterId}`);
  const projection = createHiddenBenchTaskProjectionV1({ sourceTaskId: cluster.sourceTaskId });
  const baseTask = projection.adapter.task;
  const baseAuthority = authorityFor(projection);

  let task: V6CategoricalTaskV1;
  let condition: MeasurementCondition;
  let taskDefinitionHash: string;

  if (input.variantId === `variant:paraphrase:${input.clusterId}` || input.variantId.startsWith("variant:paraphrase:")) {
    const para = cluster.paraphraseCandidate;
    if (!para) throw new Error(`measurement pilot paraphrase candidate missing for ${input.clusterId}`);
    task = taskWith(baseTask, {
      id: `${baseTask.id}:paraphrase:${input.clusterId}`,
      publicContext: para.paraphrasedPublicContext,
      agents: baseTask.agents.map((agent, index) => ({ ...agent, privateInformation: para.paraphrasedPrivateInfo[index] })),
    });
    condition = "semantic_paraphrase";
  } else if (input.variantId === `variant:permutation:${input.clusterId}` || input.variantId.startsWith("variant:permutation:")) {
    const perm = cluster.permutationCandidate;
    if (!perm) throw new Error(`measurement pilot permutation candidate missing for ${input.clusterId}`);
    task = taskWith(baseTask, {
      id: `${baseTask.id}:permutation:${input.clusterId}`,
      claim: { ...structuredClone(baseTask.claim), options: structuredClone(perm.permutedOptions) },
      outcome: perm.optionMap[baseTask.outcome] ?? baseTask.outcome,
    });
    condition = "option_permutation";
  } else if (input.variantId.startsWith("variant:strength:") || input.variantId.startsWith("variant:direction:")) {
    const evidence = cluster.evidenceCandidates.find(candidate => candidate.variantId === input.variantId);
    if (!evidence) throw new Error(`measurement pilot evidence candidate missing for ${input.variantId}`);
    task = taskWith(baseTask, {
      id: `${baseTask.id}:${evidence.level}:${input.clusterId}`,
      publicContext: `${baseTask.publicContext}\n\nAdditional evidence:\n${evidence.payload}`,
    });
    condition = evidence.level === "counter" ? "evidence_direction" : "evidence_strength";
  } else if (input.variantId.startsWith("variant:exact-repeat:") || input.variantId.startsWith("variant:repeat:")) {
    task = taskWith(baseTask, { id: `${baseTask.id}:exact-repeat:${input.clusterId}` });
    condition = "exact_repeat";
  } else {
    throw new Error(`measurement pilot variant not in the frozen bank: ${input.variantId}`);
  }

  taskDefinitionHash = computeV6TaskDefinitionHashV1(task, baseAuthority);
  return {
    clusterId: input.clusterId,
    sourceTaskId: cluster.sourceTaskId,
    variantId: input.variantId,
    condition,
    task,
    taskDefinitionHash,
  };
}

/** Admitted task-definition hashes: base + every variant the bank can project. */
export function measurementPilotAdmittedHashesV1(bank: MeasurementPilotTaskBankV1): string[] {
  const hashes = new Set<string>();
  for (const cluster of bank.clusters) {
    const projection = createHiddenBenchTaskProjectionV1({ sourceTaskId: cluster.sourceTaskId });
    hashes.add(computeV6TaskDefinitionHashV1(projection.adapter.task, authorityFor(projection)));
    const variantIds = [
      cluster.paraphraseCandidate?.variantId,
      cluster.permutationCandidate?.variantId,
      ...cluster.evidenceCandidates.map(candidate => candidate.variantId),
      `variant:exact-repeat:${cluster.clusterId}`,
    ].filter((value): value is string => typeof value === "string");
    for (const variantId of variantIds) {
      hashes.add(projectMeasurementPilotVariantV1({ bank, clusterId: cluster.clusterId, variantId }).taskDefinitionHash);
    }
  }
  return [...hashes].sort();
}

// Re-export identity for the CLI / tests without double-computing.
export function measurementPilotTaskBankContentHashV1(bank: MeasurementPilotTaskBankV1): string {
  return hashCanonical({
    profile: bank.profile,
    clusters: bank.clusters.map(cluster => ({
      clusterId: cluster.clusterId,
      sourceTaskId: cluster.sourceTaskId,
      baseTaskDefinitionHash: cluster.baseTaskDefinitionHash,
      syntacticLeakageGroupId: cluster.syntacticLeakageGroupId,
    })),
  });
}
