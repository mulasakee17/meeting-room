import { useEffect, useRef } from "react";
import type { SwarmResponse } from "@/lib/swarm/types";
import { useSwarmStore } from "@/lib/swarm/store";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function Replay({ data }: { data: SwarmResponse["data"] }) {
  const round = useSwarmStore((s) => s.replayRound);
  const setRound = useSwarmStore((s) => s.setReplayRound);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const total = data.rounds.length;
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) {
      if (timer.current) window.clearInterval(timer.current);
      return;
    }
    timer.current = window.setInterval(() => {
      const cur = useSwarmStore.getState().replayRound;
      if (cur >= total) {
        setPlaying(false);
        return;
      }
      setRound(cur + 1);
    }, 1200 / speed);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, speed, total, setRound]);

  const current = data.rounds[round - 1];

  return (
    <div className="lab-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            回放控制器
          </div>
          <div className="mt-1 text-sm text-foreground">
            同步驱动 Agent 网络 · 时间线 · 演化图
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setRound(Math.max(1, round - 1))}
            className="border-border bg-transparent"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            onClick={() => setPlaying((p) => !p)}
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setRound(Math.min(total, round + 1))}
            className="border-border bg-transparent"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </Button>
          <Select value={String(speed)} onValueChange={(v) => setSpeed(parseFloat(v))}>
            <SelectTrigger className="w-[88px] border-border bg-background font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.5">0.5×</SelectItem>
              <SelectItem value="1">1×</SelectItem>
              <SelectItem value="2">2×</SelectItem>
              <SelectItem value="4">4×</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex-1">
          <Slider
            min={1}
            max={total}
            step={1}
            value={[round]}
            onValueChange={([v]) => setRound(v)}
          />
          <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
            {data.rounds.map((r) => (
              <span
                key={r.round}
                className={r.round === round ? "text-foreground" : ""}
              >
                R{r.round}
              </span>
            ))}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            当前状态
          </div>
          <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">
            R{current.round} · {current.direction} ·{" "}
            {current.consensus >= 0 ? "+" : ""}
            {current.consensus.toFixed(1)}
          </div>
        </div>
      </div>
    </div>
  );
}
