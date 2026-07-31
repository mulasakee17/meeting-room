/**
 * F = U - T·S Critical Verification — Is the Decoupling Real or an Artifact?
 *
 * 4 analyses to test if our core finding (F=U-TS decoupling) is genuine:
 *
 *   1. T independence check on fraud (THE KEY TEST)
 *      - On fraud 38 runs with T_corrected (speaking-only, no carry-forward bias)
 *      - Build full 3x3 correlation matrix U/T/S with permutation p-values
 *      - Compute partial correlation r(U, S | T)
 *      - Verdict: |r(T,U)|<0.3 AND |r(T,S)|<0.3 → REAL ; |r|>0.5 → QUESTIONABLE
 *
 *   2. r(R, T) definitional coupling check (CRITICAL)
 *      - Generate 10000 random belief vectors per distribution (n=5 agents)
 *      - Uniform(-1,1), Normal(0,0.5) clamped, Beta(2,5) shifted to [-1,1]
 *      - For each vector compute R=kuramotoR, T=clamp(sampleStd,0,1)
 *      - Compute r(R,T) on random vectors
 *      - If r ≈ -0.96 → DEFINITIONAL (any belief vector produces it) → "synergetic slaving" is an artifact
 *      - If r ≈ 0 → EMPIRICAL (specific to our data)
 *
 *   3. Scalar projection sign analysis
 *      - On fraud 38 runs with itemBeliefs
 *      - U_signed_max = itemBelief with max |belief|, preserving sign
 *      - b = scalar LLM belief
 *      - Compute r(U_signed, b), r(|U_signed|, |b|), sign agreement %,
 *        r(U_signed, b) for |U|>0.5 only and |U|<0.2 only
 *
 *   4. Summary verdict table
 *
 * Output: experiments/v2/results/analyze_f_critical_verification.json
 * Run:    npx tsx experiments/v2/analyze_f_critical_verification.ts
 */

import * as fs from "fs";
import * as path from "path";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";
import { mulberry32, mean, sampleStd, kuramotoR, PERMUTATION_SEED } from "./statsShared";

// ============================================================================
// Constants
// ============================================================================

const AGENT_ORDER = ["a1", "a2", "a3", "a4", "a5"];
const N_PERMS = 10000;

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
function permCorrTest(x: number[], y: number[], nPerms = N_PERMS): { r: number; p: number; n: number } {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { r: NaN, p: NaN, n };
  const r = pearsonR(x, y);
  if (isNaN(r)) return { r: NaN, p: NaN, n };
  const observed = Math.abs(r);
  const rng = mulberry32(PERMUTATION_SEED);
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

/**
 * Partial correlation r(x, y | z): OLS-residualize x and y on z (with intercept),
 * then Pearson r on the residuals. Permutation p-value via shuffling x residuals.
 */
function partialCorrTest(
  x: number[], y: number[], z: number[], nPerms = N_PERMS,
): { partialR: number; n: number; p: number; perms: number } {
  const n = Math.min(x.length, y.length, z.length);
  if (n < 3) return { partialR: NaN, n, p: NaN, perms: 0 };
  const xs = x.slice(0, n);
  const ys = y.slice(0, n);
  const zs = z.slice(0, n);

  // OLS residuals of v on cov (with intercept): v - (a + c*cov)
  function olsResiduals(vals: number[], cov: number[]): number[] {
    const mv = mean(vals);
    const mc = mean(cov);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (cov[i] - mc) * (vals[i] - mv);
      den += (cov[i] - mc) ** 2;
    }
    const slope = den === 0 ? 0 : num / den;
    const intercept = mv - slope * mc;
    return vals.map((v, i) => v - (intercept + slope * cov[i]));
  }

  const rx = olsResiduals(xs, zs);
  const ry = olsResiduals(ys, zs);
  const rObs = pearsonR(rx, ry);
  if (isNaN(rObs)) return { partialR: NaN, n, p: NaN, perms: 0 };

  const rng = mulberry32(PERMUTATION_SEED);
  let count = 0;
  const rxShuffled = rx.slice();
  for (let p = 0; p < nPerms; p++) {
    for (let i = rxShuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [rxShuffled[i], rxShuffled[j]] = [rxShuffled[j], rxShuffled[i]];
    }
    const rp = pearsonR(rxShuffled, ry);
    if (Math.abs(rp) >= Math.abs(rObs) - 1e-12) count++;
  }
  return { partialR: rObs, n, p: (count + 1) / (nPerms + 1), perms: nPerms };
}

function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
}

