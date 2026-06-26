/**
 * V-Rebound Routing Arbiter 效果验证
 * LLM 模式, 78 事件, threshold=+5, Neutral=OFF
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { EVENTS } from "./events";
import { runSwarmV9 } from "../src/lib/agents/v9";
import { classifyEvent, ClassifierInput } from "../src/lib/calibration/eventClassifierV2";

async function main() {
  let baselineCorrect = 0, routedCorrect = 0;
  let upOkB = 0, upTotal = 0, downOkB = 0, downTotal = 0;
  let upOkR = 0, downOkR = 0;
  let routeCount = 0;
  const start = Date.now();

  for (let i = 0; i < EVENTS.length; i++) {
    const ev = EVENTS[i];
    const result = await runSwarmV9({
      news: ev.news,
      marketData: { vix: ev.vix, rsi: ev.rsi, dropMagnitude: ev.drop, hasPolicyResponse: ev.hasPolicy, hasLeverageDamage: ev.hasLeverage, hasSolvencyDamage: ev.hasSolvency },
      rounds: 1,
      directionThreshold: 5,
      ablation: { disableNeutralRule1: true, disableNeutralRule2_3: true, disableNeutralRule4: true },
    } as any, true);

    const consDir = result.finalDecision.direction;
    const consOk = (consDir === "UP" && ev.actual === "up") || (consDir === "DOWN" && ev.actual === "down");
    if (consOk) baselineCorrect++;

    // Routing arbiter
    const ci: ClassifierInput = {
      vix: ev.vix, rsi: ev.rsi, dropMagnitude: ev.drop,
      volatility: ev.recentVolatility ?? 0.02,
      volumeSpike: ev.volumeSpike ?? 1.0,
      hasPolicyResponse: ev.hasPolicy,
      hasCentralBankAction: ev.hasPolicy,
      hasLeverageDamage: ev.hasLeverage,
      hasSolvencyDamage: ev.hasSolvency,
    };
    const cr = classifyEvent(ci);
    let routedDir = consDir;
    if (cr.pattern === "V_REBOUND" && cr.vScore > cr.lScore * 3) {
      routedDir = "UP";
      routeCount++;
    }
    const routedOk = (routedDir === "UP" && ev.actual === "up") || (routedDir === "DOWN" && ev.actual === "down");
    if (routedOk) routedCorrect++;

    if (ev.actual === "up") { upTotal++; if (consDir === "UP") upOkB++; if (routedDir === "UP") upOkR++; }
    if (ev.actual === "down") { downTotal++; if (consDir === "DOWN") downOkB++; if (routedDir === "DOWN") downOkR++; }

    const pct = ((i + 1) / EVENTS.length * 100).toFixed(0);
    const marker = routedDir !== consDir ? " ⚡" : "";
    console.log(`[${String(i+1).padStart(2)}/78 ${pct}%] ${ev.name.slice(0,26).padEnd(28)} ${ev.actual.padEnd(7)} LLM=${consDir.padEnd(5)}→ROUTE=${routedDir.padEnd(5)} ${consOk?"✅":"❌"}→${routedOk?"✅":"❌"}${marker}`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`\n${"=".repeat(70)}`);
  console.log(`V-Rebound Routing Arbiter 效果验证 (78事件, LLM, threshold=+5, Neutral=OFF)`);
  console.log(`${"=".repeat(70)}`);
  console.log(`LLM 基线:    ${baselineCorrect}/${EVENTS.length} = ${(baselineCorrect/EVENTS.length*100).toFixed(1)}%  |  Up=${upOkB}/${upTotal}=${(upOkB/upTotal*100).toFixed(0)}%  |  Down=${downOkB}/${downTotal}=${(downOkB/downTotal*100).toFixed(0)}%`);
  console.log(`路由仲裁:    ${routedCorrect}/${EVENTS.length} = ${(routedCorrect/EVENTS.length*100).toFixed(1)}%  |  Up=${upOkR}/${upTotal}=${(upOkR/upTotal*100).toFixed(0)}%  |  Down=${downOkR}/${downTotal}=${(downOkR/downTotal*100).toFixed(0)}%`);
  console.log(`路由触发:    ${routeCount}/${EVENTS.length} 次`);
  console.log(`永远猜涨:    56.4%`);
  console.log(`耗时: ${elapsed}s`);
}
main();
