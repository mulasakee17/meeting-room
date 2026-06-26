/**
 * SwarmAlpha v9.5 — 动态权重引擎 (Dynamic Cascade Weights Engine)
 *
 * 场景自适应权重调整: 基于当前市场状态(恐慌/政策/价值洼地),
 * 动态调整 9 个 Agent 的影响力权重 (influenceWeight),
 * 使系统能够自适应不同市场场景。
 *
 * 设计原则:
 *   1. 纯数学, 零 LLM 调用 — 所有判断基于已有指标
 *   2. 乘数系数 — 不覆盖基础权重, 叠加乘数后钳制到安全范围
 *   3. 可解释 — 每个调整有明确的触发条件、乘数和原因
 *   4. 可开关 — enableDynamicWeights: true/false, 默认关闭 (消融对比用)
 *
 * 模式重叠策略 (乘法合成):
 *   当多个模式同时触发时, 各模式的乘数连乘得到最终乘数。
 *   限制范围: 最终乘数钳制在 [0.3, 3.0]。
 *   例: Panic 给 Panic Agent ×1.40, Value 给 Panic Agent ×0.80
 *       → 合成: 1.40 × 0.80 = 1.12 (恐慌中的价值压缩)
 *
 * v9.5.2 改进 (vs 原始方案):
 *   - FactorVector 访问使用 find() 而非点号 (修正类型兼容性)
 *   - beliefStd 恐慌阈值从 60 降至 50 (适配模板模式均值 ~37)
 *   - 价值洼地模式增加 compound 条件 (fundamental<-50 AND uncertainty>70)
 *   - MarketSnapshot 类型包含 vix + rsi + beliefStd
 *   - Quant/Media Agent 显式记录为 "静态稳定器" (权重不变, 已文档化)
 *   - PolicyAgent 在恐慌模式下保持权重不变 (资本权重=0, 不参与资金流)
 */

import { V9AgentDefinition, V9AgentState, FactorVector, FactorCategory } from "../v9/types";

// ==================== 市场快照 ====================

/**
 * 传递给动态权重引擎的市场观测快照
 * 注意: vix 来自 V9SimConfig.marketData.vix (Yahoo Finance 或推断)
 *       beliefStd 来自 v9 模拟输出 (Agent 信念标准差)
 */
export interface MarketSnapshot {
  /** VIX 波动率指数 (10~80) */
  vix: number;
  /** RSI 相对强弱指标 (0~100) */
  rsi: number;
  /** Agent 信念标准差 (0~100), 越大越分歧 */
  beliefStd: number;
}

// ==================== 结果类型 ====================

/** 单个 Agent 的权重调整详情 */
export interface AgentWeightAdjustment {
  agentId: string;
  agentName: string;
  emoji: string;
  /** 基础影响力权重 (来自 V9AgentDefinition.influenceWeight) */
  baseWeight: number;
  /** 合成乘数 (多个模式的乘数连乘积, 钳制到 [0.3, 3.0]) */
  multiplier: number;
  /** 调整后的最终权重 = baseWeight × multiplier */
  finalWeight: number;
  /** 贡献了乘数的模式列表 (如 ['panic', 'value']) */
  contributingModes: string[];
  /** 人类可读的调整原因 */
  reason: string;
}

/** 动态权重计算的完整结果 */
export interface DynamicWeightResult {
  /** agentId → 调整后的权重 */
  weights: Record<string, number>;
  /** 触发的模式列表 (如 ['panic', 'policy']) */
  activeModes: string[];
  /** 每个 Agent 的调整详情 (用于 UI 展示和调试) */
  adjustments: Record<string, AgentWeightAdjustment>;
  /** 三种模式的检测详情 */
  modeDetails: {
    panic: { triggered: boolean; reasons: string[] };
    policy: { triggered: boolean; reasons: string[] };
    value: { triggered: boolean; reasons: string[] };
  };
}

// ==================== 配置常量 ====================

