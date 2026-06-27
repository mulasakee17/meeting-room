/**
 * SwarmAlpha v9.7 — 参数标定脚本
 *
 * 对 203 个历史事件做 3 参数网格搜索，找到最优参数组合。
 * 纯模板模式，零 LLM 成本，秒级完成。
 *
 * 标定参数:
 *   1. DIRECTION_THRESHOLD — 共识方向判定阈值
 *   2. SENSITIVITY_SCALE — Agent 不确定性敏感度全局缩放
 *   3. INTERPRETATION_AMPLIFICATION — 解释风格非线性放大系数
 *
 * 运行: npx tsx test/calibrate-params.ts
 */

import { EVENTS, UnifiedEvent } from "./events";
import { getAllAgents } from "../src/lib/agents/v9/agentDefinitions";
import { computeAllAgentStates } from "../src/lib/agents/v9/agentInterpretation";
import { templateFactorExtraction } from "../src/lib/agents/v9/factorExtraction";
import {
  computeNonlinearConsensus,
  NonlinearConsensusInput,
  DEFAULT_NONLINEAR_CONFIG,
} from "../src/lib/agents/v9/nonlinearConsensus";
import { V9AgentDefinition, V9AgentState } from "../src/lib/agents/v9/types";

// ==================== 参数网格 ====================

const DIRECTION_THRESHOLDS = [5, 8, 10, 12, 15, 18, 20, 25, 30];
const SENSITIVITY_SCALES = [0.5, 0.7, 0.85, 1.0, 1.15, 1.3, 1.5, 1.8, 2.0];
const INTERPRETATION_AMPLIFICATIONS = [0.0, 0.3, 0.5, 0.7, 1.0, 1.3, 1.5, 1.8, 2.0];

// ==================== 评分函数 ====================

function getDirection(consensus: number, threshold: number): "up" | "down" | "neutral" {
  if (consensus > threshold) return "up";
  if (consensus < -threshold) return "down";
  return "neutral";
}

/**
 * 平衡准确率 — 对各类别准确率取平均，
 * 避免 "永远猜涨" 在类不平衡时获得虚高分数。
 */
function balancedAccuracy(results: Array<{ predicted: string; actual: string }>): number {
  const classes = ["up", "down", "neutral"] as const;
  const perClass: Record<string, { correct: number; total: number }> = {};
  for (const c of classes) perClass[c] = { correct: 0, total: 0 };

  for (const r of results) {
    perClass[r.actual].total++;
    if (r.predicted === r.actual) perClass[r.actual].correct++;
  }

  const accuracies = classes
    .filter(c => perClass[c].total > 0)
    .map(c => perClass[c].correct / perClass[c].total);
  return accuracies.reduce((s, a) => s + a, 0) / accuracies.length;
}

function standardAccuracy(results: Array<{ predicted: string; actual: string }>): number {
  const correct = results.filter(r => r.predicted === r.actual).length;
  return correct / results.length;
}

// ==================== 单参数组合运行 ====================

interface ParamCombo {
  threshold: number;
  sensitivityScale: number;
  interpretationAmplification: number;
}

interface ComboResult extends ParamCombo {
  total: number;
  correct: number;
  accuracy: number;
  balancedAcc: number;
  upCorrect: number; upTotal: number; upAcc: number;
  downCorrect: number; downTotal: number; downAcc: number;
  neutralCorrect: number; neutralTotal: number; neutralAcc: number;
  avgConsensus: number;
  avgAbsConsensus: number;
}

