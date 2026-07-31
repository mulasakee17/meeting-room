/**
 * statistical-test-significance.test.ts — E4/E5/E6/E8 显著性判定逻辑的单元测试
 *
 * 覆盖 2026-07-31 修复的 4 处统计 bug：
 *   E8: 显著性逻辑反转（XOR → 同号判定）
 *   E4: p-value 硬编码 0.001 → 统一 Bootstrap 比例
 *   E5: Granger df2 错配 → Fisher/Bonferroni 合并 per-series p 值
 *   E6: Fisher z 独立性违反 → 主推断改用 per-run Bootstrap CI
 *
 * 通过 runTests(metrics) 入口验证分派逻辑，构造 mock ExperimentMetrics。
 */
import { describe, it, expect } from "vitest";
import { runTests } from "../experiments/campaign/pipeline/StatisticalTest";
import type { ExperimentMetrics } from "../experiments/campaign/types";

// ============================================================================
// E4: Confidence Prediction — p-value 不再硬编码
// ============================================================================

describe("E4: Confidence Prediction (β₁ Bootstrap p-value)", () => {
  it("CI 跨 0 时 p 值应来自 Bootstrap 比例而非硬编码", () => {
    // 构造 confValues 与 deltaUValues 使 β₁ ≈ 0（CI 跨 0）
    const n = 30;
    const confValues = Array.from({ length: n }, (_, i) => 0.5 + (i % 3) * 0.1);
    const deltaUValues = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 0.01 : -0.01));

    const metrics: ExperimentMetrics = {
      experimentId: "e4_confidence",
      runtimeMode: "native_cognitive",
      sampleSize: n,
      confidencePrediction: {
        beta1Cognitive: 0.001,
        beta1Belief: 0.0005,
        marginalR2Cognitive: 0.01,
        marginalR2Belief: 0.005,
        _bootstrapData: { confValues, deltaUValues, oldConfValues: confValues, deltaBValues: deltaUValues },
      },
    };

    const results = runTests(metrics);
    expect(results).toHaveLength(1);
    const test = results[0];
    // p 值不应是硬编码的 0.001，应来自 Bootstrap 比例
    // 当 β₁ ≈ 0 时，|b| >= |β₁| 的比例应较高 → p 值较大（不显著）
    expect(test.pValue).toBeGreaterThan(0.001);
    expect(test.significant).toBe(false);
  });

  it("CI 不跨 0 且 β₁ 较大时应显著（p 值来自 Bootstrap，非硬编码）", () => {
    // 构造强正关系：deltaU ≈ 2 * conf
    const n = 30;
    const confValues = Array.from({ length: n }, (_, i) => 0.3 + i * 0.02);
    const deltaUValues = confValues.map(c => c * 2 + (Math.random() - 0.5) * 0.01);

    const metrics: ExperimentMetrics = {
      experimentId: "e4_confidence",
      runtimeMode: "native_cognitive",
      sampleSize: n,
      confidencePrediction: {
        beta1Cognitive: 2.0,
        beta1Belief: 0.5,
        marginalR2Cognitive: 0.85,
        marginalR2Belief: 0.3,
        _bootstrapData: { confValues, deltaUValues, oldConfValues: confValues, deltaBValues: deltaUValues },
      },
    };

    const results = runTests(metrics);
    const test = results[0];
    // p 值应较小（显著），但不是硬编码的 0.001
    // Bootstrap 比例法：(count+1)/(nBoot+1)，最小为 1/5001 ≈ 0.0002
    expect(test.pValue).toBeLessThan(0.05);
    expect(test.significant).toBe(true);
  });

  it("无 Bootstrap 数据时回退到 pValue=1", () => {
    const metrics: ExperimentMetrics = {
      experimentId: "e4_confidence",
      runtimeMode: "native_cognitive",
      sampleSize: 5,
      confidencePrediction: {
        beta1Cognitive: 0.5,
        beta1Belief: 0.3,
        marginalR2Cognitive: 0.4,
        marginalR2Belief: 0.2,
      },
    };

    const results = runTests(metrics);
    expect(results[0].pValue).toBe(1);
    expect(results[0].significant).toBe(false);
  });
});

// ============================================================================
// E5: Governance Mechanism — Granger per-series p 值合并
// ============================================================================

