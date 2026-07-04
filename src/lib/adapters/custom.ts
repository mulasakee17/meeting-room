import {
  FrameworkAdapter,
  AgentFrameworkType,
  AgentConfig,
  Agent,
  TaskInput,
  InteractionResult,
  AgentState,
} from "./types";

import { callLLM, LLMConfig, LLMResponse } from "@/lib/llm/providers";
import { DiscussionEngine, DiscussionAgent, DiscussionConfig } from "@/lib/discussion";
import { GovernanceRuntime } from "@/runtime/GovernanceRuntime";

export class CustomAgent implements Agent {
  private llmConfig: LLMConfig;
  private systemPrompt: string;
  private lastMessageContent: string = "";
  private lastReasoning: string = "";
  private lastEmotion: number = 0;
  private currentBelief: number = 0;
  private currentConfidence: number = 0;

  constructor(
    public id: string,
    public name: string,
    public role: string,
    public type: string,
    llmConfig: LLMConfig,
    customPrompt?: string,
  ) {
    this.llmConfig = llmConfig;
    this.systemPrompt = customPrompt || this.buildSystemPrompt();
    this.currentBelief = (Math.random() - 0.5) * 2;
    this.currentConfidence = 70 + Math.random() * 30;
  }

  private buildSystemPrompt(): string {
    const rolePrompts: Record<string, string> = {
      Expert: "你是一位资深专家，擅长分析复杂问题并提供深入见解。请以专业、严谨的态度回答问题。",
      Analyst: "你是一位数据分析专家，擅长从数据中提取洞察，提供基于证据的分析。",
      Critic: "你是一位批判性思考者，擅长识别论证中的弱点和潜在偏见，提出建设性的质疑。",
      Synthesizer: "你是一位综合思考者，擅长整合不同观点，找到共同点和解决方案。",
      Visionary: "你是一位远见卓识的思考者，擅长预测未来趋势和可能性。",
      Default: "你是一位智能助手，擅长分析问题并提供有价值的见解。",
    };

    return `You are an AI Agent named "${this.name}" with the role "${this.role}". ${rolePrompts[this.role] || rolePrompts.Default}

Answer the user's question in Chinese. You MUST return ONLY a JSON object with exactly these two fields:
- emotion: a number between -100 and 100 indicating your sentiment (-100 = strongly negative, 0 = neutral, 100 = strongly positive)
- reasoning: a string with your detailed analysis

Example: {"emotion": 60, "reasoning": "基于...分析，我认为..."}

No other fields. No other text. Just the JSON.`;
  }

  async sendMessage(message: string): Promise<string> {
    try {
      const response: LLMResponse = await callLLM(
        this.systemPrompt,
        message,
        this.llmConfig
      );
      
      this.lastReasoning = response.reasoning;
      this.lastEmotion = response.emotion;
      
      const result = JSON.stringify({
        reasoning: response.reasoning,
        evidence: [],
        belief: Math.max(-1, Math.min(1, response.emotion / 100)),
        confidence: Math.min(100, Math.max(0, 50 + response.emotion / 2)),
        nextOpinion: "",
        referencedAgents: [],
      });
      
      this.lastMessageContent = result;
      return result;
    } catch (error) {
      console.error(`Agent ${this.id} LLM call failed:`, error);
      this.lastReasoning = `分析失败，使用默认推理。问题：${message.substring(0, 50)}...`;
      this.lastEmotion = 0;
      
      const result = JSON.stringify({
        reasoning: this.lastReasoning,
        evidence: [],
        belief: 0,
        confidence: 50,
        nextOpinion: "",
        referencedAgents: [],
      });
      
      this.lastMessageContent = result;
      return result;
    }
  }

  getState(): AgentState {
    return {
      agentId: this.id,
      belief: this.currentBelief,
      confidence: this.currentConfidence,
      reasoning: this.lastReasoning,
      lastMessage: this.lastMessageContent,
    };
  }

  setState(state: { belief: number; confidence: number }): void {
    this.currentBelief = state.belief;
    this.currentConfidence = state.confidence;
  }
}

class DiscussionAgentWrapper implements DiscussionAgent {
  constructor(private agent: CustomAgent) {}

  get id(): string { return this.agent.id; }
  get name(): string { return this.agent.name; }
  get role(): string { return this.agent.role; }
  get type(): string { return this.agent.type; }

  async sendMessage(message: string): Promise<string> {
    return this.agent.sendMessage(message);
  }

  getState(): { belief: number; confidence: number } {
    const state = this.agent.getState();
    return { belief: state.belief || 0, confidence: state.confidence || 50 };
  }

  setState(state: { belief: number; confidence: number }): void {
    this.agent.setState(state);
  }
}

export class CustomAdapter implements FrameworkAdapter {
  framework: AgentFrameworkType = "custom";

  async createAgents(configs: AgentConfig[], llmConfig?: LLMConfig): Promise<Agent[]> {
    const defaultConfig: LLMConfig = llmConfig || {
      provider: "deepseek",
      model: "deepseek-chat",
    };

    return configs.map(config =>
      new CustomAgent(config.id, config.name, config.role, config.type, defaultConfig, config.config?.customPrompt as string | undefined)
    );
  }

  async runInteraction(agents: Agent[], input: TaskInput): Promise<InteractionResult> {
    const discussionConfig: DiscussionConfig = {
      maxRounds: 3,
      convergenceThreshold: 0.15,
      beliefUpdateStrategy: "rule_based",
      influenceStrategy: "rule_based",
      memoryStrategy: "in_memory",
    };

    const discussionEngine = new DiscussionEngine(
      discussionConfig,
      new GovernanceRuntime({
        maxRounds: discussionConfig.maxRounds || 3,
        governanceMode: "full",
      })
    );

    const discussionAgents = agents.map(a => new DiscussionAgentWrapper(a as CustomAgent));

    const result = await discussionEngine.run(discussionAgents, {
      id: `task-${Date.now()}`,
      description: input.type,
      type: input.type,
      createdAt: new Date().toISOString(),
      content: input.content,
      context: input.context,
    });

    const messages = result.roundResults.flatMap(r => 
      r.opinions.map(o => ({
        agentId: o.agentId,
        content: JSON.stringify({
          reasoning: o.reasoning,
          evidence: o.evidence,
          belief: o.belief,
          confidence: o.confidence,
        }),
        timestamp: r.timestamp,
      }))
    );

    const agentStates = result.roundResults[result.roundResults.length - 1]?.opinions.map(o => ({
      agentId: o.agentId,
      belief: o.belief,
      confidence: o.confidence,
      reasoning: o.reasoning,
      lastMessage: JSON.stringify({
        reasoning: o.reasoning,
        evidence: o.evidence,
        belief: o.belief,
        confidence: o.confidence,
      }),
    })) || [];

    return {
      messages,
      agentStates,
      converged: result.converged,
      finalDecision: result.finalDecision.substring(0, 500) + "...",
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
