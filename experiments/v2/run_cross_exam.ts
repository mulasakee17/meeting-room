/**
 * 交叉质证引擎 A/B/C/D 对照实验
 *
 * 研究问题：交叉质证（利用分歧）是否比传统治理（消除分歧）更能提升决策质量？
 *
 * 实验设计：
 *   A组（基线）:     enableCrossExamination=false, governanceMode=none
 *   B组（传统治理）:  enableCrossExamination=false, governanceMode=full
 *   C组（交叉质证）:  enableCrossExamination=true,  governanceMode=none
 *   D组（质证+治理）: enableCrossExamination=true,  governanceMode=full
 *
 * 任务：Crisis（困难任务，τ≈0.41，有足够分歧空间）
 * 每组 n=10，共 40 次实验
 *
 * 用法:
 *   npx tsx experiments/v2/run_cross_exam.ts                     # 跑全部 4 组
 *   npx tsx experiments/v2/run_cross_exam.ts --group=A --start=0 --count=10
 *   npx tsx experiments/v2/run_cross_exam.ts --group=C --start=5 --count=5
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

import { CustomAgent } from "../../src/lib/adapters/custom";
import { DiscussionEngine, type DiscussionAgent } from "../../src/lib/discussion";
import type { LLMConfig } from "../../src/lib/llm/providers";
import { TASK_CRISIS } from "./task_crisis";
import type { TaskConfig } from "../lunar_survival/config";
import { mulberry32, extractRanking, kendallTau, kuramotoR } from "./statsShared";

// ============================================================================
// 实验配置
// ============================================================================

type CrossExamGroup = "A" | "B" | "C" | "D";

interface GroupConfig {
  group: CrossExamGroup;
  enableCrossExamination: boolean;
  governanceMode: "none" | "full";
  description: string;
}

const GROUP_CONFIGS: Record<CrossExamGroup, GroupConfig> = {
  A: { group: "A", enableCrossExamination: false, governanceMode: "none",  description: "基线：无治理无质证" },
  B: { group: "B", enableCrossExamination: false, governanceMode: "full",  description: "传统治理：检测+干预（消除分歧）" },
  C: { group: "C", enableCrossExamination: true,  governanceMode: "none",  description: "交叉质证：利用分歧（无传统治理）" },
  D: { group: "D", enableCrossExamination: true,  governanceMode: "full",  description: "质证+治理：两者结合" },
};

const PARAMS = {
  task: TASK_CRISIS,
  runsPerGroup: 10,
  maxRounds: 3,
  convergenceThreshold: 0.06,
  temperature: 0.2,
  model: "deepseek-chat",
  provider: "deepseek" as const,
  dataDir: "data_cross_exam",
};

const LLM_CONFIG: LLMConfig = {
  provider: PARAMS.provider,
  model: PARAMS.model,
  temperature: PARAMS.temperature,
};

// ============================================================================
// CLI 参数解析
// ============================================================================

function parseCliArgs(): { group: CrossExamGroup | "all"; start: number; count: number } {
  const args = process.argv.slice(2);
  let group: CrossExamGroup | "all" = "all";
  let start = 0;
  let count = PARAMS.runsPerGroup;
  for (const arg of args) {
    if (arg.startsWith("--group=")) group = arg.split("=")[1] as CrossExamGroup | "all";
    if (arg.startsWith("--start=")) start = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--count=")) count = parseInt(arg.split("=")[1], 10);
  }
  return { group, start, count };
}

// ============================================================================
// Agent 创建（复用 run.ts 的逻辑）
// ============================================================================

function createAgents(task: TaskConfig, llmConfig: LLMConfig): DiscussionAgent[] {
  return task.agents.map(info => {
    const systemPrompt =
      `${task.sharedBriefing}\n\n---\n你的独有专业知识（其他成员不知道）：\n${info.knownItems}\n---\n${info.initialBias}\n\n`
      + `讨论规则：\n`
      + `1. 主动分享你的独有知识\n`
      + `2. 对他人的判断提出质疑\n`
      + `3. 如果他人与你独有知识矛盾，必须指出\n`
      + `4. 最终以JSON格式给出你的判断，格式：\n`
      + `{\n`
      + `  "reasoning": "你的分析",\n`
      + `  "evidence": ["证据1", "证据2"],\n`
      + `  "belief": -1到1 (整体倾向),\n`
      + `  "confidence": 0到100,\n`
      + `  "nextOpinion": "下一步讨论方向",\n`
      + `  "referencedAgents": ["a2"],\n`
      + `  "itemBeliefs": [\n`
      + `    {"item": "方案A-全城封锁", "rank": 3, "belief": -0.5, "confidence": 85},\n`
      + `    {"item": "方案B-分阶段响应", "rank": 1, "belief": 0.7, "confidence": 90},\n`
      + `    {"item": "CompanyZ (行业C)", "rank": 2, "belief": 0.1, "confidence": 65}\n`
      + `  ]\n`
      + `}\n`
      + `itemBeliefs中：rank为你认为的排名(1=最优)，belief为对该选项的独立偏好(-1=强烈反对,0=中立,1=强烈支持)，confidence为置信度(0-100)`;
    return new CustomAgent(info.id, info.name, info.role, "default", llmConfig, systemPrompt) as unknown as DiscussionAgent;
  });
}

// ============================================================================
// 实验结果类型
// ============================================================================

interface CrossExamResult {
  runId: string;
  group: CrossExamGroup;
  groupDescription: string;
  runIndex: number;
  timestamp: string;
  codeVersion: string;

  // 主指标
  kendallTau: number;
  decisionQuality: number;

  // 共识与分歧
  consensusR: number;
  finalBeliefStd: number;
  finalBeliefMean: number;
  converged: boolean;
  totalRounds: number;

  // 交叉质证详情
  crossExamActivated: boolean;
  divergenceIndex: number;
  proCampSize: number;
  conCampSize: number;
  crossExamRounds: number;
  avgBeliefShift: number;
  dissentPreserved: boolean;
  consensusPointsCount: number;
  minorityReportCount: number;
  synthesizedBelief: number;

  // 信念轨迹
  beliefTrajectory: number[][];
  tauTrajectory: number[];

  // 治理
  governanceIssuesDetected: string[];
  totalInterventions: number;

  // 最终决策
  finalDecision: string;
  extractedRanking: string[];
  groundTruth: Record<string, number>;
}

// ============================================================================
// 单次实验
// ============================================================================

async function runSingle(
  group: CrossExamGroup,
  runIndex: number,
): Promise<CrossExamResult> {
  const config = GROUP_CONFIGS[group];
  const runId = `crossexam_crisis_${group}_${runIndex}`;
  const llmConfig = { ...LLM_CONFIG, seed: 42 + runIndex };

  console.log(`\n[${runId}] ${config.description} (seed=${42 + runIndex})`);

  const agents = createAgents(PARAMS.task, llmConfig);
  const engine = new DiscussionEngine(
    {
      maxRounds: PARAMS.maxRounds,
      convergenceThreshold: PARAMS.convergenceThreshold,
      governanceMode: config.governanceMode,
      enableCrossExamination: config.enableCrossExamination,
      seed: 42 + runIndex,
    },
  );

  const taskObj = {
    id: "cross_exam_crisis",
    description: PARAMS.task.title,
    type: "discussion" as const,
    createdAt: new Date().toISOString(),
    content: PARAMS.task.sharedBriefing,
  };

  const result = await engine.run(agents, taskObj);
  const crossExam = engine.getCrossExaminationResult();

  // 提取最终排名和 τ（复用 run.ts 的逻辑）
  const itemNames = Object.keys(PARAMS.task.correctAnswer);
  const allReasoning = result.roundResults
    .flatMap(r => r.opinions.map(o => o.reasoning))
    .join("\n");
  const finalDecision = result.finalDecision || allReasoning;
  const allItemBeliefs = result.roundResults
    .flatMap(r => r.opinions)
    .flatMap(o => o.itemBeliefs || []);
  const extractedRanking = extractRanking(finalDecision, itemNames, allItemBeliefs);
  const tau = kendallTau(PARAMS.task.correctAnswer, extractedRanking);

  // 计算 Kuramoto R
  const lastRound = result.roundResults[result.roundResults.length - 1];
  const beliefs = lastRound.opinions.map(o => o.belief);
  const R = kuramotoR(beliefs);
  const meanBelief = beliefs.reduce((a, b) => a + b, 0) / beliefs.length;
  const std = Math.sqrt(beliefs.reduce((s, b) => s + (b - meanBelief) ** 2, 0) / beliefs.length);

  // τ 轨迹
  const tauTrajectory = result.roundResults.map(rr => {
    const roundReasoning = rr.opinions.map(o => o.reasoning).join("\n");
    const roundItemBeliefs = rr.opinions.flatMap(o => o.itemBeliefs || []);
    const ranking = extractRanking(roundReasoning, itemNames, roundItemBeliefs);
    return kendallTau(PARAMS.task.correctAnswer, ranking);
  });

  // 信念轨迹
  const beliefTrajectory = result.roundResults.map(rr =>
    rr.opinions.map(o => o.belief),
  );

  // 治理信息
  const governanceIssuesDetected: string[] = [];
  let totalInterventions = 0;
  for (const rr of result.roundResults) {
    // 从 roundResults 提取治理信息（如果有）
    // 注意：DiscussionEngine.run 返回的 roundResults 可能不含 governanceIssues
    // 这里从 engine 内部状态获取
  }
  const governanceData = engine.getDiscussionData(taskObj, agents.map(a => ({
    id: a.id, name: a.name, role: a.role, type: a.type,
  })));
  for (const round of governanceData.rounds) {
    for (const issue of round.governanceIssues || []) {
      if (!governanceIssuesDetected.includes(issue.type)) {
        governanceIssuesDetected.push(issue.type);
      }
    }
    totalInterventions += (round.interventions || []).length;
  }

  // 交叉质证详情
  const crossExamActivated = crossExam?.activated ?? false;
  const crossExamRounds = crossExam?.rounds.length ?? 0;
  const avgBeliefShift = crossExam && crossExam.rounds.length > 0
    ? crossExam.rounds.reduce((s, r) => s + Math.abs(r.beliefShift), 0) / crossExam.rounds.length
    : 0;

  const experimentResult: CrossExamResult = {
    runId,
    group,
    groupDescription: config.description,
    runIndex,
    timestamp: new Date().toISOString(),
    codeVersion: "2026-07-21",

    kendallTau: Math.round(tau * 1000) / 1000,
    decisionQuality: Math.round(((tau + 1) / 2) * 100),

    consensusR: Math.round(R * 1000) / 1000,
    finalBeliefStd: Math.round(std * 1000) / 1000,
    finalBeliefMean: Math.round(meanBelief * 1000) / 1000,
    converged: result.converged,
    totalRounds: result.totalRounds,

    crossExamActivated,
    divergenceIndex: crossExam?.divergenceIndex ?? 0,
    proCampSize: crossExam?.proCamp.members.length ?? 0,
    conCampSize: crossExam?.conCamp.members.length ?? 0,
    crossExamRounds,
    avgBeliefShift: Math.round(avgBeliefShift * 1000) / 1000,
    dissentPreserved: crossExam?.synthesis.dissentPreserved ?? false,
    consensusPointsCount: crossExam?.synthesis.consensusPoints.length ?? 0,
    minorityReportCount: crossExam?.synthesis.minorityReport.length ?? 0,
    synthesizedBelief: crossExam?.synthesis.synthesizedBelief ?? 0,

    beliefTrajectory,
    tauTrajectory,

    governanceIssuesDetected,
    totalInterventions,

    finalDecision: result.finalDecision,
    extractedRanking,
    groundTruth: PARAMS.task.correctAnswer,
  };

  console.log(`  τ=${experimentResult.kendallTau}, R=${experimentResult.consensusR}, activated=${crossExamActivated}, interventions=${totalInterventions}`);

  return experimentResult;
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  const { group: targetGroup, start, count } = parseCliArgs();

  console.log("=".repeat(70));
  console.log("  Cross-Examination A/B/C/D Experiment");
  console.log("=".repeat(70));
  console.log(`  Task: Crisis (difficult, τ≈0.41 baseline)`);
  console.log(`  Groups: A=baseline, B=governance, C=cross-exam, D=cross-exam+governance`);
  console.log(`  Runs per group: ${count}`);
  console.log(`  Model: ${PARAMS.model}`);
  console.log(`  Target: ${targetGroup === "all" ? "ALL groups" : `Group ${targetGroup}`}`);
  console.log(`  Start index: ${start}`);
  console.log("=".repeat(70));

  // 确定要运行的组
  const groupsToRun: CrossExamGroup[] =
    targetGroup === "all" ? ["A", "B", "C", "D"] : [targetGroup];

  // 创建数据目录
  const dataPath = path.resolve(__dirname, PARAMS.dataDir);
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }

  for (const group of groupsToRun) {
    const config = GROUP_CONFIGS[group];
    console.log(`\n${"=".repeat(70)}`);
    console.log(`  Group ${group}: ${config.description}`);
    console.log(`  enableCrossExamination=${config.enableCrossExamination}, governanceMode=${config.governanceMode}`);
    console.log(`${"=".repeat(70)}`);

    for (let i = start; i < start + count; i++) {
      const result = await runSingle(group, i);
      const filePath = path.join(dataPath, `${result.runId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
      console.log(`  → Saved: ${filePath}`);
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("  All experiments complete.");
  console.log(`  Data saved to: ${dataPath}`);
  console.log("=".repeat(70));
  console.log("\nNext step: run analysis");
  console.log("  npx tsx experiments/v2/analyze_cross_exam.ts");
}

main().catch(err => {
  console.error("Experiment failed:", err);
  process.exit(1);
});
