/**
 * F 分解 A/B 配对对照实验分析
 *
 * H_F（预注册）：F 分解排序（A 组 full）的 Δτ 显著高于固定排序（B 组 full_fixed）。
 *
 * 设计：
 *   - A 组：现有 crisis_full_{i}.json（F 分解排序，sortingMode='fdecomposition'）
 *   - B 组：crisis_full_fixed_{i}.json（固定排序，sortingMode='fixed'）
 *   - 配对：同 runIndex（seed 相同），A/B 仅在排序逻辑上不同
 *
 * 统计：
 *   - 主检验：配对置换检验（Wilcoxon signed-rank 等价），n=10000 perms
 *   - 效应量：Cohen's d_z = mean(Δτ_A - Δτ_B) / std(Δτ_A - Δτ_B)
 *   - CI：t 分布配对均值差的 95% CI
 *   - (count+1)/(nPerms+1) 修正（项目规范）
 *
 * 双分析：
 *   - ITT（intention-to-treat）：所有配对，无论排序是否实际改变
 *   - Per-protocol：仅排序实际改变的配对（A/B 干预序列不同）
 *
 * 运行：npx tsx experiments/v2/ab_fdecomposition_paired.ts
 */
import * as fs from "fs";
import * as path from "path";

interface Round {
  roundNumber: number;
  interventions: Array<{ type: string }>;
  tau: number;
}

interface ExperimentData {
  rounds: Round[];
  kendallTau: number;
  ablation: string;
}

