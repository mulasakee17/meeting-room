/**
 * SwarmAlpha V2 Experiment Runner
 *
 * Focused, statistically-valid experiment on the M&A Hidden Profile task.
 *
 * Research question:
 *   Can adaptive governance improve collective decision quality
 *   in multi-agent systems?
 *
 * Design:
 *   1 task (M&A) × 7 ablation modes × 15 runs = 105 experiments
 *   Accuracy metric: Kendall's τ (rank correlation), not keyword matching
 *   Intervention validation: measure actual belief change after intervention
 *
 * Usage: npx tsx experiments/v2/run.ts
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

import { CustomAgent } from "../../src/lib/adapters/custom";
import { DiscussionEngine, type DiscussionAgent } from "../../src/lib/discussion";
import { EvaluationEngine } from "../../src/lib/evaluation";
import { GovernanceRuntime } from "../../src/runtime/GovernanceRuntime";
import type { LLMConfig, LLMProvider } from "../../src/lib/llm/providers";
import { TASK_MA, type TaskConfig } from "../lunar_survival/config";
import { TASK_INVEST } from "./task_invest";
import { TASK_CRISIS } from "./task_crisis";
import { TASK_SUPPLIER } from "./task_supplier";
import { mulberry32, cohensD, mean, sampleStd, extractRanking, kendallTau, kuramotoR } from "./statsShared";

const TASKS: Record<string, { task: TaskConfig; dataDir: string }> = {
  crisis: { task: TASK_CRISIS, dataDir: "data_crisis" },
  supplier: { task: TASK_SUPPLIER, dataDir: "data_supplier" },
};

// ============================================================================
// Types
// ============================================================================

/** Ablation modes:
 *  - "none": no detection, no intervention (baseline)
 *  - "full": all 4 detectors + interventions
 *  - "shuffle": full governance but agent knowledge scrambled (regression-to-mean control)
 *  - "full_diversity":  only introduce_diversity intervention (echo chamber → diversity)
 *  - "full_weight":     only reduce_weight intervention (authority bias → weight cut)
 *  - "full_reflection": only force_reflection intervention (polarization → reflect)
 *  - "full_continue":   only continue_discussion intervention (premature consensus → more rounds)
 */
type Ablation = "none" | "full" | "shuffle" | "full_diversity" | "full_weight" | "full_reflection" | "full_continue" | "full_fixed";

interface RoundRecord {
  roundNumber: number;
  beliefs: Record<string, number>;
  confidences: Record<string, number>;
  converged: boolean;
  /** Governance issues detected this round */
  issues: string[];
  /** Interventions applied this round */
  interventions: Array<{ type: string; targetAgentId?: string; targetAgents?: string[] }>;
  /** Per-agent conversation text this round (agentId → reasoning). 2026-07-22 新增以支持对话原文回溯。 */
  messages?: Record<string, string>;
}

interface InterventionEffect {
  round: number;
  interventionType: string;
  targetAgentId?: string;
  /** Belief before intervention */
  beliefBefore: number;
  /** Belief after intervention (next round's opening belief for that agent) */
  beliefAfter: number;
  /** Did belief move in the expected direction? */
  effective: boolean;
}

/** Token usage stats for a single agent */
interface AgentTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalLatencyMs: number;
  callCount: number;
}

interface ExperimentResult {
  runId: string;
  ablation: Ablation;
  runIndex: number;
  /** 代码版本标记（格式: YYYY-MM-DD，用于区分修复前后数据） */
  codeVersion: string;
  timestamp: string;

  // Primary metrics
  kendallTau: number;          // -1 to 1, 1 = perfect rank agreement
  decisionQuality: number;     // transformed to 0-100
  tauTrajectory?: number[];    // per-round τ values

  // Secondary metrics
  totalRounds: number;
  converged: boolean;
  consensusLevel: number;      // Kuramoto order parameter (final round)
  opinionDiversity: number;    // belief std (final round)

  // Governance
  totalInterventions: number;
  issuesDetected: string[];
  interventionEffects: InterventionEffect[];
  /** Per-intervention-type counts: { reduce_weight: 3, continue_discussion: 5, ... } */
  interventionBreakdown: Record<string, number>;

