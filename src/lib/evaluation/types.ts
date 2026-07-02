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

export interface ReliabilityMetric {
  score: number;
  crossValidationScore: number;
  consistencyScore: number;
  groundTruthMatch?: boolean;
  cronbachAlpha: number;
  repeatabilityScore: number;
  confidenceInterval: [number, number];
  crossValidationResults?: CrossValidationResult[];
  details: string;
}

export interface ExplainabilityMetric {
  score: number;
  reasoningLength: number;
  attributionClarity: number;
  stepCoverage: number;
  details: string;
}

export interface RobustnessMetric {
  score: number;
  perturbationTests: {
    inputNoise: number;
    agentDropout: number;
    parameterVariation: number;
  };
  details: string;
}

export interface StabilityMetric {
  score: number;
  roundConsistency: number;
  timeSeriesStability: number;
  details: string;
}

export interface ManipulationResistanceMetric {
  score: number;
  adversarialTest: number;
  biasDetection: number;
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

export interface EvaluationResult {
  overallScore: number;
  dimensions: {
    consensus: ConsensusMetric;
    reliability: ReliabilityMetric;
    explainability: ExplainabilityMetric;
    robustness: RobustnessMetric;
    stability: StabilityMetric;
    manipulationResistance: ManipulationResistanceMetric;
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

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  type: string;
  config?: Record<string, unknown>;
}

export interface InteractionRound {
  round: number;
  messages: {
    agentId: string;
    content: string;
    timestamp: string;
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