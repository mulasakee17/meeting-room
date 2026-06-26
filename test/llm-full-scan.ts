/**
 * LLM 模式 78 事件全量扫描 — 阈值 +5, DeepSeek
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { EVENTS } from "./events";
import { runSwarmV9 } from "../src/lib/agents/v9";

async function main() {
let correct = 0, upOk = 0, upTotal = 0, downOk = 0, downTotal = 0, neutralOk = 0, neutralTotal = 0;
const bad: string[] = [];
const start = Date.now();

for (let i = 0; i < EVENTS.length; i++) {
  const ev = EVENTS[i];
  try {
    const result = await runSwarmV9({
      news: ev.news,
      marketData: { vix: ev.vix, rsi: ev.rsi, dropMagnitude: ev.drop, hasPolicyResponse: ev.hasPolicy, hasLeverageDamage: ev.hasLeverage, hasSolvencyDamage: ev.hasSolvency },
      rounds: 1,
      directionThreshold: 5,
      ablation: { disableNeutralRule1: true, disableNeutralRule2_3: true, disableNeutralRule4: true },
    } as any, true);

    const dir = result.finalDecision.direction;
    const cons = result.finalDecision.consensus;
    const ok = (dir === "UP" && ev.actual === "up") || (dir === "DOWN" && ev.actual === "down") || (dir === "NEUTRAL" && ev.actual === "neutral");
    if (ok) correct++;
    else bad.push(`${ev.name} (actual=${ev.actual} pred=${dir} cons=${cons.toFixed(1)})`);
    if (ev.actual === "up") { upTotal++; if (dir === "UP") upOk++; }
    if (ev.actual === "down") { downTotal++; if (dir === "DOWN") downOk++; }
    if (ev.actual === "neutral") { neutralTotal++; if (dir === "NEUTRAL") neutralOk++; }

    const pct = ((i + 1) / EVENTS.length * 100).toFixed(0);
    console.log(`[${String(i+1).padStart(2)}/78 ${pct}%] ${ev.name.slice(0,28).padEnd(30)} ${ok?"✅":"❌"}  Up=${upOk}/${upTotal} Down=${downOk}/${downTotal}  acc=${(correct/(i+1)*100).toFixed(0)}%`);
  } catch (e) {
    console.log(`[${String(i+1).padStart(2)}/78] ${ev.name.slice(0,28).padEnd(30)} 💥 ${(e as Error).message.slice(0,40)}`);
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(0);
console.log(`\n${"=".repeat(60)}`);
console.log(`LLM 模式 78 事件全量 (阈值=+5, Neutral=OFF, DeepSeek)`);
console.log(`${"=".repeat(60)}`);
console.log(`总准确率: ${correct}/${EVENTS.length} = ${(correct / EVENTS.length * 100).toFixed(1)}%`);
console.log(`Up:       ${upOk}/${upTotal} = ${(upOk / upTotal * 100).toFixed(0)}%`);
console.log(`Down:     ${downOk}/${downTotal} = ${(downOk / downTotal * 100).toFixed(0)}%`);
if (neutralTotal > 0) console.log(`Neutral:  ${neutralOk}/${neutralTotal} = ${(neutralOk / neutralTotal * 100).toFixed(0)}%`);
console.log(`耗时: ${elapsed}s (${(Number(elapsed)/EVENTS.length).toFixed(1)}s/事件)`);
console.log(`永远猜涨基线: ${(EVENTS.filter(e => e.actual === "up").length / EVENTS.length * 100).toFixed(1)}%`);
if (bad.length > 0) {
  console.log(`\n❌ 错误 (${bad.length}):`);
  bad.forEach(e => console.log(`  ${e}`));
}
}
main();
