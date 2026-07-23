/**
 * feedbackChannel — 评估→治理反馈通道
 *
 * 修复 F14 断裂2：5 维评估（Reliability/Stability/...）的计算结果
 * 从未反馈到治理决策循环。
 *
 * 本模块定义了"治理反馈信号"的统一格式和传输通道：
 *
 * 1. EvaluationFeedbackChannel：将 EvaluationEngine 的 5 维结果
 *    转换为治理引擎可消费的反馈信号
 * 2. GovernanceFeedback：统一的反馈信号类型，
 *    可携带评估信号、LLM 检测信号、或任何外部信号
 * 3. GovernanceEngine.acceptFeedback()：接收反馈并在
 *    diagnoseAndIntervene() 中使用
 *
 * 设计原则：
 * - 不修改现有 diagnose() 的同步签名——反馈通过引擎内部状态传递
 * - 反馈是"建议性"的——不直接触发干预，而是调整检测阈值或干预优先级
 * - 为未来 LLM-based 检测器预留同一通道（LLMDetectorAdapter 也产出 GovernanceFeedback）
 */

import type { EvaluationResult, ReliabilityMetric, StabilityMetric, InfluenceAnalysisMetric } from "../evaluation/types";
import type { SeverityLevel, InterventionType } from "./types";

// ============================================================================
// 治理反馈信号类型
// ============================================================================

/**
 * 反馈信号来源。
 *
 * - evaluation: 5 维评估引擎的结果
 * - llm_detector: LLM-based 检测器的结果（未来）
 * - external: 外部系统（如审计日志分析）的结果
 */
export type FeedbackSource = "evaluation" | "llm_detector" | "external";

/**
 * 反馈信号类型——治理引擎可消费的具体信号。
 *
 * 每种信号对应一个 F14 断裂点：
 * - reliability_drop: Reliability 下降 → 可能存在操纵（断裂2）
 * - stability_drop: Stability 下降 → 信念 erratic（断裂2）
 * - influence_concentration: 影响力过度集中 → authority_bias 的结果视角（断裂2）
 * - malicious_intent: LLM 检测到恶意意图（断裂1/3）
 * - information_distortion: LLM 检测到信息扭曲（断裂1/3）
 * - consensus_too_fast: 共识过快 → premature consensus 的结果视角
 */
export type FeedbackSignalType =
  | "reliability_drop"
  | "stability_drop"
  | "influence_concentration"
  | "malicious_intent"
  | "information_distortion"
  | "consensus_too_fast"
  | "custom";

/**
 * 单条治理反馈信号。
 *
 * 治理引擎在 diagnoseAndIntervene() 中消费这些信号：
 * - 调整检测阈值（如 reliability_drop 时降低 authority_bias 阈值）
 * - 调整干预优先级（如 malicious_intent 时提升 reduce_weight 优先级）
 * - 触发额外干预（如 information_distortion 时触发 force_reflection）
 */
export interface GovernanceFeedback {
  /** 信号来源 */
  source: FeedbackSource;
  /** 信号类型 */
  signalType: FeedbackSignalType;
  /** 严重程度 */
  severity: SeverityLevel;
  /** 信号强度 0-1（1=最严重） */
  strength: number;
  /** 相关 agent 列表 */
  targetAgents?: string[];
  /** 人类可读的描述 */
  description: string;
  /** 建议的干预类型（可选——引擎可根据信号类型自行决定） */
  suggestedIntervention?: {
    type: InterventionType;
    targetAgents?: string[];
    parameters?: Record<string, unknown>;
    reason?: string;
  };
  /** 原始数据（调试/审计用） */
  raw?: unknown;
}

// ============================================================================
// EvaluationFeedbackChannel — 5 维评估 → 治理反馈
// ============================================================================

/**
 * 评估反馈通道配置。
 */
export interface EvaluationFeedbackConfig {
  /** Reliability 低于此值时触发 reliability_drop 信号（默认 50） */
  reliabilityThreshold?: number;
  /** Stability 低于此值时触发 stability_drop 信号（默认 50） */
  stabilityThreshold?: number;
  /** Gini 系数高于此值时触发 influence_concentration 信号（默认 0.6） */
  giniThreshold?: number;
  /** 共识速度高于此值时触发 consensus_too_fast 信号（默认 0.8） */
  convergenceSpeedThreshold?: number;
}

const DEFAULT_EVAL_CONFIG: Required<EvaluationFeedbackConfig> = {
  reliabilityThreshold: 50,
  stabilityThreshold: 50,
  giniThreshold: 0.6,
  convergenceSpeedThreshold: 0.8,
};

