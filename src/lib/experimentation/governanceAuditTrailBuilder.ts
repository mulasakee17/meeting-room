import type {
  GovernanceActionInstance,
  GovernanceActionTransition,
  GovernanceDecisionRecord,
  GovernanceDiagnosisRecord,
  GovernanceEventAssignment,
  InterventionContract,
} from "../governance";
import {
  validateGovernanceAuditTrail,
  type GovernanceAuditTrail,
  type GovernanceObservationRecord,
  type GovernanceRuleSnapshot,
  type GovernanceSourceEvent,
} from "./governanceAuditTrail";
import type { GovernanceStudyContract } from "./governanceStudy";

export interface GovernanceAuditAppendBatch {
  sourceEvents?: GovernanceSourceEvent[];
  observations?: GovernanceObservationRecord[];
  diagnoses?: GovernanceDiagnosisRecord[];
  eventAssignments?: GovernanceEventAssignment[];
  decisions?: GovernanceDecisionRecord[];
  actionInstances?: GovernanceActionInstance[];
  actionTransitions?: GovernanceActionTransition[];
}

export interface GovernanceAuditTrailBuilderInput {
  runId: string;
  studyContract: GovernanceStudyContract;
  ruleSnapshots: GovernanceRuleSnapshot[];
  interventionContracts: InterventionContract[];
  createdAt: string;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function batchSize(batch: GovernanceAuditAppendBatch): number {
  return (batch.sourceEvents?.length ?? 0)
    + (batch.observations?.length ?? 0)
    + (batch.diagnoses?.length ?? 0)
    + (batch.eventAssignments?.length ?? 0)
    + (batch.decisions?.length ?? 0)
    + (batch.actionInstances?.length ?? 0)
    + (batch.actionTransitions?.length ?? 0);
}

/**
 * Runtime construction boundary for a governance audit artifact.
 *
 * Every commit is validated on a staged clone before it becomes visible. This
 * gives the in-process trail append-only and batch-atomic semantics. It does
 * not provide durable storage atomicity or an external authenticity
 * commitment; those belong to the campaign artifact store.
 */
export class GovernanceAuditTrailBuilder {
  private trail: GovernanceAuditTrail;

  constructor(input: GovernanceAuditTrailBuilderInput) {
    this.trail = {
      artifactType: "swarmalpha.governance-audit-trail",
      schemaVersion: "1.0.0",
      runId: input.runId,
      status: "open",
      studyContract: clone(input.studyContract),
      ruleSnapshots: clone(input.ruleSnapshots),
      interventionContracts: clone(input.interventionContracts),
      sourceEvents: [],
      observations: [],
      diagnoses: [],
      eventAssignments: [],
      decisions: [],
      actionInstances: [],
      actionTransitions: [],
      createdAt: input.createdAt,
    };
    validateGovernanceAuditTrail(this.trail);
  }

  commit(batch: GovernanceAuditAppendBatch): GovernanceAuditTrail {
    this.assertOpen();
    if (!batch || batchSize(batch) === 0) {
      throw new Error("governance audit commit batch must be non-empty");
    }

    const staged = clone(this.trail);
    // Fixed topological append order lets one batch introduce a complete
    // source -> observation -> diagnosis -> decision -> action chain.
    staged.sourceEvents.push(...clone(batch.sourceEvents ?? []));
    staged.observations.push(...clone(batch.observations ?? []));
    staged.diagnoses.push(...clone(batch.diagnoses ?? []));
    staged.decisions.push(...clone(batch.decisions ?? []));
    staged.eventAssignments.push(...clone(batch.eventAssignments ?? []));
    staged.actionInstances.push(...clone(batch.actionInstances ?? []));
    staged.actionTransitions.push(...clone(batch.actionTransitions ?? []));

    validateGovernanceAuditTrail(staged);
    this.trail = staged;
    return this.snapshot();
  }

  seal(sealedAt: string): GovernanceAuditTrail {
    this.assertOpen();
    const staged = clone(this.trail);
    staged.status = "sealed";
    staged.sealedAt = sealedAt;
    validateGovernanceAuditTrail(staged);
    this.trail = staged;
    return this.snapshot();
  }

  snapshot(): GovernanceAuditTrail {
    return clone(this.trail);
  }

  private assertOpen(): void {
    if (this.trail.status !== "open") {
      throw new Error("sealed governance audit trail is immutable");
    }
  }
}
