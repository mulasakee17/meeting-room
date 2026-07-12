/**
 * 方向A快速分析：baseline 能否自我修正偏差？
 *
 * 核心问题：无干预的多agent系统，τ轨迹是自然上升（自我修正）
 *          还是停滞/下降（偏差自我强化）？
 *
 * 分析现有 data_invest/invest_none_*.json 数据
 */
import * as fs from "fs";
import * as path from "path";

interface ExperimentResult {
  runId: string;
  ablation: string;
  kendallTau: number;
  decisionQuality: number;
  tauTrajectory?: number[];
  totalRounds: number;
  converged: boolean;
  rounds: Array<{
    roundNumber: number;
    beliefs: Record<string, number>;
    confidences: Record<string, number>;
    converged: boolean;
  }>;
}

const DATA_DIR = path.resolve(__dirname, "data_invest");

function loadGroup(prefix: string): ExperimentResult[] {
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith(`${prefix}_`) && f.endsWith(".json") && f !== "summary.json");
  return files.map(f => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf-8")));
}

function mean(v: number[]) { return v.reduce((a, b) => a + b, 0) / v.length; }
function stdDev(v: number[]) {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

function fmt(v: number, digits = 3) {
  return (v >= 0 ? "+" : "") + v.toFixed(digits);
}

// ============================================================================
// 分析 1: Baseline τ 轨迹形态
// ============================================================================
function analyzeTrajectory(label: string, results: ExperimentResult[]) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`  ${label}  (n=${results.length})`);
  console.log("=".repeat(80));

  // 按轮次聚合 τ
  const maxRounds = Math.max(...results.map(r => r.tauTrajectory?.length || 0));
  console.log("\n  τ 按轮次分布:");
  console.log("  Round | τ μ±σ          | min      | max      | 上升次数 | 下降次数 | 持平次数");
  console.log("  ------|----------------|----------|----------|----------|----------|----------");

  for (let round = 0; round < maxRounds; round++) {
    const taus = results
      .map(r => r.tauTrajectory?.[round])
      .filter((v): v is number => v !== undefined);

    if (taus.length === 0) continue;

    // 计算从上一轮到本轮的变化
    let up = 0, down = 0, flat = 0;
    if (round > 0) {
      for (const r of results) {
        const prev = r.tauTrajectory?.[round - 1];
        const curr = r.tauTrajectory?.[round];
        if (prev !== undefined && curr !== undefined) {
          const delta = curr - prev;
          if (delta > 0.05) up++;
          else if (delta < -0.05) down++;
          else flat++;
        }
      }
    } else {
      flat = taus.length;
    }

    console.log(
      `  ${String(round + 1).padStart(5)} | ${mean(taus).toFixed(3)}±${stdDev(taus).toFixed(3).padStart(5)} | ${Math.min(...taus).toFixed(3).padStart(8)} | ${Math.max(...taus).toFixed(3).padStart(8)} | ${String(up).padStart(8)} | ${String(down).padStart(8)} | ${String(flat).padStart(8)}`
    );
  }

  // 总体 Δτ
  const deltas = results
    .map(r => {
      if (!r.tauTrajectory || r.tauTrajectory.length < 2) return undefined;
      return r.tauTrajectory[r.tauTrajectory.length - 1] - r.tauTrajectory[0];
    })
    .filter((v): v is number => v !== undefined);

  if (deltas.length > 0) {
    console.log(`\n  总体 Δτ (final - initial): ${fmt(mean(deltas))}±${stdDev(deltas).toFixed(3)}`);
    const improved = deltas.filter(d => d > 0.05).length;
    const declined = deltas.filter(d => d < -0.05).length;
    const stable = deltas.length - improved - declined;
    console.log(`  改善 (Δτ>+0.05): ${improved}/${deltas.length} (${(improved / deltas.length * 100).toFixed(0)}%)`);
    console.log(`  退化 (Δτ<-0.05): ${declined}/${deltas.length} (${(declined / deltas.length * 100).toFixed(0)}%)`);
    console.log(`  持平:             ${stable}/${deltas.length} (${(stable / deltas.length * 100).toFixed(0)}%)`);
  }

  // 最终 τ 分布
  const finalTaus = results.map(r => r.kendallTau);
  console.log(`\n  最终 τ 分布: μ=${mean(finalTaus).toFixed(3)}±${stdDev(finalTaus).toFixed(3)}`);
  console.log(`    高质量 (τ>0.7):   ${finalTaus.filter(t => t > 0.7).length}/${finalTaus.length}`);
  console.log(`    中等 (0.3<τ≤0.7): ${finalTaus.filter(t => t > 0.3 && t <= 0.7).length}/${finalTaus.length}`);
  console.log(`    低质量 (τ≤0.3):   ${finalTaus.filter(t => t <= 0.3).length}/${finalTaus.length}`);
}

