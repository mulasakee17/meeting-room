import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { sanitizeString } from "@/lib/security/validation";
import { checkRateLimit, RATE_LIMIT_PRESETS, getClientIdentifier } from "@/lib/security/rateLimit";
import { runSwarmPipeline } from "@/lib/pipeline";

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
    provider: "openai" | "anthropic" | "gemini" | "deepseek" | "local";
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
  Array.from(taskStore.entries()).forEach(([, task]) => {
    if (task.status === "completed" || task.status === "failed") return;
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
  setInterval(cleanupStaleTasks, 5 * 60 * 1000);
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
    if (!body.input || !body.input.type) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: "input.type is required" } },
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

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const taskEntry = {
      taskId,
      status: "pending" as const,
      request: requestData,
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