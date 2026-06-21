/**
 * 自适应模型选择器
 * 
 * 根据市场状态自动选择最适合的预测模型
 */

// ==================== 类型定义 ====================

export enum MarketRegime {
  TRENDING_UP = 'TRENDING_UP',
  TRENDING_DOWN = 'TRENDING_DOWN',
  SIDEWAYS = 'SIDEWAYS',
  VOLATILE = 'VOLATILE',
  CRASH = 'CRASH',
  RECOVERY = 'RECOVERY',
}

export enum PredictionModel {
  LSTM = 'LSTM',
  TRANSFORMER = 'TRANSFORMER',
  MULTI_FACTOR = 'MULTI_FACTOR',
  MOMENTUM = 'MOMENTUM',
  REVERSAL = 'REVERSAL',
  EXTREME_EVENT = 'EXTREME_EVENT',
  ENSEMBLE = 'ENSEMBLE',
}

export interface MarketState {
  price: number;
  previousPrice: number;
  priceHistory: number[];
  volume: number;
  volumeHistory: number[];
  vix: number;
  rsi: number;
  momentum: number;
  volatility: number;
  sentiment: number;
  // 额外指标
  macd: number;
  macdSignal: number;
  bollingerPosition: number;
  atr: number;
  trendStrength: number;
  trendDirection: 'up' | 'down' | 'neutral';
}

export interface ModelConfig {
  model: PredictionModel;
  weights: {
    technical: number;
    sentiment: number;
    historical: number;
    momentum: number;
    volume: number;
  };
  parameters: Record<string, any>;
}

export interface AdaptivePredictionResult {
  selectedModel: PredictionModel;
  confidence: number;
  marketRegime: MarketRegime;
  modelConfigs: Array<{
    model: PredictionModel;
    weight: number;
    confidence: number;
  }>;
  reasoning: string;
}

// ==================== 市场状态检测 ====================

/**
 * 检测市场状态
 */
export function detectMarketRegime(marketState: MarketState): MarketRegime {
  const { vix, rsi, momentum, volatility, priceHistory, trendDirection } = marketState;

  // 1. 检测崩盘/极端事件
  if (vix > 50 && rsi < 20 && volatility > 0.04) {
    return MarketRegime.CRASH;
  }

  // 2. 检测波动性市场
  if (vix > 35 && volatility > 0.03) {
    return MarketRegime.VOLATILE;
  }

  // 3. 检测下跌趋势
  if (trendDirection === 'down' && momentum < -0.02) {
    return MarketRegime.TRENDING_DOWN;
  }

  // 4. 检测上涨趋势
  if (trendDirection === 'up' && momentum > 0.02) {
    return MarketRegime.TRENDING_UP;
  }

  // 5. 检测恢复阶段（RSI超卖后反弹）
  if (rsi > 35 && rsi < 50 && momentum > 0.01) {
    return MarketRegime.RECOVERY;
  }

  // 6. 默认震荡市场
  return MarketRegime.SIDEWAYS;
}

/**
 * 计算趋势强度和方向
 */
export function calculateTrend(
  priceHistory: number[],
  shortPeriod: number = 5,
  longPeriod: number = 20
): { direction: 'up' | 'down' | 'neutral'; strength: number } {
  if (priceHistory.length < longPeriod) {
    return { direction: 'neutral', strength: 0 };
  }

  const shortMA = priceHistory.slice(-shortPeriod).reduce((a, b) => a + b, 0) / shortPeriod;
  const longMA = priceHistory.slice(-longPeriod).reduce((a, b) => a + b, 0) / longPeriod;
  
  const priceChange = (shortMA - longMA) / longMA;
  
  // 方向
  let direction: 'up' | 'down' | 'neutral' = 'neutral';
  if (priceChange > 0.005) direction = 'up';
  else if (priceChange < -0.005) direction = 'down';

  // 强度 (0-1)
  const strength = Math.min(1, Math.abs(priceChange) * 10);

  return { direction, strength };
}

// ==================== 模型选择逻辑 ====================

/**
 * 自适应选择最优模型
 */
export function selectOptimalModel(marketState: MarketState): AdaptivePredictionResult {
  const regime = detectMarketRegime(marketState);
  
  // 根据市场状态选择模型组合
  let modelConfigs: Array<{ model: PredictionModel; weight: number; confidence: number }>;
  let reasoning: string;

  switch (regime) {
    case MarketRegime.CRASH:
      ({ modelConfigs, reasoning } = selectForCrash(marketState));
      break;
    
    case MarketRegime.VOLATILE:
      ({ modelConfigs, reasoning } = selectForVolatile(marketState));
      break;
    
    case MarketRegime.TRENDING_DOWN:
      ({ modelConfigs, reasoning } = selectForDowntrend(marketState));
      break;
    
    case MarketRegime.TRENDING_UP:
      ({ modelConfigs, reasoning } = selectForUptrend(marketState));
      break;
    
    case MarketRegime.RECOVERY:
      ({ modelConfigs, reasoning } = selectForRecovery(marketState));
      break;
    
    case MarketRegime.SIDEWAYS:
    default:
      ({ modelConfigs, reasoning } = selectForSideways(marketState));
      break;
  }

  // 计算总体置信度
  const primaryModel = modelConfigs.reduce((prev, current) => 
    current.weight > prev.weight ? current : prev
  );

  return {
    selectedModel: primaryModel.model,
    confidence: primaryModel.confidence * primaryModel.weight,
    marketRegime: regime,
    modelConfigs,
    reasoning,
  };
}

