/**
 * E9 Smoke Test — 最具性价比的验证
 *
 * Supplier（供应商选择）场景，2 组（none vs cognitive），3 seeds × 1 run = 6 runs。
 * 选择 Supplier 原因：经排查，Crisis 和 MA 均存在"单维度数据排序 = 正确答案"的结构性泄露，
 * 仅 Supplier 任务无此问题——没有单个 agent 的维度数据能直接推出正确答案。
 *
 * 用法：
 *   npx tsx experiments/campaign/analysis/e9_smoke_test.ts
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env.local") });

import { runSingle } from "../pipeline/Runner";
import type { ExperimentConfig } from "../types";
import { mean, sampleStd } from "../../v2/statsShared";

const OUTPUT_DIR = path.resolve(__dirname, "..", "output", "e9_smoke_supplier");

// 精简配置：1 场景 × 2 组 × 3 seeds × 1 run = 6 total
const SMOKE_CONFIGS: ExperimentConfig[] = [
  {
    id: "e9_smoke_sup_none",
    hypothesis: "H9",
    title: "Smoke — Supplier 无治理",
    scenario: "supplier",
    runtimeModes: ["native_cognitive"],
    governanceMode: "none",
    agentCount: 5,
    maxRounds: 3,
    runsPerSeed: 1,
    seeds: [42, 123, 456],
    llmModel: "deepseek-v4-flash",
    temperature: 0.0,
    isMain: false,
    description: "Smoke test: supplier none governance baseline",
  },
  {
    id: "e9_smoke_sup_cognitive",
    hypothesis: "H9",
    title: "Smoke — Supplier Cognitive 治理",
    scenario: "supplier",
    runtimeModes: ["native_cognitive"],
    governanceMode: "cognitive",
    agentCount: 5,
    maxRounds: 3,
    runsPerSeed: 1,
    seeds: [42, 123, 456],
    llmModel: "deepseek-v4-flash",
    temperature: 0.0,
    isMain: false,
    description: "Smoke test: supplier cognitive governance",
  },
];

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   E9 Smoke Test — Supplier 供应商选择 场景               ║");
  console.log("║   2 groups × 3 seeds × 1 run = 6 runs                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results: Map<string, { tau: number; rounds: number; interventions: number; thermoHistory?: Array<{ round: number; R: number; T: number; H: number; F: number }>; errors: string[] }[]> = new Map();

  for (const config of SMOKE_CONFIGS) {
    const groupResults: { tau: number; rounds: number; interventions: number; thermoHistory?: Array<{ round: number; R: number; T: number; H: number; F: number }>; errors: string[] }[] = [];
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

            console.log(`  seed=${seed} run=${i}: τ=${data.finalKendallTau.toFixed(3)}, ` +
              `${data.totalRounds} rounds, ${interventionCount} interventions` +
              (interventionCount > 0 ? ` [${uniqueTypes.join(", ")}]` : ""));

            // RTHF 轨迹输出
            if (data.thermoHistory && data.thermoHistory.length > 0) {
              const rthfSummary = data.thermoHistory.map(th =>
                `R${th.round}=${th.R.toFixed(2)} T=${th.T.toFixed(2)} H=${th.H.toFixed(2)} F=${th.F.toFixed(2)}`
              ).join(" | ");
              console.log(`    RTHF: ${rthfSummary}`);
            }

            if (data.cognitiveTrajectory && data.cognitiveTrajectory.length > 0) {
              const lastRound = data.cognitiveTrajectory.filter(cs => cs.round === data.totalRounds);
              if (lastRound.length > 0) {
                const susValues = lastRound.map(cs => cs.susceptibility);
                const inertiaValues = lastRound.map(cs => cs.inertiaStrength);
                console.log(`    Final state: susceptibility=[${susValues.map(v => v.toFixed(2)).join(", ")}], ` +
                  `inertia=[${inertiaValues.map(v => v.toFixed(2)).join(", ")}]`);
              }
            }

            groupResults.push({
              tau: data.finalKendallTau,
              rounds: data.totalRounds,
              interventions: interventionCount,
              thermoHistory: data.thermoHistory,
              errors: [],
            });
          } catch (err) {
            console.error(`  ERROR seed=${seed} run=${i}:`, String(err).slice(0, 200));
            groupResults.push({ tau: 0, rounds: 0, interventions: 0, thermoHistory: undefined, errors: [String(err)] });
          }
        }
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log("\n\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   Smoke Test Results                                    ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  for (const [id, groupResults] of results) {
    const valid = groupResults.filter(r => r.errors.length === 0);
    const tauValues = valid.map(r => r.tau);
    const intvValues = valid.map(r => r.interventions);

    console.log(`  ${id}:`);
    console.log(`    Runs: ${valid.length}/${groupResults.length} successful`);
    console.log(`    τ: ${mean(tauValues).toFixed(3)} ± ${sampleStd(tauValues).toFixed(3)} [${tauValues.map(v => v.toFixed(3)).join(", ")}]`);
    console.log(`    Interventions: ${mean(intvValues).toFixed(1)} avg per run`);
    console.log(`    Errors: ${groupResults.filter(r => r.errors.length > 0).length}`);
  }

  // ── Comparison ───────────────────────────────────────────────────────
  const noneResults = results.get("e9_smoke_sup_none")?.filter(r => r.errors.length === 0) || [];
  const cogResults = results.get("e9_smoke_sup_cognitive")?.filter(r => r.errors.length === 0) || [];

  if (noneResults.length > 0 && cogResults.length > 0) {
    const noneTau = mean(noneResults.map(r => r.tau));
    const cogTau = mean(cogResults.map(r => r.tau));
    const delta = cogTau - noneTau;

    console.log("\n  ━━━ Comparison ━━━");
    console.log(`  Δτ (cognitive − none) = ${delta >= 0 ? "+" : ""}${delta.toFixed(3)}`);
    console.log(`  Direction: ${delta > 0 ? "✅ Positive (cognitive improves decision quality)" : delta < 0 ? "⚠️ Negative" : "➡️ No change"}`);

    const cogInterventions = cogResults.reduce((s, r) => s + r.interventions, 0);
    console.log(`  Total cognitive interventions: ${cogInterventions}`);

    // ── RTHF 平均轨迹 ──
    console.log("\n  ━━━ RTHF Average Trajectory ━━━");
    for (const [label, groupData] of [["None", noneResults], ["Cognitive", cogResults]] as const) {
      const thermoRuns = groupData.filter(r => r.thermoHistory && r.thermoHistory.length > 0);
      if (thermoRuns.length === 0) {
        console.log(`    ${label}: No thermoHistory data`);
        continue;
      }
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
      console.log(`    ${label}: ${rthfStr}`);
    }
  }

  console.log("\n  Smoke test complete. Check output/e9_smoke_supplier/ for raw data.");
}

main().catch(err => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});