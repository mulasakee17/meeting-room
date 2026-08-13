/**
 * Measurement Validity v1 — experiment-level authority objects.
 *
 * Per MEASUREMENT_VALIDITY_PROTOCOL_V1 the v1 carrier decision is
 * `EXPERIMENT_LEVEL_AUTHORITY_REQUIRED`: raw schema-5 is NOT modified. A
 * pre-call `MeasurementValidityDesignV1` + `MeasurementValidityFreezeV1` pin
 * the design and registered cells; a post-call `MeasurementValidityResultIndexV1`
 * binds each cell to its actual runId / terminal status / source hashes.
 *
 * The result index provides in-repository no-replace integrity anchoring only;
 * it never claims external timestamps, signatures, tamper-proofing, or
 * real-world authenticity.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { governanceRefKey, validateGovernanceRef, type VersionedGovernanceRef } from "../../../src/lib/governance";

export const MEASUREMENT_VALIDITY_DESIGN_V1 = Object.freeze({ id: "swarmalpha.v6.measurement-design", version: "1.0.0" });
export const MEASUREMENT_VALIDITY_FREEZE_V1 = Object.freeze({ id: "swarmalpha.v6.measurement-freeze", version: "1.0.0" });
export const MEASUREMENT_VALIDITY_RESULT_INDEX_V1 = Object.freeze({ id: "swarmalpha.v6.measurement-result-index", version: "1.0.0" });

export type MeasurementInstrumentKind = "final_outcome" | "in_process_explicit";
export type MeasurementRole = "measurement_development" | "sealed_measurement_heldout";
export type MeasurementCondition =
  | "exact_repeat"
  | "semantic_paraphrase"
  | "option_permutation"
  | "evidence_strength"
  | "evidence_direction"
  | "information_add_remove";
export type MeasurementFailureStatus = "provider_error" | "timeout" | "unavailable";
export type MeasurementTerminalStatus = "valid" | "invalid_response" | MeasurementFailureStatus;

export type MeasurementSemanticReviewV1 =
  | { status: "not_reviewed" }
  | { status: "accepted"; reviewProtocolRef: VersionedGovernanceRef; reviewedAt: string };

export interface MeasurementEvidenceLevelV1 {
  level: number;
  designatedTarget: string;
  payloadHash: string;
  signedLogLikelihoodRatio?: number;
}
export interface MeasurementEvidenceLadderV1 {
  ladderId: string;
  levels: MeasurementEvidenceLevelV1[];
}
export interface MeasurementVariantV1 {
  variantId: string;
  baseSemanticTaskRef: VersionedGovernanceRef;
  variantTaskDefinitionHash: string;
  condition: MeasurementCondition;
  optionMap?: Record<string, string>;
  semanticReview?: MeasurementSemanticReviewV1;
  evidenceLadderId?: string;
}
export interface MeasurementRegisteredCellV1 {
  cellId: string;
  blockKey: string;
  variantId: string;
  replicateIndex: number;
  conditionAssignedAt: string;
}
export interface MeasurementBaseSemanticTaskV1 {
  sourceTaskRef: VersionedGovernanceRef;
  taskDefinitionHash: string;
  leakageGroupId: string;
  semanticReview: MeasurementSemanticReviewV1;
}

export interface MeasurementValidityDesignV1 {
  artifactSchemaRef: typeof MEASUREMENT_VALIDITY_DESIGN_V1;
  designRef: VersionedGovernanceRef;
  instrumentKind: MeasurementInstrumentKind;
  measurementRole: MeasurementRole;
  beliefKind: "binary" | "categorical";
  claimOptionCount: number;
  taskFamilyRef: VersionedGovernanceRef;
  modelRef: VersionedGovernanceRef;
  invocationConfigHash: string;
  promptRef: VersionedGovernanceRef;
  baseSemanticTasks: MeasurementBaseSemanticTaskV1[];
  variants: MeasurementVariantV1[];
  evidenceLadders: MeasurementEvidenceLadderV1[];
  registeredCells: MeasurementRegisteredCellV1[];
  clusterUnit: "leakage_group" | "base_task";
  bootstrapCount: number;
  bootstrapSeed: string;
  bootstrapVersion: string;
  missingnessPolicy: { policyRef: VersionedGovernanceRef; retryPolicy: "none" };
  baselineSelectionRule: string;
  firstProviderAtBoundary: string;
  createdAt: string;
  contentHash: string;
}

export interface MeasurementApplicableMetricsV1 {
  paraphrase: boolean;
  optionEquivariance: boolean;
  directionResponse: boolean;
  strengthResponse: boolean;
  predictiveIncrement: boolean;
}

export interface MeasurementValidityFreezeV1 {
  artifactSchemaRef: typeof MEASUREMENT_VALIDITY_FREEZE_V1;
  /** Unique freeze identity (distinct from the public schema ref). */
  freezeRef: VersionedGovernanceRef;
  designRef: VersionedGovernanceRef;
  designContentHash: string;
  instrumentKind: MeasurementInstrumentKind;
  measurementRole: MeasurementRole;
  beliefKind: "binary" | "categorical";
  claimOptionCount: number;
  taskBankRef: VersionedGovernanceRef;
  taskBankContentHash: string;
  registeredCells: MeasurementRegisteredCellV1[];
  registeredPairCount: number;
  bootstrap: { clusterUnit: "leakage_group" | "base_task"; count: number; seed: string; version: string };
  thresholds: MeasurementValidityGateThresholdsV1;
  applicableMetrics: MeasurementApplicableMetricsV1;
  baselineRef: VersionedGovernanceRef;
  createdAt: string;
  contentHash: string;
}

export interface MeasurementValidityGateThresholdsV1 {
  validCoverage: { overall: number; clusterLowerBound: number; stratum: number };
  pairCompleteness: { overall: number; terminalFailureStratum: number };
  paraphrase: { medianJsd: number; p90Jsd: number; argmaxAgreement: number };
  optionEquivariance: { medianTv: number; p90Tv: number; argmaxAgreement: number };
  directionResponse: { lowerBound: number; pairedMedian: number };
  strengthResponse: { directionLowerBound: number; violationRate: number };
  signalToNuisance: { point: number; lowerBound: number };
  predictiveIncrement: { upperBound: number };
  minIndependentClusters: number;
  bootstrapCount: number;
}

