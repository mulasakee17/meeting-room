/**
 * 自适应治理阈值 — 根据任务特征自动校准
 *
 * 核心思想: 固定阈值 (回音室=0.7, 权威偏差=0.4...) 对所有任务一刀切。
 * 自适应阈值先在"校准讨论"中测量 Agent 群体的自然行为特征，
 * 再据此个性化设定阈值。
 *
 * 校准方法:
 * 1. 用简单的已知答案问题跑一轮讨论
 * 2. 测量: 收敛速度 μ_conv, 基础信息冗余 ρ_base, 影响力集中度 λ_base
 * 3. 根据测量值偏移固定阈值: θ_adapted = clamp(θ_base × scale_factor(calib))
 */

import type { AgentBelief, MessageInfo, GovernanceConfig } from "./types";
import {
  GOVERNANCE_ECHO_CHAMBER_THRESHOLD,
  GOVERNANCE_AUTHORITY_BIAS_THRESHOLD,
  GOVERNANCE_POLARIZATION_THRESHOLD,
  GOVERNANCE_PREMATURE_CONSENSUS_THRESHOLD,
} from "../constants";

// ============================================================================
// 校准指标
// ============================================================================

export interface CalibrationMetrics {
  /** 自然收敛速度: 信念标准差降到 0.1 以下需要的轮数 / 最大轮数 */
  convergenceSpeed: number;
  /** 基础信息冗余度: Agent 在简单任务下的内容相似度 */
  baseRedundancy: number;
  /** 基础影响力集中度: 发言最多的 Agent 的发言占比 */
  baseInfluenceConcentration: number;
  /** 基础信念分散度: Agent 在简单任务下的信念标准差 */
  baseBeliefDispersion: number;
  /** Agent 数量 */
  agentCount: number;
}

// ============================================================================
// 缩放函数
// ============================================================================

/**
 * 收敛速度 → 过早共识阈值调整
 *
 * 如果 Agent 自然收敛很快 (speed > 0.7), 说明这个群体本身容易达成一致,
 * 应该降低过早共识的触发门槛 (更容易触发), 因为"快"可能是假快。
 *
 * 反之如果 Agent 自然收敛慢, 说明这个群体本身分歧大, 应该提高门槛,
 * 避免频繁误报。
 */
function scalePrematureConsensus(calib: CalibrationMetrics): number {
  const speed = calib.convergenceSpeed;
  // speed ∈ [0,1]: 0=慢收敛(好), 1=快收敛(可能是假快)
  // 输出 ∈ [0.7, 1.3]: 乘到基础阈值上
  return 0.7 + speed * 0.6;
}

/**
 * 基础冗余度 → 回音室阈值调整
 *
 * 如果 Agent 在简单任务上也有高冗余度, 说明这个群体的语言风格本身相似,
 * 应该提高回音室阈值 (更宽容), 避免把"风格相似"误判为回音室。
 */
function scaleEchoChamber(calib: CalibrationMetrics): number {
  const redundancy = calib.baseRedundancy;
  // redundancy ∈ [0,1]
  // 输出 ∈ [0.85, 1.15]: 冗余度高 → 提高阈值 (更宽容)
  return 0.85 + redundancy * 0.3;
}

/**
 * 基础影响力集中度 → 权威偏差阈值调整
 *
 * 如果 Agent 群体天生就有一人讲话多 (如 leader 角色设计),
 * 应该提高权威偏差阈值 (更宽容), 避免把"角色设计"误判为权威偏差。
 */
function scaleAuthorityBias(calib: CalibrationMetrics): number {
  const conc = calib.baseInfluenceConcentration;
  // conc ∈ [0,1]
  // 输出 ∈ [0.8, 1.2]
  return 0.8 + conc * 0.4;
}

/**
 * 基础信念分散度 → 极化阈值调整
 *
 * 如果 Agent 在简单任务上也有较大信念分散,
 * 说明这个群体的信念表达本身范围大, 应该提高极化阈值 (更宽容)。
 */
