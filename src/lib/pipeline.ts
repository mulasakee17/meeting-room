/**
 * 共享的智能体执行管线
 *
 * 消除 execute/route.ts 与 task/route.ts 中约 120 行完全重复的代码：
 * 创建智能体 → 运行交互 → 解析状态 → 构建历史 → 评估 → 治理 → 构建输出
 */

import { adapterRegistry, type InteractionResult } from "@/lib/adapters";
import { EvaluationEngine } from "@/lib/evaluation";
import { GovernanceEngine } from "@/lib/governance";
import type { EvaluationResult } from "@/lib/evaluation/types";
import type { GovernanceResult } from "@/lib/governance/types";
import type { FrameworkAdapter } from "@/lib/adapters/types";
import { safeJsonParse } from "@/lib/utils/jsonUtils";
import { mulberry32 } from "@/lib/utils/statsUtils";

// pipeline 无实验 seed，用固定 seed PRNG 保证 confidence fallback 可复现
const pipelineFallbackRng = mulberry32(0x5EED);

/**
 * 降级用空评估/治理结果常量。
 *
 * 在 pipeline 的评估或治理阶段抛错时使用。构造为模块级常量而非运行时调用
 * 空数据 diagnose()，避免降级路径再次触发同一异常。
 *
 * 结构与 EvaluationEngine.evaluate([], [], [], "") /
 * GovernanceEngine.diagnose([], [], []) 的输出一致，已通过 tsx 验证。
 */
const DEGRADED_EVALUATION: EvaluationResult = {
  overallScore: 0,
  dimensions: {
    consensus: {
      score: 0,
      kuramotoOrder: 0,
      beliefStd: 0,
      agreementRate: 0,
      trajectory: {
        rounds: [],
        convergenceSpeed: 0,
        finalConsensus: 0,
        consensusChangeRate: 0,
        volatility: 0,
        turningPoints: [],
      },
      details: "Evaluation degraded",
    },
    reliability: {
      score: 0,
      crossValidationScore: 0,
      consistencyScore: 0,
      roundConsistencyAlpha: null,
      repeatabilityScore: 0,
      confidenceInterval: [0, 0],
      details: "Evaluation degraded",
    },
    dispersion: {
      score: 0,
      beliefDispersion: 0,
      confidenceDispersion: 0,
      roundVariability: 0,
      details: "Evaluation degraded",
    },
    stability: {
      score: 0,
      roundConsistency: 0,
      timeSeriesStability: 0,
      details: "Evaluation degraded",
    },
    influenceAnalysis: {
      score: 0,
      attribution: [],
      giniCoefficient: 0,
      influencePaths: [],
      degreeCentrality: {},
      coMentionCentrality: {},
      influenceDensity: 0,
      averagePathLength: 0,
      influenceDiffusionRate: 0,
      keyInfluencers: [],
      details: "Evaluation degraded",
    },
  },
  summary: "Evaluation degraded",
  grade: "critical",
};