/** Discriminated union: source requirements depend on terminal status + instrument. */
export type MeasurementValidityResultCellV1 =
  | {
      cellId: string;
      status: "valid";
      instrumentKind: "final_outcome";
      runId: string;
      taskManifestHash: string;
      rawArtifactHash: string;
      finalOutcomeHash: string;
      firstProviderAt: string;
      terminalAt: string;
    }
  | {
      cellId: string;
      status: "valid";
      instrumentKind: "in_process_explicit";
      runId: string;
      taskManifestHash: string;
      rawArtifactHash: string;
      interactionTraceHash: string;
      firstProviderAt: string;
      terminalAt: string;
    }
  | {
      cellId: string;
      status: "invalid_response";
      runId: string;
      taskManifestHash: string;
      rawArtifactHash: string;
      firstProviderAt: string;
      terminalAt: string;
    }
  | {
      cellId: string;
      status: MeasurementFailureStatus;
      runId: string;
      /** Absent source hashes: no fabricated placeholders are allowed. */
      absentFields: string[];
      reason: string;
      firstProviderAt: string;
      terminalAt: string;
    };

export interface MeasurementValidityResultIndexV1 {
  artifactSchemaRef: typeof MEASUREMENT_VALIDITY_RESULT_INDEX_V1;
  /** Unique result-index identity (distinct from the public schema ref). */
  resultIndexRef: VersionedGovernanceRef;
  designRef: VersionedGovernanceRef;
  designContentHash: string;
  freezeRef: VersionedGovernanceRef;
  freezeContentHash: string;
  registeredCellCount: number;
  cells: MeasurementValidityResultCellV1[];
  sealedAt: string;
  contentHash: string;
}

export const MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1: MeasurementValidityGateThresholdsV1 = Object.freeze({
  validCoverage: { overall: 0.9, clusterLowerBound: 0.8, stratum: 0.8 },
  pairCompleteness: { overall: 0.8, terminalFailureStratum: 0.2 },
  paraphrase: { medianJsd: 0.05, p90Jsd: 0.15, argmaxAgreement: 0.85 },
  optionEquivariance: { medianTv: 0.05, p90Tv: 0.15, argmaxAgreement: 0.9 },
  directionResponse: { lowerBound: 0, pairedMedian: 0.1 },
  strengthResponse: { directionLowerBound: 0, violationRate: 0.2 },
  signalToNuisance: { point: 2.0, lowerBound: 1.0 },
  predictiveIncrement: { upperBound: 0 },
  minIndependentClusters: 20,
  bootstrapCount: 10_000,
});

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const TERMINAL_FAILURES: readonly MeasurementFailureStatus[] = ["provider_error", "timeout", "unavailable"];

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
function hashText(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
function requireExactKeys(value: unknown, expected: readonly string[], field: string): void {
  if (!isPlainObject(value)) throw new Error(`${field} must be a plain object`);
  if (stableJson(Object.keys(value).sort()) !== stableJson([...expected].sort())) {
    throw new Error(`${field} fields differ from the frozen schema`);
  }
}
function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be non-empty`);
}
function requireCanonicalTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) {
    throw new Error(`${field} must be a canonical ISO timestamp`);
  }
}
function requirePositiveSafeInt(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${field} must be a positive safe integer`);
}
function requireHash(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) throw new Error(`${field} must be canonical sha256`);
}

function reviewIsAccepted(review: unknown): review is { status: "accepted" } {
  return Boolean(review && typeof review === "object" && (review as { status?: string }).status === "accepted");
}
function validateSemanticReview(review: unknown, field: string): void {
  requireExactKeys(review, reviewIsAccepted(review) ? ["reviewProtocolRef", "reviewedAt", "status"] : ["status"], field);
  if (reviewIsAccepted(review)) {
    const accepted = review as unknown as { reviewProtocolRef: VersionedGovernanceRef; reviewedAt: string };
    validateGovernanceRef(accepted.reviewProtocolRef, `${field}.reviewProtocolRef`);
    requireCanonicalTimestamp(accepted.reviewedAt, `${field}.reviewedAt`);
  }
}
function levelHasLLR(level: unknown): level is { signedLogLikelihoodRatio?: number } {
  return Boolean(level && typeof level === "object" && "signedLogLikelihoodRatio" in (level as object));
}
function validateEvidenceLadder(ladder: unknown, field: string): void {
  requireExactKeys(ladder, ["ladderId", "levels"], field);
  const l = ladder as MeasurementEvidenceLadderV1;
  requireNonEmpty(l.ladderId, `${field}.ladderId`);
  if (!Array.isArray(l.levels) || l.levels.length < 3) throw new Error(`${field}.levels must have at least three ordinal levels`);
  const seenLevels = new Set<number>();
  const seenTargets = new Set<string>();
  for (const [index, level] of l.levels.entries()) {
    requireExactKeys(level, ["designatedTarget", "level", "payloadHash", ...(levelHasLLR(level) ? ["signedLogLikelihoodRatio"] : [])], `${field}.levels[${index}]`);
    if (!Number.isSafeInteger(level.level) || seenLevels.has(level.level)) throw new Error(`${field}.levels[${index}].level must be unique safe integers`);
    seenLevels.add(level.level);
    requireNonEmpty(level.designatedTarget, `${field}.levels[${index}].designatedTarget`);
    seenTargets.add(level.designatedTarget);
    requireHash(level.payloadHash, `${field}.levels[${index}].payloadHash`);
    if (level.signedLogLikelihoodRatio !== undefined && !Number.isFinite(level.signedLogLikelihoodRatio)) {
      throw new Error(`${field}.levels[${index}].signedLogLikelihoodRatio must be finite`);
    }
  }
  const sorted = [...seenLevels].sort((a, b) => a - b);
  if (l.levels.some(level => level.level !== sorted[l.levels.indexOf(level)])) throw new Error(`${field}.levels must be strictly ordered by level`);
  if (seenTargets.size !== 1) throw new Error(`${field} must designate a single consistent target outcome`);
}
function variantHasOptionMap(variant: unknown): variant is { optionMap?: unknown } {
  return Boolean(variant && typeof variant === "object" && "optionMap" in (variant as object));
}
function variantHasSemanticReview(variant: unknown): variant is { semanticReview?: unknown } {
  return Boolean(variant && typeof variant === "object" && "semanticReview" in (variant as object));
}
function variantHasEvidenceLadder(variant: unknown): variant is { evidenceLadderId?: unknown } {
  return Boolean(variant && typeof variant === "object" && "evidenceLadderId" in (variant as object));
}
function validateVariant(variant: unknown, field: string): void {
  requireExactKeys(variant, [
    "baseSemanticTaskRef", "condition", "variantId", "variantTaskDefinitionHash",
    ...(variantHasOptionMap(variant) ? ["optionMap"] : []),
    ...(variantHasSemanticReview(variant) ? ["semanticReview"] : []),
    ...(variantHasEvidenceLadder(variant) ? ["evidenceLadderId"] : []),
  ], field);
  const v = variant as MeasurementVariantV1;
  requireNonEmpty(v.variantId, `${field}.variantId`);
  validateGovernanceRef(v.baseSemanticTaskRef, `${field}.baseSemanticTaskRef`);
  if (!["exact_repeat", "semantic_paraphrase", "option_permutation", "evidence_strength", "evidence_direction", "information_add_remove"].includes(v.condition)) {
    throw new Error(`${field}.condition is invalid`);
  }
  requireHash(v.variantTaskDefinitionHash, `${field}.variantTaskDefinitionHash`);
  if ((v.condition === "semantic_paraphrase" || v.condition === "option_permutation") && v.semanticReview?.status !== "accepted") {
    throw new Error(`${field} requires accepted semantic review for ${v.condition}`);
  }
  if ((v.condition === "evidence_strength" || v.condition === "evidence_direction")
    && (!v.evidenceLadderId || v.evidenceLadderId.trim().length === 0)) {
    throw new Error(`${field} requires a frozen evidence ladder for ${v.condition}`);
  }
  if (v.condition === "option_permutation") {
    if (!v.optionMap || !isPlainObject(v.optionMap) || Object.keys(v.optionMap).length === 0) {
      throw new Error(`${field}.optionMap is required for option_permutation`);
    }
    const keys = Object.keys(v.optionMap);
    const values = Object.values(v.optionMap);
    if (new Set(keys).size !== keys.length || new Set(values).size !== values.length
      || JSON.stringify([...keys].sort()) !== JSON.stringify([...values].sort())) {
      throw new Error(`${field}.optionMap must be a bijection (injective, and key set equals value set)`);
    }
    for (const [key, mapped] of Object.entries(v.optionMap)) {
      requireNonEmpty(key, `${field}.optionMap key`);
      requireNonEmpty(mapped as string, `${field}.optionMap value`);
    }
  }
}
function validateRegisteredCell(cell: unknown, field: string): void {
  requireExactKeys(cell, ["blockKey", "cellId", "conditionAssignedAt", "replicateIndex", "variantId"], field);
  const c = cell as MeasurementRegisteredCellV1;
  requireNonEmpty(c.cellId, `${field}.cellId`);
  requireNonEmpty(c.blockKey, `${field}.blockKey`);
  requireNonEmpty(c.variantId, `${field}.variantId`);
  if (!Number.isSafeInteger(c.replicateIndex) || c.replicateIndex < 0) throw new Error(`${field}.replicateIndex must be a non-negative safe integer`);
  requireCanonicalTimestamp(c.conditionAssignedAt, `${field}.conditionAssignedAt`);
}

