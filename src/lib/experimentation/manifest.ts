import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import {
  validateTreatmentAssignment,
  type TreatmentAssignment,
} from "./assignment";
import {
  validateBudgetContract,
  type BudgetContract,
} from "./baseline";

export interface RunAssignmentManifest {
  artifactType: "swarmalpha.run-assignment-manifest";
  schemaVersion: "1.0.0";
  runId: string;
  createdAt: string;
  retryPolicy: "reuse-assignment";
  assignment: TreatmentAssignment;
  budgetContract?: BudgetContract;
}

export interface PersistedRunAssignment {
  manifest: RunAssignmentManifest;
  absolutePath: string;
  sha256: string;
  reused: boolean;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

function stableJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

function fingerprint(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function resolveRunAssignmentManifestPath(outputDir: string, runId: string): string {
  const safeStem = runId.replace(/[^A-Za-z0-9._-]/g, "_");
  const identitySuffix = fingerprint(runId).slice(0, 12);
  return path.resolve(outputDir, `${safeStem}.${identitySuffix}.assignment.json`);
}

export function readRunAssignmentManifest(outputDir: string, runId: string): PersistedRunAssignment | null {
  const absolutePath = resolveRunAssignmentManifestPath(outputDir, runId);
  if (!fs.existsSync(absolutePath)) return null;
  const text = fs.readFileSync(absolutePath, "utf8");
  const manifest = JSON.parse(text) as unknown;
  validateRunAssignmentManifest(manifest);
  if (manifest.runId !== runId) throw new Error("existing assignment manifest belongs to another run");
  return { manifest: deepFreeze(manifest), absolutePath, sha256: fingerprint(text), reused: true };
}

export function validateRunAssignmentManifest(value: unknown): asserts value is RunAssignmentManifest {
  if (value === null || typeof value !== "object") throw new Error("assignment manifest must be an object");
  const manifest = value as Record<string, unknown>;
  if (manifest.artifactType !== "swarmalpha.run-assignment-manifest") {
    throw new Error("assignment manifest artifactType mismatch");
  }
  if (manifest.schemaVersion !== "1.0.0") throw new Error("assignment manifest schemaVersion mismatch");
  if (typeof manifest.runId !== "string" || manifest.runId.length === 0) {
    throw new Error("assignment manifest runId must be non-empty");
  }
  if (manifest.retryPolicy !== "reuse-assignment") throw new Error("assignment manifest retryPolicy mismatch");
  if (typeof manifest.createdAt !== "string" || !Number.isFinite(Date.parse(manifest.createdAt))) {
    throw new Error("assignment manifest createdAt must be a timestamp");
  }
  validateTreatmentAssignment(manifest.assignment);
  const assignment = manifest.assignment as TreatmentAssignment;
  if (assignment.unitId !== manifest.runId) throw new Error("assignment manifest runId/unitId mismatch");
  if (manifest.budgetContract !== undefined) validateBudgetContract(manifest.budgetContract);
}

/**
 * Persist before any LLM call. Existing manifests are consumed as immutable
 * retry inputs; a retry never draws a new arm or rewrites assignedAt.
 */
export function loadOrCreateRunAssignmentManifest(input: {
  outputDir: string;
  runId: string;
  createAssignment: () => TreatmentAssignment;
  budgetContract?: BudgetContract;
}): PersistedRunAssignment {
  fs.mkdirSync(input.outputDir, { recursive: true });
  const absolutePath = resolveRunAssignmentManifestPath(input.outputDir, input.runId);
  const existingManifest = readRunAssignmentManifest(input.outputDir, input.runId);
  const assertBudgetContractMatch = (manifest: RunAssignmentManifest): void => {
    if (stableJson(manifest.budgetContract ?? null) !== stableJson(input.budgetContract ?? null)) {
      throw new Error("existing assignment manifest budgetContract does not match the requested contract");
    }
  };
  if (existingManifest) {
    assertBudgetContractMatch(existingManifest.manifest);
    return existingManifest;
  }

  const manifest: RunAssignmentManifest = {
    artifactType: "swarmalpha.run-assignment-manifest",
    schemaVersion: "1.0.0",
    runId: input.runId,
    createdAt: new Date().toISOString(),
    retryPolicy: "reuse-assignment",
    assignment: input.createAssignment(),
    ...(input.budgetContract ? { budgetContract: input.budgetContract } : {}),
  };
  validateRunAssignmentManifest(manifest);
  const text = canonicalJson(manifest);
  const temporaryPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, text, { encoding: "utf8", flag: "wx" });
  try {
    fs.renameSync(temporaryPath, absolutePath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    if (!fs.existsSync(absolutePath)) throw error;
    const existingText = fs.readFileSync(absolutePath, "utf8");
    const existing = JSON.parse(existingText) as unknown;
    validateRunAssignmentManifest(existing);
    if (existing.runId !== input.runId) throw new Error("existing assignment manifest belongs to another run");
    assertBudgetContractMatch(existing);
    return { manifest: deepFreeze(existing), absolutePath, sha256: fingerprint(existingText), reused: true };
  }
  return { manifest: deepFreeze(manifest), absolutePath, sha256: fingerprint(text), reused: false };
}