  // Token usage (real measurements from LLM API)
  tokenUsage?: {
    byAgent: Record<string, AgentTokenUsage>;
    total: { promptTokens: number; completionTokens: number; totalTokens: number; totalLatencyMs: number };
  };

  // Evaluation
  evaluationScores: Record<string, number>;

  // Full timeline
  rounds: RoundRecord[];
  finalDecision: string;
  groundTruth: Record<string, number>;
  extractedRanking: string[];

  // 实验失败时填充——错误隔离占位
  task?: string;
  llmSeed?: number;
  ablationConfig?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// Parameters
// ============================================================================

const PARAMS = {
  maxRounds: 3,
  convergenceThreshold: 0.06,
  temperature: 0.2,
  model: "deepseek-chat",
  provider: "deepseek" as const,
  runsPerCondition: 15,
  // 断裂环路修复后重跑：仅 none/full/shuffle 三组即可回答核心研究问题
  ablationModes: ["none", "full", "shuffle"] as Ablation[],
};

// CLI 扩样支持: npx tsx run.ts <task> --start=<N> --count=<M> --mode=<ablation> --provider=<P> --model=<M>
// --start: 起始 runIndex（默认 0）
// --count: 本次运行的实验数/cell（默认 PARAMS.runsPerCondition）
// --mode:  只跑指定 ablation mode（默认跑 PARAMS.ablationModes 全部）
// --provider: LLM 提供商（默认 deepseek），跨模型验证时用 qwen/openai/zhipu
// --model: 模型名（默认 deepseek-chat）
function parseCliArgs(): { start: number; count: number; mode: string | null; provider: LLMProvider; model: string } {
  const args = process.argv.slice(3);
  let start = 0;
  let count = PARAMS.runsPerCondition;
  let mode: string | null = null;
  let provider: LLMProvider = PARAMS.provider;
  let model = PARAMS.model;
  for (const arg of args) {
    if (arg.startsWith("--start=")) start = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--count=")) count = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--mode=")) mode = arg.split("=")[1];
    if (arg.startsWith("--provider=")) provider = arg.split("=")[1] as LLMProvider;
    if (arg.startsWith("--model=")) model = arg.split("=")[1];
  }
  return { start, count, mode, provider, model };
}

// LLM_CONFIG 在 main 中根据 CLI 参数覆盖
let LLM_CONFIG: LLMConfig = {
  provider: PARAMS.provider,
  model: PARAMS.model,
  temperature: PARAMS.temperature,
};

/** 每次实验用不同 seed，保证可复现性的同时引入方差 */
function makeLLMConfig(runIndex: number): LLMConfig {
  return { ...LLM_CONFIG, seed: 42 + runIndex };
}

// ============================================================================
// Accuracy: Kendall's τ rank correlation
// ============================================================================

/**
 * extractRanking 和 kendallTau 已迁移到 ./statsShared（统一权威实现）
 */

/**
 * Transform Kendall's τ to a 0-100 "decision quality" score.
 * τ = -1 → 0, τ = 0 → 50, τ = 1 → 100.
 */
function tauToQuality(tau: number): number {
  return Math.round(((tau + 1) / 2) * 100);
}

// ============================================================================
// Agent creation
// ============================================================================

function createAgents(task: TaskConfig, llmConfig: LLMConfig): DiscussionAgent[] {
  return task.agents.map(info => {
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
      + `    {"item": "方案A-全城封锁", "rank": 3, "belief": -0.5, "confidence": 85},\n`
      + `    {"item": "方案B-分阶段响应", "rank": 1, "belief": 0.7, "confidence": 90},\n`
      + `    {"item": "CompanyZ (行业C)", "rank": 2, "belief": 0.1, "confidence": 65}\n`
      + `  ]\n`
      + `}\n`
      + `itemBeliefs中：rank为你认为的排名(1=最优)，belief为对该选项的独立偏好(-1=强烈反对,0=中立,1=强烈支持)，confidence为置信度(0-100)`;
    return new CustomAgent(info.id, info.name, info.role, "default", llmConfig, systemPrompt) as unknown as DiscussionAgent;
  });
}

