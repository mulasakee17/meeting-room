import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRIMARY_ASSIGNMENT_ALGORITHM_V1,
  computePrimaryArmExecutionBindingHash,
  computePrimaryAssignmentExecutionPayloadHash,
  createPrimaryArmExecutionRegistryV1,
  createPrimaryAssignmentManifestV1,
  createPrimaryAssignmentV1,
  loadOrCreatePrimaryArmExecutionBindingV1,
  loadOrCreatePrimaryAssignmentManifestV1,
  readPrimaryArmExecutionBindingV1,
  resolvePrimaryArmExecutionBindingV1,
  resolvePrimaryArmExecutionBindingV1Path,
  validatePrimaryArmExecutionBindingV1,
  validatePrimaryArmExecutionRegistryV1,
  type GovernanceStudyContract,
  type PrimaryArmExecutionBindingV1,
  type PrimaryAssignmentDesignV1,
} from "@/lib/experimentation";
import { preparePrimaryAssignedRunV1 } from "../experiments/campaign/primaryAssignedRun";

const IMPL_A = { protocol: "text", explicitBelief: false };
const IMPL_B = { protocol: "belief", explicitBelief: true };
const BUDGET = { maxRounds: 3 };

function design(): PrimaryAssignmentDesignV1 {
  return {
    id: "design:execution-test",
    version: "1.0.0",
    schemaVersion: "1.0.0",
    preregistrationRef: { id: "prereg:execution-test", version: "1.0.0" },
    unit: "run",
    assignmentAlgorithmRef: PRIMARY_ASSIGNMENT_ALGORITHM_V1,
    seedNamespace: "execution-test",
    arms: [
      {
        armRef: { id: "arm:text", version: "1.0.0" },
        allocationProbability: 0.5,
        implementationRef: { id: "impl:text", version: "1.0.0" },
        implementationConfigHash: computePrimaryAssignmentExecutionPayloadHash(IMPL_A),
        budgetContractRef: { id: "budget:test", version: "1.0.0" },
        budgetContractHash: computePrimaryAssignmentExecutionPayloadHash(BUDGET),
      },
      {
        armRef: { id: "arm:belief", version: "1.0.0" },
        allocationProbability: 0.5,
        implementationRef: { id: "impl:belief", version: "1.0.0" },
        implementationConfigHash: computePrimaryAssignmentExecutionPayloadHash(IMPL_B),
        budgetContractRef: { id: "budget:test", version: "1.0.0" },
        budgetContractHash: computePrimaryAssignmentExecutionPayloadHash(BUDGET),
      },
    ],
    stratification: {
      fields: ["model", "taskFamily"],
      missingFieldPolicy: "reject",
      extraFieldPolicy: "reject",
    },
    analysisPopulation: "intention_to_treat",
    primaryEstimandRef: { id: "estimand:itt", version: "1.0.0" },
    retryPolicy: "reuse_assignment",
  };
}

function study(primaryDesign = design()): GovernanceStudyContract {
  return {
    id: "study:execution-test",
    version: "1.0.0",
    governanceArchitecture: "auditable_epistemic_v1",
    inferenceIntent: "exploratory",
    taskFamilyRef: { id: "task-family:test", version: "1.0.0" },
    evaluationContractRef: { id: "evaluation:test", version: "1.0.0" },
    artifactSchemaRef: { id: "swarmalpha.raw-run", version: "5.0.0" },
    governancePolicy: {
      id: "policy:test",
      version: "1.0.0",
      controlMode: "randomized_experiment",
      preregistrationRef: { id: "prereg:execution-test", version: "1.0.0" },
      eligibilityRuleRefs: [{ id: "rule:test", version: "1.0.0" }],
      maxActionsPerDecision: 1,
      arbitration: "priority_then_stable_id",
      assignmentDesign: {
        designRef: { id: "event-design:test", version: "1.0.0" },
        seedNamespace: "event:test",
        allocations: [{
          actionRef: { id: "action:test", version: "1.0.0" },
          unit: "eligible_event",
          arms: [
            { id: "apply", probability: 0.5 },
            { id: "holdout", probability: 0.5 },
          ],
        }],
      },
      onlineAdaptation: "forbidden",
    },
    preregistrationRef: { id: "prereg:execution-test", version: "1.0.0" },
    frozenAt: "2026-08-10T00:00:00.000Z",
    primaryAssignmentUnit: "run",
    primaryAssignmentDesign: primaryDesign,
    eligibleEventEstimand: "exploratory_only",
  };
}

