import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { sanitizeString, validatePublicLLMConfig, type PublicLLMConfig } from "@/lib/security/validation";
import { checkRateLimit, RATE_LIMIT_PRESETS, getClientIdentifier } from "@/lib/security/rateLimit";
import { runSwarmPipeline } from "@/lib/pipeline";

interface ExecuteRequest {
  version: "v3";
  input: {
    type: "text" | "structured" | "question";
    content: string | Record<string, unknown>;
  };
  agentConfig: {
    provider: "autogen" | "crewai" | "langgraph" | "custom";
    agentCount?: number;
  };
  llmConfig: {
    provider: "openai" | "anthropic" | "deepseek" | "local";
    model: string;
  };
  evaluationConfig?: {
    dimensions?: string[];
  };
  governanceConfig?: {
    interventionLevel?: "none" | "light" | "medium" | "heavy";
  };
  maxRounds?: number;
}

const MAX_INPUT_CHARS = 100_000;

interface ExecuteResponse {
  success: boolean;
  data: {
    output: {
      finalDecision: string;
      confidence: number;
      reasoning: string;
      steps: {
        step: number;
        content: string;
        agentId: string;
        timestamp: string;
      }[];
      agentContributions: Record<string, {
        contribution: string;
        confidence: number;
      }>;
    };
    evaluation: any;
    governance: any;
    agents: any[];
    interactionHistory: any[];
    trace: any;
  };
}

export async function POST(request: NextRequest) {
  try {
    // ---- Rate limiting ---------------------------------------------------
    const clientId = getClientIdentifier(request);
    const rateCheck = checkRateLimit(clientId, RATE_LIMIT_PRESETS.standard);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many requests", retryAfter: rateCheck.retryAfter } },
        { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter) } }
      );
    }

    // ---- Parse & validate body -------------------------------------------
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: "Request body must be a JSON object" } },
        { status: 400 }
      );
    }

    if (body.version !== "v3") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_VERSION", message: "Unsupported version" } },
        { status: 400 }
      );
    }

    if (!body.input || !["text", "structured", "question"].includes(body.input.type)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: "input.type is invalid" } },
        { status: 400 }
      );
    }

    const serializedContent = typeof body.input.content === "string"
      ? body.input.content
      : JSON.stringify(body.input.content);
    if (!serializedContent || serializedContent.length > MAX_INPUT_CHARS) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: `input.content must contain at most ${MAX_INPUT_CHARS} characters` } },
        { status: 400 }
      );
    }

    if (!body.agentConfig || typeof body.agentConfig !== "object") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: "agentConfig is required" } },
        { status: 400 }
      );
    }

    const requestData = body as ExecuteRequest;

    // Sanitize user-supplied content
    if (typeof requestData.input.content === "string") {
      requestData.input.content = sanitizeString(requestData.input.content);
    }

    // Validate agent config provider
    // 审计 P1.1 修复（2026-08-06）：只接受注册表已注册的 provider。
    // 修复前 crewai/langgraph 通过白名单校验后到 adapterRegistry.get 抛 "Unsupported framework" → 500；
    // 现在提前 400 拒绝，避免"类型接受但不可用"的误导性 API 表面。
    const validProviders = ["autogen", "custom"];
    if (requestData.agentConfig.provider && !validProviders.includes(requestData.agentConfig.provider)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: `Invalid agent provider: ${requestData.agentConfig.provider}` } },
        { status: 400 }
      );
    }

    const agentCount = requestData.agentConfig.agentCount ?? 5;
    if (!Number.isInteger(agentCount) || agentCount < 1 || agentCount > 20) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: "agentConfig.agentCount must be an integer between 1 and 20" } },
        { status: 400 }
      );
    }

    const maxRounds = requestData.maxRounds ?? 3;
    if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 20) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: "maxRounds must be an integer between 1 and 20" } },
        { status: 400 }
      );
    }

    const llmValidation = validatePublicLLMConfig(body.llmConfig);
    if (!llmValidation.valid) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: llmValidation.errors.join("; ") } },
        { status: 400 }
      );
    }
    const llmConfig = llmValidation.sanitized as PublicLLMConfig;

    // ---- Execute shared pipeline -----------------------------------------
    const result = await runSwarmPipeline({
      provider: requestData.agentConfig.provider,
      agentCount,
      maxRounds,
      llmConfig,
      input: requestData.input,
      evaluationConfig: requestData.evaluationConfig,
      governanceConfig: requestData.governanceConfig,
    }, "execute");

    const response: ExecuteResponse = {
      success: true,
      data: {
        output: result.output,
        evaluation: result.evaluation,
        governance: result.governance,
        agents: result.agents,
        interactionHistory: result.interactionHistory,
        trace: result.trace,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[execute] Unexpected error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { success: false, error: { code: "EXECUTE_ERROR", message: "Execution failed due to an internal error" } },
      { status: 500 }
    );
  }
}
