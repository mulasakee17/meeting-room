/**
 * Zero-provider audit of whether pre-action process state predicts collective
 * failure. The primary population is the unselected B arm from the frozen
 * 2026-08-12 verdict batch. G-arm holdouts are reported only as a secondary
 * protocol-shift check because holdout membership is eligibility-selected.
 *
 * The predictor never reads resolution, taskOutcome, finalOutcome, or
 * operationalOutcome while extracting features. Outcome fields are read only
 * after feature extraction.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { mulberry32 } from "../../../src/lib/utils/statsUtils";
import { verifyRawRunData } from "../replayVerifier";
import { createV6HiddenBenchSmokeFixtureV1 } from "./v6HiddenBenchSmokeFixture";
import { VERDICT_EXPLORATORY_PROFILE } from "./run_v6_verdict_exploratory";

export const PROCESS_STATE_FEATURE_NAMES = Object.freeze([
  "round1Coverage",
  "meanReportedCertainty",
  "meanPairwiseTotalVariation",
  "pooledTopTwoMargin",
] as const);

export type ProcessStateFeatureName = typeof PROCESS_STATE_FEATURE_NAMES[number];

export interface ProcessStateRowV1 {
  runId: string;
  taskId: number;
  protocol: "explicit_belief_v1" | "epistemic_governance_v1";
  arm: "no_action" | "holdout";
  features: Record<ProcessStateFeatureName, number>;
  finalPooledBrier: number;
  finalDecisionFailure: 0 | 1;
  finalDecisionStatus: string;
}

type ModelName = "constant" | "confidence_only" | "disagreement_only" | "process_state";

interface FittedRidge {
  means: number[];
  scales: number[];
  coefficients: number[];
}

export interface PredictionRowV1 extends ProcessStateRowV1 {
  predictions: Record<ModelName, number>;
}

export interface ModelSummaryV1 {
  mse: number;
  mae: number;
  failureAuRoc: number | null;
  outcomeCorrelation: number | null;
}

export interface PairedImprovementV1 {
  left: ModelName;
  right: ModelName;
  /** Positive means the left model has lower squared error. */
  mseImprovement: number;
  clusterBootstrap95: readonly [number | null, number | null];
}

const MODEL_FEATURES: Readonly<Record<Exclude<ModelName, "constant">, readonly ProcessStateFeatureName[]>> = Object.freeze({
  confidence_only: Object.freeze(["meanReportedCertainty"] as const),
  disagreement_only: Object.freeze(["meanPairwiseTotalVariation"] as const),
  process_state: PROCESS_STATE_FEATURE_NAMES,
});

const PRIMARY_ROOT = path.resolve(
  process.cwd(),
  "experiments/campaign/pilot_output/v6-verdict-exploratory-v1-20260812",
);
const SECONDARY_ROOTS = Object.freeze([
  PRIMARY_ROOT,
  path.resolve(process.cwd(), "experiments/campaign/pilot_output/v6-verdict-randomized-continuation-retry1-20260813"),
  path.resolve(process.cwd(), "experiments/campaign/pilot_output/v6-verdict-randomized-continuation-retry1-tail-20260813"),
  path.resolve(process.cwd(), "experiments/campaign/pilot_output/v6-verdict-randomized-continuation-retry1-background-20260813"),
]);

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`process_state_prediction_${label}_must_be_object`);
  }
  return value as Record<string, unknown>;
}

function requireFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`process_state_prediction_${label}_must_be_finite`);
  }
  return value;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error("process_state_prediction_mean_requires_values");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function categoricalVector(value: unknown, options: readonly string[]): number[] {
  const reportValue = requireRecord(value, "belief_value");
  if (reportValue.kind !== "categorical") throw new Error("process_state_prediction_requires_categorical_reports");
  const probabilities = requireRecord(reportValue.probabilities, "belief_probabilities");
  const keys = Object.keys(probabilities);
  if (keys.length !== options.length || options.some(option => !Object.hasOwn(probabilities, option))) {
    throw new Error("process_state_prediction_probability_coordinates_mismatch");
  }
  const vector = options.map(option => requireFinite(probabilities[option], `probability_${option}`));
  if (vector.some(valuePart => valuePart < 0 || valuePart > 1)
    || Math.abs(vector.reduce((sum, valuePart) => sum + valuePart, 0) - 1) > 1e-9) {
    throw new Error("process_state_prediction_invalid_probability_vector");
  }
  return vector;
}

