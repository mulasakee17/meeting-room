import { createHash } from "node:crypto";
import {
  governanceRefKey,
  validateGovernanceRef,
  validateReplayableGovernanceValue,
  type VersionedGovernanceRef,
} from "../governance/controlContracts";
import {
  computePrimaryAssignmentDesignHash,
  validatePrimaryAssignmentManifestV1,
  type PrimaryAssignmentDesignV1,
  type PrimaryAssignmentManifestV1,
} from "./primaryAssignment";

export type PrimaryAssignmentExecutionPayload = Record<string, unknown>;

export interface PrimaryArmExecutionSnapshotV1 {
  armRef: VersionedGovernanceRef;
  implementationRef: VersionedGovernanceRef;
  implementationConfig: PrimaryAssignmentExecutionPayload;
  implementationConfigHash: string;
  budgetContractRef: VersionedGovernanceRef;
  budgetContract: PrimaryAssignmentExecutionPayload;
  budgetContractHash: string;
}

/**
 * Frozen lookup table from randomized arm identity to executable snapshots.
 * Arm labels have no runtime meaning: exact versioned refs are the only keys.
 */
export interface PrimaryArmExecutionRegistryV1 {
  artifactType: "swarmalpha.primary-arm-execution-registry";
  schemaVersion: "1.0.0";
  studyRef: VersionedGovernanceRef;
  designRef: VersionedGovernanceRef;
  designHash: string;
  entries: PrimaryArmExecutionSnapshotV1[];
  contentHash: string;
}

/**
 * Pre-provider binding proving which frozen implementation was resolved from
 * the Stage-1 draw. It is not evidence that delivery or compliance occurred.
 */
export interface PrimaryArmExecutionBindingV1 {
  artifactType: "swarmalpha.primary-arm-execution-binding";
  schemaVersion: "1.0.0";
  runId: string;
  studyRef: VersionedGovernanceRef;
  assignmentId: string;
  primaryAssignmentManifestHash: string;
  registryHash: string;
  assignedArmRef: VersionedGovernanceRef;
  assignmentProbability: number;
  implementationRef: VersionedGovernanceRef;
  implementationConfig: PrimaryAssignmentExecutionPayload;
  implementationConfigHash: string;
  budgetContractRef: VersionedGovernanceRef;
  budgetContract: PrimaryAssignmentExecutionPayload;
  budgetContractHash: string;
  resolvedAt: string;
  contentHash: string;
}

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const CREDENTIAL_KEY_RE = /(^|[_-])(api[-_]?key|secret|password|authorization|credential|access[-_]?token|refresh[-_]?token)($|[_-])/i;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be non-empty`);
  }
}

function requireHash(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    throw new Error(`${field} must be a canonical sha256 hash`);
  }
}

function requireTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${field} must be a canonical ISO timestamp`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${field} must be a canonical ISO timestamp`);
  }
}

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

function rejectCredentialKeys(value: unknown, field: string): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectCredentialKeys(child, `${field}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (CREDENTIAL_KEY_RE.test(key)) throw new Error(`${field} must not persist credential-like field ${key}`);
    rejectCredentialKeys(child, `${field}.${key}`);
  }
}

export function computePrimaryAssignmentExecutionPayloadHash(
  value: PrimaryAssignmentExecutionPayload,
): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("primary assignment execution payload must be a plain object");
  }
  validateReplayableGovernanceValue(value, "primary assignment execution payload");
  rejectCredentialKeys(value, "primary assignment execution payload");
  const canonical = JSON.stringify(canonicalize(value));
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function hashArtifactBody(value: unknown, field: string): string {
  validateReplayableGovernanceValue(value, field);
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex")}`;
}

function registryBody(
  registry: PrimaryArmExecutionRegistryV1,
): Omit<PrimaryArmExecutionRegistryV1, "contentHash"> {
  const { contentHash: _contentHash, ...body } = registry;
  return body;
}

