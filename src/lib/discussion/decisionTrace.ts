import {
  DecisionTraceEntry,
  EnhancedDecisionTraceEntry,
  DecisionTrace,
  AgentOpinion,
  InteractionGraph,
  DiscussionMemoryEntry,
  InfluenceRecord,
  InfluenceFactor,
  ConsensusEvent,
  DecisionEvent,
} from "./types";

export class DecisionTraceBuilder {
  private trace: DecisionTraceEntry[] = [];
  private enhancedTrace: EnhancedDecisionTraceEntry[] = [];
  private agentBeliefHistory: Map<string, number[]> = new Map();
  private agentConfidenceHistory: Map<string, number[]> = new Map();
  private consensusEvents: ConsensusEvent[] = [];
  private influenceRecords: InfluenceRecord[] = [];

  addRound(
    roundNumber: number,
    opinions: AgentOpinion[],
    memory: DiscussionMemoryEntry[],
    graph: InteractionGraph,
    influenceWeights?: Map<string, InfluenceFactor[]>,
    interventions?: unknown[]
  ): void {
    const timestamp = new Date().toISOString();
    const prevRoundBeliefs = new Map<string, number>();
    const prevRoundConfidences = new Map<string, number>();

    for (const opinion of opinions) {
      const prevBelief = this.getPreviousBelief(opinion.agentId);
      const prevConfidence = this.getPreviousConfidence(opinion.agentId);
      prevRoundBeliefs.set(opinion.agentId, prevBelief);
      prevRoundConfidences.set(opinion.agentId, prevConfidence);
    }

    for (const opinion of opinions) {
      const prevBelief = prevRoundBeliefs.get(opinion.agentId)!;
      const prevConfidence = prevRoundConfidences.get(opinion.agentId)!;
      const beliefChange = opinion.belief - prevBelief;
      const confidenceChange = opinion.confidence - prevConfidence;

      const influencers = this.getInfluencers(opinion.agentId, graph);
      const decision = this.extractDecision(opinion.reasoning);
      const decisionType = this.extractDecisionType(opinion.reasoning, opinion.belief);
      const eventType = this.determineEventType(opinion, beliefChange, influencers);

      const influenceFactors = influenceWeights?.get(opinion.agentId) || this.extractInfluenceFactors(opinion, influencers);

      const influencesReceived = this.getInfluenceRecordsReceived(opinion.agentId, graph, roundNumber, opinions);
      const influencesExerted = this.getInfluenceRecordsExerted(opinion.agentId, graph, roundNumber, opinions);

      const entry: DecisionTraceEntry = {
        agentId: opinion.agentId,
        roundNumber,
        decision,
        belief: opinion.belief,
        beliefChange,
        influencers: influencers.map(i => i.agentId),
        reasoning: opinion.reasoning,
        timestamp,
      };

      const enhancedEntry: EnhancedDecisionTraceEntry = {
        ...entry,
        beliefChangeReasons: influenceFactors,
        confidence: opinion.confidence,
        confidenceChange,
        decisionType,
        evidence: opinion.evidence,
        influencesReceived,
        influencesExerted,
        referencedAgents: opinion.referencedAgents,
        referencedEvidence: [],
        eventType,
      };

      this.trace.push(entry);
      this.enhancedTrace.push(enhancedEntry);

      this.updateBeliefHistory(opinion.agentId, opinion.belief);
      this.updateConfidenceHistory(opinion.agentId, opinion.confidence);

      for (const record of influencesReceived) {
        this.influenceRecords.push(record);
      }
    }

    this.checkConsensusEvent(roundNumber, opinions, timestamp);
  }

  private getPreviousBelief(agentId: string): number {
    const history = this.agentBeliefHistory.get(agentId);
    if (!history || history.length === 0) {
      return 0;
    }
    return history[history.length - 1];
  }

  private getPreviousConfidence(agentId: string): number {
    const history = this.agentConfidenceHistory.get(agentId);
    if (!history || history.length === 0) {
      return 50;
    }
    return history[history.length - 1];
  }

  private updateBeliefHistory(agentId: string, belief: number): void {
    const history = this.agentBeliefHistory.get(agentId) || [];
    history.push(belief);
    this.agentBeliefHistory.set(agentId, history);
  }

  private updateConfidenceHistory(agentId: string, confidence: number): void {
    const history = this.agentConfidenceHistory.get(agentId) || [];
    history.push(confidence);
    this.agentConfidenceHistory.set(agentId, history);
  }

