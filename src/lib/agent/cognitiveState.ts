/**
 * SwarmAlpha — Agent Cognitive State Space (v6，演进自 v3.0)
 *
 * Replaces the single scalar `belief` with a multi-dimensional cognitive state:
 *
 *   State Variables (独立状态，有更新规则):
 *     Utility  (u) : 偏好结构        [-1,1]^K
 *     Evidence (e) : 信息状态         4-dim
 *     Inertia  (ι) : 改变阻力        [0,1]
 *
 *   Derived Variables (从状态计算):
 *     Confidence (c) = f(e.quality, e.coverage)
 *     Expression (ê) = g(u, strategy) — Phase 4
 *
 * 演进说明：v3.0 为最小可行实现（系统 post-hoc 计算）；
 * v6 起 NativeCognitiveEngine 让 LLM 原生输出 Utility/Evidence/Confidence，
 * 系统只计算 Inertia/Susceptibility，并引入 BehaviorEvents 与 ProgressiveEstimator。
 * 标注 @deprecated 的字段为 v6 前旧路径，保留用于 E9_D_OLD 基线对照与冷启动。
 */

// ============================================================================
// Types
// ============================================================================

export type OptionId = string;

/** Agent 对每个选项的效用值。不要求 sum 为任何特定值。 */
export interface Utility {
  /** 每个选项的效用值 [-1, 1] */
  scores: Record<OptionId, number>;
  /** 效用最高的选项 */
  topChoice: OptionId;
  /** 首选与次选的效用差，衡量偏好清晰度 */
  preferenceClarity: number;
  /** 效用向量的 L2 范数，衡量偏好的总体强度 */
  intensity: number;
}

/** 证据条目 */
export interface EvidenceItem {
  id: string;
  content: string;
  /** 该证据支持的选项 */
  supports: OptionId;
  /** 支持强度 [-1, 1] */
  strength: number;
  /** 来源 */
  source: 'initial' | string; // agentId or 'governance'
  /** 来源可靠性 [0, 1] */
  sourceReliability: number;
  /** 获得轮次 */
  acquiredAt: number;
  /** 是否已分享 */
  shared: boolean;
}

/** Agent 的信息状态 */
export interface Evidence {
  /** 信息覆盖度：已知信息占全局信息池的比例 [0, 1] */
  coverage: number;
  /** 信息质量 [0, 1] = avg(sourceReliability) */
  quality: number;
  /** 信息多样性：覆盖的不同角度数 / 总角度数 [0, 1] */
  diversity: number;
  /** 最近一轮的信息增益 [0, 1] */
  recentGain: number;
  /** 具体证据条目 */
  items: EvidenceItem[];
}

/**
 * 行为事件记录——跨轮追踪的离散事件。
 *
 * 设计原则：在短讨论（3-5 轮）中，不试图估计连续的认知特质。
 * 改为记录离散行为事件，随事件累积渐进提高估计置信度。
 */
export interface BehaviorEvents {
  // ── 惯性相关事件 ──
  /** 被反驳的次数 */
  timesRefuted: number;
  /** 被反驳后改变了立场的次数 */
  timesChangedAfterRefutation: number;
  /** 自发立场翻转次数（topChoice 改变但非反驳触发） */
  spontaneousFlips: number;

  // ── 暴露/响应事件（替代旧 Λ）──
  /** 暴露于新证据的次数（被 inject_evidence 或他人分享独特证据） */
  timesExposed: number;
  /** 暴露后 U 向证据方向移动的次数 */
  timesRespondedAfterExposure: number;
}

