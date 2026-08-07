import {
  DiscussionConfig,
  DiscussionResult,
  RoundResult,
  AgentOpinion,
  DiscussionMemoryEntry,
  InteractionGraph,
  DecisionTraceEntry,
  InfluenceFactor,
  DiscussionData,
  RoundData,
  DiscussionEvent,
  DiscussionTask,
  AgentInfo,
  RoundStopDecision,
  RoundStateCommit,
} from "./types";

import { MemoryManager, InMemoryStrategy } from "./memory";
import { InfluenceManager, RuleBasedInfluence } from "./influence";
import { InteractionGraphBuilder } from "./interactionGraph";
import { DecisionTraceBuilder } from "./decisionTrace";
import { GovernanceEngine, AgentBelief, MessageInfo, GovernanceIssue, Intervention } from "../governance";
import type { GovernanceConfig } from "../governance/types";
import type { TerminationDecision } from "../thermodynamics/TerminationDecider";
import { EventTracker } from "./eventTracker";
import { DefaultOpinionParser } from "../observation";
import { canonicalizeOpinionOptions } from "../observation/optionCanonicalization";
import { safeJsonParse } from "../utils/jsonUtils";
import { mulberry32 } from "../utils/statsUtils";
import { InferenceLayer } from "../inference";
import type { RawObservation, ObserverAgent, OpinionParser } from "../observation";
import type { StateDelta } from "../inference";
import type { EvaluationConfig } from "../evaluation/types";
import { selectCounterfactualDropout, type DropoutObservation } from "./sensitivityTrace";
import {
  shouldActivateCrossExamination,
  formCamps,
  buildChallengePrompt,
  synthesizeVerdict,
  computeBeliefShift,
  type CrossExamAgent,
  type CrossExaminationResult,
} from "./crossExamination";
import {
  DISCUSSION_DEFAULT_CONVERGENCE_THRESHOLD,
  DISCUSSION_DECISION_POSITIVE_THRESHOLD,
  DISCUSSION_DECISION_NEGATIVE_THRESHOLD,
  BELIEF_MIN,
  BELIEF_MAX,
  CONFIDENCE_MIN,
  CONFIDENCE_MAX,
  // 审计字段：detectionMetrics 需要存阈值供第三方验证（2026-07-23 新增）
  GOVERNANCE_ECHO_CHAMBER_THRESHOLD,
  GOVERNANCE_AUTHORITY_BIAS_THRESHOLD,
  GOVERNANCE_POLARIZATION_THRESHOLD,
  GOVERNANCE_PREMATURE_CONSENSUS_THRESHOLD,
} from "../constants";
import type { GovernanceRuntime as GovernanceRuntimeType } from "@/runtime/GovernanceRuntime";
import type { DiscussionMessage } from "@/runtime/types";
// RuntimeContext / CollectiveDecisionState 定义在 src/lib/discussion-types/types.ts（runtime 内部类型），
// 不在 src/runtime/types.ts（框架适配层）。makeInferenceContext 需要这两个类型构造 inference 上下文。
import type { RuntimeContext, CollectiveDecisionState, ExperimentConfig } from "../discussion-types/types";
import { createHash } from "node:crypto";
import {
  EpistemicLedger,
  type BeliefExposure,
  type BeliefReport,
  type EpistemicEvidence,
  type EpistemicEvent,
} from "../epistemic";
import {
  beliefToCognitiveState,
  updateCognitiveState,
  utilityFromItemBeliefs,
  cognitiveStateToBelief,
  cognitiveStateToConfidence,
  type AgentCognitiveState,
  type CognitiveStateUpdateInput,
} from "../agent/cognitiveState";


export interface DiscussionAgent {
  id: string;
  name: string;
  role: string;
  type: string;
  sendMessage(message: string): Promise<string>;
  getState(): { belief: number; confidence: number };
  setState(state: { belief: number; confidence: number }): void;
}

type RoundGovernanceResult = {
  hasIntervention: boolean;
  interventions: Intervention[];
  effectMetrics?: Record<string, number>;
  issues: GovernanceIssue[];
};

interface FinalizedRound {
  roundResult: RoundResult;
  roundData: RoundData;
  governanceResult: RoundGovernanceResult | null;
  terminationDecision: TerminationDecision | null;
  stopDecision: RoundStopDecision;
}

type EpistemicRoundBatch = {
  evidence: EpistemicEvidence[];
  reports: BeliefReport[];
  exposures: BeliefExposure[];
};

export class DiscussionEngine {
  protected memoryManager: MemoryManager;
  private influenceManager: InfluenceManager;
  protected graphBuilder: InteractionGraphBuilder;
  protected traceBuilder: DecisionTraceBuilder;
  protected governanceEngine: GovernanceEngine;
  private externalRuntime?: GovernanceRuntimeType;
  /** agentId → unique knowledge items for information-layer intervention prompts */
  protected agentKnowledge?: Map<string, string[]>;
  /** Accumulated governance prompts for next-round injection. Cleared after each round. */
  protected governancePrompts: Map<string, string[]> = new Map();

  /** 注入治理 prompt（供 Phase D 等外部使用） */
  addGovernancePrompt(agentId: string, prompt: string): void {
    if (!this.governancePrompts.has(agentId)) this.governancePrompts.set(agentId, []);
    this.governancePrompts.get(agentId)!.push(prompt);
  }
  protected eventTracker: EventTracker;
  protected config: DiscussionConfig;
  protected roundDataArray: RoundData[] = [];
  protected epistemicRunActive = false;
  private epistemicLedger = new EpistemicLedger();
  private pendingEpistemicRounds = new Map<number, EpistemicRoundBatch>();
  private latestEpistemicReport = new Map<string, string>();
  private epistemicReportClaims = new Map<string, string>();
  private epistemicSequence = 0;
  /** Mutable per-run state must never be shared across independent tasks. */
  private lifecycleState: "idle" | "running" | "completed" = "idle";

  protected beginRunLifecycle(): void {
    if (this.lifecycleState === "running") {
      throw new Error("DiscussionEngine is already running; concurrent runs are not supported");
    }
    if (this.lifecycleState === "completed") {
      throw new Error("DiscussionEngine contains completed-run state; call reset() before reusing it");
    }
    this.lifecycleState = "running";
  }

  protected completeRunLifecycle(): void {
    // A failed run also leaves partial state behind and therefore requires reset().
    this.lifecycleState = "completed";
  }
  private inferenceLayer: InferenceLayer;
  protected opinionParser: OpinionParser;
  private dropoutObservations: Array<{
    round: number; sourceAgentId: string; targetAgentId: string;
    sourcePresent: boolean; sourceBelief: number; targetBelief: number;
  }> = [];
  /** 交叉质证结果 (如果触发) */
  private crossExaminationResult: CrossExaminationResult | null = null;
  /** 持久 PRNG — random-intervene 模式专用，避免每轮重建导致相同干预 */
  private randomInterveneRng: () => number;
  /** v3.0: Agent cognitive states (only populated when useCognitiveState=true) */
  protected cognitiveStates: Map<string, AgentCognitiveState> = new Map();

