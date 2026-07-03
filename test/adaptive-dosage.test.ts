/**
 * 自适应剂量治理测试
 */
import { describe, it, expect } from "vitest";
import {
  computeAdaptiveDosage,
  severityToNumber,
  computeHistoryEffectiveness,
} from "@/lib/governance/adaptiveDosage";

describe("Adaptive Dosage", () => {
  it("高严重度 → 高剂量", () => {
    const high = computeAdaptiveDosage({
      severity: 0.85, roundProgress: 0.2, agentCount: 5,
      informationCoverage: 0.3, baseMaxRounds: 5,
    });
    const low = computeAdaptiveDosage({
      severity: 0.25, roundProgress: 0.8, agentCount: 5,
      informationCoverage: 0.9, baseMaxRounds: 5,
    });
    expect(high.weightReduction).toBeGreaterThan(low.weightReduction);
    expect(high.reflectionStrength).toBeGreaterThan(low.reflectionStrength);
    expect(high.additionalRounds).toBeGreaterThan(low.additionalRounds);
  });

  it("低信息覆盖度 → 高剂量", () => {
    const lowInfo = computeAdaptiveDosage({
      severity: 0.6, roundProgress: 0.3, agentCount: 5,
      informationCoverage: 0.2, baseMaxRounds: 5,
    });
    const highInfo = computeAdaptiveDosage({
      severity: 0.6, roundProgress: 0.3, agentCount: 5,
      informationCoverage: 0.9, baseMaxRounds: 5,
    });
    expect(lowInfo.perturbationAmount).toBeGreaterThan(highInfo.perturbationAmount);
  });

  it("负历史效果 → 加量", () => {
    const negHistory = computeAdaptiveDosage({
      severity: 0.6, roundProgress: 0.3, agentCount: 5,
      historyEffectiveness: -0.8, baseMaxRounds: 5,
    });
    const posHistory = computeAdaptiveDosage({
      severity: 0.6, roundProgress: 0.3, agentCount: 5,
      historyEffectiveness: 0.8, baseMaxRounds: 5,
    });
    expect(negHistory.weightReduction).toBeGreaterThan(posHistory.weightReduction);
  });

  it("剂量在合理范围内", () => {
    const d = computeAdaptiveDosage({
      severity: 1.0, roundProgress: 0.0, agentCount: 10,
      informationCoverage: 0.0, historyEffectiveness: -1.0, baseMaxRounds: 10,
    });
    expect(d.additionalRounds).toBeGreaterThanOrEqual(1);
    expect(d.weightReduction).toBeGreaterThanOrEqual(0.2);
    expect(d.weightReduction).toBeLessThanOrEqual(0.8);
    expect(d.reflectionStrength).toBeGreaterThanOrEqual(0.1);
    expect(d.reflectionStrength).toBeLessThanOrEqual(0.6);
    expect(d.perturbationAmount).toBeGreaterThanOrEqual(0.1);
    expect(d.perturbationAmount).toBeLessThanOrEqual(0.5);
  });

  it("severityToNumber 映射", () => {
    expect(severityToNumber("high")).toBe(0.85);
    expect(severityToNumber("medium")).toBe(0.55);
    expect(severityToNumber("low")).toBe(0.25);
  });

  it("computeHistoryEffectiveness", () => {
    const good = computeHistoryEffectiveness({
      belief_diversity_change: 0.3,
      belief_mean_change: 0.15,
      successful_interventions: 2,
    });
    const bad = computeHistoryEffectiveness({
      belief_diversity_change: -0.2,
      belief_mean_change: 0.01,
      successful_interventions: 0,
    });
    expect(good).toBeGreaterThan(0);
    expect(bad).toBeLessThan(0);
  });
});
