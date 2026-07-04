/**
 * SwarmAlpha Governance Runtime — Framework Adapters
 *
 * Each adapter bridges a specific multi-agent framework into the
 * governance runtime. Adapters translate framework-native messages
 * into the standard DiscussionMessage format and apply governance
 * interventions back to the framework.
 *
 * Currently supported:
 * - CustomAdapter (built-in agent framework)
 * - AutoGenAdapter (Microsoft AutoGen bridge)
 *
 * Planned:
 * - CrewAIAdapter, LangGraphAdapter
 */

import type { FrameworkAdapter } from "./types";
import { CustomAdapter } from "./CustomAdapter";
import { AutoGenAdapter } from "./AutoGenAdapter";

// ============================================================================
// Registry
// ============================================================================

export class AdapterRegistry {
  private adapters: Map<string, FrameworkAdapter> = new Map();

  constructor() {
    this.register("custom", new CustomAdapter());
    this.register("autogen", new AutoGenAdapter());
  }

  register(framework: string, adapter: FrameworkAdapter): void {
    this.adapters.set(framework, adapter);
  }

  get(framework: string): FrameworkAdapter | undefined {
    return this.adapters.get(framework);
  }

  list(): string[] {
    return Array.from(this.adapters.keys());
  }

  has(framework: string): boolean {
    return this.adapters.has(framework);
  }
}

/** Global singleton adapter registry. */
export const adapterRegistry = new AdapterRegistry();

// ============================================================================
// Exports
// ============================================================================

export { CustomAdapter } from "./CustomAdapter";
export { AutoGenAdapter } from "./AutoGenAdapter";
export type { FrameworkAdapter, AdapterOptions } from "./types";
