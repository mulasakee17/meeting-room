/**
 * SwarmAlpha 历史事件预测精度测试
 *
 * 使用 17 个真实历史黑天鹅事件，测试 5 个版本的预测校准器：
 * 1. 基础版 (predictionCalibrator)
 * 2. 增强版 (enhancedPredictionCalibrator)
 * 3. Phase 1 (扩展历史DB + 自适应模型)
 * 4. Phase 2 (+ LSTM + 多周期共振)
 * 5. Phase 3 (+ Transformer + 模型融合)
 *
 * 运行: npx tsx test/historical-prediction-accuracy.ts
 */

import * as path from "path";
import * as fs from "fs";

// ========== 内联历史事件数据（17个真实事件） ==========

interface ExtendedBlackSwan {
  name: string;
  date: string;
  severity: string;
  category: string;
  initialDrop: number;
  totalDrop: number;
  recoveryDays: number;
  vixPeak: number;
  rsiLow: number;
  atrRatio: number;
  reboundProbability: number;
  reboundMagnitude: number;
  reboundPattern: string;
  volumeSpikeRatio: number;
}

const EVENTS: ExtendedBlackSwan[] = [
  {
    name: "1987年黑色星期一", date: "1987-10-19", severity: "catastrophic", category: "financial",
    initialDrop: -22.6, totalDrop: -38.0, recoveryDays: 90, vixPeak: 150, rsiLow: 8,
    atrRatio: 0.08, reboundProbability: 0.85, reboundMagnitude: 12, reboundPattern: "V型", volumeSpikeRatio: 5.5,
  },
  {
    name: "2000年互联网泡沫破裂", date: "2000-03-10", severity: "catastrophic", category: "financial",
    initialDrop: -8.0, totalDrop: -78.0, recoveryDays: 2520, vixPeak: 45, rsiLow: 15,
    atrRatio: 0.03, reboundProbability: 0.25, reboundMagnitude: 5, reboundPattern: "U型", volumeSpikeRatio: 2.5,
  },
  {
    name: "2001年911恐怖袭击", date: "2001-09-11", severity: "extreme", category: "geopolitical",
    initialDrop: -7.1, totalDrop: -15.0, recoveryDays: 30, vixPeak: 48, rsiLow: 18,
    atrRatio: 0.04, reboundProbability: 0.80, reboundMagnitude: 8, reboundPattern: "V型", volumeSpikeRatio: 4.5,
  },
  {
    name: "2008年雷曼兄弟破产", date: "2008-09-15", severity: "catastrophic", category: "financial",
    initialDrop: -4.7, totalDrop: -56.8, recoveryDays: 1500, vixPeak: 80.86, rsiLow: 10,
    atrRatio: 0.06, reboundProbability: 0.35, reboundMagnitude: 10, reboundPattern: "W型", volumeSpikeRatio: 4.2,
  },
  {
    name: "2010年闪电崩盘", date: "2010-05-06", severity: "extreme", category: "financial",
    initialDrop: -9.2, totalDrop: -9.2, recoveryDays: 1, vixPeak: 40, rsiLow: 20,
    atrRatio: 0.035, reboundProbability: 0.90, reboundMagnitude: 5, reboundPattern: "V型", volumeSpikeRatio: 3.5,
  },
  {
    name: "2011年日本大地震", date: "2011-03-11", severity: "extreme", category: "natural_disaster",
    initialDrop: -6.0, totalDrop: -20.0, recoveryDays: 90, vixPeak: 35, rsiLow: 22,
    atrRatio: 0.04, reboundProbability: 0.70, reboundMagnitude: 10, reboundPattern: "V型", volumeSpikeRatio: 4.0,
  },
  {
    name: "2011年美国主权降级", date: "2011-08-05", severity: "extreme", category: "regulatory",
    initialDrop: -6.5, totalDrop: -19.0, recoveryDays: 120, vixPeak: 48, rsiLow: 18,
    atrRatio: 0.035, reboundProbability: 0.60, reboundMagnitude: 8, reboundPattern: "W型", volumeSpikeRatio: 3.2,
  },
  {
    name: "2015年中国A股股灾", date: "2015-06-12", severity: "catastrophic", category: "financial",
    initialDrop: -8.5, totalDrop: -52.0, recoveryDays: 480, vixPeak: 45, rsiLow: 12,
    atrRatio: 0.06, reboundProbability: 0.30, reboundMagnitude: 5, reboundPattern: "L型", volumeSpikeRatio: 5.0,
  },
  {
    name: "2015年人民币811汇改", date: "2015-08-11", severity: "high", category: "commodity",
    initialDrop: -6.0, totalDrop: -12.0, recoveryDays: 45, vixPeak: 35, rsiLow: 25,
    atrRatio: 0.02, reboundProbability: 0.55, reboundMagnitude: 4, reboundPattern: "V型", volumeSpikeRatio: 2.5,
  },
  {
    name: "2018年中美贸易战", date: "2018-07-06", severity: "high", category: "geopolitical",
    initialDrop: -2.5, totalDrop: -20.0, recoveryDays: 365, vixPeak: 28, rsiLow: 28,
    atrRatio: 0.015, reboundProbability: 0.45, reboundMagnitude: 5, reboundPattern: "W型", volumeSpikeRatio: 2.2,
  },
  {
    name: "2020年新冠疫情爆发", date: "2020-03-09", severity: "catastrophic", category: "pandemic",
    initialDrop: -12.9, totalDrop: -38.0, recoveryDays: 90, vixPeak: 82.69, rsiLow: 8,
    atrRatio: 0.05, reboundProbability: 0.70, reboundMagnitude: 15, reboundPattern: "V型", volumeSpikeRatio: 4.2,
  },
  {
    name: "2020年负油价事件", date: "2020-04-20", severity: "high", category: "commodity",
    initialDrop: -35.0, totalDrop: -35.0, recoveryDays: 60, vixPeak: 40, rsiLow: 10,
    atrRatio: 0.08, reboundProbability: 0.85, reboundMagnitude: 20, reboundPattern: "V型", volumeSpikeRatio: 6.0,
  },
  {
    name: "2022年俄乌战争爆发", date: "2022-02-24", severity: "extreme", category: "geopolitical",
    initialDrop: -4.6, totalDrop: -25.0, recoveryDays: 60, vixPeak: 37.5, rsiLow: 22,
    atrRatio: 0.025, reboundProbability: 0.75, reboundMagnitude: 8, reboundPattern: "V型", volumeSpikeRatio: 2.8,
  },
  {
    name: "2022年Meta暴跌", date: "2022-02-03", severity: "high", category: "tech",
    initialDrop: -26.4, totalDrop: -50.0, recoveryDays: 180, vixPeak: 30, rsiLow: 18,
    atrRatio: 0.035, reboundProbability: 0.55, reboundMagnitude: 15, reboundPattern: "U型", volumeSpikeRatio: 3.5,
  },
  {
    name: "2023年硅谷银行倒闭", date: "2023-03-10", severity: "high", category: "financial",
    initialDrop: -4.6, totalDrop: -8.0, recoveryDays: 30, vixPeak: 32, rsiLow: 25,
    atrRatio: 0.02, reboundProbability: 0.80, reboundMagnitude: 6, reboundPattern: "V型", volumeSpikeRatio: 2.8,
  },
  {
    name: "2023年ChatGPT引发的AI热潮", date: "2023-01-23", severity: "medium", category: "tech",
    initialDrop: 0, totalDrop: 0, recoveryDays: 0, vixPeak: 20, rsiLow: 50,
    atrRatio: 0.01, reboundProbability: 0.90, reboundMagnitude: 25, reboundPattern: "V型", volumeSpikeRatio: 1.8,
  },
  {
    name: "2024年日元套利交易崩盘", date: "2024-08-05", severity: "extreme", category: "financial",
    initialDrop: -6.5, totalDrop: -10.0, recoveryDays: 14, vixPeak: 65, rsiLow: 15,
    atrRatio: 0.045, reboundProbability: 0.65, reboundMagnitude: 6, reboundPattern: "V型", volumeSpikeRatio: 3.8,
  },
];

