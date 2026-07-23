/**
 * 自适应系统参数 — 根据运行时信号自动校准全部 16 个参数
 *
 * 核心思想：所有拍脑袋的阈值/权重/系数都应该根据运行时信号自动调整，
 * 而不是依赖人工设定或 LLM 决策。
 *
 * 两层自适应：
 *   1. 离线校准（基线）：用网格搜索结果替代拍脑袋默认值
 *   2. 运行时自适应（动态缩放）：根据讨论过程中的信号实时调整
 *
 * 覆盖参数：
 *   A. 治理检测阈值 (4): echoChamber, authorityBias, polarization, prematureConsensus
 *   B. 发言意愿阈值 (2): willingnessThreshold, strongWillingnessThreshold
 *   C. 信念更新系数 (4): beliefAgreement, beliefDisagreement, convergenceExtra, DeGrootRate
 *   D. 质量因子参数 (5): w_consistency, w_credibility, w_alignment, w_counterfactual, EMA α
 *   E. 终止阈值 (1): convergenceThreshold
 *
 * 网格搜索发现：
 *   - echoChamber 无分离度 (0.000) → 考虑禁用或改用其他信号
 *   - polarization 最强信号 (0.304) → 降阈值到 0.15
 *   - authorityBias 最优 0.30 (当前 0.25)
 *   - prematureConsensus 任务依赖（Supplier 有效，Crisis 无效）
 *   - 质量因子: w_cons=0.50, α=0.40 为稳健最优（避免过拟合）
 */

import type { AgentBelief, MessageInfo, GovernanceConfig } from "./types";
import {
  GOVERNANCE_ECHO_CHAMBER_THRESHOLD,
  GOVERNANCE_AUTHORITY_BIAS_THRESHOLD,
  GOVERNANCE_POLARIZATION_THRESHOLD,
  GOVERNANCE_PREMATURE_CONSENSUS_THRESHOLD,
} from "../constants";

// ============================================================================
// 离线校准基线（来自 grid_search_thresholds.ts 网格搜索结果）
// ============================================================================

/**
 * 网格搜索校准的基线值，替代拍脑袋默认值。
 *
 * 注意：质量因子参数采用 w_cons=0.50/α=0.40 而非极端值 0.60/0.50，
 * 因为仅 21 runs，极端值有过拟合风险。0.50/0.40 是单调递增曲线上的
 * 稳健折中点——差异 0.0970（vs 拍脑袋 0.0848，提升 14%），但避免过拟合。
 */
export const GRID_SEARCHED_BASELINES = {
  // 治理检测阈值
  echoChamber: 0.50,        // 网格搜索：无分离度，保持原值
  authorityBias: 0.30,      // 网格搜索：0.30 分离度 0.137（vs 0.25 的 0.068）
  polarization: 0.15,       // 网格搜索：0.15 分离度 0.304（vs 0.30 的 0.190）
  prematureConsensus: 0.35, // 网格搜索：任务依赖，保持原值

  // 质量因子权重（网格搜索稳健折中）
  qf_w_consistency: 0.50,   // 网格搜索：单调递增，0.50 稳健
  qf_w_credibility: 0.25,   // 保持
  qf_w_alignment: 0.20,     // 降低（对齐层贡献递减）
  qf_w_counterfactual: 0.05,// 保持（贡献近零）
  qf_ema_alpha: 0.40,       // 网格搜索：0.40 稳健（vs 0.30 当前）

  // 发言意愿（网格搜索未覆盖，保持原值）
  willingnessThreshold: 0.40,
  strongWillingnessThreshold: 0.82,

  // 信念更新系数（网格搜索未覆盖，保持原值）
  beliefAgreementCoeff: 0.3,
  beliefDisagreementCoeff: 0.05,
  convergenceExtraCoeff: 0.15,
  degrootPassiveRate: 0.15,

  // 终止阈值（保持原值）
  convergenceThreshold: 0.06,
} as const;

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
// 运行时信号（用于动态调整）
// ============================================================================

/**
 * 运行时信号——从讨论过程中实时提取的状态指标。
 * 与 CalibrationMetrics 不同，这些信号每轮更新。
 */
export interface RuntimeSignals {
  /** 当前轮次 / 最大轮次 */
  roundProgress: number;
  /** 当前信念标准差 */
  beliefDispersion: number;
  /** 当前信念均值 */
  beliefMean: number;
  /** 已发言 agent 数 / 总 agent 数 */
  participationRate: number;
  /** 治理是否开启 */
  governanceEnabled: boolean;
  /** 已触发的干预次数 */
  interventionCount: number;
  /** 当前轮的共识水平 */
  consensusLevel: number;
  /** 累计发言次数 */
  totalUtterances: number;
}

