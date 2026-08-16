/**
 * Measurement Validity Development Pilot v1 — Study N / Study E execution.
 *
 * Authority layer only: builds the frozen Study N (nuisance) and Study E
 * (controlled evidence) designs/freezes, and wires each registered cell to the
 * existing V6 explicit-belief vertical slice. It FAILS CLOSED until the owner
 * supplies explicit accepted semantic-review decisions; it never self-issues an
 * accepted review, never calls a retrying provider path, and never opens
 * sealed held-out.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { VersionedGovernanceRef } from "../../../src/lib/governance";
import { verifyRawRunData } from "../replayVerifier";
import {
  MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1,
  createMeasurementValidityDesignV1,
  createMeasurementValidityFreezeV1,
  deriveMeasurementApplicableMetricsV1,
  type MeasurementEvidenceLadderV1,
  type MeasurementRegisteredCellV1,
  type MeasurementSemanticReviewV1,
  type MeasurementValidityDesignV1,
  type MeasurementValidityFreezeV1,
  type MeasurementVariantV1,
} from "./measurementValidity";
import {
  runMeasurementValidityV1,
  type MeasurementCellExecutionContextV1,
  type MeasurementCellExecutionOutcomeV1,
  type MeasurementCellSourceHashesV1,
  type MeasurementCellSourceReadContextV1,
  type RunMeasurementValidityV1Result,
} from "./measurementValidityRunner";
import {
  createMeasurementPilotTaskBankV1,
  measurementPilotAdmittedHashesV1,
  measurementPilotTaskBankContentHashV1,
  projectMeasurementPilotVariantV1,
  MEASUREMENT_PILOT_CANDIDATE_ORDER_V1,
  MEASUREMENT_PILOT_REVIEW_PROTOCOL_REF_V1,
  MEASUREMENT_PILOT_REQUIRED_CLUSTERS_V1,
  type MeasurementPilotTaskBankV1,
} from "./measurementPilotTaskBankV1";
import {
  createV6SmokeFixtureFromAdapterV1,
  primarySeedForProtocol,
  type V6SmokeFixtureV1,
  type V6SmokePlannedRun,
} from "../v6/v6BinarySmokeFixture";
import {
  resolveV6AuditableRawRunPath,
  runV6ProductionVerticalSlice,
  type V6CategoricalTaskV1,
  type V6AuditableRawRunData,
} from "../v6/productionVerticalSlice";
import type { V6TaskAdapterV1 } from "../v6/taskAdapters";
import type { V6TaskAuthorityV1 } from "../v6/v6TaskManifest";
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
import {
  HIDDENBENCH_CATEGORICAL_TASK_FAMILY_V1,
  HIDDENBENCH_CATEGORICAL_TASK_SCHEMA_V1,
  HIDDENBENCH_PINNED_DATA_RESOLVER_ID_V1,
  HIDDENBENCH_PINNED_DATA_TASK_ADAPTER_V1,
} from "../v6/hiddenBenchTaskAdapter";

export const MEASUREMENT_PILOT_EXPERIMENT_V1 = Object.freeze({
  id: "swarmalpha.experiment.measurement-pilot-v1",
  version: "1.0.0",
});
export const MEASUREMENT_PILOT_HARD_CAP_PROVIDER_CALLS = 2400;
export const MEASUREMENT_PILOT_HARD_CAP_TOKENS = 3_000_000;

export type MeasurementPilotStudyKind = "nuisance" | "evidence";

export interface MeasurementPilotReviewDecisionV1 {
  variantId: string;
  accepted: true;
  reviewedAt: string;
  note?: string;
}
export type MeasurementPilotReviewDecisionsV1 = ReadonlyArray<MeasurementPilotReviewDecisionV1>;

export interface MeasurementPilotCellPlanV1 extends V6SmokePlannedRun {
  cellId: string;
  clusterId: string;
  variantId: string;
  condition: string;
}

export interface MeasurementPilotStudyPlanV1 {
  studyKind: MeasurementPilotStudyKind;
  design: MeasurementValidityDesignV1;
  freeze: MeasurementValidityFreezeV1;
  resultIndexRef: VersionedGovernanceRef;
  taskBankContentHash: string;
  admittedTaskDefinitionHashes: string[];
  cells: MeasurementPilotCellPlanV1[];
  maxProviderCalls: number;
  maxTotalTokens: number;
}

function canonicalize(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("pilot plan values must be finite");
    return value;
  }
  if (typeof value !== "object") throw new Error("pilot plan values must be JSON data");
  if (ancestors.has(value)) throw new Error("pilot plan values must not contain cycles");
  const next = new Set(ancestors);
  next.add(value);
  if (Array.isArray(value)) return value.map(entry => canonicalize(entry, next));
  const object = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(object).sort().map(key => [key, canonicalize(object[key], next)]));
}
function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
function hashCanonical(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value), "utf8").digest("hex")}`;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Review gate
// ---------------------------------------------------------------------------

function reviewFor(variantId: string, decisions: MeasurementPilotReviewDecisionsV1): MeasurementSemanticReviewV1 {
  const decision = decisions.find(candidate => candidate.variantId === variantId);
  if (!decision || decision.accepted !== true) {
    throw new Error(`measurement pilot semantic review not accepted for ${variantId}; plan build is fail-closed`);
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(decision.reviewedAt)) {
    throw new Error(`measurement pilot reviewedAt must be a canonical ISO timestamp for ${variantId}`);
  }
  return {
    status: "accepted",
    reviewProtocolRef: structuredClone(MEASUREMENT_PILOT_REVIEW_PROTOCOL_REF_V1),
    reviewedAt: decision.reviewedAt,
  };
}

// ---------------------------------------------------------------------------
// Design / freeze builders (fail closed until reviews accepted)
// ---------------------------------------------------------------------------

export interface MeasurementPilotStudyBuildContextV1 {
  bank: MeasurementPilotTaskBankV1;
  decisions: MeasurementPilotReviewDecisionsV1;
  studyKind: MeasurementPilotStudyKind;
  assignedAt: string;
  freezeAt: string;
  firstProviderAtBoundary: string;
  bootstrapSeed: string;
}

interface VariantCellSpecV1 {
  variantId: string;
  cellIdSuffix: string;
  replicateIndex: number;
  conditionAssignedAt: string;
}

function clusterVariantsFor(
  studyKind: MeasurementPilotStudyKind,
  clusterId: string,
  decisions: MeasurementPilotReviewDecisionsV1,
  bank: MeasurementPilotTaskBankV1,
  assignedAt: string,
): { variants: MeasurementVariantV1[]; ladders: MeasurementEvidenceLadderV1[]; cellSpecs: VariantCellSpecV1[] } {
  const cluster = bank.clusters.find(candidate => candidate.clusterId === clusterId);
  if (!cluster) throw new Error(`measurement pilot cluster missing: ${clusterId}`);
  const baseTaskRef = { id: cluster.baseTaskId, version: "1.0.0" };
  const repeatHash = projectMeasurementPilotVariantV1({ bank, clusterId, variantId: `variant:exact-repeat:${clusterId}` }).taskDefinitionHash;

  if (studyKind === "nuisance") {
    const paraphrase = cluster.paraphraseCandidate;
    const permutation = cluster.permutationCandidate;
    if (!paraphrase || !permutation) throw new Error(`measurement pilot nuisance candidates missing for ${clusterId}`);
    const paraphraseHash = projectMeasurementPilotVariantV1({ bank, clusterId, variantId: paraphrase.variantId }).taskDefinitionHash;
    const permutationHash = projectMeasurementPilotVariantV1({ bank, clusterId, variantId: permutation.variantId }).taskDefinitionHash;
    const variants: MeasurementVariantV1[] = [
      { variantId: `variant:exact-repeat:${clusterId}:r0`, baseSemanticTaskRef: structuredClone(baseTaskRef), variantTaskDefinitionHash: repeatHash, condition: "exact_repeat" },
      { variantId: `variant:exact-repeat:${clusterId}:r1`, baseSemanticTaskRef: structuredClone(baseTaskRef), variantTaskDefinitionHash: repeatHash, condition: "exact_repeat" },
      { variantId: paraphrase.variantId, baseSemanticTaskRef: structuredClone(baseTaskRef), variantTaskDefinitionHash: paraphraseHash, condition: "semantic_paraphrase", semanticReview: reviewFor(paraphrase.variantId, decisions) },
      { variantId: permutation.variantId, baseSemanticTaskRef: structuredClone(baseTaskRef), variantTaskDefinitionHash: permutationHash, condition: "option_permutation", optionMap: structuredClone(permutation.optionMap), semanticReview: reviewFor(permutation.variantId, decisions) },
    ];
    const cellSpecs: VariantCellSpecV1[] = [
      { variantId: variants[0].variantId, cellIdSuffix: "exact-repeat-r0", replicateIndex: 0, conditionAssignedAt: assignedAt },
      { variantId: variants[1].variantId, cellIdSuffix: "exact-repeat-r1", replicateIndex: 1, conditionAssignedAt: assignedAt },
      { variantId: variants[2].variantId, cellIdSuffix: "paraphrase-p0", replicateIndex: 0, conditionAssignedAt: assignedAt },
      { variantId: variants[3].variantId, cellIdSuffix: "permutation-o0", replicateIndex: 0, conditionAssignedAt: assignedAt },
    ];
    return { variants, ladders: [], cellSpecs };
  }

  // Study E
  const evidence = cluster.evidenceCandidates;
  const weak = evidence.find(candidate => candidate.level === "weak");
  const medium = evidence.find(candidate => candidate.level === "medium");
  const strong = evidence.find(candidate => candidate.level === "strong");
  const counter = evidence.find(candidate => candidate.level === "counter");
  if (!weak || !medium || !strong || !counter) throw new Error(`measurement pilot evidence candidates missing for ${clusterId}`);
  const designatedTarget = cluster.truth.designatedTargetIsResolution
    ? cluster.truth.correctOption
    : cluster.baseOptions.find(option => option !== cluster.truth.correctOption) ?? cluster.truth.correctOption;
  const ladderId = `ladder:pilot:${clusterId}`;
  const ladder: MeasurementEvidenceLadderV1 = {
    ladderId,
    levels: [
      { level: 1, designatedTarget, payloadHash: hashCanonical({ payload: weak.payload }) },
      { level: 2, designatedTarget, payloadHash: hashCanonical({ payload: medium.payload }) },
      { level: 3, designatedTarget, payloadHash: hashCanonical({ payload: strong.payload }) },
    ],
  };
  const weakHash = projectMeasurementPilotVariantV1({ bank, clusterId, variantId: weak.variantId }).taskDefinitionHash;
  const mediumHash = projectMeasurementPilotVariantV1({ bank, clusterId, variantId: medium.variantId }).taskDefinitionHash;
  const strongHash = projectMeasurementPilotVariantV1({ bank, clusterId, variantId: strong.variantId }).taskDefinitionHash;
  const counterHash = projectMeasurementPilotVariantV1({ bank, clusterId, variantId: counter.variantId }).taskDefinitionHash;
  const variants: MeasurementVariantV1[] = [
    { variantId: weak.variantId, baseSemanticTaskRef: structuredClone(baseTaskRef), variantTaskDefinitionHash: weakHash, condition: "evidence_strength", evidenceLadderId: ladderId },
    { variantId: medium.variantId, baseSemanticTaskRef: structuredClone(baseTaskRef), variantTaskDefinitionHash: mediumHash, condition: "evidence_strength", evidenceLadderId: ladderId },
    { variantId: strong.variantId, baseSemanticTaskRef: structuredClone(baseTaskRef), variantTaskDefinitionHash: strongHash, condition: "evidence_strength", evidenceLadderId: ladderId },
    { variantId: counter.variantId, baseSemanticTaskRef: structuredClone(baseTaskRef), variantTaskDefinitionHash: counterHash, condition: "evidence_direction", evidenceLadderId: ladderId },
  ];
  const cellSpecs: VariantCellSpecV1[] = [
    { variantId: variants[0].variantId, cellIdSuffix: "strength-weak", replicateIndex: 0, conditionAssignedAt: assignedAt },
    { variantId: variants[1].variantId, cellIdSuffix: "strength-medium", replicateIndex: 0, conditionAssignedAt: assignedAt },
    { variantId: variants[2].variantId, cellIdSuffix: "strength-strong", replicateIndex: 0, conditionAssignedAt: assignedAt },
    { variantId: variants[3].variantId, cellIdSuffix: "direction-counter", replicateIndex: 0, conditionAssignedAt: assignedAt },
  ];
  return { variants, ladders: [ladder], cellSpecs };
}

export function buildMeasurementPilotStudyPlanV1(context: MeasurementPilotStudyBuildContextV1): MeasurementPilotStudyPlanV1 {
  if (context.bank.insufficientClusterSupport) {
    throw new Error(`DEFER_INSUFFICIENT_CLUSTER_SUPPORT: ${context.bank.clusterCount} < ${MEASUREMENT_PILOT_REQUIRED_CLUSTERS_V1}`);
  }
  const kind = context.studyKind;
  const suffix = kind === "nuisance" ? "n" : "e";
  const baseSemanticTasks = context.bank.clusters.map(cluster => ({
    sourceTaskRef: { id: cluster.baseTaskId, version: "1.0.0" },
    taskDefinitionHash: cluster.baseTaskDefinitionHash,
    leakageGroupId: `leakage:pilot:${cluster.sourceTaskId}`,
    semanticReview: reviewFor(`variant:exact-repeat:${cluster.clusterId}`, context.decisions),
  }));
  const variants: MeasurementVariantV1[] = [];
  const ladders: MeasurementEvidenceLadderV1[] = [];
  const cellSpecs: VariantCellSpecV1[] = [];
  for (const cluster of context.bank.clusters) {
    const built = clusterVariantsFor(kind, cluster.clusterId, context.decisions, context.bank, context.assignedAt);
    variants.push(...built.variants);
    ladders.push(...built.ladders);
    cellSpecs.push(...built.cellSpecs);
  }
  const registeredCells: MeasurementRegisteredCellV1[] = cellSpecs.map((spec, index) => ({
    cellId: `cell:${suffix}:${index + 1}:${spec.cellIdSuffix}:${context.bank.clusters[Math.floor(index / 4)].clusterId}`,
    blockKey: `block:${suffix}:${context.bank.clusters[Math.floor(index / 4)].clusterId}`,
    variantId: spec.variantId,
    replicateIndex: spec.replicateIndex,
    conditionAssignedAt: spec.conditionAssignedAt,
  }));
  const firstCluster = context.bank.clusters[0];
  const baseProjectionFixture = fixtureForVariant(context.bank, firstCluster.clusterId, `variant:exact-repeat:${firstCluster.clusterId}`);
  const invocationConfigHash = hashCanonical(baseProjectionFixture.discussionContract.agentBindings.map(binding => ({
    agentId: binding.agentId,
    invocationConfig: binding.invocationConfig,
  })));
  const design = createMeasurementValidityDesignV1({
    designRef: { id: `swarmalpha.measurement.design.measurement-pilot-${suffix}-v1`, version: "1.0.0" },
    instrumentKind: "in_process_explicit",
    measurementRole: "measurement_development",
    beliefKind: "categorical",
    claimOptionCount: 3,
    taskFamilyRef: structuredClone(HIDDENBENCH_CATEGORICAL_TASK_FAMILY_V1),
    modelRef: structuredClone(baseProjectionFixture.discussionContract.agentBindings[0].modelRef),
    invocationConfigHash,
    promptRef: { id: baseProjectionFixture.discussionContract.id, version: baseProjectionFixture.discussionContract.version },
    baseSemanticTasks,
    variants,
    evidenceLadders: ladders,
    registeredCells,
    clusterUnit: "leakage_group",
    bootstrapCount: MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1.bootstrapCount,
    bootstrapSeed: context.bootstrapSeed,
    bootstrapVersion: "1.0.0",
    missingnessPolicy: { policyRef: { id: `swarmalpha.missingness.measurement-pilot-${suffix}-v1`, version: "1.0.0" }, retryPolicy: "none" },
    baselineSelectionRule: "development exact-repeat median as nuisance floor; no held-out label used",
    firstProviderAtBoundary: context.firstProviderAtBoundary,
    createdAt: context.assignedAt,
  }) as MeasurementValidityDesignV1;
  const taskBankContentHash = measurementPilotTaskBankContentHashV1(context.bank);
  const freeze = createMeasurementValidityFreezeV1({
    freezeRef: { id: `swarmalpha.measurement.freeze.measurement-pilot-${suffix}-v1`, version: "1.0.0" },
    designRef: design.designRef,
    designContentHash: design.contentHash,
    instrumentKind: design.instrumentKind,
    measurementRole: design.measurementRole,
    beliefKind: design.beliefKind,
    claimOptionCount: design.claimOptionCount,
    taskBankRef: { id: `swarmalpha.task-bank.measurement-pilot-${suffix}-v1`, version: "1.0.0" },
    taskBankContentHash,
    registeredCells,
    registeredPairCount: registeredCells.length,
    bootstrap: { clusterUnit: design.clusterUnit, count: design.bootstrapCount, seed: design.bootstrapSeed, version: design.bootstrapVersion },
    thresholds: MEASUREMENT_VALIDITY_GATE_THRESHOLDS_V1,
    applicableMetrics: deriveMeasurementApplicableMetricsV1(design),
    baselineRef: { id: `swarmalpha.baseline.measurement-pilot-${suffix}-v1`, version: "1.0.0" },
    createdAt: context.freezeAt,
  }) as MeasurementValidityFreezeV1;

  const cells: MeasurementPilotCellPlanV1[] = registeredCells.map((cell, index) => {
    const cluster = context.bank.clusters[Math.floor(index / 4)];
    const spec = cellSpecs[index];
    if (!spec) throw new Error(`measurement pilot cell spec missing at index ${index}`);
    const runId = `run:measurement-pilot-v1:${suffix}:cluster-${cluster.sourceTaskId}:${spec.cellIdSuffix}:${index + 1}`;
    const variant = design.variants.find(candidate => candidate.variantId === cell.variantId);
    if (!variant) throw new Error(`measurement pilot cell references an unregistered variant`);
    return {
      cellId: cell.cellId,
      clusterId: cluster.clusterId,
      variantId: cell.variantId,
      condition: variant.condition,
      runId,
      protocol: "explicit_belief_v1",
      primaryMasterSeed: primarySeedForProtocol(runId, baseProjectionFixture.study, baseProjectionFixture.design, "explicit_belief_v1", baseProjectionFixture.stratum),
      eligibleEventMasterSeed: 0,
      monitoringMasterSeed: index,
      plannedProviderCalls: cluster.baseAgentCount * 3,
      estimatedTokens: cluster.baseAgentCount * 45,
    };
  });

  return deepFreeze(structuredClone({
    studyKind: kind,
    design,
    freeze,
    resultIndexRef: { id: `swarmalpha.measurement.result.measurement-pilot-${suffix}-v1`, version: "1.0.0" },
    taskBankContentHash,
    admittedTaskDefinitionHashes: measurementPilotAdmittedHashesV1(context.bank),
    cells,
    maxProviderCalls: cells.reduce((sum, cell) => sum + cell.plannedProviderCalls, 0),
    maxTotalTokens: MEASUREMENT_PILOT_HARD_CAP_TOKENS,
  }));
}

// ---------------------------------------------------------------------------
// Per-variant V6 fixture + cell execution
// ---------------------------------------------------------------------------

let fixtureCache = new Map<string, V6SmokeFixtureV1<V6CategoricalTaskV1>>();

function fixtureForVariant(
  bank: MeasurementPilotTaskBankV1,
  clusterId: string,
  variantId: string,
): V6SmokeFixtureV1<V6CategoricalTaskV1> {
  const key = `${clusterId}|${variantId}`;
  const cached = fixtureCache.get(key);
  if (cached) return cached;
  const cluster = bank.clusters.find(candidate => candidate.clusterId === clusterId);
  if (!cluster) throw new Error(`measurement pilot cluster missing: ${clusterId}`);
  const projection = projectMeasurementPilotVariantV1({ bank, clusterId, variantId });
  const adapter: V6TaskAdapterV1<V6CategoricalTaskV1> = {
    adapterRef: structuredClone(HIDDENBENCH_PINNED_DATA_TASK_ADAPTER_V1),
    taskFamilyRef: structuredClone(HIDDENBENCH_CATEGORICAL_TASK_FAMILY_V1),
    taskSchemaRef: structuredClone(HIDDENBENCH_CATEGORICAL_TASK_SCHEMA_V1),
    task: projection.task,
    resolution: { kind: "from_task_outcome", resolverId: HIDDENBENCH_PINNED_DATA_RESOLVER_ID_V1 },
  };
  const fixture = createV6SmokeFixtureFromAdapterV1({
    adapter,
    namespace: `measurement-pilot-${cluster.sourceTaskId}-${clusterId}`,
    certaintyLowerBound: 0.7,
    stratum: { taskFamily: "hiddenbench-categorical", taskId: projection.task.id, claimOptionCount: 3, agentCount: projection.task.agents.length },
    evaluationContractRef: { id: "swarmalpha.eval.v6-hiddenbench-categorical", version: "1.0.0" },
    adapterContractNamespace: `measurement-pilot-${cluster.sourceTaskId}`,
    budgetContractRef: { id: "swarmalpha.budget.v6-hiddenbench-engineering", version: "1.0.0" },
    frozenAt: "2026-08-14T00:00:00.000Z",
    clockStartAt: "2026-08-14T00:00:01.000Z",
    discussionMaxTokens: 768,
  });
  fixtureCache.set(key, fixture);
  return fixture;
}

export function clearMeasurementPilotFixtureCacheV1(): void {
  fixtureCache = new Map();
}

function fixtureAuthority(fixture: V6SmokeFixtureV1<V6CategoricalTaskV1>): V6TaskAuthorityV1 {
  return {
    adapterRef: structuredClone(fixture.taskAdapter.adapterRef),
    taskSchemaRef: structuredClone(fixture.taskAdapter.taskSchemaRef),
    resolution: structuredClone(fixture.taskAdapter.resolution),
  };
}

export interface RunMeasurementPilotV1Input {
  study: MeasurementPilotStudyPlanV1;
  outputDir: string;
  invoker: SingleAttemptTextInvoker;
  expectedExistingResultIndexContentHash?: string;
  clock?: () => string;
}

export interface RunMeasurementPilotV1Result extends RunMeasurementValidityV1Result {
  providerCallCount: number;
  providerTokenCount: number;
}

export async function runMeasurementPilotV1(input: RunMeasurementPilotV1Input): Promise<RunMeasurementPilotV1Result> {
  const bank = createMeasurementPilotTaskBankV1();
  if (measurementPilotTaskBankContentHashV1(bank) !== input.study.taskBankContentHash) {
    throw new Error("measurement pilot task bank differs from the frozen plan");
  }
  const budget = new V6ProviderCallBudget(input.study.maxProviderCalls, input.study.maxTotalTokens);
  const adaptersByCluster = new Map<string, ReturnType<typeof createV6Adapters>>();
  const plannedRuns: V6SmokePlannedRun[] = input.study.cells.map(({ cellId: _c, clusterId: _k, variantId: _v, condition: _x, ...run }) => run);
  const blockers = preflightIncompleteRuns(input.outputDir, plannedRuns);
  if (blockers.length > 0) throw new Error(blockers.join("; "));
  const existingRawCount = plannedRuns.filter(run => fs.existsSync(resolveV6AuditableRawRunPath(input.outputDir, run.runId))).length;
  if (input.expectedExistingResultIndexContentHash === undefined && existingRawCount > 0) {
    throw new Error("measurement_pilot_cross_process_resume_forbidden");
  }

  const byCell = new Map(input.study.cells.map(cell => [cell.cellId, cell]));

  const executeCell = async (
    context: MeasurementCellExecutionContextV1,
  ): Promise<MeasurementCellExecutionOutcomeV1> => {
    const cellPlan = byCell.get(context.cell.cellId);
    if (!cellPlan || cellPlan.variantId !== context.cell.variantId) {
      throw new Error("measurement pilot cell differs from the frozen plan");
    }
    const clusterId = cellPlan.clusterId;
    const fixture = fixtureForVariant(bank, clusterId, cellPlan.variantId);
    let adapters = adaptersByCluster.get(clusterId);
    if (!adapters) {
      adapters = createV6Adapters({
        discussionContract: fixture.discussionContract,
        verificationContract: fixture.verificationContract,
        finalContract: fixture.finalContract,
        invoker: createMeteredSingleAttemptInvoker(input.invoker, budget),
      });
      adaptersByCluster.set(clusterId, adapters);
    }
    budget.assertCanStartRun(cellPlan.plannedProviderCalls, cellPlan.estimatedTokens);
    const result = await runV6ProductionVerticalSlice({
      outputDir: input.outputDir,
      runId: cellPlan.runId,
      experimentId: `experiment:${MEASUREMENT_PILOT_EXPERIMENT_V1.id}`,
      seed: 17,
      runIndex: input.study.cells.indexOf(cellPlan),
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
      verificationAdapter: undefined,
      ...(input.clock ? { clock: input.clock } : {}),
    });
    const bytes = fs.readFileSync(result.absolutePath);
    return {
      status: "valid",
      instrumentKind: "in_process_explicit",
      runId: result.artifact.runId,
      taskManifestHash: result.artifact.v6TaskManifest.contentHash,
      rawArtifactHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
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
    const cellPlan = byCell.get(context.cell.cellId);
    if (!cellPlan) throw new Error("measurement pilot cell absent from the frozen plan");
    if (cellPlan.runId !== context.resultCell.runId) throw new Error("measurement pilot runId differs from the frozen plan");
    const file = resolveV6AuditableRawRunPath(input.outputDir, cellPlan.runId);
    if (!fs.existsSync(file)) throw new Error("measurement source V6 artifact is absent");
    const bytes = fs.readFileSync(file);
    const artifact = JSON.parse(bytes.toString("utf8")) as V6AuditableRawRunData;
    const fixture = fixtureForVariant(bank, cellPlan.clusterId, cellPlan.variantId);
    const replay = verifyRawRunData(file, artifact, { governanceRules: [fixture.rule] });
    if (replay.runIssues.length > 0 || replay.governanceAuditStatus !== "sealed_decision_replay_verified") {
      throw new Error(`measurement pilot source V6 replay failed: ${replay.runIssues.map(issue => issue.code).join(",")}`);
    }
    validateV6TaskManifestV1(artifact.v6TaskManifest);
    validateV6TaskManifestOpeningV1(artifact.v6TaskManifest, fixture.task, fixtureAuthority(fixture));
    const persistedManifest = readV6TaskManifestV1({ outputDir: input.outputDir, runId: cellPlan.runId });
    if (!persistedManifest || persistedManifest.manifest.contentHash !== artifact.v6TaskManifest.contentHash) {
      throw new Error("measurement pilot source has no matching no-replace V6 task manifest");
    }
    const projection = projectMeasurementPilotVariantV1({ bank, clusterId: cellPlan.clusterId, variantId: cellPlan.variantId });
    if (artifact.v6TaskManifest.taskDefinitionHash !== projection.taskDefinitionHash) {
      throw new Error("measurement pilot source task definition differs from the frozen variant");
    }
    const common = {
      taskManifestHash: artifact.v6TaskManifest.contentHash,
      rawArtifactHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    };
    return { ...common, interactionTraceHash: artifact.v6InteractionTrace.contentHash };
  };

  const result = await runMeasurementValidityV1({
    outputDir: input.outputDir,
    design: input.study.design,
    freeze: input.study.freeze,
    taskBankContentHash: input.study.taskBankContentHash,
    admittedTaskDefinitionHashes: input.study.admittedTaskDefinitionHashes,
    resultIndexRef: input.study.resultIndexRef,
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

export function defaultMeasurementPilotOutputDirV1(studyKind: MeasurementPilotStudyKind): string {
  const suffix = studyKind === "nuisance" ? "n" : "e";
  return path.resolve(process.cwd(), `experiments/campaign/pilot_output/measurement-validity-${suffix}-v1-20260814`);
}

export function measurementPilotPlanJsonPathV1(): string {
  return path.resolve(process.cwd(), "experiments/campaign/measurement/measurement_validity_pilot_v1.plan.json");
}

export function writeMeasurementPilotPlanJsonV1(plans: { nuisance: MeasurementPilotStudyPlanV1; evidence: MeasurementPilotStudyPlanV1 }): { contentHash: string; wrote: boolean } {
  const file = measurementPilotPlanJsonPathV1();
  const body = {
    experimentRef: structuredClone(MEASUREMENT_PILOT_EXPERIMENT_V1),
    candidateOrder: [...MEASUREMENT_PILOT_CANDIDATE_ORDER_V1],
    nuisance: { designContentHash: plans.nuisance.design.contentHash, freezeContentHash: plans.nuisance.freeze.contentHash, resultIndexRef: plans.nuisance.resultIndexRef, cellCount: plans.nuisance.cells.length, maxProviderCalls: plans.nuisance.maxProviderCalls },
    evidence: { designContentHash: plans.evidence.design.contentHash, freezeContentHash: plans.evidence.freeze.contentHash, resultIndexRef: plans.evidence.resultIndexRef, cellCount: plans.evidence.cells.length, maxProviderCalls: plans.evidence.maxProviderCalls },
    maxProviderCalls: MEASUREMENT_PILOT_HARD_CAP_PROVIDER_CALLS,
    maxTotalTokens: MEASUREMENT_PILOT_HARD_CAP_TOKENS,
  };
  const contentHash = hashCanonical(body);
  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file, "utf8")) as { contentHash: string };
    if (existing.contentHash !== contentHash) {
      throw new Error("measurement pilot plan no-replace conflict");
    }
    return { contentHash, wrote: false };
  }
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temporary, `${JSON.stringify({ ...body, contentHash }, null, 2)}\n`, "utf8");
  try {
    fs.linkSync(temporary, file);
    fs.unlinkSync(temporary);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    if (fs.existsSync(file)) return { contentHash, wrote: false };
    throw error;
  }
  return { contentHash, wrote: true };
}
