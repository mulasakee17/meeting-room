/**
 * Role → inertia prior policies — explicit, versioned, immutable.
 *
 * Consolidates the previously duplicated private role tables into named,
 * versioned data-only policies with a single shared resolver. Numeric behavior
 * is preserved: existing call sites keep their current policy by default.
 *
 * Policy contract:
 *   - values are finite and within [0, 1];
 *   - ids, versions, and keywords are non-empty;
 *   - first-match ordering is preserved (no sorting or mutation of caller rules);
 *   - matching is locale-independent lowercase `includes`;
 *   - exported policies are deep-frozen.
 *
 * The `neutral@1.0.0` policy is future explicit opt-in only and is never a
 * default in this change.
 */

export interface RoleInertiaPriorRule {
  readonly keywords: readonly string[];
  readonly inertia: number;
}

export interface RoleInertiaPriorPolicy {
  readonly id: string;
  readonly version: string;
  readonly defaultInertia: number;
  readonly rules: readonly RoleInertiaPriorRule[];
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/**
 * Side-effect-free validator for a role-inertia prior policy. Read-only: it
 * never mutates, sorts, freezes, lowercases, or normalizes caller data.
 *
 * A policy is valid when:
 *   - it is a non-null object;
 *   - `id` and `version` are non-empty strings;
 *   - `defaultInertia` is finite and within [0, 1];
 *   - `rules` is an array;
 *   - every rule is an object;
 *   - every `keywords` value is a non-empty array of non-empty strings;
 *   - every rule inertia is finite and within [0, 1].
 */
export function isValidRoleInertiaPriorPolicy(value: unknown): value is RoleInertiaPriorPolicy {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  if (typeof policy.id !== "string" || policy.id.length === 0) return false;
  if (typeof policy.version !== "string" || policy.version.length === 0) return false;
  if (typeof policy.defaultInertia !== "number"
    || !Number.isFinite(policy.defaultInertia)
    || policy.defaultInertia < 0
    || policy.defaultInertia > 1) {
    return false;
  }
  if (!Array.isArray(policy.rules)) return false;
  for (const rule of policy.rules) {
    if (rule === null || typeof rule !== "object" || Array.isArray(rule)) return false;
    const ruleRecord = rule as Record<string, unknown>;
    if (!Array.isArray(ruleRecord.keywords) || ruleRecord.keywords.length === 0) return false;
    for (const keyword of ruleRecord.keywords) {
      if (typeof keyword !== "string" || keyword.length === 0) return false;
    }
    if (typeof ruleRecord.inertia !== "number"
      || !Number.isFinite(ruleRecord.inertia)
      || ruleRecord.inertia < 0
      || ruleRecord.inertia > 1) {
      return false;
    }
  }
  return true;
}

/**
 * Create an immutable role-inertia prior policy, validating every constraint
 * and deep-freezing the exported structure so callers cannot mutate it.
 */
export function createRoleInertiaPriorPolicy(policy: {
  id: string;
  version: string;
  defaultInertia: number;
  rules: ReadonlyArray<{ keywords: readonly string[]; inertia: number }>;
}): RoleInertiaPriorPolicy {
  if (!isValidRoleInertiaPriorPolicy(policy)) {
    throw new Error("invalid role inertia prior policy");
  }
  return deepFreeze({
    id: policy.id,
    version: policy.version,
    defaultInertia: policy.defaultInertia,
    rules: policy.rules.map(rule => ({
      keywords: [...rule.keywords],
      inertia: rule.inertia,
    })),
  });
}

/**
 * Exact legacy post-hoc policy: the full role table previously private to
 * `cognitiveState.ts` (11 rules, fallback 0.4). Preserved verbatim.
 */
export const LEGACY_POSTHOC_ROLE_INERTIA_POLICY: RoleInertiaPriorPolicy =
  createRoleInertiaPriorPolicy({
    id: "legacy-posthoc",
    version: "1.0.0",
    defaultInertia: 0.4,
    rules: [
      { keywords: ["expert", "专家", "资深", "senior"], inertia: 0.6 },
      { keywords: ["director", "总监"], inertia: 0.55 },
      { keywords: ["analyst", "分析师", "分析"], inertia: 0.5 },
      { keywords: ["assessor", "evaluator", "评估师"], inertia: 0.5 },
      { keywords: ["engineer", "工程师"], inertia: 0.5 },
      { keywords: ["consultant", "advisor", "顾问"], inertia: 0.45 },
      { keywords: ["manager", "经理"], inertia: 0.45 },
      { keywords: ["critic", "批评", "质疑", "审查"], inertia: 0.4 },
      { keywords: ["diplomat", "外交", "协调"], inertia: 0.35 },
      { keywords: ["moderator", "主持人", "协调员", "facilitator"], inertia: 0.3 },
      { keywords: ["novice", "新手", "初级", "junior"], inertia: 0.3 },
    ],
  });

/**
 * Exact progressive estimator v1 policy: the role table previously private to
 * `ProgressiveEstimator.ts` (5 rules, fallback 0.4). Preserved verbatim so the
 * default estimator config and its fingerprint remain numerically identical.
 */
export const PROGRESSIVE_ICL_ROLE_INERTIA_POLICY: RoleInertiaPriorPolicy =
  createRoleInertiaPriorPolicy({
    id: "progressive-icl",
    version: "1.0.0",
    defaultInertia: 0.4,
    rules: [
      { keywords: ["expert", "专家", "资深", "senior"], inertia: 0.6 },
      { keywords: ["analyst", "分析师", "分析"], inertia: 0.5 },
      { keywords: ["critic", "批评", "质疑", "审查"], inertia: 0.4 },
      { keywords: ["moderator", "主持人", "协调员", "facilitator"], inertia: 0.3 },
      { keywords: ["novice", "新手", "初级", "junior"], inertia: 0.3 },
    ],
  });

/**
 * Neutral policy: no keyword rules, fallback 0.5. Explicit opt-in for future
 * experiments only; MUST NOT become the default in this change.
 */
export const NEUTRAL_ROLE_INERTIA_POLICY: RoleInertiaPriorPolicy =
  createRoleInertiaPriorPolicy({
    id: "neutral",
    version: "1.0.0",
    defaultInertia: 0.5,
    rules: [],
  });

/**
 * Resolve the role inertia prior using locale-independent lowercase matching.
 * Preserves first-match ordering; never sorts or mutates the policy rules.
 *
 * The resolver fails closed: a structurally invalid hand-built policy is
 * rejected before any matching runs, so a corrupt policy cannot silently fall
 * back to a default.
 */
export function resolveRoleInertiaPrior(role: string, policy: RoleInertiaPriorPolicy): number {
  if (!isValidRoleInertiaPriorPolicy(policy)) {
    throw new Error("invalid role inertia prior policy");
  }
  const lower = role.toLowerCase();
  for (const rule of policy.rules) {
    if (rule.keywords.some(keyword => lower.includes(keyword))) {
      return rule.inertia;
    }
  }
  return policy.defaultInertia;
}
