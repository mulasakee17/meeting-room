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
} from "./types";

class DefaultAgentPool implements AgentPool {
  agents: any[] = [];
  states: Map<string, any> = new Map();

  getAgent(id: string): any | undefined {
    return this.agents.find((agent) => agent.id === id);
  }

  getAllStates(): Map<string, any> {
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
    interactionGraph: { nodes: [], edges: [] } as any,
    decisionTrace: { entries: [] } as any,
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
    evaluation: {} as any,
    governance: {} as any,
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
      evaluationConfig: {} as any,
      governanceConfig: {} as any,
    });

    return this.fromExperiment(task, experiment);
  }

  static updateRound(context: RuntimeContext, roundNumber: number): void {
    context.round.current = roundNumber;
    context.round.startedAt = new Date().toISOString();
    context.round.endedAt = undefined;
    context.round.results = undefined;
  }

  static endRound(context: RuntimeContext, results?: any): void {
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

  static clone(context: RuntimeContext): RuntimeContext {
    return JSON.parse(JSON.stringify(context));
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
