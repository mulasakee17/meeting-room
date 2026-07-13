import type { RawObservation, ObservationConfig, PromptBuilder, OpinionParser, ObserverAgent } from "./types";
import type { AgentOpinion, DiscussionTask, DiscussionMemoryEntry } from "../discussion/types";
import type { RuntimeContext } from "../runtime/types";
import { safeJsonParse } from "../utils/jsonUtils";

class DefaultPromptBuilder implements PromptBuilder {
  buildPrompt(
    agentName: string,
    agentRole: string,
    task: string,
    memory: DiscussionMemoryEntry[],
    roundNumber: number,
    maxRounds: number
  ): string {
    let memoryContext = "";
    if (memory.length > 0) {
      memoryContext = "\n\nPrevious discussion:\n";
      for (const entry of memory) {
        memoryContext += `- Agent ${entry.agentId}: ${entry.reasoning} (belief: ${entry.belief.toFixed(2)})\n`;
      }
    }

    return `You are ${agentName}, a ${agentRole}.

Task: ${task}

Round: ${roundNumber}/${maxRounds}

${memoryContext}

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
}

class DefaultOpinionParser implements OpinionParser {
  parseOpinion(
    response: string,
    agentId: string,
    currentBelief: number,
    currentConfidence: number,
    roundNumber: number
  ): AgentOpinion {
    try {
      // H35 修复：用 safeJsonParse 替代裸 JSON.parse，处理 markdown 代码块/截断等异常
      const parsed = safeJsonParse(response);
      if (!parsed) throw new Error("Empty parse result");

      return {
        agentId,
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "No reasoning provided",
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
        belief: typeof parsed.belief === "number" ? Math.max(-1, Math.min(1, parsed.belief)) : currentBelief,
        confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(100, parsed.confidence)) : currentConfidence,
        nextOpinion: typeof parsed.nextOpinion === "string" ? parsed.nextOpinion : "",
        referencedAgents: Array.isArray(parsed.referencedAgents) ? parsed.referencedAgents : [],
        itemBeliefs: Array.isArray(parsed.itemBeliefs)
          ? parsed.itemBeliefs.filter(
              (ib: any) => typeof ib.item === "string"
                && typeof ib.rank === "number"
                && typeof ib.belief === "number"
            ).map((ib: any) => ({
              item: ib.item,
              rank: ib.rank,
              belief: Math.max(-1, Math.min(1, ib.belief)),
              confidence: typeof ib.confidence === "number" ? Math.max(0, Math.min(100, ib.confidence)) : 50,
            }))
          : undefined,
      };
    } catch (err) {
      console.warn(`[ObservationLayer] Agent ${agentId} response parse failed:`, err instanceof Error ? err.message : err);
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
}

export class ObservationLayer {
  private promptBuilder: PromptBuilder;
  private opinionParser: OpinionParser;
  private config: ObservationConfig;

  constructor(config?: ObservationConfig, promptBuilder?: PromptBuilder, opinionParser?: OpinionParser) {
    this.promptBuilder = promptBuilder || new DefaultPromptBuilder();
    this.opinionParser = opinionParser || new DefaultOpinionParser();
    this.config = config || {};
  }

  async observe(
    agents: ObserverAgent[],
    task: DiscussionTask,
    round: number,
    context: RuntimeContext
  ): Promise<RawObservation[]> {
    const taskContent = typeof task.content === "string" ? task.content : JSON.stringify(task.content);
    const maxRounds = context.round.max;

    const observationPromises = agents.map(async (agent) => {
      const state = agent.getState();
      const prompt = this.promptBuilder.buildPrompt(
        agent.name,
        agent.role,
        taskContent,
        [],
        round,
        maxRounds
      );

      const response = await agent.sendMessage(prompt);
      const parsedOpinion = this.opinionParser.parseOpinion(
        response,
        agent.id,
        state.belief,
        state.confidence,
        round
      );

      return {
        agentId: agent.id,
        roundNumber: round,
        timestamp: new Date().toISOString(),
        rawResponse: response,
        parsedOpinion,
      };
    });

    return Promise.all(observationPromises);
  }

  getPromptBuilder(): PromptBuilder {
    return this.promptBuilder;
  }

  getOpinionParser(): OpinionParser {
    return this.opinionParser;
  }
}

export { DefaultPromptBuilder, DefaultOpinionParser };
export type { RawObservation, ObservationConfig, PromptBuilder, OpinionParser, ObserverAgent };
