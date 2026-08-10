import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { MINIMAL_EPISTEMIC_GOVERNANCE_POLICY_V2 } from "@/lib/governance";
import {
  PRIMARY_ASSIGNMENT_ALGORITHM_V1,
  computePrimaryAssignmentDesignHash,
  createPrimaryAssignmentManifestV1,
  createPrimaryAssignmentV1,
  derivePrimaryAssignmentSeed,
  loadOrCreatePrimaryAssignmentManifestV1,
  readPrimaryAssignmentManifestV1,
  resolvePrimaryAssignmentManifestV1Path,
  validateGovernanceStudyContract,
  validatePrimaryAssignmentDesignV1,
  validatePrimaryAssignmentForStudy,
  validatePrimaryAssignmentManifestForStudy,
  validatePrimaryAssignmentManifestV1,
  validatePrimaryAssignmentRecordV1,
  type GovernanceStudyContract,
  type PrimaryAssignmentDesignV1,
  type PrimaryAssignmentManifestV1,
} from "@/lib/experimentation";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const PREREGISTRATION = structuredClone(
  MINIMAL_EPISTEMIC_GOVERNANCE_POLICY_V2.preregistrationRef!,
);

function design(): PrimaryAssignmentDesignV1 {
  return {
    id: "swarmalpha.primary-design.test",
    version: "1.0.0",
    schemaVersion: "1.0.0",
    preregistrationRef: structuredClone(PREREGISTRATION),
    unit: "run",
    assignmentAlgorithmRef: structuredClone(PRIMARY_ASSIGNMENT_ALGORITHM_V1),
    seedNamespace: "swarmalpha.primary.test.v1",
    arms: [
      {
        armRef: { id: "swarmalpha.arm.text-baseline", version: "1.0.0" },
        allocationProbability: 0.5,
        implementationRef: { id: "swarmalpha.runtime.text-baseline", version: "1.0.0" },
        implementationConfigHash: HASH_A,
        budgetContractRef: { id: "swarmalpha.budget.cost-matched", version: "1.0.0" },
        budgetContractHash: HASH_B,
      },
      {
        armRef: { id: "swarmalpha.arm.epistemic-governance", version: "1.0.0" },
        allocationProbability: 0.5,
        implementationRef: { id: "swarmalpha.runtime.epistemic-governance", version: "1.0.0" },
        implementationConfigHash: HASH_B,
        budgetContractRef: { id: "swarmalpha.budget.cost-matched", version: "1.0.0" },
        budgetContractHash: HASH_B,
      },
    ],
    stratification: {
      fields: ["model", "taskFamily"],
      missingFieldPolicy: "reject",
      extraFieldPolicy: "reject",
    },
    analysisPopulation: "intention_to_treat",
    primaryEstimandRef: { id: "swarmalpha.estimand.primary-itt", version: "1.0.0" },
    retryPolicy: "reuse_assignment",
  };
}

function study(primaryDesign = design()): GovernanceStudyContract {
  return {
    id: "swarmalpha.study.primary-test",
    version: "1.0.0",
    governanceArchitecture: "auditable_epistemic_v1",
    inferenceIntent: "confirmatory",
    taskFamilyRef: { id: "swarmalpha.task.distributed-categorical", version: "1.0.0" },
    evaluationContractRef: { id: "swarmalpha.eval.proper-score", version: "1.0.0" },
    artifactSchemaRef: { id: "swarmalpha.raw-run", version: "5.0.0" },
    governancePolicy: structuredClone(MINIMAL_EPISTEMIC_GOVERNANCE_POLICY_V2),
    preregistrationRef: structuredClone(PREREGISTRATION),
    frozenAt: "2026-08-09T00:00:00.000Z",
    primaryAssignmentUnit: "run",
    primaryAssignmentDesign: primaryDesign,
    eligibleEventEstimand: "exploratory_only",
  };
}

function assignment(primaryDesign = design()) {
  return createPrimaryAssignmentV1({
    id: "primary-assignment:run-1",
    runId: "run-1",
    studyRef: { id: "swarmalpha.study.primary-test", version: "1.0.0" },
    design: primaryDesign,
    stratum: { model: "deepseek-v4-flash", taskFamily: "distributed-categorical" },
    masterSeed: 42,
    assignedAt: "2026-08-09T00:00:01.000Z",
  });
}

