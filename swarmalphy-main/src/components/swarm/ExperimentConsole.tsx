import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RotateCcw, Save, Play, Loader2, FlaskConical, Server } from "lucide-react";
import type { SwarmRequest } from "@/lib/swarm/types";
import { useSwarmStore } from "@/lib/swarm/store";
import { getMockMode, setMockMode } from "@/lib/swarm/client";
import { toast } from "sonner";

const PRESETS = [
  {
    label: "📉 2008 雷曼破产",
    news: "2008年9月,雷曼兄弟破产,全球金融市场陷入恐慌,信贷市场冻结,道琼斯单日暴跌504点。",
  },
  {
    label: "🦠 2020 新冠崩盘",
    news: "2020年3月,新冠疫情全球爆发,美股两周内四次熔断,美联储紧急降息至零并启动无限量化宽松。",
  },
  {
    label: "🚀 2024 AI 浪潮",
    news: "Nvidia 财报远超预期,AI 算力需求爆发,科技股集体走强,纳指创历史新高。",
  },
  {
    label: "🏦 美联储降息",
    news: "美联储意外宣布降息50个基点,远超市场预期,鸽派信号明确,市场情绪转向乐观。",
  },
];

const NONLINEAR_METHODS = [
  { value: "default", label: "Hybrid Gating（默认）" },
  { value: "linear_baseline", label: "Linear Baseline" },
  { value: "trimmed_mean", label: "Trimmed Mean（推荐）" },
  { value: "dynamic_ensemble", label: "Dynamic Ensemble" },
  { value: "power_law", label: "Power Law" },
  { value: "entropy_weighted", label: "Entropy Weighted" },
  { value: "median", label: "Weighted Median" },
  { value: "winsorized", label: "Winsorized" },
  { value: "geometric_mean", label: "Geometric Mean" },
];

interface Toggle {
  id: string;
  label: string;
  desc: string;
}

const TOGGLES: Toggle[] = [
  { id: "blindness", label: "信息盲区", desc: "每个 Agent 仅能观察到部分因子" },
  { id: "interaction", label: "社交互动", desc: "Agent 间的信念传播与相互影响" },
  { id: "dynamicWeights", label: "动态权重", desc: "Panic / Policy 模式触发权重调整" },
  { id: "policyAgent", label: "政策 Agent", desc: "纳入政策制定 Agent（🏛️）" },
  { id: "neutralEngine", label: "中立仲裁", desc: "弱共识 / 高分歧场景下的方向仲裁" },
  { id: "vRoute", label: "V 型路由", desc: "检测 V 型反弹模式并修正方向判断" },
];

interface ExperimentConsoleProps {
  request: SwarmRequest;
  onChange: (r: SwarmRequest) => void;
  onRun: () => void;
}

