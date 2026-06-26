import { EVENTS } from "./events";
import { runSwarmV9 } from "../src/lib/agents/v9";

async function main() {
let correct = 0, upOk = 0, upTotal = 0, downOk = 0, downTotal = 0, neutOk = 0, neutTotal = 0;
const start = Date.now();

for (let i = 0; i < EVENTS.length; i++) {
  const ev = EVENTS[i];
  const result = await runSwarmV9({
    news: ev.news,
    marketData: { vix: ev.vix, rsi: ev.rsi, dropMagnitude: ev.drop, hasPolicyResponse: ev.hasPolicy, hasLeverageDamage: ev.hasLeverage, hasSolvencyDamage: ev.hasSolvency },
    rounds: 1, directionThreshold: -5,
    ablation: { disableNeutralRule1: true, disableNeutralRule2_3: true, disableNeutralRule4: true },
  }, false);

  const dir = result.finalDecision.direction;
  const ok = (dir === "UP" && ev.actual === "up") || (dir === "DOWN" && ev.actual === "down") || (dir === "NEUTRAL" && ev.actual === "neutral");
  if (ok) correct++;
  if (ev.actual === "up") { upTotal++; if (dir === "UP") upOk++; }
  if (ev.actual === "down") { downTotal++; if (dir === "DOWN") downOk++; }
  if (ev.actual === "neutral") { neutTotal++; if (dir === "NEUTRAL") neutOk++; }

  console.log(`[${String(i+1).padStart(3)}/203] ${ev.name.slice(0,28).padEnd(30)} ${ok ? "✅" : "❌"}  Up=${upOk}/${upTotal} Down=${downOk}/${downTotal}  ${(correct/(i+1)*100).toFixed(0)}%`);
}

const t = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n${"=".repeat(60)}`);
console.log(`模板模式 203事件 (threshold=-5, Neutral=OFF)`);
console.log(`${"=".repeat(60)}`);
console.log(`总准确率: ${correct}/203 = ${(correct/203*100).toFixed(1)}%`);
console.log(`Up:       ${upOk}/${upTotal} = ${(upOk/upTotal*100).toFixed(0)}%`);
console.log(`Down:     ${downOk}/${downTotal} = ${(downOk/downTotal*100).toFixed(0)}%`);
console.log(`Neutral:  ${neutOk}/${neutTotal} = ${neutTotal > 0 ? (neutOk/neutTotal*100).toFixed(0) + "%" : "N/A"}`);
console.log(`永远猜涨基线: ${(upTotal/203*100).toFixed(1)}%`);
console.log(`耗时: ${t}s`);
}
main();
