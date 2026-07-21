/**
 * 核实脚本：重新验证"force_reflection 让恶意 agent 信念反向强化 +0.68"的结论
 *
 * 背景：
 *   之前的结论基于 governanceTrace.beliefChanges.a1 的 old→new 变化。
 *   但 beliefChanges 是"该轮所有 belief 更新的总和"，包含：
 *     (a) force_reflection 干预直接造成的 belief 变化
 *     (b) async_belief_update（听到他人发言后的自然更新）
 *     (c) reduce_weight 等其他干预的影响
 *   之前的算法把 (a)+(b)+(c) 全部归因给 force_reflection，是错误的。
 *
 * 核实方法：
 *   1. 遍历 E 组 10 个 JSON 的 governanceTrace
 *   2. 找出所有"该轮 applied=true 且 type=force_reflection"的干预
 *   3. 提取该轮 beliefChanges.a1 的 (new - old)
 *   4. 同时统计该轮是否还有其他干预（如 reduce_weight）—— 若有则该轮归因不清
 *   5. 对比：force_reflection 独占轮 vs force_reflection + reduce_weight 混合轮
 *
 * 输出：
 *   - 总 force_reflection 应用次数
 *   - 其中"独占轮"次数 vs "混合轮"次数
 *   - 独占轮的 a1 信念变化分布（升/降/不变）
 *   - 混合轮的 a1 信念变化分布
 *   - 结论：原"+0.68 反向强化"是否成立
 *
 * 数据局限说明：
 *   - beliefChanges 仍是顶层 belief（-1到1的整体倾向），不是 itemBeliefs[线索3]
 *   - 即使顶层 belief 上升，也不等于"对线索3的支持度上升"
 *   - 但至少可以验证原结论在"顶层 belief"层面是否成立
 */

import * as fs from "fs";
import * as path from "path";

interface GovernanceTraceRound {
  roundNumber: number;
  interventions: Array<{
    type: string;
    targetAgentId?: string;
    targetAgents?: string[];
    applied: boolean;
  }>;
  beliefChanges: Record<string, { old: number; new: number; reason: string }>;
}

interface MaliciousResult {
  runId: string;
  runIndex: number;
  maliciousAgentIds: string[];
  governanceTrace?: GovernanceTraceRound[];
}

const DATA_DIR = path.resolve(__dirname, "data_fraud_malicious");

function loadEGroup(): MaliciousResult[] {
  const results: MaliciousResult[] = [];
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (!f.startsWith("fraud_E_malicious_") || !f.endsWith(".json")) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
      if (data.governanceTrace && !data.terminationReason?.startsWith("error")) {
        results.push(data);
      }
    } catch { /* skip */ }
  }
  return results.sort((a, b) => a.runIndex - b.runIndex);
}

