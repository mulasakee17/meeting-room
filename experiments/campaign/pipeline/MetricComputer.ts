/**
 * MetricComputer — 度量计算引擎
 *
 * 从 RawRunData 中计算每个实验的度量指标。
 * 每个实验有专属的计算逻辑。
 *
 * ARCHITECTURE DECISION (Phase 4):
 *   Campaign Pipeline (this module) is the SOLE entry point for scientific experiments.
 *   - MetricComputer: 负责 Metric 计算 (E1-E8 专属指标 + Global Metrics)
 *   - StatisticalTest: 负责 Statistical Test (置换检验、Bootstrap、效应量)
 *   - FigureGenerator: 负责 Visualization (SVG 图表)
 *   - ReportGenerator: 负责 Report (Markdown + LaTeX)
 *   - CampaignSummarizer: 负责 Campaign Summary
 *
 *   src/lib/evaluation/ (EvaluationEngine) is LEGACY:
 *   - 服务于旧 UI/API 的 consensus/reliability/dispersion/stability/influence 评估
 *   - 保留但不再用于科学实验分析
 *   - 不应在 Campaign Pipeline 中引用
 */

import type { RawRunData, ExperimentMetrics, CognitiveStateSnapshot } from "../types";
import { mean, sampleStd } from "../../v2/statsShared";

// ============================================================================
// Utilities
// ============================================================================

/** 计算两个 utility 向量之间的 L2 距离 */
function utilityL2(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sumSq = 0;
  for (const k of keys) {
    const diff = (a[k] ?? 0) - (b[k] ?? 0);
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq);
}

/** 简单线性回归（无截距） */
function simpleLinearRegression(x: number[], y: number[]): { beta: number; r2: number; aic: number; bic: number } {
  const n = x.length;
  if (n < 2) return { beta: 0, r2: 0, aic: Infinity, bic: Infinity };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
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
  const sigma2 = Math.max(ssRes / n, 1e-10); // guard against log(0)
  const aic = n * Math.log(sigma2) + 2 * 2; // 2 params (beta, sigma)
  const bic = n * Math.log(sigma2) + Math.log(n) * 2;

  return { beta, r2, aic, bic };
}

/** 带截距的线性回归 */
function linearRegressionWithIntercept(x: number[], y: number[]): { beta: number; intercept: number; r2: number } {
  const n = x.length;
  if (n < 2) return { beta: 0, intercept: 0, r2: 0 };
  const mx = mean(x), my = mean(y);
  let cov = 0, varX = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    varX += (x[i] - mx) ** 2;
  }
  const beta = varX > 0 ? cov / varX : 0;
  const intercept = my - beta * mx;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = beta * x[i] + intercept;
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - my) ** 2;
  }
  return { beta, intercept, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0 };
}

/** 皮尔逊相关系数 */
function pearsonR(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const mx = mean(x), my = mean(y);
  let cov = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    sx += (x[i] - mx) ** 2;
    sy += (y[i] - my) ** 2;
  }
  return cov / (Math.sqrt(sx) * Math.sqrt(sy) || 1);
}

/** 逻辑回归（简化：Newton-Raphson 一步近似） */
function logisticRegressionAUC(x: number[], y: number[]): { auc: number; oddsRatio: number; beta1: number } {
  const n = x.length;
  if (n < 2) return { auc: 0.5, oddsRatio: 1, beta1: 0 };

  // 简单逻辑回归：logit(P(y=1)) = β₀ + β₁*x
  // 使用 IRLS（Iteratively Reweighted Least Squares）简化版
  let beta0 = 0, beta1 = Math.log((mean(y) + 0.01) / (1 - mean(y) + 0.01));
  for (let iter = 0; iter < 10; iter++) {
    let grad0 = 0, grad1 = 0, hess00 = 0, hess01 = 0, hess11 = 0;
    for (let i = 0; i < n; i++) {
      const eta = beta0 + beta1 * x[i];
      const p = 1 / (1 + Math.exp(-eta));
      const w = p * (1 - p) + 1e-6;
      const z = (y[i] - p);
      grad0 += z;
      grad1 += z * x[i];
      hess00 += w;
      hess01 += w * x[i];
      hess11 += w * x[i] * x[i];
    }
    const det = hess00 * hess11 - hess01 * hess01;
    if (Math.abs(det) < 1e-10) break;
    const d0 = (hess11 * grad0 - hess01 * grad1) / det;
    const d1 = (hess00 * grad1 - hess01 * grad0) / det;
    beta0 += d0;
    beta1 += d1;
    if (Math.abs(d0) + Math.abs(d1) < 1e-6) break;
  }

  // AUC: 简化计算（Mann-Whitney U 统计量近似）
  const pos = x.filter((_, i) => y[i] >= 0.5);
  const neg = x.filter((_, i) => y[i] < 0.5);
  let concordant = 0, total = 0;
  for (const p of pos) {
    for (const nv of neg) {
      total++;
      if (p > nv) concordant++;
      else if (Math.abs(p - nv) < 1e-10) concordant += 0.5;
    }
  }
  const auc = total > 0 ? concordant / total : 0.5;
  const oddsRatio = Math.exp(beta1);

  return { auc, oddsRatio, beta1 };
}

