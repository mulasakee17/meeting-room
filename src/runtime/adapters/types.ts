/**
 * SwarmAlpha Governance Runtime — Framework Adapter Types
 *
 * Defines the interface that any multi-agent framework adapter must implement
 * to bridge external agent messages into the SwarmAlpha governance runtime.
 *
 * Framework-agnostic by design. Zero dependencies on any specific framework.
 */

import type { DiscussionMessage, FrameworkMessage } from "../types";
import type { Intervention } from "../../lib/governance/types";

// ============================================================================
// Framework Adapter Interface
// ============================================================================

/**
 * A framework adapter bridges an external multi-agent framework
 * (AutoGen, CrewAI, LangGraph, or any custom system) into the
 * SwarmAlpha governance runtime.
 *
 * Responsibilities:
 * 1. Transform framework-specific messages into the standard DiscussionMessage format
 * 2. Apply governance interventions back to the framework's agents
 *
 * Each supported framework has its own adapter implementation.
 */
export interface FrameworkAdapter {
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

/** Options passed when constructing a framework adapter. */
export interface AdapterOptions {
  /** LLM provider configuration (if the adapter manages LLM calls) */
  llmConfig?: {
    provider: string;
    model: string;
    temperature?: number;
  };
  /** Custom system prompt for agents */
  systemPrompt?: string;
  /** Whether governance is enabled for this adapter */
  governanceEnabled?: boolean;
  /** Additional framework-specific options */
  custom?: Record<string, unknown>;
}

// ============================================================================
// Adapter Registry
// ============================================================================

/**
 * Registry of all available framework adapters.
 * New adapters can be registered at runtime.
 */
export interface AdapterRegistry {
  /** Register a new framework adapter */
  register(framework: string, adapter: FrameworkAdapter): void;

  /** Get an adapter by framework name */
  get(framework: string): FrameworkAdapter | undefined;

  /** List all registered framework names */
  list(): string[];

  /** Check if a framework adapter is registered */
  has(framework: string): boolean;
}
