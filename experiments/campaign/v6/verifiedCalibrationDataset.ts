import * as fs from "node:fs";
import * as path from "node:path";
import {
  governanceRefKey,
  type GovernanceEligibilityRule,
  type VersionedGovernanceRef,
} from "../../../src/lib/governance";
import { verifyRawRunData } from "../replayVerifier";
import {
  computeV6InteractionTraceHashV1,
  validateV6MonitoringAuditBindingV1,
  type V6AuditableRawRunData,
} from "./productionVerticalSlice";
import {
  validateV6MonitoringDesignV1,
  validateV6MonitoringSelectionV1,
} from "./monitoringDesign";
import {
  validateV6TaskManifestResolutionV1,
  validateV6TaskManifestV1,
} from "./v6TaskManifest";

export type V6CalibrationAllocationMode = "scheduled_engineering" | "randomized_precommitted";

export interface V6CalibrationStudyRegistryV1 {
  studyRef: VersionedGovernanceRef;
  governanceRules: readonly GovernanceEligibilityRule[];
  allocationMode: V6CalibrationAllocationMode;
  allowedTaskDefinitionHashes: readonly string[];
}

export interface V6CalibrationDatasetSpecV1 {
  datasetRef: VersionedGovernanceRef;
  studies: readonly V6CalibrationStudyRegistryV1[];
}

const VERIFIED = Symbol("VerifiedV6CalibrationArtifactV1");
const SHA256_RE = /^sha256:[0-9a-f]{64}$/;

export interface VerifiedV6CalibrationArtifactV1 {
  readonly sourcePath: string;
  readonly artifact: V6AuditableRawRunData;
  readonly allocationMode: V6CalibrationAllocationMode;
  readonly [VERIFIED]: true;
}

function stableJson(value: unknown): string {
  const normalize = (child: unknown): unknown => {
    if (Array.isArray(child)) return child.map(normalize);
    if (child !== null && typeof child === "object") {
      return Object.fromEntries(Object.entries(child as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]));
    }
    return child;
  };
  return JSON.stringify(normalize(value));
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const key of Reflect.ownKeys(object)) {
    deepFreeze((object as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

function requireVersionedRef(value: unknown, field: string): asserts value is VersionedGovernanceRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be a versioned reference`);
  }
  const ref = value as Record<string, unknown>;
  if (typeof ref.id !== "string" || ref.id.trim().length === 0
    || typeof ref.version !== "string" || ref.version.trim().length === 0) {
    throw new Error(`${field} id/version must be non-empty strings`);
  }
}

function validateDatasetSpec(spec: V6CalibrationDatasetSpecV1): void {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new Error("v6 calibration dataset spec must be an object");
  }
  requireVersionedRef(spec.datasetRef, "v6 calibration datasetRef");
  if (!Array.isArray(spec.studies) || spec.studies.length === 0) {
    throw new Error("v6 calibration dataset spec requires at least one frozen study registry");
  }
  const studyKeys: string[] = [];
  for (const [index, study] of spec.studies.entries()) {
    if (!study || typeof study !== "object" || Array.isArray(study)) {
      throw new Error(`v6 calibration study registry ${index} must be an object`);
    }
    requireVersionedRef(study.studyRef, `v6 calibration study registry ${index}.studyRef`);
    studyKeys.push(governanceRefKey(study.studyRef));
    if (study.allocationMode !== "scheduled_engineering"
      && study.allocationMode !== "randomized_precommitted") {
      throw new Error(`v6 calibration study registry ${index} has an invalid allocationMode`);
    }
    if (!Array.isArray(study.governanceRules)) {
      throw new Error(`v6 calibration study registry ${index}.governanceRules must be an array`);
    }
    const ruleKeys = study.governanceRules.map((rule: unknown, ruleIndex: number) => {
      requireVersionedRef(rule, `v6 calibration study registry ${index}.governanceRules[${ruleIndex}]`);
      return governanceRefKey(rule);
    });
    if (new Set(ruleKeys).size !== ruleKeys.length) {
      throw new Error(`v6 calibration study registry ${index} has duplicate governance rules`);
    }
    if (!Array.isArray(study.allowedTaskDefinitionHashes)
      || study.allowedTaskDefinitionHashes.length === 0
      || study.allowedTaskDefinitionHashes.some((hash: unknown) => typeof hash !== "string" || !SHA256_RE.test(hash))) {
      throw new Error(`v6 calibration study registry ${index} requires canonical task definition hashes`);
    }
    if (new Set(study.allowedTaskDefinitionHashes).size !== study.allowedTaskDefinitionHashes.length) {
      throw new Error(`v6 calibration study registry ${index} has duplicate task definition hashes`);
    }
  }
  if (new Set(studyKeys).size !== studyKeys.length) {
    throw new Error("v6 calibration dataset spec has duplicate studies");
  }
}

function requireFiniteNonNegative(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative finite number`);
  }
}