  constructor(config?: Partial<DiscussionConfig>, governanceRuntime?: GovernanceRuntimeType) {
    this.config = {
      maxRounds: 3,
      convergenceThreshold: DISCUSSION_DEFAULT_CONVERGENCE_THRESHOLD,
      beliefUpdateStrategy: "rule_based",
      influenceStrategy: "rule_based",
      memoryStrategy: "in_memory",
      governanceMode: "full",
      enableCrossExamination: false,
      terminationPolicy: "surface",
      ...config,
    };

    this.memoryManager = new MemoryManager(new InMemoryStrategy());
    this.influenceManager = new InfluenceManager(new RuleBasedInfluence());
    this.graphBuilder = new InteractionGraphBuilder();
    this.traceBuilder = new DecisionTraceBuilder();
    this.governanceEngine = new GovernanceEngine(this.config.governanceConfig, this.config.seed);
    this.externalRuntime = governanceRuntime;
    // 持久 PRNG：random-intervene 模式下跨轮保持状态，避免每轮产生相同随机干预
    this.randomInterveneRng = mulberry32((this.config.seed ?? 42) + 0x5A4D);
    this.eventTracker = new EventTracker();
    this.inferenceLayer = new InferenceLayer();
    this.opinionParser = new DefaultOpinionParser();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Run a full multi-round discussion.
   *
   * Phases: initialize agents → main loop (observe → parse → graph → trace →
   * converge? → update beliefs → govern → record) → build result.
   */
  async run(agents: DiscussionAgent[], task: DiscussionTask): Promise<DiscussionResult> {
    this.beginRunLifecycle();
    try {
      this.initializeEpistemicTask(task);
      this.eventTracker.track({
        type: "round_start", timestamp: new Date().toISOString(), roundNumber: 0,
        payload: { task: task.id, agentCount: agents.length },
      });

      const agentStates = this.initializeAgentStates(agents);

      const roundResults = await this.runMainLoop(agents, task, agentStates);
      const result = this.buildDiscussionResult(roundResults, agentStates);

      this.eventTracker.track({
        type: "decision", timestamp: new Date().toISOString(),
        roundNumber: result.totalRounds,
        payload: {
          finalDecision: result.finalDecision,
          converged: result.converged,
          acceptedConsensus: result.acceptedConsensus,
          stopReason: result.stopReason,
          totalRounds: result.totalRounds,
        },
      });

      return result;
    } finally {
      this.completeRunLifecycle();
    }
  }

  // ==========================================================================
  // Private: run() sub-methods
  // ==========================================================================

  /** Phase 1: snapshot initial agent states and populate graph nodes. */
  protected initializeAgentStates(
    agents: DiscussionAgent[]
  ): Map<string, { belief: number; confidence: number }> {
    const agentStates = new Map<string, { belief: number; confidence: number }>();
    for (const agent of agents) {
      const state = agent.getState();
      agentStates.set(agent.id, { belief: state.belief, confidence: state.confidence });
      this.graphBuilder.addNode(agent.id, agent.name, agent.role, state.belief, state.confidence);

      // v3.0: Initialize cognitive state if enabled
      if (this.config.useCognitiveState) {
        this.cognitiveStates.set(agent.id, beliefToCognitiveState(
          agent.id, agent.name, agent.role,
          state.belief, state.confidence,
        ));
      }
    }
    return agentStates;
  }

  /** Phase 2: run the observe→parse→graph→trace→converge→belief→govern loop. */
  private async runMainLoop(
    agents: DiscussionAgent[],
    task: DiscussionTask,
    agentStates: Map<string, { belief: number; confidence: number }>
  ): Promise<RoundResult[]> {
    const roundResults: RoundResult[] = [];

    for (let round = 1; round <= this.config.maxRounds; round++) {
      this.eventTracker.track({
        type: "round_start", timestamp: new Date().toISOString(),
        roundNumber: round, payload: {},
      });

      // -- agent dropout (sensitivity analysis) ---------------------------
      let dropoutAgentId: string | null = null;
      if (this.config.enableDropoutAnalysis && agents.length >= 3) {
        const dropout = selectCounterfactualDropout(agents.map(a => a.id), round, this.config.seed);
        if (dropout) dropoutAgentId = dropout.droppedAgentId;
      }

      // -- observe & collect opinions --------------------------------------
      const participatingAgents = dropoutAgentId
        ? agents.filter(a => a.id !== dropoutAgentId)
        : agents;

      // -- topology: optionally split into sub-groups for scalability --------
      const topology = this.config.topology;
      const useTopology = topology && participatingAgents.length > topology.maxGroupSize;

      let opinions: AgentOpinion[];
      if (useTopology) {
        // Partition agents into sub-groups, run each independently
        const beliefMap = new Map<string, number>();
        agentStates.forEach((s, id) => beliefMap.set(id, s.belief));
        const groups = topology!.partition(participatingAgents, round, beliefMap);
        const groupResults: AgentOpinion[][] = [];
        for (const group of groups) {
          if (group.length === 0) continue;
          const groupOpinions = await this.runRound(group, task, round, agentStates);
          groupResults.push(groupOpinions);
        }
        opinions = groupResults.flat();
      } else {
        opinions = await this.runRound(participatingAgents, task, round, agentStates);
      }

      // Record dropout observations for sensitivity analysis
      // 反事实设计：dropped agent 本轮真正不发言，其"在场"对照从上一轮历史读取
      if (dropoutAgentId && this.config.enableDropoutAnalysis) {
        const droppedState = agentStates.get(dropoutAgentId);
        if (droppedState) {
          // sourcePresent=false: dropped agent 不在场时其他 agent 的 belief
          for (const opinion of opinions) {
            this.dropoutObservations.push({
              round, sourceAgentId: dropoutAgentId, targetAgentId: opinion.agentId,
              sourcePresent: false, sourceBelief: droppedState.belief, targetBelief: opinion.belief,
            });
          }
          // sourcePresent=true: 从上一轮历史读取 dropped agent 在场时其他 agent 的 belief
          // 第一轮无历史时跳过（无法同时观测在场/不在场两种状态）
          if (round > 1) {
            const prevRoundData = this.roundDataArray.find(r => r.roundNumber === round - 1);
            if (prevRoundData) {
              const droppedPrevOpinion = prevRoundData.opinions.find(o => o.agentId === dropoutAgentId);
              if (droppedPrevOpinion) {
                for (const otherOpinion of prevRoundData.opinions) {
                  if (otherOpinion.agentId !== dropoutAgentId) {
                    this.dropoutObservations.push({
                      round, sourceAgentId: dropoutAgentId, targetAgentId: otherOpinion.agentId,
                      sourcePresent: true, sourceBelief: droppedPrevOpinion.belief, targetBelief: otherOpinion.belief,
                    });
                  }
                }
              }
            }
          }
        }
      }
      // -- cross-examination (if enabled and divergence detected) -------------
      // Only trigger once per discussion to avoid infinite retry loops
      if (this.config.enableCrossExamination
          && !this.crossExaminationResult  // not already done
          && opinions.length >= 4
          && round <= 2  // only in early rounds when divergence is fresh
      ) {
        const crossExamCheck = shouldActivateCrossExamination(opinions);
        if (crossExamCheck.activate) {
          try {
            this.crossExaminationResult = await this.runCrossExamination(
              opinions, agents, round
            );
            // Apply belief shifts from cross-examination to agent states
            this.applyCrossExaminationShifts(opinions, agentStates);
          } catch (err) {
            // 交叉质证是可选增强，失败时降级为"未执行"，不阻断主讨论
            console.warn(`[CrossExam] degraded, skipped: ${err instanceof Error ? err.message : err}`);
          }
        }
      }

      // 本轮唯一提交点：测量、治理、审计记录全部完成后，终止决策才能控制主循环。
      const finalized = await this.finalizeRound({
        round,
        opinions,
        agents,
        agentStates,
        task,
      });
      roundResults.push(finalized.roundResult);

      if (finalized.stopDecision.shouldStop) break;
    }

    return roundResults;
  }

  /**
   * 一轮讨论的唯一提交点。
   *
   * 生命周期不变量：只要一轮已经产生 opinions，就必须先完成状态更新、治理诊断、
   * trace/roundData/event 写入，随后终止仲裁才能让主循环退出。治理在当轮状态更新后
   * 运行，因此本轮生成的干预从下一轮开始生效，避免当轮测量被事后干预污染。
   */
  private async finalizeRound(input: {
    round: number;
    opinions: AgentOpinion[];
    agents: DiscussionAgent[];
    agentStates: Map<string, { belief: number; confidence: number }>;
    task: DiscussionTask;
  }): Promise<FinalizedRound> {
    const { round, opinions, agents, agentStates, task } = input;
    const timestamp = new Date().toISOString();

    // 所有终止与记录路径复用同一个收敛计算，避免一轮多次计算产生漂移。
    const surfaceConverged = this.checkConvergence(opinions);

    this.graphBuilder.updateFromOpinions(opinions, round);
    const graph = this.graphBuilder.getGraph();
    const influenceFactorsMap = this.computeInfluenceFactors(opinions, graph);

    // 保持旧路径语义：交叉质证造成的即时 state shift 已在进入 finalizeRound 前发生；
    // beliefChanges 记录本轮常规 belief update 的变化。
    const prevStates = new Map(agentStates);
    const stateCommit = this.commitRoundState(opinions, agentStates, agents, round);

    this.eventTracker.track({
      type: "belief_update",
      timestamp: new Date().toISOString(),
      roundNumber: round,
      payload: { stateCommit, agentStates: Object.fromEntries(agentStates) },
    });

    // 先形成当轮可观测 cognitive/thermo 状态，再基于该状态诊断。
    // 上一轮排队的 pending modifications 会在这里消费；本轮新干预留到下一轮。
    if (this.config.useCognitiveState) {
      this.updateCognitiveStatesFromRound(opinions, agents, round);
    }

    const governanceResult = await this.applyGovernance(
      round,
      opinions,
      agentStates,
      agents,
    );

    const interventions = this.prepareInterventionsForRecord(
      governanceResult?.hasIntervention ? governanceResult.interventions : [],
      round,
    );

    // 终止在诊断之后计算，但此处仍只是候选；记录提交完成前不得退出。
    const terminationDecision = this.evaluateTerminationCandidate(round);
    const stopDecision = this.resolveStopDecision({
      round,
      opinions,
      surfaceConverged,
      governanceResult,
      interventions,
      terminationDecision,
    });
    const acceptedConsensus = stopDecision.shouldStop
      && stopDecision.reason === "surface_convergence";

    const beliefChanges = this.buildBeliefChanges(prevStates, agentStates);
    const influenceEvents = this.buildInfluenceEvents(graph, round);

    const roundResult: RoundResult = {
      roundNumber: round,
      opinions: [...opinions],
      timestamp,
      surfaceConverged,
      acceptedConsensus,
      converged: acceptedConsensus,
      stopDecision,
    };

    const roundData: RoundData = {
      roundNumber: round,
      timestamp,
      opinions: [...opinions],
      stateCommit,
      beliefChanges,
      influenceEvents,
      governanceIssues: governanceResult?.issues ?? [],
      interventions,
      surfaceConverged,
      acceptedConsensus,
      converged: acceptedConsensus,
      effectMetrics: governanceResult?.effectMetrics,
      terminationDecision: terminationDecision ?? undefined,
      stopDecision,
    };

    const epistemicCommit = this.commitEpistemicRound(round, task);
    if (epistemicCommit) roundData.epistemicCommit = epistemicCommit;

    // 原子化提交：每轮只写一次 trace，避免有干预时重复 addRound。
    this.roundDataArray.push(roundData);
    this.traceBuilder.addRound(
      round,
      opinions,
      this.memoryManager.getAll(),
      graph,
      influenceFactorsMap,
      interventions,
    );

    if (interventions.length > 0) {
      this.eventTracker.track({
        type: "intervention",
        timestamp: new Date().toISOString(),
        roundNumber: round,
        payload: { interventions },
      });
    }

    this.eventTracker.track({
      type: "round_end",
      timestamp: new Date().toISOString(),
      roundNumber: round,
      payload: { surfaceConverged, acceptedConsensus, converged: acceptedConsensus, stopDecision },
    });

    return {
      roundResult,
      roundData,
      governanceResult,
      terminationDecision,
      stopDecision,
    };
  }

  /**
   * 为审计日志补齐干预时序。
   * hard cap 轮没有下一轮执行窗口，因此不能把建议记录成已应用。
   */
  private prepareInterventionsForRecord(
    interventions: Intervention[],
    round: number,
  ): Intervention[] {
    const hasNextRound = round < this.config.maxRounds;
    return interventions.map(intervention => {
      // 旧 belief-based 路径的 reduce_weight / introduce_diversity 会在
      // applyGovernance 内立即修改 graph/agent state；prompt、attention 和认知状态
      // modification 则只能影响下一轮。两者不能统一标成 queued。
      const deferredToNextRound = this.isNextRoundIntervention(intervention.type);

      if (!deferredToNextRound) {
        return {
          ...intervention,
          diagnosedAtRound: round,
          effectiveFromRound: intervention.applied ? round : undefined,
          applicationStatus: intervention.applied ? "applied" : undefined,
        };
      }

      return {
        ...intervention,
        diagnosedAtRound: round,
        effectiveFromRound: hasNextRound ? round + 1 : undefined,
        applied: hasNextRound ? intervention.applied : false,
        applicationStatus: hasNextRound
          ? "queued"
          : "not_applied_no_next_round",
      };
    });
  }

  private isNextRoundIntervention(type: Intervention["type"]): boolean {
    return type === "inject_evidence"
      || type === "rebalance_attention"
      || type === "shuffle_knowledge"
      || type === "devils_advocate"
      || type === "force_reflection"
      || type === "continue_discussion";
  }

  /**
   * 将表面收敛、热力学候选和治理否决合并为唯一 stopDecision。
   * hard cap 不可否决；其他提前终止在高风险问题或已排队干预存在时至少延后一轮。
   */
  private resolveStopDecision(input: {
    round: number;
    opinions: AgentOpinion[];
    surfaceConverged: boolean;
    governanceResult: RoundGovernanceResult | null;
    interventions: Intervention[];
    terminationDecision: TerminationDecision | null;
  }): RoundStopDecision {
    const {
      round,
      opinions,
      surfaceConverged,
      governanceResult,
      interventions,
      terminationDecision,
    } = input;

    const hardCap = round >= this.config.maxRounds
      || terminationDecision?.reason === "hard_cap";
    const candidates = {
      surfaceConverged,
      thermo: terminationDecision ?? undefined,
      hardCap,
    };

    if (hardCap) {
      return {
        shouldStop: true,
        reason: "hard_cap",
        candidates,
        vetoedByGovernance: false,
        explanation: terminationDecision?.message ?? `轮次达到硬上限 ${this.config.maxRounds}`,
      };
    }

    // <2 个有效响应既不是共识，也不足以支持热力学提前终止。
    if (opinions.length < 2) {
      return {
        shouldStop: false,
        reason: "continue",
        candidates: { ...candidates, surfaceConverged: false },
        vetoedByGovernance: false,
        explanation: "有效响应不足，继续至下一轮收集数据",
      };
    }

    const hasQueuedIntervention = interventions.some(
      intervention => intervention.applicationStatus === "queued" && intervention.applied,
    );
    const hasBlockingIssue = (governanceResult?.issues ?? []).some(issue =>
      issue.severity === "high" || this.isTerminationBlockingIssue(issue.type),
    );
    const surfaceStopEnabled = (this.config.terminationPolicy ?? "surface") === "surface";
    const hasEarlyStopCandidate = (surfaceStopEnabled && surfaceConverged)
      || Boolean(terminationDecision?.shouldTerminate);

    if (hasEarlyStopCandidate && (hasQueuedIntervention || hasBlockingIssue)) {
      return {
        shouldStop: false,
        reason: "continue",
        candidates,
        vetoedByGovernance: true,
        explanation: "治理诊断否决提前终止，保留下一轮干预效果观察窗口",
      };
    }

    if (terminationDecision?.shouldTerminate) {
      return {
        shouldStop: true,
        reason: "thermo_termination",
        candidates,
        vetoedByGovernance: false,
        explanation: terminationDecision.message,
      };
    }

    if (surfaceStopEnabled && surfaceConverged) {
      return {
        shouldStop: true,
        reason: "surface_convergence",
        candidates,
        vetoedByGovernance: false,
        explanation: "表面收敛已完成治理检查，未发现阻断性问题",
      };
    }

    return {
      shouldStop: false,
      reason: "continue",
      candidates,
      vetoedByGovernance: false,
      explanation: "未满足终止条件",
    };
  }

  private isTerminationBlockingIssue(issueType: string): boolean {
    const normalized = issueType.toLowerCase();
    return normalized.includes("premature_consensus")
      || normalized.includes("one_d_mask")
      || normalized.includes("1d_mask")
      || normalized.includes("evidence_silence");
  }

  /** Compute influence factor map for a round's opinions against the current graph. */
  private computeInfluenceFactors(
    opinions: AgentOpinion[],
    graph: InteractionGraph
  ): Map<string, InfluenceFactor[]> {
    const map = new Map<string, InfluenceFactor[]>();
    for (const opinion of opinions) {
      const factors: InfluenceFactor[] = graph.edges
        .filter(e => e.target === opinion.agentId)
        .map(e => ({
          type: "agent_influence" as const,
          sourceId: e.source,
          description: `受到 Agent ${e.source} 的影响，权重: ${e.weight.toFixed(2)}`,
          weight: e.weight,
        }));
      map.set(opinion.agentId, factors);
    }
    return map;
  }

  /** Compute per-agent belief changes from previous to current states. */
  private buildBeliefChanges(
    prevStates: Map<string, { belief: number; confidence: number }>,
    agentStates: Map<string, { belief: number; confidence: number }>
  ): Record<string, { old: number; new: number; reason: string }> {
    const changes: Record<string, { old: number; new: number; reason: string }> = {};
    agentStates.forEach((newState, agentId) => {
      const oldState = prevStates.get(agentId);
      if (oldState && oldState.belief !== newState.belief) {
        changes[agentId] = {
          old: oldState.belief, new: newState.belief, reason: "influence",
        };
      }
    });
    return changes;
  }

  /** Extract influence events from graph edges for a given round. */
  private buildInfluenceEvents(graph: InteractionGraph, round: number) {
    return graph.edges
      .filter(e => e.round === round)
      .map(e => ({
        sourceAgentId: e.source, targetAgentId: e.target,
        type: e.type, weight: e.weight, round: e.round,
        timestamp: new Date().toISOString(),
      }));
  }

  /**
   * 公有访问器：返回每轮 RoundData 的只读副本。
   *
   * 用途：实验 pipeline（Runner.ts / e9_minimal.ts）需提取每轮 opinions /
   * interventions / governanceIssues 用于指标计算，原本通过
   * `(engine as any).roundDataArray` 穿透 protected 访问控制，破坏封装。
   * 此方法提供正式的公有访问入口。
   *
   * 返回浅拷贝数组，防止外部直接修改内部状态。
   */
  getRoundDataArray(): RoundData[] {
    return structuredClone(this.roundDataArray);
  }

  getEpistemicEvents(): EpistemicEvent[] {
    return this.epistemicLedger.getEvents();
  }

  /** Phase 3: assemble the final DiscussionResult. */
  protected buildDiscussionResult(
    roundResults: RoundResult[],
    agentStates: Map<string, { belief: number; confidence: number }>
  ): DiscussionResult {
    const finalDecision = this.generateFinalDecision(roundResults);
    const finalBeliefs: Record<string, number> = {};
    agentStates.forEach((state, agentId) => { finalBeliefs[agentId] = state.belief; });

    return {
      roundResults,
      decisionTrace: this.traceBuilder.getTrace(),
      interactionGraph: this.graphBuilder.getGraph(),
      finalDecision,
      finalBeliefs,
      converged: roundResults[roundResults.length - 1]?.acceptedConsensus || false,
      acceptedConsensus: roundResults[roundResults.length - 1]?.acceptedConsensus || false,
      stopReason: roundResults[roundResults.length - 1]?.stopDecision?.reason ?? "unknown",
      totalRounds: roundResults.length,
    };
  }

  // ==========================================================================
  // Public analysis helpers
  // ==========================================================================

  /** Set agent-specific knowledge for information-layer intervention prompts. */
  setAgentKnowledge(knowledge: Map<string, string[]>): void {
    this.agentKnowledge = new Map(
      Array.from(knowledge, ([agentId, items]) => [agentId, [...items]])
    );
  }

  getDiscussionData(task: DiscussionTask, agentInfos: AgentInfo[]): DiscussionData {
    const trace = this.traceBuilder.getCompleteTrace();
    const graph = this.graphBuilder.getGraph();

    const rounds = [...this.roundDataArray];

    const finalDecision: DiscussionData["finalDecision"] = {
      decision: rounds.length > 0 
        ? this.generateFinalDecision(rounds.map(r => ({
          roundNumber: r.roundNumber,
          opinions: r.opinions,
          timestamp: r.timestamp,
          surfaceConverged: r.surfaceConverged,
          acceptedConsensus: r.acceptedConsensus,
          converged: r.converged,
          stopDecision: r.stopDecision,
        })))
        : "",
      belief: 0,
      confidence: 0,
      reasoning: "",
      agentContributions: {},
    };

    const agentBeliefs = agentInfos.map(info => {
      const trajectory = trace.beliefTrajectories[info.id];
      return trajectory ? trajectory[trajectory.length - 1]?.belief || 0 : 0;
    });
    const avgBelief = agentBeliefs.reduce((a, b) => a + b, 0) / agentBeliefs.length;
    finalDecision.belief = avgBelief;

    return {
      task,
      config: this.config,
      agents: agentInfos,
      rounds,
      interactionGraph: graph,
      decisionTrace: trace,
      finalDecision,
      metadata: {
        startTime: this.eventTracker.getEvents("round_start")[0]?.timestamp || new Date().toISOString(),
        endTime: this.eventTracker.getEvents("decision")[0]?.timestamp || new Date().toISOString(),
        totalRounds: rounds.length,
        converged: rounds.length > 0 && rounds[rounds.length - 1].acceptedConsensus,
      },
    };
  }

  /**
   * Build a minimal RuntimeContext for use in inference calls during
   * internal belief updates.  Previously these were constructed with
   * `{} as any` casts (ghost objects) that would crash if any code
   * path tried to read a field beyond `round.current`.
   *
   * NOTE: This context is INCOMPLETE — only `round.current` is guaranteed
   * to be read by inferenceLayer.infer(). All other fields are typed stubs
   * to satisfy RuntimeContext's shape; accessing them yields empty collections
   * or null. Do NOT use this context for evaluation/governance/trace.
   */
  private makeInferenceContext(roundNumber: number): RuntimeContext {
    const emptyCollectiveState: CollectiveDecisionState = {
      agentStates: new Map(),
      interactionGraph: { nodes: [], edges: [] } as InteractionGraph,
      decisionTrace: {
        entries: [],
        enhancedEntries: [],
        consensusEvents: [],
        influenceGraph: [],
        beliefTrajectories: {},
      },
      beliefTrajectories: {} as Record<string, { round: number; belief: number; confidence: number }[]>,
    };

    return {
      // experiment 是桩对象——inferenceLayer.infer() 只读 round.current，不读 experiment.config。
      // 用 as unknown 断言明确表达：这是不完整桩，不是真实 ExperimentConfig。
      experiment: { id: "", taskId: "", config: {} as unknown as ExperimentConfig, status: "created", createdAt: "" },
      // session.runtimeContext has circular reference to RuntimeContext;
      // undefined is safe because inferenceLayer never reads session.
      session: { id: "", experimentId: "", runtimeContext: undefined as unknown as RuntimeContext, status: "initialized", startTime: "" },
      task: { id: "", description: "", type: "", content: "", status: "submitted", createdAt: "", metadata: {} },
      round: { current: roundNumber, max: this.config.maxRounds, startedAt: new Date().toISOString() },
      state: emptyCollectiveState,
      metrics: { evaluation: null, previousEvaluation: null, delta: {}, history: [] },
      governance: { issues: [], interventions: [], appliedInterventions: [], status: "clean" },
      agents: { agents: [], states: new Map(), getAgent: () => undefined, getAllStates: () => new Map() },
      config: {
        termination: { conditions: [], strategy: "any" },
        evaluation: {} as EvaluationConfig,
        governance: {} as GovernanceConfig,
      },
      timeline: [],
      // artifact 是深层嵌套类型（30+ 字段，6 种 Snapshot），但 inferenceLayer
      // 只读 round.current，构造完整 artifact 是过度工程。用最小合法对象 + 类型逃逸。
      artifact: {
        experimentId: "",
        task: { id: "", description: "", type: "", content: "", status: "submitted", createdAt: "", metadata: {} },
        config: { maxRounds: 0, agentCount: 0, agentTypes: [], beliefUpdateStrategy: "", influenceStrategy: "", memoryStrategy: "", terminationConditions: [], evaluationConfig: {} as EvaluationConfig, governanceConfig: {} as GovernanceConfig },
        snapshots: { rounds: [], states: [], evaluations: [], governances: [], decisions: [] },
        timeline: [],
        metadata: { startTime: "", endTime: "", totalRounds: 0, converged: false, elapsedMs: 0 },
        terminationReason: "",
      },
    };
  }

  getEventTracker(): EventTracker {
    return this.eventTracker;
  }

  async runRoundWithArtifacts(
    agents: DiscussionAgent[],
    task: DiscussionTask,
    roundNumber: number,
    agentStates: Map<string, { belief: number; confidence: number }>
  ): Promise<{
    opinions: AgentOpinion[];
    stateDeltas: StateDelta[];
    graph: InteractionGraph;
    converged: boolean;
  }> {
    if (task.epistemic) {
      throw new Error("runRoundWithArtifacts does not own a finalizeRound boundary for EpistemicTaskContract; use run()");
    }
    const opinions = await this.runRound(agents, task, roundNumber, agentStates);
    const prevStates = new Map(agentStates);

    this.graphBuilder.updateFromOpinions(opinions, roundNumber);
    const graph = this.graphBuilder.getGraph();

    const observations = opinions.map(o => ({ parsedOpinion: o }));
    const agentStateMap = new Map<string, any>();
    prevStates.forEach((value, key) => {
      agentStateMap.set(key, { agentId: key, belief: value.belief, confidence: value.confidence, opinion: "" });
    });
    
    const deltas = this.inferenceLayer.infer(observations, {
      agentStates: agentStateMap,
      interactionGraph: graph,
      beliefTrajectories: {},
      decisionTrace: {
        entries: [],
        enhancedEntries: [],
        consensusEvents: [],
        influenceGraph: [],
        beliefTrajectories: {},
      },
    }, this.makeInferenceContext(roundNumber));

    const stateDeltas: StateDelta[] = deltas.map(delta => {
      const current = agentStates.get(delta.agentId);
      const previous = prevStates.get(delta.agentId);
      return {
        agentId: delta.agentId,
        beliefChange: current ? current.belief - (previous?.belief || current.belief) : 0,
        confidenceChange: current ? current.confidence - (previous?.confidence || current.confidence) : 0,
        reason: delta.reason,
      };
    });

    const converged = this.checkConvergence(opinions);

    return {
      opinions,
      stateDeltas,
      graph,
      converged,
    };
  }

  protected initializeEpistemicTask(task: DiscussionTask): void {
    if (!task.epistemic) return;
    if ((this.config.governanceMode ?? "full") !== "none") {
      throw new Error("P1 EpistemicTaskContract currently requires governanceMode=none; accountable governance is a separate mechanism phase");
    }
    this.epistemicRunActive = true;
    if (this.config.enableCrossExamination) {
      throw new Error("EpistemicTaskContract is incompatible with legacy cross-examination until challenge exposures become auditable");
    }
    if (task.epistemic.reportingMode !== "explicit_probability") {
      throw new Error(`Unsupported epistemic reporting mode: ${task.epistemic.reportingMode}`);
    }
    if (task.epistemic.claims.length === 0) {
      throw new Error("Epistemic task contract must register at least one claim");
    }
    for (const claim of task.epistemic.claims) this.epistemicLedger.registerClaim(claim);
  }

  /** Select exactly the memory records that the prompt builder is allowed to render. */
  protected selectPromptMemory(
    memory: DiscussionMemoryEntry[],
    agentId: string,
  ): DiscussionMemoryEntry[] {
    const ownEntries = memory.filter(entry => entry.agentId === agentId).slice(-6);
    const mentionsMe = memory.filter(entry =>
      entry.agentId !== agentId && entry.referencedAgents?.includes(agentId)
    ).slice(-4);
    return [...ownEntries, ...mentionsMe].sort((a, b) => a.roundNumber - b.roundNumber);
  }

  private buildEpistemicPrompt(task: DiscussionTask): string {
    if (!task.epistemic) return "";
    const claims = task.epistemic.claims.map(claim => ({
      claimId: claim.id,
      proposition: claim.proposition,
      domain: claim.domain,
    }));
    return `\n\nEPISTEMIC REPORTING CONTRACT
Report a probability for each registered claim you assess. Probability is a number in [0,1], not the legacy belief [-1,1] or confidence [0,100]. Do not invent claim IDs.
Registered claims: ${JSON.stringify(claims)}
Add this top-level field to your JSON response:
"claims": [
  {
    "claimId": "registered claim ID",
    "probability": 0.0,
    "evidence": [
      {"content": "specific evidence", "relation": "supports"},
      {"content": "specific counterevidence", "relation": "attacks"}
    ]
  }
]`;
  }

  private getEpistemicBatch(round: number): EpistemicRoundBatch {
    let batch = this.pendingEpistemicRounds.get(round);
    if (!batch) {
      batch = { evidence: [], reports: [], exposures: [] };
      this.pendingEpistemicRounds.set(round, batch);
    }
    return batch;
  }

  private recordPromptExposures(
    targetAgentId: string,
    round: number,
    memory: DiscussionMemoryEntry[],
    currentRoundOpinions: Array<{ epistemicReportIds?: string[] }>,
  ): string[] {
    const visible: Array<{ reportId: string; channel: "memory" | "current_round" }> = [];
    for (const entry of memory) {
      for (const reportId of entry.epistemicReportIds ?? []) visible.push({ reportId, channel: "memory" });
    }
    for (const opinion of currentRoundOpinions) {
      for (const reportId of opinion.epistemicReportIds ?? []) {
        visible.push({ reportId, channel: "current_round" });
      }
    }

    const seen = new Set<string>();
    const batch = this.getEpistemicBatch(round);
    for (const item of visible) {
      if (seen.has(item.reportId)) continue;
      const claimId = this.epistemicReportClaims.get(item.reportId)
        ?? this.epistemicLedger.getReport(item.reportId)?.claimId;
      if (!claimId) continue;
      seen.add(item.reportId);
      batch.exposures.push({
        id: `exposure:${round}:${++this.epistemicSequence}`,
        claimId,
        sourceReportId: item.reportId,
        targetAgentId,
        round,
        channel: item.channel,
        exposedAt: new Date().toISOString(),
      });
    }
    return [...seen];
  }

  private prepareEpistemicOpinion(
    opinion: AgentOpinion,
    task: DiscussionTask,
    round: number,
    observedReportIds: string[],
    createdAt: string,
  ): void {
    const contract = task.epistemic;
    if (!contract) {
      opinion.claimReports = undefined;
      opinion.epistemicReportIds = undefined;
      opinion.claimParseStatus = "not_applicable";
      return;
    }

    const registeredClaims = new Set(contract.claims.map(claim => claim.id));
    const submissions = opinion.claimReports ?? [];
    const submittedClaims = new Set(submissions.map(report => report.claimId));
    const invalidClaim = submissions.some(report => !registeredClaims.has(report.claimId));
    const missingRequired = contract.requireAllClaims === true
      && contract.claims.some(claim => !submittedClaims.has(claim.id));
    if (opinion.claimParseStatus !== "valid" || invalidClaim || missingRequired) {
      opinion.claimReports = [];
      opinion.epistemicReportIds = [];
      opinion.claimParseStatus = invalidClaim ? "invalid" : "incomplete";
      return;
    }

    const batch = this.getEpistemicBatch(round);
    const reportIds: string[] = [];
    for (const submission of submissions) {
      const reportId = `report:${task.id}:${round}:${opinion.agentId}:${++this.epistemicSequence}`;
      const evidenceReferences: BeliefReport["evidence"] = [];
      submission.evidence.forEach((submittedEvidence, index) => {
        const evidenceId = `${reportId}:evidence:${index + 1}`;
        batch.evidence.push({
          id: evidenceId,
          content: submittedEvidence.content,
          createdAt,
          provenance: {
            sourceKind: "agent",
            sourceId: opinion.agentId,
            contentHash: `sha256:${createHash("sha256").update(submittedEvidence.content).digest("hex")}`,
          },
        });
        evidenceReferences.push({ evidenceId, relation: submittedEvidence.relation });
      });

      const agentClaimKey = `${opinion.agentId}\u0000${submission.claimId}`;
      const supersedesReportId = this.latestEpistemicReport.get(agentClaimKey);
      const observedForClaim = observedReportIds.filter(reportIdValue =>
        this.epistemicReportClaims.get(reportIdValue) === submission.claimId
          || this.epistemicLedger.getReport(reportIdValue)?.claimId === submission.claimId
      );
      const report: BeliefReport = {
        id: reportId,
        claimId: submission.claimId,
        agentId: opinion.agentId,
        round,
        probability: submission.probability,
        evidence: evidenceReferences,
        // Capital is intentionally inactive in P1; P2 must lock a real balance.
        stake: 0,
        createdAt,
        supersedesReportId,
        observedReportIds: observedForClaim,
      };
      batch.reports.push(report);
      reportIds.push(reportId);
      this.latestEpistemicReport.set(agentClaimKey, reportId);
      this.epistemicReportClaims.set(reportId, submission.claimId);
    }
    opinion.epistemicReportIds = reportIds;
  }

  private commitEpistemicRound(
    round: number,
    task: DiscussionTask,
  ): RoundData["epistemicCommit"] | undefined {
    if (!task.epistemic) return undefined;
    const batch = this.pendingEpistemicRounds.get(round)
      ?? { evidence: [], reports: [], exposures: [] };
    this.epistemicLedger.commitRound(batch);
    this.pendingEpistemicRounds.delete(round);
    return {
      evidenceCount: batch.evidence.length,
      reportCount: batch.reports.length,
      exposureCount: batch.exposures.length,
    };
  }

  private async runRound(
    agents: DiscussionAgent[],
    task: DiscussionTask,
    roundNumber: number,
    agentStates: Map<string, { belief: number; confidence: number }>
  ): Promise<AgentOpinion[]> {
    const observations = await this.observeAgents(agents as ObserverAgent[], task, roundNumber);
    
    for (const observation of observations) {
      this.memoryManager.store({
        roundNumber,
        agentId: observation.agentId,
        reasoning: observation.parsedOpinion.reasoning,
        evidence: observation.parsedOpinion.evidence,
        belief: observation.parsedOpinion.belief,
        confidence: observation.parsedOpinion.confidence,
        referencedAgents: observation.parsedOpinion.referencedAgents,
        itemBeliefs: observation.parsedOpinion.itemBeliefs,
        claimReports: observation.parsedOpinion.claimReports,
        epistemicReportIds: observation.parsedOpinion.epistemicReportIds,
        timestamp: observation.timestamp,
      });
    }

    return observations.map(o => o.parsedOpinion);
  }

  /**
   * Observe agents by sending prompts and parsing their responses.
   * Uses the shared opinionParser (DefaultOpinionParser by default).
   */
  protected async observeAgents(
    agents: ObserverAgent[],
    task: DiscussionTask,
    roundNumber: number
  ): Promise<RawObservation[]> {
    const allMemory = this.memoryManager.getAll();
    const observations: RawObservation[] = [];
    // 本轮已发言的观点，按发言顺序累积，后发言的 agent 能看到
    const currentRoundOpinions: Array<{ agentId: string; reasoning: string; belief: number; confidence: number; claimReports?: AgentOpinion["claimReports"]; epistemicReportIds?: string[] }> = [];

    for (const agent of agents) {
      try {
        const state = agent.getState();
        const personalMemory = this.selectPromptMemory(allMemory, agent.id);
        const visibleCurrentRound = currentRoundOpinions.slice(-8);
        const prompt = this.buildPrompt(
          { name: agent.name, role: agent.role, id: agent.id },
          typeof task.content === "string" ? task.content : JSON.stringify(task.content),
          personalMemory, roundNumber, state, visibleCurrentRound
        ) + this.buildEpistemicPrompt(task);
        const response = await agent.sendMessage(prompt);
        // A completed sendMessage call is the observation boundary. Failed
        // calls are not recorded as delivered exposures.
        const observedReportIds = task.epistemic
          ? this.recordPromptExposures(agent.id, roundNumber, personalMemory, visibleCurrentRound)
          : [];
        // Use the shared parser instead of a private duplicate
        const rawParsedOpinion = this.opinionParser.parseOpinion(
          response,
          agent.id,
          state.belief,
          state.confidence,
          roundNumber
        );
        const parsedOpinion = canonicalizeOpinionOptions(
          rawParsedOpinion,
          task.canonicalOptions,
          task.optionAliases,
        );
        const observationTimestamp = new Date().toISOString();
        this.prepareEpistemicOpinion(
          parsedOpinion,
          task,
          roundNumber,
          observedReportIds,
          observationTimestamp,
        );

        const observation: RawObservation = {
          agentId: agent.id,
          roundNumber,
          timestamp: observationTimestamp,
          rawResponse: response,
          parsedOpinion,
        };
        observations.push(observation);
        // 累积到本轮已发言列表，供后续 agent 参考
        currentRoundOpinions.push({
          agentId: agent.id,
          reasoning: parsedOpinion.reasoning,
          belief: parsedOpinion.belief,
          confidence: parsedOpinion.confidence,
          claimReports: parsedOpinion.claimReports,
          epistemicReportIds: parsedOpinion.epistemicReportIds,
        });
        // EvidencePool hook：子类（NativeCognitiveEngine）可在此把本 agent 的
        // 结构化证据喂入共享池，供后续发言者参考（顺序发言机制）。
        this.onOpinionObserved(parsedOpinion, roundNumber);
      } catch (err) {
        // API 失败：跳过该 agent，不参与本轮讨论
        console.warn(`Agent ${agent.id} skipped in round ${roundNumber}: ${err instanceof Error ? err.message : err}`);
      }
    }

    return observations;
  }

  /** Hook：agent 发言被解析后调用（供 EvidencePool 等子类扩展）。默认 no-op。 */
  protected onOpinionObserved(_opinion: AgentOpinion, _roundNumber: number): void {}

  protected formatClaimReportSummary(reports?: AgentOpinion["claimReports"]): string {
    if (!reports || reports.length === 0) return "";
    return ` [claims: ${reports.map(report =>
      `${report.claimId}=P(${report.probability.toFixed(4)})`
    ).join(", ")}]`;
  }

  protected buildPrompt(
    agent: { name: string; role: string; id: string },
    task: string,
    memory: DiscussionMemoryEntry[],
    roundNumber: number,
    state: { belief: number; confidence: number },
    currentRoundOpinions: Array<{ agentId: string; reasoning: string; belief: number; confidence: number; claimReports?: AgentOpinion["claimReports"]; epistemicReportIds?: string[] }> = []
  ): string {
    // ── 历史窗口剪枝：防止全局历史无限制膨胀进 prompt ────────────
    // memory 按时间顺序存储（InMemoryStrategy 追加），slice(-N) 取最近 N 条。
    // 只保留：自己的最近 MAX_OWN_HISTORY 条 + 引用我的最近 MAX_REPLIES 条。
    const MAX_OWN_HISTORY = 6;
    const MAX_REPLIES = 4;
    let memoryContext = "";
    if (memory.length > 0) {
      const ownEntries = memory.filter(e => e.agentId === agent.id).slice(-MAX_OWN_HISTORY);
      const repliedToMe = memory.filter(e => e.agentId !== agent.id).slice(-MAX_REPLIES);
      memoryContext = "\n\n你的讨论历史:\n";
      if (ownEntries.length > 0) {
        memoryContext += "你之前的发言:\n";
        for (const entry of ownEntries) {
          memoryContext += `- 第${entry.roundNumber}轮: ${entry.reasoning} (信念: ${entry.belief.toFixed(2)})${this.formatClaimReportSummary(entry.claimReports)}\n`;
        }
      }
      if (repliedToMe.length > 0) {
        memoryContext += "对你的回应:\n";
        for (const entry of repliedToMe) {
          memoryContext += `- 第${entry.roundNumber}轮 ${entry.agentId}: ${entry.reasoning} (信念: ${entry.belief.toFixed(2)})${this.formatClaimReportSummary(entry.claimReports)}\n`;
        }
      }
    }

    // ── Inject governance prompts for this agent ───────────────────────
    let governanceContext = "";
    const myPrompts = this.governancePrompts.get(agent.id);
    const globalPrompts = this.governancePrompts.get("*"); // prompts for all agents
    const relevantPrompts = [...(globalPrompts || []), ...(myPrompts || [])];
    if (relevantPrompts.length > 0) {
      governanceContext = "\n" + relevantPrompts.join("\n");
    }

    // ── 本轮已发言的观点（顺序发言机制）───────────────────────────────
    let currentRoundContext = "";
    // 本轮已发言观点做窗口限制（最多 8 条），防异步引擎单周期发言人过多时 prompt 膨胀
    const MAX_CURRENT_ROUND = 8;
    if (currentRoundOpinions.length > 0) {
      currentRoundContext = "\n\n本轮其他 agent 已发表的观点:\n";
      for (const op of currentRoundOpinions.slice(-MAX_CURRENT_ROUND)) {
        currentRoundContext += `- ${op.agentId}: ${op.reasoning} (信念: ${op.belief.toFixed(2)}, 置信度: ${op.confidence.toFixed(0)}%)${this.formatClaimReportSummary(op.claimReports)}\n`;
      }
      currentRoundContext += "你可以参考或反驳上述观点。\n";
    }

    const systemStateContext = this.epistemicRunActive
      ? "Explicit epistemic mode is active. No system-derived belief or cognitive-state estimate is supplied."
      : `【系统参考（仅背景，非强制）】系统基于讨论历史计算的群体倾向：
- 信念强度：${state.belief.toFixed(2)}（范围 -1 到 1）
- 置信度：${state.confidence.toFixed(0)}%（范围 0-100）

以上为外部计算值（DeGroot 更新），仅作背景参考，不代表你的实际判断。`;

    return `You are ${agent.name}, a ${agent.role}.

Task: ${task}

Round: ${roundNumber}/${this.config.maxRounds}

${systemStateContext}

【你的自主判断】请基于本轮讨论的事实与逻辑独立评估你的立场——
不要简单复述上述系统参考值，你的信念应反映你对证据的真实判断。

${memoryContext}${currentRoundContext}${governanceContext}

Analyze the task and the previous discussion (if any). Provide your opinion with reasoning, evidence, belief, confidence, and what you think should happen next.

Respond in JSON format:
{
  "reasoning": "Your detailed analysis...",
  "evidence": ["evidence1", "evidence2"],
  "belief": -1 to 1 (negative = against, positive = for),
  "confidence": 0 to 100,
  "nextOpinion": "What you want to discuss next",
  "referencedAgents": ["agent_1", "agent_2"],
  "itemBeliefs": [
    {"item": "Company A", "rank": 1, "belief": 0.8, "confidence": 95},
    {"item": "Company B", "rank": 2, "belief": 0.2, "confidence": 70}
  ]
}
itemBeliefs: rank (1=best), belief (-1=oppose, 1=support) for each option.`;
  }

  protected checkConvergence(opinions: AgentOpinion[]): boolean {
    // 审计 P0.3 修复（2026-08-06）：<2 个响应不是收敛，是数据不足。
    // 修复前 <2 直接返回 true → 全失败（0 响应）被标记为 converged，
    // generateFinalDecision 再对空 opinions 做 0/0 平均产出 NaN。
    // 0 响应 = 全 agent 失败；1 响应 = 无法达成共识；两者都应继续（受 maxRounds 约束）。
    if (opinions.length < 2) return false;

    // V2: per-item convergence — all items must be converged
    if (opinions[0]?.itemBeliefs && opinions[0].itemBeliefs.length > 0) {
      const items = opinions[0].itemBeliefs.map(ib => ib.item);
      for (const item of items) {
        const itemBeliefs = opinions
          .map(o => o.itemBeliefs?.find(ib => ib.item === item)?.belief)
          .filter((b): b is number => typeof b === "number");
        if (itemBeliefs.length < 2) continue;
        const mean = itemBeliefs.reduce((s, b) => s + b, 0) / itemBeliefs.length;
        const std = Math.sqrt(itemBeliefs.reduce((s, b) => s + Math.pow(b - mean, 2), 0) / itemBeliefs.length);
        if (std > this.config.convergenceThreshold) return false;
      }
      return true;
    }

    // V1 fallback: overall belief convergence
    const beliefs = opinions.map(o => o.belief);
    const meanBelief = beliefs.reduce((sum, b) => sum + b, 0) / beliefs.length;
    const beliefStd = Math.sqrt(beliefs.reduce((sum, b) => sum + Math.pow(b - meanBelief, 2), 0) / beliefs.length);

    return beliefStd < this.config.convergenceThreshold;
  }

  /**
   * 计算热力学终止候选，不直接控制循环。
   * 基类没有热力学终止能力；NativeCognitiveEngine 覆写后返回结构化候选，
   * 最终是否退出由 finalizeRound 在完整提交审计记录后统一仲裁。
   */
  protected evaluateTerminationCandidate(_round: number): TerminationDecision | null {
    return null;
  }

  /**
   * **@deprecated for v6 path**（v0.4.3 标注）
   * 此方法实现**成对扰动 DeGroot**（通过 `InferenceLayer`），更新 scalar `agentStates.belief`。
   * v6 的 `NativeCognitiveEngine` 走 `native_cognitive` 模式，**不调用此方法**——
   * Utility 由 LLM 原生输出，认知状态由 `MeasurementLayer.updateCognitiveStates` 维护。
   * 保留用于向后兼容旧 `belief` 模式实验。
   *
   * 理论说明：严格 FJ 是解释性镜头，见 THEORY.md §0。
   */
  protected updateBeliefs(
    opinions: AgentOpinion[],
    agentStates: Map<string, { belief: number; confidence: number }>,
    roundNumber: number
  ): void {
    const graph = this.graphBuilder.getGraph();
    
    this.influenceManager.applyAllInfluences(opinions, graph, roundNumber);

    const observations = opinions.map(o => ({ parsedOpinion: o }));
    
    const agentStateMap = new Map<string, any>();
    agentStates.forEach((value, key) => {
      agentStateMap.set(key, { agentId: key, belief: value.belief, confidence: value.confidence, opinion: "" });
    });
    
    const deltas = this.inferenceLayer.infer(observations, {
      agentStates: agentStateMap,
      interactionGraph: graph,
      beliefTrajectories: {},
      decisionTrace: {
        entries: [],
        enhancedEntries: [],
        consensusEvents: [],
        influenceGraph: [],
        beliefTrajectories: {},
      },
    }, this.makeInferenceContext(roundNumber));

    for (const delta of deltas) {
      const current = agentStates.get(delta.agentId);
      if (current) {
        agentStates.set(delta.agentId, {
          belief: Math.max(BELIEF_MIN, Math.min(BELIEF_MAX, current.belief + delta.beliefChange)),
          confidence: Math.max(CONFIDENCE_MIN, Math.min(CONFIDENCE_MAX, current.confidence + delta.confidenceChange)),
        });
      }
    }
  }

  updateAgentStates(
    agents: DiscussionAgent[],
    agentStates: Map<string, { belief: number; confidence: number }>
  ): void {
    for (const agent of agents) {
      const state = agentStates.get(agent.id);
      if (state) {
        agent.setState(state);
      }
    }
  }

  // ==========================================================================
  // v3.0 Cognitive State Update
  // ==========================================================================

  /**
   * Update cognitive states for all agents from the current round's opinions.
   *
   * Phase 2 implementation: extracts evidence/utility from LLM output,
   * computes new cognitive state (Evidence → Confidence → Inertia → Utility),
   * and stores it. Does NOT modify agentStates — the old belief/confidence
   * path runs independently.
   */
  protected updateCognitiveStatesFromRound(
    opinions: AgentOpinion[],
    agents: DiscussionAgent[],
    round: number,
  ): void {
    // Build a map of expressed utilities from itemBeliefs
    const expressedUtilities = new Map<string, ReturnType<typeof utilityFromItemBeliefs>>();
    for (const op of opinions) {
      if (op.itemBeliefs && op.itemBeliefs.length > 0) {
        expressedUtilities.set(op.agentId, utilityFromItemBeliefs(op.itemBeliefs));
      }
    }

    // Detect which agents were refuted this round
    // Simplified: an agent is "refuted" if another agent disagreed with their top choice
    const refutedAgents = new Set<string>();
    for (const op of opinions) {
      if (!op.itemBeliefs || op.itemBeliefs.length === 0) continue;
      const opTop = op.itemBeliefs.reduce((a, b) => a.rank < b.rank ? a : b).item;
      for (const other of opinions) {
        if (other.agentId === op.agentId) continue;
        if (!other.itemBeliefs || other.itemBeliefs.length === 0) continue;
        const otherTop = other.itemBeliefs.reduce((a, b) => a.rank < b.rank ? a : b).item;
        if (otherTop !== opTop && other.referencedAgents?.includes(op.agentId)) {
          refutedAgents.add(op.agentId);
        }
      }
    }

    for (const agent of agents) {
      const agentId = agent.id;
      const opinion = opinions.find(o => o.agentId === agentId);
      const currentState = this.cognitiveStates.get(agentId);

      if (!currentState) {
        // Initialize if missing (shouldn't happen, but safety)
        const state = agent.getState();
        this.cognitiveStates.set(agentId, beliefToCognitiveState(
          agentId, agent.name, agent.role, state.belief, state.confidence,
        ));
        continue;
      }

      const spokeThisRound = !!opinion;
      const wasRefuted = refutedAgents.has(agentId);

      // Build other agent utilities (from itemBeliefs)
      const otherAgentUtilities: Array<{ agentId: string; utility: ReturnType<typeof utilityFromItemBeliefs> }> = [];
      for (const [id, util] of expressedUtilities) {
        if (id !== agentId) {
          otherAgentUtilities.push({ agentId: id, utility: util });
        }
      }

      const input: CognitiveStateUpdateInput = {
        agentId,
        agentName: agent.name,
        agentRole: agent.role,
        currentState,
        evidenceStrings: opinion?.evidence || [],
        itemBeliefs: opinion?.itemBeliefs || [],
        spokeThisRound,
        wasRefuted,
        otherAgentUtilities,
        roundNumber: round,
      };

      const newState = updateCognitiveState(input);
      this.cognitiveStates.set(agentId, newState);
    }
  }

  /**
   * Get all cognitive states (v3.0). Returns empty map if useCognitiveState is false.
   */
  getCognitiveStates(): Map<string, AgentCognitiveState> {
    return structuredClone(this.cognitiveStates);
  }

  private generateFinalDecision(roundResults: RoundResult[]): string {
    if (roundResults.length === 0) return "No decision reached";

    const lastRound = roundResults[roundResults.length - 1];
    // 审计 P0.3 修复（2026-08-06）：空 opinions 时 0/0 = NaN，旧实现输出 "NaN - neutral"，
    // 把失败伪装成中性共识。显式标注失败。
    if (lastRound.opinions.length === 0) {
      return `Final decision after ${roundResults.length} rounds (overall belief: no agent responses — FAILED, not a consensus)`;
    }

    const reasonings = lastRound.opinions
      .filter(o => o.reasoning.length > 0)
      .map(o => `${o.agentId}: ${o.reasoning}`);

    const avgBelief = lastRound.opinions.reduce((sum, o) => sum + o.belief, 0) / lastRound.opinions.length;
    const beliefLabel = avgBelief > DISCUSSION_DECISION_POSITIVE_THRESHOLD ? "positive" : avgBelief < DISCUSSION_DECISION_NEGATIVE_THRESHOLD ? "negative" : "neutral";

    return `Final decision after ${roundResults.length} rounds (overall belief: ${avgBelief.toFixed(2)} - ${beliefLabel}):\n\n${reasonings.join("\n\n")}`;
  }

  getMemory(): DiscussionMemoryEntry[] {
    return this.memoryManager.getAll();
  }

  getInteractionGraph(): InteractionGraph {
    return this.graphBuilder.getGraph();
  }

  getDecisionTrace(): DecisionTraceEntry[] {
    return this.traceBuilder.getTrace();
  }

  /** Get dropout observations — used to build the sensitivity graph */
  getDropoutObservations() {
    return structuredClone(this.dropoutObservations);
  }

  summarizeTrace() {
    return this.traceBuilder.summarize();
  }

  protected applyGovernance(
    round: number,
    opinions: AgentOpinion[],
    agentStates: Map<string, { belief: number; confidence: number }>,
    agents: DiscussionAgent[],
    /** 异步引擎覆写：currentRound / maxRounds。同步引擎无需传。 */
    governanceConfigOverride?: { currentRound: number; maxRounds: number }
  ): { hasIntervention: boolean; interventions: Intervention[]; effectMetrics?: Record<string, number>; issues: GovernanceIssue[] } | Promise<{ hasIntervention: boolean; interventions: Intervention[]; effectMetrics?: Record<string, number>; issues: GovernanceIssue[] }> | null {
    const mode = this.config.governanceMode || "full";
    const effectiveMaxRounds = governanceConfigOverride?.maxRounds ?? this.config.maxRounds;
    const effectiveCurrentRound = governanceConfigOverride?.currentRound ?? round;

    // "none" mode: skip everything
    if (mode === "none") return null;

    // If an external GovernanceRuntime is provided (embeddable SDK mode),
    // delegate detection and intervention generation to it. DiscussionEngine
    // still handles applying intervention effects to its own internal state.
    if (this.externalRuntime) {
      return this.applyGovernanceViaRuntime(round, opinions, agentStates, agents, mode);
    }

    // -- Native governance path (uses internal GovernanceEngine) --
    // This path is preserved for backward compatibility and for when no
    // external runtime is injected (existing tests, experiments).

    const agentBeliefs: AgentBelief[] = opinions.map(o => ({
      agentId: o.agentId,
      belief: o.belief,
      confidence: o.confidence,
    }));

    const messages: MessageInfo[] = opinions.map(o => ({
      agentId: o.agentId,
      // H-Fix: 拼接 reasoning + evidence，与 asyncEngine.ts:526 一致
      // 避免关键词只出现在 evidence 中时 echo chamber/authority bias 检测失效
      content: `${o.reasoning} ${(o.evidence || []).join(" ")}`,
      timestamp: new Date().toISOString(),
      referencedAgents: o.referencedAgents,
      // A3 (MAST): 保留 evidence/itemBeliefs/reasoning 字段供 FM-2.4/2.5/2.6 检测器使用
      // 之前转换丢失这些字段，导致新检测器在 native governance 路径下永远 notDetected
      evidence: o.evidence,
      itemBeliefs: o.itemBeliefs,
      reasoning: o.reasoning,
    }));

    const agentIds = opinions.map(o => o.agentId);
    const graph = this.graphBuilder.getGraph();
    const interactionGraph = {
      nodes: graph.nodes.map(n => n.agentId),
      edges: graph.edges.map(e => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        type: e.type,
      })),
    };

