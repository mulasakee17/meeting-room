/**
 * NativeCognitiveEngine — v3.2 原生认知状态引擎
 *
 * 与 DiscussionEngine (v3.0) 的关键区别：
 *   v3.0: LLM 输出 belief/confidence → 系统 post-hoc 反推 Utility/Evidence/Confidence
 *   v3.2: LLM 直接输出 Utility/Evidence/Confidence → 系统只计算 Inertia/Susceptibility
 *
 * Phase 4B: Cognitive State Driven Governance
 * - 覆写 applyGovernance() 使用认知检测器和认知干预
 * - 认知状态管理委托给 MeasurementLayer（消除重复逻辑）
 * - 零侵入主干：不改动 DiscussionEngine 任何代码
 *
 * 设计原则：
 * - 继承 DiscussionEngine，只覆写 prompt 构建和认知状态更新逻辑
 * - 零侵入主干：不改动 DiscussionEngine 任何代码
 * - 旧实验完全可复现：DiscussionEngine 行为不变
 *
 * 变量分工：
 *   LLM 原生输出（自省）:
 *     Utility          → cognitiveState.utility
 *     Evidence Coverage → cognitiveState.evidenceCoverage
 *     Evidence Quality  → cognitiveState.evidenceQuality
 *     Confidence        → confidence (0-100, 映射到 0-1)
 *   系统计算（跨轮次）:
 *     Inertia           → 角色 + 反驳检测 + 衰减
 *     Susceptibility    → (1-ι)(1-c)
 *
 * v3.2 变更：将认知状态更新、检测器运行、热力学计算委托给 MeasurementLayer，
 * 消除与 MeasurementLayer 的重复逻辑，确保 RTHF 从 5 变量而非 beliefs 派生。
 */

import { DiscussionEngine, type DiscussionAgent } from "./index";
import type {
  AgentOpinion,
  DiscussionConfig,
  DiscussionMemoryEntry,
  NativeCognitiveOutput,
  StructuredEvidenceItem,
} from "./types";
import type { GovernanceIssue, Intervention } from "../governance/types";
import { safeJsonParse } from "../utils/jsonUtils";
import {
  type AgentCognitiveState,
  stanceFromItemBeliefs,
} from "../agent/cognitiveState";
import type { OpinionParser } from "../observation";
import {
  generateCognitiveInterventions,
} from "../governance/cognitiveInterventions";
import { estimateAll } from "../thermodynamics/ProgressiveEstimator";
import type {
  CognitiveGovernanceState,
  CognitiveStateModification,
} from "../governance/types";
import { MeasurementLayer, type ThermoState } from "../thermodynamics/MeasurementLayer";
import { EvidencePool } from "../thermodynamics/EvidencePool";
import { mulberry32 } from "../utils/statsUtils";
import type { LLMConfig } from "../llm/providers";

/** v6: 治理结果类型（同步和异步路径共用） */
type GovernanceResult = {
  hasIntervention: boolean;
  interventions: Intervention[];
  effectMetrics?: Record<string, number>;
  issues: GovernanceIssue[];
};

// ============================================================================
// Native Cognitive Opinion Parser
// ============================================================================

/**
 * 解析 LLM 原生 cognitiveState 输出。
 *
 * 期望 LLM 输出的 JSON 中包含：
 * {
 *   "cognitiveState": {
 *     "utility": {"选项A": 0.8, "选项B": 0.2},
 *     "evidenceCoverage": 0.6,
 *     "evidenceQuality": 0.7
 *   }
 * }
 */
