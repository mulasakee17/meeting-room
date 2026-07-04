/**
 * SwarmAlpha Governance Runtime
 *
 * The public API surface for the embeddable governance runtime.
 * Import everything you need from this single entry point:
 *
 * @example
 * ```typescript
 * import { GovernanceRuntime, AdapterRegistry, CustomAdapter } from "@/runtime";
 *
 * // Create the governance runtime
 * const runtime = new GovernanceRuntime({
 *   maxRounds: 5,
 *   governanceMode: "full",
 * });
 *
 * // Create a framework adapter
 * const adapter = new CustomAdapter();
 *
 * // Adapt framework messages and feed to runtime
 * const messages = adapter.adaptMessages(rawMessages, 1);
 * const result = runtime.processRound(messages);
 *
 * if (result.hasIntervention) {
 *   await adapter.applyIntervention(result.interventions[0], agentContext);
 * }
 *
 * // Get final evaluation
 * const sessionResult = runtime.getSessionResult(finalDecision);
 * console.log(sessionResult.evaluation.overallScore);
 * ```
 *
 * @module SwarmAlpha Governance Runtime
 */

// Core runtime
export { GovernanceRuntime } from "./GovernanceRuntime";

// Types
export type {
  DiscussionMessage,
  DiscussionRound,
  GovernanceRoundResult,
  GovernanceSessionResult,
  GovernanceRuntimeState,
  RuntimeConfig,
  FrameworkMessage,
  BiasDetectedHandler,
  InterventionHandler,
  RoundCompleteHandler,
} from "./types";

// Adapters
export {
  AdapterRegistry,
  adapterRegistry,
  CustomAdapter,
  AutoGenAdapter,
} from "./adapters";

export type {
  GovernanceBridge,
  BridgeOptions,
} from "./adapters/types";
