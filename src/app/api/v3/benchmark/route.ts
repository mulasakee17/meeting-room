import { NextResponse } from "next/server";
import { benchmarkManager } from "@/lib/benchmarks";

interface BenchmarkRequest {
  version: "v3";
  benchmarkType: "financial" | "medical" | "legal" | "business";
  dataset?: string;
  scenarios?: string[];
}

interface BenchmarkResponse {
  success: boolean;
  benchmarkId: string;
  results: any[];
  summary: any;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.version !== "v3") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_VERSION", message: "Unsupported version" } },
        { status: 400 }
      );
    }

    const benchmarkType = body.benchmarkType as "financial" | "medical" | "legal" | "business";
    
    if (!benchmarkManager.list().includes(benchmarkType)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_BENCHMARK", message: `Benchmark type ${benchmarkType} not supported` } },
        { status: 400 }
      );
    }

    const benchmarkId = `benchmark_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const { results, summary } = await benchmarkManager.runBenchmark(benchmarkType);

    const response: BenchmarkResponse = {
      success: true,
      benchmarkId,
      results,
      summary,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { code: "BENCHMARK_ERROR", message: error instanceof Error ? error.message : "Unknown error" } },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const benchmarks = benchmarkManager.list();
    
    const benchmarkInfo = benchmarks.map(type => {
      const benchmark = benchmarkManager.get(type);
      const scenarios = benchmark?.getScenarios?.() || [];
      return {
        type,
        scenarioCount: scenarios.length,
      };
    });

    return NextResponse.json({
      success: true,
      benchmarks: benchmarkInfo,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { code: "GET_ERROR", message: error instanceof Error ? error.message : "Unknown error" } },
      { status: 500 }
    );
  }
}