/**
 * ε-Observation Model Analysis —— 在 38 个 enriched fraud-series 文件上
 * 拟合观测模型 b = α·U + ε，并检验 ε 是否能检测恶意 agent。
 *
 * 理论：
 *   b  = LLM scalar belief (roundResults[].opinions[].belief)
 *   U  = Utility computed from itemBeliefs (signed strongest item)
 *   α  = fitted projection coefficient (least squares through origin)
 *   ε  = residual = b - α·U
 *
 * U 计算：
 *   u = (item1.belief, ..., item5.belief)  (5 items per agent)
 *   U_signed_max = u_i with max |u_i|  (preserves direction; used for observation model)
 *   U_max        = max(|u_i|)            (unsigned; already tested r=0.754 with |b|)
 *   U_norm       = ||u||_2 / sqrt(5)     (unsigned; normalized to [0,1] range)
 *
 * 假设：
 *   H2-ε : 恶意 agent 的 ε 显著高于诚实 agent（可检测性）
 *   H1-ε : mean ε 与 kendallTau 相关（ε 预测干预有效性），分干预/非干预子集
 *   部分相关：r(ε, malicious) controlling for |b|（ε 是否提供 |b| 之外的信息）
 *   ε vs δ 直接对比（δ = ||b| - ι_role|，使用 ι_role 而非 ι_approx）
 *
 * 运行：npx tsx experiments/v2/analyze_epsilon_observation_model.ts
 */

import * as fs from "fs";
import * as path from "path";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";
import { mean, sampleStd, cohensD, mulberry32, PERMUTATION_SEED } from "./statsShared";

// ============================================================================
// Fraud 任务角色表（源自 experiments/v2/task_fraud.ts）
// ============================================================================

const FRAUD_AGENT_ROLES: Record<string, string> = {
  a1: "审计师",
  a2: "供应链分析师",
  a3: "法务顾问",
  a4: "媒体分析师",
  a5: "行业专家",
};

// ι_role —— 任务给定（与 getRoleInertia 输出一致，但直接硬编码避免依赖）
const IOTA_ROLE: Record<string, number> = {
  a1: 0.4,
  a2: 0.5,
  a3: 0.4,
  a4: 0.5,
  a5: 0.6,
};

// ============================================================================
// 类型
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
  runId?: string;
  group?: string;
  runIndex?: number;
  kendallTau: number;
  decisionQuality?: number;
  maliciousAgentIds?: string[];
  governanceEnabled?: boolean;
  roundResults?: RoundResult[];
}

/** 一次 (run, round, agent) 观测 */
interface EpsSample {
  runId: string;
  group: string;
  round: number;
  agentId: string;
  role: string;
  b: number;            // scalar belief
  absB: number;         // |b|
  uSignedMax: number;   // U_signed_max (signed strongest item)
  uMax: number;         // max(|u_i|)  (unsigned)
  uNorm: number;        // ||u||_2 / sqrt(5)  (unsigned, [0,1])
  iotaRole: number;
  delta: number;        // old δ = ||b| - ι_role|
  isMalicious: boolean;
  isIntervention: boolean; // governanceEnabled === true
  kendallTau: number;
  eps: number;          // residual = b - α·U_signed_max (filled after fitting α)
}

// ============================================================================
// 数据加载（同 analyze_fraud_delta_fj.ts，但额外要求 itemBeliefs）
// ============================================================================

const V2_DIR = path.resolve(__dirname);
const FRAUD_DIRS = [
  path.join(V2_DIR, "data_fraud_qwen"),
  path.join(V2_DIR, "data_fraud_zhipu"),
  path.join(V2_DIR, "data_fraud_malicious"),
];

const EXCLUDE_FILES = new Set(["summary.json", "enhanced_evaluation_results.json"]);

function loadFraudRuns(): FraudRun[] {
  const runs: FraudRun[] = [];
  for (const dir of FRAUD_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(
      f => f.endsWith(".json") && !EXCLUDE_FILES.has(f)
    );
    for (const f of files) {
      const raw = safeJsonParse<FraudRun & { error?: string }>(
        fs.readFileSync(path.join(dir, f), "utf-8")
      );
      if (!raw || raw.error) continue;
      // 仅保留 enriched 文件：必须有 roundResults[].opinions 且有 kendallTau
      if (!Array.isArray(raw.roundResults) || typeof raw.kendallTau !== "number") continue;
      // 额外要求：至少一个 opinion 带 itemBeliefs（ε 模型需要）
      const hasItemBeliefs = raw.roundResults.some(r =>
        Array.isArray(r.opinions) &&
        r.opinions.some(o => Array.isArray(o.itemBeliefs) && o.itemBeliefs.length > 0)
      );
      if (!hasItemBeliefs) continue;
      runs.push({
        ...raw,
        runId: raw.runId ?? f.replace(/\.json$/, ""),
        group: raw.group ?? "unknown",
      });
    }
  }
  return runs;
}

const allRuns = loadFraudRuns();
const maliciousRuns = allRuns.filter(
  r => Array.isArray(r.maliciousAgentIds) && r.maliciousAgentIds.length > 0
);
const interventionRuns = allRuns.filter(r => r.governanceEnabled === true);
const nonInterventionRuns = allRuns.filter(r => r.governanceEnabled !== true);

// ============================================================================
// 样本计算（U_signed_max, U_max, U_norm, δ, etc.）
// ============================================================================

