/**
 * Governance lifecycle records — application receipts, proximal outcomes, and
 * task outcomes linked by immutable IDs (WP2).
 *
 * The audit chain is: diagnosis → eligibility → assignment → applied action →
 * effective window → proximal observation → task outcome. Only the records in
 * this module make that chain traceable from a raw artifact alone.
 */

/** 干预应用回执：assignment 后动作是否实际写入、作用于哪个窗口。 */
export interface InterventionApplicationReceipt {
  id: string;
  assignmentId: string;
  actionType: string;
  interventionId?: string;
  status: "applied" | "held_out" | "failed" | "inapplicable";
  appliedAtRound?: number;
  plannedWindow?: { startRound: number; endRound: number };
  windowContractRef?: { id: string; version: string };
  effectiveWindow: { startRound: number; endRound: number } | null;
  targetAgentIds: string[];
  failureCode?: string;
  sourceEventIds: string[];
}

/** 近端结果：动作后指定窗口内的指标观测。 */
export interface ProximalOutcomeRecord {
  id: string;
  applicationReceiptId: string;
  window: { startRound: number; endRound: number };
  metricContractRefs: Array<{ id: string; version: string }>;
  values: Record<string, number | null>;
  missingnessReason?: string;
}

/**
 * Descriptive post-action summary over the receipt's declared observation
 * window. These fields are observables, not causal effects: causal estimands
 * require an eligible-event assignment and a matched held-out receipt.
 */
export const PROXIMAL_BELIEF_SUMMARY_CONTRACT = Object.freeze({
  id: "swarmalpha.proximal.belief-summary",
  version: "1.0.0",
  fields: Object.freeze({
    meanConfidence: "Arithmetic mean of finite agent confidence values at window end.",
    beliefSpread: "Maximum minus minimum finite scalar belief values at window end.",
  }),
  causalInterpretation: false,
});

/** 成本记录（token/latency/failure）。 */
export interface CostRecord {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  totalLatencyMs?: number;
  invalidOrFailed?: number;
}

/** 任务结果：讨论结束后由评分契约给出，仅 schema-4 confirmatory 链使用。 */
export interface TaskOutcomeRecord {
  runAssignmentId: string;
  evaluationContractRef: { id: string; version: string };
  /** Present on schema-5 outcomes projected from the private final measurement. */
  sourceFinalOutcomeRef?: { id: string; version: string; runId: string };
  quality: number | null;
  cost: CostRecord;
  status: "scored" | "unresolved" | "invalid";
}

