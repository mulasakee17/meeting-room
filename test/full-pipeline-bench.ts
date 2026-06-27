/**
 * 完整管线基准测试 — 用 runSwarmV9 (非对称门控 + 四规则Neutral) 在203事件上测试
 * 模拟 Mock 模式: 模板因子提取 + 非对称门控
 * 运行: npx tsx test/full-pipeline-bench.ts 2>/dev/null
 */

import { EVENTS } from "./events";
import { runSwarmV9 } from "../src/lib/agents/v9";
import { V9SimConfig } from "../src/lib/agents/v9/types";

// 屏蔽 console.log 噪音
const origLog = console.log;
console.log = () => {};

interface EventResult {
  name: string;
  actual: string;
  predicted: string;
  consensus: number;
  beliefStd: number;
  confidence: number;
}

async function main() {
  const results: EventResult[] = [];

  const upTotal = EVENTS.filter(e => e.actual === "up").length;
  const downTotal = EVENTS.filter(e => e.actual === "down").length;
  const neutralTotal = EVENTS.filter(e => e.actual === "neutral").length;

  console.log = origLog;
  console.log(`完整管线基准测试: runSwarmV9 (Mock/模板模式 + 非对称门控 + 四规则Neutral)`);
  console.log(`事件: ${EVENTS.length} (Up=${upTotal} Down=${downTotal} Neutral=${neutralTotal})`);
  console.log(`永远猜涨: ${(upTotal / EVENTS.length * 100).toFixed(1)}%`);
  console.log("");

  console.log = () => {}; // 重新屏蔽

  const startTime = Date.now();
  let idx = 0;

  for (const event of EVENTS) {
    const config: V9SimConfig = {
      news: event.news,
      marketData: {
        vix: event.vix,
        rsi: event.rsi,
        dropMagnitude: event.drop,
        hasPolicyResponse: event.hasPolicy,
        hasLeverageDamage: event.hasLeverage,
        hasSolvencyDamage: event.hasSolvency,
      },
      rounds: 3,
      enableVRoute: false,
    };

    try {
      const result = await runSwarmV9(config, false); // false = 模板模式(无LLM)
      const predicted = result.finalDecision.direction.toLowerCase();

      results.push({
        name: event.name,
        actual: event.actual,
        predicted,
        consensus: result.finalDecision.consensus,
        beliefStd: result.finalDecision.beliefStd,
        confidence: result.finalDecision.confidence,
      });
    } catch (e) {
      results.push({
        name: event.name,
        actual: event.actual,
        predicted: "neutral",
        consensus: 0,
        beliefStd: 0,
        confidence: 0,
      });
    }

    idx++;
    if (idx % 20 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const correct = results.filter(r => r.predicted === r.actual).length;
      console.log = origLog;
      console.log(`  [${idx}/${EVENTS.length}] ${elapsed}s | 当前准确率: ${(correct / results.length * 100).toFixed(1)}%`);
      console.log = () => {};
    }
  }

  console.log = origLog;
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  // 统计
  const correct = results.filter(r => r.predicted === r.actual).length;
  const stdAcc = (correct / results.length * 100);

  const upResults = results.filter(r => r.actual === "up");
  const downResults = results.filter(r => r.actual === "down");
  const neutralResults = results.filter(r => r.actual === "neutral");

  const upCorrect = upResults.filter(r => r.predicted === "up").length;
  const downCorrect = downResults.filter(r => r.predicted === "down").length;
  const neutralCorrect = neutralResults.filter(r => r.predicted === "neutral").length;

  const upAcc = upResults.length > 0 ? (upCorrect / upResults.length * 100) : 0;
  const downAcc = downResults.length > 0 ? (downCorrect / downResults.length * 100) : 0;
  const neutralAcc = neutralResults.length > 0 ? (neutralCorrect / neutralResults.length * 100) : 0;
  const balAcc = (upAcc + downAcc + neutralAcc) / 3;

  console.log("");
  console.log("=".repeat(80));
  console.log("完整管线 (Mock模式 + 非对称门控 + 四规则Neutral) 基准测试结果");
  console.log("=".repeat(80));
  console.log("");
  console.log(`  总事件: ${results.length}  |  耗时: ${totalTime}s`);
  console.log("");
  console.log(`  标准准确率: ${stdAcc.toFixed(1)}%  (${correct}/${results.length})`);
  console.log(`  平衡准确率: ${balAcc.toFixed(1)}%`);
  console.log(`  永远猜涨:   ${(upTotal / EVENTS.length * 100).toFixed(1)}%`);
  console.log("");
  console.log(`  Up 准确率:      ${upAcc.toFixed(1)}%  (${upCorrect}/${upResults.length})`);
  console.log(`  Down 准确率:    ${downAcc.toFixed(1)}%  (${downCorrect}/${downResults.length})`);
  console.log(`  Neutral 准确率: ${neutralAcc.toFixed(1)}%  (${neutralCorrect}/${neutralResults.length})`);
  console.log("");

  // 预测分布
  const predUp = results.filter(r => r.predicted === "up").length;
  const predDown = results.filter(r => r.predicted === "down").length;
  const predNeutral = results.filter(r => r.predicted === "neutral").length;
  console.log(`  预测分布: UP=${predUp} DOWN=${predDown} NEUTRAL=${predNeutral}`);
  console.log(`  真实分布: UP=${upTotal} DOWN=${downTotal} NEUTRAL=${neutralTotal}`);
  console.log("");

  // 混淆矩阵
  console.log("  混淆矩阵:");
  console.log(`                    预测→`);
  console.log(`               UP     DOWN   NEUTRAL`);
  const matrix: Record<string, Record<string, number>> = { up: { up: 0, down: 0, neutral: 0 }, down: { up: 0, down: 0, neutral: 0 }, neutral: { up: 0, down: 0, neutral: 0 } };
  for (const r of results) {
    matrix[r.actual][r.predicted]++;
  }
  console.log(`  实际 UP      │ ${String(matrix.up.up).padStart(4)}  │ ${String(matrix.up.down).padStart(4)}  │ ${String(matrix.up.neutral).padStart(4)}`);
  console.log(`  实际 DOWN    │ ${String(matrix.down.up).padStart(4)}  │ ${String(matrix.down.down).padStart(4)}  │ ${String(matrix.down.neutral).padStart(4)}`);
  console.log(`  实际 NEUTRAL │ ${String(matrix.neutral.up).padStart(4)}  │ ${String(matrix.neutral.down).padStart(4)}  │ ${String(matrix.neutral.neutral).padStart(4)}`);

  console.log("");
  console.log("=".repeat(80));
  console.log("Down 事件正确预测的案例:");
  const correctDowns = results.filter(r => r.actual === "down" && r.predicted === "down");
  for (const r of correctDowns) {
    console.log(`  ✅ ${r.name.padEnd(25)} consensus=${r.consensus.toFixed(1)} beliefStd=${r.beliefStd.toFixed(1)}`);
  }
  console.log("");
  console.log("Down 事件错误预测的案例 (前10):");
  const wrongDowns = results.filter(r => r.actual === "down" && r.predicted !== "down");
  for (const r of wrongDowns.slice(0, 10)) {
    console.log(`  ❌ ${r.name.padEnd(25)} 预测=${r.predicted.padEnd(7)} consensus=${r.consensus.toFixed(1)} beliefStd=${r.beliefStd.toFixed(1)}`);
  }

  console.log("");
  console.log("=".repeat(80));
  console.log("完成");
}

main().catch(e => { console.log = origLog; console.error(e); });
