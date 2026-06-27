import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import {
  ReactFlow, Background, Controls,
  type Node, type Edge, type NodeProps, Handle, Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { SwarmResponse } from "@/lib/swarm/types";
import { beliefColor } from "@/lib/swarm/colors";
import { useSwarmStore } from "@/lib/swarm/store";

interface NetworkProps { data: SwarmResponse["data"] }

interface AgentNodeData extends Record<string, unknown> {
  id: string; emoji: string; name: string; belief: number; influence: number; selected: boolean;
}

function AgentNode({ data }: NodeProps) {
  const d = data as unknown as AgentNodeData;
  const color = beliefColor(d.belief);
  const size = 56 + d.influence * 180;
  return (
    <div className="flex items-center justify-center rounded-full border-2 transition-all" style={{
      width: size, height: size, borderColor: color, backgroundColor: color + "18",
      boxShadow: d.selected ? `0 0 0 3px ${color}55, 0 0 28px ${color}88` : `0 0 18px ${color}40`,
    }}>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <div className="flex flex-col items-center gap-0 leading-none">
        <span style={{ fontSize: size * 0.35 }}>{d.emoji}</span>
        <span className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-foreground/80">{d.name}</span>
        <span className="font-mono text-[10px] font-semibold tabular-nums" style={{ color }}>{d.belief >= 0 ? "+" : ""}{d.belief.toFixed(0)}</span>
      </div>
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

export function AgentSocietyNetwork({ data }: NetworkProps) {
  const selectedAgentId = useSwarmStore((s) => s.selectedAgentId);
  const selectAgent = useSwarmStore((s) => s.selectAgent);
  const replayRound = useSwarmStore((s) => s.replayRound);
  const roundIdx = Math.max(0, Math.min(replayRound - 1, data.rounds.length - 1));
  const round = data.rounds[roundIdx];

  const initial = useMemo(() => {
    const agents = data.v9_5Agents;
    const profiles = data.v9_5.interaction?.socialProfiles ?? [];
    const cx = 380, cy = 280, radius = 220;
    const nodes: Node[] = agents.map((a, i) => {
      const angle = (i / agents.length) * Math.PI * 2 - Math.PI / 2;
      const influence = data.diagnostics.attribution.find(x => x.agentId === a.id)?.influenceWeight ?? 0.1;
      const belief = round.agents[a.id]?.belief ?? 0;
      return {
        id: a.id, type: "agent",
        position: { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius },
        data: { id: a.id, emoji: a.emoji, name: a.name, belief, influence, selected: a.id === selectedAgentId },
      };
    });
    const edges: Edge[] = [];
    for (const p of profiles) {
      for (const target of p.visibleAgentIds) {
        const trust = (p.trust?.[target] ?? 50) / 100;
        if (trust < 0.55) continue;
        edges.push({
          id: `${p.agentId}->${target}`, source: p.agentId, target, animated: true,
          style: { stroke: `rgba(255,255,255,${0.1 + trust * 0.35})`, strokeWidth: 0.8 + trust * 2 },
        });
      }
    }
    return { nodes, edges };
  }, []); // 只在首次挂载时计算初始位置

  const [nodes, setNodes] = useState(initial.nodes);
  const [edges] = useState(initial.edges);
  const prevRoundRef = useRef(roundIdx);
  const prevSelectedRef = useRef(selectedAgentId);

  // 轮次或选中变化时更新信念值和选中状态（保留节点位置）
  useEffect(() => {
    if (prevRoundRef.current === roundIdx && prevSelectedRef.current === selectedAgentId) return;
    prevRoundRef.current = roundIdx;
    prevSelectedRef.current = selectedAgentId;

    setNodes(current =>
      current.map(n => {
        const belief = round.agents[n.id]?.belief ?? 0;
        return {
          ...n,
          data: { ...n.data, belief, selected: n.id === selectedAgentId },
        };
      }),
    );
  }, [roundIdx, selectedAgentId, round.agents, setNodes]);

  const onNodesChange = useCallback(() => {}, []);
  const onEdgesChange = useCallback(() => {}, []);

  return (
    <div className="lab-card lab-grid-bg relative h-[580px] overflow-hidden">
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeClick={(_, n) => selectAgent(n.id)}
        onPaneClick={() => selectAgent(null)}
        fitView fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.4} maxZoom={2}
      >
        <Background gap={24} size={1} color="rgba(255,255,255,0.05)" />
        <Controls className="!border !border-border !bg-card" showInteractive={false} />
      </ReactFlow>
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-4 rounded-md border border-border bg-background/60 px-3 py-2 backdrop-blur-md">
        <LegendDot color="var(--color-bullish)" label="Bullish" />
        <LegendDot color="var(--color-bearish)" label="Bearish" />
        <LegendDot color="var(--color-neutral-tone)" label="Neutral" />
        <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">节点大小 = 影响力 · 边 = 社会信任度</span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}
