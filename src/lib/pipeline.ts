/**
 * 共享的智能体执行管线
 *
 * 消除 execute/route.ts 与 task/route.ts 中约 120 行完全重复的代码：
 * 创建智能体 → 运行交互 → 解析状态 → 构建历史 → 评估 → 治理 → 构建输出
 */

import { adapterRegistry } from "@/lib/adapters";
import { EvaluationEngine } from "@/lib/evaluation";
import { GovernanceEngine } from "@/lib/governance";
import type { FrameworkAdapter } from "@/lib/adapters/types";
import type { Agent, TaskInput, InteractionResult } from "@/lib/adapters/types";

// ---- 输入类型 ----------------------------------------------------------------

export interface PipelineInput {
  /** 智能体框架提供者 */
  provider: "autogen" | "crewai" | "langgraph" | "custom";
  /** 智能体数量，默认 5 */
  agentCount?: number;
  /** 可选的智能体类型列表（按索引循环分配） */
  agentTypes?: string[];
  /** LLM 配置 */
  llmConfig: {
    provider: "openai" | "anthropic" | "deepseek" | "local";
    model: string;
    temperature?: number;
  };
  /** 任务输入 */
  input: {
    type: "text" | "structured" | "question";
    content: string | Record<string, unknown>;
    context?: string;
  };
  /** 评估配置 */
  evaluationConfig?: {
    enableAll?: boolean;
    dimensions?: string[];
  };
  /** 治理配置 */
  governanceConfig?: {
    enableEchoChamberDetection?: boolean;
    enableAuthorityBiasDetection?: boolean;
    enablePolarizationDetection?: boolean;
    interventionLevel?: "none" | "light" | "medium" | "heavy";
  };
}

// ---- 输出类型 ----------------------------------------------------------------

export interface PipelineOutput {
  output: {
    finalDecision: string;
    confidence: number;
    reasoning: string;
    steps: Array<{
      step: number;
      content: string;
      agentId: string;
      timestamp: string;
    }>;
    agentContributions: Record<string, {
      contribution: string;
      confidence: number;
    }>;
  };
  evaluation: ReturnType<EvaluationEngine["evaluate"]>;
  governance: ReturnType<GovernanceEngine["diagnose"]>;
  agents: ReturnType<FrameworkAdapter["getAgentInfo"]>;
  interactionHistory: Array<{
    round: number;
    messages: Array<{ agentId: string; content: string; timestamp: string }>;
    beliefs: Record<string, number>;
    beliefChanges: Record<string, unknown>;
    converged: boolean;
  }>;
  trace: {
    taskId: string;
    startTime: string;
    endTime: string;
    phases: Array<{ phase: "input" | "agent_creation" | "interaction" | "evaluation" | "governance" | "output"; timestamp: string; durationMs: number }>;
    fullLog: string;
  };
}

// ---- 内部辅助 ----------------------------------------------------------------

interface AgentDecision {
  agentId: string;
  content: string;
  confidence: number;
  reasoning: string;
  belief: number;
}

function buildAgentConfigs(input: PipelineInput) {
  const count = input.agentCount || 5;
  const types = input.agentTypes || [];
  return Array.from({ length: count }, (_, i) => ({
    id: `agent_${i + 1}`,
    name: `Agent ${i + 1}`,
    role: types[i % (types.length || 1)] || "Expert",
    type: "default" as const,
  }));
}

function parseAgentStates(
  states: InteractionResult["agentStates"]
): AgentDecision[] {
  return states.map(state => {
    let parsedReasoning = state.reasoning || "";
    let parsedEmotion = 0;
    if (state.lastMessage) {
      try {
        const parsed = JSON.parse(state.lastMessage);
        parsedReasoning = parsed.reasoning || parsedReasoning;
        parsedEmotion = typeof parsed.emotion === "number" ? parsed.emotion : parsedEmotion;
      } catch {
        console.warn(`[pipeline] Agent ${state.agentId} lastMessage parse failed, using raw text`);
        parsedReasoning = state.lastMessage;
      }
    }
    const belief = Math.max(-1, Math.min(1, (parsedEmotion / 100) + (state.belief ?? 0) * 0.5));
    return {
      agentId: state.agentId,
      content: parsedReasoning || "No message",
      confidence: state.confidence ?? (70 + Math.random() * 30),
      reasoning: parsedReasoning || "Default reasoning",
      belief,
    };
  });
}