function requireStudyRegistry(
  artifact: V6AuditableRawRunData,
  spec: V6CalibrationDatasetSpecV1,
): V6CalibrationStudyRegistryV1 {
  const studyKey = governanceRefKey(artifact.governanceStudy);
  const matches = spec.studies.filter(study => governanceRefKey(study.studyRef) === studyKey);
  if (matches.length !== 1) throw new Error(`v6 calibration artifact ${artifact.runId} has no unique frozen study registry`);
  const declared = artifact.governanceStudy.governancePolicy?.eligibilityRuleRefs
    .map(governanceRefKey).sort() ?? [];
  const supplied = matches[0].governanceRules.map(governanceRefKey).sort();
  if (stableJson(declared) !== stableJson(supplied)) {
    throw new Error(`v6 calibration artifact ${artifact.runId} rule registry differs from the study declaration`);
  }
  return matches[0];
}

function validateV6CarrierForCalibration(
  artifact: V6AuditableRawRunData,
  sourcePath: string,
  registry: V6CalibrationStudyRegistryV1,
): void {
  if (!artifact || artifact.rawSchemaVersion !== "5.0") {
    throw new Error(`v6 calibration requires schema-5 raw runs: ${sourcePath}`);
  }
  if (typeof artifact.runId !== "string" || artifact.runId.trim().length === 0) {
    throw new Error(`v6 calibration artifact has no runId: ${sourcePath}`);
  }
  validateV6TaskManifestV1(artifact.v6TaskManifest);
  validateV6MonitoringDesignV1(artifact.v6MonitoringDesign);
  if (artifact.v6TaskManifest.runId !== artifact.runId
    || artifact.v6InteractionTrace.runId !== artifact.runId
    || artifact.v6TaskManifest.taskId !== artifact.v6InteractionTrace.taskId
    || governanceRefKey(artifact.v6TaskManifest.studyRef) !== governanceRefKey(artifact.governanceStudy)
    || governanceRefKey(artifact.v6TaskManifest.taskFamilyRef)
      !== governanceRefKey(artifact.governanceStudy.taskFamilyRef)
    || artifact.v6TaskManifest.monitoringDesignHash !== artifact.v6MonitoringDesign.contentHash
    || governanceRefKey(artifact.v6TaskManifest.monitoringDesignRef)
      !== governanceRefKey(artifact.v6MonitoringDesign.designRef)) {
    throw new Error(`v6 calibration task/monitoring carrier mismatch: ${artifact.runId}`);
  }
  const protocol = artifact.v6InteractionTrace.protocol;
  if (!["text_communication_v1", "explicit_belief_v1", "epistemic_governance_v1"].includes(protocol)
    || artifact.primaryArmExecution.implementationConfig.protocol !== protocol) {
    throw new Error(`v6 calibration interaction protocol differs from its assigned execution: ${artifact.runId}`);
  }
  const { contentHash: _traceHash, ...traceBody } = artifact.v6InteractionTrace;
  if (artifact.v6InteractionTrace.contentHash !== computeV6InteractionTraceHashV1(traceBody)) {
    throw new Error(`v6 calibration interaction trace contentHash mismatch: ${artifact.runId}`);
  }
  const manifestAgentIds = artifact.v6TaskManifest.orderedAgentCommitments.map(agent => agent.agentId);
  if (artifact.finalOutcome.taskId !== artifact.v6TaskManifest.taskId
    || stableJson(artifact.finalOutcome.expectedAgentIds) !== stableJson(manifestAgentIds)
    || artifact.finalOutcome.claims.length !== 1
    || stableJson(artifact.finalOutcome.claims[0]) !== stableJson(artifact.v6TaskManifest.primaryClaim)
    || stableJson(artifact.v6InteractionTrace.expectedAgentIds) !== stableJson(manifestAgentIds)) {
    throw new Error(`v6 calibration final outcome differs from the task commitment: ${artifact.runId}`);
  }
  if (!Array.isArray(registry.allowedTaskDefinitionHashes)
    || registry.allowedTaskDefinitionHashes.length === 0
    || !registry.allowedTaskDefinitionHashes.includes(artifact.v6TaskManifest.taskDefinitionHash)) {
    throw new Error(`v6 calibration task definition is outside the frozen allowlist: ${artifact.runId}`);
  }
  if (Date.parse(artifact.v6TaskManifest.committedAt) > Date.parse(artifact.operationalAnalysisUnit.committedAt)
    || Date.parse(artifact.operationalAnalysisUnit.committedAt)
      > Date.parse(artifact.primaryAssignmentManifest.assignment.assignedAt)) {
    throw new Error(`v6 calibration pre-assignment commitment order is invalid: ${artifact.runId}`);
  }
  const resolution = artifact.finalOutcome.resolutions[0];
  if (artifact.finalOutcome.resolutions.length !== 1 || !resolution
    || resolution.kind !== artifact.v6TaskManifest.primaryClaim.resolutionPolicy.kind) {
    throw new Error(`v6 calibration requires exactly one resolution matching the committed claim: ${artifact.runId}`);
  }
  validateV6TaskManifestResolutionV1(artifact.v6TaskManifest, resolution);
  const traceReports = artifact.v6InteractionTrace.epistemicEvents
    .filter(event => event.type === "belief_reported")
    .map(event => event.report);
  if (artifact.v6InteractionTrace.protocol === "epistemic_governance_v1") {
    const selection = artifact.v6InteractionTrace.monitoringSelection;
    if (!selection) throw new Error(`v6 governance calibration run lacks monitoring selection: ${artifact.runId}`);
    validateV6MonitoringSelectionV1(selection, artifact.v6MonitoringDesign);
    const firstRoundIds = traceReports.filter(report => report.round === 1).map(report => report.id).sort();
    if (stableJson(firstRoundIds) !== stableJson(selection.candidateReportIds)) {
      throw new Error(`v6 calibration monitoring population mismatch: ${artifact.runId}`);
    }
  } else if (artifact.v6InteractionTrace.monitoringSelection !== undefined) {
    throw new Error(`non-governance calibration run claims a monitoring selection: ${artifact.runId}`);
  }
  validateV6MonitoringAuditBindingV1(artifact);
  requireFiniteNonNegative(artifact.operationalOutcome.primaryMetric.value, `operational Brier for ${artifact.runId}`);
  if (artifact.operationalOutcome.primaryMetric.direction !== "lower_is_better") {
    throw new Error(`v6 calibration primary metric direction is invalid: ${artifact.runId}`);
  }
  requireFiniteNonNegative(artifact.tokenUsage?.promptTokens, `prompt tokens for ${artifact.runId}`);
  requireFiniteNonNegative(artifact.tokenUsage?.completionTokens, `completion tokens for ${artifact.runId}`);
  requireFiniteNonNegative(artifact.tokenUsage?.totalTokens, `total tokens for ${artifact.runId}`);
  requireFiniteNonNegative(artifact.tokenUsage?.totalLatencyMs, `latency for ${artifact.runId}`);
  if (artifact.tokenUsage!.totalTokens !== artifact.tokenUsage!.promptTokens + artifact.tokenUsage!.completionTokens) {
    throw new Error(`v6 calibration token totals do not add up: ${artifact.runId}`);
  }
  if ((artifact.taskOutcome.status === "scored") !== (typeof artifact.taskOutcome.quality === "number")) {
    throw new Error(`v6 calibration taskOutcome status/quality mismatch: ${artifact.runId}`);
  }
  const replay = verifyRawRunData(sourcePath, artifact, { governanceRules: [...registry.governanceRules] });
  if (replay.governanceAuditStatus !== "sealed_decision_replay_verified" || replay.runIssues.length > 0) {
    throw new Error(
      `v6 calibration replay failed for ${artifact.runId}: ${replay.runIssues.map(issue => issue.code).join(",")}`,
    );
  }
}

