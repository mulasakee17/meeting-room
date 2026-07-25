/**
 * E1 Native Lite — 精简版 Native Cognitive 验证实验
 *
 * 目的：在正式 Scientific Campaign 前，用最小成本验证：
 *   1. Native State 是否正常产生（Utility/Evidence/Confidence 非空率）
 *   2. Utility 是否稳定（σ²(ΔU) vs σ²(ΔB)）
 *   3. Utility 是否关联决策（Utility-Ranking Consistency）
 *   4. Utility 是否预测未来变化（Predictive Power）
 *
 * 配置：3 seeds × 2 modes × 1 run = 6 runs × 5 rounds = ~30 LLM 调用
 *
 * 与正式 E1_NATIVE 的区别：
 *   - runsPerSeed=1（正式版为 5）
 *   - seeds=3 个（正式版为 3 个但每 seed 5 runs）
 *   - 仅用于信号方向验证，不做统计显著性推断
 *
 * 不验证：治理闭环（Detector 仍基于 belief，是已知局限）
 */

import type { ExperimentConfig } from "../types";

export const E1_NATIVE_LITE: ExperimentConfig = {
  id: "e1_native_lite",
  hypothesis: "H1",
  title: "Native Cognitive Lite — Utility 真实性与预测力验证",
  scenario: "ma",
  runtimeModes: ["belief", "native_cognitive"],
  governanceMode: "none",
  agentCount: 5,
  maxRounds: 5,
  runsPerSeed: 1,
  seeds: [42, 43, 44],
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: false,
  description:
    "精简版验证实验。同一 seed 序列分别运行 Belief 和 Native Cognitive，" +
    "验证 LLM 原生 Utility 是否稳定、是否与 ranking 一致、是否预测决策变化。" +
    "仅验证信号方向，不做统计显著性推断。",
};
