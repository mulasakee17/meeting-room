/**
 * 因果效应分析运行脚本
 *
 * 用法: npx tsx experiments/v2/causalAnalysis.ts
 *
 * 加载全部 V2 实验数据，执行轨迹匹配因果推断，输出报告。
 */

import * as fs from "fs";
import * as path from "path";
import {
  extractTrajectory,
  analyzeCausalEffects,
  type ExperimentTrajectory,
  type CausalAnalysisResult,
} from "../../src/lib/analysis/causalEffect";

// ============================================================================
// 数据加载
// ============================================================================

interface RawExperiment {
  runId: string;
  ablation: string;
  totalRounds?: number;
  kendallTau: number;
  decisionQuality: number;
  tauTrajectory?: number[];
  rounds?: Array<{
    roundNumber: number;
    tau?: number;
    beliefs?: Record<string, number>;
    interventions?: Array<{ type: string; targetAgentId?: string; targetAgents?: string[] }>;
  }>;
  error?: string;
}

function loadData(dir: string): RawExperiment[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "summary.json");
  const results: RawExperiment[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), "utf-8");
      const data = JSON.parse(raw);
      if (data.error) continue; // 跳过失败实验
      results.push(data);
    } catch {
      // 跳过解析失败
    }
  }

  return results;
}

// ============================================================================
// 报告格式化
// ============================================================================

function fmt(n: number, decimals: number = 3): string {
  if (isNaN(n)) return "  N/A  ";
  return n.toFixed(decimals).padStart(7);
}

function printHeader(title: string) {
  console.log("\n" + "=".repeat(72));
  console.log(`  ${title}`);
  console.log("=".repeat(72));
}

function printSummaryTable(summaries: any[], title: string) {
  printHeader(title);
  console.log(
    "  Group                    | n_trt | n_ctr | Observed τ | Counterf.τ |  Effect  |  95% CI  |  d  | p-value"
  );
  console.log("-".repeat(105));

  for (const s of summaries) {
    const ciStr = isNaN(s.ciLower)
      ? "   N/A   "
      : `[${fmt(s.ciLower, 2)}, ${fmt(s.ciUpper, 2)}]`;
    const pStr = isNaN(s.pValue) ? "  N/A " : s.pValue.toFixed(3);
    const sig = !isNaN(s.pValue) && s.pValue < 0.05 ? " *" : "  ";
    console.log(
      `  ${s.label.padEnd(24)} | ${String(s.nTreated).padStart(5)} | ${String(s.nDonors).padStart(5)} | ${fmt(s.meanObservedTau)} | ${fmt(s.meanCounterfactualTau)} | ${fmt(s.meanEffect)}${sig} | ${ciStr} | ${fmt(s.cohensD, 2)} | ${pStr}`
    );
  }
}

function printIndividualEffects(result: CausalAnalysisResult) {
  printHeader("个体层面因果效应（前 20 个）");
  console.log("  Run ID                | Observed | Counterf. | Effect  | 1st Intervention      | Round");
  console.log("-".repeat(85));

  const sorted = [...result.individualEffects].sort((a, b) => b.effect - a.effect);
  for (const e of sorted.slice(0, 20)) {
    const intvType = e.firstInterventionType || "none";
    const intvRound = e.firstInterventionRound ?? "-";
    console.log(
      `  ${e.runId.padEnd(22)} | ${fmt(e.observedTau)} | ${fmt(e.counterfactualTau)} | ${fmt(e.effect)} | ${intvType.padEnd(21)} | ${intvRound}`
    );
  }
  if (sorted.length > 20) {
    console.log(`  ... 还有 ${sorted.length - 20} 个实验未显示`);
  }
}

function printAssumptions(result: CausalAnalysisResult) {
  printHeader("方法与假设");
  console.log(`  方法: ${result.method}`);
  console.log("");
  console.log("  假设与限制:");
  for (const a of result.assumptions) {
    console.log(`    • ${a}`);
  }
}

// ============================================================================
// 主入口
// ============================================================================

function main() {
  const dataDirs = [
    { dir: path.join(__dirname, "data"), label: "M&A (5 rounds)" },
    { dir: path.join(__dirname, "data_invest"), label: "Invest (5 rounds)" },
    { dir: path.join(__dirname, "data_invest_3round"), label: "Invest (3 rounds)" },
  ];

  console.log("SwarmAlpha 因果效应分析");
  console.log("方法: 最近邻轨迹匹配 + 置换检验 + Bootstrap CI\n");

  // 加载数据
  const allTrajectories: ExperimentTrajectory[] = [];
  let totalLoaded = 0;
  let totalSkipped = 0;

  for (const { dir, label } of dataDirs) {
    const raw = loadData(dir);
    let extracted = 0;
    let skipped = 0;

    for (const exp of raw) {
      const traj = extractTrajectory(exp);
      if (traj) {
        allTrajectories.push(traj);
        extracted++;
      } else {
        skipped++;
      }
    }

    console.log(`  ${label}: ${extracted} extracted, ${skipped} skipped (${raw.length} total)`);
    totalLoaded += extracted;
    totalSkipped += skipped;
  }

  console.log(`\n  总计: ${totalLoaded} trajectories loaded, ${totalSkipped} skipped`);

  if (totalLoaded === 0) {
    console.log("\n  无可用数据，退出。");
    return;
  }

  // 执行因果分析
  console.log("\n  执行因果分析（k=5, 10000 permutations, 10000 bootstrap）...");
  const result = analyzeCausalEffects(allTrajectories, 5, 10000, 10000);

  // 输出报告
  printSummaryTable(result.overallATE, "总体平均处理效应 (Overall ATE)");
  printSummaryTable(result.perInterventionType, "按首次干预类型分组 (Per Intervention Type)");
  printSummaryTable(result.perInterventionRound, "按首次干预轮次分组 (Per Intervention Round)");
  printIndividualEffects(result);
  printAssumptions(result);

  console.log("\n" + "=".repeat(72));
  console.log("  分析完成");
  console.log("=".repeat(72));
}

main();
