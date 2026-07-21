/**
 * 交叉质证实验分析脚本
 *
 * 分析 A/B/C/D 四组实验数据，回答：
 *   RQ1: 交叉质证（C组）是否比基线（A组）提升了决策质量（τ）？
 *   RQ2: 交叉质证（C组）是否比传统治理（B组）更有效？
 *   RQ3: 质证+治理（D组）是否有协同效应？
 *   RQ4: 交叉质证的激活率是多少？激活后的信念移位幅度？
 *
 * 统计方法：
 *   - 置换检验（PERMUTATION_SEED=42，nPerm=10000，(count+1)/(nPerm+1) 校正）
 *   - Cohen's d 效应量
 *   - 95% t 分布置信区间
 *
 * 用法: npx tsx experiments/v2/analyze_cross_exam.ts
 */

import * as fs from "fs";
import * as path from "path";
import { mean, sampleStd, cohensD, mulberry32, PERMUTATION_SEED } from "./statsShared";

// ============================================================================
// 类型
// ============================================================================

interface CrossExamResult {
  runId: string;
  group: string;
  runIndex: number;
  kendallTau: number;
  decisionQuality: number;
  consensusR: number;
  finalBeliefStd: number;
  converged: boolean;
  totalRounds: number;
  crossExamActivated: boolean;
  divergenceIndex: number;
  crossExamRounds: number;
  avgBeliefShift: number;
  dissentPreserved: boolean;
  consensusPointsCount: number;
  minorityReportCount: number;
  governanceIssuesDetected: string[];
  totalInterventions: number;
}

// ============================================================================
// 数据加载
// ============================================================================

function loadGroup(group: string, dataDir: string): CrossExamResult[] {
  const dir = path.resolve(__dirname, dataDir);
  if (!fs.existsSync(dir)) {
    console.warn(`  Warning: directory ${dir} does not exist`);
    return [];
  }
  const files = fs.readdirSync(dir).filter(
    f => f.endsWith(".json") && f.includes(`_${group}_`),
  );
  return files.map(f => {
    const content = fs.readFileSync(path.join(dir, f), "utf-8");
    return JSON.parse(content) as CrossExamResult;
  });
}

// ============================================================================
// 统计工具
// ============================================================================

/** 置换检验（两组均值差异） */
function permutationTest(
  groupA: number[],
  groupB: number[],
  nPerm = 10000,
): { pValue: number; observedDiff: number } {
  const observedDiff = mean(groupA) - mean(groupB);
  const combined = [...groupA, ...groupB];
  const nA = groupA.length;
  const rng = mulberry32(PERMUTATION_SEED);

  let count = 0;
  for (let i = 0; i < nPerm; i++) {
    // Fisher-Yates shuffle（使用确定性 PRNG）
    for (let j = combined.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [combined[j], combined[k]] = [combined[k], combined[j]];
    }
    const permA = combined.slice(0, nA);
    const permB = combined.slice(nA);
    const permDiff = mean(permA) - mean(permB);
    if (Math.abs(permDiff) >= Math.abs(observedDiff)) {
      count++;
    }
  }

  // (count+1)/(nPerm+1) 校正，避免 p=0
  const pValue = (count + 1) / (nPerm + 1);
  return { pValue, observedDiff };
}

/** t 临界值（双侧，近似表，df=1-30） */
const T_CRITICAL_05: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
  6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
  16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
  21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
  26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
};

function tCritical(df: number): number {
  if (df <= 0) return NaN;
  if (df <= 30) return T_CRITICAL_05[df] ?? 2.042;
  // 大样本近似
  if (df < 60) return 2.021;
  if (df < 120) return 1.980;
  return 1.960;
}

/** 95% 置信区间（t 分布） */
function ci95(values: number[]): { lower: number; upper: number; mean: number; sem: number } {
  const n = values.length;
  const m = mean(values);
  if (n < 2) return { lower: m, upper: m, mean: m, sem: 0 };
  const s = sampleStd(values);
  const sem = s / Math.sqrt(n);
  const tcrit = tCritical(n - 1);
  return {
    lower: m - tcrit * sem,
    upper: m + tcrit * sem,
    mean: m,
    sem,
  };
}

