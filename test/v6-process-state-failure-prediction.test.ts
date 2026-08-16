import { describe, expect, it } from "vitest";
import {
  createProcessStateRowV1,
  extractPreActionProcessStateV1,
  runProcessStateFailurePredictionAuditV1,
  summarizeTaskHeldOutPredictionV1,
  taskHeldOutPredictionsV1,
  type ProcessStateRowV1,
} from "../experiments/campaign/v6/analyze_v6_process_state_failure_prediction";

function rawFixture(): Record<string, unknown> {
  return {
    runId: "run:test:1",
    v6TaskManifest: { taskId: "task:hiddenbench:1" },
    v6InteractionTrace: {
      protocol: "explicit_belief_v1",
      expectedAgentIds: ["a", "b"],
      epistemicEvents: [
        { type: "claim_registered", claim: { options: ["x", "y"] } },
        { type: "belief_reported", report: { agentId: "a", round: 1, value: { kind: "categorical", probabilities: { x: 0.8, y: 0.2 } } } },
        { type: "belief_reported", report: { agentId: "b", round: 1, value: { kind: "categorical", probabilities: { x: 0.4, y: 0.6 } } } },
        { type: "belief_reported", report: { agentId: "a", round: 2, value: { kind: "categorical", probabilities: { x: 0.1, y: 0.9 } } } },
      ],
    },
    operationalOutcome: { primaryMetric: { value: 0.42 } },
    finalOutcome: {
      claimOutcomes: [{
        pooledDecision: { status: "decided", outcome: "x" },
        pooledDecisionMatchesResolution: false,
      }],
    },
  };
}

function syntheticRows(): ProcessStateRowV1[] {
  return Array.from({ length: 8 }, (_, taskIndex) => Array.from({ length: 2 }, (_, replicate) => {
    const risk = taskIndex / 7;
    return {
      runId: `run:${taskIndex}:${replicate}`,
      taskId: taskIndex,
      protocol: "explicit_belief_v1" as const,
      arm: "no_action" as const,
      features: {
        round1Coverage: 1 - 0.1 * replicate,
        meanReportedCertainty: 0.5 + 0.4 * risk,
        meanPairwiseTotalVariation: risk,
        pooledTopTwoMargin: 1 - risk,
      },
      finalPooledBrier: 0.1 + risk,
      finalDecisionFailure: risk > 0.5 ? 1 as const : 0 as const,
      finalDecisionStatus: "decided",
    };
  })).flat();
}

describe("V6 process-state failure prediction audit", () => {
  it("extracts only round-1 state with hand-checkable features", () => {
    const state = extractPreActionProcessStateV1(rawFixture());
    expect(state.features.round1Coverage).toBe(1);
    expect(state.features.meanReportedCertainty).toBeCloseTo(0.7);
    expect(state.features.meanPairwiseTotalVariation).toBeCloseTo(0.4);
    expect(state.features.pooledTopTwoMargin).toBeCloseTo(0.2);
  });

  it("reads the independent outcome only after feature extraction", () => {
    const row = createProcessStateRowV1(rawFixture(), "no_action");
    expect(row.finalPooledBrier).toBe(0.42);
    expect(row.finalDecisionFailure).toBe(1);
  });

  it("cannot use final outcome fields as a substitute for missing pre-action reports", () => {
    const raw = rawFixture();
    (raw.v6InteractionTrace as { epistemicEvents: unknown[] }).epistemicEvents = [
      { type: "claim_registered", claim: { options: ["x", "y"] } },
    ];
    expect(() => createProcessStateRowV1(raw, "no_action")).toThrow(/no_round1_reports/);
  });

  it("rejects malformed probability coordinates and duplicate round-1 agents", () => {
    const malformed = rawFixture();
    const events = (malformed.v6InteractionTrace as { epistemicEvents: unknown[] }).epistemicEvents;
    (events[1] as { report: { value: unknown } }).report.value = { kind: "categorical", probabilities: { x: 1 } };
    expect(() => extractPreActionProcessStateV1(malformed)).toThrow(/coordinates_mismatch/);

    const duplicate = rawFixture();
    const duplicateEvents = (duplicate.v6InteractionTrace as { epistemicEvents: unknown[] }).epistemicEvents;
    duplicateEvents[2] = { type: "belief_reported", report: { agentId: "a", round: 1, value: { kind: "categorical", probabilities: { x: 0.4, y: 0.6 } } } };
    expect(() => extractPreActionProcessStateV1(duplicate)).toThrow(/duplicate_round1_report/);
  });

  it("performs deterministic leave-one-task-out prediction", () => {
    const rows = syntheticRows();
    const first = taskHeldOutPredictionsV1(rows);
    const second = taskHeldOutPredictionsV1(rows);
    expect(first).toEqual(second);
    expect(first).toHaveLength(rows.length);
    expect(first.every(row => Number.isFinite(row.predictions.process_state))).toBe(true);
  });

  it("reports paired task-cluster uncertainty and fails closed below the sample gate", () => {
    const summary = summarizeTaskHeldOutPredictionV1(taskHeldOutPredictionsV1(syntheticRows()));
    expect(summary.comparisons).toHaveLength(5);
    expect(summary.comparisons.every(item => item.clusterBootstrap95.length === 2)).toBe(true);
    expect(summary.gate.status).toBe("DEFER");
    expect(summary.gate.reasons).toContain("run_count_below_30");
    expect(summary.gate.reasons).toContain("task_clusters_below_15");
  });

  it.runIf(process.env.SWARMALPHA_RUN_EXISTING_ARTIFACT_AUDIT === "1")(
    "audits the existing replay-verified artifacts without provider calls",
    () => {
      const audit = runProcessStateFailurePredictionAuditV1();
      console.log(`PROCESS_STATE_AUDIT=${JSON.stringify(audit)}`);
      expect((audit.primary as { runCount: number }).runCount).toBeGreaterThan(0);
    },
    120_000,
  );
});
