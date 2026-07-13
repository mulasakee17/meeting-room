/**
 * 干预因果效应估计 — 基于轨迹匹配 + 置换检验
 *
 * 核心思想:
 *   当前 analyze.ts 的 permutation test 回答 "Full 和 None 有差异吗？"（相关性）
 *   本模块回答 "干预导致 τ 变化了多少？"（因果性）
 *
 * 方法: 最近邻轨迹匹配 (Nearest-Neighbor Trajectory Matching)
 *   1. 对每个处理实验 T，从同任务同轮次的 None 实验中找 k 个最近邻
 *   2. 匹配变量: 第 1 轮 τ + 第 1 轮 belief diversity（前置轨迹）
 *   3. 反事实估计 = 逆距离加权平均 of matched donors' final τ
 *   4. 因果效应 = T.finalτ - 反事实τ
 *   5. 置换检验: 随机重标 treatment 构建零分布
 *
 * 假设:
 *   - SUTVA: 实验间无干扰（设计保证）
 *   - 条件可忽略性: 给定前置轨迹，treatment assignment 近似随机
 *   - 正支撑: 处理组的前置轨迹在 donor pool 中有重叠
 *
 * 限制:
 *   - 前置期仅 1 轮（干预最早在第 1 轮后触发），匹配可能弱
 *   - 样本量小 (n=15/cell)，统计功效有限
 *   - 历史数据存在治理环路断裂问题（2026-07-12 修复前），
 *     state-modification 类干预 (reduce_weight, force_reflection) 效应可能被低估
 */

// ============================================================================
// 类型定义
// ============================================================================

/** 干预类型（与 governance/types.ts 保持一致，但独立定义避免循环依赖） */
export type CausalInterventionType =
  | "introduce_diversity"
  | "reduce_weight"
  | "force_reflection"
  | "continue_discussion"
  | "none";

/** 实验轨迹 — 从实验 JSON 提取的标准化轨迹 */
export interface ExperimentTrajectory {
  runId: string;
  task: "invest" | "ma";
  totalRounds: number;
  ablation: string;
  /** 每轮 τ（可能缺失，Gen 1 数据无） */
  tauTrajectory: number[];
  /** 每轮 belief diversity（标准差），从 rounds[i].beliefs 计算 */
  beliefDiversityTrajectory: number[];
  /** 每轮 belief 均值 */
  beliefMeanTrajectory: number[];
  /** 最终 τ */
  finalTau: number;
  /** 决策质量 (0-100) */
  finalQuality: number;
  /** 干预时间线 */
  interventions: Array<{
    round: number;
    type: CausalInterventionType;
  }>;
  /** 首次干预轮次（null = 无干预） */
  firstInterventionRound: number | null;
  /** 所有干预类型集合 */
  interventionTypes: CausalInterventionType[];
  /** 首次干预类型（null = 无干预） */
  firstInterventionType: CausalInterventionType | null;
}

/** 单个实验的因果效应估计 */
export interface CausalEffect {
  runId: string;
  task: "invest" | "ma";
  totalRounds: number;
  /** 观测到的 final τ */
  observedTau: number;
  /** 反事实估计的 final τ */
  counterfactualTau: number;
  /** 因果效应 = observed - counterfactual */
  effect: number;
  /** 匹配的 donor runIds */
  matchedDonorIds: string[];
  /** 首次干预类型 */
  firstInterventionType: CausalInterventionType | null;
  /** 首次干预轮次 */
  firstInterventionRound: number | null;
}

/** 因果效应汇总 */
export interface CausalSummary {
  /** 分组标签 */
  label: string;
  /** 处理组样本量 */
  nTreated: number;
  /** donor pool 样本量 */
  nDonors: number;
  /** 平均观测 τ */
  meanObservedTau: number;
  /** 平均反事实 τ */
  meanCounterfactualTau: number;
  /** 平均因果效应 */
  meanEffect: number;
  /** 效应标准差 */
  effectStd: number;
  /** Bootstrap 95% CI */
  ciLower: number;
  ciUpper: number;
  /** 置换检验 p-value */
  pValue: number;
  /** Cohen's d（效应量） */
  cohensD: number;
}