/** Agent 的认知惯性（渐进估计） */
export interface Inertia {
  /** 惯性估计值 [0, 1]。高 = 不容易改变立场 */
  estimate: number;
  /** 估计置信度 [0, 1]。行为事件越多越接近 1 */
  confidence: number;
  /** 来源权重分解 */
  sourceWeights: {
    /** stated_openness 的权重（LLM 自报可说服性） */
    stated: number;
    /** 角色先验的权重（关键词匹配） */
    rolePrior: number;
    /** 行为事件的权重 */
    behavioral: number;
  };
  /** @deprecated 自 v6 起使用 estimate 替代。保留用于向后兼容 */
  strength: number;
  /** @deprecated 自 v6 起使用 sourceWeights 替代 */
  source: {
    evidenceBased: number;
    expressionBased: number;
    roleBased: number;
  };
  /** @deprecated 自 v6 起使用 BehaviorEvents.timesRefuted 替代 */
  recentRefutations: number;
}

/** 信心（自报 + 行为稳定性交叉验证） */
export interface Confidence {
  /** 总体估计值 [0, 1] */
  estimate: number;
  /** 估计置信度 [0, 1] */
  confidence: number;
  /** LLM 自报 confidence（0-100 → 0-1） */
  stated: number;
  /** 行为稳定性：1 - normalized(|ΔU|)。Round 3+ 可用 */
  stability: number;
  /** 来源权重 */
  sourceWeights: {
    stated: number;
    stability: number;
  };
  /** @deprecated 自 v6 起使用 estimate 替代 */
  overall: number;
  /** @deprecated 自 v6 起使用 stated 替代 */
  evidenceBased: number;
  /** @deprecated 自 v6 起使用 stability 替代 */
  stabilityBased: number;
}

/** 易感性（暴露事件追踪，替代旧 (1-I)(1-C) 公式） */
export interface Susceptibility {
  /** 估计值 [0, 1]。高 = 收到新证据后容易调整偏好 */
  estimate: number;
  /** 估计置信度 [0, 1] */
  confidence: number;
  /** 是否可用。暴露事件 < 2 → false */
  usable: boolean;
  /** @deprecated 自 v6 起：仅记录事件，不再计算公式值 */
}

/** 完整的 Agent 认知状态 */
export interface AgentCognitiveState {
  agentId: string;
  agentName: string;
  agentRole: string;
  utility: Utility;
  evidence: Evidence;
  inertia: Inertia;
  confidence: Confidence;
  susceptibility: Susceptibility;
  /** 行为事件记录 */
  behaviorEvents: BehaviorEvents;
  /** 本轮是否发言 */
  spokeThisRound: boolean;
  /** 历史 utility 快照（用于计算 stability-based confidence） */
  utilityHistory: Array<{ round: number; scores: Record<OptionId, number> }>;
  /** LLM 自报的 openness（"你改变立场的可能性有多大？"0-1）。用于 I 的先验 */
  statedOpenness?: number;
}

// ============================================================================
// Defaults & Constants
// ============================================================================

/**
 * 角色 → 基础惯性映射（关键词匹配）
 *
 * 使用关键词而非精确角色名匹配，支持中英文角色名。
 * 匹配顺序：按优先级从高到低，命中第一个即返回。
 */
const ROLE_INERTIA_RULES: Array<{ keywords: string[]; inertia: number }> = [
  { keywords: ["expert", "专家", "资深", "senior"], inertia: 0.6 },
  { keywords: ["director", "总监"], inertia: 0.55 },
  { keywords: ["analyst", "分析师", "分析"], inertia: 0.5 },
  { keywords: ["assessor", "evaluator", "评估师"], inertia: 0.5 },
  { keywords: ["engineer", "工程师"], inertia: 0.5 },
  { keywords: ["consultant", "advisor", "顾问"], inertia: 0.45 },
  { keywords: ["manager", "经理"], inertia: 0.45 },
  { keywords: ["critic", "批评", "质疑", "审查"], inertia: 0.4 },
  { keywords: ["diplomat", "外交", "协调"], inertia: 0.35 },
  { keywords: ["moderator", "主持人", "协调员", "facilitator"], inertia: 0.3 },
  { keywords: ["novice", "新手", "初级", "junior"], inertia: 0.3 },
];

