/**
 * v9.6 均值回归感知消融实验
 * 78事件, LLM模式, threshold=+5, Neutral=OFF
 * 对比: 均值回归 OFF vs ON
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { EVENTS } from "./events";
import { runSwarmV9 } from "../src/lib/agents/v9";

async function test(disableMR: boolean, label: string) {
  let correct = 0, upOk = 0, upTotal = 0, downOk = 0, downTotal = 0;
  let neutralOk = 0, neutralTotal = 0;

  for (let i = 0; i < EVENTS.length; i++) {
    const ev = EVENTS[i];
    const result = await runSwarmV9({
      news: ev.news,
      marketData: { vix: ev.vix, rsi: ev.rsi, dropMagnitude: ev.drop, hasPolicyResponse: ev.hasPolicy, hasLeverageDamage: ev.hasLeverage, hasSolvencyDamage: ev.hasSolvency },
      rounds: 1,
      directionThreshold: 5,
      disableMeanReversion: disableMR,
      ablation: { disableNeutralRule1: true, disableNeutralRule2_3: true, disableNeutralRule4: true },
    } as any, true);

    const dir = result.finalDecision.direction;
    const cons = result.finalDecision.consensus;
    const ok = (dir === "UP" && ev.actual === "up") || (dir === "DOWN" && ev.actual === "down") || (dir === "NEUTRAL" && ev.actual === "neutral");
    if (ok) correct++;
    if (ev.actual === "up") { upTotal++; if (dir === "UP") upOk++; }
    if (ev.actual === "down") { downTotal++; if (dir === "DOWN") downOk++; }
    if (ev.actual === "neutral") { neutralTotal++; if (dir === "NEUTRAL") neutralOk++; }

    const pct = ((i + 1) / EVENTS.length * 100).toFixed(0);
    console.log(`[${String(i+1).padStart(2)}/78 ${pct}%] ${ev.name.slice(0,26).padEnd(28)} ${ev.actual.padEnd(7)} ${dir.padEnd(5)} ${ok?"✅":"❌"}  Up=${upOk}/${upTotal} Down=${downOk}/${downTotal}  ${(correct/(i+1)*100).toFixed(0)}%`);
  }
  console.log(`\n${label}: ${correct}/${EVENTS.length}=${(correct/EVENTS.length*100).toFixed(1)}%  Up=${upOk}/${upTotal}=${(upOk/upTotal*100).toFixed(0)}%  Down=${downOk}/${downTotal}=${(downOk/downTotal*100).toFixed(0)}%\n`);
}

async function main() {
  console.log("\n=== v9.6 均值回归感知消融 (78事件, LLM, threshold=+5, Neutral=OFF) ===\n");
  await test(true,  "❌ 均值回归 OFF");
  await test(false, "✅ 均值回归 ON ");
  console.log(`永远猜涨基线: ${(EVENTS.filter(e=>e.actual==="up").length/EVENTS.length*100).toFixed(1)}%\n`);
}
main();
