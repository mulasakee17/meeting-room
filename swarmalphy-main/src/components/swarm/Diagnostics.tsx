import type { SwarmResponse } from "@/lib/swarm/types";
import { AGENT_BY_ID } from "@/lib/swarm/agents";
import { beliefColor, SWARM_COLORS } from "@/lib/swarm/colors";

export function Diagnostics({ data }: { data: SwarmResponse["data"] }) {
  const d = data.diagnostics;
  const top = [...d.attribution].sort((a, b) => b.contributionPct - a.contributionPct);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {/* Attribution */}
      <Card title="贡献归因" subtitle="各 Agent 对最终共识的贡献占比">
        <div className="space-y-2.5">
          {top.map((a) => (
            <div key={a.agentId} className="flex items-center gap-3">
              <span className="w-6 text-lg">{a.emoji}</span>
              <span className="w-20 text-xs text-muted-foreground">{a.agentName}</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                <div
                  className="h-full"
                  style={{
                    width: `${a.contributionPct}%`,
                    backgroundColor: beliefColor(a.belief),
                  }}
                />
              </div>
              <span
                className="w-12 text-right font-mono text-xs tabular-nums"
                style={{ color: beliefColor(a.belief) }}
              >
                {a.contributionPct}%
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Coalition */}
      <Card title="联盟分析" subtitle={`力量比 ${d.coalition.powerRatio.toFixed(2)} · ${d.coalition.dominantCoalition}`}>
        <CoalitionBar
          bullishWeight={d.coalition.bullishCoalition.totalInfluence}
          bearishWeight={d.coalition.bearishCoalition.totalInfluence}
        />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <CoalitionList
            label="多头"
            color={SWARM_COLORS.bullish}
            ids={d.coalition.bullishCoalition.agentIds}
            weighted={d.coalition.bullishCoalition.weightedBelief}
          />
          <CoalitionList
            label="空头"
            color={SWARM_COLORS.bearish}
            ids={d.coalition.bearishCoalition.agentIds}
            weighted={d.coalition.bearishCoalition.weightedBelief}
          />
        </div>
        <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            紧张度
          </span>
          <div className="flex items-center gap-2">
            <div className="h-1 w-32 overflow-hidden rounded-full bg-white/[0.04]">
              <div
                className="h-full"
                style={{
                  width: `${d.coalition.tension}%`,
                  backgroundColor: SWARM_COLORS.polarization,
                }}
              />
            </div>
            <span className="font-mono text-xs tabular-nums text-foreground">
              {d.coalition.tension}
            </span>
          </div>
        </div>
      </Card>

      {/* Risk */}
      <Card title="风险因素" subtitle="诊断信号">
        <ul className="space-y-2">
          {d.summary.riskFactors.map((r, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-md border border-border bg-background/40 px-3 py-2 text-xs text-foreground"
            >
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Summary */}
      <Card title="诊断摘要" subtitle="自然语言综合分析">
        <Block label="核心发现" text={d.summary.coreFinding} />
        <Block label="共识机制" text={d.summary.consensusMechanism} />
        <Block label="盲区效应" text={d.summary.blindnessEffect} />
      </Card>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="lab-card p-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">{title}</div>
          {subtitle && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function CoalitionBar({
  bullishWeight,
  bearishWeight,
}: {
  bullishWeight: number;
  bearishWeight: number;
}) {
  const total = bullishWeight + bearishWeight || 1;
  const bullPct = (bullishWeight / total) * 100;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.04]">
      <div style={{ width: `${bullPct}%`, backgroundColor: SWARM_COLORS.bullish }} />
      <div
        style={{ width: `${100 - bullPct}%`, backgroundColor: SWARM_COLORS.bearish }}
      />
    </div>
  );
}

function CoalitionList({
  label,
  color,
  ids,
  weighted,
}: {
  label: string;
  color: string;
  ids: string[];
  weighted: number;
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="flex items-center justify-between">
        <span
          className="font-mono text-[10px] uppercase tracking-wider"
          style={{ color }}
        >
          {label}
        </span>
        <span
          className="font-mono text-xs tabular-nums"
          style={{ color }}
        >
          {weighted >= 0 ? "+" : ""}
          {weighted.toFixed(1)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {ids.length === 0 && (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {ids.map((id) => (
          <span key={id} className="text-base">
            {AGENT_BY_ID[id]?.emoji}
          </span>
        ))}
      </div>
    </div>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-foreground">{text}</div>
    </div>
  );
}
