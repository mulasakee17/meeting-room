/**
 * 事件分类器 — 区分市场反弹形态
 *
 * 核心功能：
 *   根据多维特征将极端市场事件分类为 V/L/W/U 型反弹模式，
 *   从而将预测路由到最合适的预测引擎（校准系统 vs LLM）。
 *
 * 分类目标：
 *   - V_REBOUND:      恐慌性V型反弹（政策响应快，流动性注入，超跌反弹）
 *   - L_DECLINE:      结构性长期下跌（基本面恶化，政策无力，杠杆踩踏）
 *   - W_RECOVERY:     二次探底后回升（政策滞后，信心恢复慢）
 *   - U_SLOW_RECOVERY: 缓慢U型复苏（估值回归，无强催化）
 *   - UNKNOWN:        信号不足，使用集成预测
 *
 * 设计依据：回测发现校准系统擅长 V 型反弹，LLM 擅长 L/W 型下跌。
 * 如果能准确分类事件类型，合并准确率可从 43% 提升至 70%+。
 */

import {
  EXTENDED_BLACK_SWAN_DATABASE,
  ExtendedBlackSwan,
  findMostSimilarEvent,
} from "./extendedBlackSwanDatabase";

// ==================== 枚举定义 ====================

export enum RecoveryPattern {
  V_REBOUND = "V_REBOUND",
  L_DECLINE = "L_DECLINE",
  W_RECOVERY = "W_RECOVERY",
  U_SLOW_RECOVERY = "U_SLOW_RECOVERY",
  UNKNOWN = "UNKNOWN",
}

export enum EventCategory {
  FINANCIAL_CRISIS = "financial",
  GEOPOLITICAL = "geopolitical",
  PANDEMIC = "pandemic",
  NATURAL_DISASTER = "natural_disaster",
  REGULATORY = "regulatory",
  TECH = "tech",
  COMMODITY = "commodity",
}

// ==================== 输入特征 ====================

export interface ClassificationFeatures {
  // 市场技术指标
  vix: number;
  vixPercentile: number; // VIX 在历史中的百分位
  rsi: number;
  rsiDepth: number; // RSI 超卖深度 (30 - rsi, 正值表示超卖)
  volatility: number;
  volatilityRegime: "low" | "normal" | "high" | "extreme";

  // 价格与动量
  dropMagnitude: number; // 已跌幅 (%)
  dropSpeed: number; // 下跌速度 (%/天)
  momentumReversal: boolean; // 是否出现动量反转
  priceLevelVsMA200: number; // 相对于200日均线的位置

  // 成交量和流动性
  volumeSpikeRatio: number;
  volumeTrend: "increasing" | "decreasing" | "stable";
  liquidityCondition: "normal" | "tight" | "frozen";

  // 事件性质
  eventCategory: EventCategory;
  eventSeverity: "medium" | "high" | "extreme" | "catastrophic";
  isSystemicRisk: boolean; // 是否系统性风险
  isContained: boolean; // 风险是否可控

  // 政策响应
  policyResponseSpeed: "immediate" | "fast" | "moderate" | "slow" | "none";
  policyResponseStrength: "strong" | "moderate" | "weak" | "none";
  centralBankAction: boolean; // 央行是否介入
  fiscalStimulus: boolean; // 是否有财政刺激

  // 市场结构
  leverageLevel: "low" | "moderate" | "high" | "extreme";
  institutionalFlowDirection: "inflow" | "outflow" | "neutral";
  retailSentiment: "panic" | "fear" | "neutral" | "greed";

  // 历史相似度
  historicalSimilarityScore: number;
  mostSimilarEventName: string;
  mostSimilarEventPattern: string; // 历史上最相似事件的反弹模式
}

// ==================== 分类结果 ====================

export interface ClassificationResult {
  pattern: RecoveryPattern;
  confidence: number; // 0-100
  probabilityDistribution: Record<RecoveryPattern, number>;