/** 因果分析完整结果 */
export interface CausalAnalysisResult {
  /** 总体 ATE（按 task × rounds 分层） */
  overallATE: CausalSummary[];
  /** 按首次干预类型分组 */
  perInterventionType: CausalSummary[];
  /** 按首次干预轮次分组 */
  perInterventionRound: CausalSummary[];
  /** 个体层面效应（用于散点图） */
  individualEffects: CausalEffect[];
  /** 方法说明 */
  method: string;
  /** 假设和限制 */
  assumptions: string[];
}

// ============================================================================
// 确定性 PRNG
// ============================================================================

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// 轨迹提取
// ============================================================================

/**
 * 从实验 JSON 提取标准化轨迹。
 *
 * 兼容三代数据格式:
 *   - Gen 1: 无 tauTrajectory，从 rounds[i].beliefs 计算 belief 轨迹
 *   - Gen 2+: 有 tauTrajectory，直接使用
 */
export function extractTrajectory(experiment: {
  runId: string;
  ablation: string;
  totalRounds?: number;
  kendallTau: number;
  decisionQuality: number;
  tauTrajectory?: number[];
  rounds?: Array<{
    roundNumber: number;
    tau?: number;
    beliefs?: Record<string, number>;
    interventions?: Array<{
      type: string;
      targetAgentId?: string;
      targetAgents?: string[];
    }>;
  }>;
}): ExperimentTrajectory | null {
  const rounds = experiment.rounds;
  if (!rounds || rounds.length === 0) return null;

  // 判定任务类型
  const runId = experiment.runId || "";
  const task: "invest" | "ma" = runId.startsWith("invest") ? "invest" : "ma";
  const totalRounds = experiment.totalRounds || rounds.length;

  // τ 轨迹: 优先用 tauTrajectory，其次从 rounds[i].tau 构建
  let tauTrajectory: number[] = [];
  if (experiment.tauTrajectory && experiment.tauTrajectory.length >= 2) {
    tauTrajectory = experiment.tauTrajectory;
  } else {
    tauTrajectory = rounds
      .sort((a, b) => a.roundNumber - b.roundNumber)
      .map((r) => (typeof r.tau === "number" ? r.tau : NaN))
      .filter((t) => !isNaN(t));
  }

  // belief 轨迹: 从 rounds[i].beliefs 计算
  const sortedRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const beliefDiversityTrajectory: number[] = [];
  const beliefMeanTrajectory: number[] = [];

  for (const r of sortedRounds) {
    if (r.beliefs) {
      const values = Object.values(r.beliefs);
      if (values.length > 0) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const std = Math.sqrt(
          values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
        );
        beliefDiversityTrajectory.push(std);
        beliefMeanTrajectory.push(mean);
      } else {
        beliefDiversityTrajectory.push(NaN);
        beliefMeanTrajectory.push(NaN);
      }
    } else {
      beliefDiversityTrajectory.push(NaN);
      beliefMeanTrajectory.push(NaN);
    }
  }

  // 干预时间线
  const interventions: Array<{ round: number; type: CausalInterventionType }> = [];
  for (const r of sortedRounds) {
    if (r.interventions) {
      for (const intv of r.interventions) {
        if (isValidInterventionType(intv.type)) {
          interventions.push({
            round: r.roundNumber,
            type: intv.type as CausalInterventionType,
          });
        }
      }
    }
  }

  const firstInterventionRound =
    interventions.length > 0 ? interventions[0].round : null;
  const firstInterventionType =
    interventions.length > 0 ? interventions[0].type : null;
  const interventionTypes = [
    ...new Set(interventions.map((i) => i.type)),
  ] as CausalInterventionType[];

  return {
    runId,
    task,
    totalRounds,
    ablation: experiment.ablation,
    tauTrajectory,
    beliefDiversityTrajectory,
    beliefMeanTrajectory,
    finalTau: experiment.kendallTau,
    finalQuality: experiment.decisionQuality,
    interventions,
    firstInterventionRound,
    firstInterventionType,
    interventionTypes,
  };
}

