import { createHash } from "node:crypto";
import {
  governanceRefKey,
  validateGovernanceRef,
  type VersionedGovernanceRef,
} from "../governance/controlContracts";
import { mulberry32 } from "../utils/statsUtils";

export const PRIMARY_ASSIGNMENT_ALGORITHM_V1 = Object.freeze({
  id: "swarmalpha.primary-assignment.sha256-mulberry32",
  version: "1.0.0",
});

export interface PrimaryAssignmentArmV1 {
  armRef: VersionedGovernanceRef;
  allocationProbability: number;
  implementationRef: VersionedGovernanceRef;
  implementationConfigHash: string;
  budgetContractRef: VersionedGovernanceRef;
  budgetContractHash: string;
}

/** Frozen Stage-1 design. Stage-2 per-action allocation is deliberately separate. */
export interface PrimaryAssignmentDesignV1 {
  id: string;
  version: string;
  schemaVersion: "1.0.0";
  preregistrationRef: VersionedGovernanceRef;
  unit: "run";
  assignmentAlgorithmRef: VersionedGovernanceRef;
  seedNamespace: string;
  arms: PrimaryAssignmentArmV1[];
  stratification: {
    fields: string[];
    missingFieldPolicy: "reject";
    extraFieldPolicy: "reject";
  };
  analysisPopulation: "intention_to_treat";
  primaryEstimandRef: VersionedGovernanceRef;
  retryPolicy: "reuse_assignment";
}

export interface PrimaryAssignmentRecordV1 {
  artifactType: "swarmalpha.primary-assignment";
  schemaVersion: "1.0.0";
  id: string;
  runId: string;
  unitId: string;
  unitKind: "run";
  studyRef: VersionedGovernanceRef;
  designRef: VersionedGovernanceRef;
  designHash: string;
  preregistrationRef: VersionedGovernanceRef;
  assignmentAlgorithmRef: VersionedGovernanceRef;
  seedNamespace: string;
  stratum: Record<string, string | number | boolean>;
  arms: Array<{
    armRef: VersionedGovernanceRef;
    probability: number;
  }>;
  masterSeed: number;
  derivedSeed: number;
  randomDraw: number;
  assignedArmRef: VersionedGovernanceRef;
  assignmentProbability: number;
  assignedAt: string;
}

/** Self-addressed pre-call artifact. Authenticity still requires an external commitment. */
export interface PrimaryAssignmentManifestV1 {
  artifactType: "swarmalpha.primary-assignment-manifest";
  schemaVersion: "1.0.0";
  runId: string;
  studyRef: VersionedGovernanceRef;
  designSnapshot: PrimaryAssignmentDesignV1;
  assignment: PrimaryAssignmentRecordV1;
  retryPolicy: "reuse_assignment";
  createdAt: string;
  contentHash: string;
}

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function hashCanonical(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be non-empty`);
  }
}

function requireTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} must be an ISO-compatible timestamp`);
  }
}

function requireHash(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    throw new Error(`${field} must be a canonical sha256 hash`);
  }
}

function validateStratum(
  stratum: Record<string, string | number | boolean>,
  design: PrimaryAssignmentDesignV1,
): void {
  if (!stratum || typeof stratum !== "object" || Array.isArray(stratum)) {
    throw new Error("primaryAssignment.stratum must be an object");
  }
  const actualKeys = Object.keys(stratum).sort();
  const expectedKeys = [...design.stratification.fields].sort();
  if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys)) {
    throw new Error("primaryAssignment.stratum keys must exactly match the frozen design");
  }
  for (const value of Object.values(stratum)) {
    if (typeof value !== "string" && typeof value !== "boolean"
      && (typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error("primaryAssignment.stratum values must be strings, booleans, or finite numbers");
    }
  }
}

function assignmentArms(design: PrimaryAssignmentDesignV1): PrimaryAssignmentRecordV1["arms"] {
  return design.arms.map(arm => ({
    armRef: structuredClone(arm.armRef),
    probability: arm.allocationProbability,
  }));
}

