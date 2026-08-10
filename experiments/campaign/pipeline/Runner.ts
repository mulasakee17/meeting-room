/**
 * Runner — 实验执行引擎
 *
 * 负责：根据 ExperimentConfig 运行单次实验，保存原始数据。
 * 支持 Belief Runtime 和 Cognitive Runtime 两种模式。
 */

import * as fs from "fs";
import * as path from "path";
import { CustomAgent } from "../../../src/lib/adapters/custom";
import { DiscussionEngine, type DiscussionAgent } from "../../../src/lib/discussion";
import { NativeCognitiveEngine } from "../../../src/lib/discussion/nativeCognitiveEngine";
import type { LLMConfig } from "../../../src/lib/llm/providers";
import { detectLLMProvider } from "../../../src/lib/llm/providers";
import type {
  ExperimentConfig,
  RawRunData,
  CognitiveStateSnapshot,
  CognitiveMacroSnapshotV1,
  RuntimeMode,
} from "../types";
import { RAW_SCHEMA_VERSION } from "../types";
import {
  extractRanking,
  kendallTau,
  mulberry32,
} from "../../v2/statsShared";
import {
  computeSocialUpdateGain,
  cognitiveStateToBelief,
  cognitiveStateToConfidence,
  stanceFromItemBeliefs,
  type AgentCognitiveState,
} from "../../../src/lib/agent/cognitiveState";
import { computeDeltaDiagnosis } from "../../../src/lib/thermodynamics/computeDelta";
import type { ProgressiveEstimates } from "../../../src/lib/thermodynamics/ProgressiveEstimator";
import type { GovernanceEstimate } from "../../../src/lib/epistemic/semantics";
import { safeJsonParse } from "../../../src/lib/utils/jsonUtils";
import {
  candidateCanonicals,
  candidateAliases,
  type PromptTask,
} from "../../../src/lib/experiment-contracts/contracts";
import {
  createRunAssignment,
  type TreatmentArm,
} from "../../../src/lib/experimentation/assignment";
import type {
  InterventionApplicationReceipt,
  ProximalOutcomeRecord,
  TaskOutcomeRecord,
} from "../../../src/lib/experimentation/lifecycle";
import { PROXIMAL_BELIEF_SUMMARY_CONTRACT } from "../../../src/lib/experimentation/lifecycle";
import {
  loadOrCreateRunAssignmentManifest,
  readRunAssignmentManifest,
} from "../../../src/lib/experimentation/manifest";
import { taskConfigToBundle, extractEvidenceIds } from "../tasks/legacyAdapter";
import { runHiddenBenchProtocol, scoreHiddenBenchTranscript } from "./hiddenbenchProtocol";
import { verifyRawRunData } from "../replayVerifier";
import { assertValidStudyContract } from "../studyContractGuard";

// ============================================================================
// Scenario Loading
// ============================================================================

export type ScenarioLoader = (
  scenarioId: string,
  taskIndex?: number,
  promptStyle?: "hint" | "nohint",
) => { task: any; dataDir: string };

let scenarioLoader: ScenarioLoader | undefined;

/**
 * 测试注入点：替换场景加载器，避免测试依赖 vitest 无法解析的 CJS `require`
 * 加载 `.ts` 场景模块。仅测试使用；生产路径保持原 require 行为。
 */
export function setScenarioLoaderForTesting(loader: ScenarioLoader | undefined): void {
  scenarioLoader = loader;
}

/** 加载场景配置。taskIndex 仅 hiddenbench 使用（指定跑第几个 HiddenBench 任务） */
function loadScenario(scenarioId: string, taskIndex?: number, promptStyle?: "hint" | "nohint"): { task: any; dataDir: string } {
  if (scenarioLoader) return scenarioLoader(scenarioId, taskIndex, promptStyle);
  switch (scenarioId) {
    case "ma": {
      const { TASK_MA } = require("../../lunar_survival/config");
      return { task: TASK_MA, dataDir: "data" };
    }
    case "crisis": {
      const { TASK_CRISIS } = require("../../v2/task_crisis");
      return { task: TASK_CRISIS, dataDir: "data_crisis" };
    }
    case "crisis_v2": {
      const { TASK_CRISIS_V2 } = require("../../v2/task_crisis");
      return { task: TASK_CRISIS_V2, dataDir: "data_crisis_v2" };
    }
    case "supplier": {
      const { TASK_SUPPLIER } = require("../../v2/task_supplier");
      return { task: TASK_SUPPLIER, dataDir: "data_supplier" };
    }
    case "invest": {
      const { TASK_INVEST } = require("../../v2/task_invest");
      return { task: TASK_INVEST, dataDir: "data_invest" };
    }
    case "er_triage": {
      const { TASK_ER_TRIAGE } = require("../../v2/task_er_triage");
      return { task: TASK_ER_TRIAGE, dataDir: "data_er_triage" };
    }
    case "university": {
      const { TASK_UNIVERSITY } = require("../tasks/task_university");
      return { task: TASK_UNIVERSITY, dataDir: "data_university" };
    }
    case "optimized": {
      const { TASK_OPTIMIZED } = require("../tasks/task_optimized");
      return { task: TASK_OPTIMIZED, dataDir: "data_optimized" };
    }
    case "hiddenbench": {
      // HiddenBench 外部任务集：taskIndex 指定第几个任务（0-64），缺省第 1 个
      // promptStyle: "nohint" 对齐原论文主实验（不提示信息不对称），"hint" 为主动分享版
      const { loadAllConfigs } = require("../tasks/hiddenbench/adapter");
      const all = loadAllConfigs(undefined, undefined, promptStyle ?? "hint");
      const idx = typeof taskIndex === "number" && taskIndex >= 0 && taskIndex < all.length
        ? taskIndex
        : 0;
      return { task: all[idx], dataDir: "data_hiddenbench" };
    }
    default:
      throw new Error(`Unknown scenario: ${scenarioId}`);
  }
}

// ============================================================================
// Agent Creation
// ============================================================================

