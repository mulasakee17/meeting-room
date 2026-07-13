/**
 * SwarmAlpha Governance Runtime
 *
 * The core embeddable governance runtime for multi-agent systems.
 * Framework-agnostic — receives discussion events from ANY multi-agent
 * framework (AutoGen, CrewAI, LangGraph, or custom), orchestrates:
 *
 *   Observation → Belief Modeling → Bias Detection →
 *   Adaptive Intervention → Decision Evaluation
 *
 * Zero dependencies on Next.js, React, or any framework-specific module.
 *
 * @example
 * ```typescript
 * import { GovernanceRuntime } from "@/runtime";
 *
 * const runtime = new GovernanceRuntime({
 *   maxRounds: 5,
 *   governanceMode: "full",
 * });
 *
 * // Feed messages from your framework:
 * const result = runtime.processRound([
 *   { agentId: "a1", agentName: "Expert", agentRole: "Analyst",
 *     content: "...", belief: 0.5, confidence: 80,
 *     timestamp: new Date().toISOString(), roundNumber: 1 },
 * ]);
 *
 * if (result.hasIntervention) {
 *   // Apply interventions to your framework's agents
 * }
 *
 * // Get final evaluation:
 * const eval = runtime.evaluate();
 * ```
 */

import { GovernanceEngine } from "../lib/governance";
import type {
  AgentBelief,
  MessageInfo,
  GovernanceResult,
  GovernanceConfig,
  GovernanceIssue,
  Intervention,
  GovernanceState,
} from "../lib/governance/types";
import { EvaluationEngine } from "../lib/evaluation";
import type { EvaluationResult, AgentDecision, AgentInfo, InteractionRound } from "../lib/evaluation/types";
import type {
  DiscussionMessage,
  DiscussionRound,
  GovernanceRoundResult,
  GovernanceSessionResult,
  GovernanceRuntimeState,
  RuntimeConfig,
  BiasDetectedHandler,
  InterventionHandler,
  RoundCompleteHandler,
} from "./types";

// H24 修复：种子化 PRNG，保证 random-intervene 模式可复现
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  maxRounds: 5,
  governanceMode: "full",
  governanceConfig: {
    enableEchoChamberDetection: true,
    enableAuthorityBiasDetection: true,
    enablePolarizationDetection: true,
    enablePrematureConsensusDetection: true,
    interventionLevel: "medium",
  },
  enableAdaptiveThresholds: false,
  enableAdaptiveDosage: false,
};

// ============================================================================
// GovernanceRuntime
// ============================================================================

export class GovernanceRuntime {
  private governanceEngine: GovernanceEngine;
  private evaluationEngine: EvaluationEngine;
  private config: RuntimeConfig;
  private state: GovernanceRuntimeState;

  // Event hooks
  private biasDetectedHandlers: BiasDetectedHandler[] = [];
  private interventionHandlers: InterventionHandler[] = [];
  private roundCompleteHandlers: RoundCompleteHandler[] = [];

  constructor(config?: Partial<RuntimeConfig>) {
    this.config = { ...DEFAULT_RUNTIME_CONFIG, ...config };

    // 将 RuntimeConfig 顶层的自适应开关合并到 governanceConfig，
    // 确保 diagnoseAndIntervene 和 calibrateThresholds 能读到正确值。
    // 同时回写到 this.config.governanceConfig，使 processRound 各处传参一致。
    this.config.governanceConfig = {
      ...this.config.governanceConfig,
      maxRounds: this.config.maxRounds,
      enableAdaptiveThresholds:
        this.config.enableAdaptiveThresholds ??
        this.config.governanceConfig?.enableAdaptiveThresholds ??
        false,
      enableAdaptiveDosage:
        this.config.enableAdaptiveDosage ??
        this.config.governanceConfig?.enableAdaptiveDosage ??
        false,
    };

    this.governanceEngine = new GovernanceEngine(this.config.governanceConfig, this.config.seed);
    this.evaluationEngine = new EvaluationEngine();

    this.state = {
      currentRound: 0,
      maxRounds: this.config.maxRounds,
      rounds: [],
      agentBeliefs: [],
      issues: [],
      interventions: [],
      active: true,
      lastGovernanceResult: null,
    };
  }

