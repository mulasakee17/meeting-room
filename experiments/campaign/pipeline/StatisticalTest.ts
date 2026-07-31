/**
 * StatisticalTest — 统计检验引擎
 *
 * 实现：置换检验、Bootstrap CI、Cohen's d、Holm-Bonferroni 校正
 * 所有检验使用统一 seed（PERMUTATION_SEED=42, BOOTSTRAP_SEED=42+0x5EED）
 */

import type { ExperimentMetrics, TestResult } from "../types";
import { mean, sampleStd, mulberry32, PERMUTATION_SEED, BOOTSTRAP_SEED } from "../../v2/statsShared";

// ============================================================================
// 分布函数：F 分布 CDF（用于 E5 Granger 因果精确 p 值）
// ============================================================================

/** Lanczos 近似 Gamma 函数 */
function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // 反射公式：Γ(x)Γ(1-x) = π / sin(πx)
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * 正则化不完全 Beta 函数 I_x(a,b)
 * 用连分式展开（Numerical Recipes 风格）
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = logGamma(a + b) - logGamma(a) - logGamma(b);
  const front = Math.exp(lbeta + a * Math.log(x) + b * Math.log(1 - x));

  // 连分式展开
  function cf(xx: number, aa: number, bb: number): number {
    const maxIter = 200;
    const eps = 1e-15;
    let qab = aa + bb, qap = aa + 1, qam = aa - 1;
    let c = 1, d = 1 - qab * xx / qap;
    if (Math.abs(d) < eps) d = eps;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= maxIter; m++) {
      const m2 = 2 * m;
      let aaa = m * (bb - m) * xx / ((qam + m2) * (aa + m2));
      d = 1 + aaa * d;
      if (Math.abs(d) < eps) d = eps;
      c = 1 + aaa / c;
      if (Math.abs(c) < eps) c = eps;
      d = 1 / d;
      h *= d * c;
      aaa = -(aa + m) * (qab + m) * xx / ((aa + m2) * (qap + m2));
      d = 1 + aaa * d;
      if (Math.abs(d) < eps) d = eps;
      c = 1 + aaa / c;
      if (Math.abs(c) < eps) c = eps;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < eps) break;
    }
    return h;
  }

  // 选择收敛更快的方向
  if (x < (a + 1) / (a + b + 2)) {
    return front * cf(x, a, b) / a;
  } else {
    return 1 - front * cf(1 - x, b, a) / b;
  }
}

/**
 * F 分布 CDF：P(F <= x | df1, df2)
 * 利用 F 与 Beta 的关系：若 F ~ F(d1,d2)，则 X = d1*F/(d1*F+d2) ~ Beta(d1/2, d2/2)
 */
function fDistributionCDF(x: number, df1: number, df2: number): number {
  if (x <= 0) return 0;
  if (!isFinite(x)) return 1;
  const y = df2 / (df2 + df1 * x);
  // P(F <= x) = 1 - I_y(df2/2, df1/2) = I_{1-y}(df1/2, df2/2)
  return incompleteBeta(df1 * x / (df1 * x + df2), df1 / 2, df2 / 2);
}

// ============================================================================
// Permutation Test
// ============================================================================

/**
 * 配对置换检验
 * H₀: 两组数据的均值差为 0
 * 返回 p-value（使用 (count+1)/(nPerms+1) 校正避免 p=0）
 */
export function permutationTest(
  groupA: number[],
  groupB: number[],
  nPerms: number = 10_000,
): { pValue: number; observedDiff: number } {
  const rng = mulberry32(PERMUTATION_SEED);
  const n = Math.min(groupA.length, groupB.length);
  if (n < 2) return { pValue: 1, observedDiff: 0 };

  const paired = groupA.slice(0, n).map((a, i) => ({ a, b: groupB[i] }));
  const observedDiff = mean(paired.map(p => p.a - p.b));

  let countExtreme = 0;
  for (let i = 0; i < nPerms; i++) {
    let sumDiff = 0;
    for (const p of paired) {
      sumDiff += rng() < 0.5 ? p.a - p.b : p.b - p.a;
    }
    const permDiff = sumDiff / n;
    if (Math.abs(permDiff) >= Math.abs(observedDiff)) {
      countExtreme++;
    }
  }

  return {
    pValue: (countExtreme + 1) / (nPerms + 1),
    observedDiff,
  };
}

// ============================================================================
// Bootstrap Confidence Interval
// ============================================================================

/**
 * Bootstrap 95% CI（百分位法）
 */
export function bootstrapCI(
  values: number[],
  nBoot: number = 5_000,
  ciLevel: number = 0.95,
): { lower: number; upper: number; mean: number } {
  const rng = mulberry32(BOOTSTRAP_SEED);
  const n = values.length;
  if (n < 2) return { lower: values[0] ?? 0, upper: values[0] ?? 0, mean: values[0] ?? 0 };

  const bootMeans: number[] = [];
  for (let i = 0; i < nBoot; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += values[Math.floor(rng() * n)];
    }
    bootMeans.push(sum / n);
  }

  bootMeans.sort((a, b) => a - b);
  const alpha = (1 - ciLevel) / 2;
  const lowerIdx = Math.floor(alpha * nBoot);
  const upperIdx = Math.floor((1 - alpha) * nBoot) - 1;

  return {
    lower: bootMeans[Math.max(0, lowerIdx)],
    upper: bootMeans[Math.min(nBoot - 1, upperIdx)],
    mean: mean(values),
  };
}

