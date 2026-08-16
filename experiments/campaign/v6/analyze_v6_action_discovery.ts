/**
 * Post-round-1 action discovery — read-only analyzer.
 *
 * Reads the frozen plan and replay-verified artifacts in the action-discovery
 * output root. It computes per-run V2 process-state features from the round-1
 * ledger (reusing deriveProcessStateFeaturesV2, not a second formula), fits
 * frozen ridge models (constant / confidence-only / V1 four-feature / V2
 * nine-feature, lambda=1) with task-held-out prediction, and reports the
 * apply-holdout pooled Brier effect with a task-cluster bootstrap. Output is
 * GO or DEFER; no selective policy is produced.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { deriveProcessStateFeaturesV2 } from "./processStateFeaturesV2";
import { createV6HiddenBenchSmokeFixtureV1 } from "./v6HiddenBenchSmokeFixture";
import { createActionDiscoveryFixtureV1 } from "./v6ActionDiscoveryFixtureV1";
import { ACTION_DISCOVERY_OUTPUT_DIR, ACTION_DISCOVERY_PLAN_PATH } from "./run_v6_action_discovery";
import { resolveV6AuditableRawRunPath } from "./productionVerticalSlice";
import type { BeliefReport, EpistemicEvidence } from "../../../src/lib/epistemic";
import { mulberry32 } from "../../../src/lib/utils/statsUtils";

/** Provisional V1 four-feature subset (audit: "four coarse summaries"). */
export const DISCOVERY_V1_FEATURES = Object.freeze([
  "reportCoverage", "meanReportedCertainty", "meanPairwiseTotalVariation", "pooledTopTwoMargin",
] as const);
export const DISCOVERY_V2_FEATURES = Object.freeze([
  "reportCoverage", "meanReportedCertainty", "meanPairwiseTotalVariation", "pooledTopTwoMargin",
  "argmaxVoteConcentration", "minorityMaxCertainty", "meanEvidenceContentOverlap",
  "evidenceReferenceCoverage", "inverseOptionCount",
] as const);

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
function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

/** Closed-form ridge regression: beta = (X'X + lambda*I)^-1 X'y. */
export function ridgeFit(X: number[][], y: number[], lambda: number): number[] {
  const n = X.length;
  const p = X[0].length;
  if (n === 0 || p === 0) throw new Error("ridge requires non-empty design");
  // X'X
  const xtx = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const xty = new Array<number>(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      xty[a] += X[i][a] * y[i];
      for (let b = 0; b < p; b++) xtx[a][b] += X[i][a] * X[i][b];
    }
  }
  // ridge: xtx[a][a] += lambda
  for (let a = 0; a < p; a++) xtx[a][a] += lambda;
  // Gaussian elimination
  const m = xtx.map(row => [...row, xty[row.indexOf(0)] < 0 || row.indexOf(0) >= 0 ? 0 : 0]);
  for (let a = 0; a < p; a++) m[a][p] = xty[a];
  for (let col = 0; col < p; col++) {
    let pivot = col;
    for (let row = col + 1; row < p; row++) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const diag = m[col][col];
    if (Math.abs(diag) < 1e-12) throw new Error("ridge design is singular");
    for (let j = col; j <= p; j++) m[col][j] /= diag;
    for (let row = 0; row < p; row++) {
      if (row === col) continue;
      const factor = m[row][col];
      for (let j = col; j <= p; j++) m[row][j] -= factor * m[col][j];
    }
  }
  return m.map((row, index) => row[p]);
}

function predict(X: number[][], beta: number[]): number[] {
  return X.map(row => row.reduce((sum, value, index) => sum + value * beta[index], 0));
}
function mse(actual: number[], predicted: number[]): number {
  return mean(actual.map((value, index) => (value - predicted[index]) ** 2));
}

export interface DiscoveryRiskModelInputV1 {
  /** Per task: per-run pooled Brier loss + V2 feature vector. */
  taskRuns: Array<{ taskId: number; loss: number; features: Record<string, number> }>;
  featureNames: readonly string[];
}

/** Task-held-out MSE for a ridge model; featureNames empty => constant (training mean). */
export function taskHeldOutMseV1(input: DiscoveryRiskModelInputV1): number {
  const tasks = [...new Set(input.taskRuns.map(run => run.taskId))];
  if (tasks.length < 2) throw new Error("task-held-out requires at least two tasks");
  let total = 0;
  let count = 0;
  for (const heldTask of tasks) {
    const train = input.taskRuns.filter(run => run.taskId !== heldTask);
    const test = input.taskRuns.filter(run => run.taskId === heldTask);
    if (train.length === 0 || test.length === 0) continue;
    if (input.featureNames.length === 0) {
      const constant = mean(train.map(run => run.loss));
      total += test.reduce((sum, run) => sum + (run.loss - constant) ** 2, 0);
    } else {
      const X = train.map(run => input.featureNames.map(name => run.features[name] ?? 0));
      const y = train.map(run => run.loss);
      const beta = ridgeFit(X, y, 1);
      const Xtest = test.map(run => input.featureNames.map(name => run.features[name] ?? 0));
      const predicted = predict(Xtest, beta);
      total += mse(test.map(run => run.loss), predicted) * test.length;
    }
    count += test.length;
  }
  return count ? total / count : Number.NaN;
}

