import { createHash } from "node:crypto";
import { scoreBinaryReport } from "../../../src/lib/epistemic";
import {
  governanceRefKey,
  validateGovernanceRef,
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

const VERIFIED_DETECTION_RECORD = Symbol("VerifiedV6DetectionValidationRecordV1");

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
  if (!thresholdPolicy || thresholdPolicy.operator !== "gte"
    || typeof thresholdPolicy.id !== "string" || typeof thresholdPolicy.version !== "string"
    || typeof threshold !== "number" || !Number.isFinite(threshold)
    || !Number.isSafeInteger(maxLineages) || (maxLineages as number) < 0) {
    throw new Error("v6 detection validation eligibility rule config is malformed");
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
