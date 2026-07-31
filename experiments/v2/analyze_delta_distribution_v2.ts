/**
 * δ = ||b| - ι_role| 分布分析 V2 —— 改进的角色惯性关键词规则
 *
 * 背景：
 *   V1 (analyze_delta_distribution.ts) 发现 8/10 agent 的 ι_role=0.40（default），
 *   因为角色名（评估师/顾问/经理/总监/工程师）不匹配旧关键词规则（仅 expert/analyst/critic/...）。
 *   这使 δ ≈ ||b| - 0.40|，失去横截面区分度，导致 H1-δ / H4-δ 无预测力。
 *
 * V2 改动：
 *   1. ROLE_INERTIA_RULES 新增 评估师(0.50) / 顾问(0.45) / 经理(0.45) / 总监(0.55) / 工程师(0.50)
 *   2. 所有 10 个 agent 现在都有非 default 的 ι_role
 *   3. 与 V1 结果对比，判断改进的 ι_role 是否改变 H1-δ / H4-δ 结论
 *
 * 运行：npx tsx experiments/v2/analyze_delta_distribution_v2.ts
 */

import * as fs from "fs";
import * as path from "path";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";
import { mean, sampleStd, mulberry32, PERMUTATION_SEED } from "./statsShared";
import { TASK_CRISIS } from "./task_crisis";
import { TASK_SUPPLIER } from "./task_supplier";

// ============================================================================
// ι_role —— V2 改进版（新增 评估师/顾问/经理/总监/工程师 关键词）
// 与 src/lib/agent/cognitiveState.ts:123-135 保持一致（同步更新）
// ============================================================================

const ROLE_INERTIA_RULES: Array<{ keywords: string[]; inertia: number }> = [
  { keywords: ["expert", "专家", "资深", "senior"], inertia: 0.6 },
  { keywords: ["director", "总监"], inertia: 0.55 },
  { keywords: ["analyst", "分析师", "分析"], inertia: 0.5 },
  { keywords: ["assessor", "evaluator", "评估师"], inertia: 0.5 },
  { keywords: ["engineer", "工程师"], inertia: 0.5 },
  { keywords: ["consultant", "advisor", "顾问"], inertia: 0.45 },
  { keywords: ["manager", "经理"], inertia: 0.45 },
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
// V1 旧规则（用于对比——逐字复制自 V1 脚本）
// ============================================================================

const ROLE_INERTIA_RULES_V1: Array<{ keywords: string[]; inertia: number }> = [
  { keywords: ["expert", "专家", "资深", "senior"], inertia: 0.6 },
  { keywords: ["analyst", "分析师", "分析"], inertia: 0.5 },
  { keywords: ["critic", "批评", "质疑", "审查"], inertia: 0.4 },
  { keywords: ["diplomat", "外交", "协调"], inertia: 0.35 },
  { keywords: ["moderator", "主持人", "协调员", "facilitator"], inertia: 0.3 },
  { keywords: ["novice", "新手", "初级", "junior"], inertia: 0.3 },
];

function getRoleInertiaV1(role: string): number {
  const lower = role.toLowerCase();
  for (const rule of ROLE_INERTIA_RULES_V1) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return rule.inertia;
    }
  }
  return 0.4;
}

// ============================================================================
// Agent 角色表
// ============================================================================

interface AgentRoleInfo {
  role: string;
  inertia: number;       // V2 improved
  inertiaV1: number;     // V1 original (for comparison)
}

