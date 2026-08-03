/**
 * E10: Evidence Pool — State-Centric Shared Evidence Pool（机制探路 smoke）
 *
 * 目的：把"每个 agent 各自重放 prose 记忆"升级为"全局去重原子事实池注入"，
 * 验证机制方向：结构化事实披露 vs prose 重放，是否提升 τ / IDR_end。
 *
 * 设计（与提案的差异，见 evaluation）：
 *  - 零 LLM 调用：canonicalize + hash + Jaccard char-bigram + 数值比较（全确定性）
 *  - 去重键保留数值：同 (dimension, targetItem) 数值不同是冲突，不合并
 *  - 池只收录 agent 实际输出的证据（非全知黑板书）→ 不摧毁 hidden-profile 构造
 *  - 无 δ 治理（governanceMode=none）→ 隔离"池"单因子，与 e9_v6_a_none 对照
 *
 * 对照：e10_v6_a_pool (seed 42, n=1) vs e9_v6_a_none (seed 42, n=1, 已有 pilot)
 * 指标：τ（结果）+ IDR_end（过程，idr_diffusion.ts）
 *
 * 诚实标注：n=1 单次 smoke，方向性证据；去重阈值/预算为启发式，需 E10 全量标定。
 */
import type { ExperimentConfig } from "../types";

/** university 任务碎片映射（同 idr_diffusion SCENARIO_SPECS） */
const UNIVERSITY_DIMENSIONS: Record<string, string> = {
  a1: "学术+科研",
  a2: "就业",
  a3: "地理",
  a4: "国际化+师生比",
  a5: "综合粗略",
};

export const E10_V6_A_POOL: ExperimentConfig = {
  id: "e10_v6_a_pool",
  hypothesis: "H10",
  title: "E10 Evidence Pool — University 场景（确定性共享证据池，无治理）",
  scenario: "university",
  runtimeModes: ["native_cognitive"],
  governanceMode: "none",
  agentCount: 5,
  maxRounds: 5,
  runsPerSeed: 1,
  seeds: [42],
  llmModel: "deepseek-v4-flash",
  temperature: 0.0,
  isMain: false,
  description:
    "E10 smoke：NativeCognitiveEngine 注入确定性共享证据池（结构化去重事实，零 LLM 调用，无 δ 治理）。对照 e9_v6_a_none，验证'结构化事实披露 vs prose 重放'机制方向（τ + IDR_end）",
  evidencePool: {
    enabled: true,
    dimensions: UNIVERSITY_DIMENSIONS,
    similarityThreshold: 0.75,
    maxChars: 800,
  },
};

export const E10_ALL = [E10_V6_A_POOL];
