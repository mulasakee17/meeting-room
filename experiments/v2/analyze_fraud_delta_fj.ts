/**
 * Fraud δ-FJ 分析 —— 在 38 个 enriched fraud-series 文件上检验 3 个假设
 *
 * 假设体系：
 *   H2-δ : 恶意 agent 的 δ = ||b| - ι_approx| 显著高于诚实 agent（可检测性）
 *   H4-δ : mean δ 与 kendallTau 相关（δ 预测决策质量）
 *   FJ   : 行为 FJ 模型 b_i(t+1) ≈ α·b_group(t) + (1-α)·b_i(0)，α ∈ [0.5, 0.9]
 *   +    : itemBeliefs 向量与 scalar belief 的投影一致性
 *
 * ι_approx 计算（近似，因 evidence.coverage / recentRefutations 不可用）：
 *   ι_approx = (0.7 * roleBase + 0.1 * expressionBased) * 0.98
 *   roleBase       = getRoleInertia(role)  [源自 cognitiveState.ts:123-140]
 *   expressionBased = 0.05 * (agent 累计发言轮次数)
 *
 * δ = ||b| - ι_approx|，b = roundResults[].opinions[].belief (LLM elicited)
 *
 * 运行：npx tsx experiments/v2/analyze_fraud_delta_fj.ts
 */

import * as fs from "fs";
import * as path from "path";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";
import { mean, sampleStd, cohensD, mulberry32, PERMUTATION_SEED } from "./statsShared";

// ============================================================================
// ι_role —— 逐字复制自 src/lib/agent/cognitiveState.ts:123-140
// （源码中 getRoleInertia / ROLE_INERTIA_RULES 未导出，故就地复制以保持自洽）
// ============================================================================

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
  return 0.4; // default
}

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

interface AgentRoleInfo {
  role: string;
  roleBase: number;
}

const FRAUD_ROLES: Record<string, AgentRoleInfo> = {};
for (const [id, role] of Object.entries(FRAUD_AGENT_ROLES)) {
  FRAUD_ROLES[id] = { role, roleBase: getRoleInertia(role) };
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
  evidence?: string[];
  itemBeliefs?: ItemBelief[];
  referencedAgents?: string[];
}

interface RoundResult {
  roundNumber: number;
  opinions?: Opinion[];
}

interface BeliefEntry {
  belief: number;
  confidence: number;
}

interface UtteranceSnapshot {
  speakerId: string;
  belief?: number;
  confidence?: number;
  referencedAgents?: string[];
  beliefsBefore?: Record<string, BeliefEntry>;
  beliefsAfter?: Record<string, BeliefEntry>;
}

interface GovernanceRound {
  roundNumber?: number;
  perUtteranceSnapshots?: UtteranceSnapshot[];
}

interface FraudRun {
  runId?: string;
  group?: string;
  runIndex?: number;
  kendallTau: number;
  decisionQuality?: number;
  maliciousAgentIds?: string[];
  roundResults?: RoundResult[];
  governanceTrace?: GovernanceRound[];
}

// δ 样本：一次 (run, round, agent)
interface DeltaSample {
  runId: string;
  group: string;
  round: number;
  agentId: string;
  role: string;
  roleBase: number;
  roundsSpoken: number; // 累计发言轮次（含当前轮）
  expressionBased: number;
  iotaApprox: number;
  b: number;
  absB: number;
  delta: number;
  isMalicious: boolean;
  kendallTau: number;
}

// ============================================================================
// 数据加载
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
      const hasOpinions = raw.roundResults.some(r => Array.isArray(r.opinions) && r.opinions.length > 0);
      if (!hasOpinions) continue;
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

// ============================================================================
// ι_approx 与 δ 计算
// ============================================================================

/**
 * 计算单个 run 的所有 δ 样本。
 * expressionBased 按累计发言轮次计算（含当前轮）。
 */
