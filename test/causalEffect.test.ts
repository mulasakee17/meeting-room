import { describe, it, expect } from "vitest";
import {
  extractTrajectory,
  computeDistance,
  findNearestNeighbors,
  estimateCounterfactual,
  estimateCausalEffect,
  permutationTest,
  bootstrapCI,
  computeCohensD,
  analyzeCausalEffects,
  type ExperimentTrajectory,
} from "@/lib/analysis/causalEffect";

// ============================================================================
// 测试辅助: 构造模拟轨迹
// ============================================================================

function makeTrajectory(
  runId: string,
  ablation: string,
  task: "invest" | "ma",
  totalRounds: number,
  finalTau: number,
  tau1: number,
  diversity1: number,
  mean1: number,
  interventions: Array<{ round: number; type: string }> = []
): ExperimentTrajectory {
  return {
    runId,
    task,
    totalRounds,
    ablation,
    tauTrajectory: [tau1, ...Array(totalRounds - 1).fill(finalTau)],
    beliefDiversityTrajectory: [diversity1, ...Array(totalRounds - 1).fill(0.1)],
    beliefMeanTrajectory: [mean1, ...Array(totalRounds - 1).fill(mean1)],
    finalTau,
    finalQuality: ((finalTau + 1) / 2) * 100,
    interventions: interventions as any,
    firstInterventionRound: interventions.length > 0 ? interventions[0].round : null,
    firstInterventionType: interventions.length > 0 ? interventions[0].type as any : null,
    interventionTypes: [...new Set(interventions.map((i) => i.type))] as any,
  };
}

// ============================================================================
// extractTrajectory
// ============================================================================

describe("extractTrajectory", () => {
  it("从完整实验 JSON 提取轨迹（Gen 3 数据）", () => {
    const exp = {
      runId: "invest_full_0",
      ablation: "full",
      totalRounds: 3,
      kendallTau: 0.6,
      decisionQuality: 80,
      tauTrajectory: [0.3, 0.5, 0.6],
      rounds: [
        { roundNumber: 1, tau: 0.3, beliefs: { a1: 0.5, a2: 0.7, a3: -0.2 }, interventions: [] },
        { roundNumber: 2, tau: 0.5, beliefs: { a1: 0.55, a2: 0.65, a3: 0.1 }, interventions: [{ type: "introduce_diversity" }] },
        { roundNumber: 3, tau: 0.6, beliefs: { a1: 0.6, a2: 0.6, a3: 0.3 }, interventions: [] },
      ],
    };
    const traj = extractTrajectory(exp);
    expect(traj).not.toBeNull();
    expect(traj!.task).toBe("invest");
    expect(traj!.totalRounds).toBe(3);
    expect(traj!.tauTrajectory).toEqual([0.3, 0.5, 0.6]);
    expect(traj!.finalTau).toBe(0.6);
    expect(traj!.beliefDiversityTrajectory).toHaveLength(3);
    expect(traj!.beliefDiversityTrajectory[0]).toBeCloseTo(0.386, 1);
    expect(traj!.interventions).toHaveLength(1);
    expect(traj!.interventions[0].round).toBe(2);
    expect(traj!.interventions[0].type).toBe("introduce_diversity");
    expect(traj!.firstInterventionRound).toBe(2);
    expect(traj!.firstInterventionType).toBe("introduce_diversity");
  });

  it("Gen 1 数据（无 tauTrajectory）从 rounds 重建", () => {
    const exp = {
      runId: "ma_none_0",
      ablation: "none",
      kendallTau: 0.4,
      decisionQuality: 70,
      rounds: [
        { roundNumber: 1, beliefs: { a1: 0.3, a2: 0.5 } },
        { roundNumber: 2, beliefs: { a1: 0.35, a2: 0.45 } },
      ],
    };
    const traj = extractTrajectory(exp);
    expect(traj).not.toBeNull();
    expect(traj!.tauTrajectory).toEqual([]); // 无 tau 数据
    expect(traj!.beliefDiversityTrajectory).toHaveLength(2);
    expect(traj!.beliefDiversityTrajectory[0]).toBeCloseTo(0.1, 5);
    expect(traj!.interventions).toEqual([]);
    expect(traj!.firstInterventionRound).toBeNull();
  });

  it("无 rounds 数据返回 null", () => {
    expect(extractTrajectory({ runId: "x", ablation: "none", kendallTau: 0.5, decisionQuality: 75 })).toBeNull();
  });
});

