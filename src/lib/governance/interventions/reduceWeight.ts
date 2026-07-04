import {
  Intervention, InterventionStrategy, InterventionResult,
  GovernanceState, InterventionType,
} from "../types";

export class ReduceWeightIntervention implements InterventionStrategy {
  name: string = "reduce_weight";
  type: InterventionType = "reduce_weight";

  apply(
    intervention: Intervention,
    state: GovernanceState,
    _agentKnowledge?: Map<string, string[]>
  ): InterventionResult {
    if (intervention.type !== "reduce_weight") {
      return { success: false, intervention: { ...intervention, applied: false } };
    }

    const targetAgentId = intervention.targetAgentId;
    if (!targetAgentId || !state.interactionGraph) {
      return { success: false, intervention: { ...intervention, applied: false } };
    }

    const reductionFactor = (intervention.parameters?.reductionFactor as number) || 0.5;

    // Math-layer: reduce edge weights
    const updatedEdges = state.interactionGraph.edges.map(edge => {
      if (edge.source === targetAgentId) {
        return { ...edge, weight: Math.max(0.01, edge.weight * (1 - reductionFactor)), type: edge.type };
      }
      return edge;
    });

    const originalWeightSum = state.interactionGraph.edges
      .filter(e => e.source === targetAgentId).reduce((sum, e) => sum + e.weight, 0);
    const newWeightSum = updatedEdges
      .filter(e => e.source === targetAgentId).reduce((sum, e) => sum + e.weight, 0);
    const weightReductionPercent = ((originalWeightSum - newWeightSum) / originalWeightSum) * 100;

    // ── Information-layer prompt (to all OTHER agents) ─────────────────
    const prompt =
      `\n\n[Governance Runtime] ⚠️ Authority bias detected.\n` +
      `${targetAgentId} is dominating the discussion (${(state.agentBeliefs.find(a => a.agentId === targetAgentId)?.confidence || 0)}% of influence). ` +
      `Please evaluate ${targetAgentId}'s arguments critically. Do not defer to authority — ` +
      `your independent judgment is essential. What would you conclude if ${targetAgentId} were absent from this discussion?`;
    const promptTargets = state.agentBeliefs
      .filter(a => a.agentId !== targetAgentId)
      .map(a => a.agentId);

    return {
      success: true,
      intervention: { ...intervention, applied: true,
        effect: `Reduced influence of ${targetAgentId} by ${weightReductionPercent.toFixed(0)}% + injected authority-bias prompt` },
      stateChanges: { updatedEdges },
      prompt,
      promptTargets,
    };
  }
}
