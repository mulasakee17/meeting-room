/**
 * Phase 1 优化版预测校准器
 * 
 * 集成：
 * 1. 扩展的历史黑天鹅事件库（17个历史事件）
 * 2. 自适应模型选择器（根据市场状态自动选择最优模型）
 */

// ==================== 导入 ====================

import {
  calibratePrediction,
  MarketState,
  CalibratedPrediction,
} from './predictionCalibrator';

import {
  EXTENDED_BLACK_SWAN_DATABASE,
  findMostSimilarEvent,
  predictReboundFromSimilarEvents,
  ExtendedBlackSwan,
} from './extendedBlackSwanDatabase';

import {
  selectOptimalModel,
  generateModelConfig,
  calculateTrend,
  detectMarketRegime,
  MarketState as AdaptiveMarketState,
  AdaptivePredictionResult,
  PredictionModel,
} from './adaptiveModelSelector';

// ==================== 类型定义 ====================

export interface PhaseOneCalibrationConfig {
  // 启用历史事件库扩展
  enableExtendedHistoricalDB: boolean;
  historicalMatchWeight: number;
  
  // 启用自适应模型选择
  enableAdaptiveModelSelection: boolean;
  adaptiveThreshold: number;
  
  // 基础校准配置
  useEnhancedCalibration: boolean;
}

export const DEFAULT_PHASE_ONE_CONFIG: PhaseOneCalibrationConfig = {
  enableExtendedHistoricalDB: true,
  historicalMatchWeight: 0.25,
  
  enableAdaptiveModelSelection: true,
  adaptiveThreshold: 0.60,
  
  useEnhancedCalibration: true,
};

export interface PhaseOneCalibrationResult {
  // 原始和校准预测
  originalPrediction: number;
  calibratedPrediction: number;
  confidence: number;
  
  // 增强的校准因子
  factors: {
    extremeEventFactor: number;
    oversoldReboundFactor: number;
    momentumFactor: number;
    volatilityFactor: number;
    historicalSimilarityFactor: number;
    adaptiveModelFactor: number;     // 新增：自适应模型因子
    extendedHistoricalFactor: number; // 新增：扩展历史因子
  };
  
  // 市场状态
  marketRegime: string;
  
  // 历史相似度分析
  historicalAnalysis?: {
    mostSimilarEvent: {
      name: string;
      date: string;
      severity: string;
      category: string;
    };
    similarity: number;
    confidence: 'high' | 'medium' | 'low';
    predictedReboundProbability: number;
    predictedReboundMagnitude: number;
  };
  
  // 自适应模型选择
  adaptiveModelSelection?: {
    selectedModel: PredictionModel;
    confidence: number;
    reasoning: string;
    modelWeights: Array<{
      model: PredictionModel;
      weight: number;
      confidence: number;
    }>;
  };
  
  // 信号
  signals: {
    isExtremeEvent: boolean;
    isOversold: boolean;
    isReversalLikely: boolean;
    momentumDirection: 'up' | 'down' | 'neutral';
  };
}

// ==================== 核心校准函数 ====================

/**
 * Phase 1 优化版预测校准
 */