function createAgents(
  promptTask: PromptTask,
  agentCount: number,
  llmConfig: LLMConfig,
  seed: number,
): { agents: DiscussionAgent[]; knowledge: Map<string, string[]> } {
  const rng = mulberry32(seed);
  const agents: DiscussionAgent[] = [];
  const knowledge = new Map<string, string[]>();
  const candidateOptions = candidateCanonicals(promptTask);
  const candidateContract = candidateOptions
    .map((option, index) => `${index + 1}. ${option}`)
    .join("\n");

  // 为每个 agent 分配独有信息（来自 PromptTask 的 prompt 侧角色定义）
  const selected = promptTask.schema.agents.slice(0, agentCount);

  for (let i = 0; i < selected.length; i++) {
    const agentDef = selected[i];
    const name = agentDef.name || `Agent ${i + 1}`;
    const role = agentDef.role || "Analyst";
    const agentId = agentDef.id || `agent_${i}`;

    const initialBias = agentDef.initialBias;
    const initialBelief = typeof initialBias === "number" ? initialBias / 100 : (rng() * 0.6 - 0.3);
    const initialConfidence = 50 + rng() * 20;

    // 构建独有知识提示（不包含 sharedBriefing，避免与 buildPrompt 中 Task 重复）
    // promptStyle="nohint"：对齐 HiddenBench 原论文主实验——不提示信息不对称，
    // 只给"你掌握的信息"块 + 中性讨论规则，靠讨论自然揭示（基线应重现"讨论后失败"）。
    const noHint = promptTask.schema.promptStyle === "nohint";
    const customPrompt = agentDef.privateInformation
      ? `${noHint ? "你掌握的信息" : "你的独有专业知识（其他成员不知道）"}：\n${agentDef.privateInformation}\n\n${agentDef.initialBias || ""}\n\n`
        + `讨论规则：\n`
        + (noHint
          ? `1. 仔细考虑你掌握的所有信息\n`
            + `2. 简洁地与组员分享你的想法\n`
            + `3. 认真听取他人的分享\n`
          : `1. 主动分享你的独有知识\n`
            + `2. 对他人的判断提出质疑\n`
            + `3. 如果他人与你独有知识矛盾，必须指出\n`)
        + `候选标签契约（必须逐字使用，每个候选恰好输出一次）：\n${candidateContract}\n`
        + `rank 必须是 1 到 ${candidateOptions.length} 的完整排列，不得重复或缺失。\n`
        + `4. 最终以JSON格式给出你的判断，格式：\n`
        + `{\n`
        + `  "reasoning": "你的分析",\n`
        + `  "evidence": ["证据1", "证据2"],\n`
        + `  "belief": -1到1 (整体倾向),\n`
        + `  "confidence": 0到100,\n`
        + `  "nextOpinion": "下一步讨论方向",\n`
        + `  "referencedAgents": ["a2"],\n`
        + `  "itemBeliefs": [{"item": "<上述候选标签之一>", "rank": "<唯一整数>", "belief": 0.0, "confidence": 50}]\n`
        + `}\n`
        + `itemBeliefs中：rank为你认为的排名(1=最优)，belief为对该选项的独立偏好(-1=强烈反对,0=中立,1=强烈支持)，confidence为置信度(0-100)`
      : undefined;

    const agent = new CustomAgent(
      agentId,
      name,
      role,
      "expert",
      llmConfig,
      customPrompt,
    );
    agent.setState({
      belief: Math.max(-1, Math.min(1, initialBelief)),
      confidence: Math.max(0, Math.min(100, initialConfidence)),
    });
    agents.push(agent as unknown as DiscussionAgent);

    // 构建 agent knowledge（用于 governance 信息层干预）
    if (agentDef.privateInformation) {
      knowledge.set(agentId, extractEvidenceIds(agentDef.privateInformation));
    }
  }

  return { agents, knowledge };
}

export function buildDiscussionTaskContent(promptTask: PromptTask): string {
  const options = candidateCanonicals(promptTask);
  const briefing = promptTask.schema.publicContext || "";
  const optionList = options
    .map((option, index) => `${index + 1}. ${option}`)
    .join("\n");
  return `${briefing}\n\nCandidate option schema (use these labels exactly; order is not a priority signal):\n${optionList}`;
}

// ============================================================================
// Cognitive State Extraction
// ============================================================================

/** 从 agents 数组收集 token 使用统计（对应 Top 10 #9） */
function collectTokenUsage(agents: DiscussionAgent[]): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  byAgent: Record<string, {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    totalLatencyMs: number;
    callCount: number;
  }>;
  totalLatencyMs: number;
} {
  const byAgent: Record<string, {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    totalLatencyMs: number;
    callCount: number;
  }> = {};
  let totalPrompt = 0, totalCompletion = 0, totalLatency = 0;

  for (const agent of agents) {
    const customAgent = agent as unknown as CustomAgent;
    if (customAgent.getUsageStats) {
      const stats = customAgent.getUsageStats();
      byAgent[agent.id] = {
        promptTokens: stats.promptTokens,
        completionTokens: stats.completionTokens,
        totalTokens: stats.totalTokens,
        totalLatencyMs: stats.totalLatencyMs,
        callCount: stats.callCount,
      };
      totalPrompt += stats.promptTokens;
      totalCompletion += stats.completionTokens;
      totalLatency += stats.totalLatencyMs;
    }
  }

  return {
    promptTokens: totalPrompt,
    completionTokens: totalCompletion,
    totalTokens: totalPrompt + totalCompletion,
    byAgent,
    totalLatencyMs: totalLatency,
  };
}

