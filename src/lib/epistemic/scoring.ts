import {
  defaultBeliefContractRegistry,
  type BeliefContractRegistry,
} from "./contracts";
import type {
  BeliefKind,
  BeliefReport,
  ClaimResolution,
  EpistemicClaim,
} from "./types";

export interface BeliefReportScore {
  kind: BeliefKind;
  properLoss: number;
  stakeWeightedLoss: number;
}

export interface BinaryReportScore {
  brierLoss: number;
  stakeWeightedLoss: number;
}

export interface CategoricalReportScore {
  brierLoss: number;
  stakeWeightedLoss: number;
}

/** Score any supported report using the proper loss owned by its claim contract. */
export function scoreBeliefReport(
  claim: EpistemicClaim,
  report: Pick<BeliefReport, "claimId" | "value" | "stake">,
  resolution: ClaimResolution,
  contractRegistry: BeliefContractRegistry = defaultBeliefContractRegistry,
): BeliefReportScore {
  if (claim.id !== report.claimId || claim.id !== resolution.claimId) {
    throw new Error("Cannot score a report or resolution against a different claim");
  }
  if (!Number.isFinite(report.stake) || report.stake < 0) {
    throw new Error("Report stake must be finite and non-negative");
  }
  const contract = contractRegistry.get(claim.resolutionPolicy.kind);
  const properLoss = contract.properLoss(claim, report.value, resolution);
  return {
    kind: contract.kind,
    properLoss,
    stakeWeightedLoss: report.stake * properLoss,
  };
}

/** Backward-compatible binary scoring primitive for callers without a claim object. */
export function scoreBinaryReport(
  report: { claimId: string; probability: number; stake: number },
  resolution: { claimId: string; outcome: boolean },
): BinaryReportScore {
  if (report.claimId !== resolution.claimId) {
    throw new Error("Cannot score a report against a different claim");
  }
  if (!Number.isFinite(report.probability) || report.probability < 0 || report.probability > 1) {
    throw new Error("Report probability must be finite and within [0, 1]");
  }
  if (!Number.isFinite(report.stake) || report.stake < 0) {
    throw new Error("Report stake must be finite and non-negative");
  }
  const brierLoss = (report.probability - (resolution.outcome ? 1 : 0)) ** 2;
  return { brierLoss, stakeWeightedLoss: report.stake * brierLoss };
}

/** Multiclass Brier loss (sum over the canonical simplex coordinates). */
export function scoreCategoricalReport(
  claim: Extract<EpistemicClaim, { resolutionPolicy: { kind: "categorical" } }>,
  report: Pick<BeliefReport, "claimId" | "value" | "stake">,
  resolution: Extract<ClaimResolution, { kind: "categorical" }>,
  contractRegistry: BeliefContractRegistry = defaultBeliefContractRegistry,
): CategoricalReportScore {
  const scored = scoreBeliefReport(claim, report, resolution, contractRegistry);
  return { brierLoss: scored.properLoss, stakeWeightedLoss: scored.stakeWeightedLoss };
}
