import {
  DiscussionConfig,
  DiscussionResult,
  RoundResult,
  AgentOpinion,
  DiscussionMemoryEntry,
  InteractionGraph,
  DecisionTraceEntry,
  CausalFactor,
  DiscussionData,
  RoundData,
  DiscussionEvent,
  DiscussionTask,
  AgentInfo,
} from "./types";

import { MemoryManager, InMemoryStrategy } from "./memory";
import { BeliefUpdateManager, RuleBasedBeliefUpdate } from "./beliefUpdate";
import { InfluenceManager, RuleBasedInfluence } from "./influence";
import { InteractionGraphBuilder } from "./interactionGraph";
import { DecisionTraceBuilder } from "./decisionTrace";
import { GovernanceEngine, AgentBelief, MessageInfo, GovernanceIssue, Intervention } from "../governance";
import type { GovernanceConfig } from "../governance/types";
import { StrategyRegistry } from "./strategyRegistry";
import { EventTracker } from "./eventTracker";
import { ObservationLayer, DefaultOpinionParser } from "../observation";
import { InferenceLayer } from "../inference";
import type { RawObservation, ObserverAgent, OpinionParser } from "../observation";
import type { StateDelta } from "../inference";
import type { EvaluationConfig } from "../evaluation/types";
import { selectCounterfactualDropout, type CausalObservation } from "./causalTrace";
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
} from "../constants";
import type { GovernanceRuntime as GovernanceRuntimeType } from "@/runtime/GovernanceRuntime";
import type { DiscussionMessage } from "@/runtime/types";

export interface DiscussionAgent {
  id: string;
  name: string;
  role: string;
  type: string;
  sendMessage(message: string): Promise<string>;
  getState(): { belief: number; confidence: number };
  setState(state: { belief: number; confidence: number }): void;
}

export class DiscussionEngine {
  private memoryManager: MemoryManager;
  private beliefUpdateManager: BeliefUpdateManager;
  private influenceManager: InfluenceManager;
  private graphBuilder: InteractionGraphBuilder;
  private traceBuilder: DecisionTraceBuilder;
  private governanceEngine: GovernanceEngine;
  private externalRuntime?: GovernanceRuntimeType;
  /** agentId → unique knowledge items for information-layer intervention prompts */
  private agentKnowledge?: Map<string, string[]>;
  /** Accumulated governance prompts for next-round injection. Cleared after each round. */
  private governancePrompts: Map<string, string[]> = new Map();
  private eventTracker: EventTracker;
  private strategyRegistry: StrategyRegistry<any>;
  private config: DiscussionConfig;
  private roundDataArray: RoundData[] = [];
  private observationLayer: ObservationLayer;
  private inferenceLayer: InferenceLayer;
  private opinionParser: OpinionParser;
  private causalObservations: Array<{
    round: number; sourceAgentId: string; targetAgentId: string;
    sourcePresent: boolean; sourceBelief: number; targetBelief: number;
  }> = [];
  /** 交叉质证结果 (如果触发) */
  private crossExaminationResult: CrossExaminationResult | null = null;

  constructor(config?: Partial<DiscussionConfig>, governanceRuntime?: GovernanceRuntimeType) {
    this.config = {
      maxRounds: 3,
      convergenceThreshold: DISCUSSION_DEFAULT_CONVERGENCE_THRESHOLD,
      beliefUpdateStrategy: "rule_based",
      influenceStrategy: "rule_based",
      memoryStrategy: "in_memory",
      governanceMode: "full",
      enableCrossExamination: false,
      ...config,
    };

    this.memoryManager = new MemoryManager(new InMemoryStrategy());
    this.beliefUpdateManager = new BeliefUpdateManager(new RuleBasedBeliefUpdate());
    this.influenceManager = new InfluenceManager(new RuleBasedInfluence());
    this.graphBuilder = new InteractionGraphBuilder();
    this.traceBuilder = new DecisionTraceBuilder();
    this.governanceEngine = new GovernanceEngine(this.config.governanceConfig);
    this.externalRuntime = governanceRuntime;
    this.eventTracker = new EventTracker();
    this.strategyRegistry = new StrategyRegistry();
    this.observationLayer = new ObservationLayer();
    this.inferenceLayer = new InferenceLayer();
    this.opinionParser = new DefaultOpinionParser();

    this.strategyRegistry.register(new RuleBasedBeliefUpdate());
    this.strategyRegistry.register(new RuleBasedInfluence());
    this.strategyRegistry.register(new InMemoryStrategy());
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
    this.eventTracker.track({
      type: "round_start", timestamp: new Date().toISOString(), roundNumber: 0,
      payload: { task: task.id, agentCount: agents.length },
    });

    const agentStates = this.initializeAgentStates(agents);

    const roundResults = await this.runMainLoop(agents, task, agentStates);

    this.eventTracker.track({
      type: "decision", timestamp: new Date().toISOString(),
      roundNumber: roundResults.length,
      payload: { finalDecision: "", converged: false, totalRounds: roundResults.length },
    });

    return this.buildDiscussionResult(roundResults, agentStates);
  }