// ============================================================================
// Cohen's d
// ============================================================================

export function cohensD(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return 0;
  const ma = mean(a), mb = mean(b);
  const va = a.reduce((s, v) => s + (v - ma) ** 2, 0) / (a.length - 1);
  const vb = b.reduce((s, v) => s + (v - mb) ** 2, 0) / (b.length - 1);
  const sp = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
  return sp === 0 ? 0 : (ma - mb) / sp;
}

// ============================================================================
// Holm-Bonferroni Correction
// ============================================================================

/**
 * 对多个 p-value 进行 Holm-Bonferroni 校正
 * 返回校正后的 p-value（保持原始顺序）
 */
export function holmBonferroni(pValues: number[]): number[] {
  const n = pValues.length;
  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);

  const adjusted = new Array<number>(n);
  for (let rank = 0; rank < n; rank++) {
    const holmP = Math.min(1, indexed[rank].p * (n - rank));
    adjusted[indexed[rank].i] = holmP;
  }
  return adjusted;
}

// ============================================================================
// E1: State Stability Test
// ============================================================================

function testE1(metrics: ExperimentMetrics): TestResult {
  const ss = metrics.stateStability!;
  const ratios = ss.perRunRatios;

  // 单样本检验：稳定性比是否 > 1
  const shifted = ratios.map(r => r - 1); // H₀: mean = 0
  const n = shifted.length;
  const m = mean(shifted);
  const se = sampleStd(shifted) / Math.sqrt(n);
  const tStat = n >= 2 ? m / (se || 1) : 0;

  // 置换检验
  const rng = mulberry32(PERMUTATION_SEED);
  let countExtreme = 0;
  const nPerms = 10_000;
  for (let i = 0; i < nPerms; i++) {
    let sum = 0;
    for (const v of shifted) {
      sum += rng() < 0.5 ? v : -v;
    }
    const permMean = sum / n;
    if (permMean >= m) countExtreme++;
  }
  const pValue = (countExtreme + 1) / (nPerms + 1);

  const ci = bootstrapCI(ratios);
  const d = Math.abs(mean(ratios) - 1) / (sampleStd(ratios) || 1); // 近似 Cohen's d

  return {
    experimentId: "e1_stability",
    testName: "State Stability Permutation Test",
    pValue,
    effectSize: ss.stabilityRatio,
    effectSizeName: "Stability Ratio",
    ciLower: ci.lower,
    ciUpper: ci.upper,
    ciLevel: 0.95,
    sampleSize: n,
    significant: pValue < 0.05,
    conclusion: pValue < 0.05
      ? `Utility 比 Belief 显著更稳定 (稳定性比=${ss.stabilityRatio.toFixed(2)}, p=${pValue.toFixed(4)}, d≈${d.toFixed(2)})`
      : `未发现 Utility 稳定性显著优于 Belief (p=${pValue.toFixed(4)})`,
    details: {
      sigmaSqDeltaB: ss.sigmaSqDeltaB,
      sigmaSqDeltaU: ss.sigmaSqDeltaU,
      tStatistic: tStat,
      cohensD: d,
      nPermutations: nPerms,
    },
  };
}

// ============================================================================
// E2: Evidence Explanatory Power Test
// ============================================================================

function testE2(metrics: ExperimentMetrics): TestResult {
  const ee = metrics.evidenceExplanatory!;
  const deltaR2 = ee.deltaR2;

  // 模型级 Bootstrap：对 (ΔE, ΔU) 和 (ΔC, ΔB) 数据点重采样
  const bd = ee._bootstrapData;
  let pValue: number;
  let ciLower: number;
  let ciUpper: number;
  let nBoot = 5000;

  if (bd && bd.deltaECoverage.length >= 2 && bd.deltaU.length >= 2) {
    const rng = mulberry32(BOOTSTRAP_SEED);
    const n = Math.min(bd.deltaECoverage.length, bd.deltaU.length);
    const bootDeltaR2: number[] = [];

    for (let b = 0; b < nBoot; b++) {
      // 重采样索引
      const idx: number[] = [];
      for (let i = 0; i < n; i++) idx.push(Math.floor(rng() * n));

      const bootE = idx.map(i => bd.deltaECoverage[i]);
      const bootU = idx.map(i => bd.deltaU[i]);
      const bootC = idx.map(i => bd.deltaConfidence[i] ?? bd.deltaECoverage[i]);
      const bootB = idx.map(i => bd.deltaB[i] ?? bd.deltaU[i]);

      const cogModel = simpleLinearRegressionBoot(bootE, bootU);
      const belModel = simpleLinearRegressionBoot(bootC, bootB);
      bootDeltaR2.push(cogModel.r2 - belModel.r2);
    }

    bootDeltaR2.sort((a, b) => a - b);
    ciLower = bootDeltaR2[Math.floor(nBoot * 0.025)];
    ciUpper = bootDeltaR2[Math.floor(nBoot * 0.975)];
    // p-value: 有多少比例的 bootstrap ΔR² ≤ 0
    pValue = (bootDeltaR2.filter(d => d <= 0).length + 1) / (nBoot + 1);
  } else {
    // 无 bootstrap 数据时：无法计算有效 p-value，返回 1.0（不显著）而非虚假的硬编码值
    const ci = bootstrapCI([deltaR2], nBoot);
    ciLower = ci.lower;
    ciUpper = ci.upper;
    pValue = 1.0;
  }

  return {
    experimentId: "e2_evidence",
    testName: "Evidence Explanatory Power (ΔR²)",
    pValue,
    effectSize: deltaR2,
    effectSizeName: "ΔR²",
    ciLower,
    ciUpper,
    ciLevel: 0.95,
    sampleSize: metrics.sampleSize,
    significant: pValue < 0.05,
    conclusion: pValue < 0.05
      ? `Evidence 模型解释力显著优于 Belief 模型 (ΔR²=${deltaR2.toFixed(3)}, p=${pValue.toFixed(4)}, 95% CI [${ciLower.toFixed(3)}, ${ciUpper.toFixed(3)}])`
      : `Evidence 模型未展现显著优势 (ΔR²=${deltaR2.toFixed(3)}, p=${pValue.toFixed(4)})`,
    details: {
      r2Cognitive: ee.r2Cognitive,
      r2Belief: ee.r2Belief,
      aicCognitive: ee.aicCognitive,
      aicBelief: ee.aicBelief,
      bootstrapSamples: nBoot,
      ciLower,
      ciUpper,
    },
  };
}