function getRoleInertia(role: string): number {
  const lower = role.toLowerCase();
  for (const rule of ROLE_INERTIA_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return rule.inertia;
    }
  }
  return 0.4; // default
}

/** 惯性衰减系数（每轮衰减 2%，降低衰减速度以保留角色差异） */
const INERTIA_DECAY = 0.98;

/** 最小 λ（susceptibility），防止完全锁死 */
const MIN_SUSCEPTIBILITY = 0.05;

/** 公开表达对 inertia 的加成 */
const EXPRESSION_INERTIA_BONUS = 0.05;

/** 被反驳时 inertia 的惩罚 */
const REFUTATION_INERTIA_PENALTY = 0.1;

/** 证据源可靠性默认值 */
const DEFAULT_SOURCE_RELIABILITY = 0.5;

/** 全局信息池大小默认值（v3.2.1: 可通过 updateEvidence config 覆盖） */
const DEFAULT_GLOBAL_INFO_POOL_SIZE = 10;

/** 总类别数默认值（v3.2.1: 可通过 updateEvidence config 覆盖） */
const DEFAULT_TOTAL_CATEGORIES = 5;

/**
 * v3.2.1: evidence 计算的可选配置，用于移除硬编码。
 * - globalInfoPoolSize: 全局信息池大小（所有 agent 独有信息总和）。默认 10。
 *   V2 任务有 5 agent × 5 方案 = 25 条信息，应传入 25。
 * - totalCategories: 选项总数。默认 5。
 *   应从 task config 传入实际选项数。
 */
export interface EvidenceConfig {
  globalInfoPoolSize?: number;
  totalCategories?: number;
}

// ============================================================================
// Factory & Conversion
// ============================================================================

/**
 * 从 itemBeliefs 派生标量立场汇总（ROADMAP_V5: stance as derived summary）。
 *
 * 不从 LLM 直接输出标量，而是从 itemBeliefs 计算：
 *   statedStance = sign(top_option) × |top_score|
 *
 * 标量不是"测量值"，而是"汇总统计"——就像 GDP 不是任何一个人的行为，而是经济活动的汇总。
 * 这解决了标量信念的不可辨识问题：不声称测到了任何内部状态，只声称从 K 维自报偏好中
 * 计算了一个 1 维汇总。
 *
 * @param itemBeliefs LLM 输出的 itemBeliefs 数组
 * @returns 标量立场汇总 [-1, 1]，若 itemBeliefs 为空则返回 0
 */
export function stanceFromItemBeliefs(
  itemBeliefs: Array<{ item: string; rank: number; belief: number; confidence: number }>,
): number {
  if (!itemBeliefs || itemBeliefs.length === 0) return 0;
  const top = itemBeliefs.reduce((a, b) => a.rank < b.rank ? a : b);
  const topScore = Math.max(-1, Math.min(1, top.belief));
  return Math.sign(topScore) * Math.abs(topScore);
}

/**
 * 从旧 belief/confidence 创建最小 cognitive state（向后兼容）。
 *
 * @deprecated 自 ROADMAP_V5 起，新代码应使用 stanceFromItemBeliefs() 从 itemBeliefs 派生标量。
 *   此函数仅用于旧实验路径（169 runs）的向后兼容，不应用于新 NativeCognitiveEngine 路径。
 */
