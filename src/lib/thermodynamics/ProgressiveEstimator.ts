/**
 * ProgressiveEstimator — I/C/Λ 渐进融合估计器
 *
 * 核心原则：同一个变量，不同数据量下自适应的估计策略。
 * - 短对话（0-2 行为事件）：LLM 自报 + 角色先验主导，置信度低
 * - 长对话（8+ 行为事件）：行为追踪主导，置信度高
 *
 * 不试图从 2-4 个 ΔU 中计算相关性、方差或回归——那些在统计上不成立。
 * 改为记录离散行为事件，随事件数增长渐进提高行为权重。
 */

import type {
  AgentCognitiveState,
  BehaviorEvents,
} from "../agent/cognitiveState";
import {
  GovernanceEstimatorRegistry,
  type GovernanceEstimatorContract,
} from "../epistemic/estimators";
import type { GovernanceEstimate } from "../epistemic/semantics";

// ============================================================================
// Types
// ============================================================================

export interface InertiaEstimate {
  /** I 估计值 [0, 1] */
  estimate: number;
  /** 估计置信度 [0, 1] */
  confidence: number;
  /** 来源权重 */
  sourceWeights: { stated: number; rolePrior: number; behavioral: number };
  /** 指向高惯性的行为事件比例 */
  behavioralRatio: number;
}

export interface ConfidenceEstimate {
  /** C 估计值 [0, 1] */
  estimate: number;
  /** 估计置信度 [0, 1] */
  confidence: number;
  /** 来源权重 */
  sourceWeights: { stated: number; stability: number };
}

export interface SusceptibilityEstimate {
  /** Λ 估计值 [0, 1] */
  estimate: number;
  /** 估计置信度 [0, 1] */
  confidence: number;
  /** 是否可用 */
  usable: boolean;
}

export interface ProgressiveEstimates {
  inertia: InertiaEstimate;
  confidence: ConfidenceEstimate;
  susceptibility: SusceptibilityEstimate;
}

export interface ProgressiveEstimatorInput {
  round: number;
  agentRole: string;
  statedOpenness?: number;
  behaviorEvents: BehaviorEvents;
  confidence: { stated?: number; overall?: number };
  utilityHistory: Array<{ round: number; scores: Record<string, number> }>;
}

type ConfidenceEstimatorInput = Pick<AgentCognitiveState, "utilityHistory"> & {
  confidence: { stated?: number; overall?: number };
};

export interface ProgressiveEstimatorConfig {
  roleInertiaPrior: ReadonlyArray<{
    keywords: readonly string[];
    inertia: number;
  }>;
  defaultRoleInertia: number;
  maxBehavioralWeight: number;
  behavioralWeightPerEvent: number;
  confidencePerEvent: number;
  maxInertiaConfidence: number;
  initialInertiaConfidence: number;
  minDeltaForStability: number;
  minExposureForUsable: number;
  maxSusceptibilityConfidence: number;
  susceptibilityInitialConfidence: number;
  susceptibilityConfidencePerEvent: number;
  confidenceStabilityDeltaScale: number;
  confidenceMinimumStatedWeight: number;
  confidenceStatedWeightDecayPerRound: number;
  confidenceAvailableBase: number;
  confidenceAvailablePerRound: number;
  estimateLowerBound: number;
  estimateUpperBound: number;
}

// ============================================================================
// Constants
// ============================================================================

/** 角色关键词 → 惯性先验（冷启动用） */
const ROLE_INERTIA_PRIOR: ReadonlyArray<{ keywords: readonly string[]; inertia: number }> = [
  { keywords: ["expert", "专家", "资深", "senior"], inertia: 0.6 },
  { keywords: ["analyst", "分析师", "分析"], inertia: 0.5 },
  { keywords: ["critic", "批评", "质疑", "审查"], inertia: 0.4 },
  { keywords: ["moderator", "主持人", "协调员", "facilitator"], inertia: 0.3 },
  { keywords: ["novice", "新手", "初级", "junior"], inertia: 0.3 },
];

/** 行为权重上限（行为事件再多也不超过此值，为 LLM 自报保留最低权重） */
const MAX_BEHAVIORAL_WEIGHT = 0.90;

