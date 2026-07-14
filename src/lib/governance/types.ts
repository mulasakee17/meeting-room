export type SeverityLevel = "low" | "medium" | "high";

export type InterventionType =
  | "introduce_diversity"
  | "reduce_weight"
  | "force_reflection"
  | "continue_discussion"
  | "none";

export interface Intervention {
  type: InterventionType;
  targetAgentId?: string;
  targetAgents?: string[];
  parameters?: Record<string, unknown>;
  effect: string;
  applied: boolean;
  /** 干预应用的轮次（由 GovernanceRuntime 设置） */
  round?: number;
}

export interface GovernanceState {
  agentBeliefs: AgentBelief[];
  messages: MessageInfo[];
  agentIds: string[];
  interactionGraph?: {
    nodes: string[];
    edges: Array<{ source: string; target: string; weight: number; type: string }>;
  };
}

export interface InterventionResult {
  success: boolean;
  intervention: Intervention;
  stateChanges?: {
    updatedBeliefs?: AgentBelief[];
    updatedEdges?: Array<{ source: string; target: string; weight: number; type: string }>;
    newAgents?: AgentBelief[];
  };
  /** Information-layer prompt to inject into the next discussion round.
   *  When set, the DiscussionEngine appends this text as visible context
   *  for the affected agents in the following round. */
  prompt?: string;
  /** Which agents should see this prompt. If empty, all agents see it. */
  promptTargets?: string[];
}

export interface InterventionStrategy {
  name: string;
  type: InterventionType;
  apply(
    intervention: Intervention,
    state: GovernanceState,
    /** Optional: agentId → unique knowledge strings for prompt generation */
    agentKnowledge?: Map<string, string[]>
  ): InterventionResult;
}

export interface EchoChamberDetection {
  detected: boolean;
  severity: SeverityLevel;
  redundantAgents: string[];
  infoRedundancyScore: number;
  intervention: {
    type: InterventionType;
    applied: boolean;
    effect?: string;
  };
}

export interface AuthorityBiasDetection {
  detected: boolean;
  severity: SeverityLevel;
  dominantAgent?: string;
  influenceRatio: number;
  intervention: {
    type: InterventionType;
    applied: boolean;
    effect?: string;
  };
}

export interface PolarizationDetection {
  detected: boolean;
  severity: SeverityLevel;
  groups: {
    label: string;
    agentIds: string[];
    belief: number;
  }[];
  polarizationIndex: number;
  /** 双峰系数 BC = (skewness² + 1) / kurtosis；BC > 0.555 提示双峰分布 */
  bimodalityCoefficient?: number;
  intervention: {
    type: InterventionType;
    applied: boolean;
    effect?: string;
  };
}

export interface PrematureConsensusDetection {
  detected: boolean;
  severity: SeverityLevel;
  roundNumber: number;
  maxRounds: number;
  beliefStd: number;
  consensusLevel: number;
  intervention: {
    type: InterventionType;
    applied: boolean;
    effect?: string;
  };
}

export interface GovernanceIssue {
  type: string;
  severity: SeverityLevel;
  description: string;
  agents?: string[];
}

export interface GovernanceResult {
  echoChamber: EchoChamberDetection;
  authorityBias: AuthorityBiasDetection;
  polarization: PolarizationDetection;
  prematureConsensus: PrematureConsensusDetection;
  otherIssues: GovernanceIssue[];
  summary: string;
  interventionCount: number;
}

export interface GovernanceConfig {
  enableEchoChamberDetection?: boolean;
  enableAuthorityBiasDetection?: boolean;
  enablePolarizationDetection?: boolean;
  enablePrematureConsensusDetection?: boolean;
  interventionLevel?: "none" | "light" | "medium" | "heavy";
  echoChamberThreshold?: number;
  authorityBiasThreshold?: number;
  polarizationThreshold?: number;
  prematureConsensusThreshold?: number;
  maxRounds?: number;
  currentRound?: number;
  /** Override INTERVENTION_REDUCE_WEIGHT_FACTOR (default 0.5) */
  reduceWeightFactor?: number;
  /** Override INTERVENTION_DIVERSITY_PERTURBATION (default 0.3) */
  diversityPerturbation?: number;
  /** Override INTERVENTION_REFLECTION_FACTOR (default 0.2) */
  reflectionFactor?: number;
  /** 启用自适应阈值——第一轮后自动校准检测阈值（默认 false） */
  enableAdaptiveThresholds?: boolean;
  /** 启用自适应剂量——干预强度根据严重度和历史效果动态调整（默认 false） */
  enableAdaptiveDosage?: boolean;
  /** 禁用的干预类型列表。检测器仍运行，但不触发被禁用的干预。
   * 默认禁用: ["introduce_diversity", "continue_discussion"]（实验证明无效/有害） */
  disabledInterventions?: InterventionType[];
}

export interface AgentBelief {
  agentId: string;
  belief: number;
  confidence: number;
}

export interface MessageInfo {
  agentId: string;
  content: string;
  timestamp: string;
  referencedAgents?: string[];
}

// ============================================================================
// BiasDetector — 可扩展的偏差检测器接口
// ============================================================================

/**
 * 自定义检测器的实现接口。
 *
 * GovernanceEngine 内置 4 个检测器（echoChamber/authorityBias/polarization/
 * prematureConsensus），它们的输出填充 GovernanceResult 的强类型字段。
 * 通过 registerDetector() 注册的额外检测器，输出填充 otherIssues 数组。
 *
 * 示例：
 * ```typescript
 * const engine = new GovernanceEngine();
 * engine.registerDetector({
 *   type: "groupthink",
 *   detect(beliefs, messages, config) {
 *     // 检测逻辑
 *     return { detected: true, severity: "medium", description: "...", agents: ["a1"] };
 *   },
 * });
 * ```
 */
export interface BiasDetector {
  /** 检测器唯一标识 */
  type: string;
  /**
   * 执行检测。
   * @returns 检测结果。detected=true 时会被加入 GovernanceResult.otherIssues。
   */
  detect(
    agentBeliefs: AgentBelief[],
    messages: MessageInfo[],
    config: GovernanceConfig
  ): DetectorResult;
}

/** 自定义检测器的输出 */
export interface DetectorResult {
  detected: boolean;
  severity: SeverityLevel;
  description: string;
  agents?: string[];
}