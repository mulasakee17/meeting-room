import {
  EvaluationResult,
  ConsensusMetric,
  ReliabilityMetric,
  ExplainabilityMetric,
  RobustnessMetric,
  StabilityMetric,
  ManipulationResistanceMetric,
  InfluenceAnalysisMetric,
  AgentDecision,
  AgentInfo,
  InteractionRound,
  EvaluationConfig,
  GroundTruth,
  ConsensusTrajectory,
  ConsensusRoundData,
  InfluencePath,
} from "./types";

export class EvaluationEngine {
  private defaultWeights: Record<string, number> = {
    consensus: 0.15,
    reliability: 0.18,
    explainability: 0.15,
    robustness: 0.15,
    stability: 0.12,
    manipulationResistance: 0.12,
    influenceAnalysis: 0.13,
  };

  evaluate(
    agentDecisions: AgentDecision[],
    agents: AgentInfo[],
    interactionHistory: InteractionRound[],
    finalDecision: string,
    config?: EvaluationConfig,
    groundTruth?: GroundTruth
  ): EvaluationResult {
    const weights = config?.weights || this.defaultWeights;

    const consensus = this.evaluateConsensus(agentDecisions, interactionHistory);
    const reliability = this.evaluateReliability(agentDecisions, finalDecision, groundTruth);
    const explainability = this.evaluateExplainability(agentDecisions, interactionHistory);
    const robustness = this.evaluateRobustness(agentDecisions, interactionHistory);
    const stability = this.evaluateStability(interactionHistory);
    const manipulationResistance = this.evaluateManipulationResistance(agentDecisions, agents);
    const influenceAnalysis = this.evaluateInfluenceAnalysis(agentDecisions, agents, interactionHistory);

    const overallScore = this.computeOverallScore({
      consensus,
      reliability,
      explainability,
      robustness,
      stability,
      manipulationResistance,
      influenceAnalysis,
    }, weights);

    const grade = this.computeGrade(overallScore);
    const summary = this.generateSummary(overallScore, grade, {
      consensus,
      reliability,
      explainability,
      robustness,
      stability,
      manipulationResistance,
      influenceAnalysis,
    });

    return {
      overallScore,
      dimensions: {
        consensus,
        reliability,
        explainability,
        robustness,
        stability,
        manipulationResistance,
        influenceAnalysis,
      },
      summary,
      grade,
    };
  }

  evaluateConsensus(agentDecisions: AgentDecision[], interactionHistory: InteractionRound[]): ConsensusMetric {
    if (agentDecisions.length === 0) {
      return { 
        score: 0, 
        kuramotoOrder: 0, 
        beliefStd: 0, 
        agreementRate: 0,
        trajectory: { rounds: [], convergenceSpeed: 0, finalConsensus: 0, consensusChangeRate: 0, volatility: 0, turningPoints: [] },
        details: "No agent decisions" 
      };
    }

    const beliefs = agentDecisions.map(d => d.belief || 0);
    const meanBelief = beliefs.reduce((a, b) => a + b, 0) / beliefs.length;
    const beliefStd = Math.sqrt(beliefs.reduce((sum, b) => sum + Math.pow(b - meanBelief, 2), 0) / beliefs.length);

    const decisions = agentDecisions.map(d => d.content.toLowerCase().trim());
    const uniqueDecisions = new Set(decisions);
    const agreementRate = uniqueDecisions.size === 1 ? 100 : 
      100 - (uniqueDecisions.size / agentDecisions.length) * 50;

    const kuramotoOrder = this.computeKuramotoOrder(beliefs);

    const trajectory = this.computeConsensusTrajectory(interactionHistory);

    const score = (kuramotoOrder * 30) + ((1 - beliefStd / 2) * 40) + (agreementRate / 100 * 30);

    return {
      score: Math.min(100, Math.max(0, score)),
      kuramotoOrder: Math.round(kuramotoOrder * 100) / 100,
      beliefStd: Math.round(beliefStd * 100) / 100,
      agreementRate: Math.round(agreementRate),
      trajectory,
      details: beliefStd < 0.3 ? "High consensus, beliefs are closely aligned" :
               beliefStd < 0.6 ? "Moderate consensus, some divergence" :
               "Low consensus, significant disagreement",
    };
  }

