export interface ItemBelief {
  item: string;
  rank: number;
  belief: number;
  confidence: number;
}

export interface AgentOpinion {
  agentId: string;
  reasoning: string;
  evidence: string[];
  belief: number;
  confidence: number;
  nextOpinion: string;
  referencedAgents: string[];
  /** Per-item preferences (V2). Optional for backward compatibility. */
  itemBeliefs?: ItemBelief[];
}

export interface RoundResult {
  roundNumber: number;
  opinions: AgentOpinion[];
  timestamp: string;
  converged: boolean;
}

export interface DiscussionMemoryEntry {
  roundNumber: number;
  agentId: string;
  reasoning: string;
  evidence: string[];
  belief: number;
  confidence: number;
  referencedAgents: string[];
  timestamp: string;
  /** Per-item preferences (V2). Optional for backward compatibility. */
  itemBeliefs?: ItemBelief[];
}

export interface InfluenceWeight {
  sourceAgentId: string;
  weight: number;
  type: InfluenceType;
}

export interface BeliefUpdateContext {
  agentId: string;
  currentBelief: number;
  currentConfidence: number;
  roundNumber: number;
  allOpinions: AgentOpinion[];
  memory: DiscussionMemoryEntry[];
  interactionGraph: InteractionGraph;
  influenceWeights: InfluenceWeight[];
}

export interface InfluenceContext {
  agentId: string;
  targetAgentId: string;
  influenceType: InfluenceType;
  sourceOpinion: AgentOpinion;
  targetOpinion: AgentOpinion;
  interactionGraph: InteractionGraph;
}

export type InfluenceType = "agreement" | "disagreement" | "reference" | "persuasion";

export interface InteractionGraph {
  nodes: AgentNode[];
  edges: InteractionEdge[];
}

export interface AgentNode {
  agentId: string;
  name: string;
  role: string;
  belief: number;
  confidence: number;
}

export interface InteractionEdge {
  source: string;
  target: string;
  type: InfluenceType;
  weight: number;
  round: number;
}

export interface DecisionTraceEntry {
  agentId: string;
  roundNumber: number;
  decision: string;
  belief: number;
  beliefChange: number;
  influencers: string[];
  reasoning: string;
  timestamp: string;
}

export interface InfluenceRecord {
  sourceAgentId: string;
  targetAgentId: string;
  type: InfluenceType;
  weight: number;
  round: number;
  timestamp: string;
  reasoning: string;
}

export interface InfluenceFactor {
  type: "agent_influence" | "evidence" | "external" | "self_reflection" | "discussion";
  sourceId?: string;
  description: string;
  weight: number;
}

export interface DecisionEvent {
  type: "initial_opinion" | "response" | "refutation" | "agreement" | "disagreement" | 
        "consensus" | "convergence" | "divergence" | "persuasion";
  agentId: string;
  roundNumber: number;
  timestamp: string;
  description: string;
  involvedAgents: string[];
}

export interface ConsensusEvent {
  roundNumber: number;
  timestamp: string;
  consensusLevel: number;
  agentsInAgreement: string[];
  agentsInDisagreement: string[];
  beliefStd: number;
  triggerDescription: string;
}

export interface EnhancedDecisionTraceEntry extends DecisionTraceEntry {
  beliefChangeReasons: InfluenceFactor[];
  confidence: number;
  confidenceChange: number;
  decisionType: "affirmative" | "negative" | "neutral" | "conditional";
  evidence: string[];
  influencesReceived: InfluenceRecord[];
  influencesExerted: InfluenceRecord[];
  referencedAgents: string[];
  referencedEvidence: string[];
  eventType: DecisionEvent["type"];
}

export interface DecisionTrace {
  entries: DecisionTraceEntry[];
  enhancedEntries: EnhancedDecisionTraceEntry[];
  consensusEvents: ConsensusEvent[];
  influenceGraph: InfluenceRecord[];
  beliefTrajectories: Record<string, { round: number; belief: number; confidence: number }[]>;
}

export interface DiscussionConfig {
  maxRounds: number;
  convergenceThreshold: number;
  beliefUpdateStrategy: string;
  influenceStrategy: string;
  memoryStrategy: string;
  /** Enable agent dropout for sensitivity analysis (default false) */
  enableDropoutAnalysis?: boolean;
  /**
   * 治理模式:
   * - "none": 不检测，不干预
   * - "detect-only": 只检测偏差，不干预
   * - "random-intervene": 不检测，随机施加干预
   * - "full": 检测 + 精准干预 (默认)
   */
  governanceMode?: "none" | "detect-only" | "random-intervene" | "full";
  /**
   * 启用对立阵营交叉质证 (默认 false)。
   * 当 Agent 信念分歧超过阈值时，自动分组正反方进行辩论。
   */
  enableCrossExamination?: boolean;
  /**
   * Governance engine configuration overrides.
   * Passed through to the internal GovernanceEngine constructor.
   * Enables single-intervention ablation: disable all detectors
   * except the target one.
   */
  governanceConfig?: Partial<import("../governance/types").GovernanceConfig>;
  /**
   * 可复现性 seed — 传入 GovernanceEngine 用于 introduce_diversity 等随机干预。
   * 不传时回退到 Math.random() (不可复现)。
   */
  seed?: number;
  /**
   * Agent grouping topology for scalable discussions.
   *
   * - FlatTopology (default):  all agents in one group — round-table, n≤10
   * - GroupedTopology(8):      fixed-size groups, reshuffled each round — n≤100
   * - CommitteeTopology(8):    groups → representatives → plenary — n≤500
   *
   * When unset or agents ≤ topology.maxGroupSize, the default flat
   * (all-agents) behavior is preserved exactly.
   */
  topology?: import("./topology").DiscussionTopology;
}

