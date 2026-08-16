/**
 * Fork confirmatory analyzer — task-level paired effects + cluster bootstrap + LOTO.
 *
 * Reads the flat ForkRow JSONL written by run_v6_fork.ts and computes:
 *   H1 (primary):    Δ_dir  = Brier_ATTACKS − Brier_SUPPORTS  (negative = ATTACKS better)
 *   H2 (secondary):  Δ_disc = Brier_ATTACKS − Brier_CONTROL   (negative = ATTACKS better)
 *
 * Statistical unit is the TASK, not the (task, seed) block or the raw row. Within
 * a task, paired differences are first averaged across seeds, so every task
 * contributes one equally-weighted effect. The 95% interval is a task-cluster
 * bootstrap (10,000 resamples, resample unit = task). LOTO is robustness only.
 *
 * Frozen verdict rule: a 95% CI fully below 0 => "direction effect detected in
 * predicted direction"; a CI containing 0 => "direction effect was not detected"
 * (never "no effect", and sign-count must not be retrofitted as the win rule).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { mulberry32 } from "../../../src/lib/utils/statsUtils";
import { createDeepSeekSingleAttemptInvoker } from "./deepseekSingleAttemptInvoker";
import type { SingleAttemptTextInvoker } from "./providerAdapters";
import {
  FORK_ARMS,
  FORK_DEVELOPMENT_TASK_IDS,
  FORK_MODEL,
  FORK_OUTPUT_DIR,
  buildForkPlanV1,
  probeForkSeedSensitivity,
  runFork,
  runForkExecute,
  type ForkRow,
  type SeedSensitivityProbeResult,
} from "./run_v6_fork";

/** Frozen bootstrap master seed (deterministic CI; not searched). */
export const FORK_BOOTSTRAP_SEED = 0x5EED0F;
export const FORK_BOOTSTRAP_REPETITIONS = 10_000;

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
}
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function percentile(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}

interface BlockDeltas {
  taskId: number;
  seed: number;
  deltaDir: number | null;
  deltaDisc: number | null;
}

function brierOf(rows: ForkRow[], arm: string): number | null {
  const row = rows.find(r => r.arm === arm);
  return row ? row.finalBrier : null;
}

function pairedBlocks(rows: ForkRow[]): BlockDeltas[] {
  const byBlock = new Map<string, ForkRow[]>();
  for (const r of rows) {
    const key = `${r.taskId}:${r.seed}`;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key)!.push(r);
  }
  const blocks: BlockDeltas[] = [];
  for (const blockRows of byBlock.values()) {
    const taskId = blockRows[0].taskId;
    const seed = blockRows[0].seed;
    const a = brierOf(blockRows, "ATTACKS");
    const s = brierOf(blockRows, "SUPPORTS");
    const c = brierOf(blockRows, "CONTROL");
    blocks.push({
      taskId,
      seed,
      deltaDir: (a !== null && s !== null) ? a - s : null,
      deltaDisc: (a !== null && c !== null) ? a - c : null,
    });
  }
  return blocks;
}

interface TaskEffect {
  taskId: number;
  effect: number;
  blockCount: number;
}

function taskLevel(blocks: BlockDeltas[], key: "deltaDir" | "deltaDisc"): TaskEffect[] {
  const byTask = new Map<number, number[]>();
  for (const b of blocks) {
    const v = b[key];
    if (v === null) continue;
    if (!byTask.has(b.taskId)) byTask.set(b.taskId, []);
    byTask.get(b.taskId)!.push(v);
  }
  return [...byTask.entries()]
    .map(([taskId, vals]) => ({ taskId, effect: mean(vals), blockCount: vals.length }))
    .sort((a, b) => a.taskId - b.taskId);
}

function clusterBootstrap(taskEffects: number[], repetitions: number, seed: number): [number | null, number | null] {
  if (taskEffects.length === 0) return [null, null];
  const rng = mulberry32(seed >>> 0);
  const draws: number[] = [];
  for (let i = 0; i < repetitions; i++) {
    const sample: number[] = [];
    for (let j = 0; j < taskEffects.length; j++) {
      sample.push(taskEffects[Math.floor(rng() * taskEffects.length)]);
    }
    draws.push(mean(sample));
  }
  draws.sort((a, b) => a - b);
  return [percentile(draws, 0.025), percentile(draws, 0.975)];
}

