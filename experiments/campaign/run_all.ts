/**
 * SwarmAlpha Experimental Campaign — 一键运行入口
 *
 * 用法：
 *   npx tsx experiments/campaign/run_all.ts                          # 运行全部实验
 *   npx tsx experiments/campaign/run_all.ts --experiment=e1          # 仅运行 E1
 *   npx tsx experiments/campaign/run_all.ts --analyze-only           # 仅分析已有数据
 *   npx tsx experiments/campaign/run_all.ts --figures-only           # 仅生成图表
 *   npx tsx experiments/campaign/run_all.ts --resume                 # 断点续传
 *
 * 流水线：
 *   Scenario → Simulation → Metrics → Statistics → Visualization → Report → Summary
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

import { runExperiment, loadExperimentData } from "./pipeline/Runner";
import { computeMetrics } from "./pipeline/MetricComputer";
import { runTests, holmBonferroni } from "./pipeline/StatisticalTest";
import { generateFigures } from "./pipeline/FigureGenerator";
import { generateReport } from "./pipeline/ReportGenerator";
import { summarizeCampaign } from "./pipeline/CampaignSummarizer";
import type { ExperimentConfig, ExperimentMetrics, TestResult, RawRunData } from "./types";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";

// 导入所有主实验配置
import { E1_STABILITY, E1_VALIDATION_CROSS_TASK, E1_VALIDATION_AGENT_COUNT, E1_VALIDATION_CROSS_MODEL, E1_VALIDATION_TEMPERATURE } from "./configs/e1_stability";
import { E1_NATIVE } from "./configs/e1_native";
import { E1_NATIVE_LITE } from "./configs/e1_native_lite";
import { E2_EVIDENCE } from "./configs/e2_evidence";
import { E3_INERTIA } from "./configs/e3_inertia";
import { E4_CONFIDENCE } from "./configs/e4_confidence";
import { E5_GOVERNANCE } from "./configs/e5_governance";
import { E6_DECOUPLING } from "./configs/e6_decoupling";
import { E7_DETECTOR } from "./configs/e7_detector";
import { E8_SUSCEPTIBILITY } from "./configs/e8_susceptibility";
import { E9_ALL } from "./configs/e9_cognitive_governance";

// ============================================================================
// Configuration
// ============================================================================

const OUTPUT_DIR = path.resolve(__dirname, "output");

/** 主实验列表（按 Priority 排序） */
const MAIN_EXPERIMENTS: ExperimentConfig[] = [
  // Priority 1: Core Theory Validation
  E1_STABILITY,
  E1_NATIVE,  // v3.1: LLM 原生输出认知状态，替代旧 E1 的循环论证
  E1_NATIVE_LITE,  // v3.1 Lite: 精简版验证（6 runs，信号方向验证）
  E2_EVIDENCE,
  E6_DECOUPLING,
  // Priority 2: Governance Validation
  E5_GOVERNANCE,
  E8_SUSCEPTIBILITY,
  // Priority 2: Cognitive State Driven Governance (Phase 4B)
  ...E9_ALL,
  // Priority 3: Detector Validation
  E3_INERTIA,
  E7_DETECTOR,
  // Priority 4: Cross-Validation
  E4_CONFIDENCE,
];

/** 验证实验列表 */
const VALIDATION_EXPERIMENTS: ExperimentConfig[] = [
  ...E1_VALIDATION_CROSS_TASK,
  ...E1_VALIDATION_AGENT_COUNT,
  E1_VALIDATION_CROSS_MODEL,
  ...E1_VALIDATION_TEMPERATURE,
];

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliOptions {
  experiment?: string;
  analyzeOnly: boolean;
  figuresOnly: boolean;
  resume: boolean;
  verbose: boolean;
  seeds?: number[];
  model?: string;
}

function parseArgs(): CliOptions {
  // 预处理：将 --key=value 拆分为 --key value，统一两种写法
  const rawArgs = process.argv.slice(2);
  const args: string[] = [];
  for (const a of rawArgs) {
    const eqIdx = a.indexOf("=");
    if (eqIdx > 0 && a.startsWith("--")) {
      args.push(a.slice(0, eqIdx), a.slice(eqIdx + 1));
    } else {
      args.push(a);
    }
  }

  const opts: CliOptions = { analyzeOnly: false, figuresOnly: false, resume: false, verbose: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--experiment":
      case "-e":
        opts.experiment = args[++i];
        break;
      case "--analyze-only":
        opts.analyzeOnly = true;
        break;
      case "--figures-only":
        opts.figuresOnly = true;
        break;
      case "--resume":
        opts.resume = true;
        break;
      case "--verbose":
      case "-v":
        opts.verbose = true;
        break;
      case "--seeds":
        opts.seeds = args[++i]?.split(",").map(Number);
        break;
      case "--model":
        opts.model = args[++i];
        break;
    }
  }

  return opts;
}