function evaluateCombo(
  combo: ParamCombo,
  events: UnifiedEvent[],
  agents: V9AgentDefinition[],
): ComboResult {
  const results: Array<{ predicted: string; actual: string }> = [];
  let consensusSum = 0;
  let absConsensusSum = 0;
  let correct = 0;

  for (const event of events) {
    // 1. 模板因子提取
    const marketData = {
      vix: event.vix,
      rsi: event.rsi,
      dropMagnitude: event.drop,
      hasPolicyResponse: event.hasPolicy,
      hasLeverageDamage: event.hasLeverage,
      hasSolvencyDamage: event.hasSolvency,
    };
    const factorVector = templateFactorExtraction(event.news, marketData);

    // 2. Agent 信念计算（带标定参数）
    const { states } = computeAllAgentStates(factorVector, agents, {
      disableBlindness: false,
      interpretationAmplification: combo.interpretationAmplification,
      sensitivityScale: combo.sensitivityScale,
    });

    // 3. 非线性共识（动态集成）
    const beliefs = Object.values(states).map(s => s.belief);
    const r = computeKuramotoR(beliefs);
    const input: NonlinearConsensusInput = { agents, states, kuramotoR: r };
    const consensusResult = computeNonlinearConsensus(input, {
      ...DEFAULT_NONLINEAR_CONFIG,
      method: "dynamic_ensemble",
    });

    // 4. 判定方向
    const predicted = getDirection(consensusResult.consensus, combo.threshold);

    results.push({ predicted, actual: event.actual });
    consensusSum += consensusResult.consensus;
    absConsensusSum += Math.abs(consensusResult.consensus);
    if (predicted === event.actual) correct++;
  }

  // 按类别统计
  const upEvents = results.filter(r => r.actual === "up");
  const downEvents = results.filter(r => r.actual === "down");
  const neutralEvents = results.filter(r => r.actual === "neutral");

  const upCorrect = upEvents.filter(r => r.predicted === "up").length;
  const downCorrect = downEvents.filter(r => r.predicted === "down").length;
  const neutralCorrect = neutralEvents.filter(r => r.predicted === "neutral").length;

  return {
    ...combo,
    total: events.length,
    correct,
    accuracy: standardAccuracy(results),
    balancedAcc: balancedAccuracy(results),
    upCorrect, upTotal: upEvents.length, upAcc: upEvents.length > 0 ? upCorrect / upEvents.length : 0,
    downCorrect, downTotal: downEvents.length, downAcc: downEvents.length > 0 ? downCorrect / downEvents.length : 0,
    neutralCorrect, neutralTotal: neutralEvents.length,
    neutralAcc: neutralEvents.length > 0 ? neutralCorrect / neutralEvents.length : 0,
    avgConsensus: consensusSum / events.length,
    avgAbsConsensus: absConsensusSum / events.length,
  };
}

function computeKuramotoR(beliefs: number[]): number {
  const n = beliefs.length;
  if (n === 0) return 0;
  let sx = 0, sy = 0;
  for (const b of beliefs) {
    const phase = (b / 100) * (Math.PI / 2);
    sx += Math.cos(phase);
    sy += Math.sin(phase);
  }
  return Math.sqrt(sx * sx + sy * sy) / n;
}

// ==================== 主程序 ====================