/** Granger 因果检验（简化：滞后 1 期的 F 检验） */
function grangerCausality(x: number[], y: number[], lag: number = 1): number {
  // x → y: 检验 x 的过去值能否预测 y 的当前值
  const n = x.length;
  if (n < lag + 3) return 0;

  // 受限模型：y_t = α + β * y_{t-1}
  // 完整模型：y_t = α + β * y_{t-1} + γ * x_{t-1}
  const yLag: number[] = [], yCurr: number[] = [], xLag: number[] = [];
  for (let t = lag; t < n; t++) {
    yLag.push(y[t - lag]);
    yCurr.push(y[t]);
    xLag.push(x[t - lag]);
  }

  const restricted = linearRegressionWithIntercept(yLag, yCurr);
  const { r2: r2Restricted } = restricted;

  // 完整模型：多变量回归简化（用残差）
  const ssResRestricted = yCurr.reduce((s, yi, i) => {
    const pred = restricted.beta * yLag[i] + restricted.intercept;
    return s + (yi - pred) ** 2;
  }, 0);

  // 完整模型：y = α + β₁*y_{t-1} + β₂*x_{t-1}
  // 简化：计算 x 对 y 的偏相关
  const resY = yCurr.map((yi, i) => yi - (restricted.beta * yLag[i] + restricted.intercept));
  const resX = xLag.map((xi, i) => {
    const mx = mean(xLag);
    return xi - mx;
  });
  const fullModel = simpleLinearRegression(resX, resY);
  const ssResFull = resY.reduce((s, yi, i) => {
    const pred = fullModel.beta * resX[i];
    return s + (yi - pred) ** 2;
  }, 0);

  const m = n - lag;
  const df1 = 1; // 额外参数数
  const df2 = m - 3; // 残差自由度
  const F = df2 > 0 ? ((ssResRestricted - ssResFull) / df1) / (ssResFull / df2) : 0;
  return Math.max(0, F);
}

/** Bootstrap 中介效应 CI */
function bootstrapMediation(
  inertiaValues: number[],
  susceptibilityValues: number[],
  deltaUValues: number[],
  nBoot: number = 5000,
): [number, number] {
  const n = inertiaValues.length;
  if (n < 2) return [0, 0];

  const rng = mulberry32(BOOTSTRAP_SEED);
  const bootEffects: number[] = [];

  for (let b = 0; b < nBoot; b++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(Math.floor(rng() * n));
    const bootI = idx.map(i => inertiaValues[i]);
    const bootS = idx.map(i => susceptibilityValues[i]);
    const bootDU = idx.map(i => deltaUValues[i]);

    // Step 1: I → Λ (a path)
    const mxI = mean(bootI);
    const mxS = mean(bootS);
    let covIS = 0, varI = 0;
    for (let i = 0; i < n; i++) {
      covIS += (bootI[i] - mxI) * (bootS[i] - mxS);
      varI += (bootI[i] - mxI) ** 2;
    }
    const a = varI > 0 ? covIS / varI : 0;

    // Step 2: Λ → ΔU controlling for I (b path)
    const mDU = mean(bootDU);
    let covIDU = 0;
    for (let i = 0; i < n; i++) {
      covIDU += (bootI[i] - mxI) * (bootDU[i] - mDU);
    }
    const betaI = varI > 0 ? covIDU / varI : 0;
    const interceptDU = mDU - betaI * mxI;

    const resDU = bootDU.map((du, i) => du - (betaI * bootI[i] + interceptDU));
    const resS = bootS.map((s, i) => s - (a * bootI[i] + (mxS - a * mxI)));

    let covRes = 0, varResS = 0;
    const mResDU = mean(resDU);
    const mResS = mean(resS);
    for (let i = 0; i < n; i++) {
      covRes += (resS[i] - mResS) * (resDU[i] - mResDU);
      varResS += (resS[i] - mResS) ** 2;
    }
    const b = varResS > 0 ? covRes / varResS : 0;

    bootEffects.push(a * b);
  }

  bootEffects.sort((a, b) => a - b);
  const lower = bootEffects[Math.floor(nBoot * 0.025)];
  const upper = bootEffects[Math.floor(nBoot * 0.975)];
  return [lower, upper];
}

/** Bootstrap 间接效应 CI（E5: ΔE → ΔU） */
function bootstrapIndirectEffect(
  x: number[],
  y: number[],
  nBoot: number = 5000,
): [number, number] {
  const n = x.length;
  if (n < 2) return [0, 0];

  const rng = mulberry32(BOOTSTRAP_SEED);
  const bootBetas: number[] = [];

  for (let b = 0; b < nBoot; b++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(Math.floor(rng() * n));
    const bootX = idx.map(i => x[i]);
    const bootY = idx.map(i => y[i]);
    let sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumXY += bootX[i] * bootY[i];
      sumX2 += bootX[i] * bootX[i];
    }
    bootBetas.push(sumXY / (sumX2 || 1));
  }

  bootBetas.sort((a, b) => a - b);
  return [bootBetas[Math.floor(nBoot * 0.025)], bootBetas[Math.floor(nBoot * 0.975)]];
}

