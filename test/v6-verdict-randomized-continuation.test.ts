import { describe, expect, it } from "vitest";
import {
  VERDICT_CONTINUATION_PLAN_PATH,
  VERDICT_CONTINUATION_MAX_PROVIDER_CALLS,
  VERDICT_CONTINUATION_REPLICATES,
  VERDICT_CONTINUATION_MAX_TOTAL_TOKENS,
  buildVerdictRandomizedContinuationPlan,
} from "../experiments/campaign/v6/run_v6_verdict_randomized_continuation";
import * as fs from "node:fs";

describe("V6 verdict randomized continuation frozen plan", () => {
  it("freezes only G runs across the original 20-task set", () => {
    const plan = buildVerdictRandomizedContinuationPlan();
    const runs = plan.tasks.flatMap(task => task.runs);
    expect(plan.taskIds).toHaveLength(20);
    expect(runs).toHaveLength(20 * VERDICT_CONTINUATION_REPLICATES.length);
    expect(new Set(runs.map(run => run.runId)).size).toBe(runs.length);
    expect(runs.every(run => run.protocol === "epistemic_governance_v1")).toBe(true);
    expect(plan.bReplicateCount).toBe(0);
    expect(plan.gReplicateCount).toBe(VERDICT_CONTINUATION_REPLICATES.length);
  });

  it("stays inside the frozen provider and token caps", () => {
    const plan = buildVerdictRandomizedContinuationPlan();
    expect(plan.totalPlannedProviderCalls).toBeLessThanOrEqual(VERDICT_CONTINUATION_MAX_PROVIDER_CALLS);
    expect(plan.totalEstimatedTokens).toBeLessThanOrEqual(VERDICT_CONTINUATION_MAX_TOTAL_TOKENS);
    expect(plan.maxProviderCalls).toBe(VERDICT_CONTINUATION_MAX_PROVIDER_CALLS);
    expect(plan.maxTotalTokens).toBe(VERDICT_CONTINUATION_MAX_TOTAL_TOKENS);
  });

  it("is deterministic and uses independent run identities", () => {
    const first = buildVerdictRandomizedContinuationPlan();
    const second = buildVerdictRandomizedContinuationPlan();
    expect(second).toEqual(first);
    expect(first.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.tasks.flatMap(task => task.runs).every(run =>
      run.runId.includes("v6-verdict-randomized-continuation-v1"))).toBe(true);
  });

  it("materializes the no-replace plan authority when absent", () => {
    const plan = buildVerdictRandomizedContinuationPlan();
    if (fs.existsSync(VERDICT_CONTINUATION_PLAN_PATH)) {
      const existing = JSON.parse(fs.readFileSync(VERDICT_CONTINUATION_PLAN_PATH, "utf8"));
      expect(existing).toEqual(plan);
      return;
    }
    fs.writeFileSync(VERDICT_CONTINUATION_PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
    expect(JSON.parse(fs.readFileSync(VERDICT_CONTINUATION_PLAN_PATH, "utf8"))).toEqual(plan);
  });
});
