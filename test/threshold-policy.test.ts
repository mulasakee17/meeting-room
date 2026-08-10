import { describe, expect, it } from "vitest";
import {
  REPORTED_BELIEF_CERTAINTY_V1,
  type EpistemicQuantityContractV1,
} from "@/lib/epistemic";
import {
  defineScalarThresholdPolicy,
  evaluateScalarThresholdPolicy,
  type ScalarQuantityObservation,
  type ScalarThresholdPolicyV1,
} from "@/lib/governance";

const QUANTITY_REF = {
  id: "swarmalpha.reported-belief-certainty",
  version: "1.0.0",
};

function policy(overrides: Partial<ScalarThresholdPolicyV1> = {}): ScalarThresholdPolicyV1 {
  return {
    id: "swarmalpha.threshold.test-certainty",
    version: "1.0.0",
    quantityRef: QUANTITY_REF,
    operator: "gte",
    bounds: { lower: 0.5 },
    authority: {
      kind: "randomized_experiment_only",
      preregistrationRef: { id: "swarmalpha.prereg.test-certainty", version: "1.0.0" },
    },
    selection: {
      kind: "fixed_preregistered",
      methodRef: { id: "swarmalpha.method.fixed-threshold", version: "1.0.0" },
    },
    costs: { falsePositive: 1, falseNegative: 1, abstention: 0, action: 1 },
    missingResult: "ineligible",
    frozenAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function observation(
  overrides: Partial<ScalarQuantityObservation> = {},
): ScalarQuantityObservation {
  return {
    id: "observation:1",
    quantityRef: QUANTITY_REF,
    observedAt: "2026-08-10T01:00:00.000Z",
    sourceObservationIds: ["source:1"],
    value: 0.7,
    ...overrides,
  };
}

describe("ScalarThresholdPolicyV1", () => {
  it("defines a preregistered randomized eligibility policy", () => {
    expect(defineScalarThresholdPolicy(policy(), REPORTED_BELIEF_CERTAINTY_V1))
      .toMatchObject({ missingResult: "ineligible", operator: "gte" });
  });

  it("rejects quantities that are truth-dependent, non-scalar, or unauthorized for eligibility", () => {
    expect(() => defineScalarThresholdPolicy(policy(), {
      ...REPORTED_BELIEF_CERTAINTY_V1,
      truthAccess: "required",
    })).toThrow(/truth-dependent|post-resolution/);
    expect(() => defineScalarThresholdPolicy(policy(), {
      ...REPORTED_BELIEF_CERTAINTY_V1,
      allowedUses: ["descriptive"],
    })).toThrow("not authorized for eligibility");
    const booleanQuantity: EpistemicQuantityContractV1 = {
      ...REPORTED_BELIEF_CERTAINTY_V1,
      valueDomain: { kind: "boolean" },
    };
    expect(() => defineScalarThresholdPolicy(policy(), booleanQuantity))
      .toThrow("require a scalar quantity");
  });

  it("rejects out-of-domain and inverted bounds", () => {
    expect(() => defineScalarThresholdPolicy(
      policy({ bounds: { lower: 1.5 } }),
      REPORTED_BELIEF_CERTAINTY_V1,
    )).toThrow("outside the quantity domain");
    expect(() => defineScalarThresholdPolicy(
      policy({ operator: "between", bounds: { lower: 0.9, upper: 0.1 } }),
      REPORTED_BELIEF_CERTAINTY_V1,
    )).toThrow("lower <= upper");
  });

  it("returns missing observations as explicitly ineligible", () => {
    const result = evaluateScalarThresholdPolicy(
      policy(),
      REPORTED_BELIEF_CERTAINTY_V1,
      observation({
        value: undefined,
        missing: { reason: "report_absent", missingFields: ["belief_report"] },
      }),
      "2026-08-10T02:00:00.000Z",
    );
    expect(result).toMatchObject({ outcome: "missing", eligible: false });
  });

  it("includes the gte equality boundary", () => {
    const result = evaluateScalarThresholdPolicy(
      policy(),
      REPORTED_BELIEF_CERTAINTY_V1,
      observation({ value: 0.5 }),
      "2026-08-10T02:00:00.000Z",
    );
    expect(result).toMatchObject({ outcome: "eligible", eligible: true });
  });

  it("requires preregistration before observation and evaluation after observation", () => {
    expect(() => evaluateScalarThresholdPolicy(
      policy({ frozenAt: "2026-08-10T01:30:00.000Z" }),
      REPORTED_BELIEF_CERTAINTY_V1,
      observation(),
      "2026-08-10T02:00:00.000Z",
    )).toThrow("frozen before the observation");
    expect(() => evaluateScalarThresholdPolicy(
      policy(),
      REPORTED_BELIEF_CERTAINTY_V1,
      observation(),
      "2026-08-10T00:30:00.000Z",
    )).toThrow("cannot precede its observation");
  });

  it("keeps uncalibrated randomized thresholds fixed and preregistered", () => {
    expect(() => defineScalarThresholdPolicy(policy({
      selection: {
        kind: "calibration_derived",
        methodRef: { id: "swarmalpha.method.calibrated", version: "1.0.0" },
        calibrationArtifactRef: { id: "swarmalpha.calibration.test", version: "1.0.0" },
      },
    }), REPORTED_BELIEF_CERTAINTY_V1)).toThrow("fixed and preregistered");
    expect(() => defineScalarThresholdPolicy(
      policy(),
      REPORTED_BELIEF_CERTAINTY_V1,
      { artifactRef: { id: "unused", version: "1.0.0" } } as never,
    )).toThrow("must not receive a calibration artifact");
  });

  it("emits eligibility only, never an action", () => {
    const result = evaluateScalarThresholdPolicy(
      policy(),
      REPORTED_BELIEF_CERTAINTY_V1,
      observation(),
      "2026-08-10T02:00:00.000Z",
    );
    expect(result).not.toHaveProperty("action");
    expect(result).not.toHaveProperty("actionRef");
  });
});