function fmt(v: number | undefined | null, d: number): string {
  if (v === undefined || v === null || isNaN(v as number)) return "NaN";
  return (v as number).toFixed(d);
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
// Data loading — async enriched fraud runs (with itemBeliefs)
// ============================================================================

interface ItemBelief {
  item: string;
  rank: number;
  belief: number;
  confidence: number;
}

interface Opinion {
  agentId: string;
  belief: number;
  confidence: number;
  itemBeliefs?: ItemBelief[];
}

interface RoundResult {
  roundNumber: number;
  opinions?: Opinion[];
}

interface FraudRun {
  runId: string;
  subdir: string;
  group?: string;
  kendallTau?: number;
  maliciousAgentIds?: string[];
  governanceEnabled?: boolean;
  roundResults?: RoundResult[];
}

interface RoundState {
  roundNumber: number;
  speakingAgents: string[];
  state: Record<string, number>;             // carry-forward state (end of round)
  beliefs: number[];                          // a1..a5 from state (skip missing)
  speakingBeliefs: Record<string, number>;   // {agentId: belief} for speaking agents
}

interface AsyncRun {
  runId: string;
  subdir: string;
  filePath: string;
  maliciousAgentIds: string[];
  rounds: RoundState[];
  rawRun: FraudRun;                           // for sign-projection analysis (itemBeliefs)
}

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
  const exclude = new Set(["summary.json", "enhanced_evaluation_results.json"]);
  for (const dir of dirs) {
    const fullDir = path.join(v2Dir, dir);
    if (!fs.existsSync(fullDir)) continue;
    const files = fs.readdirSync(fullDir).filter(f => f.endsWith(".json") && !exclude.has(f));
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

      const rawRun: FraudRun = {
        runId,
        subdir: dir,
        group: typeof data.group === "string" ? data.group : undefined,
        kendallTau: typeof data.kendallTau === "number" ? data.kendallTau : undefined,
        maliciousAgentIds: malIds,
        governanceEnabled: data.governanceEnabled === true,
        roundResults: rr as unknown as RoundResult[],
      };

      out.push({
        runId, subdir: dir, filePath: file,
        maliciousAgentIds: malIds,
        rounds,
        rawRun,
      });
    }
  }
  return out;
}

// ============================================================================
// Build per-round metrics with T_corrected (speaking-only) and T_all (with carry-forward)
// ============================================================================

interface RoundMetrics {
  runId: string;
  subdir: string;
  maliciousAgentIds: string[];
  hasMalicious: boolean;
  roundNumber: number;
  n: number;                          // agents in carry-forward state
  nSpeaking: number;
  beliefs: number[];                  // carry-forward all-agent vector
  R: number;
  U: number;                          // L1 norm Σ|b_i| over all agents
  S: number;                          // Shannon entropy (5-bin)
  T_spatial: number;                  // clamp(sampleStd(b), 0, 1)
  T_speaking?: number;                // CORRECTED: mean|Δb| for speaking agents only
  T_all?: number;                     // OLD: mean|Δb| including carry-forward (Δb=0)
  nSpeakingWithPrev?: number;
  nCarryForward?: number;
}

function buildMetrics(runs: AsyncRun[], excludeMalicious = false): RoundMetrics[] {
  const out: RoundMetrics[] = [];
  for (const run of runs) {
    const malSet = new Set(run.maliciousAgentIds);
    for (let i = 0; i < run.rounds.length; i++) {
      const cur = run.rounds[i];
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

      if (i > 0) {
        const prev = run.rounds[i - 1];
        const speakingDeltas: number[] = [];
        let nCarryForward = 0;
        let nSpeakingWithPrev = 0;
        for (const a of cur.speakingAgents) {
          if (excludeMalicious && malSet.has(a)) continue;
          const curB = cur.speakingBeliefs[a];
          const prevB = prev.state[a];
          if (typeof curB === "number" && typeof prevB === "number" && !isNaN(curB) && !isNaN(prevB)) {
            speakingDeltas.push(Math.abs(curB - prevB));
            nSpeakingWithPrev++;
          }
        }
        for (const a of AGENT_ORDER) {
          if (cur.speakingAgents.includes(a)) continue;
          if (excludeMalicious && malSet.has(a)) continue;
          const prevB = prev.state[a];
          const curB = cur.state[a];
          if (typeof prevB === "number" && typeof curB === "number" && !isNaN(prevB) && !isNaN(curB)) {
            nCarryForward++;
          }
        }

        m.nSpeakingWithPrev = nSpeakingWithPrev;
        m.nCarryForward = nCarryForward;

        // T_all (old, with carry-forward): mean over (speaking deltas + zeros for carry-forward)
        const allDeltas = speakingDeltas.slice();
        for (let k = 0; k < nCarryForward; k++) allDeltas.push(0);
        if (allDeltas.length > 0) m.T_all = mean(allDeltas);

        // T_speaking (corrected): mean over speaking deltas only
        if (speakingDeltas.length > 0) m.T_speaking = mean(speakingDeltas);
      }

      out.push(m);
    }
  }
  return out;
}

// ============================================================================
// Analysis 1: T independence check on fraud (THE KEY TEST)
// ============================================================================

interface TIndependenceResult {
  Nobs: number;
  corrMatrix: { names: string[]; r: number[][]; p: number[][] };
  rU_T: { r: number; p: number; n: number };
  rU_S: { r: number; p: number; n: number };
  rT_S: { r: number; p: number; n: number };
  rU_TS: { r: number; p: number; n: number };
  partialR_US_given_T: { partialR: number; n: number; p: number; perms: number };
  verdict_T_vs_U: string;
  verdict_T_vs_S: string;
  overallVerdict: string;
}

