/**
 * 群体行为诊断引擎 — v9.3
 *
 * 在已有模拟数据之上，提供三层分析:
 *   1. 归因分解 — 每个 Agent 对最终共识的边际贡献
 *   2. 联盟检测 — 多头/空头/中立阵营的力量对比
 *   3. 反事实分析 — "如果移除 X/关闭盲区，共识会怎样变化"
 *
 * 全部纯数学，零 LLM 调用，毫秒级。
 */

import {
  V9AgentDefinition,
  V9AgentState,
  AgentAttribution,
  CoalitionAnalysis,
  CounterfactualReport,
  CounterfactualVariant,
  DiagnosticReport,
  V9Direction,
  FactorCategory,
  ExtractedFactor,
  MethodValidationResult,
  CrossValidationReport,
} from "./types";
import { computeAllAgentStates } from "./agentInterpretation";
import { META_FACTORS } from "./agentDefinitions";
import {
  computeLinearBaselineConsensus,
  computePowerLawConsensus,
  computeEntropyWeightedConsensus,
  computeTrimmedMeanConsensus,
  computeMedianConsensus,
  computeWinsorizedConsensus,
  computeGeometricMeanConsensus,
  NonlinearConsensusInput,
} from "./nonlinearConsensus";

// ==================== 归因分解 ====================

/**
 * 计算每个 Agent 对共识的边际贡献
 *
 * 共识公式: consensus = Σ(belief × influenceWeight × confidence/100) / Σ(influenceWeight × confidence/100)
 * Agent_i 的贡献 = belief_i × influenceWeight_i × (confidence_i / 100)
 */
export function computeAttribution(
  agents: V9AgentDefinition[],
  states: Record<string, V9AgentState>
): AgentAttribution[] {
  const attributions: AgentAttribution[] = [];
  let totalAbsContribution = 0;

  for (const agent of agents) {
    const state = states[agent.id];
    if (!state) continue;

    const effectiveWeight = agent.influenceWeight * (state.confidence / 100);
    const contribution = state.belief * effectiveWeight;

    let direction: AgentAttribution["direction"];
    if (state.belief > 15) direction = "BULLISH";
    else if (state.belief < -15) direction = "BEARISH";
    else direction = "NEUTRAL";

    attributions.push({
      agentId: agent.id,
      agentName: agent.name,
      emoji: agent.emoji,
      belief: state.belief,
      confidence: state.confidence,
      influenceWeight: agent.influenceWeight,
      contribution: Math.round(contribution * 100) / 100,
      contributionPct: 0, // 稍后计算
      direction,
      visibleFactors: state.visibleFactors?.map(f => f.category) ?? [],
    });

    totalAbsContribution += Math.abs(contribution);
  }

  // 计算百分比贡献
  if (totalAbsContribution > 0) {
    for (const attr of attributions) {
      attr.contributionPct = Math.round((Math.abs(attr.contribution) / totalAbsContribution) * 100);
    }
  }

  // 按贡献绝对值降序
  attributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return attributions;
}

// ==================== 联盟检测 ====================

/**
 * 检测多头/空头联盟及其力量对比
 */
