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
import {
  deriveUnitSeed,
  assignArm,
  createRunAssignment,
  validateTreatmentAssignment,
  type TreatmentArm,
} from "../src/lib/experimentation/assignment";
import {
  validateApplicationReceipt,
  validateTaskOutcome,
  type InterventionApplicationReceipt,
  type TaskOutcomeRecord,
} from "../src/lib/experimentation/lifecycle";

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
      assignedAt: "t",
    });
    const a = mk();
    const b = mk();
    expect(a).toEqual(b);
  });
});

describe("application receipts and lifecycle validation", () => {
  it("applied status requires appliedAtRound; failed requires failureCode (mutual exclusivity)", () => {
    const applied = {
      id: "r1",
      assignmentId: "asn1",
      status: "applied",
      appliedAtRound: 2,
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
      status: "held_out",
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
      status: "applied",
      appliedAtRound: 4,
      effectiveWindow: { startRound: 5, endRound: 3 },
      targetAgentIds: [],
      sourceEventIds: [],
    } as InterventionApplicationReceipt;
    expect(() => validateApplicationReceipt(bad)).toThrow(/non-decreasing/);
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
