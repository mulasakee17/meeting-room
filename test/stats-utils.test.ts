import { describe, it, expect } from "vitest";
import { mean, std, sampleStd, variance, range, normalize, round, shannonEntropy, socialFreeEnergy } from "@/lib/utils/statsUtils";

describe("statsUtils", () => {
  describe("mean", () => {
    it("空数组返回 0", () => {
      expect(mean([])).toBe(0);
    });
    it("正常计算平均值", () => {
      expect(mean([1, 2, 3, 4, 5])).toBe(3);
    });
  });

  describe("std / sampleStd / variance 小样本 guard", () => {
    it("空数组返回 0 而非 NaN", () => {
      expect(std([])).toBe(0);
      expect(sampleStd([])).toBe(0);
      expect(variance([])).toBe(0);
    });
    it("n=1 返回 0 而非 NaN", () => {
      expect(std([42])).toBe(0);
      expect(sampleStd([42])).toBe(0);
      expect(variance([42])).toBe(0);
    });
    it("n=2 正常计算", () => {
      // 总体 std: sqrt(((0-0.5)^2 + (1-0.5)^2) / 2) = sqrt(0.25) = 0.5
      expect(std([0, 1])).toBeCloseTo(0.5, 5);
      // 样本 std: sqrt(0.5 / 1) = sqrt(0.5) ≈ 0.7071
      expect(sampleStd([0, 1])).toBeCloseTo(Math.sqrt(0.5), 5);
    });
  });

  describe("range", () => {
    it("空数组返回 0", () => {
      expect(range([])).toBe(0);
    });
    it("正常计算极差", () => {
      expect(range([3, 1, 4, 1, 5, 9])).toBe(8);
    });
  });

  describe("normalize", () => {
    it("min === max 时返回 0.5", () => {
      expect(normalize(5, 5, 5)).toBe(0.5);
    });
    it("正常归一化", () => {
      expect(normalize(5, 0, 10)).toBe(0.5);
      expect(normalize(0, 0, 10)).toBe(0);
      expect(normalize(10, 0, 10)).toBe(1);
    });
  });

  describe("round", () => {
    it("默认 2 位小数", () => {
      expect(round(3.14159)).toBe(3.14);
    });
    it("指定小数位", () => {
      expect(round(3.14159, 4)).toBe(3.1416);
    });
  });

  describe("shannonEntropy", () => {
    it("空数组返回 0", () => {
      expect(shannonEntropy([])).toBe(0);
    });
    it("所有值相同（完全共识）返回 0", () => {
      expect(shannonEntropy([0.5, 0.5, 0.5, 0.5, 0.5])).toBeCloseTo(0, 5);
    });
    it("均匀分布在 5 个箱返回 1（最大熵）", () => {
      // 5 个 agent 分布在 5 个箱：[-1,-0.6), [-0.6,-0.2), [-0.2,0.2), [0.2,0.6), [0.6,1]
      const values = [-0.9, -0.4, 0, 0.4, 0.9];
      expect(shannonEntropy(values, 5, -1, 1)).toBeCloseTo(1, 5);
    });
    it("双峰分布的熵低于均匀分布", () => {
      const bimodal = [-0.9, -0.9, 0.9, 0.9, 0.9]; // 集中在两个箱
      const uniform = [-0.9, -0.4, 0, 0.4, 0.9];   // 均匀分布
      expect(shannonEntropy(bimodal, 5, -1, 1)).toBeLessThan(shannonEntropy(uniform, 5, -1, 1));
    });
    it("bins < 2 返回 0", () => {
      expect(shannonEntropy([0.5], 1)).toBe(0);
    });
    it("值超出 [min,max] 被钳制", () => {
      const clamped = shannonEntropy([1.5, -1.5, 0], 3, -1, 1);
      expect(clamped).toBeGreaterThanOrEqual(0);
      expect(clamped).toBeLessThanOrEqual(1);
    });
  });

  describe("socialFreeEnergy", () => {
    it("完全共识时 F 最小", () => {
      // R=1, T=0, H=0 → F=0
      const F = socialFreeEnergy(1, 0, 0);
      expect(F).toBeCloseTo(0, 5);
    });
    it("完全无序时 F 大于共识时", () => {
      const F_consensus = socialFreeEnergy(1, 0, 0);
      const F_disorder = socialFreeEnergy(0, 0.8, 1);
      expect(F_disorder).toBeGreaterThan(F_consensus);
    });
    it("双峰极化的 F 低于均匀分歧（极化更有结构）", () => {
      // 双峰极化：R≈0, σ=0.8, H=0.5
      const F_polarized = socialFreeEnergy(0, 0.8, 0.5);
      // 均匀分歧：R≈0, σ=0.6, H=1.0
      const F_dispersed = socialFreeEnergy(0, 0.6, 1.0);
      expect(F_polarized).toBeLessThan(F_dispersed);
    });
    it("F 随温度升高而增加（熵固定时）", () => {
      const F_lowT = socialFreeEnergy(0.5, 0.2, 0.5);
      const F_highT = socialFreeEnergy(0.5, 0.8, 0.5);
      expect(F_highT).toBeGreaterThan(F_lowT);
    });
  });
});
