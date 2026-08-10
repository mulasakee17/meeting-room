import {
  defaultBeliefContractRegistry,
  type BeliefContractRegistry,
} from "./contracts";
import type { BeliefValue, EpistemicClaim } from "./types";

export type BeliefGeometry = BinaryBeliefGeometry | CategoricalBeliefGeometry;

export interface BinaryBeliefGeometry {
  kind: "binary";
  certainty: number;
  topTwoMargin: number;
  normalizedEntropy: number;
  predictedOutcomes: boolean[];
}

export interface CategoricalBeliefGeometry {
  kind: "categorical";
  certainty: number;
  topTwoMargin: number;
  normalizedEntropy: number;
  /** Sorted identifiers make exact ties independent of claim option order. */
  predictedOutcomes: string[];
}

/**
 * Deterministic geometry of an explicit probability report. It does not use
 * truth, evidence quality, or latent-state inference.
 */
export function summarizeBeliefGeometry(
  claim: EpistemicClaim,
  value: BeliefValue,
  contractRegistry: BeliefContractRegistry = defaultBeliefContractRegistry,
): BeliefGeometry {
  const contract = contractRegistry.get(claim.resolutionPolicy.kind);
  contract.validateValue(claim, value);
  const normalizedEntropy = contract.uncertainty(value);
  if (value.kind === "binary") {
    const certainty = Math.max(value.probability, 1 - value.probability);
    const predictedOutcomes = value.probability === 0.5
      ? [false, true]
      : [value.probability > 0.5];
    return {
      kind: "binary",
      certainty,
      topTwoMargin: Math.abs(2 * value.probability - 1),
      normalizedEntropy,
      predictedOutcomes,
    };
  }

  const ranked = Object.entries(value.probabilities)
    .map(([option, probability]) => ({ option, probability }))
    .sort((left, right) => right.probability - left.probability || left.option.localeCompare(right.option));
  const certainty = ranked[0].probability;
  const predictedOutcomes = ranked
    .filter(entry => Math.abs(entry.probability - certainty) <= Number.EPSILON)
    .map(entry => entry.option)
    .sort();
  return {
    kind: "categorical",
    certainty,
    topTwoMargin: certainty - ranked[1].probability,
    normalizedEntropy,
    predictedOutcomes,
  };
}
