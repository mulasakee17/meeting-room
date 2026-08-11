import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  defaultBeliefContractRegistry,
  validateEpistemicClaim,
  type ClaimResolution,
  type EpistemicClaim,
} from "../../../src/lib/epistemic";
import {
  governanceRefKey,
  validateGovernanceRef,
  type VersionedGovernanceRef,
} from "../../../src/lib/governance";

export const V6_TASK_MANIFEST_V1 = Object.freeze({
  id: "swarmalpha.v6.task-manifest",
  version: "1.0.0",
});

export const V6_GROUND_TRUTH_COMMITMENT_V1 = Object.freeze({
  id: "swarmalpha.commitment.v6-binary-ground-truth",
  version: "1.0.0",
});

/**
 * Kind-aware commitment used by non-binary task openings. Binary tasks retain
 * the v1 commitment byte-for-byte so existing authoritative artifacts remain
 * replayable; categorical tasks cannot masquerade under the binary identity.
 */
export const V6_GROUND_TRUTH_COMMITMENT_V2 = Object.freeze({
  id: "swarmalpha.commitment.v6-claim-ground-truth",
  version: "2.0.0",
});

export interface V6TaskAuthorityV1 {
  adapterRef: VersionedGovernanceRef;
  taskSchemaRef: VersionedGovernanceRef;
  resolution: { kind: "from_task_outcome"; resolverId: string };
}

export interface V6TaskCommitmentInputV1 {
  id: string;
  taskFamilyRef: VersionedGovernanceRef;
  publicContext: string;
  claim: EpistemicClaim;
  agents: Array<{ agentId: string; privateInformation: string }>;
  outcome: boolean | string;
}

export interface V6TaskManifestV1 {
  artifactSchemaRef: VersionedGovernanceRef;
  runId: string;
  studyRef: VersionedGovernanceRef;
  taskId: string;
  taskFamilyRef: VersionedGovernanceRef;
  adapterRef: VersionedGovernanceRef;
  taskSchemaRef: VersionedGovernanceRef;
  publicContextHash: string;
  primaryClaim: EpistemicClaim;
  orderedAgentCommitments: Array<{ agentId: string; privateInformationHash: string }>;
  resolutionContract: { kind: "from_task_outcome"; resolverId: string };
  groundTruthCommitment: {
    commitmentRef: VersionedGovernanceRef;
    valueHash: string;
    confidentiality: "integrity_only_not_hiding";
  };
  taskDefinitionHash: string;
  monitoringDesignRef: VersionedGovernanceRef;
  monitoringDesignHash: string;
  committedAt: string;
  contentHash: string;
}

export interface PersistedV6TaskManifestV1 {
  manifest: V6TaskManifestV1;
  absolutePath: string;
  fileHash: string;
  reused: boolean;
}

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalize(value: unknown, field = "value", ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${field} must contain only finite numbers`);
    return value;
  }
  if (typeof value !== "object") throw new Error(`${field} must contain only JSON data`);
  if (ancestors.has(value)) throw new Error(`${field} must not contain cycles`);
  const next = new Set(ancestors);
  next.add(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new Error(`${field} must not be sparse`);
    return value.map((entry, index) => canonicalize(entry, `${field}[${index}]`, next));
  }
  if (!isPlainObject(value)) throw new Error(`${field} must contain only plain objects`);
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key], `${field}.${key}`, next)]));
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function hashCanonical(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value), "utf8").digest("hex")}`;
}

