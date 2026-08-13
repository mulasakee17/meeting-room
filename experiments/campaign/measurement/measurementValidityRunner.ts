/**
 * Measurement-validity experiment runner v1.
 *
 * This module owns experiment-level ordering only: preflight and authority
 * persistence happen before any provider-capable callback; every registered
 * cell reaches exactly one explicit terminal outcome before the result index
 * can be sealed. It does not call providers, retry failures, open held-out data
 * by default, or alter raw schema-5 semantics.
 */

import type { VersionedGovernanceRef } from "../../../src/lib/governance";
import {
  createMeasurementValidityResultIndexV1,
  loadOrCreateMeasurementValidityDesignV1,
  loadOrCreateMeasurementValidityFreezeV1,
  loadOrCreateMeasurementValidityResultIndexV1,
  readMeasurementValidityResultIndexV1,
  validateFreezeAgainstDesignV1,
  validateFreezeTaskBankBindingV1,
  validateMeasurementValidityDesignAgainstAdmissionV1,
  validateMeasurementValidityDesignV1,
  validateMeasurementValidityFreezeV1,
  validateMeasurementValidityResultIndexAgainstSourcesV1,
  validateResultIndexAgainstFreezeV1,
  type MeasurementRegisteredCellV1,
  type MeasurementValidityDesignV1,
  type MeasurementValidityFreezeV1,
  type MeasurementValidityResultCellV1,
  type MeasurementValidityResultIndexV1,
} from "./measurementValidity";

export type MeasurementCellExecutionOutcomeV1 =
  | {
      status: "valid";
      instrumentKind: "final_outcome";
      runId: string;
      taskManifestHash: string;
      rawArtifactHash: string;
      finalOutcomeHash: string;
    }
  | {
      status: "valid";
      instrumentKind: "in_process_explicit";
      runId: string;
      taskManifestHash: string;
      rawArtifactHash: string;
      interactionTraceHash: string;
    }
  | {
      status: "invalid_response";
      runId: string;
      taskManifestHash: string;
      rawArtifactHash: string;
    }
  | {
      status: "provider_error" | "timeout" | "unavailable";
      runId: string;
      absentFields: string[];
      reason: string;
    };

export interface MeasurementCellExecutionContextV1 {
  cell: Readonly<MeasurementRegisteredCellV1>;
  design: Readonly<MeasurementValidityDesignV1>;
  freeze: Readonly<MeasurementValidityFreezeV1>;
  firstProviderAt: string;
}

export interface MeasurementCellSourceReadContextV1 {
  cell: Readonly<MeasurementRegisteredCellV1>;
  resultCell: Readonly<MeasurementValidityResultCellV1>;
  design: Readonly<MeasurementValidityDesignV1>;
  freeze: Readonly<MeasurementValidityFreezeV1>;
}

export interface MeasurementCellSourceHashesV1 {
  taskManifestHash?: string;
  rawArtifactHash?: string;
  finalOutcomeHash?: string;
  interactionTraceHash?: string;
}

export interface RunMeasurementValidityV1Input {
  outputDir: string;
  design: MeasurementValidityDesignV1;
  freeze: MeasurementValidityFreezeV1;
  taskBankContentHash: string;
  admittedTaskDefinitionHashes: readonly string[];
  resultIndexRef: VersionedGovernanceRef;
  executeCell: (
    context: MeasurementCellExecutionContextV1,
  ) => Promise<MeasurementCellExecutionOutcomeV1>;
  /** Independently read hashes from persisted cell artifacts; never call a provider. */
  readCellSourceHashes: (
    context: MeasurementCellSourceReadContextV1,
  ) => Promise<MeasurementCellSourceHashesV1>;
  clock?: () => string;
  allowSealedHeldout?: boolean;
  expectedExistingResultIndexContentHash?: string;
}

export interface RunMeasurementValidityV1Result {
  design: Readonly<MeasurementValidityDesignV1>;
  freeze: Readonly<MeasurementValidityFreezeV1>;
  resultIndex: Readonly<MeasurementValidityResultIndexV1>;
  reused: boolean;
  executedCellCount: number;
}

const CANONICAL_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function assertCanonicalTimestamp(value: string, field: string): number {
  if (typeof value !== "string" || !CANONICAL_ISO_RE.test(value)) {
    throw new Error(`${field} must be a canonical ISO timestamp`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${field} must be a canonical ISO timestamp`);
  }
  return parsed;
}

function createRunnerClock(clock?: () => string): () => string {
  if (clock) return clock;
  let last = Number.NEGATIVE_INFINITY;
  return () => {
    const now = Date.now();
    const next = Math.max(now, last + 1);
    last = next;
    return new Date(next).toISOString();
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function assertExactSourceHashKeys(
  value: MeasurementCellSourceHashesV1,
  expected: readonly (keyof MeasurementCellSourceHashesV1)[],
  cellId: string,
): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`measurement source reader for ${cellId} must return a plain object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`measurement source reader fields differ for ${cellId}`);
  }
}

