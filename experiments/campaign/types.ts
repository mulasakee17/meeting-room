/**
 * SwarmAlpha Experimental Campaign — Shared Types
 *
 * 统一实验战役的类型定义，供所有 pipeline 组件使用。
 */

// ============================================================================
// Experiment Configuration
// ============================================================================

export type RuntimeMode = "belief" | "cognitive" | "native_cognitive";
export type GovernanceMode = "none" | "detect-only" | "full" | "diversity_only" | "cognitive";
export type ScenarioId = "ma" | "crisis" | "supplier" | "invest" | "er_triage" | "fraud";
export type LLMProvider = "qwen" | "gpt4o" | "deepseek";

export interface ExperimentConfig {
  /** 实验 ID，如 "e1_stability" */
  id: string;
  /** 对应假设，如 "H1" */
  hypothesis: string;
  /** 实验标题 */
  title: string;
  /** 场景 */
  scenario: ScenarioId;
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
  susceptibility: number;
  belief: number;
  oldConfidence: number;
  spokeThisRound: boolean;
  /** LLM itemBeliefs 中 rank=1 的 item（用于 Utility-Ranking Consistency 验证） */
  rankingTopChoice?: string;
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
  /** 每轮信念快照 */
  beliefTrajectory: Array<{
    round: number;
    beliefs: Record<string, number>;
    confidences: Record<string, number>;
  }>;
  /** Cognitive state 轨迹（仅 cognitive 模式） */
  cognitiveTrajectory?: CognitiveStateSnapshot[];
  /** 热力学轨迹（RTHF 逐轮快照，仅 native_cognitive 模式） */
  thermoHistory?: Array<{
    round: number;
    /** Kuramoto 序参量 [0, 1] */
    R: number;
    /** 归一化温度 [0, 1] */
    T: number;
    /** Shannon 熵 [0, 1] */
    H: number;
    /** Helmholtz 自由能 */
    F: number;
  }>;
  /** 干预记录 */
  interventions: Array<{
    round: number;
    type: string;
    targetAgentId?: string;
  }>;
  /** 治理检测结果（每轮检测到的问题） */
  governanceIssues: Array<{
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
  };
}

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
    };
  };
  /** E6: 状态解耦 */
  stateDecoupling?: {
    maxCorrCognitive: number;
    maxCorrBelief: number;
    vifMax: number;
    conditionNumber: number;
    /** 完整相关矩阵（用于 Fig 6 heatmap） */
    correlationMatrix?: number[][];
    /** 变量名 */
    variableNames?: string[];
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
  /** E8: Susceptibility 中介 */
  susceptibilityMediation?: {
    indirectEffect: number;
    indirectEffectCI: [number, number];
    directEffect: number;
    totalEffect: number;
    mediationRatio: number;
    /** Bootstrap 原始数据：每个观测的 (I, Λ, ΔU) */
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