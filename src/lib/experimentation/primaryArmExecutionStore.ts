import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  validatePrimaryArmExecutionBindingV1,
  type PrimaryArmExecutionBindingV1,
  type PrimaryArmExecutionRegistryV1,
} from "./primaryAssignmentExecution";
import type { PrimaryAssignmentManifestV1 } from "./primaryAssignment";

export interface PersistedPrimaryArmExecutionBindingV1 {
  binding: PrimaryArmExecutionBindingV1;
  absolutePath: string;
  fileHash: string;
  reused: boolean;
}

function safeRunStem(runId: string): string {
  const stem = runId.replace(/[^A-Za-z0-9._-]/g, "_");
  const suffix = createHash("sha256").update(runId, "utf8").digest("hex").slice(0, 12);
  return `${stem}.${suffix}`;
}

function serialized(binding: PrimaryArmExecutionBindingV1): string {
  return `${JSON.stringify(binding, null, 2)}\n`;
}

function hashText(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

export function resolvePrimaryArmExecutionBindingV1Path(outputDir: string, runId: string): string {
  if (typeof runId !== "string" || runId.trim().length === 0) {
    throw new Error("primary arm execution binding runId must be non-empty");
  }
  return path.resolve(outputDir, `${safeRunStem(runId)}.primary-arm-execution.v1.json`);
}

export function readPrimaryArmExecutionBindingV1(input: {
  outputDir: string;
  runId: string;
  manifest: PrimaryAssignmentManifestV1;
  registry: PrimaryArmExecutionRegistryV1;
}): PersistedPrimaryArmExecutionBindingV1 | null {
  const absolutePath = resolvePrimaryArmExecutionBindingV1Path(input.outputDir, input.runId);
  if (!fs.existsSync(absolutePath)) return null;
  const text = fs.readFileSync(absolutePath, "utf8");
  let binding: PrimaryArmExecutionBindingV1;
  try {
    binding = JSON.parse(text) as PrimaryArmExecutionBindingV1;
  } catch (error) {
    throw new Error(
      `primary arm execution binding is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  validatePrimaryArmExecutionBindingV1(binding, input.manifest, input.registry);
  if (binding.runId !== input.runId) {
    throw new Error("existing primary arm execution binding belongs to another run");
  }
  return {
    binding: structuredClone(binding),
    absolutePath,
    fileHash: hashText(text),
    reused: true,
  };
}

/**
 * Atomic no-replace publication. A retry reuses the exact resolved arm and
 * never substitutes another registry entry or execution snapshot.
 */
export function loadOrCreatePrimaryArmExecutionBindingV1(input: {
  outputDir: string;
  runId: string;
  manifest: PrimaryAssignmentManifestV1;
  registry: PrimaryArmExecutionRegistryV1;
  createBinding: () => PrimaryArmExecutionBindingV1;
}): PersistedPrimaryArmExecutionBindingV1 {
  fs.mkdirSync(input.outputDir, { recursive: true });
  const existing = readPrimaryArmExecutionBindingV1(input);
  if (existing) return existing;

  const binding = structuredClone(input.createBinding());
  validatePrimaryArmExecutionBindingV1(binding, input.manifest, input.registry);
  if (binding.runId !== input.runId) {
    throw new Error("new primary arm execution binding belongs to another run");
  }

  const absolutePath = resolvePrimaryArmExecutionBindingV1Path(input.outputDir, input.runId);
  const temporaryPath = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
  const text = serialized(binding);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporaryPath, "wx");
    fs.writeFileSync(descriptor, text, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.linkSync(temporaryPath, absolutePath);
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // The authoritative no-replace link is already durable enough for retry.
    }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    if (!fs.existsSync(absolutePath)) throw error;
    const raced = readPrimaryArmExecutionBindingV1(input);
    if (!raced) throw error;
    return raced;
  }

  return {
    binding: structuredClone(binding),
    absolutePath,
    fileHash: hashText(text),
    reused: false,
  };
}
