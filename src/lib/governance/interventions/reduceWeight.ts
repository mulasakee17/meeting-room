import {
  Intervention,
  InterventionStrategy,
  InterventionResult,
  GovernanceState,
  InterventionType,
} from "../types";

export class ReduceWeightIntervention implements InterventionStrategy {
  name: string = "reduce_weight";
  type: InterventionType = "reduce_weight";

  apply(
    intervention: Intervention,
    state: GovernanceState
  ): InterventionResult {
    if (intervention.type !== "reduce_weight") {
      return {
        success: false,
        intervention: { ...intervention, applied: false },
      };
    }

    const targetAgentId = intervention.targetAgentId;
    if (!targetAgentId || !state.interactionGraph) {
      return {
        success: false,
        intervention: { ...intervention, applied: false },
      };
    }

    const reductionFactor =
      (intervention.parameters?.reductionFactor as number) || 0.5;

    const updatedEdges = state.interactionGraph.edges.map(edge => {
      if (edge.source === targetAgentId) {
        return {
          ...edge,
          weight: Math.max(0.01, edge.weight * (1 - reductionFactor)),
          type: edge.type,
        };
      }
      return edge;
    });

    const originalWeightSum = state.interactionGraph.edges
      .filter(e => e.source === targetAgentId)
      .reduce((sum, e) => sum + e.weight, 0);

    const newWeightSum = updatedEdges
      .filter(e => e.source === targetAgentId)
      .reduce((sum, e) => sum + e.weight, 0);

    const weightReductionPercent = ((originalWeightSum - newWeightSum) / originalWeightSum) * 100;

    return {
      success: true,
      intervention: {
        ...intervention,
        applied: true,
        effect: `Reduced influence weight of ${targetAgentId} by ${weightReductionPercent.toFixed(0)}%`,
      },
      stateChanges: {
        updatedEdges,
      },
    };
  }
}
