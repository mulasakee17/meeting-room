/**
 * E12 统一实验入口
 *
 * 替代所有 _run_*.ts 临时脚本。参数化驱动，结构化的 Phase Runner 模式，可扩展。
 *
 * 用法:
 *   npx tsx experiments/campaign/run_e12.ts --phase A --model deepseek-chat --tasks 0-64
 *   npx tsx experiments/campaign/run_e12.ts --phase B --model glm-4-flash --tasks 0,4,6 --seeds 42,123 --rounds 3
 *   npx tsx experiments/campaign/run_e12.ts --phase C --model glm-4-flash --tasks 0 --seeds 42,123,456 --rounds 3 --timeout 120000
 *   npx tsx experiments/campaign/run_e12.ts --phase A --model deepseek-chat --tasks crisis
 *
 * Phase:
 *   A = HiddenBench free-text protocol (pre/post independent voting, average/majority rule)
 *   B = SwarmAlpha structured protocol, no governance
 *   C = SwarmAlpha structured protocol + δ cognitive governance
 *
 * Tasks:
 *   0-64     = HiddenBench task range (inclusive)
 *   0,4,6    = comma-separated indices
 *   crisis   = Crisis V2
 *   all-hb   = all 65 HiddenBench tasks
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

import { runSingle } from "./pipeline/Runner";
import { runHiddenBenchProtocol, normalizeOptionName } from "./pipeline/hiddenbenchProtocol";
import { detectLLMProvider } from "../../src/lib/llm/providers";
import type { LLMConfig } from "../../src/lib/llm/providers";
import type { ExperimentConfig } from "./types";

// ============================================================================
// Types
// ============================================================================

type Phase = "A" | "B" | "C" | "D" | "F";
type TaskSpec = "crisis" | { scenario: "hiddenbench"; taskIndex: number };

interface RunArgs {
  phase: Phase;
  model: string;
  tasks: TaskSpec[];
  seeds: number[];
  rounds: number;
  timeout?: number;
}

interface TaskResult {
  taskId: string;
  seed: number;
  // A组
  preAccuracy?: number;
  postAccuracy?: number;
  collectiveGain?: number;
  preMajorityCorrect?: boolean;
  postMajorityCorrect?: boolean;
  // B/C组
  finalKendallTau?: number;
  finalAccuracy?: number;
  individualAccuracy?: number;
  totalRounds?: number;
  converged?: boolean;
  interventions?: number;
  tokens?: number;
  elapsedMs?: number;
  ranking?: string[];
  error?: string;
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs(): RunArgs {
  const raw = process.argv.slice(2);
  const args: Record<string, string> = {};
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].startsWith("--")) {
      args[raw[i].slice(2)] = raw[i + 1] ?? "true";
      i++;
    }
  }

  const phase = (args.phase || "A") as Phase;
  if (!["A", "B", "C", "D", "F"].includes(phase)) throw new Error(`Invalid phase: ${phase}`);

  const model = args.model || "deepseek-chat";
  const seeds = (args.seeds || "42").split(",").map(Number);
  const rounds = Number(args.rounds || (phase === "A" ? 5 : 3));
  const timeout = args.timeout ? Number(args.timeout) : undefined;

  // Parse tasks
  const taskStr = args.tasks || "0";
  const tasks: TaskSpec[] = [];
  if (taskStr === "crisis") {
    tasks.push("crisis");
  } else if (taskStr === "all-hb" || taskStr === "0-64") {
    for (let i = 0; i < 65; i++) tasks.push({ scenario: "hiddenbench", taskIndex: i });
  } else {
    for (const part of taskStr.split(",")) {
      if (part.includes("-")) {
        const [start, end] = part.split("-").map(Number);
        for (let i = start; i <= end; i++) tasks.push({ scenario: "hiddenbench", taskIndex: i });
      } else {
        tasks.push({ scenario: "hiddenbench", taskIndex: Number(part) });
      }
    }
  }

  return { phase, model, tasks, seeds, rounds, timeout };
}

// ============================================================================
// Phase Runners (strategy pattern)
// ============================================================================

abstract class PhaseRunner {
  protected model: string;
  protected seeds: number[];
  protected rounds: number;
  protected timeout?: number;

  constructor(args: RunArgs) {
    this.model = args.model;
    this.seeds = args.seeds;
    this.rounds = args.rounds;
    this.timeout = args.timeout;
  }

  abstract run(task: TaskSpec, seed: number): Promise<TaskResult>;
  abstract phaseLabel(): string;
}

/** Phase A: HiddenBench free-text protocol */
class APhaseRunner extends PhaseRunner {
  phaseLabel() { return "A"; }

