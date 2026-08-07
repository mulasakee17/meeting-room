import type {
  BeliefContractRegistry,
  BeliefValue,
  EpistemicClaim,
  GovernanceEstimatorRegistry,
  LegacyQuantitySources,
  LegacySemanticTelemetry,
} from "../epistemic";

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

export interface ClaimEvidenceSubmission {
  content: string;
  relation: "supports" | "attacks";
}

/** Agent-authored payload. IDs, provenance and exposure are added by the runtime. */
export interface ClaimBeliefSubmission {
  claimId: string;
  value: BeliefValue;
  evidence: ClaimEvidenceSubmission[];
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
  /** 选项标签在解析边界完成规范化后的状态；未配置 canonicalOptions 时为 not_applicable。 */
  optionParseStatus?: "not_applicable" | "valid" | "incomplete" | "ambiguous" | "invalid";
  /** 未能唯一映射到规范选项的原始标签，供审计和 invalid-rate 统计。 */
  unmatchedOptionLabels?: string[];
  /** Explicit probabilities accepted only for task-registered claims. */
  claimReports?: ClaimBeliefSubmission[];
  /** Runtime-generated IDs; model-provided values are never trusted. */
  epistemicReportIds?: string[];
  claimParseStatus?: "not_applicable" | "valid" | "incomplete" | "invalid";
  /** Parser provenance for compatibility fields; not epistemic authority. */
  legacyQuantitySources?: LegacyQuantitySources;
  /** Observation-boundary projection of legacy fields into auditable telemetry. */
  legacyTelemetry?: LegacySemanticTelemetry[];
}

export interface RoundResult {
  roundNumber: number;
  opinions: AgentOpinion[];
  timestamp: string;
  /** 原始表面一致信号，可能被治理否决。 */
  surfaceConverged: boolean;
  /** 经治理检查后接受并真正导致 consensus termination 的共识。 */
  acceptedConsensus: boolean;
  /** @deprecated 使用 acceptedConsensus。保留旧字段避免历史消费者静默改义。 */
  converged: boolean;
  stopDecision?: RoundStopDecision;
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
  claimReports?: ClaimBeliefSubmission[];
  epistemicReportIds?: string[];
  legacyTelemetry?: LegacySemanticTelemetry[];
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
  /** Contract semantics are injected once and reused across reset boundaries. */
  epistemicContractRegistry?: BeliefContractRegistry;
  /** Versioned, snapshotted estimator semantics for reproducible governance projections. */
  governanceEstimatorRegistry?: GovernanceEstimatorRegistry;
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
   * E10: 确定性共享证据池（State-Centric Shared Evidence Pool）。
   *
   * enabled=true 时，NativeCognitiveEngine 把全局去重原子事实池
   * 以「他人已陈述的事实（结构化，已去重）」块注入 prompt。
   * 零额外 LLM 调用（全确定性：canonicalize + hash + Jaccard + 数值比较）。
   *
   * 设计要点：
   *  - dimension 按属主映射（hidden-profile 构造已知，同 idr_diffusion 碎片定义）
   *  - 池只收录 agent 实际输出的证据，不含私有知识（非全知黑板书）
   *  - 冲突只做可判定子集：同 (dimension, targetItem) 数值不同 → isContradicted
   */
  evidencePool?: {
    enabled: boolean;
    /** agentId → dimension 映射（任务相关） */
    dimensions?: Record<string, string>;
    /** Jaccard char-bigram 相似度阈值（近似重复判定，默认 0.75） */
    similarityThreshold?: number;
    /** buildView 字符预算（默认 800，约 480 token） */
    maxChars?: number;
  };
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
  /**
   * 声誉系统接口预留（未来工作，当前不实现具体逻辑）。
   *
   * 设计意图：agent 进入讨论框架前，由外部系统（如 AAMAS 2026 声誉系统）
   * 预先标定其身份声誉。声誉高（信誉高）的 agent 获得更多容错率，
   * 声誉低的 agent 触发 δ 阈值更严格。
   *
   * 与 SwarmAlpha 监测定位的关系：
   *  - 声誉系统是"先验身份评估"（进入框架前）
   *  - SwarmAlpha 是"运行时状态监测"（框架内每轮检测）
   *  - 两者完全互补：声誉调节容错率，δ 检测当前异常
   *
   * 当前实现：字段存在但 MeasurementLayer/NativeCognitiveEngine 不读取。
   * 未来实现方向：
   *  - reputation > 0.8 的 agent：δ 阈值 × 1.2（更多容错）
   *  - reputation < 0.3 的 agent：δ 阈值 × 0.8（更严格）
   *  - influenceWeights 初始化时按 reputation 加权（替代等权 DeGroot）
   */
  reputation?: Record<string, number>;
  /**
   * 终止策略。NativeCognitiveEngine 默认 fixed_rounds；RHT/RHTF 仅用于显式消融。
   * surface 表示允许经治理确认后的表面收敛提前终止。
   */
  terminationPolicy?: import("../thermodynamics/TerminationDecider").SyncTerminationPolicy;
}

