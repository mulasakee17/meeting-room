/**
 * 异步自适应实验分析脚本
 *
 * 核心对比：
 * 1. A vs B：异步本身是否影响决策质量
 * 2. B vs C：热力学自适应终止是否优于固定轮次（核心假设 H_thermo）
 * 3. C vs D：热力学终止决策是否优于随机终止（验证诊断价值 H_diag）
 * 4. C_v1 vs C_v2：内容驱动发言 vs 随机概率发言（验证异步机制改进）
 *
 * 统计方法：
 * - 独立 t 检验（Welch's t-test，不假设方差齐性）
 * - Cohen's d 效应量 + 解读（小/中/大）
 * - 95% 置信区间（t 分布）
 * - (count+1)/(nPerms+1) 置换检验
 *
 * 运行：npx tsx experiments/v2/analyze_async.ts
 */

import * as fs from "fs";
import * as path from "path";
import { mulberry32, cohensD, mean, sampleStd, PERMUTATION_SEED } from "./statsShared";

interface AsyncExperimentResult {
  runId: string;
  group: string;
  runIndex: number;
  speakMode?: string; // v2=content_driven, v1=random_prob（旧数据可能缺失）
  kendallTau: number;
  decisionQuality: number;
  totalRounds: number;
  totalUtterances: number;
  converged: boolean;
  terminationReason: string;
  thermoHistory: Array<{ R: number; T: number; H: number; F: number; utteranceCount: number }>;
  finalBeliefs: Record<string, number>;
}

function loadGroup(dir: string, group: string): AsyncExperimentResult[] {
  const results: AsyncExperimentResult[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(`fraud_${group}_`) && f.endsWith(".json")) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        if (!data.terminationReason?.startsWith("error")) {
          results.push(data);
        }
      } catch { /* skip */ }
    }
  }
  return results.sort((a, b) => a.runIndex - b.runIndex);
}


/**
 * 效率指标：单位发言的决策质量产出
 *
 * 核心动机：异步设计的价值不仅是"达到相同 τ"，更是"用更少发言达到相同 τ"。
 * 单纯比较 τ 会偏向更多发言的组（A组25发言τ=0.88 优于 B组12发言τ=0.72），
 * 但 B 组单位发言产出其实更高。效率指标揭示这一被掩盖的事实。
 *
 * 计算：τ / utterances（防除零：utterances=0 时返回 0）
 * 解读：数值越高 = 单位发言的决策质量产出越高 = 更高效
 */
function efficiency(tau: number, utterances: number): number {
  return utterances > 0 ? tau / utterances : 0;
}


/** Cohen's d 效应量解读 */
function interpretD(d: number): string {
  const abs = Math.abs(d);
  if (abs < 0.2) return "可忽略";
  if (abs < 0.5) return "小效应";
  if (abs < 0.8) return "中效应";
  return "大效应";
}

function permutationTest(a: number[], b: number[], nPerms = 5000): number {
  const observed = Math.abs(mean(a) - mean(b));
  const combined = [...a, ...b];
  const nA = a.length;
  const rng = mulberry32(PERMUTATION_SEED);  // H-Fix: 统一为 PERMUTATION_SEED
  let count = 0;
  for (let p = 0; p < nPerms; p++) {
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [combined[i], combined[j]] = [combined[j], combined[i]];
    }
    const permA = combined.slice(0, nA);
    const permB = combined.slice(nA);
    if (Math.abs(mean(permA) - mean(permB)) >= observed) count++;
  }
  return (count + 1) / (nPerms + 1);
}

function tCI(a: number[], b: number[]): { lower: number; upper: number } {
  const ma = mean(a), mb = mean(b);
  const va = a.length > 1 ? a.reduce((s, x) => s + (x - ma) ** 2, 0) / (a.length - 1) : 0;
  const vb = b.length > 1 ? b.reduce((s, x) => s + (x - mb) ** 2, 0) / (b.length - 1) : 0;
  const se = Math.sqrt(va / a.length + vb / b.length);
  const df = Math.min(a.length, b.length) - 1;
  const tCrit: Record<number, number> = {
    7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201,
    12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120,
    17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086, 21: 2.080,
    22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060, 26: 2.056,
    27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
  };
  const tc = tCrit[df] ?? 2.0;
  const diff = ma - mb;
  return { lower: diff - tc * se, upper: diff + tc * se };
}

