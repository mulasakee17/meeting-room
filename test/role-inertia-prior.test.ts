/**
 * role-inertia-prior.test.ts — 角色惯性先验策略显式化与版本化测试
 *
 * 覆盖计划 Batch C §6.4：
 *   1. table-driven 断言两个历史策略的全部 keyword 与 fallback；
 *   2. overlapping keywords 保留 first-match order；
 *   3. 中英文匹配不变（大小写不敏感）；
 *   4. caller mutation 不能改变导出的 policy；
 *   5. invalid policies fail-closed；
 *   6. 现有 estimator 快照保持相等（黄金指纹不变）；
 *   7. updateInertia 默认 legacy-posthoc 行为不变；
 *   8. neutral policy 为 opt-in 且非默认。
 */

import { describe, expect, it } from "vitest";
import {
  LEGACY_POSTHOC_ROLE_INERTIA_POLICY,
  PROGRESSIVE_ICL_ROLE_INERTIA_POLICY,
  NEUTRAL_ROLE_INERTIA_POLICY,
  resolveRoleInertiaPrior,
  createRoleInertiaPriorPolicy,
  isValidRoleInertiaPriorPolicy,
} from "@/lib/agent/roleInertiaPrior";
import {
  updateInertia,
  beliefToCognitiveState,
  type Evidence,
} from "@/lib/agent/cognitiveState";
import {
  defaultProgressiveEstimatorRegistry,
  PROGRESSIVE_ESTIMATOR_ID,
  PROGRESSIVE_ESTIMATOR_VERSION,
  type ProgressiveEstimatorConfig,
  type ProgressiveEstimatorInput,
  type ProgressiveEstimates,
} from "@/lib/thermodynamics/ProgressiveEstimator";

function makeEvidence(): Evidence {
  return { coverage: 0.5, quality: 0.5, diversity: 0.5, recentGain: 0, items: [] };
}

