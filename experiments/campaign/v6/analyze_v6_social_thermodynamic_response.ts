/**
 * V6 Social-Thermodynamic Response Audit — zero provider, read-only.
 *
 * Tests whether a pre-action collective state (alignment R, represented-evidence
 * identity entropy H_E, and crystallization index kappa = R*(1-H_E)) predicts a
 * heterogeneous apply-minus-holdout final-pooled-Brier response across the
 * development (exploratory + retry-1 continuation) and frozen task-heldout
 * batches. Authority: docs/theory/SOCIAL_THERMODYNAMIC_RESPONSE_RESEARCH_CONTRACT_V1.md
 * and docs/plans/CLAUDE_CODE_SOCIAL_THERMODYNAMIC_RESPONSE_AUDIT_HANDOFF_2026-08-14.md.
 *
 * Boundaries enforced here:
 *  - the pre-action state projection receives ONLY pre-assignment events;
 *  - the development kappa median is computed without reading arm or outcome;
 *  - canonical evidence identity uses provenance.contentHash because V1 has no
 *    authority boundary for model-emitted item lineage;
 *  - missing evidence identity / missing agent report / option drift /
 *    dangling evidence all fail closed (state missing), never raw-count fallback;
 *  - response-effect support and macrostate qualification are reported
 *    separately; no threshold/subgroup/composite search.
 *
 * No runtime, schema, prompt, task, plan, manifest, or artifact is modified.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { verifyRawRunData } from "../replayVerifier";
import { resolveV6AuditableRawRunPath } from "./productionVerticalSlice";
import { createV6HiddenBenchSmokeFixtureV1 } from "./v6HiddenBenchSmokeFixture";
import { VERDICT_EXPLORATORY_PROFILE } from "./run_v6_verdict_exploratory";
import { buildRetry1Plan } from "./run_v6_verdict_randomized_continuation_retry1";
import { RETRY1_OUTPUT_DIR } from "./run_v6_verdict_randomized_continuation_retry1";
import {
  VERDICT_EXPLORATORY_OUTPUT_DIR,
  buildVerdictExploratoryPlan,
  type VerdictExploratoryPlan,
} from "./run_v6_verdict_exploratory";
import {
  VERDICT_TASK_HELDOUT_OUTPUT_DIR,
  buildVerdictTaskHeldoutReplicationPlan,
} from "./run_v6_verdict_task_heldout_replication";
import {
  evaluateTaskHeldoutDeferV1,
  taskClusterDifferenceBootstrap,
} from "./analyze_v6_verdict_task_heldout_replication";

// ---------------------------------------------------------------------------
// Frozen constants
// ---------------------------------------------------------------------------

/** Retry-1 continuation roots, same as analyze_v6_verdict_combined_exploratory.ts. */
const RETRY1_ROOTS = Object.freeze([
  RETRY1_OUTPUT_DIR,
  path.resolve(process.cwd(), "experiments/campaign/pilot_output/v6-verdict-randomized-continuation-retry1-tail-20260813"),
  path.resolve(process.cwd(), "experiments/campaign/pilot_output/v6-verdict-randomized-continuation-retry1-background-20260813"),
]);

const PROBABILITY_EPSILON = 1e-6;

// ---------------------------------------------------------------------------
// Pure formulas (testable, no I/O)
// ---------------------------------------------------------------------------

/**
 * Base-2 Jensen-Shannon divergence over two aligned probability arrays,
 * bounded in [0,1]. Option order does not affect the value.
 */
export function jsdBase2(p: number[], q: number[]): number {
  if (p.length !== q.length) throw new Error("jsd length mismatch");
  const kld = (a: number[], m: number[]): number => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] > 0) sum += a[i] * Math.log2(a[i] / m[i]);
    }
    return sum;
  };
  const m = p.map((value, i) => (value + q[i]) / 2);
  return 0.5 * (kld(p, m) + kld(q, m));
}

/**
 * Alignment order parameter R = 1 - mean pairwise base-2 JSD.
 * Requires N >= 2 distributions of equal length summing to ~1.
 */
export function computeAlignmentR(distributions: number[][]): number | null {
  if (distributions.length < 2) return null; // one-agent state is unsupported
  let total = 0;
  let count = 0;
  for (let i = 0; i < distributions.length; i++) {
    for (let j = i + 1; j < distributions.length; j++) {
      total += jsdBase2(distributions[i], distributions[j]);
      count += 1;
    }
  }
  return 1 - total / count;
}

/**
 * Represented-evidence identity entropy H_E, normalized by log2(m).
 * `refCounts` is the number of report-to-evidence references per canonical
 * identity. Returns null for zero identities, 0 for exactly one.
 */
export function computeEvidenceDiversityHE(refCounts: number[]): number | null {
  if (refCounts.length === 0) return null;
  if (refCounts.length === 1) return 0;
  const total = refCounts.reduce((sum, n) => sum + n, 0);
  if (total <= 0) return null;
  let entropy = 0;
  for (const count of refCounts) {
    const q = count / total;
    if (q > 0) entropy -= q * Math.log2(q);
  }
  return entropy / Math.log2(refCounts.length);
}

/** Crystallization index kappa = R*(1-H_E), only when both inputs are finite. */
export function computeCrystallizationKappa(R: number, H_E: number | null): number | null {
  if (!Number.isFinite(R)) return null;
  if (H_E === null || !Number.isFinite(H_E)) return null;
  return R * (1 - H_E);
}

/** Median of finite values; null when none finite. */
export function computeKappaCutV1(values: number[]): number | null {
  const finite = values.filter(value => Number.isFinite(value));
  if (finite.length === 0) return null;
  const sorted = [...finite].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

// ---------------------------------------------------------------------------
// State-axis redundancy (INTERVENTION_STATE_RESPONSE_MATRIX §1.1 axes)
// ---------------------------------------------------------------------------

/** Max pairwise total variation over aligned distributions; 0 when <2 vectors. */
export function computeMaxPairwiseTVV1(distributions: number[][]): number {
  if (distributions.length < 2) return 0;
  let best = 0;
  for (let i = 0; i < distributions.length; i += 1) {
    for (let j = i + 1; j < distributions.length; j += 1) {
      let tv = 0;
      for (let k = 0; k < distributions[i].length; k += 1) {
        tv += Math.abs(distributions[i][k] - distributions[j][k]);
      }
      best = Math.max(best, 0.5 * tv);
    }
  }
  return best;
}

/** Mean reported concentration (mean over reports of max option probability). */
export function computeMeanConcentrationV1(distributions: number[][]): number {
  if (distributions.length === 0) return 0;
  return distributions.reduce((sum, dist) => sum + Math.max(...dist), 0) / distributions.length;
}

export interface StateAxesV1 {
  disagreement: number;
  R: number;
  concentration: number;
  exactReuseFraction: number | null;
  coverage: number | null;
}

/** Five matrix state axes for one valid pre-action state. */
export function computeStateAxesV1(input: {
  distributions: number[][];
  state: Extract<StateProjectionV1, { status: "ok" }>;
  census: EvidenceObservabilityCensusV1;
}): StateAxesV1 {
  return {
    disagreement: computeMaxPairwiseTVV1(input.distributions),
    R: input.state.R,
    concentration: computeMeanConcentrationV1(input.distributions),
    exactReuseFraction: input.census.exactReuseFraction,
    coverage: input.census.commitmentCoverage.status === "ok"
      ? input.census.commitmentCoverage.verbatimPrivateCommitmentCoverage
      : null,
  };
}

export function pearsonCorrV1(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 2 || b.length !== n) return null;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da === 0 || db === 0 ? null : num / Math.sqrt(da * db);
}

