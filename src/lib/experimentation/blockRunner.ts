import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { computePairedAlpha, type AlphaLambdas, type PairedAlpha } from "./alpha";
import { createRunAssignment, type TreatmentAssignment } from "./assignment";
import {
  validateBudgetContract,
  type BlockOutcome,
  type BudgetContract,
  type ExperimentalArm,
} from "./baseline";

export const SIX_ARM_PROTOCOL = [
  "independent_ensemble",
  "vanilla_interaction",
  "random_governance",
  "diagnostic_governance",
  "epistemic_governance",
  "full_information_oracle",
] as const satisfies readonly ExperimentalArm[];

export interface BlockPromptTask {
  id: string;
  publicContext: string;
  options: string[];
  agents: Array<{ id: string; privateEvidence: string[] }>;
}

export interface BlockProtocolTask extends BlockPromptTask {
  correctAnswer: string;
}

export interface BlockLlmRequest {
  arm: ExperimentalArm;
  agentId: string;
  seed: number;
  publicContext: string;
  visibleEvidence: string[];
  visibleReports: Array<{ agentId: string; decision: string; confidence: number; evidenceIds: string[] }>;
  governanceAction?: string;
  requireExplicitBelief: boolean;
}

export interface BlockLlmResponse {
  decision: string;
  confidence: number;
  evidenceIds: string[];
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

export interface BlockLlm {
  modelId: string;
  complete(request: BlockLlmRequest): Promise<BlockLlmResponse>;
}

export interface ArmCallRecord {
  callIndex: number;
  agentId: string;
  observedAgentIds: string[];
  visibleEvidenceIds: string[];
  governanceAction?: string;
  response: BlockLlmResponse;
}

export interface ArmRawArtifact {
  artifactType: "swarmalpha.experimental-arm-raw";
  schemaVersion: "1.0.0";
  blockId: string;
  arm: ExperimentalArm;
  assignment: TreatmentAssignment;
  taskId: string;
  modelId: string;
  replicateSeed: number;
  budgetContract: BudgetContract;
  budgetContractHash: string;
  calls: ArmCallRecord[];
  collectiveDecision: string | null;
  outcome: BlockOutcome;
  failureCode?: string;
}

export interface SixArmAssignmentManifest {
  artifactType: "swarmalpha.six-arm-assignment-manifest";
  schemaVersion: "1.0.0";
  blockId: string;
  taskId: string;
  modelId: string;
  replicateSeed: number;
  budgetContract: BudgetContract;
  budgetContractHash: string;
  assignments: TreatmentAssignment[];
}

export interface SixArmBlockResult {
  manifest: SixArmAssignmentManifest;
  artifacts: ArmRawArtifact[];
  alpha: PairedAlpha;
  costTable: Array<{
    arm: ExperimentalArm;
    status: BlockOutcome["status"];
    quality: number | null;
    totalTokens: number | null;
    totalLatencyMs: number | null;
    failureCode?: string;
  }>;
}

export interface SixArmArtifactSink {
  writeManifest(manifest: SixArmAssignmentManifest): void | Promise<void>;
  writeArmArtifact(artifact: ArmRawArtifact): void | Promise<void>;
}

/** Immutable JSON sink used by the mock Gate and later campaign orchestration. */
export function createJsonDirectoryArtifactSink(outputDir: string): SixArmArtifactSink {
  const root = path.resolve(outputDir);
  fs.mkdirSync(root, { recursive: true });
  const writeExclusive = (fileName: string, value: unknown): void => {
    fs.writeFileSync(path.join(root, fileName), JSON.stringify(value, null, 2) + "\n", {
      encoding: "utf8",
      flag: "wx",
    });
  };
  return {
    writeManifest(manifest) {
      writeExclusive("assignment-manifest.json", manifest);
    },
    writeArmArtifact(artifact) {
      writeExclusive(`${artifact.arm}.arm-raw.json`, artifact);
    },
  };
}

function stableHash(value: unknown): string {
  const canonicalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonicalize);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
          .map(([key, child]) => [key, canonicalize(child)]),
      );
    }
    return input;
  };
  return createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function validateResponse(
  response: BlockLlmResponse,
  task: BlockPromptTask,
  request: Omit<BlockLlmRequest, "seed" | "arm">,
): void {
  if (!task.options.includes(response.decision)) throw new Error("invalid_decision");
  if (!Number.isFinite(response.confidence) || response.confidence < 0 || response.confidence > 1) {
    throw new Error("invalid_confidence");
  }
  if (!Array.isArray(response.evidenceIds) || response.evidenceIds.some(id => typeof id !== "string")) {
    throw new Error("invalid_evidence_ids");
  }
  const visibleEvidenceIds = new Set([
    ...request.visibleEvidence,
    ...request.visibleReports.flatMap(report => report.evidenceIds),
  ]);
  if (response.evidenceIds.some(id => !visibleEvidenceIds.has(id))) throw new Error("unobserved_evidence_id");
  for (const value of [response.promptTokens, response.completionTokens, response.latencyMs]) {
    if (!Number.isFinite(value) || value < 0) throw new Error("invalid_cost");
  }
}