/** 简单线性回归（无截距），用于 bootstrap 内部 */
function simpleLinearRegressionBoot(x: number[], y: number[]): { beta: number; r2: number } {
  const n = x.length;
  if (n < 2) return { beta: 0, r2: 0 };
  let sumXY = 0, sumX2 = 0, sumY2 = 0, sumY = 0;
  for (let i = 0; i < n; i++) {
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
    sumY += y[i];
  }
  const beta = sumXY / (sumX2 || 1);
  const yMean = sumY / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = beta * x[i];
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { beta, r2 };
}

// ============================================================================
// E3: Inertia → Authority Bias Test
// ============================================================================

function testE3(metrics: ExperimentMetrics): TestResult {
  const ia = metrics.inertiaAuthority!;
  const observedAUC = ia.auc;
  const oddsRatio = ia.oddsRatio;

  // 置换检验：H₀: AUC = 0.5（Inertia 不能预测 Authority Bias）
  const bd = ia._bootstrapData;
  let pValue: number;
  let ciLower: number;
  let ciUpper: number;
  const nPerms = 10_000;

  if (bd && bd.inertiaValues.length >= 2) {
    const rng = mulberry32(PERMUTATION_SEED);
    const n = bd.inertiaValues.length;
    let countExtreme = 0;

    for (let p = 0; p < nPerms; p++) {
      // 随机打乱 labels
      const permLabels = [...bd.authorityBiasLabels];
      for (let i = permLabels.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [permLabels[i], permLabels[j]] = [permLabels[j], permLabels[i]];
      }

      // 计算置换后的 AUC
      const pos = bd.inertiaValues.filter((_, i) => permLabels[i] >= 0.5);
      const neg = bd.inertiaValues.filter((_, i) => permLabels[i] < 0.5);
      let concordant = 0, total = 0;
      for (const pv of pos) {
        for (const nv of neg) {
          total++;
          if (pv > nv) concordant++;
          else if (Math.abs(pv - nv) < 1e-10) concordant += 0.5;
        }
      }
      const permAUC = total > 0 ? concordant / total : 0.5;
      if (permAUC >= observedAUC) countExtreme++;
    }

    pValue = (countExtreme + 1) / (nPerms + 1);

    // Bootstrap CI for AUC
    const rngBoot = mulberry32(BOOTSTRAP_SEED);
    const bootAUCs: number[] = [];
    const nBoot = 5000;
    for (let b = 0; b < nBoot; b++) {
      const idx: number[] = [];
      for (let i = 0; i < n; i++) idx.push(Math.floor(rngBoot() * n));
      const bootX = idx.map(i => bd.inertiaValues[i]);
      const bootY = idx.map(i => bd.authorityBiasLabels[i]);
      const p = bootX.filter((_, i) => bootY[i] >= 0.5);
      const ng = bootX.filter((_, i) => bootY[i] < 0.5);
      let conc = 0, tot = 0;
      for (const pv of p) {
        for (const nv of ng) {
          tot++;
          if (pv > nv) conc++;
          else if (Math.abs(pv - nv) < 1e-10) conc += 0.5;
        }
      }
      bootAUCs.push(tot > 0 ? conc / tot : 0.5);
    }
    bootAUCs.sort((a, b) => a - b);
    ciLower = bootAUCs[Math.floor(nBoot * 0.025)];
    ciUpper = bootAUCs[Math.floor(nBoot * 0.975)];
  } else {
    pValue = 1;
    ciLower = observedAUC;
    ciUpper = observedAUC;
  }

  return {
    experimentId: "e3_inertia",
    testName: "Inertia → Authority Bias (AUC)",
    pValue,
    effectSize: observedAUC,
    effectSizeName: "AUC",
    ciLower,
    ciUpper,
    ciLevel: 0.95,
    sampleSize: metrics.sampleSize,
    significant: pValue < 0.05 && observedAUC > 0.5,
    conclusion: pValue < 0.05 && observedAUC > 0.5
      ? `Inertia 显著预测 Authority Bias (AUC=${observedAUC.toFixed(3)}, OR=${oddsRatio.toFixed(2)}, p=${pValue.toFixed(4)})`
      : `Inertia 未能显著预测 Authority Bias (AUC=${observedAUC.toFixed(3)}, p=${pValue.toFixed(4)})`,
    details: {
      auc: observedAUC,
      oddsRatio,
      nPermutations: nPerms,
      ciLower,
      ciUpper,
    },
  };
}

