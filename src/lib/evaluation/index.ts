import {
  EvaluationResult,
  ConsensusMetric,
  ReliabilityMetric,
  DispersionMetric,
  StabilityMetric,
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
import { EVALUATION_DEFAULT_WEIGHTS } from "../constants";

export class EvaluationEngine {
  private defaultWeights = EVALUATION_DEFAULT_WEIGHTS;

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
    const reliability = this.evaluateReliability(agentDecisions, finalDecision, interactionHistory, groundTruth);
    const dispersion = this.evaluateDispersion(agentDecisions, interactionHistory);
    const stability = this.evaluateStability(interactionHistory);
    const influenceAnalysis = this.evaluateInfluenceAnalysis(agentDecisions, agents, interactionHistory);

    const overallScore = this.computeOverallScore({
      consensus,
      reliability,
      dispersion,
      stability,
      influenceAnalysis,
    }, weights);

    const grade = this.computeGrade(overallScore);
    const summary = this.generateSummary(overallScore, grade, {
      consensus,
      reliability,
      dispersion,
      stability,
      influenceAnalysis,
    });

    return {
      overallScore,
      dimensions: {
        consensus,
        reliability,
        dispersion,
        stability,
        influenceAnalysis,
      },
      summary,
      grade,
    };
  }

  // ==========================================================================
  // CONSENSUS — Kuramoto Order + Belief Variance + Trajectory
  // ==========================================================================

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

    // Population std (not sample std) — consistent with Kuramoto interpretation
    const beliefStd = Math.sqrt(
      beliefs.reduce((sum, b) => sum + Math.pow(b - meanBelief, 2), 0) / beliefs.length
    );

    const decisions = agentDecisions.map(d => d.content.toLowerCase().trim());
    const uniqueDecisions = new Set(decisions);
    const agreementRate = uniqueDecisions.size === 1 ? 100 :
      100 - (uniqueDecisions.size / agentDecisions.length) * 50;

    const kuramotoOrder = this.computeKuramotoOrder(beliefs);
    const trajectory = this.computeConsensusTrajectory(interactionHistory);

    // Composite score: Kuramoto (30%) + inverse-std (40%) + agreement (30%)
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

  // ==========================================================================
  // RELIABILITY — Round-consistency α + Cross-validation + Repeatability
  // ==========================================================================

  evaluateReliability(
    agentDecisions: AgentDecision[],
    finalDecision: string,
    interactionHistory: InteractionRound[],
    groundTruth?: GroundTruth
  ): ReliabilityMetric {
    if (agentDecisions.length === 0) {
      return {
        score: 0,
        crossValidationScore: 0,
        consistencyScore: 0,
        roundConsistencyAlpha: null,
        repeatabilityScore: 0,
        confidenceInterval: [0, 0],
        details: "No agent decisions"
      };
    }

    const avgConfidence = agentDecisions.reduce((sum, d) => sum + d.confidence, 0) / agentDecisions.length;

    // Cross-validation: how well does each agent's output align with the final group decision?
    const decisionContents = agentDecisions.map(d => d.content.toLowerCase().trim());
    const finalLower = finalDecision.toLowerCase().trim();
    const consistencyScore = decisionContents.filter(d =>
      d.includes(finalLower) || finalLower.includes(d) ||
      this.semanticSimilarity(d, finalLower) > 0.5
    ).length / agentDecisions.length * 100;

    const crossValidationScore = consistencyScore;

    // Ground truth match (if provided)
    let groundTruthMatch: boolean | undefined;
    if (groundTruth) {
      groundTruthMatch = this.semanticSimilarity(finalLower, groundTruth.content.toLowerCase().trim()) > 0.6;
    }

    // Cronbach's α across discussion rounds (valid when rounds ≥ 3)
    const roundConsistencyAlpha = this.computeRoundConsistencyAlpha(interactionHistory);

    const repeatabilityScore = this.computeRepeatabilityScore(agentDecisions);
    const confidenceInterval = this.computeConfidenceInterval(agentDecisions);

    // Composite score: avgConfidence (20%) + consistency (30%) + round α (25%) + repeatability (25%)
    const alphaComponent = roundConsistencyAlpha !== null ? roundConsistencyAlpha * 25 : 0;
    const baseScore = avgConfidence * 0.2 + consistencyScore * 0.3 + alphaComponent + repeatabilityScore * 0.25;
    const truthBonus = groundTruthMatch ? 15 : 0;
    const score = Math.min(100, baseScore + truthBonus);

    return {
      score: Math.round(score * 10) / 10,
      crossValidationScore: Math.round(crossValidationScore),
      consistencyScore: Math.round(consistencyScore),
      groundTruthMatch,
      roundConsistencyAlpha: roundConsistencyAlpha !== null ? Math.round(roundConsistencyAlpha * 100) / 100 : null,
      repeatabilityScore: Math.round(repeatabilityScore * 100) / 100,
      confidenceInterval: [Math.round(confidenceInterval[0] * 100) / 100, Math.round(confidenceInterval[1] * 100) / 100],
      details: consistencyScore >= 80 ? "High reliability, decisions are consistent" :
               consistencyScore >= 50 ? "Moderate reliability, some inconsistencies" :
               "Low reliability, inconsistent decisions",
    };
  }

  /**
   * Cronbach's α computed across discussion rounds.
   *
   * Each round is treated as a measurement occasion of the group's collective
   * judgment. The N agents' beliefs in each round form the observations.
   * Valid when rounds ≥ 3 (k ≥ 3 items measuring the same construct).
   *
   * High α → agents maintain consistent relative belief rankings across rounds.
   * Low α → agent positions shift erratically between rounds.
   *
   * Note: In a converging discussion, α will naturally be lower in early rounds
   * and higher in later rounds — this is expected behavior, not a flaw.
   *
   * Returns null when rounds < 3 (insufficient for valid α).
   */
  private computeRoundConsistencyAlpha(interactionHistory: InteractionRound[]): number | null {
    // Need at least 3 rounds for valid Cronbach's α
    const validRounds = interactionHistory.filter(
      r => Object.keys(r.beliefs).length >= 2
    );
    if (validRounds.length < 3) return null;

    const k = validRounds.length; // items = rounds
    const agentIds = Object.keys(validRounds[0].beliefs);

    // Build per-agent belief vectors across rounds
    // Only include agents present in all rounds
    const completeAgentIds = agentIds.filter(id =>
      validRounds.every(r => id in r.beliefs)
    );
    if (completeAgentIds.length < 2) return null;

    // Compute variance of each round's beliefs (item variance)
    const roundVariances = validRounds.map(r => {
      const beliefs = completeAgentIds.map(id => r.beliefs[id]);
      return this.computeVariance(beliefs);
    });
    const sumItemVariances = roundVariances.reduce((s, v) => s + v, 0);

    // Total variance: pool all beliefs across all rounds
    const allBeliefs = validRounds.flatMap(r =>
      completeAgentIds.map(id => r.beliefs[id])
    );
    const totalVariance = this.computeVariance(allBeliefs);

    if (totalVariance === 0 || sumItemVariances === 0) return 0;

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
    const n = beliefs.length;
    const mean = beliefs.reduce((a, b) => a + b, 0) / n;
    // 统一使用样本标准差（÷(n-1)），与 Cronbach's α 一致
    const std = n > 1 ? Math.sqrt(beliefs.reduce((sum, b) => sum + Math.pow(b - mean, 2), 0) / (n - 1)) : 0;

    // 95% CI 使用 t 分布（小样本校正）
    // t 临界值表（双侧 α=0.05）
    const T_TABLE: Record<number, number> = {
      1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
      6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
      15: 2.131, 20: 2.086, 30: 2.042, 60: 2.000, 120: 1.980,
    };
    const df = n - 1;
    const tcrit = T_TABLE[df] ?? (df > 120 ? 1.96 : 2.042);
    const marginOfError = n > 1 ? (tcrit * std) / Math.sqrt(n) : 0;

    return [mean - marginOfError, mean + marginOfError];
  }

  // ==========================================================================
  // DISPERSION — Cross-agent belief/confidence variance + round variability
  // (formerly "Robustness" — renamed because no perturbation tests are run)
  // ==========================================================================

  evaluateDispersion(agentDecisions: AgentDecision[], interactionHistory: InteractionRound[]): DispersionMetric {
    if (agentDecisions.length === 0) {
      return {
        score: 0,
        beliefDispersion: 0,
        confidenceDispersion: 0,
        roundVariability: 0,
        details: "No agent decisions",
      };
    }

    // Cross-agent belief dispersion within the final round
    const beliefs = agentDecisions.map(d => d.belief || 0);
    const beliefMean = beliefs.reduce((a, b) => a + b, 0) / beliefs.length;
    const beliefStd = Math.sqrt(
      beliefs.reduce((sum, b) => sum + Math.pow(b - beliefMean, 2), 0) / beliefs.length
    );
    // Lower std → higher score (tight beliefs = less dispersion = more agreement on position)
    const beliefDispersion = Math.max(0, 100 - beliefStd * 50);

    // Cross-agent confidence dispersion
    const confidences = agentDecisions.map(d => d.confidence);
    const confMean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const confidenceStd = Math.sqrt(
      confidences.reduce((sum, c) => sum + Math.pow(c - confMean, 2), 0) / confidences.length
    );
    const confidenceDispersion = Math.max(0, 100 - confidenceStd * 2);

    // Round-to-round average belief variability
    const roundAvgs = interactionHistory.map(r => {
      const bs = Object.values(r.beliefs);
      return bs.length > 0 ? bs.reduce((a, b) => a + b, 0) / bs.length : 0;
    });
    let roundVariability = 50; // neutral default for single round
    if (roundAvgs.length > 1) {
      const diffs = roundAvgs.slice(1).map((b, i) => Math.abs(b - roundAvgs[i]));
      const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      roundVariability = Math.max(0, 100 - avgDiff * 100);
    }

    const score = beliefDispersion * 0.40 + confidenceDispersion * 0.25 + roundVariability * 0.35;

    return {
      score: Math.round(score * 10) / 10,
      beliefDispersion: Math.round(beliefDispersion),
      confidenceDispersion: Math.round(confidenceDispersion),
      roundVariability: Math.round(roundVariability),
      details: score >= 70 ? "Low dispersion — agents are tightly clustered in beliefs and confidence" :
               score >= 40 ? "Moderate dispersion — some variance across agents" :
               "High dispersion — agents show substantial variance in beliefs or confidence",
    };
  }

  // ==========================================================================
  // STABILITY — Round-to-round consistency + time-series smoothness
  // ==========================================================================

  evaluateStability(interactionHistory: InteractionRound[]): StabilityMetric {
    if (interactionHistory.length === 0) {
      return { score: 0, roundConsistency: 0, timeSeriesStability: 0, details: "No interaction history" };
    }

    const beliefsPerRound = interactionHistory.map(r => Object.values(r.beliefs));
    const avgBeliefs = beliefsPerRound.map(beliefs =>
      beliefs.length > 0 ? beliefs.reduce((a, b) => a + b, 0) / beliefs.length : 0
    );

    // Round consistency: how similar is each round's average belief to round 1?
    let roundConsistency = 100;
    if (avgBeliefs.length > 1) {
      const firstBelief = avgBeliefs[0];
      const consistency = avgBeliefs.reduce((sum, b) => sum + (1 - Math.abs(b - firstBelief)), 0) / avgBeliefs.length;
      roundConsistency = consistency * 100;
    }

    // Time-series stability: average step-to-step change in average belief
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

  // ==========================================================================
  // INFLUENCE ANALYSIS — Gini + Network Centrality + Influence Paths
  // ==========================================================================

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
          if (this.agentReferencesAgent(m, otherAgent)) {
            mentionCounts[otherAgent] = (mentionCounts[otherAgent] || 0) + 1;
          }
        }
      });
    });
    const totalMentions = Object.values(mentionCounts).reduce((a, b) => a + b, 0) || 1;
    const influenceDiffusionRate = Math.round((totalMentions / (interactionHistory.length * agentCount)) * 1000) / 1000;

    const sortedContributions = [...contributions].sort((a, b) => b.contribution - a.contribution);
    const keyInfluencers = sortedContributions.slice(0, Math.min(3, agentCount)).map(c => c.agentId);

    // Composite score: inverse-Gini (40%) + density (30%) + inverse-path-length (30%)
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
        for (const otherAgent of agentIds) {
          if (this.agentReferencesAgent(message, otherAgent)) {
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
            if (this.agentReferencesAgent(nextMessage, currentMessage.agentId)) {
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
        const mentions = r.messages.filter(m => this.agentReferencesAgent(m, id)).length;
        const mentionsByOthers = r.messages.filter(m => m.agentId !== id && this.agentReferencesAgent(m, id)).length;
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
              if (this.agentReferencesAgent(messages[i], id) || this.agentReferencesAgent(messages[j], id)) {
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

  // ==========================================================================
  // Shared helpers
  // ==========================================================================

  /**
   * 判断 message 是否引用了 targetAgentId。
   *
   * 优先使用消息的 referencedAgents 字段（显式语义引用，由解析层填充），
   * 仅当该字段缺失或为空时，才回退到 content 子串匹配。
   *
   * 这样避免将"批评性提及"误判为"影响力引用"——例如 agent A 在内容中
   * 出现 agent B 的 ID 仅因为 A 在反驳 B，而非受 B 影响。
   */
  private agentReferencesAgent(
    message: { agentId: string; content: string; referencedAgents?: string[] },
    targetAgentId: string
  ): boolean {
    if (targetAgentId === message.agentId) return false;
    // 优先使用显式引用字段
    if (message.referencedAgents && message.referencedAgents.length > 0) {
      return message.referencedAgents.includes(targetAgentId);
    }
    // 回退：无引用字段时用子串匹配（保持向后兼容）
    return message.content.toLowerCase().includes(targetAgentId.toLowerCase());
  }

  private computeOverallScore(
    dimensions: {
      consensus: ConsensusMetric;
      reliability: ReliabilityMetric;
      dispersion: DispersionMetric;
      stability: StabilityMetric;
      influenceAnalysis: InfluenceAnalysisMetric;
    },
    weights: Record<string, number>
  ): number {
    let weightedSum = 0;
    let totalWeight = 0;

    weightedSum += dimensions.consensus.score * (weights.consensus || 0);
    weightedSum += dimensions.reliability.score * (weights.reliability || 0);
    weightedSum += dimensions.dispersion.score * (weights.dispersion || 0);
    weightedSum += dimensions.stability.score * (weights.stability || 0);
    weightedSum += dimensions.influenceAnalysis.score * (weights.influenceAnalysis || 0);

    Object.values(weights).forEach(w => totalWeight += w);

    return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;
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
      dispersion: DispersionMetric;
      stability: StabilityMetric;
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
      dispersion: "dispersion",
      stability: "stability",
      influenceAnalysis: "influence analysis",
    };

    return `Overall score: ${score.toFixed(1)}/100 (${gradeLabels[grade]}). ` +
           `Strongest dimension: ${dimensionLabels[strongest[0]]} (${strongest[1].score.toFixed(1)}), ` +
           `Weakest dimension: ${dimensionLabels[weakest[0]]} (${weakest[1].score.toFixed(1)}). ` +
           `Focus on improving the weakest dimension.`;
  }

  private computeKuramotoOrder(beliefs: number[]): number {
    if (beliefs.length === 0) return 0;
    // θ = b × (π/2): belief ∈ [-1,1] → angle ∈ [-π/2, π/2]
    // b=-1 (强反对) → θ=-π/2 (单位圆下方)
    // b=+1 (强支持) → θ=+π/2 (单位圆上方)
    // 两者正对，R≈0 (低共识) — 正确反映极化
    // 旧映射 θ=b×π 使 b=±0.99 在单位圆上几乎重合 (都在(-1,0)附近)，R≈1，误判极化为共识
    const angles = beliefs.map(b => b * Math.PI / 2);
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
