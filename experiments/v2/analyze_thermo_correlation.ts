/**
 * 热力学变量相关性分析 — 验证 F 公式正交性
 *
 * 核心问题：F = (1-R) + T*H 公式中，(1-R) 与 T*H 是否真的正交？
 * 文档声称"正交"（TECHNICAL_REPORT.md:170, PAPER_DRAFT.md:122），但从未用统计验证。
 *
 * 数据源：
 *   1. fraud 系列数据（154 文件，有完整 thermoHistory R/T/H/F）
 *   2. 169 runs 数据（data_crisis + data_supplier，从 rounds[].beliefs 派生 R/T/H/F）
 *
 * 运行：npx tsx experiments/v2/analyze_thermo_correlation.ts
 */

import * as fs from "fs";
import * as path from "path";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";
import { shannonEntropy, normalizeTemperature } from "../../src/lib/utils/statsUtils";
import { kuramotoR } from "./statsShared";

// ============================================================================
// 类型定义
// ============================================================================

interface ThermoPoint {
  R: number;
  T: number;
  H: number;
  F: number;
}

interface AnalysisSample {
  source: string;
  runId: string;
  tau: number;
  thermo: ThermoPoint;
}

// ============================================================================
// 统计工具
// ============================================================================

function pearsonCorrelation(x: number[], y: number[]): { r: number; p: number; n: number } {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { r: NaN, p: NaN, n };

  const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;

  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dxi = x[i] - mx;
    const dyi = y[i] - my;
    num += dxi * dyi;
    dx2 += dxi * dxi;
    dy2 += dyi * dyi;
  }

  const r = num / Math.sqrt(dx2 * dy2);
  const tStat = r * Math.sqrt((n - 2) / (1 - r * r));
  const p = 2 * (1 - normalCdf(Math.abs(tStat), n - 2));

  return { r, p, n };
}

function normalCdf(t: number, df: number): number {
  if (df > 2) {
    const z = t / Math.sqrt(df / (df - 2));
    return 0.5 * (1 + erf(z / Math.sqrt(2)));
  }
  return 0.5 * (1 + erf(t / Math.sqrt(2)));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function computeAUC(scores: number[], labels: boolean[]): number {
  const pos = scores.filter((_, i) => labels[i]);
  const neg = scores.filter((_, i) => !labels[i]);
  if (pos.length === 0 || neg.length === 0) return 0.5;

  let concordant = 0;
  for (const p of pos) {
    for (const n of neg) {
      if (p < n) concordant += 1;
      else if (p === n) concordant += 0.5;
    }
  }
  return concordant / (pos.length * neg.length);
}

function linearRegression(x: number[], y: number[]): { alpha: number; beta: number; r2: number } {
  const n = Math.min(x.length, y.length);
  const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;

  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    den += (x[i] - mx) ** 2;
  }

  const beta = den === 0 ? 0 : num / den;
  const alpha = my - beta * mx;
  const { r } = pearsonCorrelation(x, y);
  const r2 = r * r;

  return { alpha, beta, r2 };
}

function fmt(v: number, d: number): string {
  return isNaN(v) ? "NaN" : v.toFixed(d);
}

// ============================================================================
// 数据加载
// ============================================================================

function extractFinalThermo(thermoHistory: unknown[]): ThermoPoint | null {
  if (!Array.isArray(thermoHistory) || thermoHistory.length === 0) return null;
  const last = thermoHistory[thermoHistory.length - 1] as Record<string, number>;
  if (typeof last.R !== "number" || typeof last.T !== "number" ||
      typeof last.H !== "number") return null;
  const F = typeof last.F === "number" ? last.F : (1 - last.R) + last.T * last.H;
  return { R: last.R, T: last.T, H: last.H, F };
}

function deriveThermoFromRounds(rounds: unknown[]): ThermoPoint | null {
  if (!Array.isArray(rounds) || rounds.length === 0) return null;
  const lastRound = rounds[rounds.length - 1] as Record<string, unknown>;
  const beliefsMap = lastRound.beliefs as Record<string, number> | undefined;
  if (!beliefsMap || typeof beliefsMap !== "object") return null;

  const beliefs = Object.values(beliefsMap).filter(v => typeof v === "number" && !isNaN(v));
  if (beliefs.length < 2) return null;

  const R = kuramotoR(beliefs);
  const mean = beliefs.reduce((a, b) => a + b, 0) / beliefs.length;
  const std = Math.sqrt(beliefs.reduce((s, v) => s + (v - mean) ** 2, 0) / beliefs.length);
  const T = normalizeTemperature(std);
  const H = shannonEntropy(beliefs);
  const F = (1 - R) + T * H;

  return { R, T, H, F };
}

