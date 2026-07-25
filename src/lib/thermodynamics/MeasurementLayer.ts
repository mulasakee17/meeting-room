/**
 * MeasurementLayer — SwarmAlpha v3.0 不变测量层
 *
 * 提供独立于讨论模式、治理策略、拓扑结构的认知状态测量服务：
 * 1. 社会热力学 (R, T, H, F) — 从 agent beliefs 确定性计算
 * 2. 认知状态追踪 (U, E, I, C, S) — 支持 post-hoc 和 LLM 原生两种模式
 * 3. 认知检测器 (6 个) — 从 cognitive states 检测集体认知偏差
 *
 * 关键设计原则:
 * - 零额外 LLM 成本：所有计算基于 agent 已输出的结构化数据
 * - 独立可测试：不依赖任何引擎，可单独单元测试
 * - 模式无感知：不知道讨论是 sync 还是 async，flat 还是 grouped
 *
 * 代码来源：
 * - computeThermoState: 从 asyncEngine.ts:833-854 提取
 * - 认知状态更新 (posthoc): 从 DiscussionEngine.updateCognitiveStatesFromRound 提取
 * - 认知状态更新 (native): 从 NativeCognitiveEngine.updateCognitiveStatesFromRound 提取
 * - 检测器运行: 从 NativeCognitiveEngine.applyCognitiveGovernance 提取
 */

import { mulberry32, shannonEntropy, normalizeTemperature } from "../utils/statsUtils";
import {
  beliefToCognitiveState,
  updateInertia,
  updateUtility,
  extractEvidenceItems,
  computeSusceptibility,
  type AgentCognitiveState,
  type Utility,
  type Evidence,
  type Confidence,
} from "../agent/cognitiveState";
import type {
  CognitiveGovernanceState,
  CognitiveStateModification,
  GovernanceConfig,
  GovernanceIssue,
} from "../governance/types";
import {
  runCognitiveDetectors,
  type CognitiveDetectionResult,
} from "../governance/cognitiveDetectors";
import type { AgentOpinion } from "../discussion/types";
import type { DiscussionAgent } from "../discussion/index";

// ============================================================================
// Thermo State
// ============================================================================

export interface ThermoState {
  /** Kuramoto 序参量 [0, 1] — 群体共识/对齐程度 */
  R: number;
  /** 归一化温度 [0, 1] — 信念在轮次间的波动幅度 */
  T: number;
  /** Shannon 熵 [0, 1] — 意见分布的多样性 */
  H: number;
  /** Helmholtz 自由能 F = (1-R) + T·H */
  F: number;
}

// ============================================================================
// Update Options
// ============================================================================

export type CognitiveUpdateMode = "posthoc" | "native";

export interface CognitiveUpdateOptions {
  mode: CognitiveUpdateMode;
  /** 加权 DeGroot 的影响权重（仅 native 模式使用） */
  influenceWeights?: Map<string, Map<string, number>>;
  /** 待应用的认知状态修改（在更新前消费） */
  pendingModifications?: Map<string, CognitiveStateModification>;
  /** 待应用的发言优先级（在更新中消费） */
  pendingSpeakingPriority?: Map<string, number>;
  /** 待触发的知识重排（在更新中消费） */
  pendingShuffleKnowledge?: boolean;
}

export interface CognitiveUpdateResult {
  /** 未被消费的修改（应传回给引擎） */
  remainingModifications: Map<string, CognitiveStateModification>;
  /** 发言优先级（应传回给引擎的 DiscussionMode） */
  speakingPriority: Map<string, number>;
  /** 是否触发知识重排 */
  shuffleKnowledge: boolean;
}

// ============================================================================
// MeasurementLayer
// ============================================================================

export class MeasurementLayer {
  /** 当前所有 agent 的认知状态 */
  private cognitiveStates: Map<string, AgentCognitiveState> = new Map();

  /** 每轮 cognitive state 深拷贝历史 */
  private cognitiveStateHistory: Map<number, Map<string, AgentCognitiveState>> = new Map();

