/**
 * δ = ||b| - ι_role| 分布分析 —— 主观-客观承诺缺口
 *
 * 背景：
 *   169 次闭环实验（data_crisis 80 + data_supplier 89）中，每个 agent 每轮的
 *   信念 b 由 sync engine 直接从 LLM  elicited（非平均）。本脚本计算：
 *
 *     δ = ||b| - ι_role|
 *
 *   - |b|     = LLM stated belief 的绝对值（承诺强度，方向舍弃）
 *   - ι_role  = 基于 agent 角色字符串的角色惯性（getRoleInertia 关键词匹配）
 *
 *   ι_role 是完整 ι 的简化近似（完整 ι 还含 evidence/expression/refutation 项，
 *   但 169 runs 未存储这些字段，无法计算）。角色项在完整公式中权重 0.7：
 *     ι = (0.7*roleBase + 0.2*evidenceBased + 0.1*expressionBased - refutations*0.1) * 0.98
 *
 *   ι_role 计算规则源自 src/lib/agent/cognitiveState.ts:123-140（getRoleInertia
 *   未导出，此处就地复制以保持自洽；规则与源码逐字一致）。
 *
 * 运行：npx tsx experiments/v2/analyze_delta_distribution.ts
 */

import * as fs from "fs";
import * as path from "path";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";
import { mean, sampleStd, mulberry32, PERMUTATION_SEED } from "./statsShared";
import { TASK_CRISIS } from "./task_crisis";
import { TASK_SUPPLIER } from "./task_supplier";

// ============================================================================
// ι_role —— 逐字复制自 src/lib/agent/cognitiveState.ts:123-140
// （源码中 getRoleInertia / ROLE_INERTIA_RULES 未导出，故就地复制）
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
// Agent 角色表（从 task 配置运行时构建，role 字符串变化时自动跟进）
// ============================================================================

interface AgentRoleInfo {
  role: string;
  inertia: number;
}

function buildRoleMap(task: typeof TASK_CRISIS): Map<string, AgentRoleInfo> {
  const m = new Map<string, AgentRoleInfo>();
  for (const a of task.agents) {
    m.set(a.id, { role: a.role, inertia: getRoleInertia(a.role) });
  }
  return m;
}

const CRISIS_ROLES = buildRoleMap(TASK_CRISIS);
const SUPPLIER_ROLES = buildRoleMap(TASK_SUPPLIER);

// ============================================================================
// 类型
// ============================================================================

type TaskName = "crisis" | "supplier";

interface RoundData {
  roundNumber: number;
  beliefs?: Record<string, number>;
  confidences?: Record<string, number>;
  interventions?: unknown[];
  issues?: unknown[];
}

interface RunData {
  runId: string;
  ablation: string;
  kendallTau: number;
  totalRounds?: number;
  rounds: RoundData[];
}

/** 单条观测：一次 (run, round, agent) */
interface DeltaSample {
  runId: string;
  task: TaskName;
  ablation: string; // 已归一化（full_fixed → full）
  round: number;
  agentId: string;
  role: string;
  inertia: number;
  b: number;
  absB: number;
  delta: number;
  confidence: number | null;
  kendallTau: number;
}

// ============================================================================
// 数据加载
// ============================================================================

const V2_DIR = path.resolve(__dirname);

/** 归一化 ablation：full_fixed → full */
function normalizeAblation(a: string): string {
  return a === "full_fixed" ? "full" : a;
}

function loadDir(dir: string, task: TaskName): RunData[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(
    f => f.endsWith(".json") && f !== "summary.json"
  );
  const runs: RunData[] = [];
  for (const f of files) {
    const raw = safeJsonParse<RunData & { error?: string }>(
      fs.readFileSync(path.join(dir, f), "utf-8")
    );
    if (!raw || raw.error) continue;
    if (!Array.isArray(raw.rounds) || typeof raw.kendallTau !== "number") continue;
    runs.push({
      runId: raw.runId ?? f,
      ablation: normalizeAblation(raw.ablation ?? "unknown"),
      kendallTau: raw.kendallTau,
      totalRounds: raw.totalRounds,
      rounds: raw.rounds,
    });
  }
  return runs;
}

const crisisRuns = loadDir(path.join(V2_DIR, "data_crisis"), "crisis");
const supplierRuns = loadDir(path.join(V2_DIR, "data_supplier"), "supplier");
const allRuns = [
  ...crisisRuns.map(r => ({ ...r, task: "crisis" as TaskName })),
  ...supplierRuns.map(r => ({ ...r, task: "supplier" as TaskName })),
];

