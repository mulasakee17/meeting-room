/**
 * ε vs 5D Cognitive State + Individual Entropy + Convex Hull Escape
 *
 * 三项分析（基于已建立的观测模型 b = α·U + ε, α=0.5042, R²=0.172）：
 *
 *   分析 1: ε vs 5D 认知状态（fraud 38 runs）
 *     - ι (Inertia) 是否预测 ε？  r(ε, ι)
 *     - c (Confidence) 是否预测 ε？ r(ε, c)  [c 为常数 0.325，跳过]
 *     - Λ (Susceptibility) 是否预测 ε？ r(ε, Λ)
 *
 *   分析 2: 个体熵预测 opinion shift（fraud 38 runs）
 *     - H_ind = -Σ p_i log2 p_i,  p_i = |itemBelief_i| / Σ|itemBelief_j|
 *     - Δb = |b(t+1) - b(t)|
 *     - r(H_ind, Δb) 全体 / 恶意 / 诚实
 *     - 对比 group-level H（从 beliefs 数组）
 *
 *   分析 3: Convex hull escape（169 sync + 38 async）
 *     - 初始凸包 = [min(b(0)), max(b(0))]
 *     - 后续轮次是否有 agent 逃逸
 *     - 分 sync / async、ablation、malicious 维度统计逃逸率
 *     - 检验 Hidden Anchors 预测：DeGroot 不能逃逸，LLM agent 可能逃逸
 *
 * 运行：npx tsx experiments/v2/analyze_epsilon_5d_entropy_hull.ts
 */

import * as fs from "fs";
import * as path from "path";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";
import { mean, sampleStd, mulberry32, PERMUTATION_SEED } from "./statsShared";

// ============================================================================
// 常量
// ============================================================================

/** 已拟合的观测模型投影系数 α = Σ(U·b) / Σ(U²) */
const ALPHA = 0.5042;

/** Phase 2 placeholder 置信度（cognitiveState.ts 约定） */
const C_CONSTANT = 0.325; // 0.7*(0.5*0.5) + 0.3*0.5

// Fraud 任务角色表（源自 task_fraud.ts）
const FRAUD_AGENT_ROLES: Record<string, string> = {
  a1: "审计师",
  a2: "供应链分析师",
  a3: "法务顾问",
  a4: "媒体分析师",
  a5: "行业专家",
};

// ι_role（硬编码，与 analyze_epsilon_observation_model.ts 一致）
const IOTA_ROLE: Record<string, number> = {
  a1: 0.4,
  a2: 0.5,
  a3: 0.4,
  a4: 0.5,
  a5: 0.6,
};

// roleBase 规则（逐字复制自 analyze_fraud_delta_fj.ts，源自 cognitiveState.ts:123-140）
const ROLE_INERTIA_RULES: Array<{ keywords: string[]; inertia: number }> = [
  { keywords: ["expert", "专家", "资深", "senior"], inertia: 0.6 },
  { keywords: ["analyst", "分析师", "分析"], inertia: 0.5 },
  { keywords: ["critic", "批评", "质疑", "审查"], inertia: 0.4 },
  { keywords: ["diplomat", "外交", "协调"], inertia: 0.35 },
  { keywords: ["moderator", "主持人", "协调员", "facilitator"], inertia: 0.3 },
  { keywords: ["novice", "新手", "初级", "junior"], inertia: 0.3 },
];

function getRoleInertia(role: string): number {
  const lower = role.toLowerCase();
  for (const rule of ROLE_INERTIA_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return rule.inertia;
    }
  }
  return 0.4;
}

const FRAUD_ROLE_BASE: Record<string, number> = {};
for (const [id, role] of Object.entries(FRAUD_AGENT_ROLES)) {
  FRAUD_ROLE_BASE[id] = getRoleInertia(role);
}

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

interface SyncRound {
  roundNumber?: number;
  beliefs?: Record<string, number>;
}

interface SyncRun {
  runId?: string;
  ablation?: string;
  runIndex?: number;
  kendallTau: number;
  rounds?: SyncRound[];
}

// ============================================================================
// 统计工具（与 analyze_epsilon_observation_model.ts 一致的本地实现）
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
  p: number;
  perms: number;
}

/** Pearson r + 双侧置换检验 p 值（mulberry32 seed=42, 10k perms） */
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

function printHeader(title: string) {
  console.log("\n" + "=".repeat(78));
  console.log("  " + title);
  console.log("=".repeat(78));
}

// ============================================================================
// 数据加载 —— Fraud 38 enriched runs
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
      if (!Array.isArray(raw.roundResults) || typeof raw.kendallTau !== "number") continue;
      // 必须至少一个 opinion 带 itemBeliefs（enriched）
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
// 数据加载 —— Sync 169 runs (crisis + supplier)
// ============================================================================

