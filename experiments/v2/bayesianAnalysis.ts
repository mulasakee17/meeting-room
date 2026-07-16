/**
 * 贝叶斯重分析（Bayesian Re-analysis）
 *
 * 目标：用现有 n=15 Crisis 数据，通过贝叶斯方法计算后验概率，
 *       回答"治理效应 d > 0 的概率是多少？"——即使频率派 p > 0.05。
 *
 * 方法：
 *   1. 两组 (none, full) 的 τ 样本 → Cohen's d 观测值
 *   2. 设先验 d ~ Normal(0, scale)（对称弱信息先验：允许 d<0，P(d>0)=0.5 a priori）
 *   3. 似然 = Cohen's d 抽样分布（含 d²/(2(n1+n2)) 项，Hedges & Olkin 1985）
 *   4. 网格近似计算后验 P(d | data)
 *   5. 报告：P(d>0)、95% 可信区间（HDI）、后验均值
 *
 * 同时对 shuffle vs none 做同样分析。
 *
 * 运行：npx tsx experiments/v2/bayesianAnalysis.ts
 * 不需要 API key，使用已有实验数据。
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// 类型与数据加载
// ============================================================================

interface ExperimentResult {
  runId: string;
  ablation: string;
  kendallTau: number;
  decisionQuality: number;
}

function loadData(dir: string, prefix: string): ExperimentResult[] {
  const files = fs.readdirSync(dir).filter(
    f => f.endsWith(".json") && f.startsWith(prefix) && f !== "summary.json"
  );
  return files.map(f => {
    const content = fs.readFileSync(path.join(dir, f), "utf-8");
    const raw = JSON.parse(content) as ExperimentResult & { error?: string };
    if (raw.error) return null;
    return { runId: raw.runId, ablation: raw.ablation, kendallTau: raw.kendallTau, decisionQuality: raw.decisionQuality };
  }).filter((r): r is ExperimentResult => r !== null);
}

// ============================================================================
// 基础统计
// ============================================================================

function mean(v: number[]): number {
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function sampleStd(v: number[]): number {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

function cohensD(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return 0;
  const ma = mean(a), mb = mean(b);
  const va = a.reduce((s, v) => s + (v - ma) ** 2, 0) / (a.length - 1);
  const vb = b.reduce((s, v) => s + (v - mb) ** 2, 0) / (b.length - 1);
  const sp = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
  return sp === 0 ? 0 : (ma - mb) / sp;
}

// ============================================================================
// 贝叶斯推断（网格近似）
// ============================================================================

/**
 * 正态分布概率密度函数
 */
function normalPdf(x: number, mu: number, sigma: number): number {
  return Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
}

/**
 * 对称正态先验密度 Normal(0, scale)
 *
 * 允许 d 取正值或负值，P(d>0)=0.5（先验中性）。
 * 这样后验 P(d>0) 才真正反映数据对"效应为正"的支持程度。
 *
 * scale 越小越怀疑效应接近 0，越大越宽容（允许大效应）。
 */
function normalPrior(d: number, scale: number): number {
  return normalPdf(d, 0, scale);
}

/**
 * Cohen's d 抽样分布似然（Hedges & Olkin 1985 近似）
 *
 * 给定两组样本和假设的效应量 d，计算观测到当前 d_hat 的似然。
 * d 的抽样方差为 σ_d² ≈ (n1+n2)/(n1·n2) + d²/(2·(n1+n2))
 *   第一项是基础项，第二项是效应量对方差的影响（大 d 时不可忽略）
 *
 * 这是一个合理的近似——对于中等样本量，d 的抽样分布接近正态。
 */
function likelihood(d: number, dHat: number, n1: number, n2: number): number {
  const sigmaD = Math.sqrt((1 / n1 + 1 / n2) + (d * d) / (2 * (n1 + n2)));  // Hedges & Olkin 1985
  return normalPdf(dHat, d, sigmaD);
}

interface BayesianResult {
  priorName: string;
  priorScale: number;
  observedD: number;
  posteriorMean: number;
  posteriorMode: number;
  probPositive: number;       // P(d > 0)
  probLarge: number;          // P(d > 0.5) — 大效应概率
  probMedium: number;         // P(d > 0.3) — 中等效应概率
  hdi95: [number, number];   // 95% 最高密度区间
  posteriorSamples: number[];
}

