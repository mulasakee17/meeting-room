/**
 * SwarmAlpha v9 — 集中参数配置
 *
 * 所有可配置参数集中于此文件。标定脚本可直接覆盖此对象。
 *
 * 使用:
 *   import { V9_CONFIG } from "./config";
 *   const threshold = V9_CONFIG.neutral.weakConsensusThreshold;
 *
 * 标定覆盖:
 *   import { V9_CONFIG, applyOverrides } from "./config";
 *   applyOverrides({ neutral: { weakConsensusThreshold: 18 } });
 */

// ==================== Agent 定义 ====================

export interface AgentParams {
  influenceWeight: number;
  capitalWeight: number;
  uncertaintySensitivity: number;
  factorWeights: Partial<Record<string, number>>;
  initialBias: number;
  interpretationStyle: "macro" | "value" | "momentum" | "narrative" | "statistical" | "contrarian" | "sentiment";
}

export const AGENT_PARAMS: Record<string, AgentParams> = {
  institution: {
    influenceWeight: 90,
    capitalWeight: 95,
    uncertaintySensitivity: 0.6,
    factorWeights: { liquidity: 1.2, policy: 1.5, fundamental: 1.0 },
    initialBias: 0,
    interpretationStyle: "macro",
  },
  value: {
    influenceWeight: 60,
    capitalWeight: 80,
    uncertaintySensitivity: -0.2,
    factorWeights: { fundamental: 1.5 },
    initialBias: 0,
    interpretationStyle: "value",
  },
  trend: {
    influenceWeight: 45,
    capitalWeight: 50,
    uncertaintySensitivity: 0.5,
    factorWeights: { narrative: 1.5 },
    initialBias: 0,
    interpretationStyle: "momentum",
  },
  panic: {
    influenceWeight: 25,
    capitalWeight: 40,
    uncertaintySensitivity: 1.2,
    factorWeights: { liquidity: 2.0 },
    initialBias: -20,
    interpretationStyle: "sentiment",
  },
  quant: {
    influenceWeight: 55,
    capitalWeight: 75,
    uncertaintySensitivity: 0.1,
    factorWeights: { liquidity: 0.7, fundamental: 0.8 },
    initialBias: 0,
    interpretationStyle: "statistical",
  },
  media: {
    influenceWeight: 70,
    capitalWeight: 10,
    uncertaintySensitivity: 0.4,
    factorWeights: { narrative: 1.5, policy: 0.9 },
    initialBias: 0,
    interpretationStyle: "narrative",
  },
  contrarian: {
    influenceWeight: 40,
    capitalWeight: 60,
    uncertaintySensitivity: -0.5,
    factorWeights: { narrative: -1.2 },
    initialBias: 5,
    interpretationStyle: "contrarian",
  },
  retail: {
    influenceWeight: 10,
    capitalWeight: 20,
    uncertaintySensitivity: 0.8,
    factorWeights: { narrative: 1.0 },
    initialBias: 0,
    interpretationStyle: "narrative",
  },
  policy: {
    influenceWeight: 50,
    capitalWeight: 0,
    uncertaintySensitivity: 0.3,
    factorWeights: { policy: 2.0, liquidity: 1.0 },
    initialBias: 10,
    interpretationStyle: "macro",
  },
};

// ==================== 共识引擎 ====================

export const CONSENSUS_CONFIG = {
  /** 非对称门控: KMeans 低于此值 → 采信聚类, 否则采信线性 */
  asymmetricGateThreshold: -15,
  /** 方向判定: consensus >= this → UP, ≤ -this → DOWN */
  directionThreshold: 15,
};

// ==================== Neutral 四规则检测 ====================

export const NEUTRAL_CONFIG = {
  /** Rule 1: |consensus| 低于此值 → Neutral */
  weakConsensusThreshold: 15,
  /** Rule 2: belief_std 超过此值 → Neutral candidate */
  highDisagreementThreshold: 45,
  /** Rule 3: Kuramoto r 低于此值 → Neutral candidate */
  lowSyncThreshold: 0.4,
  /** Rule 4: uncertainty 超过此值 → Neutral candidate */
  highUncertaintyThreshold: 70,
  /** Rule 4: 高不确定性下共识需超过此值才能 bypass Neutral */
  uncertaintyConsensusFloor: 25,
};

