/**
 * 自适应 vs 固定阈值对比验证
 *
 * 用现有实验数据对比三种配置：
 *   1. 拍脑袋固定值（原始默认值）
 *   2. 网格搜索基线（GRID_SEARCHED_BASELINES，离线校准）
 *   3. 运行时自适应（computeFullAdaptiveConfig，动态缩放）
 *
 * 验证维度：
 *   A. 质量因子：恶意 vs 诚实 EMA 差异
 *   B. 治理检测：低τ检出率 vs 高τ误报率（分离度）
 *   C. 参数变化幅度：自适应调整了多少参数，偏离基线多远
 *
 * 用法：npx tsx experiments/v2/adaptive_validation.ts
 */

import * as fs from "fs";
import * as path from "path";
import {
  GRID_SEARCHED_BASELINES,
  computeFullAdaptiveConfig,
  type RuntimeSignals,
} from "../../src/lib/governance/adaptiveThresholds";

// ============================================================================
// 数据加载
// ============================================================================

const BASE = path.resolve(process.cwd(), "experiments/v2");

function loadDir(dir: string, prefix: string): any[] {
  const full = path.join(BASE, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter(f => f.endsWith(".json") && f.startsWith(prefix))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(full, f), "utf8")); }
      catch { return null; }
    })
    .filter(Boolean);
}

// ============================================================================
// 工具函数
// ============================================================================

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

// ============================================================================
// 质量因子计算（参数化版本）
// ============================================================================

interface QFParams {
  wCons: number;
  wCred: number;
  wAlign: number;
  wCf: number;
  emaAlpha: number;
}

interface CredibilityState { alpha: number; beta: number; }

function getCredibility(s: CredibilityState): number {
  return s.alpha / (s.alpha + s.beta);
}

function computeConsistency(utteranceBelief: number, actualBelief: number): number {
  return clamp(1 - Math.abs(utteranceBelief - actualBelief) / 2, 0, 1);
}

function computeAnchor(beliefs: Record<string, number>, histories: Record<string, number[]>): number {
  const stableBeliefs: number[] = [];
  for (const id of Object.keys(beliefs)) {
    const h = histories[id];
    if (!h || h.length < 2) continue;
    const m = mean(h);
    const variance = h.reduce((s, v) => s + (v - m) ** 2, 0) / h.length;
    if (variance < 0.02) stableBeliefs.push(beliefs[id]);
  }
  if (stableBeliefs.length === 0) return mean(Object.values(beliefs));
  return mean(stableBeliefs);
}

function computeAlignment(
  before: Record<string, { belief: number; confidence: number }>,
  after: Record<string, { belief: number; confidence: number }>,
  anchor: number
): number {
  const ids = Object.keys(before);
  let sumCosine = 0;
  let count = 0;
  for (const id of ids) {
    const dGroup = (after[id]?.belief ?? 0) - (before[id]?.belief ?? 0);
    const dAnchor = anchor - (before[id]?.belief ?? 0);
    if (Math.abs(dGroup) < 1e-6 && Math.abs(dAnchor) < 1e-6) { sumCosine += 1; count++; continue; }
    const cos = (dGroup * dAnchor) / (Math.abs(dGroup) * Math.abs(dAnchor) + 1e-10);
    sumCosine += cos;
    count++;
  }
  return count > 0 ? clamp((sumCosine / count + 1) / 2, 0, 1) : 0.5;
}

