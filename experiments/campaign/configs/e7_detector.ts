/**
 * E7: Detector Accuracy (H7)
 * 
 * 验证 Cognitive 检测器比 Belief 检测器更准确。
 * 20 个场景（需人工标注 ground truth）
 */
import type { ExperimentConfig } from "../types";

export const E7_DETECTOR: ExperimentConfig = {
  id: "e7_detector",
  hypothesis: "H7",
  title: "Detector Accuracy — Cognitive 检测器更准确",
  scenario: "ma",
  runtimeModes: ["cognitive"],
  governanceMode: "detect-only",
  agentCount: 5,
  maxRounds: 5,
  runsPerSeed: 4,
  seeds: [42, 123, 456, 789, 1024],
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: true,
  description: "20 个场景人工标注 ground truth，比较 Belief 和 Cognitive 检测器 F1",
};