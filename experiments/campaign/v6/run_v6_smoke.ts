/**
 * v6 binary smoke CLI.
 *
 * Default behavior is a dry-run: it builds and validates the frozen study/task/
 * registry/adapter scaffolding, plans one deterministic T/B/G assignment each,
 * and never touches the network, reads an API key, or creates a raw artifact.
 *
 * `--execute` is the only path that constructs the DeepSeek single-attempt
 * invoker. Dry-run never reads credentials or performs network I/O.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ProviderExecutionHaltError,
  validateGovernanceStudyContract,
  validatePrimaryArmExecutionRegistryV1,
} from "../../../src/lib/experimentation";
import { resolveV6AuditableRawRunPath, runV6ProductionVerticalSlice } from "./productionVerticalSlice";
import { resolveOperationalAnalysisUnitV1Path } from "../../../src/lib/experimentation/operationalAnalysisUnitStore";
import { resolvePrimaryAssignmentManifestV1Path } from "../../../src/lib/experimentation/primaryAssignmentManifestStore";
import { resolvePrimaryArmExecutionBindingV1Path } from "../../../src/lib/experimentation/primaryArmExecutionStore";
import { createV6TaskManifestV1, resolveV6TaskManifestV1Path } from "./v6TaskManifest";
import { createV6Adapters, type SingleAttemptTextInvoker } from "./providerAdapters";
import { createDeepSeekSingleAttemptInvoker } from "./deepseekSingleAttemptInvoker";
import {
  createV6BinarySmokeFixture,
  planV6CalibrationRuns,
  planV6SmokeRuns,
  type V6SmokeFixtureV1,
  type V6SmokePlannedRun,
} from "./v6BinarySmokeFixture";
import type { V6TaskFamilyKey } from "./taskAdapters";
import { createV6HiddenBenchSmokeFixtureV1 } from "./v6HiddenBenchSmokeFixture";
import { validateV6TaskBankAdmissionV1 } from "./taskBank";

export type V6SmokeTaskFamily = V6TaskFamilyKey | "hiddenbench-categorical";

export interface V6SmokeArgs {
  execute: boolean;
  calibration: boolean;
  taskFamily: V6SmokeTaskFamily;
  hiddenBenchTaskId: number | null;
  outputDir: string;
  outputDirSet: boolean;
  maxProviderCalls: number;
  maxProviderCallsSet: boolean;
  maxTotalTokens: number;
}

const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "experiments/campaign/pilot_output/v6-smoke");

function defaultOutputDirFor(
  taskFamily: V6SmokeTaskFamily,
  calibration: boolean,
  hiddenBenchTaskId: number | null,
): string {
  if (taskFamily === "hiddenbench-categorical") {
    return path.resolve(
      process.cwd(),
      `experiments/campaign/pilot_output/v6-hiddenbench-${hiddenBenchTaskId}${calibration ? "-cal" : ""}`,
    );
  }
  const base = taskFamily === "distributed-binary" ? "v6-smoke" : `v6-${taskFamily}`;
  return path.resolve(process.cwd(), `experiments/campaign/pilot_output/${base}${calibration ? "-cal" : ""}`);
}

function runIdPrefixFor(
  taskFamily: V6SmokeTaskFamily,
  calibration: boolean,
  hiddenBenchTaskId: number | null,
): string {
  if (taskFamily === "hiddenbench-categorical") {
    return `run:v6-hiddenbench:${hiddenBenchTaskId}${calibration ? ":cal" : ""}`;
  }
  if (taskFamily === "distributed-binary") return calibration ? "run:v6-cal" : "run:v6-smoke";
  return calibration ? `run:v6-${taskFamily}-cal` : `run:v6-${taskFamily}`;
}

export function parseSmokeArgs(argv: readonly string[]): V6SmokeArgs {
  let execute = false;
  let calibration = false;
  let taskFamily: V6SmokeTaskFamily = "distributed-binary";
  let hiddenBenchTaskId: number | null = null;
  let outputDir = DEFAULT_OUTPUT_DIR;
  let outputDirSet = false;
  let maxProviderCalls = 20;
  let maxProviderCallsSet = false;
  let maxTotalTokens = 100_000;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      execute = false;
    } else if (arg === "--execute") {
      execute = true;
    } else if (arg === "--calibration") {
      calibration = true;
    } else if (arg === "--task-family") {
      const value = argv[++index];
      if (value !== "distributed-binary"
        && value !== "network-fault"
        && value !== "hiddenbench-categorical") {
        throw new Error("--task-family must be one of distributed-binary, network-fault, hiddenbench-categorical");
      }
      taskFamily = value;
    } else if (arg === "--hiddenbench-task-id") {
      const value = Number(argv[++index]);
      if (!Number.isSafeInteger(value) || value < 1 || value > 65) {
        throw new Error("--hiddenbench-task-id must be an integer from 1 to 65");
      }
      hiddenBenchTaskId = value;
    } else if (arg === "--output-dir") {
      const value = argv[++index];
      if (!value || value.trim().length === 0) throw new Error("--output-dir requires a path");
      outputDir = path.resolve(value);
      outputDirSet = true;
    } else if (arg === "--max-provider-calls") {
      const value = Number(argv[++index]);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("--max-provider-calls must be a non-negative safe integer");
      maxProviderCalls = value;
      maxProviderCallsSet = true;
    } else if (arg === "--max-total-tokens") {
      const value = Number(argv[++index]);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("--max-total-tokens must be a non-negative safe integer");
      maxTotalTokens = value;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (taskFamily === "hiddenbench-categorical" && hiddenBenchTaskId === null) {
    throw new Error("--task-family hiddenbench-categorical requires --hiddenbench-task-id");
  }
  if (taskFamily !== "hiddenbench-categorical" && hiddenBenchTaskId !== null) {
    throw new Error("--hiddenbench-task-id is valid only for --task-family hiddenbench-categorical");
  }
  return {
    execute,
    calibration,
    taskFamily,
    hiddenBenchTaskId,
    outputDir,
    outputDirSet,
    maxProviderCalls,
    maxProviderCallsSet,
    maxTotalTokens,
  };
}

/** Actual provider accounting; planned tokens are never treated as observed. */
export class V6ProviderCallBudget {
  private calls = 0;
  private tokens = 0;

