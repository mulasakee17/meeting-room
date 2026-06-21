/**
 * Phase 3 优化版预测校准器
 * 
 * 集成：
 * 1. LSTM 时序预测模型
 * 2. Transformer 时序预测模型
 * 3. 多周期共振分析
 * 4. 多模型融合策略
 * 5. 动态权重调整
 * 6. 置信度校准
 */

// ==================== 导入 ====================

import {
  phaseTwoCalibratePrediction,
  PhaseTwoCalibrationResult,
  PhaseTwoCalibrationConfig,
  DEFAULT_PHASE_TWO_CONFIG,
} from './phaseTwoCalibrator';

import {
  MarketState,
} from './predictionCalibrator';

import {
  TransformerTimeSeries,
  TransformerPrediction,
  createTransformer,
} from '../ml/transformer';

import {
  LSTMPrediction,
} from '../ml/lstmPredictor';

import {
  ResonanceResult,
  ResonanceLevel,
} from './multiPeriodResonance';

// ==================== 类型定义 ====================

export interface ModelWeights {
  lstm: number;
  transformer: number;
  resonance: number;
  blackSwan: number;
  adaptive: number;
}

export interface PhaseThreeCalibrationConfig extends PhaseTwoCalibrationConfig {
  // 启用 Transformer 预测
  enableTransformer: boolean;
  transformerWeight: number;
  
  // Transformer 配置
  transformerSequenceLength: number;
  transformerHiddenSize: number;
  transformerNumHeads: number;
  
  // 模型融合策略
  fusionStrategy: 'weighted_average' | 'dynamic' | 'ensemble';
  
  // 置信度校准
  enableConfidenceCalibration: boolean;
}

export const DEFAULT_PHASE_THREE_CONFIG: PhaseThreeCalibrationConfig = {
  ...DEFAULT_PHASE_TWO_CONFIG,
  enableTransformer: true,
  transformerWeight: 0.18,
  transformerSequenceLength: 60,
  transformerHiddenSize: 128,
  transformerNumHeads: 4,
  fusionStrategy: 'dynamic',
  enableConfidenceCalibration: true,
};

export interface PhaseThreeCalibrationResult extends PhaseTwoCalibrationResult {
  // Transformer 预测结果
  transformerPrediction?: TransformerPrediction;
  
  // 模型融合结果
  modelFusion: {
    lstmWeight: number;
    transformerWeight: number;
    resonanceWeight: number;
    fusionScore: number;
    agreement: 'strong' | 'moderate' | 'weak' | 'divergent';
  };
  
  // 置信度校准
  calibratedConfidence: {
    original: number;
    calibrated: number;
    calibrationMethod: string;
  };
  
  // 增强的因子
  enhancedFactors: {
    lstmFactor: number;
    transformerFactor: number;
    resonanceFactor: number;
    phaseTwoFactors: PhaseTwoCalibrationResult['enhancedFactors'];
  };
}

// ==================== 核心校准函数 ====================

/**
 * Phase 3 优化版预测校准
 */
