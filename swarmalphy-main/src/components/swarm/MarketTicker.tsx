import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { useSwarmStore } from "@/lib/swarm/store";
import { getMockMode } from "@/lib/swarm/client";

interface Snapshot {
  data: {
    spx: { price: number; changePct: string } | null;
    vix: number | null;
    treasury: { t2y: string | null; t10y: string | null; spread2s10s: number | null };
    gold: number | null;
    oil: number | null;
  } | null;
  availableSources: string[];
  allFailed: boolean;
}

export function MarketTicker() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const streaming = useSwarmStore((s) => s.streaming);
  const mockMode = getMockMode();

  useEffect(() => {
    if (mockMode) return;
    let cancelled = false;
    const fetchSnap = () => {
      fetch("/api/market-snapshot")
        .then(r => r.json())
        .then(d => { if (!cancelled) setSnap(d); })
        .catch(() => {});
    };
    fetchSnap();
    // 每 30 秒自动刷新
    const interval = setInterval(fetchSnap, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [mockMode]);

  // 实验结束后自动刷新
  const prevStreaming = useRef(streaming);
  useEffect(() => {
    if (!mockMode && prevStreaming.current && !streaming) {
      // streaming 从 true→false：实验完成，刷新数据
      setTimeout(() => {
        fetch("/api/market-snapshot")
          .then(r => r.json())
          .then(d => setSnap(d))
          .catch(() => {});
      }, 300);
    }
    prevStreaming.current = streaming;
  }, [streaming, mockMode]);

  // Mock 模式：显示推断提示
  if (mockMode) {
    return (
      <div className="border-b border-border bg-card/40">
        <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-8 py-2 font-mono text-[10px] text-muted-foreground">
          <span className="uppercase tracking-wider">市场数据</span>
          <span className="text-amber-400">Mock 模式 · 关键词推断</span>
          <span className="ml-auto text-[9px]">切换至 Live API 以接入 12 个实时数据源</span>
        </div>
      </div>
    );
  }

  // 加载中
  if (!snap) {
    return (
      <div className="border-b border-border bg-card/40">
        <div className="mx-auto flex max-w-[1600px] items-center px-8 py-2 font-mono text-[10px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            正在获取实时市场数据…
          </span>
        </div>
      </div>
    );
  }

  // 全部失败
  if (snap.allFailed || !snap.data) {
    return (
      <div className="border-b border-border bg-red-500/5">
        <div className="mx-auto flex max-w-[1600px] items-center px-8 py-2 font-mono text-[10px] text-red-400">
          市场数据获取失败 · 因子提取将使用 LLM 推断值
        </div>
      </div>
    );
  }

  const d = snap.data;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="border-b border-border bg-card/40 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-8 py-2.5 font-mono text-[11px]">
        {/* 标题 */}
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          实时市场
        </span>

        {/* SPX */}
        {d.spx && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">SPX</span>
            <span className="tabular-nums text-foreground">{d.spx.price}</span>
            <span className={`tabular-nums text-[10px] ${
              Number(d.spx.changePct) >= 0 ? "text-emerald-400" : "text-red-400"
            }`}>
              {Number(d.spx.changePct) >= 0 ? "+" : ""}{d.spx.changePct}%
            </span>
          </div>
        )}

        {/* VIX */}
        {d.vix != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">VIX</span>
            <span className={`tabular-nums ${
              d.vix > 30 ? "text-red-400" : d.vix > 20 ? "text-amber-400" : "text-emerald-400"
            }`}>
              {d.vix}
            </span>
          </div>
        )}

        {/* 利差 */}
        {d.treasury.spread2s10s != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">2s10s</span>
            <span className={`tabular-nums ${
              d.treasury.spread2s10s < 0 ? "text-red-400" : "text-muted-foreground"
            }`}>
              {d.treasury.spread2s10s > 0 ? "+" : ""}{d.treasury.spread2s10s}bp
            </span>
          </div>
        )}

        {/* Gold */}
        {d.gold != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">Gold</span>
            <span className="tabular-nums text-foreground">{d.gold}</span>
          </div>
        )}

        {/* Oil */}
        {d.oil != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">Oil</span>
            <span className="tabular-nums text-foreground">{d.oil}</span>
          </div>
        )}

        {/* 数据源计数 */}
        <span className="ml-auto text-[9px] text-muted-foreground">
          {snap.availableSources.length}/12 数据源在线
        </span>
      </div>
    </motion.div>
  );
}
