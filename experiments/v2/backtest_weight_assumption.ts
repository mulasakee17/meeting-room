/**
 * 权重假设回测：验证假设1（force_reflection 主要作用于结构性无序）
 *
 * 方法：从 crisis_full + supplier_full 实验中提取每次 force_reflection 干预，
 * 按干预时系统的 (1-R) vs T·H 比值分桶，对比两组的 Δτ（干预后 tau 变化）。
 *
 * 局限：观察性研究，非因果确证（agent 在不同 F-state 非随机分配，存在混杂）。
 *
 * 修复记录：
 *   2026-07-21: 修复 Round 3 零值 bug。原逻辑 `nextTau = i+1<length ? rounds[i+1].tau : r.tau`
 *     导致最后一轮 force_reflection 被强制 Δτ=0，系统性低估效应。改为跳过无下一轮的事件。
 *   2026-07-21: 新增 V3 分析——仅唯一干预 + 排除 Round 3，隔离 force_reflection 纯净效应。
 */
import * as fs from "fs";
import * as path from "path";
import { mulberry32 } from "./statsShared";

interface Round {
  roundNumber: number;
  beliefs: Record<string, number>;
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
  return Math.min(1, Math.max(0, std / 1));
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
  structural: number;
  thermal: number;
  structuralDominant: boolean;
  deltaTau: number;
  task: string;
  round: number;
}

// ============================================================================
// V1: 全部 force_reflection 事件（已排除 Round 3，含同轮其他干预）
// ============================================================================
const events: ForceReflEvent[] = [];
let skippedRound3 = 0;

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
    // 排除 Round 3：无下一轮 tau 可参考
    if (i + 1 >= exp.rounds.length) { skippedRound3++; continue; }
    const deltaTau = exp.rounds[i + 1].tau - r.tau;
    events.push({
      structural, thermal,
      structuralDominant: structural > thermal,
      deltaTau,
      task,
      round: r.roundNumber,
    });
  }
}

console.log(`\nforce_reflection 事件总数: ${events.length} (跳过 Round 3: ${skippedRound3})`);
const structuralEvents = events.filter(e => e.structuralDominant);
const thermalEvents = events.filter(e => !e.structuralDominant);
console.log(`  结构性主导 (1-R > T*H): ${structuralEvents.length} 次`);
console.log(`  热性主导   (T*H >= 1-R): ${thermalEvents.length} 次`);

console.log(`\n=== V1 分组 Delta-tau 对比 ===`);
console.log(`结构性主导: 平均 Delta-tau = ${mean(structuralEvents.map(e => e.deltaTau)).toFixed(4)} (n=${structuralEvents.length})`);
console.log(`热性主导:   平均 Delta-tau = ${mean(thermalEvents.map(e => e.deltaTau)).toFixed(4)} (n=${thermalEvents.length})`);

// 分任务
console.log(`\n=== 分任务 ===`);
for (const t of ["Crisis", "Supplier"]) {
  const tEvents = events.filter(e => e.task === t);
  const tStruct = tEvents.filter(e => e.structuralDominant);
  const tThermal = tEvents.filter(e => !e.structuralDominant);
  console.log(`${t}: 结构性 ${tStruct.length}次 Delta-tau=${mean(tStruct.map(e=>e.deltaTau)).toFixed(4)} | 热性 ${tThermal.length}次 Delta-tau=${mean(tThermal.map(e=>e.deltaTau)).toFixed(4)}`);
}