export function phaseThreeCalibratePrediction(
  originalPrediction: number,
  marketState: MarketState,
  config: PhaseThreeCalibrationConfig = DEFAULT_PHASE_THREE_CONFIG
): PhaseThreeCalibrationResult {
  
  // 1. 首先进行 Phase 2 校准
  const phaseTwoResult = phaseTwoCalibratePrediction(originalPrediction, marketState, config);
  
  let calibratedPrediction = phaseTwoResult.calibratedPrediction;
  let confidence = phaseTwoResult.confidence;
  
  // 初始化增强因子
  const enhancedFactors = {
    lstmFactor: phaseTwoResult.enhancedFactors.lstmFactor,
    transformerFactor: 1.0,
    resonanceFactor: phaseTwoResult.enhancedFactors.resonanceFactor,
    phaseTwoFactors: phaseTwoResult.enhancedFactors,
  };
  
  let transformerPrediction: TransformerPrediction | undefined;
  let modelFusion: PhaseThreeCalibrationResult['modelFusion'] = {
    lstmWeight: config.lstmWeight,
    transformerWeight: config.transformerWeight,
    resonanceWeight: config.resonanceWeight,
    fusionScore: 0,
    agreement: 'moderate',
  };
  
  // 2. Transformer 时序预测
  if (config.enableTransformer && marketState.priceHistory.length >= config.transformerSequenceLength) {
    transformerPrediction = runTransformerPrediction(marketState, config);
    
    if (transformerPrediction) {
      // 应用 Transformer 因子
      enhancedFactors.transformerFactor = transformerPrediction.confidence / 100;
      
      // 根据 Transformer 预测调整校准预测
      const transformerAdjustment = calculateTransformerAdjustment(transformerPrediction, calibratedPrediction);
      calibratedPrediction += transformerAdjustment * config.transformerWeight;
      
      // 调整置信度
      confidence += transformerPrediction.confidence * config.transformerWeight * 0.4;
    }
  }
  
  // 3. 多模型融合
  if (config.fusionStrategy !== 'weighted_average') {
    modelFusion = performModelFusion(
      phaseTwoResult.lstmPrediction,
      transformerPrediction,
      phaseTwoResult.resonanceAnalysis,
      calibratedPrediction,
      config
    );
    
    // 根据融合分数调整预测
    calibratedPrediction = applyFusionAdjustment(calibratedPrediction, modelFusion);
  }
  
  // 4. 置信度校准
  let calibratedConfidence: PhaseThreeCalibrationResult['calibratedConfidence'] = {
    original: confidence,
    calibrated: confidence,
    calibrationMethod: 'none',
  };
  
  if (config.enableConfidenceCalibration) {
    calibratedConfidence = calibrateConfidence(
      confidence,
      phaseTwoResult.lstmPrediction,
      transformerPrediction,
      phaseTwoResult.resonanceAnalysis,
      modelFusion
    );
    confidence = calibratedConfidence.calibrated;
  }
  
  // 5. 限制范围
  calibratedPrediction = Math.max(-100, Math.min(100, calibratedPrediction));
  confidence = Math.max(15, Math.min(95, confidence));
  
  return {
    ...phaseTwoResult,
    calibratedPrediction,
    confidence,
    transformerPrediction,
    modelFusion,
    calibratedConfidence,
    enhancedFactors,
  };
}

// ==================== Transformer 预测 ====================

/**
 * 运行 Transformer 预测
 */
function runTransformerPrediction(
  marketState: MarketState,
  config: PhaseThreeCalibrationConfig
): TransformerPrediction | undefined {
  try {
    // 创建 Transformer 预测器
    const transformer = createTransformer({
      sequenceLength: config.transformerSequenceLength,
      hiddenSize: config.transformerHiddenSize,
      numHeads: config.transformerNumHeads,
      forecastLength: 7,
    });
    
    // 运行预测
    const prediction = transformer.predict(marketState.priceHistory);
    
    return prediction;
  } catch (error) {
    console.error('Transformer 预测失败:', error);
    return undefined;
  }
}

/**
 * 计算 Transformer 调整量
 */
function calculateTransformerAdjustment(
  transformerPrediction: TransformerPrediction,
  currentPrediction: number
): number {
  // 基于 Transformer 的趋势概率调整
  const trendScore = 
    (transformerPrediction.upProbability - transformerPrediction.downProbability) / 100 * 50;
  
  // 基于置信度调整
  const confidenceFactor = transformerPrediction.confidence / 100;
  
  // 综合调整
  const totalAdjustment = trendScore * confidenceFactor;
  
  // 如果 Transformer 预测与当前预测方向一致，增强信号
  if (Math.sign(totalAdjustment) === Math.sign(currentPrediction)) {
    return totalAdjustment * 1.15;
  }
  
  // 如果方向相反，减弱调整
  return totalAdjustment * 0.6;
}

// ==================== 多模型融合 ====================

/**
 * 执行多模型融合
 */
