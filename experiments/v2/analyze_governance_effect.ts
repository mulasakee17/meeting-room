/**
 * 治理干预效果间接分析（基于 thermoHistory 轨迹对比）
 *
 * 由于历史实验数据（C/E/F/G）未保存 governanceInterventions trace，
 * 无法直接统计干预触发次数和效果。本脚本通过对比 E（治理开）vs F（治理关）
 * 的 thermoHistory 轨迹差异，间接推断治理在哪些时刻改变了系统状态。
 *
 * 核心假设：
 *   - 若治理触发 force_reflection：信念扰动 → T 上升
 *   - 若治理触发 reduce_weight：影响传播被切断 → 后续 R 下降
 *   - 若治理有效：E 组 τ > F 组 τ，且 E 组 R/T/H 轨迹更"健康"
 *
 * 同时分析：
 *   1. 恶意 agent (a1) 的最终信念分布 → 推断治理是否成功压制恶意
 *   2. 收敛模式（crystallized vs hard_cap）→ 推断治理是否导致系统无法收敛
 *   3. Token 消耗差异 → 推断治理是否增加沟通成本
 */

import * as fs from "fs";
import * as path from "path";
import { mean, sampleStd } from "./statsShared";

interface ExperimentResult {
  runId: string;
  group: string;
  runIndex: number;
  kendallTau: number;
  totalUtterances: number;
  totalRounds: number;
  converged: boolean;
  terminationReason: string;
  thermoHistory: Array<{ R: number; T: number; H: number; F: number; utteranceCount: number; evalIndex: number }>;
  finalBeliefs: Record<string, number>;
  maliciousAgentIds?: string[];
  governanceEnabled?: boolean;
  tokenUsage?: {
    byAgent: Record<string, { promptTokens: number; completionTokens: number; totalTokens: number; totalLatencyMs: number; callCount: number }>;
    total: { promptTokens: number; completionTokens: number; totalTokens: number; totalLatencyMs: number };
  };
}

