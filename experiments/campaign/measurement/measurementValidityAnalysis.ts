/**
 * Measurement Validity v1 — deterministic analysis kernel (WP3).
 *
 * Pure functions only. Statistical discipline (protocol §4.2, §7):
 * paired estimands first, equal weight within and between clusters, the
 * primary bootstrap unit is the leakage/base-task cluster, and
 * Agent/replicate/variant count never inflates a task's weight.
 */

import { scoreBeliefReport } from "../../../src/lib/epistemic/scoring";
import type { BeliefValue, ClaimResolution, EpistemicClaim } from "../../../src/lib/epistemic";
import { mulberry32 } from "../../../src/lib/utils/statsUtils";
import { validateMeasurementValidityFreezeV1, type MeasurementValidityFreezeV1 } from "./measurementValidity";

export interface ProbabilityEntryV1 {
  option: string;
  probability: number;
}

/** Unified probability-vector validator: non-empty, unique options, finite [0,1], sums to 1. */
export function validateProbabilityVectorV1(probabilities: ReadonlyArray<ProbabilityEntryV1>, field = "probability vector"): void {
  if (!Array.isArray(probabilities) || probabilities.length === 0) throw new Error(`${field} must be non-empty`);
  const options = new Set<string>();
  let total = 0;
  for (const entry of probabilities) {
    if (typeof entry.option !== "string" || entry.option.trim().length === 0) throw new Error(`${field} option must be non-empty`);
    if (options.has(entry.option)) throw new Error(`${field} options must be unique`);
    options.add(entry.option);
    if (typeof entry.probability !== "number" || !Number.isFinite(entry.probability) || entry.probability < 0 || entry.probability > 1) {
      throw new Error(`${field} probability must be finite within [0,1]`);
    }
    total += entry.probability;
  }
  if (Math.abs(total - 1) > 1e-9) throw new Error(`${field} probabilities must sum to 1`);
}

/** Require two probability vectors to share exactly the same canonical option set. */
export function validatePairOptionSetsV1(left: ReadonlyArray<ProbabilityEntryV1>, right: ReadonlyArray<ProbabilityEntryV1>, field = "pair"): void {
  const leftOptions = new Set(left.map(entry => entry.option));
  const rightOptions = new Set(right.map(entry => entry.option));
  if (leftOptions.size !== rightOptions.size || [...leftOptions].some(option => !rightOptions.has(option))) {
    throw new Error(`${field} probability vectors must share exactly the same canonical option set`);
  }
}

export interface CoverageV1 {
  terminalCoverage: number;
  validCoverage: number;
  terminalCounts: Record<string, number>;
}

export function computeCoverageV1(input: { registeredRequests: number; terminalStatuses: ReadonlyArray<string>; validStatuses: ReadonlyArray<string> }): CoverageV1 {
  if (!Number.isSafeInteger(input.registeredRequests) || input.registeredRequests <= 0) throw new Error("registeredRequests must be a positive safe integer");
  if (input.terminalStatuses.length !== input.registeredRequests) throw new Error("terminal statuses must have exactly one per registered request");
  const terminalCounts: Record<string, number> = {};
  let valid = 0;
  for (const status of input.terminalStatuses) {
    terminalCounts[status] = (terminalCounts[status] ?? 0) + 1;
    if (input.validStatuses.includes(status)) valid += 1;
  }
  return { terminalCoverage: input.terminalStatuses.length / input.registeredRequests, validCoverage: valid / input.registeredRequests, terminalCounts };
}

export function computePairCoverageV1(input: { registeredPairs: number; completePairs: number }): number {
  if (!Number.isSafeInteger(input.registeredPairs) || input.registeredPairs <= 0) throw new Error("registeredPairs must be a positive safe integer");
  if (!Number.isSafeInteger(input.completePairs) || input.completePairs < 0 || input.completePairs > input.registeredPairs) throw new Error("completePairs must be within [0, registeredPairs]");
  return input.completePairs / input.registeredPairs;
}

/** Base-2 Jensen–Shannon distance; zero-probability terms by information-theoretic limit. */
export function jsdBase2V1(p: ReadonlyArray<number>, q: ReadonlyArray<number>): number {
  if (p.length !== q.length) throw new Error("JSD requires equal-length probability vectors");
  for (const v of [...p, ...q]) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) throw new Error("JSD requires finite probabilities within [0,1]");
  }
  const m = p.map((pv, i) => 0.5 * (pv + q[i]));
  const kl = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === 0) continue;
      sum += a[i] * Math.log2(a[i] / b[i]);
    }
    return sum;
  };
  return 0.5 * kl(p, m) + 0.5 * kl(q, m);
}

