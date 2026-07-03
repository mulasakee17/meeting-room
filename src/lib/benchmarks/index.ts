import { FinancialBenchmark, financialBenchmark, type FinancialBenchmarkResult, type FinancialBenchmarkSummary } from "./financial";

export type BenchmarkType = "financial" | "medical" | "legal" | "business";

/** 基准测试必须实现的接口 */
export interface Benchmark {
  type: string;
  getScenarios?(count?: number): unknown[];
  getScenarioById?(id: string): unknown;
  runAll(options?: Record<string, unknown>): Promise<FinancialBenchmarkResult[]>;
  computeSummary(results: FinancialBenchmarkResult[]): FinancialBenchmarkSummary;
}

export class BenchmarkManager {
  private benchmarks: Map<BenchmarkType, Benchmark> = new Map();

  constructor() {
    this.register("financial", financialBenchmark);
  }

  register(type: BenchmarkType, benchmark: Benchmark): void {
    this.benchmarks.set(type, benchmark);
  }

  get(type: BenchmarkType): Benchmark | undefined {
    return this.benchmarks.get(type);
  }

  list(): BenchmarkType[] {
    return Array.from(this.benchmarks.keys());
  }

  async runBenchmark(type: BenchmarkType, options?: Record<string, unknown>): Promise<{
    results: FinancialBenchmarkResult[];
    summary: FinancialBenchmarkSummary;
  }> {
    const benchmark = this.get(type);
    if (!benchmark) {
      throw new Error(`Benchmark type ${type} not found`);
    }
    const results = await benchmark.runAll(options);
    const summary = benchmark.computeSummary(results);
    return { results, summary };
  }
}

export const benchmarkManager = new BenchmarkManager();

export { FinancialBenchmark, financialBenchmark };