/**
 * 崩盘市场模型选择
 */
function selectForCrash(marketState: MarketState): {
  modelConfigs: Array<{ model: PredictionModel; weight: number; confidence: number }>;
  reasoning: string;
} {
  const { rsi, vix } = marketState;

  // 超跌检测
  const oversoldLevel = rsi < 15 ? 0.8 : rsi < 25 ? 0.5 : 0.2;

  const configs = [
    {
      model: PredictionModel.EXTREME_EVENT,
      weight: 0.35,
      confidence: 0.75 + oversoldLevel * 0.2,
    },
    {
      model: PredictionModel.REVERSAL,
      weight: 0.30 + oversoldLevel * 0.15,
      confidence: 0.70 + oversoldLevel * 0.2,
    },
    {
      model: PredictionModel.LSTM,
      weight: 0.15,
      confidence: 0.65,
    },
    {
      model: PredictionModel.MULTI_FACTOR,
      weight: 0.20,
      confidence: 0.60,
    },
  ];

  const reasoning = `检测到崩盘市场（VIX=${vix.toFixed(0)}, RSI=${rsi.toFixed(0)}）。` +
    `主要使用极端事件预测模型，配合反弹反转信号。` +
    `超卖程度: ${(oversoldLevel * 100).toFixed(0)}%`;

  return { modelConfigs: configs, reasoning };
}

/**
 * 波动市场模型选择
 */
function selectForVolatile(marketState: MarketState): {
  modelConfigs: Array<{ model: PredictionModel; weight: number; confidence: number }>;
  reasoning: string;
} {
  const { rsi, momentum } = marketState;

  const configs = [
    {
      model: PredictionModel.MULTI_FACTOR,
      weight: 0.35,
      confidence: 0.70,
    },
    {
      model: PredictionModel.MOMENTUM,
      weight: 0.25,
      confidence: momentum > 0 ? 0.75 : 0.60,
    },
    {
      model: PredictionModel.TRANSFORMER,
      weight: 0.20,
      confidence: 0.68,
    },
    {
      model: PredictionModel.REVERSAL,
      weight: 0.20,
      confidence: rsi < 30 || rsi > 70 ? 0.70 : 0.55,
    },
  ];

  const reasoning = `检测到高波动市场（VIX=${marketState.vix.toFixed(0)}）。` +
    `综合使用多因子模型和技术指标模型，注意反转风险。`;

  return { modelConfigs: configs, reasoning };
}

/**
 * 下跌趋势模型选择
 */
function selectForDowntrend(marketState: MarketState): {
  modelConfigs: Array<{ model: PredictionModel; weight: number; confidence: number }>;
  reasoning: string;
} {
  const { rsi } = marketState;

  const configs = [
    {
      model: PredictionModel.MOMENTUM,
      weight: 0.35,
      confidence: 0.75,
    },
    {
      model: PredictionModel.MULTI_FACTOR,
      weight: 0.30,
      confidence: 0.70,
    },
    {
      model: PredictionModel.TRANSFORMER,
      weight: 0.20,
      confidence: 0.65,
    },
    {
      model: PredictionModel.REVERSAL,
      weight: 0.15,
      confidence: rsi < 30 ? 0.75 : 0.50,
    },
  ];

  const reasoning = `检测到下跌趋势（动量=${(marketState.momentum * 100).toFixed(1)}%）。` +
    `主要使用动量模型，注意超跌反弹风险。`;

  return { modelConfigs: configs, reasoning };
}

/**
 * 上涨趋势模型选择
 */
function selectForUptrend(marketState: MarketState): {
  modelConfigs: Array<{ model: PredictionModel; weight: number; confidence: number }>;
  reasoning: string;
} {
  const { rsi } = marketState;

  const configs = [
    {
      model: PredictionModel.MOMENTUM,
      weight: 0.40,
      confidence: 0.78,
    },
    {
      model: PredictionModel.MULTI_FACTOR,
      weight: 0.30,
      confidence: 0.72,
    },
    {
      model: PredictionModel.LSTM,
      weight: 0.20,
      confidence: 0.68,
    },
    {
      model: PredictionModel.REVERSAL,
      weight: 0.10,
      confidence: rsi > 70 ? 0.65 : 0.50,
    },
  ];

  const reasoning = `检测到上涨趋势（动量=${(marketState.momentum * 100).toFixed(1)}%）。` +
    `主要使用动量模型，注意超买回调风险。`;

  return { modelConfigs: configs, reasoning };
}

