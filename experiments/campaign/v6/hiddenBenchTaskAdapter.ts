import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { VersionedGovernanceRef } from "../../../src/lib/governance";
import type { V6CategoricalTaskV1 } from "./productionVerticalSlice";
import type { V6TaskAdapterV1 } from "./taskAdapters";
import {
  computeV6TaskDefinitionHashV1,
  type V6TaskAuthorityV1,
} from "./v6TaskManifest";
import type {
  V6TaskBankEntryV1,
  V6TaskSemanticReviewV1,
  V6TaskSplit,
} from "./taskBank";

/**
 * Pinned source authority for the canonical HiddenBench task content.
 * The content hash is over parsed JSON with recursively sorted object keys;
 * it intentionally ignores whitespace/formatting differences in the file.
 */
export const HIDDENBENCH_OFFICIAL_SOURCE_V1 = Object.freeze({
  repository: "Yassellee/HiddenBench_ICML",
  commit: "3be6ca16",
  license: "MIT",
  canonicalContentHash: "sha256:901c94b6e4edbeebe51f3ecba7baf069cde1e64f8d0bdec0f4d5314b4258f123",
  taskCount: 65,
});

export const HIDDENBENCH_CATEGORICAL_TASK_FAMILY_V1 = Object.freeze({
  id: "swarmalpha.task.hiddenbench-categorical",
  version: "1.0.0",
});

export const HIDDENBENCH_CATEGORICAL_TASK_SCHEMA_V1 = Object.freeze({
  id: "swarmalpha.v6.categorical-task",
  version: "1.0.0",
});

export const HIDDENBENCH_PINNED_DATA_TASK_ADAPTER_V1 = Object.freeze({
  id: "swarmalpha.task-adapter.hiddenbench-data-3be6ca16",
  version: "1.0.0",
});

export const HIDDENBENCH_PINNED_DATA_RESOLVER_ID_V1 =
  "resolver:hiddenbench-data-3be6ca16";

const HIDDENBENCH_CLAIM_CREATED_AT_V1 = "2026-08-11T00:00:00.000Z";
const DEFAULT_DATA_PATH_PARTS = [
  "experiments", "campaign", "tasks", "hiddenbench", "benchmark.json",
] as const;

export interface HiddenBenchSourceTaskV1 {
  id: number;
  name: string;
  description: string;
  shared_information: string[];
  hidden_information: string[];
  possible_answers: string[];
  correct_answer: string;
  /** Present on pinned source tasks 9-65; retained as source metadata, never projected into prompts. */
  rationale?: string;
}

export interface HiddenBenchTaskCatalogEntryV1 {
  sourceTaskId: number;
  taskRef: VersionedGovernanceRef;
  taskId: string;
  optionCount: number;
  agentCount: number;
  /** Exact normalized-description cluster only; semantic leakage review remains mandatory. */
  syntacticLeakageGroupId: string;
}

export interface HiddenBenchTaskProjectionV1 {
  sourceRef: {
    repository: string;
    commit: string;
    canonicalContentHash: string;
    sourceTaskId: number;
  };
  taskRef: VersionedGovernanceRef;
  syntacticLeakageGroupId: string;
  adapter: V6TaskAdapterV1<V6CategoricalTaskV1>;
}

export interface HiddenBenchTaskBankEntryInputV1 {
  sourceTaskId: number;
  split: V6TaskSplit;
  semanticReview: V6TaskSemanticReviewV1;
  /** Required for scientific splits; may merge multiple syntactic description clusters. */
  semanticLeakageGroupId?: string;
  dataPath?: string;
}

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
    throw new Error(`${field} fields differ from the pinned HiddenBench schema`);
  }
}

function requireNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function validateSourceTask(task: unknown, expectedId: number): asserts task is HiddenBenchSourceTaskV1 {
  const requiredKeys = [
    "correct_answer", "description", "hidden_information", "id", "name",
    "possible_answers", "shared_information",
  ];
  const expectedKeys = isPlainObject(task) && Object.hasOwn(task, "rationale")
    ? [...requiredKeys, "rationale"]
    : requiredKeys;
  requireExactKeys(task, expectedKeys, `hiddenBench[${expectedId - 1}]`);
  const candidate = task as Record<string, unknown>;
  if (candidate.id !== expectedId) throw new Error("HiddenBench task IDs must be contiguous and source-ordered");
  requireNonEmptyString(candidate.name, `hiddenBench[${expectedId - 1}].name`);
  requireNonEmptyString(candidate.description, `hiddenBench[${expectedId - 1}].description`);
  requireNonEmptyString(candidate.correct_answer, `hiddenBench[${expectedId - 1}].correct_answer`);
  if (Object.hasOwn(candidate, "rationale")) {
    requireNonEmptyString(candidate.rationale, `hiddenBench[${expectedId - 1}].rationale`);
  }
  for (const key of ["shared_information", "hidden_information", "possible_answers"] as const) {
    const entries = candidate[key];
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error(`hiddenBench[${expectedId - 1}].${key} must be non-empty`);
    }
    entries.forEach((entry, index) => requireNonEmptyString(
      entry,
      `hiddenBench[${expectedId - 1}].${key}[${index}]`,
    ));
    if (new Set(entries).size !== entries.length) {
      throw new Error(`hiddenBench[${expectedId - 1}].${key} must not contain duplicates`);
    }
  }
  const options = candidate.possible_answers as string[];
  const hidden = candidate.hidden_information as string[];
  if (options.length !== 3 && options.length !== 4) {
    throw new Error("pinned HiddenBench tasks must have three or four canonical options");
  }
  if (hidden.length !== 3 && hidden.length !== 4) {
    throw new Error("HiddenBench roster size must be derived from three or four hidden-information records");
  }
  if (!options.includes(candidate.correct_answer as string)) {
    throw new Error("HiddenBench correct answer must be one canonical option");
  }
}