// 置换检验
function permutationTest(a: number[], b: number[], nPerms = 5000): number {
  const observed = Math.abs(mean(a) - mean(b));
  const combined = [...a, ...b];
  const nA = a.length;
  const rng = mulberry32(20260719);
  let count = 0;
  for (let p = 0; p < nPerms; p++) {
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
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
  console.log(`\nV1 置换检验 p-value: ${p.toFixed(4)} (5000 perms)`);
  console.log(`  (p<0.05 -> 两组 Delta-tau 差异显著)`);
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
  console.log(`V1 Cohen's d: ${d.toFixed(3)} (正=结构性组Delta-tau更高)`);
}

console.log(`\n=== V1 结论判断 ===`);
const structMean = mean(structuralEvents.map(e => e.deltaTau));
const thermalMean = mean(thermalEvents.map(e => e.deltaTau));
const v1Direction = thermalMean - structMean;
console.log(`方向差 (热性 - 结构性): ${v1Direction.toFixed(4)}${v1Direction > 0 ? ' (热性更有效，与原始一致)' : ' (结构性更有效)'}`);

// ============================================================================
// V3: 唯一干预 force_reflection + 排除 Round 3（最干净的子集）
// ============================================================================
console.log(`\n\n=== V3 干净分析：force_reflection 唯一干预 + 排除 Round 3 ===`);

const soleFREvents: ForceReflEvent[] = [];

for (const exp of all) {
  if (!exp.rounds) continue;
  const task = crisis.includes(exp) ? "Crisis" : "Supplier";
  for (let i = 0; i < exp.rounds.length; i++) {
    const r = exp.rounds[i];
    // 仅 force_reflection
    if (!r.interventions || r.interventions.length !== 1) continue;
    if (r.interventions[0].type !== "force_reflection") continue;
    // 排除 Round 3
    if (i + 1 >= exp.rounds.length) continue;
    if (!r.beliefs || Object.keys(r.beliefs).length === 0) continue;

    const R = kuramoto(r.beliefs);
    const T = normT(popStd(r.beliefs));
    const H = shannonH(r.beliefs);
    const structural = 1 - R;
    const thermal = T * H;
    const deltaTau = exp.rounds[i + 1].tau - r.tau;

    soleFREvents.push({
      structural, thermal,
      structuralDominant: structural > thermal,
      deltaTau,
      task,
      round: r.roundNumber,
    });
  }
}

const soleStruct = soleFREvents.filter(e => e.structuralDominant);
const soleThermal = soleFREvents.filter(e => !e.structuralDominant);

console.log(`V3 事件总数: ${soleFREvents.length}`);
console.log(`  结构性主导: ${soleStruct.length} 次, 平均 Delta-tau = ${mean(soleStruct.map(e => e.deltaTau)).toFixed(4)}`);
console.log(`  热性主导:   ${soleThermal.length} 次, 平均 Delta-tau = ${mean(soleThermal.map(e => e.deltaTau)).toFixed(4)}`);
const v3Diff = mean(soleThermal.map(e => e.deltaTau)) - mean(soleStruct.map(e => e.deltaTau));
console.log(`  方向差 (热性 - 结构性): ${v3Diff.toFixed(4)}${v3Diff > 0 ? ' (与 V1 一致)' : ' (方向反转!)'}`);

if (soleStruct.length >= 3 && soleThermal.length >= 3) {
  const v3P = permutationTest(
    soleStruct.map(e => e.deltaTau),
    soleThermal.map(e => e.deltaTau)
  );
  console.log(`  V3 置换检验 p-value: ${v3P.toFixed(4)} (5000 perms)${v3P < 0.05 ? ' *' : ''}`);
  const v3D = cohensD(
    soleStruct.map(e => e.deltaTau),
    soleThermal.map(e => e.deltaTau)
  );
  console.log(`  V3 Cohen's d: ${v3D.toFixed(3)} (正=结构性组Delta-tau更高)`);
}

// 分任务
console.log(`  --- 分任务 ---`);
for (const t of ["Crisis", "Supplier"]) {
  const tEv = soleFREvents.filter(e => e.task === t);
  const tS = tEv.filter(e => e.structuralDominant);
  const tT = tEv.filter(e => !e.structuralDominant);
  console.log(`  ${t}: 结构性 ${tS.length}次 Delta-tau=${mean(tS.map(e=>e.deltaTau)).toFixed(4)} | 热性 ${tT.length}次 Delta-tau=${mean(tT.map(e=>e.deltaTau)).toFixed(4)}`);
}

// 分轮次
console.log(`  --- 分轮次 ---`);
for (const rd of [1, 2, 3]) {
  const rEv = soleFREvents.filter(e => e.round === rd);
  console.log(`  Round ${rd}: ${rEv.length} 次 (结构性 ${rEv.filter(e=>e.structuralDominant).length}, 热性 ${rEv.filter(e=>!e.structuralDominant).length})`);
}

// ============================================================================
// 汇总对比
// ============================================================================
console.log(`\n\n=== 汇总对比 ===`);
console.log(`版本            | n   | 结构性 n / Delta-tau | 热性 n / Delta-tau | 方向差  | p      | d`);
console.log(`V1 (排除R3)     | ${events.length.toString().padEnd(3)} | ${structuralEvents.length.toString().padEnd(2)} / ${mean(structuralEvents.map(e=>e.deltaTau)).toFixed(4).padEnd(8)} | ${thermalEvents.length.toString().padEnd(2)} / ${mean(thermalEvents.map(e=>e.deltaTau)).toFixed(4).padEnd(8)} | ${v1Direction.toFixed(4).padEnd(7)} | —      | —`);
if (soleStruct.length >= 3 && soleThermal.length >= 3) {
  const v1p = permutationTest(structuralEvents.map(e => e.deltaTau), thermalEvents.map(e => e.deltaTau));
  const v3p = permutationTest(soleStruct.map(e => e.deltaTau), soleThermal.map(e => e.deltaTau));
  const v1d = cohensD(structuralEvents.map(e => e.deltaTau), thermalEvents.map(e => e.deltaTau));
  const v3d = cohensD(soleStruct.map(e => e.deltaTau), soleThermal.map(e => e.deltaTau));
  console.log(`V3 (唯一干预)   | ${soleFREvents.length.toString().padEnd(3)} | ${soleStruct.length.toString().padEnd(2)} / ${mean(soleStruct.map(e=>e.deltaTau)).toFixed(4).padEnd(8)} | ${soleThermal.length.toString().padEnd(2)} / ${mean(soleThermal.map(e=>e.deltaTau)).toFixed(4).padEnd(8)} | ${v3Diff.toFixed(4).padEnd(7)} | ${v3p.toFixed(4).padEnd(6)} | ${v3d.toFixed(3)}`);
}

// ============================================================================
// 对照：reduce_weight 假设2回测（同样排除 Round 3）
// ============================================================================
console.log(`\n\n=== 对照：reduce_weight 假设2回测（排除 Round 3）===`);
let rwSkippedR3 = 0;
const rwEvents: ForceReflEvent[] = [];
for (const exp of all) {
  if (!exp.rounds) continue;
  const task = crisis.includes(exp) ? "Crisis" : "Supplier";
  for (let i = 0; i < exp.rounds.length; i++) {
    const r = exp.rounds[i];
    const hasRW = r.interventions && r.interventions.some(iv => iv.type === "reduce_weight");
    if (!hasRW) continue;
    if (!r.beliefs || Object.keys(r.beliefs).length === 0) continue;
    if (i + 1 >= exp.rounds.length) { rwSkippedR3++; continue; }
    const R = kuramoto(r.beliefs);
    const T = normT(popStd(r.beliefs));
    const H = shannonH(r.beliefs);
    const structural = 1 - R;
    const thermal = T * H;
    const deltaTau = exp.rounds[i + 1].tau - r.tau;
    rwEvents.push({ structural, thermal, structuralDominant: structural > thermal, deltaTau, task, round: r.roundNumber });
  }
}
const rwStruct = rwEvents.filter(e => e.structuralDominant);
const rwThermal = rwEvents.filter(e => !e.structuralDominant);
console.log(`reduce_weight: n=${rwEvents.length} (跳过 Round 3: ${rwSkippedR3}), 结构性主导 ${rwStruct.length}次 Delta-tau=${mean(rwStruct.map(e=>e.deltaTau)).toFixed(4)}, 热性主导 ${rwThermal.length}次 Delta-tau=${mean(rwThermal.map(e=>e.deltaTau)).toFixed(4)}`);
if (rwThermal.length > 0 && rwStruct.length > 0) {
  const diff = mean(rwThermal.map(e=>e.deltaTau)) - mean(rwStruct.map(e=>e.deltaTau));
  console.log(`热性-结构性 Delta-tau差: ${diff.toFixed(4)} (正=假设2方向支持)`);
}
if (rwStruct.length >= 3 && rwThermal.length >= 3) {
  const rwP = permutationTest(rwThermal.map(e=>e.deltaTau), rwStruct.map(e=>e.deltaTau));
  console.log(`置换检验 p-value: ${rwP.toFixed(4)} (5000 perms)`);
  const rwD = cohensD(rwThermal.map(e=>e.deltaTau), rwStruct.map(e=>e.deltaTau));
  console.log(`Cohen's d: ${rwD.toFixed(3)} (正=热性组Delta-tau更高，支持假设2)`);
}
