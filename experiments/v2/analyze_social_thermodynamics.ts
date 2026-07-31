/**
 * 社会热力学验证分析 — 4 项分析
 *
 * 在 169 sync runs + 38 async enriched runs 上验证：
 *   1. Synergetic Slaving Principle (Haken) — R 是序参量，R→1 时 T/H 方差塌缩
 *   2. Critical Fluctuations (Phase Transition) — R≈0.7-0.8 治理阈值附近 σ²(b) 异常增大
 *   3. Free Energy Decoupling (F = U - TS) — 校正后 U/T_temporal/S_spatial 解耦
 *   4. Free Energy Trajectory — F_corrected 随轮次下降（自由能最小化）
 *
 * 数据源（全部为已有数据，无新 API 调用）：
 *   - sync: data_crisis/ + data_supplier/ （rounds[].beliefs dict {a1..a5}）
 *   - async enriched: data_fraud_qwen/ + data_fraud_zhipu/ + data_fraud_malicious/
 *     过滤条件：roundResults[].opinions[].itemBeliefs 存在（共 38 文件）
 *
 * 运行：npx tsx experiments/v2/analyze_social_thermodynamics.ts
 */

import * as fs from "fs";
import * as path from "path";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";
import { mulberry32, sampleStd, mean, kuramotoR } from "./statsShared";

// ============================================================================
// 类型定义
// ============================================================================

interface RoundMetrics {
  source: "sync" | "async";
  subdir: string;        // data_crisis / data_supplier / data_fraud_qwen / ...
  runId: string;
  ablation?: string;     // sync: none/full/shuffle/full_fixed; async: 无
  roundNumber: number;   // 1-indexed
  n: number;             // 该轮 agent 数（sync=5；async carry-forward 4-5）
  beliefs: number[];     // a1..a5 顺序
  R: number;
  T: number;             // clamp(sampleStd(b), 0, 1) — 空间色散
  H: number;             // 5-bin Shannon 熵
  U: number;             // L1 范数 Σ|b_i|
  S_alt: number;         // |b_i| 归一化分布的熵
  sigma2: number;        // 跨 agent 总体方差
  T_temporal?: number;   // 时间涨落 mean_i|b_i(t)-b_i(t-1)|；round 1 = undefined
  S_spatial: number;     // = H
  F_corrected?: number;  // U - T_temporal * S_spatial；round 1 = undefined
}

// ============================================================================
// 基础统计
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

/** 置换检验相关性 p 值：mulberry32(42), 10000 perms */
function permCorrTest(x: number[], y: number[], nPerms = 10000): { r: number; p: number; n: number } {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { r: NaN, p: NaN, n };
  const r = pearsonR(x, y);
  if (isNaN(r)) return { r: NaN, p: NaN, n };
  const observed = Math.abs(r);
  const rng = mulberry32(42);
  const yCopy = y.slice(0, n);
  let count = 0;
  for (let p = 0; p < nPerms; p++) {
    for (let i = yCopy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [yCopy[i], yCopy[j]] = [yCopy[j], yCopy[i]];
    }
    const rPerm = Math.abs(pearsonR(x.slice(0, n), yCopy));
    if (rPerm >= observed) count++;
  }
  return { r, p: (count + 1) / (nPerms + 1), n };
}

function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
}

function fmt(v: number, d: number): string {
  return isNaN(v) ? "NaN" : v.toFixed(d);
}

// ============================================================================
// 度量计算
// ============================================================================

/** 5-bin 信念分箱：[-1,-0.6),[-0.6,-0.2),[-0.2,0.2),[0.2,0.6),[0.6,1.0] */
function beliefBin(b: number): number {
  if (b < -0.6) return 0;
  if (b < -0.2) return 1;
  if (b < 0.2) return 2;
  if (b < 0.6) return 3;
  return 4;
}

/** Shannon 熵（5-bin 信念分布） */
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

/** S_alt：|b_i| 归一化分布的熵 */
function computeSAlt(beliefs: number[]): number {
  const abs = beliefs.map(Math.abs);
  const sum = abs.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  let S = 0;
  for (const a of abs) {
    if (a === 0) continue;
    const p = a / sum;
    S -= p * Math.log2(p);
  }
  return S;
}

