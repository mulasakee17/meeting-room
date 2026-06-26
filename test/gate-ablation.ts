/**
 * 非对称门控消融实验 — 门控开启 vs 关闭 (纯线性共识)
 * 78事件, 模板模式, 1轮, Neutral=OFF
 */
import { EVENTS } from "./events";
import { runSwarmV9 } from "../src/lib/agents/v9";

async function test(disableClustering: boolean, label: string) {
  let correct = 0, upCorrect = 0, upTotal = 0, downCorrect = 0, downTotal = 0;

  for (const ev of EVENTS) {
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
        disableClustering,
        disableNeutralRule1: true,
        disableNeutralRule2_3: true,
        disableNeutralRule4: true,
      },
    }, false);

    const dir = result.finalDecision.direction;
    const ok =
      (dir === "UP" && ev.actual === "up") ||
      (dir === "DOWN" && ev.actual === "down") ||
      (dir === "NEUTRAL" && ev.actual === "neutral");
    if (ok) correct++;
    if (ev.actual === "up") { upTotal++; if (dir === "UP") upCorrect++; }
    if (ev.actual === "down") { downTotal++; if (dir === "DOWN") downCorrect++; }
  }

  console.log(
    label.padEnd(32) +
    `Total: ${String(correct)}/${EVENTS.length} = ${(correct / EVENTS.length * 100).toFixed(1)}%  |  ` +
    `Up: ${upCorrect}/${upTotal}=${(upCorrect / upTotal * 100).toFixed(0)}%  |  ` +
    `Down: ${downCorrect}/${downTotal}=${(downCorrect / downTotal * 100).toFixed(0)}%`
  );
}

async function main() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║    非对称门控消融实验 (78事件, 模板模式, 1轮, Neutral=OFF)   ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");

  await test(true, "❌ 门控关闭 (纯线性共识)");
  await test(false, "✅ 门控开启 (KMeans<-15→聚类)");

  const baselineUp = EVENTS.filter(e => e.actual === "up").length;
  console.log("");
  console.log(`永远猜涨基线: Up=${baselineUp}/${EVENTS.length} = ${(baselineUp / EVENTS.length * 100).toFixed(1)}%`);
  console.log("");
}

main();
