import type { AgentOpinion, InteractionGraph, InteractionEdge, InfluenceType } from "../discussion/types";
import type { CollectiveDecisionState } from "../runtime/types";

export interface StateDelta {
  agentId: string;
  beliefChange: number;
  confidenceChange: number;
  reason: string;
  source?: string;
}

export interface EdgeDelta {
  type: "add" | "update";
  edge: InteractionEdge;
}

export interface InfluenceCalculation {
  agentId: string;
  influences: Array<{
    sourceAgentId: string;
    type: InfluenceType;
    weight: number;
    targetBeliefChange: number;
    targetConfidenceChange: number;
  }>;
}

export interface InferenceConfig {
  influenceDecayFactor?: number;
  confidenceThreshold?: number;
  convergenceThreshold?: number;
}

export interface InfluenceCalculator {
  calculate(
    allOpinions: AgentOpinion[],
    graph: InteractionGraph,
    roundNumber: number
  ): InfluenceCalculation[];
}

export interface BeliefInferrer {
  infer(
    opinion: AgentOpinion,
    influences: InfluenceCalculation[],
    previousState: CollectiveDecisionState
  ): StateDelta;
}