  // 路由建议
  recommendedEngine: "calibration" | "llm" | "ensemble";
  engineWeights: {
    calibration: number; // 校准系统权重
    llm: number; // LLM 推演权重
    ensemble: number; // 集成权重
  };

  // 关键信号
  keySignals: string[];
  riskFactors: string[];
  supportingEvidence: string[];

  // 预测参数
  expectedReboundMagnitude: number; // 预期反弹幅度 (%)
  expectedRecoveryDays: number; // 预期恢复天数
  predictionConfidenceAdjustment: number; // 预测置信度调整因子
}

// ==================== 默认配置 ====================

export interface EventClassifierConfig {
  // 特征权重
  weights: {
    technicalScore: number; // 技术面权重
    policyScore: number; // 政策面权重
    structuralScore: number; // 结构面权重
    historicalSimilarityScore: number; // 历史相似度权重
    sentimentScore: number; // 情绪面权重
  };

  // V型反弹判定阈值
  vReboundThresholds: {
    minPolicySpeed: number; // 最小政策响应速度分数
    minRSIDepth: number; // 最小RSI超卖深度
    maxDropSpeed: number; // 最大下跌速度（太快可能是L型）
    minHistoricalSimilarity: number; // 最小历史相似度
  };

  // L型下跌判定阈值
  lDeclineThresholds: {
    minDropMagnitude: number; // 最小跌幅
    maxPolicySpeed: number; // 最大政策响应速度（太慢则L型）
    minLeverageLevel: number; // 最小杠杆水平
  };
}

export const DEFAULT_CLASSIFIER_CONFIG: EventClassifierConfig = {
  weights: {
    technicalScore: 0.20,
    policyScore: 0.35,
    structuralScore: 0.25,
    historicalSimilarityScore: 0.10,
    sentimentScore: 0.10,
  },
  vReboundThresholds: {
    minPolicySpeed: 0.6,
    minRSIDepth: 10,
    maxDropSpeed: 3.0,
    minHistoricalSimilarity: 0.5,
  },
  lDeclineThresholds: {
    minDropMagnitude: 15,
    maxPolicySpeed: 0.3,
    minLeverageLevel: 0.5,
  },
};

// ==================== 特征提取 ====================

/**
 * 从市场状态和事件信息中提取分类特征
 */