class NativeCognitiveOpinionParser implements OpinionParser {
  parseOpinion(
    response: string,
    agentId: string,
    currentBelief: number,
    currentConfidence: number,
    _roundNumber: number,
  ): AgentOpinion {
    try {
      const parsed = safeJsonParse(response);
      if (!parsed) throw new Error("Empty parse result");

      // 提取原生 cognitiveState
      let cognitiveState: NativeCognitiveOutput | undefined;
      if (parsed.cognitiveState && typeof parsed.cognitiveState === "object") {
        const cs = parsed.cognitiveState as Record<string, unknown>;
        const utility: Record<string, number> = {};
        if (cs.utility && typeof cs.utility === "object") {
          for (const [key, val] of Object.entries(cs.utility as Record<string, unknown>)) {
            if (typeof val === "number") {
              utility[key] = Math.max(-1, Math.min(1, val));
            }
          }
        }
        cognitiveState = {
          utility,
          evidenceCoverage: typeof cs.evidenceCoverage === "number"
            ? Math.max(0, Math.min(1, cs.evidenceCoverage as number))
            : 0.5,
          evidenceQuality: typeof cs.evidenceQuality === "number"
            ? Math.max(0, Math.min(1, cs.evidenceQuality as number))
            : 0.5,
        };
      }

      // v3.2.1: 结构化 evidence 解析——支持 LLM 输出 {content, supports, strength} 对象数组
      // 前沿经验：Structured Outputs 优于 free text + post-hoc parsing。
      // 双格式支持：
      //   - 旧格式 evidence: ["字符串A", "字符串B"] → 启发式归类（includes 匹配）
      //   - 新格式 evidence: [{content, supports, strength}] → 直接使用，无归类噪声
      // 新格式同时填充 evidence（string[]，content）和 structuredEvidence（结构化）
      let evidence: string[] = [];
      let structuredEvidence: StructuredEvidenceItem[] | undefined;
      if (Array.isArray(parsed.evidence)) {
        const hasObjects = parsed.evidence.some((e: unknown) => typeof e === "object" && e !== null);
        if (hasObjects) {
          // 新格式：结构化 evidence 对象数组
          const items: StructuredEvidenceItem[] = [];
          const contents: string[] = [];
          for (const e of parsed.evidence) {
            if (typeof e === "object" && e !== null) {
              const eo = e as Record<string, unknown>;
              const content = typeof eo.content === "string" ? eo.content : "";
              const supports = typeof eo.supports === "string" ? eo.supports : "";
              const strength = typeof eo.strength === "number"
                ? Math.max(0, Math.min(1, eo.strength))
                : 0.5;
              if (content) {
                items.push({ content, supports, strength });
                contents.push(content);
              }
            } else if (typeof e === "string") {
              // 混合格式：数组中既有对象又有字符串，字符串保留到 evidence
              contents.push(e);
            }
          }
          evidence = contents;
          structuredEvidence = items.length > 0 ? items : undefined;
        } else {
          // 旧格式：纯字符串数组
          evidence = parsed.evidence.filter((e: unknown) => typeof e === "string");
        }
      }

      return {
        agentId,
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "No reasoning provided",
        evidence,
        // ROADMAP_V5: belief 不再作为 LLM 直接输出，改为从 itemBeliefs 派生 statedStance。
        // 保留向后兼容：若 LLM 仍输出 belief，使用它；否则从 itemBeliefs 计算。
        belief: typeof parsed.belief === "number"
          ? Math.max(-1, Math.min(1, parsed.belief))
          : (Array.isArray(parsed.itemBeliefs) && parsed.itemBeliefs.length > 0
            ? stanceFromItemBeliefs(parsed.itemBeliefs)
            : currentBelief),
        confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(100, parsed.confidence)) : currentConfidence,
        nextOpinion: typeof parsed.nextOpinion === "string" ? parsed.nextOpinion : "",
        referencedAgents: Array.isArray(parsed.referencedAgents) ? parsed.referencedAgents : [],
        itemBeliefs: Array.isArray(parsed.itemBeliefs)
          ? parsed.itemBeliefs.filter(
              (ib: any) => typeof ib.item === "string"
                && typeof ib.rank === "number"
                && typeof ib.belief === "number"
            ).map((ib: any) => ({
              item: ib.item,
              rank: ib.rank,
              belief: Math.max(-1, Math.min(1, ib.belief)),
              confidence: typeof ib.confidence === "number" ? Math.max(0, Math.min(100, ib.confidence)) : 50,
            }))
          : undefined,
        cognitiveState,
        structuredEvidence,
      };
    } catch (err) {
      console.warn(`[NativeCognitiveEngine] Agent ${agentId} response parse failed:`, err instanceof Error ? err.message : err);
      return {
        agentId,
        reasoning: response.substring(0, 500),
        evidence: [],
        belief: currentBelief,
        confidence: currentConfidence,
        nextOpinion: "",
        referencedAgents: [],
        cognitiveState: undefined,
      };
    }
  }
}

// ============================================================================
// Native Cognitive Engine
// ============================================================================