function verdict(ci95: [number | null, number | null]): string {
  if (ci95[0] !== null && ci95[1] !== null && ci95[1] < 0) {
    return "direction effect detected in predicted direction";
  }
  return "direction effect was not detected";
}

interface LotoSummary {
  full: number;
  min: number;
  max: number;
  mostInfluentialTask: number | null;
  signChanges: boolean;
}

function loto(taskEffects: TaskEffect[]): LotoSummary {
  const full = mean(taskEffects.map(t => t.effect));
  let min = Infinity;
  let max = -Infinity;
  let mostInfluentialTask: number | null = null;
  let mostDelta = 0;
  let signChanges = false;
  for (const t of taskEffects) {
    const rest = taskEffects.filter(x => x.taskId !== t.taskId).map(x => x.effect);
    if (rest.length === 0) continue;
    const m = mean(rest);
    if (m < min) min = m;
    if (m > max) max = m;
    const delta = Math.abs(m - full);
    if (delta > mostDelta) { mostDelta = delta; mostInfluentialTask = t.taskId; }
    if ((m > 0) !== (full > 0)) signChanges = true;
  }
  return { full, min: min === Infinity ? full : min, max: max === -Infinity ? full : max, mostInfluentialTask, signChanges };
}

export interface ForkEstimateSummary {
  mean: number;
  median: number;
  ci95: [number | null, number | null];
  negativeTasks: number;
  positiveTasks: number;
  zeroTasks: number;
  taskCount: number;
  verdict: string;
  perTask: TaskEffect[];
}

export interface ForkAnalysisResult {
  h1: ForkEstimateSummary;
  h2: ForkEstimateSummary;
  lotoH1: LotoSummary;
  lotoH2: LotoSummary;
  blockCount: number;
  rowCount: number;
}

export function analyzeForkRows(
  rows: ForkRow[],
  repetitions: number = FORK_BOOTSTRAP_REPETITIONS,
): ForkAnalysisResult {
  const blocks = pairedBlocks(rows);
  const taskDir = taskLevel(blocks, "deltaDir");
  const taskDisc = taskLevel(blocks, "deltaDisc");

  const summarize = (taskEffects: TaskEffect[], key: "deltaDir" | "deltaDisc"): ForkEstimateSummary => {
    const effects = taskEffects.map(t => t.effect);
    const ci95 = clusterBootstrap(effects, repetitions, FORK_BOOTSTRAP_SEED);
    return {
      mean: mean(effects),
      median: median(effects),
      ci95,
      negativeTasks: effects.filter(v => v < 0).length,
      positiveTasks: effects.filter(v => v > 0).length,
      zeroTasks: effects.filter(v => v === 0).length,
      taskCount: effects.length,
      verdict: verdict(ci95),
      perTask: taskEffects,
    };
  };

  return {
    h1: summarize(taskDir, "deltaDir"),
    h2: summarize(taskDisc, "deltaDisc"),
    lotoH1: loto(taskDir),
    lotoH2: loto(taskDisc),
    blockCount: blocks.length,
    rowCount: rows.length,
  };
}

export interface PreflightCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

export interface ForkPreflightReport {
  checks: PreflightCheck[];
  summary: "READY" | "BLOCKED";
}

/**
 * Preflight (development tasks only, before any confirmatory run): 10 checks.
 * Structural checks (arm completeness, state-hash identity, analyzer integrity,
 * bootstrap finiteness) gate the summary; diagnostics (token/coverage/source,
 * count equality, round-2 trace) are recorded as warn/pass and reported for a
 * human to judge — they must not be auto-converted into a hidden success rule.
 */