// ============================================================================
// computeDistance
// ============================================================================

describe("computeDistance", () => {
  it("完全相同的轨迹距离为 0", () => {
    const t = makeTrajectory("t1", "full", "invest", 3, 0.6, 0.3, 0.4, 0.5);
    const d = makeTrajectory("d1", "none", "invest", 3, 0.5, 0.3, 0.4, 0.5);
    expect(computeDistance(t, d)).toBeCloseTo(0, 5);
  });

  it("τ 差异贡献最大权重", () => {
    const t = makeTrajectory("t1", "full", "invest", 3, 0.6, 0.5, 0.4, 0.5);
    const d1 = makeTrajectory("d1", "none", "invest", 3, 0.5, 0.3, 0.4, 0.5); // τ 差 0.2
    const d2 = makeTrajectory("d2", "none", "invest", 3, 0.5, 0.5, 0.6, 0.5); // diversity 差 0.2
    expect(computeDistance(t, d1)).toBeGreaterThan(computeDistance(t, d2));
  });

  it("无匹配变量时返回 Infinity", () => {
    const t: ExperimentTrajectory = {
      ...makeTrajectory("t1", "full", "invest", 3, 0.6, NaN, NaN, NaN),
      tauTrajectory: [],
      beliefDiversityTrajectory: [],
      beliefMeanTrajectory: [],
    };
    const d: ExperimentTrajectory = {
      ...makeTrajectory("d1", "none", "invest", 3, 0.5, NaN, NaN, NaN),
      tauTrajectory: [],
      beliefDiversityTrajectory: [],
      beliefMeanTrajectory: [],
    };
    expect(computeDistance(t, d)).toBe(Infinity);
  });
});

// ============================================================================
// findNearestNeighbors
// ============================================================================