/** 行为权重增长速率：每个行为事件贡献的权重增量 */
const BEHAVIORAL_WEIGHT_PER_EVENT = 0.06;

/** 置信度增长速率 */
const CONFIDENCE_PER_EVENT = 0.06;

/** 最大置信度（留 0.10 余量，承认永远无法完全确定） */
const MAX_CONFIDENCE = 0.90;

/** 初始置信度（只有先验，无行为数据） */
const INITIAL_CONFIDENCE = 0.10;

/** 稳定性需要的最小 ΔU 数量 */
const MIN_DELTA_FOR_STABILITY = 2;

/** Susceptibility 可用需要的最小暴露事件数 */
const MIN_EXPOSURE_FOR_USABLE = 2;

export const DEFAULT_PROGRESSIVE_ESTIMATOR_CONFIG: ProgressiveEstimatorConfig = {
  roleInertiaPrior: ROLE_INERTIA_PRIOR,
  defaultRoleInertia: 0.4,
  maxBehavioralWeight: MAX_BEHAVIORAL_WEIGHT,
  behavioralWeightPerEvent: BEHAVIORAL_WEIGHT_PER_EVENT,
  confidencePerEvent: CONFIDENCE_PER_EVENT,
  maxInertiaConfidence: MAX_CONFIDENCE,
  initialInertiaConfidence: INITIAL_CONFIDENCE,
  minDeltaForStability: MIN_DELTA_FOR_STABILITY,
  minExposureForUsable: MIN_EXPOSURE_FOR_USABLE,
  maxSusceptibilityConfidence: 0.75,
  susceptibilityInitialConfidence: 0.05,
  susceptibilityConfidencePerEvent: 0.10,
  confidenceStabilityDeltaScale: 0.5,
  confidenceMinimumStatedWeight: 0.3,
  confidenceStatedWeightDecayPerRound: 0.12,
  confidenceAvailableBase: 0.30,
  confidenceAvailablePerRound: 0.08,
  estimateLowerBound: 0.05,
  estimateUpperBound: 0.95,
};

export const PROGRESSIVE_ESTIMATOR_ID = "swarmalpha.progressive-icl";
export const PROGRESSIVE_ESTIMATOR_VERSION = "1.0.0";

// ============================================================================
// Core
// ============================================================================

/**
 * 对所有 agent 运行渐进估计。
 *
 * @param cognitiveStates 当前所有 agent 的认知状态
 * @param round 当前轮次
 * @returns 每个 agent 的渐进估计结果
 */
export function estimateAll(
  cognitiveStates: Map<string, AgentCognitiveState>,
  round: number,
): Map<string, ProgressiveEstimates> {
  return estimateAllWithProvenance(cognitiveStates, round).estimates;
}

export interface ProgressiveEstimationBatch {
  estimates: Map<string, ProgressiveEstimates>;
  records: Map<string, GovernanceEstimate<ProgressiveEstimates>>;
}

export function estimateAllWithProvenance(
  cognitiveStates: Map<string, AgentCognitiveState>,
  round: number,
  sourceEventIdsByAgent: Map<string, string[]> = new Map(),
  registry: GovernanceEstimatorRegistry = defaultProgressiveEstimatorRegistry,
): ProgressiveEstimationBatch {
  const results = new Map<string, ProgressiveEstimates>();
  const records = new Map<string, GovernanceEstimate<ProgressiveEstimates>>();

  for (const [agentId, cs] of cognitiveStates) {
    const input = buildProgressiveEstimatorInput(cs, round);
    const record = registry.project<ProgressiveEstimatorInput, ProgressiveEstimates, ProgressiveEstimatorConfig>(
      PROGRESSIVE_ESTIMATOR_ID,
      PROGRESSIVE_ESTIMATOR_VERSION,
      {
        name: `progressive_icl:${agentId}:round:${round}`,
        input,
        sourceEventIds: sourceEventIdsByAgent.get(agentId) ?? [],
      },
    );
    const estimates = record.value;
    results.set(agentId, estimates);
    records.set(agentId, record);

    // H2 修复（Phase 2.9）：写回估计结果到 cognitive state，
    // 确保检测器路径（如 δ_confidence_gap、buildGovernanceStateMap）使用最新估计值。
    // 之前 estimateAll 返回新 Map 但不更新 cs，导致 ProgressiveEstimator 结果无效。
    cs.inertia.estimate = estimates.inertia.estimate;
    cs.inertia.confidence = estimates.inertia.confidence;
    cs.inertia.sourceWeights = { ...estimates.inertia.sourceWeights };
    cs.inertia.strength = estimates.inertia.estimate; // backward compat

    cs.confidence.estimate = estimates.confidence.estimate;
    cs.confidence.confidence = estimates.confidence.confidence;
    cs.confidence.sourceWeights = { ...estimates.confidence.sourceWeights };
    cs.confidence.overall = estimates.confidence.estimate; // backward compat

    cs.susceptibility.estimate = estimates.susceptibility.estimate;
    cs.susceptibility.confidence = estimates.susceptibility.confidence;
    cs.susceptibility.usable = estimates.susceptibility.usable;
  }

  return { estimates: results, records };
}

