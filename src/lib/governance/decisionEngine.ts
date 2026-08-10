import {
  governanceRefKey,
  validateGovernanceActionCandidate,
  validateGovernanceActionAssignmentRef,
  validateGovernanceDecisionRecord,
  validateGovernanceDiagnosis,
  validateGovernancePolicy,
  validateGovernanceRef,
  validateReplayableGovernanceValue,
  validateInterventionContract,
  type GovernanceActionAssignmentRef,
  type GovernanceActionCandidate,
  type GovernanceDecisionRecord,
  type GovernanceDiagnosisRecord,
  type GovernanceEligibilityEvaluation,
  type GovernanceEligibilityRule,
  type GovernancePolicyContract,
  type InterventionContract,
  type VersionedGovernanceRef,
} from "./controlContracts";

export interface GovernanceDecisionRequest {
  id: string;
  policy: GovernancePolicyContract;
  diagnoses: GovernanceDiagnosisRecord[];
  availableBudget: Record<string, number>;
  round: number;
  decidedAt: string;
  sourceEventIds: string[];
  assignment?: GovernanceActionAssignmentRef;
}

function requireUniqueNonEmpty(values: readonly string[], field: string): void {
  if (values.some(value => typeof value !== "string" || value.trim().length === 0)) {
    throw new Error(`${field} must contain only non-empty strings`);
  }
  if (new Set(values).size !== values.length) throw new Error(`${field} must not contain duplicates`);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function finalizeRecord(record: GovernanceDecisionRecord): GovernanceDecisionRecord {
  validateGovernanceDecisionRecord(record);
  return deepFreeze(clone(record));
}

function stableCandidateKey(candidate: GovernanceActionCandidate): string {
  const targets = [...candidate.targetIds].sort().join(",");
  const diagnoses = [...candidate.sourceDiagnosisIds].sort().join(",");
  return `${governanceRefKey(candidate.actionRef)}|${targets}|${diagnoses}`;
}

function compareCandidates(left: GovernanceActionCandidate, right: GovernanceActionCandidate): number {
  if (left.priority !== right.priority) return right.priority - left.priority;
  return stableCandidateKey(left).localeCompare(stableCandidateKey(right));
}

function validateBudget(budget: Record<string, number>, field: string): void {
  for (const [dimension, value] of Object.entries(budget)) {
    if (dimension.trim().length === 0 || !Number.isFinite(value) || value < 0) {
      throw new Error(`${field} must contain non-negative finite values under non-empty dimensions`);
    }
  }
}

function diagnosisPermitsControl(
  diagnosis: GovernanceDiagnosisRecord,
  policy: GovernancePolicyContract,
): boolean {
  if (diagnosis.measurement.observationCompleteness === "missing") return false;
  if (policy.controlMode === "observe_only") return false;
  if (policy.controlMode === "randomized_experiment") {
    if (diagnosis.controlEvidence.status === "experimental_candidate") {
      return policy.preregistrationRef !== undefined
        && governanceRefKey(diagnosis.controlEvidence.preregistrationRef)
          === governanceRefKey(policy.preregistrationRef);
    }
    return diagnosis.controlEvidence.controlUse === "randomized_experiment_only"
      || diagnosis.controlEvidence.controlUse === "operational";
  }
  return diagnosis.controlEvidence.controlUse === "operational";
}

function addCost(target: Record<string, number>, cost: Readonly<Record<string, number>>): void {
  for (const [dimension, value] of Object.entries(cost)) {
    target[dimension] = (target[dimension] ?? 0) + value;
  }
}

function fitsBudget(
  committed: Readonly<Record<string, number>>,
  candidate: Readonly<Record<string, number>>,
  available: Readonly<Record<string, number>>,
): boolean {
  return Object.entries(candidate).every(([dimension, value]) =>
    (committed[dimension] ?? 0) + value <= (available[dimension] ?? 0));
}

function contractsConflict(left: InterventionContract, right: InterventionContract): boolean {
  return left.conflictsWithActionIds.includes(right.id)
    || right.conflictsWithActionIds.includes(left.id);
}

/**
 * Registry and deterministic decision kernel for epistemic governance.
 *
 * It intentionally does not execute actions and does not infer effectiveness.
 * Its only responsibilities are validating control permission, evaluating
 * versioned eligibility rules, enforcing assignment/budget constraints, and
 * producing one replayable policy decision.
 */
export class GovernanceDecisionEngine {
  private readonly actions = new Map<string, InterventionContract>();
  private readonly rules = new Map<string, GovernanceEligibilityRule>();
  private sealed = false;

  registerAction(contract: InterventionContract): void {
    if (this.sealed) throw new Error("GovernanceDecisionEngine registry is sealed");
    validateInterventionContract(contract);
    const key = governanceRefKey(contract);
    if (this.actions.has(key)) throw new Error(`Intervention contract ${key} already exists`);
    this.actions.set(key, clone(contract));
  }

  registerRule(rule: GovernanceEligibilityRule): void {
    if (this.sealed) throw new Error("GovernanceDecisionEngine registry is sealed");
    validateGovernanceRef(rule, "eligibilityRule");
    validateReplayableGovernanceValue(rule.config, "eligibilityRule.config");
    const key = governanceRefKey(rule);
    if (this.rules.has(key)) throw new Error(`Eligibility rule ${key} already exists`);
    this.rules.set(key, Object.freeze({ ...rule }));
  }

  seal(): this {
    this.sealed = true;
    return this;
  }

  listActions(): VersionedGovernanceRef[] {
    return [...this.actions.values()]
      .map(action => ({ id: action.id, version: action.version }))
      .sort((left, right) => governanceRefKey(left).localeCompare(governanceRefKey(right)));
  }

  listRules(): VersionedGovernanceRef[] {
    return [...this.rules.values()]
      .map(rule => ({ id: rule.id, version: rule.version }))
      .sort((left, right) => governanceRefKey(left).localeCompare(governanceRefKey(right)));
  }

  decide(request: GovernanceDecisionRequest): GovernanceDecisionRecord {
    this.validateRequest(request);
    const diagnosisById = new Map(request.diagnoses.map(diagnosis => [diagnosis.id, diagnosis]));
    const evaluations = request.policy.eligibilityRuleRefs
      .map(ref => this.rules.get(governanceRefKey(ref))!)
      .map(rule => {
        const rawEvaluation = clone(rule.evaluate({
          round: request.round,
          diagnoses: request.diagnoses.map(clone),
          availableBudget: clone(request.availableBudget),
        }));
        const evaluation: GovernanceEligibilityEvaluation = {
          ...rawEvaluation,
          ruleConfig: clone(rule.config),
        };
        if (governanceRefKey(evaluation.ruleRef) !== governanceRefKey(rule)) {
          throw new Error(`Eligibility rule ${governanceRefKey(rule)} returned a mismatched ruleRef`);
        }
        return evaluation;
      });

    const eligibleCandidates: GovernanceActionCandidate[] = [];
    for (const evaluation of evaluations) {
      this.validateEvaluation(evaluation, diagnosisById);
      if (!evaluation.eligible || !evaluation.candidate) continue;
      const candidate = evaluation.candidate;
      const action = this.actions.get(governanceRefKey(candidate.actionRef));
      if (!action) throw new Error(`Unknown intervention contract ${governanceRefKey(candidate.actionRef)}`);
      if (!action.eligibilityRuleRefs.some(ref => governanceRefKey(ref) === governanceRefKey(evaluation.ruleRef))) {
        throw new Error(`Action ${governanceRefKey(candidate.actionRef)} does not authorize rule ${governanceRefKey(evaluation.ruleRef)}`);
      }
      if (candidate.targetIds.length < action.targetCardinality.min
        || (action.targetCardinality.max !== undefined
          && candidate.targetIds.length > action.targetCardinality.max)) {
        throw new Error(`Candidate target cardinality violates ${governanceRefKey(candidate.actionRef)}`);
      }
      const parameterKeys = Object.keys(candidate.parameters);
      if (action.parameterContract.required.some(key => !parameterKeys.includes(key))
        || parameterKeys.some(key => !action.parameterContract.allowed.includes(key))) {
        throw new Error(`Candidate parameters violate ${governanceRefKey(candidate.actionRef)}`);
      }
      const expectedDimensions = [...action.costDimensions].sort();
      const actualDimensions = Object.keys(candidate.expectedCost).sort();
      if (expectedDimensions.length !== actualDimensions.length
        || expectedDimensions.some((dimension, index) => dimension !== actualDimensions[index])) {
        throw new Error(`Candidate cost dimensions must exactly match ${governanceRefKey(candidate.actionRef)}`);
      }
      const permitted = candidate.sourceDiagnosisIds.every(id =>
        diagnosisPermitsControl(diagnosisById.get(id)!, request.policy));
      if (!permitted) continue;
      eligibleCandidates.push(clone(candidate));
    }
    eligibleCandidates.sort(compareCandidates);
    const seenCandidates = new Set<string>();
    const uniqueCandidates = eligibleCandidates.filter(candidate => {
      const key = stableCandidateKey(candidate);
      if (seenCandidates.has(key)) return false;
      seenCandidates.add(key);
      return true;
    });

    const base = {
      id: request.id,
      policyRef: { id: request.policy.id, version: request.policy.version },
      round: request.round,
      diagnosisIds: request.diagnoses.map(diagnosis => diagnosis.id).sort(),
      evaluations,
      candidateActions: uniqueCandidates,
      selectedActions: [] as GovernanceActionCandidate[],
      budgetBefore: clone(request.availableBudget),
      budgetCommitted: {} as Record<string, number>,
      sourceEventIds: [...request.sourceEventIds].sort(),
      decidedAt: request.decidedAt,
      ...(request.assignment ? { assignment: clone(request.assignment) } : {}),
    };

    if (request.policy.controlMode === "observe_only") {
      return finalizeRecord({
        ...base,
        outcome: "observe_only" as const,
        arbitrationReason: "Policy is observe-only; diagnoses are recorded but cannot select actions.",
      });
    }
    if (uniqueCandidates.length === 0) {
      return finalizeRecord({
        ...base,
        outcome: "no_eligible_action" as const,
        arbitrationReason: "No candidate satisfied both its eligibility rule and the policy control-permission gate.",
      });
    }
    if (request.policy.controlMode === "randomized_experiment" && !request.assignment) {
      return finalizeRecord({
        ...base,
        outcome: "awaiting_assignment" as const,
        arbitrationReason: "Eligible experimental actions require a recorded assignment before selection.",
      });
    }

    if (request.assignment) {
      const primaryRandomization = this.actions
        .get(governanceRefKey(uniqueCandidates[0].actionRef))!.randomization;
      if (request.assignment.unitKind !== primaryRandomization.unit) {
        throw new Error(`Assignment unit ${request.assignment.unitKind} does not match the primary candidate`);
      }
      const primaryAssignmentKind = request.assignment.assignedArm === primaryRandomization.applyArm
        ? "apply"
        : request.assignment.assignedArm === primaryRandomization.holdoutArm
          ? "holdout"
          : request.assignment.assignedArm === primaryRandomization.shamArm
            ? "sham"
            : "unknown";
      if (primaryAssignmentKind === "unknown") {
        throw new Error(`Assignment arm ${request.assignment.assignedArm} is not registered for eligible candidates`);
      }
      if (primaryAssignmentKind === "holdout") {
        return finalizeRecord({
          ...base,
          outcome: "held_out" as const,
          arbitrationReason: `Assignment ${request.assignment.id} selected the registered holdout arm.`,
        });
      }
    }

    const assignmentCompatible = this.resolveAssignmentCandidates(uniqueCandidates, request.assignment);
    const selected: GovernanceActionCandidate[] = [];
    const selectedContracts: InterventionContract[] = [];
    const committed: Record<string, number> = {};
    for (const candidate of assignmentCompatible) {
      if (selected.length >= request.policy.maxActionsPerDecision) break;
      const contract = this.actions.get(governanceRefKey(candidate.actionRef))!;
      if (selectedContracts.some(existing => contractsConflict(existing, contract))) continue;
      if (!fitsBudget(committed, candidate.expectedCost, request.availableBudget)) continue;
      selected.push(candidate);
      selectedContracts.push(contract);
      addCost(committed, candidate.expectedCost);
    }

    if (selected.length === 0) {
      return finalizeRecord({
        ...base,
        outcome: "no_eligible_action" as const,
        arbitrationReason: "Eligible candidates were blocked by assignment compatibility, conflicts, or budget.",
      });
    }
    return finalizeRecord({
      ...base,
      selectedActions: selected,
      budgetCommitted: committed,
      outcome: "selected" as const,
      arbitrationReason: "Selected deterministically by priority, stable identity, conflict constraints, and available budget.",
    });
  }

  private resolveAssignmentCandidates(
    candidates: GovernanceActionCandidate[],
    assignment: GovernanceActionAssignmentRef | undefined,
  ): GovernanceActionCandidate[] {
    if (!assignment) return candidates;
    const resolved: GovernanceActionCandidate[] = [];
    for (const candidate of candidates) {
      const contract = this.actions.get(governanceRefKey(candidate.actionRef))!;
      const randomization = contract.randomization;
      if (assignment.unitKind !== randomization.unit) continue;
      if (assignment.assignedArm === randomization.applyArm) {
        resolved.push(candidate);
        continue;
      }
      if (randomization.shamArm && assignment.assignedArm === randomization.shamArm) {
        const shamRef = randomization.shamActionRef!;
        const sham = this.actions.get(governanceRefKey(shamRef));
        if (!sham) throw new Error(`Unknown sham intervention contract ${governanceRefKey(shamRef)}`);
        const parameters = Object.fromEntries(
          Object.entries(candidate.parameters)
            .filter(([key]) => sham.parameterContract.allowed.includes(key)),
        );
        if (sham.parameterContract.required.some(key => !(key in parameters))) {
          throw new Error(`Sham action ${governanceRefKey(shamRef)} cannot be constructed from candidate parameters`);
        }
        const expectedDimensions = [...sham.costDimensions].sort();
        const actualDimensions = Object.keys(candidate.expectedCost).sort();
        if (expectedDimensions.length !== actualDimensions.length
          || expectedDimensions.some((dimension, index) => dimension !== actualDimensions[index])) {
          throw new Error(`Sham action ${governanceRefKey(shamRef)} is not cost-dimension matched`);
        }
        resolved.push({
          ...clone(candidate),
          actionRef: clone(shamRef),
          parameters,
          rationale: `Assignment-selected sham for ${governanceRefKey(candidate.actionRef)}.`,
        });
        continue;
      }
      // The assignment is defined for the highest-priority candidate. Other
      // candidates with incompatible arm vocabularies are not selected.
    }
    return resolved.sort(compareCandidates);
  }

  private validateRequest(request: GovernanceDecisionRequest): void {
    if (request.id.trim().length === 0) throw new Error("decision.id must be non-empty");
    validateGovernancePolicy(request.policy);
    if (!Number.isSafeInteger(request.round) || request.round < 1) {
      throw new Error("decision.round must be a positive safe integer");
    }
    if (request.decidedAt.trim().length === 0) throw new Error("decision.decidedAt must be non-empty");
    requireUniqueNonEmpty(request.sourceEventIds, "decision.sourceEventIds");
    validateBudget(request.availableBudget, "decision.availableBudget");
    const diagnosisIds = request.diagnoses.map(diagnosis => diagnosis.id);
    requireUniqueNonEmpty(diagnosisIds, "decision.diagnoses");
    for (const diagnosis of request.diagnoses) validateGovernanceDiagnosis(diagnosis);
    for (const ref of request.policy.eligibilityRuleRefs) {
      if (!this.rules.has(governanceRefKey(ref))) {
        throw new Error(`Unknown eligibility rule ${governanceRefKey(ref)}`);
      }
    }
    if (request.assignment) {
      validateGovernanceActionAssignmentRef(request.assignment);
    }
  }

  private validateEvaluation(
    evaluation: GovernanceEligibilityEvaluation,
    diagnosisById: ReadonlyMap<string, GovernanceDiagnosisRecord>,
  ): void {
    validateGovernanceRef(evaluation.ruleRef, "eligibilityEvaluation.ruleRef");
    if (!this.rules.has(governanceRefKey(evaluation.ruleRef))) {
      throw new Error(`Evaluation references unknown rule ${governanceRefKey(evaluation.ruleRef)}`);
    }
    if (evaluation.reason.trim().length === 0) throw new Error("eligibilityEvaluation.reason must be non-empty");
    requireUniqueNonEmpty(evaluation.sourceDiagnosisIds, "eligibilityEvaluation.sourceDiagnosisIds");
    for (const id of evaluation.sourceDiagnosisIds) {
      if (!diagnosisById.has(id)) throw new Error(`Eligibility evaluation references unknown diagnosis ${id}`);
    }
    if (evaluation.eligible !== Boolean(evaluation.candidate)) {
      throw new Error("eligible evaluation must have exactly one candidate; ineligible evaluation must have none");
    }
    if (evaluation.candidate) {
      validateGovernanceActionCandidate(evaluation.candidate);
      if (evaluation.candidate.sourceDiagnosisIds.length !== evaluation.sourceDiagnosisIds.length
        || evaluation.candidate.sourceDiagnosisIds.some(id => !evaluation.sourceDiagnosisIds.includes(id))) {
        throw new Error("candidate.sourceDiagnosisIds must exactly match its eligibility evaluation");
      }
    }
  }
}