export function extractFeatures(params: {
  vix: number;
  rsi: number;
  volatility: number;
  dropMagnitude: number;
  dropSpeed: number;
  volumeSpikeRatio: number;
  volumeTrend: "increasing" | "decreasing" | "stable";
  eventCategory: EventCategory;
  eventSeverity: "medium" | "high" | "extreme" | "catastrophic";
  policyResponseSpeed: "immediate" | "fast" | "moderate" | "slow" | "none";
  policyResponseStrength: "strong" | "moderate" | "weak" | "none";
  centralBankAction: boolean;
  fiscalStimulus: boolean;
  leverageLevel: "low" | "moderate" | "high" | "extreme";
  isSystemicRisk: boolean;
  isContained: boolean;
  priceHistory?: number[];
}): ClassificationFeatures {
  const rsiDepth = Math.max(0, 30 - params.rsi);

  // VIX 百分位估算
  const vixPercentile = params.vix > 80 ? 99 : params.vix > 60 ? 95 : params.vix > 40 ? 85 : params.vix > 30 ? 70 : params.vix > 20 ? 50 : 30;

  // 波动率体制
  let volatilityRegime: "low" | "normal" | "high" | "extreme";
  if (params.volatility > 0.05) volatilityRegime = "extreme";
  else if (params.volatility > 0.03) volatilityRegime = "high";
  else if (params.volatility > 0.015) volatilityRegime = "normal";
  else volatilityRegime = "low";

  // 流动性状况
  let liquidityCondition: "normal" | "tight" | "frozen";
  if (params.volumeSpikeRatio > 4 && params.volatility > 0.04) liquidityCondition = "frozen";
  else if (params.volumeSpikeRatio > 2.5 || params.volatility > 0.03) liquidityCondition = "tight";
  else liquidityCondition = "normal";

  // 动量反转检测
  const momentumReversal = params.rsi < 30 && params.dropSpeed < 1.0;

  // 零售情绪
  let retailSentiment: ClassificationFeatures["retailSentiment"];
  if (params.vix > 60 && params.rsi < 20) retailSentiment = "panic";
  else if (params.vix > 35 || params.rsi < 30) retailSentiment = "fear";
  else if (params.vix < 20) retailSentiment = "greed";
  else retailSentiment = "neutral";

  // 历史相似度（安全处理 null 返回）
  let historicalSimilarityScore = 0.5;
  let mostSimilarEventName = "无匹配";
  let mostSimilarEventPattern = "未知";

  try {
    const similarEvent = findMostSimilarEvent({
      vix: params.vix,
      rsi: params.rsi,
      volatility: params.volatility,
      volume: params.volumeSpikeRatio * 1e9,
    });
    if (similarEvent && similarEvent.event) {
      historicalSimilarityScore = similarEvent.similarity;
      mostSimilarEventName = similarEvent.event.name;
      mostSimilarEventPattern = similarEvent.event.reboundPattern;
    }
  } catch {
    // 历史匹配失败不影响主流程
  }

  return {
    vix: params.vix,
    vixPercentile,
    rsi: params.rsi,
    rsiDepth,
    volatility: params.volatility,
    volatilityRegime,
    dropMagnitude: params.dropMagnitude,
    dropSpeed: params.dropSpeed,
    momentumReversal,
    priceLevelVsMA200: params.dropMagnitude > 30 ? -30 : -params.dropMagnitude,
    volumeSpikeRatio: params.volumeSpikeRatio,
    volumeTrend: params.volumeTrend,
    liquidityCondition,
    eventCategory: params.eventCategory,
    eventSeverity: params.eventSeverity,
    isSystemicRisk: params.isSystemicRisk,
    isContained: params.isContained,
    policyResponseSpeed: params.policyResponseSpeed,
    policyResponseStrength: params.policyResponseStrength,
    centralBankAction: params.centralBankAction,
    fiscalStimulus: params.fiscalStimulus,
    leverageLevel: params.leverageLevel,
    institutionalFlowDirection: "neutral",
    retailSentiment,
    historicalSimilarityScore,
    mostSimilarEventName,
    mostSimilarEventPattern,
  };
}

// ==================== 核心分类函数 ====================

/**
 * 分类市场反弹模式
 *
 * 核心逻辑：
 * - V型：政策响应快+强，超跌+流动性注入 → 路由到校准系统
 * - L型：政策响应慢+弱，结构性危机+高杠杆 → 路由到LLM系统
 * - W型：政策有但滞后，信心恢复慢 → 集成
 * - U型：慢恢复，估值驱动 → 集成
 */
export function classifyRecoveryPattern(
  features: ClassificationFeatures,
  config: EventClassifierConfig = DEFAULT_CLASSIFIER_CONFIG
): ClassificationResult {
  // 计算各维度分数 (0-1)
  const scores = calculateDimensionScores(features);

  // 计算各模式的概率
  const probabilities = calculatePatternProbabilities(scores, features);

  // 确定最佳分类
  let bestPattern = RecoveryPattern.UNKNOWN;
  let bestProb = 0;
  for (const [pattern, prob] of Object.entries(probabilities)) {
    if (prob > bestProb) {
      bestProb = prob;
      bestPattern = pattern as RecoveryPattern;
    }
  }

  // 计算置信度
  const confidence = calculateClassificationConfidence(probabilities, bestPattern, scores);

  // 生成路由建议
  const { recommendedEngine, engineWeights } = determineEngineRouting(bestPattern, confidence, features);

  // 收集关键信号
  const { keySignals, riskFactors, supportingEvidence } = collectSignals(scores, features, bestPattern);

  // 预测反弹参数
  const { expectedReboundMagnitude, expectedRecoveryDays } = predictReboundParameters(bestPattern, features);

  // 置信度调整因子
  const predictionConfidenceAdjustment = calculateConfidenceAdjustment(bestPattern, confidence, features);

  return {
    pattern: bestPattern,
    confidence,
    probabilityDistribution: probabilities,
    recommendedEngine,
    engineWeights,
    keySignals,
    riskFactors,
    supportingEvidence,
    expectedReboundMagnitude,
    expectedRecoveryDays,
    predictionConfidenceAdjustment,
  };
}

