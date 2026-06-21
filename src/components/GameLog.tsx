"use client";

import { RoundData } from "@/types";

interface GameLogProps {
  rounds: RoundData[];
}

export default function GameLog({ rounds }: GameLogProps) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-zinc-300 mb-4">博弈日志</h2>
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {rounds.map((round) => (
          <div key={round.round} className="border-l-2 border-zinc-700 pl-4">
            <div className="text-sm font-medium text-emerald-400 mb-2">
              Round {round.round}
            </div>
            {Object.entries(round.agents).map(([agentId, state]) => (
              <div key={agentId} className="text-sm text-zinc-400 mb-1">
                <span className="text-zinc-300 font-medium">{agentId}:</span>{" "}
                <span className={state.emotion > 0 ? "text-emerald-400" : "text-red-400"}>
                  {state.emotion > 0 ? "+" : ""}
                  {state.emotion}
                </span>{" "}
                - {state.reasoning}
              </div>
            ))}
            <div className="text-xs text-zinc-600 mt-2">
              共识值: {round.consensus.toFixed(1)} | 方差: {round.variance.toFixed(1)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