function performModelFusion(
  lstmPrediction: LSTMPrediction | undefined,
  transformerPrediction: TransformerPrediction | undefined,
  resonanceAnalysis: ResonanceResult | undefined,
  currentPrediction: number,
  config: PhaseThreeCalibrationConfig
): PhaseThreeCalibrationResult['modelFusion'] {
  
  // 收集各模型的预测方向
  const predictions: number[] = [];
  const weights: number[] = [];
  
  // LSTM 预测
  if (lstmPrediction) {
    const lstmDirection = (lstmPrediction.trendProbability.up - lstmPrediction.trendProbability.down) / 100;
    predictions.push(lstmDirection);
    weights.push(config.lstmWeight * (lstmPrediction.confidence / 100));
  }
  
  // Transformer 预测
  if (transformerPrediction) {
    const transformerDirection = (transformerPrediction.upProbability - transformerPrediction.downProbability) / 100;
    predictions.push(transformerDirection);
    weights.push(config.transformerWeight * (transformerPrediction.confidence / 100));
  }
  
  // 共振分析
  if (resonanceAnalysis) {
    let resonanceDirection = 0;
    switch (resonanceAnalysis.level) {
      case ResonanceLevel.STRONG_BULLISH:
        resonanceDirection = 1;
        break;
      case ResonanceLevel.BULLISH:
        resonanceDirection = 0.6;
        break;
      case ResonanceLevel.STRONG_BEARISH:
        resonanceDirection = -1;
        break;
      case ResonanceLevel.BEARISH:
        resonanceDirection = -0.6;
        break;
      case ResonanceLevel.DIVERGENCE:
        resonanceDirection = -Math.sign(currentPrediction) * 0.3;
        break;
      default:
        resonanceDirection = 0;
    }
    predictions.push(resonanceDirection);
    weights.push(config.resonanceWeight * (resonanceAnalysis.confidence / 100));
  }
  
  // 计算加权平均
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let fusionScore = 0;
  
  if (totalWeight > 0 && predictions.length > 0) {
    fusionScore = predictions.reduce((sum, pred, i) => sum + pred * weights[i], 0) / totalWeight;
  }
  
  // 计算模型一致性
  const agreement = calculateModelAgreement(predictions);
  
  // 动态调整权重
  let lstmWeight = config.lstmWeight;
  let transformerWeight = config.transformerWeight;
  let resonanceWeight = config.resonanceWeight;
  
  if (config.fusionStrategy === 'dynamic') {
    // 根据模型一致性动态调整权重
    if (agreement === 'strong') {
      // 模型一致时，增强权重
      lstmWeight *= 1.2;
      transformerWeight *= 1.2;
      resonanceWeight *= 1.3;
    } else if (agreement === 'divergent') {
      // 模型分歧时，减弱权重
      lstmWeight *= 0.7;
      transformerWeight *= 0.7;
      resonanceWeight *= 0.6;
    }
  }
  
  return {
    lstmWeight,
    transformerWeight,
    resonanceWeight,
    fusionScore: fusionScore * 100,
    agreement,
  };
}

/**
 * 计算模型一致性
 */
function calculateModelAgreement(predictions: number[]): 'strong' | 'moderate' | 'weak' | 'divergent' {
  if (predictions.length < 2) {
    return 'moderate';
  }
  
  // 计算预测方向的一致性
  const positiveCount = predictions.filter(p => p > 0.1).length;
  const negativeCount = predictions.filter(p => p < -0.1).length;
  const neutralCount = predictions.filter(p => p >= -0.1 && p <= 0.1).length;
  
  const total = predictions.length;
  const maxAgreement = Math.max(positiveCount, negativeCount, neutralCount);
  const agreementRatio = maxAgreement / total;
  
  if (agreementRatio >= 0.8) {
    return 'strong';
  } else if (agreementRatio >= 0.6) {
    return 'moderate';
  } else if (agreementRatio >= 0.4) {
    return 'weak';
  } else {
    return 'divergent';
  }
}

/**
 * 应用融合调整
 */
function applyFusionAdjustment(
  currentPrediction: number,
  modelFusion: PhaseThreeCalibrationResult['modelFusion']
): number {
  const fusionAdjustment = modelFusion.fusionScore * 0.3;
  
  // 根据一致性调整
  let multiplier = 1.0;
  
  switch (modelFusion.agreement) {
    case 'strong':
      multiplier = 1.3;
      break;
    case 'moderate':
      multiplier = 1.0;
      break;
    case 'weak':
      multiplier = 0.7;
      break;
    case 'divergent':
      multiplier = 0.4;
      break;
  }
  
  return currentPrediction + fusionAdjustment * multiplier;
}