function pairwiseTotalVariation(vectors: readonly number[][]): number {
  if (vectors.length < 2) return 0;
  const distances: number[] = [];
  for (let left = 0; left < vectors.length; left += 1) {
    for (let right = left + 1; right < vectors.length; right += 1) {
      distances.push(0.5 * vectors[left].reduce(
        (sum, value, index) => sum + Math.abs(value - vectors[right][index]),
        0,
      ));
    }
  }
  return mean(distances);
}

/** Extracts features without reading any post-discussion or evaluator field. */
export function extractPreActionProcessStateV1(raw: Record<string, unknown>): {
  runId: string;
  taskId: number;
  protocol: "explicit_belief_v1" | "epistemic_governance_v1";
  features: Record<ProcessStateFeatureName, number>;
} {
  const runId = typeof raw.runId === "string" ? raw.runId : "";
  if (!runId) throw new Error("process_state_prediction_run_id_required");
  const trace = requireRecord(raw.v6InteractionTrace, "interaction_trace");
  const protocol = trace.protocol;
  if (protocol !== "explicit_belief_v1" && protocol !== "epistemic_governance_v1") {
    throw new Error("process_state_prediction_protocol_not_admitted");
  }
  const taskManifest = requireRecord(raw.v6TaskManifest, "task_manifest");
  const manifestTaskId = typeof taskManifest.taskId === "string" ? taskManifest.taskId : "";
  const taskMatch = /^task:hiddenbench:(\d+)$/.exec(manifestTaskId);
  const taskId = taskMatch ? Number.parseInt(taskMatch[1], 10) : Number.NaN;
  if (!Number.isInteger(taskId)) throw new Error("process_state_prediction_task_id_must_be_integer");
  const expectedAgentIds = trace.expectedAgentIds;
  if (!Array.isArray(expectedAgentIds) || expectedAgentIds.length === 0
    || expectedAgentIds.some(agentId => typeof agentId !== "string" || !agentId)) {
    throw new Error("process_state_prediction_expected_roster_required");
  }
  const events = trace.epistemicEvents;
  if (!Array.isArray(events)) throw new Error("process_state_prediction_events_required");
  const claimEvent = events.find(event => requireRecord(event, "event").type === "claim_registered");
  const claim = requireRecord(requireRecord(claimEvent, "claim_event").claim, "claim");
  const options = claim.options;
  if (!Array.isArray(options) || options.length < 2 || options.some(option => typeof option !== "string" || !option)) {
    throw new Error("process_state_prediction_claim_options_required");
  }
  const optionStrings = options as string[];
  const roundOneReports = events.flatMap(event => {
    const record = requireRecord(event, "event");
    if (record.type !== "belief_reported") return [];
    const report = requireRecord(record.report, "belief_report");
    if (report.round !== 1) return [];
    if (typeof report.agentId !== "string" || !expectedAgentIds.includes(report.agentId)) {
      throw new Error("process_state_prediction_report_agent_outside_roster");
    }
    return [{ agentId: report.agentId, vector: categoricalVector(report.value, optionStrings) }];
  });
  if (new Set(roundOneReports.map(report => report.agentId)).size !== roundOneReports.length) {
    throw new Error("process_state_prediction_duplicate_round1_report");
  }
  if (roundOneReports.length === 0) throw new Error("process_state_prediction_no_round1_reports");
  const vectors = roundOneReports.map(report => report.vector);
  const pooled = optionStrings.map((_, index) => mean(vectors.map(vector => vector[index])));
  const orderedPooled = [...pooled].sort((left, right) => right - left);
  return {
    runId,
    taskId,
    protocol,
    features: {
      round1Coverage: roundOneReports.length / expectedAgentIds.length,
      meanReportedCertainty: mean(vectors.map(vector => Math.max(...vector))),
      meanPairwiseTotalVariation: pairwiseTotalVariation(vectors),
      pooledTopTwoMargin: orderedPooled[0] - orderedPooled[1],
    },
  };
}

