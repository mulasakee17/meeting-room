/**
 * SwarmAlpha Phase 2.9 — Dry Run E1
 * 
 * 最小化配置验证完整 Pipeline：
 *   Simulation → JSON → Metrics → Statistics → Figure → Report
 * 
 * 配置：
 *   seed: 42, runs: 2, agents: 5, rounds: 5, scenario: ma
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

import { runExperiment } from "./pipeline/Runner";
import { computeE1Stability } from "./pipeline/MetricComputer";
import { runTests } from "./pipeline/StatisticalTest";
import { generateFigures } from "./pipeline/FigureGenerator";
import { generateReport } from "./pipeline/ReportGenerator";
import { summarizeCampaign } from "./pipeline/CampaignSummarizer";
import type { ExperimentConfig, ExperimentMetrics, TestResult, RawRunData } from "./types";
import { E1_STABILITY } from "./configs/e1_stability";

const OUTPUT_DIR = path.resolve(__dirname, "output", "dry_run");

// 覆盖 E1 配置为 Dry Run 参数
const DRY_RUN_CONFIG: ExperimentConfig = {
  ...E1_STABILITY,
  seeds: [42],
  runsPerSeed: 2,
  agentCount: 5,
  maxRounds: 5,
};

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   SwarmAlpha Dry Run — E1 Pipeline Validation          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\n  Config: seed=42, runs=2, agents=5, rounds=5`);
  console.log(`  Modes: belief + cognitive`);
  console.log(`  Output: ${OUTPUT_DIR}`);

  // Step 1: Simulation
  console.log("\n── Step 1: Simulation ──");
  const allData = await runExperiment(DRY_RUN_CONFIG, OUTPUT_DIR, { resume: false, verbose: true });
  console.log(`  Completed: ${allData.length} runs`);

  if (allData.length === 0) {
    console.error("  ERROR: No data generated. Check LLM configuration.");
    process.exit(1);
  }

  // Step 2: Metrics
  console.log("\n── Step 2: Metrics ──");
  const beliefData = allData.filter(d => d.runtimeMode === "belief");
  const cognitiveData = allData.filter(d => d.runtimeMode === "cognitive");
  console.log(`  Belief runs: ${beliefData.length}, Cognitive runs: ${cognitiveData.length}`);

  const metrics = computeE1Stability(beliefData, cognitiveData);
  const metricsPath = path.join(OUTPUT_DIR, "e1_stability", "metrics.json");
  fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
  console.log(`  Metrics saved: ${metricsPath}`);
  console.log(`  σ²(ΔB)=${metrics.stateStability!.sigmaSqDeltaB.toFixed(6)}, σ²(ΔU)=${metrics.stateStability!.sigmaSqDeltaU.toFixed(6)}`);
  console.log(`  Stability Ratio=${metrics.stateStability!.stabilityRatio.toFixed(2)}`);

  // Step 3: Statistics
  console.log("\n── Step 3: Statistics ──");
  const tests = runTests(metrics);
  const testsPath = path.join(OUTPUT_DIR, "e1_stability", "tests.json");
  fs.writeFileSync(testsPath, JSON.stringify(tests, null, 2));
  for (const test of tests) {
    const sig = test.significant ? "✅" : "❌";
    console.log(`  ${sig} ${test.testName}: p=${test.pValue.toFixed(4)}, ${test.effectSizeName}=${test.effectSize.toFixed(3)}`);
    console.log(`    95% CI: [${test.ciLower.toFixed(3)}, ${test.ciUpper.toFixed(3)}]`);
    console.log(`    ${test.conclusion}`);
  }

  // Step 4: Figures
  console.log("\n── Step 4: Figures ──");
  const figDir = path.join(OUTPUT_DIR, "e1_stability", "figures");
  const figurePaths = generateFigures(metrics, tests, figDir);
  console.log(`  Generated ${figurePaths.length} figures:`);
  for (const fp of figurePaths) {
    console.log(`    ${fp}`);
  }

  // Step 5: Report
  console.log("\n── Step 5: Report ──");
  const { mdPath, texPath, summary } = generateReport(metrics, tests, figurePaths, path.join(OUTPUT_DIR, "e1_stability"));
  console.log(`  Markdown: ${mdPath}`);
  console.log(`  LaTeX: ${texPath}`);
  console.log(`  Summary: ${summary.slice(0, 200)}...`);

  // Step 6: Campaign Summary
  console.log("\n── Step 6: Campaign Summary ──");
  const campaignSummary = summarizeCampaign([metrics], tests, allData.length, OUTPUT_DIR);
  console.log(`  Summary saved: ${path.join(OUTPUT_DIR, "campaign_summary.md")}`);

  // Final Verification
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   Dry Run Verification                                 ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const checks: Array<{ name: string; pass: boolean; detail: string }> = [
    {
      name: "Simulation",
      pass: allData.length >= 4, // 2 modes × 2 runs
      detail: `${allData.length} runs generated (expected >= 4)`,
    },
    {
      name: "JSON Output",
      pass: fs.existsSync(path.join(OUTPUT_DIR, "e1_stability", "raw", `${DRY_RUN_CONFIG.id}_belief_seed42_run0.json`)),
      detail: "Raw JSON files exist",
    },
    {
      name: "Metrics",
      pass: metrics.stateStability!.perRunRatios.length > 0,
      detail: `${metrics.stateStability!.perRunRatios.length} per-run ratios computed`,
    },
    {
      name: "Statistics",
      pass: tests.length > 0 && tests.every(t => t.pValue >= 0 && t.pValue <= 1),
      detail: `${tests.length} tests with valid p-values`,
    },
    {
      name: "Figures",
      pass: figurePaths.length > 0,
      detail: `${figurePaths.length} figures generated`,
    },
    {
      name: "Report",
      pass: fs.existsSync(mdPath) && fs.existsSync(texPath),
      detail: "Markdown + LaTeX reports generated",
    },
    {
      name: "Campaign Summary",
      pass: fs.existsSync(path.join(OUTPUT_DIR, "campaign_summary.json")),
      detail: "Campaign summary JSON generated",
    },
  ];

  let allPassed = true;
  for (const check of checks) {
    const status = check.pass ? "✅" : "❌";
    console.log(`  ${status} ${check.name}: ${check.detail}`);
    if (!check.pass) allPassed = false;
  }

  if (allPassed) {
    console.log("\n  🎉 ALL CHECKS PASSED — Pipeline is ready for Scientific Campaign!");
  } else {
    console.log("\n  ⚠️  SOME CHECKS FAILED — Review the issues above.");
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   Dry Run Complete                                      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
}

main().catch(err => {
  console.error("Dry run failed:", err);
  process.exit(1);
});