// ============================================================================
// E4: Confidence Prediction Test
// ============================================================================

function testE4(metrics: ExperimentMetrics): TestResult {
  const cp = metrics.confidencePrediction!;
  const beta1Cog = cp.beta1Cognitive;
  const beta1Bel = cp.beta1Belief;

  // Bootstrap CI for β₁_Cognitive
  const bd = cp._bootstrapData;
  let pValue: number;
  let ciLower: number;
  let ciUpper: number;
  const nBoot = 5000;

  if (bd && bd.confValues.length >= 2) {
    const rng = mulberry32(BOOTSTRAP_SEED);
    const n = bd.confValues.length;
    const bootBetas: number[] = [];

    for (let b = 0; b < nBoot; b++) {
      const idx: number[] = [];
      for (let i = 0; i < n; i++) idx.push(Math.floor(rng() * n));
      const bootX = idx.map(i => bd.confValues[i]);
      const bootY = idx.map(i => bd.deltaUValues[i]);
      let sumXY = 0, sumX2 = 0;
      for (let i = 0; i < bootX.length; i++) {
        sumXY += bootX[i] * bootY[i];
        sumX2 += bootX[i] * bootX[i];
      }
      bootBetas.push(sumXY / (sumX2 || 1));
    }

    bootBetas.sort((a, b) => a - b);
    ciLower = bootBetas[Math.floor(nBoot * 0.025)];
    ciUpper = bootBetas[Math.floor(nBoot * 0.975)];
    // p 值：Bootstrap 分布中与观测值异号（跨越 0）的比例
    // 修复：原实现用 |b| >= |β_obs| 比例法，但这测试的是"观测值在 bootstrap 分布中的极端性"，
    //       而非 H₀: β=0。当 β_obs≈2.0 且 bootstrap 居中于 2.0 时，约一半样本 |b|≥2.0 → p≈0.5（错误地不显著）。
    //       正确做法（与 E8 一致）：计算 bootstrap 样本跨越 0 的比例，(count+1)/(n+1) 校正避免 p=0。
    pValue = (bootBetas.filter(b => {
      return (beta1Cog >= 0 && b <= 0) || (beta1Cog < 0 && b >= 0);
    }).length + 1) / (nBoot + 1);
  } else {
    pValue = 1;
    ciLower = beta1Cog;
    ciUpper = beta1Cog;
  }

  const deltaBeta = beta1Cog - beta1Bel;

  return {
    experimentId: "e4_confidence",
    testName: "Confidence Prediction (β₁)",
    pValue,
    effectSize: beta1Cog,
    effectSizeName: "β₁ (Cognitive)",
    ciLower,
    ciUpper,
    ciLevel: 0.95,
    sampleSize: metrics.sampleSize,
    significant: pValue < 0.05 && ciLower > 0,
    conclusion: pValue < 0.05 && ciLower > 0
      ? `Confidence 显著预测未来 Utility 变化 (β₁=${beta1Cog.toFixed(4)}, p=${pValue.toFixed(4)}, 95% CI [${ciLower.toFixed(4)}, ${ciUpper.toFixed(4)}])`
      : `Confidence 未能显著预测未来 Utility 变化 (β₁=${beta1Cog.toFixed(4)}, p=${pValue.toFixed(4)})`,
    details: {
      beta1Cognitive: beta1Cog,
      beta1Belief: beta1Bel,
      deltaBeta,
      r2Cognitive: cp.marginalR2Cognitive,
      r2Belief: cp.marginalR2Belief,
      ciLower,
      ciUpper,
    },
  };
}

// ============================================================================
// E5: Governance Mechanism Test
// ============================================================================

