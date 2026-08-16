import type {
  BeliefReport,
  EpistemicClaim,
  EpistemicEvidence,
} from "../../../src/lib/epistemic/types";
import { defaultBeliefContractRegistry } from "../../../src/lib/epistemic/contracts";

export const PROCESS_STATE_V2_REF = Object.freeze({
  id: "swarmalpha.measurement.pre-action-process-state",
  version: "2.0.0",
});

export const PROCESS_STATE_V2_FEATURE_NAMES = Object.freeze([
  "reportCoverage",
  "meanReportedCertainty",
  "meanPairwiseTotalVariation",
  "pooledTopTwoMargin",
  "argmaxVoteConcentration",
  "minorityMaxCertainty",
  "meanEvidenceContentOverlap",
  "evidenceReferenceCoverage",
  "inverseOptionCount",
] as const);

export type ProcessStateFeatureV2Name = typeof PROCESS_STATE_V2_FEATURE_NAMES[number];

export interface ProcessStateFeatureInputV2 {
  claim: EpistemicClaim;
  expectedAgentIds: readonly string[];
  /** Must be the complete terminal set of valid round-1 reports. */
  roundOneReports: readonly BeliefReport[];
  /** Evidence registered no later than the end of round 1. */
  roundOneEvidence: readonly EpistemicEvidence[];
}

export interface ProcessStateFeaturesV2 {
  measurementRef: typeof PROCESS_STATE_V2_REF;
  timing: "after_round_1_before_action_assignment";
  values: Readonly<Record<ProcessStateFeatureV2Name, number>>;
  diagnostics: {
    expectedAgentCount: number;
    validReportCount: number;
    optionCount: number;
    minorityReportCount: number;
  };
}

const TOLERANCE = 1e-12;

function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error("process state v2 mean requires values");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function optionNames(claim: EpistemicClaim): string[] {
  if (claim.resolutionPolicy.kind === "binary") return ["false", "true"];
  if (!("options" in claim) || claim.options.length < 2) {
    throw new Error("process state v2 categorical claim requires canonical options");
  }
  return [...claim.options];
}

function vector(claim: EpistemicClaim, report: BeliefReport, options: readonly string[]): number[] {
  const normalized = defaultBeliefContractRegistry.get(claim.resolutionPolicy.kind)
    .normalizeValue(claim, report.value);
  return normalized.kind === "binary"
    ? [1 - normalized.probability, normalized.probability]
    : options.map(option => normalized.probabilities[option]);
}

function argmaxSet(values: readonly number[]): number[] {
  const maximum = Math.max(...values);
  return values.flatMap((value, index) => Math.abs(value - maximum) <= TOLERANCE ? [index] : []);
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

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter(value => right.has(value)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Frozen prospective state representation for the next discovery trial.
 *
 * It has no outcome, resolution, prompt-text, model identity, or action input.
 * Evidence identity is content-hash based: repeated wording counts as overlap;
 * self-declared lineage does not count as verified independence.
 */
export function deriveProcessStateFeaturesV2(input: ProcessStateFeatureInputV2): ProcessStateFeaturesV2 {
  const expectedAgentIds = [...input.expectedAgentIds];
  if (expectedAgentIds.length < 2
    || expectedAgentIds.some(agentId => typeof agentId !== "string" || agentId.trim().length === 0)
    || new Set(expectedAgentIds).size !== expectedAgentIds.length) {
    throw new Error("process state v2 requires a unique non-empty expected roster");
  }
  if (input.roundOneReports.length === 0) throw new Error("process state v2 requires a valid round-1 report");
  const reportAgents = input.roundOneReports.map(report => report.agentId);
  if (new Set(reportAgents).size !== reportAgents.length
    || reportAgents.some(agentId => !expectedAgentIds.includes(agentId))) {
    throw new Error("process state v2 round-1 reports must be unique members of the roster");
  }
  if (input.roundOneReports.some(report => report.round !== 1 || report.claimId !== input.claim.id)) {
    throw new Error("process state v2 accepts only reports for the frozen claim at round 1");
  }
  const evidenceById = new Map(input.roundOneEvidence.map(evidence => [evidence.id, evidence]));
  if (evidenceById.size !== input.roundOneEvidence.length) {
    throw new Error("process state v2 evidence ids must be unique");
  }
  const options = optionNames(input.claim);
  const vectors = input.roundOneReports.map(report => vector(input.claim, report, options));
  const certainties = vectors.map(values => Math.max(...values));
  const pooled = options.map((_, index) => mean(vectors.map(values => values[index])));
  const pooledArgmax = new Set(argmaxSet(pooled));
  const voteMass = Array.from({ length: options.length }, () => 0);
  const reportArgmax = vectors.map(values => argmaxSet(values));
  for (const indices of reportArgmax) {
    for (const index of indices) voteMass[index] += 1 / indices.length;
  }
  const minorityIndices = reportArgmax.flatMap((indices, reportIndex) => (
    indices.some(index => pooledArgmax.has(index)) ? [] : [reportIndex]
  ));
  const evidenceSets = input.roundOneReports.map(report => new Set(report.evidence.map(reference => {
    const evidence = evidenceById.get(reference.evidenceId);
    if (!evidence) throw new Error("process state v2 report references missing round-1 evidence");
    return evidence.provenance.contentHash;
  })));
  const overlaps: number[] = [];
  for (let left = 0; left < evidenceSets.length; left += 1) {
    for (let right = left + 1; right < evidenceSets.length; right += 1) {
      overlaps.push(jaccard(evidenceSets[left], evidenceSets[right]));
    }
  }
  const orderedPooled = [...pooled].sort((left, right) => right - left);
  const values: Record<ProcessStateFeatureV2Name, number> = {
    reportCoverage: input.roundOneReports.length / expectedAgentIds.length,
    meanReportedCertainty: mean(certainties),
    meanPairwiseTotalVariation: pairwiseTotalVariation(vectors),
    pooledTopTwoMargin: orderedPooled[0] - orderedPooled[1],
    argmaxVoteConcentration: Math.max(...voteMass) / input.roundOneReports.length,
    minorityMaxCertainty: minorityIndices.length
      ? Math.max(...minorityIndices.map(index => certainties[index]))
      : 0,
    meanEvidenceContentOverlap: overlaps.length ? mean(overlaps) : 0,
    evidenceReferenceCoverage: evidenceSets.filter(set => set.size > 0).length / input.roundOneReports.length,
    inverseOptionCount: 1 / options.length,
  };
  if (Object.values(values).some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error("process state v2 derived feature outside [0,1]");
  }
  return Object.freeze({
    measurementRef: PROCESS_STATE_V2_REF,
    timing: "after_round_1_before_action_assignment" as const,
    values: Object.freeze(values),
    diagnostics: Object.freeze({
      expectedAgentCount: expectedAgentIds.length,
      validReportCount: input.roundOneReports.length,
      optionCount: options.length,
      minorityReportCount: minorityIndices.length,
    }),
  });
}
