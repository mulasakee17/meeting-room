/**
 * Cross-evidence exchange — deterministic pure selectors (zero provider).
 *
 * Frozen design (owner 2026-08-14): when round-1 reports show strong
 * disagreement (max pairwise total variation >= a frozen threshold), the
 * governance exchange surfaces the registered evidence that supports each side's
 * top-1 option to the group. This is a deterministic, auditable, zero-cost
 * delivery of information that the round-2 public transcript does not otherwise
 * contain (the transcript carries only natural-language message text, not the
 * registered evidence content).
 *
 * These functions are pure and outcome-free: they read only round-1 reports,
 * their evidence references, and the registered evidence. Never ground truth.
 */

export type TvPairV1 = { agentA: string; agentB: string; maxTV: number };

export interface RoundOneReportV1 {
  agentId: string;
  /** option -> probability */
  probabilities: Record<string, number>;
  /** evidence references with relation to the report's position. */
  evidenceRefs: Array<{ evidenceId: string; relation: "supports" | "attacks" }>;
}

export interface RegisteredEvidenceV1 {
  evidenceId: string;
  content: string;
  contentHash: string;
}

/** Total variation distance between two categorical probability vectors. */
export function pairwiseTotalVariationV1(
  p: Record<string, number>,
  q: Record<string, number>,
): number {
  const keys = new Set([...Object.keys(p), ...Object.keys(q)]);
  let total = 0;
  for (const key of keys) total += Math.abs((p[key] ?? 0) - (q[key] ?? 0));
  return 0.5 * total;
}

/**
 * Deterministically select the round-1 pair with maximum pairwise TV. Ties are
 * broken by the lexicographically smallest ordered agent pair (frozen rule), so
 * the selection is unique and replayable. Returns null when fewer than two
 * reports exist.
 */
export function selectMaxDisagreementPairV1(reports: RoundOneReportV1[]): TvPairV1 | null {
  if (reports.length < 2) return null;
  let best: TvPairV1 | null = null;
  for (let i = 0; i < reports.length; i++) {
    for (let j = i + 1; j < reports.length; j++) {
      const tv = pairwiseTotalVariationV1(reports[i].probabilities, reports[j].probabilities);
      const key = [reports[i].agentId, reports[j].agentId].sort().join(":");
      if (best === null
        || tv > best.maxTV
        || (tv === best.maxTV && key < [best.agentA, best.agentB].sort().join(":"))) {
        best = { agentA: reports[i].agentId, agentB: reports[j].agentId, maxTV: tv };
      }
    }
  }
  return best;
}

function topOption(probabilities: Record<string, number>): string {
  return Object.entries(probabilities).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
}

/**
 * Select each side's registered evidence of the given relation for the given
 * round-1 report. Deterministic: sorted by evidenceId.
 *
 * `supports` = each side's confirming evidence (why their own top-1 is right).
 * `attacks` = each side's disconfirming evidence (why some option is wrong).
 * The original exchange surfaced only `supports`, which amplified each side's
 * position while dropping the disconfirming evidence that would eliminate wrong
 * options. Both relations are available in round 1; the relation is a frozen
 * parameter of the experiment, not a model choice.
 */
export function selectCrossEvidenceV1(input: {
  reports: RoundOneReportV1[];
  evidenceRegistry: Map<string, RegisteredEvidenceV1>;
  pair: TvPairV1;
  relation?: "supports" | "attacks";
}): { agentA: string; agentB: string; aEvidence: RegisteredEvidenceV1[]; bEvidence: RegisteredEvidenceV1[]; aTop: string; bTop: string; relation: "supports" | "attacks" } {
  const relation = input.relation ?? "supports";
  const byAgent = new Map(input.reports.map(report => [report.agentId, report]));
  const aReport = byAgent.get(input.pair.agentA);
  const bReport = byAgent.get(input.pair.agentB);
  if (!aReport || !bReport) throw new Error("cross-evidence pair agent missing a round-1 report");
  const selected = (report: RoundOneReportV1): RegisteredEvidenceV1[] => {
    const items = report.evidenceRefs
      .filter(ref => ref.relation === relation)
      .map(ref => input.evidenceRegistry.get(ref.evidenceId))
      .filter((item): item is RegisteredEvidenceV1 => item !== undefined)
      .sort((x, y) => x.evidenceId.localeCompare(y.evidenceId));
    return items;
  };
  return {
    agentA: aReport.agentId,
    agentB: bReport.agentId,
    aEvidence: selected(aReport),
    bEvidence: selected(bReport),
    aTop: topOption(aReport.probabilities),
    bTop: topOption(bReport.probabilities),
    relation,
  };
}

/**
 * Build the auditable cross-evidence governance message. Includes the source
 * agent identity, content hash, and a non-certificate disclaimer, mirroring the
 * disclosure intervention's framing. Pure text; no truth, no verdict.
 * The relation label is frozen: `supports top-1 (X)` for confirming evidence,
 * `attacks (disconfirms an option)` for disconfirming evidence.
 */
