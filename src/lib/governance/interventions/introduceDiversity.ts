import {
  Intervention, InterventionStrategy, InterventionResult,
  GovernanceState, InterventionType,
} from "../types";

export class IntroduceDiversityIntervention implements InterventionStrategy {
  name: string = "introduce_diversity";
  type: InterventionType = "introduce_diversity";

  apply(
    intervention: Intervention,
    state: GovernanceState,
    _agentKnowledge?: Map<string, string[]>
  ): InterventionResult {
    if (intervention.type !== "introduce_diversity") {
      return { success: false, intervention: { ...intervention, applied: false } };
    }

    const targetAgents = intervention.targetAgents || [];
    if (targetAgents.length === 0) {
      return { success: false, intervention: { ...intervention, applied: false } };
    }

    const perturbationAmount = (intervention.parameters?.perturbationAmount as number) || 0.3;

    // Math-layer: perturb beliefs
    const updatedBeliefs = state.agentBeliefs.map(belief => {
      if (targetAgents.includes(belief.agentId)) {
        const perturbation = (Math.random() - 0.5) * perturbationAmount * 2;
        return { ...belief, belief: Math.max(-1, Math.min(1, belief.belief + perturbation)) };
      }
      return belief;
    });

    // ── Information-layer prompt ───────────────────────────────────────
    const prompt =
      `\n\n[Governance Runtime] ⚠️ Echo chamber detected.\n` +
      `Multiple agents are expressing highly similar views. To avoid groupthink, ` +
      `deliberately consider: what is the strongest counter-argument to your current ` +
      `position? What scenario would make your current conclusion wrong? ` +
      `Introduce one piece of contradictory evidence before proceeding.`;

    return {
      success: true,
      intervention: { ...intervention, applied: true,
        effect: `Introduced diversity prompt to ${targetAgents.length} redundant agents` },
      stateChanges: { updatedBeliefs },
      prompt,
      promptTargets: [...targetAgents],
    };
  }
}
