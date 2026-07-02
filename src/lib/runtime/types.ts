import type {
  InteractionGraph,
  DecisionTrace,
  AgentOpinion,
  DiscussionTask,
  DiscussionConfig,
  AgentState,
} from "../discussion/types";

import type {
  EvaluationResult,
  EvaluationConfig,
  AgentDecision,
  InteractionRound,
} from "../evaluation/types";

import type {
  GovernanceResult,
  GovernanceConfig,
  GovernanceIssue,
  Intervention,
  AgentBelief,
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

export interface RuntimeEvent {
  id: string;
  type: string;
  timestamp: string;
  roundNumber?: number;
  payload: Record<string, unknown>;
  source: string;
}

export type EventHandler = (event: RuntimeEvent) => void | Promise<void>;

export interface Subscription {
  id: string;
  eventType: string;
  unsubscribe(): void;
}

export interface EventBus {
  publish(event: RuntimeEvent): void;
  subscribe(eventType: string, handler: EventHandler): Subscription;
  unsubscribe(subscription: Subscription): void;
  getEvents(type?: string): RuntimeEvent[];
  clear(): void;
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

export interface TerminationDecision {
  shouldTerminate: boolean;
  reason: string;
  conditionType: TerminationType;
  metrics: Record<string, number>;
}

export interface TerminationStrategy {
  check(context: RuntimeContext): TerminationDecision;
  getType(): TerminationType;
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

export interface ResearchReport {
  experimentId: string;
  taskId: string;
  generatedAt: string;
  metadata: ReportMetadata;
  sections: ReportSection[];
  summary: ReportSummary;
  rawData: RawDataReference;
}

export interface ReportMetadata {
  title: string;
  description: string;
  author?: string;
  createdAt: string;
  completedAt: string;
  totalRounds: number;
  agentCount: number;
  converged: boolean;
  terminationReason: string;
}

export type ReportSectionType =
  | "discussion_summary"
  | "opinion_evolution"
  | "evidence_evolution"
  | "influence_graph"
  | "conflict_timeline"
  | "consensus_evolution"
  | "evaluation_metrics"
  | "governance_actions"
  | "final_decision"
  | "experiment_metadata"
  | "future_work";

export interface ReportSection {
  id: string;
  title: string;
  type: ReportSectionType;
  content: SectionContent;
  timestamp: string;
}

export interface SectionContent {
  text?: string;
  data?: Record<string, unknown>;
  charts?: ChartData[];
  tables?: TableData[];
}

export interface ChartData {
  type: "line" | "bar" | "scatter" | "network" | "timeline";
  title: string;
  data: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface TableData {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface ReportSummary {
  finalDecision: string;
  consensusLevel: number;
  confidence: number;
  keyFindings: string[];
  limitations: string[];
  recommendations: string[];
}

export interface RawDataReference {
  trace: string;
  graph: string;
  metrics: string;
  events: string;
}

export interface Plugin {
  name: string;
  type: string;
}

export interface EvaluationStrategy extends Plugin {
  type: "evaluation";
  evaluate(context: RuntimeContext): EvaluationMetric;
  getWeight(): number;
}

export interface EvaluationMetric {
  name: string;
  score: number;
  details?: string;
  dimensions?: Record<string, number>;
}

export interface AgentAdapter extends Plugin {
  type: "agent";
  createAgent(config: AgentConfig): Promise<DiscussionAgent>;
  adaptToDiscussionAgent(rawAgent: unknown): DiscussionAgent;
}

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  type: string;
  config?: Record<string, unknown>;
}

export interface VisualizationPlugin extends Plugin {
  type: "visualization";
  visualizationType: "chart" | "graph" | "timeline" | "heatmap";
  render(context: RuntimeContext): VisualizationData;
}

export interface VisualizationData {
  type: string;
  title: string;
  data: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface ResearchPlugin extends Plugin {
  type: "research";
  researchType: "analysis" | "transformation" | "export";
  execute(context: RuntimeContext): ResearchResult;
}

export interface ResearchResult {
  name: string;
  type: string;
  data: Record<string, unknown>;
  summary?: string;
}

export interface PluginRegistry {
  register(type: string, plugin: Plugin): void;
  get(type: string, name: string): Plugin | undefined;
  getAll(type: string): Plugin[];
  unregister(type: string, name: string): void;
  has(type: string, name: string): boolean;
}

export interface ScheduledTask {
  id: string;
  type: "discussion" | "evaluation" | "governance" | "report";
  priority: "high" | "medium" | "low";
  dependencies: string[];
  payload: Record<string, unknown>;
}

export interface SchedulerStatus {
  currentState: RuntimeState;
  currentRound: number;
  queuedTasks: number;
  runningTask?: string;
  startTime: string;
  elapsedMs: number;
}

export interface ExperimentResult {
  experiment: Experiment;
  report: ResearchReport;
  context: RuntimeContext;
}

export interface ResearchRuntime {
  submitTask(task: TaskRequest): Promise<Task>;
  createExperiment(taskId: string, config: ExperimentConfig): Promise<Experiment>;
  startExperiment(experimentId: string): Promise<ExperimentResult>;
  pauseExperiment(experimentId: string): Promise<void>;
  resumeExperiment(experimentId: string): Promise<void>;
  stopExperiment(experimentId: string): Promise<void>;
  getExperimentStatus(experimentId: string): Promise<ExperimentStatus>;
  generateReport(experimentId: string): Promise<ResearchReport>;
  getEventBus(): EventBus;
  getContext(experimentId: string): RuntimeContext | undefined;
  getPluginRegistry(): PluginRegistry;
}

export interface ExperimentStatus {
  experimentId: string;
  status: RuntimeState;
  currentRound: number;
  maxRounds: number;
  startTime: string;
  elapsedMs: number;
  metadata: Record<string, unknown>;
}


