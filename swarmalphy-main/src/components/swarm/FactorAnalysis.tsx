import type { FactorVector } from "@/lib/swarm/types";
import { motion } from "framer-motion";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

const LABELS: Record<string, { name: string; en: string }> = {
  liquidity: { name: "流动性", en: "Liquidity" },
  policy: { name: "政策", en: "Policy" },
  fundamental: { name: "基本面", en: "Fundamental" },
  narrative: { name: "叙事", en: "Narrative" },
  uncertainty: { name: "不确定性", en: "Uncertainty" },
};

export function FactorAnalysis({ data }: { data: FactorVector }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
      {data.factors.map((f, i) => (
        <FactorCard key={f.category} index={i} factor={f} />
      ))}
    </div>
  );
}

function FactorCard({
  index,
  factor,
}: {
  index: number;
  factor: FactorVector["factors"][number];
}) {
  const [open, setOpen] = useState(false);
  const isUncertainty = factor.category === "uncertainty";
  const range = isUncertainty ? [0, 100] : [-100, 100];
  const pct = ((factor.value - range[0]) / (range[1] - range[0])) * 100;
  const positive = factor.value >= 0;
  const color = isUncertainty
    ? "var(--color-fragility)"
    : positive
      ? "var(--color-bullish)"
      : "var(--color-bearish)";

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      onClick={() => setOpen((o) => !o)}
      className="lab-card flex flex-col gap-3 p-5 text-left transition-colors hover:border-foreground/20"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {LABELS[factor.category]?.en}
          </div>
          <div className="text-sm font-medium text-foreground">
            {LABELS[factor.category]?.name}
          </div>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </div>

      <div className="flex items-baseline gap-2">
        <span
          className="font-mono text-3xl font-semibold tabular-nums"
          style={{ color }}
        >
          {factor.value >= 0 && !isUncertainty ? "+" : ""}
          {factor.value}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          conf {factor.confidence}
        </span>
      </div>

      <div className="relative h-1 overflow-hidden rounded-full bg-white/[0.04]">
        {!isUncertainty && (
          <div className="absolute top-0 bottom-0 w-px bg-white/20" style={{ left: "50%" }} />
        )}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="absolute top-0 bottom-0 left-0"
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}80` }}
        />
      </div>

      {open && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {factor.evidence}
        </motion.p>
      )}
    </motion.button>
  );
}
