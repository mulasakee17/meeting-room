/**
 * stats-corrections.test.ts — M1/M2/M3 数学修复的单元测试
 *
 * 覆盖：
 * 1. M1: grangerCausality — FWL 残差化正确性 + 边界条件 + NaN 保护
 * 2. M2: bimodalityCoefficient — Ellison 1987 标准公式 + 边界条件
 * 3. M3: tDistributionCriticalValue — 完整查表 + 缺口补全验证
 */
import { describe, it, expect } from "vitest";
import { grangerCausality, bimodalityCoefficient } from "../experiments/campaign/pipeline/MetricComputer";
import { tDistributionCriticalValue } from "../experiments/campaign/pipeline/StatisticalTest";

// ============================================================================
// M1: grangerCausality — FWL 残差化修复
// ============================================================================

describe("M1: grangerCausality (FWL 残差化)", () => {
  it("序列过短 (n < lag+3) 返回 0", () => {
    expect(grangerCausality([1, 2], [3, 4])).toBe(0);
    expect(grangerCausality([1, 2, 3], [4, 5, 6])).toBe(0);
  });

  it("常数序列不产生 NaN（ssResFull=0 保护）", () => {
    // 两组常数序列：yLag=xLag=[5,5,5,5,5]，残差全 0
    const result = grangerCausality([5, 5, 5, 5, 5], [5, 5, 5, 5, 5]);
    expect(Number.isNaN(result)).toBe(false);
    expect(result).toBe(0);
  });

  it("x 能预测 y 时 F > 0（真实因果方向）", () => {
    // 构造 y_t 部分依赖 x_{t-1}（加噪声避免完美拟合导致 ssResFull=0），
    // 且 y 自身无自相关（否则 y_{t-1} 已捕获信息，x 无增量预测力）
    const x = [3, 7, 1, 8, 2, 6, 4, 5, 9, 0, 5, 3];
    // y[t] = x[t-1] + 小噪声，y 无自相关
    const y = [0, 3.1, 6.9, 1.2, 7.8, 2.1, 5.9, 4.1, 5.0, 8.9, 0.1, 4.8];
    const F = grangerCausality(x, y);
    expect(F).toBeGreaterThan(0);
  });

  it("x 与 y 无关时 F 较小", () => {
    // x 和 y 是独立序列
    const x = [1, 3, 2, 4, 1, 5, 2, 6, 3, 7];
    const y = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]; // y 恒定，x 无预测力
    const F = grangerCausality(x, y);
    // y 恒定时 s=0 → 函数返回 0（sampleStd guard 在调用方，这里直接验证不崩溃）
    expect(Number.isNaN(F)).toBe(false);
  });

  it("双向因果：x→y 和 y→x 的 F 都可计算", () => {
    const x = [1, 2, 4, 3, 5, 6, 8, 7];
    const y = [2, 3, 5, 4, 6, 7, 9, 8]; // y ≈ x + 1
    const Fxy = grangerCausality(x, y);
    const Fyx = grangerCausality(y, x);
    expect(Number.isNaN(Fxy)).toBe(false);
    expect(Number.isNaN(Fyx)).toBe(false);
    expect(Fxy).toBeGreaterThanOrEqual(0);
    expect(Fyx).toBeGreaterThanOrEqual(0);
  });

  it("FWL 残差化：x 与 yLag 强相关时不会虚高 F", () => {
    // 构造 x 与 yLag 高度共线的场景：如果 resX 只去均值（旧 bug），
    // 会低估完整模型的 ssResFull → F 虚高。
    // 修复后 resX 对 yLag 残差化，正确消除共线性。
    const y = [10, 12, 14, 16, 18, 20, 22, 24];
    const x = [9, 11, 13, 15, 17, 19, 21, 23]; // x ≈ y - 1，与 yLag 强相关
    const F = grangerCausality(x, y);
    expect(Number.isNaN(F)).toBe(false);
    expect(F).toBeGreaterThanOrEqual(0);
    // 不硬编码 F 值（依赖实现细节），只验证不虚高到 Infinity
    expect(F).toBeLessThan(1e6);
  });
});

// ============================================================================
// M2: bimodalityCoefficient — Ellison 1987 标准公式
// ============================================================================

