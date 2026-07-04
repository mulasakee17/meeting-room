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

    const reflectionFactor =
      (intervention.parameters?.reflectionFactor as number) || 0.2;

    const allBeliefs = state.agentBeliefs.map(b => b.belief);
    const meanBelief = allBeliefs.reduce((sum, b) => sum + b, 0) / allBeliefs.length;

    // Math-layer: pull beliefs toward mean
    const updatedBeliefs = state.agentBeliefs.map(belief => {
      if (targetAgents.includes(belief.agentId)) {
        const distanceToMean = meanBelief - belief.belief;
        const newBelief = Math.max(-1, Math.min(1, belief.belief + distanceToMean * reflectionFactor));
        return { ...belief, belief: newBelief, confidence: Math.max(10, belief.confidence - 5) };
      }
      return belief;
    });

    // ── Information-layer prompt ───────────────────────────────────────
    const prompt = [
      `\n\n[Governance Runtime] ⚠️ Group polarization detected.`,
      `Your position is at an extreme. Please step back and seriously consider `,
      `the opposing viewpoint. What would convince you that the other side is right? `,
      `Identify one valid argument from the opposing camp before restating your own position.`,
    ].join("\n");
    const promptTargets = [...targetAgents];

    const originalBeliefMap = new Map(state.agentBeliefs.map(b => [b.agentId, b.belief]));
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
        effect: `Forced ${targetAgents.length} agents to reflect on opposing viewpoints. Max belief shift: ${maxAdjustment.toFixed(2)}`,
      },
      stateChanges: { updatedBeliefs },
      prompt,
      promptTargets,
    };
  }
}