  // ==========================================================================
  // Public API — Round Processing
  // ==========================================================================

  /**
   * Process one full round of discussion through the governance pipeline.
   *
   * This is the main entry point for batch (round-based) processing.
   * For streaming/incremental processing, use `onMessage()` instead.
   *
   * @param messages - All messages from agents in this round
   * @returns Governance round result with detected issues and interventions
   */
  processRound(messages: DiscussionMessage[]): GovernanceRoundResult {
    const roundNumber = messages[0]?.roundNumber ?? this.state.currentRound + 1;
    this.state.currentRound = roundNumber;

    // Update agent beliefs from messages
    this.updateBeliefsFromMessages(messages);

    // 自适应阈值校准——第一轮后自动校准（如果启用）
    // 注意：从 RuntimeConfig 顶层读取，而非 governanceConfig（后者可能未合并）
    if (
      this.config.enableAdaptiveThresholds &&
      roundNumber === 1 &&
      this.state.agentBeliefs.length > 0
    ) {
      const beliefs = this.state.agentBeliefs.map(b => b.belief);
      this.governanceEngine.calibrateThresholds({
        convergenceRounds: 1,
        maxRounds: this.config.maxRounds || 5,
        beliefs,
        messages: messages.map(m => ({
          agentId: m.agentId,
          content: m.content,
          timestamp: m.timestamp,
          referencedAgents: m.referencedAgents,
        })),
        agentCount: this.state.agentBeliefs.length,
      });
    }

    // Build the round record
    const round: DiscussionRound = {
      roundNumber,
      messages,
      converged: false, // Will be updated if convergence detected
      timestamp: new Date().toISOString(),
    };
    this.state.rounds.push(round);

    // Run governance diagnostic
    const agentBeliefs: AgentBelief[] = this.state.agentBeliefs;
    const messageInfos: MessageInfo[] = messages.map(m => ({
      agentId: m.agentId,
      content: m.content,
      timestamp: m.timestamp,
      referencedAgents: m.referencedAgents,
    }));
    const agentIds = agentBeliefs.map(b => b.agentId);

    // Determine governance mode and execute
    let governanceResult: GovernanceResult;
    let interventions: Intervention[] = [];
    let hasIntervention = false;
    /** 干预效果指标——由 evaluateEffects 填充，回传给 effectMetrics */
    let effectMetrics: Record<string, number> = {};

    switch (this.config.governanceMode) {
      case "none":
        // No detection, no intervention — baseline
        governanceResult = this.createEmptyGovernanceResult();
        break;

      case "detect-only":
        // Run detection but don't apply interventions
        governanceResult = this.governanceEngine.diagnose(
          agentBeliefs, messageInfos, agentIds,
          { ...this.config.governanceConfig, currentRound: roundNumber }
        );
        break;

      case "random-intervene": {
        // Run detection for measurement, but apply random interventions
        governanceResult = this.governanceEngine.diagnose(
          agentBeliefs, messageInfos, agentIds,
          { ...this.config.governanceConfig, currentRound: roundNumber }
        );
        interventions = this.generateRandomInterventions(agentBeliefs);
        hasIntervention = interventions.length > 0;
        if (hasIntervention) {
          // 深拷贝干预前状态——避免与干预后共享引用导致 evaluateEffects 恒返回 0
          const beforeBeliefs = this.state.agentBeliefs.map(b => ({ ...b }));
          const interactionGraph = this.buildInteractionGraphFromState();
          const beforeState: GovernanceState = {
            agentBeliefs: beforeBeliefs,
            messages: messageInfos,
            agentIds,
            interactionGraph: { nodes: [...interactionGraph.nodes], edges: interactionGraph.edges.map(e => ({ ...e })) },
          };
          const govState: GovernanceState = {
            agentBeliefs,
            messages: messageInfos,
            agentIds,
            interactionGraph: this.buildInteractionGraphFromState(),
          };
          const results = this.governanceEngine.applyInterventions(interventions, govState);
          for (const result of results) {
            if (result.success && result.stateChanges?.updatedBeliefs) {
              for (const updated of result.stateChanges.updatedBeliefs) {
                const idx = this.state.agentBeliefs.findIndex(b => b.agentId === updated.agentId);
                if (idx >= 0) this.state.agentBeliefs[idx] = { ...updated };
              }
            }
          }
          // 构建干预后状态并评估效果
          const afterState: GovernanceState = {
            agentBeliefs: this.state.agentBeliefs.map(b => ({ ...b })),
            messages: messageInfos,
            agentIds,
            interactionGraph: this.buildInteractionGraphFromState(),
          };
          effectMetrics = this.governanceEngine.evaluateEffects(beforeState, afterState, interventions);
          // 基于结构化指标记录效果（无偏：diversity 增加=改善）
          this.recordEffectsFromMetrics(interventions, effectMetrics);
        }
        break;
      }

      case "full":
      default: {
        // Full governance: detect + intervene with precision
        const diagResult = this.governanceEngine.diagnoseAndIntervene(
          agentBeliefs, messageInfos, agentIds,
          undefined,
          { ...this.config.governanceConfig, currentRound: roundNumber }
        );
        governanceResult = diagResult.result;
        if (diagResult.interventions.length > 0) {
          interventions = diagResult.interventions;
          hasIntervention = true;

          // 深拷贝干预前状态
          const beforeBeliefs = this.state.agentBeliefs.map(b => ({ ...b }));
          const interactionGraph = this.buildInteractionGraphFromState();
          const beforeState: GovernanceState = {
            agentBeliefs: beforeBeliefs,
            messages: messageInfos,
            agentIds,
            interactionGraph: { nodes: [...interactionGraph.nodes], edges: interactionGraph.edges.map(e => ({ ...e })) },
          };
          const govState: GovernanceState = {
            agentBeliefs,
            messages: messageInfos,
            agentIds,
            interactionGraph: this.buildInteractionGraphFromState(),
          };
          const results = this.governanceEngine.applyInterventions(interventions, govState);

          // 显式将干预效果写回 runtime 持久状态
          for (const result of results) {
            if (result.success && result.stateChanges) {
              if (result.stateChanges.updatedBeliefs) {
                for (const updated of result.stateChanges.updatedBeliefs) {
                  const idx = this.state.agentBeliefs.findIndex(b => b.agentId === updated.agentId);
                  if (idx >= 0) {
                    this.state.agentBeliefs[idx] = { ...updated };
                  }
                }
              }
            }
          }
          // 构建干预后状态并评估效果
          const afterState: GovernanceState = {
            agentBeliefs: this.state.agentBeliefs.map(b => ({ ...b })),
            messages: messageInfos,
            agentIds,
            interactionGraph: this.buildInteractionGraphFromState(),
          };
          effectMetrics = this.governanceEngine.evaluateEffects(beforeState, afterState, interventions);
          this.recordEffectsFromMetrics(interventions, effectMetrics);
        }
        break;
      }
    }

    this.state.lastGovernanceResult = governanceResult;

    // Collect issues
    const issues = this.extractIssues(governanceResult, roundNumber);
    this.state.issues.push(...issues);

    // Collect interventions
    if (hasIntervention) {
      // 标记干预应用的轮次
      for (const intv of interventions) {
        intv.round = roundNumber;
      }
      this.state.interventions.push(...interventions);

      // Fire intervention handlers
      for (const handler of this.interventionHandlers) {
        handler({
          roundNumber,
          intervention: interventions[0], // Primary intervention
          effectMetrics,
          timestamp: new Date().toISOString(),
        });
      }

      // Fire bias detected handlers for each detected bias
      for (const issue of issues) {
        for (const handler of this.biasDetectedHandlers) {
          handler({
            roundNumber,
            biasType: issue.type,
            severity: issue.severity,
            agents: issue.agents || [],
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // Fire round complete handlers
    for (const handler of this.roundCompleteHandlers) {
      handler({
        roundNumber,
        converged: this.state.currentRound >= this.state.maxRounds,
        governanceIssues: issues.length,
        interventionsApplied: interventions.length,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      roundNumber,
      issues,
      interventions,
      hasIntervention,
      effectMetrics,
    };
  }

  /**
   * 基于 evaluateEffects 返回的结构化指标记录干预效果到 adaptive dosage 历史。
   *
   * 无偏判定：用 belief_diversity_change（std 变化）作为通用效果指标。
   * - diversity 增加 > 0.05 → 改善（+0.5）：干预成功引入了观点多样性
   * - diversity 减少 > 0.05 → 恶化（-0.3）：干预压制了有用分歧
   * - 变化微小 → 无效果（0）
   *
   * 这比"belief 上升=改善"的旧启发式更合理：reduce_weight 期望压制主导 agent，
   * 其 belief 下降本应是改善，但旧逻辑会误判为恶化。
   */
  private recordEffectsFromMetrics(
    interventions: Intervention[],
    metrics: Record<string, number>
  ): void {
    const diversityChange = metrics["belief_diversity_change"] ?? 0;
    const effectiveness = diversityChange > 0.05 ? 0.5
      : diversityChange < -0.05 ? -0.3
      : 0;
    for (const intv of interventions) {
      this.governanceEngine.recordInterventionEffect(intv.type, effectiveness);
    }
  }

  /**
   * Process a single incremental message (for streaming/real-time mode).
   * Buffers messages and runs lightweight detection when enough data is available.
   *
   * @param message - A single discussion message
   */
  onMessage(message: DiscussionMessage): void {
    // Update belief tracking
    const existing = this.state.agentBeliefs.find(b => b.agentId === message.agentId);
    if (existing) {
      existing.belief = message.belief;
      existing.confidence = message.confidence;
    } else {
      this.state.agentBeliefs.push({
        agentId: message.agentId,
        belief: message.belief,
        confidence: message.confidence,
      });
    }

    // Add to current round buffer
    if (this.state.rounds.length === 0 ||
        this.state.rounds[this.state.rounds.length - 1].roundNumber !== message.roundNumber) {
      this.state.rounds.push({
        roundNumber: message.roundNumber,
        messages: [message],
        converged: false,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.state.rounds[this.state.rounds.length - 1].messages.push(message);
    }
  }

  // ==========================================================================
  // Public API — Evaluation
  // ==========================================================================

  /**
   * Evaluate the final decision quality using the 5-dimension evaluation
   * engine. Call this after all rounds have been processed.
   *
   * @param decisions - Agent decisions parsed from final messages
   * @param agents - Agent info
   * @param history - Interaction history (rounds of messages + beliefs)
   * @param finalDecision - The final group decision text
   * @returns Evaluation result with 5 dimension scores + overall score + grade
   */
  evaluate(
    decisions: AgentDecision[],
    agents: AgentInfo[],
    history: InteractionRound[],
    finalDecision: string
  ): EvaluationResult {
    return this.evaluationEngine.evaluate(decisions, agents, history, finalDecision);
  }

  /**
   * Convenience method: evaluate from the runtime's accumulated state.
   * Builds decisions, agents, and history from internal tracking.
   */
  evaluateFromState(finalDecision: string): EvaluationResult {
    const decisions: AgentDecision[] = this.state.agentBeliefs.map(b => ({
      agentId: b.agentId,
      content: "",
      confidence: b.confidence,
      reasoning: "",
      belief: b.belief,
    }));

    const agents: AgentInfo[] = this.state.agentBeliefs.map(b => ({
      id: b.agentId,
      name: b.agentId,
      role: "Agent",
      type: "default",
    }));

    const history: InteractionRound[] = this.state.rounds.map(r => ({
      round: r.roundNumber,
      messages: r.messages.map(m => ({
        agentId: m.agentId,
        content: m.content,
        timestamp: m.timestamp,
        referencedAgents: m.referencedAgents,
      })),
      beliefs: Object.fromEntries(
        r.messages.map(m => [m.agentId, m.belief])
      ),
      beliefChanges: {},
      converged: r.converged,
    }));

    return this.evaluate(decisions, agents, history, finalDecision);
  }

  // ==========================================================================
  // Public API — Session
  // ==========================================================================

  /**
   * Get the complete governance session result including evaluation,
   * governance diagnostics, timeline, and summary.
   */
  getSessionResult(finalDecision: string): GovernanceSessionResult {
    const evaluation = this.evaluateFromState(finalDecision);
    const governance = this.state.lastGovernanceResult || this.createEmptyGovernanceResult();

    const roundResults: GovernanceRoundResult[] = this.state.rounds.map(r => {
      const roundIssues = this.state.issues.filter(i => {
        // Round-level issues (no agents, e.g. premature_consensus): match by roundNumber
        if (!i.agents || i.agents.length === 0) return true;
        // Agent-level issues: match if any affected agent is in this round
        return r.messages.some(m => i.agents!.includes(m.agentId));
      });
      const roundInterventions = this.state.interventions.filter(
        intv => intv.targetAgentId && r.messages.some(m => m.agentId === intv.targetAgentId)
      );

      return {
        roundNumber: r.roundNumber,
        issues: roundIssues.map(i => ({
          type: i.type,
          severity: i.severity,
          description: i.description,
          agents: i.agents,
        })),
        interventions: roundInterventions,
        hasIntervention: roundInterventions.length > 0,
      };
    });

    const timeline = this.state.rounds.map(r => ({
      roundNumber: r.roundNumber,
      timestamp: r.timestamp,
      event: r.converged ? "converged" : "discussion",
      detail: `${r.messages.length} agents participated`,
    }));

    return {
      rounds: roundResults,
      evaluation,
      governance,
      timeline,
      totalInterventions: this.state.interventions.length,
      summary: governance.summary,
    };
  }

  // ==========================================================================
  // Public API — State & Configuration
  // ==========================================================================

  /** Get the current runtime state (for observability/debugging). */
  getState(): GovernanceRuntimeState {
    return { ...this.state, rounds: [...this.state.rounds] };
  }

  /** Check if the discussion is still active (haven't exceeded max rounds). */
  isActive(): boolean {
    return this.state.active && this.state.currentRound < this.state.maxRounds;
  }

  /** Mark the discussion as complete. */
  finish(): void {
    this.state.active = false;
  }

  /** Reset the runtime for a new discussion session. */
  reset(): void {
    this.state = {
      currentRound: 0,
      maxRounds: this.config.maxRounds,
      rounds: [],
      agentBeliefs: [],
      issues: [],
      interventions: [],
      active: true,
      lastGovernanceResult: null,
    };
    // H23 修复：重置 GovernanceEngine 运行时状态，防止跨实验校准缓存/干预历史污染
    this.governanceEngine.reset();
  }

  /** Update configuration at runtime. */
  configure(config: Partial<RuntimeConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.maxRounds !== undefined) {
      this.state.maxRounds = config.maxRounds;
    }
  }

  // ==========================================================================
  // Public API — Event Hooks
  // ==========================================================================

  /** Register a handler for when a bias is detected. */
  onBiasDetected(handler: BiasDetectedHandler): void {
    this.biasDetectedHandlers.push(handler);
  }

  /** Register a handler for when an intervention is applied. */
  onIntervention(handler: InterventionHandler): void {
    this.interventionHandlers.push(handler);
  }

  /** Register a handler for when a round completes. */
  onRoundComplete(handler: RoundCompleteHandler): void {
    this.roundCompleteHandlers.push(handler);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private updateBeliefsFromMessages(messages: DiscussionMessage[]): void {
    for (const msg of messages) {
      const existing = this.state.agentBeliefs.find(b => b.agentId === msg.agentId);
      if (existing) {
        existing.belief = msg.belief;
        existing.confidence = msg.confidence;
      } else {
        this.state.agentBeliefs.push({
          agentId: msg.agentId,
          belief: msg.belief,
          confidence: msg.confidence,
        });
      }
    }
  }

  /**
   * 从累积的讨论消息中重建交互图（best-effort）。
   * SDK 路径没有 DiscussionEngine 的完整交互图，
   * 但可以从 messages[].referencedAgents 提取引用关系。
   */
  private buildInteractionGraphFromState(): {
    nodes: string[];
    edges: Array<{ source: string; target: string; weight: number; type: string }>;
  } {
    const nodes = this.state.agentBeliefs.map(b => b.agentId);

    const edgeMap = new Map<string, { source: string; target: string; weight: number; type: string }>();

    for (const round of this.state.rounds) {
      for (const msg of round.messages) {
        const refs = (msg as DiscussionMessage).referencedAgents || [];
        for (const ref of refs) {
          if (ref === msg.agentId) continue;
          const key = `${msg.agentId}→${ref}`;
          if (!edgeMap.has(key)) {
            edgeMap.set(key, {
              source: msg.agentId,
              target: ref,
              type: "reference",
              weight: 1,
            });
          } else {
            edgeMap.get(key)!.weight += 0.3; // 多次引用增强权重
          }
        }
      }
    }

    return { nodes, edges: Array.from(edgeMap.values()) };
  }

  private createEmptyGovernanceResult(): GovernanceResult {
    return {
      echoChamber: {
        detected: false, severity: "low", redundantAgents: [],
        infoRedundancyScore: 0,
        intervention: { type: "none", applied: false },
      },
      authorityBias: {
        detected: false, severity: "low",
        influenceRatio: 0,
        intervention: { type: "none", applied: false },
      },
      polarization: {
        detected: false, severity: "low",
        groups: [], polarizationIndex: 0,
        intervention: { type: "none", applied: false },
      },
      prematureConsensus: {
        detected: false, severity: "low",
        roundNumber: 0, maxRounds: this.config.maxRounds,
        beliefStd: 0, consensusLevel: 0,
        intervention: { type: "none", applied: false },
      },
      otherIssues: [],
      summary: "No governance applied (mode: none)",
      interventionCount: 0,
    };
  }

  private generateRandomInterventions(agentBeliefs: AgentBelief[]): Intervention[] {
    const types: Array<Intervention["type"]> = [
      "reduce_weight", "introduce_diversity", "force_reflection", "continue_discussion",
    ];
    // H24 修复：用种子化 PRNG 替代 Math.random，保证可复现
    const rng = mulberry32((this.config.seed ?? 42) + 0x5A4D);
    const count = 1 + Math.floor(rng() * 3); // 1-3 random interventions

    return Array.from({ length: count }, () => {
      const type = types[Math.floor(rng() * types.length)];
      const target = agentBeliefs[Math.floor(rng() * agentBeliefs.length)];
      return {
        type,
        targetAgentId: target?.agentId,
        targetAgents: target ? [target.agentId] : undefined,
        parameters: {},
        effect: `Random ${type} intervention`,
        applied: true,
      };
    });
  }

  private extractIssues(
    result: GovernanceResult,
    roundNumber: number
  ): GovernanceRuntimeState["issues"] {
    const issues: GovernanceRuntimeState["issues"] = [];
    if (result.echoChamber.detected) {
      issues.push({
        type: "echo_chamber",
        severity: result.echoChamber.severity,
        description: `Echo chamber detected (redundancy: ${result.echoChamber.infoRedundancyScore.toFixed(2)})`,
        agents: result.echoChamber.redundantAgents,
        roundNumber,
      });
    }
    if (result.authorityBias.detected) {
      issues.push({
        type: "authority_bias",
        severity: result.authorityBias.severity,
        description: `Authority bias detected (ratio: ${result.authorityBias.influenceRatio.toFixed(2)})${result.authorityBias.dominantAgent ? `, dominant: ${result.authorityBias.dominantAgent}` : ""}`,
        agents: result.authorityBias.dominantAgent ? [result.authorityBias.dominantAgent] : [],
        roundNumber,
      });
    }
    if (result.polarization.detected) {
      issues.push({
        type: "polarization",
        severity: result.polarization.severity,
        description: `Group polarization detected (index: ${result.polarization.polarizationIndex.toFixed(2)})`,
        agents: result.polarization.groups.flatMap(g => g.agentIds),
        roundNumber,
      });
    }
    if (result.prematureConsensus.detected) {
      issues.push({
        type: "premature_consensus",
        severity: result.prematureConsensus.severity,
        description: `Premature consensus detected (round ${result.prematureConsensus.roundNumber}/${result.prematureConsensus.maxRounds}, consensus: ${result.prematureConsensus.consensusLevel.toFixed(2)})`,
        agents: undefined,
        roundNumber,
      });
    }
    // Also add otherIssues
    for (const issue of result.otherIssues) {
      issues.push({ ...issue, roundNumber });
    }
    return issues;
  }
}