function buildInteractionHistory(
  result: InteractionResult,
  agentDecisions: AgentDecision[]
) {
  return [{
    round: 1,
    messages: result.messages.map(m => ({
      agentId: m.agentId,
      content: m.content,
      timestamp: m.timestamp,
    })),
    beliefs: Object.fromEntries(agentDecisions.map(d => [d.agentId, d.belief || 0])),
    beliefChanges: {},
    converged: result.converged,
  }];
}

function buildTrace(taskId: string, startTime: string) {
  const endTime = new Date().toISOString();
  const totalMs = new Date(endTime).getTime() - new Date(startTime).getTime();
  const now = endTime;
  return {
    taskId,
    startTime,
    endTime,
    phases: [
      { phase: "input" as const, timestamp: startTime, durationMs: 0 },
      { phase: "execution" as const, timestamp: now, durationMs: totalMs },
    ],
    fullLog: `Pipeline executed in ${totalMs}ms`,
  };
}

function buildOutput(
  result: InteractionResult,
  evaluation: ReturnType<EvaluationEngine["evaluate"]>,
  governance: ReturnType<GovernanceEngine["diagnose"]>,
  agentInfo: ReturnType<FrameworkAdapter["getAgentInfo"]>,
  agentDecisions: AgentDecision[],
  interactionHistory: ReturnType<typeof buildInteractionHistory>,
  trace: ReturnType<typeof buildTrace>
): PipelineOutput {
  return {
    output: {
      finalDecision: result.finalDecision,
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
        { contribution: d.content, confidence: d.confidence },
      ])),
    },
    evaluation,
    governance,
    agents: agentInfo,
    interactionHistory,
    trace,
  };
}

// ---- 主入口 ------------------------------------------------------------------

/**
 * 执行一次完整的智能体讨论 → 评估 → 治理 管线。
 *
 * execute 路由 (同步) 和 task 路由 (异步处理) 之前各自独立实现了相同的逻辑，
 * 现在统一通过此函数执行。
 *
 * @param input  管线输入参数
 * @param taskIdPrefix  追踪 ID 前缀（"execute" 或 "task"）
 * @returns 结构化的管线输出
 */
export async function runSwarmPipeline(
  input: PipelineInput,
  taskIdPrefix: string = "pipeline"
): Promise<PipelineOutput> {
  const startTime = new Date().toISOString();
  const adapter = adapterRegistry.get(input.provider);
  // 1. 创建智能体
  const agentConfigs = buildAgentConfigs(input);
  const agents = await adapter.createAgents(agentConfigs, input.llmConfig);

  // 2. 运行交互
  const interactionResult = await adapter.runInteraction(agents, input.input);

  // 3. 解析智能体状态
  const agentDecisions = parseAgentStates(interactionResult.agentStates);
  const agentInfo = adapter.getAgentInfo(agents);

  // 4. 构建交互历史
  const interactionHistory = buildInteractionHistory(interactionResult, agentDecisions);

  // 5. 评估
  const evaluationEngine = new EvaluationEngine();
  const evaluation = evaluationEngine.evaluate(
    agentDecisions,
    agentInfo,
    interactionHistory,
    interactionResult.finalDecision,
    input.evaluationConfig
  );

  // 6. 治理诊断
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
    input.governanceConfig
  );

  // 7. 构建追踪与输出
  const trace = buildTrace(`${taskIdPrefix}_${Date.now()}`, startTime);
  return buildOutput(interactionResult, evaluation, governance, agentInfo, agentDecisions, interactionHistory, trace);
}
