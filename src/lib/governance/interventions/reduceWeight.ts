import {
  Intervention, InterventionStrategy, InterventionResult,
  GovernanceState, InterventionType,
} from "../types";
import { formatInterventionPrompt } from "../interventionPrompt";

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

    const prompt = formatInterventionPrompt(
      `⚠️ CRITICAL: ${targetAgentId} is dominating the discussion.\n` +
      `DO NOT defer to ${targetAgentId}. Their opinion carries no more weight than yours.\n` +
      `MANDATORY: Form your OWN independent judgment. What would you conclude if ${targetAgentId} were absent?\n` +
      `State your independent position NOW. Do NOT simply agree with ${targetAgentId}.`
    );
    const promptTargets = state.agentBeliefs.filter(a => a.agentId !== targetAgentId).map(a => a.agentId);

    return {
      success: true,
      intervention: { ...intervention, applied: true,
        effect: `Reduced ${targetAgentId}'s influence by ${weightReductionPercent.toFixed(0)}% + injected authority challenge` },
      stateChanges: { updatedEdges },
      prompt,
      promptTargets,
    };
  }
}
