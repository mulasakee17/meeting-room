/**
 * experimentation.test.ts — WP2 treatment assignment lifecycle 测试
 *
 * 覆盖 masterplan WP2 必须新增的测试：
 *   - 同 manifest 与 seed 跨执行顺序产生完全相同 assignment（counter-based、无 Math.random）；
 *   - 不同 unitId 不意外共享 draw；
 *   - 概率与 eligible arms 验证；
 *   - holdout 有显式 receipt；
 *   - applied/failed/inapplicable 状态互斥；
 *   - effectiveWindow 越界 fail closed；
 *   - createRunAssignment 生成合法、可审计的 pre-run assignment。
 */

import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  deriveUnitSeed,
  assignArm,
  createTreatmentAssignment,
  createRunAssignment,
  validateTreatmentAssignment,
  type TreatmentArm,
} from "../src/lib/experimentation/assignment";
import {
  validateApplicationReceipt,
  validateProximalOutcome,
  validateTaskOutcome,
  type InterventionApplicationReceipt,
  type TaskOutcomeRecord,
} from "../src/lib/experimentation/lifecycle";
import { loadOrCreateRunAssignmentManifest } from "../src/lib/experimentation/manifest";

describe("counter-based seed derivation", () => {
  it("is deterministic and independent of call order", () => {
    const a = deriveUnitSeed(42, "run:1", "policy:1.0.0");
    const b = deriveUnitSeed(42, "run:1", "policy:1.0.0");
    expect(a).toBe(b);
    // 同 master seed、不同 unitId → 不同 seed。
    const other = deriveUnitSeed(42, "run:2", "policy:1.0.0");
    expect(a).not.toBe(other);
    // 不同 policy version → 不同 seed。
    const v2 = deriveUnitSeed(42, "run:1", "policy:2.0.0");
    expect(a).not.toBe(v2);
    // 不同 master seed → 不同 seed。
    const m2 = deriveUnitSeed(43, "run:1", "policy:1.0.0");
    expect(a).not.toBe(m2);
  });

  it("assignArm is deterministic for the same unit seed", () => {
    const arms = ["independent_ensemble", "vanilla_interaction", "random_governance"] as const;
    const probs = { independent_ensemble: 0.3, vanilla_interaction: 0.4, random_governance: 0.3 };
    const d1 = assignArm(7, arms, probs);
    const d2 = assignArm(7, arms, probs);
    expect(d1).toEqual(d2);
    expect(arms).toContain(d1.assignedArm);
  });

  it("different unit seeds do not accidentally share the same draw", () => {
    const arms = ["a", "b"] as const;
    const probs = { a: 0.5, b: 0.5 };
    const draws = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const d = assignArm(deriveUnitSeed(1, `u${i}`, "p1"), arms, probs);
      draws.add(d.assignedArm);
    }
    // 40 个不同 unit 上两臂都应出现（种子独立）。
    expect(draws.has("a")).toBe(true);
    expect(draws.has("b")).toBe(true);
  });

  it("validates probabilities (non-finite, out-of-range, sum != 1)", () => {
    const arms = ["a", "b"] as const;
    expect(() => assignArm(1, arms, { a: 0.5, b: 0.5 })).not.toThrow();
    expect(() => assignArm(1, arms, { a: Number.NaN, b: 0.5 })).toThrow(/invalid assignment probability/);
    expect(() => assignArm(1, arms, { a: 1.5, b: 0.5 })).toThrow(/invalid assignment probability/);
    expect(() => assignArm(1, arms, { a: 0.4, b: 0.5 })).toThrow(/must sum to 1/);
    expect(() => assignArm(1, [], {})).toThrow(/must be non-empty/);
  });
});