// ==================== 维度分数计算 ====================

interface DimensionScores {
  policyResponsiveness: number; // 0-1, 越高越快
  oversoldDepth: number; // 0-1, 越高越超卖
  structuralDamage: number; // 0-1, 越高结构性问题越严重
  liquiditySupport: number; // 0-1, 越高流动性越好
  historicalVProbability: number; // 0-1, 历史上V型反弹概率
  leverageRisk: number; // 0-1, 越高杠杆风险越大
  eventContainability: number; // 0-1, 越高越可控
  sentimentExtremity: number; // 0-1, 越高情绪越极端
}

function calculateDimensionScores(features: ClassificationFeatures): DimensionScores {
  // 政策响应度
  const policySpeedScore: Record<string, number> = {
    immediate: 1.0, fast: 0.8, moderate: 0.5, slow: 0.2, none: 0.0,
  };
  const policyStrengthScore: Record<string, number> = {
    strong: 1.0, moderate: 0.6, weak: 0.3, none: 0.0,
  };
  const policyResponsiveness =
    policySpeedScore[features.policyResponseSpeed] * 0.5 +
    policyStrengthScore[features.policyResponseStrength] * 0.3 +
    (features.centralBankAction ? 0.1 : 0) +
    (features.fiscalStimulus ? 0.1 : 0);

  // 超卖深度 (RSI越低，分数越高)
  const oversoldDepth = features.rsi < 10 ? 1.0 : features.rsi < 15 ? 0.9 : features.rsi < 20 ? 0.75 : features.rsi < 25 ? 0.55 : features.rsi < 30 ? 0.35 : features.rsi < 40 ? 0.15 : 0.0;

  // 结构损伤 (系统性风险 + 杠杆 + 事件严重度)
  const severityScore: Record<string, number> = {
    catastrophic: 1.0, extreme: 0.7, high: 0.4, medium: 0.15,
  };
  const leverageScore: Record<string, number> = {
    extreme: 1.0, high: 0.7, moderate: 0.4, low: 0.1,
  };
  const structuralDamage =
    severityScore[features.eventSeverity] * 0.35 +
    leverageScore[features.leverageLevel] * 0.35 +
    (features.isSystemicRisk ? 0.2 : 0) +
    (features.dropMagnitude > 30 ? 0.1 : features.dropMagnitude > 15 ? 0.05 : 0);

  // 流动性支持
  const liquiditySupport = features.centralBankAction ? (features.policyResponseSpeed === "immediate" ? 0.9 : features.policyResponseSpeed === "fast" ? 0.7 : 0.4) : features.liquidityCondition === "frozen" ? 0.1 : features.liquidityCondition === "tight" ? 0.3 : 0.6;

  // 历史V型概率
  const historicalVProbability = features.historicalSimilarityScore > 0.7 && features.mostSimilarEventPattern === "V型" ? 0.85 : features.mostSimilarEventPattern === "V型" ? features.historicalSimilarityScore : features.mostSimilarEventPattern === "W型" ? features.historicalSimilarityScore * 0.5 : features.mostSimilarEventPattern === "L型" ? 0.1 : 0.4;

  // 杠杆风险
  const leverageRisk = leverageScore[features.leverageLevel];

  // 事件可控性
  const categoryContainability: Record<string, number> = {
    financial: 0.6,
    geopolitical: 0.3,
    pandemic: 0.4,
    natural_disaster: 0.7,
    regulatory: 0.8,
    tech: 0.85,
    commodity: 0.6,
  };
  const eventContainability = categoryContainability[features.eventCategory] * (features.isContained ? 1.2 : 0.7);

  // 情绪极端度
  const sentimentExtremity = features.retailSentiment === "panic" ? 1.0 : features.retailSentiment === "fear" ? 0.7 : features.retailSentiment === "greed" ? 0.6 : 0.2;

  return {
    policyResponsiveness,
    oversoldDepth,
    structuralDamage,
    liquiditySupport,
    historicalVProbability,
    leverageRisk,
    eventContainability,
    sentimentExtremity,
  };
}

