"use client";

import { useState, useCallback } from "react";
import { DEMO_SCENARIOS, type DemoScenario, type DemoResult } from "@/lib/demo-data";

type Mode = "demo" | "live";
type View = "compare" | "detail";

export default function Home() {
  const [mode, setMode] = useState<Mode>("demo");
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [view, setView] = useState<View>("compare");
  const [loading, setLoading] = useState(false);
  const [singleResult, setSingleResult] = useState<DemoResult | null>(null);
  const [swarmResult, setSwarmResult] = useState<DemoResult | null>(null);
  const [customInput, setCustomInput] = useState("");

  const scenario = DEMO_SCENARIOS[scenarioIdx];

  const runDemo = useCallback(() => {
    setSingleResult(scenario.singleAgent);
    setSwarmResult(scenario.swarmAgents);
  }, [scenario]);

  const runLive = useCallback(async () => {
    setLoading(true);
    const question = customInput || scenario.question;

    const buildBody = (agentCount: number) => ({
      version: "v3",
      input: { type: "text", content: question },
      agentConfig: { provider: "custom" as const, agentCount },
      llmConfig: { provider: "deepseek" as const, model: "deepseek-chat" },
    });

    try {
      const [singleRes, swarmRes] = await Promise.all([
        fetch("/api/v3/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildBody(1)) }),
        fetch("/api/v3/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildBody(5)) }),
      ]);

      const singleData = await singleRes.json();
      const swarmData = await swarmRes.json();

      if (singleData.success) {
        setSingleResult({
          decision: singleData.data.output.finalDecision,
          confidence: Math.round((singleData.data.output.confidence || 0) * 100),
          overallScore: singleData.data.evaluation?.overallScore || 0,
          grade: singleData.data.evaluation?.grade || "fair",
          summary: singleData.data.evaluation?.summary || "",
          dimensions: mapDimensions(singleData.data.evaluation?.dimensions),
          governance: undefined,
          agents: singleData.data.agents?.map((a: any) => ({
            id: a.id, name: a.name, role: a.role, belief: 0, confidence: 0,
          })),
          trace: ["单人接收问题", "独立分析", "输出结论"],
        });
      }
      if (swarmData.success) {
        setSwarmResult({
          decision: swarmData.data.output.finalDecision,
          confidence: Math.round((swarmData.data.output.confidence || 0) * 100),
          overallScore: swarmData.data.evaluation?.overallScore || 0,
          grade: swarmData.data.evaluation?.grade || "fair",
          summary: swarmData.data.evaluation?.summary || "",
          dimensions: mapDimensions(swarmData.data.evaluation?.dimensions),
          governance: swarmData.data.governance ? {
            echoChamber: { detected: swarmData.data.governance.echoChamber?.detected || false, severity: swarmData.data.governance.echoChamber?.severity || "low", info: "" },
            authorityBias: { detected: swarmData.data.governance.authorityBias?.detected || false, severity: swarmData.data.governance.authorityBias?.severity || "low", info: "" },
            polarization: { detected: swarmData.data.governance.polarization?.detected || false, severity: swarmData.data.governance.polarization?.severity || "low", info: "" },
            summary: swarmData.data.governance.summary || "",
          } : undefined,
          agents: swarmData.data.agents?.map((a: any) => ({
            id: a.id, name: a.name, role: a.role, belief: 0, confidence: 0,
          })),
          trace: [],
        });
      }
    } catch (e) {
      console.error("Live mode failed, falling back to demo:", e);
      runDemo();
    } finally {
      setLoading(false);
    }
  }, [customInput, scenario, runDemo]);

  const handleRun = () => {
    if (mode === "demo") {
      runDemo();
    } else {
      runLive();
    }
  };

  // Auto-run demo on scenario change
  const handleScenarioChange = (idx: number) => {
    setScenarioIdx(idx);
    if (mode === "demo") {
      setSingleResult(DEMO_SCENARIOS[idx].singleAgent);
      setSwarmResult(DEMO_SCENARIOS[idx].swarmAgents);
    }
  };

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    if (newMode === "demo") {
      setSingleResult(scenario.singleAgent);
      setSwarmResult(scenario.swarmAgents);
    } else {
      setSingleResult(null);
      setSwarmResult(null);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🐜</span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">SwarmAlpha V3</h1>
              <p className="text-xs text-zinc-500">LLM Multi-Agent 集体决策 vs 单人决策 对比实验</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Demo/Live toggle */}
            <div className="flex items-center bg-zinc-800 rounded-lg p-1">
              <button
                onClick={() => handleModeChange("demo")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === "demo" ? "bg-emerald-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                ⚡ Demo
              </button>
              <button
                onClick={() => handleModeChange("live")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === "live" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                🔗 Live
              </button>
            </div>
            {/* View toggle */}
            <button
              onClick={() => setView(v => v === "compare" ? "detail" : "compare")}
              className="text-xs text-zinc-500 hover:text-zinc-300 bg-zinc-800 px-3 py-1.5 rounded-lg"
            >
              {view === "compare" ? "详情模式" : "对比模式"}
            </button>
          </div>
        </div>
      </header>

      {/* Scenario Selector */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex flex-wrap gap-2 mb-4">
          {DEMO_SCENARIOS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => handleScenarioChange(i)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                i === scenarioIdx
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>

        {/* Custom input for live mode */}
        {mode === "live" && (
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              placeholder={scenario.question}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleRun}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-semibold text-sm transition-colors"
            >
              {loading ? "执行中..." : "🚀 开始决策"}
            </button>
          </div>
        )}

        {mode === "demo" && !singleResult && (
          <button
            onClick={handleRun}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold text-lg transition-colors w-full"
          >
            🚀 运行对比实验
          </button>
        )}
      </div>

      {/* Results */}
      {singleResult && swarmResult && (
        <div className="max-w-7xl mx-auto px-4 pb-12">
          {view === "compare" ? (
            <CompareView
              scenario={scenario}
              singleResult={singleResult}
              swarmResult={swarmResult}
            />
          ) : (
            <DetailView
              singleResult={singleResult}
              swarmResult={swarmResult}
            />
          )}
        </div>
      )}

      {/* Empty state */}
      {!singleResult && !swarmResult && mode === "demo" && (
        <div className="max-w-2xl mx-auto px-4 py-24 text-center">
          <div className="text-7xl mb-6">🐜🐜🐜</div>
          <h2 className="text-2xl font-bold mb-3">SwarmAlpha 集体决策实验</h2>
          <p className="text-zinc-500 mb-6">
            选择上方场景，点击"运行对比实验"，观察 5 个 AI Agent 通过讨论、质疑、综合
            得出的集体决策，与单人决策的差异。
          </p>
          <div className="grid grid-cols-3 gap-4 text-sm text-zinc-500">
            <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
              <div className="text-2xl mb-2">🧠</div>
              <div className="font-semibold text-zinc-300 mb-1">多视角分析</div>
              <div>5 位专家角色不同视角交叉验证</div>
            </div>
            <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
              <div className="text-2xl mb-2">🛡️</div>
              <div className="font-semibold text-zinc-300 mb-1">偏差治理</div>
              <div>实时检测回音室、权威偏见、群体极化</div>
            </div>
            <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
              <div className="text-2xl mb-2">📊</div>
              <div className="font-semibold text-zinc-300 mb-1">7 维评估</div>
              <div>共识度、可靠性、可解释性、鲁棒性等全面评分</div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ============================================================================
// Compare View — side-by-side 1 Agent vs 5 Agent Swarm
// ============================================================================

function CompareView({ scenario, singleResult, swarmResult }: {
  scenario: DemoScenario;
  singleResult: DemoResult;
  swarmResult: DemoResult;
}) {
  const delta = swarmResult.overallScore - singleResult.overallScore;

  return (
    <div>
      {/* Score Delta Banner */}
      <div className="bg-zinc-900/50 rounded-xl p-5 border border-zinc-800 mb-6 text-center">
        <div className="text-sm text-zinc-500 mb-1">集体智慧增益</div>
        <div className={`text-5xl font-bold ${delta > 20 ? "text-emerald-400" : delta > 10 ? "text-blue-400" : "text-amber-400"}`}>
          +{delta}
        </div>
        <div className="text-sm text-zinc-500 mt-1">
          综合评分提升 {delta > 20 ? "显著" : "明显"} · 5 个 Agent 协作 vs 1 个 Agent 独立
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Single Agent */}
        <ResultCard
          title="🧑 单人决策"
          subtitle="1 个 AI Agent 独立分析"
          result={singleResult}
          colorClass="border-zinc-700"
          scenario={scenario}
          showGovernance={false}
        />

        {/* Right: Swarm */}
        <ResultCard
          title="🐜 SwarmAlpha 集体决策"
          subtitle="5 个 AI Agent 多轮讨论"
          result={swarmResult}
          colorClass="border-emerald-500/30"
          scenario={scenario}
          showGovernance={true}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Detail View — expanded with traces
// ============================================================================

function DetailView({ singleResult, swarmResult }: {
  singleResult: DemoResult;
  swarmResult: DemoResult;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900/50 rounded-xl p-5 border border-zinc-800">
          <h3 className="font-semibold mb-3">🧑 单人决策过程</h3>
          <div className="space-y-2">
            {singleResult.trace.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-zinc-400">
                <span className="text-zinc-600">{i + 1}.</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-zinc-900/50 rounded-xl p-5 border border-emerald-500/30">
          <h3 className="font-semibold mb-3">🐜 Swarm 讨论过程</h3>
          <div className="space-y-2">
            {swarmResult.trace.map((t, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">{i + 1}.</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Agent lists side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AgentList agents={singleResult.agents || []} title="单人 Agent" />
        {swarmResult.agents && <AgentList agents={swarmResult.agents} title="Swarm Agents" />}
      </div>

      {/* Governance detail */}
      {swarmResult.governance && (
        <GovernancePanel governance={swarmResult.governance} />
      )}
    </div>
  );
}

// ============================================================================
// Shared Components
// ============================================================================

function ResultCard({ title, subtitle, result, colorClass, scenario, showGovernance }: {
  title: string;
  subtitle: string;
  result: DemoResult;
  colorClass: string;
  scenario: DemoScenario;
  showGovernance: boolean;
}) {
  return (
    <div className={`bg-zinc-900/50 rounded-xl p-5 border ${colorClass}`}>
      <h2 className="font-semibold text-lg mb-1">{title}</h2>
      <p className="text-xs text-zinc-500 mb-4">{subtitle}</p>

      {/* Score + Grade */}
      <div className="flex items-center gap-4 mb-4">
        <div className="text-center">
          <div className={`text-4xl font-bold ${scoreColor(result.overallScore)}`}>
            {result.overallScore}
          </div>
          <div className={`text-xs font-semibold uppercase ${gradeColor(result.grade)}`}>
            {result.grade}
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-zinc-500">置信度</span>
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
              {result.confidence}%
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">{result.summary}</p>
        </div>
      </div>

      {/* Decision */}
      <div className="bg-zinc-950 rounded-lg p-3 mb-4">
        <div className="text-xs text-zinc-500 mb-2">决策结论</div>
        <p className="text-sm leading-relaxed text-zinc-200">{result.decision}</p>
      </div>

      {/* 7 Dimensions */}
      <div className="space-y-2 mb-4">
        <div className="text-xs text-zinc-500 mb-2">七维评估</div>
        {Object.entries(result.dimensions).map(([key, dim]) => (
          <DimensionBar key={key} label={dim.label} score={dim.score} />
        ))}
      </div>

      {/* Governance (Swarm only) */}
      {showGovernance && result.governance && (
        <div className="border-t border-zinc-800 pt-4 mt-2">
          <div className="text-xs text-zinc-500 mb-3">偏差治理检测</div>
          <div className="grid grid-cols-3 gap-3">
            <MiniGovCard
              icon={result.governance.echoChamber.detected ? "⚠️" : "✅"}
              label="回音室"
              detected={result.governance.echoChamber.detected}
              info={result.governance.echoChamber.info}
            />
            <MiniGovCard
              icon={result.governance.authorityBias.detected ? "⚠️" : "✅"}
              label="权威偏见"
              detected={result.governance.authorityBias.detected}
              info={result.governance.authorityBias.info}
            />
            <MiniGovCard
              icon={result.governance.polarization.detected ? "⚠️" : "✅"}
              label="群体极化"
              detected={result.governance.polarization.detected}
              info={result.governance.polarization.info}
            />
          </div>
          <p className="text-xs text-zinc-500 mt-3">{result.governance.summary}</p>
        </div>
      )}
    </div>
  );
}

function DimensionBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-xs text-zinc-500 w-28 truncate">{label}</div>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="text-xs font-mono text-zinc-400 w-8 text-right">{score}</div>
    </div>
  );
}

function MiniGovCard({ icon, label, detected, info }: {
  icon: string; label: string; detected: boolean; info: string;
}) {
  return (
    <div className={`p-3 rounded-lg text-center ${detected ? "bg-red-500/10 border border-red-500/30" : "bg-zinc-950"}`}>
      <div className="text-lg">{icon}</div>
      <div className="text-xs font-semibold mt-1">{label}</div>
      <div className="text-xs text-zinc-500 mt-1 leading-tight">{info}</div>
    </div>
  );
}

function AgentList({ agents, title }: {
  agents: Array<{ id: string; name: string; role: string; belief: number; confidence: number }>;
  title: string;
}) {
  return (
    <div className="bg-zinc-900/50 rounded-xl p-5 border border-zinc-800">
      <h3 className="font-semibold mb-3">{title}</h3>
      <div className="space-y-2">
        {agents.map(a => (
          <div key={a.id} className="bg-zinc-950 rounded-lg p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">{a.name}</div>
              <div className="text-xs text-zinc-500">{a.role}</div>
            </div>
            <div className="text-right">
              <div className={`text-sm font-mono ${a.belief > 0 ? "text-emerald-400" : a.belief < 0 ? "text-red-400" : "text-zinc-400"}`}>
                {a.belief > 0 ? "+" : ""}{a.belief.toFixed(2)}
              </div>
              <div className="text-xs text-zinc-500">{a.confidence}% conf</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GovernancePanel({ governance }: { governance: NonNullable<DemoResult["governance"]> }) {
  return (
    <div className="bg-zinc-900/50 rounded-xl p-5 border border-zinc-800">
      <h3 className="font-semibold mb-4">🛡️ 治理检测详情</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-950 rounded-lg p-4">
          <div className="font-semibold text-sm mb-2">回音室检测</div>
          <div className={`text-sm ${governance.echoChamber.detected ? "text-red-400" : "text-emerald-400"}`}>
            {governance.echoChamber.detected ? "⚠️ 检测到" : "✅ 未检测到"}
          </div>
          <div className="text-xs text-zinc-500 mt-1">{governance.echoChamber.info}</div>
        </div>
        <div className="bg-zinc-950 rounded-lg p-4">
          <div className="font-semibold text-sm mb-2">权威偏见</div>
          <div className={`text-sm ${governance.authorityBias.detected ? "text-red-400" : "text-emerald-400"}`}>
            {governance.authorityBias.detected ? "⚠️ 检测到" : "✅ 未检测到"}
          </div>
          <div className="text-xs text-zinc-500 mt-1">{governance.authorityBias.info}</div>
        </div>
        <div className="bg-zinc-950 rounded-lg p-4">
          <div className="font-semibold text-sm mb-2">群体极化</div>
          <div className={`text-sm ${governance.polarization.detected ? "text-red-400" : "text-emerald-400"}`}>
            {governance.polarization.detected ? "⚠️ 检测到" : "✅ 未检测到"}
          </div>
          <div className="text-xs text-zinc-500 mt-1">{governance.polarization.info}</div>
        </div>
      </div>
      <p className="text-sm text-zinc-400 mt-4">{governance.summary}</p>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function mapDimensions(rawDims: Record<string, any> | undefined): DemoResult["dimensions"] {
  const result: DemoResult["dimensions"] = {};
  if (!rawDims) return result;
  const labels: Record<string, string> = {
    consensus: "共识度", reliability: "可靠性", explainability: "可解释性",
    robustness: "鲁棒性", stability: "稳定性",
    manipulationResistance: "抗操纵性", influenceAnalysis: "影响分析",
  };
  for (const [key, dim] of Object.entries(rawDims)) {
    result[key] = { score: typeof dim.score === "number" ? dim.score : dim, label: labels[key] || key };
  }
  return result;
}

function scoreColor(s: number) {
  if (s >= 85) return "text-emerald-400";
  if (s >= 70) return "text-blue-400";
  if (s >= 55) return "text-amber-400";
  return "text-red-400";
}

function barColor(s: number) {
  if (s >= 80) return "bg-emerald-500";
  if (s >= 60) return "bg-blue-500";
  if (s >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function gradeColor(g: string) {
  switch (g) {
    case "excellent": return "text-emerald-400";
    case "good": return "text-blue-400";
    case "fair": return "text-amber-400";
    case "poor": return "text-orange-400";
    case "critical": return "text-red-400";
    default: return "text-zinc-400";
  }
}
