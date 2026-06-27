/**
 * 终极对照实验: 纯市场数据 → 方向判断
 *
 * 问题: 不用 LLM, 不用 Agent, 不用因子提取——只用 VIX/RSI/dropMagnitude 三个数字,
 *       能不能准确判断方向?
 *
 * 如果这都不行 → 方向预测这个目标本身就有问题
 * 如果行      → Agent 系统在帮倒忙, 问题出在上层
 */

import { EVENTS } from "./events";

interface Rule {
  name: string;
  predict: (vix: number, rsi: number, drop: number) => "UP" | "DOWN" | "NEUTRAL";
}

const RULES: Rule[] = [
  // === 单一指标简单规则 ===
  {
    name: "永远猜涨 (baseline)",
    predict: () => "UP",
  },
  {
    name: "永远猜跌",
    predict: () => "DOWN",
  },
  {
    name: "RSI<30 → 超卖反弹",
    predict: (_, rsi) => rsi < 30 ? "UP" : "NEUTRAL",
  },
  {
    name: "RSI<30 → 趋势延续 (跌)",
    predict: (_, rsi) => rsi < 30 ? "DOWN" : "NEUTRAL",
  },
  {
    name: "VIX>40 → 恐慌底部",
    predict: (vix) => vix > 40 ? "UP" : "NEUTRAL",
  },
  {
    name: "VIX>40 → 恐慌加剧 (跌)",
    predict: (vix) => vix > 40 ? "DOWN" : "NEUTRAL",
  },
  {
    name: "drop>10% → V型反弹",
    predict: (_, __, drop) => drop > 10 ? "UP" : "NEUTRAL",
  },
  {
    name: "drop>10% → 继续跌",
    predict: (_, __, drop) => drop > 10 ? "DOWN" : "NEUTRAL",
  },

  // === 双指标组合规则 ===
  {
    name: "RSI<30 AND VIX>35 → 极端恐慌=底",
    predict: (vix, rsi) => (rsi < 30 && vix > 35) ? "UP" : "NEUTRAL",
  },
  {
    name: "RSI<30 AND drop>10 → 超卖+暴跌=反弹",
    predict: (_, rsi, drop) => (rsi < 30 && drop > 10) ? "UP" : "NEUTRAL",
  },
  {
    name: "RSI<30 AND VIX>40 AND drop>10 → 三重确认底部",
    predict: (vix, rsi, drop) => (rsi < 30 && vix > 40 && drop > 10) ? "UP" : "NEUTRAL",
  },
  {
    name: "RSI>70 AND VIX<15 → 过度乐观=顶",
    predict: (vix, rsi) => (rsi > 70 && vix < 15) ? "DOWN" : "NEUTRAL",
  },

  // === 方向性规则 (给每个事件一个方向, 不止特殊事件) ===
  {
    name: "RSI<35→UP, RSI>65→DOWN, else NEUTRAL",
    predict: (_, rsi) => rsi < 35 ? "UP" : rsi > 65 ? "DOWN" : "NEUTRAL",
  },
  {
    name: "RSI<40→UP, RSI>60→DOWN (更激进)",
    predict: (_, rsi) => rsi < 40 ? "UP" : rsi > 60 ? "DOWN" : "NEUTRAL",
  },
  {
    name: "RSI<50→DOWN, RSI>50→UP (趋势跟随)",
    predict: (_, rsi) => rsi < 50 ? "DOWN" : "UP",
  },
  {
    name: "RSI<50→UP, RSI>50→DOWN (均值回归)",
    predict: (_, rsi) => rsi < 50 ? "UP" : "DOWN",
  },
  {
    name: "VIX<20→UP, VIX>35→DOWN, else NEUTRAL",
    predict: (vix) => vix < 20 ? "UP" : vix > 35 ? "DOWN" : "NEUTRAL",
  },
  {
    name: "VIX<20→DOWN, VIX>35→UP (恐慌=买点)",
    predict: (vix) => vix < 20 ? "DOWN" : vix > 35 ? "UP" : "NEUTRAL",
  },

  // === 复杂综合规则 ===
  {
    name: "综合: RSI<30→UP, RSI>70→DOWN, VIX>40→UP, drop>15→UP",
    predict: (vix, rsi, drop) => {
      if (drop > 15 || (rsi < 30 && vix > 35)) return "UP";
      if (rsi > 70 && vix < 18) return "DOWN";
      return "NEUTRAL";
    },
  },
  {
    name: "纯contrarian: 越恐慌越买",
    predict: (vix, rsi, drop) => {
      const fear = (rsi < 40 ? 1 : 0) + (vix > 30 ? 1 : 0) + (drop > 8 ? 1 : 0);
      if (fear >= 2) return "UP";    // 多重恐慌 → 买入
      if (rsi > 65 && vix < 18) return "DOWN"; // 过度乐观 → 卖出
      return "NEUTRAL";
    },
  },
];

