/**
 * SwarmAlpha v9.7 — 非线性共识聚合 v2 基准测试
 *
 * 测试 8 种共识方法 (线性 + 7 种非线性) 在全部 203 个事件上的表现。
 * 包含蒙特卡洛稳定性验证。
 *
 * 核心问题:
 *   - 非线性方法是否显著超越线性基线?
 *   - vs线性平均绝对差异是否 >15pt?
 *   - 动态集成是否 ≥ 最佳单方法?
 *
 * 运行: npx tsx test/nonlinear-v2-benchmark.ts
 *
 * 纯模板模式，零 LLM 成本。
 */

import { EVENTS, UnifiedEvent } from "./events";
import {
  computeNonlinearConsensus,
  computeLinearBaselineConsensus,
  computePowerLawConsensus,
  computeEntropyWeightedConsensus,
  computeTrimmedMeanConsensus,
  computeMedianConsensus,
  computeWinsorizedConsensus,
  computeGeometricMeanConsensus,
  computeDynamicEnsembleConsensus,
  NonlinearConsensusInput,
  NonlinearConfig,
  DEFAULT_NONLINEAR_CONFIG,
} from "../src/lib/agents/v9/nonlinearConsensus";
import { getAllAgents } from "../src/lib/agents/v9/agentDefinitions";
import { computeAllAgentStates } from "../src/lib/agents/v9/agentInterpretation";
import { templateFactorExtraction } from "../src/lib/agents/v9/factorExtraction";
import { V9AgentDefinition, V9AgentState } from "../src/lib/agents/v9/types";

// ==================== 配置 ====================

interface MethodDef {
  id: string;
  label: string;
  fn: (input: NonlinearConsensusInput, config?: Partial<NonlinearConfig>) => { consensus: number; confidence: number };
}

const METHODS: MethodDef[] = [
  { id: "linear_baseline", label: "线性加权 (基线)", fn: (i) => computeLinearBaselineConsensus(i) },
  { id: "power_law", label: "幂律共识", fn: (i, c) => computePowerLawConsensus(i, c?.powerAlpha ?? 1.5) },
  { id: "entropy_weighted", label: "熵权共识", fn: (i) => computeEntropyWeightedConsensus(i) },
  { id: "trimmed_mean", label: "修剪均值", fn: (i, c) => computeTrimmedMeanConsensus(i, c?.trimCount ?? 1) },
  { id: "median", label: "加权中位数", fn: (i) => computeMedianConsensus(i) },
  { id: "winsorized", label: "缩尾共识", fn: (i, c) => computeWinsorizedConsensus(i, c?.winsorLowerPct ?? 20, c?.winsorUpperPct ?? 80) },
  { id: "geometric_mean", label: "几何平均", fn: (i) => computeGeometricMeanConsensus(i) },
  { id: "dynamic_ensemble", label: "动态集成", fn: (i, c) => {
    const cfg: NonlinearConfig = { ...DEFAULT_NONLINEAR_CONFIG, method: "dynamic_ensemble", ...c };
    return computeDynamicEnsembleConsensus(i, cfg);
  }},
];

interface BenchmarkResult {
  method: string;
  label: string;
  total: number;
  correct: number;
  accuracy: number;
  upCorrect: number; upTotal: number; upAccuracy: number;
  downCorrect: number; downTotal: number; downAccuracy: number;
  neutralCorrect: number; neutralTotal: number; neutralAccuracy: number;
  vsLinearDiffSum: number;
  vsLinearAbsDiffSum: number;
  vsLinearMeanDiff: number;
  vsLinearAbsMeanDiff: number;
  meanConfidence: number;
}

// ==================== 辅助函数 ====================

function getDirection(consensus: number): "up" | "down" | "neutral" {
  if (consensus > 10) return "up";
  if (consensus < -10) return "down";
  return "neutral";
}

