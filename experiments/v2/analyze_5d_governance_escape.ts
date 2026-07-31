/**
 * 5D Convex Hull Escape by Governance Condition (fraud 38 async enriched runs)
 *
 * 背景：
 *   之前 1D 发现：治理压制逃逸 (none 27.8% → full 8.4%)。
 *   但 1D 大幅低估逃逸 (1D: 10.2% vs 5D simplex: 95.6%)。
 *   本脚本验证：在 5D simplex 下，治理是否仍压制逃逸？
 *
 * 治理条件编码：
 *   - data_fraud_malicious/: governanceEnabled 字段 (true=full, false=none)
 *     - Group E: governanceEnabled=true → full (6 runs with itemBeliefs)
 *     - Group F: governanceEnabled=false → none (10 runs with itemBeliefs)
 *     - Group G: governanceEnabled=true → full (10 runs with itemBeliefs)
 *   - data_fraud_qwen/: 无 governanceEnabled，但有 governanceTrace → full (10 runs)
 *   - data_fraud_zhipu/: 无 governanceEnabled，但有 governanceTrace → full (2 runs: B_2, B_3)
 *
 * 6 项分析：
 *   1. 5D 逃逸率按治理条件（含 Wilson CI）
 *   2. 统计检验（Fisher exact / chi-square, odds ratio, relative risk）
 *   3. 随机基线（marginal-preserving）按条件
 *   4. 最终轮收敛分析
 *   5. 恶意 vs 诚实 agent 按条件（仅 malicious runs）
 *   6. 每轮逃逸率按条件
 *
 * 运行：npx tsx experiments/v2/analyze_5d_governance_escape.ts
 */

import * as fs from "fs";
import * as path from "path";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";
import { mulberry32 } from "./statsShared";

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
  maliciousAgentIds?: string[];
  governanceEnabled?: boolean;
  governanceTrace?: unknown[];
  roundResults?: RoundResult[];
  [key: string]: unknown;
}

// ============================================================================
// 常量
// ============================================================================

const V2_DIR = path.resolve(__dirname);
const FRAUD_DIRS = [
  path.join(V2_DIR, "data_fraud_qwen"),
  path.join(V2_DIR, "data_fraud_zhipu"),
  path.join(V2_DIR, "data_fraud_malicious"),
];
const EXCLUDE_FILES = new Set(["summary.json", "enhanced_evaluation_results.json"]);
const BASELINE_SEED = 42; // mulberry32(42) for all random operations
const EPS = 1e-6;

// ============================================================================
// 线性代数：n×n 矩阵求解 / 行列式（Gaussian elimination + 部分主元）
// ============================================================================

function determinant(M: number[][]): number {
  const n = M.length;
  if (n === 0) return 1;
  const A = M.map(row => row.slice());
  let det = 1;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    let maxVal = Math.abs(A[i][i]);
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > maxVal) { maxVal = Math.abs(A[k][i]); maxRow = k; }
    }
    if (maxVal < 1e-12) return 0;
    if (maxRow !== i) { [A[i], A[maxRow]] = [A[maxRow], A[i]]; det = -det; }
    det *= A[i][i];
    for (let k = i + 1; k < n; k++) {
      const factor = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) A[k][j] -= factor * A[i][j];
    }
  }
  return det;
}

function solveLinearSystem(M: number[][], b: number[]): number[] | null {
  const n = M.length;
  if (n === 0 || M[0].length !== n) return null;
  const A = M.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    let maxVal = Math.abs(A[i][i]);
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > maxVal) { maxVal = Math.abs(A[k][i]); maxRow = k; }
    }
    if (maxVal < 1e-12) return null;
    if (maxRow !== i) [A[i], A[maxRow]] = [A[maxRow], A[i]];
    for (let k = i + 1; k < n; k++) {
      const factor = A[k][i] / A[i][i];
      for (let j = i; j <= n; j++) A[k][j] -= factor * A[i][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = A[i][n];
    for (let j = i + 1; j < n; j++) sum -= A[i][j] * x[j];
    x[i] = sum / A[i][i];
  }
  return x;
}

// ============================================================================
// Hull 检验（5D simplex exact membership）
// ============================================================================

interface SimplexResult {
  inside: boolean;
  reason: string;
}

function inBoundingBox(p: number[], vertices: number[][], eps = 1e-9): boolean {
  const dim = p.length;
  for (let d = 0; d < dim; d++) {
    const lo = Math.min(...vertices.map(v => v[d]));
    const hi = Math.max(...vertices.map(v => v[d]));
    if (p[d] < lo - eps || p[d] > hi + eps) return false;
  }
  return true;
}

/**
 * 4-simplex membership (5 顶点在 5D 中)。
 * 解 Vλ = p，其中 V 是 5×5 矩阵，第 i 列为 v_i。
 * inside iff λ_i ≥ -eps ∀i AND |Σλ_i - 1| < eps。
 */
function simplexMembership(p: number[], vertices: number[][]): SimplexResult {
  const n = vertices.length;
  if (n === 0) return { inside: false, reason: "no_vertices" };
  const dim = vertices[0].length;
  if (dim !== n) {
    return { inside: inBoundingBox(p, vertices), reason: "non_square_use_bbox" };
  }
  const V: number[][] = [];
  for (let j = 0; j < dim; j++) V.push(vertices.map(v => v[j]));
  const det = determinant(V);
  if (Math.abs(det) < 1e-9) {
    return { inside: inBoundingBox(p, vertices), reason: "degenerate_use_bbox" };
  }
  const lambda = solveLinearSystem(V, p);
  if (!lambda) {
    return { inside: inBoundingBox(p, vertices), reason: "solve_failed_use_bbox" };
  }
  const sumLambda = lambda.reduce((s, x) => s + x, 0);
  const allNonNeg = lambda.every(x => x >= -EPS);
  const sumIsOne = Math.abs(sumLambda - 1) < EPS;
  const inside = allNonNeg && sumIsOne;
  return {
    inside,
    reason: inside ? "inside"
      : (sumIsOne ? "outside_negative_lambda" : "outside_affine_hull"),
  };
}

// ============================================================================
// 统计工具：Wilson CI, Fisher exact, Odds ratio, Relative risk
// ============================================================================

/** Wilson score interval for a proportion x/n */
function wilsonCI(x: number, n: number, z = 1.959964): { lo: number; hi: number } {
  if (n === 0) return { lo: NaN, hi: NaN };
  const p = x / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const spread = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { lo: centre - spread, hi: centre + spread };
}

/** Log-gamma via Lanczos approximation */
function lgamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function logFactorial(n: number): number {
  if (n <= 1) return 0;
  return lgamma(n + 1);
}

