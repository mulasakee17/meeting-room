/**
 * HiddenBench 探测脚本：找出在我们链路上 baseline(none) 失败的任务
 *
 * 背景：任务 0（evacuation_west_city）baseline 无治理就满分（τ=1, acc=1），
 * 存在天花板效应，无法证明治理价值。需要找 baseline 会失败的任务。
 *
 * 用法：
 *   npx tsx experiments/campaign/explore_hiddenbench.ts                        # 默认探测集
 *   npx tsx experiments/campaign/explore_hiddenbench.ts --tasks 3,4,5,6,7      # 指定任务
 *   npx tsx experiments/campaign/explore_hiddenbench.ts --nohint              # 原论文对齐基线（不提示信息不对称）
 *   npx tsx experiments/campaign/explore_hiddenbench.ts --nohint --full       # nohint + full 治理对比
 *   npx tsx experiments/campaign/explore_hiddenbench.ts --nohint --cognitive  # nohint + δ 认知治理对比（非破坏性）
 *
 * 每个任务跑 1 run（seed=42），输出 τ/acc/rounds/tokens 到 output/explore_hiddenbench/
 * 不会污染正式实验目录（output/<experimentId>/）。
 */
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

import { runSingle } from "./pipeline/Runner";
import {
  E11_HIDDENBENCH_NONE,
  E11_HIDDENBENCH_NONE_NOHINT,
  E11_HIDDENBENCH_FULL_NOHINT,
  E11_HIDDENBENCH_DELTA_NOHINT,
} from "./configs/e11_hiddenbench";

const OUT_DIR = path.resolve(__dirname, "output", "explore_hiddenbench");

// 默认探测集：
//   3-7   → 改编自人类研究（Stasser-Stewart 1992 等经典 hidden profile 失败范式）
//   8+    → 自动生成任务（Full Profile ≥80% / Hidden Profile ≤20% 严格筛选）
const DEFAULT_TASKS = [3, 4, 5, 6, 7, 8, 12, 20, 30, 40, 50];

function parseArgs(): { tasks: number[]; nohint: boolean; full: boolean; cognitive: boolean } {
  const raw = process.argv.slice(2);
  let tasks = DEFAULT_TASKS;
  let nohint = false;
  let full = false;
  let cognitive = false;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "--tasks") {
      tasks = raw[++i].split(",").map(Number);
    } else if (raw[i] === "--nohint") {
      nohint = true;
    } else if (raw[i] === "--full") {
      full = true;
    } else if (raw[i] === "--cognitive") {
      cognitive = true;
    }
  }
  return { tasks, nohint, full, cognitive };
}

async function main() {
  const { tasks, nohint, full, cognitive } = parseArgs();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(
    `探测 ${tasks.length} 个任务: ${tasks.join(", ")} | ` +
    `promptStyle=${nohint ? "nohint（原论文对齐）" : "hint"} | ` +
    `governance=${cognitive ? "cognitive(δ)" : full ? "full" : "none"}`,
  );

  const summary: Array<Record<string, unknown>> = [];
  for (const ti of tasks) {
    const base = nohint
      ? (cognitive
          ? E11_HIDDENBENCH_DELTA_NOHINT
          : full ? E11_HIDDENBENCH_FULL_NOHINT : E11_HIDDENBENCH_NONE_NOHINT)
      : E11_HIDDENBENCH_NONE;
    const config = {
      ...base,
      id: `hb_explore_t${ti}${nohint ? "_nohint" : ""}${cognitive ? "_cognitive" : full ? "_full" : ""}`,
      taskIndex: ti,
      seeds: [42],
      runsPerSeed: 1,
    };
    const t0 = Date.now();
    const data = await runSingle(config, "native_cognitive", 42, 0, OUT_DIR);
    const elapsedMin = ((Date.now() - t0) / 60000).toFixed(1);
    const row = {
      taskIndex: ti,
      tau: data.finalKendallTau,
      acc: data.finalAccuracy,
      rounds: data.totalRounds,
      converged: data.converged,
      tokens: data.tokenUsage?.totalTokens ?? 0,
      elapsedMin,
    };
    summary.push(row);
    const tag = `${nohint ? "_nohint" : ""}${cognitive ? "_cognitive" : full ? "_full" : ""}`;
    console.log(
      `[DONE] task ${ti}${tag}: τ=${data.finalKendallTau} acc=${data.finalAccuracy} ` +
      `rounds=${data.totalRounds} conv=${data.converged} ` +
      `tokens=${data.tokenUsage?.totalTokens} ${elapsedMin}min`,
    );
    // 保存 raw（独立目录，避免覆盖正式实验）
    fs.writeFileSync(path.join(OUT_DIR, `task${ti}${tag}_raw.json`), JSON.stringify(data, null, 2));
  }

  const summaryPath = path.join(OUT_DIR, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify({ timestamp: new Date().toISOString(), tasks: summary }, null, 2));
  console.log("\n======== 汇总 ========");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n保存至: ${summaryPath}`);
}

main().catch(err => { console.error("探测失败:", err); process.exit(1); });
