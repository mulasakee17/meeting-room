/**
 * V6 Verification Verdict — task-heldout replication analyzer (read-only).
 *
 * Analyzes ONLY the frozen task-heldout output root. It rejects any artifact
 * whose task is not one of the 8 frozen held-out tasks and never merges the
 * development / continuation batches. Primary estimand is the observed
 * mean(final pooled Brier | apply) - mean(final pooled Brier | holdout) over
 * eligible G events (bootstrap median is reported but never substitutes for the
 * observed estimand), with a 10,000-draw deterministic task-cluster percentile
 * bootstrap for the 95% interval. DEFER when any of: missing runs >0, an
 * apply/holdout arm has <10 events or <6 task clusters, bootstrap valid
 * fraction <0.95, the observed naive apply-holdout is not a finite number,
 * the observed naive apply-holdout >=0, or the bootstrap 95% upper bound >=0.
 *
 * This is exploratory; wording stays within the frozen claim ceiling. No
 * GO / effect-established / governance-effective wording is ever emitted.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import {
  VERDICT_TASK_HELDOUT_OUTPUT_DIR,
  VERDICT_TASK_HELDOUT_PLAN_PATH,
  VERDICT_TASK_HELDOUT_TASK_IDS,
  buildVerdictTaskHeldoutReplicationPlan,
  type VerdictExploratoryPlan,
} from "./run_v6_verdict_task_heldout_replication";
import { resolveV6AuditableRawRunPath } from "./productionVerticalSlice";
import { mulberry32 } from "../../../src/lib/utils/statsUtils";

interface LoadedRun {
  runId: string;
  taskId: number;
  artifact: Record<string, unknown>;
}

function loadPlan(): VerdictExploratoryPlan {
  return JSON.parse(fs.readFileSync(VERDICT_TASK_HELDOUT_PLAN_PATH, "utf8")) as VerdictExploratoryPlan;
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) throw new Error("percentile of empty sample");
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

function loadHeldoutRuns(plan: VerdictExploratoryPlan): { runs: LoadedRun[]; missing: string[] } {
  const allowed = new Set(VERDICT_TASK_HELDOUT_TASK_IDS);
  const runs: LoadedRun[] = [];
  const missing: string[] = [];
  for (const taskPlan of plan.tasks) {
    if (!allowed.has(taskPlan.taskId)) throw new Error(`heldout plan references unknown task ${taskPlan.taskId}`);
    for (const run of taskPlan.runs) {
      const file = resolveV6AuditableRawRunPath(VERDICT_TASK_HELDOUT_OUTPUT_DIR, run.runId);
      if (!fs.existsSync(file)) { missing.push(run.runId); continue; }
      const artifact = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      const taskId = (artifact.v6TaskManifest as { taskId?: string } | undefined)?.taskId;
      const parsedTask = Number(/task:hiddenbench:(\d+)/.exec(taskId ?? "")?.[1] ?? "0");
      if (!allowed.has(parsedTask)) throw new Error(`heldout output root contains a non-heldout task artifact: ${run.runId} (task ${parsedTask})`);
      runs.push({ runId: run.runId, taskId: taskPlan.taskId, artifact });
    }
  }
  return { runs, missing };
}

type GArm = "apply" | "sham" | "holdout" | "ineligible";

function armOf(artifact: Record<string, unknown>): GArm {
  const trail = artifact.governanceAuditTrail as Record<string, unknown>;
  const transitions = ((trail.actionTransitions as Array<Record<string, unknown>>) ?? []).map(t => t.to);
  if (transitions.includes("held_out")) return "holdout";
  if (transitions.includes("assigned")) {
    const ref = ((trail.actionInstances as Array<Record<string, unknown>>)?.[0]?.actionRef as { id?: string } | undefined)?.id;
    return ref === "swarmalpha.action.verification-attention-sham" ? "sham" : "apply";
  }
  return "ineligible";
}

interface GArmRun {
  runId: string;
  taskId: number;
  arm: GArm;
  pooledBrier: number | null;
  accuracy: number | null;
  tokens: number;
  invalidOrFailed: number;
  verdict?: string;
}

function collectGArmRuns(runs: LoadedRun[]): GArmRun[] {
  const out: GArmRun[] = [];
  for (const run of runs) {
    if ((run.artifact.v6InteractionTrace as { protocol?: string })?.protocol !== "epistemic_governance_v1") {
      throw new Error(`heldout run ${run.runId} is not an epistemic_governance_v1 run`);
    }
    const arm = armOf(run.artifact);
    const primaryMetric = (run.artifact.operationalOutcome as { primaryMetric?: { value?: number } } | undefined)?.primaryMetric;
    const pooledBrier = typeof primaryMetric?.value === "number" ? primaryMetric.value : null;
    const taskOutcome = run.artifact.taskOutcome as { quality?: number } | undefined;
    const accuracy = typeof taskOutcome?.quality === "number" ? taskOutcome.quality : null;
    const cost = (run.artifact.taskOutcome as { cost?: Record<string, number> } | undefined)?.cost;
    const tokens = cost?.totalTokens ?? 0;
    const invalidOrFailed = cost?.invalidOrFailed ?? 0;
    let verdict: string | undefined;
    if (arm === "apply") {
      const trail = run.artifact.governanceAuditTrail as Record<string, unknown>;
      const verification = ((trail.sourceEvents as Array<Record<string, unknown>>) ?? [])
        .find(ev => ((ev.eventRef as { id?: string })?.id ?? "").includes("verification-result"));
      verdict = (verification?.payload as { verdict?: string } | undefined)?.verdict;
    }
    out.push({ runId: run.runId, taskId: run.taskId, arm, pooledBrier, accuracy, tokens, invalidOrFailed, verdict });
  }
  return out;
}

export function taskClusterDifferenceBootstrap(
  applyRuns: Array<{ taskId: number; brier: number }>,
  holdoutRuns: Array<{ taskId: number; brier: number }>,
  taskIds: number[],
  count: number,
  seed: string,
): { diffs: number[]; validFraction: number } {
  const applyByTask = new Map<number, number[]>();
  for (const r of applyRuns) (applyByTask.get(r.taskId) ?? applyByTask.set(r.taskId, []).get(r.taskId)!).push(r.brier);
  const holdoutByTask = new Map<number, number[]>();
  for (const r of holdoutRuns) (holdoutByTask.get(r.taskId) ?? holdoutByTask.set(r.taskId, []).get(r.taskId)!).push(r.brier);
  const seedNum = Array.from(seed).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rng = mulberry32(seedNum >>> 0);
  const diffs: number[] = [];
  let valid = 0;
  for (let i = 0; i < count; i++) {
    const sampled: number[] = [];
    for (let j = 0; j < taskIds.length; j++) sampled.push(taskIds[Math.floor(rng() * taskIds.length)]);
    const applyPool: number[] = [];
    const holdoutPool: number[] = [];
    for (const tid of sampled) {
      const a = applyByTask.get(tid); if (a) applyPool.push(...a);
      const h = holdoutByTask.get(tid); if (h) holdoutPool.push(...h);
    }
    if (applyPool.length === 0 || holdoutPool.length === 0) continue;
    valid += 1;
    const meanA = applyPool.reduce((s, v) => s + v, 0) / applyPool.length;
    const meanH = holdoutPool.reduce((s, v) => s + v, 0) / holdoutPool.length;
    diffs.push(meanA - meanH);
  }
  return { diffs: diffs.sort((a, b) => a - b), validFraction: count ? valid / count : 0 };
}

/**
 * Frozen DEFER rule for the task-heldout replication (design §6, with the
 * 2026-08-13 owner gate extension). DEFER = true if any condition fails.
 * Conditions, in evaluation order:
 *   1. missing runs > 0
 *   2. apply n < 10
 *   3. holdout n < 10
 *   4. apply task clusters < 6
 *   5. holdout task clusters < 6
 *   6. bootstrap valid fraction < 0.95
 *   7. observed naive apply-holdout is not a finite number
 *   8. observed naive apply-holdout >= 0
 *   9. bootstrap 95% upper bound >= 0
 * `naiveEffect` is the observed mean(apply) - mean(holdout) point estimate
 * (the primary estimand); the bootstrap median never substitutes for it.
 */