function designBody(d: MeasurementValidityDesignV1): Omit<MeasurementValidityDesignV1, "contentHash"> {
  const { contentHash: _c, ...body } = d;
  return body;
}
function freezeBody(f: MeasurementValidityFreezeV1): Omit<MeasurementValidityFreezeV1, "contentHash"> {
  const { contentHash: _c, ...body } = f;
  return body;
}
function resultIndexBody(i: MeasurementValidityResultIndexV1): Omit<MeasurementValidityResultIndexV1, "contentHash"> {
  const { contentHash: _c, ...body } = i;
  return body;
}

export function computeMeasurementValidityDesignHashV1(design: Omit<MeasurementValidityDesignV1, "contentHash">): string {
  return hashCanonical(design);
}
export function computeMeasurementValidityFreezeHashV1(freeze: Omit<MeasurementValidityFreezeV1, "contentHash">): string {
  return hashCanonical(freeze);
}
export function computeMeasurementValidityResultIndexHashV1(index: Omit<MeasurementValidityResultIndexV1, "contentHash">): string {
  return hashCanonical(index);
}

/** Derive the applicable-metric set from the design's variants and belief domain. */
export function deriveMeasurementApplicableMetricsV1(design: MeasurementValidityDesignV1): MeasurementApplicableMetricsV1 {
  const conditions = design.variants.map(variant => variant.condition);
  return {
    paraphrase: conditions.includes("semantic_paraphrase"),
    optionEquivariance: design.beliefKind === "categorical" && conditions.includes("option_permutation"),
    directionResponse: conditions.includes("evidence_direction"),
    strengthResponse: conditions.includes("evidence_strength"),
    predictiveIncrement: true,
  };
}

