import { describe, expect, it } from "vitest";
import {
  MINIMAL_EPISTEMIC_GOVERNANCE_POLICY_V2,
} from "@/lib/governance";
import {
  PRIMARY_ASSIGNMENT_ALGORITHM_V1,
  isConfirmatoryGovernanceStudy,
  validateGovernanceStudyContract,
  type PrimaryAssignmentDesignV1,
  type GovernanceStudyContract,
} from "@/lib/experimentation";

const base = {
  id: "swarmalpha.study.epistemic-pilot",
  version: "1.0.0",
  taskFamilyRef: { id: "swarmalpha.task.distributed-categorical", version: "1.0.0" },
  evaluationContractRef: { id: "swarmalpha.eval.proper-score", version: "1.0.0" },
  artifactSchemaRef: { id: "swarmalpha.raw-run", version: "5.0.0" },
} as const;

const HASH = `sha256:${"a".repeat(64)}`;

function primaryDesign(): PrimaryAssignmentDesignV1 {
  const preregistrationRef = structuredClone(
    MINIMAL_EPISTEMIC_GOVERNANCE_POLICY_V2.preregistrationRef!,
  );
  return {
    id: "swarmalpha.primary-design.epistemic-pilot",
    version: "1.0.0",
    schemaVersion: "1.0.0",
    preregistrationRef,
    unit: "run",
    assignmentAlgorithmRef: structuredClone(PRIMARY_ASSIGNMENT_ALGORITHM_V1),
    seedNamespace: "swarmalpha.epistemic-pilot.primary.v1",
    arms: [
      {
        armRef: { id: "swarmalpha.arm.text-baseline", version: "1.0.0" },
        allocationProbability: 0.34,
        implementationRef: { id: "swarmalpha.runtime.text-baseline", version: "1.0.0" },
        implementationConfigHash: HASH,
        budgetContractRef: { id: "swarmalpha.budget.primary", version: "1.0.0" },
        budgetContractHash: HASH,
      },
      {
        armRef: { id: "swarmalpha.arm.explicit-belief", version: "1.0.0" },
        allocationProbability: 0.33,
        implementationRef: { id: "swarmalpha.runtime.explicit-belief", version: "1.0.0" },
        implementationConfigHash: HASH,
        budgetContractRef: { id: "swarmalpha.budget.primary", version: "1.0.0" },
        budgetContractHash: HASH,
      },
      {
        armRef: { id: "swarmalpha.arm.epistemic-governance", version: "1.0.0" },
        allocationProbability: 0.33,
        implementationRef: { id: "swarmalpha.runtime.epistemic-governance", version: "1.0.0" },
        implementationConfigHash: HASH,
        budgetContractRef: { id: "swarmalpha.budget.primary", version: "1.0.0" },
        budgetContractHash: HASH,
      },
    ],
    stratification: {
      fields: ["model", "taskFamily"],
      missingFieldPolicy: "reject",
      extraFieldPolicy: "reject",
    },
    analysisPopulation: "intention_to_treat",
    primaryEstimandRef: { id: "swarmalpha.estimand.primary-itt", version: "1.0.0" },
    retryPolicy: "reuse_assignment",
  };
}

function confirmatory(): GovernanceStudyContract {
  return {
    ...base,
    governanceArchitecture: "auditable_epistemic_v1",
    inferenceIntent: "confirmatory",
    governancePolicy: structuredClone(MINIMAL_EPISTEMIC_GOVERNANCE_POLICY_V2),
    preregistrationRef: structuredClone(MINIMAL_EPISTEMIC_GOVERNANCE_POLICY_V2.preregistrationRef),
    frozenAt: "2026-08-09T00:00:00.000Z",
    primaryAssignmentUnit: "run",
    primaryAssignmentDesign: primaryDesign(),
    eligibleEventEstimand: "exploratory_only",
  };
}

