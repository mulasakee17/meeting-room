/**
 * Minimal V6 -> Measurement Validity development bridge.
 *
 * This is deliberately a wiring-only authority. It executes two exact repeats
 * of the existing explicit-belief V6 vertical slice and binds the persisted
 * schema-5 artifacts into MeasurementValidityResultIndexV1. It does not create
 * paraphrases, evidence ladders, held-out cells, or evidence of measurement
 * validity / governance efficacy.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import {
  computeFinalOutcomeArtifactHashV1,
} from "../../../src/lib/experimentation";
import { governanceRefKey, type VersionedGovernanceRef } from "../../../src/lib/governance";
import { verifyRawRunData } from "../replayVerifier";
import {
  MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1,
  createMeasurementValidityDesignV1,
  createMeasurementValidityFreezeV1,
  deriveMeasurementApplicableMetricsV1,
  type MeasurementRegisteredCellV1,
  type MeasurementValidityDesignV1,
  type MeasurementValidityFreezeV1,
} from "./measurementValidity";
import {
  runMeasurementValidityV1,
  type MeasurementCellExecutionContextV1,
  type MeasurementCellExecutionOutcomeV1,
  type MeasurementCellSourceReadContextV1,
  type MeasurementCellSourceHashesV1,
  type RunMeasurementValidityV1Result,
} from "./measurementValidityRunner";
import {
  createV6BinarySmokeFixture,
  primarySeedForProtocol,
  type V6SmokeFixtureV1,
  type V6SmokePlannedRun,
} from "../v6/v6BinarySmokeFixture";
import {
  resolveV6AuditableRawRunPath,
  runV6ProductionVerticalSlice,
  validateV6InteractionTraceV1,
  type V6AuditableRawRunData,
} from "../v6/productionVerticalSlice";
import {
  createMeteredSingleAttemptInvoker,
  preflightIncompleteRuns,
  V6ProviderCallBudget,
} from "../v6/run_v6_smoke";
import { createV6Adapters, type SingleAttemptTextInvoker } from "../v6/providerAdapters";
import {
  computeV6TaskDefinitionHashV1,
  readV6TaskManifestV1,
  validateV6TaskManifestOpeningV1,
  validateV6TaskManifestV1,
} from "../v6/v6TaskManifest";

export const V6_MEASUREMENT_DEVELOPMENT_PURPOSE = "wiring_only_not_measurement_evidence" as const;
export const V6_MEASUREMENT_DEVELOPMENT_RESULT_REF = Object.freeze({
  id: "swarmalpha.measurement.result.v6-development-wiring",
  version: "1.0.0",
});

export interface V6MeasurementDevelopmentCellPlanV1 extends V6SmokePlannedRun {
  cellId: string;
  variantId: string;
}

export interface V6MeasurementDevelopmentPlanV1 {
  purpose: typeof V6_MEASUREMENT_DEVELOPMENT_PURPOSE;
  design: MeasurementValidityDesignV1;
  freeze: MeasurementValidityFreezeV1;
  resultIndexRef: VersionedGovernanceRef;
  taskBankContentHash: string;
  admittedTaskDefinitionHashes: string[];
  cells: V6MeasurementDevelopmentCellPlanV1[];
  maxProviderCalls: number;
  maxTotalTokens: number;
}

export interface RunV6MeasurementDevelopmentV1Input {
  outputDir: string;
  invoker: SingleAttemptTextInvoker;
  plan?: V6MeasurementDevelopmentPlanV1;
  expectedExistingResultIndexContentHash?: string;
  clock?: () => string;
}

export interface RunV6MeasurementDevelopmentV1Result extends RunMeasurementValidityV1Result {
  providerCallCount: number;
  providerTokenCount: number;
}

function canonicalize(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("development plan values must be finite");
    return value;
  }
  if (typeof value !== "object") throw new Error("development plan values must be JSON data");
  if (ancestors.has(value)) throw new Error("development plan values must not contain cycles");
  const next = new Set(ancestors);
  next.add(value);
  if (Array.isArray(value)) return value.map(entry => canonicalize(entry, next));
  const object = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(object).sort().map(key => [key, canonicalize(object[key], next)]));
}

function hashCanonical(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex")}`;
}

function hashBytes(value: Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function fixtureAuthority(fixture: V6SmokeFixtureV1) {
  return {
    adapterRef: fixture.taskAdapter.adapterRef,
    taskSchemaRef: fixture.taskAdapter.taskSchemaRef,
    resolution: fixture.taskAdapter.resolution,
  };
}

function assertFrozenProviderContract(fixture: V6SmokeFixtureV1, design: MeasurementValidityDesignV1): void {
  const bindings = fixture.discussionContract.agentBindings;
  const modelKeys = new Set(bindings.map(binding => governanceRefKey(binding.modelRef)));
  if (modelKeys.size !== 1 || !modelKeys.has(governanceRefKey(design.modelRef))) {
    throw new Error("measurement development modelRef differs from the V6 discussion contract");
  }
  const actualConfigHash = hashCanonical(bindings.map(binding => ({
    agentId: binding.agentId,
    invocationConfig: binding.invocationConfig,
  })));
  if (actualConfigHash !== design.invocationConfigHash) {
    throw new Error("measurement development invocationConfigHash differs from the V6 discussion contract");
  }
  if (design.promptRef.id !== fixture.discussionContract.id
    || design.promptRef.version !== fixture.discussionContract.version) {
    throw new Error("measurement development promptRef differs from the V6 discussion contract");
  }
}

/** Pure, deterministic development plan; constructing it performs no I/O. */
export function createV6MeasurementDevelopmentPlanV1(): V6MeasurementDevelopmentPlanV1 {
  const fixture = createV6BinarySmokeFixture({
    namespace: "v6-measurement-development",
    certaintyLowerBound: 0.7,
  });
  const taskDefinitionHash = computeV6TaskDefinitionHashV1(fixture.task, fixtureAuthority(fixture));
  const assignedAt = "2026-08-13T00:00:00.000Z";
  const freezeAt = "2026-08-13T00:00:05.000Z";
  const providerBoundary = "2026-08-13T00:00:10.000Z";
  const review = {
    status: "accepted" as const,
    reviewProtocolRef: { id: "swarmalpha.review.exact-identity-wiring-only", version: "1.0.0" },
    reviewedAt: assignedAt,
  };
  const variants = ["a", "b"].map(label => ({
    variantId: `variant:exact-repeat:${label}`,
    baseSemanticTaskRef: { id: fixture.task.id, version: "1.0.0" },
    variantTaskDefinitionHash: taskDefinitionHash,
    condition: "exact_repeat" as const,
  }));
  const registeredCells: MeasurementRegisteredCellV1[] = variants.map((variant, index) => ({
    cellId: `cell:exact-repeat:${index + 1}`,
    blockKey: "block:v6-development-wiring",
    variantId: variant.variantId,
    replicateIndex: 0,
    conditionAssignedAt: assignedAt,
  }));
  const invocationConfigHash = hashCanonical(fixture.discussionContract.agentBindings.map(binding => ({
    agentId: binding.agentId,
    invocationConfig: binding.invocationConfig,
  })));
  const design = createMeasurementValidityDesignV1({
    designRef: { id: "swarmalpha.measurement.design.v6-development-wiring", version: "1.0.0" },
    instrumentKind: "in_process_explicit",
    measurementRole: "measurement_development",
    beliefKind: "binary",
    claimOptionCount: 2,
    taskFamilyRef: fixture.task.taskFamilyRef,
    modelRef: structuredClone(fixture.discussionContract.agentBindings[0].modelRef),
    invocationConfigHash,
    promptRef: { id: fixture.discussionContract.id, version: fixture.discussionContract.version },
    baseSemanticTasks: [{
      sourceTaskRef: { id: fixture.task.id, version: "1.0.0" },
      taskDefinitionHash,
      leakageGroupId: "leakage:v6-development-wiring",
      semanticReview: review,
    }],
    variants,
    evidenceLadders: [],
    registeredCells,
    clusterUnit: "base_task",
    bootstrapCount: MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1.bootstrapCount,
    bootstrapSeed: "v6-development-wiring-only",
    bootstrapVersion: "1.0.0",
    missingnessPolicy: {
      policyRef: { id: "swarmalpha.missingness.v6-development-wiring", version: "1.0.0" },
      retryPolicy: "none",
    },
    baselineSelectionRule: "wiring-only exact repeat; no scientific baseline selection",
    firstProviderAtBoundary: providerBoundary,
    createdAt: assignedAt,
  }) as MeasurementValidityDesignV1;
  const taskBankContentHash = hashCanonical({
    purpose: V6_MEASUREMENT_DEVELOPMENT_PURPOSE,
    taskDefinitionHashes: [taskDefinitionHash],
    semanticReview: review,
  });
  const freeze = createMeasurementValidityFreezeV1({
    freezeRef: { id: "swarmalpha.measurement.freeze.v6-development-wiring", version: "1.0.0" },
    designRef: design.designRef,
    designContentHash: design.contentHash,
    instrumentKind: design.instrumentKind,
    measurementRole: design.measurementRole,
    beliefKind: design.beliefKind,
    claimOptionCount: design.claimOptionCount,
    taskBankRef: { id: "swarmalpha.task-bank.v6-development-wiring", version: "1.0.0" },
    taskBankContentHash,
    registeredCells,
    registeredPairCount: 1,
    bootstrap: {
      clusterUnit: design.clusterUnit,
      count: design.bootstrapCount,
      seed: design.bootstrapSeed,
      version: design.bootstrapVersion,
    },
    thresholds: MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1,
    applicableMetrics: deriveMeasurementApplicableMetricsV1(design),
    baselineRef: { id: "swarmalpha.baseline.v6-development-wiring", version: "1.0.0" },
    createdAt: freezeAt,
  }) as MeasurementValidityFreezeV1;
  const cells: V6MeasurementDevelopmentCellPlanV1[] = registeredCells.map((cell, index) => {
    const runId = `run:v6-measurement-development:exact-repeat:${index + 1}`;
    return {
      cellId: cell.cellId,
      variantId: cell.variantId,
      runId,
      protocol: "explicit_belief_v1",
      primaryMasterSeed: primarySeedForProtocol(
        runId,
        fixture.study,
        fixture.design,
        "explicit_belief_v1",
        fixture.stratum,
      ),
      eligibleEventMasterSeed: 0,
      monitoringMasterSeed: index,
      plannedProviderCalls: fixture.task.agents.length * 3,
      estimatedTokens: fixture.task.agents.length * 45,
    };
  });
  const plan: V6MeasurementDevelopmentPlanV1 = {
    purpose: V6_MEASUREMENT_DEVELOPMENT_PURPOSE,
    design,
    freeze,
    resultIndexRef: structuredClone(V6_MEASUREMENT_DEVELOPMENT_RESULT_REF),
    taskBankContentHash,
    admittedTaskDefinitionHashes: [taskDefinitionHash],
    cells,
    maxProviderCalls: cells.reduce((sum, cell) => sum + cell.plannedProviderCalls, 0),
    maxTotalTokens: 10_000,
  };
  return deepFreeze(structuredClone(plan));
}