export function phaseOneCalibratePrediction(
  originalPrediction: number,
  marketState: MarketState,
  config: PhaseOneCalibrationConfig = DEFAULT_PHASE_ONE_CONFIG
): PhaseOneCalibrationResult {
  
  // 1. 首先进行基础校准
  const baseCalibration = calibratePrediction(originalPrediction, marketState);
  
  let calibratedPrediction = baseCalibration.calibratedPrediction;
  let confidence = baseCalibration.confidence;
  
  // 初始化因子
  const factors = {
    extremeEventFactor: baseCalibration.factors.extremeEventFactor,
    oversoldReboundFactor: baseCalibration.factors.oversoldReboundFactor,
    momentumFactor: baseCalibration.factors.momentumFactor,
    volatilityFactor: baseCalibration.factors.volatilityFactor,
    historicalSimilarityFactor: baseCalibration.factors.historicalSimilarityFactor,
    adaptiveModelFactor: 1.0,
    extendedHistoricalFactor: 1.0,
  };
  
  // 初始化信号
  const signals = {
    isExtremeEvent: baseCalibration.signals.isExtremeEvent,
    isOversold: baseCalibration.signals.isOversold,
    isReversalLikely: baseCalibration.signals.isReversalLikely,
    momentumDirection: baseCalibration.signals.momentumDirection,
  };
  
  let historicalAnalysis: PhaseOneCalibrationResult['historicalAnalysis'];
  let adaptiveModelSelection: PhaseOneCalibrationResult['adaptiveModelSelection'];
  let marketRegime = 'UNKNOWN';
  
  // 2. 扩展历史事件库分析
  if (config.enableExtendedHistoricalDB) {
    const historicalResult = analyzeExtendedHistorical(marketState);
    
    if (historicalResult) {
      historicalAnalysis = historicalResult;
      
      // 应用扩展历史因子
      factors.extendedHistoricalFactor = 1 + historicalResult.similarity * config.historicalMatchWeight;
      factors.historicalSimilarityFactor = historicalResult.similarity;
      
      // 如果找到高相似度事件，调整预测
      if (historicalResult.confidence === 'high' || historicalResult.confidence === 'medium') {
        // 基于历史事件的反弹概率调整
        // 增大调整幅度，特别是在极端市场情况下
        const baseAdjustment = (historicalResult.predictedReboundProbability - 0.5) * 20;
        
        // 如果RSI超卖，增强反弹调整
        const rsiMultiplier = marketState.rsi < 20 ? 3.0 : marketState.rsi < 25 ? 2.0 : marketState.rsi < 30 ? 1.5 : 1.0;
        
        // 如果是极端恐慌事件（VIX高），增强调整
        const vixMultiplier = marketState.vix && marketState.vix > 50 ? 1.5 : 1.0;
        
        const reboundAdjustment = baseAdjustment * rsiMultiplier * vixMultiplier;
        calibratedPrediction += reboundAdjustment * config.historicalMatchWeight;
        
        // 调整置信度
        confidence += historicalResult.similarity * 15;
      }
    }
  }
  
  // 3. 自适应模型选择
  if (config.enableAdaptiveModelSelection) {
    const adaptiveResult = performAdaptiveModelSelection(marketState);
    
    if (adaptiveResult) {
      adaptiveModelSelection = adaptiveResult;
      marketRegime = adaptiveResult.marketRegime;
      
      // 应用自适应模型因子
      factors.adaptiveModelFactor = 1 + (adaptiveResult.confidence - 0.5) * 0.2;
      
      // 根据选择的模型调整预测
      calibratedPrediction = applyAdaptiveAdjustment(
        calibratedPrediction,
        adaptiveResult,
        marketState
      );
      
      // 调整置信度
      confidence += adaptiveResult.confidence * 10;
    }
  }
  
  // 4. 限制范围
  calibratedPrediction = Math.max(-100, Math.min(100, calibratedPrediction));
  confidence = Math.max(15, Math.min(95, confidence));
  
  return {
    originalPrediction,
    calibratedPrediction,
    confidence,
    factors,
    marketRegime,
    historicalAnalysis,
    adaptiveModelSelection,
    signals,
  };
}

// ==================== 辅助函数 ====================

/**
 * 扩展历史事件库分析
 */
function analyzeExtendedHistorical(marketState: MarketState): PhaseOneCalibrationResult['historicalAnalysis'] | null {
  try {
    // 查找最相似的事件
    const similarityResult = findMostSimilarEvent({
      vix: marketState.vix || 20,
      rsi: marketState.rsi,
      volatility: marketState.volatility,
      volume: marketState.volume,
      priceDrop: marketState.sentiment < 0 ? Math.abs(marketState.sentiment) : 0,
    });
    
    if (!similarityResult.event) return null;
    
    const event = similarityResult.event;
    
    // 预测反弹
    const reboundResult = predictReboundFromSimilarEvents(
      {
        vix: marketState.vix || 20,
        rsi: marketState.rsi,
        volatility: marketState.volatility,
        volume: marketState.volume,
      },
      1 // 默认1天
    );
    
    return {
      mostSimilarEvent: {
        name: event.name,
        date: event.date,
        severity: event.severity,
        category: event.category,
      },
      similarity: similarityResult.similarity,
      confidence: similarityResult.confidence,
      predictedReboundProbability: reboundResult.probability,
      predictedReboundMagnitude: reboundResult.magnitude,
    };
  } catch (error) {
    console.error('扩展历史分析失败:', error);
    return null;
  }
}

/**
 * 自适应模型选择
 */
function performAdaptiveModelSelection(marketState: MarketState): PhaseOneCalibrationResult['adaptiveModelSelection'] | null {
  try {
    // 转换市场状态格式
    const adaptiveState: AdaptiveMarketState = {
      price: marketState.price,
      previousPrice: marketState.previousPrice,
      priceHistory: marketState.priceHistory,
      volume: marketState.volume,
      volumeHistory: Array(marketState.priceHistory.length).fill(marketState.volume),
      vix: marketState.vix || 20,
      rsi: marketState.rsi,
      momentum: calculateMomentumFromPrices(marketState.priceHistory),
      volatility: marketState.volatility,
      sentiment: marketState.sentiment,
      macd: 0,
      macdSignal: 0,
      bollingerPosition: 0.5,
      atr: marketState.price * marketState.volatility,
      trendStrength: 0.5,
      trendDirection: 'neutral',
    };
    
    // 计算趋势
    const trend = calculateTrend(marketState.priceHistory);
    adaptiveState.trendDirection = trend.direction;
    adaptiveState.trendStrength = trend.strength;
    
    // 选择最优模型
    const result = selectOptimalModel(adaptiveState);
    
    if (!result) return null;
    
    return {
      selectedModel: result.selectedModel,
      confidence: result.confidence,
      reasoning: result.reasoning,
      modelWeights: result.modelConfigs.map(m => ({
        model: m.model,
        weight: m.weight,
        confidence: m.confidence,
      })),
    };
  } catch (error) {
    console.error('自适应模型选择失败:', error);
    return null;
  }
}

