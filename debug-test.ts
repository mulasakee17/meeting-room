// 调试2000年互联网泡沫
import { calibratePrediction } from "./src/lib/calibration/predictionCalibrator";

// 2000年互联网泡沫数据
const peakPrice = 5048;
const eventPrice = 3321;
const dropPct = ((peakPrice - eventPrice) / peakPrice) * 100;
console.log("跌幅计算:", dropPct.toFixed(1), "%");
console.log("dropPct > 25:", dropPct > 25);
console.log("dropPct > 20:", dropPct > 20);
console.log("dropPct > 8:", dropPct > 8);
console.log("dropPct <= 25:", dropPct <= 25);
console.log("dropPct <= 20:", dropPct <= 20);

const marketState = {
  price: eventPrice,
  previousPrice: eventPrice * 0.99,
  priceHistory: [eventPrice * 1.34, eventPrice * 1.25, eventPrice * 1.15, eventPrice * 1.08, eventPrice],
  volume: 5e9 * 2.5,
  vix: 35,
  rsi: 20,
  macd: -30,
  macdSignal: -25,
  momentum: -dropPct,
  volatility: 0.025,
  sentiment: -dropPct * 2,
};

console.log("\n市场数据: VIX=35, RSI=20, 跌幅=", dropPct.toFixed(1), "%");
console.log("sentiment:", marketState.sentiment);
console.log("\n条件检查:");
console.log("vix >= 35:", marketState.vix >= 35);
console.log("rsi < 25:", marketState.rsi < 25);
console.log("dropPct > 25:", dropPct > 25);

const result = calibratePrediction(marketState.sentiment, marketState);

console.log("\n校准预测:", result.calibratedPrediction);
console.log("方向:", result.direction);
console.log("原因:");
result.reasoning.forEach((r, i) => console.log(`  ${i+1}. ${r}`));