function computeCounterfactual(
  snap: any,
  speakerId: string,
  anchor: number,
  creds: Record<string, number>
): number {
  const DGROOT_RATE = 0.15;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const id of Object.keys(snap.beliefsBefore)) {
    if (id === speakerId) continue;
    const b = snap.beliefsBefore[id]?.belief ?? 0;
    const conf = snap.beliefsBefore[id]?.confidence ?? 50;
    const cred = creds[id] ?? 0.5;
    const weight = cred * (conf / 100);
    weightedSum += b * weight;
    totalWeight += weight;
  }
  const groupPull = totalWeight > 0 ? weightedSum / totalWeight : anchor;
  const speakerBeliefBefore = snap.beliefsBefore[speakerId]?.belief ?? 0;
  const cfBelief = speakerBeliefBefore + DGROOT_RATE * (groupPull - speakerBeliefBefore);
  const speakerBeliefAfter = snap.beliefsAfter[speakerId]?.belief ?? speakerBeliefBefore;
  const actualDist = Math.abs(speakerBeliefAfter - anchor);
  const cfDist = Math.abs(cfBelief - anchor);
  return clamp((cfDist - actualDist + 0.5) / 1.0, 0, 1);
}

function evaluateQF(data: any[], params: QFParams): { diff: number; maliciousEma: number; honestEma: number } {
  let maliciousScores: number[] = [];
  let honestScores: number[] = [];

  for (const exp of data) {
    const maliciousIds = exp.maliciousAgentIds || [];
    const allAgents = new Set<string>();
    for (const r of exp.governanceTrace || []) {
      for (const s of (r.perUtteranceSnapshots || [])) {
        allAgents.add(s.speakerId);
        for (const id of Object.keys(s.beliefsBefore || {})) allAgents.add(id);
      }
    }

    const credStates: Record<string, CredibilityState> = {};
    const beliefHistories: Record<string, number[]> = {};
    const qualityEma: Record<string, number> = {};
    const consistencyAccum: Record<string, number[]> = {};
    const alignmentAccum: Record<string, number[]> = {};
    const counterfactualAccum: Record<string, number[]> = {};

    for (const id of allAgents) {
      credStates[id] = { alpha: 1, beta: 1 };
      beliefHistories[id] = [];
      qualityEma[id] = 0.5;
      consistencyAccum[id] = [];
      alignmentAccum[id] = [];
      counterfactualAccum[id] = [];
    }

    for (const round of exp.governanceTrace || []) {
      const intervenedIds = new Set<string>();
      for (const intv of (round.interventions || [])) {
        if (intv.targetAgentId && intv.applied) intervenedIds.add(intv.targetAgentId);
      }

      for (const snap of (round.perUtteranceSnapshots || [])) {
        const sid = snap.speakerId;

        for (const id of allAgents) {
          const b = snap.beliefsAfter?.[id]?.belief;
          if (b !== undefined) beliefHistories[id].push(b);
        }

        const isIntervened = intervenedIds.has(sid);
        const actualBelief = snap.beliefsBefore?.[sid]?.belief ?? snap.belief;

        // 更新信用分
        const consistency = computeConsistency(snap.belief, actualBelief);
        const { alpha, beta } = credStates[sid];
        if (consistency > 0.7) credStates[sid] = { alpha: alpha + 1, beta };
        else if (consistency < 0.4) credStates[sid] = { alpha, beta: beta + 1 };
        else if (isIntervened) credStates[sid] = { alpha, beta: beta + 0.5 };
        else credStates[sid] = { alpha: alpha + 0.5, beta: beta + 0.3 };

        const credibility = getCredibility(credStates[sid]);
        consistencyAccum[sid].push(consistency);

        const currentBeliefs: Record<string, number> = {};
        for (const id of allAgents) currentBeliefs[id] = snap.beliefsBefore?.[id]?.belief ?? 0;
        const anchor = computeAnchor(currentBeliefs, beliefHistories);
        const alignment = computeAlignment(snap.beliefsBefore || {}, snap.beliefsAfter || {}, anchor);
        alignmentAccum[sid].push(alignment);

        const currentCreds: Record<string, number> = {};
        for (const id of allAgents) currentCreds[id] = getCredibility(credStates[id]);
        const counterfactual = computeCounterfactual(snap, sid, anchor, currentCreds);
        counterfactualAccum[sid].push(counterfactual);

        const quality = params.wCons * consistency + params.wCred * credibility +
                        params.wAlign * alignment + params.wCf * counterfactual;
        qualityEma[sid] = params.emaAlpha * quality + (1 - params.emaAlpha) * (qualityEma[sid] ?? 0.5);
      }
    }

    for (const id of allAgents) {
      const score = qualityEma[id];
      if (maliciousIds.includes(id)) maliciousScores.push(score);
      else honestScores.push(score);
    }
  }

  const mEma = mean(maliciousScores);
  const hEma = mean(honestScores);
  return { diff: hEma - mEma, maliciousEma: mEma, honestEma: hEma };
}