function computeDeltaSamples(run: FraudRun): DeltaSample[] {
  const samples: DeltaSample[] = [];
  const maliciousSet = new Set(run.maliciousAgentIds ?? []);
  const rounds = run.roundResults ?? [];

  // 先统计每个 agent 的累计发言轮次
  const spokenCount: Record<string, number> = {};

  for (const round of rounds) {
    const roundNum = typeof round.roundNumber === "number" ? round.roundNumber : 0;
    const opinions = Array.isArray(round.opinions) ? round.opinions : [];
    // 本轮发言的 agent 集合
    const spokeThisRound = new Set(opinions.map(o => o.agentId));

    // 更新累计发言计数（含当前轮）
    for (const agentId of spokeThisRound) {
      spokenCount[agentId] = (spokenCount[agentId] ?? 0) + 1;
    }

    for (const op of opinions) {
      const agentId = op.agentId;
      const roleInfo = FRAUD_ROLES[agentId];
      if (!roleInfo) continue; // 未知 agent
      const b = op.belief;
      if (typeof b !== "number" || isNaN(b)) continue;

      const roundsSpoken = spokenCount[agentId] ?? 0;
      const expressionBased = 0.05 * roundsSpoken;
      const iotaApprox = (0.7 * roleInfo.roleBase + 0.1 * expressionBased) * 0.98;
      const absB = Math.abs(b);
      const delta = Math.abs(absB - iotaApprox);

      samples.push({
        runId: run.runId!,
        group: run.group ?? "unknown",
        round: roundNum,
        agentId,
        role: roleInfo.role,
        roleBase: roleInfo.roleBase,
        roundsSpoken,
        expressionBased,
        iotaApprox,
        b,
        absB,
        delta,
        isMalicious: maliciousSet.has(agentId),
        kendallTau: run.kendallTau,
      });
    }
  }
  return samples;
}

const allSamples: DeltaSample[] = [];
for (const run of allRuns) {
  allSamples.push(...computeDeltaSamples(run));
}
const maliciousSamples = allSamples.filter(s => s.isMalicious);
const honestSamplesInMaliciousRuns = allSamples.filter(
  s => !s.isMalicious && maliciousRuns.some(r => r.runId === s.runId)
);

// ============================================================================
// 统计工具
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
 * 均值差置换检验（单侧：δ_malicious > δ_honest?）
 * 返回 observed_diff (mean_malicious - mean_honest), p_value (单侧), perms
 */
function meanDiffPermutationTest(
  maliciousVals: number[],
  honestVals: number[],
  perms = 10000,
): { observedDiff: number; meanMalicious: number; meanHonest: number; p: number; perms: number; nMalicious: number; nHonest: number } {
  const meanM = mean(maliciousVals);
  const meanH = mean(honestVals);
  const observedDiff = meanM - meanH;

  // 合并值与标签
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
    iotaFormula: "ι_approx = (0.7 * roleBase + 0.1 * expressionBased) * 0.98",
    deltaFormula: "δ = ||b| - ι_approx|",
    expressionBasedFormula: "expressionBased = 0.05 * (累计发言轮次，含当前轮)",
    runsLoaded: {
      allEnriched: allRuns.length,
      malicious: maliciousRuns.length,
      nonMalicious: allRuns.length - maliciousRuns.length,
    },
    samplesGenerated: allSamples.length,
  },
  roleInertia: Object.fromEntries(
    Object.entries(FRAUD_ROLES).map(([id, info]) => [
      id,
      { role: info.role, roleBase: info.roleBase },
    ])
  ),
};

console.log(`\n数据加载：enriched fraud runs = ${allRuns.length} (malicious=${maliciousRuns.length}, non-malicious=${allRuns.length - maliciousRuns.length})`);
console.log(`δ 样本总数：${allSamples.length} (malicious=${maliciousSamples.length}, honest-in-malicious-runs=${honestSamplesInMaliciousRuns.length})`);

// ============================================================================
// 分析 1：H2-δ —— 恶意 agent 检测
// ============================================================================