/** σ²(b)：跨 agent 总体方差 */
function computeSigma2(beliefs: number[]): number {
  if (beliefs.length === 0) return 0;
  const m = mean(beliefs);
  return beliefs.reduce((s, b) => s + (b - m) ** 2, 0) / beliefs.length;
}

/** T = clamp(sampleStd(b), 0, 1) */
function computeT(beliefs: number[]): number {
  return Math.max(0, Math.min(1, sampleStd(beliefs)));
}

const AGENT_ORDER = ["a1", "a2", "a3", "a4", "a5"];

// ============================================================================
// 数据加载 — sync
// ============================================================================

function loadSync(): RoundMetrics[] {
  const out: RoundMetrics[] = [];
  const v2Dir = __dirname;
  const dirs = ["data_crisis", "data_supplier"];
  for (const dir of dirs) {
    const fullDir = path.join(v2Dir, dir);
    if (!fs.existsSync(fullDir)) continue;
    const files = fs.readdirSync(fullDir).filter(f => f.endsWith(".json") && f !== "summary.json");
    for (const file of files) {
      const raw = fs.readFileSync(path.join(fullDir, file), "utf-8");
      const data = safeJsonParse<Record<string, unknown>>(raw);
      if (!data) continue;
      const rounds = data.rounds as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(rounds)) continue;
      const ablation = typeof data.ablation === "string" ? data.ablation : undefined;
      const runId = typeof data.runId === "string" ? data.runId : file;

      let prevBeliefs: Record<string, number> | null = null;
      for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i];
        const beliefsMap = r.beliefs as Record<string, number> | undefined;
        if (!beliefsMap || typeof beliefsMap !== "object") continue;
        const beliefs: number[] = [];
        for (const a of AGENT_ORDER) {
          const v = beliefsMap[a];
          if (typeof v === "number" && !isNaN(v)) beliefs.push(v);
        }
        if (beliefs.length < 2) { prevBeliefs = beliefsMap as Record<string, number>; continue; }

        const R = kuramotoR(beliefs);
        const T = computeT(beliefs);
        const H = computeH(beliefs);
        const U = beliefs.reduce((s, b) => s + Math.abs(b), 0);
        const S_alt = computeSAlt(beliefs);
        const sigma2 = computeSigma2(beliefs);

        let T_temporal: number | undefined;
        let F_corrected: number | undefined;
        if (prevBeliefs) {
          const diffs: number[] = [];
          for (const a of AGENT_ORDER) {
            const cur = beliefsMap[a];
            const prv = prevBeliefs[a];
            if (typeof cur === "number" && typeof prv === "number" && !isNaN(cur) && !isNaN(prv)) {
              diffs.push(Math.abs(cur - prv));
            }
          }
          if (diffs.length > 0) {
            T_temporal = mean(diffs);
            F_corrected = U - T_temporal * H;
          }
        }

        out.push({
          source: "sync", subdir: dir, runId, ablation,
          roundNumber: typeof r.roundNumber === "number" ? r.roundNumber : i + 1,
          n: beliefs.length, beliefs, R, T, H, U, S_alt, sigma2,
          T_temporal, S_spatial: H, F_corrected,
        });
        prevBeliefs = beliefsMap as Record<string, number>;
      }
    }
  }
  return out;
}

// ============================================================================
// 数据加载 — async enriched (carry-forward 信念状态)
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