// ==================== 概率计算 ====================

function calculatePatternProbabilities(
  scores: DimensionScores,
  features: ClassificationFeatures
): Record<RecoveryPattern, number> {
  const w = DEFAULT_CLASSIFIER_CONFIG.weights;

  // V型反弹概率 = f(政策快, 超卖深, 结构损伤小, 流动性好, 历史V型, 可控)
  const vScore =
    scores.policyResponsiveness * w.policyScore * 1.2 +
    scores.oversoldDepth * w.technicalScore * 1.1 +
    (1 - scores.structuralDamage) * w.structuralScore * 1.0 +
    scores.liquiditySupport * w.policyScore * 0.8 +
    scores.historicalVProbability * w.historicalSimilarityScore * 1.0 +
    scores.eventContainability * w.sentimentScore * 0.7;

  // L型下跌概率 = f(政策慢, 结构损伤大, 杠杆高, 流动性差, 不可控)
  const lScore =
    (1 - scores.policyResponsiveness) * w.policyScore * 1.3 +
    scores.structuralDamage * w.structuralScore * 1.4 +
    scores.leverageRisk * w.structuralScore * 1.1 +
    (1 - scores.liquiditySupport) * w.policyScore * 0.9 +
    (1 - scores.eventContainability) * w.sentimentScore * 0.8 +
    (1 - scores.historicalVProbability) * w.historicalSimilarityScore * 0.6;

  // W型概率 = f(政策有但滞后, 结构损伤中等, 信心恢复慢)
  const wScore =
    (scores.policyResponsiveness > 0.4 && scores.policyResponsiveness < 0.8 ? 0.7 : 0.2) * w.policyScore +
    (scores.structuralDamage > 0.3 && scores.structuralDamage < 0.7 ? 0.6 : 0.25) * w.structuralScore +
    (features.mostSimilarEventPattern === "W型" ? 0.8 : 0.15) * w.historicalSimilarityScore +
    (scores.leverageRisk > 0.3 && scores.leverageRisk < 0.7 ? 0.5 : 0.2) * w.structuralScore;

  // U型概率 = f(政策弱, 结构损伤中等, 估值驱动, 无强催化)
  const uScore =
    (scores.policyResponsiveness < 0.5 ? 0.6 : 0.2) * w.policyScore +
    (scores.structuralDamage > 0.2 && scores.structuralDamage < 0.6 ? 0.55 : 0.2) * w.structuralScore +
    (features.mostSimilarEventPattern === "U型" ? 0.8 : 0.15) * w.historicalSimilarityScore +
    (features.dropMagnitude > 20 && features.dropSpeed < 1.5 ? 0.5 : 0.15) * w.technicalScore;

  // 归一化
  const total = vScore + lScore + wScore + uScore;
  if (total === 0) {
    return {
      [RecoveryPattern.V_REBOUND]: 0.25,
      [RecoveryPattern.L_DECLINE]: 0.25,
      [RecoveryPattern.W_RECOVERY]: 0.25,
      [RecoveryPattern.U_SLOW_RECOVERY]: 0.25,
      [RecoveryPattern.UNKNOWN]: 0,
    };
  }

  return {
    [RecoveryPattern.V_REBOUND]: vScore / total,
    [RecoveryPattern.L_DECLINE]: lScore / total,
    [RecoveryPattern.W_RECOVERY]: wScore / total,
    [RecoveryPattern.U_SLOW_RECOVERY]: uScore / total,
    [RecoveryPattern.UNKNOWN]: 0,
  };
}

// ==================== 引擎路由 ====================

