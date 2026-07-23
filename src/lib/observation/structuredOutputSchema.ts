/**
 * structuredOutputSchema — Agent 结构化输出的 JSON Schema 定义
 *
 * 目的：
 * 1. 为未来接入 function calling / response_format 提供统一的 schema 定义
 * 2. 为质量检测器提供验证基准
 * 3. 使 prompt-based 和 tool-based 提取方式共用同一份字段契约
 *
 * 使用方式：
 * - Prompt 模式（当前）：将 schema 字段说明嵌入 prompt 文本
 * - Tool 模式（未来）：将 schema 传给 LLM API 的 response_format 或 function calling
 * - 验证模式：用 schema 校验提取结果，标记不合规字段
 */

import type { AgentOpinion, ItemBelief } from "../discussion/types";

// ============================================================================
// JSON Schema 定义
// ============================================================================

/**
 * Agent 输出的完整 JSON Schema。
 *
 * 兼容 OpenAI response_format (json_schema)、
 * Anthropic tool use、DeepSeek JSON mode。
 */
export const AGENT_OUTPUT_SCHEMA = {
  type: "object",
  required: ["reasoning", "belief", "confidence"],
  properties: {
    reasoning: {
      type: "string",
      description: "详细分析过程（中文），论证方向必须与 belief 一致",
      minLength: 10,
    },
    evidence: {
      type: "array",
      items: { type: "string" },
      description: "具体证据列表，不要使用模糊表述",
    },
    belief: {
      type: "number",
      minimum: -1,
      maximum: 1,
      description: "整体立场：-1=强烈反对，0=中立，1=强烈支持",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 100,
      description: "置信度：0=完全不确定，100=完全确定",
    },
    nextOpinion: {
      type: "string",
      description: "下一步讨论方向",
    },
    referencedAgents: {
      type: "array",
      items: { type: "string" },
      description: "引用的其他 agent ID 列表",
    },
    itemBeliefs: {
      type: "array",
      items: {
        type: "object",
        required: ["item", "rank", "belief"],
        properties: {
          item: { type: "string" },
          rank: { type: "integer", minimum: 1 },
          belief: { type: "number", minimum: -1, maximum: 1 },
          confidence: { type: "number", minimum: 0, maximum: 100 },
        },
      },
      description: "各选项的独立偏好和排名",
    },
  },
  additionalProperties: false,
} as const;

/**
 * [GOV] 标签的精简 schema（仅 belief/confidence/itemBeliefs）。
 *
 * 用于 PromptInjector.buildGovernanceExtension 和 StateInferenceBridge 的
 * [GOV] 标签提取验证。
 */
export const GOV_TAG_SCHEMA = {
  type: "object",
  required: ["belief", "confidence"],
  properties: {
    belief: { type: "number", minimum: -1, maximum: 1 },
    confidence: { type: "number", minimum: 0, maximum: 100 },
    itemBeliefs: {
      type: "array",
      items: {
        type: "object",
        required: ["item", "rank", "belief"],
        properties: {
          item: { type: "string" },
          rank: { type: "integer", minimum: 1 },
          belief: { type: "number", minimum: -1, maximum: 1 },
          confidence: { type: "number", minimum: 0, maximum: 100 },
        },
      },
    },
  },
  additionalProperties: true,
} as const;

// ============================================================================
// 提取模式枚举（为未来 function calling 做准备）
// ============================================================================

/**
 * Agent 输出的提取模式。
 *
 * - prompt: 当前模式——通过 prompt 文本约束 JSON 格式
 * - gov_tag: 框架无关模式——通过 [GOV] 标签提取精简状态
 * - function_call: 未来模式——通过 LLM function calling / tool use 强制结构化输出
 * - response_format: 未来模式——通过 OpenAI response_format (json_schema) 强制
 */
export type ExtractionMode =
  | "prompt"
  | "gov_tag"
  | "function_call"
  | "response_format";

/**
 * 结构化输出配置——决定使用哪种提取模式。
 *
 * 当前代码只使用 prompt 和 gov_tag 模式。
 * function_call 和 response_format 模式已预留接口，
 * 待接入支持这些功能的 LLM API 后启用。
 */
export interface StructuredOutputConfig {
  mode: ExtractionMode;
  /** 当 mode=function_call 时使用的 function/tool 名称 */
  functionName?: string;
  /** 是否在提取后执行质量校验 */
  enableQualityCheck?: boolean;
}

/**
 * 生成 function calling 的 tool 定义（预留）。
 *
 * 当未来接入支持 function calling 的 LLM API 时，
 * 此函数返回的 tool definition 可直接传给 API。
 */
export function buildToolDefinition(functionName = "reportBelief") {
  return {
    type: "function" as const,
    function: {
      name: functionName,
      description: "报告你的判断状态（信念、置信度、各选项偏好）",
      parameters: AGENT_OUTPUT_SCHEMA,
    },
  };
}
