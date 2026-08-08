import { describe, expect, it } from "vitest";
import {
  COGNITIVE_MACRO_SIGNAL_CONTRACTS,
  COGNITIVE_MACRO_SIGNAL_SET,
  LEGACY_SCALAR_DISORDER_SCORE_V1,
  UTILITY_VOLATILITY_ENTROPY_COMPOSITE_V1,
  defineMonitoringSignal,
} from "@/lib/monitoring";

describe("monitoring signal contracts", () => {
  it("version-locks the cognitive macro signal set", () => {
    expect(COGNITIVE_MACRO_SIGNAL_SET).toEqual({
      id: "swarmalpha.cognitive_macro",
      version: "1.0.0",
    });
    expect(COGNITIVE_MACRO_SIGNAL_CONTRACTS).toHaveLength(5);
    expect(new Set(COGNITIVE_MACRO_SIGNAL_CONTRACTS.map(signal => signal.id)).size).toBe(5);
  });

  it("forbids default control and C1 claims for every uncalibrated signal", () => {
    for (const signal of [
      ...COGNITIVE_MACRO_SIGNAL_CONTRACTS,
      LEGACY_SCALAR_DISORDER_SCORE_V1,
    ]) {
      expect(signal.calibration).toEqual({
        status: "uncalibrated",
        controlUse: "forbidden_by_default",
      });
      expect(signal.claimCeiling).toBe("C0_descriptive");
      expect(signal.physicalQuantity).toBe(false);
    }
  });

  it("records that the native composite is not free energy", () => {
    expect(UTILITY_VOLATILITY_ENTROPY_COMPOSITE_V1.valueDomain).toEqual({ min: -1, max: 1 });
    expect(UTILITY_VOLATILITY_ENTROPY_COMPOSITE_V1.limitations.join(" ").toLowerCase())
      .toContain("free energy");
  });

  it("rejects an uncalibrated signal that claims predictive validity", () => {
    expect(() => defineMonitoringSignal({
      id: "test.invalid_prediction",
      version: "1.0.0",
      label: "invalid",
      description: "invalid",
      formula: "x",
      observationUnit: "round",
      sourceLayers: ["reported_state"],
      valueDomain: { min: 0, max: 1 },
      interpretation: "predictive_candidate",
      calibration: { status: "uncalibrated", controlUse: "forbidden_by_default" },
      physicalQuantity: false,
      claimCeiling: "C1_predictive",
      comparability: "within_signal_version_only",
      missingness: "not_available",
      limitations: [],
    })).toThrow(/cannot exceed C0_descriptive/);
  });

  it("deep-freezes contracts", () => {
    expect(Object.isFrozen(UTILITY_VOLATILITY_ENTROPY_COMPOSITE_V1)).toBe(true);
    expect(Object.isFrozen(UTILITY_VOLATILITY_ENTROPY_COMPOSITE_V1.valueDomain)).toBe(true);
    expect(Object.isFrozen(UTILITY_VOLATILITY_ENTROPY_COMPOSITE_V1.limitations)).toBe(true);
  });
});