export function detectCoalitions(
  agents: V9AgentDefinition[],
  states: Record<string, V9AgentState>,
  attribution: AgentAttribution[]
): CoalitionAnalysis {
  const bullishIds: string[] = [];
  const bearishIds: string[] = [];
  const neutralIds: string[] = [];

  let bullishInfluence = 0, bullishCapital = 0, bullishWeightedSum = 0, bullishTotalW = 0;
  let bearishInfluence = 0, bearishCapital = 0, bearishWeightedSum = 0, bearishTotalW = 0;

  for (const attr of attribution) {
    const agent = agents.find(a => a.id === attr.agentId);
    if (!agent) continue;

    const effWeight = agent.influenceWeight * (attr.confidence / 100);

    if (attr.direction === "BULLISH") {
      bullishIds.push(attr.agentId);
      bullishInfluence += agent.influenceWeight;
      bullishCapital += agent.capitalWeight;
      bullishWeightedSum += attr.belief * effWeight;
      bullishTotalW += effWeight;
    } else if (attr.direction === "BEARISH") {
      bearishIds.push(attr.agentId);
      bearishInfluence += agent.influenceWeight;
      bearishCapital += agent.capitalWeight;
      bearishWeightedSum += attr.belief * effWeight;
      bearishTotalW += effWeight;
    } else {
      neutralIds.push(attr.agentId);
    }
  }

  const bullishWeightedBelief = bullishTotalW > 0
    ? Math.round(bullishWeightedSum / bullishTotalW * 100) / 100
    : 0;
  const bearishWeightedBelief = bearishTotalW > 0
    ? Math.round(bearishWeightedSum / bearishTotalW * 100) / 100
    : 0;

  const powerRatio = bearishInfluence > 0
    ? Math.round(bullishInfluence / bearishInfluence * 100) / 100
    : bullishInfluence > 0 ? 999 : 1;

  let dominantCoalition: CoalitionAnalysis["dominantCoalition"];
  if (powerRatio > 1.5) dominantCoalition = "BULLISH";
  else if (powerRatio < 0.67) dominantCoalition = "BEARISH";
  else dominantCoalition = "BALANCED";

  // 联盟对抗强度: 两头信念差的绝对值
  const tension = Math.min(100, Math.abs(bullishWeightedBelief - bearishWeightedBelief));

  // 摇摆 Agent: 信念在 -20~+20 之间，且影响力 > 30
  const swingAgents = attribution
    .filter(a => Math.abs(a.belief) <= 20 && a.influenceWeight >= 30)
    .map(a => a.agentId);

  return {
    bullishCoalition: {
      agentIds: bullishIds,
      totalInfluence: bullishInfluence,
      totalCapital: bullishCapital,
      weightedBelief: bullishWeightedBelief,
    },
    bearishCoalition: {
      agentIds: bearishIds,
      totalInfluence: bearishInfluence,
      totalCapital: bearishCapital,
      weightedBelief: bearishWeightedBelief,
    },
    neutralAgents: neutralIds,
    powerRatio,
    dominantCoalition,
    tension,
    swingAgents,
  };
}

// ==================== 反事实引擎 ====================

/**
 * 重新计算共识 (无副作用, 纯数学)
 */
function recalcConsensus(
  agents: V9AgentDefinition[],
  states: Record<string, V9AgentState>,
  excludeAgentId?: string
): number {
  let weightedSum = 0, totalWeight = 0;
  for (const agent of agents) {
    if (excludeAgentId && agent.id === excludeAgentId) continue;
    const state = states[agent.id];
    if (!state) continue;
    const weight = agent.influenceWeight * (state.confidence / 100);
    weightedSum += state.belief * weight;
    totalWeight += weight;
  }
  return totalWeight > 0
    ? Math.round((weightedSum / totalWeight) * 100) / 100
    : 0;
}

function determineDirection(consensus: number): V9Direction {
  if (consensus >= 15) return "UP";
  if (consensus <= -15) return "DOWN";
  return "NEUTRAL";
}

function assessImpact(deltaConsensus: number, directionFlipped: boolean): CounterfactualVariant["impact"] {
  const absDelta = Math.abs(deltaConsensus);
  if (directionFlipped || absDelta > 20) return "CRITICAL";
  if (absDelta > 10) return "SIGNIFICANT";
  if (absDelta > 3) return "MODERATE";
  return "MINIMAL";
}

/**
 * 运行反事实分析
 *
 * 测试场景:
 *   1. 逐个移除每个 Agent (看谁的边际影响最大)
 *   2. 关闭信息盲区 (所有 Agent 看到全部因子)
 *   3. [可选] 移除空头/多头联盟
 */
