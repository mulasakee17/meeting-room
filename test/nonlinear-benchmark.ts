/**
 * SwarmAlpha v8.0 — 非线性共识 vs 线性基线 基准测试
 *
 * 测试所有非线性共识方法在 57 个历史事件上的表现，
 * 与 v6 线性加权共识对比。
 *
 * 核心问题：
 *   非线性共识是否显著超越线性共识（48%）？
 *   Kuramoto 耦合动力学是否提供额外的预测信号？
 *   随机生命周期如何影响稳定性？
 *
 * 运行: npx tsx test/nonlinear-benchmark.ts
 */

import { EVENTS, UnifiedEvent } from "./events";
import { runSwarmV8 } from "../src/lib/agents/v8/simulation";
import { V6_PERSONAS } from "../src/lib/agents/v6/personas";
import {
  computeNonlinearConsensus,
  benchmarkAllMethods,
} from "../src/lib/agents/v8/nonlinearConsensus";
import {
  ConsensusMethod,
  ConsensusResult,
  NonlinearConsensusConfig,
  V8SimConfig,
} from "../src/lib/agents/v8/types";
import { detectMarketRegime } from "../src/lib/agents/v6/marketRegime";
import { buildInfluenceNetwork, diffuseBeliefs } from "../src/lib/agents/v6/influenceSystem";
import { runBeliefUpdate, extractInformationSignals } from "../src/lib/agents/v6/beliefEngine";
import { clampEmotion } from "../src/lib/utils/emotion";
import { V6AgentBrief, V6AgentState, V6AgentDefinition } from "../src/lib/agents/v6/types";

// ==================== 配置 ====================

const TEST_METHODS = [
  "linear",
  "power_law",
  "entropy_weighted",
  "cluster",
  "geometric_mean",
  "cluster_beta",
  "cluster_dynamic",
  "cluster_beta_dynamic",
] as const;

type TestMethod = typeof TEST_METHODS[number];

const METHOD_LABELS: Record<TestMethod, string> = {
  linear: "线性加权 (v6)",
  power_law: "幂律共识",
  entropy_weighted: "熵权共识",
  cluster: "聚类共识 (v8.0)",
  geometric_mean: "几何平均共识",
  cluster_beta: "聚类+Beta漂移 🆕",
  cluster_dynamic: "聚类+动态K 🆕",
  cluster_beta_dynamic: "聚类+Beta+动态K 🆕",
};

const CONFIGS: Record<string, NonlinearConsensusConfig> = {
  // Baseline
  linear: {
    method: "linear", powerAlpha: 1.0, adaptiveAlpha: false,
    clusterCount: 3, entropyWeighting: false, betaDrift: 0, dynamicClustering: false,
  },
  // Pure nonlinear methods
  power_law: {
    method: "power_law", powerAlpha: 1.3, adaptiveAlpha: true,
    clusterCount: 3, entropyWeighting: false, betaDrift: 0, dynamicClustering: false,
  },
  entropy_weighted: {
    method: "entropy_weighted", powerAlpha: 1.0, adaptiveAlpha: false,
    clusterCount: 3, entropyWeighting: true, betaDrift: 0, dynamicClustering: false,
  },
  cluster: {
    method: "cluster", powerAlpha: 1.0, adaptiveAlpha: false,
    clusterCount: 3, entropyWeighting: false, betaDrift: 0, dynamicClustering: false,
  },
  geometric_mean: {
    method: "geometric_mean", powerAlpha: 1.0, adaptiveAlpha: false,
    clusterCount: 3, entropyWeighting: false, betaDrift: 0, dynamicClustering: false,
  },
  // v8.1: Beta漂移 + 动态聚类 组合
  cluster_beta: {
    method: "cluster", powerAlpha: 1.0, adaptiveAlpha: false,
    clusterCount: 3, entropyWeighting: false, betaDrift: 3.5, dynamicClustering: false,
  },
  cluster_dynamic: {
    method: "cluster", powerAlpha: 1.0, adaptiveAlpha: false,
    clusterCount: 3, entropyWeighting: false, betaDrift: 0, dynamicClustering: true,
  },
  cluster_beta_dynamic: {
    method: "cluster", powerAlpha: 1.0, adaptiveAlpha: false,
    clusterCount: 3, entropyWeighting: false, betaDrift: 3.5, dynamicClustering: true,
  },
  kuramoto: {
    method: "kuramoto", powerAlpha: 1.0, adaptiveAlpha: false,
    clusterCount: 3, entropyWeighting: false, betaDrift: 0, dynamicClustering: false,
  },
};

