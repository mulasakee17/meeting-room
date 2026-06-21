"use client";

import { Persona } from "@/types";
import React from "react";

interface AgentCardProps {
  persona: Persona;
  currentEmotion: number;
}

function AgentCard({ persona, currentEmotion }: AgentCardProps) {
  const getEmotionColor = (emotion: number) => {
    if (emotion > 20) return "text-emerald-400";
    if (emotion < -20) return "text-red-400";
    return "text-yellow-400";
  };

  return (
    <div className="bg-black/50 border border-zinc-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{persona.emoji}</span>
        <div>
          <div className="font-semibold text-zinc-200">{persona.name}</div>
          <div className="text-xs text-zinc-500">{persona.role}</div>
        </div>
      </div>
      <div className={`text-3xl font-bold ${getEmotionColor(currentEmotion)}`}>
        {currentEmotion > 0 ? "+" : ""}
        {currentEmotion}
      </div>
      <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.abs(currentEmotion) / 2}%`,
            marginLeft: currentEmotion < 0 ? "auto" : `${50}%`,
            backgroundColor: persona.color,
          }}
        />
      </div>
    </div>
  );
}

export default React.memo(AgentCard);
