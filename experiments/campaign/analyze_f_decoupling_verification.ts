/**
 * F = U - T·H 解耦性验证脚本
 *
 * 核心问题：MeasurementLayer.ts:236 注释声称"新 F=U-T·H 三变量解耦(验证 r=0.274)"，
 * 但实际跑出 r=-0.2713 的那个 U 是标量 belief L1 范数 Σ|b_i|，
 * 与 MeasurementLayer.computeThermoState 的 utility 向量 L2 范数 mean(‖u_i‖/√K) 不是同一个量。
 *
 * 本脚本从 campaign native_cognitive 原始数据的 cognitiveTrajectory 重算
 * utility 向量 U = mean(‖u_i‖/√K)（与 computeThermoState L276-282 完全一致），
 * 配对 thermoHistory 的 T/H/R，验证 r(U, T·H) 是否真的 ≈ 0.274。
 *
 * 数据源：experiments/campaign/output/ 下各实验 raw 目录的 native_cognitive 文件 + pilot_output
 * 运行：npx tsx experiments/campaign/analyze_f_decoupling_verification.ts
 *
 * 零 API 成本，纯只读分析。
 */

import * as fs from "fs";
import * as path from "path";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";

// ============================================================================
// 类型定义
// ============================================================================

interface ThermoPoint {
  round: number;
  R: number;
  T: number;
  H: number;
  F: number;
}

interface CognitiveTrajectoryPoint {
  round: number;
  agentId: string;
  utility: Record<string, number>;
}

interface RawRunData {
  thermoHistory?: ThermoPoint[];
  cognitiveTrajectory?: CognitiveTrajectoryPoint[];
  experimentId?: string;
  runtimeMode?: string;
}

interface Observation {
  source: string;
  runId: string;
  round: number;
  U: number;      // 重算的 utility 向量 L2 范数 mean(‖u_i‖/√K)
  R: number;      // thermoHistory 的 R
  T: number;      // thermoHistory 的 T
  H: number;      // thermoHistory 的 H
  F_persisted: number;  // thermoHistory 的 F（应 = U - T·H）
  F_recomputed: number; // U - T·H（重算验证）
  TH: number;     // T·H
  oneMinusR: number; // 1-R（旧 F 分量）
  K: number;      // utility 向量维度
  nAgents: number; // 该轮 agent 数
}

// ============================================================================
// 统计工具
// ============================================================================

function pearsonCorrelation(x: number[], y: number[]): { r: number; p: number; n: number } {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { r: NaN, p: NaN, n };

  const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;

  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dxi = x[i] - mx;
    const dyi = y[i] - my;
    num += dxi * dyi;
    dx2 += dxi * dxi;
    dy2 += dyi * dyi;
  }

  if (dx2 === 0 || dy2 === 0) return { r: NaN, p: NaN, n };
  const r = num / Math.sqrt(dx2 * dy2);
  const tStat = r * Math.sqrt((n - 2) / (1 - r * r));
  const p = 2 * (1 - studentTcdf(Math.abs(tStat), n - 2));

  return { r, p, n };
}

function studentTcdf(t: number, df: number): number {
  // 正态近似（df>30 足够精确；小样本也可用）
  const z = t / Math.sqrt(1 + t * t / df);
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1.0 / (1.0 + p * x);
  const y = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  return sign * (1 - y * Math.exp(-x * x));
}

function partialCorrelation(x: number[], y: number[], z: number[]): { r: number; n: number } {
  const { r: rxy } = pearsonCorrelation(x, y);
  const { r: rxz } = pearsonCorrelation(x, z);
  const { r: ryz } = pearsonCorrelation(y, z);
  if (Math.abs(1 - rxz * rxz) < 1e-10 || Math.abs(1 - ryz * ryz) < 1e-10) {
    return { r: NaN, n: x.length };
  }
  const r = (rxy - rxz * ryz) / Math.sqrt((1 - rxz * rxz) * (1 - ryz * ryz));
  return { r, n: x.length };
}

function mean(xs: number[]): number {
  return xs.length > 0 ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN;
}

function std(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1));
}

// ============================================================================
// U 重算（与 MeasurementLayer.computeThermoState L276-282 完全一致）
// ============================================================================

function recomputeU(agents: CognitiveTrajectoryPoint[]): { U: number; K: number; nAgents: number } {
  if (agents.length === 0) return { U: NaN, K: 0, nAgents: 0 };

  const K = Object.keys(agents[0].utility).length;
  const sqrtK = Math.sqrt(Math.max(1, K));
  const U = agents.reduce((sum, a) => {
    const scores = Object.values(a.utility);
    const norm = Math.sqrt(scores.reduce((ss, v) => ss + v * v, 0)); // L2 范数
    return sum + norm / sqrtK;
  }, 0) / agents.length;

  return { U, K, nAgents: agents.length };
}

