/**
 * MeasurementLayer — SwarmAlpha v5 双层测量架构
 *
 * 提供独立于讨论模式、治理策略、拓扑结构的认知状态测量服务：
 * 1. 群体动态筛查 (R, T, H, F) — 从标量立场汇总确定性计算，零成本异常检测
 * 2. 认知状态追踪 (U, E, I, C, Λ) — 支持 post-hoc 和 LLM 原生两种模式
 * 3. 认知检测器 (6 个) — 从 cognitive states 检测集体认知偏差
 * 4. 一致性检测 (δ 系列) — 自报 vs 行为对比，无需 ground truth
 *
 * 关键设计原则:
 * - 零额外 LLM 成本：所有计算基于 agent 已输出的结构化数据
 * - 独立可测试：不依赖任何引擎，可单独单元测试
 * - 模式无感知：不知道讨论是 sync 还是 async，flat 还是 grouped
 *
 * 双层架构（ROADMAP_V5）：
 * - 热力学筛查层（标量）：R/T/H/F 做零成本异常检测，95% 轮次无需触发诊断
 * - 信息层诊断（向量）：E/U/I/C/Λ 做定向根因定位，仅异常轮次触发
 * - δ 一致性层：自报 vs 行为对比，检测过早共识、权威集中、异常立场变化
 *
 * 代码来源：
 * - computeThermoState: 从 asyncEngine.ts:833-854 提取
 * - 认知状态更新 (posthoc): 从 DiscussionEngine.updateCognitiveStatesFromRound 提取
 * - 认知状态更新 (native): 从 NativeCognitiveEngine.updateCognitiveStatesFromRound 提取
 * - 检测器运行: 从 NativeCognitiveEngine.applyCognitiveGovernance 提取
 */

