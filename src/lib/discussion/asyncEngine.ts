/**
 * 异步讨论引擎
 *
 * 与 DiscussionEngine（同步全员发言）不同，AsyncDiscussionEngine 采用：
 * 1. 异步发言：每轮只有部分 agent 发言（内容驱动或随机概率）
 * 2. 热力学自适应终止：F 分解决定讨论何时结束（非固定轮次）
 * 3. 信息依赖链触发：依赖前置信息的 agent 发言意愿提高
 *
 * 继承 DiscussionEngine，复用所有核心逻辑（observeAgents、buildPrompt、
 * applyGovernance、updateBeliefs 等），仅重写主循环。
 */

import { DiscussionEngine } from "./index";
import type { DiscussionAgent } from "./index";
import type { DiscussionResult, RoundResult, AgentOpinion, DiscussionTask } from "./types";
import type { RawObservation, ObserverAgent } from "../observation";
import { TerminationDecider, type TerminationThresholds, type ThermoSnapshot, type TerminationDecision } from "../thermodynamics/TerminationDecider";
import { shannonEntropy, normalizeTemperature } from "../utils/statsUtils";
import { BELIEF_MIN, BELIEF_MAX } from "../constants";

// 确定性 PRNG (mulberry32)，保证异步发言选择/终止采样可复现
// 与 DiscussionEngine 和 GovernanceEngine 保持一致的 PRNG 实现
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 发言模式 */
export type SpeakMode = "random_prob" | "content_driven";

/** 异步讨论配置 */
export interface AsyncDiscussionConfig {
  /** 每多少次发言触发一次热力学评估 */
  evalEveryKUtterances: number;
  /** 基础发言概率（random_prob 模式） */
  baseSpeakProbability: number;
  /** 依赖触发时的发言概率（random_prob 模式） */
  dependencyTriggeredProbability: number;
  /** 信息已被提及时的发言概率（random_prob 模式） */
  alreadyMentionedProbability: number;
  /** 终止阈值（可覆盖默认值） */
  terminationThresholds?: Partial<TerminationThresholds>;
  /** 模式：'adaptive'（热力学终止）| 'fixed_rounds'（固定轮次）| 'random_terminate'（随机终止） */
  terminationMode: "adaptive" | "fixed_rounds" | "random_terminate";
  /** fixed_rounds 模式下的轮次数 */
  fixedRounds?: number;
  /** random_terminate 模式下的发言次数采样范围 */
  randomTerminateRange?: [number, number];
  /** 每轮最多发言的 agent 数（上限） */
  maxSpeakersPerEval: number;

  // ── 内容驱动模式参数 ──
  /** 发言模式：'random_prob'（随机概率）| 'content_driven'（内容驱动） */
  speakMode: SpeakMode;
  /** 内容驱动模式：意愿低于此值 → 沉默 */
  willingnessThreshold: number;
  /** 内容驱动模式：意愿高于此值 → 必须发言 */
  strongWillingnessThreshold: number;
  /** 内容驱动模式：刚发过言的惩罚值 */
  recentSpeakPenalty: number;
}

export const DEFAULT_ASYNC_CONFIG: AsyncDiscussionConfig = {
  evalEveryKUtterances: 2,  // K=2（原 3：更密集评估 → 更早检测结晶/去结晶）
  baseSpeakProbability: 0.5,
  dependencyTriggeredProbability: 0.8,
  alreadyMentionedProbability: 0.3,
  terminationMode: "adaptive",
  maxSpeakersPerEval: 5,
  // 内容驱动模式默认参数（阈值经 tanh 归一化后调整）
  // 归一化后：原始 0.9→0.858, 0.6→0.769, -0.32→0.345
  // strongThreshold=0.82: 只有依赖链触发(0.858)或多重信号才必须发言
  // threshold=0.40: 刚发过言(0.345)接近沉默，信息未曝光(0.769)进入加权随机
  speakMode: "content_driven",
  willingnessThreshold: 0.40,
  strongWillingnessThreshold: 0.82,
  recentSpeakPenalty: 0.5,
};