  async run(task: TaskSpec, seed: number): Promise<TaskResult> {
    if (task === "crisis") {
      const { TASK_CRISIS_V2 } = require("../v2/task_crisis");
      const llmConfig = this.makeLLMConfig();
      const r = await runHiddenBenchProtocol(TASK_CRISIS_V2, llmConfig, seed, this.rounds);
      return {
        taskId: "crisis_v2", seed,
        preAccuracy: r.preAccuracy, postAccuracy: r.postAccuracy,
        collectiveGain: r.collectiveGain,
        preMajorityCorrect: r.preMajorityCorrect, postMajorityCorrect: r.postMajorityCorrect,
        tokens: r.tokenUsage.totalTokens, elapsedMs: r.elapsedMs,
      };
    }
    const { loadAllConfigs } = require("./tasks/hiddenbench/adapter");
    const tasks = loadAllConfigs(undefined, 4, "nohint");
    const t = tasks[task.taskIndex];
    if (!t) throw new Error(`Task ${task.taskIndex} not found`);
    const llmConfig = this.makeLLMConfig();
    const r = await runHiddenBenchProtocol(t, llmConfig, seed, this.rounds);
    return {
      taskId: `hb_${task.taskIndex}`, seed,
      preAccuracy: r.preAccuracy, postAccuracy: r.postAccuracy,
      collectiveGain: r.collectiveGain,
      preMajorityCorrect: r.preMajorityCorrect, postMajorityCorrect: r.postMajorityCorrect,
      tokens: r.tokenUsage.totalTokens, elapsedMs: r.elapsedMs,
    };
  }

  private makeLLMConfig(): LLMConfig {
    return {
      provider: detectLLMProvider(this.model),
      model: this.model,
      // 对齐 HiddenBench 官方配置 temperature=0.7（官方所有 provider 默认 0.7）
      temperature: 0.7,
      ...(this.timeout !== undefined ? { timeout: this.timeout } : {}),
    };
  }
}

/** Phase B/C/D: SwarmAlpha structured protocol */
class BCPhaseRunner extends PhaseRunner {
  private governanceMode: "none" | "cognitive";
  private staticDA: boolean;

  constructor(args: RunArgs, governanceMode: "none" | "cognitive", staticDA = false) {
    super(args);
    this.governanceMode = governanceMode;
    this.staticDA = staticDA;
  }

  phaseLabel() { return this.staticDA ? "D" : this.governanceMode === "cognitive" ? "C" : "B"; }

