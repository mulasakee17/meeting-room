/**
 * F = U - T·S Cross-Task Robustness Verification — Fraud 38 Async Enriched Runs
 *
 * CRITICAL BIAS CHECK: The async engine has only 1-5 speaking agents per round.
 * The previous analysis used CARRY-FORWARD imputation (use last round's belief
 * for non-speaking agents) to maintain the n=5 vector. This artificially:
 *   - Sets Δb=0 for carry-forward agents → UNDERESTIMATES T_temporal
 *   - Underestimates T → makes T×S smaller → makes r(U, T×S) look more negative
 *     (falsely "decoupled")
 *
 * This script checks whether that bias invalidates the fraud results, and verifies
 * cross-task robustness of the corrected free energy F = U - T_corrected·S on the
 * 38 async enriched fraud runs alone.
 *
 * Background (from sync+async pooled analysis):
 *   - Corrected F = U - T·S where U=Σ|b| (L1 norm), T=temporal fluctuation
 *     (mean|b(t)-b(t-1)|), S=spatial Shannon entropy
 *   - r(U, T×S) = -0.274 (pooled), sync-only = -0.046 (near-orthogonal)
 *   - sync r(round, F) = -0.238 (free energy minimization)
 *   - Old r((1-R), T·H) = 0.917 (double-counting baseline)
 *
 * Output: experiments/v2/results/analyze_f_free_energy_robustness.json
 * Run:    npx tsx experiments/v2/analyze_f_free_energy_robustness.ts
 */

import * as fs from "fs";
import * as path from "path";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";
import { mulberry32, mean, sampleStd, kuramotoR } from "./statsShared";

// ============================================================================
// Types
// ============================================================================

const AGENT_ORDER = ["a1", "a2", "a3", "a4", "a5"];

interface RoundState {
  roundNumber: number;
  speakingAgents: string[];                 // agents with opinions in this round
  state: Record<string, number>;            // carry-forward state at end of round
  beliefs: number[];                        // a1..a5 from state (skip missing)
  speakingBeliefs: Record<string, number>;  // {agentId: belief} for speaking agents
}

interface AsyncRun {
  runId: string;
  subdir: string;
  filePath: string;
  maliciousAgentIds: string[];
  rounds: RoundState[];
}

// Per-round metrics (one row per round-observation, with both old & corrected T)
interface RoundMetrics {
  runId: string;
  subdir: string;
  maliciousAgentIds: string[];
  hasMalicious: boolean;
  roundNumber: number;
  n: number;                          // agents in carry-forward state
  nSpeaking: number;                  // agents speaking this round
  beliefs: number[];                  // all-agent beliefs (carry-forward)
  R: number;
  U: number;                          // L1 norm Σ|b_i| over all agents
  S: number;                          // Shannon entropy (5-bin) over all agents
  T_spatial: number;                  // clamp(sampleStd(b), 0, 1)
  // Temporal (round 1 = undefined)
  T_all?: number;                     // OLD: mean|Δb| including carry-forward (Δb=0)
  T_speaking?: number;                // CORRECTED: mean|Δb| for speaking agents only
  nSpeakingWithPrev?: number;         // # speaking agents with prior state
  nCarryForward?: number;             // # carry-forward agents (Δb=0)
  F_old?: number;                     // U - T_all * S
  F_corrected?: number;               // U - T_speaking * S
}

// ============================================================================
// Basic statistics
// ============================================================================

function pearsonR(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return NaN;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? NaN : num / den;
}

/** Permutation test for correlation: mulberry32(42), 10000 perms, (count+1)/(perms+1) p-value */
function permCorrTest(x: number[], y: number[], nPerms = 10000): { r: number; p: number; n: number } {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { r: NaN, p: NaN, n };
  const r = pearsonR(x, y);
  if (isNaN(r)) return { r: NaN, p: NaN, n };
  const observed = Math.abs(r);
  const rng = mulberry32(42);
  const yCopy = y.slice(0, n);
  const xSliced = x.slice(0, n);
  let count = 0;
  for (let p = 0; p < nPerms; p++) {
    for (let i = yCopy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [yCopy[i], yCopy[j]] = [yCopy[j], yCopy[i]];
    }
    const rPerm = Math.abs(pearsonR(xSliced, yCopy));
    if (rPerm >= observed) count++;
  }
  return { r, p: (count + 1) / (nPerms + 1), n };
}

/** Paired permutation test for mean difference (sign-swap permutation).
 *  Tests H0: mean(diffs) = 0. Returns {observedMean, p, n}. */
function permPairedMeanTest(diffs: number[], nPerms = 10000): { observedMean: number; p: number; n: number } {
  const n = diffs.length;
  if (n < 3) return { observedMean: NaN, p: NaN, n };
  const observed = mean(diffs);
  const observedAbs = Math.abs(observed);
  const rng = mulberry32(42);
  let count = 0;
  for (let p = 0; p < nPerms; p++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      // sign-swap: with 0.5 prob flip sign of diffs[i]
      if (rng() < 0.5) s -= diffs[i];
      else s += diffs[i];
    }
    if (Math.abs(s / n) >= observedAbs) count++;
  }
  return { observedMean: observed, p: (count + 1) / (nPerms + 1), n };
}

function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
}

function fmt(v: number | undefined | null, d: number): string {
  if (v === undefined || v === null || isNaN(v)) return "NaN";
  return v.toFixed(d);
}

// ============================================================================
// Metric computations (same conventions as analyze_social_thermodynamics.ts)
// ============================================================================

/** 5-bin belief binning: [-1,-0.6),[-0.6,-0.2),[-0.2,0.2),[0.2,0.6),[0.6,1.0] */
function beliefBin(b: number): number {
  if (b < -0.6) return 0;
  if (b < -0.2) return 1;
  if (b < 0.2) return 2;
  if (b < 0.6) return 3;
  return 4;
}

