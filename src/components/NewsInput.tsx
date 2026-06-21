"use client";

import { useState } from "react";

interface NewsInputProps {
  onSubmit: (news: string) => void;
  loading: boolean;
}

export default function NewsInput({ onSubmit, loading }: NewsInputProps) {
  const [news, setNews] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (news.trim() && !loading) {
      onSubmit(news.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
      <label className="block text-sm font-medium text-zinc-400 mb-2">
        📰 输入金融新闻
      </label>
      <textarea
        value={news}
        onChange={(e) => setNews(e.target.value)}
        placeholder="例如：比特币ETF获批点燃市场热情，机构资金大幅流入..."
        className="w-full h-32 bg-black/50 border border-zinc-700 rounded-lg p-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
        disabled={loading}
      />
      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={loading || !news.trim()}
          className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⚙️</span>
              推演中...
            </span>
          ) : (
            "开始推演"
          )}
        </button>
      </div>
    </form>
  );
}
