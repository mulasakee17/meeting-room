/**
 * Phase 1.5 探测实验 — 最小成本验证三个关键假设
 *
 * A. Prompt 稳定性：Crisis, 新 prompt, 1 seed × 1 run
 * B. 认知治理效应方向：Crisis, none vs cognitive, 5 seeds × 1 run
 * C. δ 信号检测：复用 B 数据 + 旧 Crisis 数据
 *
 * 总成本：~$1.1, 半天时间
 *
 * 用法：
 *   npx tsx experiments/campaign/analysis/phase1_5_probe.ts
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env.local") });

import { runSingle } from "../pipeline/Runner";
import type { ExperimentConfig } from "../types";
import { mean, sampleStd } from "../../v2/statsShared";

const OUTPUT_DIR = path.resolve(__dirname, "..", "output", "phase1_5_probe");

// 探测配置：Crisis 场景，2 组（none vs cognitive），5 seeds × 1 run
const PROBE_CONFIGS: ExperimentConfig[] = [
  {
    id: "p15_crisis_none",
    hypothesis: "H_P15",
    title: "Phase 1.5 — Crisis 无治理 baseline",
    scenario: "crisis",
    runtimeModes: ["native_cognitive"],
    governanceMode: "none",
    agentCount: 5,
    maxRounds: 3,
    runsPerSeed: 1,
    seeds: [42, 123, 456, 789, 1024],
    llmModel: "deepseek-v4-flash",
    temperature: 0.0,
    isMain: false,
    description: "Phase 1.5 probe: Crisis none governance baseline",
  },
  {
    id: "p15_crisis_cognitive",
    hypothesis: "H_P15",
    title: "Phase 1.5 — Crisis Cognitive 治理",
    scenario: "crisis",
    runtimeModes: ["native_cognitive"],
    governanceMode: "cognitive",
    agentCount: 5,
    maxRounds: 3,
    runsPerSeed: 1,
    seeds: [42, 123, 456, 789, 1024],
    llmModel: "deepseek-v4-flash",
    temperature: 0.0,
    isMain: false,
    description: "Phase 1.5 probe: Crisis cognitive governance",
  },
];

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   Phase 1.5 探测实验 — 最小成本验证                     ║");
  console.log("║   A: Prompt 稳定性 (1 run)                              ║");
  console.log("║   B: 认知治理效应方向 (10 runs)                          ║");
  console.log("║   C: δ 信号检测 (分析)                                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results: Map<string, { tau: number; rounds: number; deltaDiagnosis?: any[]; errors: string[] }[]> = new Map();

  for (const config of PROBE_CONFIGS) {
    const groupResults: { tau: number; rounds: number; deltaDiagnosis?: any[]; errors: string[] }[] = [];
    results.set(config.id, groupResults);

    console.log(`\n━━━ ${config.id} — ${config.title} ━━━`);

    for (const seed of config.seeds) {
      for (const mode of config.runtimeModes) {
        for (let i = 0; i < config.runsPerSeed; i++) {
          try {
            const data = await runSingle(config, mode, seed, i, OUTPUT_DIR);
            groupResults.push({
              tau: data.finalKendallTau,
              rounds: data.totalRounds,
              deltaDiagnosis: data.deltaDiagnosis?.map(d => ({
                round: d.round,
                summary: d.summary,
                polarizationTriggered: d.polarization.triggered,
                oneDMaskTriggered: d.oneDMask.triggered,
                evidenceSilenceTriggered: d.evidenceSilence.triggered,
                confidenceGapTriggered: d.confidenceGap.triggered,
                stanceFlipTriggered: d.stanceFlip.triggered,
                noResponseTriggered: d.noResponse.triggered,
                concentrationTriggered: d.concentration.triggered,
                consistencyTriggered: d.consistency.triggered,
              })),
              errors: [],
            });
            console.log(`    seed=${seed} τ=${data.finalKendallTau.toFixed(3)} rounds=${data.totalRounds}`);
          } catch (err: any) {
            console.error(`    seed=${seed} FAILED: ${err.message}`);
            groupResults.push({ tau: 0, rounds: 0, errors: [err.message] });
          }
        }
      }
    }
  }

  // ── 分析 ──
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("  分析结果");
  console.log("═══════════════════════════════════════════════════════════\n");

  const noneGrp = results.get("p15_crisis_none") ?? [];
  const cogGrp = results.get("p15_crisis_cognitive") ?? [];

  const noneTaus = noneGrp.filter(r => r.errors.length === 0).map(r => r.tau);
  const cogTaus = cogGrp.filter(r => r.errors.length === 0).map(r => r.tau);

  // A: Prompt 稳定性
  console.log("── A. Prompt 稳定性 ──");
  const firstRun = noneGrp[0];
  if (firstRun && firstRun.errors.length === 0) {
    console.log(`  ✅ 第一个 run 成功完成，τ=${firstRun.tau.toFixed(3)}，rounds=${firstRun.rounds}`);
    console.log("  → 新 prompt 工作正常，LLM 正确输出 itemBeliefs");
  } else {
    console.log("  ❌ 第一个 run 失败！");
    console.log(`  → 错误: ${firstRun?.errors.join("; ") ?? "无数据"}`);
  }

  // B: 认知治理效应方向
  console.log("\n── B. 认知治理效应方向 ──");
  if (noneTaus.length > 0 && cogTaus.length > 0) {
    const noneMean = mean(noneTaus);
    const cogMean = mean(cogTaus);
    const diff = cogMean - noneMean;
    const oldBeliefD = 0.92; // 旧数据 belief-based governance effect (Crisis)

    console.log(`  none baseline:     τ = ${noneMean.toFixed(3)} ± ${sampleStd(noneTaus).toFixed(3)} (n=${noneTaus.length})`);
    console.log(`  cognitive governance: τ = ${cogMean.toFixed(3)} ± ${sampleStd(cogTaus).toFixed(3)} (n=${cogTaus.length})`);
    console.log(`  Δτ (cognitive - none): ${diff >= 0 ? "+" : ""}${diff.toFixed(3)}`);
    console.log(`  旧 belief-based 治理效应: d = ${oldBeliefD}（参考值）`);

    if (diff > 0.1) {
      console.log("  ✅ 认知治理有正向效应！建议进入 Phase 2");
    } else if (diff > 0) {
      console.log("  ⚠️ 认知治理有微弱正向效应。Phase 2 仍可尝试，但效应量可能较小");
    } else {
      console.log("  ❌ 认知治理无正向效应。需重新评估是否进入 Phase 2");
    }
  } else {
    console.log("  ❌ 数据不足，无法分析");
  }

  // C: δ 信号检测
  console.log("\n── C. δ 信号检测 ──");
  const allDeltaRuns = [...noneGrp, ...cogGrp].filter(r => r.deltaDiagnosis && r.deltaDiagnosis.length > 0);
  if (allDeltaRuns.length > 0) {
    let coverageHits = 0;
    let concentrationHits = 0;
    let consistencyHits = 0;
    let totalRounds = 0;

    for (const run of allDeltaRuns) {
      for (const d of run.deltaDiagnosis!) {
        totalRounds++;
        if (d.coverageTriggered) coverageHits++;
        if (d.concentrationTriggered) concentrationHits++;
        if (d.consistencyTriggered) consistencyHits++;
      }
    }

    console.log(`  总轮次数: ${totalRounds}`);
    console.log(`  δ_coverage 触发率:     ${(coverageHits / totalRounds * 100).toFixed(1)}% (${coverageHits}/${totalRounds})`);
    console.log(`  δ_concentration 触发率: ${(concentrationHits / totalRounds * 100).toFixed(1)}% (${concentrationHits}/${totalRounds})`);
    console.log(`  δ_consistency 触发率:   ${(consistencyHits / totalRounds * 100).toFixed(1)}% (${consistencyHits}/${totalRounds})`);

    // 检查 δ 是否有区分度（不是全触发或全不触发）
    if (coverageHits > 0 && coverageHits < totalRounds) {
      console.log("  ✅ δ_coverage 有区分度（非全触发/全不触发）");
    } else {
      console.log("  ⚠️ δ_coverage 无区分度（全触发或全不触发），需调整阈值");
    }
    if (concentrationHits > 0 && concentrationHits < totalRounds) {
      console.log("  ✅ δ_concentration 有区分度");
    } else {
      console.log("  ⚠️ δ_concentration 无区分度，需调整阈值");
    }
    if (consistencyHits > 0 && consistencyHits < totalRounds) {
      console.log("  ✅ δ_consistency 有区分度");
    } else {
      console.log("  ⚠️ δ_consistency 无区分度，需调整阈值");
    }
  } else {
    console.log("  ❌ 无 δ 诊断数据");
  }

  // ── 决策建议 ──
  console.log("\n── 决策建议 ──");
  const promptOk = firstRun && firstRun.errors.length === 0;
  const effectPositive = noneTaus.length > 0 && cogTaus.length > 0 && (mean(cogTaus) - mean(noneTaus)) > 0;
  const deltaOk = allDeltaRuns.length > 0;

  const greenCount = [promptOk, effectPositive, deltaOk].filter(Boolean).length;
  if (greenCount === 3) {
    console.log("  🟢 3/3 绿灯！建议立即进入 Phase 2 完整实验");
  } else if (greenCount === 2) {
    console.log("  🟡 2/3 绿灯。建议进入 Phase 2，但需关注失败项的调整");
  } else if (greenCount === 1) {
    console.log("  🟠 1/3 绿灯。建议先修复失败项再决定是否进入 Phase 2");
  } else {
    console.log("  🔴 0/3 绿灯。建议重新评估 ROADMAP_V5 方案");
  }

  console.log("\n完成！");
}

main().catch(console.error);