/**
 * 估计惯性 I。
 *
 * 行为事件来源：
 *   · refuted + changed → 指向低惯性
 *   · refuted + unchanged → 指向高惯性
 *   · spontaneous flip → 指向低惯性
 *
 * 渐进融合：
 *   I = α × I_behavioral + (1-α) × I_prior
 *   其中 α = min(MAX_BEHAVIORAL_WEIGHT, event_count × BEHAVIORAL_WEIGHT_PER_EVENT)
 *   I_prior = α_stated × stated_openness + (1-α_stated) × role_prior
 */
export function estimateInertia(
  cs: Pick<AgentCognitiveState, "agentRole" | "behaviorEvents" | "statedOpenness">,
  _round: number,
  config: ProgressiveEstimatorConfig = DEFAULT_PROGRESSIVE_ESTIMATOR_CONFIG,
): InertiaEstimate {
  const events = cs.behaviorEvents;

  // ── 行为信号 ──
  const totalRefutationEvents = events.timesRefuted + events.spontaneousFlips;
  // refuted+unchanged 指向高惯性
  const unchangedCount = events.timesRefuted - events.timesChangedAfterRefutation;
  // spontaneous flips 指向低惯性
  const flipCount = events.spontaneousFlips;

  let behavioralRatio = 0.5; // 默认中性
  let eventCount = totalRefutationEvents;

  if (eventCount > 0) {
    // 未改变 + 自发翻转 → 混合信号
    // unchanged → 高惯性方向，flip → 低惯性方向
    const highInertiaSignals = unchangedCount;
    const lowInertiaSignals = events.timesChangedAfterRefutation + flipCount;
    const total = highInertiaSignals + lowInertiaSignals;
    behavioralRatio = total > 0 ? highInertiaSignals / total : 0.5;
  }

  // ── 先验 ──
  const rolePrior = getRolePrior(cs.agentRole, config);
  // stated_openness: "你改变立场的可能性"（0=不会改, 1=容易改）
  // 惯性 = 1 - openness
  const statedOpenness = cs.statedOpenness ?? 0.5;
  const statedInertia = 1 - statedOpenness;

  // I_prior: LLM 自报 vs 角色先验（各 50%，两者都弱）
  const priorEstimate = 0.5 * statedInertia + 0.5 * rolePrior;

  // ── 渐进融合 ──
  const alpha = Math.min(config.maxBehavioralWeight, eventCount * config.behavioralWeightPerEvent);
  const estimate = alpha * behavioralRatio + (1 - alpha) * priorEstimate;
  const confidence = Math.min(
    config.maxInertiaConfidence,
    config.initialInertiaConfidence + eventCount * config.confidencePerEvent,
  );

  return {
    estimate: clamp(estimate, config.estimateLowerBound, config.estimateUpperBound),
    confidence,
    sourceWeights: {
      stated: (1 - alpha) * 0.5,
      rolePrior: (1 - alpha) * 0.5,
      behavioral: alpha,
    },
    behavioralRatio,
  };
}

/**
 * 估计信心 C。
 *
 * Round 1-2：LLM 自报主导
 * Round 3+：自报 + 行为稳定性融合
 *
 * C = β × C_stated + (1-β) × C_stability
 * β = max(0.3, 1 - (round-2) × 0.12)
 */
