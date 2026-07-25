/**
 * Phase 4B: Cognitive State Driven Detectors
 *
 * 基于认知状态（Utility / Evidence / Inertia / Confidence / Susceptibility）
 * 的群体失败模式检测器。与旧 belief-based 检测器并行存在，不修改旧代码。
 *
 * 六个检测器：
 *   1. Echo Chamber (cognitive)  — 证据冗余 + 覆盖度方差
 *   2. Polarization (cognitive)  — 效用向量 pairwise cosine 距离
 *   3. Premature Consensus (cognitive) — 效用收敛 + 信念离散
 *   4. Authority Bias (cognitive)  — 惯性集中度 + 影响力不对称
 *   5. Evidence Imbalance          — 证据覆盖度不均衡
 *   6. Cognitive Action Mismatch   — 效用 topChoice vs rankingTopChoice 不一致
 */

import type {
  CognitiveGovernanceState,
  GovernanceIssue,
  GovernanceConfig,
  SeverityLevel,
} from "./types";

// ============================================================================
// Utility Functions
// ============================================================================

/** 计算数组的总体标准差 */
function stdPop(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

/** 计算两个集合的 Jaccard 相似度 */
function jaccardSimilarity<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

/** 计算两个效用向量的 cosine 距离 */
function cosineDistance(
  a: Record<string, number>,
  b: Record<string, number>,
): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const k of keys) {
    const va = a[k] ?? 0;
    const vb = b[k] ?? 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) return 0;
  return 1 - dot / Math.sqrt(normA * normB);
}

// ============================================================================
// Detector 1: Echo Chamber (Cognitive)
// ============================================================================

export interface EchoChamberCognitiveResult {
  detected: boolean;
  severity: SeverityLevel;
  redundantAgents: string[];
  infoRedundancyScore: number;
  evidenceCoverageVariance: number;
  evidenceDiversityMean: number;
}

/**
 * 认知回声室检测。
 *
 * 信号：
 *   - evidenceCoverage 方差低 → 大家信息覆盖度趋同
 *   - evidenceDiversity 均值低 → 证据维度单一
 *   - 综合得分 = 0.3×(1-coverageVariance) + 0.3×(1-diversityMean) + 0.4×Jaccard重叠
 *
 * 阈值：默认 0.7（可配置）
 */
export function detectEchoChamberCognitive(
  states: CognitiveGovernanceState[],
  config?: GovernanceConfig,
): EchoChamberCognitiveResult {
  if (states.length < 2) {
    return {
      detected: false, severity: "low", redundantAgents: [],
      infoRedundancyScore: 0, evidenceCoverageVariance: 0, evidenceDiversityMean: 0,
    };
  }

  const coverages = states.map(s => s.evidence.coverage);
  const diversities = states.map(s => s.evidence.diversity);

  const coverageVariance = stdPop(coverages);
  const diversityMean = diversities.reduce((s, v) => s + v, 0) / diversities.length;

  // 计算所有 agent 对的平均 Jaccard（基于 utility 的 topChoice 分布）
  let jaccardSum = 0;
  let pairCount = 0;
  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      const optsA = new Set(Object.keys(states[i].utility.scores));
      const optsB = new Set(Object.keys(states[j].utility.scores));
      jaccardSum += jaccardSimilarity(optsA, optsB);
      pairCount++;
    }
  }
  const jaccardOverlap = pairCount > 0 ? jaccardSum / pairCount : 0;

  const echoScore = 0.3 * (1 - coverageVariance) + 0.3 * (1 - diversityMean) + 0.4 * jaccardOverlap;
  const threshold = config?.echoChamberThreshold ?? 0.75;

  // 找冗余 agent：coverage 接近均值且 diversity 低的 agent
  const covMean = coverages.reduce((s, v) => s + v, 0) / coverages.length;
  const redundantAgents = states
    .filter(s => Math.abs(s.evidence.coverage - covMean) < 0.15 && s.evidence.diversity < 0.5)
    .map(s => s.agentId);

  return {
    detected: echoScore >= threshold,
    severity: echoScore >= 0.90 ? "high" : echoScore >= threshold ? "medium" : "low",
    redundantAgents: echoScore >= threshold ? redundantAgents : [],
    infoRedundancyScore: echoScore,
    evidenceCoverageVariance: coverageVariance,
    evidenceDiversityMean: diversityMean,
  };
}

// ============================================================================
// Detector 2: Polarization (Cognitive)
// ============================================================================