  private computeConsensusTrajectory(interactionHistory: InteractionRound[]): ConsensusTrajectory {
    const rounds: ConsensusRoundData[] = [];
    
    for (const round of interactionHistory) {
      const roundBeliefs = Object.values(round.beliefs);
      if (roundBeliefs.length === 0) continue;

      const avgBelief = roundBeliefs.reduce((a, b) => a + b, 0) / roundBeliefs.length;
      const std = Math.sqrt(roundBeliefs.reduce((sum, b) => sum + Math.pow(b - avgBelief, 2), 0) / roundBeliefs.length);
      const ko = this.computeKuramotoOrder(roundBeliefs);

      const decisions = round.messages.map(m => m.content.toLowerCase().trim());
      const uniqueDecisions = new Set(decisions);
      const agreementRate = uniqueDecisions.size === 1 ? 100 :
        100 - (uniqueDecisions.size / decisions.length) * 50;

      rounds.push({
        round: round.round,
        kuramotoOrder: Math.round(ko * 100) / 100,
        beliefStd: Math.round(std * 100) / 100,
        agreementRate: Math.round(agreementRate),
        avgBelief: Math.round(avgBelief * 100) / 100,
      });
    }

    let convergenceRound: number | undefined;
    const convergenceThreshold = 0.15;
    for (let i = 0; i < rounds.length; i++) {
      if (rounds[i].beliefStd < convergenceThreshold) {
        convergenceRound = rounds[i].round;
        break;
      }
    }

    const convergenceSpeed = rounds.length > 0 && convergenceRound 
      ? 100 / convergenceRound 
      : 0;

    const finalConsensus = rounds.length > 0 
      ? rounds[rounds.length - 1].kuramotoOrder 
      : 0;

    const consensusChangeRate = rounds.length > 1 
      ? (finalConsensus - rounds[0].kuramotoOrder) / (rounds.length - 1) 
      : 0;

    let volatility = 0;
    if (rounds.length > 1) {
      const koValues = rounds.map(r => r.kuramotoOrder);
      const meanKo = koValues.reduce((a, b) => a + b, 0) / koValues.length;
      volatility = Math.sqrt(koValues.reduce((sum, ko) => sum + Math.pow(ko - meanKo, 2), 0) / koValues.length);
    }

    const turningPoints: { round: number; type: "increase" | "decrease" | "plateau" }[] = [];
    for (let i = 1; i < rounds.length; i++) {
      const prevKo = rounds[i - 1].kuramotoOrder;
      const currKo = rounds[i].kuramotoOrder;
      const diff = currKo - prevKo;
      
      if (Math.abs(diff) > 0.1) {
        turningPoints.push({
          round: rounds[i].round,
          type: diff > 0 ? "increase" : "decrease",
        });
      } else {
        turningPoints.push({
          round: rounds[i].round,
          type: "plateau",
        });
      }
    }

    return {
      rounds,
      convergenceRound,
      convergenceSpeed: Math.round(convergenceSpeed * 100) / 100,
      finalConsensus,
      consensusChangeRate: Math.round(consensusChangeRate * 1000) / 1000,
      volatility: Math.round(volatility * 1000) / 1000,
      turningPoints,
    };
  }