function isValidInterventionType(type: string): boolean {
  return [
    "introduce_diversity",
    "reduce_weight",
    "force_reflection",
    "continue_discussion",
  ].includes(type);
}

// ============================================================================
// 匹配与反事实估计
// ============================================================================

/**
 * 计算两个实验的前置轨迹距离。
 *
 * 匹配变量:
 *   - 第 1 轮 τ（如果有）
 *   - 第 1 轮 belief diversity
 *   - 第 1 轮 belief mean
 *
 * 距离 = 加权欧氏距离，权重:
 *   τ: 0.5（最直接的质量指标）
 *   diversity: 0.3（过程指标）
 *   mean: 0.2（整体倾向）
 */
export function computeDistance(
  treated: ExperimentTrajectory,
  donor: ExperimentTrajectory
): number {
  const wTau = 0.5;
  const wDiversity = 0.3;
  const wMean = 0.2;

  let dist = 0;
  let totalWeight = 0;

  // τ 匹配（如果两者都有第 1 轮 τ）
  const treatedTau1 = treated.tauTrajectory[0];
  const donorTau1 = donor.tauTrajectory[0];
  if (
    typeof treatedTau1 === "number" &&
    !isNaN(treatedTau1) &&
    typeof donorTau1 === "number" &&
    !isNaN(donorTau1)
  ) {
    dist += wTau * (treatedTau1 - donorTau1) ** 2;
    totalWeight += wTau;
  }

  // belief diversity 匹配
  const treatedDiv1 = treated.beliefDiversityTrajectory[0];
  const donorDiv1 = donor.beliefDiversityTrajectory[0];
  if (
    typeof treatedDiv1 === "number" &&
    !isNaN(treatedDiv1) &&
    typeof donorDiv1 === "number" &&
    !isNaN(donorDiv1)
  ) {
    dist += wDiversity * (treatedDiv1 - donorDiv1) ** 2;
    totalWeight += wDiversity;
  }

  // belief mean 匹配
  const treatedMean1 = treated.beliefMeanTrajectory[0];
  const donorMean1 = donor.beliefMeanTrajectory[0];
  if (
    typeof treatedMean1 === "number" &&
    !isNaN(treatedMean1) &&
    typeof donorMean1 === "number" &&
    !isNaN(donorMean1)
  ) {
    dist += wMean * (treatedMean1 - donorMean1) ** 2;
    totalWeight += wMean;
  }

  // 归一化
  if (totalWeight === 0) return Infinity;
  return Math.sqrt(dist / totalWeight);
}

/**
 * 找到 k 个最近邻 donor。
 * 如果 donor pool 小于 k，返回全部。
 */
export function findNearestNeighbors(
  treated: ExperimentTrajectory,
  donors: ExperimentTrajectory[],
  k: number
): Array<{ donor: ExperimentTrajectory; distance: number }> {
  const distances = donors
    .map((donor) => ({ donor, distance: computeDistance(treated, donor) }))
    .filter((d) => isFinite(d.distance))
    .sort((a, b) => a.distance - b.distance);

  return distances.slice(0, Math.min(k, distances.length));
}

/**
 * 估计反事实 τ: 逆距离加权平均。
 *
 * 如果所有距离为 0（完全匹配），用简单平均。
 * 距离加小常数 epsilon 避免除零。
 */
