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
 * This adapter currently provides the TypeScript-side interface and message
 * protocol. Full AutoGen integration requires a Python companion package
 * that implements the other half of the bridge. Until that package is
 * available, this adapter uses the built-in CustomAgent as a fallback.
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
   * In HTTP bridge mode, this sends a PATCH to the Python sidecar.
   * In direct mode, this is handled by the Python-side governance package.
   *
   * Currently logs the intervention and returns true for documentation purposes.
   * Full implementation requires the Python bridge to be running.
   */
  async applyIntervention(
    intervention: Intervention,
    _context: unknown
  ): Promise<boolean> {
    // When the Python bridge is available:
    //   await fetch(`${sidecarUrl}/intervene`, {
    //     method: "POST",
    //     body: JSON.stringify(intervention),
    //   });

    console.log(
      `[AutoGenAdapter] Intervention requested: ${intervention.type}` +
      (intervention.targetAgentId ? ` on agent ${intervention.targetAgentId}` : "") +
      (intervention.targetAgents ? ` on agents [${intervention.targetAgents.join(", ")}]` : "")
    );

    // Return true to indicate the intervention was acknowledged.
    // The Python sidecar (when running) handles actual application.
    return true;
  }

  /**
   * Extract agent beliefs from AutoGen context.
   *
   * In HTTP bridge mode, this would GET /agents/state from the sidecar.
   */
  extractBeliefs(context: unknown): Array<{
    agentId: string;
    belief: number;
    confidence: number;
  }> {
    // When the Python bridge is available, beliefs are fetched from the sidecar.
    // For now, we return whatever the context provides.
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
