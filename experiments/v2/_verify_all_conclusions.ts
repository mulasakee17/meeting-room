/**
 * 综合审查脚本：逐个核实之前关于恶意 agent 实验的所有结论
 *
 * 待核实结论：
 *   [C1] force_reflection 让 a1 信念反向强化 +0.68（已单独核实：不成立）
 *   [C2] reduce_weight 是唯一有效干预（48% 抑制率，avg Δa1=-0.13）
 *   [C3] "更多干预 = 更低 τ"（成功组 τ≥0.6 平均 4.0 次干预，失败组 τ<0.4 平均 9.5 次）
 *   [C4] 47% 命中恶意 agent，53% 附带损害（a2 受附带最多 16 次）
 *   [C5] 检测器分布：authority_bias 66%, premature_consensus 19%, polarization 14%, echo_chamber 1%
 *
 * 数据来源：experiments/v2/data_fraud_malicious/fraud_E_malicious_*.json (n=10)
 *
 * 数据局限（必须在每个结论中标注）:
 *   - beliefChanges 是顶层 belief（-1到1整体倾向），非 itemBeliefs[线索3]
 *   - run_malicious.ts 未保存 roundResults，无法追溯 itemBeliefs 轨迹
 *   - E 组 n=10，样本量小
 *   - "命中恶意 agent" 判定基于 targetAgentId/targetAgents 字段
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// 类型定义
// ============================================================================

interface GovernanceTraceRound {
  roundNumber: number;
  governanceIssues: Array<{
    type: string;
    severity: string;
    description: string;
    agents?: string[];
  }>;
  interventions: Array<{
    type: string;
    targetAgentId?: string;
    targetAgents?: string[];
    effect: string;
    applied: boolean;
    round?: number;
  }>;
  beliefChanges: Record<string, { old: number; new: number; reason: string }>;
  converged: boolean;
}

interface MaliciousResult {
  runId: string;
  runIndex: number;
  kendallTau: number;
  totalRounds: number;
  totalUtterances: number;
  finalBeliefs: Record<string, number>;
  maliciousAgentIds: string[];
  governanceEnabled: boolean;
  governanceTrace?: GovernanceTraceRound[];
}

const DATA_DIR = path.resolve(__dirname, "data_fraud_malicious");

function loadEGroup(): MaliciousResult[] {
  const results: MaliciousResult[] = [];
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (!f.startsWith("fraud_E_malicious_") || !f.endsWith(".json")) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8")) as MaliciousResult;
      if (data.governanceTrace && !data.terminationReason?.startsWith("error")) {
        results.push(data);
      }
    } catch { /* skip */ }
  }
  return results.sort((a, b) => a.runIndex - b.runIndex);
}

// ============================================================================
// [C2] 核实：reduce_weight 是唯一有效干预
// 原结论：48% 抑制率，avg Δa1=-0.13
// ============================================================================