function analyzeT_Independence(metrics: RoundMetrics[]): TIndependenceResult {
  // Use only rounds with T_speaking (T_corrected) defined
  const sub = metrics.filter(m => m.T_speaking !== undefined && !isNaN(m.T_speaking!));
  const U = sub.map(m => m.U);
  const Tt = sub.map(m => m.T_speaking!);
  const Ss = sub.map(m => m.S);
  const TS = Tt.map((t, i) => t * Ss[i]);

  const names = ["U", "T_corrected", "S_spatial"];
  const arrs = [U, Tt, Ss];
  const r: number[][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const p: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (i === j) { r[i][j] = 1; p[i][j] = 0; }
      else {
        const t = permCorrTest(arrs[i], arrs[j]);
        r[i][j] = t.r;
        p[i][j] = t.p;
      }
    }
  }

  const rU_T = permCorrTest(U, Tt);
  const rU_S = permCorrTest(U, Ss);
  const rT_S = permCorrTest(Tt, Ss);
  const rU_TS = permCorrTest(U, TS);
  const partialR_US_given_T = partialCorrTest(U, Ss, Tt);

  // Verdicts based on |r| thresholds
  const verdict_T_vs_U =
    Math.abs(rU_T.r) < 0.3 ? "INDEPENDENT (|r|<0.3) → F decoupling REAL" :
    Math.abs(rU_T.r) > 0.5 ? "COUPLED (|r|>0.5) → F decoupling QUESTIONABLE" :
    "BORDERLINE (0.3 ≤ |r| ≤ 0.5)";
  const verdict_T_vs_S =
    Math.abs(rT_S.r) < 0.3 ? "INDEPENDENT (|r|<0.3) → F decoupling REAL" :
    Math.abs(rT_S.r) > 0.5 ? "COUPLED (|r|>0.5) → F decoupling QUESTIONABLE" :
    "BORDERLINE (0.3 ≤ |r| ≤ 0.5)";

  const bothIndependent = Math.abs(rU_T.r) < 0.3 && Math.abs(rT_S.r) < 0.3;
  const eitherCoupled = Math.abs(rU_T.r) > 0.5 || Math.abs(rT_S.r) > 0.5;
  const overallVerdict = bothIndependent
    ? "✓ F DECOUPLING REAL — T is independent of both U and S"
    : eitherCoupled
      ? "✗ F DECOUPLING QUESTIONABLE — T is coupled with U or S"
      : "△ PARTIAL — T is borderline (0.3-0.5); use caution";

  return {
    Nobs: sub.length,
    corrMatrix: { names, r, p },
    rU_T, rU_S, rT_S, rU_TS,
    partialR_US_given_T,
    verdict_T_vs_U,
    verdict_T_vs_S,
    overallVerdict,
  };
}

function printT_Independence(res: TIndependenceResult): void {
  console.log(`\n  N_obs (rounds with T_corrected) = ${res.Nobs}`);
  console.log("  3×3 Pearson correlation matrix with permutation p-values (mulberry32(42), 10000 perms):");
  const nm = res.corrMatrix.names;
  let header = "              ";
  for (const n of nm) header += n.padStart(22) + " ";
  console.log(header);
  for (let i = 0; i < 3; i++) {
    let row = nm[i].padEnd(12) + " ";
    for (let j = 0; j < 3; j++) {
      const cell = i === j ? "1.0000" : `${fmt(res.corrMatrix.r[i][j], 4)} (p=${fmt(res.corrMatrix.p[i][j], 5)})`;
      row += cell.padStart(22) + " ";
    }
    console.log(row);
  }
  console.log(`\n  r(U,  T_corrected)         = ${fmt(res.rU_T.r, 4)}  p = ${fmt(res.rU_T.p, 5)}  (n=${res.rU_T.n})`);
  console.log(`  r(U,  S_spatial)            = ${fmt(res.rU_S.r, 4)}  p = ${fmt(res.rU_S.p, 5)}  (n=${res.rU_S.n})`);
  console.log(`  r(T_corrected, S_spatial)   = ${fmt(res.rT_S.r, 4)}  p = ${fmt(res.rT_S.p, 5)}  (n=${res.rT_S.n})`);
  console.log(`  r(U,  T_corrected×S)        = ${fmt(res.rU_TS.r, 4)}  p = ${fmt(res.rU_TS.p, 5)}  (n=${res.rU_TS.n})`);
  console.log(`\n  Partial correlation r(U, S | T_corrected) = ${fmt(res.partialR_US_given_T.partialR, 4)}  p = ${fmt(res.partialR_US_given_T.p, 5)}  (n=${res.partialR_US_given_T.n})`);
  console.log(`    (Controlling for T, does U-S coupling persist? Strong partial r → F decomposition questionable)`);
  console.log(`\n  Verdict T vs U: ${res.verdict_T_vs_U}`);
  console.log(`  Verdict T vs S: ${res.verdict_T_vs_S}`);
  console.log(`  OVERALL: ${res.overallVerdict}`);
}