export function validateMeasurementValidityDesignV1(design: MeasurementValidityDesignV1): void {
  requireExactKeys(design, [
    "artifactSchemaRef", "baseSemanticTasks", "baselineSelectionRule", "beliefKind",
    "bootstrapCount", "bootstrapSeed", "bootstrapVersion", "claimOptionCount", "clusterUnit",
    "contentHash", "createdAt", "designRef", "evidenceLadders", "firstProviderAtBoundary",
    "instrumentKind", "invocationConfigHash", "measurementRole", "missingnessPolicy",
    "modelRef", "promptRef", "registeredCells", "taskFamilyRef", "variants",
  ], "measurementDesign");
  if (governanceRefKey(design.artifactSchemaRef) !== governanceRefKey(MEASUREMENT_VALIDITY_DESIGN_V1)) throw new Error("measurement design schema ref is invalid");
  validateGovernanceRef(design.designRef, "measurementDesign.designRef");
  validateGovernanceRef(design.taskFamilyRef, "measurementDesign.taskFamilyRef");
  validateGovernanceRef(design.modelRef, "measurementDesign.modelRef");
  validateGovernanceRef(design.promptRef, "measurementDesign.promptRef");
  if (!["final_outcome", "in_process_explicit"].includes(design.instrumentKind)) throw new Error("measurementDesign.instrumentKind is invalid");
  if (!["measurement_development", "sealed_measurement_heldout"].includes(design.measurementRole)) throw new Error("measurementDesign.measurementRole is invalid");
  if (!["binary", "categorical"].includes(design.beliefKind)) throw new Error("measurementDesign.beliefKind is invalid");
  requirePositiveSafeInt(design.claimOptionCount, "measurementDesign.claimOptionCount");
  if (design.beliefKind === "binary" && design.claimOptionCount !== 2) throw new Error("measurementDesign binary requires claimOptionCount 2");
  requireHash(design.invocationConfigHash, "measurementDesign.invocationConfigHash");
  requireCanonicalTimestamp(design.createdAt, "measurementDesign.createdAt");
  requireCanonicalTimestamp(design.firstProviderAtBoundary, "measurementDesign.firstProviderAtBoundary");
  if (!["leakage_group", "base_task"].includes(design.clusterUnit)) throw new Error("measurementDesign.clusterUnit is invalid");
  requirePositiveSafeInt(design.bootstrapCount, "measurementDesign.bootstrapCount");
  requireNonEmpty(design.bootstrapSeed, "measurementDesign.bootstrapSeed");
  requireNonEmpty(design.bootstrapVersion, "measurementDesign.bootstrapVersion");
  requireExactKeys(design.missingnessPolicy, ["policyRef", "retryPolicy"], "measurementDesign.missingnessPolicy");
  if (design.missingnessPolicy.retryPolicy !== "none") throw new Error("measurementDesign.missingnessPolicy.retryPolicy must be none");
  requireNonEmpty(design.baselineSelectionRule, "measurementDesign.baselineSelectionRule");

  if (!Array.isArray(design.baseSemanticTasks) || design.baseSemanticTasks.length === 0) throw new Error("measurementDesign requires at least one base semantic task");
  const taskHashes = new Set<string>();
  const leakageRoles = new Map<string, MeasurementRole>();
  for (const [index, task] of design.baseSemanticTasks.entries()) {
    requireExactKeys(task, ["leakageGroupId", "semanticReview", "sourceTaskRef", "taskDefinitionHash"], `measurementDesign.baseSemanticTasks[${index}]`);
    validateGovernanceRef(task.sourceTaskRef, `measurementDesign.baseSemanticTasks[${index}].sourceTaskRef`);
    requireHash(task.taskDefinitionHash, `measurementDesign.baseSemanticTasks[${index}].taskDefinitionHash`);
    requireNonEmpty(task.leakageGroupId, `measurementDesign.baseSemanticTasks[${index}].leakageGroupId`);
    if (task.semanticReview.status !== "accepted") throw new Error(`measurement source task ${task.sourceTaskRef.id} requires accepted semantic review`);
    if (taskHashes.has(task.taskDefinitionHash)) throw new Error("measurementDesign base task hashes must be unique");
    taskHashes.add(task.taskDefinitionHash);
    const existing = leakageRoles.get(task.leakageGroupId);
    if (existing !== undefined && existing !== design.measurementRole) throw new Error(`measurement leakage group ${task.leakageGroupId} crosses measurement roles`);
    leakageRoles.set(task.leakageGroupId, design.measurementRole);
  }

  if (!Array.isArray(design.variants) || design.variants.length === 0) throw new Error("measurementDesign requires at least one variant");
  const variantIds = new Set<string>();
  const baseTaskRefs = new Set(design.baseSemanticTasks.map(task => task.sourceTaskRef.id));
  for (const [index, variant] of design.variants.entries()) {
    validateVariant(variant, `measurementDesign.variants[${index}]`);
    if (variantIds.has(variant.variantId)) throw new Error("measurementDesign variant ids must be unique");
    variantIds.add(variant.variantId);
    if (!baseTaskRefs.has(variant.baseSemanticTaskRef.id)) throw new Error(`measurementDesign.variants[${index}].baseSemanticTaskRef must reference a registered base semantic task`);
  }

  for (const [index, ladder] of design.evidenceLadders.entries()) validateEvidenceLadder(ladder, `measurementDesign.evidenceLadders[${index}]`);
  const ladderIds = new Set(design.evidenceLadders.map(ladder => ladder.ladderId));
  for (const variant of design.variants) {
    if (variant.evidenceLadderId !== undefined && !ladderIds.has(variant.evidenceLadderId)) {
      throw new Error(`measurementDesign.variants[${variant.variantId}].evidenceLadderId must reference a registered ladder`);
    }
  }

  if (!Array.isArray(design.registeredCells) || design.registeredCells.length === 0) throw new Error("measurementDesign requires at least one registered cell");
  const cellIds = new Set<string>();
  const blockReplicateKeys = new Set<string>();
  for (const [index, cell] of design.registeredCells.entries()) {
    validateRegisteredCell(cell, `measurementDesign.registeredCells[${index}]`);
    if (cellIds.has(cell.cellId)) throw new Error("measurementDesign cell ids must be unique");
    cellIds.add(cell.cellId);
    const key = `${cell.blockKey}|${cell.replicateIndex}|${cell.variantId}`;
    if (blockReplicateKeys.has(key)) throw new Error("measurementDesign duplicate block/variant/replicate identity");
    blockReplicateKeys.add(key);
    if (!variantIds.has(cell.variantId)) throw new Error(`measurementDesign.registeredCells[${index}].variantId must reference a registered variant`);
    if (Date.parse(cell.conditionAssignedAt) >= Date.parse(design.firstProviderAtBoundary)) throw new Error("measurement condition assignment must precede the first provider call boundary");
  }
  if (design.contentHash !== computeMeasurementValidityDesignHashV1(designBody(design))) throw new Error("measurement design contentHash mismatch");
}

export function validateMeasurementValidityDesignAgainstAdmissionV1(design: MeasurementValidityDesignV1, admittedTaskDefinitionHashes: ReadonlyArray<string>): void {
  validateMeasurementValidityDesignV1(design);
  const admitted = new Set(admittedTaskDefinitionHashes);
  const referenced = new Set<string>([
    ...design.baseSemanticTasks.map(task => task.taskDefinitionHash),
    ...design.variants.map(variant => variant.variantTaskDefinitionHash),
  ]);
  for (const hash of referenced) {
    if (!admitted.has(hash)) throw new Error(`measurement design references taskDefinitionHash not admitted by the task bank: ${hash}`);
  }
}

export function validateMeasurementLeakageGroupIsolationV1(designs: ReadonlyArray<MeasurementValidityDesignV1>): void {
  const rolesByGroup = new Map<string, MeasurementRole>();
  for (const design of designs) {
    validateMeasurementValidityDesignV1(design);
    for (const task of design.baseSemanticTasks) {
      const existing = rolesByGroup.get(task.leakageGroupId);
      if (existing !== undefined && existing !== design.measurementRole) throw new Error(`measurement leakage group ${task.leakageGroupId} crosses measurement roles`);
      rolesByGroup.set(task.leakageGroupId, design.measurementRole);
    }
  }
}