  private getInfluencers(agentId: string, graph: InteractionGraph): { agentId: string; weight: number }[] {
    return graph.edges
      .filter(e => e.target === agentId)
      .map(e => ({
        agentId: e.source,
        weight: e.weight,
      }))
      .sort((a, b) => b.weight - a.weight);
  }

  private extractDecision(reasoning: string): string {
    const keywords = ["同意", "反对", "支持", "否决", "赞成", "不同意", "认为", "建议", "结论"];
    for (const keyword of keywords) {
      const index = reasoning.indexOf(keyword);
      if (index !== -1) {
        return reasoning.substring(index, Math.min(index + 50, reasoning.length)).trim();
      }
    }
    return reasoning.substring(0, 50).trim();
  }

  private extractDecisionType(reasoning: string, belief: number): "affirmative" | "negative" | "neutral" | "conditional" {
    if (belief > 0.3) return "affirmative";
    if (belief < -0.3) return "negative";
    
    const conditionalKeywords = ["如果", "条件", "假设", "取决于", "可能"];
    for (const keyword of conditionalKeywords) {
      if (reasoning.includes(keyword)) {
        return "conditional";
      }
    }
    
    return "neutral";
  }

  private determineEventType(
    opinion: AgentOpinion,
    beliefChange: number,
    influencers: { agentId: string; weight: number }[]
  ): DecisionEvent["type"] {
    if (opinion.referencedAgents.length > 0) {
      return "response";
    }
    
    if (beliefChange > 0.2 && influencers.length > 0) {
      return "persuasion";
    }
    
    if (beliefChange < -0.2 && influencers.length > 0) {
      return "refutation";
    }
    
    const positiveBeliefs = influencers.filter(i => {
      const agentOpinion = opinion.referencedAgents.includes(i.agentId);
      return agentOpinion;
    });
    
    if (positiveBeliefs.length > influencers.length / 2) {
      return "agreement";
    }
    
    return "initial_opinion";
  }

  private extractInfluenceFactors(
    opinion: AgentOpinion,
    influencers: { agentId: string; weight: number }[]
  ): InfluenceFactor[] {
    const factors: InfluenceFactor[] = [];

    for (const influencer of influencers) {
      if (influencer.weight > 0.1) {
        factors.push({
          type: "agent_influence",
          sourceId: influencer.agentId,
          description: `受到 Agent ${influencer.agentId} 的影响，权重: ${influencer.weight.toFixed(2)}`,
          weight: influencer.weight,
        });
      }
    }

    if (opinion.evidence.length > 0) {
      factors.push({
        type: "evidence",
        description: `引用了 ${opinion.evidence.length} 条证据: ${opinion.evidence.join(", ")}`,
        weight: Math.min(opinion.evidence.length * 0.2, 0.6),
      });
    }

    if (opinion.reasoning.length > 100) {
      factors.push({
        type: "self_reflection",
        description: "基于自身推理得出结论",
        weight: 0.3,
      });
    }

    if (opinion.referencedAgents.length > 0) {
      factors.push({
        type: "discussion",
        description: `回应了 ${opinion.referencedAgents.length} 个 Agent 的观点: ${opinion.referencedAgents.join(", ")}`,
        weight: Math.min(opinion.referencedAgents.length * 0.15, 0.45),
      });
    }

    const externalKeywords = ["根据", "基于", "来自", "数据显示", "研究表明", "报告指出"];
    for (const keyword of externalKeywords) {
      if (opinion.reasoning.includes(keyword)) {
        factors.push({
          type: "external",
          description: "引用了外部信息来源",
          weight: 0.25,
        });
        break;
      }
    }

    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    if (totalWeight > 0) {
      for (const factor of factors) {
        factor.weight = factor.weight / totalWeight;
      }
    }

    return factors.sort((a, b) => b.weight - a.weight);
  }

