import {
  GovernanceResult,
  GovernanceConfig,
  EchoChamberDetection,
  AuthorityBiasDetection,
  PolarizationDetection,
  PrematureConsensusDetection,
  GovernanceIssue,
  AgentBelief,
  MessageInfo,
  SeverityLevel,
  InterventionType,
  Intervention,
  InterventionStrategy,
  InterventionResult,
  GovernanceState,
} from "./types";
import { ReduceWeightIntervention, IntroduceDiversityIntervention, ForceReflectionIntervention, ContinueDiscussionIntervention } from "./interventions";

export class GovernanceEngine {
  private strategies: Map<InterventionType, InterventionStrategy> = new Map();

  constructor() {
    this.registerStrategy(new ReduceWeightIntervention());
    this.registerStrategy(new IntroduceDiversityIntervention());
    this.registerStrategy(new ForceReflectionIntervention());
    this.registerStrategy(new ContinueDiscussionIntervention());
  }

  registerStrategy(strategy: InterventionStrategy): void {
    this.strategies.set(strategy.type, strategy);
  }

  private defaultConfig: GovernanceConfig = {
    enableEchoChamberDetection: true,
    enableAuthorityBiasDetection: true,
    enablePolarizationDetection: true,
    enablePrematureConsensusDetection: true,
    interventionLevel: "medium",
    echoChamberThreshold: 0.7,
    authorityBiasThreshold: 0.4,
    polarizationThreshold: 0.5,
    prematureConsensusThreshold: 0.5,
    maxRounds: 3,
    currentRound: 1,
  };

  diagnose(
    agentBeliefs: AgentBelief[],
    messages: MessageInfo[],
    agentIds: string[],
    config?: GovernanceConfig
  ): GovernanceResult {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const issues: GovernanceIssue[] = [];
    let interventionCount = 0;

    const echoChamber = this.detectEchoChamber(agentBeliefs, messages, mergedConfig);
    if (echoChamber.intervention.applied) interventionCount++;

    const authorityBias = this.detectAuthorityBias(agentBeliefs, messages, mergedConfig);
    if (authorityBias.intervention.applied) interventionCount++;

    const polarization = this.detectPolarization(agentBeliefs, mergedConfig);
    if (polarization.intervention.applied) interventionCount++;

    const prematureConsensus = this.detectPrematureConsensus(agentBeliefs, mergedConfig);
    if (prematureConsensus.intervention.applied) interventionCount++;

    if (echoChamber.detected) {
      issues.push({
        type: "echo_chamber",
        severity: echoChamber.severity,
        description: `Echo chamber detected: ${echoChamber.redundantAgents.length} agents share similar information`,
        agents: echoChamber.redundantAgents,
      });
    }

    if (authorityBias.detected) {
      issues.push({
        type: "authority_bias",
        severity: authorityBias.severity,
        description: `Authority bias detected: ${authorityBias.dominantAgent} dominates with ${(authorityBias.influenceRatio * 100).toFixed(0)}% influence`,
        agents: authorityBias.dominantAgent ? [authorityBias.dominantAgent] : undefined,
      });
    }

    if (polarization.detected) {
      issues.push({
        type: "polarization",
        severity: polarization.severity,
        description: `Group polarization detected with index ${polarization.polarizationIndex.toFixed(2)}`,
        agents: polarization.groups.flatMap(g => g.agentIds),
      });
    }

    if (prematureConsensus.detected) {
      issues.push({
        type: "premature_consensus",
        severity: prematureConsensus.severity,
        description: `Premature consensus detected at round ${prematureConsensus.roundNumber}: consensus level ${prematureConsensus.consensusLevel.toFixed(2)}`,
      });
    }

    const summary = this.generateSummary(echoChamber, authorityBias, polarization, prematureConsensus, interventionCount);

    return {
      echoChamber,
      authorityBias,
      polarization,
      prematureConsensus,
      otherIssues: issues,
      summary,
      interventionCount,
    };
  }

