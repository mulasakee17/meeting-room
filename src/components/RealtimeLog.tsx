"use client";

import { useState, useEffect, useRef } from "react";
import { personas } from "@/lib/agents/personas";

interface StreamEvent {
  type: string;
  [key: string]: any;
}

interface RealtimeLogProps {
  news: string;
  onComplete: (data: any) => void;
}

export default function RealtimeLog({ news, onComplete }: RealtimeLogProps) {
  const [logs, setLogs] = useState<StreamEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!news) return;

    setLogs([]);
    setIsStreaming(true);

    fetch("/api/swarm/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ news, rounds: 5 }),
    })
      .then((response) => {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) throw new Error("No reader");

        const processStream = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n\n").filter((line) => line.startsWith("data: "));

            for (const line of lines) {
              const data = JSON.parse(line.replace("data: ", ""));
              setLogs((prev) => [...prev, data]);

              if (data.type === "complete") {
                setIsStreaming(false);
                onComplete(data);
              }
            }
          }
        };

        processStream().catch(() => setIsStreaming(false));
      })
      .catch(() => setIsStreaming(false));
  }, [news]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const getLogColor = (type: string) => {
    switch (type) {
      case "start": return "text-cyan-400";
      case "round_start": return "text-emerald-400";
      case "agent_thinking": return "text-zinc-500";
      case "agent_result": return "text-yellow-400";
      case "round_complete": return "text-purple-400";
      case "converged": return "text-emerald-500 font-bold";
      case "complete": return "text-cyan-500 font-bold";
      default: return "text-zinc-400";
    }
  };

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-300">实时博弈日志</h2>
        {isStreaming && (
          <div className="flex items-center gap-2 text-emerald-400">
            <span className="animate-spin">⚙️</span>
            <span className="text-sm">推演中...</span>
          </div>
        )}
      </div>
      <div
        ref={logContainerRef}
        className="space-y-2 max-h-96 overflow-y-auto font-mono text-sm"
      >
        {logs.map((log, idx) => (
          <div key={idx} className={`${getLogColor(log.type)} border-l-2 pl-3`} style={{ borderColor: log.type === "agent_result" ? personas.find(p => p.id === log.agentId)?.color || "#333" : "#333" }}>
            {log.type === "start" && (
              <span>🎬 开始推演: {log.news.slice(0, 50)}...</span>
            )}
            {log.type === "round_start" && (
              <span>🔄 Round {log.round} 开始</span>
            )}
            {log.type === "agent_thinking" && (
              <span>💭 {log.emoji} {log.agentName} 正在思考...</span>
            )}
            {log.type === "agent_result" && (
              <span>
                {log.emoji} {log.agentName}: <strong>{log.emotion > 0 ? "+" : ""}{log.emotion}</strong> - {log.reasoning}
              </span>
            )}
            {log.type === "round_complete" && (
              <span>✅ Round {log.round} 完成 | 共识: {log.consensus.toFixed(1)} | 方差: {log.variance.toFixed(1)}</span>
            )}
            {log.type === "converged" && (
              <span>🎯 在 Round {log.round} 达成共识！</span>
            )}
            {log.type === "complete" && (
              <span>🎉 推演完成！最终共识: {log.final.consensus.toFixed(1)} ({log.final.direction})</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}