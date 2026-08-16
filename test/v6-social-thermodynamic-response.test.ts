/**
 * V6 Social-Thermodynamic Response Audit — deterministic tests.
 *
 * Covers the contract fail-closed conditions (guide §9): post-assignment events
 * cannot enter the pre-action state; option-order permutation preserves R while
 * option identity drift rejects; missing/extra/duplicate agent reports reject a
 * snapshot; dangling or multiply bound evidence references reject H_E; zero
 * evidence returns H_E=null (never zero); outcome/resolution mutation does not
 * alter R/H_E/kappa; development outcome mutation does not alter the kappa cut;
 * duplicate physical artifacts reject and heldout missing runs reject the full
 * analysis; synthetic strata reproduce hand-calculated response differences and
 * DEFER gates. Also pins: the development median kappa cut never reads arm or
 * outcome, and 'private'/'shared' lineage falls back to contentHash.
 *
 * Deterministic fixtures only: no network, no sleeps, no unseeded randomness.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalEvidenceIdentityV1,
  computeAlignmentR,
  computeCommitmentCoverageV1,
  computeCrystallizationKappa,
  computeEvidenceDiversityHE,
  computeEvidenceObservabilityCensusV1,
  computeExactContentReuseV1,
  computeKappaCutV1,
  computeMaxPairwiseTVV1,
  computeMeanConcentrationV1,
  computeResponseMetricsV1,
  computeStateAxesV1,
  computeStateProjectionV1,
  correlateStateAxesV1,
  decideAuditStatusV1,
  extractPrivateCommitmentsV1,
  extractResponseRawV1,
  interpretCensusValuesV1,
  jsdBase2,
  loadRunSetV1,
  pearsonCorrV1,
  preActionProjectionFromArtifact,
  type AnalysisRunV1,
  type GArm,
  type PreActionProjectionV1,
  type ResponseRawV1,
  type StateProjectionV1,
} from "../experiments/campaign/v6/analyze_v6_social_thermodynamic_response";
import { analyzeKappaStratumV1 } from "../experiments/campaign/v6/analyze_v6_social_thermodynamic_response";
import { buildVerdictTaskHeldoutReplicationPlan } from "../experiments/campaign/v6/run_v6_verdict_task_heldout_replication";
import { resolveV6AuditableRawRunPath } from "../experiments/campaign/v6/productionVerticalSlice";

// ---------------------------------------------------------------------------
// Pure formula invariants
// ---------------------------------------------------------------------------

describe("base-2 JSD and alignment R", () => {
  it("is zero for identical distributions and bounded by 1", () => {
    expect(jsdBase2([1, 0, 0], [1, 0, 0])).toBe(0);
    expect(jsdBase2([1, 0, 0], [0, 1, 0])).toBeCloseTo(1, 10);
    expect(jsdBase2([0.5, 0.5, 0], [0.5, 0, 0.5])).toBeGreaterThan(0);
  });

  it("is symmetric", () => {
    const p = [0.2, 0.3, 0.5];
    const q = [0.7, 0.2, 0.1];
    expect(jsdBase2(p, q)).toBeCloseTo(jsdBase2(q, p), 12);
  });

  it("rejects single-report alignment and perfect alignment gives R=1", () => {
    expect(computeAlignmentR([[0.5, 0.5]])).toBeNull();
    expect(computeAlignmentR([[1, 0, 0], [1, 0, 0]])).toBeCloseTo(1, 12);
    expect(computeAlignmentR([[1, 0, 0], [0, 1, 0]])).toBeCloseTo(0, 12);
  });
});

describe("evidence diversity H_E and crystallization kappa", () => {
  it("returns null for zero identities and 0 for a single identity", () => {
    expect(computeEvidenceDiversityHE([])).toBeNull();
    expect(computeEvidenceDiversityHE([5])).toBe(0);
  });

  it("normalizes by log2(m) and computes the Shannon entropy", () => {
    expect(computeEvidenceDiversityHE([5, 5])).toBeCloseTo(1, 12);
    expect(computeEvidenceDiversityHE([3, 1])).toBeCloseTo(-(0.75 * Math.log2(0.75) + 0.25 * Math.log2(0.25)), 12);
  });

  it("kappa is null unless R and H_E are both finite", () => {
    expect(computeCrystallizationKappa(0.5, 0.5)).toBeCloseTo(0.25, 12);
    expect(computeCrystallizationKappa(0.5, null)).toBeNull();
    expect(computeCrystallizationKappa(Number.NaN, 0.5)).toBeNull();
  });

  it("kappa cut is the median of finite values only", () => {
    expect(computeKappaCutV1([0.1, 0.2, 0.3])).toBeCloseTo(0.2, 12);
    expect(computeKappaCutV1([0.1, 0.2])).toBeCloseTo(0.15, 12);
    expect(computeKappaCutV1([Number.NaN, 0.2, Number.POSITIVE_INFINITY])).toBeCloseTo(0.2, 12);
    expect(computeKappaCutV1([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Canonical evidence identity: model-emitted lineage has no item authority
// ---------------------------------------------------------------------------

describe("canonical evidence identity (guide §6.2 / user guarantee 3)", () => {
  it("uses contentHash for every unqualified model-emitted lineage", () => {
    expect(canonicalEvidenceIdentityV1({ contentHash: "h1", lineageId: "private" })).toBe("h1");
    expect(canonicalEvidenceIdentityV1({ contentHash: "h1", lineageId: "shared" })).toBe("h1");
    expect(canonicalEvidenceIdentityV1({ contentHash: "h1" })).toBe("h1");
    expect(canonicalEvidenceIdentityV1({ contentHash: "h1", lineageId: "" })).toBe("h1");
    expect(canonicalEvidenceIdentityV1({ contentHash: "h1", lineageId: "item-abc" })).toBe("h1");
  });

  it("does not merge unrelated evidence under the private/shared label", () => {
    const a = canonicalEvidenceIdentityV1({ contentHash: "hash-a", lineageId: "private" });
    const b = canonicalEvidenceIdentityV1({ contentHash: "hash-b", lineageId: "private" });
    expect(a).not.toBe(b);
    expect(a).toBe("hash-a");
    expect(b).toBe("hash-b");
  });
});

// ---------------------------------------------------------------------------
// Pre-action state projection fail-closed conditions
// ---------------------------------------------------------------------------

const BASE_OPTIONS = ["A", "B", "C"];
const BASE_AGENTS = ["agent:a", "agent:b", "agent:c"];

function validProjection(overrides: Partial<PreActionProjectionV1> = {}): PreActionProjectionV1 {
  const evidence: PreActionProjectionV1["evidence"] = [
    { evidenceId: "e1", contentHash: "h1", lineageId: "private" },
    { evidenceId: "e2", contentHash: "h2" },
    { evidenceId: "e3", contentHash: "h3" },
  ];
  const reports: PreActionProjectionV1["reports"] = [
    { agentId: "agent:a", probabilities: { A: 1, B: 0, C: 0 }, evidenceRefs: ["e1", "e2"] },
    { agentId: "agent:b", probabilities: { A: 0, B: 1, C: 0 }, evidenceRefs: ["e2"] },
    { agentId: "agent:c", probabilities: { A: 0, B: 0, C: 1 }, evidenceRefs: ["e3"] },
  ];
  return {
    claimOptions: [...BASE_OPTIONS],
    expectedAgentIds: [...BASE_AGENTS],
    reports,
    evidence,
    ...overrides,
  };
}

describe("state projection (guide §9 / user guarantee 1 & 4)", () => {
  it("computes R, H_E, kappa for a valid projection", () => {
    const state = computeStateProjectionV1(validProjection());
    expect(state.status).toBe("ok");
    if (state.status !== "ok") return;
    // Pairwise JSD: (A,B)=1,(A,C)=1,(B,C)=1 -> R = 1 - 1 = 0.
    expect(state.R).toBeCloseTo(0, 12);
    // Identities: e1,h2,h3 -> 3 distinct, refs [1,2,1] -> H_E < 1.
    expect(state.H_E).not.toBeNull();
    expect(state.identityCount).toBe(3);
    expect(state.kappa).not.toBeNull();
  });

  it("is invariant to option ordering (user guarantee: option order must not matter)", () => {
    const original = computeStateProjectionV1(validProjection());
    const reordered = validProjection({ claimOptions: ["B", "C", "A"] });
    const permuted = computeStateProjectionV1(reordered);
    expect(permuted.status).toBe("ok");
    if (original.status !== "ok" || permuted.status !== "ok") return;
    expect(permuted.R).toBeCloseTo(original.R, 12);
    expect(permuted.kappa).toBeCloseTo(original.kappa ?? Number.NaN, 12);
  });

  it("rejects option identity drift (user guarantee: option identity drift rejects)", () => {
    const drifted = validProjection();
    drifted.reports[0] = { ...drifted.reports[0], probabilities: { A: 1, B: 0, D: 0 } };
    const state = computeStateProjectionV1(drifted);
    expect(state.status).toBe("missing");
    if (state.status === "missing") expect(state.reason).toContain("invalid_distribution");
  });

  it("rejects missing, extra, and duplicate agent reports", () => {
    const missing = validProjection();
    missing.reports = missing.reports.slice(0, 2);
    expect(computeStateProjectionV1(missing).status).toBe("missing");

    const extra = validProjection();
    extra.reports = [
      { agentId: "agent:a", probabilities: { A: 1, B: 0, C: 0 }, evidenceRefs: ["e1"] },
      { agentId: "agent:b", probabilities: { A: 0, B: 1, C: 0 }, evidenceRefs: ["e2"] },
      { agentId: "agent:zzz", probabilities: { A: 0, B: 0, C: 1 }, evidenceRefs: ["e3"] },
    ];
    const extraState = computeStateProjectionV1(extra);
    expect(extraState.status).toBe("missing");
    // A swap introduces both an extra and a missing agent; either reason rejects.
    if (extraState.status === "missing") {
      expect(extraState.reason).toMatch(/missing_agent_report|extra_agent_report|agent_report_count_mismatch/);
    }

    const duplicate = validProjection();
    duplicate.reports = [
      ...duplicate.reports,
      { agentId: "agent:a", probabilities: { A: 1, B: 0, C: 0 }, evidenceRefs: [] },
    ];
    const dupState = computeStateProjectionV1(duplicate);
    expect(dupState.status).toBe("missing");
    if (dupState.status === "missing") expect(dupState.reason).toContain("duplicate_agent_report");
  });

  it("rejects invalid probability distributions", () => {
    const invalid = validProjection();
    invalid.reports[0] = { ...invalid.reports[0], probabilities: { A: 0.5, B: 0.5, C: 0.5 } };
    const state = computeStateProjectionV1(invalid);
    expect(state.status).toBe("missing");
  });

  it("rejects dangling and multiply bound evidence references", () => {
    const dangling = validProjection();
    dangling.reports[0] = { ...dangling.reports[0], evidenceRefs: ["e1", "no-such-evidence"] };
    const dState = computeStateProjectionV1(dangling);
    expect(dState.status).toBe("missing");
    if (dState.status === "missing") expect(dState.reason).toContain("dangling_evidence_reference");

    const multiply = validProjection();
    multiply.evidence = [...multiply.evidence, { evidenceId: "e2", contentHash: "h2-ambiguous" }];
    const mState = computeStateProjectionV1(multiply);
    expect(mState.status).toBe("missing");
    if (mState.status === "missing") expect(mState.reason).toContain("multiply_bound_evidence_reference");
  });

  it("zero evidence references return H_E=null (never zero) and kappa null", () => {
    const noEvidence = validProjection();
    noEvidence.reports = noEvidence.reports.map(report => ({ ...report, evidenceRefs: [] }));
    const state = computeStateProjectionV1(noEvidence);
    expect(state.status).toBe("ok");
    if (state.status !== "ok") return;
    expect(state.H_E).toBeNull();
    expect(state.identityCount).toBe(0);
    expect(state.kappa).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Synthetic artifact builder for extraction / outcome-independence tests
// ---------------------------------------------------------------------------

function syntheticArtifact(opts: {
  arm?: GArm;
  options?: string[];
  agents?: string[];
  assignedAt?: string;
  decidedAt?: string;
  resolved?: string;
  finalBrier?: number;
  verdict?: "supported" | "contradicted" | "insufficient_evidence";
  targetAgentId?: string;
  evidence?: Array<{ id: string; contentHash: string; lineageId?: string; createdAt?: string }>;
  round1?: Array<{ agentId: string; probs: Record<string, number>; evidenceRefs?: string[]; createdAt?: string }>;
  commitments?: Array<{ agentId: string; privateInformationHash: string }>;
}): Record<string, unknown> {
  const arm = opts.arm ?? "apply";
  const options = opts.options ?? BASE_OPTIONS;
  const agents = opts.agents ?? BASE_AGENTS;
  const assignedAt = opts.assignedAt ?? "2026-08-11T00:00:20.000Z";
  const decidedAt = opts.decidedAt ?? "2026-08-11T00:00:24.000Z";
  const evidence = opts.evidence ?? [
    { id: "e1", contentHash: "h1", lineageId: "private", createdAt: "2026-08-11T00:00:08.000Z" },
    { id: "e2", contentHash: "h2", createdAt: "2026-08-11T00:00:09.000Z" },
    { id: "e3", contentHash: "h3", createdAt: "2026-08-11T00:00:10.000Z" },
  ];
  const round1 = opts.round1 ?? [
    { agentId: agents[0], probs: { A: 1, B: 0, C: 0 }, evidenceRefs: ["e1", "e2"], createdAt: "2026-08-11T00:00:11.000Z" },
    { agentId: agents[1], probs: { A: 0, B: 1, C: 0 }, evidenceRefs: ["e2"], createdAt: "2026-08-11T00:00:12.000Z" },
    { agentId: agents[2], probs: { A: 0, B: 0, C: 1 }, evidenceRefs: ["e3"], createdAt: "2026-08-11T00:00:13.000Z" },
  ];

  const transitions: Array<Record<string, unknown>> = [
    { from: null, to: "proposed", occurredAt: "2026-08-11T00:00:21.000Z" },
    { from: "proposed", to: "eligible", occurredAt: "2026-08-11T00:00:22.000Z" },
  ];
  if (arm === "holdout") {
    transitions.push({ from: "eligible", to: "held_out", occurredAt: "2026-08-11T00:00:23.000Z" });
  } else if (arm === "ineligible") {
    // no assignment transitions
  } else {
    transitions.push(
      { from: "eligible", to: "assigned", occurredAt: "2026-08-11T00:00:25.000Z" },
      { from: "assigned", to: "queued", occurredAt: "2026-08-11T00:00:26.000Z" },
    );
  }

  const actionInstances = arm === "apply" || arm === "sham"
    ? [{
        id: "action:1",
        actionRef: { id: arm === "sham" ? "swarmalpha.action.verification-attention-sham" : "swarmalpha.action.verification-request", version: arm === "sham" ? "1.0.0" : "2.0.0" },
        targetIds: [opts.targetAgentId ?? agents[0]],
      }]
    : [];

  const sourceEvents = arm === "apply" && opts.verdict
    ? [{
        eventRef: { id: "swarmalpha.event.verification-result", version: "2.0.0" },
        payload: { verdict: opts.verdict, explanation: "explained", evidenceScope: "public_only" },
      }]
    : [];

  const epistemicEvents: Array<Record<string, unknown>> = [
    { type: "claim_registered", claim: { id: "claim:x", options, resolutionPolicy: { kind: "categorical" } } },
    ...evidence.map(item => ({
      type: "evidence_registered",
      evidence: {
        id: item.id,
        content: `content-${item.id}`,
        createdAt: item.createdAt ?? "2026-08-11T00:00:08.000Z",
        provenance: { sourceKind: "agent", contentHash: item.contentHash, ...(item.lineageId ? { lineageId: item.lineageId } : {}) },
      },
    })),
    ...round1.map(report => ({
      type: "belief_reported",
      report: {
        id: `report:${report.agentId}`,
        claimId: "claim:x",
        agentId: report.agentId,
        round: 1,
        value: { kind: "categorical", probabilities: report.probs },
        evidence: (report.evidenceRefs ?? []).map(ref => ({ evidenceId: ref, relation: "supports" })),
        createdAt: report.createdAt ?? "2026-08-11T00:00:11.000Z",
      },
    })),
    // A round-2 report strictly after assignment (must never enter pre-action state).
    { type: "belief_reported", report: { id: "report:r2", claimId: "claim:x", agentId: agents[0], round: 2, value: { kind: "categorical", probabilities: { A: 0, B: 1, C: 0 } }, evidence: [], createdAt: "2026-08-11T00:00:30.000Z" } },
  ];

  const claimOutcome = {
    registeredAgentCount: agents.length,
    terminalStatusCounts: { answered: agents.length, abstained: 0, invalid: 0, unavailable: 0 },
    contributions: agents.map((agentId, index) => ({
      agentId,
      terminalStatus: "answered",
      value: { kind: "categorical", probabilities: { A: 0, B: 1, C: 0 } },
      index,
    })),
  };

  return {
    runId: "run:test:G:r1",
    experimentId: "experiment:test",
    v6InteractionTrace: {
      protocol: "epistemic_governance_v1",
      expectedAgentIds: agents,
      epistemicEvents,
    },
    governanceAuditTrail: {
      actionTransitions: transitions,
      actionInstances,
      sourceEvents,
      eventAssignments: arm === "ineligible" ? [] : [{ assignedArm: arm, assignedAt, arms: [{ id: "apply", probability: 0.5 }, { id: "sham", probability: 0.25 }, { id: "holdout", probability: 0.25 }] }],
      decisions: arm === "ineligible" ? [{ decidedAt, outcome: "ineligible" }] : [{ decidedAt, outcome: "eligible" }],
    },
    operationalOutcome: {
      primaryMetric: { metricRef: { id: "swarmalpha.estimand.operational-pooled-brier" }, value: opts.finalBrier ?? 0.5, direction: "lower_is_better" },
      claimOutcome,
    },
    finalOutcome: {
      resolutions: [{ claimId: "claim:x", outcome: opts.resolved ?? "B" }],
      elicitationRecords: [],
    },
    taskOutcome: { quality: 1, cost: { totalTokens: 100, invalidOrFailed: 0 } },
    v6TaskManifest: {
      taskId: "task:hiddenbench:14",
      ...(opts.commitments ? { orderedAgentCommitments: opts.commitments } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Artifact-level: post-action fields must not affect the state projection
// ---------------------------------------------------------------------------

describe("pre-action projection outcome-independence (guide §9.6 / user guarantee 1)", () => {
  it("excludes post-assignment events and is unchanged by outcome/resolution mutation", () => {
    const artifact = syntheticArtifact({ arm: "apply", resolved: "B", finalBrier: 0.5 });
    const cutoff = "2026-08-11T00:00:20.000Z";
    const first = preActionProjectionFromArtifact(artifact, cutoff);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.projection.reports).toHaveLength(3);
    expect(first.projection.reports.map(report => report.agentId)).toEqual(BASE_AGENTS);

    // Mutate post-action fields only.
    const artifact2 = JSON.parse(JSON.stringify(artifact)) as Record<string, unknown>;
    (artifact2.finalOutcome as { resolutions: Array<{ outcome: string }> }).resolutions[0].outcome = "C";
    ((artifact2.operationalOutcome as { primaryMetric: { value: number } }).primaryMetric).value = 9.9;
    (artifact2.taskOutcome as { quality: number }).quality = 0;

    const second = preActionProjectionFromArtifact(artifact2, cutoff);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.projection).toEqual(first.projection);
    const s1 = computeStateProjectionV1(first.projection);
    const s2 = computeStateProjectionV1(second.projection);
    expect(s1).toEqual(s2);
  });

  it("fails closed on invalid cutoff and pre-action event timestamps", () => {
    const artifact = syntheticArtifact({});
    expect(preActionProjectionFromArtifact(artifact, "not-a-time")).toEqual({ ok: false, reason: "invalid_assignment_cutoff" });

    const events = (artifact.v6InteractionTrace as { epistemicEvents: Array<Record<string, unknown>> }).epistemicEvents;
    const reportEvent = events.find(event => event.type === "belief_reported") as { report: { createdAt: string } };
    reportEvent.report.createdAt = "not-a-time";
    expect(preActionProjectionFromArtifact(artifact, "2026-08-11T00:00:20.000Z")).toEqual({ ok: false, reason: "invalid_pre_action_event_time" });
  });

  it("fails closed when pre-action reports bind different claims", () => {
    const artifact = syntheticArtifact({});
    const events = (artifact.v6InteractionTrace as { epistemicEvents: Array<Record<string, unknown>> }).epistemicEvents;
    const reports = events.filter(event => event.type === "belief_reported") as Array<{ report: { round: number; claimId: string } }>;
    reports.find(event => event.report.round === 1)!.report.claimId = "claim:other";
    expect(preActionProjectionFromArtifact(artifact, "2026-08-11T00:00:20.000Z")).toEqual({ ok: false, reason: "pre_action_claim_binding_mismatch" });
  });

  it("fails closed on duplicate or late claim authority", () => {
    const duplicate = syntheticArtifact({});
    const duplicateEvents = (duplicate.v6InteractionTrace as { epistemicEvents: Array<Record<string, unknown>> }).epistemicEvents;
    duplicateEvents.splice(1, 0, JSON.parse(JSON.stringify(duplicateEvents[0])) as Record<string, unknown>);
    expect(preActionProjectionFromArtifact(duplicate, "2026-08-11T00:00:20.000Z")).toEqual({ ok: false, reason: "pre_action_claim_authority_mismatch" });

    const late = syntheticArtifact({});
    const lateEvents = (late.v6InteractionTrace as { epistemicEvents: Array<Record<string, unknown>> }).epistemicEvents;
    const claim = lateEvents.shift()!;
    lateEvents.push(claim);
    expect(preActionProjectionFromArtifact(late, "2026-08-11T00:00:20.000Z")).toEqual({ ok: false, reason: "pre_action_claim_registered_after_report" });
  });
});

// ---------------------------------------------------------------------------
// Response extraction and metrics
// ---------------------------------------------------------------------------

describe("response extraction and metrics (guide §6.4)", () => {
  it("extracts arm, final Brier, resolution and pooled distribution", () => {
    const artifact = syntheticArtifact({ arm: "apply", resolved: "B", finalBrier: 0.4 });
    const response = extractResponseRawV1(artifact);
    expect(response.arm).toBe("apply");
    expect(response.finalBrier).toBeCloseTo(0.4, 12);
    expect(response.resolvedOption).toBe("B");
    expect(response.finalPooled).not.toBeNull();
  });

  it("computes truth-mass movement and Brier movement from the projection", () => {
    const artifact = syntheticArtifact({ arm: "holdout", resolved: "B", finalBrier: 0.5 });
    const projection = preActionProjectionFromArtifact(artifact, "2026-08-11T00:00:20.000Z");
    const response = extractResponseRawV1(artifact);
    const metrics = computeResponseMetricsV1({ projection: projection.ok ? projection.projection : null, response });
    // prePooled = mean of reports: agent a {A:1}, b {B:1}, c {C:1} -> prePooled = {A:1/3, B:1/3, C:1/3}.
    expect(metrics.prePTruth).toBeCloseTo(1 / 3, 12);
    expect(metrics.brierPre).toBeCloseTo((1 / 3 - 1) ** 2 + (1 / 3) ** 2 + (1 / 3) ** 2, 12);
  });

  it("scores apply verdict outcome-direction concordance and leaves insufficient_evidence unscored", () => {
    const make = (verdict: string, targetTop: string, resolved: string) => {
      const artifact = syntheticArtifact({
        arm: "apply",
        verdict: verdict as "supported" | "contradicted" | "insufficient_evidence",
        targetAgentId: "agent:a",
        resolved,
      });
      const projection = preActionProjectionFromArtifact(artifact, "2026-08-11T00:00:20.000Z");
      const response = extractResponseRawV1(artifact);
      return computeResponseMetricsV1({ projection: projection.ok ? projection.projection : null, response });
    };
    // Target agent a reports {A:1,B:0,C:0}, so top option is A.
    expect(make("supported", "A", "A").concordance).toBe("concordant");
    expect(make("supported", "A", "B").concordance).toBe("discordant");
    expect(make("contradicted", "A", "B").concordance).toBe("concordant");
    expect(make("contradicted", "A", "A").concordance).toBe("discordant");
    expect(make("insufficient_evidence", "A", "A").concordance).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Kappa cut independence from arm and outcome (user guarantee 2)
// ---------------------------------------------------------------------------

describe("development kappa cut independence (guide §9.7 / user guarantee 2)", () => {
  it("the kappa cut depends only on state kappas, never on arm or outcome", () => {
    // Two kappa sets: the second differs only in order, arm/outcome are not inputs.
    const setA = [0.1, 0.2, 0.3, 0.4];
    const setB = [0.4, 0.3, 0.2, 0.1];
    expect(computeKappaCutV1(setA) as number).toBeCloseTo(computeKappaCutV1(setB) as number, 12);
    expect(computeKappaCutV1(setA) as number).toBeCloseTo(0.25, 12);
    // Adding a non-finite value must not shift the median.
    expect(computeKappaCutV1([0.1, Number.NaN, 0.2, 0.3, 0.4]) as number).toBeCloseTo(0.25, 12);
  });

  it("changing only post-action outcome fields never changes the state kappa", () => {
    const artifact = syntheticArtifact({ arm: "holdout", resolved: "B", finalBrier: 0.5 });
    const cutoff = "2026-08-11T00:00:20.000Z";
    const p1 = preActionProjectionFromArtifact(artifact, cutoff);
    const artifact2 = JSON.parse(JSON.stringify(artifact)) as Record<string, unknown>;
    ((artifact2.operationalOutcome as { primaryMetric: { value: number } }).primaryMetric).value = 9.9;
    const p2 = preActionProjectionFromArtifact(artifact2, cutoff);
    expect(p1.ok && p2.ok).toBe(true);
    if (!p1.ok || !p2.ok) return;
    const s1 = computeStateProjectionV1(p1.projection);
    const s2 = computeStateProjectionV1(p2.projection);
    if (s1.status === "ok" && s2.status === "ok") expect(s1.kappa).toBeCloseTo(s2.kappa ?? Number.NaN, 12);
  });
});

// ---------------------------------------------------------------------------
// Evidence observability census (Task A1/A2)
// ---------------------------------------------------------------------------

function censusFor(projection: PreActionProjectionV1, commitments: Array<{ agentId: string; privateInformationHash: string }> | null) {
  const state = computeStateProjectionV1(projection);
  expect(state.status).toBe("ok");
  if (state.status !== "ok") return null;
  return computeEvidenceObservabilityCensusV1({ state, expectedAgentIds: projection.expectedAgentIds, commitments });
}

describe("evidence observability census (A1 exact reuse / A2 verbatim commitment coverage)", () => {
  it("hand-calculates N_ref, U_hash, exactReuseFraction and applies the mechanical reading", () => {
    const projection = validProjection({
      evidence: [
        { evidenceId: "e1", contentHash: "h1" },
        { evidenceId: "e2", contentHash: "h2" },
        { evidenceId: "e3", contentHash: "h3" },
      ],
      reports: [
        { agentId: "agent:a", probabilities: { A: 1, B: 0, C: 0 }, evidenceRefs: ["e1", "e2"] },
        { agentId: "agent:b", probabilities: { A: 0, B: 1, C: 0 }, evidenceRefs: ["e1"] },
        { agentId: "agent:c", probabilities: { A: 0, B: 0, C: 1 }, evidenceRefs: ["e3"] },
      ],
    });
    const state = computeStateProjectionV1(projection);
    expect(state.status).toBe("ok");
    if (state.status !== "ok") return;
    const reuse = computeExactContentReuseV1(state);
    expect(reuse.nRef).toBe(4);
    expect(reuse.uHash).toBe(3);
    expect(reuse.exactReuseFraction).toBeCloseTo(1 - 3 / 4, 12);
    expect(interpretCensusValuesV1([reuse.exactReuseFraction!])).toBe("descriptively_degenerate");
    expect(interpretCensusValuesV1([reuse.exactReuseFraction!, 0.5])).toBe("descriptive_variation_observed");
    expect(interpretCensusValuesV1([])).toBe("unreconstructable_from_current_artifacts");
  });

  it("counts exact reuse when one content hash is bound via multiple evidenceIds", () => {
    const projection = validProjection({
      evidence: [
        { evidenceId: "e1", contentHash: "h1" },
        { evidenceId: "e2", contentHash: "h1" },
      ],
      reports: [
        { agentId: "agent:a", probabilities: { A: 1, B: 0, C: 0 }, evidenceRefs: ["e1"] },
        { agentId: "agent:b", probabilities: { A: 0, B: 1, C: 0 }, evidenceRefs: ["e2"] },
        { agentId: "agent:c", probabilities: { A: 0, B: 0, C: 1 }, evidenceRefs: ["e1"] },
      ],
    });
    const state = computeStateProjectionV1(projection);
    expect(state.status).toBe("ok");
    if (state.status !== "ok") return;
    const reuse = computeExactContentReuseV1(state);
    expect(reuse.nRef).toBe(3);
    expect(reuse.uHash).toBe(1);
    expect(reuse.exactReuseFraction).toBeCloseTo(1 - 1 / 3, 12);
  });

  it("returns exactReuseFraction = 0 when all referenced hashes are unique", () => {
    const projection = validProjection({
      evidence: [
        { evidenceId: "e1", contentHash: "h1" },
        { evidenceId: "e2", contentHash: "h2" },
        { evidenceId: "e3", contentHash: "h3" },
      ],
      reports: [
        { agentId: "agent:a", probabilities: { A: 1, B: 0, C: 0 }, evidenceRefs: ["e1"] },
        { agentId: "agent:b", probabilities: { A: 0, B: 1, C: 0 }, evidenceRefs: ["e2"] },
        { agentId: "agent:c", probabilities: { A: 0, B: 0, C: 1 }, evidenceRefs: ["e3"] },
      ],
    });
    const state = computeStateProjectionV1(projection);
    expect(state.status).toBe("ok");
    if (state.status !== "ok") return;
    expect(computeExactContentReuseV1(state).exactReuseFraction).toBeCloseTo(0, 12);
  });

  it("returns null (not 0) when there are no references", () => {
    const projection = validProjection({
      reports: [
        { agentId: "agent:a", probabilities: { A: 1, B: 0, C: 0 }, evidenceRefs: [] },
        { agentId: "agent:b", probabilities: { A: 0, B: 1, C: 0 }, evidenceRefs: [] },
        { agentId: "agent:c", probabilities: { A: 0, B: 0, C: 1 }, evidenceRefs: [] },
      ],
    });
    const state = computeStateProjectionV1(projection);
    expect(state.status).toBe("ok");
    if (state.status !== "ok") return;
    const reuse = computeExactContentReuseV1(state);
    expect(reuse.nRef).toBe(0);
    expect(reuse.uHash).toBe(0);
    expect(reuse.exactReuseFraction).toBeNull();
  });

  it("is invariant to lineageId changes (identity is always contentHash)", () => {
    const base = validProjection();
    const withLineage = validProjection({
      evidence: [
        { evidenceId: "e1", contentHash: "h1", lineageId: "private" },
        { evidenceId: "e2", contentHash: "h2", lineageId: "item-xyz" },
        { evidenceId: "e3", contentHash: "h3", lineageId: "shared" },
      ],
    });
    expect(censusFor(base, null)).toEqual(censusFor(withLineage, null));
  });

  it("hand-calculates verbatim private-commitment coverage on exact hash match", () => {
    const census = censusFor(validProjection(), [
      { agentId: "agent:a", privateInformationHash: "h1" },
      { agentId: "agent:b", privateInformationHash: "h2" },
      { agentId: "agent:c", privateInformationHash: "h3" },
    ]);
    expect(census).not.toBeNull();
    if (census === null) return;
    expect(census.commitmentCoverage.status).toBe("ok");
    if (census.commitmentCoverage.status !== "ok") return;
    expect(census.commitmentCoverage.matchedCommittedAgentCount).toBe(3);
    expect(census.commitmentCoverage.registeredAgentCount).toBe(3);
    expect(census.commitmentCoverage.verbatimPrivateCommitmentCoverage).toBeCloseTo(1, 12);
  });

  it("does not count non-verbatim paraphrase hashes as coverage", () => {
    const census = censusFor(validProjection(), [
      { agentId: "agent:a", privateInformationHash: "paraphrase-a" },
      { agentId: "agent:b", privateInformationHash: "paraphrase-b" },
      { agentId: "agent:c", privateInformationHash: "paraphrase-c" },
    ]);
    expect(census).not.toBeNull();
    if (census === null) return;
    expect(census.commitmentCoverage.status).toBe("ok");
    if (census.commitmentCoverage.status !== "ok") return;
    expect(census.commitmentCoverage.matchedCommittedAgentCount).toBe(0);
    expect(census.commitmentCoverage.verbatimPrivateCommitmentCoverage).toBeCloseTo(0, 12);
  });

  it("fails closed when the commitment manifest is missing or the roster mismatches", () => {
    const withoutManifest = syntheticArtifact({});
    expect(extractPrivateCommitmentsV1(withoutManifest)).toBeNull();
    const census = censusFor(validProjection(), null);
    expect(census).not.toBeNull();
    if (census === null) return;
    expect(census.commitmentCoverage.status).toBe("missing");
    if (census.commitmentCoverage.status === "missing") expect(census.commitmentCoverage.reason).toBe("commitment_manifest_missing");

    const rosterMismatch = computeCommitmentCoverageV1({
      referencedContentHashes: ["h1"],
      commitments: [{ agentId: "agent:zzz", privateInformationHash: "h1" }],
      expectedAgentIds: BASE_AGENTS,
    });
    expect(rosterMismatch.status).toBe("missing");
    if (rosterMismatch.status === "missing") expect(rosterMismatch.reason).toBe("commitment_roster_mismatch");
  });

  it("fails closed when a duplicate commitment hash makes source identity ambiguous", () => {
    const result = computeCommitmentCoverageV1({
      referencedContentHashes: ["h1", "h3"],
      commitments: [
        { agentId: "agent:a", privateInformationHash: "h1" },
        { agentId: "agent:b", privateInformationHash: "h1" },
        { agentId: "agent:c", privateInformationHash: "h3" },
      ],
      expectedAgentIds: BASE_AGENTS,
    });
    expect(result.status).toBe("missing");
    if (result.status === "missing") expect(result.reason).toContain("duplicate_commitment_hash");
  });

  it("is unchanged by arm/outcome/resolution/verdict mutation", () => {
    const cutoff = "2026-08-11T00:00:20.000Z";
    const commitments = BASE_AGENTS.map((agentId, index) => ({ agentId, privateInformationHash: `commit-${index}` }));
    const base = syntheticArtifact({ arm: "apply", resolved: "B", finalBrier: 0.5, verdict: "supported", commitments });
    const censusOf = (artifact: Record<string, unknown>) => {
      const proj = preActionProjectionFromArtifact(artifact, cutoff);
      expect(proj.ok).toBe(true);
      if (!proj.ok) return null;
      const state = computeStateProjectionV1(proj.projection);
      expect(state.status).toBe("ok");
      if (state.status !== "ok") return null;
      return computeEvidenceObservabilityCensusV1({
        state,
        expectedAgentIds: proj.projection.expectedAgentIds,
        commitments: extractPrivateCommitmentsV1(artifact),
      });
    };
    const first = censusOf(base);
    const mutated = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    (mutated.governanceAuditTrail as { actionTransitions: Array<{ to: string }> }).actionTransitions[2].to = "held_out";
    ((mutated.operationalOutcome as { primaryMetric: { value: number } }).primaryMetric).value = 9.9;
    (mutated.finalOutcome as { resolutions: Array<{ outcome: string }> }).resolutions[0].outcome = "C";
    (mutated.governanceAuditTrail as { sourceEvents: Array<unknown> }).sourceEvents = [];
    expect(censusOf(mutated)).toEqual(first);
  });
});

// ---------------------------------------------------------------------------
// Duplicate artifact and heldout missing rejection (guide §9.8-9.9)
// ---------------------------------------------------------------------------

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "socialthermo-"));
}

describe("run-set loading fail-closed (guide §9.8-9.9 / user guarantee 4)", () => {
  const plan = buildVerdictTaskHeldoutReplicationPlan();
  const firstRunId = plan.tasks[0].runs[0].runId;

  it("rejects a run whose physical artifact appears in more than one root", () => {
    const rootA = tempRoot();
    const rootB = tempRoot();
    try {
      fs.writeFileSync(resolveV6AuditableRawRunPath(rootA, firstRunId), "{}", "utf8");
      fs.writeFileSync(resolveV6AuditableRawRunPath(rootB, firstRunId), "{}", "utf8");
      expect(() => loadRunSetV1({ batch: "heldout", plan, roots: [rootA, rootB], requireAll: true }))
        .toThrow(/social_thermo_duplicate_artifact/);
    } finally {
      fs.rmSync(rootA, { recursive: true, force: true });
      fs.rmSync(rootB, { recursive: true, force: true });
    }
  });

  it("rejects the full analysis when a planned heldout run is missing", () => {
    const root = tempRoot();
    try {
      expect(() => loadRunSetV1({ batch: "heldout", plan, roots: [root], requireAll: true }))
        .toThrow(/social_thermo_missing_artifact/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects an output root that contains an unplanned extra artifact", () => {
    const root = tempRoot();
    try {
      fs.writeFileSync(path.join(root, "run_fake_extra_task_99_G_r1.000000000000.raw-run.v5.json"), "{}", "utf8");
      expect(() => loadRunSetV1({ batch: "heldout", plan, roots: [root], requireAll: true }))
        .toThrow(/social_thermo_duplicate_artifact|social_thermo_extra_artifact|social_thermo_missing_artifact/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Synthetic strata reproduce hand-calculated response differences and DEFER gates
// ---------------------------------------------------------------------------

function mkRun(input: {
  runId: string;
  taskId: number;
  arm: Exclude<GArm, "ineligible">;
  kappa: number;
  finalBrier: number;
}): AnalysisRunV1 {
  const state: StateProjectionV1 = {
    status: "ok",
    R: 0.5,
    H_E: 1 - input.kappa / 0.5,
    kappa: input.kappa,
    identityCount: 2,
    identityRefs: [{ identity: "h1", count: 1 }, { identity: "h2", count: 1 }],
  };
  const response: ResponseRawV1 = {
    arm: input.arm,
    finalBrier: input.finalBrier,
    accuracy: null,
    tokens: 0,
    invalidOrFailed: 0,
    resolvedOption: "B",
    finalPooled: null,
    finalInvalid: 0,
    finalAbstained: 0,
    finalUnavailable: 0,
  };
  return {
    batch: "heldout",
    runId: input.runId,
    taskId: input.taskId,
    arm: input.arm,
    assignedAt: "2026-08-11T00:00:20.000Z",
    state,
    response,
    metrics: { prePooled: null, prePTruth: null, finalPTruth: null, deltaTruthMass: null, brierPre: null, deltaBrier: null, concordance: null },
    census: null,
    axes: null,
  };
}

describe("kappa stratum analysis and DEFER gates (guide §7 / user guarantee 5)", () => {
  it("reproduces hand-calculated response differences and defers on small support", () => {
    const runs = [
      // Low stratum (kappa 0.1): apply mean 1.1, holdout mean 1.6 -> diff -0.5.
      mkRun({ runId: "low-a1", taskId: 1, arm: "apply", kappa: 0.1, finalBrier: 1.0 }),
      mkRun({ runId: "low-a2", taskId: 1, arm: "apply", kappa: 0.1, finalBrier: 1.2 }),
      mkRun({ runId: "low-h1", taskId: 1, arm: "holdout", kappa: 0.1, finalBrier: 1.5 }),
      mkRun({ runId: "low-h2", taskId: 1, arm: "holdout", kappa: 0.1, finalBrier: 1.7 }),
      // High stratum (kappa 0.9): apply mean 0.6, holdout mean 1.2 -> diff -0.6.
      mkRun({ runId: "high-a1", taskId: 2, arm: "apply", kappa: 0.9, finalBrier: 0.5 }),
      mkRun({ runId: "high-a2", taskId: 2, arm: "apply", kappa: 0.9, finalBrier: 0.7 }),
      mkRun({ runId: "high-h1", taskId: 2, arm: "holdout", kappa: 0.9, finalBrier: 1.0 }),
      mkRun({ runId: "high-h2", taskId: 2, arm: "holdout", kappa: 0.9, finalBrier: 1.4 }),
    ];
    const result = analyzeKappaStratumV1({ runs, kappaCut: 0.5, bootstrapCount: 1000, seed: "test-seed" });
    const low = result.strata.find(s => s.stratum === "low")!;
    const high = result.strata.find(s => s.stratum === "high")!;
    expect(low.nApply).toBe(2);
    expect(low.nHoldout).toBe(2);
    expect(low.applyMeanBrier).toBeCloseTo(1.1, 12);
    expect(low.holdoutMeanBrier).toBeCloseTo(1.6, 12);
    expect(low.naiveDiff).toBeCloseTo(-0.5, 12);
    expect(high.naiveDiff).toBeCloseTo(-0.6, 12);
    expect(result.interaction).toBeCloseTo(-0.1, 12);
    // Support is far too thin -> DEFER on n and clusters.
    expect(low.deferReasons).toEqual(expect.arrayContaining(["apply n<10", "holdout n<10", "apply task clusters<6", "holdout task clusters<6"]));
    expect(high.deferReasons.length).toBeGreaterThan(0);
  });

  it("passes the DEFER gate for a well-separated, well-supported high stratum", () => {
    const runs: AnalysisRunV1[] = [];
    let id = 0;
    // 8 task clusters; each cluster has >=1 apply and >=1 holdout; totals >=10 per arm.
    for (let task = 1; task <= 8; task++) {
      const applyN = task <= 5 ? 2 : 1; // 10 apply total
      const holdoutN = task <= 5 ? 2 : 1; // 10 holdout total
      for (let i = 0; i < applyN; i++) runs.push(mkRun({ runId: `high-a${id++}`, taskId: task, arm: "apply", kappa: 0.9, finalBrier: 0.4 + 0.1 * i }));
      for (let i = 0; i < holdoutN; i++) runs.push(mkRun({ runId: `high-h${id++}`, taskId: task, arm: "holdout", kappa: 0.9, finalBrier: 1.0 + 0.2 * i }));
    }
    const result = analyzeKappaStratumV1({ runs, kappaCut: 0.5, bootstrapCount: 10000, seed: "gate-pass-seed" });
    const high = result.strata.find(s => s.stratum === "high")!;
    expect(high.nApply).toBeGreaterThanOrEqual(10);
    expect(high.nHoldout).toBeGreaterThanOrEqual(10);
    expect(high.applyTaskClusters).toBeGreaterThanOrEqual(6);
    expect(high.holdoutTaskClusters).toBeGreaterThanOrEqual(6);
    expect(high.naiveDiff).toBeLessThan(0);
    expect(high.validFraction).toBeGreaterThanOrEqual(0.95);
    expect(high.upper).not.toBeNull();
    if (high.upper !== null) expect(high.upper).toBeLessThan(0);
    expect(high.deferReasons).toEqual([]);
  });

  it("maps statuses: preserved on a passing high stratum, not preserved when direction contradicts, defer otherwise, stop on null cut", () => {
    const pass = {
      strata: [
        { stratum: "low" as const, nApply: 10, nHoldout: 10, nSham: 0, applyTaskClusters: 6, holdoutTaskClusters: 6, applyMeanBrier: 0.5, holdoutMeanBrier: 0.8, naiveDiff: -0.3, bootstrapMedian: -0.3, lower: -0.5, upper: -0.1, validFraction: 0.99, deferReasons: [] },
        { stratum: "high" as const, nApply: 12, nHoldout: 12, nSham: 0, applyTaskClusters: 8, holdoutTaskClusters: 8, applyMeanBrier: 0.4, holdoutMeanBrier: 1.0, naiveDiff: -0.6, bootstrapMedian: -0.6, lower: -0.9, upper: -0.3, validFraction: 0.99, deferReasons: [] },
      ],
      interaction: -0.3,
    };
    expect(decideAuditStatusV1(pass, 0.5, "qualified")).toBe("STATE-RESPONSE SIGNAL PRESERVED — secondary evidence only");

    const contradict = JSON.parse(JSON.stringify(pass));
    contradict.interaction = 0.1;
    expect(decideAuditStatusV1(contradict, 0.5, "qualified")).toBe("STATE-RESPONSE HYPOTHESIS NOT PRESERVED");

    const defer = JSON.parse(JSON.stringify(pass));
    defer.strata[1].deferReasons = ["apply n<10"];
    expect(decideAuditStatusV1(defer, 0.5, "qualified")).toBe("DEFER — insufficient support/uncertainty");

    expect(decideAuditStatusV1(pass, 0.5, "unresolved")).toBe("DEFER — insufficient support/uncertainty");
    expect(decideAuditStatusV1(pass, 0.5, "degenerate")).toBe("STOP — current H_E/kappa V1 macrostate degenerate");
    expect(decideAuditStatusV1({ strata: [], interaction: null }, null, "degenerate")).toBe("STOP — projection or authority failure");
  });
});

// ---------------------------------------------------------------------------
// State-axis redundancy (matrix §1.1)
// ---------------------------------------------------------------------------

describe("state-axis redundancy (disagreement/R/concentration/reuse/coverage)", () => {
  it("computes max pairwise TV and mean concentration over aligned distributions", () => {
    // Two maximally disagreeing distributions -> TV 1; identical -> 0.
    expect(computeMaxPairwiseTVV1([[1, 0, 0], [0, 1, 0]])).toBe(1);
    expect(computeMaxPairwiseTVV1([[0.7, 0.3], [0.7, 0.3]])).toBe(0);
    expect(computeMaxPairwiseTVV1([[1, 0]])).toBe(0); // single report -> 0
    // Mean concentration: max option prob averaged over reports.
    expect(computeMeanConcentrationV1([[0.9, 0.1], [0.6, 0.4]])).toBeCloseTo(0.75, 10);
  });

  it("pearson correlation handles edge cases", () => {
    expect(pearsonCorrV1([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
    expect(pearsonCorrV1([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 10);
    expect(pearsonCorrV1([1, 2], [1, 2, 3])).toBeNull(); // length mismatch
    expect(pearsonCorrV1([1], [1])).toBeNull(); // n<2
    expect(pearsonCorrV1([1, 1], [2, 3])).toBeNull(); // zero variance
  });

  it("flags pairwise |r| >= 0.9 as potential collapse", () => {
    const axes = [1, 2, 3, 4, 5].map(i => ({
      disagreement: i,
      R: i * 2,
      concentration: 10 - i,
      exactReuseFraction: 0.5,
      coverage: 0.5 + i * 0.01,
    }));
    const corr = correlateStateAxesV1(axes);
    expect(corr.n).toBe(5);
    // disagreement~R is perfectly correlated (i vs 2i).
    expect(corr.collapseFlags).toContain("disagreement~R");
    // disagreement~concentration is perfectly anti-correlated (i vs 10-i).
    expect(corr.collapseFlags).toContain("disagreement~concentration");
  });

  it("computeStateAxesV1 assembles all five axes from a valid state", () => {
    const state: Extract<StateProjectionV1, { status: "ok" }> = {
      status: "ok",
      R: 0.8,
      H_E: 0.5,
      kappa: 0.4,
      identityCount: 2,
      identityRefs: [{ identity: "h1", count: 1 }, { identity: "h2", count: 1 }],
    };
    const census = computeEvidenceObservabilityCensusV1({
      state,
      expectedAgentIds: ["a", "b"],
      commitments: null,
    });
    const axes = computeStateAxesV1({
      distributions: [[0.9, 0.1], [0.1, 0.9]],
      state,
      census,
    });
    expect(axes.disagreement).toBeCloseTo(0.8, 10);
    expect(axes.R).toBe(0.8);
    expect(axes.concentration).toBeCloseTo(0.9, 10);
    expect(axes.exactReuseFraction).toBe(0); // 2 distinct hashes over 2 refs
    expect(axes.coverage).toBeNull(); // commitments null -> missing
  });
});
