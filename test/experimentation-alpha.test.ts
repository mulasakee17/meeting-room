/**
 * experimentation-alpha.test.ts — WP3 baseline ladder / alpha 测试
 *
 * 覆盖 masterplan WP3 必须新增的测试：
 *   - budget contract 验证；
 *   - paired alpha（swarm/governance/specificity/oracle_gap/net_alpha）计算；
 *   - 实际 cost 缺失时 net alpha unavailable（不补 0）；
 *   - null / not_applicable 不被平均为 0；
 *   - Kendall tau 仅当完整顺序真值存在（单选不伪造尾部排序）；
 *   - paired block 完整性（同 blockKey）；
 *   - Gate G3：mock 6-arm block 生成 manifest + paired alpha + cost table。
 */

import { describe, expect, it } from "vitest";
import {
  validateBudgetContract,
  validateBlockOutcome,
  type BlockOutcome,
} from "../src/lib/experimentation/baseline";
import { computePairedAlpha } from "../src/lib/experimentation/alpha";
import { createRunAssignment } from "../src/lib/experimentation/assignment";
import {
  aggregateApplicableAccuracy,
  kendallTauApplicable,
} from "../src/lib/experiment-contracts/categorical";

function outcome(
  arm: BlockOutcome["arm"],
  quality: number | null,
  over: Partial<BlockOutcome> = {},
): BlockOutcome {
  return {
    arm,
    blockKey: "task1|deepseek|seed1",
    quality,
    cost: { totalTokens: 1000, totalLatencyMs: 500 },
    status: quality === null ? "invalid" : "scored",
    ...over,
  };
}

describe("BudgetContract", () => {
  it("accepts valid contracts and rejects non-finite/negative values", () => {
    expect(() => validateBudgetContract({ maxLlmCalls: 10, maxRounds: 5 })).not.toThrow();
    expect(() => validateBudgetContract({ maxLlmCalls: -1 })).toThrow(/non-negative/);
    expect(() => validateBudgetContract({ maxLlmCalls: Number.NaN })).toThrow(/non-negative/);
    expect(() => validateBudgetContract(null)).toThrow(/non-null/);
  });
});

describe("paired alpha computation", () => {
  it("computes swarm/governance/specificity/oracle on a complete block", () => {
    const block = [
      outcome("independent_ensemble", 0.60),
      outcome("vanilla_interaction", 0.70),
      outcome("random_governance", 0.72),
      outcome("diagnostic_governance", 0.80),
      outcome("full_information_oracle", 0.95),
    ];
    const a = computePairedAlpha(block);
    expect(a.swarmAlpha).toBeCloseTo(0.10, 10); // 0.70 - 0.60
    expect(a.governanceAlpha).toBeCloseTo(0.10, 10); // 0.80 - 0.70
    expect(a.specificityAlpha).toBeCloseTo(0.08, 10); // 0.80 - 0.72
    expect(a.oracleGap).toBeCloseTo(0.25, 10); // 0.95 - 0.70
    expect(a.netAlpha).toBeCloseTo(0.10, 10); // 无 lambda → 纯 Q
    expect(a.unavailable).toEqual([]);
  });

  it("reports unavailable when a required arm is not scored", () => {
    const a = computePairedAlpha([outcome("vanilla_interaction", 0.7)]);
    expect(a.governanceAlpha).toBeNull();
    expect(a.specificityAlpha).toBeNull();
    expect(a.unavailable).toContain("arm diagnostic_governance not scored");
  });

  it("reports unavailable when block keys differ (no cross-block pairing)", () => {
    const a = computePairedAlpha([
      outcome("vanilla_interaction", 0.7, { blockKey: "task1|deepseek|seed1" }),
      outcome("diagnostic_governance", 0.8, { blockKey: "task1|deepseek|seed2" }),
    ]);
    expect(a.governanceAlpha).toBeNull();
    expect(a.unavailable.some(r => r.includes("mixed block keys"))).toBe(true);
  });

  it("net alpha applies token/time/failure lambdas and stays unavailable when actual cost is missing", () => {
    const block = [
      outcome("vanilla_interaction", 0.70, { cost: { totalTokens: 1000, totalLatencyMs: 500 } }),
      outcome("diagnostic_governance", 0.80, { cost: { totalTokens: 1500, totalLatencyMs: 800 } }),
    ];
    const lambdas = { token: 0.0001, time: 0.0002 };
    const a = computePairedAlpha(block, lambdas);
    // net = 0.10 - 0.0001*500 - 0.0002*300 = 0.10 - 0.05 - 0.06 = -0.01
    expect(a.netAlpha).toBeCloseTo(-0.01, 10);

    // cost 缺失 + lambda 要求 cost → unavailable（不补 0）。
    const missing = computePairedAlpha([
      outcome("vanilla_interaction", 0.70, { cost: {} }),
      outcome("diagnostic_governance", 0.80, { cost: {} }),
    ], { token: 0.0001 });
    expect(missing.netAlpha).toBeNull();
    expect(missing.unavailable).toContain("actual cost missing for net alpha");
  });
});