function testE5(metrics: ExperimentMetrics): TestResult {
  const gm = metrics.governanceMechanism!;
  const deltaTau = gm.deltaTau;

  // Granger 因果检验：v6.1 修复 per-series F 与 df2 错配
  // 旧实现：F 取 per-series 均值，但 df2 用聚合 grangerN（allEvidenceSeq.length），
  //         导致 F 统计量与自由度不匹配，p 值严重偏低（假阳性）。
  // 新实现：对每条序列单独计算 p 值（df2 = 序列长度 - 3），
  //         再用 Bonferroni 合并（min(p_i) × k）控制 family-wise error。
  const bd = gm._bootstrapData;
  const df1 = 1;
  // 声明在 if/else 外部，确保 return 语句可访问（修复原 else 块内 const 导致的作用域 bug）
  const F_EtoU = gm.grangerF_evidenceToUtility;
  const F_UtoE = gm.grangerF_utilityToEvidence;
  let pGranger: number;
  let pEtoU: number;
  let pUtoE: number;
  let df2: number;
  let grangerMethod: string;

  if (bd && bd.perSeriesF_EtoU && bd.perSeriesF_UtoE && bd.perSeriesN &&
      bd.perSeriesF_EtoU.length > 0) {
    // 对每条序列计算双向 p 值
    const allPValues: number[] = [];
    let minP_EtoU = 1, minP_UtoE = 1;
    for (let i = 0; i < bd.perSeriesF_EtoU.length; i++) {
      const df2_i = Math.max((bd.perSeriesN[i] ?? 4) - 3, 1);
      const pEtoU_i = 1 - fDistributionCDF(bd.perSeriesF_EtoU[i], df1, df2_i);
      const pUtoE_i = 1 - fDistributionCDF(bd.perSeriesF_UtoE[i], df1, df2_i);
      allPValues.push(pEtoU_i, pUtoE_i);
      minP_EtoU = Math.min(minP_EtoU, pEtoU_i);
      minP_UtoE = Math.min(minP_UtoE, pUtoE_i);
    }
    // Bonferroni 合并：min(p) × k，上限 1
    const k = allPValues.length;
    pGranger = Math.min(1, Math.min(...allPValues) * k);
    // 代表性值用于报告（取 per-series 最小 p 值和首条序列的 df2）
    pEtoU = minP_EtoU;
    pUtoE = minP_UtoE;
    df2 = Math.max((bd.perSeriesN[0] ?? 4) - 3, 1);
    grangerMethod = "per-series Bonferroni";
  } else {
    // 回退：无 per-series 数据，用聚合值（旧逻辑，标注为近似）
    const grangerN = bd?.grangerN ?? 30;
    df2 = Math.max(grangerN - 3, 1);
    pEtoU = 1 - fDistributionCDF(F_EtoU, df1, df2);
    pUtoE = 1 - fDistributionCDF(F_UtoE, df1, df2);
    pGranger = Math.min(pEtoU, pUtoE);
    grangerMethod = "aggregate (fallback)";
  }

  // Δτ 的 Bootstrap CI：对 per-run (tauGov, tauNoGov) 配对重采样
  // bd 已在上方 Granger 段声明
  let ciLower: number, ciUpper: number;
  if (bd && bd.tauGov.length >= 2 && bd.tauNoGov.length >= 2) {
    const rng = mulberry32(BOOTSTRAP_SEED);
    const nBoot = 5000;
    const n = Math.min(bd.tauGov.length, bd.tauNoGov.length);
    const bootDeltas: number[] = [];
    for (let b = 0; b < nBoot; b++) {
      let sumGov = 0, sumNoGov = 0;
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(rng() * n);
        sumGov += bd.tauGov[idx];
        sumNoGov += bd.tauNoGov[idx];
      }
      bootDeltas.push(sumGov / n - sumNoGov / n);
    }
    bootDeltas.sort((a, b) => a - b);
    ciLower = bootDeltas[Math.floor(nBoot * 0.025)];
    ciUpper = bootDeltas[Math.floor(nBoot * 0.975)];
  } else {
    // 回退：单值，无 CI 信息量
    ciLower = deltaTau;
    ciUpper = deltaTau;
  }

  return {
    experimentId: "e5_governance",
    testName: "Governance Mechanism (Granger + Δτ)",
    pValue: pGranger,
    effectSize: deltaTau,
    effectSizeName: "Δτ",
    ciLower,
    ciUpper,
    ciLevel: 0.95,
    sampleSize: metrics.sampleSize,
    significant: pGranger < 0.05 && deltaTau > 0,
    conclusion: pGranger < 0.05 && deltaTau > 0
      ? `Governance 通过 Evidence 路径显著提升决策质量 (Δτ=${deltaTau.toFixed(3)}, Granger F=${F_EtoU.toFixed(2)}, p=${pGranger.toFixed(4)})`
      : `Governance 机制未展现显著效果 (Δτ=${deltaTau.toFixed(3)}, Granger F=${F_EtoU.toFixed(2)}, p=${pGranger.toFixed(4)})`,
    details: {
      grangerF_evidenceToUtility: F_EtoU,
      grangerF_utilityToEvidence: F_UtoE,
      grangerP_evidenceToUtility: pEtoU,
      grangerP_utilityToEvidence: pUtoE,
      grangerDf1: df1,
      grangerDf2: df2,
      grangerMethod,
      indirectEffect: gm.indirectEffect,
      mediationRatio: gm.mediationRatio,
      tauWithGovernance: gm.tauWithGovernance,
      tauWithoutGovernance: gm.tauWithoutGovernance,
      deltaTau,
      bootstrapMethod: "paired resampling of per-run (tauGov, tauNoGov)",
    },
  };
}

// ============================================================================
// E6: State Decoupling Test
// ============================================================================