function loadAsync(): RoundMetrics[] {
  const out: RoundMetrics[] = [];
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

      // carry-forward 信念状态
      const state: Record<string, number> = {};
      let prevSnapshot: Record<string, number> | null = null;

      for (let i = 0; i < rr.length; i++) {
        const r = rr[i];
        const ops = r.opinions as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(ops)) {
          for (const op of ops) {
            const aid = op.agentId as string;
            const bel = op.belief as number;
            if (typeof aid === "string" && typeof bel === "number" && !isNaN(bel)) {
              state[aid] = bel;
            }
          }
        }
        const beliefs: number[] = [];
        for (const a of AGENT_ORDER) {
          const v = state[a];
          if (typeof v === "number" && !isNaN(v)) beliefs.push(v);
        }
        if (beliefs.length < 2) {
          prevSnapshot = { ...state };
          continue;
        }

        const R = kuramotoR(beliefs);
        const T = computeT(beliefs);
        const H = computeH(beliefs);
        const U = beliefs.reduce((s, b) => s + Math.abs(b), 0);
        const S_alt = computeSAlt(beliefs);
        const sigma2 = computeSigma2(beliefs);

        let T_temporal: number | undefined;
        let F_corrected: number | undefined;
        if (prevSnapshot) {
          const diffs: number[] = [];
          for (const a of AGENT_ORDER) {
            const cur = state[a];
            const prv = prevSnapshot[a];
            if (typeof cur === "number" && typeof prv === "number" && !isNaN(cur) && !isNaN(prv)) {
              diffs.push(Math.abs(cur - prv));
            }
          }
          if (diffs.length > 0) {
            T_temporal = mean(diffs);
            F_corrected = U - T_temporal * H;
          }
        }

        out.push({
          source: "async", subdir: dir, runId,
          roundNumber: typeof r.roundNumber === "number" ? r.roundNumber : i + 1,
          n: beliefs.length, beliefs, R, T, H, U, S_alt, sigma2,
          T_temporal, S_spatial: H, F_corrected,
        });
        prevSnapshot = { ...state };
      }
    }
  }
  return out;
}

// ============================================================================
// 分箱辅助
// ============================================================================

/** R 5-bin: [0,0.2),[0.2,0.4),[0.4,0.6),[0.6,0.8),[0.8,1.0] */
function rBin5(r: number): number {
  if (r < 0.2) return 0;
  if (r < 0.4) return 1;
  if (r < 0.6) return 2;
  if (r < 0.8) return 3;
  return 4;
}

/** R 10-bin: [0,0.1),...,[0.9,1.0] */
function rBin10(r: number): number {
  return Math.min(9, Math.max(0, Math.floor(r / 0.1)));
}

// ============================================================================
// Analysis 1: Synergetic Slaving Principle (Haken)
// ============================================================================

interface RBinStat {
  binLabel: string;
  Rrange: string;
  n: number;
  meanT: number;
  varT: number;
  meanH: number;
  varH: number;
}

function analyzeSlaving(all: RoundMetrics[], label: string): {
  label: string;
  Nobs: number;
  binTable: RBinStat[];
  rRT: { r: number; p: number; n: number };
  rRH: { r: number; p: number; n: number };
  varianceCollapsesT: boolean;
  varianceCollapsesH: boolean;
} {
  const binLabels = ["[0,0.2)", "[0.2,0.4)", "[0.4,0.6)", "[0.6,0.8)", "[0.8,1.0]"];
  const bins: RoundMetrics[][] = [[], [], [], [], []];
  for (const m of all) bins[rBin5(m.R)].push(m);

  const binTable: RBinStat[] = bins.map((arr, i) => {
    const Ts = arr.map(m => m.T);
    const Hs = arr.map(m => m.H);
    return {
      binLabel: binLabels[i],
      Rrange: binLabels[i],
      n: arr.length,
      meanT: Ts.length ? mean(Ts) : NaN,
      varT: variance(Ts),
      meanH: Hs.length ? mean(Hs) : NaN,
      varH: variance(Hs),
    };
  });

  const Rarr = all.map(m => m.R);
const Tarr = all.map(m => m.T);
const Harr = all.map(m => m.H);
  const rRT = permCorrTest(Rarr, Tarr);
  const rRH = permCorrTest(Rarr, Harr);

  // 方差塌缩：最高 R bin 的 Var < 最低 R bin 的 Var（且非空）
  const validBins = binTable.filter(b => b.n > 0);
  const lowRVarT = validBins.length ? validBins[0].varT : NaN;
  const highRVarT = validBins.length ? validBins[validBins.length - 1].varT : NaN;
  const lowRVarH = validBins.length ? validBins[0].varH : NaN;
  const highRVarH = validBins.length ? validBins[validBins.length - 1].varH : NaN;

  return {
    label,
    Nobs: all.length,
    binTable,
    rRT,
    rRH,
    varianceCollapsesT: !isNaN(lowRVarT) && !isNaN(highRVarT) && highRVarT < lowRVarT,
    varianceCollapsesH: !isNaN(lowRVarH) && !isNaN(highRVarH) && highRVarH < lowRVarH,
  };
}

