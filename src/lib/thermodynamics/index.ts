/**
 * SwarmAlpha Thermodynamics Module
 *
 * 提供独立于讨论模式、治理策略、拓扑结构的版本化宏观监测和认知状态投影。
 *
 * 核心组件:
 * - MeasurementLayer: 计算 cognitive macro signal set 并追踪结构化状态
 * - TerminationDecider: 兼容旧路径的实验性启发式停止策略
 */

export { MeasurementLayer } from "./MeasurementLayer";
export type {
  CognitiveMacroState,
  ThermoState,
  CognitiveUpdateMode,
  CognitiveUpdateOptions,
  CognitiveUpdateResult,
  MonitoringControlOptions,
} from "./MeasurementLayer";

export { TerminationDecider, DEFAULT_TERMINATION_THRESHOLDS } from "./TerminationDecider";