describe("createRunAssignment", () => {
  it("records the full probability vector for replayable randomized/event assignments", () => {
    const assignment = createTreatmentAssignment({
      id: "asn:event:1",
      unitId: "event:1",
      unitKind: "eligible_event",
      stratum: { taskId: "t", round: 2 },
      eligibleArms: ["diagnostic_governance", "random_governance"],
      assignmentProbabilities: { diagnostic_governance: 0.5, random_governance: 0.5 },
      policyId: "test.event-holdout",
      policyVersion: "1.0.0",
      masterSeed: 5,
      assignedAt: "2026-08-09T00:00:00Z",
      eligibilityRule: {
        id: "test.diagnosis-eligibility",
        version: "1.0.0",
        reason: "diagnosis:1 triggered",
      },
      sourceDiagnosisIds: ["diagnosis:1"],
    });
    expect(() => validateTreatmentAssignment(assignment)).not.toThrow();
    expect(assignment.assignmentProbability).toBe(0.5);
    expect(assignment.sourceDiagnosisIds).toEqual(["diagnosis:1"]);

    const unknownArm = structuredClone(assignment) as unknown as Record<string, unknown>;
    unknownArm.eligibleArms = ["unregistered_arm"];
    expect(() => validateTreatmentAssignment(unknownArm)).toThrow(/registered treatment arms/);

    const duplicateSources = structuredClone(assignment);
    duplicateSources.sourceDiagnosisIds = ["diagnosis:1", "diagnosis:1"];
    expect(() => validateTreatmentAssignment(duplicateSources)).toThrow(/unique non-empty/);
  });

  const arm: TreatmentArm = "diagnostic_governance";

  it("produces a valid pre-run assignment with real sampling probability", () => {
    const assignment = createRunAssignment({
      id: "asn:run:1",
      unitId: "run:1",
      stratum: { taskId: "t", model: "m", seed: 1, runIndex: 0 },
      arm,
      policyId: "swarmalpha.diagnostic",
      policyVersion: "1.0.0",
      masterSeed: 42,
      assignedAt: "2026-08-09T00:00:00Z",
    });
    expect(() => validateTreatmentAssignment(assignment)).not.toThrow();
    expect(assignment.assignedArm).toBe("diagnostic_governance");
    expect(assignment.eligibleArms).toEqual(["diagnostic_governance"]);
    expect(assignment.assignmentProbability).toBe(1);
    expect(assignment.randomDraw).toBeGreaterThanOrEqual(0);
    expect(assignment.randomDraw).toBeLessThan(1);
  });

  it("is deterministic across two invocations (pre-run manifest reproducibility)", () => {
    const mk = () => createRunAssignment({
      id: "asn:run:1",
      unitId: "run:1",
      stratum: { taskId: "t" },
      arm,
      policyId: "p",
      policyVersion: "1.0.0",
      masterSeed: 42,
      assignedAt: "2026-08-09T00:00:00Z",
    });
    const a = mk();
    const b = mk();
    expect(a).toEqual(b);
  });

  it("keeps the legacy TreatmentAssignment@2.0.0 single-arm probability-1 behavior unchanged", () => {
    // Stage-1 PrimaryAssignmentV1 is additive; the WP2 TreatmentAssignment@2.0.0
    // contract (config-decided single arm, probability 1, unitKind run) must not
    // change meaning or shape.
    const assignment = createRunAssignment({
      id: "asn:legacy",
      unitId: "run:legacy",
      stratum: { taskId: "t" },
      arm: "vanilla_interaction",
      policyId: "swarmalpha.legacy",
      policyVersion: "1.0.0",
      masterSeed: 9,
      assignedAt: "2026-08-09T00:00:00Z",
    });
    expect(() => validateTreatmentAssignment(assignment)).not.toThrow();
    expect(assignment.schemaVersion).toBe("2.0.0");
    expect(assignment.unitKind).toBe("run");
    expect(assignment.eligibleArms).toEqual(["vanilla_interaction"]);
    expect(assignment.assignmentProbabilities).toEqual({ vanilla_interaction: 1 });
    expect(assignment.assignmentProbability).toBe(1);
    expect(assignment.sourceDiagnosisIds).toEqual([]);
  });
});