export function verifyV6CalibrationArtifactsV1(input: {
  artifacts: ReadonlyArray<{ sourcePath: string; artifact: unknown }>;
  spec: V6CalibrationDatasetSpecV1;
}): VerifiedV6CalibrationArtifactV1[] {
  validateDatasetSpec(input.spec);
  const seenRunIds = new Set<string>();
  const verified: VerifiedV6CalibrationArtifactV1[] = [];
  for (const item of input.artifacts) {
    const artifact = item.artifact as V6AuditableRawRunData;
    const registry = requireStudyRegistry(artifact, input.spec);
    validateV6CarrierForCalibration(artifact, item.sourcePath, registry);
    if (seenRunIds.has(artifact.runId)) {
      throw new Error(`v6 calibration dataset contains duplicate runId ${artifact.runId}`);
    }
    seenRunIds.add(artifact.runId);
    const verifiedArtifact = deepFreeze(structuredClone(artifact));
    verified.push(Object.freeze({
      sourcePath: item.sourcePath,
      artifact: verifiedArtifact,
      allocationMode: registry.allocationMode,
      [VERIFIED]: true as const,
    }));
  }
  return verified.sort((left, right) => left.artifact.runId.localeCompare(right.artifact.runId));
}

export function loadVerifiedV6CalibrationDatasetV1(input: {
  directories: readonly string[];
  spec: V6CalibrationDatasetSpecV1;
}): VerifiedV6CalibrationArtifactV1[] {
  if (!Array.isArray(input.directories) || input.directories.length === 0) {
    throw new Error("v6 calibration loader requires at least one directory");
  }
  const artifacts: Array<{ sourcePath: string; artifact: unknown }> = [];
  for (const directory of input.directories) {
    const absoluteDirectory = path.resolve(directory);
    if (!fs.existsSync(absoluteDirectory) || !fs.statSync(absoluteDirectory).isDirectory()) {
      throw new Error(`v6 calibration directory does not exist: ${absoluteDirectory}`);
    }
    const files = fs.readdirSync(absoluteDirectory)
      .filter(file => file.endsWith(".raw-run.v5.json"))
      .sort();
    if (files.length === 0) throw new Error(`v6 calibration directory has no raw runs: ${absoluteDirectory}`);
    for (const file of files) {
      const sourcePath = path.join(absoluteDirectory, file);
      let artifact: unknown;
      try {
        artifact = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
      } catch (error) {
        throw new Error(`v6 calibration artifact is not valid JSON (${sourcePath}): ${error instanceof Error ? error.message : String(error)}`);
      }
      artifacts.push({ sourcePath, artifact });
    }
  }
  return verifyV6CalibrationArtifactsV1({ artifacts, spec: input.spec });
}

export function isVerifiedV6CalibrationArtifactV1(
  value: unknown,
): value is VerifiedV6CalibrationArtifactV1 {
  return Boolean(value && typeof value === "object" && (value as Record<PropertyKey, unknown>)[VERIFIED] === true);
}
