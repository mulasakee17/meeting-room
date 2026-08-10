/**
 * Treatment assignment — pre-registered, deterministic, auditable (WP2).
 *
 * The paper moves from "a governance system ran and recorded interventions" to
 * "a run/event was eligible, had a pre-registered probability of being assigned
 * to a named arm, and the draw is recorded". This module provides the
 * counter-based seed derivation and the deterministic assignment function.
 * `Math.random()` is never used; the same manifest + seed reproduces the same
 * assignment regardless of execution order.
 */

import { createHash } from "node:crypto";
import { mulberry32 } from "../utils/statsUtils";
import { EXPERIMENTAL_ARMS, type ExperimentalArm } from "./baseline";

/** 实验臂（WP2 run 级 + WP3 完整 baseline ladder 共 8 个）。 */
export const TREATMENT_ARMS: readonly ExperimentalArm[] = EXPERIMENTAL_ARMS;

export type TreatmentArm = ExperimentalArm;

export interface TreatmentAssignment {
  id: string;
  schemaVersion: "2.0.0";
  unitId: string;
  unitKind: "run" | "eligible_event";
  /** 分层因子（taskId/model/seed 等），用于配对。 */
  stratum: Record<string, string | number | boolean>;
  eligibilityRule: { id: string; version: string; reason: string };
  eligibleArms: string[];
  /** Full pre-draw probability vector, required to replay the recorded draw. */
  assignmentProbabilities: Record<string, number>;
  assignedArm: string;
  /** 实际抽样概率（assignedArm 的真实概率，不是事后填 0.5）。 */
  assignmentProbability: number;
  policyId: string;
  policyVersion: string;
  /** 用于派生 unit seed 的主种子。 */
  seed: number;
  randomDraw: number;
  assignedAt: string;
  /** 若为 eligible-event holdout，指向触发诊断的 diagnosis 记录 id。 */
  sourceDiagnosisIds: string[];
}

/**
 * Counter-based seed derivation: `hash(masterSeed, unitId, policyVersion)`.
 * Deliberately independent of loop-call count so resume/retry and parallel
 * execution produce the same draw. Deterministic, no `Math.random()`.
 */
export function deriveUnitSeed(masterSeed: number, unitId: string, policyVersion: string): number {
  const digest = createHash("sha256")
    .update(`${String(masterSeed)}|${unitId}|${policyVersion}`, "utf8")
    .digest();
  return digest.readUInt32BE(0) >>> 0;
}

export interface ArmDraw {
  assignedArm: string;
  randomDraw: number;
}

/**
 * Deterministic arm assignment by cumulative probability over `eligibleArms`,
 * using a seeded mulberry32 PRNG. The reported `randomDraw` is the actual draw
 * that selected the arm, so the probability field is not fabricated.
 */
export function assignArm(
  unitSeed: number,
  eligibleArms: readonly string[],
  probabilities: Record<string, number>,
): ArmDraw {
  if (eligibleArms.length === 0) throw new Error("eligibleArms must be non-empty");
  // Per-arm validation first so an out-of-range value reports the concrete error
  // rather than a downstream sum mismatch.
  for (const arm of eligibleArms) {
    const p = probabilities[arm] ?? 0;
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      throw new Error(`invalid assignment probability for arm ${arm}`);
    }
  }
  const total = eligibleArms.reduce((sum, arm) => sum + (probabilities[arm] ?? 0), 0);
  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(`assignment probabilities must sum to 1 (got ${total})`);
  }
  const rng = mulberry32(unitSeed);
  const draw = rng();
  let cumulative = 0;
  for (const arm of eligibleArms) {
    cumulative += probabilities[arm] ?? 0;
    if (draw < cumulative) return { assignedArm: arm, randomDraw: draw };
  }
  // Floating-point tolerance: draw lands exactly at the boundary.
  return { assignedArm: eligibleArms[eligibleArms.length - 1], randomDraw: draw };
}