  detectEchoChamber(
    agentBeliefs: AgentBelief[],
    messages: MessageInfo[],
    config: GovernanceConfig
  ): EchoChamberDetection {
    if (!config.enableEchoChamberDetection) {
      return {
        detected: false,
        severity: "low",
        redundantAgents: [],
        infoRedundancyScore: 0,
        intervention: { type: "none", applied: false },
      };
    }

    if (agentBeliefs.length < 3) {
      return {
        detected: false,
        severity: "low",
        redundantAgents: [],
        infoRedundancyScore: 0,
        intervention: { type: "none", applied: false },
      };
    }

    const beliefValues = agentBeliefs.map(b => b.belief);
    const beliefStd = this.computeStd(beliefValues);
    const normalizedStd = beliefStd / 2;

    const contentSimilarity = this.computeContentSimilarity(messages);
    const infoRedundancyScore = (1 - normalizedStd) * 0.5 + contentSimilarity * 0.5;

    const detected = infoRedundancyScore >= (config.echoChamberThreshold || 0.7);
    const severity = this.getSeverity(infoRedundancyScore, [0.7, 0.85]);

    let intervention: { type: InterventionType; applied: boolean; effect?: string } = {
      type: "none",
      applied: false,
    };

    if (detected && config.interventionLevel !== "none") {
      const redundantPairs = this.findRedundantAgentPairs(agentBeliefs);
      const flatPairs = redundantPairs.flat();
      const uniqueSet = new Set(flatPairs);
      const redundantAgents = Array.from(uniqueSet);

      if (config.interventionLevel === "light") {
        intervention = {
          type: "introduce_diversity",
          applied: true,
          effect: `Introduced diverse information to ${redundantAgents.length} agents`,
        };
      } else {
        intervention = {
          type: "break_connections",
          applied: true,
          effect: `Broken connections between ${redundantPairs.length} redundant agent pairs`,
        };
      }
    }

    const redundantPairs = this.findRedundantAgentPairs(agentBeliefs);
    const flatPairs = redundantPairs.flat();
    const uniqueSet = new Set(flatPairs);
    const redundantAgents = Array.from(uniqueSet);

    return {
      detected,
      severity,
      redundantAgents,
      infoRedundancyScore: Math.round(infoRedundancyScore * 100) / 100,
      intervention,
    };
  }

  detectAuthorityBias(
    agentBeliefs: AgentBelief[],
    messages: MessageInfo[],
    config: GovernanceConfig
  ): AuthorityBiasDetection {
    if (!config.enableAuthorityBiasDetection) {
      return {
        detected: false,
        severity: "low",
        influenceRatio: 0,
        intervention: { type: "none", applied: false },
      };
    }

    if (agentBeliefs.length < 2) {
      return {
        detected: false,
        severity: "low",
        influenceRatio: 0,
        intervention: { type: "none", applied: false },
      };
    }

    const messageCounts: Record<string, number> = {};
    messages.forEach(m => {
      messageCounts[m.agentId] = (messageCounts[m.agentId] || 0) + 1;
    });

    const totalMessages = Object.values(messageCounts).reduce((a, b) => a + b, 0) || 1;
    const maxMessages = Math.max(...Object.values(messageCounts));
    const influenceRatio = maxMessages / totalMessages;

    const dominantAgent = Object.keys(messageCounts).find(
      id => messageCounts[id] === maxMessages
    );

    const detected = influenceRatio >= (config.authorityBiasThreshold || 0.4);
    const severity = this.getSeverity(influenceRatio, [0.4, 0.6]);

    let intervention: { type: InterventionType; applied: boolean; effect?: string } = {
      type: "none",
      applied: false,
    };

    if (detected && config.interventionLevel !== "none" && dominantAgent) {
      if (config.interventionLevel === "light") {
        intervention = {
          type: "introduce_dissent",
          applied: true,
          effect: `Introduced dissenting agent to counter ${dominantAgent}'s influence`,
        };
      } else {
        intervention = {
          type: "reduce_weight",
          applied: true,
          effect: `Reduced ${dominantAgent}'s influence weight by ${(influenceRatio * 30).toFixed(0)}%`,
        };
      }
    }

    return {
      detected,
      severity,
      dominantAgent,
      influenceRatio: Math.round(influenceRatio * 100) / 100,
      intervention,
    };
  }

