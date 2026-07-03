import type {
  RuntimeContext,
  Experiment,
  Session,
  Task,
  RoundContext,
  CollectiveDecisionState,
  RuntimeMetrics,
  GovernanceContext,
  AgentPool,
  RuntimeConfig,
  TimelineEntry,
  ResearchArtifact,
  ExperimentConfig,
  StateSnapshot,
  DiscussionAgent,
  RoundResult,
} from "./types";
import type { AgentState } from "../discussion/types";
import type { InteractionGraph, DecisionTrace } from "../discussion/types";
import type { EvaluationConfig } from "../evaluation/types";
import type { GovernanceConfig } from "../governance/types";

class DefaultAgentPool implements AgentPool {
  agents: DiscussionAgent[] = [];
  states: Map<string, AgentState> = new Map();

  getAgent(id: string): DiscussionAgent | undefined {
    return this.agents.find((agent) => agent.id === id);
  }

  getAllStates(): Map<string, AgentState> {
    return this.states;
  }
}

function createDefaultExperiment(config: ExperimentConfig): Experiment {
  return {
    id: `experiment-${Date.now()}`,
    taskId: "",
    config,
    status: "created",
    createdAt: new Date().toISOString(),
  };
}

function createDefaultSession(experimentId: string): Session {
  return {
    id: `session-${Date.now()}`,
    experimentId,
    runtimeContext: {} as RuntimeContext,
    status: "initialized",
    startTime: new Date().toISOString(),
  };
}

function createDefaultRoundContext(maxRounds: number): RoundContext {
  return {
    current: 0,
    max: maxRounds,
    startedAt: new Date().toISOString(),
  };
}

function createDefaultState(): CollectiveDecisionState {
  return {
    agentStates: new Map(),
    interactionGraph: { nodes: [], edges: [] } as InteractionGraph,
    decisionTrace: { entries: [], enhancedEntries: [], consensusEvents: [], influenceGraph: [], beliefTrajectories: {} } as DecisionTrace,
    beliefTrajectories: {},
  };
}

function createDefaultMetrics(): RuntimeMetrics {
  return {
    evaluation: null,
    previousEvaluation: null,
    delta: {},
    history: [],
  };
}

function createDefaultGovernanceContext(): GovernanceContext {
  return {
    issues: [],
    interventions: [],
    appliedInterventions: [],
    status: "clean",
  };
}

function createDefaultConfig(): RuntimeConfig {
  return {
    termination: { conditions: [], strategy: "any" },
    evaluation: {} as EvaluationConfig,
    governance: {} as GovernanceConfig,
  };
}

function createDefaultArtifact(): ResearchArtifact {
  return {
    experimentId: "",
    task: {} as Task,
    config: {} as ExperimentConfig,
    snapshots: {
      rounds: [],
      states: [],
      evaluations: [],
      governances: [],
      decisions: [],
    },
    timeline: [],
    metadata: {
      startTime: new Date().toISOString(),
      endTime: "",
      totalRounds: 0,
      converged: false,
      elapsedMs: 0,
    },
    terminationReason: "",
  };
}

function createDefaultTask(config?: { description?: string; type?: string }): Task {
  return {
    id: `task-${Date.now()}`,
    description: config?.description || "",
    type: config?.type || "discussion",
    content: "",
    status: "submitted",
    createdAt: new Date().toISOString(),
    metadata: {},
  };
}

export class RuntimeContextManager {
  static create(
    task: Task,
    experiment: Experiment,
    session: Session,
    config: RuntimeConfig
  ): RuntimeContext {
    return {
      experiment,
      session,
      task,
      round: createDefaultRoundContext(experiment.config.maxRounds),
      state: createDefaultState(),
      metrics: createDefaultMetrics(),
      governance: createDefaultGovernanceContext(),
      agents: new DefaultAgentPool(),
      config,
      timeline: [],
      artifact: createDefaultArtifact(),
    };
  }

  static fromExperiment(task: Task, experiment: Experiment): RuntimeContext {
    const session = createDefaultSession(experiment.id);
    const config: RuntimeConfig = {
      termination: { conditions: [], strategy: "any" },
      evaluation: experiment.config.evaluationConfig,
      governance: experiment.config.governanceConfig,
    };

    const context = this.create(task, experiment, session, config);
    context.session.runtimeContext = context;
    context.artifact.experimentId = experiment.id;
    context.artifact.task = task;
    context.artifact.config = experiment.config;
    context.artifact.metadata.startTime = new Date().toISOString();

    return context;
  }

  static createEmpty(): RuntimeContext {
    const task = createDefaultTask();
    const experiment = createDefaultExperiment({
      maxRounds: 10,
      agentCount: 3,
      agentTypes: [],
      beliefUpdateStrategy: "",
      influenceStrategy: "",
      memoryStrategy: "",
      terminationConditions: [],
      evaluationConfig: {} as EvaluationConfig,
      governanceConfig: {} as GovernanceConfig,
    });

    return this.fromExperiment(task, experiment);
  }

  static updateRound(context: RuntimeContext, roundNumber: number): void {
    context.round.current = roundNumber;
    context.round.startedAt = new Date().toISOString();
    context.round.endedAt = undefined;
    context.round.results = undefined;
  }

