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
    const raw = JSON.parse(content) as ExperimentResult & { error?: string };
    if (raw.error) return null;
    return raw;
  }).filter((r): r is ExperimentResult => r !== null);
}
