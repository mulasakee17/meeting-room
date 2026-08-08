/**
 * experiment-contracts.test.ts — WP1 TaskBundle / truth firewall 测试
 *
 * 覆盖 masterplan WP1 必须新增的测试：
 *   - TaskBundle runtime validation 与 deep-freeze；
 *   - PromptTask JSON 树中不存在 truth 字段（类型 + 运行时校验）；
 *   - prompt builder 输入不接受 scoring task；
 *   - candidate order 不受 correctAnswer 插入顺序影响；
 *   - malformed candidate/truth mismatch 在 loader 阶段 fail closed；
 *   - legacy adapter 输出与旧主路径候选集合等价；
 *   - categorical evaluation contract 正确评分 + 未实现契约 fail closed。
 */

import { describe, expect, it } from "vitest";
import type { TaskConfig } from "../experiments/lunar_survival/config";
import {
  validateTaskBundle,
  freezeTaskBundle,
  containsForbiddenTruthKey,
  candidateCanonicals,
  candidateAliases,
  type ExperimentTaskBundle,
} from "../src/lib/experiment-contracts/contracts";
import {
  CATEGORICAL_RANKING_CONTRACT,
  PREFERENCE_AGGREGATION_CONTRACT,
  OPEN_ENDED_SYNTHESIS_CONTRACT,
  scoreCategoricalRanking,
} from "../src/lib/experiment-contracts/categorical";
import {
  taskConfigToBundle,
  validateLegacyTruthCompleteness,
} from "../experiments/campaign/tasks/legacyAdapter";
import { resolveCandidateOptions } from "../experiments/campaign/pipeline/hiddenbenchProtocol";

function makeTask(overrides: Partial<TaskConfig> = {}): TaskConfig {
  return {
    id: "test-task",
    title: "Test task",
    correctAnswer: { "Option B": 1, "Option A": 2, "Option C": 3 },
    searchKeys: { "Option B": ["B"], "Option A": ["A"], "Option C": ["C"] },
    sharedBriefing: "Choose one",
    agents: [
      { id: "a1", name: "A1", role: "analyst", knownItems: "Private fact about B", initialBias: "neutral" },
    ],
    ...overrides,
  };
}

describe("TaskBundle validation and freezing", () => {
  it("builds a bundle whose promptTask contains no truth fields (runtime check)", () => {
    const bundle = taskConfigToBundle(makeTask());
    expect(containsForbiddenTruthKey(bundle.promptTask)).toBeNull();
    expect(JSON.stringify(bundle.promptTask)).not.toMatch(/correctAnswer|groundTruth|resolution|scoringKey/i);
  });

  it("freezes the bundle deeply so callers cannot break the prompt/scoring boundary", () => {
    const bundle = taskConfigToBundle(makeTask());
    expect(Object.isFrozen(bundle)).toBe(true);
    expect(Object.isFrozen(bundle.promptTask)).toBe(true);
    expect(Object.isFrozen(bundle.promptTask.schema.candidateSpace)).toBe(true);
    expect(Object.isFrozen(bundle.scoringTask.groundTruth)).toBe(true);
    // 冻结后赋值抛错（strict mode）。
    expect(() => { (bundle as unknown as { scoringTask: unknown }).scoringTask = null; }).toThrow();
  });

  it("validateTaskBundle rejects structurally invalid bundles", () => {
    const bundle = taskConfigToBundle(makeTask());
    expect(() => validateTaskBundle(null)).toThrow();
    expect(() => validateTaskBundle({ promptTask: null, scoringTask: { groundTruth: {}, evaluationContractRef: {} } })).toThrow();
    expect(() => validateTaskBundle({ promptTask: bundle.promptTask, scoringTask: null })).toThrow();
  });

  it("rejects a promptTask that leaks a truth field (runtime, not just type)", () => {
    const bundle = taskConfigToBundle(makeTask());
    const leaked: ExperimentTaskBundle = {
      promptTask: {
        ...bundle.promptTask,
        schema: { ...bundle.promptTask.schema, id: "leak" },
      } as unknown as ExperimentTaskBundle["promptTask"],
      scoringTask: bundle.scoringTask,
    };
    // 注入 truth 字段到 prompt 侧，validate/freeze 必须 fail closed。
    const tampered = JSON.parse(JSON.stringify(bundle)) as ExperimentTaskBundle;
    (tampered.promptTask as unknown as { groundTruth: unknown }).groundTruth = { taskId: "x" };
    expect(() => validateTaskBundle(tampered)).toThrow(/leaks truth/);
    expect(() => freezeTaskBundle(tampered)).toThrow(/leaks truth/);
    expect(leaked).toBeDefined();
  });
});

