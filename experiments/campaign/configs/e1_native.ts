/**
 * E1 Native — Utility Stability (Native Cognitive vs Belief)
 *
 * 与旧 E1 (e1_stability) 的关键区别：
 *   旧 E1: cognitive 模式的 Utility 从 belief 反推（循环论证）
 *   新 E1: native_cognitive 模式的 Utility 由 LLM 直接输出
 *
 * 对比：
 *   对照组: belief mode — 旧标量 belief 模型
 *   实验组: native_cognitive mode — LLM 原生输出 Utility/Evidence/Confidence
 *
 * 验证 H1: σ²(ΔU) < σ²(ΔB)，即 Utility 比 Belief 更稳定
 * 附加验证: 决策质量 (Kendall τ) 是否提升
 */

import type { ExperimentConfig } from "../types";

export const E1_NATIVE: ExperimentConfig = {
  id: "e1_native",
  hypothesis: "H1",
  title: "State Stability — Native Utility vs Belief (LLM 原生输出)",
  scenario: "ma",
  runtimeModes: ["belief", "native_cognitive"],
  governanceMode: "none",
  agentCount: 5,
  maxRounds: 5,
  runsPerSeed: 5,
  seeds: [42, 123, 456],
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: true,
  description:
    "同一 seed 序列分别运行 Belief 和 Native Cognitive Runtime。" +
    "Native Cognitive 模式下 LLM 直接输出 Utility/Evidence/Confidence，" +
    "系统只计算 Inertia/Susceptibility。验证 Utility 是否比 Belief 更稳定，" +
    "以及决策质量是否提升。",
};