import { BeliefUpdateStrategy, BeliefUpdateContext, AgentOpinion, InfluenceType } from "./types";
import {
  BELIEF_AGREEMENT_THRESHOLD,
  BELIEF_DISAGREEMENT_THRESHOLD,
  BELIEF_HIGH_CONFIDENCE_THRESHOLD,
  BELIEF_CONVERGING_THRESHOLD,
  BELIEF_CONVERGING_RATIO_THRESHOLD,
  BELIEF_HIGH_CONF_PULL_COEFF,
  BELIEF_LOW_CONF_PULL_COEFF,
  BELIEF_AGREEMENT_CONFIDENCE_BONUS,
  BELIEF_AGREEMENT_BELIEF_COEFF,
  BELIEF_DISAGREEMENT_CONFIDENCE_PENALTY,
  BELIEF_DISAGREEMENT_BELIEF_COEFF,
  BELIEF_CONVERGENCE_EXTRA_BELIEF_COEFF,
  BELIEF_CONVERGENCE_CONFIDENCE_BONUS,
  INFLUENCE_IMPACT_AGREEMENT_BELIEF_COEFF,
  INFLUENCE_IMPACT_AGREEMENT_CONFIDENCE_COEFF,
  INFLUENCE_IMPACT_DISAGREEMENT_BELIEF_COEFF,
  INFLUENCE_IMPACT_DISAGREEMENT_CONFIDENCE_COEFF,
  INFLUENCE_IMPACT_REFERENCE_BELIEF_COEFF,
  INFLUENCE_IMPACT_REFERENCE_CONFIDENCE_COEFF,
  INFLUENCE_IMPACT_PERSUASION_BELIEF_COEFF,
  INFLUENCE_IMPACT_PERSUASION_CONFIDENCE_COEFF,
  BELIEF_MIN,
  BELIEF_MAX,
  CONFIDENCE_MIN,
  CONFIDENCE_MAX,
} from "../constants";

export class RuleBasedBeliefUpdate implements BeliefUpdateStrategy {
  name: string = "rule_based";

  update(context: BeliefUpdateContext): { belief: number; confidence: number } {
    const { agentId, currentBelief, currentConfidence, allOpinions, interactionGraph, influenceWeights } = context;

    const otherOpinions = allOpinions.filter(o => o.agentId !== agentId);
    if (otherOpinions.length === 0) {
      return { belief: currentBelief, confidence: currentConfidence };
    }

    const agreementCount = otherOpinions.filter(o =>
      Math.abs(o.belief - currentBelief) < BELIEF_AGREEMENT_THRESHOLD
    ).length;

    const disagreementCount = otherOpinions.filter(o =>
      Math.abs(o.belief - currentBelief) > BELIEF_DISAGREEMENT_THRESHOLD
    ).length;

    const averageBelief = otherOpinions.reduce((sum, o) => sum + o.belief, 0) / otherOpinions.length;
    const beliefDiff = averageBelief - currentBelief;

    let beliefChange = 0;
    let confidenceChange = 0;

    const highConfidenceAgents = otherOpinions.filter(o => o.confidence > BELIEF_HIGH_CONFIDENCE_THRESHOLD);
    const lowConfidenceAgents = otherOpinions.filter(o => o.confidence <= BELIEF_HIGH_CONFIDENCE_THRESHOLD);

    if (highConfidenceAgents.length > 0) {
      const highConfAvgBelief = highConfidenceAgents.reduce((sum, o) => sum + o.belief, 0) / highConfidenceAgents.length;
      beliefChange += (highConfAvgBelief - currentBelief) * BELIEF_HIGH_CONF_PULL_COEFF;
    }

    if (lowConfidenceAgents.length > 0) {
      const lowConfAvgBelief = lowConfidenceAgents.reduce((sum, o) => sum + o.belief, 0) / lowConfidenceAgents.length;
      beliefChange += (lowConfAvgBelief - currentBelief) * BELIEF_LOW_CONF_PULL_COEFF;
    }

    if (agreementCount > disagreementCount) {
      confidenceChange += BELIEF_AGREEMENT_CONFIDENCE_BONUS;
      beliefChange += beliefDiff * BELIEF_AGREEMENT_BELIEF_COEFF;
    } else if (disagreementCount > agreementCount) {
      confidenceChange -= BELIEF_DISAGREEMENT_CONFIDENCE_PENALTY;
      beliefChange += beliefDiff * BELIEF_DISAGREEMENT_BELIEF_COEFF;
    }

    const convergingAgents = otherOpinions.filter(o => {
      const agentHistory = interactionGraph.nodes.find(n => n.agentId === o.agentId);
      return agentHistory && Math.abs(agentHistory.belief - currentBelief) < BELIEF_CONVERGING_THRESHOLD;
    });

    if (convergingAgents.length > otherOpinions.length * BELIEF_CONVERGING_RATIO_THRESHOLD) {
      beliefChange += beliefDiff * BELIEF_CONVERGENCE_EXTRA_BELIEF_COEFF;
      confidenceChange += BELIEF_CONVERGENCE_CONFIDENCE_BONUS;
    }

    for (const weight of influenceWeights) {
      const sourceOpinion = allOpinions.find(o => o.agentId === weight.sourceAgentId);
      if (!sourceOpinion) continue;

      const influenceFactor = weight.weight;
      const beliefDiffFromSource = sourceOpinion.belief - currentBelief;

      switch (weight.type) {
        case "agreement":
          beliefChange += beliefDiffFromSource * influenceFactor * INFLUENCE_IMPACT_AGREEMENT_BELIEF_COEFF;
          confidenceChange += influenceFactor * INFLUENCE_IMPACT_AGREEMENT_CONFIDENCE_COEFF;
          break;
        case "disagreement":
          beliefChange += beliefDiffFromSource * influenceFactor * INFLUENCE_IMPACT_DISAGREEMENT_BELIEF_COEFF;
          confidenceChange -= influenceFactor * INFLUENCE_IMPACT_DISAGREEMENT_CONFIDENCE_COEFF;
          break;
        case "reference":
          beliefChange += beliefDiffFromSource * influenceFactor * INFLUENCE_IMPACT_REFERENCE_BELIEF_COEFF;
          confidenceChange += influenceFactor * INFLUENCE_IMPACT_REFERENCE_CONFIDENCE_COEFF;
          break;
        case "persuasion":
          beliefChange += beliefDiffFromSource * influenceFactor * INFLUENCE_IMPACT_PERSUASION_BELIEF_COEFF;
          confidenceChange += influenceFactor * INFLUENCE_IMPACT_PERSUASION_CONFIDENCE_COEFF;
          break;
      }
    }

    const newBelief = Math.max(BELIEF_MIN, Math.min(BELIEF_MAX, currentBelief + beliefChange));
    const newConfidence = Math.max(CONFIDENCE_MIN, Math.min(CONFIDENCE_MAX, currentConfidence + confidenceChange));

    return { belief: newBelief, confidence: newConfidence };
  }
}

export class BeliefUpdateManager {
  private strategies: Map<string, BeliefUpdateStrategy> = new Map();
  private currentStrategy: BeliefUpdateStrategy;

  constructor(strategy: BeliefUpdateStrategy = new RuleBasedBeliefUpdate()) {
    this.strategies.set(strategy.name, strategy);
    this.currentStrategy = strategy;
  }

  register(strategy: BeliefUpdateStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  use(strategyName: string): void {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Belief update strategy ${strategyName} not found`);
    }
    this.currentStrategy = strategy;
  }

  update(context: BeliefUpdateContext): { belief: number; confidence: number } {
    return this.currentStrategy.update(context);
  }
}
