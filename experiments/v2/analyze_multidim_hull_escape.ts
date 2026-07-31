/**
 * Multi-dimensional Convex Hull Escape Analysis (fraud 38 async enriched runs)
 *
 * 背景：
 *   之前 1D 凸包逃逸率（标量 belief 的 [min,max]）：
 *     sync: 14.2%, async: 21.1%
 *     malicious async: 0%, non-malicious async: 66.7%
 *   1D hull 太宽松——多维凸包（基于 itemBeliefs 向量）才是真正的检验。
 *   高维空间下随机游走可能"看起来"逃逸，故必须有随机基线。
 *
 * 三种 hull 检验（精度递增）：
 *   1. 1D scalar:  b_i(t) ∉ [min_j b_j(0), max_j b_j(0)]  (旧方法，对比基准)
 *   2. 5D bounding box:  u_i(t) 在任意一维超出 [min_j u_j(0), max_j u_j(0)]
 *      ——hull 逃逸的必要条件（超出 bbox 一定超出 hull）
 *   3. 5D simplex (exact):  5 个顶点在 5D 中形成 4-simplex，解 Vλ=p，要求 λ_i≥0, Σλ_i=1
 *      ——hull 逃逸的充分必要条件
 *
 * 5 项分析：
 *   1. 多维逃逸率（按 method × run/agent 类型）
 *   2. 随机基线（marginal-preserving / bootstrap / shuffle）——防止假阳性
 *   3. 哪些维度逃逸（每次逃逸事件中超出 bbox 的维度）
 *   4. 恶意 vs 诚实机制（恶意 agent 是否逃逸？诚实 agent 朝恶意偏好方向移动？）
 *   5. Hidden Anchors 检验（最终轮是否在初始 hull 之外且稳定？）
 *
 * 运行：npx tsx experiments/v2/analyze_multidim_hull_escape.ts
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
  roundResults?: RoundResult[];
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
// Hull 检验
// ============================================================================

interface SimplexResult {
  inside: boolean;
  reason: string;
  lambda?: number[];
  sumLambda?: number;
}

/** Bounding box 检验：p 是否在 vertices 的逐维 min/max 内 */
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
 * 若 V 奇异/非方阵（退化的 simplex），退化为 bbox 检验。
 */
