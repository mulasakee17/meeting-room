import {
  governanceRefKey,
  validateGovernanceRef,
  validateReplayableGovernanceValue,
  type VersionedGovernanceRef,
} from "./controlContracts";

export type GovernanceActionState =
  | "proposed"
  | "eligible"
  | "assigned"
  | "queued"
  | "delivered"
  | "compliance_observed"
  | "compliance_unobservable"
  | "completed"
  | "censored"
  | "held_out"
  | "inapplicable"
  | "failed";

export interface GovernanceActionInstance {
  id: string;
  decisionId: string;
  actionRef: VersionedGovernanceRef;
  targetIds: string[];
  sourceDiagnosisIds: string[];
  parameters: Record<string, unknown>;
  expectedCost: Record<string, number>;
  assignmentId?: string;
  plannedWindow: { startRound: number; endRound: number };
  createdAt: string;
}

export interface GovernanceActionTransition {
  id: string;
  actionInstanceId: string;
  from: GovernanceActionState | null;
  to: GovernanceActionState;
  round: number;
  occurredAt: string;
  sourceEventIds: string[];
  /** Delivery/compliance telemetry only; never an effectiveness claim. */
  observation?: Record<string, string | number | boolean | null>;
  failureCode?: string;
}

const TRANSITIONS: Readonly<Record<GovernanceActionState, readonly GovernanceActionState[]>> = Object.freeze({
  proposed: ["eligible", "inapplicable", "failed"],
  eligible: ["assigned", "held_out", "inapplicable", "failed"],
  assigned: ["queued", "delivered", "censored", "failed"],
  queued: ["delivered", "censored", "failed"],
  delivered: ["compliance_observed", "compliance_unobservable", "censored", "failed"],
  compliance_observed: ["completed", "censored", "failed"],
  compliance_unobservable: ["completed", "censored", "failed"],
  completed: [],
  censored: [],
  held_out: [],
  inapplicable: [],
  failed: [],
});

function clone<T>(value: T): T {
  return structuredClone(value);
}

function requireUniqueNonEmpty(values: readonly string[], field: string): void {
  if (values.some(value => typeof value !== "string" || value.trim().length === 0)) {
    throw new Error(`${field} must contain only non-empty strings`);
  }
  if (new Set(values).size !== values.length) throw new Error(`${field} must not contain duplicates`);
}

function validateWindow(window: { startRound: number; endRound: number }): void {
  if (!Number.isSafeInteger(window.startRound)
    || !Number.isSafeInteger(window.endRound)
    || window.startRound < 1
    || window.endRound < window.startRound) {
    throw new Error("actionInstance.plannedWindow must be a positive ordered round interval");
  }
}

function requireTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} must be an ISO-compatible timestamp`);
  }
}

export function validateGovernanceActionInstance(instance: GovernanceActionInstance): void {
  if (instance.id.trim().length === 0) throw new Error("actionInstance.id must be non-empty");
  if (instance.decisionId.trim().length === 0) throw new Error("actionInstance.decisionId must be non-empty");
  validateGovernanceRef(instance.actionRef, "actionInstance.actionRef");
  requireUniqueNonEmpty(instance.targetIds, "actionInstance.targetIds");
  requireUniqueNonEmpty(instance.sourceDiagnosisIds, "actionInstance.sourceDiagnosisIds");
  validateReplayableGovernanceValue(instance.parameters, "actionInstance.parameters");
  if (!instance.expectedCost || typeof instance.expectedCost !== "object" || Array.isArray(instance.expectedCost)) {
    throw new Error("actionInstance.expectedCost must be an object");
  }
  for (const [dimension, value] of Object.entries(instance.expectedCost)) {
    if (dimension.trim().length === 0 || !Number.isFinite(value) || value < 0) {
      throw new Error("actionInstance.expectedCost must contain non-negative finite values");
    }
  }
  if (instance.assignmentId !== undefined && instance.assignmentId.trim().length === 0) {
    throw new Error("actionInstance.assignmentId must be non-empty when present");
  }
  validateWindow(instance.plannedWindow);
  requireTimestamp(instance.createdAt, "actionInstance.createdAt");
}

export function validateGovernanceActionTransition(transition: GovernanceActionTransition): void {
  if (transition.id.trim().length === 0) throw new Error("actionTransition.id must be non-empty");
  if (transition.actionInstanceId.trim().length === 0) {
    throw new Error("actionTransition.actionInstanceId must be non-empty");
  }
  const states = Object.keys(TRANSITIONS) as GovernanceActionState[];
  if (!states.includes(transition.to)) throw new Error("actionTransition.to is invalid");
  if (transition.from !== null && !states.includes(transition.from)) {
    throw new Error("actionTransition.from is invalid");
  }
  if (!Number.isSafeInteger(transition.round) || transition.round < 1) {
    throw new Error("actionTransition.round must be a positive safe integer");
  }
  requireTimestamp(transition.occurredAt, "actionTransition.occurredAt");
  requireUniqueNonEmpty(transition.sourceEventIds, "actionTransition.sourceEventIds");
  if (transition.to === "failed") {
    if (!transition.failureCode || transition.failureCode.trim().length === 0) {
      throw new Error("failed action transition must record failureCode");
    }
  } else if (transition.failureCode !== undefined) {
    throw new Error("only failed action transition may record failureCode");
  }
  if (transition.to === "compliance_observed" && transition.observation === undefined) {
    throw new Error("compliance_observed transition must record an observation");
  }
  if (transition.to === "censored" && transition.observation === undefined) {
    throw new Error("censored action transition must record censoring observation");
  }
}

/**
 * Append-only action ledger. `completed` means that the declared observation
 * window closed successfully; it never means that the action was effective.
 */
export class GovernanceActionLedger {
  private readonly instances = new Map<string, GovernanceActionInstance>();
  private readonly transitions = new Map<string, GovernanceActionTransition[]>();
  private readonly transitionIds = new Set<string>();

  register(instance: GovernanceActionInstance, initialTransition: GovernanceActionTransition): void {
    validateGovernanceActionInstance(instance);
    validateGovernanceActionTransition(initialTransition);
    if (this.instances.has(instance.id)) throw new Error(`Action instance ${instance.id} already exists`);
    if (initialTransition.actionInstanceId !== instance.id
      || initialTransition.from !== null
      || initialTransition.to !== "proposed") {
      throw new Error("action registration requires a null -> proposed initial transition");
    }
    if (this.transitionIds.has(initialTransition.id)) {
      throw new Error(`Action transition ${initialTransition.id} already exists`);
    }
    this.instances.set(instance.id, clone(instance));
    this.transitions.set(instance.id, [clone(initialTransition)]);
    this.transitionIds.add(initialTransition.id);
  }

  append(transition: GovernanceActionTransition): void {
    validateGovernanceActionTransition(transition);
    const instance = this.instances.get(transition.actionInstanceId);
    if (!instance) throw new Error(`Unknown action instance ${transition.actionInstanceId}`);
    if (this.transitionIds.has(transition.id)) throw new Error(`Action transition ${transition.id} already exists`);
    const history = this.transitions.get(instance.id)!;
    const previous = history[history.length - 1];
    if (transition.from !== previous.to) {
      throw new Error(`Action transition ${transition.id} expected from=${previous.to}`);
    }
    if (!TRANSITIONS[previous.to].includes(transition.to)) {
      throw new Error(`Illegal action transition ${previous.to} -> ${transition.to}`);
    }
    if (transition.round < previous.round) {
      throw new Error("action transition rounds must be non-decreasing");
    }
    if ((transition.to === "assigned" || transition.to === "held_out") && !instance.assignmentId) {
      throw new Error(`${transition.to} action transition requires instance.assignmentId`);
    }
    if (transition.to === "delivered" && transition.round < instance.plannedWindow.startRound) {
      throw new Error("action cannot be delivered before its planned window");
    }
    if (transition.to === "completed" && transition.round < instance.plannedWindow.endRound) {
      throw new Error("action cannot complete before its planned observation window closes");
    }
    history.push(clone(transition));
    this.transitionIds.add(transition.id);
  }

  /** Validate all transitions against a clone before mutating the ledger. */
  commit(transitions: GovernanceActionTransition[]): void {
    const snapshot = clone(transitions);
    const staged = this.clone();
    for (const transition of snapshot) staged.append(transition);
    for (const transition of snapshot) this.append(transition);
  }

  getInstance(id: string): GovernanceActionInstance | undefined {
    const instance = this.instances.get(id);
    return instance ? clone(instance) : undefined;
  }

  getHistory(id: string): GovernanceActionTransition[] {
    return clone(this.transitions.get(id) ?? []);
  }

  getCurrentState(id: string): GovernanceActionState | undefined {
    const history = this.transitions.get(id);
    return history?.[history.length - 1]?.to;
  }

  listInstances(): GovernanceActionInstance[] {
    return [...this.instances.values()]
      .map(clone)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private clone(): GovernanceActionLedger {
    const ledger = new GovernanceActionLedger();
    for (const instance of this.instances.values()) {
      const history = this.transitions.get(instance.id)!;
      ledger.register(instance, history[0]);
      for (const transition of history.slice(1)) ledger.append(transition);
    }
    return ledger;
  }
}

export function describeGovernanceAction(instance: GovernanceActionInstance): string {
  return `${instance.id}:${governanceRefKey(instance.actionRef)}`;
}
