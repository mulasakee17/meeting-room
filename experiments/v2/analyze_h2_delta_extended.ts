/**
 * H2-δ 扩展分析 —— 将恶意 agent 检测扩展到全部 40 个 fraud_malicious 文件
 *
 * 背景：
 *   前序分析 (analyze_fraud_delta_fj.ts) 仅测试了 26 个 Tier C 文件（有 roundResults）。
 *   本脚本扩展到全部 40 个文件，包括 14 个 Tier B 文件（无 roundResults）。
 *
 * Tier C (26 files): 有 roundResults[].opinions[]，可计算 expressionBased
 *   ι_approx = (0.7 * roleBase + 0.1 * expressionBased) * 0.98
 *
 * Tier B (14 files): 无 roundResults，从 governanceTrace[].beliefChanges 提取信念
 *   - 10 files (codeVersion "2026-07-20-malicious-v2"): 有 beliefChanges，提取 .new 值
 *   -  4 files (codeVersion "2026-07-20-malicious"):   无 governanceTrace，用 finalBeliefs 兜底
 *   ι_approx = roleBase * 0.7 * 0.98  (role-only，因无 perUtteranceSnapshots)
 *
 * δ = ||b| - ι_approx|
 *
 * 运行：npx tsx experiments/v2/analyze_h2_delta_extended.ts
 */

import * as fs from "fs";
import * as path from "path";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";
import { mean, sampleStd, cohensD, mulberry32, PERMUTATION_SEED } from "./statsShared";

// ============================================================================
// ι_role —— 逐字复制自 src/lib/agent/cognitiveState.ts:123-140
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

interface Opinion {
  agentId: string;
  belief: number;
}

interface RoundResult {
  roundNumber: number;
  opinions?: Opinion[];
}

interface BeliefChange {
  old: number;
  new: number;
  reason: string;
}

interface GovernanceRound {
  roundNumber?: number;
  beliefChanges?: Record<string, BeliefChange>;
}

interface FraudRun {
  runId?: string;
  group?: string;
  runIndex?: number;
  codeVersion?: string;
  kendallTau: number;
  decisionQuality?: number;
  maliciousAgentIds?: string[];
  attackScenario?: string;
  governanceEnabled?: boolean;
  roundResults?: RoundResult[];
  governanceTrace?: GovernanceRound[];
  finalBeliefs?: Record<string, number>;
}

/** 文件层级：Tier C (有 roundResults) 或 Tier B (无 roundResults) */
type Tier = "C" | "B";

interface DeltaSample {
  runId: string;
  group: string;
  tier: Tier;
  codeVersion: string;
  round: number;
  agentId: string;
  role: string;
  roleBase: number;
  roundsSpoken: number;
  expressionBased: number;
  iotaApprox: number;
  iotaFormula: string;
  b: number;
  absB: number;
  delta: number;
  isMalicious: boolean;
  attackScenario: string;
  governanceEnabled: boolean;
  kendallTau: number;
}

// ============================================================================
// 数据加载 —— 仅 data_fraud_malicious，全部 40 个文件
// ============================================================================

const V2_DIR = path.resolve(__dirname);
const FRAUD_MALICIOUS_DIR = path.join(V2_DIR, "data_fraud_malicious");

const EXCLUDE_FILES = new Set(["summary.json", "enhanced_evaluation_results.json"]);

interface LoadedRun extends FraudRun {
  fileName: string;
  tier: Tier;
}

