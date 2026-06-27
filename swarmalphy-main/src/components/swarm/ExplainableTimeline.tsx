import { useState } from "react";
import type { SwarmResponse } from "@/lib/swarm/types";
import { ChevronRight } from "lucide-react";
import { beliefColor } from "@/lib/swarm/colors";
import { motion } from "framer-motion";

export function ExplainableTimeline({ data }: { data: SwarmResponse["data"] }) {
  const [openId, setOpenId] = useState<string | null>(data.v9_5Agents[0]?.id ?? null);

  return (
    <div className="lab-card divide-y divide-border">
      {data.v9_5Agents.map((a) => {
        const isOpen = openId === a.id;
        const initial = data.rounds[0].agents[a.id]?.belief ?? 0;
        const final = data.rounds[data.rounds.length - 1].agents[a.id]?.belief ?? 0;
        const delta = final - initial;
        return (
          <div key={a.id}>
            <button
              onClick={() => setOpenId(isOpen ? null : a.id)}
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
            >
              <ChevronRight
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                  isOpen ? "rotate-90" : ""
                }`}
              />
              <span className="text-xl">{a.emoji}</span>
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">{a.name}</div>
                <div className="text-[11px] text-muted-foreground">{a.role}</div>
              </div>
              <div className="flex items-center gap-3 font-mono text-xs">
                <span className="text-muted-foreground">
                  初始{" "}
                  <span style={{ color: beliefColor(initial) }}>
                    {initial.toFixed(0)}
                  </span>
                </span>
                <span className="text-muted-foreground">→</span>
                <span className="text-muted-foreground">
                  最终{" "}
                  <span style={{ color: beliefColor(final) }}>
                    {final >= 0 ? "+" : ""}
                    {final.toFixed(0)}
                  </span>
                </span>
                <span
                  className="rounded border border-border px-1.5 py-0.5 tabular-nums"
                  style={{ color: beliefColor(delta) }}
                >
                  Δ {delta >= 0 ? "+" : ""}
                  {delta.toFixed(1)}
                </span>
              </div>
            </button>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="overflow-hidden"
              >
                <div className="space-y-0 px-12 pb-6">
                  {data.rounds.map((r, i) => {
                    const state = r.agents[a.id];
                    if (!state) return null;
                    return (
                      <div key={i} className="relative pl-6">
                        <div className="absolute left-1.5 top-2 h-2 w-2 rounded-full border border-foreground/30 bg-background" />
                        {i < data.rounds.length - 1 && (
                          <div className="absolute left-[10px] top-4 bottom-0 w-px bg-border" />
                        )}
                        <div className="pb-5">
                          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            第 {r.round} 轮
                          </div>
                          <div className="mt-1 flex items-center gap-3">
                            <span
                              className="font-mono text-lg font-semibold tabular-nums"
                              style={{ color: beliefColor(state.belief) }}
                            >
                              {state.belief >= 0 ? "+" : ""}
                              {state.belief.toFixed(1)}
                            </span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              置信 {state.confidence}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {state.visibleFactors.map((f) => (
                                <span
                                  key={f}
                                  className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
                                >
                                  {f}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="mt-1.5 text-xs text-muted-foreground">
                            {state.interpretation}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="relative pl-6">
                    <div
                      className="absolute left-0.5 top-2 h-3 w-3 rounded-full border-2"
                      style={{ borderColor: beliefColor(final), backgroundColor: "var(--background)" }}
                    />
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      最终决策
                    </div>
                    <div
                      className="font-mono text-base font-semibold"
                      style={{ color: beliefColor(final) }}
                    >
                      {data.final.direction} · 加权 {data.final.consensus.toFixed(1)}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        );
      })}
    </div>
  );
}
