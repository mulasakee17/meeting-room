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
import { StrategyRegistry } from "./strategyRegistry";
import { EventTracker } from "./eventTracker";
import { ObservationLayer, DefaultOpinionParser } from "../observation";
import { InferenceLayer } from "../inference";
import type { RawObservation, ObserverAgent, OpinionParser } from "../observation";
import type { StateDelta } from "../inference";
import {
  DISCUSSION_DEFAULT_CONVERGENCE_THRESHOLD,
  DISCUSSION_DECISION_POSITIVE_THRESHOLD,
  DISCUSSION_DECISION_NEGATIVE_THRESHOLD,
  BELIEF_MIN,
  BELIEF_MAX,
  CONFIDENCE_MIN,
  CONFIDENCE_MAX,
} from "../constants";

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
  private eventTracker: EventTracker;
  private strategyRegistry: StrategyRegistry<any>;
  private config: DiscussionConfig;
  private roundDataArray: RoundData[] = [];
  private observationLayer: ObservationLayer;
  private inferenceLayer: InferenceLayer;
  private opinionParser: OpinionParser;

  constructor(config?: Partial<DiscussionConfig>) {
    this.config = {
      maxRounds: 3,
      convergenceThreshold: DISCUSSION_DEFAULT_CONVERGENCE_THRESHOLD,
      beliefUpdateStrategy: "rule_based",
      influenceStrategy: "rule_based",
      memoryStrategy: "in_memory",
      ...config,
    };

    this.memoryManager = new MemoryManager(new InMemoryStrategy());
    this.beliefUpdateManager = new BeliefUpdateManager(new RuleBasedBeliefUpdate());
    this.influenceManager = new InfluenceManager(new RuleBasedInfluence());
    this.graphBuilder = new InteractionGraphBuilder();
    this.traceBuilder = new DecisionTraceBuilder();
    this.governanceEngine = new GovernanceEngine();
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

      // -- observe & collect opinions --------------------------------------
      const opinions = await this.runRound(agents, task, round, agentStates);
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
      const prompt = this.buildPrompt(agent, typeof task.content === "string" ? task.content : JSON.stringify(task.content), recentMemory, roundNumber);
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
    agent: { name: string; role: string },
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

    return `You are ${agent.name}, a ${agent.role}.

Task: ${task}

Round: ${roundNumber}/${this.config.maxRounds}

${memoryContext}

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

  summarizeTrace() {
    return this.traceBuilder.summarize();
  }

  private applyGovernance(
    round: number,
    opinions: AgentOpinion[],
    agentStates: Map<string, { belief: number; confidence: number }>,
    agents: DiscussionAgent[]
  ): { hasIntervention: boolean; interventions: Intervention[]; effectMetrics?: Record<string, number>; issues: GovernanceIssue[] } | null {
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

    const { result, interventions } = this.governanceEngine.diagnoseAndIntervene(
      agentBeliefs,
      messages,
      agentIds,
      interactionGraph
    );

    if (interventions.length === 0) {
      return null;
    }

    const state = {
      agentBeliefs,
      messages,
      agentIds,
      interactionGraph,
    };

    const beforeState = { ...state };

    const results = this.governanceEngine.applyInterventions(interventions, state);

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

    const afterState = { ...state };
    const effectMetrics = this.governanceEngine.evaluateEffects(
      beforeState,
      afterState,
      results.map(r => r.intervention)
    );

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
    issues.push(...result.otherIssues);

    return {
      hasIntervention: results.some(r => r.success),
      interventions: results.filter(r => r.success).map(r => r.intervention),
      effectMetrics,
      issues,
    };
  }

  reset(): void {
    this.memoryManager = new MemoryManager(new InMemoryStrategy());
    this.beliefUpdateManager = new BeliefUpdateManager(new RuleBasedBeliefUpdate());
    this.influenceManager = new InfluenceManager(new RuleBasedInfluence());
    this.graphBuilder = new InteractionGraphBuilder();
    this.traceBuilder = new DecisionTraceBuilder();
  }
}

export * from "./types";
export * from "./memory";
export * from "./beliefUpdate";
export * from "./influence";
export * from "./interactionGraph";
export * from "./decisionTrace";