describe("roleInertiaPrior policies", () => {
  it("legacy-posthoc@1.0.0 resolves every legacy keyword and the 0.4 fallback", () => {
    const cases: Array<[string, number]> = [
      ["expert", 0.6], ["资深专家", 0.6], ["senior advisor", 0.6],
      ["director", 0.55], ["总监", 0.55],
      ["analyst", 0.5], ["分析师", 0.5], ["分析", 0.5],
      ["assessor", 0.5], ["evaluator", 0.5], ["评估师", 0.5],
      ["engineer", 0.5], ["工程师", 0.5],
      ["consultant", 0.45], ["advisor", 0.45], ["顾问", 0.45],
      ["manager", 0.45], ["经理", 0.45],
      ["critic", 0.4], ["批评", 0.4], ["质疑", 0.4], ["审查", 0.4],
      ["diplomat", 0.35], ["外交", 0.35], ["协调", 0.35],
      ["moderator", 0.3], ["主持人", 0.3], ["facilitator", 0.3],
      ["novice", 0.3], ["新手", 0.3], ["初级", 0.3], ["junior", 0.3],
      ["unknown-role", 0.4], // fallback
    ];
    for (const [role, expected] of cases) {
      expect(resolveRoleInertiaPrior(role, LEGACY_POSTHOC_ROLE_INERTIA_POLICY), role).toBe(expected);
    }
  });

  it("progressive-icl@1.0.0 resolves its 5 keywords and the 0.4 fallback", () => {
    const cases: Array<[string, number]> = [
      ["expert", 0.6], ["分析师", 0.5], ["critic", 0.4], ["主持人", 0.3], ["novice", 0.3],
      ["director", 0.4], // 不在小表 → fallback
    ];
    for (const [role, expected] of cases) {
      expect(resolveRoleInertiaPrior(role, PROGRESSIVE_ICL_ROLE_INERTIA_POLICY), role).toBe(expected);
    }
  });

  it("preserves first-match ordering for overlapping keywords", () => {
    // "资深分析师" 同时命中 expert（0.6，先）与 analyst（0.5，后）→ 0.6
    expect(resolveRoleInertiaPrior("资深分析师", LEGACY_POSTHOC_ROLE_INERTIA_POLICY)).toBe(0.6);
    expect(resolveRoleInertiaPrior("资深分析师", PROGRESSIVE_ICL_ROLE_INERTIA_POLICY)).toBe(0.6);
    // "协调员" 含子串 "协调"：先命中 diplomat（0.35，第 9 条）而非 moderator 的
    // "协调员"（0.3，第 10 条）——first-match 语义。
    expect(resolveRoleInertiaPrior("协调员", LEGACY_POSTHOC_ROLE_INERTIA_POLICY)).toBe(0.35);
  });

  it("matches Chinese and English unchanged (case-insensitive)", () => {
    expect(resolveRoleInertiaPrior("EXPERT", LEGACY_POSTHOC_ROLE_INERTIA_POLICY)).toBe(0.6);
    expect(resolveRoleInertiaPrior("Senior", PROGRESSIVE_ICL_ROLE_INERTIA_POLICY)).toBe(0.6);
    expect(resolveRoleInertiaPrior(" 高级分析师 ", LEGACY_POSTHOC_ROLE_INERTIA_POLICY)).toBe(0.5);
  });

  it("exported policies are deep-frozen against caller mutation", () => {
    expect(Object.isFrozen(LEGACY_POSTHOC_ROLE_INERTIA_POLICY)).toBe(true);
    expect(Object.isFrozen(LEGACY_POSTHOC_ROLE_INERTIA_POLICY.rules)).toBe(true);
    expect(Object.isFrozen(PROGRESSIVE_ICL_ROLE_INERTIA_POLICY.rules[0].keywords)).toBe(true);
    expect(() => { (LEGACY_POSTHOC_ROLE_INERTIA_POLICY as unknown as { defaultInertia: number }).defaultInertia = 0.9; }).toThrow();
    expect(() => { (PROGRESSIVE_ICL_ROLE_INERTIA_POLICY.rules[0] as unknown as { inertia: number }).inertia = 0.9; }).toThrow();
  });

  it("rejects invalid policies fail-closed", () => {
    expect(() => createRoleInertiaPriorPolicy({ id: "", version: "1.0", defaultInertia: 0.5, rules: [] })).toThrow();
    expect(() => createRoleInertiaPriorPolicy({ id: "x", version: "", defaultInertia: 0.5, rules: [] })).toThrow();
    expect(() => createRoleInertiaPriorPolicy({ id: "x", version: "1.0", defaultInertia: 1.5, rules: [] })).toThrow();
    expect(() => createRoleInertiaPriorPolicy({ id: "x", version: "1.0", defaultInertia: 0.5, rules: [{ keywords: [], inertia: 0.5 }] })).toThrow();
    expect(() => createRoleInertiaPriorPolicy({ id: "x", version: "1.0", defaultInertia: 0.5, rules: [{ keywords: ["ok"], inertia: 2 }] })).toThrow();
    expect(() => createRoleInertiaPriorPolicy({ id: "x", version: "1.0", defaultInertia: 0.5, rules: [{ keywords: [""], inertia: 0.5 }] })).toThrow();
  });

  it("validator accepts the built-in and hand-built valid policies, read-only", () => {
    expect(isValidRoleInertiaPriorPolicy(LEGACY_POSTHOC_ROLE_INERTIA_POLICY)).toBe(true);
    expect(isValidRoleInertiaPriorPolicy(PROGRESSIVE_ICL_ROLE_INERTIA_POLICY)).toBe(true);
    expect(isValidRoleInertiaPriorPolicy(NEUTRAL_ROLE_INERTIA_POLICY)).toBe(true);
    const valid = { id: "v", version: "2.0", defaultInertia: 0.5, rules: [{ keywords: ["a", "b"], inertia: 0.7 }] };
    expect(isValidRoleInertiaPriorPolicy(valid)).toBe(true);
    // validator is read-only: it must not freeze/lowercase/normalize caller data.
    expect(Object.isFrozen(valid)).toBe(false);
    expect(Object.isFrozen(valid.rules)).toBe(false);
  });

  it("resolver rejects structurally invalid hand-built policies fail-closed", () => {
    const invalid: unknown[] = [
      null,
      undefined,
      "not an object",
      42,
      [],
      { id: "", version: "1.0", defaultInertia: 0.5, rules: [] },
      { id: "x", version: "", defaultInertia: 0.5, rules: [] },
      { id: "x", version: "1.0", defaultInertia: Number.NaN, rules: [] },
      { id: "x", version: "1.0", defaultInertia: Number.POSITIVE_INFINITY, rules: [] },
      { id: "x", version: "1.0", defaultInertia: Number.NEGATIVE_INFINITY, rules: [] },
      { id: "x", version: "1.0", defaultInertia: 1.5, rules: [] },
      { id: "x", version: "1.0", defaultInertia: -0.1, rules: [] },
      { id: "x", version: "1.0", defaultInertia: 0.5, rules: "nope" },
      { id: "x", version: "1.0", defaultInertia: 0.5, rules: [null] },
      { id: "x", version: "1.0", defaultInertia: 0.5, rules: [42] },
      { id: "x", version: "1.0", defaultInertia: 0.5, rules: [{ keywords: [], inertia: 0.5 }] },
      { id: "x", version: "1.0", defaultInertia: 0.5, rules: [{ keywords: ["ok"], inertia: Number.NaN }] },
      { id: "x", version: "1.0", defaultInertia: 0.5, rules: [{ keywords: ["ok"], inertia: Number.POSITIVE_INFINITY }] },
      { id: "x", version: "1.0", defaultInertia: 0.5, rules: [{ keywords: ["ok"], inertia: 2 }] },
      { id: "x", version: "1.0", defaultInertia: 0.5, rules: [{ keywords: ["ok"], inertia: -1 }] },
      { id: "x", version: "1.0", defaultInertia: 0.5, rules: [{ keywords: [42], inertia: 0.5 }] },
      { id: "x", version: "1.0", defaultInertia: 0.5, rules: [{ keywords: [""], inertia: 0.5 }] },
    ];
    for (const policy of invalid) {
      expect(() => resolveRoleInertiaPrior("expert", policy as never), JSON.stringify(policy)).toThrow();
    }
  });

  it("neutral policy is opt-in, has no rules, and is not the default", () => {
    expect(NEUTRAL_ROLE_INERTIA_POLICY.id).toBe("neutral");
    expect(NEUTRAL_ROLE_INERTIA_POLICY.rules).toHaveLength(0);
    expect(resolveRoleInertiaPrior("expert", NEUTRAL_ROLE_INERTIA_POLICY)).toBe(0.5);
    // updateInertia 默认 legacy-posthoc：expert → roleBased 0.6（非 neutral 0.5）。
    const inert = beliefToCognitiveState("a", "A", "expert", 0.5, 50).inertia;
    expect(updateInertia(inert, "expert", true, makeEvidence(), false).source.roleBased).toBe(0.6);
  });
});

