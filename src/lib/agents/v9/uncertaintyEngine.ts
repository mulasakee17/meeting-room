/**
 * Neutral Detection Engine — v9.3
 *
 * 四规则 Neutral 检测体系, 替代 v9.2 的加权评分制 (scoring >= 50)。
 *
 * v9.2 问题:
 *   三条规则需要至少 2 条同时触发 (score >= 50),
 *   但 v9.2 模板升级后 belief_std 均值降至 37.6,
 *   divergenceThreshold=55 永远不触发, largestClusterRatio 也极少触发,
 *   Neutral = 0%。
 *
 * v9.3 设计:
 *   四条独立规则, OR 逻辑 + 一条复合条件:
 *     Rule 1: abs(consensus) < 15               → Neutral (弱共识)
 *     Rule 2: belief_std > 45                   → Neutral candidate (高分歧)
 *     Rule 3: kuramoto_r < 0.4                  → Neutral candidate (低同步)
 *     Rule 4: uncertainty > 70 AND abs(consensus) < 25 → Neutral (高不确定+弱共识)
 *     Compound: Rule2 AND Rule3                 → Neutral (分歧+失同步)
 *
 *   方向判定 (不在 Neutral 时):
 *     consensus >= 15 → UP
 *     else           → DOWN  (即 consensus <= -15)
 *
 * 与因子层 uncertainty 的正交性:
 *   因子层: "这个事件本身有多不确定?" (LLM/模板判断)
 *   共识层: "Agent 们是否无法形成一致判断?" (行为检测)
 *   Rule 4 要求两者同时满足 → 只有"事件不确定且 Agent 也看不清"才 Neutral
 */

import { UncertaintyResult, V9Decision, V9AgentState } from "./types";

// ==================== Neutral Engine 配置 ====================

const NEUTRAL_ENGINE = {
  /** Rule 1: 共识绝对值低于此值 → Neutral */
  weakConsensusThreshold: 15,
  /** Rule 2: 信念标准差超过此值 → Neutral candidate */
  highDisagreementThreshold: 45,
  /** Rule 3: Kuramoto 序参量低于此值 → Neutral candidate */
  lowSyncThreshold: 0.4,
  /** Rule 4: 因子层 uncertainty 超过此值 → Neutral candidate */
  highUncertaintyThreshold: 70,
  /** Rule 4: 在高不确定性下, 共识需要超过此值才能 bypass Neutral */
  uncertaintyConsensusFloor: 25,
};

// ==================== 兼容层: 保留旧版 evaluateUncertainty 接口 ====================

/**
 * @deprecated — 被 v9.3 evaluateNeutral() 取代。
 * 保留用于 V9Decision.uncertainty 字段的向后兼容填充。
 */
export function evaluateUncertainty(
  consensus: number,
  beliefStd: number,
  _agents: Record<string, V9AgentState>
): UncertaintyResult {
  const reasons: string[] = [];
  let score = 0;

  if (Math.abs(consensus) < NEUTRAL_ENGINE.weakConsensusThreshold) {
    reasons.push(`共识幅度不足 (|${consensus.toFixed(1)}| < ${NEUTRAL_ENGINE.weakConsensusThreshold})`);
    score += 40;
  }

  if (beliefStd > NEUTRAL_ENGINE.highDisagreementThreshold) {
    reasons.push(`Agent 信念过度分散 (std=${beliefStd.toFixed(1)} > ${NEUTRAL_ENGINE.highDisagreementThreshold})`);
    score += 35;
  }

  return {
    isUncertain: score >= 40,
    reasons: reasons.length > 0 ? reasons : ["v9.3 Neutral Engine 覆盖中"],
    score: Math.min(100, score),
  };
}

// ==================== v9.3 Neutral Detection Engine ====================

interface NeutralInputs {
  kuramotoR: number;
  uncertaintyFactor: number;
  /** 用于 Neutral 检测的共识值 (门控前/线性共识)。
   *  如果不提供, 默认使用外部 consensus。 */
  neutralConsensus?: number;
  /** 聚类共识 (用于检测共识方法间分歧) */
  clusterConsensus?: number;
  /** 🆕 v9.5.1: 市场 VIX (用于客观不确定性 — 40=100% uncertain) */
  vix?: number;
  ablation?: {
    disableRule1?: boolean;
    disableRule2_3?: boolean;
    disableRule4?: boolean;
  };
  /** 🆕 v9.5.2: 方向判定阈值。consensus >= this → UP, else → DOWN。
   *  默认 15 (NEUTRAL_ENGINE.weakConsensusThreshold)。
   *  模板模式可降至 -5~0 以补偿模板因子偏弱的问题。 */
  directionThreshold?: number;
}