  detectPolarization(
    agentBeliefs: AgentBelief[],
    config: GovernanceConfig
  ): PolarizationDetection {
    if (!config.enablePolarizationDetection) {
      return {
        detected: false,
        severity: "low",
        groups: [],
        polarizationIndex: 0,
        intervention: { type: "none", applied: false },
      };
    }

    if (agentBeliefs.length < 4) {
      return {
        detected: false,
        severity: "low",
        groups: [],
        polarizationIndex: 0,
        intervention: { type: "none", applied: false },
      };
    }

    const beliefs = agentBeliefs.map(b => b.belief);
    const beliefStd = this.computeStd(beliefs);
    const polarizationIndex = beliefStd;

    const detected = polarizationIndex >= (config.polarizationThreshold || 0.5);
    const severity = this.getSeverity(polarizationIndex, [0.5, 0.7]);

    const groups = this.clusterAgentsByBelief(agentBeliefs);

    let intervention: { type: InterventionType; applied: boolean; effect?: string } = {
      type: "none",
      applied: false,
    };

    if (detected && config.interventionLevel !== "none") {
      if (config.interventionLevel === "light") {
        intervention = {
          type: "pair_opposites",
          applied: true,
          effect: `Paired ${groups.length} opposing groups for discussion`,
        };
      } else {
        intervention = {
          type: "force_reflection",
          applied: true,
          effect: `Forced ${agentBeliefs.length} agents to reflect on opposing viewpoints`,
        };
      }
    }

    return {
      detected,
      severity,
      groups,
      polarizationIndex: Math.round(polarizationIndex * 100) / 100,
      intervention,
    };
  }

  detectPrematureConsensus(
    agentBeliefs: AgentBelief[],
    config: GovernanceConfig
  ): PrematureConsensusDetection {
    if (!config.enablePrematureConsensusDetection) {
      return {
        detected: false,
        severity: "low",
        roundNumber: config.currentRound || 1,
        maxRounds: config.maxRounds || 3,
        beliefStd: 0,
        consensusLevel: 0,
        intervention: { type: "none", applied: false },
      };
    }

    const currentRound = config.currentRound || 1;
    const maxRounds = config.maxRounds || 3;
    const threshold = config.prematureConsensusThreshold || 0.5;

    if (agentBeliefs.length < 2 || currentRound >= maxRounds) {
      return {
        detected: false,
        severity: "low",
        roundNumber: currentRound,
        maxRounds,
        beliefStd: 0,
        consensusLevel: 0,
        intervention: { type: "none", applied: false },
      };
    }

    const beliefs = agentBeliefs.map(b => b.belief);
    const beliefStd = this.computeStd(beliefs);
    const consensusLevel = Math.max(0, 1 - beliefStd * 2);

    const roundProgress = currentRound / maxRounds;
    const detected = roundProgress < threshold && consensusLevel > 0.7 && beliefStd < 0.15;
    const severity = detected ? (roundProgress < threshold * 0.5 ? "high" : "medium") : "low";

    let intervention: { type: InterventionType; applied: boolean; effect?: string } = {
      type: "none",
      applied: false,
    };

    if (detected && config.interventionLevel !== "none") {
      const additionalRounds = Math.ceil(maxRounds * (threshold - roundProgress));
      intervention = {
        type: "continue_discussion",
        applied: true,
        effect: `Added ${additionalRounds} additional rounds to prevent premature consensus`,
      };
    }

    return {
      detected,
      severity,
      roundNumber: currentRound,
      maxRounds,
      beliefStd: Math.round(beliefStd * 100) / 100,
      consensusLevel: Math.round(consensusLevel * 100) / 100,
      intervention,
    };
  }

