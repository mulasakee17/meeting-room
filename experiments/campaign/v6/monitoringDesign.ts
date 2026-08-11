import { createHash } from "node:crypto";
import type { BeliefReport, EpistemicEvidence } from "../../../src/lib/epistemic";
import {
  governanceRefKey,
  validateGovernanceRef,
  type VersionedGovernanceRef,
} from "../../../src/lib/governance";

export const V6_MONITORING_DESIGN_SCHEMA_V1 = Object.freeze({
  id: "swarmalpha.v6.monitoring-design",
  version: "1.0.0",
});

export const V6_MONITORING_SELECTION_V1 = Object.freeze({
  id: "swarmalpha.v6.monitoring-selection",
  version: "1.0.0",
});

export const V6_VERIFIED_LINEAGE_MEASUREMENT_V1 = Object.freeze({
  id: "swarmalpha.measurement.verified-independent-lineage-count",
  version: "1.0.0",
});

export interface V6MonitoringDesignV1 {
  artifactSchemaRef: VersionedGovernanceRef;
  designRef: VersionedGovernanceRef;
  preregistrationRef: VersionedGovernanceRef;
  population: {
    eventKind: "belief_reported";
    round: 1;
    claimScope: "primary_claim";
    reportStatus: "architecture_recorded";
  };
  selection: {
    kind: "seeded_uniform_one";
    seedNamespace: string;
    orderPolicy: "canonical_report_id";
    selectionStage: "before_diagnosis";
  };
  lineageMeasurement: {
    methodRef: VersionedGovernanceRef;
    acceptedSourceKinds: ["tool", "dataset", "external"];
    verificationRequirement: "passed_identity_or_provenance";
    missingLineageResult: 0;
  };
  frozenAt: string;
  contentHash: string;
}

