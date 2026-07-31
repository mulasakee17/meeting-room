export interface ItemBelief {
  item: string;
  rank: number;
  belief: number;
  confidence: number;
}

/**
 * v3.2.1: 结构化 evidence 项——LLM 直接声明证据支持的选项和强度。
 *
 * 前沿经验：Structured Outputs（JSON Schema mode）优于 free text + post-hoc parsing。
 * 旧格式 evidence: string[] 需要 extractEvidenceItems 用 includes 启发式归类，
 * 无关键词时回退到 top-ranked（噪声源）。新格式由 LLM 直接声明 supports/strength，
 * 消除归类噪声。
 *
 * 后向兼容：旧数据仍用 string[]，新数据同时填充 evidence（string[]）和 structuredEvidence。
 */
export interface StructuredEvidenceItem {
  /** 证据文本内容 */
  content: string;
  /** 此证据支持的选项 ID（与 itemBeliefs.item 对齐） */
  supports: string;
  /** 证据强度 [0, 1]——LLM 自评此证据对所支持选项的支持程度 */
  strength: number;
}

/**
 * LLM 原生输出的认知状态（v3.1 Native Cognitive Model）。
 *
 * 与旧模型的关键区别：这些值由 LLM 直接自省输出，而非系统从 belief 反推。
 * - utility: 对每个选项的偏好强度 [-1, 1]
 * - evidenceCoverage: 自评信息覆盖度 [0, 1]
 * - evidenceQuality: 自评信息质量 [0, 1]
 *
 * Inertia 和 Susceptibility 由系统跨轮次计算，不在此结构中。
 */
export interface NativeCognitiveOutput {
  utility: Record<string, number>;
  evidenceCoverage: number;
  evidenceQuality: number;
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
  /** LLM 原生输出的认知状态（v3.1）。仅 native_cognitive 模式填充。 */
  cognitiveState?: NativeCognitiveOutput;
  /** v3.2.1: 结构化 evidence——LLM 直接声明 supports/strength，消除启发式归类噪声。
   *  与 evidence 字段并存：evidence 保留 content 字符串数组（后向兼容），
   *  structuredEvidence 额外提供 supports/strength（新格式）。
   *  extractEvidenceItems 优先使用 structuredEvidence，无则回退到 evidence 启发式。 */
  structuredEvidence?: StructuredEvidenceItem[];
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
  governanceMode?: "none" | "detect-only" | "random-intervene" | "full" | "cognitive";
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
  /** 可复现性 seed — 传入 GovernanceEngine 用于 introduce_diversity 等随机干预。
   * 不传时回退到 Math.random() (不可复现)。 */
  seed?: number;
  /**
   * 启用 v3.0 Cognitive State Space 模型（Phase 2 验证）。
   *
   * 当为 true 时，DiscussionEngine 在每轮 belief 更新后额外运行
   * cognitive state 更新（Utility / Evidence / Inertia / Confidence）。
   * LLM prompt 不变，cognitive state 从已有输出中 post-hoc 计算。
   *
   * 默认 false（使用旧 scalar belief 模型）。
   */
  useCognitiveState?: boolean;
  /**
   * Phase 4B: 启用认知状态驱动的治理（Cognitive State Driven Governance）。
   *
   * 当为 true 时，NativeCognitiveEngine.applyGovernance() 使用认知检测器
   * 和认知干预，而非旧 belief-based 治理。要求 useCognitiveState=true
   * 且 runtimeMode 为 native_cognitive。
   *
   * 默认 false（使用旧 belief-based governance）。
   */
  useCognitiveGovernance?: boolean;
  /**
   * v6: 启用 SemanticTool 异步治理路径。
   *
   * 当为 true 且 useCognitiveGovernance=true 时，认知治理使用
   * diagnoseAndSuggest()（async，Tier 1→2→3）而非 diagnoseAndSuggestSync()。
   * 启用后：
   *   - Layer 2 evidence 语义去重（SemanticTool evidence_dedup）
   *   - gap_analysis（从未分享证据中识别关键信息）
   *   - intervention_generation（上下文感知干预文本）
   *
   * 需要 llmConfig（通过 governanceConfig.llmConfig 传入）。
   * 默认 false（纯数学路径，零 LLM 成本）。
   */
  useSemanticTool?: boolean;
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
  /** 审计字段：干预效果度量（evaluateEffects 返回值，第三方验证用）。
   *  含 belief_diversity_change, consensus_level_change, intervention_success_rate 等 9 项指标。
   *  2026-07-23 新增：支持第三方独立验证治理决策的正确性 */
  effectMetrics?: Record<string, number>;
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
