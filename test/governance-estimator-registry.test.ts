import { describe, expect, it } from "vitest";
import {
  GovernanceEstimatorRegistry,
  canonicalizeEstimatorValue,
  fingerprintEstimatorValue,
  type GovernanceEstimatorContract,
} from "@/lib/epistemic";
import {
  PROGRESSIVE_ESTIMATOR_ID,
  PROGRESSIVE_ESTIMATOR_VERSION,
  defaultProgressiveEstimatorRegistry,
  type ProgressiveEstimatorConfig,
  type ProgressiveEstimatorInput,
  type ProgressiveEstimates,
} from "@/lib/thermodynamics/ProgressiveEstimator";

type SumInput = { values: number[] };
type SumConfig = { scale: number };
type SumOutput = { total: number };

const sumContract: GovernanceEstimatorContract<SumInput, SumOutput, SumConfig> = {
  id: "test.sum",
  version: "1.0.0",
  determinism: { kind: "deterministic" },
  defaultConfig: { scale: 1 },
  validateInput(input: unknown): asserts input is SumInput {
    if (!input || typeof input !== "object" || !Array.isArray((input as SumInput).values)) throw new Error("invalid input");
  },
  validateConfig(config: unknown): asserts config is SumConfig {
    if (!config || typeof config !== "object" || !Number.isFinite((config as SumConfig).scale)) throw new Error("invalid config");
  },
  estimate(input, config) {
    return { total: input.values.reduce((sum, value) => sum + value, 0) * config.scale };
  },
  validateOutput(output: unknown): asserts output is SumOutput {
    if (!output || typeof output !== "object" || !Number.isFinite((output as SumOutput).total)) throw new Error("invalid output");
  },
};