export function buildCrossEvidenceMessageV1(input: {
  agentA: string;
  agentB: string;
  aEvidence: RegisteredEvidenceV1[];
  bEvidence: RegisteredEvidenceV1[];
  aTop: string;
  bTop: string;
  relation?: "supports" | "attacks";
}): string {
  const relation = input.relation ?? "supports";
  const block = (agentId: string, top: string, items: RegisteredEvidenceV1[]): string => {
    if (items.length === 0) return `- ${agentId}: no ${relation} evidence in round 1.`;
    return items.map(item =>
      `- sourceAgentId: ${agentId}; ${relation === "supports" ? `supports top-1 (${top})` : "attacks (disconfirms an option)"}; contentHash: ${item.contentHash}\n  observation: ${item.content}`,
    ).join("\n");
  };
  return [
    "[Experiment-authorized cross-evidence exchange]",
    "status: recorded input; not a correctness certificate",
    block(input.agentA, input.aTop, input.aEvidence),
    block(input.agentB, input.bTop, input.bEvidence),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// All-agents disconfirming disclosure (upgrade of the pair-based attacks mode)
// ---------------------------------------------------------------------------

export interface DisconfirmingEvidenceItemV1 {
  /** Roster-ordered agents that cited this exact content as attacks. */
  sourceAgentIds: string[];
  content: string;
  contentHash: string;
}

export interface DisclosedEvidenceItemV1 {
  sourceAgentIds: string[];
  relation: "supports" | "attacks";
  content: string;
  contentHash: string;
}

/**
 * Collect all agents' round-1 evidence of the requested relation(s), deduped
 * by exact content hash (repeated wording is one item, citing agents aggregated
 * in roster order). Relation-parameterized; deterministic (items sorted by
 * contentHash, then relation).
 */
export function selectAllEvidenceV1(input: {
  reports: RoundOneReportV1[];
  evidenceRegistry: Map<string, RegisteredEvidenceV1>;
  relations?: ReadonlyArray<"supports" | "attacks">;
}): DisclosedEvidenceItemV1[] {
  const wanted = new Set(input.relations ?? ["supports", "attacks"]);
  const byHash = new Map<string, DisclosedEvidenceItemV1>();
  for (const report of input.reports) {
    for (const ref of report.evidenceRefs) {
      if (!wanted.has(ref.relation)) continue;
      const item = input.evidenceRegistry.get(ref.evidenceId);
      if (!item) continue;
      const existing = byHash.get(item.contentHash);
      if (existing) {
        if (!existing.sourceAgentIds.includes(report.agentId)) existing.sourceAgentIds.push(report.agentId);
      } else {
        byHash.set(item.contentHash, {
          sourceAgentIds: [report.agentId],
          relation: ref.relation,
          content: item.content,
          contentHash: item.contentHash,
        });
      }
    }
  }
  return [...byHash.values()]
    .sort((a, b) => a.contentHash.localeCompare(b.contentHash) || a.relation.localeCompare(b.relation));
}

/**
 * Collect ALL agents' `attacks` (disconfirming) evidence from round 1,
 * deduplicated by exact content hash (repeated wording is one item). This
 * surfaces disconfirming evidence from every agent, not just the
 * max-disagreement pair, so it does not miss a third agent's decisive clue
 * (e.g. "Charlie crosswinds" in task-39). Deterministic: items sorted by
 * contentHash, sources in roster order.
 */
export function selectAllDisconfirmingEvidenceV1(input: {
  reports: RoundOneReportV1[];
  evidenceRegistry: Map<string, RegisteredEvidenceV1>;
}): DisconfirmingEvidenceItemV1[] {
  return selectAllEvidenceV1({ ...input, relations: ["attacks"] })
    .map(({ relation: _relation, ...item }) => item);
}

/**
 * Build the auditable disclosure message for relation-tagged evidence. Neutral
 * framing: no correctness claim and no target-option claim (the relation is the
 * model's own label, not a verdict). The header defaults to a neutral disclosure
 * label; the frozen attacks round overrides it for exact historical replay.
 */
export function buildDisclosedEvidenceMessageV1(
  items: DisclosedEvidenceItemV1[],
  options?: { header?: string },
): string {
  const lines = [
    options?.header ?? "[Experiment-authorized evidence disclosure]",
    "status: recorded input; not a correctness certificate",
  ];
  for (const item of items) {
    const relationLabel = item.relation === "attacks"
      ? "attacks (disconfirms an option)"
      : "supports (confirms an option)";
    lines.push(`- sourceAgentId: ${item.sourceAgentIds.join(", ")}; relation: ${relationLabel}; contentHash: ${item.contentHash}`);
    lines.push(`  observation: ${item.content}`);
  }
  return lines.join("\n");
}

/**
 * Build the auditable all-agents disconfirming message. Neutral framing, no
 * correctness claim, no target option claim (the model labels evidence as
 * "attacks" without naming the attacked option).
 */
export function buildAllDisconfirmingEvidenceMessageV1(items: DisconfirmingEvidenceItemV1[]): string {
  return buildDisclosedEvidenceMessageV1(
    items.map(item => ({ ...item, relation: "attacks" as const })),
    { header: "[Experiment-authorized disconfirming evidence disclosure]" },
  );
}
