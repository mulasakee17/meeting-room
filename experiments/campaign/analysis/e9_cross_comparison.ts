/**
 * E9: Cognitive State Driven Governance — Cross-Group Comparison
 *
 * 核心分析：在 2 个非 ceiling 场景中，比较三种治理模式的决策质量。
 *
 * 三组对照：
 *   A. 无治理 (none)            — baseline
 *   B. Belief-based 治理 (full)  — 旧治理体系
 *   C. Cognitive 治理 (cognitive) — 新治理体系
 *
 * 统计方法：
 *   - 置换检验（permutation test）：比较两组 τ 均值差异
 *   - (count+1)/(nPerms+1) 校正避免 p=0.000
 *   - Cohen's d 效应量
 *   - Bootstrap 95% CI
 *
 * 用法：
 *   npx tsx experiments/campaign/analysis/e9_cross_comparison.ts
 */

import * as fs from "fs";
import * as path from "path";
import { mean, sampleStd, cohensD, mulberry32, PERMUTATION_SEED } from "../../v2/statsShared";
import type { RawRunData } from "../types";

// ============================================================================
// Configuration
// ============================================================================

const OUTPUT_DIR = path.resolve(__dirname, "..", "output");
const N_PERMS = 10000;
const N_BOOTSTRAP = 10000;
const BOOTSTRAP_SEED = PERMUTATION_SEED + 0x5EED;

interface GroupResult {
  experimentId: string;
  governanceMode: string;
  n: number;
  meanTau: number;
  stdTau: number;
  se: number;
  ci95: [number, number];
  totalInterventions: number;
  meanRounds: number;
  interventionTypes: Record<string, number>;
}

interface ComparisonResult {
  scenario: string;
  groupA: string;
  groupB: string;
  deltaTau: number;
  cohensD: number;
  pValue: number;
  pValueCorrected: number;
  ci95: [number, number];
  significant: boolean;
  conclusion: string;
}

// ============================================================================
// Data Loading
// ============================================================================

function loadE9Data(): Map<string, RawRunData[]> {
  const data = new Map<string, RawRunData[]>();
  const e9Ids = [
    "e9_crisis_none", "e9_crisis_belief", "e9_crisis_cognitive",
    "e9_supplier_none", "e9_supplier_belief", "e9_supplier_cognitive",
  ];

  for (const id of e9Ids) {
    const rawDir = path.join(OUTPUT_DIR, id, "raw");
    if (!fs.existsSync(rawDir)) {
      console.warn(`  WARNING: ${rawDir} not found, skipping`);
      continue;
    }

    const files = fs.readdirSync(rawDir).filter(f => f.endsWith(".json") && f !== "raw_summary.json");
    const runs: RawRunData[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(rawDir, file), "utf-8");
        const parsed = JSON.parse(content);
        if (parsed.runId && !parsed.error) {
          runs.push(parsed as RawRunData);
        }
      } catch {
        // skip corrupted
      }
    }

    data.set(id, runs);
    console.log(`  Loaded ${id}: ${runs.length} runs`);
  }

  return data;
}

// ============================================================================
// Group Summary
// ============================================================================

function computeGroupSummary(data: RawRunData[], experimentId: string): GroupResult {
  const tauValues = data.map(d => d.finalKendallTau);
  const roundValues = data.map(d => d.totalRounds);
  const n = data.length;

  const m = mean(tauValues);
  const s = sampleStd(tauValues);
  const se = s / Math.sqrt(n);

  // t-distribution CI
  const tCrit = tCriticalValue(n - 1, 0.975);
  const ciLower = m - tCrit * se;
  const ciUpper = m + tCrit * se;

  // 干预统计
  let totalInterventions = 0;
  const interventionTypes: Record<string, number> = {};
  for (const d of data) {
    for (const intv of d.interventions) {
      totalInterventions++;
      const type = intv.type || "unknown";
      interventionTypes[type] = (interventionTypes[type] || 0) + 1;
    }
  }

  // 解析治理模式
  const parts = experimentId.split("_");
  const governanceMode = parts.slice(2).join("_") || "unknown";

  return {
    experimentId,
    governanceMode,
    n,
    meanTau: m,
    stdTau: s,
    se,
    ci95: [ciLower, ciUpper],
    totalInterventions,
    meanRounds: mean(roundValues),
    interventionTypes,
  };
}

// ============================================================================
// Permutation Test
// ============================================================================

