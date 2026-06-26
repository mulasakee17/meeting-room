/**
 * SwarmAlpha 扩充回测 — 60事件 × 修剪共识
 * 运行: npx tsx test/expanded-backtest.ts
 */
import { runSwarmV6, V6SwarmResult, V6_PERSONAS, detectMarketRegime } from "../src/lib/agents/v6";
import { computeTrimmedConsensus } from "../src/lib/agents/v6/influenceSystem";
import { EVENTS } from "./events";

async function main() {
  console.log("🧪 SwarmAlpha v6 修剪共识 — 60事件扩充回测\n");

  let weightedCorrect = 0;
  let trimmedCorrect = 0;
  let upW = 0, upT = 0, upTotal = 0;
  let downW = 0, downT = 0, downTotal = 0;
  let neutralW = 0, neutralT = 0, neutralTotal = 0;

  for (let i = 0; i < EVENTS.length; i++) {
    const ev = EVENTS[i];
    let result: V6SwarmResult;
    try {
      result = await runSwarmV6(ev.news, undefined, 3, {
        vix: ev.vix, rsi: ev.rsi, dropMagnitude: ev.drop,
        hasPolicyResponse: ev.hasPolicy, hasLeverageDamage: ev.hasLeverage,
        hasSolvencyDamage: ev.hasSolvency,
      });
    } catch (e) {
      continue; // skip failures
    }

    const lastRound = result.rounds[result.rounds.length - 1];
    const regime = detectMarketRegime({
      vix: ev.vix, rsi: ev.rsi, dropMagnitude: ev.drop,
      volatility: 0.02, volumeSpike: 1.0,
      hasPolicyResponse: ev.hasPolicy, hasLeverageDamage: ev.hasLeverage,
      hasSolvencyDamage: ev.hasSolvency,
    });

    const wConsensus = result.finalConsensus;
    const tConsensus = computeTrimmedConsensus(lastRound.agents, V6_PERSONAS, regime.agentMultipliers, 1);

    const wDir = wConsensus > 10 ? "up" : wConsensus < -10 ? "down" : "neutral";
    const tDir = tConsensus > 10 ? "up" : tConsensus < -10 ? "down" : "neutral";

    const wOk = wDir === ev.actual, tOk = tDir === ev.actual;
    if (wOk) weightedCorrect++;
    if (tOk) trimmedCorrect++;

    if (ev.actual === "up") { upTotal++; if (wOk) upW++; if (tOk) upT++; }
    if (ev.actual === "down") { downTotal++; if (wOk) downW++; if (tOk) downT++; }
    if (ev.actual === "neutral") { neutralTotal++; if (wOk) neutralW++; if (tOk) neutralT++; }

    const pct = ((i + 1) / EVENTS.length * 100).toFixed(0);
    if ((i + 1) % 10 === 0) {
      console.log(`[${pct}%] ${i+1}/${EVENTS.length} 加权=${weightedCorrect} 修剪=${trimmedCorrect}`);
    }
  }

  console.log(`\n📊 60事件结果:\n`);
  console.log(`方法        总      Up(${upTotal})  Down(${downTotal})  Neutral(${neutralTotal})`);
  console.log("-".repeat(55));
  console.log(`加权共识    ${weightedCorrect}/${EVENTS.length}=${(weightedCorrect/EVENTS.length*100).toFixed(0)}%  ${upW}/${upTotal}=${(upW/upTotal*100).toFixed(0)}%  ${downW}/${downTotal}=${(downW/downTotal*100).toFixed(0)}%    ${neutralW}/${neutralTotal}`);
  console.log(`修剪共识    ${trimmedCorrect}/${EVENTS.length}=${(trimmedCorrect/EVENTS.length*100).toFixed(0)}%  ${upT}/${upTotal}=${(upT/upTotal*100).toFixed(0)}%  ${downT}/${downTotal}=${(downT/downTotal*100).toFixed(0)}%    ${neutralT}/${neutralTotal}`);

  // 95% CI for trimmed
  const n = EVENTS.length;
  const p = trimmedCorrect / n;
  const se = Math.sqrt(p * (1 - p) / n);
  const ciLow = ((p - 1.96 * se) * 100).toFixed(0);
  const ciHigh = ((p + 1.96 * se) * 100).toFixed(0);
  console.log(`\n📏 95%置信区间: [${ciLow}%, ${ciHigh}%]`);
  console.log(`   样本量${n} — ${n >= 60 ? "具有统计参考价值" : "仍需扩充"}`);
}

main().catch(e => console.error("FATAL:", (e as Error).message));
