/**
 * Run-level governance estimate replay verifier — pure module (campaign layer).
 *
 * Verifies a persisted RawRunData object's `governanceEstimateHistory` at the
 * run level: strict (round, agentId) identity, cross-checks between the outer
 * identity and the record's own `input` snapshot, name provenance rules, and
 * estimator-version stability.
 *
 * Module contract:
 *   - no `main()` entry point;
 *   - never calls `process.exit`;
 *   - no top-level file reads;
 *   - importing this module has no side effects.
 *
 * Both the replay CLI (`./verify_replay.ts`) and the audit manifest generator
 * (`./generate_manifest.ts`) reuse the exact same verifier and status
 * derivation so the two can never drift. Record-level replay remains in the
 * epistemic core (`src/lib/epistemic/replay.ts`).
 *
 * Statistic self-consistency contract: `counts` only tally each record's
 * actual replay status and `sum(counts) === recordCount`; provenance/identity
 * problems are run-level `runIssues` and never pollute record-level counts.
 */

import {
  verifyGovernanceEstimateRecord,
  type ReplayStatus,
} from "../../src/lib/epistemic/replay";
import { hasReplayableEstimatorSchema } from "./types";
import {
  defaultProgressiveEstimatorRegistry,
  PROGRESSIVE_ESTIMATOR_ID,
} from "../../src/lib/thermodynamics/ProgressiveEstimator";
import { validateTreatmentAssignment } from "../../src/lib/experimentation/assignment";
import {
  validateApplicationReceipt,
  validateProximalOutcome,
  validateTaskOutcome,
  type TaskOutcomeRecord,
} from "../../src/lib/experimentation/lifecycle";
import {
  validateGovernanceStudyContract,
  validatePrimaryAssignmentManifestForStudy,
  type GovernanceStudyContract,
} from "../../src/lib/experimentation/governanceStudy";
import type { PrimaryAssignmentManifestV1 } from "../../src/lib/experimentation/primaryAssignment";
import {
  validatePrimaryArmExecutionBindingV1,
  validatePrimaryArmExecutionRegistryV1,
  type PrimaryArmExecutionBindingV1,
  type PrimaryArmExecutionRegistryV1,
} from "../../src/lib/experimentation/primaryAssignmentExecution";
import {
  replayGovernanceAuditTrailDecisions,
  validateGovernanceAuditTrail,
  type GovernanceAuditTrail,
  type GovernanceAuditVerification,
} from "../../src/lib/experimentation/governanceAuditTrail";
import {
  FINAL_OUTCOME_TASK_EVALUATION_V1,
  validateFinalOutcomeArtifact,
  type FinalOutcomeArtifactV1,
} from "../../src/lib/experimentation/finalOutcome";
import {
  OPERATIONAL_POOLED_BRIER_ESTIMAND_V1,
  computeFinalOutcomeArtifactHashV1,
  validateOperationalAnalysisUnitV1,
  validateOperationalOutcomeArtifactV1,
  type OperationalAnalysisUnitV1,
  type OperationalOutcomeArtifactV1,
} from "../../src/lib/experimentation/operationalOutcome";
import type { GovernanceEligibilityRule } from "../../src/lib/governance";
import { governanceRefKey } from "../../src/lib/governance/controlContracts";

export type { ReplayStatus } from "../../src/lib/epistemic/replay";

export interface ReplayDiagnostic {
  round: number;
  agentId: string;
  status: ReplayStatus;
  mismatches: string[];
  message?: string;
}

/**
 * Run-level provenance issue that is not attributable to a single record's
 * replay status (duplicate identity, invalid round/agent, name mismatch,
 * input/identity mismatch, mixed estimator versions, verifier exception).
 */
export interface ReplayRunIssue {
  round: number;
  agentId: string;
  code: string;
  message: string;
}

export interface ReplayFileResult {
  file: string;
  schemaVersion?: string;
  recordCount: number;
  counts: Record<ReplayStatus, number>;
  runIssues: ReplayRunIssue[];
  diagnostics: ReplayDiagnostic[];
  governanceAuditStatus?: GovernanceAuditVerification["status"] | "decision_replay_required";
}

export interface RawRunReplayOptions {
  /** Exact version-matched executable rules; required for confirmatory schema 5. */
  governanceRules?: readonly GovernanceEligibilityRule[];
}

export interface ReplaySummary {
  files: ReplayFileResult[];
  totals: Record<ReplayStatus, number>;
  totalFiles: number;
  totalRecords: number;
  totalRunIssues: number;
}

export const EMPTY_COUNTS: Record<ReplayStatus, number> = {
  verified: 0,
  mismatch: 0,
  legacy_unverifiable: 0,
  unsupported_estimator: 0,
  invalid_record: 0,
};

