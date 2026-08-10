import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  validatePrimaryAssignmentManifestForStudy,
  type GovernanceStudyContract,
} from "./governanceStudy";
import type { PrimaryAssignmentManifestV1 } from "./primaryAssignment";

export interface PersistedPrimaryAssignmentManifestV1 {
  manifest: PrimaryAssignmentManifestV1;
  absolutePath: string;
  fileHash: string;
  reused: boolean;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function fileHash(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function serialize(manifest: PrimaryAssignmentManifestV1): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function safeRunStem(runId: string): string {
  const stem = runId.replace(/[^A-Za-z0-9._-]/g, "_");
  const suffix = createHash("sha256").update(runId, "utf8").digest("hex").slice(0, 12);
  return `${stem}.${suffix}`;
}

export function resolvePrimaryAssignmentManifestV1Path(
  outputDir: string,
  runId: string,
): string {
  if (typeof runId !== "string" || runId.trim().length === 0) {
    throw new Error("primary assignment manifest runId must be non-empty");
  }
  return path.resolve(outputDir, `${safeRunStem(runId)}.primary-assignment.v1.json`);
}

export function readPrimaryAssignmentManifestV1(input: {
  outputDir: string;
  runId: string;
  study: GovernanceStudyContract;
}): PersistedPrimaryAssignmentManifestV1 | null {
  const absolutePath = resolvePrimaryAssignmentManifestV1Path(input.outputDir, input.runId);
  if (!fs.existsSync(absolutePath)) return null;
  const text = fs.readFileSync(absolutePath, "utf8");
  let manifest: PrimaryAssignmentManifestV1;
  try {
    manifest = JSON.parse(text) as PrimaryAssignmentManifestV1;
  } catch (error) {
    throw new Error(
      `primary assignment manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  validatePrimaryAssignmentManifestForStudy(manifest, input.study);
  if (manifest.runId !== input.runId) {
    throw new Error("existing primary assignment manifest belongs to another run");
  }
  return {
    manifest: clone(manifest),
    absolutePath,
    fileHash: fileHash(text),
    reused: true,
  };
}

/**
 * Persist the Stage-1 assignment before any provider call. Existing files are
 * immutable retry inputs: they are validated and reused, never redrawn or
 * overwritten. Atomic no-replace publication prevents a partial manifest from
 * becoming the authoritative path; external authenticity commitment remains
 * separate.
 */
export function loadOrCreatePrimaryAssignmentManifestV1(input: {
  outputDir: string;
  runId: string;
  study: GovernanceStudyContract;
  createManifest: () => PrimaryAssignmentManifestV1;
}): PersistedPrimaryAssignmentManifestV1 {
  fs.mkdirSync(input.outputDir, { recursive: true });
  const existing = readPrimaryAssignmentManifestV1(input);
  if (existing) return existing;

  const manifest = clone(input.createManifest());
  validatePrimaryAssignmentManifestForStudy(manifest, input.study);
  if (manifest.runId !== input.runId) {
    throw new Error("new primary assignment manifest belongs to another run");
  }

  const absolutePath = resolvePrimaryAssignmentManifestV1Path(input.outputDir, input.runId);
  const temporaryPath = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
  const text = serialize(manifest);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporaryPath, "wx");
    fs.writeFileSync(descriptor, text, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    // link is an atomic no-replace publication on the same filesystem. Unlike
    // rename on POSIX, it cannot silently overwrite a concurrently published
    // assignment and therefore preserves retry immutability cross-platform.
    fs.linkSync(temporaryPath, absolutePath);
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // Publication already succeeded. A stale uniquely named temp link is a
      // cleanup concern, not a retry: the authoritative path is still fresh.
    }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    if (!fs.existsSync(absolutePath)) throw error;
    const raced = readPrimaryAssignmentManifestV1(input);
    if (!raced) throw error;
    return raced;
  }

  return {
    manifest: clone(manifest),
    absolutePath,
    fileHash: fileHash(text),
    reused: false,
  };
}
