/**
 * HiddenBench 参考协议引擎
 *
 * 复现 HiddenBench (arXiv:2505.11556, ICML 2026) 的实验协议：
 *   1. Pre-discussion 独立投票（每个 agent 只看自己的信息）
 *   2. 顺序 round-robin 自由文本讨论（1-2 句，非 JSON）
 *   3. Post-discussion 独立投票（看到完整讨论历史后）
 *
 * 评估：average rule（个体正确率）+ majority rule（多数投票正确率）
 *
 * 对照：我们的 SwarmAlpha 协议（同时发言 + 结构化 JSON + 认知状态 + δ 治理）
 * 用于回答："协议设计本身对决策质量的影响"——干净的协议因子实验。
 *
 * Prompt 模板对齐第三方 reference implementation（jonradoff/hiddenbench，
 * 非论文作者官方仓库；协议细节最终以 arXiv:2505.11556 论文正文/附录为准）的 prompts.py：
 *   https://github.com/jonradoff/hiddenbench/blob/main/src/hiddenbench/prompts.py
 */

import { callLLM, fetchWithTimeout, type LLMConfig, type LLMResponse, LLMError, LLMErrorType } from "../../../src/lib/llm/providers";
import { safeJsonParse } from "../../../src/lib/utils/jsonUtils";
import { mulberry32 } from "../../../src/lib/utils/statsUtils";
import {
  candidateCanonicals,
  type ExperimentTaskBundle,
  type PromptTask,
} from "../../../src/lib/experiment-contracts/contracts";

/**
 * Candidate labels are part of the task schema, not the answer key.
 * Since WP1, this resolver consumes only the candidate registry (searchKeys)
 * and never the truth: label completeness is validated in the task loader
 * (`experiments/campaign/tasks/legacyAdapter.ts`).
 */
export function resolveCandidateOptions(task: { searchKeys: Record<string, string[]> }): string[] {
  const options = Object.keys(task.searchKeys ?? {});
  if (options.length === 0) {
    throw new Error("Task candidate schema is empty: searchKeys must declare every option");
  }
  return options;
}

// ============================================================================
// Free-text LLM call (no json_object constraint)
// ============================================================================

/**
 * 多轮消息类型：system 在最前，之后 user/assistant 交替。
 * 对齐 HiddenBench 官方 agent.messages 累积机制（有状态对话）。
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 调用 LLM 返回自由文本（用于 HiddenBench 讨论阶段）。
 *
 * 与 callLLM 的区别：不设置 response_format: json_object，
 * 不解析 JSON——直接返回原始文本内容 + token 使用量。
 * 这是对齐 HiddenBench 官方协议的关键：讨论消息是 1-2 句自由文本，不是 JSON。
 *
 * 支持多轮消息历史（agent 状态保持）。若传入 messages，将作为完整对话上下文；
 * 否则按 (systemPrompt, userPrompt) 单轮调用。
 */
