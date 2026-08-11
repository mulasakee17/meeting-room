/**
 * E12 方案 A: glm-4-flash × HiddenBench 任务 3,4,6 — B/C 组
 */
import * as fs from "fs"; import * as path from "path";
import dotenv from "dotenv"; dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });
import { runSingle } from "./pipeline/Runner";
import type { ExperimentConfig } from "./types";

const TASK_INDICES = [3, 4, 6]; // toma_butera, baker, graetz — groupthink pattern

async function run(label: string, taskIdx: number, gov: "none" | "cognitive", id: string) {
  const cfg: ExperimentConfig = {
    id, hypothesis: "H12", title: label, scenario: "hiddenbench", taskIndex: taskIdx,
    runtimeModes: ["native_cognitive"], governanceMode: gov,
    agentCount: 4, maxRounds: 5, runsPerSeed: 1, seeds: [42],
    llmModel: "glm-4-flash", temperature: 0.0, isMain: false,
    promptStyle: "nohint", description: label,
  };
  const out = path.resolve(__dirname, "output", "e12_glm_hb", "raw");
  fs.mkdirSync(out, { recursive: true });
  const d = await runSingle(cfg, "native_cognitive", 42, 0, out);
  console.log(`  τ=${d.finalKendallTau.toFixed(3)} acc=${d.finalAccuracy} rounds=${d.totalRounds} tokens=${((d.tokenUsage?.totalTokens ?? 0) / 1000).toFixed(0)}k converged=${d.converged} ranking=${d.finalRanking.slice(0,3).join('>')}`);
  const intvs = (d.interventions || []).filter((i: any) => i.applied !== false && i.type !== "unknown");
  if (intvs.length) for (const i of intvs) console.log(`  r${i.round} ${i.type}`);
  return d;
}

async function main() {
  console.log("E12 方案 A: glm-4-flash × HiddenBench tasks 3,4,6\n");
  console.log("A组基线 (已有): task3 pre=25%→post=0%, task4 pre=25%→post=0%, task6 pre=25%→post=0%\n");

  for (const ti of TASK_INDICES) {
    console.log(`=== Task ${ti} ===`);
    await run(`B: task${ti} 结构化`, ti, "none", `e12_glm_t${ti}_b`);
    await run(`C: task${ti} δ治理`, ti, "cognitive", `e12_glm_t${ti}_c`);
    console.log("");
  }
  console.log("Done.");
}
main().catch(e => { console.error(e); process.exit(1); });