function determineEngineRouting(
  pattern: RecoveryPattern,
  confidence: number,
  features: ClassificationFeatures
): {
  recommendedEngine: "calibration" | "llm" | "ensemble";
  engineWeights: { calibration: number; llm: number; ensemble: number };
} {
  const confFactor = confidence / 100;

  switch (pattern) {
    case RecoveryPattern.V_REBOUND:
      // V型反弹：校准系统擅长（历史准确率高）
      return {
        recommendedEngine: "calibration",
        engineWeights: {
          calibration: 0.55 + confFactor * 0.2,
          llm: 0.20 - confFactor * 0.1,
          ensemble: 0.25,
        },
      };

    case RecoveryPattern.L_DECLINE:
      // L型下跌：LLM擅长识别结构性危机
      return {
        recommendedEngine: "llm",
        engineWeights: {
          calibration: 0.15 - confFactor * 0.05,
          llm: 0.55 + confFactor * 0.2,
          ensemble: 0.30,
        },
      };

    case RecoveryPattern.W_RECOVERY:
      // W型：需要谨慎，集成为主
      return {
        recommendedEngine: "ensemble",
        engineWeights: {
          calibration: 0.30,
          llm: 0.30,
          ensemble: 0.40,
        },
      };

    case RecoveryPattern.U_SLOW_RECOVERY:
      // U型：基本面分析为主，偏LLM
      return {
        recommendedEngine: "ensemble",
        engineWeights: {
          calibration: 0.25,
          llm: 0.35,
          ensemble: 0.40,
        },
      };

    case RecoveryPattern.UNKNOWN:
    default:
      return {
        recommendedEngine: "ensemble",
        engineWeights: {
          calibration: 0.33,
          llm: 0.33,
          ensemble: 0.34,
        },
      };
  }
}

// ==================== 置信度计算 ====================

function calculateClassificationConfidence(
  probabilities: Record<RecoveryPattern, number>,
  bestPattern: RecoveryPattern,
  scores: DimensionScores
): number {
  const bestProb = probabilities[bestPattern];

  // 基础置信度 = 最佳概率
  let confidence = bestProb * 70;

  // 概率优势加分 (最佳和第二的差距)
  const sorted = Object.values(probabilities).sort((a, b) => b - a);
  const margin = sorted[0] - sorted[1];
  confidence += margin * 30;

  // 信号一致性加分
  const signals = [
    scores.policyResponsiveness > 0.6,
    scores.oversoldDepth > 0.5,
    scores.liquiditySupport > 0.5,
    scores.eventContainability > 0.5,
  ];
  const consistentCount = signals.filter(Boolean).length;
  confidence += consistentCount * 5;

  // VIX极端时降低置信度
  if (scores.sentimentExtremity > 0.9) {
    confidence *= 0.85;
  }

  return Math.round(Math.max(15, Math.min(95, confidence)));
}

// ==================== 信号收集 ====================