export function createProcessStateRowV1(raw: Record<string, unknown>, arm: "no_action" | "holdout"): ProcessStateRowV1 {
  // Deliberately evaluate pre-action features before opening outcome objects.
  const state = extractPreActionProcessStateV1(raw);
  const operational = requireRecord(raw.operationalOutcome, "operational_outcome");
  const primaryMetric = requireRecord(operational.primaryMetric, "primary_metric");
  const finalOutcome = requireRecord(raw.finalOutcome, "final_outcome");
  const claimOutcomes = finalOutcome.claimOutcomes;
  if (!Array.isArray(claimOutcomes) || claimOutcomes.length !== 1) {
    throw new Error("process_state_prediction_requires_one_final_claim_outcome");
  }
  const claimOutcome = requireRecord(claimOutcomes[0], "final_claim_outcome");
  const pooledDecision = requireRecord(claimOutcome.pooledDecision, "pooled_decision");
  if (claimOutcome.pooledDecisionMatchesResolution !== null
    && typeof claimOutcome.pooledDecisionMatchesResolution !== "boolean") {
    throw new Error("process_state_prediction_final_decision_label_required");
  }
  return {
    ...state,
    arm,
    finalPooledBrier: requireFinite(primaryMetric.value, "final_pooled_brier"),
    // Contract-defined abstention/tie has a null match label. It is retained
    // as unresolved failure for the auxiliary endpoint and reported by status.
    finalDecisionFailure: claimOutcome.pooledDecisionMatchesResolution === true ? 0 : 1,
    finalDecisionStatus: typeof pooledDecision.status === "string" ? pooledDecision.status : "unknown",
  };
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) throw new Error("process_state_prediction_singular_design");
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map(row => row[size]);
}

function fitRidge(rows: readonly ProcessStateRowV1[], features: readonly ProcessStateFeatureName[]): FittedRidge {
  if (rows.length <= features.length + 1) throw new Error("process_state_prediction_insufficient_training_rows");
  const means = features.map(feature => mean(rows.map(row => row.features[feature])));
  const scales = features.map((feature, index) => {
    const variance = mean(rows.map(row => (row.features[feature] - means[index]) ** 2));
    return variance > 1e-12 ? Math.sqrt(variance) : 1;
  });
  const design = rows.map(row => [1, ...features.map((feature, index) => (
    row.features[feature] - means[index]
  ) / scales[index])]);
  const outcomes = rows.map(row => row.finalPooledBrier);
  const size = features.length + 1;
  const gram = Array.from({ length: size }, (_, left) => Array.from({ length: size }, (_, right) => (
    design.reduce((sum, designRow) => sum + designRow[left] * designRow[right], 0)
      + (left === right && left > 0 ? 1 : 0)
  )));
  const cross = Array.from({ length: size }, (_, column) => (
    design.reduce((sum, designRow, index) => sum + designRow[column] * outcomes[index], 0)
  ));
  return { means, scales, coefficients: solveLinearSystem(gram, cross) };
}

function predictRidge(
  fitted: FittedRidge,
  row: ProcessStateRowV1,
  features: readonly ProcessStateFeatureName[],
): number {
  return fitted.coefficients[0] + features.reduce((sum, feature, index) => (
    sum + fitted.coefficients[index + 1] * (row.features[feature] - fitted.means[index]) / fitted.scales[index]
  ), 0);
}