  evaluateReliability(agentDecisions: AgentDecision[], finalDecision: string, groundTruth?: GroundTruth): ReliabilityMetric {
    if (agentDecisions.length === 0) {
      return { 
        score: 0, 
        crossValidationScore: 0, 
        consistencyScore: 0,
        cronbachAlpha: 0,
        repeatabilityScore: 0,
        confidenceInterval: [0, 0],
        details: "No agent decisions" 
      };
    }

    const avgConfidence = agentDecisions.reduce((sum, d) => sum + d.confidence, 0) / agentDecisions.length;

    const decisionContents = agentDecisions.map(d => d.content.toLowerCase().trim());
    const finalLower = finalDecision.toLowerCase().trim();
    const consistencyScore = decisionContents.filter(d => 
      d.includes(finalLower) || finalLower.includes(d) || 
      this.semanticSimilarity(d, finalLower) > 0.5
    ).length / agentDecisions.length * 100;

    const crossValidationScore = consistencyScore;

    let groundTruthMatch: boolean | undefined;
    if (groundTruth) {
      groundTruthMatch = this.semanticSimilarity(finalLower, groundTruth.content.toLowerCase().trim()) > 0.6;
    }

    const cronbachAlpha = this.computeCronbachAlpha(agentDecisions);
    const repeatabilityScore = this.computeRepeatabilityScore(agentDecisions);
    const confidenceInterval = this.computeConfidenceInterval(agentDecisions);

    const baseScore = avgConfidence * 0.2 + consistencyScore * 0.3 + cronbachAlpha * 30 + repeatabilityScore * 0.2;
    const truthBonus = groundTruthMatch ? 15 : 0;
    const score = Math.min(100, baseScore + truthBonus);

    return {
      score: Math.round(score * 10) / 10,
      crossValidationScore: Math.round(crossValidationScore),
      consistencyScore: Math.round(consistencyScore),
      groundTruthMatch,
      cronbachAlpha: Math.round(cronbachAlpha * 100) / 100,
      repeatabilityScore: Math.round(repeatabilityScore * 100) / 100,
      confidenceInterval: [Math.round(confidenceInterval[0] * 100) / 100, Math.round(confidenceInterval[1] * 100) / 100],
      details: consistencyScore >= 80 ? "High reliability, decisions are consistent" :
               consistencyScore >= 50 ? "Moderate reliability, some inconsistencies" :
               "Low reliability, inconsistent decisions",
    };
  }

  private computeCronbachAlpha(agentDecisions: AgentDecision[]): number {
    if (agentDecisions.length < 2) return 0;

    const k = 2;
    const confidences = agentDecisions.map(d => d.confidence);
    const beliefs = agentDecisions.map(d => d.belief || 0);
    
    const allValues = [...confidences, ...beliefs];
    const totalMean = allValues.reduce((a, b) => a + b, 0) / allValues.length;
    const totalVariance = allValues.reduce((sum, val) => 
      sum + Math.pow(val - totalMean, 2), 0) / (allValues.length - 1);
    
    if (totalVariance === 0) return 0;

    const confidenceMean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const confidenceVariance = confidences.reduce((sum, val) => 
      sum + Math.pow(val - confidenceMean, 2), 0) / (confidences.length - 1);

    const beliefMean = beliefs.reduce((a, b) => a + b, 0) / beliefs.length;
    const beliefVariance = beliefs.reduce((sum, val) => 
      sum + Math.pow(val - beliefMean, 2), 0) / (beliefs.length - 1);

    const sumItemVariances = confidenceVariance + beliefVariance;
    const alpha = (k / (k - 1)) * (1 - sumItemVariances / totalVariance);
    
    return Math.max(0, Math.min(1, alpha));
  }

  private computeVariance(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
  }

  private computeRepeatabilityScore(agentDecisions: AgentDecision[]): number {
    if (agentDecisions.length < 2) return 0;

    const beliefs = agentDecisions.map(d => d.belief || 0);
    const decisions = agentDecisions.map(d => d.content.toLowerCase().trim());

    let beliefConsistency = 1;
    if (beliefs.length > 1) {
      const meanBelief = beliefs.reduce((a, b) => a + b, 0) / beliefs.length;
      const std = Math.sqrt(beliefs.reduce((sum, b) => sum + Math.pow(b - meanBelief, 2), 0) / beliefs.length);
      beliefConsistency = Math.max(0, 1 - std);
    }

    const uniqueDecisions = new Set(decisions).size;
    const decisionConsistency = decisions.length > 0 ? 
      1 - (uniqueDecisions - 1) / decisions.length : 1;

    return (beliefConsistency + decisionConsistency) / 2;
  }