/**
 * 从价格历史计算动量
 */
function calculateMomentumFromPrices(priceHistory: number[]): number {
  if (priceHistory.length < 2) return 0;
  
  const recent = priceHistory.slice(-5);
  const older = priceHistory.slice(-10, -5);
  
  if (older.length === 0) return 0;
  
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
  
  return (recentAvg - olderAvg) / olderAvg;
}

/**
 * 应用自适应调整
 */
function applyAdaptiveAdjustment(
  prediction: number,
  adaptiveResult: AdaptivePredictionResult,
  marketState: MarketState
): number {
  let adjustment = 0;
  
  // 根据选择的模型应用不同的调整
  switch (adaptiveResult.selectedModel) {
    case PredictionModel.EXTREME_EVENT:
      // 极端事件：放大预测幅度
      // 但在极端超卖情况下，减少放大效果
      if (marketState.sentiment < 0) {
        // 如果RSI极度超卖，不放大看跌预测
        if (marketState.rsi && marketState.rsi < 20) {
          adjustment = (adaptiveResult.confidence - 0.5) * 5; // 减少到原来的1/3
        } else if (marketState.rsi && marketState.rsi < 25) {
          adjustment = (adaptiveResult.confidence - 0.5) * 10; // 减少到原来的2/3
        } else {
          adjustment = (adaptiveResult.confidence - 0.5) * 15;
        }
      }
      break;
    
    case PredictionModel.REVERSAL:
      // 反转模型：调整方向
      if (adaptiveResult.confidence > 0.7) {
        adjustment = (0.5 - Math.abs(prediction) / 100) * 20 * (adaptiveResult.confidence - 0.5);
      }
      break;
    
    case PredictionModel.MOMENTUM:
      // 动量模型：跟随趋势
      const momentum = calculateMomentumFromPrices(marketState.priceHistory);
      if (momentum > 0 && prediction < 0) {
        adjustment = momentum * 500; // 减弱看空预测
      } else if (momentum < 0 && prediction > 0) {
        adjustment = momentum * 500; // 减弱看多预测
      }
      break;
    
    case PredictionModel.LSTM:
    case PredictionModel.TRANSFORMER:
      // 机器学习模型：小幅调整
      adjustment = (adaptiveResult.confidence - 0.6) * 10;
      break;
    
    case PredictionModel.MULTI_FACTOR:
    case PredictionModel.ENSEMBLE:
      // 多因子模型：中度调整
      adjustment = (adaptiveResult.confidence - 0.5) * 8;
      break;
    
    default:
      adjustment = 0;
  }
  
  return prediction + adjustment;
}

// ==================== 工具函数 ====================

/**
 * 获取市场状态描述
 */
export function getMarketRegimeDescription(regime: string): string {
  const descriptions: Record<string, string> = {
    'TRENDING_UP': '上涨趋势 - 建议使用动量模型',
    'TRENDING_DOWN': '下跌趋势 - 建议使用动量模型，注意超跌反弹',
    'SIDEWAYS': '震荡市场 - 建议使用多因子模型',
    'VOLATILE': '高波动市场 - 建议使用多因子和反转模型',
    'CRASH': '崩盘市场 - 建议使用极端事件模型，注意反弹机会',
    'RECOVERY': '恢复阶段 - 建议使用反转模型',
  };
  
  return descriptions[regime] || '未知市场状态';
}

/**
 * 获取模型选择建议
 */
export function getModelSelectionAdvice(result: AdaptivePredictionResult): string {
  const primaryModel = result.modelConfigs[0];
  
  const advice: Record<PredictionModel, string> = {
    [PredictionModel.LSTM]: 'LSTM模型擅长捕获时序依赖，适合短期预测',
    [PredictionModel.TRANSFORMER]: 'Transformer模型擅长捕获长距离依赖，适合中期趋势',
    [PredictionModel.MULTI_FACTOR]: '多因子模型综合多种信号，适合稳健预测',
    [PredictionModel.MOMENTUM]: '动量模型跟随趋势，适合趋势市场',
    [PredictionModel.REVERSAL]: '反转模型预测均值回归，适合超买超卖',
    [PredictionModel.EXTREME_EVENT]: '极端事件模型专门处理黑天鹅事件',
    [PredictionModel.ENSEMBLE]: '集成模型综合多个模型，适合不确定市场',
  };
  
  return `${advice[primaryModel.model]} (置信度: ${(primaryModel.confidence * 100).toFixed(0)}%)`;
}

// ==================== 导出 ====================

export type {
  PhaseOneCalibrationConfig,
  PhaseOneCalibrationResult,
};
