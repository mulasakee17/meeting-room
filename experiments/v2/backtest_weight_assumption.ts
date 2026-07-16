/**
 * 权重假设回测：验证假设1（force_reflection 主要作用于结构性无序）
 *
 * 方法：从 crisis_full + supplier_full 实验中提取每次 force_reflection 干预，
 * 按干预时系统的 (1-R) vs T·H 比值分桶，对比两组的 Δτ（干预后 tau 变化）。
 *
 * 局限：观察性研究，非因果确证（agent 在不同 F-state 非随机分配，存在混杂）。
 */
import * as fs from "fs";
import * as path from "path";

interface Round {
  roundNumber: number;
  beliefs: Record<string, number>; // {a1: -0.87, a2: 0.22, ...}
  interventions: Array<{ type: string; targetAgentId?: string; targetAgents?: string[] }>;
  tau: number;
}

interface ExperimentData {
  rounds: Round[];
  kendallTau: number;
  tauTrajectory?: number[];
}

function kuramoto(beliefs: Record<string, number>): number {
  const vals = Object.values(beliefs);
  if (vals.length === 0) return 0;
  const angles = vals.map(b => b * Math.PI / 2);
  let sr = 0, si = 0;
  for (const a of angles) { sr += Math.cos(a); si += Math.sin(a); }
  return Math.sqrt(sr * sr + si * si) / vals.length;
}

function popStd(beliefs: Record<string, number>): number {
  const vals = Object.values(beliefs);
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, v) => s + (v - m) * (v - m), 0) / vals.length);
}

function normT(std: number): number {
  return Math.min(1, Math.max(0, std / 1)); // belief∈[-1,1], maxStd=1
}

function shannonH(beliefs: Record<string, number>, bins = 5, min = -1, max = 1): number {
  const values = Object.values(beliefs);
  const bw = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    let idx = Math.floor((Math.max(min, Math.min(max, v)) - min) / bw);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  const n = values.length;
  let e = 0;
  for (const c of counts) { if (c > 0) { const p = c / n; e -= p * Math.log2(p); } }
  return e / Math.log2(bins);
}

function loadExperiments(dir: string, prefix: string): ExperimentData[] {
  const results: ExperimentData[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(prefix) && f.endsWith(".json")) {
      try {
        results.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
      } catch { /* skip */ }
    }
  }
  return results;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

// 主分析
const crisisDir = path.join(__dirname, "data_crisis");
const supplierDir = path.join(__dirname, "data_supplier");

const crisis = loadExperiments(crisisDir, "crisis_full_");
const supplier = loadExperiments(supplierDir, "supplier_full_");
const all = [...crisis, ...supplier];

console.log(`=== 权重假设1回测 ===`);
console.log(`实验数: Crisis full=${crisis.length}, Supplier full=${supplier.length}, 合计=${all.length}`);

interface ForceReflEvent {
  structural: number; // 1-R
  thermal: number;    // T·H
  structuralDominant: boolean;
  deltaTau: number;   // tau_next - tau_current
  task: string;
  round: number;
}

const events: ForceReflEvent[] = [];

for (const exp of all) {
  if (!exp.rounds) continue;
  const task = crisis.includes(exp) ? "Crisis" : "Supplier";
  for (let i = 0; i < exp.rounds.length; i++) {
    const r = exp.rounds[i];
    const hasForceRefl = r.interventions && r.interventions.some(iv => iv.type === "force_reflection");
    if (!hasForceRefl) continue;
    if (!r.beliefs || Object.keys(r.beliefs).length === 0) continue;
    const R = kuramoto(r.beliefs);
    const T = normT(popStd(r.beliefs));
    const H = shannonH(r.beliefs);
    const structural = 1 - R;
    const thermal = T * H;
    // Δτ: 下一轮 tau - 当前轮 tau
    const nextTau = i + 1 < exp.rounds.length ? exp.rounds[i + 1].tau : r.tau;
    const deltaTau = nextTau - r.tau;
    events.push({
      structural, thermal,
      structuralDominant: structural > thermal,
      deltaTau,
      task,
      round: r.roundNumber,
    });
  }
}

