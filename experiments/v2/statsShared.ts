/**
 * statsShared — 实验脚本共享的统计工具与类型
 *
 * 消除 experiments/v2/ 下 11 份 mulberry32、5-9 份 cohensD/mean/std、
 * 9 份 ExperimentResult 接口的重复定义。
 *
 * 注意：生产代码（src/）使用 src/lib/utils/statsUtils.ts，本文件仅供实验脚本用。
 */

import * as fs from "fs";
import * as path from "path";
import { safeJsonParse } from "../../src/lib/utils/jsonUtils";
import { matchCanonicalOption } from "../../src/lib/observation/optionCanonicalization";

// ============================================================================
// 类型定义
// ============================================================================

/** 实验结果（统一接口，替代 9 份重复定义） */
export interface ExperimentResult {
  runId: string;
  ablation: string;
  runIndex?: number;
  timestamp?: string;
  kendallTau: number;
  decisionQuality: number;
  tauTrajectory?: number[];
  totalRounds?: number;
  converged?: boolean;
  consensusLevel?: number;
  opinionDiversity?: number;
  totalInterventions?: number;
  issuesDetected?: string[];
  interventionEffects?: Array<{
    round: number;
    interventionType: string;
    targetAgentId: string;
    beliefBefore: number;
    beliefAfter: number;
    effective: boolean;
  }>;
  interventionBreakdown?: Record<string, number>;
  tokenUsage?: {
    byAgent: Record<string, {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      totalLatencyMs: number;
      callCount: number;
    }>;
  };
  rounds?: Array<Record<string, unknown>>;
}

// ============================================================================
// 基础统计
// ============================================================================

/** 算术平均值 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 总体标准差（除以 n） */
export function std(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / values.length);
}

/** 样本标准差（除以 n-1） */
export function sampleStd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / (values.length - 1));
}

/** Cohen's d（ pooled 标准差，含 n<2 guard） */
export function cohensD(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return 0;
  const ma = mean(a), mb = mean(b);
  const va = a.reduce((s, v) => s + (v - ma) ** 2, 0) / (a.length - 1);
  const vb = b.reduce((s, v) => s + (v - mb) ** 2, 0) / (b.length - 1);
  const sp = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
  return sp === 0 ? 0 : (ma - mb) / sp;
}

/** Cohen's d_z（配对样本效应量，d_z = mean(diffs) / sampleStd(diffs)，含 n<2 guard） */
export function cohensDz(diffs: number[]): number {
  if (diffs.length < 2) return 0;
  const sd = sampleStd(diffs);
  return sd === 0 ? 0 : mean(diffs) / sd;
}

// ============================================================================
// PRNG
// ============================================================================

/** mulberry32 seeded PRNG（单一定义，替代 11 份副本） */
export function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * 统一统计检验 seed 常量（H-Fix: 跨脚本 p 值可复现性）
 *
 * 历史问题：analyze.ts 用 42+0x50E8，analyze_async/bayesianAnalysis/verifyFindings 用 42，
 * 导致同一份数据在不同脚本中 p 值不同。现统一为 PERMUTATION_SEED=42，bootstrap 用独立流
 * BOOTSTRAP_SEED=42+0x5EED 避免与置换检验共享 PRNG 状态。
 *
 * 例外：ab_fdecomposition_paired.ts 和 backtest_weight_assumption.ts 用 20260719 作为
 * 已修复数据的版本标记，改动会破坏已发布数据的可复现性，故保留。
 */
export const PERMUTATION_SEED = 42;
export const BOOTSTRAP_SEED = 42 + 0x5EED;

// ============================================================================
// 数据加载
// ============================================================================

/** 从目录加载实验结果 JSON 文件（过滤 error 文件和 summary.json） */
export function loadData(dir: string, prefix: string): ExperimentResult[] {
  const files = fs.readdirSync(dir).filter(
    f => f.endsWith(".json") && f.startsWith(prefix) && f !== "summary.json"
  );
  return files.map(f => {
    const content = fs.readFileSync(path.join(dir, f), "utf-8");
    // 安全解析：损坏的 JSON 文件不再中断整个加载链（项目硬约束：用 safeJsonParse 替代裸 JSON.parse）
    const raw = safeJsonParse<ExperimentResult & { error?: string }>(content);
    if (!raw) {
      console.warn(`[loadData] 跳过无法解析的文件: ${f}`);
      return null;
    }
    if (raw.error) return null;
    return raw;
  }).filter((r): r is ExperimentResult => r !== null);
}