export function beliefToCognitiveState(
  agentId: string,
  agentName: string,
  agentRole: string,
  belief: number,
  confidence: number,  // 0-100
  options: OptionId[] = ['A', 'B'],
): AgentCognitiveState {
  const scores: Record<OptionId, number> = {};
  // v3.2.1: 改进多选项支持——废弃二选一假设（scores[1] = -belief）。
  //
  // 旧实现的问题：对 5 选项任务，把 belief 分配给 options[0]，-belief 给 options[1]，
  // 其余 0。但 belief 的语义是"整体倾向"，不明确是对哪个选项的倾向。
  // 强行做二选一假设会扭曲 utility 结构。
  //
  // 新实现：第一个选项得 belief，其余选项得 0。承认 scalar belief 信息不足，
  // 无法构建多选项 utility。应优先使用 itemBeliefs 输入。
  if (options.length >= 1) {
    scores[options[0]] = belief;
    for (let i = 1; i < options.length; i++) {
      scores[options[i]] = 0;
    }
  }

  // topChoice: belief > 0 倾向 options[0]，belief < 0 倾向 options[1]（若有）
  const topChoice = belief >= 0 ? options[0] : (options[1] || options[0]);
  const absBelief = Math.abs(belief);
  const sortedScores = Object.values(scores).sort((a, b) => b - a);
  const preferenceClarity = sortedScores.length >= 2
    ? sortedScores[0] - sortedScores[1]
    : absBelief;

  const roleBase = getRoleInertia(agentRole);

  return {
    agentId,
    agentName,
    agentRole,
    utility: {
      scores,
      topChoice,
      preferenceClarity,
      intensity: Math.sqrt(Object.values(scores).reduce((s, v) => s + v * v, 0)),
    },
    evidence: {
      coverage: 0.5,
      quality: 0.5,
      diversity: 0.5,
      recentGain: 0,
      items: [],
    },
    inertia: {
      estimate: roleBase,
      confidence: 0.10,
      sourceWeights: { stated: 0.5, rolePrior: 0.5, behavioral: 0 },
      strength: roleBase,
      source: { evidenceBased: 0, expressionBased: 0, roleBased: roleBase },
      recentRefutations: 0,
    },
    confidence: {
      estimate: confidence / 100,
      confidence: 0.10,
      stated: confidence / 100,
      stability: 0.5,
      sourceWeights: { stated: 1.0, stability: 0 },
      overall: confidence / 100,
      evidenceBased: 0.5,
      stabilityBased: 0.5,
    },
    susceptibility: {
      estimate: 0.5,
      confidence: 0.05,
      usable: false,
    },
    behaviorEvents: {
      timesRefuted: 0,
      timesChangedAfterRefutation: 0,
      spontaneousFlips: 0,
      timesExposed: 0,
      timesRespondedAfterExposure: 0,
    },
    spokeThisRound: false,
    utilityHistory: [],
  };
}

/** 从 itemBeliefs 提取选项列表 */
export function extractOptionsFromItemBeliefs(
  itemBeliefs: Array<{ item: string; rank: number; belief: number; confidence: number }>
): OptionId[] {
  return itemBeliefs.map(ib => ib.item);
}

/** 从 itemBeliefs 构建 Utility */
export function utilityFromItemBeliefs(
  itemBeliefs: Array<{ item: string; rank: number; belief: number; confidence: number }>
): Utility {
  const scores: Record<OptionId, number> = {};
  for (const ib of itemBeliefs) {
    scores[ib.item] = ib.belief;
  }

  const entries = Object.entries(scores);
  if (entries.length === 0) {
    return { scores: {}, topChoice: '', preferenceClarity: 0, intensity: 0 };
  }

  entries.sort((a, b) => b[1] - a[1]);
  const topChoice = entries[0][0];
  const preferenceClarity = entries.length >= 2
    ? entries[0][1] - entries[1][1]
    : Math.abs(entries[0][1]);

  const intensity = Math.sqrt(entries.reduce((s, [, v]) => s + v * v, 0));

  return { scores, topChoice, preferenceClarity, intensity };
}

// ============================================================================
// Evidence Extraction
// ============================================================================

/** 从 LLM 输出的 evidence 字符串中提取证据条目。
 *
 * v3.2.1: 支持双格式——优先使用 structuredEvidence（LLM 直接声明 supports/strength），
 * 无则回退到 evidenceStrings 启发式归类（includes 匹配 + top-ranked 回退）。
 *
 * 前沿经验：Structured Outputs 优于 free text + post-hoc parsing。
 * 新格式由 LLM 直接声明 supports/strength，消除归类噪声。
 */
