import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { SwarmResponse } from "@/lib/swarm/types";
import { useSwarmStore } from "@/lib/swarm/store";
import { beliefColor } from "@/lib/swarm/colors";
import { AGENT_BY_ID } from "@/lib/swarm/agents";

export function AgentDrawer({ data }: { data: SwarmResponse["data"] }) {
  const selectedAgentId = useSwarmStore((s) => s.selectedAgentId);
  const selectAgent = useSwarmStore((s) => s.selectAgent);
  const open = !!selectedAgentId;
  const agent = selectedAgentId ? AGENT_BY_ID[selectedAgentId] : null;
  const attribution = data.diagnostics.attribution.find(
    (a) => a.agentId === selectedAgentId,
  );
  const beliefShift =
    data.v9_5.interaction?.beliefShift?.[selectedAgentId ?? ""] ?? 0;
  const finalRound = data.rounds[data.rounds.length - 1];
  const state = selectedAgentId ? finalRound.agents[selectedAgentId] : null;
  const profile = data.v9_5.interaction?.socialProfiles.find(
    (p) => p.agentId === selectedAgentId,
  );
  const history = data.rounds.map((r) => ({
    round: r.round,
    belief: r.agents[selectedAgentId ?? ""]?.belief ?? 0,
  }));

  return (
    <Sheet open={open} onOpenChange={(o) => !o && selectAgent(null)}>
      <SheetContent className="w-[460px] border-border bg-card sm:max-w-[460px]">
        {agent && state && attribution && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3">
                <span className="text-3xl">{agent.emoji}</span>
                <div>
                  <div className="text-lg font-semibold">{agent.name}</div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {agent.role}
                  </div>
                </div>
              </SheetTitle>
            </SheetHeader>

            <div className="mt-6 space-y-5">
              <div className="grid grid-cols-3 gap-2">
                <Stat
                  label="信念值"
                  value={`${state.belief >= 0 ? "+" : ""}${state.belief.toFixed(1)}`}
                  color={beliefColor(state.belief)}
                />
                <Stat label="置信度" value={`${state.confidence}`} />
                <Stat label="影响力" value={attribution.influenceWeight.toFixed(2)} />
              </div>

              <Section title="可见因子">
                <div className="flex flex-wrap gap-1.5">
                  {state.visibleFactors.map((f) => (
                    <span
                      key={f}
                      className="rounded border border-border bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </Section>

              <Section title="共识贡献">
                <div className="flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                    <div
                      className="h-full"
                      style={{
                        width: `${attribution.contributionPct}%`,
                        backgroundColor: beliefColor(state.belief),
                      }}
                    />
                  </div>
                  <span className="font-mono text-sm tabular-nums text-foreground">
                    {attribution.contributionPct}%
                  </span>
                </div>
                <div className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                  净贡献 {attribution.contribution.toFixed(1)} · 信念偏移{" "}
                  {beliefShift >= 0 ? "+" : ""}
                  {beliefShift.toFixed(1)}
                </div>
              </Section>

              {profile && (
                <Section title="社会连接">
                  <div className="font-mono text-[11px] text-muted-foreground">
                    α = {profile.alpha.toFixed(2)} · 可见 {profile.visibleAgentIds.length} 个 Agent
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {profile.visibleAgentIds.map((id) => (
                      <span
                        key={id}
                        className="flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-xs"
                      >
                        <span>{AGENT_BY_ID[id]?.emoji}</span>
                        <span className="text-muted-foreground">{AGENT_BY_ID[id]?.name}</span>
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              <Section title="信念轨迹">
                <div className="flex items-end gap-1.5">
                  {history.map((h) => {
                    const pct = Math.abs(h.belief);
                    return (
                      <div key={h.round} className="flex flex-1 flex-col items-center gap-1">
                        <div
                          className="w-full rounded-sm"
                          style={{
                            height: `${4 + pct * 0.7}px`,
                            backgroundColor: beliefColor(h.belief),
                          }}
                        />
                        <span className="font-mono text-[9px] text-muted-foreground">
                          R{h.round}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Section>

              <Section title="解读">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {state.interpretation}
                </p>
              </Section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className="mt-0.5 font-mono text-lg font-semibold tabular-nums"
        style={{ color: color ?? "var(--color-foreground)" }}
      >
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}