/** Total variation: 0.5 * Σ|Δ| (protocol §6.3). */
export function totalVariationV1(p: ReadonlyArray<number>, q: ReadonlyArray<number>): number {
  if (p.length !== q.length) throw new Error("TV requires equal-length probability vectors");
  let sum = 0;
  for (let i = 0; i < p.length; i++) {
    if (!Number.isFinite(p[i]) || !Number.isFinite(q[i])) throw new Error("TV requires finite probabilities");
    sum += Math.abs(p[i] - q[i]);
  }
  return 0.5 * sum;
}

/** Tie-aware argmax set: all options with the maximal probability, never order-broken. */
export function argmaxSetV1(probabilities: ReadonlyArray<ProbabilityEntryV1>): string[] {
  if (probabilities.length === 0) throw new Error("argmax requires a non-empty option set");
  const maximum = Math.max(...probabilities.map(entry => entry.probability));
  return probabilities.filter(entry => entry.probability === maximum).map(entry => entry.option).sort();
}

/** Exact set equality: 1 when the argmax sets are identical, else 0. */
export function argmaxSetAgreementV1(a: ReadonlyArray<string>, b: ReadonlyArray<string>): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return 0;
  for (const item of setA) if (!setB.has(item)) return 0;
  return 1;
}

function percentileSorted(sorted: ReadonlyArray<number>, fraction: number): number {
  if (sorted.length === 0) throw new Error("percentile requires a non-empty sample");
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}
function median(sorted: ReadonlyArray<number>): number {
  if (sorted.length === 0) throw new Error("median requires a non-empty sample");
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

export function paraphraseStabilityV1(input: { pairs: ReadonlyArray<{ left: ReadonlyArray<ProbabilityEntryV1>; right: ReadonlyArray<ProbabilityEntryV1> }> }): {
  medianJsd: number; p90Jsd: number; argmaxAgreement: number;
} {
  const jsds: number[] = [];
  let agreements = 0;
  for (const pair of input.pairs) {
    validateProbabilityVectorV1(pair.left, "paraphrase pair left");
    validateProbabilityVectorV1(pair.right, "paraphrase pair right");
    validatePairOptionSetsV1(pair.left, pair.right, "paraphrase pair");
    jsds.push(jsdBase2V1(pair.left.map(x => x.probability), pair.right.map(x => x.probability)));
    agreements += argmaxSetAgreementV1(argmaxSetV1(pair.left), argmaxSetV1(pair.right));
  }
  const sorted = [...jsds].sort((a, b) => a - b);
  return { medianJsd: median(sorted), p90Jsd: percentileSorted(sorted, 0.9), argmaxAgreement: input.pairs.length === 0 ? 1 : agreements / input.pairs.length };
}

export function optionEquivarianceV1(input: { pairs: ReadonlyArray<{
  base: ReadonlyArray<ProbabilityEntryV1>;
  variant: ReadonlyArray<ProbabilityEntryV1>;
  optionMap: Record<string, string>;
}> }): { medianTv: number; p90Tv: number; argmaxAgreement: number } {
  const tvs: number[] = [];
  let agreements = 0;
  for (const pair of input.pairs) {
    validateProbabilityVectorV1(pair.base, "equivariance base");
    validateProbabilityVectorV1(pair.variant, "equivariance variant");
    const baseOptions = new Set(pair.base.map(x => x.option));
    const remapped = pair.variant.map(entry => {
      if (!Object.prototype.hasOwnProperty.call(pair.optionMap, entry.option)) throw new Error("option equivariance mapping is missing a variant option (mapping drift)");
      const canonical = pair.optionMap[entry.option];
      if (!baseOptions.has(canonical)) throw new Error("option equivariance mapping drifts to a non-canonical base option");
      return { option: canonical, probability: entry.probability };
    });
    // Per-pair option-set equality (no cross-pair union allowed).
    validatePairOptionSetsV1(pair.base, remapped, "equivariance pair");
    const baseSorted = [...pair.base].sort((a, b) => a.option.localeCompare(b.option));
    const remapSorted = [...remapped].sort((a, b) => a.option.localeCompare(b.option));
    tvs.push(totalVariationV1(baseSorted.map(x => x.probability), remapSorted.map(x => x.probability)));
    agreements += argmaxSetAgreementV1(argmaxSetV1(baseSorted), argmaxSetV1(remapSorted));
  }
  const sorted = [...tvs].sort((a, b) => a - b);
  return { medianTv: median(sorted), p90Tv: percentileSorted(sorted, 0.9), argmaxAgreement: input.pairs.length === 0 ? 1 : agreements / input.pairs.length };
}

export function directionalEvidenceResponseV1(input: { supportProbabilityOfTarget: number; counterProbabilityOfTarget: number }): number {
  if (!Number.isFinite(input.supportProbabilityOfTarget) || !Number.isFinite(input.counterProbabilityOfTarget)) throw new Error("directional evidence response requires finite probabilities");
  return input.supportProbabilityOfTarget - input.counterProbabilityOfTarget;
}

/** Block-level Spearman; requires at least three unique ordinal levels. */
export function blockSpearmanV1(input: { levels: ReadonlyArray<number>; targetProbabilities: ReadonlyArray<number> }): number {
  if (input.levels.length !== input.targetProbabilities.length || input.levels.length < 3) throw new Error("Spearman requires paired equal-length data of at least three points");
  if (new Set(input.levels).size !== input.levels.length) throw new Error("Spearman requires unique ordinal levels");
  for (const p of input.targetProbabilities) if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) throw new Error("Spearman target probabilities must be finite within [0,1]");
  const rank = (values: ReadonlyArray<number>): number[] => {
    const indexed = values.map((value, index) => ({ value, index }));
    indexed.sort((a, b) => a.value - b.value);
    const ranks = new Array<number>(values.length);
    for (let i = 0; i < indexed.length; i++) {
      let j = i;
      while (j + 1 < indexed.length && indexed[j + 1].value === indexed[i].value) j += 1;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[indexed[k].index] = avg;
      i = j;
    }
    return ranks;
  };
  const rx = rank(input.levels);
  const ry = rank(input.targetProbabilities);
  const n = rx.length;
  const meanX = rx.reduce((a, b) => a + b, 0) / n;
  const meanY = ry.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    cov += (rx[i] - meanX) * (ry[i] - meanY);
    varX += (rx[i] - meanX) ** 2;
    varY += (ry[i] - meanY) ** 2;
  }
  if (varX === 0 || varY === 0) return 0;
  return cov / Math.sqrt(varX * varY);
}