  private computeConfidenceInterval(agentDecisions: AgentDecision[]): [number, number] {
    if (agentDecisions.length === 0) return [0, 0];

    const beliefs = agentDecisions.map(d => d.belief || 0);
    const mean = beliefs.reduce((a, b) => a + b, 0) / beliefs.length;
    const std = Math.sqrt(beliefs.reduce((sum, b) => sum + Math.pow(b - mean, 2), 0) / beliefs.length);
    const n = beliefs.length;

    const marginOfError = n > 1 ? (1.96 * std) / Math.sqrt(n) : 0;

    return [mean - marginOfError, mean + marginOfError];
  }

  evaluateExplainability(agentDecisions: AgentDecision[], interactionHistory: InteractionRound[]): ExplainabilityMetric {
    if (agentDecisions.length === 0) {
      return { score: 0, reasoningLength: 0, attributionClarity: 0, stepCoverage: 0, details: "No agent decisions" };
    }

    const avgReasoningLength = agentDecisions.reduce((sum, d) => sum + d.reasoning.length, 0) / agentDecisions.length;
    const reasoningLength = Math.min(100, Math.max(0, (avgReasoningLength / 200) * 100));

    const agentsWithReasoning = agentDecisions.filter(d => d.reasoning.length > 0).length;
    const attributionClarity = (agentsWithReasoning / agentDecisions.length) * 100;

    const uniqueAgentsInHistory = new Set(interactionHistory.flatMap(r => r.messages.map(m => m.agentId))).size;
    const stepCoverage = interactionHistory.length > 0 ? 
      Math.min(100, (uniqueAgentsInHistory / agentDecisions.length) * 100) : 0;

    const score = reasoningLength * 0.4 + attributionClarity * 0.3 + stepCoverage * 0.3;

    return {
      score: Math.round(score * 10) / 10,
      reasoningLength: Math.round(avgReasoningLength),
      attributionClarity: Math.round(attributionClarity),
      stepCoverage: Math.round(stepCoverage),
      details: reasoningLength >= 60 ? "High explainability, detailed reasoning provided" :
               reasoningLength >= 30 ? "Moderate explainability, some reasoning" :
               "Low explainability, minimal reasoning",
    };
  }

  evaluateRobustness(agentDecisions: AgentDecision[], interactionHistory: InteractionRound[]): RobustnessMetric {
    if (agentDecisions.length === 0) {
      return { score: 0, perturbationTests: { inputNoise: 0, agentDropout: 0, parameterVariation: 0 }, details: "No agent decisions" };
    }

    const beliefs = agentDecisions.map(d => d.belief || 0);
    const beliefStd = beliefs.length > 1 ? Math.sqrt(
      beliefs.reduce((sum, b, _, arr) => sum + Math.pow(b - arr.reduce((a, c) => a + c, 0) / arr.length, 2), 0) / beliefs.length
    ) : 0;
    const inputNoise = Math.max(0, 100 - beliefStd * 50);

    const confidenceStd = agentDecisions.length > 1 ? Math.sqrt(
      agentDecisions.reduce((sum, d, _, arr) => {
        const avg = arr.reduce((a, c) => a + c.confidence, 0) / arr.length;
        return sum + Math.pow(d.confidence - avg, 2);
      }, 0) / agentDecisions.length
    ) : 0;
    const agentDropout = Math.max(0, 100 - confidenceStd * 2);

    const roundBeliefs = interactionHistory.map(r => {
      const roundBeliefs = Object.values(r.beliefs);
      return roundBeliefs.length > 0 ? roundBeliefs.reduce((a, b) => a + b, 0) / roundBeliefs.length : 0;
    });
    const parameterVariation = roundBeliefs.length > 1 ? Math.max(0, 100 - 
      Math.sqrt(roundBeliefs.reduce((sum, b, _, arr) => {
        const avg = arr.reduce((a, c) => a + c, 0) / arr.length;
        return sum + Math.pow(b - avg, 2);
      }, 0) / roundBeliefs.length) * 100) : 50;

    const score = inputNoise * 0.33 + agentDropout * 0.33 + parameterVariation * 0.34;

    return {
      score: Math.round(score * 10) / 10,
      perturbationTests: {
        inputNoise: Math.round(inputNoise),
        agentDropout: Math.round(agentDropout),
        parameterVariation: Math.round(parameterVariation),
      },
      details: score >= 70 ? "High robustness, resistant to perturbations" :
               score >= 40 ? "Moderate robustness, some sensitivity" :
               "Low robustness, sensitive to changes",
    };
  }