    // -- "random-intervene": diagnose (for measurement) then apply random interventions
    if (mode === "random-intervene") {
      const result = this.governanceEngine.diagnose(agentBeliefs, messages, agentIds, {
        enableEchoChamberDetection: true,
        enableAuthorityBiasDetection: true,
        enablePolarizationDetection: true,
        enablePrematureConsensusDetection: true,
        interventionLevel: "medium",
        currentRound: effectiveCurrentRound,
        maxRounds: effectiveMaxRounds,
      });

      // Build issues from diagnosis (for recording)
      const issues = this.buildIssuesFromResult(result, this.config.governanceConfig);

      // Generate random interventions regardless of detection
      const randomInterventions = this.generateRandomInterventions(
        agentBeliefs, agents, effectiveCurrentRound, effectiveMaxRounds
      );

      if (randomInterventions.length === 0) {
        return { hasIntervention: false, interventions: [], issues };
      }

      const state = { agentBeliefs, messages, agentIds, interactionGraph };
      // 深拷贝 beforeState，避免与 afterState 共享 agentBeliefs 数组引用
      const beforeState = {
        agentBeliefs: agentBeliefs.map(b => ({ ...b })),
        messages,
        agentIds,
        interactionGraph,
      };
      const results = this.governanceEngine.applyInterventions(randomInterventions, state, this.agentKnowledge);

      // 清空上一轮遗留的治理 prompt，防止跨轮累积污染（与 full 模式一致）
      this.governancePrompts.clear();

      // Apply intervention effects to graph and agent states
      this.applyInterventionEffects(results, graph, agentStates, agents);

      // 修复：传入不同的 before/after state，而非同一引用
      const afterState = {
        agentBeliefs: state.agentBeliefs.map(b => ({ ...b })),
        messages,
        agentIds,
        interactionGraph,
      };
      const effectMetrics = this.governanceEngine.evaluateEffects(
        beforeState, afterState, randomInterventions
      );

      return {
        hasIntervention: true,
        interventions: randomInterventions,
        effectMetrics,
        issues,
      };
    }