// ============================================================================
// 分析
// ============================================================================

function analyze() {
  const dataDir = "data_cross_exam";
  console.log("=".repeat(70));
  console.log("  Cross-Examination Experiment Analysis");
  console.log("=".repeat(70));

  const groups = {
    A: loadGroup("A", dataDir),
    B: loadGroup("B", dataDir),
    C: loadGroup("C", dataDir),
    D: loadGroup("D", dataDir),
  };

  console.log(`\n  Data loaded:`);
  for (const [g, data] of Object.entries(groups)) {
    console.log(`    Group ${g}: n=${data.length}`);
  }

  // ── 描述性统计 ──────────────────────────────────────────────────
  console.log(`\n${"=".repeat(70)}`);
  console.log("  Descriptive Statistics");
  console.log("=".repeat(70));

  const groupLabels: Record<string, string> = {
    A: "A (baseline)",
    B: "B (governance)",
    C: "C (cross-exam)",
    D: "D (cross-exam+gov)",
  };

  const header = "  Group                     n   τ mean   τ std             τ 95%CI   R mean  conv%";
  console.log(`\n${header}`);
  console.log(`  ${"-".repeat(80)}`);

  const tauByGroup: Record<string, number[]> = {};
  for (const [g, data] of Object.entries(groups)) {
    const taus = data.map(d => d.kendallTau);
    const rs = data.map(d => d.consensusR);
    const convRate = data.length > 0 ? data.filter(d => d.converged).length / data.length * 100 : 0;
    const ci = ci95(taus);
    tauByGroup[g] = taus;
    const ciStr = `[${ci.lower.toFixed(3)}, ${ci.upper.toFixed(3)}]`;
    console.log(
      `  ${groupLabels[g].padEnd(22)} ${String(data.length).padStart(3)} `
      + `${mean(taus).toFixed(3).padStart(8)} ${sampleStd(taus).toFixed(3).padStart(8)} `
      + `${ciStr.padStart(20)} `
      + `${mean(rs).toFixed(3).padStart(8)} ${convRate.toFixed(0).padStart(5)}%`,
    );
  }

  // ── RQ1: C vs A — 交叉质证是否提升决策质量？ ──────────────────
  console.log(`\n${"=".repeat(70)}`);
  console.log("  RQ1: Cross-Examination (C) vs Baseline (A)");
  console.log("=".repeat(70));

  if (groups.A.length > 0 && groups.C.length > 0) {
    const { pValue, observedDiff } = permutationTest(tauByGroup.C, tauByGroup.A);
    const d = cohensD(tauByGroup.C, tauByGroup.A);
    const ciC = ci95(tauByGroup.C);
    const ciA = ci95(tauByGroup.A);

    console.log(`\n    C: τ = ${mean(tauByGroup.C).toFixed(3)} ± ${sampleStd(tauByGroup.C).toFixed(3)} (95% CI: [${ciC.lower.toFixed(3)}, ${ciC.upper.toFixed(3)}])`);
    console.log(`    A: τ = ${mean(tauByGroup.A).toFixed(3)} ± ${sampleStd(tauByGroup.A).toFixed(3)} (95% CI: [${ciA.lower.toFixed(3)}, ${ciA.upper.toFixed(3)}])`);
    console.log(`    Δτ = ${observedDiff.toFixed(3)}, Cohen's d = ${d.toFixed(3)}`);
    console.log(`    Permutation p = ${pValue.toFixed(4)} (n=${groups.C.length+groups.A.length}, nPerm=10000)`);
    console.log(`    ${pValue < 0.05 ? "✅ Significant (p<0.05)" : "❌ Not significant (p≥0.05)"}`);
  }

  // ── RQ2: C vs B — 交叉质证 vs 传统治理 ──────────────────────────
  console.log(`\n${"=".repeat(70)}`);
  console.log("  RQ2: Cross-Examination (C) vs Traditional Governance (B)");
  console.log("=".repeat(70));

  if (groups.B.length > 0 && groups.C.length > 0) {
    const { pValue, observedDiff } = permutationTest(tauByGroup.C, tauByGroup.B);
    const d = cohensD(tauByGroup.C, tauByGroup.B);

    console.log(`\n    C: τ = ${mean(tauByGroup.C).toFixed(3)} ± ${sampleStd(tauByGroup.C).toFixed(3)}`);
    console.log(`    B: τ = ${mean(tauByGroup.B).toFixed(3)} ± ${sampleStd(tauByGroup.B).toFixed(3)}`);
    console.log(`    Δτ = ${observedDiff.toFixed(3)}, Cohen's d = ${d.toFixed(3)}`);
    console.log(`    Permutation p = ${pValue.toFixed(4)}`);
    console.log(`    ${pValue < 0.05 ? "✅ Significant (p<0.05)" : "❌ Not significant (p≥0.05)"}`);
  }

  // ── RQ3: D vs B — 质证+治理 是否有协同效应？ ──────────────────
  console.log(`\n${"=".repeat(70)}`);
  console.log("  RQ3: Cross-Exam + Governance (D) vs Governance Only (B)");
  console.log("=".repeat(70));

  if (groups.B.length > 0 && groups.D.length > 0) {
    const { pValue, observedDiff } = permutationTest(tauByGroup.D, tauByGroup.B);
    const d = cohensD(tauByGroup.D, tauByGroup.B);

    console.log(`\n    D: τ = ${mean(tauByGroup.D).toFixed(3)} ± ${sampleStd(tauByGroup.D).toFixed(3)}`);
    console.log(`    B: τ = ${mean(tauByGroup.B).toFixed(3)} ± ${sampleStd(tauByGroup.B).toFixed(3)}`);
    console.log(`    Δτ = ${observedDiff.toFixed(3)}, Cohen's d = ${d.toFixed(3)}`);
    console.log(`    Permutation p = ${pValue.toFixed(4)}`);
    console.log(`    ${pValue < 0.05 ? "✅ Significant (p<0.05)" : "❌ Not significant (p≥0.05)"}`);
  }

  // ── RQ4: 交叉质证激活率与信念移位 ──────────────────────────────
  console.log(`\n${"=".repeat(70)}`);
  console.log("  RQ4: Cross-Examination Activation & Belief Shift");
  console.log("=".repeat(70));

  for (const g of ["C", "D"] as const) {
    const data = groups[g];
    if (data.length === 0) continue;

    const activated = data.filter(d => d.crossExamActivated);
    const activationRate = activated.length / data.length * 100;
    const shifts = activated.map(d => d.avgBeliefShift);
    const dissentCount = activated.filter(d => d.dissentPreserved).length;
    const consensusPoints = activated.map(d => d.consensusPointsCount);
    const minorityReports = activated.map(d => d.minorityReportCount);

    console.log(`\n    Group ${g}:`);
    console.log(`      Activation rate: ${activationRate.toFixed(0)}% (${activated.length}/${data.length})`);
    if (activated.length > 0) {
      console.log(`      Avg divergence index: ${mean(activated.map(d => d.divergenceIndex)).toFixed(3)}`);
      console.log(`      Avg belief shift: ${mean(shifts).toFixed(3)} ± ${sampleStd(shifts).toFixed(3)}`);
      console.log(`      Dissent preserved: ${dissentCount}/${activated.length} (${dissentCount/activated.length*100}%)`);
      console.log(`      Avg consensus points: ${mean(consensusPoints).toFixed(1)}`);
      console.log(`      Avg minority reports: ${mean(minorityReports).toFixed(1)}`);
    }
  }

  // ── 共识-质量相关性 ──────────────────────────────────────────────
  console.log(`\n${"=".repeat(70)}`);
  console.log("  Consensus-Quality Decoupling Check");
  console.log("=".repeat(70));

  const allData = [...groups.A, ...groups.B, ...groups.C, ...groups.D];
  if (allData.length > 0) {
    const taus = allData.map(d => d.kendallTau);
    const rs = allData.map(d => d.consensusR);
    const tauMean = mean(taus);
    const rMean = mean(rs);
    const numerator = allData.reduce((s, d) => s + (d.kendallTau - tauMean) * (d.consensusR - rMean), 0);
    const denomTau = Math.sqrt(allData.reduce((s, d) => s + Math.pow(d.kendallTau - tauMean, 2), 0));
    const denomR = Math.sqrt(allData.reduce((s, d) => s + Math.pow(d.consensusR - rMean, 2), 0));
    const corr = denomTau * denomR > 0 ? numerator / (denomTau * denomR) : 0;

    console.log(`\n    Pearson r(τ, R) = ${corr.toFixed(3)} (n=${allData.length})`);
    console.log(`    ${Math.abs(corr) < 0.2 ? "→ Confirms consensus-quality decoupling (|r|<0.2)" : "→ Correlation detected (|r|≥0.2)"}`);
  }

  // ── 治理开销对比 ──────────────────────────────────────────────────
  console.log(`\n${"=".repeat(70)}`);
  console.log("  Governance Overhead");
  console.log("=".repeat(70));

  for (const [g, data] of Object.entries(groups)) {
    if (data.length === 0) continue;
    const interventions = data.map(d => d.totalInterventions);
    const issues = data.flatMap(d => d.governanceIssuesDetected);
    const uniqueIssues = Array.from(new Set(issues));
    console.log(`\n    Group ${g}:`);
    console.log(`      Avg interventions: ${mean(interventions).toFixed(1)} ± ${sampleStd(interventions).toFixed(1)}`);
    console.log(`      Unique issues detected: [${uniqueIssues.join(", ") || "none"}]`);
  }

  // ── 总结 ──────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(70)}`);
  console.log("  Summary");
  console.log("=".repeat(70));

  const aTau = groups.A.length > 0 ? mean(tauByGroup.A).toFixed(3) : "N/A";
  const bTau = groups.B.length > 0 ? mean(tauByGroup.B).toFixed(3) : "N/A";
  const cTau = groups.C.length > 0 ? mean(tauByGroup.C).toFixed(3) : "N/A";
  const dTau = groups.D.length > 0 ? mean(tauByGroup.D).toFixed(3) : "N/A";

  console.log(`\n    A (baseline):          τ = ${aTau}`);
  console.log(`    B (governance):        τ = ${bTau}`);
  console.log(`    C (cross-exam):       τ = ${cTau}`);
  console.log(`    D (cross-exam+gov):   τ = ${dTau}`);
  console.log(`\n    Key findings:`);

  if (groups.A.length > 0 && groups.C.length > 0) {
    const dCA = mean(tauByGroup.C) - mean(tauByGroup.A);
    console.log(`    • C - A (cross-exam effect):      Δτ = ${dCA > 0 ? "+" : ""}${dCA.toFixed(3)}`);
  }
  if (groups.B.length > 0 && groups.C.length > 0) {
    const dCB = mean(tauByGroup.C) - mean(tauByGroup.B);
    console.log(`    • C - B (cross-exam vs gov):      Δτ = ${dCB > 0 ? "+" : ""}${dCB.toFixed(3)}`);
  }
  if (groups.B.length > 0 && groups.D.length > 0) {
    const dDB = mean(tauByGroup.D) - mean(tauByGroup.B);
    console.log(`    • D - B (synergy effect):        Δτ = ${dDB > 0 ? "+" : ""}${dDB.toFixed(3)}`);
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("  Analysis complete.");
  console.log("=".repeat(70));
}

analyze();