export class NativeCognitiveEngine extends DiscussionEngine {
  // ==========================================================================
  // v3.2: MeasurementLayer 集成 — 消除重复逻辑
  // ==========================================================================

  /**
   * 不变测量层：统一管理认知状态、热力学计算、检测器运行。
   * 替代了 v3.1 中分散在 NativeCognitiveEngine 的重复逻辑。
   */
  private measurementLayer: MeasurementLayer = new MeasurementLayer();

  /**
   * 热力学历史：每轮 RTHF 快照，用于实验分析。
   */
  private thermoHistory: Array<{ round: number } & ThermoState> = [];

  /**
   * Phase 4B: 待应用的认知状态修改。
   *
   * 由 applyGovernance 生成，在下一轮 updateCognitiveStatesFromRound 中消费。
   * 消费后清空（单轮有效）。
   */
  private pendingCognitiveModifications: Map<string, CognitiveStateModification> = new Map();

  /**
   * v2.1: 发言优先级调整（rebalance_attention）。
   *
   * 格式：Map<agentId, priority>
   * - priority > 0: 提高发言优先级（先发言）
   * - priority < 0: 降低发言优先级（后发言）
   * 在 observeAgents 中消费，影响 agent 发言顺序。
   * 消费后清空（单轮有效）。
   */
  private speakingPriority: Map<string, number> = new Map();

  /**
   * v2.1: 待触发知识重排（shuffle_knowledge）。
   *
   * 当设置为 true 时，下一轮开始前对 agent 私有知识进行轮转。
   * 消费后清空（单轮有效）。
   */
  private pendingShuffleKnowledge = false;

  /**
   * v6: LLM 配置，用于 SemanticTool 异步路径。
   * 实验脚本通过 setLlmConfig() 注入。
   */
  private llmConfig: LLMConfig | null = null;

  /** v6: 设置 LLM 配置（SemanticTool 异步路径需要） */
  setLlmConfig(config: LLMConfig): void {
    this.llmConfig = config;
  }

  /** E10: 确定性共享证据池（enabled 时注入结构化事实，零 LLM 调用）。 */
  private evidencePool: EvidencePool | null = null;

  constructor(config?: Partial<DiscussionConfig>) {
    super(config);
    // 强制启用 cognitive state 追踪
    if (!this.config.useCognitiveState) {
    this.config.useCognitiveState = true;
    }
    this.opinionParser = new NativeCognitiveOpinionParser();

    // E10: 启用共享证据池
    if (config?.evidencePool?.enabled) {
      this.evidencePool = new EvidencePool({
        similarityThreshold: config.evidencePool.similarityThreshold,
        maxChars: config.evidencePool.maxChars,
        dimensions: config.evidencePool.dimensions,
      });
    }
  }

  /** 把本 agent 的结构化证据喂入共享池（供后续发言者参考，顺序发言机制）。 */
  protected onOpinionObserved(opinion: AgentOpinion, roundNumber: number): void {
    if (!this.evidencePool) return;
    const structured = opinion.structuredEvidence ?? [];
    const fallback: Array<{ content: string; supports?: string }> = (opinion.evidence ?? []).map(
      (content) => ({ content }),
    );
    const items = structured.length > 0 ? structured : fallback;
    for (const item of items) {
      if (!item.content) continue;
      this.evidencePool.addEvidence({
        sourceAgentId: opinion.agentId,
        roundIntroduced: roundNumber,
        statement: item.content,
        confidence: opinion.confidence,
        supports: item.supports,
      });
    }
  }

  // ==========================================================================
  // Public Accessors
  // ==========================================================================

  /** 获取指定轮次的 cognitive state 快照（历史深拷贝） */
  getCognitiveStateHistory(round?: number): Map<string, AgentCognitiveState> | Map<number, Map<string, AgentCognitiveState>> {
    if (round !== undefined) return this.measurementLayer.getCognitiveStateHistory(round);
    return this.measurementLayer.getAllCognitiveStateHistory();
  }

  /** 获取热力学历史（RTHF 逐轮轨迹） */
  getThermoHistory(): Array<{ round: number } & ThermoState> {
    return this.thermoHistory;
  }