export interface V6MonitoringSelectionV1 {
  artifactSchemaRef: VersionedGovernanceRef;
  runId: string;
  designRef: VersionedGovernanceRef;
  designHash: string;
  candidateReportIds: string[];
  status: "selected" | "empty_population";
  masterSeed: number;
  seedCommitment: string;
  randomDraw: number | null;
  selectedReportId: string | null;
  selectionProbability: number;
  selectedAt: string;
  contentHash: string;
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

function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be non-empty`);
}

function requireTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) {
    throw new Error(`${field} must be a canonical ISO timestamp`);
  }
}

function designBody(design: V6MonitoringDesignV1): Omit<V6MonitoringDesignV1, "contentHash"> {
  const { contentHash: _contentHash, ...body } = design;
  return body;
}

function selectionBody(selection: V6MonitoringSelectionV1): Omit<V6MonitoringSelectionV1, "contentHash"> {
  const { contentHash: _contentHash, ...body } = selection;
  return body;
}

export function computeV6MonitoringDesignHashV1(
  design: Omit<V6MonitoringDesignV1, "contentHash">,
): string {
  return hashCanonical(design);
}

export function createV6MonitoringDesignV1(input: {
  designRef: VersionedGovernanceRef;
  preregistrationRef: VersionedGovernanceRef;
  seedNamespace: string;
  frozenAt: string;
}): V6MonitoringDesignV1 {
  const body: Omit<V6MonitoringDesignV1, "contentHash"> = {
    artifactSchemaRef: structuredClone(V6_MONITORING_DESIGN_SCHEMA_V1),
    designRef: structuredClone(input.designRef),
    preregistrationRef: structuredClone(input.preregistrationRef),
    population: {
      eventKind: "belief_reported",
      round: 1,
      claimScope: "primary_claim",
      reportStatus: "architecture_recorded",
    },
    selection: {
      kind: "seeded_uniform_one",
      seedNamespace: input.seedNamespace,
      orderPolicy: "canonical_report_id",
      selectionStage: "before_diagnosis",
    },
    lineageMeasurement: {
      methodRef: structuredClone(V6_VERIFIED_LINEAGE_MEASUREMENT_V1),
      acceptedSourceKinds: ["tool", "dataset", "external"],
      verificationRequirement: "passed_identity_or_provenance",
      missingLineageResult: 0,
    },
    frozenAt: input.frozenAt,
  };
  const design = { ...body, contentHash: computeV6MonitoringDesignHashV1(body) };
  validateV6MonitoringDesignV1(design);
  return design;
}

export function validateV6MonitoringDesignV1(design: V6MonitoringDesignV1): void {
  if (!design || governanceRefKey(design.artifactSchemaRef) !== governanceRefKey(V6_MONITORING_DESIGN_SCHEMA_V1)) {
    throw new Error("v6 monitoring design schema ref is invalid");
  }
  const expectedKeys = [
    "artifactSchemaRef", "contentHash", "designRef", "frozenAt", "lineageMeasurement",
    "population", "preregistrationRef", "selection",
  ];
  if (stableJson(Object.keys(design).sort()) !== stableJson(expectedKeys)) {
    throw new Error("v6 monitoring design contains unexpected or missing fields");
  }
  validateGovernanceRef(design.designRef, "v6 monitoring designRef");
  validateGovernanceRef(design.preregistrationRef, "v6 monitoring preregistrationRef");
  requireTimestamp(design.frozenAt, "v6 monitoring frozenAt");
  if (design.population.eventKind !== "belief_reported" || design.population.round !== 1
    || design.population.claimScope !== "primary_claim" || design.population.reportStatus !== "architecture_recorded") {
    throw new Error("v6 monitoring population differs from the frozen v1 population");
  }
  if (design.selection.kind !== "seeded_uniform_one"
    || design.selection.orderPolicy !== "canonical_report_id"
    || design.selection.selectionStage !== "before_diagnosis") {
    throw new Error("v6 monitoring selection differs from the frozen v1 design");
  }
  requireNonEmpty(design.selection.seedNamespace, "v6 monitoring seedNamespace");
  if (governanceRefKey(design.lineageMeasurement.methodRef) !== governanceRefKey(V6_VERIFIED_LINEAGE_MEASUREMENT_V1)
    || stableJson(design.lineageMeasurement.acceptedSourceKinds) !== stableJson(["tool", "dataset", "external"])
    || design.lineageMeasurement.verificationRequirement !== "passed_identity_or_provenance"
    || design.lineageMeasurement.missingLineageResult !== 0) {
    throw new Error("v6 monitoring lineage measurement differs from the frozen v1 method");
  }
  if (!SHA256_RE.test(design.contentHash)
    || design.contentHash !== computeV6MonitoringDesignHashV1(designBody(design))) {
    throw new Error("v6 monitoring design contentHash mismatch");
  }
}

function deriveMonitoringSeedCommitment(input: {
  design: V6MonitoringDesignV1;
  runId: string;
  candidateReportIds: readonly string[];
  masterSeed: number;
}): string {
  return hashCanonical({
    algorithmRef: { id: "swarmalpha.randomization.sha256-uniform-index", version: "1.0.0" },
    seedNamespace: input.design.selection.seedNamespace,
    runId: input.runId,
    candidateReportIds: [...input.candidateReportIds],
    masterSeed: input.masterSeed,
  });
}

function randomDrawFromCommitment(commitment: string): number {
  const first52Bits = Number.parseInt(commitment.slice("sha256:".length, "sha256:".length + 13), 16);
  return first52Bits / 0x10000000000000;
}

export function computeV6MonitoringSelectionHashV1(
  selection: Omit<V6MonitoringSelectionV1, "contentHash">,
): string {
  return hashCanonical(selection);
}

export function createV6MonitoringSelectionV1(input: {
  design: V6MonitoringDesignV1;
  runId: string;
  candidateReportIds: readonly string[];
  masterSeed: number;
  selectedAt: string;
}): V6MonitoringSelectionV1 {
  validateV6MonitoringDesignV1(input.design);
  requireNonEmpty(input.runId, "v6 monitoring runId");
  if (!Number.isSafeInteger(input.masterSeed) || input.masterSeed < 0) {
    throw new Error("v6 monitoring masterSeed must be a non-negative safe integer");
  }
  const candidates = [...input.candidateReportIds].sort();
  if (candidates.some(candidate => typeof candidate !== "string" || candidate.trim().length === 0)
    || new Set(candidates).size !== candidates.length) {
    throw new Error("v6 monitoring candidates must be unique non-empty report ids");
  }
  const seedCommitment = deriveMonitoringSeedCommitment({
    design: input.design,
    runId: input.runId,
    candidateReportIds: candidates,
    masterSeed: input.masterSeed,
  });
  const randomDraw = candidates.length > 0 ? randomDrawFromCommitment(seedCommitment) : null;
  const selectedReportId = randomDraw === null
    ? null
    : candidates[Math.min(candidates.length - 1, Math.floor(randomDraw * candidates.length))];
  const body: Omit<V6MonitoringSelectionV1, "contentHash"> = {
    artifactSchemaRef: structuredClone(V6_MONITORING_SELECTION_V1),
    runId: input.runId,
    designRef: structuredClone(input.design.designRef),
    designHash: input.design.contentHash,
    candidateReportIds: candidates,
    status: candidates.length > 0 ? "selected" : "empty_population",
    masterSeed: input.masterSeed,
    seedCommitment,
    randomDraw,
    selectedReportId,
    selectionProbability: candidates.length > 0 ? 1 / candidates.length : 0,
    selectedAt: input.selectedAt,
  };
  const selection = { ...body, contentHash: computeV6MonitoringSelectionHashV1(body) };
  validateV6MonitoringSelectionV1(selection, input.design);
  return selection;
}

export function validateV6MonitoringSelectionV1(
  selection: V6MonitoringSelectionV1,
  design: V6MonitoringDesignV1,
): void {
  validateV6MonitoringDesignV1(design);
  if (!selection || governanceRefKey(selection.artifactSchemaRef) !== governanceRefKey(V6_MONITORING_SELECTION_V1)) {
    throw new Error("v6 monitoring selection schema ref is invalid");
  }
  requireNonEmpty(selection.runId, "v6 monitoring selection runId");
  requireTimestamp(selection.selectedAt, "v6 monitoring selectedAt");
  if (governanceRefKey(selection.designRef) !== governanceRefKey(design.designRef)
    || selection.designHash !== design.contentHash) {
    throw new Error("v6 monitoring selection belongs to another design");
  }
  const expected = createV6MonitoringSelectionUnchecked({
    design,
    runId: selection.runId,
    candidateReportIds: selection.candidateReportIds,
    masterSeed: selection.masterSeed,
    selectedAt: selection.selectedAt,
  });
  if (stableJson(selection) !== stableJson(expected)) {
    throw new Error("v6 monitoring selection does not replay from its frozen design and seed");
  }
}

function createV6MonitoringSelectionUnchecked(
  input: Parameters<typeof createV6MonitoringSelectionV1>[0],
): V6MonitoringSelectionV1 {
  const candidates = [...input.candidateReportIds].sort();
  const seedCommitment = deriveMonitoringSeedCommitment({
    design: input.design,
    runId: input.runId,
    candidateReportIds: candidates,
    masterSeed: input.masterSeed,
  });
  const randomDraw = randomDrawFromCommitment(seedCommitment);
  const hasCandidates = candidates.length > 0;
  const body: Omit<V6MonitoringSelectionV1, "contentHash"> = {
    artifactSchemaRef: structuredClone(V6_MONITORING_SELECTION_V1),
    runId: input.runId,
    designRef: structuredClone(input.design.designRef),
    designHash: input.design.contentHash,
    candidateReportIds: candidates,
    status: hasCandidates ? "selected" : "empty_population",
    masterSeed: input.masterSeed,
    seedCommitment,
    randomDraw: hasCandidates ? randomDraw : null,
    selectedReportId: hasCandidates
      ? candidates[Math.min(candidates.length - 1, Math.floor(randomDraw * candidates.length))]
      : null,
    selectionProbability: hasCandidates ? 1 / candidates.length : 0,
    selectedAt: input.selectedAt,
  };
  return { ...body, contentHash: computeV6MonitoringSelectionHashV1(body) };
}

/**
 * Counts only independently identified lineages whose identity/provenance has
 * already been verified outside the reporting agent. Self-declared agent
 * lineage ids are deliberately not promoted to verified support.
 */
export function deriveVerifiedIndependentLineageCountV1(input: {
  report: BeliefReport;
  evidence: readonly EpistemicEvidence[];
  verifiedEvidenceIds: readonly string[];
}): number {
  const verified = new Set(input.verifiedEvidenceIds);
  const referenced = new Set(input.report.evidence.map(reference => reference.evidenceId));
  const acceptedKinds = new Set(["tool", "dataset", "external"]);
  const lineages = new Set<string>();
  for (const evidence of input.evidence) {
    if (!referenced.has(evidence.id) || !verified.has(evidence.id)
      || !acceptedKinds.has(evidence.provenance.sourceKind)) continue;
    lineages.add(evidence.provenance.lineageId
      ?? `${evidence.provenance.sourceKind}:${evidence.provenance.sourceId}`);
  }
  return lineages.size;
}
