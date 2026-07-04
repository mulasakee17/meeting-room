/**
 * Minimal verification: does random-intervene actually apply interventions now?
 *
 * 1 task (lunar) × 2 modes (none, random-intervene) × 2 runs = 4 experiments
 * ~80 LLM calls total, ~¥0.5
 *
 * Usage: npx tsx experiments/lunar_survival/verify_fix.ts
 */

import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

import { CustomAgent } from "../../src/lib/adapters/custom";
import { DiscussionEngine, type DiscussionAgent } from "../../src/lib/discussion";
import type { LLMConfig } from "../../src/lib/llm/providers";
import { TASK_LUNAR, type TaskConfig, type AblationMode } from "./config";

function createAgents(task: TaskConfig, llmConfig: LLMConfig): DiscussionAgent[] {
  return task.agents.map(info => {
    const systemPrompt =
      `${task.sharedBriefing}\n\n---\n你的独有专业知识（其他成员不知道）：\n${info.knownItems}\n---\n${info.initialBias}\n\n`
      + `讨论规则：\n`
      + `1. 主动分享你的独有知识\n`
      + `2. 对他人的判断提出质疑\n`
      + `3. 如果他人与你独有知识矛盾，必须指出\n`
      + `4. 第一轮先分享核心判断，后续轮次根据反馈调整\n\n`
      + `回复格式：{"emotion": -100到100, "reasoning": "你的分析"}`;
    return new CustomAgent(info.id, info.name, info.role, "default", llmConfig, systemPrompt) as unknown as DiscussionAgent;
  });
}

async function runOne(task: TaskConfig, ablation: AblationMode, runIndex: number, llmConfig: LLMConfig) {
  const agents = createAgents(task, llmConfig);
  const engine = new DiscussionEngine({
    maxRounds: 5,
    convergenceThreshold: 0.06,
    governanceMode: ablation,
  });

  const taskObj = {
    id: `${task.id}_${ablation}_r${runIndex}`,
    description: task.title,
    type: "discussion" as const,
    createdAt: new Date().toISOString(),
    content: task.sharedBriefing,
  };

  const result = await engine.run(agents, taskObj);
  const data = engine.getDiscussionData(taskObj, agents.map(a => ({
    id: a.id, name: a.name, role: a.role, type: a.type,
  })));

  let totalInterventions = 0;
  const allIssues: string[] = [];
  for (const rd of data.rounds) {
    totalInterventions += rd.interventions.length;
    for (const issue of rd.governanceIssues) {
      allIssues.push(issue.type);
    }
  }

  return {
    ablation, runIndex,
    rounds: result.totalRounds,
    converged: result.converged,
    interventions: totalInterventions,
    interventionTypes: data.rounds.flatMap(r => r.interventions.map(i => i.type)),
    issues: Array.from(new Set(allIssues)),
  };
}

async function main() {
  const llmConfig: LLMConfig = {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.2,
  };

  console.log("=".repeat(60));
  console.log("  Random-Intervene Bug Fix — Verification Run");
  console.log("=".repeat(60));
  console.log("  Task: Lunar Survival");
  console.log("  Modes: none × 2, random-intervene × 2");
  console.log("  Total: 4 experiments (~80 LLM calls)");
  console.log("=".repeat(60));

  const results: Awaited<ReturnType<typeof runOne>>[] = [];

  for (const ablation of ["none", "random-intervene"] as AblationMode[]) {
    const label = ablation === "none" ? "None (no governance)" : "Random-Intervene";
    console.log(`\n🔬 ${label}:`);

    for (let i = 0; i < 2; i++) {
      process.stdout.write(`  Run ${i + 1}/2...`);
      const r = await runOne(TASK_LUNAR, ablation, i, llmConfig);
      results.push(r);
      process.stdout.write(
        ` rounds=${r.rounds} interventions=${r.interventions} types=[${r.interventionTypes.join(",")}] issues=[${r.issues.join(",")}]\n`
      );
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("  VERIFICATION SUMMARY");
  console.log("=".repeat(60));

  const noneResults = results.filter(r => r.ablation === "none");
  const randomResults = results.filter(r => r.ablation === "random-intervene");

  const noneAvg = noneResults.reduce((s, r) => s + r.interventions, 0) / noneResults.length;
  const randomAvg = randomResults.reduce((s, r) => s + r.interventions, 0) / randomResults.length;

  console.log(`  none:              avg interventions = ${noneAvg.toFixed(1)}`);
  console.log(`  random-intervene:  avg interventions = ${randomAvg.toFixed(1)}`);

  if (noneAvg === 0 && randomAvg > 0) {
    console.log("\n  ✅ Bug fixed: random-intervene now applies interventions.");
    console.log("     Previously, both modes would show 0 interventions.");
  } else if (randomAvg === 0) {
    console.log("\n  ❌ Bug NOT fixed: random-intervene still shows 0 interventions.");
  } else {
    console.log("\n  ⚠️  Unexpected result — both modes show interventions.");
  }
}

main().catch(err => { console.error("Verification failed:", err); process.exit(1); });