printHeader("分析 1：H2-δ —— δ 能否区分恶意 agent 与诚实 agent");

const maliciousDeltas = maliciousSamples.map(s => s.delta);
const honestDeltas = honestSamplesInMaliciousRuns.map(s => s.delta);

const distMal = distStats(maliciousDeltas);
const distHon = distStats(honestDeltas);

console.log(`\n  样本来源：${maliciousRuns.length} 个恶意文件 (E/F/G groups)`);
console.log(`  恶意 agent δ：  n=${distMal.n}  mean=${fmt(distMal.mean)}  std=${fmt(distMal.std)}  median=${fmt(distMal.median)}  Q1=${fmt(distMal.q1)}  Q3=${fmt(distMal.q3)}  min=${fmt(distMal.min)}  max=${fmt(distMal.max)}`);
console.log(`  诚实 agent δ：  n=${distHon.n}  mean=${fmt(distHon.mean)}  std=${fmt(distHon.std)}  median=${fmt(distHon.median)}  Q1=${fmt(distHon.q1)}  Q3=${fmt(distHon.q3)}  min=${fmt(distHon.min)}  max=${fmt(distHon.max)}`);

const permTest1 = meanDiffPermutationTest(maliciousDeltas, honestDeltas, 10000);
const cohenD1 = cohensD(maliciousDeltas, honestDeltas);

console.log(`\n  均值差 (malicious - honest) = ${fmt(permTest1.observedDiff)}`);
console.log(`  Cohen's d = ${fmt(cohenD1)}`);
console.log(`  单侧置换检验 (H1: δ_malicious > δ_honest, 10k perms, seed=42)`);
console.log(`    p = ${fmt(permTest1.p, 4)}`);

const h2Supported = permTest1.observedDiff > 0 && permTest1.p < 0.05;
console.log(`\n  解读：`);
console.log(`    - δ_malicious (${fmt(permTest1.meanMalicious)}) vs δ_honest (${fmt(permTest1.meanHonest)})`);
console.log(`    - ${permTest1.observedDiff > 0 ? "恶意 agent δ 更高" : "恶意 agent δ 更低（与预期相反）"}，Cohen's d=${fmt(cohenD1)}（${Math.abs(cohenD1) < 0.2 ? "可忽略" : Math.abs(cohenD1) < 0.5 ? "小" : Math.abs(cohenD1) < 0.8 ? "中" : "大"}效应）`);
console.log(`    - ${h2Supported ? "✅ H2-δ 得到支持：δ 能区分恶意与诚实 agent" : "❌ H2-δ 未得到支持：δ 不能显著区分恶意与诚实 agent"}`);

summary.analysis1_H2_delta = {
  hypothesis: "H2-δ: malicious agents have higher δ than honest agents",
  maliciousDeltaStats: distMal,
  honestDeltaStats: distHon,
  permutationTest: permTest1,
  cohensD: cohenD1,
  supported: h2Supported,
};

// ============================================================================
// 分析 2：H4-δ —— δ vs 决策质量 (kendallTau)
// ============================================================================

printHeader("分析 2：H4-δ —— mean δ vs kendallTau（38 enriched 文件）");

// 每个文件的 mean δ（跨 agent 与 round）
const deltaByRun = new Map<string, number[]>();
for (const s of allSamples) {
  if (!deltaByRun.has(s.runId)) deltaByRun.set(s.runId, []);
  deltaByRun.get(s.runId)!.push(s.delta);
}

const runDeltas: number[] = [];
const runTaus: number[] = [];
const runIds: string[] = [];
for (const run of allRuns) {
  const ds = deltaByRun.get(run.runId!);
  if (ds === undefined || ds.length === 0) continue;
  runDeltas.push(mean(ds));
  runTaus.push(run.kendallTau);
  runIds.push(run.runId!);
}

const corr2 = pearsonWithPValue(runDeltas, runTaus);

