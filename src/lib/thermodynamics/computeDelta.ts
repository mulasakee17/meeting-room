/**
 * computeDelta — v6 诊断层（8 个 δ 信号，自适应阈值）
 *
 * 所有 δ 指标共同特征：
 * - 都不需要 ground truth
 * - 都基于可观测信号
 * - 都是可证伪的——如果 δ 与决策质量不相关，检测器无效
 * - 检测的是"矛盾"（两个可观测信号的对比）而非"错误"
 *
 * v6 变更：
 * - 新增 δ_1d_mask（替代旧 δ_exposure，不依赖 X）
 * - 新增 δ_evidence_silence（替代旧 δ_imbalance，不依赖 Gini(X)）
 * - 新增 δ_confidence_gap（C.stated vs U 位置矛盾）
 * - 新增 δ_stance_flip（topChoice 翻转检测）
 * - 新增 δ_no_response（干预不响应检测）
 * - 自适应阈值：effective_threshold = base + (1-minConfidence) × safetyMargin
 * - 所有使用跨轮估计的 δ 在置信度不足时自动变保守
 */

import type { AgentCognitiveState } from "../agent/cognitiveState";
import type { ThermoState } from "./MeasurementLayer";
import type { ProgressiveEstimates } from "./ProgressiveEstimator";

// ============================================================================
// Types
// ============================================================================

export interface DeltaConfig {
  polarizationThreshold?: number;
  oneDMaskThreshold?: number;
  evidenceSilenceThreshold?: number;
  confidenceGapThreshold?: number;
  stanceFlipThreshold?: number;
  noResponseThreshold?: number;
  concentrationThreshold?: number;
  consistencyThreshold?: number;
}

/** 单个 δ 的触发结果 */
export interface DeltaSignal {
  value: number;
  triggered: boolean;
  explanation: string;
  /** 此 δ 使用的最小置信度 */
  minConfidence: number;
  /** 有效阈值（自适应后） */
  effectiveThreshold: number;
}

export interface DeltaDiagnosis {
  /** δ_polarization: U 向量是否分化严重 */
  polarization: DeltaSignal;
  /** δ_1d_mask: 标量共识是否掩盖向量分歧 */
  oneDMask: DeltaSignal;
  /** δ_evidence_silence: 是否有 agent 的证据被系统性忽视 */
  evidenceSilence: DeltaSignal & { silencedAgents: string[] };
  /** δ_confidence_gap: 是否有 agent 自报信心与其 U 位置矛盾 */
  confidenceGap: DeltaSignal & { overconfidentAgents: string[] };
  /** δ_stance_flip: 是否有 agent 突然改变了 top choice */
  stanceFlip: DeltaSignal & { flippedAgents: string[] };
  /** δ_no_response: 被干预后 agent 的 U 是否依然不动 */
  noResponse: DeltaSignal & { unresponsiveAgents: string[] };
  /** δ_concentration: 惯性是否集中在少数 agent 上 */
  concentration: DeltaSignal;
  /** δ_consistency: 立场变化幅度是否与惯性预测矛盾 */
  consistency: DeltaSignal;
  /** 综合诊断摘要 */
  summary: string;
}

// ============================================================================
// Defaults & Safety Margins
// ============================================================================

const DEFAULTS = {
  polarizationThreshold: 0.15, // δ 诊断层（比 cognitiveDetectors 的 0.25 更敏感，因用于分析而非实时干预）
  oneDMaskThreshold: 0.35, // 降低以捕捉均衡偏误（标量共识掩盖的向量分歧较弱但值得干预）
  evidenceSilenceThreshold: 0.50,
  confidenceGapThreshold: 0.60,
  stanceFlipThreshold: 0,       // 二进制：发生了就触发
  noResponseThreshold: 0,       // 二进制
  concentrationThreshold: 2.0,
  // 2026-08-03 修复：矛盾度 = ΔU × I（高惯性大幅翻转才标记），阈值 2.0 对应 ΔU×I
  consistencyThreshold: 2.0,
} as const;