function loadAllFraudMaliciousRuns(): LoadedRun[] {
  const runs: LoadedRun[] = [];
  if (!fs.existsSync(FRAUD_MALICIOUS_DIR)) return runs;
  const files = fs.readdirSync(FRAUD_MALICIOUS_DIR).filter(
    f => f.endsWith(".json") && !EXCLUDE_FILES.has(f)
  );
  for (const f of files) {
    const raw = safeJsonParse<FraudRun & { error?: string }>(
      fs.readFileSync(path.join(FRAUD_MALICIOUS_DIR, f), "utf-8")
    );
    if (!raw || raw.error) continue;
    if (typeof raw.kendallTau !== "number") continue;

    // 分类：有 roundResults 且至少一轮有 opinions → Tier C；否则 Tier B
    const hasOpinions =
      Array.isArray(raw.roundResults) &&
      raw.roundResults.some(r => Array.isArray(r.opinions) && r.opinions.length > 0);
    const tier: Tier = hasOpinions ? "C" : "B";

    runs.push({
      ...raw,
      fileName: f,
      runId: raw.runId ?? f.replace(/\.json$/, ""),
      group: raw.group ?? "unknown",
      tier,
    });
  }
  return runs;
}

const allRuns = loadAllFraudMaliciousRuns();
const tierCRuns = allRuns.filter(r => r.tier === "C");
const tierBRuns = allRuns.filter(r => r.tier === "B");

// ============================================================================
// δ 计算
// ============================================================================

/**
 * Tier C: 从 roundResults[].opinions 提取信念
 * ι_approx = (0.7 * roleBase + 0.1 * expressionBased) * 0.98
 *   expressionBased = 0.05 * 累计发言轮次（含当前轮）
 */
function computeDeltaSamplesTierC(run: LoadedRun): DeltaSample[] {
  const samples: DeltaSample[] = [];
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
      const roleInfo = FRAUD_ROLES[agentId];
      if (!roleInfo) continue;
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
        tier: "C",
        codeVersion: run.codeVersion ?? "unknown",
        round: roundNum,
        agentId,
        role: roleInfo.role,
        roleBase: roleInfo.roleBase,
        roundsSpoken,
        expressionBased,
        iotaApprox,
        iotaFormula: "(0.7*roleBase + 0.1*expressionBased)*0.98",
        b,
        absB,
        delta,
        isMalicious: maliciousSet.has(agentId),
        attackScenario: run.attackScenario ?? "single",
        governanceEnabled: run.governanceEnabled ?? false,
        kendallTau: run.kendallTau,
      });
    }
  }
  return samples;
}

/**
 * Tier B: 从 governanceTrace[].beliefChanges 提取信念（用 .new 值）
 * 若无 beliefChanges，回退到 finalBeliefs（单轮）
 * ι_approx = roleBase * 0.7 * 0.98  (role-only，无 expression)
 */