export function taskHeldOutPredictionsV1(rows: readonly ProcessStateRowV1[]): PredictionRowV1[] {
  const taskIds = [...new Set(rows.map(row => row.taskId))].sort((left, right) => left - right);
  if (taskIds.length < 3) throw new Error("process_state_prediction_requires_task_clusters");
  const predictions: PredictionRowV1[] = [];
  for (const taskId of taskIds) {
    const train = rows.filter(row => row.taskId !== taskId);
    const test = rows.filter(row => row.taskId === taskId);
    const constant = mean(train.map(row => row.finalPooledBrier));
    const fitted = Object.fromEntries(Object.entries(MODEL_FEATURES).map(([name, features]) => [
      name,
      fitRidge(train, features),
    ])) as Record<Exclude<ModelName, "constant">, FittedRidge>;
    for (const row of test) {
      predictions.push({
        ...row,
        predictions: {
          constant,
          confidence_only: predictRidge(fitted.confidence_only, row, MODEL_FEATURES.confidence_only),
          disagreement_only: predictRidge(fitted.disagreement_only, row, MODEL_FEATURES.disagreement_only),
          process_state: predictRidge(fitted.process_state, row, MODEL_FEATURES.process_state),
        },
      });
    }
  }
  return predictions.sort((left, right) => left.runId.localeCompare(right.runId));
}

function pearson(left: readonly number[], right: readonly number[]): number | null {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = mean(left);
  const rightMean = mean(right);
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const denominator = Math.sqrt(
    left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0)
      * right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0),
  );
  return denominator > 0 ? numerator / denominator : null;
}

function auRoc(scores: readonly number[], labels: readonly (0 | 1)[]): number | null {
  const positives = labels.filter(label => label === 1).length;
  const negatives = labels.length - positives;
  if (positives === 0 || negatives === 0) return null;
  let favorable = 0;
  for (let positive = 0; positive < labels.length; positive += 1) {
    if (labels[positive] !== 1) continue;
    for (let negative = 0; negative < labels.length; negative += 1) {
      if (labels[negative] !== 0) continue;
      if (scores[positive] > scores[negative]) favorable += 1;
      else if (scores[positive] === scores[negative]) favorable += 0.5;
    }
  }
  return favorable / (positives * negatives);
}