function testE6(metrics: ExperimentMetrics): TestResult {
  const sd = metrics.stateDecoupling!;
  const maxCorrCog = sd.maxCorrCognitive;
  const maxCorrBel = sd.maxCorrBelief;

  // v6.1 修复：Fisher z 检验的独立性违反
  // 旧实现用全局聚合相关 + se=sqrt(2/(n-3))，n=sampleSize（snapshot 数，可能数百），
  // 但相关系数本身聚合所有 run 所有轮，观测独立性被违反，se 严重低估，p 值偏小。
  // 新实现：主推断用 per-run 配对 Bootstrap CI；Fisher z 仅作回退（小样本时）。
  const bd = sd._bootstrapData;
  const hasBootstrap = bd && bd.corrCognitivePerRun.length >= 2 && bd.corrBeliefPerRun.length >= 2;
  let ciLower: number, ciUpper: number;
  let pValue: number;
  let zDiff: number | undefined;
  const n = metrics.sampleSize;

  if (hasBootstrap) {
    // 主推断：per-run 配对 Bootstrap（尊重 run 间独立性）
    const rng = mulberry32(BOOTSTRAP_SEED);
    const nBoot = 5000;
    const m = Math.min(bd!.corrCognitivePerRun.length, bd!.corrBeliefPerRun.length);
    const bootDiffs: number[] = [];
    for (let b = 0; b < nBoot; b++) {
      let sumCog = 0, sumBel = 0;
      for (let i = 0; i < m; i++) {
        const idx = Math.floor(rng() * m);
        sumCog += bd!.corrCognitivePerRun[idx];
        sumBel += bd!.corrBeliefPerRun[idx];
      }
      bootDiffs.push(sumBel / m - sumCog / m);
    }
    bootDiffs.sort((a, b) => a - b);
    ciLower = bootDiffs[Math.floor(nBoot * 0.025)];
    ciUpper = bootDiffs[Math.floor(nBoot * 0.975)];
    // Bootstrap p 值：Δ|r| <= 0 的比例 × 2（双侧）
    const propLeq0 = bootDiffs.filter(d => d <= 0).length / nBoot;
    pValue = Math.min(1, 2 * Math.min(propLeq0, 1 - propLeq0));
  } else {
    // 回退：Fisher z（仅当 per-run 数据不足时）
    const zCog = Math.atanh(Math.min(Math.abs(maxCorrCog), 0.999));
    const zBel = Math.atanh(Math.min(Math.abs(maxCorrBel), 0.999));
    const se = Math.sqrt(2 / Math.max(n - 3, 1));
    zDiff = (zBel - zCog) / (se || 1);
    pValue = 1 - normalCDF(Math.abs(zDiff));
    ciLower = (maxCorrBel - maxCorrCog) - 1.96 * se;
    ciUpper = (maxCorrBel - maxCorrCog) + 1.96 * se;
  }

  // 显著性：Bootstrap CI 不跨 0，或 Fisher z p < 0.05（回退）
  const significant = hasBootstrap
    ? (ciLower > 0) === (ciUpper > 0) && ciLower !== 0 && ciUpper !== 0
    : pValue < 0.05;

  return {
    experimentId: "e6_decoupling",
    testName: "State Decoupling (Bootstrap Δ|r|)" ,
    pValue,
    effectSize: maxCorrBel - maxCorrCog,
    effectSizeName: "Δ|r|",
    ciLower,
    ciUpper,
    ciLevel: 0.95,
    sampleSize: n,
    significant,
    conclusion: significant
      ? `Cognitive State 变量间最大相关性 (${maxCorrCog.toFixed(3)}) 显著低于 Belief 模型 (${maxCorrBel.toFixed(3)}, p=${pValue.toFixed(4)})`
      : `Cognitive State 解耦性未显著优于 Belief (p=${pValue.toFixed(4)})`,
    details: {
      maxCorrCognitive: maxCorrCog,
      maxCorrBelief: maxCorrBel,
      vifMax: sd.vifMax,
      fisherZ: zDiff,
      inferenceMethod: hasBootstrap ? "per-run paired bootstrap" : "fisher-z fallback",
      ciLower,
      ciUpper,
    },
  };
}

// ============================================================================
// E7: Detector Accuracy Test
// ============================================================================

function testE7(metrics: ExperimentMetrics): TestResult {
  const da = metrics.detectorAccuracy!;
  const f1Cog = da.f1Cognitive;
  const f1Bel = da.f1Belief;
  const deltaF1 = f1Cog - f1Bel;

  // Bootstrap：对 per-run (cognitivePred, beliefPred, groundTruth) 配对重采样，重新计算 F1
  const bd = da._bootstrapData;
  let pValue: number;
  let ciLower: number, ciUpper: number;

  if (bd && bd.cognitivePreds.length >= 2 && bd.groundTruths.length >= 2) {
    const rng = mulberry32(BOOTSTRAP_SEED);
    const nBoot = 5000;
    const n = bd.groundTruths.length;
    const bootDeltaF1: number[] = [];

    for (let b = 0; b < nBoot; b++) {
      // 重采样索引
      const indices: number[] = [];
      for (let i = 0; i < n; i++) indices.push(Math.floor(rng() * n));

      // 用重采样索引计算 F1
      const bootF1Cog = computeF1FromBooleans(
        indices.map(i => bd.cognitivePreds[i]),
        indices.map(i => bd.groundTruths[i]),
      );
      const bootF1Bel = computeF1FromBooleans(
        indices.map(i => bd.beliefPreds[i]),
        indices.map(i => bd.groundTruths[i]),
      );
      bootDeltaF1.push(bootF1Cog - bootF1Bel);
    }

    bootDeltaF1.sort((a, b) => a - b);
    ciLower = bootDeltaF1[Math.floor(nBoot * 0.025)];
    ciUpper = bootDeltaF1[Math.floor(nBoot * 0.975)];
    // 双侧 p：ΔF1 <= 0 的比例 × 2
    const propLeq0 = bootDeltaF1.filter(d => d <= 0).length / nBoot;
    pValue = Math.min(1, 2 * Math.min(propLeq0, 1 - propLeq0));
  } else {
    // 回退：无原始数据，无法做 Bootstrap
    pValue = 1;
    ciLower = deltaF1;
    ciUpper = deltaF1;
  }

  return {
    experimentId: "e7_detector",
    testName: "Detector Accuracy (ΔF1)",
    pValue,
    effectSize: deltaF1,
    effectSizeName: "ΔF1",
    ciLower,
    ciUpper,
    ciLevel: 0.95,
    sampleSize: metrics.sampleSize,
    significant: pValue < 0.05 && deltaF1 > 0,
    conclusion: pValue < 0.05 && deltaF1 > 0
      ? `Cognitive Detector 准确率显著优于 Belief (ΔF1=${deltaF1.toFixed(3)}, p=${pValue.toFixed(4)})`
      : `Cognitive Detector 未展现显著优势 (ΔF1=${deltaF1.toFixed(3)}, p=${pValue.toFixed(4)})`,
    details: {
      f1Cognitive: f1Cog,
      f1Belief: f1Bel,
      precisionCognitive: da.precisionCognitive,
      recallCognitive: da.recallCognitive,
      precisionBelief: da.precisionBelief,
      recallBelief: da.recallBelief,
      deltaF1,
      ciLower,
      ciUpper,
      bootstrapMethod: "paired resampling of per-run (cognitivePred, beliefPred, groundTruth) with F1 recompute",
    },
  };
}

