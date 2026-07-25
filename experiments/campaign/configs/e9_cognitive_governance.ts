/**
 * E9: Cognitive State Driven Governance (H9)
 *
 * 核心目标：在 Supplier 场景中，证明 Cognitive-State Driven Governance
 * 能够通过可解释干预改善 Multi-Agent Collective Decision Quality。
 *
 * 三组对照：
 *   A. 无治理 (none)            — baseline
 *   B. Belief-based 治理 (full)  — 旧治理体系
 *   C. Cognitive 治理 (cognitive) — 新治理体系
 *
 * 场景选择：仅 Supplier（供应商选择）。Crisis 因存在结构性泄露已排除——
 * 最高权重维度（有效性，0.30）的独立排序等于正确答案 C>B>A>E>D。
 *
 * 每个配置：10 seeds × 5 runs = 50 runs
 * 总计：3 组 × 1 场景 × 50 = 150 runs
 */
import type { ExperimentConfig } from "../types";

const BASE_SEEDS = [42, 123, 456, 789, 1024, 2048, 4096, 8192, 16384, 32768];

// ============================================================================
// Supplier 场景
// ============================================================================

export const E9_SUPPLIER_NONE: ExperimentConfig = {
  id: "e9_supplier_none",
  hypothesis: "H9",
  title: "Cognitive Governance — Supplier 场景 (无治理 baseline)",
  scenario: "supplier",
  runtimeModes: ["native_cognitive"],
  governanceMode: "none",
  agentCount: 5,
  maxRounds: 3,
  runsPerSeed: 5,
  seeds: BASE_SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: true,
  description: "Supplier 场景无治理 baseline，用于对比认知治理效果",
};

export const E9_SUPPLIER_BELIEF: ExperimentConfig = {
  id: "e9_supplier_belief",
  hypothesis: "H9",
  title: "Cognitive Governance — Supplier 场景 (Belief-based 治理)",
  scenario: "supplier",
  runtimeModes: ["native_cognitive"],
  governanceMode: "full",
  agentCount: 5,
  maxRounds: 3,
  runsPerSeed: 5,
  seeds: BASE_SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: true,
  description: "Supplier 场景 Belief-based 治理对照，与认知治理对比",
};

export const E9_SUPPLIER_COGNITIVE: ExperimentConfig = {
  id: "e9_supplier_cognitive",
  hypothesis: "H9",
  title: "Cognitive Governance — Supplier 场景 (Cognitive 治理)",
  scenario: "supplier",
  runtimeModes: ["native_cognitive"],
  governanceMode: "cognitive",
  agentCount: 5,
  maxRounds: 3,
  runsPerSeed: 5,
  seeds: BASE_SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: true,
  description: "Supplier 场景 Cognitive-State Driven Governance，6 个认知检测器 + 3 类认知干预",
};

// ============================================================================
// 汇总导出
// ============================================================================

export const E9_ALL = [
  E9_SUPPLIER_NONE,
  E9_SUPPLIER_BELIEF,
  E9_SUPPLIER_COGNITIVE,
];