function percentile(sorted: readonly number[], probability: number): number | null {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function pairedImprovement(
  rows: readonly PredictionRowV1[],
  left: ModelName,
  right: ModelName,
  seedText: string,
): PairedImprovementV1 {
  const improvement = (row: PredictionRowV1) => (
    (row.predictions[right] - row.finalPooledBrier) ** 2
      - (row.predictions[left] - row.finalPooledBrier) ** 2
  );
  const taskIds = [...new Set(rows.map(row => row.taskId))].sort((a, b) => a - b);
  const observed = mean(rows.map(improvement));
  const seed = Number.parseInt(createHash("sha256").update(seedText).digest("hex").slice(0, 8), 16);
  const rng = mulberry32(seed >>> 0);
  const draws: number[] = [];
  for (let iteration = 0; iteration < 10_000; iteration += 1) {
    const sampled = Array.from({ length: taskIds.length }, () => taskIds[Math.floor(rng() * taskIds.length)]);
    const values = sampled.flatMap(taskId => rows.filter(row => row.taskId === taskId).map(improvement));
    draws.push(mean(values));
  }
  draws.sort((a, b) => a - b);
  return {
    left,
    right,
    mseImprovement: observed,
    clusterBootstrap95: [percentile(draws, 0.025), percentile(draws, 0.975)],
  };
}

export function summarizeTaskHeldOutPredictionV1(rows: readonly PredictionRowV1[]): {
  runCount: number;
  taskClusterCount: number;
  finalDecisionFailures: number;
  models: Record<ModelName, ModelSummaryV1>;
  comparisons: PairedImprovementV1[];
  gate: { status: "GO" | "DEFER"; reasons: string[] };
} {
  const names: ModelName[] = ["constant", "confidence_only", "disagreement_only", "process_state"];
  const models = Object.fromEntries(names.map(name => {
    const predictions = rows.map(row => row.predictions[name]);
    const outcomes = rows.map(row => row.finalPooledBrier);
    return [name, {
      mse: mean(rows.map(row => (row.predictions[name] - row.finalPooledBrier) ** 2)),
      mae: mean(rows.map(row => Math.abs(row.predictions[name] - row.finalPooledBrier))),
      // Cross-fold intercepts vary because each held-out task changes the
      // training mean. They are a valid squared-error baseline but not a
      // meaningful ranking score.
      failureAuRoc: name === "constant" ? null : auRoc(predictions, rows.map(row => row.finalDecisionFailure)),
      outcomeCorrelation: name === "constant" ? null : pearson(predictions, outcomes),
    }];
  })) as Record<ModelName, ModelSummaryV1>;
  const comparisons = [
    pairedImprovement(rows, "confidence_only", "constant", "confidence-v-constant-v1"),
    pairedImprovement(rows, "disagreement_only", "constant", "disagreement-v-constant-v1"),
    pairedImprovement(rows, "process_state", "constant", "process-v-constant-v1"),
    pairedImprovement(rows, "process_state", "confidence_only", "process-v-confidence-v1"),
    pairedImprovement(rows, "process_state", "disagreement_only", "process-v-disagreement-v1"),
  ];
  const reasons: string[] = [];
  const taskClusterCount = new Set(rows.map(row => row.taskId)).size;
  if (rows.length < 30) reasons.push("run_count_below_30");
  if (taskClusterCount < 15) reasons.push("task_clusters_below_15");
  for (const comparison of comparisons.filter(item => item.left === "process_state")) {
    if (!(comparison.mseImprovement > 0)) reasons.push(`no_point_improvement_vs_${comparison.right}`);
    const lower = comparison.clusterBootstrap95[0];
    if (lower === null || lower <= 0) reasons.push(`uncertain_improvement_vs_${comparison.right}`);
  }
  return {
    runCount: rows.length,
    taskClusterCount,
    finalDecisionFailures: rows.filter(row => row.finalDecisionFailure === 1).length,
    models,
    comparisons,
    gate: { status: reasons.length === 0 ? "GO" : "DEFER", reasons },
  };
}

function armOf(raw: Record<string, unknown>): "apply" | "sham" | "holdout" | "ineligible" {
  const trail = requireRecord(raw.governanceAuditTrail, "governance_audit_trail");
  const transitions = Array.isArray(trail.actionTransitions)
    ? trail.actionTransitions.map(item => requireRecord(item, "action_transition").to)
    : [];
  if (transitions.includes("held_out")) return "holdout";
  if (!transitions.includes("assigned")) return "ineligible";
  const instances = Array.isArray(trail.actionInstances) ? trail.actionInstances : [];
  const first = instances.length ? requireRecord(instances[0], "action_instance") : {};
  const actionRef = first.actionRef ? requireRecord(first.actionRef, "action_ref") : {};
  return actionRef.id === "swarmalpha.action.verification-attention-sham" ? "sham" : "apply";
}

function readVerified(file: string): Record<string, unknown> {
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  const state = extractPreActionProcessStateV1(raw);
  const fixture = createV6HiddenBenchSmokeFixtureV1({
    sourceTaskId: state.taskId,
    profile: VERDICT_EXPLORATORY_PROFILE,
  });
  const replay = verifyRawRunData(file, raw, { governanceRules: [fixture.rule] });
  if (replay.runIssues.length > 0 || replay.governanceAuditStatus !== "sealed_decision_replay_verified") {
    throw new Error(`process_state_prediction_replay_failed:${state.runId}:${replay.runIssues.map(issue => issue.code).join(",")}`);
  }
  return raw;
}

function rawFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter(name => name.endsWith(".raw-run.v5.json"))
    .map(name => path.join(root, name))
    .sort();
}