  static endRound(context: RuntimeContext, results?: RoundResult): void {
    context.round.endedAt = new Date().toISOString();
    if (results) {
      context.round.results = results;
    }
  }

  static addTimelineEntry(context: RuntimeContext, entry: Omit<TimelineEntry, "timestamp">): void {
    context.timeline.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
  }

  static freeze(context: RuntimeContext): Readonly<RuntimeContext> {
    return Object.freeze(context);
  }

  /**
   * Deep clone a RuntimeContext, correctly preserving Map objects and handling
   * the circular reference between session.runtimeContext and the root context.
   *
   * JSON.parse(JSON.stringify(...)) silently drops all Map entries (they
   * serialize as {}), corrupting agentStates, beliefTrajectories, and the
   * AgentPool states Map.  This implementation clones every Map field
   * explicitly so snapshots and state diffs work correctly.
   */
  static clone(context: RuntimeContext): RuntimeContext {
    // ---- leaf-level helpers ------------------------------------------------
    const cloneMap = <K, V>(source: Map<K, V> | undefined): Map<K, V> => {
      if (!source) return new Map();
      return new Map(source);
    };

    // ---- CollectiveDecisionState ------------------------------------------
    const cloneState = (state: CollectiveDecisionState): CollectiveDecisionState => ({
      agentStates: cloneMap(state.agentStates),
      interactionGraph: structuredClone(state.interactionGraph),
      decisionTrace: structuredClone(state.decisionTrace),
      beliefTrajectories: structuredClone(state.beliefTrajectories),
    });

    // ---- RuntimeMetrics ---------------------------------------------------
    const cloneMetrics = (metrics: RuntimeMetrics): RuntimeMetrics => ({
      evaluation: metrics.evaluation ? structuredClone(metrics.evaluation) : null,
      previousEvaluation: metrics.previousEvaluation
        ? structuredClone(metrics.previousEvaluation)
        : null,
      delta: { ...metrics.delta },
      history: structuredClone(metrics.history),
    });

    // ---- AgentPool --------------------------------------------------------
    const cloneAgentPool = (pool: AgentPool): AgentPool => ({
      agents: structuredClone(pool.agents),
      states: cloneMap(pool.states),
      getAgent: pool.getAgent,   // function reference is safe to share
      getAllStates: pool.getAllStates,
    });

    // ---- Session (break the circular reference) ---------------------------
    const cloneSession = (session: Session): Session => ({
      ...structuredClone(session),
      runtimeContext: undefined as unknown as RuntimeContext, // patched below
    });

    // ---- Experiment, Task, Round, Config, Timeline, Artifact --------------
    const cloneExperiment = (e: Experiment): Experiment => structuredClone(e);
    const cloneTask = (t: Task): Task => structuredClone(t);
    const cloneRound = (r: RoundContext): RoundContext => structuredClone(r);
    const cloneConfig = (c: RuntimeConfig): RuntimeConfig => structuredClone(c);
    const cloneGovernance = (g: GovernanceContext): GovernanceContext => structuredClone(g);
    const cloneArtifact = (a: ResearchArtifact): ResearchArtifact => {
      const cloned: ResearchArtifact = {
        ...structuredClone(a),
        snapshots: {
          rounds: a.snapshots.rounds.map(r => {
            // StateSnapshot has a Map field that structuredClone handles
            // natively in modern runtimes; if not available we fall back
            if (typeof structuredClone === "function") {
              return {
                ...structuredClone(r),
                // structuredClone handles Maps since Node 17+
              };
            }
            return JSON.parse(JSON.stringify(r)); // fallback for older runtimes
          }),
          states: a.snapshots.states.map(s => {
            const cloned: StateSnapshot = {
              ...s,
              agentStates: cloneMap(s.agentStates),
              interactionGraph: structuredClone(s.interactionGraph),
              beliefTrajectories: structuredClone(s.beliefTrajectories),
              decisionTrace: structuredClone(s.decisionTrace),
            };
            return cloned;
          }),
          evaluations: structuredClone(a.snapshots.evaluations),
          governances: structuredClone(a.snapshots.governances),
          decisions: structuredClone(a.snapshots.decisions),
        },
      };
      return cloned;
    };

    // ---- assemble the cloned context --------------------------------------
    const clonedSession = cloneSession(context.session);
    const clonedAgents = cloneAgentPool(context.agents);

    const cloned: RuntimeContext = {
      experiment: cloneExperiment(context.experiment),
      session: clonedSession,
      task: cloneTask(context.task),
      round: cloneRound(context.round),
      state: cloneState(context.state),
      metrics: cloneMetrics(context.metrics),
      governance: cloneGovernance(context.governance),
      agents: clonedAgents,
      config: cloneConfig(context.config),
      timeline: structuredClone(context.timeline),
      artifact: cloneArtifact(context.artifact),
    };

    // Restore the circular reference on the clone
    clonedSession.runtimeContext = cloned;

    return cloned;
  }
}

export {
  createDefaultExperiment,
  createDefaultSession,
  createDefaultRoundContext,
  createDefaultState,
  createDefaultMetrics,
  createDefaultGovernanceContext,
  createDefaultConfig,
  createDefaultArtifact,
  createDefaultTask,
  DefaultAgentPool,
};