function verifyC2_reduceWeight(results: MaliciousResult[]): void {
  console.log("\n" + "=".repeat(70));
  console.log("  [C2] 核实: reduce_weight 是唯一有效干预");
  console.log("  原结论: 48% 抑制率, avg Δa1=-0.13");
  console.log("=".repeat(70));

  let totalRW = 0;                  // reduce_weight 命中 a1 总次数
  let suppressed = 0;               // a1 信念下降次数
  const deltas: number[] = [];      // a1 信念变化
  const otherInterventionsCount: Record<string, number> = {}; // 同轮其他干预

  for (const r of results) {
    const maliciousId = r.maliciousAgentIds[0];
    if (!r.governanceTrace) continue;

    for (const round of r.governanceTrace) {
      if (!round.interventions) continue;
      const applied = round.interventions.filter(i => i.applied);
      const rw = applied.find(i =>
        i.type === "reduce_weight" &&
        (i.targetAgentId === maliciousId ||
         (i.targetAgents && i.targetAgents.includes(maliciousId)))
      );
      if (!rw) continue;

      totalRW++;
      const change = round.beliefChanges?.[maliciousId];
      if (!change) continue;

      const delta = change.new - change.old;
      deltas.push(delta);
      if (delta < -0.05) suppressed++;

      // 统计同轮其他干预
      const others = applied.filter(i => i !== rw);
      for (const o of others) {
        otherInterventionsCount[o.type] = (otherInterventionsCount[o.type] || 0) + 1;
      }
    }
  }

  console.log(`  reduce_weight 命中 a1 次数: ${totalRW}`);
  console.log(`  a1 信念下降次数: ${suppressed}`);
  console.log(`  抑制率: ${totalRW > 0 ? (suppressed/totalRW*100).toFixed(1) : 0}%`);
  console.log(`  原结论声称: 48%`);

  if (deltas.length > 0) {
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    console.log(`  平均 Δa1: ${avg >= 0 ? "+" : ""}${avg.toFixed(4)}`);
    console.log(`  原结论声称: -0.13`);
  }

  console.log(`\n  同轮其他干预统计:`);
  for (const [type, count] of Object.entries(otherInterventionsCount)) {
    console.log(`    ${type}: ${count} 次`);
  }

  const mixedRate = totalRW > 0
    ? Object.values(otherInterventionsCount).reduce((a, b) => a + b, 0) / totalRW
    : 0;
  console.log(`\n  混合率: 每个 reduce_weight 平均伴随 ${mixedRate.toFixed(2)} 个其他干预`);

  // 判定
  const suppressRate = totalRW > 0 ? suppressed/totalRW : 0;
  const avgDelta = deltas.length > 0
    ? deltas.reduce((a, b) => a + b, 0) / deltas.length
    : 0;

  console.log("\n  审查判定:");
  if (mixedRate > 0.5) {
    console.log(`  ⚠️ 归因错误: reduce_weight ${100*(1-0)}% 的轮次都伴随其他干预，`);
    console.log(`     无法将 a1 信念变化归因给 reduce_weight 单独效果。`);
  }
  if (Math.abs(suppressRate - 0.48) > 0.1) {
    console.log(`  ⚠️ 数值偏差: 实际抑制率 ${suppressRate.toFixed(2)} ≠ 原声称 0.48`);
  }
  if (avgDelta > 0) {
    console.log(`  ❌ 方向错误: 平均 Δa1 = ${avgDelta.toFixed(4)} > 0，`);
    console.log(`     reduce_weight 不仅没压制 a1，反而 a1 信念上升了。`);
    console.log(`     原结论"reduce_weight 是唯一有效干预"不成立。`);
  } else if (avgDelta < -0.05) {
    console.log(`  ✅ 方向成立: 平均 Δa1 = ${avgDelta.toFixed(4)} < 0，`);
    console.log(`     reduce_weight 确实压制了 a1，但数值需校正。`);
  } else {
    console.log(`  ⚠️ 效果微弱: 平均 Δa1 = ${avgDelta.toFixed(4)} 接近 0。`);
  }

  console.log("\n  数据局限:");
  console.log("    - beliefChanges 是顶层 belief，非 itemBeliefs[线索3]");
  console.log("    - 同轮多干预混合，无法分离 reduce_weight 独立效果");
}

// ============================================================================
// [C3] 核实: "更多干预 = 更低 τ"
// 原结论: 成功组(τ≥0.6) 平均 4.0 次, 失败组(τ<0.4) 平均 9.5 次
// ============================================================================

