/**
 * Qwen 跨模型分析（2026-07-26 新增）
 *
 * 动机：data_fraud_qwen/ 和 data_crisis_qwen/ 已跑完但从未做过 τ 跨模型对比。
 * 本脚本补全三模型（DeepSeek + Zhipu + Qwen）对比，揭示方向性矛盾。
 *
 * 复用 analyze_cross_model.ts 的统计函数，避免重复实现。
 *
 * 用法: npx tsx experiments/v2/analyze_cross_model_qwen.ts
 */

import * as fs from "fs";
import * as path from "path";
import { mulberry32, mean, sampleStd, cohensD, cohensDz, PERMUTATION_SEED } from "./statsShared";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";

interface ExperimentResult {
  runId: string;
  group: string;
  runIndex: number;
  kendallTau: number;
  totalUtterances: number;
  totalRounds: number;
  terminationReason: string;
  codeVersion?: string;
}

interface CrisisResult {
  runId: string;
  ablation: string;
  runIndex: number;
  kendallTau: number;
  decisionQuality: number;
  totalRounds: number;
  codeVersion?: string;
}

function stats(vals: number[]) {
  const n = vals.length;
  if (n === 0) return { mean: 0, std: 0, median: 0, min: 0, max: 0, n: 0 };
  const m = vals.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / n);
  const sorted = [...vals].sort((a, b) => a - b);
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  return { mean: m, std, median, min: sorted[0], max: sorted[n - 1], n };
}

function pairByRunIndex<T extends { runIndex: number }>(
  a: T[],
  b: T[]
): { a: T; b: T }[] {
  const bMap = new Map(b.map(r => [r.runIndex, r]));
  const result: { a: T; b: T }[] = [];
  for (const x of a) {
    const y = bMap.get(x.runIndex);
    if (y) result.push({ a: x, b: y });
  }
  return result;
}

function pairedPermutationTest(diffs: number[], nPerm = 10000): number {
  if (diffs.length < 2) return 1;
  const obsMean = mean(diffs);
  const rng = mulberry32(PERMUTATION_SEED);
  let count = 0;
  for (let i = 0; i < nPerm; i++) {
    let sum = 0;
    for (let j = 0; j < diffs.length; j++) {
      sum += (rng() > 0.5 ? 1 : -1) * diffs[j];
    }
    if (Math.abs(sum / diffs.length) >= Math.abs(obsMean)) count++;
  }
  return (count + 1) / (nPerm + 1);
}

function pairedCI(diffs: number[]): { lower: number; upper: number } {
  if (diffs.length < 2) return { lower: 0, upper: 0 };
  const n = diffs.length;
  const m = mean(diffs);
  const se = sampleStd(diffs) / Math.sqrt(n);
  const df = n - 1;
  const tTable: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
    6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
    11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
    16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
    25: 2.060, 30: 2.042,
  };
  const tc = tTable[df] ?? 2.0;
  return { lower: m - tc * se, upper: m + tc * se };
}

function interpretD(d: number): string {
  const abs = Math.abs(d);
  if (abs < 0.2) return "可忽略";
  if (abs < 0.5) return "小效应";
  if (abs < 0.8) return "中效应";
  return "大效应";
}

function loadFraudCResults(dir: string): ExperimentResult[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith("fraud_C_content_driven_") && f.endsWith(".json"))
    .sort();
  return files.map(f => {
    const parsed = safeJsonParse<ExperimentResult>(fs.readFileSync(path.join(dir, f), "utf-8"));
    if (!parsed) { console.warn(`[analyze_cross_model_qwen] 无法解析 JSON: ${f}`); return null; }
    return parsed;
  }).filter((r): r is ExperimentResult => r !== null);
}

function loadCrisisResults(dir: string, ablation: string): CrisisResult[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith("crisis_" + ablation + "_") && f.endsWith(".json") && !f.includes("fixed"))
    .sort();
  return files.map(f => {
    const parsed = safeJsonParse<CrisisResult>(fs.readFileSync(path.join(dir, f), "utf-8"));
    if (!parsed) { console.warn(`[analyze_cross_model_qwen] 无法解析 JSON: ${f}`); return null; }
    return parsed;
  }).filter((r): r is CrisisResult => r !== null);
}

// ==========================================================================
// Main
// ==========================================================================

const BASE = path.join(__dirname);
const DS_FRAUD_DIR = path.join(BASE, "data_fraud");
const ZP_FRAUD_DIR = path.join(BASE, "data_fraud_zhipu");
const QW_FRAUD_DIR = path.join(BASE, "data_fraud_qwen");
const DS_CRISIS_DIR = path.join(BASE, "data_crisis");
const QW_CRISIS_DIR = path.join(BASE, "data_crisis_qwen");

console.log("=".repeat(80));
console.log("  Qwen 跨模型分析（2026-07-26 新增）");
console.log("  补全 DeepSeek + Zhipu + Qwen 三模型对比");
console.log("=".repeat(80));

// ── Section A: Fraud 任务 C 组三模型对比 ──
console.log("\n## Section A: Fraud 任务 C 组三模型对比\n");

