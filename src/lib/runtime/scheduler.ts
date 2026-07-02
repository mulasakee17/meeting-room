import type { RuntimeContext, RuntimeState, RuntimeEvent, SchedulerStatus } from "./types";
import { RuntimeEventBus } from "./eventBus";
import { RuntimeContextManager } from "./context";
import { TerminationChecker } from "./termination";
import { EvaluationAdapter, GovernanceAdapter } from "./adapters";
import { ObservationLayer } from "../observation";
import { InferenceLayer } from "../inference";
import type { ObserverAgent } from "../observation";
import type { GovernanceIssue } from "../governance/types";
import type { AgentOpinion } from "../discussion/types";

export class RuntimeScheduler {
  private eventBus: RuntimeEventBus;
  private context: RuntimeContext;
  private terminationChecker: TerminationChecker;
  private evaluationAdapter: EvaluationAdapter;
  private governanceAdapter: GovernanceAdapter;
  private observationLayer: ObservationLayer;
  private inferenceLayer: InferenceLayer;
  private currentState: RuntimeState = "idle";
  private running: boolean = false;

  constructor(
    context: RuntimeContext,
    eventBus: RuntimeEventBus,
    terminationChecker: TerminationChecker
  ) {
    this.context = context;
    this.eventBus = eventBus;
    this.terminationChecker = terminationChecker;
    this.evaluationAdapter = new EvaluationAdapter();
    this.governanceAdapter = new GovernanceAdapter();
    this.observationLayer = new ObservationLayer();
    this.inferenceLayer = new InferenceLayer();
  }

  getStatus(): SchedulerStatus {
    return {
      currentState: this.currentState,
      currentRound: this.context.round.current,
      queuedTasks: 0,
      startTime: this.context.session.startTime,
      elapsedMs: Date.now() - new Date(this.context.session.startTime).getTime(),
    };
  }

  setState(state: RuntimeState): void {
    const previousState = this.currentState;
    this.currentState = state;

    this.publishEvent("state_changed", {
      previousState,
      currentState: state,
      round: this.context.round.current,
    });
  }

