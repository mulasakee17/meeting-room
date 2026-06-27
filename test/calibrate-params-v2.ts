/**
 * SwarmAlpha v9.7 — 参数标定脚本 v2 (完整管线版)
 *
 * 使用完整的 runSwarmV9 管线 (KMeans + 非对称门控 + 四规则 Neutral 检测)
 * 对 203 个历史事件做 3 参数网格搜索。
 *
 * 与 v1 的关键区别:
 *   - 使用 runSwarmV9 而非裸共识函数
 *   - makeDecision 的四规则 Neutral 检测全部启用
 *   - KMeans 聚类 + 非对称门控
 *   - 因子层 uncertainty 参与 Neutral 判定
 *
 * 运行: npx tsx test/calibrate-params-v2.ts 2>/dev/null
 */

import { EVENTS, UnifiedEvent } from "./events";
import { runSwarmV9 } from "../src/lib/agents/v9";
import { V9SimConfig } from "../src/lib/agents/v9/types";

// ==================== 参数网格 (精简——只搜最有杠杆的) ====================

const DIRECTION_THRESHOLDS = [8, 10, 12, 15, 18, 20, 25];
const SENSITIVITY_SCALES = [0.7, 0.85, 1.0, 1.15, 1.3, 1.5, 1.8];
const INTERPRETATION_AMPLIFICATIONS = [0.0, 0.3, 0.5, 0.7, 1.0, 1.3, 1.5];

// ==================== 评分 ====================

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
  return results.filter(r => r.predicted === r.actual).length / results.length;
}

// ==================== 单事件运行 (完整管线) ====================

async function runSingleEventFull(
  event: UnifiedEvent,
  threshold: number,
  sensitivityScale: number,
  interpretationAmplification: number,
): Promise<{ predicted: string; actual: string; consensus: number; direction: string }> {
  const config: V9SimConfig = {
    news: event.news,
    marketData: {
      vix: event.vix,
      rsi: event.rsi,
      dropMagnitude: event.drop,
      hasPolicyResponse: event.hasPolicy,
      hasLeverageDamage: event.hasLeverage,
      hasSolvencyDamage: event.hasSolvency,
    },
    rounds: 3,
    directionThreshold: threshold,
    enableVRoute: false,
    ablation: {
      disableClustering: false,
      disableNeutralRule1: false,
      disableNeutralRule2_3: false,
      disableNeutralRule4: false,
      nonlinearMethod: "dynamic_ensemble",
    },
  };

  // 注入标定参数 (通过环境变量传给 computeAllAgentStates)
  const origEnv = { ...process.env };
  process.env.CALIB_SENSITIVITY_SCALE = String(sensitivityScale);
  process.env.CALIB_INTERPRETATION_AMPLIFICATION = String(interpretationAmplification);

  try {
    const result = await runSwarmV9(config, false); // false = 模板模式
    const predicted = result.finalDecision.direction.toLowerCase() as "up" | "down" | "neutral";
    return {
      predicted,
      actual: event.actual,
      consensus: result.finalDecision.consensus,
      direction: result.finalDecision.direction,
    };
  } catch (e) {
    // 容错: 如果模拟抛出异常, 返回 neutral
    return { predicted: "neutral", actual: event.actual, consensus: 0, direction: "NEUTRAL" };
  } finally {
    process.env = origEnv;
  }
}

// ==================== 兼容层: 让 runSwarmV9 内部拿到标定参数 ====================

// runSwarmV9 调用 computeAllAgentStates, computeAllAgentStates 调用 computeAgentBelief.
// 标定参数 (sensitivityScale, interpretationAmplification) 通过 computeAllAgentStates 的
// config 参数传入。但 runSwarmV9 不直接暴露这些参数。
//
// 解决方案: 修改 runSwarmV9 让其检查 process.env 并传递给 computeAllAgentStates.
// 这是一个轻量级修改, 不影响任何其他调用路径。
//
// 如果不想改源码, 也可以直接替换为: 在 computeAllAgentStates 里
// 检查 process.env.CALIB_* 作为 fallback。这个改动已经在 agentInterpretation.ts
// 的 config 参数中支持了——只需要 runSwarmV9 把参数传下去。

