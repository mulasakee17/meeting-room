"use client";

import { useState } from "react";
import NewsInput from "@/components/NewsInput";
import AgentPanel from "@/components/AgentPanel";
import EmotionChart from "@/components/EmotionChart";
import RadarChart from "@/components/RadarChart";
import GameLog from "@/components/GameLog";
import ConsensusBadge from "@/components/ConsensusBadge";
import ConsensusDashboard from "@/components/ConsensusDashboard";
import HistoryPanel from "@/components/HistoryPanel";
import ModelSelector from "@/components/ModelSelector";
import { saveToHistory, HistoryItem } from "@/lib/utils/storage";
import { LLMProvider, SwarmResult } from "@/types";

interface V9_5Data {
  interaction?: {
    totalRounds: number;
    convergenceType: string;
    rounds: Array<{
      round: number;
      beliefs: Record<string, number>;
      beliefChanges: Record<string, number>;
      meanBelief: number;
      beliefStd: number;
      converged: boolean;
    }>;
    beliefShift: Record<string, number>;
    consensusFormed: boolean;
    polarizationIncreased: boolean;
    socialProfiles: Array<{
      agentId: string;
      alpha: number;
      visibleAgentIds: string[];
    }>;
  } | null;
  metrics: {
    consensusScore: number;
    polarizationScore: number;
    fragilityScore: number;
    stateLabel: string;
    stateInterpretation: string;
  };
  comparison?: {
    consensusShift: number;
    stdChange: number;
    effect: string;
    description: string;
  } | null;
  timeline?: Array<{
    sequenceIndex: number;
    news: string;
    consensusScore: number;
    polarizationScore: number;
    fragilityScore: number;
    consensus: number;
    direction: string;
    beliefStd: number;
  }> | null;
  /** 🆕 v9.5.2: 动态权重调整 */
  dynamicWeights?: {
    enabled: boolean;
    activeModes: string[];
    modeDetails: {
      panic: { triggered: boolean; reasons: string[] };
      policy: { triggered: boolean; reasons: string[] };
      value: { triggered: boolean; reasons: string[] };
    };
    adjustments: Record<string, {
      agentId: string;
      agentName: string;
      emoji: string;
      baseWeight: number;
      multiplier: number;
      finalWeight: number;
      contributingModes: string[];
      reason: string;
    }>;
    /** 动态权重下的共识值 (与静态共识对比) */
    dynamicConsensus?: number;
  };
}

interface V9_5AgentInfo {
  id: string;
  name: string;
  emoji: string;
  role: string;
}