/**
 * 恢复阶段模型选择
 */
function selectForRecovery(marketState: MarketState): {
  modelConfigs: Array<{ model: PredictionModel; weight: number; confidence: number }>;
  reasoning: string;
} {
  const configs = [
    {
      model: PredictionModel.REVERSAL,
      weight: 0.40,
      confidence: 0.80,
    },
    {
      model: PredictionModel.MOMENTUM,
      weight: 0.30,
      confidence: 0.72,
    },
    {
      model: PredictionModel.MULTI_FACTOR,
      weight: 0.20,
      confidence: 0.68,
    },
    {
      model: PredictionModel.ENSEMBLE,
      weight: 0.10,
      confidence: 0.65,
    },
  ];

  const reasoning = `检测到恢复阶段（RSI=${marketState.rsi.toFixed(0)}）。` +
    `主要使用反转模型，配合动量指标确认反弹持续性。`;

  return { modelConfigs: configs, reasoning };
}

/**
 * 震荡市场模型选择
 */
function selectForSideways(marketState: MarketState): {
  modelConfigs: Array<{ model: PredictionModel; weight: number; confidence: number }>;
  reasoning: string;
} {
  const configs = [
    {
      model: PredictionModel.MULTI_FACTOR,
      weight: 0.35,
      confidence: 0.70,
    },
    {
      model: PredictionModel.ENSEMBLE,
      weight: 0.25,
      confidence: 0.68,
    },
    {
      model: PredictionModel.TRANSFORMER,
      weight: 0.25,
      confidence: 0.65,
    },
    {
      model: PredictionModel.LSTM,
      weight: 0.15,
      confidence: 0.60,
    },
  ];

  const reasoning = `检测到震荡市场。使用多模型集成，提高预测稳定性。`;

  return { modelConfigs: configs, reasoning };
}

// ==================== 模型配置生成 ====================

/**
 * 根据选择结果生成模型配置
 */
export function generateModelConfig(result: AdaptivePredictionResult): ModelConfig {
  const primaryModel = result.modelConfigs[0];

  // 根据模型类型生成配置
  switch (primaryModel.model) {
    case PredictionModel.EXTREME_EVENT:
      return {
        model: PredictionModel.EXTREME_EVENT,
        weights: {
          technical: 0.25,
          sentiment: 0.35,
          historical: 0.30,
          momentum: 0.05,
          volume: 0.05,
        },
        parameters: {
          extremeThreshold: 1.5,
          amplificationFactor: 3.0,
        },
      };

    case PredictionModel.REVERSAL:
      return {
        model: PredictionModel.REVERSAL,
        weights: {
          technical: 0.35,
          sentiment: 0.20,
          historical: 0.25,
          momentum: 0.15,
          volume: 0.05,
        },
        parameters: {
          reversalThreshold: 0.05,
          momentumWeight: 0.30,
        },
      };

    case PredictionModel.MOMENTUM:
      return {
        model: PredictionModel.MOMENTUM,
        weights: {
          technical: 0.30,
          sentiment: 0.15,
          historical: 0.15,
          momentum: 0.35,
          volume: 0.05,
        },
        parameters: {
          momentumPeriod: 10,
          trendStrengthThreshold: 0.02,
        },
      };

    case PredictionModel.LSTM:
      return {
        model: PredictionModel.LSTM,
        weights: {
          technical: 0.25,
          sentiment: 0.25,
          historical: 0.30,
          momentum: 0.10,
          volume: 0.10,
        },
        parameters: {
          sequenceLength: 20,
          hiddenSize: 64,
          forecastHorizon: 5,
        },
      };

    case PredictionModel.TRANSFORMER:
      return {
        model: PredictionModel.TRANSFORMER,
        weights: {
          technical: 0.20,
          sentiment: 0.25,
          historical: 0.30,
          momentum: 0.15,
          volume: 0.10,
        },
        parameters: {
          dModel: 128,
          heads: 8,
          layers: 4,
          forecastHorizon: 7,
        },
      };

    case PredictionModel.ENSEMBLE:
    case PredictionModel.MULTI_FACTOR:
    default:
      return {
        model: PredictionModel.MULTI_FACTOR,
        weights: {
          technical: 0.25,
          sentiment: 0.25,
          historical: 0.25,
          momentum: 0.15,
          volume: 0.10,
        },
        parameters: {
          dynamicWeightAdjustment: true,
          minConfidenceThreshold: 0.60,
        },
      };
  }
}

// ==================== 导出 ====================

export type {
  MarketState,
  ModelConfig,
  AdaptivePredictionResult,
};
