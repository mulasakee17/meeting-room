import {
  governanceRefKey,
  validateGovernancePolicy,
  validateGovernanceRef,
  type GovernancePolicyContract,
  type VersionedGovernanceRef,
} from "../governance/controlContracts";
import {
  computePrimaryAssignmentDesignHash,
  validatePrimaryAssignmentDesignV1,
  validatePrimaryAssignmentManifestV1,
  validatePrimaryAssignmentRecordV1,
  type PrimaryAssignmentDesignV1,
  type PrimaryAssignmentManifestV1,
  type PrimaryAssignmentRecordV1,
} from "./primaryAssignment";

export type GovernanceArchitecture =
  | "legacy_compatibility"
  | "auditable_epistemic_v1";

export type StudyInferenceIntent =
  | "engineering"
  | "exploratory"
  | "confirmatory";

/**
 * Frozen declaration of what a run is allowed to support scientifically.
 *
 * Legacy governance may still be read, replayed, and used for engineering or
 * exploratory comparison. It cannot be relabelled as confirmatory evidence.
 * Confirmatory governance additionally requires an auditable policy snapshot,
 * preregistration identity, run/group-level primary assignment, and an explicit
 * ceiling on event-level causal claims.
 */
export interface GovernanceStudyContract {
  id: string;
  version: string;
  governanceArchitecture: GovernanceArchitecture;
  inferenceIntent: StudyInferenceIntent;
  taskFamilyRef: VersionedGovernanceRef;
  evaluationContractRef: VersionedGovernanceRef;
  artifactSchemaRef: VersionedGovernanceRef;
  governancePolicy?: GovernancePolicyContract;
  preregistrationRef?: VersionedGovernanceRef;
  frozenAt?: string;
  primaryAssignmentUnit?: "run" | "group";
  /** Frozen Stage-1 architecture allocation; distinct from Stage-2 policy actions. */
  primaryAssignmentDesign?: PrimaryAssignmentDesignV1;
  /** Event-level effects remain exploratory until longitudinal interference is modelled. */
  eligibleEventEstimand: "none" | "exploratory_only";
}

const VERSION_RE = /^\d+\.\d+\.\d+$/;