function loadPrimaryRows(): ProcessStateRowV1[] {
  return rawFiles(PRIMARY_ROOT).flatMap(file => {
    const raw = readVerified(file);
    const trace = requireRecord(raw.v6InteractionTrace, "interaction_trace");
    return trace.protocol === "explicit_belief_v1" ? [createProcessStateRowV1(raw, "no_action")] : [];
  });
}

function loadSecondaryHoldouts(): ProcessStateRowV1[] {
  const seen = new Set<string>();
  const rows: ProcessStateRowV1[] = [];
  for (const root of SECONDARY_ROOTS) {
    for (const file of rawFiles(root)) {
      const raw = readVerified(file);
      if (requireRecord(raw.v6InteractionTrace, "interaction_trace").protocol !== "epistemic_governance_v1") continue;
      if (armOf(raw) !== "holdout") continue;
      const runId = raw.runId as string;
      if (seen.has(runId)) throw new Error(`process_state_prediction_duplicate_run:${runId}`);
      seen.add(runId);
      rows.push(createProcessStateRowV1(raw, "holdout"));
    }
  }
  return rows.sort((left, right) => left.runId.localeCompare(right.runId));
}

function fitFullModels(primary: readonly ProcessStateRowV1[]): {
  constant: number;
  fitted: Record<Exclude<ModelName, "constant">, FittedRidge>;
} {
  return {
    constant: mean(primary.map(row => row.finalPooledBrier)),
    fitted: Object.fromEntries(Object.entries(MODEL_FEATURES).map(([name, features]) => [
      name,
      fitRidge(primary, features),
    ])) as Record<Exclude<ModelName, "constant">, FittedRidge>,
  };
}

function scoreSecondary(
  primary: readonly ProcessStateRowV1[],
  secondary: readonly ProcessStateRowV1[],
): ReturnType<typeof summarizeTaskHeldOutPredictionV1>["models"] | null {
  if (secondary.length === 0) return null;
  const full = fitFullModels(primary);
  const predictionRows: PredictionRowV1[] = secondary.map(row => ({
    ...row,
    predictions: {
      constant: full.constant,
      confidence_only: predictRidge(full.fitted.confidence_only, row, MODEL_FEATURES.confidence_only),
      disagreement_only: predictRidge(full.fitted.disagreement_only, row, MODEL_FEATURES.disagreement_only),
      process_state: predictRidge(full.fitted.process_state, row, MODEL_FEATURES.process_state),
    },
  }));
  return summarizeTaskHeldOutPredictionV1(predictionRows).models;
}

export function runProcessStateFailurePredictionAuditV1(): Record<string, unknown> {
  const primary = loadPrimaryRows();
  const crossfit = taskHeldOutPredictionsV1(primary);
  const primarySummary = summarizeTaskHeldOutPredictionV1(crossfit);
  const secondary = loadSecondaryHoldouts();
  return {
    auditSchemaRef: { id: "swarmalpha.analysis.process-state-failure-prediction", version: "1.0.0" },
    featureTiming: "round_1_before_any_governance_action",
    outcomeTiming: "post_discussion_independent_final_elicitation",
    truthUse: "offline_outcome_scoring_only",
    primaryPopulation: "unselected_explicit_belief_B_arm",
    featureNames: PROCESS_STATE_FEATURE_NAMES,
    ridgeLambda: 1,
    validation: "leave_one_task_cluster_out",
    primary: primarySummary,
    secondaryProtocolShift: {
      population: "eligibility_selected_G_holdout_only",
      runCount: secondary.length,
      taskClusterCount: new Set(secondary.map(row => row.taskId)).size,
      models: scoreSecondary(primary, secondary),
      interpretation: "descriptive_transport_check_not_a_gate",
    },
    claimCeiling: "existing-artifact predictive audit only; no selective-policy or governance-effect claim",
  };
}

function main(): void {
  console.log(JSON.stringify(runProcessStateFailurePredictionAuditV1(), null, 2));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
