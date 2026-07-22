/**
 * 异步自适应实验运行器：A/B/C/D 四组对照
 *
 * A 组（同步固定基线）：同步全员发言，固定 5 轮，F 分解排序
 * B 组（异步固定）：异步概率发言，固定 5 轮，F 分解排序
 * C 组（异步自适应-热力学）：异步概率发言，热力学自适应终止，F 分解驱动干预
 * D 组（异步自适应-随机终止）：异步概率发言，随机终止，F 分解驱动干预
 *
 * 核心对比：
 * - A vs B：异步本身是否影响决策质量
 * - B vs C：热力学自适应终止是否优于固定轮次（核心假设）
 * - C vs D：热力学终止决策是否优于随机终止（验证诊断价值）
 *
 * 运行：
 *   npx tsx experiments/v2/run_async_ab.ts --group=A --count=10
 *   npx tsx experiments/v2/run_async_ab.ts --group=B --count=10
 *   npx tsx experiments/v2/run_async_ab.ts --group=C --count=10
 *   npx tsx experiments/v2/run_async_ab.ts --group=D --count=10
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });
import { CustomAgent } from "../../src/lib/adapters/custom";
import { DiscussionEngine } from "../../src/lib/discussion";
import { AsyncDiscussionEngine, type AsyncDiscussionConfig, type DependencyMap, type InfoKeywordsMap, type SpeakMode } from "../../src/lib/discussion/asyncEngine";
import type { TaskConfig } from "../lunar_survival/config";
import { TASK_FRAUD } from "./task_fraud";
import type { LLMConfig, LLMProvider } from "../../src/lib/llm/providers";
import { extractRanking, kendallTau } from "./statsShared";

// ============================================================================
// 类型定义
// ============================================================================

type Group = "A" | "B" | "C" | "D";

interface AgentTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalLatencyMs: number;
  callCount: number;
}

interface AsyncExperimentResult {
  runId: string;
  group: Group;
  runIndex: number;
  speakMode?: string;
  /** 代码版本标记（格式: YYYY-MM-DD，用于区分修复前后数据） */
  codeVersion: string;
  timestamp: string;
  kendallTau: number;
  decisionQuality: number;
  totalRounds: number;
  totalUtterances: number;
  converged: boolean;
  terminationReason: string;
  thermoHistory: Array<{ R: number; T: number; H: number; F: number; utteranceCount: number; evalIndex: number }>;
  finalBeliefs: Record<string, number>;
  /**
   * 治理干预 trace（B2 升级：与 run_malicious.ts 对齐）
   *
   * 历史问题：原 run_async_ab.ts 仅保存 thermoHistory + finalBeliefs，
   * 丢弃了 engine.roundDataArray（含 governanceIssues + interventions + beliefChanges），
   * 导致 A/B/C/D 组无法做治理过程分析。E 组（run_malicious.ts）已有此字段，
   * 但 C vs E 对比时 C 组缺失 trace，造成实验设计问题 1（三重混淆变量之一）。
   *
   * 现补全此字段，使未来重跑的 C' 组能与 E 组对等分析治理过程。
   *
   * 兼容性：旧 JSON（A/B/C/D 组）无此字段，分析脚本需做空值兜底。
   */
  governanceTrace?: Array<{
    roundNumber: number;
    timestamp: string;
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
      effect: string;
      applied: boolean;
      round?: number;
    }>;
    beliefChanges: Record<string, { old: number; new: number; reason: string }>;
    converged: boolean;
    /** Per-utterance 信念快照（质量因子验证，2026-07-21 新增） */
    perUtteranceSnapshots?: Array<{
      speakerId: string;
      belief: number;
      confidence: number;
      referencedAgents: string[];
      beliefsBefore: Record<string, { belief: number; confidence: number }>;
      beliefsAfter: Record<string, { belief: number; confidence: number }>;
    }>;
  }>;
  /**
   * 每轮 opinions（B2 升级：与 run_malicious.ts 对齐）
   *
   * 保存精简版 roundResults，含 itemBeliefs，支持 per-item 攻击目标核实。
   * 详见 run_malicious.ts 中 roundResults 字段注释。
   */
  roundResults?: Array<{
    roundNumber: number;
    timestamp: string;
    converged: boolean;
    opinions: Array<{
      agentId: string;
      belief: number;
      confidence: number;
      referencedAgents: string[];
      evidence: string[];
      itemBeliefs?: Array<{ item: string; rank: number; belief: number; confidence: number }>;
    }>;
  }>;
  /** Token 使用统计（H-Fix: 与 run.ts 一致，支持异步实验成本分析） */
  tokenUsage?: {
    byAgent: Record<string, AgentTokenUsage>;
    total: { promptTokens: number; completionTokens: number; totalTokens: number; totalLatencyMs: number };
  };
}