function readAndValidateCellArtifact(input: {
  outputDir: string;
  fixture: V6SmokeFixtureV1;
  plan: V6MeasurementDevelopmentPlanV1;
  context: MeasurementCellSourceReadContextV1;
}): { artifact: V6AuditableRawRunData; rawArtifactHash: string } | null {
  const cellPlan = input.plan.cells.find(cell => cell.cellId === input.context.cell.cellId);
  if (!cellPlan || cellPlan.variantId !== input.context.cell.variantId) {
    throw new Error("measurement development cell is absent from the frozen V6 plan");
  }
  if (cellPlan.runId !== input.context.resultCell.runId) {
    throw new Error("measurement development runId differs from the frozen V6 plan");
  }
  const file = resolveV6AuditableRawRunPath(input.outputDir, cellPlan.runId);
  if (!fs.existsSync(file)) return null;
  const bytes = fs.readFileSync(file);
  const artifact = JSON.parse(bytes.toString("utf8")) as V6AuditableRawRunData;
  const replay = verifyRawRunData(file, artifact, { governanceRules: [input.fixture.rule] });
  if (replay.runIssues.length > 0 || replay.governanceAuditStatus !== "sealed_decision_replay_verified") {
    throw new Error(`measurement source V6 replay failed: ${replay.runIssues.map(issue => issue.code).join(",")}`);
  }
  validateV6TaskManifestV1(artifact.v6TaskManifest);
  validateV6TaskManifestOpeningV1(artifact.v6TaskManifest, input.fixture.task, fixtureAuthority(input.fixture));
  const persistedManifest = readV6TaskManifestV1({ outputDir: input.outputDir, runId: cellPlan.runId });
  if (!persistedManifest || persistedManifest.manifest.contentHash !== artifact.v6TaskManifest.contentHash) {
    throw new Error("measurement source has no matching no-replace V6 task manifest");
  }
  const variant = input.plan.design.variants.find(candidate => candidate.variantId === cellPlan.variantId);
  if (!variant || artifact.v6TaskManifest.taskDefinitionHash !== variant.variantTaskDefinitionHash) {
    throw new Error("measurement source task definition differs from the frozen variant");
  }
  if (artifact.primaryArmExecution.implementationConfig.protocol !== "explicit_belief_v1") {
    throw new Error("measurement source did not execute the frozen explicit-belief protocol");
  }
  validateV6InteractionTraceV1(artifact.v6InteractionTrace, {
    task: input.fixture.task,
    primaryAssignmentId: artifact.primaryAssignmentManifest.assignment.id,
    assignedArmRef: artifact.primaryAssignmentManifest.assignment.assignedArmRef,
    protocol: "explicit_belief_v1",
    monitoringDesign: input.fixture.monitoringDesign,
  });
  return { artifact, rawArtifactHash: hashBytes(bytes) };
}