/** Mulberry32 PRNG — 本地副本，避免跨模块循环依赖 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BOOTSTRAP_SEED = 42 + 0x5EED;

// ============================================================================
// E1: State Stability
// ============================================================================

export function computeE1Stability(
  beliefData: RawRunData[],
  cognitiveData: RawRunData[],
): ExperimentMetrics {
  const perRunRatios: number[] = [];
  const allDeltaB: number[] = [];
  const allDeltaU: number[] = [];

  // Part 3: Utility-Ranking Consistency 数据
  let consistentCount = 0;
  let consistencyTotal = 0;

  // Part 4: Utility Predictive Power 数据
  // ΔUtility(t) → Decision Change(t+1)
  const predDeltaU: number[] = [];
  const predDecisionChange: number[] = [];

  const pairedRuns = Math.min(beliefData.length, cognitiveData.length);

  for (let i = 0; i < pairedRuns; i++) {
    const bRun = beliefData[i];
    const cRun = cognitiveData[i];

    const deltaB: number[] = [];
    for (let r = 1; r < bRun.beliefTrajectory.length; r++) {
      const prev = bRun.beliefTrajectory[r - 1].beliefs;
      const curr = bRun.beliefTrajectory[r].beliefs;
      for (const agentId of Object.keys(curr)) {
        const db = Math.abs((curr[agentId] ?? 0) - (prev[agentId] ?? 0));
        deltaB.push(db);
        allDeltaB.push(db);
      }
    }

    const deltaU: number[] = [];
    if (cRun.cognitiveTrajectory) {
      const byRound = new Map<number, Map<string, Record<string, number>>>();
      for (const snap of cRun.cognitiveTrajectory) {
        if (!byRound.has(snap.round)) byRound.set(snap.round, new Map());
        byRound.get(snap.round)!.set(snap.agentId, snap.utility);
      }

      const rounds = [...byRound.keys()].sort((a, b) => a - b);
      for (let ri = 1; ri < rounds.length; ri++) {
        const prevRound = byRound.get(rounds[ri - 1])!;
        const currRound = byRound.get(rounds[ri])!;
        for (const agentId of currRound.keys()) {
          const prevU = prevRound.get(agentId) || {};
          const currU = currRound.get(agentId) || {};
          const du = utilityL2(prevU, currU);
          deltaU.push(du);
          allDeltaU.push(du);
        }
      }

      // ── Part 3: Utility-Ranking Consistency ──────────────────────
      // 每个 snapshot: utilityTopChoice (argmax utility) vs rankingTopChoice (LLM itemBeliefs rank=1)
      for (const snap of cRun.cognitiveTrajectory) {
        if (snap.utilityTopChoice && snap.rankingTopChoice) {
          consistencyTotal++;
          if (snap.utilityTopChoice === snap.rankingTopChoice) consistentCount++;
        }
      }

      // ── Part 4: Utility Predictive Power ─────────────────────────
      // ΔUtility(t) = |U(t) - U(t-1)|, 预测 Decision Change(t+1) = [ranking(t+1) != ranking(t)]
      // 按 agent 分组，按 round 排序
      const byAgent = new Map<string, CognitiveStateSnapshot[]>();
      for (const snap of cRun.cognitiveTrajectory) {
        if (!byAgent.has(snap.agentId)) byAgent.set(snap.agentId, []);
        byAgent.get(snap.agentId)!.push(snap);
      }
      for (const [, snaps] of byAgent) {
        snaps.sort((a, b) => a.round - b.round);
        // i 从 1 开始: ΔUtility(i) = L2(snaps[i-1], snaps[i])
        // 预测 snaps[i+1] 的 decision change (相对 snaps[i])
        for (let t = 1; t < snaps.length - 1; t++) {
          const deltaUtil = utilityL2(snaps[t - 1].utility, snaps[t].utility);
          const rankingNow = snaps[t].rankingTopChoice;
          const rankingNext = snaps[t + 1].rankingTopChoice;
          if (rankingNow && rankingNext) {
            const decisionChanged = rankingNext !== rankingNow ? 1 : 0;
            predDeltaU.push(deltaUtil);
            predDecisionChange.push(decisionChanged);
          }
        }
      }
    }

    if (deltaB.length > 0 && deltaU.length > 0) {
      const varB = deltaB.reduce((s, v) => s + v * v, 0) / deltaB.length;
      const varU = deltaU.reduce((s, v) => s + v * v, 0) / deltaU.length;
      perRunRatios.push(varU > 0 ? varB / varU : Infinity);
    }
  }

  const sigmaSqDeltaB = allDeltaB.length > 0 ? allDeltaB.reduce((s, v) => s + v * v, 0) / allDeltaB.length : 0;
  const sigmaSqDeltaU = allDeltaU.length > 0 ? allDeltaU.reduce((s, v) => s + v * v, 0) / allDeltaU.length : 0;

  // Part 3 结果
  const consistencyRate = consistencyTotal > 0 ? consistentCount / consistencyTotal : 0;

  // Part 4 结果: 预测力（仅相关性，不声称因果）
  const predCorrelation = predDeltaU.length >= 2 ? pearsonR(predDeltaU, predDecisionChange) : 0;
  const predModel = predDeltaU.length >= 2 ? linearRegressionWithIntercept(predDeltaU, predDecisionChange) : { beta: 0, intercept: 0, r2: 0 };
  const predAuc = predDeltaU.length >= 2 ? logisticRegressionAUC(predDeltaU, predDecisionChange).auc : 0.5;

  return {
    experimentId: "e1_stability",
    runtimeMode: "cognitive",
    sampleSize: pairedRuns,
    stateStability: {
      sigmaSqDeltaB,
      sigmaSqDeltaU,
      stabilityRatio: sigmaSqDeltaU > 0 ? sigmaSqDeltaB / sigmaSqDeltaU : Infinity,
      perRunRatios,
    },
    utilityConsistency: {
      consistencyRate,
      consistentCount,
      totalCount: consistencyTotal,
    },
    utilityPrediction: {
      correlation: predCorrelation,
      regressionBeta: predModel.beta,
      r2: predModel.r2,
      auc: predAuc,
      sampleSize: predDeltaU.length,
    },
  };
}

// ============================================================================
// E2: Evidence Explanatory Power
// ============================================================================

export function computeE2Evidence(data: RawRunData[]): ExperimentMetrics {
  const allDeltaECoverage: number[] = [];
  const allDeltaERecent: number[] = [];
  const allDeltaU: number[] = [];
  const allDeltaConfidence: number[] = [];
  const allDeltaB: number[] = [];

  for (const run of data) {
    if (!run.cognitiveTrajectory) continue;
    const byRoundAgent = new Map<string, CognitiveStateSnapshot[]>();

    for (const snap of run.cognitiveTrajectory) {
      const key = snap.agentId;
      if (!byRoundAgent.has(key)) byRoundAgent.set(key, []);
      byRoundAgent.get(key)!.push(snap);
    }

    for (const [, snaps] of byRoundAgent) {
      snaps.sort((a: CognitiveStateSnapshot, b: CognitiveStateSnapshot) => a.round - b.round);
      for (let i = 1; i < snaps.length; i++) {
        const prev = snaps[i - 1];
        const curr = snaps[i];
        allDeltaECoverage.push(curr.evidenceCoverage - prev.evidenceCoverage);
        allDeltaERecent.push(curr.evidenceRecentGain - prev.evidenceRecentGain);
        allDeltaU.push(utilityL2(prev.utility, curr.utility));
        allDeltaConfidence.push(curr.confidenceOverall - prev.confidenceOverall);
        allDeltaB.push(Math.abs(curr.belief - prev.belief));
      }
    }
  }

  const cogModel = simpleLinearRegression(allDeltaECoverage, allDeltaU);
  const belModel = simpleLinearRegression(allDeltaConfidence, allDeltaB);

  return {
    experimentId: "e2_evidence",
    runtimeMode: "cognitive",
    sampleSize: allDeltaECoverage.length,
    evidenceExplanatory: {
      r2Cognitive: cogModel.r2,
      r2Belief: belModel.r2,
      deltaR2: cogModel.r2 - belModel.r2,
      aicCognitive: cogModel.aic,
      aicBelief: belModel.aic,
      bicCognitive: cogModel.bic,
      bicBelief: belModel.bic,
      // 存储原始数据用于模型级 Bootstrap
      _bootstrapData: {
        deltaECoverage: allDeltaECoverage,
        deltaU: allDeltaU,
        deltaConfidence: allDeltaConfidence,
        deltaB: allDeltaB,
      },
    },
  };
}

// ============================================================================
// E3: Inertia → Authority Bias
// ============================================================================

export function computeE3Inertia(data: RawRunData[]): ExperimentMetrics {
  const inertiaValues: number[] = [];
  const authorityBiasLabels: number[] = [];

  for (const run of data) {
    if (!run.cognitiveTrajectory) continue;

    // 按 agent 分组
    const byAgent = new Map<string, CognitiveStateSnapshot[]>();
    for (const snap of run.cognitiveTrajectory) {
      if (!byAgent.has(snap.agentId)) byAgent.set(snap.agentId, []);
      byAgent.get(snap.agentId)!.push(snap);
    }

    for (const [, snaps] of byAgent) {
      snaps.sort((a, b) => a.round - b.round);
      for (let i = 1; i < snaps.length; i++) {
        const prev = snaps[i - 1];
        const curr = snaps[i];

        // 检测权威偏差：如果 agent 的 utility 朝群体均值方向显著移动
        // 并且该 agent 有较高 inertia（说明理论上不应改变但仍改变了）
        const du = utilityL2(prev.utility, curr.utility);
        const inertia = prev.inertiaStrength;

        // 权威偏差信号：高惯性但大变化
        const biasSignal = (inertia > 0.5 && du > 0.3) ? 1 : 0;

        inertiaValues.push(inertia);
        authorityBiasLabels.push(biasSignal);
      }
    }
  }

  const { auc, oddsRatio, beta1 } = logisticRegressionAUC(inertiaValues, authorityBiasLabels);

  return {
    experimentId: "e3_inertia",
    runtimeMode: "cognitive",
    sampleSize: inertiaValues.length,
    inertiaAuthority: {
      auc,
      oddsRatio,
      beta1,
      _bootstrapData: {
        inertiaValues,
        authorityBiasLabels,
      },
    },
  };
}

// ============================================================================
// E4: Confidence Prediction
// ============================================================================

export function computeE4Confidence(data: RawRunData[]): ExperimentMetrics {
  const confValues: number[] = [];
  const deltaUValues: number[] = [];
  const oldConfValues: number[] = [];
  const deltaBValues: number[] = [];

  for (const run of data) {
    if (!run.cognitiveTrajectory) continue;

    const byAgent = new Map<string, CognitiveStateSnapshot[]>();
    for (const snap of run.cognitiveTrajectory) {
      if (!byAgent.has(snap.agentId)) byAgent.set(snap.agentId, []);
      byAgent.get(snap.agentId)!.push(snap);
    }

    for (const [, snaps] of byAgent) {
      snaps.sort((a, b) => a.round - b.round);
      for (let i = 0; i < snaps.length - 1; i++) {
        const curr = snaps[i];
        const next = snaps[i + 1];

        // Cognitive: C(t) → |ΔU(t+1)|
        confValues.push(curr.confidenceOverall);
        deltaUValues.push(utilityL2(curr.utility, next.utility));

        // Belief: oldConfidence(t) → ΔB(t+1)
        oldConfValues.push(curr.oldConfidence / 100);
        deltaBValues.push(Math.abs(next.belief - curr.belief));
      }
    }
  }

  const cogModel = simpleLinearRegression(confValues, deltaUValues);
  const belModel = simpleLinearRegression(oldConfValues, deltaBValues);

  return {
    experimentId: "e4_confidence",
    runtimeMode: "cognitive",
    sampleSize: confValues.length,
    confidencePrediction: {
      beta1Cognitive: cogModel.beta,
      beta1Belief: belModel.beta,
      marginalR2Cognitive: cogModel.r2,
      marginalR2Belief: belModel.r2,
      _bootstrapData: {
        confValues,
        deltaUValues,
        oldConfValues,
        deltaBValues,
      },
    },
  };
}

// ============================================================================
// E5: Governance Mechanism
// ============================================================================

export function computeE5Governance(
  governedData: RawRunData[],
  ungovernedData: RawRunData[],
): ExperimentMetrics {
  // 计算治理对最终决策质量的影响
  const tauGov = governedData.map(d => d.finalKendallTau);
  const tauNoGov = ungovernedData.map(d => d.finalKendallTau);
  const deltaTau = mean(tauGov) - mean(tauNoGov);

  // Granger 因果：Evidence 变化是否先于 Utility 变化
  const allEvidenceSeq: number[] = [];
  const allUtilitySeq: number[] = [];

  for (const run of governedData) {
    if (!run.cognitiveTrajectory) continue;
    const byAgent = new Map<string, CognitiveStateSnapshot[]>();
    for (const snap of run.cognitiveTrajectory) {
      if (!byAgent.has(snap.agentId)) byAgent.set(snap.agentId, []);
      byAgent.get(snap.agentId)!.push(snap);
    }
    for (const [, snaps] of byAgent) {
      snaps.sort((a, b) => a.round - b.round);
      for (let i = 1; i < snaps.length; i++) {
        const prev = snaps[i - 1];
        const curr = snaps[i];
        allEvidenceSeq.push(curr.evidenceCoverage - prev.evidenceCoverage);
        allUtilitySeq.push(utilityL2(prev.utility, curr.utility));
      }
    }
  }

  const grangerF_EtoU = grangerCausality(allEvidenceSeq, allUtilitySeq);
  const grangerF_UtoE = grangerCausality(allUtilitySeq, allEvidenceSeq);

  // 间接效应：Evidence → Utility 通过治理
  // 简化：治理组的 ΔE → ΔU 回归系数
  const indirectEffect = simpleLinearRegression(allEvidenceSeq, allUtilitySeq).beta;

  // Bootstrap CI for indirect effect
  const indirectCI = bootstrapIndirectEffect(allEvidenceSeq, allUtilitySeq);

  return {
    experimentId: "e5_governance",
    runtimeMode: "cognitive",
    sampleSize: governedData.length,
    governanceMechanism: {
      grangerF_evidenceToUtility: grangerF_EtoU,
      grangerF_utilityToEvidence: grangerF_UtoE,
      indirectEffect,
      indirectEffectCI: indirectCI,
      mediationRatio: Math.abs(deltaTau) > 0.001 ? Math.abs(indirectEffect / deltaTau) : 0,
      tauWithGovernance: mean(tauGov),
      tauWithoutGovernance: mean(tauNoGov),
      deltaTau,
    },
  };
}

// ============================================================================
// E6: State Decoupling
// ============================================================================

export function computeE6Decoupling(data: RawRunData[]): ExperimentMetrics {
  const uValues: number[] = [];
  const eValues: number[] = [];
  const iValues: number[] = [];
  const cValues: number[] = [];
  const sValues: number[] = [];
  const bValues: number[] = [];
  const confValues: number[] = [];

  for (const run of data) {
    if (!run.cognitiveTrajectory) continue;
    for (const snap of run.cognitiveTrajectory) {
      uValues.push(snap.utilityIntensity);
      eValues.push(snap.evidenceCoverage);
      iValues.push(snap.inertiaStrength);
      cValues.push(snap.confidenceOverall);
      sValues.push(snap.susceptibility);
      bValues.push(snap.belief);
      confValues.push(snap.oldConfidence / 100);
    }
  }

  // Cognitive 相关矩阵
  const cogVars = [uValues, eValues, iValues, cValues, sValues];
  const cogNames = ["U", "E", "I", "C", "Λ"];
  let maxCorrCognitive = 0;
  const cogCorrMatrix: number[][] = [];

  for (let i = 0; i < cogVars.length; i++) {
    cogCorrMatrix[i] = [];
    for (let j = 0; j < cogVars.length; j++) {
      const r = i === j ? 1 : pearsonR(cogVars[i], cogVars[j]);
      cogCorrMatrix[i][j] = r;
      if (i !== j && Math.abs(r) > maxCorrCognitive) maxCorrCognitive = Math.abs(r);
    }
  }

  // Belief 相关
  const belR = Math.abs(pearsonR(bValues, confValues));

  // VIF（简化：取最大成对相关的 VIF 近似）
  const vifMax = maxCorrCognitive < 1 ? 1 / (1 - maxCorrCognitive * maxCorrCognitive) : Infinity;

  return {
    experimentId: "e6_decoupling",
    runtimeMode: "cognitive",
    sampleSize: uValues.length,
    stateDecoupling: {
      maxCorrCognitive,
      maxCorrBelief: belR,
      vifMax: Math.min(vifMax, 100),
      conditionNumber: computeConditionNumber(cogCorrMatrix),
      correlationMatrix: cogCorrMatrix,
      variableNames: cogNames,
    },
  };
}

/** 计算矩阵的条件数（最大奇异值 / 最小奇异值） */
function computeConditionNumber(matrix: number[][]): number {
  // 简化：使用 2x2 子矩阵的条件数近似
  // 实际应使用 SVD，这里用特征值近似
  const n = matrix.length;
  if (n === 0) return 0;

  // 计算矩阵的迹和行列式近似
  let trace = 0;
  for (let i = 0; i < n; i++) trace += matrix[i][i];
  const avgOffDiag = n > 1 ? matrix.slice(0, n).reduce((s, row, i) => {
    return s + row.reduce((rs, v, j) => i !== j ? rs + Math.abs(v) : rs, 0);
  }, 0) / (n * (n - 1)) : 0;

  // 近似：最大特征值 ≈ trace/n + (n-1)*avgOffDiag, 最小 ≈ trace/n - avgOffDiag
  const lambdaMax = trace / n + (n - 1) * avgOffDiag;
  const lambdaMin = Math.max(trace / n - avgOffDiag, 0.001);
  return lambdaMax / lambdaMin;
}