export function estimateConfidence(
  cs: ConfidenceEstimatorInput,
  round: number,
  config: ProgressiveEstimatorConfig = DEFAULT_PROGRESSIVE_ESTIMATOR_CONFIG,
): ConfidenceEstimate {
  // 防御性兼容：旧版 Confidence 使用 overall，v6 使用 stated
  const stated = cs.confidence.stated ?? cs.confidence.overall ?? 0.5;

  // ── 行为稳定性 ──
  let stability = 0.5; // 默认中性
  let stabilityAvailable = false;

  const history = cs.utilityHistory;
  if (history.length >= config.minDeltaForStability + 1) {
    // 计算最近 2 个 ΔU 的平均幅度
    const deltas: number[] = [];
    for (let i = history.length - 1; i >= history.length - config.minDeltaForStability; i--) {
      if (i <= 0) break;
      const prev = history[i - 1].scores;
      const curr = history[i].scores;
      const allKeys = new Set([...Object.keys(prev), ...Object.keys(curr)]);
      let sumSq = 0;
      for (const key of allKeys) {
        const diff = (curr[key] ?? 0) - (prev[key] ?? 0);
        sumSq += diff * diff;
      }
      deltas.push(Math.sqrt(sumSq));
    }
    if (deltas.length > 0) {
      const meanDelta = deltas.reduce((s, v) => s + v, 0) / deltas.length;
      // 归一化：0.5 是预期的最大变化幅度
      const normalized = Math.min(1, meanDelta / config.confidenceStabilityDeltaScale);
      stability = 1 - normalized;
      stabilityAvailable = true;
    }
  }

  // ── 渐进融合 ──
  let beta: number;
  if (!stabilityAvailable) {
    beta = 1.0; // 100% 自报
  } else {
    // β 从 1.0（Round 2）递减到 0.3（Round 8+）
    // Math.min(1.0, ...) 防御 round<2 时 β>1（如 round=1 → 1.12），违反加权平均语义
    beta = Math.min(
      1.0,
      Math.max(
        config.confidenceMinimumStatedWeight,
        1.0 - (round - 2) * config.confidenceStatedWeightDecayPerRound,
      ),
    );
  }

  const estimate = beta * stated + (1 - beta) * stability;
  const confidence = stabilityAvailable
    ? Math.min(
      config.maxInertiaConfidence,
      config.confidenceAvailableBase + (round - 2) * config.confidenceAvailablePerRound,
    )
    : config.confidenceAvailableBase;

  return {
    estimate: clamp(estimate, 0, 1),
    confidence,
    sourceWeights: {
      stated: beta,
      stability: 1 - beta,
    },
  };
}

/**
 * 估计易感性 Λ。
 *
 * 仅从暴露事件追踪。暴露事件 < 2 → 不可用。
 * Λ.behavioral = 指向"高易感"的事件数 / 总暴露事件数
 * Λ 的置信度增长比 I 更慢（暴露事件更少），且上限更低（0.75）。
 */
export function estimateSusceptibility(
  cs: Pick<AgentCognitiveState, "behaviorEvents">,
  config: ProgressiveEstimatorConfig = DEFAULT_PROGRESSIVE_ESTIMATOR_CONFIG,
): SusceptibilityEstimate {
  const events = cs.behaviorEvents;
  const total = events.timesExposed;

  if (total < config.minExposureForUsable) {
    return {
      estimate: 0.5,
      confidence: Math.min(
        0.25,
        config.susceptibilityInitialConfidence + total * config.susceptibilityConfidencePerEvent,
      ),
      usable: false,
    };
  }

  const ratio = events.timesRespondedAfterExposure / total;
  const confidence = Math.min(
    config.maxSusceptibilityConfidence,
    config.susceptibilityInitialConfidence + total * config.susceptibilityConfidencePerEvent,
  );

  return {
    estimate: clamp(ratio, config.estimateLowerBound, config.estimateUpperBound),
    confidence,
    usable: true,
  };
}

// ============================================================================
// Behavior Event Detection（在 MeasurementLayer 中每轮调用）
// ============================================================================