export interface PolarizationCognitiveResult {
  detected: boolean;
  severity: SeverityLevel;
  polarizationScore: number;
  /** 平均 pairwise cosine 距离 */
  meanPairwiseDistance: number;
  /** 最远的两个 agent */
  mostDistant: [string, string];
}

/**
 * 认知极化检测。
 *
 * 使用 pairwise cosine distance 避免 k-means 在小样本（n=5）下的不稳定性。
 * 信号：效用向量之间的平均 cosine 距离。
 *
 * 阈值：默认 0.15（与旧检测器一致，基于分离度最大化）
 */
export function detectPolarizationCognitive(
  states: CognitiveGovernanceState[],
  config?: GovernanceConfig,
): PolarizationCognitiveResult {
  if (states.length < 2) {
    return {
      detected: false, severity: "low", polarizationScore: 0,
      meanPairwiseDistance: 0, mostDistant: [states[0]?.agentId ?? "", states[0]?.agentId ?? ""],
    };
  }

  let totalDist = 0;
  let maxDist = 0;
  let mostDistant: [string, string] = [states[0].agentId, states[1].agentId];
  let pairCount = 0;

  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      const dist = cosineDistance(states[i].utility.scores, states[j].utility.scores);
      totalDist += dist;
      if (dist > maxDist) {
        maxDist = dist;
        mostDistant = [states[i].agentId, states[j].agentId];
      }
      pairCount++;
    }
  }

  const meanDist = pairCount > 0 ? totalDist / pairCount : 0;
  const threshold = config?.polarizationThreshold ?? 0.25;

  return {
    detected: meanDist >= threshold,
    severity: meanDist >= 0.40 ? "high" : meanDist >= threshold ? "medium" : "low",
    polarizationScore: meanDist,
    meanPairwiseDistance: meanDist,
    mostDistant,
  };
}

// ============================================================================
// Detector 3: Premature Consensus (Cognitive)
// ============================================================================

export interface PrematureConsensusCognitiveResult {
  detected: boolean;
  severity: SeverityLevel;
  /** 效用共识度：utility 向量的平均 cosine 相似度 */
  utilityConsensus: number;
  /** 信念离散度 */
  beliefDispersion: number;
  /** 轮次进度 */
  roundProgress: number;
}

/**
 * 认知过早共识检测。
 *
 * 信号：轮次进度 × 效用共识度 × (1 - 信念离散度)
 *  - 早期轮次 + 高效用共识 + 低信念离散 → 过早共识
 *
 * 阈值：默认 0.5（可配置）
 */
export function detectPrematureConsensusCognitive(
  states: CognitiveGovernanceState[],
  round: number,
  maxRounds: number,
  config?: GovernanceConfig,
): PrematureConsensusCognitiveResult {
  if (states.length < 2) {
    return {
      detected: false, severity: "low", utilityConsensus: 1,
      beliefDispersion: 0, roundProgress: 0,
    };
  }

  // 效用共识度：平均 cosine 相似度
  let totalSim = 0;
  let pairCount = 0;
  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      const dist = cosineDistance(states[i].utility.scores, states[j].utility.scores);
      totalSim += 1 - dist;
      pairCount++;
    }
  }
  const utilityConsensus = pairCount > 0 ? totalSim / pairCount : 0;

  // 信念离散度：从 utility 分数计算
  const allScores: number[] = [];
  for (const s of states) {
    allScores.push(...Object.values(s.utility.scores));
  }
  const beliefDispersion = stdPop(allScores);

  const roundProgress = maxRounds > 0 ? round / maxRounds : 0;

  // 综合得分：早期轮次 + 高效用共识 + 低离散 → 过早共识
  const score = roundProgress * utilityConsensus * (1 - Math.min(1, beliefDispersion));
  const threshold = config?.prematureConsensusThreshold ?? 0.55;

  return {
    detected: score >= threshold,
    severity: score >= 0.78 ? "high" : score >= threshold ? "medium" : "low",
    utilityConsensus,
    beliefDispersion,
    roundProgress,
  };
}

// ============================================================================
// Detector 4: Authority Bias (Cognitive)
// ============================================================================

export interface AuthorityBiasCognitiveResult {
  detected: boolean;
  severity: SeverityLevel;
  /** 惯性集中度：最高惯性 agent 的惯性 / 平均惯性 */
  inertiaConcentration: number;
  /** 惯性最高的 agent */
  dominantAgentId: string;
  /** 影响力不对称度：max(susceptibility) / min(susceptibility) */
  susceptibilityAsymmetry: number;
}

