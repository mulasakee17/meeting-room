/**
 * Governance estimate replay verification — pure library.
 *
 * Replays a persisted `GovernanceEstimate` record through the exact registered
 * estimator version and compares every persisted artifact (input/config/output
 * fingerprints, canonicalized output, determinism metadata) against what the
 * projection recomputes. The record's stored `input` snapshot is the source of
 * truth; it is never reconstructed from trajectory data.
 *
 * This module deliberately does not read files and never calls `process.exit`,
 * so it can be reused by the CLI (`experiments/campaign/verify_replay.ts`),
 * the audit manifest generator, and tests without spawning subprocesses.
 */

import {
  GovernanceEstimatorRegistry,
  canonicalizeEstimatorValue,
  fingerprintEstimatorValue,
} from "./estimators";
import type { GovernanceEstimate } from "./semantics";

export type ReplayStatus =
  | "verified"
  | "mismatch"
  | "legacy_unverifiable"
  | "unsupported_estimator"
  | "invalid_record";

export type ReplayMismatchKind =
  | "input_fingerprint"
  | "config_fingerprint"
  | "output_fingerprint"
  | "output_value"
  | "source_event_ids"
  | "determinism";

export interface GovernanceReplayResult {
  status: ReplayStatus;
  estimatorId?: string;
  estimatorVersion?: string;
  name?: string;
  mismatches: ReplayMismatchKind[];
  message?: string;
}

interface ValidRecord {
  record: Record<string, unknown>;
  estimatorId: string;
  estimatorVersion: string;
  name: string;
}

function failInvalid(reason: string): GovernanceReplayResult {
  return { status: "invalid_record", mismatches: [], message: reason };
}

/**
 * Validate the minimum record shape without invoking getters or accepting
 * non-JSON state. A record parsed from JSON is always a plain object, so this
 * guards against callers passing live objects with accessor-backed fields or
 * class instances.
 */
function validateMinimumShape(record: unknown): ValidRecord | null {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }
  const prototype = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype && prototype !== null) {
    return null;
  }
  const r = record as Record<string, unknown>;
  // The record must declare the governance estimate layer. Anything else is
  // not a record this verifier understands.
  if (r.layer !== "governance_estimate") return null;
  const fields: Array<[keyof ValidRecord, string]> = [
    ["estimatorId", "estimatorId"],
    ["estimatorVersion", "estimatorVersion"],
    ["name", "name"],
  ];
  for (const [, key] of fields) {
    const value = r[key];
    if (typeof value !== "string" || value.length === 0) return null;
  }
  if (!Array.isArray(r.sourceEventIds)
    || r.sourceEventIds.some(id => typeof id !== "string" || id.length === 0)) {
    return null;
  }
  if (typeof r.inputFingerprint !== "string" || r.inputFingerprint.length === 0) return null;
  if (typeof r.configFingerprint !== "string" || r.configFingerprint.length === 0) return null;
  if (typeof r.outputFingerprint !== "string" || r.outputFingerprint.length === 0) return null;
  if (r.config === undefined || r.config === null || typeof r.config !== "object") return null;
  if (r.value === undefined || r.value === null) return null;
  if (r.determinism === undefined || r.determinism === null || typeof r.determinism !== "object") {
    return null;
  }
  const determinismKind = (r.determinism as { kind?: unknown }).kind;
  if (determinismKind !== "deterministic" && determinismKind !== "seeded") return null;
  return {
    record: r,
    estimatorId: r.estimatorId as string,
    estimatorVersion: r.estimatorVersion as string,
    name: r.name as string,
  };
}

/**
 * Replay a single persisted governance estimate record.
 *
 * The verification algorithm:
 *   1. validate the minimum record shape (including `layer` and source ids);
 *   2. if `input` is absent, return `legacy_unverifiable`;
 *   3. resolve the exact `estimatorId + estimatorVersion`; never choose latest
 *      and never downgrade;
 *   4. recompute through `registry.project()` using stored name, input, config
 *      and source ids;
 *   5. compare recomputed input/config/output fingerprints with stored ones;
 *   6. compare the canonicalized recomputed output with the stored value;
 *   7. compare stored `sourceEventIds` with the projection's canonical form —
 *      this only checks canonical shape, not whether the events actually exist
 *      or belong to this agent/round (see note below);
 *   8. compare determinism metadata exactly;
 *   9. for deterministic/seeded contracts, run the projection twice and require
 *      identical output fingerprints (a runtime invariant check, not a proof of
 *      determinism);
 *  10. return all observed mismatches, not only the first one; malformed
 *      records map to `invalid_record` instead of throwing.
 *
 * Untrusted JSON never throws: every failure is a status value. The public
 * function also swallows accessor/Proxy-induced reads so a hostile record
 * cannot make it throw.
 */
