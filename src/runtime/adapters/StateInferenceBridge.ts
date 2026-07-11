/**
 * StateInferenceBridge — 通用框架桥接器
 *
 * 解决主流多 Agent 框架（AutoGen / CrewAI / LangGraph）接入 SwarmAlpha 的核心障碍：
 * 这些框架的 agent 消息不含 belief/confidence 字段。
 *
 * 三级提取策略（优先级递降）：
 * 1. 显式字段：FrameworkMessage 自带 belief/confidence → 直接使用
 * 2. [GOV] 标签：agent 发言末尾包含 [GOV]{...} JSON → 解析提取（强制输出模式）
 * 3. 默认值：以上都失败 → belief=0, confidence=50
 *
 * 干预应用：
 * 所有干预类型统一转成 prompt 文本，通过 applyIntervention() 返回给宿主框架注入。
 * 宿主框架只需把 prompt 追加到下一轮 agent 输入即可——无需修改 agent 内部状态。
 *
 * 使用示例：
 *
 * ```typescript
 * import { StateInferenceBridge, buildGovernanceExtension } from "@/runtime/adapters";
 *
 * const bridge = new StateInferenceBridge({
 *   llmConfig: { provider: "deepseek", model: "deepseek-chat" },
 *   itemNames: ["BetaCore", "AlphaTech", "GammaEdge"],
 * });
 *
 * // 1. 给 agent prompt 追加格式约束
 * const extension = buildGovernanceExtension(["BetaCore", "AlphaTech", "GammaEdge"]);
 * // 用户自行把 extension 追加到框架 agent 的 system prompt 末尾
 *
 * // 2. 把框架消息转成治理引擎能消费的格式
 * const messages = bridge.adaptMessages(rawMessages, 1);
 *
 * // 3. 喂给治理运行时
 * const result = runtime.processRound(messages);
 *
 * // 4. 把干预转成 prompt 注入回框架
 * if (result.hasIntervention) {
 *   for (const intervention of result.interventions) {
 *     await bridge.applyIntervention(intervention, { agentIds: ["a1","a2","a3"] });
 *   }
 * }
 * ```
 */

import type { GovernanceBridge, BridgeOptions } from "./types";
import type { DiscussionMessage, FrameworkMessage } from "../types";
import type { Intervention } from "../../lib/governance/types";
import {
  extractGovTag,
  stripGovTag,
  interventionToPrompt,
  getInterventionTargets,
  type ExtractedState,
} from "./PromptInjector";

// ============================================================================
// StateInferenceBridge
// ============================================================================

export class StateInferenceBridge implements GovernanceBridge {
  readonly framework = "state-inference";
  private options: BridgeOptions;
  /** 讨论选项名称（用于构建 itemBeliefs 提示） */
  private itemNames?: string[];
  /** 统计：提取成功/失败次数，用于监控 [GOV] 标签的遵从率 */
  private stats = {
    explicitField: 0,
    govTagExtracted: 0,
    fallback: 0,
    interventionsTranslated: 0,
    interventionsFailed: 0,
  };

  constructor(options: BridgeOptions = {}) {
    this.options = {
      governanceEnabled: true,
      ...options,
    };
    this.itemNames = this.options.custom?.itemNames as string[] | undefined;
  }

  /**
   * 把框架原始消息转成 DiscussionMessage。
   *
   * 三级提取：显式字段 > [GOV] 标签 > 默认值
   */
  adaptMessages(
    rawMessages: FrameworkMessage[],
    roundNumber: number
  ): DiscussionMessage[] {
    return rawMessages.map((msg) => {
      const agentId = msg.agentId || (msg.metadata?.name as string) || "unknown";
      const content = msg.content;
      const cleanContent = stripGovTag(content);

      let belief: number;
      let confidence: number;
      let itemBeliefs: ExtractedState["itemBeliefs"];
      let reasoning: string;

      // Level 1: 显式字段
      if (typeof msg.belief === "number" && typeof msg.confidence === "number") {
        belief = Math.max(-1, Math.min(1, msg.belief));
        confidence = Math.max(0, Math.min(100, msg.confidence));
        reasoning = (msg.metadata?.reasoning as string) || cleanContent;
        this.stats.explicitField++;
      }
      // Level 2: [GOV] 标签
      else {
        const extracted = extractGovTag(content);
        if (extracted) {
          belief = extracted.belief;
          confidence = extracted.confidence;
          itemBeliefs = extracted.itemBeliefs;
          reasoning = cleanContent;
          this.stats.govTagExtracted++;
        }
        // Level 3: 默认值
        else {
          belief = (msg.metadata?.belief as number) ?? 0;
          confidence = (msg.metadata?.confidence as number) ?? 50;
          reasoning = (msg.metadata?.reasoning as string) || cleanContent;
          this.stats.fallback++;
        }
      }

      return {
        agentId,
        agentName: msg.agentName || (msg.metadata?.name as string) || agentId,
        agentRole: msg.agentRole || (msg.metadata?.role as string) || "Agent",
        content: cleanContent,
        belief,
        confidence,
        timestamp: msg.timestamp || new Date().toISOString(),
        referencedAgents: (msg.metadata?.referencedAgents as string[]) || [],
        reasoning,
        roundNumber,
      };
    });
  }