interface NeutralTrace {
  rule1_fired: boolean;
  rule2_fired: boolean;
  rule3_fired: boolean;
  rule4_fired: boolean;
  finalNeutral: boolean;
  gatingReason: string;
}

/**
 * v9.3 四规则 Neutral 检测
 *
 * 返回: { isNeutral, trace }
 *   isNeutral=true → 方向信号不可靠, 应输出 NEUTRAL
 *   isNeutral=false → 按 consensus 符号判定 UP/DOWN
 */
function evaluateNeutral(
  consensus: number,
  neutralConsensus: number | undefined,
  clusterConsensus: number | undefined,
  beliefStd: number,
  kuramotoR: number,
  uncertaintyFactor: number,
  ablation?: NeutralInputs["ablation"],
  vix?: number
): { isNeutral: boolean; trace: NeutralTrace } {
  // Neutral 检测使用 neutralConsensus (门控前线性共识), 避免门控干扰
  const consForNeutral = neutralConsensus ?? consensus;
  const consForCluster = clusterConsensus ?? consensus;

  // ── 🆕 v9.5.1: 融合不确定性 (60% LLM + 40% 市场客观 VIX) ──
  const marketVix = vix ?? 20;
  const marketUncertainty = Math.min(marketVix / 40, 1) * 100; // VIX=40 → 100% uncertain
  const effectiveUncertainty = 0.6 * uncertaintyFactor + 0.4 * marketUncertainty;

  // ── 计算四条规则 ──
  // R1: 线性共识弱 + 聚类共识也弱 → 两种方法一致认为方向模糊
  //   注意: 当 Linear 弱但 KMeans 强时 (gate=cluster), 两类事件表现相同:
  //     (a) 真正的 DOWN 事件 — KMeans 正确识别了空头簇
  //     (b) Neutral 事件 — KMeans 过度放大, 模板因子偏差
  //   在模板模式下两者无法区分。保守策略: 只当两种方法一致弱时才 Neutral,
  //   避免破坏 Down 准确率。LLM 模式下因子质量更高, 有望区分。
  const consLinearWeak = Math.abs(consForNeutral) < NEUTRAL_ENGINE.weakConsensusThreshold;
  const consClusterWeak = Math.abs(consForCluster) < NEUTRAL_ENGINE.weakConsensusThreshold;

  const rule1 = !ablation?.disableRule1
    && consLinearWeak && consClusterWeak;

  const rule2 = !ablation?.disableRule2_3
    && beliefStd > NEUTRAL_ENGINE.highDisagreementThreshold;

  const rule3 = !ablation?.disableRule2_3
    && kuramotoR < NEUTRAL_ENGINE.lowSyncThreshold;

  // v9.5.1: Rule 4 使用融合不确定性 (LLM + VIX), 阈值从 70 降至 65
  const rule4 = !ablation?.disableRule4
    && effectiveUncertainty > 65
    && Math.abs(consForNeutral) < NEUTRAL_ENGINE.uncertaintyConsensusFloor;

  // ── 最终判定 (OR + 复合条件) ──
  // Rule1: 两种共识方法一致显示弱信号 → 真正的方向模糊
  // Rule4: 高不确定性 + 线性共识弱 → 迷雾中看不清
  // Rule2 AND Rule3: 高分歧 + 低同步 → 真正的各说各话
  const isNeutral = rule1 || rule4 || (rule2 && rule3);

  // ── 构建诊断追踪 ──
  const firedRules: string[] = [];
  if (rule1) firedRules.push("R1:弱共识");
  if (rule2) firedRules.push("R2:高分歧");
  if (rule3) firedRules.push("R3:低同步");
  if (rule4) firedRules.push("R4:高不确定+弱共识");
  if (rule2 && rule3) firedRules.push("R2∧R3:分歧+失同步");

  const nInfo = neutralConsensus !== undefined ? ` nCons=${neutralConsensus.toFixed(1)}` : "";
  const gatingReason = isNeutral
    ? `Neutral | ${firedRules.join(" ")} | consensus=${consensus.toFixed(1)}${nInfo} std=${beliefStd.toFixed(1)} r=${kuramotoR.toFixed(2)} unc=${uncertaintyFactor}`
    : `Directional | consensus=${consensus.toFixed(1)} r=${kuramotoR.toFixed(2)}`;

  return {
    isNeutral,
    trace: {
      rule1_fired: rule1,
      rule2_fired: rule2,
      rule3_fired: rule3,
      rule4_fired: rule4,
      finalNeutral: isNeutral,
      gatingReason,
    },
  };
}

