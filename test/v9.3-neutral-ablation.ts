/**
 * SwarmAlpha v9.3 — Neutral Detection Engine 消融实验
 *
 * 测试四规则 Neutral 检测体系的独立贡献。
 *
 * 运行: npx tsx test/v9.3-neutral-ablation.ts
 *
 * 变体:
 *   1. v9.3-Full           — 全部规则 (R1 + R2∧3 + R4)
 *   2. 仅Rule1              — 仅弱共识门控
 *   3. 仅Rule2∧3            — 仅高分歧+低同步门控
 *   4. 仅Rule4              — 仅高不确定性+弱共识门控
 *   5. v9.2-Baseline        — 无Neutral引擎 (对照)
 *
 * 指标:
 *   Neutral Accuracy (Precision)
 *   Neutral Recall
 *   Neutral F1
 *   总准确率 / Up / Down
 *   belief_std
 */

import { EVENTS, UnifiedEvent } from "./events";
import { runSwarmV9 } from "../src/lib/agents/v9/simulation";
import { V9SimConfig, V9Direction } from "../src/lib/agents/v9/types";

// ==================== 实验配置 ====================

const USE_LLM = process.argv.includes("--llm");
console.log(`🧪 V9.3 Neutral Engine 消融 — 模式: ${USE_LLM ? "🤖 LLM" : "📋 模板"}`);

const ALL_EVENTS = EVENTS;

// ==================== 消融变体 ====================

interface NeutralVariant {
  name: string;
  ablation: V9SimConfig["ablation"];
}

const VARIANTS: NeutralVariant[] = [
  {
    name: "v9.3-Full",
    ablation: {
      // 全开: 所有规则启用 (默认)
    },
  },
  {
    name: "仅Rule1 (弱共识)",
    ablation: {
      disableNeutralRule2_3: true,
      disableNeutralRule4: true,
    },
  },
  {
    name: "仅Rule2∧3 (分歧+失同步)",
    ablation: {
      disableNeutralRule1: true,
      disableNeutralRule4: true,
    },
  },
  {
    name: "仅Rule4 (高不确定性+弱共识)",
    ablation: {
      disableNeutralRule1: true,
      disableNeutralRule2_3: true,
    },
  },
  {
    name: "v9.2-Baseline (无Neutral引擎)",
    ablation: {
      disableUncertainty: true,  // 完全绕过Neutral检测
    },
  },
];

// ==================== 结果结构 ====================

interface NeutralResult {
  name: string;
  total: number;
  correct: number;
  accuracy: number;
  upCorrect: number; upTotal: number; upAccuracy: number;
  downCorrect: number; downTotal: number; downAccuracy: number;
  // Neutral 指标
  neutralPredicted: number;        // 系统预测 Neutral 的次数
  neutralPredictedCorrect: number; // 预测 Neutral 且正确
  neutralActual: number;           // 实际 Neutral 事件数
  neutralAccuracy: number;         // Precision: correctNeutralPred / totalNeutralPred
  neutralRecall: number;           // Recall: correctNeutralPred / actualNeutral
  neutralF1: number;               // F1 score for Neutral class
  avgBeliefStd: number;
}

// ==================== 运行消融 ====================

async function runNeutralAblation(variant: NeutralVariant): Promise<NeutralResult> {
  const config: V9SimConfig = {
    news: "",
    marketData: { vix: 25, rsi: 40, dropMagnitude: 5, hasPolicyResponse: false, hasLeverageDamage: false, hasSolvencyDamage: false },
    rounds: 1,
    ablation: variant.ablation,
  };

  let correct = 0, total = 0;
  let upC = 0, upT = 0, downC = 0, downT = 0;
  let neutralPredicted = 0, neutralPredictedCorrect = 0, neutralActual = 0;
  let totalBeliefStd = 0;

  for (const event of ALL_EVENTS) {
    config.news = event.news;
    config.marketData = {
      vix: event.vix, rsi: event.rsi, dropMagnitude: event.drop,
      hasPolicyResponse: event.hasPolicy,
      hasLeverageDamage: event.hasLeverage,
      hasSolvencyDamage: event.hasSolvency,
    };

    const result = await runSwarmV9(config, USE_LLM);
    const dir = result.finalDecision.direction;
    const actual = event.actual.toUpperCase() as V9Direction;
    const ok = dir === actual;

    total++;
    if (ok) correct++;

    // Up/Down 统计
    switch (event.actual) {
      case "up": upT++; if (ok) upC++; break;
      case "down": downT++; if (ok) downC++; break;
      case "neutral": neutralActual++; break;
    }

    // Neutral 统计
    if (dir === "NEUTRAL") {
      neutralPredicted++;
      if (ok) neutralPredictedCorrect++;
    }

    totalBeliefStd += result.ablationMetrics.beliefStdHistory[0] ?? 0;
  }

  const neutralAccuracy = neutralPredicted > 0
    ? (neutralPredictedCorrect / neutralPredicted) * 100
    : 0;
  const neutralRecall = neutralActual > 0
    ? (neutralPredictedCorrect / neutralActual) * 100
    : 0;
  const neutralF1 = (neutralAccuracy + neutralRecall) > 0
    ? (2 * neutralAccuracy * neutralRecall) / (neutralAccuracy + neutralRecall)
    : 0;

  return {
    name: variant.name,
    total, correct,
    accuracy: total > 0 ? (correct / total) * 100 : 0,
    upCorrect: upC, upTotal: upT, upAccuracy: upT > 0 ? (upC / upT) * 100 : 0,
    downCorrect: downC, downTotal: downT, downAccuracy: downT > 0 ? (downC / downT) * 100 : 0,
    neutralPredicted, neutralPredictedCorrect, neutralActual,
    neutralAccuracy, neutralRecall, neutralF1,
    avgBeliefStd: totalBeliefStd / total,
  };
}

