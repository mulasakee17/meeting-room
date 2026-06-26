/**
 * SwarmAlpha v9.5 — Agent 社交互动引擎
 *
 * 核心机制:
 *   每个 Agent 观察与自己有因子重叠的其他 Agent 的信念，
 *   然后根据自己的社交开放度 α 调整自己的信念。
 *
 * 核心公式:
 *   b_i^{(t+1)} = (1 - α_i) · b_i^{(t)} + α_i · b̄_visible_i^{(t)}
 *
 * 可见性约束 (关键创新):
 *   Agent 只能看到与它有因子重叠的其他 Agent
 *   → 天然产生信息茧房 — 异质性的第二层来源
 *
 * 收敛条件 (满足任一即停止):
 *   1. 所有 Agent 信念变化 < 2 → 已稳定
 *   2. 达到最大轮次 10 → 防止无限循环
 *   3. 连续 3 轮 belief_std 增长 → 发散 (分歧在加大)
 *
 * 纯数学，零 LLM 调用。
 */

import { V9AgentDefinition, V9AgentState, FactorCategory } from "../v9/types";
import { META_FACTORS } from "../v9/agentDefinitions";
import {
  SocialProfile,
  InteractionRound,
  InteractionResult,
  SOCIAL_ALPHAS,
} from "./types";

// ==================== 配置 ====================

const CONFIG = {
  /** 最大互动轮次 */
  maxRounds: 10,
  /** 收敛阈值: 所有 Agent 信念变化小于此值 → 收敛 */
  convergenceThreshold: 2,
  /** 发散检测: 连续 N 轮 std 增长 → 发散 */
  divergenceWindow: 3,
};

// ==================== 可见性矩阵构建 ====================

/**
 * 构建社交可见性矩阵
 *
 * 规则: Agent A 能看到 Agent B ⇔
 *   A 的方向因子权限 ∩ B 的方向因子权限 ≠ ∅
 *
 * 注意: 只看方向因子 (liquidity/policy/fundamental/narrative)
 *       uncertainty 是元因子, 不参与可见性判断
 */
export function buildSocialProfiles(
  agents: V9AgentDefinition[]
): SocialProfile[] {
  const profiles: SocialProfile[] = [];

  for (const agent of agents) {
    // 该 Agent 的方向因子
    const myDirFactors = agent.permissions.visibleFactors.filter(
      (f) => !META_FACTORS.includes(f)
    );

    const visibleAgentIds: string[] = [];
    const visibilityReasons: string[] = [];

    for (const other of agents) {
      if (other.id === agent.id) continue;

      const otherDirFactors = other.permissions.visibleFactors.filter(
        (f) => !META_FACTORS.includes(f)
      );

      // 找交集
      const shared = myDirFactors.filter((f) => otherDirFactors.includes(f));

      if (shared.length > 0) {
        visibleAgentIds.push(other.id);
        visibilityReasons.push(`${other.name}(${shared.join(",")})`);
      }
    }

    const alpha = SOCIAL_ALPHAS[agent.id] ?? 0.3;

    profiles.push({
      agentId: agent.id,
      alpha,
      visibleAgentIds,
      visibilityReason:
        visibleAgentIds.length > 0
          ? `可见: ${visibilityReasons.join(" | ")}`
          : "无可见Agent — 完全独立",
    });
  }

  return profiles;
}

// ==================== 计算可见 Agent 的加权平均信念 ====================

/**
 * 计算 Agent i 能看到的其他 Agent 的加权平均信念
 *
 * b̄_visible_i = Σ_{j ∈ visible_i} (b_j × w_j × conf_j) / Σ_{j ∈ visible_i} (w_j × conf_j)
 *
 * @param dynamicWeights — 🆕 v9.5.2: 可选的动态权重覆盖。如果提供, 用 dynamicWeights[peerId]
 *                         替代 peerAgent.influenceWeight, 实现场景自适应的社交影响力。
 */
function computePeerAverage(
  agentId: string,
  beliefs: Record<string, number>,
  profile: SocialProfile,
  agents: V9AgentDefinition[],
  states: Record<string, V9AgentState>,
  dynamicWeights?: Record<string, number>
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const peerId of profile.visibleAgentIds) {
    const peerAgent = agents.find((a) => a.id === peerId);
    if (!peerAgent) continue;

    const peerBelief = beliefs[peerId] ?? 0;
    const peerState = states[peerId];
    const peerConf = peerState?.confidence ?? 50;

    // 🆕 v9.5.2: 优先使用动态权重 (场景自适应), fallback 到静态基础权重
    const influenceWeight = dynamicWeights?.[peerId] ?? peerAgent.influenceWeight;
    const weight = influenceWeight * (peerConf / 100);

    weightedSum += peerBelief * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return beliefs[agentId] ?? 0; // 无可见Agent, 保持原信念
  return weightedSum / totalWeight;
}

// ==================== 社交信念更新 ====================

/**
 * 单步更新: 计算所有 Agent 的新信念
 */