/** 安全边际：置信度越低，阈值越严格。避免在弱信号上触发误报 */
const SAFETY_MARGINS = {
  polarization: 0.05,           // 轮内 U 向量可靠，安全边际小
  oneDMask: 0.05,
  evidenceSilence: 0.05,
  confidenceGap: 0.20,          // C.stated 不可靠，需要更大安全边际
  stanceFlip: 0.10,             // 跨 2 轮的数据
  noResponse: 0.40,             // 仅在突破事件数时可用，很大安全边际
  concentration: 0.40,          // I 在短对话中不可靠
  consistency: 0.35,            // 同上
} as const;

// ============================================================================
// Empty diagnosis used only by explicit legacy macro-screening compatibility mode.
// ============================================================================

/** 空 δ 诊断结果——所有信号未触发，用于 Tier 1 筛查通过时的早返回 */
export const EMPTY_DELTA_DIAGNOSIS: DeltaDiagnosis = {
  polarization: { triggered: false, value: 0, minConfidence: 0, effectiveThreshold: 0, explanation: "Tier 1 筛查通过，未计算" },
  oneDMask: { triggered: false, value: 0, minConfidence: 0, effectiveThreshold: 0, explanation: "Tier 1 筛查通过，未计算" },
  evidenceSilence: { triggered: false, value: 0, minConfidence: 0, effectiveThreshold: 0, explanation: "Tier 1 筛查通过，未计算", silencedAgents: [] },
  confidenceGap: { triggered: false, value: 0, minConfidence: 0, effectiveThreshold: 0, explanation: "Tier 1 筛查通过，未计算", overconfidentAgents: [] },
  stanceFlip: { triggered: false, value: 0, minConfidence: 0, effectiveThreshold: 0, explanation: "Tier 1 筛查通过，未计算", flippedAgents: [] },
  noResponse: { triggered: false, value: 0, minConfidence: 0, effectiveThreshold: 0, explanation: "Tier 1 筛查通过，未计算", unresponsiveAgents: [] },
  concentration: { triggered: false, value: 0, minConfidence: 0, effectiveThreshold: 0, explanation: "Tier 1 筛查通过，未计算" },
  consistency: { triggered: false, value: 0, minConfidence: 0, effectiveThreshold: 0, explanation: "Tier 1 筛查通过，未计算" },
  summary: "显式 legacy macro screening 未触发，已跳过 δ 诊断",
};

// ============================================================================
// Adaptive Threshold
// ============================================================================

/**
 * 自适应阈值：effective = base + (1 - minConfidence) × safetyMargin
 *
 * 高置信度 → 阈值接近 base → 灵敏
 * 低置信度 → 阈值向 base+safetyMargin 移动 → 保守
 *
 * 对于二进制 δ（stance_flip, no_response），base=0 时不适用自适应——
 * 改为通过可用性门控（minConfidence 不足时直接不触发）。
 */
function adaptiveThreshold(
  base: number,
  minConfidence: number,
  safetyMargin: number,
): number {
  // 二进制阈值（base=0）：不通过阈值调灵敏度，通过门控
  if (base === 0) return 0;
  return base + (1 - minConfidence) * safetyMargin;
}


// ============================================================================
// δ 1: Polarization — 轮内 U 向量分化（可靠，Round 1+ 可用）
// ============================================================================

/**
 * δ_polarization = mean pairwise cosine distance of U vectors.
 *
 * 使用 pairwise 而非 k-means，避免小样本（n=5）不稳定性。
 * 所有输入（U 向量）来自当前轮，置信度 = 1.0。
 */
export function computeDeltaPolarization(
  states: AgentCognitiveState[],
  config?: DeltaConfig,
): DeltaDiagnosis["polarization"] {
  const base = config?.polarizationThreshold ?? DEFAULTS.polarizationThreshold;
  const minC = 1.0; // U 向量是轮内的，完全可靠
  const effectiveThreshold = adaptiveThreshold(base, minC, SAFETY_MARGINS.polarization);

  if (states.length < 2) {
    return { value: 0, triggered: false, explanation: "agent 不足",
      minConfidence: minC, effectiveThreshold };
  }

  let totalDist = 0; let pairCount = 0;
  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      totalDist += cosineDist(states[i].utility.scores, states[j].utility.scores);
      pairCount++;
    }
  }
  const value = pairCount > 0 ? totalDist / pairCount : 0;
  const triggered = value >= effectiveThreshold;
  const explanation = triggered
    ? `效用极化：平均 pairwise cosine 距离 = ${value.toFixed(3)} ≥ ${effectiveThreshold.toFixed(3)}`
    : `效用分布正常：平均 pairwise cosine 距离 = ${value.toFixed(3)} < ${effectiveThreshold.toFixed(3)}`;

  return { value, triggered, explanation, minConfidence: minC, effectiveThreshold };
}