  private getInfluenceRecordsReceived(
    agentId: string,
    graph: InteractionGraph,
    roundNumber: number,
    opinions: AgentOpinion[]
  ): InfluenceRecord[] {
    return graph.edges
      .filter(e => e.target === agentId)
      .map(e => {
        const sourceOpinion = opinions.find(o => o.agentId === e.source);
        const targetOpinion = opinions.find(o => o.agentId === e.target);
        
        let reasoning = "";
        if (sourceOpinion && targetOpinion) {
          const beliefDiff = Math.abs(sourceOpinion.belief - targetOpinion.belief);
          if (e.type === "agreement") {
            reasoning = `Agent ${e.source} 与 Agent ${e.target} 观点一致（信念差: ${beliefDiff.toFixed(2)}）`;
          } else if (e.type === "disagreement") {
            reasoning = `Agent ${e.source} 与 Agent ${e.target} 观点分歧（信念差: ${beliefDiff.toFixed(2)}）`;
          } else if (e.type === "reference") {
            reasoning = `Agent ${e.target} 引用了 Agent ${e.source} 的观点`;
          } else if (e.type === "persuasion") {
            reasoning = `Agent ${e.source} 说服了 Agent ${e.target}`;
          }
        }
        
        return {
          sourceAgentId: e.source,
          targetAgentId: agentId,
          type: e.type,
          weight: e.weight,
          round: roundNumber,
          timestamp: new Date().toISOString(),
          reasoning,
        };
      });
  }

  private getInfluenceRecordsExerted(
    agentId: string,
    graph: InteractionGraph,
    roundNumber: number,
    opinions: AgentOpinion[]
  ): InfluenceRecord[] {
    return graph.edges
      .filter(e => e.source === agentId)
      .map(e => {
        const sourceOpinion = opinions.find(o => o.agentId === e.source);
        const targetOpinion = opinions.find(o => o.agentId === e.target);
        
        let reasoning = "";
        if (sourceOpinion && targetOpinion) {
          const beliefDiff = Math.abs(sourceOpinion.belief - targetOpinion.belief);
          if (e.type === "agreement") {
            reasoning = `Agent ${e.source} 与 Agent ${e.target} 观点一致（信念差: ${beliefDiff.toFixed(2)}）`;
          } else if (e.type === "disagreement") {
            reasoning = `Agent ${e.source} 与 Agent ${e.target} 观点分歧（信念差: ${beliefDiff.toFixed(2)}）`;
          } else if (e.type === "reference") {
            reasoning = `Agent ${e.source} 被 Agent ${e.target} 引用`;
          } else if (e.type === "persuasion") {
            reasoning = `Agent ${e.source} 对 Agent ${e.target} 产生了说服效果`;
          }
        }
        
        return {
          sourceAgentId: agentId,
          targetAgentId: e.target,
          type: e.type,
          weight: e.weight,
          round: roundNumber,
          timestamp: new Date().toISOString(),
          reasoning,
        };
      });
  }

  private checkConsensusEvent(roundNumber: number, opinions: AgentOpinion[], timestamp: string): void {
    if (opinions.length < 2) return;

    const beliefs = opinions.map(o => o.belief);
    const meanBelief = beliefs.reduce((sum, b) => sum + b, 0) / beliefs.length;
    const beliefStd = Math.sqrt(beliefs.reduce((sum, b) => sum + Math.pow(b - meanBelief, 2), 0) / beliefs.length);
    const consensusLevel = Math.max(0, 1 - beliefStd * 2);

    const agentsInAgreement = opinions.filter(o => Math.abs(o.belief - meanBelief) < 0.3).map(o => o.agentId);
    const agentsInDisagreement = opinions.filter(o => Math.abs(o.belief - meanBelief) >= 0.3).map(o => o.agentId);

    if (this.consensusEvents.length > 0) {
      const prevEvent = this.consensusEvents[this.consensusEvents.length - 1];
      const consensusChange = consensusLevel - prevEvent.consensusLevel;
      
      if (consensusChange > 0.3) {
        this.consensusEvents.push({
          roundNumber,
          timestamp,
          consensusLevel,
          agentsInAgreement,
          agentsInDisagreement,
          beliefStd,
          triggerDescription: `冲突解决，共识度提升 ${consensusChange.toFixed(2)}`,
        });
        return;
      }
    }

    if (consensusLevel >= 0.7 && agentsInAgreement.length >= opinions.length * 0.8) {
      this.consensusEvents.push({
        roundNumber,
        timestamp,
        consensusLevel,
        agentsInAgreement,
        agentsInDisagreement,
        beliefStd,
        triggerDescription: `共识达成，共识度: ${consensusLevel.toFixed(2)}`,
      });
    } else if (consensusLevel < 0.3 && agentsInDisagreement.length >= opinions.length * 0.5) {
      this.consensusEvents.push({
        roundNumber,
        timestamp,
        consensusLevel,
        agentsInAgreement,
        agentsInDisagreement,
        beliefStd,
        triggerDescription: `冲突加剧，共识度: ${consensusLevel.toFixed(2)}`,
      });
    }
  }