function collectSignals(
  scores: DimensionScores,
  features: ClassificationFeatures,
  pattern: RecoveryPattern
): {
  keySignals: string[];
  riskFactors: string[];
  supportingEvidence: string[];
} {
  const keySignals: string[] = [];
  const riskFactors: string[] = [];
  const supportingEvidence: string[] = [];

  // 关键信号
  if (scores.policyResponsiveness > 0.7) {
    keySignals.push("政策响应强+快：央行快速介入提供流动性支持");
  } else if (scores.policyResponsiveness < 0.3) {
    keySignals.push("政策响应慢/弱：缺乏有效的政策支持");
    riskFactors.push("无强力政策干预，市场可能持续恶化");
  }

  if (scores.oversoldDepth > 0.7) {
    keySignals.push(`RSI深度超卖(${features.rsi})：技术性反弹需求强`);
  }

  if (scores.structuralDamage > 0.6) {
    keySignals.push("结构性损伤严重：基本面恶化，恢复周期长");
    riskFactors.push("结构性问题需要更长时间才能修复");
  } else if (scores.structuralDamage < 0.3) {
    supportingEvidence.push("结构损伤有限：基本面未严重恶化");
  }

  if (scores.leverageRisk > 0.6) {
    riskFactors.push("高杠杆水平：存在强制平仓和连锁踩踏风险");
  }

  if (features.centralBankAction) {
    supportingEvidence.push("央行已采取行动：流动性危机有望缓解");
  }

  if (features.historicalSimilarityScore > 0.6) {
    supportingEvidence.push(
      `历史相似事件 "${features.mostSimilarEventName}" (${features.mostSimilarEventPattern})：相似度 ${(features.historicalSimilarityScore * 100).toFixed(0)}%`
    );
  }

  if (features.volumeTrend === "decreasing") {
    supportingEvidence.push("成交量萎缩：抛售压力正在衰竭");
  } else if (features.volumeTrend === "increasing" && features.dropSpeed > 2) {
    riskFactors.push("成交量持续放大：抛售压力未减");
  }

  // 根据分类结果添加特定信号
  switch (pattern) {
    case RecoveryPattern.V_REBOUND:
      supportingEvidence.push("V型反弹特征：超跌+政策催化+流动性注入");
      break;
    case RecoveryPattern.L_DECLINE:
      supportingEvidence.push("L型下跌特征：结构性危机+高杠杆+政策无力");
      break;
    case RecoveryPattern.W_RECOVERY:
      supportingEvidence.push("W型特征：二次探底风险，等待确认信号");
      riskFactors.push("可能出现二次探底，首轮反弹可能是假突破");
      break;
    case RecoveryPattern.U_SLOW_RECOVERY:
      supportingEvidence.push("U型特征：缓慢估值修复，需要耐心");
      break;
  }

  return { keySignals, riskFactors, supportingEvidence };
}

// ==================== 反弹参数预测 ====================

function predictReboundParameters(
  pattern: RecoveryPattern,
  features: ClassificationFeatures
): { expectedReboundMagnitude: number; expectedRecoveryDays: number } {
  switch (pattern) {
    case RecoveryPattern.V_REBOUND: {
      const base = features.dropMagnitude * 0.4;
      const policyBonus = features.policyResponseStrength === "strong" ? 5 : features.policyResponseStrength === "moderate" ? 2 : 0;
      return {
        expectedReboundMagnitude: Math.min(50, base + policyBonus),
        expectedRecoveryDays: features.policyResponseSpeed === "immediate" ? 30 : features.policyResponseSpeed === "fast" ? 60 : 90,
      };
    }

    case RecoveryPattern.L_DECLINE:
      return {
        expectedReboundMagnitude: features.dropMagnitude * 0.05,
        expectedRecoveryDays: features.dropMagnitude > 30 ? 1000 : 500,
      };

    case RecoveryPattern.W_RECOVERY: {
      const initial = features.dropMagnitude * 0.2;
      return {
        expectedReboundMagnitude: Math.min(30, initial),
        expectedRecoveryDays: 180,
      };
    }

    case RecoveryPattern.U_SLOW_RECOVERY:
      return {
        expectedReboundMagnitude: features.dropMagnitude * 0.3,
        expectedRecoveryDays: 365,
      };

    default:
      return {
        expectedReboundMagnitude: features.dropMagnitude * 0.2,
        expectedRecoveryDays: 180,
      };
  }
}

// ==================== 置信度调整 ====================

function calculateConfidenceAdjustment(
  pattern: RecoveryPattern,
  confidence: number,
  features: ClassificationFeatures
): number {
  const confFactor = confidence / 100;

  switch (pattern) {
    case RecoveryPattern.V_REBOUND:
      return 1.1 * confFactor;
    case RecoveryPattern.L_DECLINE:
      return 1.15 * confFactor;
    case RecoveryPattern.W_RECOVERY:
      return 0.8 * confFactor;
    case RecoveryPattern.U_SLOW_RECOVERY:
      return 0.7 * confFactor;
    default:
      return 0.6 * confFactor;
  }
}

// ==================== 注意：以上类型已通过 export interface/type 导出，此处不再重复导出 ====================