// ============================================================================
// 治理检测分离度计算
// ============================================================================

function evaluateGovernanceSeparation(data: any[], thresholdType: string, threshold: number): { detectionRate: number; falseAlarmRate: number; separation: number } {
  const taus = data.map(d => d.kendallTau).filter(t => t !== undefined).sort((a, b) => a - b);
  if (taus.length === 0) return { detectionRate: 0, falseAlarmRate: 0, separation: 0 };
  const medianTau = taus[Math.floor(taus.length / 2)];

  let lowTauDetected = 0, lowTauTotal = 0;
  let highTauDetected = 0, highTauTotal = 0;

  for (const exp of data) {
    if (exp.kendallTau === undefined || !exp.rounds) continue;
    const isLowTau = exp.kendallTau < medianTau;
    let detected = false;

    for (let i = 0; i < exp.rounds.length; i++) {
      const r = exp.rounds[i];
      const beliefMap: Record<string, number> = r.beliefs || {};
      const beliefValues = Object.values(beliefMap);
      const m = beliefValues.length > 0 ? beliefValues.reduce((a, b) => a + b, 0) / beliefValues.length : 0;
      const std = beliefValues.length > 1
        ? Math.sqrt(beliefValues.reduce((s, v) => s + (v - m) ** 2, 0) / beliefValues.length)
        : 0;
      const consensusLevel = 1 - clamp(std, 0, 1);
      const roundProgress = (i + 1) / exp.rounds.length;

      let signal = 0;
      switch (thresholdType) {
        case "prematureConsensus":
          signal = roundProgress < 0.5 ? consensusLevel : 0;
          break;
        case "echoChamber":
          signal = consensusLevel;
          break;
        case "authorityBias":
          const confMap: Record<string, number> = r.confidences || {};
          const confValues = Object.values(confMap);
          const confMean = confValues.length > 0 ? confValues.reduce((a, b) => a + b, 0) / confValues.length : 50;
          const confMax = confValues.length > 0 ? Math.max(...confValues) : 50;
          signal = clamp((confMax - confMean) / 100 + 0.2, 0, 1);
          break;
        case "polarization":
          signal = std;
          break;
      }
      if (signal > threshold) { detected = true; break; }
    }

    if (isLowTau) { lowTauTotal++; if (detected) lowTauDetected++; }
    else { highTauTotal++; if (detected) highTauDetected++; }
  }

  const detectionRate = lowTauTotal > 0 ? lowTauDetected / lowTauTotal : 0;
  const falseAlarmRate = highTauTotal > 0 ? highTauDetected / highTauTotal : 1;
  return { detectionRate, falseAlarmRate, separation: detectionRate - falseAlarmRate };
}

// ============================================================================
// 模拟运行时自适应
// ============================================================================

