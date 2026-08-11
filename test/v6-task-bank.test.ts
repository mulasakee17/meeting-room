import { describe, expect, it } from "vitest";
import {
  computeV6TaskBankManifestHashV1,
  createV6TaskBankManifestV1,
  validateV6TaskBankAdmissionV1,
  validateV6TaskBankManifestV1,
  type V6TaskBankEntryV1,
  type V6TaskBankManifestV1,
  type V6TaskSplit,
} from "../experiments/campaign/v6/taskBank";
import { createV6BinarySmokeFixture } from "../experiments/campaign/v6/v6BinarySmokeFixture";
import { createV6TaskManifestV1 } from "../experiments/campaign/v6/v6TaskManifest";

const CREATED_AT = "2026-08-11T09:00:00.000Z";
const REVIEWED_AT = "2026-08-11T08:00:00.000Z";
const fixture = createV6BinarySmokeFixture();

function hash(hex: string): string {
  return `sha256:${hex.repeat(64)}`;
}

function acceptedReview() {
  return {
    status: "accepted" as const,
    reviewProtocolRef: { id: "swarmalpha.review.binary-task-semantics", version: "1.0.0" },
    reviewedAt: REVIEWED_AT,
  };
}

function entry(input: {
  suffix: string;
  split: V6TaskSplit;
  leakageGroupId?: string;
  reviewed?: boolean;
}): V6TaskBankEntryV1 {
  return {
    taskRef: { id: `swarmalpha.task.bank-${input.suffix}`, version: "1.0.0" },
    taskId: `task:bank-${input.suffix}`,
    taskDefinitionHash: hash(input.suffix[0]),
    taskFamilyRef: fixture.taskAdapter.taskFamilyRef,
    adapterRef: fixture.taskAdapter.adapterRef,
    taskSchemaRef: fixture.taskAdapter.taskSchemaRef,
    resolverId: fixture.taskAdapter.resolution.resolverId,
    leakageGroupId: input.leakageGroupId ?? `cluster:${input.suffix}`,
    split: input.split,
    semanticReview: input.reviewed === false ? { status: "not_reviewed" } : acceptedReview(),
  };
}

function actualTaskManifest() {
  return createV6TaskManifestV1({
    runId: "run:task-bank-admission",
    studyRef: { id: fixture.study.id, version: fixture.study.version },
    task: fixture.task,
    authority: {
      adapterRef: fixture.taskAdapter.adapterRef,
      taskSchemaRef: fixture.taskAdapter.taskSchemaRef,
      resolution: fixture.taskAdapter.resolution,
    },
    monitoringDesignRef: fixture.monitoringDesign.designRef,
    monitoringDesignHash: fixture.monitoringDesign.contentHash,
    committedAt: "2026-08-11T07:00:00.000Z",
  });
}

function actualEngineeringEntry(): V6TaskBankEntryV1 {
  const manifest = actualTaskManifest();
  return {
    taskRef: { id: "swarmalpha.task.distributed-binary-smoke", version: "1.0.0" },
    taskId: manifest.taskId,
    taskDefinitionHash: manifest.taskDefinitionHash,
    taskFamilyRef: manifest.taskFamilyRef,
    adapterRef: manifest.adapterRef,
    taskSchemaRef: manifest.taskSchemaRef,
    resolverId: manifest.resolutionContract.resolverId,
    leakageGroupId: "cluster:distributed-binary-smoke",
    split: "engineering_canary",
    semanticReview: { status: "not_reviewed" },
  };
}

function bodyOf(manifest: V6TaskBankManifestV1) {
  const { contentHash: _contentHash, ...body } = manifest;
  return body;
}