// ============================================================================
// δ 2: 1D Mask — 标量共识掩盖向量分歧（轮内，Round 1+ 可用）
// ============================================================================

/**
 * δ_1d_mask = (R × (1 - mean_pairwise_cosine_of_U)) / R_max
 *
 * 检测：群体标量方向高度一致（R 高），但 U 向量之间存在显著差异。
 * 这意味着"选什么"上一致了，但"理由/偏好结构"还有分歧——
 * 是过早共识的典型信号。
 *
 * 替代旧 δ_exposure 的轮内触发功能（不依赖 X）。
 */
export function computeDelta1DMask(
  states: AgentCognitiveState[],
  thermo: ThermoState,
  config?: DeltaConfig,
): DeltaDiagnosis["oneDMask"] {
  const base = config?.oneDMaskThreshold ?? DEFAULTS.oneDMaskThreshold;
  const minC = 1.0; // R + U 向量都是轮内的
  const effectiveThreshold = adaptiveThreshold(base, minC, SAFETY_MARGINS.oneDMask);

  if (states.length < 2) {
    return { value: 0, triggered: false, explanation: "agent 不足",
      minConfidence: minC, effectiveThreshold };
  }

  // 计算 U 向量的 pairwise cosine 距离
  let totalDist = 0; let pairCount = 0;
  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      totalDist += cosineDist(states[i].utility.scores, states[j].utility.scores);
      pairCount++;
    }
  }
  const meanDist = pairCount > 0 ? totalDist / pairCount : 0;

  // δ = R × meanDist
  // R 高 + meanDist 高 → 标量一致但向量分歧 → 过早共识
  const value = thermo.R * meanDist;
  const triggered = value >= effectiveThreshold;

  const explanation = triggered
    ? `1D 遮蔽：标量共识 R=${thermo.R.toFixed(2)}，但向量分歧 meanDist=${meanDist.toFixed(3)}（δ=${value.toFixed(3)} ≥ ${effectiveThreshold.toFixed(3)}）`
    : `标量-向量一致：R=${thermo.R.toFixed(2)}，向量分歧=${meanDist.toFixed(3)}（δ=${value.toFixed(3)} < ${effectiveThreshold.toFixed(3)}）`;

  return { value, triggered, explanation, minConfidence: minC, effectiveThreshold };
}

// ============================================================================
// δ 3: Evidence Silence — 证据被系统性忽视（轮内，Round 1+ 可用）
// ============================================================================

/**
 * δ_evidence_silence = argmin(evidence 被引用次数) / mean(evidence 被引用次数)
 *
 * 基于轮内引用网络检测是否存在 agent 的证据被其他 agent 系统性忽视。
 * 替代旧 δ_imbalance（需要 Gini(X)，X 不可部署）。
 */
export function computeDeltaEvidenceSilence(
  states: AgentCognitiveState[],
  config?: DeltaConfig,
): DeltaDiagnosis["evidenceSilence"] {
  const base = config?.evidenceSilenceThreshold ?? DEFAULTS.evidenceSilenceThreshold;
  const minC = 1.0; // 引用网络是轮内可观测的
  const effectiveThreshold = adaptiveThreshold(base, minC, SAFETY_MARGINS.evidenceSilence);

  if (states.length < 2) {
    return { value: 1, triggered: false, explanation: "agent 不足",
      minConfidence: minC, effectiveThreshold, silencedAgents: [] };
  }

  // 统计每个 agent 的 evidence 被他人引用的次数
  // 简化版：evidence.items.filter(i => i.shared).length / totalShared
  const sharedCounts = states.map(s => ({
    agentId: s.agentId,
    agentName: s.agentName,
    shared: s.evidence.items.filter(i => i.shared).length,
  }));

  const totalShared = sharedCounts.reduce((s, c) => s + c.shared, 0);
  if (totalShared === 0) {
    return { value: 1, triggered: false, explanation: "尚无共享证据",
      minConfidence: minC, effectiveThreshold, silencedAgents: [] };
  }

  const meanShared = totalShared / states.length;
  // 找被引用最少的 agent
  const minShared = Math.min(...sharedCounts.map(c => c.shared));
  const value = meanShared > 0 ? minShared / meanShared : 1;

  const silencedAgents = sharedCounts
    .filter(c => c.shared < meanShared * effectiveThreshold)
    .map(c => c.agentName);

  const triggered = value < effectiveThreshold;
  const explanation = triggered
    ? `证据沉默：${silencedAgents.join("、")} 的证据被系统性忽视（min/mean=${value.toFixed(2)} < ${effectiveThreshold.toFixed(2)}）`
    : `信息传播均衡：min/mean=${value.toFixed(2)} ≥ ${effectiveThreshold.toFixed(2)}`;

  return { value, triggered, explanation, minConfidence: minC, effectiveThreshold, silencedAgents };
}

