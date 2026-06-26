/**
 * SwarmAlpha v9.5 — Financial Collective Intelligence Laboratory
 *
 * 入口模块。在 v9.3 结果之上叠加:
 *   1. Agent 社交互动层
 *   2. 共识度量计算
 *   3. 互动前后对比
 *   4. 🆕 v9.5.2: 动态权重引擎 (级联状态自适应)
 *
 * 纯增量架构 — 不修改任何 v9.3 代码。
 */

export { runInteraction, buildSocialProfiles, formatInteractionSummary } from "./interaction";
export { computeAllMetrics, computeConsensusScore, computePolarizationScore, computeFragilityScore, computeInteractionEffect } from "./metrics";
export { computeDynamicWeights, formatDynamicWeightSummary } from "./dynamicWeights";
export type { SocialProfile, InteractionRound, InteractionResult, ConsensusMetrics, V9_5Extension, AgentWeightAdjustment, DynamicWeightResult } from "./types";
export type { MarketSnapshot } from "./dynamicWeights";
export { SOCIAL_ALPHAS } from "./types";