export interface DiscussionResult {
  roundResults: RoundResult[];
  decisionTrace: DecisionTraceEntry[];
  interactionGraph: InteractionGraph;
  finalDecision: string;
  finalBeliefs: Record<string, number>;
  /** @deprecated 使用 acceptedConsensus。 */
  converged: boolean;
  acceptedConsensus: boolean;
  stopReason: RoundStopReason | "unknown";
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
  /** LLM 输出的 item/utility/evidence.supports 必须映射到这里的规范选项。 */
  canonicalOptions?: string[];
  /** 规范选项 → 预注册别名。只允许唯一匹配，不做位置猜测。 */
  optionAliases?: Record<string, string[]>;
  /** No probability semantics are inferred when this capability is absent. */
  epistemic?: {
    /** explicit_probability is the binary-only P1 compatibility mode. */
    reportingMode: "explicit_belief" | "explicit_probability";
    claims: EpistemicClaim[];
    requireAllClaims?: boolean;
  };
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
import type { TerminationDecision } from "../thermodynamics/TerminationDecider";

export type RoundStopReason =
  | "surface_convergence"
  | "thermo_termination"
  | "hard_cap"
  | "continue";

/**
 * 一轮完整提交后的终止仲裁结果。
 *
 * convergence / thermo 都只是候选信号；只有 finalizeRound 完成测量、治理和
 * 审计记录后，stopDecision 才能控制主循环退出。
 */
export interface RoundStopDecision {
  shouldStop: boolean;
  reason: RoundStopReason;
  candidates: {
    surfaceConverged: boolean;
    thermo?: TerminationDecision;
    hardCap: boolean;
  };
  /** 治理问题或已排队干预是否否决了本轮的提前终止候选。 */
  vetoedByGovernance: boolean;
  explanation: string;
}

/**
 * Declares which state transition is authoritative for a committed round.
 *
 * `legacy_inference` is the original scalar DeGroot/FJ-compatible path.
 * `explicit_report_projection` mirrors the agent's parsed report into the
 * scalar compatibility view without performing an additional hidden update.
 */
export type RoundStateAuthority =
  | "legacy_inference"
  | "explicit_report_projection";

export interface RoundStateCommit {
  authority: RoundStateAuthority;
  /** Agents whose compatibility state was committed in this round. */
  committedAgentIds: string[];
}

export interface RoundData {
  roundNumber: number;
  timestamp: string;
  opinions: AgentOpinion[];
  /** Auditable declaration of the transition that produced this round's state. */
  stateCommit: RoundStateCommit;
  epistemicCommit?: {
    evidenceCount: number;
    reportCount: number;
    exposureCount: number;
  };
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
  /** 原始表面一致信号，可能被 stopDecision 的治理否决覆盖。 */
  surfaceConverged: boolean;
  /** 最终被系统接受、且以共识原因终止的状态。 */
  acceptedConsensus: boolean;
  /** @deprecated 使用 acceptedConsensus。 */
  converged: boolean;
  /** 审计字段：干预效果度量（evaluateEffects 返回值，第三方验证用）。
   *  含 belief_diversity_change, consensus_level_change, intervention_success_rate 等 9 项指标。
   *  2026-07-23 新增：支持第三方独立验证治理决策的正确性 */
  effectMetrics?: Record<string, number>;
  /** 本轮热力学终止候选；仅支持该能力的引擎填充。 */
  terminationDecision?: TerminationDecision;
  /** 在本轮所有记录提交后作出的最终终止仲裁。 */
  stopDecision?: RoundStopDecision;
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