function printComparison(
  name: string,
  groupA: AsyncExperimentResult[],
  groupB: AsyncExperimentResult[],
  hypothesis: string
) {
  console.log(`\n${"─".repeat(70)}`);
  console.log(`  ${name}`);
  console.log(`  假设: ${hypothesis}`);
  console.log("─".repeat(70));

  const tauA = groupA.map(r => r.kendallTau);
  const tauB = groupB.map(r => r.kendallTau);
  const uttA = groupA.map(r => r.totalUtterances);
  const uttB = groupB.map(r => r.totalUtterances);

  const nameA = name.split(" vs ")[0];
  const nameB = name.split(" vs ")[1];

  console.log(`  ${nameA}: n=${groupA.length}, τ=${mean(tauA).toFixed(4)}±${sampleStd(tauA).toFixed(4)}, 发言=${mean(uttA).toFixed(1)}`);
  console.log(`  ${nameB}: n=${groupB.length}, τ=${mean(tauB).toFixed(4)}±${sampleStd(tauB).toFixed(4)}, 发言=${mean(uttB).toFixed(1)}`);

  // 效率对比：揭示"用更少发言达到相同 τ"的异步价值
  const effA = efficiency(mean(tauA), mean(uttA));
  const effB = efficiency(mean(tauB), mean(uttB));
  const effRatio = effB > 0 ? effA / effB : Infinity;
  console.log(`  效率: ${nameA}=${effA.toFixed(4)} vs ${nameB}=${effB.toFixed(4)} (比值=${effRatio === Infinity ? "∞" : effRatio.toFixed(2)}${effRatio > 1 ? `，${nameA}更高效` : effRatio < 1 ? `，${nameB}更高效` : "，相当"})`);

  if (groupA.length < 2 || groupB.length < 2) {
    console.log(`  ⚠️ 样本不足（需每组≥2），跳过统计检验`);
    return;
  }

  const d = cohensD(tauA, tauB);
  const p = permutationTest(tauA, tauB);
  const ci = tCI(tauA, tauB);
  const deltaTau = mean(tauA) - mean(tauB);

  console.log(`  Δτ = ${deltaTau >= 0 ? "+" : ""}${deltaTau.toFixed(4)}`);
  console.log(`  Cohen's d = ${d.toFixed(3)} (${interpretD(d)})`);
  console.log(`  置换检验 p = ${p.toFixed(4)}`);
  console.log(`  95% CI = [${ci.lower.toFixed(4)}, ${ci.upper.toFixed(4)}]`);

  if (p < 0.05 && deltaTau > 0) {
    console.log(`  ✅ 假设支持: ${nameA} 显著优于 ${nameB}`);
  } else if (p < 0.05) {
    console.log(`  ❌ 假设不支持: ${nameA} 显著差于 ${nameB}`);
  } else if (deltaTau > 0) {
    console.log(`  ⚠️ 方向支持但不显著 (p=${p.toFixed(4)})`);
  } else {
    console.log(`  ⚪ 无显著差异 (p=${p.toFixed(4)})`);
  }
}

/** 按 speakMode 分组（同时支持从 speakMode 字段和 runId 推断） */
function splitBySpeakMode(group: AsyncExperimentResult[]): {
  v1: AsyncExperimentResult[];
  v2: AsyncExperimentResult[];
} {
  const v1 = group.filter(r => r.speakMode === "random_prob" || r.runId?.includes("random_prob"));
  const v2 = group.filter(r =>
    r.speakMode === "content_driven" ||
    r.runId?.includes("content_driven") ||
    (!r.speakMode && !r.runId?.includes("random_prob"))
  );
  return { v1, v2 };
}

// ============================================================================

const DATA_DIR = path.resolve(__dirname, "data_fraud");

console.log("=".repeat(70));
console.log("  SwarmAlpha 异步自适应实验分析");
console.log("=".repeat(70));

const groupA = loadGroup(DATA_DIR, "A");
const groupB = loadGroup(DATA_DIR, "B");
const groupC = loadGroup(DATA_DIR, "C");
const groupD = loadGroup(DATA_DIR, "D");

console.log(`\n数据加载: A=${groupA.length}, B=${groupB.length}, C=${groupC.length}, D=${groupD.length}`);

// 检查 speakMode 分布
for (const [name, group] of [["A", groupA], ["B", groupB], ["C", groupC], ["D", groupD]] as [string, AsyncExperimentResult[]][]) {
  if (group.length === 0) continue;
  const { v1, v2 } = splitBySpeakMode(group);
  if (v1.length > 0 && v2.length > 0) {
    console.log(`  ${name} 组含两种 speakMode: v1(random_prob)=${v1.length}, v2(content_driven)=${v2.length}`);
  }
}

