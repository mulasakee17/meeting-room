import type {
  AgentOpinion,
  RoundResult,
  DiscussionMemoryEntry,
  InfluenceWeight,
  BeliefUpdateContext,
  InfluenceContext,
  InfluenceType,
  InteractionGraph,
  AgentNode,
  InteractionEdge,
  DecisionTraceEntry,
  InfluenceRecord,
  CausalFactor,
  DecisionEvent,
  ConsensusEvent,
  EnhancedDecisionTraceEntry,
  DecisionTrace,
  DiscussionConfig,
  DiscussionResult,
  DiscussionStrategy,
  MemoryStrategy,
  BeliefUpdateStrategy,
  InfluenceStrategy,
  MessageTemplate,
  DiscussionTask,
  AgentState,
  InfluenceEvent,
  RoundData,
  FinalDecision,
  DiscussionData,
  StrategyConfig,
  StrategyFactory,
  DiscussionEventType,
  DiscussionEvent,
  EventTracker,
  AgentInfo,
} from "./discussion/types";

import type {
  GovernanceResult,
  GovernanceConfig,
  EchoChamberDetection,
  AuthorityBiasDetection,
  PolarizationDetection,
  PrematureConsensusDetection,
  GovernanceIssue,
  AgentBelief,
  MessageInfo,
  SeverityLevel,
  InterventionType,
  Intervention,
  InterventionStrategy,
  InterventionResult,
  GovernanceState,
} from "./governance/types";

import type {
  EvaluationResult,
  ConsensusMetric,
  ReliabilityMetric,
  DispersionMetric,
  StabilityMetric,
  InfluenceAnalysisMetric,
  AgentDecision,
  InteractionRound,
  EvaluationConfig,
  GroundTruth,
  ConsensusTrajectory,
  ConsensusRoundData,
  InfluencePath,
} from "./evaluation/types";

export type {
  AgentOpinion,
  RoundResult,
  DiscussionMemoryEntry,
  InfluenceWeight,
  BeliefUpdateContext,
  InfluenceContext,
  InfluenceType,
  InteractionGraph,
  AgentNode,
  InteractionEdge,
  DecisionTraceEntry,
  InfluenceRecord,
  CausalFactor,
  DecisionEvent,
  ConsensusEvent,
  EnhancedDecisionTraceEntry,
  DecisionTrace,
  DiscussionConfig,
  DiscussionResult,
  DiscussionStrategy,
  MemoryStrategy,
  BeliefUpdateStrategy,
  InfluenceStrategy,
  MessageTemplate,
  DiscussionTask,
  AgentState,
  InfluenceEvent,
  RoundData,
  FinalDecision,
  DiscussionData,
  StrategyConfig,
  StrategyFactory,
  DiscussionEventType,
  DiscussionEvent,
  EventTracker,
  AgentInfo,
  GovernanceResult,
  GovernanceConfig,
  EchoChamberDetection,
  AuthorityBiasDetection,
  PolarizationDetection,
  PrematureConsensusDetection,
  GovernanceIssue,
  AgentBelief,
  MessageInfo,
  SeverityLevel,
  InterventionType,
  Intervention,
  InterventionStrategy,
  InterventionResult,
  GovernanceState,
  EvaluationResult,
  ConsensusMetric,
  ReliabilityMetric,
  DispersionMetric,
  StabilityMetric,
  InfluenceAnalysisMetric,
  AgentDecision,
  InteractionRound,
  EvaluationConfig,
  GroundTruth,
  ConsensusTrajectory,
  ConsensusRoundData,
  InfluencePath,
};

export interface UnifiedAgent {
  id: string;
  name: string;
  role: string;
  type: string;
  belief: number;
  confidence: number;
  opinion: string;
  config?: Record<string, unknown>;
}

export interface UnifiedDecision {
  decision: string;
  belief: number;
  confidence: number;
  reasoning: string;
  agentContributions: Record<string, number>;
  timestamp: string;
}

export interface UnifiedRound {
  roundNumber: number;
  timestamp: string;
  opinions: UnifiedAgent[];
  beliefChanges: Record<string, { old: number; new: number; reason: string }>;
  influenceEvents: InfluenceEvent[];
  governanceIssues: GovernanceIssue[];
  interventions: Intervention[];
  converged: boolean;
}

export interface ExperimentResult {
  experimentId: string;
  task: DiscussionTask;
  config: DiscussionConfig;
  rounds: UnifiedRound[];
  interactionGraph: InteractionGraph;
  decisionTrace: DecisionTrace;
  finalDecision: UnifiedDecision;
  evaluation: EvaluationResult;
  governance: GovernanceResult;
  metadata: {
    startTime: string;
    endTime: string;
    totalRounds: number;
    converged: boolean;
    elapsedMs: number;
  };
}

export interface MetricValue {
  name: string;
  value: number;
  unit?: string;
  timestamp: string;
  roundNumber?: number;
}

export interface ExperimentLog {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  context?: Record<string, unknown>;
}

export interface StrategyDescriptor {
  name: string;
  type: "belief_update" | "influence" | "memory" | "intervention";
  description: string;
  configSchema?: Record<string, unknown>;
}

export interface StrategyInfo {
  name: string;
  type: string;
  description: string;
  config?: Record<string, unknown>;
}

export interface Observation {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface ObservableComponent {
  on(event: string, callback: (observation: Observation) => void): void;
  off(event: string, callback: (observation: Observation) => void): void;
  emit(event: string, payload: Record<string, unknown>): void;
}