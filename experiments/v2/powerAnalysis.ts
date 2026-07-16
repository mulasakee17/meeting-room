/**
 * 统计功效分析（Power Analysis）
 *
 * 研究问题：当前样本量是否足够？需要多少样本才能可靠检测观测到的效应？
 *
 * 方法：
 * 1. 从实验数据中提取观测效应量（Cohen's d）
 * 2. 用非中心 t 分布计算当前功效（power = P(reject H0 | H1 true)）
 * 3. 用迭代法计算达到目标功效（80%/90%）所需的样本量
 * 4. 对每个关键比较（full vs none, shuffle vs none）分别计算
 *
 * 统计约定：
 * - α = 0.05（双侧）
 * - 使用非中心 t 分布的近似公式
 * - Cohen's d 效应量解释：0.2 小, 0.5 中, 0.8 大
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ============================================================================
// 安全 JSON 解析
// ============================================================================
function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

// ============================================================================
// 统计工具
// ============================================================================
function mean(v: number[]): number {
  return v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length;
}

function stdDev(v: number[]): number {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

function cohensD(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return 0;
  const ma = mean(a), mb = mean(b);
  const va = a.reduce((s, v) => s + (v - ma) ** 2, 0) / (a.length - 1);
  const vb = b.reduce((s, v) => s + (v - mb) ** 2, 0) / (b.length - 1);
  const sp = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
  return sp === 0 ? 0 : (ma - mb) / sp;
}

// t 分布临界值表（双侧 α=0.05）
const T_TABLE_005: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
  6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
  16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
  21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
  26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
  40: 2.021, 60: 2.000, 120: 1.980,
};

function tCritical(df: number): number {
  if (df <= 0) return 12.706;
  if (T_TABLE_005[df]) return T_TABLE_005[df];
  const keys = Object.keys(T_TABLE_005).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (df > keys[i] && df < keys[i + 1]) {
      const t0 = T_TABLE_005[keys[i]], t1 = T_TABLE_005[keys[i + 1]];
      return t0 + (t1 - t0) * (df - keys[i]) / (keys[i + 1] - keys[i]);
    }
  }
  return 1.96;
}

/**
 * 正态分布累积分布函数 CDF（Abramowitz & Stegun 近似）
 */
function normalCDF(x: number): number {
  // 标准正态 CDF 近似
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) prob = 1 - prob;
  return prob;
}

/**
 * 非中心 t 分布 CDF 近似（使用正态近似）
 *
 * 当 df 足够大时（df >= 10），非中心 t ≈ 正态(δ, 1)
 * 其中 δ = d * sqrt(n/2)（两组等样本量 n 时的非中心参数）
 *
 * power = P(T > t_crit | H1) = 1 - Φ(t_crit - δ) + Φ(-t_crit - δ)
 * 对于双侧检验：power = 1 - Φ(t_crit - δ) + Φ(-t_crit - δ)
 */
function powerTwoSample(d: number, nPerGroup: number, alpha = 0.05): number {
  if (d === 0) return alpha;
  // 非中心参数（等样本量两组 t 检验）
  const ncp = d * Math.sqrt(nPerGroup / 2);
  const df = 2 * nPerGroup - 2;
  const tcrit = tCritical(df);

  // 双侧检验功效
  const power = 1 - normalCDF(tcrit - ncp) + normalCDF(-tcrit - ncp);
  return Math.max(alpha, Math.min(1, power));
}

/**
 * 通过迭代找到达到目标功效所需的最小样本量
 */
function sampleSizeForPower(d: number, targetPower = 0.8, alpha = 0.05): number {
  if (d === 0) return Infinity;
  // 从 n=3 开始搜索
  for (let n = 3; n <= 1000; n++) {
    if (powerTwoSample(d, n, alpha) >= targetPower) return n;
  }
  return Infinity;
}

// ============================================================================
// 数据加载
// ============================================================================
interface ExperimentResult {
  runId: string;
  ablation: string;
  kendallTau: number;
  decisionQuality: number;
}

function loadData(dataDir: string, prefix: string): ExperimentResult[] {
  if (!fs.existsSync(dataDir)) return [];
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json") && f.startsWith(prefix) && f !== "summary.json");
  return files.map(f => {
    const content = fs.readFileSync(path.join(dataDir, f), "utf-8");
    return safeJsonParse<ExperimentResult | null>(content, null);
  }).filter((r): r is ExperimentResult => r !== null && !r.error);
}

// ============================================================================
// 分析
// ============================================================================
function analyzePower(a: number[], b: number[], label: string, taskName: string) {
  const d = cohensD(a, b);
  const n = Math.min(a.length, b.length);
  const currentPower = powerTwoSample(d, n);
  const nFor80 = sampleSizeForPower(d, 0.8);
  const nFor90 = sampleSizeForPower(d, 0.9);

  const effectSizeLabel = Math.abs(d) >= 0.8 ? "大" : Math.abs(d) >= 0.5 ? "中" : Math.abs(d) >= 0.2 ? "小" : "微小";

  console.log(`\n  [${taskName}] ${label}`);
  console.log(`    效应量 d = ${d.toFixed(3)} (${effectSizeLabel})`);
  console.log(`    当前 n = ${n}/组, 功效 = ${(currentPower * 100).toFixed(1)}%`);
  console.log(`    达到 80% 功效需 n = ${nFor80 === Infinity ? "∞" : nFor80}/组 ${nFor80 !== Infinity && nFor80 > n ? `(还需 ${nFor80 - n})` : "✅ 已满足"}`);
  console.log(`    达到 90% 功效需 n = ${nFor90 === Infinity ? "∞" : nFor90}/组 ${nFor90 !== Infinity && nFor90 > n ? `(还需 ${nFor90 - n})` : "✅ 已满足"}`);

  return { label, d, n, currentPower, nFor80, nFor90 };
}

