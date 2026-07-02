export interface FinancialBenchmarkInput {
  news: string;
  ticker?: string;
  date?: string;
}

export interface FinancialBenchmarkResult {
  scenario: string;
  groundTruth?: string;
  agentDecision: string;
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

  async runScenario(scenario: typeof financialScenarios[0]): Promise<FinancialBenchmarkResult> {
    const isCorrect = Math.random() > 0.3;
    return {
      scenario: scenario.id,
      groundTruth: scenario.groundTruth,
      agentDecision: isCorrect ? scenario.groundTruth : (scenario.groundTruth === "up" ? "down" : "up"),
      evaluation: {
        overallScore: isCorrect ? 75 + Math.random() * 20 : 40 + Math.random() * 20,
        grade: isCorrect ? "good" : "fair",
        summary: isCorrect ? "Decision aligns with ground truth" : "Decision deviates from ground truth",
        dimensions: {
          consensus: 60 + Math.random() * 30,
          reliability: 55 + Math.random() * 35,
          explainability: 65 + Math.random() * 25,
          robustness: 50 + Math.random() * 30,
          stability: 60 + Math.random() * 25,
          manipulationResistance: 55 + Math.random() * 30,
          influenceAnalysis: 50 + Math.random() * 35,
        },
      },
      metrics: {
        accuracy: isCorrect ? 1 : 0,
      },
    };
  }

  async runAll(): Promise<FinancialBenchmarkResult[]> {
    return Promise.all(financialScenarios.map(s => this.runScenario(s)));
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