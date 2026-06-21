/**
 * 技术指标计算模块
 * 
 * 提供以下技术指标：
 * 1. 移动平均线 (MA)
 * 2. 指数移动平均线 (EMA)
 * 3. MACD
 * 4. RSI
 * 5. 布林带 (Bollinger Bands)
 * 6. KDJ 随机指标
 * 7. 成交量指标
 * 8. 均线系统分析
 */

// ==================== 类型定义 ====================

export interface PriceData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MovingAverage {
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
}

export interface MACD {
  macd: number;
  signal: number;
  histogram: number;
  crossover: 'bullish' | 'bearish' | 'neutral';
}

export interface RSI {
  value: number;
  overbought: boolean;
  oversold: boolean;
}

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  position: number; // 0-1,价格在布林带中的位置
}

export interface KDJ {
  k: number;
  d: number;
  j: number;
  crossover: 'bullish' | 'bearish' | 'neutral';
}

export interface VolumeAnalysis {
  volume: number;
  avgVolume5: number;
  avgVolume20: number;
  volumeRatio: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface TechnicalIndicators {
  movingAverage: MovingAverage;
  macd: MACD;
  rsi: RSI;
  bollingerBands: BollingerBands;
  kdj: KDJ;
  volumeAnalysis: VolumeAnalysis;
  trend: 'bullish' | 'bearish' | 'neutral';
  strength: number; // -1 到 1 的强度值
}

export interface TechnicalSignal {
  indicator: string;
  signal: 'buy' | 'sell' | 'neutral';
  strength: number; // 0-1
  description: string;
}

// ==================== 辅助函数 ====================

/**
 * 计算简单移动平均
 */
export function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, price) => sum + price, 0) / period;
}

/**
 * 计算指数移动平均
 */
export function calculateEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  
  const multiplier = 2 / (period + 1);
  let ema = calculateSMA(prices.slice(0, period), period);
  
  if (ema === null) return null;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

/**
 * 计算标准差
 */
export function calculateStdDev(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  
  const slice = prices.slice(-period);
  const mean = slice.reduce((sum, p) => sum + p, 0) / period;
  const squaredDiffs = slice.map(p => Math.pow(p - mean, 2));
  const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / period;
  
  return Math.sqrt(variance);
}

// ==================== 技术指标计算 ====================

/**
 * 计算移动平均线
 */
export function calculateMovingAverage(prices: number[]): MovingAverage {
  return {
    ma5: calculateSMA(prices, 5),
    ma10: calculateSMA(prices, 10),
    ma20: calculateSMA(prices, 20),
    ma60: calculateSMA(prices, 60),
    ma120: calculateSMA(prices, 120),
  };
}

/**
 * 计算 MACD
 * 
 * MACD = 12日EMA - 26日EMA
 * Signal = MACD的9日EMA
 * Histogram = MACD - Signal
 */
export function calculateMACD(prices: number[]): MACD {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  
  if (ema12 === null || ema26 === null) {
    return {
      macd: 0,
      signal: 0,
      histogram: 0,
      crossover: 'neutral',
    };
  }
  
  const macdLine = ema12 - ema26;
  
  // 计算 MACD 的 EMA (Signal Line)
  const macdValues: number[] = [];
  for (let i = 25; i < prices.length; i++) {
    const e12 = calculateEMA(prices.slice(0, i + 1), 12);
    const e26 = calculateEMA(prices.slice(0, i + 1), 26);
    if (e12 !== null && e26 !== null) {
      macdValues.push(e12 - e26);
    }
  }
  
  const signal = calculateEMA(macdValues, 9) ?? 0;
  const histogram = macdLine - signal;
  
  // 检测交叉
  let crossover: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (macdValues.length >= 2) {
    const prevMacd = macdValues[macdValues.length - 2];
    const currMacd = macdValues[macdValues.length - 1];
    const prevSignal = calculateEMA(macdValues.slice(0, -1), 9) ?? signal;
    
    if (prevMacd < prevSignal && currMacd > signal) {
      crossover = 'bullish';
    } else if (prevMacd > prevSignal && currMacd < signal) {
      crossover = 'bearish';
    }
  }
  
  return {
    macd: macdLine,
    signal,
    histogram,
    crossover,
  };
}

/**
 * 计算 RSI
 * 
 * RSI = 100 - (100 / (1 + RS))
 * RS = 平均涨幅 / 平均跌幅
 */
export function calculateRSI(prices: number[], period: number = 14): RSI {
  if (prices.length < period + 1) {
    return { value: 50, overbought: false, oversold: false };
  }
  
  let gains = 0;
  let losses = 0;
  
  // 计算价格变化
  const changes: number[] = [];
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    changes.push(change);
    
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) {
    return { value: 100, overbought: true, oversold: false };
  }
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  return {
    value: Math.round(rsi * 100) / 100,
    overbought: rsi > 70,
    oversold: rsi < 30,
  };
}

