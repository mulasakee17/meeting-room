/**
 * SwarmAlpha Experiment Data Package Generator
 *
 * Runs a single experiment and outputs a complete JSON data package containing:
 *   - task id, agent configs, LLM config
 *   - per-round conversation logs (full AgentOpinion: reasoning, evidence, itemBeliefs, referencedAgents)
 *   - governance state per round (issues with severity/description, interventions with parameters, influence events)
 *   - final answer, success/failure, Kendall's τ
 *   - token cost and latency per agent
 *   - evaluation scores, interaction graph, decision trace
 *
 * Usage:
 *   npx tsx experiments/v2/dataPackage.ts [task] [ablation] [runIndex]
 *   task:       "invest" (default) | "ma"
 *   ablation:   "full" (default) | "none" | "shuffle" | "full_diversity" | "full_weight" | "full_reflection" | "full_continue"
 *   runIndex:   0 (default)
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

import { CustomAgent } from "../../src/lib/adapters/custom";
import { DiscussionEngine, type DiscussionAgent } from "../../src/lib/discussion";
import { EvaluationEngine } from "../../src/lib/evaluation";
import type { LLMConfig } from "../../src/lib/llm/providers";
import { TASK_MA, type TaskConfig } from "../lunar_survival/config";
import { TASK_INVEST } from "./task_invest";
import { extractRanking, kendallTau } from "./statsShared";

// ============================================================================
// Types
// ============================================================================

interface ConversationLogEntry {
  agentId: string;
  agentName: string;
  reasoning: string;
  evidence: string[];
  belief: number;
  confidence: number;
  itemBeliefs?: Array<{ item: string; rank: number; belief: number; confidence: number }>;
  referencedAgents?: string[];
  nextOpinion?: string;
  timestamp: string;
}

interface RoundDataPackage {
  roundNumber: number;
  timestamp: string;
  converged: boolean;
  conversationLogs: ConversationLogEntry[];
  beliefs: Record<string, number>;
  confidences: Record<string, number>;
  beliefChanges: Record<string, { old: number; new: number; reason: string }>;
  governanceIssues: Array<{
    type: string;
    severity: string;
    description: string;
    agents?: string[];
  }>;
  interventions: Array<{
    type: string;
    targetAgentId?: string;
    targetAgents?: string[];
    parameters?: Record<string, unknown>;
    effect: string;
    applied: boolean;
  }>;
  influenceEvents: Array<{
    sourceAgentId: string;
    targetAgentId: string;
    type: string;
    weight: number;
    round: number;
    timestamp: string;
  }>;
  tau?: number;
  decisionQuality?: number;
  evalScores?: Record<string, number>;
}

interface AgentConfigPackage {
  id: string;
  name: string;
  role: string;
  knownItems: string;
  initialBias: string;
}

interface AgentUsagePackage {
  agentId: string;
  agentName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalLatencyMs: number;
  callCount: number;
  avgLatencyMs: number;
  latencies: number[];
}

interface DataPackage {
  // Metadata
  taskId: string;
  taskTitle: string;
  ablation: string;
  runIndex: number;
  timestamp: string;

  // Configuration
  llmConfig: {
    provider: string;
    model: string;
    temperature: number;
    seed: number;
  };
  agentConfigs: AgentConfigPackage[];
  discussionConfig: {
    maxRounds: number;
    convergenceThreshold: number;
    governanceMode: string;
  };

  // Primary metrics
  kendallTau: number;
  decisionQuality: number;
  tauTrajectory: number[];
  totalRounds: number;
  converged: boolean;
  success: boolean;

  // Final answer
  finalAnswer: string;
  groundTruth: Record<string, number>;
  extractedRanking: string[];

  // Per-round data
  rounds: RoundDataPackage[];

  // Token cost & latency
  agentUsage: AgentUsagePackage[];
  totalTokenCost: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    totalLatencyMs: number;
  };

  // Evaluation
  evaluationScores: Record<string, number>;

  // Network & trace
  interactionGraph?: unknown;
  decisionTrace?: unknown;
}

// ============================================================================
// Parameters
// ============================================================================

const PARAMS = {
  maxRounds: 5,
  convergenceThreshold: 0.06,
  temperature: 0.2,
  model: "deepseek-chat",
  provider: "deepseek" as const,
};

const LLM_CONFIG: LLMConfig = {
  provider: PARAMS.provider,
  model: PARAMS.model,
  temperature: PARAMS.temperature,
};

// ============================================================================
// Helpers (reused from run.ts logic)
// ============================================================================

function makeLLMConfig(runIndex: number): LLMConfig {
  return { ...LLM_CONFIG, seed: 42 + runIndex };
}

// extractRanking 和 kendallTau 已迁移到 ./statsShared（统一权威实现）

function tauToQuality(tau: number): number {
  return Math.round(Math.max(0, Math.min(100, (tau + 1) * 50)));
}

// ============================================================================
// Create agents (keeps CustomAgent references for usage tracking)
// ============================================================================

function createAgentsWithTracking(
  task: TaskConfig,
  llmConfig: LLMConfig,
): { agents: DiscussionAgent[]; customAgents: CustomAgent[] } {
  const customAgents: CustomAgent[] = [];
  const agents: DiscussionAgent[] = task.agents.map(info => {
    const systemPrompt =
      `${task.sharedBriefing}\n\n---\n你的独有专业知识（其他成员不知道）：\n${info.knownItems}\n---\n${info.initialBias}\n\n`
      + `讨论规则：\n`
      + `1. 主动分享你的独有知识\n`
      + `2. 对他人的判断提出质疑\n`
      + `3. 如果他人与你独有知识矛盾，必须指出\n`
      + `4. 最终以JSON格式给出你的判断，格式：\n`
      + `{\n`
      + `  "reasoning": "你的分析",\n`
      + `  "evidence": ["证据1", "证据2"],\n`
      + `  "belief": -1到1 (整体倾向),\n`
      + `  "confidence": 0到100,\n`
      + `  "nextOpinion": "下一步讨论方向",\n`
      + `  "referencedAgents": ["a2"],\n`
      + `  "itemBeliefs": [\n`
      + `    {"item": "CompanyX (行业A)", "rank": 3, "belief": -0.5, "confidence": 85},\n`
      + `    {"item": "CompanyY (行业B)", "rank": 1, "belief": 0.7, "confidence": 90},\n`
      + `    {"item": "CompanyZ (行业C)", "rank": 2, "belief": 0.1, "confidence": 65}\n`
      + `  ]\n`
      + `}\n`
      + `itemBeliefs中：rank为你认为的排名(1=最优)，belief为对该选项的独立偏好(-1=强烈反对,0=中立,1=强烈支持)，confidence为置信度(0-100)`;
    const agent = new CustomAgent(info.id, info.name, info.role, "default", llmConfig, systemPrompt);
    customAgents.push(agent);
    return agent as unknown as DiscussionAgent;
  });
  return { agents, customAgents };
}

// ============================================================================
// Main: generate data package
// ============================================================================

async function generateDataPackage(
  task: TaskConfig,
  ablation: string,
  runIndex: number,
): Promise<DataPackage> {
  const runId = `${task.id}_${ablation}_${runIndex}`;
  console.log(`[${runId}] Starting data package generation...`);

  // ── Create agents ──────────────────────────────────────────────────
  const { agents, customAgents } = createAgentsWithTracking(task, makeLLMConfig(runIndex));

  // ── Build governance config ────────────────────────────────────────
  const governanceMode: "none" | "detect-only" | "full" = ablation === "none" ? "none" : "full";
  const singleInterventionMap: Record<string, string> = {
    full_diversity: "enableEchoChamberDetection",
    full_weight: "enableAuthorityBiasDetection",
    full_reflection: "enablePolarizationDetection",
    full_continue: "enablePrematureConsensusDetection",
  };
  const isSingleMode = ablation.startsWith("full_") && ablation !== "full";
  const govOverride: Record<string, boolean> = {};
  if (isSingleMode) {
    govOverride.enableEchoChamberDetection = false;
    govOverride.enableAuthorityBiasDetection = false;
    govOverride.enablePolarizationDetection = false;
    govOverride.enablePrematureConsensusDetection = false;
    const targetKey = singleInterventionMap[ablation];
    if (targetKey) govOverride[targetKey] = true;
  }

  // ── Create discussion engine ───────────────────────────────────────
  const engine = new DiscussionEngine({
    maxRounds: PARAMS.maxRounds,
    convergenceThreshold: PARAMS.convergenceThreshold,
    governanceMode,
    seed: 42 + runIndex,
    ...(isSingleMode ? { governanceConfig: govOverride } : {}),
  });

  // ── Set agent knowledge ────────────────────────────────────────────
  const knowledge = new Map<string, string[]>();
  for (const info of task.agents) {
    const items = info.knownItems
      .split(/[；;\n]/)
      .map(s => s.replace(/^[•\-\s]+/, "").trim())
      .filter(s => s.length > 10);
    knowledge.set(info.id, items);
  }
  engine.setAgentKnowledge(knowledge);

  const taskObj = {
    id: runId,
    description: task.title,
    type: "discussion" as const,
    createdAt: new Date().toISOString(),
    content: task.sharedBriefing,
  };

  // ── Run experiment ─────────────────────────────────────────────────
  const result = await engine.run(agents, taskObj);
  console.log(`[${runId}] Experiment completed. Rounds: ${result.totalRounds}, converged: ${result.converged}`);

  // ── Get full discussion data (governance, influence, graph) ────────
  const discData = engine.getDiscussionData(
    taskObj,
    agents.map(a => ({ id: a.id, name: a.name, role: a.role, type: a.type })),
  );

  // ── Build per-round data packages ──────────────────────────────────
  const itemNames = Object.keys(task.correctAnswer);
  const rounds: RoundDataPackage[] = [];
  const tauTrajectory: number[] = [];
  const evalEngine = new EvaluationEngine();
  const agentInfo = agents.map(a => ({ id: a.id, name: a.name, role: a.role, type: a.type }));

  for (let i = 0; i < result.roundResults.length; i++) {
    const rr = result.roundResults[i];
    const rd = discData.rounds[i];

    // Conversation logs: full AgentOpinion data
    const conversationLogs: ConversationLogEntry[] = rr.opinions.map(o => ({
      agentId: o.agentId,
      agentName: agents.find(a => a.id === o.agentId)?.name || o.agentId,
      reasoning: o.reasoning,
      evidence: o.evidence || [],
      belief: o.belief,
      confidence: o.confidence,
      itemBeliefs: o.itemBeliefs,
      referencedAgents: o.referencedAgents,
      nextOpinion: o.nextOpinion,
      timestamp: rr.timestamp,
    }));

    // Beliefs and confidences
    const beliefs: Record<string, number> = {};
    const confidences: Record<string, number> = {};
    for (const o of rr.opinions) {
      beliefs[o.agentId] = o.belief;
      confidences[o.agentId] = o.confidence;
    }

    // Per-round τ
    const roundReasoning = rr.opinions.map(o => o.reasoning).join("\n");
    const roundItemBeliefs = rr.opinions.flatMap(o => o.itemBeliefs || []);
    const roundRanking = extractRanking(roundReasoning, itemNames, roundItemBeliefs);
    const roundTau = kendallTau(task.correctAnswer, roundRanking);
    tauTrajectory.push(roundTau);

    // Per-round evaluation scores
    let evalScores: Record<string, number> | undefined;
    try {
      const decisions = rr.opinions.map(o => ({
        agentId: o.agentId, content: o.reasoning,
        confidence: o.confidence, reasoning: o.reasoning, belief: o.belief,
      }));
      const history = [{
        round: rr.roundNumber,
        messages: rr.opinions.map(o => ({ agentId: o.agentId, content: o.reasoning, timestamp: rr.timestamp })),
        beliefs: Object.fromEntries(rr.opinions.map(o => [o.agentId, o.belief])),
        beliefChanges: {}, converged: rr.converged,
      }];
      const ev = evalEngine.evaluate(decisions, agentInfo, history, `Round ${rr.roundNumber}`);
      evalScores = {};
      for (const [key, dim] of Object.entries(ev.dimensions || {})) {
        evalScores[key] = (dim as any).score ?? 0;
      }
      evalScores.overall = ev.overallScore;
    } catch (err) {
      console.warn(`[${runId}] Round ${rr.roundNumber} evaluation failed:`, err instanceof Error ? err.message : err);
    }

    rounds.push({
      roundNumber: rr.roundNumber,
      timestamp: rr.timestamp,
      converged: rr.converged,
      conversationLogs,
      beliefs,
      confidences,
      beliefChanges: rd?.beliefChanges || {},
      governanceIssues: (rd?.governanceIssues || []).map(gi => ({
        type: gi.type,
        severity: gi.severity,
        description: gi.description,
        agents: gi.agents,
      })),
      interventions: (rd?.interventions || []).map(intv => ({
        type: intv.type,
        targetAgentId: intv.targetAgentId,
        targetAgents: intv.targetAgents,
        parameters: intv.parameters,
        effect: intv.effect,
        applied: intv.applied,
      })),
      influenceEvents: (rd?.influenceEvents || []).map(ie => ({
        sourceAgentId: ie.sourceAgentId,
        targetAgentId: ie.targetAgentId,
        type: ie.type,
        weight: ie.weight,
        round: ie.round,
        timestamp: ie.timestamp,
      })),
      tau: roundTau,
      decisionQuality: tauToQuality(roundTau),
      evalScores,
    });
  }

  // ── Compute final metrics ──────────────────────────────────────────
  const allReasoning = result.roundResults
    .flatMap(r => r.opinions.map(o => o.reasoning))
    .join("\n");
  const finalAnswer = result.finalDecision || allReasoning;
  const allItemBeliefs = result.roundResults
    .flatMap(r => r.opinions)
    .flatMap(o => o.itemBeliefs || []);
  const extractedRanking = extractRanking(finalAnswer, itemNames, allItemBeliefs);
  const tau = kendallTau(task.correctAnswer, extractedRanking);

  // Success: τ > 0.5 (ranking mostly correct)
  const success = tau > 0.5;

  // ── Final evaluation scores ────────────────────────────────────────
  const evaluationScores: Record<string, number> = {};
  const lastRoundWithEval = rounds.filter(r => r.evalScores).pop();
  if (lastRoundWithEval?.evalScores) {
    Object.assign(evaluationScores, lastRoundWithEval.evalScores);
  }

  // ── Agent usage stats (token cost & latency) ───────────────────────
  const agentUsage: AgentUsagePackage[] = customAgents.map(agent => {
    const stats = agent.getUsageStats();
    return {
      agentId: agent.id,
      agentName: agent.name,
      promptTokens: stats.promptTokens,
      completionTokens: stats.completionTokens,
      totalTokens: stats.totalTokens,
      totalLatencyMs: stats.totalLatencyMs,
      callCount: stats.callCount,
      avgLatencyMs: stats.callCount > 0 ? Math.round(stats.totalLatencyMs / stats.callCount) : 0,
      latencies: stats.latencies,
    };
  });

  const totalTokenCost = agentUsage.reduce(
    (acc, a) => ({
      promptTokens: acc.promptTokens + a.promptTokens,
      completionTokens: acc.completionTokens + a.completionTokens,
      totalTokens: acc.totalTokens + a.totalTokens,
      totalLatencyMs: acc.totalLatencyMs + a.totalLatencyMs,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0, totalLatencyMs: 0 },
  );

  // ── Agent configs ──────────────────────────────────────────────────
  const agentConfigs: AgentConfigPackage[] = task.agents.map(info => ({
    id: info.id,
    name: info.name,
    role: info.role,
    knownItems: info.knownItems,
    initialBias: info.initialBias,
  }));

  console.log(`[${runId}] τ=${tau.toFixed(3)}, tokens=${totalTokenCost.totalTokens}, latency=${totalTokenCost.totalLatencyMs}ms`);

  return {
    taskId: task.id,
    taskTitle: task.title,
    ablation,
    runIndex,
    timestamp: new Date().toISOString(),
    llmConfig: {
      provider: PARAMS.provider,
      model: PARAMS.model,
      temperature: PARAMS.temperature,
      seed: 42 + runIndex,
    },
    agentConfigs,
    discussionConfig: {
      maxRounds: PARAMS.maxRounds,
      convergenceThreshold: PARAMS.convergenceThreshold,
      governanceMode,
    },
    kendallTau: tau,
    decisionQuality: tauToQuality(tau),
    tauTrajectory,
    totalRounds: result.totalRounds,
    converged: result.converged,
    success,
    finalAnswer,
    groundTruth: task.correctAnswer,
    extractedRanking,
    rounds,
    agentUsage,
    totalTokenCost,
    evaluationScores,
    interactionGraph: discData.interactionGraph,
    decisionTrace: discData.decisionTrace,
  };
}

// ============================================================================
// CLI entry point
// ============================================================================

async function main() {
  const taskArg = process.argv[2] || "invest";
  const ablationArg = process.argv[3] || "full";
  const runIndexArg = parseInt(process.argv[4] || "0", 10);

  const task: TaskConfig = taskArg === "ma" ? TASK_MA : TASK_INVEST;
  const ablation = ablationArg;

  console.log(`=== Data Package Generator ===`);
  console.log(`Task: ${task.id}, Ablation: ${ablation}, RunIndex: ${runIndexArg}`);
  console.log();

  const dataPackage = await generateDataPackage(task, ablation, runIndexArg);

  const outputDir = path.resolve(__dirname, "data_package");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(
    outputDir,
    `package_${task.id}_${ablation}_${runIndexArg}.json`,
  );

  fs.writeFileSync(outputFile, JSON.stringify(dataPackage, null, 2), "utf-8");

  const sizeKB = (fs.statSync(outputFile).size / 1024).toFixed(1);
  console.log();
  console.log(`=== Data Package Generated ===`);
  console.log(`File: ${outputFile}`);
  console.log(`Size: ${sizeKB} KB`);
  console.log(`Rounds: ${dataPackage.totalRounds}`);
  console.log(`τ: ${dataPackage.kendallTau.toFixed(3)}`);
  console.log(`Success: ${dataPackage.success}`);
  console.log(`Total tokens: ${dataPackage.totalTokenCost.totalTokens}`);
  console.log(`Total latency: ${dataPackage.totalTokenCost.totalLatencyMs}ms`);
  console.log();
  console.log(`Fields included:`);
  console.log(`  - taskId, ablation, runIndex, timestamp`);
  console.log(`  - llmConfig (provider, model, temperature, seed)`);
  console.log(`  - agentConfigs (id, name, role, knownItems, initialBias)`);
  console.log(`  - rounds[].conversationLogs (reasoning, evidence, itemBeliefs, referencedAgents)`);
  console.log(`  - rounds[].governanceIssues (type, severity, description, agents)`);
  console.log(`  - rounds[].interventions (type, target, parameters, effect, applied)`);
  console.log(`  - rounds[].influenceEvents (source, target, type, weight)`);
  console.log(`  - rounds[].beliefChanges, beliefs, confidences, tau, evalScores`);
  console.log(`  - finalAnswer, groundTruth, extractedRanking, success`);
  console.log(`  - agentUsage (promptTokens, completionTokens, latency per agent)`);
  console.log(`  - totalTokenCost, evaluationScores`);
  console.log(`  - interactionGraph, decisionTrace`);
}

main().catch(err => {
  console.error("Data package generation failed:", err);
  process.exit(1);
});
