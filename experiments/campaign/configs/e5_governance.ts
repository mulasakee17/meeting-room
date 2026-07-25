/**
 * E5: Governance Mechanism (H5)
 * 
 * 验证治理通过 Evidence 而非 Belief 发挥作用。
 * 50 次 Cognitive Runtime（diversity_only 治理）
 */
import type { ExperimentConfig } from "../types";

export const E5_GOVERNANCE: ExperimentConfig = {
  id: "e5_governance",
  hypothesis: "H5",
  title: "Governance Mechanism — 治理通过 Evidence 发挥作用",
  scenario: "ma",
  runtimeModes: ["cognitive"],
  governanceMode: "diversity_only",
  agentCount: 5,
  maxRounds: 5,
  runsPerSeed: 10,
  seeds: [42, 123, 456, 789, 1024],
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: true,
  description: "仅 introduce_diversity 干预，Granger 因果检验 Evidence → Utility",
};