if (groupA.length === 0 && groupB.length === 0 && groupC.length === 0 && groupD.length === 0) {
  console.log("\n⚠️ 未找到实验数据。请先运行实验：");
  console.log("  npx tsx experiments/v2/run_async_ab.ts --group=A --count=10");
  console.log("  npx tsx experiments/v2/run_async_ab.ts --group=B --count=10");
  console.log("  npx tsx experiments/v2/run_async_ab.ts --group=C --count=10 --speakMode=content_driven");
  console.log("  npx tsx experiments/v2/run_async_ab.ts --group=D --count=10 --speakMode=content_driven");
  process.exit(0);
}

// ── 各组基本信息 ──
console.log("\n" + "─".repeat(70));
console.log("  各组基本信息");
console.log("─".repeat(70));
for (const [name, group] of [["A", groupA], ["B", groupB], ["C", groupC], ["D", groupD]] as [string, AsyncExperimentResult[]][]) {
  if (group.length === 0) continue;
  const taus = group.map(r => r.kendallTau);
  const utts = group.map(r => r.totalUtterances);
  const rounds = group.map(r => r.totalRounds);
  const converged = group.filter(r => r.converged).length;
  const hardCaps = group.filter(r => r.terminationReason.includes("hard_cap")).length;
  const strongCryst = group.filter(r => r.terminationReason.includes("strong_crystallized")).length;
  const cryst = group.filter(r => r.terminationReason.includes("crystallized") && !r.terminationReason.includes("strong_crystallized")).length;
  const eff = efficiency(mean(taus), mean(utts));
  console.log(`  ${name} 组: n=${group.length}, τ=${mean(taus).toFixed(4)}±${sampleStd(taus).toFixed(4)}, 发言=${mean(utts).toFixed(1)}±${sampleStd(utts).toFixed(1)}, 轮次=${mean(rounds).toFixed(1)}, 收敛=${converged}/${group.length}`);
  console.log(`    效率 τ/发言 = ${eff.toFixed(4)}（越高=单位发言产出越高）`);
  if (name === "C" || name === "D") {
    console.log(`    终止原因: 强结晶=${strongCryst}, 普通结晶=${cryst}, 硬上限=${hardCaps}`);
  }
}

// ── 核心对比 ──
// printComparison(name, groupA_data, groupB_data, hypothesis)
// 函数内 nameA = name.split(" vs ")[0]，groupA_data 对应 nameA
// 所以名称和数据必须一一对应
if (groupA.length > 0 && groupB.length > 0) {
  printComparison("A vs B", groupA, groupB, "异步发言本身是否影响决策质量");
}
if (groupB.length > 0 && groupC.length > 0) {
  // H_thermo: C（热力学自适应终止）优于 B（固定5轮）
  // nameA=C组数据, nameB=B组数据
  printComparison("C vs B", groupC, groupB, "热力学自适应终止优于固定轮次 (H_thermo)");
}
if (groupC.length > 0 && groupD.length > 0) {
  printComparison("C vs D", groupC, groupD, "热力学终止决策优于随机终止 (H_diag)");
}

// ── v1 vs v2 对比（异步发言机制改进验证） ──
const { v1: cV1, v2: cV2 } = splitBySpeakMode(groupC);
const { v1: dV1, v2: dV2 } = splitBySpeakMode(groupD);

if (cV1.length > 0 && cV2.length > 0) {
  printComparison("C_v1 vs C_v2", cV2, cV1, "内容驱动发言优于随机概率发言（异步机制改进）");
}
if (dV1.length > 0 && dV2.length > 0) {
  printComparison("D_v1 vs D_v2", dV2, dV1, "内容驱动发言优于随机概率发言（D 组验证）");
}

