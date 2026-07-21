/**
 * 跨模型验证分析脚本
 * 对比 DeepSeek-V3 vs Zhipu glm-4-flash 在 ABCD 四组实验上的表现
 *
 * 数据覆盖诚实声明（截至 2026-07-19）：
 *   - DeepSeek-V3: A/B/C/D 四组各 n=10（完整）
 *   - Zhipu glm-4-flash: 仅 B(n=2) + C(n=10)，A/D 完全缺失
 * 因此 A/D 组只能做单模型描述，B 组配对检验 n=2 效力极低，
 * 只有 C 组的跨模型配对检验具有可解释的统计效力。
 *
 * 用法: npx tsx experiments/v2/analyze_cross_model.ts
 */

import * as fs from "fs";
import * as path from "path";
import { mulberry32, mean, sampleStd, cohensD, PERMUTATION_SEED } from "./statsShared";

interface ExperimentResult {
  runId: string;
  group: string;
  runIndex: number;
  kendallTau: number;
  totalUtterances: number;
  totalRounds: number;
  terminationReason: string;
  codeVersion?: string;
  thermoHistory?: any[];
}

function loadResults(dir: string, group: string): ExperimentResult[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter(f => {
      // A/B group: fraud_A_0.json, fraud_B_1.json
      // C/D group: fraud_C_content_driven_0.json, fraud_D_content_driven_0.json
      if (group === "A" || group === "B") {
        return f.startsWith(`fraud_${group}_`) && !f.includes("content_driven") && !f.includes("random_prob");
      }
      return f.startsWith(`fraud_${group}_`);
    })
    .sort();

  return files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as ExperimentResult);
}

function stats(vals: number[]) {
  const n = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const sorted = [...vals].sort((a, b) => a - b);
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  return { mean, std, median, min: sorted[0], max: sorted[n - 1], n };
}

function formatStats(s: ReturnType<typeof stats>, precision = 3): string {
  return `${s.mean.toFixed(precision)} ± ${s.std.toFixed(precision)} [${s.min}, ${s.max}] n=${s.n}`;
}

// ==========================================================================
// P0.2: 配对统计检验（跨模型同 runIndex 配对）
// ==========================================================================

/**
 * 按 runIndex 把两组实验配对。
 *
 * 跨模型实验设计：每个 runIndex 在 DeepSeek 和 Zhipu 上各跑一次，
 * 用相同的初始种子和任务设定。配对检验比对的是同 runIndex 的 τ 差异，
 * 消除任务难度方差，比独立检验统计效力更高。
 */
function pairByRunIndex(
  a: ExperimentResult[],
  b: ExperimentResult[]
): { a: ExperimentResult; b: ExperimentResult }[] {
  const bMap = new Map(b.map(r => [r.runIndex, r]));
  const pairs: { a: ExperimentResult; b: ExperimentResult }[] = [];
  for (const x of a) {
    const y = bMap.get(x.runIndex);
    if (y) pairs.push({ a: x, b: y });
  }
  return pairs;
}

/**
 * 配对置换检验（sign-flip，H0: 配对差异对称分布在 0 周围）。
 * 使用 (count+1)/(nPerm+1) 修正避免 p=0 假阳性。
 */