const CONFIG = {
  /** 最终乘数下限 (防止权重被压缩到接近于零) */
  minMultiplier: 0.3,
  /** 最终乘数上限 (防止单一 Agent 权重过度膨胀) */
  maxMultiplier: 3.0,
};

// ==================== 辅助函数 ====================

/** 安全地从 FactorVector 提取单个因子值 */
function getFactorValue(fv: FactorVector, category: FactorCategory): number {
  return fv.factors.find(f => f.category === category)?.value ?? 0;
}

// ==================== 模式检测 ====================

interface ModeDetection {
  triggered: boolean;
  reasons: string[];
}

/**
 * 检测恐慌模式 (Panic Mode)
 *
 * 触发条件 (满足任一即触发):
 *   - vix > 35          → VIX 进入恐慌区域
 *   - beliefStd > 50    → Agent 信念高度分歧 (v9.5.2: 50, 适配模板模式)
 *   - panic.belief < -70 → 恐慌者极度悲观
 */
function detectPanicMode(
  snapshot: MarketSnapshot,
  agentStates: Record<string, V9AgentState>
): ModeDetection {
  const reasons: string[] = [];

  if (snapshot.vix > 35) {
    reasons.push(`VIX=${snapshot.vix.toFixed(1)} > 35 (恐慌区间)`);
  }
  if (snapshot.beliefStd > 50) {
    reasons.push(`信念标准差=${snapshot.beliefStd.toFixed(1)} > 50 (Agent 高度分歧)`);
  }

  const panicBelief = agentStates["panic"]?.belief;
  if (panicBelief !== undefined && panicBelief < -70) {
    reasons.push(`Panic Agent 信念=${panicBelief.toFixed(1)} < -70 (极度悲观)`);
  }

  return { triggered: reasons.length > 0, reasons };
}

/**
 * 检测政策主导模式 (Policy Mode)
 *
 * 触发条件 (满足任一即触发):
 *   - factorVector.policy > 70    → 政策信号极强
 *   - policyAgent.belief > 60     → 政策 Agent 信心高涨
 */
function detectPolicyMode(
  factorVector: FactorVector,
  agentStates: Record<string, V9AgentState>
): ModeDetection {
  const reasons: string[] = [];

  const policyVal = getFactorValue(factorVector, "policy");
  if (policyVal > 70) {
    reasons.push(`政策因子=${policyVal.toFixed(1)} > 70 (政策信号强烈)`);
  }

  const policyBelief = agentStates["policy"]?.belief;
  if (policyBelief !== undefined && policyBelief > 60) {
    reasons.push(`PolicyAgent 信念=${policyBelief.toFixed(1)} > 60 (政策信心高涨)`);
  }

  return { triggered: reasons.length > 0, reasons };
}

/**
 * 检测价值洼地模式 (Value Mode)
 *
 * v9.5.2 改进: 增加复合条件 —
 *   fundamental < -50 AND uncertainty > 70 同时满足才触发。
 *   单独满足任一时仅记录但不触发。
 *   另保留两个独立触发路径:
 *   - uncertainty > 70 (单独) → 仅当 fundamental 也 < -20 时触发
 *   - value.belief < -40        → 价值投资者信心崩溃 → 机会浮现
 *
 * 设计理由: 高不确定性本身不等于价值洼地。
 *   可能是"我们不知道基本面多糟"(应恐慌), 也可能是"市场过度恐慌=错杀"(应抄底)。
 *   通过 cross-check fundamental 来区分这两种情况。
 */