/** 异步讨论结果（扩展 DiscussionResult） */
export interface AsyncDiscussionResult extends DiscussionResult {
  /** 热力学快照历史 */
  thermoHistory: ThermoSnapshot[];
  /** 终止原因 */
  terminationReason: string;
  /** 总发言次数 */
  totalUtterances: number;
  /** 评估周期数 */
  totalEvalCycles: number;
}

/**
 * 信息依赖关系定义
 * key: agentId, value: 该 agent 依赖的前置信息关键词
 */
export type DependencyMap = Map<string, string[]>;

/**
 * 独有信息关键词映射
 * key: agentId, value: 该 agent 独有信息的关键词列表
 * 用于计算信息曝光度（讨论历史中已出现多少关键词）
 */
export type InfoKeywordsMap = Map<string, string[]>;

/** 发言意愿计算因子 */
export interface WillingnessFactors {
  /** 独有信息曝光度 [0,1]：1=完全未曝光，0=完全曝光 */
  infoExposure: number;
  /** 信念变化幅度 [0,∞)：|当前belief - 上一轮belief| */
  beliefShift: number;
  /** 与共识偏离 [0,∞)：|agent.belief - groupMean| */
  consensusDeviation: number;
  /** 依赖信息是否已出现 */
  dependencyTriggered: boolean;
  /** 上一轮是否刚发过言 */
  recentlySpoke: boolean;
}

export class AsyncDiscussionEngine extends DiscussionEngine {
  private asyncConfig: AsyncDiscussionConfig;
  private terminationDecider: TerminationDecider;
  private thermoHistory: ThermoSnapshot[] = [];
  private totalUtterances = 0;
  /** 随机终止的发言次数（random_terminate 模式预采样） */
  private randomTerminateAt: number | null = null;
  /** 保存最后一次终止决策（用于构建 terminationReason） */
  private lastTerminationDecision: TerminationDecision | null = null;
  /** 确定性 PRNG，保证发言选择/终止采样可复现 */
  private prng: () => number;

  // ── 内容驱动模式状态 ──
  /** 每个 agent 上次发言的 evalCycle */
  private lastSpokeCycle: Map<string, number> = new Map();
  /** 上一轮评估周期结束时各 agent 的 belief（用于计算 beliefShift） */
  private prevCycleBeliefs: Map<string, number> = new Map();

  constructor(
    discussionConfig?: Partial<import("./types").DiscussionConfig>,
    asyncConfig: Partial<AsyncDiscussionConfig> = {},
    governanceRuntime?: unknown
  ) {
    super(discussionConfig, governanceRuntime as never);
    this.asyncConfig = { ...DEFAULT_ASYNC_CONFIG, ...asyncConfig };
    this.terminationDecider = new TerminationDecider(this.asyncConfig.terminationThresholds);
    // 初始化 PRNG：从 discussionConfig.seed 派生，保证同一 seed 下实验可复现
    const seed = discussionConfig?.seed ?? Date.now();
    this.prng = mulberry32(seed);
  }

  /**
   * 运行异步讨论
   *
   * 与同步 run() 的区别：
   * - 每个评估周期内，按内容驱动或概率选择发言 agent（非全员）
   * - 每 K 次发言后触发热力学评估
   * - 自适应终止或固定轮次终止
   */
  async runAsync(
    agents: DiscussionAgent[],
    task: DiscussionTask,
    dependencyMap?: DependencyMap,
    infoKeywordsMap?: InfoKeywordsMap
  ): Promise<AsyncDiscussionResult> {
    this.eventTracker.track({
      type: "round_start", timestamp: new Date().toISOString(), roundNumber: 0,
      payload: { task: task.id, agentCount: agents.length, mode: "async", speakMode: this.asyncConfig.speakMode },
    });

    // 重置状态
    this.terminationDecider.reset();
    this.thermoHistory = [];
    this.totalUtterances = 0;
    this.lastTerminationDecision = null;
    this.lastSpokeCycle.clear();
    this.prevCycleBeliefs.clear();
    // 重置 PRNG：保证同一 seed 下实验完全可复现
    const seed = this.config.seed ?? 42;
    this.prng = mulberry32(seed);

    // 预采样随机终止点（random_terminate 模式）
    if (this.asyncConfig.terminationMode === "random_terminate" && this.asyncConfig.randomTerminateRange) {
      const [min, max] = this.asyncConfig.randomTerminateRange;
      this.randomTerminateAt = min + Math.floor(this.prng() * (max - min + 1));
    }

    const agentStates = this.initializeAgentStates(agents);

    // 初始化 prevCycleBeliefs 为初始 belief
    agentStates.forEach((s, id) => this.prevCycleBeliefs.set(id, s.belief));

    const roundResults = await this.runAsyncMainLoop(agents, task, agentStates, dependencyMap, infoKeywordsMap);

    this.eventTracker.track({
      type: "decision", timestamp: new Date().toISOString(),
      roundNumber: roundResults.length,
      payload: { finalDecision: "", converged: false, totalRounds: roundResults.length },
    });

    const baseResult = this.buildDiscussionResult(roundResults, agentStates);

    return {
      ...baseResult,
      thermoHistory: this.thermoHistory,
      terminationReason: this.terminationDecider.getHistory().length > 0
        ? this.getTerminationReason()
        : "completed",
      totalUtterances: this.totalUtterances,
      totalEvalCycles: this.thermoHistory.length,
    };
  }

