/**
 * 续跑脚本 — 从中断点继续实验 + 网络重试
 *
 * 中断状态:
 *   ma_full:   runs 1-5 完成, runs 6-10 缺失 (finish_ma.ts 的 11-19 无治理, 废弃)
 *   urban:     全部 30 次未开始
 *
 * 用法: npx tsx experiments/lunar_survival/continue.ts
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
  TASK_MA, TASK_URBAN,
  EXPERIMENT_PARAMS,
} from "./config";

// ============================================================================
// Retry wrapper — handles transient network failures
// ============================================================================

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = err?.message || String(err);
      const isNetworkError =
        msg.includes("ETIMEDOUT") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("fetch failed") ||
        msg.includes("network") ||
        msg.includes("timeout") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.includes("504") ||
        msg.includes("rate_limit") ||
        msg.includes("429");

      if (attempt < maxRetries && isNetworkError) {
        const delay = RETRY_DELAY_MS * attempt; // exponential backoff
        console.error(`\n    ⚠️  [${label}] 网络错误 (尝试 ${attempt}/${maxRetries})，${delay / 1000}s 后重试...`);
        console.error(`       ${msg.slice(0, 120)}`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`unreachable`);
}

// ============================================================================
// Types
// ============================================================================

interface RunResult {
  taskId: string; ablation: AblationMode; runIndex: number;
  accuracy: number; rounds: number; converged: boolean;
  consensus: number; reliability: number; dispersion: number;
  interventions: number; issuesDetected: string[];
}

// ============================================================================
// Accuracy computation (same as run.ts)
// ============================================================================

function accuracyFromTask(task: TaskConfig, decision: string): number {
  const items = Object.keys(task.correctAnswer);
  const keys = task.searchKeys || {};
  let score = 0;

  for (const [item] of Object.entries(task.correctAnswer)) {
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

// ============================================================================
// Core run function — identical logic to run.ts runSingle()
// ============================================================================

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
    id: `${task.id}_${ablation}_${runIndex}`,
    description: task.title,
    type: "discussion" as const,
    createdAt: new Date().toISOString(),
    content: task.sharedBriefing,
  };

  const result = await withRetry(
    `${task.id}/${ablation}/run${runIndex + 1}`,
    () => engine.run(agents, taskObj),
  );

  // Extract intervention data
  const discussionData = engine.getDiscussionData(
    taskObj,
    agents.map(a => ({ id: a.id, name: a.name, role: a.role, type: a.type })),
  );
  let totalInterventions = 0;
  const allIssues: string[] = [];

  for (const rd of discussionData.rounds) {
    totalInterventions += rd.interventions.length;
    for (const issue of rd.governanceIssues) {
      allIssues.push(issue.type);
    }
  }

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
      beliefChanges: {},
      converged: rr.converged,
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

// ============================================================================
// Statistics (same as run.ts)
// ============================================================================

function computeStats(results: RunResult[]) {
  const accs = results.map(r => r.accuracy);
  const n = accs.length;
  const mean = accs.reduce((a, b) => a + b, 0) / n;
  const variance = accs.reduce((s, a) => s + (a - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  const rounds = results.reduce((s, r) => s + r.rounds, 0) / n;
  const consensus = results.reduce((s, r) => s + r.consensus, 0) / n;
  const interventions = results.reduce((s, r) => s + r.interventions, 0);
  return { n, mean, std, rounds, consensus, interventions, accuracies: accs };
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

// ============================================================================
// Main — continue from interruption point
// ============================================================================

async function main() {
  console.log("=".repeat(65));
  console.log("  SwarmAlpha — 续跑脚本 (中断恢复 + 网络重试)");
  console.log("=".repeat(65));

  const llmConfig: LLMConfig = {
    provider: EXPERIMENT_PARAMS.provider,
    model: EXPERIMENT_PARAMS.model,
    temperature: EXPERIMENT_PARAMS.temperature,
  };

  const dataDir = path.join(__dirname, "data", "raw");
  fs.mkdirSync(dataDir, { recursive: true });

  const allResults: RunResult[] = [];

  // ==========================================================================
  // Phase 1: Fill ma_full gap (runs 6-10, 0-indexed: indices 5-9)
  // ==========================================================================

  console.log("\n📋 Phase 1: 补齐 MA Full Governance (runs 6-10)");
  console.log("   (finish_ma.ts 的 runs 11-19 无治理 → 跳过，用正规 runSingle 补)");

  // Clean up bad runs from finish_ma.ts (no governance applied)
  for (let i = 11; i <= 19; i++) {
    const badFile = path.join(dataDir, `ma_full_run${i}.json`);
    if (fs.existsSync(badFile)) {
      fs.unlinkSync(badFile);
      console.log(`   🗑️  删除无效文件: ma_full_run${i}.json (无治理)`);
    }
  }

  for (let i = 5; i < 10; i++) {
    process.stdout.write(`  Run ${i + 1}/10...`);
    const r = await runSingle(TASK_MA, "full", i, llmConfig);
    allResults.push(r);

    fs.writeFileSync(
      path.join(dataDir, `ma_full_run${i + 1}.json`),
      JSON.stringify(r, null, 2), "utf-8",
    );
    console.log(` acc=${r.accuracy}% rounds=${r.rounds} int=${r.interventions} issues=[${r.issuesDetected.join(",")}]`);
  }

  // ==========================================================================
  // Phase 2: Run all Urban task experiments (0/30 complete)
  // ==========================================================================

  console.log("\n📋 Phase 2: 城市规划任务 (Urban) — 全新运行");
  const TASK_URBAN_ALIAS = TASK_URBAN;

  for (const ablation of EXPERIMENT_PARAMS.ablationModes) {
    const labels: Record<AblationMode, string> = {
      "none": "No Governance",
      "detect-only": "Detect Only",
      "random-intervene": "Random Intervene",
      "full": "Full Governance",
    };
    console.log(`  🔬 ${labels[ablation]} (${ablation})`);

    const batch: RunResult[] = [];
    for (let i = 0; i < EXPERIMENT_PARAMS.runsPerCondition; i++) {
      process.stdout.write(`    Run ${i + 1}/${EXPERIMENT_PARAMS.runsPerCondition}...`);
      const r = await runSingle(TASK_URBAN_ALIAS, ablation, i, llmConfig);
      batch.push(r);
      allResults.push(r);

      fs.writeFileSync(
        path.join(dataDir, `urban_${ablation}_run${i + 1}.json`),
        JSON.stringify(r, null, 2), "utf-8",
      );
      console.log(` acc=${r.accuracy}% rounds=${r.rounds} int=${r.interventions}`);
    }

    const stats = computeStats(batch);
    console.log(`    ✅ μ=${stats.mean.toFixed(1)}% σ=${stats.std.toFixed(1)} rounds=${stats.rounds.toFixed(1)} interventions=${stats.interventions}`);
  }

  // ==========================================================================
  // Phase 3: Generate stats for all completed tasks
  // ==========================================================================

  console.log("\n" + "=".repeat(65));
  console.log("  STATISTICAL SUMMARY");
  console.log("=".repeat(65));

  // Load all existing results
  const existingFiles = fs.readdirSync(dataDir).filter(f => f.endsWith(".json"));
  const allExisting: RunResult[] = [];

  for (const file of existingFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf-8"));
      // Only include runs with the standard schema (has 'dispersion' field)
      // This excludes the old finish_ma.ts runs that had 'explainability' instead
      if (data.taskId && data.ablation && typeof data.accuracy === "number") {
        allExisting.push(data);
      }
    } catch { /* skip corrupted files */ }
  }

  // Merge with newly generated results (deduplicate by task+ablation+runIndex)
  const seen = new Set<string>();
  const merged: RunResult[] = [];

  for (const r of [...allExisting, ...allResults]) {
    // Normalize: ma_full runs 11-19 from finish_ma.ts lack 'dispersion' → skip
    if (r.dispersion === undefined && r.taskId === "ma" && r.ablation === "full") continue;
    const key = `${r.taskId}_${r.ablation}_${r.runIndex}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }

  const taskIds = [...new Set(merged.map(r => r.taskId))];

  for (const taskId of taskIds) {
    const taskResults = merged.filter(r => r.taskId === taskId);
    const taskName = taskId === "lunar" ? "月球生存" : taskId === "ma" ? "企业并购" : "城市规划";
    console.log(`\n📊 ${taskName} (${taskId}) — ${taskResults.length} runs`);

    const byMode: Record<string, RunResult[]> = {};
    for (const r of taskResults) {
      (byMode[r.ablation] ??= []).push(r);
    }

    console.log("  | Mode              | n  | Mean Acc | Std   | Rounds | Intv |");
    console.log("  |-------------------|----|----------|-------|--------|------|");

    for (const mode of EXPERIMENT_PARAMS.ablationModes) {
      const runs = byMode[mode] || [];
      if (runs.length === 0) { console.log(`  | ${mode.padEnd(18)}| —  | —        | —     | —      | —    |`); continue; }
      const s = computeStats(runs);
      console.log(`  | ${mode.padEnd(18)}| ${String(s.n).padEnd(3)}| ${s.mean.toFixed(1)}%    | ${s.std.toFixed(1)}  | ${s.rounds.toFixed(1)}    | ${s.interventions}    |`);
    }

    // t-tests vs none
    const noneRuns = byMode["none"];
    if (noneRuns && noneRuns.length >= 2) {
      for (const mode of ["detect-only", "random-intervene", "full"] as AblationMode[]) {
        const modeRuns = byMode[mode];
        if (!modeRuns || modeRuns.length < 2) continue;
        const tt = tTest(
          modeRuns.map(r => r.accuracy),
          noneRuns.map(r => r.accuracy),
        );
        const sig = tt.p !== ">0.05 (not significant)" ? " ✅" : "";
        console.log(`    ${mode} vs none: t=${tt.t} p${tt.p} d=${tt.d}${sig}`);
      }
    }
  }

  // Save merged stats
  const statsPath = path.join(__dirname, "data", "stats.json");
  const statsOutput = {
    timestamp: new Date().toISOString(),
    totalRuns: merged.length,
    byTask: Object.fromEntries(
      taskIds.map(tid => {
        const tr = merged.filter(r => r.taskId === tid);
        const byMode: Record<string, any> = {};
        for (const mode of EXPERIMENT_PARAMS.ablationModes) {
          const runs = tr.filter(r => r.ablation === mode);
          byMode[mode] = runs.length > 0 ? computeStats(runs) : null;
        }
        return [tid, byMode];
      })
    ),
  };
  fs.writeFileSync(statsPath, JSON.stringify(statsOutput, null, 2), "utf-8");

  console.log(`\n✅ 续跑完成 — 数据已保存到 experiments/lunar_survival/data/`);
  console.log(`   Raw: data/raw/ (${merged.length} valid runs)`);
  console.log(`   Stats: data/stats.json`);
}

main().catch(err => {
  console.error("\n❌ 实验失败:", err);
  process.exit(1);
});