async function readSourceBindings(
  input: RunMeasurementValidityV1Input,
  cells: readonly MeasurementValidityResultCellV1[],
  design: Readonly<MeasurementValidityDesignV1>,
  freeze: Readonly<MeasurementValidityFreezeV1>,
) {
  const registeredById = new Map(freeze.registeredCells.map(cell => [cell.cellId, cell]));
  const bindings = [];
  for (const resultCell of cells) {
    const cell = registeredById.get(resultCell.cellId);
    if (!cell) throw new Error(`measurement result cell ${resultCell.cellId} is not registered`);
    const hashes = await input.readCellSourceHashes({
      cell: clone(cell),
      resultCell: clone(resultCell),
      design: clone(design),
      freeze: clone(freeze),
    });
    if (resultCell.status === "valid" && resultCell.instrumentKind === "final_outcome") {
      assertExactSourceHashKeys(hashes, ["taskManifestHash", "rawArtifactHash", "finalOutcomeHash"], resultCell.cellId);
    } else if (resultCell.status === "valid" && resultCell.instrumentKind === "in_process_explicit") {
      assertExactSourceHashKeys(hashes, ["taskManifestHash", "rawArtifactHash", "interactionTraceHash"], resultCell.cellId);
    } else if (resultCell.status === "invalid_response") {
      assertExactSourceHashKeys(hashes, ["taskManifestHash", "rawArtifactHash"], resultCell.cellId);
    } else {
      assertExactSourceHashKeys(hashes, [], resultCell.cellId);
    }
    bindings.push({ cellId: resultCell.cellId, hashes: clone(hashes) });
  }
  return bindings;
}

function validatePersistedAuthorities(
  design: MeasurementValidityDesignV1,
  freeze: MeasurementValidityFreezeV1,
  taskBankContentHash: string,
): void {
  validateMeasurementValidityDesignV1(design);
  validateMeasurementValidityFreezeV1(freeze);
  validateFreezeAgainstDesignV1(freeze, design);
  validateFreezeTaskBankBindingV1(freeze, taskBankContentHash);
}

/**
 * Execute every preregistered measurement cell exactly once and seal the
 * experiment-level result index, or reuse one explicitly identified index.
 */