  /**
   * v6: 获取 SemanticTool 审计日志（C 组实验论文分析用）。
   * 仅 useSemanticTool=true 时有数据；B 组（同步路径）返回空数组。
   */
  getSemanticAuditLog() {
    return this.measurementLayer.getSemanticAuditLog();
  }

  // ==========================================================================
  // Prompt: 让 LLM 直接输出认知状态
  // ==========================================================================

  protected buildPrompt(
    agent: { name: string; role: string; id: string },
    task: string,
    memory: DiscussionMemoryEntry[],
    roundNumber: number,
    state: { belief: number; confidence: number },
    currentRoundOpinions: Array<{ agentId: string; reasoning: string; belief: number; confidence: number }> = [],
  ): string {
    // ── Phase 4A: Belief Context Decoupling ──────────────────────────
    // 移除所有 belief context leakage。state.belief / state.confidence 来自父类
    // 旧 belief 系统（DeGroot + inferenceLayer），不再注入 LLM。
    // 改为从 this.cognitiveStates 读取认知状态，向 LLM 注入 cognitive-only context。
    // state 参数保留仅为签名兼容（父类 runRound 会传入），但不使用其 belief/confidence。
    void state; // 显式标记 state 不使用，避免 lint 警告

    const cogState = this.measurementLayer.getCognitiveStates();
    const myCog = cogState?.get(agent.id);

    let memoryContext = "";
    if (memory.length > 0) {
      const ownEntries = memory.filter(e => e.agentId === agent.id);
      const repliedToMe = memory.filter(e => e.agentId !== agent.id);
      memoryContext = "\n\n你的讨论历史:\n";
      if (ownEntries.length > 0) {
        memoryContext += "你之前的发言:\n";
        for (const entry of ownEntries) {
          // Phase 4A: 移除 belief 标签，仅保留 reasoning（避免 belief context leakage）
          memoryContext += `- 第${entry.roundNumber}轮: ${entry.reasoning}\n`;
        }
      }
      if (repliedToMe.length > 0) {
        memoryContext += "对你的回应:\n";
        for (const entry of repliedToMe) {
          memoryContext += `- 第${entry.roundNumber}轮 ${entry.agentId}: ${entry.reasoning}\n`;
        }
      }
    }

    // ── Inject governance prompts ──────────────────────────────────────
    let governanceContext = "";
    const myPrompts = this.measurementLayer.getGovernancePrompts()?.get(agent.id);
    const globalPrompts = this.measurementLayer.getGovernancePrompts()?.get("*");
    const relevantPrompts = [...(globalPrompts || []), ...(myPrompts || [])];
    if (relevantPrompts.length > 0) {
      governanceContext = "\n" + relevantPrompts.join("\n");
    }

    // ── 本轮已发言的观点（移除 belief/confidence 标签）─────────────────
    let currentRoundContext = "";
    if (currentRoundOpinions.length > 0) {
      currentRoundContext = "\n\n本轮其他 agent 已发表的观点:\n";
      for (const op of currentRoundOpinions) {
        // Phase 4A: 移除 belief/confidence 标签，仅保留 reasoning
        currentRoundContext += `- ${op.agentId}: ${op.reasoning}\n`;
      }
      currentRoundContext += "你可以参考或反驳上述观点。\n";
    }

    // ── 认知状态注入（替代旧 belief/confidence）──────────────────────────
    // 从 cognitiveStates 读取当前认知状态，向 LLM 注入 cognitive-only context
    let cognitiveContext = "";
    if (myCog) {
      const topChoice = myCog.utility.topChoice || "未定";
      const clarity = myCog.utility.preferenceClarity.toFixed(2);
      const intensity = myCog.utility.intensity.toFixed(2);
      const evCoverage = myCog.evidence.coverage.toFixed(2);
      const evQuality = myCog.evidence.quality.toFixed(2);
      const confOverall = myCog.confidence.overall.toFixed(2);
      cognitiveContext = `【系统参考（仅背景，非强制）】系统基于讨论历史计算的认知状态：
- 偏好选项：${topChoice}
- 偏好清晰度：${clarity}（0=无偏好，1=极清晰）
- 偏好强度：${intensity}
- 证据覆盖：${evCoverage}（0=无证据，1=证据完整）
- 证据质量：${evQuality}（0=不可靠，1=高度可靠）
- 确信度：${confOverall}（0=不确信，1=完全确信）

以上为外部计算值，仅作背景参考，不代表你的实际判断。

【你的自主判断】请基于本轮讨论的事实与逻辑独立评估你的认知状态——
不要简单复述上述系统参考值，你的认知应反映你对证据的真实判断。`;
    } else {
      cognitiveContext = `这是讨论的第 ${roundNumber} 轮。请基于任务信息和讨论历史形成你的认知状态。`;
    }

    // E10: 共享证据池注入（结构化去重事实，他人已陈述，仅背景参考）
    let poolContext = "";
    if (this.evidencePool) {
      poolContext = this.evidencePool.buildView(agent.id);
    }

    return `You are ${agent.name}, a ${agent.role}.

Task: ${task}

Round: ${roundNumber}/${this.config.maxRounds}

${cognitiveContext}

${poolContext}${memoryContext}${currentRoundContext}${governanceContext}

Analyze the task and the previous discussion (if any). Provide your opinion with reasoning, evidence, and your internal cognitive state.

Respond in JSON format:
{
  "reasoning": "Your detailed analysis...",
  "evidence": [
    {"content": "evidence text", "supports": "Company A", "strength": 0.8},
    {"content": "evidence text", "supports": "Company B", "strength": 0.6}
  ],
  "confidence": 0 to 100,
  "cognitiveState": {
    "utility": {"Company A": 0.8, "Company B": 0.2},
    "evidenceCoverage": 0.6,
    "evidenceQuality": 0.7
  },
  "nextOpinion": "What you want to discuss next",
  "referencedAgents": ["agent_1", "agent_2"],
  "itemBeliefs": [
    {"item": "Company A", "rank": 1, "belief": 0.8, "confidence": 95},
    {"item": "Company B", "rank": 2, "belief": 0.2, "confidence": 70}
  ]
}

Field explanations:
- cognitiveState: your internal cognitive dimensions
  - utility: your preference strength for each option (-1=strongly oppose, 1=strongly support)
  - evidenceCoverage: how much of the total available information you think you have (0=none, 1=complete)
  - evidenceQuality: how reliable you think your information is (0=unreliable, 1=highly reliable)
- itemBeliefs: rank (1=best), belief (-1=oppose, 1=support) for each option.
- evidence: structured evidence items (v3.2.1). Each item MUST include:
  - content: the evidence text
  - supports: which option (from itemBeliefs) this evidence supports
  - strength: how strongly this evidence supports that option (0=weak, 1=strong)
  This structured format eliminates ambiguity in evidence classification.`;
  }