/**
 * 将 EvaluationEngine 的 5 维评估结果转换为治理反馈信号。
 *
 * 使用方式：
 * ```typescript
 * const evalResult = evaluationEngine.evaluate(...);
 * const feedback = EvaluationFeedbackChannel.fromEvaluation(evalResult);
 * governanceEngine.acceptFeedback(feedback);
 * const { result, interventions } = governanceEngine.diagnoseAndIntervene(...);
 * ```
 *
 * 关键设计：此通道在治理循环**之前**运行，
 * 将事后评估变成事中反馈——这是修复 F14 断裂2的核心。
 */
export class EvaluationFeedbackChannel {
  private config: Required<EvaluationFeedbackConfig>;

  constructor(config?: EvaluationFeedbackConfig) {
    this.config = { ...DEFAULT_EVAL_CONFIG, ...config };
  }

  /**
   * 从完整的 EvaluationResult 提取治理反馈信号。
   */
  fromEvaluation(result: EvaluationResult): GovernanceFeedback[] {
    const signals: GovernanceFeedback[] = [];

    // ── Reliability drop ──
    const reliability = result.dimensions.reliability;
    if (reliability.score < this.config.reliabilityThreshold) {
      signals.push({
        source: "evaluation",
        signalType: "reliability_drop",
        severity: reliability.score < 30 ? "high" : "medium",
        strength: 1 - (reliability.score / 100),
        description: `Reliability 评分 ${reliability.score.toFixed(0)} 低于阈值 ${this.config.reliabilityThreshold}——讨论内部一致性不足，可能存在操纵`,
        raw: { score: reliability.score, alpha: reliability.roundConsistencyAlpha },
      });
    }

    // ── Stability drop ──
    const stability = result.dimensions.stability;
    if (stability.score < this.config.stabilityThreshold) {
      signals.push({
        source: "evaluation",
        signalType: "stability_drop",
        severity: stability.score < 30 ? "high" : "medium",
        strength: 1 - (stability.score / 100),
        description: `Stability 评分 ${stability.score.toFixed(0)} 低于阈值 ${this.config.stabilityThreshold}——信念跨轮不稳定，可能是提取错误或操纵`,
        raw: { score: stability.score, roundConsistency: stability.roundConsistency },
      });
    }

    // ── Influence concentration ──
    const influence = result.dimensions.influenceAnalysis;
    if (influence.giniCoefficient > this.config.giniThreshold) {
      signals.push({
        source: "evaluation",
        signalType: "influence_concentration",
        severity: influence.giniCoefficient > 0.8 ? "high" : "medium",
        strength: influence.giniCoefficient,
        targetAgents: influence.dominantAgent ? [influence.dominantAgent] : influence.keyInfluencers,
        description: `影响力 Gini=${influence.giniCoefficient.toFixed(2)} 超过阈值 ${this.config.giniThreshold}——影响力过度集中于 ${influence.dominantAgent || influence.keyInfluencers.join(",")}`,
        suggestedIntervention: influence.dominantAgent ? {
          type: "reduce_weight",
          targetAgents: [influence.dominantAgent],
          reason: `Evaluation feedback: Gini=${influence.giniCoefficient.toFixed(2)}`,
        } : undefined,
        raw: { gini: influence.giniCoefficient, dominant: influence.dominantAgent },
      });
    }

    // ── Consensus too fast ──
    const consensus = result.dimensions.consensus;
    if (consensus.trajectory.convergenceSpeed > this.config.convergenceSpeedThreshold) {
      signals.push({
        source: "evaluation",
        signalType: "consensus_too_fast",
        severity: "medium",
        strength: consensus.trajectory.convergenceSpeed,
        description: `共识收敛速度 ${consensus.trajectory.convergenceSpeed.toFixed(2)} 过快——可能存在过早共识`,
        raw: { convergenceSpeed: consensus.trajectory.convergenceSpeed, convergenceRound: consensus.trajectory.convergenceRound },
      });
    }

    return signals;
  }