const SYNC_DIRS = [
  path.join(V2_DIR, "data_crisis"),
  path.join(V2_DIR, "data_supplier"),
];

function loadSyncRuns(): SyncRun[] {
  const runs: SyncRun[] = [];
  for (const dir of SYNC_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(
      f => f.endsWith(".json") && f !== "summary.json"
    );
    for (const f of files) {
      const raw = safeJsonParse<SyncRun & { error?: string }>(
        fs.readFileSync(path.join(dir, f), "utf-8")
      );
      if (!raw || raw.error) continue;
      if (!Array.isArray(raw.rounds) || raw.rounds.length === 0) continue;
      // 至少一轮有 beliefs 字典
      const hasBeliefs = raw.rounds.some(r => r.beliefs && typeof r.beliefs === "object");
      if (!hasBeliefs) continue;
      runs.push({
        ...raw,
        runId: raw.runId ?? f.replace(/\.json$/, ""),
      });
    }
  }
  return runs;
}

// ============================================================================
// 加载数据
// ============================================================================

const fraudRuns = loadFraudRuns();
const syncRuns = loadSyncRuns();
const maliciousFraudRuns = fraudRuns.filter(
  r => Array.isArray(r.maliciousAgentIds) && r.maliciousAgentIds.length > 0
);

console.log(`\n数据加载：fraud enriched runs = ${fraudRuns.length} (malicious=${maliciousFraudRuns.length}, non-malicious=${fraudRuns.length - maliciousFraudRuns.length})`);
console.log(`数据加载：sync runs = ${syncRuns.length}`);

// ============================================================================
// 分析 1 样本：ε, ι, c, Λ
// ============================================================================

interface EpsSample5D {
  runId: string;
  round: number;
  agentId: string;
  role: string;
  b: number;
  uSignedMax: number;
  eps: number;          // |b - α·U|
  roleBase: number;
  roundsSpoken: number;
  expressionBased: number;
  iotaApprox: number;
  c: number;            // 固定 0.325
  lambda: number;       // max((1-ι)(1-c), 0.05)
  isMalicious: boolean;
}

function computeEps5DSamples(run: FraudRun): EpsSample5D[] {
  const samples: EpsSample5D[] = [];
  const maliciousSet = new Set(run.maliciousAgentIds ?? []);
  const rounds = run.roundResults ?? [];
  const spokenCount: Record<string, number> = {};

  for (const round of rounds) {
    const roundNum = typeof round.roundNumber === "number" ? round.roundNumber : 0;
    const opinions = Array.isArray(round.opinions) ? round.opinions : [];
    const spokeThisRound = new Set(opinions.map(o => o.agentId));
    for (const agentId of spokeThisRound) {
      spokenCount[agentId] = (spokenCount[agentId] ?? 0) + 1;
    }

    for (const op of opinions) {
      const agentId = op.agentId;
      const role = FRAUD_AGENT_ROLES[agentId];
      if (!role) continue;
      const b = op.belief;
      if (typeof b !== "number" || isNaN(b)) continue;
      const items = Array.isArray(op.itemBeliefs) ? op.itemBeliefs : [];
      if (items.length === 0) continue;

      // U_signed_max
      const u = items.map(it => (typeof it.belief === "number" ? it.belief : 0));
      let uSignedMax = 0;
      let maxAbs = -Infinity;
      for (const v of u) {
        if (Math.abs(v) > maxAbs) {
          maxAbs = Math.abs(v);
          uSignedMax = v;
        }
      }

      // ε = |b - α·U|
      const eps = Math.abs(b - ALPHA * uSignedMax);

      // ι_approx
      const roleBase = FRAUD_ROLE_BASE[agentId];
      const roundsSpoken = spokenCount[agentId] ?? 0;
      const expressionBased = 0.05 * roundsSpoken;
      const iotaApprox = (0.7 * roleBase + 0.1 * expressionBased) * 0.98;

      // c (constant placeholder)
      const c = C_CONSTANT;

      // Λ = max((1-ι)(1-c), 0.05)
      const lambda = Math.max((1 - iotaApprox) * (1 - c), 0.05);

      samples.push({
        runId: run.runId!,
        round: roundNum,
        agentId,
        role,
        b,
        uSignedMax,
        eps,
        roleBase,
        roundsSpoken,
        expressionBased,
        iotaApprox,
        c,
        lambda,
        isMalicious: maliciousSet.has(agentId),
      });
    }
  }
  return samples;
}

const epsSamples: EpsSample5D[] = [];
for (const run of fraudRuns) {
  epsSamples.push(...computeEps5DSamples(run));
}

// ============================================================================
// 分析 2 样本：H_ind, H_group, Δb
// ============================================================================

