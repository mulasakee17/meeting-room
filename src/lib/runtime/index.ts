export * from "./types";

// observation 和 inference 模块被 DiscussionEngine 实际使用，保留 re-export
export { ObservationLayer } from "../observation";
export type { RawObservation, ObservationConfig, PromptBuilder, OpinionParser, ObserverAgent } from "../observation";
export { InferenceLayer } from "../inference";
export type { StateDelta, EdgeDelta, InfluenceCalculation, InferenceConfig, InfluenceCalculator, BeliefInferrer } from "../inference";

// 以下模块为孤儿代码（实现完整但无生产消费者），已移除：
// - researchRuntime.ts (SwarmAlphaRuntime)
// - scheduler.ts (RuntimeScheduler)
// - context.ts (RuntimeContextManager, DefaultAgentPool)
// - eventBus.ts (RuntimeEventBus)
// - adapters.ts (DiscussionAdapter, EvaluationAdapter, GovernanceAdapter)
// - termination.ts (TerminationChecker 及各策略)
// 生产路径使用 src/runtime/GovernanceRuntime.ts + src/lib/pipeline.ts