/**
 * Create a shuffled copy of the task for regression-to-mean control.
 *
 * Each agent's unique knowledge is rotated by +2 positions so no agent
 * keeps their own expertise. The total information in the group is
 * preserved, but the coherence between expertise role and data is broken.
 *
 * If governance improves τ in "shuffle" mode → improvement is from
 * discussion mechanics alone (regression to the mean, more rounds).
 * If governance does NOT improve τ in "shuffle" while "full" does →
 * improvement genuinely requires coherent unique knowledge integration.
 */
/**
 * P1-3 修复：shuffle 旋转随机化，不再固定 +2 偏移。
 * 每次实验使用 mulberry32(runIndex) 确定旋转偏移量，
 * 消除"特定固定旋转效应"的混淆。
 */
function shuffleTask(task: TaskConfig, runIndex: number): TaskConfig {
  const n = task.agents.length;
  if (n < 2) return task;
  // 随机偏移 ∈ [1, n-1]（偏移 0 等于没打乱）
  const rng = mulberry32(42 + runIndex);
  const offset = 1 + Math.floor(rng() * (n - 1));
  const rotatedAgents = task.agents.map((agent, i) => ({
    ...agent,
    knownItems: task.agents[(i + offset) % n].knownItems,
  }));
  return { ...task, agents: rotatedAgents };
}

// ============================================================================
// Intervention validation
// ============================================================================

/**
 * After all rounds are complete, measure whether interventions actually
 * changed the target agent's belief in subsequent rounds.
 */
function validateInterventions(
  rounds: RoundRecord[],
  interventionEffects: InterventionEffect[]
): InterventionEffect[] {
  for (const effect of interventionEffects) {
    // Look for the target agent's belief in the NEXT round
    const nextRound = rounds.find(r => r.roundNumber === effect.round + 1);
    if (nextRound && effect.targetAgentId) {
      const after = nextRound.beliefs[effect.targetAgentId];
      if (after !== undefined) {
        effect.beliefAfter = after;
        // Effective if belief moved: for reduce_weight (move away from dominance),
        // for force_reflection (move toward mean), for introduce_diversity (any change)
        const delta = Math.abs(effect.beliefAfter - effect.beliefBefore);
        effect.effective = delta > 0.05; // meaningful change threshold
      }
    }
  }
  return interventionEffects;
}

// ============================================================================
// Single run
// ============================================================================

