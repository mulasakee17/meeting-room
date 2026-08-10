/**
 * SwarmAlpha Experimental Campaign — Shared Types
 *
 * 统一实验战役的类型定义，供所有 pipeline 组件使用。
 */

import type { GovernanceEstimate } from "../../src/lib/epistemic/semantics";
import type { ProgressiveEstimates } from "../../src/lib/thermodynamics/ProgressiveEstimator";
import type { TreatmentAssignment } from "../../src/lib/experimentation/assignment";
import type { GovernanceStudyContract } from "../../src/lib/experimentation/governanceStudy";
import type { GovernanceAuditTrail } from "../../src/lib/experimentation/governanceAuditTrail";
import type { FinalOutcomeArtifactV1 } from "../../src/lib/experimentation/finalOutcome";
import type { FinalElicitationCollectionArtifactV1 } from "../../src/lib/experimentation/finalElicitationAdapter";
import type {
  OperationalAnalysisUnitV1,
  OperationalOutcomeArtifactV1,
} from "../../src/lib/experimentation/operationalOutcome";
import type { PrimaryAssignmentManifestV1 } from "../../src/lib/experimentation/primaryAssignment";
import type {
  PrimaryArmExecutionBindingV1,
  PrimaryArmExecutionRegistryV1,
} from "../../src/lib/experimentation/primaryAssignmentExecution";
import type {
  InterventionApplicationReceipt,
  ProximalOutcomeRecord,
  TaskOutcomeRecord,
} from "../../src/lib/experimentation/lifecycle";

// ============================================================================
// Experiment Configuration
// ============================================================================

export type RuntimeMode = "belief" | "cognitive" | "native_cognitive";
export type GovernanceMode = "none" | "detect-only" | "full" | "diversity_only" | "cognitive";
export type ScenarioId = "ma" | "crisis" | "crisis_v2" | "supplier" | "invest" | "er_triage" | "fraud" | "university" | "hiddenbench" | "v6_binary";
export type LLMProvider = "qwen" | "gpt4o" | "deepseek";

/**
 * Whether a confirmatory analysis is safe to consume.
 *
 * Only `computed` carries inferential quantities. Every other status is a
 * fail-closed terminal state and MUST NOT be rendered as a zero-valued result.
 */
export type ConfirmatoryAnalysisStatus =
  | "computed"
  | "insufficient_data"
  | "legacy_mixed_excluded"
  | "invalid_data";

