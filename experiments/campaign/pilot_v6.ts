/**
 * V6 Pilot — 验证 university 任务 + δ 治理全链路
 *
 * 支持命令行选择组别：npx tsx pilot_v6.ts [a|b]（默认 b）
 *   a: A 组（无治理基线）
 *   b: B 组（δ 自适应治理）
 *
 * 复用 Runner.runSingle，跑 1 run（seed=42），
 * 验证 ROADMAP §5.1 Pilot 5 项中的链路通畅性。
 *
 * 用法：npx tsx experiments/campaign/pilot_v6.ts [a|b]
 */

import * as path from "path";
import * as fs from "fs";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

import { runSingle } from "./pipeline/Runner";
import { E9_V6_A_NONE, E9_V6_B_DELTA } from "./configs/e9_cognitive_governance";
import type { ExperimentConfig, RawRunData } from "./types";

// 命令行参数选择组别
const groupArg = (process.argv[2] ?? "b").toLowerCase();
const groupConfig: { config: ExperimentConfig; label: string } =
  groupArg === "a"
    ? { config: E9_V6_A_NONE, label: "A 组 (无治理基线)" }
    : { config: E9_V6_B_DELTA, label: "B 组 (δ 自适应治理)" };

async function main() {
  console.log(`=== V6 Pilot: ${groupConfig.label} 单次运行验证 ===`);
  console.log(`任务: ${groupConfig.config.scenario} | maxRounds: ${groupConfig.config.maxRounds} | 模型: ${groupConfig.config.llmModel}\n`);

  if (!process.env.DEEPSEEK_API_KEY) {
    console.error("ERROR: DEEPSEEK_API_KEY 未设置，请在 .env.local 中配置。");
    process.exit(1);
  }

  const outputDir = path.resolve(__dirname, "pilot_output");
  fs.mkdirSync(outputDir, { recursive: true });

  const data: RawRunData = await runSingle(
    groupConfig.config,
    "native_cognitive",
    42,
    0,
    outputDir,
  );

  // ── 基本结果 ──
  console.log("\n=== 基本结果 ===");
  console.log(`runId: ${data.runId}`);
  console.log(`总轮次: ${data.totalRounds}`);
  console.log(`收敛: ${data.converged}`);
  console.log(`最终 τ: ${data.finalKendallTau.toFixed(3)}`);
  console.log(`最终排名: ${data.finalRanking.join(" > ")}`);

  // ── §5.1 验证项 1: 基线 τ ──
  console.log("\n=== §5.1 验证 1: 基线 τ ===");
  const tau = data.finalKendallTau;
  const tauRange = tau >= 0.3 && tau <= 0.5 ? "✅ 合理" : (tau > 0.5 ? "⚠️ 偏高（天花板风险）" : "⚠️ 偏低（随机风险）");
  console.log(`  τ = ${tau.toFixed(3)} → ${tauRange}`);

  // ── §5.1 验证项 2: δ 动态范围 ──
  console.log("\n=== §5.1 验证 2: δ 动态范围 ===");
  if (data.deltaDiagnosis && data.deltaDiagnosis.length > 0) {
    const deltaKeys = ["polarization", "oneDMask", "evidenceSilence", "confidenceGap", "stanceFlip", "noResponse", "concentration", "consistency"] as const;
    let totalTriggers = 0;
    let totalChecks = 0;
    for (const d of data.deltaDiagnosis) {
      const triggeredDeltas = deltaKeys.filter(k => d[k].triggered);
      totalTriggers += triggeredDeltas.length;
      totalChecks += deltaKeys.length;
      console.log(`  Round ${d.round}: ${triggeredDeltas.length}/${deltaKeys.length} 触发 ${triggeredDeltas.length > 0 ? `[${triggeredDeltas.join(", ")}]` : ""}`);
    }
    const triggerRate = totalTriggers / totalChecks;
    const rateRange = triggerRate >= 0.05 && triggerRate <= 0.30 ? "✅ 合理" : (triggerRate > 0.30 ? "⚠️ 过高" : "⚠️ 过低");
    console.log(`  总触发率: ${(triggerRate * 100).toFixed(1)}% (${totalTriggers}/${totalChecks}) → ${rateRange}`);
  } else {
    console.log("  ⚠️ 无 δ 诊断数据（A 组预期无 δ 诊断）");
  }

  // ── §5.1 验证项 3: ProgressiveEstimator ──
  console.log("\n=== §5.1 验证 3: ProgressiveEstimator ===");
  if (data.cognitiveTrajectory && data.cognitiveTrajectory.length > 0) {
    const lastRound = Math.max(...data.cognitiveTrajectory.map(c => c.round));
    const lastRoundStates = data.cognitiveTrajectory.filter(c => c.round === lastRound);
    let usableCount = 0;
    for (const cs of lastRoundStates) {
      const hasEstimate = cs.susceptibility !== 0;
      if (hasEstimate) usableCount++;
      console.log(`  ${cs.agentName} (${cs.agentId}): susceptibility=${cs.susceptibility.toFixed(3)}, inertia=${cs.inertiaStrength.toFixed(3)}, confidence=${cs.confidenceOverall.toFixed(3)}`);
    }
    console.log(`  有效估计: ${usableCount}/${lastRoundStates.length} 个 agent`);
    console.log(usableCount > 0 ? "  ✅ ProgressiveEstimator 产生数据" : "  ⚠️ ProgressiveEstimator 未产生数据");
  } else {
    console.log("  ⚠️ 无 cognitiveTrajectory 数据");
  }

  // ── §5.1 验证项 4: 热力学轨迹 (RTHF) ──
  console.log("\n=== §5.1 验证 4: 热力学轨迹 (R/T/H/F) ===");
  if (data.thermoHistory && data.thermoHistory.length > 0) {
    for (const t of data.thermoHistory) {
      console.log(`  Round ${t.round}: R=${t.R.toFixed(3)}, T=${t.T.toFixed(3)}, H=${t.H.toFixed(3)}, F=${t.F.toFixed(3)}`);
    }
    const firstR = data.thermoHistory[0].R;
    const lastR = data.thermoHistory[data.thermoHistory.length - 1].R;
    const rTrend = lastR > firstR ? "↑ 上升（收敛趋势）" : lastR < firstR ? "↓ 下降" : "→ 持平";
    console.log(`  R 趋势: ${firstR.toFixed(3)} → ${lastR.toFixed(3)} (${rTrend})`);
  } else {
    console.log("  ⚠️ 无 thermoHistory 数据");
  }

  // ── §5.1 验证项 5: 干预触发 ──
  console.log("\n=== §5.1 验证 5: 干预触发 ===");
  if (data.interventions.length > 0) {
    const typeCounts: Record<string, number> = {};
    for (const intv of data.interventions) {
      typeCounts[intv.type] = (typeCounts[intv.type] || 0) + 1;
    }
    console.log(`  总干预次数: ${data.interventions.length}`);
    console.log(`  干预类型分布: ${JSON.stringify(typeCounts)}`);
    const roundsWithIntervention = new Set(data.interventions.map(i => i.round));
    console.log(`  触发轮次: ${Array.from(roundsWithIntervention).sort((a, b) => a - b).join(", ")}`);
  } else {
    console.log("  无干预触发（A 组预期无干预，或 δ 阈值未达到）");
  }

  // ── 治理问题 ──
  console.log("\n=== 治理问题 ===");
  if (data.governanceIssues.length > 0) {
    const issueTypes: Record<string, number> = {};
    for (const issue of data.governanceIssues) {
      issueTypes[issue.type] = (issueTypes[issue.type] || 0) + 1;
    }
    console.log(`  总问题数: ${data.governanceIssues.length}`);
    console.log(`  问题类型分布: ${JSON.stringify(issueTypes)}`);
  } else {
    console.log("  无治理问题检测到");
  }

  // ── Token 使用 ──
  console.log("\n=== Token 使用 ===");
  if (data.tokenUsage) {
    console.log(`  总 tokens: ${data.tokenUsage.totalTokens} (prompt: ${data.tokenUsage.promptTokens}, completion: ${data.tokenUsage.completionTokens})`);
    const latency = data.tokenUsage.totalLatencyMs ?? 0;
    console.log(`  总延迟: ${(latency / 1000).toFixed(1)}s`);
  }

  console.log(`\n=== Pilot Complete (${groupConfig.label}) ===`);
  console.log(`原始数据已保存到: ${path.join(outputDir, `${data.runId}.json`)}`);
}

main().catch((err) => {
  console.error("Pilot 失败:", err);
  process.exit(1);
});