describe("findNearestNeighbors", () => {
  it("返回 k 个最近邻", () => {
    const treated = makeTrajectory("t1", "full", "invest", 3, 0.6, 0.3, 0.4, 0.5);
    const donors = [
      makeTrajectory("d1", "none", "invest", 3, 0.5, 0.3, 0.4, 0.5), // dist=0
      makeTrajectory("d2", "none", "invest", 3, 0.5, 0.5, 0.4, 0.5), // dist>0
      makeTrajectory("d3", "none", "invest", 3, 0.5, 0.1, 0.4, 0.5), // dist>0
    ];
    const result = findNearestNeighbors(treated, donors, 2);
    expect(result).toHaveLength(2);
    expect(result[0].donor.runId).toBe("d1"); // 最近
  });

  it("donor pool 小于 k 时返回全部", () => {
    const treated = makeTrajectory("t1", "full", "invest", 3, 0.6, 0.3, 0.4, 0.5);
    const donors = [makeTrajectory("d1", "none", "invest", 3, 0.5, 0.3, 0.4, 0.5)];
    const result = findNearestNeighbors(treated, donors, 5);
    expect(result).toHaveLength(1);
  });

  it("过滤掉距离为 Infinity 的 donor", () => {
    const treated: ExperimentTrajectory = {
      ...makeTrajectory("t1", "full", "invest", 3, 0.6, 0.3, 0.4, 0.5),
    };
    const badDonor: ExperimentTrajectory = {
      ...makeTrajectory("d1", "none", "invest", 3, 0.5, NaN, NaN, NaN),
      tauTrajectory: [],
      beliefDiversityTrajectory: [],
      beliefMeanTrajectory: [],
    };
    const result = findNearestNeighbors(treated, [badDonor], 5);
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// estimateCounterfactual
// ============================================================================

describe("estimateCounterfactual", () => {
  it("距离为 0 时用简单平均", () => {
    const matched = [
      { donor: makeTrajectory("d1", "none", "invest", 3, 0.5, 0.3, 0.4, 0.5), distance: 0 },
      { donor: makeTrajectory("d2", "none", "invest", 3, 0.7, 0.3, 0.4, 0.5), distance: 0 },
    ];
    expect(estimateCounterfactual(matched)).toBeCloseTo(0.6, 5);
  });

  it("逆距离加权: 近的 donor 权重大", () => {
    const matched = [
      { donor: makeTrajectory("d1", "none", "invest", 3, 0.8, 0.3, 0.4, 0.5), distance: 0.01 },
      { donor: makeTrajectory("d2", "none", "invest", 3, 0.2, 0.5, 0.4, 0.5), distance: 0.5 },
    ];
    const cf = estimateCounterfactual(matched);
    // d1 权重远大于 d2，cf 应接近 0.8
    expect(cf).toBeGreaterThan(0.7);
  });

  it("空数组返回 NaN", () => {
    expect(estimateCounterfactual([])).toBeNaN();
  });
});

// ============================================================================
// estimateCausalEffect
// ============================================================================

describe("estimateCausalEffect", () => {
  it("正效应: treated τ 高于 counterfactual", () => {
    const treated = makeTrajectory("t1", "full", "invest", 3, 0.7, 0.3, 0.4, 0.5, [{ round: 2, type: "introduce_diversity" }]);
    const donors = [
      makeTrajectory("d1", "none", "invest", 3, 0.5, 0.3, 0.4, 0.5),
      makeTrajectory("d2", "none", "invest", 3, 0.4, 0.3, 0.4, 0.5),
    ];
    const eff = estimateCausalEffect(treated, donors, 2);
    expect(eff.observedTau).toBe(0.7);
    expect(eff.counterfactualTau).toBeCloseTo(0.45, 1);
    expect(eff.effect).toBeCloseTo(0.25, 1);
    expect(eff.effect).toBeGreaterThan(0);
  });

  it("负效应: treated τ 低于 counterfactual", () => {
    const treated = makeTrajectory("t1", "full", "invest", 3, 0.3, 0.3, 0.4, 0.5, [{ round: 2, type: "force_reflection" }]);
    const donors = [
      makeTrajectory("d1", "none", "invest", 3, 0.6, 0.3, 0.4, 0.5),
      makeTrajectory("d2", "none", "invest", 3, 0.5, 0.3, 0.4, 0.5),
    ];
    const eff = estimateCausalEffect(treated, donors, 2);
    expect(eff.effect).toBeLessThan(0);
  });

  it("matchedDonorIds 正确记录", () => {
    const treated = makeTrajectory("t1", "full", "invest", 3, 0.7, 0.3, 0.4, 0.5);
    const donors = [makeTrajectory("d1", "none", "invest", 3, 0.5, 0.3, 0.4, 0.5)];
    const eff = estimateCausalEffect(treated, donors, 1);
    expect(eff.matchedDonorIds).toEqual(["d1"]);
  });
});

// ============================================================================
// permutationTest
// ============================================================================

describe("permutationTest", () => {
  it("无差异时 p-value 应较大（>0.3）", () => {
    // treated 和 donors 有相同的 τ 分布
    const treated = Array.from({ length: 10 }, (_, i) =>
      makeTrajectory(`t${i}`, "full", "invest", 3, 0.5, 0.3, 0.4, 0.5)
    );
    const donors = Array.from({ length: 10 }, (_, i) =>
      makeTrajectory(`d${i}`, "none", "invest", 3, 0.5, 0.3, 0.4, 0.5)
    );
    const p = permutationTest(treated, donors, 5, 500, 42);
    expect(p).toBeGreaterThan(0.3);
  });

  it("有差异时 p-value 应较小（<0.2）", () => {
    // treated τ 全部高于 donors
    const treated = Array.from({ length: 10 }, (_, i) =>
      makeTrajectory(`t${i}`, "full", "invest", 3, 0.9, 0.3, 0.4, 0.5)
    );
    const donors = Array.from({ length: 10 }, (_, i) =>
      makeTrajectory(`d${i}`, "none", "invest", 3, 0.1, 0.3, 0.4, 0.5)
    );
    const p = permutationTest(treated, donors, 5, 500, 42);
    expect(p).toBeLessThan(0.2);
  });

  it("空数组返回 p=1", () => {
    expect(permutationTest([], [], 5, 100)).toBe(1.0);
  });

  it("可复现: 相同 seed 产生相同 p-value", () => {
    const treated = Array.from({ length: 5 }, (_, i) =>
      makeTrajectory(`t${i}`, "full", "invest", 3, 0.7, 0.3, 0.4, 0.5)
    );
    const donors = Array.from({ length: 5 }, (_, i) =>
      makeTrajectory(`d${i}`, "none", "invest", 3, 0.5, 0.3, 0.4, 0.5)
    );
    const p1 = permutationTest(treated, donors, 5, 200, 42);
    const p2 = permutationTest(treated, donors, 5, 200, 42);
    expect(p1).toBe(p2);
  });
});

// ============================================================================
// bootstrapCI
// ============================================================================

describe("bootstrapCI", () => {
  it("CI 包含均值", () => {
    const effects = [0.1, 0.2, 0.15, 0.25, 0.1, 0.3, 0.05, 0.2];
    const [lower, upper] = bootstrapCI(effects, 5000, 42);
    const mean = effects.reduce((a, b) => a + b, 0) / effects.length;
    expect(lower).toBeLessThan(mean);
    expect(upper).toBeGreaterThan(mean);
  });

  it("单元素数组返回 NaN", () => {
    const [lower, upper] = bootstrapCI([0.5], 100);
    expect(lower).toBeNaN();
    expect(upper).toBeNaN();
  });

  it("可复现", () => {
    const effects = [0.1, 0.2, 0.3, 0.4, 0.5];
    const [l1, u1] = bootstrapCI(effects, 1000, 42);
    const [l2, u2] = bootstrapCI(effects, 1000, 42);
    expect(l1).toBe(l2);
    expect(u1).toBe(u2);
  });
});

// ============================================================================
// computeCohensD
// ============================================================================

describe("computeCohensD", () => {
  it("完全相同的分布 d=0", () => {
    const a = [0.5, 0.5, 0.5, 0.5];
    const b = [0.5, 0.5, 0.5, 0.5];
    expect(computeCohensD(a, b)).toBe(0);
  });

  it("a > b 时 d > 0", () => {
    const a = [0.8, 0.9, 0.7, 0.85];
    const b = [0.2, 0.3, 0.1, 0.25];
    expect(computeCohensD(a, b)).toBeGreaterThan(2); // 大效应
  });

  it("样本不足返回 0", () => {
    expect(computeCohensD([0.5], [0.5])).toBe(0);
  });
});

// ============================================================================
// analyzeCausalEffects
// ============================================================================

describe("analyzeCausalEffects", () => {
  it("完整分析流程: 分组 + 匹配 + 效应 + CI + p-value", () => {
    const trajectories: ExperimentTrajectory[] = [
      // donors (None 模式)
      ...Array.from({ length: 5 }, (_, i) =>
        makeTrajectory(`invest_none_${i}`, "none", "invest", 3, 0.4 + i * 0.02, 0.2, 0.3, 0.5)
      ),
      // treated (Full 模式，有干预)
      ...Array.from({ length: 5 }, (_, i) =>
        makeTrajectory(`invest_full_${i}`, "full", "invest", 3, 0.6 + i * 0.02, 0.2, 0.3, 0.5, [
          { round: 2, type: "introduce_diversity" },
        ])
      ),
    ];

    const result = analyzeCausalEffects(trajectories, 3, 500, 1000);

    expect(result.overallATE).toHaveLength(1);
    expect(result.overallATE[0].label).toBe("invest_3");
    expect(result.overallATE[0].nTreated).toBe(5);
    expect(result.overallATE[0].nDonors).toBe(5);
    expect(result.overallATE[0].meanEffect).toBeGreaterThan(0); // 正效应
    expect(result.overallATE[0].ciLower).toBeLessThan(result.overallATE[0].meanEffect);
    expect(result.overallATE[0].ciUpper).toBeGreaterThan(result.overallATE[0].meanEffect);
    expect(result.overallATE[0].pValue).toBeGreaterThanOrEqual(0);
    expect(result.overallATE[0].pValue).toBeLessThanOrEqual(1);

    expect(result.perInterventionType).toHaveLength(1);
    expect(result.perInterventionType[0].label).toContain("introduce_diversity");

    expect(result.individualEffects).toHaveLength(5);
    expect(result.assumptions.length).toBeGreaterThan(0);
  });

  it("无 treated 时跳过", () => {
    const trajectories: ExperimentTrajectory[] = [
      makeTrajectory("d1", "none", "invest", 3, 0.4, 0.2, 0.3, 0.5),
    ];
    const result = analyzeCausalEffects(trajectories);
    expect(result.overallATE).toHaveLength(0);
    expect(result.individualEffects).toHaveLength(0);
  });

  it("shuffle 模式不纳入分析", () => {
    const trajectories: ExperimentTrajectory[] = [
      makeTrajectory("s1", "shuffle", "invest", 3, 0.5, 0.2, 0.3, 0.5),
      makeTrajectory("d1", "none", "invest", 3, 0.4, 0.2, 0.3, 0.5),
      makeTrajectory("t1", "full", "invest", 3, 0.6, 0.2, 0.3, 0.5),
    ];
    const result = analyzeCausalEffects(trajectories);
    expect(result.overallATE[0].nTreated).toBe(1);
    expect(result.overallATE[0].nDonors).toBe(1);
  });
});
