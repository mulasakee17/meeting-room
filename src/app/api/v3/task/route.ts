import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { sanitizeString, validatePublicLLMConfig, type PublicLLMConfig } from "@/lib/security/validation";
import { checkRateLimit, RATE_LIMIT_PRESETS, getClientIdentifier } from "@/lib/security/rateLimit";
import { runSwarmPipeline } from "@/lib/pipeline";
import { randomUUID } from "node:crypto";

interface CreateTaskRequest {
  version: "v3";
  title: string;
  description: string;
  input: {
    type: "text" | "structured" | "question";
    content: string | Record<string, unknown>;
    context?: string;
  };
  agentConfig: {
    provider: "autogen" | "crewai" | "langgraph" | "custom";
    agentCount?: number;
    agentTypes?: string[];
    config?: Record<string, unknown>;
  };
  llmConfig: {
    provider: "openai" | "anthropic" | "deepseek" | "local";
    model: string;
    temperature?: number;
  };
  evaluationConfig?: {
    enableAll?: boolean;
    dimensions?: string[];
    customMetrics?: Record<string, {
      name: string;
      description: string;
      weight: number;
    }>;
  };
  governanceConfig?: {
    enableEchoChamberDetection?: boolean;
    enableAuthorityBiasDetection?: boolean;
    enablePolarizationDetection?: boolean;
    interventionLevel?: "none" | "light" | "medium" | "heavy";
  };
  maxRounds?: number;
  timeoutSeconds?: number;
}

interface CreateTaskResponse {
  success: boolean;
  taskId: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
}

/** Maximum age for a pending/running task before it is auto-failed (10 min). */
const TASK_STALE_TIMEOUT_MS = 10 * 60 * 1000;
const TASK_RESULT_RETENTION_MS = 60 * 60 * 1000;
const MAX_TASK_STORE_SIZE = 1_000;
const MAX_INPUT_CHARS = 100_000;

let taskStore: Map<string, {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed";
  request: CreateTaskRequest;
  result?: any;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}> = new Map();

/** Periodically fail tasks that have been pending/running for too long. */
function cleanupStaleTasks(): void {
  const now = Date.now();
  Array.from(taskStore.entries()).forEach(([taskId, task]) => {
    if (task.status === "completed" || task.status === "failed") {
      const finishedAt = new Date(task.completedAt ?? task.createdAt).getTime();
      if (now - finishedAt > TASK_RESULT_RETENTION_MS) taskStore.delete(taskId);
      return;
    }
    const age = now - new Date(task.createdAt).getTime();
    if (age > TASK_STALE_TIMEOUT_MS) {
      task.status = "failed";
      task.errorMessage = "Task timed out after exceeding maximum pending duration";
      task.completedAt = new Date().toISOString();
    }
  });
}

// Run cleanup every 5 minutes
if (typeof setInterval !== "undefined") {
  const cleanupTimer = setInterval(cleanupStaleTasks, 5 * 60 * 1000);
  cleanupTimer.unref?.();
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

    // Validate required fields
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

    const requestData = body as CreateTaskRequest;

    // Sanitize user-supplied content
    if (typeof requestData.input.content === "string") {
      requestData.input.content = sanitizeString(requestData.input.content);
    }
    if (requestData.description) {
      requestData.description = sanitizeString(requestData.description);
    }
    if (requestData.title) {
      requestData.title = sanitizeString(requestData.title);
    }

    if (!["autogen", "custom"].includes(requestData.agentConfig.provider)) {
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

    // Store a reconstructed request so unknown transport fields cannot reach the worker.
    const sanitizedRequest: CreateTaskRequest = {
      ...requestData,
      agentConfig: {
        provider: requestData.agentConfig.provider,
        agentCount,
        agentTypes: requestData.agentConfig.agentTypes?.slice(0, agentCount),
      },
      llmConfig,
      maxRounds,
    };

    cleanupStaleTasks();
    if (taskStore.size >= MAX_TASK_STORE_SIZE) {
      return NextResponse.json(
        { success: false, error: { code: "TASK_CAPACITY_REACHED", message: "Task capacity reached; retry later" } },
        { status: 503 }
      );
    }

    const taskId = `task_${randomUUID()}`;
    const taskEntry = {
      taskId,
      status: "pending" as const,
      request: sanitizedRequest,
      createdAt: new Date().toISOString(),
    };

    taskStore.set(taskId, taskEntry);

    setTimeout(() => {
      processTask(taskId);
    }, 100);

    const response: CreateTaskResponse = {
      success: true,
      taskId,
      status: "pending",
      createdAt: taskEntry.createdAt,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[task] Unexpected error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { success: false, error: { code: "INVALID_REQUEST", message: "Invalid request body" } },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Rate limiting
  const clientId = getClientIdentifier(request);
  const rateCheck = checkRateLimit(clientId, RATE_LIMIT_PRESETS.relaxed);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message: "Too many requests", retryAfter: rateCheck.retryAfter } },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");

  if (!taskId) {
    return NextResponse.json(
      { success: false, error: { code: "MISSING_TASK_ID", message: "taskId is required" } },
      { status: 400 }
    );
  }

  const task = taskStore.get(taskId);
  
  if (!task) {
    return NextResponse.json(
      { success: false, error: { code: "TASK_NOT_FOUND", message: "Task not found" } },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    task: {
      taskId: task.taskId,
      title: task.request.title,
      status: task.status,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      input: task.request.input,
      output: task.result?.output,
      evaluation: task.result?.evaluation,
      governance: task.result?.governance,
      agents: task.result?.agents,
      interactionHistory: task.result?.interactionHistory,
      trace: task.result?.trace,
    },
  });
}

async function processTask(taskId: string) {
  const task = taskStore.get(taskId);
  if (!task) return;

  task.status = "running";
  taskStore.set(taskId, task);

  try {
    const result = await runSwarmPipeline({
      provider: task.request.agentConfig.provider,
      agentCount: task.request.agentConfig.agentCount,
      agentTypes: task.request.agentConfig.agentTypes,
      llmConfig: task.request.llmConfig,
      maxRounds: task.request.maxRounds,
      input: task.request.input,
      evaluationConfig: task.request.evaluationConfig,
      governanceConfig: task.request.governanceConfig,
    }, "task");

    task.status = "completed";
    task.completedAt = new Date().toISOString();
    task.result = result;
    task.result.trace.taskId = taskId;

    taskStore.set(taskId, task);
  } catch (error) {
    console.error("[task] processTask failed:", error instanceof Error ? error.message : String(error));
    task.status = "failed";
    task.errorMessage = error instanceof Error ? error.message : String(error);
    task.completedAt = new Date().toISOString();
    taskStore.set(taskId, task);
  }
}
