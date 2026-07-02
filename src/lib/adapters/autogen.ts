import {
  FrameworkAdapter,
  AgentFrameworkType,
  AgentConfig,
  Agent,
  TaskInput,
  InteractionResult,
  AgentState,
  InteractionMessage,
} from "./types";

class AutoGenAgent implements Agent {
  constructor(
    public id: string,
    public name: string,
    public role: string,
    public type: string,
    private llmConfig?: { provider: string; model: string },
    private belief?: number,
    private confidence?: number,
    private reasoning?: string
  ) {}

  async sendMessage(message: string): Promise<string> {
    return `[AutoGen ${this.role}] ${message.substring(0, 100)}...`;
  }

  getState(): AgentState {
    return {
      agentId: this.id,
      belief: this.belief,
      confidence: this.confidence,
      reasoning: this.reasoning,
      lastMessage: `Processed input`,
    };
  }
}

export class AutoGenAdapter implements FrameworkAdapter {
  framework: AgentFrameworkType = "autogen";

  async createAgents(configs: AgentConfig[], llmConfig?: any): Promise<Agent[]> {
    return configs.map(config => {
      const belief = (Math.random() - 0.5) * 2;
      return new AutoGenAgent(
        config.id,
        config.name,
        config.role,
        config.type,
        llmConfig,
        belief,
        60 + Math.random() * 40,
        `As a ${config.role}, I analyze based on my expertise`
      );
    });
  }

  async runInteraction(agents: Agent[], input: TaskInput): Promise<InteractionResult> {
    const messages: InteractionMessage[] = [];
    const agentStates: AgentState[] = [];

    const content = typeof input.content === "string" ? input.content : JSON.stringify(input.content);

    for (const agent of agents) {
      const response = await agent.sendMessage(content);
      messages.push({
        agentId: agent.id,
        content: response,
        timestamp: new Date().toISOString(),
      });
      agentStates.push(agent.getState());
    }

    const reasoningParts = agentStates.map(s => s.reasoning).filter(Boolean);
    const finalDecision = `Based on ${agents.length} agents' analysis: ${reasoningParts.join("; ")}. Final consensus: positive`;

    return {
      messages,
      agentStates,
      converged: true,
      finalDecision,
    };
  }

  getAgentInfo(agents: Agent[]): AgentConfig[] {
    return agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      type: agent.type,
    }));
  }

  async dispose(agents: Agent[]): Promise<void> {
  }
}