import {
  canonicalizeEstimatorValue,
  fingerprintEstimatorValue,
} from "./estimators";
import {
  defaultBeliefContractRegistry,
  validateEpistemicClaim,
  type BeliefContractRegistry,
} from "./contracts";
import { equalWeightLinearPool, selectLatestBeliefReports } from "./aggregation";
import { summarizeBeliefGeometry } from "./beliefGeometry";
import type {
  BeliefExposure,
  BeliefReport,
  BeliefValue,
  EpistemicClaim,
  EpistemicEvidence,
} from "./types";

export const COLLECTIVE_EPISTEMIC_STATE_V1 = Object.freeze({
  id: "swarmalpha.collective-epistemic-state",
  version: "1.0.0",
});

export interface DeclaredLineageDiversityV1 {
  /** `complete` is required before any lineage-diversity value is exposed. */
  completeness: "complete" | "partial" | "missing";
  reportsWithDeclaredLineage: number;
  reportsMissingDeclaredLineage: number;
  missingLineageReportIds: string[];
  distinctDeclaredLineageCount: number;
  /** exp(Shannon entropy) over fractional report-to-lineage mass. */
  effectiveLineageCount: number | null;
  /** Shannon entropy divided by log(distinct lineage count); 0 for one lineage. */
  normalizedLineageEntropy: number | null;
}

export interface ExposureConditionedRevisionV1 {
  /** Revisions with both an explicit supersession edge and observed reports. */
  revisionCount: number;
  targetAgentCount: number;
  meanBeliefDistance: number | null;
  totalBeliefDistance: number;
}

export interface ObservedResponseConcentrationV1 {
  /** This is response-mass attribution, not causal influence. */
  status: "available" | "unavailable";
  sourceAgentCount: number;
  responseMassBySourceAgent: Record<string, number>;
  herfindahlIndex: number | null;
  normalizedHerfindahl: number | null;
  unavailableReason?: "no_exposure_conditioned_response_mass";
}

/**
 * A deterministic, claim-relative macro projection over architecture-observed
 * reports and exposures. It is descriptive only: it does not read latent
 * beliefs, establish evidence truth, identify causal influence, or authorize
 * governance actions.
 */
export interface CollectiveEpistemicStateV1 {
  artifactSchemaRef: typeof COLLECTIVE_EPISTEMIC_STATE_V1;
  inferenceStatus: "descriptive_macrostate_only";
  claimId: string;
  asOfRound: number;
  beliefKind: "binary" | "categorical";
  claimOptionCount: number;
  populationBasis: "declared_roster" | "active_reports_only";
  expectedAgentIds: string[];
  activeAgentIds: string[];
  missingExpectedAgentIds: string[];
  latestReportIds: string[];
  withinAgentUncertainty: number;
  pooledBelief: BeliefValue;
  pooledUncertainty: number;
  betweenAgentDisagreement: number;
  pooledCertainty: number;
  pooledPredictedOutcomes: Array<boolean | string>;
  declaredLineageDiversity: DeclaredLineageDiversityV1;
  exposureConditionedRevision: ExposureConditionedRevisionV1;
  observedResponseConcentration: ObservedResponseConcentrationV1;
  sourceFingerprints: {
    claim: string;
    reports: string;
    evidence: string;
    exposures: string;
  };
  contentHash: string;
}

export interface CollectiveEpistemicStateInputV1 {
  claim: EpistemicClaim;
  reports: readonly BeliefReport[];
  evidence: readonly EpistemicEvidence[];
  exposures: readonly BeliefExposure[];
  asOfRound: number;
  /** When omitted, absence from the population cannot be inferred. */
  expectedAgentIds?: readonly string[];
  contractRegistry?: BeliefContractRegistry;
}