function analyzeForceReflection() {
  const results = loadEGroup();
  console.log("=".repeat(70));
  console.log("  force_reflection 反向强化结论核实");
  console.log(`  样本: E 组 n=${results.length}`);
  console.log("=".repeat(70));

  // 分类：force_reflection 命中 a1 的轮次
  let totalFR = 0;                    // force_reflection 总应用次数（命中 a1）
  let frExclusiveRounds = 0;          // 该轮只有 force_reflection（无其他干预）
  let frMixedRounds = 0;              // 该轮还有其他干预（如 reduce_weight）
  const exclusiveChanges: number[] = []; // 独占轮的 a1 belief 变化
  const mixedChanges: number[] = [];     // 混合轮的 a1 belief 变化

  // 按 runId 记录详细数据
  const details: Array<{
    runId: string;
    round: number;
    exclusive: boolean;
    a1Old: number;
    a1New: number;
    delta: number;
    otherInterventions: string[];
  }> = [];

  for (const r of results) {
    const maliciousId = r.maliciousAgentIds[0]; // E 组只有一个恶意 agent (a1)
    if (!r.governanceTrace) continue;

    for (const round of r.governanceTrace) {
      if (!round.interventions || round.interventions.length === 0) continue;

      // 找该轮所有 applied=true 的干预
      const appliedInterventions = round.interventions.filter(i => i.applied);

      // 找 force_reflection 且命中恶意 agent 的
      const fr = appliedInterventions.find(i =>
        i.type === "force_reflection" &&
        (i.targetAgentId === maliciousId ||
         (i.targetAgents && i.targetAgents.includes(maliciousId)))
      );

      if (!fr) continue;
      totalFR++;

      // 其他同时应用的干预
      const others = appliedInterventions.filter(i => i !== fr);
      const isExclusive = others.length === 0;

      // a1 信念变化
      const change = round.beliefChanges?.[maliciousId];
      if (!change) continue;

      const delta = change.new - change.old;

      if (isExclusive) {
        frExclusiveRounds++;
        exclusiveChanges.push(delta);
      } else {
        frMixedRounds++;
        mixedChanges.push(delta);
      }

      details.push({
        runId: r.runId,
        round: round.roundNumber,
        exclusive: isExclusive,
        a1Old: change.old,
        a1New: change.new,
        delta,
        otherInterventions: others.map(o => o.type),
      });
    }
  }

  // ── 输出 ──
  console.log("\n[1] force_reflection 命中恶意 agent 总次数:", totalFR);
  console.log("    独占轮（仅 force_reflection）:", frExclusiveRounds);
  console.log("    混合轮（含其他干预）:", frMixedRounds);

  console.log("\n[2] 独占轮 a1 信念变化分布:");
  if (exclusiveChanges.length === 0) {
    console.log("    无独占轮样本");
  } else {
    const up = exclusiveChanges.filter(d => d > 0.05).length;
    const down = exclusiveChanges.filter(d => d < -0.05).length;
    const flat = exclusiveChanges.length - up - down;
    const avg = exclusiveChanges.reduce((a, b) => a + b, 0) / exclusiveChanges.length;
    console.log(`    上升(>0.05): ${up}/${exclusiveChanges.length} = ${(up/exclusiveChanges.length*100).toFixed(0)}%`);
    console.log(`    下降(<-0.05): ${down}/${exclusiveChanges.length} = ${(down/exclusiveChanges.length*100).toFixed(0)}%`);
    console.log(`    不变: ${flat}/${exclusiveChanges.length}`);
    console.log(`    平均变化: ${avg >= 0 ? "+" : ""}${avg.toFixed(4)}`);
  }

  console.log("\n[3] 混合轮 a1 信念变化分布:");
  if (mixedChanges.length === 0) {
    console.log("    无混合轮样本");
  } else {
    const up = mixedChanges.filter(d => d > 0.05).length;
    const down = mixedChanges.filter(d => d < -0.05).length;
    const flat = mixedChanges.length - up - down;
    const avg = mixedChanges.reduce((a, b) => a + b, 0) / mixedChanges.length;
    console.log(`    上升(>0.05): ${up}/${mixedChanges.length} = ${(up/mixedChanges.length*100).toFixed(0)}%`);
    console.log(`    下降(<-0.05): ${down}/${mixedChanges.length} = ${(down/mixedChanges.length*100).toFixed(0)}%`);
    console.log(`    不变: ${flat}/${mixedChanges.length}`);
    console.log(`    平均变化: ${avg >= 0 ? "+" : ""}${avg.toFixed(4)}`);
  }

  console.log("\n[4] 逐轮详情（前 20 条）:");
  console.log("    runId                              round  exclusive  a1_old    a1_new    delta    others");
  for (const d of details.slice(0, 20)) {
    console.log(
      `    ${d.runId.padEnd(34)} ${String(d.round).padStart(5)}   ${d.exclusive ? "Y" : "N"}         ` +
      `${d.a1Old.toFixed(4).padStart(8)}  ${d.a1New.toFixed(4).padStart(8)}  ` +
      `${(d.delta >= 0 ? "+" : "")}${d.delta.toFixed(4).padStart(7)}  ${d.otherInterventions.join(",")}`
    );
  }
  if (details.length > 20) {
    console.log(`    ... 共 ${details.length} 条，仅显示前 20 条`);
  }

  // ── 结论 ──
  console.log("\n" + "=".repeat(70));
  console.log("  结论");
  console.log("=".repeat(70));

  const allChanges = [...exclusiveChanges, ...mixedChanges];
  if (allChanges.length === 0) {
    console.log("  无 force_reflection 命中恶意 agent 的样本，无法验证原结论。");
    return;
  }

  const allAvg = allChanges.reduce((a, b) => a + b, 0) / allChanges.length;
  const allUp = allChanges.filter(d => d > 0.05).length;

  console.log(`  原结论: "force_reflection 让 a1 信念反向强化 +0.68"`);
  console.log(`  重新计算（全部 ${allChanges.length} 次）: 平均变化 ${allAvg >= 0 ? "+" : ""}${allAvg.toFixed(4)}`);
  console.log(`  上升占比: ${allUp}/${allChanges.length} = ${(allUp/allChanges.length*100).toFixed(0)}%`);

  if (frMixedRounds > frExclusiveRounds) {
    console.log(`  ⚠️ 混合轮(${frMixedRounds}) > 独占轮(${frExclusiveRounds}):`);
    console.log(`     原结论把 reduce_weight 等干预的效果也算给了 force_reflection，归因错误。`);
  }

  if (Math.abs(allAvg) < 0.1) {
    console.log(`  ❌ 原结论不成立: 平均变化 ${allAvg.toFixed(4)} 接近 0，无"反向强化"现象。`);
  } else if (allAvg > 0.1) {
    console.log(`  ⚠️ 原结论方向成立但数值夸大: 平均 +${allAvg.toFixed(4)}（原声称 +0.68）。`);
    console.log(`     注意: 这是顶层 belief 变化，不等于"对线索3支持度"变化。`);
  } else {
    console.log(`  ✅ 原结论方向错误: 平均 ${allAvg.toFixed(4)}（force_reflection 实际压制了 a1）。`);
  }

  console.log("\n  数据局限:");
  console.log("    - beliefChanges 是顶层 belief（-1到1整体倾向），非 itemBeliefs[线索3]");
  console.log("    - 无法从现有 JSON 数据核实'a1 对线索3的支持度'变化");
  console.log("    - 要彻底核实需修改 run_malicious.ts 保存 roundResults（含 itemBeliefs）");
}

analyzeForceReflection();
