import type { FrameworkAdapter } from "@/lib/adapters/types";
import type { LLMConfig } from "@/lib/llm/providers";

export interface FinancialBenchmarkInput {
  news: string;
  ticker?: string;
  date?: string;
}

export interface FinancialBenchmarkOptions {
  adapter?: FrameworkAdapter;
  llmConfig?: LLMConfig;
  agentCount?: number;
}

export interface FinancialBenchmarkResult {
  scenario: string;
  groundTruth?: string;
  agentDecision: string;
  /** 0-100 准确率, 与 BenchmarkResult.accuracy 对齐 */
  accuracy: number;
  evaluation: any;
  metrics: {
    accuracy?: number;
    precision?: number;
    recall?: number;
    f1?: number;
  };
}

export interface FinancialBenchmarkSummary {
  totalScenarios: number;
  avgEvaluationScore: number;
  avgAccuracy?: number;
  bestDimension: string;
  worstDimension: string;
  insights: string[];
}

const financialScenarios = [
  {
    id: "scenario_001",
    news: "Apple announces record quarterly earnings, beating analyst expectations by 15%. Revenue up 20% YoY.",
    ticker: "AAPL",
    date: "2024-01-25",
    groundTruth: "up",
    description: "Positive earnings surprise",
  },
  {
    id: "scenario_002",
    news: "Fed raises interest rates by 0.25%, signaling more hikes ahead. Inflation remains above target.",
    ticker: "^SPX",
    date: "2024-02-01",
    groundTruth: "down",
    description: "Interest rate hike",
  },
  {
    id: "scenario_003",
    news: "Tesla recalls 500,000 vehicles due to safety concerns. Stock drops 8% in pre-market trading.",
    ticker: "TSLA",
    date: "2024-02-15",
    groundTruth: "down",
    description: "Product recall",
  },
  {
    id: "scenario_004",
    news: "Microsoft acquires Activision Blizzard for $68.7 billion, completing the largest gaming acquisition in history.",
    ticker: "MSFT",
    date: "2024-03-01",
    groundTruth: "up",
    description: "Major acquisition",
  },
  {
    id: "scenario_005",
    news: "Oil prices surge 10% after OPEC+ announces production cuts of 1 million barrels per day.",
    ticker: "CL=F",
    date: "2024-03-15",
    groundTruth: "up",
    description: "Supply shock",
  },
];

export class FinancialBenchmark {
  type = "financial";

  getScenarios(count?: number): typeof financialScenarios {
    if (count) {
      return financialScenarios.slice(0, count);
    }
    return financialScenarios;
  }

  getScenarioById(id: string): typeof financialScenarios[0] | undefined {
    return financialScenarios.find(s => s.id === id);
  }

