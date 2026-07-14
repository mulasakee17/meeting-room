import {
  GovernanceResult,
  GovernanceConfig,
  EchoChamberDetection,
  AuthorityBiasDetection,
  PolarizationDetection,
  PrematureConsensusDetection,
  GovernanceIssue,
  AgentBelief,
  MessageInfo,
  SeverityLevel,
  InterventionType,
  Intervention,
  InterventionStrategy,
  InterventionResult,
  GovernanceState,
  BiasDetector,
} from "./types";
import { ReduceWeightIntervention, IntroduceDiversityIntervention, ForceReflectionIntervention, ContinueDiscussionIntervention } from "./interventions";
import { computeAdaptiveThresholds, computeCalibrationMetrics, type CalibrationMetrics } from "./adaptiveThresholds";
import { computeAdaptiveDosage, type DosageContext } from "./adaptiveDosage";
import {
  GOVERNANCE_ECHO_CHAMBER_THRESHOLD,
  GOVERNANCE_AUTHORITY_BIAS_THRESHOLD,
  GOVERNANCE_POLARIZATION_THRESHOLD,
  GOVERNANCE_PREMATURE_CONSENSUS_THRESHOLD,
  GOVERNANCE_PREMATURE_CONSENSUS_LEVEL,
  GOVERNANCE_PREMATURE_CONSENSUS_STD_THRESHOLD,
  GOVERNANCE_SEVERITY_ECHO_CHAMBER,
  GOVERNANCE_SEVERITY_AUTHORITY_BIAS,
  GOVERNANCE_SEVERITY_POLARIZATION,
  GOVERNANCE_REDUNDANT_BELIEF_DIFF,
  GOVERNANCE_REDUNDANT_CONFIDENCE_DIFF,
  GOVERNANCE_CLUSTER_BELIEF_OFFSET,
  GOVERNANCE_SIMILARITY_MIN_WORD_LENGTH,
  GOVERNANCE_STD_NORM_FACTOR,
  GOVERNANCE_CONSENSUS_LEVEL_FACTOR,
  GOVERNANCE_ECHO_REDUNDANCY_STD_WEIGHT,
  GOVERNANCE_ECHO_REDUNDANCY_CONTENT_WEIGHT,
  GOVERNANCE_PREMATURE_SEVERITY_PROGRESS_RATIO,
  INTERVENTION_REDUCE_WEIGHT_FACTOR,
  INTERVENTION_DIVERSITY_PERTURBATION,
  INTERVENTION_REFLECTION_FACTOR,
} from "../constants";