// ==================== 非线性共识 ====================

export const NONLINEAR_CONFIG = {
  /** 幂律指数 (1.0=线性, >1放大极端, <1压缩极端) */
  powerAlpha: 1.5,
  /** 修剪均值: 从两端各移除的 Agent 数 */
  trimCount: 1,
  /** 缩尾: 下百分位阈值 */
  winsorLowerPct: 20,
  /** 缩尾: 上百分位阈值 */
  winsorUpperPct: 80,
  /** 动态集成中包含的方法 */
  ensembleMethods: ["power_law", "entropy_weighted", "trimmed_mean", "median", "winsorized", "geometric_mean"],
  /** 单方法权重上限 (防止单一方法绑架集成) */
  maxSingleWeight: 0.5,
};

// ==================== 市场感知 (v9.6 均值回归) ====================

export const MARKET_AWARENESS_CONFIG = {
  /** Agent 对统计均值回归信号的响应强度 */
  mrAgentMultiplier: {
    contrarian: 2.0,
    value: 1.5,
    institution: 1.2,
    quant: 0.6,
    policy: 0.4,
    media: 0.3,
    trend: 0.2,
    retail: 0.2,
    panic: 0.1,
  } as Record<string, number>,

  /** 均值回归触发条件 */
  meanReversion: {
    strong: { rsiMax: 20, vixMin: 40, signal: 1.0 },
    moderate: { rsiMax: 25, vixMin: 35, signal: 0.6 },
    weak: { rsiMax: 30, vixMin: 30, signal: 0.3 },
  },

  /** Pattern-Aware 修正参数 */
  patterns: {
    MECHANICAL_SELLOFF: {
      valueContrarian: { scale: 0.2, shift: 15 },
      panic: { scale: 0.3 },
      patternBoost: 2.0,
    },
    SOLVENCY_CRISIS: {
      bearishBoost: 1.15,
    },
    NARRATIVE_DRIVEN: {
      contrarian: { scale: -0.5 },
      media: { scale: 0.3 },
    },
    EXTERNAL_SHOCK: {
      value: { scale: 0.7 },
    },
  } as Record<string, Record<string, { scale: number; shift?: number } | number>>,
};

// ==================== 解释风格 ====================

export const INTERPRETATION_CONFIG = {
  /** v9.7 标定: 解释风格放大系数 (1.0=默认, 0=退化为线性) */
  amplification: 1.0,
  /** v9.7 标定: 不确定性敏感度全局缩放 */
  sensitivityScale: 1.0,

  /** 各风格的基础乘数 (会被 amplification 缩放) */
  styleMultipliers: {
    sentiment: 1.3,
    contrarian: 1.0,   // contrarian 有自己的分段逻辑
    statistical: 0.85,
    momentum: 1.0,     // momentum 用 sqrt 变换
    narrative: 1.1,
    value: 1.0,        // value 有非对称逻辑
    macro: 1.0,
  } as Record<string, number>,
};

// ==================== 模拟参数 ====================

export const SIMULATION_CONFIG = {
  /** 默认模拟轮数 */
  defaultRounds: 3,
  /** 磁滞因子: 防止 Agent 信念在0附近剧烈振荡 */
  hysteresisFactor: 0.2,
  /** 磁滞触发: 信念变化小于此值才施加磁滞 */
  hysteresisFlipThreshold: 30,
};

// ==================== 标定覆盖接口 ====================

let overrides: Partial<typeof import("./config")> = {};

export function applyOverrides(o: Record<string, any>) {
  if (o.neutral) Object.assign(NEUTRAL_CONFIG, o.neutral);
  if (o.consensus) Object.assign(CONSENSUS_CONFIG, o.consensus);
  if (o.nonlinear) Object.assign(NONLINEAR_CONFIG, o.nonlinear);
  if (o.interpretation) Object.assign(INTERPRETATION_CONFIG, o.interpretation);
  if (o.simulation) Object.assign(SIMULATION_CONFIG, o.simulation);
  if (o.marketAwareness) Object.assign(MARKET_AWARENESS_CONFIG, o.marketAwareness);
  // deep merge for agent params
  if (o.agents) {
    for (const [id, params] of Object.entries(o.agents)) {
      if (AGENT_PARAMS[id]) {
        Object.assign(AGENT_PARAMS[id], params);
      }
    }
  }
}