// ============================================================================
// CLI 参数解析
// ============================================================================

function parseCliArgs(): { group: Group; count: number; start: number; speakMode: SpeakMode; provider: LLMProvider; model: string; codeVersion: string } {
  const args = process.argv.slice(2);
  let group: Group = "C";
  let count = 10;
  let start = 0;
  let speakMode: SpeakMode = "content_driven";
  let provider: LLMProvider = "deepseek";
  let model = "deepseek-chat";
  let codeVersion = "2026-07-19"; // 默认保持原版本（不覆盖旧数据）
  for (const arg of args) {
    if (arg.startsWith("--group=")) group = arg.split("=")[1] as Group;
    if (arg.startsWith("--count=")) count = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--start=")) start = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--speakMode=")) speakMode = arg.split("=")[1] as SpeakMode;
    if (arg.startsWith("--provider=")) provider = arg.split("=")[1] as LLMProvider;
    if (arg.startsWith("--model=")) model = arg.split("=")[1];
    if (arg.startsWith("--codeVersion=")) codeVersion = arg.split("=")[1];
  }
  return { group, count, start, speakMode, provider, model, codeVersion };
}

// ============================================================================
// Agent 创建（复用 run.ts 逻辑）
// ============================================================================

function createAgents(task: TaskConfig, llmConfig: LLMConfig): CustomAgent[] {
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
      + `    {"item": "线索1-关联交易调查", "rank": 1, "belief": 0.8, "confidence": 85},\n`
      + `    {"item": "线索2-内幕交易追踪", "rank": 2, "belief": 0.5, "confidence": 70}\n`
      + `  ]\n`
      + `}\n`
      + `itemBeliefs中：rank为你认为的排名(1=最优先)，belief为对该选项的独立偏好(-1=强烈反对,0=中立,1=强烈支持)，confidence为置信度(0-100)`;
    return new CustomAgent(info.id, info.name, info.role, "default", llmConfig, systemPrompt);
  });
}

// ============================================================================
// 信息依赖图
// ============================================================================

function buildDependencyMap(): DependencyMap {
  const deps = new Map<string, string[]>();
  // A 的"营收异常"是触发信息
  deps.set("a2", ["营收", "异常", "背离"]); // B 依赖 A 的营收异常
  deps.set("a3", ["关联", "股权", "客户"]); // C 依赖 B 的关联发现
  return deps;
}

/**
 * 构建独有信息关键词映射（用于内容驱动发言意愿计算）
 *
 * 每个 agent 的独有信息关键词——当这些关键词在讨论历史中出现时，
 * 说明该 agent 的信息已被曝光，其发言意愿降低。
 */
function buildInfoKeywordsMap(): InfoKeywordsMap {
  const map = new Map<string, string[]>();
  map.set("a1", ["营收", "背离", "行业平均", "45%", "38%", "52%"]);  // 审计师：营收数据
  map.set("a2", ["关联", "客户", "股权", "62%", "300%"]);            // 供应链：关联交易
  map.set("a3", ["减持", "高管", "股票", "8.5%", "密集"]);           // 法务：减持记录
  map.set("a4", ["审计机构", "更换", "处罚", "失败"]);               // 媒体：审计造假
  map.set("a5", ["行业", "波动", "基准", "正常范围"]);               // 行业：校准信息
  return map;
}

