/**
 * statsUtils — 统计计算工具
 *
 * 消除 governance/index.ts、evaluation/index.ts、discussion/index.ts
 * 6+ 处内联的 mean/std/variance 计算。
 */

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

/** Cohen's d（pooled 标准差，含 n<2 guard） */
export function cohensD(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return 0;
  const ma = mean(a), mb = mean(b);
  const va = a.reduce((s, v) => s + (v - ma) ** 2, 0) / (a.length - 1);
  const vb = b.reduce((s, v) => s + (v - mb) ** 2, 0) / (b.length - 1);
  const sp = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
  return sp === 0 ? 0 : (ma - mb) / sp;
}

/** mulberry32 seeded PRNG（替代 src/ 下 8 份副本） */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Kuramoto 序参量 R — 群体共识度（基于标量 beliefs）
 *
 * θ = b × (π/2): belief ∈ [-1,1] → angle ∈ [-π/2, π/2]
 *   b=-1 (强反对) → θ=-π/2 (单位圆下方)
 *   b=+1 (强支持) → θ=+π/2 (单位圆上方)
 *   两者正对，R≈0 (低共识) — 正确反映极化
 * R = |Σ e^(iθ_j)| / N ∈ [0,1]
 *
 * 注意：旧映射 θ=b×π 使 b=±0.99 在单位圆上几乎重合 (都在(-1,0)附近)，
 * R≈1，误判极化为共识。当前 θ=b×π/2 已修复此问题。
 *
 * 统一来源：原 evaluation/index.ts:784 与 governance/index.ts:831 的重复实现。
 */
export function computeKuramotoOrder(beliefs: number[]): number {
  if (beliefs.length === 0) return 0;
  const angles = beliefs.map(b => b * Math.PI / 2);
  let sumReal = 0, sumImag = 0;
  for (const angle of angles) {
    sumReal += Math.cos(angle);
    sumImag += Math.sin(angle);
  }
  return Math.sqrt(sumReal * sumReal + sumImag * sumImag) / beliefs.length;
}

/** 方差 */
export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / values.length;
}

/** 最大值与最小值之差 */
export function range(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

/** 将值线性映射到 [0, 1] 区间 */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

/** 四舍五入到指定小数位 */
export function round(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ============================================================================
// Legacy scalar-belief monitoring metrics
// ============================================================================

/** Shannon 信息熵（归一化到 [0,1]） */
export function shannonEntropy(
  values: number[],
  bins: number = 5,
  min: number = -1,
  max: number = 1
): number {
  if (values.length === 0 || bins < 2) return 0;

  const binWidth = (max - min) / bins;
  const counts = new Array(bins).fill(0);

  for (const v of values) {
    const clamped = Math.max(min, Math.min(max, v));
    let idx = Math.floor((clamped - min) / binWidth);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }

  const n = values.length;
  let entropy = 0;
  for (const count of counts) {
    if (count > 0) {
      const p = count / n;
      entropy -= p * Math.log2(p);
    }
  }

  const maxEntropy = Math.log2(bins);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

/**
 * 温度 T 的显式归一化。
 *
 * 对 beliefs ∈ [min, max]，总体标准差的理论上界为 (max-min)/2
 * （双峰分布在端点等概率时取得）。除以此上界将 T 归一化到 [0,1]，
 * 与 R、H 量纲一致。
 *
 * 注：当前 beliefs ∈ [-1,1] 时上界 = 1.0，故 raw std 本就在 [0,1]，
 * 此函数主要是把"隐式归一化"显式化，并防御未来 belief 范围扩展。
 */
export function normalizeTemperature(
  std: number,
  beliefRange: [number, number] = [-1, 1]
): number {
  const maxStd = (beliefRange[1] - beliefRange[0]) / 2;
  if (maxStd <= 0) return 0;
  return Math.min(1, Math.max(0, std / maxStd));
}

/**
 * Versioned compatibility score for the frozen scalar-belief path.
 * This is an uncalibrated heuristic, not a physical free energy.
 */
export function legacyScalarDisorderScoreV1(
  orderParam: number,
  temperature: number,
  entropy: number
): number {
  const U = 1 - orderParam;
  const TS = temperature * entropy;
  return U + TS;
}

/** @deprecated Use legacyScalarDisorderScoreV1(). */
export const socialFreeEnergy = legacyScalarDisorderScoreV1;