// ========== 模拟市场数据生成 ==========

interface MarketState {
  price: number;
  previousPrice: number;
  priceHistory: number[];
  volume: number;
  vix: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  momentum: number;
  volatility: number;
  sentiment: number;
}

function generateMarketState(event: ExtendedBlackSwan): MarketState {
  const basePrice = 3000;
  const priceAtEvent = basePrice * (1 + event.initialDrop / 100);
  const priceHistory: number[] = [];

  // 生成 180 天价格历史
  const declinePercent = Math.abs(event.totalDrop) / 100;
  for (let i = 0; i < 180; i++) {
    if (i < 60) {
      priceHistory.push(basePrice * (1 + Math.sin(i / 10) * 0.02 + (Math.random() - 0.5) * 0.01));
    } else if (i < 90) {
      const progress = (i - 60) / 30;
      priceHistory.push(basePrice * (1 - declinePercent * 0.3 * progress));
    } else if (i < 120) {
      const progress = (i - 90) / 30;
      priceHistory.push(basePrice * (1 - declinePercent * 0.5 - declinePercent * 0.4 * progress));
    } else if (i < 150) {
      const progress = (i - 120) / 30;
      priceHistory.push(basePrice * (1 - declinePercent) * (1 + progress * 0.05));
    } else {
      const progress = (i - 150) / 30;
      priceHistory.push(basePrice * (1 - declinePercent + event.reboundMagnitude / 100 * progress));
    }
  }
  priceHistory.push(priceAtEvent);

  return {
    price: priceAtEvent,
    previousPrice: basePrice,
    priceHistory,
    volume: 5e9 * event.volumeSpikeRatio,
    vix: event.vixPeak,
    rsi: event.rsiLow,
    macd: -30,
    macdSignal: -25,
    momentum: event.initialDrop,
    volatility: event.atrRatio,
    sentiment: Math.max(-100, Math.min(100, -80 + event.initialDrop)),
  };
}

// ========== 核心指标计算 ==========

function calculateMean(v: number[]): number { return v.reduce((a, b) => a + b, 0) / v.length; }

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

// ========== V1: 基础版校准器 ==========