  constructor(
    private readonly maxProviderCalls: number,
    private readonly maxTotalTokens: number,
  ) {
    if (!Number.isSafeInteger(maxProviderCalls) || maxProviderCalls < 0) {
      throw new Error("maxProviderCalls must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(maxTotalTokens) || maxTotalTokens < 0) {
      throw new Error("maxTotalTokens must be a non-negative safe integer");
    }
  }

  get callCount(): number {
    return this.calls;
  }

  get tokenCount(): number {
    return this.tokens;
  }

  /** Conservative run gate using call bounds and a non-authoritative estimate. */
  assertCanStartRun(plannedCalls: number, estimatedTokens: number): void {
    if (!Number.isSafeInteger(plannedCalls) || plannedCalls < 0) {
      throw new Error("planned provider calls must be a non-negative safe integer");
    }
    if (!Number.isFinite(estimatedTokens) || estimatedTokens < 0) {
      throw new Error("estimated tokens must be a non-negative finite number");
    }
    if (this.calls + plannedCalls > this.maxProviderCalls) {
      throw new ProviderExecutionHaltError(
        "provider_call_budget_exceeded",
        `used=${this.calls} planned=${plannedCalls} cap=${this.maxProviderCalls}`,
      );
    }
    if (this.tokens + estimatedTokens > this.maxTotalTokens) {
      throw new ProviderExecutionHaltError(
        "token_budget_exceeded",
        `used=${this.tokens} estimated=${estimatedTokens} cap=${this.maxTotalTokens}`,
      );
    }
  }

  beforeProviderCall(): void {
    if (this.calls >= this.maxProviderCalls) {
      throw new ProviderExecutionHaltError(
        "provider_call_budget_exceeded",
        `used=${this.calls} next=1 cap=${this.maxProviderCalls}`,
      );
    }
    if (this.tokens >= this.maxTotalTokens) {
      throw new ProviderExecutionHaltError(
        "token_budget_exceeded",
        `used=${this.tokens} cap=${this.maxTotalTokens}`,
      );
    }
    this.calls += 1;
  }

  recordProviderUsage(usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number }): void {
    if (usage.totalTokens === undefined) {
      throw new ProviderExecutionHaltError(
        "provider_usage_required_for_budget",
        "single-attempt response omitted totalTokens",
      );
    }
    if (!Number.isSafeInteger(usage.totalTokens) || usage.totalTokens < 0
      || (usage.promptTokens !== undefined
        && (!Number.isSafeInteger(usage.promptTokens) || usage.promptTokens < 0))
      || (usage.completionTokens !== undefined
        && (!Number.isSafeInteger(usage.completionTokens) || usage.completionTokens < 0))
      || (usage.promptTokens !== undefined && usage.completionTokens !== undefined
        && usage.totalTokens !== usage.promptTokens + usage.completionTokens)) {
      throw new ProviderExecutionHaltError(
        "provider_usage_invalid_for_budget",
        "provider token usage must be non-negative, integral, and internally consistent",
      );
    }
    this.tokens += usage.totalTokens;
    if (this.tokens > this.maxTotalTokens) {
      throw new ProviderExecutionHaltError(
        "token_budget_exceeded",
        `used=${this.tokens} cap=${this.maxTotalTokens}; the last single attempt caused the bounded overshoot`,
      );
    }
  }
}