  evaluateStability(interactionHistory: InteractionRound[]): StabilityMetric {
    if (interactionHistory.length === 0) {
      return { score: 0, roundConsistency: 0, timeSeriesStability: 0, details: "No interaction history" };
    }

    const beliefsPerRound = interactionHistory.map(r => Object.values(r.beliefs));
    const avgBeliefs = beliefsPerRound.map(beliefs => 
      beliefs.length > 0 ? beliefs.reduce((a, b) => a + b, 0) / beliefs.length : 0
    );

    let roundConsistency = 100;
    if (avgBeliefs.length > 1) {
      const firstBelief = avgBeliefs[0];
      const consistency = avgBeliefs.reduce((sum, b) => sum + (1 - Math.abs(b - firstBelief)), 0) / avgBeliefs.length;
      roundConsistency = consistency * 100;
    }

    let timeSeriesStability = 50;
    if (avgBeliefs.length > 2) {
      const diffs = avgBeliefs.slice(1).map((b, i) => Math.abs(b - avgBeliefs[i]));
      const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      timeSeriesStability = Math.max(0, 100 - avgDiff * 50);
    }

    const score = roundConsistency * 0.5 + timeSeriesStability * 0.5;

    return {
      score: Math.round(score * 10) / 10,
      roundConsistency: Math.round(roundConsistency),
      timeSeriesStability: Math.round(timeSeriesStability),
      details: score >= 70 ? "High stability, consistent across rounds" :
               score >= 40 ? "Moderate stability, some fluctuations" :
               "Low stability, inconsistent across rounds",
    };
  }

  evaluateManipulationResistance(agentDecisions: AgentDecision[], agents: AgentInfo[]): ManipulationResistanceMetric {
    if (agentDecisions.length === 0) {
      return { score: 0, adversarialTest: 0, biasDetection: 0, details: "No agent decisions" };
    }

    const confidenceValues = agentDecisions.map(d => d.confidence);
    const avgConfidence = confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length;
    const confidenceStd = Math.sqrt(confidenceValues.reduce((sum, c) => sum + Math.pow(c - avgConfidence, 2), 0) / confidenceValues.length);
    
    const adversarialTest = confidenceStd < 20 ? 80 : confidenceStd < 40 ? 60 : 40;

    const beliefValues = agentDecisions.map(d => d.belief || 0);
    const beliefMean = beliefValues.reduce((a, b) => a + b, 0) / beliefValues.length;
    const extremeBeliefCount = beliefValues.filter(b => Math.abs(b - beliefMean) > 0.5).length;
    const biasDetection = extremeBeliefCount === 0 ? 90 : extremeBeliefCount < agentDecisions.length * 0.3 ? 60 : 30;

    const score = adversarialTest * 0.5 + biasDetection * 0.5;

    return {
      score: Math.round(score * 10) / 10,
      adversarialTest,
      biasDetection,
      details: score >= 70 ? "High manipulation resistance, no suspicious patterns" :
               score >= 40 ? "Moderate manipulation resistance, some concerns" :
               "Low manipulation resistance, potential bias or manipulation",
    };
  }

