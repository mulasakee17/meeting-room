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
  interventionId?: string;
  status: "applied" | "held_out" | "failed" | "inapplicable";
  appliedAtRound?: number;
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
  const statuses = ["applied", "held_out", "failed", "inapplicable"];
  if (typeof r.status !== "string" || !statuses.includes(r.status)) {
    throw new Error(`receipt.status must be one of ${statuses.join(", ")}`);
  }
  if (r.status === "applied") {
    if (typeof r.appliedAtRound !== "number" || !Number.isSafeInteger(r.appliedAtRound) || r.appliedAtRound < 1) {
      throw new Error("applied receipt must record appliedAtRound >= 1");
    }
  }
  if (r.status === "failed") {
    if (typeof r.failureCode !== "string" || r.failureCode.length === 0) {
      throw new Error("failed receipt must record failureCode");
    }
  }
  if (r.effectiveWindow !== null && r.effectiveWindow !== undefined) {
    const window = r.effectiveWindow as Record<string, unknown>;
    if (typeof window.startRound !== "number" || typeof window.endRound !== "number"
      || (window.endRound as number) < (window.startRound as number)) {
      throw new Error("effectiveWindow must be a non-decreasing round interval");
    }
  }
  if (!Array.isArray(r.targetAgentIds) || r.targetAgentIds.some(id => typeof id !== "string")) {
    throw new Error("receipt.targetAgentIds must be an array of strings");
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
}
