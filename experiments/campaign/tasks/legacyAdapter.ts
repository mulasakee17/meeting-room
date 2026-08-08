/**
 * One-way adapter from the legacy `TaskConfig` to the new
 * `ExperimentTaskBundle` (masterplan WP1).
 *
 * This is the ONLY place where the legacy task object is read in full. After
 * this bridge, the prompt side consumes a `PromptTask` (no truth) and the
 * scoring side consumes a `scoringTask` (truth only). Candidate/truth label
 * completeness is validated HERE (loader/audit), not in the prompt resolver.
 */

import type { TaskConfig } from "../../lunar_survival/config";
import {
  freezeTaskBundle,
  type ExperimentTaskBundle,
  type PromptTask,
} from "../../../src/lib/experiment-contracts/contracts";

/** 旧 task 作为 prompt 侧对象的版本标识。 */
const LEGACY_PROMPT_VERSION = "legacy-task-config-1.0.0";
const CATEGORICAL_CONTRACT_ID = "swarmalpha.categorical.ranking";
const CATEGORICAL_CONTRACT_VERSION = "1.0.0";

/**
 * Truth-label 完整性校验：searchKeys 的 canonical 集合必须与 correctAnswer
 * 标签集合一致。不一致即任务构造错误，fail closed。
 */
export function validateLegacyTruthCompleteness(task: Pick<TaskConfig, "searchKeys" | "correctAnswer">): void {
  const options = Object.keys(task.searchKeys ?? {});
  if (options.length === 0) {
    throw new Error("Task candidate schema is empty: searchKeys must declare every option");
  }
  const truthLabels = Object.keys(task.correctAnswer ?? {});
  const optionSet = new Set(options);
  const truthSet = new Set(truthLabels);
  const mismatch = optionSet.size !== truthSet.size
    || options.some(option => !truthSet.has(option))
    || truthLabels.some(label => !optionSet.has(label));
  if (mismatch) {
    throw new Error("Task candidate schema does not match correctAnswer labels");
  }
}

/** 从私有信息原文提取 evidence id（与旧 Runner/hiddenbench 的分割逻辑一致）。 */
export function extractEvidenceIds(knownItems: string): string[] {
  return knownItems
    .split(/[；;\n]/)
    .map(item => item.replace(/^[•\-\s]+/, "").trim())
    .filter(item => item.length > 3);
}

/**
 * 旧 `TaskConfig` → 新 `ExperimentTaskBundle`（单向，deep-frozen）。
 * `correctAnswer` 只进入 `scoringTask.groundTruth`，prompt 侧永不携带。
 */
export function taskConfigToBundle(task: TaskConfig): ExperimentTaskBundle {
  validateLegacyTruthCompleteness(task);

  const candidateSpace = {
    options: Object.keys(task.searchKeys ?? {}).map(canonical => ({
      canonical,
      aliases: task.searchKeys[canonical],
    })),
  };

  const promptTask: PromptTask = {
    schema: {
      id: task.id,
      version: LEGACY_PROMPT_VERSION,
      kind: "verifiable_epistemic",
      candidateSpace,
      publicContext: task.sharedBriefing || task.title,
      actionContractId: "swarmalpha.legacy.ranking",
      promptStyle: task.promptStyle,
      agents: (task.agents ?? []).map(agent => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        initialBias: agent.initialBias,
        privateInformation: agent.knownItems,
      })),
    },
    information: {
      publicEvidenceIds: [],
      privateEvidenceByAgent: Object.fromEntries(
        (task.agents ?? []).map(agent => [agent.id, extractEvidenceIds(agent.knownItems)]),
      ),
      visibilityPolicyId: "hidden-profile",
    },
  };

  return freezeTaskBundle({
    promptTask,
    scoringTask: {
      groundTruth: {
        taskId: task.id,
        resolverId: "swarmalpha.legacy.correct-answer",
        resolverVersion: "1.0.0",
        value: { ...task.correctAnswer },
      },
      evaluationContractRef: {
        id: CATEGORICAL_CONTRACT_ID,
        version: CATEGORICAL_CONTRACT_VERSION,
      },
    },
  });
}
