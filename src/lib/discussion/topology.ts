/**
 * Discussion Topology — Scalable Agent Grouping Abstraction
 *
 * PROBLEM: The default discussion model is a flat round-table where n agents
 * all talk to each other. This works for n≤10 but breaks at n≥20 due to:
 *   - O(n²) pairwise comparisons in governance
 *   - Overlong LLM context (all n agents' opinions in one prompt)
 *   - Information overload (agents can't track all other voices)
 *
 * SOLUTION: A topology controls how agents are partitioned into sub-groups
 * for each discussion round. After sub-group discussions, beliefs are merged
 * into the global state for governance detection and intervention.
 *
 * KEY PROPERTY: The governance pipeline (diagnose → intervene → evaluate)
 * operates on the GLOBAL agent state and is completely unchanged. Only the
 * discussion structure changes. This means the same bias detectors and
 * intervention strategies work at any scale.
 *
 * EXTENSIBILITY: To support new scaling patterns (hierarchical, federated,
 * dynamic, etc.), implement the DiscussionTopology interface. The engine
 * needs zero changes.
 */

import type { DiscussionAgent } from "./index";

// ============================================================================
// Core Interface
// ============================================================================

/**
 * Controls how agents are organized into discussion groups each round.
 *
 * Implementations define the information flow topology:
 *   - FlatTopology:       all agents in one group (current default, n≤10)
 *   - GroupedTopology:    fixed-size groups, reshuffled each round (n≤100)
 *   - CommitteeTopology:  groups → representatives → plenary (n≤500)
 *   - DynamicTopology:    groups adapt based on belief similarity (future)
 */
export interface DiscussionTopology {
  /** Human-readable name for logging/debugging */
  readonly name: string;

  /** Maximum agents per discussion group. Groups with fewer agents are OK. */
  readonly maxGroupSize: number;

  /**
   * Partition agents into discussion groups for the given round.
   *
   * @param agents  - All agents participating in the discussion
   * @param round   - Current round number (1-indexed)
   * @param beliefs - Current global belief state (agentId → belief).
   *                  Topologies may use this to form belief-aware groups.
   * @returns Array of agent groups. Each group discusses independently.
   *          Agents not included in any group skip this round.
   */
  partition(
    agents: DiscussionAgent[],
    round: number,
    beliefs?: Map<string, number>,
  ): DiscussionAgent[][];
}

// ============================================================================
// Built-in Topologies
// ============================================================================

/**
 * Flat (round-table) topology — all agents in a single discussion group.
 *
 * This is the DEFAULT topology and preserves the existing behavior exactly.
 * Use for n ≤ 10.
 *
 * Complexity per round:
 *   LLM calls:  n (one per agent)
 *   Governance: O(n²) pairwise comparisons
 *   Context:    each agent sees all n-1 other opinions
 */
export class FlatTopology implements DiscussionTopology {
  readonly name = "flat";
  readonly maxGroupSize: number;

  constructor(maxGroupSize = 50) {
    this.maxGroupSize = maxGroupSize;
  }

  partition(agents: DiscussionAgent[]): DiscussionAgent[][] {
    return [agents];
  }
}

/**
 * Grouped topology — splits agents into fixed-size groups, reshuffled each round.
 *
 * Agents are randomly assigned to groups of at most `groupSize`.
 * Groups are reshuffled each round so information diffuses across the
 * full agent pool over multiple rounds.
 *
 * Use for 10 < n ≤ 100.
 *
 * Complexity per round:
 *   LLM calls:  n (one per agent, same total)
 *   Per-group context: ≤ groupSize agents → smaller prompts
 *   Governance: O(n²) on merged global beliefs (unchanged)
 *
 * TRADE-OFF: Information propagates across groups only between rounds
 * (via belief updates). Within a single round, agents in group A don't
 * hear group B's discussion. This is realistic — it's how committees work.
 */
export class GroupedTopology implements DiscussionTopology {
  readonly name = "grouped";
  readonly maxGroupSize: number;
  private shuffleSeed: number;

  constructor(groupSize = 8, shuffleSeed = 42) {
    this.maxGroupSize = groupSize;
    this.shuffleSeed = shuffleSeed;
  }

  partition(
    agents: DiscussionAgent[],
    round: number,
  ): DiscussionAgent[][] {
    const n = agents.length;
    if (n <= this.maxGroupSize) return [agents];

    // Deterministic shuffle per round (seed = base + round)
    const shuffled = this.shuffle([...agents], this.shuffleSeed + round);

    // Split into groups
    const groups: DiscussionAgent[][] = [];
    for (let i = 0; i < shuffled.length; i += this.maxGroupSize) {
      groups.push(shuffled.slice(i, i + this.maxGroupSize));
    }
    return groups;
  }

  /** Fisher-Yates shuffle with deterministic seed (mulberry32). */
  private shuffle(arr: DiscussionAgent[], seed: number): DiscussionAgent[] {
    const rng = mulberry32(seed);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/**
 * Committee topology — groups → representatives → plenary.
 *
 * Round structure (3-phase per round):
 *   1. COMMITTEE phase: agents discuss in groups of `groupSize`
 *   2. REPRESENTATIVE phase: one rep per group meets in a cross-group plenary
 *   3. REPORT phase: reps report back to their groups (next round's phase 1)
 *
 * This is the classic "committee of committees" pattern. Use for n > 100.
 *
 * NOTE: This is a PLACEHOLDER implementation. Phase 2 and 3 are stubbed.
 * Full implementation requires tracking representatives and scheduling
 * cross-group synthesis rounds. Implement when needed.
 */
export class CommitteeTopology implements DiscussionTopology {
  readonly name = "committee";
  readonly maxGroupSize: number;

  constructor(groupSize = 8) {
    this.maxGroupSize = groupSize;
  }

  partition(
    agents: DiscussionAgent[],
    _round: number,
  ): DiscussionAgent[][] {
    const n = agents.length;
    if (n <= this.maxGroupSize) return [agents];

    // Phase 1 only: split into committees
    // Future: phases 2-3 add representative cross-talk
    const groups: DiscussionAgent[][] = [];
    for (let i = 0; i < n; i += this.maxGroupSize) {
      groups.push(agents.slice(i, i + this.maxGroupSize));
    }
    return groups;
  }
}

// ============================================================================
// Utility
// ============================================================================

/** Mulberry32 deterministic PRNG (same as used in analyze.ts bootstrap). */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