export function validatePrimaryAssignmentDesignV1(
  design: PrimaryAssignmentDesignV1,
): void {
  if (!design || design.schemaVersion !== "1.0.0") {
    throw new Error("primaryAssignmentDesign.schemaVersion must be 1.0.0");
  }
  validateGovernanceRef(design, "primaryAssignmentDesign");
  validateGovernanceRef(design.preregistrationRef, "primaryAssignmentDesign.preregistrationRef");
  if (design.unit !== "run") {
    throw new Error("primaryAssignmentDesign v1 supports run units only");
  }
  validateGovernanceRef(
    design.assignmentAlgorithmRef,
    "primaryAssignmentDesign.assignmentAlgorithmRef",
  );
  if (governanceRefKey(design.assignmentAlgorithmRef)
    !== governanceRefKey(PRIMARY_ASSIGNMENT_ALGORITHM_V1)) {
    throw new Error("primaryAssignmentDesign uses an unsupported assignment algorithm");
  }
  requireNonEmpty(design.seedNamespace, "primaryAssignmentDesign.seedNamespace");
  if (!Array.isArray(design.arms) || design.arms.length < 2) {
    throw new Error("primaryAssignmentDesign requires at least two randomized arms");
  }
  const armKeys = new Set<string>();
  let probabilityTotal = 0;
  for (const arm of design.arms) {
    validateGovernanceRef(arm.armRef, "primaryAssignmentDesign.arm.armRef");
    const armKey = governanceRefKey(arm.armRef);
    if (armKeys.has(armKey)) throw new Error("primaryAssignmentDesign arm refs must be unique");
    armKeys.add(armKey);
    if (!Number.isFinite(arm.allocationProbability)
      || arm.allocationProbability <= 0
      || arm.allocationProbability > 1) {
      throw new Error("primaryAssignmentDesign arm probabilities must be within (0,1]");
    }
    probabilityTotal += arm.allocationProbability;
    validateGovernanceRef(arm.implementationRef, "primaryAssignmentDesign.arm.implementationRef");
    requireHash(arm.implementationConfigHash, "primaryAssignmentDesign.arm.implementationConfigHash");
    validateGovernanceRef(arm.budgetContractRef, "primaryAssignmentDesign.arm.budgetContractRef");
    requireHash(arm.budgetContractHash, "primaryAssignmentDesign.arm.budgetContractHash");
  }
  if (Math.abs(probabilityTotal - 1) > 1e-9) {
    throw new Error("primaryAssignmentDesign arm probabilities must sum to 1");
  }
  if (!design.stratification || !Array.isArray(design.stratification.fields)) {
    throw new Error("primaryAssignmentDesign.stratification.fields must be an array");
  }
  const fields = design.stratification.fields;
  if (fields.some(field => typeof field !== "string" || field.trim().length === 0)
    || new Set(fields).size !== fields.length) {
    throw new Error("primaryAssignmentDesign stratification fields must be unique non-empty strings");
  }
  if (canonicalJson(fields) !== canonicalJson([...fields].sort())) {
    throw new Error("primaryAssignmentDesign stratification fields must be canonically sorted");
  }
  if (design.stratification.missingFieldPolicy !== "reject"
    || design.stratification.extraFieldPolicy !== "reject") {
    throw new Error("primaryAssignmentDesign v1 stratification must reject missing and extra fields");
  }
  if (design.analysisPopulation !== "intention_to_treat") {
    throw new Error("primaryAssignmentDesign v1 requires intention_to_treat analysis");
  }
  validateGovernanceRef(design.primaryEstimandRef, "primaryAssignmentDesign.primaryEstimandRef");
  if (design.retryPolicy !== "reuse_assignment") {
    throw new Error("primaryAssignmentDesign v1 requires reuse_assignment retry policy");
  }
}

export function computePrimaryAssignmentDesignHash(
  design: PrimaryAssignmentDesignV1,
): string {
  validatePrimaryAssignmentDesignV1(design);
  return hashCanonical(design);
}

export function derivePrimaryAssignmentSeed(input: {
  masterSeed: number;
  runId: string;
  studyRef: VersionedGovernanceRef;
  design: PrimaryAssignmentDesignV1;
  stratum: Record<string, string | number | boolean>;
}): number {
  if (!Number.isSafeInteger(input.masterSeed) || input.masterSeed < 0) {
    throw new Error("primaryAssignment masterSeed must be a non-negative safe integer");
  }
  requireNonEmpty(input.runId, "primaryAssignment.runId");
  validateGovernanceRef(input.studyRef, "primaryAssignment.studyRef");
  validatePrimaryAssignmentDesignV1(input.design);
  validateStratum(input.stratum, input.design);
  const digest = createHash("sha256")
    .update(canonicalJson({
      masterSeed: input.masterSeed,
      runId: input.runId,
      studyRef: input.studyRef,
      designRef: { id: input.design.id, version: input.design.version },
      designHash: computePrimaryAssignmentDesignHash(input.design),
      assignmentAlgorithmRef: input.design.assignmentAlgorithmRef,
      seedNamespace: input.design.seedNamespace,
      stratum: input.stratum,
      arms: assignmentArms(input.design),
    }), "utf8")
    .digest();
  return digest.readUInt32BE(0) >>> 0;
}

