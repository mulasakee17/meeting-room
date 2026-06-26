/**
 * 📊 40 验证事件严格回测
 *
 * 使用手工策展 + 公开来源验证的 40 个事件
 * 来源: test/curated-events.ts
 *
 * 运行: npx tsx test/verified-backtest.ts
 */

import { EVENTS, UnifiedEvent } from "./events";
import { classifyEvent, ClassifierInput } from "../src/lib/calibration/eventClassifierV2";

// ============ Simulated LLM (consistent baseline) ============

function simulateLLM(event: UnifiedEvent): { consensus: number; direction: string } {
  const d = event;

  // Neutral start with real de-biasing
  let pred = 0;

  // Bearish: proportional to drop
  pred -= Math.min(40, d.drop * 1.8);

  // VIX fear
  if (d.vix > 40) pred -= 12;
  else if (d.vix > 35) pred -= 8;
  else if (d.vix > 25) pred -= 4;

  // Contrarian: RSI oversold → buy signal
  if (d.rsi < 20) pred += 35;
  else if (d.rsi < 25) pred += 25;
  else if (d.rsi < 30) pred += 15;
  else if (d.rsi < 35) pred += 8;

  // Panic climax
  if (d.vix > 35 && d.rsi < 25) pred += 15;

  // Policy response
  const hasPolicy = /注入|购债|QE|救助|降息|宽松|紧急|emergency|宣布|联合|担保|设立/i.test(d.knownPolicyAction ?? "");
  if (hasPolicy) pred += 15;

  // Structural damage
  if (/杠杆|强制平仓|违约|破产|系统性|传染/i.test(d.knownVulnerability ?? "")) pred -= 8;

  pred = Math.max(-100, Math.min(100, pred));
  const dir = pred > 5 ? "up" : pred < -5 ? "down" : "neutral";
  return { consensus: pred, direction: dir };
}

// ============ Calibration (simplified) ============

function calibrate(event: UnifiedEvent): { pred: number; dir: string } {
  const d = event;
  let pred = -d.drop * 1.5;

  // RSI oversold
  if (d.rsi < 15) pred += 60;
  else if (d.rsi < 20) pred += 50;
  else if (d.rsi < 25) pred += 40;
  else if (d.rsi < 30) pred += 25;
  else if (d.rsi < 35) pred += 12;

  // VIX
  if (d.vix > 40 && d.rsi < 25) pred += 35;
  else if (d.vix > 35 && d.rsi < 30) pred += 20;
  else if (d.vix > 40) pred -= 15;
  else if (d.vix > 35) pred -= 8;

  // Policy
  const hasPolicy = /注入|购债|QE|救助|降息|宽松|紧急|宣布|联合|担保|设立/i.test(d.knownPolicyAction ?? "");
  if (hasPolicy) pred += 15;

  // Vulnerability
  if (/杠杆|强制/i.test(d.knownVulnerability ?? "")) pred -= 6;
  if (/违约|破产/i.test(d.knownVulnerability ?? "")) pred -= 6;

  pred = Math.max(-100, Math.min(100, pred));
  const dir = pred > 10 ? "up" : pred < -10 ? "down" : "neutral";
  return { pred, dir };
}

// ============ Hybrid (v4.3 logic) ============

function hybridPredict(
  event: UnifiedEvent,
  cal: { pred: number; dir: string },
  llm: { consensus: number; direction: string }
): { pred: number; dir: string } {
  const d = event;
  const vix = d.vix, rsi = d.rsi, drop = d.drop;
  const hasPolicy = /注入|购债|QE|救助|降息|宽松|紧急|宣布|联合|担保|设立/i.test(d.knownPolicyAction ?? "");
  const hasCB = /央行|美联储|fed|ECB|BOJ|降息|利率|购债|QE|注入|购买|设立|救助|担保/i.test(d.knownPolicyAction ?? "");
  const hasLev = /杠杆|强制平仓|爆仓/i.test(d.knownVulnerability ?? "");
  const hasSolv = /违约|破产|系统性|传染/i.test(d.knownVulnerability ?? "");

  // Data-driven classifier
  const cls = classifyEvent({
    vix, rsi, dropMagnitude: drop,
    volatility: d.recentVolatility ?? 0, volumeSpike: d.volumeSpike ?? 1,
    hasPolicyResponse: hasPolicy,
    hasCentralBankAction: hasCB,
    hasLeverageDamage: hasLev,
    hasSolvencyDamage: hasSolv,
  });

  const cf = cls.confidence / 100;
  let pred: number;

  if (cls.pattern === "L_DECLINE" && cf > 0.32) {
    // L-type: trust LLM more, suppress bull signals
    const patternTarget = -30 - drop * 0.4;
    const classifierWeight = cf < 0.45 ? 0.55 : 0.65;
    const remainingWeight = 1 - classifierWeight;

    // Cap calibration's bullish tendency
    const calContrib = Math.min(cal.pred, 10) * remainingWeight * 0.3;
    const llmContrib = llm.consensus * remainingWeight * 0.7;

    pred = calContrib + llmContrib + patternTarget * classifierWeight;
  } else if (cls.pattern === "V_REBOUND" && cf > 0.32) {
    // V-type: trust calibration, suppress LLM bearishness
    const patternTarget = 25 + drop * 0.6;
    const classifierWeight = cf < 0.45 ? 0.55 : 0.65;
    const remainingWeight = 1 - classifierWeight;

    // RSI bonus
    let rsiBonus = 0;
    if (rsi < 20) rsiBonus = 20;
    else if (rsi < 25) rsiBonus = 14;
    else if (rsi < 30) rsiBonus = 8;
    else if (rsi < 35) rsiBonus = 4;

    pred = cal.pred * remainingWeight * 0.55 +
           llm.consensus * remainingWeight * 0.45 +
           patternTarget * classifierWeight +
           rsiBonus;
  } else {
    // No clear classification: simple ensemble with RSI bias
    const rsiBonus = rsi < 25 ? 12 : rsi < 30 ? 6 : 0;
    pred = cal.pred * 0.45 + llm.consensus * 0.35 + rsiBonus * 0.20;
    if (cal.pred < 0 && llm.consensus < 0 && rsi < 30) pred += 8;
  }

  pred = Math.max(-100, Math.min(100, pred));
  const dir = pred > 10 ? "up" : pred < -10 ? "down" : "neutral";
  return { pred, dir };
}