export function extractEvidenceItems(
  evidenceStrings: string[],
  itemBeliefs: Array<{ item: string; rank: number; belief: number; confidence: number }>,
  agentId: string,
  roundNumber: number,
  /** v3.2.1: 结构化 evidence——LLM 直接声明 supports/strength，消除启发式归类噪声。
   *  如果提供，优先使用；否则回退到 evidenceStrings 启发式。 */
  structuredEvidence?: Array<{ content: string; supports: string; strength: number }>,
): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  // ── 优先路径：结构化 evidence（无归类噪声）──
  if (structuredEvidence && structuredEvidence.length > 0) {
    for (let i = 0; i < structuredEvidence.length; i++) {
      const se = structuredEvidence[i];
      if (!se.content || se.content.trim().length === 0) continue;
      items.push({
        id: `${agentId}_ev_${roundNumber}_${i}`,
        content: se.content,
        supports: se.supports || 'unknown',
        strength: Math.max(0, Math.min(1, se.strength)),
        source: agentId,
        sourceReliability: DEFAULT_SOURCE_RELIABILITY,
        acquiredAt: roundNumber,
        shared: false, // v6: 初始为 false，由 markEvidenceSharing() 标记
      });
    }
    return items;
  }

  // ── 回退路径：启发式归类（旧格式 string[]）──
  // 确定每个 evidence 支持哪个选项：找与 evidence 文本最匹配的选项
  const options = itemBeliefs.map(ib => ib.item);

  for (let i = 0; i < evidenceStrings.length; i++) {
    const content = evidenceStrings[i];
    if (!content || content.trim().length === 0) continue;

    // 简单启发式：在 evidence 文本中搜索选项名
    let supports = options[0] || 'unknown';
    let strength = 0.5;

    for (const opt of options) {
      if (content.toLowerCase().includes(opt.toLowerCase())) {
        supports = opt;
        // 从 itemBeliefs 中获取该选项的 belief 作为强度
        const ib = itemBeliefs.find(b => b.item === opt);
        if (ib) {
          strength = (ib.belief + 1) / 2; // 映射 [-1,1] → [0,1]
        }
        break;
      }
    }

    // 如果没找到关键词，使用 top-ranked 选项
    if (supports === options[0] && !content.toLowerCase().includes(options[0].toLowerCase())) {
      const topItem = itemBeliefs.reduce((a, b) => a.rank < b.rank ? a : b);
      supports = topItem.item;
      strength = (topItem.belief + 1) / 2;
    }

    items.push({
      id: `${agentId}_ev_${roundNumber}_${i}`,
      content,
      supports,
      strength: Math.max(0, Math.min(1, strength)),
      source: agentId,
      sourceReliability: DEFAULT_SOURCE_RELIABILITY,
      acquiredAt: roundNumber,
      shared: false, // v6: 初始为 false，由 markEvidenceSharing() 标记
    });
  }

  return items;
}

// ============================================================================
// State Update Functions
// ============================================================================

/**
 * 更新 Evidence
 *
 * Phase 2 简化实现：
 * - coverage = |items| / GLOBAL_INFO_POOL_SIZE
 * - quality = avg(sourceReliability)
 * - diversity = unique categories / TOTAL_CATEGORIES
 * - recentGain = new items this round / total items
 */