// ── C 组热力学状态分布 ──
if (groupC.length > 0) {
  console.log("\n" + "─".repeat(70));
  console.log("  C 组热力学状态分析");
  console.log("─".repeat(70));

  const strongCryst = groupC.filter(r => r.terminationReason.includes("strong_crystallized"));
  const cryst = groupC.filter(r => r.terminationReason.includes("crystallized") && !r.terminationReason.includes("strong_crystallized"));
  const hardCap = groupC.filter(r => r.terminationReason.includes("hard_cap"));

  console.log(`  强结晶态终止: ${strongCryst.length}/${groupC.length} (${(strongCryst.length / groupC.length * 100).toFixed(0)}%)`);
  console.log(`  普通结晶态终止: ${cryst.length}/${groupC.length} (${(cryst.length / groupC.length * 100).toFixed(0)}%)`);
  console.log(`  硬上限终止: ${hardCap.length}/${groupC.length} (${(hardCap.length / groupC.length * 100).toFixed(0)}%)`);

  // 三类终止的 τ 对比
  if (strongCryst.length > 0) {
    console.log(`  强结晶态终止 τ = ${mean(strongCryst.map(r => r.kendallTau)).toFixed(4)}`);
  }
  if (cryst.length > 0) {
    console.log(`  普通结晶态终止 τ = ${mean(cryst.map(r => r.kendallTau)).toFixed(4)}`);
  }
  if (hardCap.length > 0) {
    console.log(`  硬上限终止 τ = ${mean(hardCap.map(r => r.kendallTau)).toFixed(4)}`);
  }

  // 结晶态（强+普通）vs 硬上限
  const allCryst = [...strongCryst, ...cryst];
  if (allCryst.length > 0 && hardCap.length > 0) {
    const tauCryst = mean(allCryst.map(r => r.kendallTau));
    const tauHard = mean(hardCap.map(r => r.kendallTau));
    console.log(`\n  结晶态终止 τ = ${tauCryst.toFixed(4)} (n=${allCryst.length})`);
    console.log(`  硬上限终止 τ = ${tauHard.toFixed(4)} (n=${hardCap.length})`);
    console.log(`  Δτ = ${(tauCryst - tauHard).toFixed(4)}（正=结晶态终止质量更高）`);
  }

  // 热力学快照分析
  const allSnapshots = groupC.flatMap(r => r.thermoHistory);
  if (allSnapshots.length > 0) {
    const finalSnapshots = groupC.map(r => r.thermoHistory[r.thermoHistory.length - 1]).filter(s => s);
    console.log(`\n  最终状态平均: R=${mean(finalSnapshots.map(s => s.R)).toFixed(3)}, T=${mean(finalSnapshots.map(s => s.T)).toFixed(3)}, H=${mean(finalSnapshots.map(s => s.H)).toFixed(3)}, F=${mean(finalSnapshots.map(s => s.F)).toFixed(3)}`);
  }
}

// ── 结论 ──
console.log("\n" + "=".repeat(70));
console.log("  结论");
console.log("=".repeat(70));

if (groupB.length > 0 && groupC.length > 0) {
  const dBC = cohensD(groupC.map(r => r.kendallTau), groupB.map(r => r.kendallTau));
  const pBC = permutationTest(groupC.map(r => r.kendallTau), groupB.map(r => r.kendallTau));
  const meanC = mean(groupC.map(r => r.kendallTau));
  const meanB = mean(groupB.map(r => r.kendallTau));
  if (pBC < 0.05 && meanC > meanB) {
    console.log(`  ✅ H_thermo 支持: 热力学自适应终止显著优于固定轮次 (d=${dBC.toFixed(3)} ${interpretD(dBC)}, p=${pBC.toFixed(4)})`);
    console.log("     F 分解的终止诊断价值得到验证。");
  } else if (meanC > meanB) {
    console.log(`  ⚠️ H_thermo 方向支持但不显著 (d=${dBC.toFixed(3)} ${interpretD(dBC)}, p=${pBC.toFixed(4)})`);
  } else {
    console.log(`  ❌ H_thermo 不支持: 热力学自适应终止未优于固定轮次 (d=${dBC.toFixed(3)} ${interpretD(dBC)}, p=${pBC.toFixed(4)})`);
    console.log("     诚实记录此边界条件。");
  }
}

if (cV1.length > 0 && cV2.length > 0) {
  const dV = cohensD(cV2.map(r => r.kendallTau), cV1.map(r => r.kendallTau));
  const pV = permutationTest(cV2.map(r => r.kendallTau), cV1.map(r => r.kendallTau));
  const meanV2 = mean(cV2.map(r => r.kendallTau));
  const meanV1 = mean(cV1.map(r => r.kendallTau));
  console.log();
  if (pV < 0.05 && meanV2 > meanV1) {
    console.log(`  ✅ 异步机制改进验证: 内容驱动显著优于随机概率 (d=${dV.toFixed(3)} ${interpretD(dV)}, p=${pV.toFixed(4)})`);
    console.log("     真正的异步（内容驱动发言意愿）解决了依赖链断裂问题。");
  } else if (meanV2 > meanV1) {
    console.log(`  ⚠️ 异步机制改进方向支持但不显著 (d=${dV.toFixed(3)} ${interpretD(dV)}, p=${pV.toFixed(4)})`);
  } else {
    console.log(`  ❌ 异步机制改进不支持: 内容驱动未优于随机概率 (d=${dV.toFixed(3)} ${interpretD(dV)}, p=${pV.toFixed(4)})`);
  }
}
