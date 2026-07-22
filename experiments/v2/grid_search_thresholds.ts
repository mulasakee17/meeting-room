/**
 * 阈值网格搜索 — 离线校准
 *
 * 用已有实验数据搜索最优参数值，替代拍脑袋。
 *
 * 两类参数：
 *   1. 质量因子参数（E/F 恶意数据，完全离线可搜索）
 *      - 权重 w_cons, w_cred, w_align, w_cf（约束：和为 1）
 *      - EMA α
 *   2. 治理检测阈值（Crisis/Supplier 数据，可重计算检测信号）
 *      - echoChamber, authorityBias, polarization, prematureConsensus
 *
 * 目标函数：
 *   - 质量因子：最大化 恶意 vs 诚实 EMA 差异
 *   - 治理阈值：最大化"低 τ run 被检测"vs"高 τ run 不被误报"的分离度
 *
 * 用法：npx tsx experiments/v2/grid_search_thresholds.ts
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// 类型定义
// ============================================================================

interface UtteranceSnapshot {
  speakerId: string;
  belief: number;
  confidence: number;
  referencedAgents: string[];
  beliefsBefore: Record<string, { belief: number; confidence: number }>;
  beliefsAfter: Record<string, { belief: number; confidence: number }>;
}

interface GovernanceIssue {
  type: string;
  severity: string;
  detected: boolean;
  rawScore?: number;
}

interface RoundTrace {
  roundNumber: number;
  governanceIssues: GovernanceIssue[];
  interventions: { type: string; targetAgentId?: string; applied: boolean }[];
  beliefChanges: Record<string, { old: number; new: number }>;
  converged: boolean;
  perUtteranceSnapshots?: UtteranceSnapshot[];
}

interface ExperimentData {
  runId: string;
  group: string;
  kendallTau: number;
  totalRounds: number;
  totalUtterances: number;
  terminationReason: string;
  governanceTrace: RoundTrace[];
  roundResults: {
    roundNumber: number;
    opinions: { agentId: string; belief: number; confidence: number; itemBeliefs?: { item: string; rank: number; belief: number; confidence: number }[] }[];
  }[];
  maliciousAgentIds?: string[];
}

// ============================================================================
// 数据加载
// ============================================================================

const BASE = path.resolve(process.cwd(), "experiments/v2");

function loadDir(dir: string, prefix: string): ExperimentData[] {
  const full = path.join(BASE, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter(f => f.endsWith(".json") && f.startsWith(prefix))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(full, f), "utf8")); }
      catch { return null; }
    })
    .filter(Boolean) as ExperimentData[];
}

// ============================================================================
// 质量因子计算（从 quality_factor_validation.ts 提取核心逻辑）
// ============================================================================

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0.05;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

interface CredibilityState { alpha: number; beta: number; }

function getCredibility(s: CredibilityState): number {
  return s.alpha / (s.alpha + s.beta);
}

function updateCredibility(
  state: CredibilityState,
  snap: UtteranceSnapshot,
  isIntervened: boolean,
  speakerId: string
): CredibilityState {
  const actualBelief = snap.beliefsBefore[speakerId]?.belief ?? snap.belief;
  const consistency = 1 - Math.abs(snap.belief - actualBelief) / 2;
  const { alpha, beta } = state;
  if (consistency > 0.7) return { alpha: alpha + 1, beta };
  if (consistency < 0.4) return { alpha, beta: beta + 1 };
  if (isIntervened) return { alpha, beta: beta + 0.5 };
  return { alpha: alpha + 0.5, beta: beta + 0.3 };
}

function computeAnchor(
  beliefs: Record<string, number>,
  histories: Record<string, number[]>
): number {
  let bestId = "";
  let bestStability = -1;
  for (const id of Object.keys(beliefs)) {
    const h = histories[id];
    if (!h || h.length < 2) { if (bestStability < 0) bestId = id; continue; }
    const m = mean(h);
    const variance = h.reduce((s, v) => s + (v - m) ** 2, 0) / h.length;
    const stability = 1 / (1 + variance * 10);
    if (stability > bestStability) { bestStability = stability; bestId = id; }
  }
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
  snap: UtteranceSnapshot,
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

function computeConsistency(utteranceBelief: number, actualBelief: number): number {
  return clamp(1 - Math.abs(utteranceBelief - actualBelief) / 2, 0, 1);
}

// ============================================================================
// 质量因子网格搜索
// ============================================================================

interface QFParams {
  wCons: number;
  wCred: number;
  wAlign: number;
  wCf: number;
  emaAlpha: number;
}

function evaluateQF(data: ExperimentData[], params: QFParams): { diff: number; maliciousEma: number; honestEma: number } {
  let maliciousScores: number[] = [];
  let honestScores: number[] = [];

  for (const exp of data) {
    const maliciousIds = exp.maliciousAgentIds || [];
    const allAgents = new Set<string>();
    for (const r of exp.governanceTrace) {
      for (const s of (r.perUtteranceSnapshots || [])) {
        allAgents.add(s.speakerId);
        for (const id of Object.keys(s.beliefsBefore)) allAgents.add(id);
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

    for (const round of exp.governanceTrace) {
      const intervenedIds = new Set<string>();
      for (const intv of round.interventions) {
        if (intv.targetAgentId && intv.applied) intervenedIds.add(intv.targetAgentId);
      }

      for (const snap of (round.perUtteranceSnapshots || [])) {
        const sid = snap.speakerId;

        for (const id of allAgents) {
          const b = snap.beliefsAfter[id]?.belief;
          if (b !== undefined) beliefHistories[id].push(b);
        }

        const isIntervened = intervenedIds.has(sid);
        credStates[sid] = updateCredibility(credStates[sid], snap, isIntervened, sid);
        const credibility = getCredibility(credStates[sid]);

        const actualBelief = snap.beliefsBefore[sid]?.belief ?? snap.belief;
        const consistency = computeConsistency(snap.belief, actualBelief);
        consistencyAccum[sid].push(consistency);

        const currentBeliefs: Record<string, number> = {};
        for (const id of allAgents) currentBeliefs[id] = snap.beliefsBefore[id]?.belief ?? 0;
        const anchor = computeAnchor(currentBeliefs, beliefHistories);
        const alignment = computeAlignment(snap.beliefsBefore, snap.beliefsAfter, anchor);
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

function gridSearchQF(): void {
  console.log("\n" + "=".repeat(70));
  console.log("  质量因子参数网格搜索");
  console.log("=".repeat(70) + "\n");

  const data = [
    ...loadDir("data_fraud_malicious", "fraud_E_"),
    ...loadDir("data_fraud_malicious", "fraud_F_"),
  ].filter(d => (d.maliciousAgentIds || []).length > 0);

  console.log(`数据: E+F = ${data.length} runs\n`);

  // 固定 counterfactual 权重，搜索其他三个权重（和为 1-wCf）
  // wCf 固定为 0.05（已知贡献最小）
  const wCf = 0.05;
  const rem = 1 - wCf;

  const results: { params: QFParams; diff: number; mEma: number; hEma: number }[] = [];

  for (let wCons = 0.20; wCons <= 0.60; wCons += 0.05) {
    for (let wAlign = 0.15; wAlign <= 0.50; wAlign += 0.05) {
      const wCred = rem - wCons - wAlign;
      if (wCred < 0.05 || wCred > 0.50) continue;
      for (let emaAlpha = 0.15; emaAlpha <= 0.50; emaAlpha += 0.05) {
        const params = { wCons: Math.round(wCons * 100) / 100, wCred: Math.round(wCred * 100) / 100, wAlign: Math.round(wAlign * 100) / 100, wCf, emaAlpha: Math.round(emaAlpha * 100) / 100 };
        const result = evaluateQF(data, params);
        results.push({ params, diff: result.diff, mEma: result.maliciousEma, hEma: result.honestEma });
      }
    }
  }

  results.sort((a, b) => b.diff - a.diff);

  console.log("Top 10 参数组合（按恶意-诚实差异排序）：\n");
  console.log("  w_cons | w_cred | w_align | w_cf  | EMA α | 差异   | 恶意EMA | 诚实EMA");
  console.log("  " + "-".repeat(85));
  for (const r of results.slice(0, 10)) {
    const p = r.params;
    console.log(`  ${p.wCons.toFixed(2)}  | ${p.wCred.toFixed(2)}  | ${p.wAlign.toFixed(2)}   | ${p.wCf.toFixed(2)} | ${p.emaAlpha.toFixed(2)}  | ${r.diff.toFixed(4)} | ${r.mEma.toFixed(3)}  | ${r.hEma.toFixed(3)}`);
  }

  console.log("\nBottom 5（最差）：\n");
  for (const r of results.slice(-5)) {
    const p = r.params;
    console.log(`  ${p.wCons.toFixed(2)}  | ${p.wCred.toFixed(2)}  | ${p.wAlign.toFixed(2)}   | ${p.wCf.toFixed(2)} | ${p.emaAlpha.toFixed(2)}  | ${r.diff.toFixed(4)} | ${r.mEma.toFixed(3)}  | ${r.hEma.toFixed(3)}`);
  }

  // 按各参数单独分析
  console.log("\n各参数单独影响（固定其余为当前值 0.40/0.25/0.30/0.05/0.30）：\n");

  const baseline: QFParams = { wCons: 0.40, wCred: 0.25, wAlign: 0.30, wCf: 0.05, emaAlpha: 0.30 };
  const baselineResult = evaluateQF(data, baseline);
  console.log(`  当前基线: 差异=${baselineResult.diff.toFixed(4)}\n`);

  // wCons 单独扫描
  console.log("  w_cons 扫描（固定其余）：");
  for (let w = 0.20; w <= 0.60; w += 0.05) {
    const p = { ...baseline, wCons: Math.round(w * 100) / 100, wCred: Math.round((1 - 0.05 - w - 0.30) * 100) / 100 };
    if (p.wCred < 0.05) continue;
    const r = evaluateQF(data, p);
    const marker = w === 0.40 ? " ← 当前" : "";
    console.log(`    w_cons=${p.wCons.toFixed(2)} → 差异=${r.diff.toFixed(4)} (恶意=${r.maliciousEma.toFixed(3)}, 诚实=${r.honestEma.toFixed(3)})${marker}`);
  }

  // EMA α 单独扫描
  console.log("\n  EMA α 扫描（固定其余）：");
  for (let a = 0.15; a <= 0.50; a += 0.05) {
    const p = { ...baseline, emaAlpha: Math.round(a * 100) / 100 };
    const r = evaluateQF(data, p);
    const marker = Math.abs(a - 0.30) < 0.01 ? " ← 当前" : "";
    console.log(`    α=${p.emaAlpha.toFixed(2)} → 差异=${r.diff.toFixed(4)} (恶意=${r.maliciousEma.toFixed(3)}, 诚实=${r.honestEma.toFixed(3)})${marker}`);
  }

  // 最优参数
  const best = results[0];
  console.log(`\n最优参数: w_cons=${best.params.wCons.toFixed(2)}, w_cred=${best.params.wCred.toFixed(2)}, w_align=${best.params.wAlign.toFixed(2)}, w_cf=${best.params.wCf.toFixed(2)}, α=${best.params.emaAlpha.toFixed(2)}`);
  console.log(`最优差异: ${best.diff.toFixed(4)}（当前基线: ${baselineResult.diff.toFixed(4)}，提升: ${(best.diff - baselineResult.diff).toFixed(4)}）`);
}

// ============================================================================
// 治理检测阈值网格搜索
// ============================================================================

function gridSearchGovernance(): void {
  console.log("\n" + "=".repeat(70));
  console.log("  治理检测阈值网格搜索");
  console.log("=".repeat(70) + "\n");

  // 加载 Crisis 和 Supplier 数据
  const crisisData = [
    ...loadDir("data_crisis", "crisis_full"),
    ...loadDir("data_crisis", "crisis_none"),
    ...loadDir("data_crisis", "crisis_shuffle"),
  ];
  const supplierData = [
    ...loadDir("data", "ma_full"),
    ...loadDir("data", "ma_none"),
    ...loadDir("data", "ma_shuffle"),
  ];

  console.log(`Crisis: ${crisisData.length} runs, Supplier: ${supplierData.length} runs\n`);

  // 从 governanceTrace 提取检测信号
  // 由于原始 rawScore 可能不存在，我们从 roundResults 重建信号
  interface RunSignals {
    runId: string;
    tau: number;
    group: string;
    // 每轮的检测信号
    signals: {
      round: number;
      consensusLevel: number;      // 共识水平
      opinionDiversity: number;    // 观点多样性（1-consensus）
      influenceConcentration: number; // 影响力集中度
      beliefStd: number;           // 信念标准差
      roundProgress: number;       // 轮次进度
      issues?: string[];           // 实际检测到的问题
    }[];
  }

  // 实际数据用 rounds 数组，beliefs/confidences 是 Record<string, number>
  function extractSignals(data: any[]): RunSignals[] {
    return data.filter(exp => exp.rounds && exp.rounds.length > 0 && exp.kendallTau !== undefined).map(exp => {
      const totalRounds = exp.totalRounds || exp.rounds.length;
      const signals = exp.rounds.map((r: any, idx: number) => {
        // beliefs 是 Record<string, number>，如 {"a1":-0.87,"a2":0.22,...}
        const beliefMap: Record<string, number> = r.beliefs || {};
        const beliefValues = Object.values(beliefMap);
        const m = beliefValues.length > 0 ? beliefValues.reduce((a: number, b: number) => a + b, 0) / beliefValues.length : 0;
        const std = beliefValues.length > 1
          ? Math.sqrt(beliefValues.reduce((s: number, v: number) => s + (v - m) ** 2, 0) / beliefValues.length)
          : 0;
        const consensusLevel = 1 - clamp(std, 0, 1);
        const roundProgress = (idx + 1) / totalRounds;

        // 影响力集中度：用 confidences 的 max/mean 作为代理
        // 高置信度集中 = 某个 agent 的信心远高于其他
        const confMap: Record<string, number> = r.confidences || {};
        const confValues = Object.values(confMap);
        const confMean = confValues.length > 0 ? confValues.reduce((a: number, b: number) => a + b, 0) / confValues.length : 50;
        const confMax = confValues.length > 0 ? Math.max(...confValues) : 50;
        const influenceConcentration = clamp((confMax - confMean) / 100 + 0.2, 0, 1); // 归一化代理

        // issues 数组包含检测到的问题类型
        const issues: string[] = r.issues || [];

        return {
          round: r.roundNumber || idx + 1,
          consensusLevel,
          opinionDiversity: clamp(std, 0, 1),
          influenceConcentration,
          beliefStd: std,
          roundProgress,
          issues,
        };
      });

      return { runId: exp.runId || "unknown", tau: exp.kendallTau, group: exp.ablation || "unknown", signals };
    });
  }

  const allData = [...crisisData, ...supplierData];
  const allSignals = extractSignals(allData);

  // 按 τ 中位数分割高/低质量 run
  const taus = allSignals.map(s => s.tau).sort((a, b) => a - b);
  const medianTau = taus[Math.floor(taus.length / 2)];

  console.log(`τ 中位数: ${medianTau.toFixed(3)}\n`);

  // 对每个阈值，计算分离度 = |mean(detected, low τ) - mean(detected, high τ)|
  // 目标：低 τ run 应该被检测（干预），高 τ run 不应该被检测

  function evaluateThreshold(
    signals: RunSignals[],
    thresholdType: "prematureConsensus" | "echoChamber" | "authorityBias" | "polarization",
    threshold: number
  ): { detectionRate_low: number; falseAlarmRate_high: number; separation: number } {
    let lowTauDetected = 0, lowTauTotal = 0;
    let highTauDetected = 0, highTauTotal = 0;

    for (const run of signals) {
      const isLowTau = run.tau < medianTau;
      let detected = false;

      for (const s of run.signals) {
        let signal: number;
        switch (thresholdType) {
          case "prematureConsensus":
            // 过早共识：轮次进度低 + 共识水平高
            signal = s.roundProgress < 0.5 ? s.consensusLevel : 0;
            break;
          case "echoChamber":
            // 回音室：观点多样性低（共识高）
            signal = s.consensusLevel;
            break;
          case "authorityBias":
            // 权威偏差：影响力集中度高
            signal = s.influenceConcentration;
            break;
          case "polarization":
            // 极化：信念标准差大
            signal = s.beliefStd;
            break;
        }
        if (signal > threshold) { detected = true; break; }
      }

      if (isLowTau) { lowTauTotal++; if (detected) lowTauDetected++; }
      else { highTauTotal++; if (detected) highTauDetected++; }
    }

    const detectionRate = lowTauTotal > 0 ? lowTauDetected / lowTauTotal : 0;
    const falseAlarmRate = highTauTotal > 0 ? highTauDetected / highTauTotal : 1;
    const separation = detectionRate - falseAlarmRate;

    return { detectionRate_low: detectionRate, falseAlarmRate_high: falseAlarmRate, separation };
  }

  // 扫描每个阈值
  const thresholds: { name: string; type: "prematureConsensus" | "echoChamber" | "authorityBias" | "polarization"; current: number; range: [number, number] }[] = [
    { name: "prematureConsensus", type: "prematureConsensus", current: 0.35, range: [0.20, 0.65] },
    { name: "echoChamber", type: "echoChamber", current: 0.50, range: [0.30, 0.80] },
    { name: "authorityBias", type: "authorityBias", current: 0.25, range: [0.15, 0.50] },
    { name: "polarization", type: "polarization", current: 0.30, range: [0.15, 0.50] },
  ];

  for (const th of thresholds) {
    console.log(`\n${th.name}（当前=${th.current.toFixed(2)}）：`);
    console.log("  阈值  | 检出率(低τ) | 误报率(高τ) | 分离度");
    console.log("  " + "-".repeat(60));

    let best = { threshold: th.current, separation: -1 };

    for (let t = th.range[0]; t <= th.range[1]; t += 0.05) {
      const r = evaluateThreshold(allSignals, th.type, t);
      const marker = Math.abs(t - th.current) < 0.01 ? " ← 当前" : "";
      console.log(`  ${t.toFixed(2)}  |   ${r.detectionRate_low.toFixed(3)}   |   ${r.falseAlarmRate_high.toFixed(3)}   | ${r.separation.toFixed(3)}${marker}`);
      if (r.separation > best.separation) best = { threshold: t, separation: r.separation };
    }

    console.log(`  → 最优: ${best.threshold.toFixed(2)}（分离度=${best.separation.toFixed(3)}，当前=${th.current.toFixed(2)}）`);
  }

  // 分任务分析
  console.log("\n分任务分离度对比（prematureConsensus 阈值=0.35）：\n");
  for (const [taskName, taskData] of [["Crisis", crisisData], ["Supplier", supplierData]] as [string, ExperimentData[]]) {
    const taskSignals = extractSignals(taskData);
    const taskTaus = taskSignals.map(s => s.tau).sort((a, b) => a - b);
    const taskMedian = taskTaus[Math.floor(taskTaus.length / 2)];
    const r = evaluateThreshold(taskSignals, "prematureConsensus", 0.35);
    console.log(`  ${taskName}: 中位τ=${taskMedian.toFixed(3)}, 检出率=${r.detectionRate_low.toFixed(3)}, 误报率=${r.falseAlarmRate_high.toFixed(3)}, 分离度=${r.separation.toFixed(3)}`);
  }
}

// ============================================================================
// 主函数
// ============================================================================

function main() {
  console.log("=".repeat(70));
  console.log("  SwarmAlpha 阈值网格搜索 — 离线校准");
  console.log("  用现有实验数据搜索最优参数，零 API 调用");
  console.log("=".repeat(70));

  gridSearchQF();
  gridSearchGovernance();

  console.log("\n" + "=".repeat(70));
  console.log("  网格搜索完成");
  console.log("  注：质量因子参数可直接采用最优值；治理阈值需实验验证后再采用");
  console.log("=".repeat(70));
}

main();