// ============================================================================
// Analysis 2: r(R, T) definitional coupling check (CRITICAL)
// ============================================================================

/** Random number generators using mulberry32(42) as base RNG */

function genUniform(rng: () => number): number {
  // b ~ Uniform(-1, 1)
  return rng() * 2 - 1;
}

function genNormalClamped(rng: () => number, meanVal = 0, stdVal = 0.5): number {
  // b ~ Normal(mean, std) clamped to [-1, 1] using Box-Muller transform
  let u1 = rng();
  let u2 = rng();
  while (u1 === 0) u1 = rng();  // avoid log(0)
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  let v = meanVal + stdVal * z;
  if (v < -1) v = -1;
  if (v > 1) v = 1;
  return v;
}

function genBetaShifted(rng: () => number, alpha = 2, beta = 5): number {
  // b ~ Beta(2, 5) shifted to [-1, 1] via 2*B - 1
  // Beta(2, 5) is the 2nd order statistic of 6 uniforms:
  //   sort U_1..U_6, return U_(2)
  const uniforms: number[] = [];
  for (let k = 0; k < alpha + beta - 1; k++) uniforms.push(rng());
  uniforms.sort((a, b) => a - b);
  const betaVal = uniforms[alpha - 1];  // alpha-th smallest
  return 2 * betaVal - 1;
}

interface DistributionResult {
  name: string;
  n: number;
  meanR: number;
  meanT: number;
  rRT: { r: number; p: number; n: number };
  definitional: boolean;  // |r| > 0.85 → definitional
  verdict: string;
}

function analyzeDistribution(
  name: string,
  nVectors: number,
  genFn: (rng: () => number) => number,
): DistributionResult {
  const rng = mulberry32(PERMUTATION_SEED);  // mulberry32(42)
  const nAgents = 5;
  const Rs: number[] = [];
  const Ts: number[] = [];
  for (let i = 0; i < nVectors; i++) {
    const beliefs: number[] = [];
    for (let a = 0; a < nAgents; a++) beliefs.push(genFn(rng));
    Rs.push(kuramotoR(beliefs));
    Ts.push(computeT(beliefs));
  }
  const rRT = permCorrTest(Rs, Ts);
  // Definitional if |r| >= 0.85 (very strong regardless of distribution)
  const definitional = Math.abs(rRT.r) >= 0.85;
  const verdict = definitional
    ? `DEFINITIONAL COUPLING — r(R,T) ≈ ${fmt(rRT.r, 4)} on RANDOM data; "synergetic slaving" finding is an ARTIFACT`
    : (Math.abs(rRT.r) <= 0.15
      ? `EMPIRICAL — r(R,T) ≈ ${fmt(rRT.r, 4)} on random data; our finding is REAL`
      : `PARTIAL — r(R,T) ≈ ${fmt(rRT.r, 4)} on random data; some construction coupling but not the whole story`);
  return {
    name,
    n: nVectors,
    meanR: mean(Rs),
    meanT: mean(Ts),
    rRT,
    definitional,
    verdict,
  };
}

function printDistribution(res: DistributionResult): void {
  console.log(`\n  [${res.name}]  n=${res.n} random vectors (n=5 agents each)`);
  console.log(`    mean(R) = ${fmt(res.meanR, 4)},  mean(T) = ${fmt(res.meanT, 4)}`);
  console.log(`    r(R, T) on RANDOM data = ${fmt(res.rRT.r, 4)}  p = ${fmt(res.rRT.p, 5)}  (n=${res.rRT.n})`);
  console.log(`    DEFINITIONAL (|r|≥0.85): ${res.definitional ? "YES" : "NO"}`);
  console.log(`    VERDICT: ${res.verdict}`);
}

// ============================================================================
// Analysis 3: Scalar projection sign analysis
// ============================================================================

interface SignSample {
  runId: string;
  subdir: string;
  round: number;
  agentId: string;
  b: number;          // scalar LLM belief
  uSignedMax: number;  // U_signed_max from itemBeliefs (signed)
}

interface SignProjectionResult {
  Nsamples: number;
  r_U_signed_b: { r: number; p: number; n: number };              // signed
  r_absU_absB: { r: number; p: number; n: number };               // |U|, |b|  (was 0.754)
  signAgreementRate: number;                                       // % sign(U) == sign(b)
  nSignAgree: number;
  nSignDisagree: number;
  nZeroU: number;                                                   // |U| < 0.05 (ambiguity)
  r_U_signed_b_strongU: { r: number; p: number; n: number };      // |U| > 0.5
  r_U_signed_b_weakU: { r: number; p: number; n: number };        // |U| < 0.2
  mean_absU_when_disagree: number;                                  // When signs disagree, is U close to 0?
  mean_absU_when_agree: number;
  verdict: string;
}

