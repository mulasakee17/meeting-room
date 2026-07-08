import * as fs from "fs";
import * as path from "path";

interface ExperimentResult {
  runId: string; ablation: string; runIndex: number;
  kendallTau: number; decisionQuality: number;
  totalRounds: number; converged: boolean;
  totalInterventions: number;
  tauTrajectory?: number[];
  interventionBreakdown?: Record<string, number>;
  rounds: Array<{ roundNumber: number; tau?: number; evalScores?: Record<string, number>; interventions: Array<{ type: string }> }>;
  evaluationScores: Record<string, number>;
}

const DATA_DIR = path.resolve(__dirname, "data");
const DATA_INVEST_DIR = path.resolve(__dirname, "data_invest");

function loadData(dir: string): ExperimentResult[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json") && f !== "summary.json");
  return files.map(f =>
    JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"))
  );
}

function mean(v: number[]) { return v.reduce((a, b) => a + b, 0) / v.length; }
function stdDev(v: number[]) {
  const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}
function cohensD(a: number[], b: number[]) {
  const ma = mean(a), mb = mean(b);
  const va = a.reduce((s, v) => s + (v - ma) ** 2, 0) / (a.length - 1);
  const vb = b.reduce((s, v) => s + (v - mb) ** 2, 0) / (b.length - 1);
  const sp = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
  return sp === 0 ? 0 : (ma - mb) / sp;
}

// ============================================================================
// Bootstrap inference (percentile method, 10000 resamples)
// ============================================================================

/** Deterministic PRNG (mulberry32) for reproducible bootstrap results. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const RNG_SEED = 42;
const N_BOOT = 10000;
const ALPHA = 0.05;

/**
 * Percentile bootstrap 95% CI for a mean.
 * Returns { mean, ci95: [lo, hi] }.
 */