type GArm = "apply" | "sham" | "holdout" | "ineligible";
export function discoveryArmOf(artifact: Record<string, unknown>): GArm {
  const trail = artifact.governanceAuditTrail as Record<string, unknown>;
  const transitions = ((trail.actionTransitions as Array<Record<string, unknown>>) ?? []).map(t => t.to);
  if (transitions.includes("held_out")) return "holdout";
  if (transitions.includes("assigned")) {
    const ref = ((trail.actionInstances as Array<Record<string, unknown>>)?.[0]?.actionRef as { id?: string } | undefined)?.id;
    return ref === "swarmalpha.action.verification-attention-sham" ? "sham" : "apply";
  }
  return "ineligible";
}

export function bootstrapApplyHoldoutV1(
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
    const ap: number[] = [];
    const hp: number[] = [];
    for (const tid of sampled) {
      const a = applyByTask.get(tid); if (a) ap.push(...a);
      const h = holdoutByTask.get(tid); if (h) hp.push(...h);
    }
    if (ap.length === 0 || hp.length === 0) continue;
    valid += 1;
    diffs.push(mean(ap) - mean(hp));
  }
  return { diffs: diffs.sort((a, b) => a - b), validFraction: count ? valid / count : 0 };
}

export interface DiscoveryGateInputV1 {
  holdoutTaskClusters: number;
  holdoutRuns: number;
  applyTaskClusters: number;
  applyRuns: number;
  replayZeroIssues: boolean;
  v2MseImprovementPoint: number;
  applyHoldoutMeanBrier: number;
  upliftTopHalfBenefitLarger: boolean;
}

/** Frozen discovery gate (handoff §Gate); returns unmet conditions (empty => GO). */
export function evaluateDiscoveryGateV1(input: DiscoveryGateInputV1): string[] {
  const unmet: string[] = [];
  if (input.holdoutTaskClusters < 12) unmet.push("holdout task clusters<12");
  if (input.holdoutRuns < 30) unmet.push("holdout runs<30");
  if (input.applyTaskClusters < 12) unmet.push("apply task clusters<12");
  if (input.applyRuns < 30) unmet.push("apply runs<30");
  if (!input.replayZeroIssues) unmet.push("replay issues non-zero");
  if (!(input.v2MseImprovementPoint > 0)) unmet.push("V2 MSE improvement point not >0");
  if (!(input.applyHoldoutMeanBrier < 0)) unmet.push("apply-holdout mean Brier not <0");
  if (!input.upliftTopHalfBenefitLarger) unmet.push("uplift top-half benefit not larger");
  return unmet;
}

function loadPlan(): { taskIds: number[] } {
  return JSON.parse(fs.readFileSync(ACTION_DISCOVERY_PLAN_PATH, "utf8")) as { taskIds: number[] };
}

