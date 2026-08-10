import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  validateOperationalAnalysisUnitV1,
  type OperationalAnalysisUnitV1,
} from "./operationalOutcome";

export interface PersistedOperationalAnalysisUnitV1 {
  analysisUnit: OperationalAnalysisUnitV1;
  absolutePath: string;
  fileHash: string;
  reused: boolean;
}

function safeRunStem(runId: string): string {
  const stem = runId.replace(/[^A-Za-z0-9._-]/g, "_");
  const suffix = createHash("sha256").update(runId, "utf8").digest("hex").slice(0, 12);
  return `${stem}.${suffix}`;
}

function serialize(value: OperationalAnalysisUnitV1): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hashText(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

export function resolveOperationalAnalysisUnitV1Path(outputDir: string, runId: string): string {
  if (typeof runId !== "string" || runId.trim().length === 0) {
    throw new Error("operational analysis unit runId must be non-empty");
  }
  return path.resolve(outputDir, `${safeRunStem(runId)}.operational-analysis-unit.v1.json`);
}

export function readOperationalAnalysisUnitV1(input: {
  outputDir: string;
  runId: string;
}): PersistedOperationalAnalysisUnitV1 | null {
  const absolutePath = resolveOperationalAnalysisUnitV1Path(input.outputDir, input.runId);
  if (!fs.existsSync(absolutePath)) return null;
  const text = fs.readFileSync(absolutePath, "utf8");
  let analysisUnit: OperationalAnalysisUnitV1;
  try {
    analysisUnit = JSON.parse(text) as OperationalAnalysisUnitV1;
  } catch (error) {
    throw new Error(
      `operational analysis unit is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  validateOperationalAnalysisUnitV1(analysisUnit);
  if (analysisUnit.runId !== input.runId) {
    throw new Error("existing operational analysis unit belongs to another run");
  }
  return {
    analysisUnit: structuredClone(analysisUnit),
    absolutePath,
    fileHash: hashText(text),
    reused: true,
  };
}

/**
 * Durable pre-assignment commitment for the primary claim and ITT roster.
 * Publication is atomic and no-replace: a retry may reuse this exact unit but
 * can never overwrite it with a new roster, task, claim, or timestamp.
 */
export function loadOrCreateOperationalAnalysisUnitV1(input: {
  outputDir: string;
  runId: string;
  createAnalysisUnit: () => OperationalAnalysisUnitV1;
}): PersistedOperationalAnalysisUnitV1 {
  fs.mkdirSync(input.outputDir, { recursive: true });
  const existing = readOperationalAnalysisUnitV1(input);
  if (existing) return existing;

  const analysisUnit = structuredClone(input.createAnalysisUnit());
  validateOperationalAnalysisUnitV1(analysisUnit);
  if (analysisUnit.runId !== input.runId) {
    throw new Error("new operational analysis unit belongs to another run");
  }
  const absolutePath = resolveOperationalAnalysisUnitV1Path(input.outputDir, input.runId);
  const temporaryPath = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
  const text = serialize(analysisUnit);
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
      // The authoritative no-replace link has already been published.
    }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    if (!fs.existsSync(absolutePath)) throw error;
    const raced = readOperationalAnalysisUnitV1(input);
    if (!raced) throw error;
    return raced;
  }
  return {
    analysisUnit: structuredClone(analysisUnit),
    absolutePath,
    fileHash: hashText(text),
    reused: false,
  };
}