function sourceHashesFromArtifact(
  source: { artifact: V6AuditableRawRunData; rawArtifactHash: string },
  instrumentKind: MeasurementValidityDesignV1["instrumentKind"],
): MeasurementCellSourceHashesV1 {
  const common = {
    taskManifestHash: source.artifact.v6TaskManifest.contentHash,
    rawArtifactHash: source.rawArtifactHash,
  };
  return instrumentKind === "final_outcome"
    ? { ...common, finalOutcomeHash: computeFinalOutcomeArtifactHashV1(source.artifact.finalOutcome) }
    : { ...common, interactionTraceHash: source.artifact.v6InteractionTrace.contentHash };
}

/**
 * Execute or exactly reuse the frozen development chain. New execution refuses
 * all cross-process cell-level resume: any existing raw run requires reuse via
 * an already sealed result-index content hash.
 */
export async function runV6MeasurementDevelopmentV1(
  input: RunV6MeasurementDevelopmentV1Input,
): Promise<RunV6MeasurementDevelopmentV1Result> {
  const plan = input.plan ?? createV6MeasurementDevelopmentPlanV1();
  if (plan.purpose !== V6_MEASUREMENT_DEVELOPMENT_PURPOSE
    || plan.design.measurementRole !== "measurement_development") {
    throw new Error("only the frozen wiring-only development plan is accepted");
  }
  const fixture = createV6BinarySmokeFixture({
    namespace: "v6-measurement-development",
    certaintyLowerBound: 0.7,
  });
  assertFrozenProviderContract(fixture, plan.design);
  const plannedRuns: V6SmokePlannedRun[] = plan.cells.map(({ cellId: _cellId, variantId: _variantId, ...run }) => run);
  const blockers = preflightIncompleteRuns(input.outputDir, plannedRuns);
  if (blockers.length > 0) throw new Error(blockers.join("; "));
  const existingRawCount = plannedRuns.filter(run => fs.existsSync(resolveV6AuditableRawRunPath(input.outputDir, run.runId))).length;
  if (input.expectedExistingResultIndexContentHash === undefined && existingRawCount > 0) {
    throw new Error("measurement_development_cross_process_resume_forbidden");
  }

  const budget = new V6ProviderCallBudget(plan.maxProviderCalls, plan.maxTotalTokens);
  const adapters = createV6Adapters({
    discussionContract: fixture.discussionContract,
    verificationContract: fixture.verificationContract,
    finalContract: fixture.finalContract,
    invoker: createMeteredSingleAttemptInvoker(input.invoker, budget),
  });
  const byCell = new Map(plan.cells.map(cell => [cell.cellId, cell]));

  const executeCell = async (
    context: MeasurementCellExecutionContextV1,
  ): Promise<MeasurementCellExecutionOutcomeV1> => {
    const cellPlan = byCell.get(context.cell.cellId);
    if (!cellPlan || cellPlan.variantId !== context.cell.variantId) {
      throw new Error("measurement development cell differs from the frozen V6 plan");
    }
    if (context.design.contentHash !== plan.design.contentHash
      || context.freeze.contentHash !== plan.freeze.contentHash) {
      throw new Error("measurement development authority differs from the frozen plan");
    }
    budget.assertCanStartRun(cellPlan.plannedProviderCalls, cellPlan.estimatedTokens);
    const result = await runV6ProductionVerticalSlice({
      outputDir: input.outputDir,
      runId: cellPlan.runId,
      experimentId: "experiment:v6-measurement-development-wiring",
      seed: 17,
      runIndex: plan.cells.indexOf(cellPlan),
      study: fixture.study,
      registry: fixture.registry,
      stratum: fixture.stratum,
      primaryMasterSeed: cellPlan.primaryMasterSeed,
      eligibleEventMasterSeed: cellPlan.eligibleEventMasterSeed,
      monitoringMasterSeed: cellPlan.monitoringMasterSeed,
      task: fixture.task,
      taskAuthority: fixtureAuthority(fixture),
      monitoringDesign: fixture.monitoringDesign,
      discussionAdapter: adapters.discussionAdapter,
      finalElicitationAdapter: adapters.finalElicitationAdapter,
      governanceRule: fixture.rule,
      interventionContracts: fixture.interventionContracts,
      verificationAdapter: adapters.verificationAdapter,
      ...(input.clock ? { clock: input.clock } : {}),
    });
    const bytes = fs.readFileSync(result.absolutePath);
    return {
      status: "valid",
      instrumentKind: "in_process_explicit",
      runId: result.artifact.runId,
      taskManifestHash: result.artifact.v6TaskManifest.contentHash,
      rawArtifactHash: hashBytes(bytes),
      interactionTraceHash: result.artifact.v6InteractionTrace.contentHash,
    };
  };

  const readCellSourceHashes = async (
    context: MeasurementCellSourceReadContextV1,
  ): Promise<MeasurementCellSourceHashesV1> => {
    if (context.resultCell.status === "provider_error"
      || context.resultCell.status === "timeout"
      || context.resultCell.status === "unavailable") {
      const file = resolveV6AuditableRawRunPath(input.outputDir, context.resultCell.runId);
      if (fs.existsSync(file)) throw new Error("failure cell unexpectedly has a V6 raw artifact");
      return {};
    }
    const source = readAndValidateCellArtifact({ outputDir: input.outputDir, fixture, plan, context });
    if (!source) throw new Error("measurement source V6 artifact is absent");
    if (context.resultCell.status === "invalid_response") {
      return {
        taskManifestHash: source.artifact.v6TaskManifest.contentHash,
        rawArtifactHash: source.rawArtifactHash,
      };
    }
    if (context.resultCell.status !== "valid") {
      throw new Error("measurement source result status is not supported by the development bridge");
    }
    return sourceHashesFromArtifact(source, context.resultCell.instrumentKind);
  };

  const result = await runMeasurementValidityV1({
    outputDir: input.outputDir,
    design: plan.design,
    freeze: plan.freeze,
    taskBankContentHash: plan.taskBankContentHash,
    admittedTaskDefinitionHashes: plan.admittedTaskDefinitionHashes,
    resultIndexRef: plan.resultIndexRef,
    executeCell,
    readCellSourceHashes,
    ...(input.clock ? { clock: input.clock } : {}),
    ...(input.expectedExistingResultIndexContentHash
      ? { expectedExistingResultIndexContentHash: input.expectedExistingResultIndexContentHash }
      : {}),
  });
  return {
    ...result,
    providerCallCount: budget.callCount,
    providerTokenCount: budget.tokenCount,
  };
}

export function defaultV6MeasurementDevelopmentOutputDir(): string {
  return path.resolve(process.cwd(), "experiments/campaign/pilot_output/v6-measurement-development-wiring");
}
