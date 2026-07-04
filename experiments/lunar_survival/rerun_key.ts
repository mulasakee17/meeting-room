/**
 * Re-run key experiment data — random-intervene + full groups only.
 *
 * Lunar × 2 modes × 5 runs = 10, MA × 2 modes × 5 runs = 10
 * Total: 20 experiments, ~500 LLM calls, ~¥3-5
 *
 * Usage: npx tsx experiments/lunar_survival/rerun_key.ts
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

import { CustomAgent } from "../../src/lib/adapters/custom";
import { DiscussionEngine, type DiscussionAgent } from "../../src/lib/discussion";
import { EvaluationEngine } from "../../src/lib/evaluation";
import type { LLMConfig } from "../../src/lib/llm/providers";
import {
  type TaskConfig, type AblationMode,
  TASK_LUNAR, TASK_MA,
  EXPERIMENT_PARAMS,
} from "./config";

// ---- Accuracy (same as original run.ts) ------------------------------------

function accuracyFromTask(task: TaskConfig, decision: string): number {
  const items = Object.keys(task.correctAnswer);
  const keys = task.searchKeys || {};
  let score = 0;
  for (const [item, correctRank] of Object.entries(task.correctAnswer)) {
    const keywords = keys[item] || [item];
    const firstPos = Math.min(
      ...keywords.map(kw => {
        const idx = decision.indexOf(kw);
        return idx >= 0 ? idx : Infinity;
      })
    );
    if (firstPos < Infinity) {
      const normalizedPos = firstPos / Math.max(decision.length, 1);
      score += 1 - normalizedPos * 0.5;
    }
  }
  return Math.round((score / items.length) * 100);
}

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

interface RunResult {
  taskId: string; ablation: AblationMode; runIndex: number;
  accuracy: number; rounds: number; converged: boolean;
  consensus: number; reliability: number; dispersion: number;
  interventions: number; issuesDetected: string[];
}

async function runSingle(
  task: TaskConfig, ablation: AblationMode, runIndex: number, llmConfig: LLMConfig,
): Promise<RunResult> {
  const agents = createAgents(task, llmConfig);
  const engine = new DiscussionEngine({
    maxRounds: EXPERIMENT_PARAMS.maxRounds,
    convergenceThreshold: EXPERIMENT_PARAMS.convergenceThreshold,
    governanceMode: ablation,
  });
  const evalEngine = new EvaluationEngine();

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

  // Count interventions from engine's round data
  let totalInterventions = 0;
  const allIssues: string[] = [];
  for (const rd of data.rounds) {
    totalInterventions += rd.interventions.length;
    for (const issue of rd.governanceIssues) {
      allIssues.push(issue.type);
    }
  }

  // Evaluate
  let totalConsensus = 0; let totalReliability = 0; let totalDispersion = 0;
  let evalCount = 0;

  for (const rr of result.roundResults) {
    const decisions = rr.opinions.map(o => ({
      agentId: o.agentId, content: o.reasoning, confidence: o.confidence,
      reasoning: o.reasoning, belief: o.belief,
    }));
    const agentInfo = agents.map(a => ({ id: a.id, name: a.name, role: a.role, type: a.type }));
    const history = [{
      round: rr.roundNumber,
      messages: rr.opinions.map(o => ({ agentId: o.agentId, content: o.reasoning, timestamp: rr.timestamp })),
      beliefs: Object.fromEntries(rr.opinions.map(o => [o.agentId, o.belief])),
      beliefChanges: {}, converged: rr.converged,
    }];

    try {
      const ev = evalEngine.evaluate(decisions, agentInfo, history, `Round ${rr.roundNumber}`);
      totalConsensus += ev?.dimensions?.consensus?.score || 0;
      totalReliability += ev?.dimensions?.reliability?.score || 0;
      totalDispersion += ev?.dimensions?.dispersion?.score || 0;
      evalCount++;
    } catch { /* skip */ }
  }

  const allReasoning = result.roundResults.flatMap(r => r.opinions.map(o => o.reasoning)).join("\n");
  const accuracy = accuracyFromTask(task, allReasoning);

  return {
    taskId: task.id, ablation, runIndex,
    accuracy, rounds: result.totalRounds, converged: result.converged,
    consensus: evalCount > 0 ? totalConsensus / evalCount : 0,
    reliability: evalCount > 0 ? totalReliability / evalCount : 0,
    dispersion: evalCount > 0 ? totalDispersion / evalCount : 0,
    interventions: totalInterventions,
    issuesDetected: Array.from(new Set(allIssues)),
  };
}

