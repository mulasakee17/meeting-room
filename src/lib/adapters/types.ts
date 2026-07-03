import type { LLMConfig } from "../llm/providers";

export type AgentFrameworkType = "autogen" | "crewai" | "langgraph" | "custom";

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  type: string;
  config?: Record<string, unknown>;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  type: string;
  sendMessage(message: string): Promise<string>;
  getState(): AgentState;
}

export interface AgentState {
  agentId: string;
  belief?: number;
  confidence?: number;
  reasoning?: string;
  lastMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface InteractionMessage {
  agentId: string;
  content: string;
  timestamp: string;
}

export interface InteractionResult {
  messages: InteractionMessage[];
  agentStates: AgentState[];
  converged: boolean;
  finalDecision: string;
}

export interface TaskInput {
  type: "text" | "structured" | "question";
  content: string | Record<string, unknown>;
  context?: string;
}

export interface FrameworkAdapter {
  framework: AgentFrameworkType;
  createAgents(configs: AgentConfig[], llmConfig?: LLMConfig): Promise<Agent[]>;
  runInteraction(agents: Agent[], input: TaskInput): Promise<InteractionResult>;
  getAgentInfo(agents: Agent[]): AgentConfig[];
  dispose(agents: Agent[]): Promise<void>;
}

export interface FrameworkAdapterOptions {
  llmConfig?: {
    provider: string;
    model: string;
    temperature?: number;
  };
  maxRounds?: number;
  timeoutSeconds?: number;
  customConfig?: Record<string, unknown>;
}