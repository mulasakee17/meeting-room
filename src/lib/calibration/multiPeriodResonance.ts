/**
 * 多周期共振分析模块
 * 
 * 功能：
 * 1. 分析日、周、月级别的趋势一致性
 * 2. 识别多周期共振信号
 * 3. 提高反转点预测准确性
 */

// ==================== 类型定义 ====================

export enum TrendDirection {
  UP = 'UP',
  DOWN = 'DOWN',
  NEUTRAL = 'NEUTRAL',
}

export enum ResonanceLevel {
  STRONG_BULLISH = 'STRONG_BULLISH',    // 强烈看多共振
  BULLISH = 'BULLISH',                   // 看多共振
  NEUTRAL = 'NEUTRAL',                   // 无共振
  BEARISH = 'BEARISH',                   // 看空共振
  STRONG_BEARISH = 'STRONG_BEARISH',    // 强烈看空共振
  DIVERGENCE = 'DIVERGENCE',             // 周期背离
}

export interface PeriodAnalysis {
  period: 'daily' | 'weekly' | 'monthly';
  trend: TrendDirection;
  strength: number;        // 0-100
  confidence: number;      // 0-100
  indicators: {
    maTrend: TrendDirection;
    rsiLevel: number;
    macdSignal: 'bullish' | 'bearish' | 'neutral';
    momentumDirection: TrendDirection;
  };
}

export interface ResonanceResult {
  level: ResonanceLevel;
  score: number;           // -100 to 100
  confidence: number;      // 0-100
  periods: {
    daily: PeriodAnalysis;
    weekly: PeriodAnalysis;
    monthly: PeriodAnalysis;
  };
  signals: {
    isResonance: boolean;
    isDivergence: boolean;
    dominantPeriod: 'daily' | 'weekly' | 'monthly';
    conflictingPeriods: string[];
  };
  recommendation: {
    action: 'buy' | 'sell' | 'hold';
    strength: number;
    reasoning: string;
  };
}

// ==================== 多周期分析函数 ====================

/**
 * 分析单个周期的趋势
 */
export function analyzePeriodTrend(
  prices: number[],
  period: 'daily' | 'weekly' | 'monthly'
): PeriodAnalysis {
  // 根据周期调整窗口大小
  const windowSize = period === 'daily' ? 20 : period === 'weekly' ? 5 : 3;
  
  if (prices.length < windowSize) {
    return {
      period,
      trend: TrendDirection.NEUTRAL,
      strength: 0,
      confidence: 0,
      indicators: {
        maTrend: TrendDirection.NEUTRAL,
        rsiLevel: 50,
        macdSignal: 'neutral',
        momentumDirection: TrendDirection.NEUTRAL,
      },
    };
  }

  // 计算移动平均趋势
  const recentPrices = prices.slice(-windowSize);
  const maShort = recentPrices.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const maLong = recentPrices.reduce((a, b) => a + b, 0) / windowSize;
  
  let maTrend: TrendDirection = TrendDirection.NEUTRAL;
  if (maShort > maLong * 1.02) maTrend = TrendDirection.UP;
  else if (maShort < maLong * 0.98) maTrend = TrendDirection.DOWN;

  // 计算 RSI
  const rsi = calculateRSI(recentPrices);

  // 计算 MACD 信号
  const macdSignal = calculateMACDSignal(prices);

  // 计算动量方向
  const momentum = (prices[prices.length - 1] - prices[prices.length - windowSize]) / prices[prices.length - windowSize];
  let momentumDirection: TrendDirection = TrendDirection.NEUTRAL;
  if (momentum > 0.02) momentumDirection = TrendDirection.UP;
  else if (momentum < -0.02) momentumDirection = TrendDirection.DOWN;

  // 综合趋势判断
  const trendVotes = [maTrend, momentumDirection];
  const upVotes = trendVotes.filter(t => t === TrendDirection.UP).length;
  const downVotes = trendVotes.filter(t => t === TrendDirection.DOWN).length;

  let trend: TrendDirection = TrendDirection.NEUTRAL;
  let strength = 0;

  if (upVotes >= 2) {
    trend = TrendDirection.UP;
    strength = 60 + (maShort / maLong - 1) * 1000;
  } else if (downVotes >= 2) {
    trend = TrendDirection.DOWN;
    strength = 60 + (1 - maShort / maLong) * 1000;
  } else {
    trend = TrendDirection.NEUTRAL;
    strength = 30;
  }

  // 置信度基于指标一致性
  const confidence = Math.min(100, strength + (upVotes + downVotes === 2 ? 20 : 0));

  return {
    period,
    trend,
    strength: Math.min(100, Math.max(0, strength)),
    confidence,
    indicators: {
      maTrend,
      rsiLevel: rsi,
      macdSignal,
      momentumDirection,
    },
  };
}