function calibrateV1(prediction: number, state: MarketState) {
  // Extreme event amplification
  let extremeFactor = 1.0;
  if (state.vix > 30) {
    const vixRatio = state.vix / 30;
    const vixMultiplier = state.rsi < 25 ? 0.3 : state.rsi < 35 ? 0.6 : 1.0;
    extremeFactor += (vixRatio - 1) * 0.5 * vixMultiplier;
  }
  if (state.volatility > 0.03) {
    const volRatio = state.volatility / 0.03;
    const volMultiplier = state.rsi < 25 ? 0.3 : state.rsi < 35 ? 0.6 : 1.0;
    extremeFactor += volRatio * 0.3 * volMultiplier;
  }
  if (state.rsi < 20) extremeFactor *= 0.6;
  else if (state.rsi < 30) extremeFactor *= 0.8;
  extremeFactor = clamp(extremeFactor, 0.5, 3.0);

  // Oversold rebound
  let reboundFactor = 0;
  if (state.rsi < 30) {
    const depth = (30 - state.rsi) / 30;
    reboundFactor = 0.6 * depth * 1.5;
    if (state.rsi < 10) reboundFactor *= 4.0;
    else if (state.rsi < 15) reboundFactor *= 3.0;
    else if (state.rsi < 20) reboundFactor *= 2.0;
    else if (state.rsi < 25) reboundFactor *= 1.5;
    if (state.macd > state.macdSignal) reboundFactor += 0.4;
    if (state.momentum > 0) reboundFactor += 0.3;
    reboundFactor = Math.min(1.5, reboundFactor);
  }

  let calibrated = prediction;

  // Apply oversold rebound
  if (reboundFactor > 0 && state.rsi < 30) {
    let adjustment = 0;
    if (state.rsi < 10) adjustment = 150 + reboundFactor * 100;
    else if (state.rsi < 15) adjustment = 100 + reboundFactor * 80;
    else if (state.rsi < 20) adjustment = 60 + reboundFactor * 50;
    else if (state.rsi < 25) adjustment = 45 + reboundFactor * 30;
    else adjustment = 30 + reboundFactor * 20;
    calibrated += adjustment;
  }

  // Apply extreme amplification
  if (extremeFactor > 1 && prediction < 0) {
    if (state.rsi >= 20) {
      calibrated *= extremeFactor;
    } else {
      calibrated *= 1 + (extremeFactor - 1) * 0.3;
    }
  }

  // Momentum
  let momDir = state.momentum > 0 ? 1 : state.momentum < 0 ? -1 : 0;
  if (state.rsi < 20 && momDir < 0) momDir *= 0.3;
  else if (state.rsi < 25 && momDir < 0) momDir *= 0.5;
  const macdCross = state.macd > state.macdSignal ? 0.05 : state.macd < state.macdSignal ? -0.05 : 0;
  calibrated += (momDir * Math.abs(state.momentum) * 0.1 + macdCross) * 100 * 0.15;

  // Volatility
  if (state.volatility > 0.02) {
    calibrated *= (1 + (state.volatility / 0.02) * 0.10);
  }

  calibrated = clamp(calibrated, -100, 100);

  const isExtreme = extremeFactor > 1;
  const isOversold = state.rsi < 30;
  const isReversal = reboundFactor > 0.5;
  const momDirection = momDir > 0.02 ? "up" : momDir < -0.02 ? "down" : "neutral";

  let confidence = 50;
  if (isExtreme) confidence -= extremeFactor * 10;
  if (reboundFactor > 0.5) confidence += reboundFactor * 20;
  if (Math.sign(prediction) === Math.sign(calibrated)) confidence += 10;
  if (state.volatility > 0.03) confidence -= 15;
  confidence = clamp(confidence, 20, 90);

  return { calibratedPrediction: calibrated, confidence, isExtreme, isOversold, isReversal, momDirection };
}

// ========== V2: 增强版校准器（增强的反弹检测+反转信号） ==========

function calibrateV2(prediction: number, state: MarketState) {
  const v1 = calibrateV1(prediction, state);
  let calibrated = v1.calibratedPrediction;

  // Additional reversal detection
  const priceChange = (state.price - state.previousPrice) / state.previousPrice;
  let reversalProb = 0;
  let reversalDir: "up" | "down" = "up";

  if (state.rsi < 25 && state.momentum > 0 && state.macd > state.macdSignal) {
    reversalProb = 0.7; reversalDir = "up";
  }
  if (state.rsi > 75 && state.momentum < 0 && state.macd < state.macdSignal) {
    reversalProb = 0.7; reversalDir = "down";
  }
  if (priceChange < -0.05 && state.rsi < 30) {
    reversalProb = 0.6; reversalDir = "up";
  }
  if (priceChange > 0.05 && state.rsi > 70) {
    reversalProb = 0.6; reversalDir = "down";
  }

  // Apply reversal
  if (reversalProb > 0.6 && reversalDir === "up") {
    calibrated += reversalProb * 30;
  } else if (reversalProb > 0.6 && reversalDir === "down") {
    calibrated -= reversalProb * 30;
  }

  // Multi-dimensional oversold analysis (simplified)
  if (state.rsi < 25 && state.macd < state.macdSignal) {
    calibrated += 10; // MACD divergence bonus
  }

  // Historical similarity matching
  let bestSim = 0;
  let matchedEvent: ExtendedBlackSwan | null = null;
  for (const evt of EVENTS) {
    const vixSim = state.vix > 0 ? 1 - Math.abs(state.vix - evt.vixPeak) / Math.max(state.vix, evt.vixPeak) : 0;
    const rsiSim = 1 - Math.abs(state.rsi - evt.rsiLow) / Math.max(state.rsi, evt.rsiLow);
    const volSim = state.volatility > 0.02 ? 0.8 : 0.3;
    const sim = (vixSim * 0.4 + rsiSim * 0.4 + volSim * 0.2);
    if (sim > bestSim) { bestSim = sim; matchedEvent = evt; }
  }

  if (matchedEvent && bestSim > 0.6) {
    calibrated += (matchedEvent.reboundProbability - 0.5) * 30;
  }

  calibrated = clamp(calibrated, -100, 100);
  const confidence = clamp(v1.confidence + (bestSim > 0.7 ? 10 : 0), 20, 90);

  return { calibratedPrediction: calibrated, confidence, isExtreme: v1.isExtreme, isOversold: v1.isOversold, isReversal: reversalProb > 0.5 || v1.isReversal, momDirection: v1.momDirection, bestSimilarity: bestSim, matchedEvent: matchedEvent?.name };
}