export interface ExperimentConfig {
  /** 实验 ID，如 "e1_stability" */
  id: string;
  /** 对应假设，如 "H1" */
  hypothesis: string;
  /** 实验标题 */
  title: string;
  /** 场景 */
  scenario: ScenarioId;
  /** HiddenBench 任务索引（0-64，仅 scenario="hiddenbench" 时使用；缺省跑第 1 个） */
  taskIndex?: number;
  /** HiddenBench prompt 风格："hint"（默认）提示信息不对称主动分享；"nohint" 对齐原论文主实验（不提示） */
  promptStyle?: "hint" | "nohint";
  /** 运行时模式 */
  runtimeModes: RuntimeMode[];
  /** 治理模式 */
  governanceMode: GovernanceMode;
  /** Agent 数量 */
  agentCount: number;
  /** 讨论轮数 */
  maxRounds: number;
  /** 运行次数 (per mode × per seed) */
  runsPerSeed: number;
  /** Seed 列表 */
  seeds: number[];
  /** LLM 模型 */
  llmModel: string;
  /** LLM temperature */
  temperature: number;
  /** 主实验还是验证实验 */
  isMain: boolean;
  /** 额外说明 */
  description: string;
  /**
   * CC-2: 显式声明的治理研究契约。缺省 = legacy/undeclared，绝不从 isMain、
   * governanceMode、arm 名、文件名或 description 推断。提供时必须在任何
   * LLM/provider 调用前通过 validateGovernanceStudyContract，并以其 structured
   * clone 原样写入 RawRunData。
   */
  governanceStudy?: GovernanceStudyContract;
  /** LLM 超时（毫秒），默认 30000。弱模型生成结构化 JSON 可能需要更长 */
  timeout?: number;
  /** Phase D: 每轮强制 devil's advocate（HiddenBench §6.4 静态协议） */
  staticDevilsAdvocate?: boolean;
  /**
   * 实验协议：控制讨论格式和评估方式。
   * - "swarmalpha"（默认）：同时发言 + 结构化 JSON + cognitive state + δ 治理
   * - "hiddenbench"：对齐 HiddenBench 参考协议——顺序 round-robin + 自由文本（1-2句）
   *   + pre/post 独立投票 + average/majority rule 评估
   */
  protocol?: "swarmalpha" | "hiddenbench";
  /** 终止策略；native 主实验默认 fixed_rounds，RHT/RHTF 仅作为显式消融。 */
  terminationPolicy?: "fixed_rounds" | "surface" | "rht_joint" | "rhtf_joint";
  /** v6: 是否启用 SemanticTool 异步路径（C 组实验专用）。
   *  true → NativeCognitiveEngine 走 applyCognitiveGovernanceAsync（Tier 1→2→3 含 LLM 语义传感器）。
   *  false 或未设置 → 走同步 applyCognitiveGovernance（纯数学 Tier 1→2）。 */
  useSemanticTool?: boolean;
  /** E10: 确定性共享证据池（State-Centric Evidence Pool）。
   *  enabled=true 时 NativeCognitiveEngine 注入去重事实池（零 LLM 调用）。
   *  对照无池基线，验证"结构化事实披露 vs prose 重放"的机制方向。 */
  evidencePool?: {
    enabled: boolean;
    /** agentId → dimension 映射（任务相关，hidden-profile 构造已知） */
    dimensions?: Record<string, string>;
    /** Jaccard char-bigram 相似度阈值（近似重复判定，默认 0.75） */
    similarityThreshold?: number;
    /** 池视图字符预算（默认 800，约 480 token） */
    maxChars?: number;
  };
}

// ============================================================================
// Raw Run Data
// ============================================================================

/** 单轮 cognitive state 快照 */
export interface CognitiveStateSnapshot {
  round: number;
  agentId: string;
  agentName: string;
  utility: Record<string, number>;
  utilityTopChoice: string;
  utilityPreferenceClarity: number;
  utilityIntensity: number;
  evidenceCoverage: number;
  evidenceQuality: number;
  evidenceDiversity: number;
  evidenceRecentGain: number;
  inertiaStrength: number;
  confidenceOverall: number;
  /**
   * @deprecated schema-1 兼容。schema-2 下恒等于 socialUpdateGain；
   *   绝不填入行为估计/公式值的逐轮混合。
   */
  susceptibility: number;
  /** DeGroot 社会更新增益 = max((1-I)(1-C), 0.05)。政策/模型系数。schema-2 必有。 */
  socialUpdateGain?: number;
  /** 行为易感性估计值（暴露-响应观测）；usable=false 时无 confirmatory 意义。schema-2 必有。 */
  behavioralSusceptibilityEstimate?: number;
  behavioralSusceptibilityConfidence?: number;
  behavioralSusceptibilityUsable?: boolean;
  /** ROADMAP_V5: 从 itemBeliefs 派生的标量立场汇总（stated stance） */
  statedStance: number;
  belief: number;
  oldConfidence: number;
  spokeThisRound: boolean;
  /** LLM itemBeliefs 中 rank=1 的 item（用于 Utility-Ranking Consistency 验证） */
  rankingTopChoice?: string;
}

/**
 * 原始数据 schema 版本（additive；旧文件无此字段，视为 1.0）。
 *
 * - "1.0"（缺省）：governanceEstimateHistory 记录无精确 input 快照，
 *   无法从记录本身重放，视为 legacy_unverifiable。
 * - "2.0"：governanceEstimateHistory 记录（若存在）含精确 input 快照。
 * - "3.0"：继承 2.0 的 replay contract，并要求新写入的 native macro
 *   snapshots 带 signal-set identity 和 canonical signal fields。
 * - "4.0"：继承 3.0，并要求 run 携带 pre-run treatment assignment identity
 *   与 governance lifecycle 记录（assignment → application receipt →
 *   task outcome）。2.0/3.0 仍可读，但不得进入 confirmatory governance ATE。
 */