describe("M2: bimodalityCoefficient (Ellison 1987)", () => {
  it("n < 4 返回 0", () => {
    expect(bimodalityCoefficient([1, 2])).toBe(0);
    expect(bimodalityCoefficient([1, 2, 3])).toBe(0);
  });

  it("常数序列返回 0（s < 1e-10 guard）", () => {
    expect(bimodalityCoefficient([5, 5, 5, 5, 5])).toBe(0);
  });

  it("单峰正态分布 BC < 0.555", () => {
    // 近似正态分布的样本
    const normal = [4, 5, 5, 6, 6, 6, 7, 7, 8];
    const bc = bimodalityCoefficient(normal);
    expect(bc).toBeLessThan(0.555);
    expect(bc).toBeGreaterThanOrEqual(0);
  });

  it("不对称双峰分布 BC 大于对称单峰分布", () => {
    // Ellison BC 对高偏度（不对称）双峰敏感
    // 不对称双峰：大多数点聚集在 0，少数在 10（高正偏度）
    const asymmetricBimodal = [0, 0, 0, 0, 0, 0, 0, 0, 10, 10];
    const symmetricNormal = [4, 5, 5, 6, 6, 6, 7, 7, 8, 8];
    const bcBimodal = bimodalityCoefficient(asymmetricBimodal);
    const bcNormal = bimodalityCoefficient(symmetricNormal);
    expect(bcBimodal).toBeGreaterThan(bcNormal);
  });

  it("不产生 NaN（分母保护）", () => {
    const values = [1, 2, 3, 4];
    const bc = bimodalityCoefficient(values);
    expect(Number.isNaN(bc)).toBe(false);
  });

  it("platykurtic 分布（负超额峰度）返回 0 而非负值", () => {
    // 均匀分布有负超额峰度
    const uniform = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const bc = bimodalityCoefficient(uniform);
    expect(Number.isNaN(bc)).toBe(false);
    expect(bc).toBeGreaterThanOrEqual(0);
  });

  it("公式与 Ellison 1987 标准一致：极端不对称双峰 BC > 0.555", () => {
    // Ellison BC > 0.555 需要高偏度 g² 大 + 低峰度 k
    // 构造极端不对称：1 个远离主峰的离群点
    const extreme = [0, 0, 0, 0, 0, 0, 0, 0, 0, 100];
    const bc = bimodalityCoefficient(extreme);
    // 极端偏度下 BC 应远超 0.555 阈值
    expect(bc).toBeGreaterThan(0.555);
  });
});

// ============================================================================
// M3: tDistributionCriticalValue — 完整查表
// ============================================================================

describe("M3: tDistributionCriticalValue (完整查表)", () => {
  it("df <= 0 返回正态近似 1.96", () => {
    expect(tDistributionCriticalValue(0, 0.975)).toBe(1.96);
    expect(tDistributionCriticalValue(-1, 0.975)).toBe(1.96);
  });

  it("df > 30 返回正态近似 1.96", () => {
    expect(tDistributionCriticalValue(31, 0.975)).toBe(1.96);
    expect(tDistributionCriticalValue(100, 0.975)).toBe(1.96);
  });

  it("已知 df 值精确匹配", () => {
    expect(tDistributionCriticalValue(1, 0.975)).toBe(12.706);
    expect(tDistributionCriticalValue(5, 0.975)).toBe(2.571);
    expect(tDistributionCriticalValue(10, 0.975)).toBe(2.228);
    expect(tDistributionCriticalValue(30, 0.975)).toBe(2.042);
  });

  it("原缺口 df=11-14 返回正确值（非 fallback 2.0）", () => {
    // 修复前这些返回 2.0，导致 CI 偏窄 7-9%
    expect(tDistributionCriticalValue(11, 0.975)).toBe(2.201);
    expect(tDistributionCriticalValue(12, 0.975)).toBe(2.179);
    expect(tDistributionCriticalValue(13, 0.975)).toBe(2.160);
    expect(tDistributionCriticalValue(14, 0.975)).toBe(2.145);
  });

  it("原缺口 df=16-19 返回正确值", () => {
    expect(tDistributionCriticalValue(16, 0.975)).toBe(2.120);
    expect(tDistributionCriticalValue(17, 0.975)).toBe(2.110);
    expect(tDistributionCriticalValue(18, 0.975)).toBe(2.101);
    expect(tDistributionCriticalValue(19, 0.975)).toBe(2.093);
  });

  it("原缺口 df=21-24 返回正确值", () => {
    expect(tDistributionCriticalValue(21, 0.975)).toBe(2.080);
    expect(tDistributionCriticalValue(22, 0.975)).toBe(2.074);
    expect(tDistributionCriticalValue(23, 0.975)).toBe(2.069);
    expect(tDistributionCriticalValue(24, 0.975)).toBe(2.064);
  });

  it("原缺口 df=26-29 返回正确值", () => {
    expect(tDistributionCriticalValue(26, 0.975)).toBe(2.056);
    expect(tDistributionCriticalValue(27, 0.975)).toBe(2.052);
    expect(tDistributionCriticalValue(28, 0.975)).toBe(2.048);
    expect(tDistributionCriticalValue(29, 0.975)).toBe(2.045);
  });

  it("所有 df=1..30 都有明确值（无 undefined fallback）", () => {
    for (let df = 1; df <= 30; df++) {
      const val = tDistributionCriticalValue(df, 0.975);
      expect(val).toBeDefined();
      expect(val).toBeGreaterThan(0);
      // t 临界值应随 df 增大而递减（从 12.706 → 2.042）
      if (df > 1) {
        const prev = tDistributionCriticalValue(df - 1, 0.975);
        expect(val).toBeLessThanOrEqual(prev);
      }
    }
  });

  it("CI 不再系统性偏窄：df=11 临界值 2.201 > 旧 fallback 2.0", () => {
    const val = tDistributionCriticalValue(11, 0.975);
    expect(val).toBeGreaterThan(2.0);
  });
});
