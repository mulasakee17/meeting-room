/**
 * SwarmAlpha Governance Runtime — Governance Bridge Types
 *
 * Defines the GovernanceBridge interface that translates external agent messages
 * into the standard DiscussionMessage format consumed by the GovernanceRuntime,
 * and applies interventions back to the external framework.
 *
 * NOTE: This is distinct from the "Framework Adapters" in src/lib/adapters/,
 * which handle agent creation and interaction execution (createAgents, runInteraction).
 * GovernanceBridges handle message translation and intervention application.
 *
 * Framework-agnostic by design. Zero dependencies on any specific framework.
 */

import type { DiscussionMessage, FrameworkMessage } from "../types";
import type { Intervention } from "../../lib/governance/types";

// ============================================================================
// GovernanceBridge Interface
// ============================================================================

/**
 * A GovernanceBridge connects an external multi-agent framework
 * (AutoGen, CrewAI, LangGraph, or any custom system) to the SwarmAlpha
 * governance runtime.
 *
 * Responsibilities:
 * 1. Transform framework-specific messages into the standard DiscussionMessage format
 * 2. Apply governance interventions back to the framework's agents
 *
 * Each supported framework has its own bridge implementation.
 *
 * Distinct from src/lib/adapters/ FrameworkAdapter, which handles agent lifecycle
 * (createAgents, runInteraction) for the research platform's execution pipeline.
 */
export interface GovernanceBridge {
  /** The framework identifier (e.g., "autogen", "crewai", "langgraph", "custom") */
  readonly framework: string;

  /**
   * Transform raw messages from the external framework into the
   * framework-agnostic DiscussionMessage format that the governance
   * runtime understands.
   *
   * @param rawMessages - Framework-specific message objects
   * @param roundNumber - The current discussion round number
   * @returns Standardized discussion messages
   */
  adaptMessages(
    rawMessages: FrameworkMessage[],
    roundNumber: number
  ): DiscussionMessage[];

  /**
   * Apply a governance intervention back to the external framework's agents.
   *
   * For example, if the governance runtime recommends `reduce_weight` on
   * a dominant agent, the adapter translates this into framework-specific
   * actions (e.g., lowering that agent's influence in AutoGen's group chat).
   *
   * @param intervention - The intervention to apply
   * @param context - Framework-specific context (agent references, etc.)
   * @returns Whether the intervention was successfully applied
   */
  applyIntervention(
    intervention: Intervention,
    context: unknown
  ): Promise<boolean>;

  /**
   * Extract the current beliefs of all agents managed by this framework.
   * Used by the governance runtime for initial state setup.
   */
  extractBeliefs(context: unknown): Array<{
    agentId: string;
    belief: number;
    confidence: number;
  }>;
}

// ============================================================================
// Adapter Configuration
// ============================================================================

/** Options passed when constructing a governance bridge. */
export interface BridgeOptions {
  /** LLM provider configuration (if the bridge manages LLM calls) */
  llmConfig?: {
    provider: string;
    model: string;
    temperature?: number;
  };
  /** Custom system prompt for agents */
  systemPrompt?: string;
  /** Whether governance is enabled for this bridge */
  governanceEnabled?: boolean;
  /** 可复现性 seed — 用于 introduce_diversity 等随机干预的确定性 PRNG */
  seed?: number;
  /** Additional framework-specific options */
  custom?: Record<string, unknown>;
}

// ============================================================================
// Bridge Registry
// ============================================================================

/**
 * Registry of all available governance bridges.
 * New bridges can be registered at runtime.
 */
export interface BridgeRegistry {
  /** Register a new governance bridge */
  register(framework: string, bridge: GovernanceBridge): void;

  /** Get a bridge by framework name */
  get(framework: string): GovernanceBridge | undefined;

  /** List all registered framework names */
  list(): string[];

  /** Check if a governance bridge is registered */
  has(framework: string): boolean;
}