function main() {
  console.log("=".repeat(68));
  console.log("🔬 纯市场数据 → 方向判断 (203 事件)");
  console.log("=".repeat(68));
  console.log(`只用 VIX + RSI + dropMagnitude，不经过任何 AI 处理\n`);

  type RuleResult = {
    name: string;
    total: number;
    called: number;
    correct: number;
    accuracy: number;
    upOk: number; upTotal: number;
    downOk: number; downTotal: number;
    avgVIX: number;
    avgRSI: number;
    avgDrop: number;
  };

  const results: RuleResult[] = [];

  for (const rule of RULES) {
    let correct = 0, called = 0;
    let upOk = 0, upTotal = 0, downOk = 0, downTotal = 0;
    let sumVIX = 0, sumRSI = 0, sumDrop = 0;

    for (const ev of EVENTS) {
      const dir = rule.predict(ev.vix, ev.rsi, ev.drop);
      if (dir === "NEUTRAL") continue;

      called++;
      sumVIX += ev.vix;
      sumRSI += ev.rsi;
      sumDrop += ev.drop;

      if ((dir === "UP" && ev.actual === "up") || (dir === "DOWN" && ev.actual === "down")) {
        correct++;
      }
      if (ev.actual === "up") { upTotal++; if (dir === "UP") upOk++; }
      if (ev.actual === "down") { downTotal++; if (dir === "DOWN") downOk++; }
    }

    results.push({
      name: rule.name,
      total: EVENTS.length,
      called,
      correct,
      accuracy: called > 0 ? (correct / called) * 100 : 0,
      upOk, upTotal,
      downOk, downTotal,
      avgVIX: called > 0 ? sumVIX / called : 0,
      avgRSI: called > 0 ? sumRSI / called : 0,
      avgDrop: called > 0 ? sumDrop / called : 0,
    });
  }

  // 排序: 准确率从高到低
  results.sort((a, b) => b.accuracy - a.accuracy);

  const alwaysUp = EVENTS.filter(e => e.actual === "up").length;
  const baseline = (alwaysUp / EVENTS.length * 100);

  console.log(`永远猜涨 baseline: ${baseline.toFixed(1)}% (${alwaysUp}/${EVENTS.length})\n`);
  console.log(
    "规则".padEnd(46) +
    "调用".padStart(5) +
    "准确率".padStart(8) +
    "vs基线".padStart(7) +
    "UP召".padStart(6) +
    "DOWN召".padStart(7)
  );
  console.log("─".repeat(85));

  for (const r of results) {
    const upRec = r.upTotal > 0 ? (r.upOk / EVENTS.filter(e=>e.actual==='up').length * 100).toFixed(0) : "—";
    const downRec = r.downTotal > 0 ? (r.downOk / EVENTS.filter(e=>e.actual==='down').length * 100).toFixed(0) : "—";
    const vsBaseline = r.accuracy - baseline;
    const marker = r.accuracy > baseline + 3 ? "🟢" : r.accuracy < baseline - 3 ? "🔴" : "  ";

    console.log(
      ` ${marker} ${r.name.slice(0,44).padEnd(44)} ` +
      `${String(r.called).padStart(4)} ` +
      `${r.accuracy.toFixed(1).padStart(6)}%` +
      `${(vsBaseline>=0?'+':'') + vsBaseline.toFixed(1).padStart(6)}pp` +
      `${String(upRec).padStart(5)}%` +
      `${String(downRec).padStart(6)}%`
    );
  }

  // 找到最佳规则
  const best = results[0];

  console.log("\n" + "=".repeat(68));
  console.log("🧾 结论");
  console.log("=".repeat(68));

  if (best.accuracy > baseline + 3) {
    console.log(`\n🟢 最佳规则 "${best.name}" 准确率 ${best.accuracy.toFixed(1)}%`);
    console.log(`   超越永远猜涨 ${(best.accuracy - baseline).toFixed(1)}pp`);
    console.log(`   说明: 市场数据中确实包含方向信号 — 问题出在 Agent 系统。`);
    console.log(`   因子提取 → Agent 解释 → 共识投票 这条链路在损耗信号。`);
    console.log(`\n   优化方向: 把原始市场数据直接注入决策层, 不经过因子提取。`);
  } else if (best.accuracy > baseline) {
    console.log(`\n🟡 最佳规则勉强超过 baseline (${best.accuracy.toFixed(1)}% vs ${baseline.toFixed(1)}%)`);
    console.log(`   信号存在但很弱 — 短期方向预测本身极其困难。`);
  } else {
    console.log(`\n🔴 没有任何纯市场数据规则能超越"永远猜涨" (${baseline.toFixed(1)}%)`);
    console.log(`   这意味着 VIX/RSI/dropMagnitude 对短期方向预测没有可用的信号。`);
    console.log(`   不是模型的问题 — 是"预测方向"这个目标本身的问题。`);
    console.log(`\n   应该考虑换个目标:`);
    console.log(`     - 波动率预测 (这个有信号)`);
    console.log(`     - 危机类型分类 (流动性 vs 偿付 vs 外部冲击)`);
    console.log(`     - 底部/顶部概率估计 (不是方向, 是 regime)`);
    console.log(`     - 极端事件预警 (VIX>40 → 高波动, 不管方向)`);
  }

  // 额外分析: 按 decade 分组看准确率
  console.log("\n\n" + "─".repeat(68));
  console.log("📅 按年代分组 (使用最佳规则: " + best.name + ")");
  console.log("─".repeat(68));

  const decades: Record<string, { total: number; correct: number }> = {};
  for (const ev of EVENTS) {
    const decade = ev.date.slice(0, 3) + "0s";
    if (!decades[decade]) decades[decade] = { total: 0, correct: 0 };
    decades[decade].total++;
    const dir = best.predict(ev.vix, ev.rsi, ev.drop);
    if ((dir === "UP" && ev.actual === "up") || (dir === "DOWN" && ev.actual === "down")) {
      decades[decade].correct++;
    }
  }

  for (const [decade, stats] of Object.entries(decades).sort()) {
    const acc = stats.total > 0 ? (stats.correct / stats.total * 100) : 0;
    const bar = "█".repeat(Math.round(acc / 2));
    console.log(`  ${decade}: ${acc.toFixed(0)}% ${bar} (${stats.correct}/${stats.total})`);
  }
}

main();