export function evaluateTaskHeldoutDeferV1(input: {
  missingRuns: number;
  applyN: number;
  holdoutN: number;
  applyTaskClusters: number;
  holdoutTaskClusters: number;
  bootstrapValidFraction: number;
  naiveEffect: number | null;
  bootstrapUpper: number | null;
}): string[] {
  const defer: string[] = [];
  if (input.missingRuns > 0) defer.push("missing runs>0");
  if (input.applyN < 10) defer.push("apply n<10");
  if (input.holdoutN < 10) defer.push("holdout n<10");
  if (input.applyTaskClusters < 6) defer.push("apply task clusters<6");
  if (input.holdoutTaskClusters < 6) defer.push("holdout task clusters<6");
  if (input.bootstrapValidFraction < 0.95) defer.push("bootstrap valid fraction<0.95");
  if (input.naiveEffect === null || !Number.isFinite(input.naiveEffect)) {
    defer.push("observed naive apply-holdout not finite");
  } else if (input.naiveEffect >= 0) {
    defer.push("observed naive apply-holdout>=0");
  }
  if (input.bootstrapUpper === null || !Number.isFinite(input.bootstrapUpper)) {
    defer.push("bootstrap 95% upper bound not finite");
  } else if (input.bootstrapUpper >= 0) {
    defer.push("bootstrap 95% upper bound>=0");
  }
  return defer;
}