function printSlaving(res: ReturnType<typeof analyzeSlaving>): void {
  console.log(`\n  [${res.label}]  N_obs=${res.Nobs}`);
  console.log("  R-bin        n       mean(T)    Var(T)     mean(H)    Var(H)");
  for (const b of res.binTable) {
    console.log(
      "  " + b.binLabel.padEnd(12) +
      String(b.n).padStart(5) + "   " +
      fmt(b.meanT, 4).padStart(10) + " " +
      fmt(b.varT, 4).padStart(10) + " " +
      fmt(b.meanH, 4).padStart(10) + " " +
      fmt(b.varH, 4).padStart(10)
    );
  }
  console.log(`  Var(T) collapse (highR < lowR): ${res.varianceCollapsesT ? "YES" : "NO"}`);
  console.log(`  Var(H) collapse (highR < lowR): ${res.varianceCollapsesH ? "YES" : "NO"}`);
  console.log(`  r(R, T) = ${fmt(res.rRT.r, 4)}  p = ${fmt(res.rRT.p, 5)}  (n=${res.rRT.n})`);
  console.log(`  r(R, H) = ${fmt(res.rRH.r, 4)}  p = ${fmt(res.rRH.p, 5)}  (n=${res.rRH.n})`);
  const slavingT = res.rRT.r < 0;
  const slavingH = res.rRH.r < 0;
  console.log(`  Slaving (r<0): T=${slavingT ? "YES" : "NO"}  H=${slavingH ? "YES" : "NO"}`);
}

// ============================================================================
// Analysis 2: Critical Fluctuations (Phase Transition)
// ============================================================================

interface FineBinStat {
  binLabel: string;
  n: number;
  meanSigma2: number;
  varSigma2: number;
}

function analyzeCriticalFluctuations(all: RoundMetrics[]): {
  Nobs: number;
  binTable: FineBinStat[];
  peakBin: string;
  peakMeanSigma2: number;
  peakNear07_08: boolean;
  monotonicDecrease: boolean;
} {
  const binLabels: string[] = [];
  for (let i = 0; i < 10; i++) binLabels.push(`[${(i * 0.1).toFixed(1)},${((i + 1) * 0.1).toFixed(1)}${i === 9 ? "]" : ")"}`);
  const bins: RoundMetrics[][] = Array.from({ length: 10 }, () => []);
  for (const m of all) bins[rBin10(m.R)].push(m);

  const binTable: FineBinStat[] = bins.map((arr, i) => {
    const sigs = arr.map(m => m.sigma2);
    return {
      binLabel: binLabels[i],
      n: arr.length,
      meanSigma2: sigs.length ? mean(sigs) : NaN,
      varSigma2: variance(sigs),
    };
  });

  // 找 mean(σ²) 峰值
  let peakIdx = -1, peakVal = -Infinity;
  for (let i = 0; i < binTable.length; i++) {
    if (binTable[i].n > 0 && !isNaN(binTable[i].meanSigma2) && binTable[i].meanSigma2 > peakVal) {
      peakVal = binTable[i].meanSigma2;
      peakIdx = i;
    }
  }
  const peakBin = peakIdx >= 0 ? binTable[peakIdx].binLabel : "none";
  const peakMeanSigma2 = peakIdx >= 0 ? binTable[peakIdx].meanSigma2 : NaN;
  // R≈0.7-0.8 对应 bin 7 ([0.7,0.8)) 和 bin 8 ([0.8,0.9))
  // 治理阈值 R≈0.7-0.8：检查 bin 7 是否为峰值，或 bin 7/8 显著高于相邻
  const peakNear07_08 = peakIdx === 7 || peakIdx === 8;

  // 单调递减检查（忽略空 bin）
  const valid = binTable.filter(b => b.n > 0);
  let monotonicDecrease = true;
  for (let i = 1; i < valid.length; i++) {
    if (valid[i].meanSigma2 > valid[i - 1].meanSigma2) { monotonicDecrease = false; break; }
  }

  return { Nobs: all.length, binTable, peakBin, peakMeanSigma2, peakNear07_08, monotonicDecrease };
}

