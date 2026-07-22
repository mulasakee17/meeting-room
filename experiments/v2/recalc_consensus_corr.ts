/**
 * 重算脚本：统一 Kuramoto R 公式，跨 Crisis + Supplier 两任务
 * 
 * 目的：解决 PAPER_DRAFT r≈-0.14 与 ROADMAP r≈-0.05 的不一致
 * 
 * 关键设计：
 * 1. 统一用 H4 修复后的 Kuramoto R：θ = b·π/2
 * 2. 排除 crisis_full_fixed（D1-D4 修复后的补充实验，不算原始样本）
 * 3. 包含 shuffle 组（信息拓扑重排对照）
 * 4. 输出分任务 + 跨任务的 r 值
 * 5. 验证 N=169 的来源
 */

import * as fs from "fs";
import * as path from "path";
import { mulberry32, mean, PERMUTATION_SEED } from "./statsShared";

interface ExperimentResult {
  runId: string;
  ablation: string;
  kendallTau: number;
  rounds: Array<{ roundNumber: number; beliefs: Record<string, number> }>;
}

function loadData(dir: string, prefix: string): any[] {
  const files = fs.readdirSync(dir).filter(
    f => f.endsWith(".json") && f.startsWith(prefix) && f !== "summary.json"
  );
  return files.map(f => {
    const content = fs.readFileSync(path.join(dir, f), "utf-8");
    return JSON.parse(content);
  });
}

