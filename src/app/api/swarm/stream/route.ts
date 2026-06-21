import { NextRequest } from "next/server";
import { createAgentConfigs } from "@/lib/agents/types";
import { personas } from "@/lib/agents/personas";
import { callLLM } from "@/lib/llm/openai";
import { calculateMean, calculateVariance, checkConvergence, clampEmotion } from "@/lib/utils/emotion";
import { AgentState, RoundData } from "@/types";

const agentConfigs = createAgentConfigs(personas);

function buildContext(states: Record<string, AgentState>, agentId: string): string {
  const otherAgents = Object.entries(states)
    .filter(([id]) => id !== agentId)
    .map(([id, state]) => {
      const persona = personas.find(p => p.id === id);
      return `${persona?.emoji || id} ${persona?.name || id}: 情绪值${state.emotion > 0 ? "+" : ""}${state.emotion}（${state.reasoning}）`;
    })
    .join("\n");

  return `## 其他Agent的观点\n${otherAgents}`;
}

function buildHistoryPrompt(history: RoundData[], agentId: string): string {
  if (history.length === 0) return "";
  
  const myHistory = history.map((round, idx) => {
    const state = round.agents[agentId];
    return `Round ${idx + 1}: 情绪值${state.emotion > 0 ? "+" : ""}${state.emotion}，理由：${state.reasoning}`;
  }).join("\n");

  return `## 你的历史决策\n${myHistory}\n\n注意：保持决策一致性，不要剧烈反转。`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { news, rounds = 5 } = body;

  if (!news || typeof news !== "string" || news.trim().length === 0) {
    return new Response(JSON.stringify({ error: "新闻内容不能为空" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const roundHistory: RoundData[] = [];
      let currentStates: Record<string, AgentState> = {};

      sendEvent({ type: "start", news });

      for (let round = 1; round <= rounds; round++) {
        sendEvent({ type: "round_start", round });

        const roundStates: Record<string, AgentState> = {};

        for (const [agentId, config] of Object.entries(agentConfigs)) {
          const persona = config.persona;
          sendEvent({ type: "agent_thinking", agentId, agentName: persona.name, round });

          let result: { emotion: number; reasoning: string };
          
          if (round === 1) {
            const userPrompt = `## 金融新闻\n${news}\n\n作为${persona.role}，基于你的决策风格和风险偏好，给出你的初始情绪判断。`;
            result = await callLLM(config.systemPrompt, userPrompt);
          } else {
            const context = buildContext(currentStates, agentId);
            const history = buildHistoryPrompt(roundHistory, agentId);
            
            const evolvePrompt = `## 金融新闻
${news}

${history}

${context}

## 你的任务
作为${persona.role}，参考其他Agent的观点和你的历史决策，调整你的情绪判断。
记住你的口头禅："${persona.catchphrase}"
保持人格一致性，体现你的${persona.decisionStyle === "momentum" ? "趋势跟随" : persona.decisionStyle === "contrarian" ? "逆向思维" : persona.decisionStyle === "fundamental" ? "价值投资" : persona.decisionStyle === "technical" ? "技术分析" : "宏观视角"}风格。

输出JSON格式：{"emotion": 数字, "reasoning": "原因说明(体现你的决策风格)"}`;

            result = await callLLM(config.systemPrompt, evolvePrompt);
          }

          const state = { emotion: clampEmotion(result.emotion), reasoning: result.reasoning };
          roundStates[agentId] = state;

          sendEvent({
            type: "agent_result",
            agentId,
            agentName: persona.name,
            emoji: persona.emoji,
            round,
            emotion: state.emotion,
            reasoning: state.reasoning,
          });
        }

        currentStates = roundStates;

        const emotions = Object.values(roundStates).map((s) => s.emotion);
        const consensus = calculateMean(emotions);
        const variance = calculateVariance(emotions);

        const roundData: RoundData = { round, agents: roundStates, consensus, variance };
        roundHistory.push(roundData);

        sendEvent({ type: "round_complete", round, consensus, variance });

        if (checkConvergence(emotions)) {
          sendEvent({ type: "converged", round });
          break;
        }
      }

      const finalEmotions = Object.values(currentStates).map((s) => s.emotion);
      const finalConsensus = calculateMean(finalEmotions);

      const getDirection = (e: number) => {
        if (e > 20) return "strongly_bullish";
        if (e > 5) return "slightly_bullish";
        if (e < -20) return "strongly_bearish";
        if (e < -5) return "slightly_bearish";
        return "neutral";
      };

      sendEvent({
        type: "complete",
        final: {
          consensus: finalConsensus,
          direction: getDirection(finalConsensus),
          converged: roundHistory.length < rounds,
          total_rounds: roundHistory.length,
        },
        rounds: roundHistory,
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}