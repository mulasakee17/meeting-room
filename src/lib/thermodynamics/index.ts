/**
 * SwarmAlpha Thermodynamics Module
 *
 * 提供独立于讨论模式、治理策略、拓扑结构的社会热力学和认知状态测量。
 *
 * 核心组件:
 * - MeasurementLayer: 不变测量层，计算 R/T/H/F 和追踪认知状态
 * - TerminationDecider: 热力学终止决策器（异步讨论）
 */

export { MeasurementLayer } from "./MeasurementLayer";
export type {
  ThermoState,
  CognitiveUpdateMode,
  CognitiveUpdateOptions,
  CognitiveUpdateResult,
} from "./MeasurementLayer";

export { TerminationDecider, DEFAULT_TERMINATION_THRESHOLDS } from "./TerminationDecider";