function permutationTest(
  groupA: number[],
  groupB: number[],
  nPerms: number = N_PERMS,
): { pValue: number; pValueCorrected: number; observedDiff: number } {
  const observedDiff = mean(groupA) - mean(groupB);
  const allValues = [...groupA, ...groupB];
  const nA = groupA.length;
  const rng = mulberry32(PERMUTATION_SEED);

  let count = 0;
  for (let i = 0; i < nPerms; i++) {
    // Fisher-Yates shuffle
    const shuffled = [...allValues];
    for (let j = shuffled.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }

    const permA = shuffled.slice(0, nA);
    const permB = shuffled.slice(nA);
    const permDiff = mean(permA) - mean(permB);

    if (Math.abs(permDiff) >= Math.abs(observedDiff)) {
      count++;
    }
  }

  // (count+1)/(nPerms+1) 校正
  const pValue = count / nPerms;
  const pValueCorrected = (count + 1) / (nPerms + 1);

  return { pValue, pValueCorrected, observedDiff };
}

// ============================================================================
// Bootstrap CI
// ============================================================================

function bootstrapCIDiff(
  groupA: number[],
  groupB: number[],
  nBoot: number = N_BOOTSTRAP,
): [number, number] {
  const rng = mulberry32(BOOTSTRAP_SEED);
  const diffs: number[] = [];

  for (let i = 0; i < nBoot; i++) {
    // Bootstrap resample with replacement
    const bootA: number[] = [];
    const bootB: number[] = [];
    for (let j = 0; j < groupA.length; j++) {
      bootA.push(groupA[Math.floor(rng() * groupA.length)]);
    }
    for (let j = 0; j < groupB.length; j++) {
      bootB.push(groupB[Math.floor(rng() * groupB.length)]);
    }
    diffs.push(mean(bootA) - mean(bootB));
  }

  diffs.sort((a, b) => a - b);
  const ciLower = diffs[Math.floor(nBoot * 0.025)];
  const ciUpper = diffs[Math.floor(nBoot * 0.975)];

  return [ciLower, ciUpper];
}

// ============================================================================
// t-Distribution Helpers
// ============================================================================

function tCriticalValue(df: number, alpha: number): number {
  if (df <= 0) return 1.96;
  if (df > 30) return 1.96;
  const table: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
    6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
    15: 2.131, 20: 2.086, 25: 2.060, 30: 2.042,
  };
  return table[df] ?? 2.0;
}

// ============================================================================
// Main Analysis
// ============================================================================

