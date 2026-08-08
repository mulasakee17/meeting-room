/**
 * Experiment contracts — task ontology separated from scoring truth.
 *
 * The core scientific constraint (masterplan WP1): "task can be discussed" and
 * "answer can be scored" are two physical objects. A `PromptTask` MUST NOT
 * contain `correctAnswer`, `groundTruth`, `resolution`, or `scoringKey` — not by
 * convention, but by type and by runtime validation. Truth lives only in the
 * `scoringTask` half of an `ExperimentTaskBundle`, which is released to the
 * scorer only after discussion ends.
 *
 * This module deliberately has no dependency on the legacy `TaskConfig` type.
 * The one-way bridge from legacy tasks lives in
 * `experiments/campaign/tasks/legacyAdapter.ts`.
 */

/** 任务类别。第一篇只实现 `verifiable_epistemic`；另两类仅保留接口。 */
export type TaskKind = "verifiable_epistemic" | "preference_aggregation" | "open_ended_synthesis";

/** 候选注册表：canonical 键 + 匹配别名；顺序即展示顺序（不受 truth 顺序影响）。 */
export interface CandidateOption {
  canonical: string;
  aliases: string[];
}

export interface CandidateSpace {
  options: CandidateOption[];
}

/** 任务是什么、候选空间是什么、共享上下文。不含 truth。 */
export interface TaskSchema {
  id: string;
  version: string;
  kind: TaskKind;
  candidateSpace: CandidateSpace;
  publicContext: string;
  actionContractId: string;
  /** prompt 风格（信息不对称提示方式）；prompt 侧参数，非 truth。 */
  promptStyle?: "hint" | "nohint";
  /** prompt 侧角色定义（角色/初始立场），不含 truth。 */
  agents: ReadonlyArray<{
    id: string;
    name: string;
    role: string;
    initialBias?: string;
    /** 私有信息原文（prompt 侧已知信息）。 */
    privateInformation: string;
  }>;
}

/** 谁能看到什么。 */
export interface InformationMap {
  publicEvidenceIds: string[];
  privateEvidenceByAgent: Record<string, string[]>;
  visibilityPolicyId: string;
}

/**
 * 可被讨论的任务对象。类型与运行时校验双重保证不含 truth 字段。
 */
export interface PromptTask {
  schema: TaskSchema;
  information: InformationMap;
}

/** 真值信封：只用于讨论结束后的 scorer，绝不进入 prompt 路径。 */
export interface GroundTruthEnvelope<T = unknown> {
  taskId: string;
  resolverId: string;
  resolverVersion: string;
  value: T;
}

/** 评分记录。unresolved/open-ended → `not_applicable`，绝不是 0。 */
export interface EvaluationRecord {
  taskId: string;
  contractId: string;
  contractVersion: string;
  applicability: "applicable" | "not_applicable";
  accuracy?: number;
  negativeLogLoss?: number;
  multiclassBrier?: number;
  kendallTau?: number;
  missingness: string[];
}

/** 评分契约：只在讨论结束后获得 decision 与 truth。 */
export interface EvaluationContract<Decision = unknown, Truth = unknown> {
  id: string;
  version: string;
  taskKind: TaskKind;
  validateDecision(decision: unknown): Decision;
  score(decision: Decision, truth: Truth): EvaluationRecord;
}

/** 任务包：prompt 与 scoring 物理分离。 */
export interface ExperimentTaskBundle {
  promptTask: PromptTask;
  scoringTask: {
    groundTruth: GroundTruthEnvelope;
    evaluationContractRef: { id: string; version: string };
  };
}

/** 出现在 prompt 侧即视为 truth 泄漏的字段名。 */
export const FORBIDDEN_TRUTH_KEYS = [
  "correctAnswer",
  "correct_answer",
  "groundTruth",
  "ground_truth",
  "resolution",
  "scoringKey",
  "scoring_key",
] as const;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/**
 * 递归检查一个对象的 JSON 树中是否出现 truth 字段名（作为键）。只读、无副作用。
 */
export function containsForbiddenTruthKey(value: unknown, path = "promptTask"): string | null {
  if (value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = containsForbiddenTruthKey(item, path);
      if (hit) return hit;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if ((FORBIDDEN_TRUTH_KEYS as readonly string[]).includes(key)) {
      return `${path}.${key}`;
    }
    const hit = containsForbiddenTruthKey(record[key], `${path}.${key}`);
    if (hit) return hit;
  }
  return null;
}

/** 结构校验。非法 bundle 抛错（fail closed），不返回部分结果。 */
export function validateTaskBundle(value: unknown): asserts value is ExperimentTaskBundle {
  if (value === null || typeof value !== "object") {
    throw new Error("ExperimentTaskBundle must be a non-null object");
  }
  const bundle = value as Record<string, unknown>;
  if (bundle.promptTask === null || typeof bundle.promptTask !== "object") {
    throw new Error("bundle.promptTask must be an object");
  }
  if (bundle.scoringTask === null || typeof bundle.scoringTask !== "object") {
    throw new Error("bundle.scoringTask must be an object");
  }
  const scoringTask = bundle.scoringTask as Record<string, unknown>;
  if (scoringTask.groundTruth === null || typeof scoringTask.groundTruth !== "object") {
    throw new Error("bundle.scoringTask.groundTruth must be an object");
  }
  const groundTruth = scoringTask.groundTruth as Record<string, unknown>;
  if (typeof groundTruth.taskId !== "string" || groundTruth.taskId.length === 0) {
    throw new Error("groundTruth.taskId must be a non-empty string");
  }
  if (scoringTask.evaluationContractRef === null || typeof scoringTask.evaluationContractRef !== "object") {
    throw new Error("bundle.scoringTask.evaluationContractRef must be an object");
  }
  // Prompt side MUST NOT contain truth keys — runtime, not just type, check.
  const leak = containsForbiddenTruthKey(bundle.promptTask);
  if (leak) {
    throw new Error(`prompt task leaks truth at ${leak}`);
  }
}

/** 返回深冻结的 bundle（调用方无法事后污染 prompt/scoring 边界）。 */
export function freezeTaskBundle(bundle: ExperimentTaskBundle): ExperimentTaskBundle {
  validateTaskBundle(bundle);
  return deepFreeze(bundle);
}

/** 从 promptTask 的 candidateSpace 提取 canonical 候选列表（保持源顺序）。 */
export function candidateCanonicals(promptTask: PromptTask): string[] {
  return promptTask.schema.candidateSpace.options.map(option => option.canonical);
}

/** 从 promptTask 的 candidateSpace 提取 canonical → aliases 映射。 */
export function candidateAliases(promptTask: PromptTask): Record<string, string[]> {
  return Object.fromEntries(
    promptTask.schema.candidateSpace.options.map(option => [option.canonical, option.aliases]),
  );
}
