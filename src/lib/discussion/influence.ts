import { InfluenceStrategy, InfluenceContext, InfluenceType, AgentOpinion, InteractionGraph, InteractionEdge } from "./types";

export class RuleBasedInfluence implements InfluenceStrategy {
  name: string = "rule_based";

  compute(context: InfluenceContext): number {
    const { influenceType, sourceOpinion, targetOpinion } = context;

    let weight = 0;

    switch (influenceType) {
      case "agreement":
        weight = this.computeAgreementWeight(sourceOpinion, targetOpinion);
        break;
      case "disagreement":
        weight = this.computeDisagreementWeight(sourceOpinion, targetOpinion);
        break;
      case "reference":
        weight = this.computeReferenceWeight(sourceOpinion, targetOpinion);
        break;
      case "persuasion":
        weight = this.computePersuasionWeight(sourceOpinion, targetOpinion);
        break;
    }

    return Math.max(0, Math.min(1, weight));
  }

  private computeAgreementWeight(source: AgentOpinion, target: AgentOpinion): number {
    const beliefSimilarity = 1 - Math.abs(source.belief - target.belief);
    const confidenceBonus = source.confidence / 100;
    return beliefSimilarity * confidenceBonus * 0.8;
  }

  private computeDisagreementWeight(source: AgentOpinion, target: AgentOpinion): number {
    const beliefDiff = Math.abs(source.belief - target.belief);
    const confidenceBonus = source.confidence / 100;
    return beliefDiff * confidenceBonus * 0.5;
  }

  private computeReferenceWeight(source: AgentOpinion, target: AgentOpinion): number {
    const sourceConfidence = source.confidence / 100;
    const reasoningQuality = Math.min(1, source.reasoning.length / 500);
    return sourceConfidence * reasoningQuality * 0.7;
  }

  private computePersuasionWeight(source: AgentOpinion, target: AgentOpinion): number {
    const confidenceDiff = (source.confidence - target.confidence) / 100;
    const beliefDiff = Math.abs(source.belief - target.belief);
    return Math.max(0, confidenceDiff) * (1 - beliefDiff) * 0.6;
  }

  applyInfluences(agentId: string, allOpinions: AgentOpinion[], graph: InteractionGraph, roundNumber: number): void {
    const changes = this.computeInfluenceChanges(agentId, allOpinions, graph, roundNumber);
    this.applyChanges(graph, changes);
  }

  private computeInfluenceChanges(
    agentId: string,
    allOpinions: AgentOpinion[],
    graph: InteractionGraph,
    roundNumber: number
  ): Array<{ type: 'update' | 'add'; edge: InteractionEdge }> {
    const targetOpinion = allOpinions.find(o => o.agentId === agentId);
    if (!targetOpinion) return [];

    const influencers = allOpinions.filter(o => o.agentId !== agentId);
    const changes: Array<{ type: 'update' | 'add'; edge: InteractionEdge }> = [];

    for (const sourceOpinion of influencers) {
      let influenceType: InfluenceType = "agreement";

      if (Math.abs(sourceOpinion.belief - targetOpinion.belief) > 0.5) {
        influenceType = "disagreement";
      } else if (targetOpinion.referencedAgents.includes(sourceOpinion.agentId)) {
        influenceType = "reference";
      } else if (sourceOpinion.confidence > targetOpinion.confidence + 20) {
        influenceType = "persuasion";
      }

      const weight = this.compute({
        agentId: sourceOpinion.agentId,
        targetAgentId: agentId,
        influenceType,
        sourceOpinion,
        targetOpinion,
        interactionGraph: graph,
      });

      const existingEdge = graph.edges.find(
        e => e.source === sourceOpinion.agentId && e.target === agentId && e.type === influenceType
      );

      if (existingEdge) {
        changes.push({
          type: 'update',
          edge: { ...existingEdge, weight: Math.max(0, Math.min(1, existingEdge.weight + weight * 0.3)) },
        });
      } else {
        changes.push({
          type: 'add',
          edge: {
            source: sourceOpinion.agentId,
            target: agentId,
            type: influenceType,
            weight,
            round: roundNumber,
          },
        });
      }
    }

    return changes;
  }

  private applyChanges(graph: InteractionGraph, changes: Array<{ type: 'update' | 'add'; edge: InteractionEdge }>): void {
    for (const change of changes) {
      if (change.type === 'update') {
        const existingEdge = graph.edges.find(
          e => e.source === change.edge.source && e.target === change.edge.target && e.type === change.edge.type
        );
        if (existingEdge) {
          existingEdge.weight = change.edge.weight;
        }
      } else {
        graph.edges.push(change.edge);
      }
    }
  }

  applyAllInfluences(allOpinions: AgentOpinion[], graph: InteractionGraph, roundNumber: number): void {
    const allChanges: Array<{ type: 'update' | 'add'; edge: InteractionEdge }> = [];

    for (const opinion of allOpinions) {
      const changes = this.computeInfluenceChanges(opinion.agentId, allOpinions, graph, roundNumber);
      allChanges.push(...changes);
    }

    this.applyChanges(graph, allChanges);
  }
}

export class InfluenceManager {
  private strategies: Map<string, InfluenceStrategy> = new Map();
  private currentStrategy: InfluenceStrategy;

  constructor(strategy: InfluenceStrategy = new RuleBasedInfluence()) {
    this.strategies.set(strategy.name, strategy);
    this.currentStrategy = strategy;
  }

  register(strategy: InfluenceStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  use(strategyName: string): void {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Influence strategy ${strategyName} not found`);
    }
    this.currentStrategy = strategy;
  }

  compute(context: InfluenceContext): number {
    return this.currentStrategy.compute(context);
  }

  applyInfluences(agentId: string, allOpinions: AgentOpinion[], graph: InteractionGraph, roundNumber: number): void {
    this.currentStrategy.applyInfluences(agentId, allOpinions, graph, roundNumber);
  }

  applyAllInfluences(allOpinions: AgentOpinion[], graph: InteractionGraph, roundNumber: number): void {
    this.currentStrategy.applyAllInfluences(allOpinions, graph, roundNumber);
  }
}
