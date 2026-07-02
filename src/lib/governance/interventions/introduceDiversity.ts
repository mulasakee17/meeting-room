import {
  Intervention,
  InterventionStrategy,
  InterventionResult,
  GovernanceState,
  InterventionType,
} from "../types";

export class IntroduceDiversityIntervention implements InterventionStrategy {
  name: string = "introduce_diversity";
  type: InterventionType = "introduce_diversity";

  apply(
    intervention: Intervention,
    state: GovernanceState
  ): InterventionResult {
    if (intervention.type !== "introduce_diversity") {
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

    const perturbationAmount =
      (intervention.parameters?.perturbationAmount as number) || 0.3;

    const updatedBeliefs = state.agentBeliefs.map(belief => {
      if (targetAgents.includes(belief.agentId)) {
        const perturbation = (Math.random() - 0.5) * perturbationAmount * 2;
        const newBelief = Math.max(-1, Math.min(1, belief.belief + perturbation));
        return {
          ...belief,
          belief: newBelief,
        };
      }
      return belief;
    });

    const affectedCount = targetAgents.length;

    return {
      success: true,
      intervention: {
        ...intervention,
        applied: true,
        effect: `Introduced diversity to ${affectedCount} redundant agents`,
      },
      stateChanges: {
        updatedBeliefs,
      },
    };
  }
}