function hashText(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be non-empty`);
}

function requireTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) {
    throw new Error(`${field} must be a canonical ISO timestamp`);
  }
}

function refsEqual(left: VersionedGovernanceRef, right: VersionedGovernanceRef): boolean {
  return governanceRefKey(left) === governanceRefKey(right);
}

function manifestBody(manifest: V6TaskManifestV1): Omit<V6TaskManifestV1, "contentHash"> {
  const { contentHash: _contentHash, ...body } = manifest;
  return body;
}

export function computeV6GroundTruthCommitmentV1(input: {
  taskId: string;
  claimId: string;
  resolverId: string;
  outcome: boolean;
}): string {
  return hashCanonical({
    commitmentRef: V6_GROUND_TRUTH_COMMITMENT_V1,
    taskId: input.taskId,
    claimId: input.claimId,
    resolverId: input.resolverId,
    outcome: input.outcome,
  });
}

export function computeV6GroundTruthCommitmentV2(input: {
  taskId: string;
  claimId: string;
  beliefKind: "binary" | "categorical";
  resolverId: string;
  outcome: boolean | string;
}): string {
  if (input.beliefKind === "binary" && typeof input.outcome !== "boolean") {
    throw new Error("binary ground-truth commitment requires a boolean outcome");
  }
  if (input.beliefKind === "categorical"
    && (typeof input.outcome !== "string" || input.outcome.trim().length === 0)) {
    throw new Error("categorical ground-truth commitment requires a non-empty string outcome");
  }
  return hashCanonical({
    commitmentRef: V6_GROUND_TRUTH_COMMITMENT_V2,
    taskId: input.taskId,
    claimId: input.claimId,
    beliefKind: input.beliefKind,
    resolverId: input.resolverId,
    outcome: input.outcome,
  });
}

function validateTaskOutcome(task: V6TaskCommitmentInputV1): void {
  validateEpistemicClaim(task.claim, defaultBeliefContractRegistry);
  if (task.claim.resolutionPolicy.kind === "binary") {
    if (typeof task.outcome !== "boolean") {
      throw new Error("binary v6 task outcome must be boolean");
    }
    return;
  }
  if (!("options" in task.claim)
    || typeof task.outcome !== "string" || !task.claim.options.includes(task.outcome)) {
    throw new Error("categorical v6 task outcome must be one canonical claim option");
  }
}

function groundTruthCommitmentForTask(task: V6TaskCommitmentInputV1): {
  commitmentRef: VersionedGovernanceRef;
  valueHash: string;
} {
  validateTaskOutcome(task);
  if (task.claim.resolutionPolicy.kind === "binary") {
    return {
      commitmentRef: structuredClone(V6_GROUND_TRUTH_COMMITMENT_V1),
      valueHash: computeV6GroundTruthCommitmentV1({
        taskId: task.id,
        claimId: task.claim.id,
        resolverId: task.claim.resolutionPolicy.resolverId,
        outcome: task.outcome as boolean,
      }),
    };
  }
  return {
    commitmentRef: structuredClone(V6_GROUND_TRUTH_COMMITMENT_V2),
    valueHash: computeV6GroundTruthCommitmentV2({
      taskId: task.id,
      claimId: task.claim.id,
      beliefKind: "categorical",
      resolverId: task.claim.resolutionPolicy.resolverId,
      outcome: task.outcome,
    }),
  };
}

export function computeV6TaskDefinitionHashV1(
  task: V6TaskCommitmentInputV1,
  authority: V6TaskAuthorityV1,
): string {
  const groundTruthCommitment = groundTruthCommitmentForTask(task);
  return hashCanonical({
    taskId: task.id,
    taskFamilyRef: task.taskFamilyRef,
    adapterRef: authority.adapterRef,
    taskSchemaRef: authority.taskSchemaRef,
    publicContextHash: hashText(task.publicContext),
    primaryClaim: task.claim,
    orderedAgentCommitments: task.agents.map(agent => ({
      agentId: agent.agentId,
      privateInformationHash: hashText(agent.privateInformation),
    })),
    resolutionContract: authority.resolution,
    groundTruthCommitment: groundTruthCommitment.valueHash,
  });
}

export function computeV6TaskManifestHashV1(
  manifest: Omit<V6TaskManifestV1, "contentHash">,
): string {
  return hashCanonical(manifest);
}

export function createV6TaskManifestV1(input: {
  runId: string;
  studyRef: VersionedGovernanceRef;
  task: V6TaskCommitmentInputV1;
  authority: V6TaskAuthorityV1;
  monitoringDesignRef: VersionedGovernanceRef;
  monitoringDesignHash: string;
  committedAt: string;
}): V6TaskManifestV1 {
  validateTaskOutcome(input.task);
  if (input.authority.resolution.resolverId !== input.task.claim.resolutionPolicy.resolverId) {
    throw new Error("v6 task authority resolver must match the primary claim");
  }
  const groundTruthCommitment = groundTruthCommitmentForTask(input.task);
  const body: Omit<V6TaskManifestV1, "contentHash"> = {
    artifactSchemaRef: structuredClone(V6_TASK_MANIFEST_V1),
    runId: input.runId,
    studyRef: structuredClone(input.studyRef),
    taskId: input.task.id,
    taskFamilyRef: structuredClone(input.task.taskFamilyRef),
    adapterRef: structuredClone(input.authority.adapterRef),
    taskSchemaRef: structuredClone(input.authority.taskSchemaRef),
    publicContextHash: hashText(input.task.publicContext),
    primaryClaim: structuredClone(input.task.claim),
    orderedAgentCommitments: input.task.agents.map(agent => ({
      agentId: agent.agentId,
      privateInformationHash: hashText(agent.privateInformation),
    })),
    resolutionContract: structuredClone(input.authority.resolution),
    groundTruthCommitment: {
      commitmentRef: groundTruthCommitment.commitmentRef,
      valueHash: groundTruthCommitment.valueHash,
      confidentiality: "integrity_only_not_hiding",
    },
    taskDefinitionHash: computeV6TaskDefinitionHashV1(input.task, input.authority),
    monitoringDesignRef: structuredClone(input.monitoringDesignRef),
    monitoringDesignHash: input.monitoringDesignHash,
    committedAt: input.committedAt,
  };
  const manifest = { ...body, contentHash: computeV6TaskManifestHashV1(body) };
  validateV6TaskManifestV1(manifest);
  validateV6TaskManifestOpeningV1(manifest, input.task, input.authority);
  return manifest;
}

export function validateV6TaskManifestV1(manifest: V6TaskManifestV1): void {
  if (!manifest || !refsEqual(manifest.artifactSchemaRef, V6_TASK_MANIFEST_V1)) {
    throw new Error("v6 task manifest schema ref is invalid");
  }
  const expectedKeys = [
    "adapterRef", "artifactSchemaRef", "committedAt", "contentHash", "groundTruthCommitment",
    "monitoringDesignHash", "monitoringDesignRef", "orderedAgentCommitments", "primaryClaim",
    "publicContextHash", "resolutionContract", "runId", "studyRef", "taskDefinitionHash", "taskFamilyRef", "taskId",
    "taskSchemaRef",
  ];
  if (stableJson(Object.keys(manifest).sort()) !== stableJson(expectedKeys)) {
    throw new Error("v6 task manifest contains unexpected or missing fields");
  }
  requireNonEmpty(manifest.runId, "v6 task manifest runId");
  requireNonEmpty(manifest.taskId, "v6 task manifest taskId");
  validateGovernanceRef(manifest.studyRef, "v6 task manifest studyRef");
  validateGovernanceRef(manifest.taskFamilyRef, "v6 task manifest taskFamilyRef");
  validateGovernanceRef(manifest.adapterRef, "v6 task manifest adapterRef");
  validateGovernanceRef(manifest.taskSchemaRef, "v6 task manifest taskSchemaRef");
  validateGovernanceRef(manifest.monitoringDesignRef, "v6 task manifest monitoringDesignRef");
  validateEpistemicClaim(manifest.primaryClaim, defaultBeliefContractRegistry);
  requireTimestamp(manifest.committedAt, "v6 task manifest committedAt");
  if (!SHA256_RE.test(manifest.publicContextHash) || !SHA256_RE.test(manifest.monitoringDesignHash)
    || !SHA256_RE.test(manifest.taskDefinitionHash)) {
    throw new Error("v6 task manifest context/design commitments must be canonical sha256 hashes");
  }
  if (!Array.isArray(manifest.orderedAgentCommitments) || manifest.orderedAgentCommitments.length < 2
    || new Set(manifest.orderedAgentCommitments.map(agent => agent.agentId)).size !== manifest.orderedAgentCommitments.length) {
    throw new Error("v6 task manifest requires an ordered unique agent roster");
  }
  for (const agent of manifest.orderedAgentCommitments) {
    requireNonEmpty(agent.agentId, "v6 task manifest agentId");
    if (!SHA256_RE.test(agent.privateInformationHash)) throw new Error("v6 task manifest private-information hash is invalid");
  }
  if (manifest.resolutionContract.kind !== "from_task_outcome") throw new Error("v6 task manifest resolution kind is invalid");
  requireNonEmpty(manifest.resolutionContract.resolverId, "v6 task manifest resolverId");
  if (manifest.resolutionContract.resolverId !== manifest.primaryClaim.resolutionPolicy.resolverId) {
    throw new Error("v6 task manifest resolver differs from the primary claim");
  }
  const expectedCommitmentRef = manifest.primaryClaim.resolutionPolicy.kind === "binary"
    ? V6_GROUND_TRUTH_COMMITMENT_V1
    : V6_GROUND_TRUTH_COMMITMENT_V2;
  if (!refsEqual(manifest.groundTruthCommitment.commitmentRef, expectedCommitmentRef)
    || manifest.groundTruthCommitment.confidentiality !== "integrity_only_not_hiding"
    || !SHA256_RE.test(manifest.groundTruthCommitment.valueHash)) {
    throw new Error("v6 task manifest ground-truth commitment is invalid");
  }
  const expectedTaskDefinitionHash = hashCanonical({
    taskId: manifest.taskId,
    taskFamilyRef: manifest.taskFamilyRef,
    adapterRef: manifest.adapterRef,
    taskSchemaRef: manifest.taskSchemaRef,
    publicContextHash: manifest.publicContextHash,
    primaryClaim: manifest.primaryClaim,
    orderedAgentCommitments: manifest.orderedAgentCommitments,
    resolutionContract: manifest.resolutionContract,
    groundTruthCommitment: manifest.groundTruthCommitment.valueHash,
  });
  if (manifest.taskDefinitionHash !== expectedTaskDefinitionHash) {
    throw new Error("v6 task manifest taskDefinitionHash mismatch");
  }
  if (!SHA256_RE.test(manifest.contentHash)
    || manifest.contentHash !== computeV6TaskManifestHashV1(manifestBody(manifest))) {
    throw new Error("v6 task manifest contentHash mismatch");
  }
}

export function validateV6TaskManifestOpeningV1(
  manifest: V6TaskManifestV1,
  task: V6TaskCommitmentInputV1,
  authority: V6TaskAuthorityV1,
): void {
  validateV6TaskManifestV1(manifest);
  const expected = createV6TaskManifestV1Unchecked({
    runId: manifest.runId,
    studyRef: manifest.studyRef,
    task,
    authority,
    monitoringDesignRef: manifest.monitoringDesignRef,
    monitoringDesignHash: manifest.monitoringDesignHash,
    committedAt: manifest.committedAt,
  });
  if (stableJson(manifest) !== stableJson(expected)) {
    throw new Error("v6 task manifest does not match the supplied task opening");
  }
}

export type V6TaskResolutionOpeningV1 =
  | { claimId: string; resolverId: string; resolvedAt?: string; kind: "binary"; outcome: boolean }
  | { claimId: string; resolverId: string; resolvedAt?: string; kind: "categorical"; outcome: string };

export function validateV6TaskManifestResolutionV1(
  manifest: V6TaskManifestV1,
  resolution: V6TaskResolutionOpeningV1,
): void {
  validateV6TaskManifestV1(manifest);
  if (resolution.claimId !== manifest.primaryClaim.id
    || resolution.resolverId !== manifest.resolutionContract.resolverId) {
    throw new Error("v6 task manifest resolution identity mismatch");
  }
  defaultBeliefContractRegistry.get(manifest.primaryClaim.resolutionPolicy.kind)
    .validateResolution(manifest.primaryClaim, {
      ...resolution,
      resolvedAt: resolution.resolvedAt ?? manifest.committedAt,
    } as ClaimResolution);
  const expected = resolution.kind === "binary"
    ? computeV6GroundTruthCommitmentV1({
        taskId: manifest.taskId,
        claimId: resolution.claimId,
        resolverId: resolution.resolverId,
        outcome: resolution.outcome,
      })
    : computeV6GroundTruthCommitmentV2({
        taskId: manifest.taskId,
        claimId: resolution.claimId,
        beliefKind: "categorical",
        resolverId: resolution.resolverId,
        outcome: resolution.outcome,
      });
  if (manifest.groundTruthCommitment.valueHash !== expected) {
    throw new Error("v6 task manifest ground-truth opening does not match its pre-assignment commitment");
  }
}

function createV6TaskManifestV1Unchecked(input: Parameters<typeof createV6TaskManifestV1>[0]): V6TaskManifestV1 {
  const groundTruthCommitment = groundTruthCommitmentForTask(input.task);
  const body: Omit<V6TaskManifestV1, "contentHash"> = {
    artifactSchemaRef: structuredClone(V6_TASK_MANIFEST_V1),
    runId: input.runId,
    studyRef: structuredClone(input.studyRef),
    taskId: input.task.id,
    taskFamilyRef: structuredClone(input.task.taskFamilyRef),
    adapterRef: structuredClone(input.authority.adapterRef),
    taskSchemaRef: structuredClone(input.authority.taskSchemaRef),
    publicContextHash: hashText(input.task.publicContext),
    primaryClaim: structuredClone(input.task.claim),
    orderedAgentCommitments: input.task.agents.map(agent => ({ agentId: agent.agentId, privateInformationHash: hashText(agent.privateInformation) })),
    resolutionContract: structuredClone(input.authority.resolution),
    groundTruthCommitment: {
      commitmentRef: groundTruthCommitment.commitmentRef,
      valueHash: groundTruthCommitment.valueHash,
      confidentiality: "integrity_only_not_hiding",
    },
    taskDefinitionHash: computeV6TaskDefinitionHashV1(input.task, input.authority),
    monitoringDesignRef: structuredClone(input.monitoringDesignRef),
    monitoringDesignHash: input.monitoringDesignHash,
    committedAt: input.committedAt,
  };
  return { ...body, contentHash: computeV6TaskManifestHashV1(body) };
}

function safeRunStem(runId: string): string {
  const stem = runId.replace(/[^A-Za-z0-9._-]/g, "_");
  const suffix = createHash("sha256").update(runId, "utf8").digest("hex").slice(0, 12);
  return `${stem}.${suffix}`;
}

export function resolveV6TaskManifestV1Path(outputDir: string, runId: string): string {
  requireNonEmpty(runId, "v6 task manifest runId");
  return path.resolve(outputDir, `${safeRunStem(runId)}.task-manifest.v1.json`);
}

export function readV6TaskManifestV1(input: { outputDir: string; runId: string }): PersistedV6TaskManifestV1 | null {
  const absolutePath = resolveV6TaskManifestV1Path(input.outputDir, input.runId);
  if (!fs.existsSync(absolutePath)) return null;
  const text = fs.readFileSync(absolutePath, "utf8");
  let manifest: V6TaskManifestV1;
  try {
    manifest = JSON.parse(text) as V6TaskManifestV1;
  } catch (error) {
    throw new Error(`v6 task manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  validateV6TaskManifestV1(manifest);
  if (manifest.runId !== input.runId) throw new Error("existing v6 task manifest belongs to another run");
  return { manifest: structuredClone(manifest), absolutePath, fileHash: hashText(text), reused: true };
}

export function loadOrCreateV6TaskManifestV1(input: {
  outputDir: string;
  runId: string;
  createManifest: () => V6TaskManifestV1;
}): PersistedV6TaskManifestV1 {
  fs.mkdirSync(input.outputDir, { recursive: true });
  const existing = readV6TaskManifestV1(input);
  if (existing) return existing;
  const manifest = structuredClone(input.createManifest());
  validateV6TaskManifestV1(manifest);
  if (manifest.runId !== input.runId) throw new Error("new v6 task manifest belongs to another run");
  const absolutePath = resolveV6TaskManifestV1Path(input.outputDir, input.runId);
  const temporaryPath = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporaryPath, "wx");
    fs.writeFileSync(descriptor, text, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.linkSync(temporaryPath, absolutePath);
    try { fs.unlinkSync(temporaryPath); } catch { /* authoritative link is already published */ }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    if (!fs.existsSync(absolutePath)) throw error;
    const raced = readV6TaskManifestV1(input);
    if (!raced) throw error;
    return raced;
  }
  return { manifest: structuredClone(manifest), absolutePath, fileHash: hashText(text), reused: false };
}
