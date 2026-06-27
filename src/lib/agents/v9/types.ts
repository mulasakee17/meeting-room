/**
 * SwarmAlpha v9.2 — 因子基 Agent 架构
 *
 * 核心转变: LLM 从"方向判断器" → "正交因子提取器"
 *   v5-v8: News → LLM("涨还是跌?") → Brief → Agent 投票
 *   v9:    News → LLM("5个正交因子是什么?") → Agent 各自解释 → Belief
 *
 * 五因子正交体系:
 *   1. Liquidity  — 融资环境 (独立)
 *   2. Policy     — 政策力度 (独立, 且强制独立于事件评估)
 *   3. Fundamental— 实体经济影响 (独立)
 *   4. Narrative  — 传播持久性 (独立, 明确非情绪方向)
 *   5. Uncertainty— 认知模糊度 (独立, 0-100 单边)
 *
 * 设计原则:
 *   1. Agent 不输出方向 — 只输出因子影响
 *   2. 强制信息盲区 — 每个 Agent 只能看到特定因子类别
 *   3. 因子是客观的, 解释是主观的 — 这才是真正的异质性
 *   4. 不确定性双引擎 — 因子层(event uncertainty) + 行为层(consensus quality)
 */

// ==================== 因子系统 ====================

/** 正交五因子类别 */
export type FactorCategory =
  | "liquidity"     // 融资环境: 资金收缩/宽松, 信用条件
  | "policy"        // 政策力度: 政府/央行支持, 独立于事件评估
  | "fundamental"   // 基本面: 经济活动, 企业盈利影响
  | "narrative"     // 叙事动量: 传播持久性, 非情绪方向
  | "uncertainty";  // 不确定性: 0-100, 不能为负

/** 单个因子的提取结果 */
export interface ExtractedFactor {
  category: FactorCategory;
  /**
   * liquidity/policy/fundamental/narrative: -100 到 +100
   * uncertainty: 0 到 100 (不能为负)
   */
  value: number;
  /** 0-100, 对该因子判断的确信度 */
  confidence: number;
  /** 客观推理证据 */
  evidence: string;
}

/** 完整的因子向量 */
export interface FactorVector {
  factors: ExtractedFactor[];
  /** 因子提取的元信息 */
  metadata: {
    newsSummary: string;
    detectedAnomalies: string[];
    timestamp: string;
    /** 🆕 v9.6: LLM 识别的市场事件模式 (MECHANICAL_SELLOFF|SOLVENCY_CRISIS|EXTERNAL_SHOCK|NARRATIVE_DRIVEN) */
    marketPattern?: string;
  };
}

// ==================== Agent 定义 ====================

/** Agent 的因子权限 */
export interface FactorPermission {
  /** 该 Agent 可见的因子类别 (不含 uncertainty, uncertainty 始终可见) */
  visibleFactors: FactorCategory[];
  /** 该 Agent 的因子解释权重 */
  factorWeights: Partial<Record<FactorCategory, number>>;
  /** 该 Agent 对不确定性的反应系数 (-1.0 ~ 2.0)
   *  >0: 不确定性降低信心 (Panic=1.2, Retail=0.8)
   *  =0: 不确定性不影响 (Quant=0.1)
   *  <0: 不确定性增加信心 (Contrarian=-0.5, Value=-0.2)
   */
  uncertaintySensitivity: number;
  /** 该 Agent 的决策风格描述 */
  interpretationStyle: "macro" | "value" | "momentum" | "narrative" | "statistical" | "contrarian" | "sentiment";
}

/** V9 Agent 定义 */
export interface V9AgentDefinition {
  id: string;
  name: string;
  emoji: string;
  role: string;
  permissions: FactorPermission;
  initialBias: number;
  /** 影响力权重 (用于共识加权) */
  influenceWeight: number;
  /** 资本权重 (用于资金流) */
  capitalWeight: number;
}

/** V9 Agent 运行时状态 */
export interface V9AgentState {
  agentId: string;
  /** 当前信念 -100..+100 */
  belief: number;
  /** 信念置信度 0-100 */
  confidence: number;
  /** 该 Agent 可见的因子 (经过权限过滤) */
  visibleFactors: ExtractedFactor[];
  /** 因子解释记录 */
  interpretation: string;
  /** 上轮信念 */
  previousBelief: number;
}

// ==================== 共识质量引擎 (原不确定性引擎) ====================

/**
 * 共识质量检测 — 与因子层的 uncertainty 互补
 * 因子层: "这个事件本身有多不确定?" (LLM 判断)
 * 共识层: "Agent 们是否无法形成一致判断?" (行为检测)
 */
