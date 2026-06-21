/**
 * 增强版预测校准模块 - 进一步优化反弹预测和反转检测
 * 
 * 新增优化：
 * 1. 增强反弹预测逻辑 - 多维度超跌反弹检测
 * 2. 反转信号检测 - 基于动量反转和价格形态
 * 3. 真实历史技术指标数据集成
 * 4. 多因子融合优化 - 动态权重调整
 * 5. 历史相似事件深度匹配
 */

// ==================== 类型定义 ====================

export interface EnhancedMarketState {
  price: number;
  previousPrice: number;
  priceHistory: number[];
  volume: number;
  volumeHistory: number[];
  vix: number;
  rsi: number;
  rsiHistory: number[];
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  momentum: number;
  momentumHistory: number[];
  volatility: number;
  volatilityHistory: number[];
  sentiment: number;
  // 新增指标
  bollingerUpper: number;
  bollingerMiddle: number;
  bollingerLower: number;
  bollingerPosition: number; // 0-100, 当前价格在布林带中的位置
  atr: number; // Average True Range
  obv: number; // On-Balance Volume
  williamsR: number;
  cci: number; // Commodity Channel Index
}

export interface EnhancedCalibrationConfig {
  // 极端事件放大因子
  extremeEventThreshold: number;
  extremeAmplificationFactor: number;
  
  // 增强的超跌反弹检测
  oversoldThreshold: number;           // RSI超卖阈值（降低到25）
  oversoldReboundProbability: number;
  oversoldConfirmationFactors: {
    rsiWeight: number;
    bollingerWeight: number;
    williamsRWeight: number;
    cciWeight: number;
    volumeWeight: number;
  };
  
  // 反转信号检测
  reversalDetectionEnabled: boolean;
  reversalThreshold: number;
  reversalConfirmationFactors: {
    momentumReversalWeight: number;
    macdDivergenceWeight: number;
    volumeSpikeWeight: number;
    pricePatternWeight: number;
  };
  
  // 动量权重
  momentumWeight: number;
  
  // 波动率权重
  volatilityWeight: number;
  
  // 多因子融合
  multiFactorFusionEnabled: boolean;
  dynamicWeightAdjustment: boolean;
}

export interface EnhancedCalibratedPrediction {
  originalPrediction: number;
  calibratedPrediction: number;
  confidence: number;
  factors: {
    extremeEventFactor: number;
    oversoldReboundFactor: number;
    momentumFactor: number;
    volatilityFactor: number;
    historicalSimilarityFactor: number;
    reversalSignalFactor: number;      // 新增
    volumeAnomalyFactor: number;       // 新增
    bollingerFactor: number;           // 新增
    multiFactorFusionScore: number;    // 新增
  };
  signals: {
    isExtremeEvent: boolean;
    isOversold: boolean;
    isReversalLikely: boolean;
    isVolumeAnomaly: boolean;
    isBollingerBreakout: boolean;
    momentumDirection: 'up' | 'down' | 'neutral';
    reversalType: 'bounce' | 'correction' | 'trend_reversal' | 'none';
    predictedAction: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  };
  probabilityDistribution: {
    upProbability: number;
    downProbability: number;
    sidewaysProbability: number;
  };
}

// ==================== 默认配置 ====================

export const ENHANCED_CALIBRATION_CONFIG: EnhancedCalibrationConfig = {
  extremeEventThreshold: 30,
  extremeAmplificationFactor: 3.0,
  
  oversoldThreshold: 25,           // 降低阈值，更敏感
  oversoldReboundProbability: 0.65, // 提高反弹概率
  oversoldConfirmationFactors: {
    rsiWeight: 0.3,
    bollingerWeight: 0.25,
    williamsRWeight: 0.2,
    cciWeight: 0.15,
    volumeWeight: 0.1,
  },
  
  reversalDetectionEnabled: true,
  reversalThreshold: 0.05,
  reversalConfirmationFactors: {
    momentumReversalWeight: 0.35,
    macdDivergenceWeight: 0.25,
    volumeSpikeWeight: 0.2,
    pricePatternWeight: 0.2,
  },
  
  momentumWeight: 0.15,
  volatilityWeight: 0.10,
  
  multiFactorFusionEnabled: true,
  dynamicWeightAdjustment: true,
};

// ==================== 增强的历史数据 ====================