export function verifyGovernanceEstimateRecord(
  record: unknown,
  registry: GovernanceEstimatorRegistry,
): GovernanceReplayResult {
  try {
    return verifyGovernanceEstimateRecordInternal(record, registry);
  } catch (err) {
    return {
      status: "invalid_record",
      mismatches: [],
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function verifyGovernanceEstimateRecordInternal(
  record: unknown,
  registry: GovernanceEstimatorRegistry,
): GovernanceReplayResult {
  const valid = validateMinimumShape(record);
  if (!valid) return failInvalid("record does not satisfy the minimum governance estimate shape");
  const { record: r, estimatorId, estimatorVersion, name } = valid;

  // Legacy records have no exact input snapshot and are unverifiable by design.
  if (r.input === undefined || r.input === null) {
    return {
      status: "legacy_unverifiable",
      estimatorId,
      estimatorVersion,
      name,
      mismatches: [],
    };
  }

  // Resolve the exact version. Never fall back to latest and never downgrade.
  try {
    registry.get(estimatorId, estimatorVersion);
  } catch {
    return {
      status: "unsupported_estimator",
      estimatorId,
      estimatorVersion,
      name,
      mismatches: [],
      message: `estimator ${estimatorId}@${estimatorVersion} is not registered`,
    };
  }

  const projectStored = () => registry.project(
    estimatorId,
    estimatorVersion,
    {
      name,
      input: r.input,
      config: r.config as object,
      sourceEventIds: r.sourceEventIds as string[],
    },
  );

  let first: GovernanceEstimate<unknown, unknown, object>;
  let second: GovernanceEstimate<unknown, unknown, object>;
  try {
    first = projectStored();
    second = projectStored();
  } catch (err) {
    return {
      status: "invalid_record",
      estimatorId,
      estimatorVersion,
      name,
      mismatches: [],
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const mismatches: ReplayMismatchKind[] = [];
  const stored = valid.record as Record<string, unknown>;

  if (first.inputFingerprint !== stored.inputFingerprint) mismatches.push("input_fingerprint");
  if (first.configFingerprint !== stored.configFingerprint) mismatches.push("config_fingerprint");

  const recomputedOutputFingerprint = fingerprintEstimatorValue(first.value);
  if (recomputedOutputFingerprint !== stored.outputFingerprint) mismatches.push("output_fingerprint");

  try {
    if (canonicalizeEstimatorValue(first.value) !== canonicalizeEstimatorValue(stored.value)) {
      mismatches.push("output_value");
    }
  } catch (err) {
    return {
      status: "invalid_record",
      estimatorId,
      estimatorVersion,
      name,
      mismatches: [...mismatches],
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // Capability boundary: this only proves the stored source ids are in the
  // exact canonical form the projection preserves (sorted, unique, non-empty
  // strings). It cannot prove the events actually happened or belong to this
  // agent/round — a replacement set of plausible-looking ids still passes.
  // True provenance authenticity requires cross-referencing an immutable
  // event ledger, which is out of scope for record-level replay.
  if (canonicalizeEstimatorValue(first.sourceEventIds)
    !== canonicalizeEstimatorValue(stored.sourceEventIds)) {
    mismatches.push("source_event_ids");
  }

  try {
    if (canonicalizeEstimatorValue(first.determinism) !== canonicalizeEstimatorValue(stored.determinism)) {
      mismatches.push("determinism");
    }
  } catch {
    mismatches.push("determinism");
  }

  // Runtime determinism invariant: two projections with identical inputs must
  // produce identical outputs. Not a proof of determinism.
  if (fingerprintEstimatorValue(second.value) !== recomputedOutputFingerprint) {
    mismatches.push("determinism");
  }

  if (mismatches.length > 0) {
    return {
      status: "mismatch",
      estimatorId,
      estimatorVersion,
      name,
      mismatches,
    };
  }

  return { status: "verified", estimatorId, estimatorVersion, name, mismatches: [] };
}
