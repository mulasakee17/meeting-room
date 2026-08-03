/**
 * Discussion 模块类型定义（原 src/lib/runtime/types.ts，2026-08-03 重命名）
 *
 * 服务对象：discussion / inference / observation 三个模块共享的类型。
 * 仅包含从以下在用类型可达的定义：
 *   - RuntimeContext         (discussion/index.ts, inference/index.ts, observation/index.ts)
 *   - CollectiveDecisionState (discussion/index.ts, inference/types.ts, inference/index.ts)
 *   - ExperimentConfig        (discussion/index.ts，作为桩类型使用)
 *
 * 2026-08-03 清理：删除 v1/v2 架构遗留的孤儿类型（零外部引用）——
 * Plugin 系、EventBus、TerminationStrategy、ResearchReport、Scheduler、
 * ResearchRuntime、ExperimentStatus 等（原文件 514 行 → 现 300 行）。
 * 对应实现模块（researchRuntime/scheduler/context/eventBus/adapters/termination）
 * 已在重构中移除。当前生产路径：src/runtime/GovernanceRuntime.ts + src/lib/pipeline.ts。
 *
 * 命名区分：本目录（discussion-types）是类型定义；src/runtime/ 是治理运行时实现。
 */
import type {
  InteractionGraph,
  DecisionTrace,
  AgentOpinion,
  AgentState,
} from "../discussion/types";

import type {
  EvaluationResult,
  EvaluationConfig,
} from "../evaluation/types";

import type {
  GovernanceResult,
  GovernanceConfig,
  GovernanceIssue,
  Intervention,
} from "../governance/types";

export type RuntimeState =
  | "idle"
  | "preparing"
  | "running"
  | "evaluating"
  | "governed"
  | "checking_termination"
  | "completed"
  | "failed";

export interface TaskRequest {
  description: string;
  type: string;
  content: string | Record<string, unknown>;
  context?: string;
  config?: ExperimentConfig;
}

export interface Task {
  id: string;
  description: string;
  type: string;
  content: string | Record<string, unknown>;
  context?: string;
  status: "submitted" | "processing" | "completed" | "failed";
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface ExperimentConfig {
  maxRounds: number;
  agentCount: number;
  agentTypes: string[];
  beliefUpdateStrategy: string;
  influenceStrategy: string;
  memoryStrategy: string;
  terminationConditions: TerminationCondition[];
  evaluationConfig: EvaluationConfig;
  governanceConfig: GovernanceConfig;
}

export interface Experiment {
  id: string;
  taskId: string;
  config: ExperimentConfig;
  status: "created" | "running" | "completed" | "failed";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface Session {
  id: string;
  experimentId: string;
  runtimeContext: RuntimeContext;
  status: "initialized" | "running" | "completed" | "failed";
  startTime: string;
}

export interface RoundContext {
  current: number;
  max: number;
  startedAt: string;
  endedAt?: string;
  results?: RoundResult;
}

export interface RoundResult {
  roundNumber: number;
  opinions: AgentOpinion[];
  timestamp: string;
  converged: boolean;
}

export interface RuntimeMetrics {
  evaluation: EvaluationResult | null;
  previousEvaluation: EvaluationResult | null;
  delta: Record<string, number>;
  history: MetricHistory[];
}

export interface MetricHistory {
  roundNumber: number;
  timestamp: string;
  evaluation: EvaluationResult;
}

export interface GovernanceContext {
  issues: GovernanceIssue[];
  interventions: Intervention[];
  appliedInterventions: Intervention[];
  status: "clean" | "warning" | "critical";
}

export interface AgentPool {
  agents: DiscussionAgent[];
  states: Map<string, AgentState>;
  getAgent(id: string): DiscussionAgent | undefined;
  getAllStates(): Map<string, AgentState>;
}

export interface DiscussionAgent {
  id: string;
  name: string;
  role: string;
  type: string;
  sendMessage(message: string): Promise<string>;
  getState(): { belief: number; confidence: number };
  setState(state: { belief: number; confidence: number }): void;
}

export interface TimelineEntry {
  timestamp: string;
  roundNumber: number;
  eventType: string;
  description: string;
  payload?: Record<string, unknown>;
}

export interface CollectiveDecisionState {
  agentStates: Map<string, AgentState>;
  interactionGraph: InteractionGraph;
  decisionTrace: DecisionTrace;
  beliefTrajectories: Record<string, { round: number; belief: number; confidence: number }[]>;
}

export interface RuntimeConfig {
  termination: TerminationConfig;
  evaluation: EvaluationConfig;
  governance: GovernanceConfig;
}

export interface RuntimeContext {
  experiment: Experiment;
  session: Session;
  task: Task;
  round: RoundContext;
  state: CollectiveDecisionState;
  metrics: RuntimeMetrics;
  governance: GovernanceContext;
  agents: AgentPool;
  config: RuntimeConfig;
  timeline: TimelineEntry[];
  artifact: ResearchArtifact;
}

export type TerminationType =
  | "maximum_rounds"
  | "consensus_stable"
  | "no_state_change"
  | "confidence_converged"
  | "governance_limit"
  | "experiment_timeout"
  | "manual_stop"
  | "custom";

export interface TerminationCondition {
  type: TerminationType;
  enabled: boolean;
  params: Record<string, unknown>;
  priority: "hard" | "soft";
}

export interface TerminationConfig {
  conditions: TerminationCondition[];
  strategy: "any" | "all";
}

export interface RoundSnapshot {
  roundNumber: number;
  timestamp: string;
  opinions: AgentOpinion[];
  beliefChanges: Record<string, { old: number; new: number; reason: string }>;
  influenceEvents: InfluenceEvent[];
  converged: boolean;
}

export interface InfluenceEvent {
  sourceAgentId: string;
  targetAgentId: string;
  type: string;
  weight: number;
  round: number;
  timestamp: string;
}

export interface StateSnapshot {
  roundNumber: number;
  timestamp: string;
  agentStates: Map<string, AgentState>;
  interactionGraph: InteractionGraph;
  beliefTrajectories: Record<string, { round: number; belief: number; confidence: number }[]>;
  decisionTrace: DecisionTrace;
}

export interface EvaluationSnapshot {
  roundNumber: number;
  timestamp: string;
  evaluationResult: EvaluationResult;
  metricsDelta: Record<string, number>;
  grade: "excellent" | "good" | "fair" | "poor" | "critical";
}

export interface GovernanceSnapshot {
  roundNumber: number;
  timestamp: string;
  issues: GovernanceIssue[];
  interventions: Intervention[];
  appliedInterventions: Intervention[];
  effectMetrics: Record<string, number>;
}

export interface DecisionSnapshot {
  roundNumber: number;
  timestamp: string;
  finalDecision: string;
  consensusLevel: number;
  avgBelief: number;
  avgConfidence: number;
}

export interface ResearchArtifact {
  experimentId: string;
  task: Task;
  config: ExperimentConfig;
  snapshots: {
    rounds: RoundSnapshot[];
    states: StateSnapshot[];
    evaluations: EvaluationSnapshot[];
    governances: GovernanceSnapshot[];
    decisions: DecisionSnapshot[];
  };
  timeline: TimelineEntry[];
  metadata: {
    startTime: string;
    endTime: string;
    totalRounds: number;
    converged: boolean;
    elapsedMs: number;
  };
  terminationReason: string;
}