  // ==========================================================================
  // Cognitive State Update: 使用 LLM 原生输出
  // ==========================================================================

  /**
   * 覆写父类方法：委托给 MeasurementLayer 管理认知状态。
   *
   * v3.2 变更：不再在 NativeCognitiveEngine 中重复实现认知状态更新逻辑，
   * 而是委托给 MeasurementLayer.updateCognitiveStates("native")。
   * 更新后同步 cognitiveStates 和 governancePrompts 到父类字段，
   * 并计算 RTHF 存入 thermoHistory。
   */
  protected updateCognitiveStatesFromRound(
    opinions: AgentOpinion[],
    agents: DiscussionAgent[],
    round: number,
  ): void {
    // ── 委托给 MeasurementLayer ──
    const result = this.measurementLayer.updateCognitiveStates(opinions, agents, round, {
      mode: "native",
      pendingModifications: this.pendingCognitiveModifications,
      pendingSpeakingPriority: this.speakingPriority,
      pendingShuffleKnowledge: this.pendingShuffleKnowledge,
    });

    // ── 同步到父类字段（buildPrompt 等从父类字段读取）──
    this.cognitiveStates = this.measurementLayer.getCognitiveStates();
    this.governancePrompts = this.measurementLayer.getGovernancePrompts();

    // ── 消费 pending 状态 ──
    this.pendingCognitiveModifications = result.remainingModifications;
    this.speakingPriority = result.speakingPriority;
    this.pendingShuffleKnowledge = result.shuffleKnowledge;

    // ── 计算 RTHF 并存入热力学历史 ──
    const thermoState = this.measurementLayer.computeThermoState();
    this.thermoHistory.push({ round, ...thermoState });
  }