  /**
   * Run a single scenario.  When an adapter + llmConfig are provided the
   * benchmark actually invokes the agent swarm so the result reflects real
   * collective decision-making.  When omitted (backward-compatible path,
   * e.g. for unit tests that don't need LLM calls) a clearly-marked
   * placeholder is returned.
   */
  async runScenario(
    scenario: typeof financialScenarios[0],
    options?: FinancialBenchmarkOptions,
  ): Promise<FinancialBenchmarkResult> {
    // ---- Real agent execution path ----------------------------------------
    if (options?.adapter && options?.llmConfig) {
      try {
        const { adapter, llmConfig, agentCount } = options;
        const n = agentCount || 5;

        const agentConfigs = Array.from({ length: n }, (_, i) => ({
          id: `bench_agent_${i + 1}`,
          name: `Analyst ${i + 1}`,
          role: i === 0 ? "Analyst" : i === 1 ? "Critic" : i === 2 ? "Synthesizer" : "Expert",
          type: "default",
        }));

        const agents = await adapter.createAgents(agentConfigs, llmConfig);
        const result = await adapter.runInteraction(agents, {
          type: "text",
          content: `Analyze the following financial news and decide if it is bullish (up) or bearish (down):\n\n${scenario.news}\n\nTicker: ${scenario.ticker || "N/A"}\nDate: ${scenario.date || "unknown"}`,
        });

        // Dynamically import EvaluationEngine to avoid circular deps at module level
        const { EvaluationEngine } = await import("@/lib/evaluation");
        const engine = new EvaluationEngine();

        const agentDecisions = result.agentStates.map(s => ({
          agentId: s.agentId,
          content: s.lastMessage || "",
          confidence: s.confidence || 50,
          reasoning: s.reasoning || "",
          belief: s.belief || 0,
        }));

        const agentInfo = adapter.getAgentInfo(agents);

        const interactionHistory = [{
          round: 1,
          messages: result.messages.map(m => ({
            agentId: m.agentId,
            content: m.content,
            timestamp: m.timestamp,
          })),
          beliefs: Object.fromEntries(agentDecisions.map(d => [d.agentId, d.belief])),
          beliefChanges: {},
          converged: result.converged,
        }];

        const evaluation = engine.evaluate(
          agentDecisions,
          agentInfo,
          interactionHistory,
          result.finalDecision,
        );

        // Determine direction from the final decision text
        const decisionLower = result.finalDecision.toLowerCase();
        const isUp =
          decisionLower.includes("bullish") ||
          decisionLower.includes("上涨") ||
          decisionLower.includes("涨") ||
          decisionLower.includes("positive") ||
          decisionLower.includes("up");
        const isDown =
          decisionLower.includes("bearish") ||
          decisionLower.includes("下跌") ||
          decisionLower.includes("跌") ||
          decisionLower.includes("negative") ||
          decisionLower.includes("down");

        let agentDecision: string;
        if (isUp && !isDown) agentDecision = "up";
        else if (isDown && !isUp) agentDecision = "down";
        else agentDecision = "neutral";

        const isCorrect = agentDecision === scenario.groundTruth;

        await adapter.dispose(agents);

        return {
          scenario: scenario.id,
          groundTruth: scenario.groundTruth,
          agentDecision,
          accuracy: isCorrect ? 100 : 0,
          evaluation,
          metrics: {
            accuracy: isCorrect ? 1 : 0,
          },
        };
      } catch (error) {
        console.error(`[FinancialBenchmark] Scenario ${scenario.id} failed:`, error);
        // Fall through to error placeholder below
      }
    }

    // ---- Placeholder path (no adapter provided or execution failed) -------
    return {
      scenario: scenario.id,
      groundTruth: scenario.groundTruth,
      agentDecision: "NOT_EXECUTED",
      accuracy: 0,
      evaluation: {
        overallScore: 0,
        grade: "poor",
        summary: "Scenario not executed — no adapter/LLM config provided, or execution failed",
        dimensions: {
          consensus: 0,
          reliability: 0,
          dispersion: 0,
          stability: 0,
          influenceAnalysis: 0,
        },
      },
      metrics: {
        accuracy: 0,
      },
    };
  }

  async runAll(options?: FinancialBenchmarkOptions): Promise<FinancialBenchmarkResult[]> {
    return Promise.all(financialScenarios.map(s => this.runScenario(s, options)));
  }

  computeSummary(results: FinancialBenchmarkResult[]): FinancialBenchmarkSummary {
    const totalScenarios = results.length;
    const avgEvaluationScore = results.reduce((sum, r) => sum + (r.evaluation?.overallScore || 50), 0) / totalScenarios;
    const avgAccuracy = results.reduce((sum, r) => sum + (r.metrics.accuracy || 0), 0) / totalScenarios;

    const dimensionScores: Record<string, number[]> = {};
    results.forEach(r => {
      if (r.evaluation?.dimensions) {
        Object.entries(r.evaluation.dimensions).forEach(([dim, value]) => {
          if (!dimensionScores[dim]) dimensionScores[dim] = [];
          dimensionScores[dim].push(value as number);
        });
      }
    });

    let bestDimension = "consensus";
    let worstDimension = "reliability";
    let bestAvg = 0;
    let worstAvg = 100;

    Object.entries(dimensionScores).forEach(([dim, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg > bestAvg) { bestAvg = avg; bestDimension = dim; }
      if (avg < worstAvg) { worstAvg = avg; worstDimension = dim; }
    });

    const insights: string[] = [];
    if (avgAccuracy > 0.7) insights.push("High accuracy on financial benchmarks");
    else if (avgAccuracy > 0.5) insights.push("Moderate accuracy achieved");
    else insights.push("Performance below random chance");
    
    const reliabilityAvg = dimensionScores.reliability?.reduce((a, b) => a + b, 0) / (dimensionScores.reliability.length || 1);
    if (reliabilityAvg < 50) insights.push("Reliability needs improvement");
    else if (reliabilityAvg > 70) insights.push("Good reliability scores");
    
    const bestDimAvg = Object.entries(dimensionScores).reduce((max, [dim, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return avg > max.avg ? { dim, avg } : max;
    }, { dim: "", avg: 0 });
    insights.push(`Best performing dimension: ${bestDimAvg.dim}`);

    return {
      totalScenarios,
      avgEvaluationScore,
      avgAccuracy,
      bestDimension,
      worstDimension,
      insights,
    };
  }
}

export const financialBenchmark = new FinancialBenchmark();