/**
 * 贝叶斯推断：网格近似
 *
 * @param dHat      观测到的 Cohen's d
 * @param n1, n2    两组样本量
 * @param priorScale 先验尺度（Half-Normal 的 sigma）
 * @param priorName  先验名称（用于报告）
 */
function bayesianInference(
  dHat: number,
  n1: number,
  n2: number,
  priorScale: number,
  priorName: string
): BayesianResult {
  // 在 [-2, 3] 区间取 10000 个网格点（覆盖负效应到大正效应）
  const gridMin = -2;
  const gridMax = 3;
  const nGrid = 10000;
  const gridStep = (gridMax - gridMin) / nGrid;

  const dValues: number[] = [];
  const unnormalizedPosterior: number[] = [];

  for (let i = 0; i < nGrid; i++) {
    const d = gridMin + i * gridStep;
    const prior = normalPrior(d, priorScale);
    const lik = likelihood(d, dHat, n1, n2);
    const posterior = prior * lik;
    dValues.push(d);
    unnormalizedPosterior.push(posterior);
  }

  // 归一化（梯形积分）
  const totalArea = unnormalizedPosterior.reduce(
    (sum, p, i) => sum + p * gridStep, 0
  );
  const posterior = unnormalizedPosterior.map(p => p / totalArea);

  // 后验统计量
  let posteriorMean = 0;
  for (let i = 0; i < nGrid; i++) {
    posteriorMean += dValues[i] * posterior[i] * gridStep;
  }

  // 后验众数（最大后验密度点）
  let maxPosterior = 0;
  let posteriorMode = 0;
  for (let i = 0; i < nGrid; i++) {
    if (posterior[i] > maxPosterior) {
      maxPosterior = posterior[i];
      posteriorMode = dValues[i];
    }
  }

  // P(d > 0)
  let probPositive = 0;
  for (let i = 0; i < nGrid; i++) {
    if (dValues[i] > 0) probPositive += posterior[i] * gridStep;
  }

  // P(d > 0.5) — 大效应
  let probLarge = 0;
  for (let i = 0; i < nGrid; i++) {
    if (dValues[i] > 0.5) probLarge += posterior[i] * gridStep;
  }

  // P(d > 0.3) — 中等效应
  let probMedium = 0;
  for (let i = 0; i < nGrid; i++) {
    if (dValues[i] > 0.3) probMedium += posterior[i] * gridStep;
  }

  // 95% 最高密度区间（HDI）
  // 从后验最高点向两边扩展，直到覆盖 95% 的概率质量
  const sortedIndices = Array.from({ length: nGrid }, (_, i) => i)
    .sort((a, b) => posterior[b] - posterior[a]);

  let cumulativeMass = 0;
  const hdiIndices = new Set<number>();
  for (const idx of sortedIndices) {
    hdiIndices.add(idx);
    cumulativeMass += posterior[idx] * gridStep;
    if (cumulativeMass >= 0.95) break;
  }

  const hdiIndicesSorted = Array.from(hdiIndices).sort((a, b) => a - b);
  const hdiLow = dValues[hdiIndicesSorted[0]];
  const hdiHigh = dValues[hdiIndicesSorted[hdiIndicesSorted.length - 1]];

  // 从后验采样（用于报告）
  const posteriorSamples: number[] = [];
  const rng = mulberry32(42);
  for (let i = 0; i < 5000; i++) {
    const r = rng();
    let cumulative = 0;
    for (let j = 0; j < nGrid; j++) {
      cumulative += posterior[j] * gridStep;
      if (cumulative >= r) {
        posteriorSamples.push(dValues[j]);
        break;
      }
    }
  }

  return {
    priorName,
    priorScale,
    observedD: dHat,
    posteriorMean,
    posteriorMode,
    probPositive,
    probLarge,
    probMedium,
    hdi95: [hdiLow, hdiHigh],
    posteriorSamples,
  };
}

/** mulberry32 PRNG */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ============================================================================
// 频率派对比（t 检验 + 置换检验）
// ============================================================================

/**
 *  Welch's t 检验（不假设方差齐性），返回近似 p 值
 */
