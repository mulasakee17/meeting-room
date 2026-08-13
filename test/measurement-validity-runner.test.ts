import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1,
  createMeasurementValidityDesignV1,
  createMeasurementValidityFreezeV1,
  deriveMeasurementApplicableMetricsV1,
  readMeasurementValidityDesignV1,
  readMeasurementValidityFreezeV1,
  resolveMeasurementValidityResultIndexV1Path,
  validateMeasurementValidityResultIndexAgainstSourcesV1,
  type MeasurementValidityDesignV1,
  type MeasurementValidityFreezeV1,
} from "../experiments/campaign/measurement/measurementValidity";
import {
  runMeasurementValidityV1,
  type MeasurementCellExecutionOutcomeV1,
  type MeasurementCellSourceReadContextV1,
} from "../experiments/campaign/measurement/measurementValidityRunner";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mv-runner-"));
  tempDirs.push(dir);
  return dir;
}

const H = (hex: string) => `sha256:${hex.repeat(64)}`;
const ASSIGNED_AT = "2026-08-10T00:00:00.000Z";
const FREEZE_AT = "2026-08-11T00:00:00.000Z";
const BOUNDARY_AT = "2026-08-12T00:00:00.000Z";
const REVIEW = {
  status: "accepted" as const,
  reviewProtocolRef: { id: "review:v1", version: "1.0.0" },
  reviewedAt: ASSIGNED_AT,
};
const RESULT_REF = { id: "swarmalpha.measurement.result.v1", version: "1.0.0" };

function makeDesign(overrides: Partial<MeasurementValidityDesignV1> = {}): MeasurementValidityDesignV1 {
  return createMeasurementValidityDesignV1({
    designRef: { id: "swarmalpha.measurement.design.runner", version: "1.0.0" },
    instrumentKind: "in_process_explicit",
    measurementRole: "measurement_development",
    beliefKind: "categorical",
    claimOptionCount: 3,
    taskFamilyRef: { id: "task-family:v1", version: "1.0.0" },
    modelRef: { id: "model:test", version: "1.0.0" },
    invocationConfigHash: H("a"),
    promptRef: { id: "prompt:test", version: "1.0.0" },
    baseSemanticTasks: [{
      sourceTaskRef: { id: "task:1", version: "1.0.0" },
      taskDefinitionHash: H("b"),
      leakageGroupId: "lg:1",
      semanticReview: REVIEW,
    }],
    variants: [
      {
        variantId: "variant:paraphrase",
        baseSemanticTaskRef: { id: "task:1", version: "1.0.0" },
        variantTaskDefinitionHash: H("c"),
        condition: "semantic_paraphrase",
        semanticReview: REVIEW,
      },
      {
        variantId: "variant:permutation",
        baseSemanticTaskRef: { id: "task:1", version: "1.0.0" },
        variantTaskDefinitionHash: H("d"),
        condition: "option_permutation",
        optionMap: { A: "A", B: "B", C: "C" },
        semanticReview: REVIEW,
      },
    ],
    evidenceLadders: [],
    registeredCells: [
      { cellId: "cell:1", blockKey: "block:1", variantId: "variant:paraphrase", replicateIndex: 0, conditionAssignedAt: ASSIGNED_AT },
      { cellId: "cell:2", blockKey: "block:1", variantId: "variant:permutation", replicateIndex: 0, conditionAssignedAt: ASSIGNED_AT },
    ],
    clusterUnit: "base_task",
    bootstrapCount: MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1.bootstrapCount,
    bootstrapSeed: "runner-seed",
    bootstrapVersion: "1.0.0",
    missingnessPolicy: { policyRef: { id: "missingness:v1", version: "1.0.0" }, retryPolicy: "none" },
    baselineSelectionRule: "development-frozen-baseline",
    firstProviderAtBoundary: BOUNDARY_AT,
    createdAt: ASSIGNED_AT,
    ...overrides,
  });
}