  /** 影响权重（用于加权 DeGroot 更新） */
  private influenceWeights: Map<string, Map<string, number>> = new Map();

  /** 治理 prompt 缓冲（detector 输出的 guidance 文本） */
  private governancePrompts: Map<string, string[]> = new Map();

  /** 待应用的惯性因子（applyPendingModifications 暂存，updateInertia 后消费） */
  private pendingInertiaFactors: Map<string, number> = new Map();

  // ==========================================================================
  // Social Thermodynamics
  // ==========================================================================

  /**
   * 从 5 变量认知状态计算热力学状态 (R, T, H, F)。
   *
   * 语义直译映射（方案 A）：
   *   R (共识度) ← Utility 对齐度 = 1 - 归一化熵(topChoice 分布)
   *   T (温度)   ← Confidence 不稳定性 = 1 - mean(stabilityBased)
   *   H (熵)     ← Evidence 多样性 = shannonEntropy(coverage 分布)
   *   F (自由能) = (1-R) + T·H
   *
   * 理论依据：
   * - R 比 Kuramoto on beliefs 更精确：两个 agent 可能 belief 相同
   *   但效用函数完全不同，topChoice 对齐才代表真正共识。
   * - T 对应统计力学中温度 = 系统微观状态的不确定性。
   *   stabilityBased 直接衡量信念跨轮次稳定性。
   * - H 比 belief binning 更准确：捕获的是信息结构多样性
   *   而非标量意见分布。
   *
   * @returns ThermoState，若 cognitiveStates 为空则返回全零
   */
  computeThermoState(): ThermoState {
    const states = Array.from(this.cognitiveStates.values());
    if (states.length === 0) return { R: 0, T: 0, H: 0, F: 0 };

    // ── R: Utility 对齐度 = 1 - 归一化熵(topChoice 分布) ──
    const topChoices = states.map(s => s.utility.topChoice).filter(Boolean);
    const R = this.computeUtilityAlignment(topChoices);

    // ── T: Confidence 不稳定性 = 1 - mean(stabilityBased) ──
    const stabilityValues = states.map(s => s.confidence.stabilityBased);
    const meanStability = stabilityValues.reduce((a, b) => a + b, 0) / stabilityValues.length;
    const T = Math.max(0, Math.min(1, 1 - meanStability));

    // ── H: Evidence 多样性 = shannonEntropy(coverage 分布) ──
    // 注意：coverage 值域为 [0, 1]，必须显式传入 min/max，
    // 否则 shannonEntropy 默认 min=-1 会导致前 2 个 bin 永远为空，H 被截断。
    const coverages = states.map(s => s.evidence.coverage);
    const H = shannonEntropy(coverages, 5, 0, 1);

    // ── F = (1-R) + T·H ──
    const F = (1 - R) + T * H;

    return { R, T, H, F };
  }

  /**
   * 从 agent beliefs 计算热力学状态（旧版，仅用于向后兼容）。
   *
   * @deprecated 请使用 computeThermoState() 从 5 变量派生。
   *   旧版直接从标量 beliefs 计算，丢失了 Utility/Evidence/Confidence 的结构信息。
   */
  computeThermoStateFromBeliefs(beliefs: number[]): ThermoState {
    if (beliefs.length === 0) return { R: 0, T: 0, H: 0, F: 0 };

    const angles = beliefs.map(b => b * Math.PI / 2);
    let sr = 0, si = 0;
    for (const a of angles) { sr += Math.cos(a); si += Math.sin(a); }
    const R = Math.sqrt(sr * sr + si * si) / beliefs.length;

    const mean = beliefs.reduce((a, b) => a + b, 0) / beliefs.length;
    const std = Math.sqrt(beliefs.reduce((s, v) => s + (v - mean) ** 2, 0) / beliefs.length);
    const T = normalizeTemperature(std);

    const H = shannonEntropy(beliefs);

    const F = (1 - R) + T * H;

    return { R, T, H, F };
  }