export interface EnhancedHistoricalBlackSwan {
  name: string;
  date: string;
  severity: 'catastrophic' | 'extreme' | 'high' | 'medium';
  category: 'financial' | 'geopolitical' | 'pandemic' | 'natural_disaster' | 'regulatory' | 'tech';
  initialDrop: number;
  totalDrop: number;
  recoveryDays: number;
  vixPeak: number;
  rsiLow: number;
  rsiRecoveryDays: number;          // RSI恢复天数
  reboundProbability: number;
  reboundMagnitude: number;         // 反弹幅度
  reversalPatterns: string[];       // 反转形态
  volumeSpikeRatio: number;         // 成交量放大倍数
}

export const ENHANCED_HISTORICAL_BLACK_SWANS: EnhancedHistoricalBlackSwan[] = [
  {
    name: '2008年雷曼兄弟破产',
    date: '2008-09-15',
    severity: 'catastrophic',
    category: 'financial',
    initialDrop: -4.7,
    totalDrop: -38.5,
    recoveryDays: 180,
    vixPeak: 80.86,
    rsiLow: 15,
    rsiRecoveryDays: 30,
    reboundProbability: 0.3,
    reboundMagnitude: 8,
    reversalPatterns: ['V型反转', '双底'],
    volumeSpikeRatio: 3.5,
  },
  {
    name: '2020年新冠疫情爆发',
    date: '2020-03-09',
    severity: 'catastrophic',
    category: 'pandemic',
    initialDrop: -12.9,
    totalDrop: -38,
    recoveryDays: 90,
    vixPeak: 82.69,
    rsiLow: 18,
    rsiRecoveryDays: 14,
    reboundProbability: 0.65,       // 提高反弹概率
    reboundMagnitude: 15,           // 大幅反弹
    reversalPatterns: ['急跌急涨', 'V型反转', '政策底'],
    volumeSpikeRatio: 4.2,
  },
  {
    name: '2010年闪电崩盘',
    date: '2010-05-06',
    severity: 'extreme',
    category: 'financial',
    initialDrop: -9.0,
    totalDrop: -9.0,
    recoveryDays: 1,
    vixPeak: 40.0,
    rsiLow: 25,
    rsiRecoveryDays: 1,
    reboundProbability: 0.85,       // 极高反弹概率
    reboundMagnitude: 9,
    reversalPatterns: ['瞬间反转', '程序化反弹'],
    volumeSpikeRatio: 2.8,
  },
  {
    name: '2015年中国A股股灾',
    date: '2015-06-12',
    severity: 'extreme',
    category: 'financial',
    initialDrop: -6.5,
    totalDrop: -45,
    recoveryDays: 120,
    vixPeak: 35.0,
    rsiLow: 20,
    rsiRecoveryDays: 45,
    reboundProbability: 0.4,
    reboundMagnitude: 12,
    reversalPatterns: ['政策救市', '国家队入场'],
    volumeSpikeRatio: 3.0,
  },
  {
    name: '2022年俄乌战争爆发',
    date: '2022-02-24',
    severity: 'extreme',
    category: 'geopolitical',
    initialDrop: -2.5,
    totalDrop: -10,
    recoveryDays: 30,
    vixPeak: 38.0,
    rsiLow: 28,
    rsiRecoveryDays: 10,
    reboundProbability: 0.75,
    reboundMagnitude: 8,
    reversalPatterns: ['地缘政治缓和', '能源价格企稳'],
    volumeSpikeRatio: 2.5,
  },
  {
    name: '2023年硅谷银行破产',
    date: '2023-03-10',
    severity: 'high',
    category: 'financial',
    initialDrop: -1.8,
    totalDrop: -5,
    recoveryDays: 14,
    vixPeak: 32.0,
    rsiLow: 30,
    rsiRecoveryDays: 7,
    reboundProbability: 0.8,
    reboundMagnitude: 5,
    reversalPatterns: ['美联储干预', '存款担保'],
    volumeSpikeRatio: 2.2,
  },
];

// ==================== 核心校准函数 ====================

/**
 * 增强版预测校准
 */
