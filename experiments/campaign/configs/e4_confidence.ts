/**
 * E4: Confidence Prediction (H4)
 * 
 * 验证 Confidence 能预测未来观点改变。
 * 50 次 Cognitive Runtime
 */
import type { ExperimentConfig } from "../types";

export const E4_CONFIDENCE: ExperimentConfig = {
  id: "e4_confidence",
  hypothesis: "H4",
  title: "Confidence Prediction — Confidence 能预测未来观点改变",
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
  description: "混合效应模型：C(t) → |ΔU(t+1)|，与 Belief 模型对比",
};