/**
 * 认知权威偏差检测。
 *
 * 信号：
 *   - 惯性集中度：某个 agent 惯性远高于平均 → 该 agent 更"权威"（不易改变）
 *   - 易感性不对称度：max(λ)/min(λ) 高 → 影响力分布不均
 *
 * 阈值：默认惯性集中度 > 1.3 或易感性不对称度 > 2.0
 */
export function detectAuthorityBiasCognitive(
  states: CognitiveGovernanceState[],
  config?: GovernanceConfig,
): AuthorityBiasCognitiveResult {
  if (states.length < 2) {
    return {
      detected: false, severity: "low", inertiaConcentration: 1,
      dominantAgentId: states[0]?.agentId ?? "", susceptibilityAsymmetry: 1,
    };
  }

  const inertias = states.map(s => s.inertia.strength);
  const avgInertia = inertias.reduce((s, v) => s + v, 0) / inertias.length;
  const maxInertia = Math.max(...inertias);
  const maxInertiaIdx = inertias.indexOf(maxInertia);

  const susceptibilities = states.map(s => s.susceptibility);
  const maxSus = Math.max(...susceptibilities);
  const minSus = Math.min(...susceptibilities);

  const inertiaConcentration = avgInertia > 0 ? maxInertia / avgInertia : 1;
  const susceptibilityAsymmetry = minSus > 0 ? maxSus / minSus : 1;

  // 综合信号：惯性集中度 + 易感性不对称度
  // 注意：threshold 直接作为信号值阈值（不再使用 threshold*2 的间接映射）
  const signal = (inertiaConcentration - 1) * 0.5 + (susceptibilityAsymmetry - 1) * 0.5;
  const threshold = config?.authorityBiasThreshold ?? 0.6;
  const detected = signal >= threshold;

  return {
    detected,
    severity: signal >= 0.8 ? "high" : detected ? "medium" : "low",
    inertiaConcentration,
    dominantAgentId: states[maxInertiaIdx]?.agentId ?? "",
    susceptibilityAsymmetry,
  };
}

// ============================================================================
// Detector 5: Evidence Imbalance
// ============================================================================

export interface EvidenceImbalanceResult {
  detected: boolean;
  severity: SeverityLevel;
  /** 证据覆盖度的基尼系数 */
  coverageGini: number;
  /** 证据覆盖度最高 vs 最低的 agent */
  coverageGap: number;
  /** 证据贫乏的 agent */
  evidencePoorAgents: string[];
}

/**
 * 证据不均衡检测。
 *
 * 信号：agent 之间的 evidence.coverage 分布不均。
 * 使用简化基尼系数：mean absolute difference / (2 × mean)。
 *
 * 阈值：默认基尼 > 0.3
 */
export function detectEvidenceImbalance(
  states: CognitiveGovernanceState[],
  config?: GovernanceConfig,
): EvidenceImbalanceResult {
  if (states.length < 2) {
    return {
      detected: false, severity: "low", coverageGini: 0,
      coverageGap: 0, evidencePoorAgents: [],
    };
  }

  const coverages = states.map(s => s.evidence.coverage);
  const mean = coverages.reduce((s, v) => s + v, 0) / coverages.length;
  if (mean === 0) {
    return { detected: false, severity: "low", coverageGini: 0, coverageGap: 0, evidencePoorAgents: [] };
  }

  // 简化基尼系数
  let mad = 0;
  for (let i = 0; i < coverages.length; i++) {
    for (let j = 0; j < coverages.length; j++) {
      mad += Math.abs(coverages[i] - coverages[j]);
    }
  }
  mad /= coverages.length * coverages.length;
  const gini = mad / (2 * mean);

  const maxCov = Math.max(...coverages);
  const minCov = Math.min(...coverages);
  const coverageGap = maxCov - minCov;

  // 证据贫乏 agent：coverage 低于均值 30% 以上
  const evidencePoorAgents = states
    .filter((s, i) => coverages[i] < mean * 0.7)
    .map(s => s.agentId);

  const threshold = 0.4;

  return {
    detected: gini >= threshold,
    severity: gini >= 0.6 ? "high" : gini >= threshold ? "medium" : "low",
    coverageGini: gini,
    coverageGap,
    evidencePoorAgents: gini >= threshold ? evidencePoorAgents : [],
  };
}

// ============================================================================
// Detector 6: Cognitive Action Mismatch
// ============================================================================

export interface CognitiveActionMismatchResult {
  detected: boolean;
  severity: SeverityLevel;
  /** 不一致的 agent */
  mismatchAgents: string[];
  /** 平均不一致程度 */
  meanMismatchGap: number;
}