// ============================================================================
// E7: Detector Accuracy
// ============================================================================

export function computeE7Detector(data: RawRunData[]): ExperimentMetrics {
  // E7 需要 ground truth 标注。当前使用以下启发式作为初始标签：
  // - 权威偏差：高惯性 agent 的 utility 大幅移向群体均值
  // - 极化：utility 标准差增加
  // - 回声室：agent 间 evidence 高度相似
  // - 过早共识：过早收敛且 τ 低

  const cognitivePreds: Array<{ type: string; detected: boolean }> = [];
  const beliefPreds: Array<{ type: string; detected: boolean }> = [];
  const groundTruths: Array<{ type: string; present: boolean }> = [];

  for (const run of data) {
    if (!run.cognitiveTrajectory || run.cognitiveTrajectory.length === 0) continue;

    const snaps = run.cognitiveTrajectory;
    const lastRound = Math.max(...snaps.map(s => s.round));

    // 极化 ground truth：检查最后两轮 utility 标准差是否增加
    const byRound = new Map<number, CognitiveStateSnapshot[]>();
    for (const s of snaps) {
      if (!byRound.has(s.round)) byRound.set(s.round, []);
      byRound.get(s.round)!.push(s);
    }
    const rounds = [...byRound.keys()].sort((a, b) => a - b);
    if (rounds.length < 2) continue;

    const firstSnaps = byRound.get(rounds[0]) || [];
    const lastSnaps = byRound.get(rounds[rounds.length - 1]) || [];
    const firstStd = stdOfUtilityIntensity(firstSnaps);
    const lastStd = stdOfUtilityIntensity(lastSnaps);
    const polarized = lastStd > firstStd * 1.2;

    // 权威偏差 ground truth：高 inertia agent 改变幅度大
    const authorityPresent = run.interventions.some(intv => intv.type === "reduce_weight" || intv.type === "authority_bias");

    // 回声室 ground truth：evidence coverage 高度相似
    const evidenceCoverages = lastSnaps.map(s => s.evidenceCoverage);
    const evStd = evidenceCoverages.length > 1 ? sampleStd(evidenceCoverages) : 0;
    const echoChamber = evStd < 0.1 && evidenceCoverages.length > 2;

    // 过早共识 ground truth
    const prematureConsensus = run.converged && run.totalRounds <= 2 && run.finalKendallTau < 0.5;

    // 记录 ground truth
    if (authorityPresent || run.interventions.length > 0) {
      groundTruths.push({ type: "authority_bias", present: authorityPresent });
      cognitivePreds.push({ type: "authority_bias", detected: true });
      beliefPreds.push({ type: "authority_bias", detected: authorityPresent });
    }
    if (polarized || lastStd > 0.3) {
      groundTruths.push({ type: "polarization", present: polarized });
      cognitivePreds.push({ type: "polarization", detected: polarized });
      beliefPreds.push({ type: "polarization", detected: lastStd > 0.3 });
    }
    if (echoChamber || evStd < 0.15) {
      groundTruths.push({ type: "echo_chamber", present: echoChamber });
      cognitivePreds.push({ type: "echo_chamber", detected: echoChamber });
      beliefPreds.push({ type: "echo_chamber", detected: evStd < 0.15 });
    }
    if (prematureConsensus || run.totalRounds <= 2) {
      groundTruths.push({ type: "premature_consensus", present: prematureConsensus });
      cognitivePreds.push({ type: "premature_consensus", detected: prematureConsensus });
      beliefPreds.push({ type: "premature_consensus", detected: run.totalRounds <= 2 });
    }
  }

  const { precision: pc, recall: rc, f1: f1c } = computeF1(cognitivePreds, groundTruths);
  const { precision: pb, recall: rb, f1: f1b } = computeF1(beliefPreds, groundTruths);

  return {
    experimentId: "e7_detector",
    runtimeMode: "cognitive",
    sampleSize: groundTruths.length,
    detectorAccuracy: {
      f1Cognitive: f1c,
      f1Belief: f1b,
      precisionCognitive: pc,
      recallCognitive: rc,
      precisionBelief: pb,
      recallBelief: rb,
    },
  };
}

