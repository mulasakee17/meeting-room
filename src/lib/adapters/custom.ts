import {
  FrameworkAdapter,
  AgentFrameworkType,
  AgentConfig,
  Agent,
  TaskInput,
  InteractionResult,
  AgentState,
} from "./types";

import { callLLM, LLMConfig, LLMResponse, TokenUsage } from "@/lib/llm/providers";
import { DiscussionEngine, DiscussionAgent, DiscussionConfig } from "@/lib/discussion";
import { GovernanceRuntime } from "@/runtime/GovernanceRuntime";
import { mulberry32 } from "../utils/statsUtils";

export interface AgentUsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalLatencyMs: number;
  callCount: number;
  /** Per-call latency records (ms each) */
  latencies: number[];
}


/** 从 agent ID 派生确定性偏移量，确保同一 seed 下各 agent 初始信念不同 */
function hashAgentId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export class CustomAgent implements Agent {
  private llmConfig: LLMConfig;
  private systemPrompt: string;
  private lastMessageContent: string = "";
  private lastReasoning: string = "";
  private lastEmotion: number = 0;
  private currentBelief: number = 0;
  private currentConfidence: number = 0;

  // Token/latency tracking
  private promptTokens: number = 0;
  private completionTokens: number = 0;
  private totalLatencyMs: number = 0;
  private callCount: number = 0;
  private latencies: number[] = [];

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
    // 使用 seed 驱动的 PRNG 初始化信念，保证实验可复现
    const seed = llmConfig.seed ?? Date.now();
    const rng = mulberry32(seed + hashAgentId(this.id));
    this.currentBelief = (rng() - 0.5) * 2;
    this.currentConfidence = 70 + rng() * 30;
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

      // Accumulate token usage and latency
      if (response.usage) {
        this.promptTokens += response.usage.promptTokens;
        this.completionTokens += response.usage.completionTokens;
      }
      if (response.latencyMs !== undefined) {
        this.totalLatencyMs += response.latencyMs;
        this.latencies.push(response.latencyMs);
      }
      this.callCount++;

      // V2: pass through raw LLM output so downstream parsers get itemBeliefs etc.
      this.lastMessageContent = response.rawContent;
      return response.rawContent;
    } catch (error) {
      console.error(`Agent ${this.id} LLM call failed:`, error);
      // 重试一次，等待 2 秒
      await new Promise(r => setTimeout(r, 2000));
      try {
        const retryResponse: LLMResponse = await callLLM(
          this.systemPrompt,
          message,
          this.llmConfig
        );
        this.lastReasoning = retryResponse.reasoning;
        this.lastEmotion = retryResponse.emotion;
        if (retryResponse.usage) {
          this.promptTokens += retryResponse.usage.promptTokens;
          this.completionTokens += retryResponse.usage.completionTokens;
        }
        if (retryResponse.latencyMs !== undefined) {
          this.totalLatencyMs += retryResponse.latencyMs;
          this.latencies.push(retryResponse.latencyMs);
        }
        this.callCount++;
        this.lastMessageContent = retryResponse.rawContent;
        return retryResponse.rawContent;
      } catch (retryError) {
        console.error(`Agent ${this.id} retry also failed:`, retryError);
        // 抛出异常而非返回默认 belief=0，避免被误判为收敛
        throw new Error(`Agent ${this.id} LLM call failed after retry: ${retryError}`);
      }
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

  getUsageStats(): AgentUsageStats {
    return {
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.promptTokens + this.completionTokens,
      totalLatencyMs: this.totalLatencyMs,
      callCount: this.callCount,
      latencies: [...this.latencies],
    };
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