// ============================================================================
// δ 4: Confidence Gap — 自报信心与 U 位置矛盾（轮内）
// ============================================================================

/**
 * δ_confidence_gap = C.stated 高但其 U 偏离群体均值远
 *
 * 检测 agent 自报 confidence > 0.8 但其 U 向量与群体均值的 cosine 距离 > 0.5。
 * 不声称"真实信心"——只检测"自报与位置的一致性"。
 */
export function computeDeltaConfidenceGap(
  states: AgentCognitiveState[],
  config?: DeltaConfig,
): DeltaDiagnosis["confidenceGap"] {
  const base = config?.confidenceGapThreshold ?? DEFAULTS.confidenceGapThreshold;
  const minC = 1.0; // 轮内数据
  const effectiveThreshold = adaptiveThreshold(base, minC, SAFETY_MARGINS.confidenceGap);

  const overconfidentAgents: string[] = [];
  let maxGap = 0;

  if (states.length < 2) {
    return { value: 0, triggered: false, explanation: "agent 不足",
      minConfidence: minC, effectiveThreshold, overconfidentAgents: [] };
  }

  // 计算群体均值 U
  const allKeys = new Set<string>();
  for (const s of states) Object.keys(s.utility.scores).forEach(k => allKeys.add(k));
  const groupMean: Record<string, number> = {};
  for (const k of allKeys) {
    let sum = 0; let count = 0;
    for (const s of states) {
      if (s.utility.scores[k] !== undefined) { sum += s.utility.scores[k]; count++; }
    }
    groupMean[k] = count > 0 ? sum / count : 0;
  }

  for (const s of states) {
    const stated = s.confidence.stated;
    if (stated < 0.8) continue;

    const dist = cosineDist(s.utility.scores, groupMean);
    if (dist > 0.5) {
      overconfidentAgents.push(s.agentName);
      if (dist > maxGap) maxGap = dist;
    }
  }

  const triggered = overconfidentAgents.length > 0;
  const explanation = triggered
    ? `信心偏差：${overconfidentAgents.join("、")} 自报高信心但 U 偏离群体（max gap=${maxGap.toFixed(3)}）`
    : "信心与偏好位置一致";

  return { value: maxGap, triggered, explanation,
    minConfidence: minC, effectiveThreshold, overconfidentAgents };
}

// ============================================================================
// δ 5: Stance Flip — topChoice 翻转（跨 2 轮，Round 2+ 可用）
// ============================================================================

/**
 * δ_stance_flip: 检测本轮有 agent 改变了 topChoice。
 *
 * 单个翻转不一定异常（可能是正常的信息整合）。连续翻转或多人同时翻转 → 异常。
 * 触发条件：≥2 个 agent 同时翻转，或某人连续翻转。
 */
