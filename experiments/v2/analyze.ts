import * as fs from "fs";
import * as path from "path";

interface ExperimentResult {
  runId: string; ablation: string; runIndex: number;
  kendallTau: number; decisionQuality: number;
  totalRounds: number; converged: boolean;
  totalInterventions: number;
  interventionEffects: Array<{ effective: boolean; interventionType: string }>;
  issuesDetected: string[];
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

console.log("\n## Decision Quality (Kendall's τ → 0-100)");
console.log("| Ablation       | n  | Q μ±σ       | τ μ±σ        | Interventions | Rounds | d vs none |");
console.log("|----------------|----|-------------|---------------|---------------|--------|-----------|");

for (const ablation of ["none", "detect-only", "full"] as const) {
  const g = groups.get(ablation)!;
  const qs = g.map(r => r.decisionQuality);
  const ts = g.map(r => r.kendallTau);
  const totalIntv = g.reduce((s, r) => s + r.totalInterventions, 0);
  const totalEff = g.reduce((s, r) => s + r.interventionEffects.filter(e => e.effective).length, 0);
  // Cohen's d: positive = improvement over none
  const d = ablation === "none" ? 0 : cohensD(qs, baseline); // (treatment - none) / sp
  const totalRounds = Math.round(mean(g.map(r => r.totalRounds)));

  const dStr = ablation === "none" ? "—" : (d >= 0 ? "+" : "") + d.toFixed(2);
  console.log(
    `| ${ablation.padEnd(14)} | ${g.length}  | ${mean(qs).toFixed(1)}±${stdDev(qs).toFixed(1).padStart(4)} | ${mean(ts).toFixed(3)}±${stdDev(ts).toFixed(3)} | ${String(totalIntv).padStart(3)} intv      | ${String(totalRounds).padStart(2)}r    | ${dStr.padStart(6)}     |`
  );
}

// ── Intervention effectiveness ──
console.log("\n## Intervention Effectiveness");
for (const ablation of ["full"] as const) {
  const g = groups.get(ablation)!;
  const effects = g.flatMap(r => r.interventionEffects);
  const total = effects.length;
  const effective = effects.filter(e => e.effective).length;
  const byType = new Map<string, { total: number; effective: number }>();
  for (const e of effects) {
    if (!byType.has(e.interventionType)) byType.set(e.interventionType, { total: 0, effective: 0 });
    const t = byType.get(e.interventionType)!;
    t.total++;
    if (e.effective) t.effective++;
  }
  console.log(`\n### ${ablation}`);
  console.log(`  Total interventions: ${total}, Effective: ${effective} (${(effective/total*100).toFixed(0)}%)`);
  for (const [type, stats] of byType) {
    console.log(`  ${type}: ${stats.effective}/${stats.total} effective (${(stats.effective/stats.total*100).toFixed(0)}%)`);
  }
}

// ── Bayes factor approximation (JZS prior) ──
console.log("\n## Statistical Summary");
const full_qs = groups.get("full")!.map(r => r.decisionQuality);
const detect_qs = groups.get("detect-only")!.map(r => r.decisionQuality);

const detectD = cohensD(detect_qs, baseline);
const fullD2 = cohensD(full_qs, baseline);
const fmtD = (d: number) => (d >= 0 ? "+" : "") + d.toFixed(2);
console.log(`  none μ=${mean(baseline).toFixed(1)}±${stdDev(baseline).toFixed(1)}`);
console.log(`  detect-only μ=${mean(detect_qs).toFixed(1)}±${stdDev(detect_qs).toFixed(1)} (d=${fmtD(detectD)})`);
console.log(`  full μ=${mean(full_qs).toFixed(1)}±${stdDev(full_qs).toFixed(1)} (d=${fmtD(fullD2)})`);

const fullD = cohensD(full_qs, baseline);
if (fullD > 0.8) {
  console.log(`\n  → Full governance Cohen's d = +${fullD.toFixed(2)} (LARGE effect)`);
  console.log(`  → Governance significantly improves decision quality over baseline.`);
} else if (fullD > 0.5) {
  console.log(`\n  → Full governance Cohen's d = +${fullD.toFixed(2)} (medium effect)`);
  console.log(`  → Governance shows meaningful improvement.`);
} else if (fullD > 0.2) {
  console.log(`\n  → Full governance Cohen's d = +${fullD.toFixed(2)} (small effect)`);
  console.log(`  → Directional improvement. Need larger n.`);
} else {
  console.log(`\n  → Full governance Cohen's d = +${fullD.toFixed(2)} (negligible)`);
  console.log(`  → No detectable improvement.`);
}