export function enhancedCalibratePrediction(
  originalPrediction: number,
  marketState: EnhancedMarketState,
  config: EnhancedCalibrationConfig = ENHANCED_CALIBRATION_CONFIG
): EnhancedCalibratedPrediction {
  
  // 1. 计算极端事件放大因子
  const extremeEventFactor = calculateEnhancedExtremeEventFactor(marketState, config);
  
  // 2. 计算增强的超跌反弹因子
  const oversoldReboundFactor = calculateEnhancedOversoldReboundFactor(marketState, config);
  
  // 3. 计算反转信号因子
  const reversalSignalFactor = calculateReversalSignalFactor(marketState, config);
  
  // 4. 计算动量因子
  const momentumFactor = calculateEnhancedMomentumFactor(marketState, config);
  
  // 5. 计算波动率因子
  const volatilityFactor = calculateEnhancedVolatilityFactor(marketState, config);
  
  // 6. 计算成交量异常因子
  const volumeAnomalyFactor = calculateVolumeAnomalyFactor(marketState);
  
  // 7. 计算布林带因子
  const bollingerFactor = calculateBollingerFactor(marketState);
  
  // 8. 计算历史相似度因子
  const historicalSimilarityFactor = calculateEnhancedHistoricalSimilarityFactor(marketState);
  
  // 9. 多因子融合评分
  const multiFactorFusionScore = calculateMultiFactorFusionScore(
    extremeEventFactor,
    oversoldReboundFactor,
    reversalSignalFactor,
    momentumFactor,
    volumeAnomalyFactor,
    bollingerFactor,
    marketState,
    config
  );
  
  // 10. 综合校准
  let calibratedPrediction = originalPrediction;
  
  // 先应用超跌反弹修正（在极端事件放大之前）
  // 这样可以在极端超卖情况下先提升预测值，避免被放大到-100后无法恢复
  if (oversoldReboundFactor > 0) {
    // 多维度超跌确认
    const oversoldConfirmed = confirmOversoldWithMultipleFactors(marketState, config);
    if (oversoldConfirmed) {
      // 强烈反弹信号
      calibratedPrediction += oversoldReboundFactor * 40; // 提高修正幅度
    } else {
      // 轻微反弹信号
      calibratedPrediction += oversoldReboundFactor * 20;
    }
  }
  
  // 应用极端事件放大（仅在预测方向与市场一致时）
  // 但在极端超卖情况下，减少放大效果
  if (extremeEventFactor > 1 && originalPrediction < 0) {
    // 如果RSI极度超卖，减少极端事件放大效果
    if (marketState.rsi && marketState.rsi < 20) {
      calibratedPrediction *= 1 + (extremeEventFactor - 1) * 0.3;
    } else if (marketState.rsi && marketState.rsi < 25) {
      calibratedPrediction *= 1 + (extremeEventFactor - 1) * 0.5;
    } else {
      calibratedPrediction *= extremeEventFactor;
    }
  }
  
  // 应用反转信号修正
  if (reversalSignalFactor > 0.5) {
    const reversalType = detectReversalType(marketState);
    if (reversalType === 'bounce') {
      calibratedPrediction += reversalSignalFactor * 25;
    } else if (reversalType === 'trend_reversal') {
      calibratedPrediction += reversalSignalFactor * 35;
    }
  }
  
  // 应用动量因子
  calibratedPrediction += momentumFactor * 100 * config.momentumWeight;
  
  // 应用成交量异常因子
  if (volumeAnomalyFactor > 1.5) {
    // 成交量放大通常预示反转
    calibratedPrediction *= (1 - (volumeAnomalyFactor - 1) * 0.1);
  }
  
  // 应用布林带因子
  if (bollingerFactor < 0.1) {
    // 价格触及下轨，反弹概率高
    calibratedPrediction += 15;
  } else if (bollingerFactor > 0.9) {
    // 价格触及上轨，回调概率高
    calibratedPrediction -= 15;
  }
  
  // 限制范围
  calibratedPrediction = Math.max(-100, Math.min(100, calibratedPrediction));
  
  // 11. 计算置信度
  const confidence = calculateEnhancedConfidence(
    originalPrediction,
    calibratedPrediction,
    marketState,
    extremeEventFactor,
    oversoldReboundFactor,
    reversalSignalFactor
  );
  
  // 12. 生成信号
  const signals = generateEnhancedSignals(
    marketState,
    extremeEventFactor,
    oversoldReboundFactor,
    reversalSignalFactor,
    volumeAnomalyFactor,
    bollingerFactor,
    momentumFactor
  );
  
  // 13. 计算概率分布
  const probabilityDistribution = calculateProbabilityDistribution(
    calibratedPrediction,
    marketState,
    signals
  );
  
  return {
    originalPrediction,
    calibratedPrediction,
    confidence,
    factors: {
      extremeEventFactor,
      oversoldReboundFactor,
      momentumFactor,
      volatilityFactor,
      historicalSimilarityFactor,
      reversalSignalFactor,
      volumeAnomalyFactor,
      bollingerFactor,
      multiFactorFusionScore,
    },
    signals,
    probabilityDistribution,
  };
}