// ============ Main ============

function run() {
  console.log("=".repeat(95));
  console.log("  📊 40 验证事件严格回测");
  console.log("=".repeat(95));
  console.log();

  let calCorrect = 0, llmCorrect = 0, hybridCorrect = 0;

  // Baseline
  const upCount = EVENTS.filter(e => e.actual === "up").length;
  const downCount = EVENTS.filter(e => e.actual === "down").length;
  const neutralCount = EVENTS.filter(e => e.actual === "neutral").length;

  console.log(`事件分布: ${upCount} up / ${downCount} down / ${neutralCount} neutral`);
  console.log(`永远猜涨基线: ${upCount}/40 = ${(upCount/40*100).toFixed(0)}%`);
  console.log();

  console.log("事件".padEnd(32) + " | 实际 | 校准 | LLM  | 混合 | 分类");
  console.log("-".repeat(95));

  for (const ev of EVENTS) {
    const actual = ev.actual;
    const cal = calibrate(ev);
    const llm = simulateLLM(ev);
    const hyb = hybridPredict(ev, cal, llm);

    // Get classifier for display
    const hasPolicy = /注入|购债|QE|救助|降息|宽松|紧急|宣布|联合|担保|设立/i.test(ev.knownPolicyAction ?? "");
    const hasCB = /央行|美联储|fed|ECB|BOJ|降息|利率|购债|QE|注入|购买|设立|救助|担保/i.test(ev.knownPolicyAction ?? "");
    const hasLev = /杠杆|强制平仓|爆仓/i.test(ev.knownVulnerability ?? "");
    const hasSolv = /违约|破产|系统性|传染/i.test(ev.knownVulnerability ?? "");
    const cls = classifyEvent({
      vix: ev.vix, rsi: ev.rsi, dropMagnitude: ev.drop,
      volatility: ev.recentVolatility ?? 0, volumeSpike: ev.volumeSpike ?? 1,
      hasPolicyResponse: hasPolicy, hasCentralBankAction: hasCB,
      hasLeverageDamage: hasLev, hasSolvencyDamage: hasSolv,
    });

    if (cal.dir === actual) calCorrect++;
    if (llm.direction === actual) llmCorrect++;
    if (hyb.dir === actual) hybridCorrect++;

    const calM = cal.dir === actual ? "✅" : "❌";
    const llmM = llm.direction === actual ? "✅" : "❌";
    const hybM = hyb.dir === actual ? "✅" : "❌";

    console.log(
      `${ev.name.slice(0, 30).padEnd(30)} | ${actual.padEnd(5)} | ${calM} ${String(cal.pred.toFixed(0)).padStart(4)} | ${llmM} ${String(llm.consensus.toFixed(0)).padStart(4)} | ${hybM} ${String(hyb.pred.toFixed(0)).padStart(4)} | ${cls.pattern.padEnd(11)}`
    );
  }

  console.log("-".repeat(95));
  console.log();
  console.log("📊 40 事件回测结果");
  console.log("-".repeat(50));
  const calPct = (calCorrect / 40 * 100).toFixed(0);
  const llmPct = (llmCorrect / 40 * 100).toFixed(0);
  const hybPct = (hybridCorrect / 40 * 100).toFixed(0);
  console.log(`  纯校准系统:     ${calCorrect}/40 = ${calPct}%`);
  console.log(`  纯 LLM (模拟):  ${llmCorrect}/40 = ${llmPct}%`);
  console.log(`  混合预测 v4.3:  ${hybridCorrect}/40 = ${hybPct}%`);
  console.log(`  ─────────────────────────`);
  console.log(`  永远猜涨基线:   ${upCount}/40 = ${(upCount/40*100).toFixed(0)}%`);
  console.log();

  const bestSingle = Math.max(Number(calPct), Number(llmPct));
  const improvement = Number(hybPct) - bestSingle;
  if (Number(hybPct) > (upCount/40*100)) {
    console.log(`  ✅ 混合预测(${hybPct}%) > 永远猜涨(${(upCount/40*100).toFixed(0)}%) — 超过傻瓜基线!`);
  } else {
    console.log(`  ❌ 混合预测(${hybPct}%) ≤ 永远猜涨(${(upCount/40*100).toFixed(0)}%) — 未超过傻瓜基线`);
  }
}

run();
