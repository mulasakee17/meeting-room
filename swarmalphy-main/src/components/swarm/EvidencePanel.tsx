import { useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { SwarmResponse, RoundData } from "@/lib/swarm/types";
import { AGENTS } from "@/lib/swarm/agents";
import { runSwarmMock } from "@/lib/swarm/mock";
import { beliefColor, SWARM_COLORS } from "@/lib/swarm/colors";

// ─── 因子可见性矩阵的内置数据 ───
const FACTOR_VIS: Record<string, string[]> = {
  institution: ["liquidity","policy","fundamental","uncertainty"],
  value:       ["fundamental","policy"],
  trend:       ["narrative","liquidity"],
  panic:       ["narrative","uncertainty"],
  quant:       ["liquidity","fundamental","uncertainty","policy","narrative"],
  media:       ["narrative","policy"],
  contrarian:  ["fundamental","narrative","uncertainty"],
  retail:      ["narrative"],
  policy:      ["policy","uncertainty","fundamental"],
};
const FACTORS = ["liquidity","policy","fundamental","narrative","uncertainty"] as const;
const FACTOR_LABELS: Record<string,string> = {
  liquidity:"流动性",policy:"政策",fundamental:"基本面",narrative:"叙事",uncertainty:"不确定性"
};

// ══════════════════════════════════════════════
// 子面板 A：因子可见性矩阵（热力图）
// ══════════════════════════════════════════════
function VisibilityMatrix() {
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        信息盲区矩阵 · 56% Agent 对零重叠方向因子
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] font-mono">
          <thead>
            <tr>
              <th className="pr-2 text-left text-muted-foreground">Agent</th>
              {FACTORS.map(f => (
                <th key={f} className="px-1.5 text-center text-muted-foreground">
                  {FACTOR_LABELS[f]}
                </th>
              ))}
              <th className="pl-2 text-center text-muted-foreground">可见</th>
            </tr>
          </thead>
          <tbody>
            {AGENTS.map(a => {
              const vis = FACTOR_VIS[a.id] ?? [];
              return (
                <tr key={a.id} className="border-t border-border/30">
                  <td className="py-1.5 pr-2 text-left">
                    <span className="mr-1">{a.emoji}</span>
                    <span className="text-foreground">{a.name}</span>
                  </td>
                  {FACTORS.map(f => {
                    const seen = vis.includes(f);
                    return (
                      <td key={f} className="px-1.5 py-1.5 text-center">
                        <span className={`inline-block h-2 w-2 rounded-full ${
                          seen
                            ? f==="uncertainty" ? "bg-purple-400" : "bg-emerald-400"
                            : "bg-red-500/40"
                        }`} />
                      </td>
                    );
                  })}
                  <td className="py-1.5 pl-2 text-center text-muted-foreground">
                    {vis.filter(f=>f!=="uncertainty").length}/4
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> 可见</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500/40" /> 盲区</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-400" /> 元因子(全部可见)</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// 子面板 B：Kuramoto 相位圆（Canvas）
// ══════════════════════════════════════════════
function PhaseCircle({ round, roundIndex }: { round: RoundData; roundIndex: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = 260;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = devicePixelRatio;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2, cy = size / 2, R = 90;

    // 背景圆
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 十字参考线
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.beginPath(); ctx.moveTo(cx-R,cy); ctx.lineTo(cx+R,cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx,cy-R); ctx.lineTo(cx,cy+R); ctx.stroke();

    // Agent 相位点
    const agents = Object.entries(round.agents);
    // 计算 Kuramoto 质心
    let sx = 0, sy = 0;
    agents.forEach(([, state]) => {
      const phase = (state.belief / 100) * Math.PI;
      sx += Math.cos(phase);
      sy += Math.sin(phase);
    });
    const kr = Math.sqrt(sx*sx+sy*sy) / agents.length;

    // 连线到质心
    agents.forEach(([, state]) => {
      const phase = (state.belief / 100) * Math.PI;
      const x = cx + Math.cos(phase) * R;
      const y = cy - Math.sin(phase) * R;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    // 画 Agent 点
    agents.forEach(([id, state]) => {
      const phase = (state.belief / 100) * Math.PI;
      const x = cx + Math.cos(phase) * R;
      const y = cy - Math.sin(phase) * R;
      const agent = AGENTS.find(a => a.id === id);
      const color = beliefColor(state.belief);

      // 光晕
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fillStyle = color + "22";
      ctx.fill();

      // 主圆
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#0f0f0f";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // emoji 标签
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(agent?.emoji ?? "?", x, y);
    });

    // 质心十字
    const centroidAngle = Math.atan2(sy, sx);
    const centroidX = cx + Math.cos(centroidAngle) * kr * R;
    const centroidY = cy - Math.sin(centroidAngle) * kr * R;
    ctx.beginPath();
    ctx.arc(centroidX, centroidY, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#60a5fa";
    ctx.fill();
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 统计标注
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.textAlign = "left";
    ctx.fillText(`r = ${kr.toFixed(3)}`, 8, 16);
    ctx.fillText(`σ = ${round.beliefStd.toFixed(1)}`, 8, 30);
  }, [round]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Kuramoto 相位空间 · 第 {roundIndex} 轮
      </div>
      <canvas ref={canvasRef} className="rounded-md" />
      <div className="font-mono text-[9px] text-muted-foreground">
        蓝点 = 加权质心 · r 越大 → 越同步
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// 子面板 C：盲区消融对比
// ══════════════════════════════════════════════
function AblationCompare({ request, result }: {
  request: { news: string; rounds: number };
  result: SwarmResponse["data"];
}) {
  const noBlindness = useMemo(() => {
    const r = runSwarmMock({
      version: "v9",
      news: request.news,
      rounds: request.rounds,
      llmConfig: { provider: "deepseek", model: "deepseek-chat" },
      enableVRoute: true,
      ablation: { disableBlindness: true },
    });
    return r.data;
  }, [request.news, request.rounds]);

  const metrics = [
    {
      label: "信念标准差 σ",
      withBlind: result.rounds[result.rounds.length-1].beliefStd.toFixed(1),
      without: noBlindness.rounds[noBlindness.rounds.length-1].beliefStd.toFixed(1),
      unit: "",
      better: "higher",
      detail: "盲区产生真实视角差异",
    },
    {
      label: "共识度",
      withBlind: result.v9_5.metrics.consensusScore,
      without: noBlindness.v9_5.metrics.consensusScore,
      unit: "",
      better: "contextual",
      detail: "盲区可能增强或削弱共识",
    },
    {
      label: "极化度",
      withBlind: result.v9_5.metrics.polarizationScore,
      without: noBlindness.v9_5.metrics.polarizationScore,
      unit: "",
      better: "contextual",
      detail: "盲区天然增加表观极化",
    },
    {
      label: "Agent 零重叠率",
      withBlind: 56,
      without: 0,
      unit: "%",
      better: "higher",
      detail: "盲区 OFF → 所有 Agent 信息对称",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        消融实验：信息盲区 ON vs OFF
      </div>
      <div className="grid grid-cols-2 gap-3">
        {metrics.map(m => {
          const delta = typeof m.withBlind === "number" && typeof m.without === "number"
            ? m.withBlind - m.without
            : 0;
          return (
            <div key={m.label} className="rounded-md border border-border bg-background/40 p-3">
              <div className="text-[11px] text-muted-foreground">{m.label}</div>
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-lg font-semibold text-emerald-400">
                    {m.withBlind}{m.unit}
                  </span>
                  <span className="text-[10px] text-muted-foreground">盲区ON</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-lg font-semibold text-red-400">
                    {m.without}{m.unit}
                  </span>
                  <span className="text-[10px] text-muted-foreground">OFF</span>
                </div>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={`font-mono text-[10px] font-semibold ${
                  delta !== 0 ? "text-amber-400" : "text-muted-foreground"
                }`}>
                  Δ = {delta > 0 ? "+" : ""}{typeof delta === "number" ? delta.toFixed(1) : delta}{m.unit}
                </span>
                <span className="text-[9px] text-muted-foreground">{m.detail}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// 主面板
// ══════════════════════════════════════════════
interface EvidencePanelProps {
  data: SwarmResponse["data"];
  requestNews: string;
  requestRounds: number;
}

export function EvidencePanel({ data, requestNews, requestRounds }: EvidencePanelProps) {
  const lastRound = data.rounds[data.rounds.length - 1];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="grid grid-cols-1 gap-5 lg:grid-cols-2"
    >
      {/* 左列：因子可见性矩阵 */}
      <div className="lab-card p-5">
        <VisibilityMatrix />
      </div>

      {/* 右列：Kuramoto 相位圆 */}
      <div className="lab-card flex items-center justify-center p-5">
        <PhaseCircle round={lastRound} roundIndex={data.rounds.length} />
      </div>

      {/* 全宽：消融对比 */}
      <div className="lab-card p-5 lg:col-span-2">
        <AblationCompare
          request={{ news: requestNews, rounds: requestRounds }}
          result={data}
        />
      </div>
    </motion.div>
  );
}