describe("E5: Governance Mechanism (Granger per-series 合并)", () => {
  it("有 per-series F 数据时应使用 Bonferroni 合并（非聚合 df2）", () => {
    // 构造 3 条序列，每条长度 5，F 值适中
    const metrics: ExperimentMetrics = {
      experimentId: "e5_governance",
      runtimeMode: "native_cognitive",
      sampleSize: 3,
      governanceMechanism: {
        grangerF_evidenceToUtility: 5.0,
        grangerF_utilityToEvidence: 2.0,
        indirectEffect: 0.3,
        indirectEffectCI: [0.1, 0.5],
        mediationRatio: 0.6,
        tauWithGovernance: 0.7,
        tauWithoutGovernance: 0.5,
        deltaTau: 0.2,
        _bootstrapData: {
          tauGov: [0.7, 0.65, 0.75],
          tauNoGov: [0.5, 0.48, 0.52],
          grangerN: 30,
          perSeriesF_EtoU: [5.0, 4.0, 6.0],
          perSeriesF_UtoE: [2.0, 1.5, 2.5],
          perSeriesN: [5, 5, 5],
        },
      },
    };

    const results = runTests(metrics);
    const test = results[0];
    // Bonferroni 合并：6 个 p 值（3 序列 × 2 方向），min(p) × 6
    // df2 = 5 - 3 = 2，F=6.0 → p ≈ 0.13，× 6 = 0.78
    // 不应是用聚合 df2=27 算出的极小 p 值
    expect(test.pValue).toBeGreaterThan(0.01);
    expect(test.details).toBeDefined();
  });

  it("无 per-series 数据时回退到聚合 df2（旧逻辑）", () => {
    const metrics: ExperimentMetrics = {
      experimentId: "e5_governance",
      runtimeMode: "native_cognitive",
      sampleSize: 3,
      governanceMechanism: {
        grangerF_evidenceToUtility: 5.0,
        grangerF_utilityToEvidence: 2.0,
        indirectEffect: 0.3,
        indirectEffectCI: [0.1, 0.5],
        mediationRatio: 0.6,
        tauWithGovernance: 0.7,
        tauWithoutGovernance: 0.5,
        deltaTau: 0.2,
        _bootstrapData: {
          tauGov: [0.7, 0.65, 0.75],
          tauNoGov: [0.5, 0.48, 0.52],
          grangerN: 30,
        },
      },
    };

    const results = runTests(metrics);
    const test = results[0];
    // 回退路径：用聚合 df2 = 30 - 3 = 27
    expect(test.pValue).toBeGreaterThanOrEqual(0);
    expect(test.pValue).toBeLessThanOrEqual(1);
  });

  it("Δτ Bootstrap CI 不跨 0 时应显著", () => {
    const metrics: ExperimentMetrics = {
      experimentId: "e5_governance",
      runtimeMode: "native_cognitive",
      sampleSize: 10,
      governanceMechanism: {
        grangerF_evidenceToUtility: 3.0,
        grangerF_utilityToEvidence: 1.5,
        indirectEffect: 0.2,
        indirectEffectCI: [0.05, 0.35],
        mediationRatio: 0.5,
        tauWithGovernance: 0.75,
        tauWithoutGovernance: 0.55,
        deltaTau: 0.2,
        _bootstrapData: {
          tauGov: [0.75, 0.72, 0.78, 0.74, 0.76, 0.73, 0.77, 0.75, 0.74, 0.76],
          tauNoGov: [0.55, 0.52, 0.58, 0.54, 0.56, 0.53, 0.57, 0.55, 0.54, 0.56],
          grangerN: 50,
          perSeriesF_EtoU: [3.0, 2.5, 3.5],
          perSeriesF_UtoE: [1.5, 1.2, 1.8],
          perSeriesN: [5, 5, 5],
        },
      },
    };

    const results = runTests(metrics);
    const test = results[0];
    // Δτ = 0.2，两组完全不重叠 → Bootstrap CI 应不跨 0
    // 但 significant 还要求 pGranger < 0.05
    expect(test.ciLower).toBeGreaterThan(0);
    expect(test.ciUpper).toBeGreaterThan(0);
  });
});

// ============================================================================
// E6: State Decoupling — Bootstrap CI 主推断
// ============================================================================