function drawPrimaryArm(
  derivedSeed: number,
  arms: readonly PrimaryAssignmentRecordV1["arms"][number][],
): { assignedArmRef: VersionedGovernanceRef; assignmentProbability: number; randomDraw: number } {
  const randomDraw = mulberry32(derivedSeed)();
  let cumulative = 0;
  for (const arm of arms) {
    cumulative += arm.probability;
    if (randomDraw < cumulative) {
      return {
        assignedArmRef: structuredClone(arm.armRef),
        assignmentProbability: arm.probability,
        randomDraw,
      };
    }
  }
  const fallback = arms[arms.length - 1];
  return {
    assignedArmRef: structuredClone(fallback.armRef),
    assignmentProbability: fallback.probability,
    randomDraw,
  };
}

export function createPrimaryAssignmentV1(input: {
  id: string;
  runId: string;
  studyRef: VersionedGovernanceRef;
  design: PrimaryAssignmentDesignV1;
  stratum: Record<string, string | number | boolean>;
  masterSeed: number;
  assignedAt: string;
}): PrimaryAssignmentRecordV1 {
  requireNonEmpty(input.id, "primaryAssignment.id");
  requireTimestamp(input.assignedAt, "primaryAssignment.assignedAt");
  const derivedSeed = derivePrimaryAssignmentSeed(input);
  const arms = assignmentArms(input.design);
  const draw = drawPrimaryArm(derivedSeed, arms);
  const assignment: PrimaryAssignmentRecordV1 = {
    artifactType: "swarmalpha.primary-assignment",
    schemaVersion: "1.0.0",
    id: input.id,
    runId: input.runId,
    unitId: input.runId,
    unitKind: "run",
    studyRef: structuredClone(input.studyRef),
    designRef: { id: input.design.id, version: input.design.version },
    designHash: computePrimaryAssignmentDesignHash(input.design),
    preregistrationRef: structuredClone(input.design.preregistrationRef),
    assignmentAlgorithmRef: structuredClone(input.design.assignmentAlgorithmRef),
    seedNamespace: input.design.seedNamespace,
    stratum: structuredClone(input.stratum),
    arms,
    masterSeed: input.masterSeed,
    derivedSeed,
    randomDraw: draw.randomDraw,
    assignedArmRef: draw.assignedArmRef,
    assignmentProbability: draw.assignmentProbability,
    assignedAt: input.assignedAt,
  };
  validatePrimaryAssignmentRecordV1(assignment, input.design);
  return assignment;
}

export function validatePrimaryAssignmentRecordV1(
  assignment: PrimaryAssignmentRecordV1,
  design: PrimaryAssignmentDesignV1,
): void {
  validatePrimaryAssignmentDesignV1(design);
  if (!assignment || assignment.artifactType !== "swarmalpha.primary-assignment"
    || assignment.schemaVersion !== "1.0.0") {
    throw new Error("primaryAssignment artifact/schema mismatch");
  }
  requireNonEmpty(assignment.id, "primaryAssignment.id");
  requireNonEmpty(assignment.runId, "primaryAssignment.runId");
  if (assignment.unitKind !== "run" || assignment.unitId !== assignment.runId) {
    throw new Error("primaryAssignment v1 unit must be the runId");
  }
  validateGovernanceRef(assignment.studyRef, "primaryAssignment.studyRef");
  validateGovernanceRef(assignment.designRef, "primaryAssignment.designRef");
  requireHash(assignment.designHash, "primaryAssignment.designHash");
  if (governanceRefKey(assignment.designRef) !== governanceRefKey(design)
    || assignment.designHash !== computePrimaryAssignmentDesignHash(design)) {
    throw new Error("primaryAssignment does not match the frozen design");
  }
  validateGovernanceRef(assignment.preregistrationRef, "primaryAssignment.preregistrationRef");
  validateGovernanceRef(
    assignment.assignmentAlgorithmRef,
    "primaryAssignment.assignmentAlgorithmRef",
  );
  if (governanceRefKey(assignment.preregistrationRef)
      !== governanceRefKey(design.preregistrationRef)
    || governanceRefKey(assignment.assignmentAlgorithmRef)
      !== governanceRefKey(design.assignmentAlgorithmRef)
    || assignment.seedNamespace !== design.seedNamespace) {
    throw new Error("primaryAssignment design metadata mismatch");
  }
  validateStratum(assignment.stratum, design);
  const expectedArms = assignmentArms(design);
  if (canonicalJson(assignment.arms) !== canonicalJson(expectedArms)) {
    throw new Error("primaryAssignment arms must exactly match the frozen design");
  }
  if (!Number.isSafeInteger(assignment.masterSeed) || assignment.masterSeed < 0
    || !Number.isSafeInteger(assignment.derivedSeed)
    || assignment.derivedSeed < 0
    || assignment.derivedSeed > 0xffffffff) {
    throw new Error("primaryAssignment seeds are invalid");
  }
  const replayedSeed = derivePrimaryAssignmentSeed({
    masterSeed: assignment.masterSeed,
    runId: assignment.runId,
    studyRef: assignment.studyRef,
    design,
    stratum: assignment.stratum,
  });
  if (assignment.derivedSeed !== replayedSeed) {
    throw new Error("primaryAssignment derived seed is not reproducible from the frozen design");
  }
  const replayedDraw = drawPrimaryArm(assignment.derivedSeed, expectedArms);
  validateGovernanceRef(assignment.assignedArmRef, "primaryAssignment.assignedArmRef");
  if (governanceRefKey(assignment.assignedArmRef)
      !== governanceRefKey(replayedDraw.assignedArmRef)
    || assignment.assignmentProbability !== replayedDraw.assignmentProbability
    || assignment.randomDraw !== replayedDraw.randomDraw) {
    throw new Error("primaryAssignment draw is not reproducible");
  }
  requireTimestamp(assignment.assignedAt, "primaryAssignment.assignedAt");
}