// ============================================================================
// 构建 δ 样本
// ============================================================================

const samples: DeltaSample[] = [];

for (const run of allRuns) {
  const roleMap = run.task === "crisis" ? CRISIS_ROLES : SUPPLIER_ROLES;
  for (const round of run.rounds) {
    const beliefs = round.beliefs ?? {};
    const confidences = round.confidences ?? {};
    const roundNum = typeof round.roundNumber === "number" ? round.roundNumber : 0;
    for (const agentId of Object.keys(beliefs)) {
      const roleInfo = roleMap.get(agentId);
      if (!roleInfo) continue; // 未知 agent，跳过
      const b = beliefs[agentId];
      if (typeof b !== "number" || isNaN(b)) continue;
      const absB = Math.abs(b);
      const delta = Math.abs(absB - roleInfo.inertia);
      const conf = confidences[agentId];
      samples.push({
        runId: run.runId,
        task: run.task,
        ablation: run.ablation,
        round: roundNum,
        agentId,
        role: roleInfo.role,
        inertia: roleInfo.inertia,
        b,
        absB,
        delta,
        confidence: typeof conf === "number" ? conf : null,
        kendallTau: run.kendallTau,
      });
    }
  }
}

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

interface CorrResult {
  r: number;
  n: number;
  p: number; // 双侧置换检验 p 值
  perms: number;
}

/**
 * Pearson 相关系数 + 置换检验 p 值（mulberry32 seed=42，可复现）。
 * 双侧 p = P(|r_perm| >= |r_obs|) under H0 (x 与 y 独立)。
 */
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

