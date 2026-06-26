/**
 * LLM 模式方向阈值扫描
 * 20 代表性事件 × 5 阈值 = ~100 LLM 调用 (DeepSeek ≈ ¥0.50)
 */
import { EVENTS } from "./events";
import { runSwarmV9 } from "../src/lib/agents/v9";

// 选 20 个代表性事件: 10 up + 7 down + 3 neutral, 覆盖各类别
const SUBSET = EVENTS.filter(e =>
  ["1987 黑色星期一", "1997 亚洲金融危机", "2001 911袭击", "2003 伊拉克战争",
   "2008 TARP救市", "2010 闪电崩盘", "2013 Taper恐慌", "2016 英国脱欧公投",
   "2020 COVID崩盘底", "2024 日元套利崩盘",
   "2000 互联网泡沫破灭 (4月)", "2007 次贷预警 (BNP)", "2008 雷曼破产",
   "2011 美债降级", "2015 中国A股股灾", "2020 COVID大流行声明",
   "2022 俄乌战争",
   "2015 瑞士央行黑天鹅", "2025 DeepSeek冲击", "2016 美国总统大选"]
  .includes(e.name)
);

async function scan() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   LLM 模式方向阈值扫描 (20事件, DeepSeek, 门控开启, Neutral=OFF) ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");

  const thresholds = [15, 10, 5, 0, -5];
  for (const t of thresholds) {
    let correct = 0, upCorrect = 0, upTotal = 0, downCorrect = 0, downTotal = 0;

    for (const ev of SUBSET) {
      try {
        const result = await runSwarmV9({
          news: ev.news,
          marketData: {
            vix: ev.vix, rsi: ev.rsi, dropMagnitude: ev.drop,
            hasPolicyResponse: ev.hasPolicy,
            hasLeverageDamage: ev.hasLeverage,
            hasSolvencyDamage: ev.hasSolvency,
          },
          rounds: 1,
          ablation: {
            disableNeutralRule1: true,
            disableNeutralRule2_3: true,
            disableNeutralRule4: true,
          },
          directionThreshold: t,
        } as any, true);

        const dir = result.finalDecision.direction;
        const ok =
          (dir === "UP" && ev.actual === "up") ||
          (dir === "DOWN" && ev.actual === "down") ||
          (dir === "NEUTRAL" && ev.actual === "neutral");
        if (ok) correct++;
        if (ev.actual === "up") { upTotal++; if (dir === "UP") upCorrect++; }
        if (ev.actual === "down") { downTotal++; if (dir === "DOWN") downCorrect++; }
      } catch (err) {
        console.error(`  LLM 调用失败: ${ev.name} — ${(err as Error).message}`);
      }
    }

    console.log(
      `阈值>= ${String(t).padStart(3)}  |  ` +
      `Total: ${correct}/${SUBSET.length}=${(correct / SUBSET.length * 100).toFixed(0)}%  |  ` +
      `Up: ${upCorrect}/${upTotal}=${(upCorrect / upTotal * 100).toFixed(0)}%  |  ` +
      `Down: ${downCorrect}/${downTotal}=${(downCorrect / downTotal * 100).toFixed(0)}%`
    );
  }

  console.log("");
}

scan();