function computeDeltaSamplesTierB(run: LoadedRun): DeltaSample[] {
  const samples: DeltaSample[] = [];
  const maliciousSet = new Set(run.maliciousAgentIds ?? []);

  // 优先从 governanceTrace[].beliefChanges 提取
  const trace = run.governanceTrace;
  if (Array.isArray(trace) && trace.length > 0) {
    for (const gr of trace) {
      const bc = gr.beliefChanges;
      if (!bc || typeof bc !== "object") continue; // 跳过缺失/畸形轮次
      const roundNum = typeof gr.roundNumber === "number" ? gr.roundNumber : 0;

      for (const [agentId, change] of Object.entries(bc)) {
        const roleInfo = FRAUD_ROLES[agentId];
        if (!roleInfo) continue;
        if (!change || typeof change.new !== "number" || isNaN(change.new)) continue;

        const b = change.new;
        const iotaApprox = roleInfo.roleBase * 0.7 * 0.98;
        const absB = Math.abs(b);
        const delta = Math.abs(absB - iotaApprox);

        samples.push({
          runId: run.runId!,
          group: run.group ?? "unknown",
          tier: "B",
          codeVersion: run.codeVersion ?? "unknown",
          round: roundNum,
          agentId,
          role: roleInfo.role,
          roleBase: roleInfo.roleBase,
          roundsSpoken: 0, // role-only 模式不计算
          expressionBased: 0, // role-only 模式不计算
          iotaApprox,
          iotaFormula: "roleBase*0.7*0.98 (role-only)",
          b,
          absB,
          delta,
          isMalicious: maliciousSet.has(agentId),
          attackScenario: run.attackScenario ?? "single",
          governanceEnabled: run.governanceEnabled ?? false,
          kendallTau: run.kendallTau,
        });
      }
    }
    return samples;
  }

  // 回退：finalBeliefs（单轮，标记 round=0）
  const fb = run.finalBeliefs;
  if (fb && typeof fb === "object") {
    for (const [agentId, b] of Object.entries(fb)) {
      const roleInfo = FRAUD_ROLES[agentId];
      if (!roleInfo) continue;
      if (typeof b !== "number" || isNaN(b)) continue;

      const iotaApprox = roleInfo.roleBase * 0.7 * 0.98;
      const absB = Math.abs(b);
      const delta = Math.abs(absB - iotaApprox);

      samples.push({
        runId: run.runId!,
        group: run.group ?? "unknown",
        tier: "B",
        codeVersion: run.codeVersion ?? "unknown",
        round: 0,
        agentId,
        role: roleInfo.role,
        roleBase: roleInfo.roleBase,
        roundsSpoken: 0,
        expressionBased: 0,
        iotaApprox,
        iotaFormula: "roleBase*0.7*0.98 (role-only, finalBeliefs fallback)",
        b,
        absB,
        delta,
        isMalicious: maliciousSet.has(agentId),
        attackScenario: run.attackScenario ?? "single",
        governanceEnabled: run.governanceEnabled ?? false,
        kendallTau: run.kendallTau,
      });
    }
  }
  return samples;
}

// 生成全部 δ 样本
const allSamples: DeltaSample[] = [];
for (const run of allRuns) {
  if (run.tier === "C") {
    allSamples.push(...computeDeltaSamplesTierC(run));
  } else {
    allSamples.push(...computeDeltaSamplesTierB(run));
  }
}

// 分类样本
const tierCSamples = allSamples.filter(s => s.tier === "C");
const tierBSamples = allSamples.filter(s => s.tier === "B");

// 恶意 / 诚实划分（仅在恶意文件中）
const maliciousRuns = allRuns.filter(
  r => Array.isArray(r.maliciousAgentIds) && r.maliciousAgentIds.length > 0
);
const maliciousRunIds = new Set(maliciousRuns.map(r => r.runId!));

const allMaliciousSamples = allSamples.filter(s => s.isMalicious);
const allHonestSamples = allSamples.filter(
  s => !s.isMalicious && maliciousRunIds.has(s.runId)
);

const tierCMalicious = tierCSamples.filter(s => s.isMalicious);
const tierCHonest = tierCSamples.filter(s => !s.isMalicious && maliciousRunIds.has(s.runId));

const tierBMalicious = tierBSamples.filter(s => s.isMalicious);
const tierBHonest = tierBSamples.filter(s => !s.isMalicious && maliciousRunIds.has(s.runId));

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

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 均值差置换检验（单侧：δ_malicious > δ_honest?）
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

function effectSizeLabel(d: number): string {
  const a = Math.abs(d);
  if (a < 0.2) return "negligible";
  if (a < 0.5) return "small";
  if (a < 0.8) return "medium";
  return "large";
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
    deltaFormula: "δ = ||b| - ι_approx|",
    iotaFormulaTierC: "ι_approx = (0.7 * roleBase + 0.1 * expressionBased) * 0.98",
    iotaFormulaTierB: "ι_approx = roleBase * 0.7 * 0.98  (role-only, no expression)",
    beliefSourceTierC: "roundResults[].opinions[].belief",
    beliefSourceTierB: "governanceTrace[].beliefChanges[agentId].new (fallback: finalBeliefs[agentId])",
    filesLoaded: {
      total: allRuns.length,
      tierC: tierCRuns.length,
      tierB: tierBRuns.length,
    },
    samplesGenerated: {
      total: allSamples.length,
      tierC: tierCSamples.length,
      tierB: tierBSamples.length,
      malicious: allMaliciousSamples.length,
      honestInMaliciousRuns: allHonestSamples.length,
    },
  },
  roleInertia: Object.fromEntries(
    Object.entries(FRAUD_ROLES).map(([id, info]) => [
      id,
      { role: info.role, roleBase: info.roleBase },
    ])
  ),
};

