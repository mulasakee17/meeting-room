/**
 * SemanticTool — v6 混合范式 Tier 3：LLM 语义传感器
 *
 * 角色：数学引擎手中的语义工具。不参与治理决策——只提供数学无法计算的语义解析。
 *
 * 三项能力：
 *   1. evidence_dedup — 语义去重（"微服务弹性好" = "微服务可以自动扩缩容"？）
 *   2. gap_analysis   — 从未分享证据中识别对当前讨论最关键的那条
 *   3. intervention_generation — 生成上下文合适的干预消息
 *
 * 沙箱约束：
 *   - 只接受数学层组装的结构化输入
 *   - 只输出结构化 JSON（schema 约束）
 *   - 输出经 Validator 校验后才使用
 *   - 校验失败 → 降级到纯数学路径
 *   - 所有调用被日志记录
 */

import { callLLM, type LLMConfig } from "../llm/providers";
import { safeJsonParse } from "../utils/jsonUtils";

// ============================================================================
// Types
// ============================================================================

export type SemanticTask = "evidence_dedup" | "gap_analysis" | "intervention_generation";

export interface SemanticConsultRequest {
  task: SemanticTask;
  // evidence_dedup
  items?: Array<{ id: string; content: string }>;
  // gap_analysis
  deltasTriggered?: string[];
  groupState?: string;
  unsharedEvidence?: Array<{ agent: string; items: Array<{ id: string; content: string }> }>;
  // intervention_generation
  interventionType?: string;
  evidenceContent?: string;
  sourceAgent?: string;
  targetAgents?: string[];
  context?: string;
}

export interface SemanticConsultResult {
  task: SemanticTask;
  // evidence_dedup
  clusters?: Array<{ label: string; itemIds: string[] }>;
  // gap_analysis
  criticalItems?: Array<{ itemId: string; reason: string; suggestedRecipients: string[] }>;
  nonCriticalItems?: string[];
  // intervention_generation
  injectionMessage?: string;
  // metadata
  confidence: number;
}

interface ValidatorResult {
  passed: boolean;
  failures: string[];
}

// ============================================================================
// Prompt Templates
// ============================================================================

const SYSTEM_PROMPT = `You are a semantic analysis tool embedded in a multi-agent governance system.
Your role is strictly limited to semantic parsing. You do NOT make governance decisions.
You receive structured input from the deterministic governance engine and return structured JSON.

Rules:
1. Only reference items/agents that exist in the input
2. Do not fabricate evidence, agents, or intervention logic
3. If unsure, set confidence < 0.5 and explain why
4. Always return valid JSON matching the requested schema`;

const DEDUP_PROMPT = `Group the following evidence items by semantic meaning.
Items that express the same underlying claim should be in the same cluster, even if worded differently.
IMPORTANT CONSTRAINTS:
- Each item MUST appear in EXACTLY ONE cluster (no item may appear in multiple clusters).
- Assign ALL items to some cluster (no item may be omitted).
Return JSON: {"clusters":[{"label":"...","itemIds":["id1","id2"]}],"confidence":0.0-1.0}

Items:
{ITEMS}`;

const GAP_PROMPT = `The multi-agent group is showing these diagnostic signals: {DELTAS}.
Group state: {STATE}.

The following evidence items have NOT been shared with the group:
{UNSHARED}

Identify which unshared items are most critical to the current discussion.
A critical item is one that, if shared, could meaningfully change the group's decision.
Return JSON:
{"criticalItems":[{"itemId":"...","reason":"...","suggestedRecipients":["agent1"]}],"nonCriticalItems":["..."],"confidence":0.0-1.0}`;

const INTERVENTION_PROMPT = `Generate a natural-language intervention message for a multi-agent discussion.

Intervention type: {TYPE}
Evidence to inject: {EVIDENCE}
Source agent: {SOURCE}
Target agents: {TARGETS}
Context: {CONTEXT}

The message should:
- Be concise (1-3 sentences)
- Not fabricate any information not in the evidence
- Sound natural in a group discussion context
- Not tell agents what to decide, only what information to consider

Return JSON: {"injectionMessage":"...","confidence":0.0-1.0}`;

// ============================================================================
// Core
// ============================================================================

/**
 * 调用 LLM 执行语义任务。
 *
 * @returns SemanticConsultResult，或 null（LLM 调用失败/超时/验证失败）
 */
export async function semanticConsult(
  request: SemanticConsultRequest,
  llmConfig?: LLMConfig,
): Promise<SemanticConsultResult | null> {
  const userPrompt = buildPrompt(request);
  if (!userPrompt) return null;

  try {
    const response = await callLLM(SYSTEM_PROMPT, userPrompt, {
      ...llmConfig,
      temperature: 0, // 确定性输出
    } as LLMConfig);

    // safeJsonParse 返回 Record<string, unknown> | null；LLM 输出的 schema 由 prompt 约束，
    // 类型安全由下方 validate() 运行时校验保证。此处显式断言是诚实的——
    // 不假装 tsc 能验证 LLM 输出，而是承认类型安全责任在 Validator。
    const parsed = safeJsonParse<Record<string, unknown>>(response.rawContent);
    if (!parsed) return null;

    const result: SemanticConsultResult = {
      task: request.task,
      clusters: parsed.clusters as SemanticConsultResult["clusters"],
      criticalItems: parsed.criticalItems as SemanticConsultResult["criticalItems"],
      nonCriticalItems: parsed.nonCriticalItems as SemanticConsultResult["nonCriticalItems"],
      injectionMessage: parsed.injectionMessage as SemanticConsultResult["injectionMessage"],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    };

    // 验证
    const validation = validate(request, result);
    if (!validation.passed) {
      console.warn(`[SemanticTool] validation failed: ${validation.failures.join("; ")}`);
      return null; // 降级到纯数学路径
    }

    return result;
  } catch (err) {
    console.warn(`[SemanticTool] LLM call failed: ${err instanceof Error ? err.message : err}`);
    return null; // 降级
  }
}