console.log(`\n  文件数：${corr2.n}`);
console.log(`  r(mean δ, kendallTau) = ${fmt(corr2.r)}  p=${fmt(corr2.p, 4)}  (perms=${corr2.perms})`);
console.log(`  mean δ = ${fmt(mean(runDeltas))}  mean τ = ${fmt(mean(runTaus))}`);
console.log(`\n  对比 sync 结果：r=0.094, p=0.22`);
console.log(`    - 当前 r=${fmt(corr2.r)} vs sync r=0.094`);
console.log(`    - 当前 p=${fmt(corr2.p, 4)} vs sync p=0.22`);
console.log(`    - ${Math.abs(corr2.r) < 0.1 ? "弱相关（与 sync 一致）" : "相关强度有差异"}`);
console.log(`    - 负 r 表示高 δ → 低 τ（支持 H4-δ）；当前 r 符号=${corr2.r < 0 ? "负（支持 H4-δ）" : "正（不支持 H4-δ）"}`);

summary.analysis2_H4_delta = {
  hypothesis: "H4-δ: mean δ negatively correlates with kendallTau",
  n: corr2.n,
  r: corr2.r,
  p: corr2.p,
  perms: corr2.perms,
  meanDelta: mean(runDeltas),
  meanTau: mean(runTaus),
  syncComparison: { syncR: 0.094, syncP: 0.22 },
};

// ============================================================================
// 分析 3：行为 FJ 拟合
// ============================================================================

printHeader("分析 3：行为 FJ 拟合 —— b_i(t+1) ≈ α·b_group(t) + (1-α)·b_i(0)");

interface FJFit {
  runId: string;
  agentId: string;
  alpha: number;
  nTransitions: number;
  sse: number; // 残差平方和
}

const fjFits: FJFit[] = [];
let filesWithoutSnapshots = 0;

for (const run of allRuns) {
  const trace = run.governanceTrace;
  if (!Array.isArray(trace) || trace.length === 0) {
    filesWithoutSnapshots++;
    continue;
  }

  // 展平所有 perUtteranceSnapshots（按 round 顺序，再按 utterance 顺序）
  const allSnapshots: UtteranceSnapshot[] = [];
  for (const gr of trace) {
    if (Array.isArray(gr.perUtteranceSnapshots)) {
      allSnapshots.push(...gr.perUtteranceSnapshots);
    }
  }
  if (allSnapshots.length < 2) {
    filesWithoutSnapshots++;
    continue;
  }

  // b_i(0)：第一个 snapshot 的 beliefsBefore
  const firstSnap = allSnapshots[0];
  const beliefs0 = firstSnap.beliefsBefore ?? {};

  // 对每个 agent 拟合 α
  const agentIds = Object.keys(FRAUD_ROLES);
  for (const agentId of agentIds) {
    const b0Entry = beliefs0[agentId];
    if (!b0Entry || typeof b0Entry.belief !== "number") continue;
    const b0 = b0Entry.belief;

    // 收集 (d_x, d_y) 对
    const dxs: number[] = [];
    const dys: number[] = [];
    for (const snap of allSnapshots) {
      const before = snap.beliefsBefore?.[agentId];
      const after = snap.beliefsAfter?.[agentId];
      if (!before || !after) continue;
      if (typeof before.belief !== "number" || typeof after.belief !== "number") continue;

      const bAfter = after.belief; // b_i(t+1)
      const bBefore = before.belief; // b_i(t)

      // 跳过 no-op 转换
      if (bAfter === bBefore) continue;

      // b_group(t) = mean of all agents' beliefsBefore
      const beforeMap = snap.beliefsBefore ?? {};
      const groupBeliefs: number[] = [];
      for (const aid of agentIds) {
        const be = beforeMap[aid];
        if (be && typeof be.belief === "number") groupBeliefs.push(be.belief);
      }
      if (groupBeliefs.length === 0) continue;
      const bGroup = mean(groupBeliefs);

      const d_y = bAfter - b0;
      const d_x = bGroup - b0;
      dxs.push(d_x);
      dys.push(d_y);
    }

    if (dxs.length < 1) continue;

    // 最小二乘：d_y = α * d_x (过原点)
    let num = 0, den = 0;
    for (let i = 0; i < dxs.length; i++) {
      num += dxs[i] * dys[i];
      den += dxs[i] * dxs[i];
    }
    if (den === 0) continue; // 无法拟合
    const alpha = num / den;

    // 残差平方和
    let sse = 0;
    for (let i = 0; i < dxs.length; i++) {
      const pred = alpha * dxs[i] + b0; // = alpha * bGroup + (1-alpha) * b0
      const actual = dys[i] + b0; // = bAfter
      sse += (actual - pred) ** 2;
    }

    fjFits.push({
      runId: run.runId!,
      agentId,
      alpha,
      nTransitions: dxs.length,
      sse,
    });
  }
}

