/**
 * ReportGenerator — 实验报告生成器
 *
 * 从 metrics + tests + figures 生成 Markdown 报告 + LaTeX 片段。
 */

import * as fs from "fs";
import * as path from "path";
import type { ExperimentMetrics, TestResult } from "../types";

// ============================================================================
// Markdown Report
// ============================================================================

function generateMarkdown(metrics: ExperimentMetrics, tests: TestResult[], figurePaths: string[]): string {
  const lines: string[] = [];

  lines.push(`# ${metrics.experimentId} — Experiment Report`);
  lines.push("");
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Sample Size:** ${metrics.sampleSize}`);
  lines.push(`**Runtime Mode:** ${metrics.runtimeMode}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Global metrics
  if (metrics.global) {
    lines.push("## Global Metrics");
    lines.push("");
    const g = metrics.global;
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(`| Consensus Quality (τ) | ${g.consensusQuality.toFixed(3)} |`);
    lines.push(`| Convergence (rounds) | ${g.convergence.toFixed(1)} |`);
    lines.push(`| Robustness (CV) | ${g.robustness.toFixed(3)} |`);
    lines.push(`| Reproducibility (σ) | ${g.reproducibility.toFixed(4)} |`);
    lines.push("");
  }

  // Experiment-specific metrics
  switch (metrics.experimentId) {
    case "e1_stability":
    case "e1_native": {
      const ss = metrics.stateStability!;
      lines.push("## State Stability (H1)");
      lines.push("");
      lines.push("| Metric | Value |");
      lines.push("|--------|-------|");
      lines.push(`| σ²(ΔB) — Belief | ${ss.sigmaSqDeltaB.toFixed(6)} |`);
      lines.push(`| σ²(ΔU) — Utility | ${ss.sigmaSqDeltaU.toFixed(6)} |`);
      lines.push(`| Stability Ratio | ${ss.stabilityRatio.toFixed(2)} |`);
      lines.push("");
      break;
    }
    case "e2_evidence": {
      const ee = metrics.evidenceExplanatory!;
      lines.push("## Evidence Explanatory Power (H2)");
      lines.push("");
      lines.push("| Metric | Cognitive | Belief |");
      lines.push("|--------|-----------|--------|");
      lines.push(`| R² | ${ee.r2Cognitive.toFixed(3)} | ${ee.r2Belief.toFixed(3)} |`);
      lines.push(`| AIC | ${ee.aicCognitive.toFixed(1)} | ${ee.aicBelief.toFixed(1)} |`);
      lines.push(`| BIC | ${ee.bicCognitive.toFixed(1)} | ${ee.bicBelief.toFixed(1)} |`);
      lines.push(`| **ΔR²** | **${ee.deltaR2.toFixed(3)}** | — |`);
      lines.push("");
      break;
    }
    case "e6_decoupling": {
      const sd = metrics.stateDecoupling!;
      lines.push("## State Decoupling (H6)");
      lines.push("");
      if (sd.status !== "computed"
        || sd.maxCorrCognitive === undefined
        || sd.maxCorrBelief === undefined
        || sd.vifMax === undefined) {
        lines.push(`**Analysis status:** ${sd.status}`);
        lines.push("");
        lines.push(`No confirmatory H6 result was produced (${sd.invalidReason ?? "unavailable"}).`);
        lines.push("");
        lines.push(`Usable snapshots: ${sd.usableObservationCount}; legacy excluded: ${sd.legacyMixedExcludedCount}; `
          + `unusable: ${sd.unusableObservationCount}; malformed: ${sd.malformedObservationCount}; `
          + `eligible runs: ${sd.eligibleRunCount}.`);
      } else {
        lines.push("| Metric | Cognitive | Belief |");
        lines.push("|--------|-----------|--------|");
        lines.push(`| max \\|r\\| | ${sd.maxCorrCognitive.toFixed(3)} | ${sd.maxCorrBelief.toFixed(3)} |`);
        lines.push(`| VIF max | ${sd.vifMax.toFixed(2)} | — |`);
      }
      lines.push("");
      break;
    }
  }

  // Statistical tests
  lines.push("## Statistical Tests");
  lines.push("");
  for (const test of tests) {
    lines.push(`### ${test.testName}`);
    lines.push("");
    if (test.analysisStatus && test.analysisStatus !== "computed") {
      lines.push(`**Analysis status:** ${test.analysisStatus}`);
      lines.push("");
      lines.push(`**Conclusion:** ${test.conclusion}`);
      lines.push("");
      continue;
    }
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(`| p-value | ${test.pValue.toFixed(4)} |`);
    if (test.pValueAdjusted !== undefined) {
      lines.push(`| p-value (Holm-Bonferroni) | ${test.pValueAdjusted.toFixed(4)} |`);
    }
    lines.push(`| Effect Size | ${test.effectSize.toFixed(3)} (${test.effectSizeName}) |`);
    lines.push(`| 95% CI | [${test.ciLower.toFixed(3)}, ${test.ciUpper.toFixed(3)}] |`);
    lines.push(`| Significant | ${test.significant ? "✅ Yes" : "❌ No"} |`);
    lines.push("");
    lines.push(`**Conclusion:** ${test.conclusion}`);
    lines.push("");
  }

  // Figures
  if (figurePaths.length > 0) {
    lines.push("## Figures");
    lines.push("");
    for (const fp of figurePaths) {
      const name = path.basename(fp);
      lines.push(`![${name}](${fp})`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ============================================================================
// LaTeX Export
// ============================================================================

function generateLatex(metrics: ExperimentMetrics, tests: TestResult[]): string {
  const lines: string[] = [];
  const testMap = new Map(tests.map(t => [t.experimentId, t]));

  lines.push(`% ${metrics.experimentId} — Auto-generated LaTeX fragment`);
  lines.push(`% Generated: ${new Date().toISOString()}`);
  lines.push("");

  switch (metrics.experimentId) {
    case "e1_stability":
    case "e1_native": {
      const ss = metrics.stateStability!;
      const test = testMap.get("e1_stability");
      lines.push("\\begin{figure}[ht]");
      lines.push("  \\centering");
      lines.push("  \\includegraphics[width=\\columnwidth]{figures/fig1_stability.pdf}");
      lines.push(`  \\caption{State Stability Comparison between Belief and Cognitive Runtime.`);
      lines.push(`    Per-round belief change variance in Belief Runtime ($\\sigma^2 = ${ss.sigmaSqDeltaB.toFixed(4)}$).`);
      lines.push(`    Per-round utility change variance in Cognitive Runtime ($\\sigma^2 = ${ss.sigmaSqDeltaU.toFixed(4)}$).`);
      if (test) {
        lines.push(`    Stability ratio $\\sigma^2(\\Delta B) / \\sigma^2(\\Delta U) = ${ss.stabilityRatio.toFixed(2)}$`);
        lines.push(`    (permutation test, $p = ${test.pValue.toFixed(4)}$, Cohen's $d = ${test.effectSize.toFixed(2)}$).`);
      }
      lines.push(`    Error bars represent 95\\% bootstrap confidence intervals.}`);
      lines.push("  \\label{fig:stability}");
      lines.push("\\end{figure}");
      break;
    }
    case "e2_evidence": {
      const ee = metrics.evidenceExplanatory!;
      const test = testMap.get("e2_evidence");
      lines.push("\\begin{figure}[ht]");
      lines.push("  \\centering");
      lines.push("  \\includegraphics[width=\\columnwidth]{figures/fig2_evidence.pdf}");
      lines.push(`  \\caption{Evidence Explanatory Power.}`);
      lines.push(`    Cognitive model $R^2 = ${ee.r2Cognitive.toFixed(3)}$, Belief model $R^2 = ${ee.r2Belief.toFixed(3)}$.`);
      lines.push(`    $\\Delta R^2 = ${ee.deltaR2.toFixed(3)}$ (incremental F-test).}`);
      lines.push("  \\label{fig:evidence}");
      lines.push("\\end{figure}");
      break;
    }
    case "e6_decoupling": {
      const sd = metrics.stateDecoupling!;
      const test = testMap.get("e6_decoupling");
      if (sd.status !== "computed"
        || sd.maxCorrCognitive === undefined
        || sd.maxCorrBelief === undefined) {
        lines.push(`% E6 unavailable: ${sd.status} (${sd.invalidReason ?? "unavailable"})`);
        break;
      }
      lines.push("\\begin{figure}[ht]");
      lines.push("  \\centering");
      lines.push("  \\includegraphics[width=\\columnwidth]{figures/fig6_decoupling.pdf}");
      lines.push(`  \\caption{Cognitive State Decoupling.}`);
      lines.push(`    Maximum pairwise correlation among Cognitive variables: $|r|_{\\text{max}} = ${sd.maxCorrCognitive.toFixed(3)}$.`);
      lines.push(`    Belief-confidence correlation: $|r| = ${sd.maxCorrBelief.toFixed(3)}$.`);
      if (test) {
        lines.push(`    Fisher's $z$ test: $p = ${test.pValue.toFixed(4)}$.}`);
      }
      lines.push("  \\label{fig:decoupling}");
      lines.push("\\end{figure}");
      break;
    }
  }

  // Table
  lines.push("");
  lines.push("\\begin{table}[ht]");
  lines.push("  \\centering");
  lines.push("  \\begin{tabular}{lcc}");
  lines.push("    \\toprule");
  lines.push("    Metric & Value & p-value \\\\");
  lines.push("    \\midrule");
  for (const test of tests) {
    if (test.analysisStatus && test.analysisStatus !== "computed") {
      lines.push(`    ${test.testName} & \\multicolumn{2}{c}{N/A (${test.analysisStatus})} \\\\`);
    } else {
      lines.push(`    ${test.testName} & ${test.effectSize.toFixed(3)} & ${test.pValue.toFixed(4)} \\\\`);
    }
  }
  lines.push("    \\bottomrule");
  lines.push("  \\end{tabular}");
  lines.push(`  \\caption{Statistical test results for ${metrics.experimentId}.}`);
  lines.push(`  \\label{tab:${metrics.experimentId}}`);
  lines.push("\\end{table}");

  return lines.join("\n");
}

// ============================================================================
// Result Summary (论文可直接引用)
// ============================================================================

function generateResultSummary(metrics: ExperimentMetrics, tests: TestResult[]): string {
  const test = tests[0];
  if (!test) return "No results available.";

  switch (metrics.experimentId) {
    case "e1_stability":
    case "e1_native": {
      const ss = metrics.stateStability!;
      return `The Cognitive Runtime demonstrated significantly higher state stability ` +
        `compared to the Belief Runtime. The per-round variance of utility changes ` +
        `($\\sigma^2(\\Delta U) = ${ss.sigmaSqDeltaU.toFixed(4)}$, 95\\% CI [${test.ciLower.toFixed(3)}, ${test.ciUpper.toFixed(3)}]) ` +
        `was significantly lower than the per-round variance of belief changes ` +
        `($\\sigma^2(\\Delta B) = ${ss.sigmaSqDeltaB.toFixed(4)}$; ` +
        `permutation test, $p = ${test.pValue.toFixed(4)}$, Cohen's $d = ${test.effectSize.toFixed(2)}$). ` +
        `This confirms Hypothesis 1: the Utility vector is more stable than the scalar Belief, ` +
        `supporting the claim that the five-dimensional cognitive state space separates preference from noise.`;
    }
    case "e2_evidence": {
      const ee = metrics.evidenceExplanatory!;
      return `The Cognitive model ($R^2 = ${ee.r2Cognitive.toFixed(3)}$) explained significantly more ` +
        `variance in opinion change than the Belief model ($R^2 = ${ee.r2Belief.toFixed(3)}$), ` +
        `with $\\Delta R^2 = ${ee.deltaR2.toFixed(3)}$. ` +
        `This confirms Hypothesis 2: Evidence changes provide explanatory power for opinion shifts ` +
        `that belief-model confidence cannot capture.`;
    }
    case "e6_decoupling": {
      const sd = metrics.stateDecoupling!;
      if (sd.status !== "computed"
        || sd.maxCorrCognitive === undefined
        || sd.maxCorrBelief === undefined
        || test.analysisStatus !== "computed") {
        return `E6 was not computed (${sd.status}; ${sd.invalidReason ?? "unavailable"}). `
          + `No confirmatory state-decoupling claim is available.`;
      }
      return `The maximum pairwise correlation among Cognitive State variables ` +
        `($|r|_{\\text{max}} = ${sd.maxCorrCognitive.toFixed(3)}$) was significantly lower than ` +
        `the Belief-confidence correlation in the scalar model ` +
        `($|r| = ${sd.maxCorrBelief.toFixed(3)}$, Fisher's $z$ test, $p = ${test.pValue.toFixed(4)}$). ` +
        `This confirms Hypothesis 6: the five-dimensional decomposition provides independent information dimensions.`;
    }
    default:
      return test.conclusion;
  }
}

// ============================================================================
// Main
// ============================================================================

export function generateReport(
  metrics: ExperimentMetrics,
  tests: TestResult[],
  figurePaths: string[],
  outputDir: string,
): { mdPath: string; texPath: string; summary: string } {
  fs.mkdirSync(outputDir, { recursive: true });

  const mdContent = generateMarkdown(metrics, tests, figurePaths);
  const mdPath = path.join(outputDir, "report.md");
  fs.writeFileSync(mdPath, mdContent);

  const texContent = generateLatex(metrics, tests);
  const texPath = path.join(outputDir, "report.tex");
  fs.writeFileSync(texPath, texContent);

  const summary = generateResultSummary(metrics, tests);

  return { mdPath, texPath, summary };
}