async function main() {
  console.log("=".repeat(80));
  console.log("SwarmAlpha v9.7 — 参数标定");
  console.log("=".repeat(80));
  console.log(`事件总数: ${EVENTS.length}`);
  console.log(`参数网格: ${DIRECTION_THRESHOLDS.length}×${SENSITIVITY_SCALES.length}×${INTERPRETATION_AMPLIFICATIONS.length} = ${DIRECTION_THRESHOLDS.length * SENSITIVITY_SCALES.length * INTERPRETATION_AMPLIFICATIONS.length} 组合`);
  console.log("");

  // 统计事件分布
  const upCount = EVENTS.filter(e => e.actual === "up").length;
  const downCount = EVENTS.filter(e => e.actual === "down").length;
  const neutralCount = EVENTS.filter(e => e.actual === "neutral").length;
  console.log(`事件分布: Up=${upCount} Down=${downCount} Neutral=${neutralCount}`);
  console.log(`'永远猜涨' 准确率: ${(upCount / EVENTS.length * 100).toFixed(1)}%`);
  console.log(`'永远猜跌' 准确率: ${(downCount / EVENTS.length * 100).toFixed(1)}%`);
  console.log("");

  const agents = getAllAgents(true);

  // 生成所有参数组合
  const combos: ParamCombo[] = [];
  for (const threshold of DIRECTION_THRESHOLDS) {
    for (const sensitivityScale of SENSITIVITY_SCALES) {
      for (const interpretationAmplification of INTERPRETATION_AMPLIFICATIONS) {
        combos.push({ threshold, sensitivityScale, interpretationAmplification });
      }
    }
  }

  console.log(`运行 ${combos.length} 个参数组合 × ${EVENTS.length} 个事件...`);
  console.log("");

  const startTime = Date.now();
  const results: ComboResult[] = [];
  let doneCount = 0;

  for (const combo of combos) {
    const result = evaluateCombo(combo, EVENTS, agents);
    results.push(result);
    doneCount++;

    if (doneCount % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const best = results.reduce((a, b) => b.balancedAcc - a.balancedAcc > 0 ? b : a);
      console.log(
        `[${doneCount}/${combos.length}] ${elapsed}s | ` +
        `最佳: th=${best.threshold} s=${best.sensitivityScale} i=${best.interpretationAmplification} ` +
        `BalAcc=${(best.balancedAcc * 100).toFixed(1)}% Acc=${(best.accuracy * 100).toFixed(1)}%`
      );
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("");
  console.log(`完成。耗时 ${totalTime}s`);
  console.log("");

  // 按平衡准确率排序
  results.sort((a, b) => b.balancedAcc - a.balancedAcc);

  // ==================== 基线: 默认参数 ====================
  const defaultCombo: ParamCombo = { threshold: 15, sensitivityScale: 1.0, interpretationAmplification: 1.0 };
  const defaultResult = evaluateCombo(defaultCombo, EVENTS, agents);
  const defaultRank = results.findIndex(r =>
    r.threshold === 15 && r.sensitivityScale === 1.0 && r.interpretationAmplification === 1.0
  ) + 1;

  console.log("=".repeat(80));
  console.log("基线 (默认参数)");
  console.log("=".repeat(80));
  printCombo(defaultResult, defaultRank);

  // ==================== Top 10 ====================
  console.log("");
  console.log("=".repeat(80));
  console.log("Top 10 参数组合 (按平衡准确率)");
  console.log("=".repeat(80));
  console.log("");
  console.log("┌──────┬───────┬────┬────┬────────┬────────┬──────┬──────┬────────┐");
  console.log("│ 排名 │ 阈值  │ 敏 │ 解 │ 平衡   │ 标准   │  Up  │ Down │ 平均   │");
  console.log("│      │       │ 感 │ 释 │ 准确率 │ 准确率 │      │      │ |共识| │");
  console.log("├──────┼───────┼────┼────┼────────┼────────┼──────┼──────┼────────┤");

  for (let i = 0; i < Math.min(10, results.length); i++) {
    const r = results[i];
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : ` ${i + 1}`;
    console.log(
      `│ ${medal}  │ ${String(r.threshold).padStart(4)} │ ` +
      `${r.sensitivityScale.toFixed(2).padStart(4)} │ ` +
      `${r.interpretationAmplification.toFixed(1).padStart(3)} │ ` +
      `${(r.balancedAcc * 100).toFixed(1).padStart(5)}% │ ` +
      `${(r.accuracy * 100).toFixed(1).padStart(5)}% │ ` +
      `${(r.upAcc * 100).toFixed(0).padStart(3)}% │ ` +
      `${(r.downAcc * 100).toFixed(0).padStart(3)}% │ ` +
      `${r.avgAbsConsensus.toFixed(1).padStart(5)} │`
    );
  }
  console.log("└──────┴───────┴────┴────┴────────┴────────┴──────┴──────┴────────┘");

  // ==================== 最优组合详情 ====================
  console.log("");
  console.log("=".repeat(80));
  console.log("最优组合详情");
  console.log("=".repeat(80));
  const best = results[0];
  printComboDetail(best, defaultResult, EVENTS);

  // ==================== 灵敏度分析 ====================
  console.log("");
  console.log("=".repeat(80));
  console.log("参数灵敏度分析 (固定最优两个参数, 变化另一个)");
  console.log("=".repeat(80));

  // 固定 sensitivityScale 和 interpretationAmplification, 变化 threshold
  console.log("");
  console.log(`固定 sens=${best.sensitivityScale} interp=${best.interpretationAmplification}, 变化阈值:`);
  for (const t of DIRECTION_THRESHOLDS) {
    const c: ParamCombo = { threshold: t, sensitivityScale: best.sensitivityScale, interpretationAmplification: best.interpretationAmplification };
    const r = evaluateCombo(c, EVENTS, agents);
    const marker = t === best.threshold ? " ← 最优" : "";
    console.log(`  threshold=${String(t).padStart(2)} → BalAcc=${(r.balancedAcc * 100).toFixed(1)}% Acc=${(r.accuracy * 100).toFixed(1)}% Up=${(r.upAcc * 100).toFixed(0)}% Down=${(r.downAcc * 100).toFixed(0)}%${marker}`);
  }

  console.log("");
  console.log(`固定 th=${best.threshold} interp=${best.interpretationAmplification}, 变化敏感度:`);
  for (const s of SENSITIVITY_SCALES) {
    const c: ParamCombo = { threshold: best.threshold, sensitivityScale: s, interpretationAmplification: best.interpretationAmplification };
    const r = evaluateCombo(c, EVENTS, agents);
    const marker = s === best.sensitivityScale ? " ← 最优" : "";
    console.log(`  sens=${s.toFixed(2)} → BalAcc=${(r.balancedAcc * 100).toFixed(1)}% Acc=${(r.accuracy * 100).toFixed(1)}% Up=${(r.upAcc * 100).toFixed(0)}% Down=${(r.downAcc * 100).toFixed(0)}%${marker}`);
  }

  console.log("");
  console.log(`固定 th=${best.threshold} sens=${best.sensitivityScale}, 变化解释放大:`);
  for (const i of INTERPRETATION_AMPLIFICATIONS) {
    const c: ParamCombo = { threshold: best.threshold, sensitivityScale: best.sensitivityScale, interpretationAmplification: i };
    const r = evaluateCombo(c, EVENTS, agents);
    const marker = i === best.interpretationAmplification ? " ← 最优" : "";
    console.log(`  interp=${i.toFixed(1)} → BalAcc=${(r.balancedAcc * 100).toFixed(1)}% Acc=${(r.accuracy * 100).toFixed(1)}% Up=${(r.upAcc * 100).toFixed(0)}% Down=${(r.downAcc * 100).toFixed(0)}%${marker}`);
  }

  // ==================== 结论 ====================
  console.log("");
  console.log("=".repeat(80));
  console.log("标定结论");
  console.log("=".repeat(80));
  const improvement = best.balancedAcc - defaultResult.balancedAcc;
  console.log(`默认参数: th=15 sens=1.0 interp=1.0 → BalAcc=${(defaultResult.balancedAcc * 100).toFixed(1)}% Acc=${(defaultResult.accuracy * 100).toFixed(1)}%`);
  console.log(`最优参数: th=${best.threshold} sens=${best.sensitivityScale} interp=${best.interpretationAmplification} → BalAcc=${(best.balancedAcc * 100).toFixed(1)}% Acc=${(best.accuracy * 100).toFixed(1)}%`);
  console.log(`提升: BalAcc ${improvement > 0 ? "+" : ""}${(improvement * 100).toFixed(1)}pp | Acc ${((best.accuracy - defaultResult.accuracy) * 100) > 0 ? "+" : ""}${((best.accuracy - defaultResult.accuracy) * 100).toFixed(1)}pp`);
  console.log("");
  console.log("答辩用一句话:");
  console.log(`  "核心参数通过 ${EVENTS.length} 个历史事件的网格搜索标定，平衡准确率从 ${(defaultResult.balancedAcc * 100).toFixed(0)}% 提升到 ${(best.balancedAcc * 100).toFixed(0)}%。"`);
  console.log("");
  console.log("=".repeat(80));
  console.log("标定完成");
  console.log("=".repeat(80));
}

// ==================== 输出辅助 ====================

function printCombo(r: ComboResult, rank: number) {
  console.log(`  排名: ${rank}  参数: th=${r.threshold} sens=${r.sensitivityScale} interp=${r.interpretationAmplification}`);
  console.log(`  准确率: 平衡=${(r.balancedAcc * 100).toFixed(1)}%  标准=${(r.accuracy * 100).toFixed(1)}%`);
  console.log(`  各方向: Up=${(r.upAcc * 100).toFixed(0)}% (${r.upCorrect}/${r.upTotal})  Down=${(r.downAcc * 100).toFixed(0)}% (${r.downCorrect}/${r.downTotal})  Neutral=${(r.neutralAcc * 100).toFixed(0)}% (${r.neutralCorrect}/${r.neutralTotal})`);
  console.log(`  平均 |共识|: ${r.avgAbsConsensus.toFixed(1)}`);
}

function printComboDetail(best: ComboResult, baseline: ComboResult, events: UnifiedEvent[]) {
  console.log(`阈值: ${best.threshold} (默认 15)  — 判定方向的共识门槛`);
  console.log(`敏感度缩放: ${best.sensitivityScale} (默认 1.0)  — Agent 对不确定性的反应强度`);
  console.log(`解释放大: ${best.interpretationAmplification} (默认 1.0)  — 解释风格的非线性程度`);
  console.log("");
  console.log(`平衡准确率: ${(best.balancedAcc * 100).toFixed(1)}% (基线 ${(baseline.balancedAcc * 100).toFixed(1)}%)`);
  console.log(`标准准确率: ${(best.accuracy * 100).toFixed(1)}% (基线 ${(baseline.accuracy * 100).toFixed(1)}%)`);

  const upDelta = (best.upAcc - baseline.upAcc) * 100;
  const downDelta = (best.downAcc - baseline.downAcc) * 100;
  const neutralDelta = (best.neutralAcc - baseline.neutralAcc) * 100;
  console.log(`Up: ${(best.upAcc * 100).toFixed(0)}% (${upDelta > 0 ? "+" : ""}${upDelta.toFixed(1)}pp)  Down: ${(best.downAcc * 100).toFixed(0)}% (${downDelta > 0 ? "+" : ""}${downDelta.toFixed(1)}pp)  Neutral: ${(best.neutralAcc * 100).toFixed(0)}% (${neutralDelta > 0 ? "+" : ""}${neutralDelta.toFixed(1)}pp)`);
}

main().catch(console.error);