describe("refactor invariants (golden fingerprints and numeric behavior)", () => {
  it("estimator fingerprints are identical to pre-refactor golden values", () => {
    const rec = defaultProgressiveEstimatorRegistry.project<
      ProgressiveEstimatorInput,
      ProgressiveEstimates,
      ProgressiveEstimatorConfig
    >(PROGRESSIVE_ESTIMATOR_ID, PROGRESSIVE_ESTIMATOR_VERSION, {
      name: "progressive_icl:a:round:1",
      input: {
        round: 1,
        agentId: "a",
        agentRole: "analyst",
        behaviorEvents: {
          timesRefuted: 0,
          timesChangedAfterRefutation: 0,
          spontaneousFlips: 0,
          timesExposed: 0,
          timesRespondedAfterExposure: 0,
        },
        confidence: { stated: 0.6 },
        utilityHistory: [],
      },
      sourceEventIds: ["ev:a"],
    });
    expect(rec.inputFingerprint).toBe("sha256:01f3081a8826cf7b08bb839bcc9b0ffd13fc6d5342c3c7aeddc821559e8b9a09");
    expect(rec.configFingerprint).toBe("sha256:2ef661878f8b02240cc632bdfba294c14d2fa317e6af7e730c73b26766da8eda");
    expect(rec.outputFingerprint).toBe("sha256:01235c4bc4653c109c6293d94b7146a55936bb57855ebe1f36c0d817ce23da4c");
    expect(rec.value.inertia.estimate).toBe(0.5);
  });

  it("updateInertia legacy behavior is unchanged (golden outputs)", () => {
    const ev = makeEvidence();
    const director = beliefToCognitiveState("a1", "A", "director", 0.5, 50).inertia;
    expect(updateInertia(director, "director", true, ev, false)).toEqual({
      estimate: 0.55,
      confidence: 0.1,
      sourceWeights: { stated: 0.5, rolePrior: 0.5, behavioral: 0 },
      strength: 0.4116,
      source: { evidenceBased: 0.15, expressionBased: 0.05, roleBased: 0.55 },
      recentRefutations: 0,
    });
    const novice = beliefToCognitiveState("a2", "A", "novice", 0.5, 50).inertia;
    expect(updateInertia(novice, "novice", false, ev, true)).toEqual({
      estimate: 0.3,
      confidence: 0.1,
      sourceWeights: { stated: 0.5, rolePrior: 0.5, behavioral: 0 },
      strength: 0.1372,
      source: { evidenceBased: 0.15, expressionBased: 0, roleBased: 0.3 },
      recentRefutations: 1,
    });
    const unknown = beliefToCognitiveState("a3", "A", "unknown-role", 0.5, 50).inertia;
    expect(updateInertia(unknown, "unknown-role", true, ev, false).source.roleBased).toBe(0.4);
  });

  it("updateInertia accepts an explicit policy argument (opt-in neutral)", () => {
    const inert = beliefToCognitiveState("a", "A", "expert", 0.5, 50).inertia;
    expect(updateInertia(inert, "expert", true, makeEvidence(), false, NEUTRAL_ROLE_INERTIA_POLICY).source.roleBased)
      .toBe(0.5);
  });
});