/**
 * 计算布林带
 * 
 * 中轨 = 20日MA
 * 上轨 = 中轨 + 2倍标准差
 * 下轨 = 中轨 - 2倍标准差
 */
export function calculateBollingerBands(prices: number[], period: number = 20): BollingerBands {
  const middle = calculateSMA(prices, period);
  const stdDev = calculateStdDev(prices, period);
  
  if (middle === null || stdDev === null) {
    return {
      upper: 0,
      middle: 0,
      lower: 0,
      bandwidth: 0,
      position: 0.5,
    };
  }
  
  const upper = middle + 2 * stdDev;
  const lower = middle - 2 * stdDev;
  const bandwidth = (upper - lower) / middle;
  
  // 计算价格在布林带中的位置
  const currentPrice = prices[prices.length - 1];
  const position = (currentPrice - lower) / (upper - lower);
  
  return {
    upper,
    middle,
    lower,
    bandwidth: Math.round(bandwidth * 1000) / 1000,
    position: Math.max(0, Math.min(1, position)),
  };
}

/**
 * 计算 KDJ 随机指标
 * 
 * RSV = (收盘价 - N日内最低价) / (N日内最高价 - N日内最低价) × 100
 * K = 2/3 × 前一日K值 + 1/3 × 当日RSV
 * D = 2/3 × 前一日D值 + 1/3 × 当日K值
 * J = 3 × K - 2 × D
 */
export function calculateKDJ(prices: number[], period: number = 9): KDJ {
  if (prices.length < period) {
    return { k: 50, d: 50, j: 50, crossover: 'neutral' };
  }
  
  const highs: number[] = [];
  const lows: number[] = [];
  
  // 计算过去 N 天的最高价和最低价
  for (let i = prices.length - period; i < prices.length; i++) {
    // 简化：使用价格数组计算
    highs.push(prices[i]);
    lows.push(prices[i]);
  }
  
  const highestHigh = Math.max(...highs);
  const lowestLow = Math.min(...lows);
  
  if (highestHigh === lowestLow) {
    return { k: 50, d: 50, j: 50, crossover: 'neutral' };
  }
  
  const latestPrice = prices[prices.length - 1];
  const rsv = ((latestPrice - lowestLow) / (highestHigh - lowestLow)) * 100;
  
  // 简化计算：使用固定权重
  const k = 0.3 * rsv + 50;
  const d = 0.3 * k + 50;
  const j = 3 * k - 2 * d;
  
  // 检测交叉
  let crossover: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (prices.length >= period + 1) {
    // 简化检测逻辑
    const prevK = 0.3 * rsv + 40;
    const prevD = 0.3 * prevK + 50;
    
    if (prevK < prevD && k > d) {
      crossover = 'bullish';
    } else if (prevK > prevD && k < d) {
      crossover = 'bearish';
    }
  }
  
  return {
    k: Math.round(k * 100) / 100,
    d: Math.round(d * 100) / 100,
    j: Math.round(j * 100) / 100,
    crossover,
  };
}

/**
 * 分析成交量
 */
export function analyzeVolume(volumes: number[]): VolumeAnalysis {
  if (volumes.length < 20) {
    return {
      volume: volumes[volumes.length - 1] || 0,
      avgVolume5: 0,
      avgVolume20: 0,
      volumeRatio: 1,
      trend: 'stable',
    };
  }
  
  const currentVolume = volumes[volumes.length - 1];
  const avgVolume5 = calculateSMA(volumes, 5) ?? 0;
  const avgVolume20 = calculateSMA(volumes, 20) ?? 0;
  
  const volumeRatio = avgVolume20 > 0 ? currentVolume / avgVolume20 : 1;
  
  // 分析成交量趋势
  const recentVolumes = volumes.slice(-5);
  const prevVolumes = volumes.slice(-10, -5);
  
  const recentAvg = recentVolumes.reduce((a, b) => a + b, 0) / 5;
  const prevAvg = prevVolumes.reduce((a, b) => a + b, 0) / 5;
  
  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (recentAvg > prevAvg * 1.2) {
    trend = 'increasing';
  } else if (recentAvg < prevAvg * 0.8) {
    trend = 'decreasing';
  }
  
  return {
    volume: currentVolume,
    avgVolume5,
    avgVolume20,
    volumeRatio: Math.round(volumeRatio * 100) / 100,
    trend,
  };
}

// ==================== 综合分析 ====================

/**
 * 计算所有技术指标
 */