console.log(`\n数据加载：data_fraud_malicious 全部 ${allRuns.length} 个文件 (Tier C=${tierCRuns.length}, Tier B=${tierBRuns.length})`);
console.log(`δ 样本总数：${allSamples.length} (Tier C=${tierCSamples.length}, Tier B=${tierBSamples.length})`);
console.log(`  恶意 agent 样本：${allMaliciousSamples.length} (Tier C=${tierCMalicious.length}, Tier B=${tierBMalicious.length})`);
console.log(`  诚实 agent 样本（恶意文件内）：${allHonestSamples.length} (Tier C=${tierCHonest.length}, Tier B=${tierBHonest.length})`);

// ============================================================================
// 分析 1：H2-δ —— 合并全部 40 文件（Tier C + Tier B）
// ============================================================================

printHeader("分析 1：H2-δ 合并 (Tier C + Tier B, 全部 40 文件)");

const combinedMalDeltas = allMaliciousSamples.map(s => s.delta);
const combinedHonDeltas = allHonestSamples.map(s => s.delta);

const distCombMal = distStats(combinedMalDeltas);
const distCombHon = distStats(combinedHonDeltas);

console.log(`\n  样本来源：${allRuns.length} 个恶意文件 (E/F/G groups)`);
console.log(`  恶意 agent δ：  n=${distCombMal.n}  mean=${fmt(distCombMal.mean)}  std=${fmt(distCombMal.std)}  median=${fmt(distCombMal.median)}  Q1=${fmt(distCombMal.q1)}  Q3=${fmt(distCombMal.q3)}  min=${fmt(distCombMal.min)}  max=${fmt(distCombMal.max)}`);
console.log(`  诚实 agent δ：  n=${distCombHon.n}  mean=${fmt(distCombHon.mean)}  std=${fmt(distCombHon.std)}  median=${fmt(distCombHon.median)}  Q1=${fmt(distCombHon.q1)}  Q3=${fmt(distCombHon.q3)}  min=${fmt(distCombHon.min)}  max=${fmt(distCombHon.max)}`);

const permTestCombined = meanDiffPermutationTest(combinedMalDeltas, combinedHonDeltas, 10000);
const cohenDCombined = cohensD(combinedMalDeltas, combinedHonDeltas);

console.log(`\n  均值差 (malicious - honest) = ${fmt(permTestCombined.observedDiff)}`);
console.log(`  Cohen's d = ${fmt(cohenDCombined)}  (${effectSizeLabel(cohenDCombined)} effect)`);
console.log(`  单侧置换检验 (H1: δ_malicious > δ_honest, 10k perms, seed=42)`);
console.log(`    p = ${fmt(permTestCombined.p, 4)}`);

const h2CombinedSupported = permTestCombined.observedDiff > 0 && permTestCombined.p < 0.05;
console.log(`\n  解读：`);
console.log(`    - δ_malicious (${fmt(permTestCombined.meanMalicious)}) vs δ_honest (${fmt(permTestCombined.meanHonest)})`);
console.log(`    - ${permTestCombined.observedDiff > 0 ? "恶意 agent δ 更高" : "恶意 agent δ 更低（与预期相反）"}，Cohen's d=${fmt(cohenDCombined)}（${effectSizeLabel(cohenDCombined)}效应）`);
console.log(`    - ${h2CombinedSupported ? "✅ H2-δ 得到支持（合并集）" : "❌ H2-δ 未得到支持（合并集）"}`);

