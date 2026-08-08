/**
 * Versioned heuristic stopping-policy evaluator.
 *
 * The async compatibility path and sync cognitive path use different signal
 * definitions. Every persisted snapshot therefore carries a signal-set id.
 * The default sync policy is fixed-rounds; R/H/T and the composite are used
 * only by explicit experimental policies. None of these signals proves
 * truth, irreversibility, epistemic adequacy, or physical crystallization.
 */

/** Versioned monitoring snapshot used by compatibility stopping policies. */
export interface ThermoSnapshot {
  /** Identifies the exact, non-interchangeable monitoring semantics. */
  signalSetId: "swarmalpha.scalar_belief_macro" | "swarmalpha.cognitive_macro";
  signalSetVersion: "1.0.0";
  /** Kuramoto 序参量 R ∈ [0,1] */
  R: number;
  /** 归一化温度 T ∈ [0,1] */
  T: number;
  /** Shannon 熵 H ∈ [0,1] */
  H: number;
  /** Deprecated compatibility composite; interpretation is fixed by signalSetId. */
  F: number;
  /** 发言次数（async 路径）或轮次（sync 路径，v6 复用此字段存 round） */
  utteranceCount: number;
  /** 评估序号 */
  evalIndex: number;
}

/** 终止决策结果 */
export interface TerminationDecision {
  /** 是否终止 */
  shouldTerminate: boolean;
  /** 终止原因 */
  reason: "strong_crystallized" | "crystallized" | "hard_cap" | "continue";
  /** 当前系统状态分类 */
  stateType: "crystallized" | "quenched" | "chaotic" | "active";
  /** 诊断信息 */
  message: string;
}

export type SyncTerminationPolicy =
  | "fixed_rounds"
  | "surface"
  | "rht_joint"
  | "rhtf_joint";

/** 终止阈值配置 */
export interface TerminationThresholds {
  // ── 普通结晶态 ──
  /** 普通结晶态：R 高于此值 */
  crystallR: number;
  /** 普通结晶态：T 低于此值 */
  crystallT: number;
  /** 普通结晶态：H 低于此值 */
  crystallH: number;
  /** 连续普通结晶次数要求 */
  consecutiveCrystallRequired: number;

  // ── 强结晶态（快速终止） ──
  /** 强结晶态：T 低于此值（立即终止，无需连续 N 次） */
  strongCrystallT: number;
  /** 强结晶态：H 低于此值（立即终止，无需连续 N 次） */
  strongCrystallH: number;

  // ── v6 sync 路径 F 阈值（新增，2026-08-04）──
  /** Experimental sync policy: compatibility composite threshold for fast stop. */
  strongCrystallF: number;
  /** v6 sync 普通结晶态：F 低于此值（连续 N 次后终止） */
  crystallF: number;

  // ── 淬火态检测 ──
  /** T 骤降检测阈值：T_prev - T > 此值视为骤降 */
  suddenDropT: number;

  // ── 混沌态检测 ──
  /** 混沌态：R 低于此值 */
  chaoticR: number;
  /** 混沌态：T 高于此值 */
  chaoticT: number;
  /** 混沌态：H 高于此值 */
  chaoticH: number;

  // ── 硬上限 ──
  /** 硬上限：发言次数（async 路径） */
  hardCapUtterances: number;
}

/**
 * 默认阈值
 *
 * 标定依据：fraud_C v2 全 10 轮逐例分析 (2026-07-17)
 * - Run 1 (τ=0.6) H 卡在 0.418 长达 7 eval → crystallH 从 0.35 放宽到 0.42
 * - Run 4 (τ=0.2) T 最低 0.207 被 0.20 挡住 → crystallT 从 0.20 放宽到 0.22
 * - Run 8 达到 1 次结晶后去结晶化 → consecutiveCrystallRequired 从 2 提高到 3
 * - Run 1 T<0.07 但 H=0.418 被强结晶拒绝 → strongCrystallH 从 0.10 放宽到 0.20
 * - K 从 3 降到 2（asyncEngine.ts）→ 更密集的热力学评估
 */
