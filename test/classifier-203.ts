import { EVENTS } from "./events";
import { classifyEvent } from "../src/lib/calibration/eventClassifierV2";

let vOk = 0, vTotal = 0, lOk = 0, lTotal = 0, upTotal = 0, downTotal = 0, totalCorrect = 0;

for (const ev of EVENTS) {
  const r = classifyEvent({
    vix: ev.vix, rsi: ev.rsi, dropMagnitude: ev.drop,
    volatility: ev.recentVolatility ?? 0.02,
    volumeSpike: ev.volumeSpike ?? 1,
    hasPolicyResponse: ev.hasPolicy,
    hasCentralBankAction: ev.hasPolicy,
    hasLeverageDamage: ev.hasLeverage,
    hasSolvencyDamage: ev.hasSolvency,
  });

  const isV = r.pattern === "V_REBOUND" || r.pattern === "W_RECOVERY";
  const isL = r.pattern === "L_DECLINE";

  if (ev.actual === "up") { upTotal++; if (isV) vOk++; }
  if (ev.actual === "down") { downTotal++; if (isL) lOk++; }
  if ((isV && ev.actual === "up") || (isL && ev.actual === "down")) totalCorrect++;
  if (isV) vTotal++;
  if (isL) lTotal++;
}

console.log(`\n事件分类器V2 — 203事件`);
console.log(`${"=".repeat(50)}`);
console.log(`V_REBOUND recall (识别UP):  ${vOk}/${upTotal} = ${(vOk / upTotal * 100).toFixed(0)}%`);
console.log(`L_DECLINE recall (识别DOWN): ${lOk}/${downTotal} = ${(lOk / downTotal * 100).toFixed(0)}%`);
console.log(`V_REBOUND precision:         ${vOk}/${vTotal} = ${vTotal > 0 ? (vOk / vTotal * 100).toFixed(0) : "N/A"}%`);
console.log(`L_DECLINE precision:         ${lOk}/${lTotal} = ${lTotal > 0 ? (lOk / lTotal * 100).toFixed(0) : "N/A"}%`);
console.log(`V_REBOUND 预测总数: ${vTotal}  L_DECLINE 预测总数: ${lTotal}`);
console.log(`分类器组合准确率: ${totalCorrect}/${EVENTS.length} = ${(totalCorrect / EVENTS.length * 100).toFixed(1)}%`);
