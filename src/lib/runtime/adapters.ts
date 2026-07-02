import type { RuntimeContext } from "./types";

import { DiscussionEngine } from "../discussion";
import { EvaluationEngine } from "../evaluation";
import { GovernanceEngine } from "../governance";

import type {
  AgentDecision,
  AgentInfo,
  InteractionRound,
} from "../evaluation/types";

import type {
  AgentBelief,
  MessageInfo,
  GovernanceResult,
  Intervention,
} from "../governance/types";

import type {
  DiscussionTask,
  AgentOpinion,
} from "../discussion/types";

export interface DiscussionAgent {
  id: string;
  name: string;
  role: string;
  type: string;
  sendMessage(message: string): Promise<string>;
  getState(): { belief: number; confidence: number };
  setState(state: { belief: number; confidence: number }): void;
}

export class DiscussionAdapter {
  private engine: DiscussionEngine;

  constructor(engine?: DiscussionEngine) {
    this.engine = engine || new DiscussionEngine();
  }

  adaptToDiscussionAgents(context: RuntimeContext): DiscussionAgent[] {
    return context.agents.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      type: agent.type,
      sendMessage: agent.sendMessage.bind(agent),
      getState: agent.getState.bind(agent),
      setState: agent.setState.bind(agent),
    }));
  }

  adaptToDiscussionTask(context: RuntimeContext): DiscussionTask {
    return {
      id: context.task.id,
      description: context.task.description,
      type: context.task.type,
      createdAt: context.task.createdAt,
      content: typeof context.task.content === "string" ? context.task.content : JSON.stringify(context.task.content),
      context: context.task.context,
    };
  }

  async executeRound(
    context: RuntimeContext
  ): Promise<{
    opinions: AgentOpinion[];
    roundData: any;
  }> {
    const agents = this.adaptToDiscussionAgents(context);
    const task = this.adaptToDiscussionTask(context);

    const result = await this.engine.run(agents, task);
    const allOpinions = result.roundResults?.flatMap((rr) => rr.opinions) || [];

    return {
      opinions: allOpinions,
      roundData: result,
    };
  }
}

export class EvaluationAdapter {
  private engine: EvaluationEngine;

  constructor(engine?: EvaluationEngine) {
    this.engine = engine || new EvaluationEngine();
  }

  adaptToAgentDecisions(context: RuntimeContext): AgentDecision[] {
    const agentStates = context.state.agentStates;
    const decisions: AgentDecision[] = [];

    agentStates.forEach((state, agentId) => {
      decisions.push({
        agentId,
        content: state.belief?.toString() || "0",
        confidence: state.confidence || 0,
        reasoning: "",
        belief: state.belief,
      });
    });

    return decisions;
  }

  adaptToAgentInfo(context: RuntimeContext): AgentInfo[] {
    return context.agents.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      type: agent.type,
    }));
  }

  adaptToInteractionRounds(context: RuntimeContext): InteractionRound[] {
    const rounds: InteractionRound[] = [];
    const roundData = context.artifact.snapshots.rounds;

    roundData.forEach((snapshot, index) => {
      rounds.push({
        round: index + 1,
        messages: snapshot.opinions.map((opinion) => ({
          agentId: opinion.agentId,
          content: opinion.reasoning || "",
          timestamp: snapshot.timestamp,
        })),
        beliefs: {},
        beliefChanges: {},
        converged: snapshot.converged,
      });
    });

    return rounds;
  }

  getFinalDecision(context: RuntimeContext): string {
    const lastDecision = context.artifact.snapshots.decisions[
      context.artifact.snapshots.decisions.length - 1
    ];
    return lastDecision?.finalDecision || "";
  }

  evaluate(context: RuntimeContext): ReturnType<EvaluationEngine["evaluate"]> {
    const agentDecisions = this.adaptToAgentDecisions(context);
    const agents = this.adaptToAgentInfo(context);
    const interactionHistory = this.adaptToInteractionRounds(context);
    const finalDecision = this.getFinalDecision(context);

    return this.engine.evaluate(
      agentDecisions,
      agents,
      interactionHistory,
      finalDecision,
      context.config.evaluation
    );
  }
}

export class GovernanceAdapter {
  private engine: GovernanceEngine;

  constructor(engine?: GovernanceEngine) {
    this.engine = engine || new GovernanceEngine();
  }

  adaptToAgentBeliefs(context: RuntimeContext): AgentBelief[] {
    const agentStates = context.state.agentStates;
    const beliefs: AgentBelief[] = [];

    agentStates.forEach((state, agentId) => {
      beliefs.push({
        agentId,
        belief: state.belief || 0,
        confidence: state.confidence || 0,
      });
    });

    return beliefs;
  }

  adaptToMessages(context: RuntimeContext): MessageInfo[] {
    const messages: MessageInfo[] = [];
    const roundData = context.artifact.snapshots.rounds;

    roundData.forEach((snapshot) => {
      snapshot.opinions.forEach((opinion) => {
        messages.push({
          agentId: opinion.agentId,
          content: opinion.reasoning || "",
          timestamp: snapshot.timestamp,
          referencedAgents: opinion.referencedAgents,
        });
      });
    });

    return messages;
  }

  adaptToAgentIds(context: RuntimeContext): string[] {
    return context.agents.agents.map((agent) => agent.id);
  }

  adaptToInteractionGraph(context: RuntimeContext): any {
    return context.state.interactionGraph;
  }

  diagnose(context: RuntimeContext): GovernanceResult {
    const agentBeliefs = this.adaptToAgentBeliefs(context);
    const messages = this.adaptToMessages(context);
    const agentIds = this.adaptToAgentIds(context);

    return this.engine.diagnose(
      agentBeliefs,
      messages,
      agentIds,
      context.config.governance
    );
  }

  diagnoseAndIntervene(
    context: RuntimeContext
  ): { result: GovernanceResult; interventions: Intervention[] } {
    const agentBeliefs = this.adaptToAgentBeliefs(context);
    const messages = this.adaptToMessages(context);
    const agentIds = this.adaptToAgentIds(context);
    const interactionGraph = this.adaptToInteractionGraph(context);

    return this.engine.diagnoseAndIntervene(
      agentBeliefs,
      messages,
      agentIds,
      interactionGraph,
      context.config.governance
    );
  }
}
