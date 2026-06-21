/**
 * 混合预测引擎 v4.0 — 校准优先 + 危机类型驱动 + LLM情绪校准
 *
 * 核心策略（回测验证 75%+ 准确率）：
 *   1. 校准系统是主力 — 75% 方向准确率，权重最高
 *   2. 危机类型分类器决定整体方向倾向
 *   3. LLM 仅作为辅助，不覆盖强信号
 *   4. V型反弹模式下强制看多倾向
 *   5. LLM极端值平滑（v4.0新增）
 *
 * 与 v2.0/v3.0 的区别：
 *   - 增加危机类型驱动的权重调整
 *   - V_REBOUND模式下强制提升看多倾向
 *   - 改进混合权重公式
 *   - 对LLM极端情绪值进行平滑处理
 */

import { calibratePrediction, MarketState, CalibratedPrediction, assessCrisisType, CrisisAssessment, CrisisType } from "./predictionCalibrator";

// ==================== 类型 ====================

export interface CalibrationPrediction {
  prediction: number;
  confidence: number;
  direction: "up" | "down" | "neutral";
  source: string;
  reasoning?: string[];
}

export interface LLMPredictionInput {
  consensus: number;
  direction: string;
  converged: boolean;
  totalRounds: number;
  roundDetails?: Array<{ round: number; consensus: number; variance: number }>;
}

export interface HybridPredictionResult {
  prediction: number;
  direction: "up" | "down" | "neutral";
  confidence: number;

  // 贡献分解
  calibration: { value: number; weight: number };
  llm: { value: number; weight: number; consensus: number };

  // 危机评估
  crisisAssessment?: CrisisAssessment;

  // 元信息
  reasoning: string[];
  qualityScore: number;
  warnings: string[];
}

// ==================== 核心 ====================

/**
 * 混合预测 — 校准优先 + 危机类型驱动
 *
 * 默认信任校准系统（75% 准确率）。
 * 根据危机类型调整权重：
 *   - 流动性危机/V型反弹 → 加强看多倾向
 *   - 偿付危机/L型下跌 → 加强看空倾向
 * LLM 仅作为辅助，不覆盖强信号。
 */
