/**
 * 方案 A: glm-4-flash × HiddenBench 任务探测
 * 找 deepseek-chat 免疫但弱模型会失败的任务
 */
import * as fs from "fs"; import * as path from "path";
import dotenv from "dotenv"; dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });
import { runHiddenBenchProtocol } from "./pipeline/hiddenbenchProtocol";
import { detectLLMProvider } from "../../src/lib/llm/providers";
import type { LLMConfig } from "../../src/lib/llm/providers";

const OUT_DIR = path.resolve(__dirname, "output", "probe_glm_hb");

async function probeTask(task: any, idx: number, llmConfig: LLMConfig, rounds: number) {
  const t0 = Date.now();
  const result = await runHiddenBenchProtocol(task, llmConfig, 42, rounds);
  return {
    taskIndex: idx, name: task.title || task.id,
    opts: Object.keys(task.correctAnswer).length,
    preAcc: result.preAccuracy, postAcc: result.postAccuracy,
    gain: result.collectiveGain, tokens: result.tokenUsage.totalTokens,
    elapsed: (Date.now() - t0) / 1000,
    postMajority: result.postMajorityCorrect,
  };
}

async function main() {
  const { loadAllConfigs } = require("./tasks/hiddenbench/adapter");
  const allTasks = loadAllConfigs(undefined, 4, "nohint");

  // 人类研究改编 (3-7) + 自定义 (0-2) 优先
  const indices = [0, 1, 2, 3, 4, 5, 6, 7, 12, 20, 30];

  const llmConfig: LLMConfig = {
    provider: detectLLMProvider("glm-4-flash"),
    model: "glm-4-flash",
    temperature: 0.0,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`glm-4-flash × ${indices.length} HiddenBench tasks × 自由文本协议\n`);

  const results: any[] = [];
  for (const idx of indices) {
    if (idx >= allTasks.length) break;
    const task = allTasks[idx];
    console.log(`[${idx}] ${task.title || task.id}...`);
    try {
      const r = await probeTask(task, idx, llmConfig, 5);
      results.push(r);
      const tag = r.postAcc <= 0.25 ? " ← BASELINE FAIL" : r.postAcc < 0.5 ? " ← low" : "";
      console.log(`  pre=${(r.preAcc*100).toFixed(0)}% post=${(r.postAcc*100).toFixed(0)}% gain=${r.gain>=0?'+':''}${(r.gain*100).toFixed(0)}% ${r.elapsed.toFixed(0)}s${tag}`);
    } catch(e: any) {
      console.log(`  FAILED: ${e.message?.slice(0, 120)}`);
      results.push({ taskIndex: idx, error: e.message });
    }
  }

  const ok = results.filter((r: any) => !r.error);
  const fail = ok.filter((r: any) => r.postAcc <= 0.5);
  console.log(`\n======= ${ok.length} done, ${fail.length} baseline ≤50% ======`);
  for (const r of fail) console.log(`  [${r.taskIndex}] ${r.name}: post=${(r.postAcc*100).toFixed(0)}%`);
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(results, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
