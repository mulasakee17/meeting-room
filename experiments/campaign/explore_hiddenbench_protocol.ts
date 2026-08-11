/**
 * HiddenBench 参考协议探测脚本
 *
 * 目的：验证 HiddenBench 协议在我们任务上的表现，建立协议对比基线。
 *
 * 用法：
 *   npx tsx experiments/campaign/explore_hiddenbench_protocol.ts                     # 默认 MA 任务 + deepseek-chat
 *   npx tsx experiments/campaign/explore_hiddenbench_protocol.ts --task lunar         # 月球生存
 *   npx tsx experiments/campaign/explore_hiddenbench_protocol.ts --model deepseek-v4-flash  # 强模型
 *   npx tsx experiments/campaign/explore_hiddenbench_protocol.ts --rounds 5           # 少轮讨论
 *
 * 协议（严格对齐 HiddenBench 原论文）：
 *   1. Pre-discussion: 每个 agent 独立投票 {"vote": "...", "rationale": "..."}
 *   2. Discussion: 顺序 round-robin，自由文本 1-2 句，无 JSON
 *   3. Post-discussion: 看到完整讨论历史后再次投票
 *   评估: average rule + majority rule
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

import { runHiddenBenchProtocol } from "./pipeline/hiddenbenchProtocol";
import { detectLLMProvider } from "../../src/lib/llm/providers";
import type { LLMConfig } from "../../src/lib/llm/providers";
import { TASK_LUNAR, TASK_MA } from "../lunar_survival/config";
import { TASK_CRISIS, TASK_CRISIS_V2 } from "../v2/task_crisis";

const OUT_DIR = path.resolve(__dirname, "output", "explore_hiddenbench_protocol");

function parseArgs(): { task: string; model: string; rounds: number; seed: number } {
  const raw = process.argv.slice(2);
  let task = "ma";
  let model = "deepseek-chat";
  let rounds = 15;
  let seed = 42;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "--task") task = raw[++i];
    else if (raw[i] === "--model") model = raw[++i];
    else if (raw[i] === "--rounds") rounds = Number(raw[++i]);
    else if (raw[i] === "--seed") seed = Number(raw[++i]);
  }
  return { task, model, rounds, seed };
}

async function main() {
  const { task: taskName, model, rounds, seed } = parseArgs();
  const taskConfig = taskName === "lunar" ? TASK_LUNAR : taskName === "crisis" ? TASK_CRISIS : taskName === "crisis2" ? TASK_CRISIS_V2 : TASK_MA;
  const options = Object.keys(taskConfig.correctAnswer);
  const correctOption = Object.entries(taskConfig.correctAnswer).find(([, r]) => r === 1)?.[0] ?? "";

  console.log("=".repeat(70));
  console.log(`HiddenBench 官方协议探测`);
  console.log(`  任务: ${taskConfig.title} (${options.length} options)`);
  console.log(`  正确选项: ${correctOption}`);
  console.log(`  模型: ${model} | Max Rounds: ${rounds} | Seed: ${seed}`);
  console.log(`  Agents: ${taskConfig.agents.length}`);
  console.log("=".repeat(70));

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const llmConfig: LLMConfig = {
    provider: detectLLMProvider(model),
    model,
    temperature: 0.0,
  };

  const result = await runHiddenBenchProtocol(taskConfig, llmConfig, seed, rounds);

  // ── 输出结果 ──
  console.log("\n────────── Pre-discussion 投票 ──────────");
  for (const v of result.preVotes) {
    console.log(`  ${v.agentLabel} (${v.agentId}): ${v.vote || "(未识别)"} ${v.isCorrect ? "✓" : "✗"}`);
    console.log(`    rationale: ${v.rationale.slice(0, 120)}`);
  }
  console.log(`  Pre Accuracy: ${result.preAccuracy.toFixed(2)} | Majority: ${result.preMajorityCorrect ? "✓" : "✗"}`);

  console.log("\n────────── 讨论历史（摘要）──────────");
  const discRounds = new Set(result.discussionHistory.map(m => m.round));
  for (const r of discRounds) {
    console.log(`  -- Round ${r} --`);
    const msgs = result.discussionHistory.filter(m => m.round === r);
    for (const m of msgs) {
      console.log(`    ${m.agentLabel}: ${m.content.slice(0, 150)}`);
    }
  }

  console.log("\n────────── Post-discussion 投票 ──────────");
  for (const v of result.postVotes) {
    console.log(`  ${v.agentLabel} (${v.agentId}): ${v.vote || "(未识别)"} ${v.isCorrect ? "✓" : "✗"}`);
    console.log(`    rationale: ${v.rationale.slice(0, 120)}`);
  }
  console.log(`  Post Accuracy: ${result.postAccuracy.toFixed(2)} | Majority: ${result.postMajorityCorrect ? "✓" : "✗"}`);

  console.log("\n────────── 汇总 ──────────");
  console.log(`  Pre → Post: ${(result.preAccuracy * 100).toFixed(0)}% → ${(result.postAccuracy * 100).toFixed(0)}%`);
  console.log(`  Collective Gain: ${result.collectiveGain >= 0 ? "+" : ""}${(result.collectiveGain * 100).toFixed(0)}%`);
  console.log(`  Tokens: ${result.tokenUsage.totalTokens} (${(result.tokenUsage.totalTokens / 1000).toFixed(1)}k)`);
  console.log(`  Elapsed: ${(result.elapsedMs / 1000).toFixed(1)}s`);

  // 保存
  const outPath = path.join(OUT_DIR, `${taskName}_${model}_seed${seed}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\n保存至: ${outPath}`);
}

main().catch(err => { console.error("探测失败:", err); process.exit(1); });