function computeSamples(run: FraudRun): EpsSample[] {
  const samples: EpsSample[] = [];
  const maliciousSet = new Set(run.maliciousAgentIds ?? []);
  const rounds = run.roundResults ?? [];
  const isIntervention = run.governanceEnabled === true;

  for (const round of rounds) {
    const roundNum = typeof round.roundNumber === "number" ? round.roundNumber : 0;
    const opinions = Array.isArray(round.opinions) ? round.opinions : [];
    for (const op of opinions) {
      const agentId = op.agentId;
      const role = FRAUD_AGENT_ROLES[agentId];
      if (!role) continue; // 未知 agent
      const b = op.belief;
      if (typeof b !== "number" || isNaN(b)) continue;
      const items = Array.isArray(op.itemBeliefs) ? op.itemBeliefs : [];
      if (items.length === 0) continue; // ε 模型需要 itemBeliefs

      // u 向量
      const u = items.map(it => (typeof it.belief === "number" ? it.belief : 0));

      // U_signed_max: u_i with max |u_i| (preserves direction)
      let uSignedMax = 0;
      let maxAbs = -Infinity;
      for (const v of u) {
        if (Math.abs(v) > maxAbs) {
          maxAbs = Math.abs(v);
          uSignedMax = v;
        }
      }
      // U_max (unsigned)
      const uMax = maxAbs === -Infinity ? 0 : maxAbs;
      // U_norm = ||u||_2 / sqrt(5)
      const l2 = Math.sqrt(u.reduce((s, v) => s + v * v, 0));
      const uNorm = l2 / Math.sqrt(5);

      const iotaRole = IOTA_ROLE[agentId];
      const delta = Math.abs(Math.abs(b) - iotaRole);

      samples.push({
        runId: run.runId!,
        group: run.group ?? "unknown",
        round: roundNum,
        agentId,
        role,
        b,
        absB: Math.abs(b),
        uSignedMax,
        uMax,
        uNorm,
        iotaRole,
        delta,
        isMalicious: maliciousSet.has(agentId),
        isIntervention,
        kendallTau: run.kendallTau,
        eps: 0, // placeholder, filled after α fit
      });
    }
  }
  return samples;
}

const allSamples: EpsSample[] = [];
for (const run of allRuns) {
  allSamples.push(...computeSamples(run));
}

const maliciousSamples = allSamples.filter(s => s.isMalicious);
const honestSamplesInMaliciousRuns = allSamples.filter(
  s => !s.isMalicious && maliciousRuns.some(r => r.runId === s.runId)
);

// ============================================================================
// 统计工具（与 analyze_fraud_delta_fj.ts 保持一致的本地实现）
// ============================================================================

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

interface DistStats {
  n: number;
  mean: number;
  std: number;
  median: number;
  q1: number;
  q3: number;
  min: number;
  max: number;
}

function distStats(values: number[]): DistStats {
  return {
    n: values.length,
    mean: mean(values),
    std: sampleStd(values),
    median: median(values),
    q1: percentile(values, 0.25),
    q3: percentile(values, 0.75),
    min: values.length ? Math.min(...values) : NaN,
    max: values.length ? Math.max(...values) : NaN,
  };
}

function fmt(n: number, digits = 4): string {
  if (typeof n !== "number" || isNaN(n)) return "NaN";
  return n.toFixed(digits);
}

