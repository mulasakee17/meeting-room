/**
 * V6 Cross-Evidence-Exchange mechanism screen — primary analysis (read-only,
 * zero provider).
 *
 * Primary estimand (frozen 2026-08-15): ITT mean final pooled Brier of the
 * governance arm minus the no-governance arm, across the frozen 8-task x 2-block
 * plan. Lower Brier is better, so a negative ITT favors governance. The
 * governance arm applies the disagreement rule; eligible runs then draw
 * exchange/holdout under the frozen (non-searched) eligible-event seed. The
 * no-governance arm is always-ineligible.
 *
 * Boundaries:
 *  - every raw-run is replay-verified with the arm-correct governance rule;
 *  - task-cluster bootstrap treats each task as the resampling unit;
 *  - the project's frozen defer gate (from the verdict task-heldout replication)
 *    is applied to the GOV-vs-NG contrast with "apply"->"governance" and
 *    "holdout"->"no-governance"; DEFER reasons are reported verbatim.
 *
 * No runtime, schema, prompt, task, plan, or artifact is modified.
 */

import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
import { verifyRawRunData } from "../replayVerifier";
import { resolveV6AuditableRawRunPath } from "./productionVerticalSlice";
import {
  buildCrossEvidenceExchangePlanV1,
  CROSS_EVIDENCE_EXCHANGE_OUTPUT_DIR,
  CROSS_EVIDENCE_EXCHANGE_TASK_IDS,
  type CrossEvidenceExchangePlanV1,
} from "./run_v6_cross_evidence_exchange";
import {
  createAlwaysIneligibleExchangeRuleV1,
  createDisagreementExchangeRuleV1,
} from "./disagreementExchangeGovernanceV1";
import {
  evaluateTaskHeldoutDeferV1,
  taskClusterDifferenceBootstrap,
} from "./analyze_v6_verdict_task_heldout_replication";

const BOOTSTRAP_COUNT = 20_000;

type GovSubArm = "exchange" | "holdout" | "ineligible";
type Arm = GovSubArm | "no_governance";

interface RunRecord {
  runId: string;
  taskId: number;
  governanceArm: "governance" | "no_governance";
  arm: Arm;
  brier: number | null;
  accuracy: number | null;
  tokens: number;
  invalidOrFailed: number;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function percentile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}

function actionTransitionsOf(artifact: Record<string, unknown>): string[] {
  const trail = artifact.governanceAuditTrail as Record<string, unknown>;
  return (((trail.actionTransitions as Array<Record<string, unknown>>) ?? []).map(t => String((t as { to?: unknown }).to)));
}

function sourceEventIdsOf(artifact: Record<string, unknown>): string[] {
  const trail = artifact.governanceAuditTrail as Record<string, unknown>;
  return (((trail.sourceEvents as Array<Record<string, unknown>>) ?? []).map(e => String(((e.eventRef as { id?: unknown } | undefined)?.id) ?? "")));
}

function firstDecisionOutcomeOf(artifact: Record<string, unknown>): string {
  const trail = artifact.governanceAuditTrail as Record<string, unknown>;
  const decisions = (trail.decisions as Array<Record<string, unknown>>) ?? [];
  return decisions.length ? String((decisions[0] as { outcome?: unknown }).outcome) : "none";
}

/** Classify a governance-arm run: exchange / holdout / ineligible. */
function classifyGovArm(artifact: Record<string, unknown>): GovSubArm {
  const outcome = firstDecisionOutcomeOf(artifact);
  if (outcome === "no_eligible_action") return "ineligible";
  const transitions = actionTransitionsOf(artifact);
  if (transitions.includes("held_out")) return "holdout";
  if (sourceEventIdsOf(artifact).some(id => id.includes("cross-evidence-exchange"))) return "exchange";
  throw new Error(`governance run ${String(artifact.runId)} has no exchange/holdout/ineligible classification (outcome=${outcome})`);
}

