/**
 * 方向阈值消融 — 共识 >= threshold → UP, else → DOWN
 * 78事件, 模板模式, 门控开启, Neutral=OFF
 */
import { EVENTS } from "./events";
import { runSwarmV9 } from "../src/lib/agents/v9";

async function test(threshold: number) {
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
        disableNeutralRule1: true,
        disableNeutralRule2_3: true,
        disableNeutralRule4: true,
      },
    }, false);

    const cons = result.finalDecision.consensus;
    // 用自定义阈值覆盖方向判定
    const dir = cons >= threshold ? "UP" : "DOWN";
    const ok =
      (dir === "UP" && ev.actual === "up") ||
      (dir === "DOWN" && ev.actual === "down") ||
      (dir === "NEUTRAL" && ev.actual === "neutral");
    if (ok) correct++;
    if (ev.actual === "up") { upTotal++; if (dir === "UP") upCorrect++; }
    if (ev.actual === "down") { downTotal++; if (dir === "DOWN") downCorrect++; }
  }

  const total = EVENTS.length;
  console.log(
    `阈值>= ${String(threshold).padStart(3)}  |  ` +
    `Total: ${correct}/${total}=${(correct / total * 100).toFixed(1)}%  |  ` +
    `Up: ${upCorrect}/${upTotal}=${(upCorrect / upTotal * 100).toFixed(0)}%  |  ` +
    `Down: ${downCorrect}/${downTotal}=${(downCorrect / downTotal * 100).toFixed(0)}%`
  );
}

async function main() {
  console.log("");
  console.log("=== 方向阈值消融 (78事件, 模板, 门控开启, Neutral=OFF) ===");
  console.log("");
  console.log("阈值              总准确率          Up准确率         Down准确率");
  console.log("──────            ────────          ────────         ──────────");

  for (const t of [15, 10, 5, 0, -5, -10]) {
    await test(t);
  }

  const baselineUp = EVENTS.filter(e => e.actual === "up").length;
  console.log("");
  console.log(`永远猜涨基线: ${baselineUp}/${EVENTS.length} = ${(baselineUp / EVENTS.length * 100).toFixed(1)}%`);
  console.log("");
}

main();