  private computeStd(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);
  }

  private computeContentSimilarity(messages: MessageInfo[]): number {
    if (messages.length < 2) return 0;
    const contents = messages.map(m => m.content.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    
    let totalSimilarity = 0;
    let pairCount = 0;
    
    for (let i = 0; i < contents.length; i++) {
      for (let j = i + 1; j < contents.length; j++) {
        const common = contents[i].filter(w => contents[j].includes(w)).length;
        const union = new Set([...contents[i], ...contents[j]]).size;
        totalSimilarity += union > 0 ? common / union : 0;
        pairCount++;
      }
    }
    
    return pairCount > 0 ? totalSimilarity / pairCount : 0;
  }

  private findRedundantAgentPairs(agentBeliefs: AgentBelief[]): [string, string][] {
    const pairs: [string, string][] = [];
    for (let i = 0; i < agentBeliefs.length; i++) {
      for (let j = i + 1; j < agentBeliefs.length; j++) {
        const beliefDiff = Math.abs(agentBeliefs[i].belief - agentBeliefs[j].belief);
        const confidenceDiff = Math.abs(agentBeliefs[i].confidence - agentBeliefs[j].confidence);
        if (beliefDiff < 0.1 && confidenceDiff < 10) {
          pairs.push([agentBeliefs[i].agentId, agentBeliefs[j].agentId]);
        }
      }
    }
    return pairs;
  }

  private clusterAgentsByBelief(agentBeliefs: AgentBelief[]): { label: string; agentIds: string[]; belief: number }[] {
    if (agentBeliefs.length === 0) return [];
    
    const sorted = [...agentBeliefs].sort((a, b) => a.belief - b.belief);
    const meanBelief = sorted.reduce((sum, b) => sum + b.belief, 0) / sorted.length;
    
    const groups: { label: string; agentIds: string[]; belief: number }[] = [];
    const positiveAgents = sorted.filter(b => b.belief > meanBelief + 0.2);
    const negativeAgents = sorted.filter(b => b.belief < meanBelief - 0.2);
    const neutralAgents = sorted.filter(b => Math.abs(b.belief - meanBelief) <= 0.2);
    
    if (positiveAgents.length > 0) {
      groups.push({
        label: "positive",
        agentIds: positiveAgents.map(a => a.agentId),
        belief: positiveAgents.reduce((sum, a) => sum + a.belief, 0) / positiveAgents.length,
      });
    }
    
    if (negativeAgents.length > 0) {
      groups.push({
        label: "negative",
        agentIds: negativeAgents.map(a => a.agentId),
        belief: negativeAgents.reduce((sum, a) => sum + a.belief, 0) / negativeAgents.length,
      });
    }
    
    if (neutralAgents.length > 0) {
      groups.push({
        label: "neutral",
        agentIds: neutralAgents.map(a => a.agentId),
        belief: neutralAgents.reduce((sum, a) => sum + a.belief, 0) / neutralAgents.length,
      });
    }
    
    return groups;
  }

  private getSeverity(value: number, thresholds: [number, number]): SeverityLevel {
    if (value >= thresholds[1]) return "high";
    if (value >= thresholds[0]) return "medium";
    return "low";
  }

  private generateSummary(
    echoChamber: EchoChamberDetection,
    authorityBias: AuthorityBiasDetection,
    polarization: PolarizationDetection,
    prematureConsensus: PrematureConsensusDetection,
    interventionCount: number
  ): string {
    const issues: string[] = [];
    
    if (echoChamber.detected) {
      issues.push(`echo chamber (${echoChamber.severity})`);
    }
    if (authorityBias.detected) {
      issues.push(`authority bias (${authorityBias.severity})`);
    }
    if (polarization.detected) {
      issues.push(`polarization (${polarization.severity})`);
    }
    if (prematureConsensus.detected) {
      issues.push(`premature consensus (${prematureConsensus.severity})`);
    }
    
    if (issues.length === 0) {
      return "No group decision biases detected.";
    }
    
    return `Detected ${issues.length} issue(s): ${issues.join(", ")}. ${interventionCount} intervention(s) applied.`;
  }

  applyInterventions(
    interventions: Intervention[],
    state: GovernanceState
  ): InterventionResult[] {
    const results: InterventionResult[] = [];

    for (const intervention of interventions) {
      const strategy = this.strategies.get(intervention.type);
      
      if (strategy) {
        const result = strategy.apply(intervention, state);
        results.push(result);
        
        if (result.success && result.stateChanges) {
          if (result.stateChanges.updatedEdges) {
            state.interactionGraph = state.interactionGraph || { nodes: [], edges: [] };
            state.interactionGraph.edges = result.stateChanges.updatedEdges;
          }
          if (result.stateChanges.updatedBeliefs) {
            state.agentBeliefs = result.stateChanges.updatedBeliefs;
          }
        }
      } else {
        results.push({
          success: false,
          intervention: { ...intervention, applied: false },
        });
      }
    }

    return results;
  }

  diagnoseAndIntervene(
    agentBeliefs: AgentBelief[],
    messages: MessageInfo[],
    agentIds: string[],
    interactionGraph?: GovernanceState["interactionGraph"],
    config?: GovernanceConfig
  ): { result: GovernanceResult; interventions: Intervention[] } {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const state: GovernanceState = {
      agentBeliefs,
      messages,
      agentIds,
      interactionGraph,
    };

    const result = this.diagnose(agentBeliefs, messages, agentIds, mergedConfig);
    const interventions: Intervention[] = [];

    if (result.authorityBias.detected && result.authorityBias.dominantAgent) {
      interventions.push({
        type: "reduce_weight",
        targetAgentId: result.authorityBias.dominantAgent,
        parameters: { reductionFactor: 0.5 },
        effect: "",
        applied: false,
      });
    }

    if (result.echoChamber.detected && result.echoChamber.redundantAgents.length > 0) {
      interventions.push({
        type: "introduce_diversity",
        targetAgents: result.echoChamber.redundantAgents,
        parameters: { perturbationAmount: 0.3 },
        effect: "",
        applied: false,
      });
    }

    if (result.polarization.detected && result.polarization.groups.length > 0) {
      const extremeAgents = result.polarization.groups
        .filter(g => g.label === "positive" || g.label === "negative")
        .flatMap(g => g.agentIds);
      
      if (extremeAgents.length > 0) {
        interventions.push({
          type: "force_reflection",
          targetAgents: extremeAgents,
          parameters: { reflectionFactor: 0.2 },
          effect: "",
          applied: false,
        });
      }
    }

    if (result.prematureConsensus.detected) {
      const currentRound = result.prematureConsensus.roundNumber;
      const maxRounds = result.prematureConsensus.maxRounds;
      const threshold = mergedConfig.prematureConsensusThreshold || 0.5;
      const roundProgress = currentRound / maxRounds;
      const additionalRounds = Math.ceil(maxRounds * (threshold - roundProgress));
      
      interventions.push({
        type: "continue_discussion",
        parameters: {
          additionalRounds: Math.max(additionalRounds, 1),
          reason: `Premature consensus at round ${currentRound}`,
        },
        effect: "",
        applied: false,
      });
    }

    return { result, interventions };
  }

  evaluateEffects(
    beforeState: GovernanceState,
    afterState: GovernanceState,
    interventions: Intervention[]
  ): Record<string, number> {
    const effects: Record<string, number> = {};

    const beforeBeliefs = beforeState.agentBeliefs.map(b => b.belief);
    const afterBeliefs = afterState.agentBeliefs.map(b => b.belief);

    const beforeStd = this.computeStd(beforeBeliefs);
    const afterStd = this.computeStd(afterBeliefs);
    effects["belief_diversity_change"] = Math.round((afterStd - beforeStd) * 1000) / 1000;

    const beforeMean = beforeBeliefs.reduce((sum, b) => sum + b, 0) / beforeBeliefs.length;
    const afterMean = afterBeliefs.reduce((sum, b) => sum + b, 0) / afterBeliefs.length;
    effects["belief_mean_change"] = Math.round((afterMean - beforeMean) * 1000) / 1000;

    const beforeConsensusLevel = Math.max(0, 1 - beforeStd * 2);
    const afterConsensusLevel = Math.max(0, 1 - afterStd * 2);
    effects["consensus_level_change"] = Math.round((afterConsensusLevel - beforeConsensusLevel) * 1000) / 1000;

    const beforeConfidences = beforeState.agentBeliefs.map(b => b.confidence);
    const afterConfidences = afterState.agentBeliefs.map(b => b.confidence);
    effects["avg_confidence_change"] = Math.round(
      ((afterConfidences.reduce((sum, c) => sum + c, 0) / afterConfidences.length) -
      (beforeConfidences.reduce((sum, c) => sum + c, 0) / beforeConfidences.length)) * 1000
    ) / 1000;

    const successfulInterventions = interventions.filter(i => i.applied).length;
    const totalInterventions = interventions.length;
    effects["successful_interventions"] = successfulInterventions;
    effects["intervention_success_rate"] = totalInterventions > 0 
      ? Math.round((successfulInterventions / totalInterventions) * 100) 
      : 0;

    if (beforeState.interactionGraph && afterState.interactionGraph) {
      const beforeTotalWeight = beforeState.interactionGraph.edges.reduce((sum, e) => sum + e.weight, 0);
      const afterTotalWeight = afterState.interactionGraph.edges.reduce((sum, e) => sum + e.weight, 0);
      effects["total_influence_weight_change"] = Math.round((afterTotalWeight - beforeTotalWeight) * 1000) / 1000;

      const beforeEdgeCount = beforeState.interactionGraph.edges.length;
      const afterEdgeCount = afterState.interactionGraph.edges.length;
      effects["interaction_edge_count_change"] = afterEdgeCount - beforeEdgeCount;
    }

    const beforeMin = Math.min(...beforeBeliefs);
    const beforeMax = Math.max(...beforeBeliefs);
    const afterMin = Math.min(...afterBeliefs);
    const afterMax = Math.max(...afterBeliefs);
    effects["belief_range_before"] = Math.round((beforeMax - beforeMin) * 1000) / 1000;
    effects["belief_range_after"] = Math.round((afterMax - afterMin) * 1000) / 1000;

    return effects;
  }
}

export * from "./types";
export * from "./interventions";