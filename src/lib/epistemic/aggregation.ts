import {
  defaultBeliefContractRegistry,
  isCategoricalClaim,
  type BeliefContractRegistry,
} from "./contracts";
import type {
  BeliefReport,
  BeliefValue,
  EpistemicClaim,
  EpistemicEvidence,
} from "./types";

export const EQUAL_WEIGHT_LINEAR_POOL_V1 = Object.freeze({
  id: "swarmalpha.aggregation.equal-weight-linear-pool",
  version: "1.0.0",
});

export const LINEAGE_CAPPED_LINEAR_POOL_V1 = Object.freeze({
  id: "swarmalpha.aggregation.lineage-capped-linear-pool",
  version: "1.0.0",
});

export const ABSTAIN_ON_TIE_DECISION_V1 = Object.freeze({
  id: "swarmalpha.decision.abstain-on-tie",
  version: "1.0.0",
  tieTolerance: 1e-12,
});

export interface BeliefPoolContribution {
  reportId: string;
  agentId: string;
  lineageIds: string[];
  baseWeight: number;
  effectiveWeight: number;
  normalizedWeight: number;
}

export type BeliefPoolResult =
  | {
      status: "available";
      policyRef: { id: string; version: string };
      claimId: string;
      value: BeliefValue;
      contributions: BeliefPoolContribution[];
      abstainedAgentIds: string[];
    }
  | {
      status: "unavailable";
      policyRef: { id: string; version: string };
      claimId: string;
      reason: "no_active_reports" | "missing_lineage";
      missingLineageReportIds: string[];
      abstainedAgentIds: string[];
    };

export type PooledDecision =
  | {
      status: "decided";
      decisionContractRef: { id: string; version: string };
      claimId: string;
      outcome: boolean | string;
    }
  | {
      status: "abstained";
      decisionContractRef: { id: string; version: string };
      claimId: string;
      reason: "pool_unavailable" | "exact_tie";
    };

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function validateInputs(
  claim: EpistemicClaim,
  reports: readonly BeliefReport[],
  contractRegistry: BeliefContractRegistry,
): BeliefReport[] {
  const ids = reports.map(report => report.id);
  if (new Set(ids).size !== ids.length) throw new Error("belief pool reports must have unique ids");
  const agents = reports.map(report => report.agentId);
  if (new Set(agents).size !== agents.length) {
    throw new Error("belief pool requires at most one latest report per agent");
  }
  return reports.map(report => {
    if (report.claimId !== claim.id) throw new Error(`Report ${report.id} belongs to a different claim`);
    const normalizedValue = contractRegistry.get(claim.resolutionPolicy.kind)
      .normalizeValue(claim, report.value);
    return structuredClone({ ...report, value: normalizedValue });
  });
}

/** Select one terminal report per agent and reject ambiguous revision histories. */
export function selectLatestBeliefReports(
  claimId: string,
  reports: readonly BeliefReport[],
): BeliefReport[] {
  const relevant = reports.filter(report => report.claimId === claimId);
  const byAgent = new Map<string, BeliefReport[]>();
  for (const report of relevant) {
    const existing = byAgent.get(report.agentId) ?? [];
    existing.push(report);
    byAgent.set(report.agentId, existing);
  }
  const latest: BeliefReport[] = [];
  for (const [agentId, agentReports] of byAgent) {
    const superseded = new Set(agentReports
      .map(report => report.supersedesReportId)
      .filter((id): id is string => id !== undefined));
    const terminals = agentReports.filter(report => !superseded.has(report.id));
    if (terminals.length !== 1) {
      throw new Error(`Agent ${agentId} has an ambiguous latest-report history for claim ${claimId}`);
    }
    latest.push(structuredClone(terminals[0]));
  }
  return latest.sort((left, right) => left.agentId.localeCompare(right.agentId));
}