export function updateEvidence(
  currentEvidence: Evidence,
  newItems: EvidenceItem[],
  roundNumber: number,
  config?: EvidenceConfig,
): Evidence {
  const oldCount = currentEvidence.items.length;
  const allItems = [...currentEvidence.items];

  // 去重：基于 content 的简单去重
  const existingContents = new Set(allItems.map(i => i.content.toLowerCase().trim()));
  let newCount = 0;
  for (const item of newItems) {
    if (!existingContents.has(item.content.toLowerCase().trim())) {
      allItems.push(item);
      existingContents.add(item.content.toLowerCase().trim());
      newCount++;
    }
  }

  // v3.2.1: 支持从外部传入信息池大小和类别数，移除硬编码
  const poolSize = config?.globalInfoPoolSize ?? DEFAULT_GLOBAL_INFO_POOL_SIZE;
  const categories = config?.totalCategories ?? DEFAULT_TOTAL_CATEGORIES;

  const coverage = Math.min(1, allItems.length / poolSize);

  const quality = allItems.length > 0
    ? allItems.reduce((s, i) => s + i.sourceReliability, 0) / allItems.length
    : 0.5;

  // 多样性：基于 supports 的不同选项数
  const uniqueSupports = new Set(allItems.map(i => i.supports));
  const diversity = Math.min(1, uniqueSupports.size / categories);

  const recentGain = allItems.length > 0 ? newCount / allItems.length : 0;

  return {
    coverage,
    quality,
    diversity,
    recentGain,
    items: allItems,
  };
}

/**
 * 更新 Confidence（派生变量）
 *
 * evidenceBased = evidence.quality × evidence.coverage
 * stabilityBased = Phase 4 引入
 */
export function updateConfidence(
  evidence: Evidence,
  _utilityHistory: Array<{ round: number; scores: Record<OptionId, number> }>,
): Confidence {
  const evidenceBased = evidence.quality * evidence.coverage;
  // Phase 2: stabilityBased 暂不使用
  const stabilityBased = 0.5;
  const overall = 0.7 * evidenceBased + 0.3 * stabilityBased;

  return {
    estimate: Math.max(0, Math.min(1, overall)),
    confidence: 0.10,
    stated: Math.max(0, Math.min(1, overall)),
    stability: stabilityBased,
    sourceWeights: { stated: 1.0, stability: 0 },
    overall: Math.max(0, Math.min(1, overall)),
    evidenceBased: Math.max(0, Math.min(1, evidenceBased)),
    stabilityBased,
  };
}

/**
 * 更新 Inertia
 *
 * 规则：
 * - 如果本轮发言：expressionBased += 0.05
 * - evidenceBased = evidence.coverage × 0.3
 * - roleBased = 角色基础值（不变）
 * - 如果被反驳：strength -= 0.1
 * - 衰减：strength *= INERTIA_DECAY (0.98)
 */
export function updateInertia(
  currentInertia: Inertia,
  agentRole: string,
  spokeThisRound: boolean,
  evidence: Evidence,
  wasRefuted: boolean,
): Inertia {
  const roleBase = getRoleInertia(agentRole);

  let expressionBased = currentInertia.source.expressionBased;
  if (spokeThisRound) {
    expressionBased = Math.min(1, expressionBased + EXPRESSION_INERTIA_BONUS);
  }

  const evidenceBased = evidence.coverage * 0.3;

  let recentRefutations = currentInertia.recentRefutations;
  if (wasRefuted) {
    recentRefutations += 1;
  }

  // 综合计算
  let strength = 0.7 * roleBase + 0.2 * evidenceBased + 0.1 * expressionBased;

  // 反驳惩罚
  strength -= recentRefutations * REFUTATION_INERTIA_PENALTY;

  // 自然衰减
  strength *= INERTIA_DECAY;

  strength = Math.max(0.05, Math.min(0.95, strength));

  return {
    ...currentInertia,
    strength,
    source: {
      evidenceBased: Math.max(0, Math.min(1, evidenceBased)),
      expressionBased: Math.max(0, Math.min(1, expressionBased)),
      roleBased: roleBase,
    },
    recentRefutations,
  };
}