const dsC = loadFraudCResults(DS_FRAUD_DIR);
const zpC = loadFraudCResults(ZP_FRAUD_DIR);
const qwC = loadFraudCResults(QW_FRAUD_DIR);

const fraudCProviders = [
  { name: "DeepSeek-V3", data: dsC },
  { name: "Zhipu glm-4-flash", data: zpC },
  { name: "Qwen", data: qwC },
];

console.log("| 模型 | n | τ 均值 ± σ | τ=1.0 | τ≥0.8 | 发言数 |");
console.log("|------|---|-------------|-------|-------|--------|");
for (const prov of fraudCProviders) {
  if (prov.data.length === 0) {
    console.log("| " + prov.name + " | 0 | N/A | - | - | - |");
    continue;
  }
  const taus = prov.data.map(d => d.kendallTau);
  const utts = prov.data.map(d => d.totalUtterances);
  const s = stats(taus);
  const us = stats(utts);
  const tau1 = prov.data.filter(d => d.kendallTau === 1).length;
  const tauGt08 = prov.data.filter(d => d.kendallTau >= 0.8).length;
  console.log("| " + prov.name + " | " + s.n + " | " + s.mean.toFixed(3) + " ± " + s.std.toFixed(3) + " | " + tau1 + "/" + s.n + " | " + tauGt08 + "/" + s.n + " | " + us.mean.toFixed(1) + " |");
}

// 三模型两两配对检验
console.log("\n### 两两配对统计检验（按 runIndex 配对）\n");
const modelPairs: { label: string; a: ExperimentResult[]; b: ExperimentResult[] }[] = [
  { label: "Zhipu vs DeepSeek", a: dsC, b: zpC },
  { label: "Qwen vs DeepSeek", a: dsC, b: qwC },
  { label: "Qwen vs Zhipu", a: zpC, b: qwC },
];
for (const mp of modelPairs) {
  const paired = pairByRunIndex(mp.a, mp.b);
  if (paired.length < 2) {
    console.log("- " + mp.label + ": 配对数 " + paired.length + " < 2，跳过");
    continue;
  }
  const diffs = paired.map(pp => pp.b.kendallTau - pp.a.kendallTau);
  const dz = cohensDz(diffs);
  const pVal = pairedPermutationTest(diffs);
  const ci = pairedCI(diffs);
  const deltaStr = (mean(diffs) >= 0 ? "+" : "") + mean(diffs).toFixed(3);
  console.log("- **" + mp.label + "** (n=" + paired.length + "): Δτ=" + deltaStr + " ± " + sampleStd(diffs).toFixed(3) + ", d_z=" + dz.toFixed(3) + " (" + interpretD(dz) + "), p=" + pVal.toFixed(4) + ", 95%CI=[" + ci.lower.toFixed(3) + ", " + ci.upper.toFixed(3) + "]" + (pVal < 0.05 ? " ✅显著" : " ⚪不显著"));
}

// ── Section B: Crisis 任务两模型三组对比 ──
console.log("\n## Section B: Crisis 任务两模型三组对比（治理效应跨模型验证）\n");

const crisisAblations = ["none", "full", "shuffle"] as const;

console.log("| 组 | DeepSeek τ | Qwen τ | Δτ (Qwen-DS) |");
console.log("|----|-----------|--------|--------------|");

const crisisComparisons: { ablation: string; dsTau: number; qwTau: number; dsN: number; qwN: number }[] = [];

for (const ablation of crisisAblations) {
  const dsData = loadCrisisResults(DS_CRISIS_DIR, ablation);
  const qwData = loadCrisisResults(QW_CRISIS_DIR, ablation);
  const dsTau = dsData.length > 0 ? stats(dsData.map(d => d.kendallTau)) : null;
  const qwTau = qwData.length > 0 ? stats(qwData.map(d => d.kendallTau)) : null;

  if (dsTau && qwTau) {
    crisisComparisons.push({ ablation, dsTau: dsTau.mean, qwTau: qwTau.mean, dsN: dsTau.n, qwN: qwTau.n });
    const delta = (qwTau.mean - dsTau.mean).toFixed(3);
    const deltaPct = ((qwTau.mean / dsTau.mean - 1) * 100).toFixed(1) + "%";
    console.log("| " + ablation + " | " + dsTau.mean.toFixed(3) + " ± " + dsTau.std.toFixed(3) + " (n=" + dsTau.n + ") | " + qwTau.mean.toFixed(3) + " ± " + qwTau.std.toFixed(3) + " (n=" + qwTau.n + ") | " + delta + " (" + deltaPct + ") |");
  }
}

