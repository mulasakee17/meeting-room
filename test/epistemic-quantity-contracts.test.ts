import { describe, expect, it } from "vitest";
import {
  EpistemicQuantityRegistry,
  defineEpistemicQuantity,
  summarizeBeliefGeometry,
  type EpistemicQuantityContractV1,
} from "@/lib/epistemic";
import type { EpistemicClaim } from "@/lib/epistemic";

function quantity(
  overrides: Partial<EpistemicQuantityContractV1> = {},
): EpistemicQuantityContractV1 {
  return {
    id: "test.quantity",
    version: "1.0.0",
    label: "Test quantity",
    semanticLayer: "derived_epistemic",
    constructDefinition: "A fixture quantity with an explicit construct boundary.",
    valueDomain: { kind: "probability" },
    sourceLayers: ["reported_belief"],
    estimatorRef: { id: "test.estimator", version: "1.0.0" },
    availableFrom: "during_discussion",
    truthAccess: "forbidden",
    domainScope: { kind: "all_registered_claim_domains" },
    comparability: { mode: "within_contract_version", keys: ["belief_kind"] },
    reliability: { status: "unknown" },
    constructValidity: { status: "operationalized", rationale: "Defined exactly by the fixture." },
    calibration: { status: "uncalibrated" },
    missingness: {
      representation: "explicit_missing_record",
      zeroMeansMissing: false,
      allowedReasons: ["report_absent"],
    },
    allowedUses: ["descriptive", "monitoring"],
    forbiddenInterpretations: ["latent cognition"],
    limitations: ["Fixture only."],
    claimCeiling: "C0",
    ...overrides,
  };
}

function binaryClaim(): EpistemicClaim {
  return {
    id: "claim:binary",
    proposition: "The proposition is true.",
    domain: "test",
    createdAt: "2026-08-10T00:00:00.000Z",
    resolutionPolicy: { kind: "binary", resolverId: "resolver:test" },
  };
}

function categoricalClaim(options: string[]): EpistemicClaim {
  return {
    id: "claim:categorical",
    proposition: "Which option is correct?",
    domain: "test",
    createdAt: "2026-08-10T00:00:00.000Z",
    options,
    resolutionPolicy: { kind: "categorical", resolverId: "resolver:test" },
  };
}

