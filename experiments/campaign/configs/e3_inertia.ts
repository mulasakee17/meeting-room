/**
 * E3: Inertia → Authority Bias (H3)
 * 
 * 验证 Inertia 能预测权威偏差。
 * 50 次 Cognitive Runtime（治理检测模式）
 */
import type { ExperimentConfig } from "../types";

export const E3_INERTIA: ExperimentConfig = {
  id: "e3_inertia",
  hypothesis: "H3",
  title: "Inertia → Authority Bias — Inertia 能预测权威偏差",
  scenario: "ma",
  runtimeModes: ["native_cognitive"],
  governanceMode: "detect-only",
  agentCount: 5,
  maxRounds: 5,
  runsPerSeed: 10,
  seeds: [42, 123, 456, 789, 1024],
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: true,
  description: "治理检测模式，记录 Inertia 值与权威偏差检测结果，逻辑回归分析",
};