export interface UncertaintyResult {
  /** 是否判定为不确定 */
  isUncertain: boolean;
  /** 不确定性原因 */
  reasons: string[];
  /** 不确定性分数 0-100 */
  score: number;
}

// ==================== 决策层输出 ====================

export type V9Direction = "UP" | "DOWN" | "NEUTRAL";

export interface V9Decision {
  direction: V9Direction;
  /** 0-100 */
  confidence: number;
  /** 加权共识值 -100..+100 */
  consensus: number;
  /** Agent 信念的标准差 (异质性指标) */
  beliefStd: number;
  /** 共识质量检测结果 */
  uncertainty: UncertaintyResult;
  /** 最大的 Agent 簇占比 */
  largestClusterRatio: number;
  /** v9.3: Neutral 检测追踪 (哪些规则触发) */
  neutralTrace?: {
    rule1_fired: boolean;       // abs(consensus) < 15
    rule2_fired: boolean;       // belief_std > 45
    rule3_fired: boolean;       // kuramoto_r < 0.4
    rule4_fired: boolean;       // uncertainty > 70 && abs(consensus) < 25
    finalNeutral: boolean;
    gatingReason: string;
  };
}

// ==================== 群体行为诊断 ====================

/** 单个 Agent 的归因贡献 */
export interface AgentAttribution {
  agentId: string;
  agentName: string;
  emoji: string;
  belief: number;
  confidence: number;
  influenceWeight: number;
  /** 净贡献值 = belief × influenceWeight × confidence/100 */
  contribution: number;
  /** 贡献占比 (%) */
  contributionPct: number;
  /** 推动方向 */
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  /** 该 Agent 看到的因子 */
  visibleFactors: FactorCategory[];
}

/** 联盟检测结果 */
export interface CoalitionAnalysis {
  /** 多头联盟 */
  bullishCoalition: {
    agentIds: string[];
    totalInfluence: number;
    totalCapital: number;
    weightedBelief: number;
  };
  /** 空头联盟 */
  bearishCoalition: {
    agentIds: string[];
    totalInfluence: number;
    totalCapital: number;
    weightedBelief: number;
  };
  /** 中立阵营 */
  neutralAgents: string[];
  /** 力量对比: 多头影响力 / 空头影响力 */
  powerRatio: number;
  /** 主导联盟 */
  dominantCoalition: "BULLISH" | "BEARISH" | "BALANCED";
  /** 联盟对抗强度 0-100 */
  tension: number;
  /** 关键摇摆 Agent (可能翻转共识方向) */
  swingAgents: string[];
}

/** 反事实分析变体 */
export interface CounterfactualVariant {
  label: string;
  description: string;
  /** 移除/修改的 Agent ID */
  modifiedAgentId?: string;
  /** 关闭盲区 */
  disableBlindness?: boolean;
  /** 修改后的共识值 */
  consensus: number;
  /** 修改后的方向 */
  direction: V9Direction;
  /** 共识变化量 */
  deltaConsensus: number;
  /** 方向是否翻转 */
  directionFlipped: boolean;
  /** 影响力变化 */
  impact: "CRITICAL" | "SIGNIFICANT" | "MODERATE" | "MINIMAL";
}

/** 反事实分析报告 */
export interface CounterfactualReport {
  /** 基线共识 */
  baselineConsensus: number;
  /** 各变体结果 */
  variants: CounterfactualVariant[];
  /** 最关键的 Agent (移除后共识变化最大) */
  mostInfluentialAgent: string;
  /** 系统韧性: 需要移除多少 Agent 才能翻转方向 */
  agentsToFlip: number;
}

/** 完整诊断报告 */
export interface DiagnosticReport {
  /** 归因分解 */
  attribution: AgentAttribution[];
  /** 联盟分析 */
  coalition: CoalitionAnalysis;
  /** 反事实分析 */
  counterfactuals: CounterfactualReport;
  /** 诊断摘要 (可喂给 LLM 生成叙事) */
  summary: {
    /** 一句话核心诊断 */
    coreFinding: string;
    /** 共识形成机制 (为什么达成这个共识) */
    consensusMechanism: string;
    /** 关键风险点 */
    riskFactors: string[];
    /** 信息盲区效应 */
    blindnessEffect: string;
  };
}

// ==================== 模拟配置与结果 ====================

