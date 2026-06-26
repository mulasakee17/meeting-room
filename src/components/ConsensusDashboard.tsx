"use client";

import { useEffect, useState, useRef } from "react";
import {
  Chart as ChartJS,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

// 注册 Chart.js 组件
ChartJS.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend, Filler);

// ==================== 类型 ====================

interface InteractionRoundData {
  round: number;
  beliefs: Record<string, number>;
  beliefChanges: Record<string, number>;
  meanBelief: number;
  beliefStd: number;
  converged: boolean;
}

interface SocialProfileData {
  agentId: string;
  alpha: number;
  visibleAgentIds: string[];
  visibilityReason?: string;
}

interface MetricsData {
  consensusScore: number;
  polarizationScore: number;
  fragilityScore: number;
  stateLabel: string;
  stateInterpretation: string;
}

interface ComparisonData {
  consensusShift: number;
  stdChange: number;
  effect?: string;
  description?: string;
}

interface V9AgentInfo {
  id: string;
  name: string;
  emoji: string;
  role: string;
}

interface TimelineEntry {
  sequenceIndex: number;
  news: string;
  consensusScore: number;
  polarizationScore: number;
  fragilityScore: number;
  consensus: number;
  direction: string;
  beliefStd: number;
}

interface DynamicWeightsData {
  enabled: boolean;
  activeModes: string[];
  modeDetails: {
    panic: { triggered: boolean; reasons: string[] };
    policy: { triggered: boolean; reasons: string[] };
    value: { triggered: boolean; reasons: string[] };
  };
  adjustments: Record<string, {
    agentId: string;
    agentName: string;
    emoji: string;
    baseWeight: number;
    multiplier: number;
    finalWeight: number;
    contributingModes: string[];
    reason: string;
  }>;
  dynamicConsensus?: number;
}

interface ConsensusDashboardProps {
  metrics: MetricsData;
  interactionRounds?: InteractionRoundData[];
  socialProfiles?: SocialProfileData[];
  comparison?: ComparisonData;
  agents?: V9AgentInfo[];
  kuramotoR?: number;
  finalConsensus?: number;
  finalDirection?: string;
  timeline?: TimelineEntry[];
  loading?: boolean;
  /** 🆕 v9.5.2: 动态权重数据 */
  dynamicWeights?: DynamicWeightsData;
}

// ==================== 子组件: 环形仪表盘 ====================

