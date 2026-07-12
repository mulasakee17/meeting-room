import { describe, it, expect } from "vitest";
import { mean, std, sampleStd, variance, range, normalize, round } from "@/lib/utils/statsUtils";

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
});