function assertOneOf(value: unknown, allowed: readonly string[], field: string): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${field} is invalid`);
  }
}

export function validateGovernanceStudyContract(
  contract: GovernanceStudyContract,
): void {
  if (!contract || typeof contract.id !== "string" || contract.id.trim().length === 0) {
    throw new Error("governanceStudy.id must be non-empty");
  }
  if (typeof contract.version !== "string" || !VERSION_RE.test(contract.version)) {
    throw new Error("governanceStudy.version must be semantic x.y.z");
  }
  assertOneOf(
    contract.governanceArchitecture,
    ["legacy_compatibility", "auditable_epistemic_v1"],
    "governanceStudy.governanceArchitecture",
  );
  assertOneOf(
    contract.inferenceIntent,
    ["engineering", "exploratory", "confirmatory"],
    "governanceStudy.inferenceIntent",
  );
  assertOneOf(
    contract.eligibleEventEstimand,
    ["none", "exploratory_only"],
    "governanceStudy.eligibleEventEstimand",
  );
  validateGovernanceRef(contract.taskFamilyRef, "governanceStudy.taskFamilyRef");
  validateGovernanceRef(contract.evaluationContractRef, "governanceStudy.evaluationContractRef");
  validateGovernanceRef(contract.artifactSchemaRef, "governanceStudy.artifactSchemaRef");

  if (contract.governanceArchitecture === "legacy_compatibility") {
    if (contract.inferenceIntent === "confirmatory") {
      throw new Error("legacy governance architecture cannot support confirmatory inference");
    }
    if (contract.governancePolicy !== undefined) {
      throw new Error("legacy governance architecture must not claim an auditable governancePolicy");
    }
    if (contract.primaryAssignmentDesign !== undefined) {
      throw new Error("legacy governance architecture must not claim a Stage-1 assignment design");
    }
  } else {
    if (!contract.governancePolicy) {
      throw new Error("auditable epistemic governance requires a governancePolicy snapshot");
    }
    validateGovernancePolicy(contract.governancePolicy);
  }

  if (contract.preregistrationRef !== undefined) {
    validateGovernanceRef(contract.preregistrationRef, "governanceStudy.preregistrationRef");
  }
  if (contract.primaryAssignmentUnit !== undefined) {
    assertOneOf(
      contract.primaryAssignmentUnit,
      ["run", "group"],
      "governanceStudy.primaryAssignmentUnit",
    );
    if (contract.primaryAssignmentUnit === "group") {
      throw new Error("governanceStudy v1 supports run primary assignment only");
    }
  }
  if (contract.frozenAt !== undefined
    && (typeof contract.frozenAt !== "string" || !Number.isFinite(Date.parse(contract.frozenAt)))) {
    throw new Error("governanceStudy.frozenAt must be an ISO-compatible timestamp");
  }
  if (contract.primaryAssignmentDesign !== undefined) {
    validatePrimaryAssignmentDesignV1(contract.primaryAssignmentDesign);
    if (contract.primaryAssignmentUnit !== "run") {
      throw new Error("Stage-1 assignment design v1 requires primaryAssignmentUnit=run");
    }
    if (!contract.preregistrationRef
      || governanceRefKey(contract.primaryAssignmentDesign.preregistrationRef)
        !== governanceRefKey(contract.preregistrationRef)) {
      throw new Error("study and Stage-1 design preregistrationRef must match exactly");
    }
  }

  if (contract.inferenceIntent !== "confirmatory") return;
  if (contract.governanceArchitecture !== "auditable_epistemic_v1") {
    throw new Error("confirmatory governance requires auditable_epistemic_v1 architecture");
  }
  if (!contract.preregistrationRef) {
    throw new Error("confirmatory governance requires preregistrationRef");
  }
  if (!contract.frozenAt || contract.frozenAt.trim().length === 0) {
    throw new Error("confirmatory governance requires frozenAt");
  }
  if (!contract.primaryAssignmentUnit) {
    throw new Error("confirmatory governance requires run/group primaryAssignmentUnit");
  }
  if (!contract.primaryAssignmentDesign) {
    throw new Error("confirmatory governance requires a frozen Stage-1 assignment design");
  }
  if (contract.eligibleEventEstimand !== "exploratory_only") {
    throw new Error("confirmatory governance must label eligible-event effects exploratory_only");
  }
  const policy = contract.governancePolicy!;
  if (policy.controlMode !== "randomized_experiment" || policy.onlineAdaptation !== "forbidden") {
    throw new Error("confirmatory governance requires a frozen randomized policy");
  }
  if (!policy.preregistrationRef
    || governanceRefKey(policy.preregistrationRef) !== governanceRefKey(contract.preregistrationRef)) {
    throw new Error("study and policy preregistrationRef must match exactly");
  }
  if (contract.artifactSchemaRef.id !== "swarmalpha.raw-run"
    || contract.artifactSchemaRef.version !== "5.0.0") {
    throw new Error("confirmatory governance requires swarmalpha.raw-run@5.0.0");
  }
}

export function isConfirmatoryGovernanceStudy(
  contract: GovernanceStudyContract,
): boolean {
  validateGovernanceStudyContract(contract);
  return contract.inferenceIntent === "confirmatory";
}

export function validatePrimaryAssignmentForStudy(
  assignment: PrimaryAssignmentRecordV1,
  contract: GovernanceStudyContract,
): void {
  validateGovernanceStudyContract(contract);
  if (!contract.primaryAssignmentDesign) {
    throw new Error("governance study has no frozen Stage-1 assignment design");
  }
  validatePrimaryAssignmentRecordV1(assignment, contract.primaryAssignmentDesign);
  if (governanceRefKey(assignment.studyRef) !== governanceRefKey(contract)
    || governanceRefKey(assignment.preregistrationRef)
      !== governanceRefKey(contract.preregistrationRef!)) {
    throw new Error("primaryAssignment does not belong to the governance study");
  }
  if (contract.frozenAt && Date.parse(assignment.assignedAt) < Date.parse(contract.frozenAt)) {
    throw new Error("primaryAssignment cannot precede governanceStudy.frozenAt");
  }
}

export function validatePrimaryAssignmentManifestForStudy(
  manifest: PrimaryAssignmentManifestV1,
  contract: GovernanceStudyContract,
): void {
  validateGovernanceStudyContract(contract);
  validatePrimaryAssignmentManifestV1(manifest);
  if (!contract.primaryAssignmentDesign
    || governanceRefKey(manifest.studyRef) !== governanceRefKey(contract)
    || governanceRefKey(manifest.designSnapshot)
      !== governanceRefKey(contract.primaryAssignmentDesign)) {
    throw new Error("primaryAssignmentManifest does not belong to the governance study");
  }
  if (computePrimaryAssignmentDesignHash(manifest.designSnapshot)
    !== computePrimaryAssignmentDesignHash(contract.primaryAssignmentDesign)) {
    throw new Error("primaryAssignmentManifest design snapshot differs from the frozen study design");
  }
  validatePrimaryAssignmentForStudy(manifest.assignment, contract);
}
