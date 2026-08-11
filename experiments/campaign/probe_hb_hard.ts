/**
 * 探测 HiddenBench 原始任务中基线会失败的
 * 用 HiddenBench 官方协议（自由文本）+ deepseek-chat
 */
import * as fs from "fs"; import * as path from "path";
import dotenv from "dotenv"; dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });
import { runHiddenBenchProtocol } from "./pipeline/hiddenbenchProtocol";
import { detectLLMProvider } from "../../src/lib/llm/providers";
import type { LLMConfig } from "../../src/lib/llm/providers";

const OUT_DIR = path.resolve(__dirname, "output", "probe_hb_hard");

async function probeTask(task: any, idx: number, llmConfig: LLMConfig, rounds: number) {
  const t0 = Date.now();
  const result = await runHiddenBenchProtocol(task, llmConfig, 42, rounds);
  const elapsed = (Date.now() - t0) / 1000;
  return {
    taskIndex: idx,
    name: task.title || task.id,
    options: Object.keys(task.correctAnswer).length,
    preAcc: result.preAccuracy,
    postAcc: result.postAccuracy,
    gain: result.collectiveGain,
    tokens: result.tokenUsage.totalTokens,
    elapsed,
    postMajority: result.postMajorityCorrect,
  };
}

async function main() {
  const { loadAllConfigs } = require("./tasks/hiddenbench/adapter");
  const allTasks = loadAllConfigs(undefined, 4, "nohint"); // 4 agents, nohint

  // 挑难的: 人类研究改编 (0-4? or 3-7?) + 自动生成中难筛选
  // 按原论文: tasks 0-2 custom, 3-7 human-study adaptation, 8-64 auto-generated
  const hardIndices = [8, 12, 16, 20, 25, 30, 35, 40, 45, 50]; // 自动生成任务采样

  const llmConfig: LLMConfig = {
    provider: detectLLMProvider("deepseek-chat"),
    model: "deepseek-chat",
    temperature: 0.0,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results: any[] = [];

  console.log(`探测 ${hardIndices.length} HiddenBench 任务 × deepseek-chat × HiddenBench 协议\n`);

  for (const idx of hardIndices) {
    if (idx >= allTasks.length) break;
    const task = allTasks[idx];
    console.log(`[${idx}] ${task.title || task.id}...`);
    try {
      const r = await probeTask(task, idx, llmConfig, 5);
      results.push(r);
      const tag = r.postAcc === 0 ? " ← 基线失败!" : r.postAcc < 0.5 ? " ← 低" : "";
      console.log(`  pre=${(r.preAcc*100).toFixed(0)}% post=${(r.postAcc*100).toFixed(0)}% gain=${r.gain>=0?'+':''}${(r.gain*100).toFixed(0)}% tokens=${(r.tokens/1000).toFixed(1)}k ${r.elapsed.toFixed(0)}s${tag}`);
    } catch(e: any) {
      console.log(`  FAILED: ${e.message?.slice(0, 100)}`);
      results.push({ taskIndex: idx, error: e.message });
    }
  }

  // 汇总
  console.log(`\n======= 汇总 =======`);
  const succeeded = results.filter(r => !r.error);
  const failed = results.filter(r => r.postAcc < 0.5);
  console.log(`共 ${succeeded.length} 任务完成，${failed.length} 个基线低:`);
  for (const r of failed) {
    console.log(`  [${r.taskIndex}] ${r.name}: pre=${(r.preAcc*100).toFixed(0)}% post=${(r.postAcc*100).toFixed(0)}%`);
  }
  if (failed.length === 0) console.log("  (无——所有任务基线满分)");

  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(results, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
