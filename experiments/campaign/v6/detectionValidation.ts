import { createHash } from "node:crypto";
import {
  scoreBinaryReport,
  scoreBeliefReport,
  scoreCategoricalReport,
  type CategoricalBeliefValue,
} from "../../../src/lib/epistemic";
import {
  governanceRefKey,
  validateGovernanceRef,
  type GovernanceEligibilityRule,
  type VersionedGovernanceRef,
} from "../../../src/lib/governance";
import {
  HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_V2,
} from "../../../src/lib/governance/epistemicEligibilityRules";
import {
  HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2,
} from "../../../src/lib/governance/standardEpistemicActions";
import {
  isVerifiedV6CalibrationArtifactV1,
  type V6CalibrationAllocationMode,
  type VerifiedV6CalibrationArtifactV1,
} from "./verifiedCalibrationDataset";

export const V6_DETECTION_VALIDATION_RECORD_V1 = Object.freeze({
  id: "swarmalpha.v6.detection-validation-record",
  version: "1.0.0",
});

export const V6_DETECTION_VALIDATION_RECORD_V2 = Object.freeze({
  id: "swarmalpha.v6.detection-validation-record",
  version: "2.0.0",
});

const VERIFIED_DETECTION_RECORD = Symbol("VerifiedV6DetectionValidationRecordV1");
const VERIFIED_DETECTION_RECORD_V2 = Symbol("VerifiedV6DetectionValidationRecordV2");

export interface V6DetectionValidationRecordV1 {
  artifactSchemaRef: typeof V6_DETECTION_VALIDATION_RECORD_V1;
  runId: string;
  studyRef: VersionedGovernanceRef;
  taskFamilyRef: VersionedGovernanceRef;
  taskDefinitionHash: string;
  allocationMode: V6CalibrationAllocationMode;
  calibrationDomainHash: string;
  selectedReportId: string;
  selectedAgentId: string;
  selectionProbability: number;
  inclusionWeight: number;
  reportedProbability: number;
  reportedCertainty: number;
  /** Count of qualified verification records, not a claim about latent real-world sources. */
  verifiedIndependentLineageRecordCount: number;
  verifierAvailable: boolean;
  thresholdPolicyRef: VersionedGovernanceRef;
  certaintyThreshold: number;
  maxVerifiedIndependentLineages: number;
  thresholdSatisfied: boolean;
  operationalRiskPredicate: boolean;
  recordedRuleEligible: boolean;
  resolvedOutcome: boolean;
  reportBrierLoss: number;
  hardOutcomeLabel: "correct" | "incorrect" | "tie";
  sourceRefs: {
    taskManifestHash: string;
    interactionTraceHash: string;
    monitoringSelectionHash: string;
    governanceSourceEventHash: string;
    finalOutcomeHash: string;
  };
  contentHash: string;
}

/**
 * In-process authority produced only by projection from a verified schema-5
 * artifact. The symbol is intentionally not serialized: a persisted record
 * must be rebound to its source artifact instead of trusting its own hash.
 */
export interface VerifiedV6DetectionValidationRecordV1 extends V6DetectionValidationRecordV1 {
  readonly [VERIFIED_DETECTION_RECORD]: true;
}

export interface V6DetectionValidationSummaryV1 {
  inferenceStatus: "descriptive_calibration_only";
  calibrationDomainHash: string;
  allocationMode: V6CalibrationAllocationMode;
  recordCount: number;
  weightedPopulationSize: number;
  weightedMeanReportBrier: number;
  weightedFlaggedMeanReportBrier: number | null;
  weightedUnflaggedMeanReportBrier: number | null;
  /** Positive means the frozen predicate marks reports with higher proper loss. */
  weightedBrierRiskGap: number | null;
  weightedRiskFlagRate: number;
  weightedTieRate: number;
  confusionWeights: {
    truePositive: number;
    falsePositive: number;
    falseNegative: number;
    trueNegative: number;
  };
  precision: number | null;
  recall: number | null;
  specificity: number | null;
}

/**
 * Categorical detector-validation projection. V2 is separate from the binary
 * V1 carrier because a probability vector, option geometry, multiclass Brier
 * loss, and top-option tie semantics cannot be added without changing meaning.
 */
export interface V6DetectionValidationRecordV2 {
  artifactSchemaRef: typeof V6_DETECTION_VALIDATION_RECORD_V2;
  runId: string;
  studyRef: VersionedGovernanceRef;
  taskFamilyRef: VersionedGovernanceRef;
  taskDefinitionHash: string;
  allocationMode: V6CalibrationAllocationMode;
  calibrationDomainHash: string;
  selectedReportId: string;
  selectedAgentId: string;
  selectionProbability: number;
  inclusionWeight: number;
  beliefKind: "categorical";
  claimOptionCount: number;
  canonicalOptions: string[];
  reportedBelief: CategoricalBeliefValue;
  reportedCertainty: number;
  /** Count of qualified verification records, not latent independent sources. */
  verifiedIndependentLineageRecordCount: number;
  verifierAvailable: boolean;
  thresholdPolicyRef: VersionedGovernanceRef;
  certaintyThreshold: number;
  maxVerifiedIndependentLineages: number;
  thresholdSatisfied: boolean;
  operationalRiskPredicate: boolean;
  recordedRuleEligible: boolean;
  resolvedOutcome: string;
  /** Multiclass Brier sum over the committed canonical option coordinates. */
  reportBrierLoss: number;
  hardOutcomeLabel: "correct" | "incorrect" | "tie";
  sourceRefs: {
    taskManifestHash: string;
    interactionTraceHash: string;
    monitoringSelectionHash: string;
    governanceSourceEventHash: string;
    finalOutcomeHash: string;
  };
  contentHash: string;
}

export interface VerifiedV6DetectionValidationRecordV2 extends V6DetectionValidationRecordV2 {
  readonly [VERIFIED_DETECTION_RECORD_V2]: true;
}

export interface V6DetectionValidationSummaryV2 extends V6DetectionValidationSummaryV1 {
  beliefKind: "categorical";
  claimOptionCount: number;
  properLossGeometry: "multiclass_brier_sum";
}

/**
 * Non-control diagnostic projected from every first-round explicit report in
 * B or G. It is deliberately not a schema-5 authority object: it cannot cause
 * an action and exists only to compare pre-action risk populations without
 * changing either arm or sampling one report post hoc.
 */
