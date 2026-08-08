import type { EpistemicQuantityLayer } from "../epistemic/semantics";

export type MonitoringInterpretation =
  | "descriptive"
  | "predictive_candidate"
  | "control_heuristic";

export type MonitoringCalibration =
  | {
      status: "uncalibrated";
      controlUse: "forbidden_by_default";
    }
  | {
      status: "calibrated";
      controlUse: "experimental_only" | "allowed";
      methodId: string;
      methodVersion: string;
      calibrationDomain: string;
    };

/**
 * A monitoring signal is a versioned projection from observable records.
 * The contract prevents descriptive proxies from silently becoming latent
 * mental states, physical quantities, or validated control variables.
 */
export interface MonitoringSignalContract {
  id: string;
  version: string;
  label: string;
  description: string;
  formula: string;
  observationUnit: "round" | "utterance" | "run" | "evaluation_window";
  sourceLayers: readonly EpistemicQuantityLayer[];
  valueDomain: {
    min: number;
    max: number;
  };
  interpretation: MonitoringInterpretation;
  calibration: MonitoringCalibration;
  physicalQuantity: false;
  claimCeiling: "C0_descriptive" | "C1_predictive";
  comparability: "within_signal_version_only" | "within_calibration_domain";
  missingness: "zero_is_defined" | "not_available";
  limitations: readonly string[];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export function defineMonitoringSignal(
  contract: MonitoringSignalContract,
): Readonly<MonitoringSignalContract> {
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(contract.id)) {
    throw new Error(`Invalid monitoring signal id: ${contract.id}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(contract.version)) {
    throw new Error(`Invalid monitoring signal version: ${contract.version}`);
  }
  if (!Number.isFinite(contract.valueDomain.min)
    || !Number.isFinite(contract.valueDomain.max)
    || contract.valueDomain.min > contract.valueDomain.max) {
    throw new Error(`Invalid value domain for monitoring signal ${contract.id}`);
  }
  if (contract.sourceLayers.length === 0) {
    throw new Error(`Monitoring signal ${contract.id} must declare a source layer`);
  }
  if (contract.calibration.status === "uncalibrated"
    && contract.claimCeiling !== "C0_descriptive") {
    throw new Error(`Uncalibrated signal ${contract.id} cannot exceed C0_descriptive`);
  }
  return deepFreeze(structuredClone(contract));
}

export const COGNITIVE_MACRO_SIGNAL_SET = Object.freeze({
  id: "swarmalpha.cognitive_macro",
  version: "1.0.0",
});

const UNCALIBRATED = Object.freeze({
  status: "uncalibrated" as const,
  controlUse: "forbidden_by_default" as const,
});

export const REPORTED_UTILITY_ALIGNMENT_V1 = defineMonitoringSignal({
  id: "swarmalpha.reported_utility_alignment",
  version: "1.0.0",
  label: "Reported utility alignment",
  description: "Mean pairwise cosine alignment of agent-reported utility vectors, mapped to [0,1].",
  formula: "mean_pairwise((cos(u_i,u_j)+1)/2)",
  observationUnit: "round",
  sourceLayers: ["reported_state"],
  valueDomain: { min: 0, max: 1 },
  interpretation: "descriptive",
  calibration: UNCALIBRATED,
  physicalQuantity: false,
  claimCeiling: "C0_descriptive",
  comparability: "within_signal_version_only",
  missingness: "zero_is_defined",
  limitations: [
    "Agent-reported utility is not latent preference or true belief.",
    "Alignment does not imply correctness or epistemic adequacy.",
  ],
});

export const UPDATE_VOLATILITY_V1 = defineMonitoringSignal({
  id: "swarmalpha.update_volatility",
  version: "1.0.0",
  label: "Reported utility update volatility",
  description: "Mean normalized L2 change in reported utility vectors between adjacent rounds.",
  formula: "mean_i(||u_i,t-u_i,t-1||_2/(2*sqrt(K)))",
  observationUnit: "round",
  sourceLayers: ["reported_state", "behavioral_telemetry"],
  valueDomain: { min: 0, max: 1 },
  interpretation: "descriptive",
  calibration: UNCALIBRATED,
  physicalQuantity: false,
  claimCeiling: "C0_descriptive",
  comparability: "within_signal_version_only",
  missingness: "zero_is_defined",
  limitations: [
    "Zero in the first observed round means no prior comparable report, not stability.",
    "Change may reflect parser or option-set changes rather than social influence.",
  ],
});

export const EVIDENCE_SUPPORT_ENTROPY_V1 = defineMonitoringSignal({
  id: "swarmalpha.evidence_support_entropy",
  version: "1.0.0",
  label: "Evidence-support entropy",
  description: "Normalized entropy of support labels among evidence items present in reported state.",
  formula: "H(support(evidence_items))/log(number_of_observed_support_categories)",
  observationUnit: "round",
  sourceLayers: ["reported_state"],
  valueDomain: { min: 0, max: 1 },
  interpretation: "descriptive",
  calibration: UNCALIBRATED,
  physicalQuantity: false,
  claimCeiling: "C0_descriptive",
  comparability: "within_signal_version_only",
  missingness: "zero_is_defined",
  limitations: [
    "Entropy over observed supports is not evidence sufficiency or truth coverage.",
    "Duplicate or fabricated evidence can change the signal unless separately verified.",
  ],
});

export const REPORTED_UTILITY_INTENSITY_V1 = defineMonitoringSignal({
  id: "swarmalpha.reported_utility_intensity",
  version: "1.0.0",
  label: "Reported utility intensity",
  description: "Mean normalized L2 magnitude of agent-reported utility vectors.",
  formula: "mean_i(min(1,||u_i||_2/sqrt(K_union)))",
  observationUnit: "round",
  sourceLayers: ["reported_state"],
  valueDomain: { min: 0, max: 1 },
  interpretation: "descriptive",
  calibration: UNCALIBRATED,
  physicalQuantity: false,
  claimCeiling: "C0_descriptive",
  comparability: "within_signal_version_only",
  missingness: "zero_is_defined",
  limitations: [
    "Magnitude depends on the reporting scale and option dimensionality.",
    "Intensity is not confidence, commitment, energy, or correctness.",
  ],
});

export const UTILITY_VOLATILITY_ENTROPY_COMPOSITE_V1 = defineMonitoringSignal({
  id: "swarmalpha.utility_volatility_entropy_composite",
  version: "1.0.0",
  label: "Utility-volatility-entropy composite",
  description: "Uncalibrated compatibility composite formerly exposed as native-path F.",
  formula: "reported_utility_intensity-update_volatility*evidence_support_entropy",
  observationUnit: "round",
  sourceLayers: ["reported_state", "behavioral_telemetry"],
  valueDomain: { min: -1, max: 1 },
  interpretation: "control_heuristic",
  calibration: UNCALIBRATED,
  physicalQuantity: false,
  claimCeiling: "C0_descriptive",
  comparability: "within_signal_version_only",
  missingness: "zero_is_defined",
  limitations: [
    "The terms have no demonstrated physical conjugacy or shared units.",
    "It must not be called free energy or used as a default control signal.",
  ],
});

export const LEGACY_SCALAR_DISORDER_SCORE_V1 = defineMonitoringSignal({
  id: "swarmalpha.legacy_scalar_disorder_score",
  version: "1.0.0",
  label: "Legacy scalar disorder score",
  description: "Compatibility score used by the frozen scalar-belief path.",
  formula: "(1-kuramoto_order)+normalized_belief_std*belief_histogram_entropy",
  observationUnit: "evaluation_window",
  sourceLayers: ["behavioral_telemetry"],
  valueDomain: { min: 0, max: 2 },
  interpretation: "control_heuristic",
  calibration: UNCALIBRATED,
  physicalQuantity: false,
  claimCeiling: "C0_descriptive",
  comparability: "within_signal_version_only",
  missingness: "zero_is_defined",
  limitations: [
    "This score is not semantically comparable to the cognitive macro composite.",
    "Its components are structurally coupled and task-dependent.",
    "The evaluation window may be an utterance checkpoint, discussion round, or final run summary and must be recorded by the caller.",
  ],
});

export const COGNITIVE_MACRO_SIGNAL_CONTRACTS = Object.freeze([
  REPORTED_UTILITY_ALIGNMENT_V1,
  UPDATE_VOLATILITY_V1,
  EVIDENCE_SUPPORT_ENTROPY_V1,
  REPORTED_UTILITY_INTENSITY_V1,
  UTILITY_VOLATILITY_ENTROPY_COMPOSITE_V1,
] as const);
