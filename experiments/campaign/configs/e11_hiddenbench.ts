/**
 * E11: HiddenBench 外部任务集验证（外部公认 hidden-profile 任务）
 *
 * 目的：在外部公开基准 HiddenBench（arXiv:2505.11556, ICML 2026）的
 * 任务上验证治理框架——消除"任务是自己设计"的质疑。
 *
 * 设计：
 *   A. 无治理基线（none）——复现 HiddenBench 报告的"讨论后仍失败"
 *   B. δ 治理（cognitive）——我们的治理框架，看能否提升决策质量
 *
 * 当前为单任务验证（taskIndex 指定），链路跑通后再批量。
 *
 * 对比：E11_A_NONE vs E11_B_DELTA 在相同 taskIndex 上
 */
import type { ExperimentConfig } from "../types";

/** HiddenBench 任务索引：先跑第 1 个（evacuation_west_city 疏散场景）验证链路 */
const TASK_INDEX = 0;
/** 单任务验证用小样本（链路打通后用全量） */
const SEEDS = [42, 123, 456];

/** E11 A 组：无治理基线 */
export const E11_HIDDENBENCH_NONE: ExperimentConfig = {
  id: "e11_hb_none",
  hypothesis: "H11",
  title: "HiddenBench 外部任务 — 无治理基线 (A组)",
  scenario: "hiddenbench",
  taskIndex: TASK_INDEX,
  runtimeModes: ["native_cognitive"],
  governanceMode: "none",
  agentCount: 4,           // HiddenBench 协议默认 4 agent
  maxRounds: 15,           // HiddenBench 协议默认 15 轮
  runsPerSeed: 5,
  seeds: SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: false,
  description: "HiddenBench 任务无治理基线，复现集体推理失败；与 δ 治理对比",
};

/** E11 B 组：δ 治理 */
export const E11_HIDDENBENCH_DELTA: ExperimentConfig = {
  id: "e11_hb_delta",
  hypothesis: "H11",
  title: "HiddenBench 外部任务 — δ 治理 (B组)",
  scenario: "hiddenbench",
  taskIndex: TASK_INDEX,
  runtimeModes: ["native_cognitive"],
  governanceMode: "cognitive",
  agentCount: 4,
  maxRounds: 15,
  runsPerSeed: 5,
  seeds: SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: false,
  description: "HiddenBench 任务 + δ 治理，验证治理能否提升决策质量（vs 无治理基线）",
};

/** E11 C 组：旧检测器 full 治理（与论文 none/full 对照一致） */
export const E11_HIDDENBENCH_FULL: ExperimentConfig = {
  id: "e11_hb_full",
  hypothesis: "H11",
  title: "HiddenBench 外部任务 — 全治理 full (C组)",
  scenario: "hiddenbench",
  taskIndex: TASK_INDEX,
  runtimeModes: ["native_cognitive"],
  governanceMode: "full",
  agentCount: 4,
  maxRounds: 15,
  runsPerSeed: 5,
  seeds: SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: false,
  description: "HiddenBench 任务 + 旧检测器 full 治理（历史 169 闭环主证据路径），验证治理提升",
};

/** E11 D 组：基线严格对齐原论文主实验——不提示信息不对称（nohint），应重现"讨论后失败" */
export const E11_HIDDENBENCH_NONE_NOHINT: ExperimentConfig = {
  id: "e11_hb_none_nohint",
  hypothesis: "H11",
  title: "HiddenBench 原论文对齐基线 — 无治理 no-hint (D组)",
  scenario: "hiddenbench",
  taskIndex: TASK_INDEX,
  runtimeModes: ["native_cognitive"],
  governanceMode: "none",
  agentCount: 4,
  maxRounds: 15,
  runsPerSeed: 5,
  seeds: SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: false,
  promptStyle: "nohint",
  description: "HiddenBench 任务 + 原论文主实验 prompt（不提示信息不对称），复现讨论后失败基线",
};

/** E11 E 组：治理在 no-hint 条件下发力——同样的原论文 prompt，只加治理框架 */
export const E11_HIDDENBENCH_FULL_NOHINT: ExperimentConfig = {
  id: "e11_hb_full_nohint",
  hypothesis: "H11",
  title: "HiddenBench 原论文对齐 + 治理 — 全治理 no-hint (E组)",
  scenario: "hiddenbench",
  taskIndex: TASK_INDEX,
  runtimeModes: ["native_cognitive"],
  governanceMode: "full",
  agentCount: 4,
  maxRounds: 15,
  runsPerSeed: 5,
  seeds: SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: false,
  promptStyle: "nohint",
  description: "HiddenBench 原论文 prompt + full 治理——唯一变量是治理，验证治理能否在严格基线上提升决策质量",
};

/** E11 F 组：δ 认知治理在 no-hint 条件下发力——非破坏性干预（v6 设计路径） */
export const E11_HIDDENBENCH_DELTA_NOHINT: ExperimentConfig = {
  id: "e11_hb_delta_nohint",
  hypothesis: "H11",
  title: "HiddenBench 原论文对齐 + δ治理 — 认知治理 no-hint (F组)",
  scenario: "hiddenbench",
  taskIndex: TASK_INDEX,
  runtimeModes: ["native_cognitive"],
  governanceMode: "cognitive",
  agentCount: 4,
  maxRounds: 15,
  runsPerSeed: 5,
  seeds: SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: false,
  promptStyle: "nohint",
  description: "HiddenBench 原论文 prompt + δ 认知治理（非破坏性干预，v6 设计路径）——唯一变量是治理",
};

export const E11_ALL = [
  E11_HIDDENBENCH_NONE,
  E11_HIDDENBENCH_DELTA,
  E11_HIDDENBENCH_FULL,
  E11_HIDDENBENCH_NONE_NOHINT,
  E11_HIDDENBENCH_FULL_NOHINT,
  E11_HIDDENBENCH_DELTA_NOHINT,
];
