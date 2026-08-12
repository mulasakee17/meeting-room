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

function requireExactKeys(value: object, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  if (actual.length !== canonicalExpected.length
    || actual.some((key, index) => key !== canonicalExpected[index])) {
    throw new Error(`${field} fields differ from the frozen schema`);
  }
}

function requireSorted(values: readonly string[], field: string): void {
  if (values.some((value, index) => index > 0 && values[index - 1].localeCompare(value) > 0)) {
    throw new Error(`${field} must use canonical lexical order`);
  }
}

function requireUnitInterval(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be finite and within [0, 1]`);
  }
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

function uncertaintyOfBelief(value: BeliefValue): number {
  if (value.kind === "binary") {
    const probability = value.probability;
    if (probability === 0 || probability === 1) return 0;
    return -(probability * Math.log(probability)
      + (1 - probability) * Math.log(1 - probability)) / Math.log(2);
  }
  const probabilities = Object.values(value.probabilities);
  return probabilities.reduce(
    (entropy, probability) => probability > 0 ? entropy - probability * Math.log(probability) : entropy,
    0,
  ) / Math.log(probabilities.length);
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
  const referencedEvidenceIds = new Set(reports.flatMap(report => report.evidence.map(reference => {
    if (!evidenceById.has(reference.evidenceId)) {
      throw new Error(`Unknown evidence ${reference.evidenceId} in report ${report.id}`);
    }
    return reference.evidenceId;
  })));
  const relevantEvidence = input.evidence.filter(item => referencedEvidenceIds.has(item.id));
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
      evidence: fingerprintEstimatorValue([...relevantEvidence].sort((a, b) => a.id.localeCompare(b.id))),
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
  requireExactKeys(state, [
    "artifactSchemaRef", "inferenceStatus", "claimId", "asOfRound", "beliefKind",
    "claimOptionCount", "populationBasis", "expectedAgentIds", "activeAgentIds",
    "missingExpectedAgentIds", "latestReportIds", "withinAgentUncertainty",
    "pooledBelief", "pooledUncertainty", "betweenAgentDisagreement", "pooledCertainty",
    "pooledPredictedOutcomes", "declaredLineageDiversity", "exposureConditionedRevision",
    "observedResponseConcentration", "sourceFingerprints", "contentHash",
  ], "collective epistemic state");
  requireExactKeys(state.artifactSchemaRef, ["id", "version"], "artifactSchemaRef");
  requireExactKeys(state.declaredLineageDiversity, [
    "completeness", "reportsWithDeclaredLineage", "reportsMissingDeclaredLineage",
    "missingLineageReportIds", "distinctDeclaredLineageCount", "effectiveLineageCount",
    "normalizedLineageEntropy",
  ], "declaredLineageDiversity");
  requireExactKeys(state.exposureConditionedRevision, [
    "revisionCount", "targetAgentCount", "meanBeliefDistance", "totalBeliefDistance",
  ], "exposureConditionedRevision");
  requireExactKeys(state.observedResponseConcentration,
    state.observedResponseConcentration.status === "available"
      ? ["status", "sourceAgentCount", "responseMassBySourceAgent", "herfindahlIndex", "normalizedHerfindahl"]
      : ["status", "sourceAgentCount", "responseMassBySourceAgent", "herfindahlIndex", "normalizedHerfindahl", "unavailableReason"],
    "observedResponseConcentration");
  requireExactKeys(state.sourceFingerprints, ["claim", "reports", "evidence", "exposures"], "sourceFingerprints");
  if (canonicalizeEstimatorValue(state.artifactSchemaRef) !== canonicalizeEstimatorValue(COLLECTIVE_EPISTEMIC_STATE_V1)) {
    throw new Error("collective epistemic state schema ref is invalid");
  }
  if (state.inferenceStatus !== "descriptive_macrostate_only") {
    throw new Error("collective epistemic state cannot claim control or causal authority");
  }
  if (!Number.isSafeInteger(state.asOfRound) || state.asOfRound < 0) throw new Error("collective epistemic state round is invalid");
  if (!["binary", "categorical"].includes(state.beliefKind)) throw new Error("collective epistemic state belief kind is invalid");
  if (!Number.isSafeInteger(state.claimOptionCount) || state.claimOptionCount < 2) throw new Error("collective epistemic state option count is invalid");
  if (state.beliefKind === "binary" && state.claimOptionCount !== 2) throw new Error("binary collective state must have two outcomes");
  if (!["declared_roster", "active_reports_only"].includes(state.populationBasis)) {
    throw new Error("collective epistemic state population basis is invalid");
  }
  requireUniqueNonEmpty(state.expectedAgentIds, "state.expectedAgentIds");
  requireUniqueNonEmpty(state.activeAgentIds, "state.activeAgentIds");
  requireUniqueNonEmpty(state.missingExpectedAgentIds, "state.missingExpectedAgentIds");
  requireUniqueNonEmpty(state.latestReportIds, "state.latestReportIds");
  requireSorted(state.expectedAgentIds, "state.expectedAgentIds");
  requireSorted(state.activeAgentIds, "state.activeAgentIds");
  requireSorted(state.missingExpectedAgentIds, "state.missingExpectedAgentIds");
  requireSorted(state.latestReportIds, "state.latestReportIds");
  if (state.activeAgentIds.length !== state.latestReportIds.length) {
    throw new Error("collective epistemic state requires one latest report per active agent");
  }
  const activeSet = new Set(state.activeAgentIds);
  const expectedSet = new Set(state.expectedAgentIds);
  if (state.activeAgentIds.some(agentId => !expectedSet.has(agentId))) {
    throw new Error("collective epistemic state active agents must belong to the population");
  }
  const derivedMissing = state.expectedAgentIds.filter(agentId => !activeSet.has(agentId));
  if (canonicalizeEstimatorValue(derivedMissing) !== canonicalizeEstimatorValue(state.missingExpectedAgentIds)) {
    throw new Error("collective epistemic state missing roster is inconsistent");
  }
  if (state.populationBasis === "active_reports_only" && state.missingExpectedAgentIds.length !== 0) {
    throw new Error("active-report population cannot imply unobserved missing agents");
  }
  requireUnitInterval(state.withinAgentUncertainty, "withinAgentUncertainty");
  requireUnitInterval(state.pooledUncertainty, "pooledUncertainty");
  requireUnitInterval(state.betweenAgentDisagreement, "betweenAgentDisagreement");
  requireUnitInterval(state.pooledCertainty, "pooledCertainty");
  if (Math.abs(
    state.betweenAgentDisagreement
      - Math.max(0, state.pooledUncertainty - state.withinAgentUncertainty)
  ) > 1e-12) {
    throw new Error("between-agent disagreement differs from its entropy decomposition");
  }
  if (state.pooledBelief.kind !== state.beliefKind) throw new Error("pooled belief kind differs from state domain");
  let pooledMaximum: number;
  let validPredictedOutcomes: Array<boolean | string>;
  if (state.pooledBelief.kind === "binary") {
    requireExactKeys(state.pooledBelief, ["kind", "probability"], "pooledBelief");
    requireUnitInterval(state.pooledBelief.probability, "pooledBelief.probability");
    pooledMaximum = Math.max(state.pooledBelief.probability, 1 - state.pooledBelief.probability);
    validPredictedOutcomes = state.pooledBelief.probability === 0.5
      ? [false, true]
      : [state.pooledBelief.probability > 0.5];
  } else {
    requireExactKeys(state.pooledBelief, ["kind", "probabilities"], "pooledBelief");
    const entries = Object.entries(state.pooledBelief.probabilities);
    if (entries.length !== state.claimOptionCount) throw new Error("pooled categorical belief has the wrong option count");
    let total = 0;
    for (const [option, probability] of entries) {
      if (option.trim().length === 0) throw new Error("pooled categorical option must be non-empty");
      requireUnitInterval(probability, `pooledBelief.probabilities.${option}`);
      total += probability;
    }
    if (Math.abs(total - 1) > 1e-6) throw new Error("pooled categorical probabilities must sum to one");
    pooledMaximum = Math.max(...entries.map(([, probability]) => probability));
    validPredictedOutcomes = entries
      .filter(([, probability]) => Math.abs(probability - pooledMaximum) <= Number.EPSILON)
      .map(([option]) => option)
      .sort();
  }
  if (Math.abs(pooledMaximum - state.pooledCertainty) > 1e-12
    || canonicalizeEstimatorValue(validPredictedOutcomes) !== canonicalizeEstimatorValue(state.pooledPredictedOutcomes)) {
    throw new Error("pooled belief geometry is inconsistent");
  }
  if (Math.abs(uncertaintyOfBelief(state.pooledBelief) - state.pooledUncertainty) > 1e-12) {
    throw new Error("pooled uncertainty differs from the pooled belief geometry");
  }
  const lineage = state.declaredLineageDiversity;
  if (!["complete", "partial", "missing"].includes(lineage.completeness)) throw new Error("lineage completeness is invalid");
  for (const count of [lineage.reportsWithDeclaredLineage, lineage.reportsMissingDeclaredLineage, lineage.distinctDeclaredLineageCount]) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("lineage diversity contains an invalid count");
  }
  requireUniqueNonEmpty(lineage.missingLineageReportIds, "missingLineageReportIds");
  requireSorted(lineage.missingLineageReportIds, "missingLineageReportIds");
  if (lineage.reportsWithDeclaredLineage + lineage.reportsMissingDeclaredLineage !== state.latestReportIds.length
    || lineage.missingLineageReportIds.length !== lineage.reportsMissingDeclaredLineage) {
    throw new Error("lineage completeness counts differ from the active reports");
  }
  const expectedLineageCompleteness = lineage.reportsWithDeclaredLineage === 0
    ? "missing"
    : lineage.reportsMissingDeclaredLineage === 0 ? "complete" : "partial";
  if (lineage.completeness !== expectedLineageCompleteness) {
    throw new Error("lineage completeness label differs from its counts");
  }
  if (lineage.completeness === "complete") {
    if (lineage.effectiveLineageCount === null || lineage.normalizedLineageEntropy === null) {
      throw new Error("complete lineage diversity requires finite metrics");
    }
    if (lineage.reportsMissingDeclaredLineage !== 0 || lineage.distinctDeclaredLineageCount < 1
      || !Number.isFinite(lineage.effectiveLineageCount)
      || lineage.effectiveLineageCount < 1
      || lineage.effectiveLineageCount > lineage.distinctDeclaredLineageCount + 1e-12) {
      throw new Error("complete lineage diversity metrics are inconsistent");
    }
    requireUnitInterval(lineage.normalizedLineageEntropy, "normalizedLineageEntropy");
    const expectedEffectiveCount = Math.exp(
      lineage.normalizedLineageEntropy * Math.log(lineage.distinctDeclaredLineageCount),
    );
    if (Math.abs(lineage.effectiveLineageCount - expectedEffectiveCount) > 1e-12) {
      throw new Error("effective lineage count differs from declared lineage entropy");
    }
  } else if (lineage.effectiveLineageCount !== null || lineage.normalizedLineageEntropy !== null) {
    throw new Error("incomplete lineage diversity must not expose a numeric estimate");
  } else if (lineage.completeness === "missing" && lineage.distinctDeclaredLineageCount !== 0) {
    throw new Error("missing lineage state cannot contain declared lineages");
  }
  const revision = state.exposureConditionedRevision;
  if (!Number.isSafeInteger(revision.revisionCount) || revision.revisionCount < 0
    || !Number.isSafeInteger(revision.targetAgentCount) || revision.targetAgentCount < 0
    || revision.targetAgentCount > revision.revisionCount
    || !Number.isFinite(revision.totalBeliefDistance) || revision.totalBeliefDistance < 0) {
    throw new Error("exposure-conditioned revision metrics are invalid");
  }
  if (revision.revisionCount === 0) {
    if (revision.meanBeliefDistance !== null || revision.totalBeliefDistance !== 0) {
      throw new Error("empty revision state must expose null mean and zero total distance");
    }
  } else if (revision.meanBeliefDistance === null || !Number.isFinite(revision.meanBeliefDistance)
    || revision.meanBeliefDistance < 0
    || Math.abs(revision.meanBeliefDistance - revision.totalBeliefDistance / revision.revisionCount) > 1e-12) {
    throw new Error("mean exposure-conditioned revision is inconsistent");
  }
  const concentration = state.observedResponseConcentration;
  requireExactKeys(concentration.responseMassBySourceAgent,
    Object.keys(concentration.responseMassBySourceAgent), "responseMassBySourceAgent");
  const responseEntries = Object.entries(concentration.responseMassBySourceAgent);
  if (!Number.isSafeInteger(concentration.sourceAgentCount) || concentration.sourceAgentCount < 0
    || concentration.sourceAgentCount !== responseEntries.length
    || responseEntries.some(([agentId, mass]) => agentId.trim().length === 0 || !Number.isFinite(mass) || mass <= 0)) {
    throw new Error("response concentration source mass is invalid");
  }
  if (concentration.status === "available") {
    if (concentration.herfindahlIndex === null || concentration.normalizedHerfindahl === null) {
      throw new Error("available response concentration requires finite metrics");
    }
    if (concentration.sourceAgentCount < 1 || revision.totalBeliefDistance <= 0) {
      throw new Error("available response concentration requires positive response mass");
    }
    const totalResponseMass = responseEntries.reduce((sum, [, mass]) => sum + mass, 0);
    if (Math.abs(totalResponseMass - revision.totalBeliefDistance) > 1e-12) {
      throw new Error("response mass must equal exposure-conditioned revision mass");
    }
    const expectedHhi = responseEntries.reduce(
      (sum, [, mass]) => sum + (mass / totalResponseMass) ** 2,
      0,
    );
    const n = concentration.sourceAgentCount;
    const expectedNormalized = n === 1 ? 1 : (expectedHhi - 1 / n) / (1 - 1 / n);
    if (Math.abs(concentration.herfindahlIndex - expectedHhi) > 1e-12
      || Math.abs(concentration.normalizedHerfindahl - expectedNormalized) > 1e-12) {
      throw new Error("response concentration differs from its response-mass decomposition");
    }
    requireUnitInterval(concentration.herfindahlIndex, "herfindahlIndex");
    requireUnitInterval(concentration.normalizedHerfindahl, "normalizedHerfindahl");
  } else if (concentration.herfindahlIndex !== null || concentration.normalizedHerfindahl !== null) {
    throw new Error("unavailable response concentration must not expose a numeric estimate");
  } else if (concentration.unavailableReason !== "no_exposure_conditioned_response_mass"
    || concentration.sourceAgentCount !== 0 || responseEntries.length !== 0) {
    throw new Error("unavailable response concentration has inconsistent diagnostics");
  }
  for (const [name, fingerprint] of Object.entries(state.sourceFingerprints)) {
    if (!/^sha256:[0-9a-f]{64}$/.test(fingerprint)) throw new Error(`source fingerprint ${name} is invalid`);
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