/**
 * 认知-行动不一致检测。
 *
 * 信号：utility.topChoice ≠ rankingTopChoice（LLM 推理偏好与排名行动不一致）。
 * 不一致程度 = utility.scores[topChoice] - utility.scores[rankingTopChoice] 的绝对值。
 *
 * 阈值：差距 > 0.3（与 MAST FM-2.6 一致）
 */
export function detectCognitiveActionMismatch(
  states: CognitiveGovernanceState[],
  config?: GovernanceConfig,
): CognitiveActionMismatchResult {
  if (states.length === 0) {
    return { detected: false, severity: "low", mismatchAgents: [], meanMismatchGap: 0 };
  }

  const mismatchAgents: string[] = [];
  const gaps: number[] = [];

  for (const s of states) {
    if (!s.rankingTopChoice) continue;
    if (s.utility.topChoice === s.rankingTopChoice) continue;

    const topScore = s.utility.scores[s.utility.topChoice] ?? 0;
    const rankScore = s.utility.scores[s.rankingTopChoice] ?? 0;
    const gap = Math.abs(topScore - rankScore);

    if (gap > 0.4) {
      mismatchAgents.push(s.agentId);
      gaps.push(gap);
    }
  }

  const meanGap = gaps.length > 0 ? gaps.reduce((s, v) => s + v, 0) / gaps.length : 0;

  return {
    detected: mismatchAgents.length > 0,
    severity: mismatchAgents.length >= 2 ? "high" : mismatchAgents.length === 1 ? "medium" : "low",
    mismatchAgents,
    meanMismatchGap: meanGap,
  };
}

// ============================================================================
// Master: Run All Cognitive Detectors
// ============================================================================

export interface CognitiveDetectionResult {
  echoChamber: EchoChamberCognitiveResult;
  polarization: PolarizationCognitiveResult;
  prematureConsensus: PrematureConsensusCognitiveResult;
  authorityBias: AuthorityBiasCognitiveResult;
  evidenceImbalance: EvidenceImbalanceResult;
  cognitiveActionMismatch: CognitiveActionMismatchResult;
  /** 触发检测的 issue 列表（供治理引擎消费） */
  issues: GovernanceIssue[];
}

/**
 * 运行所有认知检测器。
 *
 * 每个检测器独立运行，触发时生成对应的 GovernanceIssue。
 * 返回结构化的检测结果和 issue 列表。
 */
