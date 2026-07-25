/**
 * E8: Susceptibility Mediation (H8)
 * 
 * 验证 Susceptibility 完全中介 Inertia → ΔU。
 * 50 次 Cognitive Runtime
 */
import type { ExperimentConfig } from "../types";

export const E8_SUSCEPTIBILITY: ExperimentConfig = {
  id: "e8_susceptibility",
  hypothesis: "H8",
  title: "Susceptibility Mediation — Λ 完全中介 I → ΔU",
  scenario: "ma",
  runtimeModes: ["cognitive"],
  governanceMode: "none",
  agentCount: 5,
  maxRounds: 5,
  runsPerSeed: 10,
  seeds: [42, 123, 456, 789, 1024],
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: true,
  description: "Bootstrap 中介分析：I → Λ → ΔU 路径",
};