describe("candidate ordering and truth isolation", () => {
  it("keeps candidate order from searchKeys regardless of correctAnswer insertion order", () => {
    // correctAnswer 的键序不同，候选顺序必须仍来自 searchKeys。
    const task = makeTask({ correctAnswer: { "Option A": 2, "Option C": 3, "Option B": 1 } });
    const bundle = taskConfigToBundle(task);
    expect(candidateCanonicals(bundle.promptTask)).toEqual(["Option B", "Option A", "Option C"]);
    expect(candidateAliases(bundle.promptTask)).toEqual({
      "Option B": ["B"],
      "Option A": ["A"],
      "Option C": ["C"],
    });
  });

  it("fails closed in the loader on candidate/truth label divergence", () => {
    const task = makeTask();
    delete task.searchKeys["Option C"];
    expect(() => validateLegacyTruthCompleteness(task)).toThrow(/does not match/);
    expect(() => taskConfigToBundle(task)).toThrow(/does not match/);
  });

  it("legacy adapter candidates match the old prompt-path candidate set", () => {
    const task = makeTask();
    const bundle = taskConfigToBundle(task);
    expect(candidateCanonicals(bundle.promptTask)).toEqual(resolveCandidateOptions(task));
    expect(bundle.scoringTask.groundTruth.value).toEqual(task.correctAnswer);
  });

  it("scoring truth is only reachable through scoringTask", () => {
    const bundle = taskConfigToBundle(makeTask());
    const truth = bundle.scoringTask.groundTruth.value as Record<string, number>;
    expect(truth).toEqual({ "Option B": 1, "Option A": 2, "Option C": 3 });
  });
});

describe("categorical evaluation contract", () => {
  it("scores single-choice accuracy and not_applicable for empty ranking", () => {
    const truth = { ranks: { "Option B": 1, "Option A": 2, "Option C": 3 } };
    const record = scoreCategoricalRanking(["Option B", "Option A", "Option C"], truth, "t1");
    expect(record.applicability).toBe("applicable");
    expect(record.accuracy).toBe(1);

    const wrong = scoreCategoricalRanking(["Option A", "Option B", "Option C"], truth, "t1");
    expect(wrong.accuracy).toBe(0);

    const na = scoreCategoricalRanking([], truth, "t1");
    expect(na.applicability).toBe("not_applicable");
    expect(na.accuracy).toBeUndefined();
  });

  it("not-implemented contracts fail closed", () => {
    expect(() => PREFERENCE_AGGREGATION_CONTRACT.score({} as never, {} as never)).toThrow(/not implemented/);
    expect(() => OPEN_ENDED_SYNTHESIS_CONTRACT.validateDecision({} as never)).toThrow(/not implemented/);
  });

  it("the categorical contract is registered with a stable id/version", () => {
    expect(CATEGORICAL_RANKING_CONTRACT.id).toBe("swarmalpha.categorical.ranking");
    expect(CATEGORICAL_RANKING_CONTRACT.version).toBe("1.0.0");
    expect(CATEGORICAL_RANKING_CONTRACT.taskKind).toBe("verifiable_epistemic");
  });
});