export function adjacentMonotonicityViolationRateV1(input: { levels: ReadonlyArray<number>; targetProbabilities: ReadonlyArray<number> }): number {
  if (input.levels.length !== input.targetProbabilities.length || input.levels.length < 2) throw new Error("monotonicity violation requires paired equal-length data of at least two points");
  const ordered = input.levels.map((level, index) => ({ level, p: input.targetProbabilities[index] })).sort((a, b) => a.level - b.level);
  let violations = 0;
  for (let i = 1; i < ordered.length; i++) if (ordered[i].p < ordered[i - 1].p) violations += 1;
  return violations / (ordered.length - 1);
}

export function signalToNuisanceRatioV1(input: { medianEvidencePairJsd: number; medianParaphrasePairJsd: number; epsilonFrozen: number }): {
  ratio: number; numerator: number; denominator: number;
} {
  if (!Number.isFinite(input.medianEvidencePairJsd) || input.medianEvidencePairJsd < 0
    || !Number.isFinite(input.medianParaphrasePairJsd) || input.medianParaphrasePairJsd < 0
    || !Number.isFinite(input.epsilonFrozen) || input.epsilonFrozen <= 0) throw new Error("SNR requires non-negative medians and a positive epsilon");
  const denominator = Math.max(input.medianParaphrasePairJsd, input.epsilonFrozen);
  return { ratio: input.medianEvidencePairJsd / denominator, numerator: input.medianEvidencePairJsd, denominator };
}

/**
 * Brier delta against a frozen baseline, reusing the claim contract's proper
 * loss (scoreBeliefReport). Binary reports must be { kind:"binary", probability }
 * and never fall back to an option; binary and different-K categorical are not
 * pooled here.
 */
export function brierDeltaV1(input: {
  claim: EpistemicClaim;
  reportValue: BeliefValue;
  baselineValue: BeliefValue;
  resolution: ClaimResolution;
}): number {
  const reportLoss = scoreBeliefReport(input.claim, { claimId: input.claim.id, value: input.reportValue, stake: 0 }, input.resolution).properLoss;
  const baselineLoss = scoreBeliefReport(input.claim, { claimId: input.claim.id, value: input.baselineValue, stake: 0 }, input.resolution).properLoss;
  return reportLoss - baselineLoss;
}