/** 从布尔数组计算 F1（用于 E7 Bootstrap 重采样） */
function computeF1FromBooleans(preds: boolean[], truths: boolean[]): number {
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < preds.length; i++) {
    if (preds[i] && truths[i]) tp++;
    else if (preds[i] && !truths[i]) fp++;
    else if (!preds[i] && truths[i]) fn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  return precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
}

// ============================================================================
// E8: Susceptibility Mediation Test
// ============================================================================

function testE8(metrics: ExperimentMetrics): TestResult {
  const sm = metrics.susceptibilityMediation!;
  const indirectEffect = sm.indirectEffect;
  const mediationRatio = sm.mediationRatio;

  // Bootstrap mediation test: 对 (I, Λ, ΔU) 三元组重采样，计算 a×b 的分布
  const bd = sm._bootstrapData;
  let pValue: number;
  let ciLower: number;
  let ciUpper: number;
  const nBoot = 5000;

  if (bd && bd.inertiaValues.length >= 2) {
    const rng = mulberry32(BOOTSTRAP_SEED);
    const n = bd.inertiaValues.length;
    const bootIndirectEffects: number[] = [];

    for (let b = 0; b < nBoot; b++) {
      const idx: number[] = [];
      for (let i = 0; i < n; i++) idx.push(Math.floor(rng() * n));
      const bootI = idx.map(i => bd.inertiaValues[i]);
      const bootS = idx.map(i => bd.susceptibilityValues[i]);
      const bootDU = idx.map(i => bd.deltaUValues[i]);

      // Step 1: I → Λ (a path)
      let sumXY = 0, sumX2 = 0;
      const mxI = bootI.reduce((s, v) => s + v, 0) / n;
      const mxS = bootS.reduce((s, v) => s + v, 0) / n;
      for (let i = 0; i < n; i++) {
        sumXY += (bootI[i] - mxI) * (bootS[i] - mxS);
        sumX2 += (bootI[i] - mxI) ** 2;
      }
      const a = sumX2 > 0 ? sumXY / sumX2 : 0;

      // Step 2: Λ → ΔU controlling for I (b path)
      // 残差化
      const mDU = bootDU.reduce((s, v) => s + v, 0) / n;
      let covIDU = 0, varI = 0;
      for (let i = 0; i < n; i++) {
        covIDU += (bootI[i] - mxI) * (bootDU[i] - mDU);
        varI += (bootI[i] - mxI) ** 2;
      }
      const betaI = varI > 0 ? covIDU / varI : 0;
      const interceptDU = mDU - betaI * mxI;

      const resDU = bootDU.map((du, i) => du - (betaI * bootI[i] + interceptDU));
      const resS = bootS.map((s, i) => s - (a * bootI[i] + (mxS - a * mxI)));

      let covRes = 0, varResS = 0;
      const mResDU = resDU.reduce((s, v) => s + v, 0) / n;
      const mResS = resS.reduce((s, v) => s + v, 0) / n;
      for (let i = 0; i < n; i++) {
        covRes += (resS[i] - mResS) * (resDU[i] - mResDU);
        varResS += (resS[i] - mResS) ** 2;
      }
      const b = varResS > 0 ? covRes / varResS : 0;

      bootIndirectEffects.push(a * b);
    }

    bootIndirectEffects.sort((a, b) => a - b);
    ciLower = bootIndirectEffects[Math.floor(nBoot * 0.025)];
    ciUpper = bootIndirectEffects[Math.floor(nBoot * 0.975)];
    // p-value: 中介效应是否显著 ≠ 0
    pValue = (bootIndirectEffects.filter(ie => {
      return (indirectEffect >= 0 && ie <= 0) || (indirectEffect < 0 && ie >= 0);
    }).length + 1) / (nBoot + 1);
  } else {
    pValue = 1;
    ciLower = indirectEffect;
    ciUpper = indirectEffect;
  }

  return {
    experimentId: "e8_susceptibility",
    testName: "Susceptibility Mediation (a×b Bootstrap)",
    pValue,
    effectSize: indirectEffect,
    effectSizeName: "a×b",
    ciLower,
    ciUpper,
    ciLevel: 0.95,
    sampleSize: metrics.sampleSize,
    // 中介效应 a×b 显著：CI 两端同号（不跨越 0）
    // 修复：原 `ciLower > 0 !== ciUpper > 0` 因运算符优先级解析为 XOR，
    // 把"CI 跨 0（不显著）"误判为"显著"。改为同号判定。
    significant: pValue < 0.05 && (ciLower > 0) === (ciUpper > 0) && ciLower !== 0 && ciUpper !== 0,
    conclusion: pValue < 0.05 && (ciLower > 0) === (ciUpper > 0) && ciLower !== 0 && ciUpper !== 0
      ? `Susceptibility 显著中介 Inertia → Utility 变化 (a×b=${indirectEffect.toFixed(4)}, ${(mediationRatio * 100).toFixed(1)}% mediation, p=${pValue.toFixed(4)})`
      : `Susceptibility 中介效应不显著 (a×b=${indirectEffect.toFixed(4)}, p=${pValue.toFixed(4)})`,
    details: {
      indirectEffect,
      directEffect: sm.directEffect,
      totalEffect: sm.totalEffect,
      mediationRatio,
      ciLower,
      ciUpper,
      bootstrapSamples: nBoot,
    },
  };
}

