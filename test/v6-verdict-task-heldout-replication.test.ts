/**
 * V6 Verification Verdict — task-heldout replication frozen-plan tests.
 *
 * These pin the design invariants: the frozen 8-task set and order, 8 unique
 * leakage groups, 96 unique runIds (task x replicate 1..12), identity disjoint
 * from the exploratory / continuation plans, deterministic hashes, budget caps,
 * no-replace plan, zero-provider plan mode, fail-closed replay on missing
 * artifacts, and the frozen DEFER rule.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  VERDICT_TASK_HELDOUT_EXPERIMENT_REF,
  VERDICT_TASK_HELDOUT_LEAKAGE_GROUPS,
  VERDICT_TASK_HELDOUT_MAX_PROVIDER_CALLS,
  VERDICT_TASK_HELDOUT_MAX_TOTAL_TOKENS,
  VERDICT_TASK_HELDOUT_OUTPUT_DIR,
  VERDICT_TASK_HELDOUT_PLAN_PATH,
  VERDICT_TASK_HELDOUT_REPLICATE_COUNT,
  VERDICT_TASK_HELDOUT_TASK_IDS,
  buildVerdictTaskHeldoutManifestV1,
  buildVerdictTaskHeldoutReplicationPlan,
  runTaskHeldoutReplayV1,
} from "../experiments/campaign/v6/run_v6_verdict_task_heldout_replication";
import { VERDICT_EXPLORATORY_TASK_IDS } from "../experiments/campaign/v6/run_v6_verdict_exploratory";
import {
  evaluateTaskHeldoutDeferV1,
  taskClusterDifferenceBootstrap,
} from "../experiments/campaign/v6/analyze_v6_verdict_task_heldout_replication";

const plan = buildVerdictTaskHeldoutReplicationPlan();
const runs = plan.tasks.flatMap(task => task.runs);

describe("task-heldout frozen task set and leakage groups", () => {
  it("keeps the frozen task set and order, each with a unique leakage group", () => {
    expect(plan.taskIds).toEqual([5, 7, 14, 21, 57, 61, 64, 65]);
    expect(VERDICT_TASK_HELDOUT_TASK_IDS).toEqual([5, 7, 14, 21, 57, 61, 64, 65]);
    const manifest = buildVerdictTaskHeldoutManifestV1();
    expect(manifest.taskLeakageGroups).toHaveLength(8);
    expect(new Set(manifest.taskLeakageGroups.map(group => group.taskId)).size).toBe(8);
    expect(new Set(manifest.taskLeakageGroups.map(group => group.leakageGroup)).size).toBe(8);
    for (const group of manifest.taskLeakageGroups) {
      expect(group.leakageGroup.startsWith("hb-v6r1:")).toBe(true);
    }
  });

  it("records the review identity before the plan createdAt and never claims admission", () => {
    const manifest = buildVerdictTaskHeldoutManifestV1();
    expect(manifest.reviewProtocolRef.id).toBe("swarmalpha.review.v6-verdict-task-heldout-replication");
    expect(manifest.reviewProtocolRef.version).toBe("1.0.0");
    expect(Date.parse(manifest.reviewedAt)).toBeLessThan(Date.parse(manifest.planCreatedAt));
    expect(manifest.scopeNote).toContain("not confirmatory task-bank admission");
    expect(manifest.scopeNote).toContain("not wired into production");
  });
});

describe("96-run identity (task x replicate 1..12)", () => {
  it("builds exactly 96 unique G runIds covering every task x replicate", () => {
    expect(plan.totalRuns).toBe(96);
    expect(plan.tasks).toHaveLength(8);
    expect(runs).toHaveLength(96);
    expect(new Set(runs.map(run => run.runId)).size).toBe(96);
    expect(runs.every(run => run.protocol === "epistemic_governance_v1")).toBe(true);
    expect(runs.every(run => run.replicate >= 1 && run.replicate <= VERDICT_TASK_HELDOUT_REPLICATE_COUNT)).toBe(true);
    for (const taskId of plan.taskIds) {
      const taskRuns = runs.filter(run => run.taskId === taskId);
      expect(taskRuns).toHaveLength(12);
      expect(new Set(taskRuns.map(run => run.replicate))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    }
  });

  it("uses monitoringMasterSeed = replicate - 1 and a fresh experiment namespace", () => {
    for (const task of plan.tasks) {
      for (const run of task.runs) {
        expect(run.monitoringMasterSeed).toBe(run.replicate - 1);
        expect(run.runId).toContain("v6-verdict-task-heldout-replication-v1");
        expect(run.runId).toMatch(new RegExp(`:task-${task.taskId}:G:r${run.replicate}$`));
      }
    }
  });

  it("does not overlap with the exploratory / continuation task set or experiment identity", () => {
    for (const id of VERDICT_TASK_HELDOUT_TASK_IDS) {
      expect(VERDICT_EXPLORATORY_TASK_IDS).not.toContain(id);
    }
    expect(VERDICT_TASK_HELDOUT_EXPERIMENT_REF.id).toContain("task-heldout-replication");
    expect(VERDICT_TASK_HELDOUT_EXPERIMENT_REF.id).not.toContain("exploratory");
    expect(VERDICT_TASK_HELDOUT_EXPERIMENT_REF.id).not.toContain("continuation");
  });
});

describe("deterministic plan, budget, and paths", () => {
  it("is deterministic and hashes canonically", () => {
    const second = buildVerdictTaskHeldoutReplicationPlan();
    expect(second).toEqual(plan);
    expect(plan.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("stays within the frozen provider and token caps", () => {
    expect(plan.maxProviderCalls).toBe(VERDICT_TASK_HELDOUT_MAX_PROVIDER_CALLS);
    expect(plan.maxTotalTokens).toBe(VERDICT_TASK_HELDOUT_MAX_TOTAL_TOKENS);
    expect(plan.totalPlannedProviderCalls).toBeLessThanOrEqual(VERDICT_TASK_HELDOUT_MAX_PROVIDER_CALLS);
    expect(plan.totalEstimatedTokens).toBeLessThanOrEqual(VERDICT_TASK_HELDOUT_MAX_TOTAL_TOKENS);
  });

  it("keeps the plan and output paths inside the repository (non-escapable)", () => {
    const repo = path.resolve(process.cwd());
    expect(VERDICT_TASK_HELDOUT_PLAN_PATH.startsWith(repo)).toBe(true);
    expect(VERDICT_TASK_HELDOUT_OUTPUT_DIR.startsWith(repo)).toBe(true);
    expect(VERDICT_TASK_HELDOUT_PLAN_PATH).not.toContain("..");
    expect(VERDICT_TASK_HELDOUT_OUTPUT_DIR).not.toContain("..");
  });

  it("no-replace plan authority materializes once and never drifts", () => {
    expect(fs.existsSync(VERDICT_TASK_HELDOUT_PLAN_PATH)).toBe(true);
    const existing = JSON.parse(fs.readFileSync(VERDICT_TASK_HELDOUT_PLAN_PATH, "utf8"));
    expect(existing).toEqual(plan);
  });
});

describe("output root and fail-closed replay (state-aware)", () => {
  it("plan build itself never creates run artifacts, and any present artifacts are the planned ones", () => {
    // Rebuilding the frozen plan is pure with respect to the output root.
    const rebuilt = buildVerdictTaskHeldoutReplicationPlan();
    expect(rebuilt).toEqual(plan);
    const plannedIds = new Set(plan.tasks.flatMap(task => task.runs.map(run => run.runId)));
    const rawRuns = fs.existsSync(VERDICT_TASK_HELDOUT_OUTPUT_DIR)
      ? fs.readdirSync(VERDICT_TASK_HELDOUT_OUTPUT_DIR).filter(f => f.endsWith(".raw-run.v5.json"))
      : [];
    if (rawRuns.length === 0) {
      // Pre-execution: plan mode left the output root untouched.
      expect(fs.existsSync(VERDICT_TASK_HELDOUT_OUTPUT_DIR)).toBe(false);
      return;
    }
    // Post-execution: every artifact present is one of the planned runIds, no more.
    expect(rawRuns).toHaveLength(plannedIds.size);
    for (const file of rawRuns) {
      const runId = `run:${file.slice("run_".length).split(".")[0].replaceAll("_", ":")}`;
      expect(plannedIds.has(runId)).toBe(true);
    }
  });

  it("replay fails closed when a planned artifact is missing, else verifies every planned artifact", () => {
    const rawRuns = fs.existsSync(VERDICT_TASK_HELDOUT_OUTPUT_DIR)
      ? fs.readdirSync(VERDICT_TASK_HELDOUT_OUTPUT_DIR).filter(f => f.endsWith(".raw-run.v5.json")).length
      : 0;
    if (rawRuns < plan.totalRuns) {
      expect(() => runTaskHeldoutReplayV1()).toThrow(/task-heldout-missing-artifact/);
    } else {
      const replay = runTaskHeldoutReplayV1();
      expect(replay.verified).toBe(plan.totalRuns);
      expect(replay.expected).toBe(plan.totalRuns);
    }
  });
});

describe("frozen DEFER rule (extended gate)", () => {
  const pass = {
    missingRuns: 0,
    applyN: 29,
    holdoutN: 14,
    applyTaskClusters: 8,
    holdoutTaskClusters: 6,
    bootstrapValidFraction: 0.98,
    naiveEffect: -0.08,
    bootstrapUpper: -0.01,
  };

  it("does not defer when the point and upper bound are negative and samples are sufficient", () => {
    expect(evaluateTaskHeldoutDeferV1(pass)).toEqual([]);
  });

  it("defers when any apply/holdout arm has <10 events, <6 clusters, or valid fraction <0.95", () => {
    expect(evaluateTaskHeldoutDeferV1({ ...pass, applyN: 9 })).toContain("apply n<10");
    expect(evaluateTaskHeldoutDeferV1({ ...pass, holdoutN: 9 })).toContain("holdout n<10");
    expect(evaluateTaskHeldoutDeferV1({ ...pass, applyTaskClusters: 5 })).toContain("apply task clusters<6");
    expect(evaluateTaskHeldoutDeferV1({ ...pass, holdoutTaskClusters: 5 })).toContain("holdout task clusters<6");
    expect(evaluateTaskHeldoutDeferV1({ ...pass, bootstrapValidFraction: 0.90 })).toContain("bootstrap valid fraction<0.95");
  });

  it("defers when any planned run is missing", () => {
    expect(evaluateTaskHeldoutDeferV1({ ...pass, missingRuns: 1 })).toContain("missing runs>0");
    expect(evaluateTaskHeldoutDeferV1({ ...pass, missingRuns: 0 })).not.toContain("missing runs>0");
  });

  it("defers when the observed naive point estimate is >=0", () => {
    expect(evaluateTaskHeldoutDeferV1({ ...pass, naiveEffect: 0 })).toContain("observed naive apply-holdout>=0");
    expect(evaluateTaskHeldoutDeferV1({ ...pass, naiveEffect: 0.05 })).toContain("observed naive apply-holdout>=0");
    expect(evaluateTaskHeldoutDeferV1({ ...pass, naiveEffect: -0.0001 })).not.toContain("observed naive apply-holdout>=0");
  });

  it("defers when the bootstrap 95% upper bound is >=0", () => {
    expect(evaluateTaskHeldoutDeferV1({ ...pass, bootstrapUpper: 0 })).toContain("bootstrap 95% upper bound>=0");
    expect(evaluateTaskHeldoutDeferV1({ ...pass, bootstrapUpper: 0.02 })).toContain("bootstrap 95% upper bound>=0");
    expect(evaluateTaskHeldoutDeferV1({ ...pass, bootstrapUpper: -0.0001 })).not.toContain("bootstrap 95% upper bound>=0");
  });

  it("defers when the observed naive point estimate or upper bound is NaN/null/non-finite", () => {
    expect(evaluateTaskHeldoutDeferV1({ ...pass, naiveEffect: Number.NaN })).toContain("observed naive apply-holdout not finite");
    expect(evaluateTaskHeldoutDeferV1({ ...pass, naiveEffect: null })).toContain("observed naive apply-holdout not finite");
    expect(evaluateTaskHeldoutDeferV1({ ...pass, bootstrapUpper: null })).toContain("bootstrap 95% upper bound not finite");
    expect(evaluateTaskHeldoutDeferV1({ ...pass, naiveEffect: Number.POSITIVE_INFINITY })).toContain("observed naive apply-holdout not finite");
  });

  it("combines the observed point gate with the sample-size gate", () => {
    expect(evaluateTaskHeldoutDeferV1({ ...pass, naiveEffect: -0.08, bootstrapUpper: 0.01, applyN: 9 }))
      .toEqual(expect.arrayContaining(["apply n<10", "bootstrap 95% upper bound>=0"]));
  });
});

describe("deterministic task-cluster bootstrap", () => {
  it("reproduces the same percentile interval and valid fraction under the same seed", () => {
    const args = {
      applyRuns: [{ taskId: 5, brier: 0.5 }, { taskId: 7, brier: 0.6 }],
      holdoutRuns: [{ taskId: 5, brier: 0.4 }, { taskId: 7, brier: 0.3 }],
      taskIds: [5, 7],
      count: 1000,
      seed: "test-seed",
    };
    const first = taskClusterDifferenceBootstrap(args.applyRuns, args.holdoutRuns, args.taskIds, args.count, args.seed);
    const second = taskClusterDifferenceBootstrap(args.applyRuns, args.holdoutRuns, args.taskIds, args.count, args.seed);
    expect(first.diffs).toEqual(second.diffs);
    expect(first.validFraction).toBe(second.validFraction);
    expect(first.validFraction).toBeGreaterThan(0.9);
  });
});

describe("no legacy provider or retrying callLLM import", () => {
  it("runner and analyzer never import the retrying llm provider path", () => {
    for (const file of [
      "experiments/campaign/v6/run_v6_verdict_task_heldout_replication.ts",
      "experiments/campaign/v6/analyze_v6_verdict_task_heldout_replication.ts",
    ]) {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/callLLM/);
      expect(source).not.toMatch(/from ".*src\/lib\/llm/);
    }
  });
});