export function runCounterfactuals(
  agents: V9AgentDefinition[],
  states: Record<string, V9AgentState>,
  baselineConsensus: number,
  baselineDirection: V9Direction,
  factorVector: { factors: ExtractedFactor[] }
): CounterfactualReport {
  const variants: CounterfactualVariant[] = [];

  // ── 场景 1: 逐个移除 Agent ──
  for (const agent of agents) {
    // 跳过零影响 Agent
    if (agent.influenceWeight === 0 && agent.capitalWeight === 0) continue;

    const cfConsensus = recalcConsensus(agents, states, agent.id);
    const cfDirection = determineDirection(cfConsensus);
    const deltaConsensus = cfConsensus - baselineConsensus;
    const directionFlipped = cfDirection !== baselineDirection;

    variants.push({
      label: `移除${agent.name}`,
      description: `移除 ${agent.emoji} ${agent.name}(${agent.role}) 后重新计算共识`,
      modifiedAgentId: agent.id,
      consensus: cfConsensus,
      direction: cfDirection,
      deltaConsensus: Math.round(deltaConsensus * 100) / 100,
      directionFlipped,
      impact: assessImpact(deltaConsensus, directionFlipped),
    });
  }

  // ── 场景 2: 关闭信息盲区 ──
  try {
    const allSeeing = computeAllAgentStates(factorVector, agents, { disableBlindness: true });
    const cfConsensus = recalcConsensus(agents, allSeeing.states);
    const cfDirection = determineDirection(cfConsensus);
    const deltaConsensus = cfConsensus - baselineConsensus;
    const directionFlipped = cfDirection !== baselineDirection;

    variants.push({
      label: "关闭信息盲区",
      description: "所有 Agent 看到全部 5 个因子 (消除视角差异)",
      disableBlindness: true,
      consensus: cfConsensus,
      direction: cfDirection,
      deltaConsensus: Math.round(deltaConsensus * 100) / 100,
      directionFlipped,
      impact: assessImpact(deltaConsensus, directionFlipped),
    });
  } catch {
    // 计算失败时跳过
  }

  // ── 分析 ──
  // 按影响排序
  variants.sort((a, b) => Math.abs(b.deltaConsensus) - Math.abs(a.deltaConsensus));

  const mostInfluential = variants.find(v => v.modifiedAgentId);
  const mostInfluentialAgent = mostInfluential?.modifiedAgentId ?? "unknown";

  // 计算需要移除多少 Agent 才能翻转方向
  let agentsToFlip = agents.length + 1; // 默认: 无法翻转
  // 按绝对贡献降序尝试逐个移除
  const sortedByAbsContribution = [...agents]
    .filter(a => a.influenceWeight > 0)
    .map(a => {
      const state = states[a.id];
      const contrib = state ? Math.abs(state.belief * a.influenceWeight * (state.confidence / 100)) : 0;
      return { id: a.id, contrib };
    })
    .sort((a, b) => b.contrib - a.contrib);

  for (let i = 1; i <= sortedByAbsContribution.length; i++) {
    const excludeSet = new Set(sortedByAbsContribution.slice(0, i).map(a => a.id));
    const cfConsensus = recalcConsensus(
      agents.filter(a => !excludeSet.has(a.id)),
      states
    );
    if (determineDirection(cfConsensus) !== baselineDirection) {
      agentsToFlip = i;
      break;
    }
  }

  return { baselineConsensus, variants, mostInfluentialAgent, agentsToFlip };
}

// ==================== 多方法交叉验证 ====================

/**
 * 运行所有8种共识方法，计算方法间一致性
 *
 * 验证标准:
 *   - 方向一致性 > 70% → HIGH
 *   - 方向一致性 50-70% → MEDIUM
 *   - 方向一致性 30-50% → LOW
 *   - 方向一致性 < 30% → CRITICAL
 *
 * 全部纯数学，零 LLM 调用，毫秒级完成。
 */