  getTrace(): DecisionTraceEntry[] {
    return [...this.trace];
  }

  getEnhancedTrace(): EnhancedDecisionTraceEntry[] {
    return [...this.enhancedTrace];
  }

  getTraceByAgent(agentId: string): DecisionTraceEntry[] {
    return this.trace.filter(t => t.agentId === agentId);
  }

  getEnhancedTraceByAgent(agentId: string): EnhancedDecisionTraceEntry[] {
    return this.enhancedTrace.filter(t => t.agentId === agentId);
  }

  getInfluenceChain(targetAgentId: string): DecisionTraceEntry[] {
    const result: DecisionTraceEntry[] = [];
    const visited = new Set<string>();
    this.buildInfluenceChain(targetAgentId, 0, visited, result);
    return result;
  }

  private buildInfluenceChain(
    agentId: string,
    depth: number,
    visited: Set<string>,
    result: DecisionTraceEntry[]
  ): void {
    if (visited.has(agentId) || depth > 5) return;
    visited.add(agentId);

    const agentTrace = this.getTraceByAgent(agentId);
    if (agentTrace.length > 0) {
      result.push(agentTrace[agentTrace.length - 1]);
    }

    for (const entry of agentTrace) {
      for (const influencer of entry.influencers) {
        this.buildInfluenceChain(influencer, depth + 1, visited, result);
      }
    }
  }

  getBeliefChanges(agentId: string): { round: number; belief: number; change: number }[] {
    const history = this.agentBeliefHistory.get(agentId);
    if (!history || history.length === 0) return [];

    return history.map((belief, index) => ({
      round: index + 1,
      belief,
      change: index === 0 ? belief : belief - history[index - 1],
    }));
  }

  getBeliefTrajectory(agentId: string): { round: number; belief: number; confidence: number }[] {
    const beliefHistory = this.agentBeliefHistory.get(agentId) || [];
    const confidenceHistory = this.agentConfidenceHistory.get(agentId) || [];

    return beliefHistory.map((belief, index) => ({
      round: index + 1,
      belief,
      confidence: confidenceHistory[index] || 50,
    }));
  }

  findKeyInfluencers(minWeight: number = 0.3): { agentId: string; influenceCount: number; totalWeight: number }[] {
    const influenceMap = new Map<string, { count: number; weight: number }>();

    for (const entry of this.trace) {
      for (const influencer of entry.influencers) {
        const existing = influenceMap.get(influencer) || { count: 0, weight: 0 };
        existing.count++;
        existing.weight += Math.abs(entry.beliefChange);
        influenceMap.set(influencer, existing);
      }
    }

    return Array.from(influenceMap.entries())
      .map(([agentId, data]) => ({
        agentId,
        influenceCount: data.count,
        totalWeight: data.weight,
      }))
      .filter(i => i.totalWeight >= minWeight)
      .sort((a, b) => b.totalWeight - a.totalWeight);
  }

  summarize(): {
    totalRounds: number;
    totalAgents: number;
    keyInfluencers: { agentId: string; influenceCount: number; totalWeight: number }[];
    beliefChanges: Record<string, { max: number; min: number; avg: number }>;
    consensusTimeline: ConsensusEvent[];
    criticalEvents: DecisionEvent[];
  } {
    const roundNumbers = this.trace.map(t => t.roundNumber);
    const uniqueRoundSet = new Set(roundNumbers);
    const rounds = Array.from(uniqueRoundSet);
    
    const agentIds = this.trace.map(t => t.agentId);
    const uniqueAgentSet = new Set(agentIds);
    const agents = Array.from(uniqueAgentSet);
    const keyInfluencers = this.findKeyInfluencers();

    const beliefChanges: Record<string, { max: number; min: number; avg: number }> = {};
    for (const agent of agents) {
      const changes = this.getBeliefChanges(agent);
      if (changes.length > 0) {
        beliefChanges[agent] = {
          max: Math.max(...changes.map(c => c.change)),
          min: Math.min(...changes.map(c => c.change)),
          avg: changes.reduce((sum, c) => sum + c.change, 0) / changes.length,
        };
      }
    }

    const criticalEvents: DecisionEvent[] = this.enhancedTrace
      .filter(e => ["persuasion", "refutation", "agreement", "disagreement", "consensus"].includes(e.eventType))
      .map(e => ({
        type: e.eventType,
        agentId: e.agentId,
        roundNumber: e.roundNumber,
        timestamp: e.timestamp,
        description: e.reasoning.substring(0, 100),
        involvedAgents: e.referencedAgents,
      }));

    return {
      totalRounds: rounds.length,
      totalAgents: agents.length,
      keyInfluencers,
      beliefChanges,
      consensusTimeline: [...this.consensusEvents],
      criticalEvents,
    };
  }

