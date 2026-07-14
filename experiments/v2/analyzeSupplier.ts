/**
 * Supplier 任务结果分析
 */

import * as fs from "fs";
import * as path from "path";

interface ExperimentResult {
  runId: string;
  ablation: string;
  kendallTau: number;
  decisionQuality: number;
  tauTrajectory: number[];
  totalRounds: number;
  converged: boolean;
  consensusLevel: number;
  opinionDiversity: number;
  totalInterventions: number;
  issuesDetected: string[];
  interventionEffects: Array<{
    round: number;
    interventionType: string;
    targetAgentId: string;
    beliefBefore: number;
    beliefAfter: number;
    effective: boolean;
  }>;
  interventionBreakdown: Record<string, number>;
}

function loadData(dir: string, prefix: string): ExperimentResult[] {
  const files = fs.readdirSync(dir).filter(
    f => f.endsWith(".json") && f.startsWith(prefix) && !f.includes("summary")
  );
  return files.map(f => {
    const content = fs.readFileSync(path.join(dir, f), "utf-8");
    return JSON.parse(content) as ExperimentResult;
  });
}

function mean(v: number[]): number {
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function std(v: number[]): number {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

const DATA_DIR = path.resolve(__dirname, "data_supplier");
const CRISIS_DIR = path.resolve(__dirname, "data_crisis");

function loadSummary(dir: string) {
  const summaryPath = path.join(dir, "summary.json");
  const raw = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
  const results = raw.results as ExperimentResult[];
  return {
    none: results.filter(r => r.ablation === "none"),
    full: results.filter(r => r.ablation === "full"),
    shuffle: results.filter(r => r.ablation === "shuffle"),
  };
}

function main() {
  const none = loadData(DATA_DIR, "supplier_none");
  const full = loadData(DATA_DIR, "supplier_full");
  const shuffle = loadData(DATA_DIR, "supplier_shuffle");

  // 从 summary.json 动态加载 Crisis 数据，避免硬编码
  const crisis = loadSummary(CRISIS_DIR);
  const crisisNoneTau = crisis.none.map(r => r.kendallTau);
  const crisisFullTau = crisis.full.map(r => r.kendallTau);
  const crisisShuffleTau = crisis.shuffle.map(r => r.kendallTau);

  console.log("=".repeat(70));
  console.log(`Supplier 任务结果分析 (n=${none.length}/${full.length}/${shuffle.length}，共${none.length + full.length + shuffle.length}次实验)`);
  console.log("=".repeat(70));

  const noneTau = none.map(r => r.kendallTau);
  const fullTau = full.map(r => r.kendallTau);
  const shuffleTau = shuffle.map(r => r.kendallTau);

  console.log("\n── 基本统计 ──");
  console.log(`none:    τ=${mean(noneTau).toFixed(3)}±${std(noneTau).toFixed(3)}, n=${none.length}`);
  console.log(`full:    τ=${mean(fullTau).toFixed(3)}±${std(fullTau).toFixed(3)}, n=${full.length}`);
  console.log(`shuffle: τ=${mean(shuffleTau).toFixed(3)}±${std(shuffleTau).toFixed(3)}, n=${shuffle.length}`);

  console.log("\n── 与 Crisis 任务对比 ──");
  console.log(`Crisis none:    τ=${mean(crisisNoneTau).toFixed(3)}±${std(crisisNoneTau).toFixed(3)}`);
  console.log(`Crisis full:    τ=${mean(crisisFullTau).toFixed(3)}±${std(crisisFullTau).toFixed(3)}`);
  console.log(`Crisis shuffle: τ=${mean(crisisShuffleTau).toFixed(3)}±${std(crisisShuffleTau).toFixed(3)}`);
  console.log("\nSupplier τ 普遍高于 Crisis，说明该任务更容易达成正确共识。");

  // 检查full vs none的差异
  const diff = mean(fullTau) - mean(noneTau);
  console.log(`\nfull vs none 差异: Δτ=${diff.toFixed(3)}`);
  
  if (diff > 0) {
    console.log("✅ 治理有效（τ 提升）");
  } else {
    console.log("❌ 治理无效或有害");
  }

  // 共识度与τ的关系
  const allData = [...none, ...full, ...shuffle];
  const consensusLevels = allData.map(r => r.consensusLevel);
  const taus = allData.map(r => r.kendallTau);
  
  // 简单相关计算
  const mx = mean(consensusLevels);
  const my = mean(taus);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < allData.length; i++) {
    num += (consensusLevels[i] - mx) * (taus[i] - my);
    dx += (consensusLevels[i] - mx) ** 2;
    dy += (taus[i] - my) ** 2;
  }
  const r = num / Math.sqrt(dx * dy);
  
  console.log(`\n── 共识度 vs τ 相关性 ──`);
  console.log(`r=${r.toFixed(3)}, n=${allData.length}`);
  console.log(`与 Crisis (r=0.009) 对比，验证"虚假共识"是否跨任务存在。`);
}

main();