export interface DiscussionResult {
  roundResults: RoundResult[];
  decisionTrace: DecisionTraceEntry[];
  interactionGraph: InteractionGraph;
  finalDecision: string;
  finalBeliefs: Record<string, number>;
  converged: boolean;
  totalRounds: number;
}

export interface DiscussionStrategy {
  name: string;
}

export interface MemoryStrategy extends DiscussionStrategy {
  store(entry: DiscussionMemoryEntry): void;
  getByRound(roundNumber: number): DiscussionMemoryEntry[];
  getByAgent(agentId: string): DiscussionMemoryEntry[];
  getAll(): DiscussionMemoryEntry[];
  getRecent(n: number): DiscussionMemoryEntry[];
}

export interface BeliefUpdateStrategy extends DiscussionStrategy {
  update(context: BeliefUpdateContext): { belief: number; confidence: number };
}

export interface InfluenceStrategy extends DiscussionStrategy {
  compute(context: InfluenceContext): number;
  applyInfluences(agentId: string, allOpinions: AgentOpinion[], graph: InteractionGraph, roundNumber: number): void;
  applyAllInfluences(allOpinions: AgentOpinion[], graph: InteractionGraph, roundNumber: number): void;
}

export interface MessageTemplate {
  format(
    agentName: string,
    role: string,
    task: string,
    memory: DiscussionMemoryEntry[],
    roundNumber: number,
    maxRounds: number
  ): string;
}

export interface DiscussionTask {
  id: string;
  description: string;
  type: string;
  createdAt: string;
  content: string | Record<string, unknown>;
  context?: string;
}

export interface AgentState {
  agentId: string;
  belief: number;
  confidence: number;
  opinion: string;
}

export interface InfluenceEvent {
  sourceAgentId: string;
  targetAgentId: string;
  type: InfluenceType;
  weight: number;
  round: number;
  timestamp: string;
}

import type { GovernanceIssue, Intervention } from "../governance/types";

export interface RoundData {
  roundNumber: number;
  timestamp: string;
  opinions: AgentOpinion[];
  beliefChanges: Record<string, { old: number; new: number; reason: string }>;
  /** Per-utterance 信念快照（asyncEngine 逐发言者处理时填充，质量因子验证用） */
  perUtteranceSnapshots?: Array<{
    speakerId: string;
    belief: number;
    confidence: number;
    referencedAgents: string[];
    beliefsBefore: Record<string, { belief: number; confidence: number }>;
    beliefsAfter: Record<string, { belief: number; confidence: number }>;
  }>;
  influenceEvents: InfluenceEvent[];
  governanceIssues: GovernanceIssue[];
  interventions: Intervention[];
  converged: boolean;
}

export interface FinalDecision {
  decision: string;
  belief: number;
  confidence: number;
  reasoning: string;
  agentContributions: Record<string, number>;
}

export interface DiscussionData {
  task: DiscussionTask;
  config: DiscussionConfig;
  agents: AgentInfo[];
  rounds: RoundData[];
  interactionGraph: InteractionGraph;
  decisionTrace: DecisionTrace;
  finalDecision: FinalDecision;
  metadata: {
    startTime: string;
    endTime: string;
    totalRounds: number;
    converged: boolean;
  };
}

export interface StrategyConfig {
  strategyName: string;
  params?: Record<string, unknown>;
}

export interface StrategyFactory<T extends DiscussionStrategy> {
  create(config?: StrategyConfig): T;
}

export type DiscussionEventType = 
  | "round_start" 
  | "round_end" 
  | "agent_message" 
  | "belief_update" 
  | "influence_event"
  | "governance_issue"
  | "intervention"
  | "convergence"
  | "decision";

export interface DiscussionEvent {
  type: DiscussionEventType;
  timestamp: string;
  roundNumber: number;
  payload: Record<string, unknown>;
}

export interface EventTracker {
  track(event: DiscussionEvent): void;
  getEvents(type?: DiscussionEventType): DiscussionEvent[];
  getEventsByRound(roundNumber: number): DiscussionEvent[];
  subscribe(callback: (event: DiscussionEvent) => void): () => void;
}

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  type: string;
  config?: Record<string, unknown>;
}

// ============================================================================
// Backward-compatible aliases (deprecated — remove in v3.0)
// ============================================================================

/** @deprecated Use {@link InfluenceFactor}. Removed in v3.0. */
export type CausalFactor = InfluenceFactor;