/** 标准正态分布 CDF 近似 */
function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

// ============================================================================
// E9: Cognitive Governance Test
// ============================================================================

function testE9(metrics: ExperimentMetrics): TestResult {
  const cg = metrics.cognitiveGovernance!;

  // 使用 t-distribution 计算 CI（小样本友好）
  const n = metrics.sampleSize;
  const se = cg.stdTau / Math.sqrt(n);
  const df = n - 1;
  const tCrit = df > 0 ? tDistributionCriticalValue(df, 0.975) : 1.96;
  const ciLower = cg.meanTau - tCrit * se;
  const ciUpper = cg.meanTau + tCrit * se;

  // p-value: τ > 0? (one-sided)
  const tStat = se > 0 ? cg.meanTau / se : 0;
  const pValue = df > 0 ? 2 * (1 - tDistributionCDF(Math.abs(tStat), df)) : 1;

  const scenario = cg.scenario;
  const mode = cg.governanceMode;

  return {
    experimentId: metrics.experimentId,
    testName: `Cognitive Governance τ (${scenario}/${mode})`,
    pValue: Math.min(1, Math.max(0, pValue)),
    effectSize: cg.meanTau,
    effectSizeName: "Kendall τ",
    ciLower: Math.max(-1, ciLower),
    ciUpper: Math.min(1, ciUpper),
    ciLevel: 0.95,
    sampleSize: n,
    significant: pValue < 0.05,
    conclusion: pValue < 0.05
      ? `${scenario}/${mode}: τ=${cg.meanTau.toFixed(3)} [${ciLower.toFixed(3)}, ${ciUpper.toFixed(3)}], ${cg.totalInterventions} interventions, p=${pValue.toFixed(4)}`
      : `${scenario}/${mode}: τ=${cg.meanTau.toFixed(3)}, not significant (p=${pValue.toFixed(4)})`,
    details: {
      meanTau: cg.meanTau,
      stdTau: cg.stdTau,
      totalInterventions: cg.totalInterventions,
      interventionsPerRound: cg.interventionsPerRound,
      detectorTriggers: cg.detectorTriggers,
      interventionTypeDistribution: cg.interventionTypeDistribution,
      meanConvergenceRounds: cg.meanConvergenceRounds,
      scenario,
      governanceMode: mode,
      tStatistic: tStat,
      degreesOfFreedom: df,
    },
  };
}

/** t-distribution CDF approximation */
function tDistributionCDF(t: number, df: number): number {
  if (df <= 0) return normalCDF(t);
  // 使用正态近似（大 df）
  if (df > 30) return normalCDF(t);
  // 简化的小 df 近似
  const x = t * (1 - 1 / (4 * df)) / Math.sqrt(1 + t * t / (2 * df));
  return normalCDF(x);
}

/** t-distribution critical value (双侧 α=0.05，单侧 α=0.975) */
export function tDistributionCriticalValue(df: number, alpha: number): number {
  if (df <= 0) return 1.96;
  if (df > 30) return 1.96;
  // 完整 t 分布临界值表（双侧 α=0.05），消除原表 df=11-14 等缺口返回 2.0 的 CI 偏窄 bug
  const table: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
    6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
    11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145,
    15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093,
    20: 2.086, 21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064,
    25: 2.060, 26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045,
    30: 2.042,
  };
  return table[df] ?? 1.96;
}

// ============================================================================
// Main Dispatch
// ============================================================================

export function runTests(metrics: ExperimentMetrics): TestResult[] {
  const results: TestResult[] = [];

  switch (metrics.experimentId) {
    case "e1_stability":
    case "e1_native":
      if (metrics.stateStability) results.push(testE1(metrics));
      break;
    case "e2_evidence":
      if (metrics.evidenceExplanatory) results.push(testE2(metrics));
      break;
    case "e3_inertia":
      if (metrics.inertiaAuthority) results.push(testE3(metrics));
      break;
    case "e4_confidence":
      if (metrics.confidencePrediction) results.push(testE4(metrics));
      break;
    case "e5_governance":
      if (metrics.governanceMechanism) results.push(testE5(metrics));
      break;
    case "e6_decoupling":
      if (metrics.stateDecoupling) results.push(testE6(metrics));
      break;
    case "e7_detector":
      if (metrics.detectorAccuracy) results.push(testE7(metrics));
      break;
    case "e8_susceptibility":
      if (metrics.susceptibilityMediation) results.push(testE8(metrics));
      break;
    default:
      if (metrics.experimentId.startsWith("e9_") && metrics.cognitiveGovernance) {
        results.push(testE9(metrics));
      }
      break;
  }

  // 如果多个检验，应用 Holm-Bonferroni
  if (results.length > 1) {
    const rawPs = results.map(r => r.pValue);
    const adjusted = holmBonferroni(rawPs);
    for (let i = 0; i < results.length; i++) {
      results[i].pValueAdjusted = adjusted[i];
      results[i].significant = adjusted[i] < 0.05;
    }
  }

  return results;
}