// 对比前序结果
console.log(`\n  对比前序 (analyze_fraud_delta_fj.json, Tier C only, 26 files):`);
console.log(`    - 前序: δ_malicious=0.580, δ_honest=0.222, Cohen's d=2.18, p<0.0001, n=551`);
console.log(`    - 当前合并: δ_malicious=${fmt(permTestCombined.meanMalicious)}, δ_honest=${fmt(permTestCombined.meanHonest)}, Cohen's d=${fmt(cohenDCombined)}, p=${fmt(permTestCombined.p, 4)}, n=${distCombMal.n + distCombHon.n}`);

summary.analysis1_combined = {
  hypothesis: "H2-δ: malicious agents have higher δ than honest agents (combined Tier C + B)",
  fileCount: allRuns.length,
  maliciousDeltaStats: distCombMal,
  honestDeltaStats: distCombHon,
  permutationTest: permTestCombined,
  cohensD: cohenDCombined,
  effectSize: effectSizeLabel(cohenDCombined),
  supported: h2CombinedSupported,
  priorResultComparison: {
    prior: { deltaMalicious: 0.580, deltaHonest: 0.222, cohensD: 2.18, p: 0.0001, n: 551, fileCount: 26 },
    current: { deltaMalicious: permTestCombined.meanMalicious, deltaHonest: permTestCombined.meanHonest, cohensD: cohenDCombined, p: permTestCombined.p, n: distCombMal.n + distCombHon.n, fileCount: allRuns.length },
  },
};

// ============================================================================
// 分析 2：H2-δ —— Tier B only (14 文件)
// ============================================================================

printHeader("分析 2：H2-δ Tier B only (14 文件, beliefChanges/finalBeliefs)");

const tierBMalDeltas = tierBMalicious.map(s => s.delta);
const tierBHonDeltas = tierBHonest.map(s => s.delta);

const distBMal = distStats(tierBMalDeltas);
const distBHon = distStats(tierBHonDeltas);

console.log(`\n  样本来源：${tierBRuns.length} 个 Tier B 文件`);
console.log(`  恶意 agent δ：  n=${distBMal.n}  mean=${fmt(distBMal.mean)}  std=${fmt(distBMal.std)}  median=${fmt(distBMal.median)}  Q1=${fmt(distBMal.q1)}  Q3=${fmt(distBMal.q3)}  min=${fmt(distBMal.min)}  max=${fmt(distBMal.max)}`);
console.log(`  诚实 agent δ：  n=${distBHon.n}  mean=${fmt(distBHon.mean)}  std=${fmt(distBHon.std)}  median=${fmt(distBHon.median)}  Q1=${fmt(distBHon.q1)}  Q3=${fmt(distBHon.q3)}  min=${fmt(distBHon.min)}  max=${fmt(distBHon.max)}`);

const permTestB = meanDiffPermutationTest(tierBMalDeltas, tierBHonDeltas, 10000);
const cohenDB = cohensD(tierBMalDeltas, tierBHonDeltas);

console.log(`\n  均值差 (malicious - honest) = ${fmt(permTestB.observedDiff)}`);
console.log(`  Cohen's d = ${fmt(cohenDB)}  (${effectSizeLabel(cohenDB)} effect)`);
console.log(`  单侧置换检验 (H1: δ_malicious > δ_honest, 10k perms, seed=42)`);
console.log(`    p = ${fmt(permTestB.p, 4)}`);

const h2BSupported = permTestB.observedDiff > 0 && permTestB.p < 0.05;
console.log(`\n  解读：`);
console.log(`    - δ_malicious (${fmt(permTestB.meanMalicious)}) vs δ_honest (${fmt(permTestB.meanHonest)})`);
console.log(`    - ${permTestB.observedDiff > 0 ? "恶意 agent δ 更高" : "恶意 agent δ 更低（与预期相反）"}，Cohen's d=${fmt(cohenDB)}（${effectSizeLabel(cohenDB)}效应）`);
console.log(`    - ${h2BSupported ? "✅ H2-δ 得到支持（Tier B）" : "❌ H2-δ 未得到支持（Tier B）"}`);

