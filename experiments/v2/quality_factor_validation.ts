/**
 * 发言质量因子验证脚本 v2
 *
 * 目标：验证四层质量因子（含 5 项优化）能否区分恶意 agent 与诚实 agent。
 * 数据：E/F 组恶意 agent 实验数据（含 per-utterance 信念快照）。
 *
 * 5 项优化（2026-07-21 复盘）：
 *   1. 信用层加"言行一致性"检查（utterance_belief vs actual_belief_before）
 *   2. 锚定层用"最稳定 agent"替代"信息知情者"（不依赖 infoExposure 字段）
 *   3. 反事实层用加权 DeGroot（影响力 = credibility × confidence）
 *   4. LLM 触发加置信区间检查（分歧 > 2×历史噪声）
 *   5. 架构用 EMA 平滑（α=0.3，避免单条发言偶然波动）
 *
 * 用法：npx tsx experiments/v2/quality_factor_validation.ts
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// 类型定义
// ============================================================================

interface UtteranceSnapshot {
  speakerId: string;
  belief: number;
  confidence: number;
  referencedAgents: string[];
  beliefsBefore: Record<string, { belief: number; confidence: number }>;
  beliefsAfter: Record<string, { belief: number; confidence: number }>;
}

interface GovernanceTraceEntry {
  roundNumber: number;
  interventions: Array<{ type: string; targetAgentId?: string; targetAgents?: string[] }>;
  perUtteranceSnapshots: UtteranceSnapshot[];
}

interface MaliciousExperiment {
  runId: string;
  group: "E" | "F" | "G";
  runIndex: number;
  kendallTau: number;
  totalRounds: number;
  maliciousAgentIds: string[];
  attackScenario: "single" | "collusion";
  governanceEnabled: boolean;
  governanceTrace: GovernanceTraceEntry[];
  finalBeliefs: Record<string, number>;
}

// ============================================================================
// 统计工具
// ============================================================================

function mean(v: number[]): number {
  return v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length;
}

function stdDev(v: number[]): number {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ============================================================================
// 数据加载
// ============================================================================

const DATA_DIR = path.resolve(process.cwd(), "experiments/v2/data_fraud_malicious");
const ALL_AGENTS = ["a1", "a2", "a3", "a4", "a5"];

function loadData(): MaliciousExperiment[] {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`数据目录不存在: ${DATA_DIR}`);
    process.exit(1);
  }
  const files = fs.readdirSync(DATA_DIR).filter(f =>
    f.endsWith(".json") &&
    (f.startsWith("fraud_E_malicious_content_driven_101") || f.startsWith("fraud_E_malicious_content_driven_102") ||
     f.startsWith("fraud_E_malicious_content_driven_103") || f.startsWith("fraud_E_malicious_content_driven_104") ||
     f.startsWith("fraud_E_malicious_content_driven_105") ||
     f.startsWith("fraud_F_malicious_content_driven_101") || f.startsWith("fraud_F_malicious_content_driven_102") ||
     f.startsWith("fraud_F_malicious_content_driven_103") || f.startsWith("fraud_F_malicious_content_driven_104") ||
     f.startsWith("fraud_F_malicious_content_driven_105"))
  );
  return files.map(f => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf-8")));
}

// ============================================================================
// 第 1 层：信用层（含言行一致性）
// ============================================================================

/**
 * 言行一致性：utterance 中的 belief 与 agent 实际信念的偏差
 * 恶意 agent 说反话会直接暴露（如说 belief=0.95 但实际=-0.9）
 */
function computeConsistency(
  utteranceBelief: number,
  actualBeliefBefore: number
): number {
  return clamp(1 - Math.abs(utteranceBelief - actualBeliefBefore) / 2, 0, 1);
}

interface CredibilityState {
  alpha: number;  // 正证据
  beta: number;   // 负证据
}

/**
 * 更新信用层
 * 正证据：被引用 + 言行一致
 * 负证据：被干预 + 言行不一致
 */
function updateCredibility(
  state: CredibilityState,
  snapshot: UtteranceSnapshot,
  isIntervened: boolean,
  speakerId: string
): CredibilityState {
  const actualBelief = snapshot.beliefsBefore[speakerId]?.belief ?? snapshot.belief;
  const consistency = computeConsistency(snapshot.belief, actualBelief);

  // 正证据
  if (snapshot.referencedAgents.length > 0) {
    state.alpha += 1;  // 被引用
    // 被高信用 agent 引用？暂且不加权重（引用者的信用还没算出来）
  }
  if (consistency > 0.8) {
    state.alpha += 0.5;  // 言行一致
  }

  // 负证据
  if (isIntervened) {
    state.beta += 1;  // 被治理干预
  }
  if (consistency < 0.3) {
    state.beta += 0.5;  // 言行不一致
  }

  return state;
}

