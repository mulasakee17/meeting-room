import type { BeliefReport, ClaimResolution } from "./types";

export interface BinaryReportScore {
  brierLoss: number;
  stakeWeightedLoss: number;
}

/** Strictly proper quadratic loss for a resolved binary claim. */
export function scoreBinaryReport(
  report: Pick<BeliefReport, "claimId" | "probability" | "stake">,
  resolution: Pick<ClaimResolution, "claimId" | "outcome">,
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

  const outcome = resolution.outcome ? 1 : 0;
  const brierLoss = (report.probability - outcome) ** 2;
  return {
    brierLoss,
    stakeWeightedLoss: report.stake * brierLoss,
  };
}