  /**
   * 增量式反馈——不等待完整评估，只从部分指标提取信号。
   *
   * 用于实时治理循环中：每轮结束后计算部分评估指标，
   * 立即反馈到下一轮治理决策。
   */
  fromPartialMetrics(metrics: {
    reliability?: Partial<ReliabilityMetric>;
    stability?: Partial<StabilityMetric>;
    influence?: Partial<InfluenceAnalysisMetric>;
    consensusSpeed?: number;
  }): GovernanceFeedback[] {
    const signals: GovernanceFeedback[] = [];

    if (metrics.reliability?.score !== undefined && metrics.reliability.score < this.config.reliabilityThreshold) {
      signals.push({
        source: "evaluation",
        signalType: "reliability_drop",
        severity: metrics.reliability.score < 30 ? "high" : "medium",
        strength: 1 - (metrics.reliability.score / 100),
        description: `增量评估：Reliability=${metrics.reliability.score.toFixed(0)} 低于阈值`,
      });
    }

    if (metrics.stability?.score !== undefined && metrics.stability.score < this.config.stabilityThreshold) {
      signals.push({
        source: "evaluation",
        signalType: "stability_drop",
        severity: metrics.stability.score < 30 ? "high" : "medium",
        strength: 1 - (metrics.stability.score / 100),
        description: `增量评估：Stability=${metrics.stability.score.toFixed(0)} 低于阈值`,
      });
    }

    if (metrics.influence?.giniCoefficient !== undefined && metrics.influence.giniCoefficient > this.config.giniThreshold) {
      signals.push({
        source: "evaluation",
        signalType: "influence_concentration",
        severity: metrics.influence.giniCoefficient > 0.8 ? "high" : "medium",
        strength: metrics.influence.giniCoefficient,
        targetAgents: metrics.influence.dominantAgent ? [metrics.influence.dominantAgent] : undefined,
        description: `增量评估：Gini=${metrics.influence.giniCoefficient.toFixed(2)}`,
      });
    }

    if (metrics.consensusSpeed !== undefined && metrics.consensusSpeed > this.config.convergenceSpeedThreshold) {
      signals.push({
        source: "evaluation",
        signalType: "consensus_too_fast",
        severity: "medium",
        strength: metrics.consensusSpeed,
        description: `增量评估：收敛速度=${metrics.consensusSpeed.toFixed(2)}`,
      });
    }

    return signals;
  }
}

// ============================================================================
// LLMDetectorAdapter — LLM 检测器适配层（修复 F14 断裂1/3）
// ============================================================================

/**
 * LLM-based 检测器接口。
 *
 * 与 BiasDetector 的区别：
 * - BiasDetector 是同步的、rule-based 的——只看行为表面
 * - LLMDetector 是异步的、需要 LLM 调用——能理解行为意图
 *
 * 使用方式：
 * ```typescript
 * const detector = new MaliciousIntentDetector(llmConfig);
 * const signals = await detector.detect(opinions, agentBeliefs);
 * governanceEngine.acceptFeedback(signals);
 * ```
 *
 * 实现 LLM 检测器的步骤：
 * 1. 实现 LLMDetector 接口
 * 2. 在治理循环之前调用 detect()
 * 3. 将结果通过 acceptFeedback() 传入治理引擎
 * 4. 治理引擎在 diagnoseAndIntervene() 中消费反馈信号
 */
export interface LLMDetector {
  /** 检测器唯一标识 */
  name: string;

  /**
   * 执行 LLM-based 检测。
   *
   * @param opinions 当前轮所有 agent 的输出
   * @param agentBeliefs 当前轮所有 agent 的信念状态
   * @returns 治理反馈信号列表
   */
  detect(
    opinions: Array<{
      agentId: string;
      reasoning: string;
      evidence: string[];
      belief: number;
      confidence: number;
      referencedAgents: string[];
      itemBeliefs?: Array<{ item: string; rank: number; belief: number }>;
    }>,
    agentBeliefs: Array<{ agentId: string; belief: number; confidence: number }>
  ): Promise<GovernanceFeedback[]>;
}

/**
 * LLM 检测器适配器——将 LLMDetector 的异步结果缓存为同步反馈信号。
 *
 * 解决问题：GovernanceEngine.diagnose() 是同步的，
 * 但 LLM 调用是异步的。
 *
 * 方案：在治理循环之前异步运行 LLMDetector，
 * 将结果通过 acceptFeedback() 传入引擎，
 * 引擎在同步的 diagnoseAndIntervene() 中消费缓存好的反馈。
 */
export class LLMDetectorAdapter {
  private detectors: Map<string, LLMDetector> = new Map();
  private cachedSignals: GovernanceFeedback[] = [];

  /** 注册 LLM 检测器 */
  registerDetector(detector: LLMDetector): void {
    this.detectors.set(detector.name, detector);
  }

  /** 注销检测器 */
  unregisterDetector(name: string): void {
    this.detectors.delete(name);
  }