// ==================== 增强的因子计算函数 ====================

/**
 * 增强版极端事件因子计算
 */
function calculateEnhancedExtremeEventFactor(
  marketState: EnhancedMarketState,
  config: EnhancedCalibrationConfig
): number {
  const { vix, volatility, rsi, atr } = marketState;
  
  let factor = 1.0;
  
  // VIX超过阈值
  if (vix > config.extremeEventThreshold) {
    const vixRatio = vix / config.extremeEventThreshold;
    // 当RSI超卖时，VIX放大效应减半（恐慌已反映在价格中）
    const vixMultiplier = rsi < 25 ? 0.25 : rsi < 35 ? 0.5 : 1.0;
    factor += (vixRatio - 1) * 0.5 * vixMultiplier;
  }
  
  // 波动率异常高
  if (volatility > 0.03) {
    const volatilityRatio = volatility / 0.03;
    // 当RSI超卖时，波动率放大效应减弱
    const volMultiplier = rsi < 25 ? 0.3 : rsi < 35 ? 0.6 : 1.0;
    factor += volatilityRatio * 0.3 * volMultiplier;
  }
  
  // RSI极度超卖 - 不再增加放大因子，反而减少
  if (rsi < 20) {
    // 极端超卖意味着可能即将反弹，减少看跌放大
    factor *= 0.7;
  } else if (rsi < 30) {
    // 中等超卖，轻微减少放大
    factor *= 0.85;
  }
  
  // ATR异常放大
  if (atr > marketState.price * 0.02) {
    const atrMultiplier = rsi < 25 ? 0.3 : rsi < 35 ? 0.6 : 1.0;
    factor += 0.3 * atrMultiplier;
  }
  
  return Math.max(0.5, Math.min(config.extremeAmplificationFactor, factor));
}

/**
 * 增强版超跌反弹因子计算
 */
function calculateEnhancedOversoldReboundFactor(
  marketState: EnhancedMarketState,
  config: EnhancedCalibrationConfig
): number {
  const { rsi, bollingerPosition, williamsR, cci, volume, volumeHistory } = marketState;
  
  // RSI超卖检测
  const rsiOversold = rsi < config.oversoldThreshold ? 
    (config.oversoldThreshold - rsi) / config.oversoldThreshold : 0;
  
  // 布林带下轨检测
  const bollingerOversold = bollingerPosition < 0.15 ?
    (0.15 - bollingerPosition) / 0.15 : 0;
  
  // Williams %R超卖检测（-80以下为超卖）
  const williamsROversold = williamsR < -80 ?
    (williamsR - (-80)) / (-20) : 0;
  
  // CCI超卖检测（-100以下为超卖）
  const cciOversold = cci < -100 ?
    (cci - (-100)) / (-200) : 0;
  
  // 成交量放大检测（超跌反弹通常伴随成交量放大）
  const avgVolume = volumeHistory.length > 5 ?
    volumeHistory.slice(-5).reduce((a, b) => a + b, 0) / 5 : volume;
  const volumeSpike = volume > avgVolume * 1.5 ? 0.3 : 0;
  
  // 多因子加权融合
  const totalOversoldScore = 
    rsiOversold * config.oversoldConfirmationFactors.rsiWeight +
    bollingerOversold * config.oversoldConfirmationFactors.bollingerWeight +
    williamsROversold * config.oversoldConfirmationFactors.williamsRWeight +
    cciOversold * config.oversoldConfirmationFactors.cciWeight +
    volumeSpike * config.oversoldConfirmationFactors.volumeWeight;
  
  return Math.min(1.0, totalOversoldScore * config.oversoldReboundProbability);
}

/**
 * 反转信号因子计算
 */
