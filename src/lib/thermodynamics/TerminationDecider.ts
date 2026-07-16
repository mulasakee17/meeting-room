/**
 * 热力学终止决策器
 *
 * 基于社会热力学状态 (R, T, H, F) 判断异步讨论是否该终止。
 *
 * 核心假设：F 分解的"系统是否冻结"诊断能力可以决定讨论何时结束，
 * 而非依赖固定轮次。
 *
 * 终止判据：
 * 1. 强结晶态：H < strongCrystallH 且 T < strongCrystallT → 立即终止（1 次即可）
 *    - 理由：H 极低说明 agent 信念完全聚集，T 极低说明噪声极小
 *    - 这是"不可逆收敛"信号，继续讨论只会打散已收敛的信念
 * 2. 普通结晶态连续出现 N 次 → 系统已冻结，终止
 * 3. 发言次数达硬上限 → 强制终止（标记为"未收敛"）
 * 4. 其他 → 继续
 *
 * 结晶态定义（阈值可通过 constructor 标定）：
 * - R > thresholdR（高同步）
 * - T < thresholdT（低噪声）
 * - H < thresholdH（低熵）
 *
 * 淬火态判据（伪结晶）：
 * - R 高 + T 骤降（仅检测下降，不检测上升）+ H 不低
 * - T 骤降但 H 仍高说明 agent 被迫同步但内心仍分散
 */

/** 热力学快照 */
export interface ThermoSnapshot {
  /** Kuramoto 序参量 R ∈ [0,1] */
  R: number;
  /** 归一化温度 T ∈ [0,1] */
  T: number;
  /** Shannon 熵 H ∈ [0,1] */
  H: number;
  /** 社会自由能 F = (1-R) + T·H */
  F: number;
  /** 发言次数（累计） */
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
  /** 硬上限：发言次数 */
  hardCapUtterances: number;
}

/**
 * 默认阈值
 *
 * 标定依据：fraud_C_0 pilot 数据
 * - R 始终 >0.87 → crystallR 从 0.75 提高到 0.85
 * - eval3 (H=0, T=0.08) 是真正收敛点 → 新增强结晶快速终止
 * - eval2 (H=0.311) 被 0.30 挡住 → crystallH 从 0.30 放宽到 0.35
 * - T 骤降原用绝对值（bug）→ 改为只检测下降
 */
export const DEFAULT_TERMINATION_THRESHOLDS: TerminationThresholds = {
  // 普通结晶态
  crystallR: 0.85,        // R > 0.85（提高，避免 R 条件形同虚设）
  crystallT: 0.20,        // T < 0.20（放宽，避免卡在 0.15 边缘）
  crystallH: 0.35,        // H < 0.35（放宽，避免卡在 0.30 边缘）
  consecutiveCrystallRequired: 2,

  // 强结晶态（H 极低 + T 极低 → 立即终止）
  strongCrystallT: 0.10,  // T < 0.10
  strongCrystallH: 0.10,  // H < 0.10

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

  constructor(thresholds: Partial<TerminationThresholds> = {}) {
    this.thresholds = { ...DEFAULT_TERMINATION_THRESHOLDS, ...thresholds };
  }

  /** 重置状态（跨实验复用） */
  reset(): void {
    this.history = [];
    this.consecutiveCrystallCount = 0;
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
    // 不需要 R 条件：H 极低意味着所有 agent 信念聚集在同一个 bin，
    // T 极低意味着信念方差极小——两者同时满足已是不可逆收敛
    if (T < this.thresholds.strongCrystallT && H < this.thresholds.strongCrystallH) {
      return {
        shouldTerminate: true,
        reason: "strong_crystallized",
        stateType: "crystallized",
        message: `强结晶态（R=${R.toFixed(3)}, T=${T.toFixed(3)}, H=${H.toFixed(3)}），立即终止（不可逆收敛）`,
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