/** Shannon entropy (5-bin belief distribution) */
function computeH(beliefs: number[]): number {
  const n = beliefs.length;
  if (n === 0) return 0;
  const counts = [0, 0, 0, 0, 0];
  for (const b of beliefs) counts[beliefBin(b)]++;
  let H = 0;
  for (const c of counts) {
    if (c === 0) continue;
    const p = c / n;
    H -= p * Math.log2(p);
  }
  return H;
}

/** T_spatial = clamp(sampleStd(b), 0, 1) */
function computeT(beliefs: number[]): number {
  return Math.max(0, Math.min(1, sampleStd(beliefs)));
}

// ============================================================================
// Data loading — async enriched fraud runs
// ============================================================================

function isEnriched(data: Record<string, unknown>): boolean {
  const rr = data.roundResults;
  if (!Array.isArray(rr) || rr.length === 0) return false;
  const r0 = rr[0] as Record<string, unknown>;
  const ops = r0.opinions;
  if (!Array.isArray(ops) || ops.length === 0) return false;
  const ib = (ops[0] as Record<string, unknown>).itemBeliefs;
  return Array.isArray(ib) && ib.length > 0;
}

function loadAsyncFraud(): AsyncRun[] {
  const out: AsyncRun[] = [];
  const v2Dir = __dirname;
  const dirs = ["data_fraud_qwen", "data_fraud_zhipu", "data_fraud_malicious"];
  for (const dir of dirs) {
    const fullDir = path.join(v2Dir, dir);
    if (!fs.existsSync(fullDir)) continue;
    const files = fs.readdirSync(fullDir).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const raw = fs.readFileSync(path.join(fullDir, file), "utf-8");
      const data = safeJsonParse<Record<string, unknown>>(raw);
      if (!data || !isEnriched(data)) continue;
      const rr = data.roundResults as Array<Record<string, unknown>>;
      const runId = typeof data.runId === "string" ? data.runId : file;
      const malIds = Array.isArray(data.maliciousAgentIds)
        ? (data.maliciousAgentIds as unknown[]).filter(x => typeof x === "string") as string[]
        : [];

      const rounds: RoundState[] = [];
      const state: Record<string, number> = {};

      for (let i = 0; i < rr.length; i++) {
        const r = rr[i];
        const ops = r.opinions as Array<Record<string, unknown>> | undefined;
        const speakingBeliefs: Record<string, number> = {};
        const speakingAgents: string[] = [];
        if (Array.isArray(ops)) {
          for (const op of ops) {
            const aid = op.agentId as string;
            const bel = op.belief as number;
            if (typeof aid === "string" && typeof bel === "number" && !isNaN(bel)) {
              state[aid] = bel;
              speakingBeliefs[aid] = bel;
              speakingAgents.push(aid);
            }
          }
        }
        const beliefs: number[] = [];
        for (const a of AGENT_ORDER) {
          const v = state[a];
          if (typeof v === "number" && !isNaN(v)) beliefs.push(v);
        }
        rounds.push({
          roundNumber: typeof r.roundNumber === "number" ? r.roundNumber : i + 1,
          speakingAgents,
          state: { ...state },
          beliefs,
          speakingBeliefs,
        });
      }

      out.push({
        runId, subdir: dir, filePath: file,
        maliciousAgentIds: malIds,
        rounds,
      });
    }
  }
  return out;
}

// ============================================================================
// Build per-round metrics with both T_all (old) and T_speaking (corrected)
// ============================================================================

function buildMetrics(runs: AsyncRun[], excludeMalicious = false): RoundMetrics[] {
  const out: RoundMetrics[] = [];
  for (const run of runs) {
    const malSet = new Set(run.maliciousAgentIds);
    for (let i = 0; i < run.rounds.length; i++) {
      const cur = run.rounds[i];
      // Select beliefs for this round (optionally excluding malicious agents)
      const beliefsAll = excludeMalicious
        ? AGENT_ORDER.filter(a => !malSet.has(a) && typeof cur.state[a] === "number")
            .map(a => cur.state[a])
        : cur.beliefs;
      if (beliefsAll.length < 2) continue;

      const R = kuramotoR(beliefsAll);
      const U = beliefsAll.reduce((s, b) => s + Math.abs(b), 0);
      const S = computeH(beliefsAll);
      const T_spatial = computeT(beliefsAll);
      const nSpeaking = cur.speakingAgents.length;

      const m: RoundMetrics = {
        runId: run.runId,
        subdir: run.subdir,
        maliciousAgentIds: run.maliciousAgentIds,
        hasMalicious: run.maliciousAgentIds.length > 0,
        roundNumber: cur.roundNumber,
        n: beliefsAll.length,
        nSpeaking,
        beliefs: beliefsAll,
        R, U, S, T_spatial,
      };

      // Temporal: round 1 has no previous
      if (i > 0) {
        const prev = run.rounds[i - 1];
        // Speaking agents at current round that also had prior state
        const speakingDeltas: number[] = [];
        let nCarryForward = 0;
        let nSpeakingWithPrev = 0;
        for (const a of cur.speakingAgents) {
          // Optionally skip malicious agents
          if (excludeMalicious && malSet.has(a)) continue;
          const curB = cur.speakingBeliefs[a];
          const prevB = prev.state[a];
          if (typeof curB === "number" && typeof prevB === "number" && !isNaN(curB) && !isNaN(prevB)) {
            speakingDeltas.push(Math.abs(curB - prevB));
            nSpeakingWithPrev++;
          }
        }
        // Carry-forward agents: in prev.state but NOT speaking this round (and still in current state)
        for (const a of AGENT_ORDER) {
          if (cur.speakingAgents.includes(a)) continue;
          if (excludeMalicious && malSet.has(a)) continue;
          const prevB = prev.state[a];
          const curB = cur.state[a];
          if (typeof prevB === "number" && typeof curB === "number" && !isNaN(prevB) && !isNaN(curB)) {
            // Δb = 0 by carry-forward construction
            nCarryForward++;
          }
        }

        m.nSpeakingWithPrev = nSpeakingWithPrev;
        m.nCarryForward = nCarryForward;

        // T_all (old, with carry-forward): mean over (speaking deltas + zeros for carry-forward)
        const allDeltas = speakingDeltas.slice();
        for (let k = 0; k < nCarryForward; k++) allDeltas.push(0);
        if (allDeltas.length > 0) {
          m.T_all = mean(allDeltas);
          m.F_old = U - m.T_all * S;
        }

        // T_speaking (corrected): mean over speaking deltas only
        if (speakingDeltas.length > 0) {
          m.T_speaking = mean(speakingDeltas);
          m.F_corrected = U - m.T_speaking * S;
        }
      }

      out.push(m);
    }
  }
  return out;
}