function verifyC3_interventionTauCorrelation(results: MaliciousResult[]): void {
  console.log("\n" + "=".repeat(70));
  console.log("  [C3] 核实: '更多干预 = 更低 τ'");
  console.log("  原结论: 成功组(τ≥0.6) avg 4.0, 失败组(τ<0.4) avg 9.5");
  console.log("=".repeat(70));

  // 每个实验的总干预次数
  const perRun: Array<{runId: string; tau: number; totalInterventions: number; totalIssues: number}> = [];
  for (const r of results) {
    let totalInterventions = 0;
    let totalIssues = 0;
    if (r.governanceTrace) {
      for (const round of r.governanceTrace) {
        totalInterventions += (round.interventions || []).filter(i => i.applied).length;
        totalIssues += (round.governanceIssues || []).length;
      }
    }
    perRun.push({
      runId: r.runId,
      tau: r.kendallTau,
      totalInterventions,
      totalIssues,
    });
  }

  console.log("  每个实验的 τ 与干预次数:");
  console.log("    runId                              τ       interventions  issues");
  for (const p of perRun) {
    console.log(`    ${p.runId.padEnd(34)} ${p.tau.toFixed(4).padStart(7)}  ${String(p.totalInterventions).padStart(13)}  ${String(p.totalIssues).padStart(6)}`);
  }

  // 按原结论的分组方式
  const successGroup = perRun.filter(p => p.tau >= 0.6);
  const failureGroup = perRun.filter(p => p.tau < 0.4);
  const middleGroup = perRun.filter(p => p.tau >= 0.4 && p.tau < 0.6);

  console.log(`\n  分组统计:`);
  console.log(`    成功组 (τ≥0.6): n=${successGroup.length}, avg interventions=${successGroup.length > 0 ? (successGroup.reduce((a,b)=>a+b.totalInterventions,0)/successGroup.length).toFixed(2) : "N/A"}`);
  console.log(`    中间组 (0.4≤τ<0.6): n=${middleGroup.length}, avg interventions=${middleGroup.length > 0 ? (middleGroup.reduce((a,b)=>a+b.totalInterventions,0)/middleGroup.length).toFixed(2) : "N/A"}`);
  console.log(`    失败组 (τ<0.4): n=${failureGroup.length}, avg interventions=${failureGroup.length > 0 ? (failureGroup.reduce((a,b)=>a+b.totalInterventions,0)/failureGroup.length).toFixed(2) : "N/A"}`);

  console.log(`\n  原结论声称: 成功组 avg 4.0, 失败组 avg 9.5`);

  // Pearson 相关
  if (perRun.length >= 3) {
    const taus = perRun.map(p => p.tau);
    const interventions = perRun.map(p => p.totalInterventions);
    const meanT = taus.reduce((a,b)=>a+b,0) / taus.length;
    const meanI = interventions.reduce((a,b)=>a+b,0) / interventions.length;
    let num = 0, denT = 0, denI = 0;
    for (let i = 0; i < perRun.length; i++) {
      num += (taus[i] - meanT) * (interventions[i] - meanI);
      denT += (taus[i] - meanT) ** 2;
      denI += (interventions[i] - meanI) ** 2;
    }
    const corr = (denT === 0 || denI === 0) ? 0 : num / Math.sqrt(denT * denI);
    console.log(`\n  Pearson 相关系数 r(τ, interventions) = ${corr.toFixed(4)}`);
    console.log(`  (负相关支持原结论，正相关反驳原结论，|r|<0.3 视为无显著相关)`);
  }

  console.log("\n  审查判定:");
  const successAvg = successGroup.length > 0 ? successGroup.reduce((a,b)=>a+b.totalInterventions,0)/successGroup.length : -1;
  const failureAvg = failureGroup.length > 0 ? failureGroup.reduce((a,b)=>a+b.totalInterventions,0)/failureGroup.length : -1;

  if (successGroup.length === 0 || failureGroup.length === 0) {
    console.log(`  ⚠️ 样本不足: 成功组 n=${successGroup.length}, 失败组 n=${failureGroup.length}`);
    console.log(`     无法复现原结论的分组对比。`);
  } else if (successAvg < failureAvg) {
    console.log(`  ✅ 方向成立: 成功组(${successAvg.toFixed(2)}) < 失败组(${failureAvg.toFixed(2)})`);
    if (Math.abs(successAvg - 4.0) > 1 || Math.abs(failureAvg - 9.5) > 2) {
      console.log(`  ⚠️ 数值偏差: 实际 ${successAvg.toFixed(2)} vs ${failureAvg.toFixed(2)}, 原声称 4.0 vs 9.5`);
    }
  } else {
    console.log(`  ❌ 方向错误: 成功组(${successAvg.toFixed(2)}) ≥ 失败组(${failureAvg.toFixed(2)})`);
    console.log(`     原结论"更多干预 = 更低τ"不成立。`);
  }

  console.log("\n  数据局限:");
  console.log("    - n=10 样本量小，分组对比统计功效低");
  console.log("    - 相关性 ≠ 因果性：更多干预可能是 τ 低的'症状'而非'原因'");
  console.log("    - 治理检测器在 τ 低时更易触发（因为信念分歧大），可能反向因果");
}