import {
  beliefToCognitiveState,
  updateInertia,
  updateUtility,
  extractEvidenceItems,
  computeSusceptibility,
  type AgentCognitiveState,
  type Utility,
  type Evidence,
  type EvidenceItem,
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
import { computeDeltaDiagnosis, type DeltaConfig, type DeltaDiagnosis } from "./computeDelta";
import {
  estimateAll,
  detectBehaviorEvents,
  createInitialBehaviorEvents,
  createInitialSusceptibility,
  createInitialConfidence,
  createInitialInertia,
  type ProgressiveEstimates,
} from "./ProgressiveEstimator";
import { semanticConsult, type SemanticConsultRequest } from "./SemanticTool";
import type { LLMConfig } from "../llm/providers";
import {
  COGNITIVE_ECHO_CHAMBER_THRESHOLD,
  COGNITIVE_POLARIZATION_THRESHOLD,
  COGNITIVE_PREMATURE_CONSENSUS_THRESHOLD,
  COGNITIVE_AUTHORITY_BIAS_THRESHOLD,
} from "../constants";

// ============================================================================
// Thermo → δ → Intervention Pipeline Types
// ============================================================================

/**
 * evidence_dedup 每 run 最大调用次数（2026-08-03 频率限制修复）。
 *
 * 审计数据显示：hidden-profile 任务中 agent 每轮产生新证据 → "未共享数创新高"
 * 门控永远成立 → evidence_dedup 每轮调用 LLM（C 组每 run 在 round 2-5 各调 1 次，
 * 输入 31→88 条但 cluster 数稳定 12-17，新增证据几乎无重复）。
 * 设 2 次：首次去重 + 一轮后续补判，之后不再重复扫描。
 */
const MAX_SEMANTIC_DEDUP_CALLS = 2;

/**
 * δ 触发的干预建议类型。
 */
export interface DeltaInterventionSuggestion {
  /** 干预类型 */
  type: "inject_evidence" | "rebalance_attention";
  /** 目标 agent IDs */
  targetAgents: string[];
  /** 原因说明 */
  reason: string;
  /** 触发此建议的 δ 指标 */
  source: string;
}

/**
 * v6: SemanticTool 审计日志条目
 * 记录单次 SemanticTool 调用的完整信息，用于 C 组实验论文分析。
 */
export interface SemanticAuditEntry {
  /** 调用轮次 */
  round: number;
  /** 任务类型：evidence_dedup | gap_analysis */
  task: string;
  /** 触发的 δ 指标（仅 gap_analysis） */
  triggeredDeltas?: string[];
  /** 输入项数（evidence_dedup: 待判定的未分享证据数；gap_analysis: 未分享证据的 agent 数） */
  inputCount: number;
  /** 返回的 cluster 数（evidence_dedup）或 criticalItems 数（gap_analysis） */
  outputCount: number;
  /** 验证通过的 cluster 数（仅 evidence_dedup：supports 一致的 cluster） */
  validatedClusters?: number;
  /** 被否决的 cluster 数（仅 evidence_dedup：supports 不一致的 cluster） */
  rejectedClusters?: number;
  /** 调用是否成功（false 表示抛出异常或返回 null） */
  success: boolean;
  /** 耗时 ms */
  latencyMs: number;
  /** 错误信息（success=false 时） */
  error?: string;
}

// ============================================================================
// Thermo State
// ============================================================================

/**
 * 群体动态筛查指标（ROADMAP_V5: 操作化启发式，非物理量）。
 *
 * R/T/H/F 是零成本筛查信号，从标量立场汇总（statedStance）确定性计算。
 * 它们不声称热力学自由能——F 是操作化综合失序指标，工程价值在于
 * 把四维压缩到一个标量便于异常检测。
 *
 * R/T/H 在小群体 MAS 中强相关（r=0.917）是结构性特征，而非 bug。
 */
export interface ThermoState {
  /** 方向对齐度 [0, 1] — 群体标量立场的方向一致性 */
  R: number;
  /** 强度分散度 [0, 1] — 标量立场的离散程度 */
  T: number;
  /** 分布形状 [0, 1] — 标量立场分布的信息熵 */
  H: number;
  /** 操作化综合失序指标 F = (1-R) + T·H */
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

  /**
   * v6: SemanticTool 审计日志
   * 记录每次 SemanticTool 调用的 task、round、调用结果、验证通过率、降级情况。
   * 用于 C 组实验论文分析（Tier 3 触发率、验证通过率、降级率）。
   */
  private semanticAuditLog: SemanticAuditEntry[] = [];

  /** 上次 evidence_dedup 时的未共享证据数——用于"新增证据才去重"门控（避免每轮无条件调 LLM） */
  private lastSemanticDedupUnsharedCount: number | undefined = undefined;

  /** evidence_dedup 本 run 已调用次数——频率限制门控（2026-08-03 修复） */
  private semanticDedupCallCount = 0;

  // ==========================================================================
  // Social Thermodynamics
  // ==========================================================================

  /**
   * 从 5 变量认知状态计算热力学状态 (R, T, H, F)。
   *
   * v3.2.1 修正（2026-07-26）：三维度计算全部重写，修复 v3.2 的失真问题。
   *
   * 语义映射（v3.2.1）：
   *   R (共识度) ← Utility 向量平均 cosine 相似度，归一化到 [0,1]
   *   T (温度)   ← Utility 逐轮 L2 距离的归一化均值（真正反映信念波动）
   *   H (熵)     ← Evidence items 的 supports 分布的归一化 Shannon 熵
   *   F (修正自由能) = U - T·H
   *
   * v3.2 → v3.2.1 修正原因：
   * - R 旧实现用 topChoice 熵，N=5 时只有 0/0.03/0.28/1 几个离散值，分辨率过粗。
   *   新实现用 cosine 相似度，能捕捉 utility 向量级的细微差异。
   * - T 旧实现用 1-mean(stabilityBased)，但 stabilityBased 来自 LLM 自报 confidence
   *   的逐轮差值，LLM 倾向给高 confidence（85-95），导致 T 要么恒≈0，要么因初始值异常跳到 0.5。
   *   新实现用 utility 向量逐轮 L2 距离，真正反映信念波动。
   * - H 旧实现用 shannonEntropy(coverage)，但 coverage 受 GLOBAL_INFO_POOL_SIZE=10
   *   硬编码影响，V2 任务有 25 条信息时 3 轮后 coverage 饱和到 1.0，H 恒=0。
   *   新实现用 evidence items 的 supports 分布，直接反映证据覆盖的选项多样性。
   *
   * v0.4.3 修正自由能（F 解耦）：
   * - 旧 F=(1-R)+T·H 与 R/T/H 强耦合（验证 r=0.917），无法独立解释承诺失序度。
   * - 新 F=U-T·H 三变量解耦（验证 r=0.274）：
   *   U = 平均效用强度（‖u_i‖ 的均值，衡量群体偏好清晰度）
   *   T = Utility 波动度（已计算）
   *   S = H = 证据多样性熵（已计算）
   * - F 不参与任何决策阈值（TerminationDecider/δ 诊断都不读 F），仅用于诊断分析。
   *   因此本替换不影响运行路径，只让诊断指标更可解释。
   *
   * 注意：此 R/T/H 与 asyncEngine.ts 的 R/T/H 是不同的实现。
   * - asyncEngine.ts 基于 scalar beliefs，用于 TerminationDecider 和论文已 claim 的结论。
   * - 此处基于 5 变量认知状态，用于 NativeCognitiveEngine 和 cognitive 治理模式的机制解释。
   *
   * @returns ThermoState，若 cognitiveStates 为空则返回全零
   */
  /**
   * 计算热力学状态（v6 重定义）。
   *
   * ⚠️ R/T/H 在 v6 中基于认知状态向量重定义，与旧路径（asyncEngine，belief 相位）含义不同：
   *   - R: utility 向量 cosine 对齐（旧：Kuramoto 序参量 |Σe^(iθ)|/N）
   *   - T: utility 逐轮波动（旧：belief 总体标准差）
   *   - H: evidence supports 分布熵（旧：belief 5-bin Shannon 熵）
   *   - F = U - T·H（Helmholtz 形式；旧：F = (1-R) + T·H）
   */
  computeThermoState(): ThermoState {
    const states = Array.from(this.cognitiveStates.values());
    if (states.length === 0) return { R: 0, T: 0, H: 0, F: 0 };

    // ── R: Utility 向量平均 cosine 相似度（归一化到 [0,1]）──
    const R = this.computeUtilityAlignment(states);

    // ── T: Utility 逐轮 L2 距离的归一化均值 ──
    const T = this.computeUtilityVolatility(states);

    // ── H: Evidence items 的 supports 分布的归一化 Shannon 熵 ──
    const H = this.computeEvidenceDiversity(states);

    // ── F = U - T·H（v0.4.3 修正自由能，Helmholtz 形式，三变量解耦）──
    // U: 平均效用强度 = mean(‖u_i‖)，L2 范数归一化到 [0,1]（每维已 clamp 到 [-1,1]，
    //    L2 范数上限为 √K，除以 √K 归一化）
    // T: 效用波动（computeUtilityVolatility）；H: 证据熵（computeEvidenceDiversity）
    // 注：S 不再单列——熵分量即 H，F = U - T·H（消除冗余符号 S）
    const K = states[0]?.utility.scores ? Object.keys(states[0].utility.scores).length : 1;
    const sqrtK = Math.sqrt(Math.max(1, K));
    const U = states.reduce((sum, s) => {
      const scores = Object.values(s.utility.scores);
      const norm = Math.sqrt(scores.reduce((ss, v) => ss + v * v, 0)); // L2 范数
      return sum + norm / sqrtK;
    }, 0) / states.length;
    const F = U - T * H;

    return { R, T, H, F };
  }

  /**
   * 计算 Utility 对齐度（R 的子计算）— v3.2.1 重写。
   *
   * R = (avg_cosine_similarity + 1) / 2
   * - 所有 agent utility 向量方向一致 → R = 1（完全共识）
   * - agent utility 向量正交 → R = 0.5（无相关）
   * - agent utility 向量方向相反 → R = 0（完全分歧）
   *
   * 相比 v3.2 的 topChoice 熵：
   * - 分辨率从 {0, 0.03, 0.28, 1} 提升到连续值
   * - 能捕捉"topChoice 相同但 utility 结构不同"的情况
   * - 与 Kuramoto R 的"方向一致"语义对齐
   */
  private computeUtilityAlignment(states: AgentCognitiveState[]): number {
    if (states.length <= 1) return 1;

    // 收集所有选项（并集），排序以确保向量顺序一致
    const allOptions = new Set<string>();
    for (const s of states) {
      for (const key of Object.keys(s.utility.scores)) {
        allOptions.add(key);
      }
    }
    const options = Array.from(allOptions).sort();
    if (options.length === 0) return 1;

    // 提取每个 agent 的 utility 向量（按 options 顺序，缺失项为 0）
    const vectors = states.map(s =>
      options.map(opt => s.utility.scores[opt] ?? 0),
    );

    // 计算所有 agent 对的 cosine 相似度
    let sumCos = 0;
    let pairCount = 0;
    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        const cos = this.cosineSimilarity(vectors[i], vectors[j]);
        sumCos += cos;
        pairCount++;
      }
    }

    if (pairCount === 0) return 1;

    // 归一化到 [0, 1]：(avg_cos + 1) / 2
    const avgCos = sumCos / pairCount;
    return (avgCos + 1) / 2;
  }

  /**
   * 计算 cosine 相似度（R 的子计算）。
   * 当任一向量范数为 0 时返回 0（正交，R=0.5）。
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    if (len === 0) return 0;

    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * 计算 Utility 波动度（T 的子计算）— v3.2.1 新增。
   *
   * T = mean_i( ||u_i(t) - u_i(t-1)|| / (2*sqrt(K)) )
   *
   * - 第一轮无历史 → T=0（系统稳定）
   * - utility 向量逐轮剧烈变化 → T→1（系统高温）
   * - utility 向量逐轮不变 → T=0（系统冻结）
   *
   * 相比 v3.2 的 1-mean(stabilityBased)：
   * - 不依赖 LLM 自报 confidence（避免 overconfidence 偏差）
   * - 直接衡量 utility 向量变化幅度（真正的"信念波动"）
   * - 归一化到 [0,1]：utility ∈ [-1,1]^K，最大 L2 距离 = 2*sqrt(K)
   */
  private computeUtilityVolatility(states: AgentCognitiveState[]): number {
    if (states.length === 0) return 0;

    let totalVolatility = 0;
    let count = 0;

    for (const state of states) {
      const history = state.utilityHistory;
      // H5 修复后：history 最后一项是"本轮更新后"的 scores，
      // 倒数第二项是"上一轮更新后"的 scores。
      // 需要至少 2 项历史才能计算波动。
      if (history.length < 2) continue;

      const currentScores = history[history.length - 1].scores;
      const prevScores = history[history.length - 2].scores;

      const allKeys = new Set([...Object.keys(currentScores), ...Object.keys(prevScores)]);
      let sumSq = 0;
      for (const key of allKeys) {
        const diff = (currentScores[key] ?? 0) - (prevScores[key] ?? 0);
        sumSq += diff * diff;
      }
      const dist = Math.sqrt(sumSq);

      // 归一化：utility ∈ [-1,1]^K，最大 L2 距离 = 2*sqrt(K)
      const maxDist = 2 * Math.sqrt(allKeys.size);
      const normalizedDist = maxDist > 0 ? Math.min(1, dist / maxDist) : 0;

      totalVolatility += normalizedDist;
      count++;
    }

    return count > 0 ? totalVolatility / count : 0;
  }

  /**
   * 计算 Evidence 多样性（H 的子计算）— v3.2.1 重写。
   *
   * H = ShannonEntropy(supports 分布) / log2(|unique supports|)
   * - 所有 evidence 支持同一选项 → H=0（低多样性，可能回声室）
   * - evidence 均匀支持所有选项 → H=1（高多样性，信息全面）
   * - 无 evidence → H=0
   *
   * 相比 v3.2 的 shannonEntropy(coverages)：
   * - 不依赖 GLOBAL_INFO_POOL_SIZE 硬编码（避免 coverage 饱和）
   * - 直接反映证据覆盖的选项多样性（真正的"信息结构多样性"）
   * - 对任务规模自适应（无需手动调参）
   */
  private computeEvidenceDiversity(states: AgentCognitiveState[]): number {
    if (states.length === 0) return 0;

    // 收集所有 agent 的 evidence items 的 supports
    const supportCounts = new Map<string, number>();
    let totalItems = 0;

    for (const state of states) {
      for (const item of state.evidence.items) {
        const supports = item.supports || "unknown";
        supportCounts.set(supports, (supportCounts.get(supports) ?? 0) + 1);
        totalItems++;
      }
    }

    if (totalItems === 0) return 0; // 无证据

    // 计算 supports 分布的归一化 Shannon 熵
    let entropy = 0;
    for (const count of supportCounts.values()) {
      const p = count / totalItems;
      entropy -= p * Math.log2(p);
    }
    const maxEntropy = Math.log2(supportCounts.size);
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  /**
   * 计算单个 agent 的 evidence items 多样性（v3.2.1 修复）。
   *
   * 与 computeEvidenceDiversity（群体 H 熵）算法一致，但仅对单 agent 的 items 计算。
   * 用于 updateCognitiveStatesNative 中 evidence.diversity 字段——v3.2 bug 修复：
   * 旧实现 diversity 恒为 currentState.evidence.diversity（初始 0.5），从未更新。
   *
   * - 所有 evidence 支持同一选项 → diversity=0（低多样性，可能回声室）
   * - evidence 均匀支持多个选项 → diversity→1（高多样性，信息全面）
   * - 无 evidence → diversity=0
   */
  private computeEvidenceDiversityFromItems(items: EvidenceItem[]): number {
    if (items.length === 0) return 0;

    const supportCounts = new Map<string, number>();
    for (const item of items) {
      const supports = item.supports || "unknown";
      supportCounts.set(supports, (supportCounts.get(supports) ?? 0) + 1);
    }

    let entropy = 0;
    for (const count of supportCounts.values()) {
      const p = count / items.length;
      entropy -= p * Math.log2(p);
    }
    const maxEntropy = Math.log2(supportCounts.size);
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  // ==========================================================================
  // X/N Variables (ROADMAP_V5: 信息曝光度与新颖度)
  // ==========================================================================
  //
  // 替代旧 E.coverage 指标（需要预定义 GLOBAL_INFO_POOL_SIZE，部署不可行）。
  // X 和 N 基于集体证据池（CEP）动态计算，无需预定义信息总量。
  //
  // 语义：
  //   X（曝光度）= agent 已接触的证据在集体中的占比（信息传播度量）
  //   N（新颖度）= 本轮 agent 新增证据的占比（信息觅食效率）
  //

  /**
   * 计算集体证据池（Collective Evidence Pool）。
   *
   * CEP = 所有 agent 在讨论中已表达的 evidence items 的并集。
   * 使用 evidence.content 作为去重键。
   */
  computeCollectiveEvidencePool(): Set<string> {
    const cep = new Set<string>();
    for (const state of this.cognitiveStates.values()) {
      for (const item of state.evidence.items) {
        if (item.content) {
          cep.add(item.content);
        }
      }
    }
    return cep;
  }

  /**
   * 计算信息曝光度 X_i。
   *
   * X_i = |agent_i 已接触的证据 ∩ CEP| / |CEP|
   *
   * 语义：不是"agent 知道多少"，而是"agent 在集体讨论中听到了多少"。
   * 高 X 表示 agent 充分接触了集体中的信息；低 X 表示信息隔离。
   *
   * @returns X ∈ [0, 1]，若 CEP 为空则返回 0
   */
  computeExposure(agentId: string): number {
    const cep = this.computeCollectiveEvidencePool();
    if (cep.size === 0) return 0;

    const state = this.cognitiveStates.get(agentId);
    if (!state) return 0;

    const agentContent = new Set(
      state.evidence.items.map(item => item.content).filter(Boolean),
    );
    const intersection = new Set([...agentContent].filter(x => cep.has(x)));
    return intersection.size / cep.size;
  }

  /**
   * 计算所有 agent 的曝光度均值。
   */
  computeMeanExposure(): number {
    const agentIds = Array.from(this.cognitiveStates.keys());
    if (agentIds.length === 0) return 0;
    const sum = agentIds.reduce((s, id) => s + this.computeExposure(id), 0);
    return sum / agentIds.length;
  }

  /**
   * 计算信息新颖度 N_i(t)。
   *
   * N_i(t) = 本轮新增去重证据数 / 累计证据数
   *
   * 语义：agent 本轮获取了多少"新"信息（此前未接触过的证据）。
   * 高 N 表示 agent 在积极觅食新信息；低 N 表示信息摄入停滞。
   *
   * @param round 当前轮次（用于获取上一轮历史）
   * @returns N ∈ [0, 1]，首轮默认返回 1
   */
  computeNovelty(agentId: string, round: number): number {
    const state = this.cognitiveStates.get(agentId);
    if (!state) return 0;

    const prevHistory = this.getCognitiveStateHistory(round - 1);
    const prevState = prevHistory.get(agentId);

    if (!prevState) return 1; // 首轮：所有证据都是新的

    const prevContent = new Set(
      prevState.evidence.items.map(item => item.content).filter(Boolean),
    );
    const currentContent = new Set(
      state.evidence.items.map(item => item.content).filter(Boolean),
    );

    if (currentContent.size === 0) return 0;

    const newItems = [...currentContent].filter(x => !prevContent.has(x));
    return newItems.length / currentContent.size;
  }

  /**
   * 计算所有 agent 的新颖度均值。
   */
  computeMeanNovelty(round: number): number {
    const agentIds = Array.from(this.cognitiveStates.keys());
    if (agentIds.length === 0) return 0;
    const sum = agentIds.reduce((s, id) => s + this.computeNovelty(id, round), 0);
    return sum / agentIds.length;
  }

  // ==========================================================================
  // Cognitive State Access
  // ==========================================================================

  /** 获取当前所有 agent 的认知状态 */
  getCognitiveStates(): Map<string, AgentCognitiveState> {
    return new Map(this.cognitiveStates);
  }

  /**
   * v6: 获取 SemanticTool 审计日志（C 组实验论文分析用）。
   * 包含 evidence_dedup 和 gap_analysis 两种调用的完整记录。
   */
  getSemanticAuditLog(): SemanticAuditEntry[] {
    return [...this.semanticAuditLog];
  }

  /**
   * v3.2: 直接设置认知状态（供 GovernanceRuntime cognitive 模式使用）。
   *
   * 当外部 runtime 从 DiscussionMessage 构建了认知状态后，
   * 通过此方法注入到 MeasurementLayer，使检测器和热力学计算能读取。
   * 注意：会完全替换当前 cognitiveStates。
   */
  setCognitiveStates(states: Map<string, AgentCognitiveState>): void {
    this.cognitiveStates = new Map(states);
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

    // H3 修复（Phase 2.9）：清空上一轮的 governancePrompts，防止跨轮污染。
    // 上一轮的 prompts 已在本轮 runRound 的 buildPrompt 中被消费，
    // 此处清空后由 Step 1 的 pendingModifications 生成新一轮的 prompts。
    this.governancePrompts.clear();

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

    // ── Step 5: v6 行为事件检测（驱动 ProgressiveEstimator）──
    // 必须在状态更新后调用，因为 detectBehaviorEvents 需要读取
    // 更新后的 utilityHistory 来检测 stance flip 和 exposure response。
    const refutationMap = new Map<string, boolean>();
    const refutedAgents = this.detectRefutedAgents(opinions);
    for (const agent of agents) {
      refutationMap.set(agent.id, refutedAgents.has(agent.id));
    }

    const interventionTargets = new Map<string, boolean>();
    if (options.pendingModifications) {
      for (const [agentId] of options.pendingModifications) {
        if (agentId !== "__governance__") {
          interventionTargets.set(agentId, true);
        }
      }
    }

    detectBehaviorEvents(this.cognitiveStates, round, refutationMap, interventionTargets);

    // ── Step 6: v6 跨 agent evidence 共享标记（Layer 1: 数学匹配）──
    this.markEvidenceSharing();

    return result;
  }

  /**
   * Layer 1: 跨 agent evidence 共享标记（纯数学匹配，零成本）。
   *
   * 对每个 agent 的每条 evidence，检查其他 agent 的 evidence 中是否存在
   * content 子串匹配或 Levenshtein 距离接近的条目。
   * 匹配成功 → shared = true（信息已进入讨论）。
   * 匹配失败 → shared = false（独有信息，可能被忽视）。
   *
   * 局限：同义改写（"财务不稳定" vs "资产负债率高"）会漏检。
   * Layer 2（SemanticTool）在异步路径中补判这些边缘情况。
   */
  markEvidenceSharing(): void {
    const states = Array.from(this.cognitiveStates.values());
    if (states.length < 2) return;

    // 收集所有 agent 的 evidence items，按 agent 分组
    const allItems: Array<{ agentId: string; item: EvidenceItem }> = [];
    for (const state of states) {
      for (const item of state.evidence.items) {
        allItems.push({ agentId: state.agentId, item });
      }
    }

    // 对每条 evidence，检查其他 agent 是否有匹配
    for (const { agentId, item } of allItems) {
      // 已经标记为 shared 的跳过（之前轮次已匹配）
      if (item.shared) continue;

      const contentLower = item.content.toLowerCase().trim();
      if (contentLower.length < 3) {
        // 太短的文本直接标记为 shared（无法可靠匹配）
        item.shared = true;
        continue;
      }

      for (const other of allItems) {
        if (other.agentId === agentId) continue; // 不与自己比较
        if (other.item.id === item.id) continue;

        // H6 修复（Phase 2.9）：supports 一致性验证。
        // 文本相似但支持不同选项的证据不应被视为"已共享"，
        // 否则跨选项误判会不可逆地污染 δ_evidence_silence 的输入。
        if (item.supports && other.item.supports && item.supports !== other.item.supports) {
          continue;
        }

        const otherContent = other.item.content.toLowerCase().trim();

        // 匹配策略 1: 子串匹配（一方包含另一方）
        if (contentLower.includes(otherContent) || otherContent.includes(contentLower)) {
          item.shared = true;
          break;
        }

        // 匹配策略 2: Levenshtein 距离归一化 < 0.3
        const maxLen = Math.max(contentLower.length, otherContent.length);
        if (maxLen > 0) {
          const dist = levenshtein(contentLower, otherContent);
          const normalized = dist / maxLen;
          if (normalized < 0.3) {
            item.shared = true;
            break;
          }
        }
      }
    }
  }

  /**
   * Layer 2: SemanticTool evidence 语义去重（批量补判）。
   *
   * 收集 Layer 1 未匹配的 evidence items，一次 LLM 调用批量判断语义等价性。
   * 确定性验证器：supports 字段不同的对强制否决（防止跨选项误匹配）。
   * 通过 → shared = true。
   *
   * 仅在异步路径（diagnoseAndSuggest）中调用。
   */
  async markEvidenceSharingSemantic(llmConfig: LLMConfig, round: number = 0): Promise<void> {
    const states = Array.from(this.cognitiveStates.values());
    if (states.length < 2) return;

    // 收集所有未匹配（shared=false）的 evidence items
    const unsharedItems: Array<{ id: string; content: string; supports: string; agentId: string }> = [];
    for (const state of states) {
      for (const item of state.evidence.items) {
        if (!item.shared) {
          unsharedItems.push({
            id: item.id,
            content: item.content,
            supports: String(item.supports),
            agentId: state.agentId,
          });
        }
      }
    }

    if (unsharedItems.length < 2) return;

    // ── 门控 1（内部）：仅在"有新增未共享证据"时调用 evidence_dedup ──
    // 若本轮未共享数 ≤ 上次调用时（无新证据），跳过——避免每轮无条件调 LLM（分层成本设计）。
    // 只有出现新证据才重新去重；上次去重若已标记部分 shared，未共享数减少也跳过（非新证据）。
    if (this.lastSemanticDedupUnsharedCount !== undefined && unsharedItems.length <= this.lastSemanticDedupUnsharedCount) {
      return;
    }

    // ── 门控 2（频率限制，2026-08-03 修复）──
    // hidden-profile 任务中 agent 每轮产生新证据 → 门控 1 的"未共享数创新高"永远成立 →
    // 每轮都调用 LLM。实测审计日志：C 组每 run 在 round 2-5 各调 1 次，输入从 31 条涨到
    // 88 条，但输出 cluster 数稳定在 12-17——新增证据几乎无重复，去重收益极低。
    // 修复：每 run 最多调用 MAX_SEMANTIC_DEDUP_CALLS 次（首次去重 + 一轮后续），
    // 超出后不再调用，避免每轮支付全量重扫的 LLM 成本。
    if (this.semanticDedupCallCount >= MAX_SEMANTIC_DEDUP_CALLS) {
      return;
    }
    this.semanticDedupCallCount += 1;
    this.lastSemanticDedupUnsharedCount = unsharedItems.length;

    // 调用 SemanticTool evidence_dedup
    const callStart = Date.now();
    let result;
    let success = true;
    let errorMsg: string | undefined;
    try {
      result = await semanticConsult({
        task: "evidence_dedup",
        items: unsharedItems.map(i => ({ id: i.id, content: i.content })),
      }, llmConfig);
    } catch (err) {
      success = false;
      errorMsg = err instanceof Error ? err.message : String(err);
    }
    const latencyMs = Date.now() - callStart;

    // 审计日志：记录调用结果
    const clusters = result?.clusters ?? [];
    let validatedClusters = 0;
    let rejectedClusters = 0;

    if (success && clusters.length > 0) {
      // 构建 item ID → supports 映射，用于验证器
      const itemSupports = new Map<string, string>();
      for (const item of unsharedItems) {
        itemSupports.set(item.id, item.supports);
      }

      // 遍历 clusters，标记语义等价的 evidence 为 shared
      for (const cluster of clusters) {
        if (cluster.itemIds.length < 2) continue;

        // 确定性验证器：同一 cluster 内的 items 必须支持同一选项
        const supportsSet = new Set<string>();
        for (const itemId of cluster.itemIds) {
          const supports = itemSupports.get(itemId);
          if (supports) supportsSet.add(supports);
        }

        // 如果 cluster 内 items 支持不同选项，否决整个 cluster
        if (supportsSet.size > 1) {
          rejectedClusters++;
          continue;
        }
        validatedClusters++;

        // 标记为 shared
        for (const itemId of cluster.itemIds) {
          const [agentId] = itemId.split("_ev_");
          const state = this.cognitiveStates.get(agentId);
          if (state) {
            const item = state.evidence.items.find(i => i.id === itemId);
            if (item) item.shared = true;
          }
        }
      }
    }

    this.semanticAuditLog.push({
      round,
      task: "evidence_dedup",
      inputCount: unsharedItems.length,
      outputCount: clusters.length,
      validatedClusters,
      rejectedClusters,
      success,
      latencyMs,
      error: errorMsg,
    });
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
        opinion?.structuredEvidence,
      );
      const allItems = [...currentState.evidence.items, ...evidenceItems];
      const evidence: Evidence = {
        coverage: currentState.evidence.coverage,
        quality: currentState.evidence.quality,
        // v3.2.1 修复：从 items 的 supports 分布计算，与 native mode 对齐
        // 旧实现恒为 currentState.evidence.diversity（初始 0.5），从未更新
        diversity: this.computeEvidenceDiversityFromItems(allItems),
        recentGain: evidenceItems.length > 0
          ? evidenceItems.length / Math.max(1, allItems.length)
          : 0,
        items: allItems,
      };

      // Confidence: 从 evidence + LLM 自报（shrinkage 校准，与 native 模式一致）
      // v6 修复：stated 必须是 LLM 自报 confidence（0-100 → 0-1），不能用 evidenceBased。
      // 否则 δ_confidence_gap（检查 stated >= 0.8）在 evidence 弱时永远不触发，检测器实质失效。
      const nativeConfidence = opinion?.confidence !== undefined
        ? opinion.confidence / 100
        : currentState.confidence.overall;
      const evidenceBased = evidence.quality * evidence.coverage;
      const stabilityBased = 1 - Math.abs(nativeConfidence - currentState.confidence.overall);
      // shrinkage：融合系统 evidenceBased 与 LLM rawConfidence，抑制 overconfidence
      const CALIBRATION_W_SYSTEM = 0.4;
      const CALIBRATION_W_LLM = 0.6;
      const calibratedOverall = CALIBRATION_W_SYSTEM * evidenceBased + CALIBRATION_W_LLM * nativeConfidence;
      const confidence: Confidence = {
        estimate: Math.max(0, Math.min(1, calibratedOverall)),
        confidence: 0.10,
        stated: Math.max(0, Math.min(1, nativeConfidence)),
        stability: stabilityBased,
        sourceWeights: { stated: CALIBRATION_W_LLM, stability: CALIBRATION_W_SYSTEM },
        overall: Math.max(0, Math.min(1, calibratedOverall)),
        evidenceBased: Math.max(0, Math.min(1, evidenceBased)),
        stabilityBased,
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
      // H5 修复（Phase 2.9）：追加更新后的 utility.scores 而非更新前的 currentState.utility.scores，
      // 确保 δ_stance_flip/δ_consistency 检测的是本轮的变化而非上一轮的。
      const utilityHistory = [
        ...currentState.utilityHistory,
        { round, scores: { ...utility.scores } },
      ].slice(-10);

      this.cognitiveStates.set(agentId, {
        agentId,
        agentName: agent.name,
        agentRole: agent.role,
        utility,
        evidence,
        inertia,
        confidence,
        susceptibility: currentState.susceptibility,
        behaviorEvents: currentState.behaviorEvents,
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
        opinion?.structuredEvidence,
      );
      const allItems = [...currentState.evidence.items, ...evidenceItems];
      const evidence: Evidence = {
        coverage: nativeCS?.evidenceCoverage ?? currentState.evidence.coverage,
        quality: nativeCS?.evidenceQuality ?? currentState.evidence.quality,
        // v3.2.1 修复：从 items 的 supports 分布计算，旧实现恒为 currentState.evidence.diversity
        diversity: this.computeEvidenceDiversityFromItems(allItems),
        recentGain: evidenceItems.length > 0
          ? evidenceItems.length / Math.max(1, allItems.length)
          : 0,
        items: allItems,
      };

      // ── Confidence: shrinkage 校准（v3.2.1 新增）──
      // 前沿经验：RLHF 后的 LLM 普遍 overconfident（GPT-4o-mini 66.7% 错误发生在 >80% confidence）。
      // 标准 Platt scaling 需要 ground truth 标签，但开放讨论无"正确答案"。
      // 务实方案：将 LLM 自报 confidence（rawConfidence）与系统客观计算的 evidenceBased
      // 做加权融合（shrinkage toward system prior），抑制 overconfidence 偏差。
      //
      // 公式：overall = w_system * evidenceBased + w_llm * rawConfidence
      // 默认 w_system=0.4, w_llm=0.6（保留 LLM 元认知信号为主，系统客观信号为辅校准）
      //
      // 参考：
      // - Platt et al. 1999 (Platt scaling)
      // - Guo et al. 2017 (Temperature scaling)
      // - Luo et al. 2025 (DACA, unsupervised confidence calibration for PoLMs)
      const nativeConfidence = opinion?.confidence !== undefined
        ? opinion.confidence / 100
        : currentState.confidence.overall;
      const evidenceBased = evidence.quality * evidence.coverage;
      const stabilityBased = 1 - Math.abs(nativeConfidence - currentState.confidence.overall);
      // v3.2.1 shrinkage：融合系统 evidenceBased 与 LLM rawConfidence
      const CALIBRATION_W_SYSTEM = 0.4;
      const CALIBRATION_W_LLM = 0.6;
      const calibratedOverall = CALIBRATION_W_SYSTEM * evidenceBased + CALIBRATION_W_LLM * nativeConfidence;
      const confidence: Confidence = {
        estimate: Math.max(0, Math.min(1, calibratedOverall)),
        confidence: 0.10,
        stated: Math.max(0, Math.min(1, nativeConfidence)),
        stability: stabilityBased,
        sourceWeights: { stated: CALIBRATION_W_LLM, stability: CALIBRATION_W_SYSTEM },
        overall: Math.max(0, Math.min(1, calibratedOverall)),
        evidenceBased: Math.max(0, Math.min(1, evidenceBased)),
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
      // H5 修复（Phase 2.9）：同 native 模式，追加更新后的 utility.scores。
      const utilityHistory = [
        ...currentState.utilityHistory,
        { round, scores: { ...utility.scores } },
      ].slice(-10);

      this.cognitiveStates.set(agentId, {
        agentId,
        agentName: agent.name,
        agentRole: agent.role,
        utility,
        evidence,
        inertia,
        confidence,
        susceptibility: currentState.susceptibility,
        behaviorEvents: currentState.behaviorEvents,
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

      // ── 全局信息注入（key="*"）：所有 agent 可见 ──
      // 修复（2026-08-03）：inject_evidence 把目标 agent 的私有知识写为全局 prompt，
      // 让所有 agent 在 buildPrompt 中都能看到（index.ts:742-744 读取 "*"）。
      // 此分支在 cognitiveStates 查找之前处理，避免 "*" 被当作 agentId 而 continue。
      if (agentId === "*") {
        if (mod.injectPrompt) {
          const current = this.governancePrompts.get("*") ?? [];
          this.governancePrompts.set("*", [...current, mod.injectPrompt]);
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
        echoChamberThreshold: govConfig.echoChamberThreshold ?? COGNITIVE_ECHO_CHAMBER_THRESHOLD,
        polarizationThreshold: govConfig.polarizationThreshold ?? COGNITIVE_POLARIZATION_THRESHOLD,
        prematureConsensusThreshold: govConfig.prematureConsensusThreshold ?? COGNITIVE_PREMATURE_CONSENSUS_THRESHOLD,
        authorityBiasThreshold: govConfig.authorityBiasThreshold ?? COGNITIVE_AUTHORITY_BIAS_THRESHOLD,
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
      // v6: 优先使用 ProgressiveEstimator 渐进估计的 susceptibility（基于暴露事件），
      // 仅在不可用（暴露事件 < 2，短对话冷启动）时回退到旧公式 (1-I)(1-C)。
      const susceptibility = cs.susceptibility.usable
        ? cs.susceptibility.estimate
        : computeSusceptibility(cs.inertia, cs.confidence);

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
  // Thermo → δ → Intervention Pipeline (ROADMAP_V5 闭环)
  // ==========================================================================
  //
  // 双层架构的完整链路：
  //   1. 热力学筛查（computeThermoState）：R/T/H/F 零成本异常检测
  //   2. δ 诊断（computeDeltaDiagnosis）：仅异常轮次触发，定位根因
  //   3. 干预建议（δ triggers → InterventionType 映射）：定向干预
  //
  // 与旧 detector 系统（runDetectors）的区别：
  //   - 旧：6 个检测器独立运行，阈值硬编码，检测"异常"需价值判断
  //   - 新：5 个 δ 信号检测"矛盾"（对比可观测信号），无需 ground truth
  //

  /**
   * 运行 Thermo → δ → 干预 完整诊断链路（v6：集成 ProgressiveEstimator + SemanticTool）。
   *
   * 1. 计算热力学状态（R/T/H/F）
   * 2. 运行 ProgressiveEstimator（I/C/Λ 渐进估计）
   * 3. 运行 6 信号 δ 诊断（自适应阈值）
   * 4. δ 根因模糊时 → 调用 SemanticTool（Tier 3）
   * 5. δ 触发映射为干预建议
   *
   * @param round 当前轮次
   * @param llmConfig LLM 配置（SemanticTool 需要）
   * @returns δ 诊断结果 + 干预建议列表
   */
  async diagnoseAndSuggest(
    round: number,
    llmConfig?: LLMConfig,
  ): Promise<{ thermo: ThermoState; delta: DeltaDiagnosis; suggestions: DeltaInterventionSuggestion[] }> {
    const states = Array.from(this.cognitiveStates.values());
    const thermo = this.computeThermoState();

    // ── ProgressiveEstimator: I/C/Λ 渐进估计 ──
    const estimates = estimateAll(this.cognitiveStates, round);

    // ── 运行 δ 诊断（自适应阈值已在各 δ 函数内处理）──
    const delta = computeDeltaDiagnosis(states, thermo, estimates);

    // ── Layer 2: SemanticTool evidence 语义去重（批量补判 Layer 1 遗漏）──
    // 门控（成本优化）：仅在"信息类 δ 信号触发"时调用 evidence_dedup。
    // 修复前：markEvidenceSharingSemantic 在 δ 计算之前无条件尝试，内部"未共享数创新高"
    //   门控对 hidden-profile 任务失效（agent 每轮产生新证据→未共享数永远创新高→每轮调用 LLM），
    //   实测 C 组每 run 在 round 2-5 各调 1 次 evidence_dedup（输入 31-111 条），是 token 飙高主因。
    // 修复后：与 gap_analysis 对齐——信息类 δ（1D 遮蔽/证据沉默/确信度缺口）触发才值得语义去重，
    //   否则本轮无信息异常，去重收益不抵 LLM 成本。
    if (llmConfig && this.shouldDedupByDelta(delta)) {
      await this.markEvidenceSharingSemantic(llmConfig, round);
    }

    // ── δ triggers → 干预建议 ──
    const suggestions: DeltaInterventionSuggestion[] = this.buildDeltaSuggestions(delta, states, thermo, round);

    // ── Tier 3: 根因模糊 → SemanticTool ──
    // 2026-08-03 修复：与 evidence_dedup 门控对称——无 llmConfig 时不调用。
    // 旧实现只查 shouldConsultSemanticTool(delta)，未检查 llmConfig，导致
    // useSemanticTool=true 但未 setLlmConfig 的调用方在 δ 触发时静默产生
    // 无配置的 LLM 调用（semanticConsult 用 {...undefined} 展开后 callLLM）。
    if (llmConfig && this.shouldConsultSemanticTool(delta, round)) {
      const enhancedSuggestions = await this.consultSemanticTool(delta, states, thermo, round, llmConfig);
      if (enhancedSuggestions.length > 0) {
        // C1 修复（Phase 2.9）：合并而非替换。
        // SemanticTool 主要增强 inject_evidence（信息层干预），
        // 数学层的 rebalance_attention（结构层干预）必须保留，否则丢失关键干预。
        const mathLayerKept = suggestions.filter(s => s.type !== "inject_evidence");
        return { thermo, delta, suggestions: [...mathLayerKept, ...enhancedSuggestions] };
      }
    }

    return { thermo, delta, suggestions };
  }

  /** 判断是否应触发 SemanticTool */
  private shouldConsultSemanticTool(delta: DeltaDiagnosis, _round: number): boolean {
    // 条件 1：δ_1d_mask 触发（可能需要语义去重定位信息缺口）
    if (delta.oneDMask.triggered) return true;

    // 条件 2：多个 δ 同时触发且建议的干预类型冲突
    const triggeredCount = [
      delta.polarization, delta.oneDMask, delta.evidenceSilence,
      delta.confidenceGap, delta.stanceFlip, delta.noResponse,
    ].filter(d => d.triggered).length;
    if (triggeredCount >= 3) return true;

    // 条件 3：evidence_silence 触发（可能需要 LLM 判断哪些证据被忽视）
    if (delta.evidenceSilence.triggered && delta.oneDMask.triggered) return true;

    return false;
  }

  /**
   * 判断是否应调用 evidence_dedup（成本门控）。
   *
   * evidence_dedup 的职责是"批量判定 Layer 1 未匹配证据的语义等价性"，
   * 只有当存在信息类异常时才值得调用 LLM：
   *   - δ_1d_mask：标量共识掩盖向量分歧 → 可能需去重定位被忽略的证据
   *   - δ_evidence_silence：证据被系统性忽视 → 需确认是否因重复而被忽略
   *   - δ_confidence_gap：自报高确信但效用偏离 → 可能引用了重复证据支撑
   *
   * 修复前：每次 diagnoseAndSuggest 都尝试调用（靠内部"未共享数创新高"门控），
   * 但 hidden-profile 任务中 agent 每轮产生新证据→未共享数永远创新高→每轮触发。
   */
  private shouldDedupByDelta(delta: DeltaDiagnosis): boolean {
    return delta.oneDMask.triggered
      || delta.evidenceSilence.triggered
      || delta.confidenceGap.triggered;
  }

  /** 调用 SemanticTool 获取增强建议 */
  private async consultSemanticTool(
    delta: DeltaDiagnosis,
    states: AgentCognitiveState[],
    thermo: ThermoState,
    round: number,
    llmConfig?: LLMConfig,
  ): Promise<DeltaInterventionSuggestion[]> {
    const suggestions: DeltaInterventionSuggestion[] = [];

    // ── 组装未分享证据 ──
    const unsharedEvidence = states.map(s => ({
      agent: s.agentName,
      items: s.evidence.items
        .filter(i => !i.shared)
        .map(i => ({ id: i.id, content: i.content })),
    })).filter(a => a.items.length > 0);

    if (unsharedEvidence.length === 0) return suggestions;

    const deltasTriggered = [
      delta.oneDMask.triggered ? `δ_1d_mask=${delta.oneDMask.value.toFixed(3)}` : "",
      delta.evidenceSilence.triggered ? `δ_evidence_silence=${delta.evidenceSilence.value.toFixed(2)}` : "",
      delta.confidenceGap.triggered ? `δ_confidence_gap` : "",
    ].filter(Boolean);

    // Gap analysis
    const callStart = Date.now();
    let gapResult;
    let success = true;
    let errorMsg: string | undefined;
    try {
      gapResult = await semanticConsult({
        task: "gap_analysis",
        deltasTriggered,
        groupState: `R=${thermo.R.toFixed(2)}, T=${thermo.T.toFixed(2)}, round=${round}`,
        unsharedEvidence,
      }, llmConfig);
    } catch (err) {
      success = false;
      errorMsg = err instanceof Error ? err.message : String(err);
    }
    const latencyMs = Date.now() - callStart;

    // 审计日志
    this.semanticAuditLog.push({
      round,
      task: "gap_analysis",
      triggeredDeltas: deltasTriggered,
      inputCount: unsharedEvidence.length,
      outputCount: gapResult?.criticalItems?.length ?? 0,
      success,
      latencyMs,
      error: errorMsg,
    });

    if (success && gapResult?.criticalItems && gapResult.criticalItems.length > 0) {
      for (const item of gapResult.criticalItems) {
        suggestions.push({
          type: "inject_evidence",
          targetAgents: item.suggestedRecipients,
          reason: `SemanticTool: ${item.reason}`,
          source: "δ_1d_mask→SemanticTool",
        });
      }
    }

    return suggestions;
  }

  /** 将 δ 触发映射为干预建议（纯数学路径） */
  private buildDeltaSuggestions(
    delta: DeltaDiagnosis,
    _states: AgentCognitiveState[],
    _thermo: ThermoState,
    _round: number,
  ): DeltaInterventionSuggestion[] {
    const suggestions: DeltaInterventionSuggestion[] = [];

    if (delta.oneDMask.triggered) {
      suggestions.push({
        type: "inject_evidence",
        targetAgents: [],
        reason: `δ_1d_mask=${delta.oneDMask.value.toFixed(3)}：标量共识掩盖向量分歧，注入差异性证据`,
        source: "δ_1d_mask",
      });
    }

    if (delta.evidenceSilence.triggered) {
      const silenced = delta.evidenceSilence.silencedAgents ?? [];
      suggestions.push({
        type: "rebalance_attention",
        targetAgents: silenced,
        reason: `δ_evidence_silence=${delta.evidenceSilence.value.toFixed(2)}：${silenced.join("、")} 的证据被系统性忽视`,
        source: "δ_evidence_silence",
      });
    }

    if (delta.stanceFlip.triggered) {
      suggestions.push({
        type: "inject_evidence",
        targetAgents: [],
        reason: `δ_stance_flip：多人立场翻转，注入稳定证据`,
        source: "δ_stance_flip",
      });
    }

    if (delta.noResponse.triggered) {
      const unresponsive = delta.noResponse.unresponsiveAgents ?? [];
      suggestions.push({
        type: "rebalance_attention",
        targetAgents: unresponsive,
        reason: `δ_no_response：${unresponsive.join("、")} 曾暴露于新证据但未响应`,
        source: "δ_no_response",
      });
    }

    if (delta.polarization.triggered) {
      suggestions.push({
        type: "inject_evidence",
        targetAgents: [],
        reason: `δ_polarization=${delta.polarization.value.toFixed(3)}：效用极化，注入桥接证据`,
        source: "δ_polarization",
      });
    }

    // H1 修复（Phase 2.9）：补充 3 个未映射的 δ 信号
    if (delta.confidenceGap.triggered) {
      const overconfident = delta.confidenceGap.overconfidentAgents ?? [];
      suggestions.push({
        type: "inject_evidence",
        targetAgents: overconfident,
        reason: `δ_confidence_gap=${delta.confidenceGap.value.toFixed(3)}：${overconfident.join("、")} 自报信心与 U 位置矛盾，注入挑战性证据`,
        source: "δ_confidence_gap",
      });
    }

    if (delta.concentration.triggered) {
      suggestions.push({
        type: "rebalance_attention",
        targetAgents: [],
        reason: `δ_concentration=${delta.concentration.value.toFixed(2)}：惯性集中在少数 agent 上，重新分配发言权给低惯性 agent`,
        source: "δ_concentration",
      });
    }

    if (delta.consistency.triggered) {
      suggestions.push({
        type: "inject_evidence",
        targetAgents: [],
        reason: `δ_consistency=${delta.consistency.value.toFixed(1)}：立场变化幅度与惯性预测矛盾，注入稳定证据`,
        source: "δ_consistency",
      });
    }

    return suggestions;
  }

  /**
   * @deprecated 自 v6 起使用 diagnoseAndSuggest()。保留用于向后兼容测试。
   */
  /** 旧版 diagnoseAndSuggest（同步版本，不使用 ProgressiveEstimator 或 SemanticTool） */
  diagnoseAndSuggestSync(
    round: number,
    config?: DeltaConfig,
  ): { thermo: ThermoState; delta: DeltaDiagnosis; suggestions: DeltaInterventionSuggestion[] } {
    const states = Array.from(this.cognitiveStates.values());
    const thermo = this.computeThermoState();
    const estimates = estimateAll(this.cognitiveStates, round);
    const delta = computeDeltaDiagnosis(states, thermo, estimates, config);

    const suggestions = this.buildDeltaSuggestions(delta, states, thermo, round);

    return { thermo, delta, suggestions };
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
    this.semanticAuditLog = [];
    // 2026-08-03 修复：重置 SemanticTool 门控状态，防止跨 run 污染——
    // 旧实现遗漏 lastSemanticDedupUnsharedCount，上一 run 结束时该值很大，
    // 下一 run 首几轮未共享数都 ≤ 它 → evidence_dedup 被永久跳过（饿死）。
    this.lastSemanticDedupUnsharedCount = undefined;
    this.semanticDedupCallCount = 0;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Levenshtein 距离（编辑距离），用于 evidence 文本模糊匹配。 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  let dpPrev = prev;
  let dpCurr = curr;

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    dpCurr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dpCurr[j] = Math.min(dpPrev[j] + 1, dpCurr[j - 1] + 1, dpPrev[j - 1] + cost);
    }
    [dpPrev, dpCurr] = [dpCurr, dpPrev];
  }

  return dpPrev[n];
}