function validateGateThresholds(thresholds: unknown): void {
  requireExactKeys(thresholds, [
    "bootstrapCount", "directionResponse", "minIndependentClusters", "optionEquivariance",
    "pairCompleteness", "paraphrase", "predictiveIncrement", "signalToNuisance",
    "strengthResponse", "validCoverage",
  ], "measurementFreeze.thresholds");
  if (JSON.stringify(thresholds) !== JSON.stringify(MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1)) {
    throw new Error("measurementFreeze.thresholds must equal the frozen v1 gate values");
  }
}

export function validateMeasurementValidityFreezeV1(freeze: MeasurementValidityFreezeV1): void {
  requireExactKeys(freeze, [
    "applicableMetrics", "artifactSchemaRef", "baselineRef", "beliefKind", "bootstrap", "claimOptionCount",
    "contentHash", "createdAt", "designContentHash", "designRef", "freezeRef", "instrumentKind",
    "measurementRole", "registeredCells", "registeredPairCount", "taskBankContentHash", "taskBankRef",
    "thresholds",
  ], "measurementFreeze");
  if (governanceRefKey(freeze.artifactSchemaRef) !== governanceRefKey(MEASUREMENT_VALIDITY_FREEZE_V1)) throw new Error("measurement freeze schema ref is invalid");
  validateGovernanceRef(freeze.freezeRef, "measurementFreeze.freezeRef");
  validateGovernanceRef(freeze.designRef, "measurementFreeze.designRef");
  validateGovernanceRef(freeze.taskBankRef, "measurementFreeze.taskBankRef");
  validateGovernanceRef(freeze.baselineRef, "measurementFreeze.baselineRef");
  requireHash(freeze.designContentHash, "measurementFreeze.designContentHash");
  requireHash(freeze.taskBankContentHash, "measurementFreeze.taskBankContentHash");
  requireCanonicalTimestamp(freeze.createdAt, "measurementFreeze.createdAt");
  if (!["final_outcome", "in_process_explicit"].includes(freeze.instrumentKind)) throw new Error("measurementFreeze.instrumentKind is invalid");
  if (!["measurement_development", "sealed_measurement_heldout"].includes(freeze.measurementRole)) throw new Error("measurementFreeze.measurementRole is invalid");
  if (!["binary", "categorical"].includes(freeze.beliefKind)) throw new Error("measurementFreeze.beliefKind is invalid");
  requirePositiveSafeInt(freeze.claimOptionCount, "measurementFreeze.claimOptionCount");
  requireExactKeys(freeze.bootstrap, ["clusterUnit", "count", "seed", "version"], "measurementFreeze.bootstrap");
  if (!["leakage_group", "base_task"].includes(freeze.bootstrap.clusterUnit)) throw new Error("measurementFreeze.bootstrap.clusterUnit is invalid");
  requirePositiveSafeInt(freeze.bootstrap.count, "measurementFreeze.bootstrap.count");
  requireNonEmpty(freeze.bootstrap.seed, "measurementFreeze.bootstrap.seed");
  requireNonEmpty(freeze.bootstrap.version, "measurementFreeze.bootstrap.version");
  if (freeze.bootstrap.count !== MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1.bootstrapCount) throw new Error("measurementFreeze bootstrap count must equal the frozen v1 gate");
  requireExactKeys(freeze.applicableMetrics, ["directionResponse", "optionEquivariance", "paraphrase", "predictiveIncrement", "strengthResponse"], "measurementFreeze.applicableMetrics");
  for (const value of Object.values(freeze.applicableMetrics)) {
    if (typeof value !== "boolean") throw new Error("measurementFreeze.applicableMetrics must be boolean");
  }
  if (!Array.isArray(freeze.registeredCells) || freeze.registeredCells.length === 0) throw new Error("measurementFreeze requires registered cells");
  const cellIds = new Set<string>();
  for (const [index, cell] of freeze.registeredCells.entries()) {
    validateRegisteredCell(cell, `measurementFreeze.registeredCells[${index}]`);
    if (cellIds.has(cell.cellId)) throw new Error("measurementFreeze cell ids must be unique");
    cellIds.add(cell.cellId);
  }
  requirePositiveSafeInt(freeze.registeredPairCount, "measurementFreeze.registeredPairCount");
  validateGateThresholds(freeze.thresholds);
  if (freeze.contentHash !== computeMeasurementValidityFreezeHashV1(freezeBody(freeze))) throw new Error("measurement freeze contentHash mismatch");
}

/** The freeze must be the pre-registered closure of the design it claims to freeze. */
export function validateFreezeAgainstDesignV1(freeze: MeasurementValidityFreezeV1, design: MeasurementValidityDesignV1): void {
  validateMeasurementValidityFreezeV1(freeze);
  validateMeasurementValidityDesignV1(design);
  if (governanceRefKey(freeze.designRef) !== governanceRefKey(design.designRef) || freeze.designContentHash !== design.contentHash) {
    throw new Error("measurement freeze does not bind the supplied design");
  }
  if (freeze.instrumentKind !== design.instrumentKind || freeze.measurementRole !== design.measurementRole
    || freeze.beliefKind !== design.beliefKind || freeze.claimOptionCount !== design.claimOptionCount) {
    throw new Error("measurement freeze identity differs from the design");
  }
  if (stableJson(freeze.registeredCells) !== stableJson(design.registeredCells)) {
    throw new Error("measurement freeze registered cells differ from the design");
  }
  if (freeze.bootstrap.clusterUnit !== design.clusterUnit || freeze.bootstrap.count !== design.bootstrapCount
    || freeze.bootstrap.seed !== design.bootstrapSeed || freeze.bootstrap.version !== design.bootstrapVersion) {
    throw new Error("measurement freeze bootstrap configuration differs from the design");
  }
  if (stableJson(freeze.applicableMetrics) !== stableJson(deriveMeasurementApplicableMetricsV1(design))) {
    throw new Error("measurement freeze applicable metrics differ from the design");
  }
  const designCreated = Date.parse(design.createdAt);
  for (const cell of design.registeredCells) {
    if (designCreated > Date.parse(cell.conditionAssignedAt)) throw new Error("measurement condition assignment must not precede the design");
  }
  for (const cell of design.registeredCells) {
    if (Date.parse(cell.conditionAssignedAt) >= Date.parse(freeze.createdAt)) {
      throw new Error("measurement condition assignment must precede the freeze");
    }
  }
  if (Date.parse(freeze.createdAt) >= Date.parse(design.firstProviderAtBoundary)) {
    throw new Error("measurement freeze must precede the first provider call boundary");
  }
}