function analyzeCriticalByAblation(sync: RoundMetrics[]): Record<string, ReturnType<typeof analyzeCriticalFluctuations>> {
  const out: Record<string, ReturnType<typeof analyzeCriticalFluctuations>> = {};
  const abl = ["none", "full", "shuffle", "full_fixed"];
  for (const a of abl) {
    const subset = sync.filter(m => m.ablation === a);
    if (subset.length === 0) continue;
    out[a] = analyzeCriticalFluctuations(subset);
  }
  return out;
}

function printCritical(res: ReturnType<typeof analyzeCriticalFluctuations>): void {
  console.log(`\n  N_obs=${res.Nobs}`);
  console.log("  R-bin            n       mean(σ²)    Var(σ²)");
  for (const b of res.binTable) {
    console.log(
      "  " + b.binLabel.padEnd(16) +
      String(b.n).padStart(5) + "   " +
      fmt(b.meanSigma2, 5).padStart(11) + " " +
      fmt(b.varSigma2, 5).padStart(10)
    );
  }
  console.log(`  Peak mean(σ²) at R-bin: ${res.peakBin}  (value=${fmt(res.peakMeanSigma2, 5)})`);
  console.log(`  Peak near R=0.7-0.8: ${res.peakNear07_08 ? "YES — critical fluctuations (phase transition)" : "NO"}`);
  console.log(`  Monotonic decrease of σ² with R: ${res.monotonicDecrease ? "YES (no peak → no phase transition)" : "NO"}`);
}

// ============================================================================
// Analysis 3: Free Energy Decoupling (F = U - TS)
// ============================================================================

function analyzeDecoupling(all: RoundMetrics[]): {
  Nobs: number;
  corrMatrix: { names: string[]; r: number[][]; };
  rU_TS: { r: number; p: number; n: number };
  oldR_1mR_TH: { r: number; p: number; n: number };
  oldCouplingReference: number;
  betterDecoupled: boolean;
} {
  // 仅用 T_temporal 有定义的轮次（round >= 2）
  const sub = all.filter(m => m.T_temporal !== undefined && !isNaN(m.T_temporal!));
  const U = sub.map(m => m.U);
  const Tt = sub.map(m => m.T_temporal!);
  const Ss = sub.map(m => m.S_spatial);
  const TS = Tt.map((t, i) => t * Ss[i]);

  const names = ["U", "T_temporal", "S_spatial"];
  const arrs = [U, Tt, Ss];
  const r: number[][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i][j] = i === j ? 1 : pearsonR(arrs[i], arrs[j]);

  const rU_TS = permCorrTest(U, TS);

  // 旧耦合 r((1-R), T·H) 在同一数据集上重算（空间 T 与 H）
  const oneMinusR = sub.map(m => 1 - m.R);
  const TH = sub.map(m => m.T * m.H);
  const oldR_1mR_TH = permCorrTest(oneMinusR, TH);

  const oldCouplingReference = 0.9175;
  // 校正后解耦：|r(U, T×S)| 显著小于 |old r((1-R),T·H)|
  const betterDecoupled = Math.abs(rU_TS.r) < Math.abs(oldCouplingReference);

  return {
    Nobs: sub.length,
    corrMatrix: { names, r },
    rU_TS,
    oldR_1mR_TH,
    oldCouplingReference,
    betterDecoupled,
  };
}

function printDecoupling(res: ReturnType<typeof analyzeDecoupling>): void {
  console.log(`\n  N_obs (rounds with T_temporal defined) = ${res.Nobs}`);
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
  console.log(`\n  r(U, T_temporal×S_spatial) = ${fmt(res.rU_TS.r, 4)}  p = ${fmt(res.rU_TS.p, 5)}  (n=${res.rU_TS.n})`);
  console.log(`  r((1-R), T·H) on this data = ${fmt(res.oldR_1mR_TH.r, 4)}  p = ${fmt(res.oldR_1mR_TH.p, 5)}`);
  console.log(`  Old reference r((1-R), T·H) = ${res.oldCouplingReference} (from prior analysis)`);
  console.log(`  Corrected F better decomposed (|r(U,T×S)| < ${res.oldCouplingReference}): ${res.betterDecoupled ? "YES" : "NO"}`);
  const lowCoupling = Math.abs(res.rU_TS.r) < 0.3;
  console.log(`  Verdict: corrected U/T_temporal/S_spatial are ${lowCoupling ? "WELL DECOUPLED (|r|<0.3)" : "still coupled (|r|>=0.3)"}`);
}

