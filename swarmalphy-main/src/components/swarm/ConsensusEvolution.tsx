import type { SwarmResponse } from "@/lib/swarm/types";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,

} from "recharts";
import { SWARM_COLORS } from "@/lib/swarm/colors";

export function ConsensusEvolution({ data }: { data: SwarmResponse["data"] }) {
  const chartData = data.rounds.map((r) => ({
    round: `R${r.round}`,
    consensus: Number(r.consensus.toFixed(2)),
    beliefStd: Number(r.beliefStd.toFixed(2)),
    kuramoto: Number((r.kuramotoR * 100).toFixed(2)),
  }));

  return (
    <div className="lab-card p-6">
      <div className="mb-4 flex items-center gap-4">
        <Legend2 color={SWARM_COLORS.consensus} label="加权共识值" />
        <Legend2 color={SWARM_COLORS.polarization} label="信念标准差 σ" />
        <Legend2 color={SWARM_COLORS.fragility} label="Kuramoto r ×100" />
      </div>
      <div className="h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: -10 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="round"
              stroke="rgba(255,255,255,0.4)"
              tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.4)"
              tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f0f0f",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                fontFamily: "JetBrains Mono",
                fontSize: 12,
              }}
              cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }}
            />

            <Line
              type="monotone"
              dataKey="consensus"
              stroke={SWARM_COLORS.consensus}
              strokeWidth={2}
              dot={{ r: 3, fill: SWARM_COLORS.consensus }}
              activeDot={{ r: 5 }}
              isAnimationActive
            />
            <Line
              type="monotone"
              dataKey="beliefStd"
              stroke={SWARM_COLORS.polarization}
              strokeWidth={2}
              dot={{ r: 3, fill: SWARM_COLORS.polarization }}
              activeDot={{ r: 5 }}
              isAnimationActive
            />
            <Line
              type="monotone"
              dataKey="kuramoto"
              stroke={SWARM_COLORS.fragility}
              strokeWidth={2}
              dot={{ r: 3, fill: SWARM_COLORS.fragility }}
              activeDot={{ r: 5 }}
              isAnimationActive
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Legend2({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-3 rounded-sm" style={{ backgroundColor: color }} />
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