const alphas = fjFits.map(f => f.alpha);
const alphaStats = distStats(alphas);
const inRange = alphas.filter(a => a >= 0.5 && a <= 0.9);
const inRangeFrac = alphas.length > 0 ? inRange.length / alphas.length : 0;

console.log(`\n  跳过无 perUtteranceSnapshots 的文件：${filesWithoutSnapshots}`);
console.log(`  拟合的 (agent, file) 对数：${fjFits.length}`);
console.log(`  α 分布：n=${alphaStats.n}  mean=${fmt(alphaStats.mean)}  std=${fmt(alphaStats.std)}  median=${fmt(alphaStats.median)}  Q1=${fmt(alphaStats.q1)}  Q3=${fmt(alphaStats.q3)}  min=${fmt(alphaStats.min)}  max=${fmt(alphaStats.max)}`);
console.log(`  α ∈ [0.5, 0.9] 的比例：${fmt(inRangeFrac * 100, 1)}% (${inRange.length}/${alphas.length})`);

// 按 agent 分组统计
console.log(`\n  按 agent 分组：`);
console.log(`  ${"agent".padEnd(7)} ${"role".padEnd(16)} ${"n".padStart(5)} ${"meanα".padStart(8)} ${"medα".padStart(8)} ${"in[0.5,0.9]%".padStart(13)}`);
const alphaByAgent: Record<string, number[]> = {};
for (const f of fjFits) {
  if (!alphaByAgent[f.agentId]) alphaByAgent[f.agentId] = [];
  alphaByAgent[f.agentId].push(f.alpha);
}
const alphaByAgentStats: Record<string, DistStats & { inRangeFrac: number }> = {};
for (const agentId of Object.keys(FRAUD_ROLES).sort()) {
  const vals = alphaByAgent[agentId] ?? [];
  if (vals.length === 0) {
    console.log(`  ${agentId.padEnd(7)} ${FRAUD_ROLES[agentId].role.padEnd(16)} ${"0".padStart(5)} ${"-".padStart(8)} ${"-".padStart(8)} ${"-".padStart(13)}`);
    continue;
  }
  const st = distStats(vals);
  const ir = vals.filter(a => a >= 0.5 && a <= 0.9).length;
  alphaByAgentStats[agentId] = { ...st, inRangeFrac: ir / vals.length };
  console.log(`  ${agentId.padEnd(7)} ${FRAUD_ROLES[agentId].role.padEnd(16)} ${String(st.n).padStart(5)} ${fmt(st.mean).padStart(8)} ${fmt(st.median).padStart(8)} ${fmt(ir / vals.length * 100, 1).padStart(12)}%`);
}

console.log(`\n  解读：`);
console.log(`    - 总体 mean α = ${fmt(alphaStats.mean)}，${alphaStats.mean >= 0.5 && alphaStats.mean <= 0.9 ? "在 [0.5, 0.9] 区间内 ✅" : "不在 [0.5, 0.9] 区间内 ❌"}`);
console.log(`    - ${inRangeFrac > 0.5 ? "多数" : "少数"} α 值落在假设区间 [0.5, 0.9]（${fmt(inRangeFrac * 100, 1)}%）`);
console.log(`    - ${alphaStats.mean >= 0.5 && alphaStats.mean <= 0.9 ? "✅ FJ 假设得到支持" : "❌ FJ 假设未得到支持（α 不在预期区间）"}`);