/** Bind the freeze to the actually-validated task-bank authority. */
export function validateFreezeTaskBankBindingV1(freeze: MeasurementValidityFreezeV1, taskBankContentHash: string): void {
  validateMeasurementValidityFreezeV1(freeze);
  if (freeze.taskBankContentHash !== taskBankContentHash) {
    throw new Error("measurement freeze task-bank content hash differs from the validated task bank");
  }
}

export function validateMeasurementValidityResultIndexV1(index: MeasurementValidityResultIndexV1): void {
  requireExactKeys(index, [
    "artifactSchemaRef", "cells", "contentHash", "designContentHash", "designRef",
    "freezeContentHash", "freezeRef", "registeredCellCount", "resultIndexRef", "sealedAt",
  ], "measurementResultIndex");
  if (governanceRefKey(index.artifactSchemaRef) !== governanceRefKey(MEASUREMENT_VALIDITY_RESULT_INDEX_V1)) throw new Error("measurement result index schema ref is invalid");
  validateGovernanceRef(index.resultIndexRef, "measurementResultIndex.resultIndexRef");
  validateGovernanceRef(index.designRef, "measurementResultIndex.designRef");
  validateGovernanceRef(index.freezeRef, "measurementResultIndex.freezeRef");
  requireHash(index.designContentHash, "measurementResultIndex.designContentHash");
  requireHash(index.freezeContentHash, "measurementResultIndex.freezeContentHash");
  requireCanonicalTimestamp(index.sealedAt, "measurementResultIndex.sealedAt");
  if (!Array.isArray(index.cells) || index.cells.length !== index.registeredCellCount) throw new Error("measurementResultIndex cell count must equal registeredCellCount");
  const cellIds = new Set<string>();
  for (const [i, cell] of index.cells.entries()) {
    requireNonEmpty(cell.cellId, `measurementResultIndex.cells[${i}].cellId`);
    requireNonEmpty(cell.runId, `measurementResultIndex.cells[${i}].runId`);
    requireCanonicalTimestamp(cell.firstProviderAt, `measurementResultIndex.cells[${i}].firstProviderAt`);
    requireCanonicalTimestamp(cell.terminalAt, `measurementResultIndex.cells[${i}].terminalAt`);
    if (Date.parse(cell.terminalAt) < Date.parse(cell.firstProviderAt)) throw new Error(`measurementResultIndex.cells[${i}].terminalAt must not precede firstProviderAt`);
    if (cellIds.has(cell.cellId)) throw new Error("measurementResultIndex cell ids must be unique");
    cellIds.add(cell.cellId);
    // Status-specific source requirements (no fabricated placeholders).
    if (cell.status === "valid" && cell.instrumentKind === "final_outcome") {
      requireExactKeys(cell, ["cellId", "finalOutcomeHash", "firstProviderAt", "instrumentKind", "rawArtifactHash", "runId", "status", "taskManifestHash", "terminalAt"], `measurementResultIndex.cells[${i}]`);
      requireHash(cell.taskManifestHash, `measurementResultIndex.cells[${i}].taskManifestHash`);
      requireHash(cell.rawArtifactHash, `measurementResultIndex.cells[${i}].rawArtifactHash`);
      requireHash(cell.finalOutcomeHash, `measurementResultIndex.cells[${i}].finalOutcomeHash`);
    } else if (cell.status === "valid" && cell.instrumentKind === "in_process_explicit") {
      requireExactKeys(cell, ["cellId", "firstProviderAt", "instrumentKind", "interactionTraceHash", "rawArtifactHash", "runId", "status", "taskManifestHash", "terminalAt"], `measurementResultIndex.cells[${i}]`);
      requireHash(cell.taskManifestHash, `measurementResultIndex.cells[${i}].taskManifestHash`);
      requireHash(cell.rawArtifactHash, `measurementResultIndex.cells[${i}].rawArtifactHash`);
      requireHash(cell.interactionTraceHash, `measurementResultIndex.cells[${i}].interactionTraceHash`);
    } else if (cell.status === "invalid_response") {
      requireExactKeys(cell, ["cellId", "firstProviderAt", "rawArtifactHash", "runId", "status", "taskManifestHash", "terminalAt"], `measurementResultIndex.cells[${i}]`);
      requireHash(cell.taskManifestHash, `measurementResultIndex.cells[${i}].taskManifestHash`);
      requireHash(cell.rawArtifactHash, `measurementResultIndex.cells[${i}].rawArtifactHash`);
    } else {
      requireExactKeys(cell, ["absentFields", "cellId", "firstProviderAt", "reason", "runId", "status", "terminalAt"], `measurementResultIndex.cells[${i}]`);
      if (!TERMINAL_FAILURES.includes(cell.status as MeasurementFailureStatus)) throw new Error(`measurementResultIndex.cells[${i}].status is invalid`);
      if (!Array.isArray(cell.absentFields) || cell.absentFields.length === 0) throw new Error(`measurementResultIndex.cells[${i}].absentFields must be non-empty`);
      requireNonEmpty(cell.reason, `measurementResultIndex.cells[${i}].reason`);
    }
  }
  if (index.contentHash !== computeMeasurementValidityResultIndexHashV1(resultIndexBody(index))) throw new Error("measurement result index contentHash mismatch");
}

