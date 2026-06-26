import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { EVENTS } from "./events";
import { runSwarmV9 } from "../src/lib/agents/v9";

async function main() {
  let correct = 0, upOk = 0, upTotal = 0, downOk = 0, downTotal = 0;
  const patterns: Record<string, number> = {};
  const start = Date.now();

  for (let i = 0; i < EVENTS.length; i++) {
    const ev = EVENTS[i];
    try {
      const result = await runSwarmV9({
        news: ev.news,
        marketData: { vix: ev.vix, rsi: ev.rsi, dropMagnitude: ev.drop, hasPolicyResponse: ev.hasPolicy, hasLeverageDamage: ev.hasLeverage, hasSolvencyDamage: ev.hasSolvency },
        rounds: 1, directionThreshold: 5,
        ablation: { disableNeutralRule1: true, disableNeutralRule2_3: true, disableNeutralRule4: true },
      } as any, true);

      const dir = result.finalDecision.direction;
      const ok = (dir === "UP" && ev.actual === "up") || (dir === "DOWN" && ev.actual === "down");
      if (ok) correct++;
      if (ev.actual === "up") { upTotal++; if (dir === "UP") upOk++; }
      if (ev.actual === "down") { downTotal++; if (dir === "DOWN") downOk++; }

      // Track patterns
      const pat = result.rounds[0]?.factorVector?.metadata?.marketPattern || "UNKNOWN";
      patterns[pat] = (patterns[pat] || 0) + 1;

      console.log(`[${String(i+1).padStart(3)}/203] ${ev.name.slice(0,24).padEnd(26)} ${ev.actual.padEnd(7)} ${dir.padEnd(5)} ${ok?"✅":"❌"} ${pat.slice(0,20).padEnd(22)} Up=${upOk}/${upTotal} Down=${downOk}/${downTotal} ${(correct/(i+1)*100).toFixed(0)}%`);
    } catch (e) {
      console.log(`[${String(i+1).padStart(3)}/203] ${ev.name.slice(0,24).padEnd(26)} 💥 ${(e as Error).message.slice(0,40)}`);
    }
  }

  const t = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`\n${"=".repeat(70)}`);
  console.log(`v9.6 Prompt+Pattern+MR 203事件 (threshold=+5, DeepSeek)`);
  console.log(`${"=".repeat(70)}`);
  console.log(`总准确率: ${correct}/${EVENTS.length} = ${(correct / EVENTS.length * 100).toFixed(1)}%`);
  console.log(`Up:       ${upOk}/${upTotal} = ${(upOk / upTotal * 100).toFixed(0)}%`);
  console.log(`Down:     ${downOk}/${downTotal} = ${(downOk / downTotal * 100).toFixed(0)}%`);
  console.log(`永远猜涨基线: ${(upTotal / EVENTS.length * 100).toFixed(1)}%`);
  console.log(`耗时: ${t}s`);
  console.log(`\n模式分布:`);
  Object.entries(patterns).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));
}
main();
