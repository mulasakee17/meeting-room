/**
 * AutoGen Framework Adapter
 *
 * Bridges AutoGen (Python-based multi-agent framework) discussions into
 * the SwarmAlpha governance runtime.
 *
 * ## Architecture
 *
 * AutoGen runs in Python. Integration happens via one of two paths:
 *
 * **Path A — HTTP Bridge (recommended for research/demos):**
 *   A lightweight Python sidecar exposes AutoGen agent messages over HTTP.
 *   This adapter sends messages to/from the sidecar.
 *
 *   ```
 *   AutoGen (Python) ←→ sidecar HTTP ←→ AutoGenAdapter (TypeScript) ←→ GovernanceRuntime
 *   ```
 *
 * **Path B — Direct Integration (in Python):**
 *   For production use, the governance runtime should be called from within
 *   the Python process. This adapter documents the message protocol used
 *   by the corresponding Python-side `swarmalpha_governance` package.
 *
 * ## Current Limitations
 *
 * **Message adaptation (`adaptMessages`) is implemented** and can transform
 * AutoGen's native message format into DiscussionMessage.
 *
 * **Intervention application (`applyIntervention`) is NOT implemented.**
 * Full AutoGen integration requires a Python companion package that
 * implements the other half of the bridge. Calling `applyIntervention`
 * will throw an explicit error rather than silently pretending success.
 *
 * @see docs/integration/autogen.md for full integration guide
 */

import type { GovernanceBridge, BridgeOptions } from "./types";
import type { DiscussionMessage, FrameworkMessage } from "../types";
import type { Intervention } from "../../lib/governance/types";

export class AutoGenAdapter implements GovernanceBridge {
  readonly framework = "autogen";
  private options: BridgeOptions;

  constructor(options: BridgeOptions = {}) {
    this.options = {
      governanceEnabled: true,
      ...options,
    };
  }

  /**
   * Transform AutoGen messages into the standard DiscussionMessage format.
   *
   * AutoGen's native message format (from AutoGen's GroupChat):
   * ```json
   * {
   *   "name": "assistant",
   *   "role": "user",
   *   "content": "I think we should...",
   *   "metadata": { "belief": 0.6, "confidence": 75 }
   * }
   * ```
   *
   * This adapter normalizes these into DiscussionMessage.
   */
  adaptMessages(
    rawMessages: FrameworkMessage[],
    roundNumber: number
  ): DiscussionMessage[] {
    return rawMessages.map((msg) => {
      // AutoGen typically uses "name" as the agent identifier
      const agentId = msg.agentId || (msg.metadata?.name as string) || "unknown";

      return {
        agentId,
        agentName: msg.agentName || (msg.metadata?.name as string) || agentId,
        agentRole: msg.agentRole || (msg.metadata?.role as string) || "Assistant",
        content: msg.content,
        belief: msg.belief ?? (msg.metadata?.belief as number) ?? 0,
        confidence: msg.confidence ?? (msg.metadata?.confidence as number) ?? 50,
        timestamp: msg.timestamp || new Date().toISOString(),
        referencedAgents: (msg.metadata?.referencedAgents as string[]) || [],
        reasoning: (msg.metadata?.reasoning as string) || msg.content,
        roundNumber,
      };
    });
  }

  /**
   * Apply a governance intervention to AutoGen agents.
   *
   * **NOT IMPLEMENTED.** Full AutoGen integration requires a Python sidecar
   * that handles the actual intervention application. Until that package
   * is available, this method throws an explicit error rather than
   * silently returning `true` and misleading the caller.
   *
   * To actually apply interventions to AutoGen agents, either:
   * 1. Implement the Python sidecar and set `this.options.sidecarUrl`
   * 2. Use `StateInferenceBridge` instead, which applies interventions
   *    via prompt injection (no Python sidecar needed)
   */
  async applyIntervention(
    intervention: Intervention,
    _context: unknown
  ): Promise<boolean> {
    throw new Error(
      `[AutoGenAdapter] applyIntervention is not implemented. ` +
      `AutoGen intervention application requires a Python sidecar (not yet built). ` +
      `Use StateInferenceBridge for prompt-based intervention, or implement the sidecar. ` +
      `Intervention was: ${intervention.type}` +
      (intervention.targetAgentId ? ` on agent ${intervention.targetAgentId}` : "") +
      (intervention.targetAgents ? ` on agents [${intervention.targetAgents.join(", ")}]` : "")
    );
  }

  /**
   * Extract agent beliefs from AutoGen context.
   *
   * In HTTP bridge mode, this would GET /agents/state from the sidecar.
   * Currently only reads from the passed-in context object.
   */
  extractBeliefs(context: unknown): Array<{
    agentId: string;
    belief: number;
    confidence: number;
  }> {
    const ctx = context as Record<string, unknown> | null;

    if (ctx?.agents && Array.isArray(ctx.agents)) {
      return (ctx.agents as Array<Record<string, unknown>>).map((a: Record<string, unknown>) => ({
        agentId: (a.id || a.name || "unknown") as string,
        belief: (a.belief as number) ?? 0,
        confidence: (a.confidence as number) ?? 50,
      }));
    }

    return [];
  }
}