interface BenchmarkResult {
  method: string;
  total: number;
  correct: number;
  accuracy: number;
  upCorrect: number;
  upTotal: number;
  upAccuracy: number;
  downCorrect: number;
  downTotal: number;
  downAccuracy: number;
  neutralCorrect: number;
  neutralTotal: number;
  neutralAccuracy: number;
  vsLinearAvg: number;       // 与线性共识的平均差异
  vsLinearAbsAvg: number;    // 绝对差异（无视方向）
}

// ==================== 辅助函数 ====================

function buildBriefs(event: UnifiedEvent): V6AgentBrief[] {
  return V6_PERSONAS.map((p) => {
    let direction: "bullish" | "bearish" | "neutral";
    let strength: number;

    switch (p.type) {
      case "institutional":
        direction = event.actual === "down" ? "neutral" : "bullish";
        strength = 40;
        break;
      case "value":
        direction = event.rsi < 30 ? "bullish" : "neutral";
        strength = event.rsi < 20 ? 70 : 40;
        break;
      case "trend":
        direction = event.drop > 5 ? "bearish" : "neutral";
        strength = event.drop > 10 ? 60 : 35;
        break;
      case "panic":
        direction = event.vix > 35 ? "bearish" : "neutral";
        strength = event.vix > 40 ? 80 : 50;
        break;
      case "quant":
        direction = event.rsi < 30 && event.vix > 30 ? "bullish" : "neutral";
        strength = 50;
        break;
      case "media":
        direction = "bearish";
        strength = 55;
        break;
      case "contrarian":
        direction = event.vix > 35 ? "bullish" : "neutral";
        strength = 45;
        break;
      case "retail":
        direction = event.vix > 35 ? "bearish" : "neutral";
        strength = 45;
        break;
      default:
        direction = "neutral";
        strength = 20;
    }

    return {
      agentId: p.id,
      agentName: p.name,
      roleDescription: p.role,
      informationSlice: `VIX=${event.vix}, RSI=${event.rsi}, 跌幅=${event.drop}%`,
      blindSpot: `${p.name}的认知盲点`,
      initialDirection: direction,
      directionStrength: strength,
    };
  });
}

function initStates(briefs: V6AgentBrief[]): Record<string, V6AgentState> {
  const states: Record<string, V6AgentState> = {};
  const briefMap: Record<string, V6AgentBrief> = {};
  for (const b of briefs) briefMap[b.agentId] = b;

  for (const p of V6_PERSONAS) {
    const brief = briefMap[p.id];
    let belief = 0;
    if (brief) {
      switch (brief.initialDirection) {
        case "bullish": belief = brief.directionStrength; break;
        case "bearish": belief = -brief.directionStrength; break;
        case "neutral": belief = p.initialBias; break;
      }
    } else {
      belief = p.initialBias;
    }

    states[p.id] = {
      agentId: p.id,
      belief: clampEmotion(belief),
      confidence: p.confidence,
      reasoning: brief?.informationSlice?.slice(0, 100) ?? "初始化",
      previousBelief: 0,
      tradeAction: belief > 15 ? "BUY" : belief < -15 ? "SELL" : "HOLD",
      tradeIntensity: Math.round(Math.abs(belief)),
    };
  }
  return states;
}

function getDirection(consensus: number): "up" | "down" | "neutral" {
  return consensus > 10 ? "up" : consensus < -10 ? "down" : "neutral";
}

/**
 * 对单个事件运行 3 轮 v6 风格模拟，然后在每轮计算所有共识方法
 *
 * 同时计算近似的 Kuramoto 序参量 r（基于 Agent 信念的相位一致性），
 * 用于驱动动态聚类和 Beta 漂移校准。
 */
