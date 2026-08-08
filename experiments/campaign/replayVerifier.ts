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
import {
  defaultProgressiveEstimatorRegistry,
  PROGRESSIVE_ESTIMATOR_ID,
} from "../../src/lib/thermodynamics/ProgressiveEstimator";

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
export function verifyRawRunData(file: string, data: unknown): ReplayFileResult {
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

      // ── 稳定 id/version：同一 run 内只允许一个估算器版本（仅 schema-2 强制）──
      if (result.schemaVersion === "2.0"
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
