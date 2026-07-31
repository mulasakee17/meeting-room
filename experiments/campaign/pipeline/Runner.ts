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
import type { ExperimentConfig, RawRunData, CognitiveStateSnapshot, RuntimeMode } from "../types";
import {
  extractRanking,
  kendallTau,
  mulberry32,
} from "../../v2/statsShared";
import {
  computeSusceptibility,
  cognitiveStateToBelief,
  cognitiveStateToConfidence,
  stanceFromItemBeliefs,
  type AgentCognitiveState,
} from "../../../src/lib/agent/cognitiveState";
import { computeDeltaDiagnosis } from "../../../src/lib/thermodynamics/computeDelta";
import { estimateAll } from "../../../src/lib/thermodynamics/ProgressiveEstimator";
import { safeJsonParse } from "../../../src/lib/utils/jsonUtils";

// ============================================================================
// Scenario Loading
// ============================================================================

/** 加载场景配置 */
function loadScenario(scenarioId: string): { task: any; dataDir: string } {
  switch (scenarioId) {
    case "ma": {
      const { TASK_MA } = require("../../lunar_survival/config");
      return { task: TASK_MA, dataDir: "data" };
    }
    case "crisis": {
      const { TASK_CRISIS } = require("../../v2/task_crisis");
      return { task: TASK_CRISIS, dataDir: "data_crisis" };
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
    default:
      throw new Error(`Unknown scenario: ${scenarioId}`);
  }
}

// ============================================================================
// Agent Creation
// ============================================================================

function createAgents(
  task: any,
  agentCount: number,
  llmConfig: LLMConfig,
  seed: number,
): { agents: DiscussionAgent[]; knowledge: Map<string, string[]> } {
  const rng = mulberry32(seed);
  const agents: DiscussionAgent[] = [];
  const knowledge = new Map<string, string[]>();

  // 为每个 agent 分配独有信息
  const agentNames = task.agents || [];
  const selected = agentNames.slice(0, agentCount);

  for (let i = 0; i < selected.length; i++) {
    const agentDef = selected[i];
    const name = agentDef.name || `Agent ${i + 1}`;
    const role = agentDef.role || "Analyst";
    const agentId = agentDef.id || `agent_${i}`;

    const initialBias = agentDef.initialBias;
    const initialBelief = typeof initialBias === "number" ? initialBias / 100 : (rng() * 0.6 - 0.3);
    const initialConfidence = 50 + rng() * 20;

    // 构建独有知识提示（不包含 sharedBriefing，避免与 buildPrompt 中 Task 重复）
    const customPrompt = agentDef.knownItems
      ? `你的独有专业知识（其他成员不知道）：\n${agentDef.knownItems}\n\n${agentDef.initialBias || ""}\n\n`
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
        + `    {"item": "方案A", "rank": 3, "belief": -0.5, "confidence": 85},\n`
        + `    {"item": "方案B", "rank": 1, "belief": 0.7, "confidence": 90},\n`
        + `    {"item": "方案C", "rank": 2, "belief": 0.1, "confidence": 65}\n`
        + `  ]\n`
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
    if (agentDef.knownItems) {
      const items = agentDef.knownItems
        .split(/[；;\n]/)
        .map((s: string) => s.replace(/^[•\-\s]+/, "").trim())
        .filter((s: string) => s.length > 10);
      knowledge.set(agentId, items);
    }
  }

  return { agents, knowledge };
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
    // v6: 优先使用 ProgressiveEstimator 渐进估计的 susceptibility（基于暴露事件），
    // 与 MeasurementLayer.buildDetectorInput 保持一致。
    // 仅在不可用（冷启动，暴露事件 < 2）时回退到旧公式 (1-I)(1-C)。
    const susc = state.susceptibility.usable
      ? state.susceptibility.estimate
      : computeSusceptibility(state.inertia, state.confidence);

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
      susceptibility: susc,
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
export async function runSingle(
  config: ExperimentConfig,
  runtimeMode: RuntimeMode,
  seed: number,
  runIndex: number,
  outputDir: string,
): Promise<RawRunData> {
  const runId = `${config.id}_${runtimeMode}_seed${seed}_run${runIndex}`;
  console.log(`  [${new Date().toISOString()}] Starting ${runId}...`);

  const scenario = loadScenario(config.scenario);
  const useCognitive = runtimeMode === "cognitive" || runtimeMode === "native_cognitive";
  const useNativeCognitive = runtimeMode === "native_cognitive";

  const llmConfig: LLMConfig = {
    provider: detectLLMProvider(config.llmModel),
    model: config.llmModel,
    temperature: config.temperature,
  };

  const { agents, knowledge } = createAgents(scenario.task, config.agentCount, llmConfig, seed);

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
      seed,
      useCognitiveGovernance,
      // v6 Phase 2.8: 传递 useSemanticTool 开关，C 组启用异步路径（Tier 1→2→3 含 SemanticTool）
      useSemanticTool: config.useSemanticTool ?? false,
      governanceConfig: govConfig,
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
      seed,
      useCognitiveState: useCognitive,
      governanceConfig: govConfig,
    });
  }

  // 设置 agent knowledge 用于 governance 信息层干预
  if (knowledge.size > 0) {
    engine.setAgentKnowledge(knowledge);
  }

  const task = {
    id: scenario.task.id,
    description: scenario.task.sharedBriefing || scenario.task.title,
    type: "ranking",
    createdAt: new Date().toISOString(),
    content: scenario.task.sharedBriefing || "",
  };

  const startTime = Date.now();
  const result = await engine.run(agents, task);
  const elapsed = Date.now() - startTime;

  // 提取排名和 τ
  const agentNames = scenario.task.correctAnswer
    ? Object.keys(scenario.task.correctAnswer)
    : [];
  let finalRanking: string[] = [];
  let finalKendallTau = 0;

  if (result.roundResults.length > 0) {
    const lastRound = result.roundResults[result.roundResults.length - 1];
    // 从最后一个 agent 的 opinion 提取 itemBeliefs
    const allItemBeliefs = lastRound.opinions.flatMap(o => o.itemBeliefs || []);
    if (allItemBeliefs.length > 0 && agentNames.length > 0) {
      try {
        finalRanking = extractRanking("", agentNames, allItemBeliefs);
        if (scenario.task.correctAnswer) {
          finalKendallTau = kendallTau(scenario.task.correctAnswer, finalRanking);
        }
      } catch {
        finalRanking = agentNames;
      }
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

  // 提取热力学轨迹（RTHF，仅 native_cognitive 模式）
  let thermoHistory: RawRunData["thermoHistory"] | undefined;
  let semanticAuditLog: RawRunData["semanticAuditLog"] | undefined;
  if (useNativeCognitive) {
    const nativeEngine = engine as NativeCognitiveEngine;
    thermoHistory = nativeEngine.getThermoHistory();
    // v6: 提取 SemanticTool 审计日志（C 组实验论文分析用）
    semanticAuditLog = nativeEngine.getSemanticAuditLog();
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
        const estimates = estimateAll(states, r);
        const diagnosis = computeDeltaDiagnosis(Array.from(states.values()), thermo, estimates);
        deltaDiagnosis.push({ round: r, ...diagnosis });
      }
    }
  }

  // 提取干预记录和治理检测结果
  // v6: 保存完整 Intervention 信息（targetAgents, effect, parameters, applied），
  // 用于论文中干预效果分析和降级率统计
  const interventions: Array<{
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

  const rawData: RawRunData = {
    runId,
    experimentId: config.id,
    runtimeMode,
    seed,
    runIndex,
    timestamp: new Date().toISOString(),
    scenario: config.scenario,
    agentCount: config.agentCount,
    maxRounds: config.maxRounds,
    totalRounds: result.totalRounds,
    converged: result.converged,
    finalRanking,
    finalKendallTau,
    beliefTrajectory,
    cognitiveTrajectory,
    thermoHistory,
    deltaDiagnosis,
    interventions,
    governanceIssues,
    tokenUsage: collectTokenUsage(agents),
    itemBeliefsTrajectory,
    roundOpinions,
    semanticAuditLog,
  };

  // 保存原始数据
  const outPath = path.join(outputDir, `${runId}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(rawData, null, 2));

  console.log(`  [${new Date().toISOString()}] Completed ${runId} in ${(elapsed / 1000).toFixed(1)}s (τ=${finalKendallTau.toFixed(3)})`);
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
            if (existing && existing.experimentId && !(existing as any).error) {
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
          // 错误 run 写入 .error.json 后缀，避免污染成功文件路径导致 --resume 跳过
          fs.writeFileSync(errPath, JSON.stringify({
            runId, error: String(err), timestamp: new Date().toISOString(),
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