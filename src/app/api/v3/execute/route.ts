import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { sanitizeString } from "@/lib/security/validation";
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
    provider: "openai" | "anthropic" | "gemini" | "deepseek" | "local";
    model: string;
  };
  evaluationConfig?: {
    dimensions?: string[];
  };
  governanceConfig?: {
    interventionLevel?: "none" | "light" | "medium" | "heavy";
  };
}

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

    if (!body.input || !body.input.type) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: "input.type is required" } },
        { status: 400 }
      );
    }

    const requestData = body as ExecuteRequest;

    // Sanitize user-supplied content
    if (typeof requestData.input.content === "string") {
      requestData.input.content = sanitizeString(requestData.input.content);
    }

    // Validate agent config provider
    const validProviders = ["autogen", "crewai", "langgraph", "custom"];
    if (requestData.agentConfig.provider && !validProviders.includes(requestData.agentConfig.provider)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: `Invalid agent provider: ${requestData.agentConfig.provider}` } },
        { status: 400 }
      );
    }

    // ---- Execute shared pipeline -----------------------------------------
    const result = await runSwarmPipeline({
      provider: requestData.agentConfig.provider,
      agentCount: requestData.agentConfig.agentCount,
      llmConfig: requestData.llmConfig,
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
