/**
 * 集中管理的可调参数与魔法数字
 *
 * 所有跨模块共享的阈值、系数和配置值都在此定义，按模块分组。
 * 修改参数后无需在多个文件中搜索替换。
 *
 * 命名约定：
 * - 阈值类:  `MODULE_THRESHOLD_<NAME>`
 * - 系数类:  `MODULE_COEFF_<NAME>`
 * - 限制类:  `MODULE_MAX/MIN_<NAME>`
 * - 权重类:  `MODULE_WEIGHT_<NAME>`
 */

// ============================================================================
// 通用 — General
// ============================================================================

/** 信念取值范围 */
export const BELIEF_MIN = -1;
export const BELIEF_MAX = 1;
/** 置信度取值范围 */
export const CONFIDENCE_MIN = 0;
export const CONFIDENCE_MAX = 100;

// ============================================================================
// 讨论引擎 — Discussion Engine
// ============================================================================

/** 默认最大讨论轮数 */
export const DISCUSSION_DEFAULT_MAX_ROUNDS = 3;
/** 收敛阈值：信念标准差低于此值时认为已收敛 */
export const DISCUSSION_DEFAULT_CONVERGENCE_THRESHOLD = 0.1;
/** 最终决策标签阈值 */
export const DISCUSSION_DECISION_POSITIVE_THRESHOLD = 0.3;
export const DISCUSSION_DECISION_NEGATIVE_THRESHOLD = -0.3;
/** 解析失败时截取回复的最大长度 */
export const DISCUSSION_PARSE_FALLBACK_LENGTH = 500;

// ============================================================================
// 信念更新 — Belief Update
// ============================================================================

/** 信念一致性阈值：差值小于此视为一致 */
export const BELIEF_AGREEMENT_THRESHOLD = 0.3;
/** 信念分歧阈值：差值大于此视为分歧 */
export const BELIEF_DISAGREEMENT_THRESHOLD = 0.5;
/** 高置信度阈值 */
export const BELIEF_HIGH_CONFIDENCE_THRESHOLD = 70;
/** 收敛智能体信念接近阈值 */
export const BELIEF_CONVERGING_THRESHOLD = 0.2;
/** 收敛智能体占比阈值 */
export const BELIEF_CONVERGING_RATIO_THRESHOLD = 0.5;

/** 高置信智能体信念拉动力度 */
export const BELIEF_HIGH_CONF_PULL_COEFF = 0.3;
/** 低置信智能体信念拉动力度 */
export const BELIEF_LOW_CONF_PULL_COEFF = 0.1;
/** 一致多于分歧时的信心增益 */
export const BELIEF_AGREEMENT_CONFIDENCE_BONUS = 5;
/** 一致多于分歧时的信念漂移 */
export const BELIEF_AGREEMENT_BELIEF_COEFF = 0.1;
/** 分歧多于一致时的信心损失 */
export const BELIEF_DISAGREEMENT_CONFIDENCE_PENALTY = 3;
/** 分歧多于一致时的信念漂移 */
export const BELIEF_DISAGREEMENT_BELIEF_COEFF = 0.05;
/** 大量收敛智能体时的额外信念漂移 */
export const BELIEF_CONVERGENCE_EXTRA_BELIEF_COEFF = 0.15;
/** 大量收敛智能体时的信心增益 */
export const BELIEF_CONVERGENCE_CONFIDENCE_BONUS = 3;

// ============================================================================
// 影响力计算 — Influence
// ============================================================================

/** 一致性权重系数 */
export const INFLUENCE_AGREEMENT_COEFF = 0.8;
/** 分歧权重系数 */
export const INFLUENCE_DISAGREEMENT_COEFF = 0.5;
/** 引用权重系数 */
export const INFLUENCE_REFERENCE_COEFF = 0.7;
/** 说服权重系数 */
export const INFLUENCE_PERSUASION_COEFF = 0.6;
/** 推理质量归一化的最大推理长度 */
export const INFLUENCE_REASONING_MAX_LENGTH = 500;
/** 现有边权重衰减因子（增量乘以此值加到旧权重） */
export const INFLUENCE_EDGE_DECAY_FACTOR = 0.3;

