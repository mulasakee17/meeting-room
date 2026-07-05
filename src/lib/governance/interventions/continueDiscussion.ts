import {
  Intervention, InterventionStrategy, InterventionResult,
  GovernanceState, InterventionType,
} from "../types";

export class ContinueDiscussionIntervention implements InterventionStrategy {
  name: string = "continue_discussion";
  type: InterventionType = "continue_discussion";

  apply(
    intervention: Intervention,
    state: GovernanceState,
    agentKnowledge?: Map<string, string[]>
  ): InterventionResult {
    if (intervention.type !== "continue_discussion") {
      return { success: false, intervention: { ...intervention, applied: false } };
    }

    const additionalRounds = (intervention.parameters?.additionalRounds as number) || 2;

    let prompt: string | undefined;

    if (agentKnowledge && agentKnowledge.size > 0) {
      const allMessages = state.messages.map(m => m.content).join(" ").toLowerCase();
      const undiscussedByAgent = new Map<string, string[]>();

      for (const [agentId, knowledgeItems] of agentKnowledge) {
        const undiscussed: string[] = [];
        for (const item of knowledgeItems) {
          const keywords = item.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const mentioned = keywords.some(kw => allMessages.includes(kw));
          if (!mentioned) {
            undiscussed.push(item);
          }
        }
        if (undiscussed.length > 0) {
          undiscussedByAgent.set(agentId, undiscussed);
        }
      }

      if (undiscussedByAgent.size > 0) {
        const parts: string[] = [];
        parts.push("\n\n═══ GOVERNANCE INTERVENTION ═══");
        parts.push("⚠️ CRITICAL: The group is converging too quickly. Your current ranking is at risk of being wrong because the following crucial information has NOT been discussed:\n");

        for (const [agentId, items] of undiscussedByAgent) {
          parts.push(`${agentId} holds unique data that DIRECTLY CHANGES the priority order:`);
          for (const item of items) {
            parts.push(`  ▶ ${item}`);
          }
        }

        parts.push(`\nThis is NOT optional. Your ranking MUST account for these data points.`);
        parts.push(`If your current ranking ignores any of the above, REVISE IT NOW.`);
        parts.push(`═ END GOVERNANCE INTERVENTION ══`);
        prompt = parts.join("\n");
      }
    }

    if (!prompt) {
      prompt =
        `\n\n═══ GOVERNANCE INTERVENTION ═══\n` +
        `⚠️ CRITICAL: Premature consensus detected. The group is agreeing too fast.\n` +
        `STOP. Reconsider. Are there alternative viewpoints that haven't been raised?\n` +
        `Challenge each other BEFORE finalizing. State one counter-argument now.\n` +
        `═ END GOVERNANCE INTERVENTION ══`;
    }

    return {
      success: true,
      intervention: { ...intervention, applied: true,
        effect: `Added ${additionalRounds} rounds + injected critical undiscussed information` },
      prompt,
      stateChanges: {},
    };
  }
}