async function runSingle(
  task: TaskConfig,
  ablation: Ablation,
  runIndex: number,
): Promise<ExperimentResult> {
  // ── Shuffle control: scramble agent knowledge to break coherence ────
  const effectiveTask = ablation === "shuffle" ? shuffleTask(task, runIndex) : task;
  const agents = createAgents(effectiveTask, makeLLMConfig(runIndex));
  const runId = `${task.id}_${ablation}_${runIndex}`;

  // Build governance mode and config for DiscussionEngine
  const governanceMode: "none" | "detect-only" | "full" = ablation === "none" ? "none" : "full";

  // Single-intervention ablation: only enable the detector that maps to
  // the target intervention type. This isolates which intervention matters.
  const singleInterventionMap: Record<string, string> = {
    full_diversity:  "enableEchoChamberDetection",
    full_weight:     "enableAuthorityBiasDetection",
    full_reflection: "enablePolarizationDetection",
    full_continue:   "enablePrematureConsensusDetection",
  };

  const isSingleMode = ablation.startsWith("full_") && ablation !== "full" && ablation !== "full_fixed";
  const govOverride: Record<string, unknown> = {};
  if (isSingleMode) {
    // Disable all detectors, then enable only the target one
    govOverride.enableEchoChamberDetection = false;
    govOverride.enableAuthorityBiasDetection = false;
    govOverride.enablePolarizationDetection = false;
    govOverride.enablePrematureConsensusDetection = false;
    const targetKey = singleInterventionMap[ablation];
    if (targetKey) govOverride[targetKey] = true;
  }

  // full_fixed: A/B 对照实验 B 组——与 full 相同但使用固定排序（无 F 分解）
  if (ablation === "full_fixed") {
    govOverride.sortingMode = "fixed" as const;
  }

  const engine = new DiscussionEngine({
    maxRounds: PARAMS.maxRounds,
    convergenceThreshold: PARAMS.convergenceThreshold,
    governanceMode,
    seed: 42 + runIndex, // 与 LLM seed 一致，保证干预随机性可复现
    ...(Object.keys(govOverride).length > 0 ? {
      governanceConfig: govOverride,
    } : {}),
  });

  // ── Set agent knowledge for information-layer interventions ─────────
  // Use effectiveTask (shuffled when ablation === "shuffle") so the
  // governance prompts reference the same (scrambled) knowledge the agents see.
  const knowledge = new Map<string, string[]>();
  for (const info of effectiveTask.agents) {
    // Split knownItems by semicolons, newlines, or bullet points
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

  const result = await engine.run(agents, taskObj);

  // ── Build round-by-round records ──────────────────────────────────────
  const rounds: RoundRecord[] = [];
  const interventionEffects: InterventionEffect[] = [];
  const allIssues: string[] = [];
  const interventionBreakdown: Record<string, number> = {};
  let totalInterventions = 0;

  // Extract pre-intervention beliefs for validation
  const prevRoundBeliefs = new Map<number, Record<string, number>>();

  const discData = engine.getDiscussionData(
    taskObj,
    agents.map(a => ({ id: a.id, name: a.name, role: a.role, type: a.type }))
  );

  for (let i = 0; i < result.roundResults.length; i++) {
    const rr = result.roundResults[i];
    const rd = discData.rounds[i];
    const beliefs: Record<string, number> = {};
    const confidences: Record<string, number> = {};

    for (const o of rr.opinions) {
      beliefs[o.agentId] = o.belief;
      confidences[o.agentId] = o.confidence;
    }

    // Record pre-intervention beliefs
    prevRoundBeliefs.set(rr.roundNumber, { ...beliefs });

    const roundIssues: string[] = [];
    const roundInterventions: Array<{ type: string; targetAgentId?: string; targetAgents?: string[] }> = [];

    if (rd) {
      for (const issue of rd.governanceIssues) {
        roundIssues.push(issue.type);
        allIssues.push(issue.type);
      }
      for (const intv of rd.interventions) {
        roundInterventions.push({
          type: intv.type,
          targetAgentId: intv.targetAgentId,
          targetAgents: intv.targetAgents,
        });
        totalInterventions++;
        interventionBreakdown[intv.type] = (interventionBreakdown[intv.type] || 0) + 1;

        // Record intervention effect for later validation
        // Handle both single target (reduce_weight) and multi-target (force_reflection, etc.)
        const targets = intv.targetAgentId
          ? [intv.targetAgentId]
          : intv.targetAgents || [];
        for (const targetId of targets) {
          interventionEffects.push({
            round: rr.roundNumber,
            interventionType: intv.type,
            targetAgentId: targetId,
            beliefBefore: beliefs[targetId] ?? 0,
            beliefAfter: 0, // filled after all rounds
            effective: false,
          });
        }
      }
    }

    rounds.push({
      roundNumber: rr.roundNumber,
      beliefs,
      confidences,
      converged: rr.converged,
      issues: roundIssues,
      interventions: roundInterventions,
      messages: Object.fromEntries(rr.opinions.map(o => [o.agentId, o.reasoning])),
    });
  }

  // ── Validate interventions ────────────────────────────────────────────
  validateInterventions(rounds, interventionEffects);

  // ── Compute Kendall's τ ──────────────────────────────────────────────
  const allReasoning = result.roundResults
    .flatMap(r => r.opinions.map(o => o.reasoning))
    .join("\n");
  const finalDecision = result.finalDecision || allReasoning;
  const itemNames = Object.keys(task.correctAnswer);
  const allItemBeliefs = result.roundResults
    .flatMap(r => r.opinions)
    .flatMap(o => o.itemBeliefs || []);
  const extractedRanking = extractRanking(finalDecision, itemNames, allItemBeliefs);
  const tau = kendallTau(task.correctAnswer, extractedRanking);

  // ── Compute secondary metrics ────────────────────────────────────────
  const lastRound = result.roundResults[result.roundResults.length - 1];
  const lastBeliefs = lastRound?.opinions.map(o => o.belief) || [];
  const consensusLevel = lastBeliefs.length > 0
    ? kuramotoR(lastBeliefs)
    : 0;
  const opinionDiversity = lastBeliefs.length > 0 ? sampleStd(lastBeliefs) : 0;

  // ── Per-round evaluation dimension scores ─────────────────────────────
  const evalEngine = new EvaluationEngine();
  const agentInfo = agents.map(a => ({ id: a.id, name: a.name, role: a.role, type: a.type }));

  for (let i = 0; i < result.roundResults.length; i++) {
    const rr = result.roundResults[i];
    // ── Per-round τ: this round's NEW reasoning only ─────────────────
    const roundReasoning = rr.opinions.map(o => o.reasoning).join("\n");
    const roundItemBeliefs = rr.opinions.flatMap(o => o.itemBeliefs || []);
    const roundRanking = extractRanking(roundReasoning, itemNames, roundItemBeliefs);
    const roundTau = kendallTau(task.correctAnswer, roundRanking);
    (rounds[i] as any).tau = roundTau;
    (rounds[i] as any).decisionQuality = tauToQuality(roundTau);

    // ── Per-round evaluation dimension scores ────────────────────────
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
    try {
      const ev = evalEngine.evaluate(decisions, agentInfo, history, `Round ${rr.roundNumber}`);
      (rounds[i] as any).evalScores = {};
      for (const [key, dim] of Object.entries(ev.dimensions || {})) {
        (rounds[i] as any).evalScores[key] = (dim as any).score ?? 0;
      }
      (rounds[i] as any).evalScores.overall = ev.overallScore;
    } catch (err) {
        console.warn(`[${runId}] per-round evaluation failed for round ${rr.roundNumber}:`, err instanceof Error ? err.message : err);
      }
  }

  // ── Final-round evaluation scores (for backward compat) ──────────────
  const evaluationScores: Record<string, number> = {};
  const lastRoundWithEval = rounds.filter(r => (r as any).evalScores).pop();
  if (lastRoundWithEval) {
    Object.assign(evaluationScores, (lastRoundWithEval as any).evalScores);
  }

  // ── Collect token usage from agents ─────────────────────────────────────
  const tokenUsageByAgent: Record<string, AgentTokenUsage> = {};
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalLatencyMs = 0;

  for (const agent of agents) {
    // Cast back to CustomAgent to access getUsageStats()
    const customAgent = agent as unknown as CustomAgent;
    if (customAgent.getUsageStats) {
      const stats = customAgent.getUsageStats();
      tokenUsageByAgent[agent.id] = {
        promptTokens: stats.promptTokens,
        completionTokens: stats.completionTokens,
        totalTokens: stats.totalTokens,
        totalLatencyMs: stats.totalLatencyMs,
        callCount: stats.callCount,
      };
      totalPromptTokens += stats.promptTokens;
      totalCompletionTokens += stats.completionTokens;
      totalLatencyMs += stats.totalLatencyMs;
    }
  }

  return {
    runId, ablation, runIndex,
    codeVersion: "2026-07-19",
    timestamp: new Date().toISOString(),
    kendallTau: tau,
    decisionQuality: tauToQuality(tau),
    /** Per-round τ trajectory: τ at each round (cumulative reasoning) */
    tauTrajectory: rounds.map(r => (r as any).tau as number),
    totalRounds: result.totalRounds,
    converged: result.converged,
    consensusLevel,  // Kuramoto R ∈ [0,1] by construction, no clamp needed
    opinionDiversity,
    totalInterventions,
    issuesDetected: [...new Set(allIssues)],
    interventionEffects,
    interventionBreakdown,
    tokenUsage: {
      byAgent: tokenUsageByAgent,
      total: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
        totalLatencyMs,
      },
    },
    evaluationScores,
    rounds,
    finalDecision: finalDecision.substring(0, 2000),
    groundTruth: task.correctAnswer,
    extractedRanking,
  };
}

