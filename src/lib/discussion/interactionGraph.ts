import { InteractionGraph, AgentNode, InteractionEdge, InfluenceType, AgentOpinion } from "./types";

export class InteractionGraphBuilder {
  private graph: InteractionGraph;

  constructor() {
    this.graph = {
      nodes: [],
      edges: [],
    };
  }

  addNode(agentId: string, name: string, role: string, belief: number, confidence: number): void {
    const existingNode = this.graph.nodes.find(n => n.agentId === agentId);
    if (existingNode) {
      existingNode.belief = belief;
      existingNode.confidence = confidence;
    } else {
      this.graph.nodes.push({
        agentId,
        name,
        role,
        belief,
        confidence,
      });
    }
  }

  addEdge(
    source: string,
    target: string,
    type: InfluenceType,
    weight: number,
    round: number
  ): void {
    const existingEdge = this.graph.edges.find(
      e => e.source === source && e.target === target && e.type === type
    );

    if (existingEdge) {
      existingEdge.weight = Math.max(0, Math.min(1, (existingEdge.weight + weight) / 2));
      existingEdge.round = round;
    } else {
      this.graph.edges.push({
        source,
        target,
        type,
        weight,
        round,
      });
    }
  }

  updateFromOpinions(opinions: AgentOpinion[], round: number): void {
    for (const opinion of opinions) {
      const node = this.graph.nodes.find(n => n.agentId === opinion.agentId);
      if (node) {
        node.belief = opinion.belief;
        node.confidence = opinion.confidence;
      }

      for (const referencedAgent of opinion.referencedAgents) {
        this.addEdge(referencedAgent, opinion.agentId, "reference", 0.5, round);
      }

      for (const otherOpinion of opinions) {
        if (otherOpinion.agentId === opinion.agentId) continue;

        const beliefDiff = Math.abs(opinion.belief - otherOpinion.belief);

        if (beliefDiff < 0.3) {
          this.addEdge(otherOpinion.agentId, opinion.agentId, "agreement", 1 - beliefDiff, round);
        } else if (beliefDiff > 0.5) {
          this.addEdge(otherOpinion.agentId, opinion.agentId, "disagreement", beliefDiff - 0.5, round);
        }

        if (otherOpinion.confidence > opinion.confidence + 20) {
          this.addEdge(otherOpinion.agentId, opinion.agentId, "persuasion", otherOpinion.confidence / 100, round);
        }
      }
    }
  }

  getGraph(): InteractionGraph {
    return { ...this.graph, nodes: [...this.graph.nodes], edges: [...this.graph.edges] };
  }

  getInfluencers(agentId: string): { agentId: string; weight: number; type: InfluenceType }[] {
    return this.graph.edges
      .filter(e => e.target === agentId)
      .map(e => ({
        agentId: e.source,
        weight: e.weight,
        type: e.type,
      }))
      .sort((a, b) => b.weight - a.weight);
  }

  getInfluencee(agentId: string): { agentId: string; weight: number; type: InfluenceType }[] {
    return this.graph.edges
      .filter(e => e.source === agentId)
      .map(e => ({
        agentId: e.target,
        weight: e.weight,
        type: e.type,
      }))
      .sort((a, b) => b.weight - a.weight);
  }

  getNode(agentId: string): AgentNode | undefined {
    return this.graph.nodes.find(n => n.agentId === agentId);
  }

  clear(): void {
    this.graph = { nodes: [], edges: [] };
  }
}
