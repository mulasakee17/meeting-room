import { createHash } from "node:crypto";
import {
  defaultBeliefContractRegistry,
  isCategoricalClaim,
  type BeliefContractRegistry,
  validateEpistemicClaim,
} from "../epistemic/contracts";
import { scoreBeliefReport } from "../epistemic/scoring";
import type {
  BeliefValue,
  EpistemicClaim,
} from "../epistemic/types";
import {
  governanceRefKey,
  validateGovernanceRef,
  type VersionedGovernanceRef,
} from "../governance/controlContracts";
import {
  validateGovernanceStudyContract,
  validatePrimaryAssignmentManifestForStudy,
  type GovernanceStudyContract,
} from "./governanceStudy";
import {
  validateFinalOutcomeArtifact,
  type FinalElicitationTerminalStatus,
  type FinalOutcomeArtifactV1,
} from "./finalOutcome";
import type { PrimaryAssignmentManifestV1 } from "./primaryAssignment";

/**
 * The first-paper primary estimand. Its identity is frozen by
 * PrimaryAssignmentDesignV1.primaryEstimandRef before treatment assignment.
 * V1 deliberately supports only a uniform no-information reference so that
 * the reference value is fully derivable from the registered outcome space.
 */
export const OPERATIONAL_POOLED_BRIER_ESTIMAND_V1 = Object.freeze({
  id: "swarmalpha.estimand.operational-pooled-brier",
  version: "1.0.0",
  analysisUnit: "run" as const,
  analysisPopulation: "intention_to_treat" as const,
  claimSelection: "exactly_one_registered_claim" as const,
  referenceDistributionPolicy: "uniform_over_registered_outcomes" as const,
  missingnessPolicy: "reference_distribution_for_non_answered" as const,
  poolingPolicy: "equal_weight_registered_agents" as const,
  properLossPolicy: "registered_claim_contract" as const,
  terminalStatusesUsingReference: [
    "abstained",
    "invalid",
    "unavailable",
  ] as const,
});

export type OperationalOutcomeContractV1 = typeof OPERATIONAL_POOLED_BRIER_ESTIMAND_V1;

export const OPERATIONAL_OUTCOME_ARTIFACT_V1 = Object.freeze({
  id: "swarmalpha.operational-outcome",
  version: "1.0.0",
});

export const OPERATIONAL_ANALYSIS_UNIT_V1 = Object.freeze({
  id: "swarmalpha.operational-analysis-unit",
  version: "1.0.0",
});

/**
 * Pre-assignment commitment to the primary claim and ITT denominator. It
 * deliberately contains no resolution, truth, or agent-private information.
 */
export interface OperationalAnalysisUnitV1 {
  artifactSchemaRef: VersionedGovernanceRef;
  runId: string;
  taskId: string;
  studyRef: VersionedGovernanceRef;
  primaryClaim: EpistemicClaim;
  expectedAgentIds: string[];
  committedAt: string;
  contentHash: string;
}

export interface OperationalPoolContributionV1 {
  agentId: string;
  terminalStatus: FinalElicitationTerminalStatus;
  valueSource: "reported" | "reference_distribution";
  value: BeliefValue;
}

export interface OperationalClaimOutcomeV1 {
  claimId: string;
  registeredAgentCount: number;
  answeredAgentCount: number;
  terminalStatusCounts: Record<FinalElicitationTerminalStatus, number>;
  referenceDistribution: BeliefValue;
  contributions: OperationalPoolContributionV1[];
  pooledBelief: BeliefValue;
  operationalProperLoss: number;
}

/**
 * Self-addressed, replayable primary-outcome projection. This is internally
 * tamper-evident, not externally timestamped or tamper-proof.
 */