// ============================================================================
// Pipeline Step Handlers
// ============================================================================

/** Step 2-3: 运行实验 */
async function runExperiments(
  configs: ExperimentConfig[],
  opts: CliOptions,
): Promise<Map<string, RawRunData[]>> {
  const allData = new Map<string, RawRunData[]>();

  for (const config of configs) {
    // 应用 CLI 覆盖
    let finalConfig = { ...config };
    if (opts.seeds) finalConfig.seeds = opts.seeds;
    if (opts.model) finalConfig.llmModel = opts.model;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`Running: ${config.id} — ${config.title}`);
    console.log(`  Hypothesis: ${config.hypothesis}`);
    console.log(`  Modes: ${config.runtimeModes.join(", ")}`);
    console.log(`  Seeds: ${config.seeds.join(", ")}`);
    console.log(`  Runs per seed: ${config.runsPerSeed}`);
    console.log(`${"=".repeat(60)}`);

    const data = await runExperiment(finalConfig, OUTPUT_DIR, {
      resume: opts.resume,
      verbose: opts.verbose,
    });
    allData.set(config.id, data);

    console.log(`  Completed ${config.id}: ${data.length} runs`);
  }

  return allData;
}

/** Step 4-5: 计算 Metrics + 运行 Tests */
function analyzeExperiments(
  allData: Map<string, RawRunData[]>,
): { metrics: ExperimentMetrics[]; tests: TestResult[] } {
  const allMetrics: ExperimentMetrics[] = [];
  const allTests: TestResult[] = [];

  for (const [expId, data] of allData) {
    if (data.length === 0) {
      console.log(`  Skipping ${expId}: no data`);
      continue;
    }

    console.log(`\n  Analyzing ${expId} (${data.length} runs)...`);

    // 统一通过 computeMetrics 分发：它内部按 expId 调用对应的专用计算函数
    // （computeE1Stability / computeE2Evidence / computeE6Decoupling 等），
    // 并统一附加 metrics.global（全局指标）。
    // 旧代码直接调用专用函数，跳过了 metrics.global 赋值，导致 E1/E2/E6 报告缺失全局数据。
    const metrics = computeMetrics(expId, data);

    allMetrics.push(metrics);

    // 保存 metrics
    const metricsPath = path.join(OUTPUT_DIR, expId, "metrics.json");
    fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
    fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));

    // 运行统计检验
    const tests = runTests(metrics);
    allTests.push(...tests);

    // 保存 tests
    const testsPath = path.join(OUTPUT_DIR, expId, "tests.json");
    fs.writeFileSync(testsPath, JSON.stringify(tests, null, 2));

    // 打印结果
    for (const test of tests) {
      const sig = test.significant ? "✅" : "❌";
      console.log(`    ${sig} ${test.testName}: p=${test.pValue.toFixed(4)}, ${test.effectSizeName}=${test.effectSize.toFixed(3)}`);
    }
  }

  // 批量 Holm-Bonferroni 校正（跨实验多重比较）
  // 修复前：runTests 内的校正因 results.length 永远 ≤ 1 而成为死代码
  // 修复后：在 analyzeExperiments 批量层应用，覆盖所有实验的假设检验
  // 注意：用 AND 逻辑保留原始显著性判定（E4/E5 的 CI 同号检查不能被覆盖）
  if (allTests.length > 1) {
    const rawPs = allTests.map(t => t.pValue);
    const adjusted = holmBonferroni(rawPs);
    const testByExp = new Map<string, TestResult[]>();
    for (let i = 0; i < allTests.length; i++) {
      allTests[i].pValueAdjusted = adjusted[i];
      // Holm 只增大 p 值：若原始不显著则保持不显著；若原始显著则看校正后是否仍 < 0.05
      allTests[i].significant = allTests[i].significant && adjusted[i] < 0.05;
      const expId = allTests[i].experimentId;
      if (!testByExp.has(expId)) testByExp.set(expId, []);
      testByExp.get(expId)!.push(allTests[i]);
    }
    // 重新保存校正后的 tests
    for (const [expId, expTests] of testByExp) {
      const testsPath = path.join(OUTPUT_DIR, expId, "tests.json");
      fs.writeFileSync(testsPath, JSON.stringify(expTests, null, 2));
    }
    console.log(`\n  Applied Holm-Bonferroni correction across ${allTests.length} hypotheses`);
  }

  return { metrics: allMetrics, tests: allTests };
}

