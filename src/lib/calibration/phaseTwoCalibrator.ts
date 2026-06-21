/**
 * Phase 2 优化版预测校准器
 * 
 * 集成：
 * 1. LSTM 时序预测模型
 * 2. 多周期共振分析
 * 3. Phase 1 的所有功能（扩展历史事件库 + 自适应模型选择）
 */

// ==================== 导入 ====================

import {
  phaseOneCalibratePrediction,
  PhaseOneCalibrationResult,
  PhaseOneCalibrationConfig,
  DEFAULT_PHASE_ONE_CONFIG,
} from './phaseOneCalibrator';

import {
  MarketState,
} from './predictionCalibrator';

import {
  LSTMPredictor,
  LSTMPrediction,
  prepareLSTMInputFromPrices,
  createLSTMPredictor,
} from '../ml/lstmPredictor';

import {
  calculateResonance,
  generateWeeklyPrices,
  generateMonthlyPrices,
  getResonanceDescription,
  ResonanceResult,
  ResonanceLevel,
} from './multiPeriodResonance';

// ==================== 类型定义 ====================

export interface PhaseTwoCalibrationConfig extends PhaseOneCalibrationConfig {
  // 启用 LSTM 预测
  enableLSTM: boolean;
  lstmWeight: number;
  
  // 启用多周期共振
  enableMultiPeriodResonance: boolean;
  resonanceWeight: number;
  
  // LSTM 配置
  lstmSequenceLength: number;
  lstmHiddenSize: number;
}

export const DEFAULT_PHASE_TWO_CONFIG: PhaseTwoCalibrationConfig = {
  ...DEFAULT_PHASE_ONE_CONFIG,
  enableLSTM: true,
  lstmWeight: 0.15,
  enableMultiPeriodResonance: true,
  resonanceWeight: 0.20,
  lstmSequenceLength: 20,
  lstmHiddenSize: 64,
};

export interface PhaseTwoCalibrationResult extends PhaseOneCalibrationResult {
  // LSTM 预测结果
  lstmPrediction?: LSTMPrediction;
  
  // 多周期共振结果
  resonanceAnalysis?: ResonanceResult;
  
  // 增强的因子
  enhancedFactors: {
    lstmFactor: number;
    resonanceFactor: number;
    phaseOneFactors: PhaseOneCalibrationResult['factors'];
  };
}

// ==================== 核心校准函数 ====================

/**
 * Phase 2 优化版预测校准
 */
export function phaseTwoCalibratePrediction(
  originalPrediction: number,
  marketState: MarketState,
  config: PhaseTwoCalibrationConfig = DEFAULT_PHASE_TWO_CONFIG
): PhaseTwoCalibrationResult {
  
  // 1. 首先进行 Phase 1 校准
  const phaseOneResult = phaseOneCalibratePrediction(originalPrediction, marketState, config);
  
  let calibratedPrediction = phaseOneResult.calibratedPrediction;
  let confidence = phaseOneResult.confidence;
  
  // 初始化增强因子
  const enhancedFactors = {
    lstmFactor: 1.0,
    resonanceFactor: 1.0,
    phaseOneFactors: phaseOneResult.factors,
  };
  
  let lstmPrediction: LSTMPrediction | undefined;
  let resonanceAnalysis: ResonanceResult | undefined;
  
  // 2. LSTM 时序预测
  if (config.enableLSTM && marketState.priceHistory.length >= config.lstmSequenceLength) {
    lstmPrediction = runLSTMPrediction(marketState, config);
    
    if (lstmPrediction) {
      // 应用 LSTM 因子
      enhancedFactors.lstmFactor = lstmPrediction.confidence / 100;
      
      // 根据 LSTM 预测调整校准预测
      const lstmAdjustment = calculateLSTMAdjustment(lstmPrediction, calibratedPrediction);
      
      // 在极端超卖情况下，减少LSTM看跌信号的权重
      let lstmWeight = config.lstmWeight;
      if (marketState.rsi && marketState.rsi < 20 && lstmAdjustment < 0) {
        // RSI极度超卖时，如果LSTM预测下跌，减少其权重
        lstmWeight *= 0.3;
      } else if (marketState.rsi && marketState.rsi < 25 && lstmAdjustment < 0) {
        lstmWeight *= 0.5;
      }
      
      calibratedPrediction += lstmAdjustment * lstmWeight;
      
      // 调整置信度
      confidence += lstmPrediction.confidence * config.lstmWeight * 0.5;
    }
  }
  
  // 3. 多周期共振分析
  if (config.enableMultiPeriodResonance && marketState.priceHistory.length >= 60) {
    resonanceAnalysis = runResonanceAnalysis(marketState);
    
    if (resonanceAnalysis) {
      // 应用共振因子
      enhancedFactors.resonanceFactor = resonanceAnalysis.confidence / 100;
      
      // 根据共振结果调整校准预测
      const resonanceAdjustment = calculateResonanceAdjustment(resonanceAnalysis, calibratedPrediction);
      calibratedPrediction += resonanceAdjustment * config.resonanceWeight;
      
      // 调整置信度
      if (resonanceAnalysis.signals.isResonance) {
        confidence += resonanceAnalysis.confidence * config.resonanceWeight * 0.8;
      } else if (resonanceAnalysis.signals.isDivergence) {
        confidence -= resonanceAnalysis.confidence * config.resonanceWeight * 0.3;
      }
    }
  }
  
  // 4. 限制范围
  calibratedPrediction = Math.max(-100, Math.min(100, calibratedPrediction));
  confidence = Math.max(15, Math.min(95, confidence));
  
  return {
    ...phaseOneResult,
    calibratedPrediction,
    confidence,
    lstmPrediction,
    resonanceAnalysis,
    enhancedFactors,
  };
}