export function computeDeltaStanceFlip(
  states: AgentCognitiveState[],
  config?: DeltaConfig,
): DeltaDiagnosis["stanceFlip"] {
  const base = config?.stanceFlipThreshold ?? DEFAULTS.stanceFlipThreshold;
  const minC = 0.9; // 需要 2 轮历史，数据量 1 个 Δ
  const effectiveThreshold = adaptiveThreshold(base, minC, SAFETY_MARGINS.stanceFlip);

  const flippedAgents: string[] = [];
  let flipCount = 0;

  for (const s of states) {
    const history = s.utilityHistory;
    if (history.length < 2) continue;

    const prev = history[history.length - 2];
    const curr = history[history.length - 1];
    const prevTop = topKey(prev.scores);
    const currTop = topKey(curr.scores);

    if (prevTop !== currTop) {
      flippedAgents.push(s.agentName);
      flipCount++;
    }
  }

  // 条件：≥2 人同时翻转
  const triggered = flipCount >= 2;
  const explanation = triggered
    ? `立场翻转：${flippedAgents.join("、")} 改变了 top choice（${flipCount} 人）`
    : flipCount === 1
      ? `单人翻转：${flippedAgents[0]} 改变了 top choice（正常）`
      : "无立场翻转";

  // 归一化 value：flipCount / n
  const value = states.length > 0 ? flipCount / states.length : 0;

  return { value, triggered, explanation,
    minConfidence: minC, effectiveThreshold, flippedAgents };
}

// ============================================================================
// δ 6: No Response — 干预后无响应（Round 3+ 可用，需突破暴露次数）
// ============================================================================

/**
 * δ_no_response: 曾暴露于新证据但从未响应的 agent。
 *
 * 需要 BehaviorEvents.timesExposed ≥ 1 才有意义。
 * 使用 ProgressiveEstimator 的 SusceptibilityEstimate.usable 作为门控。
 */
export function computeDeltaNoResponse(
  states: AgentCognitiveState[],
  estimates: Map<string, ProgressiveEstimates>,
  config?: DeltaConfig,
): DeltaDiagnosis["noResponse"] {
  const base = config?.noResponseThreshold ?? DEFAULTS.noResponseThreshold;
  const unresponsiveAgents: string[] = [];
  let minC = 0.30; // 默认：需要至少 1 个暴露事件

  for (const s of states) {
    const events = s.behaviorEvents;
    // 至少暴露过 1 次 + 从未响应 → 候选无响应
    if (events.timesExposed >= 1 && events.timesRespondedAfterExposure === 0) {
      // 门控：仅当 ProgressiveEstimator 的行为易感性估计可用时才标记。
      // est.susceptibility 是暴露-响应行为估计（非 DeGroot 系数）；usable=false
      //（暴露事件 < 2）时无法区分"真不响应"和"数据不足"。绝不 substitute
      // socialUpdateGain 或任何公式值。
      const est = estimates.get(s.agentId);
      if (est?.susceptibility.usable) {
        unresponsiveAgents.push(s.agentName);
        minC = Math.min(minC, est.susceptibility.confidence);
      }
    }
  }

  const triggered = unresponsiveAgents.length > 0;
  const explanation = triggered
    ? `干预无响应：${unresponsiveAgents.join("、")} 曾暴露于新证据但未改变立场（susceptibility 可用）`
    : "暴露 agent 均有响应或 susceptibility 不可用（暴露事件不足）";

  return {
    value: unresponsiveAgents.length,
    triggered,
    explanation,
    minConfidence: minC,
    effectiveThreshold: base,
    unresponsiveAgents,
  };
}

// ============================================================================
// δ 7-8: Concentration & Consistency（使用 ProgressiveEstimates，自适应阈值）
// ============================================================================

/**
 * δ_concentration：I 估计值的集中度。
 *
 * 仅当大部分 agent 的 I.confidence ≥ 0.30 时该 δ 有意义。
 * 否则返回不触发 + 解释"置信度不足"。
 */