export function runCrossValidation(
  agents: V9AgentDefinition[],
  states: Record<string, V9AgentState>,
  kuramotoR?: number
): CrossValidationReport {
  const input: NonlinearConsensusInput = { agents, states, kuramotoR };

  // 运行所有8种方法
  const methodResults: MethodValidationResult[] = [
    runMethod(input, "linear_baseline", computeLinearBaselineConsensus),
    runMethod(input, "power_law", (i) => computePowerLawConsensus(i, 1.5)),
    runMethod(input, "entropy_weighted", computeEntropyWeightedConsensus),
    runMethod(input, "trimmed_mean", (i) => computeTrimmedMeanConsensus(i, 1)),
    runMethod(input, "median", computeMedianConsensus),
    runMethod(input, "winsorized", (i) => computeWinsorizedConsensus(i, 20, 80)),
    runMethod(input, "geometric_mean", computeGeometricMeanConsensus),
  ];

  // 计算方向一致性
  const directions = methodResults.map(r => r.direction);
  const upCount = directions.filter(d => d === "UP").length;
  const downCount = directions.filter(d => d === "DOWN").length;
  const neutralCount = directions.filter(d => d === "NEUTRAL").length;

  const maxDirectionCount = Math.max(upCount, downCount);
  const directionConsistency = maxDirectionCount / methodResults.length;

  // 计算方法间共识标准差
  const consensusValues = methodResults.map(r => r.consensus);
  const meanConsensus = consensusValues.reduce((a, b) => a + b, 0) / consensusValues.length;
  const variance = consensusValues.reduce((sum, val) => sum + Math.pow(val - meanConsensus, 2), 0) / consensusValues.length;
  const consensusStd = Math.sqrt(variance);

  // 确定置信度等级
  let confidenceLevel: CrossValidationReport["confidenceLevel"];
  let overallScore: number;

  if (directionConsistency >= 0.7 && consensusStd < 10) {
    confidenceLevel = "HIGH";
    overallScore = 80 + Math.round((1 - consensusStd / 10) * 20);
  } else if (directionConsistency >= 0.5 && consensusStd < 20) {
    confidenceLevel = "MEDIUM";
    overallScore = 50 + Math.round(directionConsistency * 30) - Math.round(consensusStd / 2);
  } else if (directionConsistency >= 0.3) {
    confidenceLevel = "LOW";
    overallScore = 20 + Math.round(directionConsistency * 40) - Math.round(consensusStd / 2);
  } else {
    confidenceLevel = "CRITICAL";
    overallScore = Math.round(directionConsistency * 30);
  }

  // 钳制分数
  overallScore = Math.max(0, Math.min(100, overallScore));

  return {
    methodResults,
    consensusStd: Math.round(consensusStd * 100) / 100,
    directionConsistency: Math.round(directionConsistency * 100) / 100,
    confidenceLevel,
    overallScore: Math.round(overallScore),
  };
}

/** 运行单个方法并格式化结果 */
function runMethod(
  input: NonlinearConsensusInput,
  name: string,
  fn: (input: NonlinearConsensusInput) => { consensus: number; confidence: number }
): MethodValidationResult {
  try {
    const result = fn(input);
    const direction = determineDirection(result.consensus);
    return {
      method: name,
      consensus: result.consensus,
      confidence: result.confidence,
      direction,
    };
  } catch {
    return {
      method: name,
      consensus: 0,
      confidence: 0,
      direction: "NEUTRAL",
    };
  }
}

// ==================== 诊断摘要 ====================

