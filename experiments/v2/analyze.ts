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
      console.log(`    Governance improvement is genuinely causal, not an artifact of`);
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