function registry(primaryDesign = design()) {
  return createPrimaryArmExecutionRegistryV1({
    studyRef: { id: "study:execution-test", version: "1.0.0" },
    design: primaryDesign,
    entries: [
      {
        armRef: primaryDesign.arms[0].armRef,
        implementationRef: primaryDesign.arms[0].implementationRef,
        implementationConfig: IMPL_A,
        budgetContractRef: primaryDesign.arms[0].budgetContractRef,
        budgetContract: BUDGET,
      },
      {
        armRef: primaryDesign.arms[1].armRef,
        implementationRef: primaryDesign.arms[1].implementationRef,
        implementationConfig: IMPL_B,
        budgetContractRef: primaryDesign.arms[1].budgetContractRef,
        budgetContract: BUDGET,
      },
    ],
  });
}

describe("Primary assignment execution authority", () => {
  it("resolves only the implementation committed by the randomized arm", () => {
    const primaryDesign = design();
    const record = createPrimaryAssignmentV1({
      id: "assignment:run-1",
      runId: "run-1",
      studyRef: { id: "study:execution-test", version: "1.0.0" },
      design: primaryDesign,
      stratum: { model: "m", taskFamily: "t" },
      masterSeed: 7,
      assignedAt: "2026-08-10T00:00:01.000Z",
    });
    const manifest = createPrimaryAssignmentManifestV1({
      runId: "run-1",
      studyRef: record.studyRef,
      design: primaryDesign,
      assignment: record,
      createdAt: "2026-08-10T00:00:02.000Z",
    });
    const frozenRegistry = registry(primaryDesign);
    const binding = resolvePrimaryArmExecutionBindingV1({
      manifest,
      registry: frozenRegistry,
      resolvedAt: "2026-08-10T00:00:03.000Z",
    });
    const expected = frozenRegistry.entries.find(entry =>
      entry.armRef.id === record.assignedArmRef.id)!;
    expect(binding.implementationConfig).toEqual(expected.implementationConfig);
    expect(binding.budgetContract).toEqual(expected.budgetContract);
  });

  it("rejects a self-rehashed binding whose payload differs from the frozen registry", () => {
    const primaryDesign = design();
    const record = createPrimaryAssignmentV1({
      id: "assignment:run-1",
      runId: "run-1",
      studyRef: { id: "study:execution-test", version: "1.0.0" },
      design: primaryDesign,
      stratum: { model: "m", taskFamily: "t" },
      masterSeed: 7,
      assignedAt: "2026-08-10T00:00:01.000Z",
    });
    const manifest = createPrimaryAssignmentManifestV1({
      runId: "run-1",
      studyRef: record.studyRef,
      design: primaryDesign,
      assignment: record,
      createdAt: "2026-08-10T00:00:02.000Z",
    });
    const frozenRegistry = registry(primaryDesign);
    const binding = resolvePrimaryArmExecutionBindingV1({
      manifest,
      registry: frozenRegistry,
      resolvedAt: "2026-08-10T00:00:03.000Z",
    });
    binding.implementationConfig = { protocol: "forged" };
    binding.implementationConfigHash = computePrimaryAssignmentExecutionPayloadHash(binding.implementationConfig);
    const { contentHash: _old, ...body } = binding;
    binding.contentHash = computePrimaryArmExecutionBindingHash(body);
    expect(() => validatePrimaryArmExecutionBindingV1(binding, manifest, frozenRegistry))
      .toThrow("does not resolve the assigned frozen implementation");
  });

  it("persists assignment and execution before retry and never redraws", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "primary-execution-"));
    try {
      const primaryDesign = design();
      const times = [
        "2026-08-10T00:00:01.000Z",
        "2026-08-10T00:00:02.000Z",
        "2026-08-10T00:00:03.000Z",
      ];
      const first = preparePrimaryAssignedRunV1({
        outputDir,
        runId: "run-1",
        study: study(primaryDesign),
        registry: registry(primaryDesign),
        stratum: { model: "m", taskFamily: "t" },
        masterSeed: 11,
        clock: () => times.shift()!,
      });
      const retry = preparePrimaryAssignedRunV1({
        outputDir,
        runId: "run-1",
        study: study(primaryDesign),
        registry: registry(primaryDesign),
        stratum: { model: "m", taskFamily: "t" },
        masterSeed: 11,
        clock: () => { throw new Error("retry must not redraw or rebind"); },
      });
      expect(first.assignment.reused).toBe(false);
      expect(first.execution.reused).toBe(false);
      expect(retry.assignment.reused).toBe(true);
      expect(retry.execution.reused).toBe(true);
      expect(retry.assignment.manifest.contentHash).toBe(first.assignment.manifest.contentHash);
      expect(retry.execution.binding.contentHash).toBe(first.execution.binding.contentHash);
      expect(() => preparePrimaryAssignedRunV1({
        outputDir,
        runId: "run-1",
        study: study(primaryDesign),
        registry: registry(primaryDesign),
        stratum: { model: "m", taskFamily: "t" },
        masterSeed: 999,
        clock: () => { throw new Error("mismatch must fail before any redraw"); },
      })).toThrow("conflicts with requested masterSeed/stratum");
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("rejects credential-bearing execution payloads", () => {
    expect(() => computePrimaryAssignmentExecutionPayloadHash({ api_key: "must-not-persist" }))
      .toThrow("must not persist credential-like field");
  });
});