/**
 * 更新 Utility（DeGroot 加权平均）
 *
 * u_i(t+1) = (1 - λ_i) × u_i(t) + λ_i × Σ_j w_ij × u_j(t)
 *
 * 其中 λ_i = max((1 - ι_i) × (1 - c_i), MIN_SUSCEPTIBILITY)
 *
 * Phase 2 简化假设（默认）：
 * - 所有 influence weight 相等（w_ij = 1/N for all j）
 * - 使用其他 agent 的 itemBeliefs 作为 expressed utility
 *
 * Phase 4B 加权 DeGroot：
 * - 支持可选的 weight 参数（默认 1）
 * - 认知治理干预可降低特定 agent 的 weight（如 reduce_weight 设 weight=0.3）
 */
export function updateUtility(
  currentUtility: Utility,
  spokeThisRound: boolean,
  otherAgentUtilities: Array<{ agentId: string; utility: Utility; weight?: number }>,
  inertia: Inertia,
  confidence: Confidence,
  options: OptionId[],
): Utility {
  const susceptibility = Math.max(
    (1 - inertia.strength) * (1 - confidence.overall),
    MIN_SUSCEPTIBILITY,
  );

  // 如果没发言，不接受本轮影响（没听到别人说了什么）
  if (!spokeThisRound && otherAgentUtilities.length === 0) {
    return currentUtility;
  }

  const newScores: Record<OptionId, number> = {};

  for (const opt of options) {
    const currentScore = currentUtility.scores[opt] ?? 0;

    if (otherAgentUtilities.length === 0) {
      newScores[opt] = currentScore;
      continue;
    }

    // Phase 4B: 加权 DeGroot 更新
    // 使用 influence weight 加权平均（默认权重为 1）
    const totalWeight = otherAgentUtilities.reduce((sum, a) => sum + (a.weight ?? 1), 0);
    const otherWeightedAvg = totalWeight > 0
      ? otherAgentUtilities.reduce(
          (sum, a) => sum + (a.utility.scores[opt] ?? 0) * (a.weight ?? 1), 0,
        ) / totalWeight
      : otherAgentUtilities.reduce(
          (sum, a) => sum + (a.utility.scores[opt] ?? 0), 0,
        ) / otherAgentUtilities.length;

    newScores[opt] = Math.max(-1, Math.min(1,
      (1 - susceptibility) * currentScore + susceptibility * otherWeightedAvg,
    ));
  }

  // 重新计算 derived 字段
  const entries = Object.entries(newScores);
  entries.sort((a, b) => b[1] - a[1]);
  const topChoice = entries.length > 0 ? entries[0][0] : '';
  const preferenceClarity = entries.length >= 2
    ? entries[0][1] - entries[1][1]
    : entries.length === 1 ? Math.abs(entries[0][1]) : 0;
  const intensity = Math.sqrt(entries.reduce((s, [, v]) => s + v * v, 0));

  return { scores: newScores, topChoice, preferenceClarity, intensity };
}

// ============================================================================
// Complete Cognitive State Update (one round)
// ============================================================================

export interface CognitiveStateUpdateInput {
  agentId: string;
  agentName: string;
  agentRole: string;
  currentState: AgentCognitiveState;
  /** 本轮 LLM 输出的 evidence 字符串 */
  evidenceStrings: string[];
  /** 本轮 LLM 输出的 itemBeliefs */
  itemBeliefs: Array<{ item: string; rank: number; belief: number; confidence: number }>;
  /** 本轮是否发言 */
  spokeThisRound: boolean;
  /** 本轮是否被其他 agent 反驳 */
  wasRefuted: boolean;
  /** 其他 agent 的 utility（从 itemBeliefs 提取） */
  otherAgentUtilities: Array<{ agentId: string; utility: Utility }>;
  /** 轮次 */
  roundNumber: number;
  /** v3.2.1: evidence 计算配置（移除硬编码）。未提供则用默认值。 */
  evidenceConfig?: EvidenceConfig;
}

/**
 * 执行一轮完整的 cognitive state 更新
 *
 * 顺序：Evidence → Confidence → Inertia → Utility
 */