export function createMeteredSingleAttemptInvoker(
  delegate: SingleAttemptTextInvoker,
  budget: V6ProviderCallBudget,
): SingleAttemptTextInvoker {
  return {
    async invoke(request, signal) {
      budget.beforeProviderCall();
      const result = await delegate.invoke(request, signal);
      budget.recordProviderUsage(result.usage ?? {});
      return result;
    },
  };
}

/**
 * Fail-closed preflight: if any pre-run artifact (analysis unit, assignment
 * manifest, or arm execution binding) exists for a run without a completed raw
 * run, refuse to continue. No resume, no deletion, no overwrite.
 */
export function preflightIncompleteRuns(
  outputDir: string,
  plannedRuns: readonly V6SmokePlannedRun[],
): string[] {
  const blockers: string[] = [];
  for (const run of plannedRuns) {
    const rawExists = fs.existsSync(resolveV6AuditableRawRunPath(outputDir, run.runId));
    const partialExists = [
      resolveV6TaskManifestV1Path(outputDir, run.runId),
      resolveOperationalAnalysisUnitV1Path(outputDir, run.runId),
      resolvePrimaryAssignmentManifestV1Path(outputDir, run.runId),
      resolvePrimaryArmExecutionBindingV1Path(outputDir, run.runId),
    ].some(exists => fs.existsSync(exists));
    if (!rawExists && partialExists) {
      blockers.push(`incomplete_v6_run_requires_fresh_run_id: ${run.runId}`);
    }
  }
  return blockers;
}

function deterministicV6Clock(startAt: string): () => string {
  const start = Date.parse(startAt);
  if (!Number.isFinite(start) || new Date(start).toISOString() !== startAt) {
    throw new Error("v6 fixture clockStartAt must be a canonical ISO timestamp");
  }
  let tick = 0;
  return () => new Date(start + tick++ * 1000).toISOString();
}

/** Pure pre-provider task-bank admission replay for fixtures that declare one. */
function validateFixtureTaskBankAdmission(
  fixture: V6SmokeFixtureV1,
  plannedRuns: readonly V6SmokePlannedRun[],
): void {
  if (!fixture.taskBankAdmission) return;
  for (const run of plannedRuns) {
    const taskManifest = createV6TaskManifestV1({
      runId: run.runId,
      studyRef: { id: fixture.study.id, version: fixture.study.version },
      task: fixture.task,
      authority: {
        adapterRef: fixture.taskAdapter.adapterRef,
        taskSchemaRef: fixture.taskAdapter.taskSchemaRef,
        resolution: fixture.taskAdapter.resolution,
      },
      monitoringDesignRef: fixture.monitoringDesign.designRef,
      monitoringDesignHash: fixture.monitoringDesign.contentHash,
      committedAt: fixture.clockStartAt,
    });
    validateV6TaskBankAdmissionV1({
      bank: fixture.taskBankAdmission.bank,
      taskManifest,
      requiredSplit: fixture.taskBankAdmission.requiredSplit,
    });
  }
}