  // ==========================================================================
  // Private: run() sub-methods
  // ==========================================================================

  /** Phase 1: snapshot initial agent states and populate graph nodes. */
  private initializeAgentStates(
    agents: DiscussionAgent[]
  ): Map<string, { belief: number; confidence: number }> {
    const agentStates = new Map<string, { belief: number; confidence: number }>();
    for (const agent of agents) {
      const state = agent.getState();
      agentStates.set(agent.id, { belief: state.belief, confidence: state.confidence });
      this.graphBuilder.addNode(agent.id, agent.name, agent.role, state.belief, state.confidence);
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

      // -- counterfactual dropout (causal tracing) -------------------------
      let dropoutAgentId: string | null = null;
      if (this.config.enableCausalTracing && agents.length >= 3) {
        const dropout = selectCounterfactualDropout(agents.map(a => a.id), round);
        if (dropout) dropoutAgentId = dropout.droppedAgentId;
      }

      // -- observe & collect opinions --------------------------------------
      const participatingAgents = dropoutAgentId
        ? agents.filter(a => a.id !== dropoutAgentId)
        : agents;
      const opinions = await this.runRound(participatingAgents, task, round, agentStates);

      // Record counterfactual observations for causal inference
      if (dropoutAgentId && this.config.enableCausalTracing) {
        const droppedState = agentStates.get(dropoutAgentId);
        if (droppedState) {
          for (const opinion of opinions) {
            this.causalObservations.push({
              round, sourceAgentId: dropoutAgentId, targetAgentId: opinion.agentId,
              sourcePresent: false, sourceBelief: droppedState.belief, targetBelief: opinion.belief,
            });
          }
          // Also record the "with" state for the dropped agent's last known opinion
          const droppedAgent = agents.find(a => a.id === dropoutAgentId);
          if (droppedAgent) {
            const droppedOpinion = await this.runRound([droppedAgent], task, round, agentStates);
            for (const o of droppedOpinion) {
              for (const otherOpinion of opinions) {
                this.causalObservations.push({
                  round, sourceAgentId: dropoutAgentId, targetAgentId: otherOpinion.agentId,
                  sourcePresent: true, sourceBelief: o.belief, targetBelief: otherOpinion.belief,
                });
              }
            }
            // Merge the dropped agent's opinion into the round
            opinions.push(...droppedOpinion);
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
          this.crossExaminationResult = await this.runCrossExamination(
            opinions, agents, round
          );
          // Apply belief shifts from cross-examination to agent states
          this.applyCrossExaminationShifts(opinions, agentStates);
        }
      }

      roundResults.push({
        roundNumber: round, opinions: [...opinions],
        timestamp: new Date().toISOString(),
        converged: this.checkConvergence(opinions),
      });

      this.graphBuilder.updateFromOpinions(opinions, round);

      // -- trace building --------------------------------------------------
      const graph = this.graphBuilder.getGraph();
      const causalFactorsMap = this.computeCausalFactors(opinions, graph);
      this.traceBuilder.addRound(round, opinions, this.memoryManager.getAll(), graph, causalFactorsMap);

      if (this.checkConvergence(opinions)) break;

      // -- belief update ---------------------------------------------------
      const prevStates = new Map(agentStates);
      this.updateBeliefs(opinions, agentStates, round);
      this.updateAgentStates(agents, agentStates);

      this.eventTracker.track({
        type: "belief_update", timestamp: new Date().toISOString(),
        roundNumber: round,
        payload: { agentStates: Object.fromEntries(agentStates) },
      });

      // -- governance ------------------------------------------------------
      const governanceResult = this.applyGovernance(round, opinions, agentStates, agents);
      const interventions = governanceResult?.hasIntervention ? governanceResult.interventions : [];

      if (governanceResult?.hasIntervention) {
        this.eventTracker.track({
          type: "intervention", timestamp: new Date().toISOString(),
          roundNumber: round, payload: { interventions },
        });
        this.traceBuilder.addRound(round, opinions, this.memoryManager.getAll(),
          this.graphBuilder.getGraph(), new Map(), interventions);
      }

      // -- record round data ------------------------------------------------
      const beliefChanges = this.buildBeliefChanges(prevStates, agentStates);
      const influenceEvents = this.buildInfluenceEvents(graph, round);
      const converged = this.checkConvergence(opinions);

      this.roundDataArray.push({
        roundNumber: round, timestamp: new Date().toISOString(),
        opinions: [...opinions], beliefChanges, influenceEvents,
        governanceIssues: governanceResult?.issues || [],
        interventions, converged,
      });

      this.eventTracker.track({
        type: "round_end", timestamp: new Date().toISOString(),
        roundNumber: round, payload: { converged },
      });
    }

    return roundResults;
  }

  /** Compute causal factor map for a round's opinions against the current graph. */
  private computeCausalFactors(
    opinions: AgentOpinion[],
    graph: InteractionGraph
  ): Map<string, CausalFactor[]> {
    const map = new Map<string, CausalFactor[]>();
    for (const opinion of opinions) {
      const factors: CausalFactor[] = graph.edges
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

  /** Phase 3: assemble the final DiscussionResult. */
  private buildDiscussionResult(
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
      converged: roundResults[roundResults.length - 1]?.converged || false,
      totalRounds: roundResults.length,
    };
  }

  // ==========================================================================
  // Public analysis helpers
  // ==========================================================================

  /** Set agent-specific knowledge for information-layer intervention prompts. */
  setAgentKnowledge(knowledge: Map<string, string[]>): void {
    this.agentKnowledge = knowledge;
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
          converged: r.converged,
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
        converged: rounds.length > 0 && rounds[rounds.length - 1].converged,
      },
    };
  }

