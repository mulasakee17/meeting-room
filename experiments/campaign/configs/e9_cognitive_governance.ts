/**
 * E9: Cognitive State Driven Governance (H9) — v6 Phase 3 实验配置
 *
 * v6 Phase 2.8 重构（2026-07-30）：
 *   - 4 组对照（A/B/C/D），匹配 ROADMAP §5.3 实验矩阵
 *   - maxRounds=5（原 3），让 δ 跨轮指标有足够观测窗口
 *   - C 组启用 useSemanticTool（异步 Tier 1→2→3 含 SemanticTool）
 *   - D 组新增：旧 6 检测器路径（向后兼容基线）
 *   - 场景：university（8 所大学 × 6 维度 hidden-profile）
 *
 * 四组对照：
 *   A. 无治理 (none)              — baseline
 *   B. δ adaptive 治理 (cognitive) — 主实验组，纯数学路径
 *   C. δ + SemanticTool (cognitive + useSemanticTool) — LLM 增强
 *   D. 旧检测器 (full, useCognitiveGovernance=false) — 向后兼容基线
 *
 * 每个配置：10 seeds × 5 runs = 50 runs
 * 总计：4 组 × 1 场景 × 50 = 200 runs
 *
 * 主比较：
 *   Δτ (B-A): δ 治理效果（primary endpoint）
 *   Δτ (C-B): SemanticTool 增量贡献（secondary endpoint）
 *   Δτ (B-D): δ vs 旧检测器（non-inferiority）
 *   Δτ (C-A): 完整混合范式效果
 */
import type { ExperimentConfig } from "../types";

const BASE_SEEDS = [42, 123, 456, 789, 1024, 2048, 4096, 8192, 16384, 32768];

// ============================================================================
// A 组：无治理基线
// ============================================================================

export const E9_V6_A_NONE: ExperimentConfig = {
  id: "e9_v6_a_none",
  hypothesis: "H9",
  title: "V6 Cognitive Governance — University 场景 (A组: 无治理 baseline)",
  scenario: "university",
  runtimeModes: ["native_cognitive"],
  governanceMode: "none",
  agentCount: 5,
  maxRounds: 5,
  runsPerSeed: 5,
  seeds: BASE_SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: true,
  description: "V6 A组：无治理基线，用于对比 δ 治理与 SemanticTool 增量效果",
};

// ============================================================================
// B 组：δ 自适应治理（主实验组，纯数学路径）
// ============================================================================

export const E9_V6_B_DELTA: ExperimentConfig = {
  id: "e9_v6_b_delta",
  hypothesis: "H9",
  title: "V6 Cognitive Governance — University 场景 (B组: δ 自适应治理)",
  scenario: "university",
  runtimeModes: ["native_cognitive"],
  governanceMode: "cognitive",
  agentCount: 5,
  maxRounds: 5,
  runsPerSeed: 5,
  seeds: BASE_SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: true,
  description: "V6 B组：δ 驱动治理（Tier 1→2 纯数学路径），自适应阈值，主实验组",
};

// ============================================================================
// C 组：δ + SemanticTool（LLM 增强，异步 Tier 1→2→3 路径）
// ============================================================================

export const E9_V6_C_SEMANTIC: ExperimentConfig = {
  id: "e9_v6_c_semantic",
  hypothesis: "H9",
  title: "V6 Cognitive Governance — University 场景 (C组: δ + SemanticTool)",
  scenario: "university",
  runtimeModes: ["native_cognitive"],
  governanceMode: "cognitive",
  agentCount: 5,
  maxRounds: 5,
  runsPerSeed: 5,
  seeds: BASE_SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: true,
  description: "V6 C组：δ + SemanticTool 混合范式（Tier 1→2→3 含 LLM 语义传感器），验证 LLM 作为工具的增量贡献",
  useSemanticTool: true,
};

// ============================================================================
// D 组：旧 6 检测器路径（向后兼容基线）
// ============================================================================

export const E9_V6_D_OLD: ExperimentConfig = {
  id: "e9_v6_d_old",
  hypothesis: "H9",
  title: "V6 Cognitive Governance — University 场景 (D组: 旧检测器基线)",
  scenario: "university",
  runtimeModes: ["native_cognitive"],
  governanceMode: "full",
  agentCount: 5,
  maxRounds: 5,
  runsPerSeed: 5,
  seeds: BASE_SEEDS,
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: true,
  description: "V6 D组：旧 6 检测器治理路径（governanceMode=full, useCognitiveGovernance=false），向后兼容基线，用于 δ vs 旧检测器非劣效性比较",
};

// ============================================================================
// 汇总导出
// ============================================================================

export const E9_ALL = [
  E9_V6_A_NONE,
  E9_V6_B_DELTA,
  E9_V6_C_SEMANTIC,
  E9_V6_D_OLD,
];

// 向后兼容：保留旧命名（指向新配置，避免破坏 run_all.ts 等引用）
/** @deprecated 使用 E9_V6_A_NONE 替代 */
export const E9_SUPPLIER_NONE = E9_V6_A_NONE;
/** @deprecated 使用 E9_V6_B_DELTA 替代 */
export const E9_SUPPLIER_BELIEF = E9_V6_B_DELTA;
/** @deprecated 使用 E9_V6_C_SEMANTIC 替代 */
export const E9_SUPPLIER_COGNITIVE = E9_V6_C_SEMANTIC;
