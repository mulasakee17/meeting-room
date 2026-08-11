/**
 * V6 authority-edge adversarial tests (handoff Work Package A). Every assertion
 * is fail-closed against the frozen public boundaries of the task-manifest /
 * monitoring / verified-calibration-admission layers. No core implementation is
 * modified; nothing here claims hiding, encryption, tamper-proofing, or
 * external authenticity for the internal commitments under test.
 * All mock invokers; no real or paid LLM call, no network, no credentials.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BeliefReport, EpistemicEvidence } from "@/lib/epistemic";
import {
  computeV6TaskDefinitionHashV1,
  computeV6TaskManifestHashV1,
  createV6TaskManifestV1,
  loadOrCreateV6TaskManifestV1,
  readV6TaskManifestV1,
  resolveV6TaskManifestV1Path,
  validateV6TaskManifestOpeningV1,
  validateV6TaskManifestResolutionV1,
  validateV6TaskManifestV1,
} from "../experiments/campaign/v6/v6TaskManifest";
import {
  computeV6MonitoringSelectionHashV1,
  createV6MonitoringDesignV1,
  createV6MonitoringSelectionV1,
  deriveVerifiedIndependentLineageCountV1,
  validateV6MonitoringSelectionV1,
} from "../experiments/campaign/v6/monitoringDesign";
import {
  createV6BinarySmokeFixture,
  planV6SmokeRuns,
  type V6SmokeFixtureV1,
  type V6SmokePlannedRun,
} from "../experiments/campaign/v6/v6BinarySmokeFixture";
import { runV6SmokeExecute } from "../experiments/campaign/v6/run_v6_smoke";
import type {
  SingleAttemptTextInvokeRequest,
  SingleAttemptTextInvoker,
} from "../experiments/campaign/v6/providerAdapters";
import {
  verifyV6CalibrationArtifactsV1,
  type V6CalibrationDatasetSpecV1,
} from "../experiments/campaign/v6/verifiedCalibrationDataset";
import { analyzeVerifiedV6Run } from "../experiments/campaign/v6/analyzeV6Calibration";
import {
  computeV6InteractionTraceHashV1,
  resolveV6AuditableRawRunPath,
  validateV6MonitoringAuditBindingV1,
} from "../experiments/campaign/v6/productionVerticalSlice";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v6-authority-adv-"));
  tempDirs.push(dir);
  return dir;
}

function authorityOf(fixture: V6SmokeFixtureV1) {
  return {
    adapterRef: fixture.taskAdapter.adapterRef,
    taskSchemaRef: fixture.taskAdapter.taskSchemaRef,
    resolution: fixture.taskAdapter.resolution,
  };
}

function manifestFor(fixture: V6SmokeFixtureV1, runId = "run:adversarial") {
  return createV6TaskManifestV1({
    runId,
    studyRef: fixture.study,
    task: fixture.task,
    authority: authorityOf(fixture),
    monitoringDesignRef: fixture.monitoringDesign.designRef,
    monitoringDesignHash: fixture.monitoringDesign.contentHash,
    committedAt: "2026-08-10T00:00:00.000Z",
  });
}

function specOf(fixture: V6SmokeFixtureV1): V6CalibrationDatasetSpecV1 {
  return {
    datasetRef: { id: "swarmalpha.dataset.v6-authority-adv", version: "1.0.0" },
    studies: [{
      studyRef: { id: fixture.study.id, version: fixture.study.version },
      governanceRules: [fixture.rule],
      allocationMode: "scheduled_engineering",
      allowedTaskDefinitionHashes: [computeV6TaskDefinitionHashV1(fixture.task, authorityOf(fixture))],
    }],
  };
}

function defaultInvoker(claimId: string): { invoker: SingleAttemptTextInvoker; invoke: ReturnType<typeof vi.fn> } {
  const invoke = vi.fn(async (request: SingleAttemptTextInvokeRequest) => {
    const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
    if (request.requestId.startsWith("final:")) {
      return {
        rawContent: JSON.stringify({
          status: "answered",
          reports: [{ claimId, value: { kind: "binary", probability: 0.4 } }],
        }),
        usage,
      };
    }
    if (request.userPrompt.includes("plain text only")) {
      return { rawContent: `${request.requestId} public view`, usage };
    }
    return {
      rawContent: JSON.stringify({
        message: "public message",
        belief: { kind: "binary", probability: 0.6 },
        evidence: [{ content: "public evidence", relation: "supports" }],
      }),
      usage,
    };
  });
  return { invoker: { invoke } as SingleAttemptTextInvoker, invoke };
}

async function produceProtocolArtifact(
  fixture: V6SmokeFixtureV1,
  outputDir: string,
  prefix: string,
  protocol: V6SmokePlannedRun["protocol"],
): Promise<Record<string, unknown>> {
  const mock = defaultInvoker(fixture.task.claim.id);
  const plannedRuns = planV6SmokeRuns(fixture, prefix).filter(run => run.protocol === protocol);
  await runV6SmokeExecute({
    outputDir,
    fixture,
    invoker: mock.invoker,
    plannedRuns,
    maxProviderCalls: 10,
    maxTotalTokens: 10_000,
  });
  return JSON.parse(fs.readFileSync(resolveV6AuditableRawRunPath(outputDir, plannedRuns[0].runId), "utf8")) as Record<string, unknown>;
}

function produceTextArtifact(fixture: V6SmokeFixtureV1, outputDir: string, prefix: string): Promise<Record<string, unknown>> {
  return produceProtocolArtifact(fixture, outputDir, prefix, "text_communication_v1");
}

describe("v6 task manifest adversarial", () => {
  it("rejects duplicate and empty agent ids in the frozen roster", () => {
    const fixture = createV6BinarySmokeFixture();
    const duplicate = {
      ...fixture.task,
      agents: fixture.task.agents.map((agent, index) => index === 1
        ? { ...agent, agentId: fixture.task.agents[0].agentId }
        : agent),
    };
    expect(() => createV6TaskManifestV1({
      runId: "run:dup",
      studyRef: fixture.study,
      task: duplicate,
      authority: authorityOf(fixture),
      monitoringDesignRef: fixture.monitoringDesign.designRef,
      monitoringDesignHash: fixture.monitoringDesign.contentHash,
      committedAt: "2026-08-10T00:00:00.000Z",
    })).toThrow(/unique agent roster/);
    const emptyId = { ...fixture.task, agents: fixture.task.agents.map((agent, index) => index === 0 ? { ...agent, agentId: "" } : agent) };
    expect(() => createV6TaskManifestV1({
      runId: "run:empty",
      studyRef: fixture.study,
      task: emptyId,
      authority: authorityOf(fixture),
      monitoringDesignRef: fixture.monitoringDesign.designRef,
      monitoringDesignHash: fixture.monitoringDesign.contentHash,
      committedAt: "2026-08-10T00:00:00.000Z",
    })).toThrow(/agentId/);
  });

  it("rejects roster reorder, public-context, claim, and resolution drift at opening", () => {
    const fixture = createV6BinarySmokeFixture();
    const manifest = manifestFor(fixture);
    expect(() => validateV6TaskManifestOpeningV1(manifest, {
      ...fixture.task,
      agents: [...fixture.task.agents].reverse(),
    }, authorityOf(fixture))).toThrow(/does not match/);
    expect(() => validateV6TaskManifestOpeningV1(manifest, {
      ...fixture.task,
      publicContext: "A different emergency context.",
    }, authorityOf(fixture))).toThrow(/does not match/);
    expect(() => validateV6TaskManifestOpeningV1(manifest, {
      ...fixture.task,
      claim: { ...fixture.task.claim, proposition: "A different proposition." },
    }, authorityOf(fixture))).toThrow(/does not match/);
    expect(() => createV6TaskManifestV1({
      runId: "run:resolver",
      studyRef: fixture.study,
      task: fixture.task,
      authority: { ...authorityOf(fixture), resolution: { kind: "from_task_outcome", resolverId: "resolver:other" } },
      monitoringDesignRef: fixture.monitoringDesign.designRef,
      monitoringDesignHash: fixture.monitoringDesign.contentHash,
      committedAt: "2026-08-10T00:00:00.000Z",
    })).toThrow(/resolver must match/);
  });

  it("treats the ground-truth commitment as an integrity-only opening, not hiding", () => {
    const fixture = createV6BinarySmokeFixture();
    const manifest = manifestFor(fixture);
    // The commitment is integrity-only by contract: it never claims to hide,
    // encrypt, or tamper-proof the outcome.
    expect(manifest.groundTruthCommitment.confidentiality).toBe("integrity_only_not_hiding");
    // Deterministic commitment over the committed inputs: same task → same hash.
    expect(manifestFor(fixture).groundTruthCommitment.valueHash).toBe(manifest.groundTruthCommitment.valueHash);
    // It opens only against the committed outcome.
    expect(() => validateV6TaskManifestResolutionV1(manifest, {
      claimId: manifest.primaryClaim.id,
      resolverId: manifest.resolutionContract.resolverId,
      kind: "binary",
      outcome: fixture.task.outcome,
    })).not.toThrow();
    expect(() => validateV6TaskManifestResolutionV1(manifest, {
      claimId: manifest.primaryClaim.id,
      resolverId: manifest.resolutionContract.resolverId,
      kind: "binary",
      outcome: !fixture.task.outcome,
    })).toThrow(/does not match/);
  });

  it("rejects non-canonical timestamps and tampered hashes", () => {
    const fixture = createV6BinarySmokeFixture();
    const manifest = manifestFor(fixture);
    expect(() => validateV6TaskManifestV1({ ...manifest, committedAt: "2026-08-10T00:00:00Z" }))
      .toThrow(/canonical ISO timestamp/);
    expect(() => validateV6TaskManifestV1({ ...manifest, contentHash: `sha256:${"a".repeat(64)}` }))
      .toThrow(/contentHash mismatch/);
    expect(() => createV6TaskManifestV1({
      runId: "run:designhash",
      studyRef: fixture.study,
      task: fixture.task,
      authority: authorityOf(fixture),
      monitoringDesignRef: fixture.monitoringDesign.designRef,
      monitoringDesignHash: "not-a-hash",
      committedAt: "2026-08-10T00:00:00.000Z",
    })).toThrow(/canonical sha256/);
  });

  it("publishes manifests no-replace with read isolation and path sanitization", () => {
    const fixture = createV6BinarySmokeFixture();
    const outputDir = tmpDir();
    const first = loadOrCreateV6TaskManifestV1({ outputDir, runId: "run:store", createManifest: () => manifestFor(fixture, "run:store") });
    expect(first.reused).toBe(false);
    const second = loadOrCreateV6TaskManifestV1({ outputDir, runId: "run:store", createManifest: () => manifestFor(fixture, "run:store") });
    expect(second.reused).toBe(true);
    // A conflicting manifest must not replace the published one.
    const conflicting = loadOrCreateV6TaskManifestV1({
      outputDir,
      runId: "run:store",
      createManifest: () => createV6TaskManifestV1({
        runId: "run:store",
        studyRef: fixture.study,
        task: { ...fixture.task, outcome: !fixture.task.outcome },
        authority: authorityOf(fixture),
        monitoringDesignRef: fixture.monitoringDesign.designRef,
        monitoringDesignHash: fixture.monitoringDesign.contentHash,
        committedAt: "2026-08-10T00:00:00.000Z",
      }),
    });
    expect(conflicting.manifest).toEqual(first.manifest);
    expect(readV6TaskManifestV1({ outputDir, runId: "run:missing" })).toBeNull();
    const root = path.resolve(outputDir);
    expect(path.dirname(resolveV6TaskManifestV1Path(outputDir, "../../etc/passwd"))).toBe(root);
  });

  it("rejects corrupt and hash-tampered manifest files on read", () => {
    const fixture = createV6BinarySmokeFixture();
    const outputDir = tmpDir();
    const corruptPath = resolveV6TaskManifestV1Path(outputDir, "run:corrupt");
    fs.mkdirSync(path.dirname(corruptPath), { recursive: true });
    fs.writeFileSync(corruptPath, "{ not json", "utf8");
    expect(() => readV6TaskManifestV1({ outputDir, runId: "run:corrupt" })).toThrow(/not valid JSON/);
    const manifest = manifestFor(fixture, "run:badhash");
    fs.writeFileSync(
      resolveV6TaskManifestV1Path(outputDir, "run:badhash"),
      JSON.stringify({ ...manifest, contentHash: `sha256:${"a".repeat(64)}` }),
      "utf8",
    );
    expect(() => readV6TaskManifestV1({ outputDir, runId: "run:badhash" })).toThrow(/contentHash mismatch/);
  });
});

describe("v6 monitoring design and selection adversarial", () => {
  function selectionBase(fixture: V6SmokeFixtureV1, runId: string) {
    return {
      design: fixture.monitoringDesign,
      runId,
      candidateReportIds: ["report:1", "report:2"],
      masterSeed: 7,
      selectedAt: "2026-08-10T00:00:01.000Z",
    };
  }

  it("rejects duplicate and empty candidate report ids", () => {
    const fixture = createV6BinarySmokeFixture();
    expect(() => createV6MonitoringSelectionV1({ ...selectionBase(fixture, "run:dup"), candidateReportIds: ["report:1", "report:1"] }))
      .toThrow(/unique non-empty report ids/);
    expect(() => createV6MonitoringSelectionV1({ ...selectionBase(fixture, "run:empty"), candidateReportIds: [""] }))
      .toThrow(/unique non-empty report ids/);
  });

  it("changes the commitment with run and seed, and rejects any selection-field tamper", () => {
    const fixture = createV6BinarySmokeFixture();
    const base = selectionBase(fixture, "run:same");
    const a = createV6MonitoringSelectionV1(base);
    const otherRun = createV6MonitoringSelectionV1(selectionBase(fixture, "run:other"));
    expect(a.seedCommitment).not.toBe(otherRun.seedCommitment);
    const otherSeed = createV6MonitoringSelectionV1({ ...base, masterSeed: 8 });
    expect(a.seedCommitment).not.toBe(otherSeed.seedCommitment);

    const tampered = [
      { ...a, selectedReportId: a.selectedReportId === "report:1" ? "report:2" : "report:1" },
      { ...a, randomDraw: (a.randomDraw ?? 0) + 0.01 },
      { ...a, selectionProbability: 0.99 },
      { ...a, selectedAt: "2026-08-10T00:00:02.000Z" },
    ];
    for (const selection of tampered) {
      expect(() => validateV6MonitoringSelectionV1(selection, fixture.monitoringDesign)).toThrow(/does not replay/);
    }
    // Self-consistent rehash of a DERIVED field still fails: the selection must
    // equal the deterministic recomputation, not merely carry a matching hash.
    const { contentHash: _ch, ...derivedBody } = {
      ...a,
      selectedReportId: a.selectedReportId === "report:1" ? "report:2" : "report:1",
    };
    const rehashedDerived = { ...derivedBody, contentHash: computeV6MonitoringSelectionHashV1(derivedBody) };
    expect(() => validateV6MonitoringSelectionV1(rehashedDerived, fixture.monitoringDesign)).toThrow(/does not replay/);
    // NOTE (design semantics, flagged to Codex): selectedAt is a supplied input
    // like committedAt/computedAt elsewhere, so a self-consistent rehash of the
    // timestamp alone is accepted by the replay; only derived fields
    // (selectedReportId, randomDraw, selectionProbability, seedCommitment,
    // status) are replay-fixed. Non-rehashed timestamp tamper is rejected via
    // contentHash mismatch (asserted above).
  });

  it("counts only verified, referenced, accepted-kind independent lineages (dedup, no self-report)", () => {
    const report: BeliefReport = {
      id: "report:a", claimId: "claim:a", agentId: "agent:a", round: 1,
      value: { kind: "binary", probability: 0.9 }, stake: 0, createdAt: "2026-08-10T00:00:00.000Z",
      evidence: [
        { evidenceId: "e:shared1", relation: "supports" },
        { evidenceId: "e:shared2", relation: "supports" },
        { evidenceId: "e:agent", relation: "supports" },
      ],
    };
    const evidence: EpistemicEvidence[] = [
      { id: "e:shared1", content: "tool result 1", createdAt: report.createdAt, provenance: { sourceKind: "tool", sourceId: "tool:a", lineageId: "L", contentHash: `sha256:${"1".repeat(64)}` } },
      { id: "e:shared2", content: "tool result 2", createdAt: report.createdAt, provenance: { sourceKind: "dataset", sourceId: "ds:a", lineageId: "L", contentHash: `sha256:${"2".repeat(64)}` } },
      { id: "e:agent", content: "self report", createdAt: report.createdAt, provenance: { sourceKind: "agent", sourceId: "agent:a", lineageId: "L2", contentHash: `sha256:${"3".repeat(64)}` } },
      { id: "e:unreferenced", content: "verified but not cited", createdAt: report.createdAt, provenance: { sourceKind: "tool", sourceId: "tool:b", lineageId: "L3", contentHash: `sha256:${"4".repeat(64)}` } },
    ];
    // Verified + accepted + referenced, but two entries share lineage "L" → counted once.
    expect(deriveVerifiedIndependentLineageCountV1({ report, evidence, verifiedEvidenceIds: ["e:shared1", "e:shared2"] })).toBe(1);
    // A verified accepted evidence that the report never references is not counted.
    expect(deriveVerifiedIndependentLineageCountV1({ report, evidence, verifiedEvidenceIds: ["e:unreferenced"] })).toBe(0);
    // Agent self-report never promoted to verified independent support.
    expect(deriveVerifiedIndependentLineageCountV1({ report, evidence, verifiedEvidenceIds: ["e:shared1", "e:agent"] })).toBe(1);
    // No verification records at all → 0. This is "missing qualified verification
    // records" in the current production slice, NOT an observation of no source.
    expect(deriveVerifiedIndependentLineageCountV1({ report, evidence, verifiedEvidenceIds: [] })).toBe(0);
  });

  it("rejects a self-consistently rehashed trace when its audit source still binds the old selection", async () => {
    const fixture = createV6BinarySmokeFixture();
    const outputDir = tmpDir();
    const artifact = await produceProtocolArtifact(
      fixture,
      outputDir,
      "run:v6-monitoring-binding",
      "epistemic_governance_v1",
    );
    const trace = artifact.v6InteractionTrace as Record<string, unknown>;
    const selection = trace.monitoringSelection as Record<string, unknown>;
    selection.selectedAt = new Date(Date.parse(selection.selectedAt as string) + 1).toISOString();
    const { contentHash: _selectionHash, ...selectionBody } = selection;
    selection.contentHash = computeV6MonitoringSelectionHashV1(
      selectionBody as Parameters<typeof computeV6MonitoringSelectionHashV1>[0],
    );
    const { contentHash: _traceHash, ...traceBody } = trace;
    trace.contentHash = computeV6InteractionTraceHashV1(
      traceBody as Parameters<typeof computeV6InteractionTraceHashV1>[0],
    );
    expect(() => verifyV6CalibrationArtifactsV1({
      artifacts: [{ sourcePath: "selection-audit-mismatch.json", artifact }],
      spec: specOf(fixture),
    })).toThrow(/monitoring selection differs from its governance belief source event/);
  });

  it("rejects a fully cross-linked selection timestamp that predates the frozen candidate population", async () => {
    const fixture = createV6BinarySmokeFixture();
    const outputDir = tmpDir();
    const artifact = await produceProtocolArtifact(
      fixture,
      outputDir,
      "run:v6-monitoring-time",
      "epistemic_governance_v1",
    );
    const trace = artifact.v6InteractionTrace as Record<string, unknown>;
    const reports = (trace.epistemicEvents as Array<{ type: string; report: { round: number; createdAt: string } }>)
      .filter(event => event.type === "belief_reported" && event.report.round === 1)
      .map(event => event.report);
    const earliestInvalidTime = new Date(Math.max(...reports.map(report => Date.parse(report.createdAt))) - 1)
      .toISOString();
    const selection = trace.monitoringSelection as Record<string, unknown>;
    selection.selectedAt = earliestInvalidTime;
    const { contentHash: _selectionHash, ...selectionBody } = selection;
    selection.contentHash = computeV6MonitoringSelectionHashV1(
      selectionBody as Parameters<typeof computeV6MonitoringSelectionHashV1>[0],
    );
    const { contentHash: _traceHash, ...traceBody } = trace;
    trace.contentHash = computeV6InteractionTraceHashV1(
      traceBody as Parameters<typeof computeV6InteractionTraceHashV1>[0],
    );
    const audit = artifact.governanceAuditTrail as {
      sourceEvents: Array<{ kind: string; payload: Record<string, unknown> }>;
    };
    const beliefSource = audit.sourceEvents.find(event => event.kind === "belief_report")!;
    beliefSource.payload.monitoringSelectionHash = selection.contentHash;
    expect(() => validateV6MonitoringAuditBindingV1(artifact as any))
      .toThrow(/cannot precede its frozen candidate population/);
  });

  it("admits an explicit empty monitoring population only when no belief source event is emitted", async () => {
    const fixture = createV6BinarySmokeFixture();
    const outputDir = tmpDir();
    const invoke = vi.fn(async (request: SingleAttemptTextInvokeRequest) => {
      const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
      if (request.requestId.startsWith("final:")) {
        return {
          rawContent: JSON.stringify({
            status: "answered",
            reports: [{ claimId: fixture.task.claim.id, value: { kind: "binary", probability: 0.5 } }],
          }),
          usage,
        };
      }
      return { rawContent: "not-json", usage };
    });
    const plannedRuns = planV6SmokeRuns(fixture, "run:v6-monitoring-empty")
      .filter(run => run.protocol === "epistemic_governance_v1");
    const executed = await runV6SmokeExecute({
      outputDir,
      fixture,
      invoker: { invoke },
      plannedRuns,
      maxProviderCalls: 10,
      maxTotalTokens: 10_000,
    });
    const artifact = JSON.parse(fs.readFileSync(executed.results[0].absolutePath, "utf8"));
    expect(artifact.v6InteractionTrace.monitoringSelection.status).toBe("empty_population");
    expect(artifact.governanceAuditTrail.sourceEvents.filter((event: { kind: string }) =>
      event.kind === "belief_report")).toEqual([]);
    expect(() => verifyV6CalibrationArtifactsV1({
      artifacts: [{ sourcePath: executed.results[0].absolutePath, artifact }],
      spec: specOf(fixture),
    })).not.toThrow();
  });
});

describe("v6 verified calibration admission adversarial", () => {
  it("rejects non-schema-5, wrong study registry, disallowed task hash, and bare raw analysis", async () => {
    const fixture = createV6BinarySmokeFixture();
    const outputDir = tmpDir();
    const artifact = await produceTextArtifact(fixture, outputDir, "run:v6-adv");

    const nonSchema5 = structuredClone(artifact) as Record<string, unknown>;
    nonSchema5.rawSchemaVersion = "4.0";
    expect(() => verifyV6CalibrationArtifactsV1({ artifacts: [{ sourcePath: "ns5.json", artifact: nonSchema5 }], spec: specOf(fixture) }))
      .toThrow(/schema-5/);

    const wrongStudy = structuredClone(artifact);
    expect(() => verifyV6CalibrationArtifactsV1({
      artifacts: [{ sourcePath: "wrong.json", artifact: wrongStudy }],
      spec: { ...specOf(fixture), studies: [{ ...specOf(fixture).studies[0], studyRef: { id: "swarmalpha.study.other", version: "1.0.0" } }] },
    })).toThrow(/no unique frozen study registry/);

    const disallowedTask = structuredClone(artifact);
    expect(() => verifyV6CalibrationArtifactsV1({
      artifacts: [{ sourcePath: "taskhash.json", artifact: disallowedTask }],
      spec: { ...specOf(fixture), studies: [{ ...specOf(fixture).studies[0], allowedTaskDefinitionHashes: [`sha256:${"c".repeat(64)}`] }] },
    })).toThrow(/outside the frozen allowlist/);

    // Bare raw JSON must never reach the verified analyzer directly.
    const raw = artifact as unknown;
    expect(() => analyzeVerifiedV6Run(raw as never)).toThrow(/only artifacts produced by the verified loader/);
  });

  it("rejects monitoring-design-hash divergence and pre-assignment order violations even after self-consistent rehash", async () => {
    const fixture = createV6BinarySmokeFixture();
    const outputDir = tmpDir();
    const artifact = await produceTextArtifact(fixture, outputDir, "run:v6-order");

    const designDrift = structuredClone(artifact) as Record<string, unknown>;
    const manifest = designDrift.v6TaskManifest as { monitoringDesignHash: string };
    manifest.monitoringDesignHash = `sha256:${"b".repeat(64)}`;
    const { contentHash: _mh1, ...manifestBody1 } = manifest as Record<string, unknown>;
    (designDrift.v6TaskManifest as { contentHash: string }).contentHash =
      computeV6TaskManifestHashV1(manifestBody1 as Parameters<typeof computeV6TaskManifestHashV1>[0]);
    expect(() => verifyV6CalibrationArtifactsV1({ artifacts: [{ sourcePath: "design.json", artifact: designDrift }], spec: specOf(fixture) }))
      .toThrow(/carrier mismatch/);

    const orderDrift = structuredClone(artifact) as Record<string, unknown>;
    const lateManifest = orderDrift.v6TaskManifest as { committedAt: string };
    lateManifest.committedAt = "2026-08-10T00:00:59.000Z";
    const { contentHash: _mh2, ...manifestBody2 } = lateManifest as Record<string, unknown>;
    (orderDrift.v6TaskManifest as { contentHash: string }).contentHash =
      computeV6TaskManifestHashV1(manifestBody2 as Parameters<typeof computeV6TaskManifestHashV1>[0]);
    expect(() => verifyV6CalibrationArtifactsV1({ artifacts: [{ sourcePath: "order.json", artifact: orderDrift }], spec: specOf(fixture) }))
      .toThrow(/pre-assignment commitment order/);
  });

  it("rejects an assigned/trace protocol mismatch even after a self-consistent trace rehash", async () => {
    const fixture = createV6BinarySmokeFixture();
    const outputDir = tmpDir();
    const artifact = await produceTextArtifact(fixture, outputDir, "run:v6-protocol");
    const tampered = structuredClone(artifact) as Record<string, unknown>;
    const trace = tampered.v6InteractionTrace as { protocol: string; contentHash: string };
    trace.protocol = trace.protocol === "text_communication_v1" ? "explicit_belief_v1" : "text_communication_v1";
    const { contentHash: _th, ...traceBody } = trace as Record<string, unknown>;
    trace.contentHash = computeV6InteractionTraceHashV1(traceBody as Parameters<typeof computeV6InteractionTraceHashV1>[0]);
    expect(() => verifyV6CalibrationArtifactsV1({ artifacts: [{ sourcePath: "proto.json", artifact: tampered }], spec: specOf(fixture) }))
      .toThrow(/interaction protocol differs/);
  });

  it("rejects a legacy artifact without a task manifest but never deletes or modifies it", async () => {
    const fixture = createV6BinarySmokeFixture();
    const outputDir = tmpDir();
    const sourcePath = resolveV6AuditableRawRunPath(outputDir, "run:v6-legacy:text_communication_v1");
    const mock = defaultInvoker(fixture.task.claim.id);
    await runV6SmokeExecute({
      outputDir,
      fixture,
      invoker: mock.invoker,
      plannedRuns: planV6SmokeRuns(fixture, "run:v6-legacy").filter(run => run.protocol === "text_communication_v1"),
      maxProviderCalls: 10,
      maxTotalTokens: 10_000,
    });
    const before = fs.readFileSync(sourcePath, "utf8");
    const legacy = JSON.parse(before) as Record<string, unknown>;
    delete legacy.v6TaskManifest;
    delete legacy.v6MonitoringDesign;
    expect(() => verifyV6CalibrationArtifactsV1({ artifacts: [{ sourcePath: "legacy.json", artifact: legacy }], spec: specOf(fixture) }))
      .toThrow(/task manifest/);
    // The on-disk artifact is untouched: admission is read-only.
    expect(fs.readFileSync(sourcePath, "utf8")).toBe(before);
  });
});

describe("exact retry and partial-state fail-closed", () => {
  it("rejects public-context and monitoring-design drift on exact retry before any provider call", async () => {
    const fixture = createV6BinarySmokeFixture();
    const outputDir = tmpDir();
    const mock = defaultInvoker(fixture.task.claim.id);
    const plannedRuns = planV6SmokeRuns(fixture, "run:v6-drift").filter(run => run.protocol === "text_communication_v1");
    await runV6SmokeExecute({ outputDir, fixture, invoker: mock.invoker, plannedRuns, maxProviderCalls: 10, maxTotalTokens: 10_000 });
    const calls = mock.invoke.mock.calls.length;
    expect(calls).toBeGreaterThan(0);

    const publicDrift: V6SmokeFixtureV1 = { ...fixture, task: { ...fixture.task, publicContext: "A drifted public context." } };
    await expect(runV6SmokeExecute({ outputDir, fixture: publicDrift, invoker: mock.invoker, plannedRuns, maxProviderCalls: 10, maxTotalTokens: 10_000 }))
      .rejects.toThrow(/task manifest does not match/);
    expect(mock.invoke.mock.calls.length).toBe(calls);

    const monitoringDrift: V6SmokeFixtureV1 = {
      ...fixture,
      monitoringDesign: createV6MonitoringDesignV1({
        designRef: { id: "swarmalpha.monitoring.drift", version: "1.0.0" },
        preregistrationRef: fixture.study.preregistrationRef!,
        seedNamespace: "swarmalpha:drift:monitoring:v1",
        frozenAt: "2026-08-10T00:00:00.000Z",
      }),
    };
    await expect(runV6SmokeExecute({ outputDir, fixture: monitoringDrift, invoker: mock.invoker, plannedRuns, maxProviderCalls: 10, maxTotalTokens: 10_000 }))
      .rejects.toThrow(/task\/monitoring precommitment/);
    expect(mock.invoke.mock.calls.length).toBe(calls);
  });

  it("fails closed on a manifest-only partial state whose task differs, with zero provider calls", () => {
    const fixture = createV6BinarySmokeFixture();
    const outputDir = tmpDir();
    loadOrCreateV6TaskManifestV1({
      outputDir,
      runId: "run:v6-partial:text_communication_v1",
      createManifest: () => createV6TaskManifestV1({
        runId: "run:v6-partial:text_communication_v1",
        studyRef: fixture.study,
        task: { ...fixture.task, outcome: !fixture.task.outcome },
        authority: authorityOf(fixture),
        monitoringDesignRef: fixture.monitoringDesign.designRef,
        monitoringDesignHash: fixture.monitoringDesign.contentHash,
        committedAt: "2026-08-10T00:00:00.000Z",
      }),
    });
    const mock = defaultInvoker(fixture.task.claim.id);
    const plannedRuns = planV6SmokeRuns(fixture, "run:v6-partial").filter(run => run.protocol === "text_communication_v1");
    return expect(runV6SmokeExecute({ outputDir, fixture, invoker: mock.invoker, plannedRuns, maxProviderCalls: 10, maxTotalTokens: 10_000 }))
      .rejects.toThrow(/incomplete_v6_run_requires_fresh_run_id/)
      .then(() => expect(mock.invoke).not.toHaveBeenCalled());
  });
});