describe("EpistemicQuantityContractV1", () => {
  it("rejects unknown runtime enums and malformed versions", () => {
    expect(() => defineEpistemicQuantity(quantity({ semanticLayer: "latent_mind" as never }))).toThrow();
    expect(() => defineEpistemicQuantity(quantity({ version: "1.0" }))).toThrow();
    expect(() => defineEpistemicQuantity(quantity({ allowedUses: ["punish"] as never }))).toThrow();
    expect(() => defineEpistemicQuantity(quantity({ claimCeiling: "C9" as never }))).toThrow();
  });

  it("rejects invalid scalar and structured domains", () => {
    expect(() => defineEpistemicQuantity(quantity({
      valueDomain: { kind: "bounded_scalar", min: 1, max: 0 },
    }))).toThrow("finite min <= max");
    expect(() => defineEpistemicQuantity(quantity({
      valueDomain: {
        kind: "structured",
        schemaRef: { id: "test.schema", version: "1" },
      },
    }))).toThrow();
  });

  it("requires explicit missingness and never treats zero as missing", () => {
    expect(() => defineEpistemicQuantity(quantity({
      missingness: {
        representation: "explicit_missing_record",
        zeroMeansMissing: true as false,
        allowedReasons: ["report_absent"],
      },
    }))).toThrow("must not encode missing as zero");
    expect(() => defineEpistemicQuantity(quantity({
      missingness: {
        representation: "explicit_missing_record",
        zeroMeansMissing: false,
        allowedReasons: [],
      },
    }))).toThrow();
  });

  it("rejects duplicate source layers, uses, and comparability keys", () => {
    expect(() => defineEpistemicQuantity(quantity({
      sourceLayers: ["reported_belief", "reported_belief"],
    }))).toThrow("must not contain duplicates");
    expect(() => defineEpistemicQuantity(quantity({
      allowedUses: ["descriptive", "descriptive"],
    }))).toThrow("must not contain duplicates");
    expect(() => defineEpistemicQuantity(quantity({
      comparability: { mode: "within_contract_version", keys: ["kind", "kind"] },
    }))).toThrow("must not contain duplicates");
  });

  it("prevents truth-dependent quantities from driving eligibility or control", () => {
    expect(() => defineEpistemicQuantity(quantity({
      truthAccess: "required",
      availableFrom: "post_resolution",
      allowedUses: ["eligibility"],
    }))).toThrow("cannot drive pre-resolution");
    expect(() => defineEpistemicQuantity(quantity({
      truthAccess: "required",
      availableFrom: "during_discussion",
      allowedUses: ["descriptive"],
    }))).toThrow("post-resolution");
  });

  it("requires held-out support and evaluation for operational control", () => {
    expect(() => defineEpistemicQuantity(quantity({
      allowedUses: ["operational_control"],
    }))).toThrow("held-out construct support");
    expect(defineEpistemicQuantity(quantity({
      allowedUses: ["operational_control"],
      constructValidity: {
        status: "held_out_supported",
        evidenceRef: { id: "test.validity", version: "1.0.0" },
      },
      calibration: {
        status: "held_out_evaluated",
        artifactRef: { id: "test.calibration", version: "1.0.0" },
        calibrationDomain: "test:binary",
      },
    })).allowedUses).toEqual(["operational_control"]);
  });

  it("does not let an unsupported quantity grant predictive or causal claim authority", () => {
    expect(() => defineEpistemicQuantity(quantity({
      constructValidity: { status: "descriptive_only" },
      claimCeiling: "C1",
    }))).toThrow("cannot exceed claim ceiling C0");
    expect(() => defineEpistemicQuantity(quantity({ claimCeiling: "C2" })))
      .toThrow("cannot authorize causal or mechanism claims");
  });

  it("isolates registry versions and fails closed when sealed or unknown", () => {
    const registry = new EpistemicQuantityRegistry([quantity()]);
    registry.register(quantity({ version: "2.0.0" }));
    expect(() => registry.register(quantity())).toThrow("already exists");
    expect(() => registry.get({ id: "test.unknown", version: "1.0.0" })).toThrow("not registered");
    registry.seal();
    expect(() => registry.register(quantity({ id: "test.later" }))).toThrow("sealed");
  });
});

describe("belief geometry", () => {
  it("treats binary p=0.95 and p=0.05 as equally certain", () => {
    const positive = summarizeBeliefGeometry(binaryClaim(), { kind: "binary", probability: 0.95 });
    const negative = summarizeBeliefGeometry(binaryClaim(), { kind: "binary", probability: 0.05 });
    expect(positive.certainty).toBeCloseTo(0.95);
    expect(negative.certainty).toBeCloseTo(0.95);
    expect(positive.predictedOutcomes).toEqual([true]);
    expect(negative.predictedOutcomes).toEqual([false]);
  });

  it("represents binary p=0.5 as an explicit tie", () => {
    const result = summarizeBeliefGeometry(binaryClaim(), { kind: "binary", probability: 0.5 });
    expect(result).toMatchObject({
      kind: "binary",
      certainty: 0.5,
      topTwoMargin: 0,
      predictedOutcomes: [false, true],
    });
  });

  it("makes categorical geometry independent of canonical option order", () => {
    const probabilities = { alpha: 0.4, beta: 0.4, gamma: 0.2 };
    const left = summarizeBeliefGeometry(
      categoricalClaim(["alpha", "beta", "gamma"]),
      { kind: "categorical", probabilities },
    );
    const right = summarizeBeliefGeometry(
      categoricalClaim(["gamma", "beta", "alpha"]),
      { kind: "categorical", probabilities },
    );
    expect(left.certainty).toBe(right.certainty);
    expect(left.topTwoMargin).toBe(right.topTwoMargin);
    expect(left.normalizedEntropy).toBeCloseTo(right.normalizedEntropy);
    expect(left.predictedOutcomes).toEqual(["alpha", "beta"]);
    expect(right.predictedOutcomes).toEqual(["alpha", "beta"]);
  });
});