function calculateReversalSignalFactor(
  marketState: EnhancedMarketState,
  config: EnhancedCalibrationConfig
): number {
  const { momentum, momentumHistory, macd, macdSignal, macdHistogram, priceHistory, volume } = marketState;
  
  let reversalScore = 0;
  
  // 动量反转检测
  if (momentumHistory.length >= 3) {
    const recentMomentum = momentumHistory.slice(-3);
    // 动量从负转正
    if (recentMomentum[0] < 0 && recentMomentum[2] > 0) {
      reversalScore += config.reversalConfirmationFactors.momentumReversalWeight;
    }
  }
  
  // MACD底背离检测
  if (priceHistory.length >= 10 && macdHistogram !== undefined) {
    const recentPrices = priceHistory.slice(-10);
    const recentLow = Math.min(...recentPrices);
    const currentPrice = priceHistory[priceHistory.length - 1];
    
    // 价格创新低但MACD未创新低（底背离）
    if (currentPrice === recentLow && macdHistogram > 0) {
      reversalScore += config.reversalConfirmationFactors.macdDivergenceWeight;
    }
  }
  
  // 成交量异动检测
  const avgVolume = marketState.volumeHistory.length > 5 ?
    marketState.volumeHistory.slice(-5).reduce((a, b) => a + b, 0) / 5 : volume;
  if (volume > avgVolume * 2) {
    reversalScore += config.reversalConfirmationFactors.volumeSpikeWeight;
  }
  
  // 价格形态检测（急跌后企稳）
  if (priceHistory.length >= 5) {
    const recentChanges = priceHistory.slice(-5).map((p, i) =>
      i > 0 ? (p - priceHistory[priceHistory.length - 5 + i - 1]) / priceHistory[priceHistory.length - 5 + i - 1] : 0
    ).slice(1);
    
    // 前3天大跌，后2天企稳
    const earlyDrop = recentChanges.slice(0, 3).reduce((a, b) => a + b, 0);
    const laterStabilize = recentChanges.slice(3).reduce((a, b) => a + b, 0);
    
    if (earlyDrop < -0.05 && laterStabilize > -0.02) {
      reversalScore += config.reversalConfirmationFactors.pricePatternWeight;
    }
  }
  
  return Math.min(1.0, reversalScore);
}

/**
 * 增强版动量因子计算
 */
function calculateEnhancedMomentumFactor(
  marketState: EnhancedMarketState,
  config: EnhancedCalibrationConfig
): number {
  const { momentum, macd, macdSignal, momentumHistory } = marketState;
  
  // 当前动量方向
  const currentMomentumDirection = momentum > 0.02 ? 1 : momentum < -0.02 ? -1 : 0;
  
  // MACD交叉信号
  const macdCross = macd > macdSignal ? 0.05 : macd < macdSignal ? -0.05 : 0;
  
  // 动量趋势（连续3天同方向）
  let momentumTrend = 0;
  if (momentumHistory.length >= 3) {
    const recentMomentum = momentumHistory.slice(-3);
    const allPositive = recentMomentum.every(m => m > 0);
    const allNegative = recentMomentum.every(m => m < 0);
    if (allPositive) momentumTrend = 0.03;
    if (allNegative) momentumTrend = -0.03;
  }
  
  return currentMomentumDirection * Math.abs(momentum) * 0.1 + macdCross + momentumTrend;
}

/**
 * 增强版波动率因子计算
 */
function calculateEnhancedVolatilityFactor(
  marketState: EnhancedMarketState,
  config: EnhancedCalibrationConfig
): number {
  const { volatility, volatilityHistory, atr } = marketState;
  
  // 当前波动率
  let factor = volatility > 0.02 ? volatility / 0.02 : 0;
  
  // 波动率趋势（波动率扩大预示不确定性增加）
  if (volatilityHistory.length >= 3) {
    const recentVolatility = volatilityHistory.slice(-3);
    const volatilityTrend = recentVolatility[2] - recentVolatility[0];
    if (volatilityTrend > 0) {
      factor += 0.1;
    }
  }
  
  // ATR因子
  if (atr > marketState.price * 0.015) {
    factor += 0.1;
  }
  
  return factor;
}

/**
 * 成交量异常因子计算
 */
function calculateVolumeAnomalyFactor(
  marketState: EnhancedMarketState
): number {
  const { volume, volumeHistory } = marketState;
  
  if (volumeHistory.length < 5) return 1.0;
  
  const avgVolume = volumeHistory.slice(-5).reduce((a, b) => a + b, 0) / 5;
  
  return volume / avgVolume;
}

/**
 * 布林带因子计算
 */