// ==================== 辅助函数 ====================

/**
 * 运行 LSTM 预测
 */
function runLSTMPrediction(
  marketState: MarketState,
  config: PhaseTwoCalibrationConfig
): LSTMPrediction | undefined {
  try {
    // 准备 LSTM 输入
    const lstmInput = prepareLSTMInputFromPrices(marketState.priceHistory);
    
    if (lstmInput.length < config.lstmSequenceLength) {
      return undefined;
    }
    
    // 创建 LSTM 预测器
    const predictor = createLSTMPredictor({
      sequenceLength: config.lstmSequenceLength,
      hiddenSize: config.lstmHiddenSize,
    });
    
    // 运行预测
    const prediction = predictor.predict(lstmInput.slice(-config.lstmSequenceLength));
    
    return prediction;
  } catch (error) {
    console.error('LSTM 预测失败:', error);
    return undefined;
  }
}

/**
 * 计算 LSTM 调整量
 */
function calculateLSTMAdjustment(
  lstmPrediction: LSTMPrediction,
  currentPrediction: number
): number {
  // 基于 LSTM 的趋势概率调整
  const lstmTrendScore = 
    (lstmPrediction.trendProbability.up - lstmPrediction.trendProbability.down) / 100 * 50;
  
  // 基于 LSTM 推荐调整
  let recommendationAdjustment = 0;
  if (lstmPrediction.recommendation === 'BUY') {
    recommendationAdjustment = lstmPrediction.signalStrength * 0.3;
  } else if (lstmPrediction.recommendation === 'SELL') {
    recommendationAdjustment = -lstmPrediction.signalStrength * 0.3;
  }
  
  // 综合调整
  const totalAdjustment = lstmTrendScore + recommendationAdjustment;
  
  // 如果 LSTM 预测与当前预测方向一致，增强信号
  if (Math.sign(totalAdjustment) === Math.sign(currentPrediction)) {
    return totalAdjustment * 1.2;
  }
  
  // 如果方向相反，减弱调整
  return totalAdjustment * 0.5;
}

/**
 * 运行多周期共振分析
 */
function runResonanceAnalysis(
  marketState: MarketState
): ResonanceResult | undefined {
  try {
    // 生成周和月价格
    const weeklyPrices = generateWeeklyPrices(marketState.priceHistory);
    const monthlyPrices = generateMonthlyPrices(marketState.priceHistory);
    
    if (weeklyPrices.length < 5 || monthlyPrices.length < 3) {
      return undefined;
    }
    
    // 计算共振
    const resonance = calculateResonance(
      marketState.priceHistory,
      weeklyPrices,
      monthlyPrices
    );
    
    return resonance;
  } catch (error) {
    console.error('多周期共振分析失败:', error);
    return undefined;
  }
}

