/**
 * 🎯 40事件分类器基准测试
 */
import { classifyEvent, ClassifierInput } from "../src/lib/calibration/eventClassifierV2";
import { EVENTS, UnifiedEvent } from "./events";
import { assessCrisisType } from "../src/lib/calibration/predictionCalibrator";

let v2Correct = 0, v1Correct = 0;
const v2Errors: string[] = [];

for (const ev of EVENTS) {
  const d = ev;
  const vulnText = d.knownVulnerability ?? "";
  const policyText = d.knownPolicyAction ?? "";
  const hasPolicy = /注入|购债|QE|救助|降息|宽松|紧急|emergency|宣布|联合|担保|设立|购买|承诺|协调|行动/i.test(policyText);
  const hasCB = /央行|美联储|fed\b|ECB|BOJ|英格兰银行|降息|利率|购债|QE|注入|购买|设立|救助|担保/i.test(policyText);
  const hasLev = /杠杆|强制平仓|爆仓|margin|保证金/i.test(vulnText);
  const hasSolv = /违约|破产|系统性|传染|倒闭|会计|欺诈/i.test(vulnText);

  const result = classifyEvent({
    vix: d.vix, rsi: d.rsi, dropMagnitude: d.drop,
    volatility: d.recentVolatility ?? 0, volumeSpike: d.volumeSpike ?? 1,
    hasPolicyResponse: hasPolicy,
    hasCentralBankAction: hasCB,
    hasLeverageDamage: hasLev,
    hasSolvencyDamage: hasSolv,
  });

  const v1 = assessCrisisType({
    newsText: ev.name,
    dropMagnitude: d.drop,
    hasPolicyResponse: hasPolicy,
    hasCentralBankAction: hasCB,
    knownVulnerabilities: vulnText ? [vulnText] : [],
  });

  const v2ImpliesUp = result.pattern === "V_REBOUND" || result.pattern === "W_RECOVERY";
  const v2ImpliesDown = result.pattern === "L_DECLINE";
  const v1ImpliesUp = v1.type === "liquidity" || v1.type === "technical" || v1.type === "external_shock";
  const v1ImpliesDown = v1.type === "solvency";
  const actual = ev.actual;
  const v2right = (actual === "up" && v2ImpliesUp) || (actual === "down" && v2ImpliesDown);
  const v1right = (actual === "up" && v1ImpliesUp) || (actual === "down" && v1ImpliesDown);

  if (v2right) v2Correct++; else v2Errors.push(ev.name);
  if (v1right) v1Correct++;

  console.log(`${v2right?'✅':'❌'} ${ev.name.padEnd(32)} ${actual.padEnd(7)} → ${result.pattern.padEnd(11)} (V${(result.vScore*100).toFixed(0)} L${(result.lScore*100).toFixed(0)}) | V1:${v1.type}`);
}

console.log(`\n📊 分类准确率 (40事件):`);
console.log(`  数据驱动 V2: ${v2Correct}/40 = ${(v2Correct/40*100).toFixed(0)}%`);
console.log(`  关键词 V1:   ${v1Correct}/40 = ${(v1Correct/40*100).toFixed(0)}%`);

// Breakdown by actual direction
const upEv = EVENTS.filter(e=>e.actual==="up");
const downEv = EVENTS.filter(e=>e.actual==="down");

let upCorrect = 0, downCorrect = 0;
for (const ev of upEv) {
  const d = ev;
  const vuln = d.knownVulnerability ?? "";
  const r = classifyEvent({vix:d.vix,rsi:d.rsi,dropMagnitude:d.drop,volatility:d.recentVolatility??0,volumeSpike:d.volumeSpike??1,hasPolicyResponse:true,hasCentralBankAction:true,hasLeverageDamage:/杠杆|强制/.test(vuln),hasSolvencyDamage:/违约|破产|系统性/.test(vuln)});
  if (r.pattern==="V_REBOUND"||r.pattern==="W_RECOVERY") upCorrect++;
}
for (const ev of downEv) {
  const d = ev;
  const vuln = d.knownVulnerability ?? "";
  const pol = d.knownPolicyAction ?? "";
  const r = classifyEvent({vix:d.vix,rsi:d.rsi,dropMagnitude:d.drop,volatility:d.recentVolatility??0,volumeSpike:d.volumeSpike??1,hasPolicyResponse:/注入|购债|QE|救助|降息|宽松|紧急|宣布|联合|担保|设立|购买|承诺/i.test(pol),hasCentralBankAction:/央行|美联储|fed|ECB|BOJ|降息|利率|购债|QE|注入|购买|设立/i.test(pol),hasLeverageDamage:/杠杆|强制|爆仓/i.test(vuln),hasSolvencyDamage:/违约|破产|系统性|传染|会计/i.test(vuln)});
  if (r.pattern==="L_DECLINE") downCorrect++;
}
console.log(`\n  V型事件: ${upCorrect}/${upEv.length}正确`);
console.log(`  L型事件: ${downCorrect}/${downEv.length}正确`);
console.log(`\nV2 错误事件: ${v2Errors.join(', ')}`);