/** 回执状态互斥：applied 必须有 appliedAtRound；failed 必须有 failureCode。 */
export function validateApplicationReceipt(value: unknown): asserts value is InterventionApplicationReceipt {
  if (value === null || typeof value !== "object") {
    throw new Error("InterventionApplicationReceipt must be a non-null object");
  }
  const r = value as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id.length === 0) throw new Error("receipt.id must be non-empty");
  if (typeof r.assignmentId !== "string" || r.assignmentId.length === 0) {
    throw new Error("receipt.assignmentId must be non-empty");
  }
  if (typeof r.actionType !== "string" || r.actionType.length === 0) {
    throw new Error("receipt.actionType must be non-empty");
  }
  const statuses = ["applied", "held_out", "failed", "inapplicable"];
  if (typeof r.status !== "string" || !statuses.includes(r.status)) {
    throw new Error(`receipt.status must be one of ${statuses.join(", ")}`);
  }
  if (r.status === "applied") {
    if (typeof r.appliedAtRound !== "number" || !Number.isSafeInteger(r.appliedAtRound) || r.appliedAtRound < 1) {
      throw new Error("applied receipt must record appliedAtRound >= 1");
    }
    if (r.plannedWindow === null || typeof r.plannedWindow !== "object") {
      throw new Error("applied receipt must record a plannedWindow");
    }
    if (r.windowContractRef === null || typeof r.windowContractRef !== "object") {
      throw new Error("applied receipt must record a windowContractRef");
    }
  }
  if (["applied", "held_out", "failed"].includes(r.status as string)
    && (typeof r.interventionId !== "string" || r.interventionId.length === 0)) {
    throw new Error(`${String(r.status)} receipt must record an interventionId`);
  }
  if (r.interventionId !== undefined
    && (typeof r.interventionId !== "string" || r.interventionId.length === 0)) {
    throw new Error("receipt.interventionId must be a non-empty string when present");
  }
  if (r.status === "held_out") {
    if (r.plannedWindow === null || typeof r.plannedWindow !== "object") {
      throw new Error("held-out receipt must record the counterfactual plannedWindow");
    }
    if (r.windowContractRef === null || typeof r.windowContractRef !== "object") {
      throw new Error("held-out receipt must record a windowContractRef");
    }
  }
  if (r.status === "failed") {
    if (typeof r.failureCode !== "string" || r.failureCode.length === 0) {
      throw new Error("failed receipt must record failureCode");
    }
  }
  if (r.status !== "applied" && r.appliedAtRound !== undefined) {
    throw new Error("non-applied receipt must not record appliedAtRound");
  }
  if (r.status !== "applied" && r.effectiveWindow !== null) {
    throw new Error("non-applied receipt must use a null effectiveWindow");
  }
  if (r.plannedWindow !== undefined) {
    const planned = r.plannedWindow as Record<string, unknown>;
    if (!Number.isSafeInteger(planned.startRound) || !Number.isSafeInteger(planned.endRound)
      || (planned.startRound as number) < 1
      || (planned.endRound as number) < (planned.startRound as number)) {
      throw new Error("plannedWindow must be a valid round interval");
    }
  }
  if (r.windowContractRef !== undefined) {
    if (r.windowContractRef === null || typeof r.windowContractRef !== "object") {
      throw new Error("windowContractRef must be an object");
    }
    const ref = r.windowContractRef as Record<string, unknown>;
    if (typeof ref.id !== "string" || ref.id.length === 0
      || typeof ref.version !== "string" || ref.version.length === 0) {
      throw new Error("windowContractRef id/version must be non-empty");
    }
  }
  if (r.effectiveWindow !== null && r.effectiveWindow !== undefined) {
    const window = r.effectiveWindow as Record<string, unknown>;
    if (!Number.isSafeInteger(window.startRound) || !Number.isSafeInteger(window.endRound)
      || (window.startRound as number) < 1
      || (window.endRound as number) < (window.startRound as number)) {
      throw new Error("effectiveWindow must be a non-decreasing round interval");
    }
  }
  if (!Array.isArray(r.targetAgentIds)
    || r.targetAgentIds.some(id => typeof id !== "string" || id.length === 0)
    || new Set(r.targetAgentIds as string[]).size !== r.targetAgentIds.length) {
    throw new Error("receipt.targetAgentIds must contain unique non-empty strings");
  }
  if (!Array.isArray(r.sourceEventIds)
    || r.sourceEventIds.some(id => typeof id !== "string" || id.length === 0)
    || new Set(r.sourceEventIds as string[]).size !== r.sourceEventIds.length) {
    throw new Error("receipt.sourceEventIds must contain unique non-empty strings");
  }
}