// ============================================================================
// 分析 2: 早期 vs 晚期的改善速率
// ============================================================================
function analyzeImprovementRate(label: string, results: ExperimentResult[]) {
  console.log(`\n  --- ${label}: 改善速率分析 ---`);

  // 前半段 (round 0→2) vs 后半段 (round 2→4)
  const earlyDeltas: number[] = [];
  const lateDeltas: number[] = [];

  for (const r of results) {
    if (!r.tauTrajectory || r.tauTrajectory.length < 5) continue;
    earlyDeltas.push(r.tauTrajectory[2] - r.tauTrajectory[0]);
    lateDeltas.push(r.tauTrajectory[4] - r.tauTrajectory[2]);
  }

  if (earlyDeltas.length === 0) {
    console.log("  (数据不足)");
    return;
  }

  console.log(`  早期 (R1→R3): Δτ = ${fmt(mean(earlyDeltas))}±${stdDev(earlyDeltas).toFixed(3)}`);
  console.log(`  晚期 (R3→R5): Δτ = ${fmt(mean(lateDeltas))}±${stdDev(lateDeltas).toFixed(3)}`);
  console.log(`  早期改善 / 晚期改善 = ${(mean(earlyDeltas) / (mean(lateDeltas) || 0.001)).toFixed(2)}x`);

  if (Math.abs(mean(earlyDeltas)) > Math.abs(mean(lateDeltas)) * 2) {
    console.log(`  → 改善主要发生在早期 (边际递减)`);
  } else if (Math.abs(mean(lateDeltas)) > Math.abs(mean(earlyDeltas)) * 2) {
    console.log(`  → 改善主要发生在晚期 (需要时间消化信息)`);
  } else {
    console.log(`  → 改善速率均匀分布`);
  }
}

// ============================================================================
// 分析 3: Baseline vs Full 的 τ 轨迹对比
// ============================================================================
function compareTrajectories(none: ExperimentResult[], full: ExperimentResult[]) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`  Baseline vs Full — τ 轨迹对比`);
  console.log("=".repeat(80));

  console.log("\n  Round | Baseline μ±σ         | Full μ±σ             | Full - None");
  console.log("  ------|----------------------|----------------------|-------------");

  const maxRounds = Math.max(
    ...none.map(r => r.tauTrajectory?.length || 0),
    ...full.map(r => r.tauTrajectory?.length || 0)
  );

  for (let round = 0; round < maxRounds; round++) {
    const noneTaus = none.map(r => r.tauTrajectory?.[round]).filter((v): v is number => v !== undefined);
    const fullTaus = full.map(r => r.tauTrajectory?.[round]).filter((v): v is number => v !== undefined);

    if (noneTaus.length === 0 || fullTaus.length === 0) continue;

    const diff = mean(fullTaus) - mean(noneTaus);
    console.log(
      `  ${String(round + 1).padStart(5)} | ${mean(noneTaus).toFixed(3)}±${stdDev(noneTaus).toFixed(3).padStart(5)} (${noneTaus.length})    | ${mean(fullTaus).toFixed(3)}±${stdDev(fullTaus).toFixed(3).padStart(5)} (${fullTaus.length})    | ${fmt(diff)}`
    );
  }

  // 关键问题：baseline 是否已经达到高位？
  const noneFinal = none.map(r => r.kendallTau);
  const fullFinal = full.map(r => r.kendallTau);

  console.log(`\n  最终 τ:`);
  console.log(`    Baseline: ${mean(noneFinal).toFixed(3)}±${stdDev(noneFinal).toFixed(3)}`);
  console.log(`    Full:     ${mean(fullFinal).toFixed(3)}±${stdDev(fullFinal).toFixed(3)}`);

  const baselineHighQuality = noneFinal.filter(t => t > 0.7).length / noneFinal.length;
  console.log(`\n  Baseline 高质量率 (τ>0.7): ${(baselineHighQuality * 100).toFixed(0)}%`);

  if (baselineHighQuality > 0.6) {
    console.log(`  ⚠ Baseline 已有 ${(baselineHighQuality * 100).toFixed(0)}% 达到高质量`);
    console.log(`    → 治理系统的"上限"被自然收敛压缩了`);
    console.log(`    → 这解释了为什么 p 值不显著：天花板效应`);
  } else if (mean(noneFinal) < 0.3) {
    console.log(`  ✓ Baseline 平均 τ < 0.3，无法自我修正`);
    console.log(`    → 治理系统的必要性得到支持`);
  } else {
    console.log(`  → Baseline 处于中等水平，治理有边际改善空间`);
  }
}

