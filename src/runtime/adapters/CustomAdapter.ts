/**
 * Custom Framework Adapter
 *
 * Adapter for the built-in CustomAgent framework (the default agent
 * implementation used by the SwarmAlpha research platform).
 *
 * This adapter demonstrates the standard adapter pattern: it receives
 * messages from CustomAgent instances, transforms them into framework-agnostic
 * DiscussionMessages, and can apply governance interventions back.
 */

import type { GovernanceBridge, BridgeOptions } from "./types";
import type { DiscussionMessage, FrameworkMessage } from "../types";
import type { Intervention } from "../../lib/governance/types";

// ============================================================================
// CustomBridge — built-in agent governance bridge
// ============================================================================

export class CustomAdapter implements GovernanceBridge {
  readonly framework = "custom";
  private options: BridgeOptions;

  constructor(options: BridgeOptions = {}) {
    this.options = {
      governanceEnabled: true,
      ...options,
    };
  }

  adaptMessages(
    rawMessages: FrameworkMessage[],
    roundNumber: number
  ): DiscussionMessage[] {
    return rawMessages.map((msg, index) => ({
      agentId: msg.agentId,
      agentName: msg.agentName || `Agent ${msg.agentId}`,
      agentRole: msg.agentRole || "Expert",
      content: msg.content,
      belief: msg.belief ?? 0,
      confidence: msg.confidence ?? 50,
      timestamp: msg.timestamp || new Date().toISOString(),
      referencedAgents: (msg.metadata?.referencedAgents as string[]) || [],
      reasoning: (msg.metadata?.reasoning as string) || "",
      roundNumber,
    }));
  }

  async applyIntervention(
    intervention: Intervention,
    context: unknown
  ): Promise<boolean> {
    // continue_discussion is a signal-type intervention — no agent state needed.
    if (intervention.type === "continue_discussion") {
      return true;
    }

    // For other interventions, agent context is required.
    const ctx = context as {
      agents?: Array<{
        id: string;
        getState: () => { belief: number; confidence: number };
        setState: (s: { belief: number; confidence: number }) => void;
      }>;
    } | null;

    if (!ctx?.agents) {
      console.warn(`[CustomAdapter] Cannot apply intervention: no agent context provided`);
      return false;
    }

    switch (intervention.type) {
      case "reduce_weight": {
        // In Custom framework, "reducing weight" means lowering the
        // dominant agent's confidence, making them less influential.
        const target = ctx.agents.find(a => a.id === intervention.targetAgentId);
        if (target) {
          const state = target.getState() || { belief: 0, confidence: 50 };
          target.setState({
            belief: state.belief,
            confidence: Math.max(10, state.confidence * 0.5),
          });
          return true;
        }
        return false;
      }

      case "introduce_diversity": {
        // Perturb the beliefs of redundant agents slightly
        const targets = intervention.targetAgents || [];
        let applied = false;
        for (const agentId of targets) {
          const target = ctx.agents.find(a => a.id === agentId);
          if (target) {
            const state = target.getState() || { belief: 0, confidence: 50 };
            const perturbation = (Math.random() - 0.5) * 0.6;
            target.setState({
              belief: Math.max(-1, Math.min(1, state.belief + perturbation)),
              confidence: state.confidence,
            });
            applied = true;
          }
        }
        return applied;
      }

      case "force_reflection": {
        // Pull extreme beliefs toward the mean
        const targets = intervention.targetAgents || [];
        if (targets.length === 0 || !ctx.agents) return false;

        const allBeliefs = ctx.agents.map(a => a.getState().belief || 0);
        const mean = allBeliefs.reduce((s: number, b: number) => s + b, 0) / allBeliefs.length;

        let applied = false;
        for (const agentId of targets) {
          const target = ctx.agents.find(a => a.id === agentId);
          if (target) {
            const state = target.getState() || { belief: 0, confidence: 50 };
            const factor = 0.2;
            target.setState({
              belief: state.belief + (mean - state.belief) * factor,
              confidence: Math.max(10, state.confidence - 5),
            });
            applied = true;
          }
        }
        return applied;
      }

      default:
        console.warn(`[CustomAdapter] Unknown intervention type: ${intervention.type}`);
        return false;
    }
  }

  extractBeliefs(context: unknown): Array<{
    agentId: string;
    belief: number;
    confidence: number;
  }> {
    const ctx = context as {
      agents?: Array<{ id: string; getState: () => { belief: number; confidence: number } }>;
    } | null;

    if (!ctx?.agents) return [];

    return ctx.agents.map(a => {
      const state = a.getState();
      return {
        agentId: a.id,
        belief: state.belief ?? 0,
        confidence: state.confidence ?? 50,
      };
    });
  }
}
