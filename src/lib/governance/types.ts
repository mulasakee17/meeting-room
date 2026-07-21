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

// ============================================================================
// A3 (MAST) 新增检测器接口 — FM-2.4/2.5/2.6
// ============================================================================

/** FM-2.4 Information withholding：agent 有独有信息但 evidence[] 为空 */
export interface InformationWithholdingDetection {
  detected: boolean;
  severity: SeverityLevel;
  /** 有独有信息但未在 evidence 中暴露的 agent 列表 */
  withholdingAgents: string[];
  intervention: {
    type: InterventionType;
    applied: boolean;
    effect?: string;
  };
}

/** FM-2.5 Ignored other's input：agent 被他人引用但未回应 */
export interface IgnoredInputDetection {
  detected: boolean;
  severity: SeverityLevel;
  /** 被引用但未回引的 agent 列表 */
  ignoringAgents: string[];
  intervention: {
    type: InterventionType;
    applied: boolean;
    effect?: string;
  };
}

/** FM-2.6 Reasoning-action mismatch：reasoning 倾向与 itemBeliefs 排序矛盾 */
export interface ReasoningActionMismatchDetection {
  detected: boolean;
  severity: SeverityLevel;
  /** reasoning 与 itemBeliefs 排序矛盾的 agent 列表 */
  mismatchAgents: string[];
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
  /** A3 (MAST FM-2.4) */
  informationWithholding: InformationWithholdingDetection;
  /** A3 (MAST FM-2.5) */
  ignoredInput: IgnoredInputDetection;
  /** A3 (MAST FM-2.6) */
  reasoningActionMismatch: ReasoningActionMismatchDetection;
  otherIssues: GovernanceIssue[];
  summary: string;
  interventionCount: number;
}

export interface GovernanceConfig {
  enableEchoChamberDetection?: boolean;
  enableAuthorityBiasDetection?: boolean;
  enablePolarizationDetection?: boolean;
  enablePrematureConsensusDetection?: boolean;
  /** A3 (MAST FM-2.4)：启用信息隐藏检测（默认 true，但需注入 infoKeywordsMap 才生效） */
  enableInformationWithholdingDetection?: boolean;
  /** A3 (MAST FM-2.5)：启用忽略他人输入检测（默认 true） */
  enableIgnoredInputDetection?: boolean;
  /** A3 (MAST FM-2.6)：启用推理-行动不匹配检测（默认 true，但需 messages 带 itemBeliefs/reasoning） */
  enableReasoningActionMismatchDetection?: boolean;
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
  /** 干预排序模式：
   * - 'fdecomposition'（默认）：社会热力学 F 分解驱动优先级排序
   * - 'fixed'：保持检测器触发顺序（reduce_weight → introduce_diversity → force_reflection → continue_discussion）
   *   用于 A/B 对照实验，验证 F 分解排序相比固定排序是否有显著改善 */
  sortingMode?: "fdecomposition" | "fixed";
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
  /** A3 (MAST FM-2.4): preserved evidence items for information withholding detection */
  evidence?: string[];
  /** A3 (MAST FM-2.6): per-item beliefs for reasoning-action mismatch detection */
  itemBeliefs?: Array<{ item: string; rank: number; belief: number; confidence: number }>;
  /** A3 (MAST FM-2.6): original reasoning text for reasoning-action mismatch detection */
  reasoning?: string;
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