function extractCognitiveSnapshots(
  engine: DiscussionEngine,
  round: number,
): CognitiveStateSnapshot[] {
  // 优先使用 NativeCognitiveEngine 的历史快照（修复 P0: 之前用最终状态导致 σ²ΔU=0）
  // NativeCognitiveEngine 在 updateCognitiveStatesFromRound 末尾存了每轮深拷贝
  const nativeEngine = engine as any;
  let states: Map<string, any>;
  if (typeof nativeEngine.getCognitiveStateHistory === "function") {
    const history = nativeEngine.getCognitiveStateHistory(round) as Map<string, any>;
    states = history.size > 0 ? history : engine.getCognitiveStates();
  } else {
    states = engine.getCognitiveStates();
  }

  const snapshots: CognitiveStateSnapshot[] = [];

  // 取本轮 opinions，用于提取 LLM 原生 ranking（itemBeliefs rank=1）
  // 用于 Part 3: Utility-Ranking Consistency 验证
  const roundDataArray = engine.getRoundDataArray();
  const roundData = roundDataArray.find(rd => rd.roundNumber === round);
  const roundOpinions = roundData?.opinions || [];

  for (const [agentId, state] of states) {
    // schema-2：socialUpdateGain（DeGroot 混合系数）与行为易感性分离存储。
    // susceptibility（deprecated 字段）恒等于 socialUpdateGain，绝不填入
    // 行为估计/公式值的逐轮混合；行为易感性保存在独立字段。
    const socialUpdateGain = computeSocialUpdateGain(state.inertia, state.confidence);

    // 提取该 agent 的 LLM 原生 ranking top（rank=1 的 item）
    const agentOpinion = roundOpinions.find(o => o.agentId === agentId);
    const rank1Item = agentOpinion?.itemBeliefs?.find((ib: any) => ib.rank === 1)?.item;

    snapshots.push({
      round,
      agentId,
      agentName: state.agentName,
      utility: state.utility.scores,
      utilityTopChoice: state.utility.topChoice,
      utilityPreferenceClarity: state.utility.preferenceClarity,
      utilityIntensity: state.utility.intensity,
      evidenceCoverage: state.evidence.coverage,
      evidenceQuality: state.evidence.quality,
      evidenceDiversity: state.evidence.diversity,
      evidenceRecentGain: state.evidence.recentGain,
      inertiaStrength: state.inertia.strength,
      confidenceOverall: state.confidence.overall,
      susceptibility: socialUpdateGain,
      socialUpdateGain,
      behavioralSusceptibilityEstimate: state.susceptibility.estimate,
      behavioralSusceptibilityConfidence: state.susceptibility.confidence,
      behavioralSusceptibilityUsable: state.susceptibility.usable,
      statedStance: agentOpinion?.itemBeliefs
        ? stanceFromItemBeliefs(agentOpinion.itemBeliefs)
        : cognitiveStateToBelief(state),
      belief: cognitiveStateToBelief(state),
      oldConfidence: cognitiveStateToConfidence(state),
      spokeThisRound: state.spokeThisRound,
      rankingTopChoice: rank1Item,
    });
  }

  return snapshots;
}

// ============================================================================
// Single Run
// ============================================================================

/** 运行单次实验 */
/**
 * HiddenBench 参考协议运行——完全独立的协议实现，不经过 SwarmAlpha engine。
 * 对齐第三方 reference implementation（jonradoff/hiddenbench，非论文作者官方仓库；
 * 协议细节最终以 arXiv:2505.11556 论文正文/附录为准）：
 * 顺序 round-robin + 自由文本（1-2句）+ pre/post 独立投票 + average/majority rule。
 */
