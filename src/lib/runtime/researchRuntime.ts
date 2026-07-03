import type {
  TaskRequest,
  Task,
  ExperimentConfig,
  Experiment,
  ExperimentResult,
  ResearchRuntime,
  ExperimentStatus,
  RuntimeContext,
  RuntimeState,
  Plugin,
  PluginRegistry,
  EventBus,
  ResearchReport,
} from "./types";

import { RuntimeContextManager } from "./context";
import { RuntimeEventBus } from "./eventBus";
import { TerminationChecker } from "./termination";
import { RuntimeScheduler } from "./scheduler";

class SimplePluginRegistry implements PluginRegistry {
  private plugins: Map<string, Map<string, Plugin>> = new Map();

  register(type: string, plugin: Plugin): void {
    if (!this.plugins.has(type)) {
      this.plugins.set(type, new Map());
    }
    this.plugins.get(type)!.set(plugin.name, plugin);
  }

  get(type: string, name: string): Plugin | undefined {
    return this.plugins.get(type)?.get(name);
  }

  getAll(type: string): Plugin[] {
    return Array.from(this.plugins.get(type)?.values() || []);
  }

  unregister(type: string, name: string): void {
    this.plugins.get(type)?.delete(name);
  }

  has(type: string, name: string): boolean {
    return this.plugins.get(type)?.has(name) ?? false;
  }
}

export class SwarmAlphaRuntime implements ResearchRuntime {
  private experiments: Map<string, Experiment> = new Map();
  private tasks: Map<string, Task> = new Map();
  private contexts: Map<string, RuntimeContext> = new Map();
  private schedulers: Map<string, RuntimeScheduler> = new Map();
  private eventBus: RuntimeEventBus = new RuntimeEventBus();
  private pluginRegistry: PluginRegistry = new SimplePluginRegistry();

  submitTask(task: TaskRequest): Promise<Task> {
    const newTask: Task = {
      id: `task-${Date.now()}`,
      description: task.description,
      type: task.type,
      content: task.content,
      context: task.context,
      status: "submitted",
      createdAt: new Date().toISOString(),
      metadata: {},
    };

    this.tasks.set(newTask.id, newTask);
    return Promise.resolve(newTask);
  }

  createExperiment(taskId: string, config: ExperimentConfig): Promise<Experiment> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const experiment: Experiment = {
      id: `experiment-${Date.now()}`,
      taskId,
      config,
      status: "created",
      createdAt: new Date().toISOString(),
    };

    this.experiments.set(experiment.id, experiment);
    return Promise.resolve(experiment);
  }

  async startExperiment(experimentId: string): Promise<ExperimentResult> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    const task = this.tasks.get(experiment.taskId);
    if (!task) {
      throw new Error(`Task not found for experiment: ${experimentId}`);
    }

    const context = RuntimeContextManager.fromExperiment(task, experiment);
    this.contexts.set(experimentId, context);

    const terminationConditions = experiment.config.terminationConditions;
    const terminationChecker = new TerminationChecker(terminationConditions);

    const eventBus = new RuntimeEventBus();

    const scheduler = new RuntimeScheduler(context, eventBus, terminationChecker);
    this.schedulers.set(experimentId, scheduler);

    experiment.status = "running";
    experiment.startedAt = new Date().toISOString();
    task.status = "processing";

    await scheduler.start();

    const report = await this.generateReport(experimentId);

    return {
      experiment,
      report,
      context,
    };
  }

  pauseExperiment(experimentId: string): Promise<void> {
    const scheduler = this.schedulers.get(experimentId);
    if (!scheduler) {
      throw new Error(`Scheduler not found for experiment: ${experimentId}`);
    }

    scheduler.stop();
    return Promise.resolve();
  }

  resumeExperiment(experimentId: string): Promise<void> {
    const scheduler = this.schedulers.get(experimentId);
    if (!scheduler) {
      throw new Error(`Scheduler not found for experiment: ${experimentId}`);
    }

    return scheduler.start();
  }

  stopExperiment(experimentId: string): Promise<void> {
    const scheduler = this.schedulers.get(experimentId);
    if (scheduler) {
      scheduler.stop();
    }

    const experiment = this.experiments.get(experimentId);
    if (experiment) {
      experiment.status = "completed";
      experiment.completedAt = new Date().toISOString();
      const task = this.tasks.get(experiment.taskId);
      if (task) {
        task.status = "completed";
      }
    }

    return Promise.resolve();
  }

  getExperimentStatus(experimentId: string): Promise<ExperimentStatus> {
    const experiment = this.experiments.get(experimentId);
    const scheduler = this.schedulers.get(experimentId);
    const context = this.contexts.get(experimentId);

    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    const status: ExperimentStatus = {
      experimentId,
      status: experiment.status as RuntimeState,
      currentRound: context?.round.current ?? 0,
      maxRounds: experiment.config.maxRounds,
      startTime: experiment.startedAt ?? "",
      elapsedMs: 0,
      metadata: {},
    };

    if (experiment.startedAt) {
      status.elapsedMs = Date.now() - new Date(experiment.startedAt).getTime();
    }

    if (scheduler) {
      const schedulerStatus = scheduler.getStatus();
      status.status = schedulerStatus.currentState;
      status.currentRound = schedulerStatus.currentRound;
      status.elapsedMs = schedulerStatus.elapsedMs;
    }

    return Promise.resolve(status);
  }

  generateReport(experimentId: string): Promise<ResearchReport> {
    const context = this.contexts.get(experimentId);
    const experiment = this.experiments.get(experimentId);
    const task = experiment ? this.tasks.get(experiment.taskId) : undefined;

    if (!context || !experiment || !task) {
      throw new Error(`Cannot generate report: experiment or context not found`);
    }

    const report: ResearchReport = {
      experimentId,
      taskId: task.id,
      generatedAt: new Date().toISOString(),
      metadata: {
        title: `Research Report - ${task.description}`,
        description: "Auto-generated research report",
        createdAt: experiment.createdAt,
        completedAt: experiment.completedAt || new Date().toISOString(),
        totalRounds: context.round.current,
        agentCount: context.agents.agents.length,
        converged: context.artifact.metadata.converged,
        terminationReason: context.artifact.terminationReason,
      },
      sections: [],
      summary: {
        finalDecision: "",
        consensusLevel: 0,
        confidence: 0,
        keyFindings: [],
        limitations: [],
        recommendations: [],
      },
      rawData: {
        trace: "",
        graph: "",
        metrics: "",
        events: "",
      },
    };

    return Promise.resolve(report);
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }

  getContext(experimentId: string): RuntimeContext | undefined {
    return this.contexts.get(experimentId);
  }

  getPluginRegistry(): PluginRegistry {
    return this.pluginRegistry;
  }
}