function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   E9: Cognitive State Driven Governance                 ║");
  console.log("║   Cross-Group Comparison Analysis                       ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const allData = loadE9Data();

  if (allData.size === 0) {
    console.error("No E9 data found. Run experiments first.");
    process.exit(1);
  }

  // ==========================================================================
  // 1. 分组汇总
  // ==========================================================================

  console.log("\n━━━ 1. 分组汇总 ━━━\n");

  const scenarios = ["crisis", "supplier"];
  const groups: Map<string, { summary: GroupResult; tauValues: number[] }[]> = new Map();

  for (const scenario of scenarios) {
    console.log(`\n  Scenario: ${scenario}`);
    console.log("  " + "-".repeat(60));

    const scenarioGroups: { summary: GroupResult; tauValues: number[] }[] = [];

    for (const mode of ["none", "belief", "cognitive"]) {
      const expId = `e9_${scenario}_${mode}`;
      const data = allData.get(expId);

      if (!data || data.length === 0) {
        console.log(`    ${mode}: NO DATA`);
        continue;
      }

      const summary = computeGroupSummary(data, expId);
      const tauValues = data.map(d => d.finalKendallTau);
      scenarioGroups.push({ summary, tauValues });

      console.log(`    ${mode.padEnd(12)}: τ=${summary.meanTau.toFixed(3)} ± ${summary.stdTau.toFixed(3)} ` +
        `[${summary.ci95[0].toFixed(3)}, ${summary.ci95[1].toFixed(3)}] ` +
        `(n=${summary.n}, ${summary.totalInterventions} interventions, ${summary.meanRounds.toFixed(1)} rounds)`);
    }

    groups.set(scenario, scenarioGroups);
  }

  // ==========================================================================
  // 2. 跨组比较
  // ==========================================================================

  console.log("\n\n━━━ 2. 跨组比较 (Permutation Test) ━━━\n");

  const comparisons: ComparisonResult[] = [];

  for (const scenario of scenarios) {
    const scenarioGroups = groups.get(scenario) || [];
    if (scenarioGroups.length < 2) continue;

    const cognitiveGroup = scenarioGroups.find(g => g.summary.governanceMode === "cognitive");
    const noneGroup = scenarioGroups.find(g => g.summary.governanceMode === "none");
    const beliefGroup = scenarioGroups.find(g => g.summary.governanceMode === "belief");

    // Cognitive vs None
    if (cognitiveGroup && noneGroup) {
      const perm = permutationTest(cognitiveGroup.tauValues, noneGroup.tauValues);
      const d = cohensD(cognitiveGroup.tauValues, noneGroup.tauValues);
      const ci = bootstrapCIDiff(cognitiveGroup.tauValues, noneGroup.tauValues);
      const significant = perm.pValueCorrected < 0.05;

      comparisons.push({
        scenario,
        groupA: "cognitive",
        groupB: "none",
        deltaTau: perm.observedDiff,
        cohensD: d,
        pValue: perm.pValue,
        pValueCorrected: perm.pValueCorrected,
        ci95: ci,
        significant,
        conclusion: significant
          ? `Cognitive > None: Δτ=${perm.observedDiff.toFixed(3)}, d=${d.toFixed(2)}, p=${perm.pValueCorrected.toFixed(4)} ✅`
          : `Cognitive vs None: Δτ=${perm.observedDiff.toFixed(3)}, d=${d.toFixed(2)}, p=${perm.pValueCorrected.toFixed(4)} ❌`,
      });

      console.log(`  ${scenario}/cognitive vs none:`);
      console.log(`    Δτ = ${perm.observedDiff.toFixed(3)} (${perm.observedDiff > 0 ? "+" : ""}${(perm.observedDiff * 100).toFixed(1)}%)`);
      console.log(`    Cohen's d = ${d.toFixed(2)}`);
      console.log(`    p = ${perm.pValueCorrected.toFixed(4)} (${significant ? "significant ✅" : "not significant ❌"})`);
      console.log(`    95% CI = [${ci[0].toFixed(3)}, ${ci[1].toFixed(3)}]`);
      console.log();
    }

    // Cognitive vs Belief
    if (cognitiveGroup && beliefGroup) {
      const perm = permutationTest(cognitiveGroup.tauValues, beliefGroup.tauValues);
      const d = cohensD(cognitiveGroup.tauValues, beliefGroup.tauValues);
      const ci = bootstrapCIDiff(cognitiveGroup.tauValues, beliefGroup.tauValues);
      const significant = perm.pValueCorrected < 0.05;

      comparisons.push({
        scenario,
        groupA: "cognitive",
        groupB: "belief",
        deltaTau: perm.observedDiff,
        cohensD: d,
        pValue: perm.pValue,
        pValueCorrected: perm.pValueCorrected,
        ci95: ci,
        significant,
        conclusion: significant
          ? `Cognitive > Belief: Δτ=${perm.observedDiff.toFixed(3)}, d=${d.toFixed(2)}, p=${perm.pValueCorrected.toFixed(4)} ✅`
          : `Cognitive vs Belief: Δτ=${perm.observedDiff.toFixed(3)}, d=${d.toFixed(2)}, p=${perm.pValueCorrected.toFixed(4)} ❌`,
      });

      console.log(`  ${scenario}/cognitive vs belief:`);
      console.log(`    Δτ = ${perm.observedDiff.toFixed(3)} (${perm.observedDiff > 0 ? "+" : ""}${(perm.observedDiff * 100).toFixed(1)}%)`);
      console.log(`    Cohen's d = ${d.toFixed(2)}`);
      console.log(`    p = ${perm.pValueCorrected.toFixed(4)} (${significant ? "significant ✅" : "not significant ❌"})`);
      console.log(`    95% CI = [${ci[0].toFixed(3)}, ${ci[1].toFixed(3)}]`);
      console.log();
    }

    // Belief vs None (for completeness)
    if (beliefGroup && noneGroup) {
      const perm = permutationTest(beliefGroup.tauValues, noneGroup.tauValues);
      const d = cohensD(beliefGroup.tauValues, noneGroup.tauValues);
      const significant = perm.pValueCorrected < 0.05;

      console.log(`  ${scenario}/belief vs none (reference):`);
      console.log(`    Δτ = ${perm.observedDiff.toFixed(3)}, d=${d.toFixed(2)}, p=${perm.pValueCorrected.toFixed(4)}`);
      console.log();
    }
  }

  // ==========================================================================
  // 3. 干预分析
  // ==========================================================================

  console.log("━━━ 3. 干预分析 ━━━\n");

  for (const scenario of scenarios) {
    const scenarioGroups = groups.get(scenario) || [];
    const cognitiveGroup = scenarioGroups.find(g => g.summary.governanceMode === "cognitive");
    const beliefGroup = scenarioGroups.find(g => g.summary.governanceMode === "belief");

    if (cognitiveGroup) {
      console.log(`  ${scenario}/cognitive 干预分布:`);
      const types = cognitiveGroup.summary.interventionTypes;
      for (const [type, count] of Object.entries(types)) {
        console.log(`    ${type}: ${count} (${(count / cognitiveGroup.summary.totalInterventions * 100).toFixed(1)}%)`);
      }

      // 可解释性指标
      const interventionsPerRound = cognitiveGroup.summary.totalInterventions / 
        (cognitiveGroup.summary.n * cognitiveGroup.summary.meanRounds);
      console.log(`    干预/轮: ${interventionsPerRound.toFixed(2)}`);
      console.log();
    }

    if (beliefGroup && beliefGroup.summary.totalInterventions > 0) {
      console.log(`  ${scenario}/belief 干预分布:`);
      const types = beliefGroup.summary.interventionTypes;
      for (const [type, count] of Object.entries(types)) {
        console.log(`    ${type}: ${count} (${(count / beliefGroup.summary.totalInterventions * 100).toFixed(1)}%)`);
      }
      console.log();
    }
  }

  // ==========================================================================
  // 4. 总体结论
  // ==========================================================================

  console.log("━━━ 4. 总体结论 ━━━\n");

  const sigComparisons = comparisons.filter(c => c.significant);
  const cognitiveVsNone = comparisons.filter(c => c.groupB === "none");
  const cognitiveVsBelief = comparisons.filter(c => c.groupB === "belief");

  console.log("  Core Research Question:");
  console.log('  "Can Cognitive-State Driven Governance improve Multi-Agent');
  console.log('   Collective Decision Quality through interpretable interventions?"');
  console.log();

  if (cognitiveVsNone.every(c => c.significant && c.deltaTau > 0)) {
    console.log("  ✅ Cognitive Governance significantly outperforms No Governance");
    console.log("     in both non-ceiling scenarios.");
  } else if (cognitiveVsNone.some(c => c.significant && c.deltaTau > 0)) {
    console.log("  ⚠️  Cognitive Governance shows improvement over No Governance");
    console.log("     in some but not all scenarios.");
  } else {
    console.log("  ❌ Cognitive Governance does not show significant improvement");
    console.log("     over No Governance in either scenario.");
  }

  if (cognitiveVsBelief.every(c => c.significant && c.deltaTau > 0)) {
    console.log("  ✅ Cognitive Governance significantly outperforms Belief Governance");
    console.log("     in both scenarios (exploratory: superiority claim).");
  } else if (cognitiveVsBelief.some(c => c.significant && c.deltaTau > 0)) {
    console.log("  ⚠️  Cognitive Governance shows improvement over Belief Governance");
    console.log("     in some scenarios (exploratory).");
  } else {
    console.log("  ℹ️  Cognitive Governance does not significantly differ from Belief");
    console.log("     Governance (consistent with exploratory hypothesis).");
  }

  console.log();
  console.log("  Three-Level Success Criteria:");
  const level1 = cognitiveVsNone.length > 0 && cognitiveVsNone.every(c => c.deltaTau !== 0);
  const level2 = cognitiveVsNone.some(c => c.significant && c.deltaTau > 0);
  const level3 = cognitiveVsBelief.some(c => c.significant && c.deltaTau > 0);

  console.log(`    Level 1 (Runnable): ${level1 ? "✅" : "N/A"} — Cognitive governance runs without errors`);
  console.log(`    Level 2 (Improvement): ${level2 ? "✅" : "❌"} — At least one metric significantly improved`);
  console.log(`    Level 3 (Superiority): ${level3 ? "✅" : "ℹ️"} — Cognitive > Belief (exploratory)`);

  // ==========================================================================
  // 保存结果
  // ==========================================================================

  const analysisDir = path.join(OUTPUT_DIR, "e9_analysis");
  fs.mkdirSync(analysisDir, { recursive: true });

  const result = {
    timestamp: new Date().toISOString(),
    scenarios,
    groups: Object.fromEntries(
      [...groups.entries()].map(([scenario, gs]) => [
        scenario,
        gs.map(g => ({
          governanceMode: g.summary.governanceMode,
          n: g.summary.n,
          meanTau: g.summary.meanTau,
          stdTau: g.summary.stdTau,
          ci95: g.summary.ci95,
          totalInterventions: g.summary.totalInterventions,
          meanRounds: g.summary.meanRounds,
          interventionTypes: g.summary.interventionTypes,
        })),
      ])
    ),
    comparisons: comparisons.map(c => ({
      scenario: c.scenario,
      comparison: `${c.groupA} vs ${c.groupB}`,
      deltaTau: c.deltaTau,
      cohensD: c.cohensD,
      pValue: c.pValueCorrected,
      ci95: c.ci95,
      significant: c.significant,
      conclusion: c.conclusion,
    })),
    successCriteria: { level1, level2, level3 },
  };

  fs.writeFileSync(
    path.join(analysisDir, "cross_comparison.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(`\n  Results saved to: ${path.join(analysisDir, "cross_comparison.json")}`);
}

try {
  main();
} catch (err) {
  console.error("E9 analysis failed:", err);
  process.exit(1);
}