  answerWhoInfluencedWhom(): { source: string; target: string; weight: number; type: string }[] {
    const result: { source: string; target: string; weight: number; type: string }[] = [];
    const seen = new Set<string>();

    for (const record of this.influenceRecords) {
      const key = `${record.sourceAgentId}->${record.targetAgentId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      result.push({
        source: record.sourceAgentId,
        target: record.targetAgentId,
        weight: record.weight,
        type: record.type,
      });
    }

    return result.sort((a, b) => b.weight - a.weight);
  }

  answerWhen(agentId: string): { event: DecisionEvent; timestamp: string }[] {
    const agentTrace = this.getEnhancedTraceByAgent(agentId);

    return agentTrace.map(e => ({
      event: {
        type: e.eventType,
        agentId: e.agentId,
        roundNumber: e.roundNumber,
        timestamp: e.timestamp,
        description: e.reasoning.substring(0, 100),
        involvedAgents: e.referencedAgents,
      },
      timestamp: e.timestamp,
    }));
  }

  answerWhy(agentId: string): InfluenceFactor[] {
    const agentTrace = this.getEnhancedTraceByAgent(agentId);
    if (agentTrace.length === 0) return [];

    const latestEntry = agentTrace[agentTrace.length - 1];
    return latestEntry.beliefChangeReasons;
  }

  answerBeliefChangedBecauseOf(agentId: string, roundNumber: number): InfluenceFactor[] {
    const agentTrace = this.getEnhancedTraceByAgent(agentId);
    const entry = agentTrace.find(e => e.roundNumber === roundNumber);
    return entry?.beliefChangeReasons || [];
  }

  answerConsensusEmergedAt(): ConsensusEvent | null {
    if (this.consensusEvents.length === 0) return null;
    return this.consensusEvents[0];
  }

  answerConflictResolvedAt(): { roundNumber: number; timestamp: string; description: string; consensusIncrease: number } | null {
    for (let i = 1; i < this.consensusEvents.length; i++) {
      const prevEvent = this.consensusEvents[i - 1];
      const currEvent = this.consensusEvents[i];
      const consensusIncrease = currEvent.consensusLevel - prevEvent.consensusLevel;
      
      if (consensusIncrease > 0.3) {
        return {
          roundNumber: currEvent.roundNumber,
          timestamp: currEvent.timestamp,
          description: `冲突在第 ${currEvent.roundNumber} 轮解决，共识度从 ${prevEvent.consensusLevel.toFixed(2)} 提升到 ${currEvent.consensusLevel.toFixed(2)}`,
          consensusIncrease: Math.round(consensusIncrease * 100) / 100,
        };
      }
    }
    return null;
  }

  getAllConsensusEvents(): ConsensusEvent[] {
    return [...this.consensusEvents];
  }

  getCompleteTrace(): DecisionTrace {
    const beliefTrajectories: Record<string, { round: number; belief: number; confidence: number }[]> = {};
    const agentIdArray = this.trace.map(t => t.agentId);
    const uniqueAgentSet = new Set(agentIdArray);
    const agentIds = Array.from(uniqueAgentSet);
    
    for (const agentId of agentIds) {
      beliefTrajectories[agentId] = this.getBeliefTrajectory(agentId);
    }

    return {
      entries: this.getTrace(),
      enhancedEntries: this.getEnhancedTrace(),
      consensusEvents: [...this.consensusEvents],
      influenceGraph: [...this.influenceRecords],
      beliefTrajectories,
    };
  }

  clear(): void {
    this.trace = [];
    this.enhancedTrace = [];
    this.agentBeliefHistory.clear();
    this.agentConfidenceHistory.clear();
    this.consensusEvents = [];
    this.influenceRecords = [];
  }
}