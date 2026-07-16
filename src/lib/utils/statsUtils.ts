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
// 社会热力学指标 — Social Thermodynamics Metrics
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

/** 社会自由能 F = (1-R) + T·H */
export function socialFreeEnergy(
  orderParam: number,
  temperature: number,
  entropy: number
): number {
  const U = 1 - orderParam;
  const TS = temperature * entropy;
  return U + TS;
}