  /** 异步主循环 */
  private async runAsyncMainLoop(
    agents: DiscussionAgent[],
    task: DiscussionTask,
    agentStates: Map<string, { belief: number; confidence: number }>,
    dependencyMap?: DependencyMap,
    infoKeywordsMap?: InfoKeywordsMap
  ): Promise<RoundResult[]> {
    const roundResults: RoundResult[] = [];
    const evalK = this.asyncConfig.evalEveryKUtterances;
    const hardCap = this.asyncConfig.terminationThresholds?.hardCapUtterances ?? 40;
    let evalCycle = 0;
    let utterancesAtLastEval = 0;

    // 持续讨论直到终止
    while (this.totalUtterances < hardCap) {
      evalCycle++;

      // ── 选择本周期发言的 agent ──
      const speakers = this.selectSpeakers(agents, agentStates, dependencyMap, infoKeywordsMap, evalCycle);

      if (speakers.length === 0) {
        // 所有人都选择沉默——罕见，强制至少 1 人发言
        speakers.push(agents[Math.floor(this.prng() * agents.length)]);
      }

      // ── 发言阶段：复用 observeAgents 逻辑 ──
      // observeAgents 已实现顺序发言（D3 修复），每个 agent 能看到同轮已发言的同伴
      const observations = await this.observeAgents(
        speakers as ObserverAgent[],
        task,
        evalCycle
      );

      // 存储记忆
      for (const obs of observations) {
        this.memoryManager.store({
          roundNumber: evalCycle,
          agentId: obs.agentId,
          reasoning: obs.parsedOpinion.reasoning,
          evidence: obs.parsedOpinion.evidence,
          belief: obs.parsedOpinion.belief,
          confidence: obs.parsedOpinion.confidence,
          referencedAgents: obs.parsedOpinion.referencedAgents,
          timestamp: obs.timestamp,
        });
      }

      const opinions = observations.map(o => o.parsedOpinion);
      this.totalUtterances += opinions.length;

      // ── 更新图和信念 ──
      this.graphBuilder.updateFromOpinions(opinions, evalCycle);

      const graph = this.graphBuilder.getGraph();
      const influenceFactorsMap = new Map<string, any[]>();
      this.traceBuilder.addRound(evalCycle, opinions, this.memoryManager.getAll(), graph, influenceFactorsMap);

      const prevStates = new Map(agentStates);
      this.updateBeliefs(opinions, agentStates, evalCycle);
      // 被动倾听：未发言 agent 根据听到的发言者观点更新信念（DeGroot 式更新）
      // 这确保不发言 agent 的信念也会随讨论演进，产生发言意愿变化
      const speakerIds = new Set(opinions.map(o => o.agentId));
      this.updateListenerBeliefs(speakerIds, opinions, agentStates);
      this.updateAgentStates(agents, agentStates);

      // ── 治理（复用父类逻辑） ──
      const governanceResult = this.applyGovernance(evalCycle, opinions, agentStates, agents);
      const interventions = governanceResult?.hasIntervention ? governanceResult.interventions : [];

      // ── 记录轮次数据 ──
      const beliefChanges = this.computeBeliefChanges(prevStates, agentStates);
      const converged = this.checkConvergence(opinions);

      this.roundDataArray.push({
        roundNumber: evalCycle,
        timestamp: new Date().toISOString(),
        opinions: [...opinions],
        beliefChanges,
        influenceEvents: [],
        governanceIssues: governanceResult?.issues || [],
        interventions,
        converged,
      });

      roundResults.push({
        roundNumber: evalCycle,
        opinions: [...opinions],
        timestamp: new Date().toISOString(),
        converged,
      });

      // 更新 prevCycleBeliefs（用于下一轮的 beliefShift 计算）
      // 使用 prevStates（belief 更新前捕获）而非 agentStates（已更新），
      // 否则下一周期 beliefShift 始终为 0（因为 prevCycleBeliefs == 当前 state.belief）
      prevStates.forEach((s, id) => this.prevCycleBeliefs.set(id, s.belief));

      // ── 检查终止条件 ──
      if (this.asyncConfig.terminationMode === "fixed_rounds") {
        if (evalCycle >= (this.asyncConfig.fixedRounds ?? 5)) break;
      } else if (this.asyncConfig.terminationMode === "random_terminate") {
        if (this.randomTerminateAt !== null && this.totalUtterances >= this.randomTerminateAt) break;
      } else {
        // adaptive 模式：每 K 次发言触发热力学评估
        // 使用累计差值触发，避免 evalK*evalCycle 增长快于发言累积导致永不触发
        if (this.totalUtterances - utterancesAtLastEval >= evalK) {
          utterancesAtLastEval = this.totalUtterances;
          const allBeliefs = Array.from(agentStates.values()).map(s => s.belief);
          const { R, T, H } = this.computeThermoState(allBeliefs);

          const decision = this.terminationDecider.evaluate(R, T, H, this.totalUtterances);
          const snapshot = this.terminationDecider.getHistory()[this.terminationDecider.getHistory().length - 1];
          if (snapshot) this.thermoHistory.push(snapshot);

          if (decision.shouldTerminate) {
            this.lastTerminationDecision = decision;
            break;
          }

          // 淬火态/混沌态处理：注入额外干预
          if (decision.stateType === "quenched") {
            // 淬火态：注入多样性（通过治理 prompt）
            this.governancePrompts.set("*", ["[系统] 检测到讨论过早收敛。请从不同角度重新审视你的结论。考虑你之前忽略的证据。"]);
          } else if (decision.stateType === "chaotic") {
            // 混沌态：注入结构引导
            this.governancePrompts.set("*", ["[系统] 讨论过于分散。请聚焦于最关键的证据，明确你的立场。"]);
          }
        }
      }
    }

    return roundResults;
  }

