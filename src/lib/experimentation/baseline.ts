/**
 * Baseline ladder and cost contracts (WP3).
 *
 * The ladder separates communication value, governance value, and "just more
 * LLM budget": independent_ensemble vs vanilla_interaction isolates swarm
 * alpha; random vs diagnostic governance isolates specificity; full_information
 * oracle is the capability ceiling; cost_matched_strong_baseline spends any
 * governance extra budget on more independent samples / self-consistency.
 *
 * Every arm carries a pre-registered BudgetContract in the manifest. Budget
 * matching is the primary design; actual tokens/latency enter the cost outcome.
 * No calls are added after the fact to chase an arm.
 */

import type { CostRecord } from "./lifecycle";

/** 8-arm baseline ladder（WP3）。 */
export const EXPERIMENTAL_ARMS = [
  "partial_individual",
  "independent_ensemble",
  "vanilla_interaction",
  "random_governance",
  "diagnostic_governance",
  "epistemic_governance",
  "full_information_oracle",
  "cost_matched_strong_baseline",
] as const;

export type ExperimentalArm = (typeof EXPERIMENTAL_ARMS)[number];

/**
 * Pre-registered budget per arm. All fields optional (an arm may not use a
 * resource); a present field must be a non-negative finite number.
 */
export interface BudgetContract {
  maxLlmCalls?: number;
  maxPromptTokens?: number;
  maxCompletionTokens?: number;
  maxRounds?: number;
  maxWallClockMs?: number;
  aggregationCalls?: number;
  verificationCalls?: number;
}

export function validateBudgetContract(value: unknown): asserts value is BudgetContract {
  if (value === null || typeof value !== "object") {
    throw new Error("BudgetContract must be a non-null object");
  }
  const numericFields = [
    "maxLlmCalls",
    "maxPromptTokens",
    "maxCompletionTokens",
    "maxRounds",
    "maxWallClockMs",
    "aggregationCalls",
    "verificationCalls",
  ] as const;
  for (const field of numericFields) {
    const v = (value as Record<string, unknown>)[field];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      throw new Error(`BudgetContract.${field} must be a non-negative finite number`);
    }
    if (field !== "maxWallClockMs" && !Number.isSafeInteger(v)) {
      throw new Error(`BudgetContract.${field} must be a non-negative safe integer`);
    }
  }
}

/**
 * One arm's block-level outcome. `blockKey` identifies the paired block
 * (task × model × replicateSeed); `quality` is the EvaluationRecord-applicable
 * quality (accuracy, negative log loss sign-adjusted, or Kendall tau), and is
 * `null` when the arm was not scored (unresolved/invalid).
 */
export interface BlockOutcome {
  arm: ExperimentalArm;
  blockKey: string;
  taskId: string;
  modelId: string;
  replicateSeed: number;
  evaluationContractRef: { id: string; version: string };
  metricRef: { id: string; version: string; direction: "higher_is_better" };
  budgetContractHash: string;
  quality: number | null;
  cost: CostRecord;
  status: "scored" | "unresolved" | "invalid";
}

export function validateBlockOutcome(value: unknown): asserts value is BlockOutcome {
  if (value === null || typeof value !== "object") {
    throw new Error("BlockOutcome must be a non-null object");
  }
  const o = value as Record<string, unknown>;
  if (typeof o.arm !== "string" || !(EXPERIMENTAL_ARMS as readonly string[]).includes(o.arm)) {
    throw new Error(`BlockOutcome.arm must be one of ${EXPERIMENTAL_ARMS.join(", ")}`);
  }
  if (typeof o.blockKey !== "string" || o.blockKey.length === 0) {
    throw new Error("BlockOutcome.blockKey must be a non-empty string");
  }
  for (const field of ["taskId", "modelId"] as const) {
    if (typeof o[field] !== "string" || (o[field] as string).length === 0) {
      throw new Error(`BlockOutcome.${field} must be a non-empty string`);
    }
  }
  if (typeof o.budgetContractHash !== "string" || !/^[a-f0-9]{64}$/.test(o.budgetContractHash)) {
    throw new Error("BlockOutcome.budgetContractHash must be a SHA-256 hex digest");
  }
  if (!Number.isSafeInteger(o.replicateSeed)) throw new Error("BlockOutcome.replicateSeed must be a safe integer");
  for (const field of ["evaluationContractRef", "metricRef"] as const) {
    const ref = o[field];
    if (ref === null || typeof ref !== "object") throw new Error(`BlockOutcome.${field} must be an object`);
    const record = ref as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id.length === 0
      || typeof record.version !== "string" || record.version.length === 0) {
      throw new Error(`BlockOutcome.${field} id/version must be non-empty`);
    }
  }
  if ((o.metricRef as Record<string, unknown>).direction !== "higher_is_better") {
    throw new Error("BlockOutcome.metricRef.direction must be higher_is_better");
  }
  if (o.quality !== null && (typeof o.quality !== "number" || !Number.isFinite(o.quality))) {
    throw new Error("BlockOutcome.quality must be a finite number or null");
  }
  if (o.status !== "scored" && o.status !== "unresolved" && o.status !== "invalid") {
    throw new Error("BlockOutcome.status must be scored|unresolved|invalid");
  }
  if ((o.status === "scored") !== (o.quality !== null)) {
    throw new Error("BlockOutcome scored status and quality presence must agree");
  }
  if (o.cost === null || typeof o.cost !== "object") throw new Error("BlockOutcome.cost must be an object");
  for (const value of Object.values(o.cost as Record<string, unknown>)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error("BlockOutcome costs must be non-negative finite numbers");
    }
  }
}