  // ==========================================================================
  // Phase 4B: Cognitive State Driven Governance
  // ==========================================================================

  /**
   * 覆写父类 applyGovernance：使用认知检测器和认知干预。
   *
   * 流程：
   *   1. 从 cognitive states 构建 CognitiveGovernanceState 输入
   *   2. 运行认知检测器（6 个）
   *   3. 从检测结果生成认知干预
   *   4. 应用干预到 cognitive state（下一轮 updateCognitiveStatesFromRound 中生效）
   */
  protected applyGovernance(
    round: number,
    opinions: AgentOpinion[],
    agentStates: Map<string, { belief: number; confidence: number }>,
    agents: DiscussionAgent[],
    governanceConfigOverride?: { currentRound: number; maxRounds: number },
  ): GovernanceResult | Promise<GovernanceResult> | null {
    const mode = this.config.governanceMode || "full";
    const effectiveMaxRounds = governanceConfigOverride?.maxRounds ?? this.config.maxRounds;
    const effectiveCurrentRound = governanceConfigOverride?.currentRound ?? round;

    // "none" / "detect-only" / "random-intervene": 回退到父类 belief-based 治理
    if (mode === "none" || mode === "detect-only" || mode === "random-intervene") {
      return super.applyGovernance(round, opinions, agentStates, agents, governanceConfigOverride);
    }

    // "cognitive" mode 或 "full" mode with useCognitiveGovernance: 使用 δ 驱动认知治理
    // Phase 2.9 修复：governanceMode="cognitive" 也应触发认知治理路径，
    // 之前仅检查 useCognitiveGovernance 标志，导致 B 组（governanceMode="cognitive"）
    // 走了父类旧路径，δ 诊断结果未生成任何干预。
    if (mode === "cognitive" || this.config.useCognitiveGovernance) {
      // v6: useSemanticTool=true → 异步路径（Tier 1→2→3，含 SemanticTool）
      if (this.config.useSemanticTool) {
        return this.applyCognitiveGovernanceAsync(round, opinions, agents, effectiveCurrentRound, effectiveMaxRounds);
      }
      return this.applyCognitiveGovernance(round, opinions, agents, effectiveCurrentRound, effectiveMaxRounds);
    }

    // "full" mode without cognitive governance: 回退到父类
    return super.applyGovernance(round, opinions, agentStates, agents, governanceConfigOverride);
  }

  /**
   * 认知治理主流程（v6：δ 驱动，同步路径）。
   *
   * 使用 diagnoseAndSuggestSync（同步，纯数学路径）。
   * SemanticTool 异步路径通过 GovernanceRuntime.runCognitiveGovernance() 单独提供。
   */
  private applyCognitiveGovernance(
    _round: number,
    opinions: AgentOpinion[],
    agents: DiscussionAgent[],
    currentRound: number,
    maxRounds: number,
  ): { hasIntervention: boolean; interventions: Intervention[]; issues: GovernanceIssue[] } {
    // v6：δ 驱动诊断
    try {
      const { suggestions } = this.measurementLayer.diagnoseAndSuggestSync(currentRound);

      if (suggestions.length > 0) {
        const govConfig = this.config.governanceConfig ?? {};
        const statesMap = this.buildGovernanceStateMap(opinions);

        const issues: GovernanceIssue[] = suggestions.map((s, i) => ({
          type: s.source as any,
          severity: "medium" as const,
          description: s.reason,
          agents: s.targetAgents,
          source: "custom" as const,
          suggestedIntervention: {
            type: s.type,
            targetAgents: s.targetAgents,
            reason: s.reason,
          },
          detectedAt: new Date().toISOString(),
          id: `delta_${currentRound}_${i}`,
        }));

        // v6：渐进估计用于置信度感知干预降级
        const progressiveEstimates = estimateAll(
          this.measurementLayer.getCognitiveStates(), currentRound,
        );

        const { interventions, cognitiveModifications } = generateCognitiveInterventions(
          issues,
          statesMap,
          govConfig,
          this.agentKnowledge,
          progressiveEstimates,
        );

        this.pendingCognitiveModifications = cognitiveModifications;

        return {
          hasIntervention: interventions.length > 0,
          interventions,
          issues,
        };
      }

      return { hasIntervention: false, interventions: [], issues: [] };
    } catch (err) {
      console.warn(`[NativeCognitiveEngine] δ diagnosis failed, falling back to detectors: ${err instanceof Error ? err.message : err}`);
    }

    // 降级：旧检测器路径
    const govConfig = this.config.governanceConfig ?? {};
    const detectionResult = this.measurementLayer.runDetectors(
      currentRound, maxRounds, govConfig,
    );
    const statesMap = this.buildGovernanceStateMap(opinions);
    const progressiveEstimates = estimateAll(
      this.measurementLayer.getCognitiveStates(), currentRound,
    );
    const { interventions, cognitiveModifications } = generateCognitiveInterventions(
      detectionResult.issues,
      statesMap,
      govConfig,
      this.agentKnowledge,
      progressiveEstimates,
    );
    this.pendingCognitiveModifications = cognitiveModifications;

    return {
      hasIntervention: interventions.length > 0,
      interventions,
      issues: detectionResult.issues,
    };
  }