  // ==========================================================================
  // 被动倾听：未发言 agent 的信念更新
  // ==========================================================================

  /**
   * 更新未发言 agent 的信念（被动倾听）
   *
   * 核心问题：父类 updateBeliefs 只更新发言者（有 opinion 的 agent），
   * 不发言 agent 的信念永远不变。这违背了异步的核心意义——agent 听到
   * 别人的话后，即使没发言，内心想法应该变化，从而产生发言意愿。
   *
   * 修复：使用影响图的权重做 DeGroot 式更新：
   *   delta = learning_rate * Σ(w_ij * (belief_j - belief_i)) / Σ(w_ij)
   * 其中 j 遍历本轮发言且在影响图中有边指向 i 的 agent。
   *
   * 设计决策：
   * - learning_rate=0.15：保守值，低于主动发言的更新率
   * - 只更新 belief，不改 confidence（被动倾听不增加确定性）
   * - 只考虑本轮发言者的影响（非发言者不产生影响）
   * - 第一轮无影响图边时跳过（此时还没有交互历史）
   */
  private updateListenerBeliefs(
    speakers: Set<string>,
    opinions: AgentOpinion[],
    agentStates: Map<string, { belief: number; confidence: number }>
  ): void {
    const graph = this.graphBuilder.getGraph();

    // 建立发言者 → belief 映射
    const speakerBeliefs = new Map<string, number>();
    for (const op of opinions) {
      speakerBeliefs.set(op.agentId, op.belief);
    }

    const LEARNING_RATE = 0.15;

    agentStates.forEach((state, agentId) => {
      // 发言者已由 updateBeliefs 更新，跳过
      if (speakers.has(agentId)) return;

      // 查找指向该 agent 的影响边
      const incomingEdges = graph.edges.filter(e => e.target === agentId);
      if (incomingEdges.length === 0) return;

      let weightedDelta = 0;
      let totalWeight = 0;

      for (const edge of incomingEdges) {
        // 只考虑本轮发言者的影响
        const speakerBelief = speakerBeliefs.get(edge.source);
        if (speakerBelief === undefined) continue;

        weightedDelta += edge.weight * (speakerBelief - state.belief);
        totalWeight += edge.weight;
      }

      if (totalWeight > 0) {
        const delta = LEARNING_RATE * (weightedDelta / totalWeight);
        const newBelief = Math.max(BELIEF_MIN, Math.min(BELIEF_MAX, state.belief + delta));

        // 被动倾听的 confidence 更新：
        // - 听到的观点与自己一致（delta 同号且小）→ 微增 confidence（被他人确认）
        // - 听到的观点与自己不一致（delta 反号或大幅变化）→ 微减 confidence（被他人质疑）
        // 设计理由：现实中听到支持会增强信心，听到反对会动摇信心
        // 更新幅度远小于主动发言（避免被动倾听者过度自信/不自信）
        const CONFIDENCE_LR = 0.03; // confidence 学习率，远小于 belief 的 0.15
        const avgSpeakerBelief = weightedDelta / totalWeight + state.belief; // 发言者平均信念
        const agreement = 1 - Math.abs(Math.sign(avgSpeakerBelief) - Math.sign(state.belief)) / 2;
        // agreement ∈ {0.5, 1}：同号=1（一致），异号=0.5（不一致）
        const confidenceDelta = (agreement - 0.75) * 2 * CONFIDENCE_LR * 100; // 映射到 confidence scale
        const newConfidence = Math.max(0, Math.min(100, state.confidence + confidenceDelta));

        agentStates.set(agentId, {
          belief: newBelief,
          confidence: newConfidence,
        });
      }
    });
  }

