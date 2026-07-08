/**
 * Quick test: run 1 none + 1 full experiment on ER Triage task.
 * Usage: npx tsx experiments/v2/quick_test_er.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { CustomAgent } from "../../src/lib/adapters/custom";
import { DiscussionEngine } from "../../src/lib/discussion";
import type { DiscussionAgent } from "../../src/lib/discussion";
import { TASK_ER_TRIAGE } from "./task_er_triage";
import type { LLMConfig } from "../../src/lib/llm/providers";
import type { TaskConfig } from "../lunar_survival/config";

const LLM_CONFIG: LLMConfig = {
  provider: "deepseek" as const,
  model: "deepseek-chat",
  temperature: 0.2,
};

const PARAMS = { maxRounds: 5, convergenceThreshold: 0.06 };

function createAgents(task: TaskConfig): DiscussionAgent[] {
  return task.agents.map(info => {
    const sp =
      `${task.sharedBriefing}\n\n---\n你的独有专业知识（其他成员不知道）：\n${info.knownItems}\n---\n${info.initialBias}\n\n` +
      `讨论规则：\n1. 主动分享你的独有知识\n2. 对他人的判断提出质疑\n3. 最终以JSON格式给出排序 {"emotion": -100到100, "reasoning": "你的分析"}`;
    return new CustomAgent(info.id, info.name, info.role, "default", LLM_CONFIG, sp) as unknown as DiscussionAgent;
  });
}

function extractRanking(decision: string, itemNames: string[]): string[] {
  return itemNames
    .map(name => ({ name, pos: decision.indexOf(name.split("(")[0]?.trim() || name) }))
    .filter(x => x.pos >= 0)
    .sort((a, b) => a.pos - b.pos)
    .map(x => x.name);
}

function kendallTau(gt: Record<string, number>, extracted: string[]): number {
  const items = Object.keys(gt), n = items.length;
  if (n < 2) return 0;
  const gtRank = new Map<string, number>();
  for (const [item, rank] of Object.entries(gt)) gtRank.set(item, rank);
  const x: number[] = [], y: number[] = [];
  for (const item of items) {
    x.push(gtRank.get(item) ?? 0);
    y.push(extracted.indexOf(item) >= 0 ? extracted.indexOf(item) + 1 : n + 1);
  }
  let c = 0, d = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (x[i] === x[j] || y[i] === y[j]) continue;
      if ((x[i] - x[j]) * (y[i] - y[j]) > 0) c++; else d++;
    }
  return c + d === 0 ? 0 : (c - d) / (c + d);
}

async function main() {
  console.log("Tasks:", TASK_ER_TRIAGE.title);
  console.log("Items:", Object.keys(TASK_ER_TRIAGE.correctAnswer).length);
  console.log("Agents:", TASK_ER_TRIAGE.agents.length);

  for (const mode of ["none", "full"]) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  ${mode.toUpperCase()}`);
    console.log(`${"=".repeat(60)}`);

    const agents = createAgents(TASK_ER_TRIAGE);
    const engine = new DiscussionEngine({
      maxRounds: PARAMS.maxRounds,
      convergenceThreshold: PARAMS.convergenceThreshold,
      governanceMode: mode as "none" | "full",
    });

    const taskObj = {
      id: `er_${mode}_0`, description: TASK_ER_TRIAGE.title,
      type: "discussion" as const, createdAt: new Date().toISOString(),
      content: TASK_ER_TRIAGE.sharedBriefing,
    };

    const t0 = Date.now();
    const result = await engine.run(agents, taskObj);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    const allR = result.roundResults.flatMap(r => r.opinions.map(o => o.reasoning)).join("\n");
    const ranking = extractRanking(result.finalDecision || allR, Object.keys(TASK_ER_TRIAGE.correctAnswer));
    const tau = kendallTau(TASK_ER_TRIAGE.correctAnswer, ranking);

    console.log(`Rounds: ${result.totalRounds} | Converged: ${result.converged} | Time: ${elapsed}s`);
    console.log(`Kendall τ: ${tau.toFixed(3)} | Q: ${Math.round(((tau + 1) / 2) * 100)}`);

    const gtOrder = Object.entries(TASK_ER_TRIAGE.correctAnswer)
      .sort((a, b) => a[1] - b[1]).map(e => e[0].split(" ")[0]);
    console.log(`Ground truth: ${gtOrder.join(" > ")}`);
    console.log(`Extracted:    ${ranking.map((n: string) => n.split(" ")[0]).join(" > ")}`);
  }
  console.log("\nDone.");
}

main().catch(e => console.error(e));