async function callLLMFreeText(
  systemPrompt: string,
  userPrompt: string,
  config: LLMConfig,
  messages?: ChatMessage[],
): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const provider = config.provider || "deepseek";
  const model = config.model || "deepseek-chat";
  const temperature = config.temperature ?? 0.7;
  const timeout = config.timeout || 120000;

  // 组装 messages：若提供了完整历史则直接用；否则按单轮 system+user
  const chatMessages = messages && messages.length > 0
    ? messages
    : [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];

  if (provider === "deepseek") {
    const apiKey = config.apiKey || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

    const response = await fetchWithTimeout(
      "https://api.deepseek.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: chatMessages,
          // 关键差异：不设置 response_format → DeepSeek 返回自然文本
          temperature,
          ...(config.seed !== undefined ? { seed: config.seed } : {}),
        }),
      },
      timeout,
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`DeepSeek API error [${response.status}]: ${errorBody}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    return {
      content,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens ?? 0,
        completionTokens: data.usage.completion_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? 0,
      } : undefined,
    };
  }

  // 其他提供商：使用 callLLM 但提取 rawContent。
  // 注意：callLLM 目前只支持单轮 system+user，不支持多轮历史。
  // 多轮场景下退化为单轮（把最后一条 user 消息作为 prompt，历史拼在场景 prompt 内）。
  const finalUserPrompt = chatMessages.length > 0
    ? chatMessages[chatMessages.length - 1].content
    : userPrompt;
  const result = await callLLM(systemPrompt, finalUserPrompt, config);
  return {
    content: result.rawContent,
    usage: result.usage,
  };
}

/** Score a completed transcript after the prompt-side protocol has ended. */
export function scoreHiddenBenchTranscript(
  transcript: HiddenBenchProtocolTranscript,
  scoringTask: ExperimentTaskBundle["scoringTask"],
): HiddenBenchProtocolResult {
  const truthRanks = scoringTask.groundTruth.value as Record<string, number>;
  const correct = Object.entries(truthRanks).filter(([, rank]) => rank === 1);
  if (correct.length !== 1) {
    throw new Error("HiddenBench categorical truth must contain exactly one rank-1 answer");
  }
  const correctAnswer = correct[0][0];
  const preVotes = transcript.preVotes.map(vote => ({ ...vote, isCorrect: vote.vote === correctAnswer }));
  const postVotes = transcript.postVotes.map(vote => ({ ...vote, isCorrect: vote.vote === correctAnswer }));
  const agentCount = postVotes.length;
  if (agentCount === 0 || preVotes.length !== agentCount) {
    throw new Error("HiddenBench transcript must contain equal non-empty pre/post vote sets");
  }
  const preCorrect = preVotes.filter(v => v.isCorrect).length;
  const postCorrect = postVotes.filter(v => v.isCorrect).length;
  const preAccuracy = preCorrect / agentCount;
  const postAccuracy = postCorrect / agentCount;
  return {
    ...transcript,
    preVotes,
    postVotes,
    preAccuracy,
    postAccuracy,
    preMajorityCorrect: preCorrect > agentCount / 2,
    postMajorityCorrect: postCorrect > agentCount / 2,
    collectiveGain: postAccuracy - preAccuracy,
  };
}

// ============================================================================
// Prompt Templates — exact wording from HiddenBench prompts.py
// ============================================================================

/** HiddenBench 系统提示——不透露信息不对称。 */
const HB_SYSTEM_PROMPT = `You are participating in a group decision-making task. You have received some information about a scenario and need to make a decision.

IMPORTANT: The order of the facts you receive is randomly shuffled. The order does not indicate importance or relationship between facts. Please reason carefully about all the information.

You will need to:
1. Carefully consider all the information provided to you
2. Share your thoughts concisely with the group (one or two sentences)
3. Listen to what others share
4. Make a final decision

When making your decision, provide your response in JSON format:
{
  "vote": "<your chosen option>",
  "rationale": "<brief explanation of your reasoning>"
}`;

/** 场景信息展示 prompt。对齐 SCENARIO_PROMPT。 */
function buildScenarioPrompt(
  description: string,
  infoLines: string[],
  options: string[],
): string {
  const info = infoLines.map((l, i) => `${i + 1}. ${l}`).join("\n");
  const optionList = options.map(o => `- ${o}`).join("\n");
  return `## Scenario
${description}

## Your Information
${info}

## Available Options
${optionList}

Please consider this information carefully before the group discussion begins.`;
}

/** 讨论阶段——第一个发言者。对齐 FIRST_SPEAKER_PROMPT。 */
const HB_FIRST_SPEAKER_PROMPT = `You are the first to speak.

Based on the information you have, share your initial thoughts with the group in one or two sentences. Focus on the key facts that seem most relevant to making a decision.

Respond with just your discussion message (not in JSON format yet - the final vote will come after the discussion).`;

/** 讨论阶段——后续发言者。对齐 SUBSEQUENT_SPEAKER_PROMPT。 */
function buildSubsequentSpeakerPrompt(
  agentLabel: string,
  messages: Array<{ agentLabel: string; content: string }>,
): string {
  const history = messages
    .map(m => `**${m.agentLabel}**: ${m.content}`)
    .join("\n\n");
  return `Previous messages from the group discussion:

${history}

It's your turn to speak.

Based on your information and what others have shared, contribute to the discussion in one or two sentences. You may share new information, respond to others' points, or express agreement/disagreement.

Respond with just your discussion message (not in JSON format yet).`;
}

/** Pre-discussion 独立投票。对齐 PRE_DISCUSSION_DECISION_PROMPT。 */
function buildPreDiscussionVotePrompt(options: string[]): string {
  const optionList = options.map(o => `- ${o}`).join("\n");
  return `Based solely on the information you have (before any group discussion), make an initial decision.

## Available Options
${optionList}

