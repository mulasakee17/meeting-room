/**
 * 干预有效性深度分析（含成本维度）
 *
 * 问题：
 * 1. 154 次干预中为什么只有部分有效？
 * 2. 有效干预是否提高了决策质量？
 * 3. 无效干预是否降低了决策质量？
 * 4. 干预的 token 成本是多少？成本效益比如何？
 * 5. 哪种干预类型性价比最高？
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ============================================================================
// 类型定义
// ============================================================================

interface InterventionEffect {
  round: number;
  interventionType: string;
  targetAgentId: string;
  beliefBefore: number;
  beliefAfter: number;
  effective: boolean;
}

interface RoundIntervention {
  type: string;
  targetAgentId?: string;
  targetAgents?: string[];
}

interface RoundRecord {
  roundNumber: number;
  tau: number;
  beliefs: Record<string, number>;
  interventions: RoundIntervention[];
}

interface ExperimentResult {
  runId: string;
  ablation: string;
  kendallTau: number;
  decisionQuality: number;
  tauTrajectory: number[];
  totalRounds: number;
  totalInterventions: number;
  interventionEffects: InterventionEffect[];
  interventionBreakdown: Record<string, number>;
  rounds: RoundRecord[];
}

// 干预级别记录（每个原始干预一条，而非每个目标一条）
interface InterventionRecord {
  runId: string;
  round: number;
  type: string;
  recipients: string[];      // 实际接收 prompt 的 agent 列表
  measuredTargets: string[]; // 信念被测量的 agent 列表
  effective: boolean;        // 任一目标的信念变化 > 0.05
  effectiveCount: number;    // 有效目标数
  totalTargets: number;      // 总目标数
  tauBefore?: number;
  tauAfter?: number;
  // 成本
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// ============================================================================
// 成本模型
// ============================================================================

/**
 * 每种干预类型的 token 成本估算
 * 基于 PromptInjector.ts 中实际的 prompt 文本长度
 *
 * inputTokens: 干预 prompt 文本本身（≈ 字符数 / 4）
 * outputTokens: agent 因干预而产生的额外输出（反思文本、独立判断等）
 */
const INTERVENTION_COSTS: Record<string, { inputTokens: number; outputTokens: number }> = {
  force_reflection: {
    // prompt: "⚠️ CRITICAL: Your position is at an extreme...write down the STRONGEST argument for the OPPOSING viewpoint...restate your own position."
    inputTokens: 70,
    outputTokens: 250,  // 写最强反面论据 + 重述立场
  },
  introduce_diversity: {
    // prompt: "⚠️ CRITICAL: Echo chamber detected...State at least ONE scenario where your current conclusion would be WRONG."
    inputTokens: 75,
    outputTokens: 150,  // 写一个反面场景
  },
  continue_discussion: {
    // prompt: "⚠️ CRITICAL: Premature consensus detected...State one counter-argument now."
    inputTokens: 55,
    outputTokens: 150,  // 写一个反论
  },
  reduce_weight: {
    // prompt: "⚠️ CRITICAL: Agent X is dominating...Form your OWN independent judgment..."
    inputTokens: 75,
    outputTokens: 200,  // 形成独立判断
  },
};

/**
 * 计算每次干预的实际接收者
 * reduce_weight: 除目标外的所有 agent
 * force_reflection / introduce_diversity: targetAgents 列表
 * continue_discussion: 全体 agent
 */
function getRecipients(intv: RoundIntervention, allAgentIds: string[]): string[] {
  if (intv.type === "reduce_weight" && intv.targetAgentId) {
    return allAgentIds.filter(id => id !== intv.targetAgentId);
  }
  if (intv.type === "continue_discussion") {
    return allAgentIds;
  }
  return intv.targetAgents || [];
}

/**
 * 计算单次干预的 token 成本
 */