// ============================================================================
// Analysis 1: Carry-forward bias quantification
// ============================================================================

interface BiasResult {
  totalTransitions: number;          // Σ (nSpeakingWithPrev + nCarryForward)
  totalSpeaking: number;             // Σ nSpeakingWithPrev
  totalCarryForward: number;         // Σ nCarryForward
  pctCarryForward: number;           // carry-forward / total × 100
  meanDeltaSpeaking: number;         // mean of all speaking Δb
  meanDeltaCarryForward: number;     // = 0 by construction
  meanT_all: number;                 // old method (with carry-forward)
  meanT_speaking: number;            // corrected (speaking only)
  ratioT_allOverT_speaking: number;  // T_all / T_speaking (how much T is suppressed)
  suppressionFactor: number;         // 1 - T_all/T_speaking (fraction of T lost to bias)
  pairedTest: { observedMean: number; p: number; n: number }; // T_speaking - T_all paired test
  perRunPairedDiffs: number[];       // for distributional inspection
  biasSignificant: boolean;          // p < 0.05 AND suppression > 10%
}

function analyzeBias(metrics: RoundMetrics[]): BiasResult {
  // Aggregate per-round speaking deltas & carry-forward counts
  const allSpeakingDeltas: number[] = [];
  let totalTransitions = 0, totalSpeaking = 0, totalCarryForward = 0;
  // Per-transition paired (T_speaking, T_all)
  const perTransition: { tAll: number; tSpeaking: number }[] = [];

  for (const m of metrics) {
    if (m.T_all === undefined || m.T_speaking === undefined) continue;
    if (m.nSpeakingWithPrev === undefined || m.nCarryForward === undefined) continue;
    totalSpeaking += m.nSpeakingWithPrev;
    totalCarryForward += m.nCarryForward;
    totalTransitions += m.nSpeakingWithPrev + m.nCarryForward;
    perTransition.push({ tAll: m.T_all, tSpeaking: m.T_speaking });
  }

  // mean Δb_speaking: we reconstruct from T_speaking * nSpeakingWithPrev weighted
  // Simpler: collect raw deltas by recomputing from runs. But metrics already aggregate.
  // We can compute mean Δb_speaking = (Σ T_speaking_i * nSpeaking_i) / (Σ nSpeaking_i)
  // We need nSpeaking per metric — but we only kept nSpeakingWithPrev. Use weighted mean.
  let weightedDeltaSum = 0, weightedDeltaN = 0;
  for (const m of metrics) {
    if (m.T_speaking === undefined || m.nSpeakingWithPrev === undefined) continue;
    weightedDeltaSum += m.T_speaking * m.nSpeakingWithPrev;
    weightedDeltaN += m.nSpeakingWithPrev;
  }
  const meanDeltaSpeaking = weightedDeltaN > 0 ? weightedDeltaSum / weightedDeltaN : NaN;

  const pctCarryForward = totalTransitions > 0 ? (totalCarryForward / totalTransitions) * 100 : NaN;

  const tAllArr = perTransition.map(p => p.tAll);
  const tSpeakArr = perTransition.map(p => p.tSpeaking);
  const meanT_all = tAllArr.length ? mean(tAllArr) : NaN;
  const meanT_speaking = tSpeakArr.length ? mean(tSpeakArr) : NaN;
  const ratio = meanT_speaking !== 0 && !isNaN(meanT_speaking) ? meanT_all / meanT_speaking : NaN;
  const suppression = !isNaN(meanT_speaking) && meanT_speaking !== 0 ? 1 - (meanT_all / meanT_speaking) : NaN;

  // Paired permutation test on per-transition (T_speaking - T_all) > 0
  const pairedDiffs = perTransition.map(p => p.tSpeaking - p.tAll);
  const pairedTest = permPairedMeanTest(pairedDiffs);

  const biasSignificant = pairedTest.p < 0.05 && !isNaN(suppression) && suppression > 0.10;

  return {
    totalTransitions, totalSpeaking, totalCarryForward,
    pctCarryForward,
    meanDeltaSpeaking,
    meanDeltaCarryForward: 0,
    meanT_all, meanT_speaking,
    ratioT_allOverT_speaking: ratio,
    suppressionFactor: suppression,
    pairedTest,
    perRunPairedDiffs: pairedDiffs,
    biasSignificant,
  };
}