  // ==========================================================================
  // 发言者选择：统一分发
  // ==========================================================================

  /** 根据配置的 speakMode 选择发言者 */
  private selectSpeakers(
    agents: DiscussionAgent[],
    agentStates: Map<string, { belief: number; confidence: number }>,
    dependencyMap?: DependencyMap,
    infoKeywordsMap?: InfoKeywordsMap,
    currentCycle: number = 1
  ): DiscussionAgent[] {
    if (this.asyncConfig.speakMode === "random_prob") {
      return this.selectSpeakersRandom(agents, agentStates, dependencyMap);
    }
    return this.selectSpeakersContentDriven(agents, agentStates, dependencyMap, infoKeywordsMap, currentCycle);
  }

  // ==========================================================================
  // 随机概率模式（v1，保留用于对照）
  // ==========================================================================

  /**
   * 随机概率发言选择（v1）
   *
   * 规则：
   * - 基础概率 50%
   * - 依赖前置信息触发 → 80%
   * - 独有信息已被提及 → 30%
   */
  private selectSpeakersRandom(
    agents: DiscussionAgent[],
    _agentStates: Map<string, { belief: number; confidence: number }>,
    dependencyMap?: DependencyMap
  ): DiscussionAgent[] {
    const speakers: DiscussionAgent[] = [];
    const allMemory = this.memoryManager.getAll();
    // 修复：拼接 reasoning + evidence，避免关键词只出现在 evidence 中时依赖检测失效
    const mentionedContent = allMemory.map(m => `${m.reasoning} ${(m.evidence || []).join(" ")}`).join(" ");

    for (const agent of agents) {
      let prob = this.asyncConfig.baseSpeakProbability;

      // 检查依赖触发：该 agent 依赖的关键词是否已在讨论中出现
      if (dependencyMap) {
        const deps = dependencyMap.get(agent.id);
        if (deps && deps.some(dep => mentionedContent.includes(dep))) {
          prob = this.asyncConfig.dependencyTriggeredProbability;
        }
      }

      // 检查信息是否已被提及（简化：检查该 agent 的 id 是否被引用过）
      const agentMentioned = allMemory.some(m =>
        m.agentId !== agent.id && m.referencedAgents?.includes(agent.id)
      );
      if (agentMentioned) {
        prob = this.asyncConfig.alreadyMentionedProbability;
      }

      if (this.prng() < prob) {
        speakers.push(agent);
      }

      // 上限控制
      if (speakers.length >= this.asyncConfig.maxSpeakersPerEval) break;
    }

    // 随机打乱发言顺序（模拟真实讨论的非确定性）
    for (let i = speakers.length - 1; i > 0; i--) {
      const j = Math.floor(this.prng() * (i + 1));
      [speakers[i], speakers[j]] = [speakers[j], speakers[i]];
    }

    return speakers;
  }