/**
 * Deterministic equal-weight cluster percentile bootstrap (protocol §7.1).
 * First compute the within-cluster equal-weight mean, then resample clusters
 * with replacement and recompute the cluster-equal-weight overall mean.
 */
export function clusterBootstrapV1(input: {
  clusters: ReadonlyArray<{ clusterId: string; values: ReadonlyArray<number> }>;
  seed: string;
  count: number;
  lowerAlpha: number;
  upperAlpha: number;
}): { lower: number; upper: number; resamples: number[] } {
  if (input.count < 1 || !Number.isSafeInteger(input.count)) throw new Error("bootstrap count must be a positive safe integer");
  if (input.clusters.length < 2) throw new Error("bootstrap requires at least two clusters");
  const clusterMeans = new Map<string, number>();
  for (const cluster of input.clusters) {
    if (cluster.values.length === 0) throw new Error("bootstrap clusters must be non-empty");
    clusterMeans.set(cluster.clusterId, cluster.values.reduce((a, b) => a + b, 0) / cluster.values.length);
  }
  const clusterIds = [...clusterMeans.keys()].sort();
  const seedNum = Array.from(input.seed).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rng = mulberry32(seedNum >>> 0);
  const resamples: number[] = [];
  for (let i = 0; i < input.count; i++) {
    let sum = 0;
    for (let j = 0; j < clusterIds.length; j++) {
      sum += clusterMeans.get(clusterIds[Math.floor(rng() * clusterIds.length)])!;
    }
    resamples.push(sum / clusterIds.length);
  }
  const sorted = [...resamples].sort((a, b) => a - b);
  return { lower: percentileSorted(sorted, input.lowerAlpha), upper: percentileSorted(sorted, input.upperAlpha), resamples: sorted };
}

// ----------------------------------------------------------------------------
// Gate state machine — non-compensatory, uses the frozen freeze.
// ----------------------------------------------------------------------------

export type MeasurementGateConclusion = "GO" | "REVISE" | "STOP" | "DEFER_INSUFFICIENT";

export interface MeasurementGateMetricsV1 {
  validCoverage: number | null;
  validCoverageClusterLowerBound: number | null;
  stratumCoverage: ReadonlyArray<{ stratum: string; coverage: number }>;
  pairCompleteness: number | null;
  terminalFailureStratum: ReadonlyArray<{ stratum: string; failureRate: number }>;
  paraphraseMedianJsd: number | null;
  paraphraseP90Jsd: number | null;
  paraphraseArgmaxAgreement: number | null;
  equivarianceMedianTv: number | null;
  equivarianceP90Tv: number | null;
  equivarianceArgmaxAgreement: number | null;
  directionLowerBound: number | null;
  directionPairedMedian: number | null;
  strengthDirectionLowerBound: number | null;
  strengthViolationRate: number | null;
  snrPoint: number | null;
  snrLowerBound: number | null;
  predictiveUpperBound: number | null;
  independentClusterCount: number | null;
  transportStrata: ReadonlyArray<string>;
  unexplainedDirectionReversalCount: number | null;
}

export interface MeasurementGateResultV1 {
  q0: boolean;
  q1: boolean;
  q2: boolean;
  q3: boolean;
  conclusion: MeasurementGateConclusion;
  blockedGates: string[];
  insufficientGates: string[];
  transportQualified: boolean;
  transportStrata: string[];
  unexplainedDirectionReversalCount: number | null;
}

function checkRequired(applicable: boolean, name: string, pass: boolean | null, blocked: string[], insufficient: Set<string>): boolean {
  if (!applicable) {
    blocked.push(`${name}:missingEvidence`);
    return false;
  }
  if (pass === null) {
    insufficient.add(name);
    return false;
  }
  if (!pass) blocked.push(name);
  return pass;
}