describe("pre-run assignment manifest", () => {
  it("is persisted before either Runner path can invoke an LLM-backed protocol", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "experiments/campaign/pipeline/Runner.ts"), "utf8");
    const hidden = source.slice(source.indexOf("async function runHiddenBenchSingle"), source.indexOf("export async function runSingle"));
    expect(hidden.indexOf("loadOrCreateRunAssignmentManifest")).toBeLessThan(hidden.indexOf("runHiddenBenchProtocol"));
    const standard = source.slice(source.indexOf("export async function runSingle"));
    expect(standard.indexOf("loadOrCreateRunAssignmentManifest")).toBeLessThan(standard.indexOf("engine.run"));
  });

  it("validates an explicit governance study before either Runner path can call a provider", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "experiments/campaign/pipeline/Runner.ts"), "utf8");
    const hidden = source.slice(source.indexOf("async function runHiddenBenchSingle"), source.indexOf("export async function runSingle"));
    expect(hidden.indexOf("assertValidStudyContract")).toBeLessThan(hidden.indexOf("runHiddenBenchProtocol"));
    const standard = source.slice(source.indexOf("export async function runSingle"));
    expect(standard.indexOf("assertValidStudyContract")).toBeLessThan(standard.indexOf("engine.run"));
    // The declaration is persisted as an exact structured clone, not inferred
    // from governanceMode, arm names, filenames, or isMain.
    expect(source).toContain("governanceStudy: structuredClone(governanceStudy)");
  });

  it("never infers a Stage-1 design from governanceMode, isMain, arm names, or filenames", () => {
    const guard = fs.readFileSync(
      path.join(process.cwd(), "experiments/campaign/studyContractGuard.ts"),
      "utf8",
    );
    // The guard's only config access is the explicit governanceStudy field; it
    // never reads governanceMode/isMain/arm/scenario to synthesize a design.
    // (Docstring mentions of those words are not code access.)
    expect(guard).toContain("config.governanceStudy");
    expect(guard).toContain("validateGovernanceStudyContract");
    expect(guard).not.toMatch(/config\.governanceMode/);
    expect(guard).not.toMatch(/config\.isMain\b/);
    expect(guard).not.toMatch(/config\.scenario/);
    expect(guard).not.toMatch(/config\.arm\b/);
  });

  it("persists before execution and reuses the immutable assignment on retry", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assignment-manifest-"));
    try {
      const create = () => createRunAssignment({
        id: "asn:run:manifest",
        unitId: "run:manifest",
        stratum: { taskId: "t" },
        arm: "vanilla_interaction",
        policyId: "test.policy",
        policyVersion: "1.0.0",
        masterSeed: 9,
        assignedAt: "2026-08-09T00:00:00Z",
      });
      const first = loadOrCreateRunAssignmentManifest({ outputDir: dir, runId: "run:manifest", createAssignment: create });
      expect(fs.existsSync(first.absolutePath)).toBe(true);
      expect(first.reused).toBe(false);
      const second = loadOrCreateRunAssignmentManifest({
        outputDir: dir,
        runId: "run:manifest",
        createAssignment: () => { throw new Error("retry must not redraw"); },
      });
      expect(second.reused).toBe(true);
      expect(second.manifest.assignment).toEqual(first.manifest.assignment);
      expect(second.sha256).toBe(first.sha256);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed when a retry changes the predeclared budget contract", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assignment-budget-drift-"));
    try {
      const create = () => createRunAssignment({
        id: "asn:run:budget",
        unitId: "run:budget",
        stratum: { taskId: "t" },
        arm: "vanilla_interaction",
        policyId: "test.policy",
        policyVersion: "1.0.0",
        masterSeed: 9,
        assignedAt: "2026-08-09T00:00:00Z",
      });
      loadOrCreateRunAssignmentManifest({
        outputDir: dir,
        runId: "run:budget",
        createAssignment: create,
        budgetContract: { maxLlmCalls: 4, maxRounds: 2 },
      });
      expect(() => loadOrCreateRunAssignmentManifest({
        outputDir: dir,
        runId: "run:budget",
        createAssignment: create,
        budgetContract: { maxLlmCalls: 6, maxRounds: 2 },
      })).toThrow(/budgetContract/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("application receipts and lifecycle validation", () => {
  it("applied status requires appliedAtRound; failed requires failureCode (mutual exclusivity)", () => {
    const applied = {
      id: "r1",
      assignmentId: "asn1",
      actionType: "force_reflection",
      interventionId: "intv:1",
      status: "applied",
      appliedAtRound: 2,
      plannedWindow: { startRound: 2, endRound: 5 },
      windowContractRef: { id: "test.window", version: "1" },
      effectiveWindow: { startRound: 2, endRound: 5 },
      targetAgentIds: ["a1"],
      sourceEventIds: [],
    } as InterventionApplicationReceipt;
    expect(() => validateApplicationReceipt(applied)).not.toThrow();

    const missingRound = { ...applied, appliedAtRound: undefined };
    expect(() => validateApplicationReceipt(missingRound)).toThrow(/appliedAtRound/);

    const failedNoCode = {
      ...applied,
      status: "failed",
      appliedAtRound: undefined,
      plannedWindow: undefined,
      windowContractRef: undefined,
      effectiveWindow: null,
      failureCode: undefined,
    };
    expect(() => validateApplicationReceipt(failedNoCode)).toThrow(/failureCode/);

    const failedWithCode = { ...failedNoCode, failureCode: "llm_error" };
    expect(() => validateApplicationReceipt(failedWithCode)).not.toThrow();
  });

  it("holdout is a first-class receipt status", () => {
    const heldOut = {
      id: "r2",
      assignmentId: "asn1",
      actionType: "holdout",
      interventionId: "intv:2",
      status: "held_out",
      plannedWindow: { startRound: 3, endRound: 3 },
      windowContractRef: { id: "test.window", version: "1" },
      effectiveWindow: null,
      targetAgentIds: [],
      sourceEventIds: ["ev:1"],
    } as InterventionApplicationReceipt;
    expect(() => validateApplicationReceipt(heldOut)).not.toThrow();
  });

  it("effectiveWindow must not be decreasing", () => {
    const bad = {
      id: "r3",
      assignmentId: "asn1",
      actionType: "force_reflection",
      interventionId: "intv:3",
      status: "applied",
      appliedAtRound: 4,
      plannedWindow: { startRound: 5, endRound: 5 },
      windowContractRef: { id: "test.window", version: "1" },
      effectiveWindow: { startRound: 5, endRound: 3 },
      targetAgentIds: [],
      sourceEventIds: [],
    } as InterventionApplicationReceipt;
    expect(() => validateApplicationReceipt(bad)).toThrow(/non-decreasing/);
  });

  it("validates the registered belief-summary metric and explicit partial missingness", () => {
    const proximal = {
      id: "prox:1",
      applicationReceiptId: "r1",
      window: { startRound: 2, endRound: 2 },
      metricContractRefs: [{ id: "swarmalpha.proximal.belief-summary", version: "1.0.0" }],
      values: { meanConfidence: null, beliefSpread: 0.4 },
    };
    expect(() => validateProximalOutcome(proximal)).toThrow(/missingnessReason/);
    expect(() => validateProximalOutcome({ ...proximal, missingnessReason: "no finite confidences" })).not.toThrow();
    expect(() => validateProximalOutcome({
      ...proximal,
      values: { meanConfidence: 1.2, beliefSpread: 0.4 },
    })).toThrow(/meanConfidence/);
  });

  it("scored task outcome must not have null quality", () => {
    const good: TaskOutcomeRecord = {
      runAssignmentId: "asn1",
      evaluationContractRef: { id: "swarmalpha.categorical.ranking", version: "1.0.0" },
      quality: 0.8,
      cost: { totalTokens: 100 },
      status: "scored",
    };
    expect(() => validateTaskOutcome(good)).not.toThrow();
    expect(() => validateTaskOutcome({ ...good, quality: null })).toThrow(/scored taskOutcome/);
    expect(() => validateTaskOutcome({ ...good, quality: null, status: "unresolved" })).not.toThrow();
  });
});