describe("GovernanceStudyContract", () => {
  it("admits a frozen auditable confirmatory study", () => {
    const contract = confirmatory();
    expect(() => validateGovernanceStudyContract(contract)).not.toThrow();
    expect(isConfirmatoryGovernanceStudy(contract)).toBe(true);
  });

  it("actively quarantines legacy governance from confirmatory inference", () => {
    expect(() => validateGovernanceStudyContract({
      ...base,
      governanceArchitecture: "legacy_compatibility",
      inferenceIntent: "confirmatory",
      primaryAssignmentUnit: "run",
      eligibleEventEstimand: "exploratory_only",
    })).toThrow("legacy governance architecture cannot support confirmatory inference");
  });

  it("requires study and policy preregistration identities to match", () => {
    expect(() => validateGovernanceStudyContract({
      ...confirmatory(),
      preregistrationRef: { id: "swarmalpha.prereg.other", version: "1.0.0" },
    })).toThrow("must match exactly");
  });

  it("prevents event-level effects from silently becoming primary claims", () => {
    expect(() => validateGovernanceStudyContract({
      ...confirmatory(),
      eligibleEventEstimand: "none",
    })).toThrow("eligible-event effects exploratory_only");
  });

  it("fails closed when a confirmatory study carries a mutable or exploratory policy", () => {
    expect(() => validateGovernanceStudyContract({
      ...confirmatory(),
      governancePolicy: {
        ...structuredClone(MINIMAL_EPISTEMIC_GOVERNANCE_POLICY_V2),
        onlineAdaptation: "exploratory_only",
      },
    })).toThrow("confirmatory governance requires a frozen randomized policy");

    expect(() => validateGovernanceStudyContract({
      ...confirmatory(),
      governancePolicy: {
        ...structuredClone(MINIMAL_EPISTEMIC_GOVERNANCE_POLICY_V2),
        controlMode: "operational",
        assignmentDesign: undefined,
      },
    })).toThrow("confirmatory governance requires a frozen randomized policy");
  });

  it("requires a frozen Stage-1 design and rejects unsupported group assignment", () => {
    expect(() => validateGovernanceStudyContract({
      ...confirmatory(),
      primaryAssignmentDesign: undefined,
    })).toThrow("requires a frozen Stage-1 assignment design");

    expect(() => validateGovernanceStudyContract({
      ...confirmatory(),
      primaryAssignmentUnit: "group",
      primaryAssignmentDesign: undefined,
    })).toThrow("supports run primary assignment only");
  });

  it("rejects a Stage-1 design whose preregistration differs from the study", () => {
    const contract = confirmatory();
    contract.primaryAssignmentDesign!.preregistrationRef = {
      id: "swarmalpha.prereg.other",
      version: "1.0.0",
    };
    expect(() => validateGovernanceStudyContract(contract))
      .toThrow("must match exactly");
  });

  it("rejects an invalid frozenAt timestamp", () => {
    expect(() => validateGovernanceStudyContract({
      ...confirmatory(),
      frozenAt: "not-a-date",
    })).toThrow("governanceStudy.frozenAt must be an ISO-compatible timestamp");
  });

  it("rejects a confirmatory study whose artifact schema is not raw-run@5.0.0", () => {
    expect(() => validateGovernanceStudyContract({
      ...confirmatory(),
      artifactSchemaRef: { id: "swarmalpha.raw-run", version: "4.0.0" },
    })).toThrow("confirmatory governance requires swarmalpha.raw-run@5.0.0");
  });

  it("rejects a legacy governance study that claims a Stage-1 design", () => {
    expect(() => validateGovernanceStudyContract({
      ...base,
      governanceArchitecture: "legacy_compatibility",
      inferenceIntent: "exploratory",
      eligibleEventEstimand: "exploratory_only",
      primaryAssignmentDesign: primaryDesign(),
    })).toThrow("legacy governance architecture must not claim a Stage-1 assignment design");
  });

  it("keeps schema 1-4 exploratory studies readable without a Stage-1 design", () => {
    expect(() => validateGovernanceStudyContract({
      ...base,
      artifactSchemaRef: { id: "swarmalpha.raw-run", version: "4.0.0" },
      governanceArchitecture: "auditable_epistemic_v1",
      inferenceIntent: "exploratory",
      governancePolicy: structuredClone(MINIMAL_EPISTEMIC_GOVERNANCE_POLICY_V2),
      eligibleEventEstimand: "exploratory_only",
    })).not.toThrow();
  });
});