export interface StateAxisCorrelationV1 {
  n: number;
  pairs: Array<{ a: string; b: string; pearson: number | null }>;
  collapseFlags: string[];
}

/** Pairwise Pearson over the five matrix axes; flags |r| >= 0.9 as potential collapse. */
export function correlateStateAxesV1(axes: StateAxesV1[]): StateAxisCorrelationV1 {
  const names = ["disagreement", "R", "concentration", "exactReuseFraction", "coverage"] as const;
  const pairs: Array<{ a: string; b: string; pearson: number | null }> = [];
  const collapseFlags: string[] = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const aName = names[i];
      const bName = names[j];
      const aVals: number[] = [];
      const bVals: number[] = [];
      for (const axis of axes) {
        const a = axis[aName];
        const b = axis[bName];
        if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
        aVals.push(a);
        bVals.push(b);
      }
      const pearson = pearsonCorrV1(aVals, bVals);
      pairs.push({ a: aName, b: bName, pearson });
      if (pearson !== null && Math.abs(pearson) >= 0.9) collapseFlags.push(`${aName}~${bName}`);
    }
  }
  return { n: axes.length, pairs, collapseFlags };
}

// ---------------------------------------------------------------------------
// Canonical evidence identity
// ---------------------------------------------------------------------------

/**
 * Canonical evidence identity for this audit is the exact registered content
 * hash. The production prompt permits the model to emit an arbitrary lineageId,
 * but V1 has no authority boundary that proves such a string is an item-specific
 * lineage rather than a visibility/source label. Do not infer that authority.
 */
export function canonicalEvidenceIdentityV1(evidence: { contentHash: string; lineageId?: string }): string {
  return evidence.contentHash;
}

// ---------------------------------------------------------------------------
// Pre-action state projection (pure, outcome-free)
// ---------------------------------------------------------------------------

export interface PreActionReportV1 {
  agentId: string;
  /** Option label -> probability; keys must equal the claim option set. */
  probabilities: Record<string, number>;
  evidenceRefs: string[];
}

export interface PreActionEvidenceV1 {
  evidenceId: string;
  contentHash: string;
  lineageId?: string;
}

export interface PreActionProjectionV1 {
  claimOptions: string[];
  expectedAgentIds: string[];
  reports: PreActionReportV1[];
  evidence: PreActionEvidenceV1[];
}

export type StateProjectionV1 =
  | {
      status: "ok";
      R: number;
      H_E: number | null;
      kappa: number | null;
      identityCount: number;
      identityRefs: Array<{ identity: string; count: number }>;
    }
  | { status: "missing"; reason: string };

function validateDistribution(probabilities: Record<string, number>, options: readonly string[]): boolean {
  const optionKeys = new Set(options);
  const probKeys = Object.keys(probabilities);
  if (probKeys.length !== options.length) return false;
  for (const key of probKeys) {
    if (!optionKeys.has(key)) return false;
    const value = probabilities[key];
    if (!Number.isFinite(value) || value < 0) return false;
  }
  const sum = probKeys.reduce((s, key) => s + probabilities[key], 0);
  return Math.abs(sum - 1) <= PROBABILITY_EPSILON * options.length;
}

/**
 * Compute R, H_E, kappa from a strictly pre-action projection. Fails closed on:
 *  - missing/extra/duplicate agent report;
 *  - invalid probability distribution or option identity drift;
 *  - dangling or multiply bound evidence reference;
 *  - zero evidence (H_E = null, never raw count).
 */
export function computeStateProjectionV1(input: PreActionProjectionV1): StateProjectionV1 {
  const expected = new Set(input.expectedAgentIds);
  if (expected.size !== input.expectedAgentIds.length) {
    return { status: "missing", reason: "duplicate_expected_agent" };
  }
  const reportAgents = input.reports.map(report => report.agentId);
  if (new Set(reportAgents).size !== reportAgents.length) {
    return { status: "missing", reason: "duplicate_agent_report" };
  }
  if (reportAgents.length !== expected.size) {
    return { status: "missing", reason: "agent_report_count_mismatch" };
  }
  for (const agentId of input.expectedAgentIds) {
    if (!new Set(reportAgents).has(agentId)) {
      return { status: "missing", reason: `missing_agent_report:${agentId}` };
    }
  }
  for (const report of input.reports) {
    if (!expected.has(report.agentId)) {
      return { status: "missing", reason: `extra_agent_report:${report.agentId}` };
    }
    if (!validateDistribution(report.probabilities, input.claimOptions)) {
      return { status: "missing", reason: `invalid_distribution:${report.agentId}` };
    }
  }

  // Bind every evidence reference to exactly one registered evidence object.
  const registrations = new Map<string, PreActionEvidenceV1[]>();
  for (const evidence of input.evidence) registrations.set(evidence.evidenceId, [...(registrations.get(evidence.evidenceId) ?? []), evidence]);
  const identityRefCounts = new Map<string, number>();
  for (const report of input.reports) {
    for (const evidenceId of report.evidenceRefs) {
      const matches = registrations.get(evidenceId) ?? [];
      if (matches.length === 0) {
        return { status: "missing", reason: `dangling_evidence_reference:${evidenceId}` };
      }
      if (matches.length > 1) {
        return { status: "missing", reason: `multiply_bound_evidence_reference:${evidenceId}` };
      }
      const identity = canonicalEvidenceIdentityV1(matches[0]);
      identityRefCounts.set(identity, (identityRefCounts.get(identity) ?? 0) + 1);
    }
  }

  const order = input.claimOptions;
  const distributions = input.reports.map(report => order.map(option => report.probabilities[option] ?? 0));
  const R = computeAlignmentR(distributions);
  if (R === null) return { status: "missing", reason: "insufficient_reports" };
  const H_E = computeEvidenceDiversityHE([...identityRefCounts.values()]);
  const kappa = computeCrystallizationKappa(R, H_E);
  const identityRefs = [...identityRefCounts.entries()]
    .map(([identity, count]) => ({ identity, count }))
    .sort((a, b) => b.count - a.count || a.identity.localeCompare(b.identity));
  return { status: "ok", R, H_E, kappa, identityCount: identityRefCounts.size, identityRefs };
}

// ---------------------------------------------------------------------------
// Evidence observability census (A1 exact content reuse, A2 verbatim
// private-commitment coverage). Descriptive only: neither quantity is a
// detector, a governance-useful index, or policy-ready.
// ---------------------------------------------------------------------------

