"use client";

import React from "react";
import { personas } from "@/lib/agents/personas";
import { RoundData } from "@/types";
import AgentCard from "./AgentCard";

interface AgentPanelProps {
  rounds: RoundData[];
}

function AgentPanel({ rounds }: AgentPanelProps) {
  const lastRound = rounds[rounds.length - 1];

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-zinc-300 mb-4">Agent 状态面板</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {personas.map((persona) => (
          <AgentCard
            key={persona.id}
            persona={persona}
            currentEmotion={lastRound.agents[persona.id]?.emotion ?? 0}
          />
        ))}
      </div>
    </div>
  );
}

export default React.memo(AgentPanel);