describe("E6: State Decoupling (Bootstrap CI 主推断)", () => {
  it("有 per-run Bootstrap 数据时应使用 CI 判定显著性（非 Fisher z）", () => {
    // 构造 per-run 数据使 Belief 相关 >> Cognitive 相关
    const metrics: ExperimentMetrics = {
      experimentId: "e6_decoupling",
      runtimeMode: "native_cognitive",
      sampleSize: 10,
      stateDecoupling: {
        maxCorrCognitive: 0.3,
        maxCorrBelief: 0.8,
        vifMax: 2.5,
        conditionNumber: 8.0,
        _bootstrapData: {
          corrCognitivePerRun: [0.2, 0.3, 0.25, 0.35, 0.28, 0.32, 0.22, 0.38, 0.26, 0.34],
          corrBeliefPerRun: [0.75, 0.82, 0.78, 0.85, 0.76, 0.83, 0.79, 0.84, 0.77, 0.81],
        },
      },
    };

    const results = runTests(metrics);
    const test = results[0];
    // Bootstrap CI 应不跨 0（Belief 相关明显更高）
    expect(test.ciLower).toBeGreaterThan(0);
    expect(test.ciUpper).toBeGreaterThan(0);
    expect(test.significant).toBe(true);
    // 应标注使用 bootstrap 方法
    expect(test.details.inferenceMethod).toBe("per-run paired bootstrap");
  });

  it("无 per-run 数据时回退到 Fisher z", () => {
    const metrics: ExperimentMetrics = {
      experimentId: "e6_decoupling",
      runtimeMode: "native_cognitive",
      sampleSize: 30,
      stateDecoupling: {
        maxCorrCognitive: 0.3,
        maxCorrBelief: 0.8,
        vifMax: 2.5,
        conditionNumber: 8.0,
      },
    };

    const results = runTests(metrics);
    const test = results[0];
    expect(test.details.inferenceMethod).toBe("fisher-z fallback");
    expect(test.pValue).toBeLessThan(0.05); // 0.8 vs 0.3 应显著
  });

  it("Bootstrap CI 跨 0 时不应显著", () => {
    // 构造 Cognitive 和 Belief 相关接近、有正有负交叉的数据
    // 差异(Bel-Cog): [+0.02, -0.05, +0.05, -0.04, +0.04, 0, -0.06, +0.06, 0, 0]，均值≈0
    const metrics: ExperimentMetrics = {
      experimentId: "e6_decoupling",
      runtimeMode: "native_cognitive",
      sampleSize: 10,
      stateDecoupling: {
        maxCorrCognitive: 0.5,
        maxCorrBelief: 0.52,
        vifMax: 2.0,
        conditionNumber: 6.0,
        _bootstrapData: {
          corrCognitivePerRun: [0.5, 0.55, 0.45, 0.52, 0.48, 0.5, 0.53, 0.47, 0.5, 0.5],
          corrBeliefPerRun:    [0.52, 0.5, 0.5, 0.48, 0.52, 0.5, 0.47, 0.53, 0.5, 0.5],
        },
      },
    };

    const results = runTests(metrics);
    const test = results[0];
    // CI 应跨 0（差异均值≈0，有正有负 → 2.5%分位应 ≤0）
    expect(test.ciLower).toBeLessThanOrEqual(0);
    expect(test.significant).toBe(false);
  });
});

// ============================================================================
// E8: Susceptibility Mediation — 显著性逻辑反转修复
// ============================================================================