function readCanonicalDataset(dataPath?: string): HiddenBenchSourceTaskV1[] {
  const source = dataPath ?? path.resolve(process.cwd(), ...DEFAULT_DATA_PATH_PARTS);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(source, "utf8"));
  } catch (error) {
    throw new Error(`unable to read pinned HiddenBench dataset: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(parsed) || parsed.length !== HIDDENBENCH_OFFICIAL_SOURCE_V1.taskCount) {
    throw new Error(`pinned HiddenBench dataset must contain exactly ${HIDDENBENCH_OFFICIAL_SOURCE_V1.taskCount} tasks`);
  }
  // Diagnose structural violations before checking source identity. Passing
  // structural validation never grants authority: exact pinned-content hash
  // equality remains mandatory immediately afterwards.
  parsed.forEach((task, index) => validateSourceTask(task, index + 1));
  const actualHash = hashCanonical(parsed);
  if (actualHash !== HIDDENBENCH_OFFICIAL_SOURCE_V1.canonicalContentHash) {
    throw new Error("HiddenBench canonical content hash differs from the pinned official source");
  }
  return structuredClone(parsed) as HiddenBenchSourceTaskV1[];
}

/** Read the whole pinned catalog. A caller-supplied path is accepted only when its canonical content is identical. */
export function loadCanonicalHiddenBenchTasksV1(dataPath?: string): readonly HiddenBenchSourceTaskV1[] {
  return deepFreeze(readCanonicalDataset(dataPath));
}

function normalizedDescription(description: string): string {
  return description.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function deriveHiddenBenchSyntacticLeakageGroupIdV1(description: string): string {
  requireNonEmptyString(description, "HiddenBench description");
  return `hiddenbench:description:${hashText(normalizedDescription(description)).slice("sha256:".length)}`;
}

function taskRef(sourceTaskId: number): VersionedGovernanceRef {
  return { id: `swarmalpha.task.hiddenbench.${sourceTaskId}`, version: "1.0.0" };
}

function publicContext(task: HiddenBenchSourceTaskV1): string {
  const shared = task.shared_information.map((entry, index) => `${index + 1}. ${entry}`).join("\n");
  return `${task.description}\n\nShared information:\n${shared}`;
}

/**
 * Project one task by source ID. Raw caller-provided task objects are deliberately
 * not accepted: every projection is reloaded from the pinned, whole-catalog authority.
 */
export function createHiddenBenchTaskProjectionV1(input: {
  sourceTaskId: number;
  dataPath?: string;
}): HiddenBenchTaskProjectionV1 {
  if (!Number.isInteger(input.sourceTaskId)
    || input.sourceTaskId < 1
    || input.sourceTaskId > HIDDENBENCH_OFFICIAL_SOURCE_V1.taskCount) {
    throw new Error("HiddenBench sourceTaskId is outside the pinned catalog");
  }
  const sourceTask = readCanonicalDataset(input.dataPath)[input.sourceTaskId - 1];
  const id = `task:hiddenbench:${sourceTask.id}`;
  const resolverId = HIDDENBENCH_PINNED_DATA_RESOLVER_ID_V1;
  const task: V6CategoricalTaskV1 = {
    id,
    taskFamilyRef: structuredClone(HIDDENBENCH_CATEGORICAL_TASK_FAMILY_V1),
    publicContext: publicContext(sourceTask),
    claim: {
      id: `claim:hiddenbench:${sourceTask.id}:answer`,
      proposition: `Select the single correct answer for HiddenBench task ${sourceTask.id} (${sourceTask.name}).`,
      domain: "hiddenbench-categorical-decision",
      createdAt: HIDDENBENCH_CLAIM_CREATED_AT_V1,
      options: structuredClone(sourceTask.possible_answers),
      resolutionPolicy: {
        kind: "categorical",
        resolverId,
      },
    },
    agents: sourceTask.hidden_information.map((privateInformation, index) => ({
      agentId: `agent:hiddenbench:${sourceTask.id}:${index + 1}`,
      privateInformation,
    })),
    outcome: sourceTask.correct_answer,
  };
  const adapter: V6TaskAdapterV1<V6CategoricalTaskV1> = {
    adapterRef: structuredClone(HIDDENBENCH_PINNED_DATA_TASK_ADAPTER_V1),
    taskFamilyRef: structuredClone(HIDDENBENCH_CATEGORICAL_TASK_FAMILY_V1),
    taskSchemaRef: structuredClone(HIDDENBENCH_CATEGORICAL_TASK_SCHEMA_V1),
    task,
    resolution: { kind: "from_task_outcome", resolverId },
  };
  return deepFreeze({
    sourceRef: {
      repository: HIDDENBENCH_OFFICIAL_SOURCE_V1.repository,
      commit: HIDDENBENCH_OFFICIAL_SOURCE_V1.commit,
      canonicalContentHash: HIDDENBENCH_OFFICIAL_SOURCE_V1.canonicalContentHash,
      sourceTaskId: sourceTask.id,
    },
    taskRef: taskRef(sourceTask.id),
    syntacticLeakageGroupId: deriveHiddenBenchSyntacticLeakageGroupIdV1(sourceTask.description),
    adapter,
  });
}

/** Metadata for split design. No scientific split is inferred or granted here. */
export function listHiddenBenchTaskCatalogV1(dataPath?: string): readonly HiddenBenchTaskCatalogEntryV1[] {
  return deepFreeze(readCanonicalDataset(dataPath).map(sourceTask => ({
    sourceTaskId: sourceTask.id,
    taskRef: taskRef(sourceTask.id),
    taskId: `task:hiddenbench:${sourceTask.id}`,
    optionCount: sourceTask.possible_answers.length,
    agentCount: sourceTask.hidden_information.length,
    syntacticLeakageGroupId: deriveHiddenBenchSyntacticLeakageGroupIdV1(sourceTask.description),
  })));
}

/**
 * Bind a pinned projection to the generic task-bank schema. Split ownership is
 * deliberately external: this function never chooses a split, and scientific
 * splits require an explicit accepted semantic review before an entry exists.
 * The description hash is only a syntactic lower bound on leakage clustering;
 * accepted semantic review must merge additional paraphrase/template families.
 */
export function createHiddenBenchTaskBankEntryV1(
  input: HiddenBenchTaskBankEntryInputV1,
): Readonly<V6TaskBankEntryV1> {
  const scientific = input.split !== "engineering_canary";
  if (scientific && input.semanticReview.status !== "accepted") {
    throw new Error("HiddenBench scientific task-bank entries require accepted semantic review");
  }
  if (scientific
    && (typeof input.semanticLeakageGroupId !== "string"
      || input.semanticLeakageGroupId.trim().length === 0)) {
    throw new Error("HiddenBench scientific task-bank entries require an explicit semantic leakage group");
  }
  if (input.semanticLeakageGroupId !== undefined
    && (typeof input.semanticLeakageGroupId !== "string"
      || input.semanticLeakageGroupId.trim().length === 0)) {
    throw new Error("HiddenBench semantic leakage group must be a non-empty string");
  }
  const projection = createHiddenBenchTaskProjectionV1({
    sourceTaskId: input.sourceTaskId,
    dataPath: input.dataPath,
  });
  const authority: V6TaskAuthorityV1 = {
    adapterRef: structuredClone(projection.adapter.adapterRef),
    taskSchemaRef: structuredClone(projection.adapter.taskSchemaRef),
    resolution: structuredClone(projection.adapter.resolution),
  };
  const entry: V6TaskBankEntryV1 = {
    taskRef: structuredClone(projection.taskRef),
    taskId: projection.adapter.task.id,
    taskDefinitionHash: computeV6TaskDefinitionHashV1(projection.adapter.task, authority),
    taskFamilyRef: structuredClone(projection.adapter.taskFamilyRef),
    adapterRef: structuredClone(projection.adapter.adapterRef),
    taskSchemaRef: structuredClone(projection.adapter.taskSchemaRef),
    resolverId: projection.adapter.resolution.resolverId,
    leakageGroupId: input.semanticLeakageGroupId ?? projection.syntacticLeakageGroupId,
    split: input.split,
    semanticReview: structuredClone(input.semanticReview),
  };
  return deepFreeze(entry);
}
