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
    state: GovernanceState,
    agentKnowledge?: Map<string, string[]>
  ): InterventionResult {
    if (intervention.type !== "continue_discussion") {
      return {
        success: false,
        intervention: { ...intervention, applied: false },
      };
    }

    const additionalRounds = (intervention.parameters?.additionalRounds as number) || 2;
    const reason = intervention.parameters?.reason as string || "Premature consensus detected";

    // ── Information-layer prompt generation ──────────────────────────
    let prompt: string | undefined;

    if (agentKnowledge && agentKnowledge.size > 0) {
      // Scan what has been discussed so far
      const allMessages = state.messages.map(m => m.content).join(" ").toLowerCase();
      const undiscussedByAgent = new Map<string, string[]>();

      for (const [agentId, knowledgeItems] of agentKnowledge) {
        const undiscussed: string[] = [];
        for (const item of knowledgeItems) {
          // Check if key parts of this knowledge item appear in the discussion
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
        parts.push("\n\n[Governance Runtime] ⚠️ Premature consensus detected.");
        parts.push("The group is converging too quickly. Critical information has NOT been discussed:\n");

        for (const [agentId, items] of undiscussedByAgent) {
          const agentName = state.agentBeliefs.find(a => a.agentId === agentId)?.agentId || agentId;
          parts.push(`${agentName}'s unique perspective:`);
          for (const item of items) {
            parts.push(`  • ${item}`);
          }
        }

        parts.push(`\nPlease debate these undiscussed points before finalizing your ranking.`);
        prompt = parts.join("\n");
      }
    }

    // Fallback: generic prompt when no knowledge map is available
    if (!prompt) {
      prompt =
        `\n\n[Governance Runtime] ⚠️ Premature consensus detected.\n` +
        `The group is converging too quickly (round ${state.agentBeliefs[0] ? "early" : "1"}). ` +
        `Please reconsider your position — are there alternative viewpoints or information ` +
        `that haven't been raised yet? Challenge each other before finalizing.`;
    }

    return {
      success: true,
      intervention: {
        ...intervention,
        applied: true,
        effect: `Added ${additionalRounds} rounds + injected undiscussed information prompt`,
      },
      prompt,
      stateChanges: {},
    };
  }
}