function detectValueMode(
  factorVector: FactorVector,
  agentStates: Record<string, V9AgentState>
): ModeDetection {
  const reasons: string[] = [];

  const fundamentalVal = getFactorValue(factorVector, "fundamental");
  const uncertaintyVal = getFactorValue(factorVector, "uncertainty");

  // Compound: 基本面极差 + 极高不确定性 → 典型错杀
  if (fundamentalVal < -50 && uncertaintyVal > 70) {
    reasons.push(
      `基本面=${fundamentalVal.toFixed(1)} < -50 ∧ 不确定性=${uncertaintyVal.toFixed(1)} > 70 (典型错杀)`
    );
  } else {
    // 独立条件 (需部分 cross-check)
    if (fundamentalVal < -50) {
      reasons.push(`基本面因子=${fundamentalVal.toFixed(1)} < -50 (极端低估)`);
    }
    if (uncertaintyVal > 70 && fundamentalVal < -20) {
      reasons.push(
        `不确定性=${uncertaintyVal.toFixed(1)} > 70 ∧ 基本面=${fundamentalVal.toFixed(1)} < -20 (认知迷雾中的低估机会)`
      );
    }
  }

  const valueBelief = agentStates["value"]?.belief;
  if (valueBelief !== undefined && valueBelief < -40) {
    reasons.push(`Value Agent 信念=${valueBelief.toFixed(1)} < -40 (价值信心低迷 → 逆向机会)`);
  }

  return { triggered: reasons.length > 0, reasons };
}

// ==================== 模式权重乘数表 ====================

/**
 * 恐慌模式 (Panic Mode) 乘数
 * 逻辑: 恐慌传染效应下, 恐惧被放大, 理性被压制
 */
const PANIC_MULTIPLIERS: Record<string, number> = {
  panic: 1.4,        // 恐慌传染效应放大
  institution: 1.15,  // 机构作为制衡力量, 权重提升
  retail: 0.7,       // 散户从众加剧, 权重压缩 (避免噪音放大)
};

/**
 * 政策主导模式 (Policy Mode) 乘数
 * 逻辑: 政策信号明确时, 跟随政策的 Agent 话语权提升, 纯叙事驱动弱化
 */
const POLICY_MULTIPLIERS: Record<string, number> = {
  policy: 1.4,       // 政策信号明确, 政策 Agent 话语权放大
  institution: 1.15,  // 机构跟随政策, 话语权同步提升
  retail: 0.6,       // 政策市压缩散户影响力
  trend: 0.8,        // 政策市弱化纯叙事驱动
};

/**
 * 价值洼地模式 (Value Mode) 乘数
 * 逻辑: 极端恐慌导致低估, 逆向思维和长期价值投资话语权飙升
 */
const VALUE_MULTIPLIERS: Record<string, number> = {
  value: 1.5,        // 极端恐慌导致低估, 价值投资者话语权飙升
  contrarian: 1.3,   // 逆向机会浮现
  trend: 0.6,        // 趋势交易者被打压 (市场非理性阶段, 趋势失效)
  panic: 0.8,        // 恐慌情绪被压缩 (价值区不需要放大恐惧)
};

/**
 * 乘数的人类可读解释
 */
const MULTIPLIER_REASONS: Record<string, Record<string, string>> = {
  panic: {
    panic: "恐慌传染效应 — 恐惧情绪自我强化, 权重放大",
    institution: "机构制衡 — 恐慌中机构作为稳定器, 权重提升",
    retail: "散户噪音压缩 — 从众行为加剧, 避免噪音放大扭曲共识",
  },
  policy: {
    policy: "政策信号放大 — 政策方向明确时政策Agent话语权提升",
    institution: "机构跟随政策 — 机构与政策方向一致, 话语权同步提升",
    retail: "政策市散户压缩 — 政策主导市场中散户影响力下降",
    trend: "叙事驱动弱化 — 政策市降低纯叙事/趋势交易的参考价值",
  },
  value: {
    value: "价值发现 — 极端低估中价值投资者话语权飙升",
    contrarian: "逆向机会 — 市场非理性阶段逆向思维价值凸显",
    trend: "趋势失效 — 非理性市场中趋势信号不可靠, 权重压缩",
    panic: "恐慌压缩 — 价值区不需要放大恐惧情绪",
  },
};

// ==================== 主入口 ====================