export function updateCognitiveState(input: CognitiveStateUpdateInput): AgentCognitiveState {
  const {
    agentId, agentName, agentRole, currentState,
    evidenceStrings, itemBeliefs, spokeThisRound, wasRefuted,
    otherAgentUtilities, roundNumber, evidenceConfig,
  } = input;

  // Step 1: Evidence Update
  const newEvidenceItems = extractEvidenceItems(evidenceStrings, itemBeliefs, agentId, roundNumber);
  const evidence = updateEvidence(currentState.evidence, newEvidenceItems, roundNumber, evidenceConfig);

  // Step 2: Confidence Update (派生)
  const utilityHistory = [
    ...currentState.utilityHistory,
    { round: roundNumber, scores: { ...currentState.utility.scores } },
  ];
  const confidence = updateConfidence(evidence, utilityHistory);

  // Step 3: Inertia Update
  const inertia = updateInertia(currentState.inertia, agentRole, spokeThisRound, evidence, wasRefuted);

  // Step 4: Utility Update
  const options = itemBeliefs.length > 0
    ? extractOptionsFromItemBeliefs(itemBeliefs)
    : Object.keys(currentState.utility.scores);
  const newUtilityFromItems = itemBeliefs.length > 0
    ? utilityFromItemBeliefs(itemBeliefs)
    : currentState.utility;

  const utility = updateUtility(newUtilityFromItems, spokeThisRound, otherAgentUtilities, inertia, confidence, options);

  return {
    agentId,
    agentName,
    agentRole,
    utility,
    evidence,
    inertia,
    confidence,
    susceptibility: currentState.susceptibility,
    behaviorEvents: currentState.behaviorEvents,
    spokeThisRound,
    utilityHistory: utilityHistory.slice(-10), // 只保留最近 10 轮
  };
}

// ============================================================================
// Susceptibility & Utility Distance (utilities)
// ============================================================================

/**
 * @deprecated 自 v6 起，Λ 不再从公式计算。使用 BehaviorEvents.timesExposed/timesRespondedAfterExposure
 *   通过 ProgressiveEstimator 估计。此函数保留用于向后兼容测试。
 */
export function computeSusceptibility(inertia: Inertia, confidence: Confidence): number {
  return Math.max(
    (1 - inertia.strength) * (1 - confidence.overall),
    MIN_SUSCEPTIBILITY,
  );
}

/** 计算两个 utility 之间的 L2 距离 */
export function utilityDistance(a: Utility, b: Utility): number {
  const allKeys = new Set([...Object.keys(a.scores), ...Object.keys(b.scores)]);
  let sumSq = 0;
  for (const key of allKeys) {
    const diff = (a.scores[key] ?? 0) - (b.scores[key] ?? 0);
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq);
}

/** 计算 utility 的群体标准差（用于收敛检测） */
export function utilityStd(utilities: Utility[], option: OptionId): number {
  const values = utilities.map(u => u.scores[option] ?? 0).filter(v => !isNaN(v));
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length);
}

// ============================================================================
// Conversion to old format (backward compatibility)
// ============================================================================

/** 从 cognitive state 计算旧的 belief 值（用于向后兼容） */
export function cognitiveStateToBelief(state: AgentCognitiveState): number {
  const { scores, topChoice } = state.utility;
  return scores[topChoice] ?? 0;
}

/** 从 cognitive state 计算旧的 confidence 值（0-100，用于向后兼容） */
export function cognitiveStateToConfidence(state: AgentCognitiveState): number {
  return Math.round(state.confidence.overall * 100);
}

/** 从 cognitive state 生成旧的 AgentState 格式 */
export function cognitiveStateToAgentState(state: AgentCognitiveState): {
  belief: number;
  confidence: number;
} {
  return {
    belief: cognitiveStateToBelief(state),
    confidence: cognitiveStateToConfidence(state),
  };
}