console.log(`\nforce_reflection 事件总数: ${events.length}`);
const structuralEvents = events.filter(e => e.structuralDominant);
const thermalEvents = events.filter(e => !e.structuralDominant);
console.log(`  结构性主导 (1-R > T·H): ${structuralEvents.length} 次`);
console.log(`  热性主导   (T·H ≥ 1-R): ${thermalEvents.length} 次`);

console.log(`\n=== 分组 Δτ 对比 ===`);
console.log(`结构性主导: 平均 Δτ = ${mean(structuralEvents.map(e => e.deltaTau)).toFixed(4)} (n=${structuralEvents.length})`);
console.log(`热性主导:   平均 Δτ = ${mean(thermalEvents.map(e => e.deltaTau)).toFixed(4)} (n=${thermalEvents.length})`);

// 分任务
console.log(`\n=== 分任务 ===`);
for (const t of ["Crisis", "Supplier"]) {
  const tEvents = events.filter(e => e.task === t);
  const tStruct = tEvents.filter(e => e.structuralDominant);
  const tThermal = tEvents.filter(e => !e.structuralDominant);
  console.log(`${t}: 结构性 ${tStruct.length}次 Δτ=${mean(tStruct.map(e=>e.deltaTau)).toFixed(4)} | 热性 ${tThermal.length}次 Δτ=${mean(tThermal.map(e=>e.deltaTau)).toFixed(4)}`);
}

// 置换检验：两组 Δτ 差异是否显著
function permutationTest(a: number[], b: number[], nPerms = 5000): number {
  const observed = Math.abs(mean(a) - mean(b));
  const combined = [...a, ...b];
  const nA = a.length;
  let count = 0;
  for (let p = 0; p < nPerms; p++) {
    // Fisher-Yates shuffle
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [combined[i], combined[j]] = [combined[j], combined[i]];
    }
    const permA = combined.slice(0, nA);
    const permB = combined.slice(nA);
    if (Math.abs(mean(permA) - mean(permB)) >= observed) count++;
  }
  return (count + 1) / (nPerms + 1);
}

if (structuralEvents.length >= 3 && thermalEvents.length >= 3) {
  const p = permutationTest(
    structuralEvents.map(e => e.deltaTau),
    thermalEvents.map(e => e.deltaTau)
  );
  console.log(`\n置换检验 p-value: ${p.toFixed(4)} (5000 perms)`);
  console.log(`  (p<0.05 → 两组 Δτ 差异显著，支持假设1的方向性)`);
} else {
  console.log(`\n样本不足，无法做置换检验（需每组≥3）`);
}

// Cohen's d
function cohensD(a: number[], b: number[]): number {
  const ma = mean(a), mb = mean(b);
  const va = a.length > 1 ? a.reduce((s, x) => s + (x - ma) ** 2, 0) / (a.length - 1) : 0;
  const vb = b.length > 1 ? b.reduce((s, x) => s + (x - mb) ** 2, 0) / (b.length - 1) : 0;
  const pooled = Math.sqrt((va + vb) / 2);
  return pooled > 0 ? (ma - mb) / pooled : 0;
}
if (structuralEvents.length >= 2 && thermalEvents.length >= 2) {
  const d = cohensD(
    structuralEvents.map(e => e.deltaTau),
    thermalEvents.map(e => e.deltaTau)
  );
  console.log(`Cohen's d: ${d.toFixed(3)} (正=结构性组Δτ更高)`);
}

console.log(`\n=== 结论判断 ===`);
const structMean = mean(structuralEvents.map(e => e.deltaTau));
const thermalMean = mean(thermalEvents.map(e => e.deltaTau));
if (structMean > thermalMean) {
  console.log(`✅ 假设1方向性支持: 结构性主导时 force_reflection 的 Δτ (${structMean.toFixed(4)}) > 热性主导 (${thermalMean.toFixed(4)})`);
} else {
  console.log(`⚠️ 假设1方向性不支持: 结构性主导 Δτ (${structMean.toFixed(4)}) ≤ 热性主导 (${thermalMean.toFixed(4)})`);
  console.log(`   → 若差异不显著，说明 force_reflection 对两种无序的效果无差别，纯映射假设过强`);
}