export interface OperationalOutcomeArtifactV1 {
  artifactSchemaRef: VersionedGovernanceRef;
  runId: string;
  taskId: string;
  studyRef: VersionedGovernanceRef;
  primaryAssignmentId: string;
  assignedArmRef: VersionedGovernanceRef;
  primaryAssignmentManifestHash: string;
  analysisUnitHash: string;
  estimandContract: OperationalOutcomeContractV1;
  sourceFinalOutcomeHash: string;
  computedAt: string;
  claimOutcome: OperationalClaimOutcomeV1;
  primaryMetric: {
    metricRef: VersionedGovernanceRef;
    value: number;
    direction: "lower_is_better";
  };
  contentHash: string;
}

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const TERMINAL_STATUSES: readonly FinalElicitationTerminalStatus[] = [
  "answered",
  "abstained",
  "invalid",
  "unavailable",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalize(value: unknown, path = "value", ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} must contain only finite numbers`);
    return value;
  }
  if (typeof value !== "object") throw new Error(`${path} must contain only JSON data`);
  const objectValue = value as object;
  if (ancestors.has(objectValue)) throw new Error(`${path} must not contain cycles`);
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(objectValue);
  if (Array.isArray(value)) {
    const ownKeys = Reflect.ownKeys(value).filter(key => key !== "length");
    const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index));
    if (ownKeys.length !== expectedKeys.length
      || ownKeys.some((key, index) => typeof key !== "string" || key !== expectedKeys[index])) {
      throw new Error(`${path} arrays must contain only canonical index properties`);
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        throw new Error(`${path} must contain only enumerable data elements`);
      }
    }
    return value.map((child, index) => canonicalize(child, `${path}[${index}]`, nextAncestors));
  }
  if (!isPlainObject(value)) throw new Error(`${path} must contain only plain objects`);
  const output: Record<string, unknown> = {};
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some(key => typeof key !== "string")) {
    throw new Error(`${path} must not contain symbol properties`);
  }
  for (const key of (ownKeys as string[]).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${path}.${key} must be an enumerable data property`);
    }
    output[key] = canonicalize(descriptor.value, `${path}.${key}`, nextAncestors);
  }
  return output;
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function hashCanonical(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value), "utf8").digest("hex")}`;
}

function requireTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${field} must be a canonical ISO timestamp`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${field} must be a canonical ISO timestamp`);
  }
}

function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be non-empty`);
  }
}

function refsEqual(left: unknown, right: unknown): boolean {
  try {
    validateGovernanceRef(left as VersionedGovernanceRef, "leftRef");
    validateGovernanceRef(right as VersionedGovernanceRef, "rightRef");
    return governanceRefKey(left as VersionedGovernanceRef)
      === governanceRefKey(right as VersionedGovernanceRef);
  } catch {
    return false;
  }
}

export function validateOperationalOutcomeContractV1(
  value: unknown,
): asserts value is OperationalOutcomeContractV1 {
  if (stableJson(value) !== stableJson(OPERATIONAL_POOLED_BRIER_ESTIMAND_V1)) {
    throw new Error("operationalOutcome estimand contract must exactly match the registered v1 contract");
  }
}

function operationalAnalysisUnitBody(
  artifact: OperationalAnalysisUnitV1,
): Omit<OperationalAnalysisUnitV1, "contentHash"> {
  const { contentHash: _contentHash, ...body } = artifact;
  return body;
}

export function computeOperationalAnalysisUnitHashV1(
  artifact: Omit<OperationalAnalysisUnitV1, "contentHash">,
): string {
  return hashCanonical(artifact);
}

export function createOperationalAnalysisUnitV1(input: {
  runId: string;
  taskId: string;
  studyRef: VersionedGovernanceRef;
  primaryClaim: EpistemicClaim;
  expectedAgentIds: readonly string[];
  committedAt: string;
}): OperationalAnalysisUnitV1 {
  const body: Omit<OperationalAnalysisUnitV1, "contentHash"> = {
    artifactSchemaRef: structuredClone(OPERATIONAL_ANALYSIS_UNIT_V1),
    runId: input.runId,
    taskId: input.taskId,
    studyRef: structuredClone(input.studyRef),
    primaryClaim: structuredClone(input.primaryClaim),
    expectedAgentIds: [...input.expectedAgentIds],
    committedAt: input.committedAt,
  };
  const artifact = {
    ...body,
    contentHash: computeOperationalAnalysisUnitHashV1(body),
  };
  validateOperationalAnalysisUnitV1(artifact);
  return artifact;
}