export function estimateCounterfactual(
  matched: Array<{ donor: ExperimentTrajectory; distance: number }>
): number {
  if (matched.length === 0) return NaN;

  const epsilon = 1e-6;

  // 检查是否所有距离都为 0
  const allZero = matched.every((m) => m.distance < epsilon);
  if (allZero) {
    return (
      matched.reduce((s, m) => s + m.donor.finalTau, 0) / matched.length
    );
  }

  // 逆距离加权
  let weightedSum = 0;
  let weightSum = 0;
  for (const m of matched) {
    const w = 1 / (m.distance + epsilon);
    weightedSum += w * m.donor.finalTau;
    weightSum += w;
  }

  return weightSum > 0 ? weightedSum / weightSum : NaN;
}

/**
 * 估计单个处理实验的因果效应。
 */
export function estimateCausalEffect(
  treated: ExperimentTrajectory,
  donors: ExperimentTrajectory[],
  k: number = 5
): CausalEffect {
  const matched = findNearestNeighbors(treated, donors, k);
  const counterfactualTau = estimateCounterfactual(matched);

  return {
    runId: treated.runId,
    task: treated.task,
    totalRounds: treated.totalRounds,
    observedTau: treated.finalTau,
    counterfactualTau,
    effect: treated.finalTau - counterfactualTau,
    matchedDonorIds: matched.map((m) => m.donor.runId),
    firstInterventionType: treated.firstInterventionType,
    firstInterventionRound: treated.firstInterventionRound,
  };
}

// ============================================================================
// 统计推断
// ============================================================================

/**
 * 置换检验: 评估因果效应是否显著非零。
 *
 * 方法:
 *   1. 将处理实验和 donor pool 合并
 *   2. 随机选 |treated| 个作为"伪处理组"，其余作为"伪 donor"
 *   3. 重新估计平均效应
 *   4. 重复 nPerms 次，构建零分布
 *   5. p-value = 零分布中 |effect| >= |观测效应| 的比例
 */
