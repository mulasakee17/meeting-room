/**
 * PromptInjector — 框架无关的 prompt 约束生成与干预转译
 *
 * 两个核心功能：
 * 1. buildGovernanceExtension()：生成追加到任意 agent system prompt 末尾的格式约束，
 *    强制 agent 在发言末尾输出 belief/confidence/itemBeliefs 的 JSON 行。
 *    这样适配器无需额外 LLM 调用即可提取状态。
 *
 * 2. interventionToPrompt()：把所有干预类型（含状态类干预）统一转成 prompt 文本，
 *    使任何框架的 agent 都能接收治理指令。
 */

import type { Intervention } from "../../lib/governance/types";
import { formatInterventionPrompt } from "../../lib/governance/interventionPrompt";

// ============================================================================
// 格式约束 prompt
// ============================================================================

/**
 * 生成追加到 agent system prompt 末尾的治理格式约束。
 *
 * 设计原则：
 * - 不修改用户已有的 prompt 内容，只在末尾追加
 * - 要求 agent 在发言正文之后附加一行 JSON
 * - JSON 格式与 ObservationLayer V2 一致，复用现有 parser
 *
 * @param itemNames 可选——如果讨论有明确的选项列表，传入以获得更精准的 itemBeliefs
 */
export function buildGovernanceExtension(itemNames?: string[]): string {
  const itemBeliefsHint = itemNames && itemNames.length > 0
    ? `\n讨论选项：${itemNames.join(", ")}\n请为每个选项提供独立的 belief 和 rank。`
    : "";

  return `${itemBeliefsHint}

--- Governance Extension (SwarmAlpha) ---
After your response, append exactly one line starting with [GOV] followed by a JSON object:
[GOV]{"belief": <number -1 to 1>, "confidence": <number 0 to 100>, "itemBeliefs": [{"item": "<name>", "rank": <1=best>, "belief": <-1 to 1>, "confidence": <0-100>}]}
- belief: your overall stance (-1=against, 0=neutral, 1=support)
- confidence: how sure you are (0-100)
- itemBeliefs: per-option preference (rank 1=best, belief -1=oppose to 1=support)
If you cannot provide itemBeliefs, use an empty array.
--- End Governance Extension ---`;
}

// ============================================================================
// 从文本中提取 [GOV] JSON 行
// ============================================================================

/**
 * 从 agent 发言文本中提取 [GOV] 标记后的 JSON。
 *
 * 匹配规则：查找 [GOV] 标记，取其后到行尾/文本结尾的内容。
 * 容错：如果 JSON 不完整（缺右花括号），尝试补全。
 *
 * @returns 解析出的状态对象，或 null（未找到/解析失败）
 */
export interface ExtractedState {
  belief: number;
  confidence: number;
  itemBeliefs?: Array<{
    item: string;
    rank: number;
    belief: number;
    confidence: number;
  }>;
}

export function extractGovTag(text: string): ExtractedState | null {
  const match = text.match(/\[GOV\]\s*(\{[\s\S]*\})/);
  if (!match) return null;

  let jsonStr = match[1].trim();

  // 容错：如果 JSON 被截断（缺右花括号），尝试补全
  const openBraces = (jsonStr.match(/\{/g) || []).length;
  const closeBraces = (jsonStr.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    jsonStr += "}".repeat(openBraces - closeBraces);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const belief = typeof parsed.belief === "number" ? Math.max(-1, Math.min(1, parsed.belief)) : 0;
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(100, parsed.confidence)) : 50;

    let itemBeliefs: ExtractedState["itemBeliefs"] | undefined;
    if (Array.isArray(parsed.itemBeliefs)) {
      const filtered = parsed.itemBeliefs
        .filter((ib: any) => typeof ib.item === "string" && typeof ib.rank === "number" && typeof ib.belief === "number")
        .map((ib: any) => ({
          item: ib.item,
          rank: ib.rank,
          belief: Math.max(-1, Math.min(1, ib.belief)),
          confidence: typeof ib.confidence === "number" ? Math.max(0, Math.min(100, ib.confidence)) : 50,
        }));
      itemBeliefs = filtered.length > 0 ? filtered : undefined;
    }

    return { belief, confidence, itemBeliefs };
  } catch {
    return null;
  }
}