function updateBeliefs(
  currentBeliefs: Record<string, number>,
  profiles: SocialProfile[],
  agents: V9AgentDefinition[],
  states: Record<string, V9AgentState>,
  dynamicWeights?: Record<string, number>
): { newBeliefs: Record<string, number>; changes: Record<string, number> } {
  const newBeliefs: Record<string, number> = {};
  const changes: Record<string, number> = {};

  for (const profile of profiles) {
    const oldBelief = currentBeliefs[profile.agentId] ?? 0;
    const peerAvg = computePeerAverage(
      profile.agentId,
      currentBeliefs,
      profile,
      agents,
      states,
      dynamicWeights
    );

    // 边界软化: |belief| > 80 时有效 α 衰减 50%
    // 防止因 clamp(-100, +100) 硬截断导致的极限环振荡
    let effectiveAlpha = profile.alpha;
    if (Math.abs(oldBelief) > 80) {
      effectiveAlpha = effectiveAlpha * 0.5;
    }

    // 核心公式: b_new = (1-α_eff) × b_old + α_eff × peer_avg
    const newBelief = (1 - effectiveAlpha) * oldBelief + effectiveAlpha * peerAvg;

    // 钳制到 [-100, 100]
    const clamped = Math.max(-100, Math.min(100, newBelief));

    newBeliefs[profile.agentId] = Math.round(clamped * 100) / 100;
    changes[profile.agentId] =
      Math.round((clamped - oldBelief) * 100) / 100;
  }

  return { newBeliefs, changes };
}

// ==================== 收敛检测 ====================

function checkConvergence(
  changes: Record<string, number>,
  beliefStdHistory: number[],
  currentBeliefStd: number
): { converged: boolean; reason: string } {
  // 条件 1: 所有 Agent 变化 < 收敛阈值
  const maxChange = Math.max(...Object.values(changes).map(Math.abs));
  if (maxChange < CONFIG.convergenceThreshold) {
    return { converged: true, reason: `信念变化 < ${CONFIG.convergenceThreshold} (maxΔ=${maxChange.toFixed(1)})` };
  }

  // 条件 2: 发散检测 — 连续 N 轮 std 增长
  if (beliefStdHistory.length >= CONFIG.divergenceWindow) {
    const recent = beliefStdHistory.slice(-CONFIG.divergenceWindow);
    // 检查是否连续增长
    let increasing = true;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] <= recent[i - 1]) {
        increasing = false;
        break;
      }
    }
    if (increasing && currentBeliefStd > recent[0]) {
      return {
        converged: true,
        reason: `连续${CONFIG.divergenceWindow}轮分歧加大 — 极化而非收敛`,
      };
    }
  }

  return { converged: false, reason: "继续互动" };
}

// ==================== 统计工具 ====================