summary.analysis3_FJ = {
  hypothesis: "FJ: behavioral α ∈ [0.5, 0.9]",
  filesWithoutSnapshots,
  nFits: fjFits.length,
  alphaStats,
  inRangeFraction: inRangeFrac,
  inRangeCount: inRange.length,
  alphaByAgent: alphaByAgentStats,
  supported: alphaStats.mean >= 0.5 && alphaStats.mean <= 0.9,
};

// ============================================================================
// 分析 4：itemBeliefs vs scalar belief
// ============================================================================

printHeader("分析 4：itemBeliefs 向量 vs scalar belief（投影一致性）");

const umaxVals: number[] = [];
const unormVals: number[] = [];
const absScalarVals: number[] = [];

for (const run of allRuns) {
  const rounds = run.roundResults ?? [];
  for (const round of rounds) {
    const opinions = Array.isArray(round.opinions) ? round.opinions : [];
    for (const op of opinions) {
      if (typeof op.belief !== "number") continue;
      const items = Array.isArray(op.itemBeliefs) ? op.itemBeliefs : [];
      if (items.length === 0) continue;
      const u = items.map(it => (typeof it.belief === "number" ? it.belief : 0));
      const absU = u.map(v => Math.abs(v));
      const umax = Math.max(...absU);
      const unorm = Math.sqrt(u.reduce((s, v) => s + v * v, 0));
      umaxVals.push(umax);
      unormVals.push(unorm);
      absScalarVals.push(Math.abs(op.belief));
    }
  }
}

const corrMax = pearsonWithPValue(umaxVals, absScalarVals);
const corrNorm = pearsonWithPValue(unormVals, absScalarVals);

console.log(`\n  样本数（agent-opinion）：${corrMax.n}`);
console.log(`  r(|u|_max, |scalar_belief|) = ${fmt(corrMax.r)}  p=${fmt(corrMax.p, 4)}  (perms=${corrMax.perms})`);
console.log(`  r(||u||_2, |scalar_belief|) = ${fmt(corrNorm.r)}  p=${fmt(corrNorm.p, 4)}  (perms=${corrNorm.perms})`);
console.log(`\n  解读：`);
console.log(`    - r(|u|_max, |b|)=${fmt(corrMax.r)}：scalar belief 与最强 item commitment ${Math.abs(corrMax.r) > 0.5 ? "强相关" : Math.abs(corrMax.r) > 0.3 ? "中等相关" : "弱相关"}`);
console.log(`    - r(||u||_2, |b|)=${fmt(corrNorm.r)}：scalar belief 与 utility 向量范数 ${Math.abs(corrNorm.r) > 0.5 ? "强相关" : Math.abs(corrNorm.r) > 0.3 ? "中等相关" : "弱相关"}`);
console.log(`    - ${Math.abs(corrMax.r) > 0.5 && Math.abs(corrNorm.r) > 0.5 ? "✅ scalar belief 是 utility 向量的合理投影" : "⚠ scalar belief 与 utility 向量投影一致性较弱"}`);

summary.analysis4_itemBeliefs = {
  hypothesis: "scalar belief is a reasonable projection of the utility vector",
  n: corrMax.n,
  r_absUmax_absScalar: corrMax,
  r_unorm_absScalar: corrNorm,
};

// ============================================================================
// 保存 JSON
// ============================================================================

const resultsDir = path.join(V2_DIR, "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
const outPath = path.join(resultsDir, "analyze_fraud_delta_fj.json");
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf-8");

console.log("\n" + "=".repeat(78));
console.log(`  JSON 摘要已保存：${path.relative(process.cwd(), outPath)}`);
console.log("=".repeat(78));
