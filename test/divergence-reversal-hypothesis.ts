/**
 * #1 分歧→反转假说 验证脚本
 *
 * 假设:
 *   Agent 信念极端分歧 (high belief_std) 不一定是"系统失败"——
 *   它可能是市场底部的信号。历史上，真正的底部由多空极端对抗构成。
 *
 * 预测:
 *   - 当 model 预测 DOWN 但 belief_std 很高 → 实际更可能为 UP (反转)
 *   - 当 model 预测 DOWN 且 belief_std 很低 → 实际更可能为 DOWN (正确)
 *   - belief_std 本身对方向准确率有非线性关系
 *
 * 方法:
 *   1. 203 事件全量模板模式回测 (零 LLM 成本)
 *   2. 按 belief_std 四分位分组 (Q1 低分歧 → Q4 极端分歧)
 *   3. 每组的: 方向准确率, UP召回, DOWN召回, 反转率
 *   4. 统计显著性检验
 */

import { EVENTS, UnifiedEvent } from "./events";
import { runSwarmV9 } from "../src/lib/agents/v9";
import { V9SwarmResult } from "../src/lib/agents/v9/types";

// ==================== 配置 ====================

const CONFIG = {
  /** 方向判定阈值 (模板模式建议 -5, 补偿因子偏弱) */
  directionThreshold: -5,
  /** 模拟轮数 (1轮 = 静态快照, 无迭代噪声) */
  rounds: 1,
  /** 关闭 Neutral 检测以获得强制 UP/DOWN */
  disableNeutral: true,
} as const;

// ==================== 数据结构 ====================

interface EventResult {
  event: UnifiedEvent;
  index: number;
  direction: "UP" | "DOWN" | "NEUTRAL";
  consensus: number;
  beliefStd: number;
  kuramotoR: number;
  confidence: number;
  /** 模型预测是否正确 */
  correct: boolean;
  /** 是否为反转: model=DOWN 且 actual=UP */
  isReversal: boolean;
  /** 是否为确认: model=DOWN 且 actual=DOWN */
  isConfirmedDown: boolean;
}

// ==================== 主流程 ====================

