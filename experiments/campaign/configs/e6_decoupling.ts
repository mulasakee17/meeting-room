/**
 * E6: State Decoupling (H6)
 * 
 * 验证五维变量独立。
 * 50 次 Cognitive Runtime
 */
import type { ExperimentConfig } from "../types";

export const E6_DECOUPLING: ExperimentConfig = {
  id: "e6_decoupling",
  hypothesis: "H6",
  title: "State Decoupling — 五维变量相互独立",
  scenario: "ma",
  runtimeModes: ["native_cognitive"],
  governanceMode: "none",
  agentCount: 5,
  maxRounds: 5,
  runsPerSeed: 10,
  seeds: [42, 123, 456, 789, 1024],
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: true,
  description: "计算 {U, E, I, C, Λ} 相关矩阵，与 Belief-confidence 相关对比",
};