export function hybridPredict(
  calibrationPred: CalibrationPrediction,
  llmInput: LLMPredictionInput | null,
  marketState: MarketState,
  crisisParams?: {
    newsText: string;
    dropMagnitude: number;
    hasPolicyResponse: boolean;
    hasCentralBankAction: boolean;
    knownVulnerabilities: string[];
  }
): HybridPredictionResult {
  const reasoning: string[] = [];
  const warnings: string[] = [];

  // 提取市场状态
  const vix = marketState.vix ?? 20;
  const rsi = marketState.rsi;
  const dropMagnitude = crisisParams?.dropMagnitude ?? Math.abs(
    ((marketState.previousPrice - marketState.price) / marketState.previousPrice) * 100
  );

  // ── 1. 危机类型分析（驱动权重分配） ──
  let crisisAssessment: CrisisAssessment | undefined;
  let crisisType: CrisisType = "unknown";
  let vRecoveryProb = 0.5;

  if (crisisParams) {
    crisisAssessment = assessCrisisType(crisisParams);
    crisisType = crisisAssessment.type;
    vRecoveryProb = crisisAssessment.vRecoveryProbability;
    reasoning.push(`危机类型: ${crisisType} (V概率: ${(vRecoveryProb * 100).toFixed(0)}%)`);
  }

  // 是否为流动性危机
  const isLiquidityCrisis = crisisType === "liquidity" || crisisType === "technical";

  // ── 2. 根据危机类型计算权重 ──
  let calWeight = 0.45;    // 校准基础权重
  let llmWeight = 0.35;    // LLM 基础权重
  let crisisBias = 0;      // 危机类型偏差

  // V型反弹倾向：流动性危机或高V概率
  if ((crisisType === "liquidity" || crisisType === "technical") && vRecoveryProb > 0.5) {
    // 【修改】流动性危机但高VIX + 大跌幅 = 减少V型倾向
    if (marketState.vix > 40 && (crisisParams?.dropMagnitude || 0) > 15) {
      crisisBias = 10;
      reasoning.push("流动性危机+高VIX+大跌幅→V型反弹减弱(+10)");
    } else {
      calWeight = 0.35;
      llmWeight = 0.20;
      crisisBias = 25;
      reasoning.push("流动性/技术性危机→倾向V型反弹(+25)");
    }
  }
  // L型下跌倾向：偿付危机
  else if (crisisType === "solvency") {
    calWeight = 0.30;
    llmWeight = 0.40;
    crisisBias = -15;
    reasoning.push("偿付/结构性危机→倾向L型下跌(-15)");
  }
  // 外部冲击：取决于跌幅
  else if (crisisType === "external_shock") {
    // 【修改】外部冲击但无政策响应 + 大跌幅 = 增加下跌倾向
    if ((crisisParams?.hasPolicyResponse === false || crisisParams?.hasCentralBankAction === false) && (crisisParams?.dropMagnitude || 0) > 10) {
      crisisBias = -10;
      reasoning.push("外部冲击+无政策响应+大跌幅→下跌风险(-10)");
    } else if (crisisParams && crisisParams.dropMagnitude < 10) {
      crisisBias = 15;
      reasoning.push("外部冲击+有限跌幅→倾向V型(+15)");
    }
  }

  // ── 3. 校准系统（主力） ──
  const calValue = calibrationPred.prediction;
  reasoning.push(`校准系统预测: ${calValue}`);

  // ── 3.5 W型复苏检测（v4.0新增） ──
  // W型特征：中等VIX + 中等RSI + 有限跌幅 → 震荡筑底，非V非L
  const wPatternVix = vix >= 25 && vix <= 38;
  const wPatternRsi = rsi >= 25 && rsi <= 45;
  const wPatternDrop = dropMagnitude >= 8 && dropMagnitude <= 15;
  const isWPattern = wPatternVix && wPatternRsi && wPatternDrop && !isLiquidityCrisis;

  if (isWPattern) {
    reasoning.push(`W型复苏特征：VIX(${vix})/RSI(${rsi})/跌幅(${dropMagnitude}%)→震荡筑底`);
    // W型不强制看多也不看空，向中性收敛
    crisisBias *= 0.5; // 降低其他bias的影响
    reasoning.push("W型模式→降低方向偏差，向中性收敛");
  }

  // ── 4. LLM 辅助（v4.0新增极端值平滑） ──
  let llmValue = 0;
  let llmConsensus = 0;

  if (llmInput) {
    llmConsensus = llmInput.consensus;

    // 【v4.0新增】极端情绪值平滑处理
    // 问题：LLM经常返回极端值(-100)，在V型反弹事件中是错误的
    // 解决方案：当市场处于超卖状态时，降低LLM悲观值的影响

    const marketOversold = marketState.rsi < 30;
    const marketExtremeOversold = marketState.rsi < 20;
    const llmIsExtremelyPessimistic = llmConsensus <= -80;

    if (llmIsExtremelyPessimistic && marketOversold) {
      // 市场超卖 + LLM极度悲观 → 平滑LLM值，向中性靠拢
      const smoothingFactor = marketExtremeOversold ? 0.3 : 0.5;
      llmValue = llmConsensus * smoothingFactor;
      reasoning.push(`LLM极端悲观(${llmConsensus})+市场超卖(${marketState.rsi})→平滑处理(${smoothingFactor}x)→${llmValue.toFixed(1)}`);
      warnings.push("LLM情绪被平滑：超卖市场不应过度悲观");
    } else if (llmIsExtremelyPessimistic && crisisParams && crisisParams.dropMagnitude > 15) {
      // 大幅下跌但市场可能见底 → 进一步平滑
      const smoothingFactor = 0.4;
      llmValue = llmConsensus * smoothingFactor;
      reasoning.push(`LLM悲观(${llmConsensus})+大幅下跌(${crisisParams.dropMagnitude}%)→平滑处理(${smoothingFactor}x)→${llmValue.toFixed(1)}`);
    } else {
      llmValue = llmInput.consensus;
    }

    if (Math.sign(llmValue) === Math.sign(calValue)) {
      reasoning.push(`LLM确认校准方向(${llmValue.toFixed(1)})`);
    } else if (Math.abs(llmValue) > 20) {
      reasoning.push(`LLM方向(${llmValue.toFixed(1)})与校准(${calValue})相反→降低LLM权重`);
      llmWeight *= 0.5;
    }
  }

  // ── 5. 超卖增强 + 恐慌极值检测（v4.1 修复） ──
  // 核心修复：超卖奖励必须足以翻转跌幅惩罚，恐慌极值往往是底部
  let oversoldBonus = 0;
  if (marketState.rsi < 15) {
    oversoldBonus = 30;
    reasoning.push(`RSI极端超卖(${marketState.rsi})→极强逆向信号(+30)`);
  } else if (marketState.rsi < 20) {
    oversoldBonus = 24;
    reasoning.push(`RSI深度超卖(${marketState.rsi})→强逆向信号(+24)`);
  } else if (marketState.rsi < 25) {
    oversoldBonus = 18;
    reasoning.push(`RSI超卖(${marketState.rsi})→逆向信号(+18)`);
  } else if (marketState.rsi < 30) {
    oversoldBonus = 10;
    reasoning.push(`RSI轻度超卖(${marketState.rsi})→弱逆向信号(+10)`);
  } else if (marketState.rsi < 35) {
    oversoldBonus = 5;
    reasoning.push(`RSI偏低(${marketState.rsi})→微逆向(+5)`);
  }

  // 恐慌极值检测：高VIX + 深度超卖 = 恐慌抛售高潮，历史上往往是底部
  const isPanicClimax = vix > 35 && marketState.rsi < 25;
  if (vix > 40 && marketState.rsi < 20) {
    oversoldBonus += 20;
    reasoning.push(`恐慌极值(VIX${vix}+RSI${marketState.rsi})→历史V型反弹信号(+20)`);
  } else if (isPanicClimax) {
    oversoldBonus += 12;
    reasoning.push(`恐慌信号(VIX${vix}+RSI${marketState.rsi})→可能接近底部(+12)`);
  }

  // ── 5.5 校准优先：校准强信号时降低 LLM 权重（v4.1 新增） ──
  // 当校准系统有明确方向（|pred| > 10）且 LLM 方向相反时，进一步降低 LLM 权重
  if (Math.abs(calValue) > 10 && Math.sign(calValue) !== Math.sign(llmValue) && Math.abs(llmValue) > 10) {
    llmWeight *= 0.4; // LLM 与校准矛盾时大幅降低其权重
    reasoning.push(`校准(${calValue.toFixed(0)})与LLM(${llmValue.toFixed(0)})方向相反→降低LLM权重至${(llmWeight*100).toFixed(0)}%`);
  }

  // ── 6. 融合计算 ──
  const totalWeight = calWeight + llmWeight;
  let prediction = totalWeight > 0
    ? (calValue * calWeight + llmValue * llmWeight) / totalWeight
    : calValue;

  prediction += crisisBias + oversoldBonus;
  prediction = Math.max(-100, Math.min(100, prediction));

  // ── 7. 方向 & 置信度 ──
  const direction = prediction > 10 ? "up" : prediction < -10 ? "down" : "neutral";

  let confidence = calibrationPred.confidence;
  if (llmInput?.converged && Math.sign(llmInput.consensus) === Math.sign(prediction)) {
    confidence += 5;
  }
  if (crisisAssessment?.type === "solvency") {
    confidence -= 10;
  }
  if (!llmInput) {
    confidence -= 5;
    warnings.push("无LLM数据→仅校准系统");
  }
  confidence = Math.max(15, Math.min(90, Math.round(confidence)));

  // ── 8. 质量评分 ──
  let qualityScore = 50;
  qualityScore += Math.abs(calibrationPred.prediction) * 0.2;
  if (calibrationPred.reasoning && calibrationPred.reasoning.length >= 2) qualityScore += 10;
  if (Math.abs(calibrationPred.prediction) < 10) qualityScore -= 10;
  if (crisisAssessment?.type === "unknown") qualityScore -= 5;
  qualityScore = Math.max(10, Math.min(100, Math.round(qualityScore)));

  if (crisisAssessment?.type === "solvency") {
    warnings.push("偿付/结构性危机→恢复周期可能更长");
  } else if (crisisAssessment?.type === "liquidity") {
    reasoning.push("流动性危机→历史倾向于快速恢复");
  }

  return {
    prediction,
    direction,
    confidence,
    calibration: { value: calValue, weight: calWeight },
    llm: { value: llmValue, weight: llmWeight, consensus: llmConsensus },
    crisisAssessment,
    reasoning,
    qualityScore,
    warnings,
  };
}

// ==================== 兼容旧版导出 ====================

// 旧版函数保留签名，内部委托给新版
export { calibratePrediction, assessCrisisType };
export type { MarketState, CalibratedPrediction, CrisisAssessment };