export async function runMeasurementValidityV1(
  input: RunMeasurementValidityV1Input,
): Promise<RunMeasurementValidityV1Result> {
  // Full preflight is intentionally completed before persistence and before
  // the provider-capable callback becomes reachable.
  validateMeasurementValidityDesignV1(input.design);
  validateMeasurementValidityDesignAgainstAdmissionV1(
    input.design,
    [...input.admittedTaskDefinitionHashes],
  );
  validateMeasurementValidityFreezeV1(input.freeze);
  validateFreezeAgainstDesignV1(input.freeze, input.design);
  validateFreezeTaskBankBindingV1(input.freeze, input.taskBankContentHash);

  if (
    input.design.measurementRole === "sealed_measurement_heldout"
    && input.allowSealedHeldout !== true
  ) {
    throw new Error("sealed_measurement_heldout_requires_explicit_authorization");
  }

  const persistedDesign = loadOrCreateMeasurementValidityDesignV1({
    outputDir: input.outputDir,
    designRef: input.design.designRef,
    contentHash: input.design.contentHash,
    expectedContentHash: input.design.contentHash,
    createDesign: () => clone(input.design),
  });
  const persistedFreeze = loadOrCreateMeasurementValidityFreezeV1({
    outputDir: input.outputDir,
    freezeRef: input.freeze.freezeRef,
    contentHash: input.freeze.contentHash,
    expectedContentHash: input.freeze.contentHash,
    createFreeze: () => clone(input.freeze),
  });

  validatePersistedAuthorities(
    persistedDesign as MeasurementValidityDesignV1,
    persistedFreeze as MeasurementValidityFreezeV1,
    input.taskBankContentHash,
  );

  if (input.expectedExistingResultIndexContentHash !== undefined) {
    const existing = readMeasurementValidityResultIndexV1({
      outputDir: input.outputDir,
      resultIndexRef: input.resultIndexRef,
      contentHash: input.expectedExistingResultIndexContentHash,
    });
    if (!existing) {
      throw new Error("expected measurement result index does not exist");
    }
    validateResultIndexAgainstFreezeV1(
      existing,
      persistedFreeze as MeasurementValidityFreezeV1,
    );
    validateMeasurementValidityResultIndexAgainstSourcesV1(
      existing,
      await readSourceBindings(input, existing.cells, persistedDesign, persistedFreeze),
    );
    return {
      design: clone(persistedDesign),
      freeze: clone(persistedFreeze),
      resultIndex: clone(existing),
      reused: true,
      executedCellCount: 0,
    };
  }

  const runnerClock = createRunnerClock(input.clock);
  const freezeAt = assertCanonicalTimestamp(
    persistedFreeze.createdAt,
    "measurement freeze createdAt",
  );
  let lastRunnerTimestamp = freezeAt;
  const resultCells: MeasurementValidityResultCellV1[] = [];
  const runIds = new Set<string>();

  for (const registeredCell of persistedFreeze.registeredCells) {
    const firstProviderAt = runnerClock();
    const firstProviderMillis = assertCanonicalTimestamp(
      firstProviderAt,
      `measurement cell ${registeredCell.cellId} firstProviderAt`,
    );
    if (firstProviderMillis <= lastRunnerTimestamp) {
      throw new Error("measurement runner clock must advance before each provider call");
    }
    lastRunnerTimestamp = firstProviderMillis;

    const context: MeasurementCellExecutionContextV1 = {
      cell: clone(registeredCell),
      design: clone(persistedDesign),
      freeze: clone(persistedFreeze),
      firstProviderAt,
    };
    const outcome = clone(await input.executeCell(context));

    const terminalAt = runnerClock();
    const terminalMillis = assertCanonicalTimestamp(
      terminalAt,
      `measurement cell ${registeredCell.cellId} terminalAt`,
    );
    if (terminalMillis <= lastRunnerTimestamp) {
      throw new Error("measurement runner clock must advance at terminal recording");
    }
    lastRunnerTimestamp = terminalMillis;

    if (outcome.status === "valid" && outcome.instrumentKind !== persistedDesign.instrumentKind) {
      throw new Error("measurement cell outcome instrumentKind differs from the frozen design");
    }
    if (typeof outcome.runId !== "string" || outcome.runId.trim().length === 0) {
      throw new Error("measurement cell outcome runId must be non-empty");
    }
    if (runIds.has(outcome.runId)) {
      throw new Error("measurement cell outcome runId must be globally unique");
    }
    runIds.add(outcome.runId);

    // Spreading the cloned outcome is deliberate: unexpected/hostile fields
    // survive into the core exact-key validator and therefore fail closed.
    resultCells.push({
      ...outcome,
      cellId: registeredCell.cellId,
      firstProviderAt,
      terminalAt,
    } as MeasurementValidityResultCellV1);
  }

  const sealedAt = runnerClock();
  const sealedMillis = assertCanonicalTimestamp(sealedAt, "measurement result sealedAt");
  if (sealedMillis <= lastRunnerTimestamp) {
    throw new Error("measurement runner clock must advance before sealing");
  }

  const candidate = createMeasurementValidityResultIndexV1({
    resultIndexRef: clone(input.resultIndexRef),
    designRef: clone(persistedDesign.designRef),
    designContentHash: persistedDesign.contentHash,
    freezeRef: clone(persistedFreeze.freezeRef),
    freezeContentHash: persistedFreeze.contentHash,
    registeredCellCount: persistedFreeze.registeredCells.length,
    cells: resultCells,
    sealedAt,
  });
  validateResultIndexAgainstFreezeV1(
    candidate as MeasurementValidityResultIndexV1,
    persistedFreeze as MeasurementValidityFreezeV1,
  );
  validateMeasurementValidityResultIndexAgainstSourcesV1(
    candidate as MeasurementValidityResultIndexV1,
    await readSourceBindings(input, candidate.cells, persistedDesign, persistedFreeze),
  );

  const persistedResult = loadOrCreateMeasurementValidityResultIndexV1({
    outputDir: input.outputDir,
    resultIndexRef: input.resultIndexRef,
    contentHash: candidate.contentHash,
    expectedContentHash: candidate.contentHash,
    createIndex: () => clone(candidate) as MeasurementValidityResultIndexV1,
  });
  validateResultIndexAgainstFreezeV1(
    persistedResult as MeasurementValidityResultIndexV1,
    persistedFreeze as MeasurementValidityFreezeV1,
  );
  validateMeasurementValidityResultIndexAgainstSourcesV1(
    persistedResult as MeasurementValidityResultIndexV1,
    await readSourceBindings(input, persistedResult.cells, persistedDesign, persistedFreeze),
  );

  return {
    design: clone(persistedDesign),
    freeze: clone(persistedFreeze),
    resultIndex: clone(persistedResult),
    reused: false,
    executedCellCount: persistedFreeze.registeredCells.length,
  };
}