function GaugeRing({
  score,
  label,
  color,
  icon,
  segments,
}: {
  score: number;
  label: string;
  color: string;
  icon: string;
  segments: { max: number; color: string; label: string }[];
}) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedScore(score), 300);
    return () => clearTimeout(timer);
  }, [score]);

  // SVG 参数
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  // 分段弧
  const segmentArcs = segments.map((seg) => {
    const dashLen = (seg.max / 100) * circumference;
    return { ...seg, dashLen };
  });

  const dashOffset =
    circumference - (animatedScore / 100) * circumference;

  // 获取当前分段的颜色
  const currentSegment = segments.find((s) => score <= s.max) || segments[segments.length - 1];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        {/* 背景轨道 */}
        <svg width={size} height={size} className="transform -rotate-90">
          {segmentArcs.map((seg, i) => {
            const prevMax = i === 0 ? 0 : segmentArcs[i - 1].max;
            const offset = circumference - (prevMax / 100) * circumference;
            return (
              <circle
                key={i}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={seg.color + "30"}
                strokeWidth={strokeWidth}
                strokeDasharray={`${seg.dashLen} ${circumference - seg.dashLen}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
          })}
          {/* 活动弧 */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={currentSegment.color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{
              transition: "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </svg>
        {/* 中心文字 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-zinc-500">{icon}</span>
          <span
            className="text-2xl font-bold"
            style={{
              color: currentSegment.color,
              transition: "color 1s",
            }}
          >
            {animatedScore}
          </span>
        </div>
      </div>
      <span className="text-sm font-medium text-zinc-300">{label}</span>
    </div>
  );
}

// ==================== 子组件: 状态标签 ====================

function StateBadge({ label, interpretation }: { label: string; interpretation: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
      <div className="text-lg font-bold text-zinc-100 mb-2">{label}</div>
      <div className="text-sm text-zinc-400 leading-relaxed">{interpretation}</div>
    </div>
  );
}

// ==================== 子组件: 互动演化条 ====================

function InteractionEvolution({
  rounds,
  agents,
}: {
  rounds: InteractionRoundData[];
  agents: V9AgentInfo[];
}) {
  if (!rounds || rounds.length <= 1) return null;

  // 只展示有互动的轮次 (skip round 0)
  const activeRounds = rounds.filter((r) => r.round > 0);
  if (activeRounds.length === 0) return null;

  const maxStd = Math.max(...rounds.map((r) => r.beliefStd), 1);
  const barWidth = Math.max(8, Math.min(24, 100 / activeRounds.length));

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-zinc-400 mb-4">
        📡 信念演化过程
      </h3>

      {/* 标准差柱状图 — 展示分歧变化 */}
      <div className="flex items-end gap-2 h-24 mb-3">
        {rounds.map((r) => {
          const heightPct = (r.beliefStd / maxStd) * 100;
          const isLast = r.round === rounds[rounds.length - 1].round;
          return (
            <div
              key={r.round}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span className="text-xs text-zinc-500">
                {r.beliefStd.toFixed(0)}
              </span>
              <div
                className={`w-full rounded-t transition-all duration-500 ${
                  r.converged
                    ? "bg-emerald-500/70"
                    : isLast
                    ? "bg-amber-500/70"
                    : "bg-zinc-600/50"
                }`}
                style={{ height: `${Math.max(4, heightPct)}%` }}
                title={`R${r.round}: std=${r.beliefStd.toFixed(1)} mean=${r.meanBelief.toFixed(1)}`}
              />
              <span className="text-xs text-zinc-600">
                R{r.round}
              </span>
            </div>
          );
        })}
      </div>

      {/* 图例 */}
      <div className="flex gap-4 text-xs text-zinc-500">
        <span>belief_std 变化 — 越低越一致</span>
        {rounds[rounds.length - 1].converged && (
          <span className="text-emerald-400">✓ 已收敛</span>
        )}
      </div>
    </div>
  );
}

// ==================== 子组件: Agent 信念对比条 ====================

function AgentBeliefBars({
  initialBeliefs,
  finalBeliefs,
  agents,
}: {
  initialBeliefs: Record<string, number>;
  finalBeliefs: Record<string, number>;
  agents: V9AgentInfo[];
}) {
  const agentList = agents.filter(
    (a) =>
      initialBeliefs[a.id] !== undefined || finalBeliefs[a.id] !== undefined
  );

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-zinc-400 mb-4">
        🎭 Agent 信念对比 (互动前 → 互动后)
      </h3>
      <div className="space-y-2">
        {agentList.map((agent) => {
          const before = initialBeliefs[agent.id] ?? 0;
          const after = finalBeliefs[agent.id] ?? 0;
          const shift = after - before;
          const hasShift = Math.abs(shift) > 1;

          // 信念值 → 水平条位置
          const beforePct = ((before + 100) / 200) * 100;
          const afterPct = ((after + 100) / 200) * 100;

          return (
            <div key={agent.id} className="flex items-center gap-2 text-xs">
              <span className="w-20 text-zinc-400 truncate">
                {agent.emoji} {agent.name}
              </span>
              {/* 轨道 */}
              <div className="flex-1 relative h-5 bg-zinc-800 rounded">
                {/* 中线 */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600" />
                {/* 互动前 */}
                <div
                  className="absolute top-1 h-3 rounded-sm opacity-40"
                  style={{
                    left: `${Math.min(beforePct, 50)}%`,
                    width: `${Math.abs(beforePct - 50)}%`,
                    backgroundColor: before > 0 ? "#34d399" : "#f87171",
                  }}
                />
                {/* 互动后 */}
                <div
                  className="absolute top-1 h-3 rounded-sm transition-all duration-700"
                  style={{
                    left: `${Math.min(afterPct, 50)}%`,
                    width: `${Math.abs(afterPct - 50)}%`,
                    backgroundColor: after > 0 ? "#34d399" : "#f87171",
                  }}
                />
                {/* 变化箭头 */}
                {hasShift && (
                  <div
                    className="absolute top-0.5 text-xs"
                    style={{
                      left: `${Math.min(afterPct, 98)}%`,
                      color: shift > 0 ? "#34d399" : "#f87171",
                    }}
                  >
                    {shift > 0 ? "→" : "←"}
                  </div>
                )}
              </div>
              <span
                className={`w-12 text-right font-mono ${
                  after > 15
                    ? "text-emerald-400"
                    : after < -15
                    ? "text-red-400"
                    : "text-zinc-400"
                }`}
              >
                {after > 0 ? "+" : ""}
                {after.toFixed(0)}
              </span>
              {hasShift && (
                <span
                  className={`w-12 text-right font-mono ${
                    shift > 0 ? "text-emerald-500" : "text-red-500"
                  }`}
                >
                  {shift > 0 ? "+" : ""}
                  {shift.toFixed(1)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== 子组件: 社交可见性迷你图 ====================

function SocialNetworkMini({
  profiles,
  agents,
}: {
  profiles: SocialProfileData[];
  agents: V9AgentInfo[];
}) {
  if (!profiles || profiles.length === 0) return null;

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-zinc-400 mb-3">
        🔗 社交可见性 (因子重叠)
      </h3>
      <div className="flex flex-wrap gap-2">
        {profiles.map((p) => {
          const agent = agents.find((a) => a.id === p.agentId);
          if (!agent) return null;
          const alphaLabel =
            p.alpha > 0.3
              ? "从众"
              : p.alpha < -0.1
              ? "逆向"
              : p.alpha > 0.05
              ? "轻度"
              : "独立";

          return (
            <div
              key={p.agentId}
              className="bg-zinc-800/50 rounded-lg px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-1 mb-1">
                <span>{agent.emoji}</span>
                <span className="text-zinc-300">{agent.name}</span>
                <span
                  className={`ml-1 px-1 rounded ${
                    p.alpha > 0.3
                      ? "bg-amber-900/50 text-amber-400"
                      : p.alpha < -0.1
                      ? "bg-purple-900/50 text-purple-400"
                      : "bg-zinc-700/50 text-zinc-400"
                  }`}
                >
                  α={p.alpha}
                </span>
              </div>
              <div className="text-zinc-500">
                可见 {p.visibleAgentIds.length} 人
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== 子组件: 加载骨架屏 ====================

function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 flex flex-col items-center gap-3"
          >
            <div className="w-[120px] h-[120px] rounded-full bg-zinc-800" />
            <div className="h-4 w-20 bg-zinc-800 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 h-32" />
    </div>
  );
}

// ==================== 子组件: 时间线折线图 ====================

function TimelineChart({ timeline }: { timeline: TimelineEntry[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !timeline || timeline.length === 0) return;

    // 销毁旧图表
    if (chartRef.current) chartRef.current.destroy();

    const labels = timeline.map((_, i) => `Day ${i + 1}`);
    const consensusData = timeline.map(t => t.consensusScore);
    const polarizationData = timeline.map(t => t.polarizationScore);
    const fragilityData = timeline.map(t => t.fragilityScore);

    chartRef.current = new ChartJS(canvasRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Consensus",
            data: consensusData,
            borderColor: "#34d399",
            backgroundColor: "rgba(52,211,153,0.1)",
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointRadius: 5,
            pointBackgroundColor: "#34d399",
          },
          {
            label: "Polarization",
            data: polarizationData,
            borderColor: "#f87171",
            backgroundColor: "rgba(248,113,113,0.1)",
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointRadius: 5,
            pointBackgroundColor: "#f87171",
          },
          {
            label: "Fragility",
            data: fragilityData,
            borderColor: "#fbbf24",
            backgroundColor: "rgba(251,191,36,0.1)",
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointRadius: 5,
            pointBackgroundColor: "#fbbf24",
            borderDash: [5, 3],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#a1a1aa", padding: 16, usePointStyle: true },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}/100`,
            },
          },
        },
        scales: {
          x: { ticks: { color: "#71717a" }, grid: { color: "rgba(63,63,70,0.5)" } },
          y: {
            min: 0,
            max: 100,
            ticks: { color: "#71717a", stepSize: 20 },
            grid: { color: "rgba(63,63,70,0.5)" },
          },
        },
      },
    });

    return () => {
      if (chartRef.current) chartRef.current.destroy();
    };
  }, [timeline]);

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-zinc-400 mb-3">
        📈 连续推演趋势
      </h3>
      <div className="relative" style={{ height: "200px" }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

// ==================== 主组件 ====================

export default function ConsensusDashboard({
  metrics,
  interactionRounds,
  socialProfiles,
  comparison,
  agents,
  kuramotoR,
  finalConsensus,
  finalDirection,
  timeline,
  loading = false,
  dynamicWeights,
}: ConsensusDashboardProps) {
  if (loading) return <DashboardSkeleton />;

  // ── 仪表盘颜色分段 ──
  const consensusSegments = [
    { max: 30, color: "#ef4444", label: "弱" },
    { max: 60, color: "#f59e0b", label: "中" },
    { max: 100, color: "#34d399", label: "强" },
  ];

  const polarizationSegments = [
    { max: 30, color: "#34d399", label: "低" },
    { max: 60, color: "#f59e0b", label: "中" },
    { max: 100, color: "#f87171", label: "高" },
  ];

  const fragilitySegments = [
    { max: 25, color: "#34d399", label: "稳" },
    { max: 50, color: "#f59e0b", label: "中" },
    { max: 100, color: "#ef4444", label: "脆" },
  ];

  // ── 互动前后数据 ──
  const initialBeliefs: Record<string, number> = {};
  const finalBeliefs: Record<string, number> = {};
  if (interactionRounds && interactionRounds.length > 0) {
    const r0 = interactionRounds[0];
    const rLast = interactionRounds[interactionRounds.length - 1];
    if (r0) Object.assign(initialBeliefs, r0.beliefs);
    if (rLast) Object.assign(finalBeliefs, rLast.beliefs);
  }

  const hasInteraction = interactionRounds && interactionRounds.length > 1;

  return (
    <div className="space-y-4">
      {/* ── 标题栏 ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-300">
          🧬 共识度量引擎 v9.5
        </h2>
        {finalDirection && (
          <span
            className={`text-sm px-3 py-1 rounded-full ${
              finalDirection === "UP"
                ? "bg-emerald-900/50 text-emerald-400"
                : finalDirection === "DOWN"
                ? "bg-red-900/50 text-red-400"
                : "bg-yellow-900/50 text-yellow-400"
            }`}
          >
            {finalDirection === "UP"
              ? "📈 看多"
              : finalDirection === "DOWN"
              ? "📉 看空"
              : "⚖️ 中立"}
            {finalConsensus !== undefined && (
              <span className="ml-1">
                ({finalConsensus > 0 ? "+" : ""}
                {finalConsensus.toFixed(1)})
              </span>
            )}
          </span>
        )}
      </div>

      {/* ── 时间线图 (连续推演模式) ── */}
      {timeline && timeline.length > 1 && (
        <TimelineChart timeline={timeline} />
      )}

      {/* ── 三个仪表盘 ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 flex justify-center">
          <GaugeRing
            score={metrics.consensusScore}
            label="Consensus"
            color="#34d399"
            icon="🤝"
            segments={consensusSegments}
          />
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 flex justify-center">
          <GaugeRing
            score={metrics.polarizationScore}
            label="Polarization"
            color="#f87171"
            icon="⚡"
            segments={polarizationSegments}
          />
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 flex justify-center">
          <GaugeRing
            score={metrics.fragilityScore}
            label="Fragility"
            color="#f59e0b"
            icon="🏗️"
            segments={fragilitySegments}
          />
        </div>
      </div>

      {/* ── 指标数值行 ── */}
      <div className="grid grid-cols-3 gap-4 text-center text-xs text-zinc-500">
        <div>
          {metrics.consensusScore < 30
            ? "弱共识 — Agent各说各话"
            : metrics.consensusScore < 60
            ? "中等共识"
            : "强共识 — 方向一致"}
        </div>
        <div>
          {metrics.polarizationScore < 30
            ? "低极化 — 未形成对立阵营"
            : metrics.polarizationScore < 60
            ? "中度极化"
            : "高极化 — 两个阵营激烈对抗"}
        </div>
        <div>
          {metrics.fragilityScore < 25
            ? "稳健 — 共识有多重支撑"
            : metrics.fragilityScore < 50
            ? "中等脆弱"
            : "脆弱 — 共识可能瞬间瓦解"}
        </div>
      </div>

      {/* ── 状态解读 ── */}
      <StateBadge
        label={metrics.stateLabel}
        interpretation={metrics.stateInterpretation}
      />

      {/* ── 互动演化 (如果有) ── */}
      {hasInteraction && interactionRounds && agents && (
        <>
          <InteractionEvolution rounds={interactionRounds} agents={agents} />

          <AgentBeliefBars
            initialBeliefs={initialBeliefs}
            finalBeliefs={finalBeliefs}
            agents={agents}
          />
        </>
      )}

      {/* ── 社交可见性 ── */}
      {socialProfiles && agents && (
        <SocialNetworkMini profiles={socialProfiles} agents={agents} />
      )}

      {/* ── 互动效果总结 ── */}
      {comparison && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-zinc-400 mb-3">
            📊 互动效果
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-zinc-500">共识偏移</div>
              <div
                className={`text-lg font-bold ${
                  Math.abs(comparison.consensusShift) > 10
                    ? "text-amber-400"
                    : "text-zinc-300"
                }`}
              >
                {comparison.consensusShift > 0 ? "+" : ""}
                {comparison.consensusShift.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">分歧变化</div>
              <div
                className={`text-lg font-bold ${
                  comparison.stdChange > 5
                    ? "text-red-400"
                    : comparison.stdChange < -5
                    ? "text-emerald-400"
                    : "text-zinc-300"
                }`}
              >
                {comparison.stdChange > 0 ? "+" : ""}
                {comparison.stdChange.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">效应</div>
              <div
                className={`text-lg font-bold ${
                  comparison.stdChange < -5
                    ? "text-emerald-400"
                    : comparison.stdChange > 5
                    ? "text-amber-400"
                    : "text-zinc-400"
                }`}
              >
                {comparison.stdChange < -5
                  ? "收敛"
                  : comparison.stdChange > 5
                  ? "极化"
                  : "微效"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 v9.5.2: 动态权重面板 — 级联状态自适应权重调整 */}
      {dynamicWeights && dynamicWeights.enabled && (
        <div className="mt-6 p-5 rounded-xl bg-zinc-900/50 border border-zinc-800 animate-slide-up">
          {/* 标题栏 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚖️</span>
              <h3 className="text-sm font-semibold text-zinc-200">
                动态权重引擎
              </h3>
              <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                Cascade Dynamic Weights
              </span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-xs font-bold ${
                dynamicWeights.activeModes.length > 0
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "bg-zinc-800 text-zinc-500 border border-zinc-700"
              }`}
            >
              {dynamicWeights.activeModes.length > 0
                ? `${dynamicWeights.activeModes.length} 模式激活`
                : "静态权重"}
            </span>
          </div>

          {/* 模式检测详情 */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {(["panic", "policy", "value"] as const).map((mode) => {
              const detail = dynamicWeights.modeDetails[mode];
              const config = {
                panic: { icon: "🔴", label: "恐慌模式" },
                policy: { icon: "🏛️", label: "政策模式" },
                value: { icon: "💎", label: "价值洼地" },
              }[mode];
              const triggered = detail.triggered;
              const borderColor = triggered
                ? mode === "panic"
                  ? "border-red-500/30"
                  : mode === "policy"
                  ? "border-blue-500/30"
                  : "border-emerald-500/30"
                : "border-zinc-700/30";
              const bgColor = triggered
                ? mode === "panic"
                  ? "bg-red-500/5"
                  : mode === "policy"
                  ? "bg-blue-500/5"
                  : "bg-emerald-500/5"
                : "bg-zinc-800/30";

              return (
                <div
                  key={mode}
                  className={`p-3 rounded-lg border text-xs ${borderColor} ${bgColor} ${
                    !triggered ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span>{config.icon}</span>
                    <span
                      className={`font-semibold ${
                        triggered ? "text-zinc-200" : "text-zinc-500"
                      }`}
                    >
                      {config.label}
                    </span>
                    <span
                      className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
                        triggered
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-zinc-800 text-zinc-600"
                      }`}
                    >
                      {triggered ? "触发" : "—"}
                    </span>
                  </div>
                  {triggered &&
                    detail.reasons.map((r, i) => (
                      <div
                        key={i}
                        className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed"
                      >
                        • {r}
                      </div>
                    ))}
                </div>
              );
            })}
          </div>

          {/* 权重调整条形图 */}
          {dynamicWeights.activeModes.length > 0 && (
            <>
              <div className="text-xs font-semibold text-zinc-400 mb-3">
                权重调整对比
              </div>
              <div className="space-y-2">
                {Object.values(dynamicWeights.adjustments)
                  .filter((a) => a.contributingModes.length > 0)
                  .sort(
                    (a, b) =>
                      Math.abs(b.multiplier - 1) -
                      Math.abs(a.multiplier - 1)
                  )
                  .map((adj) => {
                    const maxW = Math.max(
                      ...Object.values(dynamicWeights.adjustments).map(
                        (x) => x.finalWeight
                      ),
                      100
                    );
                    const barPct = (adj.finalWeight / maxW) * 100;
                    const delta =
                      adj.multiplier > 1
                        ? `+${Math.round((adj.multiplier - 1) * 100)}%`
                        : adj.multiplier < 1
                        ? `${Math.round((adj.multiplier - 1) * 100)}%`
                        : "—";

                    return (
                      <div key={adj.agentId} className="flex items-center gap-2">
                        <span className="text-sm w-5 text-center">
                          {adj.emoji}
                        </span>
                        <span className="text-xs text-zinc-300 w-16 truncate">
                          {adj.agentName}
                        </span>
                        <div className="flex-1 h-5 bg-zinc-800 rounded-full overflow-hidden relative">
                          <div
                            className={`absolute top-0 left-0 h-full rounded-full transition-all duration-700 ${
                              adj.multiplier > 1
                                ? "bg-emerald-500/50"
                                : adj.multiplier < 1
                                ? "bg-red-500/40"
                                : "bg-zinc-500/30"
                            }`}
                            style={{ width: `${Math.min(100, barPct)}%` }}
                          />
                          <span className="absolute top-0 left-0 w-full h-full flex items-center px-2 text-[10px] font-mono text-white/80">
                            {adj.baseWeight} → {adj.finalWeight}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-mono w-10 text-right ${
                            adj.multiplier > 1
                              ? "text-emerald-400"
                              : adj.multiplier < 1
                              ? "text-red-400"
                              : "text-zinc-500"
                          }`}
                        >
                          {delta}
                        </span>
                      </div>
                    );
                  })}
              </div>

              {/* 动态共识对比 */}
              {dynamicWeights.dynamicConsensus !== undefined && (
                <div className="mt-4 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">
                    <span className="font-semibold text-amber-300">动态共识</span>
                    <span className="text-zinc-600 mx-2">vs</span>
                    <span className="text-zinc-500">静态共识</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-mono font-bold text-amber-300">
                      {dynamicWeights.dynamicConsensus > 0 ? "+" : ""}
                      {dynamicWeights.dynamicConsensus.toFixed(1)}
                    </span>
                    <span className="text-zinc-600 text-xs">/</span>
                    <span className="text-sm font-mono text-zinc-500">
                      {finalConsensus !== undefined
                        ? `${finalConsensus > 0 ? "+" : ""}${finalConsensus.toFixed(1)}`
                        : "—"}
                    </span>
                  </div>
                </div>
              )}

              {/* 静态稳定器提示 */}
              <div className="mt-3 text-[10px] text-zinc-600 leading-relaxed">
                💡 Quant (量化) 和 Media (媒体) 在所有模式中保持静态权重 — 量化模型不受情绪影响，媒体动态调整留待后续版本。
              </div>
            </>
          )}

          {/* 未触发任何模式 */}
          {dynamicWeights.activeModes.length === 0 && (
            <div className="text-xs text-zinc-500 text-center py-3">
              📊 当前市场状态未触发任何场景模式 — 所有 Agent 保持静态权重。尝试输入含恐慌情绪或政策干预的新闻以激活动态权重。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