export interface EvidenceObservabilityCensusV1 {
  /** A1: total round-1 report-to-evidence references. */
  nRef: number;
  /** A1: distinct content hashes among those references. */
  uHash: number;
  /**
   * A1: exact content reuse fraction = 1 - U_hash/N_ref.
   * Measures only exact content-hash repetition of references. It does not
   * detect paraphrase, semantic common origin, upstream source sharing, or
   * evidence quality. 0 means "no exact hash repetition", not "independent".
   * null when N_ref = 0 (not a disguised 0).
   */
  exactReuseFraction: number | null;
  /**
   * A2: verbatim private-commitment coverage. matchedCommittedAgentCount is the
   * number of commitment entries whose privateInformationHash exactly equals a
   * referenced content hash; registeredAgentCount is the commitment roster size;
   * coverage = matched / registered. Hash equality means only verbatim text
   * correspondence between model evidence and committed private information; hash
   * inequality does not imply the private information was unused. Fail-closed
   * (status "missing") when the manifest is absent, the roster mismatches the
   * registered agents, or a duplicate commitment hash makes source identity
   * ambiguous.
   */
  commitmentCoverage:
    | { status: "ok"; matchedCommittedAgentCount: number; registeredAgentCount: number; verbatimPrivateCommitmentCoverage: number }
    | { status: "missing"; reason: string };
}

/**
 * A1 from an already-validated pre-action state. Reuses the exact content-hash
 * identity binding from the state projection (identityRefs are content-hash
 * counts after V1's canonical identity rule); no new artifact loader.
 */
export function computeExactContentReuseV1(state: Extract<StateProjectionV1, { status: "ok" }>): {
  nRef: number;
  uHash: number;
  exactReuseFraction: number | null;
} {
  const nRef = state.identityRefs.reduce((sum, ref) => sum + ref.count, 0);
  const uHash = state.identityCount;
  return { nRef, uHash, exactReuseFraction: nRef === 0 ? null : 1 - uHash / nRef };
}

/** Read v6TaskManifest.orderedAgentCommitments; null when absent/malformed/empty. */
export function extractPrivateCommitmentsV1(
  artifact: Record<string, unknown>,
): Array<{ agentId: string; privateInformationHash: string }> | null {
  const manifest = artifact.v6TaskManifest as Record<string, unknown> | undefined;
  const commitments = manifest?.orderedAgentCommitments;
  if (!Array.isArray(commitments) || commitments.length === 0) return null;
  const out: Array<{ agentId: string; privateInformationHash: string }> = [];
  for (const entry of commitments) {
    const agentId = (entry as { agentId?: unknown }).agentId;
    const hash = (entry as { privateInformationHash?: unknown }).privateInformationHash;
    if (typeof agentId !== "string" || agentId.length === 0 || typeof hash !== "string" || hash.length === 0) return null;
    out.push({ agentId, privateInformationHash: hash });
  }
  return out;
}

/**
 * A2 coverage computation with fail-closed conditions:
 *  - empty/missing roster -> commitment_manifest_missing;
 *  - roster agents do not match the registered expected agents -> commitment_roster_mismatch;
 *  - a duplicate privateInformationHash makes the matched source ambiguous -> duplicate_commitment_hash.
 */
export function computeCommitmentCoverageV1(input: {
  referencedContentHashes: string[];
  commitments: Array<{ agentId: string; privateInformationHash: string }>;
  expectedAgentIds: string[];
}):
  | { status: "ok"; matchedCommittedAgentCount: number; registeredAgentCount: number; verbatimPrivateCommitmentCoverage: number }
  | { status: "missing"; reason: string } {
  if (input.commitments.length === 0) return { status: "missing", reason: "commitment_manifest_missing" };
  const rosterAgents = [...input.commitments.map(entry => entry.agentId)].sort();
  const expectedAgents = [...input.expectedAgentIds].sort();
  if (JSON.stringify(rosterAgents) !== JSON.stringify(expectedAgents)) {
    return { status: "missing", reason: "commitment_roster_mismatch" };
  }
  const hashCounts = new Map<string, number>();
  for (const entry of input.commitments) {
    hashCounts.set(entry.privateInformationHash, (hashCounts.get(entry.privateInformationHash) ?? 0) + 1);
  }
  for (const [hash, count] of hashCounts) {
    if (count > 1) return { status: "missing", reason: `duplicate_commitment_hash:${hash}` };
  }
  const referenced = new Set(input.referencedContentHashes);
  const matched = input.commitments.filter(entry => referenced.has(entry.privateInformationHash)).length;
  const registeredAgentCount = input.commitments.length;
  return {
    status: "ok",
    matchedCommittedAgentCount: matched,
    registeredAgentCount,
    verbatimPrivateCommitmentCoverage: matched / registeredAgentCount,
  };
}

/** Full per-run census for an already-validated pre-action state. */
export function computeEvidenceObservabilityCensusV1(input: {
  state: Extract<StateProjectionV1, { status: "ok" }>;
  expectedAgentIds: string[];
  commitments: Array<{ agentId: string; privateInformationHash: string }> | null;
}): EvidenceObservabilityCensusV1 {
  const reuse = computeExactContentReuseV1(input.state);
  const referencedContentHashes = input.state.identityRefs.map(ref => ref.identity);
  const commitmentCoverage = input.commitments === null
    ? { status: "missing" as const, reason: "commitment_manifest_missing" }
    : computeCommitmentCoverageV1({ referencedContentHashes, commitments: input.commitments, expectedAgentIds: input.expectedAgentIds });
  return { nRef: reuse.nRef, uHash: reuse.uHash, exactReuseFraction: reuse.exactReuseFraction, commitmentCoverage };
}

// ---------------------------------------------------------------------------
// Post-action response extraction (never fed into the state projection)
// ---------------------------------------------------------------------------

export type GArm = "apply" | "sham" | "holdout" | "ineligible";

export function armOfV1(artifact: Record<string, unknown>): GArm {
  const trail = artifact.governanceAuditTrail as Record<string, unknown>;
  const transitions = ((trail.actionTransitions as Array<Record<string, unknown>>) ?? []).map(t => t.to);
  if (transitions.includes("held_out")) return "holdout";
  if (transitions.includes("assigned")) {
    const ref = ((trail.actionInstances as Array<Record<string, unknown>>)?.[0]?.actionRef as { id?: string } | undefined)?.id;
    return ref === "swarmalpha.action.verification-attention-sham" ? "sham" : "apply";
  }
  return "ineligible";
}

export interface ResponseRawV1 {
  arm: GArm;
  finalBrier: number | null;
  accuracy: number | null;
  tokens: number;
  invalidOrFailed: number;
  resolvedOption: string | null;
  finalPooled: Record<string, number> | null;
  finalInvalid: number;
  finalAbstained: number;
  finalUnavailable: number;
  verdict?: string;
  explanationAvailable?: boolean;
  targetAgentId?: string;
}