// ========== V3: Phase 1 校准器（扩展历史DB + 自适应模型选择） ==========

function calibrateV3(prediction: number, state: MarketState) {
  const v2 = calibrateV2(prediction, state);
  let calibrated = v2.calibratedPrediction;
  let confidence = v2.confidence;

  // Enhanced historical matching with more events
  let bestSim = 0;
  let matchedEvent: ExtendedBlackSwan | null = null;
  for (const evt of EVENTS) {
    const vixSim = state.vix > 0 ? 1 - Math.abs(state.vix - evt.vixPeak) / Math.max(state.vix, evt.vixPeak) : 0;
    const rsiSim = 1 - Math.abs(state.rsi - evt.rsiLow) / Math.max(state.rsi, evt.rsiLow);
    const volSim = state.volatility > 0 ? 1 - Math.abs(state.volatility - evt.atrRatio) / Math.max(state.volatility, evt.atrRatio) : 0.5;
    const sim = vixSim * 0.35 + rsiSim * 0.35 + volSim * 0.3;
    if (sim > bestSim) { bestSim = sim; matchedEvent = evt; }
  }

  if (matchedEvent && bestSim > 0.55) {
    const rsiMult = state.rsi < 20 ? 3.0 : state.rsi < 25 ? 2.0 : state.rsi < 30 ? 1.5 : 1.0;
    const vixMult = state.vix > 50 ? 1.5 : 1.0;
    calibrated += (matchedEvent.reboundProbability - 0.5) * 20 * rsiMult * vixMult * 0.25;
    confidence += bestSim * 15;
  }

  // Adaptive model selection
  let regime = "UNKNOWN";
  if (state.vix > 50) regime = "CRASH";
  else if (state.rsi < 25) regime = "CRASH";
  else if (state.rsi > 70) regime = "TRENDING_UP";
  else if (state.momentum < -5) regime = "TRENDING_DOWN";
  else if (state.volatility > 0.04) regime = "VOLATILE";
  else regime = "SIDEWAYS";

  // Model-specific adjustments
  switch (regime) {
    case "CRASH":
      if (state.rsi < 20) calibrated += 5; // Reduce bearish in extreme crash
      else if (prediction < 0) calibrated *= 1.1; // Amplify bearish in early crash
      break;
    case "TRENDING_DOWN":
      if (state.rsi < 25) calibrated += 8; // Potential reversal
      break;
    case "VOLATILE":
      calibrated *= 0.9; // Reduce conviction in volatile markets
      break;
  }

  calibrated = clamp(calibrated, -100, 100);
  confidence = clamp(confidence, 15, 95);

  return { calibratedPrediction: calibrated, confidence, isExtreme: v2.isExtreme, isOversold: v2.isOversold, isReversal: v2.isReversal, momDirection: v2.momDirection, regime, matchedEvent: matchedEvent?.name, similarity: bestSim };
}

// ========== V4: Phase 2 校准器 (+ LSTM + 多周期共振) ==========

function simpleLSTMPredict(prices: number[]): { upProb: number; downProb: number; confidence: number } {
  if (prices.length < 20) return { upProb: 50, downProb: 50, confidence: 50 };
  const recent = prices.slice(-5);
  const older = prices.slice(-20, -5);
  const recentAvg = calculateMean(recent);
  const olderAvg = calculateMean(older);
  const trend = (recentAvg - olderAvg) / olderAvg;
  const rsi = calculateSimpleRSI(prices);
  const vol = calculateSimpleVolatility(prices);
  let upProb = 50 + trend * 1000 + (rsi < 30 ? 10 : 0) - vol * 200;
  upProb = clamp(upProb, 5, 95);
  return { upProb, downProb: 100 - upProb, confidence: clamp(70 - vol * 500, 40, 85) };
}

function calculateSimpleRSI(prices: number[]): number {
  if (prices.length < 15) return 50;
  const changes = [];
  for (let i = prices.length - 14; i < prices.length; i++) changes.push(prices[i] - prices[i - 1]);
  const gains = changes.filter(c => c > 0).reduce((a, b) => a + b, 0);
  const losses = Math.abs(changes.filter(c => c < 0).reduce((a, b) => a + b, 0));
  if (losses === 0) return 100;
  return 100 - (100 / (1 + gains / losses));
}

function calculateSimpleVolatility(prices: number[]): number {
  if (prices.length < 5) return 0.02;
  const returns = [];
  for (let i = prices.length - 5; i < prices.length; i++) returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  const mean = calculateMean(returns);
  return Math.sqrt(returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length);
}