  async run(task: TaskSpec, seed: number): Promise<TaskResult> {
    const scenario = task === "crisis" ? "crisis_v2" : "hiddenbench";
    const taskIndex = task === "crisis" ? undefined : task.taskIndex;

    // Pre-discussion: 独立输出 itemBeliefs（与 post 同格式，可比）
    const preResult = await this.runPreDiscussionVote(task);
    const preIndAcc = preResult.indAcc;

    const config: ExperimentConfig = {
      id: `e12_${this.phaseLabel()}_${task === "crisis" ? "crisis" : `t${task.taskIndex}`}`,
      hypothesis: "H12",
      title: `E12 ${this.phaseLabel()} ${task === "crisis" ? "Crisis V2" : `HB t${task.taskIndex}`}`,
      scenario,
      taskIndex,
      runtimeModes: ["native_cognitive"],
      governanceMode: this.governanceMode,
      agentCount: task === "crisis" ? 5 : 4,
      maxRounds: this.rounds,
      runsPerSeed: 1,
      seeds: [seed],
      llmModel: this.model,
      // 对齐 A 组 HiddenBench 官方配置 temperature=0.7，确保 A/B/C/D 可比
      temperature: 0.7,
      isMain: false,
      promptStyle: "hint", // B/C: agents explicitly told to share unique info
      timeout: this.timeout,
      staticDevilsAdvocate: this.staticDA || undefined,
      description: `E12 ${this.phaseLabel()} ${this.model}`,
    };

    const outDir = path.resolve(__dirname, "output", "e12", "raw");
    fs.mkdirSync(outDir, { recursive: true });
    const t0 = Date.now();
    const d = await runSingle(config, "native_cognitive", seed, 0, outDir);
    const intvs = (d.interventions || []).filter((i: any) => i.applied !== false && i.type !== "unknown");

    const postIndAcc = d.individualAccuracy ?? 0;

    return {
      taskId: task === "crisis" ? "crisis_v2" : `hb_${task.taskIndex}`,
      seed,
      finalKendallTau: d.finalKendallTau,
      finalAccuracy: d.finalAccuracy,
      individualAccuracy: d.individualAccuracy,
      // Pre-discussion metrics (与 A 组对齐)
      preAccuracy: preIndAcc,
      postAccuracy: postIndAcc,
      collectiveGain: postIndAcc - preIndAcc,
      totalRounds: d.totalRounds,
      converged: d.converged,
      interventions: intvs.length,
      tokens: d.tokenUsage?.totalTokens ?? 0,
      elapsedMs: Date.now() - t0,
      ranking: d.finalRanking,
    };
  }

  /** Pre-discussion：每个 agent 独立输出 itemBeliefs（与 post-discussion 同一格式） */
  private async runPreDiscussionVote(task: TaskSpec): Promise<{ indAcc: number; preBeliefs: Array<{ agentId: string; item: string; rank: number; belief: number }> }> {
    const empty = { indAcc: 0, preBeliefs: [] };
    try {
      let taskConfig: any;
      if (task === "crisis") {
        taskConfig = require("../v2/task_crisis").TASK_CRISIS_V2;
      } else {
        const { loadAllConfigs } = require("./tasks/hiddenbench/adapter");
        const tasks = loadAllConfigs(undefined, 4, "nohint");
        taskConfig = tasks[task.taskIndex];
      }
      if (!taskConfig) return empty;

      const options = Object.keys(taskConfig.correctAnswer);
      const correctAnswer = Object.entries(taskConfig.correctAnswer).find(([, r]: any) => r === 1)?.[0] as string;
      const optionList = options.map((o: string) => `"${o}"`).join(", ");
      const agents = taskConfig.agents || [];
      const agentCount = task === "crisis" ? 5 : 4;

      const { callLLM } = require("../../src/lib/llm/providers");
      const { safeJsonParse } = require("../../src/lib/utils/jsonUtils");
      const llmConfig = {
        provider: detectLLMProvider(this.model),
        model: this.model,
        temperature: 0.7, // 对齐 A 组，保证 A/B/C/D 可比
        ...(this.timeout !== undefined ? { timeout: this.timeout } : {}),
      };

      // 与结构化讨论相同的 itemBeliefs 格式
      const SYSTEM = `You are participating in a group decision task. Before discussion, make your independent judgment. Output itemBeliefs for EACH option with rank (1=best) and belief (-1=oppose, 1=support). Respond ONLY with JSON.`;

      let correctCount = 0;
      const preBeliefs: Array<{ agentId: string; item: string; rank: number; belief: number }> = [];

      for (let i = 0; i < Math.min(agentCount, agents.length); i++) {
        const agent = agents[i];
        const prompt = `## Scenario\n${taskConfig.sharedBriefing}\n\n## Your Information\n${agent.knownItems || "（无额外信息）"}\n\n## Options: ${optionList}\n\nBased solely on your information (before group discussion), output itemBeliefs for each option. Respond ONLY with JSON:\n{\n  "reasoning": "your analysis",\n  "itemBeliefs": [\n    {"item": "${options[0]}", "rank": 1, "belief": 0.8},\n    {"item": "${options[1]}", "rank": 2, "belief": 0.2}\n  ]\n}`;

        try {
          const response = await callLLM(SYSTEM, prompt, llmConfig);
          const parsed = safeJsonParse<{ itemBeliefs?: Array<{ item: string; rank: number; belief: number }> }>(response.rawContent);
          if (parsed?.itemBeliefs?.length) {
            for (const ib of parsed.itemBeliefs) {
              preBeliefs.push({ agentId: agent.id, item: ib.item, rank: ib.rank ?? 0, belief: ib.belief ?? 0 });
            }
            const top = parsed.itemBeliefs.find(ib => ib.rank === 1);
            const topItem = top?.item ?? "";
            const topNorm = normalizeOptionName(topItem);
            const matches = options.filter((o: string) => {
              const optNorm = normalizeOptionName(o);
              return optNorm.length > 0 && (optNorm === topNorm || topNorm.includes(optNorm) || optNorm.includes(topNorm));
            });
            const isCorrect = matches.length === 1;
            if (isCorrect) correctCount++;
          }
        } catch { /* agent failed */ }
      }

      return { indAcc: correctCount / Math.max(1, agentCount), preBeliefs };
    } catch {
      return empty;
    }
  }
}

