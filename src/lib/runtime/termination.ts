import type {
  RuntimeContext,
  TerminationCondition,
  TerminationType,
  TerminationDecision,
  TerminationStrategy,
} from "./types";

class MaximumRoundsStrategy implements TerminationStrategy {
  check(context: RuntimeContext): TerminationDecision {
    const { current, max } = context.round;
    const shouldTerminate = current >= max;

    return {
      shouldTerminate,
      reason: shouldTerminate
        ? `Reached maximum rounds: ${current}/${max}`
        : "Within round limit",
      conditionType: "maximum_rounds",
      metrics: { currentRound: current, maxRounds: max },
    };
  }

  getType(): TerminationType {
    return "maximum_rounds";
  }
}

class ConsensusStableStrategy implements TerminationStrategy {
  private threshold: number;
  private consecutiveRounds: number;

  constructor(params: Record<string, unknown>) {
    this.threshold = (params.threshold as number) || 0.9;
    this.consecutiveRounds = (params.consecutiveRounds as number) || 2;
  }

  check(context: RuntimeContext): TerminationDecision {
    const { history } = context.metrics;
    if (history.length < this.consecutiveRounds) {
      return {
        shouldTerminate: false,
        reason: "Not enough evaluation history",
        conditionType: "consensus_stable",
        metrics: { historyLength: history.length, required: this.consecutiveRounds },
      };
    }

    const recentEvaluations = history.slice(-this.consecutiveRounds);
    const consensusLevels = recentEvaluations.map((h) => {
      const result = h.evaluation as any;
      return result.consensus?.level ?? 0;
    });

    const allStable = consensusLevels.every((level) => level >= this.threshold);
    const avgConsensus = consensusLevels.reduce((a, b) => a + b, 0) / consensusLevels.length;

    return {
      shouldTerminate: allStable,
      reason: allStable
        ? `Consensus stable above threshold ${this.threshold} for ${this.consecutiveRounds} rounds (avg: ${avgConsensus})`
        : `Consensus not stable (avg: ${avgConsensus}, threshold: ${this.threshold})`,
      conditionType: "consensus_stable",
      metrics: { avgConsensus, threshold: this.threshold, consecutiveRounds: this.consecutiveRounds },
    };
  }

  getType(): TerminationType {
    return "consensus_stable";
  }
}

class NoStateChangeStrategy implements TerminationStrategy {
  private threshold: number;
  private consecutiveRounds: number;

  constructor(params: Record<string, unknown>) {
    this.threshold = (params.threshold as number) || 0.01;
    this.consecutiveRounds = (params.consecutiveRounds as number) || 2;
  }

  check(context: RuntimeContext): TerminationDecision {
    const { history } = context.metrics;
    if (history.length < this.consecutiveRounds + 1) {
      return {
        shouldTerminate: false,
        reason: "Not enough evaluation history",
        conditionType: "no_state_change",
        metrics: { historyLength: history.length, required: this.consecutiveRounds + 1 },
      };
    }

    const recentEvaluations = history.slice(-this.consecutiveRounds - 1);
    const deltas: number[] = [];

    for (let i = 1; i < recentEvaluations.length; i++) {
      const prev = recentEvaluations[i - 1].evaluation as any;
      const curr = recentEvaluations[i].evaluation as any;
      const delta = Math.abs((prev.consensus?.level ?? 0) - (curr.consensus?.level ?? 0));
      deltas.push(delta);
    }

    const maxDelta = Math.max(...deltas);
    const allBelowThreshold = deltas.every((delta) => delta <= this.threshold);

    return {
      shouldTerminate: allBelowThreshold,
      reason: allBelowThreshold
        ? `State change below threshold ${this.threshold} for ${this.consecutiveRounds} rounds (max delta: ${maxDelta})`
        : `State still changing (max delta: ${maxDelta}, threshold: ${this.threshold})`,
      conditionType: "no_state_change",
      metrics: { maxDelta, threshold: this.threshold, consecutiveRounds: this.consecutiveRounds },
    };
  }

  getType(): TerminationType {
    return "no_state_change";
  }
}

class ConfidenceConvergedStrategy implements TerminationStrategy {
  private threshold: number;

  constructor(params: Record<string, unknown>) {
    this.threshold = (params.threshold as number) || 0.9;
  }

  check(context: RuntimeContext): TerminationDecision {
    const agentStates = context.state.agentStates;
    if (agentStates.size === 0) {
      return {
        shouldTerminate: false,
        reason: "No agent states available",
        conditionType: "confidence_converged",
        metrics: { agentCount: 0 },
      };
    }

    const confidences = Array.from(agentStates.values()).map((state) => state.confidence ?? 0);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const shouldTerminate = avgConfidence >= this.threshold;

    return {
      shouldTerminate,
      reason: shouldTerminate
        ? `Average confidence ${avgConfidence} >= threshold ${this.threshold}`
        : `Average confidence ${avgConfidence} < threshold ${this.threshold}`,
      conditionType: "confidence_converged",
      metrics: { avgConfidence, threshold: this.threshold, agentCount: agentStates.size },
    };
  }