  private publishEvent(type: string, payload: Record<string, unknown>): void {
    const event: RuntimeEvent = {
      id: `${type}-${Date.now()}`,
      type,
      timestamp: new Date().toISOString(),
      roundNumber: this.context.round.current,
      payload,
      source: "RuntimeScheduler",
    };

    this.eventBus.publish(event);
    RuntimeContextManager.addTimelineEntry(this.context, {
      roundNumber: this.context.round.current,
      eventType: type,
      description: JSON.stringify(payload),
    });
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.setState("preparing");

    try {
      await this.executeMainLoop();
    } catch (error) {
      this.setState("failed");
      this.publishEvent("experiment_failed", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    this.running = false;
    this.setState("checking_termination");
  }

  private async executeMainLoop(): Promise<void> {
    this.setState("running");
    this.publishEvent("experiment_started", {
      experimentId: this.context.experiment.id,
      taskId: this.context.task.id,
      maxRounds: this.context.round.max,
    });

    while (this.running) {
      const terminationDecision = this.terminationChecker.check(this.context);
      if (terminationDecision.shouldTerminate) {
        this.handleTermination(terminationDecision);
        break;
      }

      await this.executeRound();
    }
  }

  private async executeRound(): Promise<void> {
    const roundNumber = this.context.round.current + 1;
    this.publishEvent("round_started", { roundNumber });

    RuntimeContextManager.updateRound(this.context, roundNumber);

    try {
      await this.executeDiscussion();
      await this.executeEvaluation();
      await this.executeGovernance();

      this.updateArtifact();

      RuntimeContextManager.endRound(this.context);
      this.publishEvent("round_completed", { roundNumber });
    } catch (error) {
      this.publishEvent("round_failed", { roundNumber, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  private async executeDiscussion(): Promise<void> {
    this.publishEvent("discussion_started", { round: this.context.round.current });

    const agents = this.context.agents.agents as ObserverAgent[];
    const observations = await this.observationLayer.observe(agents, this.context.task, this.context.round.current, this.context);

    const opinions: AgentOpinion[] = observations.map(o => o.parsedOpinion);

    const deltas = this.inferenceLayer.infer(observations, this.context.state, this.context);

    for (const delta of deltas) {
      const agentState = this.context.state.agentStates.get(delta.agentId);
      if (agentState) {
        agentState.belief = Math.max(-1, Math.min(1, agentState.belief + delta.beliefChange));
        agentState.confidence = Math.max(0, Math.min(100, agentState.confidence + delta.confidenceChange));
      }
    }

    this.publishEvent("discussion_completed", {
      round: this.context.round.current,
      opinionCount: opinions.length,
    });
  }

  private executeEvaluation(): void {
    this.publishEvent("evaluation_started", { round: this.context.round.current });

    const result = this.evaluationAdapter.evaluate(this.context);

    this.context.metrics.previousEvaluation = this.context.metrics.evaluation;
    this.context.metrics.evaluation = result;

    if (this.context.metrics.previousEvaluation) {
      this.context.metrics.delta = this.calculateDelta(
        this.context.metrics.previousEvaluation,
        result
      );
    }

    this.context.metrics.history.push({
      roundNumber: this.context.round.current,
      timestamp: new Date().toISOString(),
      evaluation: result,
    });

    this.publishEvent("evaluation_completed", {
      round: this.context.round.current,
      overallScore: result.overallScore,
    });
  }

  private executeGovernance(): void {
    this.publishEvent("governance_started", { round: this.context.round.current });

    const result = this.governanceAdapter.diagnoseAndIntervene(this.context);

    const issues: GovernanceIssue[] = [];
    const governanceResult = result.result;

    if (governanceResult.echoChamber.detected) {
      issues.push({
        type: "echo_chamber",
        severity: governanceResult.echoChamber.severity,
        description: "Echo chamber detected",
        agents: governanceResult.echoChamber.redundantAgents,
      });
    }

    if (governanceResult.authorityBias.detected) {
      issues.push({
        type: "authority_bias",
        severity: governanceResult.authorityBias.severity,
        description: "Authority bias detected",
        agents: governanceResult.authorityBias.dominantAgent ? [governanceResult.authorityBias.dominantAgent] : undefined,
      });
    }

    if (governanceResult.polarization.detected) {
      issues.push({
        type: "polarization",
        severity: governanceResult.polarization.severity,
        description: "Polarization detected",
        agents: governanceResult.polarization.groups.flatMap((g) => g.agentIds),
      });
    }

    if (governanceResult.prematureConsensus.detected) {
      issues.push({
        type: "premature_consensus",
        severity: governanceResult.prematureConsensus.severity,
        description: "Premature consensus detected",
      });
    }

    issues.push(...governanceResult.otherIssues);

    this.context.governance.issues = issues;
    this.context.governance.interventions = result.interventions || [];
    this.context.governance.appliedInterventions = [
      ...this.context.governance.appliedInterventions,
      ...(result.interventions?.filter((i) => i.applied) || []),
    ];

    this.context.governance.status = this.determineGovernanceStatus(issues);

    this.publishEvent("governance_completed", {
      round: this.context.round.current,
      issueCount: issues.length,
      interventionCount: result.interventions?.length || 0,
    });
  }

  private calculateDelta(
    previous: any,
    current: any
  ): Record<string, number> {
    const delta: Record<string, number> = {};

    if (previous.overallScore !== undefined && current.overallScore !== undefined) {
      delta.overallScore = current.overallScore - previous.overallScore;
    }

    if (previous.dimensions?.consensus?.score !== undefined && current.dimensions?.consensus?.score !== undefined) {
      delta.consensusScore = current.dimensions.consensus.score - previous.dimensions.consensus.score;
    }

    return delta;
  }

  private determineGovernanceStatus(issues: GovernanceIssue[]): "clean" | "warning" | "critical" {
    if (!issues || issues.length === 0) {
      return "clean";
    }

    const hasHigh = issues.some((issue) => issue.severity === "high");
    if (hasHigh) {
      return "critical";
    }

    return "warning";
  }

  private updateArtifact(): void {
    const timestamp = new Date().toISOString();

    this.context.artifact.snapshots.rounds.push({
      roundNumber: this.context.round.current,
      timestamp,
      opinions: [],
      beliefChanges: {},
      influenceEvents: [],
      converged: false,
    });

    this.context.artifact.snapshots.states.push({
      roundNumber: this.context.round.current,
      timestamp,
      agentStates: new Map(this.context.state.agentStates),
      interactionGraph: { ...this.context.state.interactionGraph },
      beliefTrajectories: { ...this.context.state.beliefTrajectories },
      decisionTrace: { ...this.context.state.decisionTrace },
    });

    if (this.context.metrics.evaluation) {
      this.context.artifact.snapshots.evaluations.push({
        roundNumber: this.context.round.current,
        timestamp,
        evaluationResult: this.context.metrics.evaluation,
        metricsDelta: { ...this.context.metrics.delta },
        grade: this.calculateGrade(this.context.metrics.evaluation),
      });
    }

    this.context.artifact.snapshots.governances.push({
      roundNumber: this.context.round.current,
      timestamp,
      issues: [...this.context.governance.issues],
      interventions: [...this.context.governance.interventions],
      appliedInterventions: [...this.context.governance.appliedInterventions],
      effectMetrics: {},
    });

    this.context.artifact.snapshots.decisions.push({
      roundNumber: this.context.round.current,
      timestamp,
      finalDecision: "",
      consensusLevel: 0,
      avgBelief: 0,
      avgConfidence: 0,
    });

    this.context.artifact.metadata.totalRounds = this.context.round.current;
  }

  private calculateGrade(evaluation: any): "excellent" | "good" | "fair" | "poor" | "critical" {
    const score = evaluation.overallScore;
    if (score >= 0.8) return "excellent";
    if (score >= 0.6) return "good";
    if (score >= 0.4) return "fair";
    if (score >= 0.2) return "poor";
    return "critical";
  }

  private handleTermination(decision: any): void {
    this.setState("checking_termination");
    this.publishEvent("termination_check", {
      shouldTerminate: decision.shouldTerminate,
      reason: decision.reason,
      conditionType: decision.conditionType,
      metrics: decision.metrics,
    });

    this.context.experiment.status = "completed";
    this.context.experiment.completedAt = new Date().toISOString();
    this.context.session.status = "completed";

    this.context.artifact.metadata.endTime = new Date().toISOString();
    this.context.artifact.metadata.elapsedMs = Date.now() - new Date(this.context.artifact.metadata.startTime).getTime();
    this.context.artifact.metadata.converged = true;
    this.context.artifact.terminationReason = decision.reason;

    this.setState("completed");
    this.publishEvent("experiment_completed", {
      experimentId: this.context.experiment.id,
      totalRounds: this.context.round.current,
      terminationReason: decision.reason,
      elapsedMs: this.context.artifact.metadata.elapsedMs,
    });
  }
}