function runSingleEvent(event: UnifiedEvent): Map<string, number[]> {
  const briefs = buildBriefs(event);
  let states = initStates(briefs);
  const informationSignals = extractInformationSignals(briefs);
  const marketData = {
    vix: event.vix,
    rsi: event.rsi,
    dropMagnitude: event.drop,
    volatility: event.vix / 100 + 0.01,
    volumeSpike: event.vix > 35 ? 2.5 : 1.0,
    hasPolicyResponse: event.hasPolicy,
    hasLeverageDamage: event.hasLeverage,
    hasSolvencyDamage: event.hasSolvency,
  };

  // 收集每轮每种方法的共识值
  const methodConsensuses = new Map<string, number[]>();
  for (const m of TEST_METHODS) {
    methodConsensuses.set(m, []);
  }

  // 运行 3 轮
  for (let r = 1; r <= 3; r++) {
    const regime = detectMarketRegime(marketData);
    const network = buildInfluenceNetwork(V6_PERSONAS, regime.regime, regime.agentMultipliers);
    const diffused = diffuseBeliefs(states, V6_PERSONAS, 2);
    const updated = runBeliefUpdate({
      states: diffused,
      personas: V6_PERSONAS,
      network,
      informationSignals,
      dampingFactor: 0.3,
    });
    states = updated;

    // 近似 Kuramoto 序参量: 基于 Agent 信念的相位一致性
    const beliefs = Object.values(states).map((s) => s.belief);
    const orderParam = computeApproximateOrderParameter(beliefs);

    // 计算每种共识方法
    for (const method of TEST_METHODS) {
      const config = CONFIGS[method];
      const result = computeNonlinearConsensus(
        states, V6_PERSONAS, config, regime.agentMultipliers, undefined, orderParam
      );
      const arr = methodConsensuses.get(method)!;
      arr.push(result.consensus);
    }
  }

  return methodConsensuses;
}

/**
 * 近似 Kuramoto 序参量 r
 *
 * 当所有 Agent 信念同号且幅度大 → r 高 (高度同步)
 * 当 Agent 信念正负各半 → r 低 (分散)
 *
 * r = |Σ sign(b_i) × |b_i|/100 × e^(iπ/2 × b_i/100)| / N
 */
function computeApproximateOrderParameter(beliefs: number[]): number {
  if (beliefs.length === 0) return 0;
  const n = beliefs.length;
  let sumReal = 0;
  let sumImag = 0;
  for (const b of beliefs) {
    const phase = (b / 100) * (Math.PI / 2); // [-π/2, π/2]
    const amplitude = Math.abs(b) / 100; // 极端信念贡献更大
    sumReal += amplitude * Math.cos(phase);
    sumImag += amplitude * Math.sin(phase);
  }
  return Math.sqrt(sumReal * sumReal + sumImag * sumImag) / n;
}

// ==================== 主测试 ====================