// ============================================================================
// Analysis 4: Free Energy Trajectory
// ============================================================================

function analyzeTrajectory(all: RoundMetrics[]): {
  Nobs: number;
  meanFPerRound: { round: number; meanF: number; n: number }[];
  rRoundF: { r: number; p: number; n: number };
  fDecreases: boolean;
  byGroup: { group: string; meanFPerRound: { round: number; meanF: number; n: number }[]; rRoundF: { r: number; p: number; n: number } }[];
} {
  // F_corrected：round 1 用 T_temporal=0 → F=U；round>=2 用已算 F_corrected
  const obs: { round: number; F: number }[] = [];
  for (const m of all) {
    const F = m.F_corrected !== undefined ? m.F_corrected : m.U; // round 1: U - 0*S = U
    obs.push({ round: m.roundNumber, F });
  }

  // 按 round 聚合（聚焦 1-5 轮）
  const roundSet = [...new Set(obs.map(o => o.round))].sort((a, b) => a - b);
  const meanFPerRound = roundSet.filter(r => r <= 6).map(r => {
    const Fs = obs.filter(o => o.round === r).map(o => o.F);
    return { round: r, meanF: mean(Fs), n: Fs.length };
  });

  const rArr = obs.map(o => o.round);
  const fArr = obs.map(o => o.F);
  const rRoundF = permCorrTest(rArr, fArr);

  // 按 sync ablation 分组（none vs full）
  const byGroup: { group: string; meanFPerRound: { round: number; meanF: number; n: number }[]; rRoundF: { r: number; p: number; n: number } }[] = [];
  const syncObs = all.filter(m => m.source === "sync");
  const groups: { name: string; filter: (m: RoundMetrics) => boolean }[] = [
    { name: "sync-none", filter: m => m.ablation === "none" },
    { name: "sync-full", filter: m => m.ablation === "full" },
    { name: "sync-shuffle", filter: m => m.ablation === "shuffle" },
  ];
  for (const g of groups) {
    const sub = syncObs.filter(g.filter);
    if (sub.length === 0) continue;
    const gObs: { round: number; F: number }[] = sub.map(m => ({
      round: m.roundNumber,
      F: m.F_corrected !== undefined ? m.F_corrected : m.U,
    }));
    const gRounds = [...new Set(gObs.map(o => o.round))].sort((a, b) => a - b);
    const gMean = gRounds.filter(r => r <= 6).map(r => {
      const Fs = gObs.filter(o => o.round === r).map(o => o.F);
      return { round: r, meanF: mean(Fs), n: Fs.length };
    });
    byGroup.push({
      group: g.name,
      meanFPerRound: gMean,
      rRoundF: permCorrTest(gObs.map(o => o.round), gObs.map(o => o.F)),
    });
  }

  return {
    Nobs: obs.length,
    meanFPerRound,
    rRoundF,
    fDecreases: rRoundF.r < 0,
    byGroup,
  };
}