export interface V6PreActionDetectionCensusRowV1 {
  inferenceStatus: "descriptive_shadow_only";
  runId: string;
  protocol: "explicit_belief_v1" | "epistemic_governance_v1";
  reportId: string;
  agentId: string;
  beliefKind: "binary" | "categorical";
  claimOptionCount: number;
  reportedCertainty: number;
  verifiedIndependentLineageRecordCount: 0;
  lineageMeasurementStatus: "no_pre_action_verification_records";
  certaintyThreshold: number;
  maxVerifiedIndependentLineages: number;
  operationalRiskPredicate: boolean;
  resolvedProperLoss: number;
  hardOutcomeLabel: "correct" | "incorrect" | "tie";
  calibrationDomainHash: string;
  sourceRefs: {
    taskManifestHash: string;
    interactionTraceHash: string;
    finalOutcomeHash: string;
    ruleConfigHash: string;
  };
}

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;

function canonicalize(value: unknown, field = "value", ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${field} must contain finite numbers`);
    return value;
  }
  if (typeof value !== "object") throw new Error(`${field} must contain JSON values only`);
  if (ancestors.has(value)) throw new Error(`${field} must not contain cycles`);
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${field} must contain plain objects only`);
  }
  const next = new Set(ancestors);
  next.add(value);
  if (Array.isArray(value)) {
    return value.map((child, index) => canonicalize(child, `${field}[${index}]`, next));
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, canonicalize(child, `${field}.${key}`, next)]));
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function hashCanonical(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value), "utf8").digest("hex")}`;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be non-empty`);
}