function multiPeriodResonance(prices: number[], weekly: number[], monthly: number[]): { level: string; score: number; confidence: number } {
  if (weekly.length < 5 || monthly.length < 3 || prices.length < 20) return { level: "NEUTRAL", score: 0, confidence: 40 };
  const dailyTrend = prices[prices.length - 1] - prices[prices.length - 20];
  const weeklyTrend = weekly[weekly.length - 1] - weekly[0];
  const monthlyTrend = monthly[monthly.length - 1] - monthly[0];
  const directions = [Math.sign(dailyTrend), Math.sign(weeklyTrend), Math.sign(monthlyTrend)];
  const posCount = directions.filter(d => d > 0).length;
  const negCount = directions.filter(d => d < 0).length;
  let level: string, score: number, confidence: number;
  if (posCount === 3) { level = "STRONG_BULLISH"; score = 80; confidence = 80; }
  else if (posCount === 2) { level = "BULLISH"; score = 60; confidence = 65; }
  else if (negCount === 3) { level = "STRONG_BEARISH"; score = 80; confidence = 80; }
  else if (negCount === 2) { level = "BEARISH"; score = 60; confidence = 65; }
  else { level = "DIVERGENCE"; score = 20; confidence = 40; }
  return { level, score, confidence };
}

function calibrateV4(prediction: number, state: MarketState) {
  const v3 = calibrateV3(prediction, state);
  let calibrated = v3.calibratedPrediction;
  let confidence = v3.confidence;

  // LSTM prediction
  if (state.priceHistory.length >= 20) {
    const lstm = simpleLSTMPredict(state.priceHistory);
    const lstmTrend = (lstm.upProb - lstm.downProb) / 100 * 50;
    let lstmWeight = 0.15;
    if (state.rsi < 20 && lstmTrend < 0) lstmWeight *= 0.3;
    else if (state.rsi < 25 && lstmTrend < 0) lstmWeight *= 0.5;
    calibrated += lstmTrend * lstmWeight;
    confidence += lstm.confidence * lstmWeight * 0.5;
  }

  // Multi-period resonance
  if (state.priceHistory.length >= 60) {
    const weekly = state.priceHistory.filter((_, i) => i % 5 === 0);
    const monthly = state.priceHistory.filter((_, i) => i % 21 === 0);
    const resonance = multiPeriodResonance(state.priceHistory, weekly, monthly);
    let resAdj = 0;
    switch (resonance.level) {
      case "STRONG_BULLISH": resAdj = 30; break;
      case "BULLISH": resAdj = 20; break;
      case "STRONG_BEARISH": resAdj = -30; break;
      case "BEARISH": resAdj = -20; break;
      case "DIVERGENCE": resAdj = -Math.sign(calibrated) * 15; break;
    }
    calibrated += resAdj * 0.20;
    confidence += resonance.confidence * 0.20 * (resonance.level.includes("BULL") || resonance.level.includes("BEAR") ? 0.8 : -0.3);
  }

  calibrated = clamp(calibrated, -100, 100);
  confidence = clamp(confidence, 15, 95);

  return { calibratedPrediction: calibrated, confidence, isExtreme: v3.isExtreme, isOversold: v3.isOversold, isReversal: v3.isReversal, momDirection: v3.momDirection, regime: v3.regime };
}

// ========== V5: Phase 3 校准器 (+ Transformer + 模型融合 + 置信度校准) ==========

function simpleTransformerPredict(prices: number[]): { upProb: number; downProb: number; confidence: number; predictedPrice: number; priceRange: [number, number] } {
  if (prices.length < 60) return { upProb: 50, downProb: 50, confidence: 50, predictedPrice: prices[prices.length - 1], priceRange: [prices[prices.length - 1] * 0.95, prices[prices.length - 1] * 1.05] };
  const recent10 = calculateMean(prices.slice(-10));
  const recent30 = calculateMean(prices.slice(-30));
  const recent60 = calculateMean(prices.slice(-60));
  const trend = (recent10 - recent60) / recent60;
  const mom = (recent10 - recent30) / recent30;
  const combined = trend * 0.6 + mom * 0.4;
  let upProb = 50 + combined * 500;
  upProb = clamp(upProb, 5, 95);
  const currentPrice = prices[prices.length - 1];
  const predictedPrice = currentPrice * (1 + combined);
  const range = currentPrice * 0.05;
  return {
    upProb,
    downProb: 100 - upProb,
    confidence: clamp(65 - Math.abs(combined) * 200, 40, 80),
    predictedPrice,
    priceRange: [predictedPrice - range, predictedPrice + range],
  };
}