function loadSignSamples(runs: AsyncRun[]): SignSample[] {
  const out: SignSample[] = [];
  for (const run of runs) {
    const rr = run.rawRun.roundResults ?? [];
    for (const round of rr) {
      const roundNum = typeof round.roundNumber === "number" ? round.roundNumber : 0;
      const opinions = Array.isArray(round.opinions) ? round.opinions : [];
      for (const op of opinions) {
        const agentId = op.agentId;
        const b = op.belief;
        if (typeof agentId !== "string" || typeof b !== "number" || isNaN(b)) continue;
        const items = Array.isArray(op.itemBeliefs) ? op.itemBeliefs : [];
        if (items.length === 0) continue;
        // u vector: signed beliefs per item
        const u = items.map(it => (typeof it.belief === "number" ? it.belief : 0));
        // U_signed_max: u_i with max |u_i|, preserving sign
        let uSignedMax = 0;
        let maxAbs = -Infinity;
        for (const v of u) {
          if (Math.abs(v) > maxAbs) {
            maxAbs = Math.abs(v);
            uSignedMax = v;
          }
        }
        if (maxAbs === -Infinity) uSignedMax = 0;
        out.push({
          runId: run.runId,
          subdir: run.subdir,
          round: roundNum,
          agentId,
          b,
          uSignedMax,
        });
      }
    }
  }
  return out;
}

function analyzeSignProjection(samples: SignSample[]): SignProjectionResult {
  const N = samples.length;
  const b = samples.map(s => s.b);
  const u = samples.map(s => s.uSignedMax);
  const absB = b.map(Math.abs);
  const absU = u.map(Math.abs);

  const r_U_signed_b = permCorrTest(u, b);
  const r_absU_absB = permCorrTest(absU, absB);

  // Sign agreement (treating near-zero U as ambiguous)
  const zeroThreshold = 0.05;
  let nAgree = 0, nDisagree = 0, nZeroU = 0;
  const disagreeAbsU: number[] = [];
  const agreeAbsU: number[] = [];
  for (let i = 0; i < N; i++) {
    if (Math.abs(u[i]) < zeroThreshold) {
      nZeroU++;
      continue;
    }
    if (Math.sign(u[i]) === Math.sign(b[i])) {
      nAgree++;
      agreeAbsU.push(absU[i]);
    } else {
      nDisagree++;
      disagreeAbsU.push(absU[i]);
    }
  }
  const signAgreementRate = (nAgree + nDisagree) > 0 ? nAgree / (nAgree + nDisagree) : NaN;
  const mean_absU_when_disagree = disagreeAbsU.length ? mean(disagreeAbsU) : NaN;
  const mean_absU_when_agree = agreeAbsU.length ? mean(agreeAbsU) : NaN;

  // Subsets
  const strongU_idx: number[] = [];
  const weakU_idx: number[] = [];
  for (let i = 0; i < N; i++) {
    if (absU[i] > 0.5) strongU_idx.push(i);
    if (absU[i] < 0.2) weakU_idx.push(i);
  }
  const r_U_signed_b_strongU = permCorrTest(
    strongU_idx.map(i => u[i]),
    strongU_idx.map(i => b[i]),
  );
  const r_U_signed_b_weakU = permCorrTest(
    weakU_idx.map(i => u[i]),
    weakU_idx.map(i => b[i]),
  );

  const verdict =
    signAgreementRate > 0.7 && r_U_signed_b_strongU.r > r_U_signed_b_weakU.r
      ? `✓ LLM correctly projects SIGN — agreement ${fmt(signAgreementRate * 100, 1)}%, strong-U r > weak-U r`
      : signAgreementRate < 0.55
        ? `✗ LLM fails SIGN projection — agreement ${fmt(signAgreementRate * 100, 1)}% (near chance)`
        : `△ PARTIAL — agreement ${fmt(signAgreementRate * 100, 1)}%, magnitude better than sign`;

  return {
    Nsamples: N,
    r_U_signed_b,
    r_absU_absB,
    signAgreementRate,
    nSignAgree: nAgree,
    nSignDisagree: nDisagree,
    nZeroU,
    r_U_signed_b_strongU,
    r_U_signed_b_weakU,
    mean_absU_when_disagree,
    mean_absU_when_agree,
    verdict,
  };
}