// ==================== 置信度校准 ====================

/**
 * 校准置信度
 */
function calibrateConfidence(
  originalConfidence: number,
  lstmPrediction: LSTMPrediction | undefined,
  transformerPrediction: TransformerPrediction | undefined,
  resonanceAnalysis: ResonanceResult | undefined,
  modelFusion: PhaseThreeCalibrationResult['modelFusion']
): PhaseThreeCalibrationResult['calibratedConfidence'] {
  
  let calibrated = originalConfidence;
  const adjustments: string[] = [];
  
  // 1. 基于模型一致性调整
  switch (modelFusion.agreement) {
    case 'strong':
      calibrated *= 1.15;
      adjustments.push('模型一致性强 (+15%)');
      break;
    case 'moderate':
      // 保持不变
      adjustments.push('模型一致性中等');
      break;
    case 'weak':
      calibrated *= 0.9;
      adjustments.push('模型一致性弱 (-10%)');
      break;
    case 'divergent':
      calibrated *= 0.75;
      adjustments.push('模型分歧 (-25%)');
      break;
  }
  
  // 2. 基于 LSTM 置信度调整
  if (lstmPrediction) {
    const lstmConfidenceDiff = lstmPrediction.confidence - 50;
    calibrated += lstmConfidenceDiff * 0.1;
    adjustments.push(`LSTM 置信度调整 (${lstmConfidenceDiff > 0 ? '+' : ''}${(lstmConfidenceDiff * 0.1).toFixed(1)}%)`);
  }
  
  // 3. 基于 Transformer 置信度调整
  if (transformerPrediction) {
    const transformerConfidenceDiff = transformerPrediction.confidence - 50;
    calibrated += transformerConfidenceDiff * 0.08;
    adjustments.push(`Transformer 置信度调整 (${transformerConfidenceDiff > 0 ? '+' : ''}${(transformerConfidenceDiff * 0.08).toFixed(1)}%)`);
  }
  
  // 4. 基于共振分析调整
  if (resonanceAnalysis) {
    if (resonanceAnalysis.signals.isResonance) {
      calibrated *= 1.1;
      adjustments.push('共振信号 (+10%)');
    } else if (resonanceAnalysis.signals.isDivergence) {
      calibrated *= 0.85;
      adjustments.push('背离信号 (-15%)');
    }
  }
  
  // 5. 限制范围
  calibrated = Math.max(15, Math.min(95, calibrated));
  
  return {
    original: originalConfidence,
    calibrated,
    calibrationMethod: adjustments.join('; '),
  };
}

// ==================== 报告生成 ====================

/**
 * 生成 Phase 3 预测报告
 */