/**
 * 验证单个已解析的 RawRunData 对象。记录级判定交给纯重放库；
 * 此处补充记录集级（run-level）校验：
 *   - round 必须是 >= 1 的 safe integer，且不超过 totalRounds（若存在）
 *   - agentId 必须是非空字符串
 *   - (round, agentId) 唯一
 *   - 记录自身的 input.round / input.agentId 与外层身份一致（防重新归属）
 *   - progressive record name 与身份一致（仅对渐进估算器生效）
 *   - schema-2 下估算器 id/version 稳定
 *
 * 统计自洽：sum(counts) === recordCount；身份/一致性/混合版本问题计入
 * runIssues。公共函数对 unknown 输入永不抛出。
 */
export function verifyRawRunData(
  file: string,
  data: unknown,
  options: RawRunReplayOptions = {},
): ReplayFileResult {
  const result: ReplayFileResult = {
    file,
    schemaVersion: undefined,
    recordCount: 0,
    counts: { ...EMPTY_COUNTS },
    runIssues: [],
    diagnostics: [],
  };

  try {
    // 所有对 unknown 的访问都在 try 内，accessor/Proxy 抛错映射为 run issue。
    const container = data as Record<string, unknown> | null;
    result.schemaVersion = container?.rawSchemaVersion as string | undefined;
    // WP2: treatment lifecycle integrity (assignment → receipts → outcome).
    verifyGovernanceLifecycle(container, result);
    // CC-2: an explicit governance study declaration is validated when present;
    // a missing declaration stays readable legacy data and is never inferred.
    verifyStudyContractDeclaration(container, result);
    verifyPrimaryAssignmentV5(container, result);
    verifyFinalOutcomeV5(container, result);
    verifyOperationalOutcomeV5(container, result);
    verifyGovernanceAuditTrailV5(container, result, options);
    const history = container?.governanceEstimateHistory;
    if (!Array.isArray(history)) return result;

    const totalRounds = container?.totalRounds;
    const totalRoundsValid = typeof totalRounds === "number" && Number.isSafeInteger(totalRounds);

    const seenKeys = new Set<string>();
    const seenEstimatorRefs = new Set<string>();

    for (const entry of history) {
      if (!entry || typeof entry !== "object") {
        result.runIssues.push({
          round: -1,
          agentId: "(unknown)",
          code: "invalid_entry",
          message: "governanceEstimateHistory entry is not an object",
        });
        const replayResult = verifyGovernanceEstimateRecord(undefined, defaultProgressiveEstimatorRegistry);
        result.recordCount++;
        result.counts[replayResult.status]++;
        result.diagnostics.push({
          round: -1,
          agentId: "(unknown)",
          status: replayResult.status,
          mismatches: [],
          message: "entry is not an object",
        });
        continue;
      }

      const round = (entry as Record<string, unknown>).round;
      const agentId = (entry as Record<string, unknown>).agentId;

      // ── 严格验证外层身份（run-level，不污染记录级 counts）──
      let effectiveRound = -1;
      let effectiveAgentId = "(unknown)";
      let identityValid = true;
      if (typeof round !== "number" || !Number.isSafeInteger(round) || round < 1) {
        result.runIssues.push({
          round: -1,
          agentId: typeof agentId === "string" ? agentId : "(unknown)",
          code: "invalid_round",
          message: "round must be a safe integer >= 1",
        });
        identityValid = false;
      } else if (totalRoundsValid && (round as number) > (totalRounds as number)) {
        result.runIssues.push({
          round: round as number,
          agentId: typeof agentId === "string" ? agentId : "(unknown)",
          code: "round_out_of_range",
          message: `round ${String(round)} exceeds totalRounds ${String(totalRounds)}`,
        });
        identityValid = false;
      } else {
        effectiveRound = round as number;
      }
      if (typeof agentId !== "string" || agentId.length === 0) {
        result.runIssues.push({
          round: effectiveRound,
          agentId: "(unknown)",
          code: "invalid_agent_id",
          message: "agentId must be a non-empty string",
        });
        identityValid = false;
      } else {
        effectiveAgentId = agentId;
      }

      if (identityValid) {
        const key = JSON.stringify([effectiveRound, effectiveAgentId]);
        if (seenKeys.has(key)) {
          result.runIssues.push({
            round: effectiveRound,
            agentId: effectiveAgentId,
            code: "duplicate_entry",
            message: "duplicate (round, agentId) pair",
          });
        } else {
          seenKeys.add(key);
        }
      }

      // ── 记录级 replay 状态（每条记录恰好计一次）──
      const record = (entry as Record<string, unknown>).record;
      const replayResult = verifyGovernanceEstimateRecord(record, defaultProgressiveEstimatorRegistry);
      result.recordCount++;
      result.counts[replayResult.status]++;

      // ── input 内部身份与外层身份交叉校验（防重新归属）──
      if (identityValid && record !== null && typeof record === "object") {
        const input = (record as Record<string, unknown>).input;
        if (input !== null && typeof input === "object") {
          const inputRound = (input as Record<string, unknown>).round;
          if (typeof inputRound !== "number" || inputRound !== effectiveRound) {
            result.runIssues.push({
              round: effectiveRound,
              agentId: effectiveAgentId,
              code: "input_round_mismatch",
              message: `record.input.round=${String(inputRound)} does not match entry round=${effectiveRound}`,
            });
          }
          const inputAgentId = (input as Record<string, unknown>).agentId;
          if (typeof inputAgentId !== "string" || inputAgentId !== effectiveAgentId) {
            result.runIssues.push({
              round: effectiveRound,
              agentId: effectiveAgentId,
              code: "agent_id_mismatch",
              message: `record.input.agentId=${JSON.stringify(inputAgentId)} does not match entry agentId=${JSON.stringify(effectiveAgentId)}`,
            });
          }
        }
      }

      // ── progressive record name 与身份一致（仅对渐进估算器生效）──
      if (identityValid
        && replayResult.name
        && record !== null && typeof record === "object"
        && replayResult.estimatorId === PROGRESSIVE_ESTIMATOR_ID) {
        const expectedName = `progressive_icl:${effectiveAgentId}:round:${effectiveRound}`;
        if (replayResult.name !== expectedName) {
          result.runIssues.push({
            round: effectiveRound,
            agentId: effectiveAgentId,
            code: "name_mismatch",
            message: `record name ${JSON.stringify(replayResult.name)} does not match identity ${JSON.stringify(expectedName)}`,
          });
        }
      }

      // ── 稳定 id/version：schema 2+ 保留同一 estimator replay contract ──
      if (hasReplayableEstimatorSchema(result.schemaVersion)
        && replayResult.estimatorId && replayResult.estimatorVersion) {
        const ref = `${replayResult.estimatorId}@${replayResult.estimatorVersion}`;
        if (seenEstimatorRefs.size > 0 && !seenEstimatorRefs.has(ref)) {
          result.runIssues.push({
            round: effectiveRound,
            agentId: effectiveAgentId,
            code: "mixed_estimator",
            message: "mixed estimator id/version across one run",
          });
        }
        seenEstimatorRefs.add(ref);
      }

      if (replayResult.status !== "verified") {
        result.diagnostics.push({
          round: effectiveRound,
          agentId: effectiveAgentId,
          status: replayResult.status,
          mismatches: replayResult.mismatches,
          message: replayResult.message,
        });
      }
    }
  } catch (err) {
    result.runIssues.push({
      round: -1,
      agentId: "(run)",
      code: "verifier_error",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}

function stableJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

/**
 * Schema-5 Stage-1 authority gate. Legacy schema-4 lifecycle fields are
 * forbidden here: accepting both would make treatment identity ambiguous.
 */
function verifyPrimaryAssignmentV5(
  container: Record<string, unknown> | null,
  result: ReplayFileResult,
): void {
  if (result.schemaVersion !== "5.0") return;
  const addIssue = (code: string, message: string): void => {
    result.runIssues.push({ round: -1, agentId: "(run)", code, message });
  };
  const legacyFields = [
    "treatmentAssignment",
    "assignmentManifest",
    "applicationReceipts",
    "proximalOutcomes",
  ].filter(field => container !== null && Object.prototype.hasOwnProperty.call(container, field));
  if (legacyFields.length > 0) {
    addIssue(
      "schema5_legacy_treatment_authority_present",
      `schema 5.0 forbids legacy treatment authorities: ${legacyFields.join(", ")}`,
    );
  }

  const studyValue = container?.governanceStudy;
  const manifestValue = container?.primaryAssignmentManifest;
  const registryValue = container?.primaryArmExecutionRegistry;
  const bindingValue = container?.primaryArmExecution;
  if (manifestValue === undefined || manifestValue === null) {
    addIssue("missing_primary_assignment_manifest", "schema 5.0 requires primaryAssignmentManifest");
  }
  if (registryValue === undefined || registryValue === null) {
    addIssue("missing_primary_arm_execution_registry", "schema 5.0 requires primaryArmExecutionRegistry");
  }
  if (bindingValue === undefined || bindingValue === null) {
    addIssue("missing_primary_arm_execution_binding", "schema 5.0 requires primaryArmExecution");
  }
  if (studyValue === undefined || studyValue === null
    || manifestValue === undefined || manifestValue === null
    || registryValue === undefined || registryValue === null
    || bindingValue === undefined || bindingValue === null) return;

  try {
    const study = studyValue as GovernanceStudyContract;
    validateGovernanceStudyContract(study);
    if (!study.primaryAssignmentDesign) {
      throw new Error("schema 5.0 governanceStudy requires a frozen Stage-1 assignment design");
    }
    const manifest = manifestValue as PrimaryAssignmentManifestV1;
    const registry = registryValue as PrimaryArmExecutionRegistryV1;
    const binding = bindingValue as PrimaryArmExecutionBindingV1;
    validatePrimaryAssignmentManifestForStudy(manifest, study);
    validatePrimaryArmExecutionRegistryV1(registry, study.primaryAssignmentDesign);
    validatePrimaryArmExecutionBindingV1(binding, manifest, registry);
    if (manifest.runId !== container?.runId || binding.runId !== container?.runId) {
      addIssue(
        "primary_assignment_run_mismatch",
        "Stage-1 manifest/binding runId does not match RawRunData.runId",
      );
    }
    if (governanceRefKey(registry.studyRef) !== governanceRefKey(study)) {
      addIssue(
        "primary_assignment_study_mismatch",
        "primaryArmExecutionRegistry does not belong to RawRunData governanceStudy",
      );
    }
    const trailValue = container?.governanceAuditTrail;
    if (trailValue && typeof trailValue === "object") {
      const createdAt = (trailValue as { createdAt?: unknown }).createdAt;
      if (typeof createdAt === "string"
        && Date.parse(createdAt) < Date.parse(binding.resolvedAt)) {
        addIssue(
          "primary_assignment_after_audit_open",
          "primary arm execution must be resolved before the governance audit trail opens",
        );
      }
    }
    const taskOutcome = container?.taskOutcome;
    if (taskOutcome && typeof taskOutcome === "object"
      && (taskOutcome as { runAssignmentId?: unknown }).runAssignmentId !== manifest.assignment.id) {
      addIssue(
        "task_outcome_primary_assignment_mismatch",
        "taskOutcome.runAssignmentId does not match the Stage-1 primary assignment",
      );
    }
  } catch (error) {
    addIssue(
      "malformed_primary_assignment_chain",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function verifyGovernanceAuditTrailV5(
  container: Record<string, unknown> | null,
  result: ReplayFileResult,
  options: RawRunReplayOptions,
): void {
  if (result.schemaVersion !== "5.0") return;
  const addIssue = (code: string, message: string): void => {
    result.runIssues.push({ round: -1, agentId: "(run)", code, message });
  };
  const study = container?.governanceStudy;
  const trail = container?.governanceAuditTrail;
  if (study === undefined || study === null) {
    addIssue("missing_governance_study_contract", "schema 5.0 requires governanceStudy");
    return;
  }
  if (trail === undefined || trail === null) {
    addIssue("missing_governance_audit_trail", "schema 5.0 requires governanceAuditTrail");
    return;
  }
  try {
    validateGovernanceStudyContract(study as GovernanceStudyContract);
    const typedTrail = trail as GovernanceAuditTrail;
    const structural = validateGovernanceAuditTrail(typedTrail);
    result.governanceAuditStatus = structural.status;
    if (typedTrail.status !== "sealed") {
      addIssue("unsealed_governance_audit_trail", "successful schema 5.0 raw data requires a sealed audit trail");
    }
    if (typedTrail.runId !== container?.runId) {
      addIssue("governance_audit_run_mismatch", "governanceAuditTrail.runId does not match RawRunData.runId");
    }
    if (stableJson(typedTrail.studyContract) !== stableJson(study)) {
      addIssue("governance_audit_study_mismatch", "audit trail studyContract does not match RawRunData governanceStudy");
    }
    const contract = study as GovernanceStudyContract;
    if (contract.artifactSchemaRef.id !== "swarmalpha.raw-run"
      || contract.artifactSchemaRef.version !== "5.0.0") {
      addIssue("governance_audit_schema_ref_mismatch", "schema 5.0 study must declare swarmalpha.raw-run@5.0.0");
    }
    if (options.governanceRules) {
      const replay = replayGovernanceAuditTrailDecisions(typedTrail, options.governanceRules);
      result.governanceAuditStatus = replay.status;
    } else if (contract.inferenceIntent === "confirmatory") {
      result.governanceAuditStatus = "decision_replay_required";
      addIssue(
        "governance_decision_replay_required",
        "confirmatory schema 5.0 data requires version-matched executable eligibility rules",
      );
    }
  } catch (error) {
    addIssue(
      "malformed_governance_audit_trail",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * WP2: verify the treatment lifecycle (assignment → application receipts →
 * task outcome) recorded on a run. Fail-closed: schema 4.0 must carry a
 * pre-run assignment; receipts must reference a known assignment id, be
 * unique, and stay within the run's round window.
 */
/**
 * F4 schema-5 outcome carrier gate. This verifies lifecycle order and exact
 * score replay relative to the recorded authorized resolutions. It does not
 * prove that an in-artifact resolution matches an external oracle; the
 * detached commitment belongs to the F8 artifact boundary.
 */
function verifyFinalOutcomeV5(
  container: Record<string, unknown> | null,
  result: ReplayFileResult,
): void {
  if (result.schemaVersion !== "5.0") return;
  const addIssue = (code: string, message: string): void => {
    result.runIssues.push({ round: -1, agentId: "(run)", code, message });
  };
  const finalOutcome = container?.finalOutcome;
  let validFinalOutcome: FinalOutcomeArtifactV1 | undefined;
  if (finalOutcome === undefined || finalOutcome === null) {
    addIssue("missing_final_outcome", "schema 5.0 requires a completed finalOutcome artifact");
  } else {
    try {
      const artifact = finalOutcome as FinalOutcomeArtifactV1;
      validateFinalOutcomeArtifact(artifact);
      validFinalOutcome = artifact;
      if (artifact.runId !== container?.runId) {
        addIssue("final_outcome_run_mismatch", "finalOutcome.runId does not match RawRunData.runId");
      }
    } catch (error) {
      addIssue("malformed_final_outcome", error instanceof Error ? error.message : String(error));
    }
  }

  const taskOutcome = container?.taskOutcome;
  if (taskOutcome === undefined || taskOutcome === null) {
    addIssue("missing_task_outcome", "schema 5.0 requires a final taskOutcome");
  } else {
    try {
      validateTaskOutcome(taskOutcome);
      if (validFinalOutcome) {
        const typedOutcome = taskOutcome as TaskOutcomeRecord;
        const sourceRef = typedOutcome.sourceFinalOutcomeRef;
        if (!sourceRef
          || sourceRef.id !== validFinalOutcome.artifactSchemaRef.id
          || sourceRef.version !== validFinalOutcome.artifactSchemaRef.version
          || sourceRef.runId !== validFinalOutcome.runId) {
          addIssue("task_outcome_final_source_mismatch", "schema 5.0 taskOutcome must reference its finalOutcome artifact");
        }
        const evaluationRef = typedOutcome.evaluationContractRef;
        if (evaluationRef.id !== FINAL_OUTCOME_TASK_EVALUATION_V1.id
          || evaluationRef.version !== FINAL_OUTCOME_TASK_EVALUATION_V1.version) {
          addIssue("task_outcome_final_evaluation_mismatch", "schema 5.0 taskOutcome must use the final-outcome pooled-decision accuracy contract");
        }
        const matches = validFinalOutcome.claimOutcomes
          .map(outcome => outcome.pooledDecisionMatchesResolution);
        const fullyObserved = matches.length > 0 && matches.every(value => value !== null);
        const expectedQuality = fullyObserved
          ? matches.reduce<number>((sum, value) => sum + (value === true ? 1 : 0), 0) / matches.length
          : null;
        const expectedStatus = fullyObserved ? "scored" : "unresolved";
        if (typedOutcome.status !== expectedStatus || typedOutcome.quality !== expectedQuality) {
          addIssue("task_outcome_final_projection_mismatch", "taskOutcome status/quality does not replay from finalOutcome pooled decisions");
        }
      }
    } catch (error) {
      addIssue("malformed_task_outcome", error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * Schema-5 primary-outcome authority gate. Stage-1 primaryEstimandRef names
 * operational pooled Brier; taskOutcome remains a secondary accuracy
 * projection and is verified separately by verifyFinalOutcomeV5.
 */
function verifyOperationalOutcomeV5(
  container: Record<string, unknown> | null,
  result: ReplayFileResult,
): void {
  if (result.schemaVersion !== "5.0") return;
  const addIssue = (code: string, message: string): void => {
    result.runIssues.push({ round: -1, agentId: "(run)", code, message });
  };
  const analysisUnitValue = container?.operationalAnalysisUnit;
  const operationalOutcomeValue = container?.operationalOutcome;
  if (analysisUnitValue === undefined || analysisUnitValue === null) {
    addIssue(
      "missing_operational_analysis_unit",
      "schema 5.0 requires a pre-assignment operationalAnalysisUnit",
    );
  }
  if (operationalOutcomeValue === undefined || operationalOutcomeValue === null) {
    addIssue(
      "missing_operational_outcome",
      "schema 5.0 requires an operationalOutcome primary ITT artifact",
    );
  }
  if (analysisUnitValue === undefined || analysisUnitValue === null
    || operationalOutcomeValue === undefined || operationalOutcomeValue === null) return;

  let analysisUnit: OperationalAnalysisUnitV1;
  try {
    analysisUnit = analysisUnitValue as OperationalAnalysisUnitV1;
    validateOperationalAnalysisUnitV1(analysisUnit);
  } catch (error) {
    addIssue(
      "malformed_operational_analysis_unit",
      error instanceof Error ? error.message : String(error),
    );
    return;
  }
  if (analysisUnit.runId !== container?.runId) {
    addIssue(
      "operational_analysis_unit_run_mismatch",
      "operationalAnalysisUnit.runId does not match RawRunData.runId",
    );
  }

  const studyValue = container?.governanceStudy;
  const manifestValue = container?.primaryAssignmentManifest;
  const finalOutcomeValue = container?.finalOutcome;
  if (studyValue === undefined || studyValue === null
    || manifestValue === undefined || manifestValue === null
    || finalOutcomeValue === undefined || finalOutcomeValue === null) {
    return;
  }
  const study = studyValue as GovernanceStudyContract;
  const manifest = manifestValue as PrimaryAssignmentManifestV1;
  const finalOutcome = finalOutcomeValue as FinalOutcomeArtifactV1;
  const operationalOutcome = operationalOutcomeValue as OperationalOutcomeArtifactV1;
  if (operationalOutcome.runId !== container?.runId) {
    addIssue(
      "operational_outcome_run_mismatch",
      "operationalOutcome.runId does not match RawRunData.runId",
    );
  }
  const sourceMismatches: string[] = [];
  if (operationalOutcome.analysisUnitHash !== analysisUnit.contentHash) {
    sourceMismatches.push("analysisUnitHash");
  }
  if (operationalOutcome.primaryAssignmentManifestHash !== manifest.contentHash) {
    sourceMismatches.push("primaryAssignmentManifestHash");
  }
  try {
    if (operationalOutcome.sourceFinalOutcomeHash !== computeFinalOutcomeArtifactHashV1(finalOutcome)) {
      sourceMismatches.push("sourceFinalOutcomeHash");
    }
  } catch {
    // verifyFinalOutcomeV5 owns the malformed_final_outcome issue.
  }
  if (sourceMismatches.length > 0) {
    addIssue(
      "operational_outcome_source_mismatch",
      `operationalOutcome source bindings do not match carried artifacts: ${sourceMismatches.join(", ")}`,
    );
  }

  const primaryEstimandRef = manifest.designSnapshot?.primaryEstimandRef;
  const metricRef = operationalOutcome.primaryMetric?.metricRef;
  let primaryEstimandMatches = false;
  try {
    primaryEstimandMatches = Boolean(primaryEstimandRef && metricRef)
      && governanceRefKey(primaryEstimandRef!) === governanceRefKey(OPERATIONAL_POOLED_BRIER_ESTIMAND_V1)
      && governanceRefKey(metricRef!) === governanceRefKey(primaryEstimandRef!);
  } catch {
    primaryEstimandMatches = false;
  }
  if (!primaryEstimandMatches) {
    addIssue(
      "operational_primary_estimand_mismatch",
      "schema 5.0 primaryEstimandRef and operationalOutcome.primaryMetric must identify operational pooled Brier",
    );
  }

  try {
    validateOperationalOutcomeArtifactV1(operationalOutcome, {
      study,
      primaryAssignmentManifest: manifest,
      analysisUnit,
      finalOutcome,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addIssue(
      message.includes("does not replay")
        ? "operational_outcome_replay_mismatch"
        : "malformed_operational_outcome",
      message,
    );
  }
}

/** Schema-4 assignment/application/proximal/task lifecycle integrity gate. */
function verifyGovernanceLifecycle(
  container: Record<string, unknown> | null,
  result: ReplayFileResult,
): void {
  const schema = result.schemaVersion;
  if (schema !== "4.0") return;
  const assignment = container?.treatmentAssignment;
  const assignmentManifest = container?.assignmentManifest;
  const receipts = container?.applicationReceipts;
  const proximalOutcomes = container?.proximalOutcomes;
  const outcome = container?.taskOutcome;
  const rawInterventions = container?.interventions;
  const governanceIssues = container?.governanceIssues;
  const totalRounds = container?.totalRounds;
  const totalRoundsValid = typeof totalRounds === "number" && Number.isSafeInteger(totalRounds);
  const addIssue = (code: string, message: string): void => {
    result.runIssues.push({ round: -1, agentId: "(run)", code, message });
  };

  if (assignment === undefined || assignment === null) {
    addIssue("missing_treatment_assignment", "schema 4.0 requires a pre-run treatmentAssignment");
  } else {
    try {
      validateTreatmentAssignment(assignment);
    } catch (error) {
      addIssue("malformed_treatment_assignment", error instanceof Error ? error.message : String(error));
    }
  }

  if (assignmentManifest === null || typeof assignmentManifest !== "object") {
    addIssue("missing_assignment_manifest_ref", "schema 4.0 requires a pre-run assignment manifest reference");
  } else {
    const ref = assignmentManifest as Record<string, unknown>;
    if (typeof ref.path !== "string" || ref.path.length === 0
      || /[\\/]/.test(ref.path)
      || typeof ref.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(ref.sha256)
      || typeof ref.reused !== "boolean"
      || typeof ref.assignmentId !== "string" || ref.assignmentId.length === 0) {
      addIssue("malformed_assignment_manifest_ref", "assignment manifest path/hash is malformed");
    }
    if (assignment && ref.assignmentId !== (assignment as Record<string, unknown>).id) {
      addIssue("manifest_assignment_mismatch", "assignmentManifest.assignmentId does not match treatmentAssignment.id");
    }
  }

  const collectStableIds = (records: unknown, kind: "intervention" | "governance_issue"): Set<string> => {
    const ids = new Set<string>();
    if (!Array.isArray(records)) {
      addIssue(`missing_${kind}s`, `schema 4.0 requires a ${kind} array`);
      return ids;
    }
    for (const entry of records) {
      if (entry === null || typeof entry !== "object"
        || typeof (entry as Record<string, unknown>).id !== "string"
        || ((entry as Record<string, unknown>).id as string).length === 0) {
        addIssue(`malformed_${kind}_id`, `${kind} records must have stable non-empty ids`);
        continue;
      }
      const id = (entry as Record<string, unknown>).id as string;
      if (ids.has(id)) addIssue(`duplicate_${kind}_id`, `duplicate ${kind} id ${id}`);
      ids.add(id);
    }
    return ids;
  };
  const interventionIds = collectStableIds(rawInterventions, "intervention");
  const governanceIssueIds = collectStableIds(governanceIssues, "governance_issue");
  const validReceipts: Array<Record<string, unknown>> = [];
  if (!Array.isArray(receipts) || receipts.length === 0) {
    addIssue("missing_application_receipts", "schema 4.0 requires at least one explicit action/no-action receipt");
  } else {
    const seenIds = new Set<string>();
    for (const receipt of receipts) {
      if (!receipt || typeof receipt !== "object") {
        addIssue("malformed_receipt", "applicationReceipts entry is not an object");
        continue;
      }
      const r = receipt as Record<string, unknown>;
      try {
        validateApplicationReceipt(receipt);
      } catch (error) {
        addIssue("malformed_receipt", error instanceof Error ? error.message : String(error));
        continue;
      }
      validReceipts.push(r);
      if (typeof r.id !== "string" || r.id.length === 0) {
        addIssue("malformed_receipt", "receipt id must be a non-empty string");
        continue;
      }
      if (seenIds.has(r.id)) {
        addIssue("duplicate_receipt_id", `duplicate receipt id ${r.id}`);
      }
      seenIds.add(r.id);
      if (typeof r.assignmentId !== "string" || r.assignmentId.length === 0) {
        addIssue("malformed_receipt", "receipt assignmentId must be a non-empty string");
        continue;
      }
      if (assignment && r.assignmentId !== (assignment as Record<string, unknown>).id) {
        addIssue("dangling_assignment_id", `receipt ${r.id} references unknown assignment ${r.assignmentId}`);
      }
      if (typeof r.interventionId === "string" && !interventionIds.has(r.interventionId)) {
        addIssue("dangling_intervention_id", `receipt ${r.id} references unknown intervention ${r.interventionId}`);
      }
      for (const sourceEventId of r.sourceEventIds as string[]) {
        if (!governanceIssueIds.has(sourceEventId)) {
          addIssue("dangling_source_event_id", `receipt ${r.id} references unknown governance event ${sourceEventId}`);
        }
      }
      const window = r.effectiveWindow as Record<string, unknown> | null | undefined;
      if (window && totalRoundsValid
        && ((window.startRound as number) > (totalRounds as number)
          || (window.endRound as number) > (totalRounds as number))) {
        addIssue("window_out_of_range", `receipt ${r.id} effectiveWindow exceeds totalRounds ${String(totalRounds)}`);
      }
      if (typeof r.appliedAtRound === "number" && totalRoundsValid
        && (r.appliedAtRound as number) > (totalRounds as number)) {
        addIssue("application_round_out_of_range", `receipt ${r.id} appliedAtRound exceeds totalRounds`);
      }
    }
  }

  const receiptIds = new Set(validReceipts.map(receipt => receipt.id as string));
  const proximalByReceipt = new Map<string, number>();
  if (!Array.isArray(proximalOutcomes)) {
    addIssue("missing_proximal_outcomes", "schema 4.0 requires a proximalOutcomes array");
  } else {
    const seenOutcomeIds = new Set<string>();
    for (const proximal of proximalOutcomes) {
      try {
        validateProximalOutcome(proximal);
      } catch (error) {
        addIssue("malformed_proximal_outcome", error instanceof Error ? error.message : String(error));
        continue;
      }
      const p = proximal as unknown as Record<string, unknown>;
      if (seenOutcomeIds.has(p.id as string)) addIssue("duplicate_proximal_outcome_id", `duplicate proximal outcome ${p.id}`);
      seenOutcomeIds.add(p.id as string);
      if (!receiptIds.has(p.applicationReceiptId as string)) {
        addIssue("dangling_receipt_id", `proximal outcome ${p.id} references unknown receipt ${p.applicationReceiptId}`);
      }
      const linkedReceipt = validReceipts.find(receipt => receipt.id === p.applicationReceiptId);
      const plannedWindow = linkedReceipt?.plannedWindow as Record<string, unknown> | undefined;
      const proximalWindow = p.window as Record<string, unknown>;
      if (plannedWindow
        && (proximalWindow.startRound !== plannedWindow.startRound
          || proximalWindow.endRound !== plannedWindow.endRound)) {
        addIssue("proximal_window_mismatch", `proximal outcome ${p.id} does not match its receipt plannedWindow`);
      }
      proximalByReceipt.set(
        p.applicationReceiptId as string,
        (proximalByReceipt.get(p.applicationReceiptId as string) ?? 0) + 1,
      );
    }
  }
  for (const receipt of validReceipts) {
    if (receipt.status === "applied" && (proximalByReceipt.get(receipt.id as string) ?? 0) !== 1) {
      addIssue("missing_proximal_outcome_for_applied_receipt", `applied receipt ${receipt.id} must have exactly one proximal outcome`);
    }
    if (receipt.status === "held_out" && (proximalByReceipt.get(receipt.id as string) ?? 0) !== 1) {
      addIssue("missing_proximal_outcome_for_holdout_receipt", `held-out receipt ${receipt.id} must have exactly one proximal outcome`);
    }
  }

  if (outcome === undefined || outcome === null) {
    addIssue("missing_task_outcome", "schema 4.0 requires a final taskOutcome");
  } else {
    try {
      validateTaskOutcome(outcome);
    } catch (error) {
      addIssue("malformed_task_outcome", error instanceof Error ? error.message : String(error));
    }
  }
  if (outcome && assignment) {
    const o = outcome as Record<string, unknown>;
    const a = assignment as Record<string, unknown>;
    if (o.runAssignmentId !== a.id) {
      addIssue("task_outcome_assignment_mismatch", "taskOutcome.runAssignmentId does not match treatmentAssignment.id");
    }
  }
}

/**
 * CC-2: validate an explicitly recorded governance study declaration. A
 * malformed declaration emits the stable `malformed_governance_study_contract`
 * run-issue code. A missing declaration on schema 1.0-4.0 is readable legacy
 * data, not a structural error, and is never inferred as confirmatory.
 */
function verifyStudyContractDeclaration(
  container: Record<string, unknown> | null,
  result: ReplayFileResult,
): void {
  const study = container?.governanceStudy;
  if (study === undefined) return;
  try {
    validateGovernanceStudyContract(study as GovernanceStudyContract);
  } catch (error) {
    result.runIssues.push({
      round: -1,
      agentId: "(run)",
      code: "malformed_governance_study_contract",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 由 run-level verifier 结果派生单文件总体重放状态。
 * CLI 与 audit manifest 共用，保证两端分类完全一致。
 */
export function deriveReplayStatus(
  run: ReplayFileResult,
): "verified" | "mixed" | "legacy_unverifiable" | "absent" {
  if (run.recordCount === 0) return "absent";
  const c = run.counts;
  if (c.mismatch > 0 || c.unsupported_estimator > 0 || c.invalid_record > 0
    || run.runIssues.length > 0) {
    return "mixed";
  }
  if (c.legacy_unverifiable > 0) return "legacy_unverifiable";
  return "verified";
}

/** 聚合多文件验证结果。 */
export function aggregateReplayResults(results: ReplayFileResult[]): ReplaySummary {
  const totals: Record<ReplayStatus, number> = { ...EMPTY_COUNTS };
  let totalRecords = 0;
  let totalRunIssues = 0;
  for (const result of results) {
    for (const status of Object.keys(totals) as ReplayStatus[]) {
      totals[status] += result.counts[status];
    }
    totalRecords += result.recordCount;
    totalRunIssues += result.runIssues.length;
  }
  return {
    files: results,
    totals,
    totalFiles: results.length,
    totalRecords,
    totalRunIssues,
  };
}
