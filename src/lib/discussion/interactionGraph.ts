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

      // 只用显式引用建边，不再用 belief/confidence 数值差推断 agreement/disagreement/persuasion
      // 原因：数值差推断的是虚假影响力网络——A 和 B belief 接近不代表他们"同意"彼此
      for (const referencedAgent of opinion.referencedAgents) {
        this.addEdge(referencedAgent, opinion.agentId, "reference", 0.5, round);
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