function requireUniqueNonEmpty(values: readonly string[], field: string): void {
  if (values.some(value => typeof value !== "string" || value.trim().length === 0)) {
    throw new Error(`${field} must contain only non-empty strings`);
  }
  if (new Set(values).size !== values.length) throw new Error(`${field} must not contain duplicates`);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function canonicalClone<T>(value: T): T {
  return JSON.parse(canonicalizeEstimatorValue(value)) as T;
}

function optionCount(claim: EpistemicClaim): number {
  return "options" in claim ? claim.options.length : 2;
}

function validateInput(input: CollectiveEpistemicStateInputV1, registry: BeliefContractRegistry): void {
  validateEpistemicClaim(input.claim, registry);
  if (!Number.isSafeInteger(input.asOfRound) || input.asOfRound < 0) {
    throw new Error("collective epistemic state asOfRound must be a non-negative safe integer");
  }
  if (input.expectedAgentIds !== undefined) {
    requireUniqueNonEmpty(input.expectedAgentIds, "expectedAgentIds");
    if (input.expectedAgentIds.length === 0) throw new Error("expectedAgentIds must not be empty when declared");
  }
  requireUniqueNonEmpty(input.reports.map(report => report.id), "reports[].id");
  requireUniqueNonEmpty(input.evidence.map(item => item.id), "evidence[].id");
  requireUniqueNonEmpty(input.exposures.map(exposure => exposure.id), "exposures[].id");
}

function deriveDeclaredLineageDiversity(
  reports: readonly BeliefReport[],
  evidenceById: ReadonlyMap<string, EpistemicEvidence>,
): DeclaredLineageDiversityV1 {
  const missing: string[] = [];
  const mass = new Map<string, number>();
  for (const report of reports) {
    const lineages = new Set<string>();
    for (const reference of report.evidence) {
      const item = evidenceById.get(reference.evidenceId);
      if (!item) throw new Error(`Unknown evidence ${reference.evidenceId} in report ${report.id}`);
      const lineage = item.provenance.lineageId;
      if (lineage !== undefined) {
        if (lineage.trim().length === 0) throw new Error(`Evidence ${item.id} has an empty declared lineage`);
        lineages.add(lineage);
      }
    }
    if (lineages.size === 0) {
      missing.push(report.id);
      continue;
    }
    const fractionalMass = 1 / lineages.size;
    for (const lineage of lineages) mass.set(lineage, (mass.get(lineage) ?? 0) + fractionalMass);
  }
  const reportsWithLineage = reports.length - missing.length;
  const completeness = reports.length === 0 || missing.length === reports.length
    ? "missing"
    : missing.length > 0 ? "partial" : "complete";
  if (completeness !== "complete") {
    return {
      completeness,
      reportsWithDeclaredLineage: reportsWithLineage,
      reportsMissingDeclaredLineage: missing.length,
      missingLineageReportIds: missing.sort(),
      distinctDeclaredLineageCount: mass.size,
      effectiveLineageCount: null,
      normalizedLineageEntropy: null,
    };
  }
  const totalMass = [...mass.values()].reduce((sum, value) => sum + value, 0);
  const entropy = [...mass.values()].reduce((sum, value) => {
    const probability = value / totalMass;
    return sum - probability * Math.log(probability);
  }, 0);
  return {
    completeness,
    reportsWithDeclaredLineage: reportsWithLineage,
    reportsMissingDeclaredLineage: 0,
    missingLineageReportIds: [],
    distinctDeclaredLineageCount: mass.size,
    effectiveLineageCount: Math.exp(entropy),
    normalizedLineageEntropy: mass.size === 1 ? 0 : entropy / Math.log(mass.size),
  };
}

function deriveExposureConditionedDynamics(input: {
  claim: EpistemicClaim;
  reports: readonly BeliefReport[];
  exposures: readonly BeliefExposure[];
  registry: BeliefContractRegistry;
}): {
  revision: ExposureConditionedRevisionV1;
  concentration: ObservedResponseConcentrationV1;
} {
  const reportsById = new Map(input.reports.map(report => [report.id, report]));
  const exposureKeys = new Set(input.exposures.map(exposure => {
    const source = reportsById.get(exposure.sourceReportId);
    if (!source) throw new Error(`Exposure ${exposure.id} references unknown report ${exposure.sourceReportId}`);
    if (source.claimId !== input.claim.id || exposure.claimId !== input.claim.id) {
      throw new Error(`Exposure ${exposure.id} belongs to a different claim`);
    }
    if (!Number.isSafeInteger(exposure.round) || exposure.round < source.round) {
      throw new Error(`Exposure ${exposure.id} precedes its source report`);
    }
    return `${exposure.sourceReportId}\u0000${exposure.targetAgentId}\u0000${exposure.round}`;
  }));
  const contract = input.registry.get(input.claim.resolutionPolicy.kind);
  let totalDistance = 0;
  let revisionCount = 0;
  const targets = new Set<string>();
  const responseMass = new Map<string, number>();
  for (const report of input.reports) {
    if (!report.supersedesReportId || !report.observedReportIds?.length) continue;
    const previous = reportsById.get(report.supersedesReportId);
    if (!previous || previous.agentId !== report.agentId || previous.claimId !== report.claimId) {
      throw new Error(`Report ${report.id} has an invalid supersession edge`);
    }
    const sourceAgents = new Set<string>();
    for (const observedId of report.observedReportIds) {
      const observed = reportsById.get(observedId);
      if (!observed || observed.claimId !== report.claimId || observed.round > report.round) {
        throw new Error(`Report ${report.id} observes an invalid report ${observedId}`);
      }
      const hasExposure = [...exposureKeys].some(key => {
        const [sourceReportId, targetAgentId, round] = key.split("\u0000");
        return sourceReportId === observedId
          && targetAgentId === report.agentId
          && Number(round) <= report.round;
      });
      if (!hasExposure) throw new Error(`Observed report ${observedId} has no matching exposure for ${report.agentId}`);
      sourceAgents.add(observed.agentId);
    }
    const distance = contract.distance(previous.value, report.value);
    totalDistance += distance;
    revisionCount += 1;
    targets.add(report.agentId);
    if (distance > 0 && sourceAgents.size > 0) {
      const share = distance / sourceAgents.size;
      for (const sourceAgent of sourceAgents) {
        responseMass.set(sourceAgent, (responseMass.get(sourceAgent) ?? 0) + share);
      }
    }
  }
  const responseMassBySourceAgent = Object.fromEntries([...responseMass.entries()].sort(([a], [b]) => a.localeCompare(b)));
  if (totalDistance <= 0 || responseMass.size === 0) {
    return {
      revision: {
        revisionCount,
        targetAgentCount: targets.size,
        meanBeliefDistance: revisionCount > 0 ? totalDistance / revisionCount : null,
        totalBeliefDistance: totalDistance,
      },
      concentration: {
        status: "unavailable",
        sourceAgentCount: responseMass.size,
        responseMassBySourceAgent,
        herfindahlIndex: null,
        normalizedHerfindahl: null,
        unavailableReason: "no_exposure_conditioned_response_mass",
      },
    };
  }
  const shares = [...responseMass.values()].map(value => value / totalDistance);
  const hhi = shares.reduce((sum, share) => sum + share ** 2, 0);
  const n = shares.length;
  return {
    revision: {
      revisionCount,
      targetAgentCount: targets.size,
      meanBeliefDistance: totalDistance / revisionCount,
      totalBeliefDistance: totalDistance,
    },
    concentration: {
      status: "available",
      sourceAgentCount: n,
      responseMassBySourceAgent,
      herfindahlIndex: hhi,
      normalizedHerfindahl: n === 1 ? 1 : (hhi - 1 / n) / (1 - 1 / n),
    },
  };
}

function stateBody(state: CollectiveEpistemicStateV1): Omit<CollectiveEpistemicStateV1, "contentHash"> {
  const { contentHash: _contentHash, ...body } = state;
  return body;
}

export function projectCollectiveEpistemicStateV1(
  input: CollectiveEpistemicStateInputV1,
): Readonly<CollectiveEpistemicStateV1> {
  const registry = input.contractRegistry ?? defaultBeliefContractRegistry;
  validateInput(input, registry);
  const reports = input.reports
    .filter(report => report.claimId === input.claim.id && report.round <= input.asOfRound)
    .map(report => canonicalClone(report));
  if (reports.length === 0) throw new Error("collective epistemic state requires at least one report as of the requested round");
  for (const report of reports) registry.get(input.claim.resolutionPolicy.kind).validateValue(input.claim, report.value);
  const latest = selectLatestBeliefReports(input.claim.id, reports);
  const activeAgentIds = latest.map(report => report.agentId).sort();
  const expectedAgentIds = input.expectedAgentIds === undefined
    ? [...activeAgentIds]
    : [...input.expectedAgentIds].sort();
  const expectedSet = new Set(expectedAgentIds);
  const unexpected = activeAgentIds.filter(agentId => !expectedSet.has(agentId));
  if (input.expectedAgentIds !== undefined && unexpected.length > 0) {
    throw new Error(`Active reports contain agents outside the declared roster: ${unexpected.join(",")}`);
  }
  const missingExpectedAgentIds = expectedAgentIds.filter(agentId => !activeAgentIds.includes(agentId));
  const contract = registry.get(input.claim.resolutionPolicy.kind);
  const withinAgentUncertainty = latest.reduce(
    (sum, report) => sum + contract.uncertainty(report.value),
    0,
  ) / latest.length;
  const pool = equalWeightLinearPool({ claim: input.claim, latestReports: latest, contractRegistry: registry });
  if (pool.status !== "available") throw new Error("collective epistemic state could not construct a pooled belief");
  const pooledUncertainty = contract.uncertainty(pool.value);
  const betweenAgentDisagreement = Math.max(0, pooledUncertainty - withinAgentUncertainty);
  const pooledGeometry = summarizeBeliefGeometry(input.claim, pool.value, registry);
  const evidenceById = new Map(input.evidence.map(item => [item.id, item]));
  const dynamics = deriveExposureConditionedDynamics({
    claim: input.claim,
    reports,
    exposures: input.exposures.filter(exposure => exposure.claimId === input.claim.id && exposure.round <= input.asOfRound),
    registry,
  });
  const body: Omit<CollectiveEpistemicStateV1, "contentHash"> = {
    artifactSchemaRef: COLLECTIVE_EPISTEMIC_STATE_V1,
    inferenceStatus: "descriptive_macrostate_only",
    claimId: input.claim.id,
    asOfRound: input.asOfRound,
    beliefKind: input.claim.resolutionPolicy.kind,
    claimOptionCount: optionCount(input.claim),
    populationBasis: input.expectedAgentIds === undefined ? "active_reports_only" : "declared_roster",
    expectedAgentIds,
    activeAgentIds,
    missingExpectedAgentIds,
    latestReportIds: latest.map(report => report.id).sort(),
    withinAgentUncertainty,
    pooledBelief: pool.value,
    pooledUncertainty,
    betweenAgentDisagreement,
    pooledCertainty: pooledGeometry.certainty,
    pooledPredictedOutcomes: pooledGeometry.predictedOutcomes,
    declaredLineageDiversity: deriveDeclaredLineageDiversity(latest, evidenceById),
    exposureConditionedRevision: dynamics.revision,
    observedResponseConcentration: dynamics.concentration,
    sourceFingerprints: {
      claim: fingerprintEstimatorValue(input.claim),
      reports: fingerprintEstimatorValue([...reports].sort((a, b) => a.id.localeCompare(b.id))),
      evidence: fingerprintEstimatorValue([...input.evidence].sort((a, b) => a.id.localeCompare(b.id))),
      exposures: fingerprintEstimatorValue([...input.exposures]
        .filter(exposure => exposure.claimId === input.claim.id && exposure.round <= input.asOfRound)
        .sort((a, b) => a.id.localeCompare(b.id))),
    },
  };
  const state: CollectiveEpistemicStateV1 = {
    ...body,
    contentHash: fingerprintEstimatorValue(body),
  };
  validateCollectiveEpistemicStateV1(state);
  return deepFreeze(canonicalClone(state));
}

export function validateCollectiveEpistemicStateV1(state: CollectiveEpistemicStateV1): void {
  if (canonicalizeEstimatorValue(state.artifactSchemaRef) !== canonicalizeEstimatorValue(COLLECTIVE_EPISTEMIC_STATE_V1)) {
    throw new Error("collective epistemic state schema ref is invalid");
  }
  if (state.inferenceStatus !== "descriptive_macrostate_only") {
    throw new Error("collective epistemic state cannot claim control or causal authority");
  }
  if (!Number.isSafeInteger(state.asOfRound) || state.asOfRound < 0) throw new Error("collective epistemic state round is invalid");
  if (!["binary", "categorical"].includes(state.beliefKind)) throw new Error("collective epistemic state belief kind is invalid");
  if (!Number.isSafeInteger(state.claimOptionCount) || state.claimOptionCount < 2) throw new Error("collective epistemic state option count is invalid");
  requireUniqueNonEmpty(state.expectedAgentIds, "state.expectedAgentIds");
  requireUniqueNonEmpty(state.activeAgentIds, "state.activeAgentIds");
  requireUniqueNonEmpty(state.latestReportIds, "state.latestReportIds");
  for (const value of [
    state.withinAgentUncertainty,
    state.pooledUncertainty,
    state.betweenAgentDisagreement,
    state.pooledCertainty,
    state.exposureConditionedRevision.totalBeliefDistance,
  ]) {
    if (!Number.isFinite(value) || value < 0) throw new Error("collective epistemic state contains an invalid non-negative metric");
  }
  if (state.withinAgentUncertainty > 1 || state.pooledUncertainty > 1
    || state.betweenAgentDisagreement > 1 || state.pooledCertainty > 1) {
    throw new Error("collective epistemic state normalized metric exceeds one");
  }
  const lineage = state.declaredLineageDiversity;
  if (lineage.completeness === "complete") {
    if (lineage.effectiveLineageCount === null || lineage.normalizedLineageEntropy === null) {
      throw new Error("complete lineage diversity requires finite metrics");
    }
  } else if (lineage.effectiveLineageCount !== null || lineage.normalizedLineageEntropy !== null) {
    throw new Error("incomplete lineage diversity must not expose a numeric estimate");
  }
  const concentration = state.observedResponseConcentration;
  if (concentration.status === "available") {
    if (concentration.herfindahlIndex === null || concentration.normalizedHerfindahl === null) {
      throw new Error("available response concentration requires finite metrics");
    }
  } else if (concentration.herfindahlIndex !== null || concentration.normalizedHerfindahl !== null) {
    throw new Error("unavailable response concentration must not expose a numeric estimate");
  }
  const expectedHash = fingerprintEstimatorValue(stateBody(state));
  if (state.contentHash !== expectedHash) throw new Error("collective epistemic state content hash mismatch");
}

export function replayCollectiveEpistemicStateV1(
  input: CollectiveEpistemicStateInputV1,
  stored: CollectiveEpistemicStateV1,
): Readonly<CollectiveEpistemicStateV1> {
  validateCollectiveEpistemicStateV1(stored);
  const replayed = projectCollectiveEpistemicStateV1(input);
  if (canonicalizeEstimatorValue(replayed) !== canonicalizeEstimatorValue(stored)) {
    throw new Error("collective epistemic state deterministic replay mismatch");
  }
  return replayed;
}