// ============================================================================
// Validator
// ============================================================================

function validate(request: SemanticConsultRequest, result: SemanticConsultResult): ValidatorResult {
  const failures: string[] = [];

  switch (request.task) {
    case "evidence_dedup":
      return validateDedup(request, result);
    case "gap_analysis":
      return validateGap(request, result);
    case "intervention_generation":
      return validateIntervention(request, result);
    default:
      failures.push(`Unknown task: ${request.task}`);
  }

  return { passed: failures.length === 0, failures };
}

function validateDedup(request: SemanticConsultRequest, result: SemanticConsultResult): ValidatorResult {
  const failures: string[] = [];

  if (!result.clusters || result.clusters.length === 0) {
    failures.push("LLM returned empty clusters");
    return { passed: false, failures };
  }

  const inputIds = new Set((request.items ?? []).map(i => i.id));
  const outputIds = new Set<string>();
  for (const c of result.clusters) {
    for (const id of c.itemIds) {
      if (!inputIds.has(id)) {
        failures.push(`LLM referenced non-existent item: ${id}`);
      }
      if (outputIds.has(id)) {
        failures.push(`Item ${id} appears in multiple clusters`);
      }
      outputIds.add(id);
    }
  }

  // 所有输入 items 必须被分配
  for (const id of inputIds) {
    if (!outputIds.has(id)) {
      failures.push(`Item ${id} not assigned to any cluster`);
    }
  }

  return { passed: failures.length === 0, failures };
}

function validateGap(request: SemanticConsultRequest, result: SemanticConsultResult): ValidatorResult {
  const failures: string[] = [];

  if (!result.criticalItems || result.criticalItems.length === 0) {
    // 没有 critical items 也是有效结果（LLM 判断所有证据都不关键）
    return { passed: true, failures };
  }

  const allItemIds = new Set(
    (request.unsharedEvidence ?? []).flatMap(a => a.items.map(i => i.id))
  );
  const allAgentIds = new Set((request.unsharedEvidence ?? []).map(a => a.agent));

  for (const item of result.criticalItems) {
    if (!allItemIds.has(item.itemId)) {
      failures.push(`LLM referenced non-existent item: ${item.itemId}`);
    }
    for (const recipient of (item.suggestedRecipients ?? [])) {
      if (!allAgentIds.has(recipient)) {
        failures.push(`LLM referenced non-existent agent: ${recipient}`);
      }
    }
  }

  return { passed: failures.length === 0, failures };
}

function validateIntervention(_request: SemanticConsultRequest, result: SemanticConsultResult): ValidatorResult {
  const failures: string[] = [];

  if (!result.injectionMessage || result.injectionMessage.length < 20) {
    failures.push("LLM generated empty or too-short intervention message");
  }

  // 不验证消息内容是否引用正确的证据——这需要 semantic validation，
  // 超出确定性验证器的能力。但在日志中记录，事后可审计。

  return { passed: failures.length === 0, failures };
}

// ============================================================================
// Helpers
// ============================================================================

function buildPrompt(request: SemanticConsultRequest): string | null {
  switch (request.task) {
    case "evidence_dedup": {
      if (!request.items || request.items.length < 2) return null;
      const itemsStr = request.items.map(i => `{"id":"${i.id}","content":"${i.content}"}`).join(",\n");
      return DEDUP_PROMPT.replace("{ITEMS}", itemsStr);
    }
    case "gap_analysis": {
      if (!request.unsharedEvidence || request.unsharedEvidence.length === 0) return null;
      const deltas = (request.deltasTriggered ?? []).join(", ") || "none";
      const state = request.groupState ?? "unknown";
      const unshared = request.unsharedEvidence.map(a =>
        `Agent ${a.agent}:\n${a.items.map(i => `  - [${i.id}] ${i.content}`).join("\n")}`
      ).join("\n\n");
      return GAP_PROMPT
        .replace("{DELTAS}", deltas)
        .replace("{STATE}", state)
        .replace("{UNSHARED}", unshared);
    }
    case "intervention_generation": {
      if (!request.evidenceContent) return null;
      return INTERVENTION_PROMPT
        .replace("{TYPE}", request.interventionType ?? "inject_evidence")
        .replace("{EVIDENCE}", request.evidenceContent)
        .replace("{SOURCE}", request.sourceAgent ?? "unknown")
        .replace("{TARGETS}", (request.targetAgents ?? ["group"]).join(", "))
        .replace("{CONTEXT}", request.context ?? "group discussion");
    }
    default:
      return null;
  }
}