// ==================== 主程序 ====================

async function main() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║        🛡️  SwarmAlpha v9.3 — Neutral Detection Engine 消融实验              ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");
  console.log(`  事件: ${ALL_EVENTS.length} | Up=${ALL_EVENTS.filter(e=>e.actual==="up").length} Down=${ALL_EVENTS.filter(e=>e.actual==="down").length} Neutral=${ALL_EVENTS.filter(e=>e.actual==="neutral").length}`);
  console.log(`  规则: R1=abs(consensus)<15 | R2=std>45 | R3=r<0.4 | R4=unc>70∧abs(cons)<25`);
  console.log("");

  const results: NeutralResult[] = [];
  for (const variant of VARIANTS) {
    process.stdout.write(`  运行: ${variant.name.padEnd(30)}... `);
    const result = await runNeutralAblation(variant);
    results.push(result);
    console.log(`总=${result.accuracy.toFixed(1)}% N-Recall=${result.neutralRecall.toFixed(0)}% N-Prec=${result.neutralAccuracy.toFixed(0)}%`);
  }

  // ==================== 结果表 ====================

  const baseline = results[4]; // v9.2-Baseline
  const full = results[0];     // v9.3-Full

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                     📊 Neutral Detection Engine 消融总表                     ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("| 变体 | 总准确率 | Up | Down | N-Pred | N-Acc | N-Recall | N-F1 | belief_std |");
  console.log("|------|---------|-----|------|--------|-------|----------|------|------------|");

  for (const r of results) {
    console.log(
      `| ${r.name.padEnd(26)} | ${r.accuracy.toFixed(1).padStart(5)}% | ` +
      `${r.upAccuracy.toFixed(0).padStart(2)}% | ${r.downAccuracy.toFixed(0).padStart(3)}% | ` +
      `${String(r.neutralPredicted).padStart(4)} | ${r.neutralAccuracy.toFixed(0).padStart(3)}% | ` +
      `${r.neutralRecall.toFixed(0).padStart(6)}% | ${r.neutralF1.toFixed(0).padStart(3)}% | ` +
      `${r.avgBeliefStd.toFixed(1).padStart(8)} |`
    );
  }
  console.log("");

  // ==================== 规则贡献分析 ====================

  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                     🔬 规则独立贡献分析                                      ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");
  console.log("");

  const r1Only = results[1];
  const r23Only = results[2];
  const r4Only = results[3];

  console.log("| 规则 | Neutral预测数 | Neutral Recall | 总准确率影响 | 独立贡献评估 |");
  console.log("|------|-------------|---------------|------------|------------|");

  const r1Contribution = r1Only.neutralPredicted;
  const r23Contribution = r23Only.neutralPredicted;
  const r4Contribution = r4Only.neutralPredicted;

  console.log(`| R1 (弱共识)           | ${String(r1Contribution).padStart(11)} | ${r1Only.neutralRecall.toFixed(0).padStart(11)}% | ${(r1Only.accuracy - baseline.accuracy).toFixed(1).padStart(8)}pp | ${r1Only.neutralRecall > 0 ? "✅ 有效召回" : "❌ 未触发"} |`);
  console.log(`| R2∧3 (分歧+失同步)    | ${String(r23Contribution).padStart(11)} | ${r23Only.neutralRecall.toFixed(0).padStart(11)}% | ${(r23Only.accuracy - baseline.accuracy).toFixed(1).padStart(8)}pp | ${r23Only.neutralRecall > 0 ? "✅ 有效召回" : "❌ 未触发"} |`);
  console.log(`| R4 (高不确定+弱共识)   | ${String(r4Contribution).padStart(11)} | ${r4Only.neutralRecall.toFixed(0).padStart(11)}% | ${(r4Only.accuracy - baseline.accuracy).toFixed(1).padStart(8)}pp | ${r4Only.neutralRecall > 0 ? "✅ 有效召回" : "❌ 未触发"} |`);
  console.log(`| Full (全部组合)        | ${String(full.neutralPredicted).padStart(11)} | ${full.neutralRecall.toFixed(0).padStart(11)}% | ${(full.accuracy - baseline.accuracy).toFixed(1).padStart(8)}pp | ${full.neutralRecall > 20 ? "✅ 达标" : "⚠️ 需改进"} |`);
  console.log("");

  // ==================== 方向准确性对比 ====================

  console.log("### 方向准确率对比 (Full vs Baseline)");
  console.log("");
  console.log("| 指标 | v9.3-Full | v9.2-Baseline | 变化 |");
  console.log("|------|----------|-------------|------|");

  const accDelta = full.accuracy - baseline.accuracy;
  const upDelta = full.upAccuracy - baseline.upAccuracy;
  const downDelta = full.downAccuracy - baseline.downAccuracy;

  console.log(`| 总准确率 | ${full.accuracy.toFixed(1)}% | ${baseline.accuracy.toFixed(1)}% | ${accDelta > 0 ? "+" : ""}${accDelta.toFixed(1)}pp |`);
  console.log(`| Up | ${full.upAccuracy.toFixed(0)}% | ${baseline.upAccuracy.toFixed(0)}% | ${upDelta > 0 ? "+" : ""}${upDelta.toFixed(0)}pp |`);
  console.log(`| Down | ${full.downAccuracy.toFixed(0)}% | ${baseline.downAccuracy.toFixed(0)}% | ${downDelta > 0 ? "+" : ""}${downDelta.toFixed(0)}pp |`);
  console.log(`| belief_std | ${full.avgBeliefStd.toFixed(1)} | ${baseline.avgBeliefStd.toFixed(1)} | — |`);
  console.log("");

  // ==================== Neutral 详细诊断 ====================

  console.log("### Neutral 事件诊断 (v9.3-Full)");
  console.log("");
  console.log(`  实际 Neutral 事件: ${full.neutralActual}`);
  console.log(`  Neutral 预测总数: ${full.neutralPredicted}`);
  console.log(`  Neutral 正确预测: ${full.neutralPredictedCorrect}`);
  console.log(`  Neutral Recall: ${full.neutralRecall.toFixed(0)}%`);
  console.log(`  Neutral Precision: ${full.neutralAccuracy.toFixed(0)}%`);
  console.log(`  Neutral F1: ${full.neutralF1.toFixed(1)}%`);
  console.log("");

  // 检查是否有改善空间
  if (full.neutralRecall < 20 && full.neutralPredicted === 0) {
    console.log("  ⚠️ 警告: 零 Neutral 预测 — 所有规则均未触发。可能需要进一步降低阈值。");
  } else if (full.neutralRecall < 20) {
    console.log("  🟡 Neutral Recall 未达标 (<20%), 但已有非零预测。考虑微调阈值。");
  } else if (full.neutralRecall >= 20) {
    console.log("  ✅ Neutral Recall 达标 (>20%)");
  }
  console.log("");

  // ==================== 结论 ====================

  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                     🏁 v9.3 Neutral Engine 消融实验结论                      ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");
  console.log("");

  const goals = {
    neutralRecall: full.neutralRecall >= 20,
    beliefStd: full.avgBeliefStd > 35,
    totalAccuracy: full.accuracy >= 50,
  };

  console.log(`  Neutral Recall:  ${full.neutralRecall.toFixed(0)}% ${goals.neutralRecall ? "✅ (>20%)" : "❌ (<20%)"}`);
  console.log(`  belief_std:      ${full.avgBeliefStd.toFixed(1)} ${goals.beliefStd ? "✅ (>35)" : "❌ (≤35)"}`);
  console.log(`  总准确率:        ${full.accuracy.toFixed(1)}% ${goals.totalAccuracy ? "✅ (≥50%)" : "⚠️ (<50%)"}`);
  console.log(`  Up 准确率:       ${full.upAccuracy.toFixed(0)}% (${full.upCorrect}/${full.upTotal})`);
  console.log(`  Down 准确率:     ${full.downAccuracy.toFixed(0)}% (${full.downCorrect}/${full.downTotal})`);
  console.log("");

  const allPassed = Object.values(goals).every(Boolean);
  console.log(`  综合判定: ${allPassed ? "✅ 全部达标" : "⚠️ 部分指标需改进"}`);
  console.log("");
}

main().catch(console.error);
