import { describe, it, expect } from "vitest";
import { FinancialBenchmark, financialBenchmark, benchmarkManager } from "@/lib/benchmarks";

describe("FinancialBenchmark", () => {
  it("should have correct type", () => {
    expect(financialBenchmark.type).toBe("financial");
  });

  it("should return all scenarios", () => {
    const scenarios = financialBenchmark.getScenarios();
    expect(scenarios.length).toBeGreaterThan(0);
    scenarios.forEach(s => {
      expect(s).toHaveProperty("id");
      expect(s).toHaveProperty("news");
      expect(s).toHaveProperty("ticker");
      expect(s).toHaveProperty("groundTruth");
      expect(s).toHaveProperty("description");
    });
  });

  it("should return limited scenarios", () => {
    const scenarios = financialBenchmark.getScenarios(2);
    expect(scenarios.length).toBe(2);
  });

  it("should find scenario by id", () => {
    const scenario = financialBenchmark.getScenarioById("scenario_001");
    expect(scenario).toBeDefined();
    expect(scenario?.id).toBe("scenario_001");
  });

  it("should return undefined for unknown scenario id", () => {
    const scenario = financialBenchmark.getScenarioById("unknown");
    expect(scenario).toBeUndefined();
  });

  it("should run a single scenario", async () => {
    const scenario = financialBenchmark.getScenarios()[0];
    const result = await financialBenchmark.runScenario(scenario);
    
    expect(result).toHaveProperty("scenario");
    expect(result).toHaveProperty("groundTruth");
    expect(result).toHaveProperty("agentDecision");
    expect(result).toHaveProperty("evaluation");
    expect(result).toHaveProperty("metrics");
    expect(result.metrics).toHaveProperty("accuracy");
    expect(result.evaluation).toHaveProperty("overallScore");
    expect(result.evaluation).toHaveProperty("grade");
    expect(result.evaluation).toHaveProperty("dimensions");
  });

  it("should run all scenarios", async () => {
    const results = await financialBenchmark.runAll();
    expect(results.length).toBeGreaterThan(0);
    results.forEach(r => {
      expect(r.scenario).toBeDefined();
      expect(r.metrics.accuracy).toBeOneOf([0, 1]);
    });
  });

  it("should compute summary from results", async () => {
    const results = await financialBenchmark.runAll();
    const summary = financialBenchmark.computeSummary(results);
    
    expect(summary).toHaveProperty("totalScenarios");
    expect(summary).toHaveProperty("avgEvaluationScore");
    expect(summary).toHaveProperty("avgAccuracy");
    expect(summary).toHaveProperty("bestDimension");
    expect(summary).toHaveProperty("worstDimension");
    expect(summary).toHaveProperty("insights");
    expect(summary.totalScenarios).toBe(results.length);
    expect(summary.avgAccuracy).toBeGreaterThanOrEqual(0);
    expect(summary.avgAccuracy).toBeLessThanOrEqual(1);
  });

  it("should generate insights based on performance", async () => {
    const results = await financialBenchmark.runAll();
    const summary = financialBenchmark.computeSummary(results);
    
    expect(Array.isArray(summary.insights)).toBe(true);
    expect(summary.insights.length).toBeGreaterThan(0);
  });

  it("should have ground truth values of 'up' or 'down'", () => {
    const scenarios = financialBenchmark.getScenarios();
    scenarios.forEach(s => {
      expect(s.groundTruth).toBeOneOf(["up", "down"]);
    });
  });
});

describe("BenchmarkManager", () => {
  it("should have financial benchmark registered", () => {
    const benchmarks = benchmarkManager.list();
    expect(benchmarks).toContain("financial");
  });

  it("should get financial benchmark", () => {
    const benchmark = benchmarkManager.get("financial");
    expect(benchmark).toBeDefined();
    expect(benchmark.type).toBe("financial");
  });

  it("should return undefined for unknown benchmark type", () => {
    const benchmark = benchmarkManager.get("medical" as any);
    expect(benchmark).toBeUndefined();
  });

  it("should run benchmark and return results", async () => {
    const result = await benchmarkManager.runBenchmark("financial");
    
    expect(result).toHaveProperty("results");
    expect(result).toHaveProperty("summary");
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
  });
});