  /**
   * v6 认知治理异步路径（含 SemanticTool Tier 3）。
   *
   * 与 applyCognitiveGovernance 的区别：
   * - 使用 diagnoseAndSuggest()（async）而非 diagnoseAndSuggestSync()
   * - SemanticTool evidence_dedup（Layer 2 语义去重）
   * - SemanticTool gap_analysis（信息缺口识别）
   * - SemanticTool intervention_generation（上下文感知干预文本）
   */
  private async applyCognitiveGovernanceAsync(
    _round: number,
    opinions: AgentOpinion[],
    agents: DiscussionAgent[],
    currentRound: number,
    _maxRounds: number,
  ): Promise<{ hasIntervention: boolean; interventions: Intervention[]; issues: GovernanceIssue[] }> {
    try {
      const { suggestions } = await this.measurementLayer.diagnoseAndSuggest(
        currentRound, this.llmConfig ?? undefined,
      );

      if (suggestions.length > 0) {
        const govConfig = this.config.governanceConfig ?? {};
        const statesMap = this.buildGovernanceStateMap(opinions);

        const issues: GovernanceIssue[] = suggestions.map((s, i) => ({
          type: s.source as any,
          severity: "medium" as const,
          description: s.reason,
          agents: s.targetAgents,
          source: "custom" as const,
          suggestedIntervention: {
            type: s.type,
            targetAgents: s.targetAgents,
            reason: s.reason,
          },
          detectedAt: new Date().toISOString(),
          id: `delta_semantic_${currentRound}_${i}`,
        }));

        const progressiveEstimates = estimateAll(
          this.measurementLayer.getCognitiveStates(), currentRound,
        );

        const { interventions, cognitiveModifications } = generateCognitiveInterventions(
          issues,
          statesMap,
          govConfig,
          this.agentKnowledge,
          progressiveEstimates,
        );

        this.pendingCognitiveModifications = cognitiveModifications;

        return {
          hasIntervention: interventions.length > 0,
          interventions,
          issues,
        };
      }

      return { hasIntervention: false, interventions: [], issues: [] };
    } catch (err) {
      console.warn(`[NativeCognitiveEngine] SemanticTool diagnosis failed, falling back to sync: ${err instanceof Error ? err.message : err}`);
      return this.applyCognitiveGovernance(_round, opinions, agents, currentRound, _maxRounds);
    }
  }

  /**
   * 从 MeasurementLayer 的 cognitiveStates + opinions 构建 GovernanceState map。
   * 用于 generateCognitiveInterventions。
   */
  private buildGovernanceStateMap(
    opinions: AgentOpinion[],
  ): Map<string, CognitiveGovernanceState> {
    const cognitiveStates = this.measurementLayer.getCognitiveStates();
    const statesMap = new Map<string, CognitiveGovernanceState>();

    for (const [agentId, cs] of cognitiveStates) {
      const opinion = opinions.find(o => o.agentId === agentId);
      const rank1Item = opinion?.itemBeliefs?.find(ib => ib.rank === 1)?.item;

      // 计算 susceptibility（MeasurementLayer 内部也计算，但这里需要暴露给 interventions）
      const susceptibility = (1 - cs.inertia.strength) * (1 - cs.confidence.overall);

      statesMap.set(agentId, {
        agentId,
        utility: {
          scores: { ...cs.utility.scores },
          topChoice: cs.utility.topChoice,
          preferenceClarity: cs.utility.preferenceClarity,
          intensity: cs.utility.intensity,
        },
        evidence: {
          coverage: cs.evidence.coverage,
          quality: cs.evidence.quality,
          diversity: cs.evidence.diversity,
        },
        inertia: {
          strength: cs.inertia.strength,
        },
        confidence: {
          overall: cs.confidence.overall,
        },
        susceptibility,
        rankingTopChoice: rank1Item,
      });
    }

    return statesMap;
  }