describe("GovernanceEstimatorRegistry", () => {
  it("canonicalizes object keys and fingerprints equivalent inputs identically", () => {
    expect(canonicalizeEstimatorValue({ beta: 2, alpha: [1, { z: true, a: null }] }))
      .toBe('{"alpha":[1,{"a":null,"z":true}],"beta":2}');
    expect(fingerprintEstimatorValue({ beta: 2, alpha: 1 }))
      .toBe(fingerprintEstimatorValue({ alpha: 1, beta: 2 }));
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    { missing: undefined },
    new Date("2026-08-07T00:00:00.000Z"),
    () => 1,
  ])("rejects non-canonical estimator value %#", value => {
    expect(() => canonicalizeEstimatorValue(value)).toThrow();
  });

  it("rejects sparse arrays and symbol-keyed objects instead of hashing lossy views", () => {
    const sparse = [1, 2];
    delete sparse[0];
    const symbolKeyed = { visible: 1, [Symbol("hidden")]: 2 };

    expect(() => canonicalizeEstimatorValue(sparse)).toThrow(/sparse arrays/);
    expect(() => canonicalizeEstimatorValue(symbolKeyed)).toThrow(/symbol keys/);
  });

  it("rejects cycles and accessor-backed state instead of executing hidden behavior", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const accessor = Object.defineProperty({}, "value", { enumerable: true, get: () => 1 });

    expect(() => canonicalizeEstimatorValue(cyclic)).toThrow(/cycles/);
    expect(() => canonicalizeEstimatorValue(accessor)).toThrow(/data property/);
  });

  it("rejects custom or accessor-backed array properties", () => {
    const custom = [1] as number[] & { note?: string };
    custom.note = "hidden";
    const accessor = [1];
    Object.defineProperty(accessor, "0", { enumerable: true, get: () => 1 });

    expect(() => canonicalizeEstimatorValue(custom)).toThrow(/custom properties/);
    expect(() => canonicalizeEstimatorValue(accessor)).toThrow(/data property/);
  });

  it("projects with exact version, stable fingerprints, and sorted unique sources", () => {
    const registry = new GovernanceEstimatorRegistry([sumContract]).seal();
    const first = registry.project<SumInput, SumOutput, SumConfig>("test.sum", "1.0.0", {
      name: "scaled_sum",
      input: { values: [1, 2, 3] },
      config: { scale: 2 },
      sourceEventIds: ["event:b", "event:a", "event:b"],
    });
    const second = registry.project<SumInput, SumOutput, SumConfig>("test.sum", "1.0.0", {
      name: "scaled_sum",
      input: { values: [1, 2, 3] },
      config: { scale: 2 },
      sourceEventIds: ["event:a", "event:b"],
    });

    expect(first.value).toEqual({ total: 12 });
    expect(first.sourceEventIds).toEqual(["event:a", "event:b"]);
    expect(first.determinism).toEqual({ kind: "deterministic" });
    expect(first.inputFingerprint).toBe(second.inputFingerprint);
    expect(first.configFingerprint).toBe(second.configFingerprint);
    expect(first.outputFingerprint).toBe(second.outputFingerprint);
  });

  it("isolates snapshots and rejects duplicate exact versions after sealing", () => {
    const registry = new GovernanceEstimatorRegistry([sumContract]);
    expect(() => registry.register(sumContract)).toThrow(/already exists/);
    const snapshot = registry.snapshot().seal();
    registry.register({ ...sumContract, version: "2.0.0" });

    expect(registry.list()).toHaveLength(2);
    expect(snapshot.list()).toEqual([{ id: "test.sum", version: "1.0.0" }]);
    expect(() => snapshot.register({ ...sumContract, version: "3.0.0" })).toThrow(/sealed/);
  });

  it("copies contracts on registration so later caller mutation cannot change semantics", () => {
    const mutable = {
      ...sumContract,
      defaultConfig: { scale: 2 },
    };
    const registry = new GovernanceEstimatorRegistry([mutable]).seal();
    mutable.defaultConfig.scale = 99;
    mutable.version = "9.9.9";

    const record = registry.project("test.sum", "1.0.0", {
      name: "isolated_sum",
      input: { values: [2] },
      sourceEventIds: [],
    });
    expect(record.value).toEqual({ total: 4 });
    expect(registry.list()).toEqual([{ id: "test.sum", version: "1.0.0" }]);
  });

  it("does not expose mutable registered semantics before the registry is sealed", () => {
    const registry = new GovernanceEstimatorRegistry([sumContract]);
    const exposed = registry.get<SumInput, SumOutput, SumConfig>("test.sum", "1.0.0");

    expect(() => { exposed.defaultConfig.scale = 7; }).toThrow();
    expect(registry.project("test.sum", "1.0.0", {
      name: "still_isolated",
      input: { values: [2] },
      sourceEventIds: [],
    }).value).toEqual({ total: 2 });
  });

  it("requires a safe integer seed for seeded estimators", () => {
    const seeded: GovernanceEstimatorContract<SumInput, SumOutput, SumConfig & { seed: number }> = {
      ...sumContract,
      id: "test.seeded",
      determinism: { kind: "seeded", seedField: "seed" },
      defaultConfig: { scale: 1, seed: 7 },
    };
    const registry = new GovernanceEstimatorRegistry([seeded]).seal();
    expect(registry.project("test.seeded", "1.0.0", {
      name: "seeded_sum",
      input: { values: [1] },
      sourceEventIds: [],
    }).determinism).toEqual({ kind: "seeded", seed: 7, seedField: "seed" });
    expect(() => registry.project("test.seeded", "1.0.0", {
      name: "seeded_sum",
      input: { values: [1] },
      config: { scale: 1, seed: 1.5 },
      sourceEventIds: [],
    })).toThrow(/safe integer/);
  });

  it("rejects behavior telemetry with the wrong field names", () => {
    expect(() => defaultProgressiveEstimatorRegistry.project(
      PROGRESSIVE_ESTIMATOR_ID,
      PROGRESSIVE_ESTIMATOR_VERSION,
      {
        name: "invalid_behavior_shape",
        input: {
          round: 1,
          agentId: "agent",
          agentRole: "analyst",
          behaviorEvents: { a: 0, b: 0, c: 0, d: 0, e: 0 },
          confidence: { stated: 0.5 },
          utilityHistory: [],
        },
        sourceEventIds: [],
      },
    )).toThrow(/five named/);
  });

  it("normalizes score-map key order before fingerprinting and estimation", () => {
    const input = (reverse: boolean): ProgressiveEstimatorInput => ({
      round: 3,
      agentId: "agent",
      agentRole: "analyst",
      behaviorEvents: {
        timesRefuted: 0,
        timesChangedAfterRefutation: 0,
        spontaneousFlips: 0,
        timesExposed: 0,
        timesRespondedAfterExposure: 0,
      },
      confidence: { stated: 0.7 },
      utilityHistory: [1, 2, 3].map(round => ({
        round,
        scores: reverse
          ? { z: 0.1 * round, a: 0.2 * round, m: 0.3 * round }
          : { a: 0.2 * round, m: 0.3 * round, z: 0.1 * round },
      })),
    });
    const project = (value: ProgressiveEstimatorInput) => defaultProgressiveEstimatorRegistry.project<
      ProgressiveEstimatorInput,
      ProgressiveEstimates,
      ProgressiveEstimatorConfig
    >(PROGRESSIVE_ESTIMATOR_ID, PROGRESSIVE_ESTIMATOR_VERSION, {
      name: "key_order_invariant",
      input: value,
      sourceEventIds: [],
    });

    const ordered = project(input(false));
    const reversed = project(input(true));
    expect(ordered.inputFingerprint).toBe(reversed.inputFingerprint);
    expect(ordered.outputFingerprint).toBe(reversed.outputFingerprint);
    expect(ordered.value).toEqual(reversed.value);
  });
});