// ============================================================================
// 数据加载
// ============================================================================

function loadData(): Observation[] {
  const observations: Observation[] = [];
  const campaignRoot = path.resolve(__dirname);
  const outputRoot = path.join(campaignRoot, "output");
  const pilotRoot = path.join(campaignRoot, "pilot_output");

  // 收集所有 native_cognitive raw 文件
  const dataDirs: Array<{ dir: string; label: string }> = [];
  if (fs.existsSync(outputRoot)) {
    for (const expDir of fs.readdirSync(outputRoot)) {
      const rawDir = path.join(outputRoot, expDir, "raw");
      if (fs.existsSync(rawDir)) {
        dataDirs.push({ dir: rawDir, label: expDir });
      }
    }
  }
  if (fs.existsSync(pilotRoot)) {
    dataDirs.push({ dir: pilotRoot, label: "pilot" });
  }

  let totalFiles = 0;
  let validFiles = 0;
  let skippedNoTrajectory = 0;
  let skippedNoThermo = 0;

  for (const { dir, label } of dataDirs) {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      totalFiles++;

      const filePath = path.join(dir, file);
      const raw = safeJsonParse<RawRunData>(fs.readFileSync(filePath, "utf-8"), undefined);
      if (!raw) continue;

      if (!raw.cognitiveTrajectory || raw.cognitiveTrajectory.length === 0) {
        skippedNoTrajectory++;
        continue;
      }
      if (!raw.thermoHistory || raw.thermoHistory.length === 0) {
        skippedNoThermo++;
        continue;
      }

      // 按 round 分组 cognitiveTrajectory
      const agentsByRound = new Map<number, CognitiveTrajectoryPoint[]>();
      for (const point of raw.cognitiveTrajectory) {
        if (!agentsByRound.has(point.round)) {
          agentsByRound.set(point.round, []);
        }
        agentsByRound.get(point.round)!.push(point);
      }

      // 配对 thermoHistory
      for (const thermo of raw.thermoHistory) {
        const agents = agentsByRound.get(thermo.round);
        if (!agents || agents.length === 0) continue;

        const { U, K, nAgents } = recomputeU(agents);
        if (isNaN(U)) continue;

        const F_recomputed = U - thermo.T * thermo.H;

        observations.push({
          source: label,
          runId: file,
          round: thermo.round,
          U,
          R: thermo.R,
          T: thermo.T,
          H: thermo.H,
          F_persisted: thermo.F,
          F_recomputed,
          TH: thermo.T * thermo.H,
          oneMinusR: 1 - thermo.R,
          K,
          nAgents,
        });
      }
      validFiles++;
    }
  }

  console.log(`数据加载: ${totalFiles} 文件, ${validFiles} 有效, ${skippedNoTrajectory} 无 trajectory, ${skippedNoThermo} 无 thermoHistory`);
  console.log(`观测点: ${observations.length} (round-level)\n`);

  return observations;
}

// ============================================================================
// 主分析
// ============================================================================

