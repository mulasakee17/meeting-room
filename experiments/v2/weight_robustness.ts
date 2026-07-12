/**
 * 评估权重稳健性检查
 *
 * 目的：验证五维评估权重（0.20/0.25/0.20/0.17/0.18）是否影响主要结论。
 * 方法：用等权（0.20×5）重新计算总分，对比两种权重下的排名和等级分布。
 *
 * 如果结论不变 → "权重选择不影响主要结论"
 * 如果结论改变 → 需要进一步调查
 *
 * 用法: npx tsx experiments/v2/weight_robustness.ts
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// 类型定义
// ============================================================================

interface ExperimentResult {
  runId: string;
  ablation: string;
  runIndex: number;
  evaluationScores: Record<string, number>;
}

// ============================================================================
// 权重配置
// ============================================================================

/** 当前使用的启发式权重 */
const HEURISTIC_WEIGHTS: Record<string, number> = {
  consensus: 0.20,
  reliability: 0.25,
  dispersion: 0.20,
  stability: 0.17,
  influenceAnalysis: 0.18,
};

/** 等权基准 */
const EQUAL_WEIGHTS: Record<string, number> = {
  consensus: 0.20,
  reliability: 0.20,
  dispersion: 0.20,
  stability: 0.20,
  influenceAnalysis: 0.20,
};

const DIMENSIONS = ["consensus", "reliability", "dispersion", "stability", "influenceAnalysis"];

// ============================================================================
// 数据加载
// ============================================================================

const DATA_DIR = path.resolve(__dirname, "data");
const DATA_INVEST_DIR = path.resolve(__dirname, "data_invest");

function loadData(dir: string): ExperimentResult[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json") && f !== "summary.json");
  return files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")));
}

// ============================================================================
// 重新计算总分
// ============================================================================

function computeOverall(scores: Record<string, number>, weights: Record<string, number>): number {
  let total = 0;
  for (const dim of DIMENSIONS) {
    total += (scores[dim] ?? 0) * weights[dim];
  }
  return Math.round(total * 100) / 100;
}

function getGrade(score: number): string {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 55) return "fair";
  if (score >= 40) return "poor";
  return "critical";
}

// ============================================================================
// 统计工具
// ============================================================================

function mean(v: number[]) { return v.reduce((a, b) => a + b, 0) / v.length; }
function stdDev(v: number[]) {
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

// ============================================================================
// 主逻辑
// ============================================================================

function analyze(data: ExperimentResult[], label: string) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${label} — 评估权重稳健性检查`);
  console.log(`${"=".repeat(70)}\n`);

  // 按 ablation 分组
  const groups: Record<string, ExperimentResult[]> = {};
  for (const r of data) {
    if (!groups[r.ablation]) groups[r.ablation] = [];
    groups[r.ablation].push(r);
  }

  const ablations = Object.keys(groups).sort();
  console.log("消融组 | 当前权重总分 (mean±std) | 等权总分 (mean±std) | Δ | 等级变化");
  console.log("-".repeat(85));

  let gradeChanges = 0;
  let rankChanges = 0;

  // 存储两种权重下各组均分用于排名对比
  const heuristicMeans: Record<string, number> = {};
  const equalMeans: Record<string, number> = {};

  for (const ab of ablations) {
    const results = groups[ab];
    const heuristicScores = results.map(r => computeOverall(r.evaluationScores, HEURISTIC_WEIGHTS));
    const equalScores = results.map(r => computeOverall(r.evaluationScores, EQUAL_WEIGHTS));

    const hMean = mean(heuristicScores);
    const eMean = mean(equalScores);
    const hStd = stdDev(heuristicScores);
    const eStd = stdDev(equalScores);
    const delta = eMean - hMean;

    heuristicMeans[ab] = hMean;
    equalMeans[ab] = eMean;

    // 等级变化
    const hGrade = getGrade(hMean);
    const eGrade = getGrade(eMean);
    const gradeChange = hGrade !== eGrade ? `${hGrade} → ${eGrade}` : "无变化";
    if (hGrade !== eGrade) gradeChanges++;

    console.log(
      `${ab.padEnd(20)} | ${hMean.toFixed(1)}±${hStd.toFixed(1)} | ${eMean.toFixed(1)}±${eStd.toFixed(1)} | ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} | ${gradeChange}`
    );
  }

  // 排名对比
  console.log("\n--- 排名对比 ---\n");
  const hRank = ablations.slice().sort((a, b) => heuristicMeans[b] - heuristicMeans[a]);
  const eRank = ablations.slice().sort((a, b) => equalMeans[b] - equalMeans[a]);

  console.log("排名 | 当前权重 | 等权");
  console.log("-".repeat(50));
  for (let i = 0; i < hRank.length; i++) {
    const same = hRank[i] === eRank[i] ? "✓" : "✗";
    if (hRank[i] !== eRank[i]) rankChanges++;
    console.log(`${String(i + 1).padStart(2)}   | ${hRank[i].padEnd(20)} | ${eRank[i].padEnd(20)} ${same}`);
  }

  // 结论
  console.log("\n--- 稳健性结论 ---\n");
  console.log(`等级变化次数: ${gradeChanges}/${ablations.length}`);
  console.log(`排名变化次数: ${rankChanges}/${ablations.length}`);

  if (gradeChanges === 0 && rankChanges === 0) {
    console.log("✅ 结论: 权重选择不影响主要结论。等权与当前权重产生相同的排名和等级。");
  } else if (gradeChanges <= 1 && rankChanges <= 1) {
    console.log("🟡 结论: 权重选择对结论有轻微影响，但主要排名趋势一致。");
  } else {
    console.log("⚠️ 结论: 权重选择显著影响结论。当前权重的结论不具有稳健性。");
  }
}

// ============================================================================
// 执行
// ============================================================================

const maData = loadData(DATA_DIR);
const investData = loadData(DATA_INVEST_DIR);

if (maData.length > 0) {
  analyze(maData, "企业并购任务 (M&A)");
}

if (investData.length > 0) {
  analyze(investData, "投资决策任务 (Invest)");
}

console.log("\n" + "=".repeat(70));
console.log("  注: 此脚本不修改任何实验数据，仅重新计算已有数据的加权总分。");
console.log("=".repeat(70) + "\n");