function buildSummary(
  attribution: AgentAttribution[],
  coalition: CoalitionAnalysis,
  counterfactuals: CounterfactualReport,
  crossValidation: CrossValidationReport,
  baselineConsensus: number,
  baselineDirection: V9Direction,
  beliefStd: number,
  blindnessActive: boolean
): DiagnosticReport["summary"] {
  // ── 核心发现 ──
  const top3 = attribution.slice(0, 3);
  const topDriver = top3[0];
  const dirLabel = baselineDirection === "UP" ? "看多" : baselineDirection === "DOWN" ? "看空" : "中立";

  let coreFinding: string;
  if (baselineDirection === "NEUTRAL") {
    coreFinding = `共识${baselineConsensus.toFixed(1)}，方向模糊。`;
    if (beliefStd > 40) coreFinding += ` Agent信念高度分散(std=${beliefStd.toFixed(1)})，市场处于不确定状态。`;
    else coreFinding += ` Agent分歧适中(std=${beliefStd.toFixed(1)})，但无方向性共识。`;
  } else {
    coreFinding = `${topDriver.emoji} ${topDriver.agentName} 是${dirLabel}共识的最大驱动力 (贡献 ${topDriver.contributionPct}%)，信念=${topDriver.belief.toFixed(0)}。`;
    if (coalition.dominantCoalition === "BULLISH" && baselineDirection === "UP") {
      coreFinding += ` 多头联盟以 ${coalition.powerRatio}:1 的影响力优势主导。`;
    } else if (coalition.dominantCoalition === "BEARISH" && baselineDirection === "DOWN") {
      coreFinding += ` 空头联盟以 ${(1 / coalition.powerRatio).toFixed(1)}:1 的影响力优势主导。`;
    } else if (coalition.dominantCoalition === "BALANCED") {
      coreFinding += ` 多空力量接近均衡 (比值=${coalition.powerRatio})。`;
    } else {
      coreFinding += ` 尽管${coalition.dominantCoalition}联盟影响力更大，但共识方向相反——少数派信念更强。`;
    }
  }

  // ── 共识形成机制 ──
  let consensusMechanism: string;
  if (coalition.dominantCoalition === "BULLISH" && baselineDirection === "UP") {
    consensusMechanism = `多头共识: ${coalition.bullishCoalition.agentIds.length}个Agent形成看多联盟 (影响力${coalition.bullishCoalition.totalInfluence}, 资本${coalition.bullishCoalition.totalCapital})，加权信念${coalition.bullishCoalition.weightedBelief.toFixed(0)}。${coalition.bearishCoalition.agentIds.length}个空头Agent (影响力${coalition.bearishCoalition.totalInfluence})被制衡。`;
  } else if (coalition.dominantCoalition === "BEARISH" && baselineDirection === "DOWN") {
    consensusMechanism = `空头共识: ${coalition.bearishCoalition.agentIds.length}个Agent形成看空联盟 (影响力${coalition.bearishCoalition.totalInfluence}, 资本${coalition.bearishCoalition.totalCapital})，加权信念${coalition.bearishCoalition.weightedBelief.toFixed(0)}。${coalition.bullishCoalition.agentIds.length}个多头Agent (影响力${coalition.bullishCoalition.totalInfluence})无法有效对抗。`;
  } else if (beliefStd > 40) {
    consensusMechanism = `分歧僵局: Agent信念标准差=${beliefStd.toFixed(1)}，多空双方各执一词。${coalition.swingAgents.length > 0 ? `摇摆Agent (${coalition.swingAgents.join(", ")}) 可能决定最终方向。` : ""}`;
  } else {
    consensusMechanism = `弱共识: 多空力量接近，无主导联盟。共识对初始条件高度敏感。`;
  }

  // ── 风险因素 ──
  const riskFactors: string[] = [];

  // 联盟对抗强度
  if (coalition.tension > 60) {
    riskFactors.push(`⚠️ 多空对抗激烈 (强度=${coalition.tension})——共识可能在压力下快速瓦解`);
  }

  // 系统韧性
  if (counterfactuals.agentsToFlip <= 2) {
    riskFactors.push(`🔴 系统韧性低: 仅需移除 ${counterfactuals.agentsToFlip} 个Agent即可翻转共识方向`);
  } else if (counterfactuals.agentsToFlip <= 3) {
    riskFactors.push(`🟡 系统韧性中等: 需移除 ${counterfactuals.agentsToFlip} 个Agent才能翻转方向`);
  } else {
    riskFactors.push(`🟢 系统韧性高: 需移除 ${counterfactuals.agentsToFlip} 个Agent才能翻转方向`);
  }

  // 关键 Agent 风险
  const criticalVariant = counterfactuals.variants.find(v => v.impact === "CRITICAL");
  if (criticalVariant) {
    riskFactors.push(`🔴 关键依赖: "${criticalVariant.label}" 会${criticalVariant.directionFlipped ? "翻转" : "显著改变"}共识方向 (Δ=${criticalVariant.deltaConsensus.toFixed(1)})`);
  }

  // 盲区效应
  const blindnessVariant = counterfactuals.variants.find(v => v.disableBlindness);
  let blindnessEffect: string;
  if (blindnessVariant) {
    const absDelta = Math.abs(blindnessVariant.deltaConsensus);
    if (blindnessVariant.directionFlipped) {
      blindnessEffect = `🔴 信息盲区是关键: 关闭盲区后共识方向从${baselineDirection}翻转为${blindnessVariant.direction} (Δ=${blindnessVariant.deltaConsensus.toFixed(1)})。盲区正在产生真实而脆弱的视角分化。`;
    } else if (absDelta > 10) {
      blindnessEffect = `🟡 信息盲区有显著效应: 关闭盲区后共识偏移 ${blindnessVariant.deltaConsensus.toFixed(1)} (方向不变)。盲区在改变共识幅度但不改变方向。`;
    } else if (absDelta > 3) {
      blindnessEffect = `信息盲区效应适中: 关闭盲区后共识偏移 ${blindnessVariant.deltaConsensus.toFixed(1)}。`;
    } else {
      blindnessEffect = `信息盲区效应弱 (Δ=${absDelta.toFixed(1)})。当前因子分布下，即使所有Agent看到全部信息，共识也基本不变。`;
    }
    if (blindnessActive && absDelta <= 3) {
      blindnessEffect += ` 这可能意味着: (1) 因子本身的方向性很强，视角差异不足以改变判断; 或 (2) 盲区配置需要调整。`;
    }
  } else {
    blindnessEffect = "未执行盲区反事实分析。";
  }

  // 集中度风险
  const top1Pct = attribution[0]?.contributionPct ?? 0;
  if (top1Pct > 40) {
    riskFactors.push(`⚠️ 共识过度依赖单一Agent: ${attribution[0].agentName} 占 ${top1Pct}% 贡献`);
  }

  // 交叉验证摘要
  const cvLevel = crossValidation.confidenceLevel;
  const cvScore = crossValidation.overallScore;
  const cvConsistency = Math.round(crossValidation.directionConsistency * 100);
  const cvStd = crossValidation.consensusStd;

  let validationSummary: string;
  if (cvLevel === "HIGH") {
    validationSummary = `✅ 多方法交叉验证通过: ${cvConsistency}%方法方向一致，方法间共识标准差${cvStd}，综合置信度${cvScore}/100。`;
  } else if (cvLevel === "MEDIUM") {
    validationSummary = `⚠️ 多方法交叉验证中等: ${cvConsistency}%方法方向一致，方法间共识标准差${cvStd}，综合置信度${cvScore}/100。建议谨慎对待结果。`;
  } else if (cvLevel === "LOW") {
    validationSummary = `🟡 多方法交叉验证较弱: ${cvConsistency}%方法方向一致，方法间共识标准差${cvStd}，综合置信度${cvScore}/100。结果可靠性低。`;
  } else {
    validationSummary = `🔴 多方法交叉验证失败: 方法间方向一致性仅${cvConsistency}%，综合置信度${cvScore}/100。结果高度不可靠。`;
  }

  return {
    coreFinding,
    consensusMechanism,
    riskFactors: riskFactors.length > 0 ? riskFactors : ["无显著风险因素"],
    blindnessEffect,
    validationSummary,
  };
}

// ==================== 主入口 ====================

/**
 * 从一轮模拟结果生成完整诊断报告
 *
 * 纯数学计算，零 LLM 调用，毫秒级完成。
 */
export function generateDiagnostics(
  agents: V9AgentDefinition[],
  states: Record<string, V9AgentState>,
  consensus: number,
  direction: V9Direction,
  beliefStd: number,
  factorVector: { factors: ExtractedFactor[] },
  blindnessActive: boolean,
  kuramotoR?: number
): DiagnosticReport {
  // 1. 归因分解
  const attribution = computeAttribution(agents, states);

  // 2. 联盟检测
  const coalition = detectCoalitions(agents, states, attribution);

  // 3. 反事实分析
  const counterfactuals = runCounterfactuals(
    agents, states, consensus, direction, factorVector
  );

  // 4. 多方法交叉验证
  const crossValidation = runCrossValidation(agents, states, kuramotoR);

  // 5. 诊断摘要
  const summary = buildSummary(
    attribution, coalition, counterfactuals, crossValidation,
    consensus, direction, beliefStd, blindnessActive
  );

  return { attribution, coalition, counterfactuals, crossValidation, summary };
}
