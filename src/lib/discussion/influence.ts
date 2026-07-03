import { InfluenceStrategy, InfluenceContext, InfluenceType, AgentOpinion, InteractionGraph, InteractionEdge } from "./types";
import { determineInfluenceType, computeInfluenceWeight } from "./influenceUtils";
import { INFLUENCE_EDGE_DECAY_FACTOR } from "../constants";

export class RuleBasedInfluence implements InfluenceStrategy {
  name: string = "rule_based";

  compute(context: InfluenceContext): number {
    const { influenceType, sourceOpinion, targetOpinion } = context;
    const weight = computeInfluenceWeight(influenceType, sourceOpinion, targetOpinion);
    return Math.max(0, Math.min(1, weight));
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
      const influenceType = determineInfluenceType(sourceOpinion, targetOpinion);

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
          edge: { ...existingEdge, weight: Math.max(0, Math.min(1, existingEdge.weight + weight * INFLUENCE_EDGE_DECAY_FACTOR)) },
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
