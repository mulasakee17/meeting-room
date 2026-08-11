/**
 * HiddenBench pinned-data → V6 categorical authority adversarial tests.
 *
 * RED-ZONE reproduction first: the projection places `options` inside
 * `resolutionPolicy` instead of on the categorical claim itself, so the claim
 * cannot be committed by createV6TaskManifestV1. Per the handoff stop
 * condition, production is NOT modified; this file records the minimal
 * reproduction and keeps the tests that exercise the unaffected boundaries.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HIDDENBENCH_OFFICIAL_SOURCE_V1,
  HIDDENBENCH_PINNED_DATA_RESOLVER_ID_V1,
  HIDDENBENCH_PINNED_DATA_TASK_ADAPTER_V1,
  createHiddenBenchTaskBankEntryV1,
  createHiddenBenchTaskProjectionV1,
  deriveHiddenBenchSyntacticLeakageGroupIdV1,
  listHiddenBenchTaskCatalogV1,
  loadCanonicalHiddenBenchTasksV1,
} from "../experiments/campaign/v6/hiddenBenchTaskAdapter";
import {
  createV6TaskBankManifestV1,
  type V6TaskBankEntryV1,
} from "../experiments/campaign/v6/taskBank";
import { computeV6TaskDefinitionHashV1, createV6TaskManifestV1 } from "../experiments/campaign/v6/v6TaskManifest";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tmpFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hb-v6-"));
  tempDirs.push(dir);
  const file = path.join(dir, "benchmark.json");
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function loadOriginal(): unknown {
  const p = path.resolve(process.cwd(), "experiments/campaign/tasks/hiddenbench/benchmark.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function mutate(original: Array<Record<string, unknown>>, fn: (t: Record<string, unknown>) => void): unknown[] {
  const clone = structuredClone(original);
  fn(clone[0]);
  return clone;
}

describe("RED-ZONE reproduction: categorical claim options must live on the claim", () => {
  it("places options on the claim, not inside resolutionPolicy", () => {
    const proj = createHiddenBenchTaskProjectionV1({ sourceTaskId: 1, dataPath: DATA_PATH });
    // V6CategoricalTaskV1 requires `options` on the categorical claim.
    expect("options" in proj.adapter.task.claim).toBe(true);
    expect((proj.adapter.task.claim as { options: string[] }).options).toHaveLength(3);
  });

  it("projects a task that createV6TaskManifestV1 can actually commit", () => {
    const proj = createHiddenBenchTaskProjectionV1({ sourceTaskId: 1, dataPath: DATA_PATH });
    const authority = {
      adapterRef: proj.adapter.adapterRef,
      taskSchemaRef: proj.adapter.taskSchemaRef,
      resolution: proj.adapter.resolution,
    };
    // Committing the projected categorical task must succeed; currently it
    // throws because the claim lacks top-level options.
    expect(() => createV6TaskManifestV1({
      runId: "run:hb:1",
      studyRef: { id: "swarmalpha.study.hiddenbench", version: "1.0.0" },
      task: proj.adapter.task as never,
      authority,
      monitoringDesignRef: { id: "swarmalpha.monitoring.hb", version: "1.0.0" },
      monitoringDesignHash: `sha256:${"a".repeat(64)}`,
      committedAt: "2026-08-11T00:00:00.000Z",
    })).not.toThrow();
  });

  it("loader accepts the actual pinned 65 tasks (tasks 9-65 carry a rationale field)", () => {
    // The pinned data has an 8th field `rationale` on tasks 9-65; the
    // adapter's strict 7-key schema validation rejects them.
    expect(() => loadCanonicalHiddenBenchTasksV1(DATA_PATH)).not.toThrow();
  });

  it("default loader resolves the pinned data path without a URL-scheme error", () => {
    // fileURLToPath(new URL(relative, import.meta.url)) throws in the tsx/vitest
    // context; the default loader must work without a caller-supplied path.
    expect(() => loadCanonicalHiddenBenchTasksV1()).not.toThrow();
  });
});

const DATA_PATH = path.resolve(process.cwd(), "experiments/campaign/tasks/hiddenbench/benchmark.json");

describe("A. pinned dataset authority", () => {
  it("loads exactly the pinned 65 tasks by default", () => {
    const tasks = loadCanonicalHiddenBenchTasksV1();
    expect(tasks).toHaveLength(HIDDENBENCH_OFFICIAL_SOURCE_V1.taskCount);
    expect(HIDDENBENCH_OFFICIAL_SOURCE_V1.commit).toBe("3be6ca16");
    expect(tasks[0].id).toBe(1);
    expect(tasks[64].id).toBe(65);
  });

  it("exposes the canonical distribution: K3=59/K4=6 and 3-agent=7/4-agent=58", () => {
    const catalog = listHiddenBenchTaskCatalogV1();
    const byOptions: Record<number, number> = {};
    const byAgents: Record<number, number> = {};
    for (const entry of catalog) {
      byOptions[entry.optionCount] = (byOptions[entry.optionCount] ?? 0) + 1;
      byAgents[entry.agentCount] = (byAgents[entry.agentCount] ?? 0) + 1;
    }
    expect(byOptions).toEqual({ 3: 59, 4: 6 });
    expect(byAgents).toEqual({ 3: 7, 4: 58 });
  });

  it("accepts semantically identical re-serialization (whitespace/format tolerance)", () => {
    const compact = JSON.stringify(loadOriginal());
    expect(() => loadCanonicalHiddenBenchTasksV1(tmpFile(compact))).not.toThrow();
  });

  it("rejects any semantic content change: field, option order, hidden order, answer, order, count", () => {
    const original = loadOriginal() as Array<Record<string, unknown>>;
    const cases: Array<[string, unknown[]]> = [
      ["field value", mutate(original, t => { t.name = `${t.name} drift`; })],
      ["option order", mutate(original, t => { t.possible_answers = [...t.possible_answers as string[]].reverse(); })],
      ["hidden order", mutate(original, t => { t.hidden_information = [...t.hidden_information as string[]].reverse(); })],
      ["correct answer", mutate(original, t => { (t as { correct_answer: string }).correct_answer = (t.possible_answers as string[]).find(a => a !== t.correct_answer)!; })],
      ["task order", [original[1], original[0], ...original.slice(2)]],
      ["task count", original.slice(0, 64)],
    ];
    for (const [label, data] of cases) {
      expect(() => loadCanonicalHiddenBenchTasksV1(tmpFile(JSON.stringify(data))), `must reject ${label}`).toThrow();
    }
  });

  it("rejects duplicate/empty fields, non-contiguous IDs, and answers outside options", () => {
    const original = loadOriginal() as Array<Record<string, unknown>>;
    const dupOption = mutate(original, t => { const opts = t.possible_answers as string[]; t.possible_answers = [...opts, opts[0]]; });
    expect(() => loadCanonicalHiddenBenchTasksV1(tmpFile(JSON.stringify(dupOption)))).toThrow(/duplicates/);
    const emptyName = mutate(original, t => { t.name = ""; });
    expect(() => loadCanonicalHiddenBenchTasksV1(tmpFile(JSON.stringify(emptyName)))).toThrow(/non-empty/);
    const nonContiguous = mutate(original, t => { t.id = 99; });
    expect(() => loadCanonicalHiddenBenchTasksV1(tmpFile(JSON.stringify(nonContiguous)))).toThrow(/contiguous/);
    const answerOutside = mutate(original, t => { t.correct_answer = "Option Z"; });
    expect(() => loadCanonicalHiddenBenchTasksV1(tmpFile(JSON.stringify(answerOutside)))).toThrow(/one canonical option/);
  });
});

describe("D. leakage and task-bank boundary (claim-independent)", () => {
  it("shares one syntactic group across tasks 1/2/3 and splits distinct descriptions", () => {
    const catalog = listHiddenBenchTaskCatalogV1();
    const g = (id: number) => catalog.find(e => e.sourceTaskId === id)!.syntacticLeakageGroupId;
    expect(g(1)).toBe(g(2));
    expect(g(1)).toBe(g(3));
    expect(g(4)).not.toBe(g(1));
    expect(g(1).startsWith("hiddenbench:description:")).toBe(true);
  });

  it("treats the syntactic group as a lower bound, not semantic no-leakage proof", () => {
    const a = deriveHiddenBenchSyntacticLeakageGroupIdV1("  Evacuate   west.  ");
    const b = deriveHiddenBenchSyntacticLeakageGroupIdV1("Evacuate west.");
    expect(a).toBe(b);
    expect(deriveHiddenBenchSyntacticLeakageGroupIdV1("Evacuate east.")).not.toBe(a);
  });

  it("lets an engineering_canary omit semanticLeakageGroupId and fall back to the syntactic group", () => {
    const entry = createHiddenBenchTaskBankEntryV1({ sourceTaskId: 1, split: "engineering_canary", semanticReview: { status: "not_reviewed" } });
    expect(entry.split).toBe("engineering_canary");
    expect(entry.leakageGroupId).toBe(listHiddenBenchTaskCatalogV1()[0].syntacticLeakageGroupId);
  });

  it("requires accepted semantic review and an explicit semantic group for scientific splits", () => {
    const accepted = { status: "accepted" as const, reviewProtocolRef: { id: "review:v1", version: "1.0.0" }, reviewedAt: "2026-08-11T00:00:00.000Z" };
    expect(() => createHiddenBenchTaskBankEntryV1({ sourceTaskId: 1, split: "threshold_calibration", semanticReview: { status: "not_reviewed" } })).toThrow(/accepted semantic review/);
    expect(() => createHiddenBenchTaskBankEntryV1({ sourceTaskId: 1, split: "threshold_calibration", semanticReview: accepted })).toThrow(/explicit semantic leakage group/);
    const ok = createHiddenBenchTaskBankEntryV1({ sourceTaskId: 1, split: "threshold_calibration", semanticReview: accepted, semanticLeakageGroupId: "semantic:group-x" });
    expect(ok.split).toBe("threshold_calibration");
    expect(ok.leakageGroupId).toBe("semantic:group-x");
    expect(createHiddenBenchTaskBankEntryV1({ sourceTaskId: 2, split: "held_out_detector", semanticReview: accepted, semanticLeakageGroupId: "semantic:group-x" }).split).toBe("held_out_detector");
    expect(createHiddenBenchTaskBankEntryV1({ sourceTaskId: 3, split: "confirmatory", semanticReview: accepted, semanticLeakageGroupId: "semantic:group-x" }).split).toBe("confirmatory");
  });

  it("allows a manual semantic group to merge different syntactic clusters", () => {
    const accepted = { status: "accepted" as const, reviewProtocolRef: { id: "review:v1", version: "1.0.0" }, reviewedAt: "2026-08-11T00:00:00.000Z" };
    const e1 = createHiddenBenchTaskBankEntryV1({ sourceTaskId: 1, split: "threshold_calibration", semanticReview: accepted, semanticLeakageGroupId: "semantic:merged" });
    const e4 = createHiddenBenchTaskBankEntryV1({ sourceTaskId: 4, split: "confirmatory", semanticReview: accepted, semanticLeakageGroupId: "semantic:merged" });
    expect(listHiddenBenchTaskCatalogV1()[0].syntacticLeakageGroupId).not.toBe(listHiddenBenchTaskCatalogV1()[3].syntacticLeakageGroupId);
    expect(e1.leakageGroupId).toBe("semantic:merged");
    expect(e4.leakageGroupId).toBe("semantic:merged");
  });

  it("never infers a scientific split; the caller's split is authoritative", () => {
    const entry = createHiddenBenchTaskBankEntryV1({ sourceTaskId: 5, split: "held_out_detector", semanticReview: { status: "accepted", reviewProtocolRef: { id: "review:v1", version: "1.0.0" }, reviewedAt: "2026-08-11T00:00:00.000Z" }, semanticLeakageGroupId: "semantic:g" });
    expect(entry.split).toBe("held_out_detector");
  });

  it("fails closed when one leakage group crosses scientific splits in a generic task-bank manifest", () => {
    const accepted = { status: "accepted" as const, reviewProtocolRef: { id: "review:v1", version: "1.0.0" }, reviewedAt: "2026-08-11T00:00:00.000Z" };
    const cal = createHiddenBenchTaskBankEntryV1({ sourceTaskId: 1, split: "threshold_calibration", semanticReview: accepted, semanticLeakageGroupId: "semantic:cross" });
    const conf = createHiddenBenchTaskBankEntryV1({ sourceTaskId: 2, split: "confirmatory", semanticReview: accepted, semanticLeakageGroupId: "semantic:cross" });
    const entries: V6TaskBankEntryV1[] = [cal, conf];
    expect(() => createV6TaskBankManifestV1({ bankRef: { id: "swarmalpha.bank.test", version: "1.0.0" }, purpose: "confirmatory_candidate", entries, createdAt: "2026-08-11T00:00:00.000Z" })).toThrow(/crosses scientific splits/);
  });
});