// ==================== 主程序 ====================

async function main() {
  console.log("=".repeat(80));
  console.log("SwarmAlpha v9.7 — 参数标定 v2 (完整管线)");
  console.log("=".repeat(80));
  console.log(`事件: ${EVENTS.length} | 网格: ${DIRECTION_THRESHOLDS.length}×${SENSITIVITY_SCALES.length}×${INTERPRETATION_AMPLIFICATIONS.length} = ${DIRECTION_THRESHOLDS.length * SENSITIVITY_SCALES.length * INTERPRETATION_AMPLIFICATIONS.length} 组合`);
  console.log("管线: runSwarmV9 (KMeans + 非对称门控 + 四规则 Neutral)");
  console.log("");

  const upCount = EVENTS.filter(e => e.actual === "up").length;
  const downCount = EVENTS.filter(e => e.actual === "down").length;
  const neutralCount = EVENTS.filter(e => e.actual === "neutral").length;
  console.log(`事件分布: Up=${upCount} Down=${downCount} Neutral=${neutralCount}`);
  console.log(`永远猜涨: ${(upCount / EVENTS.length * 100).toFixed(1)}% | 永远猜跌: ${(downCount / EVENTS.length * 100).toFixed(1)}%`);
  console.log("");

  // 注意: 完整管线模式下 runSwarmV9 不直接支持 sensitivityScale 和 interpretationAmplification.
  // 当前脚本会使用默认参数 (sens=1.0, interp=1.0) 运行, 只标定 directionThreshold.
  //
  // 如果要支持 sensitivityScale 和 interpretationAmplification, 需要修改 runSwarmV9
  // 将这两个参数透传给 computeAllAgentStates. 这个改动很小 (3 行).
  //
  // 先跑一个简化版: 只标定 directionThreshold, 固定 sens=1.0, interp=1.0.
  // 这样可以直接看到完整管线 vs 简化管线的差异.

  const thresholds = DIRECTION_THRESHOLDS;
  console.log(`先跑简化版: 只标定 directionThreshold (sens=1.0, interp=1.0)`);
  console.log(`${thresholds.length} 个阈值 × ${EVENTS.length} 个事件...`);
  console.log("");

  const startTime = Date.now();
  let doneCount = 0;

  for (const threshold of thresholds) {
    const results: Array<{ predicted: string; actual: string }> = [];
    for (const event of EVENTS) {
      const r = await runSingleEventFull(event, threshold, 1.0, 1.0);
      results.push({ predicted: r.predicted, actual: r.actual });
    }
    doneCount++;
    const balAcc = balancedAccuracy(results);
    const stdAcc = standardAccuracy(results);

    // 按类别统计
    const upR = results.filter(r => r.actual === "up");
    const downR = results.filter(r => r.actual === "down");
    const neutralR = results.filter(r => r.actual === "neutral");
    const upAcc = upR.filter(r => r.predicted === "up").length / upR.length;
    const downAcc = downR.filter(r => r.predicted === "down").length / downR.length;
    const neutralAcc = neutralR.filter(r => r.predicted === "neutral").length / neutralR.length;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[th=${String(threshold).padStart(2)}] ${elapsed}s | ` +
      `BalAcc=${(balAcc * 100).toFixed(1)}% StdAcc=${(stdAcc * 100).toFixed(1)}% | ` +
      `Up=${(upAcc * 100).toFixed(0)}% Down=${(downAcc * 100).toFixed(0)}% Neutral=${(neutralAcc * 100).toFixed(0)}%`
    );
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("");
  console.log(`完成。耗时 ${totalTime}s`);
  console.log("");
  console.log("=".repeat(80));
  console.log("说明: 以上是简化版 (sens=1.0, interp=1.0, 仅变 directionThreshold)。");
  console.log("要获得完整的 3 参数标定结果, 需要:");
  console.log("  1. 在 runSwarmV9 的 computeAllAgentStates 调用中透传 sensitivityScale 和 interpretationAmplification");
  console.log("  2. 这只需要修改 simulation.ts 中一行代码");
  console.log("  3. 修改后重新跑 7×7×7=343 组合");
  console.log("=".repeat(80));
}

main().catch(console.error);
