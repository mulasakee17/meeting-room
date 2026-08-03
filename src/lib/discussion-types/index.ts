export * from "./types";

// observation 和 inference 模块被 DiscussionEngine 实际使用，保留 re-export
export { ObservationLayer } from "../observation";
export type { RawObservation, ObservationConfig, PromptBuilder, OpinionParser, ObserverAgent } from "../observation";
export { InferenceLayer } from "../inference";
export type { StateDelta, EdgeDelta, InfluenceCalculation, InferenceConfig, InfluenceCalculator, BeliefInferrer } from "../inference";

// 命名区分：本目录（discussion-types）是 discussion/inference/observation 共享的类型定义；
// src/runtime/ 是当前生产治理运行时实现（GovernanceRuntime + adapters）。