function dryRunPlan(
  fixture: V6SmokeFixtureV1,
  outputDir: string,
  plannedRuns: V6SmokePlannedRun[],
): { plannedRuns: V6SmokePlannedRun[]; blockers: string[]; totalCalls: number; totalEstimatedTokens: number } {
  validateGovernanceStudyContract(fixture.study);
  validatePrimaryArmExecutionRegistryV1(fixture.registry, fixture.design);
  validateFixtureTaskBankAdmission(fixture, plannedRuns);
  const blockers = preflightIncompleteRuns(outputDir, plannedRuns);
  return {
    plannedRuns,
    blockers,
    totalCalls: plannedRuns.reduce((sum, run) => sum + run.plannedProviderCalls, 0),
    totalEstimatedTokens: plannedRuns.reduce((sum, run) => sum + run.estimatedTokens, 0),
  };
}

/**
 * The budgeted execution path. It is reachable only with an explicitly supplied
 * SingleAttemptTextInvoker (tests and, later, Codex's safe primitive). The CLI
 * never supplies one today, so `--execute` is blocked.
 */
export async function runV6SmokeExecute(input: {
  outputDir: string;
  fixture: V6SmokeFixtureV1;
  invoker: SingleAttemptTextInvoker;
  maxProviderCalls: number;
  maxTotalTokens: number;
  plannedRuns?: V6SmokePlannedRun[];
  clock?: () => string;
}) {
  const budget = new V6ProviderCallBudget(input.maxProviderCalls, input.maxTotalTokens);
  const plannedRuns = input.plannedRuns ?? planV6SmokeRuns(input.fixture);
  validateFixtureTaskBankAdmission(input.fixture, plannedRuns);
  const blockers = preflightIncompleteRuns(input.outputDir, plannedRuns);
  if (blockers.length > 0) throw new Error(blockers.join("; "));

  const adapters = createV6Adapters({
    discussionContract: input.fixture.discussionContract,
    verificationContract: input.fixture.verificationContract,
    finalContract: input.fixture.finalContract,
    invoker: createMeteredSingleAttemptInvoker(input.invoker, budget),
  });
  const clock = input.clock ?? deterministicV6Clock(input.fixture.clockStartAt);
  const results: Array<{ run: V6SmokePlannedRun; reused: boolean; absolutePath: string }> = [];

  for (const run of plannedRuns) {
    const reused = fs.existsSync(resolveV6AuditableRawRunPath(input.outputDir, run.runId));
    budget.assertCanStartRun(reused ? 0 : run.plannedProviderCalls, reused ? 0 : run.estimatedTokens);
    const result = await runV6ProductionVerticalSlice({
      outputDir: input.outputDir,
      runId: run.runId,
      experimentId: "experiment:v6-smoke",
      seed: 17,
      runIndex: 0,
      study: input.fixture.study,
      registry: input.fixture.registry,
      stratum: input.fixture.stratum,
      primaryMasterSeed: run.primaryMasterSeed,
      eligibleEventMasterSeed: run.eligibleEventMasterSeed,
      monitoringMasterSeed: run.monitoringMasterSeed,
      task: input.fixture.task,
      taskAuthority: {
        adapterRef: input.fixture.taskAdapter.adapterRef,
        taskSchemaRef: input.fixture.taskAdapter.taskSchemaRef,
        resolution: input.fixture.taskAdapter.resolution,
      },
      monitoringDesign: input.fixture.monitoringDesign,
      discussionAdapter: adapters.discussionAdapter,
      finalElicitationAdapter: adapters.finalElicitationAdapter,
      governanceRule: input.fixture.rule,
      interventionContracts: input.fixture.interventionContracts,
      verificationAdapter: adapters.verificationAdapter,
      clock,
    });
    results.push({ run, reused: result.reused, absolutePath: result.absolutePath });
  }
  return { results, budget };
}