function buildRoleMap(task: typeof TASK_CRISIS): Map<string, AgentRoleInfo> {
  const m = new Map<string, AgentRoleInfo>();
  for (const a of task.agents) {
    m.set(a.id, {
      role: a.role,
      inertia: getRoleInertia(a.role),
      inertiaV1: getRoleInertiaV1(a.role),
    });
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

interface DeltaSample {
  runId: string;
  task: TaskName;
  ablation: string;
  round: number;
  agentId: string;
  role: string;
  inertia: number;       // V2
  inertiaV1: number;     // V1
  b: number;
  absB: number;
  delta: number;         // V2: ||b| - ι_role_v2|
  deltaV1: number;       // V1: ||b| - ι_role_v1|
  confidence: number | null;
  kendallTau: number;
}

// ============================================================================
// 数据加载
// ============================================================================

const V2_DIR = path.resolve(__dirname);

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
// 构建 δ 样本（同时计算 V1 和 V2 δ）
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
      if (!roleInfo) continue;
      const b = beliefs[agentId];
      if (typeof b !== "number" || isNaN(b)) continue;
      const absB = Math.abs(b);
      const delta = Math.abs(absB - roleInfo.inertia);
      const deltaV1 = Math.abs(absB - roleInfo.inertiaV1);
      const conf = confidences[agentId];
      samples.push({
        runId: run.runId,
        task: run.task,
        ablation: run.ablation,
        round: roundNum,
        agentId,
        role: roleInfo.role,
        inertia: roleInfo.inertia,
        inertiaV1: roleInfo.inertiaV1,
        b,
        absB,
        delta,
        deltaV1,
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
  p: number;
  perms: number;
}

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

function meanDeltaPerRun(sampleList: DeltaSample[], useV1 = false): Map<string, number> {
  const field = useV1 ? "deltaV1" : "delta";
  const byRun = new Map<string, number[]>();
  for (const s of sampleList) {
    if (!byRun.has(s.runId)) byRun.set(s.runId, []);
    byRun.get(s.runId)!.push(s[field]);
  }
  const result = new Map<string, number>();
  for (const [runId, ds] of byRun) result.set(runId, mean(ds));
  return result;
}

function runDeltaTauPairs(
  sampleList: DeltaSample[],
  runs: Array<{ runId: string; kendallTau: number; task: TaskName; ablation: string }>,
  useV1 = false,
): { deltas: number[]; taus: number[]; runIds: string[] } {
  const meanDelta = meanDeltaPerRun(sampleList, useV1);
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
    version: "v2",
    seed: PERMUTATION_SEED,
    permutationCount: 10000,
    inertiaFormula: "ι_role = getRoleInertia(role) [V2 improved keyword rules]",
    deltaFormula: "δ = ||b| - ι_role_v2|",
    runsLoaded: { crisis: crisisRuns.length, supplier: supplierRuns.length, total: allRuns.length },
    samplesGenerated: samples.length,
    ruleChanges: [
      "新增 总监/director → 0.55",
      "新增 评估师/assessor/evaluator → 0.50",
      "新增 工程师/engineer → 0.50",
      "新增 顾问/consultant/advisor → 0.45",
      "新增 经理/manager → 0.45",
      "保留所有 V1 规则不变",
    ],
  },
  roleInertia: {
    crisis: Object.fromEntries(
      [...CRISIS_ROLES.entries()].map(([id, info]) => [
        id,
        { role: info.role, inertiaV2: info.inertia, inertiaV1: info.inertiaV1, changed: info.inertia !== info.inertiaV1 },
      ])
    ),
    supplier: Object.fromEntries(
      [...SUPPLIER_ROLES.entries()].map(([id, info]) => [
        id,
        { role: info.role, inertiaV2: info.inertia, inertiaV1: info.inertiaV1, changed: info.inertia !== info.inertiaV1 },
      ])
    ),
  },
};

// ============================================================================
// 分析 1：δ 分布（V2 + V1 对比）
// ============================================================================

function printHeader(title: string) {
  console.log("\n" + "=".repeat(78));
  console.log("  " + title);
  console.log("=".repeat(78));
}

printHeader("分析 1：δ 分布（V2 improved / V1 original 对比）");

const allDeltasV2 = samples.map(s => s.delta);
const allDeltasV1 = samples.map(s => s.deltaV1);
const overallV2 = distStats(allDeltasV2);
const overallV1 = distStats(allDeltasV1);
console.log(`\n  [Overall V2]  n=${overallV2.n}  mean=${fmt(overallV2.mean)}  std=${fmt(overallV2.std)}  median=${fmt(overallV2.median)}  Q1=${fmt(overallV2.q1)}  Q3=${fmt(overallV2.q3)}  min=${fmt(overallV2.min)}  max=${fmt(overallV2.max)}`);
console.log(`  [Overall V1]  n=${overallV1.n}  mean=${fmt(overallV1.mean)}  std=${fmt(overallV1.std)}  median=${fmt(overallV1.median)}  Q1=${fmt(overallV1.q1)}  Q3=${fmt(overallV1.q3)}  min=${fmt(overallV1.min)}  max=${fmt(overallV1.max)}`);

const byTaskV2: Record<string, DistStats> = {};
const byTaskV1: Record<string, DistStats> = {};
for (const t of ["crisis", "supplier"] as TaskName[]) {
  const dV2 = distStats(samples.filter(s => s.task === t).map(s => s.delta));
  const dV1 = distStats(samples.filter(s => s.task === t).map(s => s.deltaV1));
  byTaskV2[t] = dV2;
  byTaskV1[t] = dV1;
  console.log(`  [Task ${t} V2]  n=${dV2.n}  mean=${fmt(dV2.mean)}  std=${fmt(dV2.std)}  median=${fmt(dV2.median)}`);
  console.log(`  [Task ${t} V1]  n=${dV1.n}  mean=${fmt(dV1.mean)}  std=${fmt(dV1.std)}  median=${fmt(dV1.median)}`);
}

const byAblationV2: Record<string, DistStats> = {};
const byAblationV1: Record<string, DistStats> = {};
const ablations = [...new Set(samples.map(s => s.ablation))].sort();
for (const a of ablations) {
  const dV2 = distStats(samples.filter(s => s.ablation === a).map(s => s.delta));
  const dV1 = distStats(samples.filter(s => s.ablation === a).map(s => s.deltaV1));
  byAblationV2[a] = dV2;
  byAblationV1[a] = dV1;
  console.log(`  [Ablation ${a} V2]  n=${dV2.n}  mean=${fmt(dV2.mean)}  std=${fmt(dV2.std)}  median=${fmt(dV2.median)}`);
  console.log(`  [Ablation ${a} V1]  n=${dV1.n}  mean=${fmt(dV1.mean)}  std=${fmt(dV1.std)}  median=${fmt(dV1.median)}`);
}

const byRoundV2: Record<number, DistStats> = {};
const byRoundV1: Record<number, DistStats> = {};
const rounds = [...new Set(samples.map(s => s.round))].sort((a, b) => a - b);
console.log("  [By round]  (V2 / V1)");
for (const r of rounds) {
  const dV2 = distStats(samples.filter(s => s.round === r).map(s => s.delta));
  const dV1 = distStats(samples.filter(s => s.round === r).map(s => s.deltaV1));
  byRoundV2[r] = dV2;
  byRoundV1[r] = dV1;
  console.log(`    round ${r}:  V2 mean=${fmt(dV2.mean)} std=${fmt(dV2.std)}  |  V1 mean=${fmt(dV1.mean)} std=${fmt(dV1.std)}`);
}

summary.analysis1_deltaDistribution = {
  overall: { v2: overallV2, v1: overallV1 },
  byTask: { v2: byTaskV2, v1: byTaskV1 },
  byAblation: { v2: byAblationV2, v1: byAblationV1 },
  byRound: { v2: byRoundV2, v1: byRoundV1 },
};

// ============================================================================
// 分析 2：H1-δ —— δ 预测干预有效性（V2 + V1 对比）
// ============================================================================

printHeader("分析 2：H1-δ —— δ 预测干预有效性（V2 / V1 对比）");

const interventionRunsArr = allRuns.filter(r => r.ablation === "full" || r.ablation === "shuffle");
const baselineRunsArr = allRuns.filter(r => r.ablation === "none");
const interventionSamples = samples.filter(s => s.ablation === "full" || s.ablation === "shuffle");
const baselineSamples = samples.filter(s => s.ablation === "none");

const intvPairsV2 = runDeltaTauPairs(interventionSamples, interventionRunsArr, false);
const basePairsV2 = runDeltaTauPairs(baselineSamples, baselineRunsArr, false);
const intvPairsV1 = runDeltaTauPairs(interventionSamples, interventionRunsArr, true);
const basePairsV1 = runDeltaTauPairs(baselineSamples, baselineRunsArr, true);

const corrIntvV2 = pearsonWithPValue(intvPairsV2.deltas, intvPairsV2.taus);
const corrBaseV2 = pearsonWithPValue(basePairsV2.deltas, basePairsV2.taus);
const corrIntvV1 = pearsonWithPValue(intvPairsV1.deltas, intvPairsV1.taus);
const corrBaseV1 = pearsonWithPValue(basePairsV1.deltas, basePairsV1.taus);

console.log(`\n  Intervention runs (full ∪ shuffle):  n_runs=${interventionRunsArr.length}`);
console.log(`    V2: r(mean δ, kendallTau) = ${fmt(corrIntvV2.r)}  p=${fmt(corrIntvV2.p, 4)}  (perms=${corrIntvV2.perms})`);
console.log(`    V1: r(mean δ, kendallTau) = ${fmt(corrIntvV1.r)}  p=${fmt(corrIntvV1.p, 4)}  (perms=${corrIntvV1.perms})`);
console.log(`    V2 mean δ = ${fmt(mean(intvPairsV2.deltas))}  mean τ = ${fmt(mean(intvPairsV2.taus))}`);
console.log(`\n  Baseline runs (none):                 n_runs=${baselineRunsArr.length}`);
console.log(`    V2: r(mean δ, kendallTau) = ${fmt(corrBaseV2.r)}  p=${fmt(corrBaseV2.p, 4)}  (perms=${corrBaseV2.perms})`);
console.log(`    V1: r(mean δ, kendallTau) = ${fmt(corrBaseV1.r)}  p=${fmt(corrBaseV1.p, 4)}  (perms=${corrBaseV1.perms})`);
console.log(`    V2 mean δ = ${fmt(mean(basePairsV2.deltas))}  mean τ = ${fmt(mean(basePairsV2.taus))}`);

const intvStrongerV2 = Math.abs(corrIntvV2.r) > Math.abs(corrBaseV2.r);
console.log(`\n  解读：`);
console.log(`    - V2 干预组 |r|=${fmt(Math.abs(corrIntvV2.r))} vs V2 基线 |r|=${fmt(Math.abs(corrBaseV2.r))}`);
console.log(`    - V1 干预组 |r|=${fmt(Math.abs(corrIntvV1.r))} vs V1 基线 |r|=${fmt(Math.abs(corrBaseV1.r))}`);
console.log(`    - δ-τ 相关在${intvStrongerV2 ? "干预组更强" : "基线更强（或相当）"}。`);
console.log(`    - V2 干预组 r 符号=${corrIntvV2.r < 0 ? "负（高δ→低τ，符合H1）" : "正（不符合H1）"}；V1 干预组 r 符号=${corrIntvV1.r < 0 ? "负" : "正"}。`);

summary.analysis2_H1_delta = {
  hypothesis: "H1-δ: δ predicts intervention effectiveness (high δ → lower τ, stronger in intervention runs)",
  interventionRuns: {
    n: interventionRunsArr.length,
    v2: { r: corrIntvV2.r, p: corrIntvV2.p, meanDelta: mean(intvPairsV2.deltas), meanTau: mean(intvPairsV2.taus) },
    v1: { r: corrIntvV1.r, p: corrIntvV1.p, meanDelta: mean(intvPairsV1.deltas), meanTau: mean(intvPairsV1.taus) },
  },
  baselineRuns: {
    n: baselineRunsArr.length,
    v2: { r: corrBaseV2.r, p: corrBaseV2.p, meanDelta: mean(basePairsV2.deltas), meanTau: mean(basePairsV2.taus) },
    v1: { r: corrBaseV1.r, p: corrBaseV1.p, meanDelta: mean(basePairsV1.deltas), meanTau: mean(basePairsV1.taus) },
  },
  interventionCorrelationStronger: intvStrongerV2,
};

// ============================================================================
// 分析 3：H4-δ —— δ vs 决策质量（V2 + V1 对比）
// ============================================================================

printHeader("分析 3：H4-δ —— mean δ vs kendallTau（V2 / V1 对比）");

const allPairsV2 = runDeltaTauPairs(samples, allRuns, false);
const allPairsV1 = runDeltaTauPairs(samples, allRuns, true);
const corrAllV2 = pearsonWithPValue(allPairsV2.deltas, allPairsV2.taus);
const corrAllV1 = pearsonWithPValue(allPairsV1.deltas, allPairsV1.taus);
console.log(`\n  [All runs V2]   n=${corrAllV2.n}  r=${fmt(corrAllV2.r)}  p=${fmt(corrAllV2.p, 4)}`);
console.log(`  [All runs V1]   n=${corrAllV1.n}  r=${fmt(corrAllV1.r)}  p=${fmt(corrAllV1.p, 4)}`);

const crisisPairsV2 = runDeltaTauPairs(samples, crisisRuns.map(r => ({ ...r, task: "crisis" as TaskName })), false);
const crisisPairsV1 = runDeltaTauPairs(samples, crisisRuns.map(r => ({ ...r, task: "crisis" as TaskName })), true);
const supplierPairsV2 = runDeltaTauPairs(samples, supplierRuns.map(r => ({ ...r, task: "supplier" as TaskName })), false);
const supplierPairsV1 = runDeltaTauPairs(samples, supplierRuns.map(r => ({ ...r, task: "supplier" as TaskName })), true);
const corrCrisisV2 = pearsonWithPValue(crisisPairsV2.deltas, crisisPairsV2.taus);
const corrCrisisV1 = pearsonWithPValue(crisisPairsV1.deltas, crisisPairsV1.taus);
const corrSupplierV2 = pearsonWithPValue(supplierPairsV2.deltas, supplierPairsV2.taus);
const corrSupplierV1 = pearsonWithPValue(supplierPairsV1.deltas, supplierPairsV1.taus);
console.log(`  [Crisis V2]     n=${corrCrisisV2.n}  r=${fmt(corrCrisisV2.r)}  p=${fmt(corrCrisisV2.p, 4)}`);
console.log(`  [Crisis V1]     n=${corrCrisisV1.n}  r=${fmt(corrCrisisV1.r)}  p=${fmt(corrCrisisV1.p, 4)}`);
console.log(`  [Supplier V2]   n=${corrSupplierV2.n}  r=${fmt(corrSupplierV2.r)}  p=${fmt(corrSupplierV2.p, 4)}`);
console.log(`  [Supplier V1]   n=${corrSupplierV1.n}  r=${fmt(corrSupplierV1.r)}  p=${fmt(corrSupplierV1.p, 4)}`);

console.log(`\n  [By ablation V2 / V1]`);
const corrByAblationV2: Record<string, CorrResult> = {};
const corrByAblationV1: Record<string, CorrResult> = {};
for (const a of ablations) {
  const runSubset = allRuns.filter(r => r.ablation === a);
  const pairsV2 = runDeltaTauPairs(samples, runSubset, false);
  const pairsV1 = runDeltaTauPairs(samples, runSubset, true);
  const cV2 = pearsonWithPValue(pairsV2.deltas, pairsV2.taus);
  const cV1 = pearsonWithPValue(pairsV1.deltas, pairsV1.taus);
  corrByAblationV2[a] = cV2;
  corrByAblationV1[a] = cV1;
  console.log(`    ${a.padEnd(10)}  V2: n=${cV2.n} r=${fmt(cV2.r)} p=${fmt(cV2.p, 4)}  |  V1: n=${cV1.n} r=${fmt(cV1.r)} p=${fmt(cV1.p, 4)}`);
}

console.log(`\n  解读：`);
console.log(`    - V2 整体 r=${fmt(corrAllV2.r)}，p=${fmt(corrAllV2.p, 4)}（V1: r=${fmt(corrAllV1.r)}, p=${fmt(corrAllV1.p, 4)}）。`);
console.log(`    - 负 r 表示高 δ → 低 τ，支持 H4-δ。`);
console.log(`    - 改进的 ι_role ${Math.abs(corrAllV2.r) > Math.abs(corrAllV1.r) ? "增强" : "未增强"}了 δ 的预测力（|r|: ${fmt(Math.abs(corrAllV2.r))} vs ${fmt(Math.abs(corrAllV1.r))}）。`);

summary.analysis3_H4_delta = {
  hypothesis: "H4-δ: mean δ negatively correlates with kendallTau",
  overall: { v2: corrAllV2, v1: corrAllV1 },
  byTask: {
    crisis: { v2: corrCrisisV2, v1: corrCrisisV1 },
    supplier: { v2: corrSupplierV2, v1: corrSupplierV1 },
  },
  byAblation: { v2: corrByAblationV2, v1: corrByAblationV1 },
};

// ============================================================================
// 分析 4：δ by agent role（V2 — 现在应有更多横截面变异）
// ============================================================================

printHeader("分析 4：δ by agent role（V2 改进后应有更多变异）");

interface RoleAgg {
  task: TaskName;
  agentId: string;
  role: string;
  inertiaV2: number;
  inertiaV1: number;
  n: number;
  meanDeltaV2: number;
  meanDeltaV1: number;
  meanAbsB: number;
  meanB: number;
  meanCommitmentBiasV2: number; // mean(|b| - ι_v2)
  overCommittedFracV2: number;
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
  const biasesV2 = ss.map(s => s.absB - s.inertia);
  const overCount = ss.filter(s => s.absB > s.inertia).length;
  roleAggs.push({
    task: task as TaskName,
    agentId,
    role: first.role,
    inertiaV2: first.inertia,
    inertiaV1: first.inertiaV1,
    n: ss.length,
    meanDeltaV2: mean(ss.map(s => s.delta)),
    meanDeltaV1: mean(ss.map(s => s.deltaV1)),
    meanAbsB: mean(ss.map(s => s.absB)),
    meanB: mean(ss.map(s => s.b)),
    meanCommitmentBiasV2: mean(biasesV2),
    overCommittedFracV2: overCount / ss.length,
  });
}
roleAggs.sort((a, b) => b.meanDeltaV2 - a.meanDeltaV2);

console.log(`\n  ${"task".padEnd(9)} ${"agent".padEnd(5)} ${"role".padEnd(14)} ${"ιV2".padStart(5)} ${"ιV1".padStart(5)} ${"n".padStart(5)} ${"meanδV2".padStart(8)} ${"meanδV1".padStart(8)} ${"mean|b|".padStart(8)} ${"biasV2".padStart(8)} ${"over%".padStart(7)}`);
for (const a of roleAggs) {
  console.log(
    `  ${a.task.padEnd(9)} ${a.agentId.padEnd(5)} ${a.role.padEnd(14)} ${fmt(a.inertiaV2, 2).padStart(5)} ${fmt(a.inertiaV1, 2).padStart(5)} ${String(a.n).padStart(5)} ${fmt(a.meanDeltaV2).padStart(8)} ${fmt(a.meanDeltaV1).padStart(8)} ${fmt(a.meanAbsB).padStart(8)} ${fmt(a.meanCommitmentBiasV2).padStart(8)} ${fmt(a.overCommittedFracV2 * 100, 1).padStart(6)}%`
  );
}

// δ 跨角色变异度（标准差）
const roleMeanDeltasV2 = roleAggs.map(a => a.meanDeltaV2);
const roleMeanDeltasV1 = roleAggs.map(a => a.meanDeltaV1);
const crossRoleStdV2 = sampleStd(roleMeanDeltasV2);
const crossRoleStdV1 = sampleStd(roleMeanDeltasV1);

console.log(`\n  解读：`);
const topDelta = roleAggs[0];
const lowDelta = roleAggs[roleAggs.length - 1];
console.log(`    - δ 最高：${topDelta.task}/${topDelta.agentId} (${topDelta.role}, ι=${fmt(topDelta.inertiaV2, 2)}) meanδV2=${fmt(topDelta.meanDeltaV2)}`);
console.log(`    - δ 最低：${lowDelta.task}/${lowDelta.agentId} (${lowDelta.role}, ι=${fmt(lowDelta.inertiaV2, 2)}) meanδV2=${fmt(lowDelta.meanDeltaV2)}`);
console.log(`    - 跨角色 δ 标准差：V2=${fmt(crossRoleStdV2)} vs V1=${fmt(crossRoleStdV1)}`);
console.log(`    - V2 ${crossRoleStdV2 > crossRoleStdV1 ? "增大了" : "未增大"} δ 的横截面变异度（${crossRoleStdV2 > crossRoleStdV1 ? "改进成功" : "改进无效"}）。`);

// ι_role 分布
const inertiaValsV2 = [...CRISIS_ROLES.values(), ...SUPPLIER_ROLES.values()].map(v => v.inertia);
const inertiaValsV1 = [...CRISIS_ROLES.values(), ...SUPPLIER_ROLES.values()].map(v => v.inertiaV1);
const uniqueV2 = [...new Set(inertiaValsV2)].sort();
const uniqueV1 = [...new Set(inertiaValsV1)].sort();
console.log(`    - V2 ι_role 唯一值：[${uniqueV2.join(", ")}]（${uniqueV2.length} 个不同值）`);
console.log(`    - V1 ι_role 唯一值：[${uniqueV1.join(", ")}]（${uniqueV1.length} 个不同值）`);
const defaultCountV1 = inertiaValsV1.filter(v => v === 0.4).length;
const defaultCountV2 = inertiaValsV2.filter(v => v === 0.4).length;
console.log(`    - V1 default(0.40) 角色数：${defaultCountV1}/10；V2 default(0.40) 角色数：${defaultCountV2}/10`);

const overRoles = roleAggs.filter(a => a.meanCommitmentBiasV2 > 0);
const underRoles = roleAggs.filter(a => a.meanCommitmentBiasV2 < 0);
console.log(`    - 过承诺 (|b|>ι) 角色：${overRoles.map(a => `${a.task}/${a.agentId}(${a.role}, bias=${fmt(a.meanCommitmentBiasV2)})`).join(", ") || "无"}`);
console.log(`    - 欠承诺 (|b|<ι) 角色：${underRoles.map(a => `${a.task}/${a.agentId}(${a.role}, bias=${fmt(a.meanCommitmentBiasV2)})`).join(", ") || "无"}`);

summary.analysis4_delta_by_role = {
  roleAggregates: roleAggs,
  highestDelta: topDelta,
  lowestDelta: lowDelta,
  crossRoleStd: { v2: crossRoleStdV2, v1: crossRoleStdV1 },
  inertiaDistribution: {
    v2: { uniqueValues: uniqueV2, uniqueCount: uniqueV2.length, defaultCount: defaultCountV2 },
    v1: { uniqueValues: uniqueV1, uniqueCount: uniqueV1.length, defaultCount: defaultCountV1 },
  },
  overCommittedRoles: overRoles,
  underCommittedRoles: underRoles,
};

// ============================================================================
// 分析 5：δ 与 confidence（V2）
// ============================================================================

printHeader("分析 5：δ 与 confidence（V2 / V1 对比）");

const confSamples = samples.filter(s => s.confidence !== null);
const absBVals = confSamples.map(s => s.absB);
const deltaValsV2 = confSamples.map(s => s.delta);
const deltaValsV1 = confSamples.map(s => s.deltaV1);
const confVals = confSamples.map(s => s.confidence as number);

const corrAbsBConf = pearsonWithPValue(absBVals, confVals);
const corrDeltaConfV2 = pearsonWithPValue(deltaValsV2, confVals);
const corrDeltaConfV1 = pearsonWithPValue(deltaValsV1, confVals);

console.log(`\n  [r(|b|, confidence)]    n=${corrAbsBConf.n}  r=${fmt(corrAbsBConf.r)}  p=${fmt(corrAbsBConf.p, 4)}`);
console.log(`  [r(δV2, confidence)]     n=${corrDeltaConfV2.n}  r=${fmt(corrDeltaConfV2.r)}  p=${fmt(corrDeltaConfV2.p, 4)}`);
console.log(`  [r(δV1, confidence)]     n=${corrDeltaConfV1.n}  r=${fmt(corrDeltaConfV1.r)}  p=${fmt(corrDeltaConfV1.p, 4)}`);

summary.analysis5_delta_confidence = {
  hypothesis: "δ captures information beyond confidence",
  r_absB_confidence: corrAbsBConf,
  r_delta_confidence: { v2: corrDeltaConfV2, v1: corrDeltaConfV1 },
};

// ============================================================================
// 总结：V2 vs V1 对比
// ============================================================================

printHeader("总结：改进的 ι_role 是否改变了结论？");

console.log(`\n  1. ι_role 覆盖率：`);
console.log(`     V1: ${10 - defaultCountV1}/10 agents 有非 default ι_role（${defaultCountV1} 个 default 0.40）`);
console.log(`     V2: ${10 - defaultCountV2}/10 agents 有非 default ι_role（${defaultCountV2} 个 default 0.40）`);

console.log(`\n  2. H1-δ（干预有效性）：`);
console.log(`     干预组 V2 r=${fmt(corrIntvV2.r)} (p=${fmt(corrIntvV2.p, 4)}) vs V1 r=${fmt(corrIntvV1.r)} (p=${fmt(corrIntvV1.p, 4)})`);
console.log(`     基线组 V2 r=${fmt(corrBaseV2.r)} (p=${fmt(corrBaseV2.p, 4)}) vs V1 r=${fmt(corrBaseV1.r)} (p=${fmt(corrBaseV1.p, 4)})`);
const h1Changed = (Math.abs(corrIntvV2.r) - Math.abs(corrIntvV1.r) > 0.05) || (corrIntvV2.p < 0.05 !== corrIntvV1.p < 0.05);
console.log(`     结论${h1Changed ? "改变" : "未改变"}：${h1Changed ? "V2 改变了 H1-δ 的显著性或效应量" : "V2 与 V1 结论一致"}`);

console.log(`\n  3. H4-δ（决策质量）：`);
console.log(`     整体 V2 r=${fmt(corrAllV2.r)} (p=${fmt(corrAllV2.p, 4)}) vs V1 r=${fmt(corrAllV1.r)} (p=${fmt(corrAllV1.p, 4)})`);
console.log(`     Crisis V2 r=${fmt(corrCrisisV2.r)} (p=${fmt(corrCrisisV2.p, 4)}) vs V1 r=${fmt(corrCrisisV1.r)} (p=${fmt(corrCrisisV1.p, 4)})`);
console.log(`     Supplier V2 r=${fmt(corrSupplierV2.r)} (p=${fmt(corrSupplierV2.p, 4)}) vs V1 r=${fmt(corrSupplierV1.r)} (p=${fmt(corrSupplierV1.p, 4)})`);
const h4Changed = (Math.abs(corrAllV2.r) - Math.abs(corrAllV1.r) > 0.05) || (corrAllV2.p < 0.05 !== corrAllV1.p < 0.05);
console.log(`     结论${h4Changed ? "改变" : "未改变"}：${h4Changed ? "V2 改变了 H4-δ 的显著性或效应量" : "V2 与 V1 结论一致"}`);

console.log(`\n  4. δ 横截面变异度：`);
console.log(`     跨角色 δ 标准差 V2=${fmt(crossRoleStdV2)} vs V1=${fmt(crossRoleStdV1)}`);
console.log(`     ${crossRoleStdV2 > crossRoleStdV1 ? "V2 增大了角色间 δ 差异——ι_role 现在有区分度" : "V2 未增大角色间 δ 差异"}`);

summary.conclusion = {
  inertiaCoverage: { v1: { nonDefault: 10 - defaultCountV1, default: defaultCountV1 }, v2: { nonDefault: 10 - defaultCountV2, default: defaultCountV2 } },
  H1_delta: {
    v2: { interventionR: corrIntvV2.r, interventionP: corrIntvV2.p, baselineR: corrBaseV2.r, baselineP: corrBaseV2.p },
    v1: { interventionR: corrIntvV1.r, interventionP: corrIntvV1.p, baselineR: corrBaseV1.r, baselineP: corrBaseV1.p },
    conclusionChanged: h1Changed,
  },
  H4_delta: {
    v2: { overallR: corrAllV2.r, overallP: corrAllV2.p, crisisR: corrCrisisV2.r, crisisP: corrCrisisV2.p, supplierR: corrSupplierV2.r, supplierP: corrSupplierV2.p },
    v1: { overallR: corrAllV1.r, overallP: corrAllV1.p, crisisR: corrCrisisV1.r, crisisP: corrCrisisV1.p, supplierR: corrSupplierV1.r, supplierP: corrSupplierV1.p },
    conclusionChanged: h4Changed,
  },
  crossRoleVariation: { v2Std: crossRoleStdV2, v1Std: crossRoleStdV1, improved: crossRoleStdV2 > crossRoleStdV1 },
};

// ============================================================================
// 保存 JSON
// ============================================================================

const resultsDir = path.join(V2_DIR, "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
const outPath = path.join(resultsDir, "analyze_delta_distribution_v2.json");
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf-8");

console.log("\n" + "=".repeat(78));
console.log(`  JSON 摘要已保存：${path.relative(process.cwd(), outPath)}`);
console.log("=".repeat(78));
console.log(`\n  数据加载：crisis=${crisisRuns.length}, supplier=${supplierRuns.length}, total=${allRuns.length} runs`);
console.log(`  δ 样本：${samples.length} 条 (run × round × agent)`);
