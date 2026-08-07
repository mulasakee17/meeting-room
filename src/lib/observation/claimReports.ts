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
    if (typeof candidate.probability !== "number"
      || !Number.isFinite(candidate.probability)
      || candidate.probability < 0
      || candidate.probability > 1) {
      return { claimReports: [], claimParseStatus: "invalid" };
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
      probability: candidate.probability,
      evidence,
    });
  }

  return { claimReports: reports, claimParseStatus: "valid" };
}