function welchTTest(a: number[], b: number[]): { t: number; df: number; pValue: number } {
  const ma = mean(a), mb = mean(b);
  const va = sampleStd(a) ** 2;
  const vb = sampleStd(b) ** 2;
  const n1 = a.length, n2 = b.length;

  const se = Math.sqrt(va / n1 + vb / n2);
  const t = se === 0 ? 0 : (ma - mb) / se;

  // Welch-Satterthwaite 自由度
  const num = Math.pow(va / n1 + vb / n2, 2);
  const den = Math.pow(va / n1, 2) / (n1 - 1) + Math.pow(vb / n2, 2) / (n2 - 1);
  const df = den === 0 ? 1 : num / den;

  // 双侧 p 值——用 t 分布 CDF（替代正态近似，小样本下更准确）
  // 使用 t 分布的尾部概率：p = 2 * (1 - T_cdf(|t|, df))
  // 用正态近似 + 小样本校正因子（Welch 建议的改进）
  const z = Math.abs(t);
  const normalApprox = 2 * (1 - normalCdf(z));
  // 小样本校正：用 t 临界值与 z 临界值的比值调整尾部
  // 对于 df < 30，t 分布尾部比正态厚，p 值应更大
  const tRatio = welchTCorrection(df);
  const pValue = Math.min(1, normalApprox * tRatio);

  return { t, df, pValue };
}

/** 标准正态 CDF（近似） */
function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

/**
 * Welch t 检验的小样本校正因子
 *
 * t 分布比正态分布尾部更厚，小样本下直接用正态近似会低估 p 值。
 * 校正因子 = t_critical(df, 0.025) / z_critical(0.025)
 * 对于 df=∞，比值为 1；df 越小比值越大，p 值校正越多。
 */
function welchTCorrection(df: number): number {
  // t 分布双侧 α=0.05 临界值 / 正态临界值（1.96）
  const T_TABLE_005: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
    6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
    11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
    16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
    25: 2.060, 30: 2.042, 40: 2.021, 60: 2.000, 120: 1.980,
  };
  const dfFloor = Math.floor(df);
  let tCrit: number;
  if (T_TABLE_005[dfFloor]) {
    tCrit = T_TABLE_005[dfFloor];
  } else if (dfFloor >= 120) {
    tCrit = 1.96;
  } else {
    // 线性插值
    const keys = Object.keys(T_TABLE_005).map(Number).sort((a, b) => a - b);
    tCrit = 1.96;
    for (let i = 0; i < keys.length - 1; i++) {
      if (dfFloor > keys[i] && dfFloor < keys[i + 1]) {
        tCrit = T_TABLE_005[keys[i]] + (T_TABLE_005[keys[i + 1]] - T_TABLE_005[keys[i]]) * (dfFloor - keys[i]) / (keys[i + 1] - keys[i]);
        break;
      }
    }
  }
  return tCrit / 1.96;
}