/**
 * 计算多周期共振
 */
export function calculateResonance(
  dailyPrices: number[],
  weeklyPrices: number[],
  monthlyPrices: number[]
): ResonanceResult {
  // 分析各周期
  const daily = analyzePeriodTrend(dailyPrices, 'daily');
  const weekly = analyzePeriodTrend(weeklyPrices, 'weekly');
  const monthly = analyzePeriodTrend(monthlyPrices, 'monthly');

  // 计算共振分数
  const trendValues = {
    [TrendDirection.UP]: 1,
    [TrendDirection.DOWN]: -1,
    [TrendDirection.NEUTRAL]: 0,
  };

  const weightedScore = 
    trendValues[daily.trend] * daily.strength * 0.4 +
    trendValues[weekly.trend] * weekly.strength * 0.35 +
    trendValues[monthly.trend] * monthly.strength * 0.25;

  // 判断共振级别
  let level: ResonanceLevel;
  let isResonance = false;
  let isDivergence = false;

  // 检查周期一致性
  const trends = [daily.trend, weekly.trend, monthly.trend];
  const allUp = trends.every(t => t === TrendDirection.UP);
  const allDown = trends.every(t => t === TrendDirection.DOWN);
  const allNeutral = trends.every(t => t === TrendDirection.NEUTRAL);

  // 检查背离
  const hasUpAndDown = trends.includes(TrendDirection.UP) && trends.includes(TrendDirection.DOWN);

  if (allUp) {
    level = weightedScore > 60 ? ResonanceLevel.STRONG_BULLISH : ResonanceLevel.BULLISH;
    isResonance = true;
  } else if (allDown) {
    level = weightedScore < -60 ? ResonanceLevel.STRONG_BEARISH : ResonanceLevel.BEARISH;
    isResonance = true;
  } else if (hasUpAndDown) {
    level = ResonanceLevel.DIVERGENCE;
    isDivergence = true;
  } else {
    level = ResonanceLevel.NEUTRAL;
  }

  // 确定主导周期
  const periodStrengths = [
    { period: 'daily', strength: daily.strength * daily.confidence },
    { period: 'weekly', strength: weekly.strength * weekly.confidence },
    { period: 'monthly', strength: monthly.strength * monthly.confidence },
  ];
  const dominantPeriod = periodStrengths.reduce((prev, curr) => 
    curr.strength > prev.strength ? curr : prev
  ).period as 'daily' | 'weekly' | 'monthly';

  // 识别冲突周期
  const conflictingPeriods: string[] = [];
  if (daily.trend !== weekly.trend && daily.trend !== TrendDirection.NEUTRAL && weekly.trend !== TrendDirection.NEUTRAL) {
    conflictingPeriods.push('daily-weekly');
  }
  if (weekly.trend !== monthly.trend && weekly.trend !== TrendDirection.NEUTRAL && monthly.trend !== TrendDirection.NEUTRAL) {
    conflictingPeriods.push('weekly-monthly');
  }
  if (daily.trend !== monthly.trend && daily.trend !== TrendDirection.NEUTRAL && monthly.trend !== TrendDirection.NEUTRAL) {
    conflictingPeriods.push('daily-monthly');
  }

  // 置信度计算
  const confidence = isResonance ? 
    (daily.confidence + weekly.confidence + monthly.confidence) / 3 * 1.2 :
    isDivergence ? 40 : 60;

  // 生成交易建议
  let action: 'buy' | 'sell' | 'hold' = 'hold';
  let strength = 0;
  let reasoning = '';

  if (level === ResonanceLevel.STRONG_BULLISH) {
    action = 'buy';
    strength = 80;
    reasoning = '多周期强烈看多共振，日、周、月趋势一致向上';
  } else if (level === ResonanceLevel.BULLISH) {
    action = 'buy';
    strength = 60;
    reasoning = '多周期看多共振，建议逢低买入';
  } else if (level === ResonanceLevel.STRONG_BEARISH) {
    action = 'sell';
    strength = 80;
    reasoning = '多周期强烈看空共振，日、周、月趋势一致向下';
  } else if (level === ResonanceLevel.BEARISH) {
    action = 'sell';
    strength = 60;
    reasoning = '多周期看空共振，建议减仓或观望';
  } else if (level === ResonanceLevel.DIVERGENCE) {
    action = 'hold';
    strength = 30;
    reasoning = `周期背离：${conflictingPeriods.join(', ')}，趋势不明，建议观望`;
  } else {
    action = 'hold';
    strength = 40;
    reasoning = '无明确共振信号，建议观望';
  }

  return {
    level,
    score: weightedScore,
    confidence: Math.min(100, confidence),
    periods: { daily, weekly, monthly },
    signals: {
      isResonance,
      isDivergence,
      dominantPeriod,
      conflictingPeriods,
    },
    recommendation: {
      action,
      strength,
      reasoning,
    },
  };
}