export function computeDeltaConcentration(
  estimates: Map<string, ProgressiveEstimates>,
  states: AgentCognitiveState[],
  config?: DeltaConfig,
): DeltaDiagnosis["concentration"] {
  const base = config?.concentrationThreshold ?? DEFAULTS.concentrationThreshold;

  if (states.length < 2) {
    return { value: 0, triggered: false, explanation: "agent 不足",
      minConfidence: 0, effectiveThreshold: base };
  }

  // 取所有 agent 的 I 估计值
  const inertias: number[] = [];
  const confs: number[] = [];
  for (const s of states) {
    const est = estimates.get(s.agentId);
    if (est) {
      inertias.push(est.inertia.estimate);
      confs.push(est.inertia.confidence);
    }
  }

  if (inertias.length < 2) {
    return { value: 0, triggered: false, explanation: "I 估计不足",
      minConfidence: 0, effectiveThreshold: base };
  }

  const minC = Math.min(...confs);
  // 门控：minC < 0.25 → 不触发（短对话中 I 估计太不可靠）
  if (minC < 0.25) {
    return {
      value: 0, triggered: false,
      explanation: `I 置信度不足（min=${minC.toFixed(2)} < 0.25），δ_concentration 跳过`,
      minConfidence: minC, effectiveThreshold: base + SAFETY_MARGINS.concentration,
    };
  }

  const effectiveThreshold = adaptiveThreshold(base, minC, SAFETY_MARGINS.concentration);
  const maxI = Math.max(...inertias);
  const meanI = inertias.reduce((s, v) => s + v, 0) / inertias.length;

  if (meanI === 0) {
    return { value: 0, triggered: false, explanation: "所有 agent I 为 0",
      minConfidence: minC, effectiveThreshold };
  }

  const value = maxI / meanI;
  const triggered = value > effectiveThreshold;

  const dominant = states.find(s => {
    const est = estimates.get(s.agentId);
    return est && est.inertia.estimate === maxI;
  });

  const explanation = triggered
    ? `惯性集中：${dominant?.agentName ?? "?"} I=${maxI.toFixed(2)} / mean=${meanI.toFixed(2)} = ${value.toFixed(1)} > ${effectiveThreshold.toFixed(1)}`
    : `惯性分布均匀：max/mean = ${value.toFixed(1)} ≤ ${effectiveThreshold.toFixed(1)}`;

  return { value, triggered, explanation, minConfidence: minC, effectiveThreshold };
}

/**
 * δ_consistency：立场变化幅度 vs 惯性预测。
 *
 * 使用 ProgressiveEstimator 的 I.estimate 和 C.estimate。
 * I 置信度不足 → 跳过。
 */
export function computeDeltaConsistency(
  estimates: Map<string, ProgressiveEstimates>,
  states: AgentCognitiveState[],
  config?: DeltaConfig,
): DeltaDiagnosis["consistency"] {
  const base = config?.consistencyThreshold ?? DEFAULTS.consistencyThreshold;

  if (states.length === 0) {
    return { value: 0, triggered: false, explanation: "agent 不足",
      minConfidence: 0, effectiveThreshold: base };
  }

  // 修复（2026-08-03）：矛盾度量方向反转。
  // 旧公式 ratio = ΔU / I：高惯性（I=0.9）大幅翻转（ΔU=0.5）→ ratio=0.56 不标记
  //   （而这正是"高阻力却大幅改变"的真矛盾）；低惯性（I=0.05）小幅变化（ΔU=0.2）
  //   → ratio=4 误标记（低阻力改变是其正常行为）。
  // 矛盾度应与惯性 × 变化幅度成正比：高惯性还大幅翻转才是"立场变化与惯性矛盾"。
  // 修正公式：score = ΔU × I（I∈[0.05,1]），base 阈值相应调整为 0.5。
  const anomalousAgents: string[] = [];
  let maxScore = 0;
  const confs: number[] = [];

  for (const s of states) {
    const history = s.utilityHistory;
    if (history.length < 2) continue;

    const prev = history[history.length - 2].scores;
    const curr = history[history.length - 1].scores;
    const delta = utilityL2(prev, curr);

    const est = estimates.get(s.agentId);
    const I = est?.inertia.estimate ?? 0.5;
    confs.push(est?.inertia.confidence ?? 0);

    // 矛盾度：变化幅度 × 惯性（惯性越大、变化越大 → 越矛盾）
    const safeI = Math.max(I, 0.05);
    const score = delta * safeI;
    if (score > maxScore) maxScore = score;

    if (score > base) {
      anomalousAgents.push(s.agentName);
    }
  }

  const minC = confs.length > 0 ? Math.min(...confs) : 0;

  // 门控：短对话中 I 不可靠，仅标记极端异常（score > base×1.5）
  if (minC < 0.25) {
    const strictThreshold = base * 1.5;
    const strictAnomalous = anomalousAgents.filter(name => {
      const s = states.find(st => st.agentName === name);
      if (!s || s.utilityHistory.length < 2) return false;
      const history = s.utilityHistory;
      const prev = history[history.length - 2].scores;
      const curr = history[history.length - 1].scores;
      const delta = utilityL2(prev, curr);
      const est = estimates.get(s.agentId);
      const I = Math.max(est?.inertia.estimate ?? 0.5, 0.05);
      return (delta * I) > strictThreshold;
    });

    return {
      value: maxScore,
      triggered: strictAnomalous.length > 0,
      explanation: strictAnomalous.length > 0
        ? `δ_consistency 极端异常（minC=${minC.toFixed(2)}，严格阈值 ${strictThreshold.toFixed(1)}）：${strictAnomalous.join("、")}`
        : `δ_consistency 跳过（minC=${minC.toFixed(2)} < 0.25，且无极端异常）`,
      minConfidence: minC,
      effectiveThreshold: strictThreshold,
    };
  }

  const effectiveThreshold = adaptiveThreshold(base, minC, SAFETY_MARGINS.consistency);
  const triggered = anomalousAgents.length > 0 && maxScore > effectiveThreshold;

  const explanation = triggered
    ? `异常立场变化：${anomalousAgents.join("、")} ΔU×I=${maxScore.toFixed(1)} > ${effectiveThreshold.toFixed(1)}`
    : `立场变化正常：max ΔU×I=${maxScore.toFixed(1)} ≤ ${effectiveThreshold.toFixed(1)}`;

  return { value: maxScore, triggered, explanation,
    minConfidence: minC, effectiveThreshold };
}

