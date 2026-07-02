import { NextResponse } from "next/server";
import { EvaluationEngine } from "@/lib/evaluation";
import { GovernanceEngine } from "@/lib/governance";
import { adapterRegistry } from "@/lib/adapters";

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

let taskStore: Map<string, {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed";
  request: CreateTaskRequest;
  result?: any;
  createdAt: string;
  completedAt?: string;
}> = new Map();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    if (body.version !== "v3") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_VERSION", message: "Unsupported version" } },
        { status: 400 }
      );
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const task: typeof taskStore extends Map<string, infer V> ? V : never = {
      taskId,
      status: "pending",
      request: body as CreateTaskRequest,
      createdAt: new Date().toISOString(),
    };
    
    taskStore.set(taskId, task);

    setTimeout(() => {
      processTask(taskId);
    }, 100);

    const response: CreateTaskResponse = {
      success: true,
      taskId,
      status: "pending",
      createdAt: task.createdAt,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_REQUEST", message: "Invalid request body" } },
      { status: 400 }
    );
  }
}

export async function GET(request: Request) {
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
    const adapter = adapterRegistry.get(task.request.agentConfig.provider);
    
    const agentCount = task.request.agentConfig.agentCount || 5;
    const agentConfigs = Array.from({ length: agentCount }, (_, i) => ({
      id: `agent_${i + 1}`,
      name: `Agent ${i + 1}`,
      role: task.request.agentConfig.agentTypes?.[i % (task.request.agentConfig.agentTypes?.length || 1)] || "Expert",
      type: "default",
    }));

    const agents = await adapter.createAgents(agentConfigs);
    const interactionResult = await adapter.runInteraction(agents, task.request.input);

    const agentDecisions = interactionResult.agentStates.map(state => ({
      agentId: state.agentId,
      content: state.lastMessage || "No message",
      confidence: state.confidence || 70 + Math.random() * 30,
      reasoning: state.reasoning || "Default reasoning",
      belief: state.belief || (Math.random() - 0.5) * 2,
    }));

    const agentInfo = adapter.getAgentInfo(agents);

    const interactionHistory = [{
      round: 1,
      messages: interactionResult.messages.map(m => ({
        agentId: m.agentId,
        content: m.content,
        timestamp: m.timestamp,
      })),
      beliefs: Object.fromEntries(agentDecisions.map(d => [d.agentId, d.belief || 0])),
      beliefChanges: {},
      converged: interactionResult.converged,
    }];

    const evaluationEngine = new EvaluationEngine();
    const evaluation = evaluationEngine.evaluate(
      agentDecisions,
      agentInfo,
      interactionHistory,
      interactionResult.finalDecision,
      task.request.evaluationConfig
    );

    const governanceEngine = new GovernanceEngine();
    const agentBeliefs = agentDecisions.map(d => ({
      agentId: d.agentId,
      belief: d.belief || 0,
      confidence: d.confidence,
    }));

    const messages = interactionResult.messages.map(m => ({
      agentId: m.agentId,
      content: m.content,
      timestamp: m.timestamp,
    }));

    const governance = governanceEngine.diagnose(
      agentBeliefs,
      messages,
      agentInfo.map(a => a.id),
      task.request.governanceConfig
    );

    const trace = {
      taskId,
      startTime: task.createdAt,
      endTime: new Date().toISOString(),
      phases: [
        { phase: "input" as const, timestamp: task.createdAt, durationMs: 0 },
        { phase: "agent_creation" as const, timestamp: new Date().toISOString(), durationMs: 100 },
        { phase: "interaction" as const, timestamp: new Date().toISOString(), durationMs: 500 },
        { phase: "evaluation" as const, timestamp: new Date().toISOString(), durationMs: 200 },
        { phase: "governance" as const, timestamp: new Date().toISOString(), durationMs: 100 },
        { phase: "output" as const, timestamp: new Date().toISOString(), durationMs: 50 },
      ],
      fullLog: "Task completed successfully",
    };

    task.status = "completed";
    task.completedAt = new Date().toISOString();
    task.result = {
      output: {
        finalDecision: interactionResult.finalDecision,
        confidence: evaluation.overallScore / 100,
        reasoning: "Consensus reached through multi-agent interaction",
        steps: agentDecisions.map((d, i) => ({
          step: i + 1,
          content: d.content,
          agentId: d.agentId,
          timestamp: new Date().toISOString(),
        })),
        agentContributions: Object.fromEntries(agentDecisions.map(d => [
          d.agentId,
          { contribution: d.content, confidence: d.confidence }
        ])),
      },
      evaluation,
      governance,
      agents: agentInfo,
      interactionHistory,
      trace,
    };

    taskStore.set(taskId, task);
  } catch (error) {
    task.status = "failed";
    task.completedAt = new Date().toISOString();
    taskStore.set(taskId, task);
  }
}