const DEGRADED_GOVERNANCE: GovernanceResult = {
  echoChamber: {
    detected: false,
    severity: "low",
    redundantAgents: [],
    infoRedundancyScore: 0,
    intervention: { type: "none", applied: false },
  },
  authorityBias: {
    detected: false,
    severity: "low",
    influenceRatio: 0,
    intervention: { type: "none", applied: false },
  },
  polarization: {
    detected: false,
    severity: "low",
    groups: [],
    polarizationIndex: 0,
    intervention: { type: "none", applied: false },
  },
  prematureConsensus: {
    detected: false,
    severity: "low",
    roundNumber: 1,
    maxRounds: 3,
    beliefStd: 0,
    consensusLevel: 0,
    intervention: { type: "none", applied: false },
  },
  informationWithholding: {
    detected: false,
    severity: "low",
    withholdingAgents: [],
    intervention: { type: "none", applied: false },
  },
  ignoredInput: {
    detected: false,
    severity: "low",
    ignoringAgents: [],
    intervention: { type: "none", applied: false },
  },
  reasoningActionMismatch: {
    detected: false,
    severity: "low",
    mismatchAgents: [],
    intervention: { type: "none", applied: false },
  },
  otherIssues: [],
  summary: "Governance degraded",
  interventionCount: 0,
};

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
      const parsed = safeJsonParse<{ reasoning?: string; emotion?: number }>(state.lastMessage);
      if (parsed) {
        parsedReasoning = parsed.reasoning || parsedReasoning;
        parsedEmotion = typeof parsed.emotion === "number" ? parsed.emotion : parsedEmotion;
      } else {
        parsedReasoning = state.lastMessage;
      }
    }
    const belief = Math.max(-1, Math.min(1, (parsedEmotion / 100) + (state.belief ?? 0) * 0.5));
    return {
      agentId: state.agentId,
      content: parsedReasoning || "No message",
      confidence: state.confidence ?? (70 + pipelineFallbackRng() * 30),
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

function buildTrace(taskId: string, startTime: string, phaseTimings?: Array<{ phase: PipelineOutput["trace"]["phases"][number]["phase"]; durationMs: number; failed?: boolean; errorMsg?: string }>) {
  const endTime = new Date().toISOString();
  const totalMs = new Date(endTime).getTime() - new Date(startTime).getTime();
  const now = endTime;
  type PhaseTiming = { phase: PipelineOutput["trace"]["phases"][number]["phase"]; durationMs: number; failed?: boolean; errorMsg?: string };
  const source: PhaseTiming[] = phaseTimings && phaseTimings.length > 0
    ? phaseTimings
    : [
      { phase: "input", durationMs: 0 },
      { phase: "interaction", durationMs: totalMs },
    ];
  const phases = source.map(p => ({
    phase: p.phase,
    timestamp: now,
    durationMs: p.durationMs,
    ...(p.failed ? { failed: true, errorMsg: p.errorMsg } : {}),
  }));
  const failedPhases = phases.filter((p): p is typeof p & { failed: true; errorMsg: string } => "failed" in p && p.failed === true);
  const fullLog = failedPhases.length > 0
    ? `Pipeline executed in ${totalMs}ms with ${failedPhases.length} degraded phase(s): ${failedPhases.map(p => p.phase).join(", ")}`
    : `Pipeline executed in ${totalMs}ms`;
  return {
    taskId,
    startTime,
    endTime,
    phases,
    fullLog,
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
  const phaseTimings: Array<{ phase: "input" | "agent_creation" | "interaction" | "evaluation" | "governance" | "output"; durationMs: number; failed?: boolean; errorMsg?: string }> = [];

  // 0. 解析 adapter（失败立即上抛，调用方处理）
  const adapter = adapterRegistry.get(input.provider);

  // 1. 创建智能体（失败立即上抛——无 agent 后续步骤无法执行）
  const t0 = Date.now();
  const agentConfigs = buildAgentConfigs(input);
  const agents = await adapter.createAgents(agentConfigs, input.llmConfig);
  phaseTimings.push({ phase: "agent_creation", durationMs: Date.now() - t0 });

  // 2. 运行交互（失败立即上抛——核心交互，无法降级）
  const t1 = Date.now();
  const interactionResult = await adapter.runInteraction(agents, input.input);
  phaseTimings.push({ phase: "interaction", durationMs: Date.now() - t1 });

  // 3. 解析智能体状态（已有 safeJsonParse 保护，不会抛）
  const agentDecisions = parseAgentStates(interactionResult.agentStates);
  const agentInfo = adapter.getAgentInfo(agents);

  // 4. 构建交互历史（纯数据变换，不会失败）
  const interactionHistory = buildInteractionHistory(interactionResult, agentDecisions);

  // 5. 评估（防御性 try-catch：评估失败不应阻断管线，降级到默认评分）
  const t2 = Date.now();
  let evaluation: ReturnType<EvaluationEngine["evaluate"]>;
  try {
    const evaluationEngine = new EvaluationEngine();
    evaluation = evaluationEngine.evaluate(
      agentDecisions,
      agentInfo,
      interactionHistory,
      interactionResult.finalDecision,
      input.evaluationConfig
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    phaseTimings.push({ phase: "evaluation", durationMs: Date.now() - t2, failed: true, errorMsg: msg });
    // 降级：使用模块级常量，类型安全，避免二次抛错
    evaluation = { ...DEGRADED_EVALUATION, summary: `Evaluation degraded: ${msg}` };
  }
  if (!phaseTimings.find(p => p.phase === "evaluation" && p.failed)) {
    phaseTimings.push({ phase: "evaluation", durationMs: Date.now() - t2 });
  }

  // 6. 治理诊断（防御性 try-catch：治理失败不应阻断管线，降级到空诊断）
  const t3 = Date.now();
  let governance: ReturnType<GovernanceEngine["diagnose"]>;
  try {
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
    governance = governanceEngine.diagnose(
      agentBeliefs,
      messages,
      agentInfo.map(a => a.id),
      input.governanceConfig
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    phaseTimings.push({ phase: "governance", durationMs: Date.now() - t3, failed: true, errorMsg: msg });
    // 降级：使用模块级常量，类型安全，避免二次抛错
    governance = { ...DEGRADED_GOVERNANCE, summary: `Governance degraded: ${msg}` };
  }
  if (!phaseTimings.find(p => p.phase === "governance" && p.failed)) {
    phaseTimings.push({ phase: "governance", durationMs: Date.now() - t3 });
  }

  // 7. 构建追踪与输出
  const t4 = Date.now();
  const trace = buildTrace(`${taskIdPrefix}_${Date.now()}`, startTime, phaseTimings);
  const output = buildOutput(interactionResult, evaluation, governance, agentInfo, agentDecisions, interactionHistory, trace);
  phaseTimings.push({ phase: "output", durationMs: Date.now() - t4 });
  return output;
}