// ==================== 辅助函数 ====================

/**
 * 计算 RSI
 */
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

/**
 * 计算 MACD 信号
 */
function calculateMACDSignal(prices: number[]): 'bullish' | 'bearish' | 'neutral' {
  if (prices.length < 26) return 'neutral';

  // EMA12
  const ema12Multiplier = 2 / 13;
  let ema12 = prices.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  for (let i = 12; i < prices.length; i++) {
    ema12 = (prices[i] - ema12) * ema12Multiplier + ema12;
  }

  // EMA26
  const ema26Multiplier = 2 / 27;
  let ema26 = prices.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
  for (let i = 26; i < prices.length; i++) {
    ema26 = (prices[i] - ema26) * ema26Multiplier + ema26;
  }

  const macd = ema12 - ema26;

  if (macd > 0) return 'bullish';
  if (macd < 0) return 'bearish';
  return 'neutral';
}

/**
 * 从日价格生成周价格
 */
export function generateWeeklyPrices(dailyPrices: number[]): number[] {
  const weeklyPrices: number[] = [];
  
  for (let i = 0; i < dailyPrices.length; i += 5) {
    const weekPrices = dailyPrices.slice(i, i + 5);
    if (weekPrices.length > 0) {
      weeklyPrices.push(weekPrices.reduce((a, b) => a + b, 0) / weekPrices.length);
    }
  }
  
  return weeklyPrices;
}

/**
 * 从日价格生成月价格
 */
export function generateMonthlyPrices(dailyPrices: number[]): number[] {
  const monthlyPrices: number[] = [];
  
  for (let i = 0; i < dailyPrices.length; i += 20) {
    const monthPrices = dailyPrices.slice(i, i + 20);
    if (monthPrices.length > 0) {
      monthlyPrices.push(monthPrices.reduce((a, b) => a + b, 0) / monthPrices.length);
    }
  }
  
  return monthlyPrices;
}

/**
 * 获取共振信号强度描述
 */
export function getResonanceDescription(result: ResonanceResult): string {
  const descriptions: Record<ResonanceLevel, string> = {
    [ResonanceLevel.STRONG_BULLISH]: '🔥 强烈看多共振 - 日/周/月趋势一致向上，强烈买入信号',
    [ResonanceLevel.BULLISH]: '📈 看多共振 - 多周期看多，建议逢低买入',
    [ResonanceLevel.NEUTRAL]: '➡️ 无共振 - 周期信号不明确，建议观望',
    [ResonanceLevel.BEARISH]: '📉 看空共振 - 多周期看空，建议减仓',
    [ResonanceLevel.STRONG_BEARISH]: '⚠️ 强烈看空共振 - 日/周/月趋势一致向下，强烈卖出信号',
    [ResonanceLevel.DIVERGENCE]: '🔀 周期背离 - 不同周期趋势冲突，风险较高',
  };

  return descriptions[result.level];
}

// ==================== 导出 ====================

// 所有函数和枚举已在定义时导出