export function permutationTest(
  treated: ExperimentTrajectory[],
  donors: ExperimentTrajectory[],
  k: number = 5,
  nPerms: number = 10000,
  seed: number = 42
): number {
  if (treated.length === 0 || donors.length === 0) return 1.0;

  const rng = mulberry32(seed);

  // 观测效应
  const observedEffects = treated.map((t) =>
    estimateCausalEffect(t, donors, k)
  );
  const observedMean =
    observedEffects.reduce((s, e) => s + e.effect, 0) /
    observedEffects.length;
  const absObserved = Math.abs(observedMean);

  // 合并池
  const pool = [...treated, ...donors];
  const nTreated = treated.length;

  // 置换
  let countExtreme = 0;
  for (let perm = 0; perm < nPerms; perm++) {
    // Fisher-Yates 部分洗牌: 选 nTreated 个作为伪处理组
    const indices = pool.map((_, i) => i);
    for (let i = 0; i < nTreated; i++) {
      const j = i + Math.floor(rng() * (pool.length - i));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    const pseudoTreated = indices.slice(0, nTreated).map((i) => pool[i]);
    const pseudoDonors = indices.slice(nTreated).map((i) => pool[i]);

    if (pseudoDonors.length === 0) continue;

    const pseudoEffects = pseudoTreated.map((t) =>
      estimateCausalEffect(t, pseudoDonors, k)
    );
    const pseudoMean =
      pseudoEffects.reduce((s, e) => s + e.effect, 0) / pseudoEffects.length;

    if (Math.abs(pseudoMean) >= absObserved) {
      countExtreme++;
    }
  }

  // H31 修复：(count+1)/(nPerms+1) 校正，避免 p=0 假阳性
  return (countExtreme + 1) / (nPerms + 1);
}

/**
 * Bootstrap 置信区间。
 *
 * 对效应数组做有放回重采样，计算平均效应的百分位 CI。
 */
export function bootstrapCI(
  effects: number[],
  nBootstrap: number = 10000,
  seed: number = 42,
  confidenceLevel: number = 0.95
): [number, number] {
  if (effects.length < 2) return [NaN, NaN];

  const rng = mulberry32(seed);
  const alpha = 1 - confidenceLevel;
  const bootMeans: number[] = [];

  for (let b = 0; b < nBootstrap; b++) {
    let sum = 0;
    for (let i = 0; i < effects.length; i++) {
      const idx = Math.floor(rng() * effects.length);
      sum += effects[idx];
    }
    bootMeans.push(sum / effects.length);
  }

  bootMeans.sort((a, b) => a - b);
  const lowerIdx = Math.floor((alpha / 2) * nBootstrap);
  const upperIdx = Math.floor((1 - alpha / 2) * nBootstrap);

  return [bootMeans[lowerIdx], bootMeans[upperIdx]];
}

/**
 * Cohen's d 效应量。
 *
 * 当样本量极小（n<5）或方差极小时，d 可能不稳定。
 * 添加小常数到分母避免除零，并 clamp 到 [-10, 10] 避免极端值。
 */
export function computeCohensD(
  observed: number[],
  counterfactual: number[]
): number {
  if (observed.length < 2 || counterfactual.length < 2) return 0;

  const meanObs =
    observed.reduce((a, b) => a + b, 0) / observed.length;
  const meanCf =
    counterfactual.reduce((a, b) => a + b, 0) / counterfactual.length;

  const varObs =
    observed.reduce((s, v) => s + (v - meanObs) ** 2, 0) /
    (observed.length - 1);
  const varCf =
    counterfactual.reduce((s, v) => s + (v - meanCf) ** 2, 0) /
    (counterfactual.length - 1);

  // 池化标准差，加 epsilon 避免除零
  const pooledStd = Math.sqrt(
    ((observed.length - 1) * varObs + (counterfactual.length - 1) * varCf) /
      (observed.length + counterfactual.length - 2)
  );

  if (pooledStd < 1e-8) return 0;
  const d = (meanObs - meanCf) / pooledStd;
  // clamp 到 [-10, 10] 避免小样本极端值
  return Math.max(-10, Math.min(10, d));
}

// ============================================================================
// 汇总
// ============================================================================

/**
 * 从个体效应数组生成汇总统计。
 */
export function summarizeEffects(
  effects: CausalEffect[],
  donors: ExperimentTrajectory[],
  label: string,
  k: number = 5,
  nPerms: number = 10000
): CausalSummary {
  if (effects.length === 0) {
    return {
      label,
      nTreated: 0,
      nDonors: donors.length,
      meanObservedTau: NaN,
      meanCounterfactualTau: NaN,
      meanEffect: NaN,
      effectStd: NaN,
      ciLower: NaN,
      ciUpper: NaN,
      pValue: 1.0,
      cohensD: 0,
    };
  }

  const observedTaes = effects.map((e) => e.observedTau);
  const counterfactualTaes = effects.map((e) => e.counterfactualTau);
  const effectValues = effects.map((e) => e.effect);

  const meanObserved =
    observedTaes.reduce((a, b) => a + b, 0) / observedTaes.length;
  const meanCounterfactual =
    counterfactualTaes.reduce((a, b) => a + b, 0) / counterfactualTaes.length;
  const meanEffect =
    effectValues.reduce((a, b) => a + b, 0) / effectValues.length;

  const effectStd =
    effectValues.length > 1
      ? Math.sqrt(
          effectValues.reduce((s, v) => s + (v - meanEffect) ** 2, 0) /
            (effectValues.length - 1)
        )
      : 0;

  const [ciLower, ciUpper] = bootstrapCI(effectValues, nPerms);

  // 置换检验需要完整的 treated/donor 轨迹
  const treatedTrajectories = effects.map((e) => {
    // 从 effects 重建最小轨迹（仅用于置换检验的 distance 计算）
    // 实际上置换检验需要完整轨迹，这里用 effects 的信息近似
    return null; // 置换检验在 analyzeCausalEffects 中传入完整轨迹
  });

  return {
    label,
    nTreated: effects.length,
    nDonors: donors.length,
    meanObservedTau: meanObserved,
    meanCounterfactualTau: meanCounterfactual,
    meanEffect,
    effectStd,
    ciLower,
    ciUpper,
    pValue: NaN, // 在 analyzeCausalEffects 中单独计算
    cohensD: computeCohensD(observedTaes, counterfactualTaes),
  };
}

// ============================================================================
// 主入口: 完整因果分析
// ============================================================================

/**
 * 对一组实验数据执行完整的因果分析。
 *
 * @param allTrajectories 所有实验的轨迹（treated + donors）
 * @param k 匹配的最近邻数量
 * @param nPerms 置换检验次数
 * @param nBootstrap bootstrap 次数
 */
export function analyzeCausalEffects(
  allTrajectories: ExperimentTrajectory[],
  k: number = 5,
  nPerms: number = 10000,
  nBootstrap: number = 10000
): CausalAnalysisResult {
  // 按任务×轮次分组
  const groups = new Map<string, { treated: ExperimentTrajectory[]; donors: ExperimentTrajectory[] }>();

  for (const traj of allTrajectories) {
    const key = `${traj.task}_${traj.totalRounds}`;
    if (!groups.has(key)) {
      groups.set(key, { treated: [], donors: [] });
    }
    const group = groups.get(key)!;

    // 判定 treated vs donor
    // donor = ablation === "none"
    // treated = ablation 包含 "full" 或以 "full_" 开头
    if (traj.ablation === "none") {
      group.donors.push(traj);
    } else if (
      traj.ablation === "full" ||
      traj.ablation.startsWith("full_")
    ) {
      group.treated.push(traj);
    }
    // shuffle / detect-only / adaptive 等模式暂不纳入因果分析
  }

  const overallATE: CausalSummary[] = [];
  const perInterventionType: CausalSummary[] = [];
  const perInterventionRound: CausalSummary[] = [];
  const individualEffects: CausalEffect[] = [];

  for (const [groupKey, group] of groups) {
    const { treated, donors } = group;

    if (treated.length === 0 || donors.length === 0) continue;

    // 估计每个处理实验的因果效应
    const effects = treated.map((t) => estimateCausalEffect(t, donors, k));
    individualEffects.push(...effects);

    // Overall ATE
    const observedTaes = effects.map((e) => e.observedTau);
    const counterfactualTaes = effects.map((e) => e.counterfactualTau);
    const effectValues = effects.map((e) => e.effect);
    const meanEffect =
      effectValues.reduce((a, b) => a + b, 0) / effectValues.length;
    const [ciLower, ciUpper] = bootstrapCI(effectValues, nBootstrap);
    const pValue = permutationTest(treated, donors, k, nPerms);

    overallATE.push({
      label: groupKey,
      nTreated: treated.length,
      nDonors: donors.length,
      meanObservedTau:
        observedTaes.reduce((a, b) => a + b, 0) / observedTaes.length,
      meanCounterfactualTau:
        counterfactualTaes.reduce((a, b) => a + b, 0) / counterfactualTaes.length,
      meanEffect,
      effectStd:
        effectValues.length > 1
          ? Math.sqrt(
              effectValues.reduce((s, v) => s + (v - meanEffect) ** 2, 0) /
                (effectValues.length - 1)
            )
          : 0,
      ciLower,
      ciUpper,
      pValue,
      cohensD: computeCohensD(observedTaes, counterfactualTaes),
    });

    // Per-Intervention-Type
    const byType = new Map<CausalInterventionType, CausalEffect[]>();
    for (const eff of effects) {
      if (eff.firstInterventionType) {
        if (!byType.has(eff.firstInterventionType)) {
          byType.set(eff.firstInterventionType, []);
        }
        byType.get(eff.firstInterventionType)!.push(eff);
      }
    }

    for (const [intvType, typeEffects] of byType) {
      const typeEffectValues = typeEffects.map((e) => e.effect);
      const typeObserved = typeEffects.map((e) => e.observedTau);
      const typeCounterfactual = typeEffects.map((e) => e.counterfactualTau);
      const typeMean =
        typeEffectValues.reduce((a, b) => a + b, 0) / typeEffectValues.length;
      const [typeCiLower, typeCiUpper] = bootstrapCI(
        typeEffectValues,
        nBootstrap
      );

      perInterventionType.push({
        label: `${groupKey} | ${intvType}`,
        nTreated: typeEffects.length,
        nDonors: donors.length,
        meanObservedTau:
          typeObserved.reduce((a, b) => a + b, 0) / typeObserved.length,
        meanCounterfactualTau:
          typeCounterfactual.reduce((a, b) => a + b, 0) /
          typeCounterfactual.length,
        meanEffect: typeMean,
        effectStd:
          typeEffectValues.length > 1
            ? Math.sqrt(
                typeEffectValues.reduce((s, v) => s + (v - typeMean) ** 2, 0) /
                  (typeEffectValues.length - 1)
              )
            : 0,
        ciLower: typeCiLower,
        ciUpper: typeCiUpper,
        pValue: NaN, // 分组后样本太小，置换检验不稳定，不计算
        cohensD: computeCohensD(typeObserved, typeCounterfactual),
      });
    }

    // Per-Intervention-Round
    const byRound = new Map<number, CausalEffect[]>();
    for (const eff of effects) {
      if (eff.firstInterventionRound !== null) {
        if (!byRound.has(eff.firstInterventionRound)) {
          byRound.set(eff.firstInterventionRound, []);
        }
        byRound.get(eff.firstInterventionRound)!.push(eff);
      }
    }

    for (const [round, roundEffects] of byRound) {
      const roundEffectValues = roundEffects.map((e) => e.effect);
      const roundObserved = roundEffects.map((e) => e.observedTau);
      const roundCounterfactual = roundEffects.map((e) => e.counterfactualTau);
      const roundMean =
        roundEffectValues.reduce((a, b) => a + b, 0) /
        roundEffectValues.length;
      const [roundCiLower, roundCiUpper] = bootstrapCI(
        roundEffectValues,
        nBootstrap
      );

      perInterventionRound.push({
        label: `${groupKey} | round ${round}`,
        nTreated: roundEffects.length,
        nDonors: donors.length,
        meanObservedTau:
          roundObserved.reduce((a, b) => a + b, 0) / roundObserved.length,
        meanCounterfactualTau:
          roundCounterfactual.reduce((a, b) => a + b, 0) /
          roundCounterfactual.length,
        meanEffect: roundMean,
        effectStd:
          roundEffectValues.length > 1
            ? Math.sqrt(
                roundEffectValues.reduce(
                  (s, v) => s + (v - roundMean) ** 2,
                  0
                ) / (roundEffectValues.length - 1)
              )
            : 0,
        ciLower: roundCiLower,
        ciUpper: roundCiUpper,
        pValue: NaN,
        cohensD: computeCohensD(roundObserved, roundCounterfactual),
      });
    }
  }

  return {
    overallATE,
    perInterventionType,
    perInterventionRound,
    individualEffects,
    method:
      "Nearest-Neighbor Trajectory Matching (k=5) + Permutation Test (10000) + Bootstrap CI (10000)",
    assumptions: [
      "SUTVA: 实验间无干扰（设计保证，每个实验独立运行）",
      "条件可忽略性: 给定第 1 轮轨迹，treatment assignment 近似随机",
      "正支撑: 处理组的第 1 轮轨迹在 donor pool 中有重叠",
      "前置期仅 1 轮（干预最早在第 1 轮后触发），匹配可能弱",
      "样本量小 (n=15/cell)，统计功效有限",
      "历史数据存在治理环路断裂问题（2026-07-12 修复前），state-modification 类干预 (reduce_weight, force_reflection) 效应可能被低估",
    ],
  };
}
