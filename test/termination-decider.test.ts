import { describe, it, expect, beforeEach } from "vitest";
import {
  TerminationDecider,
  DEFAULT_TERMINATION_THRESHOLDS,
} from "@/lib/thermodynamics/TerminationDecider";

describe("TerminationDecider", () => {
  let decider: TerminationDecider;

  beforeEach(() => {
    decider = new TerminationDecider();
  });

  describe("普通结晶态判定", () => {
    it("R>0.85, T<0.22, H<0.42 → crystallized", () => {
      // 第一次评估：建立基线（T 不低 → active，不触发骤降检测）
      decider.evaluate(0.80, 0.25, 0.45, 3);
      // 第二次评估：满足结晶态（新阈值 T<0.22, H<0.42）
      const decision = decider.evaluate(0.90, 0.15, 0.25, 6);
      expect(decision.stateType).toBe("crystallized");
      expect(decision.shouldTerminate).toBe(false); // 需要连续 3 次
    });

    it("连续 3 次结晶态 → shouldTerminate=true", () => {
      decider.evaluate(0.90, 0.15, 0.25, 3);
      decider.evaluate(0.92, 0.12, 0.20, 6);
      const decision = decider.evaluate(0.92, 0.12, 0.20, 9);
      expect(decision.stateType).toBe("crystallized");
      expect(decision.shouldTerminate).toBe(true);
      expect(decision.reason).toBe("crystallized");
    });

    it("仅 2 次结晶态后中断 → shouldTerminate=false", () => {
      decider.evaluate(0.90, 0.15, 0.25, 3);
      decider.evaluate(0.90, 0.15, 0.25, 6);
      // 第三次非结晶（T 回升）
      const d3 = decider.evaluate(0.60, 0.30, 0.40, 9);
      expect(d3.shouldTerminate).toBe(false);
    });

    it("R=0.80 不满足 0.85 → 非 crystallized", () => {
      const decision = decider.evaluate(0.80, 0.15, 0.25, 3);
      expect(decision.stateType).not.toBe("crystallized");
    });

    it("H=0.45 不满足 0.42 → 非 crystallized", () => {
      const decision = decider.evaluate(0.90, 0.15, 0.45, 3);
      expect(decision.stateType).not.toBe("crystallized");
    });
  });

  describe("强结晶态快速终止", () => {
    it("T<0.10 且 H<0.10 → 立即终止（1 次即可）", () => {
      // pilot 场景：eval3 H=0, T=0.08 应立即终止
      const decision = decider.evaluate(0.99, 0.08, 0.0, 14);
      expect(decision.shouldTerminate).toBe(true);
      expect(decision.reason).toBe("strong_crystallized");
    });

    it("强结晶态不需要 R 条件", () => {
      // 即使 R 不高，H 极低 + T 极低也是不可逆收敛
      const decision = decider.evaluate(0.50, 0.05, 0.05, 10);
      expect(decision.shouldTerminate).toBe(true);
      expect(decision.reason).toBe("strong_crystallized");
    });

    it("T=0.12 不满足 strongCrystallT=0.10 → 不触发强结晶", () => {
      const decision = decider.evaluate(0.95, 0.12, 0.05, 10);
      // 普通结晶可能触发，但不是强结晶
      if (decision.shouldTerminate) {
        expect(decision.reason).not.toBe("strong_crystallized");
      }
    });

    it("H=0.25 不满足 strongCrystallH=0.20 → 不触发强结晶", () => {
      const decision = decider.evaluate(0.95, 0.05, 0.25, 10);
      if (decision.shouldTerminate) {
        expect(decision.reason).not.toBe("strong_crystallized");
      }
    });

    it("pilot 场景回放：eval3 (H=0, T=0.08) 立即终止", () => {
      // 模拟 fraud_C_0 pilot 的 eval3
      decider.evaluate(0.902, 0.288, 0.655, 5);  // eval0
      decider.evaluate(0.965, 0.169, 0.590, 8);  // eval1
      decider.evaluate(0.975, 0.142, 0.311, 11); // eval2

      // eval3: H=0, T=0.08 → 应该立即终止！
      const decision = decider.evaluate(0.992, 0.080, 0.0, 14);
      expect(decision.shouldTerminate).toBe(true);
      expect(decision.reason).toBe("strong_crystallized");
    });
  });

  describe("淬火态判定（T 骤降 bug 修复）", () => {
    it("T 下降 > 0.05 + R 高 + H 不低 → quenched", () => {
      // T 从 0.25 下降到 0.10，下降量=0.15 > 0.05
      decider.evaluate(0.85, 0.25, 0.50, 3);
      const decision = decider.evaluate(0.90, 0.10, 0.50, 6);
      expect(decision.stateType).toBe("quenched");
      expect(decision.shouldTerminate).toBe(false);
    });

    it("T 上升不触发淬火态（bug 修复验证）", () => {
      // T 从 0.10 上升到 0.25，旧逻辑 abs=0.15>0.05 会误判为骤降
      // 新逻辑只检测下降：0.10 - 0.25 = -0.15 < 0.05，不是骤降
      decider.evaluate(0.90, 0.10, 0.50, 3);
      const decision = decider.evaluate(0.90, 0.25, 0.50, 6);
      // T 上升 + H 不低 → 不是结晶也不是淬火，应该是 active
      expect(decision.stateType).not.toBe("quenched");
    });

    it("T 缓慢下降（<0.05）不触发淬火态", () => {
      // T 从 0.25 下降到 0.22，下降量=0.03 < 0.05
      decider.evaluate(0.90, 0.25, 0.50, 3);
      const decision = decider.evaluate(0.90, 0.22, 0.50, 6);
      expect(decision.stateType).not.toBe("quenched");
    });

    it("T 骤降但 H 低 → 结晶态而非淬火态", () => {
      // T 骤降 + H 低 → 是真结晶，不是淬火
      decider.evaluate(0.85, 0.25, 0.40, 3);
      const decision = decider.evaluate(0.92, 0.10, 0.25, 6);
      // H=0.25 < 0.42 → 满足结晶条件（新阈值）
      expect(decision.stateType).toBe("crystallized");
    });
  });

  describe("混沌态判定", () => {
    it("R<0.40, T>0.50, H>0.60 → chaotic", () => {
      const decision = decider.evaluate(0.30, 0.60, 0.70, 3);
      expect(decision.stateType).toBe("chaotic");
      expect(decision.shouldTerminate).toBe(false);
    });

    it("R=0.45 不满足 chaoticR=0.40 → 非 chaotic", () => {
      const decision = decider.evaluate(0.45, 0.60, 0.70, 3);
      expect(decision.stateType).not.toBe("chaotic");
    });

    it("混沌态阈值可配置", () => {
      const customDecider = new TerminationDecider({
        chaoticR: 0.50,
        chaoticT: 0.40,
        chaoticH: 0.50,
      });
      const decision = customDecider.evaluate(0.45, 0.45, 0.55, 3);
      expect(decision.stateType).toBe("chaotic");
    });
  });

  describe("活跃态", () => {
    it("中等 R/T/H → active", () => {
      const decision = decider.evaluate(0.50, 0.30, 0.40, 3);
      expect(decision.stateType).toBe("active");
      expect(decision.shouldTerminate).toBe(false);
    });
  });

  describe("硬上限", () => {
    it("发言次数 ≥ hardCap → 强制终止", () => {
      const decision = decider.evaluate(0.50, 0.30, 0.40, 40);
      expect(decision.shouldTerminate).toBe(true);
      expect(decision.reason).toBe("hard_cap");
    });

    it("自定义 hardCap 生效", () => {
      const customDecider = new TerminationDecider({ hardCapUtterances: 15 });
      const decision = customDecider.evaluate(0.50, 0.30, 0.40, 15);
      expect(decision.shouldTerminate).toBe(true);
      expect(decision.reason).toBe("hard_cap");
    });

    it("硬上限优先于强结晶态", () => {
      // 即使 H 极低 T 极低，硬上限也应该优先
      const decision = decider.evaluate(0.99, 0.05, 0.0, 40);
      expect(decision.reason).toBe("hard_cap");
    });
  });

  describe("历史记录", () => {
    it("evaluate 后 history 增长", () => {
      expect(decider.getHistory().length).toBe(0);
      decider.evaluate(0.5, 0.3, 0.4, 3);
      expect(decider.getHistory().length).toBe(1);
      decider.evaluate(0.6, 0.25, 0.35, 6);
      expect(decider.getHistory().length).toBe(2);
    });

    it("快照包含 F = (1-R) + T·H", () => {
      decider.evaluate(0.8, 0.1, 0.2, 3);
      const snap = decider.getHistory()[0];
      expect(snap.F).toBeCloseTo((1 - 0.8) + 0.1 * 0.2, 5);
    });

    it("reset 清空历史和计数器", () => {
      decider.evaluate(0.90, 0.15, 0.25, 3); // crystallized
      decider.evaluate(0.90, 0.15, 0.25, 6); // crystallized → terminate
      expect(decider.getHistory().length).toBe(2);

      decider.reset();
      expect(decider.getHistory().length).toBe(0);

      // reset 后 1 次普通结晶不应终止（计数器已清）
      const d = decider.evaluate(0.90, 0.15, 0.25, 3);
      expect(d.shouldTerminate).toBe(false);
    });
  });

  describe("连续结晶计数器", () => {
    it("结晶→非结晶→结晶：计数器重置", () => {
      // 第1次：结晶
      decider.evaluate(0.90, 0.15, 0.25, 3);
      // 第2次：非结晶（T 回升）
      const d2 = decider.evaluate(0.50, 0.30, 0.40, 6);
      expect(d2.stateType).not.toBe("crystallized");
      // 第3次：再次结晶——不应终止（计数器从 0 开始）
      const d3 = decider.evaluate(0.90, 0.15, 0.25, 9);
      expect(d3.stateType).toBe("crystallized");
      expect(d3.shouldTerminate).toBe(false); // 仅 1 次连续
    });

    it("连续 3 次结晶在第 3 次才终止", () => {
      decider.evaluate(0.90, 0.15, 0.25, 3);
      const d2 = decider.evaluate(0.90, 0.15, 0.25, 6);
      expect(d2.shouldTerminate).toBe(false); // 第 2 次不终止
      const d3 = decider.evaluate(0.90, 0.15, 0.25, 9);
      expect(d3.shouldTerminate).toBe(true); // 第 3 次终止
    });
  });

  describe("自定义阈值", () => {
    it("放松阈值后更易结晶", () => {
      const relaxed = new TerminationDecider({
        crystallR: 0.60,
        crystallT: 0.25,
        crystallH: 0.40,
      });
      // 默认阈值下不结晶的值
      const defaultDecider = new TerminationDecider();
      const defaultD = defaultDecider.evaluate(0.65, 0.22, 0.35, 3);
      expect(defaultD.stateType).not.toBe("crystallized");

      // 放松阈值后结晶
      const relaxedD = relaxed.evaluate(0.65, 0.22, 0.35, 3);
      expect(relaxedD.stateType).toBe("crystallized");
    });

    it("强结晶阈值可配置", () => {
      const strict = new TerminationDecider({
        strongCrystallT: 0.05,
        strongCrystallH: 0.05,
      });
      // T=0.08, H=0.08 在默认阈值下触发强结晶，但在严格阈值下不触发
      const defaultD = new TerminationDecider().evaluate(0.90, 0.08, 0.08, 10);
      expect(defaultD.reason).toBe("strong_crystallized");

      const strictD = strict.evaluate(0.90, 0.08, 0.08, 10);
      expect(strictD.reason).not.toBe("strong_crystallized");
    });
  });

  describe("DEFAULT_TERMINATION_THRESHOLDS", () => {
    it("普通结晶态默认值符合标定", () => {
      expect(DEFAULT_TERMINATION_THRESHOLDS.crystallR).toBe(0.85);
      expect(DEFAULT_TERMINATION_THRESHOLDS.crystallT).toBe(0.22);
      expect(DEFAULT_TERMINATION_THRESHOLDS.crystallH).toBe(0.42);
      expect(DEFAULT_TERMINATION_THRESHOLDS.consecutiveCrystallRequired).toBe(3);
    });

    it("强结晶态默认值符合标定", () => {
      expect(DEFAULT_TERMINATION_THRESHOLDS.strongCrystallT).toBe(0.10);
      expect(DEFAULT_TERMINATION_THRESHOLDS.strongCrystallH).toBe(0.20);
    });

    it("混沌态默认值可配置", () => {
      expect(DEFAULT_TERMINATION_THRESHOLDS.chaoticR).toBe(0.40);
      expect(DEFAULT_TERMINATION_THRESHOLDS.chaoticT).toBe(0.50);
      expect(DEFAULT_TERMINATION_THRESHOLDS.chaoticH).toBe(0.60);
    });

    it("硬上限默认值", () => {
      expect(DEFAULT_TERMINATION_THRESHOLDS.hardCapUtterances).toBe(40);
    });
  });
});