export function evaluateMeasurementGateV1(input: { freeze: MeasurementValidityFreezeV1; metrics: MeasurementGateMetricsV1 }): MeasurementGateResultV1 {
  // The gate only trusts a freeze that passes the frozen-schema validator
  // (frozen thresholds, derived applicability, contentHash); an unvalidated
  // freeze with caller-chosen thresholds fails closed here.
  validateMeasurementValidityFreezeV1(input.freeze);
  const t = input.freeze.thresholds;
  const applicable = input.freeze.applicableMetrics;
  const m = input.metrics;
  const blocked: string[] = [];
  const insufficient = new Set<string>();
  const clusters = m.independentClusterCount;
  if (clusters === null || clusters < t.minIndependentClusters) insufficient.add("clusterSupport");

  // Q0: structural + coverage + pair completeness.
  let q0 = true;
  q0 = checkRequired(true, "validCoverage", m.validCoverage === null ? null : m.validCoverage >= t.validCoverage.overall, blocked, insufficient) && q0;
  q0 = checkRequired(true, "validCoverageClusterLowerBound",
    m.validCoverageClusterLowerBound === null ? null : m.validCoverageClusterLowerBound >= t.validCoverage.clusterLowerBound, blocked, insufficient) && q0;
  for (const stratum of m.stratumCoverage) {
    q0 = checkRequired(true, `stratum:${stratum.stratum}`, stratum.coverage >= t.validCoverage.stratum, blocked, insufficient) && q0;
  }
  q0 = checkRequired(true, "pairCompleteness", m.pairCompleteness === null ? null : m.pairCompleteness >= t.pairCompleteness.overall, blocked, insufficient) && q0;
  for (const stratum of m.terminalFailureStratum) {
    q0 = checkRequired(true, `terminalFailure:${stratum.stratum}`, stratum.failureRate <= t.pairCompleteness.terminalFailureStratum, blocked, insufficient) && q0;
  }

  // Q1: Q0 + paraphrase + direction + strength + SNR (+ option equivariance when categorical).
  let q1 = q0;
  q1 = checkRequired(applicable.paraphrase, "paraphrase",
    m.paraphraseMedianJsd === null || m.paraphraseP90Jsd === null || m.paraphraseArgmaxAgreement === null
      ? null
      : m.paraphraseMedianJsd <= t.paraphrase.medianJsd && m.paraphraseP90Jsd <= t.paraphrase.p90Jsd
        && m.paraphraseArgmaxAgreement >= t.paraphrase.argmaxAgreement, blocked, insufficient) && q1;
  q1 = checkRequired(applicable.directionResponse, "directionResponse",
    m.directionLowerBound === null || m.directionPairedMedian === null
      ? null
      : m.directionLowerBound > t.directionResponse.lowerBound && m.directionPairedMedian >= t.directionResponse.pairedMedian, blocked, insufficient) && q1;
  q1 = checkRequired(applicable.strengthResponse, "strengthResponse",
    m.strengthDirectionLowerBound === null || m.strengthViolationRate === null
      ? null
      : m.strengthDirectionLowerBound > t.strengthResponse.directionLowerBound && m.strengthViolationRate <= t.strengthResponse.violationRate, blocked, insufficient) && q1;
  q1 = checkRequired(applicable.paraphrase, "snr",
    m.snrPoint === null || m.snrLowerBound === null
      ? null
      : m.snrPoint >= t.signalToNuisance.point && m.snrLowerBound > t.signalToNuisance.lowerBound, blocked, insufficient) && q1;
  if (input.freeze.beliefKind === "categorical") {
    q1 = checkRequired(applicable.optionEquivariance, "optionEquivariance",
      m.equivarianceMedianTv === null || m.equivarianceP90Tv === null || m.equivarianceArgmaxAgreement === null
        ? null
        : m.equivarianceMedianTv <= t.optionEquivariance.medianTv && m.equivarianceP90Tv <= t.optionEquivariance.p90Tv
          && m.equivarianceArgmaxAgreement >= t.optionEquivariance.argmaxAgreement, blocked, insufficient) && q1;
  }
  // Binary: option equivariance is structurally not applicable (protocol §7.2).

  // Q2: Q1 + predictive increment.
  let q2 = q1;
  q2 = checkRequired(applicable.predictiveIncrement, "predictiveIncrement",
    m.predictiveUpperBound === null ? null : m.predictiveUpperBound < t.predictiveIncrement.upperBound, blocked, insufficient) && q2;

  // Q3: Q2 + explicit transport strata with no unexplained direction reversals.
  const q3 = q2 && m.transportStrata.length > 0 && m.unexplainedDirectionReversalCount !== null
    && m.unexplainedDirectionReversalCount === 0;

  let conclusion: MeasurementGateConclusion;
  if (insufficient.size > 0) conclusion = "DEFER_INSUFFICIENT";
  else if (blocked.length === 0) conclusion = "GO";
  else if (blocked.some(gate => gate === "directionResponse" || gate === "paraphrase" || gate === "optionEquivariance")) conclusion = "REVISE";
  else conclusion = "STOP";

  return {
    q0, q1, q2, q3, conclusion,
    blockedGates: [...blocked],
    insufficientGates: [...insufficient],
    transportQualified: q3,
    transportStrata: [...m.transportStrata],
    unexplainedDirectionReversalCount: m.unexplainedDirectionReversalCount,
  };
}