function loadFraudData(): AnalysisSample[] {
  const samples: AnalysisSample[] = [];
  const fraudDirs = [
    "data_fraud",
    "data_fraud_malicious",
    "data_fraud_qwen",
    "data_fraud_zhipu",
    "data_fraud_pre_beliefshift_fix",
    "data_fraud_old_thresholds",
  ];
  const v2Dir = path.join(__dirname);

  for (const dir of fraudDirs) {
    const fullDir = path.join(v2Dir, dir);
    if (!fs.existsSync(fullDir)) continue;

    const files = fs.readdirSync(fullDir).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const filePath = path.join(fullDir, file);
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = safeJsonParse<Record<string, unknown>>(raw);
      if (!data) continue;

      const thermo = extractFinalThermo(data.thermoHistory as unknown[]);
      if (!thermo) continue;

      const tau = typeof data.kendallTau === "number" ? data.kendallTau : NaN;
      const runId = typeof data.runId === "string" ? data.runId : file;
      samples.push({ source: dir, runId, tau, thermo });
    }
  }
  return samples;
}

function load169RunsData(): AnalysisSample[] {
  const samples: AnalysisSample[] = [];
  const dirs = [
    { dir: "data_crisis", source: "crisis" },
    { dir: "data_supplier", source: "supplier" },
  ];
  const v2Dir = path.join(__dirname);

  for (const { dir, source } of dirs) {
    const fullDir = path.join(v2Dir, dir);
    if (!fs.existsSync(fullDir)) continue;

    const files = fs.readdirSync(fullDir).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const filePath = path.join(fullDir, file);
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = safeJsonParse<Record<string, unknown>>(raw);
      if (!data) continue;

      const thermo = deriveThermoFromRounds(data.rounds as unknown[]);
      if (!thermo) continue;

      const tau = typeof data.kendallTau === "number" ? data.kendallTau : NaN;
      const runId = typeof data.runId === "string" ? data.runId : file;
      samples.push({ source, runId, tau, thermo });
    }
  }
  return samples;
}

// ============================================================================
// 主分析
// ============================================================================

