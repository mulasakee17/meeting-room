/**
 * E9 Medium Scale Runner — 中等规模验证实验
 *
 * 2 场景 × 3 治理模式 = 6 配置 × 3 seeds × 1 run = 18 runs
 *
 * 用法：
 *   npx tsx experiments/campaign/analysis/e9_medium_scale.ts
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env.local") });

import { runSingle } from "../pipeline/Runner";
import type { ExperimentConfig } from "../types";
import { mean, sampleStd } from "../../v2/statsShared";
import { E9M_CRISIS_NONE, E9M_CRISIS_BELIEF, E9M_CRISIS_COGNITIVE } from "../configs/e9_medium_scale";

const RUN_CONFIGS = [E9M_CRISIS_NONE, E9M_CRISIS_BELIEF, E9M_CRISIS_COGNITIVE];

const OUTPUT_DIR = path.resolve(__dirname, "..", "output", "e9_medium_scale");

interface RunResult {
  tau: number;
  rounds: number;
  interventions: number;
  interventionTypes: string[];
  governanceIssues: string[];
  thermoHistory?: Array<{ round: number; R: number; T: number; H: number; F: number }>;
  errors: string[];
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   E9 Medium Scale — Crisis 场景验证（修复后）            ║");
  console.log("║   3 modes × 3 seeds × 1 run = 9 runs                   ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = new Map<string, RunResult[]>();

  for (const config of RUN_CONFIGS) {
    const groupResults: RunResult[] = [];
    results.set(config.id, groupResults);

    console.log(`\n━━━ ${config.id} — ${config.title} ━━━`);

    for (const seed of config.seeds) {
      for (const mode of config.runtimeModes) {
        for (let i = 0; i < config.runsPerSeed; i++) {
          try {
            const data = await runSingle(config, mode, seed, i, OUTPUT_DIR);

            const interventionCount = data.interventions.length;
            const interventionTypes = data.interventions.map(iv => iv.type);
            const uniqueTypes = [...new Set(interventionTypes)];
            const governanceIssues = data.governanceIssues?.map(gi => gi.type) ?? [];

            console.log(`  seed=${seed}: τ=${data.finalKendallTau.toFixed(3)}, ` +
              `${data.totalRounds} rounds, ${interventionCount} interventions` +
              (interventionCount > 0 ? ` [${uniqueTypes.join(", ")}]` : ""));

            // RTHF 轨迹
            if (data.thermoHistory && data.thermoHistory.length > 0) {
              const rthfSummary = data.thermoHistory.map(th =>
                `R${th.round}=${th.R.toFixed(2)} T=${th.T.toFixed(2)} H=${th.H.toFixed(2)} F=${th.F.toFixed(2)}`
              ).join(" | ");
              console.log(`    RTHF: ${rthfSummary}`);
            }

            // 治理问题详情
            if (governanceIssues.length > 0) {
              console.log(`    Issues: ${governanceIssues.join(", ")}`);
            }

            groupResults.push({
              tau: data.finalKendallTau,
              rounds: data.totalRounds,
              interventions: interventionCount,
              interventionTypes: uniqueTypes,
              governanceIssues,
              thermoHistory: data.thermoHistory,
              errors: [],
            });
          } catch (err) {
            console.error(`  ERROR seed=${seed}:`, String(err).slice(0, 200));
            groupResults.push({
              tau: 0, rounds: 0, interventions: 0,
              interventionTypes: [], governanceIssues: [],
              thermoHistory: undefined, errors: [String(err)],
            });
          }
        }
      }
    }
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log("\n\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   Medium Scale Results                                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  for (const [id, groupResults] of results) {
    const valid = groupResults.filter(r => r.errors.length === 0);
    const tauValues = valid.map(r => r.tau);
    const intvValues = valid.map(r => r.interventions);

    console.log(`  ${id}:`);
    console.log(`    τ: ${mean(tauValues).toFixed(3)} ± ${sampleStd(tauValues).toFixed(3)} [${tauValues.map(v => v.toFixed(3)).join(", ")}]`);
    console.log(`    Interventions: ${mean(intvValues).toFixed(1)} avg [${intvValues.join(", ")}]`);
    if (valid.length > 0) {
      const allTypes = [...new Set(valid.flatMap(r => r.interventionTypes))];
      console.log(`    Types: ${allTypes.join(", ") || "none"}`);
    }
    console.log(`    Errors: ${groupResults.filter(r => r.errors.length > 0).length}`);
  }

  // ==========================================================================
  // Cross-Comparison
  // ==========================================================================
  console.log("\n  ━━━ Cross-Comparison ━━━");

  const noneR = results.get("e9m_crisis_none")?.filter(r => r.errors.length === 0) || [];
  const beliefR = results.get("e9m_crisis_belief")?.filter(r => r.errors.length === 0) || [];
  const cogR = results.get("e9m_crisis_cognitive")?.filter(r => r.errors.length === 0) || [];

  if (noneR.length > 0) {
    const noneTau = mean(noneR.map(r => r.tau));
    const noneStd = sampleStd(noneR.map(r => r.tau));
    console.log(`    None:     τ = ${noneTau.toFixed(3)} ± ${noneStd.toFixed(3)}`);

    if (beliefR.length > 0) {
      const beliefTau = mean(beliefR.map(r => r.tau));
      const beliefStd = sampleStd(beliefR.map(r => r.tau));
      const deltaB = beliefTau - noneTau;
      console.log(`    Belief:   τ = ${beliefTau.toFixed(3)} ± ${beliefStd.toFixed(3)}  Δτ = ${deltaB >= 0 ? "+" : ""}${deltaB.toFixed(3)}`);
    }

    if (cogR.length > 0) {
      const cogTau = mean(cogR.map(r => r.tau));
      const cogStd = sampleStd(cogR.map(r => r.tau));
      const deltaC = cogTau - noneTau;
      console.log(`    Cognitive: τ = ${cogTau.toFixed(3)} ± ${cogStd.toFixed(3)}  Δτ = ${deltaC >= 0 ? "+" : ""}${deltaC.toFixed(3)}`);
    }
  }

  // ==========================================================================
  // RTHF Average Trajectory
  // ==========================================================================
  console.log("\n  ━━━ RTHF Average Trajectory ━━━");

  for (const [id, groupResults] of results) {
    const thermoRuns = groupResults.filter(r => r.thermoHistory && r.thermoHistory.length > 0);
    if (thermoRuns.length === 0) continue;

    const maxRound = Math.max(...thermoRuns.map(r => r.thermoHistory!.length));
    const avgRTHF: Array<{ R: number; T: number; H: number; F: number }> = [];
    for (let r = 0; r < maxRound; r++) {
      const rVals = thermoRuns.map(run => run.thermoHistory![r]?.R ?? NaN).filter(v => !isNaN(v));
      const tVals = thermoRuns.map(run => run.thermoHistory![r]?.T ?? NaN).filter(v => !isNaN(v));
      const hVals = thermoRuns.map(run => run.thermoHistory![r]?.H ?? NaN).filter(v => !isNaN(v));
      const fVals = thermoRuns.map(run => run.thermoHistory![r]?.F ?? NaN).filter(v => !isNaN(v));
      avgRTHF.push({
        R: rVals.length > 0 ? rVals.reduce((a, b) => a + b, 0) / rVals.length : 0,
        T: tVals.length > 0 ? tVals.reduce((a, b) => a + b, 0) / tVals.length : 0,
        H: hVals.length > 0 ? hVals.reduce((a, b) => a + b, 0) / hVals.length : 0,
        F: fVals.length > 0 ? fVals.reduce((a, b) => a + b, 0) / fVals.length : 0,
      });
    }
    const rthfStr = avgRTHF.map((th, i) =>
      `R${i + 1}=${th.R.toFixed(2)} T=${th.T.toFixed(2)} H=${th.H.toFixed(2)} F=${th.F.toFixed(2)}`
    ).join(" | ");
    console.log(`    ${id}: ${rthfStr}`);
  }

  // ==========================================================================
  // Cross-Validation of Previous Conclusions
  // ==========================================================================
  console.log("\n  ━━━ Cross-Validation of Previous Conclusions ━━━");

  // C1: 非破坏性干预是否改善决策质量
  if (noneR.length > 0 && cogR.length > 0) {
    const noneTau = mean(noneR.map(r => r.tau));
    const cogTau = mean(cogR.map(r => r.tau));
    const delta = cogTau - noneTau;
    console.log(`  C1 非破坏性干预 Δτ = ${delta >= 0 ? "+" : ""}${delta.toFixed(3)} ` +
      `(${delta > 0 ? "正向" : delta < 0 ? "负向" : "无变化"})`);
  }

  // C2: 旧治理是否仍有破坏性
  if (noneR.length > 0 && beliefR.length > 0) {
    const noneTau = mean(noneR.map(r => r.tau));
    const beliefTau = mean(beliefR.map(r => r.tau));
    const delta = beliefTau - noneTau;
    console.log(`  C2 Belief 治理 Δτ = ${delta >= 0 ? "+" : ""}${delta.toFixed(3)} ` +
      `(${delta > 0 ? "正向" : delta < 0 ? "破坏性" : "无变化"})`);
  }

  // C3: Crisis baseline τ 是否合理（修复后不应再有天花板效应）
  if (noneR.length > 0) {
    const noneTau = mean(noneR.map(r => r.tau));
    console.log(`  C3 Crisis baseline τ = ${noneTau.toFixed(3)} (修复前接近 1.0 天花板，修复后应 < 0.8)`);
  }

  console.log("\n  Medium scale complete. Check output/e9_medium_scale/ for raw data.");
}

main().catch(err => {
  console.error("Medium scale experiment failed:", err);
  process.exit(1);
});