// ============================================================================
// Ranking 提取和 τ 计算（已迁移到 ./statsShared，统一权威实现）
// ============================================================================

// ============================================================================
// D 组匹配分布采样：从 C 组实际终止发言数分布中采样
// ============================================================================

/**
 * 加载 C 组已完成实验的终止发言数列表
 *
 * 用于 D 组的匹配分布采样：D 组的随机终止点从 C 组的实际终止分布中抽取，
 * 而非固定范围。这确保 C/D 对比的唯一差异是"终止决策的质量"
 * （热力学 vs 随机），而非"讨论总量"。
 *
 * 关键：按 speakMode 过滤，确保 D_v1 从 C_v1 分布采样、D_v2 从 C_v2 分布采样，
 * 避免 v1/v2 混合导致匹配失真。
 *
 * 若 C 组数据不足，回退到 [9, 25] 默认范围并警告。
 */
function loadCTerminationUtterances(speakMode?: string, dataDir?: string): number[] {
  const DATA_DIR = dataDir || path.resolve(__dirname, "data_fraud");
  const utterances: number[] = [];
  if (!fs.existsSync(DATA_DIR)) return utterances;
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (f.startsWith("fraud_C_") && f.endsWith(".json")) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
        // 排除错误运行的实验
        if (!data.terminationReason?.startsWith("error") && typeof data.totalUtterances === "number") {
          // 按 speakMode 过滤：只读取与 D 组相同 speakMode 的 C 组数据
          // 旧数据可能没有 speakMode 字段，视为 v2（content_driven）
          const cSpeakMode = data.speakMode || "content_driven";
          if (speakMode && cSpeakMode !== speakMode) continue;
          utterances.push(data.totalUtterances);
        }
      } catch { /* skip */ }
    }
  }
  return utterances;
}

/**
 * 为 D 组采样一个终止发言数
 *
 * 设计：从 C 组的实际终止分布中有放回均匀采样（按 speakMode 匹配）。
 * 使用与实验相同的 PRNG (mulberry32) 保证可复现。
 */
function sampleDTerminationPoint(runIndex: number, speakMode?: string, fallbackRange: [number, number] = [9, 25], dataDir?: string): { point: number; source: "matched" | "fallback"; cDistribution?: number[] } {
  const cUtts = loadCTerminationUtterances(speakMode, dataDir);
  if (cUtts.length >= 5) {
    // 有足够 C 组数据，从其分布中采样
    // 使用确定性 PRNG 保证同一 runIndex 下 D 组终止点可复现
    const seed = 42 + runIndex;
    let a = seed >>> 0;
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const rand = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    const idx = Math.floor(rand * cUtts.length);
    return { point: cUtts[idx], source: "matched", cDistribution: cUtts };
  }
  // C 组数据不足，回退到默认范围
  const [min, max] = fallbackRange;
  const seed = 42 + runIndex;
  let a = seed >>> 0;
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const rand = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { point: min + Math.floor(rand * (max - min + 1)), source: "fallback" };
}

// ============================================================================
// 实验运行
// ============================================================================