  /**
   * 异步运行所有 LLM 检测器，缓存结果。
   *
   * 应在 governanceEngine.diagnoseAndIntervene() 之前调用。
   */
  async runDetection(
    opinions: Parameters<LLMDetector["detect"]>[0],
    agentBeliefs: Parameters<LLMDetector["detect"]>[1]
  ): Promise<GovernanceFeedback[]> {
    const allSignals: GovernanceFeedback[] = [];

    for (const detector of this.detectors.values()) {
      try {
        const signals = await detector.detect(opinions, agentBeliefs);
        allSignals.push(...signals);
      } catch (err) {
        console.warn(`[LLMDetectorAdapter] Detector ${detector.name} failed:`, err);
      }
    }

    this.cachedSignals = allSignals;
    return allSignals;
  }

  /** 获取缓存的检测信号（供 GovernanceEngine.acceptFeedback() 消费） */
  getCachedSignals(): GovernanceFeedback[] {
    return this.cachedSignals;
  }

  /** 清除缓存 */
  clearCache(): void {
    this.cachedSignals = [];
  }
}

// ============================================================================
// 反馈聚合器——将多源反馈信号合并为治理决策输入
// ============================================================================

/**
 * 反馈聚合结果——供 GovernanceEngine 内部使用。
 */
export interface AggregatedFeedback {
  /** 所有反馈信号 */
  signals: GovernanceFeedback[];
  /** 按 signalType 分组的最高强度 */
  maxStrengthByType: Map<FeedbackSignalType, number>;
  /** 需要重点关注的 agent（被多个信号指向） */
  flaggedAgents: Map<string, number>;
  /** 建议调整的检测阈值 */
  thresholdAdjustments: {
    authorityBias?: number;   // 降低了多少（如 -0.05 表示阈值从 0.30 降到 0.25）
    polarization?: number;
    prematureConsensus?: number;
  };
  /** 建议提升优先级的干预类型 */
  priorityInterventions: Set<InterventionType>;
}

/**
 * 聚合多源反馈信号。
 *
 * 当同一 agent 被多个信号指向时，提升其可疑度。
 * 当 reliability_drop + influence_concentration 同时出现时，
 * 建议降低 authority_bias 阈值（更敏感地检测权力集中）。
 */
export function aggregateFeedback(signals: GovernanceFeedback[]): AggregatedFeedback {
  const maxStrengthByType = new Map<FeedbackSignalType, number>();
  const flaggedAgents = new Map<string, number>();
  const thresholdAdjustments: AggregatedFeedback["thresholdAdjustments"] = {};
  const priorityInterventions = new Set<InterventionType>();

  for (const signal of signals) {
    // 记录每种信号类型的最大强度
    const prev = maxStrengthByType.get(signal.signalType) ?? 0;
    maxStrengthByType.set(signal.signalType, Math.max(prev, signal.strength));

    // 累加 agent 可疑度
    if (signal.targetAgents) {
      for (const agentId of signal.targetAgents) {
        flaggedAgents.set(agentId, (flaggedAgents.get(agentId) ?? 0) + signal.strength);
      }
    }

    // 根据信号类型调整阈值和优先级
    switch (signal.signalType) {
      case "reliability_drop":
        // Reliability 下降时——更敏感地检测权力集中和极化
        thresholdAdjustments.authorityBias = Math.min(
          thresholdAdjustments.authorityBias ?? 0,
          -0.05 * signal.strength
        );
        thresholdAdjustments.polarization = Math.min(
          thresholdAdjustments.polarization ?? 0,
          -0.03 * signal.strength
        );
        priorityInterventions.add("force_reflection");
        break;

      case "malicious_intent":
        // LLM 检测到恶意意图——优先 reduce_weight
        priorityInterventions.add("reduce_weight");
        priorityInterventions.add("force_reflection");
        break;

      case "information_distortion":
        // 信息扭曲——优先 force_reflection
        priorityInterventions.add("force_reflection");
        break;

      case "influence_concentration":
        // 影响力集中——优先 reduce_weight
        priorityInterventions.add("reduce_weight");
        break;

      case "stability_drop":
        // 稳定性下降——可能是提取问题，不直接调整干预
        break;

      case "consensus_too_fast":
        // 共识过快——如果 continue_discussion 未被禁用，提升其优先级
        priorityInterventions.add("continue_discussion");
        break;
    }
  }

  return {
    signals,
    maxStrengthByType,
    flaggedAgents,
    thresholdAdjustments,
    priorityInterventions,
  };
}
