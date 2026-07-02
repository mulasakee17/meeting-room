import { BeliefUpdateStrategy, BeliefUpdateContext, AgentOpinion, InfluenceType } from "./types";

export class RuleBasedBeliefUpdate implements BeliefUpdateStrategy {
  name: string = "rule_based";

  update(context: BeliefUpdateContext): { belief: number; confidence: number } {
    const { agentId, currentBelief, currentConfidence, allOpinions, interactionGraph, influenceWeights } = context;

    const otherOpinions = allOpinions.filter(o => o.agentId !== agentId);
    if (otherOpinions.length === 0) {
      return { belief: currentBelief, confidence: currentConfidence };
    }

    const agreementCount = otherOpinions.filter(o => 
      Math.abs(o.belief - currentBelief) < 0.3
    ).length;

    const disagreementCount = otherOpinions.filter(o => 
      Math.abs(o.belief - currentBelief) > 0.5
    ).length;

    const averageBelief = otherOpinions.reduce((sum, o) => sum + o.belief, 0) / otherOpinions.length;
    const beliefDiff = averageBelief - currentBelief;

    let beliefChange = 0;
    let confidenceChange = 0;

    const highConfidenceAgents = otherOpinions.filter(o => o.confidence > 70);
    const lowConfidenceAgents = otherOpinions.filter(o => o.confidence <= 70);

    if (highConfidenceAgents.length > 0) {
      const highConfAvgBelief = highConfidenceAgents.reduce((sum, o) => sum + o.belief, 0) / highConfidenceAgents.length;
      beliefChange += (highConfAvgBelief - currentBelief) * 0.3;
    }

    if (lowConfidenceAgents.length > 0) {
      const lowConfAvgBelief = lowConfidenceAgents.reduce((sum, o) => sum + o.belief, 0) / lowConfidenceAgents.length;
      beliefChange += (lowConfAvgBelief - currentBelief) * 0.1;
    }

    if (agreementCount > disagreementCount) {
      confidenceChange += 5;
      beliefChange += beliefDiff * 0.1;
    } else if (disagreementCount > agreementCount) {
      confidenceChange -= 3;
      beliefChange += beliefDiff * 0.05;
    }

    const convergingAgents = otherOpinions.filter(o => {
      const agentHistory = interactionGraph.nodes.find(n => n.agentId === o.agentId);
      return agentHistory && Math.abs(agentHistory.belief - currentBelief) < 0.2;
    });

    if (convergingAgents.length > otherOpinions.length * 0.5) {
      beliefChange += beliefDiff * 0.15;
      confidenceChange += 3;
    }

    for (const weight of influenceWeights) {
      const sourceOpinion = allOpinions.find(o => o.agentId === weight.sourceAgentId);
      if (!sourceOpinion) continue;

      const influenceFactor = weight.weight;
      const beliefDiffFromSource = sourceOpinion.belief - currentBelief;

      switch (weight.type) {
        case "agreement":
          beliefChange += beliefDiffFromSource * influenceFactor * 0.4;
          confidenceChange += influenceFactor * 3;
          break;
        case "disagreement":
          beliefChange += beliefDiffFromSource * influenceFactor * 0.2;
          confidenceChange -= influenceFactor * 2;
          break;
        case "reference":
          beliefChange += beliefDiffFromSource * influenceFactor * 0.5;
          confidenceChange += influenceFactor * 4;
          break;
        case "persuasion":
          beliefChange += beliefDiffFromSource * influenceFactor * 0.6;
          confidenceChange += influenceFactor * 5;
          break;
      }
    }

    const newBelief = Math.max(-1, Math.min(1, currentBelief + beliefChange));
    const newConfidence = Math.max(0, Math.min(100, currentConfidence + confidenceChange));

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