export function calculateAllIndicators(
  prices: number[],
  volumes: number[] = []
): TechnicalIndicators {
  const movingAverage = calculateMovingAverage(prices);
  const macd = calculateMACD(prices);
  const rsi = calculateRSI(prices);
  const bollingerBands = calculateBollingerBands(prices);
  const kdj = calculateKDJ(prices);
  const volumeAnalysis = volumes.length > 0 ? analyzeVolume(volumes) : analyzeVolume(prices.map(() => 1));
  
  // 计算综合趋势
  const trend = calculateTrend(movingAverage, macd, rsi, kdj);
  
  // 计算综合强度
  const strength = calculateStrength(macd, rsi, kdj, bollingerBands, volumeAnalysis);
  
  return {
    movingAverage,
    macd,
    rsi,
    bollingerBands,
    kdj,
    volumeAnalysis,
    trend,
    strength,
  };
}

/**
 * 计算综合趋势
 */
function calculateTrend(
  ma: MovingAverage,
  macd: MACD,
  rsi: RSI,
  kdj: KDJ
): 'bullish' | 'bearish' | 'neutral' {
  let bullishSignals = 0;
  let bearishSignals = 0;
  
  const price = ma.ma20 || 0;
  
  // MA 趋势
  if (ma.ma5 && ma.ma10 && ma.ma20) {
    if (ma.ma5 > ma.ma10 && ma.ma10 > ma.ma20) bullishSignals += 2;
    else if (ma.ma5 < ma.ma10 && ma.ma10 < ma.ma20) bearishSignals += 2;
  }
  
  // 价格与均线关系
  if (ma.ma20) {
    if (price > ma.ma20) bullishSignals++;
    else bearishSignals++;
  }
  
  // MACD 趋势
  if (macd.histogram > 0) bullishSignals++;
  else if (macd.histogram < 0) bearishSignals++;
  
  // RSI 趋势
  if (rsi.value > 50) bullishSignals++;
  else if (rsi.value < 50) bearishSignals++;
  
  // KDJ 趋势
  if (kdj.k > kdj.d) bullishSignals++;
  else if (kdj.k < kdj.d) bearishSignals++;
  
  // 综合判断
  if (bullishSignals > bearishSignals + 2) return 'bullish';
  if (bearishSignals > bullishSignals + 2) return 'bearish';
  return 'neutral';
}

/**
 * 计算综合强度 (-1 到 1)
 */
function calculateStrength(
  macd: MACD,
  rsi: RSI,
  kdj: KDJ,
  bollinger: BollingerBands,
  volume: VolumeAnalysis
): number {
  let strength = 0;
  
  // MACD 强度 (-0.3 到 0.3)
  const macdStrength = Math.min(0.3, Math.max(-0.3, macd.histogram / 10));
  strength += macdStrength;
  
  // RSI 强度 (-0.3 到 0.3)
  const rsiStrength = (rsi.value - 50) / 100;
  strength += rsiStrength * 0.6;
  
  // KDJ 强度 (-0.2 到 0.2)
  const kdjStrength = (kdj.k - 50) / 100;
  strength += kdjStrength * 0.4;
  
  // 布林带位置强度 (-0.1 到 0.1)
  const bbStrength = (volume.position - 0.5) / 5;
  strength += bbStrength;
  
  // 成交量放大强度 (-0.2 到 0.2)
  const volumeStrength = Math.min(0.2, Math.max(-0.2, (volume.volumeRatio - 1) * 0.2));
  strength += volumeStrength;
  
  // 归一化到 -1 到 1
  return Math.max(-1, Math.min(1, Math.round(strength * 100) / 100));
}

/**
 * 生成技术分析信号
 */
