import { FinancialBenchmark, financialBenchmark } from "./financial";
import type { FinancialBenchmarkResult, FinancialBenchmarkSummary } from "./financial";

// ============================================================================
// 类型
// ============================================================================

/** 支持的 benchmark 类型 — 加新类型只需在这里加一个字符串 */
export type BenchmarkType = "financial" | "medical" | "legal" | "business";

/** 通用的 benchmark 运行结果 */
export interface BenchmarkRunResult {
  type: BenchmarkType;
  results: BenchmarkResult[];
  summary: BenchmarkSummary;
}

/** 单场景结果 */
export interface BenchmarkResult {
  scenario: string;
  groundTruth?: string;
  agentDecision: string;
  accuracy: number;
  metrics: Record<string, number>;
}

/** 汇总统计 */
export interface BenchmarkSummary {
  totalScenarios: number;
  avgAccuracy: number;
  bestDimension?: string;
  worstDimension?: string;
  insights: string[];
  dimensions?: Record<string, number>;
}

/** 任何 benchmark 必须实现的接口 */
export interface Benchmark {
  /** 类型标识, 必须匹配 BenchmarkType */
  type: BenchmarkType;
  /** 返回场景列表 (可选) */
  getScenarios?(count?: number): unknown[];
  /** 按 ID 查找场景 (可选) */
  getScenarioById?(id: string): unknown;
  /** 运行全部场景 */
  runAll(options?: Record<string, unknown>): Promise<BenchmarkResult[]>;
  /** 从运行结果计算汇总 */
  computeSummary(results: BenchmarkResult[]): BenchmarkSummary;
}

// ============================================================================
// 管理器
// ============================================================================

export class BenchmarkManager {
  private benchmarks = new Map<BenchmarkType, Benchmark>();

  constructor() {
    this.register("financial", financialBenchmark as unknown as Benchmark);
  }

  /** 注册一个新的 benchmark 实现 */
  register(type: BenchmarkType, benchmark: Benchmark): void {
    this.benchmarks.set(type, benchmark);
  }

  /** 获取指定类型的 benchmark */
  get(type: BenchmarkType): Benchmark | undefined {
    return this.benchmarks.get(type);
  }

  /** 列出所有已注册的 benchmark 类型 */
  list(): BenchmarkType[] {
    return Array.from(this.benchmarks.keys());
  }

  /** 运行指定类型的 benchmark */
  async runBenchmark(
    type: BenchmarkType,
    options?: Record<string, unknown>,
  ): Promise<BenchmarkRunResult> {
    const benchmark = this.get(type);
    if (!benchmark) {
      throw new Error(`Benchmark type "${type}" not found. Available: ${this.list().join(", ")}`);
    }
    const results = await benchmark.runAll(options);
    const summary = benchmark.computeSummary(results);
    return { type, results, summary };
  }

  /** 是否已注册某类型 */
  has(type: BenchmarkType): boolean {
    return this.benchmarks.has(type);
  }
}

/** 全局单例 */
export const benchmarkManager = new BenchmarkManager();

// ============================================================================
// 导出
// ============================================================================

export { FinancialBenchmark, financialBenchmark };
export type { FinancialBenchmarkResult, FinancialBenchmarkSummary };