function main(): number {
  let plan: { taskIds: number[] };
  try {
    plan = loadPlan();
  } catch {
    console.error("action-discovery plan is not materialized; run --execute after 16 accepted reviews and cap resolution");
    return 4;
  }
  const allowed = new Set(plan.taskIds);
  const gArmRuns: Array<{ runId: string; taskId: number; arm: GArm; brier: number | null; verdict?: string }> = [];
  const featureRuns: Array<{ taskId: number; loss: number; features: Record<string, number> }> = [];
  for (const taskId of plan.taskIds) {
    const fixture = createActionDiscoveryFixtureV1(taskId);
    const { base, rule } = fixture;
    for (let replicate = 1; replicate <= 8; replicate++) {
      const runId = `run:v6-action-discovery-v1:task-${taskId}:G:r${replicate}`;
      const file = resolveV6AuditableRawRunPath(ACTION_DISCOVERY_OUTPUT_DIR, runId);
      if (!fs.existsSync(file)) continue;
      const artifact = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      const arm = discoveryArmOf(artifact);
      const primaryMetric = (artifact.operationalOutcome as { primaryMetric?: { value?: number } } | undefined)?.primaryMetric;
      const brier = typeof primaryMetric?.value === "number" ? primaryMetric.value : null;
      gArmRuns.push({ runId, taskId, arm, brier });
      // round-1 ledger -> V2 features (loss = pooled Brier as the outcome)
      const trace = artifact.v6InteractionTrace as Record<string, unknown>;
      const events = (trace.epistemicEvents as Array<Record<string, unknown>>) ?? [];
      const reports = events.filter(ev => ev.type === "belief_reported" && (ev.report as { round?: number })?.round === 1)
        .map(ev => ev.report as BeliefReport);
      const evidence = events.filter(ev => ev.type === "evidence_registered" && /:r1:/.test((ev.evidence as { id?: string })?.id ?? ""))
        .map(ev => ev.evidence as EpistemicEvidence);
      if (reports.length === 0 || brier === null) continue;
      const features = deriveProcessStateFeaturesV2({
        claim: (artifact.v6TaskManifest as { primaryClaim: { id: string; proposition: string; domain: string; createdAt: string; resolutionPolicy: { kind: "categorical"; resolverId: string }; options: string[] } }).primaryClaim as never,
        expectedAgentIds: (trace.expectedAgentIds as string[]) ?? [],
        roundOneReports: reports,
        roundOneEvidence: evidence,
      });
      featureRuns.push({ taskId, loss: brier, features: { ...features.values } });
    }
  }
  const byArm = { apply: [] as typeof gArmRuns, sham: [] as typeof gArmRuns, holdout: [] as typeof gArmRuns, ineligible: [] as typeof gArmRuns };
  for (const run of gArmRuns) byArm[run.arm].push(run);
  const output: string[] = [];
  output.push(`=== action discovery analysis ===`);
  output.push(`arm n: apply=${byArm.apply.length} sham=${byArm.sham.length} holdout=${byArm.holdout.length} ineligible=${byArm.ineligible.length}`);
  output.push(`apply task clusters=${new Set(byArm.apply.map(r => r.taskId)).size}; holdout task clusters=${new Set(byArm.holdout.map(r => r.taskId)).size}`);

  // ridge task-held-out MSE
  const constantMse = taskHeldOutMseV1({ taskRuns: featureRuns, featureNames: [] });
  const confidenceMse = taskHeldOutMseV1({ taskRuns: featureRuns, featureNames: ["meanReportedCertainty"] });
  const v1Mse = taskHeldOutMseV1({ taskRuns: featureRuns, featureNames: [...DISCOVERY_V1_FEATURES] });
  const v2Mse = taskHeldOutMseV1({ taskRuns: featureRuns, featureNames: [...DISCOVERY_V2_FEATURES] });
  output.push(`task-held-out MSE: constant=${constantMse.toFixed(4)} confidence=${confidenceMse.toFixed(4)} V1=${v1Mse.toFixed(4)} V2=${v2Mse.toFixed(4)}`);
  output.push(`V2 MSE improvement vs constant point=${(constantMse - v2Mse).toFixed(4)} vs confidence=${(confidenceMse - v2Mse).toFixed(4)}`);

  const applyBrier = byArm.apply.filter(r => r.brier !== null).map(r => r.brier as number);
  const holdoutBrier = byArm.holdout.filter(r => r.brier !== null).map(r => r.brier as number);
  const applyHoldoutMean = applyBrier.length && holdoutBrier.length ? mean(applyBrier) - mean(holdoutBrier) : null;
  output.push(`apply-holdout mean Brier=${applyHoldoutMean?.toFixed(4) ?? "n/a"}`);
  const boot = bootstrapApplyHoldoutV1(
    byArm.apply.filter(r => r.brier !== null).map(r => ({ taskId: r.taskId, brier: r.brier as number })),
    byArm.holdout.filter(r => r.brier !== null).map(r => ({ taskId: r.taskId, brier: r.brier as number })),
    plan.taskIds, 10_000, "action-discovery-v1",
  );
  output.push(`bootstrap median=${boot.diffs.length ? median(boot.diffs).toFixed(4) : "n/a"} 95% CI=[${boot.diffs.length ? percentile(boot.diffs, 0.025).toFixed(4) : "n/a"}, ${boot.diffs.length ? percentile(boot.diffs, 0.975).toFixed(4) : "n/a"}] validFraction=${boot.validFraction.toFixed(4)}`);

  const gate = evaluateDiscoveryGateV1({
    holdoutTaskClusters: new Set(byArm.holdout.map(r => r.taskId)).size,
    holdoutRuns: byArm.holdout.length,
    applyTaskClusters: new Set(byArm.apply.map(r => r.taskId)).size,
    applyRuns: byArm.apply.length,
    replayZeroIssues: true,
    v2MseImprovementPoint: constantMse - v2Mse,
    applyHoldoutMeanBrier: applyHoldoutMean ?? 0,
    upliftTopHalfBenefitLarger: false,
  });
  output.push(`DISCOVERY GATE: ${gate.length ? `DEFER (${gate.join("; ")})` : "GO (discovery stage only)"}`);
  console.log(output.join("\n"));
  return gate.length ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main();
}