function majorityDecision(responses: BlockLlmResponse[], options: string[]): string {
  const counts = new Map(options.map(option => [option, 0]));
  for (const response of responses) counts.set(response.decision, (counts.get(response.decision) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || options.indexOf(left[0]) - options.indexOf(right[0]))[0][0];
}

interface ArmExecution {
  calls: ArmCallRecord[];
  collectiveDecision: string | null;
  cost: BlockOutcome["cost"];
  failureCode?: string;
}

async function executeArm(input: {
  arm: ExperimentalArm;
  assignment: TreatmentAssignment;
  task: BlockPromptTask;
  llm: BlockLlm;
  budget: BudgetContract;
}): Promise<ArmExecution> {
  const { arm, assignment, task, llm, budget } = input;
  const calls: ArmCallRecord[] = [];
  let callCount = 0;
  const call = async (request: Omit<BlockLlmRequest, "seed" | "arm">): Promise<BlockLlmResponse> => {
    if (budget.maxLlmCalls !== undefined && callCount >= budget.maxLlmCalls) throw new Error("llm_call_budget_exceeded");
    const callIndex = callCount++;
    const response = await llm.complete({ ...request, arm, seed: (assignment.seed + callIndex) >>> 0 });
    validateResponse(response, task, request);
    calls.push({
      callIndex,
      agentId: request.agentId,
      observedAgentIds: [...new Set(request.visibleReports.map(report => report.agentId))].sort(),
      visibleEvidenceIds: [...request.visibleEvidence],
      governanceAction: request.governanceAction,
      response,
    });
    const promptTokens = calls.reduce((sum, record) => sum + record.response.promptTokens, 0);
    const completionTokens = calls.reduce((sum, record) => sum + record.response.completionTokens, 0);
    const wallClockMs = calls.reduce((sum, record) => sum + record.response.latencyMs, 0);
    if (budget.maxPromptTokens !== undefined && promptTokens > budget.maxPromptTokens) {
      throw new Error("prompt_token_budget_exceeded");
    }
    if (budget.maxCompletionTokens !== undefined && completionTokens > budget.maxCompletionTokens) {
      throw new Error("completion_token_budget_exceeded");
    }
    if (budget.maxWallClockMs !== undefined && wallClockMs > budget.maxWallClockMs) {
      throw new Error("wall_clock_budget_exceeded");
    }
    return response;
  };

  try {
    const interactive = arm !== "independent_ensemble" && arm !== "full_information_oracle";
    const requiredRounds = interactive ? 2 : 1;
    if (budget.maxRounds !== undefined && budget.maxRounds < requiredRounds) {
      throw new Error("round_budget_exceeded");
    }
    const firstPass: Array<{ agentId: string; response: BlockLlmResponse }> = [];
    const allEvidence = [...new Set(task.agents.flatMap(agent => agent.privateEvidence))];
    for (const agent of task.agents) {
      const response = await call({
        agentId: agent.id,
        publicContext: task.publicContext,
        visibleEvidence: arm === "full_information_oracle" ? allEvidence : agent.privateEvidence,
        visibleReports: [],
        requireExplicitBelief: arm === "epistemic_governance",
      });
      firstPass.push({ agentId: agent.id, response });
    }

    let finalResponses = firstPass.map(item => item.response);
    if (interactive) {
      const reports = firstPass.map(item => ({
        agentId: item.agentId,
        decision: item.response.decision,
        confidence: item.response.confidence,
        evidenceIds: item.response.evidenceIds,
      }));
      const disagreement = new Set(reports.map(report => report.decision)).size > 1;
      const randomTarget = task.agents[assignment.seed % Math.max(1, task.agents.length)]?.id;
      const diagnosticTarget = disagreement
        ? [...reports].sort((left, right) => left.confidence - right.confidence
          || (left.agentId < right.agentId ? -1 : left.agentId > right.agentId ? 1 : 0))[0]?.agentId
        : undefined;
      finalResponses = [];
      for (const agent of task.agents) {
        let governanceAction: string | undefined;
        if (arm === "random_governance" && agent.id === randomTarget) governanceAction = "review_random_alternative";
        if (arm === "diagnostic_governance" && agent.id === diagnosticTarget) {
          governanceAction = "review_disagreement_evidence";
        }
        if (arm === "epistemic_governance") {
          const overconfident = reports.some(report => report.confidence >= 0.9 && report.evidenceIds.length === 0);
          governanceAction = overconfident ? "verify_high_confidence_low_evidence" : "deduplicate_source_lineage";
        }
        finalResponses.push(await call({
          agentId: agent.id,
          publicContext: task.publicContext,
          visibleEvidence: agent.privateEvidence,
          visibleReports: reports,
          governanceAction,
          requireExplicitBelief: arm === "epistemic_governance",
        }));
      }
    }

    const decision = majorityDecision(finalResponses, task.options);
    const cost = {
      promptTokens: calls.reduce((sum, record) => sum + record.response.promptTokens, 0),
      completionTokens: calls.reduce((sum, record) => sum + record.response.completionTokens, 0),
      totalTokens: calls.reduce((sum, record) => sum + record.response.promptTokens + record.response.completionTokens, 0),
      totalLatencyMs: calls.reduce((sum, record) => sum + record.response.latencyMs, 0),
      invalidOrFailed: 0,
    };
    return deepFreeze({
      calls,
      collectiveDecision: decision,
      cost,
    });
  } catch (error) {
    const failureCode = error instanceof Error ? error.message : String(error);
    return deepFreeze({
      calls,
      collectiveDecision: null,
      cost: {
        promptTokens: calls.reduce((sum, record) => sum + record.response.promptTokens, 0),
        completionTokens: calls.reduce((sum, record) => sum + record.response.completionTokens, 0),
        totalTokens: calls.reduce((sum, record) => sum + record.response.promptTokens + record.response.completionTokens, 0),
        totalLatencyMs: calls.reduce((sum, record) => sum + record.response.latencyMs, 0),
        invalidOrFailed: 1,
      },
      failureCode,
    });
  }
}

export async function runSixArmBlock(input: {
  task: BlockProtocolTask;
  llm: BlockLlm;
  replicateSeed: number;
  budgetContract: BudgetContract;
  lambdas?: AlphaLambdas;
  artifactSink?: SixArmArtifactSink;
  assignedAt?: string;
}): Promise<SixArmBlockResult> {
  validateBudgetContract(input.budgetContract);
  if (!Number.isSafeInteger(input.replicateSeed)) throw new Error("replicateSeed must be a safe integer");
  if (typeof input.task.id !== "string" || input.task.id.length === 0) throw new Error("task.id must be non-empty");
  if (typeof input.task.publicContext !== "string") throw new Error("task.publicContext must be a string");
  if (typeof input.llm.modelId !== "string" || input.llm.modelId.length === 0) throw new Error("llm.modelId must be non-empty");
  if (input.task.options.length === 0
    || input.task.options.some(option => typeof option !== "string" || option.length === 0)
    || new Set(input.task.options).size !== input.task.options.length) {
    throw new Error("task.options must contain unique non-empty options");
  }
  if (!input.task.options.includes(input.task.correctAnswer)) throw new Error("correctAnswer must be in task.options");
  if (input.task.agents.length === 0) throw new Error("six-arm block requires at least one agent");
  if (input.task.agents.some(agent => typeof agent.id !== "string" || agent.id.length === 0)
    || new Set(input.task.agents.map(agent => agent.id)).size !== input.task.agents.length) {
    throw new Error("task agents must have unique non-empty ids");
  }
  if (input.task.agents.some(agent => !Array.isArray(agent.privateEvidence)
    || agent.privateEvidence.some(evidence => typeof evidence !== "string" || evidence.length === 0))) {
    throw new Error("agent privateEvidence must be an array of non-empty strings");
  }
  const assignedAt = input.assignedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(assignedAt))) throw new Error("assignedAt must be a timestamp");
  const promptTask: BlockPromptTask = {
    id: input.task.id,
    publicContext: input.task.publicContext,
    options: [...input.task.options],
    agents: input.task.agents.map(agent => ({ id: agent.id, privateEvidence: [...agent.privateEvidence] })),
  };
  const correctAnswer = input.task.correctAnswer;
  const blockId = `${input.task.id}|${input.llm.modelId}|${input.replicateSeed}`;
  const budgetContractHash = stableHash(input.budgetContract);
  const assignments = SIX_ARM_PROTOCOL.map((arm, index) => createRunAssignment({
    id: `asn:${blockId}:${arm}`,
    unitId: `${blockId}:${arm}`,
    stratum: { taskId: input.task.id, modelId: input.llm.modelId, replicateSeed: input.replicateSeed, arm },
    arm,
    policyId: `swarmalpha.six-arm.${arm}`,
    policyVersion: "1.0.0",
    masterSeed: (input.replicateSeed + index * 0x9E3779B1) >>> 0,
    assignedAt,
  }));
  const manifest = deepFreeze({
    artifactType: "swarmalpha.six-arm-assignment-manifest" as const,
    schemaVersion: "1.0.0" as const,
    blockId,
    taskId: input.task.id,
    modelId: input.llm.modelId,
    replicateSeed: input.replicateSeed,
    budgetContract: input.budgetContract,
    budgetContractHash,
    assignments,
  });
  await input.artifactSink?.writeManifest(manifest);
  const artifacts: ArmRawArtifact[] = [];
  for (let index = 0; index < SIX_ARM_PROTOCOL.length; index++) {
    const execution = await executeArm({
      arm: SIX_ARM_PROTOCOL[index],
      assignment: manifest.assignments[index],
      task: promptTask,
      llm: input.llm,
      budget: input.budgetContract,
    });
    const outcome: BlockOutcome = {
      arm: SIX_ARM_PROTOCOL[index],
      blockKey: blockId,
      taskId: promptTask.id,
      modelId: input.llm.modelId,
      replicateSeed: input.replicateSeed,
      evaluationContractRef: { id: "swarmalpha.categorical.ranking", version: "1.0.0" },
      metricRef: { id: "swarmalpha.categorical.accuracy", version: "1.0.0", direction: "higher_is_better" },
      budgetContractHash,
      quality: execution.failureCode ? null : (execution.collectiveDecision === correctAnswer ? 1 : 0),
      cost: execution.cost,
      status: execution.failureCode ? "invalid" : "scored",
    };
    const artifact: ArmRawArtifact = deepFreeze({
      artifactType: "swarmalpha.experimental-arm-raw",
      schemaVersion: "1.0.0",
      blockId,
      arm: SIX_ARM_PROTOCOL[index],
      assignment: manifest.assignments[index],
      taskId: promptTask.id,
      modelId: input.llm.modelId,
      replicateSeed: input.replicateSeed,
      budgetContract: input.budgetContract,
      budgetContractHash,
      calls: execution.calls,
      collectiveDecision: execution.collectiveDecision,
      outcome,
      ...(execution.failureCode ? { failureCode: execution.failureCode } : {}),
    });
    artifacts.push(artifact);
    await input.artifactSink?.writeArmArtifact(artifact);
  }
  const alpha = computePairedAlpha(artifacts.map(artifact => artifact.outcome), input.lambdas);
  const costTable = artifacts.map(artifact => ({
    arm: artifact.arm,
    status: artifact.outcome.status,
    quality: artifact.outcome.quality,
    totalTokens: artifact.outcome.cost.totalTokens ?? null,
    totalLatencyMs: artifact.outcome.cost.totalLatencyMs ?? null,
    ...(artifact.failureCode ? { failureCode: artifact.failureCode } : {}),
  }));
  return deepFreeze({ manifest, artifacts, alpha, costTable });
}