function printBias(res: BiasResult): void {
  console.log(`\n  Total agent-round transitions: ${res.totalTransitions}`);
  console.log(`    Speaking (with prior state): ${res.totalSpeaking}`);
  console.log(`    Carry-forward (Δb=0 by construction): ${res.totalCarryForward}`);
  console.log(`  % carry-forward transitions: ${fmt(res.pctCarryForward, 2)}%`);
  console.log(`  mean Δb_speaking     = ${fmt(res.meanDeltaSpeaking, 5)}`);
  console.log(`  mean Δb_carryforward = ${fmt(res.meanDeltaCarryForward, 5)}  (by construction)`);
  console.log(`  T_temporal OLD      (with carry-forward)   mean = ${fmt(res.meanT_all, 5)}`);
  console.log(`  T_temporal CORRECTED (speaking only)       mean = ${fmt(res.meanT_speaking, 5)}`);
  console.log(`  Ratio T_all / T_speaking     = ${fmt(res.ratioT_allOverT_speaking, 4)}`);
  console.log(`  Suppression factor (1 - T_all/T_speaking) = ${fmt(res.suppressionFactor, 4)}  (fraction of T lost to bias)`);
  console.log(`  Paired permutation test (T_speaking - T_all > 0):`);
  console.log(`    observed mean diff = ${fmt(res.pairedTest.observedMean, 5)}`);
  console.log(`    p = ${fmt(res.pairedTest.p, 6)}  (n=${res.pairedTest.n})`);
  console.log(`  BIAS SIGNIFICANT (p<0.05 AND suppression>10%): ${res.biasSignificant ? "YES — bias may invalidate old results" : "NO — bias is minor or not detected"}`);
}

// ============================================================================
// Analysis 2: F decoupling on fraud (corrected vs old)
// ============================================================================

interface DecouplingResult {
  Nobs: number;
  corrMatrix: { names: string[]; r: number[][] };
  rU_TS: { r: number; p: number; n: number };
  rU_T: { r: number; p: number; n: number };
  rU_S: { r: number; p: number; n: number };
  rT_S: { r: number; p: number; n: number };
  oldR_1mR_TH: { r: number; p: number; n: number };
  oldCouplingReference: number;
}

function analyzeDecoupling(
  metrics: RoundMetrics[],
  tField: "T_speaking" | "T_all",
): DecouplingResult {
  const sub = metrics.filter(m => m[tField] !== undefined && !isNaN(m[tField]!));
  const U = sub.map(m => m.U);
  const Tt = sub.map(m => m[tField]!);
  const Ss = sub.map(m => m.S);
  const TS = Tt.map((t, i) => t * Ss[i]);

  const names = ["U", "T_temporal", "S_spatial"];
  const arrs = [U, Tt, Ss];
  const r: number[][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i][j] = i === j ? 1 : pearsonR(arrs[i], arrs[j]);

  const rU_TS = permCorrTest(U, TS);
  const rU_T = permCorrTest(U, Tt);
  const rU_S = permCorrTest(U, Ss);
  const rT_S = permCorrTest(Tt, Ss);

  const oneMinusR = sub.map(m => 1 - m.R);
  const TH = sub.map(m => m.T_spatial * m.S);
  const oldR_1mR_TH = permCorrTest(oneMinusR, TH);

  return {
    Nobs: sub.length,
    corrMatrix: { names, r },
    rU_TS, rU_T, rU_S, rT_S,
    oldR_1mR_TH,
    oldCouplingReference: 0.9175,
  };
}

function printDecoupling(res: DecouplingResult, label: string): void {
  console.log(`\n  [${label}]  N_obs (rounds with T_temporal) = ${res.Nobs}`);
  console.log("  3×3 Pearson correlation matrix (U, T_temporal, S_spatial):");
  const nm = res.corrMatrix.names;
  let header = "              ";
  for (const n of nm) header += n.padStart(14) + " ";
  console.log(header);
  for (let i = 0; i < 3; i++) {
    let row = nm[i].padEnd(12) + " ";
    for (let j = 0; j < 3; j++) row += fmt(res.corrMatrix.r[i][j], 4).padStart(14) + " ";
    console.log(row);
  }
  console.log(`\n  r(U, T_temporal)             = ${fmt(res.rU_T.r, 4)}  p = ${fmt(res.rU_T.p, 5)}  (n=${res.rU_T.n})`);
  console.log(`  r(U, S_spatial)              = ${fmt(res.rU_S.r, 4)}  p = ${fmt(res.rU_S.p, 5)}  (n=${res.rU_S.n})`);
  console.log(`  r(T_temporal, S_spatial)     = ${fmt(res.rT_S.r, 4)}  p = ${fmt(res.rT_S.p, 5)}  (n=${res.rT_S.n})`);
  console.log(`  r(U, T×S)                    = ${fmt(res.rU_TS.r, 4)}  p = ${fmt(res.rU_TS.p, 5)}  (n=${res.rU_TS.n})`);
  console.log(`  r((1-R), T·H) on this data  = ${fmt(res.oldR_1mR_TH.r, 4)}  p = ${fmt(res.oldR_1mR_TH.p, 5)}`);
  console.log(`  Old reference r((1-R), T·H) = ${res.oldCouplingReference} (pooled sync+async baseline)`);
}

// ============================================================================
// Analysis 3: F minimization on fraud (corrected)
// ============================================================================

interface TrajectoryResult {
  Nobs: number;
  meanFPerRound: { round: number; meanF: number; n: number }[];
  rRoundF: { r: number; p: number; n: number };
  fDecreases: boolean;
  reboundRounds4to6: { round: number; meanF: number; n: number }[];
  byMalicious: {
    malicious: TrajectorySub;
    nonMalicious: TrajectorySub;
  };
}

interface TrajectorySub {
  Nobs: number;
  meanFPerRound: { round: number; meanF: number; n: number }[];
  rRoundF: { r: number; p: number; n: number };
}

