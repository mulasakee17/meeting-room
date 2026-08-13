/**
 * v6 Verification Verdict V2 — frozen exploratory analysis (RQ-M + RQ-G).
 *
 * RQ-M uses B-arm round-1 explicit belief reports ONLY (governance-free):
 * coverage, exact-repeat stability (base-2 JSD / argmax / tie-aware agreement),
 * categorical-K calibration & predictive characterization.
 *
 * RQ-G uses only eligible randomized G events: primary estimand
 *   mean(final pooled Brier | apply) - mean(final pooled Brier | holdout)
 * with 10,000 task-cluster percentile bootstrap 95% interval; DEFER_INSUFFICIENT
 * if any arm n<5, task clusters<5, or bootstrap valid fraction<0.95.
 *
 * Reuses existing formulas: measurementValidityAnalysis (JSD / argmax /
 * agreement), epistemic scoring (proper-loss Brier), statsUtils (mulberry32).
 * No new analysis formula is invented; no provider calls.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveV6AuditableRawRunPath } from "./productionVerticalSlice";
import {
  VERDICT_EXPLORATORY_OUTPUT_DIR,
  VERDICT_EXPLORATORY_PLAN_PATH,
  VERDICT_EXPLORATORY_PROFILE,
  type VerdictExploratoryPlan,
} from "./run_v6_verdict_exploratory";
import { createV6HiddenBenchSmokeFixtureV1 } from "./v6HiddenBenchSmokeFixture";
import { jsdBase2V1, argmaxSetV1, argmaxSetAgreementV1 } from "../measurement/measurementValidityAnalysis";
import { scoreBeliefReport } from "../../../src/lib/epistemic/scoring";
import { mulberry32 } from "../../../src/lib/utils/statsUtils";
import type { BeliefReport, ClaimResolution, EpistemicClaim } from "../../../src/lib/epistemic";

interface LoadedRun {
  runId: string;
  taskId: number;
  protocol: string;
  artifact: Record<string, unknown>;
}

function loadPlan(): VerdictExploratoryPlan {
  return JSON.parse(fs.readFileSync(VERDICT_EXPLORATORY_PLAN_PATH, "utf8")) as VerdictExploratoryPlan;
}

function loadRuns(plan: VerdictExploratoryPlan): LoadedRun[] {
  const runs: LoadedRun[] = [];
  for (const taskPlan of plan.tasks) {
    for (const run of taskPlan.runs) {
      const file = resolveV6AuditableRawRunPath(VERDICT_EXPLORATORY_OUTPUT_DIR, run.runId);
      if (!fs.existsSync(file)) {
        console.error(`missing artifact: ${run.runId}`);
        continue;
      }
      runs.push({ runId: run.runId, taskId: run.taskId, protocol: run.protocol, artifact: JSON.parse(fs.readFileSync(file, "utf8")) });
    }
  }
  return runs;
}

interface RoundOneReport {
  runId: string;
  taskId: number;
  agentId: string;
  round: number;
  value: { probabilities: Record<string, number> };
  report: BeliefReport;
}

function extractRoundOneReports(run: LoadedRun): RoundOneReport[] {
  const trace = run.artifact.v6InteractionTrace as Record<string, unknown>;
  const events = (trace.epistemicEvents as Array<Record<string, unknown>>) ?? [];
  const reports: RoundOneReport[] = [];
  for (const ev of events) {
    if (ev.type !== "belief_reported") continue;
    const report = ev.report as BeliefReport;
    if (report.round !== 1) continue;
    const value = report.value;
    if (value.kind !== "categorical") continue;
    reports.push({
      runId: run.runId,
      taskId: run.taskId,
      agentId: report.agentId,
      round: 1,
      value: value as { probabilities: Record<string, number> },
      report,
    });
  }
  return reports;
}

function extractResolution(run: LoadedRun): { claim: EpistemicClaim; resolution: ClaimResolution } | null {
  const trace = run.artifact.v6InteractionTrace as Record<string, unknown>;
  const events = (trace.epistemicEvents as Array<Record<string, unknown>>) ?? [];
  const claimResolved = events.find(ev => ev.type === "claim_resolved");
  const claimRegistered = events.find(ev => ev.type === "claim_registered");
  if (!claimResolved || !claimRegistered) return null;
  const claim = claimRegistered.claim as EpistemicClaim;
  const resolution = claimResolved.resolution as ClaimResolution;
  return { claim, resolution };
}

function brierOf(claim: EpistemicClaim, report: BeliefReport, resolution: ClaimResolution): number {
  return scoreBeliefReport(claim, { claimId: claim.id, value: report.value, stake: 0 }, resolution).properLoss;
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

// ---------------------------------------------------------------------------
// RQ-M
// ---------------------------------------------------------------------------

interface CoverageStats {
  expectedReports: number;
  validReports: number;
  invalidReports: number;
  unavailableReports: number;
  taskCoverage: Array<{ taskId: number; expected: number; valid: number; coverage: number }>;
  agentRoleCoverage: Array<{ agentId: string; expected: number; valid: number; coverage: number }>;
  overallValidCoverage: number;
}

function coverageOf(runs: LoadedRun[]): CoverageStats {
  const expectedReports = runs.length * 0; // filled below per task/agent
  void expectedReports;
  const byTask = new Map<number, { expected: number; valid: number }>();
  const byAgent = new Map<string, { expected: number; valid: number }>();
  let totalValid = 0;
  let totalExpected = 0;
  let totalInvalid = 0;
  let totalUnavailable = 0;
  for (const run of runs) {
    const trace = run.artifact.v6InteractionTrace as Record<string, unknown>;
    const calls = (trace.discussionCalls as Array<Record<string, unknown>>) ?? [];
    const round1 = calls.filter(call => call.round === 1);
    const expectedAgentIds = (trace.expectedAgentIds as string[]) ?? [];
    for (const agentId of expectedAgentIds) {
      const taskKey = byTask.get(run.taskId) ?? { expected: 0, valid: 0 };
      const agentKey = byAgent.get(agentId) ?? { expected: 0, valid: 0 };
      taskKey.expected += 1;
      agentKey.expected += 1;
      totalExpected += 1;
      const call = round1.find(c => c.agentId === agentId);
      if (call && call.status === "answered") {
        taskKey.valid += 1;
        agentKey.valid += 1;
        totalValid += 1;
      } else if (call && call.status === "invalid") {
        totalInvalid += 1;
      } else {
        totalUnavailable += 1;
      }
      byTask.set(run.taskId, taskKey);
      byAgent.set(agentId, agentKey);
    }
  }
  return {
    expectedReports: totalExpected,
    validReports: totalValid,
    invalidReports: totalInvalid,
    unavailableReports: totalUnavailable,
    taskCoverage: [...byTask.entries()].map(([taskId, v]) => ({ taskId, expected: v.expected, valid: v.valid, coverage: v.expected ? v.valid / v.expected : 0 })),
    agentRoleCoverage: [...byAgent.entries()].map(([agentId, v]) => ({ agentId, expected: v.expected, valid: v.valid, coverage: v.expected ? v.valid / v.expected : 0 })),
    overallValidCoverage: totalExpected ? totalValid / totalExpected : 0,
  };
}

interface RepeatStabilityRow {
  taskId: number;
  agentId: string;
  paired: boolean;
  jsd: number | null;
  argmaxAgreement: number | null;
}
function repeatStability(runs: LoadedRun[]): {
  rows: RepeatStabilityRow[];
  completePairs: number;
  registeredPairs: number;
  pairCoverage: number;
  medianJsd: number | null;
  p90Jsd: number | null;
  argmaxAgreement: number | null;
} {
  const byKey = new Map<string, { r1: RoundOneReport | null; r2: RoundOneReport | null }>();
  // Register the denominator from the frozen task roster, not from observed
  // reports. Otherwise an agent whose r1 and r2 responses are both invalid or
  // unavailable silently disappears from pair coverage.
  for (const run of runs) {
    const trace = run.artifact.v6InteractionTrace as Record<string, unknown>;
    const expectedAgentIds = (trace.expectedAgentIds as string[]) ?? [];
    for (const agentId of expectedAgentIds) {
      const key = `${run.taskId}|${agentId}`;
      if (!byKey.has(key)) byKey.set(key, { r1: null, r2: null });
    }
  }
  for (const run of runs) {
    for (const report of extractRoundOneReports(run)) {
      const rep = run.runId.endsWith(":r1") ? "r1" : "r2";
      const key = `${run.taskId}|${report.agentId}`;
      const entry = byKey.get(key) ?? { r1: null, r2: null };
      if (rep === "r1") entry.r1 = report; else entry.r2 = report;
      byKey.set(key, entry);
    }
  }
  const rows: RepeatStabilityRow[] = [];
  let completePairs = 0;
  let registeredPairs = 0;
  const jsds: number[] = [];
  let agreements = 0;
  let agreementPairs = 0;
  for (const [key, entry] of byKey.entries()) {
    const [taskId, agentId] = key.split("|");
    registeredPairs += 1;
    if (!entry.r1 || !entry.r2) {
      rows.push({ taskId: Number(taskId), agentId, paired: false, jsd: null, argmaxAgreement: null });
      continue;
    }
    completePairs += 1;
    const p1 = entry.r1.value.probabilities;
    const p2 = entry.r2.value.probabilities;
    const jsd = jsdBase2V1(Object.values(p1), Object.values(p2));
    jsds.push(jsd);
    const setA = argmaxSetV1(Object.entries(p1).map(([option, probability]) => ({ option, probability })));
    const setB = argmaxSetV1(Object.entries(p2).map(([option, probability]) => ({ option, probability })));
    agreements += argmaxSetAgreementV1(setA, setB);
    agreementPairs += 1;
    rows.push({ taskId: Number(taskId), agentId, paired: true, jsd, argmaxAgreement: argmaxSetAgreementV1(setA, setB) });
  }
  const sorted = [...jsds].sort((a, b) => a - b);
  return {
    rows,
    completePairs,
    registeredPairs,
    pairCoverage: registeredPairs ? completePairs / registeredPairs : 0,
    medianJsd: sorted.length ? median(sorted) : null,
    p90Jsd: sorted.length ? percentile(sorted, 0.9) : null,
    argmaxAgreement: agreementPairs ? agreements / agreementPairs : null,
  };
}

interface CalibrationRow {
  taskId: number;
  agentId: string;
  k: number;
  brier: number;
  certainty: number;
  argmaxCount: number;
  correct: boolean | null; // null = tie
  flagged: boolean;
}
interface ReliabilityBin {
  lower: number;
  upper: number;
  count: number;
  meanConfidence: number | null;
  empiricalAccuracy: number | null;
}
function calibrationCharacterization(runs: LoadedRun[]): {
  rows: CalibrationRow[];
  byK: Record<number, {
    n: number; brierMean: number | null; flagRate: number | null;
    pErrorGivenFlagged: number | null; pErrorGivenUnflagged: number | null;
    flaggedUnflaggedBrierGap: number | null;
    precision: number | null; recall: number | null; specificity: number | null;
    correct: number; incorrect: number; ties: number;
  }>;
  reliability: ReliabilityBin[];
  ece: number | null;
} {
  const rows: CalibrationRow[] = [];
  for (const run of runs) {
    const resolutionInfo = extractResolution(run);
    if (!resolutionInfo) continue;
    for (const report of extractRoundOneReports(run)) {
      const k = Object.keys(report.value.probabilities).length;
      const brier = brierOf(resolutionInfo.claim, report.report, resolutionInfo.resolution);
      const entries = Object.entries(report.value.probabilities);
      const certainty = Math.max(...entries.map(([, p]) => p));
      const argmax = argmaxSetV1(entries.map(([option, probability]) => ({ option, probability })));
      const outcome = resolutionInfo.resolution.outcome as string;
      const correct = argmax.length === 1 ? argmax[0] === outcome : null;
      rows.push({ taskId: run.taskId, agentId: report.agentId, k, brier, certainty, argmaxCount: argmax.length, correct, flagged: certainty >= 0.7 });
    }
  }
  const byK: Record<number, unknown> = {};
  for (const row of rows) {
    const acc = (byK[row.k] ?? { n: 0, brierSum: 0, flaggedCount: 0, errorFlagged: 0, errorUnflagged: 0, unflaggedCount: 0, brierFlaggedSum: 0, brierUnflaggedSum: 0, correct: 0, incorrect: 0, ties: 0, tp: 0, fp: 0, tn: 0, fn: 0 }) as Record<string, number>;
    acc.n += 1;
    acc.brierSum += row.brier;
    const error = row.correct === false;
    if (row.correct === true) acc.correct += 1;
    else if (row.correct === false) acc.incorrect += 1;
    else acc.ties += 1;
    if (row.flagged) {
      acc.flaggedCount += 1;
      acc.brierFlaggedSum += row.brier;
      if (error) { acc.errorFlagged += 1; acc.tp += 1; } else { acc.fp += 1; }
    } else {
      acc.unflaggedCount += 1;
      acc.brierUnflaggedSum += row.brier;
      if (error) { acc.errorUnflagged += 1; acc.fn += 1; } else { acc.tn += 1; }
    }
    byK[row.k] = acc;
  }
  const resultByK: Record<number, {
    n: number; brierMean: number | null; flagRate: number | null;
    pErrorGivenFlagged: number | null; pErrorGivenUnflagged: number | null;
    flaggedUnflaggedBrierGap: number | null;
    precision: number | null; recall: number | null; specificity: number | null;
    correct: number; incorrect: number; ties: number;
  }> = {};
  for (const [kStr, acc] of Object.entries(byK)) {
    const k = Number(kStr);
    const a = acc as Record<string, number>;
    const flagged = a.flaggedCount;
    const unflagged = a.unflaggedCount;
    const error = a.errorFlagged + a.errorUnflagged;
    resultByK[k] = {
      n: a.n,
      brierMean: a.n ? a.brierSum / a.n : null,
      flagRate: a.n ? flagged / a.n : null,
      pErrorGivenFlagged: flagged ? a.errorFlagged / flagged : null,
      pErrorGivenUnflagged: unflagged ? a.errorUnflagged / unflagged : null,
      flaggedUnflaggedBrierGap: flagged && unflagged ? a.brierFlaggedSum / flagged - a.brierUnflaggedSum / unflagged : null,
      precision: (a.tp + a.fp) ? a.tp / (a.tp + a.fp) : null,
      recall: (a.tp + a.fn) ? a.tp / (a.tp + a.fn) : null,
      specificity: (a.tn + a.fp) ? a.tn / (a.tn + a.fp) : null,
      correct: a.correct, incorrect: a.incorrect, ties: a.ties,
    };
  }
  // reliability table (fixed bins over certainty)
  const bins: ReliabilityBin[] = [];
  for (let i = 0; i < 10; i++) {
    const lower = i / 10;
    const upper = (i + 1) / 10;
    const binRows = rows.filter(r => r.certainty >= lower && (r.certainty < upper || (i === 9 && r.certainty === 1)));
    bins.push({
      lower, upper,
      count: binRows.length,
      meanConfidence: binRows.length ? binRows.reduce((s, r) => s + r.certainty, 0) / binRows.length : null,
      empiricalAccuracy: binRows.length ? binRows.filter(r => r.correct === true).length / binRows.length : null,
    });
  }
  const ece = bins.reduce((sum, b) => {
    if (!b.count || b.meanConfidence === null || b.empiricalAccuracy === null) return sum;
    return sum + (b.count / rows.length) * Math.abs(b.empiricalAccuracy - b.meanConfidence);
  }, 0);
  return { rows, byK: resultByK, reliability: bins, ece: rows.length ? ece : null };
}

// ---------------------------------------------------------------------------
// RQ-G
// ---------------------------------------------------------------------------

type GArm = "apply" | "sham" | "holdout" | "ineligible";

function armOf(artifact: Record<string, unknown>): GArm {
  const trail = artifact.governanceAuditTrail as Record<string, unknown>;
  const transitions = ((trail.actionTransitions as Array<Record<string, unknown>>) ?? []).map(t => t.to);
  // Every eligible event carries a candidate action instance; the arm is decided
  // by the closing decision. held_out is decisive and must be checked first.
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
  explanation?: string;
}

function collectGArmRuns(runs: LoadedRun[], plan: VerdictExploratoryPlan): GArmRun[] {
  const out: GArmRun[] = [];
  for (const run of runs) {
    if (run.protocol !== "epistemic_governance_v1") continue;
    const artifact = run.artifact;
    const arm = armOf(artifact);
    const operationalOutcome = artifact.operationalOutcome as Record<string, unknown> | undefined;
    const primaryMetric = operationalOutcome?.primaryMetric as { value?: number } | undefined;
    const pooledBrier = typeof primaryMetric?.value === "number" ? primaryMetric.value : null;
    const taskOutcome = artifact.taskOutcome as { quality?: number; status?: string } | undefined;
    const accuracy = typeof taskOutcome?.quality === "number" ? taskOutcome.quality : null;
    // Provider cost lives on taskOutcome.cost (totalTokens / invalidOrFailed).
    const cost = (artifact.taskOutcome as Record<string, unknown>).cost as Record<string, number> | undefined;
    const tokens = cost?.totalTokens ?? 0;
    const invalidOrFailed = cost?.invalidOrFailed ?? 0;
    let verdict: string | undefined;
    let explanation: string | undefined;
    if (arm === "apply") {
      const trail = artifact.governanceAuditTrail as Record<string, unknown>;
      const sourceEvents = (trail.sourceEvents as Array<Record<string, unknown>>) ?? [];
      const verification = sourceEvents.find(ev => ((ev.eventRef as { id?: string })?.id ?? "").includes("verification-result"));
      const payload = verification?.payload as Record<string, unknown> | undefined;
      verdict = payload?.verdict as string | undefined;
      explanation = payload?.explanation as string | undefined;
    }
    out.push({ runId: run.runId, taskId: run.taskId, arm, pooledBrier, accuracy, tokens, invalidOrFailed, verdict, explanation });
  }
  void plan;
  return out;
}

function taskClusterDifferenceBootstrap(
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

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(): number {
  const plan = loadPlan();
  const runs = loadRuns(plan);
  if (runs.length !== plan.totalRuns) {
    console.error(`expected ${plan.totalRuns} runs, found ${runs.length}`);
    return 4;
  }
  const bRuns = runs.filter(r => r.protocol === "explicit_belief_v1");
  const gRuns = runs.filter(r => r.protocol === "epistemic_governance_v1");
  const output: string[] = [];

  output.push(`=== v6 verdict exploratory analysis ===`);
  output.push(`plan contentHash: ${plan.contentHash}`);
  output.push(`runs loaded: ${runs.length} (B=${bRuns.length}, G=${gRuns.length})`);

  // ---- RQ-M ----
  output.push(`\n--- RQ-M (B-arm round-1 explicit belief reports) ---`);
  const coverage = coverageOf(bRuns);
  output.push(`coverage: expected=${coverage.expectedReports} valid=${coverage.validReports} invalid=${coverage.invalidReports} unavailable=${coverage.unavailableReports} overallValidCoverage=${coverage.overallValidCoverage.toFixed(4)}`);
  output.push(`task coverage (min/median/max): ${coverage.taskCoverage.length ? [Math.min(...coverage.taskCoverage.map(t => t.coverage)), median(coverage.taskCoverage.map(t => t.coverage)), Math.max(...coverage.taskCoverage.map(t => t.coverage))].map(v => v.toFixed(4)).join(" / ") : "n/a"}`);
  const lowTaskCoverage = coverage.taskCoverage.filter(t => t.coverage < 0.5);
  if (lowTaskCoverage.length) output.push(`tasks with task coverage < 0.5: ${lowTaskCoverage.map(t => `${t.taskId}(${t.coverage.toFixed(2)})`).join(", ")}`);

  const stability = repeatStability(bRuns);
  output.push(`exact-repeat: registeredPairs=${stability.registeredPairs} completePairs=${stability.completePairs} pairCoverage=${stability.pairCoverage.toFixed(4)}`);
  output.push(`exact-repeat: medianJsd=${stability.medianJsd?.toFixed(4) ?? "n/a"} p90Jsd=${stability.p90Jsd?.toFixed(4) ?? "n/a"} argmaxAgreement=${stability.argmaxAgreement?.toFixed(4) ?? "n/a"}`);

  const calib = calibrationCharacterization(bRuns);
  output.push(`calibration/predictive (by categorical K):`);
  for (const [k, stats] of Object.entries(calib.byK)) {
    output.push(`  K=${k}: n=${stats.n} brierMean=${stats.brierMean?.toFixed(4) ?? "n/a"} flagRate=${stats.flagRate?.toFixed(4) ?? "n/a"} P(err|flag)=${stats.pErrorGivenFlagged?.toFixed(4) ?? "n/a"} P(err|unflag)=${stats.pErrorGivenUnflagged?.toFixed(4) ?? "n/a"} flagUnflagBrierGap=${stats.flaggedUnflaggedBrierGap?.toFixed(4) ?? "n/a"} precision=${stats.precision?.toFixed(4) ?? "n/a"} recall=${stats.recall?.toFixed(4) ?? "n/a"} specificity=${stats.specificity?.toFixed(4) ?? "n/a"} correct=${stats.correct} incorrect=${stats.incorrect} ties=${stats.ties}`);
  }
  output.push(`reliability bins (certainty):`);
  for (const bin of calib.reliability) {
    output.push(`  [${bin.lower.toFixed(1)},${bin.upper.toFixed(1)}): n=${bin.count} meanConf=${bin.meanConfidence?.toFixed(4) ?? "n/a"} empAcc=${bin.empiricalAccuracy?.toFixed(4) ?? "n/a"}`);
  }
  output.push(`ECE (secondary): ${calib.ece?.toFixed(4) ?? "n/a"}`);

  // ---- RQ-G ----
  output.push(`\n--- RQ-G (eligible randomized G events) ---`);
  const gArmRuns = collectGArmRuns(gRuns, plan);
  const byArm = { apply: [] as GArmRun[], sham: [] as GArmRun[], holdout: [] as GArmRun[], ineligible: [] as GArmRun[] };
  for (const r of gArmRuns) byArm[r.arm].push(r);
  output.push(`planned G runs: ${gRuns.length}; eligible=${gArmRuns.filter(r => r.arm !== "ineligible").length} ineligible=${byArm.ineligible.length}`);
  output.push(`arm n: apply=${byArm.apply.length} sham=${byArm.sham.length} holdout=${byArm.holdout.length}`);
  for (const arm of ["apply", "sham", "holdout"] as const) {
    const list = byArm[arm];
    const briers = list.filter(r => r.pooledBrier !== null).map(r => r.pooledBrier as number);
    const taskClusters = new Set(list.map(r => r.taskId)).size;
    const mean = briers.length ? briers.reduce((s, v) => s + v, 0) / briers.length : null;
    const sd = briers.length > 1 ? Math.sqrt(briers.reduce((s, v) => s + (v - (mean as number)) ** 2, 0) / (briers.length - 1)) : null;
    const accuracies = list.filter(r => r.accuracy !== null).map(r => r.accuracy as number);
    const accuracyMean = accuracies.length ? accuracies.reduce((s, v) => s + v, 0) / accuracies.length : null;
    const tokens = list.reduce((s, r) => s + r.tokens, 0);
    const invalidRate = list.length ? list.reduce((s, r) => s + r.invalidOrFailed, 0) / list.length : null;
    output.push(`arm ${arm}: n=${list.length} taskClusters=${taskClusters} meanBrier=${mean?.toFixed(4) ?? "n/a"} medianBrier=${briers.length ? median(briers).toFixed(4) : "n/a"} sd=${sd?.toFixed(4) ?? "n/a"} meanAccuracy=${accuracyMean?.toFixed(4) ?? "n/a"} totalTokens=${tokens} invalidOrFailedPerRun=${invalidRate?.toFixed(2) ?? "n/a"}`);
  }
  output.push(`raw task-level apply/holdout/sham Brier:`);
  for (const r of gArmRuns) {
    if (r.arm === "ineligible") continue;
    output.push(`  task ${r.taskId} ${r.runId}: arm=${r.arm} brier=${r.pooledBrier?.toFixed(4) ?? "n/a"} accuracy=${r.accuracy ?? "n/a"} verdict=${r.verdict ?? "-"}`);
  }

  const applyRunsForBoot = byArm.apply.filter(r => r.pooledBrier !== null).map(r => ({ taskId: r.taskId, brier: r.pooledBrier as number }));
  const holdoutRunsForBoot = byArm.holdout.filter(r => r.pooledBrier !== null).map(r => ({ taskId: r.taskId, brier: r.pooledBrier as number }));
  const boot = taskClusterDifferenceBootstrap(applyRunsForBoot, holdoutRunsForBoot, plan.taskIds, plan.analysisContract.bootstrapCount, plan.contentHash);
  const lower = percentile(boot.diffs, 0.025);
  const upper = percentile(boot.diffs, 0.975);
  const point = boot.diffs.length ? median(boot.diffs) : null;
  output.push(`primary estimand apply-holdout pooled Brier (lower is better for apply):`);
  output.push(`  apply n=${applyRunsForBoot.length} holdout n=${holdoutRunsForBoot.length}`);
  output.push(`  bootstrap median=${point?.toFixed(4) ?? "n/a"} 95% CI=[${lower.toFixed(4)}, ${upper.toFixed(4)}] validFraction=${boot.validFraction.toFixed(4)}`);
  output.push(`  naive mean difference (apply mean - holdout mean): ${(() => {
    const a = applyRunsForBoot.length ? applyRunsForBoot.reduce((s, r) => s + r.brier, 0) / applyRunsForBoot.length : null;
    const h = holdoutRunsForBoot.length ? holdoutRunsForBoot.reduce((s, r) => s + r.brier, 0) / holdoutRunsForBoot.length : null;
    return a !== null && h !== null ? (a - h).toFixed(4) : "n/a";
  })()}`);
  const deferConditions: string[] = [];
  if (byArm.apply.length < 5) deferConditions.push("apply n<5");
  if (byArm.sham.length < 5) deferConditions.push("sham n<5");
  if (byArm.holdout.length < 5) deferConditions.push("holdout n<5");
  if (new Set(byArm.apply.map(r => r.taskId)).size < 5) deferConditions.push("apply task clusters<5");
  if (new Set(byArm.holdout.map(r => r.taskId)).size < 5) deferConditions.push("holdout task clusters<5");
  if (boot.validFraction < 0.95) deferConditions.push("bootstrap valid fraction<0.95");
  output.push(`DEFER_INSUFFICIENT: ${deferConditions.length ? deferConditions.join("; ") : "none"}`);

  // secondary: verdict distribution + apply insufficient ratio
  const verdictCounts: Record<string, number> = {};
  for (const r of byArm.apply) if (r.verdict) verdictCounts[r.verdict] = (verdictCounts[r.verdict] ?? 0) + 1;
  output.push(`apply verdict distribution: ${Object.keys(verdictCounts).length ? Object.entries(verdictCounts).map(([v, n]) => `${v}=${n}`).join(", ") : "n/a"}`);
  output.push(`apply insufficient_evidence ratio: ${byArm.apply.length ? (verdictCounts["insufficient_evidence"] ?? 0) / byArm.apply.length : "n/a"}`);
  const shamMeanBrier = byArm.sham.filter(r => r.pooledBrier !== null).map(r => r.pooledBrier as number);
  const applyMeanBrier = byArm.apply.filter(r => r.pooledBrier !== null).map(r => r.pooledBrier as number);
  const holdoutMeanBrier = byArm.holdout.filter(r => r.pooledBrier !== null).map(r => r.pooledBrier as number);
  const diff = (a: number[], b: number[]) => (a.length && b.length) ? a.reduce((s, v) => s + v, 0) / a.length - b.reduce((s, v) => s + v, 0) / b.length : null;
  output.push(`secondary: apply-sham=${diff(applyMeanBrier, shamMeanBrier)?.toFixed(4) ?? "n/a"} sham-holdout=${diff(shamMeanBrier, holdoutMeanBrier)?.toFixed(4) ?? "n/a"}`);

  console.log(output.join("\n"));
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main();
}