export const DEFAULT_TERMINATION_THRESHOLDS: TerminationThresholds = {
  // 普通结晶态
  crystallR: 0.85,        // R > 0.85
  crystallT: 0.22,        // T < 0.22（放宽：Run 4 T=0.207 被旧值 0.20 挡住）
  crystallH: 0.42,        // H < 0.42（放宽：Run 1 τ=0.6 但 H=0.418 被旧值 0.35 挡住）
  consecutiveCrystallRequired: 3,  // 提高：防止 Run 8 型去结晶化误判

  // 强结晶态（H 极低 + T 极低 → 立即终止）
  strongCrystallT: 0.10,  // T < 0.10
  strongCrystallH: 0.20,  // H < 0.20（放宽：旧值 0.10 太严，Run 1 T<0.07 因 H=0.418 无法触发）

  // v6 sync 路径 F 阈值（2026-08-04 新增）
  // 标定依据：campaign native_cognitive 数据 F mean=0.45, range=[0.19, 0.89]
  // strongCrystallF=0.15：历史数据上的经验分位阈值；未经 held-out 校准
  // crystallF=0.25：F 偏低（<25% 分位）→ 系统趋于冻结
  strongCrystallF: 0.15,  // F < 0.15 → 立即终止
  crystallF: 0.25,        // F < 0.25 连续 N 次 → 终止

  // 淬火态
  suddenDropT: 0.05,      // T 下降 > 0.05 视为骤降

  // 混沌态
  chaoticR: 0.40,         // R < 0.40
  chaoticT: 0.50,         // T > 0.50
  chaoticH: 0.60,         // H > 0.60

  // 硬上限
  hardCapUtterances: 40,
};

export class TerminationDecider {
  private thresholds: TerminationThresholds;
  private history: ThermoSnapshot[] = [];
  private consecutiveCrystallCount = 0;
  // v6 sync 路径独立的结晶计数器（与 async 路径隔离）
  private syncConsecutiveCrystallCount = 0;

  constructor(thresholds: Partial<TerminationThresholds> = {}) {
    this.thresholds = { ...DEFAULT_TERMINATION_THRESHOLDS, ...thresholds };
  }

  /** 重置状态（跨实验复用） */
  reset(): void {
    this.history = [];
    this.consecutiveCrystallCount = 0;
    this.syncConsecutiveCrystallCount = 0;
  }

  /** 获取历史快照（用于分析） */
  getHistory(): ThermoSnapshot[] {
    return [...this.history];
  }

  /**
   * 评估当前快照，决定是否终止
   *
   * 终止优先级：
   * 1. 硬上限 → 强制终止
   * 2. 强结晶态 → 立即终止（H 极低 + T 极低）
   * 3. 普通结晶态连续 N 次 → 终止
   * 4. 其他 → 继续
   */
  evaluate(R: number, T: number, H: number, utteranceCount: number): TerminationDecision {
    const F = (1 - R) + T * H;
    const snapshot: ThermoSnapshot = {
      signalSetId: "swarmalpha.scalar_belief_macro",
      signalSetVersion: "1.0.0",
      R, T, H, F,
      utteranceCount,
      evalIndex: this.history.length,
    };
    this.history.push(snapshot);

    // ── 1. 硬上限检查 ──
    if (utteranceCount >= this.thresholds.hardCapUtterances) {
      return {
        shouldTerminate: true,
        reason: "hard_cap",
        stateType: "active",
        message: `发言次数达硬上限 ${this.thresholds.hardCapUtterances}，强制终止（未收敛）`,
      };
    }

    // ── 系统状态分类 ──
    const stateType = this.classifyState(snapshot);

    // ── 2. 强结晶态：H 极低 + T 极低 → 立即终止 ──
    // Compatibility heuristic: low histogram entropy and low dispersion.
    if (T < this.thresholds.strongCrystallT && H < this.thresholds.strongCrystallH) {
      return {
        shouldTerminate: true,
        reason: "strong_crystallized",
        stateType: "crystallized",
        message: `历史稳定性候选（R=${R.toFixed(3)}, T=${T.toFixed(3)}, H=${H.toFixed(3)}），触发兼容快速停止规则`,
      };
    }

    // ── 3. 普通结晶态连续 N 次 ──
    if (stateType === "crystallized") {
      this.consecutiveCrystallCount++;
      if (this.consecutiveCrystallCount >= this.thresholds.consecutiveCrystallRequired) {
        return {
          shouldTerminate: true,
          reason: "crystallized",
          stateType: "crystallized",
          message: `连续 ${this.consecutiveCrystallCount} 次结晶态（R=${R.toFixed(3)}, T=${T.toFixed(3)}, H=${H.toFixed(3)}），系统已冻结`,
        };
      }
    } else {
      this.consecutiveCrystallCount = 0;
    }

    return {
      shouldTerminate: false,
      reason: "continue",
      stateType,
      message: this.getStateMessage(stateType, snapshot),
    };
  }