function bindingBody(
  binding: PrimaryArmExecutionBindingV1,
): Omit<PrimaryArmExecutionBindingV1, "contentHash"> {
  const { contentHash: _contentHash, ...body } = binding;
  return body;
}

export function computePrimaryArmExecutionRegistryHash(
  registry: Omit<PrimaryArmExecutionRegistryV1, "contentHash">,
): string {
  return hashArtifactBody(registry, "primaryArmExecutionRegistry");
}

export function computePrimaryArmExecutionBindingHash(
  binding: Omit<PrimaryArmExecutionBindingV1, "contentHash">,
): string {
  return hashArtifactBody(binding, "primaryArmExecutionBinding");
}

export function createPrimaryArmExecutionRegistryV1(input: {
  studyRef: VersionedGovernanceRef;
  design: PrimaryAssignmentDesignV1;
  entries: Array<{
    armRef: VersionedGovernanceRef;
    implementationRef: VersionedGovernanceRef;
    implementationConfig: PrimaryAssignmentExecutionPayload;
    budgetContractRef: VersionedGovernanceRef;
    budgetContract: PrimaryAssignmentExecutionPayload;
  }>;
}): PrimaryArmExecutionRegistryV1 {
  const entries: PrimaryArmExecutionSnapshotV1[] = input.entries.map(entry => ({
    armRef: clone(entry.armRef),
    implementationRef: clone(entry.implementationRef),
    implementationConfig: clone(entry.implementationConfig),
    implementationConfigHash: computePrimaryAssignmentExecutionPayloadHash(entry.implementationConfig),
    budgetContractRef: clone(entry.budgetContractRef),
    budgetContract: clone(entry.budgetContract),
    budgetContractHash: computePrimaryAssignmentExecutionPayloadHash(entry.budgetContract),
  }));
  const body: Omit<PrimaryArmExecutionRegistryV1, "contentHash"> = {
    artifactType: "swarmalpha.primary-arm-execution-registry",
    schemaVersion: "1.0.0",
    studyRef: clone(input.studyRef),
    designRef: { id: input.design.id, version: input.design.version },
    designHash: computePrimaryAssignmentDesignHash(input.design),
    entries,
  };
  const registry: PrimaryArmExecutionRegistryV1 = {
    ...body,
    contentHash: computePrimaryArmExecutionRegistryHash(body),
  };
  validatePrimaryArmExecutionRegistryV1(registry, input.design);
  return registry;
}

