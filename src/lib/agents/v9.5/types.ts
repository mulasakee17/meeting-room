/**
 * SwarmAlpha v9.5 — Agent 互动层 + 共识度量引擎
 *
 * v9.5 = v9.3 + 3 个新模块 (纯增量，零侵入):
 *   1. Agent 互动层 — Agent 观察彼此观点后更新信念
 *   2. 共识度量引擎 — Consensus / Polarization / Fragility Score
 *   3. 共识可视化 — 仪表盘 + 演化动画
 *
 * 设计约束:
 *   - 纯数学，零 LLM 调用
 *   - 不修改任何 v9.3 已有代码
 *   - 可独立开关 (不启用互动层 = v9.3 原始行为)
 */

import { V9AgentState, FactorCategory } from "../v9/types";

// ==================== Agent 社交参数 ====================

/** Agent 社交开放度配置 */
export interface SocialProfile {
  /** Agent ID */
  agentId: string;
  /** 社交开放度 (-1 ~ 1)
   *  >0: 从众 — 看到别人观点后向对方靠拢
   *  =0: 独立 — 完全不理会别人
   *  <0: 逆向 — 看到别人看多，反而看空
   */
  alpha: number;
  /** 该 Agent 能看到的其他 Agent ID 列表 (由因子重叠决定) */
  visibleAgentIds: string[];
  /** 可见性原因: 共享的因子类别 */
  visibilityReason: string;
}

// ==================== Agent 社交参数预设 ====================

/** 8+1 Agent 的社交开放度 */
export const SOCIAL_ALPHAS: Record<string, number> = {
  institution: 0.15,  // 机构有独立研究，不易动摇
  value:       0.05,  // 价值投资者最独立
  trend:       0.50,  // 趋势交易者高度关注他人行为
  panic:       0.70,  // 恐慌者最易受他人影响
  quant:       0.10,  // 量化模型不受情绪影响
  media:       0.45,  // 媒体天然放大和跟随
  contrarian: -0.15,  // 逆向者 — 看到别人看空，反而看多 (v9.5.1: -0.30→-0.15 防止极限环振荡)
  retail:      0.60,  // 散户高度从众
  policy:      0.20,  // 政策制定者相对独立
};

// ==================== 互动状态 ====================

/** 单轮互动记录 */
export interface InteractionRound {
  round: number;
  /** 每个 Agent 的信念 (本轮结束时) */
  beliefs: Record<string, number>;
  /** 每个 Agent 的信念变化 (相对于上一轮) */
  beliefChanges: Record<string, number>;
  /** 本轮平均信念 */
  meanBelief: number;
  /** 本轮信念标准差 */
  beliefStd: number;
  /** 是否已收敛 */
  converged: boolean;
}

/** 互动完整结果 */
export interface InteractionResult {
  /** 互动轮次记录 */
  rounds: InteractionRound[];
  /** 最终信念 */
  finalBeliefs: Record<string, number>;
  /** 互动总轮数 */
  totalRounds: number;
  /** 收敛类型 */
  convergenceType: "converged" | "max_rounds" | "diverged";
  /** 每个 Agent 的信念偏移 (最终 - 初始) */
  beliefShift: Record<string, number>;
  /** 是否形成了共识 */
  consensusFormed: boolean;
  /** 分歧是否加大了 */
  polarizationIncreased: boolean;
  /** 社交可见性矩阵 (用于可视化) */
  socialProfiles: SocialProfile[];
}

// ==================== 共识度量指标 ====================

/** v9.5 三个核心指标 */
export interface ConsensusMetrics {
  /** 共识强度 0-100
   *  0-30: 弱共识 | 30-60: 中等 | 60-80: 强共识 | 80-100: 极强
   */
  consensusScore: number;

  /** 极化程度 0-100
   *  0-30: 低极化 | 30-60: 中度 | 60-80: 高度 | 80-100: 极端
   */
  polarizationScore: number;

  /** 共识脆弱性 0-100
   *  0-25: 稳健 | 25-50: 中等 | 50-75: 脆弱 | 75-100: 极度脆弱
   */
  fragilityScore: number;

  /** 状态标签 (人类可读) */
  stateLabel: string;

  /** 状态解读 */
  stateInterpretation: string;
}

// ==================== v9.5 完整输出 ====================

/** 动态权重 — Agent 级别调整详情 */
export interface AgentWeightAdjustment {
  agentId: string;
  agentName: string;
  emoji: string;
  baseWeight: number;
  multiplier: number;
  finalWeight: number;
  contributingModes: string[];
  reason: string;
}

/** 动态权重计算结果 */
export interface DynamicWeightResult {
  weights: Record<string, number>;
  activeModes: string[];
  adjustments: Record<string, AgentWeightAdjustment>;
  modeDetails: {
    panic: { triggered: boolean; reasons: string[] };
    policy: { triggered: boolean; reasons: string[] };
    value: { triggered: boolean; reasons: string[] };
  };
}

/** v9.5 在 v9.3 结果之上的扩展 */
export interface V9_5Extension {
  /** Agent 互动结果 (如果启用互动层) */
  interaction?: InteractionResult;
  /** 共识度量指标 */
  metrics: ConsensusMetrics;
  /** 互动前后对比 */
  comparison?: {
    beforeInteraction: {
      consensus: number;
      beliefStd: number;
    };
    afterInteraction: {
      consensus: number;
      beliefStd: number;
    };
    consensusShift: number;
    stdChange: number;
  };
  /** 🆕 v9.5.2: 动态权重调整结果 */
  dynamicWeights?: {
    enabled: boolean;
    activeModes: string[];
    modeDetails: {
      panic: { triggered: boolean; reasons: string[] };
      policy: { triggered: boolean; reasons: string[] };
      value: { triggered: boolean; reasons: string[] };
    };
    adjustments: Record<string, AgentWeightAdjustment>;
  };
}
