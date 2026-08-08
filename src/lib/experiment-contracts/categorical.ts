/**
 * Categorical evaluation contract (v1) — the only implemented scoring contract
 * for the first paper. Preference/open-ended kinds are interface-only and fail
 * closed with "not implemented".
 *
 * Truth shape for categorical: `Record<canonicalOption, rank>` where rank 1 is
 * the single correct answer (legacy `correctAnswer` semantics).
 */

import type { EvaluationContract, EvaluationRecord, TaskKind } from "./contracts";

export interface CategoricalDecision {
  /** 群体最终排名：从最优到最差的 canonical 候选。 */
  ranking: string[];
}

export interface CategoricalTruth {
  /** canonical 候选 → rank（1 = 最佳）。 */
  ranks: Record<string, number>;
}

export function validateCategoricalDecision(decision: unknown): CategoricalDecision {
  if (decision === null || typeof decision !== "object") {
    throw new Error("categorical decision must be an object");
  }
  const d = decision as Record<string, unknown>;
  if (!Array.isArray(d.ranking) || d.ranking.some(item => typeof item !== "string" || item.length === 0)) {
    throw new Error("categorical decision.ranking must be an array of non-empty strings");
  }
  return { ranking: d.ranking as string[] };
}

/** 单选准确率：排名第一是否等于 rank=1 的候选。 */
export function categoricalAccuracy(ranking: string[], truth: CategoricalTruth): number {
  const correct = Object.entries(truth.ranks).find(([, rank]) => rank === 1)?.[0];
  if (correct === undefined || ranking.length === 0) return 0;
  return ranking[0] === correct ? 1 : 0;
}

/**
 * 单选任务评分。`applicability === "not_applicable"` 表示 unresolved/open-ended
 * 或无排名，绝不返回 0 伪装成"未答对"。
 */
export function scoreCategoricalRanking(ranking: string[], truth: CategoricalTruth, taskId: string): EvaluationRecord {
  if (ranking.length === 0 || Object.keys(truth.ranks).length === 0) {
    return {
      taskId,
      contractId: CATEGORICAL_RANKING_CONTRACT.id,
      contractVersion: CATEGORICAL_RANKING_CONTRACT.version,
      applicability: "not_applicable",
      missingness: ["ranking_empty_or_truth_empty"],
    };
  }
  return {
    taskId,
    contractId: CATEGORICAL_RANKING_CONTRACT.id,
    contractVersion: CATEGORICAL_RANKING_CONTRACT.version,
    applicability: "applicable",
    accuracy: categoricalAccuracy(ranking, truth),
    missingness: [],
  };
}

export const CATEGORICAL_RANKING_CONTRACT: EvaluationContract<CategoricalDecision, CategoricalTruth> = {
  id: "swarmalpha.categorical.ranking",
  version: "1.0.0",
  taskKind: "verifiable_epistemic",
  validateDecision: validateCategoricalDecision,
  score(decision, truth) {
    return scoreCategoricalRanking(decision.ranking, truth, "");
  },
};

/**
 * 未实现契约：preference/open-ended 只保留接口，任何使用都 fail closed。
 */
export function notImplementedContract(kind: TaskKind, id: string, version: string): EvaluationContract {
  const fail = (): never => {
    throw new Error(`evaluation contract ${id}@${version} for ${kind} is not implemented`);
  };
  return {
    id,
    version,
    taskKind: kind,
    validateDecision: fail,
    score: fail,
  };
}

export const PREFERENCE_AGGREGATION_CONTRACT: EvaluationContract = notImplementedContract(
  "preference_aggregation",
  "swarmalpha.preference_aggregation",
  "1.0.0",
);

export const OPEN_ENDED_SYNTHESIS_CONTRACT: EvaluationContract = notImplementedContract(
  "open_ended_synthesis",
  "swarmalpha.open_ended_synthesis",
  "1.0.0",
);