  /**
   * Build a minimal RuntimeContext for use in inference calls during
   * internal belief updates.  Previously these were constructed with
   * `{} as any` casts (ghost objects) that would crash if any code
   * path tried to read a field beyond `round.current`.
   */
  private makeInferenceContext(roundNumber: number) {
    const emptyCollectiveState = {
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
      experiment: { id: "", taskId: "", config: {} as any, status: "created" as const, createdAt: "" },
      session: { id: "", experimentId: "", runtimeContext: undefined as any, status: "initialized" as const, startTime: "" },
      task: { id: "", description: "", type: "", content: "", status: "submitted" as const, createdAt: "", metadata: {} },
      round: { current: roundNumber, max: this.config.maxRounds, startedAt: new Date().toISOString() },
      state: emptyCollectiveState,
      metrics: { evaluation: null, previousEvaluation: null, delta: {}, history: [] },
      governance: { issues: [], interventions: [], appliedInterventions: [], status: "clean" as const },
      agents: { agents: [], states: new Map(), getAgent: () => undefined, getAllStates: () => new Map() },
      config: { termination: { conditions: [], strategy: "any" as const }, evaluation: {} as any, governance: {} as any },
      timeline: [] as any[],
      artifact: {} as any,
    };
  }

  getEventTracker(): EventTracker {
    return this.eventTracker;
  }

