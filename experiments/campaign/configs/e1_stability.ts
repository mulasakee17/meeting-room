/**
 * E1: State Stability (H1)
 * 
 * 验证 Utility 比 Belief 更稳定。
 * 主实验 50×2 次 + 验证实验 130 次 = 230 次
 */
import type { ExperimentConfig } from "../types";

export const E1_STABILITY: ExperimentConfig = {
  id: "e1_stability",
  hypothesis: "H1",
  title: "State Stability — Utility 比 Belief 更稳定",
  scenario: "ma",
  runtimeModes: ["belief", "cognitive"],
  governanceMode: "none",
  agentCount: 5,
  maxRounds: 5,
  runsPerSeed: 5,
  seeds: [42, 123, 456],
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: true,
  description: "同一 seed 序列分别运行 Belief 和 Cognitive Runtime，比较 σ²(ΔB) 和 σ²(ΔU)",
};

/** E1 验证实验：跨任务 */
export const E1_VALIDATION_CROSS_TASK: ExperimentConfig[] = [
  {
    ...E1_STABILITY,
    id: "e1_stability_crisis",
    hypothesis: "H1",
    title: "E1 Cross-Task: Crisis",
    scenario: "crisis",
    runtimeModes: ["cognitive"],
    governanceMode: "none",
    runsPerSeed: 4,
    isMain: false,
    description: "跨任务验证：Crisis 场景",
  },
  {
    ...E1_STABILITY,
    id: "e1_stability_supplier",
    hypothesis: "H1",
    title: "E1 Cross-Task: Supplier",
    scenario: "supplier",
    runtimeModes: ["cognitive"],
    governanceMode: "none",
    runsPerSeed: 4,
    isMain: false,
    description: "跨任务验证：Supplier 场景",
  },
];

/** E1 验证实验：跨 Agent 数量 */
export const E1_VALIDATION_AGENT_COUNT: ExperimentConfig[] = [
  {
    ...E1_STABILITY,
    id: "e1_stability_3agents",
    hypothesis: "H1",
    title: "E1: 3 Agents",
    agentCount: 3,
    runtimeModes: ["cognitive"],
    runsPerSeed: 4,
    isMain: false,
    description: "验证实验：3 agent",
  },
  {
    ...E1_STABILITY,
    id: "e1_stability_7agents",
    hypothesis: "H1",
    title: "E1: 7 Agents",
    agentCount: 7,
    runtimeModes: ["cognitive"],
    runsPerSeed: 4,
    isMain: false,
    description: "验证实验：7 agent",
  },
];

/** E1 验证实验：跨模型 */
export const E1_VALIDATION_CROSS_MODEL: ExperimentConfig = {
  ...E1_STABILITY,
  id: "e1_stability_gpt4o",
  hypothesis: "H1",
  title: "E1 Cross-Model: GPT-4o",
  llmModel: "gpt-4o",
  runtimeModes: ["cognitive"],
  runsPerSeed: 2,
  isMain: false,
  description: "跨模型验证：GPT-4o",
};

/** E1 验证实验：Temperature 消融 */
export const E1_VALIDATION_TEMPERATURE: ExperimentConfig[] = [
  {
    ...E1_STABILITY,
    id: "e1_stability_temp03",
    hypothesis: "H1",
    title: "E1: Temperature 0.3",
    temperature: 0.3,
    runtimeModes: ["cognitive"],
    runsPerSeed: 4,
    isMain: false,
    description: "Temperature 消融：0.3",
  },
  {
    ...E1_STABILITY,
    id: "e1_stability_temp07",
    hypothesis: "H1",
    title: "E1: Temperature 0.7",
    temperature: 0.7,
    runtimeModes: ["cognitive"],
    runsPerSeed: 4,
    isMain: false,
    description: "Temperature 消融：0.7",
  },
];