/**
 * SwarmAlpha Governance Runtime — Governance Bridges
 *
 * Each bridge connects a specific multi-agent framework into the
 * governance runtime, translating framework-native messages into
 * the standard DiscussionMessage format and applying governance
 * interventions back to the framework.
 *
 * NOTE: These are distinct from the FrameworkAdapters in src/lib/adapters/,
 * which handle agent creation and interaction lifecycle (createAgents,
 * runInteraction) for the research platform's execution pipeline.
 *
 * Currently supported:
 * - CustomAdapter (built-in agent bridge)
 * - AutoGenAdapter (Microsoft AutoGen bridge)
 *
 * Planned:
 * - CrewAI bridge, LangGraph bridge
 */

import type { GovernanceBridge } from "./types";
import { CustomAdapter } from "./CustomAdapter";
import { AutoGenAdapter } from "./AutoGenAdapter";

// ============================================================================
// Registry
// ============================================================================

export class AdapterRegistry {
  private adapters: Map<string, GovernanceBridge> = new Map();

  constructor() {
    this.register("custom", new CustomAdapter());
    this.register("autogen", new AutoGenAdapter());
  }

  register(framework: string, bridge: GovernanceBridge): void {
    this.adapters.set(framework, bridge);
  }

  get(framework: string): GovernanceBridge | undefined {
    return this.adapters.get(framework);
  }

  list(): string[] {
    return Array.from(this.adapters.keys());
  }

  has(framework: string): boolean {
    return this.adapters.has(framework);
  }
}

/** Global singleton bridge registry. */
export const adapterRegistry = new AdapterRegistry();

// ============================================================================
// Exports
// ============================================================================

export { CustomAdapter } from "./CustomAdapter";
export { AutoGenAdapter } from "./AutoGenAdapter";
export type { GovernanceBridge, BridgeOptions } from "./types";
