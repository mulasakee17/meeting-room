import { Activity, Download, History, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSwarmStore } from "@/lib/swarm/store";
import { getMockMode } from "@/lib/swarm/client";
import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface HeaderProps {
  onRun: () => void;
  canRun: boolean;
}

export function SwarmHeader({ onRun, canRun }: HeaderProps) {
  const loading = useSwarmStore((s) => s.loading);
  const streaming = useSwarmStore((s) => s.streaming);
  const progress = useSwarmStore((s) => s.progress);
  const result = useSwarmStore((s) => s.result);
  const history = useSwarmStore((s) => s.history);
  const loadFromHistory = useSwarmStore((s) => s.loadFromHistory);
  const [open, setOpen] = useState(false);
  const [mockMode, setMockMode] = useState(getMockMode());

  // Poll mock mode state so it stays in sync
  useEffect(() => {
    const t = setInterval(() => setMockMode(getMockMode()), 600);
    return () => clearInterval(t);
  }, []);


  function exportReport() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `swarm-experiment-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-6 px-8 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card">
            <Activity className="h-4 w-4 text-foreground" />
          </div>
          <div className="leading-tight">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-base font-semibold tracking-tight text-foreground">
                SwarmAlpha
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                v9.7
              </span>
              <span
                className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                  mockMode
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                }`}
              >
                {mockMode ? "Mock" : "Live"}
              </span>
            </div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              共识动力学基础设施
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {streaming && progress && progress.total > 0 && (
            <div className="mr-2 hidden items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-1.5 md:flex">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                推演中
              </span>
              <span className="font-mono text-[11px] tabular-nums text-foreground">
                R{progress.current}/{progress.total}
              </span>
              <div className="ml-1 h-1 w-20 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full bg-emerald-400 transition-all duration-300"
                  style={{
                    width: `${(progress.current / Math.max(1, progress.total)) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                <History className="h-4 w-4" />
                历史记录
                <span className="ml-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {history.length}
                </span>
              </Button>
            </SheetTrigger>
            <SheetContent className="border-border bg-card">
              <SheetHeader>
                <SheetTitle>实验历史</SheetTitle>
                <SheetDescription>
                  本地存储的运行记录。点击即可恢复。
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-2">
                {history.length === 0 && (
                  <div className="text-sm text-muted-foreground">暂无运行记录。</div>
                )}
                {history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => {
                      loadFromHistory(h.id);
                      setOpen(false);
                    }}
                    className="w-full rounded-md border border-border bg-background p-3 text-left transition-colors hover:border-foreground/30"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {new Date(h.timestamp).toLocaleString()}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {h.response.data.final.direction}
                      </span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm text-foreground">
                      {h.newsExcerpt}
                    </div>
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          <Button
            variant="ghost"
            size="sm"
            disabled={!result}
            onClick={exportReport}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <Download className="h-4 w-4" />
            导出报告
          </Button>

          <Button
            onClick={onRun}
            disabled={!canRun || loading}
            size="sm"
            className="gap-2 bg-foreground font-medium text-background hover:bg-foreground/90"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            运行实验
          </Button>
        </div>
      </div>
    </header>
  );
}