function loadRuns(plan: CrossEvidenceExchangePlanV1): { runs: RunRecord[]; qualityIssues: string[] } {
  const runs: RunRecord[] = [];
  const qualityIssues: string[] = [];
  for (const run of plan.runs) {
    const file = resolveV6AuditableRawRunPath(CROSS_EVIDENCE_EXCHANGE_OUTPUT_DIR, run.runId);
    if (!fs.existsSync(file)) { qualityIssues.push(`missing:${run.runId}`); continue; }
    const artifact = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    const rule = run.governanceArm === "governance"
      ? createDisagreementExchangeRuleV1()
      : createAlwaysIneligibleExchangeRuleV1();
    const replay = verifyRawRunData(file, artifact, { governanceRules: [rule] });
    if (replay.runIssues.length > 0 || replay.governanceAuditStatus !== "sealed_decision_replay_verified") {
      qualityIssues.push(`${run.runId}: ${replay.governanceAuditStatus} ${replay.runIssues.map(i => i.code).join(",")}`);
      continue;
    }
    const arm: Arm = run.governanceArm === "governance" ? classifyGovArm(artifact) : "no_governance";
    // Firewall check: the no-governance arm must never have fired the exchange.
    if (arm === "no_governance"
      && (actionTransitionsOf(artifact).includes("assigned")
        || sourceEventIdsOf(artifact).some(id => id.includes("cross-evidence-exchange")))) {
      qualityIssues.push(`${run.runId}: no-governance run fired an action`);
      continue;
    }
    const operational = artifact.operationalOutcome as Record<string, unknown> | undefined;
    const brier = typeof (operational?.primaryMetric as { value?: unknown } | undefined)?.value === "number"
      ? (operational!.primaryMetric as { value: number }).value
      : null;
    const taskOutcome = artifact.taskOutcome as Record<string, unknown> | undefined;
    const accuracy = typeof taskOutcome?.quality === "number" ? taskOutcome.quality as number : null;
    const tokens = typeof (taskOutcome?.cost as Record<string, number> | undefined)?.totalTokens === "number"
      ? (taskOutcome!.cost as Record<string, number>).totalTokens
      : 0;
    const invalidOrFailed = typeof (taskOutcome?.cost as Record<string, number> | undefined)?.invalidOrFailed === "number"
      ? (taskOutcome!.cost as Record<string, number>).invalidOrFailed
      : 0;
    runs.push({ runId: run.runId, taskId: run.taskId, governanceArm: run.governanceArm, arm, brier, accuracy, tokens, invalidOrFailed });
  }
  return { runs, qualityIssues };
}