// 治理效应方向对比
console.log("\n### 治理效应方向跨模型对比（核心发现）\n");
if (crisisComparisons.length >= 2) {
  const noneC = crisisComparisons.find(c => c.ablation === "none");
  const fullC = crisisComparisons.find(c => c.ablation === "full");
  const shuffleC = crisisComparisons.find(c => c.ablation === "shuffle");

  if (noneC && fullC) {
    const dsGovEffect = fullC.dsTau - noneC.dsTau;
    const qwGovEffect = fullC.qwTau - noneC.qwTau;
    console.log("| 模型 | none τ | full τ | 治理效应 (full-none) | 方向 |");
    console.log("|------|--------|--------|---------------------|------|");
    console.log("| DeepSeek | " + noneC.dsTau.toFixed(3) + " | " + fullC.dsTau.toFixed(3) + " | " + (dsGovEffect >= 0 ? "+" : "") + dsGovEffect.toFixed(3) + " | " + (dsGovEffect > 0 ? "✅ 正向（治理有效）" : "❌ 负向") + " |");
    console.log("| Qwen | " + noneC.qwTau.toFixed(3) + " | " + fullC.qwTau.toFixed(3) + " | " + (qwGovEffect >= 0 ? "+" : "") + qwGovEffect.toFixed(3) + " | " + (qwGovEffect > 0 ? "✅ 正向" : "❌ 负向（治理无效甚至有害）") + " |");

    if (dsGovEffect > 0 && qwGovEffect <= 0) {
      console.log("\n> ⚠️ **方向矛盾**：DeepSeek 上治理有效（Δτ=+" + dsGovEffect.toFixed(3) + "），Qwen 上治理无效甚至略负（Δτ=" + (qwGovEffect >= 0 ? "+" : "") + qwGovEffect.toFixed(3) + "）。");
      console.log("> 这表明\"治理提升决策质量\"并非跨模型普适——治理效应受模型能力与任务交互影响。");
      console.log("> 可能解释：Qwen none 组基线已较高（" + noneC.qwTau.toFixed(3) + " vs DeepSeek " + noneC.dsTau.toFixed(3) + "），存在天花板效应；或 Qwen 在无治理下已能自发整合信息。");
    } else if (dsGovEffect > 0 && qwGovEffect > 0) {
      console.log("\n> ✅ **方向一致**：两模型上治理均正向（DeepSeek +" + dsGovEffect.toFixed(3) + ", Qwen +" + qwGovEffect.toFixed(3) + "）。");
    }
  }

  if (noneC && shuffleC) {
    const dsShuffleEffect = shuffleC.dsTau - noneC.dsTau;
    const qwShuffleEffect = shuffleC.qwTau - noneC.qwTau;
    console.log("\n| 模型 | none τ | shuffle τ | shuffle 效应 (shuffle-none) | 方向 |");
    console.log("|------|--------|-----------|----------------------------|------|");
    console.log("| DeepSeek | " + noneC.dsTau.toFixed(3) + " | " + shuffleC.dsTau.toFixed(3) + " | " + (dsShuffleEffect >= 0 ? "+" : "") + dsShuffleEffect.toFixed(3) + " | " + (dsShuffleEffect > 0 ? "✅ 正向" : "❌ 负向") + " |");
    console.log("| Qwen | " + noneC.qwTau.toFixed(3) + " | " + shuffleC.qwTau.toFixed(3) + " | " + (qwShuffleEffect >= 0 ? "+" : "") + qwShuffleEffect.toFixed(3) + " | " + (qwShuffleEffect > 0 ? "✅ 正向" : "❌ 负向") + " |");

    if (dsShuffleEffect > 0 && qwShuffleEffect > 0) {
      console.log("\n> ✅ **shuffle 效应跨模型方向一致**：两模型上 shuffle 均正向（DeepSeek +" + dsShuffleEffect.toFixed(3) + ", Qwen +" + qwShuffleEffect.toFixed(3) + "）。结构重排的普适性强于过程治理。");
    }
  }
}

// Crisis 治理效应配对检验
console.log("\n### Crisis 治理效应配对统计检验\n");
for (const ablation of crisisAblations) {
  const dsData = loadCrisisResults(DS_CRISIS_DIR, ablation);
  const qwData = loadCrisisResults(QW_CRISIS_DIR, ablation);
  if (dsData.length < 2 || qwData.length < 2) continue;

  const qwMap = new Map(qwData.map(r => [r.runIndex, r]));
  const paired = dsData
    .map(d => ({ d, q: qwMap.get(d.runIndex) }))
    .filter(pp => pp.q) as { d: CrisisResult; q: CrisisResult }[];

  if (paired.length < 2) continue;

  const diffs = paired.map(pp => pp.q.kendallTau - pp.d.kendallTau);
  const dz = cohensDz(diffs);
  const pVal = pairedPermutationTest(diffs);
  const ci = pairedCI(diffs);
  const deltaStr = (mean(diffs) >= 0 ? "+" : "") + mean(diffs).toFixed(3);
  console.log("- **" + ablation + " 组** (n=" + paired.length + " 配对): Δτ(Qwen-DeepSeek)=" + deltaStr + " ± " + sampleStd(diffs).toFixed(3) + ", d_z=" + dz.toFixed(3) + " (" + interpretD(dz) + "), p=" + pVal.toFixed(4) + ", 95%CI=[" + ci.lower.toFixed(3) + ", " + ci.upper.toFixed(3) + "]" + (pVal < 0.05 ? " ✅显著" : " ⚪不显著"));
}

console.log("\n" + "=".repeat(80));
console.log("Qwen 跨模型分析完成。");