/** Extract post-action response fields only (never pre-action state inputs). */
export function extractResponseRawV1(artifact: Record<string, unknown>): ResponseRawV1 {
  const operational = artifact.operationalOutcome as Record<string, unknown> | undefined;
  const primaryMetric = operational?.primaryMetric as { value?: number } | undefined;
  const finalBrier = typeof primaryMetric?.value === "number" ? primaryMetric.value : null;

  const taskOutcome = artifact.taskOutcome as Record<string, unknown> | undefined;
  const quality = (taskOutcome?.quality as number | undefined) ?? null;
  const cost = taskOutcome?.cost as Record<string, number> | undefined;
  const tokens = cost?.totalTokens ?? 0;
  const invalidOrFailed = cost?.invalidOrFailed ?? 0;

  const finalOutcome = artifact.finalOutcome as Record<string, unknown> | undefined;
  const resolutions = (finalOutcome?.resolutions as Array<Record<string, unknown>>) ?? [];
  const resolvedOption = (resolutions[0]?.outcome as string | undefined) ?? null;

  const claimOutcome = (operational?.claimOutcome as Record<string, unknown> | undefined);
  const contributions = (claimOutcome?.contributions as Array<Record<string, unknown>>) ?? [];
  let finalPooled: Record<string, number> | null = null;
  if (contributions.length > 0) {
    const pooled: Record<string, number> = {};
    let included = 0;
    for (const contribution of contributions) {
      const value = contribution.value as { kind?: string; probabilities?: Record<string, number> } | undefined;
      const probabilities = value?.probabilities;
      if (!probabilities) continue;
      for (const [option, prob] of Object.entries(probabilities)) {
        pooled[option] = (pooled[option] ?? 0) + prob / contributions.length;
      }
      included += 1;
    }
    if (included > 0) finalPooled = pooled;
  }

  const terminalStatusCounts = (claimOutcome?.terminalStatusCounts as Record<string, number>) ?? {};
  const finalInvalid = terminalStatusCounts.invalid ?? 0;
  const finalAbstained = terminalStatusCounts.abstained ?? 0;
  const finalUnavailable = terminalStatusCounts.unavailable ?? 0;

  const arm = armOfV1(artifact);
  let verdict: string | undefined;
  let explanationAvailable: boolean | undefined;
  let targetAgentId: string | undefined;
  if (arm === "apply") {
    const trail = artifact.governanceAuditTrail as Record<string, unknown>;
    const sourceEvents = (trail.sourceEvents as Array<Record<string, unknown>>) ?? [];
    const verification = sourceEvents.find(ev => ((ev.eventRef as { id?: string })?.id ?? "").includes("verification-result"));
    const payload = verification?.payload as { verdict?: string; explanation?: string } | undefined;
    verdict = payload?.verdict;
    explanationAvailable = typeof payload?.explanation === "string" && payload.explanation.length > 0;
    targetAgentId = ((trail.actionInstances as Array<Record<string, unknown>>)?.[0]?.targetIds as string[] | undefined)?.[0];
  }

  return {
    arm,
    finalBrier,
    accuracy: quality,
    tokens,
    invalidOrFailed,
    resolvedOption,
    finalPooled,
    finalInvalid,
    finalAbstained,
    finalUnavailable,
    verdict,
    explanationAvailable,
    targetAgentId,
  };
}

export interface ResponseMetricsV1 {
  prePooled: Record<string, number> | null;
  prePTruth: number | null;
  finalPTruth: number | null;
  deltaTruthMass: number | null;
  brierPre: number | null;
  deltaBrier: number | null;
  concordance: "concordant" | "discordant" | null;
}

/**
 * Post-action response metrics that combine a valid pre-action projection with
 * the extracted response. The projection is required here only for outcome-side
 * comparisons (truth-mass/Brier movement, apply concordance); it is never used
 * to select treatment.
 */
export function computeResponseMetricsV1(input: {
  projection: PreActionProjectionV1 | null;
  response: ResponseRawV1;
}): ResponseMetricsV1 {
  const resolved = input.response.resolvedOption;
  const prePooled: Record<string, number> | null = input.projection
    ? (() => {
        const pooled: Record<string, number> = {};
        for (const report of input.projection!.reports) {
          for (const [option, prob] of Object.entries(report.probabilities)) {
            pooled[option] = (pooled[option] ?? 0) + prob / input.projection!.reports.length;
          }
        }
        return pooled;
      })()
    : null;

  const prePTruth = prePooled && resolved ? (prePooled[resolved] ?? null) : null;
  const finalPTruth = input.response.finalPooled && resolved ? (input.response.finalPooled[resolved] ?? null) : null;
  const deltaTruthMass = prePTruth !== null && finalPTruth !== null ? finalPTruth - prePTruth : null;
  const brierPre = prePooled && resolved
    ? Object.entries(prePooled).reduce((sum, [option, prob]) => sum + (prob - (option === resolved ? 1 : 0)) ** 2, 0)
    : null;
  const deltaBrier = brierPre !== null && input.response.finalBrier !== null ? input.response.finalBrier - brierPre : null;

  let concordance: "concordant" | "discordant" | null = null;
  if (input.response.arm === "apply" && input.response.verdict && input.response.targetAgentId && input.projection && resolved) {
    const targetReport = input.projection.reports.find(report => report.agentId === input.response.targetAgentId);
    if (targetReport) {
      const topOption = Object.entries(targetReport.probabilities).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (topOption !== undefined) {
        if (input.response.verdict === "supported") concordance = topOption === resolved ? "concordant" : "discordant";
        else if (input.response.verdict === "contradicted") concordance = topOption === resolved ? "discordant" : "concordant";
        // insufficient_evidence is unscored.
      }
    }
  }

  return { prePooled, prePTruth, finalPTruth, deltaTruthMass, brierPre, deltaBrier, concordance };
}

// ---------------------------------------------------------------------------
// Run loading (development + heldout), with the combined-analyzer dedup rule
// ---------------------------------------------------------------------------

export interface AnalysisRunV1 {
  batch: "development" | "heldout";
  runId: string;
  taskId: number;
  arm: GArm;
  assignedAt: string | null;
  state: StateProjectionV1;
  response: ResponseRawV1;
  metrics: ResponseMetricsV1;
  /** Evidence observability census; null unless the pre-action state is valid. */
  census: EvidenceObservabilityCensusV1 | null;
  /** Five matrix state axes; null unless both the state and census are valid. */
  axes: StateAxesV1 | null;
}