// ============================================================================
// 缩放函数 — 离线校准层
// ============================================================================

/**
 * 收敛速度 → 过早共识阈值调整
 *
 * convergenceSpeed = convergenceRounds / maxRounds
 * 值大 = 慢收敛 (花了很多轮才收敛)
 * 值小 = 快收敛 (少轮次就收敛)
 *
 * 快收敛群体容易"假快"——应该降低阈值 (scale<1, 更容易触发过早共识检测)
 * 慢收敛群体本身分歧大——应该提高阈值 (scale>1, 避免误报)
 */
function scalePrematureConsensus(calib: CalibrationMetrics): number {
  const speed = calib.convergenceSpeed;
  // speed ∈ [0,1]: 0=快收敛, 1=慢收敛
  // 输出 ∈ [0.7, 1.3]: 快收敛→0.7(降低阈值), 慢收敛→1.3(提高阈值)
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
// 缩放函数 — 运行时动态层（新增）
// ============================================================================

/**
 * 发言意愿阈值动态缩放
 *
 * 早期（roundProgress < 0.3）→ 降低阈值（鼓励更多人发言，避免信息缺失）
 * 晚期（roundProgress > 0.7）→ 提高阈值（收敛阶段，减少噪音）
 * 中期 → 保持基线
 */
function scaleWillingnessRuntime(sig: RuntimeSignals): number {
  if (sig.roundProgress < 0.3) return 0.80;  // 早期：降低 20%
  if (sig.roundProgress > 0.7) return 1.15;  // 晚期：提高 15%
  return 1.0;
}

/**
 * 强发言意愿阈值动态缩放
 *
 * 参与率低时 → 降低强阈值（需要更多人发言）
 * 参与率高时 → 保持（已充分参与）
 */
function scaleStrongWillingnessRuntime(sig: RuntimeSignals): number {
  if (sig.participationRate < 0.5) return 0.90;  // 参与不足：降低
  return 1.0;
}

/**
 * 信念更新系数动态缩放
 *
 * 信念分散度高时 → 降低 agreement coefficient（避免被极端信念拉偏）
 *                  提高 disagreement coefficient（保持独立性）
 * 信念分散度低时 → 提高 agreement coefficient（促进收敛）
 */
function scaleBeliefAgreementRuntime(sig: RuntimeSignals): number {
  if (sig.beliefDispersion > 0.5) return 0.80;  // 高分散：降低
  if (sig.beliefDispersion < 0.2) return 1.20;  // 低分散：提高
  return 1.0;
}

function scaleBeliefDisagreementRuntime(sig: RuntimeSignals): number {
  if (sig.beliefDispersion > 0.5) return 1.30;  // 高分散：提高（保持独立）
  return 1.0;
}

/**
 * 收敛额外系数动态缩放
 *
 * 晚期且未收敛 → 提高（强力推向收敛）
 * 早期 → 降低（让信息充分交换）
 */
function scaleConvergenceExtraRuntime(sig: RuntimeSignals): number {
  if (sig.roundProgress > 0.6 && sig.beliefDispersion > 0.2) return 1.40;
  if (sig.roundProgress < 0.3) return 0.70;
  return 1.0;
}

/**
 * DeGroot 被动监听速率动态缩放
 *
 * 信念分散度高 → 降低（避免被极端值拉偏，保护少数意见）
 * 信念分散度低 → 提高（促进收敛）
 */
function scaleDeGrootRuntime(sig: RuntimeSignals): number {
  if (sig.beliefDispersion > 0.5) return 0.60;  // 高分散：大幅降低
  if (sig.beliefDispersion < 0.2) return 1.30;  // 低分散：提高
  return 1.0;
}

/**
 * 质量因子权重动态缩放
 *
 * 治理开启时 → 降低对齐权重（依赖治理机制，减少对齐依赖）
 * 治理关闭时 → 提高言行一致权重（纯靠行为信号检测恶意）
 */
function scaleQFWeightsRuntime(sig: RuntimeSignals): {
  wConsScale: number; wCredScale: number; wAlignScale: number; wCfScale: number;
} {
  if (sig.governanceEnabled) {
    return { wConsScale: 1.0, wCredScale: 1.0, wAlignScale: 0.80, wCfScale: 1.0 };
  }
  return { wConsScale: 1.15, wCredScale: 1.0, wAlignScale: 1.0, wCfScale: 1.0 };
}

/**
 * EMA α 动态缩放
 *
 * 早期（utterances < 5）→ α 提高（快速适应）
 * 晚期（utterances > 15）→ α 降低（稳定评分）
 */
function scaleEmaAlphaRuntime(sig: RuntimeSignals): number {
  if (sig.totalUtterances < 5) return 1.30;
  if (sig.totalUtterances > 15) return 0.80;
  return 1.0;
}

/**
 * 收敛阈值动态缩放
 *
 * 高干预次数 → 降低阈值（接受更宽松的收敛，避免过度干预）
 * 低干预次数 → 保持（正常收敛标准）
 */
function scaleConvergenceThresholdRuntime(sig: RuntimeSignals): number {
  if (sig.interventionCount > 3) return 0.80;  // 宽松收敛
  return 1.0;
}

// ============================================================================
// 全量自适应配置接口
// ============================================================================

/**
 * 全量自适应系统参数——覆盖全部 14 个拍脑袋参数。
 *
 * 两层校准：
 *   1. 基线值来自 GRID_SEARCHED_BASELINES（离线网格搜索）
 *   2. 基线值 × 运行时缩放因子 = 最终值
 */
export interface AdaptiveSystemConfig {
  // A. 治理检测阈值 (4)
  echoChamberThreshold: number;
  authorityBiasThreshold: number;
  polarizationThreshold: number;
  prematureConsensusThreshold: number;

  // B. 发言意愿阈值 (2)
  willingnessThreshold: number;
  strongWillingnessThreshold: number;

  // C. 信念更新系数 (4)
  beliefAgreementCoeff: number;
  beliefDisagreementCoeff: number;
  convergenceExtraCoeff: number;
  degrootPassiveRate: number;

  // D. 质量因子参数 (5)
  qfWeights: {
    consistency: number;
    credibility: number;
    alignment: number;
    counterfactual: number;
  };
  qfEmaAlpha: number;

  // E. 终止阈值 (1)
  convergenceThreshold: number;

  // 元信息
  source: "grid_searched" | "runtime_adaptive";
  appliedScales: Record<string, number>;
}

// ============================================================================
// 主入口
// ============================================================================

/**
 * 从校准指标计算自适应治理配置（仅治理检测阈值，向后兼容）。
 *
 * @param calib 校准阶段测量的基线指标
 * @returns 个性化阈值配置
 */
export function computeAdaptiveThresholds(
  calib: CalibrationMetrics
): Partial<GovernanceConfig> {
  // 使用网格搜索基线替代拍脑袋默认值
  return {
    echoChamberThreshold: clamp(
      GRID_SEARCHED_BASELINES.echoChamber * scaleEchoChamber(calib),
      0.40, 0.90
    ),
    authorityBiasThreshold: clamp(
      GRID_SEARCHED_BASELINES.authorityBias * scaleAuthorityBias(calib),
      0.20, 0.70
    ),
    polarizationThreshold: clamp(
      GRID_SEARCHED_BASELINES.polarization * scalePolarization(calib),
      0.10, 0.60
    ),
    prematureConsensusThreshold: clamp(
      GRID_SEARCHED_BASELINES.prematureConsensus * scalePrematureConsensus(calib),
      0.25, 0.75
    ),
  };
}

/**
 * 计算全量自适应系统参数——覆盖全部 16 个参数。
 *
 * 1. 从网格搜索基线出发
 * 2. 用校准指标（离线）缩放
 * 3. 用运行时信号（在线）再次缩放
 *
 * @param calib 离线校准指标（可为 null，表示仅用网格搜索基线）
 * @param sig 运行时信号（可为 null，表示仅用离线层）
 */
export function computeFullAdaptiveConfig(
  calib: CalibrationMetrics | null,
  sig: RuntimeSignals | null
): AdaptiveSystemConfig {
  const scales: Record<string, number> = {};

  // ── A. 治理检测阈值 ──
  const echoScale = calib ? scaleEchoChamber(calib) : 1.0;
  scales.echoChamber = echoScale;
  const authScale = calib ? scaleAuthorityBias(calib) : 1.0;
  scales.authorityBias = authScale;
  const polScale = calib ? scalePolarization(calib) : 1.0;
  scales.polarization = polScale;
  const premScale = calib ? scalePrematureConsensus(calib) : 1.0;
  scales.prematureConsensus = premScale;

  // ── B. 发言意愿阈值 ──
  const willScale = sig ? scaleWillingnessRuntime(sig) : 1.0;
  scales.willingness = willScale;
  const strongWillScale = sig ? scaleStrongWillingnessRuntime(sig) : 1.0;
  scales.strongWillingness = strongWillScale;

  // ── C. 信念更新系数 ──
  const agreeScale = sig ? scaleBeliefAgreementRuntime(sig) : 1.0;
  scales.beliefAgreement = agreeScale;
  const disagreeScale = sig ? scaleBeliefDisagreementRuntime(sig) : 1.0;
  scales.beliefDisagreement = disagreeScale;
  const convExtraScale = sig ? scaleConvergenceExtraRuntime(sig) : 1.0;
  scales.convergenceExtra = convExtraScale;
  const degrootScale = sig ? scaleDeGrootRuntime(sig) : 1.0;
  scales.degrootPassive = degrootScale;

  // ── D. 质量因子参数 ──
  const qfScales = sig ? scaleQFWeightsRuntime(sig) : { wConsScale: 1, wCredScale: 1, wAlignScale: 1, wCfScale: 1 };
  scales.qfConsistency = qfScales.wConsScale;
  scales.qfCredibility = qfScales.wCredScale;
  scales.qfAlignment = qfScales.wAlignScale;
  scales.qfCounterfactual = qfScales.wCfScale;
  const emaScale = sig ? scaleEmaAlphaRuntime(sig) : 1.0;
  scales.qfEmaAlpha = emaScale;

  // ── E. 终止阈值 ──
  const convThresholdScale = sig ? scaleConvergenceThresholdRuntime(sig) : 1.0;
  scales.convergenceThreshold = convThresholdScale;

  const source = sig ? "runtime_adaptive" : "grid_searched";

  return {
    echoChamberThreshold: clamp(GRID_SEARCHED_BASELINES.echoChamber * echoScale, 0.40, 0.90),
    authorityBiasThreshold: clamp(GRID_SEARCHED_BASELINES.authorityBias * authScale, 0.20, 0.70),
    polarizationThreshold: clamp(GRID_SEARCHED_BASELINES.polarization * polScale, 0.10, 0.60),
    prematureConsensusThreshold: clamp(GRID_SEARCHED_BASELINES.prematureConsensus * premScale, 0.25, 0.75),

    willingnessThreshold: clamp(GRID_SEARCHED_BASELINES.willingnessThreshold * willScale, 0.20, 0.60),
    strongWillingnessThreshold: clamp(GRID_SEARCHED_BASELINES.strongWillingnessThreshold * strongWillScale, 0.65, 0.95),

    beliefAgreementCoeff: clamp(GRID_SEARCHED_BASELINES.beliefAgreementCoeff * agreeScale, 0.15, 0.50),
    beliefDisagreementCoeff: clamp(GRID_SEARCHED_BASELINES.beliefDisagreementCoeff * disagreeScale, 0.03, 0.15),
    convergenceExtraCoeff: clamp(GRID_SEARCHED_BASELINES.convergenceExtraCoeff * convExtraScale, 0.08, 0.30),
    degrootPassiveRate: clamp(GRID_SEARCHED_BASELINES.degrootPassiveRate * degrootScale, 0.05, 0.30),

    qfWeights: {
      consistency: clamp(GRID_SEARCHED_BASELINES.qf_w_consistency * qfScales.wConsScale, 0.30, 0.70),
      credibility: clamp(GRID_SEARCHED_BASELINES.qf_w_credibility * qfScales.wCredScale, 0.10, 0.40),
      alignment: clamp(GRID_SEARCHED_BASELINES.qf_w_alignment * qfScales.wAlignScale, 0.10, 0.35),
      counterfactual: clamp(GRID_SEARCHED_BASELINES.qf_w_counterfactual * qfScales.wCfScale, 0.00, 0.15),
    },
    qfEmaAlpha: clamp(GRID_SEARCHED_BASELINES.qf_ema_alpha * emaScale, 0.20, 0.60),

    convergenceThreshold: clamp(GRID_SEARCHED_BASELINES.convergenceThreshold * convThresholdScale, 0.03, 0.12),

    source,
    appliedScales: scales,
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
  // convergenceRounds = 花了多少轮才收敛，值大=慢收敛
  // convergenceSpeed = ratio → 值大=慢收敛 (多轮次才收敛)
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