async function runExperiment(
  group: Group,
  runIndex: number,
  task: TaskConfig,
  llmConfig: LLMConfig,
  speakMode: SpeakMode,
  codeVersion: string = "2026-07-19",
  dataDir?: string
): Promise<AsyncExperimentResult> {
  const agents = createAgents(task, llmConfig);
  const itemNames = Object.keys(task.correctAnswer);
  const deps = buildDependencyMap();
  const infoKeywords = buildInfoKeywordsMap();
  const seed = 42 + runIndex;

  let result: AsyncExperimentResult;

  if (group === "A") {
    // A 组：同步固定基线，使用 DiscussionEngine（speakMode 不影响同步组）
    const engine = new DiscussionEngine({
      maxRounds: 5,
      convergenceThreshold: 0.06,
      governanceMode: "full",
      seed,
      governanceConfig: { sortingMode: "fdecomposition" },
    });

    const discResult = await engine.run(agents as never, {
      id: task.id, description: task.title, type: "ranking",
      createdAt: new Date().toISOString(),
      content: task.sharedBriefing,
    });

    const allReasoning = discResult.roundResults
      .flatMap(r => r.opinions.map(o => o.reasoning)).join("\n");
    const allItemBeliefs = discResult.roundResults
      .flatMap(r => r.opinions).flatMap(o => o.itemBeliefs || []);
    const extractedRanking = extractRanking(allReasoning, itemNames, allItemBeliefs);
    const tau = kendallTau(task.correctAnswer, extractedRanking);

    result = {
      runId: `fraud_A_${runIndex}`,
      group, runIndex,
      codeVersion,
      timestamp: new Date().toISOString(),
      kendallTau: tau,
      decisionQuality: Math.round(((tau + 1) / 2) * 100),
      totalRounds: discResult.totalRounds,
      totalUtterances: discResult.roundResults.reduce((sum, r) => sum + r.opinions.length, 0),
      converged: discResult.converged,
      terminationReason: `fixed_5_rounds`,
      thermoHistory: [],
      finalBeliefs: discResult.finalBeliefs,
      // A 组同步路径不跑治理（fixed 5 rounds），trace 与 roundResults 仍保存以保持接口一致
      // 2026-07-22 新增：保存 reasoning 字段以支持对话原文回溯
      governanceTrace: [],
      roundResults: discResult.roundResults.map(r => ({
        roundNumber: r.roundNumber,
        timestamp: r.timestamp,
        converged: r.converged,
        opinions: r.opinions.map(o => ({
          agentId: o.agentId,
          belief: o.belief,
          confidence: o.confidence,
          reasoning: o.reasoning,
          referencedAgents: o.referencedAgents || [],
          evidence: o.evidence || [],
          itemBeliefs: o.itemBeliefs,
        })),
      })),
    };
  } else {
    // B/C/D 组：使用 AsyncDiscussionEngine
    const asyncConfig: Partial<AsyncDiscussionConfig> = {
      evalEveryKUtterances: 2,  // K=2（2026-07-19 修复：与 DEFAULT_ASYNC_CONFIG 一致）
      maxSpeakersPerEval: 5,
      speakMode, // v2=content_driven, v1=random_prob
    };

    if (group === "B") {
      asyncConfig.terminationMode = "fixed_rounds";
      asyncConfig.fixedRounds = 5;
    } else if (group === "C") {
      asyncConfig.terminationMode = "adaptive";
    } else {
      // D 组：随机终止，但从 C 组实际终止分布中采样（匹配分布设计，按 speakMode 过滤）
      // 这确保 C/D 对比的唯一差异是终止决策质量，而非讨论总量
      const { point, source, cDistribution } = sampleDTerminationPoint(runIndex, speakMode, [9, 25], dataDir);
      asyncConfig.terminationMode = "random_terminate";
      asyncConfig.randomTerminateRange = [point, point]; // 固定为采样点
      if (source === "matched") {
        console.log(`    D组匹配采样: 终止点=${point} (来自C组分布 n=${cDistribution!.length})`);
      } else {
        console.log(`    ⚠️ D组回退采样: 终止点=${point} (C组数据不足，使用默认[9,25])`);
      }
    }

    const engine = new AsyncDiscussionEngine({
      maxRounds: 30, // 异步模式实际由终止逻辑控制
      convergenceThreshold: 0.06,
      governanceMode: "full",
      seed,
      governanceConfig: { sortingMode: "fdecomposition" },
    }, asyncConfig);

    const asyncResult = await engine.runAsync(
      agents as never,
      {
        id: task.id, description: task.title, type: "ranking",
        createdAt: new Date().toISOString(),
        content: task.sharedBriefing,
      },
      deps,
      infoKeywords // 传入独有信息关键词映射
    );

    const allReasoning = asyncResult.roundResults
      .flatMap(r => r.opinions.map(o => o.reasoning)).join("\n");
    const allItemBeliefs = asyncResult.roundResults
      .flatMap(r => r.opinions).flatMap(o => o.itemBeliefs || []);
    const extractedRanking = extractRanking(allReasoning, itemNames, allItemBeliefs);
    const tau = kendallTau(task.correctAnswer, extractedRanking);

    // B2 升级：提取 governanceTrace（与 run_malicious.ts 对齐）
    // 历史问题：原 async 路径仅存 thermoHistory + finalBeliefs，丢弃治理过程数据
    const engineWithTrace = engine as unknown as {
      roundDataArray: Array<{
        roundNumber: number;
        timestamp: string;
        governanceIssues: Array<{
          type: string; severity: string; description: string; agents?: string[];
        }>;
        interventions: Array<{
          type: string; targetAgentId?: string; targetAgents?: string[];
          effect: string; applied: boolean; round?: number;
        }>;
        beliefChanges: Record<string, { old: number; new: number; reason: string }>;
        converged: boolean;
      }>;
    };
    const governanceTrace = engineWithTrace.roundDataArray?.map(r => ({
      roundNumber: r.roundNumber,
      timestamp: r.timestamp,
      governanceIssues: r.governanceIssues || [],
      interventions: (r.interventions || []).map(i => ({
        type: i.type,
        targetAgentId: i.targetAgentId,
        targetAgents: i.targetAgents,
        effect: i.effect,
        applied: i.applied,
        round: i.round,
      })),
      beliefChanges: r.beliefChanges || {},
      converged: r.converged,
      perUtteranceSnapshots: (r as any).perUtteranceSnapshots || [],
    })) || [];

    // B2 升级：保存精简版 roundResults（含 itemBeliefs），与 run_malicious.ts 对齐
    // 2026-07-22 新增：保存 reasoning 字段以支持对话原文回溯
    const roundResults = asyncResult.roundResults.map(r => ({
      roundNumber: r.roundNumber,
      timestamp: r.timestamp,
      converged: r.converged,
      opinions: r.opinions.map(o => ({
        agentId: o.agentId,
        belief: o.belief,
        confidence: o.confidence,
        reasoning: o.reasoning,
        referencedAgents: o.referencedAgents || [],
        evidence: o.evidence || [],
        itemBeliefs: o.itemBeliefs,
      })),
    }));

    result = {
      runId: `fraud_${group}_${speakMode}_${runIndex}`,
      group, runIndex,
      speakMode, // v2=content_driven, v1=random_prob
      codeVersion,
      timestamp: new Date().toISOString(),
      kendallTau: tau,
      decisionQuality: Math.round(((tau + 1) / 2) * 100),
      totalRounds: asyncResult.totalRounds,
      totalUtterances: asyncResult.totalUtterances,
      converged: asyncResult.converged,
      terminationReason: asyncResult.terminationReason,
      thermoHistory: asyncResult.thermoHistory,
      finalBeliefs: asyncResult.finalBeliefs,
      governanceTrace,
      roundResults,
    };
  }

  // ── Collect token usage from agents（H-Fix: 与 run.ts 一致）─────────────
  // agents 是 CustomAgent[]，可直接调用 getUsageStats()（无需 cast）
  const tokenUsageByAgent: Record<string, AgentTokenUsage> = {};
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalLatencyMs = 0;

  for (const agent of agents) {
    if (agent.getUsageStats) {
      const stats = agent.getUsageStats();
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

  result.tokenUsage = {
    byAgent: tokenUsageByAgent,
    total: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      totalLatencyMs,
    },
  };

  return result;
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  const { group, count, start, speakMode, provider, model, codeVersion } = parseCliArgs();

  // 跨模型验证：非 deepseek 提供商使用独立数据目录
  // B3 升级：非默认 codeVersion 时使用独立目录，避免覆盖旧数据
  //   - 默认 "2026-07-19" → data_fraud/（保持原行为，保护现有 A/B/C/D 数据）
  //   - "2026-07-20-ctrace-v2" → data_fraud_ctrace/（C' 组，含 trace）
  //   - 其他自定义版本 → data_fraud_<version>/
  const providerSuffix = provider === "deepseek" ? "" : `_${provider}`;
  const versionSuffix = codeVersion === "2026-07-19" ? "" : `_${codeVersion.replace(/-/g, "").replace(/20260720/, "v")}`;
  const dataDirName = `data_fraud${providerSuffix}${versionSuffix}`;
  const DATA_DIR = path.resolve(__dirname, dataDirName);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  // 根据 provider 自动选择 API key
  const apiKeyMap: Record<string, string | undefined> = {
    deepseek: process.env.DEEPSEEK_API_KEY,
    zhipu: process.env.ZHIPU_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
  };
  const apiKey = apiKeyMap[provider];
  if (!apiKey) {
    const envVar = provider === "deepseek" ? "DEEPSEEK_API_KEY"
      : provider === "zhipu" ? "ZHIPU_API_KEY"
      : provider === "openai" ? "OPENAI_API_KEY"
      : "ANTHROPIC_API_KEY";
    console.error(`请设置 ${envVar} 环境变量`);
    process.exit(1);
  }

  const llmConfig: LLMConfig = {
    provider,
    model,
    apiKey,
    temperature: 0.2,
    timeout: 120_000,  // 120s，推理模型（glm-4.5-air）长 prompt 下需要更长超时
  };

  console.log("=".repeat(70));
  console.log("  SwarmAlpha 异步自适应实验 — 欺诈调查任务");
  console.log(`  组别: ${group}`);
  console.log(`  模型: ${provider}/${model}`);
  console.log(`  发言模式: ${speakMode}`);
  console.log(`  数据目录: ${dataDirName}/`);
  console.log(`  样本: n=${count} (runIndex ${start}..${start + count - 1})`);
  console.log("=".repeat(70));

  for (let i = start; i < start + count; i++) {
    // C/D 组文件名包含 speakMode，避免 v1/v2 数据互相覆盖
    const fileSuffix = (group === "C" || group === "D") ? `_${speakMode}` : "";
    const runId = `fraud_${group}_${fileSuffix ? speakMode + "_" : ""}${i}`;
    console.log(`\n[${i - start + 1}/${count}] ${runId} 开始...`);

    try {
      const result = await runExperiment(group, i, TASK_FRAUD, llmConfig, speakMode, codeVersion, DATA_DIR);
      const filepath = path.join(DATA_DIR, `${runId}.json`);
      fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
      console.log(`  τ=${result.kendallTau.toFixed(3)}, 发言=${result.totalUtterances}, 轮次=${result.totalRounds}, 终止=${result.terminationReason}`);
    } catch (err) {
      console.error(`  ❌ ${runId} 失败:`, err instanceof Error ? err.message : err);
      // 记录失败
      const errorResult: AsyncExperimentResult = {
        runId, group, runIndex: i,
        speakMode,
        codeVersion,
        timestamp: new Date().toISOString(),
        kendallTau: 0, decisionQuality: 50,
        totalRounds: 0, totalUtterances: 0,
        converged: false,
        terminationReason: `error: ${err instanceof Error ? err.message : String(err)}`,
        thermoHistory: [], finalBeliefs: {},
      };
      fs.writeFileSync(path.join(DATA_DIR, `${runId}.json`), JSON.stringify(errorResult, null, 2));
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log(`  ${group} 组完成: ${count} 个实验已保存到 ${DATA_DIR}`);
  console.log("=".repeat(70));
}

main().catch(console.error);