export function preActionProjectionFromArtifact(
  artifact: Record<string, unknown>,
  cutoff: string | null,
): { ok: true; projection: PreActionProjectionV1 } | { ok: false; reason: string } {
  if (cutoff === null) return { ok: false, reason: "no_assignment_cutoff" };
  const trace = artifact.v6InteractionTrace as Record<string, unknown>;
  const events = (trace.epistemicEvents as Array<Record<string, unknown>>) ?? [];
  const expectedAgentIds = (trace.expectedAgentIds as string[]) ?? [];
  const cutoffTime = new Date(cutoff).getTime();
  if (!Number.isFinite(cutoffTime)) return { ok: false, reason: "invalid_assignment_cutoff" };
  const reports: PreActionReportV1[] = [];
  const evidence: PreActionEvidenceV1[] = [];
  const reportClaimIds = new Set<string>();
  let firstPreActionReportIndex: number | null = null;
  for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
    const event = events[eventIndex];
    const createdAt = (event.report as { createdAt?: string } | undefined)?.createdAt
      ?? (event.evidence as { createdAt?: string } | undefined)?.createdAt;
    if (createdAt === undefined) continue;
    const createdTime = new Date(createdAt).getTime();
    if (!Number.isFinite(createdTime)) return { ok: false, reason: "invalid_pre_action_event_time" };
    if (createdTime >= cutoffTime) continue;
    if (event.type === "belief_reported") {
      const report = event.report as { claimId?: string; agentId?: string; round?: number; value?: { probabilities?: Record<string, number> }; evidence?: Array<{ evidenceId?: string }> } | undefined;
      if (report?.round !== 1) continue;
      const probabilities = report.value?.probabilities;
      if (!report.claimId || !report.agentId || !probabilities) return { ok: false, reason: `belief_report_malformed:${report.agentId ?? "?"}` };
      reportClaimIds.add(report.claimId);
      if (firstPreActionReportIndex === null) firstPreActionReportIndex = eventIndex;
      const evidenceRefs = (report.evidence ?? []).map(ref => ref.evidenceId ?? "").filter(id => id.length > 0);
      reports.push({ agentId: report.agentId, probabilities, evidenceRefs });
    } else if (event.type === "evidence_registered") {
      const item = event.evidence as { id?: string; provenance?: { contentHash?: string; lineageId?: string } } | undefined;
      if (!item?.id || !item.provenance?.contentHash) return { ok: false, reason: `evidence_malformed:${item?.id ?? "?"}` };
      evidence.push({ evidenceId: item.id, contentHash: item.provenance.contentHash, lineageId: item.provenance.lineageId });
    }
  }
  if (reports.length === 0) return { ok: false, reason: "no_pre_action_reports" };
  if (reportClaimIds.size !== 1) return { ok: false, reason: "pre_action_claim_binding_mismatch" };
  const [reportClaimId] = [...reportClaimIds];
  const matchingClaims = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.type === "claim_registered"
      && (event.claim as { id?: string } | undefined)?.id === reportClaimId);
  if (matchingClaims.length !== 1) return { ok: false, reason: "pre_action_claim_authority_mismatch" };
  if (firstPreActionReportIndex !== null && matchingClaims[0].index >= firstPreActionReportIndex) {
    return { ok: false, reason: "pre_action_claim_registered_after_report" };
  }
  const claimOptions = ((matchingClaims[0].event.claim as { options?: string[] }).options) ?? [];
  if (claimOptions.length < 2) return { ok: false, reason: "claim_options_unavailable" };
  return { ok: true, projection: { claimOptions, expectedAgentIds, reports, evidence } };
}

export function preActionCutoffFor(artifact: Record<string, unknown>, arm: GArm): string | null {
  const trail = artifact.governanceAuditTrail as Record<string, unknown>;
  if (arm !== "ineligible") {
    return ((trail.eventAssignments as Array<{ assignedAt?: string }>) ?? [])[0]?.assignedAt ?? null;
  }
  return ((trail.decisions as Array<{ decidedAt?: string }>) ?? [])[0]?.decidedAt ?? null;
}

function replayVerify(file: string, artifact: Record<string, unknown>, taskId: number): void {
  const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: taskId, profile: VERDICT_EXPLORATORY_PROFILE });
  const replay = verifyRawRunData(file, artifact, { governanceRules: [fixture.rule] });
  if (replay.runIssues.length > 0 || replay.governanceAuditStatus !== "sealed_decision_replay_verified") {
    throw new Error(`social_thermo_replay_failed:${(artifact.runId as string) ?? file}:${replay.runIssues.map(issue => issue.code).join(",")}`);
  }
}

function artifactFileFor(runId: string, roots: readonly string[]): { file: string; matchCount: number } {
  const matches: string[] = [];
  for (const root of roots) {
    const file = resolveV6AuditableRawRunPath(root, runId);
    if (fs.existsSync(file)) matches.push(file);
  }
  return { file: matches[0] ?? "", matchCount: matches.length };
}

/**
 * Load a run set following the combined-exploratory dedup/missing rules:
 *  - an artifact found in more than one root rejects the run set (duplicate);
 *  - with requireAll, any planned run missing an artifact rejects the run set;
 *  - every loaded artifact must replay-qualify.
 */
export function loadRunSetV1(input: {
  batch: "development" | "heldout";
  plan: VerdictExploratoryPlan;
  roots: readonly string[];
  requireAll: boolean;
}): AnalysisRunV1[] {
  const out: AnalysisRunV1[] = [];
  for (const task of input.plan.tasks) {
    for (const run of task.runs.filter(item => item.protocol === "epistemic_governance_v1")) {
      const { file, matchCount } = artifactFileFor(run.runId, input.roots);
      if (matchCount > 1) throw new Error(`social_thermo_duplicate_artifact:${run.runId}`);
      if (matchCount === 0) {
        if (input.requireAll) throw new Error(`social_thermo_missing_artifact:${run.runId}`);
        continue;
      }
      const artifact = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      replayVerify(file, artifact, run.taskId);
      const arm = armOfV1(artifact);
      const assignedAt = preActionCutoffFor(artifact, arm);
      const projectionResult = preActionProjectionFromArtifact(artifact, assignedAt);
      const state = projectionResult.ok
        ? computeStateProjectionV1(projectionResult.projection)
        : { status: "missing" as const, reason: projectionResult.reason };
      const response = extractResponseRawV1(artifact);
      // Pre-action-derived metrics (concordance, truth-mass/Brier movement) are
      // computed only over fully valid states; an incomplete snapshot is fail-closed.
      const metrics = computeResponseMetricsV1({
        projection: projectionResult.ok && state.status === "ok" ? projectionResult.projection : null,
        response,
      });
      // Evidence observability census: computed only on a fully valid pre-action
      // state, reading only the state binding and v6TaskManifest commitments
      // (never arm, outcome, resolution, or verdict).
      const census = projectionResult.ok && state.status === "ok"
        ? computeEvidenceObservabilityCensusV1({
            state,
            expectedAgentIds: projectionResult.projection.expectedAgentIds,
            commitments: extractPrivateCommitmentsV1(artifact),
          })
        : null;
      let axes: StateAxesV1 | null = null;
      if (state.status === "ok" && projectionResult.ok && census) {
        const distributions = projectionResult.projection.reports.map(report =>
          projectionResult.projection.claimOptions.map(option => report.probabilities[option] ?? 0));
        axes = computeStateAxesV1({ distributions, state, census });
      }
      out.push({
        batch: input.batch,
        runId: run.runId,
        taskId: run.taskId,
        arm,
        assignedAt,
        state,
        response,
        metrics,
        census,
        axes,
      });
    }
  }
  return out;
}

/** Assert the heldout root contains exactly the planned run artifacts (no extras). */
export function assertHeldoutNoExtrasV1(plan: VerdictExploratoryPlan, root: string): void {
  const planned = new Set(plan.tasks.flatMap(task => task.runs.map(run => run.runId)));
  const files = fs.existsSync(root) ? fs.readdirSync(root).filter(f => f.endsWith(".raw-run.v5.json")) : [];
  const present = new Set<string>();
  for (const file of files) {
    const runId = `run:${file.slice("run_".length).split(".")[0].replaceAll("_", ":")}`;
    if (!planned.has(runId)) throw new Error(`social_thermo_extra_artifact:${runId}`);
    present.add(runId);
  }
  if (present.size !== planned.size) throw new Error(`social_thermo_heldout_count_mismatch:${present.size}/${planned.size}`);
}