/**
 * 从目录加载实验结果，按 ablation 字段精确过滤（修复 startsWith 污染）。
 *
 * B2 修复：startsWith("crisis_full") 会误包含 crisis_full_fixed 文件，
 * 导致 n=24 变成 n=32。本函数用 ablation 字段精确过滤。
 *
 * @param dir 数据目录
 * @param prefix 文件名前缀（如 "crisis_full"）
 * @param ablationFilter 按 ablation 字段过滤（如 "full" 排除 "full_fixed"）
 * @example
 *   loadExperiments(dir, "crisis_full", "full")  // 24 个，排除 full_fixed
 *   loadExperiments(dir, "crisis_none", "none")  // 24 个
 *   loadExperiments(dir, "crisis_full")           // 32 个（向后兼容，含 fixed）
 */
export function loadExperiments(
  dir: string,
  prefix: string,
  ablationFilter?: string,
): ExperimentResult[] {
  const all = loadData(dir, prefix);
  return ablationFilter === undefined
    ? all
    : all.filter(r => r.ablation === ablationFilter);
}

// ============================================================================
// 排名提取与相关性（统一权威实现，替代 run.ts/run_async_ab.ts/dataPackage.ts 重复副本）
// ============================================================================

/**
 * 边界归一化：将 LLM 输出的 item 名映射到 task 定义的规范名。
 *
 * 根因：LLM 倾向输出短名/别名（"方案B"），task 的 correctAnswer/searchKeys
 * 使用全名（"方案B-分阶段响应"）。下游所有指标（τ/acc/δ/thermo）依赖精确
 * 字符串匹配——名称不一致会导致指标静默错误。
 *
 * 匹配策略（优先级递降）：
 *   1. 精确匹配 (llmName === canonicalName)
 *   2. 子串匹配——选最长重叠的规范名（"方案B" ⊂ "方案B-分阶段响应"）
 *   3. searchKeys 关键词匹配
 *   4. 无匹配 → 返回 null
 *
 * @param llmName        LLM 输出的 item 名
 * @param canonicalNames task 定义的规范名列表
 * @param searchKeys     可选的关键词映射（规范名 → 别名列表）
 * @returns 匹配的规范名，或 null
 */
export function normalizeItemName(
  llmName: string,
  canonicalNames: string[],
  searchKeys?: Record<string, string[]>,
): string | null {
  const match = matchCanonicalOption(llmName, canonicalNames, searchKeys);
  return match.status === "matched" ? match.canonical ?? null : null;
}

/**
 * 从 itemBeliefs 聚合提取排名（唯一路径，不再有 fallback）。
 *
 * 修复 P0-1：旧版有 V1 fallback（首次提及位置启发式）——当 itemBeliefs
 * 为空时静默降级，产生与 V2 路径不可直接对比的 τ 值。现统一为 itemBeliefs
 * 聚合路径，itemBeliefs 为空时抛出错误（调用方已有 try-catch 隔离）。
 *
 * P0 fail-closed：任何无法唯一匹配的标签或缺失规范选项都会抛错。
 * 不允许位置对齐、Object.keys 插入顺序或 ground-truth 排名参与恢复。
 */