describe("evaluation aggregation rules", () => {
  it("does not average not_applicable as 0", () => {
    const applicable = { taskId: "t", contractId: "c", contractVersion: "1", applicability: "applicable" as const, accuracy: 1, missingness: [] };
    const na = { taskId: "t", contractId: "c", contractVersion: "1", applicability: "not_applicable" as const, missingness: ["no_ranking"] };
    expect(aggregateApplicableAccuracy([applicable, na])).toBe(1);
    expect(aggregateApplicableAccuracy([na, na])).toBeNull();
    expect(aggregateApplicableAccuracy([])).toBeNull();
  });

  it("kendall tau only applies when a full-order truth exists", () => {
    // 完整顺序：rank 是 1..N 的排列 → tau 可用。
    expect(kendallTauApplicable({ A: 1, B: 2, C: 3 })).toBe(true);
    expect(kendallTauApplicable({ A: 1, B: 2, C: 3, D: 4 })).toBe(true);
    expect(kendallTauApplicable({ A: 1, B: 3, C: 2 })).toBe(true); // 键序乱但仍是排列
    // 单选/伪造尾部排序：缺某个 rank（如 rank 2）→ 不是 1..N 排列 → tau 不可用。
    expect(kendallTauApplicable({ A: 1, B: 3 })).toBe(false); // 缺 rank 2
    expect(kendallTauApplicable({ A: 1, B: 2, C: 4 })).toBe(false); // 缺 rank 3
  });
});

describe("Gate G3 — mock 6-arm block", () => {
  it("produces manifest + paired alpha + cost table from mock arm results", () => {
    // 6-arm block：用 mock 质量与成本构造，模拟 mock LLM 输出。
    const blockKey = "hb_task7|deepseek|seed1";
    const mockArms: Array<{ arm: BlockOutcome["arm"]; quality: number | null; tokens: number }> = [
      { arm: "independent_ensemble", quality: 0.62, tokens: 900 },
      { arm: "vanilla_interaction", quality: 0.70, tokens: 1000 },
      { arm: "random_governance", quality: 0.68, tokens: 1400 },
      { arm: "diagnostic_governance", quality: 0.78, tokens: 1500 },
      { arm: "epistemic_governance", quality: 0.80, tokens: 1800 },
      { arm: "full_information_oracle", quality: 0.96, tokens: 1200 },
    ];

    // 1) immutable assignment manifest per arm.
    const manifest = mockArms.map((m, i) => createRunAssignment({
      id: `asn:${blockKey}:${m.arm}`,
      unitId: `${blockKey}:${m.arm}`,
      stratum: { blockKey, arm: m.arm },
      arm: m.arm,
      policyId: "swarmalpha.diagnostic",
      policyVersion: "1.0.0",
      masterSeed: 42 + i,
      assignedAt: "2026-08-09T00:00:00Z",
    }));
    expect(manifest).toHaveLength(6);
    for (const asn of manifest) expect(asn.eligibleArms).toContain(asn.assignedArm);

    // 2) per-arm block outcome.
    const outcomes = mockArms.map(m => outcome(m.arm, m.quality, {
      blockKey,
      cost: { totalTokens: m.tokens, totalLatencyMs: m.tokens * 0.5 },
    }));

    // 3) paired alpha.
    const alpha = computePairedAlpha(outcomes, { token: 0.0001 });
    expect(alpha.swarmAlpha).toBeCloseTo(0.08, 10);
    expect(alpha.governanceAlpha).toBeCloseTo(0.08, 10); // 0.78 - 0.70
    expect(alpha.specificityAlpha).toBeCloseTo(0.10, 10); // 0.78 - 0.68
    expect(alpha.oracleGap).toBeCloseTo(0.26, 10); // 0.96 - 0.70
    // net = 0.08 - 0.0001*(1500-1000) = 0.08 - 0.05 = 0.03
    expect(alpha.netAlpha).toBeCloseTo(0.03, 10);

    // 4) cost table + failure/missing status.
    const costTable = outcomes.map(o => ({
      arm: o.arm,
      tokens: o.cost.totalTokens ?? null,
      latencyMs: o.cost.totalLatencyMs ?? null,
      status: o.status,
      quality: o.quality,
    }));
    expect(costTable.some(row => row.status === "scored")).toBe(true);
    expect(alpha.unavailable).toEqual([]);
  });
});
