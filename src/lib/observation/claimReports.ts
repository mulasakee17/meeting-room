import type { ClaimBeliefSubmission } from "../discussion/types";

export interface ParsedClaimReports {
  claimReports?: ClaimBeliefSubmission[];
  claimParseStatus: "not_applicable" | "valid" | "incomplete" | "invalid";
}

/** Fail-closed syntax boundary for model-authored probability reports. */
export function parseClaimReports(value: unknown): ParsedClaimReports {
  if (value === undefined) return { claimParseStatus: "not_applicable" };
  if (!Array.isArray(value)) return { claimReports: [], claimParseStatus: "invalid" };
  if (value.length === 0) return { claimReports: [], claimParseStatus: "incomplete" };

  const reports: ClaimBeliefSubmission[] = [];
  const claimIds = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return { claimReports: [], claimParseStatus: "invalid" };
    const candidate = raw as Record<string, unknown>;
    if (typeof candidate.claimId !== "string" || candidate.claimId.trim().length === 0) {
      return { claimReports: [], claimParseStatus: "invalid" };
    }
    if (claimIds.has(candidate.claimId)) return { claimReports: [], claimParseStatus: "invalid" };
    const hasBinaryValue = Object.prototype.hasOwnProperty.call(candidate, "probability");
    const hasCategoricalValue = Object.prototype.hasOwnProperty.call(candidate, "probabilities");
    if (hasBinaryValue === hasCategoricalValue) {
      return { claimReports: [], claimParseStatus: "invalid" };
    }
    let value: ClaimBeliefSubmission["value"];
    if (hasBinaryValue) {
      if (typeof candidate.probability !== "number"
        || !Number.isFinite(candidate.probability)
        || candidate.probability < 0
        || candidate.probability > 1) {
        return { claimReports: [], claimParseStatus: "invalid" };
      }
      value = { kind: "binary", probability: candidate.probability };
    } else {
      if (!candidate.probabilities
        || typeof candidate.probabilities !== "object"
        || Array.isArray(candidate.probabilities)) {
        return { claimReports: [], claimParseStatus: "invalid" };
      }
      const probabilities: Record<string, number> = {};
      for (const [option, probability] of Object.entries(candidate.probabilities as Record<string, unknown>)) {
        if (option.trim().length === 0
          || typeof probability !== "number"
          || !Number.isFinite(probability)
          || probability < 0
          || probability > 1) {
          return { claimReports: [], claimParseStatus: "invalid" };
        }
        probabilities[option] = probability;
      }
      if (Object.keys(probabilities).length === 0) {
        return { claimReports: [], claimParseStatus: "invalid" };
      }
      value = { kind: "categorical", probabilities };
    }
    if (!Array.isArray(candidate.evidence)) return { claimReports: [], claimParseStatus: "invalid" };

    const evidence: ClaimBeliefSubmission["evidence"] = [];
    for (const rawEvidence of candidate.evidence) {
      if (!rawEvidence || typeof rawEvidence !== "object") {
        return { claimReports: [], claimParseStatus: "invalid" };
      }
      const item = rawEvidence as Record<string, unknown>;
      if (typeof item.content !== "string" || item.content.trim().length === 0
        || (item.relation !== "supports" && item.relation !== "attacks")) {
        return { claimReports: [], claimParseStatus: "invalid" };
      }
      evidence.push({ content: item.content, relation: item.relation });
    }

    claimIds.add(candidate.claimId);
    reports.push({
      claimId: candidate.claimId,
      value,
      evidence,
    });
  }

  return { claimReports: reports, claimParseStatus: "valid" };
}
