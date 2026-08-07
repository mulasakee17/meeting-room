import { describe, expect, it } from "vitest";
import {
  GovernanceEstimatorRegistry,
  canonicalizeEstimatorValue,
  fingerprintEstimatorValue,
  type GovernanceEstimatorContract,
} from "@/lib/epistemic";

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
});
