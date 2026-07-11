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
 * - StateInferenceBridge (universal bridge for any framework)
 *
 * StateInferenceBridge is the recommended adapter for external frameworks
 * (AutoGen, CrewAI, LangGraph, etc.). It uses a three-tier extraction
 * strategy (explicit field > [GOV] tag > default) and translates all
 * interventions into prompt injections, requiring zero modification
 * to the host framework's agents.
 *
 * Planned:
 * - CrewAI bridge, LangGraph bridge
 */

import type { GovernanceBridge, BridgeRegistry } from "./types";
import { CustomAdapter } from "./CustomAdapter";
import { AutoGenAdapter } from "./AutoGenAdapter";
import { StateInferenceBridge } from "./StateInferenceBridge";

// ============================================================================
// Registry
// ============================================================================

/**
 * AdapterRegistry 实现 BridgeRegistry 接口，保证注册表契约一致性。
 * 新的桥接实现可在此注册或通过 register() 动态追加。
 */
export class AdapterRegistry implements BridgeRegistry {
  private adapters: Map<string, GovernanceBridge> = new Map();

  constructor() {
    this.register("custom", new CustomAdapter());
    this.register("autogen", new AutoGenAdapter());
    this.register("state-inference", new StateInferenceBridge());
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
export { StateInferenceBridge } from "./StateInferenceBridge";
export {
  buildGovernanceExtension,
  extractGovTag,
  stripGovTag,
  interventionToPrompt,
  getInterventionTargets,
  type ExtractedState,
} from "./PromptInjector";
export type { GovernanceBridge, BridgeOptions } from "./types";