  // ==========================================================================
  // v2.1: observeAgents 覆写 — 发言优先级 + 知识重排
  // ==========================================================================

  /**
   * 覆写父类 observeAgents，支持：
   *   1. pendingShuffleKnowledge：在发言前轮转 agent 私有知识
   *   2. speakingPriority：按优先级重排 agent 发言顺序
   *
   * 高优先级（higherSpeakingPriority）的 agent 先发言，
   * 低优先级（lowerSpeakingPriority）的 agent 后发言。
   * 后发言的 agent 能看到前面 agent 的观点（currentRoundOpinions），
   * 因此发言顺序直接影响信息流向。
   */
  protected async observeAgents(
    agents: import("../observation").ObserverAgent[],
    task: import("./types").DiscussionTask,
    roundNumber: number,
  ): Promise<import("../observation").RawObservation[]> {
    // ── Step 1: 消费 pendingShuffleKnowledge ──
    if (this.pendingShuffleKnowledge) {
      this.applyShuffleKnowledge(agents);
      this.pendingShuffleKnowledge = false;
    }

    // ── Step 2: 按 speakingPriority 重排 agent 顺序 ──
    let orderedAgents = agents;
    if (this.speakingPriority.size > 0) {
      orderedAgents = [...agents].sort((a, b) => {
        const pa = this.speakingPriority.get(a.id) ?? 0;
        const pb = this.speakingPriority.get(b.id) ?? 0;
        return pb - pa; // 高优先级在前
      });
      this.speakingPriority.clear();
    } else if (this.config.governanceMode === "none") {
      // none 治理模式：随机打乱发言顺序，避免固定顺序偏差
      // 使用 Fisher-Yates + mulberry32(seed + round) 保证可复现
      const seed = (this.config.seed ?? 42) + roundNumber * 0x9E3779B9;
      const rng = mulberry32(seed);
      orderedAgents = [...agents];
      for (let i = orderedAgents.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [orderedAgents[i], orderedAgents[j]] = [orderedAgents[j], orderedAgents[i]];
      }
    }

    // ── Step 3: 调用父类 observeAgents ──
    return super.observeAgents(orderedAgents, task, roundNumber);
  }

  /**
   * v2.1: 执行知识重排（shuffle_knowledge 干预）。
   *
   * 将 agent 的私有知识进行轮转（circular shift）：
   * agent[i] 获得 agent[i+1] 的知识，最后一个 agent 获得第一个 agent 的知识。
   * 这改变了信息分布，让 agent 接触到不同的视角。
   *
   * 如果 agentKnowledge 为空或只有 1 个 agent，则不做任何操作。
   */
  private applyShuffleKnowledge(agents: import("../observation").ObserverAgent[]): void {
    const knowledge = this.agentKnowledge;
    if (!knowledge || knowledge.size < 2) return;

    // 只对参与讨论的 agent 进行轮转
    const agentIds = agents.map(a => a.id).filter(id => knowledge.has(id));
    if (agentIds.length < 2) return;

    // 保存所有 agent 的当前知识
    const saved = new Map<string, string[]>();
    for (const id of agentIds) {
      saved.set(id, [...(knowledge.get(id) ?? [])]);
    }

    // 轮转：每个 agent 获得下一个 agent 的知识
    for (let i = 0; i < agentIds.length; i++) {
      const nextIdx = (i + 1) % agentIds.length;
      knowledge.set(agentIds[i], saved.get(agentIds[nextIdx]) ?? []);
    }
  }

  // ==========================================================================
  // Reset
  // ==========================================================================

  reset(): void {
    super.reset();
    this.measurementLayer.reset();
    this.thermoHistory = [];
    this.pendingCognitiveModifications.clear();
    this.speakingPriority.clear();
    this.pendingShuffleKnowledge = false;
  }
}