function bootstrapCI(samples: number[], nBoot = N_BOOT, alpha = ALPHA) {
  const n = samples.length;
  if (n === 0) return { mean: 0, ci95: [0, 0] as [number, number] };
  const rng = mulberry32(RNG_SEED);
  const means: number[] = [];
  for (let i = 0; i < nBoot; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += samples[Math.floor(rng() * n)];
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  const lo = means[Math.floor(nBoot * alpha / 2)];
  const hi = means[Math.floor(nBoot * (1 - alpha / 2))];
  const m = mean(samples);
  return { mean: m, ci95: [lo, hi] as [number, number] };
}

/**
 * Bootstrap CI for the difference in means between two groups.
 * Returns { meanDiff, ci95: [lo, hi], pValue (two-sided) }.
 */
function bootstrapMeanDiff(a: number[], b: number[], nBoot = N_BOOT, alpha = ALPHA) {
  if (a.length === 0 || b.length === 0) return { meanDiff: 0, ci95: [0, 0] as [number, number], pValue: 1 };
  const rng = mulberry32(RNG_SEED + 0x5EED);  // independent seed stream
  const diffs: number[] = [];
  const obsDiff = mean(a) - mean(b);
  for (let i = 0; i < nBoot; i++) {
    let sumA = 0, sumB = 0;
    for (let j = 0; j < a.length; j++) sumA += a[Math.floor(rng() * a.length)];
    for (let j = 0; j < b.length; j++) sumB += b[Math.floor(rng() * b.length)];
    diffs.push(sumA / a.length - sumB / b.length);
  }
  diffs.sort((x, y) => x - y);
  const lo = diffs[Math.floor(nBoot * alpha / 2)];
  const hi = diffs[Math.floor(nBoot * (1 - alpha / 2))];
  // Two-sided bootstrap p-value: proportion of bootstrap diffs ≤ 0 (if obs > 0) or ≥ 0 (if obs < 0), doubled
  const propBelow = diffs.filter(d => d <= 0).length / nBoot;
  const propAbove = diffs.filter(d => d >= 0).length / nBoot;
  const pValue = obsDiff > 0 ? 2 * propBelow : 2 * propAbove;
  return { meanDiff: obsDiff, ci95: [lo, hi] as [number, number], pValue: Math.min(pValue, 1) };
}

/** Format a CI as [+X.XX, +X.XX] */
function fmtCI(ci: [number, number]): string {
  const s0 = (ci[0] >= 0 ? "+" : "") + ci[0].toFixed(2);
  const s1 = (ci[1] >= 0 ? "+" : "") + ci[1].toFixed(2);
  return `[${s0}, ${s1}]`;
}

function analyze(label: string, dir: string) {
  const results = loadData(dir);
  if (results.length === 0) {
    console.log(`\n[${label}] No data in ${dir}/ — skipping.\n`);
    return;
  }

  const groups = new Map<string, ExperimentResult[]>();
  for (const r of results) {
    if (!groups.has(r.ablation)) groups.set(r.ablation, []);
    groups.get(r.ablation)!.push(r);
  }

  const baseline = groups.get("none");
  if (!baseline) {
    console.log(`\n[${label}] No \"none\" baseline found — aborting.\n`);
    return;
  }

  // ════════════════════════════════════════════════════════════════════
  // BETWEEN-GROUP — final τ comparison
  // ════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log(`  ${label} — BETWEEN-GROUP Decision Quality (Kendall's τ → 0-100)`);
  console.log("=".repeat(80));
  console.log("| Ablation          | n  | Q μ±σ        | τ μ±σ         | Intv  | d vs none | Δτ (within) |");
  console.log("|-------------------|----|--------------|---------------|-------|-----------|-------------|");

  const ablationOrder = ["none", "full", "shuffle", "full_diversity", "full_weight", "full_reflection", "full_continue"];

  for (const ablation of ablationOrder) {
    const g = groups.get(ablation);
    if (!g) continue;
    const qs = g.map(r => r.decisionQuality);
    const ts = g.map(r => r.kendallTau);
    const totalIntv = g.reduce((s, r) => s + r.totalInterventions, 0);
    const d = ablation === "none" ? 0 : cohensD(qs, baseline.map(r => r.decisionQuality));
    const dStr = ablation === "none" ? "—" : (d >= 0 ? "+" : "") + d.toFixed(2);

    // Within-group Δτ
    const deltas: number[] = [];
    for (const r of g) {
      if (r.tauTrajectory && r.tauTrajectory.length >= 2) {
        deltas.push(r.tauTrajectory[r.tauTrajectory.length - 1] - r.tauTrajectory[0]);
      }
    }
    const deltaStr = deltas.length > 0
      ? `${(mean(deltas) >= 0 ? "+" : "")}${mean(deltas).toFixed(3)}±${stdDev(deltas).toFixed(3)}`
      : "—";

    console.log(
      `| ${ablation.padEnd(17)} | ${String(g.length).padStart(2)} | ${mean(qs).toFixed(1)}±${stdDev(qs).toFixed(1).padStart(4)} | ${mean(ts).toFixed(3)}±${stdDev(ts).toFixed(3)} | ${String(totalIntv).padStart(3)}   | ${dStr.padStart(7)}   | ${deltaStr.padStart(11)} |`
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // SHUFFLE CONTROL — regression-to-mean check
  // ════════════════════════════════════════════════════════════════════
  const fullG = groups.get("full");
  const shuffleG = groups.get("shuffle");
  if (fullG && shuffleG) {
    console.log("\n" + "-".repeat(80));
    console.log("  SHUFFLE CONTROL — Regression-to-Mean Check");
    console.log("-".repeat(80));

    const fullQs = fullG.map(r => r.decisionQuality);
    const shuffleQs = shuffleG.map(r => r.decisionQuality);
    const fullDeltas = fullG
      .filter(r => r.tauTrajectory && r.tauTrajectory.length >= 2)
      .map(r => r.tauTrajectory![r.tauTrajectory!.length - 1] - r.tauTrajectory![0]);
    const shuffleDeltas = shuffleG
      .filter(r => r.tauTrajectory && r.tauTrajectory.length >= 2)
      .map(r => r.tauTrajectory![r.tauTrajectory!.length - 1] - r.tauTrajectory![0]);

    const shuffleD = cohensD(shuffleQs, baseline.map(r => r.decisionQuality));
    const fullVsShuffleD = cohensD(fullQs, shuffleQs);

    console.log(`  baseline (none) τ:     ${mean(baseline.map(r => r.kendallTau)).toFixed(3)}`);
    console.log(`  shuffle τ:            ${mean(shuffleG.map(r => r.kendallTau)).toFixed(3)} (d vs none = ${shuffleD >= 0 ? "+" : ""}${shuffleD.toFixed(2)})`);
    console.log(`  full τ:               ${mean(fullG.map(r => r.kendallTau)).toFixed(3)} (d vs none = ${cohensD(fullQs, baseline.map(r => r.decisionQuality)) >= 0 ? "+" : ""}${cohensD(fullQs, baseline.map(r => r.decisionQuality)).toFixed(2)})`);
    console.log(`  full vs shuffle d:    ${fullVsShuffleD >= 0 ? "+" : ""}${fullVsShuffleD.toFixed(2)}`);
    console.log(`  shuffle Δτ:           ${mean(shuffleDeltas) >= 0 ? "+" : ""}${mean(shuffleDeltas).toFixed(3)}±${stdDev(shuffleDeltas).toFixed(3)}`);
    console.log(`  full Δτ:              ${mean(fullDeltas) >= 0 ? "+" : ""}${mean(fullDeltas).toFixed(3)}±${stdDev(fullDeltas).toFixed(3)}`);

    if (Math.abs(mean(shuffleDeltas)) < 0.1 && mean(fullDeltas) > 0.3) {
      console.log(`\n  ✓ shuffle Δτ ≈ 0 while full Δτ > 0.3 — regression to the mean is RULED OUT.`);
      console.log(`    Governance improvement is genuine, not an artifact of`);
      console.log(`    repeated measurement or discussion mechanics alone.`);
    } else if (fullVsShuffleD > 0.5) {
      console.log(`\n  → Full substantially outperforms shuffle (d=${fullVsShuffleD.toFixed(2)}).`);
      console.log(`    Directional evidence against regression-to-mean.`);
    } else {
      console.log(`\n  ⚠ Cannot rule out regression to the mean (full vs shuffle d=${fullVsShuffleD.toFixed(2)}).`);
      console.log(`    Consider increasing n or tightening the control design.`);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // INTERVENTION TYPE ABLATION — which intervention matters?
  // ════════════════════════════════════════════════════════════════════
  const singleModes = ["full_diversity", "full_weight", "full_reflection", "full_continue"];
  const hasSingleModes = singleModes.some(m => groups.has(m));

  if (hasSingleModes) {
    console.log("\n" + "-".repeat(80));
    console.log("  INTERVENTION TYPE ABLATION — Which Intervention Matters?");
    console.log("-".repeat(80));

    const modeLabels: Record<string, string> = {
      full_diversity:  "introduce_diversity (echo chamber → diversity injection)",
      full_weight:     "reduce_weight (authority bias → weight reduction)",
      full_reflection: "force_reflection (polarization → belief reflection)",
      full_continue:   "continue_discussion (premature consensus → more rounds)",
    };

    console.log("| Single-intervention         | τ μ±σ         | d vs none | Δτ          |");
    console.log("|-----------------------------|---------------|-----------|-------------|");

    for (const mode of singleModes) {
      const g = groups.get(mode);
      if (!g) continue;
      const ts = g.map(r => r.kendallTau);
      const d = cohensD(g.map(r => r.decisionQuality), baseline.map(r => r.decisionQuality));
      const dStr = (d >= 0 ? "+" : "") + d.toFixed(2);

      const deltas: number[] = [];
      for (const r of g) {
        if (r.tauTrajectory && r.tauTrajectory.length >= 2) {
          deltas.push(r.tauTrajectory[r.tauTrajectory.length - 1] - r.tauTrajectory[0]);
        }
      }
      const deltaStr = deltas.length > 0
        ? `${(mean(deltas) >= 0 ? "+" : "")}${mean(deltas).toFixed(3)}`
        : "—";

      console.log(`| ${modeLabels[mode].padEnd(27)} | ${mean(ts).toFixed(3)}±${stdDev(ts).toFixed(3)} | ${dStr.padStart(7)}   | ${deltaStr.padStart(11)} |`);
    }

    // Full vs each single mode
    if (fullG) {
      console.log(`\n  full (all 4):          τ = ${mean(fullG.map(r => r.kendallTau)).toFixed(3)}±${stdDev(fullG.map(r => r.kendallTau)).toFixed(3)}`);

      // Check if any single mode matches full
      for (const mode of singleModes) {
        const g = groups.get(mode);
        if (!g || g.length === 0) continue;
        const sd = cohensD(fullG.map(r => r.decisionQuality), g.map(r => r.decisionQuality));
        if (sd < 0.3) {
          console.log(`  → ${mode} alone nearly matches full (d=${sd.toFixed(2)}) — this intervention may be the dominant driver.`);
        }
      }

      // Check if continue_discussion alone explains the effect
      const contG = groups.get("full_continue");
      if (contG) {
        const contD = cohensD(fullG.map(r => r.decisionQuality), contG.map(r => r.decisionQuality));
        if (contD < 0.5) {
          console.log(`  → continue_discussion explains most of full's effect (d_full_vs_cont=${contD.toFixed(2)}).`);
          console.log(`    This suggests more discussion rounds are the primary mechanism,`);
          console.log(`    not the sophistication of targeted interventions.`);
        }
      }

      // Full intervention breakdown from full-mode runs
      const breakdown: Record<string, number[]> = {};
      for (const r of fullG) {
        if (r.interventionBreakdown) {
          for (const [k, v] of Object.entries(r.interventionBreakdown)) {
            if (!breakdown[k]) breakdown[k] = [];
            breakdown[k].push(v);
          }
        }
      }
      if (Object.keys(breakdown).length > 0) {
        console.log(`\n  Full-mode intervention distribution (per run):`);
        for (const [intvType, counts] of Object.entries(breakdown)) {
          console.log(`    ${intvType}: ${mean(counts).toFixed(1)}±${stdDev(counts).toFixed(1)}`);
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // STATISTICAL INFERENCE — bootstrap 95% CI (10000 resamples)
  // ════════════════════════════════════════════════════════════════════
  console.log("\n" + "-".repeat(80));
  console.log("  BOOTSTRAP INFERENCE (percentile, 10000 resamples, α=0.05)");
  console.log("-".repeat(80));

  const baselineQs = baseline.map(r => r.decisionQuality);
  const baselineTs = baseline.map(r => r.kendallTau);
  const baselineCI = bootstrapCI(baselineQs);
  console.log(`\n  Baseline (none):  Q = ${baselineCI.mean.toFixed(1)}, 95% CI ${fmtCI(baselineCI.ci95)}`);

  // Full vs none — the primary claim
  if (fullG) {
    const fullQs = fullG.map(r => r.decisionQuality);
    const fullTs = fullG.map(r => r.kendallTau);
    const fullCI = bootstrapCI(fullQs);
    const diffFullVsNone = bootstrapMeanDiff(fullQs, baselineQs);
    const dFullVsNone = cohensD(fullQs, baselineQs);

    console.log(`  Full governance:  Q = ${fullCI.mean.toFixed(1)}, 95% CI ${fmtCI(fullCI.ci95)}`);
    console.log(`  Full vs None:     ΔQ = ${diffFullVsNone.meanDiff >= 0 ? "+" : ""}${diffFullVsNone.meanDiff.toFixed(1)}`);
    console.log(`                    95% CI ${fmtCI(diffFullVsNone.ci95)}`);
    console.log(`                    Cohen's d = ${dFullVsNone >= 0 ? "+" : ""}${dFullVsNone.toFixed(2)}`);
    console.log(`                    p = ${diffFullVsNone.pValue.toFixed(3)} (bootstrap, two-sided)`);

    if (diffFullVsNone.ci95[0] > 0) {
      console.log(`  ✓ Full > None is statistically significant (95% CI excludes 0).`);
    } else if (diffFullVsNone.ci95[1] < 0) {
      console.log(`  ✗ Full < None is statistically significant (95% CI excludes 0).`);
    } else {
      console.log(`  ⚠ Full vs None is NOT statistically significant (95% CI includes 0).`);
      console.log(`    With n=${baselineQs.length} per group, the observed effect may be noise.`);
      console.log(`    Consider increasing n or reducing between-run variance.`);
    }
  }

  // Shuffle control — bootstrap test
  if (shuffleG && fullG) {
    const shuffleQs = shuffleG.map(r => r.decisionQuality);
    const diffShuffleVsNone = bootstrapMeanDiff(shuffleQs, baselineQs);
    console.log(`\n  Shuffle vs None:  ΔQ = ${diffShuffleVsNone.meanDiff >= 0 ? "+" : ""}${diffShuffleVsNone.meanDiff.toFixed(1)}`);
    console.log(`                    95% CI ${fmtCI(diffShuffleVsNone.ci95)}`);
    console.log(`                    p = ${diffShuffleVsNone.pValue.toFixed(3)}`);

    const diffFullVsShuffle = bootstrapMeanDiff(fullG.map(r => r.decisionQuality), shuffleQs);
    console.log(`  Full vs Shuffle:  ΔQ = ${diffFullVsShuffle.meanDiff >= 0 ? "+" : ""}${diffFullVsShuffle.meanDiff.toFixed(1)}`);
    console.log(`                    95% CI ${fmtCI(diffFullVsShuffle.ci95)}`);
    console.log(`                    p = ${diffFullVsShuffle.pValue.toFixed(3)}`);
  }

  // Within-group Δτ bootstrap
  const fullDeltas = fullG
    ?.filter(r => r.tauTrajectory && r.tauTrajectory.length >= 2)
    .map(r => r.tauTrajectory![r.tauTrajectory!.length - 1] - r.tauTrajectory![0]) ?? [];
  if (fullDeltas.length > 0) {
    const deltaCI = bootstrapCI(fullDeltas);
    console.log(`\n  Full within-group Δτ: ${deltaCI.mean >= 0 ? "+" : ""}${deltaCI.mean.toFixed(3)}, 95% CI ${fmtCI(deltaCI.ci95)}`);
    if (deltaCI.ci95[0] > 0) {
      console.log(`  ✓ Within-group Δτ is significantly positive (95% CI excludes 0).`);
    } else if (deltaCI.ci95[1] < 0) {
      console.log(`  ✗ Within-group Δτ is significantly negative.`);
    } else {
      console.log(`  ⚠ Within-group Δτ is NOT significantly different from 0.`);
    }
  }

  // Single-intervention bootstrap comparison
  if (hasSingleModes) {
    console.log(`\n  Single-intervention bootstrap (vs baseline):`);
    for (const mode of singleModes) {
      const g = groups.get(mode);
      if (!g || g.length === 0) continue;
      const diff = bootstrapMeanDiff(g.map(r => r.decisionQuality), baselineQs);
      const sig = diff.ci95[0] > 0 ? "✓ sig" : diff.ci95[1] < 0 ? "✗ sig(neg)" : "— n.s.";
      console.log(`    ${mode.padEnd(16)} ΔQ = ${diff.meanDiff >= 0 ? "+" : ""}${diff.meanDiff.toFixed(1)} ${fmtCI(diff.ci95).padStart(14)} p=${diff.pValue.toFixed(3)} ${sig}`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// Run analysis on both task datasets
// ════════════════════════════════════════════════════════════════════

console.log("=".repeat(80));
console.log("  SwarmAlpha V2 — Experiment Analysis");
console.log("=".repeat(80));

analyze("M&A Task", DATA_DIR);
analyze("Invest Task", DATA_INVEST_DIR);

console.log("\nDone.");
