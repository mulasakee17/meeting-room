import type { V9_5Data, FinalDecision } from "@/lib/swarm/types";
import { RingGauge } from "./RingGauge";
import { ParticleBackground } from "./ParticleBackground";
import { directionColor, metricColor } from "@/lib/swarm/colors";
import { motion, AnimatePresence } from "framer-motion";
import { useSwarmStore } from "@/lib/swarm/store";

interface LiveDashboardProps {
  metrics: V9_5Data["metrics"];
  final: FinalDecision;
}

export function LiveDashboard({ metrics, final }: LiveDashboardProps) {
  const dColor = directionColor(final.direction);
  const streaming = useSwarmStore((s) => s.streaming);
  const progress = useSwarmStore((s) => s.progress);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,1.1fr]">
      {/* 左侧: 三个环形仪表 + 粒子背景 */}
      <div className="lab-card relative overflow-hidden p-8">
        <ParticleBackground active={streaming} />

        <div className="relative z-10 mb-6 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>实时共识指标</span>
          {streaming && progress && (
            <motion.span
              key={`${progress.current}-${progress.total}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1.5 text-emerald-400"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="tabular-nums">
                R{progress.current}/{progress.total}
              </span>
            </motion.span>
          )}
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-6">
          <RingGauge
            value={metrics.consensusScore}
            label="共识度"
            sublabel="Consensus"
            color={metricColor("consensus", metrics.consensusScore)}
            size={190}
          />
          <RingGauge
            value={metrics.polarizationScore}
            label="极化度"
            sublabel="Polarization"
            color={metricColor("polarization", metrics.polarizationScore)}
            size={190}
          />
          <RingGauge
            value={metrics.fragilityScore}
            label="脆弱性"
            sublabel="Fragility"
            color={metricColor("fragility", metrics.fragilityScore)}
            size={190}
          />
        </div>

        {streaming && progress && (
          <div className="relative z-10 mt-6">
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.04]">
              <motion.div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300"
                initial={{ width: "0%" }}
                animate={{
                  width: `${(progress.current / Math.max(1, progress.total)) * 100}%`,
                }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                style={{ boxShadow: "0 0 16px rgba(52, 211, 153, 0.5)" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 右侧: 共识决策 */}
      <div className="lab-card relative flex flex-col overflow-hidden p-8">
        <ParticleBackground active={streaming} />

        <div className="relative z-10 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          群体决策
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`${final.direction}-${final.consensus.toFixed(0)}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 mt-6 flex items-center gap-5"
          >
            {/* 方向标识 */}
            <motion.div
              animate={{
                boxShadow: [
                  `0 0 30px ${dColor}30`,
                  `0 0 50px ${dColor}50`,
                  `0 0 30px ${dColor}30`,
                ],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="flex h-24 w-24 items-center justify-center rounded-2xl border font-mono text-2xl font-bold tracking-tight"
              style={{
                color: dColor,
                borderColor: dColor + "55",
                backgroundColor: dColor + "12",
              }}
            >
              {final.direction}
            </motion.div>

            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                加权共识值
              </div>
              <motion.div
                key={final.consensus.toFixed(1)}
                initial={{ scale: 1.15, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="mt-1 font-mono text-5xl font-semibold tabular-nums"
                style={{ color: dColor }}
              >
                {final.consensus >= 0 ? "+" : ""}
                {final.consensus.toFixed(1)}
              </motion.div>
              <div className="mt-2 flex gap-5 font-mono text-xs text-muted-foreground">
                <span>
                  置信度{" "}
                  <span className="text-foreground">{final.confidence}</span>
                </span>
                <span>
                  σ{" "}
                  <span className="text-foreground">
                    {final.beliefStd.toFixed(1)}
                  </span>
                </span>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="relative z-10 mt-6 rounded-md border border-border bg-background/40 p-4">
          <motion.div
            key={metrics.stateLabel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="mb-2 flex items-center gap-2"
          >
            <span className="text-xl">{metrics.stateLabel.split(" ")[0]}</span>
            <span className="text-sm font-medium text-foreground">
              {metrics.stateLabel.split(" ").slice(1).join(" ")}
            </span>
          </motion.div>
          <div className="text-sm leading-relaxed text-muted-foreground">
            {metrics.stateInterpretation}
          </div>
        </div>
      </div>
    </div>
  );
}