describe("v6 task-bank and split authority", () => {
  it("admits the current fixed task for engineering only and binds the task manifest", () => {
    const bank = createV6TaskBankManifestV1({
      bankRef: { id: "swarmalpha.task-bank.v6-engineering", version: "1.0.0" },
      purpose: "engineering_only",
      entries: [actualEngineeringEntry()],
      createdAt: CREATED_AT,
    });
    expect(Object.isFrozen(bank)).toBe(true);
    expect(() => validateV6TaskBankManifestV1(bank)).not.toThrow();
    expect(validateV6TaskBankAdmissionV1({
      bank,
      taskManifest: actualTaskManifest(),
      requiredSplit: "engineering_canary",
    }).taskId).toBe(fixture.task.id);
    expect(() => validateV6TaskBankAdmissionV1({
      bank,
      taskManifest: actualTaskManifest(),
      requiredSplit: "threshold_calibration",
    })).toThrow(/not admitted/);
  });

  it("requires accepted semantic review and both calibration and held-out splits", () => {
    expect(() => createV6TaskBankManifestV1({
      bankRef: { id: "swarmalpha.task-bank.v6-calibration", version: "1.0.0" },
      purpose: "calibration_candidate",
      entries: [entry({ suffix: "a", split: "threshold_calibration" })],
      createdAt: CREATED_AT,
    })).toThrow(/non-empty calibration and held-out/);
    expect(() => createV6TaskBankManifestV1({
      bankRef: { id: "swarmalpha.task-bank.v6-calibration", version: "1.0.0" },
      purpose: "calibration_candidate",
      entries: [
        entry({ suffix: "a", split: "threshold_calibration", reviewed: false }),
        entry({ suffix: "b", split: "held_out_detector" }),
      ],
      createdAt: CREATED_AT,
    })).toThrow(/accepted semantic review/);
  });

  it("rejects scenario/template leakage across scientific splits even under new IDs and hashes", () => {
    expect(() => createV6TaskBankManifestV1({
      bankRef: { id: "swarmalpha.task-bank.v6-leak", version: "1.0.0" },
      purpose: "calibration_candidate",
      entries: [
        entry({ suffix: "a", split: "threshold_calibration", leakageGroupId: "cluster:shared" }),
        entry({ suffix: "b", split: "held_out_detector", leakageGroupId: "cluster:shared" }),
      ],
      createdAt: CREATED_AT,
    })).toThrow(/leakage group.*crosses/);
  });

  it("keeps calibration and confirmatory authority distinct", () => {
    expect(() => createV6TaskBankManifestV1({
      bankRef: { id: "swarmalpha.task-bank.v6-cal", version: "1.0.0" },
      purpose: "calibration_candidate",
      entries: [
        entry({ suffix: "a", split: "threshold_calibration" }),
        entry({ suffix: "b", split: "held_out_detector" }),
        entry({ suffix: "c", split: "confirmatory" }),
      ],
      createdAt: CREATED_AT,
    })).toThrow(/cannot grant confirmatory/);
    expect(() => createV6TaskBankManifestV1({
      bankRef: { id: "swarmalpha.task-bank.v6-confirmatory", version: "1.0.0" },
      purpose: "confirmatory_candidate",
      entries: [
        entry({ suffix: "a", split: "threshold_calibration" }),
        entry({ suffix: "b", split: "held_out_detector" }),
      ],
      createdAt: CREATED_AT,
    })).toThrow(/requires a non-empty confirmatory/);
  });

  it("rejects duplicate task authority and non-canonical entry order", () => {
    const first = entry({ suffix: "a", split: "threshold_calibration" });
    const duplicate = { ...entry({ suffix: "b", split: "held_out_detector" }), taskId: first.taskId };
    expect(() => createV6TaskBankManifestV1({
      bankRef: { id: "swarmalpha.task-bank.v6-duplicate", version: "1.0.0" },
      purpose: "calibration_candidate",
      entries: [first, duplicate],
      createdAt: CREATED_AT,
    })).toThrow(/must be unique/);

    const valid = createV6TaskBankManifestV1({
      bankRef: { id: "swarmalpha.task-bank.v6-order", version: "1.0.0" },
      purpose: "calibration_candidate",
      entries: [
        entry({ suffix: "a", split: "threshold_calibration" }),
        entry({ suffix: "b", split: "held_out_detector" }),
      ],
      createdAt: CREATED_AT,
    });
    const reversed = { ...valid, entries: [...valid.entries].reverse() };
    const selfConsistent = {
      ...reversed,
      contentHash: computeV6TaskBankManifestHashV1(bodyOf(reversed)),
    };
    expect(() => validateV6TaskBankManifestV1(selfConsistent)).toThrow(/canonical.*order/);
  });

  it("rejects task-manifest identity drift and self-consistent split reassignment", () => {
    const bank = createV6TaskBankManifestV1({
      bankRef: { id: "swarmalpha.task-bank.v6-engineering", version: "1.0.0" },
      purpose: "engineering_only",
      entries: [actualEngineeringEntry()],
      createdAt: CREATED_AT,
    });
    const taskManifest = actualTaskManifest();
    expect(() => validateV6TaskBankAdmissionV1({
      bank,
      taskManifest: { ...taskManifest, adapterRef: { id: "forged.adapter", version: "1.0.0" } },
      requiredSplit: "engineering_canary",
    })).toThrow();

    const changed = {
      ...bank,
      purpose: "calibration_candidate" as const,
      entries: bank.entries.map(item => ({
        ...item,
        split: "threshold_calibration" as const,
        semanticReview: acceptedReview(),
      })),
    };
    const selfConsistent = {
      ...changed,
      contentHash: computeV6TaskBankManifestHashV1(bodyOf(changed)),
    };
    expect(() => validateV6TaskBankManifestV1(selfConsistent))
      .toThrow(/non-empty calibration and held-out/);
  });
});