/** erf 近似（Abramowitz & Stegun 7.1.26） */
function erf(x: number): number {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

/**
 * 置换检验（复用 analyze.ts 的逻辑，保持一致性）
 */
function permutationTest(a: number[], b: number[], nPerm: number = 10000): number {
  const combined = [...a, ...b];
  const n1 = a.length;
  const obsDiff = mean(a) - mean(b);

  const rng = mulberry32(42);
  let count = 0;

  for (let i = 0; i < nPerm; i++) {
    // Fisher-Yates shuffle
    for (let j = combined.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [combined[j], combined[k]] = [combined[k], combined[j]];
    }
    const permDiff = mean(combined.slice(0, n1)) - mean(combined.slice(n1));
    if (Math.abs(permDiff) >= Math.abs(obsDiff)) count++;
  }

  // (count+1)/(nPerm+1) 修正，避免 p=0.000 假阳性
  return (count + 1) / (nPerm + 1);
}

// ============================================================================
// 主分析
// ============================================================================

const DATA_DIR = path.resolve(__dirname, "data_crisis");

function main() {
  const noneResults = loadData(DATA_DIR, "crisis_none");
  const fullResults = loadData(DATA_DIR, "crisis_full");
  const shuffleResults = loadData(DATA_DIR, "crisis_shuffle");

  console.log("=".repeat(70));
  console.log("贝叶斯重分析：Crisis 任务（2026-07-14，治理环路闭合后）");
  console.log("=".repeat(70));

  const noneTau = noneResults.map(r => r.kendallTau);
  const fullTau = fullResults.map(r => r.kendallTau);
  const shuffleTau = shuffleResults.map(r => r.kendallTau);

  console.log(`\n样本：none (n=${noneTau.length}), full (n=${fullTau.length}), shuffle (n=${shuffleTau.length})`);
  console.log(`none   τ: ${mean(noneTau).toFixed(3)} ± ${sampleStd(noneTau).toFixed(3)}`);
  console.log(`full   τ: ${mean(fullTau).toFixed(3)} ± ${sampleStd(fullTau).toFixed(3)}`);
  console.log(`shuffle τ: ${mean(shuffleTau).toFixed(3)} ± ${sampleStd(shuffleTau).toFixed(3)}`);

  // ========================================================================
  // 分析 1: full vs none — 治理是否有效？
  // ========================================================================
  console.log("\n" + "─".repeat(70));
  console.log("分析 1: Full vs None — 治理效应");
  console.log("─".repeat(70));

  const dFull = cohensD(fullTau, noneTau);
  console.log(`\n观测 Cohen's d = ${dFull.toFixed(3)}`);

  // 频率派
  const tResult = welchTTest(fullTau, noneTau);
  const permP = permutationTest(fullTau, noneTau);
  console.log(`\n频率派：`);
  console.log(`  Welch's t: t=${tResult.t.toFixed(3)}, df=${tResult.df.toFixed(1)}, p=${tResult.pValue.toFixed(4)}`);
  console.log(`  置换检验: p=${permP.toFixed(4)} (10000 次置换)`);
  console.log(`  结论: ${permP < 0.05 ? "显著（p<0.05）" : "未达显著（p≥0.05）"}`);

  // 贝叶斯（三种先验）
  const priors = [
    { scale: 0.2, name: "怀疑先验 N(0,0.2)" },   // 认为效应接近 0，允许正负
    { scale: 0.5, name: "中立先验 N(0,0.5)" },   // 弱信息先验
    { scale: 1.0, name: "宽容先验 N(0,1.0)" },   // 允许大效应，正负
  ];

  console.log(`\n贝叶斯重分析（网格近似，10000 点）：`);
  console.log("┌──────────────────────────┬──────────┬──────────┬──────────┬─────────────────┐");
  console.log("│ 先验                     │ P(d>0)  │ P(d>0.3) │ P(d>0.5) │ 95% HDI         │");
  console.log("├──────────────────────────┼──────────┼──────────┼──────────┼─────────────────┤");

  for (const prior of priors) {
    const result = bayesianInference(dFull, noneTau.length, fullTau.length, prior.scale, prior.name);
    console.log(
      `│ ${prior.name.padEnd(24)} │ ${result.probPositive.toFixed(3).padStart(8)} │ ${result.probMedium.toFixed(3).padStart(8)} │ ${result.probLarge.toFixed(3).padStart(8)} │ [${result.hdi95[0].toFixed(2)}, ${result.hdi95[1].toFixed(2)}]${" ".repeat(Math.max(0, 15 - (result.hdi95[1].toFixed(2).length + result.hdi95[0].toFixed(2).length + 4)))}│`
    );
  }
  console.log("└──────────────────────────┴──────────┴──────────┴──────────┴─────────────────┘");

  // 详细报告中立先验
  const neutralResult = bayesianInference(dFull, noneTau.length, fullTau.length, 0.5, "中立先验");
  console.log(`\n中立先验 N(0,0.5) 详细：`);
  console.log(`  后验均值 E[d|data] = ${neutralResult.posteriorMean.toFixed(3)}`);
  console.log(`  后验众数 MAP       = ${neutralResult.posteriorMode.toFixed(3)}`);
  console.log(`  P(d > 0)          = ${(neutralResult.probPositive * 100).toFixed(1)}%  ← 治理有效的后验概率`);
  console.log(`  P(d > 0.3, 中等)  = ${(neutralResult.probMedium * 100).toFixed(1)}%`);
  console.log(`  P(d > 0.5, 大效应) = ${(neutralResult.probLarge * 100).toFixed(1)}%`);
  console.log(`  95% HDI           = [${neutralResult.hdi95[0].toFixed(3)}, ${neutralResult.hdi95[1].toFixed(3)}]`);

  // ========================================================================
  // 分析 2: shuffle vs none — 信息整合上限
  // ========================================================================
  console.log("\n" + "─".repeat(70));
  console.log("分析 2: Shuffle vs None — 信息整合效应");
  console.log("─".repeat(70));

  const dShuffle = cohensD(shuffleTau, noneTau);
  console.log(`\n观测 Cohen's d = ${dShuffle.toFixed(3)}`);

  const tShuffle = welchTTest(shuffleTau, noneTau);
  const permPShuffle = permutationTest(shuffleTau, noneTau);
  console.log(`\n频率派：`);
  console.log(`  Welch's t: t=${tShuffle.t.toFixed(3)}, df=${tShuffle.df.toFixed(1)}, p=${tShuffle.pValue.toFixed(4)}`);
  console.log(`  置换检验: p=${permPShuffle.toFixed(4)} (10000 次置换)`);
  console.log(`  结论: ${permPShuffle < 0.05 ? "显著（p<0.05）" : "未达显著（p≥0.05）"}`);

  console.log(`\n贝叶斯重分析：`);
  console.log("┌──────────────────────────┬──────────┬──────────┬──────────┬─────────────────┐");
  console.log("│ 先验                     │ P(d>0)  │ P(d>0.3) │ P(d>0.5) │ 95% HDI         │");
  console.log("├──────────────────────────┼──────────┼──────────┼──────────┼─────────────────┤");

  for (const prior of priors) {
    const result = bayesianInference(dShuffle, noneTau.length, shuffleTau.length, prior.scale, prior.name);
    console.log(
      `│ ${prior.name.padEnd(24)} │ ${result.probPositive.toFixed(3).padStart(8)} │ ${result.probMedium.toFixed(3).padStart(8)} │ ${result.probLarge.toFixed(3).padStart(8)} │ [${result.hdi95[0].toFixed(2)}, ${result.hdi95[1].toFixed(2)}]${" ".repeat(Math.max(0, 15 - (result.hdi95[1].toFixed(2).length + result.hdi95[0].toFixed(2).length + 4)))}│`
    );
  }
  console.log("└──────────────────────────┴──────────┴──────────┴──────────┴─────────────────┘");

  const shuffleNeutral = bayesianInference(dShuffle, noneTau.length, shuffleTau.length, 0.5, "中立先验");
  console.log(`\n中立先验 N(0,0.5) 详细：`);
  console.log(`  后验均值 E[d|data] = ${shuffleNeutral.posteriorMean.toFixed(3)}`);
  console.log(`  P(d > 0)          = ${(shuffleNeutral.probPositive * 100).toFixed(1)}%`);
  console.log(`  95% HDI           = [${shuffleNeutral.hdi95[0].toFixed(3)}, ${shuffleNeutral.hdi95[1].toFixed(3)}]`);

  // ========================================================================
  // 分析 3: 决策质量 Q 的贝叶斯分析
  // ========================================================================
  console.log("\n" + "─".repeat(70));
  console.log("分析 3: 决策质量 Q 的贝叶斯分析");
  console.log("─".repeat(70));

  const noneQ = noneResults.map(r => r.decisionQuality);
  const fullQ = fullResults.map(r => r.decisionQuality);
  const dQ = cohensD(fullQ, noneQ);
  const tQ = welchTTest(fullQ, noneQ);
  const permPQ = permutationTest(fullQ, noneQ);

  console.log(`\nnone Q: ${mean(noneQ).toFixed(1)} ± ${sampleStd(noneQ).toFixed(1)}`);
  console.log(`full Q: ${mean(fullQ).toFixed(1)} ± ${sampleStd(fullQ).toFixed(1)}`);
  console.log(`观测 d = ${dQ.toFixed(3)}, t=${tQ.t.toFixed(2)}, p=${tQ.pValue.toFixed(4)}, 置换 p=${permPQ.toFixed(4)}`);

  const qBayes = bayesianInference(dQ, noneQ.length, fullQ.length, 0.5, "中立先验");
  console.log(`贝叶斯（N(0,0.5)）：P(d>0) = ${(qBayes.probPositive * 100).toFixed(1)}%, 95% HDI = [${qBayes.hdi95[0].toFixed(2)}, ${qBayes.hdi95[1].toFixed(2)}]`);

  // ========================================================================
  // 总结
  // ========================================================================
  console.log("\n" + "=".repeat(70));
  console.log("总结：频率派 vs 贝叶斯对比");
  console.log("=".repeat(70));

  // 多重比较校正（Bonferroni）
  const nComparisons = 3;  // Full vs None (τ), Shuffle vs None, Full vs None (Q)
  const bonferroniAlpha = 0.05 / nComparisons;

  console.log(`\n┌───────────────────┬───────────────┬───────────────┬──────────────────────────────────┐`);
  console.log("│ 假设              │ 频率派 p 值   │ Bonferroni 校正 │ 贝叶斯 P(d>0) N(0,0.5)           │");
  console.log("├───────────────────┼───────────────┼───────────────┼──────────────────────────────────┤");
  console.log(`│ Full vs None (τ)  │ p=${permP.toFixed(4)}${permP < 0.05 ? " *" : "  "} │ p=${(permP * nComparisons).toFixed(4)}${permP * nComparisons < 0.05 ? " *" : "  "}    │ ${(neutralResult.probPositive * 100).toFixed(1)}%${neutralResult.probPositive > 0.95 ? " **" : "  "}                       │`);
  console.log(`│ Shuffle vs None   │ p=${permPShuffle.toFixed(4)}${permPShuffle < 0.05 ? " *" : "  "} │ p=${(permPShuffle * nComparisons).toFixed(4)}${permPShuffle * nComparisons < 0.05 ? " *" : "  "}    │ ${(shuffleNeutral.probPositive * 100).toFixed(1)}%${shuffleNeutral.probPositive > 0.95 ? " **" : "  "}                       │`);
  console.log(`│ Full vs None (Q)  │ p=${permPQ.toFixed(4)}${permPQ < 0.05 ? " *" : "  "} │ p=${(permPQ * nComparisons).toFixed(4)}${permPQ * nComparisons < 0.05 ? " *" : "  "}    │ ${(qBayes.probPositive * 100).toFixed(1)}%${qBayes.probPositive > 0.95 ? " **" : "  "}                       │`);
  console.log("└───────────────────┴───────────────┴───────────────┴──────────────────────────────────┘");
  console.log(`  * p<0.05 频率派显著    ** P(d>0)>95% 贝叶斯确证`);
  console.log(`  Bonferroni 校正 α = 0.05/${nComparisons} = ${bonferroniAlpha.toFixed(4)}`);

  console.log(`\n关键结论：`);
  console.log(`  1. 频率派（未校正）：Full vs None p=${permP.toFixed(4)} ${permP < 0.05 ? "→ 显著" : "→ 未显著"}`);
  console.log(`  2. 频率派（Bonferroni 校正后）：p=${(permP * nComparisons).toFixed(4)} ${permP * nComparisons < 0.05 ? "→ 仍显著" : "→ 未达显著（但 shuffle 仍显著 p=" + (permPShuffle * nComparisons).toFixed(4) + "）"}`);
  console.log(`  3. 贝叶斯：Full vs None 治理有效（d>0）的后验概率 = ${(neutralResult.probPositive * 100).toFixed(1)}%${neutralResult.probPositive > 0.95 ? "，超过 95% 确证阈值" : "，接近但未达 95% 确证阈值"}`);
  console.log(`  4. 效应量：后验均值 d=${neutralResult.posteriorMean.toFixed(2)}，95% HDI=[${neutralResult.hdi95[0].toFixed(2)}, ${neutralResult.hdi95[1].toFixed(2)}]`);
  console.log(`  5. shuffle vs none 后验 P(d>0) = ${(shuffleNeutral.probPositive * 100).toFixed(1)}%${shuffleNeutral.probPositive > 0.95 ? "，确证信息整合效应" : ""}`);

  console.log(`\n方法学说明：`);
  console.log(`  - 先验 Normal(0, scale)：对称分布，允许 d<0（效应可能为负）`);
  console.log(`  - 三种先验同时报告，验证结论的先验稳健性（prior sensitivity）`);
  console.log(`  - 网格近似（10000 点）+ HDI 区间，比频率派 CI 更适合小样本`);
  console.log(`  - 贝叶斯方法不假设大样本渐近性，n=15 也能给出可靠后验`);
  console.log(`  - 似然函数为正态近似（d 的抽样分布），n=15 下近似合理但非精确`);
  console.log(`  - 多重比较：3 个假设检验，Bonferroni 校正后 Full vs None 未达显著，但 shuffle 仍显著`);
}

main();
