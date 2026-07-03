import {
  Intervention,
  InterventionStrategy,
  InterventionResult,
  GovernanceState,
  InterventionType,
} from "../types";

export class ForceReflectionIntervention implements InterventionStrategy {
  name: string = "force_reflection";
  type: InterventionType = "force_reflection";

  apply(
    intervention: Intervention,
    state: GovernanceState
  ): InterventionResult {
    if (intervention.type !== "force_reflection") {
      return {
        success: false,
        intervention: { ...intervention, applied: false },
      };
    }

    const targetAgents = intervention.targetAgents || [];
    if (targetAgents.length === 0) {
      return {
        success: false,
        intervention: { ...intervention, applied: false },
      };
    }

    const reflectionFactor =
      (intervention.parameters?.reflectionFactor as number) || 0.2;

    const allBeliefs = state.agentBeliefs.map(b => b.belief);
    const meanBelief = allBeliefs.reduce((sum, b) => sum + b, 0) / allBeliefs.length;

    const updatedBeliefs = state.agentBeliefs.map(belief => {
      if (targetAgents.includes(belief.agentId)) {
        const distanceToMean = meanBelief - belief.belief;
        const reflectionAdjustment = distanceToMean * reflectionFactor;
        const newBelief = Math.max(-1, Math.min(1, belief.belief + reflectionAdjustment));
        return {
          ...belief,
          belief: newBelief,
          confidence: Math.max(10, belief.confidence - 5),
        };
      }
      return belief;
    });

    const affectedCount = targetAgents.length;
    // Build a lookup map to correctly match original beliefs — the previous
    // implementation used `i` (the filtered-array index) to index into the
    // unfiltered `state.agentBeliefs`, producing wrong diffs.
    const originalBeliefMap = new Map(
      state.agentBeliefs.map(b => [b.agentId, b.belief])
    );
    const maxAdjustment = Math.max(
      ...updatedBeliefs
        .filter(b => targetAgents.includes(b.agentId))
        .map(b => Math.abs(b.belief - (originalBeliefMap.get(b.agentId) ?? b.belief)))
    );

    return {
      success: true,
      intervention: {
        ...intervention,
        applied: true,
        effect: `Forced ${affectedCount} agents to reflect on opposing viewpoints. Max belief adjustment: ${maxAdjustment.toFixed(2)}`,
      },
      stateChanges: {
        updatedBeliefs,
      },
    };
  }
}