  /**
   * v6 sync 路径终止评估（基于轮次制，F 进决策分支）
   *
   * 与 async 路径 evaluate() 的区别：
   *   1. 基于 round 而非 utteranceCount（sync 引擎是轮次制）
   *   2. F 进决策分支：强结晶态用 F < strongCrystallF 判定（设计意图落地）
   *   3. 普通结晶态用 F < crystallF 作为额外条件（F 连续 N 轮低 → 终止）
   *   4. 硬上限用 round >= maxRounds 而非 utteranceCount
   *
   * @param R/T/H/F 兼容字段；语义固定为 cognitive macro signal set v1
   * @param round 当前轮次（1-based）
   * @param maxRounds 最大轮次（硬上限）
   * @returns 终止决策
   */
  evaluateSync(
    R: number,
    T: number,
    H: number,
    F: number,
    round: number,
    maxRounds: number,
    policy: SyncTerminationPolicy = "fixed_rounds",
  ): TerminationDecision {
    const snapshot: ThermoSnapshot = {
      signalSetId: "swarmalpha.cognitive_macro",
      signalSetVersion: "1.0.0",
      R, T, H, F,
      utteranceCount: round,  // 复用字段记录轮次（sync 路径无 utteranceCount）
      evalIndex: this.history.length,
    };
    this.history.push(snapshot);

    // ── 1. 硬上限：round >= maxRounds → 强制终止 ──
    if (round >= maxRounds) {
      return {
        shouldTerminate: true,
        reason: "hard_cap",
        stateType: "active",
        message: `轮次达硬上限 ${maxRounds}，强制终止`,
      };
    }

    // fixed/surface 策略不允许 thermo 信号提前终止；surface 由 DiscussionEngine 仲裁。
    if (policy === "fixed_rounds" || policy === "surface") {
      return {
        shouldTerminate: false,
        reason: "continue",
        stateType: "active",
        message: `${policy} 策略未启用 macro-signal 提前终止`,
      };
    }

    const requireF = policy === "rhtf_joint";
    const strongJoint = R > this.thresholds.crystallR
      && T < this.thresholds.strongCrystallT
      && H < this.thresholds.strongCrystallH
      && (!requireF || F < this.thresholds.strongCrystallF);

    // ── 2. 强结晶态：R 高 + T 低 + H 低；F 只能作为可选附加条件 ──
    if (strongJoint) {
      return {
        shouldTerminate: true,
        reason: "strong_crystallized",
        stateType: "crystallized",
        message: `强结晶候选（R=${R.toFixed(3)}, T=${T.toFixed(3)}, H=${H.toFixed(3)}${requireF ? `, F=${F.toFixed(3)}` : ""}），联合条件满足`,
      };
    }

    // ── 3. 普通结晶态：R/T/H 联合条件连续 N 轮；F 仅在 rhtf_joint 中附加 ──
    const stateType = this.classifyStateSync(snapshot, requireF);
    if (stateType === "crystallized") {
      this.syncConsecutiveCrystallCount++;
      if (this.syncConsecutiveCrystallCount >= this.thresholds.consecutiveCrystallRequired) {
        return {
          shouldTerminate: true,
          reason: "crystallized",
          stateType: "crystallized",
          message: `连续 ${this.syncConsecutiveCrystallCount} 轮结晶态（F=${F.toFixed(3)}, R=${R.toFixed(3)}, T=${T.toFixed(3)}, H=${H.toFixed(3)}），系统已冻结`,
        };
      }
    } else {
      this.syncConsecutiveCrystallCount = 0;
    }

    return {
      shouldTerminate: false,
      reason: "continue",
      stateType,
      message: this.getStateMessage(stateType, snapshot),
    };
  }