export function validatePrimaryArmExecutionRegistryV1(
  registry: PrimaryArmExecutionRegistryV1,
  design: PrimaryAssignmentDesignV1,
): void {
  if (!registry || registry.artifactType !== "swarmalpha.primary-arm-execution-registry"
    || registry.schemaVersion !== "1.0.0") {
    throw new Error("primaryArmExecutionRegistry artifact/schema mismatch");
  }
  validateGovernanceRef(registry.studyRef, "primaryArmExecutionRegistry.studyRef");
  validateGovernanceRef(registry.designRef, "primaryArmExecutionRegistry.designRef");
  requireHash(registry.designHash, "primaryArmExecutionRegistry.designHash");
  if (governanceRefKey(registry.designRef) !== governanceRefKey(design)
    || registry.designHash !== computePrimaryAssignmentDesignHash(design)) {
    throw new Error("primaryArmExecutionRegistry does not match the frozen design");
  }
  if (!Array.isArray(registry.entries) || registry.entries.length !== design.arms.length) {
    throw new Error("primaryArmExecutionRegistry must cover every design arm exactly once");
  }
  const registryOrder = registry.entries.map(entry => governanceRefKey(entry.armRef));
  const designOrder = design.arms.map(arm => governanceRefKey(arm.armRef));
  if (JSON.stringify(registryOrder) !== JSON.stringify(designOrder)) {
    throw new Error("primaryArmExecutionRegistry entries must follow frozen design arm order");
  }
  const entryByArm = new Map<string, PrimaryArmExecutionSnapshotV1>();
  for (const entry of registry.entries) {
    validateGovernanceRef(entry.armRef, "primaryArmExecutionRegistry.entry.armRef");
    const key = governanceRefKey(entry.armRef);
    if (entryByArm.has(key)) throw new Error("primaryArmExecutionRegistry arm refs must be unique");
    entryByArm.set(key, entry);
    validateGovernanceRef(entry.implementationRef, "primaryArmExecutionRegistry.entry.implementationRef");
    validateGovernanceRef(entry.budgetContractRef, "primaryArmExecutionRegistry.entry.budgetContractRef");
    requireHash(entry.implementationConfigHash, "primaryArmExecutionRegistry.entry.implementationConfigHash");
    requireHash(entry.budgetContractHash, "primaryArmExecutionRegistry.entry.budgetContractHash");
    if (computePrimaryAssignmentExecutionPayloadHash(entry.implementationConfig)
        !== entry.implementationConfigHash
      || computePrimaryAssignmentExecutionPayloadHash(entry.budgetContract)
        !== entry.budgetContractHash) {
      throw new Error("primaryArmExecutionRegistry payload hash mismatch");
    }
  }
  for (const arm of design.arms) {
    const entry = entryByArm.get(governanceRefKey(arm.armRef));
    if (!entry
      || governanceRefKey(entry.implementationRef) !== governanceRefKey(arm.implementationRef)
      || entry.implementationConfigHash !== arm.implementationConfigHash
      || governanceRefKey(entry.budgetContractRef) !== governanceRefKey(arm.budgetContractRef)
      || entry.budgetContractHash !== arm.budgetContractHash) {
      throw new Error(`primaryArmExecutionRegistry entry does not match design arm ${governanceRefKey(arm.armRef)}`);
    }
  }
  requireHash(registry.contentHash, "primaryArmExecutionRegistry.contentHash");
  if (registry.contentHash !== computePrimaryArmExecutionRegistryHash(registryBody(registry))) {
    throw new Error("primaryArmExecutionRegistry contentHash mismatch");
  }
}

export function resolvePrimaryArmExecutionBindingV1(input: {
  manifest: PrimaryAssignmentManifestV1;
  registry: PrimaryArmExecutionRegistryV1;
  resolvedAt: string;
}): PrimaryArmExecutionBindingV1 {
  validatePrimaryAssignmentManifestV1(input.manifest);
  validatePrimaryArmExecutionRegistryV1(input.registry, input.manifest.designSnapshot);
  requireTimestamp(input.resolvedAt, "primaryArmExecutionBinding.resolvedAt");
  if (governanceRefKey(input.registry.studyRef) !== governanceRefKey(input.manifest.studyRef)) {
    throw new Error("primaryArmExecutionRegistry belongs to another study");
  }
  if (Date.parse(input.resolvedAt) < Date.parse(input.manifest.createdAt)) {
    throw new Error("primaryArmExecutionBinding cannot precede its assignment manifest");
  }
  const assignment = input.manifest.assignment;
  const entry = input.registry.entries.find(candidate =>
    governanceRefKey(candidate.armRef) === governanceRefKey(assignment.assignedArmRef));
  if (!entry) throw new Error("assigned arm has no frozen execution registry entry");
  const body: Omit<PrimaryArmExecutionBindingV1, "contentHash"> = {
    artifactType: "swarmalpha.primary-arm-execution-binding",
    schemaVersion: "1.0.0",
    runId: assignment.runId,
    studyRef: clone(assignment.studyRef),
    assignmentId: assignment.id,
    primaryAssignmentManifestHash: input.manifest.contentHash,
    registryHash: input.registry.contentHash,
    assignedArmRef: clone(assignment.assignedArmRef),
    assignmentProbability: assignment.assignmentProbability,
    implementationRef: clone(entry.implementationRef),
    implementationConfig: clone(entry.implementationConfig),
    implementationConfigHash: entry.implementationConfigHash,
    budgetContractRef: clone(entry.budgetContractRef),
    budgetContract: clone(entry.budgetContract),
    budgetContractHash: entry.budgetContractHash,
    resolvedAt: input.resolvedAt,
  };
  const binding: PrimaryArmExecutionBindingV1 = {
    ...body,
    contentHash: computePrimaryArmExecutionBindingHash(body),
  };
  validatePrimaryArmExecutionBindingV1(binding, input.manifest, input.registry);
  return binding;
}