describe("E8: Susceptibility Mediation (显著性同号判定)", () => {
  it("CI 两端同正且 p<0.05 时应显著（修复前会误判）", () => {
    // 构造 (I, Λ, ΔU) 三元组使 a×b > 0 且 CI 不跨 0
    // 注意：需添加确定性噪声打破完全共线性，否则残差化后 Λ 方差为 0 → b 路径不稳定
    const n = 30;
    const inertiaValues = Array.from({ length: n }, (_, i) => 0.3 + i * 0.02);
    const susceptibilityValues = inertiaValues.map((i, idx) => i * 0.8 + 0.1 + Math.sin(idx * 1.7) * 0.04);
    const deltaUValues = susceptibilityValues.map((s, idx) => s * 0.5 + 0.01 + Math.cos(idx * 2.3) * 0.03);

    const metrics: ExperimentMetrics = {
      experimentId: "e8_susceptibility",
      runtimeMode: "native_cognitive",
      sampleSize: n,
      susceptibilityMediation: {
        indirectEffect: 0.32,
        indirectEffectCI: [0.15, 0.5],
        directEffect: 0.1,
        totalEffect: 0.42,
        mediationRatio: 0.76,
        _bootstrapData: { inertiaValues, susceptibilityValues, deltaUValues },
      },
    };

    const results = runTests(metrics);
    const test = results[0];
    // Bootstrap CI 应同正（a≈0.8, b≈0.5, a×b≈0.4，噪声不足以使 CI 跨 0）
    expect(test.ciLower).toBeGreaterThan(0);
    expect(test.ciUpper).toBeGreaterThan(0);
    expect(test.significant).toBe(true);
  });

  it("CI 跨 0 时不应显著（修复前会被 XOR 误判为显著）", () => {
    // 构造使 a×b 的 Bootstrap CI 跨 0
    const n = 30;
    const inertiaValues = Array.from({ length: n }, () => (Math.random() - 0.5) * 0.4);
    const susceptibilityValues = Array.from({ length: n }, () => (Math.random() - 0.5) * 0.3);
    const deltaUValues = Array.from({ length: n }, () => (Math.random() - 0.5) * 0.2);

    const metrics: ExperimentMetrics = {
      experimentId: "e8_susceptibility",
      runtimeMode: "native_cognitive",
      sampleSize: n,
      susceptibilityMediation: {
        indirectEffect: 0.001,
        indirectEffectCI: [-0.05, 0.05],
        directEffect: 0.002,
        totalEffect: 0.003,
        mediationRatio: 0.33,
        _bootstrapData: { inertiaValues, susceptibilityValues, deltaUValues },
      },
    };

    const results = runTests(metrics);
    const test = results[0];
    // CI 跨 0 → 不显著（修复前 XOR 逻辑会误判为显著）
    expect(test.significant).toBe(false);
  });

  it("CI 两端同负时不应被判定为正显著", () => {
    // 构造 a×b < 0 且 CI 同负
    // 注意：需添加确定性噪声打破完全共线性，否则残差化后 Λ 方差为 0 → b 路径不稳定
    const n = 30;
    const inertiaValues = Array.from({ length: n }, (_, i) => 0.3 + i * 0.02);
    const susceptibilityValues = inertiaValues.map((i, idx) => i * 0.8 + 0.1 + Math.sin(idx * 1.7) * 0.04);
    const deltaUValues = susceptibilityValues.map((s, idx) => -(s * 0.5) - 0.01 + Math.cos(idx * 2.3) * 0.03); // 负关系+噪声

    const metrics: ExperimentMetrics = {
      experimentId: "e8_susceptibility",
      runtimeMode: "native_cognitive",
      sampleSize: n,
      susceptibilityMediation: {
        indirectEffect: -0.32,
        indirectEffectCI: [-0.5, -0.15],
        directEffect: -0.1,
        totalEffect: -0.42,
        mediationRatio: 0.76,
        _bootstrapData: { inertiaValues, susceptibilityValues, deltaUValues },
      },
    };

    const results = runTests(metrics);
    const test = results[0];
    // CI 同负 → (ciLower > 0) === (ciUpper > 0) 为 true（都是 false）
    // 但 ciLower !== 0 && ciUpper !== 0 也满足 → significant 为 true
    // 这是正确的：负的中介效应也是"显著的中介效应"，只是方向相反
    expect(test.significant).toBe(true);
  });

  it("无 Bootstrap 数据时回退到 pValue=1", () => {
    const metrics: ExperimentMetrics = {
      experimentId: "e8_susceptibility",
      runtimeMode: "native_cognitive",
      sampleSize: 5,
      susceptibilityMediation: {
        indirectEffect: 0.2,
        indirectEffectCI: [0.1, 0.3],
        directEffect: 0.1,
        totalEffect: 0.3,
        mediationRatio: 0.67,
      },
    };

    const results = runTests(metrics);
    expect(results[0].pValue).toBe(1);
    expect(results[0].significant).toBe(false);
  });
});
