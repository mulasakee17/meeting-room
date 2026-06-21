"use client";

interface ConsensusBadgeProps {
  final: {
    consensus: number;
    direction: string;
    converged: boolean;
    total_rounds: number;
  };
}

export default function ConsensusBadge({ final }: ConsensusBadgeProps) {
  const directionLabels: Record<string, { label: string; color: string; emoji: string }> = {
    strongly_bullish: { label: "强烈看多", color: "bg-emerald-500", emoji: "🚀" },
    slightly_bullish: { label: "略偏看多", color: "bg-emerald-400", emoji: "📈" },
    neutral: { label: "市场中立", color: "bg-yellow-500", emoji: "⚖️" },
    slightly_bearish: { label: "略偏看空", color: "bg-red-400", emoji: "📉" },
    strongly_bearish: { label: "强烈看空", color: "bg-red-500", emoji: "💥" },
  };

  const { label, color, emoji } = directionLabels[final.direction] || directionLabels.neutral;

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-zinc-300 mb-4">共识结果</h2>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 ${color} rounded-xl flex items-center justify-center text-3xl`}>
            {emoji}
          </div>
          <div>
            <div className="text-2xl font-bold text-zinc-100">{label}</div>
            <div className="text-zinc-500">
              共识值:{" "}
              <span className={final.consensus > 0 ? "text-emerald-400" : "text-red-400"}>
                {final.consensus > 0 ? "+" : ""}
                {final.consensus.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-sm px-3 py-1 rounded-full ${final.converged ? "bg-emerald-900/50 text-emerald-400" : "bg-yellow-900/50 text-yellow-400"}`}>
            {final.converged ? "✓ 已收敛" : "○ 未收敛"}
          </div>
          <div className="text-sm text-zinc-500 mt-2">共 {final.total_rounds} 轮</div>
        </div>
      </div>
    </div>
  );
}