/** 影响力类型判定 — 信念分歧阈值 */
export const INFLUENCE_DISAGREEMENT_BELIEF_THRESHOLD = 0.5;
/** 影响力类型判定 — 信心差阈值 */
export const INFLUENCE_PERSUASION_CONFIDENCE_GAP = 20;

// 影响力 → 状态变更 冲击系数
export const INFLUENCE_IMPACT_AGREEMENT_BELIEF_COEFF = 0.4;
export const INFLUENCE_IMPACT_AGREEMENT_CONFIDENCE_COEFF = 3;
export const INFLUENCE_IMPACT_DISAGREEMENT_BELIEF_COEFF = 0.2;
export const INFLUENCE_IMPACT_DISAGREEMENT_CONFIDENCE_COEFF = 2;
export const INFLUENCE_IMPACT_REFERENCE_BELIEF_COEFF = 0.5;
export const INFLUENCE_IMPACT_REFERENCE_CONFIDENCE_COEFF = 4;
export const INFLUENCE_IMPACT_PERSUASION_BELIEF_COEFF = 0.6;
export const INFLUENCE_IMPACT_PERSUASION_CONFIDENCE_COEFF = 5;

// 说服权重计算中置信度差异归一化因子
export const INFLUENCE_CONFIDENCE_NORM_FACTOR = 100;

// 信念推断高置信放大系数
export const INFERENCE_HIGH_CONF_AMPLIFICATION = 1.1;
export const INFERENCE_HIGH_CONF_WEIGHT_THRESHOLD = 0.5;

// ============================================================================
// 治理引擎 — Governance Engine
// ============================================================================

/** 回音室检测阈值 */
export const GOVERNANCE_ECHO_CHAMBER_THRESHOLD = 0.5;
/** 权威偏差检测阈值 */
export const GOVERNANCE_AUTHORITY_BIAS_THRESHOLD = 0.25;
/** 极化检测阈值 */
export const GOVERNANCE_POLARIZATION_THRESHOLD = 0.30;
/** 过早共识检测阈值（轮次进度低于此 + 共识水平高 → 过早） */
export const GOVERNANCE_PREMATURE_CONSENSUS_THRESHOLD = 0.35;
/** 过早共识所需的共识水平阈值 */
export const GOVERNANCE_PREMATURE_CONSENSUS_LEVEL = 0.55;
/** 过早共识所需的标准差阈值 */
export const GOVERNANCE_PREMATURE_CONSENSUS_STD_THRESHOLD = 0.20;
/** 严重程度分级阈值 */
export const GOVERNANCE_SEVERITY_ECHO_CHAMBER: [number, number] = [0.5, 0.75];
export const GOVERNANCE_SEVERITY_AUTHORITY_BIAS: [number, number] = [0.25, 0.5];
export const GOVERNANCE_SEVERITY_POLARIZATION: [number, number] = [0.30, 0.55];
/** 冗余智能体对判定：信念差阈值 */
export const GOVERNANCE_REDUNDANT_BELIEF_DIFF = 0.1;
/** 冗余智能体对判定：信心差阈值 */
export const GOVERNANCE_REDUNDANT_CONFIDENCE_DIFF = 10;
/** 信念聚类阈值 */
export const GOVERNANCE_CLUSTER_BELIEF_OFFSET = 0.2;
/** 内容相似度：最小词长度 */
export const GOVERNANCE_SIMILARITY_MIN_WORD_LENGTH = 2;
/** 标准差归一化因子 */
export const GOVERNANCE_STD_NORM_FACTOR = 2;
/** 共识水平计算因子 */
export const GOVERNANCE_CONSENSUS_LEVEL_FACTOR = 2;
/** 回音室信息冗余分数权重 */
export const GOVERNANCE_ECHO_REDUNDANCY_STD_WEIGHT = 0.5;
export const GOVERNANCE_ECHO_REDUNDANCY_CONTENT_WEIGHT = 0.5;
/** 过早共识严重程度：轮次进度低于阈值一半 → high */
export const GOVERNANCE_PREMATURE_SEVERITY_PROGRESS_RATIO = 0.5;

// ============================================================================
// 评估引擎 — Evaluation Engine
// ============================================================================