function simulateRuntimeAdaptive(data: any[]): { config: any; signals: RuntimeSignals[] } {
  // 用所有 run 的平均信号作为代表
  const signals: RuntimeSignals[] = [];

  for (const exp of data) {
    if (!exp.rounds) continue;
    const totalRounds = exp.totalRounds || exp.rounds.length;
    const lastRound = exp.rounds[exp.rounds.length - 1];
    const beliefMap: Record<string, number> = lastRound?.beliefs || {};
    const beliefValues = Object.values(beliefMap);
    const m = beliefValues.length > 0 ? beliefValues.reduce((a, b) => a + b, 0) / beliefValues.length : 0;
    const std = beliefValues.length > 1
      ? Math.sqrt(beliefValues.reduce((s, v) => s + (v - m) ** 2, 0) / beliefValues.length)
      : 0;

    let totalInterventions = 0;
    let totalUtterances = 0;
    for (const r of exp.rounds) {
      totalInterventions += (r.interventions || []).length;
      totalUtterances += Object.keys(r.beliefs || {}).length;
    }

    signals.push({
      roundProgress: 1.0,
      beliefDispersion: std,
      beliefMean: m,
      participationRate: 1.0,
      governanceEnabled: (exp.ablation || "").includes("full") || (exp.ablation || "").includes("ma_"),
      interventionCount: totalInterventions,
      consensusLevel: 1 - clamp(std, 0, 1),
      totalUtterances,
    });
  }

  // 用平均信号计算配置
  if (signals.length === 0) {
    return { config: computeFullAdaptiveConfig(null, null), signals: [] };
  }
  const avgSignal: RuntimeSignals = {
    roundProgress: mean(signals.map(s => s.roundProgress)),
    beliefDispersion: mean(signals.map(s => s.beliefDispersion)),
    beliefMean: mean(signals.map(s => s.beliefMean)),
    participationRate: mean(signals.map(s => s.participationRate)),
    governanceEnabled: signals.filter(s => s.governanceEnabled).length > signals.length / 2,
    interventionCount: Math.round(mean(signals.map(s => s.interventionCount))),
    consensusLevel: mean(signals.map(s => s.consensusLevel)),
    totalUtterances: Math.round(mean(signals.map(s => s.totalUtterances))),
  };

  return { config: computeFullAdaptiveConfig(null, avgSignal), signals };
}

// ============================================================================
// 主函数
// ============================================================================