function calculateBollingerFactor(
  marketState: EnhancedMarketState
): number {
  const { bollingerUpper, bollingerLower, price } = marketState;
  
  if (bollingerUpper === bollingerLower) return 0.5;
  
  // 计算价格在布林带中的位置 (0-1)
  return (price - bollingerLower) / (bollingerUpper - bollingerLower);
}

/**
 * 增强版历史相似度因子计算
 */
function calculateEnhancedHistoricalSimilarityFactor(
  marketState: EnhancedMarketState
): number {
  const { vix, rsi, volatility, volume, volumeHistory } = marketState;
  
  let maxSimilarity = 0;
  let matchedEvent: EnhancedHistoricalBlackSwan | null = null;
  
  for (const event of ENHANCED_HISTORICAL_BLACK_SWANS) {
    // 计算多维度相似度
    const vixSimilarity = 1 - Math.abs(vix - event.vixPeak) / event.vixPeak;
    const rsiSimilarity = 1 - Math.abs(rsi - event.rsiLow) / Math.max(event.rsiLow, 1);
    const volatilitySimilarity = volatility > 0.02 ? 0.8 : 0.3;
    
    // 成交量放大相似度
    const avgVolume = volumeHistory.length > 5 ?
      volumeHistory.slice(-5).reduce((a, b) => a + b, 0) / 5 : volume;
    const volumeRatio = volume / avgVolume;
    const volumeSimilarity = Math.abs(volumeRatio - event.volumeSpikeRatio) < 1 ? 0.7 : 0.3;
    
    const totalSimilarity = (vixSimilarity + rsiSimilarity + volatilitySimilarity + volumeSimilarity) / 4;
    
    if (totalSimilarity > maxSimilarity) {
      maxSimilarity = totalSimilarity;
      matchedEvent = event;
    }
  }
  
  // 如果匹配到高相似度事件，使用其反弹概率和幅度
  if (matchedEvent && maxSimilarity > 0.6) {
    return matchedEvent.reboundProbability;
  }
  
  return 0.5;
}

/**
 * 多因子融合评分
 */
function calculateMultiFactorFusionScore(
  extremeEventFactor: number,
  oversoldReboundFactor: number,
  reversalSignalFactor: number,
  momentumFactor: number,
  volumeAnomalyFactor: number,
  bollingerFactor: number,
  marketState: EnhancedMarketState,
  config: EnhancedCalibrationConfig
): number {
  // 动态权重调整
  let weights = {
    extreme: 0.25,
    oversold: 0.25,
    reversal: 0.20,
    momentum: 0.15,
    volume: 0.10,
    bollinger: 0.05,
  };
  
  // 根据市场状态动态调整权重
  if (config.dynamicWeightAdjustment) {
    // 极端事件时，增加极端因子权重
    if (extremeEventFactor > 1.5) {
      weights.extreme = 0.35;
      weights.oversold = 0.30;
      weights.reversal = 0.20;
      weights.momentum = 0.10;
      weights.volume = 0.05;
    }
    
    // 超跌时，增加反弹因子权重
    if (oversoldReboundFactor > 0.5) {
      weights.oversold = 0.35;
      weights.reversal = 0.25;
      weights.extreme = 0.20;
    }
    
    // 反转信号强烈时，增加反转因子权重
    if (reversalSignalFactor > 0.6) {
      weights.reversal = 0.30;
      weights.oversold = 0.25;
    }
  }
  
  // 计算融合评分
  const fusionScore = 
    extremeEventFactor * weights.extreme +
    oversoldReboundFactor * weights.oversold +
    reversalSignalFactor * weights.reversal +
    (momentumFactor > 0 ? 1 : 0) * weights.momentum +
    (volumeAnomalyFactor > 1.5 ? 1 : 0) * weights.volume +
    (bollingerFactor < 0.2 ? 1 : bollingerFactor > 0.8 ? -1 : 0) * weights.bollinger;
  
  return Math.max(-1, Math.min(1, fusionScore));
}

// ==================== 辅助函数 ====================

/**
 * 多因子超跌确认
 */
function confirmOversoldWithMultipleFactors(
  marketState: EnhancedMarketState,
  config: EnhancedCalibrationConfig
): boolean {
  const { rsi, bollingerPosition, williamsR, cci, volume, volumeHistory } = marketState;
  
  // 至少3个因子同时超卖才确认
  let oversoldCount = 0;
  
  if (rsi < config.oversoldThreshold) oversoldCount++;
  if (bollingerPosition < 0.15) oversoldCount++;
  if (williamsR < -80) oversoldCount++;
  if (cci < -100) oversoldCount++;
  
  // 成交量放大作为辅助确认
  const avgVolume = volumeHistory.length > 5 ?
    volumeHistory.slice(-5).reduce((a, b) => a + b, 0) / 5 : volume;
  if (volume > avgVolume * 1.5) oversoldCount++;
  
  return oversoldCount >= 3;
}