export function generatePhaseThreeReport(result: PhaseThreeCalibrationResult): string {
  const lines: string[] = [];
  
  lines.push('## Phase 3 优化预测报告');
  lines.push('');
  
  // 基础预测
  lines.push('### 📊 预测结果');
  lines.push(`**原始情绪**: ${result.originalPrediction.toFixed(0)}`);
  lines.push(`**校准情绪**: ${result.calibratedPrediction.toFixed(0)}`);
  lines.push(`**置信度**: ${result.confidence.toFixed(0)}%`);
  lines.push(`**市场状态**: ${result.marketRegime}`);
  lines.push('');
  
  // Transformer 预测
  if (result.transformerPrediction) {
    lines.push('### 🤖 Transformer 时序预测');
    lines.push(`**预测价格**: ¥${result.transformerPrediction.predictedPrice.toFixed(2)}`);
    lines.push(`**价格区间**: ¥${result.transformerPrediction.priceRange[0].toFixed(2)} - ¥${result.transformerPrediction.priceRange[1].toFixed(2)}`);
    lines.push(`**上涨概率**: ${result.transformerPrediction.upProbability.toFixed(1)}%`);
    lines.push(`**下跌概率**: ${result.transformerPrediction.downProbability.toFixed(1)}%`);
    lines.push(`**置信度**: ${result.transformerPrediction.confidence.toFixed(1)}%`);
    lines.push('');
  }
  
  // LSTM 预测
  if (result.lstmPrediction) {
    lines.push('### 🧠 LSTM 时序预测');
    lines.push(`**预测价格**: ¥${result.lstmPrediction.predictedPrice.toFixed(2)}`);
    lines.push(`**预测 RSI**: ${result.lstmPrediction.predictedRSI.toFixed(1)}`);
    lines.push(`**上涨概率**: ${result.lstmPrediction.trendProbability.up}%`);
    lines.push(`**下跌概率**: ${result.lstmPrediction.trendProbability.down}%`);
    lines.push(`**推荐**: ${result.lstmPrediction.recommendation}`);
    lines.push('');
  }
  
  // 多周期共振
  if (result.resonanceAnalysis) {
    lines.push('### 📈 多周期共振分析');
    lines.push(`**共振级别**: ${getResonanceDescription(result.resonanceAnalysis)}`);
    lines.push(`**共振分数**: ${result.resonanceAnalysis.score.toFixed(0)}`);
    lines.push(`**日趋势**: ${result.resonanceAnalysis.periods.daily.trend}`);
    lines.push(`**周趋势**: ${result.resonanceAnalysis.periods.weekly.trend}`);
    lines.push(`**月趋势**: ${result.resonanceAnalysis.periods.monthly.trend}`);
    lines.push('');
  }
  
  // 模型融合
  lines.push('### 🔀 模型融合');
  lines.push(`**融合分数**: ${result.modelFusion.fusionScore.toFixed(2)}`);
  lines.push(`**模型一致性**: ${result.modelFusion.agreement}`);
  lines.push(`**LSTM 权重**: ${(result.modelFusion.lstmWeight * 100).toFixed(1)}%`);
  lines.push(`**Transformer 权重**: ${(result.modelFusion.transformerWeight * 100).toFixed(1)}%`);
  lines.push(`**共振权重**: ${(result.modelFusion.resonanceWeight * 100).toFixed(1)}%`);
  lines.push('');
  
  // 置信度校准
  lines.push('### 🎯 置信度校准');
  lines.push(`**原始置信度**: ${result.calibratedConfidence.original.toFixed(1)}%`);
  lines.push(`**校准置信度**: ${result.calibratedConfidence.calibrated.toFixed(1)}%`);
  lines.push(`**校准方法**: ${result.calibratedConfidence.calibrationMethod}`);
  lines.push('');
  
  // 增强因子
  lines.push('### 🔧 增强因子');
  lines.push(`**LSTM 因子**: ${result.enhancedFactors.lstmFactor.toFixed(2)}`);
  lines.push(`**Transformer 因子**: ${result.enhancedFactors.transformerFactor.toFixed(2)}`);
  lines.push(`**共振因子**: ${result.enhancedFactors.resonanceFactor.toFixed(2)}`);
  lines.push('');
  
  // 信号
  lines.push('### 📡 信号');
  lines.push(`**极端事件**: ${result.signals.isExtremeEvent ? '✅' : '❌'}`);
  lines.push(`**超跌反弹**: ${result.signals.isOversold ? '✅' : '❌'}`);
  lines.push(`**反转信号**: ${result.signals.isReversalLikely ? '✅' : '❌'}`);
  
  return lines.join('\n');
}

/**
 * 获取共振描述
 */
function getResonanceDescription(resonance: ResonanceResult): string {
  switch (resonance.level) {
    case ResonanceLevel.STRONG_BULLISH:
      return '🟢 强烈看涨共振';
    case ResonanceLevel.BULLISH:
      return '🟢 看涨共振';
    case ResonanceLevel.STRONG_BEARISH:
      return '🔴 强烈看跌共振';
    case ResonanceLevel.BEARISH:
      return '🔴 看跌共振';
    case ResonanceLevel.DIVERGENCE:
      return '🟡 趋势背离';
    default:
      return '⚪ 中性';
  }
}

// ==================== 导出 ====================

export type {
  PhaseThreeCalibrationConfig,
  PhaseThreeCalibrationResult,
  ModelWeights,
};