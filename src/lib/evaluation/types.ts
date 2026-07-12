export interface ConsensusRoundData {
  round: number;
  kuramotoOrder: number;
  beliefStd: number;
  agreementRate: number;
  avgBelief: number;
}

export interface ConsensusTrajectory {
  rounds: ConsensusRoundData[];
  convergenceRound?: number;
  convergenceSpeed: number;
  finalConsensus: number;
  consensusChangeRate: number;
  volatility: number;
  turningPoints: { round: number; type: "increase" | "decrease" | "plateau" }[];
}

export interface ConsensusMetric {
  score: number;
  kuramotoOrder: number;
  beliefStd: number;
  agreementRate: number;
  trajectory: ConsensusTrajectory;
  details: string;
}

export interface CrossValidationResult {
  runIndex: number;
  overallScore: number;
  decisions: string[];
  beliefs: Record<string, number>;
}

/**
 * Reliability metric — measures internal consistency of the multi-agent
 * discussion using statistically valid methods.
 *
 * Key sub-metrics:
 * - roundConsistencyAlpha: Cronbach's α computed across discussion rounds
 *   (each round = one measurement occasion; valid when rounds ≥ 3).
 *   Measures whether agents maintain consistent relative belief rankings
 *   across rounds. High α → stable discussion; low α → erratic shifts.
 * - crossValidationScore: how well each agent's output aligns with the
 *   final group decision (leave-one-out style).
 * - repeatabilityScore: composite of belief consistency and decision
 *   content similarity across agents.
 * - confidenceInterval: statistical CI of the mean belief.
 */
export interface ReliabilityMetric {
  score: number;
  crossValidationScore: number;
  consistencyScore: number;
  groundTruthMatch?: boolean;
  /** Cronbach's α across discussion rounds (valid when rounds ≥ 3) */
  roundConsistencyAlpha: number | null;
  repeatabilityScore: number;
  confidenceInterval: [number, number];
  crossValidationResults?: CrossValidationResult[];
  details: string;
}

/**
 * Statistical dispersion of beliefs, confidences, and round-to-round
 * variability within a single discussion run.
 *
 * NOTE: This is NOT "robustness" in the perturbation-testing sense.
 * It describes the observed variance structure — no noise injection,
 * agent dropout, or parameter perturbation is performed.
 *
 * Sub-metrics:
 * - beliefDispersion: cross-agent belief variance within round
 * - confidenceDispersion: cross-agent confidence variance within round
 * - roundVariability: average belief difference between consecutive rounds
 */
export interface DispersionMetric {
  score: number;
  beliefDispersion: number;
  confidenceDispersion: number;
  roundVariability: number;
  details: string;
}

export interface StabilityMetric {
  score: number;
  roundConsistency: number;
  timeSeriesStability: number;
  details: string;
}

export interface InfluencePath {
  sourceAgentId: string;
  targetAgentId: string;
  path: string[];
  strength: number;
  round: number;
  pathLength: number;
  type: "direct" | "indirect" | "chain";
  cumulativeStrength: number;
}

export interface InfluenceAnalysisMetric {
  score: number;
  attribution: {
    agentId: string;
    contribution: number;
    influenceWeight: number;
  }[];
  dominantAgent?: string;
  giniCoefficient: number;
  influencePaths: InfluencePath[];
  degreeCentrality: Record<string, number>;
  coMentionCentrality: Record<string, number>;
  influenceDensity: number;
  averagePathLength: number;
  influenceDiffusionRate: number;
  keyInfluencers: string[];
  details: string;
}

/**
 * Evaluation result with academically defensible dimensions only.
 *
 * Five dimensions (down from seven):
 * 1. Consensus — Kuramoto order + belief variance + trajectory
 * 2. Reliability — round-consistency α + cross-validation + repeatability
 * 3. Dispersion — cross-agent belief/confidence variance + round variability
 * 4. Stability — round-to-round consistency + time-series smoothness
 * 5. Influence Analysis — Gini + network centrality + influence paths
 *
 * Removed dimensions (and why):
 * - Explainability: was based on reasoning length heuristic; no academic basis
 * - Manipulation Resistance: conflated uniformity with robustness; logically flawed
 */
export interface EvaluationResult {
  overallScore: number;
  dimensions: {
    consensus: ConsensusMetric;
    reliability: ReliabilityMetric;
    dispersion: DispersionMetric;
    stability: StabilityMetric;
    influenceAnalysis: InfluenceAnalysisMetric;
  };
  customMetrics?: Record<string, number>;
  summary: string;
  grade: "excellent" | "good" | "fair" | "poor" | "critical";
}

export interface AgentDecision {
  agentId: string;
  content: string;
  confidence: number;
  reasoning: string;
  belief?: number;
}

/**
 * AgentInfo 复用 discussion/types.ts 中的定义，避免接口重复维护。
 * 若未来评估层需要扩展字段，在此声明独立接口即可。
 */
export type { AgentInfo } from "../discussion/types";

export interface InteractionRound {
  round: number;
  messages: {
    agentId: string;
    content: string;
    timestamp: string;
    /** 被该消息显式引用的其他 agent ID（优先用于影响力路径检测） */
    referencedAgents?: string[];
  }[];
  beliefs: Record<string, number>;
  beliefChanges: Record<string, number>;
  converged: boolean;
}

export interface EvaluationConfig {
  enableAll?: boolean;
  dimensions?: string[];
  customMetrics?: Record<string, {
    name: string;
    description: string;
    weight: number;
  }>;
  weights?: Record<string, number>;
}

export interface GroundTruth {
  content: string;
  confidence?: number;
}