  // ==========================================================================
  // 内容驱动模式（v2，真正的异步）
  // ==========================================================================

  /**
   * 内容驱动发言选择（v2）
   *
   * 基于 agent 内部状态计算发言意愿：
   * 1. 独有信息未曝光 → 高意愿（我有责任分享）
   * 2. 信念大幅变化 → 高意愿（我有新观点）
   * 3. 与共识偏离大 → 高意愿（我想反驳）
   * 4. 依赖信息出现 → 加成（现在我能说了）
   * 5. 刚发过言 → 惩罚（避免独霸）
   *
   * 意愿 ≥ strongThreshold → 必须发言
   * 意愿 ∈ [threshold, strongThreshold) → 按归一化概率发言
   * 意愿 < threshold → 沉默
   * 兜底：所有人沉默时选意愿最高的 1 人
   *
   * 发言顺序按意愿降序（高意愿先说，后说的能看到前面的内容）
   */
  private selectSpeakersContentDriven(
    agents: DiscussionAgent[],
    agentStates: Map<string, { belief: number; confidence: number }>,
    dependencyMap?: DependencyMap,
    infoKeywordsMap?: InfoKeywordsMap,
    currentCycle: number = 1
  ): DiscussionAgent[] {
    const allMemory = this.memoryManager.getAll();
    // 修复：拼接 reasoning + evidence，避免关键词只出现在 evidence 中时依赖检测失效
    const discussionText = allMemory.map(m => `${m.reasoning} ${(m.evidence || []).join(" ")}`).join(" ");

    // 计算每个 agent 的意愿分数
    const scores: Array<{ agent: DiscussionAgent; score: number }> = [];
    for (const agent of agents) {
      const factors = this.computeWillingnessFactors(
        agent, agentStates, discussionText, dependencyMap, infoKeywordsMap, currentCycle
      );
      const score = this.computeWillingness(factors);
      scores.push({ agent, score });
    }

    const th = this.asyncConfig.willingnessThreshold;
    const strongTh = this.asyncConfig.strongWillingnessThreshold;

    // 分组：必须发言 / 加权随机 / 沉默
    const mustSpeak = scores.filter(s => s.score >= strongTh);
    const maybe = scores.filter(s => s.score >= th && s.score < strongTh);

    let selected: DiscussionAgent[] = [];

    // 必须发言的全部入选
    selected.push(...mustSpeak.map(s => s.agent));

    // 加权随机的按归一化概率入选
    for (const s of maybe) {
      const normalizedProb = (s.score - th) / (strongTh - th);
      if (this.prng() < normalizedProb) {
        selected.push(s.agent);
      }
    }

    // 兜底：如果没有人被选中，选意愿最高的 1 人（避免讨论停滞）
    if (selected.length === 0) {
      const sorted = [...scores].sort((a, b) => b.score - a.score);
      selected.push(sorted[0].agent);
    }

    // 上限控制：按意愿降序取前 N 个
    if (selected.length > this.asyncConfig.maxSpeakersPerEval) {
      const selectedScores = selected.map(a => scores.find(s => s.agent === a)!);
      selectedScores.sort((a, b) => b.score - a.score);
      selected = selectedScores.slice(0, this.asyncConfig.maxSpeakersPerEval).map(s => s.agent);
    }

    // 按意愿降序排列（高意愿先发言——模拟"抢话"机制）
    const selectedScores = selected.map(a => scores.find(s => s.agent === a)!);
    selectedScores.sort((a, b) => b.score - a.score);
    const ordered = selectedScores.map(s => s.agent);

    // 更新 lastSpokeCycle
    ordered.forEach(agent => this.lastSpokeCycle.set(agent.id, currentCycle));

    return ordered;
  }

