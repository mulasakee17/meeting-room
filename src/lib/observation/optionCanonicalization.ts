import type { AgentOpinion } from "../discussion/types";

export type OptionMatchStatus = "matched" | "ambiguous" | "unmatched";

export interface OptionMatchResult {
  status: OptionMatchStatus;
  canonical?: string;
  candidates: string[];
}

/** 仅做文本比较归一化，不携带任何 ground-truth 排序信息。 */
export function normalizeOptionLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿぀-ヿ가-힯]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * 将一个 LLM 选项标签映射到预注册规范名。
 *
 * 只接受：规范名精确匹配、别名精确匹配、唯一的双向包含匹配。
 * 多候选和无候选都 fail closed；绝不依据位置、正确答案顺序或缺失项猜测。
 */
export function matchCanonicalOption(
  rawLabel: string,
  canonicalOptions: string[],
  aliases: Record<string, string[]> = {},
): OptionMatchResult {
  const raw = normalizeOptionLabel(rawLabel);
  if (!raw) return { status: "unmatched", candidates: [] };

  const normalizedCanonical = canonicalOptions.map(canonical => ({
    canonical,
    normalized: normalizeOptionLabel(canonical),
  }));

  const exactCanonical = normalizedCanonical.filter(entry => entry.normalized === raw);
  if (exactCanonical.length === 1) {
    return { status: "matched", canonical: exactCanonical[0].canonical, candidates: [exactCanonical[0].canonical] };
  }
  if (exactCanonical.length > 1) {
    return { status: "ambiguous", candidates: exactCanonical.map(entry => entry.canonical) };
  }

  const exactAliasCandidates = new Set<string>();
  for (const canonical of canonicalOptions) {
    for (const alias of aliases[canonical] ?? []) {
      if (normalizeOptionLabel(alias) === raw) exactAliasCandidates.add(canonical);
    }
  }
  if (exactAliasCandidates.size === 1) {
    const canonical = [...exactAliasCandidates][0];
    return { status: "matched", canonical, candidates: [canonical] };
  }
  if (exactAliasCandidates.size > 1) {
    return { status: "ambiguous", candidates: [...exactAliasCandidates] };
  }

  // 单字符包含匹配噪声过高；中文/字母标签至少需要两个归一化字符。
  if (raw.replace(/\s/g, "").length < 2) {
    return { status: "unmatched", candidates: [] };
  }

  const containmentCandidates = new Set<string>();
  for (const entry of normalizedCanonical) {
    if (entry.normalized.includes(raw) || raw.includes(entry.normalized)) {
      containmentCandidates.add(entry.canonical);
    }
    for (const alias of aliases[entry.canonical] ?? []) {
      const normalizedAlias = normalizeOptionLabel(alias);
      if (normalizedAlias && (normalizedAlias.includes(raw) || raw.includes(normalizedAlias))) {
        containmentCandidates.add(entry.canonical);
      }
    }
  }

  if (containmentCandidates.size === 1) {
    const canonical = [...containmentCandidates][0];
    return { status: "matched", canonical, candidates: [canonical] };
  }
  if (containmentCandidates.size > 1) {
    return { status: "ambiguous", candidates: [...containmentCandidates] };
  }
  return { status: "unmatched", candidates: [] };
}

/**
 * 在 opinion 进入 memory、cognitive state、thermo 和 δ 之前统一规范化选项。
 * 返回新对象，避免修改 parser 或调用者持有的原始对象。
 */
export function canonicalizeOpinionOptions(
  opinion: AgentOpinion,
  canonicalOptions?: string[],
  aliases?: Record<string, string[]>,
): AgentOpinion {
  if (!canonicalOptions || canonicalOptions.length === 0) {
    return { ...opinion, optionParseStatus: "not_applicable", unmatchedOptionLabels: [] };
  }

  const unmatched = new Set<string>();
  let ambiguous = false;
  let invalidRanks = false;
  const seenItemOptions = new Set<string>();
  const canonicalItemBeliefs = [] as NonNullable<AgentOpinion["itemBeliefs"]>;

  for (const itemBelief of opinion.itemBeliefs ?? []) {
    const match = matchCanonicalOption(itemBelief.item, canonicalOptions, aliases);
    if (match.status !== "matched" || !match.canonical) {
      unmatched.add(itemBelief.item);
      if (match.status === "ambiguous") ambiguous = true;
      continue;
    }
    if (seenItemOptions.has(match.canonical)) {
      unmatched.add(itemBelief.item);
      ambiguous = true;
      continue;
    }
    seenItemOptions.add(match.canonical);
    canonicalItemBeliefs.push({ ...itemBelief, item: match.canonical });
  }

  const ranks = canonicalItemBeliefs.map(item => item.rank);
  if (ranks.length > 0) {
    const uniqueRanks = new Set(ranks);
    invalidRanks = uniqueRanks.size !== ranks.length || ranks.some(rank =>
      !Number.isInteger(rank) || rank < 1 || rank > canonicalOptions.length
    );
  }

  let optionParseStatus: AgentOpinion["optionParseStatus"];
  if (invalidRanks) {
    optionParseStatus = "invalid";
  } else if (ambiguous) {
    optionParseStatus = "ambiguous";
  } else if (seenItemOptions.size === 0) {
    optionParseStatus = "invalid";
  } else if (unmatched.size > 0 || seenItemOptions.size !== canonicalOptions.length) {
    optionParseStatus = "incomplete";
  } else {
    optionParseStatus = "valid";
  }

  let cognitiveState = opinion.cognitiveState;
  if (cognitiveState) {
    const utility: Record<string, number> = {};
    for (const [rawOption, value] of Object.entries(cognitiveState.utility)) {
      const match = matchCanonicalOption(rawOption, canonicalOptions, aliases);
      if (match.status === "matched" && match.canonical && utility[match.canonical] === undefined) {
        utility[match.canonical] = value;
      } else {
        unmatched.add(rawOption);
      }
    }
    cognitiveState = { ...cognitiveState, utility };
  }

  const structuredEvidence = opinion.structuredEvidence
    ?.flatMap(item => {
      const match = matchCanonicalOption(item.supports, canonicalOptions, aliases);
      if (match.status === "matched" && match.canonical) {
        return [{ ...item, supports: match.canonical }];
      }
      if (item.supports) unmatched.add(item.supports);
      return [];
    });

  return {
    ...opinion,
    itemBeliefs: canonicalItemBeliefs,
    cognitiveState,
    structuredEvidence,
    optionParseStatus,
    unmatchedOptionLabels: [...unmatched],
  };
}