/**
 * 检测反转类型
 */
function detectReversalType(
  marketState: EnhancedMarketState
): 'bounce' | 'correction' | 'trend_reversal' | 'none' {
  const { momentum, momentumHistory, priceHistory, macd, macdSignal } = marketState;
  
  // V型反转（急跌急涨）
  if (priceHistory.length >= 5) {
    const recentChanges = priceHistory.slice(-5).map((p, i) =>
      i > 0 ? (p - priceHistory[priceHistory.length - 5 + i - 1]) / priceHistory[priceHistory.length - 5 + i - 1] : 0
    ).slice(1);
    
    const earlyDrop = recentChanges.slice(0, 3).reduce((a, b) => a + b, 0);
    const laterRise = recentChanges.slice(3).reduce((a, b) => a + b, 0);
    
    if (earlyDrop < -0.08 && laterRise > 0.05) {
      return 'bounce';
    }
  }
  
  // 趋势反转（MACD金叉 + 动量转正）
  if (macd > macdSignal && momentum > 0 && momentumHistory.length >= 3) {
    const recentMomentum = momentumHistory.slice(-3);
    if (recentMomentum[0] < 0 && recentMomentum[2] > 0) {
      return 'trend_reversal';
    }
  }
  
  // 技术性回调
  if (momentum > 0 && macd > macdSignal) {
    return 'correction';
  }
  
  return 'none';
}

/**
 * 增强版置信度计算
 */
function calculateEnhancedConfidence(
  originalPrediction: number,
  calibratedPrediction: number,
  marketState: EnhancedMarketState,
  extremeEventFactor: number,
  oversoldReboundFactor: number,
  reversalSignalFactor: number
): number {
  let confidence = 50;
  
  // 极端事件时置信度降低
  if (extremeEventFactor > 1.5) {
    confidence -= extremeEventFactor * 8;
  }
  
  // 多因子确认超跌时置信度提升
  if (oversoldReboundFactor > 0.5) {
    confidence += oversoldReboundFactor * 25;
  }
  
  // 反转信号强烈时置信度提升
  if (reversalSignalFactor > 0.6) {
    confidence += reversalSignalFactor * 20;
  }
  
  // 预测一致性
  if (Math.sign(originalPrediction) === Math.sign(calibratedPrediction)) {
    confidence += 10;
  }
  
  // 波动率高时置信度降低
  if (marketState.volatility > 0.03) {
    confidence -= 12;
  }
  
  // VIX极高时置信度降低
  if (marketState.vix > 50) {
    confidence -= 15;
  }
  
  return Math.max(15, Math.min(95, confidence));
}

/**
 * 生成增强版信号
 */
function generateEnhancedSignals(
  marketState: EnhancedMarketState,
  extremeEventFactor: number,
  oversoldReboundFactor: number,
  reversalSignalFactor: number,
  volumeAnomalyFactor: number,
  bollingerFactor: number,
  momentumFactor: number
): EnhancedCalibratedPrediction['signals'] {
  const isExtremeEvent = extremeEventFactor > 1;
  const isOversold = oversoldReboundFactor > 0.3;
  const isReversalLikely = reversalSignalFactor > 0.5;
  const isVolumeAnomaly = volumeAnomalyFactor > 1.5;
  const isBollingerBreakout = bollingerFactor < 0.1 || bollingerFactor > 0.9;
  
  const momentumDirection = momentumFactor > 0.02 ? 'up' : momentumFactor < -0.02 ? 'down' : 'neutral';
  
  const reversalType = detectReversalType(marketState);
  
  // 预测操作建议
  let predictedAction: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell' = 'hold';
  
  if (isOversold && isReversalLikely && reversalType === 'bounce') {
    predictedAction = 'strong_buy';
  } else if (isOversold && reversalSignalFactor > 0.3) {
    predictedAction = 'buy';
  } else if (isExtremeEvent && momentumFactor < -0.05) {
    predictedAction = 'strong_sell';
  } else if (extremeEventFactor > 1.2 && momentumFactor < 0) {
    predictedAction = 'sell';
  }
  
  return {
    isExtremeEvent,
    isOversold,
    isReversalLikely,
    isVolumeAnomaly,
    isBollingerBreakout,
    momentumDirection,
    reversalType,
    predictedAction,
  };
}