export function validatePrimaryArmExecutionBindingV1(
  binding: PrimaryArmExecutionBindingV1,
  manifest: PrimaryAssignmentManifestV1,
  registry: PrimaryArmExecutionRegistryV1,
): void {
  validatePrimaryAssignmentManifestV1(manifest);
  validatePrimaryArmExecutionRegistryV1(registry, manifest.designSnapshot);
  if (!binding || binding.artifactType !== "swarmalpha.primary-arm-execution-binding"
    || binding.schemaVersion !== "1.0.0") {
    throw new Error("primaryArmExecutionBinding artifact/schema mismatch");
  }
  requireNonEmpty(binding.runId, "primaryArmExecutionBinding.runId");
  requireNonEmpty(binding.assignmentId, "primaryArmExecutionBinding.assignmentId");
  validateGovernanceRef(binding.studyRef, "primaryArmExecutionBinding.studyRef");
  validateGovernanceRef(binding.assignedArmRef, "primaryArmExecutionBinding.assignedArmRef");
  validateGovernanceRef(binding.implementationRef, "primaryArmExecutionBinding.implementationRef");
  validateGovernanceRef(binding.budgetContractRef, "primaryArmExecutionBinding.budgetContractRef");
  requireHash(binding.primaryAssignmentManifestHash, "primaryArmExecutionBinding.primaryAssignmentManifestHash");
  requireHash(binding.registryHash, "primaryArmExecutionBinding.registryHash");
  requireHash(binding.implementationConfigHash, "primaryArmExecutionBinding.implementationConfigHash");
  requireHash(binding.budgetContractHash, "primaryArmExecutionBinding.budgetContractHash");
  requireTimestamp(binding.resolvedAt, "primaryArmExecutionBinding.resolvedAt");
  const assignment = manifest.assignment;
  if (binding.runId !== manifest.runId
    || binding.assignmentId !== assignment.id
    || governanceRefKey(binding.studyRef) !== governanceRefKey(manifest.studyRef)
    || binding.primaryAssignmentManifestHash !== manifest.contentHash
    || binding.registryHash !== registry.contentHash
    || governanceRefKey(binding.assignedArmRef) !== governanceRefKey(assignment.assignedArmRef)
    || binding.assignmentProbability !== assignment.assignmentProbability) {
    throw new Error("primaryArmExecutionBinding assignment identity mismatch");
  }
  const entry = registry.entries.find(candidate =>
    governanceRefKey(candidate.armRef) === governanceRefKey(binding.assignedArmRef));
  if (!entry
    || governanceRefKey(binding.implementationRef) !== governanceRefKey(entry.implementationRef)
    || governanceRefKey(binding.budgetContractRef) !== governanceRefKey(entry.budgetContractRef)
    || binding.implementationConfigHash !== entry.implementationConfigHash
    || binding.budgetContractHash !== entry.budgetContractHash
    || computePrimaryAssignmentExecutionPayloadHash(binding.implementationConfig)
      !== entry.implementationConfigHash
    || computePrimaryAssignmentExecutionPayloadHash(binding.budgetContract)
      !== entry.budgetContractHash) {
    throw new Error("primaryArmExecutionBinding does not resolve the assigned frozen implementation");
  }
  if (Date.parse(binding.resolvedAt) < Date.parse(manifest.createdAt)) {
    throw new Error("primaryArmExecutionBinding cannot precede its assignment manifest");
  }
  requireHash(binding.contentHash, "primaryArmExecutionBinding.contentHash");
  if (binding.contentHash !== computePrimaryArmExecutionBindingHash(bindingBody(binding))) {
    throw new Error("primaryArmExecutionBinding contentHash mismatch");
  }
}