export function extractRanking(
  _decision: string,
  itemNames: string[],
  itemBeliefs?: Array<{ item: string; rank: number; belief: number; confidence: number }>,
  searchKeys?: Record<string, string[]>,
): string[] {
  if (!itemBeliefs || itemBeliefs.length === 0) {
    throw new Error("extractRanking: itemBeliefs 为空，无法提取排名。请检查 LLM 输出格式。");
  }

  const itemRanks = new Map<string, number[]>();
  const invalidLabels: string[] = [];

  for (const ib of itemBeliefs) {
    const match = matchCanonicalOption(ib.item, itemNames, searchKeys);
    if (match.status !== "matched"
      || !match.canonical
      || !Number.isInteger(ib.rank)
      || ib.rank < 1
      || ib.rank > itemNames.length) {
      invalidLabels.push(ib.item);
      continue;
    }
    if (!itemRanks.has(match.canonical)) itemRanks.set(match.canonical, []);
    itemRanks.get(match.canonical)!.push(ib.rank);
  }

  if (invalidLabels.length > 0) {
    throw new Error(
      `extractRanking: 存在无法唯一映射的选项标签: ${[...new Set(invalidLabels)].join(", ")}`,
    );
  }

  const missingOptions = itemNames.filter(name => !itemRanks.has(name));
  if (missingOptions.length > 0) {
    throw new Error(`extractRanking: 排名不完整，缺少规范选项: ${missingOptions.join(", ")}`);
  }

  const avgRanks = itemNames.map(name => {
    const ranks = itemRanks.get(name)!;
    return { name, avgRank: ranks.reduce((a, b) => a + b, 0) / ranks.length };
  });
  const sortedRankValues = avgRanks.map(item => item.avgRank).sort((a, b) => a - b);
  for (let i = 1; i < sortedRankValues.length; i++) {
    if (Math.abs(sortedRankValues[i] - sortedRankValues[i - 1]) < 1e-12) {
      throw new Error("extractRanking: group ranking contains an unresolved average-rank tie");
    }
  }
  avgRanks.sort((a, b) => a.avgRank - b.avgRank);
  return avgRanks.map(r => r.name);
}

/**
 * Kendall's τ-b rank correlation coefficient.
 * τ = (concordant_pairs - discordant_pairs) / sqrt((n0 - n1)(n0 - n2))
 * where n0 = n*(n-1)/2, n1 = Σ(t_i*(t_i-1)/2) for ties in x, n2 for ties in y.
 * Returns value in [-1, 1].
 */
export function kendallTau(groundTruth: Record<string, number>, extracted: string[]): number {
  const items = Object.keys(groundTruth);
  const n = items.length;
  if (n < 2) return 0;

  // Build rank vectors
  const gtRank = new Map<string, number>();
  for (const [item, rank] of Object.entries(groundTruth)) {
    gtRank.set(item, rank);
  }

  const x: number[] = [];
  const y: number[] = [];
  for (const item of items) {
    const gt = gtRank.get(item) ?? 0;
    const extIdx = extracted.indexOf(item);
    const ext = extIdx >= 0 ? extIdx + 1 : n + 1; // unmentioned items rank last
    x.push(gt);
    y.push(ext);
  }

  // Count concordant and discordant pairs
  let concordant = 0;
  let discordant = 0;
  // 精确 tie 分组计算：统计每个 rank 值出现的次数
  const xGroups = new Map<number, number>();
  const yGroups = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    xGroups.set(x[i], (xGroups.get(x[i]) || 0) + 1);
    yGroups.set(y[i], (yGroups.get(y[i]) || 0) + 1);
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j];
      const dy = y[i] - y[j];
      if (dx * dy > 0) concordant++;
      else if (dx * dy < 0) discordant++;
    }
  }

  // τ-b 精确 tie 修正：n1 = Σ t_i*(t_i-1)/2，按 tie 组分组求和
  const n0 = n * (n - 1) / 2;
  let n1 = 0;
  for (const count of xGroups.values()) n1 += count * (count - 1) / 2;
  let n2 = 0;
  for (const count of yGroups.values()) n2 += count * (count - 1) / 2;
  const denom = Math.sqrt((n0 - n1) * (n0 - n2));

  return denom === 0 ? 0 : (concordant - discordant) / denom;
}

/**
 * Kuramoto 序参量 R = |Σ e^(iθ_j)| / N，θ = belief × π/2。R ∈ [0, 1]。
 * 用于度量 agent 信念的同步程度（consensusLevel）。
 */
export function kuramotoR(beliefs: number[]): number {
  const n = beliefs.length;
  if (n === 0) return 0;
  let sumCos = 0, sumSin = 0;
  for (const b of beliefs) {
    const theta = b * Math.PI / 2;
    sumCos += Math.cos(theta);
    sumSin += Math.sin(theta);
  }
  return Math.sqrt(sumCos * sumCos + sumSin * sumSin) / n;
}
