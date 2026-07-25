/**
 * SwarmAlpha v3.0 — Agent Cognitive State Space
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
 * Phase 2 (Core Validation): 最小可行实现。
 * - LLM prompt 不变，仍输出 belief/confidence/evidence/itemBeliefs
 * - 所有 cognitive state 由系统从 LLM 输出中 post-hoc 计算
 * - 不影响旧实验数据
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

/** Agent 的认知惯性 */
export interface Inertia {
  /** 惯性强度 [0, 1] */
  strength: number;
  /** 惯性来源 */
  source: {
    /** 基于证据的惯性：证据越多 → 惯性越高 */
    evidenceBased: number;
    /** 基于公开表达的惯性：公开发言后更难改变 */
    expressionBased: number;
    /** 基于角色的惯性 */
    roleBased: number;
  };
  /** 最近被反驳的次数（降低惯性） */
  recentRefutations: number;
}

/** 信心（派生变量，非独立状态） */
export interface Confidence {
  /** 总体信心 [0, 1] */
  overall: number;
  /** 证据驱动的信心 = f(evidence.quality, evidence.coverage) */
  evidenceBased: number;
  /** 稳定性驱动的信心 = f(utility 变化历史) — Phase 4 */
  stabilityBased: number;
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
  /** 本轮是否发言 */
  spokeThisRound: boolean;
  /** 历史 utility 快照（用于计算 stability-based confidence） */
  utilityHistory: Array<{ round: number; scores: Record<OptionId, number> }>;
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
  { keywords: ["analyst", "分析师", "分析"], inertia: 0.5 },
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

/** 全局信息池大小（Phase 2: 硬编码，Phase 4: 动态计算） */
const DEFAULT_GLOBAL_INFO_POOL_SIZE = 10;

/** 总角度/类别数（Phase 2: 硬编码，Phase 4: 动态计算） */
const DEFAULT_TOTAL_CATEGORIES = 5;

// ============================================================================
// Factory & Conversion
// ============================================================================

/** 从旧 belief/confidence 创建最小 cognitive state（向后兼容） */
export function beliefToCognitiveState(
  agentId: string,
  agentName: string,
  agentRole: string,
  belief: number,
  confidence: number,  // 0-100
  options: OptionId[] = ['A', 'B'],
): AgentCognitiveState {
  const scores: Record<OptionId, number> = {};
  // 分配 belief 到第一个选项，其余选项为 0
  if (options.length >= 2) {
    scores[options[0]] = belief;
    scores[options[1]] = -belief;
    for (let i = 2; i < options.length; i++) {
      scores[options[i]] = 0;
    }
  } else if (options.length === 1) {
    scores[options[0]] = belief;
  }

  const topChoice = belief > 0 ? options[0] : options[1] || options[0];
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
      strength: roleBase,
      source: { evidenceBased: 0, expressionBased: 0, roleBased: roleBase },
      recentRefutations: 0,
    },
    confidence: {
      overall: confidence / 100,
      evidenceBased: 0.5,
      stabilityBased: 0.5,
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

/** 从 LLM 输出的 evidence 字符串中提取证据条目 */
export function extractEvidenceItems(
  evidenceStrings: string[],
  itemBeliefs: Array<{ item: string; rank: number; belief: number; confidence: number }>,
  agentId: string,
  roundNumber: number,
): EvidenceItem[] {
  const items: EvidenceItem[] = [];

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
      shared: true,
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

  const coverage = Math.min(1, allItems.length / DEFAULT_GLOBAL_INFO_POOL_SIZE);

  const quality = allItems.length > 0
    ? allItems.reduce((s, i) => s + i.sourceReliability, 0) / allItems.length
    : 0.5;

  // 多样性：基于 supports 的不同选项数
  const uniqueSupports = new Set(allItems.map(i => i.supports));
  const diversity = Math.min(1, uniqueSupports.size / DEFAULT_TOTAL_CATEGORIES);

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
 * - 衰减：strength *= 0.95
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
    otherAgentUtilities, roundNumber,
  } = input;

  // Step 1: Evidence Update
  const newEvidenceItems = extractEvidenceItems(evidenceStrings, itemBeliefs, agentId, roundNumber);
  const evidence = updateEvidence(currentState.evidence, newEvidenceItems, roundNumber);

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
    spokeThisRound,
    utilityHistory: utilityHistory.slice(-10), // 只保留最近 10 轮
  };
}

// ============================================================================
// Susceptibility & Utility Distance (utilities)
// ============================================================================

/** 计算 susceptibility λ = max((1-ι)(1-c), MIN_SUSCEPTIBILITY) */
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