function simplexMembership(p: number[], vertices: number[][]): SimplexResult {
  const n = vertices.length;
  if (n === 0) return { inside: false, reason: "no_vertices" };
  const dim = vertices[0].length;
  if (dim !== n) {
    return { inside: inBoundingBox(p, vertices), reason: "non_square_use_bbox" };
  }
  // V[j][i] = vertices[i][j]，使 Vλ = Σ λ_i v_i
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
    lambda,
    sumLambda,
  };
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
  vector: number[];      // 5D 信念向量
  scalarBelief: number;  // opinions[].belief（用于 1D 比较）
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
      if (typeof op.belief !== "number") continue;
      const vec = beliefVector(op.itemBeliefs, canonicalItems);
      if (!vec) continue;
      points.push({
        round: roundNum,
        agentId: op.agentId,
        vector: vec,
        scalarBelief: op.belief,
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
  escapeRate: number;     // per-check 逃逸率
  escapeCount: number;
  totalChecks: number;
  runsEscaped: number;    // 至少逃逸一次的 run 数（仅当此 run 被分析时累加）
  runsTotal: number;
}

interface EscapeEvent {
  round: number;
  agentId: string;
  isMalicious: boolean;
  method: "scalar1D" | "bbox5D" | "simplex5D";
  vector: number[];
  scalarBelief: number;
  outsideDims: number[];     // bbox 超出的维度（method=simplex5D 也记录供分析 3 使用）
  simplexReason?: string;
  lambda?: number[];
  sumLambda?: number;
}

interface RunEscapeResult {
  runId: string;
  isMaliciousRun: boolean;
  totalRounds: number;
  nAgents: number;
  nChecks: number;            // t>1 的 (agent, round) 总数
  canonicalItems: string[];
  initialVectors: number[][];
  scalar1D: RateCount;
  bbox5D: RateCount;
  simplex5D: RateCount;
  byAgentType: {
    malicious: { scalar1D: RateCount; bbox5D: RateCount; simplex5D: RateCount };
    honest: { scalar1D: RateCount; bbox5D: RateCount; simplex5D: RateCount };
  };
  escapes: EscapeEvent[];
  // Analysis 5: 最终轮
  finalOutsideCount: number;
  finalTotal: number;
  finalOutsideRate: number;
  // Analysis 4: 恶意 agent 偏好 item（round 1 |belief| 最大的 item 索引）
  maliciousPreferredItemIdx: number | null;
  maliciousPreferredItemName: string | null;
}

function emptyRateCount(): RateCount {
  return { escapeRate: NaN, escapeCount: 0, totalChecks: 0, runsEscaped: 0, runsTotal: 0 };
}

function accumulateRate(rc: RateCount, escaped: boolean) {
  rc.totalChecks++;
  if (escaped) rc.escapeCount++;
}

function finalizeRate(rc: RateCount) {
  rc.escapeRate = rc.totalChecks > 0 ? rc.escapeCount / rc.totalChecks : NaN;
}

function analyzeRunEscape(run: FraudRun): RunEscapeResult | null {
  const { points, canonicalItems } = extractTrajectory(run);
  if (points.length === 0) return null;

  const rounds = [...new Set(points.map(p => p.round))].sort((a, b) => a - b);
  if (rounds.length < 2) return null;

  const firstRound = rounds[0];
  const initialPoints = points.filter(p => p.round === firstRound);
  const initialVectors = initialPoints.map(p => p.vector);
  if (initialVectors.length === 0) return null;

  // 1D scalar hull: [min_j b_j(0), max_j b_j(0)]
  const scalarBeliefs0 = initialPoints.map(p => p.scalarBelief);
  const scalarMin = Math.min(...scalarBeliefs0);
  const scalarMax = Math.max(...scalarBeliefs0);

  // 5D bounding box: 逐维 min/max
  const dim = canonicalItems.length;
  const bboxMin: number[] = [];
  const bboxMax: number[] = [];
  for (let d = 0; d < dim; d++) {
    bboxMin.push(Math.min(...initialVectors.map(v => v[d])));
    bboxMax.push(Math.max(...initialVectors.map(v => v[d])));
  }

  // 5D simplex 顶点
  const simplexVertices = initialVectors;

  const maliciousSet = new Set(run.maliciousAgentIds ?? []);
  const isMaliciousRun = maliciousSet.size > 0;

  // 初始化计数器
  const s1 = emptyRateCount();
  const bb = emptyRateCount();
  const sx = emptyRateCount();
  const s1_mal = emptyRateCount();
  const s1_hon = emptyRateCount();
  const bb_mal = emptyRateCount();
  const bb_hon = emptyRateCount();
  const sx_mal = emptyRateCount();
  const sx_hon = emptyRateCount();

  const escapes: EscapeEvent[] = [];
  let runEscapedS1 = false, runEscapedBB = false, runEscapedSX = false;
  let nChecks = 0;

  for (const pt of points) {
    if (pt.round === firstRound) continue;
    nChecks++;

    // 1D scalar
    const s1_out = pt.scalarBelief < scalarMin - 1e-9 || pt.scalarBelief > scalarMax + 1e-9;
    accumulateRate(s1, s1_out);
    if (pt.isMalicious) accumulateRate(s1_mal, s1_out); else accumulateRate(s1_hon, s1_out);
    if (s1_out) {
      runEscapedS1 = true;
      escapes.push({
        round: pt.round, agentId: pt.agentId, isMalicious: pt.isMalicious,
        method: "scalar1D", vector: pt.vector, scalarBelief: pt.scalarBelief, outsideDims: [],
      });
    }

    // 5D bounding box
    const outsideDims: number[] = [];
    let bb_out = false;
    for (let d = 0; d < dim; d++) {
      if (pt.vector[d] < bboxMin[d] - 1e-9 || pt.vector[d] > bboxMax[d] + 1e-9) {
        bb_out = true; outsideDims.push(d);
      }
    }
    accumulateRate(bb, bb_out);
    if (pt.isMalicious) accumulateRate(bb_mal, bb_out); else accumulateRate(bb_hon, bb_out);
    if (bb_out) {
      runEscapedBB = true;
      escapes.push({
        round: pt.round, agentId: pt.agentId, isMalicious: pt.isMalicious,
        method: "bbox5D", vector: pt.vector, scalarBelief: pt.scalarBelief, outsideDims,
      });
    }

    // 5D simplex
    const sxRes = simplexMembership(pt.vector, simplexVertices);
    const sx_out = !sxRes.inside;
    accumulateRate(sx, sx_out);
    if (pt.isMalicious) accumulateRate(sx_mal, sx_out); else accumulateRate(sx_hon, sx_out);
    if (sx_out) {
      runEscapedSX = true;
      escapes.push({
        round: pt.round, agentId: pt.agentId, isMalicious: pt.isMalicious,
        method: "simplex5D", vector: pt.vector, scalarBelief: pt.scalarBelief,
        outsideDims, simplexReason: sxRes.reason, lambda: sxRes.lambda, sumLambda: sxRes.sumLambda,
      });
    }
  }

  // finalize per-check rates
  for (const rc of [s1, bb, sx, s1_mal, s1_hon, bb_mal, bb_hon, sx_mal, sx_hon]) finalizeRate(rc);

  // per-run counters
  s1.runsEscaped = runEscapedS1 ? 1 : 0; s1.runsTotal = 1;
  bb.runsEscaped = runEscapedBB ? 1 : 0; bb.runsTotal = 1;
  sx.runsEscaped = runEscapedSX ? 1 : 0; sx.runsTotal = 1;

  // Analysis 5: 最终轮是否在初始 hull 之外
  const finalRound = rounds[rounds.length - 1];
  const finalPoints = points.filter(p => p.round === finalRound);
  let finalOutsideCount = 0;
  for (const fp of finalPoints) {
    const sxRes = simplexMembership(fp.vector, simplexVertices);
    if (!sxRes.inside) finalOutsideCount++;
  }

  // Analysis 4: 恶意 agent 偏好 item（round 1 |belief| 最大的 item）
  let maliciousPreferredItemIdx: number | null = null;
  let maliciousPreferredItemName: string | null = null;
  if (isMaliciousRun) {
    // 取第一个恶意 agent 在 round 1 的向量
    const maliciousInitial = initialPoints.find(p => maliciousSet.has(p.agentId));
    if (maliciousInitial) {
      let maxAbs = -Infinity;
      for (let d = 0; d < dim; d++) {
        if (Math.abs(maliciousInitial.vector[d]) > maxAbs) {
          maxAbs = Math.abs(maliciousInitial.vector[d]);
          maliciousPreferredItemIdx = d;
          maliciousPreferredItemName = canonicalItems[d];
        }
      }
    }
  }

  return {
    runId: run.runId ?? "unknown",
    isMaliciousRun,
    totalRounds: rounds.length,
    nAgents: initialPoints.length,
    nChecks,
    canonicalItems,
    initialVectors,
    scalar1D: s1,
    bbox5D: bb,
    simplex5D: sx,
    byAgentType: {
      malicious: { scalar1D: s1_mal, bbox5D: bb_mal, simplex5D: sx_mal },
      honest: { scalar1D: s1_hon, bbox5D: bb_hon, simplex5D: sx_hon },
    },
    escapes,
    finalOutsideCount,
    finalTotal: finalPoints.length,
    finalOutsideRate: finalPoints.length > 0 ? finalOutsideCount / finalPoints.length : NaN,
    maliciousPreferredItemIdx,
    maliciousPreferredItemName,
  };
}

// ============================================================================
// 基线（随机逃逸率）
// ============================================================================

interface BaselineResult {
  simplexRate: number;       // per-check 逃逸率
  escapeCount: number;
  totalChecks: number;
}

/** Marginal-preserving：每个 agent 从自己的经验分布（跨所有轮）采样信念向量 */
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

/** Bootstrap：从所有 agent 所有轮次的信念向量池中采样 */
function baselineBootstrap(run: FraudRun, rng: () => number): BaselineResult {
  const { points } = extractTrajectory(run);
  if (points.length === 0) return { simplexRate: NaN, escapeCount: 0, totalChecks: 0 };
  const rounds = [...new Set(points.map(p => p.round))].sort((a, b) => a - b);
  if (rounds.length < 2) return { simplexRate: NaN, escapeCount: 0, totalChecks: 0 };
  const firstRound = rounds[0];
  const initialVectors = points.filter(p => p.round === firstRound).map(p => p.vector);
  if (initialVectors.length === 0) return { simplexRate: NaN, escapeCount: 0, totalChecks: 0 };

  const allVectors = points.map(p => p.vector);
  if (allVectors.length === 0) return { simplexRate: NaN, escapeCount: 0, totalChecks: 0 };

  let esc = 0, total = 0;
  for (const pt of points) {
    if (pt.round === firstRound) continue;
    const sampled = allVectors[Math.floor(rng() * allVectors.length)];
    total++;
    if (!simplexMembership(sampled, initialVectors).inside) esc++;
  }
  return { simplexRate: total > 0 ? esc / total : NaN, escapeCount: esc, totalChecks: total };
}

/** Shuffle temporal：每个 agent 的轨迹跨轮打乱，用打乱后的"第一轮"作为 hull */
function baselineShuffleTemporal(run: FraudRun, rng: () => number): BaselineResult {
  const { points } = extractTrajectory(run);
  if (points.length === 0) return { simplexRate: NaN, escapeCount: 0, totalChecks: 0 };
  const rounds = [...new Set(points.map(p => p.round))].sort((a, b) => a - b);
  if (rounds.length < 2) return { simplexRate: NaN, escapeCount: 0, totalChecks: 0 };

  // 每个 agent 独立地跨轮打乱向量
  const perAgent = new Map<string, { round: number; vector: number[] }[]>();
  for (const pt of points) {
    if (!perAgent.has(pt.agentId)) perAgent.set(pt.agentId, []);
    perAgent.get(pt.agentId)!.push({ round: pt.round, vector: pt.vector });
  }

  const shuffledByRound = new Map<number, Map<string, number[]>>();
  for (const [agentId, traj] of perAgent.entries()) {
    const shuffled = traj.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (let i = 0; i < traj.length; i++) {
      const rn = traj[i].round;
      if (!shuffledByRound.has(rn)) shuffledByRound.set(rn, new Map());
      shuffledByRound.get(rn)!.set(agentId, shuffled[i].vector);
    }
  }

  const firstRound = rounds[0];
  const initialShuffled = shuffledByRound.get(firstRound);
  if (!initialShuffled || initialShuffled.size === 0) {
    return { simplexRate: NaN, escapeCount: 0, totalChecks: 0 };
  }
  const initialVectors = [...initialShuffled.values()];

  let esc = 0, total = 0;
  for (const rn of rounds) {
    if (rn === firstRound) continue;
    const roundMap = shuffledByRound.get(rn);
    if (!roundMap) continue;
    for (const vec of roundMap.values()) {
      total++;
      if (!simplexMembership(vec, initialVectors).inside) esc++;
    }
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

/** 聚合一组 runs 的 RateCount：累加 escapeCount/totalChecks，runsEscaped/runsTotal */
function aggregateRate(runs: RunEscapeResult[], pick: (r: RunEscapeResult) => RateCount): RateCount {
  const out = emptyRateCount();
  for (const r of runs) {
    const rc = pick(r);
    out.escapeCount += rc.escapeCount;
    out.totalChecks += rc.totalChecks;
    out.runsEscaped += rc.runsEscaped;
    out.runsTotal += rc.runsTotal;
  }
  out.escapeRate = out.totalChecks > 0 ? out.escapeCount / out.totalChecks : NaN;
  return out;
}

/** 聚合 by-agent-type 字段（对恶意 runs 内的恶意/诚实 agent 分别累加） */
function aggregateAgentType(
  runs: RunEscapeResult[],
  who: "malicious" | "honest",
  method: "scalar1D" | "bbox5D" | "simplex5D",
): RateCount {
  const out = emptyRateCount();
  for (const r of runs) {
    if (!r.isMaliciousRun) continue;
    const rc = r.byAgentType[who][method];
    out.escapeCount += rc.escapeCount;
    out.totalChecks += rc.totalChecks;
  }
  out.escapeRate = out.totalChecks > 0 ? out.escapeCount / out.totalChecks : NaN;
  return out;
}

// ============================================================================
// 加载数据 & 运行分析
// ============================================================================

const fraudRuns = loadFraudRuns();
const maliciousRuns = fraudRuns.filter(r => (r.maliciousAgentIds ?? []).length > 0);
const nonMaliciousRuns = fraudRuns.filter(r => (r.maliciousAgentIds ?? []).length === 0);

console.log(`\n加载 fraud enriched runs: ${fraudRuns.length} (malicious=${maliciousRuns.length}, non-malicious=${nonMaliciousRuns.length})`);

const allResults: RunEscapeResult[] = [];
for (const run of fraudRuns) {
  const r = analyzeRunEscape(run);
  if (r) allResults.push(r);
}
const maliciousResults = allResults.filter(r => r.isMaliciousRun);
const nonMaliciousResults = allResults.filter(r => !r.isMaliciousRun);

console.log(`成功分析 runs: ${allResults.length} (malicious=${maliciousResults.length}, non-malicious=${nonMaliciousResults.length})`);

// ============================================================================
// 输出容器
// ============================================================================

const summary: Record<string, unknown> = {
  meta: {
    generatedAt: new Date().toISOString(),
    baselineSeed: BASELINE_SEED,
    methods: {
      scalar1D: "b_i(t) outside [min_j b_j(0), max_j b_j(0)] (旧 1D 方法, 用于对比)",
      bbox5D: "u_i(t) 在任意一维超出 [min_j u_j(0), max_j u_j(0)] (hull 逃逸的必要条件)",
      simplex5D: "5 顶点 4-simplex 精确成员检验: Vλ=p, 要求 λ_i≥0 且 Σλ_i=1",
    },
    runsLoaded: {
      total: fraudRuns.length,
      malicious: maliciousRuns.length,
      nonMalicious: nonMaliciousRuns.length,
    },
    runsAnalyzed: {
      total: allResults.length,
      malicious: maliciousResults.length,
      nonMalicious: nonMaliciousResults.length,
    },
  },
};

// ============================================================================
// 分析 1：多维逃逸率
// ============================================================================

printHeader("分析 1：多维逃逸率（3 种方法 × 4 个分组）");

function printRateRow(label: string, rc: RateCount) {
  const perCheck = pct(rc.escapeRate);
  const perRun = rc.runsTotal > 0 ? pct(rc.runsEscaped / rc.runsTotal) : "—";
  console.log(
    `  ${label.padEnd(28)} per-check=${perCheck.padStart(7)} (${rc.escapeCount}/${rc.totalChecks})`.padEnd(60)
    + ` per-run=${perRun.padStart(7)} (${rc.runsEscaped}/${rc.runsTotal})`
  );
}

const grp_malRuns = aggregateRate(maliciousResults, r => r.scalar1D);
const grp_nonRuns = aggregateRate(nonMaliciousResults, r => r.scalar1D);

const table: Array<{ method: string; malRuns: RateCount; nonRuns: RateCount; malAgents: RateCount; honAgents: RateCount }> = [
  {
    method: "1D scalar (旧)",
    malRuns: aggregateRate(maliciousResults, r => r.scalar1D),
    nonRuns: aggregateRate(nonMaliciousResults, r => r.scalar1D),
    malAgents: aggregateAgentType(maliciousResults, "malicious", "scalar1D"),
    honAgents: aggregateAgentType(maliciousResults, "honest", "scalar1D"),
  },
  {
    method: "5D bounding box",
    malRuns: aggregateRate(maliciousResults, r => r.bbox5D),
    nonRuns: aggregateRate(nonMaliciousResults, r => r.bbox5D),
    malAgents: aggregateAgentType(maliciousResults, "malicious", "bbox5D"),
    honAgents: aggregateAgentType(maliciousResults, "honest", "bbox5D"),
  },
  {
    method: "5D simplex (exact)",
    malRuns: aggregateRate(maliciousResults, r => r.simplex5D),
    nonRuns: aggregateRate(nonMaliciousResults, r => r.simplex5D),
    malAgents: aggregateAgentType(maliciousResults, "malicious", "simplex5D"),
    honAgents: aggregateAgentType(maliciousResults, "honest", "simplex5D"),
  },
];

console.log("\n  按方法 × 分组的逃逸率（per-check = 每个 (agent, round) 对；per-run = 至少逃逸一次的 run 比例）:\n");
console.log("  ".padEnd(34) + "Malicious runs".padEnd(20) + "Non-mal runs".padEnd(20) + "Mal agents".padEnd(20) + "Honest agents".padEnd(20));
console.log("  " + "-".repeat(110));
for (const row of table) {
  const fmt = (rc: RateCount) => {
    if (rc.totalChecks === 0) return "n/a".padEnd(20);
    return (pct(rc.escapeRate) + ` [run ${rc.runsEscaped}/${rc.runsTotal}]`).padEnd(20);
  };
  console.log("  " + row.method.padEnd(30) + fmt(row.malRuns) + fmt(row.nonRuns) + fmt(row.malAgents) + fmt(row.honAgents));
}

console.log("\n  详细 per-check 逃逸率（按方法）:");
for (const row of table) {
  console.log(`\n  [${row.method}]`);
  printRateRow("Malicious runs (26)", row.malRuns);
  printRateRow("Non-malicious runs (12)", row.nonRuns);
  printRateRow("Malicious agents (in mal runs)", row.malAgents);
  printRateRow("Honest agents (in mal runs)", row.honAgents);
}

// 全体 async 也汇总一份
const allScalar = aggregateRate(allResults, r => r.scalar1D);
const allBbox = aggregateRate(allResults, r => r.bbox5D);
const allSimplex = aggregateRate(allResults, r => r.simplex5D);
console.log(`\n  全体 ${allResults.length} runs 的总体逃逸率 (per-check):`);
console.log(`    1D scalar       : ${pct(allScalar.escapeRate)} (${allScalar.escapeCount}/${allScalar.totalChecks})`);
console.log(`    5D bounding box : ${pct(allBbox.escapeRate)} (${allBbox.escapeCount}/${allBbox.totalChecks})`);
console.log(`    5D simplex      : ${pct(allSimplex.escapeRate)} (${allSimplex.escapeCount}/${allSimplex.totalChecks})`);

summary.analysis1_escape_rates = {
  description: "3 种 hull 方法 × 4 分组 (per-check & per-run 逃逸率)",
  table: table.map(row => ({
    method: row.method,
    maliciousRuns: row.malRuns,
    nonMaliciousRuns: row.nonRuns,
    maliciousAgents: row.malAgents,
    honestAgents: row.honAgents,
  })),
  overallAsync: { scalar1D: allScalar, bbox5D: allBbox, simplex5D: allSimplex },
};

// ============================================================================
// 分析 2：随机基线（CRITICAL —— 防止假阳性）
// ============================================================================

printHeader("分析 2：随机基线（mulberry32 seed=42）—— 5D simplex 逃逸率");

const baselineRngMarginal = mulberry32(BASELINE_SEED);
const baselineRngBootstrap = mulberry32(BASELINE_SEED + 1);
const baselineRngShuffle = mulberry32(BASELINE_SEED + 2);

interface BaselineAgg {
  escapeCount: number;
  totalChecks: number;
  perRunEscapeCount: number;  // 每个 run 平均逃逸数
  nRuns: number;
  // 也保留 per-run 视角：fraction of runs where ≥1 escape happened
  runsEscaped: number;
}
function emptyBaselineAgg(): BaselineAgg {
  return { escapeCount: 0, totalChecks: 0, perRunEscapeCount: 0, nRuns: 0, runsEscaped: 0 };
}
function finalizeBaselineAgg(ba: BaselineAgg) {
  // nothing — rate computed at print time
}

const realAgg = emptyBaselineAgg();
const marginalAgg = emptyBaselineAgg();
const bootstrapAgg = emptyBaselineAgg();
const shuffleAgg = emptyBaselineAgg();

const baselineByRun: Array<{
  runId: string;
  isMaliciousRun: boolean;
  real: BaselineResult;
  marginal: BaselineResult;
  bootstrap: BaselineResult;
  shuffle: BaselineResult;
}> = [];

for (const run of fraudRuns) {
  const real = (function (): BaselineResult {
    const r = allResults.find(x => x.runId === (run.runId ?? "unknown"));
    if (!r) return { simplexRate: NaN, escapeCount: 0, totalChecks: 0 };
    return {
      simplexRate: r.simplex5D.escapeRate,
      escapeCount: r.simplex5D.escapeCount,
      totalChecks: r.simplex5D.totalChecks,
    };
  })();
  const marginal = baselineMarginalPreserving(run, baselineRngMarginal);
  const bootstrap = baselineBootstrap(run, baselineRngBootstrap);
  const shuffle = baselineShuffleTemporal(run, baselineRngShuffle);

  baselineByRun.push({
    runId: run.runId ?? "unknown",
    isMaliciousRun: (run.maliciousAgentIds ?? []).length > 0,
    real, marginal, bootstrap, shuffle,
  });

  for (const [agg, b] of [
    [realAgg, real], [marginalAgg, marginal], [bootstrapAgg, bootstrap], [shuffleAgg, shuffle],
  ] as const) {
    agg.escapeCount += b.escapeCount;
    agg.totalChecks += b.totalChecks;
    agg.nRuns++;
    if (b.escapeCount > 0) agg.runsEscaped++;
  }
}

function baselineRate(ba: BaselineAgg): number {
  return ba.totalChecks > 0 ? ba.escapeCount / ba.totalChecks : NaN;
}

console.log("\n  基线 1：Real data (5D simplex per-check)");
console.log(`    escape rate = ${pct(baselineRate(realAgg))}  (${realAgg.escapeCount}/${realAgg.totalChecks} across ${realAgg.nRuns} runs)`);
console.log(`    per-run: ${realAgg.runsEscaped}/${realAgg.nRuns} = ${pct(realAgg.runsEscaped / realAgg.nRuns)} 的 run 至少有 1 次逃逸`);

console.log("\n  基线 2：Marginal-preserving random (从每个 agent 自己的经验分布采样)");
console.log(`    escape rate = ${pct(baselineRate(marginalAgg))}  (${marginalAgg.escapeCount}/${marginalAgg.totalChecks})`);
console.log(`    per-run: ${marginalAgg.runsEscaped}/${marginalAgg.nRuns} = ${pct(marginalAgg.runsEscaped / marginalAgg.nRuns)}`);

console.log("\n  基线 3：Bootstrap (从所有 agent 所有轮次池采样)");
console.log(`    escape rate = ${pct(baselineRate(bootstrapAgg))}  (${bootstrapAgg.escapeCount}/${bootstrapAgg.totalChecks})`);
console.log(`    per-run: ${bootstrapAgg.runsEscaped}/${bootstrapAgg.nRuns} = ${pct(bootstrapAgg.runsEscaped / bootstrapAgg.nRuns)}`);

console.log("\n  基线 4：Shuffle temporal (每 agent 跨轮打乱，用打乱后第一轮作 hull)");
console.log(`    escape rate = ${pct(baselineRate(shuffleAgg))}  (${shuffleAgg.escapeCount}/${shuffleAgg.totalChecks})`);
console.log(`    per-run: ${shuffleAgg.runsEscaped}/${shuffleAgg.nRuns} = ${pct(shuffleAgg.runsEscaped / shuffleAgg.nRuns)}`);

const realVsMarginal = baselineRate(realAgg) - baselineRate(marginalAgg);
const realVsBootstrap = baselineRate(realAgg) - baselineRate(bootstrapAgg);
const realVsShuffle = baselineRate(realAgg) - baselineRate(shuffleAgg);

console.log("\n  解读:");
console.log(`    real - marginal = ${(realVsMarginal * 100).toFixed(2)} pp  ${realVsMarginal > 0.05 ? "✅ 真实逃逸显著高于 marginal 基线（真实现象）" : realVsMarginal < -0.05 ? "⚠ 真实低于 marginal" : "≈ 真实 ≈ marginal（逃逸可能是偶然）"}`);
console.log(`    real - bootstrap = ${(realVsBootstrap * 100).toFixed(2)} pp  ${realVsBootstrap > 0.05 ? "✅ 真实逃逸显著高于 bootstrap 基线" : "≈ 真实 ≈ bootstrap（与偶然水平相当）"}`);
console.log(`    real - shuffle = ${(realVsShuffle * 100).toFixed(2)} pp  ${realVsShuffle > 0.05 ? "✅ 真实逃逸显著高于 shuffle 基线（依赖时间方向）" : "≈ 时间方向不重要"}`);

summary.analysis2_random_baselines = {
  description: "5D simplex 逃逸率 vs 三种随机基线",
  real: { rate: baselineRate(realAgg), escapeCount: realAgg.escapeCount, totalChecks: realAgg.totalChecks, runsEscaped: realAgg.runsEscaped, nRuns: realAgg.nRuns },
  marginal: { rate: baselineRate(marginalAgg), escapeCount: marginalAgg.escapeCount, totalChecks: marginalAgg.totalChecks, runsEscaped: marginalAgg.runsEscaped, nRuns: marginalAgg.nRuns },
  bootstrap: { rate: baselineRate(bootstrapAgg), escapeCount: bootstrapAgg.escapeCount, totalChecks: bootstrapAgg.totalChecks, runsEscaped: bootstrapAgg.runsEscaped, nRuns: bootstrapAgg.nRuns },
  shuffle: { rate: baselineRate(shuffleAgg), escapeCount: shuffleAgg.escapeCount, totalChecks: shuffleAgg.totalChecks, runsEscaped: shuffleAgg.runsEscaped, nRuns: shuffleAgg.nRuns },
  differences: {
    realMinusMarginal: realVsMarginal,
    realMinusBootstrap: realVsBootstrap,
    realMinusShuffle: realVsShuffle,
  },
  byRun: baselineByRun,
};

// ============================================================================
// 分析 3：哪些维度逃逸？
// ============================================================================

printHeader("分析 3：哪些维度逃逸？（5D simplex 逃逸事件中超出 bbox 的维度分布）");

// 仅统计 simplex 逃逸事件（更严格）
const simplexEscapes = allResults.flatMap(r => r.escapes.filter(e => e.method === "simplex5D"));
// 获取 canonical items（用于维度命名）
const canonicalItemsAll = allResults[0]?.canonicalItems ?? [];
const dimCount = new Array(canonicalItemsAll.length).fill(0);
let simplexEscapesWithBboxOut = 0;
for (const e of simplexEscapes) {
  if (e.outsideDims.length > 0) simplexEscapesWithBboxOut++;
  for (const d of e.outsideDims) dimCount[d]++;
}

console.log(`\n  5D simplex 逃逸事件总数: ${simplexEscapes.length}`);
console.log(`  其中超出 bbox 的: ${simplexEscapesWithBboxOut} (${pct(simplexEscapes.length > 0 ? simplexEscapesWithBboxOut / simplexEscapes.length : NaN)})`);
console.log(`\n  按维度统计（一个逃逸事件可同时超出多维度）:`);
for (let d = 0; d < dimCount.length; d++) {
  const itemName = canonicalItemsAll[d] ?? `dim${d}`;
  const frac = simplexEscapes.length > 0 ? dimCount[d] / simplexEscapes.length : NaN;
  console.log(`    dim ${d}  (${itemName.padEnd(20)})  ${dimCount[d]} 次  (${pct(frac)})`);
}

// 同样统计 bbox 逃逸事件
const bboxEscapes = allResults.flatMap(r => r.escapes.filter(e => e.method === "bbox5D"));
const dimCountBBox = new Array(dimCount.length).fill(0);
for (const e of bboxEscapes) {
  for (const d of e.outsideDims) dimCountBBox[d]++;
}
console.log(`\n  对比 - 5D bbox 逃逸事件总数: ${bboxEscapes.length}`);
console.log(`  按维度统计:`);
for (let d = 0; d < dimCountBBox.length; d++) {
  const itemName = canonicalItemsAll[d] ?? `dim${d}`;
  const frac = bboxEscapes.length > 0 ? dimCountBBox[d] / bboxEscapes.length : NaN;
  console.log(`    dim ${d}  (${itemName.padEnd(20)})  ${dimCountBBox[d]} 次  (${pct(frac)})`);
}

summary.analysis3_dimension_breakdown = {
  simplexEscapeEvents: simplexEscapes.length,
  simplexEscapesWithBboxOut: simplexEscapesWithBboxOut,
  simplexEscapesWithBboxOutFrac: simplexEscapes.length > 0 ? simplexEscapesWithBboxOut / simplexEscapes.length : NaN,
  dimCounts_simplex: dimCount.map((c, d) => ({
    dim: d, item: canonicalItemsAll[d] ?? `dim${d}`, count: c,
    frac: simplexEscapes.length > 0 ? c / simplexEscapes.length : NaN,
  })),
  bboxEscapeEvents: bboxEscapes.length,
  dimCounts_bbox: dimCountBBox.map((c, d) => ({
    dim: d, item: canonicalItemsAll[d] ?? `dim${d}`, count: c,
    frac: bboxEscapes.length > 0 ? c / bboxEscapes.length : NaN,
  })),
};

// ============================================================================
// 分析 4：恶意 vs 诚实机制
// ============================================================================

printHeader("分析 4：恶意 vs 诚实 agent 逃逸机制（仅 malicious runs）");

const malSimplex = aggregateAgentType(maliciousResults, "malicious", "simplex5D");
const honSimplex = aggregateAgentType(maliciousResults, "honest", "simplex5D");
const malBbox = aggregateAgentType(maliciousResults, "malicious", "bbox5D");
const honBbox = aggregateAgentType(maliciousResults, "honest", "bbox5D");
const malScalar = aggregateAgentType(maliciousResults, "malicious", "scalar1D");
const honScalar = aggregateAgentType(maliciousResults, "honest", "scalar1D");

console.log("\n  在 26 个 malicious runs 中:");
console.log(`    恶意 agent (1D scalar) : ${pct(malScalar.escapeRate)} (${malScalar.escapeCount}/${malScalar.totalChecks})`);
console.log(`    诚实 agent (1D scalar) : ${pct(honScalar.escapeRate)} (${honScalar.escapeCount}/${honScalar.totalChecks})`);
console.log(`    恶意 agent (5D bbox)   : ${pct(malBbox.escapeRate)} (${malBbox.escapeCount}/${malBbox.totalChecks})`);
console.log(`    诚实 agent (5D bbox)   : ${pct(honBbox.escapeRate)} (${honBbox.escapeCount}/${honBbox.totalChecks})`);
console.log(`    恶意 agent (5D simplex): ${pct(malSimplex.escapeRate)} (${malSimplex.escapeCount}/${malSimplex.totalChecks})`);
console.log(`    诚实 agent (5D simplex): ${pct(honSimplex.escapeRate)} (${honSimplex.escapeCount}/${honSimplex.totalChecks})`);

// 逃逸方向：诚实 agent 的逃逸点是否朝恶意 agent 偏好 item 移动？
console.log("\n  逃逸方向分析（仅 malicious runs 中诚实 agent 的 simplex 逃逸事件）:");
console.log(`  对每个逃逸事件，检查诚实 agent 在恶意偏好 item 上的 belief 是否朝恶意 agent 的 belief 移动`);

interface DirectionStats {
  total: number;
  towardMalicious: number;     // 诚实 agent 的 belief 在恶意偏好维度上"朝恶意 agent 的初始 belief"移动
  awayFromMalicious: number;
  noMove: number;
  noPreferredItem: number;
}
const dirStats: DirectionStats = { total: 0, towardMalicious: 0, awayFromMalicious: 0, noMove: 0, noPreferredItem: 0 };

// 对每个 malicious run，取恶意 agent 在 round 1 在偏好 item 上的 belief
for (const r of maliciousResults) {
  if (r.maliciousPreferredItemIdx === null) continue;
  const idx = r.maliciousPreferredItemIdx;
  // 恶意 agent 在 round 1 的偏好 item belief
  const maliciousRound1 = r.initialVectors.length > 0 ? r.initialVectors[0] : null;
  // 找到恶意 agent 的初始向量
  const run = fraudRuns.find(fr => (fr.runId ?? "unknown") === r.runId);
  if (!run) continue;
  const maliciousSet = new Set(run.maliciousAgentIds ?? []);
  const traj = extractTrajectory(run);
  const maliciousInitPt = traj.points.find(p => p.round === (traj.points[0]?.round ?? 0) && maliciousSet.has(p.agentId));
  if (!maliciousInitPt) continue;
  const maliciousPrefBelief = maliciousInitPt.vector[idx];

  // 遍历该 run 中诚实 agent 的 simplex 逃逸事件
  for (const e of r.escapes) {
    if (e.method !== "simplex5D") continue;
    if (e.isMalicious) continue;  // 仅诚实 agent
    dirStats.total++;
    // 诚实 agent 在逃逸时刻该维度的 belief
    const honestBeliefAtEscape = e.vector[idx];
    // 诚实 agent 在 round 1 该维度的 belief（与恶意偏好比较）
    // 找到该诚实 agent 在 round 1 的向量
    const honestInitPt = traj.points.find(p => p.round === (traj.points[0]?.round ?? 0) && p.agentId === e.agentId);
    if (!honestInitPt) {
      dirStats.noMove++;
      continue;
    }
    const honestInitBelief = honestInitPt.vector[idx];
    const delta = honestBeliefAtEscape - honestInitBelief;
    // 朝恶意移动：诚实初始 < 恶意初始 且 delta > 0；或 诚实初始 > 恶意初始 且 delta < 0
    if (Math.abs(delta) < 1e-9) {
      dirStats.noMove++;
    } else if ((maliciousPrefBelief > honestInitBelief && delta > 0) ||
               (maliciousPrefBelief < honestInitBelief && delta < 0)) {
      dirStats.towardMalicious++;
    } else {
      dirStats.awayFromMalicious++;
    }
  }
}

console.log(`    总逃逸事件 (诚实 agent, simplex, malicious runs): ${dirStats.total}`);
console.log(`    朝恶意偏好方向移动: ${dirStats.towardMalicious} (${pct(dirStats.total > 0 ? dirStats.towardMalicious / dirStats.total : NaN)})`);
console.log(`    远离恶意偏好方向: ${dirStats.awayFromMalicious} (${pct(dirStats.total > 0 ? dirStats.awayFromMalicious / dirStats.total : NaN)})`);
console.log(`    无移动: ${dirStats.noMove}`);

summary.analysis4_malicious_vs_honest = {
  maliciousAgents: { scalar1D: malScalar, bbox5D: malBbox, simplex5D: malSimplex },
  honestAgents: { scalar1D: honScalar, bbox5D: honBbox, simplex5D: honSimplex },
  escapeDirection: dirStats,
};

// ============================================================================
// 分析 5：Hidden Anchors 检验
// ============================================================================

printHeader("分析 5：Hidden Anchors 检验（最终轮信念是否在初始 hull 之外）");

const finalOutsideRuns = allResults.filter(r => r.finalOutsideCount > 0);
const finalOutsideRate = allResults.length > 0 ? finalOutsideRuns.length / allResults.length : NaN;
const finalOutsideRateMal = maliciousResults.length > 0
  ? maliciousResults.filter(r => r.finalOutsideCount > 0).length / maliciousResults.length : NaN;
const finalOutsideRateNon = nonMaliciousResults.length > 0
  ? nonMaliciousResults.filter(r => r.finalOutsideCount > 0).length / nonMaliciousResults.length : NaN;

// 每个 run 的 finalOutsideRate 平均
const avgFinalOutsideFrac = allResults.length > 0
  ? allResults.reduce((s, r) => s + (isNaN(r.finalOutsideRate) ? 0 : r.finalOutsideRate), 0) / allResults.length
  : NaN;

console.log(`\n  最终轮信念是否在初始 5D simplex hull 之外:`);
console.log(`    全体 ${allResults.length} runs: ${finalOutsideRuns.length} 个 run 的最终轮至少 1 agent 在 hull 外 = ${pct(finalOutsideRate)}`);
console.log(`    malicious runs (${maliciousResults.length}): ${maliciousResults.filter(r => r.finalOutsideCount > 0).length} = ${pct(finalOutsideRateMal)}`);
console.log(`    non-malicious runs (${nonMaliciousResults.length}): ${nonMaliciousResults.filter(r => r.finalOutsideCount > 0).length} = ${pct(finalOutsideRateNon)}`);
console.log(`    平均每个 run 最终轮在 hull 外的 agent 比例: ${pct(avgFinalOutsideFrac)}`);

console.log(`\n  Hidden Anchors 预测:`);
console.log(`    - 若 trajectory 收敛到 conv{anchors} 而非 conv{initial beliefs}，最终轮应在初始 hull 外`);
console.log(`    - ${finalOutsideRuns.length > 0 ? "✅ 部分 run 的最终轮在初始 hull 外 → 支持 Hidden Anchors 假说" : "❌ 所有 run 的最终轮均在初始 hull 内 → 不支持 Hidden Anchors"}`);

// 同时检验：最终轮是否在初始 bbox 之外（更宽松的检验）
let finalBboxOutsideRuns = 0;
for (const r of allResults) {
  const rounds = [...new Set((fraudRuns.find(fr => (fr.runId ?? "unknown") === r.runId)?.roundResults ?? []).map(rr => rr.roundNumber ?? 0))].sort((a, b) => a - b);
  // 重新计算 bbox final：用我们已记录的 initialVectors
  const dim = r.canonicalItems.length;
  const bboxMin: number[] = [];
  const bboxMax: number[] = [];
  for (let d = 0; d < dim; d++) {
    bboxMin.push(Math.min(...r.initialVectors.map(v => v[d])));
    bboxMax.push(Math.max(...r.initialVectors.map(v => v[d])));
  }
  // 找最终轮的 points
  const traj = extractTrajectory(fraudRuns.find(fr => (fr.runId ?? "unknown") === r.runId)!);
  const trajRounds = [...new Set(traj.points.map(p => p.round))].sort((a, b) => a - b);
  if (trajRounds.length === 0) continue;
  const finalRound = trajRounds[trajRounds.length - 1];
  const finalPts = traj.points.filter(p => p.round === finalRound);
  let outside = false;
  for (const fp of finalPts) {
    for (let d = 0; d < dim; d++) {
      if (fp.vector[d] < bboxMin[d] - 1e-9 || fp.vector[d] > bboxMax[d] + 1e-9) {
        outside = true; break;
      }
    }
    if (outside) break;
  }
  if (outside) finalBboxOutsideRuns++;
}
console.log(`\n  对比 - 最终轮在初始 5D bbox 之外的 runs: ${finalBboxOutsideRuns}/${allResults.length} = ${pct(allResults.length > 0 ? finalBboxOutsideRuns / allResults.length : NaN)}`);

summary.analysis5_hidden_anchors = {
  description: "Hidden Anchors: 最终轮是否在初始 5D simplex hull 之外",
  finalOutsideRuns: finalOutsideRuns.length,
  totalRuns: allResults.length,
  finalOutsideRunRate: finalOutsideRate,
  maliciousRuns: {
    finalOutsideRuns: maliciousResults.filter(r => r.finalOutsideCount > 0).length,
    total: maliciousResults.length,
    rate: finalOutsideRateMal,
  },
  nonMaliciousRuns: {
    finalOutsideRuns: nonMaliciousResults.filter(r => r.finalOutsideCount > 0).length,
    total: nonMaliciousResults.length,
    rate: finalOutsideRateNon,
  },
  avgFinalOutsideFrac,
  finalBboxOutsideRuns,
  finalBboxOutsideRate: allResults.length > 0 ? finalBboxOutsideRuns / allResults.length : NaN,
  supportsHiddenAnchors: finalOutsideRuns.length > 0,
};

// ============================================================================
// 总结：3 个关键问题
// ============================================================================

printHeader("关键问题总结");

console.log("\n  Q1: 5D 逃逸率是否不同于 1D？（1D 是否高估？）");
const overall1D = allScalar.escapeRate;
const overall5D = allSimplex.escapeRate;
console.log(`    1D scalar  (全体 async): ${pct(overall1D)}`);
console.log(`    5D simplex (全体 async): ${pct(overall5D)}`);
console.log(`    差异: ${((overall1D - overall5D) * 100).toFixed(2)} pp`);
if (overall1D > overall5D + 0.02) {
  console.log(`    ✅ 1D 显著高于 5D —— 1D hull 高估了逃逸率（1D 太宽松）`);
} else if (overall5D > overall1D + 0.02) {
  console.log(`    ⚠ 5D 反而高于 1D（罕见，可能因 simplex 检验更严格但 bbox 维度更多）`);
} else {
  console.log(`    ≈ 1D 与 5D 逃逸率相近`);
}

console.log("\n  Q2: 5D 逃逸率是否高于随机基线？（是否为真实现象？）");
const realRate = baselineRate(realAgg);
const marginalRate = baselineRate(marginalAgg);
const bootstrapRate = baselineRate(bootstrapAgg);
const shuffleRate = baselineRate(shuffleAgg);
console.log(`    Real            : ${pct(realRate)}`);
console.log(`    Marginal-preserv: ${pct(marginalRate)}`);
console.log(`    Bootstrap       : ${pct(bootstrapRate)}`);
console.log(`    Shuffle temporal: ${pct(shuffleRate)}`);
const realVsBestBaseline = realRate - Math.max(marginalRate, bootstrapRate, shuffleRate);
console.log(`    Real - max(baselines) = ${(realVsBestBaseline * 100).toFixed(2)} pp`);
if (realVsBestBaseline > 0.05) {
  console.log(`    ✅ 5D 逃逸率显著高于所有随机基线 —— 真实现象（非偶然）`);
} else if (realVsBestBaseline < -0.05) {
  console.log(`    ⚠ 5D 逃逸率低于基线（异常）`);
} else {
  console.log(`    ≈ 5D 逃逸率与随机基线相当 —— 逃逸可能主要由偶然驱动`);
}

console.log("\n  Q3: 恶意 agent 在 5D 中是否逃逸？（1D 中为 0%，是否为假象？）");
console.log(`    Malicious agents (1D scalar) : ${pct(malScalar.escapeRate)} (${malScalar.escapeCount}/${malScalar.totalChecks})`);
console.log(`    Malicious agents (5D bbox)   : ${pct(malBbox.escapeRate)} (${malBbox.escapeCount}/${malBbox.totalChecks})`);
console.log(`    Malicious agents (5D simplex): ${pct(malSimplex.escapeRate)} (${malSimplex.escapeCount}/${malSimplex.totalChecks})`);
if (malScalar.escapeCount === 0 && malSimplex.escapeCount > 0) {
  console.log(`    ✅ 恶意 agent 在 1D 中 0% 逃逸，但在 5D 中 ${pct(malSimplex.escapeRate)} —— 1D 0% 是假象（被 1D 标量投影掩盖）`);
} else if (malScalar.escapeCount === 0 && malSimplex.escapeCount === 0) {
  console.log(`    ❌ 恶意 agent 在 1D 和 5D 中均 0% 逃逸 —— 恶意 agent 真的不逃逸（锚定在自己的位置）`);
} else {
  console.log(`    ⚠ 恶意 agent 在 1D 和 5D 中均有逃逸 —— 需进一步分析`);
}

summary.key_questions = {
  q1_1D_vs_5D: {
    overall1D,
    overall5D,
    difference: overall1D - overall5D,
    oneDOverestimates: overall1D > overall5D + 0.02,
  },
  q2_real_vs_baseline: {
    real: realRate,
    marginal: marginalRate,
    bootstrap: bootstrapRate,
    shuffle: shuffleRate,
    realMinusMaxBaseline: realVsBestBaseline,
    isRealPhenomenon: realVsBestBaseline > 0.05,
  },
  q3_malicious_in_5D: {
    malicious_1D: malScalar.escapeRate,
    malicious_5D_bbox: malBbox.escapeRate,
    malicious_5D_simplex: malSimplex.escapeRate,
    oneDZeroIsArtifact: malScalar.escapeCount === 0 && malSimplex.escapeCount > 0,
  },
};

// ============================================================================
// 保存 JSON
// ============================================================================

const resultsDir = path.join(V2_DIR, "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
const outPath = path.join(resultsDir, "analyze_multidim_hull_escape.json");
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf-8");

console.log("\n" + "=".repeat(78));
console.log(`  JSON 摘要已保存：${path.relative(process.cwd(), outPath)}`);
console.log("=".repeat(78));
