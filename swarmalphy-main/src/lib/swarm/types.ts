// SwarmAlpha v9.7 API contract types
export type Direction = "UP" | "DOWN" | "NEUTRAL";
export type FactorCategory =
  | "liquidity"
  | "policy"
  | "fundamental"
  | "narrative"
  | "uncertainty";

export interface LlmConfig {
  provider: "deepseek" | "openai" | "anthropic" | "local";
  model: string;
}

export interface AblationConfig {
  nonlinearMethod?:
    | "linear_baseline"
    | "power_law"
    | "entropy_weighted"
    | "trimmed_mean"
    | "median"
    | "winsorized"
    | "geometric_mean"
    | "dynamic_ensemble";
  disablePolicyAgent?: boolean;
  disableBlindness?: boolean;
  disableClustering?: boolean;
  disableUncertainty?: boolean;
  disableNeutralRule1?: boolean;
  disableMeanReversion?: boolean;
}

export interface SwarmRequest {
  version: "v9";
  news: string;
  rounds?: number;
  llmConfig: LlmConfig;
  sessionId?: string;
  sequenceIndex?: number;
  disableInteraction?: boolean;
  enableDynamicWeights?: boolean;
  enableVRoute?: boolean;
  ablation?: AblationConfig;
}

export interface FactorVector {
  factors: {
    category: FactorCategory;
    value: number;
    confidence: number;
    evidence: string;
  }[];
  metadata: {
    newsSummary: string;
    detectedAnomalies: string[];
    timestamp: string;
  };
}

export interface AgentState {
  belief: number;
  confidence: number;
  visibleFactors: string[];
  interpretation: string;
}

export interface RoundData {
  round: number;
  consensus: number;
  direction: Direction;
  confidence: number;
  beliefStd: number;
  kuramotoR: number;
  neutralTrace?: {
    rule1_fired: boolean;
    rule2_fired: boolean;
    rule3_fired: boolean;
    rule4_fired: boolean;
    finalNeutral: boolean;
    gatingReason: string;
  };
  agents: Record<string, AgentState>;
}

export interface FinalDecision {
  consensus: number;
  direction: Direction;
  confidence: number;
  beliefStd: number;
}

export interface AttributionItem {
  agentId: string;
  agentName: string;
  emoji: string;
  belief: number;
  confidence: number;
  influenceWeight: number;
  contribution: number;
  contributionPct: number;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  visibleFactors: string[];
}

export interface CounterfactualVariant {
  label: string;
  description: string;
  modifiedAgentId?: string;
  consensus: number;
  direction: Direction;
  deltaConsensus: number;
  directionFlipped: boolean;
  impact: "CRITICAL" | "SIGNIFICANT" | "MODERATE" | "MINIMAL";
}

export interface Diagnostics {
  attribution: AttributionItem[];
  coalition: {
    bullishCoalition: {
      agentIds: string[];
      totalInfluence: number;
      totalCapital: number;
      weightedBelief: number;
    };
    bearishCoalition: {
      agentIds: string[];
      totalInfluence: number;
      totalCapital: number;
      weightedBelief: number;
    };
    neutralAgents: string[];
    powerRatio: number;
    dominantCoalition: "BULLISH" | "BEARISH" | "BALANCED";
    tension: number;
    swingAgents: string[];
  };
  counterfactuals: {
    baselineConsensus: number;
    mostInfluentialAgent: string;
    agentsToFlip: number;
    variants: CounterfactualVariant[];
  };
  summary: {
    coreFinding: string;
    consensusMechanism: string;
    riskFactors: string[];
    blindnessEffect: string;
  };
}

export interface SocialProfile {
  agentId: string;
  alpha: number;
  visibleAgentIds: string[];
  trust: Record<string, number>;
}

export interface V9_5Data {
  interaction: {
    totalRounds: number;
    convergenceType: "converged" | "diverged" | "max_rounds";
    rounds: {
      round: number;
      beliefs: Record<string, number>;
      beliefChanges: Record<string, number>;
      meanBelief: number;
      beliefStd: number;
      converged: boolean;
    }[];
    beliefShift: Record<string, number>;
    consensusFormed: boolean;
    polarizationIncreased: boolean;
    socialProfiles: SocialProfile[];
  } | null;
  metrics: {
    consensusScore: number;
    polarizationScore: number;
    fragilityScore: number;
    stateLabel: string;
    stateInterpretation: string;
  };
  comparison?: {
    consensusShift: number;
    stdChange: number;
    effect: "convergence" | "polarization" | "minimal";
    description: string;
  } | null;
}

export interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  role: string;
}

export interface SwarmResponse {
  success: true;
  version: "v9.7";
  data: {
    news: string;
    factorVector: FactorVector;
    rounds: RoundData[];
    final: FinalDecision;
    diagnostics: Diagnostics;
    ablationMetrics: {
      policyAgentActive: boolean;
      uncertaintyActive: boolean;
      blindnessActive: boolean;
      beliefStdHistory: number[];
    };
    v9_5: V9_5Data;
    v9_5Agents: AgentInfo[];
    routing: {
      finalDirection: Direction;
      decision: string;
      classifierLabel: string;
      consensusRaw: number;
    };
  };
  rateLimit: { remaining: number; resetTime: string };
}