function computeStd(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

function computeMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// ==================== 主入口 ====================

/**
 * 运行 Agent 社交互动模拟
 *
 * @param agents — v9 Agent 定义
 * @param states — v9 计算的初始 Agent 状态 (互动前)
 * @param options — 可选配置
 * @param options.maxRounds — 最大互动轮次
 * @param options.disabled — 禁用互动 → 直接返回初始状态
 * @param options.dynamicWeights — 🆕 v9.5.2: 动态权重覆盖, 用于场景自适应的社交影响力
 * @returns 完整的互动结果
 */
export function runInteraction(
  agents: V9AgentDefinition[],
  states: Record<string, V9AgentState>,
  options?: {
    maxRounds?: number;
    /** 禁用互动 → 直接返回初始状态 */
    disabled?: boolean;
    /** 🆕 v9.5.2: 动态权重覆盖 (agentId → adjustedWeight) */
    dynamicWeights?: Record<string, number>;
  }
): InteractionResult {
  // ── 构建社交可见性矩阵 ──
  const profiles = buildSocialProfiles(agents);

  // ── 初始信念 ──
  const initialBeliefs: Record<string, number> = {};
  for (const agent of agents) {
    initialBeliefs[agent.id] = states[agent.id]?.belief ?? 0;
  }

  // 初始统计
  const initialValues = Object.values(initialBeliefs);
  const initialStd = computeStd(initialValues);
  const initialMean = computeMean(initialValues);

  const rounds: InteractionRound[] = [];

  // 第 0 轮 (初始状态)
  rounds.push({
    round: 0,
    beliefs: { ...initialBeliefs },
    beliefChanges: Object.fromEntries(agents.map((a) => [a.id, 0])),
    meanBelief: Math.round(initialMean * 100) / 100,
    beliefStd: Math.round(initialStd * 100) / 100,
    converged: false,
  });

  // ── 如果禁用互动，直接返回 ──
  if (options?.disabled) {
    return {
      rounds,
      finalBeliefs: { ...initialBeliefs },
      totalRounds: 0,
      convergenceType: "converged",
      beliefShift: Object.fromEntries(agents.map((a) => [a.id, 0])),
      consensusFormed: initialStd < 30,
      polarizationIncreased: false,
      socialProfiles: profiles,
    };
  }

  // ── 主循环 ──
  const maxRounds = options?.maxRounds ?? CONFIG.maxRounds;
  const stdHistory: number[] = [initialStd];
  let currentBeliefs = { ...initialBeliefs };
  let convergenceType: InteractionResult["convergenceType"] = "max_rounds";

  for (let r = 1; r <= maxRounds; r++) {
    const { newBeliefs, changes } = updateBeliefs(
      currentBeliefs,
      profiles,
      agents,
      states,
      options?.dynamicWeights
    );

    const values = Object.values(newBeliefs);
    const std = computeStd(values);
    const mean = computeMean(values);

    stdHistory.push(std);

    // 收敛检测
    const { converged, reason } = checkConvergence(changes, stdHistory, std);

    rounds.push({
      round: r,
      beliefs: { ...newBeliefs },
      beliefChanges: { ...changes },
      meanBelief: Math.round(mean * 100) / 100,
      beliefStd: Math.round(std * 100) / 100,
      converged,
    });

    currentBeliefs = newBeliefs;

    if (converged) {
      // 判断收敛类型
      if (reason.includes("变化")) {
        convergenceType = "converged";
      } else {
        convergenceType = "diverged";
      }
      break;
    }
  }

  if (rounds.length >= maxRounds + 1 && convergenceType === "max_rounds") {
    // 已达最大轮次，检查是否接近收敛
    const lastRound = rounds[rounds.length - 1];
    convergenceType = "max_rounds";
  }

  // ── 计算偏移 ──
  const finalBeliefs = rounds[rounds.length - 1].beliefs;
  const beliefShift: Record<string, number> = {};
  for (const agentId of Object.keys(initialBeliefs)) {
    beliefShift[agentId] =
      Math.round(
        ((finalBeliefs[agentId] ?? 0) - (initialBeliefs[agentId] ?? 0)) * 100
      ) / 100;
  }

  // ── 判定 ──
  const finalStd = rounds[rounds.length - 1].beliefStd;
  const finalMean = rounds[rounds.length - 1].meanBelief;

  // 是否形成共识: std < 30 且 均值偏离中性 (>15)
  const consensusFormed = finalStd < 30 && Math.abs(finalMean) > 15;

  // 分歧是否加大
  const polarizationIncreased = finalStd > initialStd + 5;

  return {
    rounds,
    finalBeliefs,
    totalRounds: rounds.length - 1, // 不含第0轮
    convergenceType,
    beliefShift,
    consensusFormed,
    polarizationIncreased,
    socialProfiles: profiles,
  };
}

// ==================== 日志输出 (调试) ====================

/**
 * 生成互动过程的人类可读摘要
 */
export function formatInteractionSummary(result: InteractionResult): string {
  const lines: string[] = [];
  lines.push("━━━━ Agent 社交互动过程 ━━━━");
  lines.push("");

  // 社交可见性
  lines.push("📡 社交可见性矩阵:");
  for (const p of result.socialProfiles) {
    const alphaLabel =
      p.alpha > 0
        ? `从众 α=${p.alpha}`
        : p.alpha < 0
        ? `逆向 α=${p.alpha}`
        : "独立 α=0";
    const count = p.visibleAgentIds.length;
    lines.push(`  ${p.agentId} [${alphaLabel}] → 可见 ${count} 个Agent`);
  }

  lines.push("");

  // 互动轮次
  const initial = result.rounds[0];
  const final = result.rounds[result.rounds.length - 1];

  lines.push(
    `初始: mean=${initial.meanBelief.toFixed(1)} std=${initial.beliefStd.toFixed(1)}`
  );

  for (let i = 1; i < result.rounds.length; i++) {
    const r = result.rounds[i];
    const trend =
      r.beliefStd > result.rounds[i - 1].beliefStd
        ? "↑"
        : r.beliefStd < result.rounds[i - 1].beliefStd
        ? "↓"
        : "→";
    lines.push(
      `  R${r.round}: mean=${r.meanBelief.toFixed(1)} std=${r.beliefStd.toFixed(1)} ${trend} ${r.converged ? "✓ 收敛" : ""}`
    );
  }

  lines.push("");
  lines.push(
    `结果: ${result.convergenceType === "converged" ? "✅ 收敛" : result.convergenceType === "diverged" ? "⚠️ 发散(极化)" : "⏱️ 达最大轮次"}`
  );
  lines.push(
    `共识形成: ${result.consensusFormed ? "✅ 是" : "❌ 否"} | 分歧加大: ${result.polarizationIncreased ? "⚠️ 是" : "✅ 否"}`
  );

  // 信念变化最大的 Agent
  const maxShift = Object.entries(result.beliefShift).sort(
    (a, b) => Math.abs(b[1]) - Math.abs(a[1])
  );
  if (maxShift.length > 0) {
    lines.push("");
    lines.push("最大信念变化:");
    for (const [id, shift] of maxShift.slice(0, 3)) {
      if (Math.abs(shift) > 1) {
        lines.push(`  ${id}: ${shift > 0 ? "+" : ""}${shift.toFixed(1)}`);
      }
    }
  }

  return lines.join("\n");
}