Respond with your decision in JSON format:
{
  "vote": "<your chosen option - must be exactly one of the options above>",
  "rationale": "<brief explanation of your reasoning>"
}`;
}

/** Post-discussion 投票。对齐 FINAL_DECISION_PROMPT。 */
function buildPostDiscussionVotePrompt(
  messages: Array<{ round: number; agentLabel: string; content: string }>,
  options: string[],
): string {
  const history = messages
    .map(m => `**Round ${m.round}, ${m.agentLabel}**: ${m.content}`)
    .join("\n");
  const optionList = options.map(o => `- ${o}`).join("\n");

  return `The group discussion has concluded.

## Discussion Summary
${history}

Based on your original information and the group discussion, please make your final decision.

## Available Options
${optionList}

Respond with your decision in JSON format:
{
  "vote": "<your chosen option - must be exactly one of the options above>",
  "rationale": "<brief explanation of your reasoning>"
}`;
}

// ============================================================================
// Types
// ============================================================================

export interface HiddenBenchObservedVote {
  agentId: string;
  agentLabel: string;
  vote: string;
  rationale: string;
  rawResponse: string;
}

export interface HiddenBenchVote extends HiddenBenchObservedVote {
  isCorrect: boolean;
}

export interface HiddenBenchDiscussionMessage {
  round: number;
  agentId: string;
  agentLabel: string;
  content: string;
}

export interface HiddenBenchProtocolTranscript {
  preVotes: HiddenBenchObservedVote[];
  postVotes: HiddenBenchObservedVote[];
  discussionHistory: HiddenBenchDiscussionMessage[];
  totalRounds: number;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  elapsedMs: number;
  _agentPrompts?: Record<string, { scenarioPrompt: string; preVotePrompt: string; postVotePrompt: string }>;
}

export interface HiddenBenchProtocolResult extends Omit<HiddenBenchProtocolTranscript, "preVotes" | "postVotes"> {
  /** Pre-discussion 投票 */
  preVotes: HiddenBenchVote[];
  /** Post-discussion 投票 */
  postVotes: HiddenBenchVote[];
  /** 讨论历史 */
  discussionHistory: HiddenBenchDiscussionMessage[];
  /** Pre-discussion average rule 准确率 (0-1) */
  preAccuracy: number;
  /** Post-discussion average rule 准确率 (0-1) */
  postAccuracy: number;
  /** Pre-discussion majority 是否正确 */
  preMajorityCorrect: boolean;
  /** Post-discussion majority 是否正确 */
  postMajorityCorrect: boolean;
  /** Collective Gain = post − pre */
  collectiveGain: number;
  /** 实际运行轮数 */
  totalRounds: number;
  /** Token 使用统计 */
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  /** 耗时 ms */
  elapsedMs: number;
  /** 调试：每个 agent 收到的 prompt（验证信息隔离） */
  _agentPrompts?: Record<string, { scenarioPrompt: string; preVotePrompt: string; postVotePrompt: string }>;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * 归一化选项名：小写、非字母数字统一转空格、压缩空白。
 * 保留 Unicode 字母（含中文），丢弃标点/括号/连字符。
 * 导出供 run_e12（F 组 full-profile 判定）复用。
 */
export function normalizeOptionName(s: string): string {
  // 兼容低 target：用 ASCII 字母数字 + 常见非 ASCII 字符集，而非 \p{L} 属性转义
  return s
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿぀-ヿ가-힯]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * 解析投票 JSON，提取 vote 和 rationale。
 *
 * 判定策略：归一化 + 唯一性约束（兼顾"短名正确"与"防虚高"）。
 *   - vote 与选项都归一化（小写、去标点）
 *   - 匹配规则：归一化后 vote === option，或 vote 是 option 的子串/前缀，
 *     或 option 是 vote 的子串
 *   - **唯一性**：必须恰好匹配 1 个选项才算数。
 *     - "Option C" → 只匹配 "Option C: Logistics software company"（唯一）→ 判对 ✅
 *     - "startup" → 匹配 "Option A: Biomedical startup" + "Option B: AI hardware startup"
 *       （多个）→ 判错（防虚高）✅
 */
function parseVote(
  rawResponse: string,
  options: string[],
): { vote: string; rationale: string } {
  // 尝试 JSON 解析
  const parsed = safeJsonParse<{ vote?: string; rationale?: string }>(rawResponse);
  if (parsed && parsed.vote) {
    const vote = parsed.vote.trim();
    const voteNorm = normalizeOptionName(vote);

    // 收集所有匹配的选项（唯一性约束）
    const matches: string[] = [];
    for (const opt of options) {
      const optNorm = normalizeOptionName(opt);
      if (optNorm.length > 0 && (optNorm === voteNorm || voteNorm.includes(optNorm) || optNorm.includes(voteNorm))) {
        matches.push(opt);
      }
    }

    if (matches.length === 1) {
      return { vote: matches[0], rationale: parsed.rationale ?? rawResponse.slice(0, 200) };
    }
    // 0 匹配 或 歧义（匹配多个）→ 返回原 vote（最终判错，不虚高）
    return { vote, rationale: parsed.rationale ?? rawResponse.slice(0, 200) };
  }

  // 回退：在 rawResponse 中搜索完整选项名（归一化唯一匹配）
  const rawNorm = normalizeOptionName(rawResponse);
  const matches: string[] = [];
  for (const opt of options) {
    const optNorm = normalizeOptionName(opt);
    if (optNorm.length > 0 && rawNorm.includes(optNorm)) matches.push(opt);
  }
  if (matches.length === 1) {
    return { vote: matches[0], rationale: rawResponse.slice(0, 200) };
  }

  return { vote: "", rationale: rawResponse.slice(0, 200) };
}

// ============================================================================
// Protocol Runner
// ============================================================================

/**
 * 运行一次完整的 HiddenBench 协议实验。
 *
 * @param task       任务配置（lunar survival 等）
 * @param llmConfig  LLM 配置
 * @param seed       随机种子（控制信息打乱顺序）
 * @param maxRounds  最大讨论轮数（默认 15，对齐原论文）
 *
 * 协议流程：
 *   1. Pre-discussion: 每个 agent 独立投票
 *   2. Discussion:    顺序 round-robin，自由文本，T 轮
 *   3. Post-discussion: 每个 agent 看到完整历史后再次投票
 */
export async function runHiddenBenchProtocol(
  promptTask: PromptTask,
  llmConfig: LLMConfig,
  seed: number,
  maxRounds: number = 15,
): Promise<HiddenBenchProtocolTranscript> {
  const t0 = Date.now();
  let totalPrompt = 0;
  let totalCompletion = 0;

  const options = candidateCanonicals(promptTask);
  const agentDefs = promptTask.schema.agents || [];

  // --- 调试：保存 agent prompts 到结果中以验证信息隔离 ---
  const agentPrompts: Record<string, { scenarioPrompt: string; preVotePrompt: string; postVotePrompt: string }> = {};

  // --- 为每个 agent 准备信息 ---
  const description = promptTask.schema.publicContext
    .replace(/注意：.*$/m, "")
    .replace(/以上列表顺序不代表任何优先级.*$/m, "")
    .trim();

  // 为每个 agent 构建信息列表（仅独有信息——共享场景已在 Scenario 中）
  const agentInfos: Array<{ id: string; name: string; role: string; infoLines: string[] }> = [];
  for (let agentIndex = 0; agentIndex < agentDefs.length; agentIndex++) {
    const def = agentDefs[agentIndex];
    const lines: string[] = [];

    // 仅使用 privateInformation 作为 agent 专属信息（不混合 sharedBriefing 中的垃圾正则匹配）
    if (def.privateInformation) {
      const items = def.privateInformation
        .split(/[；;\n]/)
        .map(s => s.replace(/^[•\-\s]+/, "").trim())
        .filter(s => s.length > 3);
      for (const item of items) {
        lines.push(item);
      }
    }

    // 协议声明事实顺序随机；使用 run seed 派生每个 agent 的独立确定性排列。
    const rng = mulberry32((seed + agentIndex * 0x9E3779B1) >>> 0);
    const shuffledLines = [...lines];
    for (let i = shuffledLines.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffledLines[i], shuffledLines[j]] = [shuffledLines[j], shuffledLines[i]];
    }

    agentInfos.push({
      id: def.id,
      name: def.name,
      role: def.role,
      infoLines: shuffledLines,
    });
  }

  const agentCount = agentInfos.length;

  // ==========================================================================
  // Phase 1: Pre-discussion 独立投票
  // ==========================================================================
  const preVotes: HiddenBenchObservedVote[] = [];
  const scenarioPromptCache = new Map<string, string>();

  for (let i = 0; i < agentCount; i++) {
    const info = agentInfos[i];
    const agentLabel = `Agent ${i + 1}`;

    const scenarioPrompt = buildScenarioPrompt(description, info.infoLines, options);
    scenarioPromptCache.set(info.id, scenarioPrompt);

    const votePrompt = buildPreDiscussionVotePrompt(options);
    agentPrompts[info.id] = { scenarioPrompt, preVotePrompt: votePrompt, postVotePrompt: "" };

    const response = await callLLM(
      HB_SYSTEM_PROMPT,
      `${scenarioPrompt}\n\n${votePrompt}`,
      llmConfig,
    );

    if (response.usage) {
      totalPrompt += response.usage.promptTokens;
      totalCompletion += response.usage.completionTokens;
    }

    const { vote, rationale } = parseVote(response.rawContent, options);
    preVotes.push({
      agentId: info.id,
      agentLabel,
      vote,
      rationale,
      rawResponse: response.rawContent,
    });
  }

  // ==========================================================================
  // Phase 2: 顺序 Round-Robin 讨论（agent 状态保持，对齐官方 agent.messages）
  // ==========================================================================
  const discussionHistory: HiddenBenchDiscussionMessage[] = [];

  // 每个 agent 维护完整对话历史（有状态）：
  // [system, user(scenario), user(发言prompt), assistant(发言), user(发言prompt), ...]
  const agentMessageHistory: ChatMessage[][] = agentInfos.map(info => [
    { role: "system", content: HB_SYSTEM_PROMPT },
    { role: "user", content: scenarioPromptCache.get(info.id)! },
  ]);

  for (let round = 1; round <= maxRounds; round++) {
    for (let i = 0; i < agentCount; i++) {
      const info = agentInfos[i];
      const agentLabel = `Agent ${i + 1}`;

      let prompt: string;
      if (round === 1 && i === 0) {
        // 第一轮第一个发言者
        prompt = HB_FIRST_SPEAKER_PROMPT;
      } else {
        // 后续发言者：看到之前所有的讨论消息
        const allPriorMessages = discussionHistory.map(m => ({
          agentLabel: m.agentLabel,
          content: m.content,
        }));
        prompt = buildSubsequentSpeakerPrompt(agentLabel, allPriorMessages);
      }

      // 将该发言指令追加到 agent 的对话历史
      agentMessageHistory[i].push({ role: "user", content: prompt });

      // 讨论阶段：自由文本（不设置 json_object），带完整多轮历史
      const freeResult = await callLLMFreeText(
        HB_SYSTEM_PROMPT,
        "", // messages 非空时忽略 userPrompt
        llmConfig,
        agentMessageHistory[i],
      );

      if (freeResult.usage) {
        totalPrompt += freeResult.usage.promptTokens;
        totalCompletion += freeResult.usage.completionTokens;
      }

      const content = freeResult.content.trim();
      // 记录 agent 的发言到其历史（对齐官方 assistant 消息累积）
      agentMessageHistory[i].push({ role: "assistant", content });

      discussionHistory.push({
        round,
        agentId: info.id,
        agentLabel,
        content,
      });
    }
  }

  // ==========================================================================
  // Phase 3: Post-discussion 投票（复用 agent 完整历史 + 最终决策 prompt）
  // ==========================================================================
  const postVotes: HiddenBenchObservedVote[] = [];
  const formattedMessages = discussionHistory.map(m => ({
    round: m.round,
    agentLabel: m.agentLabel,
    content: m.content,
  }));

  for (let i = 0; i < agentCount; i++) {
    const info = agentInfos[i];
    const agentLabel = `Agent ${i + 1}`;

    const votePrompt = buildPostDiscussionVotePrompt(formattedMessages, options);
    if (agentPrompts[info.id]) agentPrompts[info.id].postVotePrompt = votePrompt;

    // 追加最终决策 prompt，携带 agent 完整讨论历史调用
    const finalMessages: ChatMessage[] = [
      ...agentMessageHistory[i],
      { role: "user", content: votePrompt },
    ];
    const response = await callLLMFreeText(
      HB_SYSTEM_PROMPT,
      "",
      llmConfig,
      finalMessages,
    );

    if (response.usage) {
      totalPrompt += response.usage.promptTokens;
      totalCompletion += response.usage.completionTokens;
    }

    const { vote, rationale } = parseVote(response.content, options);
    postVotes.push({
      agentId: info.id,
      agentLabel,
      vote,
      rationale,
      rawResponse: response.content,
    });
  }

  // ==========================================================================
  // 计算指标
  // ==========================================================================

  // Majority rule: >50% 的 agent 投票正确

  return {
    preVotes,
    postVotes,
    discussionHistory,
    totalRounds: maxRounds,
    tokenUsage: {
      promptTokens: totalPrompt,
      completionTokens: totalCompletion,
      totalTokens: totalPrompt + totalCompletion,
    },
    elapsedMs: Date.now() - t0,
    _agentPrompts: agentPrompts,
  };
}
