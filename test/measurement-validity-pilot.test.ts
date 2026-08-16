/**
 * Measurement Validity Development Pilot v1 — Day-1 adversarial tests.
 *
 * These test the frozen candidate bank and the Study N / Study E plan builders
 * BEFORE any real provider call and BEFORE any owner-accepted semantic review.
 * They verify the invariants the plan §5 mandates: candidate order / K=3 /
 * 20-cluster rule, paraphrase preservation, bijective option maps, ordered
 * evidence ladders, counter direction, target balance, truth firewall, the
 * fail-closed review gate, hash tamper rejection, and no retrying provider path.
 *
 * Nothing here reads credentials or calls a provider; plan builds use empty or
 * synthetic decisions only for wiring checks and are never persisted.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createMeasurementPilotTaskBankV1,
  measurementPilotAdmittedHashesV1,
  measurementPilotTaskBankContentHashV1,
  projectMeasurementPilotVariantV1,
  MEASUREMENT_PILOT_CANDIDATE_ORDER_V1,
  MEASUREMENT_PILOT_REQUIRED_CLUSTERS_V1,
} from "../experiments/campaign/measurement/measurementPilotTaskBankV1";
import {
  buildMeasurementPilotStudyPlanV1,
  type MeasurementPilotReviewDecisionV1,
} from "../experiments/campaign/measurement/measurementPilotExecutionV1";
import { createV6SmokeFixtureFromAdapterV1 } from "../experiments/campaign/v6/v6BinarySmokeFixture";
import type { V6TaskAdapterV1 } from "../experiments/campaign/v6/taskAdapters";
import type { V6CategoricalTaskV1 } from "../experiments/campaign/v6/productionVerticalSlice";
import {
  HIDDENBENCH_CATEGORICAL_TASK_FAMILY_V1,
  HIDDENBENCH_CATEGORICAL_TASK_SCHEMA_V1,
  HIDDENBENCH_PINNED_DATA_RESOLVER_ID_V1,
  HIDDENBENCH_PINNED_DATA_TASK_ADAPTER_V1,
} from "../experiments/campaign/v6/hiddenBenchTaskAdapter";

const bank = createMeasurementPilotTaskBankV1();

const ASSIGNED = "2026-08-14T00:00:00.000Z";
const FREEZE = "2026-08-14T00:00:05.000Z";
const PROVIDER = "2026-08-14T00:00:10.000Z";

function wiringDecisions(): MeasurementPilotReviewDecisionV1[] {
  const decisions: MeasurementPilotReviewDecisionV1[] = [];
  for (const cluster of bank.clusters) {
    decisions.push({ variantId: `variant:exact-repeat:${cluster.clusterId}`, accepted: true, reviewedAt: ASSIGNED, note: "wiring-only" });
    if (cluster.paraphraseCandidate) decisions.push({ variantId: cluster.paraphraseCandidate.variantId, accepted: true, reviewedAt: ASSIGNED, note: "wiring-only" });
    if (cluster.permutationCandidate) decisions.push({ variantId: cluster.permutationCandidate.variantId, accepted: true, reviewedAt: ASSIGNED, note: "wiring-only" });
  }
  return decisions;
}

function buildStudy(kind: "nuisance" | "evidence", decisions: MeasurementPilotReviewDecisionV1[] = wiringDecisions()) {
  return buildMeasurementPilotStudyPlanV1({
    bank, decisions, studyKind: kind,
    assignedAt: ASSIGNED, freezeAt: FREEZE, firstProviderAtBoundary: PROVIDER,
    bootstrapSeed: `test-${kind}`,
  });
}

function adapterFor(variant: ReturnType<typeof projectMeasurementPilotVariantV1>): V6TaskAdapterV1<V6CategoricalTaskV1> {
  return {
    adapterRef: structuredClone(HIDDENBENCH_PINNED_DATA_TASK_ADAPTER_V1),
    taskFamilyRef: structuredClone(HIDDENBENCH_CATEGORICAL_TASK_FAMILY_V1),
    taskSchemaRef: structuredClone(HIDDENBENCH_CATEGORICAL_TASK_SCHEMA_V1),
    task: variant.task,
    resolution: { kind: "from_task_outcome", resolverId: HIDDENBENCH_PINNED_DATA_RESOLVER_ID_V1 },
  };
}

describe("Measurement pilot task bank (Day 1)", () => {
  it("keeps the frozen candidate order and selects exactly 20 K=3 clusters", () => {
    expect(bank.candidateOrder).toEqual([...MEASUREMENT_PILOT_CANDIDATE_ORDER_V1]);
    expect(bank.clusterCount).toBe(MEASUREMENT_PILOT_REQUIRED_CLUSTERS_V1);
    expect(bank.insufficientClusterSupport).toBe(false);
    for (const cluster of bank.clusters) {
      expect(cluster.baseOptions.length).toBe(3);
      expect(cluster.baseOptions).toContain(cluster.truth.correctOption);
    }
  });

  it("assigns each cluster a distinct leakage group (no duplicate independent N)", () => {
    const groupIds = bank.clusters.map(cluster => cluster.syntacticLeakageGroupId);
    expect(new Set(groupIds).size).toBe(groupIds.length);
    expect(groupIds.length).toBe(20);
  });

  it("keeps paraphrase surface-only: options, resolution policy, and roster are preserved", () => {
    for (const cluster of bank.clusters) {
      const para = cluster.paraphraseCandidate;
      expect(para).toBeDefined();
      const projection = projectMeasurementPilotVariantV1({ bank, clusterId: cluster.clusterId, variantId: para!.variantId });
      expect(projection.task.claim.options).toEqual(cluster.baseOptions);
      expect(projection.task.claim.resolutionPolicy.resolverId).toContain("hiddenbench-data");
      expect(projection.task.agents.length).toBe(cluster.baseAgentCount);
      expect(projection.task.publicContext).not.toBe(cluster.basePublicContext); // surface changed
      para!.paraphrasedPrivateInfo.forEach((info, index) => {
        expect(projection.task.agents[index].privateInformation).toBe(info);
      });
    }
  });

  it("keeps the option permutation a canonical bijection over the full option set", () => {
    for (const cluster of bank.clusters) {
      const perm = cluster.permutationCandidate;
      expect(perm).toBeDefined();
      const mapKeys = Object.keys(perm!.optionMap).sort();
      const mapValues = Object.values(perm!.optionMap).sort();
      expect(mapKeys).toEqual([...cluster.baseOptions].sort());
      expect(mapValues).toEqual([...cluster.baseOptions].sort());
      expect(new Set(mapValues).size).toBe(cluster.baseOptions.length);
      expect(new Set(perm!.permutedOptions).size).toBe(cluster.baseOptions.length);
      expect([...perm!.permutedOptions].sort()).toEqual([...cluster.baseOptions].sort());
      const projection = projectMeasurementPilotVariantV1({ bank, clusterId: cluster.clusterId, variantId: perm!.variantId });
      expect(projection.task.claim.options).toEqual(perm!.permutedOptions);
    }
  });

  it("does not emit truth/reviewer meta-language that labels a specific option in evidence or paraphrase payloads", () => {
    // "correct answer" alone can be benign task framing (e.g. "the correct
    // answer is the one that ..."); what is forbidden is a meta-assertion that
    // points at a specific canonical option as ground truth / resolved.
    const hardMeta = ["ground truth", "resolver outcome", "resolved answer", "true answer is"];
    for (const cluster of bank.clusters) {
      const options = cluster.baseOptions.map(option => option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const assertPattern = new RegExp(`(the answer is|is the correct answer|correct answer is)\\s*(${options.join("|")})`);
      for (const candidate of cluster.evidenceCandidates) {
        const lower = candidate.payload.toLowerCase();
        for (const phrase of hardMeta) expect(lower).not.toContain(phrase);
        expect(assertPattern.test(candidate.payload)).toBe(false);
      }
      const paraLower = cluster.paraphraseCandidate?.paraphrasedPublicContext.toLowerCase() ?? "";
      for (const phrase of hardMeta) expect(paraLower).not.toContain(phrase);
      expect(assertPattern.test(cluster.paraphraseCandidate?.paraphrasedPublicContext ?? "")).toBe(false);
    }
  });

  it("balances designatedTarget true/false across the 20 clusters", () => {
    const counts = bank.clusters.reduce((acc, cluster) => {
      acc[cluster.truth.designatedTargetIsResolution ? "true" : "false"] += 1;
      return acc;
    }, { true: 0, false: 0 });
    expect(counts.true).toBe(10);
    expect(counts.false).toBe(10);
  });

  it("rejects self-consistent bank tampering via a changed content hash", () => {
    const original = bank.contentHash;
    const tampered = { ...bank, clusters: bank.clusters.slice(0, 19) };
    expect(measurementPilotTaskBankContentHashV1(tampered as never)).not.toBe(original);
  });

  it("provides admitted hashes covering every base and variant projection", () => {
    const admitted = new Set(measurementPilotAdmittedHashesV1(bank));
    for (const cluster of bank.clusters) {
      expect(admitted.has(cluster.baseTaskDefinitionHash)).toBe(true);
      const variantIds = [
        `variant:exact-repeat:${cluster.clusterId}`,
        cluster.paraphraseCandidate?.variantId,
        cluster.permutationCandidate?.variantId,
        ...cluster.evidenceCandidates.map(candidate => candidate.variantId),
      ].filter((value): value is string => typeof value === "string");
      for (const variantId of variantIds) {
        const projection = projectMeasurementPilotVariantV1({ bank, clusterId: cluster.clusterId, variantId });
        expect(admitted.has(projection.taskDefinitionHash)).toBe(true);
      }
    }
  });
});

describe("Measurement pilot Study N / Study E plan builders (Day 1)", () => {
  it("fails closed until every required semantic review is accepted", () => {
    expect(() => buildMeasurementPilotStudyPlanV1({
      bank, decisions: [], studyKind: "nuisance",
      assignedAt: ASSIGNED, freezeAt: FREEZE, firstProviderAtBoundary: PROVIDER, bootstrapSeed: "t",
    })).toThrow(/semantic review not accepted/);
    expect(() => buildMeasurementPilotStudyPlanV1({
      bank, decisions: [], studyKind: "evidence",
      assignedAt: ASSIGNED, freezeAt: FREEZE, firstProviderAtBoundary: PROVIDER, bootstrapSeed: "t",
    })).toThrow(/semantic review not accepted/);
  });

  it("builds 80 registered cells and 80 variants per study with distinct authority refs", () => {
    const n = buildStudy("nuisance");
    const e = buildStudy("evidence");
    expect(n.cells.length).toBe(80);
    expect(e.cells.length).toBe(80);
    expect(n.design.registeredCells.length).toBe(80);
    expect(e.design.registeredCells.length).toBe(80);
    expect(n.design.variants.length).toBe(80);
    expect(e.design.variants.length).toBe(80);
    expect(n.design.designRef.id).not.toBe(e.design.designRef.id);
    expect(n.freeze.freezeRef.id).not.toBe(e.freeze.freezeRef.id);
    expect(n.resultIndexRef.id).not.toBe(e.resultIndexRef.id);
    // registered cell ids and run ids are globally unique within a study
    expect(new Set(n.cells.map(cell => cell.cellId)).size).toBe(80);
    expect(new Set(n.cells.map(cell => cell.runId)).size).toBe(80);
  }, 60_000);

  it("uses exactly the frozen nuisance conditions (repeat / paraphrase / permutation)", () => {
    const n = buildStudy("nuisance");
    const conditions = new Set(n.design.variants.map(variant => variant.condition));
    expect(conditions).toEqual(new Set(["exact_repeat", "semantic_paraphrase", "option_permutation"]));
    expect(n.design.variants.filter(variant => variant.condition === "exact_repeat").length).toBe(40);
    expect(n.design.variants.filter(variant => variant.condition === "semantic_paraphrase").length).toBe(20);
    expect(n.design.variants.filter(variant => variant.condition === "option_permutation").length).toBe(20);
    // paraphrase/permutation variants carry the accepted review and a bijection
    for (const variant of n.design.variants) {
      if (variant.condition === "semantic_paraphrase") expect(variant.semanticReview?.status).toBe("accepted");
      if (variant.condition === "option_permutation") expect(Object.keys(variant.optionMap ?? {}).length).toBe(3);
    }
  });

  it("uses exactly the frozen evidence conditions and an ordered ladder per cluster", () => {
    const e = buildStudy("evidence");
    const conditions = new Set(e.design.variants.map(variant => variant.condition));
    expect(conditions).toEqual(new Set(["evidence_strength", "evidence_direction"]));
    expect(e.design.evidenceLadders.length).toBe(20);
    for (const ladder of e.design.evidenceLadders) {
      expect(ladder.levels.length).toBeGreaterThanOrEqual(3);
      const levels = ladder.levels.map(level => level.level);
      expect([...levels].sort((a, b) => a - b)).toEqual(levels);
      expect(new Set(levels).size).toBe(levels.length);
      expect(new Set(ladder.levels.map(level => level.designatedTarget)).size).toBe(1);
    }
    // every strength/direction variant references a registered ladder
    for (const variant of e.design.variants) {
      expect(e.design.evidenceLadders.some(ladder => ladder.ladderId === variant.evidenceLadderId)).toBe(true);
    }
    // counter variant is direction with the same ladder target
    const counter = e.design.variants.filter(variant => variant.condition === "evidence_direction");
    expect(counter.length).toBe(20);
  });

  it("bounds planned provider calls within the frozen hard cap", () => {
    const n = buildStudy("nuisance");
    const e = buildStudy("evidence");
    expect(n.maxProviderCalls + e.maxProviderCalls).toBeLessThanOrEqual(2400);
  }, 60_000);
});

describe("Measurement pilot truth firewall (Day 1)", () => {
  it("never places correct_answer / ground-truth / reviewer-verdict meta-fields into a provider projection", () => {
    const cluster = bank.clusters[0];
    const variantIds = [
      `variant:exact-repeat:${cluster.clusterId}`,
      cluster.paraphraseCandidate!.variantId,
      cluster.permutationCandidate!.variantId,
      ...cluster.evidenceCandidates.map(candidate => candidate.variantId),
    ];
    for (const variantId of variantIds) {
      const projection = projectMeasurementPilotVariantV1({ bank, clusterId: cluster.clusterId, variantId });
      const serialized = JSON.stringify(projection.task);
      expect(serialized).not.toContain("correct_answer");
      expect(serialized).not.toContain("groundTruth");
      expect(serialized).not.toContain("reviewerVerdict");
      // The V6 task carries an `outcome` label (the resolution source, opened
      // only after elicitation closes); the truth firewall is that no provider
      // request built from this task asserts it as correct (covered below).
      expect(typeof projection.task.outcome).toBe("string");
    }
  });

  it("keeps the correct-answer label out of discussion/final requests built by the adapter", async () => {
    const cluster = bank.clusters[0];
    const projection = projectMeasurementPilotVariantV1({ bank, clusterId: cluster.clusterId, variantId: `variant:exact-repeat:${cluster.clusterId}` });
    const fixture = createV6SmokeFixtureFromAdapterV1({
      adapter: adapterFor(projection),
      namespace: "measurement-pilot-truth-firewall",
      certaintyLowerBound: 0.7,
      stratum: { taskFamily: "hiddenbench-categorical", taskId: projection.task.id, claimOptionCount: 3, agentCount: projection.task.agents.length },
      evaluationContractRef: { id: "swarmalpha.eval.v6-hiddenbench-categorical", version: "1.0.0" },
      adapterContractNamespace: "measurement-pilot-truth-firewall",
      budgetContractRef: { id: "swarmalpha.budget.v6-hiddenbench-engineering", version: "1.0.0" },
      discussionMaxTokens: 768,
    });
    const seen: string[] = [];
    const invoker = {
      invoke: vi.fn(async (request: { userPrompt: string }) => { seen.push(request.userPrompt); return { rawContent: "{}" }; }),
    };
    // The adapter prompt is built from the fixture task; the outcome label must
    // not be asserted as correct anywhere in the prompt.
    const { createV6DiscussionAdapter } = await import("../experiments/campaign/v6/providerAdapters");
    const adapter = createV6DiscussionAdapter({ contract: fixture.discussionContract, invoker: invoker as never });
    await adapter.respond({
      requestSchemaRef: { id: "swarmalpha.v6.discussion-request", version: "1.0.0" },
      requestId: "discussion:firewall:r1:agent:a",
      runId: "run:firewall",
      taskId: projection.task.id,
      agentId: projection.task.agents[0].agentId,
      round: 1,
      protocol: "explicit_belief_v1",
      publicContext: projection.task.publicContext,
      ownPrivateInformation: projection.task.agents[0].privateInformation,
      claim: projection.task.claim,
      visibleTranscript: [],
      responseContract: "belief_json_v1",
      modelRef: { id: "deepseek:deepseek-chat", version: "1.0.0" },
      invocationConfig: { temperature: 0 },
    }, new AbortController().signal);
    const joined = seen.join(" ");
    expect(joined).not.toContain("correct_answer");
    expect(joined).not.toContain("ground truth");
    expect(joined).not.toContain("is correct");
    expect(joined).not.toContain("resolver outcome");
  });
});

describe("Measurement pilot no retrying provider path (Day 1)", () => {
  it("does not import the retrying callLLM provider path", () => {
    for (const file of [
      "experiments/campaign/measurement/measurementPilotTaskBankV1.ts",
      "experiments/campaign/measurement/measurementPilotExecutionV1.ts",
      "experiments/campaign/measurement/run_measurement_validity_pilot.ts",
    ]) {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/callLLM/);
      expect(source).not.toMatch(/from ".*src\/lib\/llm/);
    }
  });
});