/** Step 6-7: 生成图表 + 报告 */
function generateOutputs(
  allMetrics: ExperimentMetrics[],
  allTests: TestResult[],
): void {
  const testByExp = new Map<string, TestResult[]>();
  for (const t of allTests) {
    if (!testByExp.has(t.experimentId)) testByExp.set(t.experimentId, []);
    testByExp.get(t.experimentId)!.push(t);
  }

  for (const metrics of allMetrics) {
    const tests = testByExp.get(metrics.experimentId) || [];
    const figDir = path.join(OUTPUT_DIR, metrics.experimentId, "figures");

    console.log(`\n  Generating outputs for ${metrics.experimentId}...`);

    // 图表
    const figurePaths = generateFigures(metrics, tests, figDir);
    console.log(`    Generated ${figurePaths.length} figures`);

    // 报告
    const { mdPath, texPath, summary } = generateReport(metrics, tests, figurePaths, path.join(OUTPUT_DIR, metrics.experimentId));
    console.log(`    Report: ${mdPath}`);
    console.log(`    LaTeX: ${texPath}`);
    console.log(`    Summary: ${summary.slice(0, 100)}...`);
  }
}

/** Step 8: 战役摘要 */
function generateSummary(
  allMetrics: ExperimentMetrics[],
  allTests: TestResult[],
  totalRuns: number,
): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log("Generating Campaign Summary...");
  console.log(`${"=".repeat(60)}`);

  const summary = summarizeCampaign(allMetrics, allTests, totalRuns, OUTPUT_DIR);
  console.log(`\n  Summary: ${summary.totalExperiments} experiments, ${summary.totalRuns} runs`);
  console.log(`  Saved to: ${path.join(OUTPUT_DIR, "campaign_summary.md")}`);
  console.log(`\n  Overall Conclusions:`);
  for (const c of summary.overallConclusions) {
    console.log(`    ${c}`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const opts = parseArgs();

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   SwarmAlpha Experimental Campaign Pipeline v1.0        ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\n  Output: ${OUTPUT_DIR}`);
  console.log(`  Mode: ${opts.analyzeOnly ? "Analyze Only" : opts.figuresOnly ? "Figures Only" : "Full Pipeline"}`);
  console.log(`  Resume: ${opts.resume}`);

  // 选择实验
  let experiments = MAIN_EXPERIMENTS;
  if (opts.experiment) {
    const all = [...MAIN_EXPERIMENTS, ...VALIDATION_EXPERIMENTS];
    // 精确匹配优先；若未找到则前缀匹配（如 e1 → e1_stability）
    let found = all.filter(e => e.id === opts.experiment);
    if (found.length === 0) {
      found = all.filter(e => e.id.startsWith(opts.experiment!));
    }
    if (found.length === 0) {
      console.error(`Unknown experiment: ${opts.experiment}`);
      console.error(`Available: ${all.map(e => e.id).join(", ")}`);
      process.exit(1);
    }
    experiments = found;
  }

  console.log(`\n  Experiments: ${experiments.map(e => e.id).join(", ")}`);
  console.log(`  Total configs: ${experiments.length}`);

  // Step 1: 运行实验（或加载已有数据）
  let allData: Map<string, RawRunData[]>;

  if (opts.analyzeOnly || opts.figuresOnly) {
    console.log("\n  Loading existing data...");
    allData = new Map();
    for (const config of experiments) {
      const data = loadExperimentData(config.id, OUTPUT_DIR);
      allData.set(config.id, data);
      console.log(`    ${config.id}: ${data.length} runs loaded`);
    }
  } else {
    allData = await runExperiments(experiments, opts);
  }

  // Step 2: 分析
  const totalRuns = [...allData.values()].reduce((s, d) => s + d.length, 0);
  console.log(`\n  Total runs: ${totalRuns}`);

  if (!opts.figuresOnly) {
    const { metrics, tests } = analyzeExperiments(allData);

    // Step 3: 生成输出
    generateOutputs(metrics, tests);

    // Step 4: 战役摘要
    generateSummary(metrics, tests, totalRuns);
  } else {
    // 仅图表模式：加载已有 metrics 和 tests
    const allMetrics: ExperimentMetrics[] = [];
    const allTests: TestResult[] = [];

    for (const config of experiments) {
      const metricsPath = path.join(OUTPUT_DIR, config.id, "metrics.json");
      const testsPath = path.join(OUTPUT_DIR, config.id, "tests.json");

      if (fs.existsSync(metricsPath)) {
        const metrics = safeJsonParse<ExperimentMetrics>(fs.readFileSync(metricsPath, "utf-8"));
        if (metrics) allMetrics.push(metrics);
      }
      if (fs.existsSync(testsPath)) {
        const tests = safeJsonParse<TestResult[]>(fs.readFileSync(testsPath, "utf-8"));
        if (tests) allTests.push(...tests);
      }
    }

    generateOutputs(allMetrics, allTests);
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   Pipeline Complete!                                     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
}

main().catch(err => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});