  evaluateInfluenceAnalysis(agentDecisions: AgentDecision[], agents: AgentInfo[], interactionHistory: InteractionRound[]): InfluenceAnalysisMetric {
    if (agentDecisions.length === 0) {
      return { 
        score: 0, 
        attribution: [], 
        giniCoefficient: 0,
        influencePaths: [],
        degreeCentrality: {},
        coMentionCentrality: {},
        influenceDensity: 0,
        averagePathLength: 0,
        influenceDiffusionRate: 0,
        keyInfluencers: [],
        details: "No agent decisions" 
      };
    }

    const messageCounts: Record<string, number> = {};
    interactionHistory.forEach(r => {
      r.messages.forEach(m => {
        messageCounts[m.agentId] = (messageCounts[m.agentId] || 0) + 1;
      });
    });

    const totalMessages = Object.values(messageCounts).reduce((a, b) => a + b, 0) || 1;
    const contributions = agentDecisions.map(d => ({
      agentId: d.agentId,
      contribution: ((messageCounts[d.agentId] || 1) / totalMessages) * 100,
      influenceWeight: d.confidence / 100,
    }));

    const influenceValues = contributions.map(c => c.contribution);
    const giniCoefficient = this.computeGiniCoefficient(influenceValues);

    const maxContribution = Math.max(...influenceValues);
    const dominantAgent = maxContribution > 50 ? 
      contributions.find(c => c.contribution === maxContribution)?.agentId : undefined;

    const influencePaths = this.computeInfluencePaths(agentDecisions, interactionHistory);
    const degreeCentrality = this.computeDegreeCentrality(agentDecisions, interactionHistory);
    const coMentionCentrality = this.computeCoMentionCentrality(agentDecisions, interactionHistory);

    const agentCount = agentDecisions.length;
    const possibleEdges = agentCount * (agentCount - 1);
    const actualEdges = new Set(influencePaths.map(p => `${p.sourceAgentId}-${p.targetAgentId}`)).size;
    const influenceDensity = possibleEdges > 0 ? Math.round((actualEdges / possibleEdges) * 1000) / 1000 : 0;

    const averagePathLength = influencePaths.length > 0 
      ? Math.round((influencePaths.reduce((sum, p) => sum + p.pathLength, 0) / influencePaths.length) * 100) / 100 
      : 0;

    const mentionCounts: Record<string, number> = {};
    interactionHistory.forEach(r => {
      r.messages.forEach(m => {
        for (const otherAgent of agentDecisions.map(d => d.agentId)) {
          if (otherAgent !== m.agentId && m.content.toLowerCase().includes(otherAgent.toLowerCase())) {
            mentionCounts[otherAgent] = (mentionCounts[otherAgent] || 0) + 1;
          }
        }
      });
    });
    const totalMentions = Object.values(mentionCounts).reduce((a, b) => a + b, 0) || 1;
    const influenceDiffusionRate = Math.round((totalMentions / (interactionHistory.length * agentCount)) * 1000) / 1000;

    const sortedContributions = [...contributions].sort((a, b) => b.contribution - a.contribution);
    const keyInfluencers = sortedContributions.slice(0, Math.min(3, agentCount)).map(c => c.agentId);

    const score = (1 - giniCoefficient) * 40 + influenceDensity * 30 + (1 - averagePathLength / 3) * 30;

    return {
      score: Math.round(score * 10) / 10,
      attribution: contributions,
      giniCoefficient: Math.round(giniCoefficient * 100) / 100,
      dominantAgent,
      influencePaths,
      degreeCentrality,
      coMentionCentrality,
      influenceDensity,
      averagePathLength,
      influenceDiffusionRate,
      keyInfluencers,
      details: giniCoefficient < 0.3 ? "Balanced influence distribution" :
               giniCoefficient < 0.6 ? "Moderately skewed influence" :
               "Highly concentrated influence, potential authority bias",
    };
  }

  private computeInfluencePaths(agentDecisions: AgentDecision[], interactionHistory: InteractionRound[]): InfluencePath[] {
    const paths: InfluencePath[] = [];
    const agentIds = agentDecisions.map(d => d.agentId);
    const confidenceMap = new Map(agentDecisions.map(d => [d.agentId, d.confidence]));

    for (const round of interactionHistory) {
      for (const message of round.messages) {
        const content = message.content.toLowerCase();
        for (const otherAgent of agentIds) {
          if (otherAgent !== message.agentId && content.includes(otherAgent.toLowerCase())) {
            const path = [otherAgent, message.agentId];
            const pathLength = path.length - 1;
            const type: "direct" | "indirect" | "chain" = pathLength === 1 ? "direct" : pathLength === 2 ? "indirect" : "chain";
            const sourceConfidence = confidenceMap.get(otherAgent) || 50;
            const targetConfidence = confidenceMap.get(message.agentId) || 50;
            const cumulativeStrength = (sourceConfidence + targetConfidence) / 2;

            paths.push({
              sourceAgentId: otherAgent,
              targetAgentId: message.agentId,
              path,
              strength: targetConfidence,
              round: round.round,
              pathLength,
              type,
              cumulativeStrength,
            });
          }
        }
      }
    }

    const indirectPaths = this.computeIndirectInfluencePaths(agentIds, interactionHistory, confidenceMap);
    paths.push(...indirectPaths);

    return paths.sort((a, b) => b.cumulativeStrength - a.cumulativeStrength);
  }

