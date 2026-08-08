export type SeverityLevel = "low" | "medium" | "high";

export type InterventionType =
  | "introduce_diversity"
  | "reduce_weight"
  | "force_reflection"
  | "continue_discussion"
  | "inject_evidence"
  | "rebalance_attention"
  | "shuffle_knowledge"
  | "devils_advocate"
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
  /** 干预触发原因（NativeCognitiveEngine 同步路径携带，审计用） */
  reason?: string;
  /** 触发此干预的 δ 信号来源（e.g. δ_polarization） */
  source?: string;
  /** 生成该干预建议的诊断轮次。 */
  diagnosedAtRound?: number;
  /** 干预开始影响 agent prompt/state 的轮次；无执行窗口时为空。 */
  effectiveFromRound?: number;
  /** 区分“已生成建议”“已排队”和“实际没有下一轮可执行”。 */
  applicationStatus?: "queued" | "applied" | "not_applied_no_next_round";
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
  /** Phase 4B: Cognitive state modifications to apply after intervention.
   *  Maps agentId → partial cognitive state overrides.
   *  Used by cognitive governance to adjust influence weights, inertia, etc. */
  cognitiveStateModifications?: Map<string, CognitiveStateModification>;
  /** 失败原因（success=false 时）。策略抛异常或未注册时填充，用于诊断。 */
  error?: string;
}

// ============================================================================
// Phase 4B: Cognitive State Driven Governance Types
// ============================================================================

/**
 * 认知治理状态 — 从 AgentCognitiveState 提取的 governance 输入。
 *
 * 每个维度可供检测器消费，干预可修改部分维度（通过 CognitiveStateModification）。
 */
export interface CognitiveGovernanceState {
  agentId: string;
  utility: {
    /** 每个选项的效用值 */
    scores: Record<string, number>;
    /** 效用最高的选项 */
    topChoice: string;
    /** 偏好清晰度 */
    preferenceClarity: number;
    /** 偏好强度 */
    intensity: number;
  };
  evidence: {
    /** 信息覆盖度 */
    coverage: number;
    /** 信息质量 */
    quality: number;
    /** 信息多样性 */
    diversity: number;
  };
  inertia: {
    /** 惯性强度 */
    strength: number;
  };
  confidence: {
    /** 总体确信度 */
    overall: number;
  };
  /**
   * @deprecated 兼容别名，等于 socialUpdateGain。绝不切换为行为易感性。
   */
  susceptibility: number;
  /** DeGroot 社会更新增益 = max((1-ι)(1-c), 0.05)。政策/模型系数。 */
  socialUpdateGain: number;
  /**
   * 行为易感性（暴露-响应估计），与 socialUpdateGain 语义分离。
   * 缺失/不可用（usable=false）时不得用 socialUpdateGain 顶替。
   */
  behavioralSusceptibility?: {
    estimate: number;
    confidence: number;
    usable: boolean;
  };
  /** LLM itemBeliefs 中 rank=1 的 item（用于 Utility-Ranking Consistency） */
  rankingTopChoice?: string;
}

/**
 * 认知状态修改 — 干预对 cognitive state 的部分覆写。
 *
 * 只包含可被干预修改的维度。未设置的字段保持原值。
 * 修改在下一轮 buildPrompt 和 updateCognitiveStatesFromRound 中生效。
 */
export interface CognitiveStateModification {
  /** 修改影响权重（用于加权 DeGroot 更新）。
   *  Maps targetAgentId → newWeight (0=完全屏蔽, 1=正常权重) */
  influenceWeights?: Record<string, number>;
  /** 修改惯性强度（乘性因子, 0.5=减半, 1=不变） */
  inertiaFactor?: number;
  /** 引导证据多样性：提示 agent 关注哪些维度的证据 */
  evidenceGuidance?: string[];
  /** v2.1: 注入 prompt 文本到 agent 的 governance prompt（用于 inject_evidence） */
  injectPrompt?: string;
  /** v2.1: 降低发言优先级（用于 rebalance_attention） */
  lowerSpeakingPriority?: boolean;
  /** v2.1: 提高发言优先级（用于 rebalance_attention） */
  higherSpeakingPriority?: boolean;
  /** v2.1: 触发知识重排（用于 shuffle_knowledge） */
  shuffleKnowledge?: boolean;
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
  /** 标记 issue 来源：内置检测器（builtin）或自定义检测器（custom）。
   *  diagnoseAndIntervene 消费 otherIssues 时仅处理 custom，避免与内置 if 链双重触发。 */
  source?: "builtin" | "custom";
  /** 自定义检测器建议的干预。留空则仅记录不触发干预（观测模式）。
   *  type 必须是 InterventionType 闭合联合的成员（H8 约束）。 */
  suggestedIntervention?: {
    type: InterventionType;
    /** 目标 agent 列表。reduce_weight 会自动取第一个回退到 targetAgentId。 */
    targetAgents?: string[];
    parameters?: Record<string, unknown>;
    reason?: string;
  };
  /** 检测时间（δ 诊断与语义路径写入，审计日志用） */
  detectedAt?: string;
  /** 检测器生成的 issue 标识（δ_* / delta_*_N） */
  id?: string;
  /** 审计字段：detector 触发的结构化数值依据（第三方验证用）。
   *  例如 authority_bias: { influenceRatio: 0.44, threshold: 0.30 }
   *  例如 polarization: { polarizationIndex: 0.72, bimodalityCoefficient: 0.58, threshold: 0.15 }
   *  2026-07-23 新增：支持第三方独立验证治理决策的正确性 */
  detectionMetrics?: Record<string, number>;
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
  /** FC1 (MAST FM-1.2)：启用角色违规检测（默认 true，需注入 agentRoles 才生效） */
  enableRoleViolationDetection?: boolean;
  /** FC1 (MAST FM-1.3)：启用步骤重复检测（默认 true） */
  enableStepRepetitionDetection?: boolean;
  /** FC3 (MAST FM-3.1)：启用过早终止检测（默认 true） */
  enablePrematureTerminationDetection?: boolean;
  interventionLevel?: "none" | "light" | "medium" | "heavy";
  echoChamberThreshold?: number;
  authorityBiasThreshold?: number;
  polarizationThreshold?: number;
  prematureConsensusThreshold?: number;
  /** FC1 (MAST FM-1.2)：角色一致性阈值，agent 发言与 role 关键词重叠度低于此值视为违规（默认 0.15） */
  roleViolationThreshold?: number;
  /** FC1 (MAST FM-1.3)：步骤重复阈值，同一 agent 相邻发言相似度高于此值视为重复（默认 0.7） */
  stepRepetitionThreshold?: number;
  /** FC3 (MAST FM-3.1)：过早终止证据充分性阈值，发出终止信号但 evidence 数量低于此值视为过早（默认 2） */
  prematureTerminationEvidenceThreshold?: number;
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
  /** 自定义检测器建议的干预。留空则仅记录不触发干预（观测模式）。
   *  diagnose() 会透传到 GovernanceIssue.suggestedIntervention，
   *  diagnoseAndIntervene() 消费 otherIssues 时据此触发干预。
   *  type 必须是 InterventionType 闭合联合的成员（H8 约束）。 */
  suggestedIntervention?: {
    type: InterventionType;
    /** 目标 agent 列表。reduce_weight 会自动取第一个回退到 targetAgentId。 */
    targetAgents?: string[];
    parameters?: Record<string, unknown>;
    reason?: string;
  };
}