    // -- "detect-only" and "full": normal diagnosis flow
    const { result, interventions } = this.governanceEngine.diagnoseAndIntervene(
      agentBeliefs,
      messages,
      agentIds,
      interactionGraph,
      { currentRound: effectiveCurrentRound, maxRounds: effectiveMaxRounds }
    );

    // "detect-only": skip intervention application, only record issues
    if (mode === "detect-only") {
      const issues = this.buildIssuesFromResult(result, this.config.governanceConfig);
      return {
        hasIntervention: false,
        interventions: [],
        issues,
      };
    }

    // "full": apply interventions
    if (interventions.length === 0) {
      return null;
    }

    const state = { agentBeliefs, messages, agentIds, interactionGraph };
    // 深拷贝 beforeState，避免 applyInterventions 修改 state.agentBeliefs 后 before 也跟着变
    const beforeState = {
      agentBeliefs: agentBeliefs.map(b => ({ ...b })),
      messages,
      agentIds,
      interactionGraph,
    };
    const results = this.governanceEngine.applyInterventions(interventions, state, this.agentKnowledge);

    // ── Collect information-layer prompts from intervention results ────
    this.governancePrompts.clear();
    for (const r of results) {
      if (r.prompt) {
        if (r.promptTargets && r.promptTargets.length > 0) {
          for (const target of r.promptTargets) {
            if (!this.governancePrompts.has(target)) this.governancePrompts.set(target, []);
            this.governancePrompts.get(target)!.push(r.prompt);
          }
        } else {
          // No specific target → show to all agents
          if (!this.governancePrompts.has("*")) this.governancePrompts.set("*", []);
          this.governancePrompts.get("*")!.push(r.prompt);
        }
      }
    }