describe("Stage-1 primary assignment v1", () => {
  it("replays a run assignment from the frozen study design and explicit master seed", () => {
    const primaryDesign = design();
    const record = assignment(primaryDesign);
    expect(() => validatePrimaryAssignmentRecordV1(record, primaryDesign)).not.toThrow();
    expect(record.unitId).toBe(record.runId);
    expect(record.designHash).toBe(computePrimaryAssignmentDesignHash(primaryDesign));
    expect(record.derivedSeed).toBe(3184169821);
    expect(record.randomDraw).toBe(0.8315073205158114);
    expect(record.assignedArmRef).toEqual({
      id: "swarmalpha.arm.epistemic-governance",
      version: "1.0.0",
    });
    expect(record.assignmentProbability).toBe(0.5);
  });

  it("binds the derived seed to run, study, design, stratum, and ordered arm vector", () => {
    const primaryDesign = design();
    const base = {
      masterSeed: 42,
      runId: "run-1",
      studyRef: { id: "swarmalpha.study.primary-test", version: "1.0.0" },
      design: primaryDesign,
      stratum: { model: "m", taskFamily: "t" },
    };
    const seed = derivePrimaryAssignmentSeed(base);
    expect(derivePrimaryAssignmentSeed({ ...base, masterSeed: 43 })).not.toBe(seed);
    expect(derivePrimaryAssignmentSeed({ ...base, runId: "run-2" })).not.toBe(seed);
    expect(derivePrimaryAssignmentSeed({
      ...base,
      studyRef: { id: "swarmalpha.study.other", version: "1.0.0" },
    })).not.toBe(seed);
    expect(derivePrimaryAssignmentSeed({
      ...base,
      stratum: { model: "other", taskFamily: "t" },
    })).not.toBe(seed);
    const reordered = structuredClone(primaryDesign);
    reordered.arms.reverse();
    expect(derivePrimaryAssignmentSeed({ ...base, design: reordered })).not.toBe(seed);
  });

  it("rejects a self-consistent-looking recorded arm vector that differs from the design", () => {
    const primaryDesign = design();
    const record = assignment(primaryDesign);
    record.arms[0].probability = 0.4;
    record.arms[1].probability = 0.6;
    expect(() => validatePrimaryAssignmentRecordV1(record, primaryDesign))
      .toThrow("arms must exactly match the frozen design");
  });

  it("rejects derived-seed, draw, arm, and design-hash tampering", () => {
    const primaryDesign = design();
    const seedTamper = assignment(primaryDesign);
    seedTamper.derivedSeed = (seedTamper.derivedSeed + 1) >>> 0;
    expect(() => validatePrimaryAssignmentRecordV1(seedTamper, primaryDesign))
      .toThrow("derived seed is not reproducible");

    const drawTamper = assignment(primaryDesign);
    drawTamper.randomDraw = (drawTamper.randomDraw + 0.1) % 1;
    expect(() => validatePrimaryAssignmentRecordV1(drawTamper, primaryDesign))
      .toThrow("draw is not reproducible");

    const armTamper = assignment(primaryDesign);
    armTamper.assignedArmRef = structuredClone(primaryDesign.arms.find(arm =>
      arm.armRef.id !== armTamper.assignedArmRef.id)!.armRef);
    expect(() => validatePrimaryAssignmentRecordV1(armTamper, primaryDesign))
      .toThrow("draw is not reproducible");

    const hashTamper = assignment(primaryDesign);
    hashTamper.designHash = HASH_A;
    expect(() => validatePrimaryAssignmentRecordV1(hashTamper, primaryDesign))
      .toThrow("does not match the frozen design");
  });

  it("requires exact frozen stratification keys and replayable scalar values", () => {
    const primaryDesign = design();
    expect(() => createPrimaryAssignmentV1({
      id: "assignment:missing-stratum",
      runId: "run-1",
      studyRef: { id: "swarmalpha.study.primary-test", version: "1.0.0" },
      design: primaryDesign,
      stratum: { model: "m" },
      masterSeed: 1,
      assignedAt: "2026-08-09T00:00:01.000Z",
    })).toThrow("stratum keys must exactly match");
    expect(() => createPrimaryAssignmentV1({
      id: "assignment:extra-stratum",
      runId: "run-1",
      studyRef: { id: "swarmalpha.study.primary-test", version: "1.0.0" },
      design: primaryDesign,
      stratum: { model: "m", taskFamily: "t", seed: 1 },
      masterSeed: 1,
      assignedAt: "2026-08-09T00:00:01.000Z",
    })).toThrow("stratum keys must exactly match");
  });

  it("rejects fixed-condition, duplicate-arm, mutable-analysis, and non-canonical designs", () => {
    const fixed = design();
    fixed.arms = fixed.arms.slice(0, 1);
    expect(() => validatePrimaryAssignmentDesignV1(fixed)).toThrow("at least two randomized arms");

    const duplicate = design();
    duplicate.arms[1].armRef = structuredClone(duplicate.arms[0].armRef);
    expect(() => validatePrimaryAssignmentDesignV1(duplicate)).toThrow("arm refs must be unique");

    const nonItt = design();
    (nonItt as unknown as { analysisPopulation: string }).analysisPopulation = "per_protocol";
    expect(() => validatePrimaryAssignmentDesignV1(nonItt)).toThrow("intention_to_treat");

    const unsorted = design();
    unsorted.stratification.fields = ["taskFamily", "model"];
    expect(() => validatePrimaryAssignmentDesignV1(unsorted)).toThrow("canonically sorted");
  });

  it("makes confirmatory study validity depend on the frozen Stage-1 design", () => {
    const primaryDesign = design();
    const contract = study(primaryDesign);
    const record = assignment(primaryDesign);
    expect(() => validateGovernanceStudyContract(contract)).not.toThrow();
    expect(() => validatePrimaryAssignmentForStudy(record, contract)).not.toThrow();

    const otherStudy = structuredClone(contract);
    otherStudy.id = "swarmalpha.study.other";
    expect(() => validatePrimaryAssignmentForStudy(record, otherStudy))
      .toThrow("does not belong to the governance study");

    const frozenAfterAssignment = structuredClone(contract);
    frozenAfterAssignment.frozenAt = "2026-08-09T00:00:02.000Z";
    expect(() => validatePrimaryAssignmentForStudy(record, frozenAfterAssignment))
      .toThrow("cannot precede governanceStudy.frozenAt");
  });

  it("creates a self-addressed pre-call manifest and detects content tampering", () => {
    const primaryDesign = design();
    const record = assignment(primaryDesign);
    const manifest = createPrimaryAssignmentManifestV1({
      runId: record.runId,
      studyRef: record.studyRef,
      design: primaryDesign,
      assignment: record,
      createdAt: "2026-08-09T00:00:02.000Z",
    });
    expect(() => validatePrimaryAssignmentManifestV1(manifest)).not.toThrow();
    expect(() => validatePrimaryAssignmentManifestForStudy(manifest, study(primaryDesign)))
      .not.toThrow();

    manifest.assignment.masterSeed += 1;
    expect(() => validatePrimaryAssignmentManifestV1(manifest)).toThrow();
  });

  it("rejects a fully self-consistent manifest snapshot that differs from the study", () => {
    const frozenDesign = design();
    const replacementDesign = design();
    replacementDesign.arms[0].implementationConfigHash = HASH_B;
    const replacementAssignment = assignment(replacementDesign);
    const replacementManifest = createPrimaryAssignmentManifestV1({
      runId: replacementAssignment.runId,
      studyRef: replacementAssignment.studyRef,
      design: replacementDesign,
      assignment: replacementAssignment,
      createdAt: "2026-08-09T00:00:02.000Z",
    });
    expect(() => validatePrimaryAssignmentManifestForStudy(
      replacementManifest,
      study(frozenDesign),
    )).toThrow("design snapshot differs from the frozen study design");
  });

  it("rejects a manifest recorded before its assignment", () => {
    const primaryDesign = design();
    const record = assignment(primaryDesign);
    expect(() => createPrimaryAssignmentManifestV1({
      runId: record.runId,
      studyRef: record.studyRef,
      design: primaryDesign,
      assignment: record,
      createdAt: "2026-08-09T00:00:00.000Z",
    })).toThrow("cannot precede its assignment");
  });

  it("persists once and reuses the immutable pre-call manifest on retry", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "swarmalpha-primary-assignment-"));
    try {
      const primaryDesign = design();
      const contract = study(primaryDesign);
      const record = assignment(primaryDesign);
      const createManifest = () => createPrimaryAssignmentManifestV1({
        runId: record.runId,
        studyRef: record.studyRef,
        design: primaryDesign,
        assignment: record,
        createdAt: "2026-08-09T00:00:02.000Z",
      });
      const first = loadOrCreatePrimaryAssignmentManifestV1({
        outputDir,
        runId: record.runId,
        study: contract,
        createManifest,
      });
      let redrawCalled = false;
      const retry = loadOrCreatePrimaryAssignmentManifestV1({
        outputDir,
        runId: record.runId,
        study: contract,
        createManifest: () => {
          redrawCalled = true;
          return createManifest();
        },
      });
      expect(first.reused).toBe(false);
      expect(retry.reused).toBe(true);
      expect(redrawCalled).toBe(false);
      expect(retry.fileHash).toBe(first.fileHash);
      expect(retry.manifest).toEqual(first.manifest);
      expect(readPrimaryAssignmentManifestV1({
        outputDir,
        runId: record.runId,
        study: contract,
      })?.manifest).toEqual(first.manifest);
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("refuses to reuse a manifest under a different frozen study design", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "swarmalpha-primary-assignment-"));
    try {
      const primaryDesign = design();
      const contract = study(primaryDesign);
      const record = assignment(primaryDesign);
      loadOrCreatePrimaryAssignmentManifestV1({
        outputDir,
        runId: record.runId,
        study: contract,
        createManifest: () => createPrimaryAssignmentManifestV1({
          runId: record.runId,
          studyRef: record.studyRef,
          design: primaryDesign,
          assignment: record,
          createdAt: "2026-08-09T00:00:02.000Z",
        }),
      });
      const changedDesign = design();
      changedDesign.arms[0].implementationConfigHash = HASH_B;
      expect(() => loadOrCreatePrimaryAssignmentManifestV1({
        outputDir,
        runId: record.runId,
        study: study(changedDesign),
        createManifest: () => {
          throw new Error("must not redraw");
        },
      })).toThrow();
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("fails closed with contextual diagnostics for a corrupt manifest file", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "swarmalpha-primary-assignment-"));
    try {
      const absolutePath = resolvePrimaryAssignmentManifestV1Path(outputDir, "run-1");
      fs.writeFileSync(absolutePath, "{truncated", "utf8");
      expect(() => readPrimaryAssignmentManifestV1({
        outputDir,
        runId: "run-1",
        study: study(),
      })).toThrow("primary assignment manifest is not valid JSON");
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });
});

