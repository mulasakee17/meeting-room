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
}

export interface InterventionStrategy {
  name: string;
  type: InterventionType;
  apply(
    intervention: Intervention,
    state: GovernanceState
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