function calibrateV5(prediction: number, state: MarketState) {
  const v4 = calibrateV4(prediction, state);
  let calibrated = v4.calibratedPrediction;
  let confidence = v4.confidence;

  // Transformer prediction
  if (state.priceHistory.length >= 60) {
    const transformer = simpleTransformerPredict(state.priceHistory);
    const transTrend = (transformer.upProb - transformer.downProb) / 100 * 50;
    const transWeight = 0.18 * (transformer.confidence / 100);
    if (Math.sign(transTrend) === Math.sign(calibrated)) {
      calibrated += transTrend * transWeight * 1.15;
    } else {
      calibrated += transTrend * transWeight * 0.6;
    }
    confidence += transformer.confidence * 0.18 * 0.4;
  }

  // Model fusion - measure agreement
  const v4Direction = Math.sign(calibrated - prediction); // How much V4 changed the prediction
  const directionSignals: number[] = [];
  if (state.priceHistory.length >= 20) {
    const lstm = simpleLSTMPredict(state.priceHistory);
    directionSignals.push((lstm.upProb - lstm.downProb) / 100);
  }
  if (state.priceHistory.length >= 60) {
    const transformer = simpleTransformerPredict(state.priceHistory);
    directionSignals.push((transformer.upProb - transformer.downProb) / 100);
  }

  const posCount = directionSignals.filter(d => d > 0.1).length;
  const negCount = directionSignals.filter(d => d < -0.1).length;
  const total = directionSignals.length;
  const maxAgreement = Math.max(posCount, negCount);
  const agreementRatio = total > 0 ? maxAgreement / total : 0.5;
  let agreement: string;
  if (agreementRatio >= 0.8) agreement = "strong";
  else if (agreementRatio >= 0.6) agreement = "moderate";
  else if (agreementRatio >= 0.4) agreement = "weak";
  else agreement = "divergent";

  // Confidence calibration
  switch (agreement) {
    case "strong": confidence *= 1.15; break;
    case "weak": confidence *= 0.9; break;
    case "divergent": confidence *= 0.75; break;
  }

  calibrated = clamp(calibrated, -100, 100);
  confidence = clamp(confidence, 15, 95);

  return { calibratedPrediction: calibrated, confidence, isExtreme: v4.isExtreme, isOversold: v4.isOversold, isReversal: v4.isReversal, momDirection: v4.momDirection, regime: v4.regime, agreement };
}

// ========== 预测精度计算 ==========

function determineDirection(emotion: number): "up" | "down" | "neutral" {
  if (emotion > 10) return "up";
  if (emotion < -10) return "down";
  return "neutral";
}

function determineActualDirection(event: ExtendedBlackSwan): "up" | "down" | "neutral" {
  if (event.reboundProbability > 0.6 && event.reboundMagnitude > 5) return "up";
  if (event.totalDrop < -20 && event.reboundProbability < 0.4) return "down";
  return "neutral";
}

function determineActualOutcomeValue(event: ExtendedBlackSwan): number {
  const dir = determineActualDirection(event);
  if (dir === "up") return 1;
  if (dir === "down") return 0;
  return 0.5;
}

function calculateBrierScore(prediction: number, actualOutcome: number): number {
  const predProb = (prediction + 100) / 200;
  return (predProb - actualOutcome) ** 2;
}

interface VersionResult {
  calibratedPrediction: number;
  confidence: number;
  predictedDir: "up" | "down" | "neutral";
  directionCorrect: boolean;
  brierScore: number;
  reboundPredicted: boolean;
}

interface EventTestResult {
  event: ExtendedBlackSwan;
  actualDir: "up" | "down" | "neutral";
  actualValue: number;
  versions: Record<string, VersionResult>;
}

interface AggregateStats {
  version: string;
  totalEvents: number;
  directionAccuracy: number;
  avgBrierScore: number;
  avgConfidence: number;
  reboundRecall: number;
  reboundPrecision: number;
  crashRecall: number;
}

// ========== 主测试 ==========