  private computeIndirectInfluencePaths(
    agentIds: string[],
    interactionHistory: InteractionRound[],
    confidenceMap: Map<string, number>
  ): InfluencePath[] {
    const paths: InfluencePath[] = [];

    for (let i = 0; i < interactionHistory.length - 1; i++) {
      const currentRound = interactionHistory[i];
      const nextRound = interactionHistory[i + 1];

      for (const currentMessage of currentRound.messages) {
        for (const nextMessage of nextRound.messages) {
          if (currentMessage.agentId !== nextMessage.agentId) {
            const currentContent = currentMessage.content.toLowerCase();
            const nextContent = nextMessage.content.toLowerCase();
            
            if (nextContent.includes(currentMessage.agentId.toLowerCase())) {
              const path = [currentMessage.agentId, nextMessage.agentId];
              const sourceConfidence = confidenceMap.get(currentMessage.agentId) || 50;
              const targetConfidence = confidenceMap.get(nextMessage.agentId) || 50;

              paths.push({
                sourceAgentId: currentMessage.agentId,
                targetAgentId: nextMessage.agentId,
                path,
                strength: targetConfidence * 0.7,
                round: nextRound.round,
                pathLength: 2,
                type: "indirect",
                cumulativeStrength: (sourceConfidence + targetConfidence) / 2 * 0.7,
              });
            }
          }
        }
      }
    }

    return paths;
  }

  private computeDegreeCentrality(agentDecisions: AgentDecision[], interactionHistory: InteractionRound[]): Record<string, number> {
    const centrality: Record<string, number> = {};
    const agentIds = agentDecisions.map(d => d.agentId);

    agentIds.forEach(id => {
      let degree = 0;
      interactionHistory.forEach(r => {
        const mentions = r.messages.filter(m => m.content.toLowerCase().includes(id.toLowerCase())).length;
        const mentionsByOthers = r.messages.filter(m => m.agentId !== id && m.content.toLowerCase().includes(id.toLowerCase())).length;
        degree += mentions + mentionsByOthers;
      });
      centrality[id] = degree;
    });

    const maxDegree = Math.max(...Object.values(centrality), 1);
    Object.keys(centrality).forEach(id => {
      centrality[id] = Math.round((centrality[id] / maxDegree) * 100) / 100;
    });

    return centrality;
  }

  private computeCoMentionCentrality(agentDecisions: AgentDecision[], interactionHistory: InteractionRound[]): Record<string, number> {
    const centrality: Record<string, number> = {};
    const agentIds = agentDecisions.map(d => d.agentId);

    agentIds.forEach(id => {
      let score = 0;
      interactionHistory.forEach(r => {
        const messages = r.messages;
        for (let i = 0; i < messages.length; i++) {
          for (let j = i + 1; j < messages.length; j++) {
            if (agentIds.includes(messages[i].agentId) && agentIds.includes(messages[j].agentId)) {
              const contentI = messages[i].content.toLowerCase();
              const contentJ = messages[j].content.toLowerCase();
              if (contentI.includes(id.toLowerCase()) || contentJ.includes(id.toLowerCase())) {
                score++;
              }
            }
          }
        }
      });
      centrality[id] = score;
    });

    const maxScore = Math.max(...Object.values(centrality), 1);
    Object.keys(centrality).forEach(id => {
      centrality[id] = Math.round((centrality[id] / maxScore) * 100) / 100;
    });

    return centrality;
  }

