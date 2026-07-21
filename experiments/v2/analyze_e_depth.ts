/**
 * E 组深度分析脚本：case study + 干预时间序列 + 成本分析
 *
 * 输出：
 *   1. 每个 run 的定性 case study（成功/失败模式）
 *   2. 干预时间序列可视化（ASCII）
 *   3. Token 成本经济性分析
 *
 * 运行：npx tsx experiments/v2/analyze_e_depth.ts
 */

import * as fs from "fs";
import * as path from "path";

interface EResult {
  runId: string;
  runIndex: number;
  kendallTau: number;
  totalRounds: number;
  totalUtterances: number;
  terminationReason: string;
  thermoHistory: Array<{ R: number; T: number; H: number; F: number; utteranceCount: number }>;
  finalBeliefs: Record<string, number>;
  maliciousAgentIds: string[];
  governanceTrace: Array<{
    roundNumber: number;
    governanceIssues: Array<{ type: string; agents?: string[] }>;
    interventions: Array<{ type: string; targetAgentId?: string; targetAgents?: string[]; applied: boolean }>;
    beliefChanges: Record<string, { old: number; new: number }>;
  }>;
  tokenUsage?: {
    byAgent: Record<string, { promptTokens: number; completionTokens: number; totalTokens: number; totalLatencyMs: number; callCount: number }>;
    total: { promptTokens: number; completionTokens: number; totalTokens: number; totalLatencyMs: number };
  };
}

function loadEGroup(): EResult[] {
  const dir = path.resolve(__dirname, "data_fraud_malicious");
  const results: EResult[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith("fraud_E_") || !f.endsWith(".json")) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (!data.terminationReason?.startsWith("error")) results.push(data);
    } catch { /* skip */ }
  }
  return results.sort((a, b) => a.runIndex - b.runIndex);
}

const results = loadEGroup();
console.log(`Loaded E group: n=${results.length}\n`);

// ============================================================================
// E3: Case Study — 成功/失败模式定性分析
// ============================================================================

console.log("=".repeat(70));
console.log("  E3: Case Study — 成功/失败模式");
console.log("=".repeat(70));

const successful = results.filter(r => r.kendallTau >= 0.6);
const middle = results.filter(r => r.kendallTau >= 0.4 && r.kendallTau < 0.6);
const failed = results.filter(r => r.kendallTau < 0.4);

console.log(`\n成功组 (τ≥0.6): n=${successful.length}`);
for (const r of successful) {
  const totalInterv = r.governanceTrace.reduce((s, t) => s + t.interventions.length, 0);
  const hitsMalicious = r.governanceTrace.reduce((s, t) =>
    s + t.interventions.filter(i =>
      i.targetAgentId === r.maliciousAgentIds[0] ||
      (i.targetAgents && i.targetAgents.includes(r.maliciousAgentIds[0]))
    ).length, 0);
  console.log(`  run#${r.runIndex}: τ=${r.kendallTau.toFixed(3)}, 轮次=${r.totalRounds}, 干预=${totalInterv}(命中${hitsMalicious}), 终止=${r.terminationReason}`);
}

console.log(`\n中间组 (0.4≤τ<0.6): n=${middle.length}`);
for (const r of middle) {
  const totalInterv = r.governanceTrace.reduce((s, t) => s + t.interventions.length, 0);
  console.log(`  run#${r.runIndex}: τ=${r.kendallTau.toFixed(3)}, 轮次=${r.totalRounds}, 干预=${totalInterv}, 终止=${r.terminationReason}`);
}

console.log(`\n失败组 (τ<0.4): n=${failed.length}`);
for (const r of failed) {
  const totalInterv = r.governanceTrace.reduce((s, t) => s + t.interventions.length, 0);
  console.log(`  run#${r.runIndex}: τ=${r.kendallTau.toFixed(3)}, 轮次=${r.totalRounds}, 干预=${totalInterv}, 终止=${r.terminationReason}`);
}

// 典型案例深度分析
console.log("\n--- 典型成功案例（最高 τ）---");
const bestCase = results.reduce((a, b) => a.kendallTau > b.kendallTau ? a : b);
console.log(`run#${bestCase.runIndex}: τ=${bestCase.kendallTau.toFixed(3)}`);
console.log(`  恶意 agent: ${bestCase.maliciousAgentIds[0]}, 最终信念: ${bestCase.finalBeliefs[bestCase.maliciousAgentIds[0]]?.toFixed(3)}`);
console.log(`  诚实 agent 信念:`);
for (const [id, b] of Object.entries(bestCase.finalBeliefs)) {
  if (!bestCase.maliciousAgentIds.includes(id)) {
    console.log(`    ${id}: ${b.toFixed(3)}`);
  }
}
console.log(`  终止: ${bestCase.terminationReason}, 轮次: ${bestCase.totalRounds}`);

console.log("\n--- 典型失败案例（最低 τ）---");
const worstCase = results.reduce((a, b) => a.kendallTau < b.kendallTau ? a : b);
console.log(`run#${worstCase.runIndex}: τ=${worstCase.kendallTau.toFixed(3)}`);
console.log(`  恶意 agent: ${worstCase.maliciousAgentIds[0]}, 最终信念: ${worstCase.finalBeliefs[worstCase.maliciousAgentIds[0]]?.toFixed(3)}`);
console.log(`  诚实 agent 信念:`);
for (const [id, b] of Object.entries(worstCase.finalBeliefs)) {
  if (!worstCase.maliciousAgentIds.includes(id)) {
    console.log(`    ${id}: ${b.toFixed(3)}`);
  }
}
console.log(`  终止: ${worstCase.terminationReason}, 轮次: ${worstCase.totalRounds}`);
console.log(`  干预序列:`);
for (const t of worstCase.governanceTrace) {
  if (t.interventions.length > 0) {
    const types = t.interventions.map(i => `${i.type}(${i.targetAgentId || i.targetAgents?.join('+') || '?'})`).join(', ');
    console.log(`    轮${t.roundNumber}: ${types}`);
  }
}