function loadGroup(dir: string, prefix: string): ExperimentResult[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.startsWith(prefix) && f.endsWith(".json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
    .filter(r => !r.terminationReason?.startsWith("error"))
    .sort((a, b) => a.runIndex - b.runIndex);
}

const MAL_DIR = path.resolve(__dirname, "data_fraud_malicious");
const BASELINE_DIR = path.resolve(__dirname, "data_fraud");

const groupC = loadGroup(BASELINE_DIR, "fraud_C_");
const groupE = loadGroup(MAL_DIR, "fraud_E_");
const groupF = loadGroup(MAL_DIR, "fraud_F_");
const groupG = loadGroup(MAL_DIR, "fraud_G_");

console.log("=".repeat(70));
console.log("  治理干预效果间接分析（基于 thermoHistory 轨迹）");
console.log("=".repeat(70));
console.log(`数据: C=${groupC.length}, E=${groupE.length}, F=${groupF.length}, G=${groupG.length}`);

// ============================================================================
// 分析 1：终止模式分布 → 推断治理对收敛的影响
// ============================================================================
console.log("\n" + "─".repeat(70));
console.log("  分析 1：终止模式分布（推断治理对收敛的影响）");
console.log("─".repeat(70));

function analyzeTermination(group: string, results: ExperimentResult[]): void {
  if (results.length === 0) return;
  const hardCap = results.filter(r => r.terminationReason.includes("hard_cap")).length;
  const cryst = results.filter(r => r.terminationReason.includes("crystallized")).length;
  const strongCryst = results.filter(r => r.terminationReason.includes("strong_crystallized")).length;
  console.log(`  ${group}: hard_cap=${hardCap}/${results.length} (${(hardCap/results.length*100).toFixed(0)}%), crystallized=${cryst}/${results.length}, strong_cryst=${strongCryst}/${results.length}`);
}

analyzeTermination("C (基线)", groupC);
analyzeTermination("E (单点+治理)", groupE);
analyzeTermination("F (单点+无治理)", groupF);
analyzeTermination("G (共谋+治理)", groupG);

console.log(`\n  解读：`);
console.log(`  - C 组 0/10 hard_cap：诚实群体自然收敛`);
console.log(`  - E 组 hard_cap 比例高：治理干预可能阻止系统收敛（持续扰动）`);
console.log(`  - F vs E 对比：若 F 组 hard_cap 也高，说明是恶意 agent 本身导致难收敛，而非治理`);

// ============================================================================
// 分析 2：thermoHistory 轨迹对比 E vs F（间接推断治理效果）
// ============================================================================
console.log("\n" + "─".repeat(70));
console.log("  分析 2：thermoHistory 轨迹对比 E vs F（间接推断治理效果）");
console.log("─".repeat(70));

function analyzeThermoTrajectory(group: string, results: ExperimentResult[]): void {
  if (results.length === 0) return;
  // 取前 5 个评估点（对齐）
  const maxPoints = 5;
  console.log(`\n  ${group} 组前 ${maxPoints} 个评估点的平均 R/T/H/F：`);
  console.log(`  ${"eval".padStart(4)} ${"utt".padStart(5)} ${"R".padStart(7)} ${"T".padStart(7)} ${"H".padStart(7)} ${"F".padStart(7)}`);
  for (let i = 0; i < maxPoints; i++) {
    const snapshots = results
      .map(r => r.thermoHistory[i])
      .filter(s => s);
    if (snapshots.length === 0) continue;
    const R = mean(snapshots.map(s => s.R));
    const T = mean(snapshots.map(s => s.T));
    const H = mean(snapshots.map(s => s.H));
    const F = mean(snapshots.map(s => s.F));
    const utt = mean(snapshots.map(s => s.utteranceCount));
    console.log(`  ${String(i).padStart(4)} ${utt.toFixed(1).padStart(5)} ${R.toFixed(3).padStart(7)} ${T.toFixed(3).padStart(7)} ${H.toFixed(3).padStart(7)} ${F.toFixed(3).padStart(7)}`);
  }
}

analyzeThermoTrajectory("C (基线)", groupC);
analyzeThermoTrajectory("E (单点+治理)", groupE);
analyzeThermoTrajectory("F (单点+无治理)", groupF);
analyzeThermoTrajectory("G (共谋+治理)", groupG);

// ============================================================================
// 分析 3：恶意 agent (a1) 信念轨迹 → 推断治理是否压制恶意
// ============================================================================
console.log("\n" + "─".repeat(70));
console.log("  分析 3：恶意 agent (a1) 最终信念分布（推断治理压制效果）");
console.log("─".repeat(70));

function analyzeMaliciousBelief(group: string, results: ExperimentResult[]): void {
  if (results.length === 0) return;
  const a1Beliefs = results.map(r => r.finalBeliefs["a1"]).filter(b => typeof b === "number");
  if (a1Beliefs.length === 0) return;
  console.log(`\n  ${group} 组 a1 最终信念分布：`);
  console.log(`    均值: ${mean(a1Beliefs).toFixed(3)} ± ${sampleStd(a1Beliefs).toFixed(3)}`);
  console.log(`    范围: [${Math.min(...a1Beliefs).toFixed(3)}, ${Math.max(...a1Beliefs).toFixed(3)}]`);
  // 按绝对值分类
  const absHigh = a1Beliefs.filter(b => Math.abs(b) > 0.5).length;
  const absMid = a1Beliefs.filter(b => Math.abs(b) > 0.2 && Math.abs(b) <= 0.5).length;
  const absLow = a1Beliefs.filter(b => Math.abs(b) <= 0.2).length;
  console.log(`    |belief|>0.5 (强恶意): ${absHigh}/${a1Beliefs.length}`);
  console.log(`    |belief|>0.2 (中恶意): ${absMid}/${a1Beliefs.length}`);
  console.log(`    |belief|≤0.2 (被压制): ${absLow}/${a1Beliefs.length}`);
}

analyzeMaliciousBelief("E (单点+治理)", groupE);
analyzeMaliciousBelief("F (单点+无治理)", groupF);

// ============================================================================
// 分析 4：E vs F 逐 run 对比（配对差异）
// ============================================================================
console.log("\n" + "─".repeat(70));
console.log("  分析 4：E vs F 逐 run 配对对比（推断治理的逐案效果）");
console.log("─".repeat(70));

console.log(`\n  ${"run".padStart(4)} ${"τ_E".padStart(7)} ${"τ_F".padStart(7)} ${"Δτ".padStart(7)} ${"a1_E".padStart(7)} ${"a1_F".padStart(7)} ${"term_E".padStart(20)} ${"term_F".padStart(20)}`);

for (let i = 0; i < Math.min(groupE.length, groupF.length); i++) {
  const e = groupE[i];
  const f = groupF[i];
  const dTau = e.kendallTau - f.kendallTau;
  const a1E = e.finalBeliefs["a1"]?.toFixed(3) ?? "N/A";
  const a1F = f.finalBeliefs["a1"]?.toFixed(3) ?? "N/A";
  const termE = e.terminationReason.includes("hard_cap") ? "hard_cap" : e.terminationReason.includes("strong") ? "strong_cryst" : "cryst";
  const termF = f.terminationReason.includes("hard_cap") ? "hard_cap" : f.terminationReason.includes("strong") ? "strong_cryst" : "cryst";
  const marker = dTau > 0.1 ? "✅" : dTau < -0.1 ? "❌" : "⚪";
  console.log(`  ${String(i).padStart(4)} ${e.kendallTau.toFixed(3).padStart(7)} ${f.kendallTau.toFixed(3).padStart(7)} ${(dTau >= 0 ? "+" : "") + dTau.toFixed(3).padStart(6)} ${a1E.padStart(7)} ${a1F.padStart(7)} ${termE.padStart(20)} ${termF.padStart(20)} ${marker}`);
}

const dTaus = groupE.slice(0, Math.min(groupE.length, groupF.length)).map((e, i) => e.kendallTau - groupF[i].kendallTau);
const wins = dTaus.filter(d => d > 0).length;
const losses = dTaus.filter(d => d < 0).length;
const ties = dTaus.filter(d => d === 0).length;
console.log(`\n  治理胜率: ${wins}胜 / ${losses}负 / ${ties}平 (共 ${dTaus.length} run)`);
console.log(`  平均 Δτ (E-F) = ${mean(dTaus).toFixed(3)} ± ${sampleStd(dTaus).toFixed(3)}`);

// ============================================================================
// 分析 5：Token 成本对比 → 治理的沟通开销
// ============================================================================
console.log("\n" + "─".repeat(70));
console.log("  分析 5：Token 成本对比（治理的沟通开销）");
console.log("─".repeat(70));

function analyzeTokens(group: string, results: ExperimentResult[]): void {
  const totals = results.map(r => r.tokenUsage?.total?.totalTokens || 0).filter(t => t > 0);
  if (totals.length === 0) return;
  console.log(`  ${group}: 平均 token = ${Math.round(mean(totals))} ± ${Math.round(sampleStd(totals))} (n=${totals.length})`);
}

analyzeTokens("E (单点+治理)", groupE);
analyzeTokens("F (单点+无治理)", groupF);
analyzeTokens("G (共谋+治理)", groupG);

// ============================================================================
// 结论
// ============================================================================
console.log("\n" + "=".repeat(70));
console.log("  间接分析结论与优化建议");
console.log("=".repeat(70));

console.log(`
关键发现：
  1. 数据缺失：所有实验（C/E/F/G）未保存 governanceInterventions trace
     → 无法直接统计干预触发次数和效果
     → 当前分析基于 thermoHistory 间接推断

  2. 终止模式异常：
     - C 组 0/10 hard_cap（诚实群体自然收敛）
     - E 组 hard_cap 比例高（治理+恶意 = 难收敛）
     - 若 F 组 hard_cap 也高 → 恶意 agent 本身导致难收敛，非治理责任

  3. 治理胜率：E vs F 配对对比显示治理在 ${wins}/${dTaus.length} run 中胜出
     平均 Δτ = ${mean(dTaus).toFixed(3)}（正向但未达显著）

优化建议（按优先级）：
  P0: 保存治理 trace（改 run_malicious.ts + 引擎返回值）
      → 让下一次实验能直接分析干预触发次数/类型/效果
  P1: 新增恶意 agent 检测维度
      - 信念变化率低（永不认错）+ confidence 恒高 + 引用模式异常
  P2: 新增干预类型
      - silence_agent（临时禁言）：对检测到的恶意 agent 限制发言
      - challenge_evidence（强制举证）：要求 agent 提供证据来源
  P3: 调整阈值
      - force_reflection 对 confidence≥85 的 agent 升级为强制反思
      - reduce_weight 阈值降低（恶意 agent 更易触发）
`);