interface EntropyShiftSample {
  runId: string;
  agentId: string;
  round: number;         // round t (H measured here)
  nextRound: number;     // round t+1 (Δb measured here)
  hInd: number;          // individual entropy at t
  hGroup: number;        // group entropy at t
  b_t: number;           // belief at t
  b_t1: number;          // belief at t+1
  deltaB: number;        // |b(t+1) - b(t)|
  isMalicious: boolean;
}

/** Shannon entropy (base 2) of a probability distribution */
function shannonEntropy(probs: number[]): number {
  let h = 0;
  for (const p of probs) {
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}

/** H_ind from itemBeliefs: p_i = |itemBelief_i| / Σ|itemBelief_j| */
function individualEntropy(items: ItemBelief[]): number {
  const absVals = items.map(it => Math.abs(typeof it.belief === "number" ? it.belief : 0));
  const sum = absVals.reduce((s, v) => s + v, 0);
  if (sum <= 0) return NaN; // 全零，无法归一化
  const probs = absVals.map(v => v / sum);
  return shannonEntropy(probs);
}

/** H_group from scalar beliefs at a round: p_j = |b_j| / Σ|b_k| */
function groupEntropy(beliefs: number[]): number {
  const absVals = beliefs.map(b => Math.abs(b));
  const sum = absVals.reduce((s, v) => s + v, 0);
  if (sum <= 0) return NaN;
  const probs = absVals.map(v => v / sum);
  return shannonEntropy(probs);
}

function computeEntropyShiftSamples(run: FraudRun): EntropyShiftSample[] {
  const samples: EntropyShiftSample[] = [];
  const maliciousSet = new Set(run.maliciousAgentIds ?? []);
  const rounds = run.roundResults ?? [];

  // 按轮次索引：roundNum -> { agentId -> { b, hInd } }
  const roundMap = new Map<number, Map<string, { b: number; hInd: number }>>();
  // 每轮的 group beliefs 列表（用于 H_group）
  const roundBeliefs = new Map<number, number[]>();
  const roundNums: number[] = [];

  for (const round of rounds) {
    const roundNum = typeof round.roundNumber === "number" ? round.roundNumber : 0;
    const opinions = Array.isArray(round.opinions) ? round.opinions : [];
    const agentMap = new Map<string, { b: number; hInd: number }>();
    const beliefs: number[] = [];

    for (const op of opinions) {
      const agentId = op.agentId;
      if (!FRAUD_AGENT_ROLES[agentId]) continue;
      const b = op.belief;
      if (typeof b !== "number" || isNaN(b)) continue;
      const items = Array.isArray(op.itemBeliefs) ? op.itemBeliefs : [];
      const hInd = items.length > 0 ? individualEntropy(items) : NaN;
      agentMap.set(agentId, { b, hInd });
      beliefs.push(b);
    }

    roundMap.set(roundNum, agentMap);
    roundBeliefs.set(roundNum, beliefs);
    roundNums.push(roundNum);
  }

  // 排序轮次
  roundNums.sort((a, b) => a - b);

  // 对每对连续轮次 (t, t+1)，对同时在两轮出现的 agent 计算 Δb
  for (let i = 0; i < roundNums.length - 1; i++) {
    const t = roundNums[i];
    const t1 = roundNums[i + 1];
    const atT = roundMap.get(t)!;
    const atT1 = roundMap.get(t1)!;
    const beliefsAtT = roundBeliefs.get(t)!;
    const hGroup = groupEntropy(beliefsAtT);

    for (const [agentId, info] of atT) {
      const next = atT1.get(agentId);
      if (!next) continue; // agent 在 t+1 未出现，跳过
      if (isNaN(info.hInd)) continue; // H_ind 不可用

      samples.push({
        runId: run.runId!,
        agentId,
        round: t,
        nextRound: t1,
        hInd: info.hInd,
        hGroup,
        b_t: info.b,
        b_t1: next.b,
        deltaB: Math.abs(next.b - info.b),
        isMalicious: maliciousSet.has(agentId),
      });
    }
  }
  return samples;
}

const entropySamples: EntropyShiftSample[] = [];
for (const run of fraudRuns) {
  entropySamples.push(...computeEntropyShiftSamples(run));
}

// ============================================================================
// 分析 3：Convex hull escape
// ============================================================================

interface HullResult {
  runId: string;
  source: "sync" | "async";
  ablation?: string;
  hasMalicious?: boolean;
  totalRounds: number;
  hullMin: number;
  hullMax: number;
  escaped: boolean;
  escapeCount: number;       // 逃逸的 (round, agent) 对数
  escapeRounds: number[];    // 哪些轮次发生了逃逸
  maxExcursion: number;      // 最大越界距离
}

/** 从 SyncRun 提取每轮的 { agentId -> belief } */
function syncRunTrajectory(run: SyncRun): Map<number, Map<string, number>> {
  const traj = new Map<number, Map<string, number>>();
  for (const r of run.rounds ?? []) {
    const rn = typeof r.roundNumber === "number" ? r.roundNumber : 0;
    const beliefs = r.beliefs;
    if (!beliefs || typeof beliefs !== "object") continue;
    const agentMap = new Map<string, number>();
    for (const [aid, val] of Object.entries(beliefs)) {
      if (typeof val === "number" && !isNaN(val)) {
        agentMap.set(aid, val);
      }
    }
    if (agentMap.size > 0) {
      traj.set(rn, agentMap);
    }
  }
  return traj;
}

/** 从 FraudRun 提取每轮的 { agentId -> belief } */
function asyncRunTrajectory(run: FraudRun): Map<number, Map<string, number>> {
  const traj = new Map<number, Map<string, number>>();
  for (const r of run.roundResults ?? []) {
    const rn = typeof r.roundNumber === "number" ? r.roundNumber : 0;
    const opinions = Array.isArray(r.opinions) ? r.opinions : [];
    const agentMap = new Map<string, number>();
    for (const op of opinions) {
      if (typeof op.belief === "number" && !isNaN(op.belief)) {
        agentMap.set(op.agentId, op.belief);
      }
    }
    if (agentMap.size > 0) {
      traj.set(rn, agentMap);
    }
  }
  return traj;
}

function analyzeHullEscape(
  runId: string,
  source: "sync" | "async",
  traj: Map<number, Map<string, number>>,
  ablation?: string,
  hasMalicious?: boolean,
): HullResult | null {
  const roundNums = [...traj.keys()].sort((a, b) => a - b);
  if (roundNums.length < 2) return null; // 至少需要 2 轮

  // 初始凸包 = [min(b(0)), max(b(0))]
  const firstRound = traj.get(roundNums[0])!;
  const firstBeliefs = [...firstRound.values()];
  const hullMin = Math.min(...firstBeliefs);
  const hullMax = Math.max(...firstBeliefs);

  let escapeCount = 0;
  const escapeRounds: number[] = [];
  let maxExcursion = 0;

  for (let i = 1; i < roundNums.length; i++) {
    const rn = roundNums[i];
    const agentMap = traj.get(rn)!;
    let roundEscape = false;
    for (const b of agentMap.values()) {
      if (b < hullMin || b > hullMax) {
        roundEscape = true;
        escapeCount++;
        const excursion = b < hullMin ? (hullMin - b) : (b - hullMax);
        if (excursion > maxExcursion) maxExcursion = excursion;
      }
    }
    if (roundEscape) escapeRounds.push(rn);
  }

  return {
    runId,
    source,
    ablation,
    hasMalicious,
    totalRounds: roundNums.length,
    hullMin,
    hullMax,
    escaped: escapeCount > 0,
    escapeCount,
    escapeRounds,
    maxExcursion,
  };
}

// 计算所有 hull 结果
const hullResults: HullResult[] = [];

for (const run of syncRuns) {
  const traj = syncRunTrajectory(run);
  const result = analyzeHullEscape(
    run.runId ?? "unknown",
    "sync",
    traj,
    run.ablation,
    undefined,
  );
  if (result) hullResults.push(result);
}

for (const run of fraudRuns) {
  const traj = asyncRunTrajectory(run);
  const result = analyzeHullEscape(
    run.runId ?? "unknown",
    "async",
    traj,
    undefined,
    (run.maliciousAgentIds ?? []).length > 0,
  );
  if (result) hullResults.push(result);
}

// ============================================================================
// 输出容器
// ============================================================================

const summary: Record<string, unknown> = {
  meta: {
    generatedAt: new Date().toISOString(),
    seed: PERMUTATION_SEED,
    permutationCount: 10000,
    alpha: ALPHA,
    observationModel: "b = α·U_signed_max + ε  (α=0.5042, R²=0.172)",
    epsFormula: "ε = |b - α·U_signed_max|",
    iotaFormula: "ι_approx = (0.7 * roleBase + 0.1 * expressionBased) * 0.98",
    cFormula: "c = 0.7 * (0.5 * 0.5) + 0.3 * 0.5 = 0.325 (Phase 2 placeholder, constant)",
    lambdaFormula: "Λ = max((1-ι)(1-c), 0.05)",
    hIndFormula: "H_ind = -Σ p_i log2 p_i,  p_i = |itemBelief_i| / Σ|itemBelief_j|",
    hGroupFormula: "H_group = -Σ p_j log2 p_j,  p_j = |b_j| / Σ|b_k|  (across agents at round t)",
    deltaBFormula: "Δb = |b(t+1) - b(t)|",
    hullEscapeFormula: "escape iff b_i(t) < min(b(0)) OR b_i(t) > max(b(0)) for some i, t>1",
    runsLoaded: {
      fraudEnriched: fraudRuns.length,
      fraudMalicious: maliciousFraudRuns.length,
      fraudNonMalicious: fraudRuns.length - maliciousFraudRuns.length,
      sync: syncRuns.length,
    },
    samplesGenerated: {
      eps5D: epsSamples.length,
      entropyShift: entropySamples.length,
      hullEscape: hullResults.length,
    },
  },
  roleInertia: Object.fromEntries(
    Object.entries(FRAUD_AGENT_ROLES).map(([id, role]) => [
      id,
      { role, iotaRole: IOTA_ROLE[id], roleBase: FRAUD_ROLE_BASE[id] },
    ])
  ),
};

// ============================================================================
// 分析 1：ε vs 5D 认知状态
// ============================================================================

printHeader("分析 1：ε vs 5D 认知状态（ι, c, Λ）—— fraud 38 runs");

const epsVals = epsSamples.map(s => s.eps);
const iotaVals = epsSamples.map(s => s.iotaApprox);
const cVals = epsSamples.map(s => s.c);
const lambdaVals = epsSamples.map(s => s.lambda);

const epsDist = distStats(epsVals);
const iotaDist = distStats(iotaVals);
const lambdaDist = distStats(lambdaVals);

console.log(`\n  样本数 n = ${epsSamples.length} (来自 ${fraudRuns.length} 个 fraud enriched runs)`);
console.log(`  α = ${ALPHA} (已拟合)`);
console.log(`  c = ${C_CONSTANT} (Phase 2 placeholder, 常数)`);
console.log(`\n  [分布统计]`);
console.log(`  ε:    n=${epsDist.n}  mean=${fmt(epsDist.mean)}  std=${fmt(epsDist.std)}  median=${fmt(epsDist.median)}  min=${fmt(epsDist.min)}  max=${fmt(epsDist.max)}`);
console.log(`  ι:    n=${iotaDist.n}  mean=${fmt(iotaDist.mean)}  std=${fmt(iotaDist.std)}  median=${fmt(iotaDist.median)}  min=${fmt(iotaDist.min)}  max=${fmt(iotaDist.max)}`);
console.log(`  Λ:    n=${lambdaDist.n}  mean=${fmt(lambdaDist.mean)}  std=${fmt(lambdaDist.std)}  median=${fmt(lambdaDist.median)}  min=${fmt(lambdaDist.min)}  max=${fmt(lambdaDist.max)}`);

console.log(`\n  [相关性检验]  (双侧置换, 10k perms, seed=42)`);

const corrEpsIota = pearsonWithPValue(epsVals, iotaVals);
console.log(`  r(ε, ι) = ${fmt(corrEpsIota.r)}  p=${fmt(corrEpsIota.p, 4)}  n=${corrEpsIota.n}  perms=${corrEpsIota.perms}`);
console.log(`    解读: ${isNaN(corrEpsIota.r) ? "无法计算" :
  corrEpsIota.r < 0 ? "负相关——高 ι (高惯性) → 低 ε (更少偏离)，支持假设" :
  "正相关——与预期相反"}`);

// c 为常数，r(ε, c) = 0，跳过
console.log(`\n  r(ε, c) = 跳过 (c=${C_CONSTANT} 为常数，Pearson r 无定义/为 0)`);
console.log(`    限制说明: evidence.quality / evidence.coverage 不可用，c 退化为常数；`);
console.log(`    无法检验 confidence 对 ε 的预测作用，需 Phase 3 解锁 evidence 字段后重测。`);

const corrEpsLambda = pearsonWithPValue(epsVals, lambdaVals);
console.log(`\n  r(ε, Λ) = ${fmt(corrEpsLambda.r)}  p=${fmt(corrEpsLambda.p, 4)}  n=${corrEpsLambda.n}  perms=${corrEpsLambda.perms}`);
console.log(`    解读: ${isNaN(corrEpsLambda.r) ? "无法计算" :
  corrEpsLambda.r > 0 ? "正相关——高 Λ (高易感性) → 高 ε (更多偏离)，支持假设" :
  "负相关——与预期相反"}`);

// 注：Λ = max(0.675*(1-ι), 0.05)，与 ι 单调递减，故 r(ε, Λ) = -r(ε, ι) * scaling
console.log(`\n  [注] Λ = max(0.675*(1-ι), 0.05)，与 ι 单调递减；`);
console.log(`  因此 r(ε, Λ) 与 r(ε, ι) 符号相反，|r| 接近（仅当 Λ 触及 0.05 下限时略有偏差）。`);

const a1Supported = !isNaN(corrEpsIota.r) && corrEpsIota.r < 0 && corrEpsIota.p < 0.05;
const a1LambdaSupported = !isNaN(corrEpsLambda.r) && corrEpsLambda.r > 0 && corrEpsLambda.p < 0.05;

console.log(`\n  结论:`);
console.log(`    - r(ε, ι)=${fmt(corrEpsIota.r)}: ${a1Supported ? "✅ ι 显著负向预测 ε（高惯性→低偏离）" : "❌ ι 未显著预测 ε"}`);
console.log(`    - r(ε, Λ)=${fmt(corrEpsLambda.r)}: ${a1LambdaSupported ? "✅ Λ 显著正向预测 ε（高易感性→高偏离）" : "❌ Λ 未显著预测 ε"}`);
console.log(`    - c 为常数，无法检验（Phase 2 限制）`);

summary.analysis1_epsilon_vs_5d = {
  hypothesis: "5D cognitive state (ι, c, Λ) explains residual ε",
  n: epsSamples.length,
  alpha: ALPHA,
  cConstant: C_CONSTANT,
  epsilonStats: epsDist,
  iotaStats: iotaDist,
  lambdaStats: lambdaDist,
  corrEpsIota,
  corrEpsC: { skipped: true, reason: "c is constant (0.325), Pearson r undefined" },
  corrEpsLambda,
  iotaSupported: a1Supported,
  lambdaSupported: a1LambdaSupported,
  cSkipped: true,
  cSkipReason: "evidence.quality/coverage unavailable; c = 0.7*(0.5*0.5)+0.3*0.5 = 0.325 (constant)",
  note: "Λ = max(0.675*(1-ι), 0.05), monotonically decreasing in ι; r(ε,Λ) ≈ -r(ε,ι)",
};

// ============================================================================
// 分析 2：个体熵预测 opinion shift
// ============================================================================

printHeader("分析 2：个体熵 H_ind 预测 opinion shift Δb —— fraud 38 runs");

const hIndVals = entropySamples.map(s => s.hInd);
const deltaBVals = entropySamples.map(s => s.deltaB);
const hGroupVals = entropySamples.map(s => s.hGroup);

const hIndDist = distStats(hIndVals);
const deltaBDist = distStats(deltaBVals);
const hGroupDist = distStats(hGroupVals);

console.log(`\n  样本数 n = ${entropySamples.length} (来自 ${fraudRuns.length} 个 fraud enriched runs)`);
console.log(`  样本定义: (agent, t, t+1) 三元组，agent 在连续两轮均出现且 t 轮有 itemBeliefs`);
console.log(`\n  [分布统计]`);
console.log(`  H_ind:   n=${hIndDist.n}  mean=${fmt(hIndDist.mean)}  std=${fmt(hIndDist.std)}  median=${fmt(hIndDist.median)}  min=${fmt(hIndDist.min)}  max=${fmt(hIndDist.max)}`);
console.log(`  H_group: n=${hGroupDist.n}  mean=${fmt(hGroupDist.mean)}  std=${fmt(hGroupDist.std)}  median=${fmt(hGroupDist.median)}  min=${fmt(hGroupDist.min)}  max=${fmt(hGroupDist.max)}`);
console.log(`  Δb:      n=${deltaBDist.n}  mean=${fmt(deltaBDist.mean)}  std=${fmt(deltaBDist.std)}  median=${fmt(deltaBDist.median)}  min=${fmt(deltaBDist.min)}  max=${fmt(deltaBDist.max)}`);

console.log(`\n  [相关性检验]  (双侧置换, 10k perms, seed=42)`);

// 全体
const corrHIndDeltaB = pearsonWithPValue(hIndVals, deltaBVals);
console.log(`  [全体] r(H_ind, Δb) = ${fmt(corrHIndDeltaB.r)}  p=${fmt(corrHIndDeltaB.p, 4)}  n=${corrHIndDeltaB.n}`);

// 恶意
const maliciousEntropy = entropySamples.filter(s => s.isMalicious);
const corrHIndDeltaB_mal = pearsonWithPValue(
  maliciousEntropy.map(s => s.hInd),
  maliciousEntropy.map(s => s.deltaB),
);
console.log(`  [恶意] r(H_ind, Δb) = ${fmt(corrHIndDeltaB_mal.r)}  p=${fmt(corrHIndDeltaB_mal.p, 4)}  n=${corrHIndDeltaB_mal.n}`);

// 诚实
const honestEntropy = entropySamples.filter(s => !s.isMalicious);
const corrHIndDeltaB_hon = pearsonWithPValue(
  honestEntropy.map(s => s.hInd),
  honestEntropy.map(s => s.deltaB),
);
console.log(`  [诚实] r(H_ind, Δb) = ${fmt(corrHIndDeltaB_hon.r)}  p=${fmt(corrHIndDeltaB_hon.p, 4)}  n=${corrHIndDeltaB_hon.n}`);

// 对比 group-level H
const corrHGroupDeltaB = pearsonWithPValue(hGroupVals, deltaBVals);
console.log(`\n  [对比] r(H_group, Δb) = ${fmt(corrHGroupDeltaB.r)}  p=${fmt(corrHGroupDeltaB.p, 4)}  n=${corrHGroupDeltaB.n}`);

const indBetter = Math.abs(corrHIndDeltaB.r) > Math.abs(corrHGroupDeltaB.r);
console.log(`\n  解读:`);
console.log(`    - r(H_ind, Δb) = ${fmt(corrHIndDeltaB.r)}: ${!isNaN(corrHIndDeltaB.r) && corrHIndDeltaB.r > 0 && corrHIndDeltaB.p < 0.05
  ? "✅ 个体熵显著正向预测 opinion shift（高熵→大偏移）" :
  !isNaN(corrHIndDeltaB.r) && corrHIndDeltaB.p < 0.05
  ? "⚠ 个体熵显著但负相关（高熵→小偏移）"
  : "❌ 个体熵未显著预测 opinion shift"}`);
console.log(`    - 恶意 agent: r=${fmt(corrHIndDeltaB_mal.r)} (n=${corrHIndDeltaB_mal.n})`);
console.log(`    - 诚实 agent: r=${fmt(corrHIndDeltaB_hon.r)} (n=${corrHIndDeltaB_hon.n})`);
console.log(`    - 个体熵 vs 群体熵: ${indBetter ? "✅ 个体熵 (H_ind) 更好" : "⚠ 群体熵 (H_group) 更好或相当"}`);
console.log(`      |r(H_ind, Δb)|=${fmt(Math.abs(corrHIndDeltaB.r))} vs |r(H_group, Δb)|=${fmt(Math.abs(corrHGroupDeltaB.r))}`);

summary.analysis2_individual_entropy = {
  hypothesis: "Individual entropy H_ind predicts subsequent opinion shift Δb",
  n: entropySamples.length,
  hIndStats: hIndDist,
  hGroupStats: hGroupDist,
  deltaBStats: deltaBDist,
  corrHIndDeltaB_all: corrHIndDeltaB,
  corrHIndDeltaB_malicious: corrHIndDeltaB_mal,
  corrHIndDeltaB_honest: corrHIndDeltaB_hon,
  corrHGroupDeltaB: corrHGroupDeltaB,
  individualBetterThanGroup: indBetter,
  nMalicious: maliciousEntropy.length,
  nHonest: honestEntropy.length,
};

// ============================================================================
// 分析 3：Convex hull escape
// ============================================================================

printHeader("分析 3：Convex hull escape —— 169 sync + 38 async");

const syncHull = hullResults.filter(h => h.source === "sync");
const asyncHull = hullResults.filter(h => h.source === "async");

function escapeRate(results: HullResult[]): { n: number; escaped: number; rate: number } {
  const n = results.length;
  const escaped = results.filter(r => r.escaped).length;
  return { n, escaped, rate: n > 0 ? escaped / n : NaN };
}

const syncRate = escapeRate(syncHull);
const asyncRate = escapeRate(asyncHull);
const allRate = escapeRate(hullResults);

console.log(`\n  样本: sync=${syncHull.length}, async=${asyncHull.length}, total=${hullResults.length}`);

console.log(`\n  [总体逃逸率]`);
console.log(`  sync:  ${syncRate.escaped}/${syncRate.n} = ${fmt(syncRate.rate * 100, 1)}%`);
console.log(`  async: ${asyncRate.escaped}/${asyncRate.n} = ${fmt(asyncRate.rate * 100, 1)}%`);
console.log(`  total: ${allRate.escaped}/${allRate.n} = ${fmt(allRate.rate * 100, 1)}%`);

// sync 按 ablation 分组
console.log(`\n  [sync 按 ablation 分组]`);
const syncNone = syncHull.filter(h => h.ablation === "none");
const syncFull = syncHull.filter(h => h.ablation === "full");
const syncShuffle = syncHull.filter(h => h.ablation === "shuffle");
const syncFullFixed = syncHull.filter(h => h.ablation === "full_fixed");
const syncIntervention = syncHull.filter(h => h.ablation === "full" || h.ablation === "shuffle");

const rateNone = escapeRate(syncNone);
const rateFull = escapeRate(syncFull);
const rateShuffle = escapeRate(syncShuffle);
const rateFullFixed = escapeRate(syncFullFixed);
const rateIntervention = escapeRate(syncIntervention);

console.log(`  none:        ${rateNone.escaped}/${rateNone.n} = ${fmt(rateNone.rate * 100, 1)}%`);
console.log(`  full:        ${rateFull.escaped}/${rateFull.n} = ${fmt(rateFull.escaped > 0 ? rateFull.rate * 100 : 0, 1)}%`);
console.log(`  shuffle:     ${rateShuffle.escaped}/${rateShuffle.n} = ${fmt(rateShuffle.escaped > 0 ? rateShuffle.rate * 100 : 0, 1)}%`);
console.log(`  full_fixed:  ${rateFullFixed.escaped}/${rateFullFixed.n} = ${fmt(rateFullFixed.escaped > 0 ? rateFullFixed.rate * 100 : 0, 1)}%`);
console.log(`  ---`);
console.log(`  none vs full/shuffle:`);
console.log(`    none:           ${rateNone.escaped}/${rateNone.n} = ${fmt(rateNone.rate * 100, 1)}%`);
console.log(`    full+shuffle:   ${rateIntervention.escaped}/${rateIntervention.n} = ${fmt(rateIntervention.escaped > 0 ? rateIntervention.rate * 100 : 0, 1)}%`);

// async 按 malicious 分组
console.log(`\n  [async 按 malicious 分组]`);
const asyncMal = asyncHull.filter(h => h.hasMalicious === true);
const asyncNonMal = asyncHull.filter(h => h.hasMalicious === false);

const rateAsyncMal = escapeRate(asyncMal);
const rateAsyncNonMal = escapeRate(asyncNonMal);

console.log(`  malicious runs:    ${rateAsyncMal.escaped}/${rateAsyncMal.n} = ${fmt(rateAsyncMal.escaped > 0 ? rateAsyncMal.rate * 100 : 0, 1)}%`);
console.log(`  non-malicious runs: ${rateAsyncNonMal.escaped}/${rateAsyncNonMal.n} = ${fmt(rateAsyncNonMal.escaped > 0 ? rateAsyncNonMal.rate * 100 : 0, 1)}%`);

// 最大越界距离统计
const escapedResults = hullResults.filter(h => h.escaped);
const maxExcursions = escapedResults.map(h => h.maxExcursion);
const excursionStats = distStats(maxExcursions);

console.log(`\n  [逃逸幅度统计] (仅逃逸 runs)`);
if (excursionStats.n === 0) {
  console.log(`  无逃逸事件`);
} else {
  console.log(`  最大越界距离: n=${excursionStats.n}  mean=${fmt(excursionStats.mean)}  std=${fmt(excursionStats.std)}  median=${fmt(excursionStats.median)}  min=${fmt(excursionStats.min)}  max=${fmt(excursionStats.max)}`);
}

// 几个逃逸样例
console.log(`\n  [逃逸样例] (最多 5 个)`);
const examples = escapedResults.slice(0, 5);
for (const ex of examples) {
  console.log(`  ${ex.runId.padEnd(40)} source=${ex.source}  hull=[${fmt(ex.hullMin)}, ${fmt(ex.hullMax)}]  escapes=${ex.escapeCount}  rounds=[${ex.escapeRounds.join(",")}]  maxExcursion=${fmt(ex.maxExcursion)}`);
}
if (examples.length === 0) {
  console.log(`  (无逃逸样例)`);
}

console.log(`\n  解读:`);
console.log(`    - Hidden Anchors 预测：DeGroot 不能逃逸初始凸包，但 LLM agent 可能逃逸`);
console.log(`    - sync 逃逸率 = ${fmt(syncRate.rate * 100, 1)}%: ${syncRate.rate > 0 ? "存在逃逸 → 与 DeGroot 行为不一致，LLM agent 突破了初始凸包" : "无逃逸 → 行为符合 DeGroot"}`);
console.log(`    - async 逃逸率 = ${fmt(asyncRate.rate * 100, 1)}%: ${asyncRate.rate > 0 ? "存在逃逸（异步交互下更可能突破）" : "无逃逸"}`);
console.log(`    - sync none vs full/shuffle: none=${fmt(rateNone.rate * 100, 1)}% vs intervention=${fmt(rateIntervention.escaped > 0 ? rateIntervention.rate * 100 : 0, 1)}%`);

summary.analysis3_convex_hull_escape = {
  hypothesis: "Hidden Anchors: DeGroot cannot escape initial convex hull, but LLM agents might",
  total: allRate,
  sync: syncRate,
  async: asyncRate,
  syncByAblation: {
    none: rateNone,
    full: rateFull,
    shuffle: rateShuffle,
    full_fixed: rateFullFixed,
    full_union_shuffle: rateIntervention,
  },
  asyncByMalicious: {
    malicious: rateAsyncMal,
    nonMalicious: rateAsyncNonMal,
  },
  excursionStats: excursionStats.n > 0 ? excursionStats : { n: 0 },
  examples: examples.map(e => ({
    runId: e.runId,
    source: e.source,
    hullMin: e.hullMin,
    hullMax: e.hullMax,
    escapeCount: e.escapeCount,
    escapeRounds: e.escapeRounds,
    maxExcursion: e.maxExcursion,
  })),
};

// ============================================================================
// 保存 JSON
// ============================================================================

const resultsDir = path.join(V2_DIR, "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
const outPath = path.join(resultsDir, "analyze_epsilon_5d_entropy_hull.json");
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf-8");

console.log("\n" + "=".repeat(78));
console.log(`  JSON 摘要已保存：${path.relative(process.cwd(), outPath)}`);
console.log("=".repeat(78));