/**
 * 计算概率分布
 */
function calculateProbabilityDistribution(
  calibratedPrediction: number,
  marketState: EnhancedMarketState,
  signals: EnhancedCalibratedPrediction['signals']
): { upProbability: number; downProbability: number; sidewaysProbability: number } {
  
  // 基于校准预测计算基础概率
  const baseUpProb = calibratedPrediction > 30 ? 0.6 : calibratedPrediction > 0 ? 0.45 : calibratedPrediction > -30 ? 0.35 : 0.2;
  const baseDownProb = calibratedPrediction < -30 ? 0.6 : calibratedPrediction < 0 ? 0.45 : calibratedPrediction < 30 ? 0.35 : 0.2;
  const baseSidewaysProb = Math.abs(calibratedPrediction) < 20 ? 0.4 : 0.2;
  
  // 根据信号调整概率
  let upProb = baseUpProb;
  let downProb = baseDownProb;
  let sidewaysProb = baseSidewaysProb;
  
  // 反弹信号增加上涨概率
  if (signals.isOversold && signals.isReversalLikely) {
    upProb += 0.15;
    downProb -= 0.1;
  }
  
  // 极端事件增加波动概率
  if (signals.isExtremeEvent) {
    sidewaysProb -= 0.1;
    if (calibratedPrediction < 0) {
      downProb += 0.1;
    }
  }
  
  // 确保概率总和为1
  const total = upProb + downProb + sidewaysProb;
  
  return {
    upProbability: upProb / total,
    downProbability: downProb / total,
    sidewaysProbability: sidewaysProb / total,
  };
}

// ==================== 技术指标计算函数 ====================

/**
 * 计算布林带
 */
export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): { upper: number; middle: number; lower: number } {
  if (prices.length < period) {
    const lastPrice = prices[prices.length - 1];
    return { upper: lastPrice, middle: lastPrice, lower: lastPrice };
  }
  
  const recentPrices = prices.slice(-period);
  const middle = recentPrices.reduce((a, b) => a + b, 0) / period;
  
  const variance = recentPrices.reduce((a, p) => a + Math.pow(p - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  
  return {
    upper: middle + stdDevMultiplier * stdDev,
    middle,
    lower: middle - stdDevMultiplier * stdDev,
  };
}

/**
 * 计算ATR (Average True Range)
 */
export function calculateATR(
  prices: number[],
  period: number = 14
): number {
  if (prices.length < period + 1) return prices[prices.length - 1] * 0.02;
  
  const trueRanges: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const high = prices[i];
    const low = prices[i - 1];
    const prevClose = prices[i - 1];
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/**
 * 计算Williams %R
 */
export function calculateWilliamsR(
  prices: number[],
  period: number = 14
): number {
  if (prices.length < period) return -50;
  
  const recentPrices = prices.slice(-period);
  const highestHigh = Math.max(...recentPrices);
  const lowestLow = Math.min(...recentPrices);
  const currentClose = prices[prices.length - 1];
  
  return ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
}

/**
 * 计算CCI (Commodity Channel Index)
 */
export function calculateCCI(
  prices: number[],
  period: number = 20
): number {
  if (prices.length < period) return 0;
  
  const recentPrices = prices.slice(-period);
  const typicalPrice = recentPrices.reduce((a, b) => a + b, 0) / period;
  
  const meanDeviation = recentPrices.reduce((a, p) => a + Math.abs(p - typicalPrice), 0) / period;
  
  if (meanDeviation === 0) return 0;
  
  const currentTypicalPrice = prices[prices.length - 1];
  
  return (currentTypicalPrice - typicalPrice) / (0.015 * meanDeviation);
}

/**
 * 计算OBV (On-Balance Volume)
 */
export function calculateOBV(
  prices: number[],
  volumes: number[]
): number {
  if (prices.length < 2 || volumes.length < 2) return volumes[0] || 0;
  
  let obv = 0;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > prices[i - 1]) {
      obv += volumes[i];
    } else if (prices[i] < prices[i - 1]) {
      obv -= volumes[i];
    }
  }
  
  return obv;
}