/**
 * 从 agent 发言文本中移除 [GOV] 行，返回干净的发言内容。
 */
export function stripGovTag(text: string): string {
  return text.replace(/\[GOV\]\s*\{[\s\S]*?\}/g, "").trimEnd();
}

// ============================================================================
// 干预转 prompt
// ============================================================================

/**
 * 把任意干预类型转成 prompt 文本，可注入到任何框架的 agent 对话中。
 *
 * - prompt 类干预（diversity/reflection/continue）：直接复用已有 prompt
 * - 状态类干预（reduce_weight）：转成等价 prompt——"不要听从 X"
 *
 * @returns { prompt, promptTargets } 或 null（无法转译）
 */
export function interventionToPrompt(
  intervention: Intervention
): { prompt: string; promptTargets: string[] } | null {
  switch (intervention.type) {
    case "introduce_diversity": {
      const targets = intervention.targetAgents || [];
      return {
        prompt: formatInterventionPrompt(
          `⚠️ CRITICAL: Echo chamber detected. Multiple agents are expressing nearly identical views.\n` +
          `This is dangerous. You may be missing important counter-evidence.\n` +
          `MANDATORY: State at least ONE scenario where your current conclusion would be WRONG.\n` +
          `If you cannot think of any, you are not thinking critically enough.`
        ),
        promptTargets: targets,
      };
    }

    case "force_reflection": {
      const targets = intervention.targetAgents || [];
      return {
        prompt: formatInterventionPrompt(
          `⚠️ CRITICAL: Your position is at an extreme compared to the group.\n` +
          `MANDATORY: Before responding, write down the STRONGEST argument for the OPPOSING viewpoint.\n` +
          `What scenario would make the opposing position correct?\n` +
          `Only after doing this, restate your own position.`
        ),
        promptTargets: targets,
      };
    }

    case "continue_discussion": {
      const effect = intervention.effect || "";
      return {
        prompt: formatInterventionPrompt(
          `⚠️ CRITICAL: Premature consensus detected. The group is agreeing too fast.\n` +
          `STOP. Reconsider. Are there alternative viewpoints that haven't been raised?\n` +
          `Challenge each other BEFORE finalizing. State one counter-argument now.` +
          (effect ? `\nContext: ${effect}` : "")
        ),
        promptTargets: [], // 全体 agent
      };
    }

    case "reduce_weight": {
      const targetId = intervention.targetAgentId;
      if (!targetId) return null;
      return {
        prompt: formatInterventionPrompt(
          `⚠️ CRITICAL: Agent ${targetId} is dominating the discussion.\n` +
          `DO NOT defer to ${targetId}. Their opinion carries no more weight than yours.\n` +
          `MANDATORY: Form your OWN independent judgment. What would you conclude if ${targetId} were absent?\n` +
          `State your independent position NOW. Do NOT simply agree with ${targetId}.`
        ),
        promptTargets: [], // 除 targetAgentId 外的所有 agent
      };
    }

    default:
      return null;
  }
}

/**
 * 获取某条干预应该注入到哪些 agent。
 * 返回 null 表示注入全体 agent。
 */
export function getInterventionTargets(
  intervention: Intervention,
  allAgentIds: string[]
): string[] {
  const translated = interventionToPrompt(intervention);
  if (!translated) return [];

  const targets = translated.promptTargets;
  if (targets.length === 0) {
    // reduce_weight: 除被削减者外的所有 agent
    if (intervention.type === "reduce_weight" && intervention.targetAgentId) {
      return allAgentIds.filter(id => id !== intervention.targetAgentId);
    }
    // continue_discussion: 全体
    return allAgentIds;
  }
  return targets;
}