export function validateOperationalAnalysisUnitV1(
  artifact: OperationalAnalysisUnitV1,
): void {
  if (!artifact || !refsEqual(artifact.artifactSchemaRef, OPERATIONAL_ANALYSIS_UNIT_V1)) {
    throw new Error("operationalAnalysisUnit artifact schema ref is invalid");
  }
  requireNonEmpty(artifact.runId, "operationalAnalysisUnit.runId");
  requireNonEmpty(artifact.taskId, "operationalAnalysisUnit.taskId");
  const expectedKeys = [
    "artifactSchemaRef",
    "committedAt",
    "contentHash",
    "expectedAgentIds",
    "primaryClaim",
    "runId",
    "studyRef",
    "taskId",
  ];
  if (stableJson(Object.keys(artifact).sort()) !== stableJson(expectedKeys)) {
    throw new Error("operationalAnalysisUnit contains unexpected or missing fields");
  }
  validateGovernanceRef(artifact.studyRef, "operationalAnalysisUnit.studyRef");
  validateEpistemicClaim(artifact.primaryClaim, defaultBeliefContractRegistry);
  requireTimestamp(artifact.primaryClaim.createdAt, "operationalAnalysisUnit.primaryClaim.createdAt");
  requireTimestamp(artifact.committedAt, "operationalAnalysisUnit.committedAt");
  if (Date.parse(artifact.primaryClaim.createdAt) > Date.parse(artifact.committedAt)) {
    throw new Error("operationalAnalysisUnit cannot precede primary-claim registration");
  }
  if (!Array.isArray(artifact.expectedAgentIds) || artifact.expectedAgentIds.length === 0
    || artifact.expectedAgentIds.some(agentId => typeof agentId !== "string" || agentId.trim().length === 0)
    || new Set(artifact.expectedAgentIds).size !== artifact.expectedAgentIds.length) {
    throw new Error("operationalAnalysisUnit expectedAgentIds must be unique non-empty strings");
  }
  if (typeof artifact.contentHash !== "string" || !SHA256_RE.test(artifact.contentHash)
    || artifact.contentHash !== computeOperationalAnalysisUnitHashV1(operationalAnalysisUnitBody(artifact))) {
    throw new Error("operationalAnalysisUnit contentHash mismatch");
  }
}

export function deriveOperationalReferenceDistributionV1(
  claim: EpistemicClaim,
): BeliefValue {
  const contractRegistry = defaultBeliefContractRegistry;
  const contract = contractRegistry.get(claim.resolutionPolicy.kind);
  contract.validateClaim(claim);
  if (claim.resolutionPolicy.kind === "binary") {
    return contract.normalizeValue(claim, { kind: "binary", probability: 0.5 });
  }
  if (!isCategoricalClaim(claim)) {
    throw new Error("operationalOutcome received an unsupported categorical claim");
  }
  const probability = 1 / claim.options.length;
  return contract.normalizeValue(claim, {
    kind: "categorical",
    probabilities: Object.fromEntries(claim.options.map(option => [option, probability])),
  });
}

function averageBeliefs(
  claim: EpistemicClaim,
  values: readonly BeliefValue[],
  contractRegistry: BeliefContractRegistry,
): BeliefValue {
  if (values.length === 0) throw new Error("operationalOutcome requires registered agents");
  const contract = contractRegistry.get(claim.resolutionPolicy.kind);
  const normalized = values.map(value => contract.normalizeValue(claim, value));
  if (claim.resolutionPolicy.kind === "binary") {
    const total = normalized.reduce((sum, value) => {
      if (value.kind !== "binary") throw new Error("operationalOutcome binary value mismatch");
      return sum + value.probability;
    }, 0);
    return contract.normalizeValue(claim, { kind: "binary", probability: total / normalized.length });
  }
  if (!isCategoricalClaim(claim)) {
    throw new Error("operationalOutcome received an unsupported categorical claim");
  }
  const probabilities = Object.fromEntries(claim.options.map(option => [option, 0]));
  for (const value of normalized) {
    if (value.kind !== "categorical") throw new Error("operationalOutcome categorical value mismatch");
    for (const option of claim.options) probabilities[option] += value.probabilities[option] / normalized.length;
  }
  return contract.normalizeValue(claim, { kind: "categorical", probabilities });
}