function scalePolarization(calib: CalibrationMetrics): number {
  const disp = calib.baseBeliefDispersion;
  // disp ∈ [0,1] (归一化到 belief 范围 -1..1)
  // 输出 ∈ [0.8, 1.3]
  return 0.8 + Math.min(disp, 1.0) * 0.5;
}

// ============================================================================
// 主入口
// ============================================================================

/**
 * 从校准指标计算自适应治理配置。
 *
 * @param calib 校准阶段测量的基线指标
 * @returns 个性化阈值配置
 */
export function computeAdaptiveThresholds(
  calib: CalibrationMetrics
): Partial<GovernanceConfig> {
  return {
    echoChamberThreshold: clamp(
      GOVERNANCE_ECHO_CHAMBER_THRESHOLD * scaleEchoChamber(calib),
      0.40, 0.90
    ),
    authorityBiasThreshold: clamp(
      GOVERNANCE_AUTHORITY_BIAS_THRESHOLD * scaleAuthorityBias(calib),
      0.20, 0.70
    ),
    polarizationThreshold: clamp(
      GOVERNANCE_POLARIZATION_THRESHOLD * scalePolarization(calib),
      0.25, 0.75
    ),
    prematureConsensusThreshold: clamp(
      GOVERNANCE_PREMATURE_CONSENSUS_THRESHOLD * scalePrematureConsensus(calib),
      0.25, 0.75
    ),
  };
}

/**
 * 从原始讨论数据计算校准指标。
 *
 * 这通常在第一轮"校准讨论"后调用。
 * 校准讨论应该用一个简单、有明确答案的问题
 * (如 "1+1=?" 或 "太阳从哪边升起?") 来测量 Agent 的基线行为。
 */
export function computeCalibrationMetrics(params: {
  convergenceRounds: number;
  maxRounds: number;
  beliefs: number[];
  messages: MessageInfo[];
  agentCount: number;
}): CalibrationMetrics {
  const {
    convergenceRounds, maxRounds, beliefs, messages, agentCount,
  } = params;

  // 收敛速度: 归一化到 [0,1]
  const convergenceSpeed = agentCount > 1
    ? clamp(convergenceRounds / maxRounds, 0, 1)
    : 0.5;

  // 基础信息冗余度: 消息间的内容相似度
  const baseRedundancy = computeMessageSimilarity(messages);

  // 基础影响力集中度: 发言最多的 Agent 占比
  const msgCounts: Record<string, number> = {};
  for (const m of messages) {
    msgCounts[m.agentId] = (msgCounts[m.agentId] || 0) + 1;
  }
  const totalMsgs = Math.max(1, Object.values(msgCounts).reduce((a, b) => a + b, 0));
  const maxMsgs = Math.max(1, ...Object.values(msgCounts));
  const baseInfluenceConcentration = maxMsgs / totalMsgs;

  // 基础信念分散度: 归一化标准差
  const mean = beliefs.reduce((a, b) => a + b, 0) / beliefs.length;
  const std = Math.sqrt(
    beliefs.reduce((s, b) => s + (b - mean) ** 2, 0) / beliefs.length
  );
  const baseBeliefDispersion = std; // belief ∈ [-1,1], std ∈ [0,2]

  return {
    convergenceSpeed,
    baseRedundancy,
    baseInfluenceConcentration,
    baseBeliefDispersion,
    agentCount,
  };
}

// ============================================================================
// 辅助
// ============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeMessageSimilarity(messages: MessageInfo[]): number {
  if (messages.length < 2) return 0;
  const contents = messages.map(m =>
    m.content.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  );
  let total = 0; let pairs = 0;
  for (let i = 0; i < contents.length; i++) {
    for (let j = i + 1; j < contents.length; j++) {
      const common = contents[i].filter(w => contents[j].includes(w)).length;
      const union = new Set([...contents[i], ...contents[j]]).size;
      total += union > 0 ? common / union : 0;
      pairs++;
    }
  }
  return pairs > 0 ? total / pairs : 0;
}

export { clamp, computeMessageSimilarity };