/**
 * 计算共振调整量
 */
function calculateResonanceAdjustment(
  resonance: ResonanceResult,
  currentPrediction: number
): number {
  // 基于共振分数调整
  const resonanceScore = resonance.score;
  
  // 基于共振级别调整
  let levelAdjustment = 0;
  
  switch (resonance.level) {
    case ResonanceLevel.STRONG_BULLISH:
      levelAdjustment = 30;
      break;
    case ResonanceLevel.BULLISH:
      levelAdjustment = 20;
      break;
    case ResonanceLevel.STRONG_BEARISH:
      levelAdjustment = -30;
      break;
    case ResonanceLevel.BEARISH:
      levelAdjustment = -20;
      break;
    case ResonanceLevel.DIVERGENCE:
      // 背离时减弱当前预测
      levelAdjustment = -Math.sign(currentPrediction) * 15;
      break;
    case ResonanceLevel.NEUTRAL:
      levelAdjustment = 0;
      break;
  }
  
  // 综合调整
  const totalAdjustment = resonanceScore * 0.3 + levelAdjustment;
  
  // 如果共振与当前预测方向一致，增强信号
  if (resonance.signals.isResonance && Math.sign(totalAdjustment) === Math.sign(currentPrediction)) {
    return totalAdjustment * 1.3;
  }
  
  // 如果背离，减弱信号
  if (resonance.signals.isDivergence) {
    return totalAdjustment * 0.3;
  }
  
  return totalAdjustment;
}

// ==================== 报告生成 ====================

/**
 * 生成 Phase 2 预测报告
 */
export function generatePhaseTwoReport(result: PhaseTwoCalibrationResult): string {
  const lines: string[] = [];
  
  lines.push('## Phase 2 优化预测报告');
  lines.push('');
  
  // 基础预测
  lines.push('### 📊 预测结果');
  lines.push(`**原始情绪**: ${result.originalPrediction.toFixed(0)}`);
  lines.push(`**校准情绪**: ${result.calibratedPrediction.toFixed(0)}`);
  lines.push(`**置信度**: ${result.confidence.toFixed(0)}%`);
  lines.push(`**市场状态**: ${result.marketRegime}`);
  lines.push('');
  
  // LSTM 预测
  if (result.lstmPrediction) {
    lines.push('### 🧠 LSTM 时序预测');
    lines.push(`**预测价格**: ¥${result.lstmPrediction.predictedPrice.toFixed(2)}`);
    lines.push(`**预测 RSI**: ${result.lstmPrediction.predictedRSI.toFixed(1)}`);
    lines.push(`**上涨概率**: ${result.lstmPrediction.trendProbability.up}%`);
    lines.push(`**下跌概率**: ${result.lstmPrediction.trendProbability.down}%`);
    lines.push(`**推荐**: ${result.lstmPrediction.recommendation}`);
    lines.push(`**信号强度**: ${result.lstmPrediction.signalStrength}%`);
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
    lines.push(`**建议**: ${result.resonanceAnalysis.recommendation.reasoning}`);
    lines.push('');
  }
  
  // 增强因子
  lines.push('### 🔧 增强因子');
  lines.push(`**LSTM 因子**: ${result.enhancedFactors.lstmFactor.toFixed(2)}`);
  lines.push(`**共振因子**: ${result.enhancedFactors.resonanceFactor.toFixed(2)}`);
  lines.push('');
  
  // 信号
  lines.push('### 📡 信号');
  lines.push(`**极端事件**: ${result.signals.isExtremeEvent ? '✅' : '❌'}`);
  lines.push(`**超跌反弹**: ${result.signals.isOversold ? '✅' : '❌'}`);
  lines.push(`**反转信号**: ${result.signals.isReversalLikely ? '✅' : '❌'}`);
  
  return lines.join('\n');
}

// ==================== 导出 ====================

export type {
  PhaseTwoCalibrationConfig,
  PhaseTwoCalibrationResult,
};