function deriveClaimOutcome(input: {
  finalOutcome: FinalOutcomeArtifactV1;
}): OperationalClaimOutcomeV1 {
  if (input.finalOutcome.claims.length !== 1) {
    throw new Error("operationalOutcome v1 requires exactly one registered primary claim");
  }
  const claim = input.finalOutcome.claims[0];
  const resolution = input.finalOutcome.resolutions.find(candidate => candidate.claimId === claim.id);
  if (!resolution) throw new Error(`operationalOutcome is missing resolution for claim ${claim.id}`);
  const recordByAgent = new Map(input.finalOutcome.elicitationRecords.map(record => [record.agentId, record]));
  const referenceDistribution = deriveOperationalReferenceDistributionV1(claim);
  const terminalStatusCounts: Record<FinalElicitationTerminalStatus, number> = {
    answered: 0,
    abstained: 0,
    invalid: 0,
    unavailable: 0,
  };
  const contributions = input.finalOutcome.expectedAgentIds.map(agentId => {
    const record = recordByAgent.get(agentId);
    if (!record) throw new Error(`operationalOutcome is missing terminal record for agent ${agentId}`);
    terminalStatusCounts[record.status] += 1;
    const report = record.reports.find(candidate => candidate.claimId === claim.id);
    if (record.status === "answered") {
      if (!report) throw new Error(`operationalOutcome answered agent ${agentId} has no primary-claim report`);
      return {
        agentId,
        terminalStatus: record.status,
        valueSource: "reported" as const,
        value: defaultBeliefContractRegistry.get(claim.resolutionPolicy.kind).normalizeValue(claim, report.value),
      };
    }
    if (report) throw new Error(`operationalOutcome non-answered agent ${agentId} cannot contribute a report`);
    return {
      agentId,
      terminalStatus: record.status,
      valueSource: "reference_distribution" as const,
      value: structuredClone(referenceDistribution),
    };
  });
  const pooledBelief = averageBeliefs(
    claim,
    contributions.map(contribution => contribution.value),
    defaultBeliefContractRegistry,
  );
  const operationalProperLoss = scoreBeliefReport(claim, {
    claimId: claim.id,
    value: pooledBelief,
    stake: 0,
  }, resolution, defaultBeliefContractRegistry).properLoss;
  if (!Number.isFinite(operationalProperLoss)) {
    throw new Error("operationalOutcome proper loss must be finite");
  }
  return {
    claimId: claim.id,
    registeredAgentCount: input.finalOutcome.expectedAgentIds.length,
    answeredAgentCount: terminalStatusCounts.answered,
    terminalStatusCounts,
    referenceDistribution: structuredClone(referenceDistribution),
    contributions,
    pooledBelief,
    operationalProperLoss,
  };
}

export function computeFinalOutcomeArtifactHashV1(artifact: FinalOutcomeArtifactV1): string {
  validateFinalOutcomeArtifact(artifact);
  return hashCanonical(artifact);
}

function operationalArtifactBody(
  artifact: OperationalOutcomeArtifactV1,
): Omit<OperationalOutcomeArtifactV1, "contentHash"> {
  const { contentHash: _contentHash, ...body } = artifact;
  return body;
}

export function computeOperationalOutcomeArtifactHashV1(
  artifact: Omit<OperationalOutcomeArtifactV1, "contentHash">,
): string {
  return hashCanonical(artifact);
}

