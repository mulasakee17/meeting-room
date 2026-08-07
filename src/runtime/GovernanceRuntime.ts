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

import { mulberry32 } from "../lib/utils/statsUtils";
import { GovernanceEngine } from "../lib/governance";
import type {
  AgentBelief,
  MessageInfo,
  GovernanceResult,
  GovernanceConfig,
  GovernanceIssue,
  Intervention,
  GovernanceState,
  CognitiveGovernanceState,
  CognitiveStateModification,
} from "../lib/governance/types";
import { generateCognitiveInterventions } from "../lib/governance/cognitiveInterventions";
import { MeasurementLayer } from "../lib/thermodynamics/MeasurementLayer";
import { estimateAll } from "../lib/thermodynamics/ProgressiveEstimator";
import {
  beliefToCognitiveState,
  utilityFromItemBeliefs,
  extractEvidenceItems,
  updateEvidence,
  updateConfidence,
  updateInertia,
  type AgentCognitiveState,
} from "../lib/agent/cognitiveState";
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
  /** 持久 PRNG — random-intervene 模式专用，避免每轮重建导致相同干预 */
  private randomInterveneRng: () => number;
  /** v3.2: MeasurementLayer for cognitive governance mode */
  private measurementLayer: MeasurementLayer;
  /** v3.2: Cached cognitive states (built from messages each round) */
  private cognitiveStates: Map<string, AgentCognitiveState> = new Map();

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
    // v3.2: MeasurementLayer for cognitive governance (lazy-initialized cognitive states)
    this.measurementLayer = new MeasurementLayer(this.config.governanceEstimatorRegistry);
    // 持久 PRNG：random-intervene 模式下跨轮保持状态，避免每轮产生相同随机干预
    this.randomInterveneRng = mulberry32((this.config.seed ?? 42) + 0x5A4D);

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
    /** v3.2: Cognitive modifications (only in "cognitive" mode) */
    let cognitiveModifications: Map<string, CognitiveStateModification> | undefined;
    /** v3.2: Thermo state (only in "cognitive" mode) */
    let thermoState: { R: number; T: number; H: number; F: number } | undefined;

    switch (this.config.governanceMode) {
      case "none":
        // No detection, no intervention — baseline
        governanceResult = this.createEmptyGovernanceResult();
        break;

      case "cognitive": {
        // @deprecated since v6: "cognitive" mode is a dead branch.
        // Runner.ts (experiments/campaign/pipeline/Runner.ts:292-296) translates
        // "cognitive" → governanceMode="full" + useCognitiveGovernance=true before
        // constructing the engine, so this case is never reached in experiments.
        // SDK users should use governanceMode="full" + useCognitiveGovernance=true instead.
        // Implementation retained for backward compatibility but scheduled for removal.
        console.warn("[GovernanceRuntime] governanceMode='cognitive' is deprecated. Use governanceMode='full' + useCognitiveGovernance=true instead. This branch will be removed in a future version.");
        // v3.2: Cognitive governance — non-destructive interventions
        // Build cognitive states from messages, run cognitive detectors,
        // generate inject_evidence/rebalance_attention interventions.
        const cognitiveResult = this.runCognitiveGovernance(
          messages, roundNumber, agentIds,
        );
        governanceResult = cognitiveResult.governanceResult;
        interventions = cognitiveResult.interventions;
        hasIntervention = interventions.length > 0;
        effectMetrics = cognitiveResult.effectMetrics;
        // Store cognitive modifications for the result
        cognitiveModifications = cognitiveResult.cognitiveModifications;
        thermoState = cognitiveResult.thermoState;
        break;
      }

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
      cognitiveModifications,
      thermoState,
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
    // v3.2: 重置认知状态和 MeasurementLayer
    this.cognitiveStates.clear();
    this.measurementLayer = new MeasurementLayer(this.config.governanceEstimatorRegistry);
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
      informationWithholding: {
        detected: false, severity: "low", withholdingAgents: [],
        intervention: { type: "none", applied: false },
      },
      ignoredInput: {
        detected: false, severity: "low", ignoringAgents: [],
        intervention: { type: "none", applied: false },
      },
      reasoningActionMismatch: {
        detected: false, severity: "low", mismatchAgents: [],
        intervention: { type: "none", applied: false },
      },
      otherIssues: [],
      summary: "No governance applied (mode: none)",
      interventionCount: 0,
    };
  }

  // ==========================================================================
  // v3.2: Cognitive Governance (non-destructive interventions)
  // ==========================================================================

  /**
   * 运行认知治理：从 messages 构建认知状态 → 运行认知检测器 → 生成非破坏性干预。
   *
   * 与旧 "full" 模式的关键区别：
   * - 使用 6 个认知检测器（基于 Utility/Evidence/Inertia，而非标量 belief）
   * - 生成非破坏性干预（inject_evidence, rebalance_attention, shuffle_knowledge）
   * - 不直接修改 agent 的 belief/confidence，只通过 prompt 注入和发言优先级调整
   * - 计算 R/T/H/F 热力学状态，暴露给外部监控
   *
   * 降级策略：
   * - 若 message 不含 itemBeliefs/cognitiveState → 从 belief/confidence 反推认知状态
   * - 若无 agentKnowledge → inject_evidence 降级为 evidenceGuidance 提示
   */
  private runCognitiveGovernance(
    messages: DiscussionMessage[],
    roundNumber: number,
    agentIds: string[],
  ): {
    governanceResult: GovernanceResult;
    interventions: Intervention[];
    effectMetrics: Record<string, number>;
    cognitiveModifications: Map<string, CognitiveStateModification>;
    thermoState: { R: number; T: number; H: number; F: number };
  } {
    // Step 1: Build cognitive states from messages
    this.buildCognitiveStatesFromMessages(messages, roundNumber);

    // Step 2: Build CognitiveGovernanceState map for detectors
    const govStateMap = this.buildCognitiveGovernanceStates(agentIds);

    // Step 3: v6 δ 诊断（替代旧 runDetectors）
    const { delta, suggestions } = this.measurementLayer.diagnoseAndSuggestSync(roundNumber);

    // Step 4: 将 suggestions 转为 issues 格式（兼容 generateCognitiveInterventions）
    const deltaIssues: GovernanceIssue[] = suggestions.map((s, i) => ({
      type: s.source as any,
      severity: "medium" as const,
      description: s.reason,
      agents: s.targetAgents,
      source: "custom" as const,
      suggestedIntervention: {
        type: s.type,
        targetAgents: s.targetAgents,
        reason: s.reason,
      },
      detectedAt: new Date().toISOString(),
      id: `delta_${roundNumber}_${i}`,
    }));

    // Step 5: v6 渐进估计（用于置信度感知干预降级）
    const progressiveEstimates = estimateAll(this.cognitiveStates, roundNumber);

    // Step 6: Generate non-destructive interventions
    const agentKnowledge = this.config.agentKnowledge;
    const { interventions, cognitiveModifications } = generateCognitiveInterventions(
      deltaIssues, govStateMap, this.config.governanceConfig ?? {}, agentKnowledge,
      progressiveEstimates,
    );

    // Step 7: Compute thermo state (R/T/H/F)
    const thermo = this.measurementLayer.computeThermoState();

    // Step 8: Build governance result
    const governanceResult = this.buildCognitiveGovernanceResult(
      deltaIssues, interventions, roundNumber,
    );

    // Step 8: Effect metrics (cognitive mode uses thermo-based metrics)
    const effectMetrics: Record<string, number> = {
      thermo_R: thermo.R,
      thermo_T: thermo.T,
      thermo_H: thermo.H,
      thermo_F: thermo.F,
      cognitive_issues_count: deltaIssues.length,
      cognitive_interventions_count: interventions.length,
    };

    return {
      governanceResult,
      interventions,
      effectMetrics,
      cognitiveModifications,
      thermoState: thermo,
    };
  }

  /**
   * 从 DiscussionMessage 构建 AgentCognitiveState。
   *
   * 优先使用 message 中的 cognitiveState/itemBeliefs（原生模式），
   * 否则从 belief/confidence 反推（兼容模式）。
   */
  private buildCognitiveStatesFromMessages(messages: DiscussionMessage[], roundNumber: number): void {
    for (const msg of messages) {
      let state = this.cognitiveStates.get(msg.agentId);

      if (!state) {
        // 首次见到此 agent：初始化
        state = beliefToCognitiveState(
          msg.agentId, msg.agentName, msg.agentRole,
          msg.belief, msg.confidence,
        );
      }

      // 若 message 提供 native cognitiveState，直接采用
      if (msg.cognitiveState) {
        if (msg.cognitiveState.utility) {
          state.utility = {
            ...state.utility,
            scores: msg.cognitiveState.utility.scores,
            topChoice: msg.cognitiveState.utility.topChoice,
          };
        }
        if (msg.cognitiveState.evidenceCoverage !== undefined) {
          state.evidence = { ...state.evidence, coverage: msg.cognitiveState.evidenceCoverage };
        }
        if (msg.cognitiveState.evidenceQuality !== undefined) {
          state.evidence = { ...state.evidence, quality: msg.cognitiveState.evidenceQuality };
        }
      } else if (msg.itemBeliefs && msg.itemBeliefs.length > 0) {
        // 从 itemBeliefs 提取 Utility
        state.utility = utilityFromItemBeliefs(msg.itemBeliefs);
      } else {
        // 兼容模式：从 belief 反推 Utility（有损但向后兼容）
        const options = Object.keys(state.utility.scores);
        if (options.length >= 2) {
          state.utility.scores[options[0]] = msg.belief;
          state.utility.scores[options[1]] = -msg.belief;
          state.utility.topChoice = msg.belief > 0 ? options[0] : options[1];
        }
      }

      // 更新 confidence
      state.confidence = { ...state.confidence, overall: msg.confidence / 100 };

      // 若 message 提供 evidence 字符串，更新 Evidence
      if (msg.evidence && msg.evidence.length > 0 && msg.itemBeliefs) {
        const newItems = extractEvidenceItems(msg.evidence, msg.itemBeliefs, msg.agentId, roundNumber);
        state.evidence = updateEvidence(state.evidence, newItems, roundNumber);
        state.confidence = updateConfidence(state.evidence, state.utilityHistory);
      }

      // 更新 Inertia（角色不变，本轮发言）
      state.inertia = updateInertia(
        state.inertia, msg.agentRole, true, state.evidence, false,
      );

      // 记录 utility history
      state.utilityHistory.push({ round: roundNumber, scores: { ...state.utility.scores } });
      if (state.utilityHistory.length > 10) state.utilityHistory.shift();

      this.cognitiveStates.set(msg.agentId, state);
    }

    // 同步到 MeasurementLayer（通过 public API，不用 as any hack）
    this.measurementLayer.setCognitiveStates(this.cognitiveStates);
  }

  /**
   * 从 cognitiveStates 构建 CognitiveGovernanceState map（检测器输入）。
   */
  private buildCognitiveGovernanceStates(agentIds: string[]): Map<string, CognitiveGovernanceState> {
    const result = new Map<string, CognitiveGovernanceState>();

    for (const agentId of agentIds) {
      const state = this.cognitiveStates.get(agentId);
      if (!state) continue;

      const susceptibility = Math.max(
        (1 - state.inertia.strength) * (1 - state.confidence.overall),
        0.05,
      );

      result.set(agentId, {
        agentId,
        utility: {
          scores: state.utility.scores,
          topChoice: state.utility.topChoice,
          preferenceClarity: state.utility.preferenceClarity,
          intensity: state.utility.intensity,
        },
        evidence: {
          coverage: state.evidence.coverage,
          quality: state.evidence.quality,
          diversity: state.evidence.diversity,
        },
        inertia: {
          strength: state.inertia.strength,
        },
        confidence: {
          overall: state.confidence.overall,
        },
        susceptibility,
      });
    }

    return result;
  }

  /**
   * 构建认知治理的 GovernanceResult（兼容旧格式，供外部消费者使用）。
   */
  private buildCognitiveGovernanceResult(
    issues: GovernanceIssue[],
    interventions: Intervention[],
    roundNumber: number,
  ): GovernanceResult {
    // 将认知 issues 映射到旧 GovernanceResult 格式
    const hasEchoChamber = issues.some(i => i.type.includes("echo_chamber"));
    const hasAuthorityBias = issues.some(i => i.type.includes("authority_bias"));
    const hasPolarization = issues.some(i => i.type.includes("polarization"));
    const hasPrematureConsensus = issues.some(i => i.type.includes("premature_consensus"));

    return {
      echoChamber: {
        detected: hasEchoChamber,
        severity: hasEchoChamber ? "medium" : "low",
        redundantAgents: [],
        infoRedundancyScore: 0,
        intervention: { type: hasEchoChamber ? "rebalance_attention" : "none", applied: hasEchoChamber },
      },
      authorityBias: {
        detected: hasAuthorityBias,
        severity: hasAuthorityBias ? "medium" : "low",
        influenceRatio: 0,
        intervention: { type: hasAuthorityBias ? "rebalance_attention" : "none", applied: hasAuthorityBias },
      },
      polarization: {
        detected: hasPolarization,
        severity: hasPolarization ? "high" : "low",
        groups: [],
        polarizationIndex: 0,
        intervention: { type: hasPolarization ? "inject_evidence" : "none", applied: hasPolarization },
      },
      prematureConsensus: {
        detected: hasPrematureConsensus,
        severity: hasPrematureConsensus ? "medium" : "low",
        roundNumber,
        maxRounds: this.config.maxRounds,
        beliefStd: 0,
        consensusLevel: 0,
        intervention: { type: hasPrematureConsensus ? "inject_evidence" : "none", applied: hasPrematureConsensus },
      },
      // MAST 检测器（v3.2 cognitive 模式不启用，填空值以兼容 GovernanceResult 类型）
      informationWithholding: {
        detected: false,
        severity: "low",
        withholdingAgents: [],
        intervention: { type: "none", applied: false },
      },
      ignoredInput: {
        detected: false,
        severity: "low",
        ignoringAgents: [],
        intervention: { type: "none", applied: false },
      },
      reasoningActionMismatch: {
        detected: false,
        severity: "low",
        mismatchAgents: [],
        intervention: { type: "none", applied: false },
      },
      otherIssues: issues.map(i => ({
        type: i.type,
        severity: i.severity,
        description: i.description,
        agents: i.agents,
        source: i.source as "builtin" | "custom" | undefined,
        suggestedIntervention: i.suggestedIntervention,
        detectionMetrics: i.detectionMetrics,
      })),
      summary: `Cognitive governance: ${issues.length} issues, ${interventions.length} non-destructive interventions`,
      interventionCount: interventions.length,
    };
  }

  private generateRandomInterventions(agentBeliefs: AgentBelief[]): Intervention[] {
    const types: Array<Intervention["type"]> = [
      "reduce_weight", "introduce_diversity", "force_reflection", "continue_discussion",
    ];
    // H-Fix: 使用持久 PRNG（构造时初始化），避免每轮重建导致相同干预
    const rng = this.randomInterveneRng;
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