function main() {
  console.log("=".repeat(80));
  console.log("F = U - T·H 解耦性验证");
  console.log("目标: 验证 r(U, T·H) 是否 ≈ 0.274 (MeasurementLayer.ts:236 声明)");
  console.log("U 定义: utility 向量 L2 范数 mean(‖u_i‖/√K) (与 computeThermoState 一致)");
  console.log("=".repeat(80) + "\n");

  const obs = loadData();
  if (obs.length < 5) {
    console.error("观测点不足,无法做相关性分析");
    process.exit(1);
  }

  // ── 1. F 一致性验证: persisted F vs recomputed F ──
  console.log("─".repeat(60));
  console.log("1. F 一致性验证: thermoHistory.F vs 重算 F = U - T·H");
  console.log("─".repeat(60));

  const fPersisted = obs.map(o => o.F_persisted);
  const fRecomputed = obs.map(o => o.F_recomputed);
  const fDiff = obs.map(o => Math.abs(o.F_persisted - o.F_recomputed));
  const fConsistency = pearsonCorrelation(fPersisted, fRecomputed);

  console.log(`  r(F_persisted, F_recomputed) = ${fConsistency.r.toFixed(6)} (p=${fConsistency.p.toExponential(3)}, n=${fConsistency.n})`);
  console.log(`  最大偏差: ${Math.max(...fDiff).toExponential(6)}`);
  console.log(`  平均偏差: ${mean(fDiff).toExponential(6)}`);
  if (fConsistency.r > 0.999 && Math.max(...fDiff) < 1e-6) {
    console.log("  ✓ F 一致性验证通过: persisted F 确实 = U - T·H");
  } else {
    console.log("  ✗ F 一致性验证失败: persisted F 与重算 F 不一致,需排查");
  }
  console.log();

  // ── 2. 核心验证: r(U, T·H) ──
  console.log("─".repeat(60));
  console.log("2. 核心验证: 新 F = U - T·H 的三变量解耦性");
  console.log("─".repeat(60));

  const Us = obs.map(o => o.U);
  const Ts = obs.map(o => o.T);
  const Hs = obs.map(o => o.H);
  const THs = obs.map(o => o.TH);
  const Rs = obs.map(o => o.R);
  const oneMinusRs = obs.map(o => o.oneMinusR);

  const r_U_TH = pearsonCorrelation(Us, THs);
  const r_U_T = pearsonCorrelation(Us, Ts);
  const r_U_H = pearsonCorrelation(Us, Hs);
  const r_T_H = pearsonCorrelation(Ts, Hs);

  console.log(`  r(U,   T·H)  = ${r_U_TH.r.toFixed(6)}  (p=${r_U_TH.p.toExponential(3)}, n=${r_U_TH.n})  ← 核心指标,声称 ≈ 0.274`);
  console.log(`  r(U,   T)    = ${r_U_T.r.toFixed(6)}  (p=${r_U_T.p.toExponential(3)})`);
  console.log(`  r(U,   H)    = ${r_U_H.r.toFixed(6)}  (p=${r_U_H.p.toExponential(3)})`);
  console.log(`  r(T,   H)    = ${r_T_H.r.toFixed(6)}  (p=${r_T_H.p.toExponential(3)})`);

  // 偏相关
  const pr_U_TH_given_T = partialCorrelation(Us, THs, Ts);
  const pr_U_TH_given_H = partialCorrelation(Us, THs, Hs);
  console.log(`  partial r(U, T·H | T) = ${pr_U_TH_given_T.r.toFixed(6)}`);
  console.log(`  partial r(U, T·H | H) = ${pr_U_TH_given_H.r.toFixed(6)}`);

  console.log();
  console.log("  描述统计:");
  console.log(`    U:  mean=${mean(Us).toFixed(4)}, std=${std(Us).toFixed(4)}, range=[${Math.min(...Us).toFixed(4)}, ${Math.max(...Us).toFixed(4)}]`);
  console.log(`    T:  mean=${mean(Ts).toFixed(4)}, std=${std(Ts).toFixed(4)}, range=[${Math.min(...Ts).toFixed(4)}, ${Math.max(...Ts).toFixed(4)}]`);
  console.log(`    H:  mean=${mean(Hs).toFixed(4)}, std=${std(Hs).toFixed(4)}, range=[${Math.min(...Hs).toFixed(4)}, ${Math.max(...Hs).toFixed(4)}]`);
  console.log(`    T·H: mean=${mean(THs).toFixed(4)}, std=${std(THs).toFixed(4)}, range=[${Math.min(...THs).toFixed(4)}, ${Math.max(...THs).toFixed(4)}]`);

  // 判定
  console.log();
  const absR = Math.abs(r_U_TH.r);
  if (absR < 0.3) {
    console.log(`  ✓ 解耦验证通过: |r(U, T·H)| = ${absR.toFixed(4)} < 0.3`);
    if (Math.abs(absR - 0.274) < 0.1) {
      console.log(`  ✓ 与代码注释 r=0.274 一致 (偏差 < 0.1)`);
    } else {
      console.log(`  ⚠ 解耦成立但与注释 r=0.274 偏差较大 (|实际 - 0.274| = ${Math.abs(absR - 0.274).toFixed(4)})`);
      console.log(`    建议修正 MeasurementLayer.ts:236 注释中的 r 值`);
    }
  } else {
    console.log(`  ✗ 解耦验证失败: |r(U, T·H)| = ${absR.toFixed(4)} ≥ 0.3`);
    console.log(`    U 与 T·H 仍强相关,F = U - T·H 存在双计数风险`);
    console.log(`    代码注释 r=0.274 声明不成立(可能是标量 belief L1 的结果被误归因)`);
  }
  console.log();

  // ── 3. 对照: 旧 F = (1-R) + T·H 的解耦性 ──
  console.log("─".repeat(60));
  console.log("3. 对照: 旧 F = (1-R) + T·H 的解耦性(已知 r≈0.92)");
  console.log("─".repeat(60));

  const r_1mR_TH = pearsonCorrelation(oneMinusRs, THs);
  const r_1mR_T = pearsonCorrelation(oneMinusRs, Ts);
  const r_1mR_H = pearsonCorrelation(oneMinusRs, Hs);

  console.log(`  r(1-R, T·H) = ${r_1mR_TH.r.toFixed(6)}  (p=${r_1mR_TH.p.toExponential(3)}, n=${r_1mR_TH.n})`);
  console.log(`  r(1-R, T)   = ${r_1mR_T.r.toFixed(6)}`);
  console.log(`  r(1-R, H)   = ${r_1mR_H.r.toFixed(6)}`);

  console.log();
  if (Math.abs(r_1mR_TH.r) > 0.7) {
    console.log(`  ✓ 复现旧 F 强相关: |r(1-R, T·H)| = ${Math.abs(r_1mR_TH.r).toFixed(4)} > 0.7`);
    console.log(`    旧 F 双计数问题确认,新 F 解耦改进 ${Math.abs(r_1mR_TH.r).toFixed(4)} → ${absR.toFixed(4)}`);
  } else {
    console.log(`  ⚠ 旧 F 相关性低于预期: |r(1-R, T·H)| = ${Math.abs(r_1mR_TH.r).toFixed(4)}`);
  }
  console.log();

  // ── 4. 按实验来源分组 ──
  console.log("─".repeat(60));
  console.log("4. 按实验来源分组验证");
  console.log("─".repeat(60));

  const sources = [...new Set(obs.map(o => o.source))].sort();
  for (const src of sources) {
    const srcObs = obs.filter(o => o.source === src);
    if (srcObs.length < 3) {
      console.log(`  ${src}: ${srcObs.length} 观测点 (样本不足,跳过)`);
      continue;
    }
    const srcU = srcObs.map(o => o.U);
    const srcTH = srcObs.map(o => o.TH);
    const { r } = pearsonCorrelation(srcU, srcTH);
    console.log(`  ${src}: n=${srcObs.length}, r(U, T·H) = ${isNaN(r) ? "NaN" : r.toFixed(4)}`);
  }
  console.log();

  // ── 5. 第 1 轮 vs 第 2+ 轮(T=0 的影响) ──
  console.log("─".repeat(60));
  console.log("5. 第 1 轮 (T=0) vs 第 2+ 轮的影响");
  console.log("─".repeat(60));

  const round1 = obs.filter(o => o.round === 1);
  const round2plus = obs.filter(o => o.round >= 2);

  console.log(`  第 1 轮: n=${round1.length}, T mean=${mean(round1.map(o=>o.T)).toFixed(6)} (T=0 时 F=U,无解耦可言)`);
  if (round2plus.length >= 3) {
    const r2p = pearsonCorrelation(round2plus.map(o => o.U), round2plus.map(o => o.TH));
    console.log(`  第 2+ 轮: n=${round2plus.length}, r(U, T·H) = ${isNaN(r2p.r) ? "NaN" : r2p.r.toFixed(4)}  (p=${r2p.p.toExponential(3)})`);
    console.log(`           T mean=${mean(round2plus.map(o=>o.T)).toFixed(4)}, H mean=${mean(round2plus.map(o=>o.H)).toFixed(4)}`);
  } else {
    console.log(`  第 2+ 轮: n=${round2plus.length} (样本不足)`);
  }
  console.log();

  // ── 总结 ──
  console.log("=".repeat(80));
  console.log("总结");
  console.log("=".repeat(80));
  console.log(`  样本: ${obs.length} 观测点, 来自 ${new Set(obs.map(o => o.runId)).size} 个 run`);
  console.log(`  F 一致性: r = ${fConsistency.r.toFixed(6)} (persisted vs recomputed)`);
  console.log(`  新 F 解耦: |r(U, T·H)| = ${absR.toFixed(4)} ${absR < 0.3 ? "✓ 解耦" : "✗ 未解耦"}`);
  console.log(`  旧 F 对照: |r(1-R, T·H)| = ${Math.abs(r_1mR_TH.r).toFixed(4)}`);
  console.log(`  注释声称: r = 0.274 ${Math.abs(absR - 0.274) < 0.1 ? "✓ 一致" : "✗ 不一致"}`);
  console.log();
}

main();
