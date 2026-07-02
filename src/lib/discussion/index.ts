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
import { ObservationLayer } from "../observation";
import { InferenceLayer } from "../inference";
import type { RawObservation, ObserverAgent } from "../observation";
import type { StateDelta } from "../inference";

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

  constructor(config?: Partial<DiscussionConfig>) {
    this.config = {
      maxRounds: 3,
      convergenceThreshold: 0.1,
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

    this.strategyRegistry.register(new RuleBasedBeliefUpdate());
    this.strategyRegistry.register(new RuleBasedInfluence());
    this.strategyRegistry.register(new InMemoryStrategy());
  }

  async run(agents: DiscussionAgent[], task: DiscussionTask): Promise<DiscussionResult> {
    const roundResults: RoundResult[] = [];
    const agentStates = new Map<string, { belief: number; confidence: number }>();

    this.eventTracker.track({
      type: "round_start",
      timestamp: new Date().toISOString(),
      roundNumber: 0,
      payload: { task: task.id, agentCount: agents.length },
    });

    for (const agent of agents) {
      const state = agent.getState();
      agentStates.set(agent.id, { belief: state.belief, confidence: state.confidence });
      this.graphBuilder.addNode(agent.id, agent.name, agent.role, state.belief, state.confidence);
    }

    for (let round = 1; round <= this.config.maxRounds; round++) {
      this.eventTracker.track({
        type: "round_start",
        timestamp: new Date().toISOString(),
        roundNumber: round,
        payload: {},
      });

      const opinions = await this.runRound(agents, task, round, agentStates);
      roundResults.push({
        roundNumber: round,
        opinions: [...opinions],
        timestamp: new Date().toISOString(),
        converged: this.checkConvergence(opinions),
      });

      this.graphBuilder.updateFromOpinions(opinions, round);

      const graph = this.graphBuilder.getGraph();
      const causalFactorsMap = new Map<string, CausalFactor[]>();
      for (const opinion of opinions) {
        const influenceWeights = graph.edges
          .filter(e => e.target === opinion.agentId)
          .map(e => ({
            sourceAgentId: e.source,
            weight: e.weight,
            type: e.type,
          }));

        const factors: CausalFactor[] = [];
        for (const w of influenceWeights) {
          factors.push({
            type: "agent_influence",
            sourceId: w.sourceAgentId,
            description: `受到 Agent ${w.sourceAgentId} 的影响，权重: ${w.weight.toFixed(2)}`,
            weight: w.weight,
          });
        }
        causalFactorsMap.set(opinion.agentId, factors);
      }

      this.traceBuilder.addRound(round, opinions, this.memoryManager.getAll(), graph, causalFactorsMap);

      if (this.checkConvergence(opinions)) {
        break;
      }

      const prevStates = new Map(agentStates);
    
      this.updateBeliefs(opinions, agentStates, round);
      this.updateAgentStates(agents, agentStates);

      this.eventTracker.track({
        type: "belief_update",
        timestamp: new Date().toISOString(),
        roundNumber: round,
        payload: { agentStates: Object.fromEntries(agentStates) },
      });

      const governanceResult = this.applyGovernance(round, opinions, agentStates, agents);
      const interventions = governanceResult && governanceResult.hasIntervention 
        ? governanceResult.interventions 
        : [];
      
      if (governanceResult && governanceResult.hasIntervention) {
        this.eventTracker.track({
          type: "intervention",
          timestamp: new Date().toISOString(),
          roundNumber: round,
          payload: { interventions },
        });
        this.traceBuilder.addRound(
          round,
          opinions,
          this.memoryManager.getAll(),
          this.graphBuilder.getGraph(),
          new Map(),
          interventions
        );
      }

      const beliefChanges: Record<string, { old: number; new: number; reason: string }> = {};
      agentStates.forEach((newState, agentId) => {
        const oldState = prevStates.get(agentId);
        if (oldState && oldState.belief !== newState.belief) {
          beliefChanges[agentId] = {
            old: oldState.belief,
            new: newState.belief,
            reason: "influence",
          };
        }
      });

      const influenceEvents = graph.edges
        .filter(e => e.round === round)
        .map(e => ({
          sourceAgentId: e.source,
          targetAgentId: e.target,
          type: e.type,
          weight: e.weight,
          round: e.round,
          timestamp: new Date().toISOString(),
        }));

      const converged = this.checkConvergence(opinions);

      const roundData: RoundData = {
        roundNumber: round,
        timestamp: new Date().toISOString(),
        opinions: [...opinions],
        beliefChanges,
        influenceEvents,
        governanceIssues: governanceResult?.issues || [],
        interventions,
        converged,
      };
      this.roundDataArray.push(roundData);

      this.eventTracker.track({
        type: "round_end",
        timestamp: new Date().toISOString(),
        roundNumber: round,
        payload: { converged },
      });
    }

    const finalDecision = this.generateFinalDecision(roundResults);
    const finalBeliefs: Record<string, number> = {};
    agentStates.forEach((state, agentId) => {
      finalBeliefs[agentId] = state.belief;
    });

    const converged = roundResults[roundResults.length - 1]?.converged || false;
    
    this.eventTracker.track({
      type: "decision",
      timestamp: new Date().toISOString(),
      roundNumber: roundResults.length,
      payload: { finalDecision, converged, totalRounds: roundResults.length },
    });

    return {
      roundResults,
      decisionTrace: this.traceBuilder.getTrace(),
      interactionGraph: this.graphBuilder.getGraph(),
      finalDecision,
      finalBeliefs,
      converged,
      totalRounds: roundResults.length,
    };
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
    }, {
      experiment: {} as any,
      session: {} as any,
      task: {} as any,
      round: { current: roundNumber, max: this.config.maxRounds, startedAt: new Date().toISOString() },
      state: {} as any,
      metrics: {} as any,
      governance: {} as any,
      agents: {} as any,
      config: {} as any,
      timeline: [],
      artifact: {} as any,
    });

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
      const parsedOpinion = this.parseOpinion(response, agent.id, state.belief, state.confidence, roundNumber);

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

  private parseOpinion(
    response: string,
    agentId: string,
    currentBelief: number,
    currentConfidence: number,
    roundNumber: number
  ): AgentOpinion {
    try {
      const parsed = JSON.parse(response);

      return {
        agentId,
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "No reasoning provided",
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
        belief: typeof parsed.belief === "number" ? Math.max(-1, Math.min(1, parsed.belief)) : currentBelief,
        confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(100, parsed.confidence)) : currentConfidence,
        nextOpinion: typeof parsed.nextOpinion === "string" ? parsed.nextOpinion : "",
        referencedAgents: Array.isArray(parsed.referencedAgents) ? parsed.referencedAgents : [],
      };
    } catch {
      return {
        agentId,
        reasoning: response.substring(0, 500),
        evidence: [],
        belief: currentBelief,
        confidence: currentConfidence,
        nextOpinion: "",
        referencedAgents: [],
      };
    }
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
    }, {
      experiment: {} as any,
      session: {} as any,
      task: {} as any,
      round: { current: roundNumber, max: this.config.maxRounds, startedAt: new Date().toISOString() },
      state: {} as any,
      metrics: {} as any,
      governance: {} as any,
      agents: {} as any,
      config: {} as any,
      timeline: [],
      artifact: {} as any,
    });

    for (const delta of deltas) {
      const current = agentStates.get(delta.agentId);
      if (current) {
        agentStates.set(delta.agentId, {
          belief: Math.max(-1, Math.min(1, current.belief + delta.beliefChange)),
          confidence: Math.max(0, Math.min(100, current.confidence + delta.confidenceChange)),
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
    const beliefLabel = avgBelief > 0.3 ? "positive" : avgBelief < -0.3 ? "negative" : "neutral";

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