// ============================================================================
// E5: 干预时间序列可视化
// ============================================================================

console.log("\n" + "=".repeat(70));
console.log("  E5: 干预时间序列可视化");
console.log("=".repeat(70));

console.log("\n图例: R=reduce_weight, F=force_reflection, I=introduce_diversity, C=continue_discussion");
console.log("      * =命中恶意a1, . =命中诚实agent, 空格=无干预\n");

for (const r of results) {
  console.log(`run#${r.runIndex} (τ=${r.kendallTau.toFixed(3)}):`);
  const maxRound = Math.max(...r.governanceTrace.map(t => t.roundNumber));
  for (const t of r.governanceTrace) {
    let line = `  轮${String(t.roundNumber).padStart(2)}: `;
    if (t.interventions.length === 0) {
      line += "(无干预)";
    } else {
      const symbols = t.interventions.map(i => {
        const code = i.type === "reduce_weight" ? "R" :
                     i.type === "force_reflection" ? "F" :
                     i.type === "introduce_diversity" ? "I" :
                     i.type === "continue_discussion" ? "C" : "?";
        const isMalicious = i.targetAgentId === r.maliciousAgentIds[0] ||
                           (i.targetAgents && i.targetAgents.includes(r.maliciousAgentIds[0]));
        return code + (isMalicious ? "*" : ".");
      });
      line += symbols.join(" ");
    }
    // 加上恶意 agent 信念变化
    const a1Change = t.beliefChanges[r.maliciousAgentIds[0]];
    if (a1Change) {
      const delta = a1Change.new - a1Change.old;
      line += `  [a1: ${a1Change.old.toFixed(2)}→${a1Change.new.toFixed(2)} (${delta >= 0 ? "+" : ""}${delta.toFixed(2)})]`;
    }
    console.log(line);
  }
  console.log("");
}

// ============================================================================
// P1: Token 成本经济性分析
// ============================================================================

console.log("=".repeat(70));
console.log("  P1: Token 成本经济性分析");
console.log("=".repeat(70));

const runs = results.filter(r => r.tokenUsage);
console.log(`\n有 token 数据的 run: ${runs.length}/${results.length}`);

if (runs.length > 0) {
  const totalTokens = runs.reduce((s, r) => s + (r.tokenUsage?.total.totalTokens || 0), 0);
  const totalLatency = runs.reduce((s, r) => s + (r.tokenUsage?.total.totalLatencyMs || 0), 0);
  const totalInterv = runs.reduce((s, r) => s + r.governanceTrace.reduce((ss, t) => ss + t.interventions.length, 0), 0);
  const totalUtter = runs.reduce((s, r) => s + r.totalUtterances, 0);

  console.log(`\n汇总（${runs.length} runs）:`);
  console.log(`  总 token: ${totalTokens.toLocaleString()}`);
  console.log(`  总延迟: ${(totalLatency / 1000).toFixed(1)}s`);
  console.log(`  总干预次数: ${totalInterv}`);
  console.log(`  总发言数: ${totalUtter}`);
  console.log(`  平均每 run token: ${Math.round(totalTokens / runs.length).toLocaleString()}`);
  console.log(`  平均每干预 token: ${Math.round(totalTokens / totalInterv).toLocaleString()}`);
  console.log(`  平均每发言 token: ${Math.round(totalTokens / totalUtter).toLocaleString()}`);

  // 按 agent 分摊
  console.log(`\n按 agent 分摊（平均每 run）:`);
  const agentStats: Record<string, { tokens: number; calls: number; latency: number }> = {};
  for (const r of runs) {
    if (!r.tokenUsage?.byAgent) continue;
    for (const [aid, s] of Object.entries(r.tokenUsage.byAgent)) {
      if (!agentStats[aid]) agentStats[aid] = { tokens: 0, calls: 0, latency: 0 };
      agentStats[aid].tokens += s.totalTokens;
      agentStats[aid].calls += s.callCount;
      agentStats[aid].latency += s.totalLatencyMs;
    }
  }
  for (const [aid, s] of Object.entries(agentStats)) {
    const isMalicious = runs[0].maliciousAgentIds.includes(aid);
    console.log(`  ${aid}${isMalicious ? "(恶意)" : "      "}: ${(s.tokens / runs.length).toFixed(0).padStart(7)} tokens, ${(s.calls / runs.length).toFixed(0).padStart(3)} calls, ${(s.latency / runs.length / 1000).toFixed(1)}s`);
  }

  // 成功 vs 失败成本对比
  console.log(`\n成功组 vs 失败组成本对比:`);
  const succCost = successful.filter(r => r.tokenUsage);
  const failCost = failed.filter(r => r.tokenUsage);
  if (succCost.length > 0 && failCost.length > 0) {
    const succAvg = succCost.reduce((s, r) => s + (r.tokenUsage?.total.totalTokens || 0), 0) / succCost.length;
    const failAvg = failCost.reduce((s, r) => s + (r.tokenUsage?.total.totalTokens || 0), 0) / failCost.length;
    console.log(`  成功组 (n=${succCost.length}): 平均 ${Math.round(succAvg).toLocaleString()} tokens/run`);
    console.log(`  失败组 (n=${failCost.length}): 平均 ${Math.round(failAvg).toLocaleString()} tokens/run`);
    console.log(`  差异: ${failAvg > succAvg ? "失败组更贵" : "成功组更贵"} (${Math.abs(failAvg - succAvg).toFixed(0).toLocaleString()} tokens)`);
  }
}

console.log("\n分析完成。");
