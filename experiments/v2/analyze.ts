import * as fs from "fs";
import * as path from "path";

interface ExperimentResult {
  runId: string; ablation: string; runIndex: number;
  kendallTau: number; decisionQuality: number;
  totalRounds: number; converged: boolean;
  totalInterventions: number;
  tauTrajectory?: number[];
  rounds: Array<{ roundNumber: number; tau?: number; evalScores?: Record<string, number>; interventions: Array<{ type: string }> }>;
  evaluationScores: Record<string, number>;
}

const DATA_DIR = path.resolve(__dirname, "data");
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json") && f !== "summary.json");
const results: ExperimentResult[] = files.map(f =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf-8"))
);

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

const groups = new Map<string, ExperimentResult[]>();
for (const r of results) {
  if (!groups.has(r.ablation)) groups.set(r.ablation, []);
  groups.get(r.ablation)!.push(r);
}

// ════════════════════════════════════════════════════════════════════
// WITHIN-GROUP τ TRAJECTORY — the causal measure
// ════════════════════════════════════════════════════════════════════
console.log("=".repeat(75));
console.log("  WITHIN-GROUP τ Improvement (same agents, round 1 → final)");
console.log("=".repeat(75));
console.log();

for (const ablation of ["none", "full", "adaptive"]) {
  const g = groups.get(ablation);
  if (!g) continue;

  const deltas: number[] = [];
  const r1Taus: number[] = [];
  const rFinalTaus: number[] = [];

  for (const r of g) {
    if (r.rounds.length >= 2) {
      const r1 = (r.rounds[0] as any).tau ?? r.rounds[0].tau ?? r.kendallTau;
      const rFinal = (r.rounds[r.rounds.length - 1] as any).tau ?? r.kendallTau;
      if (typeof r1 === "number" && typeof rFinal === "number") {
        deltas.push(rFinal - r1);
        r1Taus.push(r1);
        rFinalTaus.push(rFinal);
      }
    }
  }

  const avgDelta = mean(deltas);
  const sdDelta = stdDev(deltas);
  console.log(`${ablation}:`);
  console.log(`  Round 1 τ: ${mean(r1Taus).toFixed(3)}±${stdDev(r1Taus).toFixed(3)}`);
  console.log(`  Final τ:   ${mean(rFinalTaus).toFixed(3)}±${stdDev(rFinalTaus).toFixed(3)}`);
  console.log(`  Δτ:        ${avgDelta >= 0 ? "+" : ""}${avgDelta.toFixed(3)}±${sdDelta.toFixed(3)}`);
  console.log();
}

// Compare Δτ between full and none
const noneG = groups.get("none")!;
const fullG = groups.get("full")!;
const noneDeltas: number[] = [];
const fullDeltas: number[] = [];

for (const r of noneG) {
  if (r.rounds.length >= 2) {
    const r1 = (r.rounds[0] as any).tau ?? r.kendallTau;
    const rFinal = (r.rounds[r.rounds.length - 1] as any).tau ?? r.kendallTau;
    if (typeof r1 === "number" && typeof rFinal === "number") noneDeltas.push(rFinal - r1);
  }
}
for (const r of fullG) {
  if (r.rounds.length >= 2) {
    const r1 = (r.rounds[0] as any).tau ?? r.kendallTau;
    const rFinal = (r.rounds[r.rounds.length - 1] as any).tau ?? r.kendallTau;
    if (typeof r1 === "number" && typeof rFinal === "number") fullDeltas.push(rFinal - r1);
  }
}

if (noneDeltas.length > 0 && fullDeltas.length > 0) {
  const deltaD = cohensD(fullDeltas, noneDeltas);
  console.log(`Within-group Δτ comparison:`);
  console.log(`  none Δτ: ${mean(noneDeltas).toFixed(3)}±${stdDev(noneDeltas).toFixed(3)}`);
  console.log(`  full Δτ: ${mean(fullDeltas).toFixed(3)}±${stdDev(fullDeltas).toFixed(3)}`);
  console.log(`  d = ${deltaD >= 0 ? "+" : ""}${deltaD.toFixed(2)}`);
  console.log();
  if (deltaD > 0.5) {
    console.log(`  → Governance CAUSES larger within-group improvement (d=${deltaD.toFixed(2)})`);
  } else if (deltaD > 0.2) {
    console.log(`  → Directional causal effect (d=${deltaD.toFixed(2)}), needs larger n`);
  } else {
    console.log(`  → No detectable causal effect (d=${deltaD.toFixed(2)})`);
  }
}

// ════════════════════════════════════════════════════════════════════
// BETWEEN-GROUP — final τ comparison
// ════════════════════════════════════════════════════════════════════
const baseline = groups.get("none")!.map(r => r.decisionQuality);

console.log("\n" + "=".repeat(75));
console.log("  BETWEEN-GROUP Decision Quality (Kendall's τ → 0-100)");
console.log("=".repeat(75));
console.log("| Ablation       | n  | Q μ±σ       | τ μ±σ        | Interventions | d vs none |");
console.log("|----------------|----|-------------|---------------|---------------|-----------|");

for (const ablation of ["none", "detect-only", "full", "adaptive"] as const) {
  const g = groups.get(ablation);
  if (!g) continue;
  const qs = g.map(r => r.decisionQuality);
  const ts = g.map(r => r.kendallTau);
  const totalIntv = g.reduce((s, r) => s + r.totalInterventions, 0);
  const d = ablation === "none" ? 0 : cohensD(qs, baseline);
  const dStr = ablation === "none" ? "—" : (d >= 0 ? "+" : "") + d.toFixed(2);
  console.log(
    `| ${ablation.padEnd(14)} | ${g.length}  | ${mean(qs).toFixed(1)}±${stdDev(qs).toFixed(1).padStart(4)} | ${mean(ts).toFixed(3)}±${stdDev(ts).toFixed(3)} | ${String(totalIntv).padStart(3)} intv      | ${dStr.padStart(6)}     |`
  );
}

// ════════════════════════════════════════════════════════════════════
// 5-DIMENSION IMPACT
// ════════════════════════════════════════════════════════════════════
const DIMS = ["consensus", "reliability", "dispersion", "stability", "influenceAnalysis"];
const dimLabels: Record<string, string> = {
  consensus: "Consensus", reliability: "Reliability", dispersion: "Dispersion",
  stability: "Stability", influenceAnalysis: "Influence",
};

console.log("\n## 5-Dimension Impact (full vs none)");
console.log("| Dimension       | none μ±σ     | full μ±σ     | d       |");
console.log("|----------------|--------------|--------------|---------|");

for (const dim of DIMS) {
  const noneScores = (groups.get("none")!).map(r => r.evaluationScores?.[dim] ?? 0);
  const fullScores = (groups.get("full")!).map(r => r.evaluationScores?.[dim] ?? 0);
  const d = cohensD(fullScores, noneScores);
  const dStr = (d >= 0 ? "+" : "") + d.toFixed(2);
  console.log(`| ${dimLabels[dim].padEnd(14)} | ${mean(noneScores).toFixed(1)}±${stdDev(noneScores).toFixed(1).padStart(4)} | ${mean(fullScores).toFixed(1)}±${stdDev(fullScores).toFixed(1).padStart(4)} | ${dStr.padStart(6)} |`);
}