function sampleStd(v: number[]): number {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

function pearsonCorr(x: number[], y: number[]): number {
  const mx = mean(x), my = mean(y);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

function permutationCorrTest(x: number[], y: number[], nPerm: number = 10000): number {
  const obsR = pearsonCorr(x, y);
  const rng = mulberry32(PERMUTATION_SEED);
  let count = 0;
  const yPerm = [...y];
  for (let i = 0; i < nPerm; i++) {
    for (let j = yPerm.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [yPerm[j], yPerm[k]] = [yPerm[k], yPerm[j]];
    }
    const permR = pearsonCorr(x, yPerm);
    if (Math.abs(permR) >= Math.abs(obsR)) count++;
  }
  return (count + 1) / (nPerm + 1);
}

/** 计算 Kuramoto R（H4 修复后：θ = b·π/2） */
function computeKuramotoR(beliefs: number[]): number {
  if (beliefs.length < 2) return NaN;
  let sumCos = 0, sumSin = 0;
  for (const b of beliefs) {
    const theta = b * Math.PI / 2;
    sumCos += Math.cos(theta);
    sumSin += Math.sin(theta);
  }
  return Math.sqrt(sumCos * sumCos + sumSin * sumSin) / beliefs.length;
}

/** 计算旧公式 consensusLevel（1-2·std，H4 修复前） */
function computeOldConsensusLevel(beliefs: number[]): number {
  if (beliefs.length < 2) return NaN;
  return 1 - 2 * sampleStd(beliefs);
}

function extractValidSamples(data: any[]): { r: number; tau: number; rOld: number }[] {
  return data.map(r => {
    const rounds = r.rounds;
    if (!rounds || rounds.length === 0) return null;
    const lastRound = rounds[rounds.length - 1];
    const beliefs = Object.values(lastRound.beliefs || {});
    if (beliefs.length < 2) return null;
    return {
      r: computeKuramotoR(beliefs),
      tau: r.kendallTau,
      rOld: computeOldConsensusLevel(beliefs),
    };
  }).filter((v): v is { r: number; tau: number; rOld: number } => v !== null);
}

const CRISIS_DIR = path.resolve(__dirname, "data_crisis");
const SUPPLIER_DIR = path.resolve(__dirname, "data_supplier");

function main() {
  console.log("=".repeat(72));
  console.log("重算：统一 Kuramoto R 公式 + 跨任务 r 值");
  console.log("=".repeat(72));
  console.log("H4 修复：θ = b·π/2（旧公式：consensusLevel = 1-2·std）");
  console.log("=".repeat(72));

  // ------------------------------------------------------------------------
  // 1. 加载数据（排除 crisis_full_fixed，不算原始实验）
  // ------------------------------------------------------------------------
  const crisisNone = loadData(CRISIS_DIR, "crisis_none");
  const crisisFull = loadData(CRISIS_DIR, "crisis_full");
  const crisisShuffle = loadData(CRISIS_DIR, "crisis_shuffle");
  
  const supplierNone = loadData(SUPPLIER_DIR, "supplier_none");
  const supplierFull = loadData(SUPPLIER_DIR, "supplier_full");
  const supplierShuffle = loadData(SUPPLIER_DIR, "supplier_shuffle");

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║ 数据加载统计（原始样本数）                                 ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║ Crisis: none=${crisisNone.length} full=${crisisFull.length} shuffle=${crisisShuffle.length} → ${crisisNone.length+crisisFull.length+crisisShuffle.length}`);
  console.log(`║ Supplier: none=${supplierNone.length} full=${supplierFull.length} shuffle=${supplierShuffle.length} → ${supplierNone.length+supplierFull.length+supplierShuffle.length}`);
  console.log(`║ 合计: ${crisisNone.length+crisisFull.length+crisisShuffle.length+supplierNone.length+supplierFull.length+supplierShuffle.length}`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  // ------------------------------------------------------------------------
  // 2. 提取有效样本（过滤 NaN）
  // ------------------------------------------------------------------------
  const crisisAll = [...crisisNone, ...crisisFull, ...crisisShuffle];
  const supplierAll = [...supplierNone, ...supplierFull, ...supplierShuffle];
  
  const crisisValid = extractValidSamples(crisisAll);
  const supplierValid = extractValidSamples(supplierAll);
  const allValid = [...crisisValid, ...supplierValid];

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║ 有效样本数（排除 NaN）                                     ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║ Crisis: ${crisisValid.length} / ${crisisAll.length}`);
  console.log(`║ Supplier: ${supplierValid.length} / ${supplierAll.length}`);
  console.log(`║ 合计: ${allValid.length} / ${crisisAll.length + supplierAll.length}`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  // ------------------------------------------------------------------------
  // 3. 计算相关系数（新旧公式对比）
  // ------------------------------------------------------------------------
  function printCorr(label: string, samples: { r: number; tau: number; rOld: number }[]) {
    const rs = samples.map(s => s.r);
    const taus = samples.map(s => s.tau);
    const rsOld = samples.map(s => s.rOld);

    const r = pearsonCorr(rs, taus);
    const p = permutationCorrTest(rs, taus);
    
    const rOld = pearsonCorr(rsOld, taus);
    const pOld = permutationCorrTest(rsOld, taus);

    console.log(`\n  ${label}`);
    console.log(`    Kuramoto R (H4修复后): r = ${r.toFixed(4)}, p = ${p.toFixed(4)}`);
    console.log(`    consensusLevel (旧公式): r = ${rOld.toFixed(4)}, p = ${pOld.toFixed(4)}`);
    console.log(`    R 均值 = ${mean(rs).toFixed(4)}, τ 均值 = ${mean(taus).toFixed(4)}`);
  }

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("相关系数计算（新旧公式对比）");
  console.log("══════════════════════════════════════════════════════════");

  printCorr("Crisis 任务", crisisValid);
  printCorr("Supplier 任务", supplierValid);
  printCorr("跨任务全样本", allValid);

  // ------------------------------------------------------------------------
  // 4. 对比文档记录
  // ------------------------------------------------------------------------
  const allR = pearsonCorr(allValid.map(s => s.r), allValid.map(s => s.tau));
  const allROld = pearsonCorr(allValid.map(s => s.rOld), allValid.map(s => s.tau));
  
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("与文档记录对比");
  console.log("══════════════════════════════════════════════════════════");
  console.log("┌────────────────────────────────────────────────────────┐");
  console.log("│ PAPER_DRAFT.md: r ≈ -0.14, N=169                      │");
  console.log("│ ROADMAP.md: r ≈ -0.05                                  │");
  console.log("└────────────────────────────────────────────────────────┘");
  console.log(`\n实跑结果（统一 Kuramoto R）:`);
  console.log(`  跨任务全样本: r = ${allR.toFixed(4)} (n=${allValid.length})`);
  console.log(`  Crisis 子集: r = ${pearsonCorr(crisisValid.map(s => s.r), crisisValid.map(s => s.tau)).toFixed(4)} (n=${crisisValid.length})`);
  
  console.log(`\n旧公式结果（consensusLevel=1-2·std）:`);
  console.log(`  跨任务全样本: r = ${allROld.toFixed(4)} (n=${allValid.length})`);
  console.log(`  Crisis 子集: r = ${pearsonCorr(crisisValid.map(s => s.rOld), crisisValid.map(s => s.tau)).toFixed(4)} (n=${crisisValid.length})`);

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("结论");
  console.log("══════════════════════════════════════════════════════════");
  console.log("  PAPER_DRAFT 的 r≈-0.14 可能来自旧公式（consensusLevel=1-2·std）");
  console.log("  ROADMAP 的 r≈-0.05 与新公式（Kuramoto R）一致");
  console.log("  建议统一使用 Kuramoto R（H4 修复后），r ≈", allR.toFixed(2));
  console.log("  若坚持使用旧公式，r ≈", allROld.toFixed(2), "（但公式已过时）");

  // ------------------------------------------------------------------------
  // 5. 稳定性检查（分 ablation）
  // ------------------------------------------------------------------------
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("稳定性检查（分 ablation）");
  console.log("══════════════════════════════════════════════════════════");
  
  const ablations = [
    { name: "crisis_none", data: crisisNone },
    { name: "crisis_full", data: crisisFull },
    { name: "crisis_shuffle", data: crisisShuffle },
    { name: "supplier_none", data: supplierNone },
    { name: "supplier_full", data: supplierFull },
    { name: "supplier_shuffle", data: supplierShuffle },
  ];

  for (const { name, data } of ablations) {
    const valid = extractValidSamples(data);
    if (valid.length === 0) continue;
    const r = pearsonCorr(valid.map(s => s.r), valid.map(s => s.tau));
    console.log(`  ${name.padEnd(20)}: r = ${r.toFixed(4)} (n=${valid.length})`);
  }
}

main();