// ============================================================================
// [C4] 核实: 47% 命中恶意 agent, 53% 附带损害
// 原结论: a2 受附带最多 16 次
// ============================================================================

function verifyC4_hitRate(results: MaliciousResult[]): void {
  console.log("\n" + "=".repeat(70));
  console.log("  [C4] 核实: 47% 命中恶意 agent, 53% 附带损害");
  console.log("  原结论: a2 受附带损害最多 16 次");
  console.log("=".repeat(70));

  let totalApplied = 0;
  let hitMalicious = 0;
  const collateralByAgent: Record<string, number> = {};

  for (const r of results) {
    const maliciousSet = new Set(r.maliciousAgentIds);
    if (!r.governanceTrace) continue;

    for (const round of r.governanceTrace) {
      if (!round.interventions) continue;
      for (const i of round.interventions) {
        if (!i.applied) continue;
        totalApplied++;

        const targets = i.targetAgentId
          ? [i.targetAgentId]
          : (i.targetAgents || []);

        // 判定是否命中恶意 agent
        const hitsMalicious = targets.some(t => maliciousSet.has(t));
        if (hitsMalicious) {
          hitMalicious++;
        }

        // 统计附带损害（非恶意 agent 被打）
        for (const t of targets) {
          if (!maliciousSet.has(t)) {
            collateralByAgent[t] = (collateralByAgent[t] || 0) + 1;
          }
        }
      }
    }
  }

  const hitRate = totalApplied > 0 ? hitMalicious / totalApplied : 0;
  const collateralRate = 1 - hitRate;

  console.log(`  总干预应用次数: ${totalApplied}`);
  console.log(`  命中恶意 agent 次数: ${hitMalicious}`);
  console.log(`  命中率: ${(hitRate*100).toFixed(1)}% (原结论声称 47%)`);
  console.log(`  附带损害率: ${(collateralRate*100).toFixed(1)}% (原结论声称 53%)`);

  console.log(`\n  附带损害按 agent 分布:`);
  const sortedCollateral = Object.entries(collateralByAgent).sort((a,b) => b[1] - a[1]);
  for (const [agent, count] of sortedCollateral) {
    console.log(`    ${agent}: ${count} 次`);
  }
  console.log(`  原结论声称: a2 受附带最多 16 次`);

  console.log("\n  审查判定:");
  if (Math.abs(hitRate - 0.47) > 0.1) {
    console.log(`  ⚠️ 数值偏差: 实际命中率 ${hitRate.toFixed(2)} ≠ 原声称 0.47`);
  } else {
    console.log(`  ✅ 命中率数值接近: ${hitRate.toFixed(2)} vs 0.47`);
  }

  const maxCollateralAgent = sortedCollateral[0]?.[0];
  const maxCollateralCount = sortedCollateral[0]?.[1];
  if (maxCollateralAgent && maxCollateralCount !== 16) {
    console.log(`  ⚠️ 附带损害最多 agent: ${maxCollateralAgent}=${maxCollateralCount} 次 (原声称 a2=16)`);
  } else if (maxCollateralAgent === "a2" && maxCollateralCount === 16) {
    console.log(`  ✅ 附带损害最多 agent: a2=16 次，与原结论一致`);
  }

  console.log("\n  数据局限:");
  console.log("    - '命中恶意 agent' 判定基于 targetAgentId/targetAgents 字段");
  console.log("    - 'force_reflection' 常以多 agent 为目标，命中恶意 agent 时也附带打其他 agent");
  console.log("    - '命中' ≠ '有效'：reduce_weight 命中但 a1 信念仍可能上升");
}

// ============================================================================
// [C5] 核实: 检测器分布
// 原结论: authority_bias 66%, premature_consensus 19%, polarization 14%, echo_chamber 1%
// ============================================================================