function weightedPool(
  claim: EpistemicClaim,
  reports: readonly BeliefReport[],
  weights: readonly number[],
): BeliefValue {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0) || !Number.isFinite(total)) throw new Error("belief pool total weight must be positive and finite");
  if (claim.resolutionPolicy.kind === "binary") {
    let probability = 0;
    for (let index = 0; index < reports.length; index++) {
      const value = reports[index].value;
      if (value.kind !== "binary") throw new Error("binary claim received a non-binary report");
      probability += value.probability * weights[index] / total;
    }
    return { kind: "binary", probability };
  }
  if (!isCategoricalClaim(claim)) throw new Error("Unsupported non-categorical claim contract");
  const probabilities: Record<string, number> = Object.fromEntries(
    claim.options.map(option => [option, 0]),
  );
  for (let index = 0; index < reports.length; index++) {
    const value = reports[index].value;
    if (value.kind !== "categorical") throw new Error("categorical claim received a non-categorical report");
    for (const option of claim.options) {
      probabilities[option] += value.probabilities[option] * weights[index] / total;
    }
  }
  if (Object.values(probabilities).some(probability => !Number.isFinite(probability))) {
    throw new Error("categorical belief pool produced a non-finite probability");
  }
  return { kind: "categorical", probabilities };
}

function assertAbstainersAreExcluded(
  reports: readonly BeliefReport[],
  abstainedAgentIds: readonly string[],
): void {
  const abstained = new Set(abstainedAgentIds);
  const overlap = reports.filter(report => abstained.has(report.agentId)).map(report => report.agentId);
  if (overlap.length > 0) {
    throw new Error(`Abstained agents must not have active reports: ${uniqueSorted(overlap).join(",")}`);
  }
}

function makeContributions(
  reports: readonly BeliefReport[],
  lineageIds: readonly string[][],
  effectiveWeights: readonly number[],
): BeliefPoolContribution[] {
  const total = effectiveWeights.reduce((sum, weight) => sum + weight, 0);
  return reports.map((report, index) => ({
    reportId: report.id,
    agentId: report.agentId,
    lineageIds: [...lineageIds[index]],
    baseWeight: 1,
    effectiveWeight: effectiveWeights[index],
    normalizedWeight: effectiveWeights[index] / total,
  }));
}

export function equalWeightLinearPool(input: {
  claim: EpistemicClaim;
  latestReports: readonly BeliefReport[];
  abstainedAgentIds?: readonly string[];
  contractRegistry?: BeliefContractRegistry;
}): BeliefPoolResult {
  const abstainedAgentIds = uniqueSorted(input.abstainedAgentIds ?? []);
  assertAbstainersAreExcluded(input.latestReports, abstainedAgentIds);
  const reports = validateInputs(
    input.claim,
    input.latestReports,
    input.contractRegistry ?? defaultBeliefContractRegistry,
  );
  if (reports.length === 0) {
    return {
      status: "unavailable",
      policyRef: EQUAL_WEIGHT_LINEAR_POOL_V1,
      claimId: input.claim.id,
      reason: "no_active_reports",
      missingLineageReportIds: [],
      abstainedAgentIds,
    };
  }
  const weights = reports.map(() => 1);
  return {
    status: "available",
    policyRef: EQUAL_WEIGHT_LINEAR_POOL_V1,
    claimId: input.claim.id,
    value: weightedPool(input.claim, reports, weights),
    contributions: makeContributions(reports, reports.map(() => []), weights),
    abstainedAgentIds,
  };
}

/**
 * Give each report unit base weight, cap every lineage's aggregate base mass,
 * and constrain a report by the tightest lineage it belongs to. Therefore, for
 * every lineage L, sum(effective report weights containing L) <= its cap.
 * This deliberately conservative rule limits correlated corroboration without
 * treating dependence as evidence that a report is false.
 */
