/**
 * Cross-evidence exchange — deterministic wiring tests (zero provider).
 *
 * Validates: the disagreement rule fires on high round-1 pairwise TV and is
 * silent below threshold; the selector deterministically builds the auditable
 * cross-evidence message; and the full vertical slice delivers the exchange on
 * governance-arm runs (zero extra provider calls) while no-governance runs
 * never deliver. Deterministic mock invoker only; no network, no real LLM.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCrossEvidenceExchangePlanV1, CROSS_EVIDENCE_EXCHANGE_TASK_IDS, CROSS_EVIDENCE_EXCHANGE_DISABLED, buildDisagreementExchangeFixtureV1, buildDisagreementExchangeNoGovernanceFixtureV1, runCrossEvidenceExchangeExecute, runExecuteCli } from "../experiments/campaign/v6/run_v6_cross_evidence_exchange";
import { createHiddenBenchTaskProjectionV1 } from "../experiments/campaign/v6/hiddenBenchTaskAdapter";
import { ALWAYS_INELIGIBLE_EXCHANGE_RULE_REF, createDisagreementExchangeRuleV1, createCrossEvidenceSelectorV1, createDisconfirmingEvidenceSelectorV1, DISAGREEMENT_EXCHANGE_RULE_REF } from "../experiments/campaign/v6/disagreementExchangeGovernanceV1";
import { resolveV6AuditableRawRunPath } from "../experiments/campaign/v6/productionVerticalSlice";
import { pairwiseTotalVariationV1, selectMaxDisagreementPairV1, buildCrossEvidenceMessageV1, selectCrossEvidenceV1, selectAllDisconfirmingEvidenceV1, buildAllDisconfirmingEvidenceMessageV1 } from "../experiments/campaign/v6/crossEvidenceExchangeSelectorsV1";
import type { SingleAttemptTextInvoker, SingleAttemptTextInvokeRequest } from "../experiments/campaign/v6/providerAdapters";

const TASK_ID = 13;

describe("disagreement eligibility rule", () => {
  const rule = createDisagreementExchangeRuleV1();
  const diagnosis = (maxTV: number) => ({
    id: "d1",
    diagnosisRef: { id: "swarmalpha.risk.high-round1-disagreement", version: "1.0.0" },
    attributes: { claimId: "claim:x", maxPairwiseTV: maxTV },
    targetIds: ["agent:1"],
  } as never);

  it("is eligible when max pairwise TV >= 0.8 and produces a zero-cost exchange candidate", () => {
    const result = rule.evaluate({ diagnoses: [diagnosis(0.85)] } as never);
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.candidate?.actionRef.id).toBe("swarmalpha.action.cross-evidence-exchange");
      expect(result.candidate?.expectedCost).toEqual({ modelCalls: 0, tokenBudget: 0 });
    }
  });

  it("is ineligible below the disagreement threshold", () => {
    const result = rule.evaluate({ diagnoses: [diagnosis(0.5)] } as never);
    expect(result.eligible).toBe(false);
  });
});

describe("cross-evidence selectors", () => {
  it("computes pairwise TV and selects the max-disagreement pair deterministically", () => {
    const reports = [
      { agentId: "a", probabilities: { A: 1, B: 0, C: 0 }, evidenceRefs: [] },
      { agentId: "b", probabilities: { A: 0, B: 1, C: 0 }, evidenceRefs: [] },
      { agentId: "c", probabilities: { A: 0.5, B: 0.5, C: 0 }, evidenceRefs: [] },
    ];
    expect(pairwiseTotalVariationV1(reports[0].probabilities, reports[1].probabilities)).toBe(1);
    const pair = selectMaxDisagreementPairV1(reports);
    expect(pair).not.toBeNull();
    if (pair) expect(pair.maxTV).toBe(1);
    const again = selectMaxDisagreementPairV1(reports);
    expect(again).toEqual(pair);
  });

  it("builds an auditable cross-evidence message with hashes and non-certificate framing", () => {
    const msg = buildCrossEvidenceMessageV1({
      agentA: "a", agentB: "b", aTop: "A", bTop: "B",
      aEvidence: [{ evidenceId: "e1", content: "A is safe", contentHash: "sha256:aaa" }],
      bEvidence: [{ evidenceId: "e2", content: "B is reachable", contentHash: "sha256:bbb" }],
    });
    expect(msg).toContain("[Experiment-authorized cross-evidence exchange]");
    expect(msg).toContain("not a correctness certificate");
    expect(msg).toContain("sha256:aaa");
    expect(msg).toContain("sha256:bbb");
  });

  it("selects only 'attacks' evidence when relation='attacks'", () => {
    const reports = [
      { agentId: "a", probabilities: { A: 1, B: 0 }, evidenceRefs: [
        { evidenceId: "e1", relation: "supports" as const },
        { evidenceId: "e2", relation: "attacks" as const },
      ] },
      { agentId: "b", probabilities: { A: 0, B: 1 }, evidenceRefs: [
        { evidenceId: "e3", relation: "supports" as const },
        { evidenceId: "e4", relation: "attacks" as const },
      ] },
    ];
    const registry = new Map([
      ["e1", { evidenceId: "e1", content: "s1", contentHash: "sha256:s1" }],
      ["e2", { evidenceId: "e2", content: "a1", contentHash: "sha256:a1" }],
      ["e3", { evidenceId: "e3", content: "s2", contentHash: "sha256:s2" }],
      ["e4", { evidenceId: "e4", content: "a2", contentHash: "sha256:a2" }],
    ]);
    const pair = { agentA: "a", agentB: "b", maxTV: 1 };
    const sel = selectCrossEvidenceV1({ reports, evidenceRegistry: registry, pair, relation: "attacks" });
    expect(sel.aEvidence.map(e => e.content)).toEqual(["a1"]);
    expect(sel.bEvidence.map(e => e.content)).toEqual(["a2"]);
    expect(sel.relation).toBe("attacks");
  });

  it("builds a disconfirming message with the attacks label", () => {
    const msg = buildCrossEvidenceMessageV1({
      agentA: "a", agentB: "b", aTop: "A", bTop: "B", relation: "attacks",
      aEvidence: [{ evidenceId: "e1", content: "Charlie's power failed", contentHash: "sha256:aaa" }],
      bEvidence: [],
    });
    expect(msg).toContain("attacks (disconfirms an option)");
    expect(msg).toContain("Charlie's power failed");
  });

  it("disconfirming selector surfaces attacks evidence via the wired callback", () => {
    const selector = createDisconfirmingEvidenceSelectorV1();
    const out = selector({
      runId: "r",
      round1Reports: [
        { agentId: "a", probabilities: { A: 1, B: 0 }, evidenceRefs: [{ evidenceId: "e1", relation: "attacks" }] },
        { agentId: "b", probabilities: { A: 0, B: 1 }, evidenceRefs: [{ evidenceId: "e2", relation: "attacks" }] },
      ],
      getEvidence: (id) => (id === "e1"
        ? { content: "Charlie's power failed", contentHash: "sha256:a1" }
        : { content: "Bravo is flooding", contentHash: "sha256:a2" }),
    });
    expect(out).not.toBeNull();
    expect(out).toContain("attacks (disconfirms an option)");
    expect(out).toContain("Charlie's power failed");
    expect(out).toContain("Bravo is flooding");
  });

  it("all-agents disconfirming selector dedupes repeated attacks and keeps unique ones", () => {
    const reports = [
      { agentId: "a", probabilities: { A: 1, B: 0 }, evidenceRefs: [{ evidenceId: "e1", relation: "attacks" as const }] },
      { agentId: "b", probabilities: { A: 0, B: 1 }, evidenceRefs: [{ evidenceId: "e2", relation: "attacks" as const }] },
      { agentId: "c", probabilities: { A: 0.5, B: 0.5 }, evidenceRefs: [{ evidenceId: "e3", relation: "attacks" as const }] },
    ];
    const registry = new Map([
      ["e1", { evidenceId: "e1", content: "Charlie power failed", contentHash: "sha256:same" }],
      ["e2", { evidenceId: "e2", content: "Charlie power failed", contentHash: "sha256:same" }], // same content -> dedup
      ["e3", { evidenceId: "e3", content: "Charlie crosswinds", contentHash: "sha256:unique" }],
    ]);
    const items = selectAllDisconfirmingEvidenceV1({ reports, evidenceRegistry: registry });
    expect(items).toHaveLength(2); // deduped: one shared, one unique
    const shared = items.find(i => i.contentHash === "sha256:same");
    expect(shared).toBeDefined();
    expect(shared?.sourceAgentIds.sort()).toEqual(["a", "b"]);
    expect(items.find(i => i.contentHash === "sha256:unique")?.sourceAgentIds).toEqual(["c"]);
  });

  it("builds the all-agents disconfirming message with neutral framing", () => {
    const msg = buildAllDisconfirmingEvidenceMessageV1([{
      sourceAgentIds: ["a", "b"],
      content: "Charlie power failed",
      contentHash: "sha256:same",
    }]);
    expect(msg).toContain("[Experiment-authorized disconfirming evidence disclosure]");
    expect(msg).toContain("not a correctness certificate");
    expect(msg).toContain("sourceAgentId: a, b");
    expect(msg).toContain("Charlie power failed");
  });
});

describe("governance vs no-governance fixture symmetry", () => {
  const gov = buildDisagreementExchangeFixtureV1(TASK_ID);
  const ng = buildDisagreementExchangeNoGovernanceFixtureV1(TASK_ID);

  it("shares study identity, task, base contracts, and primary assignment design", () => {
    expect(ng.study.id).toBe(gov.study.id);
    expect(ng.study.version).toBe(gov.study.version);
    expect(ng.study.taskFamilyRef).toEqual(gov.study.taskFamilyRef);
    expect(ng.study.primaryAssignmentDesign).toEqual(gov.study.primaryAssignmentDesign);
    expect(ng.base.discussionContract).toEqual(gov.base.discussionContract);
    expect(ng.base.verificationContract).toEqual(gov.base.verificationContract);
    expect(ng.base.finalContract).toEqual(gov.base.finalContract);
    expect(ng.projection.adapter.task).toEqual(gov.projection.adapter.task);
  });

  it("uses the identical cross-evidence-exchange action and arms in both arms", () => {
    const govAlloc = gov.study.governancePolicy!.assignmentDesign!.allocations[0];
    const ngAlloc = ng.study.governancePolicy!.assignmentDesign!.allocations[0];
    expect(ngAlloc.actionRef).toEqual(govAlloc.actionRef);
    expect(ngAlloc.arms).toEqual(govAlloc.arms);
    expect(govAlloc.actionRef.id).toBe("swarmalpha.action.cross-evidence-exchange");
  });

  it("differs only in the eligibility rule authorization, not the contract/action", () => {
    expect(gov.rule.id).toBe(DISAGREEMENT_EXCHANGE_RULE_REF.id);
    expect(ng.rule.id).toBe(ALWAYS_INELIGIBLE_EXCHANGE_RULE_REF.id);
    expect(gov.study.governancePolicy!.eligibilityRuleRefs[0].id).toBe(DISAGREEMENT_EXCHANGE_RULE_REF.id);
    expect(ng.study.governancePolicy!.eligibilityRuleRefs[0].id).toBe(ALWAYS_INELIGIBLE_EXCHANGE_RULE_REF.id);
    const govContract = gov.interventionContracts[0];
    const ngContract = ng.interventionContracts[0];
    expect(ngContract.id).toBe(govContract.id);
    expect(ngContract.version).toBe(govContract.version);
    expect(ngContract.randomization).toEqual(govContract.randomization);
    expect(govContract.eligibilityRuleRefs[0].id).toBe(DISAGREEMENT_EXCHANGE_RULE_REF.id);
    expect(ngContract.eligibilityRuleRefs[0].id).toBe(ALWAYS_INELIGIBLE_EXCHANGE_RULE_REF.id);
  });
});

describe("frozen plan stability", () => {
  it("reproduces the frozen contentHash (fixture edits must not alter the plan)", () => {
    const plan = buildCrossEvidenceExchangePlanV1(CROSS_EVIDENCE_EXCHANGE_TASK_IDS);
    expect(plan.totalRuns).toBe(40);
    expect(plan.contentHash).toBe("sha256:d1f2f8f642f59758367584be0c024ce4ee68b8ed7127c62a741d713aa9b33ef7");
  });
});

describe("experiment disable (parked after attacks rounds)", () => {
  it("is parked and fail-closes --execute even with RUN_AUTHORIZED=yes", async () => {
    expect(CROSS_EVIDENCE_EXCHANGE_DISABLED).toBe(true);
    const prev = process.env.RUN_AUTHORIZED;
    process.env.RUN_AUTHORIZED = "yes";
    try {
      await expect(runExecuteCli()).resolves.toBe(6);
    } finally {
      if (prev === undefined) delete process.env.RUN_AUTHORIZED; else process.env.RUN_AUTHORIZED = prev;
    }
  });
});

describe("end-to-end exchange delivery (mock invoker, zero provider)", () => {
  it("delivers exchange or holdout on every eligible governance run, with zero extra calls", async () => {
    const optionsFor = (taskId: number): string[] =>
      createHiddenBenchTaskProjectionV1({ sourceTaskId: taskId }).adapter.task.claim.options;
    const probsFor = (options: string[], agentIdx: number) =>
      Object.fromEntries(options.map((o, i) => [o, i === agentIdx % options.length ? 0.99 : 0.01 / (options.length - 1)]));
    let callCount = 0;
    const invoke = async (req: SingleAttemptTextInvokeRequest) => {
      callCount += 1;
      const usage = { promptTokens: 10, completionTokens: 10, totalTokens: 20 };
      const m = /agent:hiddenbench:(\d+):(\d+)/.exec(req.requestId);
      const taskId = m ? parseInt(m[1], 10) : TASK_ID;
      const idx = m ? parseInt(m[2], 10) - 1 : 0;
      const options = optionsFor(taskId);
      const claimId = `claim:hiddenbench:${taskId}:answer`;
      const probabilities = probsFor(options, idx);
      if (req.requestId.startsWith("final:")) {
        return { rawContent: JSON.stringify({ status: "answered", reports: [{ claimId, value: { kind: "categorical", probabilities } }] }), usage };
      }
      // Emit one attacks (disconfirming) evidence item so the round-3 attacks
      // selector has content to surface; the supports selector would also see it.
      return { rawContent: JSON.stringify({ message: "mock", belief: { kind: "categorical", probabilities }, evidence: [{ content: `mock attack ${idx}`, relation: "attacks" }] }), usage };
    };
    const plan = buildCrossEvidenceExchangePlanV1(CROSS_EVIDENCE_EXCHANGE_TASK_IDS);
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "exchange-test-"));
    const outputDir = path.join(base, "out");
    try {
      const { runs } = await runCrossEvidenceExchangeExecute({ plan, invoker: { invoke } as SingleAttemptTextInvoker, outputDir });
      expect(runs).toBe(40);
      const exchangeEventIds = (a: Record<string, unknown>): string[] =>
        ((((a.governanceAuditTrail as Record<string, unknown> | undefined)?.sourceEvents as Array<Record<string, unknown>> | undefined) ?? [])
          .map(e => String(((e.eventRef as { id?: unknown } | undefined)?.id) ?? "")));
      const actionTransitions = (a: Record<string, unknown>): string[] =>
        ((((a.governanceAuditTrail as Record<string, unknown> | undefined)?.actionTransitions as Array<Record<string, unknown>> | undefined) ?? [])
          .map(t => String((t as { to?: unknown }).to)));
      const hasExchange = (a: Record<string, unknown>): boolean =>
        exchangeEventIds(a).some(id => id.includes("cross-evidence-exchange"));
      let exchangeDelivered = 0;
      let govHeldOut = 0;
      for (const run of plan.runs) {
        const file = resolveV6AuditableRawRunPath(outputDir, run.runId);
        const artifact = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
        const transitions = actionTransitions(artifact);
        if (transitions.includes("held_out")) {
          govHeldOut += 1;
          expect(hasExchange(artifact)).toBe(false); // holdout never delivers exchange
        } else {
          expect(transitions).toContain("delivered");
          expect(hasExchange(artifact)).toBe(true); // non-holdout eligible run delivers exchange
          exchangeDelivered += 1;
        }
      }
      // High-disagreement mock (max TV 1.0) -> every governance run is eligible,
      // then the frozen 0.9/0.1 seed splits exchange/holdout.
      expect(exchangeDelivered + govHeldOut).toBe(plan.runs.length);
      // 0.9/0.1 across 40 eligible runs yields both arms.
      expect(exchangeDelivered).toBeGreaterThanOrEqual(1);
      expect(govHeldOut).toBeGreaterThanOrEqual(1);
      // 40 runs x agentCount*3 calls; exchange adds zero calls.
      const expectedCalls = plan.runs.reduce((s, r) => s + r.plannedProviderCalls, 0);
      expect(callCount).toBe(expectedCalls);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  }, 60000);
});