    this.applyInterventionEffects(results, graph, agentStates, agents);

    // 深拷贝 afterState
    const afterState = {
      agentBeliefs: state.agentBeliefs.map(b => ({ ...b })),
      messages,
      agentIds,
      interactionGraph,
    };
    const effectMetrics = this.governanceEngine.evaluateEffects(
      beforeState,
      afterState,
      results.map(r => r.intervention)
    );

    const issues = this.buildIssuesFromResult(result, this.config.governanceConfig);

    return {
      hasIntervention: results.some(r => r.success),
      interventions: results.filter(r => r.success).map(r => r.intervention),
      effectMetrics,
      issues,
    };
  }

  /**
   * Governance via the embeddable GovernanceRuntime (SDK mode).
   * Converts DiscussionEngine's internal state to the framework-agnostic
   * DiscussionMessage format, delegates to the runtime, then applies
   * intervention effects back to DiscussionEngine's graph and agent states.
   */
  private applyGovernanceViaRuntime(
    round: number,
    opinions: AgentOpinion[],
    agentStates: Map<string, { belief: number; confidence: number }>,
    agents: DiscussionAgent[],
    mode: string
  ): { hasIntervention: boolean; interventions: Intervention[]; effectMetrics?: Record<string, number>; issues: GovernanceIssue[] } | null {
    if (!this.externalRuntime) return null;

    // Convert opinions → framework-agnostic DiscussionMessages
    const messages: DiscussionMessage[] = opinions.map(o => ({
      agentId: o.agentId,
      agentName: o.agentId,
      agentRole: "Agent",
      content: o.reasoning,
      belief: o.belief,
      confidence: o.confidence,
      timestamp: new Date().toISOString(),
      referencedAgents: o.referencedAgents,
      reasoning: o.reasoning,
      roundNumber: round,
    }));

    // Ensure runtime is in the right mode
    this.externalRuntime.configure({
      governanceMode: mode as "none" | "detect-only" | "random-intervene" | "full",
    });

    // Delegate to the governance runtime
    const runtimeResult = this.externalRuntime.processRound(messages);

    if (!runtimeResult.hasIntervention) {
      // Return issues even without interventions (for detect-only mode)
      const issues = this.buildIssuesFromRuntimeIssues(runtimeResult.issues);
      return {
        hasIntervention: false,
        interventions: [],
        issues,
      };
    }

    // Apply interventions to DiscussionEngine's internal state
    const graph = this.graphBuilder.getGraph();
    const agentBeliefs: AgentBelief[] = opinions.map(o => ({
      agentId: o.agentId,
      belief: o.belief,
      confidence: o.confidence,
    }));
    const messageInfos: MessageInfo[] = opinions.map(o => ({
      agentId: o.agentId,
      content: o.reasoning,
      timestamp: new Date().toISOString(),
      referencedAgents: o.referencedAgents,
    }));

    const state = {
      agentBeliefs,
      messages: messageInfos,
      agentIds: opinions.map(o => o.agentId),
      interactionGraph: {
        nodes: graph.nodes.map(n => n.agentId),
        edges: graph.edges.map(e => ({
          source: e.source,
          target: e.target,
          weight: e.weight,
          type: e.type,
        })),
      },
    };

    const results = this.governanceEngine.applyInterventions(runtimeResult.interventions, state, this.agentKnowledge);

    // ── Collect information-layer prompts ────────────────────────────
    this.governancePrompts.clear();
    for (const r of results) {
      if (r.prompt) {
        if (r.promptTargets && r.promptTargets.length > 0) {
          for (const target of r.promptTargets) {
            if (!this.governancePrompts.has(target)) this.governancePrompts.set(target, []);
            this.governancePrompts.get(target)!.push(r.prompt);
          }
        } else {
          if (!this.governancePrompts.has("*")) this.governancePrompts.set("*", []);
          this.governancePrompts.get("*")!.push(r.prompt);
        }
      }
    }

    // Apply intervention effects to graph and agent states
    this.applyInterventionEffects(results, graph, agentStates, agents);

    const issues = this.buildIssuesFromRuntimeIssues(runtimeResult.issues);

    return {
      hasIntervention: true,
      interventions: runtimeResult.interventions,
      issues,
    };
  }

  /** Convert runtime issue format to DiscussionEngine's GovernanceIssue format. */
  private buildIssuesFromRuntimeIssues(
    runtimeIssues: Array<{ type: string; severity: "low" | "medium" | "high"; description: string; agents?: string[] }>
  ): GovernanceIssue[] {
    return runtimeIssues.map(i => ({
      type: i.type,
      severity: i.severity,
      description: i.description,
      agents: i.agents,
    }));
  }

  /** Extract GovernanceIssue[] from GovernanceResult */
  private buildIssuesFromResult(
    result: ReturnType<GovernanceEngine["diagnose"]>,
    governanceConfig?: GovernanceConfig
  ): GovernanceIssue[] {
    const issues: GovernanceIssue[] = [];
    if (result.echoChamber.detected) {
      issues.push({
        type: "echo_chamber",
        severity: result.echoChamber.severity,
        description: `Echo chamber detected: ${result.echoChamber.redundantAgents.length} agents share similar information`,
        agents: result.echoChamber.redundantAgents,
        // 审计字段：保留结构化数值供第三方验证（含阈值，2026-07-23 修复）
        detectionMetrics: {
          infoRedundancyScore: Math.round(result.echoChamber.infoRedundancyScore * 1000) / 1000,
          threshold: Math.round((governanceConfig?.echoChamberThreshold ?? GOVERNANCE_ECHO_CHAMBER_THRESHOLD) * 1000) / 1000,
          redundantAgentCount: result.echoChamber.redundantAgents.length,
        },
      });
    }
    if (result.authorityBias.detected) {
      issues.push({
        type: "authority_bias",
        severity: result.authorityBias.severity,
        description: `Authority bias detected: ${result.authorityBias.dominantAgent} dominates with ${(result.authorityBias.influenceRatio * 100).toFixed(0)}% influence`,
        agents: result.authorityBias.dominantAgent ? [result.authorityBias.dominantAgent] : undefined,
        detectionMetrics: {
          influenceRatio: Math.round(result.authorityBias.influenceRatio * 1000) / 1000,
          threshold: Math.round((governanceConfig?.authorityBiasThreshold ?? GOVERNANCE_AUTHORITY_BIAS_THRESHOLD) * 1000) / 1000,
        },
      });
    }
    if (result.polarization.detected) {
      issues.push({
        type: "polarization",
        severity: result.polarization.severity,
        description: `Polarization detected: ${result.polarization.groups.length} groups with polarization index ${result.polarization.polarizationIndex.toFixed(2)}`,
        agents: result.polarization.groups.flatMap(g => g.agentIds),
        detectionMetrics: {
          polarizationIndex: Math.round(result.polarization.polarizationIndex * 1000) / 1000,
          threshold: Math.round((governanceConfig?.polarizationThreshold ?? GOVERNANCE_POLARIZATION_THRESHOLD) * 1000) / 1000,
          ...(result.polarization.bimodalityCoefficient !== undefined
            ? { bimodalityCoefficient: Math.round(result.polarization.bimodalityCoefficient * 1000) / 1000 }
            : {}),
          groupCount: result.polarization.groups.length,
        },
      });
    }
    if (result.prematureConsensus.detected) {
      issues.push({
        type: "premature_consensus",
        severity: result.prematureConsensus.severity,
        description: `Premature consensus detected at round ${result.prematureConsensus.roundNumber}: consensus level ${result.prematureConsensus.consensusLevel.toFixed(2)}`,
        detectionMetrics: {
          beliefStd: Math.round(result.prematureConsensus.beliefStd * 1000) / 1000,
          consensusLevel: Math.round(result.prematureConsensus.consensusLevel * 1000) / 1000,
          threshold: Math.round((governanceConfig?.prematureConsensusThreshold ?? GOVERNANCE_PREMATURE_CONSENSUS_THRESHOLD) * 1000) / 1000,
          roundNumber: result.prematureConsensus.roundNumber,
          maxRounds: result.prematureConsensus.maxRounds,
        },
      });
    }
    issues.push(...result.otherIssues);
    return issues;
  }

  /** Generate random interventions for the random-intervene mode */
  private generateRandomInterventions(
    agentBeliefs: AgentBelief[],
    agents: DiscussionAgent[],
    currentRound: number,
    maxRounds: number,
  ): Intervention[] {
    const interventions: Intervention[] = [];
    const agentIds = agentBeliefs.map(b => b.agentId);
    // H-Fix: 使用持久 PRNG（构造时初始化），避免每轮重建导致相同干预
    const rng = this.randomInterveneRng;

    // Pick 1-3 random intervention types
    const allTypes: Array<{ type: Intervention["type"]; build: () => Intervention }> = [
      {
        type: "reduce_weight",
        build: () => ({
          type: "reduce_weight",
          targetAgentId: agentIds[Math.floor(rng() * agentIds.length)],
          parameters: { reductionFactor: 0.3 + rng() * 0.4 },
          effect: "",
          applied: false,
        }),
      },
      {
        type: "introduce_diversity",
        build: () => ({
          type: "introduce_diversity",
          targetAgents: [agentIds[Math.floor(rng() * agentIds.length)]],
          // H-Fix: 传入 seed 避免 introduceDiversity.apply 回退到 Math.random（破坏可复现性）
          parameters: {
            perturbationAmount: 0.1 + rng() * 0.4,
            seed: (this.config.seed ?? 42) + currentRound * 0x5A4D,
          },
          effect: "",
          applied: false,
        }),
      },
      {
        type: "force_reflection",
        build: () => ({
          type: "force_reflection",
          targetAgents: [agentIds[Math.floor(rng() * agentIds.length)]],
          parameters: { reflectionFactor: 0.1 + rng() * 0.3 },
          effect: "",
          applied: false,
        }),
      },
      {
        type: "continue_discussion",
        build: () => ({
          type: "continue_discussion",
          parameters: {
            additionalRounds: 1 + Math.floor(rng() * 3),
            reason: `Random intervention at round ${currentRound}`,
          },
          effect: "",
          applied: false,
        }),
      },
    ];

    // Shuffle and pick 1-3
    const shuffled = allTypes.sort(() => rng() - 0.5);
    const count = 1 + Math.floor(rng() * 3);
    for (const item of shuffled.slice(0, count)) {
      interventions.push(item.build());
    }

    return interventions;
  }

  /** Apply intervention side effects to graph and agent states */
  private applyInterventionEffects(
    results: ReturnType<GovernanceEngine["applyInterventions"]>,
    graph: InteractionGraph,
    agentStates: Map<string, { belief: number; confidence: number }>,
    agents: DiscussionAgent[],
  ): void {
    for (const interventionResult of results) {
      if (interventionResult.success && interventionResult.stateChanges?.updatedEdges) {
        for (const updatedEdge of interventionResult.stateChanges.updatedEdges) {
          const existingEdge = graph.edges.find(
            e => e.source === updatedEdge.source && e.target === updatedEdge.target
          );
          if (existingEdge) {
            existingEdge.weight = updatedEdge.weight;
            this.graphBuilder.updateEdgeWeight(
              updatedEdge.source,
              updatedEdge.target,
              updatedEdge.weight,
            );
          }
        }
      }

      if (interventionResult.success && interventionResult.stateChanges?.updatedBeliefs) {
        for (const updatedBelief of interventionResult.stateChanges.updatedBeliefs) {
          agentStates.set(updatedBelief.agentId, {
            belief: updatedBelief.belief,
            confidence: updatedBelief.confidence,
          });
        }
        this.updateAgentStates(agents, agentStates);
      }
    }
  }

  /** 获取交叉质证结果 (如果触发过) */
  getCrossExaminationResult(): CrossExaminationResult | null {
    return this.crossExaminationResult
      ? structuredClone(this.crossExaminationResult)
      : null;
  }

  // ==========================================================================
  // Cross-Examination — adversary debate between pro/con camps
  // ==========================================================================

  /**
   * 执行一轮完整的交叉质证。
   *
   * Flow:
   * 1. Form pro/con camps from current opinions
   * 2. Build challenge prompts for each side
   * 3. Each agent responds to the opposing camp's arguments
   * 4. Parse responses and compute belief shifts
   * 5. Synthesize verdict
   */
  private async runCrossExamination(
    opinions: AgentOpinion[],
    agents: DiscussionAgent[],
    round: number,
  ): Promise<CrossExaminationResult> {
    const { activate, divergenceIndex } = shouldActivateCrossExamination(opinions);
    if (!activate) {
      return {
        activated: false,
        divergenceIndex,
        proCamp: { camp: "pro", members: [], avgBelief: 0, strongestArguments: [], evidence: [] },
        conCamp: { camp: "con", members: [], avgBelief: 0, strongestArguments: [], evidence: [] },
        rounds: [],
        synthesis: { consensusPoints: [], minorityReport: [], finalDecision: "", synthesizedBelief: 0, dissentPreserved: false },
      };
    }

    const { proCamp, conCamp } = formCamps(opinions);

    // Send challenge prompts to agents in each camp
    const crossExamRounds: import("./crossExamination").CrossExaminationRound[] = [];
    const agentMap = new Map(agents.map(a => [a.id, a]));

    // Pro camp agents respond to con arguments, and vice versa
    const { proPrompt, conPrompt } = buildChallengePrompt(proCamp, conCamp, round);

    // Send pro prompt to pro agents, con prompt to con agents
    // 每个 promise 内部 catch 返回 null，因此所有 promise 都会 fulfilled（不会 reject）。
    // 用 Promise.all 即可，后续 filter null 跳过失败的 agent。
    type CrossExamResponse = { agentId: string; camp: "pro" | "con"; response: string };
    const responsePromises: Promise<CrossExamResponse | null>[] = [];

    for (const member of proCamp.members) {
      const agent = agentMap.get(member.agentId);
      if (agent) {
        responsePromises.push(
          agent.sendMessage(proPrompt)
            .then<CrossExamResponse>(r => ({ agentId: member.agentId, camp: "pro", response: r }))
            .catch(err => {
              console.warn(`[CrossExam] pro agent ${member.agentId} failed: ${err instanceof Error ? err.message : err}`);
              return null;
            })
        );
      }
    }

    for (const member of conCamp.members) {
      const agent = agentMap.get(member.agentId);
      if (agent) {
        responsePromises.push(
          agent.sendMessage(conPrompt)
            .then<CrossExamResponse>(r => ({ agentId: member.agentId, camp: "con", response: r }))
            .catch(err => {
              console.warn(`[CrossExam] con agent ${member.agentId} failed: ${err instanceof Error ? err.message : err}`);
              return null;
            })
        );
      }
    }

    const settledResults = await Promise.all(responsePromises);
    const responses: CrossExamResponse[] = settledResults.filter(
      (r): r is CrossExamResponse => r !== null
    );

    // Parse responses and compute belief shifts
    for (const resp of responses) {
      const member = resp.camp === "pro"
        ? proCamp.members.find(m => m.agentId === resp.agentId)
        : conCamp.members.find(m => m.agentId === resp.agentId);

      if (!member) continue;

      const opponentAvgBelief = resp.camp === "pro" ? conCamp.avgBelief : proCamp.avgBelief;
      const beliefShift = computeBeliefShift(member.belief, resp.response, opponentAvgBelief);

      crossExamRounds.push({
        round,
        challenge: resp.camp === "pro" ? conCamp.strongestArguments.join("; ") : proCamp.strongestArguments.join("; "),
        challenger: resp.camp === "pro" ? "con" : "pro",
        response: this.extractReasoning(resp.response),
        respondent: resp.camp,
        beliefShift,
      });
    }

    const synthesis = synthesizeVerdict(proCamp, conCamp, crossExamRounds);

    return {
      activated: true,
      divergenceIndex,
      proCamp,
      conCamp,
      rounds: crossExamRounds,
      synthesis,
    };
  }

  /**
   * 将交叉质证的信念移位应用到 Agent 状态。
   */
  private applyCrossExaminationShifts(
    opinions: AgentOpinion[],
    agentStates: Map<string, { belief: number; confidence: number }>,
  ): void {
    if (!this.crossExaminationResult?.activated) return;

    for (const round of this.crossExaminationResult.rounds) {
      const camp = round.respondent === "pro" ? this.crossExaminationResult.proCamp : this.crossExaminationResult.conCamp;
      for (const member of camp.members) {
        const agentState = agentStates.get(member.agentId);
        if (agentState) {
          agentStates.set(member.agentId, {
            belief: Math.max(BELIEF_MIN, Math.min(BELIEF_MAX, agentState.belief + round.beliefShift)),
            confidence: agentState.confidence,
          });
        }
      }
    }
  }

  /** Parse reasoning from an agent's cross-examination response (JSON or plain text) */
  private extractReasoning(response: string): string {
    const parsed = safeJsonParse<{ reasoning?: string; analysis?: string }>(response);
    if (parsed) {
      return parsed.reasoning || parsed.analysis || response.slice(0, 500);
    }
    console.warn("[DiscussionEngine] response parse failed, using truncated raw text");
    return response.slice(0, 500);
  }

  reset(): void {
    if (this.lifecycleState === "running") {
      throw new Error("Cannot reset DiscussionEngine while a run is in progress");
    }
    this.memoryManager = new MemoryManager(new InMemoryStrategy());
    this.influenceManager = new InfluenceManager(new RuleBasedInfluence());
    this.graphBuilder = new InteractionGraphBuilder();
    this.traceBuilder = new DecisionTraceBuilder();
    this.crossExaminationResult = null;
    // 补齐此前遗漏的重置项，防止跨实验状态泄漏
    this.governancePrompts.clear();
    this.agentKnowledge = undefined;
    this.eventTracker.clear();
    this.roundDataArray = [];
    this.dropoutObservations = [];
    this.epistemicLedger = new EpistemicLedger();
    this.pendingEpistemicRounds.clear();
    this.latestEpistemicReport.clear();
    this.epistemicReportClaims.clear();
    this.epistemicSequence = 0;
    this.epistemicRunActive = false;
    // H23 修复：重置 GovernanceEngine 运行时状态，防止跨实验校准缓存/干预历史污染
    this.governanceEngine.reset();
    // H-Fix: 重置 random-intervene PRNG 到初始 seed 状态，保证跨实验可复现
    this.randomInterveneRng = mulberry32((this.config.seed ?? 42) + 0x5A4D);
    // v3.0: 重置 cognitive states
    this.cognitiveStates.clear();
    this.lifecycleState = "idle";
  }

  /**
   * Commit the authoritative per-round state transition.
   *
   * Subclasses with a different epistemic state model must override this
   * method instead of silently running the legacy scalar inference alongside
   * their own state transition. The returned descriptor is persisted in both
   * RoundData and the belief_update event for auditability.
   */
  protected commitRoundState(
    opinions: AgentOpinion[],
    agentStates: Map<string, { belief: number; confidence: number }>,
    agents: DiscussionAgent[],
    roundNumber: number,
  ): RoundStateCommit {
    this.updateBeliefs(opinions, agentStates, roundNumber);
    this.updateAgentStates(agents, agentStates);
    return {
      authority: "legacy_inference",
      committedAgentIds: opinions.map(opinion => opinion.agentId),
    };
  }
}

export * from "./types";
export * from "./memory";
export * from "./influence";
export * from "./interactionGraph";
export * from "./decisionTrace";
export * from "./sensitivityTrace";
export * from "./influenceUtils";
export * from "./crossExamination";
export * from "./topology";
// NOTE: NativeCognitiveEngine 不在此 barrel 中 re-export。
// 原因：nativeCognitiveEngine.ts import { DiscussionEngine } from "./index" 会与
// 此处的 re-export 形成循环依赖，导致 barrel import 时 DiscussionEngine 未初始化
// (Cannot access 'DiscussionEngine' before initialization)。
// 消费方请直接 import from "./nativeCognitiveEngine"。