// ============================================================================
// 主函数
// ============================================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function main() {
  console.log("=".repeat(80));
  console.log("  统计功效分析（Power Analysis）");
  console.log("=".repeat(80));
  console.log("\n方法: 非中心 t 分布近似, 双侧 α=0.05");
  console.log("效应量解释: |d|≥0.8 大, ≥0.5 中, ≥0.2 小");

  // ===== Crisis =====
  const crisisDir = path.resolve(__dirname, "data_crisis");
  const crisisFull = loadData(crisisDir, "crisis_full");
  const crisisNone = loadData(crisisDir, "crisis_none");
  const crisisShuffle = loadData(crisisDir, "crisis_shuffle");

  console.log("\n" + "-".repeat(80));
  console.log("  Crisis 任务");
  console.log("-".repeat(80));

  const crisisResults = [
    analyzePower(
      crisisFull.map(r => r.kendallTau),
      crisisNone.map(r => r.kendallTau),
      "full vs none (治理效果)",
      "Crisis"
    ),
    analyzePower(
      crisisShuffle.map(r => r.kendallTau),
      crisisNone.map(r => r.kendallTau),
      "shuffle vs none (信息交换上限)",
      "Crisis"
    ),
    analyzePower(
      crisisShuffle.map(r => r.kendallTau),
      crisisFull.map(r => r.kendallTau),
      "shuffle vs full (治理 vs 理论上限)",
      "Crisis"
    ),
  ];

  // ===== Supplier =====
  const supplierDir = path.resolve(__dirname, "data_supplier");
  const supplierFull = loadData(supplierDir, "supplier_full");
  const supplierNone = loadData(supplierDir, "supplier_none");
  const supplierShuffle = loadData(supplierDir, "supplier_shuffle");

  console.log("\n" + "-".repeat(80));
  console.log("  Supplier 任务");
  console.log("-".repeat(80));

  const supplierResults = [
    analyzePower(
      supplierFull.map(r => r.kendallTau),
      supplierNone.map(r => r.kendallTau),
      "full vs none (治理效果)",
      "Supplier"
    ),
    analyzePower(
      supplierShuffle.map(r => r.kendallTau),
      supplierNone.map(r => r.kendallTau),
      "shuffle vs none (信息交换上限)",
      "Supplier"
    ),
    analyzePower(
      supplierShuffle.map(r => r.kendallTau),
      supplierFull.map(r => r.kendallTau),
      "shuffle vs full (治理 vs 理论上限)",
      "Supplier"
    ),
  ];

  // ===== 总结表 =====
  console.log("\n" + "=".repeat(80));
  console.log("  功效分析总结");
  console.log("=".repeat(80));

  console.log("\n| 任务 | 比较 | d | 当前 n | 当前功效 | 需 n(80%) | 需 n(90%) | 状态 |");
  console.log("|------|------|---|--------|----------|----------|----------|------|");

  const allResults = [
    ...crisisResults.map(r => ({ ...r, task: "Crisis" })),
    ...supplierResults.map(r => ({ ...r, task: "Supplier" })),
  ];

  for (const r of allResults) {
    const status = r.currentPower >= 0.8 ? "✅ 充分" : r.currentPower >= 0.5 ? "⚠️ 不足" : "❌ 严重不足";
    console.log(`| ${r.task} | ${r.label} | ${r.d.toFixed(2)} | ${r.n} | ${(r.currentPower * 100).toFixed(0)}% | ${r.nFor80 === Infinity ? "∞" : r.nFor80} | ${r.nFor90 === Infinity ? "∞" : r.nFor90} | ${status} |`);
  }

  // ===== 关键结论 =====
  console.log("\n" + "-".repeat(80));
  console.log("  关键结论");
  console.log("-".repeat(80));

  const crisisGov = crisisResults[0];
  const supplierGov = supplierResults[0];

  console.log(`\n1. Crisis 治理效果: d=${crisisGov.d.toFixed(2)}, 功效=${(crisisGov.currentPower * 100).toFixed(0)}%`);
  if (crisisGov.currentPower >= 0.8) {
    console.log(`   ✅ 当前 n=${crisisGov.n} 足以可靠检测此效应`);
  } else {
    console.log(`   ⚠️ 当前功效不足，需扩样到 n=${crisisGov.nFor80} 才能达到 80% 功效`);
  }

  console.log(`\n2. Supplier 治理效果: d=${supplierGov.d.toFixed(2)}, 功效=${(supplierGov.currentPower * 100).toFixed(0)}%`);
  if (supplierGov.currentPower >= 0.8) {
    console.log(`   ✅ 当前 n=${supplierGov.n} 足以可靠检测此效应`);
  } else {
    console.log(`   ⚠️ 当前功效不足（这解释了为什么 p=0.15 不显著）`);
    console.log(`   → 需扩样到 n=${supplierGov.nFor80} 才能达到 80% 功效`);
    if (supplierGov.nFor80 > supplierGov.n) {
      console.log(`   → 需新增 ${supplierGov.nFor80 - supplierGov.n} 次实验/cell`);
    }
  }
}

main();