// Tier B 子分类：beliefChanges vs finalBeliefs
const tierBWithBC = tierBRuns.filter(r => Array.isArray(r.governanceTrace) && r.governanceTrace.some(g => g.beliefChanges && Object.keys(g.beliefChanges).length > 0));
const tierBWithFB = tierBRuns.filter(r => !Array.isArray(r.governanceTrace) || !r.governanceTrace.some(g => g.beliefChanges && Object.keys(g.beliefChanges).length > 0));
console.log(`\n  Tier B 子分类：`);
console.log(`    - 有 beliefChanges: ${tierBWithBC.length} 文件 (codeVersion v2)`);
console.log(`    - 仅 finalBeliefs:  ${tierBWithFB.length} 文件 (codeVersion 非 v2)`);
for (const r of tierBWithFB) {
  console.log(`        · ${r.fileName} (cv=${r.codeVersion})`);
}

summary.analysis2_tierB = {
  hypothesis: "H2-δ: malicious agents have higher δ than honest agents (Tier B only)",
  fileCount: tierBRuns.length,
  maliciousDeltaStats: distBMal,
  honestDeltaStats: distBHon,
  permutationTest: permTestB,
  cohensD: cohenDB,
  effectSize: effectSizeLabel(cohenDB),
  supported: h2BSupported,
  subBreakdown: {
    withBeliefChanges: tierBWithBC.length,
    finalBeliefsFallback: tierBWithFB.length,
    finalBeliefsFiles: tierBWithFB.map(r => r.fileName),
  },
};

// ============================================================================
// 分析 3：H2-δ —— Tier C only (26 文件, 用于一致性检查)
// ============================================================================

printHeader("分析 3：H2-δ Tier C only (26 文件, 一致性检查)");

const tierCMalDeltas = tierCMalicious.map(s => s.delta);
const tierCHonDeltas = tierCHonest.map(s => s.delta);

const distCMal = distStats(tierCMalDeltas);
const distCHon = distStats(tierCHonDeltas);

console.log(`\n  样本来源：${tierCRuns.length} 个 Tier C 文件`);
console.log(`  恶意 agent δ：  n=${distCMal.n}  mean=${fmt(distCMal.mean)}  std=${fmt(distCMal.std)}  median=${fmt(distCMal.median)}  Q1=${fmt(distCMal.q1)}  Q3=${fmt(distCMal.q3)}  min=${fmt(distCMal.min)}  max=${fmt(distCMal.max)}`);
console.log(`  诚实 agent δ：  n=${distCHon.n}  mean=${fmt(distCHon.mean)}  std=${fmt(distCHon.std)}  median=${fmt(distCHon.median)}  Q1=${fmt(distCHon.q1)}  Q3=${fmt(distCHon.q3)}  min=${fmt(distCHon.min)}  max=${fmt(distCHon.max)}`);

const permTestC = meanDiffPermutationTest(tierCMalDeltas, tierCHonDeltas, 10000);
const cohenDC = cohensD(tierCMalDeltas, tierCHonDeltas);

console.log(`\n  均值差 (malicious - honest) = ${fmt(permTestC.observedDiff)}`);
console.log(`  Cohen's d = ${fmt(cohenDC)}  (${effectSizeLabel(cohenDC)} effect)`);
console.log(`  单侧置换检验 (H1: δ_malicious > δ_honest, 10k perms, seed=42)`);
console.log(`    p = ${fmt(permTestC.p, 4)}`);