/** Phase F: Full Profile — single agent with ALL information (individual reasoning ceiling) */
class FPhaseRunner extends PhaseRunner {
  phaseLabel() { return "F"; }

  async run(task: TaskSpec, _seed: number): Promise<TaskResult> {
    if (task === "crisis") {
      const { TASK_CRISIS_V2 } = require("../v2/task_crisis");
      return this.runFullProfile(TASK_CRISIS_V2, "crisis_v2");
    }
    const { loadAllConfigs } = require("./tasks/hiddenbench/adapter");
    const tasks = loadAllConfigs(undefined, 4, "nohint");
    const t = tasks[task.taskIndex];
    if (!t) throw new Error(`Task ${task.taskIndex} not found`);
    return this.runFullProfile(t, `hb_${task.taskIndex}`);
  }

  private async runFullProfile(task: any, taskId: string): Promise<TaskResult> {
    // 构建全信息：sharedBriefing + 所有 agent 的 knownItems
    const allInfo = task.agents
      .map((a: any) => a.knownItems)
      .filter(Boolean)
      .join("\n");
    const options = Object.keys(task.correctAnswer);
    const correctAnswer = Object.entries(task.correctAnswer).find(([, r]: any) => r === 1)?.[0] as string;

    const llmConfig = {
      provider: detectLLMProvider(this.model),
      model: this.model,
      temperature: 0.0,
      ...(this.timeout !== undefined ? { timeout: this.timeout } : {}),
    };

    // 使用与 A 组相同的 pre-discussion vote 格式
    const { callLLM } = require("../../src/lib/llm/providers");
    const HB_SYSTEM = `You are participating in a study. You have received complete information about a scenario and need to make a decision. Respond with JSON: {"vote": "<option>", "rationale": "<reason>"}`;
    const optionList = options.map((o: string) => `- ${o}`).join("\n");
    const prompt = `## Scenario\n${task.sharedBriefing}\n\n## Complete Information\n${allInfo}\n\n## Options\n${optionList}\n\nBased on ALL information above, make your decision. Respond in JSON: {"vote": "<exact option>", "rationale": "<reason>"}`;

    const t0 = Date.now();
    const response = await callLLM(HB_SYSTEM, prompt, llmConfig);
    const raw = response.rawContent;
    const tokens = (response.usage?.promptTokens ?? 0) + (response.usage?.completionTokens ?? 0);

    // Parse vote（归一化+唯一性判定，与 A 组一致）
    const { safeJsonParse } = require("../../src/lib/utils/jsonUtils");
    let vote = "";
    const parsed = safeJsonParse<{ vote?: string }>(raw);
    if (parsed?.vote) vote = parsed.vote;
    const voteNorm = normalizeOptionName(vote);
    const matches = options.filter((o: string) => {
      const optNorm = normalizeOptionName(o);
      return optNorm.length > 0 && (optNorm === voteNorm || voteNorm.includes(optNorm) || optNorm.includes(voteNorm));
    });
    const isCorrect = matches.length === 1;

    return {
      taskId, seed: 0,
      preAccuracy: isCorrect ? 1 : 0,
      postAccuracy: isCorrect ? 1 : 0,
      collectiveGain: 0,
      tokens, elapsedMs: Date.now() - t0,
    };
  }
}