function pairedPermutationTest(diffs: number[], nPerm = 10000): number {
  if (diffs.length < 2) return 1;
  const obsMean = mean(diffs);
  const rng = mulberry32(PERMUTATION_SEED);  // H-Fix: 统一 seed
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

/**
 * Cohen's d_z（配对效应量）= mean(diffs) / sampleStd(diffs)。
 * 与 cohensD（独立样本 pooled std）不同，d_z 反映配对设计的方差缩减收益。
 */
function cohensDz(diffs: number[]): number {
  if (diffs.length < 2) return 0;
  const sd = sampleStd(diffs);
  return sd === 0 ? 0 : mean(diffs) / sd;
}

/**
 * 配对差异的 95% CI（t 分布，df = n-1）。
 */
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

// ==========================================================================
// Main
// ==========================================================================

const BASE = path.join(__dirname);
const DS_DIR = path.join(BASE, "data_fraud");
const ZP_DIR = path.join(BASE, "data_fraud_zhipu");

const GROUPS = ["A", "B", "C", "D"] as const;
const PROVIDERS = [
  { name: "DeepSeek-V3", dir: DS_DIR },
  { name: "Zhipu glm-4-flash", dir: ZP_DIR },
] as const;

console.log("=".repeat(80));
console.log("  跨模型验证分析：DeepSeek-V3 vs Zhipu glm-4-flash");
console.log("  欺诈调查任务 — ABCD 四组对比");
console.log("  ⚠️ 数据覆盖不完整：DeepSeek 有 ABCD 四组(n=10/组)；Zhipu 仅 B(n=2)+C(n=10)，A/D 缺失");
console.log("=".repeat(80));

// Phase 1: Per-group comparison
console.log("\n## 各组 τ 对比\n");

for (const group of GROUPS) {
  const results: { provider: string; data: ExperimentResult[] }[] = [];

  for (const p of PROVIDERS) {
    const data = loadResults(p.dir, group);
    if (data.length > 0) results.push({ provider: p.name, data });
  }

  if (results.length === 0) {
    console.log(`### ${group} 组: 无数据\n`);
    continue;
  }

  const taus = results.map(r => ({
    provider: r.provider,
    stats: stats(r.data.map(d => d.kendallTau)),
    uttStats: stats(r.data.map(d => d.totalUtterances)),
    tau1Count: r.data.filter(d => d.kendallTau === 1).length,
    tauGt08: r.data.filter(d => d.kendallTau >= 0.8).length,
    hardCap: r.data.filter(d => d.terminationReason.includes("hard_cap")).length,
    crystallized: r.data.filter(d => d.terminationReason.includes("crystallized") && !d.terminationReason.includes("strong")).length,
    strongCrystallized: r.data.filter(d => d.terminationReason.includes("strong")).length,
    n: r.data.length,
  }));

  console.log(`### ${group} 组 (content_driven 异步，热力学终止)`);
  console.log(`| 指标 | ${taus.map(t => t.provider).join(" | ")} | 差异 |`);
  console.log(`|------|${taus.map(() => "------").join("|")}|------|`);

  // τ
  const tauVals = taus.map(t => `τ=${formatStats(t.stats)}`);
  const deltaTau = taus.length === 2 ? (taus[1].stats.mean - taus[0].stats.mean).toFixed(3) : "N/A";
  const deltaPct = taus.length === 2 && taus[0].stats.mean !== 0
    ? ((taus[1].stats.mean / taus[0].stats.mean - 1) * 100).toFixed(1) + "%"
    : "N/A";
  console.log(`| **τ** | ${tauVals.join(" | ")} | Δ=${deltaTau} (${deltaPct}) |`);

  // τ=1.0 count
  console.log(`| τ=1.0 | ${taus.map(t => `${t.tau1Count}/${t.n}`).join(" | ")} | |`);

  // τ≥0.8 count
  console.log(`| τ≥0.8 | ${taus.map(t => `${t.tauGt08}/${t.n}`).join(" | ")} | |`);

  // Utterances
  console.log(`| 平均发言 | ${taus.map(t => formatStats(t.uttStats, 1)).join(" | ")} | |`);

  // Termination
  console.log(`| 硬截断 | ${taus.map(t => `${t.hardCap}/${t.n}`).join(" | ")} | |`);
  console.log(`| 结晶终止 | ${taus.map(t => `${t.crystallized}/${t.n}`).join(" | ")} | |`);
  console.log(`| 强结晶 | ${taus.map(t => `${t.strongCrystallized}/${t.n}`).join(" | ")} | |`);

  // Per-run detail
  if (results.length >= 2) {
    console.log(`\n<details><summary>逐次对比</summary>\n`);
    console.log(`| Run | ${taus.map(t => t.provider + " τ").join(" | ")} | Δτ |`);
    console.log(`|-----|${taus.map(() => "------").join("|")}|-----|`);
    const maxLen = Math.max(...results.map(r => r.data.length));
    for (let i = 0; i < maxLen; i++) {
      const row = results.map(r => r.data[i]?.kendallTau?.toFixed(3) ?? "N/A");
      const delta2 = results.length === 2 && results[0].data[i] && results[1].data[i]
        ? (results[1].data[i].kendallTau - results[0].data[i].kendallTau).toFixed(3)
        : "";
      console.log(`| ${i} | ${row.join(" | ")} | ${delta2} |`);
    }
    console.log(`\n</details>`);
  }

  // P0.2: 配对统计检验（按 runIndex 配对，Zhipu - DeepSeek）
  if (results.length === 2) {
    const pairs = pairByRunIndex(results[0].data, results[1].data);
    if (pairs.length >= 2) {
      const diffs = pairs.map(p => p.b.kendallTau - p.a.kendallTau);
      const dIndep = cohensD(
        results[0].data.map(d => d.kendallTau),
        results[1].data.map(d => d.kendallTau)
      );
      const dz = cohensDz(diffs);
      const p = pairedPermutationTest(diffs);
      const ci = pairedCI(diffs);
      console.log(`\n**配对统计检验** (n=${pairs.length} 配对，按 runIndex 匹配)`);
      console.log(`- Δτ (Zhipu - DeepSeek) = ${mean(diffs) >= 0 ? "+" : ""}${mean(diffs).toFixed(3)} ± ${sampleStd(diffs).toFixed(3)}`);
      console.log(`- Cohen's d_z (配对) = ${dz.toFixed(3)} (${interpretD(dz)})`);
      console.log(`- Cohen's d (独立, 参考) = ${dIndep.toFixed(3)} (${interpretD(dIndep)})`);
      console.log(`- 配对置换检验 p = ${p.toFixed(4)} (10000 次置换, sign-flip)`);
      console.log(`- 95% CI (t 分布) = [${ci.lower.toFixed(3)}, ${ci.upper.toFixed(3)}]`);
      if (p < 0.05) {
        const direction = mean(diffs) > 0 ? "Zhipu 显著优于 DeepSeek" : "DeepSeek 显著优于 Zhipu";
        console.log(`- ✅ ${direction} (p<0.05)`);
      } else {
        const direction = mean(diffs) > 0 ? "Zhipu 略高" : "DeepSeek 略高";
        console.log(`- ⚪ ${direction} 但未达显著 (p=${p.toFixed(4)}≥0.05)`);
      }
    } else {
      console.log(`\n**配对统计检验**: 配对数 ${pairs.length} < 2，跳过`);
    }
  }

  console.log("");
}

// Phase 2: ABCD ranking comparison
console.log("## ABCD 组内排序\n");
console.log("各组 τ 从高到低排列：\n");

for (const p of PROVIDERS) {
  const groupTaus: { group: string; tau: number; n: number }[] = [];
  for (const g of GROUPS) {
    const data = loadResults(p.dir, g);
    if (data.length > 0) {
      groupTaus.push({ group: g, tau: stats(data.map(d => d.kendallTau)).mean, n: data.length });
    }
  }
  if (groupTaus.length > 0) {
    groupTaus.sort((a, b) => b.tau - a.tau);
    console.log(`**${p.name}**: ${groupTaus.map(g => `${g.group}(τ=${g.tau.toFixed(3)}, n=${g.n})`).join(" > ")}`);
  }
}

// Phase 3: Key findings
console.log("\n## 关键发现\n");

// Check if Zhipu B exists for beliefShift paradox
const dsB = loadResults(DS_DIR, "B");
const zpB = loadResults(ZP_DIR, "B");
if (zpB.length > 0 && dsB.length > 0) {
  const zpBTau = stats(zpB.map(d => d.kendallTau));
  const dsBTau = stats(dsB.map(d => d.kendallTau));
  console.log(`### BeliefShift 悖论跨模型验证`);
  console.log(`- DeepSeek B 组: τ=${dsBTau.mean.toFixed(3)} ± ${dsBTau.std.toFixed(3)} (beliefShift 导致固定轮次下性能下降)`);
  console.log(`- Zhipu B 组: τ=${zpBTau.mean.toFixed(3)} ± ${zpBTau.std.toFixed(3)}`);
  // P0.2: 用配对检验替代仅看均值的过强声称
  const bPairs = pairByRunIndex(dsB, zpB);
  if (bPairs.length >= 2) {
    const bDiffs = bPairs.map(p => p.b.kendallTau - p.a.kendallTau);
    const bDz = cohensDz(bDiffs);
    const bP = pairedPermutationTest(bDiffs);
    const bCi = pairedCI(bDiffs);
    console.log(`- 配对检验 (n=${bPairs.length}): Δτ=${mean(bDiffs) >= 0 ? "+" : ""}${mean(bDiffs).toFixed(3)}, d_z=${bDz.toFixed(3)}, p=${bP.toFixed(4)}, 95%CI=[${bCi.lower.toFixed(3)}, ${bCi.upper.toFixed(3)}]`);
    if (zpBTau.mean < 0.6) {
      console.log(`- ✅ **方向支持**: 两模型 B 组 τ 均低于 0.6，beliefShift 悖论方向在 Zhipu 上同样出现`);
      if (bP < 0.05) {
        console.log(`- ✅ 统计显著: 跨模型 B 组 τ 差异达 p<0.05`);
      } else {
        console.log(`- ⚠️ 统计未达显著 (p=${bP.toFixed(4)}≥0.05): 样本量小，普适性结论需更多数据`);
      }
    } else {
      console.log(`- ⚠️ **存疑**: Zhipu B 组均值 ≥ 0.6，beliefShift 悖论可能模型特异`);
    }
  } else {
    console.log(`- ⚠️ 配对数 ${bPairs.length} < 2，无法做配对检验，仅看均值方向`);
  }
}

// A group comparison
const dsA = loadResults(DS_DIR, "A");
const zpA = loadResults(ZP_DIR, "A");
if (zpA.length > 0 && dsA.length > 0) {
  const zpATau = stats(zpA.map(d => d.kendallTau));
  const dsATau = stats(dsA.map(d => d.kendallTau));
  console.log(`\n### 自发发言 (A 组) 跨模型验证`);
  console.log(`- DeepSeek A 组: τ=${dsATau.mean.toFixed(3)} ± ${dsATau.std.toFixed(3)}`);
  console.log(`- Zhipu A 组: τ=${zpATau.mean.toFixed(3)} ± ${zpATau.std.toFixed(3)}`);
  // P0.2: 同样补配对检验
  const aPairs = pairByRunIndex(dsA, zpA);
  if (aPairs.length >= 2) {
    const aDiffs = aPairs.map(p => p.b.kendallTau - p.a.kendallTau);
    const aDz = cohensDz(aDiffs);
    const aP = pairedPermutationTest(aDiffs);
    const aCi = pairedCI(aDiffs);
    console.log(`- 配对检验 (n=${aPairs.length}): Δτ=${mean(aDiffs) >= 0 ? "+" : ""}${mean(aDiffs).toFixed(3)}, d_z=${aDz.toFixed(3)}, p=${aP.toFixed(4)}, 95%CI=[${aCi.lower.toFixed(3)}, ${aCi.upper.toFixed(3)}]`);
    if (aP < 0.05) {
      console.log(`- ✅ 统计显著: ${zpATau.mean > dsATau.mean ? "Zhipu" : "DeepSeek"} A 组显著更优 (p<0.05)`);
    } else {
      console.log(`- ⚪ 未达显著 (p=${aP.toFixed(4)}≥0.05)，仅方向${zpATau.mean > dsATau.mean ? "Zhipu 略高" : "DeepSeek 略高"}`);
    }
  }
}

// Overall cross-model conclusion
const allDS = GROUPS.flatMap(g => loadResults(DS_DIR, g));
const allZP = GROUPS.flatMap(g => loadResults(ZP_DIR, g));
if (allDS.length > 0 && allZP.length > 0) {
  const dsOverall = stats(allDS.map(d => d.kendallTau));
  const zpOverall = stats(allZP.map(d => d.kendallTau));
  console.log(`\n### 整体跨模型对比`);
  console.log(`- DeepSeek-V3 全部实验: ${formatStats(dsOverall)}`);
  console.log(`- Zhipu glm-4-flash 全部实验: ${formatStats(zpOverall)}`);
  // P0.2: 整体配对（按 group+runIndex 复合键匹配）
  const dsByKey = new Map(allDS.map(r => [`${r.group}#${r.runIndex}`, r]));
  const allPairs = allZP
    .map(z => ({ z, d: dsByKey.get(`${z.group}#${z.runIndex}`) }))
    .filter(p => p.d) as { d: ExperimentResult; z: ExperimentResult }[];
  if (allPairs.length >= 2) {
    const allDiffs = allPairs.map(p => p.z.kendallTau - p.d.kendallTau);
    const allDz = cohensDz(allDiffs);
    const allP = pairedPermutationTest(allDiffs);
    const allCi = pairedCI(allDiffs);
    console.log(`- 配对检验 (n=${allPairs.length}, 按 group+runIndex 匹配): Δτ=${mean(allDiffs) >= 0 ? "+" : ""}${mean(allDiffs).toFixed(3)}, d_z=${allDz.toFixed(3)}, p=${allP.toFixed(4)}, 95%CI=[${allCi.lower.toFixed(3)}, ${allCi.upper.toFixed(3)}]`);
  }
  console.log(`- 模型排名一致性: 待人工判断`);
}

console.log("\n" + "=".repeat(80));
console.log("分析完成。");