export function ExperimentConsole({ request, onChange, onRun }: ExperimentConsoleProps) {
  const loading = useSwarmStore((s) => s.loading);
  const [mockMode, setMockModeLocal] = useState(getMockMode());
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    blindness: true,
    interaction: true,
    dynamicWeights: false,
    policyAgent: true,
    neutralEngine: true,
    vRoute: true,
  });

  function update(patch: Partial<SwarmRequest>) {
    onChange({ ...request, ...patch });
  }

  function handleToggle(id: string, v: boolean) {
    const next = { ...toggles, [id]: v };
    setToggles(next);
    const ablation = { ...(request.ablation ?? {}) };
    onChange({
      ...request,
      ablation: {
        ...ablation,
        disableBlindness: !next.blindness,
        disablePolicyAgent: !next.policyAgent,
        disableNeutralRule1: !next.neutralEngine,
      },
      disableInteraction: !next.interaction,
      enableDynamicWeights: next.dynamicWeights,
      enableVRoute: next.vRoute,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr,1fr]">
      {/* LEFT: news + presets */}
      <div className="lab-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <Label className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            新闻刺激
          </Label>
          <span className="font-mono text-[10px] text-muted-foreground">
            {request.news.length} / 5000
          </span>
        </div>
        <Textarea
          value={request.news}
          onChange={(e) => update({ news: e.target.value })}
          rows={6}
          placeholder="输入或粘贴新闻事件作为推演刺激…"
          className="resize-none border-border bg-background font-mono text-sm placeholder:text-muted-foreground/50 focus-visible:ring-foreground/20"
        />
        <div className="mt-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            预设事件
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => update({ news: p.news })}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
          <Button
            onClick={onRun}
            disabled={loading || !request.news.trim()}
            className="gap-2 bg-foreground font-medium text-background hover:bg-foreground/90"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            运行实验
          </Button>
          <Button
            variant="outline"
            onClick={() => update({ news: "" })}
            className="gap-2 border-border bg-transparent text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" />
            重置
          </Button>
          <Button
            variant="ghost"
            onClick={() => toast.success("实验配置已保存至本地")}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <Save className="h-4 w-4" />
            保存
          </Button>
        </div>
      </div>

      {/* RIGHT: parameters + toggles */}
      <div className="space-y-4">
        <div className="lab-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              参数设置
            </span>
            {/* Mock / Live mode toggle */}
            <button
              onClick={() => {
                const next = !mockMode;
                setMockModeLocal(next);
                setMockMode(next);
                toast.success(next ? "已切换至 Mock 模式" : "已切换至 Live API 模式");
              }}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                mockMode
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              }`}
            >
              {mockMode ? (
                <FlaskConical className="h-3 w-3" />
              ) : (
                <Server className="h-3 w-3" />
              )}
              {mockMode ? "Mock" : "Live API"}
            </button>
          </div>
          {!mockMode && (
            <div className="mb-4 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-400">
              调用 Next.js 后端 <code className="text-emerald-300">/api/swarm</code> 接口。
              需确保 API 服务在 3000 端口运行。
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-2 block text-xs text-muted-foreground">Rounds</Label>
              <Select
                value={String(request.rounds ?? 3)}
                onValueChange={(v) => update({ rounds: parseInt(v) })}
              >
                <SelectTrigger className="border-border bg-background font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} rounds
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block text-xs text-muted-foreground">LLM Provider</Label>
              <Select
                value={request.llmConfig.provider}
                onValueChange={(v) =>
                  update({ llmConfig: { ...request.llmConfig, provider: v as never } })
                }
              >
                <SelectTrigger className="border-border bg-background font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block text-xs text-muted-foreground">Model</Label>
              <Select
                value={request.llmConfig.model}
                onValueChange={(v) =>
                  update({ llmConfig: { ...request.llmConfig, model: v } })
                }
              >
                <SelectTrigger className="border-border bg-background font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepseek-chat">deepseek-chat</SelectItem>
                  <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                  <SelectItem value="claude-3-5-sonnet">claude-3-5-sonnet</SelectItem>
                  <SelectItem value="local-mock">local-mock</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block text-xs text-muted-foreground">Consensus Method</Label>
              <Select
                value={request.ablation?.nonlinearMethod ?? "default"}
                onValueChange={(v) =>
                  update({
                    ablation: {
                      ...(request.ablation ?? {}),
                      nonlinearMethod: v === "default" ? undefined : (v as never),
                    },
                  })
                }
              >
                <SelectTrigger className="border-border bg-background font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NONLINEAR_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="lab-card p-6">
          <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            实验模块
          </div>
          <div className="grid grid-cols-1 gap-3">
            {TOGGLES.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2.5"
              >
                <div>
                  <div className="text-sm font-medium text-foreground">{t.label}</div>
                  <div className="text-[11px] text-muted-foreground">{t.desc}</div>
                </div>
                <Switch
                  checked={toggles[t.id]}
                  onCheckedChange={(v) => handleToggle(t.id, v)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