function computeOrderParameter(beliefs: number[]): number {
  const n = beliefs.length;
  if (n === 0) return 0;
  let sumReal = 0, sumImag = 0;
  for (const b of beliefs) {
    const phase = (b / 100) * (Math.PI / 2);
    sumReal += Math.cos(phase);
    sumImag += Math.sin(phase);
  }
  return Math.sqrt(sumReal * sumReal + sumImag * sumImag) / n;
}

// ==================== 单事件运行 ====================

interface EventResult {
  event: UnifiedEvent;
  predictions: Record<string, { consensus: number; direction: string; correct: boolean; confidence: number }>;
}

function runSingleEvent(
  event: UnifiedEvent,
  agents: V9AgentDefinition[],
  config?: Partial<NonlinearConfig>
): EventResult {
  const marketData = {
    vix: event.vix,
    rsi: event.rsi,
    dropMagnitude: event.drop,
    hasPolicyResponse: event.hasPolicy,
    hasLeverageDamage: event.hasLeverage,
    hasSolvencyDamage: event.hasSolvency,
  };

  // 模板因子提取 (零成本)
  const factorVector = templateFactorExtraction(event.news, marketData);

  // Agent 解读
  const { states } = computeAllAgentStates(factorVector, agents, {
    disableBlindness: false,
  });

  // 构建非线性共识输入
  const beliefs = Object.values(states).map(s => s.belief);
  const r = computeOrderParameter(beliefs);
  const input: NonlinearConsensusInput = { agents, states, kuramotoR: r };

  // 运行所有方法
  const predictions: EventResult["predictions"] = {};

  for (const method of METHODS) {
    const result = method.fn(input, config);
    const direction = getDirection(result.consensus);
    predictions[method.id] = {
      consensus: Math.round(result.consensus * 100) / 100,
      direction,
      correct: direction === event.actual,
      confidence: result.confidence,
    };
  }

  return { event, predictions };
}

// ==================== 蒙特卡洛稳定性 ====================

function normalRandom(mean: number = 0, std: number = 1): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

interface MCResult {
  methodId: string;
  consensusMean: number;
  consensusStd: number;
  accuracyMean: number;
  directionFlips: number;  // 方向翻转的事件数
}

