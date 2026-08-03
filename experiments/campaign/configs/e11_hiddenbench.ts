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

export const E11_ALL = [E11_HIDDENBENCH_NONE, E11_HIDDENBENCH_DELTA];
