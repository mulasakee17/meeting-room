/**
 * Frozen combined analysis for the original verdict batch plus its randomized
 * continuation. Zero provider calls. No model fitting or post-hoc thresholding.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { mulberry32 } from "../../../src/lib/utils/statsUtils";
import { resolveV6AuditableRawRunPath } from "./productionVerticalSlice";
import { verifyRawRunData } from "../replayVerifier";
import { createV6HiddenBenchSmokeFixtureV1 } from "./v6HiddenBenchSmokeFixture";
import {
  VERDICT_EXPLORATORY_OUTPUT_DIR,
  buildVerdictExploratoryPlan,
  type VerdictExploratoryPlan,
} from "./run_v6_verdict_exploratory";
import { buildRetry1Plan } from "./run_v6_verdict_randomized_continuation_retry1";
import { VERDICT_EXPLORATORY_PROFILE } from "./run_v6_verdict_exploratory";

const RETRY1_ROOTS = Object.freeze([
  path.resolve(process.cwd(), "experiments/campaign/pilot_output/v6-verdict-randomized-continuation-retry1-20260813"),
  path.resolve(process.cwd(), "experiments/campaign/pilot_output/v6-verdict-randomized-continuation-retry1-tail-20260813"),
  path.resolve(process.cwd(), "experiments/campaign/pilot_output/v6-verdict-randomized-continuation-retry1-background-20260813"),
]);

type Arm = "apply" | "sham" | "holdout" | "ineligible";
interface Row {
  batch: "original" | "continuation";
  runId: string;
  taskId: number;
  arm: Arm;
  brier: number | null;
  accuracy: number | null;
  tokens: number;
  invalidOrFailed: number;
}

function armOf(artifact: Record<string, unknown>): Arm {
  const trail = artifact.governanceAuditTrail as Record<string, unknown>;
  const transitions = ((trail.actionTransitions as Array<Record<string, unknown>>) ?? []).map(item => item.to);
  if (transitions.includes("held_out")) return "holdout";
  if (transitions.includes("assigned")) {
    const actionInstance = ((trail.actionInstances as Array<Record<string, unknown>>) ?? [])[0];
    const actionId = (actionInstance?.actionRef as { id?: string } | undefined)?.id;
    return actionId === "swarmalpha.action.verification-attention-sham" ? "sham" : "apply";
  }
  return "ineligible";
}

function load(plan: VerdictExploratoryPlan, roots: readonly string[], batch: Row["batch"], requireAll: boolean): Row[] {
  const rows: Row[] = [];
  for (const task of plan.tasks) {
    for (const run of task.runs.filter(item => item.protocol === "epistemic_governance_v1")) {
      const matches = roots.map(root => resolveV6AuditableRawRunPath(root, run.runId)).filter(file => fs.existsSync(file));
      if (matches.length > 1) throw new Error(`combined_analysis_duplicate_artifact:${run.runId}`);
      if (matches.length === 0) {
        if (requireAll) throw new Error(`combined_analysis_missing_artifact:${run.runId}`);
        continue;
      }
      const file = matches[0];
      const artifact = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: run.taskId, profile: VERDICT_EXPLORATORY_PROFILE });
      const replay = verifyRawRunData(file, artifact, { governanceRules: [fixture.rule] });
      if (replay.runIssues.length > 0 || replay.governanceAuditStatus !== "sealed_decision_replay_verified") {
        throw new Error(`combined_analysis_replay_failed:${run.runId}:${replay.runIssues.map(issue => issue.code).join(",")}`);
      }
      const operational = artifact.operationalOutcome as Record<string, unknown>;
      const primaryMetric = operational.primaryMetric as { value?: number };
      const taskOutcome = artifact.taskOutcome as Record<string, unknown>;
      const cost = taskOutcome.cost as Record<string, number>;
      rows.push({
        batch,
        runId: run.runId,
        taskId: run.taskId,
        arm: armOf(artifact),
        brier: typeof primaryMetric.value === "number" ? primaryMetric.value : null,
        accuracy: typeof taskOutcome.quality === "number" ? taskOutcome.quality : null,
        tokens: cost?.totalTokens ?? 0,
        invalidOrFailed: cost?.invalidOrFailed ?? 0,
      });
    }
  }
  return rows;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function percentile(sorted: number[], probability: number): number | null {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function clusteredBootstrap(rows: Row[], taskIds: number[], seedText: string): {
  validFraction: number;
  median: number | null;
  lower: number | null;
  upper: number | null;
} {
  const count = 10_000;
  const seed = Number.parseInt(createHash("sha256").update(seedText).digest("hex").slice(0, 8), 16);
  const rng = mulberry32(seed >>> 0);
  const differences: number[] = [];
  for (let iteration = 0; iteration < count; iteration++) {
    const sampled = Array.from({ length: taskIds.length }, () => taskIds[Math.floor(rng() * taskIds.length)]);
    const apply: number[] = [];
    const holdout: number[] = [];
    for (const taskId of sampled) {
      for (const row of rows.filter(candidate => candidate.taskId === taskId && candidate.brier !== null)) {
        if (row.arm === "apply") apply.push(row.brier!);
        if (row.arm === "holdout") holdout.push(row.brier!);
      }
    }
    const applyMean = mean(apply);
    const holdoutMean = mean(holdout);
    if (applyMean !== null && holdoutMean !== null) differences.push(applyMean - holdoutMean);
  }
  differences.sort((a, b) => a - b);
  return {
    validFraction: differences.length / count,
    median: percentile(differences, 0.5),
    lower: percentile(differences, 0.025),
    upper: percentile(differences, 0.975),
  };
}

function main(): number {
  const originalPlan = buildVerdictExploratoryPlan();
  const continuationPlan = buildRetry1Plan();
  const rows = [
    ...load(originalPlan, [VERDICT_EXPLORATORY_OUTPUT_DIR], "original", true),
    ...load(continuationPlan, RETRY1_ROOTS, "continuation", false),
  ];
  const eligible = rows.filter(row => row.arm !== "ineligible");
  const lines: string[] = [
    "=== V6 verdict combined exploratory analysis ===",
    `originalPlan=${originalPlan.contentHash}`,
    `continuationPlan=${continuationPlan.contentHash}`,
    `G runs=${rows.length} eligible=${eligible.length} ineligible=${rows.length - eligible.length}`,
  ];
  for (const batch of ["original", "continuation"] as const) {
    const batchRows = rows.filter(row => row.batch === batch);
    lines.push(`${batch}: G=${batchRows.length} eligible=${batchRows.filter(row => row.arm !== "ineligible").length}`);
    const batchApply = batchRows.filter(row => row.arm === "apply");
    const batchSham = batchRows.filter(row => row.arm === "sham");
    const batchHoldout = batchRows.filter(row => row.arm === "holdout");
    const batchMean = (armRows: Row[]) => mean(armRows.flatMap(row => row.brier === null ? [] : [row.brier]));
    const batchDifference = (left: Row[], right: Row[]) => {
      const leftMean = batchMean(left);
      const rightMean = batchMean(right);
      return leftMean === null || rightMean === null ? null : leftMean - rightMean;
    };
    const batchBootstrap = clusteredBootstrap(batchRows, originalPlan.taskIds, `${batch}:${originalPlan.contentHash}|${continuationPlan.contentHash}`);
    lines.push(`${batch} arms: apply=${batchApply.length}/${batchMean(batchApply)?.toFixed(4) ?? "n/a"}`
      + ` sham=${batchSham.length}/${batchMean(batchSham)?.toFixed(4) ?? "n/a"}`
      + ` holdout=${batchHoldout.length}/${batchMean(batchHoldout)?.toFixed(4) ?? "n/a"}`);
    lines.push(`${batch} apply-holdout=${batchDifference(batchApply, batchHoldout)?.toFixed(4) ?? "n/a"}`
      + ` bootstrap95=[${batchBootstrap.lower?.toFixed(4) ?? "n/a"},${batchBootstrap.upper?.toFixed(4) ?? "n/a"}]`
      + ` validFraction=${batchBootstrap.validFraction.toFixed(4)}`);
  }
  const byArm = Object.fromEntries((["apply", "sham", "holdout"] as const).map(arm => {
    const armRows = rows.filter(row => row.arm === arm);
    return [arm, armRows];
  })) as Record<Exclude<Arm, "ineligible">, Row[]>;
  for (const arm of ["apply", "sham", "holdout"] as const) {
    const armRows = byArm[arm];
    lines.push(`${arm}: n=${armRows.length} taskClusters=${new Set(armRows.map(row => row.taskId)).size}`
      + ` meanBrier=${mean(armRows.flatMap(row => row.brier === null ? [] : [row.brier]))?.toFixed(4) ?? "n/a"}`
      + ` meanAccuracy=${mean(armRows.flatMap(row => row.accuracy === null ? [] : [row.accuracy]))?.toFixed(4) ?? "n/a"}`
      + ` tokens=${armRows.reduce((sum, row) => sum + row.tokens, 0)}`
      + ` invalidOrFailed=${armRows.reduce((sum, row) => sum + row.invalidOrFailed, 0)}`);
  }
  const diff = (left: Row[], right: Row[]) => {
    const a = mean(left.flatMap(row => row.brier === null ? [] : [row.brier]));
    const b = mean(right.flatMap(row => row.brier === null ? [] : [row.brier]));
    return a === null || b === null ? null : a - b;
  };
  const bootstrap = clusteredBootstrap(rows, originalPlan.taskIds, `${originalPlan.contentHash}|${continuationPlan.contentHash}`);
  lines.push(`primary apply-holdout naive=${diff(byArm.apply, byArm.holdout)?.toFixed(4) ?? "n/a"}`);
  lines.push(`primary task-cluster bootstrap median=${bootstrap.median?.toFixed(4) ?? "n/a"}`
    + ` 95%CI=[${bootstrap.lower?.toFixed(4) ?? "n/a"},${bootstrap.upper?.toFixed(4) ?? "n/a"}]`
    + ` validFraction=${bootstrap.validFraction.toFixed(4)}`);
  lines.push(`secondary apply-sham=${diff(byArm.apply, byArm.sham)?.toFixed(4) ?? "n/a"}`
    + ` sham-holdout=${diff(byArm.sham, byArm.holdout)?.toFixed(4) ?? "n/a"}`);
  const defer: string[] = [];
  for (const arm of ["apply", "sham", "holdout"] as const) {
    if (byArm[arm].length < 10) defer.push(`${arm} n<10`);
    if (new Set(byArm[arm].map(row => row.taskId)).size < 8) defer.push(`${arm} taskClusters<8`);
  }
  if (bootstrap.validFraction < 0.95) defer.push("bootstrap validFraction<0.95");
  lines.push(`DEFER_INSUFFICIENT=${defer.length ? defer.join("; ") : "none"}`);
  lines.push(`continuation complete=${rows.filter(row => row.batch === "continuation").length}/${continuationPlan.totalRuns}; missing=${continuationPlan.totalRuns - rows.filter(row => row.batch === "continuation").length} due to host interruption; no rerun/imputation`);
  lines.push("claim ceiling: exploratory effect under this HiddenBench/DeepSeek/prompt/protocol only; detector validity and general governance efficacy remain unestablished");
  console.log(lines.join("\n"));
  return 0;
}

main();