describe("F5 execution registry and retry adversarial edges", () => {
  function makeChain(primaryDesign = design()) {
    const record = createPrimaryAssignmentV1({
      id: "assignment:run-1",
      runId: "run-1",
      studyRef: { id: "study:execution-test", version: "1.0.0" },
      design: primaryDesign,
      stratum: { model: "m", taskFamily: "t" },
      masterSeed: 7,
      assignedAt: "2026-08-10T00:00:01.000Z",
    });
    const manifest = createPrimaryAssignmentManifestV1({
      runId: "run-1",
      studyRef: record.studyRef,
      design: primaryDesign,
      assignment: record,
      createdAt: "2026-08-10T00:00:02.000Z",
    });
    const frozenRegistry = registry(primaryDesign);
    const binding = resolvePrimaryArmExecutionBindingV1({
      manifest,
      registry: frozenRegistry,
      resolvedAt: "2026-08-10T00:00:03.000Z",
    });
    return { record, manifest, registry: frozenRegistry, binding };
  }

  it("rejects registry entries reordered relative to the frozen design arms", () => {
    const primaryDesign = design();
    const reg = registry(primaryDesign);
    reg.entries.reverse();
    expect(() => validatePrimaryArmExecutionRegistryV1(reg, primaryDesign))
      .toThrow("must follow frozen design arm order");
  });

  it("rejects missing, extra, and duplicated registry arm entries", () => {
    const primaryDesign = design();

    const missing = registry(primaryDesign);
    missing.entries.splice(1, 1);
    expect(() => validatePrimaryArmExecutionRegistryV1(missing, primaryDesign))
      .toThrow("must cover every design arm exactly once");

    const extra = registry(primaryDesign);
    extra.entries.push(structuredClone(extra.entries[0]));
    expect(() => validatePrimaryArmExecutionRegistryV1(extra, primaryDesign))
      .toThrow("must cover every design arm exactly once");

    const duplicate = registry(primaryDesign);
    duplicate.entries[1].armRef = structuredClone(duplicate.entries[0].armRef);
    expect(() => validatePrimaryArmExecutionRegistryV1(duplicate, primaryDesign)).toThrow();
  });

  it("rejects registry entries whose implementation/budget ref or config/budget hash disagrees with the design", () => {
    const primaryDesign = design();
    const wrongImpl = structuredClone(primaryDesign.arms[0]);
    wrongImpl.implementationRef = { id: "impl:other", version: "1.0.0" };
    expect(() => createPrimaryArmExecutionRegistryV1({
      studyRef: { id: "study:execution-test", version: "1.0.0" },
      design: primaryDesign,
      entries: [
        { armRef: wrongImpl.armRef, implementationRef: wrongImpl.implementationRef, implementationConfig: IMPL_A, budgetContractRef: wrongImpl.budgetContractRef, budgetContract: BUDGET },
        { armRef: primaryDesign.arms[1].armRef, implementationRef: primaryDesign.arms[1].implementationRef, implementationConfig: IMPL_B, budgetContractRef: primaryDesign.arms[1].budgetContractRef, budgetContract: BUDGET },
      ],
    })).toThrow("entry does not match design arm");

    const wrongConfig = structuredClone(primaryDesign.arms[0]);
    expect(() => createPrimaryArmExecutionRegistryV1({
      studyRef: { id: "study:execution-test", version: "1.0.0" },
      design: primaryDesign,
      entries: [
        { armRef: wrongConfig.armRef, implementationRef: wrongConfig.implementationRef, implementationConfig: { protocol: "forged" }, budgetContractRef: wrongConfig.budgetContractRef, budgetContract: BUDGET },
        { armRef: primaryDesign.arms[1].armRef, implementationRef: primaryDesign.arms[1].implementationRef, implementationConfig: IMPL_B, budgetContractRef: primaryDesign.arms[1].budgetContractRef, budgetContract: BUDGET },
      ],
    })).toThrow("entry does not match design arm");
  });

  it("rejects nested or case-varied credential keys, cycles, sparse arrays, non-finite numbers, functions, and class instances", () => {
    expect(() => computePrimaryAssignmentExecutionPayloadHash({ nested: { api_key: "x" } }))
      .toThrow("must not persist credential-like field");
    expect(() => computePrimaryAssignmentExecutionPayloadHash({ auth: { Authorization_TOKEN: "x" } }))
      .toThrow("must not persist credential-like field");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => computePrimaryAssignmentExecutionPayloadHash(cyclic)).toThrow(/cycles/);
    const sparse: unknown[] = [];
    sparse[2] = 1;
    expect(() => computePrimaryAssignmentExecutionPayloadHash({ list: sparse })).toThrow(/sparse/);
    expect(() => computePrimaryAssignmentExecutionPayloadHash({ x: Number.NaN })).toThrow(/finite/);
    expect(() => computePrimaryAssignmentExecutionPayloadHash({ x: Number.POSITIVE_INFINITY })).toThrow(/finite/);
    expect(() => computePrimaryAssignmentExecutionPayloadHash({ fn: () => 1 })).toThrow(/replayable JSON/);
    expect(() => computePrimaryAssignmentExecutionPayloadHash({ inst: new Date() })).toThrow(/plain objects/);
  });

  it("rejects a registry from another design or study", () => {
    const primaryDesign = design();
    const otherDesign = design();
    otherDesign.id = "design:other";
    expect(() => validatePrimaryArmExecutionRegistryV1(registry(primaryDesign), otherDesign))
      .toThrow("does not match the frozen design");

    const foreign = createPrimaryArmExecutionRegistryV1({
      studyRef: { id: "study:other", version: "1.0.0" },
      design: primaryDesign,
      entries: [
        { armRef: primaryDesign.arms[0].armRef, implementationRef: primaryDesign.arms[0].implementationRef, implementationConfig: IMPL_A, budgetContractRef: primaryDesign.arms[0].budgetContractRef, budgetContract: BUDGET },
        { armRef: primaryDesign.arms[1].armRef, implementationRef: primaryDesign.arms[1].implementationRef, implementationConfig: IMPL_B, budgetContractRef: primaryDesign.arms[1].budgetContractRef, budgetContract: BUDGET },
      ],
    });
    const { manifest } = makeChain(primaryDesign);
    expect(() => resolvePrimaryArmExecutionBindingV1({
      manifest,
      registry: foreign,
      resolvedAt: "2026-08-10T00:00:03.000Z",
    })).toThrow("primaryArmExecutionRegistry belongs to another study");
  });

  it("rejects a binding resolved before its assignment manifest", () => {
    const { manifest, registry } = makeChain();
    expect(() => resolvePrimaryArmExecutionBindingV1({
      manifest,
      registry,
      resolvedAt: "2026-08-10T00:00:01.000Z",
    })).toThrow("cannot precede its assignment manifest");
  });

  it("sanitizes run ids and keeps distinct paths for same-stem collisions in the execution store", () => {
    const outputDir = path.join(os.tmpdir(), "primary-arm-escape-");
    const resolvedRoot = path.resolve(outputDir);
    for (const runId of ["../../etc/passwd", "a\\..\\b", "运行:测试", "..", "a/b/c"]) {
      expect(path.dirname(resolvePrimaryArmExecutionBindingV1Path(outputDir, runId))).toBe(resolvedRoot);
    }
    expect(resolvePrimaryArmExecutionBindingV1Path(outputDir, "a/b"))
      .not.toBe(resolvePrimaryArmExecutionBindingV1Path(outputDir, "a?b"));
  });

  it("keeps execution-store snapshots isolated and persisted content immutable", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "primary-arm-immutable-"));
    try {
      const chain = makeChain();
      const first = loadOrCreatePrimaryArmExecutionBindingV1({
        outputDir,
        runId: chain.record.runId,
        manifest: chain.manifest,
        registry: chain.registry,
        createBinding: () => chain.binding,
      });
      first.binding.implementationConfig = { protocol: "mutated" };
      const again = readPrimaryArmExecutionBindingV1({
        outputDir,
        runId: chain.record.runId,
        manifest: chain.manifest,
        registry: chain.registry,
      });
      expect(again?.binding.implementationConfig).toEqual(chain.binding.implementationConfig);
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("rejects a retry whose stratum changed instead of redrawing", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "primary-arm-stratum-"));
    try {
      const primaryDesign = design();
      const run = {
        outputDir,
        runId: "run-retry-stratum",
        study: study(primaryDesign),
        registry: registry(primaryDesign),
        masterSeed: 11,
      };
      preparePrimaryAssignedRunV1({
        ...run,
        stratum: { model: "m", taskFamily: "t" },
        clock: () => "2026-08-10T00:00:01.000Z",
      });
      expect(() => preparePrimaryAssignedRunV1({
        ...run,
        stratum: { model: "other", taskFamily: "t" },
        clock: () => { throw new Error("must not redraw"); },
      })).toThrow("conflicts with requested masterSeed/stratum");
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("rejects a retry whose registry/design changed instead of rebinding", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "primary-arm-registry-"));
    try {
      const primaryDesign = design();
      preparePrimaryAssignedRunV1({
        outputDir,
        runId: "run-retry-registry",
        study: study(primaryDesign),
        registry: registry(primaryDesign),
        stratum: { model: "m", taskFamily: "t" },
        masterSeed: 11,
        clock: () => "2026-08-10T00:00:01.000Z",
      });
      const changedDesign = design();
      changedDesign.arms[0].implementationConfigHash = "sha256:" + "c".repeat(64);
      expect(() => preparePrimaryAssignedRunV1({
        outputDir,
        runId: "run-retry-registry",
        study: study(changedDesign),
        registry: registry(changedDesign),
        stratum: { model: "m", taskFamily: "t" },
        masterSeed: 11,
        clock: () => { throw new Error("must not redraw"); },
      })).toThrow();
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("rebuilds only the execution binding when the assignment already exists", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "primary-arm-partial-"));
    try {
      const primaryDesign = design();
      loadOrCreatePrimaryAssignmentManifestV1({
        outputDir,
        runId: "run-partial",
        study: study(primaryDesign),
        createManifest: () => createPrimaryAssignmentManifestV1({
          runId: "run-partial",
          studyRef: { id: "study:execution-test", version: "1.0.0" },
          design: primaryDesign,
          assignment: createPrimaryAssignmentV1({
            id: "primary-assignment:run-partial",
            runId: "run-partial",
            studyRef: { id: "study:execution-test", version: "1.0.0" },
            design: primaryDesign,
            stratum: { model: "m", taskFamily: "t" },
            masterSeed: 11,
            assignedAt: "2026-08-10T00:00:01.000Z",
          }),
          createdAt: "2026-08-10T00:00:02.000Z",
        }),
      });
      const prepared = preparePrimaryAssignedRunV1({
        outputDir,
        runId: "run-partial",
        study: study(primaryDesign),
        registry: registry(primaryDesign),
        stratum: { model: "m", taskFamily: "t" },
        masterSeed: 11,
        clock: () => "2026-08-10T00:00:03.000Z",
      });
      expect(prepared.assignment.reused).toBe(true);
      expect(prepared.execution.reused).toBe(false);
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("fails closed on a malformed persisted binding and never overwrites it", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "primary-arm-corrupt-"));
    try {
      const chain = makeChain();
      const absolutePath = resolvePrimaryArmExecutionBindingV1Path(outputDir, "run-corrupt");
      fs.writeFileSync(absolutePath, "{truncated", "utf8");
      expect(() => readPrimaryArmExecutionBindingV1({
        outputDir,
        runId: "run-corrupt",
        manifest: chain.manifest,
        registry: chain.registry,
      })).toThrow("primary arm execution binding is not valid JSON");
      expect(fs.readFileSync(absolutePath, "utf8")).toBe("{truncated");
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