/**
 * 默认评估维度权重
 *
 * 5 维（原 7 维移除 Explainability 和 Manipulation Resistance）：
 * - Explainability 移除原因：基于推理长度启发式，无学术依据
 * - Manipulation Resistance 移除原因：将一致性误判为抗操纵性，逻辑缺陷
 * - Robustness 重命名为 Dispersion：未执行真正的扰动测试
 */
export const EVALUATION_DEFAULT_WEIGHTS = {
  consensus: 0.20,
  reliability: 0.25,
  dispersion: 0.20,
  stability: 0.17,
  influenceAnalysis: 0.18,
} as const;

/** 评分等级阈值 */
export const EVALUATION_GRADE_EXCELLENT = 85;
export const EVALUATION_GRADE_GOOD = 70;
export const EVALUATION_GRADE_FAIR = 55;
export const EVALUATION_GRADE_POOR = 40;

// ============================================================================
// 运行时 — Runtime
// ============================================================================

/** 终止检查：默认一致性阈值 */
export const RUNTIME_TERMINATION_CONSENSUS_THRESHOLD = 0.9;
/** 终止检查：连续收敛轮数 */
export const RUNTIME_TERMINATION_CONSECUTIVE_ROUNDS = 2;
/** 终止检查：最小增量阈值 */
export const RUNTIME_TERMINATION_DELTA_THRESHOLD = 0.01;
/** 终止检查：最大干预次数 */
export const RUNTIME_TERMINATION_MAX_INTERVENTIONS = 5;
/** 终止检查：超时时间 (ms) */
export const RUNTIME_TERMINATION_TIMEOUT_MS = 300_000;

// ============================================================================
// LLM — LLM Provider
// ============================================================================

/** LLM 调用默认超时 (ms) */
export const LLM_DEFAULT_TIMEOUT_MS = 30_000;

// ============================================================================
// 决策追踪 — Decision Trace (influence factor classification)
// ============================================================================

/** 默认置信度 */
export const TRACE_DEFAULT_CONFIDENCE = 50;
/** 影响因子：正面贡献阈值 */
export const TRACE_INFLUENCE_POSITIVE_THRESHOLD = 0.2;
/** 影响因子：强正面贡献阈值 */
export const TRACE_INFLUENCE_STRONG_POSITIVE_THRESHOLD = 0.6;
/** 影响因子：负面贡献阈值 */
export const TRACE_INFLUENCE_NEGATIVE_THRESHOLD = 0.15;
/** 影响因子：强负面贡献阈值 */
export const TRACE_INFLUENCE_STRONG_NEGATIVE_THRESHOLD = 0.45;

/** @deprecated Use TRACE_INFLUENCE_POSITIVE_THRESHOLD */
export const TRACE_CAUSAL_POSITIVE_THRESHOLD = TRACE_INFLUENCE_POSITIVE_THRESHOLD;
/** @deprecated Use TRACE_INFLUENCE_STRONG_POSITIVE_THRESHOLD */
export const TRACE_CAUSAL_STRONG_POSITIVE_THRESHOLD = TRACE_INFLUENCE_STRONG_POSITIVE_THRESHOLD;
/** @deprecated Use TRACE_INFLUENCE_NEGATIVE_THRESHOLD */
export const TRACE_CAUSAL_NEGATIVE_THRESHOLD = TRACE_INFLUENCE_NEGATIVE_THRESHOLD;
/** @deprecated Use TRACE_INFLUENCE_STRONG_NEGATIVE_THRESHOLD */
export const TRACE_CAUSAL_STRONG_NEGATIVE_THRESHOLD = TRACE_INFLUENCE_STRONG_NEGATIVE_THRESHOLD;

// ============================================================================
// 干预 — Interventions
// ============================================================================

/** 权重削减干预：默认削减因子 */
export const INTERVENTION_REDUCE_WEIGHT_FACTOR = 0.5;
/** 引入多样性干预：默认扰动幅度 */
export const INTERVENTION_DIVERSITY_PERTURBATION = 0.3;
/** 强制反思干预：默认反思因子 */
export const INTERVENTION_REFLECTION_FACTOR = 0.2;
