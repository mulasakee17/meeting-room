import { NextResponse } from "next/server";
import { benchmarkManager } from "@/lib/benchmarks";
import { adapterRegistry } from "@/lib/adapters";
import { sanitizeString } from "@/lib/security/validation";
import { checkRateLimit, RATE_LIMIT_PRESETS, getClientIdentifier } from "@/lib/security/rateLimit";
import { NextRequest } from "next/server";

interface BenchmarkRequest {
  version: "v3";
  benchmarkType: "financial" | "medical" | "legal" | "business";
  dataset?: string;
  scenarios?: string[];
  llmConfig?: {
    provider: "openai" | "anthropic" | "deepseek" | "local";
    model: string;
  };
  agentConfig?: {
    provider: "autogen" | "crewai" | "langgraph" | "custom";
    agentCount?: number;
  };
}

interface BenchmarkResponse {
  success: boolean;
  benchmarkId: string;
  results: any[];
  summary: any;
}

export async function POST(request: NextRequest) {
  try {
    // ---- Rate limiting ---------------------------------------------------
    const clientId = getClientIdentifier(request);
    const rateCheck = checkRateLimit(clientId, RATE_LIMIT_PRESETS.experiment);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many requests", retryAfter: rateCheck.retryAfter } },
        { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter) } }
      );
    }

    // ---- Parse & validate body -------------------------------------------
    const body = await request.json();

    if (body.version !== "v3") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_VERSION", message: "Unsupported version" } },
        { status: 400 }
      );
    }

    const benchmarkType = body.benchmarkType as "financial" | "medical" | "legal" | "business";

    if (!benchmarkType || typeof benchmarkType !== "string") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: "benchmarkType is required" } },
        { status: 400 }
      );
    }

    // Sanitize benchmark type
    const safeType = sanitizeString(benchmarkType) as BenchmarkRequest["benchmarkType"];

    if (!benchmarkManager.list().includes(safeType)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_BENCHMARK", message: `Benchmark type ${safeType} not supported` } },
        { status: 400 }
      );
    }

    // Build adapter options for real agent execution
    const adapterProvider = body.agentConfig?.provider || "custom";
    const adapter = adapterRegistry.get(adapterProvider);
    const llmConfig = body.llmConfig || { provider: "deepseek", model: "deepseek-chat" };
    const benchmarkOptions = {
      adapter,
      llmConfig,
      agentCount: body.agentConfig?.agentCount,
    };

    const benchmarkId = `benchmark_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const { results, summary } = await benchmarkManager.runBenchmark(safeType, benchmarkOptions);

    const response: BenchmarkResponse = {
      success: true,
      benchmarkId,
      results,
      summary,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { code: "BENCHMARK_ERROR", message: "Benchmark execution failed", details: error instanceof Error ? error.message : "Unknown error" } },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const clientId = getClientIdentifier(request);
    const rateCheck = checkRateLimit(clientId, RATE_LIMIT_PRESETS.relaxed);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many requests", retryAfter: rateCheck.retryAfter } },
        { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter) } }
      );
    }

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