function requireProbability(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be finite within [0,1]`);
  }
}

function requireExactKeys(value: object, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const frozen = [...expected].sort();
  if (stableJson(actual) !== stableJson(frozen)) {
    throw new Error(`${field} fields differ from the frozen v1 schema`);
  }
}

function recordBody(
  record: V6DetectionValidationRecordV1,
): Omit<V6DetectionValidationRecordV1, "contentHash"> {
  const { contentHash: _contentHash, ...body } = record;
  return body;
}

export function computeV6DetectionValidationRecordHashV1(
  record: Omit<V6DetectionValidationRecordV1, "contentHash">,
): string {
  return hashCanonical(record);
}

export function validateV6DetectionValidationRecordV1(record: V6DetectionValidationRecordV1): void {
  if (!record || governanceRefKey(record.artifactSchemaRef) !== governanceRefKey(V6_DETECTION_VALIDATION_RECORD_V1)) {
    throw new Error("v6 detection validation record schema ref is invalid");
  }
  requireExactKeys(record, [
    "allocationMode", "artifactSchemaRef", "calibrationDomainHash", "certaintyThreshold",
    "contentHash", "hardOutcomeLabel", "inclusionWeight", "maxVerifiedIndependentLineages",
    "operationalRiskPredicate", "recordedRuleEligible", "reportedCertainty", "reportedProbability",
    "resolvedOutcome", "reportBrierLoss", "runId", "selectedAgentId", "selectedReportId",
    "selectionProbability", "sourceRefs", "studyRef", "taskDefinitionHash", "taskFamilyRef",
    "thresholdPolicyRef", "thresholdSatisfied", "verifiedIndependentLineageRecordCount",
    "verifierAvailable",
  ], "detectionValidation");
  requireExactKeys(record.sourceRefs, [
    "finalOutcomeHash", "governanceSourceEventHash", "interactionTraceHash",
    "monitoringSelectionHash", "taskManifestHash",
  ], "detectionValidation.sourceRefs");
  validateGovernanceRef(record.artifactSchemaRef, "detectionValidation.artifactSchemaRef");
  validateGovernanceRef(record.studyRef, "detectionValidation.studyRef");
  validateGovernanceRef(record.taskFamilyRef, "detectionValidation.taskFamilyRef");
  validateGovernanceRef(record.thresholdPolicyRef, "detectionValidation.thresholdPolicyRef");
  requireNonEmpty(record.runId, "detectionValidation.runId");
  requireNonEmpty(record.selectedReportId, "detectionValidation.selectedReportId");
  requireNonEmpty(record.selectedAgentId, "detectionValidation.selectedAgentId");
  for (const [field, hash] of Object.entries({
    calibrationDomainHash: record.calibrationDomainHash,
    taskDefinitionHash: record.taskDefinitionHash,
    ...record.sourceRefs,
  })) {
    if (typeof hash !== "string" || !SHA256_RE.test(hash)) {
      throw new Error(`detectionValidation.${field} must be a canonical sha256 hash`);
    }
  }
  if (record.allocationMode !== "scheduled_engineering"
    && record.allocationMode !== "randomized_precommitted") {
    throw new Error("detectionValidation.allocationMode is invalid");
  }
  requireProbability(record.selectionProbability, "detectionValidation.selectionProbability");
  if (record.selectionProbability <= 0
    || !Number.isFinite(record.inclusionWeight)
    || Math.abs(record.inclusionWeight - 1 / record.selectionProbability) > 1e-12) {
    throw new Error("detectionValidation inclusion weight must invert a positive selection probability");
  }
  requireProbability(record.reportedProbability, "detectionValidation.reportedProbability");
  requireProbability(record.reportedCertainty, "detectionValidation.reportedCertainty");
  if (Math.abs(record.reportedCertainty
    - Math.max(record.reportedProbability, 1 - record.reportedProbability)) > 1e-12) {
    throw new Error("detectionValidation reported certainty does not replay from probability");
  }
  if (!Number.isSafeInteger(record.verifiedIndependentLineageRecordCount)
    || record.verifiedIndependentLineageRecordCount < 0
    || !Number.isSafeInteger(record.maxVerifiedIndependentLineages)
    || record.maxVerifiedIndependentLineages < 0) {
    throw new Error("detectionValidation lineage counts must be non-negative safe integers");
  }
  for (const [field, value] of Object.entries({
    thresholdSatisfied: record.thresholdSatisfied,
    operationalRiskPredicate: record.operationalRiskPredicate,
    recordedRuleEligible: record.recordedRuleEligible,
    verifierAvailable: record.verifierAvailable,
    resolvedOutcome: record.resolvedOutcome,
  })) {
    if (typeof value !== "boolean") throw new Error(`detectionValidation.${field} must be boolean`);
  }
  requireProbability(record.certaintyThreshold, "detectionValidation.certaintyThreshold");
  if (record.certaintyThreshold <= 0.5) {
    throw new Error("detectionValidation certainty threshold must exceed 0.5");
  }
  const thresholdSatisfied = record.reportedCertainty >= record.certaintyThreshold;
  const riskPredicate = thresholdSatisfied
    && record.verifiedIndependentLineageRecordCount <= record.maxVerifiedIndependentLineages;
  if (record.thresholdSatisfied !== thresholdSatisfied
    || record.operationalRiskPredicate !== riskPredicate
    || record.recordedRuleEligible !== (riskPredicate && record.verifierAvailable)) {
    throw new Error("detectionValidation predicate fields do not replay from frozen inputs");
  }
  const expectedBrier = (record.reportedProbability - (record.resolvedOutcome ? 1 : 0)) ** 2;
  if (!Number.isFinite(record.reportBrierLoss)
    || Math.abs(record.reportBrierLoss - expectedBrier) > 1e-12) {
    throw new Error("detectionValidation Brier loss does not replay from report and resolution");
  }
  const expectedLabel = record.reportedProbability === 0.5
    ? "tie"
    : (record.reportedProbability > 0.5) === record.resolvedOutcome
      ? "correct"
      : "incorrect";
  if (record.hardOutcomeLabel !== expectedLabel) {
    throw new Error("detectionValidation hard outcome label does not replay");
  }
  if (record.contentHash !== computeV6DetectionValidationRecordHashV1(recordBody(record))) {
    throw new Error("detectionValidation contentHash mismatch");
  }
}

export function isVerifiedV6DetectionValidationRecordV1(
  value: unknown,
): value is VerifiedV6DetectionValidationRecordV1 {
  return Boolean(value
    && typeof value === "object"
    && (value as Record<PropertyKey, unknown>)[VERIFIED_DETECTION_RECORD] === true);
}

function recordBodyV2(
  record: V6DetectionValidationRecordV2,
): Omit<V6DetectionValidationRecordV2, "contentHash"> {
  const { contentHash: _contentHash, ...body } = record;
  return body;
}

export function computeV6DetectionValidationRecordHashV2(
  record: Omit<V6DetectionValidationRecordV2, "contentHash">,
): string {
  return hashCanonical(record);
}

function requireCanonicalOptions(options: unknown, field: string): asserts options is string[] {
  if (!Array.isArray(options) || options.length < 2
    || options.some(option => typeof option !== "string" || option.trim().length === 0)
    || new Set(options).size !== options.length) {
    throw new Error(`${field} must contain at least two unique non-empty options`);
  }
}

function categoricalHardOutcomeLabel(
  options: readonly string[],
  probabilities: Readonly<Record<string, number>>,
  outcome: string,
): "correct" | "incorrect" | "tie" {
  const maximum = Math.max(...options.map(option => probabilities[option]));
  const maximizers = options.filter(option => probabilities[option] === maximum);
  if (maximizers.length !== 1) return "tie";
  return maximizers[0] === outcome ? "correct" : "incorrect";
}

export function validateV6DetectionValidationRecordV2(record: V6DetectionValidationRecordV2): void {
  if (!record || governanceRefKey(record.artifactSchemaRef) !== governanceRefKey(V6_DETECTION_VALIDATION_RECORD_V2)) {
    throw new Error("v6 categorical detection validation record schema ref is invalid");
  }
  requireExactKeys(record, [
    "allocationMode", "artifactSchemaRef", "beliefKind", "calibrationDomainHash",
    "canonicalOptions", "certaintyThreshold", "claimOptionCount", "contentHash",
    "hardOutcomeLabel", "inclusionWeight", "maxVerifiedIndependentLineages",
    "operationalRiskPredicate", "recordedRuleEligible", "reportedBelief",
    "reportedCertainty", "resolvedOutcome", "reportBrierLoss", "runId",
    "selectedAgentId", "selectedReportId", "selectionProbability", "sourceRefs",
    "studyRef", "taskDefinitionHash", "taskFamilyRef", "thresholdPolicyRef",
    "thresholdSatisfied", "verifiedIndependentLineageRecordCount", "verifierAvailable",
  ], "categoricalDetectionValidation");
  requireExactKeys(record.sourceRefs, [
    "finalOutcomeHash", "governanceSourceEventHash", "interactionTraceHash",
    "monitoringSelectionHash", "taskManifestHash",
  ], "categoricalDetectionValidation.sourceRefs");
  requireExactKeys(record.reportedBelief, ["kind", "probabilities"], "categoricalDetectionValidation.reportedBelief");
  validateGovernanceRef(record.artifactSchemaRef, "categoricalDetectionValidation.artifactSchemaRef");
  validateGovernanceRef(record.studyRef, "categoricalDetectionValidation.studyRef");
  validateGovernanceRef(record.taskFamilyRef, "categoricalDetectionValidation.taskFamilyRef");
  validateGovernanceRef(record.thresholdPolicyRef, "categoricalDetectionValidation.thresholdPolicyRef");
  requireNonEmpty(record.runId, "categoricalDetectionValidation.runId");
  requireNonEmpty(record.selectedReportId, "categoricalDetectionValidation.selectedReportId");
  requireNonEmpty(record.selectedAgentId, "categoricalDetectionValidation.selectedAgentId");
  for (const [field, hash] of Object.entries({
    calibrationDomainHash: record.calibrationDomainHash,
    taskDefinitionHash: record.taskDefinitionHash,
    ...record.sourceRefs,
  })) {
    if (typeof hash !== "string" || !SHA256_RE.test(hash)) {
      throw new Error(`categoricalDetectionValidation.${field} must be a canonical sha256 hash`);
    }
  }
  if (record.allocationMode !== "scheduled_engineering"
    && record.allocationMode !== "randomized_precommitted") {
    throw new Error("categoricalDetectionValidation.allocationMode is invalid");
  }
  requireProbability(record.selectionProbability, "categoricalDetectionValidation.selectionProbability");
  if (record.selectionProbability <= 0
    || !Number.isFinite(record.inclusionWeight)
    || Math.abs(record.inclusionWeight - 1 / record.selectionProbability) > 1e-12) {
    throw new Error("categoricalDetectionValidation inclusion weight must invert selection probability");
  }
  if (record.beliefKind !== "categorical" || record.reportedBelief.kind !== "categorical") {
    throw new Error("categoricalDetectionValidation requires categorical belief semantics");
  }
  requireCanonicalOptions(record.canonicalOptions, "categoricalDetectionValidation.canonicalOptions");
  if (!Number.isSafeInteger(record.claimOptionCount)
    || record.claimOptionCount !== record.canonicalOptions.length) {
    throw new Error("categoricalDetectionValidation claimOptionCount must match canonical options");
  }
  const probabilityKeys = Object.keys(record.reportedBelief.probabilities).sort();
  const optionKeys = [...record.canonicalOptions].sort();
  if (stableJson(probabilityKeys) !== stableJson(optionKeys)) {
    throw new Error("categoricalDetectionValidation probability coordinates differ from canonical options");
  }
  let probabilitySum = 0;
  for (const option of record.canonicalOptions) {
    const probability = record.reportedBelief.probabilities[option];
    requireProbability(probability, `categoricalDetectionValidation.reportedBelief.probabilities.${option}`);
    probabilitySum += probability;
  }
  if (Math.abs(probabilitySum - 1) > 1e-9) {
    throw new Error("categoricalDetectionValidation probabilities must sum to one");
  }
  requireProbability(record.reportedCertainty, "categoricalDetectionValidation.reportedCertainty");
  const replayedCertainty = Math.max(...record.canonicalOptions
    .map(option => record.reportedBelief.probabilities[option]));
  if (Math.abs(record.reportedCertainty - replayedCertainty) > 1e-12) {
    throw new Error("categoricalDetectionValidation certainty does not replay from the probability vector");
  }
  if (!Number.isSafeInteger(record.verifiedIndependentLineageRecordCount)
    || record.verifiedIndependentLineageRecordCount < 0
    || !Number.isSafeInteger(record.maxVerifiedIndependentLineages)
    || record.maxVerifiedIndependentLineages < 0) {
    throw new Error("categoricalDetectionValidation lineage counts must be non-negative safe integers");
  }
  for (const [field, value] of Object.entries({
    thresholdSatisfied: record.thresholdSatisfied,
    operationalRiskPredicate: record.operationalRiskPredicate,
    recordedRuleEligible: record.recordedRuleEligible,
    verifierAvailable: record.verifierAvailable,
  })) {
    if (typeof value !== "boolean") throw new Error(`categoricalDetectionValidation.${field} must be boolean`);
  }
  requireProbability(record.certaintyThreshold, "categoricalDetectionValidation.certaintyThreshold");
  if (record.certaintyThreshold <= 1 / record.claimOptionCount) {
    throw new Error("categoricalDetectionValidation threshold must exceed its K-specific uniform baseline");
  }
  const thresholdSatisfied = record.reportedCertainty >= record.certaintyThreshold;
  const riskPredicate = thresholdSatisfied
    && record.verifiedIndependentLineageRecordCount <= record.maxVerifiedIndependentLineages;
  if (record.thresholdSatisfied !== thresholdSatisfied
    || record.operationalRiskPredicate !== riskPredicate
    || record.recordedRuleEligible !== (riskPredicate && record.verifierAvailable)) {
    throw new Error("categoricalDetectionValidation predicate fields do not replay from frozen inputs");
  }
  if (!record.canonicalOptions.includes(record.resolvedOutcome)) {
    throw new Error("categoricalDetectionValidation resolution is outside canonical options");
  }
  const expectedBrier = record.canonicalOptions.reduce(
    (sum, option) => sum + (record.reportedBelief.probabilities[option]
      - (option === record.resolvedOutcome ? 1 : 0)) ** 2,
    0,
  );
  if (!Number.isFinite(record.reportBrierLoss)
    || Math.abs(record.reportBrierLoss - expectedBrier) > 1e-12) {
    throw new Error("categoricalDetectionValidation Brier loss does not replay");
  }
  const expectedLabel = categoricalHardOutcomeLabel(
    record.canonicalOptions,
    record.reportedBelief.probabilities,
    record.resolvedOutcome,
  );
  if (record.hardOutcomeLabel !== expectedLabel) {
    throw new Error("categoricalDetectionValidation hard outcome label does not replay");
  }
  if (record.contentHash !== computeV6DetectionValidationRecordHashV2(recordBodyV2(record))) {
    throw new Error("categoricalDetectionValidation contentHash mismatch");
  }
}

export function isVerifiedV6DetectionValidationRecordV2(
  value: unknown,
): value is VerifiedV6DetectionValidationRecordV2 {
  return Boolean(value
    && typeof value === "object"
    && (value as Record<PropertyKey, unknown>)[VERIFIED_DETECTION_RECORD_V2] === true);
}

export function createV6DetectionValidationRecordV1(
  verified: VerifiedV6CalibrationArtifactV1,
): Readonly<VerifiedV6DetectionValidationRecordV1> {
  if (!isVerifiedV6CalibrationArtifactV1(verified)) {
    throw new Error("v6 detection validation requires an artifact admitted by the verified calibration loader");
  }
  const artifact = verified.artifact;
  const selection = artifact.v6InteractionTrace.monitoringSelection;
  if (!selection || selection.status !== "selected" || !selection.selectedReportId) {
    throw new Error("v6 detection validation requires a selected governance monitoring report");
  }
  const report = artifact.v6InteractionTrace.epistemicEvents
    .filter(event => event.type === "belief_reported")
    .map(event => event.report)
    .find(candidate => candidate.id === selection.selectedReportId);
  if (!report || report.value.kind !== "binary") {
    throw new Error("v6 detection validation requires one selected binary report");
  }
  const diagnosis = artifact.governanceAuditTrail.diagnoses.find(candidate =>
    governanceRefKey(candidate.diagnosisRef) === governanceRefKey(HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_V2)
    && candidate.attributes.beliefReportId === report.id);
  if (!diagnosis) throw new Error("v6 detection validation cannot locate the selected report diagnosis");
  const evaluations = artifact.governanceAuditTrail.decisions
    .flatMap(decision => decision.evaluations)
    .filter(evaluation => governanceRefKey(evaluation.ruleRef) === governanceRefKey(HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2)
      && evaluation.sourceDiagnosisIds.includes(diagnosis.id));
  if (evaluations.length === 0) throw new Error("v6 detection validation cannot locate the eligibility evaluation");
  const evaluationSignatures = new Set(evaluations.map(evaluation => stableJson({
    eligible: evaluation.eligible,
    sourceDiagnosisIds: evaluation.sourceDiagnosisIds,
    ruleConfig: evaluation.ruleConfig,
  })));
  if (evaluationSignatures.size !== 1) {
    throw new Error("v6 detection validation found inconsistent repeated eligibility evaluations");
  }
  const evaluation = evaluations[0];
  const config = evaluation.ruleConfig as Record<string, unknown>;
  const thresholdPolicy = config.certaintyThresholdPolicy as Record<string, unknown> | undefined;
  const bounds = thresholdPolicy?.bounds as Record<string, unknown> | undefined;
  const threshold = bounds?.lower;
  const maxLineages = config.maxVerifiedIndependentLineages;
  const beliefDomain = config.beliefDomain as Record<string, unknown> | undefined;
  if (!thresholdPolicy || thresholdPolicy.operator !== "gte"
    || typeof thresholdPolicy.id !== "string" || typeof thresholdPolicy.version !== "string"
    || typeof threshold !== "number" || !Number.isFinite(threshold)
    || !Number.isSafeInteger(maxLineages) || (maxLineages as number) < 0) {
    throw new Error("v6 detection validation eligibility rule config is malformed");
  }
  // V1 is intentionally binary. An absent domain is the frozen legacy binary/K=2
  // meaning; an explicit categorical or other-K domain must use a future record.
  if (beliefDomain !== undefined
    && (beliefDomain.beliefKind !== "binary" || beliefDomain.claimOptionCount !== 2)) {
    throw new Error("v6 detection validation v1 requires the binary/K=2 belief domain");
  }
  const lineageCount = diagnosis.attributes.verifiedIndependentLineageCount;
  const verifierAvailable = diagnosis.attributes.verifierAvailable;
  const claimResolved = diagnosis.attributes.claimResolved;
  if (!Number.isSafeInteger(lineageCount) || (lineageCount as number) < 0
    || typeof verifierAvailable !== "boolean" || claimResolved !== false) {
    throw new Error("v6 detection validation diagnosis attributes are malformed");
  }
  const lineageCountValue = lineageCount as number;
  const maxLineagesValue = maxLineages as number;
  const resolution = artifact.finalOutcome.resolutions.find(candidate => candidate.claimId === report.claimId);
  if (!resolution || resolution.kind !== "binary") {
    throw new Error("v6 detection validation requires a binary resolution for the selected report");
  }
  const certainty = Math.max(report.value.probability, 1 - report.value.probability);
  const thresholdSatisfied = certainty >= threshold;
  const operationalRiskPredicate = thresholdSatisfied && lineageCountValue <= maxLineagesValue;
  const expectedEligible = operationalRiskPredicate && verifierAvailable;
  if (evaluation.eligible !== expectedEligible) {
    throw new Error("v6 detection validation recorded eligibility differs from the frozen risk predicate");
  }
  const beliefSource = artifact.governanceAuditTrail.sourceEvents.find(event =>
    event.kind === "belief_report" && event.payload.reportId === report.id);
  if (!beliefSource) throw new Error("v6 detection validation cannot locate the governance belief source event");
  const reportBrierLoss = scoreBinaryReport({
    claimId: report.claimId,
    probability: report.value.probability,
    stake: report.stake,
  }, {
    claimId: resolution.claimId,
    outcome: resolution.outcome,
  }).brierLoss;
  const hardOutcomeLabel = report.value.probability === 0.5
    ? "tie" as const
    : (report.value.probability > 0.5) === resolution.outcome
      ? "correct" as const
      : "incorrect" as const;
  const calibrationDomainHash = hashCanonical({
    taskFamilyRef: artifact.governanceStudy.taskFamilyRef,
    beliefKind: "binary",
    monitoringDesignRef: artifact.v6MonitoringDesign.designRef,
    monitoringDesignHash: artifact.v6MonitoringDesign.contentHash,
    ruleRef: evaluation.ruleRef,
    ruleConfig: evaluation.ruleConfig,
    discussionAdapterContract: artifact.v6InteractionTrace.discussionAdapterContract,
  });
  const body: Omit<V6DetectionValidationRecordV1, "contentHash"> = {
    artifactSchemaRef: structuredClone(V6_DETECTION_VALIDATION_RECORD_V1),
    runId: artifact.runId,
    studyRef: { id: artifact.governanceStudy.id, version: artifact.governanceStudy.version },
    taskFamilyRef: structuredClone(artifact.governanceStudy.taskFamilyRef),
    taskDefinitionHash: artifact.v6TaskManifest.taskDefinitionHash,
    allocationMode: verified.allocationMode,
    calibrationDomainHash,
    selectedReportId: report.id,
    selectedAgentId: report.agentId,
    selectionProbability: selection.selectionProbability,
    inclusionWeight: 1 / selection.selectionProbability,
    reportedProbability: report.value.probability,
    reportedCertainty: certainty,
    verifiedIndependentLineageRecordCount: lineageCountValue,
    verifierAvailable,
    thresholdPolicyRef: { id: thresholdPolicy.id, version: thresholdPolicy.version },
    certaintyThreshold: threshold,
    maxVerifiedIndependentLineages: maxLineagesValue,
    thresholdSatisfied,
    operationalRiskPredicate,
    recordedRuleEligible: evaluation.eligible,
    resolvedOutcome: resolution.outcome,
    reportBrierLoss,
    hardOutcomeLabel,
    sourceRefs: {
      taskManifestHash: artifact.v6TaskManifest.contentHash,
      interactionTraceHash: artifact.v6InteractionTrace.contentHash,
      monitoringSelectionHash: selection.contentHash,
      governanceSourceEventHash: beliefSource.contentHash,
      finalOutcomeHash: artifact.operationalOutcome.sourceFinalOutcomeHash,
    },
  };
  const record = { ...body, contentHash: computeV6DetectionValidationRecordHashV1(body) };
  validateV6DetectionValidationRecordV1(record);
  const clone = structuredClone(record) as VerifiedV6DetectionValidationRecordV1;
  Object.defineProperty(clone, VERIFIED_DETECTION_RECORD, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return deepFreeze(clone);
}

export function createV6DetectionValidationRecordV2(
  verified: VerifiedV6CalibrationArtifactV1,
): Readonly<VerifiedV6DetectionValidationRecordV2> {
  if (!isVerifiedV6CalibrationArtifactV1(verified)) {
    throw new Error("v6 categorical detection validation requires a verified calibration artifact");
  }
  const artifact = verified.artifact;
  const selection = artifact.v6InteractionTrace.monitoringSelection;
  if (!selection || selection.status !== "selected" || !selection.selectedReportId) {
    throw new Error("v6 categorical detection validation requires a selected monitoring report");
  }
  const claim = artifact.v6TaskManifest.primaryClaim;
  if (claim.resolutionPolicy.kind !== "categorical" || !("options" in claim)) {
    throw new Error("v6 detection validation v2 requires one committed categorical claim");
  }
  const report = artifact.v6InteractionTrace.epistemicEvents
    .filter(event => event.type === "belief_reported")
    .map(event => event.report)
    .find(candidate => candidate.id === selection.selectedReportId);
  if (!report || report.claimId !== claim.id || report.value.kind !== "categorical") {
    throw new Error("v6 detection validation v2 requires one selected categorical report");
  }
  const reportedBelief = report.value;
  const diagnosis = artifact.governanceAuditTrail.diagnoses.find(candidate =>
    governanceRefKey(candidate.diagnosisRef) === governanceRefKey(HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_V2)
    && candidate.attributes.beliefReportId === report.id);
  if (!diagnosis) throw new Error("v6 detection validation v2 cannot locate the selected report diagnosis");
  const evaluations = artifact.governanceAuditTrail.decisions
    .flatMap(decision => decision.evaluations)
    .filter(evaluation => governanceRefKey(evaluation.ruleRef) === governanceRefKey(HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2)
      && evaluation.sourceDiagnosisIds.includes(diagnosis.id));
  if (evaluations.length === 0) {
    throw new Error("v6 detection validation v2 cannot locate the eligibility evaluation");
  }
  const evaluationSignatures = new Set(evaluations.map(evaluation => stableJson({
    eligible: evaluation.eligible,
    sourceDiagnosisIds: evaluation.sourceDiagnosisIds,
    ruleConfig: evaluation.ruleConfig,
  })));
  if (evaluationSignatures.size !== 1) {
    throw new Error("v6 detection validation v2 found inconsistent repeated eligibility evaluations");
  }
  const evaluation = evaluations[0];
  const config = evaluation.ruleConfig as Record<string, unknown>;
  const thresholdPolicy = config.certaintyThresholdPolicy as Record<string, unknown> | undefined;
  const bounds = thresholdPolicy?.bounds as Record<string, unknown> | undefined;
  const threshold = bounds?.lower;
  const maxLineages = config.maxVerifiedIndependentLineages;
  const beliefDomain = config.beliefDomain as Record<string, unknown> | undefined;
  if (!thresholdPolicy || thresholdPolicy.operator !== "gte"
    || typeof thresholdPolicy.id !== "string" || typeof thresholdPolicy.version !== "string"
    || typeof threshold !== "number" || !Number.isFinite(threshold)
    || !Number.isSafeInteger(maxLineages) || (maxLineages as number) < 0
    || !beliefDomain || beliefDomain.beliefKind !== "categorical"
    || beliefDomain.claimOptionCount !== claim.options.length) {
    throw new Error("v6 detection validation v2 requires a matching categorical/K rule config");
  }
  if (threshold <= 1 / claim.options.length) {
    throw new Error("v6 detection validation v2 threshold must exceed the K-specific uniform baseline");
  }
  const lineageCount = diagnosis.attributes.verifiedIndependentLineageCount;
  const verifierAvailable = diagnosis.attributes.verifierAvailable;
  const claimResolved = diagnosis.attributes.claimResolved;
  if (diagnosis.attributes.beliefKind !== "categorical"
    || diagnosis.attributes.claimOptionCount !== claim.options.length
    || !Number.isSafeInteger(lineageCount) || (lineageCount as number) < 0
    || typeof verifierAvailable !== "boolean" || claimResolved !== false) {
    throw new Error("v6 detection validation v2 diagnosis attributes are malformed or cross-domain");
  }
  const lineageCountValue = lineageCount as number;
  const maxLineagesValue = maxLineages as number;
  const resolution = artifact.finalOutcome.resolutions.find(candidate => candidate.claimId === report.claimId);
  if (!resolution || resolution.kind !== "categorical" || !claim.options.includes(resolution.outcome)) {
    throw new Error("v6 detection validation v2 requires a categorical canonical resolution");
  }
  const certainty = Math.max(...claim.options.map(option => reportedBelief.probabilities[option]));
  const thresholdSatisfied = certainty >= threshold;
  const operationalRiskPredicate = thresholdSatisfied && lineageCountValue <= maxLineagesValue;
  const expectedEligible = operationalRiskPredicate && verifierAvailable;
  if (evaluation.eligible !== expectedEligible) {
    throw new Error("v6 detection validation v2 eligibility differs from the frozen risk predicate");
  }
  const beliefSource = artifact.governanceAuditTrail.sourceEvents.find(event =>
    event.kind === "belief_report" && event.payload.reportId === report.id);
  if (!beliefSource) {
    throw new Error("v6 detection validation v2 cannot locate the governance belief source event");
  }
  const reportBrierLoss = scoreCategoricalReport(claim, report, resolution).brierLoss;
  const hardOutcomeLabel = categoricalHardOutcomeLabel(
    claim.options,
    reportedBelief.probabilities,
    resolution.outcome,
  );
  const calibrationDomainHash = hashCanonical({
    taskFamilyRef: artifact.governanceStudy.taskFamilyRef,
    beliefKind: "categorical",
    claimOptionCount: claim.options.length,
    monitoringDesignRef: artifact.v6MonitoringDesign.designRef,
    monitoringDesignHash: artifact.v6MonitoringDesign.contentHash,
    ruleRef: evaluation.ruleRef,
    ruleConfig: evaluation.ruleConfig,
    discussionAdapterContract: artifact.v6InteractionTrace.discussionAdapterContract,
  });
  const body: Omit<V6DetectionValidationRecordV2, "contentHash"> = {
    artifactSchemaRef: structuredClone(V6_DETECTION_VALIDATION_RECORD_V2),
    runId: artifact.runId,
    studyRef: { id: artifact.governanceStudy.id, version: artifact.governanceStudy.version },
    taskFamilyRef: structuredClone(artifact.governanceStudy.taskFamilyRef),
    taskDefinitionHash: artifact.v6TaskManifest.taskDefinitionHash,
    allocationMode: verified.allocationMode,
    calibrationDomainHash,
    selectedReportId: report.id,
    selectedAgentId: report.agentId,
    selectionProbability: selection.selectionProbability,
    inclusionWeight: 1 / selection.selectionProbability,
    beliefKind: "categorical",
    claimOptionCount: claim.options.length,
    canonicalOptions: [...claim.options],
    reportedBelief: structuredClone(reportedBelief),
    reportedCertainty: certainty,
    verifiedIndependentLineageRecordCount: lineageCountValue,
    verifierAvailable,
    thresholdPolicyRef: { id: thresholdPolicy.id, version: thresholdPolicy.version },
    certaintyThreshold: threshold,
    maxVerifiedIndependentLineages: maxLineagesValue,
    thresholdSatisfied,
    operationalRiskPredicate,
    recordedRuleEligible: evaluation.eligible,
    resolvedOutcome: resolution.outcome,
    reportBrierLoss,
    hardOutcomeLabel,
    sourceRefs: {
      taskManifestHash: artifact.v6TaskManifest.contentHash,
      interactionTraceHash: artifact.v6InteractionTrace.contentHash,
      monitoringSelectionHash: selection.contentHash,
      governanceSourceEventHash: beliefSource.contentHash,
      finalOutcomeHash: artifact.operationalOutcome.sourceFinalOutcomeHash,
    },
  };
  const record = { ...body, contentHash: computeV6DetectionValidationRecordHashV2(body) };
  validateV6DetectionValidationRecordV2(record);
  const clone = structuredClone(record) as VerifiedV6DetectionValidationRecordV2;
  Object.defineProperty(clone, VERIFIED_DETECTION_RECORD_V2, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return deepFreeze(clone);
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function summarizeV6DetectionValidationV1(
  records: readonly VerifiedV6DetectionValidationRecordV1[],
): Readonly<V6DetectionValidationSummaryV1> {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("v6 detection validation summary requires at least one record");
  }
  for (const record of records) {
    if (!isVerifiedV6DetectionValidationRecordV1(record)) {
      throw new Error("v6 detection validation summary requires source-bound verified projections");
    }
    validateV6DetectionValidationRecordV1(record);
  }
  const domainHashes = new Set(records.map(record => record.calibrationDomainHash));
  const allocationModes = new Set(records.map(record => record.allocationMode));
  const runIds = records.map(record => record.runId);
  if (domainHashes.size !== 1) throw new Error("v6 detection validation cannot mix calibration domains");
  if (allocationModes.size !== 1) throw new Error("v6 detection validation cannot mix allocation modes");
  if (new Set(runIds).size !== runIds.length) throw new Error("v6 detection validation cannot contain duplicate runs");
  const totalWeight = records.reduce((sum, record) => sum + record.inclusionWeight, 0);
  const weighted = (predicate: (record: V6DetectionValidationRecordV1) => boolean): number =>
    records.reduce((sum, record) => sum + (predicate(record) ? record.inclusionWeight : 0), 0);
  const weightedBrier = (predicate: (record: V6DetectionValidationRecordV1) => boolean): number | null => {
    const denominator = weighted(predicate);
    return denominator > 0
      ? records.reduce(
        (sum, record) => sum + (predicate(record) ? record.inclusionWeight * record.reportBrierLoss : 0),
        0,
      ) / denominator
      : null;
  };
  const tp = weighted(record => record.operationalRiskPredicate && record.hardOutcomeLabel === "incorrect");
  const fp = weighted(record => record.operationalRiskPredicate && record.hardOutcomeLabel === "correct");
  const fn = weighted(record => !record.operationalRiskPredicate && record.hardOutcomeLabel === "incorrect");
  const tn = weighted(record => !record.operationalRiskPredicate && record.hardOutcomeLabel === "correct");
  const flaggedMeanBrier = weightedBrier(record => record.operationalRiskPredicate);
  const unflaggedMeanBrier = weightedBrier(record => !record.operationalRiskPredicate);
  const summary: V6DetectionValidationSummaryV1 = {
    inferenceStatus: "descriptive_calibration_only",
    calibrationDomainHash: records[0].calibrationDomainHash,
    allocationMode: records[0].allocationMode,
    recordCount: records.length,
    weightedPopulationSize: totalWeight,
    weightedMeanReportBrier: records.reduce(
      (sum, record) => sum + record.inclusionWeight * record.reportBrierLoss,
      0,
    ) / totalWeight,
    weightedFlaggedMeanReportBrier: flaggedMeanBrier,
    weightedUnflaggedMeanReportBrier: unflaggedMeanBrier,
    weightedBrierRiskGap: flaggedMeanBrier !== null && unflaggedMeanBrier !== null
      ? flaggedMeanBrier - unflaggedMeanBrier
      : null,
    weightedRiskFlagRate: weighted(record => record.operationalRiskPredicate) / totalWeight,
    weightedTieRate: weighted(record => record.hardOutcomeLabel === "tie") / totalWeight,
    confusionWeights: {
      truePositive: tp,
      falsePositive: fp,
      falseNegative: fn,
      trueNegative: tn,
    },
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    specificity: ratio(tn, tn + fp),
  };
  return deepFreeze(structuredClone(summary));
}

export function summarizeV6DetectionValidationV2(
  records: readonly VerifiedV6DetectionValidationRecordV2[],
): Readonly<V6DetectionValidationSummaryV2> {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("v6 categorical detection validation summary requires at least one record");
  }
  for (const record of records) {
    if (!isVerifiedV6DetectionValidationRecordV2(record)) {
      throw new Error("v6 categorical detection summary requires source-bound verified projections");
    }
    validateV6DetectionValidationRecordV2(record);
  }
  const domainHashes = new Set(records.map(record => record.calibrationDomainHash));
  const allocationModes = new Set(records.map(record => record.allocationMode));
  const optionCounts = new Set(records.map(record => record.claimOptionCount));
  const runIds = records.map(record => record.runId);
  if (domainHashes.size !== 1) throw new Error("v6 categorical detection summary cannot mix calibration domains");
  if (allocationModes.size !== 1) throw new Error("v6 categorical detection summary cannot mix allocation modes");
  if (optionCounts.size !== 1) throw new Error("v6 categorical detection summary cannot mix option counts");
  if (new Set(runIds).size !== runIds.length) {
    throw new Error("v6 categorical detection summary cannot contain duplicate runs");
  }
  const totalWeight = records.reduce((sum, record) => sum + record.inclusionWeight, 0);
  const weighted = (predicate: (record: V6DetectionValidationRecordV2) => boolean): number =>
    records.reduce((sum, record) => sum + (predicate(record) ? record.inclusionWeight : 0), 0);
  const weightedBrier = (predicate: (record: V6DetectionValidationRecordV2) => boolean): number | null => {
    const denominator = weighted(predicate);
    return denominator > 0
      ? records.reduce(
        (sum, record) => sum + (predicate(record) ? record.inclusionWeight * record.reportBrierLoss : 0),
        0,
      ) / denominator
      : null;
  };
  const tp = weighted(record => record.operationalRiskPredicate && record.hardOutcomeLabel === "incorrect");
  const fp = weighted(record => record.operationalRiskPredicate && record.hardOutcomeLabel === "correct");
  const fn = weighted(record => !record.operationalRiskPredicate && record.hardOutcomeLabel === "incorrect");
  const tn = weighted(record => !record.operationalRiskPredicate && record.hardOutcomeLabel === "correct");
  const flaggedMeanBrier = weightedBrier(record => record.operationalRiskPredicate);
  const unflaggedMeanBrier = weightedBrier(record => !record.operationalRiskPredicate);
  const summary: V6DetectionValidationSummaryV2 = {
    inferenceStatus: "descriptive_calibration_only",
    beliefKind: "categorical",
    claimOptionCount: records[0].claimOptionCount,
    properLossGeometry: "multiclass_brier_sum",
    calibrationDomainHash: records[0].calibrationDomainHash,
    allocationMode: records[0].allocationMode,
    recordCount: records.length,
    weightedPopulationSize: totalWeight,
    weightedMeanReportBrier: records.reduce(
      (sum, record) => sum + record.inclusionWeight * record.reportBrierLoss,
      0,
    ) / totalWeight,
    weightedFlaggedMeanReportBrier: flaggedMeanBrier,
    weightedUnflaggedMeanReportBrier: unflaggedMeanBrier,
    weightedBrierRiskGap: flaggedMeanBrier !== null && unflaggedMeanBrier !== null
      ? flaggedMeanBrier - unflaggedMeanBrier
      : null,
    weightedRiskFlagRate: weighted(record => record.operationalRiskPredicate) / totalWeight,
    weightedTieRate: weighted(record => record.hardOutcomeLabel === "tie") / totalWeight,
    confusionWeights: {
      truePositive: tp,
      falsePositive: fp,
      falseNegative: fn,
      trueNegative: tn,
    },
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    specificity: ratio(tn, tn + fp),
  };
  return deepFreeze(structuredClone(summary));
}

export function projectV6PreActionDetectionCensusV1(input: {
  verified: VerifiedV6CalibrationArtifactV1;
  rule: GovernanceEligibilityRule;
}): ReadonlyArray<Readonly<V6PreActionDetectionCensusRowV1>> {
  if (!isVerifiedV6CalibrationArtifactV1(input.verified)) {
    throw new Error("v6 pre-action census requires an artifact admitted by the verified loader");
  }
  if (governanceRefKey(input.rule) !== governanceRefKey(HIGH_CERTAINTY_LOW_LINEAGE_RULE_V2)) {
    throw new Error("v6 pre-action census requires the frozen high-certainty/lineage rule");
  }
  const artifact = input.verified.artifact;
  const protocol = artifact.v6InteractionTrace.protocol;
  if (protocol !== "explicit_belief_v1" && protocol !== "epistemic_governance_v1") {
    throw new Error("v6 pre-action census is defined only for explicit-belief B and governance G arms");
  }
  const declaredRuleRefs = artifact.governanceStudy.governancePolicy?.eligibilityRuleRefs ?? [];
  if (!declaredRuleRefs.some(ref => governanceRefKey(ref) === governanceRefKey(input.rule))) {
    throw new Error("v6 pre-action census rule is not declared by the verified study");
  }
  const config = input.rule.config as Record<string, unknown>;
  const thresholdPolicy = config.certaintyThresholdPolicy as Record<string, unknown> | undefined;
  const bounds = thresholdPolicy?.bounds as Record<string, unknown> | undefined;
  const threshold = bounds?.lower;
  const maxLineages = config.maxVerifiedIndependentLineages;
  const configuredDomain = config.beliefDomain as Record<string, unknown> | undefined;
  if (!thresholdPolicy || thresholdPolicy.operator !== "gte"
    || typeof threshold !== "number" || !Number.isFinite(threshold)
    || !Number.isSafeInteger(maxLineages) || (maxLineages as number) < 0) {
    throw new Error("v6 pre-action census rule config is malformed");
  }
  const claim = artifact.v6TaskManifest.primaryClaim;
  const categoricalOptions = "options" in claim ? claim.options : undefined;
  const claimOptionCount = categoricalOptions?.length ?? 2;
  const expectedDomain = configuredDomain ?? { beliefKind: "binary", claimOptionCount: 2 };
  if (expectedDomain.beliefKind !== claim.resolutionPolicy.kind
    || expectedDomain.claimOptionCount !== claimOptionCount) {
    throw new Error("v6 pre-action census rule calibration domain differs from the committed claim");
  }
  if (threshold <= 1 / claimOptionCount) {
    throw new Error("v6 pre-action census threshold must exceed the K-specific uniform baseline");
  }
  const resolutions = artifact.finalOutcome.resolutions.filter(candidate => candidate.claimId === claim.id);
  if (resolutions.length !== 1 || resolutions[0].kind !== claim.resolutionPolicy.kind) {
    throw new Error("v6 pre-action census requires one resolution matching the committed claim");
  }
  const resolution = resolutions[0];
  const reports = artifact.v6InteractionTrace.epistemicEvents
    .flatMap(event => event.type === "belief_reported" && event.report.round === 1 ? [event.report] : [])
    .sort((left, right) => left.id.localeCompare(right.id));
  if (reports.length === 0) throw new Error("v6 pre-action census requires first-round reports");
  const ruleConfigHash = hashCanonical(input.rule.config);
  const calibrationDomainHash = hashCanonical({
    taskFamilyRef: artifact.governanceStudy.taskFamilyRef,
    protocol,
    beliefKind: claim.resolutionPolicy.kind,
    claimOptionCount,
    populationMode: "first_round_census",
    monitoringDesignRef: artifact.v6MonitoringDesign.designRef,
    monitoringDesignHash: artifact.v6MonitoringDesign.contentHash,
    ruleRef: { id: input.rule.id, version: input.rule.version },
    ruleConfig: input.rule.config,
    discussionAdapterContract: artifact.v6InteractionTrace.discussionAdapterContract,
  });
  const rows = reports.map((report): V6PreActionDetectionCensusRowV1 => {
    if (report.claimId !== claim.id || report.value.kind !== claim.resolutionPolicy.kind) {
      throw new Error("v6 pre-action census report differs from the committed claim kind");
    }
    let reportedCertainty: number;
    let hardOutcomeLabel: "correct" | "incorrect" | "tie";
    if (report.value.kind === "binary" && resolution.kind === "binary") {
      reportedCertainty = Math.max(report.value.probability, 1 - report.value.probability);
      hardOutcomeLabel = report.value.probability === 0.5
        ? "tie"
        : (report.value.probability > 0.5) === resolution.outcome
          ? "correct"
          : "incorrect";
    } else if (report.value.kind === "categorical" && resolution.kind === "categorical"
      && categoricalOptions) {
      reportedCertainty = Math.max(...categoricalOptions
        .map(option => report.value.kind === "categorical"
          ? report.value.probabilities[option]
          : Number.NaN));
      hardOutcomeLabel = categoricalHardOutcomeLabel(
        categoricalOptions,
        report.value.probabilities,
        resolution.outcome,
      );
    } else {
      throw new Error("v6 pre-action census report/resolution kind mismatch");
    }
    const operationalRiskPredicate = reportedCertainty >= threshold
      && 0 <= (maxLineages as number);
    const resolvedProperLoss = scoreBeliefReport(claim, report, resolution).properLoss;
    return {
      inferenceStatus: "descriptive_shadow_only",
      runId: artifact.runId,
      protocol,
      reportId: report.id,
      agentId: report.agentId,
      beliefKind: report.value.kind,
      claimOptionCount,
      reportedCertainty,
      verifiedIndependentLineageRecordCount: 0,
      lineageMeasurementStatus: "no_pre_action_verification_records",
      certaintyThreshold: threshold,
      maxVerifiedIndependentLineages: maxLineages as number,
      operationalRiskPredicate,
      resolvedProperLoss,
      hardOutcomeLabel,
      calibrationDomainHash,
      sourceRefs: {
        taskManifestHash: artifact.v6TaskManifest.contentHash,
        interactionTraceHash: artifact.v6InteractionTrace.contentHash,
        finalOutcomeHash: artifact.operationalOutcome.sourceFinalOutcomeHash,
        ruleConfigHash,
      },
    };
  });
  return deepFreeze(structuredClone(rows));
}
