/**
 * V6 Source-Disclosure mechanism screen — read-only analyzer (zero provider).
 *
 * Accepts only the frozen plan and its 40 raw-run artifacts. Authority checks
 * fail closed (missing/extra/duplicate run, replay issue, identity drift,
 * H/D public-context compliance, verification-call violation). The primary
 * contrast is the block-paired `final Brier(D) - final Brier(H)`; uncertainty
 * is a deterministic cluster bootstrap over the frozen 8 leakage groups.
 *
 * Screen status is one of SCREEN_PASS / MECHANISM_STOP / QUALITY_STOP / DEFER.
 * This is a non-confirmatory mechanism screen; no effect is ever "established".
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { verifyRawRunData } from "../replayVerifier";
import { resolveV6AuditableRawRunPath } from "./productionVerticalSlice";
import { mulberry32 } from "../../../src/lib/utils/statsUtils";
import {
  assertFrozenSourceDisclosureScreenPlanV1,
  buildSourceDisclosureFixtureV1,
  buildSourceDisclosureScreenPlanV1,
  disclosureScreenAllRuns,
  resolvedDisclosureConfig,
  type SourceDisclosureScreenPlanV1,
  type SourceDisclosureRunPlanV1,
} from "./run_v6_source_disclosure_screen";
import { createSourceDisclosureTaskVariantV1 } from "./sourceDisclosureInterventionV1";

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function loadPlan(): SourceDisclosureScreenPlanV1 {
  const plan = JSON.parse(fs.readFileSync(resolvedDisclosureConfig().planPath, "utf8")) as SourceDisclosureScreenPlanV1;
  assertFrozenSourceDisclosureScreenPlanV1(plan);
  return plan;
}

export interface DisclosureArtifactV1 {
  run: SourceDisclosureRunPlanV1;
  file: string;
  artifact: Record<string, unknown>;
  finalBrier: number | null;
  publicContextHash: string | null;
  actualProviderCalls: number;
  verificationCalls: number;
  uptakeObservable: boolean;
  uptakeHits: number;
  accuracy: number | null;
  tokens: number;
  invalidOrFailed: number;
  latencyMs: number;
}

function countProviderCalls(artifact: Record<string, unknown>): { total: number; verification: number } {
  const trace = artifact.v6InteractionTrace as Record<string, unknown>;
  const discussionCalls = (trace.discussionCalls as Array<unknown>) ?? [];
  const finalCollection = artifact.finalElicitationCollection as Record<string, unknown> | undefined;
  const finalRecords = (finalCollection?.records as Array<unknown>) ?? [];
  const sourceEvents = ((artifact.governanceAuditTrail as Record<string, unknown>)?.sourceEvents as Array<Record<string, unknown>>) ?? [];
  const verification = sourceEvents.filter(ev => ((ev.eventRef as { id?: string })?.id ?? "").includes("verification-result")).length;
  return { total: discussionCalls.length + finalRecords.length, verification };
}

function inspectUptake(
  artifact: Record<string, unknown>,
  sourcePrivateInformationHash: string,
): { observable: boolean; hits: number } {
  const trace = artifact.v6InteractionTrace as Record<string, unknown> | undefined;
  if (!trace || !Array.isArray(trace.epistemicEvents)) return { observable: false, hits: 0 };
  const events = trace.epistemicEvents as Array<Record<string, unknown>>;
  let hits = 0;
  for (const event of events) {
    if (event.type !== "evidence_registered") continue;
    const contentHash = (event.evidence as { provenance?: { contentHash?: string } } | undefined)?.provenance?.contentHash;
    if (contentHash === sourcePrivateInformationHash) hits += 1;
  }
  return { observable: true, hits };
}

/** Assert exactly the planned artifacts, no missing/extra/duplicate. */
export function assertDisclosureArtifactCompletenessV1(plan: SourceDisclosureScreenPlanV1, outputDir: string): void {
  const planned = new Set(disclosureScreenAllRuns(plan).map(run => run.runId));
  const files = fs.existsSync(outputDir) ? fs.readdirSync(outputDir).filter(f => f.endsWith(".raw-run.v5.json")) : [];
  const present = new Set<string>();
  for (const file of files) {
    const runId = `run:${file.slice("run_".length).split(".")[0].replaceAll("_", ":")}`;
    if (!planned.has(runId)) throw new Error(`source-disclosure-extra-artifact:${runId}`);
    present.add(runId);
  }
  if (present.size !== planned.size) {
    const missing = [...planned].filter(id => !present.has(id));
    throw new Error(`source-disclosure-artifact-set-mismatch:present=${present.size}/planned=${planned.size} missing=${missing.join(",")}`);
  }
}