async function runHiddenBenchSingle(
  config: ExperimentConfig,
  runId: string,
  seed: number,
  runIndex: number,
  outputDir: string,
): Promise<RawRunData> {
  // CC-2: validate any explicit study declaration before the hiddenbench
  // protocol can issue a single provider call.
  const governanceStudy = assertValidStudyContract(config);
  const scenario = loadScenario(config.scenario, config.taskIndex, config.promptStyle);
  const task = scenario.task;
  const effectiveSeed = (seed + runIndex * 0x9E3779B1) >>> 0;

  // WP2: pre-run treatment assignment for the reference-protocol path.
  const persistedAssignment = loadOrCreateRunAssignmentManifest({
    outputDir,
    runId,
    budgetContract: { maxRounds: config.maxRounds },
    createAssignment: () => createRunAssignment({
      id: `asn:${runId}`,
      unitId: runId,
      stratum: { taskId: task.id, model: config.llmModel, seed, runIndex, protocol: "hiddenbench" },
      arm: "vanilla_interaction",
      policyId: "swarmalpha.hiddenbench-reference",
      policyVersion: "1.0.0",
      masterSeed: effectiveSeed,
      assignedAt: new Date().toISOString(),
    }),
  });
  const treatmentAssignment = persistedAssignment.manifest.assignment;

  const llmConfig: LLMConfig = {
    provider: detectLLMProvider(config.llmModel),
    model: config.llmModel,
    temperature: config.temperature,
    seed: effectiveSeed,
    ...(config.timeout !== undefined ? { timeout: config.timeout } : {}),
  };

  const bundle = taskConfigToBundle(task);
  const transcript = await runHiddenBenchProtocol(bundle.promptTask, llmConfig, effectiveSeed, config.maxRounds);
  const hbResult = scoreHiddenBenchTranscript(transcript, bundle.scoringTask);

  // HiddenBench 协议无 ranking，用 postAccuracy 作为 finalAccuracy
  const finalAccuracy = hbResult.postAccuracy;
  const finalKendallTau = 0; // HiddenBench 协议不产生 ranking → τ 无定义
  const finalRanking: string[] = [];

  const taskOutcome: TaskOutcomeRecord = {
    runAssignmentId: treatmentAssignment.id,
    evaluationContractRef: { id: "swarmalpha.categorical.ranking", version: "1.0.0" },
    quality: finalAccuracy,
    cost: {
      promptTokens: hbResult.tokenUsage.promptTokens,
      completionTokens: hbResult.tokenUsage.completionTokens,
      totalTokens: hbResult.tokenUsage.totalTokens,
    },
    status: "scored",
  };

  const rawData: RawRunData = {
    runId,
    experimentId: config.id,
    runtimeMode: "native_cognitive", // 占位——HiddenBench 协议不区分 runtime
    seed,
    runIndex,
    rawSchemaVersion: RAW_SCHEMA_VERSION,
    ...(governanceStudy !== undefined ? { governanceStudy: structuredClone(governanceStudy) } : {}),
    timestamp: new Date().toISOString(),
    scenario: config.scenario,
    agentCount: config.agentCount,
    maxRounds: config.maxRounds,
    totalRounds: hbResult.totalRounds,
    converged: false, // HiddenBench 协议无收敛检测
    finalRanking,
    finalKendallTau,
    rankingMetricApplicable: false,
    finalAccuracy,
    individualAccuracy: hbResult.postAccuracy, // HiddenBench 协议 = average rule
    beliefTrajectory: [],
    interventions: [],
    governanceIssues: [],
    treatmentAssignment,
    assignmentManifest: {
      path: path.basename(persistedAssignment.absolutePath),
      sha256: persistedAssignment.sha256,
      reused: persistedAssignment.reused,
      assignmentId: treatmentAssignment.id,
    },
    applicationReceipts: [{
      id: `rcpt:${runId}:no-action`,
      assignmentId: treatmentAssignment.id,
      actionType: "no_action",
      status: "inapplicable",
      effectiveWindow: null,
      targetAgentIds: [],
      sourceEventIds: [],
    }],
    proximalOutcomes: [],
    taskOutcome,
    tokenUsage: {
      promptTokens: hbResult.tokenUsage.promptTokens,
      completionTokens: hbResult.tokenUsage.completionTokens,
      totalTokens: hbResult.tokenUsage.totalTokens,
    },
    hiddenbenchResult: {
      preVotes: hbResult.preVotes,
      postVotes: hbResult.postVotes,
      discussionHistory: hbResult.discussionHistory,
      preAccuracy: hbResult.preAccuracy,
      postAccuracy: hbResult.postAccuracy,
      preMajorityCorrect: hbResult.preMajorityCorrect,
      postMajorityCorrect: hbResult.postMajorityCorrect,
      collectiveGain: hbResult.collectiveGain,
      elapsedMs: hbResult.elapsedMs,
    },
  };

  // 保存原始数据
  const outPath = path.join(outputDir, `${runId}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(rawData, null, 2));

  console.log(
    `  [${new Date().toISOString()}] Completed ${runId} in ${(hbResult.elapsedMs / 1000).toFixed(1)}s ` +
    `(pre=${hbResult.preAccuracy.toFixed(2)} post=${hbResult.postAccuracy.toFixed(2)} ` +
    `gain=${hbResult.collectiveGain >= 0 ? "+" : ""}${hbResult.collectiveGain.toFixed(2)} ` +
    `maj=${hbResult.postMajorityCorrect ? "✓" : "✗"})`,
  );
  return rawData;
}

export async function runSingle(
  config: ExperimentConfig,
  runtimeMode: RuntimeMode,
  seed: number,
  runIndex: number,
  outputDir: string,
): Promise<RawRunData> {
  // CC-2: validate any explicit study declaration before either Runner path
  // can invoke a provider. Missing declarations stay legacy/undeclared.
  const governanceStudy = assertValidStudyContract(config);
  const runId = `${config.id}_${runtimeMode}_seed${seed}_run${runIndex}`;
  console.log(`  [${new Date().toISOString()}] Starting ${runId}...`);

  // ── HiddenBench 参考协议分叉 ──
  // 对齐第三方 reference implementation：顺序 round-robin + 自由文本 + pre/post 独立投票 + average rule。
  // 完全绕开 SwarmAlpha engine，使用独立的协议实现。
  if (config.protocol === "hiddenbench") {
    return runHiddenBenchSingle(config, runId, seed, runIndex, outputDir);
  }

  const scenario = loadScenario(config.scenario, config.taskIndex, config.promptStyle);
  const useCognitive = runtimeMode === "cognitive" || runtimeMode === "native_cognitive";
  const useNativeCognitive = runtimeMode === "native_cognitive";
  const effectiveSeed = (seed + runIndex * 0x9E3779B1) >>> 0;

  // WP1: legacy TaskConfig → ExperimentTaskBundle. Prompt path consumes only
  // the PromptTask; scoring consumes only the scoringTask (truth released
  // after discussion). candidate/truth completeness is validated in the loader.
  const bundle = taskConfigToBundle(scenario.task);

  // WP2: pre-run treatment assignment. Current experiments are fixed-condition,
  // so the eligible arm is the configuration-driven one at probability 1.0; the
  // record still carries seed/draw/policy so a future randomized manifest can
  // be audited the same way.
  const arm: TreatmentArm = config.governanceMode === "none" || config.governanceMode === "detect-only"
    ? "vanilla_interaction"
    : "diagnostic_governance";
  const persistedAssignment = loadOrCreateRunAssignmentManifest({
    outputDir,
    runId,
    budgetContract: { maxRounds: config.maxRounds },
    createAssignment: () => createRunAssignment({
      id: `asn:${runId}`,
      unitId: runId,
      stratum: {
        taskId: bundle.promptTask.schema.id,
        model: config.llmModel,
        seed,
        runIndex,
        runtimeMode,
        governanceMode: config.governanceMode,
      },
      arm,
      policyId: `swarmalpha.diagnostic.${config.governanceMode}`,
      policyVersion: "1.0.0",
      masterSeed: effectiveSeed,
      assignedAt: new Date().toISOString(),
    }),
  });
  const treatmentAssignment = persistedAssignment.manifest.assignment;

  const llmConfig: LLMConfig = {
    provider: detectLLMProvider(config.llmModel),
    model: config.llmModel,
    temperature: config.temperature,
    seed: effectiveSeed,
    ...(config.timeout !== undefined ? { timeout: config.timeout } : {}),
  };

  const { agents, knowledge } = createAgents(bundle.promptTask, config.agentCount, llmConfig, effectiveSeed);

  // Phase 4B: "cognitive" governance mode → "full" + useCognitiveGovernance
  // diversity_only: 启用认知治理，但只保留 evidence imbalance + cognitive action mismatch 检测器
  // 修复前：diversity_only 禁用所有经典检测器但不启用 useCognitiveGovernance，
  //         导致静默降级为无治理（学术诚信风险）。
  // 修复后：diversity_only 启用 useCognitiveGovernance，认知检测器全开（6 个），
  //         但通过 govConfig 明确意图——这是当前架构下的最小修复。
  //         完整修复需要新增 enableEvidenceImbalanceDetection 开关（架构性改动，推迟）。
  const useCognitiveGovernance = config.governanceMode === "cognitive" || config.governanceMode === "diversity_only";
  const govMode: "none" | "detect-only" | "full" =
    config.governanceMode === "diversity_only" || config.governanceMode === "cognitive"
      ? "full"
      : (config.governanceMode as "none" | "detect-only" | "full");

  // 治理配置：diversity_only 禁用旧检测器（保留认知检测器）；cognitive 使用默认全检测器
  const govConfig = config.governanceMode === "diversity_only"
    ? {
        enableEchoChamberDetection: false,
        enableAuthorityBiasDetection: false,
        enablePolarizationDetection: false,
        enablePrematureConsensusDetection: false,
      }
    : undefined;

  if (config.governanceMode === "diversity_only") {
    console.warn(
      `[Runner] diversity_only 模式：已启用 useCognitiveGovernance，将运行 6 个认知检测器（含 evidence imbalance + cognitive action mismatch）。` +
      `注意：完整 diversity_only 语义需新增 enableEvidenceImbalanceDetection 开关。`
    );
  }

  let engine: NativeCognitiveEngine | DiscussionEngine;
  if (useNativeCognitive) {
    const nativeEngine = new NativeCognitiveEngine({
      maxRounds: config.maxRounds,
      governanceMode: govMode,
      seed: effectiveSeed,
      terminationPolicy: config.terminationPolicy ?? "fixed_rounds",
      useCognitiveGovernance,
      // v6 Phase 2.8: 传递 useSemanticTool 开关，C 组启用异步路径（Tier 1→2→3 含 SemanticTool）
      useSemanticTool: config.useSemanticTool ?? false,
      governanceConfig: govConfig,
      // E10: 传递共享证据池配置（enabled 时注入结构化事实，零 LLM 调用）
      evidencePool: config.evidencePool,
    });
    // v6 Phase 2.8: useSemanticTool=true 时注入 LLM 配置，供 SemanticTool 异步路径调用
    if (config.useSemanticTool) {
      nativeEngine.setLlmConfig(llmConfig);
    }
    engine = nativeEngine;
  } else {
    engine = new DiscussionEngine({
      maxRounds: config.maxRounds,
      governanceMode: govMode,
      seed: effectiveSeed,
      terminationPolicy: config.terminationPolicy ?? "surface",
      useCognitiveState: useCognitive,
      governanceConfig: govConfig,
    });
  }

  // 设置 agent knowledge 用于 governance 信息层干预
  if (knowledge.size > 0) {
    engine.setAgentKnowledge(knowledge);
  }

  // Phase D: static devil's advocate (HiddenBench §6.4) — 每轮强制注入
  if (config.staticDevilsAdvocate) {
    const devilsPrompt = `[治理干预 — static devil's advocate (HiddenBench §6.4)]
在分享你的分析之前，请先完成以下步骤：
1. 识别当前讨论中看起来最受欢迎的选项
2. 找出至少一个反驳该选项的理由（基于你掌握的独有信息）
3. 然后再给出你的完整分析
这有助于防止过早共识和群体思维。`;
    for (const agent of agents) {
      engine.addGovernancePrompt(agent.id, devilsPrompt);
    }
  }

  const candidateOptions = candidateCanonicals(bundle.promptTask);
  const task = {
    id: bundle.promptTask.schema.id,
    description: bundle.promptTask.schema.publicContext,
    type: "ranking",
    createdAt: new Date().toISOString(),
    content: buildDiscussionTaskContent(bundle.promptTask),
    canonicalOptions: candidateOptions,
    optionAliases: candidateAliases(bundle.promptTask),
  };

  const startTime = Date.now();
  const result = await engine.run(agents, task);
  const elapsed = Date.now() - startTime;

  // 提取排名和 τ
  const agentNames = candidateOptions;
  let finalRanking: string[] = [];
  let finalKendallTau = 0;
  let finalAccuracy = 0;
  let individualAccuracy = 0;
  const rankingMetricApplicable = config.scenario !== "hiddenbench";
  let optionParsing: RawRunData["optionParsing"] | undefined;

  if (result.roundResults.length > 0) {
    const lastRound = result.roundResults[result.roundResults.length - 1];
    const statusCounts: Record<string, number> = {};
    const unmatchedLabels = new Set<string>();
    for (const opinion of lastRound.opinions) {
      const status = opinion.optionParseStatus ?? "not_applicable";
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      for (const label of opinion.unmatchedOptionLabels ?? []) unmatchedLabels.add(label);
    }
    const validOpinions = statusCounts.valid ?? 0;
    optionParsing = {
      totalOpinions: lastRound.opinions.length,
      validOpinions,
      invalidRate: lastRound.opinions.length > 0
        ? 1 - validOpinions / lastRound.opinions.length
        : 1,
      statusCounts,
      unmatchedLabels: [...unmatchedLabels],
    };

    // 群体排名只接受所有 agent 均完整、唯一映射的输出；其余情况 fail closed。
    const allItemBeliefs = lastRound.opinions.flatMap(o => o.itemBeliefs || []);
    const allOpinionsValid = lastRound.opinions.length > 0
      && validOpinions === lastRound.opinions.length;
    if (allOpinionsValid && allItemBeliefs.length > 0 && agentNames.length > 0) {
      try {
        finalRanking = extractRanking("", agentNames, allItemBeliefs, candidateAliases(bundle.promptTask));
        const correctAnswer = bundle.scoringTask.groundTruth.value as Record<string, number>;
        if (correctAnswer) {
          if (rankingMetricApplicable) {
            finalKendallTau = kendallTau(correctAnswer, finalRanking);
          }
          // 单选准确率：finalRanking[0]（群体第一名）是否为 correctAnswer 中 rank=1 的方案
          // （HiddenBench 等单选任务用；与 HiddenBench 论文的准确率口径对齐）
          const correctItem = Object.entries(correctAnswer)
            .find(([, r]) => r === 1)?.[0];
          finalAccuracy = correctItem && finalRanking[0] === correctItem ? 1 : 0;
          // item 已在 observation 边界规范化，指标层只允许精确比较。
          individualAccuracy = correctItem ? (
            allItemBeliefs.filter(ib => ib.rank === 1 && ib.item === correctItem).length /
            Math.max(1, agents.filter(() => true).length)
          ) : 0;
        }
      } catch (error) {
        finalRanking = [];
        optionParsing.rankingError = error instanceof Error ? error.message : String(error);
      }
    } else if (optionParsing) {
      optionParsing.rankingError = "final opinions contain invalid, ambiguous, or incomplete option labels";
    }
  }

  // 提取信念轨迹
  const beliefTrajectory = result.roundResults.map((rr, idx) => ({
    round: idx + 1,
    beliefs: Object.fromEntries(
      rr.opinions.map(o => [o.agentId, o.belief])
    ),
    confidences: Object.fromEntries(
      rr.opinions.map(o => [o.agentId, o.confidence])
    ),
  }));

  // 提取 cognitive state 轨迹
  let cognitiveTrajectory: CognitiveStateSnapshot[] | undefined;
  if (useCognitive) {
    cognitiveTrajectory = [];
    for (let r = 1; r <= result.totalRounds; r++) {
      cognitiveTrajectory.push(...extractCognitiveSnapshots(engine, r));
    }
  }

  // Extract versioned cognitive macro trajectory (native_cognitive only).
  let thermoHistory: CognitiveMacroSnapshotV1[] | undefined;
  let governanceEstimateHistory: RawRunData["governanceEstimateHistory"] | undefined;
  let semanticAuditLog: RawRunData["semanticAuditLog"] | undefined;
  let terminationDecisions: RawRunData["terminationDecisions"] | undefined;
  if (useNativeCognitive) {
    const nativeEngine = engine as NativeCognitiveEngine;
    thermoHistory = nativeEngine.getThermoHistory();
    governanceEstimateHistory = [];
    const estimateHistory = nativeEngine.getGovernanceEstimateHistory() as Map<
      number,
      Map<string, GovernanceEstimate<ProgressiveEstimates>>
    >;
    for (const [round, records] of [...estimateHistory].sort(([left], [right]) => left - right)) {
      for (const [agentId, record] of [...records].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
        governanceEstimateHistory.push({ round, agentId, record });
      }
    }
    // v6: 提取 SemanticTool 审计日志（C 组实验论文分析用）
    semanticAuditLog = nativeEngine.getSemanticAuditLog();
    // v6 路径二：提取终止决策历史（F 进决策的 reason/stateType，论文分析用）
    const termHistory = nativeEngine.getTerminationHistory();
    if (termHistory.length > 0) {
      terminationDecisions = termHistory.map((snap, i) => ({
        round: snap.utteranceCount,  // sync 路径 utteranceCount 实际存的是 round
        shouldTerminate: i < termHistory.length - 1 ? false : (nativeEngine.getLastTerminationDecision()?.shouldTerminate ?? false),
        reason: i < termHistory.length - 1 ? "continue" : (nativeEngine.getLastTerminationDecision()?.reason ?? "continue"),
        stateType: "active",  // 历史快照不存 stateType，仅最后决策有
        message: `R=${snap.R.toFixed(3)}, T=${snap.T.toFixed(3)}, H=${snap.H.toFixed(3)}, F=${snap.F.toFixed(3)}`,
      }));
    }
  }

  // ROADMAP_V5: 计算 δ 一致性诊断（仅 native_cognitive 模式）
  let deltaDiagnosis: RawRunData["deltaDiagnosis"] | undefined;
  if (useNativeCognitive && thermoHistory) {
    deltaDiagnosis = [];
    const nativeEngine = engine as NativeCognitiveEngine;
    for (let r = 1; r <= result.totalRounds; r++) {
      const states = nativeEngine.getCognitiveStateHistory(r) as Map<string, AgentCognitiveState>;
      const thermo = thermoHistory.find(t => t.round === r);
      if (states.size > 0 && thermo) {
        const recorded = nativeEngine.getGovernanceEstimateHistory(r) as Map<
          string,
          GovernanceEstimate<ProgressiveEstimates>
        >;
        if (recorded.size !== states.size) {
          throw new Error(
            `Missing governance estimate provenance for round ${r}: expected ${states.size}, recorded ${recorded.size}`,
          );
        }
        const estimates = new Map(
          [...recorded].map(([agentId, record]) => [agentId, structuredClone(record.value)]),
        );
        const diagnosis = computeDeltaDiagnosis(Array.from(states.values()), thermo, estimates);
        deltaDiagnosis.push({ round: r, ...diagnosis });
      }
    }
  }

  // 提取干预记录和治理检测结果
  // v6: 保存完整 Intervention 信息（targetAgents, effect, parameters, applied），
  // 用于论文中干预效果分析和降级率统计
  const interventions: Array<{
    id: string;
    round: number;
    type: string;
    targetAgentId?: string;
    targetAgents?: string[];
    effect?: string;
    applied?: boolean;
    parameters?: Record<string, unknown>;
  }> = [];
  const governanceIssues: RawRunData["governanceIssues"] = [];
  for (const rd of engine.getRoundDataArray()) {
    if (rd.interventions) {
      for (const intv of rd.interventions as any[]) {
        interventions.push({
          id: `${runId}:intv:${rd.roundNumber}:${interventions.length}`,
          round: rd.roundNumber,
          type: intv.type || "unknown",
          targetAgentId: intv.targetAgentId,
          targetAgents: intv.targetAgents,
          effect: intv.effect,
          applied: intv.applied,
          parameters: intv.parameters,
        });
      }
    }
    if (rd.governanceIssues && rd.governanceIssues.length > 0) {
      for (const issue of rd.governanceIssues) {
        governanceIssues.push({
          id: `issue:${runId}:${rd.roundNumber}:${governanceIssues.length}`,
          round: rd.roundNumber,
          type: issue.type,
          severity: issue.severity,
          description: issue.description,
          agents: issue.agents,
          suggestedIntervention: issue.suggestedIntervention?.type,
        });
      }
    }
  }

  // WP2: intervention → application receipt chain (assignment → applied action → window).
  // Every run emits an explicit receipt; a run with no interventions records
  // an inapplicable no_action receipt instead of an ambiguous empty array.
  const applicationReceipts: InterventionApplicationReceipt[] = interventions.map((intv, idx) => {
    const noAction = intv.type === "none";
    const applied = intv.applied === true && !noAction;
    const plannedWindow = { startRound: intv.round + 1, endRound: intv.round + 1 };
    const observable = applied && plannedWindow.startRound <= result.totalRounds;
    return {
      id: `rcpt:${runId}:${intv.round}:${idx}`,
      assignmentId: treatmentAssignment.id,
      actionType: intv.type,
      interventionId: intv.id,
      status: applied ? "applied" : (noAction ? "inapplicable" : "failed"),
      appliedAtRound: applied ? intv.round : undefined,
      plannedWindow: applied ? plannedWindow : undefined,
      windowContractRef: applied
        ? { id: "swarmalpha.intervention.next-round", version: "1.0.0" }
        : undefined,
      effectiveWindow: observable ? plannedWindow : null,
      targetAgentIds: [...new Set(intv.targetAgents ?? (intv.targetAgentId ? [intv.targetAgentId] : []))],
      failureCode: applied || noAction
        ? undefined
        : (intv.applied === undefined ? "missing_application_status" : "intervention_not_applied"),
      sourceEventIds: governanceIssues
        .filter(issue => issue.round === intv.round && issue.id)
        .map(issue => issue.id as string),
    };
  });
  if (applicationReceipts.length === 0) {
    applicationReceipts.push({
      id: `rcpt:${runId}:no-action`,
      assignmentId: treatmentAssignment.id,
      actionType: "no_action",
      status: "inapplicable",
      effectiveWindow: null,
      targetAgentIds: [],
      sourceEventIds: governanceIssues.filter(issue => issue.id).map(issue => issue.id as string),
    });
  }

  const proximalOutcomes: ProximalOutcomeRecord[] = applicationReceipts
    .filter(receipt => receipt.status === "applied" && receipt.plannedWindow)
    .map(receipt => {
      const planned = receipt.plannedWindow!;
      const observed = receipt.effectiveWindow
        ? beliefTrajectory.find(snapshot => snapshot.round === receipt.effectiveWindow!.endRound)
        : undefined;
      const confidences = observed ? Object.values(observed.confidences).filter(Number.isFinite) : [];
      const beliefs = observed ? Object.values(observed.beliefs).filter(Number.isFinite) : [];
      const missingMetrics = [
        ...(confidences.length === 0 ? ["meanConfidence"] : []),
        ...(beliefs.length === 0 ? ["beliefSpread"] : []),
      ];
      return {
        id: `prox:${receipt.id}`,
        applicationReceiptId: receipt.id,
        window: planned,
        metricContractRefs: [{
          id: PROXIMAL_BELIEF_SUMMARY_CONTRACT.id,
          version: PROXIMAL_BELIEF_SUMMARY_CONTRACT.version,
        }],
        values: {
          meanConfidence: confidences.length > 0
            ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
            : null,
          beliefSpread: beliefs.length > 0 ? Math.max(...beliefs) - Math.min(...beliefs) : null,
        },
        ...(!observed || missingMetrics.length > 0
          ? { missingnessReason: observed ? `no_finite_values:${missingMetrics.join(",")}` : "planned_window_not_observed" }
          : {}),
      };
    });

  // ROADMAP_V5: 提取 itemBeliefs 轨迹（K 维偏好向量，Hidden Anchors 锚点恢复核心数据）
  const itemBeliefsTrajectory: RawRunData["itemBeliefsTrajectory"] = [];
  const roundOpinions: RawRunData["roundOpinions"] = [];
  for (const rd of engine.getRoundDataArray()) {
    const roundNum = rd.roundNumber;
    const roundOpinionEntries: NonNullable<RawRunData["roundOpinions"]>[number] =
      { round: roundNum, opinions: [] };

    for (const op of rd.opinions) {
      // itemBeliefs 轨迹
      if (op.itemBeliefs && op.itemBeliefs.length > 0) {
        itemBeliefsTrajectory.push({
          round: roundNum,
          agentId: op.agentId,
          agentName: (op as any).agentName || op.agentId,
          itemBeliefs: op.itemBeliefs.map(ib => ({
            item: ib.item,
            rank: ib.rank,
            belief: ib.belief,
            confidence: ib.confidence,
          })),
        });
      }

      // 完整 opinion（含 reasoning、evidence、referencedAgents）
      roundOpinionEntries.opinions.push({
        agentId: op.agentId,
        agentName: (op as any).agentName || op.agentId,
        itemBeliefs: (op.itemBeliefs || []).map(ib => ({
          item: ib.item,
          rank: ib.rank,
          belief: ib.belief,
          confidence: ib.confidence,
        })),
        reasoning: op.reasoning,
        evidence: op.evidence,
        referencedAgents: op.referencedAgents,
        spoke: true,
      });
    }

    roundOpinions.push(roundOpinionEntries as any);
  }

  const tokenUsage = collectTokenUsage(agents);
  const taskScored = finalRanking.length > 0 && optionParsing?.rankingError === undefined;

  // WP2: task outcome — the final link of the assignment → application →
  // outcome chain. quality uses the ranking metric when applicable, else the
  // single-choice accuracy; a non-applicable task reports unresolved, not 0.
  const taskOutcome: TaskOutcomeRecord = {
    runAssignmentId: treatmentAssignment.id,
    evaluationContractRef: { id: "swarmalpha.categorical.ranking", version: "1.0.0" },
    quality: taskScored ? finalAccuracy : null,
    cost: {
      promptTokens: tokenUsage.promptTokens,
      completionTokens: tokenUsage.completionTokens,
      totalTokens: tokenUsage.totalTokens,
      totalLatencyMs: tokenUsage.totalLatencyMs,
    },
    status: taskScored ? "scored" : "invalid",
  };

  const rawData: RawRunData = {
    runId,
    experimentId: config.id,
    runtimeMode,
    seed,
    runIndex,
    rawSchemaVersion: RAW_SCHEMA_VERSION,
    ...(governanceStudy !== undefined ? { governanceStudy: structuredClone(governanceStudy) } : {}),
    timestamp: new Date().toISOString(),
    scenario: config.scenario,
    agentCount: config.agentCount,
    maxRounds: config.maxRounds,
    totalRounds: result.totalRounds,
    converged: result.converged,
    finalRanking,
    finalKendallTau,
    rankingMetricApplicable,
    finalAccuracy,
    individualAccuracy,
    optionParsing,
    beliefTrajectory,
    cognitiveTrajectory,
    governanceEstimateHistory,
    thermoHistory,
    terminationDecisions,
    deltaDiagnosis,
    interventions,
    governanceIssues,
    treatmentAssignment,
    assignmentManifest: {
      path: path.basename(persistedAssignment.absolutePath),
      sha256: persistedAssignment.sha256,
      reused: persistedAssignment.reused,
      assignmentId: treatmentAssignment.id,
    },
    applicationReceipts,
    proximalOutcomes,
    taskOutcome,
    tokenUsage,
    itemBeliefsTrajectory,
    roundOpinions,
    semanticAuditLog,
  };

  // 保存原始数据
  const outPath = path.join(outputDir, `${runId}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(rawData, null, 2));

  console.log(`  [${new Date().toISOString()}] Completed ${runId} in ${(elapsed / 1000).toFixed(1)}s (τ=${finalKendallTau.toFixed(3)}, acc=${finalAccuracy})`);
  return rawData;
}

// ============================================================================
// Batch Runner
// ============================================================================

/** 运行一个实验配置的所有运行 */
export async function runExperiment(
  config: ExperimentConfig,
  outputDir: string,
  options?: { resume?: boolean; verbose?: boolean },
): Promise<RawRunData[]> {
  const allData: RawRunData[] = [];
  const experimentOutDir = path.join(outputDir, config.id, "raw");
  fs.mkdirSync(experimentOutDir, { recursive: true });

  for (const mode of config.runtimeModes) {
    const modeLabel = mode === "cognitive" ? "Cognitive" : (mode === "native_cognitive" ? "Native Cognitive" : "Belief");
    console.log(`\n=== ${config.id} [${modeLabel} Runtime] ===`);

    for (const seed of config.seeds) {
      for (let i = 0; i < config.runsPerSeed; i++) {
        const runId = `${config.id}_${mode}_seed${seed}_run${i}`;
        const outPath = path.join(experimentOutDir, `${runId}.json`);
        const errPath = path.join(experimentOutDir, `${runId}.error.json`);

        // 断点续传：校验文件内容有效性
        if (options?.resume && fs.existsSync(outPath)) {
          let valid = false;
          try {
            const existing = safeJsonParse<RawRunData>(fs.readFileSync(outPath, "utf-8"));
            // 有效 RawRunData 必须有 experimentId 且无 error 字段
            const persisted = existing ? readRunAssignmentManifest(experimentOutDir, runId) : null;
            const lifecycle = existing ? verifyRawRunData(outPath, existing) : null;
            if (existing
              && existing.experimentId
              && !(existing as any).error
              && existing.rawSchemaVersion === RAW_SCHEMA_VERSION
              && lifecycle?.runIssues.length === 0
              && persisted
              && existing.assignmentManifest?.sha256 === persisted.sha256
              && existing.assignmentManifest.path === path.basename(persisted.absolutePath)
              && JSON.stringify(existing.treatmentAssignment) === JSON.stringify(persisted.manifest.assignment)
              && JSON.stringify(persisted.manifest.budgetContract ?? null)
                === JSON.stringify({ maxRounds: config.maxRounds })) {
              allData.push(existing);
              valid = true;
              if (options.verbose) console.log(`  Skipping ${runId} (valid)`);
            }
          } catch {
            // 文件损坏（JSON 解析失败）
          }
          if (!valid) {
            if (options.verbose) console.log(`  Re-running ${runId} (existing file invalid/corrupt)`);
            try { fs.unlinkSync(outPath); } catch { /* ignore */ }
          } else {
            continue;
          }
        }

        // 清理旧的 .error.json 文件
        if (fs.existsSync(errPath)) {
          try { fs.unlinkSync(errPath); } catch { /* ignore */ }
        }

        try {
          const data = await runSingle(config, mode, seed, i, experimentOutDir);
          allData.push(data);
        } catch (err) {
          console.error(`  ERROR in ${runId}:`, err);
          const failedAssignment = readRunAssignmentManifest(experimentOutDir, runId);
          // 错误 run 写入 .error.json 后缀，避免污染成功文件路径导致 --resume 跳过
          fs.writeFileSync(errPath, JSON.stringify({
            runId,
            error: String(err),
            timestamp: new Date().toISOString(),
            treatmentAssignment: failedAssignment?.manifest.assignment,
            assignmentManifest: failedAssignment ? {
              path: path.basename(failedAssignment.absolutePath),
              sha256: failedAssignment.sha256,
              reused: failedAssignment.reused,
              assignmentId: failedAssignment.manifest.assignment.id,
            } : undefined,
          }, null, 2));
        }
      }
    }
  }

  // 保存汇总
  const summaryPath = path.join(outputDir, config.id, "raw_summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify({
    experimentId: config.id,
    totalRuns: allData.length,
    byMode: {
      belief: allData.filter(d => d.runtimeMode === "belief").length,
      cognitive: allData.filter(d => d.runtimeMode === "cognitive").length,
      native_cognitive: allData.filter(d => d.runtimeMode === "native_cognitive").length,
    },
    timestamp: new Date().toISOString(),
  }, null, 2));

  return allData;
}