export function validateResultIndexAgainstFreezeV1(index: MeasurementValidityResultIndexV1, freeze: MeasurementValidityFreezeV1): void {
  validateMeasurementValidityResultIndexV1(index);
  validateMeasurementValidityFreezeV1(freeze);
  if (governanceRefKey(index.designRef) !== governanceRefKey(freeze.designRef) || index.designContentHash !== freeze.designContentHash) {
    throw new Error("measurement result index design binding differs from the freeze");
  }
  if (governanceRefKey(index.freezeRef) !== governanceRefKey(freeze.freezeRef) || index.freezeContentHash !== freeze.contentHash) {
    throw new Error("measurement result index freeze binding differs from the freeze");
  }
  const resultCells = new Set(index.cells.map(cell => cell.cellId));
  const registeredCells = new Set(freeze.registeredCells.map(cell => cell.cellId));
  if (resultCells.size !== registeredCells.size || [...resultCells].some(id => !registeredCells.has(id))) {
    throw new Error("measurement result index cell set differs from the freeze registered cells");
  }
  if (index.registeredCellCount !== freeze.registeredCells.length) throw new Error("measurement result index registeredCellCount differs from the freeze");
  const freezeAt = Date.parse(freeze.createdAt);
  for (const cell of index.cells) {
    // Provider calls must be strictly after the freeze; a call at the freeze
    // instant itself is indistinguishable from one that raced the seal.
    if (Date.parse(cell.firstProviderAt) <= freezeAt) throw new Error("measurement result index cell firstProviderAt must follow the freeze");
    if (Date.parse(cell.terminalAt) > Date.parse(index.sealedAt)) throw new Error("measurement result index cell terminalAt must not follow sealedAt");
  }
}

/** Real source cross-replay: recompute per-cell hashes and compare with the index. */
export function validateMeasurementValidityResultIndexAgainstSourcesV1(
  index: MeasurementValidityResultIndexV1,
  sources: ReadonlyArray<{
    cellId: string;
    hashes: { taskManifestHash?: string; rawArtifactHash?: string; finalOutcomeHash?: string; interactionTraceHash?: string };
  }>,
): void {
  validateMeasurementValidityResultIndexV1(index);
  const byCell = new Map(sources.map(source => [source.cellId, source.hashes]));
  for (const cell of index.cells) {
    const source = byCell.get(cell.cellId);
    if (!source) throw new Error(`measurement result index cell ${cell.cellId} has no source binding`);
    if (cell.status === "valid" && cell.instrumentKind === "final_outcome") {
      if (source.taskManifestHash !== cell.taskManifestHash || source.rawArtifactHash !== cell.rawArtifactHash
        || source.finalOutcomeHash !== cell.finalOutcomeHash) {
        throw new Error(`measurement result index cell ${cell.cellId} source hashes do not match the actual artifact`);
      }
    } else if (cell.status === "valid" && cell.instrumentKind === "in_process_explicit") {
      if (source.taskManifestHash !== cell.taskManifestHash || source.rawArtifactHash !== cell.rawArtifactHash
        || source.interactionTraceHash !== cell.interactionTraceHash) {
        throw new Error(`measurement result index cell ${cell.cellId} source hashes do not match the actual artifact`);
      }
    } else if (cell.status === "invalid_response") {
      if (source.taskManifestHash !== cell.taskManifestHash || source.rawArtifactHash !== cell.rawArtifactHash) {
        throw new Error(`measurement result index cell ${cell.cellId} source hashes do not match the actual artifact`);
      }
    } else {
      // Failure cells require no source hashes; the caller must not supply any.
      if (source.taskManifestHash !== undefined || source.rawArtifactHash !== undefined) {
        throw new Error(`measurement result index failure cell ${cell.cellId} must not carry fabricated source hashes`);
      }
    }
  }
}

export function createMeasurementValidityDesignV1(input: Omit<MeasurementValidityDesignV1, "artifactSchemaRef" | "contentHash">): Readonly<MeasurementValidityDesignV1> {
  const body = { ...input, artifactSchemaRef: MEASUREMENT_VALIDITY_DESIGN_V1 } as Omit<MeasurementValidityDesignV1, "contentHash">;
  const design = { ...body, contentHash: computeMeasurementValidityDesignHashV1(body) } as MeasurementValidityDesignV1;
  validateMeasurementValidityDesignV1(design);
  return deepFreeze(structuredClone(design));
}

export function createMeasurementValidityFreezeV1(input: Omit<MeasurementValidityFreezeV1, "artifactSchemaRef" | "contentHash">): Readonly<MeasurementValidityFreezeV1> {
  const body = { ...input, artifactSchemaRef: MEASUREMENT_VALIDITY_FREEZE_V1 } as Omit<MeasurementValidityFreezeV1, "contentHash">;
  const freeze = { ...body, contentHash: computeMeasurementValidityFreezeHashV1(body) } as MeasurementValidityFreezeV1;
  validateMeasurementValidityFreezeV1(freeze);
  return deepFreeze(structuredClone(freeze));
}

export function createMeasurementValidityResultIndexV1(input: Omit<MeasurementValidityResultIndexV1, "artifactSchemaRef" | "contentHash">): Readonly<MeasurementValidityResultIndexV1> {
  const body = { ...input, artifactSchemaRef: MEASUREMENT_VALIDITY_RESULT_INDEX_V1 } as Omit<MeasurementValidityResultIndexV1, "contentHash">;
  const index = { ...body, contentHash: computeMeasurementValidityResultIndexHashV1(body) } as MeasurementValidityResultIndexV1;
  validateMeasurementValidityResultIndexV1(index);
  return deepFreeze(structuredClone(index));
}

// ----------------------------------------------------------------------------
// No-replace stores bound to ref id+version+contentHash.
// ----------------------------------------------------------------------------

function safeStem(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, "_");
}
function refStem(ref: VersionedGovernanceRef, contentHash: string): string {
  const stem = `${safeStem(ref.id)}.${ref.version}.${contentHash.slice("sha256:".length, "sha256:".length + 12)}`;
  const suffix = createHash("sha256").update(`${governanceRefKey(ref)}|${contentHash}`, "utf8").digest("hex").slice(0, 12);
  return `${stem}.${suffix}`;
}

function resolvePath(outputDir: string, ref: VersionedGovernanceRef, contentHash: string, kind: string): string {
  return path.resolve(outputDir, `${refStem(ref, contentHash)}.${kind}.json`);
}

export function resolveMeasurementValidityDesignV1Path(outputDir: string, designRef: VersionedGovernanceRef, contentHash: string): string {
  return resolvePath(outputDir, designRef, contentHash, "measurement-design.v1");
}
export function resolveMeasurementValidityFreezeV1Path(outputDir: string, freezeRef: VersionedGovernanceRef, contentHash: string): string {
  return resolvePath(outputDir, freezeRef, contentHash, "measurement-freeze.v1");
}
export function resolveMeasurementValidityResultIndexV1Path(outputDir: string, resultIndexRef: VersionedGovernanceRef, contentHash: string): string {
  return resolvePath(outputDir, resultIndexRef, contentHash, "measurement-result-index.v1");
}