// ---------------------------------------------------------------------------
// Kappa stratification + task-cluster bootstrap (heldout convention)
// ---------------------------------------------------------------------------

export interface StratumResultV1 {
  stratum: "low" | "high";
  nApply: number;
  nHoldout: number;
  nSham: number;
  applyTaskClusters: number;
  holdoutTaskClusters: number;
  applyMeanBrier: number | null;
  holdoutMeanBrier: number | null;
  naiveDiff: number | null;
  bootstrapMedian: number | null;
  lower: number | null;
  upper: number | null;
  validFraction: number;
  deferReasons: string[];
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function percentile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}

export function analyzeKappaStratumV1(input: {
  runs: AnalysisRunV1[];
  kappaCut: number | null;
  bootstrapCount: number;
  seed: string;
}): { strata: StratumResultV1[]; interaction: number | null; taskIds: number[] } {
  if (input.kappaCut === null) {
    return { strata: [], interaction: null, taskIds: input.runs.map(run => run.taskId) };
  }
  const taskIds = [...new Set(input.runs.map(run => run.taskId))].sort((a, b) => a - b);
  const strata: StratumResultV1[] = [];
  for (const stratum of ["low", "high"] as const) {
    const runs = input.runs.filter(run => {
      if (run.state.status !== "ok") return false;
      const kappa = run.state.kappa;
      if (kappa === null || !Number.isFinite(kappa)) return false;
      return stratum === "low" ? kappa < input.kappaCut! : kappa >= input.kappaCut!;
    });
    const apply = runs.filter(run => run.arm === "apply" && run.response.finalBrier !== null);
    const holdout = runs.filter(run => run.arm === "holdout" && run.response.finalBrier !== null);
    const sham = runs.filter(run => run.arm === "sham");
    const applyMeanBrier = mean(apply.map(run => run.response.finalBrier as number));
    const holdoutMeanBrier = mean(holdout.map(run => run.response.finalBrier as number));
    const naiveDiff = applyMeanBrier !== null && holdoutMeanBrier !== null ? applyMeanBrier - holdoutMeanBrier : null;
    const boot = taskClusterDifferenceBootstrap(
      apply.map(run => ({ taskId: run.taskId, brier: run.response.finalBrier as number })),
      holdout.map(run => ({ taskId: run.taskId, brier: run.response.finalBrier as number })),
      taskIds,
      input.bootstrapCount,
      `${input.seed}:${stratum}`,
    );
    const lower = percentile(boot.diffs, 0.025);
    const upper = percentile(boot.diffs, 0.975);
    const bootstrapMedian = percentile(boot.diffs, 0.5);
    const deferReasons = evaluateTaskHeldoutDeferV1({
      missingRuns: 0,
      applyN: apply.length,
      holdoutN: holdout.length,
      applyTaskClusters: new Set(apply.map(run => run.taskId)).size,
      holdoutTaskClusters: new Set(holdout.map(run => run.taskId)).size,
      bootstrapValidFraction: boot.validFraction,
      naiveEffect: naiveDiff,
      bootstrapUpper: upper,
    });
    strata.push({
      stratum,
      nApply: apply.length,
      nHoldout: holdout.length,
      nSham: sham.length,
      applyTaskClusters: new Set(apply.map(run => run.taskId)).size,
      holdoutTaskClusters: new Set(holdout.map(run => run.taskId)).size,
      applyMeanBrier,
      holdoutMeanBrier,
      naiveDiff,
      bootstrapMedian,
      lower,
      upper,
      validFraction: boot.validFraction,
      deferReasons,
    });
  }
  const high = strata.find(s => s.stratum === "high");
  const low = strata.find(s => s.stratum === "low");
  const interaction = high !== undefined && low !== undefined && high.naiveDiff !== null && low.naiveDiff !== null
    ? high.naiveDiff - low.naiveDiff
    : null;
  return { strata, interaction, taskIds };
}

// ---------------------------------------------------------------------------
// Status decision (§10)
// ---------------------------------------------------------------------------

export type AuditStatusV1 =
  | "STATE-RESPONSE SIGNAL PRESERVED — secondary evidence only"
  | "DEFER — insufficient support/uncertainty"
  | "STATE-RESPONSE HYPOTHESIS NOT PRESERVED"
  | "STOP — projection or authority failure"
  | "STOP — current H_E/kappa V1 macrostate degenerate";

export type MacrostateQualificationV1 = "qualified" | "degenerate" | "unresolved";

export function decideAuditStatusV1(
  heldoutStratum: { strata: StratumResultV1[]; interaction: number | null },
  kappaCut: number | null,
  macrostateQualification: MacrostateQualificationV1,
): AuditStatusV1 {
  if (kappaCut === null) return "STOP — projection or authority failure";
  if (macrostateQualification === "degenerate") return "STOP — current H_E/kappa V1 macrostate degenerate";
  if (macrostateQualification === "unresolved") return "DEFER — insufficient support/uncertainty";
  const high = heldoutStratum.strata.find(s => s.stratum === "high");
  const low = heldoutStratum.strata.find(s => s.stratum === "low");
  if (!high || !low) return "STOP — projection or authority failure";
  const interactionConsistent = heldoutStratum.interaction !== null && heldoutStratum.interaction < 0;
  const highBenefit = high.deferReasons.length === 0; // high-state apply-holdout benefit established
  const bothSupported = low.deferReasons.length === 0 && high.deferReasons.length === 0;
  // RQ2 hypothesis is chi(high-kappa) < chi(low-kappa): benefit in the high state
  // AND an interaction contrast in the hypothesized direction.
  if (highBenefit && interactionConsistent) return "STATE-RESPONSE SIGNAL PRESERVED — secondary evidence only";
  // A contradicting interaction with adequate support in both strata falsifies the
  // stated hypothesis; otherwise the evidence is insufficient.
  if (bothSupported && heldoutStratum.interaction !== null && heldoutStratum.interaction >= 0) {
    return "STATE-RESPONSE HYPOTHESIS NOT PRESERVED";
  }
  return "DEFER — insufficient support/uncertainty";
}

// ---------------------------------------------------------------------------
// Batch evidence observability census (Task B). Descriptive only; no arm
// grouping, no outcome/truth/resolution/verdict access, no correlations,
// regression, p-values, bootstrap, or effect size; no threshold/subgroup search.
// ---------------------------------------------------------------------------

export type CensusInterpretationV1 =
  | "descriptive_variation_observed"
  | "descriptively_degenerate"
  | "unreconstructable_from_current_artifacts";

/** Mechanical reading: one finite value -> degenerate; none -> unreconstructable; >1 -> variation. */
export function interpretCensusValuesV1(finiteValues: number[]): CensusInterpretationV1 {
  if (finiteValues.length === 0) return "unreconstructable_from_current_artifacts";
  if (new Set(finiteValues).size === 1) return "descriptively_degenerate";
  return "descriptive_variation_observed";
}

export interface CensusQuantitySummaryV1 {
  n: number;
  missing: number;
  min: number | null;
  median: number | null;
  max: number | null;
  distinctValueCount: number;
  interpretation: CensusInterpretationV1;
}