// ==================== 决策层集成 ====================

export function makeDecision(
  consensus: number,
  beliefStd: number,
  agents: Record<string, V9AgentState>,
  disableUncertainty: boolean = false,
  neutralInputs?: NeutralInputs
): V9Decision {
  // 兼容旧版 uncertainty 填充
  const uncertainty = disableUncertainty
    ? { isUncertain: false, reasons: ["共识质量引擎已关闭 (消融实验)"], score: 0 }
    : evaluateUncertainty(consensus, beliefStd, agents);

  let direction: V9Decision["direction"];
  let confidence: number;
  let trace: NeutralTrace | undefined;

  // 🆕 v9.5.2: 可配置的方向阈值 (模板模式可用 -5, LLM 模式保持 15)
  const dirThreshold = neutralInputs?.directionThreshold ?? NEUTRAL_ENGINE.weakConsensusThreshold;

  if (disableUncertainty) {
    // 消融: 关闭所有 Neutral 检测 → 纯方向判定
    direction = consensus >= dirThreshold ? "UP"
      : consensus <= -dirThreshold ? "DOWN"
      : "NEUTRAL";
    confidence = Math.min(95, Math.round(Math.abs(consensus) * 0.5 + 30));
  } else if (neutralInputs) {
    // ── v9.3: 四规则 Neutral 检测 ──
    const result = evaluateNeutral(
      consensus,
      neutralInputs.neutralConsensus,
      neutralInputs.clusterConsensus,
      beliefStd,
      neutralInputs.kuramotoR,
      neutralInputs.uncertaintyFactor,
      neutralInputs.ablation,
      neutralInputs.vix  // 🆕 v9.5.1: 传入市场 VIX
    );
    trace = result.trace;

    if (result.isNeutral) {
      direction = "NEUTRAL";
      // 信心: Neutral 时降低, 由触发规则决定
      confidence = Math.max(10, 50 - (trace.rule1_fired ? 15 : 0) - (trace.rule4_fired ? 15 : 0) - ((trace.rule2_fired && trace.rule3_fired) ? 20 : 0));
    } else {
      // 方向判定: consensus >= threshold → UP, else → DOWN
      direction = consensus >= dirThreshold ? "UP" : "DOWN";
      const consensusStrength = Math.min(50, Math.abs(consensus) * 0.5);
      const agreementBonus = Math.max(0, 30 - beliefStd * 0.3);
      confidence = Math.min(95, Math.round(consensusStrength + agreementBonus));
    }
  } else {
    // 向后兼容: 无 neutralInputs 时用旧逻辑
    if (uncertainty.isUncertain) {
      direction = "NEUTRAL";
      confidence = Math.max(10, 60 - uncertainty.score);
    } else {
      direction = consensus > dirThreshold ? "UP" : consensus < -dirThreshold ? "DOWN" : "NEUTRAL";
      const consensusStrength = Math.min(50, Math.abs(consensus) * 0.5);
      const agreementBonus = Math.max(0, 30 - beliefStd * 0.3);
      confidence = Math.min(95, Math.round(consensusStrength + agreementBonus));
    }
  }

  // 计算 largestClusterRatio 用于决策记录
  const largestClusterRatio = computeLargestClusterRatio(agents);

  return {
    direction,
    confidence: Math.max(10, confidence),
    consensus,
    beliefStd,
    uncertainty,
    largestClusterRatio,
    neutralTrace: trace,
  };
}

// ==================== 聚类辅助 ====================

function computeLargestClusterRatio(agents: Record<string, V9AgentState>): number {
  const beliefs = Object.values(agents).map(a => a.belief);
  if (beliefs.length <= 1) return 1;

  const bullish = beliefs.filter(b => b > 20);
  const bearish = beliefs.filter(b => b < -20);
  const neutral = beliefs.filter(b => b >= -20 && b <= 20);

  const total = beliefs.length;
  const maxCluster = Math.max(bullish.length, bearish.length, neutral.length);
  return maxCluster / total;
}