describe("CC-5A Stage-1 primary assignment adversarial edges", () => {
  // ── PrimaryAssignmentDesignV1 ─────────────────────────────────────────────

  it("rejects an unsupported design schemaVersion", () => {
    const bad = design();
    (bad as unknown as { schemaVersion: string }).schemaVersion = "2.0.0";
    expect(() => validatePrimaryAssignmentDesignV1(bad))
      .toThrow("primaryAssignmentDesign.schemaVersion must be 1.0.0");
  });

  it("rejects empty or malformed id, version, and preregistrationRef", () => {
    const emptyId = design();
    emptyId.id = "";
    expect(() => validatePrimaryAssignmentDesignV1(emptyId))
      .toThrow("primaryAssignmentDesign.id must be non-empty");

    const badVersion = design();
    badVersion.version = "1.0";
    expect(() => validatePrimaryAssignmentDesignV1(badVersion))
      .toThrow("primaryAssignmentDesign.version must be semantic x.y.z");

    const emptyPrereg = design();
    emptyPrereg.preregistrationRef = { id: "", version: "1.0.0" };
    expect(() => validatePrimaryAssignmentDesignV1(emptyPrereg))
      .toThrow("primaryAssignmentDesign.preregistrationRef.id must be non-empty");
  });

  it("rejects an unsupported assignment algorithm ref", () => {
    const bad = design();
    bad.assignmentAlgorithmRef = { id: "swarmalpha.primary-assignment.other", version: "1.0.0" };
    expect(() => validatePrimaryAssignmentDesignV1(bad))
      .toThrow("primaryAssignmentDesign uses an unsupported assignment algorithm");
  });

  it("rejects an empty seedNamespace", () => {
    const bad = design();
    bad.seedNamespace = "   ";
    expect(() => validatePrimaryAssignmentDesignV1(bad))
      .toThrow("primaryAssignmentDesign.seedNamespace must be non-empty");
  });

  it("rejects zero, negative, NaN, infinite, and >1 arm probabilities", () => {
    for (const probability of [0, -0.1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      const bad = design();
      bad.arms[0].allocationProbability = probability;
      expect(() => validatePrimaryAssignmentDesignV1(bad))
        .toThrow("primaryAssignmentDesign arm probabilities must be within (0,1]");
    }
  });

  it("rejects arm probabilities that do not sum to 1", () => {
    const bad = design();
    bad.arms[0].allocationProbability = 0.4;
    expect(() => validatePrimaryAssignmentDesignV1(bad)).toThrow("must sum to 1");
  });

  it("rejects malformed implementation/budget refs and non-sha256 config/budget hashes", () => {
    const badImplRef = design();
    badImplRef.arms[0].implementationRef = { id: "", version: "1.0.0" };
    expect(() => validatePrimaryAssignmentDesignV1(badImplRef))
      .toThrow("primaryAssignmentDesign.arm.implementationRef.id must be non-empty");

    const badBudgetRef = design();
    badBudgetRef.arms[0].budgetContractRef = { id: "swarmalpha.budget.x", version: "nope" };
    expect(() => validatePrimaryAssignmentDesignV1(badBudgetRef))
      .toThrow("primaryAssignmentDesign.arm.budgetContractRef.version must be semantic x.y.z");

    const badImplHash = design();
    badImplHash.arms[0].implementationConfigHash = "abc";
    expect(() => validatePrimaryAssignmentDesignV1(badImplHash))
      .toThrow("primaryAssignmentDesign.arm.implementationConfigHash must be a canonical sha256 hash");

    const badBudgetHash = design();
    badBudgetHash.arms[0].budgetContractHash = "sha256:zzz";
    expect(() => validatePrimaryAssignmentDesignV1(badBudgetHash))
      .toThrow("primaryAssignmentDesign.arm.budgetContractHash must be a canonical sha256 hash");
  });

  it("rejects duplicate, blank, and non-canonically-sorted stratification fields", () => {
    const duplicate = design();
    duplicate.stratification.fields = ["model", "model"];
    expect(() => validatePrimaryAssignmentDesignV1(duplicate))
      .toThrow("stratification fields must be unique non-empty strings");

    const blank = design();
    blank.stratification.fields = ["model", "  "];
    expect(() => validatePrimaryAssignmentDesignV1(blank))
      .toThrow("stratification fields must be unique non-empty strings");

    const unsorted = design();
    unsorted.stratification.fields = ["taskFamily", "model"];
    expect(() => validatePrimaryAssignmentDesignV1(unsorted)).toThrow("canonically sorted");
  });

  it("rejects missing/extra field policies other than reject", () => {
    const missingPolicy = design();
    (missingPolicy.stratification as unknown as { missingFieldPolicy: string }).missingFieldPolicy = "impute";
    expect(() => validatePrimaryAssignmentDesignV1(missingPolicy))
      .toThrow("primaryAssignmentDesign v1 stratification must reject missing and extra fields");

    const extraPolicy = design();
    (extraPolicy.stratification as unknown as { extraFieldPolicy: string }).extraFieldPolicy = "ignore";
    expect(() => validatePrimaryAssignmentDesignV1(extraPolicy))
      .toThrow("primaryAssignmentDesign v1 stratification must reject missing and extra fields");
  });

  it("rejects an analysis population other than intention_to_treat", () => {
    const bad = design();
    (bad as unknown as { analysisPopulation: string }).analysisPopulation = "per_protocol";
    expect(() => validatePrimaryAssignmentDesignV1(bad))
      .toThrow("primaryAssignmentDesign v1 requires intention_to_treat analysis");
  });

  it("rejects a retry policy other than reuse_assignment", () => {
    const bad = design();
    (bad as unknown as { retryPolicy: string }).retryPolicy = "redraw";
    expect(() => validatePrimaryAssignmentDesignV1(bad))
      .toThrow("primaryAssignmentDesign v1 requires reuse_assignment retry policy");
  });

  it("rejects an invalid primary estimand ref", () => {
    const bad = design();
    bad.primaryEstimandRef = { id: "", version: "1.0.0" };
    expect(() => validatePrimaryAssignmentDesignV1(bad))
      .toThrow("primaryAssignmentDesign.primaryEstimandRef.id must be non-empty");
  });

  it("rejects a runtime-forged group unit", () => {
    const bad = design();
    (bad as unknown as { unit: string }).unit = "group";
    expect(() => validatePrimaryAssignmentDesignV1(bad))
      .toThrow("primaryAssignmentDesign v1 supports run units only");
  });

  // ── PrimaryAssignmentRecordV1 ─────────────────────────────────────────────

  it("rejects a record whose unitId differs from its runId or whose unitKind is forged", () => {
    const primaryDesign = design();

    const unitIdTamper = assignment(primaryDesign);
    unitIdTamper.unitId = "run:other";
    expect(() => validatePrimaryAssignmentRecordV1(unitIdTamper, primaryDesign))
      .toThrow("primaryAssignment v1 unit must be the runId");

    const eventTamper = assignment(primaryDesign);
    eventTamper.unitKind = "eligible_event" as never;
    expect(() => validatePrimaryAssignmentRecordV1(eventTamper, primaryDesign))
      .toThrow("primaryAssignment v1 unit must be the runId");

    const groupTamper = assignment(primaryDesign);
    groupTamper.unitKind = "group" as never;
    expect(() => validatePrimaryAssignmentRecordV1(groupTamper, primaryDesign))
      .toThrow("primaryAssignment v1 unit must be the runId");
  });

  it("rejects inconsistent study/design/preregistration/algorithm refs", () => {
    const primaryDesign = design();

    const studyRef = assignment(primaryDesign);
    studyRef.studyRef = { id: "swarmalpha.study.primary-test", version: "1.0.1" };
    expect(() => validatePrimaryAssignmentRecordV1(studyRef, primaryDesign))
      .toThrow("derived seed is not reproducible");

    const designRef = assignment(primaryDesign);
    designRef.designRef = { id: "swarmalpha.primary-design.other", version: "1.0.0" };
    expect(() => validatePrimaryAssignmentRecordV1(designRef, primaryDesign))
      .toThrow("does not match the frozen design");

    const preregRef = assignment(primaryDesign);
    preregRef.preregistrationRef = { id: "swarmalpha.prereg.other", version: "1.0.0" };
    expect(() => validatePrimaryAssignmentRecordV1(preregRef, primaryDesign))
      .toThrow("design metadata mismatch");

    const algorithmRef = assignment(primaryDesign);
    algorithmRef.assignmentAlgorithmRef = { id: "swarmalpha.primary-assignment.other", version: "1.0.0" };
    expect(() => validatePrimaryAssignmentRecordV1(algorithmRef, primaryDesign))
      .toThrow("design metadata mismatch");
  });

  it("rejects a non-sha256 or mismatched design hash", () => {
    const primaryDesign = design();

    const nonSha = assignment(primaryDesign);
    nonSha.designHash = "not-a-hash";
    expect(() => validatePrimaryAssignmentRecordV1(nonSha, primaryDesign))
      .toThrow("primaryAssignment.designHash must be a canonical sha256 hash");

    const mismatch = assignment(primaryDesign);
    mismatch.designHash = HASH_A;
    expect(() => validatePrimaryAssignmentRecordV1(mismatch, primaryDesign))
      .toThrow("does not match the frozen design");
  });

  it("rejects negative, non-integer, and out-of-safe-range seeds", () => {
    const negativeMaster = assignment(design());
    negativeMaster.masterSeed = -1;
    expect(() => validatePrimaryAssignmentRecordV1(negativeMaster, design()))
      .toThrow("primaryAssignment seeds are invalid");

    const nonInteger = assignment(design());
    nonInteger.masterSeed = 1.5;
    expect(() => validatePrimaryAssignmentRecordV1(nonInteger, design()))
      .toThrow("primaryAssignment seeds are invalid");

    const outOfSafe = assignment(design());
    outOfSafe.masterSeed = Number.MAX_SAFE_INTEGER + 2;
    expect(() => validatePrimaryAssignmentRecordV1(outOfSafe, design()))
      .toThrow("primaryAssignment seeds are invalid");

    const negativeDerived = assignment(design());
    negativeDerived.derivedSeed = -1;
    expect(() => validatePrimaryAssignmentRecordV1(negativeDerived, design()))
      .toThrow("primaryAssignment seeds are invalid");

    const nonUint32 = assignment(design());
    nonUint32.derivedSeed = 0x1_0000_0000;
    expect(() => validatePrimaryAssignmentRecordV1(nonUint32, design()))
      .toThrow("primaryAssignment seeds are invalid");
  });

  it("rejects assignmentProbability tampering", () => {
    const primaryDesign = design();
    const record = assignment(primaryDesign);
    record.assignmentProbability = 0.1;
    expect(() => validatePrimaryAssignmentRecordV1(record, primaryDesign))
      .toThrow("draw is not reproducible");
  });

  it("rejects stratum values that are NaN, Infinity, object, array, or null", () => {
    const primaryDesign = design();
    const cases: Array<[string, Record<string, unknown>]> = [
      ["NaN", { model: Number.NaN, taskFamily: "t" }],
      ["Infinity", { model: Number.POSITIVE_INFINITY, taskFamily: "t" }],
      ["object", { model: {}, taskFamily: "t" }],
      ["array", { model: [], taskFamily: "t" }],
      ["null", { model: null, taskFamily: "t" }],
    ];
    for (const [label, stratum] of cases) {
      expect(() => createPrimaryAssignmentV1({
        id: `assignment:bad-stratum:${label}`,
        runId: "run-1",
        studyRef: { id: "swarmalpha.study.primary-test", version: "1.0.0" },
        design: primaryDesign,
        stratum: stratum as unknown as Record<string, string | number | boolean>,
        masterSeed: 1,
        assignedAt: "2026-08-09T00:00:01.000Z",
      })).toThrow("stratum values must be strings, booleans, or finite numbers");
    }
  });

  it("rejects an arms vector that is reordered, replaced, added to, or truncated", () => {
    const primaryDesign = design();

    const reordered = assignment(primaryDesign);
    reordered.arms.reverse();
    expect(() => validatePrimaryAssignmentRecordV1(reordered, primaryDesign))
      .toThrow("arms must exactly match the frozen design");

    const replaced = assignment(primaryDesign);
    replaced.arms[0].armRef = { id: "swarmalpha.arm.other", version: "1.0.0" };
    expect(() => validatePrimaryAssignmentRecordV1(replaced, primaryDesign))
      .toThrow("arms must exactly match the frozen design");

    const added = assignment(primaryDesign);
    added.arms.push({ armRef: { id: "swarmalpha.arm.extra", version: "1.0.0" }, probability: 0.5 });
    expect(() => validatePrimaryAssignmentRecordV1(added, primaryDesign))
      .toThrow("arms must exactly match the frozen design");

    const truncated = assignment(primaryDesign);
    truncated.arms.pop();
    expect(() => validatePrimaryAssignmentRecordV1(truncated, primaryDesign))
      .toThrow("arms must exactly match the frozen design");
  });

  it("rejects an invalid assignedAt timestamp", () => {
    const primaryDesign = design();
    const record = assignment(primaryDesign);
    record.assignedAt = "not-a-date";
    expect(() => validatePrimaryAssignmentRecordV1(record, primaryDesign))
      .toThrow("primaryAssignment.assignedAt must be an ISO-compatible timestamp");
  });

  it("produces deep-equal records for identical inputs", () => {
    const primaryDesign = design();
    const input = {
      id: "primary-assignment:run-x",
      runId: "run-x",
      studyRef: { id: "swarmalpha.study.primary-test", version: "1.0.0" },
      design: primaryDesign,
      stratum: { model: "m", taskFamily: "t" },
      masterSeed: 7,
      assignedAt: "2026-08-09T00:00:01.000Z",
    };
    expect(createPrimaryAssignmentV1(input)).toEqual(createPrimaryAssignmentV1(input));
  });

  it("changes the seed commitment when implementation or budget config hash changes", () => {
    const base = {
      masterSeed: 42,
      runId: "run-1",
      studyRef: { id: "swarmalpha.study.primary-test", version: "1.0.0" },
      stratum: { model: "m", taskFamily: "t" },
    };
    const designA = design();
    const designB = design();
    designB.arms[0].implementationConfigHash = HASH_B;
    const designC = design();
    designC.arms[0].budgetContractHash = HASH_A;
    const seedA = derivePrimaryAssignmentSeed({ ...base, design: designA });
    expect(derivePrimaryAssignmentSeed({ ...base, design: designB })).not.toBe(seedA);
    expect(derivePrimaryAssignmentSeed({ ...base, design: designC })).not.toBe(seedA);
  });

  // ── PrimaryAssignmentManifestV1 / store ───────────────────────────────────

  function makeManifest(): PrimaryAssignmentManifestV1 {
    const primaryDesign = design();
    const record = assignment(primaryDesign);
    return createPrimaryAssignmentManifestV1({
      runId: record.runId,
      studyRef: record.studyRef,
      design: primaryDesign,
      assignment: record,
      createdAt: "2026-08-09T00:00:02.000Z",
    });
  }

  it("rejects a manifest with the wrong artifact type or schema version", () => {
    const badType = structuredClone(makeManifest());
    (badType as unknown as { artifactType: string }).artifactType = "swarmalpha.other";
    expect(() => validatePrimaryAssignmentManifestV1(badType)).toThrow("artifact/schema mismatch");

    const badSchema = structuredClone(makeManifest());
    (badSchema as unknown as { schemaVersion: string }).schemaVersion = "2.0.0";
    expect(() => validatePrimaryAssignmentManifestV1(badSchema)).toThrow("artifact/schema mismatch");
  });

  it("rejects a manifest whose runId or studyRef disagrees with its assignment", () => {
    const runIdTamper = structuredClone(makeManifest());
    runIdTamper.runId = "run:other";
    expect(() => validatePrimaryAssignmentManifestV1(runIdTamper))
      .toThrow("run/study binding mismatch");
  });

  it("rejects a manifest whose design snapshot disagrees with its assignment", () => {
    const snap = structuredClone(makeManifest());
    snap.designSnapshot.arms[0].allocationProbability = 0.4;
    snap.designSnapshot.arms[1].allocationProbability = 0.6;
    // The changed snapshot no longer matches the assignment's frozen designHash.
    expect(() => validatePrimaryAssignmentManifestV1(snap))
      .toThrow("does not match the frozen design");
  });

  it("rejects a manifest whose retry policy disagrees with its design", () => {
    const retryTamper = structuredClone(makeManifest());
    (retryTamper as unknown as { retryPolicy: string }).retryPolicy = "redraw";
    expect(() => validatePrimaryAssignmentManifestV1(retryTamper))
      .toThrow("retry policy does not match its design");
  });

  it("rejects a tampered contentHash and a stale hash after content mutation", () => {
    const hashTamper = structuredClone(makeManifest());
    hashTamper.contentHash = HASH_A;
    expect(() => validatePrimaryAssignmentManifestV1(hashTamper)).toThrow("contentHash mismatch");

    const contentTamper = structuredClone(makeManifest());
    contentTamper.assignment.masterSeed = 1; // contentHash deliberately left stale
    expect(() => validatePrimaryAssignmentManifestV1(contentTamper)).toThrow();
  });

  it("sanitizes run ids so separators and unicode cannot escape the output directory", () => {
    const outputDir = path.join(os.tmpdir(), "primary-escape-");
    const resolvedRoot = path.resolve(outputDir);
    for (const runId of ["../../etc/passwd", "a\\..\\b", "运行:测试", "..", "a/b/c", "colon:name"]) {
      const resolved = resolvePrimaryAssignmentManifestV1Path(outputDir, runId);
      expect(path.dirname(resolved)).toBe(resolvedRoot);
    }
  });

  it("keeps distinct paths for run ids that sanitize to the same stem", () => {
    const outputDir = path.join(os.tmpdir(), "primary-stem-");
    const a = resolvePrimaryAssignmentManifestV1Path(outputDir, "a/b");
    const b = resolvePrimaryAssignmentManifestV1Path(outputDir, "a?b");
    expect(a).not.toBe(b);
  });

  it("never treats a temporary .tmp file as the authoritative manifest", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "primary-tmp-"));
    try {
      const primaryDesign = design();
      const record = assignment(primaryDesign);
      const manifest = createPrimaryAssignmentManifestV1({
        runId: record.runId,
        studyRef: record.studyRef,
        design: primaryDesign,
        assignment: record,
        createdAt: "2026-08-09T00:00:02.000Z",
      });
      const authoritative = resolvePrimaryAssignmentManifestV1Path(outputDir, record.runId);
      fs.writeFileSync(
        `${authoritative}.12345678-1234-1234-1234-123456789abc.tmp`,
        JSON.stringify(manifest),
        "utf8",
      );
      expect(fs.existsSync(authoritative)).toBe(false);
      expect(readPrimaryAssignmentManifestV1({
        outputDir,
        runId: record.runId,
        study: study(primaryDesign),
      })).toBeNull();
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("keeps disk content immutable when the returned manifest is mutated", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "primary-immutable-"));
    try {
      const primaryDesign = design();
      const contract = study(primaryDesign);
      const record = assignment(primaryDesign);
      const first = loadOrCreatePrimaryAssignmentManifestV1({
        outputDir,
        runId: record.runId,
        study: contract,
        createManifest: () => createPrimaryAssignmentManifestV1({
          runId: record.runId,
          studyRef: record.studyRef,
          design: primaryDesign,
          assignment: record,
          createdAt: "2026-08-09T00:00:02.000Z",
        }),
      });
      first.manifest.assignment.masterSeed = 1;
      first.manifest.contentHash = HASH_A;
      const again = readPrimaryAssignmentManifestV1({ outputDir, runId: record.runId, study: contract });
      expect(again?.manifest.assignment.masterSeed).toBe(record.masterSeed);
      expect(again?.manifest.contentHash).not.toBe(HASH_A);
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("documents that the local manifest cannot detect consistent whole-artifact forgery", () => {
    // A fully self-consistent replacement (study + design + assignment + manifest
    // rebuilt together) is only detectable via an external commitment. The store
    // validates internal self-consistency and local publication, nothing more.
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/experimentation/primaryAssignmentManifestStore.ts"),
      "utf8",
    );
    expect(src).toMatch(/external authenticity commitment remains/);
  });
});