function analyzeTrajectory(metrics: RoundMetrics[], fField: "F_corrected" | "F_old"): TrajectoryResult {
  // F for round 1: T_temporal undefined → use F = U (T=0 → F = U - 0*S = U)
  const obs: { round: number; F: number; hasMalicious: boolean }[] = [];
  for (const m of metrics) {
    const F = m[fField] !== undefined ? m[fField]! : m.U;
    obs.push({ round: m.roundNumber, F, hasMalicious: m.hasMalicious });
  }

  const roundSet = [...new Set(obs.map(o => o.round))].sort((a, b) => a - b);
  const meanFPerRound = roundSet.filter(r => r <= 6).map(r => {
    const Fs = obs.filter(o => o.round === r).map(o => o.F);
    return { round: r, meanF: mean(Fs), n: Fs.length };
  });

  const rArr = obs.map(o => o.round);
  const fArr = obs.map(o => o.F);
  const rRoundF = permCorrTest(rArr, fArr);

  // Rebound in rounds 4-6: mean F at rounds 4,5,6 vs round 3
  const rebound = meanFPerRound.filter(r => r.round >= 4 && r.round <= 6);

  // By malicious status
  const malObs = obs.filter(o => o.hasMalicious);
  const nonMalObs = obs.filter(o => !o.hasMalicious);
  const sub = (arr: typeof obs): TrajectorySub => {
    if (arr.length === 0) return { Nobs: 0, meanFPerRound: [], rRoundF: { r: NaN, p: NaN, n: 0 } };
    const rs = [...new Set(arr.map(o => o.round))].sort((a, b) => a - b);
    const mf = rs.filter(r => r <= 6).map(r => {
      const Fs = arr.filter(o => o.round === r).map(o => o.F);
      return { round: r, meanF: mean(Fs), n: Fs.length };
    });
    return {
      Nobs: arr.length,
      meanFPerRound: mf,
      rRoundF: permCorrTest(arr.map(o => o.round), arr.map(o => o.F)),
    };
  };

  return {
    Nobs: obs.length,
    meanFPerRound,
    rRoundF,
    fDecreases: rRoundF.r < 0,
    reboundRounds4to6: rebound,
    byMalicious: {
      malicious: sub(malObs),
      nonMalicious: sub(nonMalObs),
    },
  };
}

function printTrajectory(res: TrajectoryResult, label: string): void {
  console.log(`\n  [${label}]  N_obs = ${res.Nobs}`);
  console.log("  F trajectory (mean F per round):");
  console.log("  round      mean(F)      n");
  for (const r of res.meanFPerRound) {
    console.log("  " + String(r.round).padStart(5) + "   " + fmt(r.meanF, 5).padStart(11) + " " + String(r.n).padStart(6));
  }
  console.log(`\n  r(round, F) = ${fmt(res.rRoundF.r, 4)}  p = ${fmt(res.rRoundF.p, 5)}  (n=${res.rRoundF.n})`);
  console.log(`  F decreases over rounds (r<0): ${res.fDecreases ? "YES — free energy minimization supported" : "NO"}`);
  if (res.reboundRounds4to6.length > 0) {
    const r3 = res.meanFPerRound.find(r => r.round === 3);
    console.log(`  Rebound check (rounds 4-6 vs round 3):`);
    if (r3) console.log(`    round 3 mean(F) = ${fmt(r3.meanF, 5)}`);
    for (const r of res.reboundRounds4to6) {
      const diff = r3 ? r.meanF - r3.meanF : NaN;
      console.log(`    round ${r.round} mean(F) = ${fmt(r.meanF, 5)}  (Δ vs r3 = ${fmt(diff, 5)} ${diff > 0 ? "↑ REBOUND" : "↓"})`);
    }
  }
  console.log(`\n  Malicious vs non-malicious breakdown:`);
  for (const [name, sub] of [["malicious", res.byMalicious.malicious], ["non-malicious", res.byMalicious.nonMalicious]] as const) {
    console.log(`    [${name}] N=${sub.Nobs}  r(round,F) = ${fmt(sub.rRoundF.r, 4)}  p = ${fmt(sub.rRoundF.p, 5)}`);
  }
}

// ============================================================================
// Analysis 4: Malicious agent impact on F
// ============================================================================

interface MaliciousImpactResult {
  nMaliciousRuns: number;
  nNonMaliciousRuns: number;
  withMalicious: DecouplingResult & { trajectory: TrajectoryResult };
  withoutMalicious: DecouplingResult & { trajectory: TrajectoryResult };
  deltaRU_TS: number;       // r(U,T×S) without - with
  deltaRRoundF: number;     // r(round,F) without - with
  robustToMalicious: boolean;
}

function analyzeMaliciousImpact(runs: AsyncRun[]): MaliciousImpactResult {
  const maliciousRuns = runs.filter(r => r.maliciousAgentIds.length > 0);
  const nonMaliciousRuns = runs.filter(r => r.maliciousAgentIds.length === 0);

  // WITH malicious: all runs, all agents
  const metricsWith = buildMetrics(runs, false);
  // WITHOUT malicious: malicious runs have their malicious agents excluded;
  // non-malicious runs are unchanged.
  const metricsWithout = buildMetrics(runs, true);

  const withDecoup = analyzeDecoupling(metricsWith, "T_speaking");
  const withoutDecoup = analyzeDecoupling(metricsWithout, "T_speaking");
  const withTraj = analyzeTrajectory(metricsWith, "F_corrected");
  const withoutTraj = analyzeTrajectory(metricsWithout, "F_corrected");

  const deltaRU_TS = withoutDecoup.rU_TS.r - withDecoup.rU_TS.r;
  const deltaRRoundF = withoutTraj.rRoundF.r - withTraj.rRoundF.r;

  // Robust if sign of r(U,T×S) doesn't flip AND |Δr(U,T×S)| < 0.15
  const sameSign = Math.sign(withDecoup.rU_TS.r) === Math.sign(withoutDecoup.rU_TS.r);
  const robustToMalicious = sameSign && Math.abs(deltaRU_TS) < 0.15 && Math.abs(deltaRRoundF) < 0.15;

  return {
    nMaliciousRuns: maliciousRuns.length,
    nNonMaliciousRuns: nonMaliciousRuns.length,
    withMalicious: { ...withDecoup, trajectory: withTraj },
    withoutMalicious: { ...withoutDecoup, trajectory: withoutTraj },
    deltaRU_TS, deltaRRoundF,
    robustToMalicious,
  };
}

