import type { StateDelta, EdgeDelta, InfluenceCalculation, InferenceConfig, InfluenceCalculator, BeliefInferrer } from "./types";
import type { AgentOpinion, InteractionGraph, InteractionEdge, InfluenceType } from "../discussion/types";
import type { CollectiveDecisionState, RuntimeContext } from "../runtime/types";
import { determineInfluenceType, computeInfluenceWeight, computeInfluenceImpact } from "../discussion/influenceUtils";
import {
  INFLUENCE_EDGE_DECAY_FACTOR,
  INFLUENCE_CONFIDENCE_NORM_FACTOR,
  INFERENCE_HIGH_CONF_AMPLIFICATION,
  INFERENCE_HIGH_CONF_WEIGHT_THRESHOLD,
  BELIEF_MIN,
  BELIEF_MAX,
  CONFIDENCE_MIN,
  CONFIDENCE_MAX,
} from "../constants";

class RuleBasedInfluenceCalculator implements InfluenceCalculator {
  calculate(
    allOpinions: AgentOpinion[],
    graph: InteractionGraph,
    roundNumber: number
  ): InfluenceCalculation[] {
    const calculations: InfluenceCalculation[] = [];

    for (const targetOpinion of allOpinions) {
      const influences: InfluenceCalculation["influences"] = [];
      const influencers = allOpinions.filter((o) => o.agentId !== targetOpinion.agentId);

      for (const sourceOpinion of influencers) {
        const influenceType = determineInfluenceType(sourceOpinion, targetOpinion);
        const weight = computeInfluenceWeight(influenceType, sourceOpinion, targetOpinion);

        const existingEdge = graph.edges.find(
          (e) =>
            e.source === sourceOpinion.agentId &&
            e.target === targetOpinion.agentId &&
            e.type === influenceType
        );

        const effectiveWeight = existingEdge
          ? Math.max(0, Math.min(1, existingEdge.weight + weight * INFLUENCE_EDGE_DECAY_FACTOR))
          : weight;

        const { beliefChange, confidenceChange } = computeInfluenceImpact(
          influenceType,
          effectiveWeight,
          sourceOpinion,
          targetOpinion
        );

        influences.push({
          sourceAgentId: sourceOpinion.agentId,
          type: influenceType,
          weight: effectiveWeight,
          targetBeliefChange: beliefChange,
          targetConfidenceChange: confidenceChange,
        });
      }

      calculations.push({ agentId: targetOpinion.agentId, influences });
    }

    return calculations;
  }
}

class RuleBasedBeliefInferrer implements BeliefInferrer {
  infer(
    opinion: AgentOpinion,
    influences: InfluenceCalculation[],
    previousState: CollectiveDecisionState
  ): StateDelta {
    const agentInfluence = influences.find((i) => i.agentId === opinion.agentId);
    if (!agentInfluence) {
      return {
        agentId: opinion.agentId,
        beliefChange: 0,
        confidenceChange: 0,
        reason: "No influences",
      };
    }

    let beliefChange = 0;
    let confidenceChange = 0;
    const reasons: string[] = [];

    for (const influence of agentInfluence.influences) {
      beliefChange += influence.targetBeliefChange;
      confidenceChange += influence.targetConfidenceChange;
      reasons.push(
        `${influence.type} from ${influence.sourceAgentId} (weight: ${influence.weight.toFixed(2)})`
      );
    }

    const otherOpinions = influences
      .map((i) => i.agentId)
      .filter((id) => id !== opinion.agentId);

    if (otherOpinions.length > 0) {
      const highConfidenceAgents = influences.filter(
        (i) => i.influences.some((inf) => inf.weight > 0.5)
      );
      if (highConfidenceAgents.length > 0) {
        beliefChange *= 1.1;
        reasons.push("High confidence amplification");
      }
    }

    const newBelief = Math.max(-1, Math.min(1, opinion.belief + beliefChange));
    const newConfidence = Math.max(0, Math.min(100, opinion.confidence + confidenceChange));

    return {
      agentId: opinion.agentId,
      beliefChange: newBelief - opinion.belief,
      confidenceChange: newConfidence - opinion.confidence,
      reason: reasons.join(", "),
    };
  }
}

export class InferenceLayer {
  private influenceCalculator: InfluenceCalculator;
  private beliefInferrer: BeliefInferrer;
  private config: InferenceConfig;

  constructor(config?: InferenceConfig, calculator?: InfluenceCalculator, inferrer?: BeliefInferrer) {
    this.influenceCalculator = calculator || new RuleBasedInfluenceCalculator();
    this.beliefInferrer = inferrer || new RuleBasedBeliefInferrer();
    this.config = config || {};
  }

  infer(
    observations: Array<{ parsedOpinion: AgentOpinion }>,
    previousState: CollectiveDecisionState,
    context: RuntimeContext
  ): StateDelta[] {
    const opinions = observations.map((o) => o.parsedOpinion);
    const graph = previousState.interactionGraph;
    const roundNumber = context.round.current;

    const calculations = this.influenceCalculator.calculate(opinions, graph, roundNumber);

    const deltas: StateDelta[] = [];

    for (const opinion of opinions) {
      const delta = this.beliefInferrer.infer(opinion, calculations, previousState);
      deltas.push(delta);
    }

    return deltas;
  }

  calculateInfluenceChanges(
    opinions: AgentOpinion[],
    graph: InteractionGraph,
    roundNumber: number
  ): EdgeDelta[] {
    const calculations = this.influenceCalculator.calculate(opinions, graph, roundNumber);
    const edgeDeltas: EdgeDelta[] = [];

    calculations.forEach((calc) => {
      calc.influences.forEach((influence) => {
        const existingEdge = graph.edges.find(
          (e) =>
            e.source === influence.sourceAgentId &&
            e.target === calc.agentId &&
            e.type === influence.type
        );

        const newEdge: InteractionEdge = {
          source: influence.sourceAgentId,
          target: calc.agentId,
          type: influence.type,
          weight: influence.weight,
          round: roundNumber,
        };

        if (existingEdge) {
          edgeDeltas.push({ type: "update", edge: newEdge });
        } else {
          edgeDeltas.push({ type: "add", edge: newEdge });
        }
      });
    });

    return edgeDeltas;
  }

  getInfluenceCalculator(): InfluenceCalculator {
    return this.influenceCalculator;
  }

  getBeliefInferrer(): BeliefInferrer {
    return this.beliefInferrer;
  }
}

export { RuleBasedInfluenceCalculator, RuleBasedBeliefInferrer };
export type { StateDelta, EdgeDelta, InfluenceCalculation, InferenceConfig, InfluenceCalculator, BeliefInferrer };
