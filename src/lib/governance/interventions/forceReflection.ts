import {
  Intervention, InterventionStrategy, InterventionResult,
  GovernanceState, InterventionType,
} from "../types";

export class ForceReflectionIntervention implements InterventionStrategy {
  name: string = "force_reflection";
  type: InterventionType = "force_reflection";

  apply(
    intervention: Intervention,
    state: GovernanceState,
    _agentKnowledge?: Map<string, string[]>
  ): InterventionResult {
    if (intervention.type !== "force_reflection") {
      return { success: false, intervention: { ...intervention, applied: false } };
    }

    const targetAgents = intervention.targetAgents || [];
    if (targetAgents.length === 0) {
      return { success: false, intervention: { ...intervention, applied: false } };
    }

    const reflectionFactor = (intervention.parameters?.reflectionFactor as number) || 0.2;
    const allBeliefs = state.agentBeliefs.map(b => b.belief);
    const meanBelief = allBeliefs.reduce((sum, b) => sum + b, 0) / allBeliefs.length;

    const updatedBeliefs = state.agentBeliefs.map(belief => {
      if (targetAgents.includes(belief.agentId)) {
        const newBelief = Math.max(-1, Math.min(1, belief.belief + (meanBelief - belief.belief) * reflectionFactor));
        return { ...belief, belief: newBelief, confidence: Math.max(10, belief.confidence - 5) };
      }
      return belief;
    });

    const prompt =
      `\n\n═══ GOVERNANCE INTERVENTION ═══\n` +
      `⚠️ CRITICAL: Your position is at an extreme compared to the group.\n` +
      `MANDATORY: Before responding, write down the STRONGEST argument for the OPPOSING viewpoint.\n` +
      `What scenario would make the opposing position correct?\n` +
      `Only after doing this, restate your own position.\n` +
      `═ END GOVERNANCE INTERVENTION ══`;

    const originalBeliefMap = new Map(state.agentBeliefs.map(b => [b.agentId, b.belief]));
    const maxAdjustment = Math.max(
      ...updatedBeliefs.filter(b => targetAgents.includes(b.agentId))
        .map(b => Math.abs(b.belief - (originalBeliefMap.get(b.agentId) ?? b.belief)))
    );

    return {
      success: true,
      intervention: { ...intervention, applied: true,
        effect: `Forced ${targetAgents.length} agents to reflect. Max shift: ${maxAdjustment.toFixed(2)}` },
      stateChanges: { updatedBeliefs },
      prompt,
      promptTargets: [...targetAgents],
    };
  }
}