function verifyC5_detectorDistribution(results: MaliciousResult[]): void {
  console.log("\n" + "=".repeat(70));
  console.log("  [C5] 核实: 检测器分布");
  console.log("  原结论: authority_bias 66%, premature_consensus 19%, polarization 14%, echo_chamber 1%");
  console.log("=".repeat(70));

  const detectorCount: Record<string, number> = {};
  let totalDetections = 0;

  for (const r of results) {
    if (!r.governanceTrace) continue;
    for (const round of r.governanceTrace) {
      if (!round.governanceIssues) continue;
      for (const issue of round.governanceIssues) {
        const type = issue.type;
        detectorCount[type] = (detectorCount[type] || 0) + 1;
        totalDetections++;
      }
    }
  }

  console.log(`  总检测次数: ${totalDetections}`);
  console.log(`\n  检测器分布:`);
  const sorted = Object.entries(detectorCount).sort((a,b) => b[1] - a[1]);
  for (const [type, count] of sorted) {
    const pct = totalDetections > 0 ? (count/totalDetections*100).toFixed(1) : "0";
    console.log(`    ${type}: ${count} (${pct}%)`);
  }

  console.log(`\n  原结论声称:`);
  console.log(`    authority_bias: 66%, premature_consensus: 19%, polarization: 14%, echo_chamber: 1%`);

  console.log("\n  审查判定:");
  const claimed = { authority_bias: 0.66, premature_consensus: 0.19, polarization: 0.14, echo_chamber: 0.01 };
  let allMatch = true;
  for (const [type, claimedPct] of Object.entries(claimed)) {
    const actualCount = detectorCount[type] || 0;
    const actualPct = totalDetections > 0 ? actualCount/totalDetections : 0;
    if (Math.abs(actualPct - claimedPct) > 0.1) {
      console.log(`  ⚠️ ${type}: 实际 ${(actualPct*100).toFixed(1)}% ≠ 原声称 ${(claimedPct*100).toFixed(1)}%`);
      allMatch = false;
    }
  }
  if (allMatch) {
    console.log(`  ✅ 分布与原结论基本一致`);
  }

  console.log("\n  数据局限:");
  console.log("    - governanceIssues 可能含重复检测（同一问题被多个检测器识别）");
  console.log("    - 检测次数 ≠ 检测轮次：同一轮可能触发多个检测器");
}

// ============================================================================
// 主函数 + 综合结论
// ============================================================================

function main() {
  const results = loadEGroup();
  console.log("=".repeat(70));
  console.log("  恶意 agent 实验结论综合审查");
  console.log(`  样本: E 组 n=${results.length}`);
  console.log("=".repeat(70));

  // 列出每个实验的基本信息
  console.log("\n  实验概览:");
  console.log("    runId                              τ       rounds  utterances  interventions");
  for (const r of results) {
    let intv = 0;
    if (r.governanceTrace) {
      for (const round of r.governanceTrace) {
        intv += (round.interventions || []).filter(i => i.applied).length;
      }
    }
    console.log(`    ${r.runId.padEnd(34)} ${r.kendallTau.toFixed(4).padStart(7)}  ${String(r.totalRounds).padStart(6)}  ${String(r.totalUtterances).padStart(10)}  ${String(intv).padStart(13)}`);
  }

  // 逐个核实
  verifyC2_reduceWeight(results);
  verifyC3_interventionTauCorrelation(results);
  verifyC4_hitRate(results);
  verifyC5_detectorDistribution(results);

  // 综合结论
  console.log("\n" + "=".repeat(70));
  console.log("  综合审查结论");
  console.log("=".repeat(70));
  console.log("  [C1] force_reflection 反向强化 +0.68     → ❌ 不成立（归因错误+数值错）");
  console.log("  [C2] reduce_weight 唯一有效干预 48%      → 见上 (待判定)");
  console.log("  [C3] 更多干预=更低τ (4.0 vs 9.5)         → 见上 (待判定)");
  console.log("  [C4] 47% 命中, 53% 附带, a2=16           → 见上 (待判定)");
  console.log("  [C5] 检测器分布 66/19/14/1               → 见上 (待判定)");
  console.log("\n  数据局限（适用于所有结论）:");
  console.log("    1. beliefChanges 是顶层 belief，非 itemBeliefs[线索3]");
  console.log("    2. n=10 样本量小，统计功效不足");
  console.log("    3. 同轮多干预混合，无法分离单干预因果效果");
  console.log("    4. E 组无对照（C 组无 governanceTrace），无法归因");
}

main();