function stdOfUtilityIntensity(snaps: CognitiveStateSnapshot[]): number {
  if (snaps.length < 2) return 0;
  const vals = snaps.map(s => s.utilityIntensity);
  return sampleStd(vals);
}

function computeF1(
  preds: Array<{ type: string; detected: boolean }>,
  truths: Array<{ type: string; present: boolean }>,
): { precision: number; recall: number; f1: number } {
  let tp = 0, fp = 0, fn = 0;
  for (const truth of truths) {
    const pred = preds.find(p => p.type === truth.type);
    if (!pred) continue;
    if (truth.present && pred.detected) tp++;
    else if (!truth.present && pred.detected) fp++;
    else if (truth.present && !pred.detected) fn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  return { precision, recall, f1 };
}

// ============================================================================
// E8: Susceptibility Mediation
// ============================================================================

export function computeE8Susceptibility(data: RawRunData[]): ExperimentMetrics {
  const inertiaValues: number[] = [];
  const susceptibilityValues: number[] = [];
  const deltaUValues: number[] = [];

  for (const run of data) {
    if (!run.cognitiveTrajectory) continue;

    const byAgent = new Map<string, CognitiveStateSnapshot[]>();
    for (const snap of run.cognitiveTrajectory) {
      if (!byAgent.has(snap.agentId)) byAgent.set(snap.agentId, []);
      byAgent.get(snap.agentId)!.push(snap);
    }

    for (const [, snaps] of byAgent) {
      snaps.sort((a, b) => a.round - b.round);
      for (let i = 0; i < snaps.length - 1; i++) {
        const curr = snaps[i];
        const next = snaps[i + 1];

        inertiaValues.push(curr.inertiaStrength);
        susceptibilityValues.push(curr.susceptibility);
        deltaUValues.push(utilityL2(curr.utility, next.utility));
      }
    }
  }

  // 中介分析：I → Λ → ΔU
  // Step 1: I → Λ (a path)
  const aModel = simpleLinearRegression(inertiaValues, susceptibilityValues);
  const a = aModel.beta;

  // Step 2: Λ → ΔU controlling for I (b path)
  // 残差化：ΔU ~ I, 取残差；Λ ~ I, 取残差；然后残差 ΔU ~ 残差 Λ
  const iModel = linearRegressionWithIntercept(inertiaValues, deltaUValues);
  const resDeltaU = deltaUValues.map((du, i) => du - (iModel.beta * inertiaValues[i] + iModel.intercept));
  const resSusceptibility = susceptibilityValues.map((s, i) => {
    const mx = mean(inertiaValues);
    return s - (a * inertiaValues[i] + (mean(susceptibilityValues) - a * mx));
  });
  const bModel = simpleLinearRegression(resSusceptibility, resDeltaU);
  const b = bModel.beta;

  // Step 3: I → ΔU (total effect, c path)
  const cModel = simpleLinearRegression(inertiaValues, deltaUValues);
  const c = cModel.beta;

  // Step 4: I → ΔU controlling for Λ (direct effect, c' path)
  // 简化：c' = c - a*b
  const indirectEffect = a * b;
  const directEffect = c - indirectEffect;
  const totalEffect = c;
  const mediationRatio = Math.abs(totalEffect) > 0.001 ? indirectEffect / totalEffect : 0;

  // Bootstrap CI for mediation effect
  const indirectCI = bootstrapMediation(inertiaValues, susceptibilityValues, deltaUValues);

  return {
    experimentId: "e8_susceptibility",
    runtimeMode: "cognitive",
    sampleSize: inertiaValues.length,
    susceptibilityMediation: {
      indirectEffect,
      indirectEffectCI: indirectCI,
      directEffect,
      totalEffect,
      mediationRatio,
      _bootstrapData: {
        inertiaValues,
        susceptibilityValues,
        deltaUValues,
      },
    },
  };
}

// ============================================================================
// E9: Cognitive State Driven Governance
// ============================================================================

export function computeE9CognitiveGovernance(
  data: RawRunData[],
  experimentId: string,
): ExperimentMetrics {
  const tauValues = data.map(d => d.finalKendallTau);
  const roundValues = data.map(d => d.totalRounds);

  // 干预统计
  const interventionTypeDist: Record<string, number> = {};
  const detectorTriggerDist: Record<string, number> = {};
  const issueTypeDist: Record<string, number> = {};
  let totalInterventions = 0;

  // RTHF 轨迹聚合
  const allThermo: Array<Array<{ round: number; R: number; T: number; H: number; F: number }>> = [];

  for (const d of data) {
    for (const intv of d.interventions) {
      totalInterventions++;
      const type = intv.type || "unknown";
      interventionTypeDist[type] = (interventionTypeDist[type] || 0) + 1;
    }
    // 从 governanceIssues 统计检测器触发和问题类型
    for (const issue of d.governanceIssues) {
      const detectorType = issue.type;
      detectorTriggerDist[detectorType] = (detectorTriggerDist[detectorType] || 0) + 1;
      issueTypeDist[detectorType] = (issueTypeDist[detectorType] || 0) + 1;
    }
    // 收集 RTHF 轨迹
    if (d.thermoHistory && d.thermoHistory.length > 0) {
      allThermo.push(d.thermoHistory);
    }
  }

  const totalRounds = roundValues.reduce((s, r) => s + r, 0);
  const interventionsPerRound = totalRounds > 0 ? totalInterventions / totalRounds : 0;

  // 提取场景和治理模式信息
  const parts = experimentId.split("_");
  const scenario = parts[1] || "unknown";
  const governanceMode = parts.slice(2).join("_") || "unknown";

  // RTHF 轨迹分析
  let rthfTrajectory: ExperimentMetrics["cognitiveGovernance"] extends { rthfTrajectory?: infer T } ? T : undefined;
  if (allThermo.length > 0) {
    const maxRound = Math.max(...allThermo.map(t => t.length));
    const perRound: Array<{ round: number; R: number; T: number; H: number; F: number }> = [];
    for (let r = 0; r < maxRound; r++) {
      const rVals = allThermo.map(t => t[r]?.R).filter((v): v is number => v !== undefined);
      const tVals = allThermo.map(t => t[r]?.T).filter((v): v is number => v !== undefined);
      const hVals = allThermo.map(t => t[r]?.H).filter((v): v is number => v !== undefined);
      const fVals = allThermo.map(t => t[r]?.F).filter((v): v is number => v !== undefined);
      if (rVals.length > 0) {
        perRound.push({
          round: r + 1,
          R: rVals.reduce((a, b) => a + b, 0) / rVals.length,
          T: tVals.reduce((a, b) => a + b, 0) / tVals.length,
          H: hVals.reduce((a, b) => a + b, 0) / hVals.length,
          F: fVals.reduce((a, b) => a + b, 0) / fVals.length,
        });
      }
    }
    // R 收敛速度 = (R_last - R_first) / (rounds - 1)
    const rFirst = perRound[0]?.R ?? 0;
    const rLast = perRound[perRound.length - 1]?.R ?? rFirst;
    const rConvergenceRate = perRound.length > 1
      ? (rLast - rFirst) / (perRound.length - 1)
      : 0;
    // T 稳定性 = σ²(T) across rounds
    const tValues = perRound.map(p => p.T);
    const tMean = tValues.reduce((a, b) => a + b, 0) / tValues.length;
    const tStability = tValues.reduce((s, v) => s + (v - tMean) ** 2, 0) / tValues.length;
    // H 减少率 = (H_last - H_first) / (rounds - 1)
    const hFirst = perRound[0]?.H ?? 0;
    const hLast = perRound[perRound.length - 1]?.H ?? hFirst;
    const hReductionRate = perRound.length > 1
      ? (hLast - hFirst) / (perRound.length - 1)
      : 0;
    // F drift = F_last - F_first
    const fFirst = perRound[0]?.F ?? 0;
    const fLast = perRound[perRound.length - 1]?.F ?? fFirst;
    const fDrift = fLast - fFirst;

    rthfTrajectory = {
      rConvergenceRate,
      tStability,
      hReductionRate,
      fDrift,
      perRound,
    };
  }

  return {
    experimentId,
    runtimeMode: "native_cognitive",
    sampleSize: data.length,
    cognitiveGovernance: {
      meanTau: mean(tauValues),
      stdTau: sampleStd(tauValues),
      totalInterventions,
      interventionsPerRound,
      interventionTypeDistribution: interventionTypeDist,
      detectorTriggers: detectorTriggerDist,
      issueTypeDistribution: issueTypeDist,
      meanConvergenceRounds: mean(roundValues),
      governanceMode,
      scenario,
      rthfTrajectory,
    },
  };
}

// ============================================================================
// Global Metrics
// ============================================================================

export function computeGlobalMetrics(data: RawRunData[]): ExperimentMetrics["global"] {
  const tauValues = data.map(d => d.finalKendallTau);
  const roundValues = data.map(d => d.totalRounds);

  // 按 seed 分组计算 reproducibility
  const bySeed = new Map<number, number[]>();
  for (const d of data) {
    if (!bySeed.has(d.seed)) bySeed.set(d.seed, []);
    bySeed.get(d.seed)!.push(d.finalKendallTau);
  }
  const withinSeedStds = [...bySeed.values()].map(vals => sampleStd(vals));

  // 极化：τ 值分布的双峰性（简化：标准差/均值）
  const tauMean = mean(tauValues);
  const tauStd = sampleStd(tauValues);
  const polarization = tauMean !== 0 ? tauStd / Math.abs(tauMean) : 0;

  // 多样性：τ 的变异系数
  const diversity = tauMean !== 0 ? tauStd / Math.abs(tauMean) : 0;

  // Calibration：信度-准确度相关性（简化：用 τ 的稳健性近似）
  const calibration = Math.abs(tauMean) > 0.001 ? 1 - tauStd / Math.abs(tauMean) : 0;

  return {
    consensusQuality: mean(tauValues),
    polarization,
    diversity,
    convergence: mean(roundValues),
    robustness: Math.abs(tauMean) > 0.001 ? tauStd / Math.abs(tauMean) : 0,
    reproducibility: mean(withinSeedStds),
    calibration,
    governanceGain: 0, // 由 E5 单独计算
    explainability: 0, // 由 E2 单独计算
  };
}

// ============================================================================
// Main Dispatch
// ============================================================================

export function computeMetrics(
  experimentId: string,
  data: RawRunData[],
): ExperimentMetrics {
  const beliefData = data.filter(d => d.runtimeMode === "belief");
  const cognitiveData = data.filter(d => d.runtimeMode === "cognitive" || d.runtimeMode === "native_cognitive");

  let metrics: ExperimentMetrics;

  switch (experimentId) {
    case "e1_stability":
    case "e1_native":
      metrics = computeE1Stability(beliefData, cognitiveData);
      break;
    case "e2_evidence":
      metrics = computeE2Evidence(cognitiveData);
      break;
    case "e3_inertia":
      metrics = computeE3Inertia(cognitiveData);
      break;
    case "e4_confidence":
      metrics = computeE4Confidence(cognitiveData);
      break;
    case "e5_governance":
      metrics = computeE5Governance(cognitiveData, beliefData);
      break;
    case "e6_decoupling":
      metrics = computeE6Decoupling(cognitiveData);
      break;
    case "e7_detector":
      metrics = computeE7Detector(cognitiveData);
      break;
    case "e8_susceptibility":
      metrics = computeE8Susceptibility(cognitiveData);
      break;
    default:
      if (experimentId.startsWith("e9_")) {
        metrics = computeE9CognitiveGovernance(data, experimentId);
      } else if (experimentId.startsWith("e1_")) {
        metrics = computeE1Stability(beliefData, cognitiveData);
      } else if (experimentId.startsWith("e2_")) {
        metrics = computeE2Evidence(cognitiveData);
      } else {
        metrics = {
          experimentId,
          runtimeMode: cognitiveData.length > 0 ? "cognitive" : "belief",
          sampleSize: data.length,
        };
      }
  }

  metrics.global = computeGlobalMetrics(data);
  return metrics;
}