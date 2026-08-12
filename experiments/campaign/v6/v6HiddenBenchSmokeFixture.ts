import type { V6CategoricalTaskV1 } from "./productionVerticalSlice";
import {
  createHiddenBenchTaskBankEntryV1,
  createHiddenBenchTaskProjectionV1,
  type HiddenBenchTaskProjectionV1,
} from "./hiddenBenchTaskAdapter";
import { createV6TaskBankManifestV1, type V6TaskBankManifestV1 } from "./taskBank";
import {
  createV6SmokeFixtureFromAdapterV1,
  type V6SmokeFixtureV1,
} from "./v6BinarySmokeFixture";

export interface V6HiddenBenchSmokeFixtureV1
  extends V6SmokeFixtureV1<V6CategoricalTaskV1> {
  hiddenBenchSource: HiddenBenchTaskProjectionV1["sourceRef"];
  taskBankAdmission: {
    bank: V6TaskBankManifestV1;
    requiredSplit: "engineering_canary";
  };
}

/**
 * Build one engineering-only HiddenBench smoke fixture from the pinned data
 * authority. This function does not infer scientific splits and cannot create
 * calibration, held-out, or confirmatory authority.
 */
export function createV6HiddenBenchSmokeFixtureV1(input: {
  sourceTaskId: number;
  dataPath?: string;
  certaintyLowerBound?: number;
  profile?: "legacy-256-v1" | "expanded-json-v2" | "mechanism-check-07-v1";
}): V6HiddenBenchSmokeFixtureV1 {
  const projection = createHiddenBenchTaskProjectionV1({
    sourceTaskId: input.sourceTaskId,
    dataPath: input.dataPath,
  });
  const optionCount = projection.adapter.task.claim.options.length;
  const agentCount = projection.adapter.task.agents.length;
  const profile = input.profile ?? "legacy-256-v1";
  const namespace = profile === "legacy-256-v1"
    ? `v6-hiddenbench-${input.sourceTaskId}-engineering`
    : profile === "expanded-json-v2"
      ? `v6-hiddenbench-${input.sourceTaskId}-engineering-expanded-json-v2`
      : `v6-hiddenbench-${input.sourceTaskId}-mechanism-check-07-v1`;
  const base = createV6SmokeFixtureFromAdapterV1({
    adapter: projection.adapter,
    namespace,
    certaintyLowerBound: input.certaintyLowerBound
      ?? (profile === "mechanism-check-07-v1" ? 0.7 : 0.9),
    stratum: {
      taskFamily: "hiddenbench-categorical",
      taskId: projection.adapter.task.id,
      claimOptionCount: optionCount,
      agentCount,
    },
    evaluationContractRef: {
      id: "swarmalpha.eval.v6-hiddenbench-categorical",
      version: "1.0.0",
    },
    adapterContractNamespace: `hiddenbench-${input.sourceTaskId}`,
    budgetContractRef: {
      id: "swarmalpha.budget.v6-hiddenbench-engineering",
      version: "1.0.0",
    },
    frozenAt: "2026-08-11T00:00:00.000Z",
    clockStartAt: "2026-08-11T00:00:01.000Z",
    ...(profile !== "legacy-256-v1" ? { discussionMaxTokens: 768 } : {}),
  });
  const bank = createV6TaskBankManifestV1({
    bankRef: {
      id: `swarmalpha.task-bank.v6-hiddenbench-${input.sourceTaskId}-engineering`,
      version: "1.0.0",
    },
    purpose: "engineering_only",
    entries: [createHiddenBenchTaskBankEntryV1({
      sourceTaskId: input.sourceTaskId,
      split: "engineering_canary",
      semanticReview: { status: "not_reviewed" },
      dataPath: input.dataPath,
    })],
    createdAt: "2026-08-11T00:00:00.000Z",
  });
  return {
    ...base,
    hiddenBenchSource: structuredClone(projection.sourceRef),
    taskBankAdmission: {
      bank: structuredClone(bank),
      requiredSplit: "engineering_canary",
    },
  };
}