function makeFreeze(design: MeasurementValidityDesignV1): MeasurementValidityFreezeV1 {
  return createMeasurementValidityFreezeV1({
    freezeRef: { id: `${design.designRef.id}:freeze`, version: "1.0.0" },
    designRef: design.designRef,
    designContentHash: design.contentHash,
    instrumentKind: design.instrumentKind,
    measurementRole: design.measurementRole,
    beliefKind: design.beliefKind,
    claimOptionCount: design.claimOptionCount,
    taskBankRef: { id: "task-bank:v1", version: "1.0.0" },
    taskBankContentHash: H("e"),
    registeredCells: design.registeredCells,
    registeredPairCount: 1,
    bootstrap: { clusterUnit: design.clusterUnit, count: design.bootstrapCount, seed: design.bootstrapSeed, version: design.bootstrapVersion },
    thresholds: MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1,
    applicableMetrics: deriveMeasurementApplicableMetricsV1(design),
    baselineRef: { id: "baseline:v1", version: "1.0.0" },
    createdAt: FREEZE_AT,
  });
}

function admitted(design: MeasurementValidityDesignV1): string[] {
  return [
    ...design.baseSemanticTasks.map(task => task.taskDefinitionHash),
    ...design.variants.map(variant => variant.variantTaskDefinitionHash),
  ];
}

function clockFrom(values: string[]): () => string {
  let index = 0;
  return () => {
    const value = values[index++];
    if (!value) throw new Error("test clock exhausted");
    return value;
  };
}

function timestamps(count: number): string[] {
  const start = Date.parse("2026-08-12T00:00:00.001Z");
  return Array.from({ length: count }, (_, i) => new Date(start + i).toISOString());
}

function validOutcome(runId: string, kind: "final_outcome" | "in_process_explicit" = "in_process_explicit"): MeasurementCellExecutionOutcomeV1 {
  const base = { status: "valid" as const, instrumentKind: kind, runId, taskManifestHash: H("f"), rawArtifactHash: H("1") };
  return kind === "final_outcome"
    ? { ...base, instrumentKind: "final_outcome", finalOutcomeHash: H("2") }
    : { ...base, instrumentKind: "in_process_explicit", interactionTraceHash: H("3") };
}

function runnerInput(
  outputDir: string,
  design: MeasurementValidityDesignV1,
  freeze: MeasurementValidityFreezeV1,
  executeCell: (context: Parameters<Parameters<typeof runMeasurementValidityV1>[0]["executeCell"]>[0]) => Promise<MeasurementCellExecutionOutcomeV1>,
) {
  return {
    outputDir,
    design,
    freeze,
    taskBankContentHash: freeze.taskBankContentHash,
    admittedTaskDefinitionHashes: admitted(design),
    resultIndexRef: RESULT_REF,
    executeCell,
    readCellSourceHashes: async ({ resultCell }: MeasurementCellSourceReadContextV1) => {
      if (resultCell.status === "valid" && resultCell.instrumentKind === "final_outcome") {
        return { taskManifestHash: resultCell.taskManifestHash, rawArtifactHash: resultCell.rawArtifactHash, finalOutcomeHash: resultCell.finalOutcomeHash };
      }
      if (resultCell.status === "valid" && resultCell.instrumentKind === "in_process_explicit") {
        return { taskManifestHash: resultCell.taskManifestHash, rawArtifactHash: resultCell.rawArtifactHash, interactionTraceHash: resultCell.interactionTraceHash };
      }
      if (resultCell.status === "invalid_response") {
        return { taskManifestHash: resultCell.taskManifestHash, rawArtifactHash: resultCell.rawArtifactHash };
      }
      return {};
    },
    clock: clockFrom(timestamps(design.registeredCells.length * 2 + 1)),
  };
}