export type RawSchemaVersion = "1.0" | "2.0" | "3.0" | "4.0" | "5.0";

/** 当前 Runner 写出的 schema 版本。两条写路径必须一致使用此常量。 */
export const RAW_SCHEMA_VERSION: RawSchemaVersion = "4.0";

/** Reserved for the explicit audit-trail bridge; current Runner must remain on 4.0. */
export const AUDITABLE_RAW_SCHEMA_VERSION = "5.0" as const;

/** Schema 2+ retain the exact estimator-input replay contract. */
export function hasReplayableEstimatorSchema(version: unknown): boolean {
  return version === "2.0" || version === "3.0" || version === "4.0" || version === "5.0";
}

export interface LegacyThermoSnapshot {
  round: number;
  R: number;
  T: number;
  H: number;
  F: number;
}

export interface CognitiveMacroSnapshotV1 extends LegacyThermoSnapshot {
  signalSetId: "swarmalpha.cognitive_macro";
  signalSetVersion: "1.0.0";
  reportedUtilityAlignment: number;
  updateVolatility: number;
  evidenceSupportEntropy: number;
  reportedUtilityIntensity: number;
  utilityVolatilityEntropyComposite: number;
}

/** 单次运行原始数据 */
export interface RawRunData {
  runId: string;
  experimentId: string;
  runtimeMode: RuntimeMode;
  seed: number;
  runIndex: number;
  timestamp: string;
  scenario: ScenarioId;
  agentCount: number;
  maxRounds: number;
  totalRounds: number;
  converged: boolean;
  /** 最终群体排序 */
  finalRanking: string[];
  /** 最终 Kendall τ */
  finalKendallTau: number;
  /** false 表示任务只有单选真值，finalKendallTau 不得进入统计分析。 */
  rankingMetricApplicable?: boolean;
  /** 最终单选准确率（finalRanking[0] 是否为 correctAnswer 中 rank=1 的方案；HiddenBench 等单选任务用） */
  finalAccuracy: number;
  /** 个体正确率（average rule）：rank-1 匹配 correctAnswer rank-1 的 agent 比例。
   *  与 HiddenBench A 组的 postAccuracy 直接对比。仅非 HiddenBench 协议时有值。 */
  individualAccuracy?: number;
  /** 选项标签解析质量；invalid/ambiguous 输出按 fail-closed 处理。 */
  optionParsing?: {
    totalOpinions: number;
    validOpinions: number;
    invalidRate: number;
    statusCounts: Record<string, number>;
    unmatchedLabels: string[];
    rankingError?: string;
  };
  /**
   * 原始数据 schema 版本（additive）。缺省视为 "1.0"（旧数据）。
   * "2.0" adds replayable estimator inputs; "3.0" adds versioned macro signals.
   */
  rawSchemaVersion?: RawSchemaVersion;
  /**
   * CC-2: 验证后的治理研究契约 structured clone（仅当 config 显式提供时写入）。
   * 缺省 = legacy/undeclared；schema 1.0-4.0 无此字段仍可读，不得推断为 confirmatory。
   */
  governanceStudy?: GovernanceStudyContract;
  /** Required by schema 5.0; absent on legacy/read-compatible schema 1.0-4.0. */
  governanceAuditTrail?: GovernanceAuditTrail;
  /** Schema-5 Stage-1 authority. The assignment record is nested in this manifest. */
  primaryAssignmentManifest?: PrimaryAssignmentManifestV1;
  /** Frozen exact-ref lookup from randomized arm to implementation/budget snapshots. */
  primaryArmExecutionRegistry?: PrimaryArmExecutionRegistryV1;
  /** Pre-provider resolution of the assigned arm to one frozen executable snapshot. */
  primaryArmExecution?: PrimaryArmExecutionBindingV1;
  /** WP2: pre-run treatment assignment identity（schema 4.0 必有）。 */
  treatmentAssignment?: TreatmentAssignment;
  /** Assignment artifact persisted before the first LLM call. */
  assignmentManifest?: { path: string; sha256: string; reused: boolean; assignmentId: string };
  /** WP2: 治理生命周期——干预应用回执（assignment → applied action → window）。 */
  applicationReceipts?: InterventionApplicationReceipt[];
  /** Receipt-linked observations over the predeclared post-action window. */
  proximalOutcomes?: ProximalOutcomeRecord[];
  /** WP2: 任务结果（讨论结束后由评分契约给出）。 */
  taskOutcome?: TaskOutcomeRecord;
  /** F4: arm-invariant private elicitation -> resolution -> proper-scoring artifact. */
  finalOutcome?: FinalOutcomeArtifactV1;
  /** Pre-assignment primary-claim and registered-agent ITT denominator commitment. */
  operationalAnalysisUnit?: OperationalAnalysisUnitV1;
  /** Schema-5 primary ITT metric; answered-only finalOutcome scores remain secondary. */
  operationalOutcome?: OperationalOutcomeArtifactV1;
  /** Provider/model provenance and prompt commitments for the private measurement phase. */
  finalElicitationCollection?: FinalElicitationCollectionArtifactV1;
  /** 每轮信念快照 */
  beliefTrajectory: Array<{
    round: number;
    beliefs: Record<string, number>;
    confidences: Record<string, number>;
  }>;
  /** Cognitive state 轨迹（仅 cognitive 模式） */
  cognitiveTrajectory?: CognitiveStateSnapshot[];
  /** Exact estimator records used online; analysis MUST prefer these over recomputation. */
  governanceEstimateHistory?: Array<{
    round: number;
    agentId: string;
    record: GovernanceEstimate<ProgressiveEstimates>;
  }>;
  /** Versioned cognitive macro monitoring trajectory (native_cognitive only). */
  thermoHistory?: Array<LegacyThermoSnapshot | CognitiveMacroSnapshotV1>;
  /** Experimental macro-signal stopping decisions (native_cognitive only). */
  terminationDecisions?: Array<{
    round: number;
    shouldTerminate: boolean;
    reason: string;
    stateType: string;
    message: string;
  }>;
  /** ROADMAP_V5/v6: δ 一致性诊断（每轮 deltaDiagnosis，仅 native_cognitive 模式）
   *  v6 更新：与 DeltaDiagnosis 接口对齐（8 个 δ 信号）。 */
  deltaDiagnosis?: Array<{
    round: number;
    polarization: { value: number; triggered: boolean; explanation: string; minConfidence: number; effectiveThreshold: number };
    oneDMask: { value: number; triggered: boolean; explanation: string; minConfidence: number; effectiveThreshold: number };
    evidenceSilence: { value: number; triggered: boolean; explanation: string; minConfidence: number; effectiveThreshold: number; silencedAgents: string[] };
    confidenceGap: { value: number; triggered: boolean; explanation: string; minConfidence: number; effectiveThreshold: number; overconfidentAgents: string[] };
    stanceFlip: { value: number; triggered: boolean; explanation: string; minConfidence: number; effectiveThreshold: number; flippedAgents: string[] };
    noResponse: { value: number; triggered: boolean; explanation: string; minConfidence: number; effectiveThreshold: number; unresponsiveAgents: string[] };
    concentration: { value: number; triggered: boolean; explanation: string; minConfidence: number; effectiveThreshold: number };
    consistency: { value: number; triggered: boolean; explanation: string; minConfidence: number; effectiveThreshold: number };
    summary: string;
  }>;
  /** 干预记录 */
  interventions: Array<{
    /** Stable raw-artifact identity used by the application receipt. */
    id: string;
    round: number;
    type: string;
    targetAgentId?: string;
    /** v6: 完整目标 agent 列表（generateCognitiveInterventions 使用） */
    targetAgents?: string[];
    /** v6: 干预效果描述（含降级信息） */
    effect?: string;
    /** v6: 是否实际应用 */
    applied?: boolean;
    /** v6: 干预参数（含 deltaSource, degradedFrom, mechanism 等） */
    parameters?: Record<string, unknown>;
  }>;
  /** 治理检测结果（每轮检测到的问题） */
  governanceIssues: Array<{
    id: string;
    round: number;
    type: string;
    severity: "low" | "medium" | "high";
    description: string;
    agents?: string[];
    suggestedIntervention?: string;
  }>;
  /** Token 使用 */
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    /** Per-agent token 使用明细（用于干预成本分析） */
    byAgent?: Record<string, {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      totalLatencyMs: number;
      callCount: number;
    }>;
    /** 总延迟（毫秒） */
    totalLatencyMs?: number;
  };
  /**
   * ROADMAP_V5: 逐轮逐 agent 的 itemBeliefs 原始数据（K 维偏好向量）。
   *
   * 用于 Hidden Anchors 锚点恢复、偏好向量演化分析、Friedkin-Johnsen 模型拟合。
   * 每个元素是 (round, agentId, agentName) → itemBeliefs[] 的映射。
   */
  itemBeliefsTrajectory?: Array<{
    round: number;
    agentId: string;
    agentName: string;
    itemBeliefs: Array<{
      item: string;
      rank: number;
      belief: number;
      confidence: number;
    }>;
  }>;
  /**
   * 逐轮完整 opinion 数据（含 reasoning、evidence、referencedAgents）。
   *
   * 用于定性分析：信息传播路径追踪、社会网络分析、引用模式分析。
   * 注意：此字段较大（含完整推理文本），仅在需要深度回溯时使用。
   */
  roundOpinions?: Array<{
    round: number;
    opinions: Array<{
      agentId: string;
      agentName: string;
      itemBeliefs: Array<{
        item: string;
        rank: number;
        belief: number;
        confidence: number;
      }>;
      reasoning?: string;
      evidence?: string[];
      referencedAgents?: string[];
      /** 该 agent 本轮是否发言 */
      spoke: boolean;
    }>;
  }>;
  /**
   * v6: SemanticTool 审计日志（C 组实验论文分析用）。
   * 记录每次 SemanticTool 调用的 task、round、输入输出、验证通过率、降级情况。
   * 仅 useSemanticTool=true（C 组）时有数据；A/B/D 组为 undefined 或空数组。
   */
  semanticAuditLog?: Array<{
    round: number;
    task: string;
    triggeredDeltas?: string[];
    inputCount: number;
    outputCount: number;
    validatedClusters?: number;
    rejectedClusters?: number;
    success: boolean;
    latencyMs: number;
    error?: string;
  }>;
  /** HiddenBench 协议结果（仅 protocol="hiddenbench" 时填充） */
  hiddenbenchResult?: {
    preVotes: Array<{ agentId: string; agentLabel: string; vote: string; rationale: string; isCorrect: boolean }>;
    postVotes: Array<{ agentId: string; agentLabel: string; vote: string; rationale: string; isCorrect: boolean }>;
    discussionHistory: Array<{ round: number; agentId: string; agentLabel: string; content: string }>;
    preAccuracy: number;
    postAccuracy: number;
    preMajorityCorrect: boolean;
    postMajorityCorrect: boolean;
    collectiveGain: number;
    elapsedMs: number;
  };
}