// ============================================================================
// Master: computeDeltaDiagnosis
// ============================================================================

/**
 * 计算完整的 δ 诊断。
 *
 * 8 个 δ 全部计算，但低置信度的 δ 自动趋向不触发（通过自适应阈值 + 门控）。
 * 调用方不需要判断"该不该触发这个 δ"——自适应阈值已在内部处理。
 */
export function computeDeltaDiagnosis(
  states: AgentCognitiveState[],
  thermo: ThermoState,
  estimates: Map<string, ProgressiveEstimates>,
  config?: DeltaConfig,
): DeltaDiagnosis {
  const polarization = computeDeltaPolarization(states, config);
  const oneDMask = computeDelta1DMask(states, thermo, config);
  const evidenceSilence = computeDeltaEvidenceSilence(states, config);
  const confidenceGap = computeDeltaConfidenceGap(states, config);
  const stanceFlip = computeDeltaStanceFlip(states, config);
  const noResponse = computeDeltaNoResponse(states, estimates, config);
  const concentration = computeDeltaConcentration(estimates, states, config);
  const consistency = computeDeltaConsistency(estimates, states, config);

  // 综合摘要
  const triggered: string[] = [];
  if (polarization.triggered) triggered.push("效用极化");
  if (oneDMask.triggered) triggered.push("1D遮蔽");
  if (evidenceSilence.triggered) triggered.push("证据沉默");
  if (confidenceGap.triggered) triggered.push("信心偏差");
  if (stanceFlip.triggered) triggered.push("立场翻转");
  if (noResponse.triggered) triggered.push("干预无响应");
  if (concentration.triggered) triggered.push("惯性集中");
  if (consistency.triggered) triggered.push("异常立场变化");

  const summary = triggered.length > 0
    ? `检测到 ${triggered.length} 个异常：${triggered.join("、")}`
    : "未检测到异常，群体状态正常";

  return {
    polarization, oneDMask, evidenceSilence, confidenceGap,
    stanceFlip, noResponse,
    concentration,
    consistency,
    summary,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function cosineDist(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0; let normA = 0; let normB = 0;
  for (const k of keys) {
    const va = a[k] ?? 0; const vb = b[k] ?? 0;
    dot += va * vb; normA += va * va; normB += vb * vb;
  }
  if (normA === 0 || normB === 0) return 0;
  return 1 - dot / Math.sqrt(normA * normB);
}

function topKey(scores: Record<string, number>): string {
  let maxK = ""; let maxV = -Infinity;
  for (const [k, v] of Object.entries(scores)) {
    if (v > maxV) { maxV = v; maxK = k; }
  }
  return maxK;
}

export function utilityL2(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sumSq = 0;
  for (const k of keys) {
    const diff = (a[k] ?? 0) - (b[k] ?? 0);
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq);
}
