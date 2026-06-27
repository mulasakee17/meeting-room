/**
 * V9 Agent 定义 — 强制信息盲区 (五因子正交体系)
 *
 * 因子盲区设计原则:
 *   - 每个 Agent 只能看到 1-3 个方向因子 (liquidity/policy/fundamental/narrative)
 *   - uncertainty 因子始终对所有 Agent 可见 (元因子, 调节置信度)
 *   - 盲区越极端 → 信念差异越大 → 异质性越真实
 *
 * 旧体系问题: 6因子中 3-4 个高度重叠 → 盲区形同虚设
 * 新体系解决: 5因子严格正交 → 盲区产生真正视角差异
 */

import { V9AgentDefinition, FactorCategory } from "./types";
import { AGENT_PARAMS } from "./config";

/** 始终对所有 Agent 可见的元因子 */
export const META_FACTORS: FactorCategory[] = ["uncertainty"];

function buildAgent(id: string, name: string, emoji: string, role: string, visibleFactors: FactorCategory[]): V9AgentDefinition {
  const p = AGENT_PARAMS[id];
  return {
    id, name, emoji, role,
    permissions: {
      visibleFactors,
      factorWeights: p.factorWeights,
      uncertaintySensitivity: p.uncertaintySensitivity,
      interpretationStyle: p.interpretationStyle,
    },
    initialBias: p.initialBias,
    influenceWeight: p.influenceWeight,
    capitalWeight: p.capitalWeight,
  };
}

export const V9_AGENTS: V9AgentDefinition[] = [
  // 🏦 Institution: 看 liquidity + policy + fundamental, 盲 narrative
  buildAgent("institution", "Institution", "🏦", "机构投资者", ["liquidity", "policy", "fundamental"]),
  // 💎 Value: 只看 fundamental, 盲其他
  buildAgent("value", "Value", "💎", "价值投资者", ["fundamental"]),
  // 🏄 Trend: 只看 narrative
  buildAgent("trend", "Trend", "🏄", "趋势交易者", ["narrative"]),
  // 😱 Panic: 只看 liquidity
  buildAgent("panic", "Panic", "😱", "恐慌投资者", ["liquidity"]),
  // 🤖 Quant: 看 liquidity + fundamental
  buildAgent("quant", "Quant", "🤖", "量化基金", ["liquidity", "fundamental"]),
  // 📡 Media: 看 narrative + policy
  buildAgent("media", "Media", "📡", "媒体传播者", ["narrative", "policy"]),
  // 🦉 Contrarian: 看 narrative (负权重在 config 里)
  buildAgent("contrarian", "Contrarian", "🦉", "逆向投资者", ["narrative"]),
  // 🐜 Retail: 只看 narrative
  buildAgent("retail", "Retail", "🐜", "散户投资者", ["narrative"]),
];

/** 政策响应 Agent — 独立监控 policy + liquidity */
export const POLICY_AGENT: V9AgentDefinition = buildAgent(
  "policy", "PolicyAgent", "🏛️", "政策响应分析师", ["policy", "liquidity"]
);

export function getAllAgents(includePolicy: boolean): V9AgentDefinition[] {
  return includePolicy ? [...V9_AGENTS, POLICY_AGENT] : V9_AGENTS;
}

/** 计算可见因子分布 — 用于验证异质性
 *
 *  盲区度量分两层:
 *    - 方向因子盲区: Agent 对在方向因子 (liquidity/policy/fundamental/narrative) 上
 *      有多少比例完全没有重叠? 这产生真实的视角差异。
 *    - 元因子 (uncertainty): 始终对所有 Agent 可见, 不产生视角差异。
 */
export function computeBlindnessStats(agents: V9AgentDefinition[]): {
  totalFactors: FactorCategory[];
  directionalFactors: FactorCategory[];
  agentCoverage: Record<string, FactorCategory[]>;       // 含元因子
  agentDirectionalCoverage: Record<string, FactorCategory[]>; // 仅方向因子
  overlapMatrix: Record<string, string[]>;                // 含元因子
  directionalOverlapMatrix: Record<string, string[]>;     // 仅方向因子
} {
  const totalFactors: FactorCategory[] = ["liquidity", "policy", "fundamental", "narrative", "uncertainty"];
  const directionalFactors: FactorCategory[] = ["liquidity", "policy", "fundamental", "narrative"];

  const agentCoverage: Record<string, FactorCategory[]> = {};
  const agentDirectionalCoverage: Record<string, FactorCategory[]> = {};
  for (const a of agents) {
    agentCoverage[a.id] = [...a.permissions.visibleFactors, ...META_FACTORS];
    agentDirectionalCoverage[a.id] = a.permissions.visibleFactors.filter(f => !META_FACTORS.includes(f));
  }

  const overlapMatrix: Record<string, string[]> = {};
  const directionalOverlapMatrix: Record<string, string[]> = {};
  for (const a1 of agents) {
    overlapMatrix[a1.id] = [];
    directionalOverlapMatrix[a1.id] = [];
    for (const a2 of agents) {
      if (a1.id === a2.id) continue;
      const v1 = agentCoverage[a1.id];
      const v2 = agentCoverage[a2.id];
      const overlap = v1.filter(f => v2.includes(f));
      if (overlap.length > 0) overlapMatrix[a1.id].push(a2.id);

      // 方向因子盲区: 只看方向因子
      const d1 = agentDirectionalCoverage[a1.id];
      const d2 = agentDirectionalCoverage[a2.id];
      const dirOverlap = d1.filter(f => d2.includes(f));
      if (dirOverlap.length > 0) directionalOverlapMatrix[a1.id].push(a2.id);
    }
  }
  return { totalFactors, directionalFactors, agentCoverage, agentDirectionalCoverage, overlapMatrix, directionalOverlapMatrix };
}