/** Compile-time carrier for successful auditable runs; legacy RawRunData stays readable. */
export type AuditableRawRunDataV5 = Omit<
  RawRunData,
  | "rawSchemaVersion"
  | "governanceStudy"
  | "governanceAuditTrail"
  | "primaryAssignmentManifest"
  | "primaryArmExecutionRegistry"
  | "primaryArmExecution"
  | "finalOutcome"
  | "operationalAnalysisUnit"
  | "operationalOutcome"
  | "taskOutcome"
  | "treatmentAssignment"
  | "assignmentManifest"
  | "applicationReceipts"
  | "proximalOutcomes"
> & {
  rawSchemaVersion: typeof AUDITABLE_RAW_SCHEMA_VERSION;
  governanceStudy: GovernanceStudyContract;
  governanceAuditTrail: GovernanceAuditTrail;
  primaryAssignmentManifest: PrimaryAssignmentManifestV1;
  primaryArmExecutionRegistry: PrimaryArmExecutionRegistryV1;
  primaryArmExecution: PrimaryArmExecutionBindingV1;
  finalOutcome: FinalOutcomeArtifactV1;
  operationalAnalysisUnit: OperationalAnalysisUnitV1;
  operationalOutcome: OperationalOutcomeArtifactV1;
  /** Secondary pooled-decision accuracy projection; primary outcome is operationalOutcome. */
  taskOutcome: TaskOutcomeRecord;
  /** Schema 5 uses the audit trail and Stage-1 objects as its only authorities. */
  treatmentAssignment?: never;
  assignmentManifest?: never;
  applicationReceipts?: never;
  proximalOutcomes?: never;
};