// === 对照回测：reduce_weight（假设2：reduce_weight ↔ T·H 热性无序）===
console.log(`\n=== 对照：reduce_weight 假设2回测 ===`);
const rwEvents: ForceReflEvent[] = [];
for (const exp of all) {
  if (!exp.rounds) continue;
  const task = crisis.includes(exp) ? "Crisis" : "Supplier";
  for (let i = 0; i < exp.rounds.length; i++) {
    const r = exp.rounds[i];
    const hasRW = r.interventions && r.interventions.some(iv => iv.type === "reduce_weight");
    if (!hasRW) continue;
    if (!r.beliefs || Object.keys(r.beliefs).length === 0) continue;
    const R = kuramoto(r.beliefs);
    const T = normT(popStd(r.beliefs));
    const H = shannonH(r.beliefs);
    const structural = 1 - R;
    const thermal = T * H;
    const nextTau = i + 1 < exp.rounds.length ? exp.rounds[i + 1].tau : r.tau;
    const deltaTau = nextTau - r.tau;
    rwEvents.push({ structural, thermal, structuralDominant: structural > thermal, deltaTau, task, round: r.roundNumber });
  }
}
const rwStruct = rwEvents.filter(e => e.structuralDominant);
const rwThermal = rwEvents.filter(e => !e.structuralDominant);
console.log(`reduce_weight: n=${rwEvents.length}, 结构性主导 ${rwStruct.length}次 Δτ=${mean(rwStruct.map(e=>e.deltaTau)).toFixed(4)}, 热性主导 ${rwThermal.length}次 Δτ=${mean(rwThermal.map(e=>e.deltaTau)).toFixed(4)}`);
if (rwThermal.length > 0 && rwStruct.length > 0) {
  const diff = mean(rwThermal.map(e=>e.deltaTau)) - mean(rwStruct.map(e=>e.deltaTau));
  console.log(`热性-结构性 Δτ差: ${diff.toFixed(4)} (正=假设2方向支持：热性主导时 reduce_weight 更有效)`);
}
// 假设2的置换检验 + Cohen's d（与假设1同等标准）
if (rwStruct.length >= 3 && rwThermal.length >= 3) {
  const rwP = permutationTest(
    rwThermal.map(e => e.deltaTau),
    rwStruct.map(e => e.deltaTau)
  );
  console.log(`置换检验 p-value: ${rwP.toFixed(4)} (5000 perms)`);
  console.log(`  (p<0.05 → 假设2方向性显著支持)`);
  const rwD = cohensD(
    rwThermal.map(e => e.deltaTau),
    rwStruct.map(e => e.deltaTau)
  );
  console.log(`Cohen's d: ${rwD.toFixed(3)} (正=热性组Δτ更高，支持假设2)`);
  const rwStructMean = mean(rwStruct.map(e => e.deltaTau));
  const rwThermalMean = mean(rwThermal.map(e => e.deltaTau));
  if (rwThermalMean > rwStructMean && rwP < 0.05) {
    console.log(`✅ 假设2严格确证: 热性主导 Δτ (${rwThermalMean.toFixed(4)}) > 结构性主导 (${rwStructMean.toFixed(4)}), p=${rwP.toFixed(4)}`);
  } else if (rwThermalMean > rwStructMean) {
    console.log(`⚠️ 假设2方向支持但不显著: 热性 Δτ > 结构性, p=${rwP.toFixed(4)} (未达0.05)`);
  } else {
    console.log(`❌ 假设2方向不支持: 热性 Δτ ≤ 结构性`);
  }
} else {
  console.log(`样本不足，无法做置换检验（需每组≥3）`);
}
