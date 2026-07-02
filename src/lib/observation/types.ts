import type { AgentOpinion, DiscussionTask, DiscussionMemoryEntry } from "../discussion/types";

export interface ObserverAgent {
  id: string;
  name: string;
  role: string;
  sendMessage(prompt: string): Promise<string>;
  getState(): { belief: number; confidence: number };
}

export interface RawObservation {
  agentId: string;
  roundNumber: number;
  timestamp: string;
  rawResponse: string;
  parsedOpinion: AgentOpinion;
}

export interface ObservationConfig {
  maxResponseLength?: number;
  defaultBelief?: number;
  defaultConfidence?: number;
}

export interface PromptBuilder {
  buildPrompt(
    agentName: string,
    agentRole: string,
    task: string,
    memory: DiscussionMemoryEntry[],
    roundNumber: number,
    maxRounds: number
  ): string;
}

export interface OpinionParser {
  parseOpinion(
    response: string,
    agentId: string,
    currentBelief: number,
    currentConfidence: number,
    roundNumber: number
  ): AgentOpinion;
}
