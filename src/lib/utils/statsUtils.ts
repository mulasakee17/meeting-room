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
//
// 将 agent 信念系统映射为统计物理量：
//   - 信息熵 H: 信念分布的均匀度（Shannon 熵，归一化到 [0,1]）
//   - 社会温度 T: 信念标准差 σ（粒子运动剧烈度的类比）
//   - 自由能 F:  F = (1-R) + T·H （总无序度量，F 低=有序）
//
// F 的设计依据：结构性无序 (1-R) + 热性无序 (T·H)。
// 在标准热力学中 F = U - TS，但社会系统中温度本身由系统状态决定，
// 故采用正则化形式 F = U + TS 以保证 "F 低=有序" 的直觉成立。
// 详见 MATHEMATICAL_FRAMEWORK.md §14。
// ============================================================================

/**
 * Shannon 信息熵（归一化到 [0,1]）
 *
 * 将值域 [min, max] 等分为 bins 个箱，统计每箱的频率，
 * 计算 H = -Σ pᵢ log₂ pᵢ，再除以最大熵 log₂(bins)。
 *
 * - H = 0: 所有值集中在同一箱（完全共识或双峰聚集）
 * - H = 1: 值均匀分布在所有箱（最大分散）
 *
 * 用于区分 Kuramoto R 无法区分的状态：
 *   均匀分歧 (R低, H高) vs 双峰极化 (R低, H低)
 */
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
 * 社会自由能 F = (1-R) + T·H
 *
 * @param orderParam R — Kuramoto 序参量 ∈ [0,1]（0=完全无序，1=完全同步）
 * @param temperature T — 社会温度（信念标准差 σ）∈ [0, ∞)
 * @param entropy    H — 信息熵 ∈ [0,1]
 * @returns F ∈ [0, ∞)，F 低=有序，F 高=无序
 *
 * 四种状态的区分：
 *   真共识:     R≈1, T≈0, H≈0 → F≈0（最低，最有序）
 *   中度共识:   R≈0.9, T≈0.14, H≈0.5 → F≈0.17
 *   双峰极化:   R≈0, T≈0.8, H≈0.5 → F≈1.4
 *   均匀分歧:   R≈0, T≈0.6, H≈1.0 → F≈1.6（最高，最无序）
 */
export function socialFreeEnergy(
  orderParam: number,
  temperature: number,
  entropy: number
): number {
  const U = 1 - orderParam;       // 结构性无序
  const TS = temperature * entropy; // 热性无序
  return U + TS;
}

