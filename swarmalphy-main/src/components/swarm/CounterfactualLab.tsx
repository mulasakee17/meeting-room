import type { SwarmResponse } from "@/lib/swarm/types";
import { impactColor, directionColor } from "@/lib/swarm/colors";
import { motion } from "framer-motion";
import { Beaker } from "lucide-react";

export function CounterfactualLab({ data }: { data: SwarmResponse["data"] }) {
  const { variants, baselineConsensus, agentsToFlip, mostInfluentialAgent } =
    data.diagnostics.counterfactuals;

  return (
    <div className="space-y-4">
      <div className="lab-card flex items-center gap-6 px-6 py-4">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <Beaker className="h-3.5 w-3.5" />
          基准线
        </div>
        <Stat label="当前共识" value={baselineConsensus.toFixed(1)} />
        <Stat label="翻转所需 Agent 数" value={String(agentsToFlip)} />
        <Stat label="最具影响力" value={mostInfluentialAgent || "—"} mono />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {variants.map((v, i) => {
          const color = impactColor(v.impact);
          const dColor = directionColor(v.direction);
          return (
            <motion.button
              key={v.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="lab-card flex flex-col gap-3 p-5 text-left transition-colors hover:border-foreground/20"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">{v.label}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {v.description}
                  </div>
                </div>
                <span
                  className="rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                  style={{ borderColor: color + "55", color, backgroundColor: color + "12" }}
                >
                  {v.impact}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Mini label="共识" value={v.consensus.toFixed(1)} />
                <Mini
                  label="Δ"
                  value={`${v.deltaConsensus >= 0 ? "+" : ""}${v.deltaConsensus.toFixed(1)}`}
                  color={color}
                />
                <Mini
                  label="方向"
                  value={v.direction}
                  color={dColor}
                  mono
                />
              </div>

              {v.directionFlipped && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-destructive">
                  方向已翻转
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-0.5 text-sm font-semibold tabular-nums text-foreground ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  color,
  mono,
}: {
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-0.5 text-sm font-semibold tabular-nums ${mono ? "font-mono" : ""}`}
        style={{ color: color ?? "var(--color-foreground)" }}
      >
        {value}
      </div>
    </div>
  );
}
