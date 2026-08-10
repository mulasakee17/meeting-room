import {
  epistemicRefKey,
  validateEpistemicRef,
  type VersionedEpistemicRef,
} from "./quantityContracts";
import type { BeliefKind } from "./types";

export const CALIBRATION_ARTIFACT_SCHEMA_V1 = Object.freeze({
  id: "swarmalpha.epistemic-calibration-artifact",
  version: "1.0.0",
});

export interface CalibrationArtifactV1 {
  schemaRef: typeof CALIBRATION_ARTIFACT_SCHEMA_V1;
  artifactRef: VersionedEpistemicRef;
  quantityRef: VersionedEpistemicRef;
  estimatorRef: VersionedEpistemicRef;
  calibrationMethodRef: VersionedEpistemicRef;
  domain: {
    taskFamilyRef: VersionedEpistemicRef;
    beliefKind: BeliefKind;
    calibrationDomain: string;
    comparabilityKeys: readonly string[];
  };
  splitManifest: {
    manifestRef: VersionedEpistemicRef;
    manifestHash: string;
    fitSplitId: string;
    fitDataHash: string;
    evaluationSplitId?: string;
    evaluationDataHash?: string;
  };
  status: "fitted_only" | "held_out_evaluated";
  sampleCounts: {
    fit: number;
    evaluation: number;
  };
  /** Exact replayable method parameters; never silently refit at evaluation time. */
  parameters: Record<string, unknown>;
  heldOutMetrics: ReadonlyArray<{
    metricRef: VersionedEpistemicRef;
    value: number;
  }>;
  frozenAt: string;
}

const HASH_RE = /^sha256:[a-f0-9]{64}$/;

function requireNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be non-empty`);
}

function requireHash(value: string, field: string): void {
  if (!HASH_RE.test(value)) throw new Error(`${field} must be a sha256:<64 lowercase hex> hash`);
}

function validateReplayable(value: unknown, field: string, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${field} numbers must be finite`);
    return;
  }
  if (typeof value !== "object") throw new Error(`${field} must contain replayable JSON values only`);
  if (ancestors.has(value)) throw new Error(`${field} must not contain cycles`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) throw new Error(`${field} must not contain sparse arrays`);
        validateReplayable(value[index], `${field}[${index}]`, ancestors);
      }
    } else {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error(`${field} must contain plain objects only`);
      }
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        validateReplayable(child, `${field}.${key}`, ancestors);
      }
    }
  } finally {
    ancestors.delete(value);
  }
}

export function validateCalibrationArtifact(artifact: CalibrationArtifactV1): void {
  if (!artifact || typeof artifact !== "object") throw new Error("calibration artifact must be an object");
  if (epistemicRefKey(artifact.schemaRef) !== epistemicRefKey(CALIBRATION_ARTIFACT_SCHEMA_V1)) {
    throw new Error("calibration artifact schemaRef is not supported");
  }
  validateEpistemicRef(artifact.artifactRef, "calibration.artifactRef");
  validateEpistemicRef(artifact.quantityRef, "calibration.quantityRef");
  validateEpistemicRef(artifact.estimatorRef, "calibration.estimatorRef");
  validateEpistemicRef(artifact.calibrationMethodRef, "calibration.calibrationMethodRef");
  validateEpistemicRef(artifact.domain.taskFamilyRef, "calibration.domain.taskFamilyRef");
  if (artifact.domain.beliefKind !== "binary" && artifact.domain.beliefKind !== "categorical") {
    throw new Error("calibration.domain.beliefKind must be binary or categorical");
  }
  requireNonEmpty(artifact.domain.calibrationDomain, "calibration.domain.calibrationDomain");
  if (!Array.isArray(artifact.domain.comparabilityKeys)
    || artifact.domain.comparabilityKeys.length === 0
    || artifact.domain.comparabilityKeys.some(key => typeof key !== "string" || key.trim().length === 0)
    || new Set(artifact.domain.comparabilityKeys).size !== artifact.domain.comparabilityKeys.length) {
    throw new Error("calibration.domain.comparabilityKeys must contain unique non-empty strings");
  }
  validateEpistemicRef(artifact.splitManifest.manifestRef, "calibration.splitManifest.manifestRef");
  requireHash(artifact.splitManifest.manifestHash, "calibration.splitManifest.manifestHash");
  requireNonEmpty(artifact.splitManifest.fitSplitId, "calibration.splitManifest.fitSplitId");
  requireHash(artifact.splitManifest.fitDataHash, "calibration.splitManifest.fitDataHash");
  if (artifact.status !== "fitted_only" && artifact.status !== "held_out_evaluated") {
    throw new Error("calibration.status must be fitted_only or held_out_evaluated");
  }
  if (!Number.isSafeInteger(artifact.sampleCounts.fit) || artifact.sampleCounts.fit < 1) {
    throw new Error("calibration.sampleCounts.fit must be a positive safe integer");
  }
  if (!Number.isSafeInteger(artifact.sampleCounts.evaluation) || artifact.sampleCounts.evaluation < 0) {
    throw new Error("calibration.sampleCounts.evaluation must be a non-negative safe integer");
  }
  if (!artifact.parameters
    || typeof artifact.parameters !== "object"
    || Array.isArray(artifact.parameters)) {
    throw new Error("calibration.parameters must be a replayable object");
  }
  validateReplayable(artifact.parameters, "calibration.parameters");
  if (!Array.isArray(artifact.heldOutMetrics)) throw new Error("calibration.heldOutMetrics must be an array");
  const metricKeys = artifact.heldOutMetrics.map(metric => epistemicRefKey(metric.metricRef));
  if (new Set(metricKeys).size !== metricKeys.length) {
    throw new Error("calibration.heldOutMetrics must not contain duplicate metric refs");
  }
  for (const [index, metric] of artifact.heldOutMetrics.entries()) {
    validateEpistemicRef(metric.metricRef, `calibration.heldOutMetrics[${index}].metricRef`);
    if (!Number.isFinite(metric.value)) throw new Error(`calibration.heldOutMetrics[${index}].value must be finite`);
  }
  if (artifact.status === "fitted_only") {
    if (artifact.sampleCounts.evaluation !== 0
      || artifact.splitManifest.evaluationSplitId !== undefined
      || artifact.splitManifest.evaluationDataHash !== undefined
      || artifact.heldOutMetrics.length !== 0) {
      throw new Error("fitted-only calibration artifacts must not claim held-out evaluation data");
    }
  } else {
    requireNonEmpty(artifact.splitManifest.evaluationSplitId ?? "", "calibration.splitManifest.evaluationSplitId");
    requireHash(artifact.splitManifest.evaluationDataHash ?? "", "calibration.splitManifest.evaluationDataHash");
    if (artifact.splitManifest.evaluationSplitId === artifact.splitManifest.fitSplitId
      || artifact.splitManifest.evaluationDataHash === artifact.splitManifest.fitDataHash) {
      throw new Error("held-out evaluation split and data hash must differ from the fit split");
    }
    if (artifact.sampleCounts.evaluation < 1 || artifact.heldOutMetrics.length === 0) {
      throw new Error("held-out evaluated calibration artifacts require evaluation samples and metrics");
    }
  }
  if (!Number.isFinite(Date.parse(artifact.frozenAt))) throw new Error("calibration.frozenAt must be an ISO timestamp");
}

export function defineCalibrationArtifact(
  artifact: CalibrationArtifactV1,
): Readonly<CalibrationArtifactV1> {
  validateCalibrationArtifact(artifact);
  return deepFreeze(structuredClone(artifact));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