function main(): number {
  const plan = buildCrossEvidenceExchangePlanV1(CROSS_EVIDENCE_EXCHANGE_TASK_IDS);
  const { runs, qualityIssues } = loadRuns(plan);
  const lines: string[] = [];
  lines.push("=== v6 cross-evidence-exchange mechanism screen analysis (read-only) ===");
  lines.push(`plan contentHash: ${plan.contentHash}`);
  lines.push(`planned runs: ${plan.totalRuns}; loaded: ${runs.length}; qualityIssues: ${qualityIssues.length}`);

  if (qualityIssues.length > 0) {
    lines.push("QUALITY STOP — authority/replay/firewall failure:");
    for (const issue of qualityIssues) lines.push(`  ${issue}`);
    console.log(lines.join("\n"));
    return 4;
  }

  const gov = runs.filter(r => r.governanceArm === "governance");
  const ng = runs.filter(r => r.governanceArm === "no_governance");
  const exchange = gov.filter(r => r.arm === "exchange");
  const holdout = gov.filter(r => r.arm === "holdout");
  const govIneligible = gov.filter(r => r.arm === "ineligible");

  lines.push(`arm n: governance=${gov.length} (exchange=${exchange.length} holdout=${holdout.length} ineligible=${govIneligible.length}) no_governance=${ng.length}`);

  // Primary ITT: governance vs no-governance (all assigned runs, incl. ineligible).
  const govBriers = gov.filter(r => r.brier !== null).map(r => r.brier as number);
  const ngBriers = ng.filter(r => r.brier !== null).map(r => r.brier as number);
  const naiveITT = mean(govBriers) !== null && mean(ngBriers) !== null ? mean(govBriers)! - mean(ngBriers)! : null;
  const govClusters = new Set(gov.map(r => r.taskId)).size;
  const ngClusters = new Set(ng.map(r => r.taskId)).size;

  const boot = taskClusterDifferenceBootstrap(
    gov.filter(r => r.brier !== null).map(r => ({ taskId: r.taskId, brier: r.brier as number })),
    ng.filter(r => r.brier !== null).map(r => ({ taskId: r.taskId, brier: r.brier as number })),
    plan.taskIds,
    BOOTSTRAP_COUNT,
    plan.contentHash,
  );
  const lower = percentile(boot.diffs, 0.025);
  const upper = percentile(boot.diffs, 0.975);
  const bootMedian = percentile(boot.diffs, 0.5);

  lines.push(`primary ITT (mean GOV - mean NG, lower favors governance):`);
  lines.push(`  GOV mean Brier=${mean(govBriers)?.toFixed(4) ?? "n/a"} (n=${govBriers.length}, clusters=${govClusters})`);
  lines.push(`  NG  mean Brier=${mean(ngBriers)?.toFixed(4) ?? "n/a"} (n=${ngBriers.length}, clusters=${ngClusters})`);
  lines.push(`  point estimate=${naiveITT?.toFixed(4) ?? "n/a"}`);
  lines.push(`  bootstrap median=${bootMedian?.toFixed(4) ?? "n/a"} 95%CI=[${lower?.toFixed(4) ?? "n/a"}, ${upper?.toFixed(4) ?? "n/a"}] validFraction=${boot.validFraction.toFixed(4)}`);

  const deferReasons = evaluateTaskHeldoutDeferV1({
    missingRuns: plan.totalRuns - runs.length,
    applyN: govBriers.length,
    holdoutN: ngBriers.length,
    applyTaskClusters: govClusters,
    holdoutTaskClusters: ngClusters,
    bootstrapValidFraction: boot.validFraction,
    naiveEffect: naiveITT,
    bootstrapUpper: upper,
  });
  lines.push(`  DEFER reasons: ${deferReasons.length ? deferReasons.join("; ") : "none"}`);

  // Mechanism decomposition (exploratory; no separate inference authority).
  const mechanism = (label: string, list: RunRecord[]) => {
    const briers = list.filter(r => r.brier !== null).map(r => r.brier as number);
    const accs = list.filter(r => r.accuracy !== null).map(r => r.accuracy as number);
    const tokens = list.reduce((s, r) => s + r.tokens, 0);
    const invalid = list.reduce((s, r) => s + r.invalidOrFailed, 0);
    lines.push(`  ${label}: n=${list.length} meanBrier=${mean(briers)?.toFixed(4) ?? "n/a"} meanAccuracy=${mean(accs)?.toFixed(4) ?? "n/a"} tokens=${tokens} invalidOrFailed=${invalid}`);
  };
  lines.push("mechanism decomposition (exploratory):");
  mechanism("exchange   ", exchange);
  mechanism("holdout    ", holdout);
  mechanism("govInelig  ", govIneligible);
  mechanism("noGovern   ", ng);

  // Per-task ITT (descriptive; tiny n per task).
  const byTask = new Map<number, { gov: number[]; ng: number[] }>();
  for (const r of runs) {
    if (r.brier === null) continue;
    const bucket = byTask.get(r.taskId) ?? { gov: [], ng: [] };
    (r.governanceArm === "governance" ? bucket.gov : bucket.ng).push(r.brier);
    byTask.set(r.taskId, bucket);
  }
  const taskRows = [...byTask.entries()].sort((a, b) => a[0] - b[0]).map(([tid, b]) => {
    const g = mean(b.gov); const n = mean(b.ng);
    return `task${tid}: GOV=${g?.toFixed(3) ?? "n/a"} NG=${n?.toFixed(3) ?? "n/a"} diff=${(g !== null && n !== null ? g - n : null)?.toFixed(3) ?? "n/a"}`;
  });
  lines.push(`per-task GOV-NG Brier (descriptive): ${taskRows.join(" | ")}`);

  // Gate adjudication (matrix §4 verbs, using the frozen support thresholds).
  const passed = deferReasons.length === 0;
  let status: string;
  if (exchange.length === 0) {
    status = "MECHANISM STOP — no governance run drew exchange; mechanism never fired";
  } else if (passed) {
    status = "SCREEN PASS — negative ITT with 95% CI excluding 0";
  } else {
    status = "DEFER — insufficient support/uncertainty";
  }
  lines.push(`gate: ${status}`);

  console.log(lines.join("\n"));
  return passed ? 0 : 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main();
}