function runMonteCarlo(
  events: UnifiedEvent[],
  methodIds: string[],
  noiseStd: number = 0.05,
  runs: number = 50
): MCResult[] {
  const agents = getAllAgents(true);
  const results: Record<string, { consensuses: number[][]; accuracies: number[] }> = {};

  for (const id of methodIds) {
    results[id] = { consensuses: [], accuracies: [] };
    for (const _ of Array(runs)) {
      results[id].consensuses.push([]);
      results[id].accuracies.push(0);
    }
  }

  let eventIdx = 0;
  for (const event of events) {
    eventIdx++;
    if (eventIdx % 20 === 0) {
      console.log(`  MC: ${eventIdx}/${events.length} events...`);
    }

    const marketData = {
      vix: event.vix, rsi: event.rsi, dropMagnitude: event.drop,
      hasPolicyResponse: event.hasPolicy, hasLeverageDamage: event.hasLeverage, hasSolvencyDamage: event.hasSolvency,
    };

    const baseFactorVector = templateFactorExtraction(event.news, marketData);

    for (let run = 0; run < runs; run++) {
      // 添加噪声到因子值
      const noisyFactors = baseFactorVector.factors.map(f => ({
        ...f,
        value: Math.max(f.category === "uncertainty" ? 0 : -100, Math.min(100, f.value + normalRandom(0, noiseStd * 100))),
      }));
      const noisyFV = { ...baseFactorVector, factors: noisyFactors };

      const { states } = computeAllAgentStates(noisyFV, agents, { disableBlindness: false });
      const beliefs = Object.values(states).map(s => s.belief);
      const r = computeOrderParameter(beliefs);
      const input: NonlinearConsensusInput = { agents, states, kuramotoR: r };

      // 运行每个方法
      for (const method of METHODS) {
        if (!methodIds.includes(method.id)) continue;
        const result = method.fn(input);
        results[method.id].consensuses[run].push(result.consensus);
        const direction = getDirection(result.consensus);
        if (direction === event.actual) {
          results[method.id].accuracies[run]++;
        }
      }
    }
  }

  // 汇总统计
  const mcResults: MCResult[] = [];
  for (const method of METHODS) {
    if (!methodIds.includes(method.id)) continue;
    const r = results[method.id];

    // 计算每个事件的平均共识和准确率
    const perEventConsensusMeans: number[] = [];
    const perEventDirectionFlips: number = events.reduce((flips, _, ei) => {
      const baseDir = getDirection(r.consensuses[0][ei]);
      let flipCount = 0;
      for (let run = 1; run < runs; run++) {
        if (getDirection(r.consensuses[run][ei]) !== baseDir) flipCount++;
      }
      return flips + (flipCount > 0 ? 1 : 0);
    }, 0);

    for (let ei = 0; ei < events.length; ei++) {
      const vals: number[] = [];
      for (let run = 0; run < runs; run++) {
        vals.push(r.consensuses[run][ei]);
      }
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      perEventConsensusMeans.push(mean);
    }

    const allConsensusesFlat = r.consensuses.flat();
    const consensusMean = allConsensusesFlat.reduce((s, v) => s + v, 0) / allConsensusesFlat.length;
    const consensusVariance = allConsensusesFlat.reduce((s, v) => s + (v - consensusMean) ** 2, 0) / allConsensusesFlat.length;
    const accuracyMean = r.accuracies.reduce((s, v) => s + v, 0) / (runs * events.length) * 100;

    mcResults.push({
      methodId: method.id,
      consensusMean: Math.round(consensusMean * 100) / 100,
      consensusStd: Math.round(Math.sqrt(consensusVariance) * 100) / 100,
      accuracyMean: Math.round(accuracyMean * 10) / 10,
      directionFlips: perEventDirectionFlips,
    });
  }

  return mcResults;
}

// ==================== 主测试 ====================