export function runForkPreflight(
  rows: ForkRow[],
  seedProbe: SeedSensitivityProbeResult | null,
): ForkPreflightReport {
  const checks: PreflightCheck[] = [];
  const add = (name: string, status: PreflightCheck["status"], detail: string) =>
    checks.push({ name, status, detail });

  const byBlock = new Map<string, ForkRow[]>();
  for (const r of rows) {
    const key = `${r.taskId}:${r.seed}`;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key)!.push(r);
  }
  const blocks = [...byBlock.values()];

  const arm = (b: ForkRow[], a: string) => b.find(r => r.arm === a);

  // 1. five-arm completeness
  const incomplete = blocks.filter(b => new Set(b.map(r => r.arm)).size !== FORK_ARMS.length).length;
  add("arm_completeness", incomplete === 0 ? "pass" : "fail",
    `${blocks.length} blocks, ${incomplete} incomplete`);

  // 2. identical round-1 state hash
  const inconsistent = blocks.filter(b => new Set(b.map(r => r.round1StateHash)).size !== 1).length;
  add("identical_round1_state_hash", inconsistent === 0 ? "pass" : "fail",
    `${inconsistent} blocks with divergent round-1 state`);

  // 3. evidence count asymmetry (SUPPORTS vs ATTACKS; full disclosure, so count = pool size)
  let countMismatch = 0;
  let poolAsymmetry = 0;
  for (const b of blocks) {
    const s = arm(b, "SUPPORTS")?.disclosedEvidenceCount ?? 0;
    const a = arm(b, "ATTACKS")?.disclosedEvidenceCount ?? 0;
    const sp = arm(b, "SUPPORTS")?.disclosedPoolSize ?? 0;
    const ap = arm(b, "ATTACKS")?.disclosedPoolSize ?? 0;
    if (s !== a) countMismatch += 1;
    if (sp !== ap) poolAsymmetry += 1;
  }
  add("evidence_count_asymmetry", countMismatch === 0 ? "pass" : "warn",
    `SUPPORTS!=ATTACKS in ${countMismatch}/${blocks.length} blocks; pool asymmetry ${poolAsymmetry}`);

  // 4. token imbalance diagnostic (ATTACKS vs SUPPORTS) — diagnostic only
  const tokenPairs = blocks
    .map(b => ({ s: arm(b, "SUPPORTS")?.disclosedTokenCount ?? 0, a: arm(b, "ATTACKS")?.disclosedTokenCount ?? 0 }))
    .filter(p => p.s > 0 && p.a > 0);
  const aTokens = tokenPairs.map(p => p.a);
  const sTokens = tokenPairs.map(p => p.s);
  const aMean = mean(aTokens);
  const sMean = mean(sTokens);
  const ratio = sMean > 0 ? aMean / sMean : null;
  const pairedDiff = mean(tokenPairs.map(p => p.a - p.s));
  add("token_imbalance_diagnostic", tokenPairs.length > 0 ? "pass" : "warn",
    `ATTACKS mean=${aMean.toFixed(1)} vs SUPPORTS mean=${sMean.toFixed(1)} (ratio=${ratio?.toFixed(2) ?? "n/a"}, paired diff=${pairedDiff.toFixed(1)})`);

  // 5. option coverage diagnostic
  const covA = mean(blocks.map(b => arm(b, "ATTACKS")?.disclosedCoveredOptionCount ?? 0));
  const covS = mean(blocks.map(b => arm(b, "SUPPORTS")?.disclosedCoveredOptionCount ?? 0));
  add("option_coverage_diagnostic", "pass",
    `mean covered options: ATTACKS=${covA.toFixed(2)}, SUPPORTS=${covS.toFixed(2)}`);

  // 6. source-agent coverage diagnostic
  const srcA = mean(blocks.map(b => arm(b, "ATTACKS")?.disclosedSourceAgentCount ?? 0));
  const srcS = mean(blocks.map(b => arm(b, "SUPPORTS")?.disclosedSourceAgentCount ?? 0));
  add("source_agent_coverage_diagnostic", "pass",
    `mean source agents: ATTACKS=${srcA.toFixed(2)}, SUPPORTS=${srcS.toFixed(2)}`);

  // 7. round-2 trace completeness
  const r2Missing = rows.filter(r => r.round2AgentBeliefs.length === 0 || r.round2EvidenceContentHashes.length === 0).length;
  add("round2_trace_completeness", r2Missing === 0 ? "pass" : "warn", `${r2Missing}/${rows.length} rows with empty round-2 trace`);

  // 8. analyzer paired-block integrity
  const analysis = analyzeForkRows(rows, 1000);
  add("analyzer_paired_block_integrity",
    analysis.blockCount > 0 && analysis.h1.taskCount > 0 ? "pass" : "fail",
    `blocks=${analysis.blockCount}, h1 tasks=${analysis.h1.taskCount}`);

  // 9. bootstrap smoke test (synthetic data)
  const smoke = clusterBootstrap([0.1, -0.2, 0.05, -0.1, 0.3], 1000, 1);
  const smokeOk = smoke[0] !== null && smoke[1] !== null && Number.isFinite(smoke[0]!) && Number.isFinite(smoke[1]!);
  add("bootstrap_smoke_test", smokeOk ? "pass" : "fail",
    `synthetic CI [${smoke[0]?.toFixed(3) ?? "n/a"}, ${smoke[1]?.toFixed(3) ?? "n/a"}]`);

  // 10. seed sensitivity
  add("seed_sensitivity", seedProbe ? "pass" : "warn",
    seedProbe ? `conclusion=${seedProbe.conclusion}` : "probe not run");

  const blocked = checks.some(c => c.status === "fail");
  return { checks, summary: blocked ? "BLOCKED" : "READY" };
}