  /**
   * 计算发言意愿因子
   */
  private computeWillingnessFactors(
    agent: DiscussionAgent,
    agentStates: Map<string, { belief: number; confidence: number }>,
    discussionText: string,
    dependencyMap?: DependencyMap,
    infoKeywordsMap?: InfoKeywordsMap,
    currentCycle: number = 1
  ): WillingnessFactors {
    const state = agentStates.get(agent.id);
    if (!state) {
      return {
        infoExposure: 1,
        beliefShift: 0,
        consensusDeviation: 0,
        dependencyTriggered: false,
        recentlySpoke: false,
      };
    }

    // 1. 独有信息曝光度
    const infoExposure = this.computeInfoExposure(agent.id, discussionText, infoKeywordsMap);

    // 2. 信念变化幅度（与上一轮评估周期相比）
    const prevBelief = this.prevCycleBeliefs.get(agent.id) ?? state.belief;
    const beliefShift = Math.abs(state.belief - prevBelief);

    // 3. 与共识偏离
    const allBeliefs = Array.from(agentStates.values()).map(s => s.belief);
    const groupMean = allBeliefs.length > 0
      ? allBeliefs.reduce((a, b) => a + b, 0) / allBeliefs.length
      : 0;
    const consensusDeviation = Math.abs(state.belief - groupMean);

    // 4. 依赖信息是否已出现
    let dependencyTriggered = false;
    if (dependencyMap) {
      const deps = dependencyMap.get(agent.id);
      if (deps && deps.some(dep => discussionText.includes(dep))) {
        dependencyTriggered = true;
      }
    }

    // 5. 上一轮是否刚发过言
    const lastSpoke = this.lastSpokeCycle.get(agent.id);
    const recentlySpoke = lastSpoke !== undefined && lastSpoke === currentCycle - 1;

    return {
      infoExposure,
      beliefShift,
      consensusDeviation,
      dependencyTriggered,
      recentlySpoke,
    };
  }

  /**
   * 计算独有信息曝光度
   *
   * @returns 1 = 完全未曝光，0 = 完全曝光
   */
  private computeInfoExposure(
    agentId: string,
    discussionText: string,
    infoKeywordsMap?: InfoKeywordsMap
  ): number {
    if (!infoKeywordsMap) return 1; // 未提供关键词，默认未曝光
    const keywords = infoKeywordsMap.get(agentId);
    if (!keywords || keywords.length === 0) return 1;

    const mentionedCount = keywords.filter(kw => discussionText.includes(kw)).length;
    return 1 - (mentionedCount / keywords.length);
  }