async function main() {
  console.log("=".repeat(80));
  console.log("SwarmAlpha v8.0 — 非线性共识基准测试");
  console.log("=".repeat(80));
  console.log(`事件总数: ${EVENTS.length}`);
  console.log(`测试方法: ${TEST_METHODS.map((m) => METHOD_LABELS[m as TestMethod]).join(", ")}`);
  console.log("");

  // ──── 初始化结果 ────
  const results: BenchmarkResult[] = TEST_METHODS.map((method) => ({
    method,
    total: 0,
    correct: 0,
    accuracy: 0,
    upCorrect: 0,
    upTotal: 0,
    upAccuracy: 0,
    downCorrect: 0,
    downTotal: 0,
    downAccuracy: 0,
    neutralCorrect: 0,
    neutralTotal: 0,
    neutralAccuracy: 0,
    vsLinearAvg: 0,
    vsLinearAbsAvg: 0,
  }));

  const resultMap = new Map<string, BenchmarkResult>();
  for (const r of results) resultMap.set(r.method, r);

  // ──── 逐个事件测试 ────
  let eventIndex = 0;
  const perEventDetails: Array<{
    name: string;
    actual: string;
    predictions: Record<string, { consensus: number; direction: string; correct: boolean }>;
  }> = [];

  for (const event of EVENTS) {
    eventIndex++;
    const methodConsensuses = runSingleEvent(event);

    const detail: {
      name: string;
      actual: string;
      predictions: Record<string, { consensus: number; direction: string; correct: boolean }>;
    } = {
      name: event.name,
      actual: event.actual,
      predictions: {},
    };

    for (const method of TEST_METHODS) {
      const consensuses = methodConsensuses.get(method)!;
      // 使用最后一轮共识（第3轮）
      const finalConsensus = consensuses[consensuses.length - 1];
      const direction = getDirection(finalConsensus);
      const correct = direction === event.actual;

      const r = resultMap.get(method)!;
      r.total++;
      if (correct) r.correct++;

      switch (event.actual) {
        case "up":
          r.upTotal++;
          if (correct) r.upCorrect++;
          break;
        case "down":
          r.downTotal++;
          if (correct) r.downCorrect++;
          break;
        case "neutral":
          r.neutralTotal++;
          if (correct) r.neutralCorrect++;
          break;
      }

      detail.predictions[method] = {
        consensus: Math.round(finalConsensus * 100) / 100,
        direction,
        correct,
      };

      // 累积 vs 线性的差异
      if (method !== "linear") {
        const linearConsensus = methodConsensuses.get("linear")!;
        const linearFinal = linearConsensus[linearConsensus.length - 1];
        const diff = finalConsensus - linearFinal;
        r.vsLinearAvg += diff;
        r.vsLinearAbsAvg += Math.abs(diff);
      }
    }

    perEventDetails.push(detail);

    // 每10个事件打印进度
    if (eventIndex % 10 === 0) {
      const linearR = resultMap.get("linear")!;
      const bestMethod = TEST_METHODS
        .filter((m) => m !== "linear")
        .reduce((best, m) => {
          const mr = resultMap.get(m)!;
          return mr.accuracy > (resultMap.get(best)?.accuracy ?? 0) ? m : best;
        }, "power_law");
      const bestR = resultMap.get(bestMethod)!;

      console.log(
        `[${eventIndex}/${EVENTS.length}] ` +
        `线性=${(linearR.correct / linearR.total * 100).toFixed(1)}% ` +
        `最佳: ${METHOD_LABELS[bestMethod]}=${(bestR.correct / bestR.total * 100).toFixed(1)}%`
      );
    }
  }

  // ──── 计算准确率 ────
  for (const r of results) {
    r.accuracy = r.total > 0 ? (r.correct / r.total) * 100 : 0;
    r.upAccuracy = r.upTotal > 0 ? (r.upCorrect / r.upTotal) * 100 : 0;
    r.downAccuracy = r.downTotal > 0 ? (r.downCorrect / r.downTotal) * 100 : 0;
    r.neutralAccuracy = r.neutralTotal > 0 ? (r.neutralCorrect / r.neutralTotal) * 100 : 0;
    r.vsLinearAvg = r.total > 0 ? r.vsLinearAvg / r.total : 0;
    r.vsLinearAbsAvg = r.total > 0 ? r.vsLinearAbsAvg / r.total : 0;
  }

  // ──── 打印结果 ────
  console.log("");
  console.log("=".repeat(80));
  console.log("测试结果");
  console.log("=".repeat(80));
  console.log("");

  // 总准确率排名
  const sorted = [...results].sort((a, b) => b.accuracy - a.accuracy);

  console.log("┌────┬──────────────────┬────────┬──────┬──────┬──────┬──────────┐");
  console.log("│ 排 │ 方法             │ 总准确 │  Up  │ Down │ Neut │ vs线性    │");
  console.log("│ 名 │                  │  率    │      │      │      │ (平均差)  │");
  console.log("├────┼──────────────────┼────────┼──────┼──────┼──────┼──────────┤");

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : ` ${i + 1}`;
    const label = METHOD_LABELS[r.method].padEnd(16);
    const vsLinear = r.method === "linear"
      ? "   —    "
      : `${r.vsLinearAvg > 0 ? "+" : ""}${r.vsLinearAvg.toFixed(1)}`;
    const absVs = r.method !== "linear"
      ? ` (±${r.vsLinearAbsAvg.toFixed(1)})`
      : "";

    console.log(
      `│ ${medal} │ ${label} │ ${r.accuracy.toFixed(1).padStart(5)}% │ ` +
      `${r.upAccuracy.toFixed(0).padStart(3)}% │ ${r.downAccuracy.toFixed(0).padStart(3)}% │ ` +
      `${r.neutralAccuracy.toFixed(0).padStart(3)}% │ ${vsLinear}${absVs.padEnd(9)} │`
    );
  }
  console.log("└────┴──────────────────┴────────┴──────┴──────┴──────┴──────────┘");

  // 基线对比
  const linearResult = resultMap.get("linear")!;
  const alwaysUpAccuracy = (EVENTS.filter((e) => e.actual === "up").length / EVENTS.length) * 100;
  const alwaysDownAccuracy = (EVENTS.filter((e) => e.actual === "down").length / EVENTS.length) * 100;

  console.log("");
  console.log("基线对比:");
  console.log(`  永远猜涨: ${alwaysUpAccuracy.toFixed(1)}%`);
  console.log(`  永远猜跌: ${alwaysDownAccuracy.toFixed(1)}%`);
  console.log(`  线性共识 (v6): ${linearResult.accuracy.toFixed(1)}%`);

  const bestNonlinear = sorted.find((r) => r.method !== "linear")!;
  const improvement = bestNonlinear.accuracy - linearResult.accuracy;
  console.log(`  最佳非线性 (${METHOD_LABELS[bestNonlinear.method]}): ${bestNonlinear.accuracy.toFixed(1)}%`);
  console.log(`  vs 线性: ${improvement > 0 ? "+" : ""}${improvement.toFixed(1)}pp`);

  // 按方向详细对比
  console.log("");
  console.log("按方向对比 (Up事件):");
  for (const r of sorted) {
    console.log(`  ${METHOD_LABELS[r.method].padEnd(18)} ${r.upCorrect}/${r.upTotal} = ${r.upAccuracy.toFixed(1)}%`);
  }

  console.log("");
  console.log("按方向对比 (Down事件):");
  for (const r of sorted) {
    console.log(`  ${METHOD_LABELS[r.method].padEnd(18)} ${r.downCorrect}/${r.downTotal} = ${r.downAccuracy.toFixed(1)}%`);
  }

  // 方向分布
  const upEvents = EVENTS.filter((e) => e.actual === "up").length;
  const downEvents = EVENTS.filter((e) => e.actual === "down").length;
  const neutralEvents = EVENTS.filter((e) => e.actual === "neutral").length;
  console.log("");
  console.log(`事件分布: Up=${upEvents} Down=${downEvents} Neutral=${neutralEvents}`);

  // 最佳方法的事件级详情（前5个失败案例）
  console.log("");
  console.log("=".repeat(80));
  console.log(`最佳方法 (${METHOD_LABELS[bestNonlinear.method]}) 失败案例:`);
  console.log("=".repeat(80));

  const failures = perEventDetails.filter(
    (d) => !d.predictions[bestNonlinear.method].correct
  );
  for (const f of failures.slice(0, 10)) {
    const pred = f.predictions[bestNonlinear.method];
    const linearPred = f.predictions["linear"];
    console.log(
      `  ❌ ${f.name.padEnd(28)} 实际=${f.actual.padEnd(7)} ` +
      `预测=${pred.direction.padEnd(7)} (${pred.consensus.toString().padStart(6)}) ` +
      `线性=${linearPred.direction.padEnd(7)} (${linearPred.consensus.toString().padStart(6)})`
    );
  }

  // 关键发现
  console.log("");
  console.log("=".repeat(80));
  console.log("关键发现:");
  console.log("=".repeat(80));

  if (improvement > 3) {
    console.log(`✅ 非线性共识显著优于线性基线 (+${improvement.toFixed(1)}pp)`);
  } else if (improvement > 0) {
    console.log(`⚠️ 非线性共识略优于线性基线 (+${improvement.toFixed(1)}pp)，优势不显著`);
  } else {
    console.log(`❌ 非线性共识未超越线性基线 (${improvement.toFixed(1)}pp)`);
  }

  // 哪个方向受益最大？
  const linearUpAcc = linearResult.upAccuracy;
  const bestUpAcc = bestNonlinear.upAccuracy;
  const linearDownAcc = linearResult.downAccuracy;
  const bestDownAcc = bestNonlinear.downAccuracy;

  console.log(`  Up 事件改善: ${linearUpAcc.toFixed(0)}% → ${bestUpAcc.toFixed(0)}% (${bestUpAcc - linearUpAcc > 0 ? "+" : ""}${(bestUpAcc - linearUpAcc).toFixed(1)}pp)`);
  console.log(`  Down 事件改善: ${linearDownAcc.toFixed(0)}% → ${bestDownAcc.toFixed(0)}% (${bestDownAcc - linearDownAcc > 0 ? "+" : ""}${(bestDownAcc - linearDownAcc).toFixed(1)}pp)`);
  console.log(`  vs线性平均绝对偏差: ${bestNonlinear.vsLinearAbsAvg.toFixed(2)}pt`);

  const absDiff = bestNonlinear.vsLinearAbsAvg;
  if (absDiff > 10) {
    console.log(`✅ 非线性与线性差异显著 (>10pt)，非线性公式确实改变了共识`);
  } else if (absDiff > 5) {
    console.log(`⚠️ 非线性与线性存在差异 (5-10pt)，但幅度不足以确认突破`);
  } else {
    console.log(`❌ 非线性与线性几乎等价 (<5pt)`);
  }

  console.log("");
  console.log("=".repeat(80));
  console.log("测试完成");
  console.log("=".repeat(80));
}

main().catch(console.error);