describe("measurement validity runner v1", () => {
  it.each(["in_process_explicit", "final_outcome"] as const)("seals a valid %s chain", async instrumentKind => {
    const outputDir = tmpDir();
    const design = makeDesign({ instrumentKind });
    const freeze = makeFreeze(design);
    const result = await runMeasurementValidityV1(runnerInput(
      outputDir,
      design,
      freeze,
      async ({ cell }) => validOutcome(`run:${cell.cellId}`, instrumentKind),
    ));
    expect(result.reused).toBe(false);
    expect(result.executedCellCount).toBe(2);
    expect(result.resultIndex.cells.map(cell => cell.cellId)).toEqual(["cell:1", "cell:2"]);
    expect(readMeasurementValidityDesignV1({ outputDir, designRef: design.designRef, contentHash: design.contentHash })).not.toBeNull();
    expect(readMeasurementValidityFreezeV1({ outputDir, freezeRef: freeze.freezeRef, contentHash: freeze.contentHash })).not.toBeNull();
  });

  it("preserves mixed terminal outcomes in the registered denominator", async () => {
    const outputDir = tmpDir();
    const base = makeDesign();
    const design = makeDesign({
      registeredCells: [
        ...base.registeredCells,
        { cellId: "cell:3", blockKey: "block:2", variantId: "variant:paraphrase", replicateIndex: 0, conditionAssignedAt: ASSIGNED_AT },
      ],
    });
    const freeze = makeFreeze(design);
    const outcomes: MeasurementCellExecutionOutcomeV1[] = [
      validOutcome("run:valid"),
      { status: "invalid_response", runId: "run:invalid", taskManifestHash: H("4"), rawArtifactHash: H("5") },
      { status: "provider_error", runId: "run:error", absentFields: ["rawArtifactHash"], reason: "provider failed" },
    ];
    const result = await runMeasurementValidityV1(runnerInput(outputDir, design, freeze, async () => outcomes.shift()!));
    expect(result.resultIndex.registeredCellCount).toBe(3);
    expect(result.resultIndex.cells.map(cell => cell.status)).toEqual(["valid", "invalid_response", "provider_error"]);
  });

  it("persists authorities before callbacks, follows frozen order, and isolates callback mutations", async () => {
    const outputDir = tmpDir();
    const design = makeDesign();
    const freeze = makeFreeze(design);
    const order: string[] = [];
    const result = await runMeasurementValidityV1(runnerInput(outputDir, design, freeze, async context => {
      expect(readMeasurementValidityDesignV1({ outputDir, designRef: design.designRef, contentHash: design.contentHash })).not.toBeNull();
      expect(readMeasurementValidityFreezeV1({ outputDir, freezeRef: freeze.freezeRef, contentHash: freeze.contentHash })).not.toBeNull();
      order.push(context.cell.cellId);
      (context.design.baseSemanticTasks[0] as { leakageGroupId: string }).leakageGroupId = "mutated";
      return validOutcome(`run:${context.cell.cellId}`);
    }));
    expect(order).toEqual(freeze.registeredCells.map(cell => cell.cellId));
    expect(result.design.baseSemanticTasks[0].leakageGroupId).toBe("lg:1");
    expect(readMeasurementValidityDesignV1({ outputDir, designRef: design.designRef, contentHash: design.contentHash })!.baseSemanticTasks[0].leakageGroupId).toBe("lg:1");
  });

  it("rejects every preflight failure before callback reachability", async () => {
    const outputDir = tmpDir();
    const design = makeDesign();
    const freeze = makeFreeze(design);
    const callback = vi.fn(async () => validOutcome("run:never"));
    const malformed = structuredClone(design);
    malformed.contentHash = H("9");
    await expect(runMeasurementValidityV1(runnerInput(outputDir, malformed, freeze, callback))).rejects.toThrow();
    await expect(runMeasurementValidityV1({ ...runnerInput(outputDir, design, freeze, callback), admittedTaskDefinitionHashes: [H("b")] })).rejects.toThrow(/not admitted/);
    const otherDesign = makeDesign({ modelRef: { id: "model:other", version: "1.0.0" } });
    const otherFreeze = makeFreeze(otherDesign);
    await expect(runMeasurementValidityV1(runnerInput(outputDir, design, otherFreeze, callback))).rejects.toThrow(/bind|identity|differ/i);
    await expect(runMeasurementValidityV1({ ...runnerInput(outputDir, design, freeze, callback), taskBankContentHash: H("0") })).rejects.toThrow(/task-bank/);
    expect(callback).toHaveBeenCalledTimes(0);
  });

  it("rejects sealed held-out by default and permits only explicit mock authorization", async () => {
    const outputDir = tmpDir();
    const design = makeDesign({ measurementRole: "sealed_measurement_heldout" });
    const freeze = makeFreeze(design);
    const callback = vi.fn(async ({ cell }) => validOutcome(`run:${cell.cellId}`));
    await expect(runMeasurementValidityV1(runnerInput(outputDir, design, freeze, callback))).rejects.toThrow(/sealed_measurement_heldout_requires_explicit_authorization/);
    expect(callback).toHaveBeenCalledTimes(0);
    await expect(runMeasurementValidityV1({ ...runnerInput(outputDir, design, freeze, callback), allowSealedHeldout: true })).resolves.toMatchObject({ reused: false, executedCellCount: 2 });
  });

  it("propagates callback errors and does not seal a result index", async () => {
    const outputDir = tmpDir();
    const design = makeDesign();
    const freeze = makeFreeze(design);
    await expect(runMeasurementValidityV1(runnerInput(outputDir, design, freeze, async () => { throw new Error("executor exploded"); }))).rejects.toThrow(/executor exploded/);
    expect(fs.readdirSync(outputDir).some(file => file.endsWith("measurement-result-index.v1.json"))).toBe(false);
  });

  it.each([
    ["duplicate run ids", async () => validOutcome("run:duplicate"), /globally unique/],
    ["wrong instrument kind", async ({ cell }: { cell: { cellId: string } }) => validOutcome(`run:${cell.cellId}`, "final_outcome"), /instrumentKind/],
  ])("does not seal on %s", async (_label, executor, error) => {
    const outputDir = tmpDir();
    const design = makeDesign();
    const freeze = makeFreeze(design);
    await expect(runMeasurementValidityV1(runnerInput(outputDir, design, freeze, executor as never))).rejects.toThrow(error as RegExp);
    expect(fs.readdirSync(outputDir).some(file => file.endsWith("measurement-result-index.v1.json"))).toBe(false);
  });

  it("rejects hostile source hashes on a failure outcome", async () => {
    const outputDir = tmpDir();
    const design = makeDesign();
    const freeze = makeFreeze(design);
    await expect(runMeasurementValidityV1(runnerInput(outputDir, design, freeze, async ({ cell }) => ({
      status: "provider_error",
      runId: `run:hostile:${cell.cellId}`,
      absentFields: ["rawArtifactHash"],
      reason: "failed",
      rawArtifactHash: H("6"),
    } as unknown as MeasurementCellExecutionOutcomeV1)))).rejects.toThrow(/fields differ/);
    expect(fs.readdirSync(outputDir).some(file => file.endsWith("measurement-result-index.v1.json"))).toBe(false);
  });

  it("fails closed on non-advancing or pre-freeze clocks", async () => {
    const outputDir = tmpDir();
    const design = makeDesign();
    const freeze = makeFreeze(design);
    const callback = vi.fn(async ({ cell }) => validOutcome(`run:${cell.cellId}`));
    await expect(runMeasurementValidityV1({ ...runnerInput(outputDir, design, freeze, callback), clock: () => FREEZE_AT })).rejects.toThrow(/advance/);
    expect(callback).toHaveBeenCalledTimes(0);
    const same = "2026-08-12T00:00:00.001Z";
    await expect(runMeasurementValidityV1({ ...runnerInput(tmpDir(), design, freeze, callback), clock: clockFrom([same, same]) })).rejects.toThrow(/advance/);
  });

  it("reuses only the exact identified result index without executing cells", async () => {
    const outputDir = tmpDir();
    const design = makeDesign();
    const freeze = makeFreeze(design);
    const first = await runMeasurementValidityV1(runnerInput(outputDir, design, freeze, async ({ cell }) => validOutcome(`run:${cell.cellId}`)));
    const callback = vi.fn(async () => validOutcome("run:never"));
    const reused = await runMeasurementValidityV1({
      ...runnerInput(outputDir, design, freeze, callback),
      expectedExistingResultIndexContentHash: first.resultIndex.contentHash,
    });
    expect(reused).toMatchObject({ reused: true, executedCellCount: 0 });
    expect(callback).toHaveBeenCalledTimes(0);
  });

  it("fails exact retry on missing or cross-freeze identity without executing cells", async () => {
    const outputDir = tmpDir();
    const design = makeDesign();
    const freeze = makeFreeze(design);
    const first = await runMeasurementValidityV1(runnerInput(outputDir, design, freeze, async ({ cell }) => validOutcome(`run:${cell.cellId}`)));
    const callback = vi.fn(async () => validOutcome("run:never"));
    await expect(runMeasurementValidityV1({
      ...runnerInput(outputDir, design, freeze, callback),
      expectedExistingResultIndexContentHash: H("0"),
    })).rejects.toThrow(/does not exist/);

    const otherDesign = makeDesign({ modelRef: { id: "model:other", version: "1.0.0" } });
    const otherFreeze = makeFreeze(otherDesign);
    await expect(runMeasurementValidityV1({
      ...runnerInput(outputDir, otherDesign, otherFreeze, callback),
      expectedExistingResultIndexContentHash: first.resultIndex.contentHash,
    })).rejects.toThrow(/freeze|design binding/);
    expect(callback).toHaveBeenCalledTimes(0);
  });

  it("keeps source replay fail-closed after a returned index is mutated", async () => {
    const outputDir = tmpDir();
    const design = makeDesign();
    const freeze = makeFreeze(design);
    const result = await runMeasurementValidityV1(runnerInput(outputDir, design, freeze, async ({ cell }) => validOutcome(`run:${cell.cellId}`)));
    const mutated = structuredClone(result.resultIndex);
    const cell = mutated.cells[0];
    if (cell.status !== "valid" || cell.instrumentKind !== "in_process_explicit") throw new Error("fixture mismatch");
    expect(() => validateMeasurementValidityResultIndexAgainstSourcesV1(mutated, [{ cellId: cell.cellId, hashes: { interactionTraceHash: H("0") } }])).toThrow();
    expect(resolveMeasurementValidityResultIndexV1Path(outputDir, RESULT_REF, result.resultIndex.contentHash)).toContain(outputDir);
  });

  it("independently cross-checks persisted source hashes before sealing and on exact retry", async () => {
    const outputDir = tmpDir();
    const design = makeDesign();
    const freeze = makeFreeze(design);
    const wrongReader = vi.fn(async () => ({ taskManifestHash: H("0"), rawArtifactHash: H("0"), interactionTraceHash: H("0") }));
    await expect(runMeasurementValidityV1({
      ...runnerInput(outputDir, design, freeze, async ({ cell }) => validOutcome(`run:${cell.cellId}`)),
      readCellSourceHashes: wrongReader,
    })).rejects.toThrow(/source hashes do not match/);
    expect(fs.readdirSync(outputDir).some(file => file.endsWith("measurement-result-index.v1.json"))).toBe(false);

    const first = await runMeasurementValidityV1(runnerInput(outputDir, design, freeze, async ({ cell }) => validOutcome(`run:${cell.cellId}`)));
    const callback = vi.fn(async () => validOutcome("run:never"));
    await expect(runMeasurementValidityV1({
      ...runnerInput(outputDir, design, freeze, callback),
      readCellSourceHashes: wrongReader,
      expectedExistingResultIndexContentHash: first.resultIndex.contentHash,
    })).rejects.toThrow(/source hashes do not match/);
    expect(callback).toHaveBeenCalledTimes(0);
  });

  it("rejects unused or fabricated fields returned by the independent source reader", async () => {
    const outputDir = tmpDir();
    const design = makeDesign();
    const freeze = makeFreeze(design);
    const outcomes: MeasurementCellExecutionOutcomeV1[] = [
      { status: "provider_error", runId: "run:error", absentFields: ["rawArtifactHash"], reason: "failed" },
      { status: "unavailable", runId: "run:unavailable", absentFields: ["rawArtifactHash"], reason: "unavailable" },
    ];
    await expect(runMeasurementValidityV1({
      ...runnerInput(outputDir, design, freeze, async () => outcomes.shift()!),
      readCellSourceHashes: async () => ({ finalOutcomeHash: H("8") }),
    })).rejects.toThrow(/source reader fields differ/);
    expect(fs.readdirSync(outputDir).some(file => file.endsWith("measurement-result-index.v1.json"))).toBe(false);
  });
});
