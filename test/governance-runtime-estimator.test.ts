import { afterEach, describe, expect, it, vi } from "vitest";
import { GovernanceRuntime } from "@/runtime";
import { GovernanceEstimatorRegistry } from "@/lib/epistemic";
import {
  PROGRESSIVE_ESTIMATOR_ID,
  progressiveEstimatorContract,
  type ProgressiveEstimates,
} from "@/lib/thermodynamics/ProgressiveEstimator";
import type { DiscussionMessage } from "@/runtime/types";

const fixedEstimates: ProgressiveEstimates = {
  inertia: {
    estimate: 0.21,
    confidence: 0.81,
    sourceWeights: { stated: 0.2, rolePrior: 0.3, behavioral: 0.5 },
    behavioralRatio: 0.25,
  },
  confidence: {
    estimate: 0.32,
    confidence: 0.82,
    sourceWeights: { stated: 0.4, stability: 0.6 },
  },
  susceptibility: { estimate: 0.43, confidence: 0.83, usable: true },
};

function fixedRegistry(): GovernanceEstimatorRegistry {
  return new GovernanceEstimatorRegistry([{
    ...progressiveEstimatorContract,
    version: "test-fixed-1",
    estimate: () => structuredClone(fixedEstimates),
  }]).seal();
}

function message(roundNumber: number): DiscussionMessage {
  return {
    agentId: "agent-1",
    agentName: "Agent 1",
    agentRole: "analyst",
    content: "A is preferable.",
    belief: 0.4,
    confidence: 70,
    timestamp: `2026-08-07T00:00:0${roundNumber}.000Z`,
    roundNumber,
    itemBeliefs: [
      { item: "A", rank: 1, belief: 0.8, confidence: 70 },
      { item: "B", rank: 2, belief: 0.2, confidence: 60 },
    ],
  };
}

afterEach(() => vi.restoreAllMocks());

describe("GovernanceRuntime estimator lifecycle", () => {
  it("uses an injected registry on the cognitive path and preserves it across reset", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const runtime = new GovernanceRuntime({
      governanceMode: "cognitive",
      governanceEstimatorRegistry: fixedRegistry(),
      governanceEstimatorReference: { id: PROGRESSIVE_ESTIMATOR_ID, version: "test-fixed-1" },
    });

    runtime.processRound([message(1)]);
    expect(runtime.getGovernanceEstimateHistory(1).get("agent-1")?.value).toEqual(fixedEstimates);

    runtime.reset();
    runtime.processRound([message(1)]);
    expect(runtime.getGovernanceEstimateHistory(1).get("agent-1")?.value).toEqual(fixedEstimates);
  });

  it("applies a registry configured before a session and rejects mid-session replacement", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const runtime = new GovernanceRuntime({ governanceMode: "cognitive" });
    runtime.configure({
      governanceEstimatorRegistry: fixedRegistry(),
      governanceEstimatorReference: { id: PROGRESSIVE_ESTIMATOR_ID, version: "test-fixed-1" },
    });

    runtime.processRound([message(1)]);
    expect(runtime.getGovernanceEstimateHistory(1).get("agent-1")?.estimatorVersion)
      .toBe("test-fixed-1");
    expect(() => runtime.configure({ governanceEstimatorRegistry: fixedRegistry() }))
      .toThrow(/active session/);
  });
});