  /**
   * 应用干预——统一转成 prompt，返回给宿主框架。
   *
   * 宿主框架需要做的：
   * 1. 从 context 中拿到 allAgentIds
   * 2. 对 getInterventionTargets() 返回的每个 agent，把 prompt 追加到下一轮输入
   *
   * 这使得任何框架的 agent 都能接收治理指令，无需修改 agent 内部状态。
   */
  async applyIntervention(
    intervention: Intervention,
    context: unknown
  ): Promise<boolean> {
    const ctx = context as {
      allAgentIds?: string[];
      /** 宿主框架提供的 prompt 注入回调 */
      injectPrompt?: (agentId: string, prompt: string) => void | Promise<void>;
    } | null;

    const allAgentIds = ctx?.allAgentIds || [];
    const translated = interventionToPrompt(intervention);

    if (!translated) {
      console.warn(`[StateInferenceBridge] Cannot translate intervention: ${intervention.type}`);
      this.stats.interventionsFailed++;
      return false;
    }

    const targetIds = getInterventionTargets(intervention, allAgentIds);

    if (ctx?.injectPrompt) {
      for (const agentId of targetIds) {
        await ctx.injectPrompt(agentId, translated.prompt);
      }
    } else {
      // 无回调时，仅记录日志
      console.log(
        `[StateInferenceBridge] Intervention: ${intervention.type} → ${targetIds.length} agents\n` +
        `Prompt: ${translated.prompt.substring(0, 100)}...`
      );
    }

    this.stats.interventionsTranslated++;
    return true;
  }

  /**
   * 从框架上下文中提取 agent 信念。
   * 如果框架自带 belief 则直接返回，否则返回默认值。
   */
  extractBeliefs(context: unknown): Array<{
    agentId: string;
    belief: number;
    confidence: number;
  }> {
    const ctx = context as {
      agents?: Array<Record<string, unknown>>;
      messages?: FrameworkMessage[];
    } | null;

    // 优先从 agents 数组提取
    if (ctx?.agents && Array.isArray(ctx.agents)) {
      return (ctx.agents as Array<Record<string, unknown>>).map((a) => ({
        agentId: (a.id || a.name || "unknown") as string,
        belief: (a.belief as number) ?? 0,
        confidence: (a.confidence as number) ?? 50,
      }));
    }

    // 从消息中提取
    if (ctx?.messages && Array.isArray(ctx.messages)) {
      return ctx.messages.map((msg) => {
        const extracted = extractGovTag(msg.content);
        return {
          agentId: msg.agentId || "unknown",
          belief: extracted?.belief ?? msg.belief ?? 0,
          confidence: extracted?.confidence ?? msg.confidence ?? 50,
        };
      });
    }

    return [];
  }

  /**
   * 获取提取统计——监控 [GOV] 标签遵从率。
   *
   * 遵从率 = govTagExtracted / (govTagExtracted + fallback)
   * 如果遵从率低于 70%，建议检查 agent prompt 是否正确追加了格式约束。
   */
  getStats() {
    const total = this.stats.govTagExtracted + this.stats.fallback;
    const complianceRate = total > 0 ? this.stats.govTagExtracted / total : 0;
    return { ...this.stats, complianceRate };
  }

  /** 重置统计 */
  resetStats() {
    this.stats = {
      explicitField: 0,
      govTagExtracted: 0,
      fallback: 0,
      interventionsTranslated: 0,
      interventionsFailed: 0,
    };
  }
}