function printTrajectory(res: ReturnType<typeof analyzeTrajectory>): void {
  console.log(`\n  N_obs = ${res.Nobs}`);
  console.log("  F_corrected trajectory (mean F per round, all runs):");
  console.log("  round      mean(F)      n");
  for (const r of res.meanFPerRound) {
    console.log("  " + String(r.round).padStart(5) + "   " + fmt(r.meanF, 5).padStart(11) + " " + String(r.n).padStart(6));
  }
  console.log(`\n  r(round, F) = ${fmt(res.rRoundF.r, 4)}  p = ${fmt(res.rRoundF.p, 5)}  (n=${res.rRoundF.n})`);
  console.log(`  F decreases over rounds (r<0): ${res.fDecreases ? "YES — free energy minimization supported" : "NO"}`);

  console.log("\n  Governance comparison (sync):");
  console.log("  group          round      mean(F)      n      r(round,F)");
  for (const g of res.byGroup) {
    for (let i = 0; i < g.meanFPerRound.length; i++) {
      const r = g.meanFPerRound[i];
      const rLine = i === 0 ? fmt(g.rRoundF.r, 4) : "";
      console.log(
        "  " + g.group.padEnd(14) +
        String(r.round).padStart(5) + "   " +
        fmt(r.meanF, 5).padStart(11) + " " +
        String(r.n).padStart(6) + "   " +
        rLine.padStart(10)
      );
    }
  }
  // 治理加速 F 最小化：none vs full 的 r(round,F) 哪个更负
  const none = res.byGroup.find(g => g.group === "sync-none");
  const full = res.byGroup.find(g => g.group === "sync-full");
  if (none && full) {
    console.log(`\n  sync-none r(round,F) = ${fmt(none.rRoundF.r, 4)}`);
    console.log(`  sync-full r(round,F) = ${fmt(full.rRoundF.r, 4)}`);
    console.log(`  Governance accelerates F minimization (full more negative than none): ${full.rRoundF.r < none.rRoundF.r ? "YES" : "NO"}`);
  }
}

// ============================================================================
// 主函数
// ============================================================================