function readValidated<T>(file: string, validate: (value: unknown) => void, kind: string): T | null {
  if (!fs.existsSync(file)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${kind} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  validate(parsed);
  return structuredClone(parsed) as T;
}

interface StoreInput<T> {
  outputDir: string;
  ref: VersionedGovernanceRef;
  contentHash: string;
  /** Human-readable label used in error messages. */
  kind: string;
  /** Filename suffix; must match the public resolve*Path resolver for the same kind. */
  pathKind: string;
  create: () => T;
  validate: (value: unknown) => void;
  /** When supplied, an existing artifact whose contentHash differs is a conflict. */
  expectedContentHash?: string;
}

function loadOrCreate<T extends { contentHash: string }>(input: StoreInput<T>): { artifact: T; reused: boolean } {
  const file = resolvePath(input.outputDir, input.ref, input.contentHash, input.pathKind);
  const existing = readValidated<T>(file, input.validate, input.kind);
  if (existing) {
    if (input.expectedContentHash !== undefined && existing.contentHash !== input.expectedContentHash) {
      throw new Error(`${input.kind} contentHash differs from the caller's expected contentHash`);
    }
    return { artifact: existing, reused: true };
  }
  // The create callback is evaluated at most once (only when no artifact exists).
  const artifact = structuredClone(input.create());
  if (artifact.contentHash !== input.contentHash) {
    throw new Error(`${input.kind} create produced a contentHash differing from the requested one`);
  }
  if (input.expectedContentHash !== undefined && artifact.contentHash !== input.expectedContentHash) {
    throw new Error(`${input.kind} create produced a contentHash differing from the caller's expected contentHash`);
  }
  fs.mkdirSync(input.outputDir, { recursive: true });
  const temporaryPath = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const text = `${JSON.stringify(artifact, null, 2)}\n`;
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporaryPath, "wx");
    fs.writeFileSync(descriptor, text, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.linkSync(temporaryPath, file);
    try { fs.unlinkSync(temporaryPath); } catch { /* authoritative link published */ }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    if (!fs.existsSync(file)) throw error;
    const raced = readValidated<T>(file, input.validate, input.kind);
    if (!raced) throw error;
    if (input.expectedContentHash !== undefined && raced.contentHash !== input.expectedContentHash) {
      throw new Error(`${input.kind} contentHash differs from the caller's expected contentHash`);
    }
    return { artifact: raced, reused: true };
  }
  return { artifact: structuredClone(artifact), reused: false };
}

export function readMeasurementValidityDesignV1(input: { outputDir: string; designRef: VersionedGovernanceRef; contentHash: string }): MeasurementValidityDesignV1 | null {
  return readValidated<MeasurementValidityDesignV1>(
    resolveMeasurementValidityDesignV1Path(input.outputDir, input.designRef, input.contentHash),
    (value: unknown) => validateMeasurementValidityDesignV1(value as MeasurementValidityDesignV1),
    "measurement design",
  );
}
export function readMeasurementValidityFreezeV1(input: { outputDir: string; freezeRef: VersionedGovernanceRef; contentHash: string }): MeasurementValidityFreezeV1 | null {
  return readValidated<MeasurementValidityFreezeV1>(
    resolveMeasurementValidityFreezeV1Path(input.outputDir, input.freezeRef, input.contentHash),
    (value: unknown) => validateMeasurementValidityFreezeV1(value as MeasurementValidityFreezeV1),
    "measurement freeze",
  );
}
export function readMeasurementValidityResultIndexV1(input: { outputDir: string; resultIndexRef: VersionedGovernanceRef; contentHash: string }): MeasurementValidityResultIndexV1 | null {
  return readValidated<MeasurementValidityResultIndexV1>(
    resolveMeasurementValidityResultIndexV1Path(input.outputDir, input.resultIndexRef, input.contentHash),
    (value: unknown) => validateMeasurementValidityResultIndexV1(value as MeasurementValidityResultIndexV1),
    "measurement result index",
  );
}

export function loadOrCreateMeasurementValidityDesignV1(input: {
  outputDir: string;
  designRef: VersionedGovernanceRef;
  contentHash: string;
  createDesign: () => MeasurementValidityDesignV1;
  expectedContentHash?: string;
}): Readonly<MeasurementValidityDesignV1> {
  return loadOrCreate<MeasurementValidityDesignV1>({
    outputDir: input.outputDir, ref: input.designRef, contentHash: input.contentHash, kind: "measurement design", pathKind: "measurement-design.v1",
    create: input.createDesign,
    validate: (value: unknown) => validateMeasurementValidityDesignV1(value as MeasurementValidityDesignV1),
    expectedContentHash: input.expectedContentHash,
  }).artifact;
}

export function loadOrCreateMeasurementValidityFreezeV1(input: {
  outputDir: string;
  freezeRef: VersionedGovernanceRef;
  contentHash: string;
  createFreeze: () => MeasurementValidityFreezeV1;
  expectedContentHash?: string;
}): Readonly<MeasurementValidityFreezeV1> {
  return loadOrCreate<MeasurementValidityFreezeV1>({
    outputDir: input.outputDir, ref: input.freezeRef, contentHash: input.contentHash, kind: "measurement freeze", pathKind: "measurement-freeze.v1",
    create: input.createFreeze,
    validate: (value: unknown) => validateMeasurementValidityFreezeV1(value as MeasurementValidityFreezeV1),
    expectedContentHash: input.expectedContentHash,
  }).artifact;
}

export function loadOrCreateMeasurementValidityResultIndexV1(input: {
  outputDir: string;
  resultIndexRef: VersionedGovernanceRef;
  contentHash: string;
  createIndex: () => MeasurementValidityResultIndexV1;
  /** Fail closed when an existing artifact's contentHash differs. */
  expectedContentHash?: string;
}): Readonly<MeasurementValidityResultIndexV1> {
  return loadOrCreate<MeasurementValidityResultIndexV1>({
    outputDir: input.outputDir, ref: input.resultIndexRef, contentHash: input.contentHash, kind: "measurement result index", pathKind: "measurement-result-index.v1",
    create: input.createIndex,
    validate: (value: unknown) => validateMeasurementValidityResultIndexV1(value as MeasurementValidityResultIndexV1),
    expectedContentHash: input.expectedContentHash,
  }).artifact;
}
