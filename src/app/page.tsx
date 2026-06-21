"use client";

import { useState } from "react";
import NewsInput from "@/components/NewsInput";
import AgentPanel from "@/components/AgentPanel";
import EmotionChart from "@/components/EmotionChart";
import RadarChart from "@/components/RadarChart";
import GameLog from "@/components/GameLog";
import ConsensusBadge from "@/components/ConsensusBadge";
import HistoryPanel from "@/components/HistoryPanel";
import ModelSelector from "@/components/ModelSelector";
import { saveToHistory, HistoryItem } from "@/lib/utils/storage";
import { LLMProvider, SwarmResult } from "@/types";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SwarmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | undefined>(undefined);
  const [llmConfig, setLlmConfig] = useState<{ provider: LLMProvider; model: string }>({
    provider: "deepseek",
    model: "deepseek-chat",
  });

  const handleSubmit = async (news: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedRound(undefined);

    try {
      const res = await fetch("/api/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ news, rounds: 5, llmConfig }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "推演失败");
      
      const swarmResult = data.data as SwarmResult;
      setResult(swarmResult);
      saveToHistory(swarmResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
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
          <p className="text-zinc-500 mt-2">金融多智能体共识推演沙盒</p>
        </div>
        <div className="flex items-center gap-4">
          <ModelSelector onModelChange={handleModelChange} />
          <HistoryPanel onSelectItem={handleSelectHistory} />
        </div>
      </header>

      <div className="space-y-8">
        <NewsInput onSubmit={handleSubmit} loading={loading} />

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-red-400">
            {error}
          </div>
        )}

        {result && (
          <>
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