/** 结构校验；非法 assignment 抛错（fail closed）。 */
export function validateTreatmentAssignment(value: unknown): asserts value is TreatmentAssignment {
  if (value === null || typeof value !== "object") {
    throw new Error("TreatmentAssignment must be a non-null object");
  }
  const a = value as Record<string, unknown>;
  if (typeof a.id !== "string" || a.id.length === 0) throw new Error("assignment.id must be non-empty");
  if (a.schemaVersion !== "2.0.0") throw new Error("assignment.schemaVersion must be 2.0.0");
  if (typeof a.unitId !== "string" || a.unitId.length === 0) throw new Error("assignment.unitId must be non-empty");
  if (a.unitKind !== "run" && a.unitKind !== "eligible_event") throw new Error("assignment.unitKind must be run|eligible_event");
  if (!Array.isArray(a.eligibleArms) || a.eligibleArms.length === 0) {
    throw new Error("assignment.eligibleArms must be a non-empty array");
  }
  const eligibleArms = a.eligibleArms as string[];
  if (eligibleArms.some(arm => typeof arm !== "string" || arm.length === 0)
    || new Set(eligibleArms).size !== eligibleArms.length) {
    throw new Error("assignment.eligibleArms must contain unique non-empty strings");
  }
  if (eligibleArms.some(arm => !(TREATMENT_ARMS as readonly string[]).includes(arm))) {
    throw new Error("assignment.eligibleArms must reference registered treatment arms");
  }
  if (a.assignmentProbabilities === null || typeof a.assignmentProbabilities !== "object") {
    throw new Error("assignment.assignmentProbabilities must be an object");
  }
  const probabilities = a.assignmentProbabilities as Record<string, number>;
  const probabilityKeys = Object.keys(probabilities);
  if (probabilityKeys.length !== eligibleArms.length
    || probabilityKeys.some(arm => !eligibleArms.includes(arm))) {
    throw new Error("assignment probability keys must exactly match eligibleArms");
  }
  for (const arm of eligibleArms) {
    const probability = probabilities[arm];
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error(`invalid assignment probability for arm ${arm}`);
    }
  }
  const probabilityTotal = eligibleArms.reduce((sum, arm) => sum + probabilities[arm], 0);
  if (Math.abs(probabilityTotal - 1) > 1e-9) {
    throw new Error("assignment probabilities must sum to 1");
  }
  if (typeof a.assignedArm !== "string" || !(a.eligibleArms as string[]).includes(a.assignedArm)) {
    throw new Error("assignment.assignedArm must be one of eligibleArms");
  }
  if (typeof a.assignmentProbability !== "number"
    || !Number.isFinite(a.assignmentProbability)
    || a.assignmentProbability < 0
    || a.assignmentProbability > 1) {
    throw new Error("assignment.assignmentProbability must be finite within [0,1]");
  }
  if (a.assignmentProbability !== probabilities[a.assignedArm as string]) {
    throw new Error("assignment.assignmentProbability must match the assigned-arm probability");
  }
  if (typeof a.policyId !== "string" || a.policyId.length === 0) throw new Error("assignment.policyId must be non-empty");
  if (typeof a.policyVersion !== "string" || a.policyVersion.length === 0) {
    throw new Error("assignment.policyVersion must be non-empty");
  }
  if (typeof a.seed !== "number" || !Number.isSafeInteger(a.seed)) {
    throw new Error("assignment.seed must be a safe integer");
  }
  if (typeof a.randomDraw !== "number" || !Number.isFinite(a.randomDraw) || a.randomDraw < 0 || a.randomDraw >= 1) {
    throw new Error("assignment.randomDraw must be finite within [0,1)");
  }
  if (typeof a.assignedAt !== "string" || !Number.isFinite(Date.parse(a.assignedAt))) {
    throw new Error("assignment.assignedAt must be an ISO-compatible timestamp");
  }
  if (a.stratum === null || typeof a.stratum !== "object" || Array.isArray(a.stratum)) {
    throw new Error("assignment.stratum must be an object");
  }
  for (const stratumValue of Object.values(a.stratum as Record<string, unknown>)) {
    if (typeof stratumValue !== "string" && typeof stratumValue !== "boolean"
      && (typeof stratumValue !== "number" || !Number.isFinite(stratumValue))) {
      throw new Error("assignment.stratum values must be strings, booleans, or finite numbers");
    }
  }
  if (a.eligibilityRule === null || typeof a.eligibilityRule !== "object") {
    throw new Error("assignment.eligibilityRule must be an object");
  }
  const eligibility = a.eligibilityRule as Record<string, unknown>;
  if (typeof eligibility.id !== "string" || eligibility.id.length === 0
    || typeof eligibility.version !== "string" || eligibility.version.length === 0
    || typeof eligibility.reason !== "string" || eligibility.reason.length === 0) {
    throw new Error("assignment eligibility rule id/version/reason must be non-empty");
  }
  if (!Array.isArray(a.sourceDiagnosisIds)
    || a.sourceDiagnosisIds.some(id => typeof id !== "string" || id.length === 0)
    || new Set(a.sourceDiagnosisIds as string[]).size !== a.sourceDiagnosisIds.length) {
    throw new Error("assignment.sourceDiagnosisIds must contain unique non-empty strings");
  }
  const replay = assignArm(a.seed as number, eligibleArms, probabilities);
  if (replay.assignedArm !== a.assignedArm || replay.randomDraw !== a.randomDraw) {
    throw new Error("assignment draw is not reproducible from seed and probability vector");
  }
}