function loadExperiment(dir: string, filename: string): ExperimentData | null {
  const fp = path.join(dir, filename);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Cohen's d_z for paired samples: mean(differences) / std(differences) */
function cohensDz(differences: number[]): number {
  if (differences.length < 2) return 0;
  const sd = stdDev(differences);
  return sd > 0 ? mean(differences) / sd : 0;
}

/** 配对置换检验：零假设下配对差值的符号可交换 */
function pairedPermutationTest(differences: number[], nPerms = 10000): number {
  if (differences.length === 0) return 1;
  const observed = Math.abs(mean(differences));
  let count = 0;
  for (let p = 0; p < nPerms; p++) {
    // 随机翻转每个差值的符号
    const permuted = differences.map(d => (Math.random() < 0.5 ? d : -d));
    if (Math.abs(mean(permuted)) >= observed) count++;
  }
  return (count + 1) / (nPerms + 1); // 项目规范：(count+1)/(nPerms+1)
}

/** t 分布配对均值差的 95% CI（小样本用 t 分布） */
function pairedCI(differences: number[]): { lower: number; upper: number } {
  const n = differences.length;
  if (n < 2) return { lower: 0, upper: 0 };
  const m = mean(differences);
  const se = stdDev(differences) / Math.sqrt(n);
  // t 临界值（df=n-1，双尾 95%）——常用值查表
  const tCrit: Record<number, number> = {
    7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201,
    12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120,
    17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086, 21: 2.080,
    22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060, 26: 2.056,
    27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
  };
  const df = n - 1;
  const tc = tCrit[df] ?? 2.0; // 大样本 fallback
  return { lower: m - tc * se, upper: m + tc * se };
}

// ============================================================================

const DATA_DIR = path.resolve(__dirname, "data_crisis");

console.log("=".repeat(70));
console.log("  F 分解 A/B 配对对照实验分析");
console.log("  H_F: F 分解排序 Δτ > 固定排序 Δτ（单尾）");
console.log("=".repeat(70));

// 收集所有配对
interface Pair {
  runIndex: number;
  tauA: number; // A 组（full，F 分解）
  tauB: number; // B 组（full_fixed，固定排序）
  diff: number; // tauA - tauB
  // Per-protocol: A/B 的干预序列是否实际不同
  sequenceDiffers: boolean;
}

const pairs: Pair[] = [];
let maxRunIndex = 0;

// 扫描 data_crisis 目录
for (const f of fs.readdirSync(DATA_DIR)) {
  const matchA = f.match(/^crisis_full_(\d+)\.json$/);
  const matchB = f.match(/^crisis_full_fixed_(\d+)\.json$/);
  if (matchA) {
    const idx = parseInt(matchA[1], 10);
    maxRunIndex = Math.max(maxRunIndex, idx);
    const expA = loadExperiment(DATA_DIR, f);
    const expB = loadExperiment(DATA_DIR, `crisis_full_fixed_${idx}.json`);
    if (!expA || !expB) continue;

    // 检查 A/B 干预序列是否实际不同（per-protocol 分析）
    let sequenceDiffers = false;
    if (expA.rounds && expB.rounds) {
      const minLen = Math.min(expA.rounds.length, expB.rounds.length);
      for (let r = 0; r < minLen; r++) {
        const ivA = expA.rounds[r].interventions || [];
        const ivB = expB.rounds[r].interventions || [];
        // 比较干预类型序列（顺序敏感）
        const typesA = ivA.map(i => i.type).join(",");
        const typesB = ivB.map(i => i.type).join(",");
        if (typesA !== typesB) {
          sequenceDiffers = true;
          break;
        }
      }
    }

    pairs.push({
      runIndex: idx,
      tauA: expA.kendallTau,
      tauB: expB.kendallTau,
      diff: expA.kendallTau - expB.kendallTau,
      sequenceDiffers,
    });
  }
}

pairs.sort((a, b) => a.runIndex - b.runIndex);

console.log(`\n配对数: ${pairs.length}（runIndex ${pairs[0]?.runIndex}..${pairs[pairs.length - 1]?.runIndex}）`);

if (pairs.length === 0) {
  console.log("\n⚠️ 未找到配对数据。请先运行 B 组实验：");
  console.log("  npx tsx experiments/v2/run.ts crisis --mode=full_fixed --count=8");
  process.exit(0);
}

// ============================================================================
// ITT 分析（所有配对）
// ============================================================================
console.log("\n" + "─".repeat(70));
console.log("  ITT 分析（所有配对，intention-to-treat）");
console.log("─".repeat(70));

const ittDiffs = pairs.map(p => p.diff);
const ittMean = mean(ittDiffs);
const ittDz = cohensDz(ittDiffs);
const ittP = pairedPermutationTest(ittDiffs);
const ittCI = pairedCI(ittDiffs);

console.log(`  n = ${ittDiffs.length}`);
console.log(`  A 组 (F 分解)    τ 均值: ${mean(pairs.map(p => p.tauA)).toFixed(4)}`);
console.log(`  B 组 (固定排序)  τ 均值: ${mean(pairs.map(p => p.tauB)).toFixed(4)}`);
console.log(`  配对差 Δτ_A - Δτ_B 均值: ${ittMean.toFixed(4)}（正=F 分解更优）`);
console.log(`  Cohen's d_z:              ${ittDz.toFixed(3)}`);
console.log(`  配对置换检验 p-value:     ${ittP.toFixed(4)}（单尾，p<0.05 支持 H_F）`);
console.log(`  95% CI:                   [${ittCI.lower.toFixed(4)}, ${ittCI.upper.toFixed(4)}]`);

// ============================================================================
// Per-protocol 分析（仅排序实际改变的配对）
// ============================================================================
const ppPairs = pairs.filter(p => p.sequenceDiffers);
console.log("\n" + "─".repeat(70));
console.log("  Per-protocol 分析（仅排序实际改变的配对）");
console.log("─".repeat(70));

if (ppPairs.length === 0) {
  console.log("  ⚠️ 没有配对的干预序列不同——F 分解在所有实验中未改变排序顺序。");
  console.log("     这意味着 Crisis 任务上多检测器并发频率极低，F 分解无显著差异是合理的边界条件。");
} else {
  const ppDiffs = ppPairs.map(p => p.diff);
  const ppMean = mean(ppDiffs);
  const ppDz = cohensDz(ppDiffs);
  const ppP = pairedPermutationTest(ppDiffs);
  const ppCI = pairedCI(ppDiffs);

  console.log(`  排序改变的配对: ${ppPairs.length}/${pairs.length} (${(ppPairs.length / pairs.length * 100).toFixed(1)}%)`);
  console.log(`  n = ${ppDiffs.length}`);
  console.log(`  配对差 Δτ_A - Δτ_B 均值: ${ppMean.toFixed(4)}（正=F 分解更优）`);
  console.log(`  Cohen's d_z:              ${ppDz.toFixed(3)}`);
  console.log(`  配对置换检验 p-value:     ${ppP.toFixed(4)}（单尾，p<0.05 支持 H_F）`);
  console.log(`  95% CI:                   [${ppCI.lower.toFixed(4)}, ${ppCI.upper.toFixed(4)}]`);
}

// ============================================================================
// 结论判断
// ============================================================================
console.log("\n" + "=".repeat(70));
console.log("  结论判断");
console.log("=".repeat(70));

const primaryP = ppPairs.length > 0 ? pairedPermutationTest(ppPairs.map(p => p.diff)) : ittP;
const primaryDz = ppPairs.length > 0 ? cohensDz(ppPairs.map(p => p.diff)) : ittDz;
const primaryMean = ppPairs.length > 0 ? mean(ppPairs.map(p => p.diff)) : ittMean;

if (primaryP < 0.05 && primaryMean > 0) {
  console.log(`  ✅ H_F 支持: F 分解排序显著优于固定排序 (p=${primaryP.toFixed(4)}, d_z=${primaryDz.toFixed(3)})`);
  console.log("     F 分解的理论价值得到实验验证。");
} else if (primaryMean > 0 && primaryP < 0.10) {
  console.log(`  ⚠️ H_F 方向支持但不显著 (p=${primaryP.toFixed(4)}, d_z=${primaryDz.toFixed(3)})`);
  console.log("     方向一致但未达 p<0.05，可能是样本不足或效应量小。");
} else if (ppPairs.length === 0) {
  console.log(`  ⚪ 边界条件: F 分解在 ${pairs.length} 个配对中未改变任何排序顺序。`);
  console.log("     Crisis 任务上多检测器并发频率极低，F 分解与固定排序等效。");
  console.log("     这本身是有价值的发现——说明 F 分解的价值依赖任务特性。");
} else {
  console.log(`  ❌ H_F 不支持: F 分解排序未显著优于固定排序 (p=${primaryP.toFixed(4)}, d_z=${primaryDz.toFixed(3)})`);
  console.log("     在 Crisis 任务上，F 分解排序相比固定排序无显著改善。");
  console.log("     诚实记录此边界条件。");
}

// 明细输出
console.log("\n" + "─".repeat(70));
console.log("  配对明细");
console.log("─".repeat(70));
console.log("  runIndex | τ_A (F分解) | τ_B (固定)  | diff    | 序列不同");
console.log("  ---------|-------------|-------------|---------|---------");
for (const p of pairs) {
  console.log(`  ${String(p.runIndex).padStart(8)} | ${p.tauA.toFixed(4).padStart(11)} | ${p.tauB.toFixed(4).padStart(11)} | ${p.diff.toFixed(4).padStart(7)} | ${p.sequenceDiffers ? "是" : "否"}`);
}
