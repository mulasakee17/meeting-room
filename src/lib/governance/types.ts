export type SeverityLevel = "low" | "medium" | "high";

export type InterventionType = 
  | "introduce_diversity" 
  | "break_connections" 
  | "reduce_weight" 
  | "introduce_dissent" 
  | "pair_opposites" 
  | "force_reflection"
  | "continue_discussion"
  | "none";

export interface Intervention {
  type: InterventionType;
  targetAgentId?: string;
  targetAgents?: string[];
  parameters?: Record<string, unknown>;
  effect: string;
  applied: boolean;
}

export interface GovernanceState {
  agentBeliefs: AgentBelief[];
  messages: MessageInfo[];
  agentIds: string[];
  interactionGraph?: {
    nodes: string[];
    edges: Array<{ source: string; target: string; weight: number; type: string }>;
  };
}

export interface InterventionResult {
  success: boolean;
  intervention: Intervention;
  stateChanges?: {
    updatedBeliefs?: AgentBelief[];
    updatedEdges?: Array<{ source: string; target: string; weight: number; type: string }>;
    newAgents?: AgentBelief[];
  };
  /** Information-layer prompt to inject into the next discussion round.
   *  When set, the DiscussionEngine appends this text as visible context
   *  for the affected agents in the following round. */
  prompt?: string;
  /** Which agents should see this prompt. If empty, all agents see it. */
  promptTargets?: string[];
}

export interface InterventionStrategy {
  name: string;
  type: InterventionType;
  apply(
    intervention: Intervention,
    state: GovernanceState,
    /** Optional: agentId → unique knowledge strings for prompt generation */
    agentKnowledge?: Map<string, string[]>
  ): InterventionResult;
}

export interface EchoChamberDetection {
  detected: boolean;
  severity: SeverityLevel;
  redundantAgents: string[];
  infoRedundancyScore: number;
  intervention: {
    type: InterventionType;
    applied: boolean;
    effect?: string;
  };
}

export interface AuthorityBiasDetection {
  detected: boolean;
  severity: SeverityLevel;
  dominantAgent?: string;
  influenceRatio: number;
  intervention: {
    type: InterventionType;
    applied: boolean;
    effect?: string;
  };
}

export interface PolarizationDetection {
  detected: boolean;
  severity: SeverityLevel;
  groups: {
    label: string;
    agentIds: string[];
    belief: number;
  }[];
  polarizationIndex: number;
  intervention: {
    type: InterventionType;
    applied: boolean;
    effect?: string;
  };
}

export interface PrematureConsensusDetection {
  detected: boolean;
  severity: SeverityLevel;
  roundNumber: number;
  maxRounds: number;
  beliefStd: number;
  consensusLevel: number;
  intervention: {
    type: InterventionType;
    applied: boolean;
    effect?: string;
  };
}

export interface GovernanceIssue {
  type: string;
  severity: SeverityLevel;
  description: string;
  agents?: string[];
}

export interface GovernanceResult {
  echoChamber: EchoChamberDetection;
  authorityBias: AuthorityBiasDetection;
  polarization: PolarizationDetection;
  prematureConsensus: PrematureConsensusDetection;
  otherIssues: GovernanceIssue[];
  summary: string;
  interventionCount: number;
}

export interface GovernanceConfig {
  enableEchoChamberDetection?: boolean;
  enableAuthorityBiasDetection?: boolean;
  enablePolarizationDetection?: boolean;
  enablePrematureConsensusDetection?: boolean;
  interventionLevel?: "none" | "light" | "medium" | "heavy";
  echoChamberThreshold?: number;
  authorityBiasThreshold?: number;
  polarizationThreshold?: number;
  prematureConsensusThreshold?: number;
  maxRounds?: number;
  currentRound?: number;
  /** Override INTERVENTION_REDUCE_WEIGHT_FACTOR (default 0.5) */
  reduceWeightFactor?: number;
  /** Override INTERVENTION_DIVERSITY_PERTURBATION (default 0.3) */
  diversityPerturbation?: number;
  /** Override INTERVENTION_REFLECTION_FACTOR (default 0.2) */
  reflectionFactor?: number;
}

export interface AgentBelief {
  agentId: string;
  belief: number;
  confidence: number;
}

export interface MessageInfo {
  agentId: string;
  content: string;
  timestamp: string;
  referencedAgents?: string[];
}