function printSignProjection(res: SignProjectionResult): void {
  console.log(`\n  N_samples = ${res.Nsamples}  (agent-round-opinions with itemBeliefs)`);
  console.log(`  r(U_signed_max, b)         SIGNED    = ${fmt(res.r_U_signed_b.r, 4)}  p = ${fmt(res.r_U_signed_b.p, 5)}  (n=${res.r_U_signed_b.n})   [ref: 0.414]`);
  console.log(`  r(|U_signed_max|, |b|)      ABSOLUTE  = ${fmt(res.r_absU_absB.r, 4)}  p = ${fmt(res.r_absU_absB.p, 5)}  (n=${res.r_absU_absB.n})   [ref: 0.754]`);
  console.log(`\n  Sign agreement (excluding |U|<0.05):`);
  console.log(`    n_agree     = ${res.nSignAgree}`);
  console.log(`    n_disagree  = ${res.nSignDisagree}`);
  console.log(`    n_zero_U    = ${res.nZeroU}  (|U|<0.05, ambiguous, excluded)`);
  console.log(`    agreement rate = ${fmt(res.signAgreementRate * 100, 2)}%`);
  console.log(`\n  When signs DISAGREE: mean|U| = ${fmt(res.mean_absU_when_disagree, 4)}  (low → ambiguity)`);
  console.log(`  When signs AGREE:    mean|U| = ${fmt(res.mean_absU_when_agree, 4)}`);
  console.log(`\n  Subset analysis:`);
  console.log(`    r(U_signed, b) for |U| > 0.5  (strong U)  = ${fmt(res.r_U_signed_b_strongU.r, 4)}  p = ${fmt(res.r_U_signed_b_strongU.p, 5)}  (n=${res.r_U_signed_b_strongU.n})`);
  console.log(`    r(U_signed, b) for |U| < 0.2  (weak U)    = ${fmt(res.r_U_signed_b_weakU.r, 4)}  p = ${fmt(res.r_U_signed_b_weakU.p, 5)}  (n=${res.r_U_signed_b_weakU.n})`);
  console.log(`\n  VERDICT: ${res.verdict}`);
}

// ============================================================================
// Analysis 4: Summary verdict table
// ============================================================================

interface SummaryTable {
  t_independence_U: { value: number; verdict: string };
  t_independence_S: { value: number; verdict: string };
  partial_R_US_given_T: { value: number; verdict: string };
  rRT_random_uniform: { value: number; verdict: string };
  rRT_random_normal: { value: number; verdict: string };
  rRT_random_beta: { value: number; verdict: string };
  sign_agreement_rate: { value: number; verdict: string };
  r_U_signed_b_strongU: { value: number; verdict: string };
}

function buildSummary(
  tInd: TIndependenceResult,
  distUnif: DistributionResult,
  distNorm: DistributionResult,
  distBeta: DistributionResult,
  signProj: SignProjectionResult,
): SummaryTable {
  return {
    t_independence_U: {
      value: tInd.rU_T.r,
      verdict: Math.abs(tInd.rU_T.r) < 0.3 ? "REAL (|r|<0.3)" : Math.abs(tInd.rU_T.r) > 0.5 ? "QUESTIONABLE (|r|>0.5)" : "BORDERLINE",
    },
    t_independence_S: {
      value: tInd.rT_S.r,
      verdict: Math.abs(tInd.rT_S.r) < 0.3 ? "REAL (|r|<0.3)" : Math.abs(tInd.rT_S.r) > 0.5 ? "QUESTIONABLE (|r|>0.5)" : "BORDERLINE",
    },
    partial_R_US_given_T: {
      value: tInd.partialR_US_given_T.partialR,
      verdict: Math.abs(tInd.partialR_US_given_T.partialR) > 0.5 ? "QUESTIONABLE (U-S coupling persists)" : "OK (partial r weakened)",
    },
    rRT_random_uniform: {
      value: distUnif.rRT.r,
      verdict: distUnif.definitional ? "DEFINITIONAL (≈-0.96 on random)" : "EMPIRICAL",
    },
    rRT_random_normal: {
      value: distNorm.rRT.r,
      verdict: distNorm.definitional ? "DEFINITIONAL (≈-0.96 on random)" : "EMPIRICAL",
    },
    rRT_random_beta: {
      value: distBeta.rRT.r,
      verdict: distBeta.definitional ? "DEFINITIONAL (≈-0.96 on random)" : "EMPIRICAL",
    },
    sign_agreement_rate: {
      value: signProj.signAgreementRate,
      verdict: `${fmt(signProj.signAgreementRate * 100, 1)}%`,
    },
    r_U_signed_b_strongU: {
      value: signProj.r_U_signed_b_strongU.r,
      verdict: signProj.r_U_signed_b_strongU.r > 0.5 ? "HIGH (sign captured for strong U)" : signProj.r_U_signed_b_strongU.r > 0.3 ? "MODERATE" : "LOW",
    },
  };
}

