/**
 * Verification Verdict V2 adversarial tests for the version-isolated
 * engineering implementation and the legacy V1 read path.
 *
 * Frozen V2 semantics (Codex-owned, not to be extended here):
 *   1. `VerificationVerdictV2` = "supported" | "contradicted" | "insufficient_evidence".
 *   2. The public-only verifier judges whether `targetPublicMessage` is supported
 *      by `publicContext`. It never reads agent private information, never reads
 *      ground truth / resolver opening / correct answer, never supplies a
 *      substitute answer, and MUST return `insufficient_evidence` when the public
 *      evidence is underdetermined. `contradicted` means the public context
 *      clearly conflicts with the message — it does NOT mean the verifier knows
 *      the correct answer.
 *   3. Delivered governance content must carry evidenceScope = "public_only",
 *      verdict, and explanation — and must never carry
 *      alternativeOutcome / correctAnswer / recommendedAnswer.
 *   4. Sham semantics stay as-is: no verifier verdict, no evidence introduced,
 *      matched-attention control.
 *   5. V1 artifacts stay readable as legacy/read-only; no silent upgrade or
 *      backfill inference.
 *
 * V2 invariants are executable. Legacy V1 risk reproduction remains explicit
 * so old artifacts stay readable without masquerading as V2.
 *
 * Nothing here calls a real or paid LLM.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VERIFICATION_SHAM_ACTION_REF_V2 } from "@/lib/governance";
import {
  createV6VerificationAdapter,
  type SingleAttemptTextInvokeRequest,
  type SingleAttemptTextInvokeResult,
  type SingleAttemptTextInvoker,
} from "../experiments/campaign/v6/providerAdapters";
import type { V6VerificationRequestV1, V6VerificationRequestV2 } from "../experiments/campaign/v6/productionVerticalSlice";
import { createV6HiddenBenchSmokeFixtureV1 } from "../experiments/campaign/v6/v6HiddenBenchSmokeFixture";
import { planV6CalibrationRuns } from "../experiments/campaign/v6/v6BinarySmokeFixture";
import { runV6SmokeExecute } from "../experiments/campaign/v6/run_v6_smoke";

// Task-4 HiddenBench fixture: public context is intentionally underdetermined —
// the correct answer ("Mr. X's son") is only recoverable with hidden/private info
// the public-only verifier must not see. This is the same task family as the
// mechanism-pilot apply artifacts analyzed for WP-C.
const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: 4, profile: "mechanism-check-07-v1" });

const PILOT_DIR = path.join("experiments", "campaign", "pilot_output", "v6-hb-task4-mechanism-pilot-v1-20260812");
const hasPilotArtifact = fs.existsSync(PILOT_DIR);
const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function mockInvoker(
  handler: (request: SingleAttemptTextInvokeRequest, signal: AbortSignal) => Promise<SingleAttemptTextInvokeResult>,
) {
  const invoke = vi.fn(handler);
  return { invoker: { invoke } as SingleAttemptTextInvoker, invoke };
}

function verificationRequest(overrides: Partial<V6VerificationRequestV1> = {}): V6VerificationRequestV1 {
  return {
    requestSchemaRef: { id: "swarmalpha.v6.verification-request", version: "1.0.0" },
    requestId: "verification:run:v6:action:1",
    runId: "run:v6",
    taskId: fixture.task.id,
    actionRef: { id: "swarmalpha.action.verification-request", version: "2.0.0" },
    targetAgentId: fixture.task.agents[0].agentId,
    claim: fixture.task.claim,
    publicContext: fixture.task.publicContext,
    targetPublicMessage: "The guilty person is Mr. X's son.",
    matchedTokenBudget: 300,
    modelRef: { id: "model:verifier", version: "1.0.0" },
    invocationConfig: { temperature: 0 },
    ...overrides,
  };
}

function verificationRequestV2(overrides: Partial<V6VerificationRequestV2> = {}): V6VerificationRequestV2 {
  const legacy = verificationRequest();
  return {
    ...legacy,
    requestSchemaRef: { id: "swarmalpha.v6.verification-request", version: "2.0.0" },
    evidenceScope: "public_only",
    responseContract: "verdict_json_v2",
    ...overrides,
  };
}

function v2Adapter(raw: unknown) {
  const v2Fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: 4, profile: "mechanism-verdict-v2-v1" });
  const m = mockInvoker(async () => ({ rawContent: typeof raw === "string" ? raw : JSON.stringify(raw) }));
  return {
    adapter: createV6VerificationAdapter({ contract: v2Fixture.verificationContract, invoker: m.invoker }),
    invoke: m.invoke,
    fixture: v2Fixture,
  };
}

// ============================================================================
// Frozen V2 invariants (production V2 not implemented — it.todo, never pass)
// ============================================================================

describe("V2 frozen invariants (VerificationVerdictV2)", () => {
  it("accepts exactly the three frozen public-only verdicts", async () => {
    for (const verdict of ["supported", "contradicted", "insufficient_evidence"] as const) {
      const { adapter } = v2Adapter({ evidenceScope: "public_only", verdict, explanation: "The public evidence has this relation to the message." });
      await expect(adapter.verify(verificationRequestV2(), new AbortController().signal)).resolves.toEqual({
        status: "response", evidenceScope: "public_only", verdict,
        explanation: "The public evidence has this relation to the message.",
      });
    }
  });

  it.each([
    ["unknown verdict", { evidenceScope: "public_only", verdict: "likely", explanation: "x" }],
    ["missing verdict", { evidenceScope: "public_only", explanation: "x" }],
    ["wrong scope", { evidenceScope: "private", verdict: "supported", explanation: "x" }],
    ["empty explanation", { evidenceScope: "public_only", verdict: "supported", explanation: "" }],
    ["unexpected field", { evidenceScope: "public_only", verdict: "supported", explanation: "x", extra: true }],
    ["alternative outcome", { evidenceScope: "public_only", verdict: "contradicted", explanation: "x", alternativeOutcome: "Mr. Z" }],
    ["correct answer", { evidenceScope: "public_only", verdict: "contradicted", explanation: "x", correctAnswer: "Mr. Z" }],
    ["recommended answer", { evidenceScope: "public_only", verdict: "contradicted", explanation: "x", recommendedAnswer: "Mr. Z" }],
  ])("rejects %s fail-closed", async (_label, raw) => {
    const { adapter } = v2Adapter(raw);
    await expect(adapter.verify(verificationRequestV2(), new AbortController().signal)).resolves.toEqual({
      status: "unavailable", diagnosticCode: "adapter_unavailable",
    });
  });

  it("rejects substitute-answer authority hidden inside explanation", async () => {
    for (const explanation of [
      "The correct answer is Mr. Z.",
      "The recommended outcome is Mr. Z.",
      "Public evidence instead establishes Mrs. Y.",
    ]) {
      const { adapter } = v2Adapter({ evidenceScope: "public_only", verdict: "contradicted", explanation });
      expect(await adapter.verify(verificationRequestV2(), new AbortController().signal))
        .toEqual({ status: "unavailable", diagnosticCode: "adapter_unavailable" });
    }
    const { adapter } = v2Adapter({
      evidenceScope: "public_only",
      verdict: "insufficient_evidence",
      explanation: "The public evidence is insufficient to establish the message about Mr. X's son.",
    });
    await expect(adapter.verify(verificationRequestV2(), new AbortController().signal)).resolves.toMatchObject({
      status: "response", verdict: "insufficient_evidence",
    });
  });

  it("freezes a truth-free request/prompt and distinct V2 contract identity", async () => {
    const { adapter, invoke, fixture: v2Fixture } = v2Adapter({
      evidenceScope: "public_only", verdict: "insufficient_evidence", explanation: "Public evidence is underdetermined.",
    });
    await adapter.verify(verificationRequestV2(), new AbortController().signal);
    const sent = JSON.stringify(invoke.mock.calls[0][0]);
    expect(sent).not.toContain("1.5 level of alcohol");
    expect(sent).not.toContain("driving at 110 km/h");
    expect(sent).not.toContain("groundTruth");
    expect(sent).toContain("insufficient_evidence");
    expect(v2Fixture.verificationContract.responseContract).toBe("verdict_json_v2");
    expect(v2Fixture.study.id).toContain("mechanism-verdict-v2-v1");
    expect(fixture.verificationContract.responseContract).toBeUndefined();
    expect(fixture.study.id).not.toBe(v2Fixture.study.id);
  });

  it("keeps V2 sham as matched attention with no verdict authority", async () => {
    const { adapter, invoke } = v2Adapter({ acknowledgment: "control" });
    const result = await adapter.verify(
      verificationRequestV2({ actionRef: VERIFICATION_SHAM_ACTION_REF_V2 }),
      new AbortController().signal,
    );
    expect(result).toEqual({ status: "response", publicContent: "Matched control completed; no new evidence was introduced." });
    expect("verdict" in result).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(invoke.mock.calls[0][0])).not.toContain(fixture.task.publicContext);
  });

  it("does not reinterpret malformed output as insufficient evidence", async () => {
    const { adapter } = v2Adapter("not-json");
    const result = await adapter.verify(verificationRequestV2(), new AbortController().signal);
    expect(result).toEqual({ status: "unavailable", diagnosticCode: "adapter_unavailable" });
    expect(JSON.stringify(result)).not.toContain("insufficient_evidence");
  });

  it("executes and immediately replays V2 apply/sham/holdout without authority mixing", async () => {
    const v2Fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: 4, profile: "mechanism-verdict-v2-v1" });
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "v6-verdict-v2-"));
    tempDirs.push(outputDir);
    const options = v2Fixture.task.claim.options;
    const invoke = vi.fn(async (request: SingleAttemptTextInvokeRequest) => {
      const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
      if (request.requestId.startsWith("final:")) {
        return {
          rawContent: JSON.stringify({
            status: "answered",
            reports: [{
              claimId: v2Fixture.task.claim.id,
              value: { kind: "categorical", probabilities: Object.fromEntries(options.map((option, index) => [option, index === 0 ? 1 : 0])) },
            }],
          }),
          usage,
        };
      }
      if (request.userPrompt.includes("matched process-control request")) {
        return { rawContent: JSON.stringify({ acknowledgment: "control" }), usage };
      }
      if (request.systemPrompt === "You are an independent verifier.") {
        return {
          rawContent: JSON.stringify({
            evidenceScope: "public_only",
            verdict: "insufficient_evidence",
            explanation: "The public evidence does not determine whether the message is correct.",
          }),
          usage,
        };
      }
      return {
        rawContent: JSON.stringify({
          message: "A public discussion message.",
          belief: { kind: "categorical", probabilities: Object.fromEntries(options.map((option, index) => [option, index === 0 ? 1 : 0])) },
          evidence: [{ content: "Publicly stated evidence.", relation: "supports" }],
        }),
        usage,
      };
    });
    const plannedRuns = planV6CalibrationRuns(v2Fixture, 12, "run:v6-verdict-v2")
      .filter(run => run.protocol === "epistemic_governance_v1");
    const result = await runV6SmokeExecute({
      outputDir,
      fixture: v2Fixture,
      invoker: { invoke } as SingleAttemptTextInvoker,
      plannedRuns,
      maxProviderCalls: 200,
      maxTotalTokens: 100_000,
    });
    const artifacts = result.results.map(item => JSON.parse(fs.readFileSync(item.absolutePath, "utf8")));
    const byArm = new Map(artifacts.map(artifact => [
      artifact.governanceAuditTrail.eventAssignments[0].assignedArm,
      artifact,
    ]));
    expect([...byArm.keys()].sort()).toEqual(["apply", "holdout", "sham"]);

    const apply = byArm.get("apply")!;
    const applyEvent = apply.governanceAuditTrail.sourceEvents.find(
      (event: { eventRef: { id: string } }) => event.eventRef.id === "swarmalpha.event.verification-result",
    );
    expect(applyEvent.eventRef.version).toBe("2.0.0");
    expect(applyEvent.payload).toMatchObject({
      evidenceScope: "public_only",
      verdict: "insufficient_evidence",
      explanation: "The public evidence does not determine whether the message is correct.",
    });
    expect(applyEvent.payload).not.toHaveProperty("publicContent");
    const applyGovernanceMessage = apply.v6InteractionTrace.publicTranscript.find(
      (entry: { source: string }) => entry.source === "governance",
    );
    expect(JSON.parse(applyGovernanceMessage.content)).toEqual({
      evidenceScope: "public_only",
      verdict: "insufficient_evidence",
      explanation: "The public evidence does not determine whether the message is correct.",
    });

    const sham = byArm.get("sham")!;
    const shamEvent = sham.governanceAuditTrail.sourceEvents.find(
      (event: { eventRef: { id: string } }) => event.eventRef.id === "swarmalpha.event.verification-result",
    );
    expect(shamEvent.eventRef.version).toBe("1.0.0");
    expect(shamEvent.payload).not.toHaveProperty("verdict");
    expect(shamEvent.payload.publicContent).toBe("Matched control completed; no new evidence was introduced.");

    const holdout = byArm.get("holdout")!;
    expect(holdout.governanceAuditTrail.sourceEvents
      .some((event: { eventRef: { id: string } }) => event.eventRef.id === "swarmalpha.event.verification-result"))
      .toBe(false);
    expect(result.results.every(item => item.reused === false)).toBe(true);

    const replay = await runV6SmokeExecute({
      outputDir,
      fixture: v2Fixture,
      invoker: { invoke: vi.fn(async () => { throw new Error("provider_must_not_be_called"); }) } as unknown as SingleAttemptTextInvoker,
      plannedRuns,
      maxProviderCalls: 200,
      maxTotalTokens: 100_000,
    });
    expect(replay.results.every(item => item.reused)).toBe(true);
    expect(replay.budget.callCount).toBe(0);

    const applyResult = result.results.find(item => item.run.runId === apply.runId)!;
    const applyPlan = plannedRuns.find(item => item.runId === apply.runId)!;
    const original = fs.readFileSync(applyResult.absolutePath, "utf8");
    for (const [field, replacement] of [
      ["verdict", "supported"],
      ["explanation", "Tampered explanation."],
      ["evidenceScope", "private"],
    ] as const) {
      const tampered = JSON.parse(original);
      const event = tampered.governanceAuditTrail.sourceEvents.find(
        (candidate: { eventRef: { version: string } }) => candidate.eventRef.version === "2.0.0",
      );
      event.payload[field] = replacement;
      fs.writeFileSync(applyResult.absolutePath, JSON.stringify(tampered), "utf8");
      const forbiddenProvider = vi.fn(async () => { throw new Error("provider_must_not_be_called"); });
      await expect(runV6SmokeExecute({
        outputDir,
        fixture: v2Fixture,
        invoker: { invoke: forbiddenProvider } as unknown as SingleAttemptTextInvoker,
        plannedRuns: [applyPlan],
        maxProviderCalls: 20,
        maxTotalTokens: 100_000,
      })).rejects.toThrow();
      expect(forbiddenProvider).not.toHaveBeenCalled();
      fs.writeFileSync(applyResult.absolutePath, original, "utf8");
    }
  });
});

// ============================================================================
// V1 risk-reproduction — PASSING on the current V1 implementation
// ============================================================================

describe("V1 risk reproduction (passes today; V2 must change these)", () => {
  it("V1 request carries public-only evidence scope: no private info, ground truth, or resolution", async () => {
    const m = mockInvoker(async () => ({ rawContent: JSON.stringify({ publicContent: "verified" }) }));
    const adapter = createV6VerificationAdapter({ contract: fixture.verificationContract, invoker: m.invoker });
    const request = verificationRequest();
    await adapter.verify(request, new AbortController().signal);
    const sent = JSON.stringify(m.invoke.mock.calls[0][0]);
    // Distinctive hidden-information clauses must never reach the verifier.
    for (const hiddenClause of ["1.5 level of alcohol", "less than 30 years old", "driving at 110 km/h"]) {
      expect(sent).not.toContain(hiddenClause);
    }
    expect(sent).not.toContain("groundTruth");
    expect(sent).not.toContain("resolver:");
    // The request object itself carries no private/truth fields.
    expect("privateInformation" in request).toBe(false);
    expect("groundTruth" in request).toBe(false);
    expect("resolution" in request).toBe(false);
  });

  it("V1 risk: adapter accepts free text asserting a substitute correct answer (authority hallucination)", async () => {
    const m = mockInvoker(async () => ({
      rawContent: JSON.stringify({ publicContent: "The public message is incorrect. The correct perpetrator is Mr. Z." }),
    }));
    const adapter = createV6VerificationAdapter({ contract: fixture.verificationContract, invoker: m.invoker });
    const result = await adapter.verify(verificationRequest(), new AbortController().signal);
    // Today this wrong-but-confident assertion is a normal response.
    expect(result).toEqual({
      status: "response",
      publicContent: "The public message is incorrect. The correct perpetrator is Mr. Z.",
    });
    // No structured verdict exists, so nothing distinguishes this from a support.
    expect("verdict" in result).toBe(false);
    expect("evidenceScope" in result).toBe(false);
  });

  it("V1 risk: a verdict-shaped response is rejected as unavailable (no V2 carrier exists today)", async () => {
    const m = mockInvoker(async () => ({
      rawContent: JSON.stringify({ publicContent: "verified", verdict: "supported" }),
    }));
    const adapter = createV6VerificationAdapter({ contract: fixture.verificationContract, invoker: m.invoker });
    const result = await adapter.verify(verificationRequest(), new AbortController().signal);
    expect(result).toEqual({ status: "unavailable", diagnosticCode: "adapter_unavailable" });
  });

  it("V1 risk: contradicted and insufficient-evidence free text are structurally indistinguishable", async () => {
    const contradicted = mockInvoker(async () => ({
      rawContent: JSON.stringify({ publicContent: "The message contradicts the shared facts; Mr. Z is guilty." }),
    }));
    const insufficient = mockInvoker(async () => ({
      rawContent: JSON.stringify({ publicContent: "The public context alone does not determine the answer." }),
    }));
    const a = createV6VerificationAdapter({ contract: fixture.verificationContract, invoker: contradicted.invoker });
    const b = createV6VerificationAdapter({ contract: fixture.verificationContract, invoker: insufficient.invoker });
    const r1 = await a.verify(verificationRequest(), new AbortController().signal);
    const r2 = await b.verify(verificationRequest(), new AbortController().signal);
    // Both are the same shape; the architecture cannot tell them apart.
    expect(r1).toEqual({ status: "response", publicContent: "The message contradicts the shared facts; Mr. Z is guilty." });
    expect(r2).toEqual({ status: "response", publicContent: "The public context alone does not determine the answer." });
  });

  it("V1: malformed verification output maps to unavailable, never to a verdict", async () => {
    const m = mockInvoker(async () => ({ rawContent: "not-json" }));
    const adapter = createV6VerificationAdapter({ contract: fixture.verificationContract, invoker: m.invoker });
    const result = await adapter.verify(verificationRequest(), new AbortController().signal);
    expect(result).toEqual({ status: "unavailable", diagnosticCode: "adapter_unavailable" });
  });

  it("V1 sham keeps matched-attention semantics and carries no verdict authority", async () => {
    const m = mockInvoker(async () => ({
      rawContent: JSON.stringify({ acknowledgment: "control payload" }),
    }));
    const adapter = createV6VerificationAdapter({ contract: fixture.verificationContract, invoker: m.invoker });
    const result = await adapter.verify(
      verificationRequest({ actionRef: VERIFICATION_SHAM_ACTION_REF_V2 }),
      new AbortController().signal,
    );
    expect(result.status).toBe("response");
    if (result.status === "response" && "publicContent" in result) {
      expect(result.publicContent).toBe("Matched control completed; no new evidence was introduced.");
      expect("verdict" in result).toBe(false);
      expect("evidenceScope" in result).toBe(false);
    }
  });

  it.skipIf(!hasPilotArtifact)(
    "V1 artifact: verification-result source event carries only publicContent (no V2 verdict fields)",
    () => {
      const file = fs.readdirSync(PILOT_DIR).find(name => /_1\..*\.raw-run\.v5\.json$/.test(name));
      expect(file).toBeDefined();
      const artifact = JSON.parse(fs.readFileSync(path.join(PILOT_DIR, file!), "utf8"));
      const events = artifact.governanceAuditTrail.sourceEvents
        .filter((ev: { eventRef?: { id?: string } }) => ev.eventRef?.id === "swarmalpha.event.verification-result");
      expect(events.length).toBeGreaterThan(0);
      for (const ev of events) {
        const keys = Object.keys(ev.payload);
        expect(keys).toContain("publicContent");
        expect(keys).not.toContain("verdict");
        expect(keys).not.toContain("evidenceScope");
        expect(keys).not.toContain("alternativeOutcome");
        expect(keys).not.toContain("correctAnswer");
        expect(keys).not.toContain("recommendedAnswer");
      }
    },
  );

  it.skipIf(!hasPilotArtifact)(
    "V1 artifact: the governance transcript carries the verifier free text verbatim",
    () => {
      const file = fs.readdirSync(PILOT_DIR).find(name => /_1\..*\.raw-run\.v5\.json$/.test(name));
      expect(file).toBeDefined();
      const artifact = JSON.parse(fs.readFileSync(path.join(PILOT_DIR, file!), "utf8"));
      const verificationEvent = artifact.governanceAuditTrail.sourceEvents
        .find((ev: { eventRef?: { id?: string } }) => ev.eventRef?.id === "swarmalpha.event.verification-result");
      expect(verificationEvent).toBeDefined();
      const governanceMessage = artifact.v6InteractionTrace.publicTranscript
        .find((entry: { source: string }) => entry.source === "governance");
      expect(governanceMessage).toBeDefined();
      expect(governanceMessage.content).toBe(verificationEvent.payload.publicContent);
    },
  );
});
