import { createHash } from "node:crypto";
import {
  governanceRefKey,
  validateGovernanceRef,
  type VersionedGovernanceRef,
} from "../../../src/lib/governance";
import {
  validateV6TaskManifestV1,
  type V6TaskManifestV1,
} from "./v6TaskManifest";

export const V6_TASK_BANK_MANIFEST_V1 = Object.freeze({
  id: "swarmalpha.v6.task-bank-manifest",
  version: "1.0.0",
});

export type V6TaskBankPurpose =
  | "engineering_only"
  | "calibration_candidate"
  | "confirmatory_candidate";

export type V6TaskSplit =
  | "engineering_canary"
  | "threshold_calibration"
  | "held_out_detector"
  | "confirmatory";

export type V6TaskSemanticReviewV1 =
  | { status: "not_reviewed" }
  | {
      status: "accepted";
      reviewProtocolRef: VersionedGovernanceRef;
      reviewedAt: string;
    };

export interface V6TaskBankEntryV1 {
  taskRef: VersionedGovernanceRef;
  taskId: string;
  taskDefinitionHash: string;
  taskFamilyRef: VersionedGovernanceRef;
  adapterRef: VersionedGovernanceRef;
  taskSchemaRef: VersionedGovernanceRef;
  resolverId: string;
  /** Tasks derived from the same scenario/template must share this cluster. */
  leakageGroupId: string;
  split: V6TaskSplit;
  semanticReview: V6TaskSemanticReviewV1;
}

export interface V6TaskBankManifestV1 {
  artifactSchemaRef: typeof V6_TASK_BANK_MANIFEST_V1;
  bankRef: VersionedGovernanceRef;
  purpose: V6TaskBankPurpose;
  entries: V6TaskBankEntryV1[];
  createdAt: string;
  contentHash: string;
}

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const SPLITS: readonly V6TaskSplit[] = [
  "engineering_canary",
  "threshold_calibration",
  "held_out_detector",
  "confirmatory",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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
  return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, canonicalize(value[key], `${field}.${key}`, next)]));
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

function requireExactKeys(value: unknown, expected: readonly string[], field: string): void {
  if (!isPlainObject(value)) throw new Error(`${field} must be a plain object`);
  if (stableJson(Object.keys(value).sort()) !== stableJson([...expected].sort())) {
    throw new Error(`${field} fields differ from the frozen v1 schema`);
  }
}