function logComb(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

/** Fisher's exact test (two-tailed) for 2x2 table:
 *    a b
 *    c d
 */
function fisherExact(a: number, b: number, c: number, d: number): { pValue: number; pObserved: number } {
  const n = a + b + c + d;
  const r1 = a + b; // row 1 total
  const r2 = c + d; // row 2 total
  const c1 = a + c; // col 1 total

  const lo = Math.max(0, r1 - (n - c1)); // r1 - d
  const hi = Math.min(r1, c1);

  const logDenom = logComb(n, c1);
  const logP_obs = logComb(r1, a) + logComb(r2, c1 - a) - logDenom;
  const p_obs = Math.exp(logP_obs);

  let pValue = 0;
  for (let k = lo; k <= hi; k++) {
    const logP = logComb(r1, k) + logComb(r2, c1 - k) - logDenom;
    const p = Math.exp(logP);
    if (p <= p_obs + 1e-15) {
      pValue += p;
    }
  }
  // Clamp
  pValue = Math.min(1, Math.max(0, pValue));
  return { pValue, pObserved: p_obs };
}

/** Chi-square test for 2x2 table (with Yates' correction) */
function chiSquareYates(a: number, b: number, c: number, d: number): { chi2: number; pValue: number; df: number } {
  const n = a + b + c + d;
  const r1 = a + b, r2 = c + d;
  const c1 = a + c, c2 = b + d;
  // Expected
  const eA = (r1 * c1) / n;
  const eB = (r1 * c2) / n;
  const eC = (r2 * c1) / n;
  const eD = (r2 * c2) / n;
  // Yates' correction
  const chi2 =
    (Math.abs(a - eA) - 0.5) ** 2 / eA +
    (Math.abs(b - eB) - 0.5) ** 2 / eB +
    (Math.abs(c - eC) - 0.5) ** 2 / eC +
    (Math.abs(d - eD) - 0.5) ** 2 / eD;
  // p-value via chi-square CDF with df=1
  // P(X > chi2) for df=1: erfc(sqrt(chi2/2))
  const pValue = erfc(Math.sqrt(chi2 / 2));
  return { chi2, pValue, df: 1 };
}

/** Complementary error function (erfc) via continued fraction / series */
function erfc(x: number): number {
  // Abramowitz & Stegun 7.1.26 approximation
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const poly = 1 - (
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
  ) * Math.exp(-z * z);
  const result = x >= 0 ? poly : 2 - poly;
  // For chi-square p-value we need: P(X^2_1 > chi2) = erfc(sqrt(chi2/2))
  // Clamp to [0,1]
  return Math.min(1, Math.max(0, result));
}

/** Odds ratio with 95% CI */
function oddsRatioCI(a: number, b: number, c: number, d: number, z = 1.959964): { or: number; lo: number; hi: number } {
  const or = (a * d) / (b * c);
  const lnOR = Math.log(or);
  const se = Math.sqrt(1 / Math.max(a, 0.5) + 1 / Math.max(b, 0.5) + 1 / Math.max(c, 0.5) + 1 / Math.max(d, 0.5));
  const lo = Math.exp(lnOR - z * se);
  const hi = Math.exp(lnOR + z * se);
  return { or, lo, hi };
}

/** Relative risk with 95% CI */
function relativeRiskCI(a: number, b: number, c: number, d: number, z = 1.959964): { rr: number; lo: number; hi: number } {
  const p1 = a / (a + b);
  const p2 = c / (c + d);
  const rr = p1 / p2;
  const lnRR = Math.log(rr);
  const se = Math.sqrt(1 / Math.max(a, 0.5) - 1 / (a + b) + 1 / Math.max(c, 0.5) - 1 / (c + d));
  const lo = Math.exp(lnRR - z * se);
  const hi = Math.exp(lnRR + z * se);
  return { rr, lo, hi };
}

// ============================================================================
// 数据加载
// ============================================================================

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
      if (!Array.isArray(raw.roundResults) || typeof raw.kendallTau !== "number") continue;
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

// ============================================================================
// 治理条件分类
// ============================================================================

type GovCondition = "none" | "full" | "other";

function classifyGovernance(run: FraudRun, filename: string): GovCondition {
  // 1. Check filename patterns
  const fn = filename.toLowerCase();
  if (fn.includes("ablation_none") || fn.includes("gov_none") || fn.includes("_none_") || fn.endsWith("_none")) {
    return "none";
  }
  if (fn.includes("ablation_full") || fn.includes("gov_full") || fn.includes("_full_") || fn.endsWith("_full")) {
    return "full";
  }

  // 2. Check JSON content: governanceEnabled
  if (typeof run.governanceEnabled === "boolean") {
    return run.governanceEnabled ? "full" : "none";
  }

  // 3. Check config.governanceEnabled or discussionConfig.governance
  const config = (run as Record<string, unknown>).config as Record<string, unknown> | undefined;
  if (config && typeof config.governanceEnabled === "boolean") {
    return config.governanceEnabled ? "full" : "none";
  }
  const discConfig = (run as Record<string, unknown>).discussionConfig as Record<string, unknown> | undefined;
  if (discConfig && typeof discConfig.governance === "boolean") {
    return discConfig.governance ? "full" : "none";
  }

  // 4. Check ablation field
  const ablation = (run as Record<string, unknown>).ablation as string | undefined;
  if (typeof ablation === "string") {
    const a = ablation.toLowerCase();
    if (a === "none") return "none";
    if (a === "full") return "full";
  }

  // 5. Fallback: if governanceTrace exists and is non-empty → governance is active
  if (Array.isArray(run.governanceTrace) && run.governanceTrace.length > 0) {
    return "full";
  }

  // 6. If no governance trace at all → no governance
  return "other";
}

// ============================================================================
// 5D 信念向量提取
// ============================================================================

function getCanonicalItems(items: ItemBelief[]): string[] {
  return items.map(it => it.item).sort();
}

function beliefVector(itemBeliefs: ItemBelief[] | undefined, canonicalItems: string[]): number[] | null {
  if (!Array.isArray(itemBeliefs) || itemBeliefs.length === 0) return null;
  const map = new Map<string, number>();
  for (const ib of itemBeliefs) {
    if (typeof ib.belief === "number") map.set(ib.item, ib.belief);
  }
  const vec: number[] = [];
  for (const item of canonicalItems) {
    if (!map.has(item)) return null;
    vec.push(map.get(item)!);
  }
  return vec;
}

interface TrajectoryPoint {
  round: number;
  agentId: string;
  vector: number[];
  isMalicious: boolean;
}

function extractTrajectory(run: FraudRun): { points: TrajectoryPoint[]; canonicalItems: string[] } {
  const maliciousSet = new Set(run.maliciousAgentIds ?? []);
  const rounds = (run.roundResults ?? []).slice().sort((a, b) =>
    (a.roundNumber ?? 0) - (b.roundNumber ?? 0)
  );
  let canonicalItems: string[] | null = null;
  for (const r of rounds) {
    for (const op of r.opinions ?? []) {
      if (Array.isArray(op.itemBeliefs) && op.itemBeliefs.length > 0) {
        canonicalItems = getCanonicalItems(op.itemBeliefs);
        break;
      }
    }
    if (canonicalItems) break;
  }
  if (!canonicalItems) return { points: [], canonicalItems: [] };

  const points: TrajectoryPoint[] = [];
  for (const r of rounds) {
    const roundNum = r.roundNumber ?? 0;
    for (const op of r.opinions ?? []) {
      const vec = beliefVector(op.itemBeliefs, canonicalItems);
      if (!vec) continue;
      points.push({
        round: roundNum,
        agentId: op.agentId,
        vector: vec,
        isMalicious: maliciousSet.has(op.agentId),
      });
    }
  }
  return { points, canonicalItems };
}

// ============================================================================
// 逃逸分析
// ============================================================================

interface RateCount {
  escapeRate: number;
  escapeCount: number;
  totalChecks: number;
}

function emptyRateCount(): RateCount {
  return { escapeRate: NaN, escapeCount: 0, totalChecks: 0 };
}

interface RunEscapeResult {
  runId: string;
  group: string;
  govCondition: GovCondition;
  isMaliciousRun: boolean;
  totalRounds: number;
  nAgents: number;
  nChecks: number;
  canonicalItems: string[];
  initialVectors: number[][];
  simplex5D: RateCount;
  byAgentType: {
    malicious: RateCount;
    honest: RateCount;
  };
  byRound: Map<number, { escapeCount: number; totalChecks: number }>;
  finalOutsideCount: number;
  finalTotal: number;
  finalOutsideRate: number;
  runEscaped: boolean; // at least 1 escape
}

function analyzeRunEscape(run: FraudRun, govCondition: GovCondition): RunEscapeResult | null {
  const { points, canonicalItems } = extractTrajectory(run);
  if (points.length === 0) return null;

  const rounds = [...new Set(points.map(p => p.round))].sort((a, b) => a - b);
  if (rounds.length < 2) return null;

  const firstRound = rounds[0];
  const initialPoints = points.filter(p => p.round === firstRound);
  const initialVectors = initialPoints.map(p => p.vector);
  if (initialVectors.length === 0) return null;

  const simplexVertices = initialVectors;
  const maliciousSet = new Set(run.maliciousAgentIds ?? []);
  const isMaliciousRun = maliciousSet.size > 0;

  const sx = emptyRateCount();
  const sx_mal = emptyRateCount();
  const sx_hon = emptyRateCount();
  const byRound = new Map<number, { escapeCount: number; totalChecks: number }>();
  let runEscaped = false;

  for (const pt of points) {
    if (pt.round === firstRound) continue;

    const sxRes = simplexMembership(pt.vector, simplexVertices);
    const sx_out = !sxRes.inside;

    sx.totalChecks++;
    if (sx_out) { sx.escapeCount++; runEscaped = true; }

    if (pt.isMalicious) {
      sx_mal.totalChecks++;
      if (sx_out) sx_mal.escapeCount++;
    } else {
      sx_hon.totalChecks++;
      if (sx_out) sx_hon.escapeCount++;
    }

    // Per-round
    if (!byRound.has(pt.round)) byRound.set(pt.round, { escapeCount: 0, totalChecks: 0 });
    const rb = byRound.get(pt.round)!;
    rb.totalChecks++;
    if (sx_out) rb.escapeCount++;
  }

  sx.escapeRate = sx.totalChecks > 0 ? sx.escapeCount / sx.totalChecks : NaN;
  sx_mal.escapeRate = sx_mal.totalChecks > 0 ? sx_mal.escapeCount / sx_mal.totalChecks : NaN;
  sx_hon.escapeRate = sx_hon.totalChecks > 0 ? sx_hon.escapeCount / sx_hon.totalChecks : NaN;

  // Final round analysis
  const finalRound = rounds[rounds.length - 1];
  const finalPoints = points.filter(p => p.round === finalRound);
  let finalOutsideCount = 0;
  for (const fp of finalPoints) {
    const sxRes = simplexMembership(fp.vector, simplexVertices);
    if (!sxRes.inside) finalOutsideCount++;
  }

  return {
    runId: run.runId ?? "unknown",
    group: run.group ?? "unknown",
    govCondition,
    isMaliciousRun,
    totalRounds: rounds.length,
    nAgents: initialPoints.length,
    nChecks: sx.totalChecks,
    canonicalItems,
    initialVectors,
    simplex5D: sx,
    byAgentType: {
      malicious: sx_mal,
      honest: sx_hon,
    },
    byRound,
    finalOutsideCount,
    finalTotal: finalPoints.length,
    finalOutsideRate: finalPoints.length > 0 ? finalOutsideCount / finalPoints.length : NaN,
    runEscaped,
  };
}

// ============================================================================
// 随机基线（marginal-preserving）
// ============================================================================

interface BaselineResult {
  simplexRate: number;
  escapeCount: number;
  totalChecks: number;
}

function baselineMarginalPreserving(run: FraudRun, rng: () => number): BaselineResult {
  const { points } = extractTrajectory(run);
  if (points.length === 0) return { simplexRate: NaN, escapeCount: 0, totalChecks: 0 };
  const rounds = [...new Set(points.map(p => p.round))].sort((a, b) => a - b);
  if (rounds.length < 2) return { simplexRate: NaN, escapeCount: 0, totalChecks: 0 };
  const firstRound = rounds[0];
  const initialVectors = points.filter(p => p.round === firstRound).map(p => p.vector);
  if (initialVectors.length === 0) return { simplexRate: NaN, escapeCount: 0, totalChecks: 0 };

  const perAgent = new Map<string, number[][]>();
  for (const pt of points) {
    if (!perAgent.has(pt.agentId)) perAgent.set(pt.agentId, []);
    perAgent.get(pt.agentId)!.push(pt.vector);
  }

  let esc = 0, total = 0;
  for (const pt of points) {
    if (pt.round === firstRound) continue;
    const vecs = perAgent.get(pt.agentId);
    if (!vecs || vecs.length === 0) continue;
    const sampled = vecs[Math.floor(rng() * vecs.length)];
    total++;
    if (!simplexMembership(sampled, initialVectors).inside) esc++;
  }
  return { simplexRate: total > 0 ? esc / total : NaN, escapeCount: esc, totalChecks: total };
}

// ============================================================================
// 工具
// ============================================================================

function fmt(n: number, digits = 4): string {
  if (typeof n !== "number" || isNaN(n)) return "NaN";
  return n.toFixed(digits);
}

function pct(n: number, digits = 1): string {
  if (typeof n !== "number" || isNaN(n)) return "NaN";
  return (n * 100).toFixed(digits) + "%";
}

function printHeader(title: string) {
  console.log("\n" + "=".repeat(78));
  console.log("  " + title);
  console.log("=".repeat(78));
}

/** 聚合一组 runs 的 simplex5D RateCount */
function aggregateSimplex(results: RunEscapeResult[]): RateCount {
  const out = emptyRateCount();
  for (const r of results) {
    out.escapeCount += r.simplex5D.escapeCount;
    out.totalChecks += r.simplex5D.totalChecks;
  }
  out.escapeRate = out.totalChecks > 0 ? out.escapeCount / out.totalChecks : NaN;
  return out;
}

/** 聚合 by-agent-type */
function aggregateAgentType(results: RunEscapeResult[], who: "malicious" | "honest"): RateCount {
  const out = emptyRateCount();
  for (const r of results) {
    if (!r.isMaliciousRun) continue;
    const rc = r.byAgentType[who];
    out.escapeCount += rc.escapeCount;
    out.totalChecks += rc.totalChecks;
  }
  out.escapeRate = out.totalChecks > 0 ? out.escapeCount / out.totalChecks : NaN;
  return out;
}

// ============================================================================
// 加载数据 & 分类
// ============================================================================

const fraudRuns = loadFraudRuns();
console.log(`\n加载 fraud enriched runs: ${fraudRuns.length}`);

// Classify governance condition
const allResults: RunEscapeResult[] = [];
const govCounts: Record<GovCondition, number> = { none: 0, full: 0, other: 0 };

for (const run of fraudRuns) {
  const filename = (run.runId ?? "") + ".json";
  const gov = classifyGovernance(run, filename);
  govCounts[gov]++;
  const r = analyzeRunEscape(run, gov);
  if (r) allResults.push(r);
}

const noneResults = allResults.filter(r => r.govCondition === "none");
const fullResults = allResults.filter(r => r.govCondition === "full");
const otherResults = allResults.filter(r => r.govCondition === "other");

console.log(`治理条件分布: none=${govCounts.none}, full=${govCounts.full}, other=${govCounts.other}`);
console.log(`成功分析 runs: ${allResults.length} (none=${noneResults.length}, full=${fullResults.length}, other=${otherResults.length})`);

// Per-run detail
console.log("\n按条件 × 分组分布:");
const detail: Record<string, Record<string, number>> = {};
for (const r of allResults) {
  const key = r.govCondition;
  if (!detail[key]) detail[key] = {};
  detail[key][r.group] = (detail[key][r.group] || 0) + 1;
}
for (const [gov, groups] of Object.entries(detail)) {
  console.log(`  ${gov}: ${JSON.stringify(groups)}`);
}

// ============================================================================
// 输出容器
// ============================================================================

const summary: Record<string, unknown> = {
  meta: {
    generatedAt: new Date().toISOString(),
    baselineSeed: BASELINE_SEED,
    description: "5D simplex escape rate by governance condition",
    method: "5D simplex: Vλ=p, λ_i≥0, Σλ_i=1 (exact)",
    governanceClassification: {
      rule: "governanceEnabled field (true=full, false=none); fallback: governanceTrace presence → full",
      counts: govCounts,
    },
    runsAnalyzed: {
      total: allResults.length,
      none: noneResults.length,
      full: fullResults.length,
      other: otherResults.length,
    },
  },
};

// ============================================================================
// Analysis 1: 5D escape rate by governance condition
// ============================================================================

printHeader("Analysis 1: 5D simplex escape rate by governance condition");

function printConditionRow(label: string, results: RunEscapeResult[]) {
  const rc = aggregateSimplex(results);
  const nRuns = results.length;
  const rate = rc.escapeRate;
  const ci = wilsonCI(rc.escapeCount, rc.totalChecks);
  const runsEscaped = results.filter(r => r.runEscaped).length;
  const runsRate = nRuns > 0 ? runsEscaped / nRuns : NaN;
  const runsCI = wilsonCI(runsEscaped, nRuns);
  console.log(
    `  ${label.padEnd(20)} n=${String(nRuns).padStart(3)}  per-check=${pct(rate).padStart(8)} (${rc.escapeCount}/${rc.totalChecks})  CI=[${pct(ci.lo,1)}, ${pct(ci.hi,1)}]  per-run=${pct(runsRate).padStart(7)} (${runsEscaped}/${nRuns})  CI=[${pct(runsCI.lo,1)}, ${pct(runsCI.hi,1)}]`
  );
  return { rc, nRuns, rate, ci, runsEscaped, runsRate, runsCI };
}

console.log("\n  | Condition  | n runs | 5D simplex escape rate | 95% CI (Wilson)       | per-run escape | 95% CI (Wilson)");
console.log("  " + "-".repeat(105));

const a1_none = printConditionRow("none", noneResults);
const a1_full = printConditionRow("full", fullResults);
const a1_other = printConditionRow("other", otherResults);
const a1_all = printConditionRow("ALL", allResults);

summary.analysis1_escape_by_gov = {
  description: "5D simplex escape rate by governance condition (per-check and per-run with Wilson CI)",
  none: { nRuns: a1_none.nRuns, perCheck: { rate: a1_none.rate, count: a1_none.rc.escapeCount, total: a1_none.rc.totalChecks, ci: a1_none.ci }, perRun: { rate: a1_none.runsRate, escaped: a1_none.runsEscaped, total: a1_none.nRuns, ci: a1_none.runsCI } },
  full: { nRuns: a1_full.nRuns, perCheck: { rate: a1_full.rate, count: a1_full.rc.escapeCount, total: a1_full.rc.totalChecks, ci: a1_full.ci }, perRun: { rate: a1_full.runsRate, escaped: a1_full.runsEscaped, total: a1_full.nRuns, ci: a1_full.runsCI } },
  other: { nRuns: a1_other.nRuns, perCheck: { rate: a1_other.rate, count: a1_other.rc.escapeCount, total: a1_other.rc.totalChecks, ci: a1_other.ci }, perRun: { rate: a1_other.runsRate, escaped: a1_other.runsEscaped, total: a1_other.nRuns, ci: a1_other.runsCI } },
  all:  { nRuns: a1_all.nRuns,  perCheck: { rate: a1_all.rate,  count: a1_all.rc.escapeCount,  total: a1_all.rc.totalChecks,  ci: a1_all.ci  }, perRun: { rate: a1_all.runsRate,  escaped: a1_all.runsEscaped,  total: a1_all.nRuns,  ci: a1_all.runsCI  } },
};

// ============================================================================
// Analysis 2: Statistical test (Fisher exact / chi-square, odds ratio, relative risk)
// ============================================================================

printHeader("Analysis 2: Statistical test — none vs full");

// Per-check 2x2 table
const noneEsc = a1_none.rc.escapeCount;
const noneNoEsc = a1_none.rc.totalChecks - a1_none.rc.escapeCount;
const fullEsc = a1_full.rc.escapeCount;
const fullNoEsc = a1_full.rc.totalChecks - a1_full.rc.escapeCount;

console.log("\n  Per-check 2x2 table:");
console.log(`           | Escape  | No Esc  | Total`);
console.log(`  none    |  ${String(noneEsc).padStart(5)}  |  ${String(noneNoEsc).padStart(5)}  | ${String(a1_none.rc.totalChecks).padStart(5)}`);
console.log(`  full    |  ${String(fullEsc).padStart(5)}  |  ${String(fullNoEsc).padStart(5)}  | ${String(a1_full.rc.totalChecks).padStart(5)}`);

const fisherCheck = fisherExact(noneEsc, noneNoEsc, fullEsc, fullNoEsc);
const chiCheck = chiSquareYates(noneEsc, noneNoEsc, fullEsc, fullNoEsc);
const orCheck = oddsRatioCI(noneEsc, noneNoEsc, fullEsc, fullNoEsc);
const rrCheck = relativeRiskCI(noneEsc, noneNoEsc, fullEsc, fullNoEsc);

console.log(`\n  Fisher's exact test (two-tailed):`);
console.log(`    p-value = ${fmt(fisherCheck.pValue, 6)}`);
console.log(`    P(observed table) = ${fmt(fisherCheck.pObserved, 6)}`);
console.log(`\n  Chi-square (Yates' correction):`);
console.log(`    χ² = ${fmt(chiCheck.chi2, 4)}, df = ${chiCheck.df}, p = ${fmt(chiCheck.pValue, 6)}`);
console.log(`\n  Odds ratio (none/full):`);
console.log(`    OR = ${fmt(orCheck.or, 4)}  95% CI = [${fmt(orCheck.lo, 4)}, ${fmt(orCheck.hi, 4)}]`);
console.log(`    ${orCheck.lo > 1 ? "✅ OR > 1 (none has higher odds of escape)" : orCheck.hi < 1 ? "⚠ OR < 1 (none has lower odds of escape)" : "≈ OR CI includes 1 (not significant)"}`);
console.log(`\n  Relative risk: P(escape|none) / P(escape|full)`);
console.log(`    RR = ${fmt(rrCheck.rr, 4)}  95% CI = [${fmt(rrCheck.lo, 4)}, ${fmt(rrCheck.hi, 4)}]`);
console.log(`    ${rrCheck.lo > 1 ? "✅ RR > 1 (none has higher escape rate)" : rrCheck.hi < 1 ? "⚠ RR < 1" : "≈ RR CI includes 1 (not significant)"}`);

// Also per-run (binary: did at least 1 escape happen?)
console.log("\n  --- Per-run (binary: at least 1 escape in run) ---");
const noneRunEsc = a1_none.runsEscaped;
const noneRunNoEsc = a1_none.nRuns - a1_none.runsEscaped;
const fullRunEsc = a1_full.runsEscaped;
const fullRunNoEsc = a1_full.nRuns - a1_full.runsEscaped;

console.log(`           | Escaped | No Esc  | Total`);
console.log(`  none    |  ${String(noneRunEsc).padStart(5)}  |  ${String(noneRunNoEsc).padStart(5)}  | ${String(a1_none.nRuns).padStart(5)}`);
console.log(`  full    |  ${String(fullRunEsc).padStart(5)}  |  ${String(fullRunNoEsc).padStart(5)}  | ${String(a1_full.nRuns).padStart(5)}`);

const fisherRun = fisherExact(noneRunEsc, noneRunNoEsc, fullRunEsc, fullRunNoEsc);
const chiRun = chiSquareYates(noneRunEsc, noneRunNoEsc, fullRunEsc, fullRunNoEsc);
const orRun = oddsRatioCI(noneRunEsc, noneRunNoEsc, fullRunEsc, fullRunNoEsc);
const rrRun = relativeRiskCI(noneRunEsc, noneRunNoEsc, fullRunEsc, fullRunNoEsc);

console.log(`\n  Fisher's exact test (per-run, two-tailed): p = ${fmt(fisherRun.pValue, 6)}`);
console.log(`  Chi-square (Yates): χ² = ${fmt(chiRun.chi2, 4)}, p = ${fmt(chiRun.pValue, 6)}`);
console.log(`  Odds ratio: OR = ${fmt(orRun.or, 4)}  95% CI = [${fmt(orRun.lo, 4)}, ${fmt(orRun.hi, 4)}]`);
console.log(`  Relative risk: RR = ${fmt(rrRun.rr, 4)}  95% CI = [${fmt(rrRun.lo, 4)}, ${fmt(rrRun.hi, 4)}]`);

summary.analysis2_stat_test = {
  description: "Fisher exact / chi-square / odds ratio / relative risk (none vs full)",
  perCheck: {
    table: { none: { escape: noneEsc, noEscape: noneNoEsc, total: a1_none.rc.totalChecks }, full: { escape: fullEsc, noEscape: fullNoEsc, total: a1_full.rc.totalChecks } },
    fisherExact: { pValue: fisherCheck.pValue, pObserved: fisherCheck.pObserved },
    chiSquareYates: { chi2: chiCheck.chi2, df: chiCheck.df, pValue: chiCheck.pValue },
    oddsRatio: orCheck,
    relativeRisk: rrCheck,
  },
  perRun: {
    table: { none: { escape: noneRunEsc, noEscape: noneRunNoEsc, total: a1_none.nRuns }, full: { escape: fullRunEsc, noEscape: fullRunNoEsc, total: a1_full.nRuns } },
    fisherExact: { pValue: fisherRun.pValue, pObserved: fisherRun.pObserved },
    chiSquareYates: { chi2: chiRun.chi2, df: chiRun.df, pValue: chiRun.pValue },
    oddsRatio: orRun,
    relativeRisk: rrRun,
  },
};

// ============================================================================
// Analysis 3: Random baseline (marginal-preserving) per condition
// ============================================================================

printHeader("Analysis 3: Random baseline (marginal-preserving, mulberry32 seed=42) per condition");

const baselineRng = mulberry32(BASELINE_SEED);

interface BaselineAgg {
  escapeCount: number;
  totalChecks: number;
  nRuns: number;
}

function emptyBaselineAgg(): BaselineAgg {
  return { escapeCount: 0, totalChecks: 0, nRuns: 0 };
}

function baselineRate(ba: BaselineAgg): number {
  return ba.totalChecks > 0 ? ba.escapeCount / ba.totalChecks : NaN;
}

// Build a map from runId to run for baseline computation
const runById = new Map(fraudRuns.map(r => [(r.runId ?? "unknown"), r]));

function computeBaselineForCondition(results: RunEscapeResult[], rng: () => number): BaselineAgg {
  const agg = emptyBaselineAgg();
  for (const r of results) {
    const run = runById.get(r.runId);
    if (!run) continue;
    const b = baselineMarginalPreserving(run, rng);
    agg.escapeCount += b.escapeCount;
    agg.totalChecks += b.totalChecks;
    agg.nRuns++;
  }
  return agg;
}

const realNone = a1_none.rc;
const realFull = a1_full.rc;
const baselineNone = computeBaselineForCondition(noneResults, baselineRng);
const baselineFull = computeBaselineForCondition(fullResults, baselineRng);

const realNoneRate = realNone.escapeRate;
const realFullRate = realFull.escapeRate;
const baselineNoneRate = baselineRate(baselineNone);
const baselineFullRate = baselineRate(baselineFull);

console.log("\n  | Condition | Real 5D escape       | Random baseline      | Real - Random (pp) |");
console.log("  " + "-".repeat(75));
console.log(`  | none      | ${pct(realNoneRate).padStart(8)} (${realNone.escapeCount}/${realNone.totalChecks}) | ${pct(baselineNoneRate).padStart(8)} (${baselineNone.escapeCount}/${baselineNone.totalChecks}) | ${((realNoneRate - baselineNoneRate) * 100).toFixed(2).padStart(6)} pp        |`);
console.log(`  | full      | ${pct(realFullRate).padStart(8)} (${realFull.escapeCount}/${realFull.totalChecks}) | ${pct(baselineFullRate).padStart(8)} (${baselineFull.escapeCount}/${baselineFull.totalChecks}) | ${((realFullRate - baselineFullRate) * 100).toFixed(2).padStart(6)} pp        |`);

console.log("\n  解读:");
const noneDiff = realNoneRate - baselineNoneRate;
const fullDiff = realFullRate - baselineFullRate;
console.log(`    none: real - random = ${(noneDiff * 100).toFixed(2)} pp  ${noneDiff > 0.05 ? "→ real > baseline" : noneDiff < -0.05 ? "→ real < baseline" : "→ real ≈ baseline"}`);
console.log(`    full: real - random = ${(fullDiff * 100).toFixed(2)} pp  ${fullDiff > 0.05 ? "→ real > baseline" : fullDiff < -0.05 ? "→ real < baseline" : "→ real ≈ baseline"}`);

if (realFullRate < baselineFullRate) {
  console.log(`    ⚠ full 治理下真实逃逸率低于随机基线 → 治理不仅压制逃逸，还低于偶然水平`);
} else if (realFullRate < realNoneRate) {
  console.log(`    ✅ full 治理下真实逃逸率低于 none，但仍高于随机基线 → 治理压制但未低于偶然`);
} else {
  console.log(`    ≈ full 与 none 逃逸率相近`);
}

summary.analysis3_random_baseline = {
  description: "Marginal-preserving random baseline per condition (mulberry32 seed=42)",
  none: {
    real: { rate: realNoneRate, escapeCount: realNone.escapeCount, totalChecks: realNone.totalChecks },
    random: { rate: baselineNoneRate, escapeCount: baselineNone.escapeCount, totalChecks: baselineNone.totalChecks, nRuns: baselineNone.nRuns },
    diff: noneDiff,
  },
  full: {
    real: { rate: realFullRate, escapeCount: realFull.escapeCount, totalChecks: realFull.totalChecks },
    random: { rate: baselineFullRate, escapeCount: baselineFull.escapeCount, totalChecks: baselineFull.totalChecks, nRuns: baselineFull.nRuns },
    diff: fullDiff,
  },
};

// ============================================================================
// Analysis 4: Final-round convergence analysis
// ============================================================================

printHeader("Analysis 4: Final-round convergence analysis (5D simplex)");

function finalRoundStats(results: RunEscapeResult[]): { runsWithEscape: number; nRuns: number; runRate: number; totalAgents: number; outsideAgents: number; agentRate: number } {
  const runsWithEscape = results.filter(r => r.finalOutsideCount > 0).length;
  const nRuns = results.length;
  const runRate = nRuns > 0 ? runsWithEscape / nRuns : NaN;
  let totalAgents = 0, outsideAgents = 0;
  for (const r of results) {
    totalAgents += r.finalTotal;
    outsideAgents += r.finalOutsideCount;
  }
  const agentRate = totalAgents > 0 ? outsideAgents / totalAgents : NaN;
  return { runsWithEscape, nRuns, runRate, totalAgents, outsideAgents, agentRate };
}

const finalNone = finalRoundStats(noneResults);
const finalFull = finalRoundStats(fullResults);
const finalOther = finalRoundStats(otherResults);
const finalAll = finalRoundStats(allResults);

console.log("\n  | Condition | % runs with final escape | % final agents outside |");
console.log("  " + "-".repeat(60));
console.log(`  | none      | ${pct(finalNone.runRate).padStart(8)} (${finalNone.runsWithEscape}/${finalNone.nRuns})      | ${pct(finalNone.agentRate).padStart(8)} (${finalNone.outsideAgents}/${finalNone.totalAgents})    |`);
console.log(`  | full      | ${pct(finalFull.runRate).padStart(8)} (${finalFull.runsWithEscape}/${finalFull.nRuns})      | ${pct(finalFull.agentRate).padStart(8)} (${finalFull.outsideAgents}/${finalFull.totalAgents})    |`);
console.log(`  | other     | ${pct(finalOther.runRate).padStart(8)} (${finalOther.runsWithEscape}/${finalOther.nRuns})      | ${pct(finalOther.agentRate).padStart(8)} (${finalOther.outsideAgents}/${finalOther.totalAgents})    |`);
console.log(`  | ALL       | ${pct(finalAll.runRate).padStart(8)} (${finalAll.runsWithEscape}/${finalAll.nRuns})      | ${pct(finalAll.agentRate).padStart(8)} (${finalAll.outsideAgents}/${finalAll.totalAgents})    |`);

summary.analysis4_final_round = {
  description: "Final-round beliefs inside/outside initial 5D simplex",
  none: finalNone,
  full: finalFull,
  other: finalOther,
  all: finalAll,
};

// ============================================================================
// Analysis 5: Per-agent-type in malicious runs (malicious vs honest)
// ============================================================================

printHeader("Analysis 5: Per-agent-type in malicious runs (malicious vs honest)");

const malNoneResults = noneResults.filter(r => r.isMaliciousRun);
const malFullResults = fullResults.filter(r => r.isMaliciousRun);

console.log(`\n  Malicious runs by condition: none=${malNoneResults.length}, full=${malFullResults.length}`);

const malNone_mal = aggregateAgentType(malNoneResults, "malicious");
const malNone_hon = aggregateAgentType(malNoneResults, "honest");
const malFull_mal = aggregateAgentType(malFullResults, "malicious");
const malFull_hon = aggregateAgentType(malFullResults, "honest");

console.log("\n  | Condition | Agent type | 5D simplex escape rate             |");
console.log("  " + "-".repeat(65));
console.log(`  | none      | malicious  | ${pct(malNone_mal.escapeRate).padStart(8)} (${malNone_mal.escapeCount}/${malNone_mal.totalChecks})   |`);
console.log(`  | none      | honest     | ${pct(malNone_hon.escapeRate).padStart(8)} (${malNone_hon.escapeCount}/${malNone_hon.totalChecks})   |`);
console.log(`  | full      | malicious  | ${pct(malFull_mal.escapeRate).padStart(8)} (${malFull_mal.escapeCount}/${malFull_mal.totalChecks})   |`);
console.log(`  | full      | honest     | ${pct(malFull_hon.escapeRate).padStart(8)} (${malFull_hon.escapeCount}/${malFull_hon.totalChecks})   |`);

console.log("\n  解读:");
if (malFull_mal.escapeRate < malNone_mal.escapeRate) {
  console.log(`    恶意 agent: full (${pct(malFull_mal.escapeRate)}) < none (${pct(malNone_mal.escapeRate)}) → 治理压制恶意 agent 逃逸`);
} else {
  console.log(`    恶意 agent: full (${pct(malFull_mal.escapeRate)}) ≥ none (${pct(malNone_mal.escapeRate)}) → 治理未压制恶意 agent 逃逸`);
}
if (malFull_hon.escapeRate < malNone_hon.escapeRate) {
  console.log(`    诚实 agent: full (${pct(malFull_hon.escapeRate)}) < none (${pct(malNone_hon.escapeRate)}) → 治理压制诚实 agent 逃逸`);
} else {
  console.log(`    诚实 agent: full (${pct(malFull_hon.escapeRate)}) ≥ none (${pct(malNone_hon.escapeRate)}) → 治理未压制诚实 agent 逃逸`);
}

summary.analysis5_agent_type = {
  description: "Per-agent-type 5D escape in malicious runs",
  noneRuns: malNoneResults.length,
  fullRuns: malFullResults.length,
  none: { malicious: malNone_mal, honest: malNone_hon },
  full: { malicious: malFull_mal, honest: malFull_hon },
};

// ============================================================================
// Analysis 6: Per-round escape rate
// ============================================================================

printHeader("Analysis 6: Per-round escape rate by condition");

// Collect all rounds
const allRoundsSet = new Set<number>();
for (const r of allResults) {
  for (const rn of r.byRound.keys()) allRoundsSet.add(rn);
}
const allRounds = [...allRoundsSet].sort((a, b) => a - b);

console.log(`\n  Rounds found: ${allRounds.join(", ")}`);
console.log("\n  | Round | none 5D escape                    | full 5D escape                    |");
console.log("  " + "-".repeat(80));

const perRoundData: Array<{ round: number; none: RateCount; full: RateCount }> = [];

for (const rn of allRounds) {
  const noneRc = emptyRateCount();
  const fullRc = emptyRateCount();
  for (const r of noneResults) {
    const rb = r.byRound.get(rn);
    if (rb) { noneRc.escapeCount += rb.escapeCount; noneRc.totalChecks += rb.totalChecks; }
  }
  for (const r of fullResults) {
    const rb = r.byRound.get(rn);
    if (rb) { fullRc.escapeCount += rb.escapeCount; fullRc.totalChecks += rb.totalChecks; }
  }
  noneRc.escapeRate = noneRc.totalChecks > 0 ? noneRc.escapeCount / noneRc.totalChecks : NaN;
  fullRc.escapeRate = fullRc.totalChecks > 0 ? fullRc.escapeCount / fullRc.totalChecks : NaN;

  const noneStr = noneRc.totalChecks > 0
    ? `${pct(noneRc.escapeRate).padStart(8)} (${noneRc.escapeCount}/${noneRc.totalChecks})`
    : "n/a".padStart(20);
  const fullStr = fullRc.totalChecks > 0
    ? `${pct(fullRc.escapeRate).padStart(8)} (${fullRc.escapeCount}/${fullRc.totalChecks})`
    : "n/a".padStart(20);
  console.log(`  | ${String(rn).padStart(5)} | ${noneStr.padEnd(30)} | ${fullStr.padEnd(30)} |`);
  perRoundData.push({ round: rn, none: noneRc, full: fullRc });
}

console.log("\n  解读 (temporal dynamics):");
const earlyRounds = perRoundData.filter(d => d.round <= 3);
const lateRounds = perRoundData.filter(d => d.round >= 4);
const earlyNoneRate = earlyRounds.length > 0
  ? earlyRounds.reduce((s, d) => s + d.none.escapeCount, 0) / Math.max(1, earlyRounds.reduce((s, d) => s + d.none.totalChecks, 0))
  : NaN;
const earlyFullRate = earlyRounds.length > 0
  ? earlyRounds.reduce((s, d) => s + d.full.escapeCount, 0) / Math.max(1, earlyRounds.reduce((s, d) => s + d.full.totalChecks, 0))
  : NaN;
const lateNoneRate = lateRounds.length > 0
  ? lateRounds.reduce((s, d) => s + d.none.escapeCount, 0) / Math.max(1, lateRounds.reduce((s, d) => s + d.none.totalChecks, 0))
  : NaN;
const lateFullRate = lateRounds.length > 0
  ? lateRounds.reduce((s, d) => s + d.full.escapeCount, 0) / Math.max(1, lateRounds.reduce((s, d) => s + d.full.totalChecks, 0))
  : NaN;

console.log(`    Early rounds (≤3): none=${pct(earlyNoneRate)}, full=${pct(earlyFullRate)}, diff=${((earlyNoneRate - earlyFullRate) * 100).toFixed(2)} pp`);
console.log(`    Late rounds  (≥4): none=${pct(lateNoneRate)}, full=${pct(lateFullRate)}, diff=${((lateNoneRate - lateFullRate) * 100).toFixed(2)} pp`);

if (!isNaN(earlyNoneRate) && !isNaN(earlyFullRate) && earlyNoneRate - earlyFullRate > 0.05) {
  console.log(`    → 治理在早期轮次 (≤3) 压制逃逸`);
}
if (!isNaN(lateNoneRate) && !isNaN(lateFullRate) && lateNoneRate - lateFullRate > 0.05) {
  console.log(`    → 治理在晚期轮次 (≥4) 压制逃逸`);
}

summary.analysis6_per_round = {
  description: "Per-round 5D escape rate by condition",
  rounds: perRoundData,
  earlyRounds: { range: "≤3", none: { rate: earlyNoneRate }, full: { rate: earlyFullRate } },
  lateRounds: { range: "≥4", none: { rate: lateNoneRate }, full: { rate: lateFullRate } },
};

// ============================================================================
// Critical Questions Summary
// ============================================================================

printHeader("Critical Questions Summary");

console.log("\n  Q1: Does governance suppress 5D escape? (Is full < none?)");
console.log(`    none: ${pct(realNoneRate)} (${a1_none.rc.escapeCount}/${a1_none.rc.totalChecks})`);
console.log(`    full: ${pct(realFullRate)} (${a1_full.rc.escapeCount}/${a1_full.rc.totalChecks})`);
const q1Diff = realNoneRate - realFullRate;
console.log(`    Difference: ${(q1Diff * 100).toFixed(2)} pp`);
if (q1Diff > 0.05) {
  console.log(`    ✅ YES — governance suppresses 5D escape (none > full by ${(q1Diff * 100).toFixed(1)} pp)`);
} else if (q1Diff < -0.05) {
  console.log(`    ⚠ NO — full has HIGHER escape than none (governance may increase escape)`);
} else {
  console.log(`    ≈ No significant difference between none and full`);
}

console.log("\n  Q2: Is the suppression statistically significant?");
console.log(`    Fisher exact (per-check): p = ${fmt(fisherCheck.pValue, 6)}`);
console.log(`    Fisher exact (per-run):  p = ${fmt(fisherRun.pValue, 6)}`);
console.log(`    Chi-square (per-check):  p = ${fmt(chiCheck.pValue, 6)}`);
console.log(`    Odds ratio (per-check):  OR = ${fmt(orCheck.or, 4)}  CI = [${fmt(orCheck.lo, 4)}, ${fmt(orCheck.hi, 4)}]`);
console.log(`    Relative risk:           RR = ${fmt(rrCheck.rr, 4)}  CI = [${fmt(rrCheck.lo, 4)}, ${fmt(rrCheck.hi, 4)}]`);
if (fisherCheck.pValue < 0.05) {
  console.log(`    ✅ Significant at p < 0.05 (Fisher per-check)`);
} else {
  console.log(`    ❌ NOT significant at p < 0.05 (Fisher per-check)`);
}

console.log("\n  Q3: Is the suppression above random baseline? (Does full go BELOW random baseline?)");
console.log(`    none: real=${pct(realNoneRate)}, random=${pct(baselineNoneRate)}, diff=${(noneDiff * 100).toFixed(2)} pp`);
console.log(`    full: real=${pct(realFullRate)}, random=${pct(baselineFullRate)}, diff=${(fullDiff * 100).toFixed(2)} pp`);
if (realFullRate < baselineFullRate) {
  console.log(`    ⚠ full 治理下真实逃逸率低于随机基线 → 治理将逃逸压到偶然水平以下`);
} else if (q1Diff > 0.05) {
  console.log(`    ✅ 治理压制了逃逸，但 full 仍高于随机基线 → 治理未完全消除逃逸`);
} else {
  console.log(`    ≈ 治理效果与随机基线相当`);
}

console.log("\n  Q4: Does governance affect malicious vs honest agents differently?");
console.log(`    Malicious agents: none=${pct(malNone_mal.escapeRate)}, full=${pct(malFull_mal.escapeRate)}, diff=${((malNone_mal.escapeRate - malFull_mal.escapeRate) * 100).toFixed(2)} pp`);
console.log(`    Honest agents:    none=${pct(malNone_hon.escapeRate)}, full=${pct(malFull_hon.escapeRate)}, diff=${((malNone_hon.escapeRate - malFull_hon.escapeRate) * 100).toFixed(2)} pp`);
const malSuppDiff = malNone_mal.escapeRate - malFull_mal.escapeRate;
const honSuppDiff = malNone_hon.escapeRate - malFull_hon.escapeRate;
if (malSuppDiff > honSuppDiff + 0.05) {
  console.log(`    → 治理对恶意 agent 的压制更强 (差 ${(malSuppDiff - honSuppDiff).toFixed(2)} pp)`);
} else if (honSuppDiff > malSuppDiff + 0.05) {
  console.log(`    → 治理对诚实 agent 的压制更强 (差 ${(honSuppDiff - malSuppDiff).toFixed(2)} pp)`);
} else {
  console.log(`    → 治理对两类 agent 的压制效果相近`);
}

console.log("\n  Q5: Does governance suppress escape in early rounds (2-3) or late rounds (4-6)?");
console.log(`    Early (≤3): none=${pct(earlyNoneRate)}, full=${pct(earlyFullRate)}, suppression=${((earlyNoneRate - earlyFullRate) * 100).toFixed(2)} pp`);
console.log(`    Late  (≥4): none=${pct(lateNoneRate)}, full=${pct(lateFullRate)}, suppression=${((lateNoneRate - lateFullRate) * 100).toFixed(2)} pp`);
const earlySupp = earlyNoneRate - earlyFullRate;
const lateSupp = lateNoneRate - lateFullRate;
if (earlySupp > lateSupp + 0.05) {
  console.log(`    → 治理主要在早期轮次压制逃逸`);
} else if (lateSupp > earlySupp + 0.05) {
  console.log(`    → 治理主要在晚期轮次压制逃逸`);
} else {
  console.log(`    → 治理在早期和晚期均有压制效果`);
}

summary.critical_questions = {
  q1_governance_suppresses_5d: {
    noneRate: realNoneRate,
    fullRate: realFullRate,
    difference: q1Diff,
    suppresses: q1Diff > 0.05,
  },
  q2_statistically_significant: {
    fisherPerCheck: fisherCheck.pValue,
    fisherPerRun: fisherRun.pValue,
    chiSquarePerCheck: chiCheck.pValue,
    oddsRatio: orCheck,
    relativeRisk: rrCheck,
    significant: fisherCheck.pValue < 0.05,
  },
  q3_above_random_baseline: {
    noneReal: realNoneRate,
    noneRandom: baselineNoneRate,
    noneDiff: noneDiff,
    fullReal: realFullRate,
    fullRandom: baselineFullRate,
    fullDiff: fullDiff,
    fullBelowBaseline: realFullRate < baselineFullRate,
  },
  q4_malicious_vs_honest: {
    malicious: { none: malNone_mal.escapeRate, full: malFull_mal.escapeRate, diff: malSuppDiff },
    honest: { none: malNone_hon.escapeRate, full: malFull_hon.escapeRate, diff: honSuppDiff },
  },
  q5_early_vs_late: {
    early: { none: earlyNoneRate, full: earlyFullRate, suppression: earlySupp },
    late: { none: lateNoneRate, full: lateFullRate, suppression: lateSupp },
  },
};

// ============================================================================
// 保存 JSON
// ============================================================================

const resultsDir = path.join(V2_DIR, "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
const outPath = path.join(resultsDir, "analyze_5d_governance_escape.json");
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf-8");

console.log("\n" + "=".repeat(78));
console.log(`  JSON 摘要已保存: ${path.relative(process.cwd(), outPath)}`);
console.log("=".repeat(78));
