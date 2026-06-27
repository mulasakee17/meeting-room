/**
 * Policy Agent "毒瘤" 诊断
 *
 * 假设: Policy Agent 看到 policy+liquidity 两个矛盾因子,
 *       往往输出接近中性的信念, 稀释了其他 Agent 的强方向信号。
 *
 * 要回答的问题:
 *   1. Policy Agent 自己的方向判断准不准?
 *   2. 它加入后, 改变了多少事件的共识方向?
 *   3. 改变的这些事件里, 是改对了还是改错了?
 *   4. 它的信念值是不是总在中性区域徘徊?
 */

import { EVENTS } from "./events";
import { runSwarmV9 } from "../src/lib/agents/v9";
import { V9SwarmResult } from "../src/lib/agents/v9/types";

async function main() {
  console.log("=" .repeat(60));
  console.log("🔬 Policy Agent 毒瘤诊断 — 203 事件全量");
  console.log("=" .repeat(60));

  let policyBeliefSum = 0;
  let policyAbsBeliefSum = 0;
  let policyCorrect = 0;
  let policyTotal = 0;
  let flippedCount = 0;      // Policy Agent 加入后方向翻转的事件数
  let flippedToCorrect = 0;  // 翻转后变对了
  let flippedToWrong = 0;    // 翻转后变错了
  let dilutedCount = 0;      // 方向没变但共识被显著削弱 (>5 点)
  let results: Array<{
    name: string;
    date: string;
    actual: string;
    withPolicy: { dir: string; cons: number };
    withoutPolicy: { dir: string; cons: number };
    policyBelief: number;
    flipped: boolean;
    impact: "好的" | "坏的" | "无影响" | "稀释";
  }> = [];

  let idx = 0;
  for (const ev of EVENTS) {
    idx++;

    // 跑两次: 有 Policy vs 无 Policy
    const [withP, withoutP]: [V9SwarmResult, V9SwarmResult] =
      await Promise.all([
        runSwarmV9(
          {
            news: ev.news,
            marketData: {
              vix: ev.vix, rsi: ev.rsi, dropMagnitude: ev.drop,
              hasPolicyResponse: ev.hasPolicy,
              hasLeverageDamage: ev.hasLeverage,
              hasSolvencyDamage: ev.hasSolvency,
            },
            rounds: 1, directionThreshold: -5,
            ablation: {
              disableNeutralRule1: true,
              disableNeutralRule2_3: true,
              disableNeutralRule4: true,
            },
          }, false
        ),
        runSwarmV9(
          {
            news: ev.news,
            marketData: {
              vix: ev.vix, rsi: ev.rsi, dropMagnitude: ev.drop,
              hasPolicyResponse: ev.hasPolicy,
              hasLeverageDamage: ev.hasLeverage,
              hasSolvencyDamage: ev.hasSolvency,
            },
            rounds: 1, directionThreshold: -5,
            ablation: {
              disableNeutralRule1: true,
              disableNeutralRule2_3: true,
              disableNeutralRule4: true,
              disablePolicyAgent: true,
            },
          }, false
        ),
      ]);

    // Policy Agent 的信念
    const policyState = withP.rounds[0]?.agents?.["policy"];
    const policyBelief = policyState?.belief ?? 0;
    policyBeliefSum += policyBelief;
    policyAbsBeliefSum += Math.abs(policyBelief);

    // Policy Agent 自己的方向判断
    const policyDir = policyBelief > 0 ? "UP" : policyBelief < 0 ? "DOWN" : "NEUTRAL";
    if (policyDir !== "NEUTRAL") {
      policyTotal++;
      if (
        (policyDir === "UP" && ev.actual === "up") ||
        (policyDir === "DOWN" && ev.actual === "down")
      ) {
        policyCorrect++;
      }
    }

    const withDir = withP.finalDecision.direction;
    const withoutDir = withoutP.finalDecision.direction;
    const withCons = withP.finalDecision.consensus;
    const withoutCons = withoutP.finalDecision.consensus;

    let impact: "好的" | "坏的" | "无影响" | "稀释" = "无影响";

    if (withDir !== withoutDir) {
      flippedCount++;
      // Policy 加入后的方向 vs 无 Policy 的方向, 哪个对?
      const withOk =
        (withDir === "UP" && ev.actual === "up") ||
        (withDir === "DOWN" && ev.actual === "down");
      const withoutOk =
        (withoutDir === "UP" && ev.actual === "up") ||
        (withoutDir === "DOWN" && ev.actual === "down");

      if (withOk && !withoutOk) {
        flippedToCorrect++;
        impact = "好的";
      } else if (!withOk && withoutOk) {
        flippedToWrong++;
        impact = "坏的";
      }
    } else {
      // 方向没变, 但共识被显著削弱
      const dilution = Math.abs(Math.abs(withCons) - Math.abs(withoutCons));
      if (dilution > 5 && Math.abs(withCons) < Math.abs(withoutCons)) {
        dilutedCount++;
        impact = "稀释";
      }
    }

    results.push({
      name: ev.name,
      date: ev.date,
      actual: ev.actual,
      withPolicy: { dir: withDir, cons: withCons },
      withoutPolicy: { dir: withoutDir, cons: withoutCons },
      policyBelief,
      flipped: withDir !== withoutDir,
      impact,
    });

    if (idx % 50 === 0) process.stdout.write(`\r  进度: ${idx}/203`);
  }
  console.log("\r  进度: 203/203\n");

  // ==================== 报告 ====================

  const avgBelief = policyBeliefSum / EVENTS.length;
  const avgAbsBelief = policyAbsBeliefSum / EVENTS.length;
  const policyAcc = policyTotal > 0 ? (policyCorrect / policyTotal) * 100 : 0;

  console.log("─".repeat(60));
  console.log("📊 Policy Agent 个体诊断");
  console.log("─".repeat(60));
  console.log(`  平均信念值:       ${avgBelief.toFixed(1)} (越接近0越"和稀泥")`);
  console.log(`  平均|信念|:        ${avgAbsBelief.toFixed(1)} (绝对值, 信念强度)`);
  console.log(`  个体方向准确率:    ${policyAcc.toFixed(1)}% (${policyCorrect}/${policyTotal})`);
  console.log(`  信念在 ±10 内比例: ${(results.filter(r => Math.abs(r.policyBelief) < 10).length / EVENTS.length * 100).toFixed(0)}% (几乎无观点)`);

  console.log("\n─".repeat(60));
  console.log("📊 Policy Agent 对群体的影响");
  console.log("─".repeat(60));
  console.log(`  方向翻转事件:      ${flippedCount}/${EVENTS.length} (${(flippedCount / EVENTS.length * 100).toFixed(1)}%)`);
  console.log(`    翻转后变正确:    ${flippedToCorrect}`);
  console.log(`    翻转后变错误:    ${flippedToWrong}  ← 这是"毒瘤"的直接证据`);
  console.log(`  方向未变但稀释:    ${dilutedCount} (共识被削弱 >5 点)`);

  // 分析被 Policy 带歪的事件
  const badFlipped = results.filter(r => r.impact === "坏的");
  const goodFlipped = results.filter(r => r.impact === "好的");
  const diluted = results.filter(r => r.impact === "稀释");

  if (badFlipped.length > 0) {
    console.log(`\n🔴 Policy Agent 破坏的事件 (${badFlipped.length}个):`);
    for (const r of badFlipped.slice(0, 8)) {
      console.log(
        `  ${r.date} ${r.name.slice(0, 30).padEnd(32)} ` +
        `无Policy: ${r.withoutPolicy.dir.padEnd(6)} → 有Policy: ${r.withPolicy.dir.padEnd(6)} ` +
        `实际: ${r.actual.padEnd(6)} Policy信念: ${r.policyBelief.toFixed(0)}`
      );
    }
  }

  if (goodFlipped.length > 0) {
    console.log(`\n🟢 Policy Agent 拯救的事件 (${goodFlipped.length}个):`);
    for (const r of goodFlipped.slice(0, 5)) {
      console.log(
        `  ${r.date} ${r.name.slice(0, 30).padEnd(32)} ` +
        `无Policy: ${r.withoutPolicy.dir.padEnd(6)} → 有Policy: ${r.withPolicy.dir.padEnd(6)} ` +
        `实际: ${r.actual.padEnd(6)} Policy信念: ${r.policyBelief.toFixed(0)}`
      );
    }
  }

  // ==================== 大白话结论 ====================
  console.log("\n" + "=".repeat(60));
  console.log("🧾 大白话结论");
  console.log("=".repeat(60));

  const netHarm = flippedToWrong - flippedToCorrect;
  console.log(`\nPolicy Agent 的平均信念是 ${avgBelief.toFixed(1)},`);

  if (Math.abs(avgBelief) < 5) {
    console.log("几乎就是\"我不知道, 你们都对吧\"。");
  }

  console.log(`它 ${policyAcc.toFixed(0)}% 的时候自己方向是对的。`);

  if (flippedToWrong > flippedToCorrect) {
    console.log(
      `\n但它加入群体后, 把 ${flippedToWrong} 个原本正确的判断带偏了, ` +
      `只救了 ${flippedToCorrect} 个。净损失: ${netHarm} 个事件。`
    );
    console.log(
      `\n🔴 结论: Policy Agent 确实是"毒瘤"。\n` +
      `   原因: 它同时看到 policy(往往利好) 和 liquidity(往往利空),\n` +
      `   两股力量互相抵消, 导致它的信念接近0。\n` +
      `   然后它以\"最理性\"的姿态把共识拉向中性,\n` +
      `   削弱了那些只看到单方面因子的 Agent 发出的强信号。\n` +
      `\n   这就像开会时有人说\"从A角度看要买, B角度看要卖,\n` +
      `   所以我们应该观望\"——听起来很对, 但历史上\"观望\"往往是错的。`
    );
  } else if (flippedToWrong === flippedToCorrect) {
    console.log("\n🟡 Policy Agent 不功不过, 净影响为零。");
  } else {
    console.log(
      `\n🟢 Policy Agent 是正面贡献者, 净拯救 ${-netHarm} 个事件。`
    );
  }

  // 额外: 对比 Policy Agent 和其他 Agent 的个体准确率
  console.log("\n" + "─".repeat(60));
  console.log("📊 各 Agent 个体方向准确率对比 (先跑前30事件)");
  console.log("─".repeat(60));

  const agentNames = [
    "institution", "value", "trend", "panic",
    "quant", "media", "contrarian", "retail", "policy"
  ];
  const agentStats: Record<string, { correct: number; total: number; avgAbsBelief: number }> = {};
  for (const id of agentNames) {
    agentStats[id] = { correct: 0, total: 0, avgAbsBelief: 0 };
  }

  let sampleAgents = 0;
  for (const ev of EVENTS.slice(0, 30)) {
    const r = await runSwarmV9({
      news: ev.news,
      marketData: {
        vix: ev.vix, rsi: ev.rsi, dropMagnitude: ev.drop,
        hasPolicyResponse: ev.hasPolicy,
        hasLeverageDamage: ev.hasLeverage,
        hasSolvencyDamage: ev.hasSolvency,
      },
      rounds: 1, directionThreshold: -5,
      ablation: {
        disableNeutralRule1: true, disableNeutralRule2_3: true, disableNeutralRule4: true,
      },
    }, false);

    for (const id of agentNames) {
      const state = r.rounds[0]?.agents?.[id];
      if (!state) continue;
      const b = state.belief;
      const dir = b > 0 ? "UP" : b < 0 ? "DOWN" : "NEUTRAL";
      if (dir !== "NEUTRAL") {
        agentStats[id].total++;
        if ((dir === "UP" && ev.actual === "up") || (dir === "DOWN" && ev.actual === "down")) {
          agentStats[id].correct++;
        }
      }
      agentStats[id].avgAbsBelief += Math.abs(b);
    }
    sampleAgents++;
  }

  for (const id of agentNames) {
    agentStats[id].avgAbsBelief /= sampleAgents;
  }

  console.log(
    " Agent".padEnd(16) + "准确率".padStart(8) + " 平均|信念|".padStart(11)
  );
  console.log("─".repeat(38));
  const sorted = [...agentNames].sort(
    (a, b) => {
      const accA = agentStats[a].total > 0 ? agentStats[a].correct / agentStats[a].total : 0;
      const accB = agentStats[b].total > 0 ? agentStats[b].correct / agentStats[b].total : 0;
      return accB - accA;
    }
  );
  for (const id of sorted) {
    const s = agentStats[id];
    const acc = s.total > 0 ? (s.correct / s.total * 100).toFixed(0) + "%" : "N/A";
    console.log(
      ` ${id.padEnd(15)} ${String(acc).padStart(6)}  ${s.avgAbsBelief.toFixed(0).padStart(9)}`
    );
  }
}

main().catch(e => { console.error(e); process.exit(1); });
