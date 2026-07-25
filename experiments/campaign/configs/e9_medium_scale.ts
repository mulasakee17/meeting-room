/**
 * E9 Medium Scale — 中等规模验证实验
 *
 * 目标：在修复 Crisis 答案泄露后，用中等规模（3 seeds × 1 run）验证
 * 认知治理在 Supplier 和 Crisis 两个场景下的效果，并交叉论证旧结论。
 *
 * 设计：
 *   2 场景 × 3 治理模式 = 6 配置
 *   每个配置 3 seeds × 1 run = 3 runs
 *   总计：18 runs
 *
 * 对比维度：
 *   - none vs cognitive：非破坏性干预是否改善决策质量
 *   - none vs belief：旧治理体系是否仍有破坏性
 *   - Supplier vs Crisis：场景难度是否影响治理效果
 */

import type { ExperimentConfig } from "../types";

const MEDIUM_SEEDS = [42, 123, 456];

// ============================================================================
// Supplier 场景
// ============================================================================

export const E9M_SUPPLIER_NONE: ExperimentConfig = {
  id: "e9m_supplier_none",
  hypothesis: "H9",
  title: "E9M — Supplier 无治理",
  scenario: "supplier",
  runtimeModes: ["native_cognitive"],
  governanceMode: "none",
  agentCount: 5,
  maxRounds: 3,
  runsPerSeed: 1,
  seeds: MEDIUM_SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: false,
  description: "Medium-scale: Supplier none governance baseline",
};

export const E9M_SUPPLIER_BELIEF: ExperimentConfig = {
  id: "e9m_supplier_belief",
  hypothesis: "H9",
  title: "E9M — Supplier Belief 治理",
  scenario: "supplier",
  runtimeModes: ["native_cognitive"],
  governanceMode: "full",
  agentCount: 5,
  maxRounds: 3,
  runsPerSeed: 1,
  seeds: MEDIUM_SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: false,
  description: "Medium-scale: Supplier belief-based governance (旧治理对照)",
};

export const E9M_SUPPLIER_COGNITIVE: ExperimentConfig = {
  id: "e9m_supplier_cognitive",
  hypothesis: "H9",
  title: "E9M — Supplier Cognitive 治理",
  scenario: "supplier",
  runtimeModes: ["native_cognitive"],
  governanceMode: "cognitive",
  agentCount: 5,
  maxRounds: 3,
  runsPerSeed: 1,
  seeds: MEDIUM_SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: false,
  description: "Medium-scale: Supplier cognitive governance",
};

// ============================================================================
// Crisis 场景（已修复答案泄露）
// ============================================================================

export const E9M_CRISIS_NONE: ExperimentConfig = {
  id: "e9m_crisis_none",
  hypothesis: "H9",
  title: "E9M — Crisis 无治理（修复后）",
  scenario: "crisis",
  runtimeModes: ["native_cognitive"],
  governanceMode: "none",
  agentCount: 5,
  maxRounds: 3,
  runsPerSeed: 1,
  seeds: MEDIUM_SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: false,
  description: "Medium-scale: Crisis none governance baseline (fixed leakage)",
};

export const E9M_CRISIS_BELIEF: ExperimentConfig = {
  id: "e9m_crisis_belief",
  hypothesis: "H9",
  title: "E9M — Crisis Belief 治理（修复后）",
  scenario: "crisis",
  runtimeModes: ["native_cognitive"],
  governanceMode: "full",
  agentCount: 5,
  maxRounds: 3,
  runsPerSeed: 1,
  seeds: MEDIUM_SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: false,
  description: "Medium-scale: Crisis belief-based governance (fixed leakage)",
};

export const E9M_CRISIS_COGNITIVE: ExperimentConfig = {
  id: "e9m_crisis_cognitive",
  hypothesis: "H9",
  title: "E9M — Crisis Cognitive 治理（修复后）",
  scenario: "crisis",
  runtimeModes: ["native_cognitive"],
  governanceMode: "cognitive",
  agentCount: 5,
  maxRounds: 3,
  runsPerSeed: 1,
  seeds: MEDIUM_SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: false,
  description: "Medium-scale: Crisis cognitive governance (fixed leakage)",
};

// ============================================================================
// 汇总导出
// ============================================================================

export const E9M_ALL = [
  E9M_SUPPLIER_NONE,
  E9M_SUPPLIER_BELIEF,
  E9M_SUPPLIER_COGNITIVE,
  E9M_CRISIS_NONE,
  E9M_CRISIS_BELIEF,
  E9M_CRISIS_COGNITIVE,
];