import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { SwarmHeader } from "@/components/swarm/SwarmHeader";
import { Section } from "@/components/swarm/Section";
import { ExperimentConsole } from "@/components/swarm/ExperimentConsole";
import { LiveDashboard } from "@/components/swarm/LiveDashboard";
import { FactorAnalysis } from "@/components/swarm/FactorAnalysis";
import { AgentSocietyNetwork } from "@/components/swarm/AgentSocietyNetwork";
import { AgentDrawer } from "@/components/swarm/AgentDrawer";
import { ExplainableTimeline } from "@/components/swarm/ExplainableTimeline";
import { ConsensusEvolution } from "@/components/swarm/ConsensusEvolution";
import { CounterfactualLab } from "@/components/swarm/CounterfactualLab";
import { Diagnostics } from "@/components/swarm/Diagnostics";
import { Replay } from "@/components/swarm/Replay";
import { MarketTicker } from "@/components/swarm/MarketTicker";
import { ErrorBoundary } from "@/components/swarm/ErrorBoundary";
import { useSwarmStore } from "@/lib/swarm/store";
import type { SwarmRequest } from "@/lib/swarm/types";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "SwarmAlpha — 多Agent共识动力学基础设施" }] }),
  component: Lab,
});

const DEFAULT_NEWS = "美联储意外宣布降息50个基点，远超市场预期，鸽派信号明确，市场情绪转向乐观。";

function Lab() {
  const [request, setRequest] = useState<SwarmRequest>({
    version: "v9", news: DEFAULT_NEWS, rounds: 3,
    llmConfig: { provider: "deepseek", model: "deepseek-chat" }, enableVRoute: true,
  });
  const run = useSwarmStore((s) => s.run);
  const result = useSwarmStore((s) => s.result);
  const loading = useSwarmStore((s) => s.loading);
  const error = useSwarmStore((s) => s.error);

  function handleRun() {
    if (!request.news.trim()) { toast.error("请先输入新闻刺激"); return; }
    toast.promise(run(request), {
      loading: "正在运行群体智能推演…",
      success: "实验完成",
      error: (e) => `失败: ${(e as Error).message}`,
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <SwarmHeader onRun={handleRun} canRun={!loading} />
      <div className="border-b border-border"><div className="mx-auto max-w-[1600px] px-8 py-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">SwarmAlpha · 共识推演 · {new Date().toISOString().slice(0, 10)}</div>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">多Agent共识动力学研究环境</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">向群体输入信息，观察多个认知视角如何形成信念、相互对话，最终收敛到共识或走向极化。金融是第一个验证场景，核心机制可适配任何多Agent协作场景。</p>
      </div></div>
      <MarketTicker />
      <Section index={1} label="推演控制台" title="控制面板">
        <ExperimentConsole request={request} onChange={setRequest} onRun={handleRun} />
      </Section>
      {error && <div className="mx-auto max-w-[1600px] px-8 pb-4"><div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">错误: {error}</div></div>}

      {result ? (
        <>
          <Section index={2} label="实时仪表盘" title="共识状态"><ErrorBoundary name="LiveDashboard"><LiveDashboard metrics={result.data.v9_5.metrics} final={result.data.final} /></ErrorBoundary></Section>
          <Section index={3} label="维度分析" title="信息维度"><ErrorBoundary name="FactorAnalysis"><FactorAnalysis data={result.data.factorVector} /></ErrorBoundary></Section>
          <Section index={4} label="认知网络" title="关系拓扑"><ErrorBoundary name="AgentSociety"><AgentSocietyNetwork data={result.data} /></ErrorBoundary></Section>
          <Section index={5} label="认知主体" title="视角详情"><ErrorBoundary name="AgentDrawer"><AgentDrawer data={result.data} /></ErrorBoundary></Section>
          <Section index={6} label="推理时间线" title="演化轨迹"><ErrorBoundary name="Timeline"><ExplainableTimeline data={result.data} /></ErrorBoundary></Section>
          <Section index={7} label="共识演化" title="收敛动力学"><ErrorBoundary name="ConsensusEvo"><ConsensusEvolution data={result.data} /></ErrorBoundary></Section>
          <Section index={8} label="反事实" title="假设推演"><ErrorBoundary name="Counterfactual"><CounterfactualLab data={result.data} /></ErrorBoundary></Section>
          <Section index={9} label="诊断" title="共识质量"><ErrorBoundary name="Diagnostics"><Diagnostics data={result.data} /></ErrorBoundary></Section>
          <Section index={10} label="回放" title="推演复盘"><ErrorBoundary name="Replay"><Replay data={result.data} /></ErrorBoundary></Section>
          <div className="border-t border-border"><div className="mx-auto max-w-[1600px] px-8 py-6 font-mono text-[10px] text-muted-foreground">SwarmAlpha · {result.data.v9_5Agents.length} 认知主体 · {result.data.rounds.length} 轮 · 引擎 {result.version}</div></div>
        </>
      ) : (
        <EmptyState onRun={handleRun} loading={loading} />
      )}
      <Toaster theme="dark" />
    </div>
  );
}

function EmptyState({ onRun, loading }: { onRun: () => void; loading: boolean }) {
  return (
    <div className="mx-auto max-w-[1600px] px-8 py-24">
      <div className="lab-card lab-grid-bg flex flex-col items-center gap-4 px-8 py-20 text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">空闲状态</div>
        <h3 className="text-xl font-semibold text-foreground">暂无共识推演</h3>
        <p className="max-w-md text-sm text-muted-foreground">在上方配置输入信息与推演参数，然后启动共识推演。</p>
        <button onClick={onRun} disabled={loading} className="mt-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:bg-foreground/90 disabled:opacity-60">{loading ? "推演中…" : "启动首次推演"}</button>
      </div>
    </div>
  );
}