  getType(): TerminationType {
    return "confidence_converged";
  }
}

class GovernanceLimitStrategy implements TerminationStrategy {
  private maxInterventions: number;

  constructor(params: Record<string, unknown>) {
    this.maxInterventions = (params.maxInterventions as number) || 5;
  }

  check(context: RuntimeContext): TerminationDecision {
    const { appliedInterventions } = context.governance;
    const shouldTerminate = appliedInterventions.length >= this.maxInterventions;

    return {
      shouldTerminate,
      reason: shouldTerminate
        ? `Reached maximum governance interventions: ${appliedInterventions.length}/${this.maxInterventions}`
        : `Within intervention limit: ${appliedInterventions.length}/${this.maxInterventions}`,
      conditionType: "governance_limit",
      metrics: { interventionCount: appliedInterventions.length, maxInterventions: this.maxInterventions },
    };
  }

  getType(): TerminationType {
    return "governance_limit";
  }
}

class ExperimentTimeoutStrategy implements TerminationStrategy {
  private timeoutMs: number;

  constructor(params: Record<string, unknown>) {
    this.timeoutMs = (params.timeoutMs as number) || 300000;
  }

  check(context: RuntimeContext): TerminationDecision {
    const startTime = new Date(context.artifact.metadata.startTime).getTime();
    const now = Date.now();
    const elapsed = now - startTime;
    const shouldTerminate = elapsed >= this.timeoutMs;

    return {
      shouldTerminate,
      reason: shouldTerminate
        ? `Experiment timeout: ${elapsed}ms >= ${this.timeoutMs}ms`
        : `Within timeout: ${elapsed}ms < ${this.timeoutMs}ms`,
      conditionType: "experiment_timeout",
      metrics: { elapsedMs: elapsed, timeoutMs: this.timeoutMs },
    };
  }

  getType(): TerminationType {
    return "experiment_timeout";
  }
}

class TerminationChecker {
  private strategies: Map<TerminationType, TerminationStrategy> = new Map();

  constructor(conditions: TerminationCondition[]) {
    this.registerStrategies(conditions);
  }

  private registerStrategies(conditions: TerminationCondition[]): void {
    conditions.forEach((condition) => {
      if (!condition.enabled) return;

      let strategy: TerminationStrategy;
      switch (condition.type) {
        case "maximum_rounds":
          strategy = new MaximumRoundsStrategy();
          break;
        case "consensus_stable":
          strategy = new ConsensusStableStrategy(condition.params);
          break;
        case "no_state_change":
          strategy = new NoStateChangeStrategy(condition.params);
          break;
        case "confidence_converged":
          strategy = new ConfidenceConvergedStrategy(condition.params);
          break;
        case "governance_limit":
          strategy = new GovernanceLimitStrategy(condition.params);
          break;
        case "experiment_timeout":
          strategy = new ExperimentTimeoutStrategy(condition.params);
          break;
        default:
          return;
      }

      this.strategies.set(condition.type, strategy);
    });
  }

  check(context: RuntimeContext): TerminationDecision {
    const decisions: TerminationDecision[] = [];

    this.strategies.forEach((strategy) => {
      const decision = strategy.check(context);
      decisions.push(decision);
    });

    const hardDecisions = decisions.filter((d) => {
      const condition = context.experiment.config.terminationConditions.find(
        (c) => c.type === d.conditionType
      );
      return condition?.priority === "hard";
    });

    const softDecisions = decisions.filter((d) => {
      const condition = context.experiment.config.terminationConditions.find(
        (c) => c.type === d.conditionType
      );
      return condition?.priority === "soft";
    });

    const hardTerminate = hardDecisions.some((d) => d.shouldTerminate);
    if (hardTerminate) {
      const decision = hardDecisions.find((d) => d.shouldTerminate)!;
      return { ...decision, reason: `[HARD] ${decision.reason}` };
    }

    const softTerminate = softDecisions.every((d) => d.shouldTerminate);
    if (softTerminate && softDecisions.length > 0) {
      const reasons = softDecisions.map((d) => d.reason).join("; ");
      return {
        shouldTerminate: true,
        reason: `[SOFT] ${reasons}`,
        conditionType: "custom",
        metrics: Object.assign({}, ...softDecisions.map((d) => d.metrics)),
      };
    }

    const defaultDecision = decisions[0];
    return {
      shouldTerminate: false,
      reason: "No termination condition met",
      conditionType: "custom",
      metrics: {},
    };
  }

  addStrategy(type: TerminationType, strategy: TerminationStrategy): void {
    this.strategies.set(type, strategy);
  }

  removeStrategy(type: TerminationType): void {
    this.strategies.delete(type);
  }

  getStrategies(): TerminationStrategy[] {
    return Array.from(this.strategies.values());
  }
}

export {
  TerminationChecker,
  MaximumRoundsStrategy,
  ConsensusStableStrategy,
  NoStateChangeStrategy,
  ConfidenceConvergedStrategy,
  GovernanceLimitStrategy,
  ExperimentTimeoutStrategy,
};
