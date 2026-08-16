/**
 * Un-discussed evidence disclosure — deterministic pure selector (zero provider).
 *
 * Design (owner 2026-08-15). The exchange screen's measured failure mode is
 * that it surfaces the evidence of the max-disagreement pair, amplifying the
 * loudest (and possibly wrong) positions while leaving the hidden profile — the
 * unique private information that the discussion never touched — undiscussed.
 * This intervention is the inverse: it surfaces the private information that NO
 * round-1 report referenced, i.e. the evidence the discussion left out.
 *
 * Frozen rules:
 *  - "un-discussed" := a committed private-information content hash matches no
 *    round-1 evidence reference (coverage = 0). Threshold 0 is frozen; a
 *    `<=1` threshold is a future design, not an outcome-driven re-tuning.
 *  - Detection is verbatim-only: hash equality means the model reproduced the
 *    private information word-for-word as evidence. A paraphrased citation does
 *    not match and is (conservatively) still treated as un-discussed.
 *  - Duplicate private-information hashes make source identity ambiguous and
 *    fail closed (no disclosure).
 *
 * Pure and outcome-free: reads only round-1 evidence references, the registered
 * evidence content hashes, and the task's committed private information. Never
 * ground truth, never the treatment arm, never a correctness claim.
 */

import { createHash } from "node:crypto";

export interface UnDiscussedPrivateInfoV1 {
  agentId: string;
  privateInformation: string;
  privateInformationHash: string;
}

export interface UnDiscussedEvidenceSelectorInputV1 {
  roundOneReports: ReadonlyArray<{
    agentId: string;
    evidenceRefs: ReadonlyArray<{ evidenceId: string }>;
  }>;
  /** Resolve an evidence reference to its registered content hash; undefined when absent. */
  getEvidenceContentHash: (evidenceId: string) => string | undefined;
  /** Task roster private information, in roster order. */
  privateInformation: ReadonlyArray<{ agentId: string; privateInformation: string }>;
}

/** Frozen coverage threshold: disclose private info referenced by zero reports. */
export const UN_DISCUSSED_COVERAGE_THRESHOLD = 0;

function hashText(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

/**
 * Select the committed private information not referenced by any round-1 report.
 * Fails closed (returns []) on duplicate private-information content hashes,
 * because then a referenced hash cannot be attributed to a unique owner.
 */
export function selectUnDiscussedEvidenceV1(
  input: UnDiscussedEvidenceSelectorInputV1,
): UnDiscussedPrivateInfoV1[] {
  const referenced = new Set<string>();
  for (const report of input.roundOneReports) {
    for (const ref of report.evidenceRefs) {
      const hash = input.getEvidenceContentHash(ref.evidenceId);
      if (hash !== undefined) referenced.add(hash);
    }
  }
  const seen = new Set<string>();
  const items: UnDiscussedPrivateInfoV1[] = [];
  for (const item of input.privateInformation) {
    const privateInformationHash = hashText(item.privateInformation);
    if (seen.has(privateInformationHash)) return []; // ambiguous identity -> fail closed
    seen.add(privateInformationHash);
    if (!referenced.has(privateInformationHash)) {
      items.push({ agentId: item.agentId, privateInformation: item.privateInformation, privateInformationHash });
    }
  }
  return items;
}

/**
 * Build the neutral, auditable governance message listing the un-discussed
 * private information in roster order. Never claims correctness.
 */
export function buildUnDiscussedEvidenceMessageV1(items: UnDiscussedPrivateInfoV1[]): string {
  const lines = [
    "[Experiment-authorized un-discussed evidence disclosure]",
    "status: recorded input; not a correctness certificate",
  ];
  for (const item of items) {
    lines.push(`- sourceAgentId: ${item.agentId}; contentHash: ${item.privateInformationHash}`);
    lines.push(`  observation: ${item.privateInformation}`);
  }
  return lines.join("\n");
}

/**
 * Full deterministic selector: select + build, or null when nothing is
 * un-discussed (or identity is ambiguous). Drop-in shape for the slice's
 * injected selector callback.
 */
export function createUnDiscussedEvidenceSelectorV1(): (
  input: UnDiscussedEvidenceSelectorInputV1,
) => string | null {
  return (input: UnDiscussedEvidenceSelectorInputV1): string | null => {
    const items = selectUnDiscussedEvidenceV1(input);
    if (items.length === 0) return null;
    return buildUnDiscussedEvidenceMessageV1(items);
  };
}
