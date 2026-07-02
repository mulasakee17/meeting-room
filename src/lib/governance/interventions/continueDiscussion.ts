import {
  Intervention,
  InterventionStrategy,
  InterventionResult,
  GovernanceState,
  InterventionType,
} from "../types";

export class ContinueDiscussionIntervention implements InterventionStrategy {
  name: string = "continue_discussion";
  type: InterventionType = "continue_discussion";

  apply(
    intervention: Intervention,
    state: GovernanceState
  ): InterventionResult {
    if (intervention.type !== "continue_discussion") {
      return {
        success: false,
        intervention: { ...intervention, applied: false },
      };
    }

    const additionalRounds = (intervention.parameters?.additionalRounds as number) || 2;
    const reason = intervention.parameters?.reason as string || "Premature consensus detected";

    return {
      success: true,
      intervention: {
        ...intervention,
        applied: true,
        effect: `Added ${additionalRounds} additional discussion rounds due to: ${reason}`,
      },
      stateChanges: {},
    };
  }
}