function getCredibility(state: CredibilityState): number {
  return state.alpha / (state.alpha + state.beta);
}

// ============================================================================
// 第 2 层：锚定层（稳定性锚定）
// ============================================================================

/**
 * 用"信念最稳定的 agent"作为锚定方向
 * 稳定性 = 1 / (1 + variance)
 */
function computeStability(beliefHistory: number[]): number {
  if (beliefHistory.length < 2) return 1.0;
  const v = stdDev(beliefHistory) ** 2;
  return 1 / (1 + v * 10); // 放大系数 10 使细微差异更明显
}

/**
 * 计算锚定方向
 * 锚定 = weighted_mean(当前信念 × 稳定性)
 */
function computeAnchor(
  currentBeliefs: Record<string, number>,
  beliefHistories: Record<string, number[]>
): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const id of ALL_AGENTS) {
    const belief = currentBeliefs[id] ?? 0;
    const stability = computeStability(beliefHistories[id] || [belief]);
    weightedSum += belief * stability;
    totalWeight += stability;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * 计算发言对齐度
 * cos(Δgroup, Δanchor)
 */
function computeAlignment(
  beliefsBefore: Record<string, { belief: number; confidence: number }>,
  beliefsAfter: Record<string, { belief: number; confidence: number }>,
  anchor: number
): number {
  const beforeMean = mean(Object.values(beliefsBefore).map(b => b.belief));
  const afterMean = mean(Object.values(beliefsAfter).map(b => b.belief));
  const deltaGroup = afterMean - beforeMean;
  const deltaAnchor = anchor - beforeMean;

  // 如果群体没变化，中性
  if (Math.abs(deltaGroup) < 0.001) return 0.5;

  // cos 相似度
  const cos = deltaAnchor * deltaGroup;
  const norm = Math.abs(deltaGroup) * Math.max(Math.abs(deltaAnchor), 0.001);
  return clamp((cos / norm + 1) / 2, 0, 1);
}

// ============================================================================
// 第 3 层：反事实层（加权 DeGroot）
// ============================================================================

const DGROOT_RATE = 0.15;

/**
 * 加权 DeGroot 反事实：如果没有发言者，信念会怎么走
 * 影响力 = credibility × confidence
 */
function computeCounterfactual(
  snapshot: UtteranceSnapshot,
  speakerId: string,
  anchor: number,
  credibilities: Record<string, number>
): number {
  // 计算加权群体方向（不含发言者）
  let weightedSum = 0;
  let totalWeight = 0;
  for (const id of ALL_AGENTS) {
    if (id === speakerId) continue;
    const b = snapshot.beliefsBefore[id]?.belief ?? 0;
    const conf = snapshot.beliefsBefore[id]?.confidence ?? 50;
    const cred = credibilities[id] ?? 0.5;
    const weight = cred * (conf / 100);
    weightedSum += b * weight;
    totalWeight += weight;
  }
  const groupPull = totalWeight > 0 ? weightedSum / totalWeight : anchor;

  // 反事实：发言者信念向加权群体方向回归
  const speakerBeliefBefore = snapshot.beliefsBefore[speakerId]?.belief ?? 0;
  const counterfactualBelief = speakerBeliefBefore + DGROOT_RATE * (groupPull - speakerBeliefBefore);

  const speakerBeliefAfter = snapshot.beliefsAfter[speakerId]?.belief ?? speakerBeliefBefore;

  const actualDist = Math.abs(speakerBeliefAfter - anchor);
  const cfDist = Math.abs(counterfactualBelief - anchor);

  return clamp((cfDist - actualDist + 0.5) / 1.0, 0, 1);
}

// ============================================================================
// 第 4 层：LLM 触发（置信区间检查）
// ============================================================================

/**
 * 检查是否需要触发 LLM 交叉验证
 * 触发条件：三层分歧 > 2 × 历史噪声
 */
function shouldTriggerLLM(
  credibility: number,
  alignment: number,
  counterfactual: number,
  credHistory: number[],
  alignHistory: number[],
  cfHistory: number[]
): boolean {
  const noise = Math.max(
    credHistory.length > 1 ? stdDev(credHistory) : 0.05,
    alignHistory.length > 1 ? stdDev(alignHistory) : 0.05,
    cfHistory.length > 1 ? stdDev(cfHistory) : 0.05
  );
  const range = Math.max(credibility, alignment, counterfactual) -
    Math.min(credibility, alignment, counterfactual);
  return range > noise * 2;
}

// ============================================================================
// 综合计算
// ============================================================================

interface AgentQualityReport {
  agentId: string;
  isMalicious: boolean;
  /** 言行一致性（平均） */
  consistencyMean: number;
  /** 最终信用分 */
  credibility: number;
  /** 平均对齐分 */
  alignmentMean: number;
  /** 平均反事实分 */
  counterfactualMean: number;
  /** 触发 LLM 次数 */
  llmTriggerCount: number;
  /** 综合质量分（EMA 平滑后） */
  qualityEma: number;
  /** 被干预次数 */
  interventionCount: number;
  /** 发言次数 */
  utteranceCount: number;
  /** 质量分轨迹 */
  qualityTrajectory: number[];
}

interface RunReport {
  runId: string;
  group: string;
  kendallTau: number;
  maliciousAgents: string[];
  agents: AgentQualityReport[];
}

// ============================================================================
// 主分析函数
// ============================================================================

function analyze(exp: MaliciousExperiment): RunReport {
  const maliciousIds = exp.maliciousAgentIds;
  const honestIds = ALL_AGENTS.filter(id => !maliciousIds.includes(id));

  // 初始化每个 agent 的状态
  const credStates: Record<string, CredibilityState> = {};
  const beliefHistories: Record<string, number[]> = {};
  const qualityTrajectories: Record<string, number[]> = {};
  const qualityEma: Record<string, number> = {};
  const alignmentAccum: Record<string, number[]> = {};
  const counterfactualAccum: Record<string, number[]> = {};
  const consistencyAccum: Record<string, number[]> = {};
  const interventionCounts: Record<string, number> = {};
  const utteranceCounts: Record<string, number> = {};
  const llmTriggerCounts: Record<string, number> = {};
  // 各层历史（用于噪声计算）
  const credHistory: Record<string, number[]> = {};
  const alignHistory: Record<string, number[]> = {};
  const cfHistory: Record<string, number[]> = {};

  for (const id of ALL_AGENTS) {
    credStates[id] = { alpha: 1, beta: 1 };
    beliefHistories[id] = [];
    qualityTrajectories[id] = [];
    qualityEma[id] = 0.5;
    alignmentAccum[id] = [];
    counterfactualAccum[id] = [];
    consistencyAccum[id] = [];
    interventionCounts[id] = 0;
    utteranceCounts[id] = 0;
    llmTriggerCounts[id] = 0;
    credHistory[id] = [];
    alignHistory[id] = [];
    cfHistory[id] = [];
  }

  const EMA_ALPHA = 0.3;

  // 逐轮处理
  for (const round of exp.governanceTrace) {
    // 统计本轮干预
    const intervenedIds = new Set<string>();
    for (const intv of round.interventions) {
      if (intv.targetAgentId) intervenedIds.add(intv.targetAgentId);
      if (intv.targetAgents) intv.targetAgents.forEach(id => intervenedIds.add(id));
    }
    for (const id of intervenedIds) {
      interventionCounts[id] = (interventionCounts[id] || 0) + 1;
    }

    // 逐发言处理
    for (const snap of round.perUtteranceSnapshots) {
      const speakerId = snap.speakerId;
      utteranceCounts[speakerId] = (utteranceCounts[speakerId] || 0) + 1;

      // 更新信念历史
      const belief = snap.beliefsAfter[speakerId]?.belief ?? snap.belief;
      if (!beliefHistories[speakerId]) beliefHistories[speakerId] = [];
      beliefHistories[speakerId].push(belief);

      // 更新所有 agent 的信念历史
      for (const id of ALL_AGENTS) {
        const b = snap.beliefsAfter[id]?.belief;
        if (b !== undefined) {
          if (!beliefHistories[id]) beliefHistories[id] = [];
          beliefHistories[id].push(b);
        }
      }

      // ── 第 1 层：信用层 ──
      const isIntervened = intervenedIds.has(speakerId);
      credStates[speakerId] = updateCredibility(credStates[speakerId], snap, isIntervened, speakerId);
      const credibility = getCredibility(credStates[speakerId]);

      // 言行一致性
      const actualBelief = snap.beliefsBefore[speakerId]?.belief ?? snap.belief;
      const consistency = computeConsistency(snap.belief, actualBelief);
      consistencyAccum[speakerId].push(consistency);

      // ── 第 2 层：锚定层 ──
      const currentBeliefs: Record<string, number> = {};
      for (const id of ALL_AGENTS) {
        currentBeliefs[id] = snap.beliefsBefore[id]?.belief ?? 0;
      }
      const anchor = computeAnchor(currentBeliefs, beliefHistories);
      const alignment = computeAlignment(snap.beliefsBefore, snap.beliefsAfter, anchor);
      alignmentAccum[speakerId].push(alignment);

      // ── 第 3 层：反事实层 ──
      const currentCreds: Record<string, number> = {};
      for (const id of ALL_AGENTS) {
        currentCreds[id] = getCredibility(credStates[id]);
      }
      const counterfactual = computeCounterfactual(snap, speakerId, anchor, currentCreds);
      counterfactualAccum[speakerId].push(counterfactual);

      // ── 第 4 层：LLM 触发检查 ──
      const triggered = shouldTriggerLLM(
        credibility, alignment, counterfactual,
        credHistory[speakerId], alignHistory[speakerId], cfHistory[speakerId]
      );
      if (triggered) {
        llmTriggerCounts[speakerId] = (llmTriggerCounts[speakerId] || 0) + 1;
      }

      // 更新历史
      credHistory[speakerId].push(credibility);
      alignHistory[speakerId].push(alignment);
      cfHistory[speakerId].push(counterfactual);

      // ── 融合 + EMA ──
      // v2.1 权重优化：言行一致是最强单层信号，直接纳入融合
      // 反事实层贡献近零（Δ<0.02），降至 0.05
      const quality = 0.40 * consistency + 0.25 * credibility + 0.30 * alignment + 0.05 * counterfactual;
      qualityEma[speakerId] = EMA_ALPHA * quality + (1 - EMA_ALPHA) * (qualityEma[speakerId] ?? 0.5);
      qualityTrajectories[speakerId].push(qualityEma[speakerId]);
    }
  }

  // 汇总
  const agents: AgentQualityReport[] = [];
  for (const id of ALL_AGENTS) {
    agents.push({
      agentId: id,
      isMalicious: maliciousIds.includes(id),
      consistencyMean: mean(consistencyAccum[id] || [0.5]),
      credibility: getCredibility(credStates[id]),
      alignmentMean: mean(alignmentAccum[id] || [0.5]),
      counterfactualMean: mean(counterfactualAccum[id] || [0.5]),
      llmTriggerCount: llmTriggerCounts[id] || 0,
      qualityEma: qualityEma[id] ?? 0.5,
      interventionCount: interventionCounts[id] || 0,
      utteranceCount: utteranceCounts[id] || 0,
      qualityTrajectory: qualityTrajectories[id] || [],
    });
  }

  return {
    runId: exp.runId,
    group: exp.group,
    kendallTau: exp.kendallTau,
    maliciousAgents: exp.maliciousAgentIds,
    agents,
  };
}

// ============================================================================
// 输出报告
// ============================================================================

function printHeader(title: string): void {
  console.log(`\n${"=".repeat(90)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(90)}`);
}

function printSeparator(): void {
  console.log("-".repeat(90));
}

function printRunReport(report: RunReport): void {
  console.log(`\n[${report.runId}]  恶意: [${report.maliciousAgents.join(", ")}]  τ=${report.kendallTau.toFixed(3)}`);
  printSeparator();
  console.log("Agent | 恶意 | 言行一致 | 信用 | 对齐 | 反事实 | 综合EMA | 干预 | 发言 | LLM触发");
  printSeparator();
  for (const a of report.agents) {
    const tag = a.isMalicious ? "⚠️" : "✓";
    console.log(
      `${a.agentId.padEnd(5)} | ${tag.padEnd(4)} | ` +
      `${a.consistencyMean.toFixed(3).padStart(7)} | ` +
      `${a.credibility.toFixed(3).padStart(5)} | ` +
      `${a.alignmentMean.toFixed(3).padStart(5)} | ` +
      `${a.counterfactualMean.toFixed(3).padStart(6)} | ` +
      `${a.qualityEma.toFixed(3).padStart(7)} | ` +
      `${String(a.interventionCount).padStart(4)} | ` +
      `${String(a.utteranceCount).padStart(4)} | ` +
      `${String(a.llmTriggerCount).padStart(8)}`
    );
  }
}

function printGroupSummary(label: string, reports: RunReport[]): void {
  console.log(`\n${"─".repeat(90)}`);
  console.log(`  ${label} 汇总 (n=${reports.length})`);
  console.log("─".repeat(90));

  const agentSummaries: Record<string, {
    isMalicious: boolean;
    consistencies: number[];
    credibilities: number[];
    alignments: number[];
    counterfactuals: number[];
    qualityEmas: number[];
    interventions: number[];
    utterances: number[];
    llmTriggers: number[];
  }> = {};

  for (const id of ALL_AGENTS) {
    agentSummaries[id] = {
      isMalicious: false,
      consistencies: [],
      credibilities: [],
      alignments: [],
      counterfactuals: [],
      qualityEmas: [],
      interventions: [],
      utterances: [],
      llmTriggers: [],
    };
  }

  for (const report of reports) {
    for (const a of report.agents) {
      agentSummaries[a.agentId].isMalicious = a.isMalicious;
      agentSummaries[a.agentId].consistencies.push(a.consistencyMean);
      agentSummaries[a.agentId].credibilities.push(a.credibility);
      agentSummaries[a.agentId].alignments.push(a.alignmentMean);
      agentSummaries[a.agentId].counterfactuals.push(a.counterfactualMean);
      agentSummaries[a.agentId].qualityEmas.push(a.qualityEma);
      agentSummaries[a.agentId].interventions.push(a.interventionCount);
      agentSummaries[a.agentId].utterances.push(a.utteranceCount);
      agentSummaries[a.agentId].llmTriggers.push(a.llmTriggerCount);
    }
  }

  console.log("\nAgent | 恶意 | 言行一致 | 信用 | 对齐 | 反事实 | 综合EMA | 干预 | 发言 | LLM触发");
  printSeparator();

  for (const id of ALL_AGENTS) {
    const s = agentSummaries[id];
    const tag = s.isMalicious ? "⚠️" : "✓";
    console.log(
      `${id.padEnd(5)} | ${tag.padEnd(4)} | ` +
      `${mean(s.consistencies).toFixed(3)}±${stdDev(s.consistencies).toFixed(3)} | ` +
      `${mean(s.credibilities).toFixed(3)}±${stdDev(s.credibilities).toFixed(3)} | ` +
      `${mean(s.alignments).toFixed(3)}±${stdDev(s.alignments).toFixed(3)} | ` +
      `${mean(s.counterfactuals).toFixed(3)}±${stdDev(s.counterfactuals).toFixed(3)} | ` +
      `${mean(s.qualityEmas).toFixed(3)}±${stdDev(s.qualityEmas).toFixed(3)} | ` +
      `${mean(s.interventions).toFixed(1).padStart(4)} | ` +
      `${mean(s.utterances).toFixed(1).padStart(4)} | ` +
      `${mean(s.llmTriggers).toFixed(1).padStart(8)}`
    );
  }

  // 恶意 vs 诚实对比
  const mal = ALL_AGENTS.filter(id => agentSummaries[id].isMalicious)
    .flatMap(id => agentSummaries[id].qualityEmas);
  const hon = ALL_AGENTS.filter(id => !agentSummaries[id].isMalicious)
    .flatMap(id => agentSummaries[id].qualityEmas);

  if (mal.length > 0 && hon.length > 0) {
    const malMean = mean(mal);
    const honMean = mean(hon);
    const diff = honMean - malMean;

    console.log(`\n恶意 agent 综合EMA: ${malMean.toFixed(3)}±${stdDev(mal).toFixed(3)}  (n=${mal.length})`);
    console.log(`诚实 agent 综合EMA: ${honMean.toFixed(3)}±${stdDev(hon).toFixed(3)}  (n=${hon.length})`);
    console.log(`差异 (诚实-恶意): ${diff >= 0 ? "+" : ""}${diff.toFixed(3)}`);

    if (diff > 0.1) {
      console.log(`✅ 质量因子能有效区分恶意 vs 诚实 agent`);
    } else if (diff > 0.05) {
      console.log(`🟡 微弱区分，信号存在但不够强`);
    } else {
      console.log(`❌ 质量因子无法区分恶意 vs 诚实 agent`);
    }
  }

  // 分层贡献
  const malConsistency = mean(ALL_AGENTS.filter(id => agentSummaries[id].isMalicious)
    .flatMap(id => agentSummaries[id].consistencies));
  const honConsistency = mean(ALL_AGENTS.filter(id => !agentSummaries[id].isMalicious)
    .flatMap(id => agentSummaries[id].consistencies));
  const malCred = mean(ALL_AGENTS.filter(id => agentSummaries[id].isMalicious)
    .flatMap(id => agentSummaries[id].credibilities));
  const honCred = mean(ALL_AGENTS.filter(id => !agentSummaries[id].isMalicious)
    .flatMap(id => agentSummaries[id].credibilities));
  const malAlign = mean(ALL_AGENTS.filter(id => agentSummaries[id].isMalicious)
    .flatMap(id => agentSummaries[id].alignments));
  const honAlign = mean(ALL_AGENTS.filter(id => !agentSummaries[id].isMalicious)
    .flatMap(id => agentSummaries[id].alignments));
  const malCF = mean(ALL_AGENTS.filter(id => agentSummaries[id].isMalicious)
    .flatMap(id => agentSummaries[id].counterfactuals));
  const honCF = mean(ALL_AGENTS.filter(id => !agentSummaries[id].isMalicious)
    .flatMap(id => agentSummaries[id].counterfactuals));

  console.log(`\n分层贡献:`);
  console.log(`  言行一致: 恶意 ${malConsistency.toFixed(3)} vs 诚实 ${honConsistency.toFixed(3)} (差 ${(honConsistency - malConsistency).toFixed(3)})`);
  console.log(`  信用:     恶意 ${malCred.toFixed(3)} vs 诚实 ${honCred.toFixed(3)} (差 ${(honCred - malCred).toFixed(3)})`);
  console.log(`  对齐:     恶意 ${malAlign.toFixed(3)} vs 诚实 ${honAlign.toFixed(3)} (差 ${(honAlign - malAlign).toFixed(3)})`);
  console.log(`  反事实:   恶意 ${malCF.toFixed(3)} vs 诚实 ${honCF.toFixed(3)} (差 ${(honCF - malCF).toFixed(3)})`);
}

// ============================================================================
// 主函数
// ============================================================================

function main(): void {
  printHeader("发言质量因子验证 v2 — 5 项优化 + per-utterance 快照");

  const data = loadData();
  const groups = {
    E: data.filter(d => d.group === "E"),
    F: data.filter(d => d.group === "F"),
  };

  console.log(`\n数据加载: E=${groups.E.length}, F=${groups.F.length}`);
  console.log(`E 组: 单点恶意(a1) + 治理开 — 测治理场景下质量因子表现`);
  console.log(`F 组: 单点恶意(a1) + 治理关 — 测无治理场景下质量因子表现`);

  console.log("\n5 项优化:");
  console.log("  1. 言行一致性检查 (utterance_belief vs actual_belief_before)");
  console.log("  2. 稳定性锚定 (最稳定 agent 方向)");
  console.log("  3. 加权 DeGroot (影响力 = credibility × confidence)");
  console.log("  4. LLM 触发置信区间 (分歧 > 2×历史噪声)");
  console.log("  5. EMA 平滑 (α=0.3)");

  const allReports: RunReport[] = [];

  for (const [group, experiments] of Object.entries(groups)) {
    if (experiments.length === 0) continue;
    const reports = experiments.map(exp => analyze(exp));
    allReports.push(...reports);

    printHeader(`${group} 组 逐 run 详情`);
    for (const report of reports) {
      printRunReport(report);
    }
    printGroupSummary(`${group} 组`, reports);
  }

  // 跨组对比
  printHeader("跨组对比");

  for (const [group, experiments] of Object.entries(groups)) {
    if (experiments.length === 0) continue;
    const reports = experiments.map(exp => analyze(exp));
    const mal = reports.flatMap(r => r.agents.filter(a => a.isMalicious));
    const hon = reports.flatMap(r => r.agents.filter(a => !a.isMalicious));

    const malQ = mean(mal.map(a => a.qualityEma));
    const honQ = mean(hon.map(a => a.qualityEma));
    const malCons = mean(mal.map(a => a.consistencyMean));
    const honCons = mean(hon.map(a => a.consistencyMean));
    const malCred = mean(mal.map(a => a.credibility));
    const honCred = mean(hon.map(a => a.credibility));
    const malAlign = mean(mal.map(a => a.alignmentMean));
    const honAlign = mean(hon.map(a => a.alignmentMean));
    const llmTotal = mal.reduce((s, a) => s + a.llmTriggerCount, 0) + hon.reduce((s, a) => s + a.llmTriggerCount, 0);
    const utteranceTotal = mal.reduce((s, a) => s + a.utteranceCount, 0) + hon.reduce((s, a) => s + a.utteranceCount, 0);

    console.log(`\n${group} 组:`);
    console.log(`  恶意 EMA: ${malQ.toFixed(3)}  诚实 EMA: ${honQ.toFixed(3)}  差异: ${(honQ - malQ).toFixed(3)}`);
    console.log(`  言行一致: 恶意 ${malCons.toFixed(3)}  诚实 ${honCons.toFixed(3)}  差异: ${(honCons - malCons).toFixed(3)}`);
    console.log(`  LLM 触发率: ${llmTotal}/${utteranceTotal} (${(llmTotal / utteranceTotal * 100).toFixed(1)}%)`);
  }

  // 最终结论
  printHeader("最终结论");

  const allMal = allReports.flatMap(r => r.agents.filter(a => a.isMalicious));
  const allHon = allReports.flatMap(r => r.agents.filter(a => !a.isMalicious));
  const allMalQ = mean(allMal.map(a => a.qualityEma));
  const allHonQ = mean(allHon.map(a => a.qualityEma));
  const diff = allHonQ - allMalQ;

  const allMalCons = mean(allMal.map(a => a.consistencyMean));
  const allHonCons = mean(allHon.map(a => a.consistencyMean));
  const allMalCred = mean(allMal.map(a => a.credibility));
  const allHonCred = mean(allHon.map(a => a.credibility));
  const allMalAlign = mean(allMal.map(a => a.alignmentMean));
  const allHonAlign = mean(allHon.map(a => a.alignmentMean));
  const allMalCF = mean(allMal.map(a => a.counterfactualMean));
  const allHonCF = mean(allHon.map(a => a.counterfactualMean));

  console.log(`\n全部数据 (10 runs, ${allMal.length + allHon.length} agent-scores):`);
  console.log(`  恶意 agent 综合EMA: ${allMalQ.toFixed(3)}±${stdDev(allMal.map(a => a.qualityEma)).toFixed(3)}`);
  console.log(`  诚实 agent 综合EMA: ${allHonQ.toFixed(3)}±${stdDev(allHon.map(a => a.qualityEma)).toFixed(3)}`);
  console.log(`  差异 (诚实-恶意): ${diff >= 0 ? "+" : ""}${diff.toFixed(3)}`);

  console.log(`\n分层贡献:`);
  console.log(`  言行一致: 恶意 ${allMalCons.toFixed(3)} vs 诚实 ${allHonCons.toFixed(3)} (Δ${(allHonCons - allMalCons).toFixed(3)})`);
  console.log(`  信用:     恶意 ${allMalCred.toFixed(3)} vs 诚实 ${allHonCred.toFixed(3)} (Δ${(allHonCred - allMalCred).toFixed(3)})`);
  console.log(`  对齐:     恶意 ${allMalAlign.toFixed(3)} vs 诚实 ${allHonAlign.toFixed(3)} (Δ${(allHonAlign - allMalAlign).toFixed(3)})`);
  console.log(`  反事实:   恶意 ${allMalCF.toFixed(3)} vs 诚实 ${allHonCF.toFixed(3)} (Δ${(allHonCF - allMalCF).toFixed(3)})`);

  if (diff > 0.1) {
    console.log(`\n✅ 质量因子能有效区分恶意 vs 诚实 agent`);
    console.log(`   最强信号: ${allHonCons - allMalCons > allHonAlign - allMalAlign ? '言行一致性' : '对齐度'}`);
  } else if (diff > 0.05) {
    console.log(`\n🟡 微弱区分`);
  } else {
    console.log(`\n❌ 无法区分`);
  }

  console.log("\n" + "=".repeat(90));
  console.log("  注：此脚本不修改任何实验数据，仅做离线分析。");
  console.log("  LLM 层未实际调用，仅统计触发次数。");
  console.log("=".repeat(90));
}

main();