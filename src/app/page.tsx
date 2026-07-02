"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [input, setInput] = useState("分析人工智能在医疗领域的应用前景");
  const [agentCount, setAgentCount] = useState(5);
  const [framework, setFramework] = useState<"custom" | "autogen">("custom");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/v3/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: "v3",
          input: {
            type: "text",
            content: input,
          },
          agentConfig: {
            provider: framework,
            agentCount,
          },
          llmConfig: {
            provider: "deepseek",
            model: "deepseek-chat",
          },
        }),
      });

      const data = await response.json();
      if (data.success) {
        setResult(data.data);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case "excellent": return "text-emerald-400";
      case "good": return "text-blue-400";
      case "fair": return "text-amber-400";
      case "poor": return "text-orange-400";
      case "critical": return "text-red-400";
      default: return "text-zinc-400";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-emerald-500";
    if (score >= 60) return "bg-blue-500";
    if (score >= 40) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-4xl">🐜</span>
          <div>
            <h1 className="text-3xl font-bold">SwarmAlpha V3</h1>
            <p className="text-sm text-zinc-500">LLM Multi-Agent 集体决策评价与治理研究平台</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800">
              <h2 className="text-lg font-semibold mb-4">决策输入</h2>
              <textarea
                className="w-full h-32 bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-blue-500"
                placeholder="输入需要决策的问题..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            </div>

            <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800">
              <h2 className="text-lg font-semibold mb-4">Agent 配置</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Agent 数量</label>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={agentCount}
                    onChange={(e) => setAgentCount(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Agent 框架</label>
                  <select
                    value={framework}
                    onChange={(e) => setFramework(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="custom">Custom</option>
                    <option value="autogen">AutoGen</option>
                  </select>
                </div>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {loading ? "执行中..." : "🚀 开始决策"}
            </button>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {result ? (
              <>
                <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800">
                  <h2 className="text-lg font-semibold mb-4">决策结果</h2>
                  <div className="space-y-3">
                    <div className="bg-zinc-950 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-zinc-400">最终决策</span>
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">
                          置信度: {(result.output.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-sm">{result.output.finalDecision}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800">
                  <h2 className="text-lg font-semibold mb-4">评价结果</h2>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="text-center">
                      <div className="text-4xl font-bold">{result.evaluation.overallScore}</div>
                      <div className={`text-sm ${getGradeColor(result.evaluation.grade)}`}>
                        {result.evaluation.grade.toUpperCase()}
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-zinc-400">{result.evaluation.summary}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(result.evaluation.dimensions).map(([key, value]: [string, any]) => (
                      <div key={key} className="bg-zinc-950 rounded-lg p-4">
                        <div className="text-xs text-zinc-500 mb-2 uppercase">{key}</div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${getScoreColor(value.score)}`}
                              style={{ width: `${value.score}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold">{value.score.toFixed(0)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800">
                  <h2 className="text-lg font-semibold mb-4">治理结果</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className={`p-4 rounded-lg ${result.governance.echoChamber.detected ? "bg-red-500/10 border border-red-500/30" : "bg-zinc-950"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span>{result.governance.echoChamber.detected ? "⚠️" : "✅"}</span>
                        <span className="text-sm font-semibold">回音室检测</span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        {result.governance.echoChamber.detected ? `严重程度: ${result.governance.echoChamber.severity}` : "未检测到"}
                      </p>
                      {result.governance.echoChamber.intervention.applied && (
                        <p className="text-xs text-emerald-400 mt-2">
                          干预: {result.governance.echoChamber.intervention.effect}
                        </p>
                      )}
                    </div>

                    <div className={`p-4 rounded-lg ${result.governance.authorityBias.detected ? "bg-amber-500/10 border border-amber-500/30" : "bg-zinc-950"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span>{result.governance.authorityBias.detected ? "⚠️" : "✅"}</span>
                        <span className="text-sm font-semibold">权威偏见</span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        {result.governance.authorityBias.detected ? `严重程度: ${result.governance.authorityBias.severity}` : "未检测到"}
                      </p>
                    </div>

                    <div className={`p-4 rounded-lg ${result.governance.polarization.detected ? "bg-orange-500/10 border border-orange-500/30" : "bg-zinc-950"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span>{result.governance.polarization.detected ? "⚠️" : "✅"}</span>
                        <span className="text-sm font-semibold">群体极化</span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        {result.governance.polarization.detected ? `严重程度: ${result.governance.polarization.severity}` : "未检测到"}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-500 mt-4">{result.governance.summary}</p>
                </div>

                <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800">
                  <h2 className="text-lg font-semibold mb-4">Agent 列表</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {result.agents.map((agent: any) => (
                      <div key={agent.id} className="bg-zinc-950 rounded-lg p-3 text-center">
                        <div className="text-xs text-zinc-500">{agent.id}</div>
                        <div className="text-sm font-semibold">{agent.name}</div>
                        <div className="text-xs text-zinc-400">{agent.role}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-zinc-900/50 rounded-xl p-12 border border-zinc-800 text-center">
                <div className="text-6xl mb-4">🤖</div>
                <h2 className="text-xl font-semibold mb-2">准备开始</h2>
                <p className="text-sm text-zinc-500">输入决策问题，点击"开始决策"按钮运行 Multi-Agent 决策流程</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 bg-zinc-900/50 rounded-xl p-6 border border-zinc-800">
          <h2 className="text-lg font-semibold mb-4">V3 API 端点</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Endpoint method="POST" path="/api/v3/execute" desc="同步执行决策任务" />
            <Endpoint method="POST" path="/api/v3/task" desc="异步创建决策任务" />
            <Endpoint method="GET" path="/api/v3/task?taskId=xxx" desc="查询任务状态" />
            <Endpoint method="POST" path="/api/v3/benchmark" desc="运行基准测试" />
            <Endpoint method="GET" path="/api/v3/benchmark" desc="列出可用基准" />
            <Endpoint method="GET" path="/api/health" desc="健康检查" />
          </div>
        </div>
      </div>
    </main>
  );
}

function Endpoint({
  method,
  path,
  desc,
}: {
  method: "GET" | "POST";
  path: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-zinc-950 rounded-lg p-3">
      <span
        className={`rounded px-2 py-1 text-xs font-semibold ${
          method === "POST"
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-blue-500/20 text-blue-400"
        }`}
      >
        {method}
      </span>
      <code className="text-sm text-zinc-300">{path}</code>
      <span className="text-xs text-zinc-500 ml-auto">{desc}</span>
    </div>
  );
}