// ============================================================================
// Statistics
// ============================================================================

// kuramotoR 已迁移到 ./statsShared（统一权威实现）


// ============================================================================
// Main
// ============================================================================

async function main() {
  const taskKey = process.argv[2] || "crisis";
  if (!TASKS[taskKey]) {
    console.error(`Unknown task: ${taskKey}`);
    console.error(`Available tasks: ${Object.keys(TASKS).join(", ")}`);
    process.exit(1);
  }
  const { start, count, mode, provider, model } = parseCliArgs();
  const { task, dataDir: dataDirName } = TASKS[taskKey];

  // 跨模型验证：非 deepseek 提供商使用独立数据目录，避免覆盖
  const providerSuffix = provider === "deepseek" ? "" : `_${provider}`;
  const effectiveDataDir = `${dataDirName}${providerSuffix}`;

  // 根据 provider 自动选择 API key
  const apiKeyMap: Record<string, string | undefined> = {
    deepseek: process.env.DEEPSEEK_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    zhipu: process.env.ZHIPU_API_KEY,
    qwen: process.env.QWEN_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    local: undefined,
  };
  const apiKey = apiKeyMap[provider];
  if (!apiKey && provider !== "local") {
    const envVar = provider === "deepseek" ? "DEEPSEEK_API_KEY"
      : provider === "openai" ? "OPENAI_API_KEY"
      : provider === "zhipu" ? "ZHIPU_API_KEY"
      : provider === "qwen" ? "QWEN_API_KEY"
      : provider === "anthropic" ? "ANTHROPIC_API_KEY"
      : "UNKNOWN";
    console.error(`[FATAL] ${envVar} 未设置，无法使用 ${provider} 提供商`);
    process.exit(1);
  }

  // 覆盖 LLM_CONFIG（Qwen3.7-plus 等大模型需要更长超时）
  const providerTimeoutMs = provider === "qwen" ? 120_000 : 30_000;
  LLM_CONFIG = { provider, model, temperature: PARAMS.temperature, apiKey, timeout: providerTimeoutMs };

  const DATA_DIR = path.resolve(__dirname, effectiveDataDir);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const allResults: ExperimentResult[] = [];

  // --mode 覆盖：只跑指定 ablation mode（用于 pilot 或补跑特定组）
  const modesToRun = mode ? [mode as Ablation] : PARAMS.ablationModes;

  console.log("=".repeat(70));
  console.log("  SwarmAlpha V2 — Experiment Runner");
  console.log(`  Task: ${task.title} (${taskKey})`);
  console.log(`  Provider: ${provider} | Model: ${model}`);
  console.log(`  Data dir: ${effectiveDataDir}`);
  console.log(`  Modes: ${modesToRun.join(", ")}`);
  console.log(`  Runs: ${count} per condition (runIndex ${start}..${start + count - 1})`);
  console.log(`  Total: ${count * modesToRun.length} experiments`);
  console.log("=".repeat(70));

  for (const ablation of modesToRun) {
    console.log(`\n── ${ablation} ──`);
    for (let i = start; i < start + count; i++) {
      const filename = path.join(DATA_DIR, `${task.id}_${ablation}_${i}.json`);
      if (fs.existsSync(filename)) {
        const existing = JSON.parse(fs.readFileSync(filename, "utf-8")) as ExperimentResult;
        // 缓存污染修复：错误占位文件不视为有效缓存，删除后重跑
        if (existing.error) {
          console.log(`  [${i - start + 1}/${count}] (cached error, retrying) ${existing.error}`);
          fs.unlinkSync(filename);
        } else {
          allResults.push(existing);
          console.log(`  [${i - start + 1}/${count}] (cached) τ=${existing.kendallTau.toFixed(3)} | Q=${existing.decisionQuality}`);
          continue;
        }
      }
      // 错误隔离：单次实验失败不应中止整批
      // 最多重试 3 次，指数退避（1s, 2s, 4s）
      let result: ExperimentResult | null = null;
      const maxRetries = 3;
      // qwen3.7-plus 等大模型响应慢（15 次 LLM 调用 × 30-60s/次 ≈ 8-15 分钟），放宽到 20 分钟
      const EXPERIMENT_TIMEOUT_MS = provider === "qwen" ? 20 * 60 * 1000 : 5 * 60 * 1000;
      const timeoutLabel = provider === "qwen" ? "20 分钟" : "5 分钟";
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // 超时报警：单次实验超过阈值则中断
          const expStart = Date.now();
          let timerId: ReturnType<typeof setTimeout>;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timerId = setTimeout(() => {
              const elapsed = ((Date.now() - expStart) / 1000).toFixed(0);
              console.error(`  ⏰ [TIMEOUT ALARM] ${ablation}/${i} 已运行 ${elapsed}s，超过 ${timeoutLabel}限制，强制中断`);
              reject(new Error(`实验超时（${elapsed}s）`));
            }, EXPERIMENT_TIMEOUT_MS);
          });
          result = await Promise.race([
            runSingle(task, ablation, i),
            timeoutPromise,
          ]);
          clearTimeout(timerId!);
          break;
        } catch (err) {
          const isLastAttempt = attempt === maxRetries;
          const waitMs = Math.pow(2, attempt - 1) * 1000;
          const errMsg = err instanceof Error ? err.message : String(err);
          if (isLastAttempt) {
            console.error(`  [${i - start + 1}/${count}] FAILED after ${maxRetries} attempts: ${errMsg}`);
            // 写入错误占位文件，分析时可识别
            const errorResult: ExperimentResult = {
              task: task.id, ablation, runIndex: i,
              codeVersion: "2026-07-19",
              timestamp: new Date().toISOString(),
              finalDecision: `[ERROR] ${errMsg}`,
              rounds: [], totalRounds: 0,
              kendallTau: 0, decisionQuality: 0,
              totalInterventions: 0, interventionEffects: [],
              ablationConfig: {}, llmSeed: 42 + i,
              error: errMsg,
            };
            fs.writeFileSync(filename, JSON.stringify(errorResult, null, 2));
            allResults.push(errorResult);
          } else {
            console.warn(`  [${i - start + 1}/${count}] attempt ${attempt}/${maxRetries} failed: ${errMsg}. Retrying in ${waitMs}ms...`);
            await new Promise(r => setTimeout(r, waitMs));
          }
        }
      }
      if (result) {
        allResults.push(result);
        fs.writeFileSync(filename, JSON.stringify(result, null, 2));
        const intvStr = result.totalInterventions > 0
          ? ` | ${result.totalInterventions} interventions, ${result.interventionEffects.filter(e => e.effective).length} effective`
          : "";
        console.log(`  [${i - start + 1}/${count}] τ=${result.kendallTau.toFixed(3)} | Q=${result.decisionQuality} | rounds=${result.totalRounds}${intvStr}`);
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("  Summary: Decision Quality (Kendall's τ → 0-100)");
  console.log("=".repeat(70));

  const baseline = allResults.filter(r => r.ablation === "none");

  console.log("\n| Ablation       | n  | Q μ±σ      | Kendall τ μ±σ  | Intv (eff) | d vs none |");
  console.log("|----------------|----|------------|----------------|------------|-----------|");

  for (const ablation of modesToRun) {
    const group = allResults.filter(r => r.ablation === ablation);
    const qs = group.map(r => r.decisionQuality);
    const ts = group.map(r => r.kendallTau);
    const qMean = mean(qs);
    const qStd = sampleStd(qs);
    const tMean = mean(ts);
    const tStd = sampleStd(ts);
    const totalIntv = group.reduce((s, r) => s + r.totalInterventions, 0);
    const totalEff = group.reduce((s, r) => s + r.interventionEffects.filter(e => e.effective).length, 0);
    // Cohen's d: ablation - baseline（与 analyze.ts 方向一致，正值=干预优于基线）
    const d = ablation === "none" ? 0 : cohensD(qs, baseline.map(r => r.decisionQuality));

    const qStr = `${qMean.toFixed(1)}±${qStd.toFixed(1)}`;
    const tStr = `${tMean.toFixed(3)}±${tStd.toFixed(3)}`;
    const intvStr = ablation === "none" ? "—" : `${totalIntv} (${totalEff})`;
    const dStr = ablation === "none" ? "—" : d.toFixed(2);

    console.log(`| ${ablation.padEnd(14)} | ${group.length} | ${qStr.padEnd(10)} | ${tStr.padEnd(14)} | ${intvStr.padEnd(10)} | ${dStr.padEnd(9)} |`);
  }

  // ── Save aggregate ───────────────────────────────────────────────────
  const summary = {
    task: task.title,
    codeVersion: "2026-07-19",
    params: PARAMS,
    timestamp: new Date().toISOString(),
    totalExperiments: allResults.length,
    results: allResults,
  };
  fs.writeFileSync(
    path.join(DATA_DIR, "summary.json"),
    JSON.stringify(summary, null, 2)
  );

  console.log(`\nAll data saved to ${DATA_DIR}/`);
  console.log("Done.");
}

main().catch(console.error);