function main() {
  console.log("=".repeat(80));
  console.log("Thermo Correlation Analysis - F Formula Orthogonality Verification");
  console.log("=".repeat(80));
  console.log("");

  const fraudSamples = loadFraudData();
  const runs169Samples = load169RunsData();
  const allSamples = [...fraudSamples, ...runs169Samples];

  console.log("Data loaded:");
  console.log("  fraud series (with thermoHistory): " + fraudSamples.length + " samples");
  console.log("  169 runs (derived from beliefs): " + runs169Samples.length + " samples");
  console.log("  total: " + allSamples.length + " samples");
  console.log("");

  // ── 提取变量数组 ──
  const R_arr = allSamples.map(s => s.thermo.R);
  const T_arr = allSamples.map(s => s.thermo.T);
  const H_arr = allSamples.map(s => s.thermo.H);
  const F_arr = allSamples.map(s => s.thermo.F);
  const oneMinusR = R_arr.map(r => 1 - r);
  const TH = T_arr.map((t, i) => t * H_arr[i]);

  // ── 1. 描述性统计 ──
  console.log("-".repeat(80));
  console.log("1. Descriptive Statistics");
  console.log("-".repeat(80));
  const vars = [
    { name: "R", arr: R_arr },
    { name: "T", arr: T_arr },
    { name: "H", arr: H_arr },
    { name: "F", arr: F_arr },
    { name: "(1-R)", arr: oneMinusR },
    { name: "T*H", arr: TH },
  ];
  console.log("var       mean       std        min        max        N");
  for (const v of vars) {
    const valid = v.arr.filter(x => !isNaN(x));
    const m = valid.reduce((s, x) => s + x, 0) / valid.length;
    const sd = Math.sqrt(valid.reduce((s, x) => s + (x - m) ** 2, 0) / valid.length);
    console.log(
      v.name.padEnd(10) + " " +
      fmt(m, 4).padStart(10) + " " +
      fmt(sd, 4).padStart(10) + " " +
      fmt(Math.min(...valid), 4).padStart(10) + " " +
      fmt(Math.max(...valid), 4).padStart(10) + " " +
      valid.length
    );
  }
  console.log("");

  // ── 2. R/T/H/F 4x4 correlation matrix ──
  console.log("-".repeat(80));
  console.log("2. R/T/H/F 4x4 Pearson Correlation Matrix");
  console.log("-".repeat(80));
  const matrixVars = [R_arr, T_arr, H_arr, F_arr];
  const matrixNames = ["R", "T", "H", "F"];
  let header = "       ";
  for (let j = 0; j < 4; j++) {
    header += matrixNames[j].padStart(12) + " ";
  }
  console.log(header);
  for (let i = 0; i < 4; i++) {
    let row = matrixNames[i].padEnd(6) + " ";
    for (let j = 0; j < 4; j++) {
      const { r, p } = pearsonCorrelation(matrixVars[i], matrixVars[j]);
      const sig = p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : "";
      row += (fmt(r, 3) + sig).padStart(12) + " ";
    }
    console.log(row);
  }
  console.log("(*** p<0.001, ** p<0.01, * p<0.05)");
  console.log("");

  // ── 3. Orthogonality verification: r((1-R), T*H) ──
  console.log("-".repeat(80));
  console.log("3. Orthogonality Verification: r((1-R), T*H)");
  console.log("-".repeat(80));
  const orthResult = pearsonCorrelation(oneMinusR, TH);
  console.log("Pearson r((1-R), T*H) = " + fmt(orthResult.r, 4));
  console.log("p-value = " + fmt(orthResult.p, 6));
  console.log("N = " + orthResult.n);
  console.log("");

  if (Math.abs(orthResult.r) < 0.1 && orthResult.p > 0.05) {
    console.log("[OK] Orthogonality holds (|r| < 0.1, p > 0.05)");
    console.log("     F = (1-R) + T*H additive structure has mathematical basis, no double-counting");
  } else if (Math.abs(orthResult.r) < 0.3) {
    console.log("[WARN] Weak correlation (0.1 <= |r| < 0.3) - approximate orthogonality with mild coupling");
    console.log("     F formula still usable but with slight double-counting risk");
  } else {
    console.log("[FAIL] Orthogonality violated (|r| >= 0.3) - components are statistically correlated");
    console.log("     F = (1-R) + T*H has double-counting risk, formula redesign needed");
    console.log("");
    console.log("   Regression analysis:");
    const reg1 = linearRegression(oneMinusR, F_arr);
    const reg2 = linearRegression(TH, F_arr);
    console.log("   F = " + fmt(reg1.alpha, 3) + " + " + fmt(reg1.beta, 3) + "*(1-R)  (R2=" + fmt(reg1.r2, 3) + ")");
    console.log("   F = " + fmt(reg2.alpha, 3) + " + " + fmt(reg2.beta, 3) + "*(T*H)  (R2=" + fmt(reg2.r2, 3) + ")");
    console.log("");
    const alpha = 1 / (1 + Math.abs(orthResult.r));
    const beta = 1 - alpha;
    console.log("   Suggested weights (decorrelated): alpha=" + fmt(alpha, 3) + ", beta=" + fmt(beta, 3));
    console.log("   (current formula implies alpha=1, beta=1, no decorrelation)");
  }
  console.log("");

  // ── 4. F/R/T/H vs tau ──
  console.log("-".repeat(80));
  console.log("4. Correlation with Decision Quality (tau)");
  console.log("-".repeat(80));
  const validTauSamples = allSamples.filter(s => !isNaN(s.tau));
  const tauArr = validTauSamples.map(s => s.tau);
  const corrF = pearsonCorrelation(validTauSamples.map(s => s.thermo.F), tauArr);
  const corrR = pearsonCorrelation(validTauSamples.map(s => s.thermo.R), tauArr);
  const corrT = pearsonCorrelation(validTauSamples.map(s => s.thermo.T), tauArr);
  const corrH = pearsonCorrelation(validTauSamples.map(s => s.thermo.H), tauArr);
  console.log("r(R, tau) = " + fmt(corrR.r, 4) + "  (p=" + fmt(corrR.p, 4) + ", N=" + corrR.n + ")");
  console.log("r(T, tau) = " + fmt(corrT.r, 4) + "  (p=" + fmt(corrT.p, 4) + ", N=" + corrT.n + ")");
  console.log("r(H, tau) = " + fmt(corrH.r, 4) + "  (p=" + fmt(corrH.p, 4) + ", N=" + corrH.n + ")");
  console.log("r(F, tau) = " + fmt(corrF.r, 4) + "  (p=" + fmt(corrF.p, 4) + ", N=" + corrF.n + ")");
  console.log("");

  // ── 5. F as success/failure discriminator AUC ──
  console.log("-".repeat(80));
  console.log("5. F as Success/Failure Discriminator AUC");
  console.log("-".repeat(80));
  const sortedTau = [...tauArr].sort((a, b) => a - b);
  const tauMedian = sortedTau[Math.floor(sortedTau.length / 2)];
  const labels = validTauSamples.map(s => s.tau > tauMedian);
  const fScores = validTauSamples.map(s => s.thermo.F);
  const rScores = validTauSamples.map(s => s.thermo.R);
  const aucF = computeAUC(fScores, labels);
  const aucR = computeAUC(rScores, labels);
  console.log("Success definition: tau > median (" + fmt(tauMedian, 3) + ")");
  console.log("F AUC (lower=better) = " + fmt(aucF, 3));
  console.log("R AUC (higher=better) = " + fmt(aucR, 3));
  console.log("(data_mining_report.md reported: F AUC=0.380, R AUC=0.422)");
  console.log("(AUC < 0.5 = worse than random, AUC > 0.6 = discriminative)");
  console.log("");

  // ── 6. Per-source verification ──
  console.log("-".repeat(80));
  console.log("6. Per-Source Verification of r((1-R), T*H)");
  console.log("-".repeat(80));
  const sources = [...new Set(allSamples.map(s => s.source))];
  console.log("source                         N    r((1-R),T*H)  p-value   verdict");
  for (const src of sources) {
    const srcSamples = allSamples.filter(s => s.source === src);
    const srcOneMinusR = srcSamples.map(s => 1 - s.thermo.R);
    const srcTH = srcSamples.map(s => s.thermo.T * s.thermo.H);
    const { r, p, n } = pearsonCorrelation(srcOneMinusR, srcTH);
    const verdict = Math.abs(r) < 0.1 ? "[OK]orth" : Math.abs(r) < 0.3 ? "[WARN]weak" : "[FAIL]corr";
    console.log(
      src.padEnd(30) + " " +
      n.toString().padStart(4) + "   " +
      fmt(r, 4).padStart(12) + " " +
      fmt(p, 4).padStart(8) + "   " +
      verdict
    );
  }
  console.log("");

  // ── 7. Conclusion ──
  console.log("=".repeat(80));
  console.log("7. Conclusion");
  console.log("=".repeat(80));
  console.log("");
  console.log("F formula orthogonality: r((1-R), T*H) = " + fmt(orthResult.r, 4) + " (p=" + fmt(orthResult.p, 4) + ")");
  console.log("");
  if (Math.abs(orthResult.r) < 0.1 && orthResult.p > 0.05) {
    console.log("Conclusion: F's two components (1-R) and T*H are statistically independent.");
    console.log("     Additive structure F = (1-R) + T*H has mathematical basis, no double-counting.");
    console.log("     BUT F AUC = " + fmt(aucF, 3) + " as decision quality discriminator.");
    console.log("     Orthogonality != discriminative power - F is diagnostic framework, not reliable discriminator.");
  } else {
    const level = Math.abs(orthResult.r) < 0.3 ? "weakly correlated" : "significantly correlated";
    const risk = Math.abs(orthResult.r) < 0.3 ? "slight" : "severe";
    console.log("Conclusion: F's two components (1-R) and T*H are " + level + ".");
    console.log("     Additive structure has " + risk + " double-counting risk.");
    console.log("     Suggest using regression weights instead of additive, or redesign F formula.");
  }
  console.log("");
  console.log("Document impact:");
  const orthVerified = Math.abs(orthResult.r) < 0.1 && orthResult.p > 0.05;
  console.log("  - TECHNICAL_REPORT.md:170 'orthogonal' claim: " + (orthVerified ? "VERIFIED by statistics" : "REVISION NEEDED (failed statistical test)"));
  console.log("  - SOT.md:173 'engineering heuristic' positioning: " + (aucF < 0.5 ? "VERIFIED (F AUC < 0.5, not reliable discriminator)" : "NEEDS RE-EVALUATION"));
}

main();