function main() {
  console.log("=".repeat(90));
  console.log("Social Thermodynamics Verification — 4 Analyses on 169 sync + 38 async enriched runs");
  console.log("=".repeat(90));

  const sync = loadSync();
  const async_ = loadAsync();
  const all = [...sync, ...async_];

  console.log("\nData loaded:");
  console.log(`  sync runs (data_crisis + data_supplier): ${new Set(sync.map(m => m.runId)).size} runs, ${sync.length} round-observations`);
  console.log(`  async enriched (data_fraud_qwen/zhipu/malicious): ${new Set(async_.map(m => m.runId)).size} runs, ${async_.length} round-observations`);
  console.log(`  TOTAL: ${new Set(all.map(m => m.runId)).size} runs, ${all.length} round-observations`);

  // sync ablation breakdown
  const ablCounts: Record<string, number> = {};
  for (const m of sync) ablCounts[m.ablation || "?"] = (ablCounts[m.ablation || "?"] || 0) + 1;
  console.log("  sync ablation breakdown (round-obs): " + Object.entries(ablCounts).map(([k, v]) => `${k}=${v}`).join(", "));

  const results: Record<string, unknown> = {};

  // ── Analysis 1: Synergetic Slaving ──
  console.log("\n" + "=".repeat(90));
  console.log("Analysis 1: Synergetic Slaving Principle (Haken)");
  console.log("  Hypothesis: R is the order parameter; as R→1, slave modes (T, H) variance collapses.");
  console.log("-".repeat(90));

  const slavingAll = analyzeSlaving(all, "ALL 207 runs");
  const slavingSync = analyzeSlaving(sync, "SYNC 169 runs");
  const slavingAsync = analyzeSlaving(async_, "ASYNC 38 runs");
  printSlaving(slavingAll);
  printSlaving(slavingSync);
  printSlaving(slavingAsync);

  console.log("\n  --- Slaving Principle Verdict ---");
  const rRT_all = slavingAll.rRT.r;
  const rRH_all = slavingAll.rRH.r;
  console.log(`  r(R,T)=${fmt(rRT_all, 4)}, r(R,H)=${fmt(rRH_all, 4)} (both negative = slaving supported)`);
  const slavingSupported = rRT_all < 0 && rRH_all < 0 && slavingAll.varianceCollapsesT && slavingAll.varianceCollapsesH;
  console.log(`  Slaving principle supported: ${slavingSupported ? "YES" : "PARTIAL/NO"}`);

  results.analysis1_slaving = {
    all: slavingAll, sync: slavingSync, async: slavingAsync,
    slavingSupported,
  };

  // ── Analysis 2: Critical Fluctuations ──
  console.log("\n" + "=".repeat(90));
  console.log("Analysis 2: Critical Fluctuations (Phase Transition)");
  console.log("  Hypothesis: Near governance trigger R≈0.7-0.8, belief variance σ²(b) anomalously peaks.");
  console.log("-".repeat(90));

  console.log("\n  [ALL 207 runs] fine R-bins (10 bins):");
  const critAll = analyzeCriticalFluctuations(all);
  printCritical(critAll);

  console.log("\n  [SYNC 169 runs] fine R-bins:");
  const critSync = analyzeCriticalFluctuations(sync);
  printCritical(critSync);

  console.log("\n  [ASYNC 38 runs] fine R-bins:");
  const critAsync = analyzeCriticalFluctuations(async_);
  printCritical(critAsync);

  console.log("\n  --- Per-ablation (sync only, governance effect) ---");
  const critByAbl = analyzeCriticalByAblation(sync);
  for (const [a, res] of Object.entries(critByAbl)) {
    console.log(`\n  ablation=${a}:`);
    printCritical(res);
  }

  results.analysis2_criticalFluctuations = {
    all: critAll, sync: critSync, async: critAsync,
    byAblation: critByAbl,
  };

  // ── Analysis 3: Free Energy Decoupling ──
  console.log("\n" + "=".repeat(90));
  console.log("Analysis 3: Free Energy Decoupling (F = U - T·S)");
  console.log("  Hypothesis: Corrected U/L1, T_temporal, S_spatial are LESS coupled than old R/T/H.");
  console.log("-".repeat(90));

  const decoupAll = analyzeDecoupling(all);
  printDecoupling(decoupAll);

  console.log("\n  [SYNC only] decoupling:");
  const decoupSync = analyzeDecoupling(sync);
  printDecoupling(decoupSync);

  console.log("\n  [ASYNC only] decoupling:");
  const decoupAsync = analyzeDecoupling(async_);
  printDecoupling(decoupAsync);

  results.analysis3_decoupling = {
    all: decoupAll, sync: decoupSync, async: decoupAsync,
    oldCouplingReference: 0.9175,
  };

  // ── Analysis 4: Free Energy Trajectory ──
  console.log("\n" + "=".repeat(90));
  console.log("Analysis 4: Free Energy Trajectory");
  console.log("  Hypothesis: F_corrected = U - T_temporal×S_spatial decreases over rounds (minimization).");
  console.log("-".repeat(90));

  console.log("\n  [ALL 207 runs] F trajectory:");
  const trajAll = analyzeTrajectory(all);
  printTrajectory(trajAll);

  console.log("\n  [SYNC 169 runs] F trajectory:");
  const trajSync = analyzeTrajectory(sync);
  printTrajectory(trajSync);

  results.analysis4_trajectory = {
    all: trajAll, sync: trajSync,
  };

  // ── 总结 ──
  console.log("\n" + "=".repeat(90));
  console.log("SUMMARY");
  console.log("=".repeat(90));
  console.log(`1. Slaving: r(R,T)=${fmt(slavingAll.rRT.r, 4)} (p=${fmt(slavingAll.rRT.p, 4)}), r(R,H)=${fmt(slavingAll.rRH.r, 4)} (p=${fmt(slavingAll.rRH.p, 4)}); Var collapse T=${slavingAll.varianceCollapsesT}, H=${slavingAll.varianceCollapsesH} → ${slavingSupported ? "SUPPORTED" : "PARTIAL"}`);
  console.log(`2. Critical fluctuations: σ² peak at R-bin ${critAll.peakBin} (near 0.7-0.8: ${critAll.peakNear07_08 ? "YES" : "NO"}); monotonic decrease: ${critAll.monotonicDecrease ? "YES" : "NO"}`);
  console.log(`3. Decoupling: r(U, T×S)=${fmt(decoupAll.rU_TS.r, 4)} vs old r((1-R),T·H)=${decoupAll.oldCouplingReference} → ${decoupAll.betterDecoupled ? "BETTER (decoupled)" : "NOT better"}`);
  console.log(`4. Trajectory: r(round, F)=${fmt(trajAll.rRoundF.r, 4)} (p=${fmt(trajAll.rRoundF.p, 4)}) → F ${trajAll.fDecreases ? "DECREASES (minimization supported)" : "does NOT decrease"}`);

  // 保存 JSON
  const outDir = path.join(__dirname, "results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "analyze_social_thermodynamics.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\nJSON saved to: ${outPath}`);
}

main();