const h2CSupported = permTestC.observedDiff > 0 && permTestC.p < 0.05;
console.log(`\n  解读：`);
console.log(`    - δ_malicious (${fmt(permTestC.meanMalicious)}) vs δ_honest (${fmt(permTestC.meanHonest)})`);
console.log(`    - ${permTestC.observedDiff > 0 ? "恶意 agent δ 更高" : "恶意 agent δ 更低（与预期相反）"}，Cohen's d=${fmt(cohenDC)}（${effectSizeLabel(cohenDC)}效应）`);
console.log(`    - ${h2CSupported ? "✅ H2-δ 得到支持（Tier C）" : "❌ H2-δ 未得到支持（Tier C）"}`);

summary.analysis3_tierC = {
  hypothesis: "H2-δ: malicious agents have higher δ than honest agents (Tier C only, consistency check)",
  fileCount: tierCRuns.length,
  maliciousDeltaStats: distCMal,
  honestDeltaStats: distCHon,
  permutationTest: permTestC,
  cohensD: cohenDC,
  effectSize: effectSizeLabel(cohenDC),
  supported: h2CSupported,
};

// ============================================================================
// 分析 4：一致性比较 —— Tier B vs Tier C 效应量
// ============================================================================

printHeader("分析 4：一致性比较 —— Tier B vs Tier C 效应量");

console.log(`\n  ${"指标".padEnd(28)} ${"Tier C (26)".padStart(16)} ${"Tier B (14)".padStart(16)} ${"Combined (40)".padStart(16)}`);
console.log(`  ${"-".repeat(76)}`);
console.log(`  ${"δ_malicious mean".padEnd(28)} ${fmt(permTestC.meanMalicious).padStart(16)} ${fmt(permTestB.meanMalicious).padStart(16)} ${fmt(permTestCombined.meanMalicious).padStart(16)}`);
console.log(`  ${"δ_honest mean".padEnd(28)} ${fmt(permTestC.meanHonest).padStart(16)} ${fmt(permTestB.meanHonest).padStart(16)} ${fmt(permTestCombined.meanHonest).padStart(16)}`);
console.log(`  ${"mean diff (M-H)".padEnd(28)} ${fmt(permTestC.observedDiff).padStart(16)} ${fmt(permTestB.observedDiff).padStart(16)} ${fmt(permTestCombined.observedDiff).padStart(16)}`);
console.log(`  ${"Cohen's d".padEnd(28)} ${fmt(cohenDC).padStart(16)} ${fmt(cohenDB).padStart(16)} ${fmt(cohenDCombined).padStart(16)}`);
console.log(`  ${"p-value".padEnd(28)} ${fmt(permTestC.p, 4).padStart(16)} ${fmt(permTestB.p, 4).padStart(16)} ${fmt(permTestCombined.p, 4).padStart(16)}`);
console.log(`  ${"n_malicious".padEnd(28)} ${String(permTestC.nMalicious).padStart(16)} ${String(permTestB.nMalicious).padStart(16)} ${String(permTestCombined.nMalicious).padStart(16)}`);
console.log(`  ${"n_honest".padEnd(28)} ${String(permTestC.nHonest).padStart(16)} ${String(permTestB.nHonest).padStart(16)} ${String(permTestCombined.nHonest).padStart(16)}`);

const effectConsistent = cohenDB > 0 && cohenDC > 0;
const directionConsistent = permTestB.observedDiff > 0 && permTestC.observedDiff > 0;
console.log(`\n  一致性判断：`);
console.log(`    - 效应方向一致：${directionConsistent ? "✅ 两层均为 δ_mal > δ_hon" : "❌ 方向不一致"}`);
console.log(`    - 效应量量级一致：Tier B d=${fmt(cohenDB)} (${effectSizeLabel(cohenDB)}) vs Tier C d=${fmt(cohenDC)} (${effectSizeLabel(cohenDC)})`);
console.log(`    - ${effectConsistent && directionConsistent ? "✅ 跨数据层一致性确认" : "⚠ 跨数据层一致性存疑"}`);