/** 为单个 run 生成 pre-run assignment（当前固定条件 → 概率 1.0 的单臂）。 */
export function createTreatmentAssignment(input: {
  id: string;
  unitId: string;
  unitKind: "run" | "eligible_event";
  stratum: Record<string, string | number | boolean>;
  eligibilityRule: { id: string; version: string; reason: string };
  eligibleArms: readonly TreatmentArm[];
  assignmentProbabilities: Record<string, number>;
  policyId: string;
  policyVersion: string;
  masterSeed: number;
  assignedAt: string;
  sourceDiagnosisIds?: string[];
}): TreatmentAssignment {
  const seed = deriveUnitSeed(input.masterSeed, input.unitId, input.policyVersion);
  const eligibleArms = [...input.eligibleArms];
  const assignmentProbabilities = { ...input.assignmentProbabilities };
  const draw = assignArm(seed, eligibleArms, assignmentProbabilities);
  const assignment: TreatmentAssignment = {
    id: input.id,
    schemaVersion: "2.0.0",
    unitId: input.unitId,
    unitKind: input.unitKind,
    stratum: { ...input.stratum },
    eligibilityRule: { ...input.eligibilityRule },
    eligibleArms,
    assignmentProbabilities,
    assignedArm: draw.assignedArm,
    assignmentProbability: assignmentProbabilities[draw.assignedArm],
    policyId: input.policyId,
    policyVersion: input.policyVersion,
    seed,
    randomDraw: draw.randomDraw,
    assignedAt: input.assignedAt,
    sourceDiagnosisIds: [...(input.sourceDiagnosisIds ?? [])],
  };
  validateTreatmentAssignment(assignment);
  return assignment;
}

export function createRunAssignment(input: {
  id: string;
  unitId: string;
  stratum: Record<string, string | number | boolean>;
  arm: TreatmentArm;
  policyId: string;
  policyVersion: string;
  masterSeed: number;
  assignedAt: string;
}): TreatmentAssignment {
  const unitSeed = deriveUnitSeed(input.masterSeed, input.unitId, input.policyVersion);
  // 固定条件分配：eligible arm 只有当前配置决定的臂，概率 1.0（非随机实验阶段的诚实记录）。
  const draw = assignArm(unitSeed, [input.arm], { [input.arm]: 1 });
  const assignment: TreatmentAssignment = {
    id: input.id,
    schemaVersion: "2.0.0",
    unitId: input.unitId,
    unitKind: "run",
    stratum: input.stratum,
    eligibilityRule: {
      id: "swarmalpha.fixed-condition",
      version: "1.0.0",
      reason: `pre-run configuration selected ${input.arm}`,
    },
    eligibleArms: [input.arm],
    assignmentProbabilities: { [input.arm]: 1 },
    assignedArm: draw.assignedArm,
    assignmentProbability: 1,
    policyId: input.policyId,
    policyVersion: input.policyVersion,
    seed: unitSeed,
    randomDraw: draw.randomDraw,
    assignedAt: input.assignedAt,
    sourceDiagnosisIds: [],
  };
  validateTreatmentAssignment(assignment);
  return assignment;
}
