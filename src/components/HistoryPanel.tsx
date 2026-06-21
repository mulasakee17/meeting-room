"use client";

import { useState, useEffect } from "react";
import { HistoryItem, getHistory, deleteHistoryItem, clearHistory } from "@/lib/utils/storage";

interface HistoryPanelProps {
  onSelectItem: (item: HistoryItem) => void;
}

export default function HistoryPanel({ onSelectItem }: HistoryPanelProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const handleDelete = (id: string) => {
    deleteHistoryItem(id);
    setHistory(getHistory());
  };

  const handleClear = () => {
    clearHistory();
    setHistory([]);
    setIsOpen(false);
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDirectionEmoji = (direction: string) => {
    switch (direction) {
      case "strongly_bullish": return "🚀";
      case "slightly_bullish": return "📈";
      case "neutral": return "⚖️";
      case "slightly_bearish": return "📉";
      case "strongly_bearish": return "💥";
      default: return "📊";
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors"
      >
        <span>📜</span>
        <span>历史记录</span>
        <span className="text-xs bg-zinc-900 px-2 py-0.5 rounded-full">{history.length}</span>
      </button>

      {isOpen && (
        <div className="absolute top-12 right-0 w-96 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 animate-slide-up">
          <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-zinc-200">推演历史</h3>
            {history.length > 0 && (
              <button
                onClick={handleClear}
                className="text-xs text-red-400 hover:text-red-300"
              >
                清空全部
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {history.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">
                <span className="text-4xl mb-2">📭</span>
                <p>暂无历史记录</p>
              </div>
            ) : (
              <div className="space-y-2 p-2">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="bg-zinc-800 hover:bg-zinc-700 rounded-lg p-3 cursor-pointer transition-colors group"
                    onClick={() => {
                      onSelectItem(item);
                      setIsOpen(false);
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm text-zinc-300 line-clamp-2">
                          {item.news}
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
                          <span>{formatDate(item.timestamp)}</span>
                          <span>|</span>
                          <span>{getDirectionEmoji(item.result.final.direction)} {item.result.final.consensus.toFixed(1)}</span>
                          <span>|</span>
                          <span>{item.result.final.total_rounds}轮</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}