summary.analysis4_consistency = {
  comparison: "Tier B vs Tier C effect sizes",
  tierC: { cohensD: cohenDC, meanDiff: permTestC.observedDiff, p: permTestC.p, effectSize: effectSizeLabel(cohenDC), nMalicious: permTestC.nMalicious, nHonest: permTestC.nHonest },
  tierB: { cohensD: cohenDB, meanDiff: permTestB.observedDiff, p: permTestB.p, effectSize: effectSizeLabel(cohenDB), nMalicious: permTestB.nMalicious, nHonest: permTestB.nHonest },
  combined: { cohensD: cohenDCombined, meanDiff: permTestCombined.observedDiff, p: permTestCombined.p, effectSize: effectSizeLabel(cohenDCombined), nMalicious: permTestCombined.nMalicious, nHonest: permTestCombined.nHonest },
  directionConsistent,
  effectConsistent,
};

// ============================================================================
// 分析 5：按攻击场景分组（single vs collusion）
// ============================================================================

printHeader("分析 5：按攻击场景分组 (single vs collusion)");

const singleSamples = allSamples.filter(s => s.attackScenario === "single");
const collusionSamples = allSamples.filter(s => s.attackScenario === "collusion");

const singleMal = singleSamples.filter(s => s.isMalicious).map(s => s.delta);
const singleHon = singleSamples.filter(s => !s.isMalicious && maliciousRunIds.has(s.runId)).map(s => s.delta);

const collusionMal = collusionSamples.filter(s => s.isMalicious).map(s => s.delta);
const collusionHon = collusionSamples.filter(s => !s.isMalicious && maliciousRunIds.has(s.runId)).map(s => s.delta);

console.log(`\n  Single attack (E/F groups):`);
console.log(`    恶意 n=${singleMal.length}, mean δ=${fmt(mean(singleMal))}`);
console.log(`    诚实 n=${singleHon.length}, mean δ=${fmt(mean(singleHon))}`);
if (singleMal.length >= 2 && singleHon.length >= 2) {
  const ptS = meanDiffPermutationTest(singleMal, singleHon, 10000);
  const cdS = cohensD(singleMal, singleHon);
  console.log(`    Cohen's d=${fmt(cdS)}, p=${fmt(ptS.p, 4)}, diff=${fmt(ptS.observedDiff)}`);
  summary.analysis5_attackScenario = summary.analysis5_attackScenario || {};
  (summary.analysis5_attackScenario as Record<string, unknown>).single = {
    malicious: { n: singleMal.length, meanDelta: mean(singleMal) },
    honest: { n: singleHon.length, meanDelta: mean(singleHon) },
    cohensD: cdS,
    permutationTest: ptS,
  };
}

console.log(`\n  Collusion attack (G group):`);
console.log(`    恶意 n=${collusionMal.length}, mean δ=${fmt(mean(collusionMal))}`);
console.log(`    诚实 n=${collusionHon.length}, mean δ=${fmt(mean(collusionHon))}`);
if (collusionMal.length >= 2 && collusionHon.length >= 2) {
  const ptG = meanDiffPermutationTest(collusionMal, collusionHon, 10000);
  const cdG = cohensD(collusionMal, collusionHon);
  console.log(`    Cohen's d=${fmt(cdG)}, p=${fmt(ptG.p, 4)}, diff=${fmt(ptG.observedDiff)}`);
  (summary.analysis5_attackScenario as Record<string, unknown>).collusion = {
    malicious: { n: collusionMal.length, meanDelta: mean(collusionMal) },
    honest: { n: collusionHon.length, meanDelta: mean(collusionHon) },
    cohensD: cdG,
    permutationTest: ptG,
  };
}

// ============================================================================
// 保存 JSON
// ============================================================================

const resultsDir = path.join(V2_DIR, "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
const outPath = path.join(resultsDir, "analyze_h2_delta_extended.json");
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf-8");

console.log("\n" + "=".repeat(78));
console.log(`  JSON 摘要已保存：${path.relative(process.cwd(), outPath)}`);
console.log("=".repeat(78));