async function main() {
  console.log("=".repeat(72));
  console.log("🧬 分歧→反转假说 — 实证验证");
  console.log("=".repeat(72));
  console.log(`事件总数: ${EVENTS.length}`);
  console.log(`阈值: directionThreshold=${CONFIG.directionThreshold}, rounds=${CONFIG.rounds}`);
  console.log(`Neutral: ${CONFIG.disableNeutral ? "OFF (强制 UP/DOWN)" : "ON"}`);
  console.log("");

  const results: EventResult[] = [];
  const start = Date.now();

  // ── 1. 全量回测 ──
  for (let i = 0; i < EVENTS.length; i++) {
    const ev = EVENTS[i];
    const result: V9SwarmResult = await runSwarmV9(
      {
        news: ev.news,
        marketData: {
          vix: ev.vix,
          rsi: ev.rsi,
          dropMagnitude: ev.drop,
          hasPolicyResponse: ev.hasPolicy,
          hasLeverageDamage: ev.hasLeverage,
          hasSolvencyDamage: ev.hasSolvency,
        },
        rounds: CONFIG.rounds,
        directionThreshold: CONFIG.directionThreshold,
        ablation: CONFIG.disableNeutral
          ? {
              disableNeutralRule1: true,
              disableNeutralRule2_3: true,
              disableNeutralRule4: true,
            }
          : undefined,
      },
      false // template mode
    );

    const d = result.finalDecision;
    const dir = d.direction;
    const actual = ev.actual;
    const ok =
      (dir === "UP" && actual === "up") ||
      (dir === "DOWN" && actual === "down") ||
      (dir === "NEUTRAL" && actual === "neutral");

    results.push({
      event: ev,
      index: i,
      direction: dir,
      consensus: d.consensus,
      beliefStd: d.beliefStd,
      kuramotoR: d.neutralTrace
        ? parseFloat(
            d.neutralTrace.gatingReason.match(/r=([\d.]+)/)?.[1] ?? "0"
          )
        : 0,
      confidence: d.confidence,
      correct: ok,
      isReversal: dir === "DOWN" && actual === "up",
      isConfirmedDown: dir === "DOWN" && actual === "down",
    });

    // 进度条
    const pct = ((i + 1) / EVENTS.length) * 100;
    const bar =
      "█".repeat(Math.round(pct / 2)) +
      "░".repeat(50 - Math.round(pct / 2));
    process.stdout.write(
      `\r[${bar}] ${(i + 1).toString().padStart(3)}/${EVENTS.length} (${pct.toFixed(0)}%) | ${ok ? "✅" : "❌"} ${ev.name.slice(0, 25)}`
    );
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\n⏱ 耗时: ${elapsed}s\n`);

  // ── 2. 按 belief_std 四分位分组 ──
  const sorted = [...results].sort((a, b) => a.beliefStd - b.beliefStd);
  const n = sorted.length;
  const qSize = Math.floor(n / 4);

  const quartiles = [
    { label: "Q1 低分歧", items: sorted.slice(0, qSize) },
    { label: "Q2 中低分歧", items: sorted.slice(qSize, qSize * 2) },
    { label: "Q3 中高分歧", items: sorted.slice(qSize * 2, qSize * 3) },
    { label: "Q4 极端分歧", items: sorted.slice(qSize * 3) },
  ];

  console.log("=".repeat(72));
  console.log("📊 核心结果: 按 belief_std 四分位分组");
  console.log("=".repeat(72));

  // 表头
  console.log(
    [
      "分组".padEnd(14),
      "N".padStart(4),
      "Std范围".padStart(18),
      "准确率".padStart(8),
      "共识均值".padStart(9),
      "反转率".padStart(8),
      "DOWN确认率".padStart(11),
      "★发现".padStart(20),
    ].join(" | ")
  );
  console.log("-".repeat(110));

  for (const q of quartiles) {
    const items = q.items;
    const correct = items.filter((r) => r.correct).length;
    const accuracy = (correct / items.length) * 100;
    const avgConsensus =
      items.reduce((s, r) => s + r.consensus, 0) / items.length;
    const minStd = Math.min(...items.map((r) => r.beliefStd));
    const maxStd = Math.max(...items.map((r) => r.beliefStd));

    // 反转率: model=DOWN 但 actual=UP 的比例 (在 model=DOWN 的样本中)
    const downPredictions = items.filter((r) => r.direction === "DOWN");
    const reversalCount = downPredictions.filter((r) => r.isReversal).length;
    const reversalRate =
      downPredictions.length > 0
        ? (reversalCount / downPredictions.length) * 100
        : 0;

    // DOWN 确认率: model=DOWN 且 actual=DOWN 的比例
    const downConfirmed = downPredictions.filter(
      (r) => r.isConfirmedDown
    ).length;
    const downConfirmRate =
      downPredictions.length > 0
        ? (downConfirmed / downPredictions.length) * 100
        : 0;

    // 发现标记
    const star =
      reversalRate > 60
        ? "🔴 强反转信号!"
        : reversalRate > 45
          ? "🟡 弱反转信号"
          : "—";

    console.log(
      [
        q.label.padEnd(14),
        String(items.length).padStart(4),
        `${minStd.toFixed(0)}-${maxStd.toFixed(0)}`.padStart(18),
        `${accuracy.toFixed(1)}%`.padStart(8),
        avgConsensus.toFixed(1).padStart(9),
        `${reversalRate.toFixed(1)}%`.padStart(8),
        `${downConfirmRate.toFixed(1)}%`.padStart(11),
        star.padStart(20),
      ].join(" | ")
    );
  }

  // ── 3. 极端分歧子集深度分析 ──
  console.log("\n" + "=".repeat(72));
  console.log("🔬 极端分歧 (Q4) 子集深度分析");
  console.log("=".repeat(72));

  const q4 = quartiles[3].items;
  const q4Reversals = q4.filter((r) => r.isReversal);
  const q4Confirmed = q4.filter((r) => r.isConfirmedDown);

  console.log(`\nQ4 样本数: ${q4.length}`);
  console.log(`  反转事件 (model=DOWN, actual=UP): ${q4Reversals.length}`);
  console.log(`  确认事件 (model=DOWN, actual=DOWN): ${q4Confirmed.length}`);

  if (q4Reversals.length > 0) {
    console.log(`\n📈 Q4 反转事件列表 (model=DOWN → 实际涨):`);
    console.log("-".repeat(60));
    for (const r of q4Reversals.slice(0, 10)) {
      console.log(
        `  ${r.event.date} ${r.event.name.slice(0, 35).padEnd(37)} std=${r.beliefStd.toFixed(0)} cons=${r.consensus.toFixed(1)} actual=${r.event.actual}`
      );
    }
  }

  if (q4Confirmed.length > 0) {
    console.log(`\n📉 Q4 确认事件列表 (model=DOWN → 实际跌):`);
    console.log("-".repeat(60));
    for (const r of q4Confirmed.slice(0, 10)) {
      console.log(
        `  ${r.event.date} ${r.event.name.slice(0, 35).padEnd(37)} std=${r.beliefStd.toFixed(0)} cons=${r.consensus.toFixed(1)} actual=${r.event.actual}`
      );
    }
  }

  // ── 4. 全量统计 ──
  console.log("\n" + "=".repeat(72));
  console.log("📈 全量统计与基线对比");
  console.log("=".repeat(72));

  const totalCorrect = results.filter((r) => r.correct).length;
  const totalAccuracy = (totalCorrect / results.length) * 100;
  const alwaysUpBaseline =
    (results.filter((r) => r.event.actual === "up").length / results.length) *
    100;

  console.log(`  全量准确率: ${totalAccuracy.toFixed(1)}% (${totalCorrect}/${results.length})`);
  console.log(`  永远猜涨基线: ${alwaysUpBaseline.toFixed(1)}%`);
  console.log(`  vs 基线提升: ${(totalAccuracy - alwaysUpBaseline).toFixed(1)} pp`);

  // UP / DOWN / NEUTRAL 分类准确率
  const upEvents = results.filter((r) => r.event.actual === "up");
  const downEvents = results.filter((r) => r.event.actual === "down");
  const neutralEvents = results.filter((r) => r.event.actual === "neutral");

  const upAcc =
    upEvents.filter((r) => r.direction === "UP").length / upEvents.length;
  const downAcc =
    downEvents.filter((r) => r.direction === "DOWN").length /
    downEvents.length;
  const neutralAcc =
    neutralEvents.length > 0
      ? neutralEvents.filter((r) => r.direction === "NEUTRAL").length /
        neutralEvents.length
      : 0;

  console.log(`\n  分类准确率:`);
  console.log(`    UP:      ${(upAcc * 100).toFixed(1)}% (${upEvents.filter((r) => r.direction === "UP").length}/${upEvents.length})`);
  console.log(`    DOWN:    ${(downAcc * 100).toFixed(1)}% (${downEvents.filter((r) => r.direction === "DOWN").length}/${downEvents.length})`);
  console.log(
    `    NEUTRAL: ${(neutralAcc * 100).toFixed(1)}% (${neutralEvents.filter((r) => r.direction === "NEUTRAL").length}/${neutralEvents.length})`
  );

  // ── 5. 统计显著性 (卡方检验近似) ──
  console.log("\n" + "=".repeat(72));
  console.log("📐 统计显著性: 反转率 Q1 vs Q4");
  console.log("=".repeat(72));

  const q1 = quartiles[0].items;
  const q1DownPreds = q1.filter((r) => r.direction === "DOWN");
  const q1Reversals = q1DownPreds.filter((r) => r.isReversal).length;
  const q1NonReversals = q1DownPreds.length - q1Reversals;
  const q4DownPreds = q4.filter((r) => r.direction === "DOWN");
  const q4ReversalsCount = q4DownPreds.filter((r) => r.isReversal).length;
  const q4NonReversals = q4DownPreds.length - q4ReversalsCount;

  if (q1DownPreds.length > 0 && q4DownPreds.length > 0) {
    const q1Rate = (q1Reversals / q1DownPreds.length) * 100;
    const q4Rate = (q4ReversalsCount / q4DownPreds.length) * 100;
    const diff = q4Rate - q1Rate;

    console.log(`  Q1 (低分歧) 反转率: ${q1Rate.toFixed(1)}% (${q1Reversals}/${q1DownPreds.length})`);
    console.log(`  Q4 (极端分歧) 反转率: ${q4Rate.toFixed(1)}% (${q4ReversalsCount}/${q4DownPreds.length})`);
    console.log(`  差异: ${diff >= 0 ? "+" : ""}${diff.toFixed(1)} pp`);

    // 简易 Fisher's exact 模拟 (用卡方近似提示)
    const total = q1DownPreds.length + q4DownPreds.length;
    const totalReversals = q1Reversals + q4ReversalsCount;
    const expectedQ1Rate =
      (totalReversals / total) * q1DownPreds.length;
    const expectedQ4Rate =
      (totalReversals / total) * q4DownPreds.length;

    console.log(
      `  期望 Q1 反转数: ${expectedQ1Rate.toFixed(1)}, 实际: ${q1Reversals}`
    );
    console.log(
      `  期望 Q4 反转数: ${expectedQ4Rate.toFixed(1)}, 实际: ${q4ReversalsCount}`
    );

    if (diff > 15) {
      console.log(`\n  🟢 差异 > 15pp — 值得进一步验证 (可能显著)`);
    } else if (diff > 5) {
      console.log(`\n  🟡 差异 5-15pp — 方向正确但幅度不够, 需更大样本`);
    } else {
      console.log(`\n  🔴 差异 < 5pp — 不支持反转假说`);
    }
  }

  // ── 6. 信念标准差 vs 准确率 非线性扫描 ──
  console.log("\n" + "=".repeat(72));
  console.log("📉 非线性扫描: belief_std decile → 准确率曲线");
  console.log("=".repeat(72));

  const deciles: { label: string; items: EventResult[] }[] = [];
  const decileSize = Math.floor(n / 10);
  for (let d = 0; d < 10; d++) {
    const start = d * decileSize;
    const end = d === 9 ? n : start + decileSize;
    const items = sorted.slice(start, end);
    const midStd =
      items.reduce((s, r) => s + r.beliefStd, 0) / items.length;
    deciles.push({
      label: `D${d + 1} (std≈${midStd.toFixed(0)})`,
      items,
    });
  }

  console.log(
    " Decile       N   AvgStd   准确率  反转率  "
  );
  console.log("-".repeat(50));
  for (const dec of deciles) {
    const correct = dec.items.filter((r) => r.correct).length;
    const acc = (correct / dec.items.length) * 100;
    const avgStd =
      dec.items.reduce((s, r) => s + r.beliefStd, 0) / dec.items.length;
    const downPreds = dec.items.filter((r) => r.direction === "DOWN");
    const revRate =
      downPreds.length > 0
        ? (downPreds.filter((r) => r.isReversal).length /
            downPreds.length) *
          100
        : 0;
    const bar =
      "█".repeat(Math.round(acc / 2)) + "░".repeat(50 - Math.round(acc / 2));

    console.log(
      ` ${dec.label.padEnd(16)} ${String(dec.items.length).padStart(3)}  ${avgStd.toFixed(0).padStart(5)}  ${acc.toFixed(0).padStart(5)}%  ${revRate.toFixed(0).padStart(5)}%  ${bar.slice(0, 30)}`
    );
  }

  // ── 7. 结论 ──
  console.log("\n" + "=".repeat(72));
  console.log("🧾 结论");
  console.log("=".repeat(72));

  // 检查 Q4 vs Q1 的反转率差异
  const q4ReversalRate =
    q4DownPreds.length > 0
      ? (q4ReversalsCount / q4DownPreds.length) * 100
      : 0;
  const q1ReversalRate =
    q1DownPreds.length > 0
      ? (q1Reversals / q1DownPreds.length) * 100
      : 0;

  const reversalDiff = q4ReversalRate - q1ReversalRate;

  if (reversalDiff > 20) {
    console.log(`
  🟢 **强支持: 分歧→反转假说成立**

  极端分歧 (Q4) 的反转率 (${q4ReversalRate.toFixed(0)}%) 远超低分歧 (Q1) 的 ${q1ReversalRate.toFixed(0)}%。
  差异 ${reversalDiff.toFixed(0)}pp 在经济上是显著的。

  核心发现:
    - 当 Agent 群体暴力分歧 (belief_std > ${q4[0]?.beliefStd.toFixed(0) ?? "?"}),
      模型预测 DOWN 但实际往往为 UP。
    - 行为解释: 市场底部的特征就是多空极端对抗。
    - 应用: belief_std 可以作为"过度恐慌"的量化指标，用于识别底部。
  `);
  } else if (reversalDiff > 10) {
    console.log(`
  🟡 **中等支持: 方向正确但需更大样本**

  极端分歧的反转率 (${q4ReversalRate.toFixed(0)}%) 高于低分歧 (${q1ReversalRate.toFixed(0)}%)，
  差异 ${reversalDiff.toFixed(0)}pp 在方向上正确。

  建议:
    - 扩展到更大事件库 (500+) 以验证统计显著性
    - 或者只用 belief_std 做二级过滤 (在 LLM 模式中)
  `);
  } else {
    console.log(`
  🔴 **不支持: 分歧→反转假说未通过验证**

  极端分歧 (Q4) 的反转率 (${q4ReversalRate.toFixed(0)}%)
  与低分歧 (Q1) 的 ${q1ReversalRate.toFixed(0)}% 差异不大。

  可能原因:
    - 模板模式的因子提取偏弱, belief_std 噪声占比高
    - 需要 LLM 模式才能捕捉真正的 agent 异质性
    - 反转信号可能藏在其他指标中 (如 kuramoto_r, coalition tension)
  `);
  }

  console.log(`\n💡 下一步:`);
  console.log(`  1. 用 LLM 模式重跑关键事件 (Q4 反转候选) 验证一致性`);
  console.log(`  2. 交叉分析 belief_std × kuramoto_r (分歧+失同步 → 复合反转信号)`);
  console.log(`  3. 在 LLM 模式中检查 Policy/Contrarian Agent 的单独 belief`);
  console.log(`  4. 将 belief_std 接入 hybridPredictor 作为校准权重因子`);
}

main().catch((e) => {
  console.error("验证脚本失败:", e);
  process.exit(1);
});