  getStrategyRegistry(): StrategyRegistry<any> {
    return this.strategyRegistry;
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
        timestamp: observation.timestamp,
      });
    }

    return observations.map(o => o.parsedOpinion);
  }

  /**
   * Observe agents by sending prompts and parsing their responses.
   * Delegates to the shared DefaultOpinionParser to avoid duplicating
   * the parseOpinion logic that also lives in ObservationLayer.
   */
  private async observeAgents(
    agents: ObserverAgent[],
    task: DiscussionTask,
    roundNumber: number
  ): Promise<RawObservation[]> {
    const recentMemory = this.memoryManager.getRecent(agents.length * 2);

    const observationPromises = agents.map(async (agent) => {
      const state = agent.getState();
      const prompt = this.buildPrompt({ name: agent.name, role: agent.role, id: agent.id }, typeof task.content === "string" ? task.content : JSON.stringify(task.content), recentMemory, roundNumber);
      const response = await agent.sendMessage(prompt);
      // Use the shared parser instead of a private duplicate
      const parsedOpinion = this.opinionParser.parseOpinion(
        response,
        agent.id,
        state.belief,
        state.confidence,
        roundNumber
      );

      return {
        agentId: agent.id,
        roundNumber,
        timestamp: new Date().toISOString(),
        rawResponse: response,
        parsedOpinion,
      };
    });

    return Promise.all(observationPromises);
  }

  private buildPrompt(
    agent: { name: string; role: string; id: string },
    task: string,
    memory: DiscussionMemoryEntry[],
    roundNumber: number
  ): string {
    let memoryContext = "";
    if (memory.length > 0) {
      memoryContext = "\n\nPrevious discussion:\n";
      for (const entry of memory) {
        memoryContext += `- Agent ${entry.agentId}: ${entry.reasoning} (belief: ${entry.belief.toFixed(2)})\n`;
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

    return `You are ${agent.name}, a ${agent.role}.

Task: ${task}

Round: ${roundNumber}/${this.config.maxRounds}

${memoryContext}${governanceContext}

Analyze the task and the previous discussion (if any). Provide your opinion with reasoning, evidence, belief, confidence, and what you think should happen next.

Respond in JSON format:
{
  "reasoning": "Your detailed analysis...",
  "evidence": ["evidence1", "evidence2"],
  "belief": -1 to 1 (negative = against, positive = for),
  "confidence": 0 to 100,
  "nextOpinion": "What you want to discuss next",
  "referencedAgents": ["agent_1", "agent_2"] (agents you reference or respond to)
}`;
  }

  private checkConvergence(opinions: AgentOpinion[]): boolean {
    if (opinions.length < 2) return true;

    const beliefs = opinions.map(o => o.belief);
    const meanBelief = beliefs.reduce((sum, b) => sum + b, 0) / beliefs.length;
    const beliefStd = Math.sqrt(beliefs.reduce((sum, b) => sum + Math.pow(b - meanBelief, 2), 0) / beliefs.length);

    return beliefStd < this.config.convergenceThreshold;
  }

  private updateBeliefs(
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

  private generateFinalDecision(roundResults: RoundResult[]): string {
    if (roundResults.length === 0) return "No decision reached";

    const lastRound = roundResults[roundResults.length - 1];
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

  /** 获取反事实因果观测数据 — 用于构建因果图 */
  getCausalObservations() {
    return this.causalObservations;
  }

  summarizeTrace() {
    return this.traceBuilder.summarize();
  }

  private applyGovernance(
    round: number,
    opinions: AgentOpinion[],
    agentStates: Map<string, { belief: number; confidence: number }>,
    agents: DiscussionAgent[]
  ): { hasIntervention: boolean; interventions: Intervention[]; effectMetrics?: Record<string, number>; issues: GovernanceIssue[] } | null {
    const mode = this.config.governanceMode || "full";

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
      content: o.reasoning,
      timestamp: new Date().toISOString(),
      referencedAgents: o.referencedAgents,
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
      });

      // Build issues from diagnosis (for recording)
      const issues = this.buildIssuesFromResult(result);

      // Generate random interventions regardless of detection
      const randomInterventions = this.generateRandomInterventions(
        agentBeliefs, agents, round, this.config.maxRounds
      );

      if (randomInterventions.length === 0) {
        return { hasIntervention: false, interventions: [], issues };
      }

      const state = { agentBeliefs, messages, agentIds, interactionGraph };
      const results = this.governanceEngine.applyInterventions(randomInterventions, state, this.agentKnowledge);

      // Apply intervention effects to graph and agent states
      this.applyInterventionEffects(results, graph, agentStates, agents);

      const effectMetrics = this.governanceEngine.evaluateEffects(
        state, state, randomInterventions
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
      interactionGraph
    );

    // "detect-only": skip intervention application, only record issues
    if (mode === "detect-only") {
      const issues = this.buildIssuesFromResult(result);
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
    const beforeState = { ...state };
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

    const afterState = { ...state };
    const effectMetrics = this.governanceEngine.evaluateEffects(
      beforeState,
      afterState,
      results.map(r => r.intervention)
    );

    const issues = this.buildIssuesFromResult(result);

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
  private buildIssuesFromResult(result: ReturnType<GovernanceEngine["diagnose"]>): GovernanceIssue[] {
    const issues: GovernanceIssue[] = [];
    if (result.echoChamber.detected) {
      issues.push({
        type: "echo_chamber",
        severity: result.echoChamber.severity,
        description: `Echo chamber detected: ${result.echoChamber.redundantAgents.length} agents share similar information`,
        agents: result.echoChamber.redundantAgents,
      });
    }
    if (result.authorityBias.detected) {
      issues.push({
        type: "authority_bias",
        severity: result.authorityBias.severity,
        description: `Authority bias detected: ${result.authorityBias.dominantAgent} dominates with ${(result.authorityBias.influenceRatio * 100).toFixed(0)}% influence`,
        agents: result.authorityBias.dominantAgent ? [result.authorityBias.dominantAgent] : undefined,
      });
    }
    if (result.polarization.detected) {
      issues.push({
        type: "polarization",
        severity: result.polarization.severity,
        description: `Polarization detected: ${result.polarization.groups.length} groups with polarization index ${result.polarization.polarizationIndex.toFixed(2)}`,
        agents: result.polarization.groups.flatMap(g => g.agentIds),
      });
    }
    if (result.prematureConsensus.detected) {
      issues.push({
        type: "premature_consensus",
        severity: result.prematureConsensus.severity,
        description: `Premature consensus detected at round ${result.prematureConsensus.roundNumber}: consensus level ${result.prematureConsensus.consensusLevel.toFixed(2)}`,
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
    const rng = () => Math.random();

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
          parameters: { perturbationAmount: 0.1 + rng() * 0.4 },
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
    return this.crossExaminationResult;
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
    const responsePromises: Promise<{ agentId: string; camp: "pro" | "con"; response: string }>[] = [];

    for (const member of proCamp.members) {
      const agent = agentMap.get(member.agentId);
      if (agent) {
        responsePromises.push(
          agent.sendMessage(proPrompt).then(r => ({ agentId: member.agentId, camp: "pro" as const, response: r }))
        );
      }
    }

    for (const member of conCamp.members) {
      const agent = agentMap.get(member.agentId);
      if (agent) {
        responsePromises.push(
          agent.sendMessage(conPrompt).then(r => ({ agentId: member.agentId, camp: "con" as const, response: r }))
        );
      }
    }

    const responses = await Promise.all(responsePromises);

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
    try {
      const cleaned = response.trim().replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
      const parsed = JSON.parse(cleaned);
      return parsed.reasoning || parsed.analysis || response.slice(0, 500);
    } catch {
      return response.slice(0, 500);
    }
  }

  reset(): void {
    this.memoryManager = new MemoryManager(new InMemoryStrategy());
    this.beliefUpdateManager = new BeliefUpdateManager(new RuleBasedBeliefUpdate());
    this.influenceManager = new InfluenceManager(new RuleBasedInfluence());
    this.graphBuilder = new InteractionGraphBuilder();
    this.traceBuilder = new DecisionTraceBuilder();
    this.crossExaminationResult = null;
  }
}

export * from "./types";
export * from "./memory";
export * from "./beliefUpdate";
export * from "./influence";
export * from "./interactionGraph";
export * from "./decisionTrace";
export * from "./causalTrace";
export * from "./influenceUtils";
export * from "./crossExamination";
