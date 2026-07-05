import * as fs from "fs";
import * as path from "path";

interface ExperimentResult {
  runId: string; ablation: string; runIndex: number;
  kendallTau: number; decisionQuality: number;
  totalRounds: number; converged: boolean;
  totalInterventions: number;
  interventionEffects: Array<{ effective: boolean; interventionType: string }>;
  issuesDetected: string[];
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

const baseline = groups.get("none")!.map(r => r.decisionQuality);

// ── 5-Dimension Quantified Governance Impact ─────────────────────────
const DIMS = ["consensus", "reliability", "dispersion", "stability", "influenceAnalysis"];
const dimLabels: Record<string, string> = {
  consensus: "Consensus", reliability: "Reliability", dispersion: "Dispersion",
  stability: "Stability", influenceAnalysis: "Influence",
};

console.log("=".repeat(75));
console.log("  SwarmAlpha V2 — Quantified Adaptive Governance Analysis");
console.log("=".repeat(75));
console.log("\n## 5-Dimension Governance Impact (full vs none, n=15/group)");
console.log("| Dimension       | none μ±σ     | full μ±σ     | Δ       | d       |");
console.log("|----------------|--------------|--------------|---------|---------|");

for (const dim of DIMS) {
  const noneScores = (groups.get("none")!).map(r => r.evaluationScores?.[dim] ?? 0);
  const fullScores = (groups.get("full")!).map(r => r.evaluationScores?.[dim] ?? 0);
  const noneM = mean(noneScores), fullM = mean(fullScores);
  const delta = fullM - noneM;
  const d = cohensD(fullScores, noneScores);
  const dStr = (d >= 0 ? "+" : "") + d.toFixed(2);
  console.log(`| ${dimLabels[dim].padEnd(14)} | ${noneM.toFixed(1)}±${stdDev(noneScores).toFixed(1).padStart(4)} | ${fullM.toFixed(1)}±${stdDev(fullScores).toFixed(1).padStart(4)} | ${((delta>=0?'+':'')+delta.toFixed(1)).padStart(6)} | ${dStr.padStart(6)} |`);
}

// Kendall's τ (external accuracy metric)
const noneTau = (groups.get("none")!).map(r => r.kendallTau);
const fullTau = (groups.get("full")!).map(r => r.kendallTau);
const tauD = cohensD(fullTau, noneTau);
const tauDelta = mean(fullTau) - mean(noneTau);
console.log(`| ${"τ (ranking)".padEnd(14)} | ${mean(noneTau).toFixed(3)}±${stdDev(noneTau).toFixed(3).padStart(4)} | ${mean(fullTau).toFixed(3)}±${stdDev(fullTau).toFixed(3).padStart(4)} | ${((tauDelta>=0?'+':'')+tauDelta.toFixed(3)).padStart(6)} | ${(tauD>=0?'+':'')+tauD.toFixed(2).padStart(6)} |`);

// ── Decision quality summary ──────────────────────────────────────────
console.log("\n## Decision Quality (Kendall's τ → 0-100)");
console.log("| Ablation       | n  | Q μ±σ       | τ μ±σ        | Interventions | d vs none |");
console.log("|----------------|----|-------------|---------------|---------------|-----------|");

for (const ablation of ["none", "detect-only", "full"] as const) {
  const g = groups.get(ablation)!;
  const qs = g.map(r => r.decisionQuality);
  const ts = g.map(r => r.kendallTau);
  const totalIntv = g.reduce((s, r) => s + r.totalInterventions, 0);
  const d = ablation === "none" ? 0 : cohensD(qs, baseline);
  const dStr = ablation === "none" ? "—" : (d >= 0 ? "+" : "") + d.toFixed(2);
  console.log(
    `| ${ablation.padEnd(14)} | ${g.length}  | ${mean(qs).toFixed(1)}±${stdDev(qs).toFixed(1).padStart(4)} | ${mean(ts).toFixed(3)}±${stdDev(ts).toFixed(3)} | ${String(totalIntv).padStart(3)} intv      | ${dStr.padStart(6)}     |`
  );
}

// ── Statistical summary ──────────────────────────────────────────────
const full_qs = groups.get("full")!.map(r => r.decisionQuality);
const fullD = cohensD(full_qs, baseline);
const fmtD = (d: number) => (d >= 0 ? "+" : "") + d.toFixed(2);

console.log("\n## Statistical Summary");
console.log(`  Overall quality: full μ=${mean(full_qs).toFixed(1)}±${stdDev(full_qs).toFixed(1)} vs none μ=${mean(baseline).toFixed(1)}±${stdDev(baseline).toFixed(1)} (d=${fmtD(fullD)})`);

if (fullD > 0.5) {
  console.log(`  → Medium-large effect. Governance meaningfully improves decision quality.`);
} else if (fullD > 0.2) {
  console.log(`  → Small-to-medium effect. Directionally positive, needs larger n to confirm.`);
} else {
  console.log(`  → Negligible. No detectable improvement.`);
}

// ── Per-dimension interpretation ──────────────────────────────────────
const dimEffects: Array<{ dim: string; d: number; delta: number }> = [];
for (const dim of DIMS) {
  const noneS = (groups.get("none")!).map(r => r.evaluationScores?.[dim] ?? 0);
  const fullS = (groups.get("full")!).map(r => r.evaluationScores?.[dim] ?? 0);
  dimEffects.push({ dim, d: cohensD(fullS, noneS), delta: mean(fullS) - mean(noneS) });
}
dimEffects.sort((a, b) => b.d - a.d);

console.log("\n  Dimension ranking by governance effect:");
for (const e of dimEffects) {
  const bar = "█".repeat(Math.max(0, Math.round(e.d * 10)));
  console.log(`  ${dimLabels[e.dim].padEnd(14)} d=${fmtD(e.d).padStart(5)}  ${bar}`);
}