export function summarizeCensusQuantityV1(values: Array<number | null>): CensusQuantitySummaryV1 {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return {
    n: finite.length,
    missing: values.length - finite.length,
    min: finite.length ? Math.min(...finite) : null,
    median: computeKappaCutV1(finite),
    max: finite.length ? Math.max(...finite) : null,
    distinctValueCount: new Set(finite).size,
    interpretation: interpretCensusValuesV1(finite),
  };
}

export interface EvidenceObservabilityBatchCensusV1 {
  runCount: number;
  R: CensusQuantitySummaryV1;
  exactReuseFraction: CensusQuantitySummaryV1;
  verbatimPrivateCommitmentCoverage: CensusQuantitySummaryV1;
  nRefMin: number | null;
  nRefMax: number | null;
  uHashMin: number | null;
  uHashMax: number | null;
}

/** Batch census over eligible runs with a valid pre-action state and a census. */
export function censusBatchSummaryV1(runs: AnalysisRunV1[]): EvidenceObservabilityBatchCensusV1 {
  const valid = runs.filter(run => run.arm !== "ineligible" && run.state.status === "ok" && run.census !== null);
  const RValues: number[] = [];
  const reuseValues: Array<number | null> = [];
  const commitValues: Array<number | null> = [];
  const nRefs: number[] = [];
  const uHashes: number[] = [];
  for (const run of valid) {
    const census = run.census!;
    RValues.push(run.state.status === "ok" ? run.state.R : 0);
    reuseValues.push(census.exactReuseFraction);
    commitValues.push(census.commitmentCoverage.status === "ok"
      ? census.commitmentCoverage.verbatimPrivateCommitmentCoverage
      : null);
    nRefs.push(census.nRef);
    uHashes.push(census.uHash);
  }
  return {
    runCount: valid.length,
    R: summarizeCensusQuantityV1(RValues),
    exactReuseFraction: summarizeCensusQuantityV1(reuseValues),
    verbatimPrivateCommitmentCoverage: summarizeCensusQuantityV1(commitValues),
    nRefMin: nRefs.length ? Math.min(...nRefs) : null,
    nRefMax: nRefs.length ? Math.max(...nRefs) : null,
    uHashMin: uHashes.length ? Math.min(...uHashes) : null,
    uHashMax: uHashes.length ? Math.max(...uHashes) : null,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function stateReasonCounts(runs: AnalysisRunV1[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const run of runs) counts[run.state.status === "ok" ? "ok" : run.state.reason] = (counts[run.state.status === "ok" ? "ok" : run.state.reason] ?? 0) + 1;
  return counts;
}

function main(): number {
  const devOriginal = loadRunSetV1({
    batch: "development",
    plan: buildVerdictExploratoryPlan(),
    roots: [VERDICT_EXPLORATORY_OUTPUT_DIR],
    requireAll: true,
  });
  const devContinuation = loadRunSetV1({
    batch: "development",
    plan: buildRetry1Plan(),
    roots: RETRY1_ROOTS,
    requireAll: false,
  });
  const devRuns = [...devOriginal, ...devContinuation];
  const heldoutPlan = buildVerdictTaskHeldoutReplicationPlan();
  assertHeldoutNoExtrasV1(heldoutPlan, VERDICT_TASK_HELDOUT_OUTPUT_DIR);
  const heldoutRuns = loadRunSetV1({
    batch: "heldout",
    plan: heldoutPlan,
    roots: [VERDICT_TASK_HELDOUT_OUTPUT_DIR],
    requireAll: true,
  });

  const devEligible = devRuns.filter(run => run.arm !== "ineligible");
  const devKappas = devEligible
    .map(run => (run.state.status === "ok" ? run.state.kappa : null))
    .filter((value): value is number => value !== null);
  const kappaCut = computeKappaCutV1(devKappas);

  const heldoutEligible = heldoutRuns.filter(run => run.arm !== "ineligible");
  const heldoutValidState = heldoutEligible.filter(run => run.state.status === "ok");

  const heldoutStratum = analyzeKappaStratumV1({
    runs: heldoutEligible,
    kappaCut,
    bootstrapCount: heldoutPlan.analysisContract.bootstrapCount,
    seed: heldoutPlan.contentHash,
  });
  const devStratum = analyzeKappaStratumV1({
    runs: devEligible,
    kappaCut,
    bootstrapCount: heldoutPlan.analysisContract.bootstrapCount,
    seed: heldoutPlan.contentHash,
  });
  // Explicit scientific adjudication for this frozen audit, not a reusable
  // numeric detector. V1 never preregistered a universal collapse threshold;
  // future work must freeze a new qualification rule before seeing outcomes.
  const macrostateQualification: MacrostateQualificationV1 = "degenerate";
  const responseEffectStatus = decideAuditStatusV1(heldoutStratum, kappaCut, "qualified");
  const status = decideAuditStatusV1(heldoutStratum, kappaCut, macrostateQualification);

  const lines: string[] = [];
  lines.push("=== v6 social-thermodynamic response audit (zero provider, read-only) ===");
  lines.push(`status: ${status}`);
  lines.push(`response-effect evidence: ${responseEffectStatus}`);
  lines.push("policy authorization: NO-GO");
  lines.push(`development: eligible=${devEligible.length} validState=${devEligible.filter(r => r.state.status === "ok").length} stateReasons=${JSON.stringify(stateReasonCounts(devRuns))}`);
  lines.push(`heldout: planned=96 present=${heldoutRuns.length} eligible=${heldoutEligible.length} validState=${heldoutValidState.length} stateReasons=${JSON.stringify(stateReasonCounts(heldoutRuns))}`);
  lines.push(`development finite kappas: ${devKappas.length} kappaCut(median)=${kappaCut?.toFixed(4) ?? "null"}`);

  const okStateFields = (run: AnalysisRunV1): { R: number | null; H_E: number | null; kappa: number | null } => {
    if (run.state.status !== "ok") return { R: null, H_E: null, kappa: null };
    return { R: run.state.R, H_E: run.state.H_E, kappa: run.state.kappa };
  };
  const kappaSummary = (runs: AnalysisRunV1[]) => {
    const states = runs.map(okStateFields);
    const kappas = states.map(s => s.kappa).filter((v): v is number => v !== null);
    const HEs = states.map(s => s.H_E).filter((v): v is number => v !== null);
    const min = (a: number[]) => a.length ? Math.min(...a) : null;
    const max = (a: number[]) => a.length ? Math.max(...a) : null;
    return {
      n: kappas.length,
      kappaMin: min(kappas)?.toFixed(4) ?? null,
      kappaMedian: computeKappaCutV1(kappas)?.toFixed(4) ?? null,
      kappaMax: max(kappas)?.toFixed(4) ?? null,
      HEMin: min(HEs)?.toFixed(4) ?? null,
      HEMax: max(HEs)?.toFixed(4) ?? null,
    };
  };
  lines.push(`dev eligible state kappa/H_E summary: ${JSON.stringify(kappaSummary(devEligible))}`);
  lines.push(`heldout eligible state kappa/H_E summary: ${JSON.stringify(kappaSummary(heldoutEligible))}`);

  const corr = (runs: AnalysisRunV1[]) => {
    const states = runs.map(okStateFields);
    const finite = states.filter(v => v.R !== null && v.H_E !== null && v.kappa !== null);
    const pearson = (a: number[], b: number[]) => {
      const n = a.length; if (n < 2) return null;
      const ma = a.reduce((s, v) => s + v, 0) / n; const mb = b.reduce((s, v) => s + v, 0) / n;
      let num = 0, da = 0, db = 0;
      for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
      return da === 0 || db === 0 ? null : num / Math.sqrt(da * db);
    };
    const Rs = finite.map(v => v.R as number); const Hs = finite.map(v => v.H_E as number); const Ks = finite.map(v => v.kappa as number);
    return { n: finite.length, corrRH: pearson(Rs, Hs), corrRK: pearson(Rs, Ks), corrHK: pearson(Hs, Ks) };
  };
  lines.push(`dev macro correlation (valid states): ${JSON.stringify(corr(devEligible))}`);
  lines.push(`heldout macro correlation (valid states): ${JSON.stringify(corr(heldoutValidState))}`);

  for (const [label, stratum] of [["dev", devStratum], ["heldout", heldoutStratum]] as const) {
    lines.push(`--- ${label} stratum response ---`);
    if (stratum.strata.length === 0) { lines.push("  no strata (kappaCut null or no finite kappa)"); continue; }
    for (const s of stratum.strata) {
      lines.push(`  ${s.stratum}: apply=${s.nApply}/${s.applyMeanBrier?.toFixed(4) ?? "n/a"} holdout=${s.nHoldout}/${s.holdoutMeanBrier?.toFixed(4) ?? "n/a"} sham=${s.nSham} applyClusters=${s.applyTaskClusters} holdoutClusters=${s.holdoutTaskClusters} naive=${s.naiveDiff?.toFixed(4) ?? "n/a"} bootMedian=${s.bootstrapMedian?.toFixed(4) ?? "n/a"} 95%CI=[${s.lower?.toFixed(4) ?? "n/a"},${s.upper?.toFixed(4) ?? "n/a"}] validFraction=${s.validFraction.toFixed(4)} DEFER=${s.deferReasons.length ? `true(${s.deferReasons.join(";")})` : "false"}`);
    }
    lines.push(`  interaction Delta_high - Delta_low=${stratum.interaction?.toFixed(4) ?? "n/a"}`);
  }

  // Mechanism tables.
  const armCounts = (runs: AnalysisRunV1[]) => {
    const counts: Record<string, number> = {};
    for (const run of runs) if (run.arm !== "ineligible") counts[run.arm] = (counts[run.arm] ?? 0) + 1;
    return counts;
  };
  lines.push(`heldout eligible arm counts: ${JSON.stringify(armCounts(heldoutEligible))}`);
  lines.push(`heldout valid-state eligible arm counts: ${JSON.stringify(armCounts(heldoutValidState))}`);

  const applyRuns = heldoutRuns.filter(run => run.arm === "apply" && run.response.verdict);
  const verdictCounts: Record<string, number> = {};
  const concordanceCounts: Record<string, number> = {};
  for (const run of applyRuns) {
    verdictCounts[run.response.verdict!] = (verdictCounts[run.response.verdict!] ?? 0) + 1;
    if (run.metrics.concordance) concordanceCounts[`${run.response.verdict}:${run.metrics.concordance}`] = (concordanceCounts[`${run.response.verdict}:${run.metrics.concordance}`] ?? 0) + 1;
  }
  lines.push(`heldout apply verdict distribution: ${JSON.stringify(verdictCounts)}`);
  lines.push(`heldout apply outcome-direction concordance: ${JSON.stringify(concordanceCounts)}`);

  const movement = (runs: AnalysisRunV1[]) => {
    const rows = runs.filter(run => run.arm !== "ineligible" && run.state.status === "ok");
    const byVerdict: Record<string, { n: number; truthMass: number | null; brierMove: number | null }> = {};
    for (const run of rows) {
      const key = run.arm === "apply" ? (run.response.verdict ?? "apply-no-verdict") : run.arm;
      const row = byVerdict[key] ?? { n: 0, truthMass: 0, brierMove: 0 };
      row.n += 1;
      if (run.metrics.deltaTruthMass !== null) row.truthMass = (row.truthMass ?? 0) + run.metrics.deltaTruthMass;
      if (run.metrics.deltaBrier !== null) row.brierMove = (row.brierMove ?? 0) + run.metrics.deltaBrier;
      byVerdict[key] = row;
    }
    const out: Record<string, { n: number; meanDeltaTruthMass: number | null; meanDeltaBrier: number | null }> = {};
    for (const [key, row] of Object.entries(byVerdict)) {
      out[key] = { n: row.n, meanDeltaTruthMass: row.n ? row.truthMass! / row.n : null, meanDeltaBrier: row.n ? row.brierMove! / row.n : null };
    }
    return out;
  };
  lines.push(`heldout valid-state pre-to-final movement by arm/verdict: ${JSON.stringify(movement(heldoutEligible))}`);

  const taskResponse = (runs: AnalysisRunV1[]) => {
    const byTask = new Map<number, { apply: number[]; holdout: number[] }>();
    for (const run of runs) {
      if (run.arm === "apply" && run.response.finalBrier !== null) {
        byTask.set(run.taskId, { apply: [...(byTask.get(run.taskId)?.apply ?? []), run.response.finalBrier], holdout: byTask.get(run.taskId)?.holdout ?? [] });
      } else if (run.arm === "holdout" && run.response.finalBrier !== null) {
        byTask.set(run.taskId, { apply: byTask.get(run.taskId)?.apply ?? [], holdout: [...(byTask.get(run.taskId)?.holdout ?? []), run.response.finalBrier] });
      }
    }
    const out: Record<string, { applyN: number; holdoutN: number; diff: number | null }> = {};
    for (const [taskId, { apply, holdout }] of [...byTask.entries()].sort((a, b) => a[0] - b[0])) {
      const applyMean = mean(apply); const holdoutMean = mean(holdout);
      out[String(taskId)] = { applyN: apply.length, holdoutN: holdout.length, diff: applyMean !== null && holdoutMean !== null ? applyMean - holdoutMean : null };
    }
    return out;
  };
  lines.push(`heldout task-level apply-holdout (descriptive): ${JSON.stringify(taskResponse(heldoutRuns))}`);

  // Evidence observability census (descriptive only; no arm/outcome/verdict read).
  lines.push(`development evidence observability census: ${JSON.stringify(censusBatchSummaryV1(devEligible))}`);
  lines.push(`heldout evidence observability census: ${JSON.stringify(censusBatchSummaryV1(heldoutEligible))}`);

  // State-axis redundancy: pairwise Pearson over the five matrix axes
  // (disagreement/R/concentration/exactReuse/coverage) on valid-state runs.
  const axesCorr = (runs: AnalysisRunV1[]): StateAxisCorrelationV1 =>
    correlateStateAxesV1(runs.filter(run => run.axes !== null).map(run => run.axes!));
  lines.push(`development state-axis correlation: ${JSON.stringify(axesCorr(devEligible))}`);
  lines.push(`heldout state-axis correlation: ${JSON.stringify(axesCorr(heldoutEligible))}`);

  console.log(lines.join("\n"));
  return status.startsWith("STOP") ? 4 : 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main();
}
