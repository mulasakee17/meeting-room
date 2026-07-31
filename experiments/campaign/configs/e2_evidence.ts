/**
 * E2: Evidence Explanatory Power (H2)
 * 
 * 验证 Evidence 能解释 Opinion Change。
 * 50 次 Cognitive Runtime
 */
import type { ExperimentConfig } from "../types";

export const E2_EVIDENCE: ExperimentConfig = {
  id: "e2_evidence",
  hypothesis: "H2",
  title: "Evidence Explanatory Power — Evidence 能解释 Opinion Change",
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
  description: "从 Cognitive Runtime 数据中计算 ΔE → ΔU 的回归 R²，与 Belief 模型对比",
};