function printSummary(t: SummaryTable): void {
  console.log("\n  | Check                                  | Result    | Verdict");
  console.log("  |----------------------------------------|-----------|----------");
  const row = (name: string, val: number, verdict: string) => {
    console.log(`  | ${name.padEnd(38)} | ${fmt(val, 4).padStart(9)} | ${verdict}`);
  };
  row("T independence from U (fraud)", t.t_independence_U.value, t.t_independence_U.verdict);
  row("T independence from S (fraud)", t.t_independence_S.value, t.t_independence_S.verdict);
  row("r(U,S) partial controlling T", t.partial_R_US_given_T.value, t.partial_R_US_given_T.verdict);
  row("r(R,T) random uniform", t.rRT_random_uniform.value, t.rRT_random_uniform.verdict);
  row("r(R,T) random normal", t.rRT_random_normal.value, t.rRT_random_normal.verdict);
  row("r(R,T) random beta", t.rRT_random_beta.value, t.rRT_random_beta.verdict);
  row("sign agreement U vs b (rate)", t.sign_agreement_rate.value, t.sign_agreement_rate.verdict);
  row("r(U_signed, b) for |U|>0.5", t.r_U_signed_b_strongU.value, t.r_U_signed_b_strongU.verdict);
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log("=".repeat(100));
  console.log("F = U - T·S CRITICAL VERIFICATION — Is the Decoupling Real or an Artifact?");
  console.log("  Tests: T independence | r(R,T) definitional | scalar sign projection");
  console.log("=".repeat(100));

  const runs = loadAsyncFraud();
  const metrics = buildMetrics(runs, false);

  // Run breakdown
  const runCounts: Record<string, number> = {};
  for (const r of runs) runCounts[r.subdir] = (runCounts[r.subdir] || 0) + 1;
  console.log("\nData loaded:");
  console.log(`  Fraud async enriched runs (with itemBeliefs): ${runs.length}`);
  for (const [d, n] of Object.entries(runCounts)) console.log(`    ${d}: ${n}`);
  const malRuns = runs.filter(r => r.maliciousAgentIds.length > 0).length;
  console.log(`  Malicious runs: ${malRuns}`);
  console.log(`  Non-malicious runs: ${runs.length - malRuns}`);
  console.log(`  Round-observations: ${metrics.length}`);
  const withT = metrics.filter(m => m.T_speaking !== undefined).length;
  console.log(`  Round-observations with T_corrected: ${withT}`);

  const results: Record<string, unknown> = {
    meta: {
      script: "analyze_f_critical_verification.ts",
      generatedAt: new Date().toISOString(),
      seed: PERMUTATION_SEED,
      nPerms: N_PERMS,
      nRuns: runs.length,
      nRoundObs: metrics.length,
      nWithTCorrected: withT,
      nMaliciousRuns: malRuns,
      nNonMaliciousRuns: runs.length - malRuns,
      references: {
        rU_TS_pooled: -0.274,
        sync_rU_TS: -0.046,
        oldR_1mR_TH: 0.9175,
        rRT_slaving_all: -0.9602,
        r_absU_absB_prior: 0.754,
        r_U_signed_b_prior: 0.414,
        rU_S_fraud_prior: -0.793,
      },
    },
  };

  // ── Analysis 1: T independence check on fraud (THE KEY TEST) ──
  console.log("\n" + "=".repeat(100));
  console.log("Analysis 1: T Independence Check on Fraud (THE KEY TEST)");
  console.log("  Using T_corrected (speaking-only, no carry-forward bias)");
  console.log("  Known: r(U, S) = -0.793 (strong coupling on fraud)");
  console.log("  Question: Is T also coupled to U or S? If yes, F 'decoupling' is fake.");
  console.log("-".repeat(100));

  const tInd = analyzeT_Independence(metrics);
  printT_Independence(tInd);
  results.analysis1_t_independence = tInd;

  // ── Analysis 2: r(R, T) definitional coupling check (CRITICAL) ──
  console.log("\n" + "=".repeat(100));
  console.log("Analysis 2: r(R, T) Definitional Coupling Check (CRITICAL)");
  console.log(`  Reference: r(R, T) = -0.9602 on actual data (207 runs, sync+async)`);
  console.log("  Test: Generate 10000 random belief vectors (n=5 agents) per distribution");
  console.log("  If r(R,T)_random ≈ -0.96 → correlation is DEFINITIONAL (artifact)");
  console.log("  If r(R,T)_random ≈ 0     → correlation is EMPIRICAL (real finding)");
  console.log("-".repeat(100));

  const nVectors = 10000;
  console.log(`\n  Generating ${nVectors} random vectors per distribution (n=5 agents, mulberry32(42))...`);
  const distUnif = analyzeDistribution("Uniform(-1, 1)", nVectors, genUniform);
  const distNorm = analyzeDistribution("Normal(0, 0.5) clamped [-1, 1]", nVectors, (rng) => genNormalClamped(rng, 0, 0.5));
  const distBeta = analyzeDistribution("Beta(2, 5) shifted to [-1, 1]", nVectors, (rng) => genBetaShifted(rng, 2, 5));

  printDistribution(distUnif);
  printDistribution(distNorm);
  printDistribution(distBeta);

  console.log("\n  --- r(R,T) Definitional Coupling Verdict ---");
  const allDefinitional = distUnif.definitional && distNorm.definitional && distBeta.definitional;
  const anyDefinitional = distUnif.definitional || distNorm.definitional || distBeta.definitional;
  console.log(`  Uniform:  r(R,T) = ${fmt(distUnif.rRT.r, 4)}  → ${distUnif.definitional ? "DEFINITIONAL" : "EMPIRICAL"}`);
  console.log(`  Normal:   r(R,T) = ${fmt(distNorm.rRT.r, 4)}  → ${distNorm.definitional ? "DEFINITIONAL" : "EMPIRICAL"}`);
  console.log(`  Beta:     r(R,T) = ${fmt(distBeta.rRT.r, 4)}  → ${distBeta.definitional ? "DEFINITIONAL" : "EMPIRICAL"}`);
  console.log(`\n  ALL distributions give r ≈ -0.96 (definitional): ${allDefinitional ? "YES" : "NO"}`);
  console.log(`  ANY distribution gives r ≈ -0.96 (definitional): ${anyDefinitional ? "YES" : "NO"}`);
  if (allDefinitional) {
    console.log(`  >>> CRITICAL FINDING: r(R,T) = -0.96 is DEFINITIONAL COUPLING.`);
    console.log(`      Both R and T are deterministic functions of the belief vector that measure dispersion,`);
    console.log(`      so they MUST be correlated. The "synergetic slaving" finding is an ARTIFACT.`);
  } else if (anyDefinitional) {
    console.log(`  >>> PARTIAL: Some distributions produce high r(R,T), others do not.`);
  } else {
    console.log(`  >>> r(R,T) = -0.96 is EMPIRICAL (specific to our data); not a construction artifact.`);
  }

  results.analysis2_rRT_definitional = {
    reference_rRT_actual: -0.9602,
    distributions: { uniform: distUnif, normal: distNorm, beta: distBeta },
    allDefinitional,
    anyDefinitional,
    verdict: allDefinitional
      ? "DEFINITIONAL COUPLING CONFIRMED — r(R,T)=-0.96 is an artifact; synergetic slaving is NOT a real finding"
      : anyDefinitional
        ? "PARTIAL — some distributions show construction coupling"
        : "EMPIRICAL — r(R,T)=-0.96 is specific to our data, not a definitional artifact",
  };

  // ── Analysis 3: Scalar projection sign analysis ──
  console.log("\n" + "=".repeat(100));
  console.log("Analysis 3: Scalar Projection Sign Analysis (Fraud 38 runs)");
  console.log("  U_signed_max = itemBelief with max |belief|, preserving sign");
  console.log("  b = scalar belief from LLM");
  console.log("  Question: Does the LLM correctly project the SIGN of its top commitment?");
  console.log("-".repeat(100));

  const signSamples = loadSignSamples(runs);
  const signProj = analyzeSignProjection(signSamples);
  printSignProjection(signProj);
  results.analysis3_sign_projection = signProj;

  // ── Analysis 4: Summary verdict table ──
  console.log("\n" + "=".repeat(100));
  console.log("Analysis 4: Summary Verdict Table");
  console.log("-".repeat(100));

  const summary = buildSummary(tInd, distUnif, distNorm, distBeta, signProj);
  printSummary(summary);
  results.analysis4_summary = summary;

  // ── Overall verdict ──
  console.log("\n" + "=".repeat(100));
  console.log("OVERALL VERDICT");
  console.log("=".repeat(100));
  const tReal = Math.abs(tInd.rU_T.r) < 0.3 && Math.abs(tInd.rT_S.r) < 0.3;
  const rRTDefinitional = allDefinitional;
  console.log(`  1. F=U-TS decoupling on fraud:    ${tReal ? "REAL (T independent of U and S)" : "QUESTIONABLE (T coupled)"}`);
  console.log(`  2. r(R,T)=-0.96 synergetic slaving: ${rRTDefinitional ? "ARTIFACT (definitional coupling)" : "REAL (empirical correlation)"}`);
  console.log(`  3. Scalar sign projection:          ${signProj.verdict}`);
  console.log("");
  if (rRTDefinitional) {
    console.log("  >>> THE MOST IMPORTANT QUESTION: Does r(R,T) on random data also give ≈-0.96?");
    console.log("  >>> ANSWER: YES — r(R,T) ≈ " + fmt(distUnif.rRT.r, 4) + " on uniform random data.");
    console.log("  >>> This means r(R,T) = -0.96 is DEFINITIONAL: any belief vector produces it.");
    console.log("  >>> The 'synergetic slaving' finding is an ARTIFACT of how R and T are constructed.");
  } else {
    console.log("  >>> THE MOST IMPORTANT QUESTION: Does r(R,T) on random data also give ≈-0.96?");
    console.log("  >>> ANSWER: NO — r(R,T) on uniform random data = " + fmt(distUnif.rRT.r, 4));
    console.log("  >>> The r(R,T) = -0.96 correlation is EMPIRICAL, specific to our actual data.");
    console.log("  >>> The 'synergetic slaving' finding is REAL.");
  }

  results.overallVerdict = {
    F_decoupling_real: tReal,
    rRT_definitional: rRTDefinitional,
    sign_projection_verdict: signProj.verdict,
    most_important_answer: rRTDefinitional
      ? "YES — r(R,T) on random data ≈ -0.96; synergetic slaving is an ARTIFACT"
      : "NO — r(R,T) on random data ≠ -0.96; synergetic slaving is REAL",
  };

  // Save JSON
  const outDir = path.join(__dirname, "results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "analyze_f_critical_verification.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\nJSON saved to: ${outPath}`);
}

main();