interface V9Response {
  news: string;
  rounds: Array<{
    round: number;
    consensus: number;
    direction: string;
    confidence: number;
    beliefStd: number;
    neutralTrace?: any;
    agents: Record<string, {
      belief: number;
      confidence: number;
      visibleFactors?: string[];
      interpretation?: string;
    }>;
  }>;
  final: {
    consensus: number;
    direction: string;
    confidence: number;
    beliefStd: number;
    neutralTrace?: any;
  };
  diagnostics?: any;
  v9_5?: V9_5Data;
  v9_5Agents?: V9_5AgentInfo[];
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [sequentialLoading, setSequentialLoading] = useState(false);
  const [result, setResult] = useState<SwarmResult | null>(null);
  const [v9_5, setV9_5] = useState<V9_5Data | null>(null);
  const [v9_5Agents, setV9_5Agents] = useState<V9_5AgentInfo[] | null>(null);
  const [v9Final, setV9Final] = useState<V9Response["final"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | undefined>(undefined);
  const [timelineData, setTimelineData] = useState<V9_5Data["timeline"] | null>(null);
  const [llmConfig, setLlmConfig] = useState<{ provider: LLMProvider; model: string }>({
    provider: "deepseek",
    model: "deepseek-chat",
  });

  const handleSubmit = async (news: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setV9_5(null);
    setV9_5Agents(null);
    setV9Final(null);
    setSelectedRound(undefined);

    try {
      const res = await fetch("/api/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: "v9", news, rounds: 3, llmConfig }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "推演失败");

      // v9.5 response
      if (data.version === "v9.5") {
        const v9Data = data.data as V9Response;
        // 转换为兼容 SwarmResult 格式
        const compatResult: SwarmResult = {
          news: v9Data.news,
          rounds: v9Data.rounds.map(r => ({
            round: r.round,
            agents: Object.fromEntries(
              Object.entries(r.agents).map(([id, state]) => [
                id,
                {
                  emotion: state.belief,
                  reasoning: state.interpretation || "",
                  conviction: state.confidence,
                  id,
                },
              ])
            ),
            consensus: r.consensus,
            variance: 0,
          })),
          final: {
            consensus: v9Data.final.consensus,
            direction: v9Data.final.direction.toLowerCase().includes("up") ? "slightly_bullish"
              : v9Data.final.direction.toLowerCase().includes("down") ? "slightly_bearish"
              : "neutral",
            converged: true,
            total_rounds: v9Data.rounds.length,
          },
        };
        setResult(compatResult);
        setV9_5(v9Data.v9_5 || null);
        setV9_5Agents(v9Data.v9_5Agents || null);
        setV9Final(v9Data.final);
        if (v9Data.v9_5?.timeline) setTimelineData(v9Data.v9_5.timeline);
        saveToHistory(compatResult);
      } else {
        // 旧版 fallback
        const swarmResult = data.data as SwarmResult;
        setResult(swarmResult);
        saveToHistory(swarmResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  // 🆕 v9.5.1: 连续推演 3 天
  const handleSequentialSubmit = async (news: string) => {
    setSequentialLoading(true);
    setError(null);
    setResult(null);
    setV9_5(null);
    setV9_5Agents(null);
    setV9Final(null);
    setTimelineData(null);

    const sessionId = String(Date.now());
    const variants = [
      news,
      news + "，市场开始消化预期",
      news + "，机构开始重新定价",
    ];

    try {
      let lastData: any = null;
      for (let i = 0; i < variants.length; i++) {
        const res = await fetch("/api/swarm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: "v9",
            news: variants[i],
            rounds: 2,
            llmConfig,
            sessionId,
            sequenceIndex: i,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Day ${i + 1} 推演失败`);
        lastData = data;
      }

      // 使用最后一次响应的完整数据 + 时间线
      if (lastData && lastData.version === "v9.5") {
        const v9Data = lastData.data as V9Response;
        const compatResult: SwarmResult = {
          news: v9Data.news,
          rounds: v9Data.rounds.map(r => ({
            round: r.round,
            agents: Object.fromEntries(
              Object.entries(r.agents).map(([id, state]) => [id, {
                emotion: state.belief,
                reasoning: state.interpretation || "",
                conviction: state.confidence,
                id,
              }])
            ),
            consensus: r.consensus,
            variance: 0,
          })),
          final: {
            consensus: v9Data.final.consensus,
            direction: v9Data.final.direction.toLowerCase().includes("up") ? "slightly_bullish"
              : v9Data.final.direction.toLowerCase().includes("down") ? "slightly_bearish"
              : "neutral",
            converged: true,
            total_rounds: v9Data.rounds.length,
          },
        };
        setResult(compatResult);
        setV9_5(v9Data.v9_5 || null);
        setV9_5Agents(v9Data.v9_5Agents || null);
        setV9Final(v9Data.final);
        if (v9Data.v9_5?.timeline) setTimelineData(v9Data.v9_5.timeline);
        saveToHistory(compatResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setSequentialLoading(false);
    }
  };

  const handleSelectHistory = (item: HistoryItem) => {
    setResult(item.result);
    setSelectedRound(undefined);
  };

  const handleModelChange = (provider: LLMProvider, model: string) => {
    setLlmConfig({ provider, model });
  };

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto">
      <header className="mb-12 flex items-center justify-between">
        <div className="text-center flex-1">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            🐜 SwarmAlpha
          </h1>
          <p className="text-zinc-500 mt-2">Financial Collective Intelligence Laboratory</p>
        </div>
        <div className="flex items-center gap-4">
          <ModelSelector onModelChange={handleModelChange} />
          <HistoryPanel onSelectItem={handleSelectHistory} />
        </div>
      </header>

      <div className="space-y-8">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <NewsInput
              onSubmit={(news: string) => {
                handleSubmit(news);
                // Store for sequential demo
                (window as any).__lastNews = news;
              }}
              loading={loading || sequentialLoading}
            />
          </div>
          <button
            onClick={() => {
              const news = (window as any).__lastNews;
              if (news) handleSequentialSubmit(news);
            }}
            disabled={sequentialLoading || !(window as any).__lastNews}
            className="px-5 py-3 rounded-xl text-sm font-semibold transition-all bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {sequentialLoading ? "⏳ 推演中..." : "📈 连续推演 3 天"}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-red-400">
            {error}
          </div>
        )}

        {result && (
          <>
            {/* ── v9.5: 共识度量仪表盘 (在 Agent 卡片上方) ── */}
            {v9_5 && (
              <div className="animate-slide-up">
                <ConsensusDashboard
                  metrics={v9_5.metrics}
                  interactionRounds={v9_5.interaction?.rounds}
                  socialProfiles={v9_5.interaction?.socialProfiles}
                  comparison={v9_5.comparison ?? undefined}
                  agents={v9_5Agents ?? undefined}
                  finalConsensus={v9Final?.consensus}
                  finalDirection={v9Final?.direction}
                  timeline={timelineData ?? v9_5.timeline ?? undefined}
                  dynamicWeights={v9_5.dynamicWeights}
                />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-slide-up">
              <div className="space-y-6">
                <AgentPanel rounds={result.rounds} />
                <ConsensusBadge final={result.final} />
              </div>
              <div className="lg:col-span-2 space-y-6">
                <EmotionChart rounds={result.rounds} />
                <RadarChart rounds={result.rounds} selectedRound={selectedRound} />
              </div>
            </div>

            <div className="flex justify-center gap-2 animate-slide-up">
              <span className="text-zinc-500 text-sm">选择轮次：</span>
              {result.rounds.map((r) => (
                <button
                  key={r.round}
                  onClick={() => setSelectedRound(r.round)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    (selectedRound ?? result.rounds.length) === r.round
                      ? "bg-gradient-to-r from-emerald-500 to-cyan-500 text-black"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  Round {r.round}
                </button>
              ))}
            </div>

            <GameLog rounds={result.rounds} />
          </>
        )}
      </div>
    </main>
  );
}