import { FinancialBenchmark, financialBenchmark } from "./financial";

export type BenchmarkType = "financial" | "medical" | "legal" | "business";

export interface BenchmarkRegistry {
  get(type: BenchmarkType): any;
  list(): BenchmarkType[];
}

export class BenchmarkManager {
  private benchmarks: Map<BenchmarkType, any> = new Map();

  constructor() {
    this.register("financial", financialBenchmark);
  }

  register(type: BenchmarkType, benchmark: any): void {
    this.benchmarks.set(type, benchmark);
  }

  get(type: BenchmarkType): any {
    return this.benchmarks.get(type);
  }

  list(): BenchmarkType[] {
    return Array.from(this.benchmarks.keys());
  }

  async runBenchmark(type: BenchmarkType, options?: Record<string, unknown>): Promise<any> {
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