/** Mulberry32 seeded PRNG — deterministic, used for reproducible interventions */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class GovernanceEngine {
  private strategies: Map<InterventionType, InterventionStrategy> = new Map();
  /** 可扩展的自定义检测器——内置 4 个检测器之外追加的 */
  private customDetectors: Map<string, BiasDetector> = new Map();
  /** 可复现性 seed — 用于 introduce_diversity 等随机干预 */
  private seed?: number;
  /** 持久 PRNG — 避免每次 apply() 从同一 seed 重建，导致不同轮次扰动值相同 */
  private rng: (() => number) | null = null;
  /** 自适应阈值校准指标——首次调用后缓存 */
  private calibration: CalibrationMetrics | null = null;
  /** 每种干预类型的历史效果记录——用于自适应剂量 */
  private interventionHistory: Map<InterventionType, number[]> = new Map();
  /** 构造时的初始 defaultConfig 快照——reset() 时恢复 */
  private initialDefaultConfig: GovernanceConfig;

  constructor(adaptiveConfig?: Partial<GovernanceConfig>, seed?: number) {
    this.registerStrategy(new ReduceWeightIntervention());
    this.registerStrategy(new IntroduceDiversityIntervention());
    this.registerStrategy(new ForceReflectionIntervention());
    this.registerStrategy(new ContinueDiscussionIntervention());
    this.seed = seed;
    if (seed !== undefined) {
      this.rng = mulberry32(seed);
    }
    if (adaptiveConfig) {
      this.defaultConfig = { ...this.defaultConfig, ...adaptiveConfig };
    }
    // 保存初始配置快照，供 reset() 恢复
    this.initialDefaultConfig = { ...this.defaultConfig };
  }

  /**
   * 重置引擎的运行时状态——供批量实验间调用，防止跨实验污染。
   *
   * 清除：校准缓存、干预历史、PRNG 状态、defaultConfig（恢复到构造时）。
   * 保留：已注册的 strategies 和 customDetectors（用户配置不应丢失）。
   */
  reset(): void {
    this.calibration = null;
    this.interventionHistory.clear();
    this.defaultConfig = { ...this.initialDefaultConfig };
    if (this.seed !== undefined) {
      this.rng = mulberry32(this.seed);
    }
  }

  /** 设置 seed（用于运行时动态注入） */
  setSeed(seed: number): void {
    this.seed = seed;
    this.rng = mulberry32(seed);
  }

  /**
   * 校准自适应阈值——从已有讨论数据计算基线指标并调整阈值。
   * 在 processRound 的第一轮后自动调用（当 enableAdaptiveThresholds=true）。
   */
  calibrateThresholds(params: {
    convergenceRounds: number;
    maxRounds: number;
    beliefs: number[];
    messages: MessageInfo[];
    agentCount: number;
  }): void {
    this.calibration = computeCalibrationMetrics(params);
    const adaptiveConfig = computeAdaptiveThresholds(this.calibration);
    this.defaultConfig = { ...this.defaultConfig, ...adaptiveConfig };
  }

  /**
   * 记录干预效果——供下一轮自适应剂量计算使用。
   * @param type 干预类型
   * @param effectiveness 效果评分 [-1, 1]（1=改善, -1=恶化）
   */
  recordInterventionEffect(type: InterventionType, effectiveness: number): void {
    const history = this.interventionHistory.get(type) || [];
    history.push(effectiveness);
    // 只保留最近 5 次记录，避免历史数据过多稀释当前趋势
    if (history.length > 5) history.shift();
    this.interventionHistory.set(type, history);
  }

  /**
   * 获取某干预类型的平均历史效果。
   */
  private getHistoryEffectiveness(type: InterventionType): number {
    const history = this.interventionHistory.get(type);
    if (!history || history.length === 0) return 0;
    return history.reduce((a, b) => a + b, 0) / history.length;
  }

  /**
   * 注册自定义偏差检测器。
   * 检测结果在 diagnose() 中自动加入 GovernanceResult.otherIssues。
   */
  registerDetector(detector: BiasDetector): void {
    this.customDetectors.set(detector.type, detector);
  }

  /** 注销自定义检测器 */
  unregisterDetector(type: string): void {
    this.customDetectors.delete(type);
  }

  /**
   * 使用自适应阈值创建治理引擎。
   *
   * 先跑一轮校准讨论收集基线指标，然后自动计算个性化阈值。
   * 这替代了硬编码的 0.7/0.4/0.5 固定阈值。
   */
  static withAdaptiveThresholds(calibration: CalibrationMetrics): GovernanceEngine {
    const adaptiveConfig = computeAdaptiveThresholds(calibration);
    return new GovernanceEngine(adaptiveConfig);
  }

  registerStrategy(strategy: InterventionStrategy): void {
    this.strategies.set(strategy.type, strategy);
  }

  private defaultConfig: GovernanceConfig = {
    enableEchoChamberDetection: true,
    enableAuthorityBiasDetection: true,
    enablePolarizationDetection: true,
    enablePrematureConsensusDetection: true,
    interventionLevel: "medium",
    echoChamberThreshold: GOVERNANCE_ECHO_CHAMBER_THRESHOLD,
    authorityBiasThreshold: GOVERNANCE_AUTHORITY_BIAS_THRESHOLD,
    polarizationThreshold: GOVERNANCE_POLARIZATION_THRESHOLD,
    prematureConsensusThreshold: GOVERNANCE_PREMATURE_CONSENSUS_THRESHOLD,
    maxRounds: 3,
    currentRound: 1,
    // 实验证明 introduce_diversity 和 continue_discussion 无效/有害，默认禁用
    disabledInterventions: ["introduce_diversity", "continue_discussion"],
  };

  diagnose(
    agentBeliefs: AgentBelief[],
    messages: MessageInfo[],
    agentIds: string[],
    config?: GovernanceConfig
  ): GovernanceResult {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const issues: GovernanceIssue[] = [];
    let interventionCount = 0;

    const echoChamber = this.detectEchoChamber(agentBeliefs, messages, mergedConfig);
    if (echoChamber.intervention.applied) interventionCount++;

    const authorityBias = this.detectAuthorityBias(agentBeliefs, messages, mergedConfig);
    if (authorityBias.intervention.applied) interventionCount++;

    const polarization = this.detectPolarization(agentBeliefs, mergedConfig);
    if (polarization.intervention.applied) interventionCount++;

    const prematureConsensus = this.detectPrematureConsensus(agentBeliefs, mergedConfig);
    if (prematureConsensus.intervention.applied) interventionCount++;

    if (echoChamber.detected) {
      issues.push({
        type: "echo_chamber",
        severity: echoChamber.severity,
        description: `Echo chamber detected: ${echoChamber.redundantAgents.length} agents share similar information`,
        agents: echoChamber.redundantAgents,
      });
    }

    if (authorityBias.detected) {
      issues.push({
        type: "authority_bias",
        severity: authorityBias.severity,
        description: `Authority bias detected: ${authorityBias.dominantAgent} dominates with ${(authorityBias.influenceRatio * 100).toFixed(0)}% influence`,
        agents: authorityBias.dominantAgent ? [authorityBias.dominantAgent] : undefined,
      });
    }

    if (polarization.detected) {
      issues.push({
        type: "polarization",
        severity: polarization.severity,
        description: `Group polarization detected with index ${polarization.polarizationIndex.toFixed(2)}`,
        agents: polarization.groups.flatMap(g => g.agentIds),
      });
    }

    if (prematureConsensus.detected) {
      issues.push({
        type: "premature_consensus",
        severity: prematureConsensus.severity,
        description: `Premature consensus detected at round ${prematureConsensus.roundNumber}: consensus level ${prematureConsensus.consensusLevel.toFixed(2)}`,
      });
    }

    // 运行自定义检测器
    for (const detector of Array.from(this.customDetectors.values())) {
      const result = detector.detect(agentBeliefs, messages, mergedConfig);
      if (result.detected) {
        issues.push({
          type: detector.type,
          severity: result.severity,
          description: result.description,
          agents: result.agents,
        });
      }
    }

    const summary = this.generateSummary(echoChamber, authorityBias, polarization, prematureConsensus, interventionCount);

    return {
      echoChamber,
      authorityBias,
      polarization,
      prematureConsensus,
      otherIssues: issues,
      summary,
      interventionCount,
    };
  }

  // ---- Shared helpers for detection methods --------------------------------

  /** Default "not detected" intervention */
  private noIntervention(): { type: InterventionType; applied: boolean; effect?: string } {
    return { type: "none", applied: false };
  }

  /** Check if an intervention type is disabled in config */
  private isInterventionDisabled(config: GovernanceConfig, type: InterventionType): boolean {
    return (config.disabledInterventions || []).includes(type);
  }

  /** Early-exit when detection is disabled or too few agents */
  private shouldSkipDetection(
    enabled: boolean | undefined,
    agentCount: number,
    minAgents: number
  ): boolean {
    return !enabled || agentCount < minAgents;
  }

  // ---- Detection methods ---------------------------------------------------

  detectEchoChamber(
    agentBeliefs: AgentBelief[],
    messages: MessageInfo[],
    config: GovernanceConfig
  ): EchoChamberDetection {
    const notDetected = (): EchoChamberDetection => ({
      detected: false, severity: "low", redundantAgents: [],
      infoRedundancyScore: 0, intervention: this.noIntervention(),
    });

    if (this.shouldSkipDetection(config.enableEchoChamberDetection, agentBeliefs.length, 3)) {
      return notDetected();
    }

    const beliefStd = this.computeStd(agentBeliefs.map(b => b.belief));
    const normalizedStd = beliefStd / GOVERNANCE_STD_NORM_FACTOR;
    const contentSimilarity = this.computeContentSimilarity(messages);
    const infoRedundancyScore = (1 - normalizedStd) * GOVERNANCE_ECHO_REDUNDANCY_STD_WEIGHT + contentSimilarity * GOVERNANCE_ECHO_REDUNDANCY_CONTENT_WEIGHT;

    const detected = infoRedundancyScore >= (config.echoChamberThreshold ?? GOVERNANCE_ECHO_CHAMBER_THRESHOLD);
    const severity = this.getSeverity(infoRedundancyScore, GOVERNANCE_SEVERITY_ECHO_CHAMBER);

    const redundantPairs = this.findRedundantAgentPairs(agentBeliefs);
    const redundantAgents = Array.from(new Set(redundantPairs.flat()));

    const intervention = (detected && config.interventionLevel !== "none")
      ? { type: "introduce_diversity" as InterventionType, applied: !this.isInterventionDisabled(config, "introduce_diversity"), effect: this.isInterventionDisabled(config, "introduce_diversity") ? "Detected but intervention disabled" : `Introduced diverse information to ${redundantAgents.length} agents` }
      : this.noIntervention();

    return {
      detected, severity, redundantAgents,
      infoRedundancyScore: Math.round(infoRedundancyScore * 100) / 100,
      intervention,
    };
  }

  detectAuthorityBias(
    agentBeliefs: AgentBelief[],
    messages: MessageInfo[],
    config: GovernanceConfig
  ): AuthorityBiasDetection {
    const notDetected = (): AuthorityBiasDetection => ({
      detected: false, severity: "low", influenceRatio: 0,
      intervention: this.noIntervention(),
    });

    if (this.shouldSkipDetection(config.enableAuthorityBiasDetection, agentBeliefs.length, 2)) {
      return notDetected();
    }

    // 修复：用引用网络度量替代消息计数度量
    // 旧逻辑用 messageCounts，每 agent 1 条消息时 influenceRatio=1/N，
    // N≥5 时永远 < 0.25 阈值 → 永不触发。
    // 新逻辑：统计每个 agent 被其他 agent 引用的次数，
    // influenceRatio = max(references) / totalReferences
    // 这直接反映"组里在听谁"——权威偏差的定义。
    const referenceCounts: Record<string, number> = {};
    let totalReferences = 0;

    for (const msg of messages) {
      const refs = msg.referencedAgents || [];
      for (const ref of refs) {
        if (ref === msg.agentId) continue; // 自引用不计
        referenceCounts[ref] = (referenceCounts[ref] || 0) + 1;
        totalReferences++;
      }
    }

    let influenceRatio: number;
    let dominantAgent: string | undefined;

    if (totalReferences > 0) {
      // 有引用数据：用引用份额作为权威偏差度量
      const maxRefs = Math.max(...Object.values(referenceCounts));
      influenceRatio = maxRefs / totalReferences;
      dominantAgent = Object.keys(referenceCounts).find(id => referenceCounts[id] === maxRefs);
    } else {
      // 回退：首轮无引用数据时，用消息内容长度份额作为粗略代理
      // （长发言 = 信息输出多 = 潜在权威影响）
      const contentLengths: Record<string, number> = {};
      messages.forEach(m => {
        contentLengths[m.agentId] = (contentLengths[m.agentId] || 0) + (m.content?.length || 0);
      });
      const totalLength = Object.values(contentLengths).reduce((a, b) => a + b, 0) || 1;
      const maxLength = Math.max(...Object.values(contentLengths));
      influenceRatio = maxLength / totalLength;
      dominantAgent = Object.keys(contentLengths).find(id => contentLengths[id] === maxLength);
    }

    const detected = influenceRatio >= (config.authorityBiasThreshold ?? GOVERNANCE_AUTHORITY_BIAS_THRESHOLD);
    const severity = this.getSeverity(influenceRatio, GOVERNANCE_SEVERITY_AUTHORITY_BIAS);

    const intervention = (detected && config.interventionLevel !== "none" && dominantAgent)
      ? { type: "reduce_weight" as InterventionType, applied: !this.isInterventionDisabled(config, "reduce_weight"), effect: this.isInterventionDisabled(config, "reduce_weight") ? "Detected but intervention disabled" : `Reduced ${dominantAgent}'s influence weight by ${(influenceRatio * 30).toFixed(0)}%` }
      : this.noIntervention();

    return {
      detected, severity, dominantAgent,
      influenceRatio: Math.round(influenceRatio * 100) / 100,
      intervention,
    };
  }

  detectPolarization(
    agentBeliefs: AgentBelief[],
    config: GovernanceConfig
  ): PolarizationDetection {
    const notDetected = (): PolarizationDetection => ({
      detected: false, severity: "low", groups: [],
      polarizationIndex: 0, intervention: this.noIntervention(),
    });

    if (this.shouldSkipDetection(config.enablePolarizationDetection, agentBeliefs.length, 4)) {
      return notDetected();
    }

    const beliefs = agentBeliefs.map(b => b.belief);
    const polarizationIndex = this.computeStd(beliefs);

    // 双峰系数 (Bimodality Coefficient, BC)
    // BC = (skewness² + 1) / kurtosis
    // BC > 0.555 表明分布是双峰的（真正的极化）
    // 这避免了将"均匀高方差分布"误判为极化
    const bimodalityCoeff = this.computeBimodalityCoefficient(beliefs);

    // 极化检测需要同时满足：
    // 1. 高方差（信念分散）—— polarizationIndex >= threshold
    // 2. 双峰分布（形成对立阵营）—— bimodalityCoeff > 0.555
    // 或者：极高方差（polarizationIndex >= threshold * 1.5）作为 fallback
    const threshold = config.polarizationThreshold ?? GOVERNANCE_POLARIZATION_THRESHOLD;
    const detected = (polarizationIndex >= threshold && bimodalityCoeff > 0.555)
      || polarizationIndex >= threshold * 1.5;
    const severity = this.getSeverity(polarizationIndex, GOVERNANCE_SEVERITY_POLARIZATION);
    const groups = this.clusterAgentsByBelief(agentBeliefs);

    const intervention = (detected && config.interventionLevel !== "none")
      ? { type: "force_reflection" as InterventionType, applied: !this.isInterventionDisabled(config, "force_reflection"), effect: this.isInterventionDisabled(config, "force_reflection") ? "Detected but intervention disabled" : `Forced ${agentBeliefs.length} agents to reflect on opposing viewpoints` }
      : this.noIntervention();

    return {
      detected, severity, groups,
      polarizationIndex: Math.round(polarizationIndex * 100) / 100,
      bimodalityCoefficient: Math.round(bimodalityCoeff * 1000) / 1000,
      intervention,
    };
  }

  /**
   * 计算双峰系数 (Bimodality Coefficient)
   *
   * BC = (g² + 1) / k
   * 其中 g = 偏度 (skewness), k = 峰度 (kurtosis)
   *
   * BC > 0.555 表明分布是双峰的（SAS JMP 标准）
   * 这能区分"均匀高方差"（BC 低，非极化）和"双峰对立"（BC 高，真正极化）
   */
  private computeBimodalityCoefficient(values: number[]): number {
    const n = values.length;
    if (n < 4) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    if (variance === 0) return 0;
    const std = Math.sqrt(variance);

    // 偏度 (skewness) —— 使用调整后的样本偏度 (G1)
    const skewness = values.reduce((s, v) => s + ((v - mean) / std) ** 3, 0) / n;

    // 峰度 (kurtosis) —— 使用调整后的样本峰度 (G2)
    const kurtosis = values.reduce((s, v) => s + ((v - mean) / std) ** 4, 0) / n;

    // BC = (skewness² + 1) / kurtosis
    // 当 kurtosis 接近 0 时返回 0（避免除零）
    if (kurtosis < 0.01) return 0;
    return (skewness * skewness + 1) / kurtosis;
  }

  detectPrematureConsensus(
    agentBeliefs: AgentBelief[],
    config: GovernanceConfig
  ): PrematureConsensusDetection {
    const currentRound = config.currentRound || 1;
    const maxRounds = config.maxRounds || 3;
    const threshold = config.prematureConsensusThreshold ?? GOVERNANCE_PREMATURE_CONSENSUS_THRESHOLD;

    const notDetected = (): PrematureConsensusDetection => ({
      detected: false, severity: "low", roundNumber: currentRound,
      maxRounds, beliefStd: 0, consensusLevel: 0,
      intervention: this.noIntervention(),
    });

    if (this.shouldSkipDetection(config.enablePrematureConsensusDetection, agentBeliefs.length, 2)
        || currentRound >= maxRounds) {
      return notDetected();
    }

    const beliefStd = this.computeStd(agentBeliefs.map(b => b.belief));
    const consensusLevel = Math.max(0, 1 - beliefStd * GOVERNANCE_CONSENSUS_LEVEL_FACTOR);
    const roundProgress = currentRound / maxRounds;

    const detected = roundProgress < threshold
      && consensusLevel > GOVERNANCE_PREMATURE_CONSENSUS_LEVEL
      && beliefStd < GOVERNANCE_PREMATURE_CONSENSUS_STD_THRESHOLD;
    const severity = detected
      ? (roundProgress < threshold * GOVERNANCE_PREMATURE_SEVERITY_PROGRESS_RATIO ? "high" : "medium")
      : "low";

    const intervention = (detected && config.interventionLevel !== "none")
      ? {
          type: "continue_discussion" as InterventionType,
          applied: !this.isInterventionDisabled(config, "continue_discussion"),
          effect: this.isInterventionDisabled(config, "continue_discussion") ? "Detected but intervention disabled" : `Added ${Math.ceil(maxRounds * (threshold - roundProgress))} additional rounds to prevent premature consensus`,
        }
      : this.noIntervention();

    return {
      detected, severity, roundNumber: currentRound, maxRounds,
      beliefStd: Math.round(beliefStd * 100) / 100,
      consensusLevel: Math.round(consensusLevel * 100) / 100,
      intervention,
    };
  }

  private computeStd(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);
  }

  private computeContentSimilarity(messages: MessageInfo[]): number {
    if (messages.length < 2) return 0;
    const contents = messages.map(m => m.content.toLowerCase().split(/\s+/).filter(w => w.length > GOVERNANCE_SIMILARITY_MIN_WORD_LENGTH));
    
    let totalSimilarity = 0;
    let pairCount = 0;
    
    for (let i = 0; i < contents.length; i++) {
      for (let j = i + 1; j < contents.length; j++) {
        const common = contents[i].filter(w => contents[j].includes(w)).length;
        const union = new Set([...contents[i], ...contents[j]]).size;
        totalSimilarity += union > 0 ? common / union : 0;
        pairCount++;
      }
    }
    
    return pairCount > 0 ? totalSimilarity / pairCount : 0;
  }

  private findRedundantAgentPairs(agentBeliefs: AgentBelief[]): [string, string][] {
    const pairs: [string, string][] = [];
    for (let i = 0; i < agentBeliefs.length; i++) {
      for (let j = i + 1; j < agentBeliefs.length; j++) {
        const beliefDiff = Math.abs(agentBeliefs[i].belief - agentBeliefs[j].belief);
        const confidenceDiff = Math.abs(agentBeliefs[i].confidence - agentBeliefs[j].confidence);
        if (beliefDiff < GOVERNANCE_REDUNDANT_BELIEF_DIFF && confidenceDiff < GOVERNANCE_REDUNDANT_CONFIDENCE_DIFF) {
          pairs.push([agentBeliefs[i].agentId, agentBeliefs[j].agentId]);
        }
      }
    }
    return pairs;
  }

  private clusterAgentsByBelief(agentBeliefs: AgentBelief[]): { label: string; agentIds: string[]; belief: number }[] {
    if (agentBeliefs.length === 0) return [];
    
    const sorted = [...agentBeliefs].sort((a, b) => a.belief - b.belief);
    const meanBelief = sorted.reduce((sum, b) => sum + b.belief, 0) / sorted.length;
    
    const groups: { label: string; agentIds: string[]; belief: number }[] = [];
    const positiveAgents = sorted.filter(b => b.belief > meanBelief + GOVERNANCE_CLUSTER_BELIEF_OFFSET);
    const negativeAgents = sorted.filter(b => b.belief < meanBelief - GOVERNANCE_CLUSTER_BELIEF_OFFSET);
    const neutralAgents = sorted.filter(b => Math.abs(b.belief - meanBelief) <= GOVERNANCE_CLUSTER_BELIEF_OFFSET);
    
    if (positiveAgents.length > 0) {
      groups.push({
        label: "positive",
        agentIds: positiveAgents.map(a => a.agentId),
        belief: positiveAgents.reduce((sum, a) => sum + a.belief, 0) / positiveAgents.length,
      });
    }
    
    if (negativeAgents.length > 0) {
      groups.push({
        label: "negative",
        agentIds: negativeAgents.map(a => a.agentId),
        belief: negativeAgents.reduce((sum, a) => sum + a.belief, 0) / negativeAgents.length,
      });
    }
    
    if (neutralAgents.length > 0) {
      groups.push({
        label: "neutral",
        agentIds: neutralAgents.map(a => a.agentId),
        belief: neutralAgents.reduce((sum, a) => sum + a.belief, 0) / neutralAgents.length,
      });
    }
    
    return groups;
  }

  private getSeverity(value: number, thresholds: [number, number]): SeverityLevel {
    if (value >= thresholds[1]) return "high";
    if (value >= thresholds[0]) return "medium";
    return "low";
  }

  private generateSummary(
    echoChamber: EchoChamberDetection,
    authorityBias: AuthorityBiasDetection,
    polarization: PolarizationDetection,
    prematureConsensus: PrematureConsensusDetection,
    interventionCount: number
  ): string {
    const issues: string[] = [];
    
    if (echoChamber.detected) {
      issues.push(`echo chamber (${echoChamber.severity})`);
    }
    if (authorityBias.detected) {
      issues.push(`authority bias (${authorityBias.severity})`);
    }
    if (polarization.detected) {
      issues.push(`polarization (${polarization.severity})`);
    }
    if (prematureConsensus.detected) {
      issues.push(`premature consensus (${prematureConsensus.severity})`);
    }
    
    if (issues.length === 0) {
      return "No group decision biases detected.";
    }
    
    return `Detected ${issues.length} issue(s): ${issues.join(", ")}. ${interventionCount} intervention(s) applied.`;
  }

  applyInterventions(
    interventions: Intervention[],
    state: GovernanceState,
    agentKnowledge?: Map<string, string[]>
  ): InterventionResult[] {
    const results: InterventionResult[] = [];

    for (const intervention of interventions) {
      const strategy = this.strategies.get(intervention.type);
      
      if (strategy) {
        const result = strategy.apply(intervention, state, agentKnowledge);
        results.push(result);
        
        if (result.success && result.stateChanges) {
          if (result.stateChanges.updatedEdges) {
            state.interactionGraph = state.interactionGraph || { nodes: [], edges: [] };
            state.interactionGraph.edges = result.stateChanges.updatedEdges;
          }
          if (result.stateChanges.updatedBeliefs) {
            state.agentBeliefs = result.stateChanges.updatedBeliefs;
          }
        }
      } else {
        results.push({
          success: false,
          intervention: { ...intervention, applied: false },
        });
      }
    }

    return results;
  }

  diagnoseAndIntervene(
    agentBeliefs: AgentBelief[],
    messages: MessageInfo[],
    agentIds: string[],
    interactionGraph?: GovernanceState["interactionGraph"],
    config?: GovernanceConfig
  ): { result: GovernanceResult; interventions: Intervention[] } {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const state: GovernanceState = {
      agentBeliefs,
      messages,
      agentIds,
      interactionGraph,
    };

    const result = this.diagnose(agentBeliefs, messages, agentIds, mergedConfig);
    const interventions: Intervention[] = [];

    const currentRound = mergedConfig.currentRound || 1;
    const maxRounds = mergedConfig.maxRounds || 5;
    const disabledSet = new Set(mergedConfig.disabledInterventions || []);

    // 最后一轮不触发任何干预（无法验证效果）
    const isLastRound = currentRound >= maxRounds;
    if (isLastRound) {
      return { result, interventions: [] };
    }

    // Helper: should we trigger this intervention type?
    const shouldTrigger = (type: InterventionType): boolean => {
      return !disabledSet.has(type);
    };

    // 自适应剂量计算（如果启用）
    const useAdaptiveDosage = mergedConfig.enableAdaptiveDosage === true;
    const roundProgress = currentRound / maxRounds;

    // 信息覆盖率估算（从 messages 中提取）
    const informationCoverage = this.estimateInformationCoverage(messages, agentIds);

    if (result.authorityBias.detected && result.authorityBias.dominantAgent && shouldTrigger("reduce_weight")) {
      let reductionFactor = mergedConfig.reduceWeightFactor ?? INTERVENTION_REDUCE_WEIGHT_FACTOR;
      if (useAdaptiveDosage) {
        const dosage = computeAdaptiveDosage({
          severity: this.severityToScore(result.authorityBias.severity),
          informationCoverage,
          historyEffectiveness: this.getHistoryEffectiveness("reduce_weight"),
          roundProgress,
          agentCount: agentIds.length,
          baseMaxRounds: maxRounds,
        });
        reductionFactor = dosage.weightReduction;
      }
      interventions.push({
        type: "reduce_weight",
        targetAgentId: result.authorityBias.dominantAgent,
        parameters: { reductionFactor },
        effect: "",
        applied: false,
      });
    }

    if (result.echoChamber.detected && result.echoChamber.redundantAgents.length > 0 && shouldTrigger("introduce_diversity")) {
      let perturbationAmount = mergedConfig.diversityPerturbation ?? INTERVENTION_DIVERSITY_PERTURBATION;
      if (useAdaptiveDosage) {
        const dosage = computeAdaptiveDosage({
          severity: this.severityToScore(result.echoChamber.severity),
          informationCoverage,
          historyEffectiveness: this.getHistoryEffectiveness("introduce_diversity"),
          roundProgress,
          agentCount: agentIds.length,
          baseMaxRounds: maxRounds,
        });
        perturbationAmount = dosage.perturbationAmount;
      }
      interventions.push({
        type: "introduce_diversity",
        targetAgents: result.echoChamber.redundantAgents,
        // 用持久 rng 生成子 seed，避免每次 apply() 从同一 seed 重建导致扰动值重复
        parameters: { perturbationAmount, seed: this.rng ? Math.floor(this.rng() * 0x7fffffff) : undefined },
        effect: "",
        applied: false,
      });
    }

    if (result.polarization.detected && result.polarization.groups.length > 0 && shouldTrigger("force_reflection")) {
      const extremeAgents = result.polarization.groups
        .filter(g => g.label === "positive" || g.label === "negative")
        .flatMap(g => g.agentIds);

      if (extremeAgents.length > 0) {
        let reflectionFactor = mergedConfig.reflectionFactor ?? INTERVENTION_REFLECTION_FACTOR;
        if (useAdaptiveDosage) {
          const dosage = computeAdaptiveDosage({
            severity: this.severityToScore(result.polarization.severity),
            informationCoverage,
            historyEffectiveness: this.getHistoryEffectiveness("force_reflection"),
            roundProgress,
            agentCount: agentIds.length,
            baseMaxRounds: maxRounds,
          });
          reflectionFactor = dosage.reflectionStrength;
        }
        interventions.push({
          type: "force_reflection",
          targetAgents: extremeAgents,
          parameters: { reflectionFactor },
          effect: "",
          applied: false,
        });
      }
    }

    if (result.prematureConsensus.detected && shouldTrigger("continue_discussion")) {
      const pcRound = result.prematureConsensus.roundNumber;
      const pcMaxRounds = result.prematureConsensus.maxRounds;
      const threshold = mergedConfig.prematureConsensusThreshold ?? 0.5;
      const pcRoundProgress = pcRound / pcMaxRounds;
      let additionalRounds = Math.ceil(pcMaxRounds * (threshold - pcRoundProgress));

      if (useAdaptiveDosage) {
        const dosage = computeAdaptiveDosage({
          severity: this.severityToScore(result.prematureConsensus.severity),
          informationCoverage,
          historyEffectiveness: this.getHistoryEffectiveness("continue_discussion"),
          roundProgress: pcRoundProgress,
          agentCount: agentIds.length,
          baseMaxRounds: pcMaxRounds,
        });
        additionalRounds = dosage.additionalRounds;
      }

      interventions.push({
        type: "continue_discussion",
        parameters: {
          additionalRounds: Math.max(additionalRounds, 1),
          reason: `Premature consensus at round ${pcRound}`,
        },
        effect: "",
        applied: false,
      });
    }

    return { result, interventions };
  }

  /** 估算信息覆盖率——从消息中提取唯一关键词的比例 */
  private estimateInformationCoverage(messages: MessageInfo[], agentIds: string[]): number {
    if (messages.length === 0) return 0;
    // 简化估算：有多少 agent 至少发过一条消息
    const activeAgents = new Set(messages.map(m => m.agentId));
    return activeAgents.size / Math.max(agentIds.length, 1);
  }

  /** 将 severity 字符串转为 [0,1] 分数 */
  private severityToScore(severity: string): number {
    switch (severity) {
      case "high": return 0.9;
      case "medium": return 0.6;
      case "low": return 0.3;
      default: return 0.5;
    }
  }

  evaluateEffects(
    beforeState: GovernanceState,
    afterState: GovernanceState,
    interventions: Intervention[]
  ): Record<string, number> {
    const effects: Record<string, number> = {};

    const beforeBeliefs = beforeState.agentBeliefs.map(b => b.belief);
    const afterBeliefs = afterState.agentBeliefs.map(b => b.belief);

    const beforeStd = this.computeStd(beforeBeliefs);
    const afterStd = this.computeStd(afterBeliefs);
    effects["belief_diversity_change"] = Math.round((afterStd - beforeStd) * 1000) / 1000;

    const beforeMean = beforeBeliefs.reduce((sum, b) => sum + b, 0) / beforeBeliefs.length;
    const afterMean = afterBeliefs.reduce((sum, b) => sum + b, 0) / afterBeliefs.length;
    effects["belief_mean_change"] = Math.round((afterMean - beforeMean) * 1000) / 1000;

    const beforeConsensusLevel = Math.max(0, 1 - beforeStd * 2);
    const afterConsensusLevel = Math.max(0, 1 - afterStd * 2);
    effects["consensus_level_change"] = Math.round((afterConsensusLevel - beforeConsensusLevel) * 1000) / 1000;

    const beforeConfidences = beforeState.agentBeliefs.map(b => b.confidence);
    const afterConfidences = afterState.agentBeliefs.map(b => b.confidence);
    effects["avg_confidence_change"] = Math.round(
      ((afterConfidences.reduce((sum, c) => sum + c, 0) / afterConfidences.length) -
      (beforeConfidences.reduce((sum, c) => sum + c, 0) / beforeConfidences.length)) * 1000
    ) / 1000;

    const successfulInterventions = interventions.filter(i => i.applied).length;
    const totalInterventions = interventions.length;
    effects["successful_interventions"] = successfulInterventions;
    effects["intervention_success_rate"] = totalInterventions > 0 
      ? Math.round((successfulInterventions / totalInterventions) * 100) 
      : 0;

    if (beforeState.interactionGraph && afterState.interactionGraph) {
      const beforeTotalWeight = beforeState.interactionGraph.edges.reduce((sum, e) => sum + e.weight, 0);
      const afterTotalWeight = afterState.interactionGraph.edges.reduce((sum, e) => sum + e.weight, 0);
      effects["total_influence_weight_change"] = Math.round((afterTotalWeight - beforeTotalWeight) * 1000) / 1000;

      const beforeEdgeCount = beforeState.interactionGraph.edges.length;
      const afterEdgeCount = afterState.interactionGraph.edges.length;
      effects["interaction_edge_count_change"] = afterEdgeCount - beforeEdgeCount;
    }

    const beforeMin = Math.min(...beforeBeliefs);
    const beforeMax = Math.max(...beforeBeliefs);
    const afterMin = Math.min(...afterBeliefs);
    const afterMax = Math.max(...afterBeliefs);
    effects["belief_range_before"] = Math.round((beforeMax - beforeMin) * 1000) / 1000;
    effects["belief_range_after"] = Math.round((afterMax - afterMin) * 1000) / 1000;

    return effects;
  }
}

export * from "./types";
export * from "./interventions";
export * from "./adaptiveThresholds";
export * from "./adaptiveDosage";