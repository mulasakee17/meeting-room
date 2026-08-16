import { describe, expect, it } from "vitest";

import { createHiddenBenchTaskProjectionV1 } from "../experiments/campaign/v6/hiddenBenchTaskAdapter";
import {
  createSourceDisclosureTaskVariantV1,
  SOURCE_DISCLOSURE_INTERVENTION_V1,
} from "../experiments/campaign/v6/sourceDisclosureInterventionV1";

function task() {
  return createHiddenBenchTaskProjectionV1({ sourceTaskId: 5 }).adapter.task;
}

describe("source-disclosure mechanism screen", () => {
  it("selects the same frozen source in paired holdout and disclosure arms", () => {
    const base = task();
    const common = { blockId: "task:5:pair:1", task: base, sourceSelectionSeed: 731 };
    const holdout = createSourceDisclosureTaskVariantV1({
      ...common, runId: "run:holdout", arm: "holdout",
    });
    const disclosure = createSourceDisclosureTaskVariantV1({
      ...common, runId: "run:disclosure", arm: "forced_source_disclosure",
    });

    expect(holdout.selection.sourceAgentId).toBe(disclosure.selection.sourceAgentId);
    expect(holdout.selection.sourcePrivateInformationHash)
      .toBe(disclosure.selection.sourcePrivateInformationHash);
    expect(holdout.selection.sourceSelectionKeyHash)
      .toBe(disclosure.selection.sourceSelectionKeyHash);
  });

  it("does not use the outcome when selecting or exposing the source", () => {
    const base = task();
    const altered = structuredClone(base);
    altered.outcome = altered.claim.options.find(option => option !== base.outcome)!;
    const common = {
      runId: "run:truth-blind",
      blockId: "task:5:pair:2",
      arm: "forced_source_disclosure" as const,
      sourceSelectionSeed: 731,
    };
    const original = createSourceDisclosureTaskVariantV1({ ...common, task: base });
    const changed = createSourceDisclosureTaskVariantV1({ ...common, task: altered });

    expect(changed.selection).toEqual(original.selection);
    expect(changed.task.publicContext).toBe(original.task.publicContext);
  });

  it("leaves holdout public context byte-identical", () => {
    const base = task();
    const result = createSourceDisclosureTaskVariantV1({
      runId: "run:holdout",
      blockId: "task:5:pair:3",
      task: base,
      arm: "holdout",
      sourceSelectionSeed: 731,
    });
    expect(result.task.publicContext).toBe(base.publicContext);
    expect(result.selection.publicContextAfterHash).toBe(result.selection.publicContextBeforeHash);
    expect(result.selection.disclosed).toBe(false);
  });

  it("preserves every non-public-context task field byte-for-byte", () => {
    const base = task();
    const result = createSourceDisclosureTaskVariantV1({
      runId: "run:single-manipulation",
      blockId: "task:5:pair:single-manipulation",
      task: base,
      arm: "forced_source_disclosure",
      sourceSelectionSeed: 731,
    });
    expect({ ...result.task, publicContext: base.publicContext }).toEqual(base);
  });

  it("discloses exactly the selected registered private observation", () => {
    const base = task();
    const result = createSourceDisclosureTaskVariantV1({
      runId: "run:disclosure",
      blockId: "task:5:pair:4",
      task: base,
      arm: "forced_source_disclosure",
      sourceSelectionSeed: 731,
    });
    const selected = base.agents.find(agent => agent.agentId === result.selection.sourceAgentId)!;
    const unselected = base.agents.filter(agent => agent.agentId !== selected.agentId);

    expect(result.task.publicContext).toContain(selected.privateInformation);
    for (const agent of unselected) {
      expect(result.task.publicContext).not.toContain(agent.privateInformation);
    }
    expect(result.task.publicContext).toContain("not a correctness certificate");
    expect(result.selection.disclosed).toBe(true);
    expect(result.selection.publicContextAfterHash).not.toBe(result.selection.publicContextBeforeHash);
  });

  it("changes source only through the frozen block, task, or source seed", () => {
    const base = task();
    const run = (blockId: string, seed: number) => createSourceDisclosureTaskVariantV1({
      runId: `run:${blockId}:${seed}`,
      blockId,
      task: base,
      arm: "forced_source_disclosure" as const,
      sourceSelectionSeed: seed,
    });
    const a = run("task:5:pair:5", 731);
    const same = run("task:5:pair:5", 731);
    const otherBlock = run("task:5:pair:6", 731);
    const otherSeed = run("task:5:pair:5", 732);

    expect(same.selection.sourceSelectionKeyHash).toBe(a.selection.sourceSelectionKeyHash);
    expect(otherBlock.selection.sourceSelectionKeyHash).not.toBe(a.selection.sourceSelectionKeyHash);
    expect(otherSeed.selection.sourceSelectionKeyHash).not.toBe(a.selection.sourceSelectionKeyHash);
  });

  it("does not mutate the source task and isolates frozen outputs", () => {
    const base = task();
    const before = structuredClone(base);
    const result = createSourceDisclosureTaskVariantV1({
      runId: "run:isolation",
      blockId: "task:5:pair:7",
      task: base,
      arm: "forced_source_disclosure",
      sourceSelectionSeed: 731,
    });

    expect(base).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.task)).toBe(true);
    expect(Object.isFrozen(result.selection)).toBe(true);
  });

  it("fails closed on unsupported arms, invalid seeds, and unusable source rosters", () => {
    const base = task();
    expect(() => createSourceDisclosureTaskVariantV1({
      runId: "run:x", blockId: "block:x", task: base,
      arm: "other" as never, sourceSelectionSeed: 1,
    })).toThrow(/arm/);
    expect(() => createSourceDisclosureTaskVariantV1({
      runId: "run:x", blockId: "block:x", task: base,
      arm: "holdout", sourceSelectionSeed: -1,
    })).toThrow(/sourceSelectionSeed/);
    expect(() => createSourceDisclosureTaskVariantV1({
      runId: "run:x", blockId: "block:x", task: { ...base, agents: [] },
      arm: "holdout", sourceSelectionSeed: 1,
    })).toThrow(/at least two/);
  });

  it("uses a versioned non-verification intervention identity", () => {
    expect(SOURCE_DISCLOSURE_INTERVENTION_V1).toEqual({
      id: "swarmalpha.intervention.pre-discussion-source-disclosure",
      version: "1.0.0",
    });
    expect(SOURCE_DISCLOSURE_INTERVENTION_V1.id).not.toMatch(/verification/);
  });
});
