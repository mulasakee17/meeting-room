import type {
  BeliefKind,
  BeliefValue,
  ClaimResolution,
  EpistemicClaim,
} from "./types";
import type { CategoricalEpistemicClaim } from "./types";

const PROBABILITY_TOLERANCE = 1e-6;

function requireNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) throw new Error(`${field} must not be empty`);
}

function validateProbability(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be finite and within [0, 1]`);
  }
}

export function isCategoricalClaim(claim: EpistemicClaim): claim is CategoricalEpistemicClaim {
  return claim.resolutionPolicy.kind === "categorical" && "options" in claim;
}

/** Task-family semantics; the ledger remains an invariant-enforcing container. */
export interface BeliefContract {
  readonly kind: BeliefKind;
  validateClaim(claim: EpistemicClaim): void;
  validateValue(claim: EpistemicClaim, value: BeliefValue): void;
  normalizeValue(claim: EpistemicClaim, value: BeliefValue): BeliefValue;
  validateResolution(claim: EpistemicClaim, resolution: ClaimResolution): void;
  formatValue(value: BeliefValue): string;
  /** Normalized task-family distance in [0,1]; descriptive, not causal. */
  distance(left: BeliefValue, right: BeliefValue): number;
  /** Normalized distributional entropy in [0,1]; not self-reported confidence. */
  uncertainty(value: BeliefValue): number;
  properLoss(claim: EpistemicClaim, value: BeliefValue, resolution: ClaimResolution): number;
}

function binaryEntropy(probability: number): number {
  if (probability === 0 || probability === 1) return 0;
  return -(probability * Math.log(probability)
    + (1 - probability) * Math.log(1 - probability)) / Math.log(2);
}

const binaryContract: BeliefContract = {
  kind: "binary",
  validateClaim(claim) {
    if (claim.resolutionPolicy.kind !== "binary") throw new Error("Binary contract received a non-binary claim");
  },
  validateValue(claim, value) {
    this.validateClaim(claim);
    if (value.kind !== "binary") throw new Error(`Belief kind ${value.kind} does not match binary claim ${claim.id}`);
    validateProbability(value.probability, "belief.probability");
  },
  normalizeValue(claim, value) {
    this.validateValue(claim, value);
    if (value.kind !== "binary") throw new Error("Unreachable binary contract mismatch");
    return { kind: "binary", probability: value.probability };
  },
  validateResolution(claim, resolution) {
    this.validateClaim(claim);
    if (resolution.kind !== "binary" || typeof resolution.outcome !== "boolean") {
      throw new Error(`Resolution kind does not match binary claim ${claim.id}`);
    }
  },
  formatValue(value) {
    if (value.kind !== "binary") throw new Error("Cannot format a non-binary value as binary");
    // Preserve the existing compact prompt projection for binary reports.
    return `P(${value.probability.toFixed(4)})`;
  },
  distance(left, right) {
    if (left.kind !== "binary" || right.kind !== "binary") {
      throw new Error("Binary distance requires two binary values");
    }
    validateProbability(left.probability, "left belief.probability");
    validateProbability(right.probability, "right belief.probability");
    return Math.abs(left.probability - right.probability);
  },
  uncertainty(value) {
    if (value.kind !== "binary") throw new Error("Binary uncertainty requires a binary value");
    validateProbability(value.probability, "belief.probability");
    return binaryEntropy(value.probability);
  },
  properLoss(claim, value, resolution) {
    this.validateValue(claim, value);
    this.validateResolution(claim, resolution);
    if (value.kind !== "binary" || resolution.kind !== "binary") throw new Error("Unreachable binary contract mismatch");
    return (value.probability - (resolution.outcome ? 1 : 0)) ** 2;
  },
};

const categoricalContract: BeliefContract = {
  kind: "categorical",
  validateClaim(claim) {
    if (!isCategoricalClaim(claim)) throw new Error("Categorical contract received a non-categorical claim");
    if (!Array.isArray(claim.options) || claim.options.length < 2) {
      throw new Error("categorical claim.options must contain at least two options");
    }
    for (const option of claim.options) requireNonEmpty(option, "categorical claim option");
    if (new Set(claim.options).size !== claim.options.length) {
      throw new Error("categorical claim.options must not contain duplicates");
    }
  },
  validateValue(claim, value) {
    this.validateClaim(claim);
    if (!isCategoricalClaim(claim) || value.kind !== "categorical") {
      throw new Error(`Belief kind ${value.kind} does not match categorical claim ${claim.id}`);
    }
    const actualOptions = Object.keys(value.probabilities);
    const expectedOptions = claim.options;
    if (actualOptions.length !== expectedOptions.length
      || expectedOptions.some(option => !Object.prototype.hasOwnProperty.call(value.probabilities, option))) {
      throw new Error(`Categorical belief for ${claim.id} must assign every canonical option exactly once`);
    }
    let total = 0;
    for (const option of expectedOptions) {
      const probability = value.probabilities[option];
      validateProbability(probability, `belief.probabilities.${option}`);
      total += probability;
    }
    if (Math.abs(total - 1) > PROBABILITY_TOLERANCE) {
      throw new Error(`Categorical belief probabilities for ${claim.id} must sum to 1`);
    }
  },
  normalizeValue(claim, value) {
    this.validateValue(claim, value);
    if (!isCategoricalClaim(claim) || value.kind !== "categorical") {
      throw new Error("Unreachable categorical contract mismatch");
    }
    return {
      kind: "categorical",
      probabilities: Object.fromEntries(
        claim.options.map(option => [option, value.probabilities[option]]),
      ),
    };
  },
  validateResolution(claim, resolution) {
    this.validateClaim(claim);
    if (!isCategoricalClaim(claim)
      || resolution.kind !== "categorical"
      || !claim.options.includes(resolution.outcome)) {
      throw new Error(`Resolution outcome is not a canonical option for categorical claim ${claim.id}`);
    }
  },
  formatValue(value) {
    if (value.kind !== "categorical") throw new Error("Cannot format a non-categorical value as categorical");
    return Object.entries(value.probabilities)
      .map(([option, probability]) => `P(${option})=${probability.toFixed(4)}`)
      .join(";");
  },
  distance(left, right) {
    if (left.kind !== "categorical" || right.kind !== "categorical") {
      throw new Error("Categorical distance requires two categorical values");
    }
    const leftOptions = Object.keys(left.probabilities);
    const rightOptions = Object.keys(right.probabilities);
    if (leftOptions.length !== rightOptions.length
      || leftOptions.some(option => !Object.prototype.hasOwnProperty.call(right.probabilities, option))) {
      throw new Error("Categorical distance requires identical canonical option sets");
    }
    let leftTotal = 0;
    let rightTotal = 0;
    let l1Distance = 0;
    for (const option of leftOptions) {
      const leftProbability = left.probabilities[option];
      const rightProbability = right.probabilities[option];
      validateProbability(leftProbability, `left belief.probabilities.${option}`);
      validateProbability(rightProbability, `right belief.probabilities.${option}`);
      leftTotal += leftProbability;
      rightTotal += rightProbability;
      l1Distance += Math.abs(leftProbability - rightProbability);
    }
    if (Math.abs(leftTotal - 1) > PROBABILITY_TOLERANCE
      || Math.abs(rightTotal - 1) > PROBABILITY_TOLERANCE) {
      throw new Error("Categorical distance requires probabilities that sum to 1");
    }
    return 0.5 * l1Distance;
  },
  uncertainty(value) {
    if (value.kind !== "categorical") throw new Error("Categorical uncertainty requires a categorical value");
    const probabilities = Object.values(value.probabilities);
    if (probabilities.length < 2) throw new Error("Categorical uncertainty requires at least two options");
    let total = 0;
    let entropy = 0;
    for (const probability of probabilities) {
      validateProbability(probability, "belief.probabilities");
      total += probability;
      if (probability > 0) entropy -= probability * Math.log(probability);
    }
    if (Math.abs(total - 1) > PROBABILITY_TOLERANCE) {
      throw new Error("Categorical uncertainty requires probabilities that sum to 1");
    }
    return entropy / Math.log(probabilities.length);
  },
  properLoss(claim, value, resolution) {
    this.validateValue(claim, value);
    this.validateResolution(claim, resolution);
    if (!isCategoricalClaim(claim)
      || value.kind !== "categorical"
      || resolution.kind !== "categorical") {
      throw new Error("Unreachable categorical contract mismatch");
    }
    return claim.options.reduce((loss, option) => {
      const target = option === resolution.outcome ? 1 : 0;
      return loss + (value.probabilities[option] - target) ** 2;
    }, 0);
  },
};

/** Explicit registry boundary; callers may inject an isolated supported-kind registry. */
export class BeliefContractRegistry {
  private readonly contracts = new Map<BeliefKind, BeliefContract>();
  private sealed = false;

  constructor(initialContracts: BeliefContract[] = []) {
    for (const contract of initialContracts) this.register(contract);
  }

  register(contract: BeliefContract): void {
    if (this.sealed) throw new Error("BeliefContractRegistry is sealed");
    if (this.contracts.has(contract.kind)) {
      throw new Error(`Belief contract ${contract.kind} already exists`);
    }
    this.contracts.set(contract.kind, contract);
  }

  get(kind: BeliefKind): BeliefContract {
    const contract = this.contracts.get(kind);
    if (!contract) throw new Error(`Belief contract ${kind} is not registered`);
    return contract;
  }

  listKinds(): BeliefKind[] {
    return [...this.contracts.keys()];
  }

  snapshot(): BeliefContractRegistry {
    return new BeliefContractRegistry(
      [...this.contracts.values()].map(contract => ({ ...contract })),
    );
  }

  seal(): this {
    for (const contract of this.contracts.values()) Object.freeze(contract);
    this.sealed = true;
    return this;
  }
}

export function createDefaultBeliefContractRegistry(): BeliefContractRegistry {
  return new BeliefContractRegistry([binaryContract, categoricalContract]);
}

export const defaultBeliefContractRegistry = createDefaultBeliefContractRegistry().seal();

export function getBeliefContract(kind: BeliefKind): BeliefContract {
  return defaultBeliefContractRegistry.get(kind);
}

export function validateEpistemicClaim(
  claim: EpistemicClaim,
  contractRegistry: BeliefContractRegistry = defaultBeliefContractRegistry,
): void {
  requireNonEmpty(claim.id, "claim.id");
  requireNonEmpty(claim.proposition, "claim.proposition");
  requireNonEmpty(claim.domain, "claim.domain");
  requireNonEmpty(claim.resolutionPolicy.resolverId, "claim.resolutionPolicy.resolverId");
  contractRegistry.get(claim.resolutionPolicy.kind).validateClaim(claim);
}