  /**
   * 计算 Utility 对齐度（R 的子计算）。
   *
   * R = 1 - H_norm(topChoice 分布)
   * - 所有 agent 同一 topChoice → R = 1（完全共识）
   * - topChoice 均匀分布 → R = 0（完全分歧）
   */
  private computeUtilityAlignment(topChoices: string[]): number {
    if (topChoices.length <= 1) return 1;

    const counts = new Map<string, number>();
    for (const tc of topChoices) {
      counts.set(tc, (counts.get(tc) ?? 0) + 1);
    }

    const n = topChoices.length;
    const k = counts.size;
    if (k <= 1) return 1;

    // 归一化熵: H / log(k)
    let entropy = 0;
    for (const count of counts.values()) {
      const p = count / n;
      entropy -= p * Math.log(p);
    }
    const maxEntropy = Math.log(k);
    const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

    return 1 - normalizedEntropy;
  }

  // ==========================================================================
  // Cognitive State Access
  // ==========================================================================

  /** 获取当前所有 agent 的认知状态 */
  getCognitiveStates(): Map<string, AgentCognitiveState> {
    return new Map(this.cognitiveStates);
  }

  /** 获取指定轮次的认知状态快照 */
  getCognitiveStateHistory(round: number): Map<string, AgentCognitiveState> {
    return this.cognitiveStateHistory.get(round) ?? new Map();
  }

  /** 获取所有轮次的历史 */
  getAllCognitiveStateHistory(): Map<number, Map<string, AgentCognitiveState>> {
    return this.cognitiveStateHistory;
  }

  /** 获取影响权重 */
  getInfluenceWeights(): Map<string, Map<string, number>> {
    return this.influenceWeights;
  }