  /**
   * v6 sync 路径状态分类（F 进分类条件）
   *
   * 与 async 路径 classifyState 的区别：
   *   - rhtf_joint 增加 compatibility composite 阈值（仅实验性附加条件）
   *   - 其余状态分类保持一致（向后兼容）
   */
  private classifyStateSync(
    snapshot: ThermoSnapshot,
    requireF: boolean,
  ): "crystallized" | "quenched" | "chaotic" | "active" {
    const { R, T, H, F } = snapshot;
    const th = this.thresholds;

    // F 不能单独证明结晶；仅在 rhtf_joint 策略中作为 R/T/H 之后的附加条件。
    if (R > th.crystallR
      && T < th.crystallT
      && H < th.crystallH
      && (!requireF || F < th.crystallF)) {
      return "crystallized";
    }

    // 检查 T 是否骤降
    const prevSnapshot = this.history.length >= 2 ? this.history[this.history.length - 2] : null;
    const tDecrease = prevSnapshot ? prevSnapshot.T - T : 0;
    const isSuddenDrop = tDecrease > th.suddenDropT;

    // 淬火态：R 高 + T 骤降 + H 不低（伪结晶）
    if (R > th.crystallR && isSuddenDrop && H >= th.crystallH) {
      return "quenched";
    }

    // 混沌态：R 低 + T 高 + H 高
    if (R < th.chaoticR && T > th.chaoticT && H > th.chaoticH) {
      return "chaotic";
    }

    return "active";
  }

  /**
   * 系统状态分类
   *
   * - crystallized：R 高 + T 低 + H 低 → 真结晶
   * - quenched：R 高 + T 骤降（仅下降）+ H 不低 → 伪结晶
   * - chaotic：R 低 + T 高 + H 高 → 混沌态
   * - active：其他 → 活跃讨论中
   */
  private classifyState(snapshot: ThermoSnapshot): "crystallized" | "quenched" | "chaotic" | "active" {
    const { R, T, H } = snapshot;
    const th = this.thresholds;

    // 结晶态：R 高 + T 低 + H 低
    if (R > th.crystallR && T < th.crystallT && H < th.crystallH) {
      return "crystallized";
    }

    // 检查 T 是否骤降（仅检测下降，不检测上升）
    const prevSnapshot = this.history.length >= 2 ? this.history[this.history.length - 2] : null;
    const tDecrease = prevSnapshot ? prevSnapshot.T - T : 0;
    const isSuddenDrop = tDecrease > th.suddenDropT;

    // 淬火态：R 高 + T 骤降 + H 不低（伪结晶，T 骤降但 H 仍高）
    if (R > th.crystallR && isSuddenDrop && H >= th.crystallH) {
      return "quenched";
    }

    // 混沌态：R 低 + T 高 + H 高
    if (R < th.chaoticR && T > th.chaoticT && H > th.chaoticH) {
      return "chaotic";
    }

    return "active";
  }

  private getStateMessage(stateType: string, s: ThermoSnapshot): string {
    const fStr = s.F.toFixed(3);
    switch (stateType) {
      case "crystallized":
        return `结晶态（R=${s.R.toFixed(3)}, T=${s.T.toFixed(3)}, H=${s.H.toFixed(3)}, F=${fStr}）`;
      case "quenched":
        return `淬火态（R=${s.R.toFixed(3)}, T=${s.T.toFixed(3)}骤降, H=${s.H.toFixed(3)}）— 需注入多样性`;
      case "chaotic":
        return `混沌态（R=${s.R.toFixed(3)}, T=${s.T.toFixed(3)}, H=${s.H.toFixed(3)}）— 需结构引导`;
      default:
        return `活跃态（R=${s.R.toFixed(3)}, T=${s.T.toFixed(3)}, H=${s.H.toFixed(3)}, F=${fStr}）`;
    }
  }
}