export function validateProximalOutcome(value: unknown): asserts value is ProximalOutcomeRecord {
  if (value === null || typeof value !== "object") throw new Error("ProximalOutcomeRecord must be an object");
  const o = value as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id.length === 0) throw new Error("proximalOutcome.id must be non-empty");
  if (typeof o.applicationReceiptId !== "string" || o.applicationReceiptId.length === 0) {
    throw new Error("proximalOutcome.applicationReceiptId must be non-empty");
  }
  if (o.window === null || typeof o.window !== "object") throw new Error("proximalOutcome.window must be an object");
  const window = o.window as Record<string, unknown>;
  if (!Number.isSafeInteger(window.startRound) || !Number.isSafeInteger(window.endRound)
    || (window.startRound as number) < 1 || (window.endRound as number) < (window.startRound as number)) {
    throw new Error("proximalOutcome.window must be a valid round interval");
  }
  if (!Array.isArray(o.metricContractRefs) || o.metricContractRefs.length === 0) {
    throw new Error("proximalOutcome.metricContractRefs must be non-empty");
  }
  for (const metricRef of o.metricContractRefs as unknown[]) {
    if (metricRef === null || typeof metricRef !== "object") throw new Error("proximal metric ref must be an object");
    const ref = metricRef as Record<string, unknown>;
    if (typeof ref.id !== "string" || ref.id.length === 0
      || typeof ref.version !== "string" || ref.version.length === 0) {
      throw new Error("proximal metric ref id/version must be non-empty");
    }
  }
  if (o.values === null || typeof o.values !== "object" || Array.isArray(o.values)) {
    throw new Error("proximalOutcome.values must be an object");
  }
  const metricValues = Object.values(o.values as Record<string, unknown>);
  for (const metricValue of metricValues) {
    if (metricValue !== null && (typeof metricValue !== "number" || !Number.isFinite(metricValue))) {
      throw new Error("proximalOutcome values must be finite numbers or null");
    }
  }
  if (metricValues.length === 0) throw new Error("proximalOutcome.values must be non-empty");
  if (metricValues.some(value => value === null)
    && (typeof o.missingnessReason !== "string" || o.missingnessReason.length === 0)) {
    throw new Error("proximal outcomes with null values must record missingnessReason");
  }
  const refs = o.metricContractRefs as Array<Record<string, unknown>>;
  if (refs.some(ref => ref.id === PROXIMAL_BELIEF_SUMMARY_CONTRACT.id
    && ref.version === PROXIMAL_BELIEF_SUMMARY_CONTRACT.version)) {
    const values = o.values as Record<string, unknown>;
    const keys = Object.keys(values);
    if (keys.length !== 2 || !keys.includes("meanConfidence") || !keys.includes("beliefSpread")) {
      throw new Error("belief-summary proximal outcome must contain meanConfidence and beliefSpread");
    }
    if (values.meanConfidence !== null
      && ((values.meanConfidence as number) < 0 || (values.meanConfidence as number) > 1)) {
      throw new Error("proximal meanConfidence must be within [0,1]");
    }
    if (values.beliefSpread !== null && (values.beliefSpread as number) < 0) {
      throw new Error("proximal beliefSpread must be non-negative");
    }
  }
}

/** 任务结果校验：quality 为 null 时必须是 unresolved/invalid。 */
export function validateTaskOutcome(value: unknown): asserts value is TaskOutcomeRecord {
  if (value === null || typeof value !== "object") {
    throw new Error("TaskOutcomeRecord must be a non-null object");
  }
  const o = value as Record<string, unknown>;
  if (typeof o.runAssignmentId !== "string" || o.runAssignmentId.length === 0) {
    throw new Error("taskOutcome.runAssignmentId must be non-empty");
  }
  const statuses = ["scored", "unresolved", "invalid"];
  if (typeof o.status !== "string" || !statuses.includes(o.status)) {
    throw new Error(`taskOutcome.status must be one of ${statuses.join(", ")}`);
  }
  if (o.quality === null && o.status === "scored") {
    throw new Error("scored taskOutcome must not have null quality");
  }
  if (o.status === "scored" && (typeof o.quality !== "number" || !Number.isFinite(o.quality))) {
    throw new Error("scored taskOutcome quality must be finite");
  }
  if (o.status !== "scored" && o.quality !== null) {
    throw new Error("unresolved/invalid taskOutcome quality must be null");
  }
  if (o.evaluationContractRef === null || typeof o.evaluationContractRef !== "object") {
    throw new Error("taskOutcome.evaluationContractRef must be an object");
  }
  const ref = o.evaluationContractRef as Record<string, unknown>;
  if (typeof ref.id !== "string" || ref.id.length === 0
    || typeof ref.version !== "string" || ref.version.length === 0) {
    throw new Error("taskOutcome evaluation contract id/version must be non-empty");
  }
  if (o.sourceFinalOutcomeRef !== undefined) {
    if (o.sourceFinalOutcomeRef === null || typeof o.sourceFinalOutcomeRef !== "object"
      || Array.isArray(o.sourceFinalOutcomeRef)) {
      throw new Error("taskOutcome.sourceFinalOutcomeRef must be an object when present");
    }
    const source = o.sourceFinalOutcomeRef as Record<string, unknown>;
    if (typeof source.id !== "string" || source.id.length === 0
      || typeof source.version !== "string" || source.version.length === 0
      || typeof source.runId !== "string" || source.runId.length === 0) {
      throw new Error("taskOutcome source final-outcome id/version/runId must be non-empty");
    }
  }
  if (o.cost === null || typeof o.cost !== "object" || Array.isArray(o.cost)) {
    throw new Error("taskOutcome.cost must be an object");
  }
  for (const costValue of Object.values(o.cost as Record<string, unknown>)) {
    if (typeof costValue !== "number" || !Number.isFinite(costValue) || costValue < 0) {
      throw new Error("taskOutcome costs must be non-negative finite numbers");
    }
  }
}