export function computePrimaryAssignmentManifestHash(
  manifest: Omit<PrimaryAssignmentManifestV1, "contentHash">,
): string {
  return hashCanonical(manifest);
}

export function createPrimaryAssignmentManifestV1(input: {
  runId: string;
  studyRef: VersionedGovernanceRef;
  design: PrimaryAssignmentDesignV1;
  assignment: PrimaryAssignmentRecordV1;
  createdAt: string;
}): PrimaryAssignmentManifestV1 {
  const body: Omit<PrimaryAssignmentManifestV1, "contentHash"> = {
    artifactType: "swarmalpha.primary-assignment-manifest",
    schemaVersion: "1.0.0",
    runId: input.runId,
    studyRef: structuredClone(input.studyRef),
    designSnapshot: structuredClone(input.design),
    assignment: structuredClone(input.assignment),
    retryPolicy: "reuse_assignment",
    createdAt: input.createdAt,
  };
  const manifest: PrimaryAssignmentManifestV1 = {
    ...body,
    contentHash: computePrimaryAssignmentManifestHash(body),
  };
  validatePrimaryAssignmentManifestV1(manifest);
  return manifest;
}

export function validatePrimaryAssignmentManifestV1(
  manifest: PrimaryAssignmentManifestV1,
): void {
  if (!manifest || manifest.artifactType !== "swarmalpha.primary-assignment-manifest"
    || manifest.schemaVersion !== "1.0.0") {
    throw new Error("primaryAssignmentManifest artifact/schema mismatch");
  }
  requireNonEmpty(manifest.runId, "primaryAssignmentManifest.runId");
  validateGovernanceRef(manifest.studyRef, "primaryAssignmentManifest.studyRef");
  validatePrimaryAssignmentDesignV1(manifest.designSnapshot);
  validatePrimaryAssignmentRecordV1(manifest.assignment, manifest.designSnapshot);
  if (manifest.assignment.runId !== manifest.runId
    || governanceRefKey(manifest.assignment.studyRef) !== governanceRefKey(manifest.studyRef)) {
    throw new Error("primaryAssignmentManifest run/study binding mismatch");
  }
  if (manifest.retryPolicy !== manifest.designSnapshot.retryPolicy) {
    throw new Error("primaryAssignmentManifest retry policy does not match its design");
  }
  requireTimestamp(manifest.createdAt, "primaryAssignmentManifest.createdAt");
  if (Date.parse(manifest.createdAt) < Date.parse(manifest.assignment.assignedAt)) {
    throw new Error("primaryAssignmentManifest cannot precede its assignment");
  }
  requireHash(manifest.contentHash, "primaryAssignmentManifest.contentHash");
  const { contentHash: _contentHash, ...body } = manifest;
  if (manifest.contentHash !== computePrimaryAssignmentManifestHash(body)) {
    throw new Error("primaryAssignmentManifest contentHash mismatch");
  }
}