export function runCognitiveDetectors(
  states: CognitiveGovernanceState[],
  config: GovernanceConfig,
  round: number,
  maxRounds: number,
): CognitiveDetectionResult {
  const echoChamber = detectEchoChamberCognitive(states, config);
  const polarization = detectPolarizationCognitive(states, config);
  const prematureConsensus = detectPrematureConsensusCognitive(states, round, maxRounds, config);
  const authorityBias = detectAuthorityBiasCognitive(states, config);
  const evidenceImbalance = detectEvidenceImbalance(states, config);
  const cognitiveActionMismatch = detectCognitiveActionMismatch(states, config);

  // 构建 issue 列表
  const issues: GovernanceIssue[] = [];

  if (echoChamber.detected) {
    issues.push({
      type: "echo_chamber_cognitive",
      severity: echoChamber.severity,
      description: `Echo chamber (cognitive): info redundancy=${echoChamber.infoRedundancyScore.toFixed(2)}, ` +
        `coverage variance=${echoChamber.evidenceCoverageVariance.toFixed(2)}, ` +
        `diversity mean=${echoChamber.evidenceDiversityMean.toFixed(2)}`,
      agents: echoChamber.redundantAgents,
      source: "custom",
      suggestedIntervention: {
        type: "rebalance_attention",
        targetAgents: echoChamber.redundantAgents,
        reason: "Cognitive echo chamber detected: evidence diversity is low, rebalancing speaking order to surface marginalized voices",
      },
      detectionMetrics: {
        infoRedundancyScore: echoChamber.infoRedundancyScore,
        evidenceCoverageVariance: echoChamber.evidenceCoverageVariance,
        evidenceDiversityMean: echoChamber.evidenceDiversityMean,
      },
    });
  }

  if (polarization.detected) {
    issues.push({
      type: "polarization_cognitive",
      severity: polarization.severity,
      description: `Polarization (cognitive): mean pairwise cosine distance=${polarization.meanPairwiseDistance.toFixed(2)}, ` +
        `most distant: ${polarization.mostDistant[0]} vs ${polarization.mostDistant[1]}`,
      agents: polarization.mostDistant,
      source: "custom",
      suggestedIntervention: {
        type: "inject_evidence",
        targetAgents: polarization.mostDistant,
        reason: "Cognitive polarization detected: utility vectors are far apart, injecting ignored private evidence to bridge the gap",
      },
      detectionMetrics: {
        polarizationScore: polarization.polarizationScore,
        meanPairwiseDistance: polarization.meanPairwiseDistance,
      },
    });
  }

  if (prematureConsensus.detected) {
    issues.push({
      type: "premature_consensus_cognitive",
      severity: prematureConsensus.severity,
      description: `Premature consensus (cognitive): utility consensus=${prematureConsensus.utilityConsensus.toFixed(2)}, ` +
        `belief dispersion=${prematureConsensus.beliefDispersion.toFixed(2)}, ` +
        `round progress=${prematureConsensus.roundProgress.toFixed(2)}`,
      source: "custom",
      suggestedIntervention: {
        type: "inject_evidence",
        reason: "Cognitive premature consensus detected: high utility agreement in early rounds, injecting diverse evidence to prevent premature lock-in",
      },
      detectionMetrics: {
        utilityConsensus: prematureConsensus.utilityConsensus,
        beliefDispersion: prematureConsensus.beliefDispersion,
        roundProgress: prematureConsensus.roundProgress,
      },
    });
  }

  if (authorityBias.detected) {
    issues.push({
      type: "authority_bias_cognitive",
      severity: authorityBias.severity,
      description: `Authority bias (cognitive): inertia concentration=${authorityBias.inertiaConcentration.toFixed(2)}, ` +
        `dominant agent=${authorityBias.dominantAgentId}, ` +
        `susceptibility asymmetry=${authorityBias.susceptibilityAsymmetry.toFixed(2)}`,
      agents: [authorityBias.dominantAgentId],
      source: "custom",
      suggestedIntervention: {
        type: "rebalance_attention",
        targetAgents: [authorityBias.dominantAgentId],
        reason: "Cognitive authority bias detected: one agent has disproportionately high inertia, rebalancing speaking order to let others speak first",
      },
      detectionMetrics: {
        inertiaConcentration: authorityBias.inertiaConcentration,
        susceptibilityAsymmetry: authorityBias.susceptibilityAsymmetry,
      },
    });
  }

  if (evidenceImbalance.detected) {
    issues.push({
      type: "evidence_imbalance",
      severity: evidenceImbalance.severity,
      description: `Evidence imbalance: coverage Gini=${evidenceImbalance.coverageGini.toFixed(2)}, ` +
        `coverage gap=${evidenceImbalance.coverageGap.toFixed(2)}, ` +
        `poor agents: ${evidenceImbalance.evidencePoorAgents.join(", ")}`,
      agents: evidenceImbalance.evidencePoorAgents,
      source: "custom",
      suggestedIntervention: {
        type: "inject_evidence",
        targetAgents: evidenceImbalance.evidencePoorAgents,
        reason: "Evidence imbalance detected: some agents have significantly less evidence coverage, injecting their private information into discussion",
      },
      detectionMetrics: {
        coverageGini: evidenceImbalance.coverageGini,
        coverageGap: evidenceImbalance.coverageGap,
      },
    });
  }

  if (cognitiveActionMismatch.detected) {
    issues.push({
      type: "cognitive_action_mismatch",
      severity: cognitiveActionMismatch.severity,
      description: `Cognitive-action mismatch: ${cognitiveActionMismatch.mismatchAgents.length} agents ` +
        `have utility.topChoice ≠ rankingTopChoice, mean gap=${cognitiveActionMismatch.meanMismatchGap.toFixed(2)}`,
      agents: cognitiveActionMismatch.mismatchAgents,
      source: "custom",
      suggestedIntervention: {
        type: "rebalance_attention",
        targetAgents: cognitiveActionMismatch.mismatchAgents,
        reason: "Cognitive-action mismatch detected: agent reasoning preference conflicts with ranking action, rebalancing to let them reconsider",
      },
      detectionMetrics: {
        meanMismatchGap: cognitiveActionMismatch.meanMismatchGap,
        mismatchCount: cognitiveActionMismatch.mismatchAgents.length,
      },
    });
  }

  return {
    echoChamber,
    polarization,
    prematureConsensus,
    authorityBias,
    evidenceImbalance,
    cognitiveActionMismatch,
    issues,
  };
}