  /**
   * 计算发言意愿分数
   *
   * 参数设计（经场景验证）：
   * - 独有信息曝光度 ×0.6：最重要——我的信息没被提及，我有责任分享
   * - 信念变化 +0.4(>0.3) / +0.2(>0.1)：听到新信息后信念变化，说明有新观点
   * - 共识偏离 +0.4(>0.4) / +0.2(>0.2)：和群体意见不同，想反驳
   * - 依赖触发 +0.3：我依赖的信息出现了，现在我能说了
   * - 刚发过言 -recentSpeakPenalty：避免独霸
   *
   * 归一化：原始分数范围约 [-0.5, 1.7]，用 tanh 映射到 [0, 1]：
   * - w_raw = 0.9（依赖链触发）→ tanh(0.9) ≈ 0.72 → 必须发言（>0.7）
   * - w_raw = 0.6（信息未曝光）→ tanh(0.6) ≈ 0.54 → 加权随机
   * - w_raw = -0.32（刚发过言）→ tanh(-0.32) ≈ 0.31 → 接近阈值
   * - w_raw = 1.2（多重信号）→ tanh(1.2) ≈ 0.83 → 必须发言
   *
   * 验证场景（归一化后）：
   * - 第一轮所有 agent 信息未曝光：w≈0.54 → 加权随机
   * - A 发言后 B 被依赖触发：w≈0.72 → 必须发言（依赖链触发！）
   * - A 刚发过言信息部分曝光：w≈0.31 → 接近阈值，可能沉默
   * - C 被 B 触发：w≈0.72 → 必须发言（链式触发！）
   */
  computeWillingness(f: WillingnessFactors): number {
    let w = 0;

    // 1. 独有信息曝光度（权重 0.6）
    w += f.infoExposure * 0.6;

    // 2. 信念变化（分档加权）
    if (f.beliefShift > 0.3) w += 0.4;
    else if (f.beliefShift > 0.1) w += 0.2;

    // 3. 与共识偏离（分档加权）
    if (f.consensusDeviation > 0.4) w += 0.4;
    else if (f.consensusDeviation > 0.2) w += 0.2;

    // 4. 依赖触发加成
    if (f.dependencyTriggered) w += 0.3;

    // 5. 刚发过言惩罚
    if (f.recentlySpoke) w -= this.asyncConfig.recentSpeakPenalty;

    // 归一化到 [0, 1]：tanh 将 (-∞, +∞) 映射到 (-1, 1)，再线性映射到 [0, 1]
    // 这样阈值 0.3/0.7 的语义清晰：0.7≈原始 0.87，0.3≈原始 0.31
    return (Math.tanh(w) + 1) / 2;
  }

  // ==========================================================================
  // 辅助方法
  // ==========================================================================

  /** 计算热力学状态 (R, T, H) */
  private computeThermoState(beliefs: number[]): { R: number; T: number; H: number } {
    if (beliefs.length === 0) return { R: 0, T: 0, H: 0 };

    // Kuramoto R
    const angles = beliefs.map(b => b * Math.PI / 2);
    let sr = 0, si = 0;
    for (const a of angles) { sr += Math.cos(a); si += Math.sin(a); }
    const R = Math.sqrt(sr * sr + si * si) / beliefs.length;

    // T (归一化)
    const mean = beliefs.reduce((a, b) => a + b, 0) / beliefs.length;
    const std = Math.sqrt(beliefs.reduce((s, v) => s + (v - mean) ** 2, 0) / beliefs.length);
    const T = normalizeTemperature(std);

    // H (Shannon, 5 bins, 归一化)
    const H = shannonEntropy(beliefs);

    return { R, T, H };
  }

  /** 获取终止原因 */
  private getTerminationReason(): string {
    // 优先使用保存的 decision 对象（包含准确的 reason 字段）
    if (this.lastTerminationDecision) {
      const d = this.lastTerminationDecision;
      switch (d.reason) {
        case "hard_cap":
          return `hard_cap (${this.totalUtterances} utterances)`;
        case "strong_crystallized":
          return `strong_crystallized (${d.message})`;
        case "crystallized":
          return `crystallized (${d.message})`;
        default:
          break;
      }
    }
    // fallback：循环通过 while 条件退出（非 decider 判定）
    const hardCap = this.asyncConfig.terminationThresholds?.hardCapUtterances ?? 40;
    if (this.totalUtterances >= hardCap) {
      return `hard_cap (${this.totalUtterances} utterances)`;
    }
    const history = this.terminationDecider.getHistory();
    if (history.length === 0) return "completed";
    const last = history[history.length - 1];
    return `crystallized (R=${last.R.toFixed(3)}, T=${last.T.toFixed(3)}, H=${last.H.toFixed(3)})`;
  }

  /** 构建 belief 变化记录（异步引擎独立实现，匹配 RoundData 类型） */
  private computeBeliefChanges(
    prevStates: Map<string, { belief: number; confidence: number }>,
    agentStates: Map<string, { belief: number; confidence: number }>
  ): Record<string, { old: number; new: number; reason: string }> {
    const changes: Record<string, { old: number; new: number; reason: string }> = {};
    agentStates.forEach((state, id) => {
      const prev = prevStates.get(id);
      if (prev) {
        changes[id] = {
          old: prev.belief,
          new: state.belief,
          reason: "async_belief_update",
        };
      }
    });
    return changes;
  }
}
