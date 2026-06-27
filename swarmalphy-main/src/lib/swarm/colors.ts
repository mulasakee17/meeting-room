export const SWARM_COLORS = {
  bullish: "#34d399",
  bearish: "#f87171",
  neutral: "#a1a1aa",
  consensus: "#60a5fa",
  polarization: "#fb923c",
  fragility: "#c084fc",
} as const;

export function beliefColor(b: number): string {
  if (b > 15) return SWARM_COLORS.bullish;
  if (b < -15) return SWARM_COLORS.bearish;
  return SWARM_COLORS.neutral;
}

export function metricColor(
  kind: "consensus" | "polarization" | "fragility",
  value: number,
): string {
  // value 0-100
  if (kind === "consensus") {
    if (value < 30) return "#ef4444";
    if (value < 60) return "#f59e0b";
    return "#34d399";
  }
  // polarization & fragility: high = bad
  if (value < 30) return "#34d399";
  if (value < 60) return "#f59e0b";
  return kind === "polarization" ? "#f87171" : "#a855f7";
}

export function directionColor(d: string): string {
  if (d === "UP") return SWARM_COLORS.bullish;
  if (d === "DOWN") return SWARM_COLORS.bearish;
  return SWARM_COLORS.neutral;
}

export function impactColor(impact: string): string {
  switch (impact) {
    case "CRITICAL":
      return "#f87171";
    case "SIGNIFICANT":
      return "#fb923c";
    case "MODERATE":
      return "#facc15";
    default:
      return "#a1a1aa";
  }
}