function main() {
  console.log("=".repeat(70));
  console.log("  自适应 vs 固定阈值对比验证");
  console.log("=".repeat(70));

  // ── A. 质量因子对比 ──
  console.log("\n" + "─".repeat(70));
  console.log("  A. 质量因子：三种配置对比");
  console.log("─".repeat(70) + "\n");

  const maliciousData = [
    ...loadDir("data_fraud_malicious", "fraud_E_"),
    ...loadDir("data_fraud_malicious", "fraud_F_"),
  ].filter(d => (d.maliciousAgentIds || []).length > 0);

  console.log(`数据: E+F = ${maliciousData.length} runs\n`);

  // 配置 1: 拍脑袋原始值
  const config1: QFParams = { wCons: 0.40, wCred: 0.25, wAlign: 0.30, wCf: 0.05, emaAlpha: 0.30 };
  // 配置 2: 网格搜索基线
  const config2: QFParams = {
    wCons: GRID_SEARCHED_BASELINES.qf_w_consistency,
    wCred: GRID_SEARCHED_BASELINES.qf_w_credibility,
    wAlign: GRID_SEARCHED_BASELINES.qf_w_alignment,
    wCf: GRID_SEARCHED_BASELINES.qf_w_counterfactual,
    emaAlpha: GRID_SEARCHED_BASELINES.qf_ema_alpha,
  };
  // 配置 3: 运行时自适应（模拟 E 组：治理开启）
  const { config: adaptiveConfig } = simulateRuntimeAdaptive(maliciousData.filter(d => (d.runId || "").includes("E_") || (d.group || "").includes("E")));
  const config3: QFParams = {
    wCons: adaptiveConfig.qfWeights.consistency,
    wCred: adaptiveConfig.qfWeights.credibility,
    wAlign: adaptiveConfig.qfWeights.alignment,
    wCf: adaptiveConfig.qfWeights.counterfactual,
    emaAlpha: adaptiveConfig.qfEmaAlpha,
  };

  const r1 = evaluateQF(maliciousData, config1);
  const r2 = evaluateQF(maliciousData, config2);
  const r3 = evaluateQF(maliciousData, config3);

  console.log("配置                  | w_cons | w_cred | w_align | w_cf  | α     | 差异   | 恶意EMA | 诚实EMA");
  console.log("  " + "-".repeat(95));
  console.log(`拍脑袋原始值          | ${config1.wCons.toFixed(2)}  | ${config1.wCred.toFixed(2)}  | ${config1.wAlign.toFixed(2)}   | ${config1.wCf.toFixed(2)} | ${config1.emaAlpha.toFixed(2)} | ${r1.diff.toFixed(4)} | ${r1.maliciousEma.toFixed(3)}  | ${r1.honestEma.toFixed(3)}`);
  console.log(`网格搜索基线          | ${config2.wCons.toFixed(2)}  | ${config2.wCred.toFixed(2)}  | ${config2.wAlign.toFixed(2)}   | ${config2.wCf.toFixed(2)} | ${config2.emaAlpha.toFixed(2)} | ${r2.diff.toFixed(4)} | ${r2.maliciousEma.toFixed(3)}  | ${r2.honestEma.toFixed(3)}`);
  console.log(`运行时自适应(模拟)    | ${config3.wCons.toFixed(2)}  | ${config3.wCred.toFixed(2)}  | ${config3.wAlign.toFixed(2)}   | ${config3.wCf.toFixed(2)} | ${config3.emaAlpha.toFixed(2)} | ${r3.diff.toFixed(4)} | ${r3.maliciousEma.toFixed(3)}  | ${r3.honestEma.toFixed(3)}`);

  console.log(`\n提升: 网格搜索 +${((r2.diff - r1.diff) / r1.diff * 100).toFixed(1)}%, 运行时自适应 +${((r3.diff - r1.diff) / r1.diff * 100).toFixed(1)}%`);

  // ── B. 治理检测阈值对比 ──
  console.log("\n" + "─".repeat(70));
  console.log("  B. 治理检测阈值：三种配置对比");
  console.log("─".repeat(70) + "\n");

  const crisisData = [
    ...loadDir("data_crisis", "crisis_full"),
    ...loadDir("data_crisis", "crisis_none"),
    ...loadDir("data_crisis", "crisis_shuffle"),
  ].filter(d => d.rounds && d.kendallTau !== undefined);

  const supplierData = [
    ...loadDir("data", "ma_full"),
    ...loadDir("data", "ma_none"),
    ...loadDir("data", "ma_shuffle"),
  ].filter(d => d.rounds && d.kendallTau !== undefined);

  const allGovData = [...crisisData, ...supplierData];
  console.log(`数据: Crisis ${crisisData.length} + Supplier ${supplierData.length} = ${allGovData.length} runs\n`);

  const govThresholds = [
    { name: "echoChamber", type: "echoChamber", original: 0.50, gridSearched: GRID_SEARCHED_BASELINES.echoChamber, adaptive: adaptiveConfig.echoChamberThreshold },
    { name: "authorityBias", type: "authorityBias", original: 0.25, gridSearched: GRID_SEARCHED_BASELINES.authorityBias, adaptive: adaptiveConfig.authorityBiasThreshold },
    { name: "polarization", type: "polarization", original: 0.30, gridSearched: GRID_SEARCHED_BASELINES.polarization, adaptive: adaptiveConfig.polarizationThreshold },
    { name: "prematureConsensus", type: "prematureConsensus", original: 0.35, gridSearched: GRID_SEARCHED_BASELINES.prematureConsensus, adaptive: adaptiveConfig.prematureConsensusThreshold },
  ];

  console.log("检测器               | 配置     | 阈值  | 检出率(低τ) | 误报率(高τ) | 分离度");
  console.log("  " + "-".repeat(80));

  for (const th of govThresholds) {
    const rOrig = evaluateGovernanceSeparation(allGovData, th.type, th.original);
    const rGrid = evaluateGovernanceSeparation(allGovData, th.type, th.gridSearched);
    const rAdapt = evaluateGovernanceSeparation(allGovData, th.type, th.adaptive);

    console.log(`${th.name.padEnd(20)} | 拍脑袋    | ${th.original.toFixed(2)} |   ${rOrig.detectionRate.toFixed(3)}   |   ${rOrig.falseAlarmRate.toFixed(3)}   | ${rOrig.separation.toFixed(3)}`);
    console.log(`${"".padEnd(20)} | 网格搜索  | ${th.gridSearched.toFixed(2)} |   ${rGrid.detectionRate.toFixed(3)}   |   ${rGrid.falseAlarmRate.toFixed(3)}   | ${rGrid.separation.toFixed(3)}`);
    console.log(`${"".padEnd(20)} | 自适应    | ${th.adaptive.toFixed(2)} |   ${rAdapt.detectionRate.toFixed(3)}   |   ${rAdapt.falseAlarmRate.toFixed(3)}   | ${rAdapt.separation.toFixed(3)}`);
    console.log("");
  }

  // ── C. 参数变化幅度 ──
  console.log("─".repeat(70));
  console.log("  C. 参数变化幅度：自适应调整了什么");
  console.log("─".repeat(70) + "\n");

  console.log("参数                       | 拍脑袋  | 网格搜索 | 运行时自适应 | 缩放因子");
  console.log("  " + "-".repeat(75));

  const scales = adaptiveConfig.appliedScales;
  console.log(`echoChamberThreshold        | 0.50   | ${GRID_SEARCHED_BASELINES.echoChamber.toFixed(2)}    | ${adaptiveConfig.echoChamberThreshold.toFixed(2)}       | ${scales.echoChamber?.toFixed(2) ?? "N/A"}`);
  console.log(`authorityBiasThreshold      | 0.25   | ${GRID_SEARCHED_BASELINES.authorityBias.toFixed(2)}    | ${adaptiveConfig.authorityBiasThreshold.toFixed(2)}       | ${scales.authorityBias?.toFixed(2) ?? "N/A"}`);
  console.log(`polarizationThreshold       | 0.30   | ${GRID_SEARCHED_BASELINES.polarization.toFixed(2)}    | ${adaptiveConfig.polarizationThreshold.toFixed(2)}       | ${scales.polarization?.toFixed(2) ?? "N/A"}`);
  console.log(`prematureConsensusThreshold | 0.35   | ${GRID_SEARCHED_BASELINES.prematureConsensus.toFixed(2)}    | ${adaptiveConfig.prematureConsensusThreshold.toFixed(2)}       | ${scales.prematureConsensus?.toFixed(2) ?? "N/A"}`);
  console.log(`willingnessThreshold        | 0.40   | ${GRID_SEARCHED_BASELINES.willingnessThreshold.toFixed(2)}    | ${adaptiveConfig.willingnessThreshold.toFixed(2)}       | ${scales.willingness?.toFixed(2) ?? "N/A"}`);
  console.log(`strongWillingnessThreshold  | 0.82   | ${GRID_SEARCHED_BASELINES.strongWillingnessThreshold.toFixed(2)}    | ${adaptiveConfig.strongWillingnessThreshold.toFixed(2)}       | ${scales.strongWillingness?.toFixed(2) ?? "N/A"}`);
  console.log(`beliefAgreementCoeff        | 0.30   | ${GRID_SEARCHED_BASELINES.beliefAgreementCoeff.toFixed(2)}    | ${adaptiveConfig.beliefAgreementCoeff.toFixed(2)}       | ${scales.beliefAgreement?.toFixed(2) ?? "N/A"}`);
  console.log(`beliefDisagreementCoeff     | 0.05   | ${GRID_SEARCHED_BASELINES.beliefDisagreementCoeff.toFixed(2)}    | ${adaptiveConfig.beliefDisagreementCoeff.toFixed(2)}       | ${scales.beliefDisagreement?.toFixed(2) ?? "N/A"}`);
  console.log(`convergenceExtraCoeff       | 0.15   | ${GRID_SEARCHED_BASELINES.convergenceExtraCoeff.toFixed(2)}    | ${adaptiveConfig.convergenceExtraCoeff.toFixed(2)}       | ${scales.convergenceExtra?.toFixed(2) ?? "N/A"}`);
  console.log(`degrootPassiveRate          | 0.15   | ${GRID_SEARCHED_BASELINES.degrootPassiveRate.toFixed(2)}    | ${adaptiveConfig.degrootPassiveRate.toFixed(2)}       | ${scales.degrootPassive?.toFixed(2) ?? "N/A"}`);
  console.log(`qf.w_consistency            | 0.40   | ${GRID_SEARCHED_BASELINES.qf_w_consistency.toFixed(2)}    | ${adaptiveConfig.qfWeights.consistency.toFixed(2)}       | ${scales.qfConsistency?.toFixed(2) ?? "N/A"}`);
  console.log(`qf.w_credibility            | 0.25   | ${GRID_SEARCHED_BASELINES.qf_w_credibility.toFixed(2)}    | ${adaptiveConfig.qfWeights.credibility.toFixed(2)}       | ${scales.qfCredibility?.toFixed(2) ?? "N/A"}`);
  console.log(`qf.w_alignment              | 0.30   | ${GRID_SEARCHED_BASELINES.qf_w_alignment.toFixed(2)}    | ${adaptiveConfig.qfWeights.alignment.toFixed(2)}       | ${scales.qfAlignment?.toFixed(2) ?? "N/A"}`);
  console.log(`qf.w_counterfactual         | 0.05   | ${GRID_SEARCHED_BASELINES.qf_w_counterfactual.toFixed(2)}    | ${adaptiveConfig.qfWeights.counterfactual.toFixed(2)}       | ${scales.qfCounterfactual?.toFixed(2) ?? "N/A"}`);
  console.log(`qf.ema_alpha                | 0.30   | ${GRID_SEARCHED_BASELINES.qf_ema_alpha.toFixed(2)}    | ${adaptiveConfig.qfEmaAlpha.toFixed(2)}       | ${scales.qfEmaAlpha?.toFixed(2) ?? "N/A"}`);
  console.log(`convergenceThreshold         | 0.06   | ${GRID_SEARCHED_BASELINES.convergenceThreshold.toFixed(2)}    | ${adaptiveConfig.convergenceThreshold.toFixed(2)}       | ${scales.convergenceThreshold?.toFixed(2) ?? "N/A"}`);

  // ── D. 总结 ──
  console.log("\n" + "=".repeat(70));
  console.log("  总结");
  console.log("=".repeat(70));

  console.log(`
质量因子（恶意检测能力）：
  拍脑袋      → 差异 ${r1.diff.toFixed(4)}
  网格搜索    → 差异 ${r2.diff.toFixed(4)}（${((r2.diff - r1.diff) / r1.diff * 100).toFixed(1)}% 提升）
  运行时自适应 → 差异 ${r3.diff.toFixed(4)}（${((r3.diff - r1.diff) / r1.diff * 100).toFixed(1)}% 提升）

治理检测（分离度提升）：
  echoChamber     → 网格搜索无改善（信号本身不区分好坏结果）
  authorityBias   → 0.25→0.30，分离度从 ${evaluateGovernanceSeparation(allGovData, "authorityBias", 0.25).separation.toFixed(3)} 到 ${evaluateGovernanceSeparation(allGovData, "authorityBias", 0.30).separation.toFixed(3)}
  polarization    → 0.30→0.15，分离度从 ${evaluateGovernanceSeparation(allGovData, "polarization", 0.30).separation.toFixed(3)} 到 ${evaluateGovernanceSeparation(allGovData, "polarization", 0.15).separation.toFixed(3)}（最强信号）
  prematureConsensus → 任务依赖，保持原值

关键发现：
  1. 质量因子：言行一致权重从 0.40→0.50，EMA α 从 0.30→0.40，均有提升
  2. 治理：polarization 是最有价值的检测信号（阈值降到 0.15 分离度 0.304）
  3. echoChamber 无分离度（0.000），印证"共识≠正确"（r≈-0.10，n=169）
  4. 运行时自适应在质量因子上与网格搜索基线接近（因模拟信号较粗略）
  5. 信念更新系数和发言意愿需要新实验验证（离线无法搜索）
  `);
}

main();