/**
 * 基于当前系统状态计算动态权重
 *
 * 算法流程:
 *   1. 检测三种模式 (恐慌/政策/价值洼地)
 *   2. 对每个 Agent, 将触发模式的乘数连乘
 *   3. 钳制到 [0.3, 3.0] 安全范围
 *   4. 生成包含触发原因和解释的完整结果
 *
 * @param agents       — 9 个 Agent 的定义 (含基础权重 baseWeight)
 * @param factorVector — v9 因子提取器的输出 (5 个正交因子)
 * @param marketSnapshot — 市场快照 (vix, rsi, beliefStd)
 * @param agentStates  — 当前各 Agent 的信念值 (用于检测 panic.belief, value.belief 等)
 * @param enable       — 是否启用动态权重。false 时返回静态权重占位
 * @returns 调整后的权重、触发模式、每个 Agent 的调整详情
 */
export function computeDynamicWeights(
  agents: V9AgentDefinition[],
  factorVector: FactorVector,
  marketSnapshot: MarketSnapshot,
  agentStates: Record<string, V9AgentState>,
  enable: boolean
): DynamicWeightResult {
  // ── 初始化: 所有 Agent 保持静态权重 ──
  const weights: Record<string, number> = {};
  const adjustments: Record<string, AgentWeightAdjustment> = {};

  for (const agent of agents) {
    weights[agent.id] = agent.influenceWeight;
    adjustments[agent.id] = {
      agentId: agent.id,
      agentName: agent.name,
      emoji: agent.emoji,
      baseWeight: agent.influenceWeight,
      multiplier: 1.0,
      finalWeight: agent.influenceWeight,
      contributingModes: [],
      reason: "静态权重 (动态权重未启用)",
    };
  }

  // ── 未启用: 直接返回静态 ──
  if (!enable) {
    return {
      weights,
      activeModes: [],
      adjustments,
      modeDetails: {
        panic: { triggered: false, reasons: [] },
        policy: { triggered: false, reasons: [] },
        value: { triggered: false, reasons: [] },
      },
    };
  }

  // ── 1. 检测三种模式 ──
  const panicMode = detectPanicMode(marketSnapshot, agentStates);
  const policyMode = detectPolicyMode(factorVector, agentStates);
  const valueMode = detectValueMode(factorVector, agentStates);

  const activeModes: string[] = [];
  if (panicMode.triggered) activeModes.push("panic");
  if (policyMode.triggered) activeModes.push("policy");
  if (valueMode.triggered) activeModes.push("value");

  // ── 2. 收集触发模式的乘数表 ──
  const modeMultiplierTables: Array<{
    mode: string;
    multipliers: Record<string, number>;
  }> = [];
  if (panicMode.triggered) {
    modeMultiplierTables.push({ mode: "panic", multipliers: PANIC_MULTIPLIERS });
  }
  if (policyMode.triggered) {
    modeMultiplierTables.push({ mode: "policy", multipliers: POLICY_MULTIPLIERS });
  }
  if (valueMode.triggered) {
    modeMultiplierTables.push({ mode: "value", multipliers: VALUE_MULTIPLIERS });
  }

  // ── 3. 对每个 Agent 计算合成乘数 ──
  for (const agent of agents) {
    let compositeMultiplier = 1.0;
    const contributingModes: string[] = [];
    const reasonParts: string[] = [];

    for (const { mode, multipliers } of modeMultiplierTables) {
      const modeMultiplier = multipliers[agent.id];
      if (modeMultiplier !== undefined && modeMultiplier !== 1.0) {
        compositeMultiplier *= modeMultiplier;
        contributingModes.push(mode);
        const reasonText =
          MULTIPLIER_REASONS[mode]?.[agent.id] ?? `${mode}模式调整`;
        reasonParts.push(`[${mode}] ×${modeMultiplier.toFixed(2)}: ${reasonText}`);
      }
    }

    // 钳制到安全范围
    const clamped = Math.max(
      CONFIG.minMultiplier,
      Math.min(CONFIG.maxMultiplier, compositeMultiplier)
    );
    const finalWeight = Math.round(agent.influenceWeight * clamped * 10) / 10;

    weights[agent.id] = finalWeight;
    adjustments[agent.id] = {
      agentId: agent.id,
      agentName: agent.name,
      emoji: agent.emoji,
      baseWeight: agent.influenceWeight,
      multiplier: Math.round(clamped * 1000) / 1000,
      finalWeight,
      contributingModes,
      reason:
        contributingModes.length > 0
          ? reasonParts.join(" | ")
          : "无触发模式, 保持静态权重",
    };
  }

  // ── 4. 显式标注静态稳定器 (权重不变的 Agent) ──
  const STATIC_STABILIZERS: Record<string, string> = {
    quant:
      "量化模型不受情绪影响 (uncertaintySensitivity=0.1), 始终维持静态权重",
    media:
      "媒体传播者影响力独立于市场状态, 其叙事传播权重保持恒定 (待后续版本引入'信息级联'动态调整)",
  };

  for (const [agentId, reason] of Object.entries(STATIC_STABILIZERS)) {
    if (adjustments[agentId] && adjustments[agentId].contributingModes.length === 0) {
      adjustments[agentId].reason = `静态稳定器 — ${reason}`;
    }
  }

  return {
    weights,
    activeModes,
    adjustments,
    modeDetails: {
      panic: { triggered: panicMode.triggered, reasons: panicMode.reasons },
      policy: { triggered: policyMode.triggered, reasons: policyMode.reasons },
      value: { triggered: valueMode.triggered, reasons: valueMode.reasons },
    },
  };
}