function pearsonR(x: number[], y: number[]): number {
  const n = x.length;
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

interface DistStats {
  n: number;
  mean: number;
  std: number; // 样本标准差
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

/** 单次 run 的平均 δ（跨 agent 与 round） */
function meanDeltaPerRun(sampleList: DeltaSample[]): Map<string, number> {
  const byRun = new Map<string, number[]>();
  for (const s of sampleList) {
    if (!byRun.has(s.runId)) byRun.set(s.runId, []);
    byRun.get(s.runId)!.push(s.delta);
  }
  const result = new Map<string, number>();
  for (const [runId, ds] of byRun) result.set(runId, mean(ds));
  return result;
}

/** 单次 run 的 (mean δ, kendallTau) 配对 */
function runDeltaTauPairs(sampleList: DeltaSample[], runs: Array<{ runId: string; kendallTau: number; task: TaskName; ablation: string }>): { deltas: number[]; taus: number[]; runIds: string[] } {
  const meanDelta = meanDeltaPerRun(sampleList);
  const deltas: number[] = [];
  const taus: number[] = [];
  const runIds: string[] = [];
  for (const r of runs) {
    const d = meanDelta.get(r.runId);
    if (d === undefined) continue;
    deltas.push(d);
    taus.push(r.kendallTau);
    runIds.push(r.runId);
  }
  return { deltas, taus, runIds };
}

// ============================================================================
// 输出容器
// ============================================================================

const summary: Record<string, unknown> = {
  meta: {
    generatedAt: new Date().toISOString(),
    seed: PERMUTATION_SEED,
    permutationCount: 10000,
    inertiaFormula: "ι_role = getRoleInertia(role) [simplified; full ι has role weight 0.7]",
    deltaFormula: "δ = ||b| - ι_role|",
    runsLoaded: { crisis: crisisRuns.length, supplier: supplierRuns.length, total: allRuns.length },
    samplesGenerated: samples.length,
  },
  roleInertia: {
    crisis: Object.fromEntries(
      [...CRISIS_ROLES.entries()].map(([id, info]) => [id, { role: info.role, inertia: info.inertia }])
    ),
    supplier: Object.fromEntries(
      [...SUPPLIER_ROLES.entries()].map(([id, info]) => [id, { role: info.role, inertia: info.inertia }])
    ),
  },
};

// ============================================================================
// 分析 1：δ 分布
// ============================================================================

function printHeader(title: string) {
  console.log("\n" + "=".repeat(78));
  console.log("  " + title);
  console.log("=".repeat(78));
}

printHeader("分析 1：δ 分布（overall / by task / by ablation / by round）");

const allDeltas = samples.map(s => s.delta);
const overall = distStats(allDeltas);
console.log(`\n  [Overall]  n=${overall.n}  mean=${fmt(overall.mean)}  std=${fmt(overall.std)}  median=${fmt(overall.median)}  Q1=${fmt(overall.q1)}  Q3=${fmt(overall.q3)}  min=${fmt(overall.min)}  max=${fmt(overall.max)}`);

const byTask: Record<string, DistStats> = {};
for (const t of ["crisis", "supplier"] as TaskName[]) {
  const d = distStats(samples.filter(s => s.task === t).map(s => s.delta));
  byTask[t] = d;
  console.log(`  [Task ${t}]  n=${d.n}  mean=${fmt(d.mean)}  std=${fmt(d.std)}  median=${fmt(d.median)}  Q1=${fmt(d.q1)}  Q3=${fmt(d.q3)}`);
}

const byAblation: Record<string, DistStats> = {};
const ablations = [...new Set(samples.map(s => s.ablation))].sort();
for (const a of ablations) {
  const d = distStats(samples.filter(s => s.ablation === a).map(s => s.delta));
  byAblation[a] = d;
  console.log(`  [Ablation ${a}]  n=${d.n}  mean=${fmt(d.mean)}  std=${fmt(d.std)}  median=${fmt(d.median)}  Q1=${fmt(d.q1)}  Q3=${fmt(d.q3)}`);
}

const byRound: Record<number, DistStats> = {};
const rounds = [...new Set(samples.map(s => s.round))].sort((a, b) => a - b);
console.log("  [By round]  (δ 是否随轮次变化)");
for (const r of rounds) {
  const d = distStats(samples.filter(s => s.round === r).map(s => s.delta));
  byRound[r] = d;
  console.log(`    round ${r}:  n=${d.n}  mean=${fmt(d.mean)}  std=${fmt(d.std)}  median=${fmt(d.median)}`);
}

summary.analysis1_deltaDistribution = {
  overall,
  byTask,
  byAblation,
  byRound,
};

// ============================================================================
// 分析 2：H1-δ —— δ 预测干预有效性（intervention vs baseline）
// ============================================================================

printHeader("分析 2：H1-δ —— δ 预测干预有效性（intervention runs vs none baseline）");

// 干预 runs = full ∪ shuffle；baseline = none
const interventionRunsArr = allRuns.filter(r => r.ablation === "full" || r.ablation === "shuffle");
const baselineRunsArr = allRuns.filter(r => r.ablation === "none");
const interventionSamples = samples.filter(s => s.ablation === "full" || s.ablation === "shuffle");
const baselineSamples = samples.filter(s => s.ablation === "none");

const intvPairs = runDeltaTauPairs(interventionSamples, interventionRunsArr);
const basePairs = runDeltaTauPairs(baselineSamples, baselineRunsArr);

const corrIntv = pearsonWithPValue(intvPairs.deltas, intvPairs.taus);
const corrBase = pearsonWithPValue(basePairs.deltas, basePairs.taus);

console.log(`\n  Intervention runs (full ∪ shuffle):  n_runs=${interventionRunsArr.length}`);
console.log(`    r(mean δ, kendallTau) = ${fmt(corrIntv.r)}  p=${fmt(corrIntv.p, 4)}  (perms=${corrIntv.perms})`);
console.log(`    mean δ = ${fmt(mean(intvPairs.deltas))}  mean τ = ${fmt(mean(intvPairs.taus))}`);
console.log(`\n  Baseline runs (none):                 n_runs=${baselineRunsArr.length}`);
console.log(`    r(mean δ, kendallTau) = ${fmt(corrBase.r)}  p=${fmt(corrBase.p, 4)}  (perms=${corrBase.perms})`);
console.log(`    mean δ = ${fmt(mean(basePairs.deltas))}  mean τ = ${fmt(mean(basePairs.taus))}`);

const intvStronger = Math.abs(corrIntv.r) > Math.abs(corrBase.r);
console.log(`\n  解读：`);
console.log(`    - 干预组 |r|=${fmt(Math.abs(corrIntv.r))} vs 基线 |r|=${fmt(Math.abs(corrBase.r))}`);
console.log(`    - δ-τ 相关在${intvStronger ? "干预组更强" : "基线更强（或相当）"}。`);
console.log(`    - 高 δ 是否对应低 τ？干预组 r 符号=${corrIntv.r < 0 ? "负（高δ→低τ，符合H1）" : "正（不符合H1）"}；基线 r 符号=${corrBase.r < 0 ? "负" : "正"}。`);

summary.analysis2_H1_delta = {
  hypothesis: "H1-δ: δ predicts intervention effectiveness (high δ → lower τ, stronger in intervention runs)",
  interventionRuns: { n: interventionRunsArr.length, r: corrIntv.r, p: corrIntv.p, meanDelta: mean(intvPairs.deltas), meanTau: mean(intvPairs.taus) },
  baselineRuns: { n: baselineRunsArr.length, r: corrBase.r, p: corrBase.p, meanDelta: mean(basePairs.deltas), meanTau: mean(basePairs.taus) },
  interventionCorrelationStronger: intvStronger,
};

// ============================================================================
// 分析 3：H4-δ —— δ vs 决策质量（整体 + 分任务 + 分消融）
// ============================================================================

printHeader("分析 3：H4-δ —— mean δ vs kendallTau（整体 / 分任务 / 分消融）");

const allPairs = runDeltaTauPairs(samples, allRuns);
const corrAll = pearsonWithPValue(allPairs.deltas, allPairs.taus);
console.log(`\n  [All runs]            n=${corrAll.n}  r=${fmt(corrAll.r)}  p=${fmt(corrAll.p, 4)}`);

const crisisPairs = runDeltaTauPairs(samples, crisisRuns.map(r => ({ ...r, task: "crisis" as TaskName })));
const supplierPairs = runDeltaTauPairs(samples, supplierRuns.map(r => ({ ...r, task: "supplier" as TaskName })));
const corrCrisis = pearsonWithPValue(crisisPairs.deltas, crisisPairs.taus);
const corrSupplier = pearsonWithPValue(supplierPairs.deltas, supplierPairs.taus);
console.log(`  [Crisis only]         n=${corrCrisis.n}  r=${fmt(corrCrisis.r)}  p=${fmt(corrCrisis.p, 4)}`);
console.log(`  [Supplier only]       n=${corrSupplier.n}  r=${fmt(corrSupplier.r)}  p=${fmt(corrSupplier.p, 4)}`);

console.log(`\n  [By ablation]`);
const corrByAblation: Record<string, CorrResult> = {};
for (const a of ablations) {
  const runSubset = allRuns.filter(r => r.ablation === a);
  const pairs = runDeltaTauPairs(samples, runSubset);
  const c = pearsonWithPValue(pairs.deltas, pairs.taus);
  corrByAblation[a] = c;
  console.log(`    ${a.padEnd(10)}  n=${c.n}  r=${fmt(c.r)}  p=${fmt(c.p, 4)}`);
}

console.log(`\n  解读：`);
console.log(`    - 整体 r=${fmt(corrAll.r)}（${Math.abs(corrAll.r) < 0.1 ? "弱" : Math.abs(corrAll.r) < 0.3 ? "中弱" : "较强"}相关），p=${fmt(corrAll.p, 4)}。`);
console.log(`    - 负 r 表示高 δ（承诺偏离角色惯性）→ 低 τ（决策质量差），支持 H4-δ。`);

summary.analysis3_H4_delta = {
  hypothesis: "H4-δ: mean δ negatively correlates with kendallTau",
  overall: corrAll,
  byTask: { crisis: corrCrisis, supplier: corrSupplier },
  byAblation: corrByAblation,
};

// ============================================================================
// 分析 4：δ 与 confidence
// ============================================================================

printHeader("分析 4：δ 与 confidence（测试 δ 是否捕获 confidence 之外的信息）");

const confSamples = samples.filter(s => s.confidence !== null);
const absBVals = confSamples.map(s => s.absB);
const deltaVals = confSamples.map(s => s.delta);
const confVals = confSamples.map(s => s.confidence as number);

const corrAbsBConf = pearsonWithPValue(absBVals, confVals);
const corrDeltaConf = pearsonWithPValue(deltaVals, confVals);

console.log(`\n  [r(|b|, confidence)]   n=${corrAbsBConf.n}  r=${fmt(corrAbsBConf.r)}  p=${fmt(corrAbsBConf.p, 4)}`);
console.log(`  [r(δ, confidence)]      n=${corrDeltaConf.n}  r=${fmt(corrDeltaConf.r)}  p=${fmt(corrDeltaConf.p, 4)}`);

console.log(`\n  解读：`);
console.log(`    - r(|b|, confidence)=${fmt(corrAbsBConf.r)}：高承诺是否伴随高 confidence。`);
console.log(`    - r(δ, confidence)=${fmt(corrDeltaConf.r)}：δ 与 confidence 的相关${Math.abs(corrDeltaConf.r) < 0.2 ? "很弱，δ 捕获了 confidence 之外的信息" : "较强，δ 部分重叠于 confidence"}。`);

summary.analysis4_delta_confidence = {
  hypothesis: "δ captures information beyond confidence",
  r_absB_confidence: corrAbsBConf,
  r_delta_confidence: corrDeltaConf,
};

// ============================================================================
// 分析 5：δ by agent role
// ============================================================================

printHeader("分析 5：δ by agent role（哪些角色 δ 最高 / 一致过承诺或欠承诺）");

interface RoleAgg {
  task: TaskName;
  agentId: string;
  role: string;
  inertia: number;
  n: number;
  meanDelta: number;
  meanAbsB: number;
  meanB: number;
  meanCommitmentBias: number; // mean(|b| - ι)，正=过承诺，负=欠承诺
  overCommittedFrac: number;  // |b| > ι 的样本比例
}

const roleAggs: RoleAgg[] = [];
const roleGroups = new Map<string, DeltaSample[]>();
for (const s of samples) {
  const key = `${s.task}|${s.agentId}`;
  if (!roleGroups.has(key)) roleGroups.set(key, []);
  roleGroups.get(key)!.push(s);
}

for (const [key, ss] of roleGroups) {
  const [task, agentId] = key.split("|");
  const first = ss[0];
  const biases = ss.map(s => s.absB - s.inertia);
  const overCount = ss.filter(s => s.absB > s.inertia).length;
  roleAggs.push({
    task: task as TaskName,
    agentId,
    role: first.role,
    inertia: first.inertia,
    n: ss.length,
    meanDelta: mean(ss.map(s => s.delta)),
    meanAbsB: mean(ss.map(s => s.absB)),
    meanB: mean(ss.map(s => s.b)),
    meanCommitmentBias: mean(biases),
    overCommittedFrac: overCount / ss.length,
  });
}
roleAggs.sort((a, b) => b.meanDelta - a.meanDelta);

console.log(`\n  ${"task".padEnd(9)} ${"agent".padEnd(5)} ${"role".padEnd(14)} ${"ι".padStart(5)} ${"n".padStart(5)} ${"meanδ".padStart(8)} ${"mean|b|".padStart(8)} ${"bias".padStart(8)} ${"over%".padStart(7)}`);
for (const a of roleAggs) {
  console.log(
    `  ${a.task.padEnd(9)} ${a.agentId.padEnd(5)} ${a.role.padEnd(14)} ${fmt(a.inertia, 2).padStart(5)} ${String(a.n).padStart(5)} ${fmt(a.meanDelta).padStart(8)} ${fmt(a.meanAbsB).padStart(8)} ${fmt(a.meanCommitmentBias).padStart(8)} ${fmt(a.overCommittedFrac * 100, 1).padStart(6)}%`
  );
}

console.log(`\n  解读：`);
const topDelta = roleAggs[0];
const lowDelta = roleAggs[roleAggs.length - 1];
console.log(`    - δ 最高：${topDelta.task}/${topDelta.agentId} (${topDelta.role}) meanδ=${fmt(topDelta.meanDelta)}`);
console.log(`    - δ 最低：${lowDelta.task}/${lowDelta.agentId} (${lowDelta.role}) meanδ=${fmt(lowDelta.meanDelta)}`);
const overRoles = roleAggs.filter(a => a.meanCommitmentBias > 0);
const underRoles = roleAggs.filter(a => a.meanCommitmentBias < 0);
console.log(`    - 过承诺 (|b|>ι) 角色：${overRoles.map(a => `${a.task}/${a.agentId}(${a.role}, bias=${fmt(a.meanCommitmentBias)})`).join(", ") || "无"}`);
console.log(`    - 欠承诺 (|b|<ι) 角色：${underRoles.map(a => `${a.task}/${a.agentId}(${a.role}, bias=${fmt(a.meanCommitmentBias)})`).join(", ") || "无"}`);
console.log(`    - 注意：ι_role 多为 default 0.4（多数角色字符串不含 expert/analyst/critic 等关键词），`);
console.log(`      故 δ 的横截面差异主要来自 |b| 而非 ι_role。这是 ι_role 简化的已知局限。`);

summary.analysis5_delta_by_role = {
  roleAggregates: roleAggs,
  highestDelta: topDelta,
  lowestDelta: lowDelta,
  overCommittedRoles: overRoles,
  underCommittedRoles: underRoles,
};

// ============================================================================
// 保存 JSON
// ============================================================================

const resultsDir = path.join(V2_DIR, "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
const outPath = path.join(resultsDir, "analyze_delta_distribution.json");
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf-8");

console.log("\n" + "=".repeat(78));
console.log(`  JSON 摘要已保存：${path.relative(process.cwd(), outPath)}`);
console.log("=".repeat(78));
console.log(`\n  数据加载：crisis=${crisisRuns.length}, supplier=${supplierRuns.length}, total=${allRuns.length} runs`);
console.log(`  δ 样本：${samples.length} 条 (run × round × agent)`);