export function lineageCappedLinearPool(input: {
  claim: EpistemicClaim;
  latestReports: readonly BeliefReport[];
  evidence: readonly EpistemicEvidence[];
  maxWeightPerLineage: number;
  abstainedAgentIds?: readonly string[];
  contractRegistry?: BeliefContractRegistry;
}): BeliefPoolResult {
  if (!Number.isFinite(input.maxWeightPerLineage) || input.maxWeightPerLineage <= 0) {
    throw new Error("maxWeightPerLineage must be positive and finite");
  }
  const abstainedAgentIds = uniqueSorted(input.abstainedAgentIds ?? []);
  assertAbstainersAreExcluded(input.latestReports, abstainedAgentIds);
  const reports = validateInputs(
    input.claim,
    input.latestReports,
    input.contractRegistry ?? defaultBeliefContractRegistry,
  );
  if (reports.length === 0) {
    return {
      status: "unavailable",
      policyRef: LINEAGE_CAPPED_LINEAR_POOL_V1,
      claimId: input.claim.id,
      reason: "no_active_reports",
      missingLineageReportIds: [],
      abstainedAgentIds,
    };
  }
  const evidenceById = new Map(input.evidence.map(item => [item.id, item]));
  if (evidenceById.size !== input.evidence.length) throw new Error("belief pool evidence must have unique ids");
  const reportHasMissingLineage: boolean[] = [];
  const reportLineages = reports.map(report => {
    let missing = report.evidence.length === 0;
    const lineages = uniqueSorted(report.evidence.map(reference => {
    const item = evidenceById.get(reference.evidenceId);
    if (!item) throw new Error(`Unknown evidence ${reference.evidenceId} in report ${report.id}`);
    if (!item.provenance.lineageId) missing = true;
    return item.provenance.lineageId ?? "";
    }).filter(Boolean));
    reportHasMissingLineage.push(missing);
    return lineages;
  });
  const missingLineageReportIds = reports
    .filter((_, index) => reportHasMissingLineage[index] || reportLineages[index].length === 0)
    .map(report => report.id)
    .sort();
  if (missingLineageReportIds.length > 0) {
    return {
      status: "unavailable",
      policyRef: LINEAGE_CAPPED_LINEAR_POOL_V1,
      claimId: input.claim.id,
      reason: "missing_lineage",
      missingLineageReportIds,
      abstainedAgentIds,
    };
  }

  const rawLineageMass = new Map<string, number>();
  for (const lineages of reportLineages) {
    for (const lineage of lineages) {
      rawLineageMass.set(lineage, (rawLineageMass.get(lineage) ?? 0) + 1);
    }
  }
  const lineageScale = new Map<string, number>();
  for (const [lineage, mass] of rawLineageMass) {
    lineageScale.set(lineage, Math.min(1, input.maxWeightPerLineage / mass));
  }
  const weights = reportLineages.map(lineages => {
    return Math.min(...lineages.map(lineage => lineageScale.get(lineage)!));
  });
  return {
    status: "available",
    policyRef: LINEAGE_CAPPED_LINEAR_POOL_V1,
    claimId: input.claim.id,
    value: weightedPool(input.claim, reports, weights),
    contributions: makeContributions(reports, reportLineages, weights),
    abstainedAgentIds,
  };
}

/** Exact ties abstain; no hidden canonical-order advantage is introduced. */
export function decidePooledBelief(pool: BeliefPoolResult): PooledDecision {
  if (pool.status === "unavailable") {
    return {
      status: "abstained",
      decisionContractRef: ABSTAIN_ON_TIE_DECISION_V1,
      claimId: pool.claimId,
      reason: "pool_unavailable",
    };
  }
  if (pool.value.kind === "binary") {
    if (!Number.isFinite(pool.value.probability)) throw new Error("pooled binary probability must be finite");
    if (Math.abs(pool.value.probability - 0.5) <= ABSTAIN_ON_TIE_DECISION_V1.tieTolerance) {
      return {
        status: "abstained",
        decisionContractRef: ABSTAIN_ON_TIE_DECISION_V1,
        claimId: pool.claimId,
        reason: "exact_tie",
      };
    }
    return {
      status: "decided",
      decisionContractRef: ABSTAIN_ON_TIE_DECISION_V1,
      claimId: pool.claimId,
      outcome: pool.value.probability > 0.5,
    };
  }
  if (Object.values(pool.value.probabilities).some(probability => !Number.isFinite(probability))) {
    throw new Error("pooled categorical probabilities must be finite");
  }
  const maximum = Math.max(...Object.values(pool.value.probabilities));
  const winners = Object.entries(pool.value.probabilities)
    .filter(([, probability]) => Math.abs(probability - maximum) <= ABSTAIN_ON_TIE_DECISION_V1.tieTolerance)
    .map(([option]) => option);
  if (winners.length !== 1) {
    return {
      status: "abstained",
      decisionContractRef: ABSTAIN_ON_TIE_DECISION_V1,
      claimId: pool.claimId,
      reason: "exact_tie",
    };
  }
  return {
    status: "decided",
    decisionContractRef: ABSTAIN_ON_TIE_DECISION_V1,
    claimId: pool.claimId,
    outcome: winners[0],
  };
}
