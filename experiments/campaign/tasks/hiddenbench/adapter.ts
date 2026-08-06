/**
 * HiddenBench → TaskConfig Adapter
 *
 * 把公开基准 HiddenBench（arXiv:2505.11556，ICML 2026）的 65 个 hidden-profile
 * 任务转成 SwarmAlpha 的 TaskConfig 结构，使治理框架（v6 NativeCognitiveEngine）
 * 能在外部公认任务上运行——消除"任务是自己设计"的质疑。
 *
 * 数据源：experiments/campaign/tasks/hiddenbench/benchmark.json（HuggingFace/GitHub 公开，MIT）
 * 数据/实现参考：https://github.com/jonradoff/hiddenbench（第三方 reference implementation，非论文作者官方仓库）
 *
 * ─── 映射规则 ───
 * 1. shared_information（公共事实）→ sharedBriefing（所有 agent 可见）
 * 2. hidden_information（独有事实，3-4 条）→ 循环分配给 4 个 agent 的 knownItems
 *    - HiddenBench 默认 4 agent，每条独有事实归一个 agent（与论文协议一致）
 *    - 每个 agent 拿 1 条 hidden，构成"无单 agent 能独立解出"的隐藏档案
 * 3. possible_answers（候选方案 3-4 个）→ correctAnswer 的 key
 *    - correct_answer 排第 1，其余按 possible_answers 原顺序排 2/3/4
 *    - 效果：kendallTau 只在"正确选项被排第一"时为 1 —— 等价于单选准确率
 *    - ⚠️ 这是"排序等价单选"的适配；若需精确单选指标，Runner 需加 accuracy 计算
 *
 * ─── 与 v6 治理框架的契合 ───
 * - agent 输出 itemBeliefs（每个方案一个 belief）→ MeasurementLayer 的 utility.scores
 * - 治理检测 δ（如群体偏向某方案但证据支持另一方案）、干预、测量 —— 零改动
 *
 * ─── agent 角色与 bias ───
 * - HiddenBench 无角色/初始偏差，adapter 生成通用角色 + 中性 initialBias
 * - 注：不注入"倾向某方案"的初始偏差（HiddenBench 场景依赖讨论中揭示的独有事实）
 */

import type { TaskConfig } from "../../../lunar_survival/config";
import * as fs from "fs";
import * as path from "path";

/** HiddenBench 原始任务类型（benchmark.json 中的一条） */
export interface HiddenBenchTask {
  id: number;
  name: string;
  description: string;
  shared_information: string[];
  hidden_information: string[];
  possible_answers: string[];
  correct_answer: string;
}

/** HiddenBench 默认 agent 数（论文协议） */
const AGENT_COUNT = 4;

/** 通用 agent 角色（HiddenBench 无角色，生成中性专家角色） */
const ROLE_NAMES = ["研究员 A", "研究员 B", "研究员 C", "研究员 D"];

/** 从 benchmark.json 加载全部任务 */
export function loadHiddenBenchTasks(
  jsonPath?: string,
): HiddenBenchTask[] {
  const p = jsonPath ?? path.resolve(__dirname, "benchmark.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw) as HiddenBenchTask[];
}

/**
 * 单任务 → TaskConfig
 *
 * @param task HiddenBench 原始任务
 * @param agentCount agent 数（默认 4，HiddenBench 协议）
 * @param promptStyle "hint"（默认）：提示信息不对称，主动分享独有信息；
 *                    "nohint"：对齐原论文主实验，不提示信息不对称（基线应重现"讨论后失败"）
 */
export function taskToConfig(
  task: HiddenBenchTask,
  agentCount: number = AGENT_COUNT,
  promptStyle: "hint" | "nohint" = "hint",
): TaskConfig {
  // 1. sharedBriefing：公共事实 + 任务描述
  const sharedFacts = (task.shared_information ?? []).map((f, i) => `${i + 1}. ${f}`);
  const sharedBriefing =
    `${task.description}\n\n` +
    `以下是所有成员共同掌握的信息：\n${sharedFacts.join("\n")}\n\n` +
    `你需要与 ${agentCount} 位成员讨论，从以下候选中选出最合适的方案。` +
    (promptStyle === "hint"
      ? `注意：每位成员还掌握一些他人不知道的独有信息，请主动分享。`
      : `请仔细考虑你掌握的所有信息，并与成员充分讨论。`) +
    `最终请给出你对各候选方案的判断（belief 最高的即你的选择）。`;

  // 2. hidden_information → 分配给各 agent 的 knownItems
  const hidden = task.hidden_information ?? [];
  const agents = Array.from({ length: agentCount }, (_, i) => {
    // 循环分配：每条独有事实归一个 agent；agent 数 > 独有事实数时多取，< 时部分为空
    const myHidden = hidden.filter((_, hi) => hi % agentCount === i);
    const knownItems =
      myHidden.length > 0
        ? (promptStyle === "hint"
            ? `你掌握以下他人不知道的独有信息：\n`
            : `你掌握的信息：\n`) +
          myHidden.map((h, hi) => `${hi + 1}. ${h}`).join("\n")
        : (promptStyle === "hint"
            ? `你目前没有独有信息，请基于公共信息讨论，并认真听取他人分享的独有事实。`
            : `你目前没有额外信息，请基于公共信息参与讨论。`);
    return {
      id: `a${i + 1}`,
      name: ROLE_NAMES[i],
      role: ROLE_NAMES[i],
      knownItems,
      initialBias:
        promptStyle === "hint"
          ? "你的专业身份是评估分析师。请基于你掌握的信息独立判断，并主动分享你的独有信息。"
          : "你的专业身份是评估分析师。请基于你掌握的信息独立判断，并在讨论中认真听取他人的观点。",
    };
  });

  // 3. correctAnswer：correct 排 1，其余按原顺序排 2/3/4
  const answers = task.possible_answers ?? [];
  const correctAnswer: Record<string, number> = {};
  let rank = 1;
  correctAnswer[task.correct_answer] = rank++;
  for (const ans of answers) {
    if (ans !== task.correct_answer) correctAnswer[ans] = rank++;
  }

  // 4. searchKeys：方案名 → 自身
  const searchKeys: Record<string, string[]> = {};
  for (const ans of answers) searchKeys[ans] = [ans];

  return {
    id: `hiddenbench_${task.id}`,
    title: `HiddenBench 任务 ${task.id}: ${task.name}`,
    correctAnswer,
    searchKeys,
    sharedBriefing,
    agents,
    promptStyle,
  };
}

/** 全部 65 任务 → TaskConfig 数组 */
export function loadAllConfigs(
  jsonPath?: string,
  agentCount: number = AGENT_COUNT,
  promptStyle: "hint" | "nohint" = "hint",
): TaskConfig[] {
  const tasks = loadHiddenBenchTasks(jsonPath);
  return tasks.map((t) => taskToConfig(t, agentCount, promptStyle));
}