async function main() {
  console.log("=".repeat(80));
  console.log("SwarmAlpha v9.7 — 非线性共识聚合 v2 基准测试");
  console.log("=".repeat(80));
  console.log(`事件总数: ${EVENTS.length}`);
  console.log(`测试方法: ${METHODS.map(m => m.label).join(", ")}`);
  console.log(`模式: 模板因子提取 (零 LLM 成本)`);
  console.log("");

  const agents = getAllAgents(true);
  const methodIds = METHODS.map(m => m.id);

  // 初始化结果
  const resultMap = new Map<string, BenchmarkResult>();
  for (const m of METHODS) {
    resultMap.set(m.id, {
      method: m.id, label: m.label,
      total: 0, correct: 0, accuracy: 0,
      upCorrect: 0, upTotal: 0, upAccuracy: 0,
      downCorrect: 0, downTotal: 0, downAccuracy: 0,
      neutralCorrect: 0, neutralTotal: 0, neutralAccuracy: 0,
      vsLinearDiffSum: 0, vsLinearAbsDiffSum: 0,
      vsLinearMeanDiff: 0, vsLinearAbsMeanDiff: 0,
      meanConfidence: 0,
    });
  }

  // 逐个事件测试
  const eventResults: EventResult[] = [];
  let eventIdx = 0;

  for (const event of EVENTS) {
    eventIdx++;
    const er = runSingleEvent(event, agents);
    eventResults.push(er);

    // 更新统计
    const linearPred = er.predictions["linear_baseline"];
    for (const method of METHODS) {
      const pred = er.predictions[method.id];
      const r = resultMap.get(method.id)!;
      r.total++;
      if (pred.correct) r.correct++;
      switch (event.actual) {
        case "up": r.upTotal++; if (pred.correct) r.upCorrect++; break;
        case "down": r.downTotal++; if (pred.correct) r.downCorrect++; break;
        case "neutral": r.neutralTotal++; if (pred.correct) r.neutralCorrect++; break;
      }
      r.meanConfidence += pred.confidence;

      // vs线性差异
      if (method.id !== "linear_baseline" && linearPred) {
        const diff = pred.consensus - linearPred.consensus;
        r.vsLinearDiffSum += diff;
        r.vsLinearAbsDiffSum += Math.abs(diff);
      }
    }

    if (eventIdx % 20 === 0) {
      const linearR = resultMap.get("linear_baseline")!;
      const bestNonLinear = METHODS
        .filter(m => m.id !== "linear_baseline")
        .reduce((best, m) => {
          const mr = resultMap.get(m.id)!;
          return mr.correct / mr.total > (resultMap.get(best)?.correct ?? 0) / (resultMap.get(best)?.total ?? 1) ? m.id : best;
        }, METHODS[1].id);
      const bestR = resultMap.get(bestNonLinear)!;
      console.log(
        `[${eventIdx}/${EVENTS.length}] ` +
        `线性=${(linearR.correct / linearR.total * 100).toFixed(1)}% ` +
        `最佳非线性: ${bestNonLinear}=${(bestR.correct / bestR.total * 100).toFixed(1)}%`
      );
    }
  }

  // 最终统计
  for (const r of resultMap.values()) {
    r.accuracy = r.total > 0 ? (r.correct / r.total) * 100 : 0;
    r.upAccuracy = r.upTotal > 0 ? (r.upCorrect / r.upTotal) * 100 : 0;
    r.downAccuracy = r.downTotal > 0 ? (r.downCorrect / r.downTotal) * 100 : 0;
    r.neutralAccuracy = r.neutralTotal > 0 ? (r.neutralCorrect / r.neutralTotal) * 100 : 0;
    r.vsLinearMeanDiff = r.total > 0 ? r.vsLinearDiffSum / r.total : 0;
    r.vsLinearAbsMeanDiff = r.total > 0 ? r.vsLinearAbsDiffSum / r.total : 0;
    r.meanConfidence = r.total > 0 ? r.meanConfidence / r.total : 0;
  }

  // ==================== 打印结果 ====================

  console.log("");
  console.log("=".repeat(80));
  console.log("测试结果");
  console.log("=".repeat(80));
  console.log("");

  const sorted = [...resultMap.values()].sort((a, b) => b.accuracy - a.accuracy);

  console.log("┌────┬────────────────────┬────────┬──────┬──────┬──────┬────────────┬──────────────┐");
  console.log("│ 排 │ 方法               │ 总准确 │  Up  │ Down │ Neut │ vs线性差   │ vs线性绝对差 │");
  console.log("│ 名 │                    │  率    │      │      │      │ (均值)     │ (均值)       │");
  console.log("├────┼────────────────────┼────────┼──────┼──────┼──────┼────────────┼──────────────┤");

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : ` ${i + 1}`;
    const label = r.label.padEnd(18);
    const vsLinear = r.method === "linear_baseline"
      ? "     —      "
      : `${r.vsLinearMeanDiff > 0 ? "+" : ""}${r.vsLinearMeanDiff.toFixed(1)}`.padStart(8);
    const vsAbs = r.method === "linear_baseline"
      ? "     —      "
      : `${r.vsLinearAbsMeanDiff.toFixed(1)}`.padStart(8);

    console.log(
      `│ ${medal} │ ${label} │ ${r.accuracy.toFixed(1).padStart(5)}% │ ` +
      `${r.upAccuracy.toFixed(0).padStart(3)}% │ ${r.downAccuracy.toFixed(0).padStart(3)}% │ ` +
      `${r.neutralAccuracy.toFixed(0).padStart(3)}% │ ${vsLinear} │ ${vsAbs} │`
    );
  }
  console.log("└────┴────────────────────┴────────┴──────┴──────┴──────┴────────────┴──────────────┘");

  // 基线对比
  const linearResult = resultMap.get("linear_baseline")!;
  const alwaysUpAccuracy = (EVENTS.filter(e => e.actual === "up").length / EVENTS.length) * 100;
  const alwaysDownAccuracy = (EVENTS.filter(e => e.actual === "down").length / EVENTS.length) * 100;

  console.log("");
  console.log("基线对比:");
  console.log(`  永远猜涨: ${alwaysUpAccuracy.toFixed(1)}% (${EVENTS.filter(e => e.actual === "up").length} 事件)`);
  console.log(`  永远猜跌: ${alwaysDownAccuracy.toFixed(1)}% (${EVENTS.filter(e => e.actual === "down").length} 事件)`);
  console.log(`  线性共识 (v9): ${linearResult.accuracy.toFixed(1)}%`);
  console.log(`  事件分布: Up=${EVENTS.filter(e => e.actual === "up").length} Down=${EVENTS.filter(e => e.actual === "down").length} Neutral=${EVENTS.filter(e => e.actual === "neutral").length}`);

  const bestNonLinear = sorted.find(r => r.method !== "linear_baseline")!;
  const improvement = bestNonLinear.accuracy - linearResult.accuracy;
  console.log(`  最佳非线性 (${bestNonLinear.label}): ${bestNonLinear.accuracy.toFixed(1)}%`);
  console.log(`  vs 线性: ${improvement > 0 ? "+" : ""}${improvement.toFixed(1)}pp`);

  // 按方向详情
  console.log("");
  console.log("按方向对比 (Up 事件):");
  for (const r of sorted) {
    console.log(`  ${r.label.padEnd(20)} ${r.upCorrect}/${r.upTotal} = ${r.upAccuracy.toFixed(1)}%`);
  }

  console.log("");
  console.log("按方向对比 (Down 事件):");
  for (const r of sorted) {
    console.log(`  ${r.label.padEnd(20)} ${r.downCorrect}/${r.downTotal} = ${r.downAccuracy.toFixed(1)}%`);
  }

  // 最佳方法失败案例
  console.log("");
  console.log("=".repeat(80));
  console.log(`最佳非线性 (${bestNonLinear.label}) 失败案例 (前 15):`);
  console.log("=".repeat(80));

  const failures = eventResults.filter(er => !er.predictions[bestNonLinear.method].correct);
  for (const f of failures.slice(0, 15)) {
    const pred = f.predictions[bestNonLinear.method];
    const linearPred = f.predictions["linear_baseline"];
    console.log(
      `  ${"❌"} ${f.event.name.padEnd(30)} 实际=${f.event.actual.padEnd(7)} ` +
      `预测=${pred.direction.padEnd(7)} (${pred.consensus.toFixed(0).padStart(4)}) ` +
      `线性=${linearPred.direction.padEnd(7)} (${linearPred.consensus.toFixed(0).padStart(4)})`
    );
  }

  // ==================== 蒙特卡洛稳定性 ====================

  console.log("");
  console.log("=".repeat(80));
  console.log("蒙特卡洛稳定性测试 (5% 噪声 × 50 次, 首 60 事件抽样)");
  console.log("=".repeat(80));

  const mcEvents = EVENTS.slice(0, Math.min(60, EVENTS.length));
  // 只测试关键方法节省时间
  const mcMethodIds = ["linear_baseline", "power_law", "trimmed_mean", "median", "dynamic_ensemble"];
  const mcResults = runMonteCarlo(mcEvents, mcMethodIds, 0.05, 50);

  console.log("");
  console.log("┌────────────────────┬────────────┬────────────┬────────────┬──────────────┐");
  console.log("│ 方法               │ 共识均值   │ 共识标准差 │ 准确率均值 │ 方向翻转事件 │");
  console.log("├────────────────────┼────────────┼────────────┼────────────┼──────────────┤");

  for (const mc of mcResults) {
    const label = METHODS.find(m => m.id === mc.methodId)?.label ?? mc.methodId;
    const stability = mc.consensusStd < 8 ? "🟢" : mc.consensusStd < 15 ? "🟡" : "🔴";
    console.log(
      `│ ${label.padEnd(18)} │ ${mc.consensusMean.toFixed(1).padStart(8)} │ ` +
      `${mc.consensusStd.toFixed(1).padStart(8)} ${stability} │ ${mc.accuracyMean.toFixed(1).padStart(8)}% │ ` +
      `${mc.directionFlips.toString().padStart(10)}/${mcEvents.length} │`
    );
  }
  console.log("└────────────────────┴────────────┴────────────┴────────────┴──────────────┘");

  // ==================== 关键发现 ====================

  console.log("");
  console.log("=".repeat(80));
  console.log("关键发现:");
  console.log("=".repeat(80));

  if (improvement > 5) {
    console.log(`✅ 非线性共识显著优于线性基线 (+${improvement.toFixed(1)}pp)`);
  } else if (improvement > 1) {
    console.log(`⚠️ 非线性共识略优于线性基线 (+${improvement.toFixed(1)}pp), 优势不显著`);
  } else {
    console.log(`❌ 非线性共识未超越线性基线 (${improvement.toFixed(1)}pp)`);
  }

  const absDiff = bestNonLinear.vsLinearAbsMeanDiff;
  if (absDiff > 15) {
    console.log(`✅ 非线性与线性差异显著 (>15pt): ${absDiff.toFixed(1)}pt — 非线性公式确实改变了共识`);
  } else if (absDiff > 8) {
    console.log(`⚠️ 非线性与线性存在差异 (8-15pt): ${absDiff.toFixed(1)}pt — 接近但未达到目标`);
  } else {
    console.log(`❌ 非线性与线性几乎等价 (<8pt): ${absDiff.toFixed(1)}pt`);
  }

  // 动态集成是否 >= 最佳单方法?
  const ensembleResult = resultMap.get("dynamic_ensemble")!;
  const bestSingleNonLinear = sorted.filter(r => r.method !== "linear_baseline" && r.method !== "dynamic_ensemble")[0];
  if (bestSingleNonLinear && ensembleResult.accuracy >= bestSingleNonLinear.accuracy) {
    console.log(`✅ 动态集成 (${ensembleResult.accuracy.toFixed(1)}%) ≥ 最佳单方法 (${bestSingleNonLinear.label} ${bestSingleNonLinear.accuracy.toFixed(1)}%)`);
  } else if (bestSingleNonLinear) {
    console.log(`⚠️ 动态集成 (${ensembleResult.accuracy.toFixed(1)}%) < 最佳单方法 (${bestSingleNonLinear.label} ${bestSingleNonLinear.accuracy.toFixed(1)}%) — 差距 ${(bestSingleNonLinear.accuracy - ensembleResult.accuracy).toFixed(1)}pp`);
  }

  // Up/Down 平衡性
  const linearUpAcc = linearResult.upAccuracy;
  const bestUpAcc = bestNonLinear.upAccuracy;
  const linearDownAcc = linearResult.downAccuracy;
  const bestDownAcc = bestNonLinear.downAccuracy;
  console.log(`  Up 事件改善: ${linearUpAcc.toFixed(0)}% → ${bestUpAcc.toFixed(0)}% (${bestUpAcc - linearUpAcc > 0 ? "+" : ""}${(bestUpAcc - linearUpAcc).toFixed(1)}pp)`);
  console.log(`  Down 事件改善: ${linearDownAcc.toFixed(0)}% → ${bestDownAcc.toFixed(0)}% (${bestDownAcc - linearDownAcc > 0 ? "+" : ""}${(bestDownAcc - linearDownAcc).toFixed(1)}pp)`);

  console.log("");
  console.log("=".repeat(80));
  console.log("测试完成");
  console.log("=".repeat(80));
}

main().catch(console.error);
