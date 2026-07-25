/**
 * Dry Run Pipeline Analysis
 * 读取 mock 数据，运行完整 Pipeline：Metrics → Statistics → Figures → Report → Summary
 */

import * as fs from "fs";
import * as path from "path";
import { loadExperimentData } from "./pipeline/Runner";
import { computeE1Stability } from "./pipeline/MetricComputer";
import { runTests } from "./pipeline/StatisticalTest";
import { generateFigures } from "./pipeline/FigureGenerator";
import { generateReport } from "./pipeline/ReportGenerator";
import { summarizeCampaign } from "./pipeline/CampaignSummarizer";

const OUTPUT_DIR = path.resolve(__dirname, "output", "dry_run");

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║   Pipeline Analysis — Mock Data Verification           ║");
console.log("╚══════════════════════════════════════════════════════════╝");

// Step 1: Load data
console.log("\n── Step 1: Load Data ──");
const allData = loadExperimentData("e1_stability", OUTPUT_DIR);
console.log(`  Loaded ${allData.length} runs`);
console.log(`  Belief: ${allData.filter(d => d.runtimeMode === "belief").length}`);
console.log(`  Cognitive: ${allData.filter(d => d.runtimeMode === "cognitive").length}`);

// Step 2: Compute Metrics
console.log("\n── Step 2: Compute Metrics ──");
const beliefData = allData.filter(d => d.runtimeMode === "belief");
const cognitiveData = allData.filter(d => d.runtimeMode === "cognitive");
const metrics = computeE1Stability(beliefData, cognitiveData);

const metricsPath = path.join(OUTPUT_DIR, "e1_stability", "metrics.json");
fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));

const ss = metrics.stateStability!;
console.log(`  σ²(ΔB) = ${ss.sigmaSqDeltaB.toFixed(6)}`);
console.log(`  σ²(ΔU) = ${ss.sigmaSqDeltaU.toFixed(6)}`);
console.log(`  Stability Ratio = ${ss.stabilityRatio.toFixed(2)}`);
console.log(`  Per-run ratios: [${ss.perRunRatios.map(r => r.toFixed(2)).join(", ")}]`);
console.log(`  Sample size: ${metrics.sampleSize}`);

// Step 3: Statistical Tests
console.log("\n── Step 3: Statistical Tests ──");
const tests = runTests(metrics);
const testsPath = path.join(OUTPUT_DIR, "e1_stability", "tests.json");
fs.writeFileSync(testsPath, JSON.stringify(tests, null, 2));

for (const test of tests) {
  const sig = test.significant ? "✅" : "❌";
  console.log(`  ${sig} ${test.testName}`);
  console.log(`    p-value: ${test.pValue.toFixed(4)}`);
  console.log(`    Effect Size: ${test.effectSize.toFixed(3)} (${test.effectSizeName})`);
  console.log(`    95% CI: [${test.ciLower.toFixed(3)}, ${test.ciUpper.toFixed(3)}]`);
  console.log(`    Conclusion: ${test.conclusion}`);
}

// Step 4: Generate Figures
console.log("\n── Step 4: Generate Figures ──");
const figDir = path.join(OUTPUT_DIR, "e1_stability", "figures");
const figurePaths = generateFigures(metrics, tests, figDir);
console.log(`  Generated ${figurePaths.length} figures:`);
for (const fp of figurePaths) {
  console.log(`    ${fp}`);
}

// Step 5: Generate Report
console.log("\n── Step 5: Generate Report ──");
const { mdPath, texPath, summary } = generateReport(metrics, tests, figurePaths, path.join(OUTPUT_DIR, "e1_stability"));
console.log(`  Markdown: ${mdPath}`);
console.log(`  LaTeX: ${texPath}`);
console.log(`  Summary: ${summary.slice(0, 200)}...`);

// Step 6: Campaign Summary
console.log("\n── Step 6: Campaign Summary ──");
const campaignSummary = summarizeCampaign([metrics], tests, allData.length, OUTPUT_DIR);
console.log(`  Summary: ${campaignSummary.totalExperiments} experiments, ${campaignSummary.totalRuns} runs`);
for (const c of campaignSummary.overallConclusions) {
  console.log(`    ${c}`);
}

// Verification
console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║   Pipeline Verification                                ║");
console.log("╚══════════════════════════════════════════════════════════╝");

const checks: Array<{ name: string; pass: boolean; detail: string }> = [
  {
    name: "Simulation",
    pass: allData.length === 4,
    detail: `${allData.length}/4 runs loaded`,
  },
  {
    name: "JSON Output",
    pass: fs.existsSync(path.join(OUTPUT_DIR, "e1_stability", "raw", "e1_stability_belief_seed42_run0.json")),
    detail: "Raw JSON files exist",
  },
  {
    name: "Metrics",
    pass: ss.perRunRatios.length > 0 && ss.stabilityRatio > 0,
    detail: `Stability Ratio = ${ss.stabilityRatio.toFixed(2)}, ${ss.perRunRatios.length} per-run ratios`,
  },
  {
    name: "Statistics",
    pass: tests.length > 0 && tests.every(t => t.pValue >= 0 && t.pValue <= 1 && t.ciLower !== t.ciUpper),
    detail: tests.length > 0
      ? `${tests.length} tests, p=${tests[0].pValue.toFixed(4)}, CI=[${tests[0].ciLower.toFixed(3)}, ${tests[0].ciUpper.toFixed(3)}]`
      : "No tests",
  },
  {
    name: "Figures",
    pass: figurePaths.length > 0,
    detail: `${figurePaths.length} figures`,
  },
  {
    name: "Report",
    pass: fs.existsSync(mdPath) && fs.existsSync(texPath),
    detail: "MD + LaTeX reports",
  },
  {
    name: "Campaign Summary",
    pass: fs.existsSync(path.join(OUTPUT_DIR, "campaign_summary.json")),
    detail: "Campaign summary JSON",
  },
];

let allPassed = true;
for (const check of checks) {
  const status = check.pass ? "✅" : "❌";
  console.log(`  ${status} ${check.name}: ${check.detail}`);
  if (!check.pass) allPassed = false;
}

if (allPassed) {
  console.log("\n  🎉 ALL CHECKS PASSED — Pipeline is ready!");
} else {
  console.log("\n  ⚠️  SOME CHECKS FAILED");
}

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║   Analysis Complete                                     ║");
console.log("╚══════════════════════════════════════════════════════════╝");