/**
 * 从轮数据中检测行为事件并更新 agent 的 behaviorEvents。
 *
 * 每轮在 updateCognitiveStatesFromRound 之后调用。
 */
export function detectBehaviorEvents(
  cognitiveStates: Map<string, AgentCognitiveState>,
  round: number,
  refutationMap: Map<string, boolean>,          // agentId → 本轮是否被反驳
  interventionTargets: Map<string, boolean>,    // agentId → 本轮是否被干预
): void {
  for (const [agentId, cs] of cognitiveStates) {
    // 防御性初始化：旧版 cognitive state 可能缺少 behaviorEvents 字段
    if (!cs.behaviorEvents) {
      cs.behaviorEvents = createInitialBehaviorEvents();
    }
    const events = cs.behaviorEvents;
    const history = cs.utilityHistory;

    // ── 反驳检测 ──
    const wasRefuted = refutationMap.get(agentId) ?? false;
    if (wasRefuted) {
      events.timesRefuted++;

      // 检测立场是否改变（对比上一轮 topChoice）
      if (history.length >= 2) {
        const prev = history[history.length - 2];
        const curr = history[history.length - 1];
        const prevTop = getTopChoice(prev.scores);
        const currTop = getTopChoice(curr.scores);
        if (prevTop !== currTop) {
          events.timesChangedAfterRefutation++;
        }
      }
    }

    // ── 立场翻转检测（非反驳触发的）──
    if (history.length >= 2) {
      const prev = history[history.length - 2];
      const curr = history[history.length - 1];
      const prevTop = getTopChoice(prev.scores);
      const currTop = getTopChoice(curr.scores);
      if (prevTop !== currTop && !wasRefuted) {
        events.spontaneousFlips++;
      }
    }

    // ── 暴露/响应检测 ──
    const wasExposed = interventionTargets.get(agentId) ?? false;
    if (wasExposed) {
      events.timesExposed++;

      // 检测 U 是否向群体均值方向移动（简化：U 是否发生了显著变化）
      if (history.length >= 2) {
        const prev = history[history.length - 2];
        const curr = history[history.length - 1];
        const delta = utilityL2(prev.scores, curr.scores);
        if (delta > 0.05) {
          events.timesRespondedAfterExposure++;
        }
      }
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getRolePrior(role: string, config: ProgressiveEstimatorConfig): number {
  const lower = role.toLowerCase();
  for (const rule of config.roleInertiaPrior) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return rule.inertia;
    }
  }
  return config.defaultRoleInertia;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function getTopChoice(scores: Record<string, number>): string {
  let maxScore = -Infinity;
  let top = "";
  for (const [key, val] of Object.entries(scores)) {
    if (val > maxScore) { maxScore = val; top = key; }
  }
  return top;
}

function utilityL2(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sumSq = 0;
  for (const k of keys) {
    const diff = (a[k] ?? 0) - (b[k] ?? 0);
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq);
}

/**
 * 创建初始行为事件记录（新 agent 初始化用）。
 */
export function createInitialBehaviorEvents(): BehaviorEvents {
  return {
    timesRefuted: 0,
    timesChangedAfterRefutation: 0,
    spontaneousFlips: 0,
    timesExposed: 0,
    timesRespondedAfterExposure: 0,
  };
}

/**
 * 创建默认的 Susceptibility（新 agent 初始化用）。
 */
export function createInitialSusceptibility(
  config: ProgressiveEstimatorConfig = DEFAULT_PROGRESSIVE_ESTIMATOR_CONFIG,
): import("../agent/cognitiveState").Susceptibility {
  return {
    estimate: 0.5,
    confidence: config.susceptibilityInitialConfidence,
    usable: false,
  };
}

export function buildProgressiveEstimatorInput(
  state: AgentCognitiveState,
  round: number,
): ProgressiveEstimatorInput {
  return {
    round,
    agentRole: state.agentRole,
    ...(state.statedOpenness === undefined ? {} : { statedOpenness: state.statedOpenness }),
    behaviorEvents: { ...state.behaviorEvents },
    confidence: {
      ...(state.confidence.stated === undefined ? {} : { stated: state.confidence.stated }),
      ...(state.confidence.overall === undefined ? {} : { overall: state.confidence.overall }),
    },
    utilityHistory: state.utilityHistory.map(entry => ({
      round: entry.round,
      scores: { ...entry.scores },
    })),
  };
}

function requireFiniteRange(value: number, min: number, max: number, field: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field} must be finite and within [${min}, ${max}]`);
  }
}

function validateProgressiveInput(value: unknown): void {
  if (!value || typeof value !== "object") throw new Error("progressive estimator input must be an object");
  const input = value as ProgressiveEstimatorInput;
  if (!Number.isSafeInteger(input.round) || input.round < 0) throw new Error("input.round must be a non-negative safe integer");
  if (typeof input.agentRole !== "string") throw new Error("input.agentRole must be a string");
  if (input.statedOpenness !== undefined) requireFiniteRange(input.statedOpenness, 0, 1, "input.statedOpenness");
  const eventValues = Object.values(input.behaviorEvents ?? {});
  if (eventValues.length !== 5 || eventValues.some(count => !Number.isSafeInteger(count) || count < 0)) {
    throw new Error("input.behaviorEvents must contain five non-negative integer counters");
  }
  if (input.behaviorEvents.timesChangedAfterRefutation > input.behaviorEvents.timesRefuted) {
    throw new Error("timesChangedAfterRefutation must not exceed timesRefuted");
  }
  if (input.behaviorEvents.timesRespondedAfterExposure > input.behaviorEvents.timesExposed) {
    throw new Error("timesRespondedAfterExposure must not exceed timesExposed");
  }
  if (!input.confidence || typeof input.confidence !== "object") throw new Error("input.confidence must be an object");
  if (input.confidence.stated !== undefined) requireFiniteRange(input.confidence.stated, 0, 1, "input.confidence.stated");
  if (input.confidence.overall !== undefined) requireFiniteRange(input.confidence.overall, 0, 1, "input.confidence.overall");
  if (!Array.isArray(input.utilityHistory)) throw new Error("input.utilityHistory must be an array");
  for (const entry of input.utilityHistory) {
    if (!Number.isSafeInteger(entry.round) || entry.round < 0) throw new Error("utilityHistory.round must be a non-negative safe integer");
    for (const score of Object.values(entry.scores)) {
      if (!Number.isFinite(score)) throw new Error("utilityHistory scores must be finite");
    }
  }
}

function validateProgressiveConfig(value: unknown): void {
  if (!value || typeof value !== "object") throw new Error("progressive estimator config must be an object");
  const config = value as ProgressiveEstimatorConfig;
  if (!Array.isArray(config.roleInertiaPrior)) throw new Error("config.roleInertiaPrior must be an array");
  for (const rule of config.roleInertiaPrior) {
    if (!Array.isArray(rule.keywords) || rule.keywords.some((keyword: unknown) => typeof keyword !== "string" || keyword.length === 0)) {
      throw new Error("role inertia keywords must be non-empty strings");
    }
    requireFiniteRange(rule.inertia, 0, 1, "role inertia");
  }
  const unitFields: Array<keyof ProgressiveEstimatorConfig> = [
    "defaultRoleInertia", "maxBehavioralWeight", "behavioralWeightPerEvent",
    "confidencePerEvent", "maxInertiaConfidence", "initialInertiaConfidence",
    "maxSusceptibilityConfidence", "susceptibilityInitialConfidence",
    "susceptibilityConfidencePerEvent", "confidenceStabilityDeltaScale",
    "confidenceMinimumStatedWeight", "confidenceStatedWeightDecayPerRound",
    "confidenceAvailableBase", "confidenceAvailablePerRound",
    "estimateLowerBound", "estimateUpperBound",
  ];
  for (const field of unitFields) requireFiniteRange(config[field] as number, 0, 1, `config.${field}`);
  if (!Number.isSafeInteger(config.minDeltaForStability) || config.minDeltaForStability < 1) {
    throw new Error("config.minDeltaForStability must be a positive safe integer");
  }
  if (!Number.isSafeInteger(config.minExposureForUsable) || config.minExposureForUsable < 1) {
    throw new Error("config.minExposureForUsable must be a positive safe integer");
  }
  if (config.estimateLowerBound >= config.estimateUpperBound) throw new Error("estimate bounds must be ordered");
  if (config.confidenceStabilityDeltaScale === 0) throw new Error("config.confidenceStabilityDeltaScale must be positive");
}

function validateProgressiveOutput(value: unknown): void {
  if (!value || typeof value !== "object") throw new Error("progressive estimator output must be an object");
  const output = value as ProgressiveEstimates;
  for (const name of ["inertia", "confidence", "susceptibility"] as const) {
    const estimate = output[name];
    if (!estimate || typeof estimate !== "object") throw new Error(`output.${name} must be an object`);
    requireFiniteRange(estimate.estimate, 0, 1, `output.${name}.estimate`);
    requireFiniteRange(estimate.confidence, 0, 1, `output.${name}.confidence`);
  }
  const inertiaWeights = output.inertia.sourceWeights;
  const confidenceWeights = output.confidence.sourceWeights;
  if (!inertiaWeights || !confidenceWeights) throw new Error("progressive estimator sourceWeights are required");
  for (const [name, weight] of Object.entries(inertiaWeights)) {
    requireFiniteRange(weight, 0, 1, `output.inertia.sourceWeights.${name}`);
  }
  for (const [name, weight] of Object.entries(confidenceWeights)) {
    requireFiniteRange(weight, 0, 1, `output.confidence.sourceWeights.${name}`);
  }
  requireFiniteRange(output.inertia.behavioralRatio, 0, 1, "output.inertia.behavioralRatio");
  if (typeof output.susceptibility.usable !== "boolean") throw new Error("output.susceptibility.usable must be boolean");
}

export const progressiveEstimatorContract: GovernanceEstimatorContract<
  ProgressiveEstimatorInput,
  ProgressiveEstimates,
  ProgressiveEstimatorConfig
> = {
  id: PROGRESSIVE_ESTIMATOR_ID,
  version: PROGRESSIVE_ESTIMATOR_VERSION,
  determinism: { kind: "deterministic" },
  defaultConfig: DEFAULT_PROGRESSIVE_ESTIMATOR_CONFIG,
  validateInput: validateProgressiveInput,
  validateConfig: validateProgressiveConfig,
  estimate(input, config) {
    return {
      inertia: estimateInertia(input, input.round, config),
      confidence: estimateConfidence(input, input.round, config),
      susceptibility: estimateSusceptibility(input, config),
    };
  },
  validateOutput: validateProgressiveOutput,
};

export function createProgressiveEstimatorRegistry(): GovernanceEstimatorRegistry {
  return new GovernanceEstimatorRegistry([progressiveEstimatorContract]);
}

export const defaultProgressiveEstimatorRegistry = createProgressiveEstimatorRegistry().seal();

/**
 * 创建默认的 Confidence state（新 agent 初始化用）。
 */
export function createInitialConfidence(
  stated: number,
  config: ProgressiveEstimatorConfig = DEFAULT_PROGRESSIVE_ESTIMATOR_CONFIG,
): import("../agent/cognitiveState").Confidence {
  return {
    estimate: stated,
    confidence: config.confidenceAvailableBase,
    stated,
    stability: 0.5,
    sourceWeights: { stated: 1.0, stability: 0 },
    overall: stated,         // backward compat
    evidenceBased: stated,   // backward compat
    stabilityBased: 0.5,     // backward compat
  };
}

/**
 * 创建默认的 Inertia state（新 agent 初始化用）。
 */
export function createInitialInertia(
  role: string,
  statedOpenness?: number,
  config: ProgressiveEstimatorConfig = DEFAULT_PROGRESSIVE_ESTIMATOR_CONFIG,
): import("../agent/cognitiveState").Inertia {
  const rolePrior = getRolePrior(role, config);
  const openness = statedOpenness ?? 0.5;
  const stated = 1 - openness;
  const estimate = 0.5 * stated + 0.5 * rolePrior;

  return {
    estimate,
    confidence: 0.10,
    sourceWeights: { stated: 0.5, rolePrior: 0.5, behavioral: 0 },
    strength: estimate,       // backward compat
    source: {
      evidenceBased: 0,
      expressionBased: 0,
      roleBased: rolePrior,   // backward compat
    },
    recentRefutations: 0,     // backward compat
  };
}