// ============================================================================
// Metrics
// ============================================================================

export interface ExperimentMetrics {
  experimentId: string;
  runtimeMode: RuntimeMode;
  sampleSize: number;
  /** E1: 状态稳定性 */
  stateStability?: {
    sigmaSqDeltaB: number;        // σ²(ΔB)
    sigmaSqDeltaU: number;        // σ²(ΔU)
    stabilityRatio: number;       // σ²(ΔB) / σ²(ΔU)
    perRunRatios: number[];       // 每次运行的稳定性比
  };
  /** E1-Native: Utility-Ranking 一致性（Utility 是否对应实际决策） */
  utilityConsistency?: {
    consistencyRate: number;      // 一致次数 / 总比较次数
    consistentCount: number;
    totalCount: number;
  };
  /** E1-Native: Utility 预测力（ΔUtility(t) → Decision Change(t+1)） */
  utilityPrediction?: {
    correlation: number;          // Pearson r(ΔUtility, DecisionChange)
    regressionBeta: number;        // 回归系数
    r2: number;                    // R²
    auc: number;                   // 逻辑回归 AUC
    sampleSize: number;
  };
  /** E2: Evidence 解释力 */
  evidenceExplanatory?: {
    r2Cognitive: number;           // Cognitive model R²
    r2Belief: number;              // Belief model R²
    deltaR2: number;               // ΔR²
    aicCognitive: number;
    aicBelief: number;
    bicCognitive: number;
    bicBelief: number;
    /** 模型级 Bootstrap 原始数据：逐轮 (ΔE_coverage, ΔU) 对 */
    _bootstrapData?: {
      deltaECoverage: number[];
      deltaU: number[];
      deltaConfidence: number[];
      deltaB: number[];
    };
  };
  /** E3: Inertia → Authority */
  inertiaAuthority?: {
    auc: number;
    oddsRatio: number;
    beta1: number;
    /** 置换检验原始数据：每个观测的 (inertia, hasAuthorityBias) */
    _bootstrapData?: {
      inertiaValues: number[];
      authorityBiasLabels: number[]; // 0/1
    };
  };
  /** E4: Confidence 预测力 */
  confidencePrediction?: {
    beta1Cognitive: number;        // Cognitive model β₁
    beta1Belief: number;           // Belief model β₁
    marginalR2Cognitive: number;
    marginalR2Belief: number;
    /** Bootstrap 原始数据：每个观测的 (confidence, futureDeltaU) */
    _bootstrapData?: {
      confValues: number[];
      deltaUValues: number[];
      oldConfValues: number[];
      deltaBValues: number[];
    };
  };
  /** E5: Governance 机制 */
  governanceMechanism?: {
    grangerF_evidenceToUtility: number;
    grangerF_utilityToEvidence: number;
    /** 直接效应：ΔE → ΔU 回归系数（非中介效应 a×b 路径） */
    indirectEffect: number;
    indirectEffectCI: [number, number];
    mediationRatio: number;
    tauWithGovernance: number;
    tauWithoutGovernance: number;
    deltaTau: number;
    /** Bootstrap 原始数据：per-run 配对 τ（治理组 vs 对照组） */
    _bootstrapData?: {
      tauGov: number[];
      tauNoGov: number[];
      grangerN: number;
      /** v6.1: per-series Granger F 值（按 run×agent 分组），用于 Fisher 合并 p 值 */
      perSeriesF_EtoU?: number[];
      perSeriesF_UtoE?: number[];
      /** 每条序列的有效长度（n-3 用于 df2），用于 F 分布 CDF */
      perSeriesN?: number[];
    };
  };
  /** E6: 状态解耦 */
  stateDecoupling?: {
    status: ConfirmatoryAnalysisStatus;
    /** 进入分析的 schema-2、usable、有限数 snapshot 数。 */
    usableObservationCount: number;
    /** 被排除的 schema-1 snapshot 数。 */
    legacyMixedExcludedCount: number;
    /** schema-2 中 behavioral susceptibility usable=false 的 snapshot 数。 */
    unusableObservationCount: number;
    /** schema-2 契约损坏的 snapshot 数；大于 0 时 status 必须为 invalid_data。 */
    malformedObservationCount: number;
    /** 进入 paired-bootstrap 的独立 run 数。 */
    eligibleRunCount: number;
    /** 非 computed 状态的机器可读原因。 */
    invalidReason?: string;
    /** 以下推断量仅在 status=computed 时存在。 */
    maxCorrCognitive?: number;
    maxCorrBelief?: number;
    vifMax?: number;
    conditionNumber?: number;
    /** 完整相关矩阵（用于 Fig 6 heatmap） */
    correlationMatrix?: number[][];
    /** 变量名 */
    variableNames?: string[];
    /** 是否排除了 schema-1 混合易感性数据（Λ 维度只用 schema-2 usable 行为估计） */
    legacyMixedExcluded?: boolean;
    /** Bootstrap 原始数据：per-run (cogCorr, belCorr) 配对 */
    _bootstrapData?: {
      corrCognitivePerRun: number[];
      corrBeliefPerRun: number[];
    };
  };
  /** E7: 检测器准确性 */
  detectorAccuracy?: {
    f1Cognitive: number;
    f1Belief: number;
    precisionCognitive: number;
    recallCognitive: number;
    precisionBelief: number;
    recallBelief: number;
    /** Bootstrap 原始数据：per-run predictions + ground truth */
    _bootstrapData?: {
      cognitivePreds: boolean[];
      beliefPreds: boolean[];
      groundTruths: boolean[];
    };
  };
  /**
   * E8: Susceptibility 中介
   *
   * confirmatory 状态（fail-closed）：
   * - "computed"：基于 schema-2 usable 行为易感性的确认性结果。
   * - "legacy_mixed_excluded"：无 schema-2 usable 观测（全部是 schema-1
   *   混合易感性），不产生确认性 claim。
   * - "insufficient_data"：schema-2 但 usable 观测不足。
   */
  susceptibilityMediation?: {
    status: ConfirmatoryAnalysisStatus;
    /** 进入 confirmatory 的 schema-2 有效 transition 数 */
    usableObservationCount: number;
    /** 被排除的 schema-1 混合 transition 数（n 个有序 snapshot → n-1 候选 transition） */
    legacyMixedExcludedCount: number;
    /** schema-2 中 usable=false（行为估计不足）而被排除的 transition 数 */
    unusableObservationCount: number;
    /** schema-2 中 usable=true 但 estimate 缺失/NaN/Infinity/越界而被排除的 transition 数 */
    malformedObservationCount: number;
    /** 非 computed 状态的机器可读原因。 */
    invalidReason?: string;
    /** 直接效应：ΔE → ΔU 回归系数（非中介效应 a×b 路径）；仅 status=computed 时有值 */
    indirectEffect?: number;
    indirectEffectCI?: [number, number];
    directEffect?: number;
    totalEffect?: number;
    mediationRatio?: number;
    /** Bootstrap 原始数据：每个观测的 (I, Λ, ΔU)；仅 status=computed 时有值 */
    _bootstrapData?: {
      inertiaValues: number[];
      susceptibilityValues: number[];
      deltaUValues: number[];
    };
  };
  /** E9: Cognitive Governance */
  cognitiveGovernance?: {
    /** 平均 Kendall τ */
    meanTau: number;
    /** τ 标准差 */
    stdTau: number;
    /** 总干预次数 */
    totalInterventions: number;
    /** 平均每轮干预次数 */
    interventionsPerRound: number;
    /** 干预类型分布 */
    interventionTypeDistribution: Record<string, number>;
    /** 检测器触发次数（从 governanceIssues 统计） */
    detectorTriggers: Record<string, number>;
    /** 治理检测问题类型分布 */
    issueTypeDistribution: Record<string, number>;
    /** 平均收敛轮次 */
    meanConvergenceRounds: number;
    /** 治理模式 */
    governanceMode: string;
    /** 场景 */
    scenario: string;
    /** RTHF 轨迹分析 */
    rthfTrajectory?: {
      /** R 收敛速度 (ΔR/round) */
      rConvergenceRate: number;
      /** T 稳定性 (σ²(T)) */
      tStability: number;
      /** H 减少率 (ΔH/round) */
      hReductionRate: number;
      /** F 变化 (F_last - F_first) */
      fDrift: number;
      /** 平均 RTHF 逐轮轨迹 */
      perRound: Array<{ round: number; R: number; T: number; H: number; F: number }>;
    };
    /** v6 δ 诊断分析 */
    deltaDiagnosis?: {
      /** 各 δ 信号的触发率 (triggered=true 的轮次占比) */
      triggerRates: Record<string, number>;
      /** δ 触发总次数 */
      totalTriggers: number;
      /** δ 触发与同轮干预的相关性 (φ系数) */
      deltaInterventionPhi: number;
      /** δ 触发轮次 vs 非触发轮次的 Δτ 均值差 */
      tauDeltaOnTrigger: number;
      /** 各 δ 信号触发时的平均 minConfidence */
      meanConfidenceBySignal: Record<string, number>;
    };
  };
  /** 全局指标 */
  global?: {
    consensusQuality: number;       // mean Kendall τ
    polarization: number;           // 双峰系数
    diversity: number;              // Evidence Jaccard 补集
    convergence: number;            // 平均收敛轮次
    robustness: number;             // CV(τ) across seeds
    reproducibility: number;        // σ(τ) within seed
    calibration: number;            // Confidence-Accuracy r
    governanceGain: number;         // Δτ
    explainability: number;         // Adjusted R²
  };
}

// ============================================================================
// Statistical Test Results
// ============================================================================

export interface TestResult {
  experimentId: string;
  testName: string;
  pValue: number;
  pValueAdjusted?: number;         // Holm-Bonferroni 校正后
  effectSize: number;
  effectSizeName: string;          // "Cohen's d" | "ΔR²" | "Odds Ratio" | "a×b"
  ciLower: number;
  ciUpper: number;
  ciLevel: number;                 // 0.95
  sampleSize: number;
  significant: boolean;            // p < 0.05 (adjusted)
  conclusion: string;              // 一句话结论
  /** Confirmatory analyses expose this so reports can render N/A fail-closed. */
  analysisStatus?: ConfirmatoryAnalysisStatus;
  details: Record<string, unknown>; // 额外统计细节
}

// ============================================================================
// Campaign Summary
// ============================================================================

export interface CampaignSummary {
  timestamp: string;
  totalExperiments: number;
  totalRuns: number;
  experiments: Array<{
    id: string;
    hypothesis: string;
    status: "completed" | "partial" | "failed";
    runsCompleted: number;
    runsPlanned: number;
    keyResult: string;
    significant: boolean;
    pValue: number;
    effectSize: number;
  }>;
  overallConclusions: string[];
}