export function generateTechnicalSignals(
  prices: number[],
  volumes: number[] = []
): TechnicalSignal[] {
  const indicators = calculateAllIndicators(prices, volumes);
  const signals: TechnicalSignal[] = [];
  
  // MA 交叉信号
  if (indicators.movingAverage.ma5 && indicators.movingAverage.ma10) {
    if (indicators.movingAverage.ma5 > indicators.movingAverage.ma10) {
      signals.push({
        indicator: 'MA金叉',
        signal: 'buy',
        strength: 0.7,
        description: '5日均线向上穿越10日均线，短期看多',
      });
    } else {
      signals.push({
        indicator: 'MA死叉',
        signal: 'sell',
        strength: 0.7,
        description: '5日均线向下穿越10日均线，短期看空',
      });
    }
  }
  
  // MACD 信号
  if (indicators.macd.crossover === 'bullish') {
    signals.push({
      indicator: 'MACD金叉',
      signal: 'buy',
      strength: 0.8,
      description: 'MACD线向上穿越信号线，看多信号',
    });
  } else if (indicators.macd.crossover === 'bearish') {
    signals.push({
      indicator: 'MACD死叉',
      signal: 'sell',
      strength: 0.8,
      description: 'MACD线向下穿越信号线，看空信号',
    });
  }
  
  // RSI 信号
  if (indicators.rsi.oversold) {
    signals.push({
      indicator: 'RSI超卖',
      signal: 'buy',
      strength: 0.6,
      description: 'RSI低于30，市场可能超卖，关注反弹机会',
    });
  } else if (indicators.rsi.overbought) {
    signals.push({
      indicator: 'RSI超买',
      signal: 'sell',
      strength: 0.6,
      description: 'RSI高于70，市场可能超买，注意回调风险',
    });
  }
  
  // KDJ 信号
  if (indicators.kdj.crossover === 'bullish') {
    signals.push({
      indicator: 'KDJ金叉',
      signal: 'buy',
      strength: 0.65,
      description: 'KDJ指标形成金叉，短期买入信号',
    });
  } else if (indicators.kdj.crossover === 'bearish') {
    signals.push({
      indicator: 'KDJ死叉',
      signal: 'sell',
      strength: 0.65,
      description: 'KDJ指标形成死叉，短期卖出信号',
    });
  }
  
  // 布林带信号
  if (indicators.bollingerBands.position < 0.2) {
    signals.push({
      indicator: '布林下轨',
      signal: 'buy',
      strength: 0.5,
      description: '价格触及布林带下轨，可能存在支撑',
    });
  } else if (indicators.bollingerBands.position > 0.8) {
    signals.push({
      indicator: '布林上轨',
      signal: 'sell',
      strength: 0.5,
      description: '价格触及布林带上轨，可能存在压力',
    });
  }
  
  // 成交量信号
  if (indicators.volumeAnalysis.trend === 'increasing') {
    signals.push({
      indicator: '成交量放大',
      signal: indicators.trend === 'bullish' ? 'buy' : 'sell',
      strength: 0.55,
      description: '成交量较前期明显放大，确认趋势',
    });
  }
  
  return signals;
}

// ==================== 格式化输出 ====================

/**
 * 格式化技术指标为人类可读的字符串
 */
export function formatIndicators(indicators: TechnicalIndicators): string {
  const lines: string[] = [];
  
  lines.push('📊 **技术指标分析**');
  lines.push('');
  
  // 均线系统
  lines.push('**均线系统：**');
  const ma = indicators.movingAverage;
  if (ma.ma5) {
    lines.push(`- MA5: ${ma.ma5.toFixed(2)}`);
  }
  if (ma.ma10) {
    lines.push(`- MA10: ${ma.ma10.toFixed(2)}`);
  }
  if (ma.ma20) {
    lines.push(`- MA20: ${ma.ma20.toFixed(2)}`);
  }
  lines.push('');
  
  // MACD
  lines.push('**MACD：**');
  lines.push(`- DIF: ${indicators.macd.macd.toFixed(2)}`);
  lines.push(`- DEA: ${indicators.macd.signal.toFixed(2)}`);
  lines.push(`- MACD柱: ${indicators.macd.histogram.toFixed(2)}`);
  lines.push(`- 交叉信号: ${indicators.macd.crossover === 'bullish' ? '🐂 金叉' : indicators.macd.crossover === 'bearish' ? '🐻 死叉' : '➡️ 中性'}`);
  lines.push('');
  
  // RSI
  lines.push('**RSI：**');
  lines.push(`- 当前值: ${indicators.rsi.value}`);
  lines.push(`- 状态: ${indicators.rsi.oversold ? '🔵 超卖' : indicators.rsi.overbought ? '🔴 超买' : '🟢 正常'}`);
  lines.push('');
  
  // KDJ
  lines.push('**KDJ：**');
  lines.push(`- K: ${indicators.kdj.k.toFixed(2)}`);
  lines.push(`- D: ${indicators.kdj.d.toFixed(2)}`);
  lines.push(`- J: ${indicators.kdj.j.toFixed(2)}`);
  lines.push('');
  
  // 布林带
  lines.push('**布林带：**');
  lines.push(`- 上轨: ${indicators.bollingerBands.upper.toFixed(2)}`);
  lines.push(`- 中轨: ${indicators.bollingerBands.middle.toFixed(2)}`);
  lines.push(`- 下轨: ${indicators.bollingerBands.lower.toFixed(2)}`);
  lines.push(`- 位置: ${(indicators.bollingerBands.position * 100).toFixed(1)}%`);
  lines.push('');
  
  // 综合判断
  lines.push('**综合判断：**');
  lines.push(`- 趋势: ${indicators.trend === 'bullish' ? '🐂 看多' : indicators.trend === 'bearish' ? '🐻 看空' : '➡️ 中性'}`);
  lines.push(`- 强度: ${(indicators.strength * 100).toFixed(0)}%`);
  
  return lines.join('\n');
}