export interface V9SimConfig {
  news: string;
  marketData: {
    vix: number; rsi: number; dropMagnitude: number;
    volatility?: number;
    volumeSpike?: number;
    sectorRotation?: number;
    yieldCurveSpread?: number;
    goldMomentum?: number;
    oilMomentum?: number;
    hasPolicyResponse: boolean;
    hasLeverageDamage: boolean;
    hasSolvencyDamage: boolean;
  };
  rounds: number;
  /** 🆕 v9.5.2: 方向判定阈值 (consensus>=this→UP, else→DOWN)。默认 15。模板模式建议 -5。 */
  directionThreshold?: number;
  /** 🆕 v9.5.2: 启用 V 型反弹路由仲裁 (classifier V_REBOUND + 高置信→强制 UP)。默认 true。 */
  enableVRoute?: boolean;
  /** 🆕 v10: 启用价格反馈闭环 (信念→订单→撮合→价格→Agent感知)。
   *  默认 false（向后兼容），设为 true 开启。 */
  enablePriceFeedback?: boolean;
  /** 消融实验: 禁用组件 */
  ablation?: {
    disablePolicyAgent?: boolean;
    disableUncertainty?: boolean;
    disableBlindness?: boolean;  // 取消信息盲区 = 所有Agent看全部因子
    disableClustering?: boolean; // v9.2: 禁用混合门控 → 纯线性共识 (消融对照)
    // v9.3: Neutral Detection Engine 消融
    disableNeutralRule1?: boolean;    // 禁用 Rule1 (弱共识门控)
    disableNeutralRule2_3?: boolean;  // 禁用 Rule2+3 (高分歧+低同步门控)
    disableNeutralRule4?: boolean;    // 禁用 Rule4 (高不确定性+弱共识门控)
    /** 🆕 v9.6: 禁用均值回归感知 (消融实验用) */
    disableMeanReversion?: boolean;
    /** 🆕 v9.7: 非线性共识方法 (替代 linear+cluster+gating pipeline)。
     *  可选值: "power_law" | "entropy_weighted" | "trimmed_mean" | "median"
     *        | "winsorized" | "geometric_mean" | "dynamic_ensemble" | "linear_baseline"
     *  设为 "dynamic_ensemble" (推荐) 自动运行全部 6 种非线性方法并加权集成。 */
    nonlinearMethod?: string;
    /** 🆕 v9.7: 非线性共识参数覆盖 (alpha, trimCount 等) */
    nonlinearConfig?: Record<string, number | string | string[]>;
  };
}

export interface V9RoundState {
  round: number;
  factorVector: FactorVector;
  agents: Record<string, V9AgentState>;
  decision: V9Decision;
}

export interface V9SwarmResult {
  news: string;
  rounds: V9RoundState[];
  finalDecision: V9Decision;
  /** 消融实验指标 */
  ablationMetrics: {
    policyAgentActive: boolean;
    uncertaintyActive: boolean;
    blindnessActive: boolean;
    beliefStdHistory: number[];
  };
  /** 🆕 群体行为诊断报告 */
  diagnostics: DiagnosticReport;
  /** 🆕 v9.7: 非线性共识元数据 (当 ablation.nonlinearMethod 设置时填充) */
  nonlinearConsensus?: {
    method: string;
    individualResults?: Array<{
      method: string;
      consensus: number;
      confidence: number;
      signalQuality: number;
    }>;
    ensembleWeights?: Record<string, number>;
  };
  /** 🆕 v10: 价格反馈闭环 */
  priceFeedback?: PriceFeedbackState;
}

// ==================== v10: 价格反馈闭环 ====================

/** Agent 持仓状态 */
export interface AgentPosition {
  agentId: string;
  /** 持仓数量：正=多头，负=空头 */
  position: number;
  /** 持仓成本价 */
  avgCost: number;
  /** 最大回撤 (从持仓最高点) */
  maxDrawdown: number;
  /** 当前浮动盈亏 */
  unrealizedPnL: number;
}

/** 价格状态 */
export interface PriceState {
  currentPrice: number;
  previousPrice: number;
  priceChange: number;      // 百分比
  cumulativeReturn: number; // 累计涨跌幅
  /** 模拟波动率 */
  volatility: number;
}

/** 订单项 */
export interface OrderItem {
  agentId: string;
  direction: "BUY" | "SELL" | "HOLD";
  size: number;            // 绝对数量
  belief: number;          // 触发订单的信念值
  confidence: number;      // 信心权重
}

/** 撮合结果 */
export interface OrderMatchResult {
  netOrderFlow: number;   // 净订单流 (正=净买入)
  buyPressure: number;
  sellPressure: number;
  priceImpact: number;     // 价格变动估算
}

/** 价格反馈状态 */
export interface PriceFeedbackState {
  price: PriceState;
  positions: Record<string, AgentPosition>;
  orders: OrderItem[];
  orderMatch: OrderMatchResult;
  /** 是否是反馈轮 (非第一轮) */
  isFeedbackRound: boolean;
  /** 反馈轮次数 */
  feedbackRound: number;
}