function main(): number {
  const plan = loadPlan();
  const { runs, missing } = loadHeldoutRuns(plan);
  const output: string[] = [];
  output.push("=== v6 verdict task-heldout replication analysis (read-only) ===");
  output.push(`plan contentHash: ${plan.contentHash}`);
  output.push(`planned runs: ${plan.totalRuns}; completed: ${runs.length}; missing: ${missing.length}`);
  if (missing.length > 0) output.push(`missing runIds: ${missing.join(", ")}`);

  const gArmRuns = collectGArmRuns(runs);
  const byArm = { apply: [] as GArmRun[], sham: [] as GArmRun[], holdout: [] as GArmRun[], ineligible: [] as GArmRun[] };
  for (const r of gArmRuns) byArm[r.arm].push(r);
  output.push(`G runs: ${gArmRuns.length}; eligible=${gArmRuns.filter(r => r.arm !== "ineligible").length} ineligible=${byArm.ineligible.length}`);
  output.push(`arm n: apply=${byArm.apply.length} sham=${byArm.sham.length} holdout=${byArm.holdout.length}`);

  for (const arm of ["apply", "sham", "holdout"] as const) {
    const list = byArm[arm];
    const briers = list.filter(r => r.pooledBrier !== null).map(r => r.pooledBrier as number);
    const taskClusters = new Set(list.map(r => r.taskId)).size;
    const mean = briers.length ? briers.reduce((s, v) => s + v, 0) / briers.length : null;
    const accuracies = list.filter(r => r.accuracy !== null).map(r => r.accuracy as number);
    const accuracyMean = accuracies.length ? accuracies.reduce((s, v) => s + v, 0) / accuracies.length : null;
    const tokens = list.reduce((s, r) => s + r.tokens, 0);
    const invalidRate = list.length ? list.reduce((s, r) => s + r.invalidOrFailed, 0) / list.length : null;
    output.push(`arm ${arm}: n=${list.length} taskClusters=${taskClusters} meanBrier=${mean?.toFixed(4) ?? "n/a"} meanAccuracy=${accuracyMean?.toFixed(4) ?? "n/a"} totalTokens=${tokens} invalidOrFailedPerRun=${invalidRate?.toFixed(2) ?? "n/a"}`);
  }

  const applyForBoot = byArm.apply.filter(r => r.pooledBrier !== null).map(r => ({ taskId: r.taskId, brier: r.pooledBrier as number }));
  const holdoutForBoot = byArm.holdout.filter(r => r.pooledBrier !== null).map(r => ({ taskId: r.taskId, brier: r.pooledBrier as number }));
  const boot = taskClusterDifferenceBootstrap(applyForBoot, holdoutForBoot, plan.taskIds, plan.analysisContract.bootstrapCount, plan.contentHash);
  const lower = boot.diffs.length ? percentile(boot.diffs, 0.025) : null;
  const upper = boot.diffs.length ? percentile(boot.diffs, 0.975) : null;
  const point = boot.diffs.length ? median(boot.diffs) : null;
  const naive = applyForBoot.length && holdoutForBoot.length
    ? applyForBoot.reduce((s, r) => s + r.brier, 0) / applyForBoot.length - holdoutForBoot.reduce((s, r) => s + r.brier, 0) / holdoutForBoot.length
    : null;
  // Primary point estimate is the observed naive difference; the bootstrap
  // median is reported but never substitutes for the observed estimand.
  output.push(`primary point estimate apply-holdout (observed mean(apply)-mean(holdout), lower favors apply)=${naive?.toFixed(4) ?? "n/a"}`);
  output.push(`bootstrap median (report only)=${point?.toFixed(4) ?? "n/a"} 95% CI=[${lower?.toFixed(4) ?? "n/a"}, ${upper?.toFixed(4) ?? "n/a"}] validFraction=${boot.validFraction.toFixed(4)}`);

  const defer = evaluateTaskHeldoutDeferV1({
    missingRuns: missing.length,
    applyN: byArm.apply.length,
    holdoutN: byArm.holdout.length,
    applyTaskClusters: new Set(byArm.apply.map(r => r.taskId)).size,
    holdoutTaskClusters: new Set(byArm.holdout.map(r => r.taskId)).size,
    bootstrapValidFraction: boot.validFraction,
    naiveEffect: naive,
    bootstrapUpper: upper,
  });
  output.push(`DEFER: ${defer.length ? `true (${defer.join("; ")})` : "false"}`);

  const shamMean = byArm.sham.filter(r => r.pooledBrier !== null).map(r => r.pooledBrier as number);
  const applyMean = byArm.apply.filter(r => r.pooledBrier !== null).map(r => r.pooledBrier as number);
  const holdoutMean = byArm.holdout.filter(r => r.pooledBrier !== null).map(r => r.pooledBrier as number);
  const diff = (a: number[], b: number[]) => (a.length && b.length) ? a.reduce((s, v) => s + v, 0) / a.length - b.reduce((s, v) => s + v, 0) / b.length : null;
  output.push(`secondary: apply-sham=${diff(applyMean, shamMean)?.toFixed(4) ?? "n/a"} sham-holdout=${diff(shamMean, holdoutMean)?.toFixed(4) ?? "n/a"}`);

  const verdictCounts: Record<string, number> = {};
  for (const r of byArm.apply) if (r.verdict) verdictCounts[r.verdict] = (verdictCounts[r.verdict] ?? 0) + 1;
  output.push(`apply verdict distribution: ${Object.keys(verdictCounts).length ? Object.entries(verdictCounts).map(([v, n]) => `${v}=${n}`).join(", ") : "n/a"}`);

  for (const r of gArmRuns) {
    if (r.arm === "ineligible") continue;
    output.push(`  task ${r.taskId} ${r.runId}: arm=${r.arm} brier=${r.pooledBrier?.toFixed(4) ?? "n/a"} accuracy=${r.accuracy ?? "n/a"} verdict=${r.verdict ?? "-"}`);
  }
  console.log(output.join("\n"));
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main();
}