  private computeOverallScore(
    dimensions: {
      consensus: ConsensusMetric;
      reliability: ReliabilityMetric;
      explainability: ExplainabilityMetric;
      robustness: RobustnessMetric;
      stability: StabilityMetric;
      manipulationResistance: ManipulationResistanceMetric;
      influenceAnalysis: InfluenceAnalysisMetric;
    },
    weights: Record<string, number>
  ): number {
    let weightedSum = 0;
    let totalWeight = 0;

    weightedSum += dimensions.consensus.score * weights.consensus;
    weightedSum += dimensions.reliability.score * weights.reliability;
    weightedSum += dimensions.explainability.score * weights.explainability;
    weightedSum += dimensions.robustness.score * weights.robustness;
    weightedSum += dimensions.stability.score * weights.stability;
    weightedSum += dimensions.manipulationResistance.score * weights.manipulationResistance;
    weightedSum += dimensions.influenceAnalysis.score * weights.influenceAnalysis;

    Object.values(weights).forEach(w => totalWeight += w);

    return Math.round((weightedSum / totalWeight) * 10) / 10;
  }

  private computeGrade(score: number): "excellent" | "good" | "fair" | "poor" | "critical" {
    if (score >= 85) return "excellent";
    if (score >= 70) return "good";
    if (score >= 55) return "fair";
    if (score >= 40) return "poor";
    return "critical";
  }

  private generateSummary(
    score: number,
    grade: string,
    dimensions: {
      consensus: ConsensusMetric;
      reliability: ReliabilityMetric;
      explainability: ExplainabilityMetric;
      robustness: RobustnessMetric;
      stability: StabilityMetric;
      manipulationResistance: ManipulationResistanceMetric;
      influenceAnalysis: InfluenceAnalysisMetric;
    }
  ): string {
    const gradeLabels: Record<string, string> = {
      excellent: "excellent",
      good: "good",
      fair: "fair",
      poor: "poor",
      critical: "critical",
    };

    const sorted = Object.entries(dimensions).sort((a, b) => a[1].score - b[1].score);
    const weakest = sorted[0];
    const strongest = sorted[sorted.length - 1];

    const dimensionLabels: Record<string, string> = {
      consensus: "consensus",
      reliability: "reliability",
      explainability: "explainability",
      robustness: "robustness",
      stability: "stability",
      manipulationResistance: "manipulation resistance",
      influenceAnalysis: "influence analysis",
    };

    return `Overall score: ${score.toFixed(1)}/100 (${gradeLabels[grade]}). ` +
           `Strongest dimension: ${dimensionLabels[strongest[0]]} (${strongest[1].score.toFixed(1)}), ` +
           `Weakest dimension: ${dimensionLabels[weakest[0]]} (${weakest[1].score.toFixed(1)}). ` +
           `Focus on improving the weakest dimension.`;
  }

  private computeKuramotoOrder(beliefs: number[]): number {
    if (beliefs.length === 0) return 0;
    const angles = beliefs.map(b => b * Math.PI);
    let sumReal = 0;
    let sumImag = 0;
    for (const angle of angles) {
      sumReal += Math.cos(angle);
      sumImag += Math.sin(angle);
    }
    const r = Math.sqrt(sumReal * sumReal + sumImag * sumImag) / beliefs.length;
    return r;
  }

  private semanticSimilarity(a: string, b: string): number {
    const wordsA = a.split(/\s+/).filter(w => w.length > 2);
    const wordsB = b.split(/\s+/).filter(w => w.length > 2);
    if (wordsA.length === 0 || wordsB.length === 0) return 0;
    const common = wordsA.filter(w => wordsB.includes(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return common / union;
  }

  private computeGiniCoefficient(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    let sumOfAbsoluteDifferences = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        sumOfAbsoluteDifferences += Math.abs(sorted[i] - sorted[j]);
      }
    }
    const mean = sorted.reduce((a, b) => a + b, 0) / n;
    return mean > 0 ? sumOfAbsoluteDifferences / (2 * n * n * mean) : 0;
  }
}

export * from "./types";
