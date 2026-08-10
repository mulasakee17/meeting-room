import { describe, expect, it } from "vitest";
import {
  CALIBRATION_ARTIFACT_SCHEMA_V1,
  defineCalibrationArtifact,
  validateCalibrationArtifact,
  type CalibrationArtifactV1,
} from "@/lib/epistemic";

const ref = (id: string) => ({ id, version: "1.0.0" });
const FIT_HASH = `sha256:${"a".repeat(64)}`;
const EVAL_HASH = `sha256:${"b".repeat(64)}`;

function artifact(overrides: Partial<CalibrationArtifactV1> = {}): CalibrationArtifactV1 {
  return {
    schemaRef: CALIBRATION_ARTIFACT_SCHEMA_V1,
    artifactRef: ref("swarmalpha.calibration-artifact"),
    quantityRef: ref("swarmalpha.quantity"),
    estimatorRef: ref("swarmalpha.estimator"),
    calibrationMethodRef: ref("swarmalpha.method"),
    domain: {
      taskFamilyRef: ref("swarmalpha.task-family"),
      beliefKind: "binary",
      calibrationDomain: "test:binary",
      comparabilityKeys: ["belief_kind"],
    },
    splitManifest: {
      manifestRef: ref("swarmalpha.split-manifest"),
      manifestHash: FIT_HASH,
      fitSplitId: "fit-split",
      fitDataHash: FIT_HASH,
    },
    status: "fitted_only",
    sampleCounts: { fit: 100, evaluation: 0 },
    parameters: { bins: 10 },
    heldOutMetrics: [],
    frozenAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("CalibrationArtifactV1", () => {
  it("accepts and freezes a fitted-only artifact", () => {
    expect(Object.isFrozen(defineCalibrationArtifact(artifact()))).toBe(true);
  });

  it("does not let fitted-only artifacts claim held-out evaluation", () => {
    expect(() => validateCalibrationArtifact(artifact({
      sampleCounts: { fit: 100, evaluation: 10 },
      splitManifest: {
        ...artifact().splitManifest,
        evaluationSplitId: "eval-split",
        evaluationDataHash: EVAL_HASH,
      },
      heldOutMetrics: [{ metricRef: ref("swarmalpha.metric.brier"), value: 0.2 }],
    }))).toThrow("must not claim held-out evaluation data");
  });

  it("accepts an explicit held-out evaluation", () => {
    expect(() => validateCalibrationArtifact(artifact({
      status: "held_out_evaluated",
      sampleCounts: { fit: 100, evaluation: 50 },
      splitManifest: {
        ...artifact().splitManifest,
        evaluationSplitId: "eval-split",
        evaluationDataHash: EVAL_HASH,
      },
      heldOutMetrics: [{ metricRef: ref("swarmalpha.metric.brier"), value: 0.2 }],
    }))).not.toThrow();
  });

  it("requires fit and evaluation split identities and hashes to differ", () => {
    const base = artifact({
      status: "held_out_evaluated",
      sampleCounts: { fit: 100, evaluation: 50 },
      heldOutMetrics: [{ metricRef: ref("swarmalpha.metric.brier"), value: 0.2 }],
    });
    expect(() => validateCalibrationArtifact({
      ...base,
      splitManifest: {
        ...base.splitManifest,
        evaluationSplitId: base.splitManifest.fitSplitId,
        evaluationDataHash: EVAL_HASH,
      },
    })).toThrow("must differ from the fit split");
    expect(() => validateCalibrationArtifact({
      ...base,
      splitManifest: {
        ...base.splitManifest,
        evaluationSplitId: "eval-split",
        evaluationDataHash: base.splitManifest.fitDataHash,
      },
    })).toThrow("must differ from the fit split");
  });

  it("requires held-out samples and metrics", () => {
    expect(() => validateCalibrationArtifact(artifact({
      status: "held_out_evaluated",
      sampleCounts: { fit: 100, evaluation: 0 },
      splitManifest: {
        ...artifact().splitManifest,
        evaluationSplitId: "eval-split",
        evaluationDataHash: EVAL_HASH,
      },
      heldOutMetrics: [],
    }))).toThrow("require evaluation samples and metrics");
  });

  it("rejects bad hashes, non-finite values, and cyclic parameters", () => {
    expect(() => validateCalibrationArtifact(artifact({
      splitManifest: { ...artifact().splitManifest, manifestHash: "sha256:bad" },
    }))).toThrow("sha256:<64 lowercase hex>");
    expect(() => validateCalibrationArtifact(artifact({ parameters: { bins: Number.NaN } })))
      .toThrow("numbers must be finite");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => validateCalibrationArtifact(artifact({ parameters: cyclic })))
      .toThrow("must not contain cycles");
  });
});