function calcInterventionCost(type: string, numRecipients: number): { inputTokens: number; outputTokens: number; totalTokens: number } {
  const costs = INTERVENTION_COSTS[type] || { inputTokens: 50, outputTokens: 100 };
  const inputTokens = costs.inputTokens * numRecipients;
  const outputTokens = costs.outputTokens * numRecipients;
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

// ============================================================================
// 数据加载与重建
// ============================================================================

function loadData(dataDir: string, prefix: string): ExperimentResult[] {
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json") && f.startsWith(prefix));
  return files.map(f => {
    const content = fs.readFileSync(path.join(dataDir, f), "utf-8");
    const raw = JSON.parse(content) as ExperimentResult;

    // Rebuild interventionEffects from rounds if stored data is incomplete
    if (raw.interventionEffects.length < raw.totalInterventions) {
      const rebuilt: InterventionEffect[] = [];
      for (let i = 0; i < raw.rounds.length; i++) {
        const round = raw.rounds[i];
        for (const intv of round.interventions) {
          const targets = intv.targetAgentId
            ? [intv.targetAgentId]
            : intv.targetAgents || [];

          for (const targetId of targets) {
            const beliefBefore = round.beliefs[targetId] ?? 0;
            let beliefAfter = beliefBefore;
            let effective = false;
            if (i + 1 < raw.rounds.length) {
              const nextRound = raw.rounds[i + 1];
              beliefAfter = nextRound.beliefs[targetId] ?? beliefBefore;
              effective = Math.abs(beliefAfter - beliefBefore) > 0.05;
            }
            rebuilt.push({ round: round.roundNumber, interventionType: intv.type, targetAgentId: targetId, beliefBefore, beliefAfter, effective });
          }
        }
      }
      raw.interventionEffects = rebuilt;
    }

    return raw;
  });
}

// ============================================================================
// 构建干预级别记录
// ============================================================================

function buildInterventionRecords(results: ExperimentResult[], allAgentIds: string[]): InterventionRecord[] {
  const records: InterventionRecord[] = [];

  for (const result of results) {
    for (let i = 0; i < result.rounds.length; i++) {
      const round = result.rounds[i];
      const nextRound = i + 1 < result.rounds.length ? result.rounds[i + 1] : null;

      for (const intv of round.interventions) {
        const recipients = getRecipients(intv, allAgentIds);
        const measuredTargets = intv.targetAgentId
          ? [intv.targetAgentId]
          : intv.targetAgents || [];

        // 检查每个目标的信念变化
        let effectiveCount = 0;
        for (const targetId of measuredTargets) {
          const beliefBefore = round.beliefs[targetId] ?? 0;
          if (nextRound) {
            const beliefAfter = nextRound.beliefs[targetId] ?? beliefBefore;
            if (Math.abs(beliefAfter - beliefBefore) > 0.05) effectiveCount++;
          }
        }

        const cost = calcInterventionCost(intv.type, recipients.length);
        const tauBefore = result.tauTrajectory[i];
        const tauAfter = result.tauTrajectory[i + 1];

        records.push({
          runId: result.runId,
          round: round.roundNumber,
          type: intv.type,
          recipients,
          measuredTargets,
          effective: effectiveCount > 0,
          effectiveCount,
          totalTargets: measuredTargets.length,
          tauBefore,
          tauAfter,
          ...cost,
        });
      }
    }
  }

  return records;
}

// ============================================================================
// 分析函数
// ============================================================================

function analyze(results: ExperimentResult[], noneResults: ExperimentResult[]) {
  const allAgentIds = ["a1", "a2", "a3", "a4", "a5"];
  const records = buildInterventionRecords(results, allAgentIds);

  const effective = records.filter(r => r.effective);
  const ineffective = records.filter(r => !r.effective);

  console.log("\n" + "=".repeat(70));
  console.log("干预有效性深度分析（含成本维度）");
  console.log("=".repeat(70));

  console.log(`\n总干预次数: ${records.length}`);
  console.log(`有效干预: ${effective.length} (${((effective.length / records.length) * 100).toFixed(1)}%)`);
  console.log(`无效干预: ${ineffective.length} (${((ineffective.length / records.length) * 100).toFixed(1)}%)`);

  const totalCost = records.reduce((s, r) => s + r.totalTokens, 0);
  const effectiveCost = effective.reduce((s, r) => s + r.totalTokens, 0);
  const ineffectiveCost = ineffective.reduce((s, r) => s + r.totalTokens, 0);
  const wastedCost = ineffectiveCost;

  console.log(`\n总 token 成本: ${totalCost.toLocaleString()}`);
  console.log(`有效干预成本: ${effectiveCost.toLocaleString()} (${((effectiveCost / totalCost) * 100).toFixed(1)}%)`);
  console.log(`无效干预成本: ${ineffectiveCost.toLocaleString()} (${((ineffectiveCost / totalCost) * 100).toFixed(1)}%)`);
  console.log(`浪费的 token: ${wastedCost.toLocaleString()}`);

  // ===== 分析 1: 干预类型 × 有效性 × 成本 =====
  console.log("\n" + "-".repeat(70));
  console.log("分析 1: 干预类型 × 有效性 × 成本");
  console.log("-".repeat(70));

  const byType: Record<string, { total: number; effective: number; inputTokens: number; outputTokens: number; totalTokens: number; effectiveTokens: number; ineffectiveTokens: number }> = {};

  for (const r of records) {
    if (!byType[r.type]) {
      byType[r.type] = { total: 0, effective: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, effectiveTokens: 0, ineffectiveTokens: 0 };
    }
    byType[r.type].total++;
    if (r.effective) byType[r.type].effective++;
    byType[r.type].inputTokens += r.inputTokens;
    byType[r.type].outputTokens += r.outputTokens;
    byType[r.type].totalTokens += r.totalTokens;
    if (r.effective) {
      byType[r.type].effectiveTokens += r.totalTokens;
    } else {
      byType[r.type].ineffectiveTokens += r.totalTokens;
    }
  }

  console.log("\n| 干预类型 | 次数 | 有效 | 有效率 | 总token | 有效token | 浪费token | 浪费率 |");
  console.log("|----------|------|------|--------|---------|-----------|-----------|--------|");
  for (const [type, s] of Object.entries(byType)) {
    const rate = ((s.effective / s.total) * 100).toFixed(1);
    const wasteRate = ((s.ineffectiveTokens / s.totalTokens) * 100).toFixed(1);
    console.log(`| ${type} | ${s.total} | ${s.effective} | ${rate}% | ${s.totalTokens.toLocaleString()} | ${s.effectiveTokens.toLocaleString()} | ${s.ineffectiveTokens.toLocaleString()} | ${wasteRate}% |`);
  }

  // ===== 分析 2: 成本效益比 =====
  console.log("\n" + "-".repeat(70));
  console.log("分析 2: 成本效益比 (τ提升 / token成本)");
  console.log("-".repeat(70));

  // 整体对比：none vs full
  const noneTau = noneResults.length > 0
    ? noneResults.reduce((s, r) => s + r.kendallTau, 0) / noneResults.length
    : 0;
  const fullTau = results.length > 0
    ? results.reduce((s, r) => s + r.kendallTau, 0) / results.length
    : 0;
  const tauGain = fullTau - noneTau;

  console.log(`\n基线 (none)   平均 τ: ${noneTau.toFixed(3)}`);
  console.log(`治理 (full)   平均 τ: ${fullTau.toFixed(3)}`);
  console.log(`τ 提升: ${tauGain >= 0 ? "+" : ""}${tauGain.toFixed(3)}`);
  console.log(`治理总 token 成本: ${totalCost.toLocaleString()}`);
  console.log(`整体成本效益: ${tauGain.toFixed(3)} τ / ${totalCost.toLocaleString()} tokens = ${(tauGain * 1000 / totalCost * 1000).toFixed(2)} ×10⁻⁶ τ/token`);

  // 按干预类型的成本效益
  console.log("\n| 干预类型 | 平均τ变化 | 平均token成本 | 成本效益(τ/1000token) |");
  console.log("|----------|-----------|---------------|----------------------|");
  for (const [type, s] of Object.entries(byType)) {
    const typeRecords = records.filter(r => r.type === type);
    const tauChanges = typeRecords
      .filter(r => r.tauBefore !== undefined && r.tauAfter !== undefined)
      .map(r => (r.tauAfter! - r.tauBefore!));
    const avgTauChange = tauChanges.length > 0
      ? tauChanges.reduce((a, b) => a + b, 0) / tauChanges.length
      : 0;
    const avgCost = s.totalTokens / s.total;
    const costEfficiency = (avgTauChange * 1000 / avgCost * 1000).toFixed(2);
    console.log(`| ${type} | ${avgTauChange >= 0 ? "+" : ""}${avgTauChange.toFixed(3)} | ${avgCost.toFixed(0)} | ${costEfficiency} ×10⁻⁶ |`);
  }

  // ===== 分析 3: 有效 vs 无效干预的 τ 影响与成本 =====
  console.log("\n" + "-".repeat(70));
  console.log("分析 3: 有效 vs 无效干预的 τ 影响与成本");
  console.log("-".repeat(70));

  const tauChangesEff = effective
    .filter(r => r.tauBefore !== undefined && r.tauAfter !== undefined)
    .map(r => r.tauAfter! - r.tauBefore!);
  const tauChangesIneff = ineffective
    .filter(r => r.tauBefore !== undefined && r.tauAfter !== undefined)
    .map(r => r.tauAfter! - r.tauBefore!);

  const avgTauEff = tauChangesEff.length > 0 ? tauChangesEff.reduce((a, b) => a + b, 0) / tauChangesEff.length : 0;
  const avgTauIneff = tauChangesIneff.length > 0 ? tauChangesIneff.reduce((a, b) => a + b, 0) / tauChangesIneff.length : 0;

  const avgCostEff = effective.length > 0 ? effectiveCost / effective.length : 0;
  const avgCostIneff = ineffective.length > 0 ? ineffectiveCost / ineffective.length : 0;

  console.log(`\n有效干预:`);
  console.log(`  次数: ${effective.length}`);
  console.log(`  平均 τ 变化: ${avgTauEff >= 0 ? "+" : ""}${avgTauEff.toFixed(3)}`);
  console.log(`  总 token 成本: ${effectiveCost.toLocaleString()}`);
  console.log(`  平均每次成本: ${avgCostEff.toFixed(0)} tokens`);
  console.log(`  成本效益: ${(avgTauEff * 1000 / avgCostEff * 1000).toFixed(2)} ×10⁻⁶ τ/token`);

  console.log(`\n无效干预:`);
  console.log(`  次数: ${ineffective.length}`);
  console.log(`  平均 τ 变化: ${avgTauIneff >= 0 ? "+" : ""}${avgTauIneff.toFixed(3)}`);
  console.log(`  总 token 成本: ${ineffectiveCost.toLocaleString()} (全部浪费)`);
  console.log(`  平均每次成本: ${avgCostIneff.toFixed(0)} tokens`);

  // ===== 分析 4: 干预时机 × 成本 =====
  console.log("\n" + "-".repeat(70));
  console.log("分析 4: 干预时机 × 有效性 × 成本");
  console.log("-".repeat(70));

  const byRound: Record<number, { total: number; effective: number; totalTokens: number; wastedTokens: number }> = {};

  for (const r of records) {
    if (!byRound[r.round]) byRound[r.round] = { total: 0, effective: 0, totalTokens: 0, wastedTokens: 0 };
    byRound[r.round].total++;
    if (r.effective) byRound[r.round].effective++;
    byRound[r.round].totalTokens += r.totalTokens;
    if (!r.effective) byRound[r.round].wastedTokens += r.totalTokens;
  }

  console.log("\n| 轮次 | 次数 | 有效 | 有效率 | 总token | 浪费token | 浪费率 |");
  console.log("|------|------|------|--------|---------|-----------|--------|");
  for (const [round, s] of Object.entries(byRound).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
    const rate = ((s.effective / s.total) * 100).toFixed(1);
    const wasteRate = ((s.wastedTokens / s.totalTokens) * 100).toFixed(1);
    console.log(`| 第${round}轮 | ${s.total} | ${s.effective} | ${rate}% | ${s.totalTokens.toLocaleString()} | ${s.wastedTokens.toLocaleString()} | ${wasteRate}% |`);
  }

  // ===== 分析 5: 浪费最多的案例 =====
  console.log("\n" + "-".repeat(70));
  console.log("分析 5: 无效干预导致 τ 下降的案例（成本浪费最严重）");
  console.log("-".repeat(70));

  const harmful = ineffective
    .filter(r => r.tauBefore !== undefined && r.tauAfter !== undefined && r.tauAfter! < r.tauBefore!)
    .sort((a, b) => (b.tauBefore! - b.tauAfter!) - (a.tauBefore! - a.tauAfter!));

  if (harmful.length > 0) {
    console.log(`\n发现 ${harmful.length} 次无效干预导致 τ 下降（按 τ 降幅排序）：`);
    for (const h of harmful.slice(0, 5)) {
      console.log(`\n  [${h.runId}] 第${h.round}轮 ${h.type} → 目标 ${h.measuredTargets.join(",")}`);
      console.log(`    τ: ${h.tauBefore?.toFixed(3)} → ${h.tauAfter?.toFixed(3)} (变化 ${(h.tauAfter! - h.tauBefore!).toFixed(3)})`);
      console.log(`    接收者: ${h.recipients.length} agents, token 成本: ${h.totalTokens}`);
    }
  } else {
    console.log("\n未发现无效干预导致 τ 明显下降的案例。");
  }

  // ===== 分析 6: 优化建议 =====
  console.log("\n" + "=".repeat(70));
  console.log("总结与优化建议");
  console.log("=".repeat(70));

  // 找出性价比最差的类型
  const typeEfficiency = Object.entries(byType).map(([type, s]) => {
    const typeRecs = records.filter(r => r.type === type);
    const tauChanges = typeRecs
      .filter(r => r.tauBefore !== undefined && r.tauAfter !== undefined)
      .map(r => r.tauAfter! - r.tauBefore!);
    const avgTau = tauChanges.length > 0 ? tauChanges.reduce((a, b) => a + b, 0) / tauChanges.length : 0;
    const avgCost = s.totalTokens / s.total;
    return { type, rate: s.effective / s.total, avgTau, avgCost, totalTokens: s.totalTokens, wastedTokens: s.ineffectiveTokens };
  }).sort((a, b) => b.rate - a.rate);

  console.log("\n各干预类型性价比排名:");
  console.log("| 排名 | 类型 | 有效率 | 平均τ变化 | 平均成本 | 总浪费token |");
  console.log("|------|------|--------|-----------|----------|-------------|");
  typeEfficiency.forEach((t, i) => {
    console.log(`| ${i + 1} | ${t.type} | ${(t.rate * 100).toFixed(1)}% | ${t.avgTau >= 0 ? "+" : ""}${t.avgTau.toFixed(3)} | ${t.avgCost.toFixed(0)} | ${t.wastedTokens.toLocaleString()} |`);
  });

  const worstType = typeEfficiency[typeEfficiency.length - 1];
  const bestType = typeEfficiency[0];

  console.log(`\n优化建议:`);
  console.log(`  1. 停用 ${worstType.type}: 有效率仅 ${(worstType.rate * 100).toFixed(1)}%，浪费 ${worstType.wastedTokens.toLocaleString()} tokens`);
  console.log(`     停用后可节省 ${worstType.totalTokens.toLocaleString()} tokens (${((worstType.totalTokens / totalCost) * 100).toFixed(1)}% 总成本)`);
  console.log(`  2. 优先使用 ${bestType.type}: 有效率 ${(bestType.rate * 100).toFixed(1)}%，平均 τ 变化 ${bestType.avgTau >= 0 ? "+" : ""}${bestType.avgTau.toFixed(3)}`);
  console.log(`  3. 聚焦早期干预: 第3轮干预有效率 0%，应考虑在第2轮后停止干预`);
  console.log(`  4. 当前治理的 token 开销: ${totalCost.toLocaleString()} tokens / ${results.length} 实验 = ${Math.round(totalCost / results.length)} tokens/实验`);
  console.log(`     其中 ${((ineffectiveCost / totalCost) * 100).toFixed(1)}% 被浪费 (${ineffectiveCost.toLocaleString()} tokens)`);
}

// ============================================================================
// 主函数
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "data_crisis");

function main() {
  const fullResults = loadData(DATA_DIR, "crisis_full");
  const noneResults = loadData(DATA_DIR, "crisis_none");
  console.log(`加载 ${fullResults.length} 个 full 模式 + ${noneResults.length} 个 none 模式实验结果`);

  analyze(fullResults, noneResults);
}

main();