export function createOperationalOutcomeArtifactV1(input: {
  study: GovernanceStudyContract;
  primaryAssignmentManifest: PrimaryAssignmentManifestV1;
  analysisUnit: OperationalAnalysisUnitV1;
  finalOutcome: FinalOutcomeArtifactV1;
  computedAt: string;
}): OperationalOutcomeArtifactV1 {
  validateGovernanceStudyContract(input.study);
  validatePrimaryAssignmentManifestForStudy(input.primaryAssignmentManifest, input.study);
  validateOperationalAnalysisUnitV1(input.analysisUnit);
  validateFinalOutcomeArtifact(input.finalOutcome);
  requireTimestamp(input.computedAt, "operationalOutcome.computedAt");
  const estimandRef = input.primaryAssignmentManifest.designSnapshot.primaryEstimandRef;
  if (!refsEqual(estimandRef, OPERATIONAL_POOLED_BRIER_ESTIMAND_V1)) {
    throw new Error("operationalOutcome requires the frozen operational-pooled-Brier estimand ref");
  }
  if (input.primaryAssignmentManifest.runId !== input.finalOutcome.runId) {
    throw new Error("operationalOutcome runId does not match the primary assignment manifest");
  }
  if (input.analysisUnit.runId !== input.primaryAssignmentManifest.runId
    || !refsEqual(input.analysisUnit.studyRef, input.primaryAssignmentManifest.studyRef)) {
    throw new Error("operationalOutcome analysis unit does not match the assigned run/study");
  }
  if (Date.parse(input.analysisUnit.committedAt)
    > Date.parse(input.primaryAssignmentManifest.assignment.assignedAt)) {
    throw new Error("operationalOutcome analysis unit must be committed before assignment");
  }
  if (input.analysisUnit.taskId !== input.finalOutcome.taskId
    || stableJson(input.analysisUnit.expectedAgentIds) !== stableJson(input.finalOutcome.expectedAgentIds)
    || input.finalOutcome.claims.length !== 1
    || stableJson(input.analysisUnit.primaryClaim) !== stableJson(input.finalOutcome.claims[0])) {
    throw new Error("operationalOutcome final outcome differs from the pre-assignment analysis unit");
  }
  if (Date.parse(input.primaryAssignmentManifest.createdAt)
    > Date.parse(input.finalOutcome.discussionCompleted.completedAt)) {
    throw new Error("operationalOutcome primary assignment manifest must precede discussion completion");
  }
  if (Date.parse(input.computedAt) < Date.parse(input.finalOutcome.scoringCompleted.completedAt)) {
    throw new Error("operationalOutcome cannot precede final-outcome scoring completion");
  }
  const claimOutcome = deriveClaimOutcome({
    finalOutcome: input.finalOutcome,
  });
  const body: Omit<OperationalOutcomeArtifactV1, "contentHash"> = {
    artifactSchemaRef: structuredClone(OPERATIONAL_OUTCOME_ARTIFACT_V1),
    runId: input.finalOutcome.runId,
    taskId: input.finalOutcome.taskId,
    studyRef: { id: input.study.id, version: input.study.version },
    primaryAssignmentId: input.primaryAssignmentManifest.assignment.id,
    assignedArmRef: structuredClone(input.primaryAssignmentManifest.assignment.assignedArmRef),
    primaryAssignmentManifestHash: input.primaryAssignmentManifest.contentHash,
    analysisUnitHash: input.analysisUnit.contentHash,
    estimandContract: structuredClone(OPERATIONAL_POOLED_BRIER_ESTIMAND_V1),
    sourceFinalOutcomeHash: computeFinalOutcomeArtifactHashV1(input.finalOutcome),
    computedAt: input.computedAt,
    claimOutcome,
    primaryMetric: {
      metricRef: {
        id: OPERATIONAL_POOLED_BRIER_ESTIMAND_V1.id,
        version: OPERATIONAL_POOLED_BRIER_ESTIMAND_V1.version,
      },
      value: claimOutcome.operationalProperLoss,
      direction: "lower_is_better",
    },
  };
  return {
    ...body,
    contentHash: computeOperationalOutcomeArtifactHashV1(body),
  };
}

export function validateOperationalOutcomeArtifactV1(
  artifact: OperationalOutcomeArtifactV1,
  input: {
    study: GovernanceStudyContract;
    primaryAssignmentManifest: PrimaryAssignmentManifestV1;
    analysisUnit: OperationalAnalysisUnitV1;
    finalOutcome: FinalOutcomeArtifactV1;
  },
): void {
  if (!artifact || !refsEqual(artifact.artifactSchemaRef, OPERATIONAL_OUTCOME_ARTIFACT_V1)) {
    throw new Error("operationalOutcome artifact schema ref is invalid");
  }
  validateOperationalOutcomeContractV1(artifact.estimandContract);
  if (typeof artifact.contentHash !== "string" || !SHA256_RE.test(artifact.contentHash)
    || artifact.contentHash !== computeOperationalOutcomeArtifactHashV1(operationalArtifactBody(artifact))) {
    throw new Error("operationalOutcome contentHash mismatch");
  }
  const expected = createOperationalOutcomeArtifactV1({
    ...input,
    computedAt: artifact.computedAt,
  });
  if (stableJson(artifact) !== stableJson(expected)) {
    throw new Error("operationalOutcome does not replay from the frozen assignment and final outcome");
  }
}
