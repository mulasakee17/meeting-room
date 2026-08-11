/**
 * E12 F 分解分析 (R/T/H/F 指标 vs 最终正确率)
 *
 * 核心问题: R/T/H/F 能否作为"运行时监测信号"预测最终 group accuracy?
 *   - R (Kuramoto order): 共识度 — 高 R 可能意味着"错误共识"(全体错)
 *   - T (utility volatility): 活性/温度 — 低 T 意味着"结晶态"(过早锁定)
 *   - H (evidence entropy): 信息多样性 — 高 H 意味着"证据分散"
 *   - F = U - T·H (free energy): 讨论质量/coherence
 *
 * 从 raw run 的 thermoHistory 提取每轮 R/T/H/F, 关联最终正确率。
 *
 * 用法: npx tsx experiments/campaign/analyze_F_decomposition.ts
 */

import * as fs from "fs";
import * as path from "path";

const RAW_DIR = path.resolve(__dirname, "output", "e12", "raw");

interface ThermoSnapshot { round: number; R: number; T: number; H: number; F: number; }
interface RawRun {
  runId: string;
  seed: number;
  finalAccuracy: number;
  individualAccuracy: number;
  totalRounds: number;
  thermoHistory?: ThermoSnapshot[];
  finalRanking?: string[];
}

function loadRuns(phases: string[]): RawRun[] {
  const files = fs.readdirSync(RAW_DIR).filter(f => phases.some(p => f.startsWith(`e12_${p}_`)) && f.endsWith(".json"));
  const runs: RawRun[] = [];
  for (const f of files) {
    try { runs.push(JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf-8"))); } catch {}
  }
  return runs;
}

function main() {
  const runs = loadRuns(["B", "C"]);
  console.log(`Loaded ${runs.length} runs (B+C)`);
  console.log();

  // For each run, extract round-1 thermo + last-round thermo + final accuracy
  const rows = runs.map(r => {
    const th = r.thermoHistory ?? [];
    const first = th[0];
    const last = th[th.length - 1];
    const minF = th.length ? Math.min(...th.map(t => t.F)) : NaN;
    const minFround = th.find(t => t.F === minF)?.round ?? -1;
    return {
      runId: r.runId,
      seed: r.seed,
      acc: r.finalAccuracy,
      rounds: r.totalRounds,
      r1: first, rLast: last, minF, minFround,
      wrongConsensus: first ? (first.R > 0.85 && first.F < 0.2) : false,
    };
  }).filter(r => r.r1);

  // Question 1: does round-1 F predict final accuracy?
  const accByF1 = rows.reduce((acc, r) => {
    const bucket = Math.floor(r.r1.F * 5) / 5; // 0.0, 0.2, ...
    if (!acc[bucket]) acc[bucket] = { n: 0, correct: 0 };
    acc[bucket].n++; acc[bucket].correct += r.acc;
    return acc;
  }, {} as Record<number, { n: number; correct: number }>);

  console.log("=== Q1: round-1 F vs final accuracy ===");
  console.log("F bucket   n   acc");
  for (const [f, { n, correct }] of Object.entries(accByF1).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  ${Number(f).toFixed(1)}-${(Number(f) + 0.2).toFixed(1)}  ${String(n).padStart(3)}  ${(correct / n * 100).toFixed(0)}%`);
  }

  // Question 2: R=1 but wrong (the dangerous case)
  const highRlowF = rows.filter(r => r.r1.R > 0.85 && r.r1.F < 0.3);
  const highRhighF = rows.filter(r => r.r1.R > 0.85 && r.r1.F >= 0.3);
  const lowR = rows.filter(r => r.r1.R <= 0.85);

  console.log(`\n=== Q2: R=high & F=low (crystallized wrong consensus) ===`);
  console.log(`  R>0.85, F<0.3: ${highRlowF.length} runs, acc=${(highRlowF.reduce((s, r) => s + r.acc, 0) / Math.max(1, highRlowF.length) * 100).toFixed(0)}%`);
  console.log(`  R>0.85, F>=0.3: ${highRhighF.length} runs, acc=${(highRhighF.reduce((s, r) => s + r.acc, 0) / Math.max(1, highRhighF.length) * 100).toFixed(0)}%`);
  console.log(`  R<=0.85: ${lowR.length} runs, acc=${(lowR.reduce((s, r) => s + r.acc, 0) / Math.max(1, lowR.length) * 100).toFixed(0)}%`);

  // Question 3: does F recover over rounds (the discussion is working) or collapse?
  console.log(`\n=== Q3: F trajectory (first vs min) ===`);
  const fDrop = rows.map(r => ({ runId: r.runId, acc: r.acc, fDrop: r.r1.F - r.minF }));
  const dropCorrect = fDrop.filter(r => r.acc === 1);
  const dropWrong = fDrop.filter(r => r.acc === 0);
  if (dropWrong.length > 0) {
    console.log(`  Correct runs: avg F drop = ${(dropCorrect.reduce((s, r) => s + r.fDrop, 0) / dropCorrect.length).toFixed(3)}`);
    console.log(`  Wrong runs:   avg F drop = ${(dropWrong.reduce((s, r) => s + r.fDrop, 0) / dropWrong.length).toFixed(3)}`);
  }

  // Question 4: correlation between min-F round and convergence
  console.log(`\n=== Q4: min F round vs total rounds ===`);
  const earlyFreeze = rows.filter(r => r.minFround === 1 || r.minFround === 2);
  console.log(`  F min by round 1-2: ${earlyFreeze.length} runs, acc=${(earlyFreeze.reduce((s, r) => s + r.acc, 0) / Math.max(1, earlyFreeze.length) * 100).toFixed(0)}%`);

  // Case study: list the wrong consensus runs
  console.log(`\n=== Case study: all runs with R1>0.85 & F1<0.3 ===`);
  for (const r of highRlowF) {
    console.log(`  ${r.runId}: R1=${r.r1.R.toFixed(3)} F1=${r.r1.F.toFixed(3)} → acc=${r.acc}`);
  }
}

main();