/** Phase D: structured + static devil's advocate (HiddenBench §6.4) */
class DPhaseRunner extends BCPhaseRunner {
  constructor(args: RunArgs) { super(args, "none", true); }
}

// ============================================================================
// Orchestrator
// ============================================================================

function makeRunner(args: RunArgs): PhaseRunner {
  switch (args.phase) {
    case "A": return new APhaseRunner(args);
    case "B": return new BCPhaseRunner(args, "none");
    case "C": return new BCPhaseRunner(args, "cognitive");
    case "D": return new DPhaseRunner(args);
    case "F": return new FPhaseRunner(args);
  }
}

async function main() {
  const args = parseArgs();
  const runner = makeRunner(args);

  console.log(`E12 Phase ${runner.phaseLabel()} | ${args.model} | ${args.tasks.length} tasks × ${args.seeds.length} seeds | ${args.rounds} rounds`);
  console.log(`Tasks: ${args.tasks.map(t => t === "crisis" ? "crisis" : `hb_${t.taskIndex}`).join(", ")}`);
  console.log(`Seeds: ${args.seeds.join(", ")}`);
  if (args.timeout) console.log(`Timeout: ${args.timeout}ms`);

  const allResults: TaskResult[] = [];
  const totalRuns = args.tasks.length * args.seeds.length;
  let completed = 0;

  for (const task of args.tasks) {
    for (const seed of args.seeds) {
      completed++;
      const label = task === "crisis" ? "crisis" : `hb_${task.taskIndex}`;
      console.log(`\n[${completed}/${totalRuns}] ${label} seed=${seed}...`);
      try {
        const r = await runner.run(task, seed);
        allResults.push(r);

        if (args.phase === "A" || args.phase === "F") {
          console.log(`  pre=${((r.preAccuracy ?? 0) * 100).toFixed(0)}% post=${((r.postAccuracy ?? 0) * 100).toFixed(0)}% gain=${(r.collectiveGain ?? 0) >= 0 ? "+" : ""}${((r.collectiveGain ?? 0) * 100).toFixed(0)}% tokens=${((r.tokens ?? 0) / 1000).toFixed(0)}k ${((r.elapsedMs ?? 0) / 1000).toFixed(0)}s`);
        } else {
          const extra = args.phase === "C" ? ` intvs=${r.interventions}` : "";
          const gain = r.collectiveGain !== undefined ? ` gain=${r.collectiveGain >= 0 ? "+" : ""}${(r.collectiveGain * 100).toFixed(0)}%` : "";
          console.log(`  τ=${(r.finalKendallTau ?? 0).toFixed(3)} groupAcc=${r.finalAccuracy} preInd=${((r.preAccuracy ?? 0) * 100).toFixed(0)}% postInd=${((r.postAccuracy ?? 0) * 100).toFixed(0)}%${gain} rounds=${r.totalRounds} tokens=${((r.tokens ?? 0) / 1000).toFixed(0)}k${extra}`);
        }
      } catch (e: any) {
        console.log(`  FAIL: ${e.message?.slice(0, 120)}`);
        allResults.push({ taskId: task === "crisis" ? "crisis" : `hb_${(task as any).taskIndex}`, seed, error: e.message });
      }
    }
  }

  // Save summary
  const outDir = path.resolve(__dirname, "output", "e12");
  fs.mkdirSync(outDir, { recursive: true });
  const summaryPath = path.join(outDir, `summary_${runner.phaseLabel()}_${args.model}.json`);
  const ok = allResults.filter(r => !r.error);

  let summary: any = { phase: runner.phaseLabel(), model: args.model, seeds: args.seeds, rounds: args.rounds, completed: ok.length, errors: allResults.length - ok.length };

  if (args.phase === "A" || args.phase === "F") {
    summary.preMean = ok.reduce((s, r) => s + (r.preAccuracy ?? 0), 0) / ok.length;
    summary.postMean = ok.reduce((s, r) => s + (r.postAccuracy ?? 0), 0) / ok.length;
    summary.failCount = ok.filter(r => (r.postAccuracy ?? 0) <= 0.5).length;
  } else {
    summary.meanTau = ok.reduce((s, r) => s + (r.finalKendallTau ?? 0), 0) / ok.length;
    summary.meanAcc = ok.reduce((s, r) => s + (r.finalAccuracy ?? 0), 0) / ok.length;
    summary.meanIndAcc = ok.reduce((s, r) => s + (r.individualAccuracy ?? 0), 0) / ok.length;
    // Pre-discussion + collective gain (B/C now have these too)
    const hasPre = ok.filter(r => r.preAccuracy !== undefined).length > 0;
    if (hasPre) {
      summary.meanPreAcc = ok.reduce((s, r) => s + (r.preAccuracy ?? 0), 0) / ok.length;
      summary.meanPostAcc = ok.reduce((s, r) => s + (r.postAccuracy ?? 0), 0) / ok.length;
      summary.meanGain = ok.reduce((s, r) => s + (r.collectiveGain ?? 0), 0) / ok.length;
    }
    if (args.phase === "C") summary.meanIntvs = ok.reduce((s, r) => s + (r.interventions ?? 0), 0) / ok.length;
  }
  // Merge with existing summary (don't overwrite)
  let existingResults: TaskResult[] = [];
  if (fs.existsSync(summaryPath)) {
    try { existingResults = JSON.parse(fs.readFileSync(summaryPath, "utf-8")).results || []; } catch {}
  }
  const merged = [...existingResults, ...allResults];
  summary.results = merged;
  summary.completed = merged.filter((r: any) => !r.error).length;
  summary.errors = merged.filter((r: any) => r.error).length;

  // Recompute aggregated stats from merged results
  const mok = merged.filter((r: any) => !r.error);
  if (args.phase === "A" || args.phase === "F") {
    summary.preMean = mok.reduce((s: number, r: any) => s + (r.preAccuracy ?? 0), 0) / mok.length;
    summary.postMean = mok.reduce((s: number, r: any) => s + (r.postAccuracy ?? 0), 0) / mok.length;
    summary.failCount = mok.filter((r: any) => (r.postAccuracy ?? 0) <= 0.5).length;
  } else {
    summary.meanTau = mok.reduce((s: number, r: any) => s + (r.finalKendallTau ?? 0), 0) / mok.length;
    summary.meanAcc = mok.reduce((s: number, r: any) => s + (r.finalAccuracy ?? 0), 0) / mok.length;
    summary.meanIndAcc = mok.reduce((s: number, r: any) => s + (r.individualAccuracy ?? 0), 0) / mok.length;
    const hasPre = mok.filter((r: any) => r.preAccuracy !== undefined).length > 0;
    if (hasPre) {
      summary.meanPreAcc = mok.reduce((s: number, r: any) => s + (r.preAccuracy ?? 0), 0) / mok.length;
      summary.meanPostAcc = mok.reduce((s: number, r: any) => s + (r.postAccuracy ?? 0), 0) / mok.length;
      summary.meanGain = mok.reduce((s: number, r: any) => s + (r.collectiveGain ?? 0), 0) / mok.length;
    }
    if (args.phase === "C") summary.meanIntvs = mok.reduce((s: number, r: any) => s + (r.interventions ?? 0), 0) / mok.length;
  }

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\n=== Summary merged+ saved (${existingResults.length}→${merged.length} runs) to ${summaryPath} ===`);
  console.log(JSON.stringify(summary, (k, v) => k === "results" ? `[${merged.length} entries]` : v, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