export function collectDisclosureArtifactsV1(plan: SourceDisclosureScreenPlanV1, outputDir: string): DisclosureArtifactV1[] {
  const out: DisclosureArtifactV1[] = [];
  for (const run of disclosureScreenAllRuns(plan)) {
    const file = resolveV6AuditableRawRunPath(outputDir, run.runId);
    if (!fs.existsSync(file)) throw new Error(`source-disclosure-missing-artifact:${run.runId}`);
    const artifact = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    out.push({
      run,
      file,
      artifact,
      finalBrier: null,
      publicContextHash: null,
      actualProviderCalls: 0,
      verificationCalls: 0,
      uptakeObservable: false,
      uptakeHits: 0,
      accuracy: null,
      tokens: 0,
      invalidOrFailed: 0,
      latencyMs: 0,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Authority checks (fail closed)
// ---------------------------------------------------------------------------

export interface DisclosureAuthorityReportV1 {
  replayVerified: number;
  publicContextCompliance: number;
  sourceReplayConsistent: number;
  sameBlockSourceConsistent: number;
  verificationCallsZero: number;
  callCountMatch: number;
}

/**
 * Replay + identity + source/public-context/verification-call checks. Any
 * violation throws (fail-closed); the analyzer never reports a status on a
 * compromised run set.
 */
export function verifyDisclosureAuthoritiesV1(
  plan: SourceDisclosureScreenPlanV1,
  artifacts: DisclosureArtifactV1[],
  outputDir: string,
): DisclosureAuthorityReportV1 {
  const report: DisclosureAuthorityReportV1 = {
    replayVerified: 0,
    publicContextCompliance: 0,
    sourceReplayConsistent: 0,
    sameBlockSourceConsistent: 0,
    verificationCallsZero: 0,
    callCountMatch: 0,
  };
  for (const item of artifacts) {
    const run = item.run;
    if (item.artifact.runId !== run.runId) throw new Error(`source-disclosure-runid-drift:${item.artifact.runId} != ${run.runId}`);
    const fixture = buildSourceDisclosureFixtureV1(run.taskId);
    const replay = verifyRawRunData(item.file, item.artifact, { governanceRules: [fixture.rule] });
    if (replay.runIssues.length > 0 || replay.governanceAuditStatus !== "sealed_decision_replay_verified") {
      throw new Error(`source-disclosure-replay-failed:${run.runId}:${replay.runIssues.map(issue => issue.code).join(",")}`);
    }
    report.replayVerified += 1;

    // Source selection replay: recompute from frozen blockId + seed.
    const probe = createSourceDisclosureTaskVariantV1({
      runId: run.runId,
      blockId: run.blockId,
      task: fixture.projection.adapter.task,
      arm: "holdout",
      sourceSelectionSeed: run.sourceSelectionSeed,
    });
    if (probe.selection.sourceSelectionKeyHash !== run.sourceSelectionKeyHash
      || probe.selection.sourceAgentId !== run.sourceAgentId
      || probe.selection.sourcePrivateInformationHash !== run.sourcePrivateInformationHash) {
      throw new Error(`source-disclosure-source-replay-mismatch:${run.runId}`);
    }
    report.sourceReplayConsistent += 1;

    // Same block H/D share source identity (plan-level guarantee).
    const taskPlan = plan.tasks.find(t => t.taskId === run.taskId)!;
    const block = taskPlan.blocks.find(b => b.blockId === run.blockId)!;
    const [h, d] = block.runs;
    if (h.sourceSelectionKeyHash !== d.sourceSelectionKeyHash
      || h.sourceAgentId !== d.sourceAgentId
      || h.sourcePrivateInformationHash !== d.sourcePrivateInformationHash) {
      throw new Error(`source-disclosure-block-source-mismatch:${run.blockId}`);
    }
    report.sameBlockSourceConsistent += 1;

    // Public-context commitment compliance vs frozen plan.
    const manifest = item.artifact.v6TaskManifest as {
      publicContextHash?: string;
      taskDefinitionHash?: string;
    } | undefined;
    const contextHash = manifest?.publicContextHash ?? null;
    item.publicContextHash = contextHash;
    if (contextHash !== run.publicContextHash) {
      throw new Error(`source-disclosure-public-context-mismatch:${run.runId} got=${contextHash} expected=${run.publicContextHash}`);
    }
    if (manifest?.taskDefinitionHash !== run.taskDefinitionHash) {
      throw new Error(`source-disclosure-task-definition-mismatch:${run.runId}`);
    }
    report.publicContextCompliance += 1;

    // Provider calls: H/D identical (agentCount*3) and zero verification calls.
    const calls = countProviderCalls(item.artifact);
    item.actualProviderCalls = calls.total;
    item.verificationCalls = calls.verification;
    const expectedCalls = run.plannedProviderCalls;
    if (calls.total !== expectedCalls) throw new Error(`source-disclosure-call-count-mismatch:${run.runId} got=${calls.total} expected=${expectedCalls}`);
    report.callCountMatch += 1;
    if (calls.verification !== 0) throw new Error(`source-disclosure-verification-call-violation:${run.runId} calls=${calls.verification}`);
    report.verificationCallsZero += 1;

    const operational = item.artifact.operationalOutcome as { primaryMetric?: { value?: number } } | undefined;
    item.finalBrier = typeof operational?.primaryMetric?.value === "number" ? operational.primaryMetric.value : null;
    const taskOutcome = item.artifact.taskOutcome as { quality?: number; cost?: Record<string, number> } | undefined;
    item.accuracy = typeof taskOutcome?.quality === "number" ? taskOutcome.quality : null;
    item.tokens = taskOutcome?.cost?.totalTokens ?? 0;
    item.invalidOrFailed = taskOutcome?.cost?.invalidOrFailed ?? 0;
    item.latencyMs = taskOutcome?.cost?.totalLatencyMs ?? 0;
    const uptake = inspectUptake(item.artifact, run.sourcePrivateInformationHash);
    item.uptakeObservable = run.arm === "forced_source_disclosure" ? uptake.observable : false;
    item.uptakeHits = run.arm === "forced_source_disclosure" ? uptake.hits : 0;
  }
  return report;
}

// ---------------------------------------------------------------------------
// Primary contrast + leakage-group cluster bootstrap
// ---------------------------------------------------------------------------

export interface DisclosurePairedDiffV1 {
  taskId: number;
  leakageGroup: string;
  blockId: string;
  pairedDiff: number; // Brier(D) - Brier(H); negative favors disclosure
}

function percentile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}

export function computePairedDifferencesV1(artifacts: DisclosureArtifactV1[]): DisclosurePairedDiffV1[] {
  const byBlock = new Map<string, DisclosureArtifactV1[]>();
  for (const item of artifacts) {
    const key = `${item.run.taskId}:${item.run.blockId}`;
    byBlock.set(key, [...(byBlock.get(key) ?? []), item]);
  }
  const out: DisclosurePairedDiffV1[] = [];
  for (const [key, items] of byBlock) {
    const h = items.find(item => item.run.arm === "holdout");
    const d = items.find(item => item.run.arm === "forced_source_disclosure");
    if (items.length !== 2 || !h || !d || h.finalBrier === null || d.finalBrier === null
      || !Number.isFinite(h.finalBrier) || !Number.isFinite(d.finalBrier)) {
      throw new Error(`source-disclosure-invalid-pair:${key}`);
    }
    const run = h.run;
    out.push({ taskId: run.taskId, leakageGroup: run.leakageGroup, blockId: run.blockId, pairedDiff: d.finalBrier - h.finalBrier });
  }
  return out;
}

export function leakageGroupClusterBootstrapV1(input: {
  pairs: DisclosurePairedDiffV1[];
  groupIds: string[];
  count: number;
  seed: string;
}): { diffs: number[]; validFraction: number } {
  const byGroup = new Map<string, number[]>();
  for (const pair of input.pairs) byGroup.set(pair.leakageGroup, [...(byGroup.get(pair.leakageGroup) ?? []), pair.pairedDiff]);
  const seedNum = Array.from(input.seed).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rng = mulberry32(seedNum >>> 0);
  const diffs: number[] = [];
  let valid = 0;
  for (let i = 0; i < input.count; i++) {
    const sampled: string[] = [];
    for (let j = 0; j < input.groupIds.length; j++) sampled.push(input.groupIds[Math.floor(rng() * input.groupIds.length)]);
    const pool: number[] = [];
    for (const group of sampled) {
      const values = byGroup.get(group);
      if (values) pool.push(...values);
    }
    if (pool.length === 0) continue;
    valid += 1;
    diffs.push(pool.reduce((sum, v) => sum + v, 0) / pool.length);
  }
  return { diffs: diffs.sort((a, b) => a - b), validFraction: input.count ? valid / input.count : 0 };
}

// ---------------------------------------------------------------------------
// Screen status
// ---------------------------------------------------------------------------

export type DisclosureScreenStatusV1 =
  | "SCREEN_PASS"
  | "MECHANISM_STOP"
  | "QUALITY_STOP"
  | "DEFER";

export function decideDisclosureScreenStatusV1(input: {
  pairs: DisclosurePairedDiffV1[];
  groupIds: string[];
  bootstrap: { lower: number | null; upper: number | null; median: number | null; validFraction: number };
  deliveryObserved: boolean;
  uptakeMeasurable: boolean;
  uptakeHits: number;
  expectedPairCount: number;
}): DisclosureScreenStatusV1 {
  if (input.pairs.length !== input.expectedPairCount) return "DEFER";
  if (new Set(input.pairs.map(pair => pair.leakageGroup)).size !== input.groupIds.length) return "DEFER";
  if (input.bootstrap.validFraction < 0.95
    || input.bootstrap.lower === null
    || input.bootstrap.upper === null
    || input.bootstrap.median === null) return "DEFER";
  if (!input.deliveryObserved) return "MECHANISM_STOP";
  // Uptake is a descriptive mediator, not an authority gate. The randomized
  // treatment is disclosure delivery; exact content-hash hits can establish
  // verbatim uptake, but missing hits cannot rule out paraphrase or implicit use.
  const mean = input.pairs.reduce((sum, pair) => sum + pair.pairedDiff, 0) / input.pairs.length;
  if (mean >= 0) return "QUALITY_STOP";
  // Single-group-robustness: mean excluding the most-negative leakage group.
  const groupMeans = new Map<string, { sum: number; count: number }>();
  for (const pair of input.pairs) {
    const row = groupMeans.get(pair.leakageGroup) ?? { sum: 0, count: 0 };
    row.sum += pair.pairedDiff;
    row.count += 1;
    groupMeans.set(pair.leakageGroup, row);
  }
  const bestGroup = [...groupMeans.entries()].sort((a, b) => (a[1].sum / a[1].count) - (b[1].sum / b[1].count))[0]?.[0];
  const excludingBest = input.pairs.filter(pair => pair.leakageGroup !== bestGroup);
  if (excludingBest.length === 0) return "DEFER";
  const meanExcludingBest = excludingBest.reduce((sum, pair) => sum + pair.pairedDiff, 0) / excludingBest.length;
  if (meanExcludingBest >= 0) return "DEFER"; // negative only from one group -> not robust
  return "SCREEN_PASS";
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(): number {
  const plan = loadPlan();
  const outputDir = resolvedDisclosureConfig().outputDir;
  const lines: string[] = [];
  lines.push("=== v6 source-disclosure screen analysis (zero provider, read-only) ===");
  lines.push(`plan contentHash: ${plan.contentHash}`);
  if (!fs.existsSync(outputDir) || fs.readdirSync(outputDir).filter(f => f.endsWith(".raw-run.v5.json")).length === 0) {
    lines.push("status: DEFER (no disclosure-screen artifacts present; nothing to analyze)");
    console.log(lines.join("\n"));
    return 4;
  }
  assertDisclosureArtifactCompletenessV1(plan, outputDir);
  const artifacts = collectDisclosureArtifactsV1(plan, outputDir);
  const authority = verifyDisclosureAuthoritiesV1(plan, artifacts, outputDir);
  lines.push(`authority: replay=${authority.replayVerified}/${plan.totalRuns} publicContextCompliance=${authority.publicContextCompliance} sourceReplayConsistent=${authority.sourceReplayConsistent} sameBlockSourceConsistent=${authority.sameBlockSourceConsistent} verificationCallsZero=${authority.verificationCallsZero} callCountMatch=${authority.callCountMatch}`);
  const pairs = computePairedDifferencesV1(artifacts);
  const groupIds = plan.leakageGroups.map(group => group.groupId);
  const boot = leakageGroupClusterBootstrapV1({ pairs, groupIds, count: plan.analysisContract.bootstrapCount, seed: plan.contentHash });
  const lower = percentile(boot.diffs, 0.025);
  const upper = percentile(boot.diffs, 0.975);
  const median = percentile(boot.diffs, 0.5);
  const disclosureArtifacts = artifacts.filter(item => item.run.arm === "forced_source_disclosure");
  const deliveryObserved = disclosureArtifacts.every(item => item.publicContextHash === item.run.publicContextHash);
  const uptakeMeasurable = disclosureArtifacts.every(item => item.uptakeObservable);
  const uptakeHits = disclosureArtifacts.reduce((sum, item) => sum + item.uptakeHits, 0);
  const status = decideDisclosureScreenStatusV1({
    pairs,
    groupIds,
    bootstrap: { lower, upper, median, validFraction: boot.validFraction },
    deliveryObserved,
    uptakeMeasurable,
    uptakeHits,
    expectedPairCount: plan.totalRuns / 2,
  });
  const pairedMean = pairs.length ? pairs.reduce((sum, pair) => sum + pair.pairedDiff, 0) / pairs.length : null;
  lines.push(`pairs: ${pairs.length}/${plan.totalRuns / 2}`);
  lines.push(`paired mean (D-H, negative favors disclosure): ${pairedMean?.toFixed(4) ?? "n/a"}`);
  lines.push(`leakage-group bootstrap: median=${median?.toFixed(4) ?? "n/a"} 95%CI=[${lower?.toFixed(4) ?? "n/a"},${upper?.toFixed(4) ?? "n/a"}] validFraction=${boot.validFraction.toFixed(4)}`);
  lines.push(`delivery observed: ${deliveryObserved}; uptake (exact source-hash reference hits): ${uptakeHits} (${uptakeMeasurable ? "measurable" : "unobserved"})`);
  lines.push(`status: ${status}`);
  lines.push("claim ceiling: non-confirmatory mechanism screen; no effect-established / governance-effective claim");
  console.log(lines.join("\n"));
  return status === "SCREEN_PASS" || status === "QUALITY_STOP" || status === "MECHANISM_STOP" ? 0 : 4;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main();
}
