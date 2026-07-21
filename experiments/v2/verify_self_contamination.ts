/**
 * 自污染核实：A/B 对照实验中 F 分解与固定排序是否真的趋同
 *
 * 不修改任何实验数据，只读 analysis。
 *
 * 核实三件事：
 * 1. Crisis 任务每轮的 F-state 分布（structural 主导 vs thermal 主导）
 * 2. A 组（F 分解）和 B 组（固定排序）每轮实际执行的干预序列
 * 3. 两种排序产出的"顺序"是否实际趋同
 *
 * 运行：npx tsx experiments/v2/verify_self_contamination.ts
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
  ablation: string;
}

// === 热力学计算（与 backtest_weight_assumption.ts 完全一致）===
function kuramoto(beliefs: Record<string, number>): number {
  const vals = Object.values(beliefs);
  if (vals.length === 0) return 0;
  const angles = vals.map(b => b * Math.PI / 2); // θ = (π/2)·b
  let sr = 0, si = 0;
  for (const a of angles) { sr += Math.cos(a); si += Math.sin(a); }
  return Math.sqrt(sr * sr + si * si) / vals.length;
}

function popStd(beliefs: Record<string, number>): number {
  const vals = Object.values(beliefs);
  if (vals.length === 0) return 0;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, v) => s + (v - m) * (v - m), 0) / vals.length);
}

function normT(std: number): number {
  return Math.min(1, Math.max(0, std / 1)); // belief∈[-1,1], maxStd=1
}

function shannonH(beliefs: Record<string, number>, bins = 5, min = -1, max = 1): number {
  const values = Object.values(beliefs);
  if (values.length === 0) return 0;
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

// === F 分解排序逻辑（与 governance/index.ts:794-832 完全一致）===
// 修正后的 alignmentScore：force_reflection = thermal·(1-structural)
function fdecompositionOrder(
  interventions: Array<{ type: string }>,
  beliefs: Record<string, number>
): Array<{ type: string; score: number }> {
  if (interventions.length <= 1) {
    return interventions.map(i => ({ ...i, score: 0 }));
  }
  const vals = Object.values(beliefs);
  const R = kuramoto(beliefs);
  const T = normT(popStd(beliefs));
  const H = shannonH(beliefs);
  const structural = 1 - R;
  const thermal = T * H;
  const F = structural + thermal;

  const score = (type: string): number => {
    switch (type) {
      case "force_reflection":
        return thermal * (1 - structural); // 修正后
      case "reduce_weight":
        return thermal;
      case "introduce_diversity":
        return R * (1 - H);
      case "continue_discussion":
        return R * (1 - H) * (1 - F);
      default:
        return 0;
    }
  };

  return [...interventions]
    .map(i => ({ ...i, score: score(i.type) }))
    .sort((a, b) => b.score - a.score);
}

// 固定排序：保持 push 顺序（reduce_weight → introduce_diversity → force_reflection → continue_discussion）
function fixedOrder(interventions: Array<{ type: string }>): Array<{ type: string; score: number }> {
  return interventions.map(i => ({ ...i, score: 0 }));
}

function loadExp(fp: string): ExperimentData | null {
  try { return JSON.parse(fs.readFileSync(fp, "utf8")); } catch { return null; }
}

// ============================================================

const DATA_DIR = path.resolve(__dirname, "data_crisis");

console.log("=".repeat(80));
console.log("  自污染核实：F 分解排序 vs 固定排序在 Crisis 任务上是否趋同");
console.log("=".repeat(80));

// 收集每轮的 F-state + A/B 干预序列对比
interface RoundInfo {
  file: string;
  round: number;
  R: number;
  T: number;
  H: number;
  structural: number; // 1-R
  thermal: number;    // T·H
  dominant: "structural" | "thermal" | "tie";
  interventionsA: string[]; // A 组（F 分解）该轮触发的干预类型
  interventionsB: string[]; // B 组（固定）该轮触发的干预类型
  fdecompOrder: string[];    // F 分解排序后的顺序
  fixedOrderList: string[];  // 固定排序的顺序
  ordersMatch: boolean;      // 两种排序的顺序是否相同
}

const rounds: RoundInfo[] = [];

for (let i = 0; i < 8; i++) {
  const fpA = path.join(DATA_DIR, `crisis_full_${i}.json`);
  const fpB = path.join(DATA_DIR, `crisis_full_fixed_${i}.json`);
  const expA = loadExp(fpA);
  const expB = loadExp(fpB);
  if (!expA || !expB) continue;

  const maxRounds = Math.min(expA.rounds?.length || 0, expB.rounds?.length || 0);
  for (let r = 0; r < maxRounds; r++) {
    const rA = expA.rounds[r];
    const rB = expB.rounds[r];
    if (!rA?.beliefs || Object.keys(rA.beliefs).length === 0) continue;

    const R = kuramoto(rA.beliefs);
    const T = normT(popStd(rA.beliefs));
    const H = shannonH(rA.beliefs);
    const structural = 1 - R;
    const thermal = T * H;
    const dominant =
      Math.abs(structural - thermal) < 0.01 ? "tie" :
      structural > thermal ? "structural" : "thermal";

    const ivA = rA.interventions || [];
    const ivB = rB.interventions || [];
    const typesA = ivA.map(x => x.type);
    const typesB = ivB.map(x => x.type);

    // F 分解排序后的顺序（用 A 组该轮的 beliefs 作为状态输入）
    const fdecomp = fdecompositionOrder(ivA, rA.beliefs).map(x => x.type);
    // 固定排序的顺序（保持 push 顺序）
    const fixed = fixedOrder(ivB).map(x => x.type);

    rounds.push({
      file: `crisis_full_${i}.json`,
      round: rA.roundNumber,
      R, T, H, structural, thermal, dominant,
      interventionsA: typesA,
      interventionsB: typesB,
      fdecompOrder: fdecomp,
      fixedOrderList: fixed,
      ordersMatch: JSON.stringify(fdecomp) === JSON.stringify(fixed),
    });
  }
}

// === 1. F-state 分布 ===
console.log("\n" + "─".repeat(80));
console.log("  1. Crisis 任务每轮的 F-state 分布");
console.log("─".repeat(80));
const dominantCount = { structural: 0, thermal: 0, tie: 0 };
for (const r of rounds) dominantCount[r.dominant]++;
console.log(`  总轮数: ${rounds.length}`);
console.log(`  结构性主导 (1-R > T·H): ${dominantCount.structural} 轮 (${(dominantCount.structural/rounds.length*100).toFixed(1)}%)`);
console.log(`  热性主导   (T·H ≥ 1-R): ${dominantCount.thermal} 轮 (${(dominantCount.thermal/rounds.length*100).toFixed(1)}%)`);
console.log(`  平局:                  ${dominantCount.tie} 轮`);

console.log("\n  逐轮明细：");
console.log("  file                    | round |   R    |   T    |   H    | struct | thermal | dominant  | 触发干预(A组)");
console.log("  ------------------------|-------|--------|--------|--------|--------|---------|-----------|---------------");
for (const r of rounds) {
  console.log(`  ${r.file} | ${String(r.round).padStart(5)} | ${r.R.toFixed(4)} | ${r.T.toFixed(4)} | ${r.H.toFixed(4)} | ${r.structural.toFixed(4)} | ${r.thermal.toFixed(4).padStart(7)} | ${r.dominant.padEnd(9)} | ${r.interventionsA.join(",") || "(none)"}`);
}

// === 2. 每轮触发了哪些干预 + 多干预并发率 ===
console.log("\n" + "─".repeat(80));
console.log("  2. 多干预并发率（F 分解排序是否有实际作用对象）");
console.log("─".repeat(80));
const multiInterventionRounds = rounds.filter(r => r.interventionsA.length >= 2);
console.log(`  ≥2 个干预并发的轮: ${multiInterventionRounds.length}/${rounds.length} (${(multiInterventionRounds.length/rounds.length*100).toFixed(1)}%)`);
console.log(`  ≤1 个干预的轮:     ${rounds.length - multiInterventionRounds.length}/${rounds.length} （排序对这些轮无意义）`);

// === 3. 关键：F 分解排序 vs 固定排序的实际顺序对比 ===
console.log("\n" + "─".repeat(80));
console.log("  3. F 分解排序 vs 固定排序：实际顺序是否趋同（自污染核实）");
console.log("─".repeat(80));
console.log("  只看 ≥2 个干预并发的轮（排序才有意义）：");
console.log("");
console.log("  file                    | round | dominant  | F分解顺序              | 固定顺序               | 趋同?");
console.log("  ------------------------|-------|-----------|------------------------|------------------------|------");
let convergeCount = 0;
for (const r of multiInterventionRounds) {
  const f = r.fdecompOrder.join(",");
  const x = r.fixedOrderList.join(",");
  const match = r.ordersMatch ? "是" : "否";
  if (r.ordersMatch) convergeCount++;
  console.log(`  ${r.file} | ${String(r.round).padStart(5)} | ${r.dominant.padEnd(9)} | ${f.padEnd(22)} | ${x.padEnd(22)} | ${match}`);
}
console.log("");
console.log(`  趋同率: ${convergeCount}/${multiInterventionRounds.length} (${multiInterventionRounds.length > 0 ? (convergeCount/multiInterventionRounds.length*100).toFixed(1) : 0}%)`);

// === 4. 自污染判定 ===
console.log("\n" + "─".repeat(80));
console.log("  4. 自污染判定");
console.log("─".repeat(80));
const thermalDominant = rounds.filter(r => r.dominant === "thermal");
const thermalDominantMulti = thermalDominant.filter(r => r.interventionsA.length >= 2);
const thermalConverge = thermalDominantMulti.filter(r => r.ordersMatch);

console.log(`  热性主导轮数: ${thermalDominant.length}/${rounds.length}`);
console.log(`  其中 ≥2 干预并发的: ${thermalDominantMulti.length}`);
console.log(`  其中 F 分解 = 固定排序的: ${thermalConverge.length}`);
console.log("");
if (thermalDominant.length / rounds.length > 0.7 && multiInterventionRounds.length > 0) {
  const convergeRate = convergeCount / multiInterventionRounds.length;
  if (convergeRate > 0.5) {
    console.log("  ⚠️  自污染成立：");
    console.log(`     - Crisis 任务 ${ (thermalDominant.length/rounds.length*100).toFixed(0) }% 的轮次是热性主导`);
    console.log(`     - 在 ≥2 干预并发的轮中，${(convergeRate*100).toFixed(0)}% 的情况下 F 分解和固定排序产出相同顺序`);
    console.log(`     - 这意味着 A/B 对照的"处理差异"被系统性稀释，d_z 被噪声拉向 0`);
    console.log("     - 结论：H_F 的'未支持'部分源于设计趋同，而非 F 分解本身无效");
  } else {
    console.log("  ⚪ 自污染不成立：");
    console.log(`     - 虽然热性主导占 ${(thermalDominant.length/rounds.length*100).toFixed(0)}%，但 F 分解和固定排序在多干预并发时趋同率仅 ${(convergeRate*100).toFixed(0)}%`);
    console.log("     - 两种排序确实产出了不同顺序，A/B 对照有实际处理差异");
  }
} else {
  console.log("  ⚪ 自污染不成立：Crisis 任务并非主要由热性主导，或没有多干预并发的轮");
}

// === 5. Δτ 重算准备：标记哪些 force_reflection 事件是"唯一干预" ===
console.log("\n" + "─".repeat(80));
console.log("  5. H1 回测 Δτ 重算准备：force_reflection 作为'唯一干预'的样本");
console.log("─".repeat(80));
console.log("  （观察性研究的混杂清洗，不修改原数据，只标记可清洗的样本）");
console.log("");

// 注意：rounds[i].beliefs 来自 rr.opinions[].belief（LLM 本轮发言），
// force_reflection 修改的是 agentStates（朝均值拉近 20%），不改 opinions。
// 所以 r.beliefs 对 force_reflection 是"干预前快照"——F-state 计算语义正确。
// Δτ = nextTau - r.tau 测的是"下一轮 LLM 发言的变化"——捕获 force_reflection
// 的 prompt 注入延迟效应（LLM 看到反思 prompt 后下一轮重新发言）。
// 即时公式效应（agentStates 改了）不被 r.tau/nextTau 捕获（tau 基于 opinions）。

// 扫描 crisis_full + supplier_full
interface ForceReflEvent {
  file: string;
  task: string;
  round: number;
  structural: number;
  thermal: number;
  structuralDominant: boolean;
  deltaTau: number;         // 原始：下一轮 tau - 当前轮 tau（含漂移）
  isSoleIntervention: boolean; // 该轮 force_reflection 是唯一干预
  otherInterventionsSameRound: string[];
}

const events: ForceReflEvent[] = [];

const dirs = [
  { dir: path.resolve(__dirname, "data_crisis"), prefix: "crisis_full_", task: "Crisis" },
  { dir: path.resolve(__dirname, "data_supplier"), prefix: "supplier_full_", task: "Supplier" },
];

for (const { dir, prefix, task } of dirs) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith(prefix) || !f.endsWith(".json")) continue;
    // 排除 full_fixed（B 组）
    if (f.includes("full_fixed")) continue;
    const exp = loadExp(path.join(dir, f));
    if (!exp?.rounds) continue;
    for (let i = 0; i < exp.rounds.length; i++) {
      const r = exp.rounds[i];
      const hasFR = r.interventions?.some(iv => iv.type === "force_reflection");
      if (!hasFR) continue;
      if (!r.beliefs || Object.keys(r.beliefs).length === 0) continue;

      const R = kuramoto(r.beliefs);
      const T = normT(popStd(r.beliefs));
      const H = shannonH(r.beliefs);
      const structural = 1 - R;
      const thermal = T * H;

      const nextTau = i + 1 < exp.rounds.length ? exp.rounds[i + 1].tau : r.tau;
      const deltaTau = nextTau - r.tau;

      const otherIv = (r.interventions || []).filter(iv => iv.type !== "force_reflection").map(iv => iv.type);
      const isSole = otherIv.length === 0;

      events.push({
        file: f, task, round: r.roundNumber,
        structural, thermal,
        structuralDominant: structural > thermal,
        deltaTau,
        isSoleIntervention: isSole,
        otherInterventionsSameRound: otherIv,
      });
    }
  }
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

console.log(`  force_reflection 事件总数: ${events.length}`);
const soleEvents = events.filter(e => e.isSoleIntervention);
const contaminatedEvents = events.filter(e => !e.isSoleIntervention);
console.log(`  唯一干预（清洗后可用）: ${soleEvents.length}`);
console.log(`  同轮有其他干预（污染）: ${contaminatedEvents.length}`);
console.log("");

// 三个版本的数据全集（提到顶层作用域，便于第 7 节使用）
const origStruct = events.filter(e => e.structuralDominant);
const origThermal = events.filter(e => !e.structuralDominant);
const soleStruct = soleEvents.filter(e => e.structuralDominant);
const soleThermal = soleEvents.filter(e => !e.structuralDominant);

// 原始分组（n=97）
console.log("  【原始回测（含污染，n=" + events.length + "）】");
console.log(`    结构性主导: n=${origStruct.length}, 平均 Δτ = ${mean(origStruct.map(e=>e.deltaTau)).toFixed(4)}`);
console.log(`    热性主导:   n=${origThermal.length}, 平均 Δτ = ${mean(origThermal.map(e=>e.deltaTau)).toFixed(4)}`);
console.log("");

// 清洗后分组
if (soleEvents.length > 0) {
  console.log("  【清洗后回测（仅唯一干预，n=" + soleEvents.length + "）】");
  console.log(`    结构性主导: n=${soleStruct.length}, 平均 Δτ = ${mean(soleStruct.map(e=>e.deltaTau)).toFixed(4)}`);
  console.log(`    热性主导:   n=${soleThermal.length}, 平均 Δτ = ${mean(soleThermal.map(e=>e.deltaTau)).toFixed(4)}`);
  console.log("");
  console.log("  对比解读：");
  console.log(`    - 原始结构性 Δτ = ${mean(origStruct.map(e=>e.deltaTau)).toFixed(4)} → 清洗后 ${mean(soleStruct.map(e=>e.deltaTau)).toFixed(4)}`);
  console.log(`    - 原始热性   Δτ = ${mean(origThermal.map(e=>e.deltaTau)).toFixed(4)} → 清洗后 ${mean(soleThermal.map(e=>e.deltaTau)).toFixed(4)}`);
  console.log("    - 如果方向不变（热性 > 结构性），说明 H1 证伪稳健；");
  console.log("    - 如果方向消失或反转，说明 H1 证伪是被混杂支撑的");
} else {
  console.log("  ⚠️  没有找到'唯一干预'样本，所有 force_reflection 都被其他干预污染——H1 回测归因完全混淆");
}

// === 6. 选择偏差诊断：清洗后 33 样本 vs 被排除的 64 样本的特征分布 ===
console.log("\n" + "─".repeat(80));
console.log("  6. 选择偏差诊断：清洗后样本 vs 被排除样本的特征分布");
console.log("─".repeat(80));
console.log("");

// 关键发现：Round 3 事件没有下一轮可参考，nextTau = r.tau → Δτ = 0。
// 这等于"假设 force_reflection 在最后一轮无效果"，是回测脚本的 bug。
// 12/33 个清洗后样本是 Round 3，全部 Δτ=0，把均值拉向 0。
// Round 3 在两组占比不同（结构性 3/9 vs 热性 9/24）→ 直接污染均值比较。
// 正确做法：剔除 Round 3 事件，只在有 nextTau 的样本上算 Δτ。

// 6.1 task 分布
console.log("  【6.1 任务分布】");
for (const t of ["Crisis", "Supplier"]) {
  const sole = soleEvents.filter(e => e.task === t).length;
  const contaminated = contaminatedEvents.filter(e => e.task === t).length;
  console.log(`    ${t}: 清洗后 ${sole} / 被排除 ${contaminated}`);
}
console.log("");

// 6.2 round 分布（关键：最后一轮无 nextTau，会用 r.tau → Δτ=0）
console.log("  【6.2 轮次分布】");
for (const r of [1, 2, 3]) {
  const sole = soleEvents.filter(e => e.round === r).length;
  const contaminated = contaminatedEvents.filter(e => e.round === r).length;
  console.log(`    Round ${r}: 清洗后 ${sole} / 被排除 ${contaminated}`);
}
console.log("");

// 6.3 同轮其他干预类型分布（看被排除样本里 force_reflection 是和谁绑定的）
console.log("  【6.3 被排除样本中'同轮其他干预'的分布（一个事件可能算多次）】");
const otherIvCount: Record<string, number> = {};
for (const e of contaminatedEvents) {
  for (const iv of e.otherInterventionsSameRound) {
    otherIvCount[iv] = (otherIvCount[iv] || 0) + 1;
  }
}
for (const [iv, n] of Object.entries(otherIvCount)) {
  console.log(`    ${iv}: ${n} 次`);
}
console.log("");

// 6.4 F-state 分布对比
console.log("  【6.4 F-state 分布】");
const soleStructCount = soleEvents.filter(e => e.structuralDominant).length;
const contStructCount = contaminatedEvents.filter(e => e.structuralDominant).length;
console.log(`    清洗后样本: 结构性主导 ${soleStructCount}/${soleEvents.length} (${(soleStructCount/soleEvents.length*100).toFixed(0)}%)`);
console.log(`    被排除样本: 结构性主导 ${contStructCount}/${contaminatedEvents.length} (${(contStructCount/contaminatedEvents.length*100).toFixed(0)}%)`);
console.log("");

// 6.5 详细列出 33 个清洗后样本的 Δτ（看异常值）
console.log("  【6.5 清洗后 33 样本逐条明细】");
console.log("  task     | file                    | round | dominant  | structural | thermal | Δτ");
console.log("  ---------|-------------------------|-------|-----------|------------|---------|--------");
for (const e of soleEvents.sort((a,b) => a.deltaTau - b.deltaTau)) {
  const dom = e.structuralDominant ? "struct" : "thermal";
  console.log(`  ${e.task.padEnd(8)} | ${e.file.padEnd(23)} | ${String(e.round).padStart(5)} | ${dom.padEnd(9)} | ${(e.structural).toFixed(4).padStart(10)} | ${e.thermal.toFixed(4).padStart(7)} | ${e.deltaTau.toFixed(4)}`);
}
console.log("");

// 6.6 关键诊断：是否最后一轮事件被错误地 Δτ=0
const lastRoundSole = soleEvents.filter(e => e.round === 3);
console.log("  【6.6 最后一轮事件检查】");
console.log(`    清洗后样本中 Round 3 事件: ${lastRoundSole.length}/${soleEvents.length}`);
const lastRoundDz = lastRoundSole.map(e => e.deltaTau);
console.log(`    这些 Round 3 事件的 Δτ: ${lastRoundDz.map(d => d.toFixed(3)).join(", ")}`);
console.log("");

// 6.7 runIndex 分布（看是否集中在特定实验）
console.log("  【6.7 清洗后样本的实验分布】");
const fileCount: Record<string, number> = {};
for (const e of soleEvents) {
  fileCount[e.file] = (fileCount[e.file] || 0) + 1;
}
for (const [f, n] of Object.entries(fileCount).sort((a,b) => b[1]-a[1])) {
  console.log(`    ${f}: ${n} 次`);
}

// === 7. 正确清洗：剔除 Round 3 + 唯一干预 ===
console.log("\n" + "=".repeat(80));
console.log("  7. 正确清洗：剔除 Round 3（无 nextTau）+ 仅唯一干预");
console.log("=".repeat(80));
console.log("");

// 筛选：force_reflection 是该轮唯一干预 + 不是最后一轮（有 nextTau）
const validEvents = events.filter(e => e.isSoleIntervention && e.round < 3);

console.log(`  原始事件: ${events.length}`);
console.log(`  剔除同轮有其他干预后: ${soleEvents.length}`);
console.log(`  进一步剔除 Round 3（无 nextTau）后: ${validEvents.length}`);
console.log("");

const validStruct = validEvents.filter(e => e.structuralDominant);
const validThermal = validEvents.filter(e => !e.structuralDominant);

console.log("  【正确清洗后的 H1 回测】");
console.log(`    结构性主导: n=${validStruct.length}, 平均 Δτ = ${mean(validStruct.map(e=>e.deltaTau)).toFixed(4)}`);
console.log(`    热性主导:   n=${validThermal.length}, 平均 Δτ = ${mean(validThermal.map(e=>e.deltaTau)).toFixed(4)}`);
console.log("");

// 三个版本对比
console.log("  【三个版本对比】");
console.log("  版本                          | n   | 结构性 n / Δτ       | 热性 n / Δτ         | 方向（热性-结构性）");
console.log("  ------------------------------|-----|---------------------|---------------------|--------------------");
const v1Struct = origStruct.map(e=>e.deltaTau);
const v1Thermal = origThermal.map(e=>e.deltaTau);
const v2Struct = soleStruct.map(e=>e.deltaTau);
const v2Thermal = soleThermal.map(e=>e.deltaTau);
const v3Struct = validStruct.map(e=>e.deltaTau);
const v3Thermal = validThermal.map(e=>e.deltaTau);
console.log(`  V1 原始（含污染，含Round3）      | ${events.length}  | ${v1Struct.length} / ${mean(v1Struct).toFixed(4).padStart(7)} | ${v1Thermal.length} / ${mean(v1Thermal).toFixed(4).padStart(7)} | ${(mean(v1Thermal)-mean(v1Struct)).toFixed(4)}`);
console.log(`  V2 仅唯一干预（含Round3零值）   | ${soleEvents.length}  | ${v2Struct.length} / ${mean(v2Struct).toFixed(4).padStart(7)} | ${v2Thermal.length} / ${mean(v2Thermal).toFixed(4).padStart(7)} | ${(mean(v2Thermal)-mean(v2Struct)).toFixed(4)}`);
console.log(`  V3 仅唯一干预+剔除Round3      | ${validEvents.length}  | ${v3Struct.length} / ${mean(v3Struct).toFixed(4).padStart(7)} | ${v3Thermal.length} / ${mean(v3Thermal).toFixed(4).padStart(7)} | ${(mean(v3Thermal)-mean(v3Struct)).toFixed(4)}`);
console.log("");

// V3 上的置换检验（如果样本足够）
if (validStruct.length >= 3 && validThermal.length >= 3) {
  // 用与 backtest 一致的 PRNG 规范
  const PERMUTATION_SEED = 42;
  const rng = mulberry32(PERMUTATION_SEED);
  const nPerms = 5000;
  const observed = Math.abs(mean(v3Thermal) - mean(v3Struct));
  const combined = [...v3Thermal, ...v3Struct];
  const nA = v3Thermal.length;
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
  const p = (count + 1) / (nPerms + 1);

  // Cohen's d
  const ma = mean(v3Thermal), mb = mean(v3Struct);
  const va = v3Thermal.length > 1 ? v3Thermal.reduce((s,x)=>s+(x-ma)**2,0)/(v3Thermal.length-1) : 0;
  const vb = v3Struct.length > 1 ? v3Struct.reduce((s,x)=>s+(x-mb)**2,0)/(v3Struct.length-1) : 0;
  const pooled = Math.sqrt((va+vb)/2);
  const d = pooled > 0 ? (ma - mb) / pooled : 0;

  console.log("  【V3 上的置换检验 + Cohen's d】");
  console.log(`    置换检验 p = ${p.toFixed(4)} (5000 perms, seed=42)`);
  console.log(`    Cohen's d = ${d.toFixed(3)} (正=热性 Δτ 更高，支持 H1 证伪方向)`);
  console.log("");
  if (mean(v3Thermal) > mean(v3Struct)) {
    console.log("  ✅ V3 方向与原始回测一致：热性主导时 force_reflection 更有效");
    console.log("     → H1 证伪方向稳健，原 p=0.041 可能被 Round 3 零值稀释但方向正确");
  } else {
    console.log("  ⚠️  V3 方向反转：清洗 Round 3 后热性 ≤ 结构性");
    console.log("     → H1 证伪方向不稳健，需要更严格的因果隔离");
  }
} else {
  console.log("  ⚠️  V3 样本不足（需每组≥3），无法做置换检验");
  console.log(`     结构性 n=${validStruct.length}, 热性 n=${validThermal.length}`);
}

// 逐条明细
console.log("");
console.log("  【V3 逐条明细（剔除 Round 3 后）】");
console.log("  task     | file                    | round | dominant  | Δτ");
console.log("  ---------|-------------------------|-------|-----------|--------");
for (const e of validEvents.sort((a,b) => a.deltaTau - b.deltaTau)) {
  const dom = e.structuralDominant ? "struct" : "thermal";
  console.log(`  ${e.task.padEnd(8)} | ${e.file.padEnd(23)} | ${String(e.round).padStart(5)} | ${dom.padEnd(9)} | ${e.deltaTau.toFixed(4)}`);
}