// ============================================================================
// Analysis 5: Cross-task comparison summary (loads sync from prior JSON)
// ============================================================================

interface SyncReference {
  rU_TS: number;
  rU_T: number;
  rU_S: number;
  rT_S: number;
  rRoundF: number;
  oldR_1mR_TH_sync: number;
  oldR_1mR_TH_pooled: number;
  source: string;
}

function loadSyncReference(): SyncReference | null {
  const jsonPath = path.join(__dirname, "results", "analyze_social_thermodynamics.json");
  if (!fs.existsSync(jsonPath)) return null;
  const raw = fs.readFileSync(jsonPath, "utf-8");
  const data = safeJsonParse<Record<string, unknown>>(raw);
  if (!data) return null;
  const a3 = data.analysis3_decoupling as { sync: { corrMatrix: { r: number[][] }; rU_TS: { r: number }; oldR_1mR_TH: { r: number } } } | undefined;
  const a4 = data.analysis4_trajectory as { sync: { rRoundF: { r: number } } } | undefined;
  if (!a3 || !a4) return null;
  const m = a3.sync.corrMatrix.r;
  return {
    rU_TS: a3.sync.rU_TS.r,
    rU_T: m[0][1],
    rU_S: m[0][2],
    rT_S: m[1][2],
    rRoundF: a4.sync.rRoundF.r,
    oldR_1mR_TH_sync: a3.sync.oldR_1mR_TH.r,
    oldR_1mR_TH_pooled: 0.9175,
    source: jsonPath,
  };
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log("=".repeat(100));
  console.log("F = U - T·S Cross-Task Robustness — Fraud 38 Async Enriched Runs");
  console.log("WITH Carry-Forward Bias Check");
  console.log("=".repeat(100));

  const runs = loadAsyncFraud();
  const metrics = buildMetrics(runs, false);

  // Run breakdown
  const runCounts: Record<string, number> = {};
  for (const r of runs) runCounts[r.subdir] = (runCounts[r.subdir] || 0) + 1;
  console.log("\nData loaded:");
  console.log(`  Fraud async enriched runs: ${runs.length}`);
  for (const [d, n] of Object.entries(runCounts)) console.log(`    ${d}: ${n}`);
  const malRuns = runs.filter(r => r.maliciousAgentIds.length > 0).length;
  console.log(`  Malicious runs (maliciousAgentIds non-empty): ${malRuns}`);
  console.log(`  Non-malicious runs: ${runs.length - malRuns}`);
  console.log(`  Round-observations: ${metrics.length}`);

  const results: Record<string, unknown> = {
    meta: {
      script: "analyze_f_free_energy_robustness.ts",
      nRuns: runs.length,
      nRoundObs: metrics.length,
      nMaliciousRuns: malRuns,
      nNonMaliciousRuns: runs.length - malRuns,
      generatedAt: new Date().toISOString(),
    },
  };

  // ── Analysis 1: Carry-forward bias quantification ──
  console.log("\n" + "=".repeat(100));
  console.log("Analysis 1: Carry-Forward Bias Quantification");
  console.log("  Risk: carry-forward sets Δb=0 for non-speaking agents → underestimates T_temporal");
  console.log("        → makes r(U, T×S) look more negative (falsely 'decoupled')");
  console.log("-".repeat(100));

  const bias = analyzeBias(metrics);
  printBias(bias);
  results.analysis1_carryForwardBias = {
    totalTransitions: bias.totalTransitions,
    totalSpeaking: bias.totalSpeaking,
    totalCarryForward: bias.totalCarryForward,
    pctCarryForward: bias.pctCarryForward,
    meanDeltaSpeaking: bias.meanDeltaSpeaking,
    meanDeltaCarryForward: bias.meanDeltaCarryForward,
    meanT_all: bias.meanT_all,
    meanT_speaking: bias.meanT_speaking,
    ratioT_allOverT_speaking: bias.ratioT_allOverT_speaking,
    suppressionFactor: bias.suppressionFactor,
    pairedTest: bias.pairedTest,
    biasSignificant: bias.biasSignificant,
  };

  // ── Analysis 2: F decoupling on fraud (corrected) ──
  console.log("\n" + "=".repeat(100));
  console.log("Analysis 2: F Decoupling on Fraud 38 (Corrected vs Old)");
  console.log("  Corrected: T_speaking (only speaking agents' Δb — unbiased)");
  console.log("  Old:       T_all (carry-forward included — biased)");
  console.log("-".repeat(100));

  const decoupCorrected = analyzeDecoupling(metrics, "T_speaking");
  printDecoupling(decoupCorrected, "FRAUD 38 — CORRECTED (T_speaking)");

  const decoupOld = analyzeDecoupling(metrics, "T_all");
  printDecoupling(decoupOld, "FRAUD 38 — OLD (T_all, with carry-forward bias)");

  console.log("\n  --- Bias Impact on Decoupling ---");
  console.log(`  r(U, T×S) CORRECTED = ${fmt(decoupCorrected.rU_TS.r, 4)}`);
  console.log(`  r(U, T×S) OLD       = ${fmt(decoupOld.rU_TS.r, 4)}`);
  console.log(`  Δ (corrected - old) = ${fmt(decoupCorrected.rU_TS.r - decoupOld.rU_TS.r, 4)}`);
  console.log(`  Sync reference r(U, T×S) = -0.046`);
  console.log(`  Old pooled r((1-R), T·H) = 0.9175 (double-counting baseline)`);

  // Verdict
  const rU_TS_corr = decoupCorrected.rU_TS.r;
  let decoupVerdict: string;
  if (rU_TS_corr < 0.3 && Math.abs(rU_TS_corr - (-0.046)) < 0.3) {
    decoupVerdict = "CROSS-TASK ROBUST (corrected r(U,T×S) < 0.3 AND consistent with sync -0.046)";
  } else if (rU_TS_corr > 0.5) {
    decoupVerdict = "DECOUPLING FAILS ON FRAUD (r > 0.5; sync may have been a fluke)";
  } else if (Math.abs(rU_TS_corr - decoupOld.rU_TS.r) > 0.15) {
    decoupVerdict = "BIAS WAS SIGNIFICANT (corrected differs from old by > 0.15)";
  } else {
    decoupVerdict = "AMBIGUOUS — corrected r(U,T×S) is in the borderline zone";
  }
  console.log(`  VERDICT: ${decoupVerdict}`);

  results.analysis2_decoupling = {
    corrected: decoupCorrected,
    old: decoupOld,
    deltaR_U_TS: decoupCorrected.rU_TS.r - decoupOld.rU_TS.r,
    syncReference_rU_TS: -0.046,
    oldPooledReference_r_1mR_TH: 0.9175,
    verdict: decoupVerdict,
  };

  // ── Analysis 3: F minimization on fraud (corrected) ──
  console.log("\n" + "=".repeat(100));
  console.log("Analysis 3: F Minimization on Fraud 38 (Corrected)");
  console.log("  Hypothesis: F_corrected = U - T_speaking×S decreases over rounds");
  console.log("-".repeat(100));

  const trajCorrected = analyzeTrajectory(metrics, "F_corrected");
  printTrajectory(trajCorrected, "FRAUD 38 — F_corrected");
  const trajOld = analyzeTrajectory(metrics, "F_old");
  printTrajectory(trajOld, "FRAUD 38 — F_old (with carry-forward bias)");

  console.log(`\n  Sync reference r(round, F) = -0.238`);
  console.log(`  Fraud r(round, F_corrected) = ${fmt(trajCorrected.rRoundF.r, 4)}`);
  console.log(`  Fraud r(round, F_old)       = ${fmt(trajOld.rRoundF.r, 4)}`);

  results.analysis3_trajectory = {
    corrected: trajCorrected,
    old: trajOld,
    syncReference_rRoundF: -0.238,
  };

  // ── Analysis 4: Malicious agent impact on F ──
  console.log("\n" + "=".repeat(100));
  console.log("Analysis 4: Malicious Agent Impact on F");
  console.log("  Malicious agents have σ²(b)≈0 (frozen belief) — could bias F.");
  console.log("  Test: recompute F with vs without malicious agents.");
  console.log("-".repeat(100));

  const malImpact = analyzeMaliciousImpact(runs);
  console.log(`\n  Malicious runs: ${malImpact.nMaliciousRuns}`);
  console.log(`  Non-malicious runs: ${malImpact.nNonMaliciousRuns}`);
  console.log("\n  WITH malicious agents (all agents in vector):");
  printDecoupling(malImpact.withMalicious, "WITH malicious");
  console.log(`    r(round, F) = ${fmt(malImpact.withMalicious.trajectory.rRoundF.r, 4)}`);
  console.log("\n  WITHOUT malicious agents (excluded from vector):");
  printDecoupling(malImpact.withoutMalicious, "WITHOUT malicious");
  console.log(`    r(round, F) = ${fmt(malImpact.withoutMalicious.trajectory.rRoundF.r, 4)}`);
  console.log(`\n  Δ r(U, T×S)  (without - with) = ${fmt(malImpact.deltaRU_TS, 4)}`);
  console.log(`  Δ r(round, F) (without - with) = ${fmt(malImpact.deltaRRoundF, 4)}`);
  console.log(`  Robust to malicious presence: ${malImpact.robustToMalicious ? "YES (sign stable, |Δ|<0.15)" : "NO (sign flip or |Δ|>=0.15)"}`);

  results.analysis4_maliciousImpact = {
    nMaliciousRuns: malImpact.nMaliciousRuns,
    nNonMaliciousRuns: malImpact.nNonMaliciousRuns,
    withMalicious: malImpact.withMalicious,
    withoutMalicious: malImpact.withoutMalicious,
    deltaRU_TS: malImpact.deltaRU_TS,
    deltaRRoundF: malImpact.deltaRRoundF,
    robustToMalicious: malImpact.robustToMalicious,
  };

  // ── Analysis 5: Cross-task comparison summary ──
  console.log("\n" + "=".repeat(100));
  console.log("Analysis 5: Cross-Task Comparison Summary");
  console.log("-".repeat(100));

  const syncRef = loadSyncReference();
  const fraudCorr = decoupCorrected.corrMatrix.r;
  const summaryTable = {
    sync: syncRef ? {
      rU_TS: syncRef.rU_TS,
      rU_T: syncRef.rU_T,
      rU_S: syncRef.rU_S,
      rT_S: syncRef.rT_S,
      rRoundF: syncRef.rRoundF,
      oldR_1mR_TH: syncRef.oldR_1mR_TH_sync,
    } : null,
    fraudCorrected: {
      rU_TS: decoupCorrected.rU_TS.r,
      rU_T: decoupCorrected.rU_T.r,
      rU_S: decoupCorrected.rU_S.r,
      rT_S: decoupCorrected.rT_S.r,
      rRoundF: trajCorrected.rRoundF.r,
      oldR_1mR_TH: decoupCorrected.oldR_1mR_TH.r,
    },
    fraudOld: {
      rU_TS: decoupOld.rU_TS.r,
      rU_T: decoupOld.rU_T.r,
      rU_S: decoupOld.rU_S.r,
      rT_S: decoupOld.rT_S.r,
      rRoundF: trajOld.rRoundF.r,
      oldR_1mR_TH: decoupOld.oldR_1mR_TH.r,
    },
    oldPooled_r_1mR_TH: 0.9175,
  };

  console.log("\n  | Metric              | Sync (169)    | Fraud (38, corrected) | Fraud (38, old)       | Verdict |");
  console.log("  |---------------------|---------------|------------------------|------------------------|---------|");
  const row = (name: string, syncV: number | null, fraudC: number, fraudO: number, verdict: string) => {
    const f = (v: number | null) => v === null ? "N/A" : fmt(v, 4);
    console.log(`  | ${name.padEnd(19)} | ${f(syncV).padStart(13)} | ${f(fraudC).padStart(22)} | ${f(fraudO).padStart(22)} | ${verdict} |`);
  };
  row("r(U, T×S)", syncRef?.rU_TS ?? null, decoupCorrected.rU_TS.r, decoupOld.rU_TS.r,
    (Math.abs(decoupCorrected.rU_TS.r) < 0.3 && Math.abs(decoupCorrected.rU_TS.r - (syncRef?.rU_TS ?? -0.046)) < 0.3) ? "ROBUST" : "CHECK");
  row("r(U, T)", syncRef?.rU_T ?? null, decoupCorrected.rU_T.r, decoupOld.rU_T.r, "");
  row("r(U, S)", syncRef?.rU_S ?? null, decoupCorrected.rU_S.r, decoupOld.rU_S.r, "");
  row("r(T, S)", syncRef?.rT_S ?? null, decoupCorrected.rT_S.r, decoupOld.rT_S.r, "");
  row("r(round, F)", syncRef?.rRoundF ?? null, trajCorrected.rRoundF.r, trajOld.rRoundF.r,
    (trajCorrected.rRoundF.r < 0) ? "F↓" : "F↑");
  row("old r((1-R), T·H)", syncRef?.oldR_1mR_TH_sync ?? null, decoupCorrected.oldR_1mR_TH.r, decoupOld.oldR_1mR_TH.r,
    (decoupCorrected.oldR_1mR_TH.r > 0.5) ? ">0.5 ✓" : "<0.5 ?");
  console.log(`\n  Old POOLED r((1-R), T·H) = 0.9175 (double-counting baseline, sync+async pooled)`);

  // Overall verdict
  console.log("\n  --- OVERALL CROSS-TASK ROBUSTNESS VERDICT ---");
  const rUTS_sync = syncRef?.rU_TS ?? -0.046;
  const rUTS_fraud = decoupCorrected.rU_TS.r;
  const rRF_sync = syncRef?.rRoundF ?? -0.238;
  const rRF_fraud = trajCorrected.rRoundF.r;

  const bothLowDecoupled = Math.abs(rUTS_sync) < 0.3 && Math.abs(rUTS_fraud) < 0.3;
  const bothFDecreasing = rRF_sync < 0 && rRF_fraud < 0;
  const biasMinor = !bias.biasSignificant || Math.abs(rUTS_fraud - decoupOld.rU_TS.r) < 0.15;

  console.log(`  r(U, T×S):  sync=${fmt(rUTS_sync, 4)}, fraud(corrected)=${fmt(rUTS_fraud, 4)}  → both |r|<0.3: ${bothLowDecoupled ? "YES" : "NO"}`);
  console.log(`  r(round, F): sync=${fmt(rRF_sync, 4)}, fraud(corrected)=${fmt(rRF_fraud, 4)}  → both negative: ${bothFDecreasing ? "YES" : "NO"}`);
  console.log(`  Carry-forward bias: ${bias.biasSignificant ? "DETECTED (significant)" : "minor or not detected"}`);
  console.log(`  Corrected vs old r(U,T×S) difference: ${fmt(Math.abs(rUTS_fraud - decoupOld.rU_TS.r), 4)}`);
  console.log(`  Robust to malicious agents: ${malImpact.robustToMalicious ? "YES" : "NO"}`);

  let overallVerdict: string;
  if (bothLowDecoupled && bothFDecreasing && biasMinor && malImpact.robustToMalicious) {
    overallVerdict = "✓ CROSS-TASK ROBUST — corrected F=U-T·S holds on fraud 38 async, bias does NOT invalidate results";
  } else if (bias.biasSignificant && !biasMinor) {
    overallVerdict = "✗ BIAS INVALIDATES — carry-forward bias was significant and changed r(U,T×S) by ≥0.15; fraud results not robust";
  } else if (!bothLowDecoupled) {
    overallVerdict = "✗ DECOUPLING NOT ROBUST — r(U, T×S) outside |r|<0.3 threshold on fraud";
  } else if (!bothFDecreasing) {
    overallVerdict = "✗ F MINIMIZATION NOT ROBUST — r(round, F) not negative on fraud";
  } else {
    overallVerdict = "△ PARTIALLY ROBUST — some criteria met, others failed";
  }
  console.log(`\n  >>> ${overallVerdict}`);

  results.analysis5_crossTaskSummary = {
    table: summaryTable,
    verdicts: {
      bothLowDecoupled,
      bothFDecreasing,
      biasSignificant: bias.biasSignificant,
      biasImpactMagnitude: Math.abs(rUTS_fraud - decoupOld.rU_TS.r),
      robustToMalicious: malImpact.robustToMalicious,
    },
    overallVerdict,
  };

  // Save JSON
  const outDir = path.join(__dirname, "results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "analyze_f_free_energy_robustness.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\nJSON saved to: ${outPath}`);
}

main();