// ============================================================================
// Load existing data
// ============================================================================

/** 从磁盘加载已有的实验数据 */
export function loadExperimentData(
  experimentId: string,
  outputDir: string,
): RawRunData[] {
  const rawDir = path.join(outputDir, experimentId, "raw");
  if (!fs.existsSync(rawDir)) return [];

  const files = fs.readdirSync(rawDir).filter(f => f.endsWith(".json") && f !== "raw_summary.json");
  // 排序：标准命名文件（<exp_id>_<mode>_seed<X>_run<Y>.json）排在前面，
  // 确保去重时保留标准版而非旧版残留（如 _phase31 后缀文件）。
  // 这些 _phase31 文件是 Phase 3.1 阶段的旧输出，与当前数据结构可能不一致，
  // 且与标准文件共享同一 runId，会导致重复数据污染 metrics 计算。
  files.sort((a, b) => {
    const aIsStandard = /^.+_seed\d+_run\d+\.json$/.test(a);
    const bIsStandard = /^.+_seed\d+_run\d+\.json$/.test(b);
    if (aIsStandard && !bIsStandard) return -1;
    if (!aIsStandard && bIsStandard) return 1;
    return a.localeCompare(b);
  });

  const data: RawRunData[] = [];
  const seenRunIds = new Set<string>();

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(rawDir, file), "utf-8");
      const parsed = safeJsonParse<any>(content);
      if (!parsed) { console.warn(`[Runner] 无法解析 JSON: ${file}`); continue; }
      if (parsed.runId && !parsed.error) {
        // 去重：同一 runId 的多个文件（如 _phase31.json 旧版残留）只保留第一个
        if (seenRunIds.has(parsed.runId)) {
          console.warn(`[Runner] 跳过重复 runId=${parsed.runId} 的文件: ${file}`);
          continue;
        }
        seenRunIds.add(parsed.runId);
        data.push(parsed as RawRunData);
      }
    } catch {
      // skip corrupted files
    }
  }

  return data;
}