function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be non-empty`);
}

function requireTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    throw new Error(`${field} must be a canonical ISO timestamp`);
  }
}

function entrySortKey(entry: V6TaskBankEntryV1): string {
  return `${entry.split}\u0000${governanceRefKey(entry.taskRef)}\u0000${entry.taskDefinitionHash}`;
}

function manifestBody(
  manifest: V6TaskBankManifestV1,
): Omit<V6TaskBankManifestV1, "contentHash"> {
  const { contentHash: _contentHash, ...body } = manifest;
  return body;
}

export function computeV6TaskBankManifestHashV1(
  manifest: Omit<V6TaskBankManifestV1, "contentHash">,
): string {
  return hashCanonical(manifest);
}

export function validateV6TaskBankManifestV1(manifest: V6TaskBankManifestV1): void {
  requireExactKeys(manifest, [
    "artifactSchemaRef", "bankRef", "contentHash", "createdAt", "entries", "purpose",
  ], "v6TaskBank");
  if (governanceRefKey(manifest.artifactSchemaRef) !== governanceRefKey(V6_TASK_BANK_MANIFEST_V1)) {
    throw new Error("v6 task bank schema ref is invalid");
  }
  validateGovernanceRef(manifest.artifactSchemaRef, "v6TaskBank.artifactSchemaRef");
  validateGovernanceRef(manifest.bankRef, "v6TaskBank.bankRef");
  requireTimestamp(manifest.createdAt, "v6TaskBank.createdAt");
  if (!["engineering_only", "calibration_candidate", "confirmatory_candidate"].includes(manifest.purpose)) {
    throw new Error("v6 task bank purpose is invalid");
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    throw new Error("v6 task bank requires at least one entry");
  }

  const taskRefs: string[] = [];
  const taskIds: string[] = [];
  const taskHashes: string[] = [];
  const actualOrder: string[] = [];
  const leakageSplits = new Map<string, Set<V6TaskSplit>>();
  const splitCounts = new Map<V6TaskSplit, number>();

  for (const [index, entry] of manifest.entries.entries()) {
    requireExactKeys(entry, [
      "adapterRef", "leakageGroupId", "resolverId", "semanticReview", "split",
      "taskDefinitionHash", "taskFamilyRef", "taskId", "taskRef", "taskSchemaRef",
    ], `v6TaskBank.entries[${index}]`);
    validateGovernanceRef(entry.taskRef, `v6TaskBank.entries[${index}].taskRef`);
    validateGovernanceRef(entry.taskFamilyRef, `v6TaskBank.entries[${index}].taskFamilyRef`);
    validateGovernanceRef(entry.adapterRef, `v6TaskBank.entries[${index}].adapterRef`);
    validateGovernanceRef(entry.taskSchemaRef, `v6TaskBank.entries[${index}].taskSchemaRef`);
    requireNonEmpty(entry.taskId, `v6TaskBank.entries[${index}].taskId`);
    requireNonEmpty(entry.resolverId, `v6TaskBank.entries[${index}].resolverId`);
    requireNonEmpty(entry.leakageGroupId, `v6TaskBank.entries[${index}].leakageGroupId`);
    if (!SHA256_RE.test(entry.taskDefinitionHash)) {
      throw new Error(`v6TaskBank.entries[${index}].taskDefinitionHash must be canonical sha256`);
    }
    if (!(SPLITS as readonly string[]).includes(entry.split)) {
      throw new Error(`v6TaskBank.entries[${index}].split is invalid`);
    }
    if (entry.semanticReview.status === "not_reviewed") {
      requireExactKeys(entry.semanticReview, ["status"], `v6TaskBank.entries[${index}].semanticReview`);
      if (entry.split !== "engineering_canary") {
        throw new Error("scientific task-bank splits require accepted semantic review");
      }
    } else if (entry.semanticReview.status === "accepted") {
      requireExactKeys(entry.semanticReview, [
        "reviewedAt", "reviewProtocolRef", "status",
      ], `v6TaskBank.entries[${index}].semanticReview`);
      validateGovernanceRef(
        entry.semanticReview.reviewProtocolRef,
        `v6TaskBank.entries[${index}].semanticReview.reviewProtocolRef`,
      );
      requireTimestamp(entry.semanticReview.reviewedAt, `v6TaskBank.entries[${index}].semanticReview.reviewedAt`);
      if (Date.parse(entry.semanticReview.reviewedAt) > Date.parse(manifest.createdAt)) {
        throw new Error("v6 task semantic review cannot postdate the bank manifest");
      }
    } else {
      throw new Error(`v6TaskBank.entries[${index}].semanticReview.status is invalid`);
    }

    taskRefs.push(governanceRefKey(entry.taskRef));
    taskIds.push(entry.taskId);
    taskHashes.push(entry.taskDefinitionHash);
    actualOrder.push(entrySortKey(entry));
    splitCounts.set(entry.split, (splitCounts.get(entry.split) ?? 0) + 1);
    if (entry.split !== "engineering_canary") {
      const splits = leakageSplits.get(entry.leakageGroupId) ?? new Set<V6TaskSplit>();
      splits.add(entry.split);
      leakageSplits.set(entry.leakageGroupId, splits);
    }
  }

  if (new Set(taskRefs).size !== taskRefs.length
    || new Set(taskIds).size !== taskIds.length
    || new Set(taskHashes).size !== taskHashes.length) {
    throw new Error("v6 task bank task refs, task IDs, and definition hashes must be unique");
  }
  if (stableJson(actualOrder) !== stableJson([...actualOrder].sort())) {
    throw new Error("v6 task bank entries must use canonical split/task/hash order");
  }
  for (const [group, splits] of leakageSplits) {
    if (splits.size > 1) {
      throw new Error(`v6 task leakage group ${group} crosses scientific splits`);
    }
  }

  const count = (split: V6TaskSplit): number => splitCounts.get(split) ?? 0;
  if (manifest.purpose === "engineering_only") {
    if (count("engineering_canary") !== manifest.entries.length) {
      throw new Error("engineering-only task bank cannot grant scientific split authority");
    }
  } else {
    if (count("threshold_calibration") === 0 || count("held_out_detector") === 0) {
      throw new Error("calibration candidate requires non-empty calibration and held-out splits");
    }
    if (manifest.purpose === "calibration_candidate" && count("confirmatory") > 0) {
      throw new Error("calibration candidate cannot grant confirmatory authority");
    }
    if (manifest.purpose === "confirmatory_candidate" && count("confirmatory") === 0) {
      throw new Error("confirmatory candidate requires a non-empty confirmatory split");
    }
  }

  if (!SHA256_RE.test(manifest.contentHash)
    || manifest.contentHash !== computeV6TaskBankManifestHashV1(manifestBody(manifest))) {
    throw new Error("v6 task bank contentHash mismatch");
  }
}

export function createV6TaskBankManifestV1(input: {
  bankRef: VersionedGovernanceRef;
  purpose: V6TaskBankPurpose;
  entries: readonly V6TaskBankEntryV1[];
  createdAt: string;
}): Readonly<V6TaskBankManifestV1> {
  const entries = [...structuredClone(input.entries)].sort((left, right) =>
    entrySortKey(left).localeCompare(entrySortKey(right)));
  const body: Omit<V6TaskBankManifestV1, "contentHash"> = {
    artifactSchemaRef: structuredClone(V6_TASK_BANK_MANIFEST_V1),
    bankRef: structuredClone(input.bankRef),
    purpose: input.purpose,
    entries,
    createdAt: input.createdAt,
  };
  const manifest = { ...body, contentHash: computeV6TaskBankManifestHashV1(body) };
  validateV6TaskBankManifestV1(manifest);
  return deepFreeze(structuredClone(manifest));
}

export function validateV6TaskBankAdmissionV1(input: {
  bank: V6TaskBankManifestV1;
  taskManifest: V6TaskManifestV1;
  requiredSplit: V6TaskSplit;
}): V6TaskBankEntryV1 {
  validateV6TaskBankManifestV1(input.bank);
  validateV6TaskManifestV1(input.taskManifest);
  if (!(SPLITS as readonly string[]).includes(input.requiredSplit)) {
    throw new Error("required v6 task-bank split is invalid");
  }
  const matches = input.bank.entries.filter(entry =>
    entry.taskId === input.taskManifest.taskId
    && entry.taskDefinitionHash === input.taskManifest.taskDefinitionHash);
  if (matches.length !== 1) throw new Error("v6 task manifest has no unique task-bank admission");
  const entry = matches[0];
  if (entry.split !== input.requiredSplit) {
    throw new Error("v6 task is not admitted for the required split");
  }
  if (governanceRefKey(entry.taskFamilyRef) !== governanceRefKey(input.taskManifest.taskFamilyRef)
    || governanceRefKey(entry.adapterRef) !== governanceRefKey(input.taskManifest.adapterRef)
    || governanceRefKey(entry.taskSchemaRef) !== governanceRefKey(input.taskManifest.taskSchemaRef)
    || entry.resolverId !== input.taskManifest.resolutionContract.resolverId) {
    throw new Error("v6 task-bank entry differs from the authoritative task manifest");
  }
  if (entry.split !== "engineering_canary" && entry.semanticReview.status !== "accepted") {
    throw new Error("v6 scientific task admission lacks accepted semantic review");
  }
  return structuredClone(entry);
}