function computeStats(results: RunResult[]) {
  const accs = results.map(r => r.accuracy);
  const n = accs.length;
  const mean = accs.reduce((a, b) => a + b, 0) / n;
  const variance = accs.reduce((s, a) => s + (a - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  const rounds = results.reduce((s, r) => s + r.rounds, 0) / n;
  const interventions = results.reduce((s, r) => s + r.interventions, 0);
  return { n, mean, std, rounds, interventions };
}

function tTest(group1: number[], group2: number[]): { t: number; p: string; d: number } {
  const n1 = group1.length, n2 = group2.length;
  const m1 = group1.reduce((a, b) => a + b, 0) / n1;
  const m2 = group2.reduce((a, b) => a + b, 0) / n2;
  const v1 = group1.reduce((s, a) => s + (a - m1) ** 2, 0) / (n1 - 1);
  const v2 = group2.reduce((s, a) => s + (a - m2) ** 2, 0) / (n2 - 1);
  const pooledVar = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
  const se = Math.sqrt(pooledVar * (1 / n1 + 1 / n2));
  const t = (m1 - m2) / se;
  const d = (m1 - m2) / Math.sqrt(pooledVar);
  const absT = Math.abs(t);
  let p: string;
  if (absT > 3.5) p = "<0.001";
  else if (absT > 3.0) p = "<0.005";
  else if (absT > 2.6) p = "<0.01";
  else if (absT > 2.1) p = "<0.05";
  else p = ">0.05 (not significant)";
  return { t: Math.round(t * 100) / 100, p, d: Math.round(d * 100) / 100 };
}

async function main() {
  const llmConfig: LLMConfig = {
    provider: "deepseek", model: "deepseek-chat", temperature: 0.2,
  };

  const RUNS = 5;
  const MODES: AblationMode[] = ["random-intervene", "full"];
  const TASKS = [TASK_LUNAR, TASK_MA];

  console.log("=".repeat(65));
  console.log("  SwarmAlpha — Key Data Re-run (random-intervene + full)");
  console.log("=".repeat(65));
  console.log(`  Tasks: lunar, ma  ×  Modes: random-intervene, full  ×  ${RUNS} runs`);
  console.log(`  Total: ${TASKS.length * MODES.length * RUNS} experiments`);
  console.log("=".repeat(65));

  const allResults: RunResult[] = [];
  const dataDir = path.join(__dirname, "data", "raw");
  fs.mkdirSync(dataDir, { recursive: true });

  for (const task of TASKS) {
    console.log(`\n📋 Task: ${task.title} (${task.id})`);
    for (const ablation of MODES) {
      const label = ablation === "random-intervene" ? "Random Intervene" : "Full Governance";
      console.log(`  🔬 ${label} (${ablation})`);

      const batch: RunResult[] = [];
      for (let i = 0; i < RUNS; i++) {
        process.stdout.write(`\r    Run ${i + 1}/${RUNS}...`);
        const r = await runSingle(task, ablation, i, llmConfig);
        batch.push(r);
        allResults.push(r);

        // Overwrite old data file
        fs.writeFileSync(
          path.join(dataDir, `${task.id}_${ablation}_run${i + 1}.json`),
          JSON.stringify(r, null, 2), "utf-8",
        );
      }

      const stats = computeStats(batch);
      console.log(`\r    ✅ μ=${stats.mean.toFixed(1)}% σ=${stats.std.toFixed(1)} rounds=${stats.rounds.toFixed(1)} interventions=${stats.interventions}`);
    }
  }

  // ---- Statistical summary ----
  console.log("\n" + "=".repeat(65));
  console.log("  STATISTICAL ANALYSIS (n=" + RUNS + " per condition)");
  console.log("=".repeat(65));

  for (const task of TASKS) {
    console.log(`\n📊 ${task.title}`);
    const byMode: Record<string, RunResult[]> = {};
    for (const ablation of MODES) {
      byMode[ablation] = allResults.filter(r => r.taskId === task.id && r.ablation === ablation);
    }

    const randomStats = computeStats(byMode["random-intervene"]);
    const fullStats = computeStats(byMode["full"]);
    const tRF = tTest(
      byMode["random-intervene"].map(r => r.accuracy),
      byMode["full"].map(r => r.accuracy),
    );

    console.log(`  | Mode              | Mean Acc | Std   | Rounds | Interventions |`);
    console.log(`  |-------------------|----------|-------|--------|---------------|`);
    console.log(`  | Random Intervene  | ${randomStats.mean.toFixed(1)}%    | ${randomStats.std.toFixed(1)}  | ${randomStats.rounds.toFixed(1)}   | ${randomStats.interventions}            |`);
    console.log(`  | Full Governance   | ${fullStats.mean.toFixed(1)}%    | ${fullStats.std.toFixed(1)}  | ${fullStats.rounds.toFixed(1)}   | ${fullStats.interventions}            |`);
    console.log(`  | Full vs Random    | t=${tRF.t} p${tRF.p} d=${tRF.d} |        |        |               |`);

    if (tRF.d > 0.8 && tRF.p !== ">0.05 (not significant)") {
      console.log(`  ✅ Full governance significantly better than random intervention`);
    } else if (tRF.d < -0.8 && tRF.p !== ">0.05 (not significant)") {
      console.log(`  ⚠️  Random intervention outperforms full governance — unexpected!`);
    } else {
      console.log(`  — No significant difference (may need larger n)`);
    }
  }
}

main().catch(err => { console.error("Re-run failed:", err); process.exit(1); });
