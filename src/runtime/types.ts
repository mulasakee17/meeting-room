/**
 * SwarmAlpha Governance Runtime — Type Definitions
 *
 * Framework-agnostic types for the embeddable governance runtime.
 * These types describe the discussion stream that ANY multi-agent framework
 * can feed into the runtime for observation, bias detection, intervention,
 * and decision quality evaluation.
 *
 * Zero dependencies on Next.js, React, or any framework-specific module.
 */

import type { GovernanceConfig, GovernanceResult, Intervention } from "../lib/governance/types";
import type { EvaluationResult, EvaluationConfig } from "../lib/evaluation/types";

// ============================================================================
// Discussion Stream (framework-agnostic input)
// ============================================================================

/**
 * A single message/utterance from an agent in a discussion.
 * Framework adapters translate their native message format into this.
 */
export interface DiscussionMessage {
  /** Unique agent identifier */
  agentId: string;
  /** Agent display name */
  agentName: string;
  /** Agent role (e.g. "Expert", "Critic", "Analyst") */
  agentRole: string;
  /** The agent's message content (natural language) */
  content: string;
  /** Agent's current belief value [-1, 1] */
  belief: number;
  /** Agent's confidence [0, 100] */
  confidence: number;
  /** Timestamp of this message (ISO 8601) */
  timestamp: string;
  /** IDs of other agents referenced in this message */
  referencedAgents?: string[];
  /** The reasoning/evidence text extracted from this message */
  reasoning?: string;
  /** Round number this message belongs to */
  roundNumber: number;
}

/**
 * A single round of discussion — a collection of messages from all
 * participating agents in one turn of the conversation.
 */
export interface DiscussionRound {
  /** Round number (1-indexed) */
  roundNumber: number;
  /** All agent messages in this round */
  messages: DiscussionMessage[];
  /** Whether the discussion has converged in this round */
  converged: boolean;
  /** ISO 8601 timestamp */
  timestamp: string;
}

// ============================================================================
// Governance Runtime State
// ============================================================================

/** The current state tracked by the governance runtime across rounds. */
export interface GovernanceRuntimeState {
  /** Current round number */
  currentRound: number;
  /** Maximum allowed rounds */
  maxRounds: number;
  /** All rounds processed so far */
  rounds: DiscussionRound[];
  /** Current agent beliefs (latest values) */
  agentBeliefs: Array<{ agentId: string; belief: number; confidence: number }>;
  /** Detected bias issues across all rounds */
  issues: Array<{
    type: string;
    severity: "low" | "medium" | "high";
    description: string;
    agents?: string[];
    roundNumber: number;
  }>;
  /** Interventions applied across all rounds */
  interventions: Intervention[];
  /** Whether the discussion is still active */
  active: boolean;
  /** The most recent governance diagnostic result */
  lastGovernanceResult: GovernanceResult | null;
}

// ============================================================================
// Runtime Output
// ============================================================================

/** Result from processing a single round through the governance runtime. */
export interface GovernanceRoundResult {
  /** The round number processed */
  roundNumber: number;
  /** Governance issues detected in this round */
  issues: Array<{
    type: string;
    severity: "low" | "medium" | "high";
    description: string;
    agents?: string[];
  }>;
  /** Interventions triggered in this round */
  interventions: Intervention[];
  /** Whether any intervention was applied */
  hasIntervention: boolean;
  /** Metrics about the intervention effects */
  effectMetrics?: Record<string, number>;
}

/** Result from processing a full multi-agent discussion. */
export interface GovernanceSessionResult {
  /** All round results in order */
  rounds: GovernanceRoundResult[];
  /** Final evaluation of decision quality (5 dimensions) */
  evaluation: EvaluationResult;
  /** Aggregate governance diagnostic */
  governance: GovernanceResult;
  /** Full governance timeline */
  timeline: Array<{
    roundNumber: number;
    timestamp: string;
    event: string;
    detail: string;
  }>;
  /** Total interventions applied */
  totalInterventions: number;
  /** Summary of the governance session */
  summary: string;
}

// ============================================================================
// Runtime Configuration
// ============================================================================

/** Configuration for the governance runtime. */
export interface RuntimeConfig {
  /** Maximum discussion rounds */
  maxRounds: number;
  /** Governance mode */
  governanceMode: "none" | "detect-only" | "random-intervene" | "full";
  /** Governance detection & intervention config */
  governanceConfig?: GovernanceConfig;
  /** Evaluation config */
  evaluationConfig?: EvaluationConfig;
  /** Whether to enable adaptive thresholds */
  enableAdaptiveThresholds?: boolean;
  /** Whether to enable adaptive dosage */
  enableAdaptiveDosage?: boolean;
  /** Whether to enable causal tracing */
  enableCausalTracing?: boolean;
  /** Whether to enable cross-examination */
  enableCrossExamination?: boolean;
}

// ============================================================================
// Event Hooks
// ============================================================================

/** Handler called when a bias is detected. */
export type BiasDetectedHandler = (event: {
  roundNumber: number;
  biasType: string;
  severity: "low" | "medium" | "high";
  agents: string[];
  timestamp: string;
}) => void;

/** Handler called when an intervention is applied. */
export type InterventionHandler = (event: {
  roundNumber: number;
  intervention: Intervention;
  effectMetrics?: Record<string, number>;
  timestamp: string;
}) => void;

/** Handler called when a round completes. */
export type RoundCompleteHandler = (event: {
  roundNumber: number;
  converged: boolean;
  governanceIssues: number;
  interventionsApplied: number;
  timestamp: string;
}) => void;

// ============================================================================
// Framework Message (adapter input format)
// ============================================================================

/**
 * Raw message format that framework adapters receive from external systems.
 * Each adapter is responsible for converting its framework's native format
 * into DiscussionMessage[].
 */
export interface FrameworkMessage {
  /** Source agent identifier (framework-specific) */
  agentId: string;
  /** Source agent name */
  agentName?: string;
  /** Source agent role */
  agentRole?: string;
  /** Message text content */
  content: string;
  /** Agent's current belief (if tracked by the framework) */
  belief?: number;
  /** Agent's confidence (if tracked by the framework) */
  confidence?: number;
  /** When the message was sent */
  timestamp?: string;
  /** Additional framework-specific metadata */
  metadata?: Record<string, unknown>;
}