  /** 获取治理 prompt */
  getGovernancePrompts(): Map<string, string[]> {
    return this.governancePrompts;
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * 初始化或补全 agent 的认知状态。
   * 对每个 agent，如果 cognitiveStates 中不存在，则从旧 belief/confidence 创建。
   */
  initializeCognitiveStates(agents: DiscussionAgent[]): void {
    for (const agent of agents) {
      if (!this.cognitiveStates.has(agent.id)) {
        const state = agent.getState();
        this.cognitiveStates.set(agent.id, beliefToCognitiveState(
          agent.id, agent.name, agent.role, state.belief, state.confidence,
        ));
      }
    }
  }

  // ==========================================================================
  // Cognitive State Update (Main Entry)
  // ==========================================================================

  /**
   * 更新一轮的认知状态。统一入口，根据 mode 分发到 posthoc 或 native 路径。
   *
   * @returns 未被消费的 modification 和优先级调整（供引擎后续使用）
   */
  updateCognitiveStates(
    opinions: AgentOpinion[],
    agents: DiscussionAgent[],
    round: number,
    options: CognitiveUpdateOptions = { mode: "posthoc" },
  ): CognitiveUpdateResult {
    const result: CognitiveUpdateResult = {
      remainingModifications: new Map(),
      speakingPriority: new Map(),
      shuffleKnowledge: false,
    };

    // ── Step 1: 消费 pendingModifications（在更新前，确保当轮生效）──
    if (options.pendingModifications && options.pendingModifications.size > 0) {
      this.applyPendingModifications(options.pendingModifications, result);
    }

    // ── Step 2: 初始化缺失的 cognitive state ──
    this.initializeCognitiveStates(agents);

    // ── Step 3: 根据模式更新 ──
    if (options.mode === "native") {
      this.updateCognitiveStatesNative(opinions, agents, round);
    } else {
      this.updateCognitiveStatesPosthoc(opinions, agents, round);
    }

    // ── Step 3.5: 应用待处理的惯性因子（必须在 updateInertia 之后）──
    this.consumePendingInertiaFactors();

    // ── Step 4: 存储本轮深拷贝快照 ──
    this.storeSnapshot(round);

    return result;
  }

  // ==========================================================================
  // Post-hoc Mode (from DiscussionEngine)
  // ==========================================================================

  /**
   * Post-hoc 认知状态更新（来源: DiscussionEngine.updateCognitiveStatesFromRound）。
   *
   * LLM 仍输出 belief/confidence/itemBeliefs，
   * 系统从这些输出中反推 Utility/Evidence/Confidence。
   */
  private updateCognitiveStatesPosthoc(
    opinions: AgentOpinion[],
    agents: DiscussionAgent[],
    round: number,
  ): void {
    // 检测被反驳的 agent
    const refutedAgents = this.detectRefutedAgents(opinions);

    for (const agent of agents) {
      const agentId = agent.id;
      const opinion = opinions.find(o => o.agentId === agentId);
      const currentState = this.cognitiveStates.get(agentId);

      if (!currentState) {
        const state = agent.getState();
        this.cognitiveStates.set(agentId, beliefToCognitiveState(
          agentId, agent.name, agent.role, state.belief, state.confidence,
        ));
        continue;
      }

      const spokeThisRound = !!opinion;
      const wasRefuted = refutedAgents.has(agentId);

      // Evidence: 从 LLM 输出的 evidence 和 itemBeliefs 提取
      const evidenceItems = extractEvidenceItems(
        opinion?.evidence || [],
        opinion?.itemBeliefs || [],
        agentId,
        round,
      );
      const evidence: Evidence = {
        coverage: currentState.evidence.coverage,
        quality: currentState.evidence.quality,
        diversity: currentState.evidence.diversity,
        recentGain: evidenceItems.length > 0
          ? evidenceItems.length / Math.max(1, currentState.evidence.items.length + evidenceItems.length)
          : 0,
        items: [...currentState.evidence.items, ...evidenceItems],
      };

      // Confidence: 从 evidence 计算
      const evidenceBased = evidence.quality * evidence.coverage;
      const confidence: Confidence = {
        overall: evidenceBased,
        evidenceBased,
        stabilityBased: 1 - Math.abs(evidenceBased - currentState.confidence.overall),
      };

      // Inertia: 系统计算（角色 + 反驳 + 衰减）
      const inertia = updateInertia(
        currentState.inertia,
        agent.role,
        spokeThisRound,
        evidence,
        wasRefuted,
      );

      // Utility: 从 itemBeliefs 反推
      const otherAgentUtilities: Array<{ agentId: string; utility: Utility }> = [];
      for (const otherOp of opinions) {
        if (otherOp.agentId === agentId) continue;
        if (!otherOp.itemBeliefs || otherOp.itemBeliefs.length === 0) continue;

        const scores: Record<string, number> = {};
        for (const ib of otherOp.itemBeliefs) {
          scores[ib.item] = ib.belief;
        }

        const entries = Object.entries(scores);
        entries.sort((a, b) => b[1] - a[1]);

        otherAgentUtilities.push({
          agentId: otherOp.agentId,
          utility: {
            scores,
            topChoice: entries[0]?.[0] ?? "",
            preferenceClarity: entries.length >= 2 ? entries[0][1] - entries[1][1] : 0,
            intensity: Math.sqrt(entries.reduce((s, [, v]) => s + v * v, 0)),
          },
        });
      }

      const options = Object.keys(currentState.utility.scores).length > 0
        ? Object.keys(currentState.utility.scores)
        : (opinion?.itemBeliefs?.map(ib => ib.item) ?? []);

      const utility = updateUtility(
        currentState.utility,
        spokeThisRound,
        otherAgentUtilities,
        inertia,
        confidence,
        options,
      );

      // 组装
      const utilityHistory = [
        ...currentState.utilityHistory,
        { round, scores: { ...currentState.utility.scores } },
      ].slice(-10);

      this.cognitiveStates.set(agentId, {
        agentId,
        agentName: agent.name,
        agentRole: agent.role,
        utility,
        evidence,
        inertia,
        confidence,
        spokeThisRound,
        utilityHistory,
      });
    }
  }

  // ==========================================================================
  // Native Mode (from NativeCognitiveEngine)
  // ==========================================================================

  /**
   * Native 认知状态更新（来源: NativeCognitiveEngine.updateCognitiveStatesFromRound）。
   *
   * LLM 直接输出 cognitiveState (utility, evidenceCoverage, evidenceQuality)，
   * 系统只计算 Inertia 和 Susceptibility。
   */
  private updateCognitiveStatesNative(
    opinions: AgentOpinion[],
    agents: DiscussionAgent[],
    round: number,
  ): void {
    const refutedAgents = this.detectRefutedAgents(opinions);

    for (const agent of agents) {
      const agentId = agent.id;
      const opinion = opinions.find(o => o.agentId === agentId);
      const currentState = this.cognitiveStates.get(agentId);

      if (!currentState) {
        const state = agent.getState();
        this.cognitiveStates.set(agentId, beliefToCognitiveState(
          agentId, agent.name, agent.role, state.belief, state.confidence,
        ));
        continue;
      }

      const spokeThisRound = !!opinion;
      const wasRefuted = refutedAgents.has(agentId);

      // ── Evidence: 使用 LLM 原生输出 ──
      const nativeCS = opinion?.cognitiveState;
      const evidenceItems = extractEvidenceItems(
        opinion?.evidence || [],
        opinion?.itemBeliefs || [],
        agentId,
        round,
      );
      const evidence: Evidence = {
        coverage: nativeCS?.evidenceCoverage ?? currentState.evidence.coverage,
        quality: nativeCS?.evidenceQuality ?? currentState.evidence.quality,
        diversity: currentState.evidence.diversity,
        recentGain: evidenceItems.length > 0
          ? evidenceItems.length / Math.max(1, currentState.evidence.items.length + evidenceItems.length)
          : 0,
        items: [...currentState.evidence.items, ...evidenceItems],
      };

      // ── Confidence: 使用 LLM 原生 confidence（0-100 → 0-1）──
      const nativeConfidence = opinion?.confidence !== undefined
        ? opinion.confidence / 100
        : currentState.confidence.overall;
      const stabilityBased = 1 - Math.abs(nativeConfidence - currentState.confidence.overall);
      const confidence: Confidence = {
        overall: Math.max(0, Math.min(1, nativeConfidence)),
        evidenceBased: nativeConfidence,
        stabilityBased,
      };

      // ── Inertia: 系统计算（可能已被 applyPendingModifications 修改）──
      const inertia = updateInertia(
        currentState.inertia,
        agent.role,
        spokeThisRound,
        evidence,
        wasRefuted,
      );

      // ── Utility: DeGroot 更新，使用 LLM 原生 utility + 加权 ──
      const otherAgentUtilities: Array<{ agentId: string; utility: Utility; weight?: number }> = [];
      for (const otherOp of opinions) {
        if (otherOp.agentId === agentId) continue;

        let scores: Record<string, number> = {};
        if (otherOp.cognitiveState?.utility && Object.keys(otherOp.cognitiveState.utility).length > 0) {
          scores = { ...otherOp.cognitiveState.utility };
        } else if (otherOp.itemBeliefs && otherOp.itemBeliefs.length > 0) {
          for (const ib of otherOp.itemBeliefs) {
            scores[ib.item] = ib.belief;
          }
        }
        if (Object.keys(scores).length === 0) continue;

        const entries = Object.entries(scores);
        entries.sort((a, b) => b[1] - a[1]);

        const agentWeights = this.influenceWeights.get(agentId);
        const weight = agentWeights?.get(otherOp.agentId) ?? 1;

        otherAgentUtilities.push({
          agentId: otherOp.agentId,
          utility: {
            scores,
            topChoice: entries[0]?.[0] ?? "",
            preferenceClarity: entries.length >= 2 ? entries[0][1] - entries[1][1] : 0,
            intensity: Math.sqrt(entries.reduce((s, [, v]) => s + v * v, 0)),
          },
          weight,
        });
      }

      const currentUtility: Utility = nativeCS?.utility && Object.keys(nativeCS.utility).length > 0
        ? (() => {
            const entries = Object.entries(nativeCS.utility);
            entries.sort((a, b) => b[1] - a[1]);
            return {
              scores: { ...nativeCS.utility },
              topChoice: entries[0]?.[0] ?? "",
              preferenceClarity: entries.length >= 2 ? entries[0][1] - entries[1][1] : 0,
              intensity: Math.sqrt(entries.reduce((s, [, v]) => s + v * v, 0)),
            };
          })()
        : currentState.utility;

      const options = Object.keys(currentUtility.scores).length > 0
        ? Object.keys(currentUtility.scores)
        : Object.keys(currentState.utility.scores);

      const utility = updateUtility(
        currentUtility,
        spokeThisRound,
        otherAgentUtilities,
        inertia,
        confidence,
        options,
      );

      // ── 组装 ──
      const utilityHistory = [
        ...currentState.utilityHistory,
        { round, scores: { ...currentState.utility.scores } },
      ].slice(-10);

      this.cognitiveStates.set(agentId, {
        agentId,
        agentName: agent.name,
        agentRole: agent.role,
        utility,
        evidence,
        inertia,
        confidence,
        spokeThisRound,
        utilityHistory,
      });
    }
  }

  // ==========================================================================
  // Pending Modifications
  // ==========================================================================

  /**
   * 应用待处理的认知状态修改。
   *
   * 来源: NativeCognitiveEngine.applyPendingCognitiveModifications
   * 在 updateCognitiveStates 内部调用，确保修改在当轮生效。
   */
  private applyPendingModifications(
    modifications: Map<string, CognitiveStateModification>,
    result: CognitiveUpdateResult,
  ): void {
    for (const [agentId, mod] of modifications) {
      // ── 全局干预（shuffleKnowledge）──
      if (agentId === "__governance__") {
        if (mod.shuffleKnowledge) {
          result.shuffleKnowledge = true;
        }
        continue;
      }

      const state = this.cognitiveStates.get(agentId);
      if (!state) continue;

      // 影响权重修改
      if (mod.influenceWeights) {
        if (!this.influenceWeights.has(agentId)) {
          this.influenceWeights.set(agentId, new Map());
        }
        const agentWeights = this.influenceWeights.get(agentId)!;
        for (const [targetId, weight] of Object.entries(mod.influenceWeights)) {
          agentWeights.set(targetId, weight);
        }
      }

      // 惯性修改：乘性因子（暂存，在 updateInertia 后应用，避免被覆盖）
      if (mod.inertiaFactor !== undefined) {
        this.pendingInertiaFactors.set(agentId, mod.inertiaFactor);
      }

      // 证据引导：记录到 governancePrompts
      if (mod.evidenceGuidance && mod.evidenceGuidance.length > 0) {
        const guidancePrompt = `[治理建议] 请特别关注以下维度的证据：${mod.evidenceGuidance.join("、")}。尝试从不同角度评估你的判断。`;
        const current = this.governancePrompts.get(agentId) ?? [];
        this.governancePrompts.set(agentId, [...current, guidancePrompt]);
      }

      // inject_evidence: 注入 prompt
      if (mod.injectPrompt) {
        const current = this.governancePrompts.get(agentId) ?? [];
        this.governancePrompts.set(agentId, [...current, mod.injectPrompt]);
      }

      // rebalance_attention: 发言优先级
      if (mod.lowerSpeakingPriority) {
        result.speakingPriority.set(agentId, -1);
      }
      if (mod.higherSpeakingPriority) {
        result.speakingPriority.set(agentId, 1);
      }
    }
  }

  // ==========================================================================
  // Detectors
  // ==========================================================================

  /**
   * 运行 6 个认知检测器。
   *
   * 来源: NativeCognitiveEngine.applyCognitiveGovernance → runCognitiveDetectors
   * 提升为测量层公共方法，供任何治理策略调用。
   */
  runDetectors(
    round: number,
    maxRounds: number,
    config?: GovernanceConfig,
  ): CognitiveDetectionResult {
    const input = this.buildDetectorInput();
    const govConfig = config ?? {};

    return runCognitiveDetectors(
      input,
      {
        echoChamberThreshold: govConfig.echoChamberThreshold ?? 0.75,
        polarizationThreshold: govConfig.polarizationThreshold ?? 0.25,
        prematureConsensusThreshold: govConfig.prematureConsensusThreshold ?? 0.55,
        authorityBiasThreshold: govConfig.authorityBiasThreshold ?? 0.6,
        disabledInterventions: govConfig.disabledInterventions ?? [],
        currentRound: round,
        maxRounds,
      },
      round,
      maxRounds,
    );
  }

  /**
   * 从 cognitive states 构建检测器输入。
   *
   * 来源: NativeCognitiveEngine.buildCognitiveGovernanceInput
   */
  buildDetectorInput(): CognitiveGovernanceState[] {
    const states: CognitiveGovernanceState[] = [];

    for (const [agentId, cs] of this.cognitiveStates) {
      const susceptibility = computeSusceptibility(cs.inertia, cs.confidence);

      states.push({
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
      });
    }

    return states;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /** 检测被反驳的 agent */
  private detectRefutedAgents(opinions: AgentOpinion[]): Set<string> {
    const refuted = new Set<string>();
    for (const op of opinions) {
      if (!op.itemBeliefs || op.itemBeliefs.length === 0) continue;
      const opTop = op.itemBeliefs.reduce((a, b) => a.rank < b.rank ? a : b).item;
      for (const other of opinions) {
        if (other.agentId === op.agentId) continue;
        if (!other.itemBeliefs || other.itemBeliefs.length === 0) continue;
        const otherTop = other.itemBeliefs.reduce((a, b) => a.rank < b.rank ? a : b).item;
        if (otherTop !== opTop && other.referencedAgents?.includes(op.agentId)) {
          refuted.add(op.agentId);
        }
      }
    }
    return refuted;
  }

  /** 存储本轮 cognitive state 深拷贝 */
  private storeSnapshot(round: number): void {
    const snapshot = new Map<string, AgentCognitiveState>();
    for (const [aid, state] of this.cognitiveStates) {
      snapshot.set(aid, {
        ...state,
        utility: {
          scores: { ...state.utility.scores },
          topChoice: state.utility.topChoice,
          preferenceClarity: state.utility.preferenceClarity,
          intensity: state.utility.intensity,
        },
        evidence: {
          ...state.evidence,
          items: [...state.evidence.items],
        },
        utilityHistory: [...state.utilityHistory],
      });
    }
    this.cognitiveStateHistory.set(round, snapshot);
  }

  /**
   * 在 updateInertia 之后应用待处理的惯性因子。
   * 必须在 updateInertia 返回后调用，否则会被覆盖。
   */
  private consumePendingInertiaFactors(): void {
    if (this.pendingInertiaFactors.size === 0) return;

    for (const [agentId, factor] of this.pendingInertiaFactors) {
      const state = this.cognitiveStates.get(agentId);
      if (!state) continue;

      state.inertia = {
        ...state.inertia,
        strength: Math.max(0.05, Math.min(0.95, state.inertia.strength * factor)),
        source: {
          ...state.inertia.source,
          expressionBased: state.inertia.source.expressionBased * factor,
        },
      };
    }

    this.pendingInertiaFactors.clear();
  }

  // ==========================================================================
  // Reset
  // ==========================================================================

  reset(): void {
    this.cognitiveStates.clear();
    this.cognitiveStateHistory.clear();
    this.influenceWeights.clear();
    this.governancePrompts.clear();
    this.pendingInertiaFactors.clear();
  }
}