// ============================================================================
// 分析 4: 收敛模式
// ============================================================================
function analyzeConvergence(label: string, results: ExperimentResult[]) {
  console.log(`\n  --- ${label}: 收敛模式 ---`);
  const converged = results.filter(r => r.converged).length;
  console.log(`  最终收敛: ${converged}/${results.length}`);

  // 每轮的 belief 多样性（std）
  console.log(`  每轮 belief std (群体分歧度):`);
  for (let round = 1; round <= 5; round++) {
    const stds = results
      .map(r => r.rounds.find(rd => rd.roundNumber === round))
      .filter(r => r !== undefined)
      .map(r => {
        const beliefs = Object.values(r!.beliefs);
        return stdDev(beliefs);
      });
    if (stds.length > 0) {
      console.log(`    R${round}: ${mean(stds).toFixed(3)}±${stdDev(stds).toFixed(3)}`);
    }
  }
}

// ============================================================================
// 主程序
// ============================================================================
console.log("═".repeat(80));
console.log("  SwarmAlpha 方向A 快速分析: Baseline 能否自我修正偏差？");
console.log("═".repeat(80));

const noneResults = loadGroup("invest_none");
const fullResults = loadGroup("invest_full");

console.log(`\n  数据: ${noneResults.length} baseline + ${fullResults.length} full`);

if (noneResults.length === 0) {
  console.log("  ❌ 无 baseline 数据");
  process.exit(1);
}

analyzeTrajectory("BASELINE (none — 无干预)", noneResults);
analyzeImprovementRate("Baseline", noneResults);
analyzeConvergence("Baseline", noneResults);

if (fullResults.length > 0) {
  analyzeTrajectory("FULL (全治理干预)", fullResults);
  analyzeImprovementRate("Full", fullResults);
  compareTrajectories(noneResults, fullResults);
}

// ============================================================================
// 结论
// ============================================================================
console.log(`\n${"═".repeat(80)}`);
console.log("  结论判断");
console.log("═".repeat(80));

const noneFinal = noneResults.map(r => r.kendallTau);
const noneInitial = noneResults.map(r => r.tauTrajectory?.[0] || 0);
const baselineDelta = mean(noneFinal) - mean(noneInitial);

console.log(`\n  Baseline 初始 τ: ${fmt(mean(noneInitial))}`);
console.log(`  Baseline 最终 τ: ${fmt(mean(noneFinal))}`);
console.log(`  Baseline Δτ:     ${fmt(baselineDelta)}`);

if (mean(noneFinal) > 0.7) {
  console.log(`\n  → Baseline 已自然达到高质量 (τ>0.7)`);
  console.log(`    治理系统的价值不在"能否达成共识"，而在"如何达成"`);
  console.log(`    建议研究转向: 治理对决策过程质量的影响，而非最终结果质量`);
} else if (baselineDelta > 0.3) {
  console.log(`\n  → Baseline 能自我修正 (Δτ>+0.3)`);
  console.log(`    治理的价值是"加速"而非"改变方向"`);
} else if (baselineDelta < 0) {
  console.log(`\n  → Baseline 无法自我修正，甚至退化 (Δτ<0)`);
  console.log(`    ✓ 治理系统的必要性得到支持`);
} else {
  console.log(`\n  → Baseline 改善有限 (0 ≤ Δτ ≤ 0.3)`);
  console.log(`    治理系统有明确的改善空间`);
}