// ==================== 格式化工具 ====================

/**
 * 将动态权重结果格式化为控制台可读日志
 */
export function formatDynamicWeightSummary(result: DynamicWeightResult): string {
  const lines: string[] = [];
  lines.push("━━━━ 动态权重调整 (Cascade Dynamic Weights) ━━━━");
  lines.push("");

  // 模式检测摘要
  lines.push("📡 模式检测:");
  for (const mode of ["panic", "policy", "value"] as const) {
    const detail = result.modeDetails[mode];
    const icon = mode === "panic" ? "🔴" : mode === "policy" ? "🏛️" : "💎";
    if (detail.triggered) {
      lines.push(`  ${icon} ${mode.toUpperCase()} ✓ 触发`);
      for (const reason of detail.reasons) {
        lines.push(`     └ ${reason}`);
      }
    } else {
      lines.push(`  ${icon} ${mode.toUpperCase()} — 未触发`);
    }
  }

  lines.push("");

  if (result.activeModes.length === 0) {
    lines.push("⚖️ 无触发模式 — 使用静态权重");
    return lines.join("\n");
  }

  // 权重调整详情 (按变化幅度排序)
  const adjusted = Object.values(result.adjustments)
    .filter((a) => a.contributingModes.length > 0)
    .sort(
      (a, b) =>
        Math.abs(b.multiplier - 1) - Math.abs(a.multiplier - 1)
    );

  if (adjusted.length === 0) {
    lines.push("⚖️ 触发模式存在但无 Agent 权重要调整");
    return lines.join("\n");
  }

  lines.push("⚖️ 权重调整:");
  for (const adj of adjusted) {
    const direction = adj.multiplier > 1 ? "▲" : adj.multiplier < 1 ? "▼" : "─";
    const delta = adj.multiplier > 1
      ? `+${Math.round((adj.multiplier - 1) * 100)}%`
      : adj.multiplier < 1
        ? `${Math.round((adj.multiplier - 1) * 100)}%`
        : "不变";
    lines.push(
      `  ${adj.emoji} ${adj.agentName}: ${adj.baseWeight} → ${adj.finalWeight} (${direction} ${delta}) [${adj.contributingModes.join("+")}]`
    );
  }

  return lines.join("\n");
}