export function readForkRowsFromDir(outputDir: string = FORK_OUTPUT_DIR): ForkRow[] {
  if (!fs.existsSync(outputDir)) return [];
  const rows: ForkRow[] = [];
  for (const name of fs.readdirSync(outputDir)) {
    if (!name.endsWith(".jsonl")) continue;
    const text = fs.readFileSync(path.join(outputDir, name), "utf8");
    for (const line of text.split("\n")) {
      if (line.trim().length === 0) continue;
      rows.push(JSON.parse(line) as ForkRow);
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Secondary / robustness analyses (post-primary; all data already on disk).
// ---------------------------------------------------------------------------

function argmaxOf(belief: Record<string, number>): string {
  return Object.entries(belief).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
}

function majorityVote(beliefs: Record<string, number>[]): string {
  const votes = new Map<string, number>();
  for (const b of beliefs) {
    const a = argmaxOf(b);
    if (a) votes.set(a, (votes.get(a) ?? 0) + 1);
  }
  return [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
}

export interface ForkSecondaryResult {
  accuracy: Array<{ arm: string; n: number; pooledAccuracy: number; majorityAccuracy: number }>;
  h3: Array<{ moderator: string; split: string; groupN: number; attacksMinusControl: number | null }>;
  missingness: Array<{ arm: string; meanFinalReported: number; zeroReported: number; totalRows: number }>;
  concentration: { h1Mean: number; h1Median: number; negativeTasks: number; positiveTasks: number; zeroTasks: number; top5NegativeContribution: number };
}

/** Majority-vote vs pooled, H3 moderation, missingness, and per-task concentration. */
export function analyzeForkSecondary(rows: ForkRow[]): ForkSecondaryResult {
  // 1. accuracy (pooled argmax vs majority vote), per arm.
  const accuracy = FORK_ARMS.map(arm => {
    const armRows = rows.filter(r => r.arm === arm);
    let n = 0;
    let pooledCorrect = 0;
    let majorityCorrect = 0;
    for (const r of armRows) {
      if (r.finalAccuracy === null || !r.finalBelief || !r.resolvedOption) continue;
      n += 1;
      pooledCorrect += r.finalAccuracy;
      majorityCorrect += majorityVote(r.finalAgentBeliefs) === r.resolvedOption ? 1 : 0;
    }
    return { arm, n, pooledAccuracy: n ? pooledCorrect / n : 0, majorityAccuracy: n ? majorityCorrect / n : 0 };
  });

  // 2. H3 moderation: ATTACKS-CONTROL delta vs round-1 coupling/alignment.
  const byBlock = new Map<string, ForkRow[]>();
  for (const r of rows) {
    const key = `${r.taskId}:${r.seed}`;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key)!.push(r);
  }
  const blockDelta = (b: ForkRow[], key: "evidenceReuse" | "alignmentR") => {
    const attacks = b.find(r => r.arm === "ATTACKS");
    const control = b.find(r => r.arm === "CONTROL");
    const moderator = attacks ? attacks[key] : null;
    const delta = (attacks?.finalBrier !== null && attacks?.finalBrier !== undefined
      && control?.finalBrier !== null && control?.finalBrier !== undefined)
      ? (attacks!.finalBrier! - control!.finalBrier!) : null;
    return { moderator, delta };
  };
  const moderation = (key: "evidenceReuse" | "alignmentR", label: string) => {
    const vals = [...byBlock.values()]
      .map(b => blockDelta(b, key))
      .filter(x => x.moderator !== null && x.delta !== null) as Array<{ moderator: number; delta: number }>;
    if (vals.length === 0) return [
      { moderator: label, split: "high", groupN: 0, attacksMinusControl: null },
      { moderator: label, split: "low", groupN: 0, attacksMinusControl: null },
    ];
    const med = median(vals.map(v => v.moderator));
    const high = vals.filter(v => v.moderator >= med).map(v => v.delta);
    const low = vals.filter(v => v.moderator < med).map(v => v.delta);
    return [
      { moderator: label, split: "high", groupN: high.length, attacksMinusControl: mean(high) },
      { moderator: label, split: "low", groupN: low.length, attacksMinusControl: mean(low) },
    ];
  };
  const h3 = [...moderation("evidenceReuse", "evidenceReuse_R1"), ...moderation("alignmentR", "alignment_R1")];

  // 3. missingness: finalReportedCount distribution per arm.
  const missingness = FORK_ARMS.map(arm => {
    const armRows = rows.filter(r => r.arm === arm);
    const reported = armRows.map(r => r.finalReportedCount);
    return {
      arm,
      meanFinalReported: mean(reported),
      zeroReported: reported.filter(c => c === 0).length,
      totalRows: armRows.length,
    };
  });

  // 4. per-task H1 concentration.
  const h1 = analyzeForkRows(rows, 1000).h1;
  const effects = h1.perTask.map(t => t.effect);
  const negatives = effects.filter(v => v < 0).sort((a, b) => a - b);
  const top5 = negatives.slice(0, 5);
  const top5NegativeContribution = h1.mean !== 0 ? top5.reduce((s, v) => s + v, 0) / effects.length / h1.mean : 0;

  return {
    accuracy,
    h3,
    missingness,
    concentration: {
      h1Mean: h1.mean,
      h1Median: h1.median,
      negativeTasks: h1.negativeTasks,
      positiveTasks: h1.positiveTasks,
      zeroTasks: h1.zeroTasks,
      top5NegativeContribution,
    },
  };
}

/**
 * Preflight execution: run the seed probe (development subset) + fork every
 * development task, then run the 10-check preflight. Provider-backed; the CLI
 * gates it behind RUN_AUTHORIZED + an API key. Returns rows so a later
 * confirmatory step can re-analyze without re-running.
 */
export async function runForkPreflightExecute(input: {
  taskIds: readonly number[];
  seeds: readonly number[];
  invoker: SingleAttemptTextInvoker;
  seedProbeTaskIds?: readonly number[];
  seedProbeSeeds?: readonly number[];
  includeSeedProbe?: boolean;
}): Promise<{ rows: ForkRow[]; preflight: ForkPreflightReport; seedProbe: SeedSensitivityProbeResult | null }> {
  const seedProbe = input.includeSeedProbe
    ? await probeForkSeedSensitivity({
        taskIds: input.seedProbeTaskIds ?? [13, 39],
        seeds: input.seedProbeSeeds ?? [0, 1],
        invoker: input.invoker,
      })
    : null;
  const rows: ForkRow[] = [];
  for (const taskId of input.taskIds) {
    for (const seed of input.seeds) {
      rows.push(...await runFork({ taskId, seed, model: FORK_MODEL, invoker: input.invoker }));
    }
  }
  return { rows, preflight: runForkPreflight(rows, seedProbe), seedProbe };
}

export const FORK_PREFLIGHT_REPORT_PATH = path.resolve(
  process.cwd(),
  "experiments/campaign/v6/FORK_PREFLIGHT_REPORT.json",
);

/** The original 8 high-disagreement development tasks (historical signal). */
export const FORK_DEV_ANALYSIS_TASK_IDS: readonly number[] = [13, 24, 28, 32, 33, 39, 45, 54];
export const FORK_DEV_ANALYSIS_OUTPUT_DIR = path.resolve(
  process.cwd(),
  "experiments/campaign/pilot_output/v6-fork-dev-analysis-20260815",
);

/**
 * Development fork + analyzer: run the 8 high-disagreement tasks (1 seed),
 * persist rows to JSONL, and compute H1/H2. This is the cheap "look at the
 * signal before burning confirmatory budget" step; it is NOT a confirmatory
 * result (development tasks already informed the direction hypothesis).
 */
export async function runForkDevAnalysis(input: {
  invoker: SingleAttemptTextInvoker;
  taskIds?: readonly number[];
  seeds?: readonly number[];
  outputDir?: string;
}): Promise<{ rows: ForkRow[]; h1: ForkEstimateSummary; h2: ForkEstimateSummary; lotoH1: LotoSummary }> {
  const taskIds = input.taskIds ?? FORK_DEV_ANALYSIS_TASK_IDS;
  const seeds = input.seeds ?? [0];
  const outputDir = input.outputDir ?? FORK_DEV_ANALYSIS_OUTPUT_DIR;
  const plan = buildForkPlanV1(taskIds, seeds);
  await runForkExecute({ plan, invoker: input.invoker, outputDir });
  const rows = readForkRowsFromDir(outputDir);
  const analysis = analyzeForkRows(rows);
  return { rows, h1: analysis.h1, h2: analysis.h2, lotoH1: analysis.lotoH1 };
}

async function runPreflightCli(): Promise<number> {
  if (process.env.RUN_AUTHORIZED !== "yes") { console.error("preflight_blocked: RUN_AUTHORIZED=yes not present"); return 5; }
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  if (!process.env.DEEPSEEK_API_KEY) { console.error("deepseek_api_key_unavailable"); return 3; }
  const invoker = createDeepSeekSingleAttemptInvoker();
  const { rows, preflight, seedProbe } = await runForkPreflightExecute({
    taskIds: FORK_DEVELOPMENT_TASK_IDS,
    seeds: [0],
    invoker,
    includeSeedProbe: true,
  });
  const report = { seedProbe, preflight, rowCount: rows.length };
  fs.writeFileSync(FORK_PREFLIGHT_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    mode: "preflight",
    rowCount: rows.length,
    summary: preflight.summary,
    reportPath: FORK_PREFLIGHT_REPORT_PATH,
  }, null, 2));
  return preflight.summary === "READY" ? 0 : 1;
}

async function runDevAnalysisCli(): Promise<number> {
  if (process.env.RUN_AUTHORIZED !== "yes") { console.error("run_dev_blocked: RUN_AUTHORIZED=yes not present"); return 5; }
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  if (!process.env.DEEPSEEK_API_KEY) { console.error("deepseek_api_key_unavailable"); return 3; }
  const result = await runForkDevAnalysis({ invoker: createDeepSeekSingleAttemptInvoker() });
  console.log(JSON.stringify({
    mode: "run-dev",
    rowCount: result.rows.length,
    h1: result.h1,
    h2: result.h2,
    lotoH1: result.lotoH1,
  }, null, 2));
  return 0;
}

function runSecondaryCli(): number {
  const outputDir = process.argv.includes("--output-dir")
    ? path.resolve(process.argv[process.argv.indexOf("--output-dir") + 1])
    : FORK_OUTPUT_DIR;
  const rows = readForkRowsFromDir(outputDir);
  if (rows.length === 0) { console.error("fork_analyzer_no_rows"); return 2; }
  console.log(JSON.stringify(analyzeForkSecondary(rows), null, 2));
  return 0;
}

async function main(): Promise<number> {
  if (process.argv.includes("--preflight")) return runPreflightCli();
  if (process.argv.includes("--run-dev")) return runDevAnalysisCli();
  if (process.argv.includes("--secondary")) return runSecondaryCli();
  const outputDir = process.argv.includes("--output-dir")
    ? path.resolve(process.argv[process.argv.indexOf("--output-dir") + 1])
    : FORK_OUTPUT_DIR;
  const rows = readForkRowsFromDir(outputDir);
  if (rows.length === 0) { console.error("fork_analyzer_no_rows"); return 2; }
  const result = analyzeForkRows(rows);
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 4;
  });
}
