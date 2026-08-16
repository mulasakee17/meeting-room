import { createHash } from "node:crypto";

import type { V6TaskV1 } from "./productionVerticalSlice";

/**
 * A deliberately narrow mechanism-screen intervention.
 *
 * It does not estimate truth, correctness, support, or expected value. It only
 * makes one already-registered private source observation public before the
 * discussion begins. The source is derived without using the assigned arm or
 * the task outcome, so the same frozen block selects the same source in both
 * potential arms.
 */
export const SOURCE_DISCLOSURE_INTERVENTION_V1 = Object.freeze({
  id: "swarmalpha.intervention.pre-discussion-source-disclosure",
  version: "1.0.0",
});

export type SourceDisclosureScreenArmV1 =
  | "holdout"
  | "forced_source_disclosure";

export interface SourceDisclosureSelectionV1 {
  interventionRef: typeof SOURCE_DISCLOSURE_INTERVENTION_V1;
  runId: string;
  blockId: string;
  taskId: string;
  arm: SourceDisclosureScreenArmV1;
  sourceSelectionSeed: number;
  sourceSelectionKeyHash: string;
  sourceAgentId: string;
  sourcePrivateInformationHash: string;
  delivery: "pre_discussion_public_context";
  disclosed: boolean;
  publicContextBeforeHash: string;
  publicContextAfterHash: string;
}

export interface SourceDisclosureTaskVariantV1<TTask extends V6TaskV1 = V6TaskV1> {
  task: TTask;
  selection: SourceDisclosureSelectionV1;
}

function sha256Text(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function requireNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function sourceSelectionKey(input: {
  blockId: string;
  taskId: string;
  sourceSelectionSeed: number;
}): string {
  // The arm, run identity, model output, and task outcome are intentionally absent.
  return JSON.stringify({
    namespace: "swarmalpha:source-disclosure:v1",
    blockId: input.blockId,
    taskId: input.taskId,
    sourceSelectionSeed: input.sourceSelectionSeed,
  });
}

function disclosureText(sourceAgentId: string, privateInformation: string): string {
  return [
    "[Experiment-authorized source disclosure]",
    `sourceAgentId: ${sourceAgentId}`,
    "status: recorded input; not a correctness certificate",
    "source observation:",
    privateInformation,
  ].join("\n");
}

/**
 * Construct a holdout or forced-disclosure task variant from the same frozen
 * source task. The function never reads `task.outcome`; tests must preserve
 * this truth-blind property. The returned task remains a normal V6 task, so
 * the existing task manifest commits the manipulated public context without a
 * new raw schema.
 */
export function createSourceDisclosureTaskVariantV1<TTask extends V6TaskV1>(input: {
  runId: string;
  blockId: string;
  task: TTask;
  arm: SourceDisclosureScreenArmV1;
  sourceSelectionSeed: number;
}): Readonly<SourceDisclosureTaskVariantV1<TTask>> {
  requireNonEmpty(input.runId, "source disclosure runId");
  requireNonEmpty(input.blockId, "source disclosure blockId");
  requireNonEmpty(input.task.id, "source disclosure taskId");
  if (input.arm !== "holdout" && input.arm !== "forced_source_disclosure") {
    throw new Error("source disclosure arm is unsupported");
  }
  if (!Number.isSafeInteger(input.sourceSelectionSeed) || input.sourceSelectionSeed < 0) {
    throw new Error("source disclosure sourceSelectionSeed must be a non-negative safe integer");
  }
  if (!Array.isArray(input.task.agents) || input.task.agents.length < 2) {
    throw new Error("source disclosure requires at least two registered source agents");
  }
  const agentIds = input.task.agents.map(agent => agent.agentId);
  if (new Set(agentIds).size !== agentIds.length
    || agentIds.some(agentId => typeof agentId !== "string" || agentId.trim().length === 0)
    || input.task.agents.some(agent => typeof agent.privateInformation !== "string"
      || agent.privateInformation.trim().length === 0)) {
    throw new Error("source disclosure requires unique agents with non-empty private information");
  }

  const key = sourceSelectionKey({
    blockId: input.blockId,
    taskId: input.task.id,
    sourceSelectionSeed: input.sourceSelectionSeed,
  });
  const digest = createHash("sha256").update(key, "utf8").digest();
  const source = input.task.agents[digest.readUInt32BE(0) % input.task.agents.length];
  const disclosed = input.arm === "forced_source_disclosure";
  const before = input.task.publicContext;
  const after = disclosed
    ? `${before}\n\n${disclosureText(source.agentId, source.privateInformation)}`
    : before;
  const task = structuredClone(input.task);
  task.publicContext = after;
  const selection: SourceDisclosureSelectionV1 = {
    interventionRef: structuredClone(SOURCE_DISCLOSURE_INTERVENTION_V1),
    runId: input.runId,
    blockId: input.blockId,
    taskId: input.task.id,
    arm: input.arm,
    sourceSelectionSeed: input.sourceSelectionSeed,
    sourceSelectionKeyHash: sha256Text(key),
    sourceAgentId: source.agentId,
    sourcePrivateInformationHash: sha256Text(source.privateInformation),
    delivery: "pre_discussion_public_context",
    disclosed,
    publicContextBeforeHash: sha256Text(before),
    publicContextAfterHash: sha256Text(after),
  };
  return deepFreeze({ task, selection });
}