function pearsonR(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return NaN;
  const mx = mean(x);
  const my = mean(y);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dxi = x[i] - mx;
    const dyi = y[i] - my;
    num += dxi * dyi;
    dx2 += dxi * dxi;
    dy2 += dyi * dyi;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? NaN : num / denom;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface CorrResult {
  r: number;
  n: number;
  p: number; // 双侧置换检验 p 值
  perms: number;
}

/** Pearson r + 双侧置换检验 p 值（mulberry32 seed=42） */
function pearsonWithPValue(x: number[], y: number[], perms = 10000): CorrResult {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { r: NaN, n, p: NaN, perms: 0 };
  const xs = x.slice(0, n);
  const ys = y.slice(0, n);
  const rObs = pearsonR(xs, ys);
  if (isNaN(rObs)) return { r: NaN, n, p: NaN, perms: 0 };

  const rng = mulberry32(PERMUTATION_SEED);
  let count = 0;
  for (let i = 0; i < perms; i++) {
    const yp = shuffle(ys, rng);
    const rp = pearsonR(xs, yp);
    if (Math.abs(rp) >= Math.abs(rObs) - 1e-12) count++;
  }
  return { r: rObs, n, p: count / perms, perms };
}

/**
 * 均值差置换检验（单侧：malicious > honest）
 * 返回 observed_diff (mean_malicious - mean_honest), p_value (单侧), perms
 */
function meanDiffPermutationTest(
  maliciousVals: number[],
  honestVals: number[],
  perms = 10000,
): {
  observedDiff: number;
  meanMalicious: number;
  meanHonest: number;
  p: number;
  perms: number;
  nMalicious: number;
  nHonest: number;
} {
  const meanM = mean(maliciousVals);
  const meanH = mean(honestVals);
  const observedDiff = meanM - meanH;

  const combined = [
    ...maliciousVals.map(v => ({ v, isMal: true })),
    ...honestVals.map(v => ({ v, isMal: false })),
  ];
  const nMal = maliciousVals.length;
  const rng = mulberry32(PERMUTATION_SEED);
  let count = 0;
  for (let i = 0; i < perms; i++) {
    const shuffled = shuffle(combined, rng);
    const permMal = shuffled.slice(0, nMal);
    const permHonest = shuffled.slice(nMal);
    const permDiff = mean(permMal.map(x => x.v)) - mean(permHonest.map(x => x.v));
    if (permDiff >= observedDiff - 1e-12) count++;
  }
  return {
    observedDiff,
    meanMalicious: meanM,
    meanHonest: meanH,
    p: count / perms,
    perms,
    nMalicious: nMal,
    nHonest: honestVals.length,
  };
}

/**
 * 部分相关 r(x, y) controlling for z + 双侧置换检验 p 值。
 * 方法：分别对 (x~z) 和 (y~z) 做 OLS（含截距），取残差，再 Pearson 相关。
 * 置换：对 x 的残差重排，重新计算 r。
 */
function partialCorrelationWithPValue(
  x: number[],
  y: number[],
  z: number[],
  perms = 10000,
): { partialR: number; n: number; p: number; perms: number } {
  const n = Math.min(x.length, y.length, z.length);
  if (n < 3) return { partialR: NaN, n, p: NaN, perms: 0 };
  const xs = x.slice(0, n);
  const ys = y.slice(0, n);
  const zs = z.slice(0, n);

  // OLS (y ~ z) with intercept: y = a + c*z
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
  for (let i = 0; i < perms; i++) {
    const rxp = shuffle(rx, rng);
    const rp = pearsonR(rxp, ry);
    if (Math.abs(rp) >= Math.abs(rObs) - 1e-12) count++;
  }
  return { partialR: rObs, n, p: count / perms, perms };
}

function printHeader(title: string) {
  console.log("\n" + "=".repeat(78));
  console.log("  " + title);
  console.log("=".repeat(78));
}

// ============================================================================
// 输出容器
// ============================================================================

const summary: Record<string, unknown> = {
  meta: {
    generatedAt: new Date().toISOString(),
    seed: PERMUTATION_SEED,
    permutationCount: 10000,
    observationModel: "b = α·U_signed_max + ε  (least squares through origin)",
    alphaFormula: "α = Σ(U·b) / Σ(U²)",
    epsFormula: "ε = b - α·U_signed_max",
    deltaFormula: "δ = ||b| - ι_role|  (ι_role: a1=0.4, a2=0.5, a3=0.4, a4=0.5, a5=0.6)",
    uSignedMaxFormula: "U_signed_max = u_i with max |u_i| (signed)",
    uMaxFormula: "U_max = max(|u_i|)",
    uNormFormula: "U_norm = ||u||_2 / sqrt(5)",
    runsLoaded: {
      allEnriched: allRuns.length,
      malicious: maliciousRuns.length,
      nonMalicious: allRuns.length - maliciousRuns.length,
      intervention: interventionRuns.length,
      nonIntervention: nonInterventionRuns.length,
    },
    samplesGenerated: allSamples.length,
  },
  roleInertia: Object.fromEntries(
    Object.entries(IOTA_ROLE).map(([id, iota]) => [
      id,
      { role: FRAUD_AGENT_ROLES[id], iotaRole: iota },
    ])
  ),
};

console.log(`\n数据加载：enriched fraud runs (with itemBeliefs) = ${allRuns.length} (malicious=${maliciousRuns.length}, non-malicious=${allRuns.length - maliciousRuns.length})`);
console.log(`干预分组：intervention=${interventionRuns.length}, non-intervention=${nonInterventionRuns.length}`);
console.log(`ε 样本总数：${allSamples.length} (malicious=${maliciousSamples.length}, honest-in-malicious-runs=${honestSamplesInMaliciousRuns.length})`);

// ============================================================================
// 分析 1：Fit observation model b = α·U + ε
// ============================================================================

printHeader("分析 1：拟合观测模型 b = α·U_signed_max + ε");

// 先确认 utility-belief 投影一致性（与 analyze_fraud_delta_fj.ts analysis 4 对比）
const corrUmaxAbsB = pearsonWithPValue(
  allSamples.map(s => s.uMax),
  allSamples.map(s => s.absB),
);
const corrUnormAbsB = pearsonWithPValue(
  allSamples.map(s => s.uNorm),
  allSamples.map(s => s.absB),
);
console.log(`\n  [Utility-belief 投影一致性 sanity check]`);
console.log(`  r(U_max,  |b|) = ${fmt(corrUmaxAbsB.r)}  p=${fmt(corrUmaxAbsB.p, 4)}  (perms=${corrUmaxAbsB.perms})  [参考: 旧版 r=0.754]`);
console.log(`  r(U_norm, |b|) = ${fmt(corrUnormAbsB.r)}  p=${fmt(corrUnormAbsB.p, 4)}  (perms=${corrUnormAbsB.perms})`);

// α = Σ(U·b) / Σ(U²)   (least squares through origin)
let numAlpha = 0, denAlpha = 0;
for (const s of allSamples) {
  numAlpha += s.uSignedMax * s.b;
  denAlpha += s.uSignedMax * s.uSignedMax;
}
const alpha = denAlpha === 0 ? NaN : numAlpha / denAlpha;

// ε_i = b_i - α·U_i
for (const s of allSamples) {
  s.eps = s.b - alpha * s.uSignedMax;
}

// R² (correlation-based, standard interpretation for simple regression)
const rUb = pearsonR(
  allSamples.map(s => s.uSignedMax),
  allSamples.map(s => s.b),
);
const rSquared = isNaN(rUb) ? NaN : rUb * rUb;

// Uncentered R² (appropriate for through-origin fit): 1 - SS_res / Σ(b²)
let ssRes = 0, ssTotUncentered = 0, ssTotCentered = 0;
const meanB = mean(allSamples.map(s => s.b));
for (const s of allSamples) {
  ssRes += s.eps * s.eps;
  ssTotUncentered += s.b * s.b;
  ssTotCentered += (s.b - meanB) * (s.b - meanB);
}
const rSquaredUncentered = ssTotUncentered === 0 ? NaN : 1 - ssRes / ssTotUncentered;
const rSquaredCentered = ssTotCentered === 0 ? NaN : 1 - ssRes / ssTotCentered;

// ε 分布
const epsVals = allSamples.map(s => s.eps);
const epsStats = distStats(epsVals);

console.log(`\n  [观测模型拟合结果]`);
console.log(`  样本数 n = ${allSamples.length}`);
console.log(`  α (least squares through origin) = ${fmt(alpha, 6)}`);
console.log(`  r(U_signed_max, b) = ${fmt(rUb)}    R² = ${fmt(rSquared)}  (correlation-based)`);
console.log(`  R² (uncentered, through-origin) = ${fmt(rSquaredUncentered)}`);
console.log(`  R² (centered, vs mean)         = ${fmt(rSquaredCentered)}`);
console.log(`\n  ε 分布：`);
console.log(`    n=${epsStats.n}  mean=${fmt(epsStats.mean)}  std=${fmt(epsStats.std)}  median=${fmt(epsStats.median)}`);
console.log(`    Q1=${fmt(epsStats.q1)}  Q3=${fmt(epsStats.q3)}  min=${fmt(epsStats.min)}  max=${fmt(epsStats.max)}`);

console.log(`\n  解读：`);
console.log(`    - α=${fmt(alpha, 4)}：每单位 U_signed_max 对应 ${fmt(alpha, 4)} 单位 belief`);
console.log(`    - R²=${fmt(rSquared)}：U_signed_max 解释了 belief 的 ${fmt(rSquared * 100, 1)}% 方差`);
console.log(`    - ε 均值=${fmt(epsStats.mean)}（理论上应接近 0，因 OLS 残差无偏）`);
console.log(`    - ε std=${fmt(epsStats.std)}：残差规模，决定 ε 的可检测性上限`);

summary.analysis1_observationModel = {
  hypothesis: "b = α·U_signed_max + ε (least squares through origin)",
  n: allSamples.length,
  alpha,
  rUb,
  rSquared,
  rSquaredUncentered,
  rSquaredCentered,
  epsilonStats: epsStats,
  utilityProjectionSanity: {
    r_Umax_absB: corrUmaxAbsB,
    r_Unorm_absB: corrUnormAbsB,
    priorReference: { r_Umax_absB_prior: 0.754 },
  },
};

// ============================================================================
// 分析 2：H2-ε —— 恶意 agent 检测（THE KEY TEST）
// ============================================================================

printHeader("分析 2：H2-ε —— ε 能否区分恶意 agent 与诚实 agent");

const maliciousEps = maliciousSamples.map(s => s.eps);
const honestEps = honestSamplesInMaliciousRuns.map(s => s.eps);

const distEpsMal = distStats(maliciousEps);
const distEpsHon = distStats(honestEps);

console.log(`\n  样本来源：${maliciousRuns.length} 个恶意文件 (E/F/G groups)`);
console.log(`  恶意 agent ε：  n=${distEpsMal.n}  mean=${fmt(distEpsMal.mean)}  std=${fmt(distEpsMal.std)}  median=${fmt(distEpsMal.median)}  Q1=${fmt(distEpsMal.q1)}  Q3=${fmt(distEpsMal.q3)}  min=${fmt(distEpsMal.min)}  max=${fmt(distEpsMal.max)}`);
console.log(`  诚实 agent ε：  n=${distEpsHon.n}  mean=${fmt(distEpsHon.mean)}  std=${fmt(distEpsHon.std)}  median=${fmt(distEpsHon.median)}  Q1=${fmt(distEpsHon.q1)}  Q3=${fmt(distEpsHon.q3)}  min=${fmt(distEpsHon.min)}  max=${fmt(distEpsHon.max)}`);

const permTest2 = meanDiffPermutationTest(maliciousEps, honestEps, 10000);
const cohenD2 = cohensD(maliciousEps, honestEps);

console.log(`\n  均值差 (malicious - honest) = ${fmt(permTest2.observedDiff)}`);
console.log(`  Cohen's d = ${fmt(cohenD2)}`);
console.log(`  单侧置换检验 (H1: ε_malicious > ε_honest, 10k perms, seed=42)`);
console.log(`    p = ${fmt(permTest2.p, 4)}`);

// 对比旧 δ 结果
// 旧 δ (ι_approx, analyze_fraud_delta_fj.ts): d=2.18, mean_mal=0.580, mean_hon=0.224
const oldDeltaComparison = {
  source: "analyze_fraud_delta_fj.ts (ι_approx = (0.7·roleBase + 0.1·expressionBased)·0.98)",
  cohensD: 2.18,
  meanMalicious: 0.5802,
  meanHonest: 0.2240,
  nMalicious: 133,
  nHonest: 418,
};

const h2EpsSupported = permTest2.observedDiff > 0 && permTest2.p < 0.05;
const betterThanDelta = cohenD2 > oldDeltaComparison.cohensD;

console.log(`\n  对比旧 δ 结果（Tier C, ι_approx 版本）：`);
console.log(`    旧 δ：d=${oldDeltaComparison.cohensD}  mean_mal=${fmt(oldDeltaComparison.meanMalicious)}  mean_hon=${fmt(oldDeltaComparison.meanHonest)}  (n_mal=${oldDeltaComparison.nMalicious}, n_hon=${oldDeltaComparison.nHonest})`);
console.log(`    新 ε：d=${fmt(cohenD2)}  mean_mal=${fmt(permTest2.meanMalicious)}  mean_hon=${fmt(permTest2.meanHonest)}  (n_mal=${permTest2.nMalicious}, n_hon=${permTest2.nHonest})`);
console.log(`\n  解读：`);
console.log(`    - ε_malicious (${fmt(permTest2.meanMalicious)}) vs ε_honest (${fmt(permTest2.meanHonest)})`);
console.log(`    - ${permTest2.observedDiff > 0 ? "恶意 agent ε 更高（符合假设）" : "恶意 agent ε 更低（与假设相反）"}，Cohen's d=${fmt(cohenD2)}（${Math.abs(cohenD2) < 0.2 ? "可忽略" : Math.abs(cohenD2) < 0.5 ? "小" : Math.abs(cohenD2) < 0.8 ? "中" : "大"}效应）`);
console.log(`    - ${h2EpsSupported ? "✅ H2-ε 得到支持：ε 能区分恶意与诚实 agent" : "❌ H2-ε 未得到支持"}`);
console.log(`    - ${betterThanDelta ? "✅ ε 检测性能优于 δ" : "⚠ ε 检测性能弱于 δ（d_ε < d_δ）"}：d_ε=${fmt(cohenD2)} vs d_δ=${oldDeltaComparison.cohensD}`);

summary.analysis2_H2_epsilon = {
  hypothesis: "H2-ε: malicious agents have higher ε than honest agents",
  maliciousEpsilonStats: distEpsMal,
  honestEpsilonStats: distEpsHon,
  permutationTest: permTest2,
  cohensD: cohenD2,
  supported: h2EpsSupported,
  oldDeltaComparison,
  epsilonBetterThanDelta: betterThanDelta,
};

// ============================================================================
// 分析 3：Decompose —— 什么驱动检测？
// ============================================================================

printHeader("分析 3：分解 —— 是 |b|、|U|、还是 ε 驱动恶意检测？");

// 3a: |b| 分布
const absBMal = maliciousSamples.map(s => s.absB);
const absBHon = honestSamplesInMaliciousRuns.map(s => s.absB);
const distAbsBMal = distStats(absBMal);
const distAbsBHon = distStats(absBHon);
const permAbsB = meanDiffPermutationTest(absBMal, absBHon, 10000);
const dAbsB = cohensD(absBMal, absBHon);

console.log(`\n  [3a] |b| 分布（恶意 vs 诚实）`);
console.log(`  恶意 |b|：  n=${distAbsBMal.n}  mean=${fmt(distAbsBMal.mean)}  std=${fmt(distAbsBMal.std)}  median=${fmt(distAbsBMal.median)}`);
console.log(`  诚实 |b|：  n=${distAbsBHon.n}  mean=${fmt(distAbsBHon.mean)}  std=${fmt(distAbsBHon.std)}  median=${fmt(distAbsBHon.median)}`);
console.log(`  Cohen's d = ${fmt(dAbsB)}  单侧 p = ${fmt(permAbsB.p, 4)}  (malicious > honest)`);

// 3b: |U| 分布 (U_max)
const uMaxMal = maliciousSamples.map(s => s.uMax);
const uMaxHon = honestSamplesInMaliciousRuns.map(s => s.uMax);
const distUMaxMal = distStats(uMaxMal);
const distUMaxHon = distStats(uMaxHon);
const permUMax = meanDiffPermutationTest(uMaxMal, uMaxHon, 10000);
const dUMax = cohensD(uMaxMal, uMaxHon);

console.log(`\n  [3b] |U|_max 分布（恶意 vs 诚实）`);
console.log(`  恶意 |U|：  n=${distUMaxMal.n}  mean=${fmt(distUMaxMal.mean)}  std=${fmt(distUMaxMal.std)}  median=${fmt(distUMaxMal.median)}`);
console.log(`  诚实 |U|：  n=${distUMaxHon.n}  mean=${fmt(distUMaxHon.mean)}  std=${fmt(distUMaxHon.std)}  median=${fmt(distUMaxHon.median)}`);
console.log(`  Cohen's d = ${fmt(dUMax)}  单侧 p = ${fmt(permUMax.p, 4)}  (malicious > honest)`);

// 3c: ε 分布（重复 Analysis 2 的核心，便于对比）
console.log(`\n  [3c] ε 分布（恶意 vs 诚实，来自 Analysis 2）`);
console.log(`  恶意 ε：  n=${distEpsMal.n}  mean=${fmt(distEpsMal.mean)}  std=${fmt(distEpsMal.std)}  median=${fmt(distEpsMal.median)}`);
console.log(`  诚实 ε：  n=${distEpsHon.n}  mean=${fmt(distEpsHon.mean)}  std=${fmt(distEpsHon.std)}  median=${fmt(distEpsHon.median)}`);
console.log(`  Cohen's d = ${fmt(cohenD2)}  单侧 p = ${fmt(permTest2.p, 4)}  (malicious > honest)`);

// 3d: 部分相关 r(ε, malicious) controlling for |b|
// 使用恶意文件中的所有样本（malicious + honest-in-malicious-runs）
const malSamplesAll = maliciousSamples.concat(honestSamplesInMaliciousRuns);
const epsVec = malSamplesAll.map(s => s.eps);
const malIndicator = malSamplesAll.map(s => s.isMalicious ? 1 : 0);
const absBVec = malSamplesAll.map(s => s.absB);

const partialR = partialCorrelationWithPValue(epsVec, malIndicator, absBVec, 10000);
// 同时计算零阶相关 r(ε, malicious) 作为对比
const zeroOrderR = pearsonWithPValue(epsVec, malIndicator, 10000);
// r(|b|, malicious) 作为对比
const rAbsBMal = pearsonWithPValue(absBVec, malIndicator, 10000);

console.log(`\n  [3d] 部分相关：r(ε, malicious) controlling for |b|`);
console.log(`  样本数 n = ${malSamplesAll.length} (malicious=${maliciousSamples.length}, honest=${honestSamplesInMaliciousRuns.length})`);
console.log(`  零阶 r(ε, malicious)        = ${fmt(zeroOrderR.r)}  p=${fmt(zeroOrderR.p, 4)}  (双侧)`);
console.log(`  零阶 r(|b|, malicious)      = ${fmt(rAbsBMal.r)}  p=${fmt(rAbsBMal.p, 4)}  (双侧)`);
console.log(`  偏相关 r(ε, mal | |b|)      = ${fmt(partialR.partialR)}  p=${fmt(partialR.p, 4)}  (双侧置换, ${partialR.perms} perms)`);
console.log(`\n  解读：`);
console.log(`    - d_|b|=${fmt(dAbsB)}, d_|U|=${fmt(dUMax)}, d_ε=${fmt(cohenD2)}`);
console.log(`    - ${dAbsB > dUMax && dAbsB > cohenD2 ? "|b| 是最强单变量检测器" : dUMax > dAbsB && dUMax > cohenD2 ? "|U| 是最强单变量检测器" : "ε 是最强单变量检测器"}`);
console.log(`    - 偏相关 r(ε, mal | |b|)=${fmt(partialR.partialR)}：`);
if (isNaN(partialR.partialR)) {
  console.log(`      [无法计算]`);
} else if (Math.abs(partialR.partialR) < 0.05) {
  console.log(`      ε 几乎不提供 |b| 之外的检测信息（偏相关 ≈ 0）`);
} else if (Math.abs(partialR.partialR) < 0.2) {
  console.log(`      ε 提供 |b| 之外的微弱检测信息（偏相关较小）`);
} else {
  console.log(`      ε 提供 |b| 之外的显著检测信息（偏相关较大）`);
}
console.log(`    - ${partialR.p < 0.05 ? "✅ 部分相关显著：ε 在控制 |b| 后仍与恶意性相关" : "❌ 部分相关不显著：ε 的检测力可能主要来自 |b|"}`);

summary.analysis3_decompose = {
  absB_comparison: {
    malicious: distAbsBMal,
    honest: distAbsBHon,
    permutationTest: permAbsB,
    cohensD: dAbsB,
  },
  uMax_comparison: {
    malicious: distUMaxMal,
    honest: distUMaxHon,
    permutationTest: permUMax,
    cohensD: dUMax,
  },
  epsilon_comparison: {
    malicious: distEpsMal,
    honest: distEpsHon,
    permutationTest: permTest2,
    cohensD: cohenD2,
  },
  partialCorrelation: {
    n: partialR.n,
    zeroOrderR_epsilon_malicious: zeroOrderR,
    zeroOrderR_absB_malicious: rAbsBMal,
    partialR_epsilon_malicious_given_absB: partialR,
    interpretation:
      isNaN(partialR.partialR) ? "undefined" :
      Math.abs(partialR.partialR) < 0.05 ? "epsilon adds no info beyond |b|" :
      Math.abs(partialR.partialR) < 0.2 ? "epsilon adds weak info beyond |b|" :
      "epsilon adds substantial info beyond |b|",
  },
};

// ============================================================================
// 分析 4：H1-ε —— ε 与干预有效性
// ============================================================================

printHeader("分析 4：H1-ε —— mean ε vs kendallTau（干预 vs 非干预）");

// 每个 run 的 mean ε
const epsByRun = new Map<string, number[]>();
for (const s of allSamples) {
  if (!epsByRun.has(s.runId)) epsByRun.set(s.runId, []);
  epsByRun.get(s.runId)!.push(s.eps);
}

interface RunPair { runId: string; meanEps: number; kendallTau: number; isIntervention: boolean; group: string; }
const runPairs: RunPair[] = [];
for (const run of allRuns) {
  const es = epsByRun.get(run.runId!);
  if (es === undefined || es.length === 0) continue;
  runPairs.push({
    runId: run.runId!,
    meanEps: mean(es),
    kendallTau: run.kendallTau,
    isIntervention: run.governanceEnabled === true,
    group: run.group ?? "unknown",
  });
}

const intvPairs = runPairs.filter(p => p.isIntervention);
const nonIntvPairs = runPairs.filter(p => !p.isIntervention);

const corrIntv = pearsonWithPValue(
  intvPairs.map(p => p.meanEps),
  intvPairs.map(p => p.kendallTau),
);
const corrNonIntv = pearsonWithPValue(
  nonIntvPairs.map(p => p.meanEps),
  nonIntvPairs.map(p => p.kendallTau),
);
const corrAll = pearsonWithPValue(
  runPairs.map(p => p.meanEps),
  runPairs.map(p => p.kendallTau),
);

console.log(`\n  所有 38 文件：n=${corrAll.n}  r(mean ε, kendallTau) = ${fmt(corrAll.r)}  p=${fmt(corrAll.p, 4)}  (perms=${corrAll.perms})`);
console.log(`  mean ε = ${fmt(mean(runPairs.map(p => p.meanEps)))}  mean τ = ${fmt(mean(runPairs.map(p => p.kendallTau)))}`);
console.log(`\n  干预组 (governanceEnabled=true)：  n=${corrIntv.n}  r=${fmt(corrIntv.r)}  p=${fmt(corrIntv.p, 4)}  mean ε=${fmt(mean(intvPairs.map(p => p.meanEps)))}  mean τ=${fmt(mean(intvPairs.map(p => p.kendallTau)))}`);
console.log(`  非干预组 (governanceEnabled≠true)：n=${corrNonIntv.n}  r=${fmt(corrNonIntv.r)}  p=${fmt(corrNonIntv.p, 4)}  mean ε=${fmt(mean(nonIntvPairs.map(p => p.meanEps)))}  mean τ=${fmt(mean(nonIntvPairs.map(p => p.kendallTau)))}`);

const oldH1Delta = { r: 0.013, p: 0.89, source: "analyze_delta_distribution_v2.ts (V1 intervention runs, broader crisis/supplier data)" };
console.log(`\n  对比旧 H1-δ 结果：`);
console.log(`    旧 H1-δ (intervention)：r=${oldH1Delta.r}  p=${oldH1Delta.p}  [${oldH1Delta.source}]`);
console.log(`    新 H1-ε (intervention)：r=${fmt(corrIntv.r)}  p=${fmt(corrIntv.p, 4)}`);
console.log(`    新 H1-ε (non-intervention)：r=${fmt(corrNonIntv.r)}  p=${fmt(corrNonIntv.p, 4)}`);
console.log(`\n  解读：`);
const intvStronger = Math.abs(corrIntv.r) > Math.abs(corrNonIntv.r);
console.log(`    - ε-τ 相关在${intvStronger ? "干预组更强" : "非干预组更强（或相当）"}：|r_intv|=${fmt(Math.abs(corrIntv.r))} vs |r_nonintv|=${fmt(Math.abs(corrNonIntv.r))}`);
console.log(`    - 干预组 r 符号=${corrIntv.r < 0 ? "负（高ε→低τ，符合H1）" : "正（不符合H1）"}`);
console.log(`    - 与旧 H1-δ (r=${oldH1Delta.r}) 相比：${Math.abs(corrIntv.r) > Math.abs(oldH1Delta.r) ? "ε 有更强的预测力" : "ε 并未明显优于 δ"}`);

summary.analysis4_H1_epsilon = {
  hypothesis: "H1-ε: mean ε predicts intervention effectiveness (high ε → lower τ, stronger in intervention runs)",
  allRuns: { n: corrAll.n, r: corrAll.r, p: corrAll.p, meanEps: mean(runPairs.map(p => p.meanEps)), meanTau: mean(runPairs.map(p => p.kendallTau)) },
  interventionRuns: {
    n: corrIntv.n,
    r: corrIntv.r,
    p: corrIntv.p,
    meanEps: mean(intvPairs.map(p => p.meanEps)),
    meanTau: mean(intvPairs.map(p => p.kendallTau)),
  },
  nonInterventionRuns: {
    n: corrNonIntv.n,
    r: corrNonIntv.r,
    p: corrNonIntv.p,
    meanEps: mean(nonIntvPairs.map(p => p.meanEps)),
    meanTau: mean(nonIntvPairs.map(p => p.kendallTau)),
  },
  interventionCorrelationStronger: intvStronger,
  oldH1DeltaComparison: oldH1Delta,
};

// ============================================================================
// 分析 5：ε vs δ 直接对比
// ============================================================================

printHeader("分析 5：ε vs δ 直接对比（δ = ||b| - ι_role|）");

// r(ε, δ) — 它们测量的是同一个东西吗？
const corrEpsDelta = pearsonWithPValue(
  allSamples.map(s => s.eps),
  allSamples.map(s => s.delta),
);

console.log(`\n  [5a] ε 与 δ 的相关性（全部样本）`);
console.log(`  n=${corrEpsDelta.n}  r(ε, δ) = ${fmt(corrEpsDelta.r)}  p=${fmt(corrEpsDelta.p, 4)}  (perms=${corrEpsDelta.perms})`);
console.log(`  mean ε = ${fmt(mean(allSamples.map(s => s.eps)))}  mean δ = ${fmt(mean(allSamples.map(s => s.delta)))}`);
console.log(`  解读：${Math.abs(corrEpsDelta.r) > 0.7 ? "高度相关——ε 与 δ 测量几乎相同的东西" : Math.abs(corrEpsDelta.r) > 0.4 ? "中度相关——ε 与 δ 部分重叠" : Math.abs(corrEpsDelta.r) > 0.2 ? "弱相关——ε 与 δ 测量不同方面" : "几乎不相关——ε 与 δ 测量完全不同的东西"}`);

// 5b: δ 的恶意检测性能（使用同样的样本，ι_role 版本）
const maliciousDelta = maliciousSamples.map(s => s.delta);
const honestDelta = honestSamplesInMaliciousRuns.map(s => s.delta);

const distDeltaMal = distStats(maliciousDelta);
const distDeltaHon = distStats(honestDelta);
const permDelta = meanDiffPermutationTest(maliciousDelta, honestDelta, 10000);
const dDelta = cohensD(maliciousDelta, honestDelta);

console.log(`\n  [5b] δ 的恶意检测性能（ι_role 版本，同一样本集）`);
console.log(`  恶意 δ：  n=${distDeltaMal.n}  mean=${fmt(distDeltaMal.mean)}  std=${fmt(distDeltaMal.std)}  median=${fmt(distDeltaMal.median)}`);
console.log(`  诚实 δ：  n=${distDeltaHon.n}  mean=${fmt(distDeltaHon.mean)}  std=${fmt(distDeltaHon.std)}  median=${fmt(distDeltaHon.median)}`);
console.log(`  Cohen's d = ${fmt(dDelta)}  单侧 p = ${fmt(permDelta.p, 4)}`);

// 5c: 对比表
console.log(`\n  [5c] 检测性能对比表`);
console.log(`  ${"指标".padEnd(28)} ${"ε".padStart(12)} ${"δ (ι_role)".padStart(14)} ${"δ (ι_approx, 旧)".padStart(20)}`);
console.log(`  ${"Cohen's d".padEnd(28)} ${fmt(cohenD2).padStart(12)} ${fmt(dDelta).padStart(14)} ${fmt(oldDeltaComparison.cohensD).padStart(20)}`);
console.log(`  ${"mean (malicious)".padEnd(28)} ${fmt(permTest2.meanMalicious).padStart(12)} ${fmt(permDelta.meanMalicious).padStart(14)} ${fmt(oldDeltaComparison.meanMalicious).padStart(20)}`);
console.log(`  ${"mean (honest)".padEnd(28)} ${fmt(permTest2.meanHonest).padStart(12)} ${fmt(permDelta.meanHonest).padStart(14)} ${fmt(oldDeltaComparison.meanHonest).padStart(20)}`);
console.log(`  ${"n (malicious)".padEnd(28)} ${String(permTest2.nMalicious).padStart(12)} ${String(permDelta.nMalicious).padStart(14)} ${String(oldDeltaComparison.nMalicious).padStart(20)}`);
console.log(`  ${"n (honest)".padEnd(28)} ${String(permTest2.nHonest).padStart(12)} ${String(permDelta.nHonest).padStart(14)} ${String(oldDeltaComparison.nHonest).padStart(20)}`);
console.log(`  ${"单侧 p".padEnd(28)} ${fmt(permTest2.p, 4).padStart(12)} ${fmt(permDelta.p, 4).padStart(14)} ${"< 0.0001".padStart(20)}`);

console.log(`\n  解读：`);
const epsBetterIotaRole = cohenD2 > dDelta;
const epsBetterIotaApprox = cohenD2 > oldDeltaComparison.cohensD;
console.log(`    - r(ε, δ) = ${fmt(corrEpsDelta.r)}：两个指标${Math.abs(corrEpsDelta.r) > 0.5 ? "高度重叠" : "重叠有限"}`);
console.log(`    - ε vs δ(ι_role)：${epsBetterIotaRole ? "ε 更好 (d_ε > d_δ)" : "δ 更好 (d_δ ≥ d_ε)"}  [d_ε=${fmt(cohenD2)} vs d_δ=${fmt(dDelta)}]`);
console.log(`    - ε vs δ(ι_approx, 旧版)：${epsBetterIotaApprox ? "ε 更好" : "δ(ι_approx) 更好"}  [d_ε=${fmt(cohenD2)} vs d_δ=${oldDeltaComparison.cohensD}]`);
console.log(`    - 总结：`);
if (epsBetterIotaApprox) {
  console.log(`      ✅ ε 在恶意检测上优于旧 δ（包括 ι_approx 版本），且理论更干净（无需 ad-hoc ι_role 调参）`);
} else if (epsBetterIotaRole) {
  console.log(`      ⚠ ε 优于简单 ι_role 版 δ，但不及调参后的 ι_approx 版 δ；不过 ε 无需 ι_role 参数，理论更干净`);
} else {
  console.log(`      ❌ ε 在恶意检测上不及 δ；ε 的优势（如有）可能在理论简洁性而非统计检测力`);
}

summary.analysis5_epsilon_vs_delta = {
  hypothesis: "Compare ε vs δ = ||b| - ι_role| for malicious detection",
  correlationEpsDelta: corrEpsDelta,
  delta_iotaRole_detection: {
    malicious: distDeltaMal,
    honest: distDeltaHon,
    permutationTest: permDelta,
    cohensD: dDelta,
  },
  epsilon_detection: {
    malicious: distEpsMal,
    honest: distEpsHon,
    permutationTest: permTest2,
    cohensD: cohenD2,
  },
  oldDelta_iotaApprox_reference: oldDeltaComparison,
  epsilonBetterThanIotaRole: epsBetterIotaRole,
  epsilonBetterThanIotaApprox: epsBetterIotaApprox,
};

// ============================================================================
// 保存 JSON
// ============================================================================

const resultsDir = path.join(V2_DIR, "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
const outPath = path.join(resultsDir, "analyze_epsilon_observation_model.json");
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf-8");

console.log("\n" + "=".repeat(78));
console.log(`  JSON 摘要已保存：${path.relative(process.cwd(), outPath)}`);
console.log("=".repeat(78));