export async function main(argv: readonly string[]): Promise<number> {
  const args = parseSmokeArgs(argv);
  if (args.taskFamily === "hiddenbench-categorical" && args.calibration) {
    console.error(
      "hiddenbench_scientific_task_bank_not_admitted: categorical calibration requires frozen semantic review and disjoint calibration/held-out splits",
    );
    return 5;
  }
  const fixture: V6SmokeFixtureV1 = args.taskFamily === "hiddenbench-categorical"
    ? createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: args.hiddenBenchTaskId! })
    : createV6BinarySmokeFixture({
        calibration: args.calibration,
        taskFamily: args.taskFamily,
      });
  const maxProviderCalls = args.maxProviderCallsSet
    ? args.maxProviderCalls
    : (args.taskFamily === "hiddenbench-categorical" ? 40 : args.maxProviderCalls);
  const outputDir = args.outputDirSet
    ? args.outputDir
    : defaultOutputDirFor(args.taskFamily, args.calibration, args.hiddenBenchTaskId);
  const plannedRuns = args.calibration
    ? planV6CalibrationRuns(fixture, 2, runIdPrefixFor(args.taskFamily, true, args.hiddenBenchTaskId))
    : planV6SmokeRuns(fixture, runIdPrefixFor(args.taskFamily, false, args.hiddenBenchTaskId));
  const plan = dryRunPlan(fixture, outputDir, plannedRuns);
  if (plan.totalCalls > maxProviderCalls || plan.totalEstimatedTokens > args.maxTotalTokens) {
    console.error(
      `smoke_plan_budget_exceeded: calls=${plan.totalCalls}/${maxProviderCalls} estimatedTokens=${plan.totalEstimatedTokens}/${args.maxTotalTokens}`,
    );
    return 2;
  }
  if (plan.blockers.length > 0) {
    for (const blocker of plan.blockers) console.error(`  ERROR ${blocker}`);
    return 2;
  }
  if (args.execute) {
    if (args.taskFamily === "network-fault") {
      console.error(
        "task_family_not_admitted_for_execution: network-fault@1.0.0 has a known truth/evidence validity defect; retain it for audit/mock replay only and introduce a new version after redesign",
      );
      return 4;
    }
    if (args.calibration) {
      console.error(
        "calibration_task_bank_not_admitted: --calibration execution requires a frozen task-bank manifest with non-empty, disjoint threshold-calibration and held-out-detector splits",
      );
      return 5;
    }
    if (!process.env.DEEPSEEK_API_KEY) {
      console.error("deepseek_api_key_unavailable: set DEEPSEEK_API_KEY before --execute");
      return 3;
    }
    try {
      const executed = await runV6SmokeExecute({
        outputDir,
        fixture,
        invoker: createDeepSeekSingleAttemptInvoker(),
        maxProviderCalls,
        maxTotalTokens: args.maxTotalTokens,
        plannedRuns,
      });
      console.log(`v6 smoke execute complete: ${executed.results.length} runs, ${executed.budget.callCount} calls, ${executed.budget.tokenCount} tokens`);
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 4;
    }
  }

  console.log("=== v6 smoke dry-run ===");
  for (const run of plan.plannedRuns) {
    console.log(
      `  ${run.runId} -> ${run.protocol} (primarySeed=${run.primaryMasterSeed}, eventSeed=${run.eligibleEventMasterSeed}, up to ${run.plannedProviderCalls} calls, estimated ${run.estimatedTokens} tokens)`,
    );
  }
  console.log(
    `  total planned provider calls: ${plan.totalCalls} (cap ${maxProviderCalls}); estimated tokens: ${plan.totalEstimatedTokens} (cap ${args.maxTotalTokens})`,
  );
  console.log(`  output dir: ${outputDir} (no artifacts created in dry-run)`);
  if (plan.blockers.length > 0) {
    for (const blocker of plan.blockers) console.error(`  ✗ ${blocker}`);
    return 2;
  }
  return 0;
}

function isMainModule(): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(argv1).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  void main(process.argv.slice(2)).then(code => {
    process.exitCode = code;
  }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