function runAllTests() {
  console.log("=".repeat(90));
  console.log("  SwarmAlpha 历史事件预测精度测试");
  console.log("  测试 17 个历史黑天鹅事件 × 5 个校准版本");
  console.log("=".repeat(90));
  console.log();

  const results: EventTestResult[] = [];

  for (const event of EVENTS) {
    const state = generateMarketState(event);
    const actualDir = determineActualDirection(event);
    const actualValue = determineActualOutcomeValue(event);

    // Generate base prediction from sentiment
    const basePrediction = state.sentiment;

    // Run all 5 versions
    const v1 = calibrateV1(basePrediction, state);
    const v2 = calibrateV2(basePrediction, state);
    const v3 = calibrateV3(basePrediction, state);
    const v4 = calibrateV4(basePrediction, state);
    const v5 = calibrateV5(basePrediction, state);

    const makeResult = (r: { calibratedPrediction: number; confidence: number }) => ({
      calibratedPrediction: r.calibratedPrediction,
      confidence: r.confidence,
      predictedDir: determineDirection(r.calibratedPrediction),
      directionCorrect: determineDirection(r.calibratedPrediction) === actualDir,
      brierScore: calculateBrierScore(r.calibratedPrediction, actualValue),
      reboundPredicted: r.calibratedPrediction > 10 && actualDir === "up",
    });

    results.push({
      event,
      actualDir,
      actualValue,
      versions: {
        basic: makeResult(v1),
        enhanced: makeResult(v2),
        phase1: makeResult(v3),
        phase2: makeResult(v4),
        phase3: makeResult(v5),
      },
    });
  }

  // ========== 总体统计 ==========
  console.log("📊 总体预测精度汇总");
  console.log("-".repeat(90));

  const versionKeys = ["basic", "enhanced", "phase1", "phase2", "phase3"];
  const versionNames: Record<string, string> = {
    basic: "基础版",
    enhanced: "增强版",
    phase1: "Phase 1",
    phase2: "Phase 2",
    phase3: "Phase 3",
  };

  const aggregateStats: AggregateStats[] = versionKeys.map(key => {
    const versionResults = results.map(r => r.versions[key]);
    const total = versionResults.length;
    const correct = versionResults.filter(r => r.directionCorrect).length;
    const avgBrier = versionResults.reduce((s, r) => s + r.brierScore, 0) / total;
    const avgConf = versionResults.reduce((s, r) => s + r.confidence, 0) / total;

    // Rebound events
    const reboundEvents = results.filter(r => r.actualDir === "up");
    const reboundPredicted = reboundEvents.filter(r => r.versions[key].predictedDir === "up").length;
    const reboundRecall = reboundEvents.length > 0 ? reboundPredicted / reboundEvents.length * 100 : 0;

    // Precision: of all "up" predictions, how many were actually up
    const allUpPredicted = results.filter(r => r.versions[key].predictedDir === "up");
    const upCorrect = allUpPredicted.filter(r => r.actualDir === "up").length;
    const reboundPrecision = allUpPredicted.length > 0 ? upCorrect / allUpPredicted.length * 100 : 0;

    // Crash events
    const crashEvents = results.filter(r => r.actualDir === "down");
    const crashPredicted = crashEvents.filter(r => r.versions[key].predictedDir === "down").length;
    const crashRecall = crashEvents.length > 0 ? crashPredicted / crashEvents.length * 100 : 0;

    return {
      version: versionNames[key],
      totalEvents: total,
      directionAccuracy: correct / total * 100,
      avgBrierScore: avgBrier,
      avgConfidence: avgConf,
      reboundRecall,
      reboundPrecision,
      crashRecall,
    };
  });

  // Print summary table
  console.log();
  console.log("┌────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐");
  console.log("│ 指标       │ 基础版   │ 增强版   │ Phase 1  │ Phase 2  │ Phase 3  │");
  console.log("├────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤");

  const printRow = (label: string, values: number[], format: string, suffix: string = "") => {
    const cells = values.map(v => format.replace("X", v.toFixed(format.includes(".") ? (format.split(".")[1]?.length || 1) : 0)));
    const paddedCells = cells.map(c => c.padStart(8));
    console.log(`│ ${label.padEnd(10)} │${paddedCells.join(" │")} │${suffix}`);
  };

  printRow("方向准确率", aggregateStats.map(s => s.directionAccuracy), "X.0%", "");
  printRow("Brier Score", aggregateStats.map(s => s.avgBrierScore), "X.0000", "");
  printRow("平均置信度", aggregateStats.map(s => s.avgConfidence), "X.0%", "");
  printRow("反弹召回率", aggregateStats.map(s => s.reboundRecall), "X.0%", "");
  printRow("反弹精确率", aggregateStats.map(s => s.reboundPrecision), "X.0%", "");
  printRow("崩盘召回率", aggregateStats.map(s => s.crashRecall), "X.0%", "");

  console.log("└────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘");

  // ========== 最佳表现 ==========
  console.log();
  console.log("🏆 最佳表现");
  console.log("-".repeat(90));

  const bestAccuracy = aggregateStats.reduce((a, b) => a.directionAccuracy > b.directionAccuracy ? a : b);
  const bestBrier = aggregateStats.reduce((a, b) => a.avgBrierScore < b.avgBrierScore ? a : b);
  const bestConfidence = aggregateStats.reduce((a, b) => a.avgConfidence > b.avgConfidence ? a : b);

  console.log(`  最佳方向准确率: ${bestAccuracy.version} (${bestAccuracy.directionAccuracy.toFixed(1)}%)`);
  console.log(`  最佳 Brier Score: ${bestBrier.version} (${bestBrier.avgBrierScore.toFixed(4)})`);
  console.log(`  最高平均置信度: ${bestConfidence.version} (${bestConfidence.avgConfidence.toFixed(1)}%)`);

  // ========== 详细事件结果 ==========
  console.log();
  console.log("📋 详细事件预测结果");
  console.log("-".repeat(90));

  // Header
  const headerFmt = "│ {0:.<40} {1:.>6} {2:.>6} │ {3:.>6} {4:.>6} {5:.>6} {6:.>6} {7:.>6} │";
  console.log("│ 事件                                     实际  基础  增强  Ph1   Ph2   Ph3  │");
  console.log("├" + "-".repeat(88) + "┤");

  for (const r of results) {
    const dirEmoji = r.actualDir === "up" ? "📈" : r.actualDir === "down" ? "📉" : "➡️";
    const name = r.event.name.substring(0, 36);
    const v = r.versions;

    const formatVer = (vr: VersionResult) => {
      const emoji = vr.directionCorrect ? "✅" : "❌";
      const sign = vr.calibratedPrediction > 0 ? "+" : "";
      return `${emoji}${sign}${vr.calibratedPrediction.toFixed(0)}`;
    };

    console.log(`│ ${(dirEmoji + " " + name).padEnd(40)} │ ${formatVer(v.basic)} ${formatVer(v.enhanced)} ${formatVer(v.phase1)} ${formatVer(v.phase2)} ${formatVer(v.phase3)} │`);
  }
  console.log("└" + "-".repeat(88) + "┘");

  // ========== 事件类型分析 ==========
  console.log();
  console.log("📊 按事件类型分析 (Phase 3)");
  console.log("-".repeat(90));

  const categories = [...new Set(EVENTS.map(e => e.category))];
  for (const cat of categories) {
    const catEvents = results.filter(r => r.event.category === cat);
    const catCorrect = catEvents.filter(r => r.versions.phase3.directionCorrect).length;
    const catAcc = catEvents.length > 0 ? catCorrect / catEvents.length * 100 : 0;
    console.log(`  ${cat.padEnd(20)}: ${catCorrect}/${catEvents.length} 正确 (${catAcc.toFixed(0)}%)`);
  }

  // ========== 按严重程度分析 ==========
  console.log();
  console.log("📊 按严重程度分析 (Phase 3)");
  console.log("-".repeat(90));

  const severities = [...new Set(EVENTS.map(e => e.severity))];
  const sevOrder = ["catastrophic", "extreme", "high", "medium"];
  for (const sev of sevOrder) {
    const sevEvents = results.filter(r => r.event.severity === sev);
    if (sevEvents.length === 0) continue;
    const sevCorrect = sevEvents.filter(r => r.versions.phase3.directionCorrect).length;
    const sevAcc = sevEvents.length > 0 ? sevCorrect / sevEvents.length * 100 : 0;
    const emoji = sev === "catastrophic" ? "🔴" : sev === "extreme" ? "🟠" : sev === "high" ? "🟡" : "🟢";
    console.log(`  ${emoji} ${sev.padEnd(20)}: ${sevCorrect}/${sevEvents.length} 正确 (${sevAcc.toFixed(0)}%)`);
  }

  // ========== 最佳 & 最差预测 ==========
  console.log();
  console.log("✅ 最佳预测事件 (Phase 3 方向正确，且置信度最高的 5 个)");
  console.log("-".repeat(90));

  const correctResults = results.filter(r => r.versions.phase3.directionCorrect);
  const sortedByConf = [...correctResults].sort((a, b) => b.versions.phase3.confidence - a.versions.phase3.confidence);
  for (const r of sortedByConf.slice(0, 5)) {
    console.log(`  ${r.event.name} (${r.event.date}): 预测 ${r.versions.phase3.calibratedPrediction.toFixed(0)}, 实际 ${r.actualDir}, 置信度 ${r.versions.phase3.confidence.toFixed(0)}%`);
  }

  console.log();
  console.log("❌ 最差预测事件 (Phase 3 方向错误的 5 个)");
  console.log("-".repeat(90));

  const wrongResults = results.filter(r => !r.versions.phase3.directionCorrect);
  const sortedByError = [...wrongResults].sort((a, b) => Math.abs(b.versions.phase3.calibratedPrediction) - Math.abs(a.versions.phase3.calibratedPrediction));
  for (const r of sortedByError.slice(0, 5)) {
    const predDir = r.versions.phase3.predictedDir;
    console.log(`  ${r.event.name} (${r.event.date}): 预测 ${r.versions.phase3.calibratedPrediction.toFixed(0)} (${predDir}), 实际 ${r.actualDir}, 误差极大`);
  }

  // ========== 综合评分 ==========
  console.log();
  console.log("⭐ 综合评分 (加权: 准确率 40% + Brier 30% + 反弹召回 20% + 置信度 10%)");
  console.log("-".repeat(90));

  const overallScores = aggregateStats.map(s => ({
    version: s.version,
    score: s.directionAccuracy * 0.4 + (1 - s.avgBrierScore) * 100 * 0.3 + s.reboundRecall * 0.2 + s.avgConfidence * 0.1,
  }));
  overallScores.sort((a, b) => b.score - a.score);

  for (const s of overallScores) {
    const bar = "█".repeat(Math.round(s.score / 2));
    console.log(`  ${s.version.padEnd(10)}: ${bar} ${s.score.toFixed(1)}/100`);
  }

  // ========== 关键结论 ==========
  console.log();
  console.log("=".repeat(90));
  console.log("  🔑 关键结论");
  console.log("=".repeat(90));

  const bestOverall = overallScores[0];
  const worstOverall = overallScores[overallScores.length - 1];
  const improvement = bestOverall.score - worstOverall.score;

  console.log();
  console.log(`  1. 最佳版本: ${bestOverall.version} (综合评分 ${bestOverall.score.toFixed(1)})`);
  console.log(`  2. 版本间最大差距: ${improvement.toFixed(1)} 分 (${((improvement / worstOverall.score) * 100).toFixed(0)}% 相对提升)`);
  console.log(`  3. 准确率天花板: ${aggregateStats.reduce((a, b) => a.directionAccuracy > b.directionAccuracy ? a : b).directionAccuracy.toFixed(1)}%`);
  console.log(`  4. 随机基准 (Brier): 0.2500 (Brier Skill = 1 - BS/0.25)`);

  const bestBrierSkill = 1 - bestBrier.avgBrierScore / 0.25;
  console.log(`  5. 最佳 Brier Skill Score: ${(bestBrierSkill * 100).toFixed(1)}% (相对随机基准的改进)`);

  if (bestAccuracy.directionAccuracy > 60) {
    console.log(`  6. ✅ 方向预测准确率超过 60%，具备实用价值`);
  } else if (bestAccuracy.directionAccuracy > 50) {
    console.log(`  6. ⚠️ 方向预测准确率略高于随机，需要进一步优化`);
  } else {
    console.log(`  6. ❌ 方向预测准确率不高于随机水平`);
  }

  // Phase 2/3 vs Phase 1 improvement
  const phase1Acc = aggregateStats.find(s => s.version === "Phase 1")!.directionAccuracy;
  const phase3Acc = aggregateStats.find(s => s.version === "Phase 3")!.directionAccuracy;
  console.log(`  7. Phase 1 → Phase 3 准确率提升: ${(phase3Acc - phase1Acc).toFixed(1)} 个百分点`);

  console.log();
  console.log("=".repeat(90));
  console.log("  测试完成");
  console.log("=".repeat(90));

  return { results, aggregateStats, overallScores };
}

// Run
runAllTests();
