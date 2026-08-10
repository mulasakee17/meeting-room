/**
 * governance-estimator-replay.test.ts — 治理估计记录精确重放验证测试
 *
 * 覆盖：
 *   - replay 纯库：verified / mismatch / legacy_unverifiable / unsupported /
 *     invalid 判定，layer/source/input/config/output 篡改检测，
 *     mutation isolation，确定性投影稳定，accessor/Proxy 不抛出
 *   - run-level verifier（verifyRawRunData）：round/agent 严格身份、
 *     name 一致性、duplicate、混合版本、计数自洽（recordCount === Σcounts）
 *   - CLI：真实退出码（零记录 → absent 非零；正常 → 0；篡改 → 非零）
 *   - manifest/CLI 一致性：共享 deriveReplayStatus，禁止 manifest 重复实现
 *   - Runner 两条写路径均发出当前 raw schema version
 */

import { describe, expect, it, beforeEach, beforeAll, afterAll, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "node:child_process";

import {
  GovernanceEstimatorRegistry,
  canonicalizeEstimatorValue,
  verifyGovernanceEstimateRecord,
} from "@/lib/epistemic";
import {
  PROGRESSIVE_ESTIMATOR_ID,
  PROGRESSIVE_ESTIMATOR_VERSION,
  defaultProgressiveEstimatorRegistry,
  progressiveEstimatorContract,
  type ProgressiveEstimatorConfig,
  type ProgressiveEstimatorInput,
  type ProgressiveEstimates,
} from "@/lib/thermodynamics/ProgressiveEstimator";
import type { GovernanceEstimate } from "@/lib/epistemic/semantics";
import type { GovernanceStudyContract } from "@/lib/experimentation";

import { runSingle, setScenarioLoaderForTesting } from "../experiments/campaign/pipeline/Runner";
import { collectJsonFiles } from "../experiments/campaign/verify_replay";
import {
  verifyRawRunData,
  aggregateReplayResults,
  deriveReplayStatus,
} from "../experiments/campaign/replayVerifier";
import { RAW_SCHEMA_VERSION } from "../experiments/campaign/types";
import type { ExperimentConfig } from "../experiments/campaign/types";
import { createRunAssignment } from "../src/lib/experimentation/assignment";

const hoisted = vi.hoisted(() => {
  class FakeDiscussionEngine {
    static runCallCount = 0;
    run = async () => {
      FakeDiscussionEngine.runCallCount++;
      return { roundResults: [], totalRounds: 0, converged: true };
    };
    getRoundDataArray = () => [] as unknown[];
    getCognitiveStates = () => new Map();
    setAgentKnowledge = () => {};
    addGovernancePrompt = () => {};
  }
  return {
    FakeDiscussionEngine,
    hbResult: {
      preVotes: [{ agentId: "a1", agentLabel: "Agent 1", vote: "Alpha", rationale: "r", rawResponse: "{}" }],
      postVotes: [{ agentId: "a1", agentLabel: "Agent 1", vote: "Alpha", rationale: "r", rawResponse: "{}" }],
      discussionHistory: [],
      elapsedMs: 1,
      totalRounds: 1,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    },
    hbCallCount: 0,
  };
});

// Runner 的 hiddenbench 路径需要绕过真实 LLM 协议调用。
vi.mock("../experiments/campaign/pipeline/hiddenbenchProtocol", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../experiments/campaign/pipeline/hiddenbenchProtocol")>();
  return {
    ...actual,
    runHiddenBenchProtocol: async () => {
      hoisted.hbCallCount++;
      return hoisted.hbResult;
    },
  };
});

// belief 模式走 DiscussionEngine；mock 掉引擎执行（无 LLM）。
vi.mock("../src/lib/discussion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/discussion")>();
  return {
    ...actual,
    DiscussionEngine: hoisted.FakeDiscussionEngine,
  };
});

/**
 * Runner 的 loadScenario 通过显式注入点替换（setScenarioLoaderForTesting），
 * 避免测试依赖 vitest 无法解析的 CJS `require` 加载 `.ts` 场景模块。
 */
const mockTASK: any = {
  id: "ma",
  title: "M&A 任务",
  sharedBriefing: "选择并购目标",
  searchKeys: { Alpha: ["alpha"], Beta: ["beta"] },
  correctAnswer: { Alpha: 1, Beta: 2 },
  agents: [
    { id: "a1", name: "A1", role: "分析员", knownItems: "Alpha 信息", initialBias: "关注财务" },
    { id: "a2", name: "A2", role: "风控员", knownItems: "Beta 信息", initialBias: "关注风险" },
  ],
};

beforeAll(() => {
  setScenarioLoaderForTesting(() => ({ task: mockTASK, dataDir: "data" }));
});
afterAll(() => {
  setScenarioLoaderForTesting(undefined);
});

type ReplayableRecord = GovernanceEstimate<
  ProgressiveEstimates,
  ProgressiveEstimatorInput,
  ProgressiveEstimatorConfig
>;

/** 生成与身份 (round=1, agentId=a) 匹配的 canonical fixture 记录。 */
function projectFixture(name = "progressive_icl:a:round:1"): ReplayableRecord {
  return defaultProgressiveEstimatorRegistry.project<
    ProgressiveEstimatorInput,
    ProgressiveEstimates,
    ProgressiveEstimatorConfig
  >(PROGRESSIVE_ESTIMATOR_ID, PROGRESSIVE_ESTIMATOR_VERSION, {
    name,
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
    sourceEventIds: ["ev:b", "ev:a"],
  });
}

/** 模拟从 raw 文件反序列化出的记录（plain data）。 */
function asRaw(record: ReplayableRecord): ReplayableRecord {
  return JSON.parse(JSON.stringify(record)) as ReplayableRecord;
}

/** 构造最小 schema-2 RawRunData fixture（CLI/manifest 一致性测试用）。 */
function makeRawData(
  history: Array<{ round: number; agentId: string; record: ReplayableRecord }>,
  schemaVersion = "2.0",
): Record<string, unknown> {
  return { runId: "fixture_run", rawSchemaVersion: schemaVersion, governanceEstimateHistory: history };
}

function makeLegacyRecord(): ReplayableRecord {
  const legacy = asRaw(projectFixture());
  delete (legacy as Partial<ReplayableRecord>).input;
  return legacy;
}

/** A valid auditable-but-exploratory study declaration for CC-2 plumbing tests. */
function validStudyContract(): GovernanceStudyContract {
  return {
    id: "swarmalpha.study.cc2-plumbing-test",
    version: "1.0.0",
    governanceArchitecture: "auditable_epistemic_v1",
    inferenceIntent: "exploratory",
    taskFamilyRef: { id: "swarmalpha.task.distributed-categorical", version: "1.0.0" },
    evaluationContractRef: { id: "swarmalpha.eval.proper-score", version: "1.0.0" },
    artifactSchemaRef: { id: "swarmalpha.raw-run", version: "4.0.0" },
    governancePolicy: {
      id: "swarmalpha.policy.cc2-plumbing-test",
      version: "1.0.0",
      controlMode: "randomized_experiment",
      preregistrationRef: { id: "swarmalpha.prereg.cc2-plumbing-test", version: "1.0.0" },
      eligibilityRuleRefs: [{ id: "swarmalpha.rule.cc2-plumbing-test", version: "1.0.0" }],
      maxActionsPerDecision: 1,
      arbitration: "priority_then_stable_id",
      assignmentDesign: {
        designRef: { id: "swarmalpha.assignment.cc2-plumbing-test", version: "1.0.0" },
        seedNamespace: "test:cc2-plumbing",
        allocations: [{
          actionRef: { id: "swarmalpha.action.cc2-plumbing-test", version: "1.0.0" },
          unit: "eligible_event",
          arms: [
            { id: "apply", probability: 0.5 },
            { id: "holdout", probability: 0.5 },
          ],
        }],
      },
      onlineAdaptation: "forbidden",
    },
    eligibleEventEstimand: "exploratory_only",
  };
}

describe("verifyGovernanceEstimateRecord (replay library)", () => {
  let record: ReplayableRecord;

  beforeEach(() => {
    record = projectFixture();
  });

  it("round-trips a valid record and returns verified", () => {
    const result = verifyGovernanceEstimateRecord(asRaw(record), defaultProgressiveEstimatorRegistry);
    expect(result.status).toBe("verified");
    expect(result.mismatches).toEqual([]);
    expect(result.estimatorId).toBe(PROGRESSIVE_ESTIMATOR_ID);
    expect(result.estimatorVersion).toBe(PROGRESSIVE_ESTIMATOR_VERSION);
  });

  it("detects an altered input with a stale fingerprint", () => {
    const tampered = asRaw(record);
    tampered.input.agentRole = "expert"; // 合法输入但非原实验输入
    const result = verifyGovernanceEstimateRecord(tampered, defaultProgressiveEstimatorRegistry);
    expect(result.status).toBe("mismatch");
    expect(result.mismatches).toContain("input_fingerprint");
  });

  it("detects an altered config with a stale fingerprint", () => {
    const tampered = asRaw(record);
    tampered.config.defaultRoleInertia = 0.9;
    const result = verifyGovernanceEstimateRecord(tampered, defaultProgressiveEstimatorRegistry);
    expect(result.status).toBe("mismatch");
    expect(result.mismatches).toContain("config_fingerprint");
  });

  it("detects an altered output value even when the fingerprint is unchanged", () => {
    const tampered = asRaw(record);
    tampered.value.inertia.estimate = 0.123;
    const result = verifyGovernanceEstimateRecord(tampered, defaultProgressiveEstimatorRegistry);
    expect(result.status).toBe("mismatch");
    // 存储 fingerprint 未改，重算指纹与之一致；但重算值与篡改值不一致 → output_value。
    expect(result.mismatches).toContain("output_value");
    expect(result.mismatches).not.toContain("output_fingerprint");
  });

  it("detects an altered output fingerprint even when the value is unchanged", () => {
    const tampered = asRaw(record);
    tampered.outputFingerprint = `sha256:${"a".repeat(64)}`;
    const result = verifyGovernanceEstimateRecord(tampered, defaultProgressiveEstimatorRegistry);
    expect(result.status).toBe("mismatch");
    expect(result.mismatches).toContain("output_fingerprint");
    expect(result.mismatches).not.toContain("output_value");
  });

  it("rejects a record whose layer is not governance_estimate", () => {
    const tampered = asRaw(record) as unknown as Record<string, unknown>;
    tampered.layer = "behavioral_telemetry";
    const result = verifyGovernanceEstimateRecord(tampered, defaultProgressiveEstimatorRegistry);
    expect(result.status).toBe("invalid_record");
  });

  it("detects non-canonical (duplicated/unsorted) stored source event ids", () => {
    const tampered = asRaw(record);
    tampered.sourceEventIds = ["ev:a", "ev:b", "ev:a"]; // 重复，非 project 的 canonical 形式
    const result = verifyGovernanceEstimateRecord(tampered, defaultProgressiveEstimatorRegistry);
    expect(result.status).toBe("mismatch");
    expect(result.mismatches).toContain("source_event_ids");
  });

  it("accepts stored source ids already in canonical sorted-unique form", () => {
    const tampered = asRaw(record);
    tampered.sourceEventIds = ["ev:a", "ev:b"]; // 已排序去重（与 project 输出一致）
    const result = verifyGovernanceEstimateRecord(tampered, defaultProgressiveEstimatorRegistry);
    expect(result.status).toBe("verified");
  });

  it("returns legacy_unverifiable when the input snapshot is missing", () => {
    const result = verifyGovernanceEstimateRecord(makeLegacyRecord(), defaultProgressiveEstimatorRegistry);
    expect(result.status).toBe("legacy_unverifiable");
    expect(result.mismatches).toEqual([]);
  });

  it("returns unsupported_estimator for an unknown exact version", () => {
    const tampered = asRaw(record);
    tampered.estimatorVersion = "9.9.9";
    const result = verifyGovernanceEstimateRecord(tampered, defaultProgressiveEstimatorRegistry);
    expect(result.status).toBe("unsupported_estimator");
  });

  it("returns invalid_record for a malformed record instead of throwing", () => {
    expect(verifyGovernanceEstimateRecord(null, defaultProgressiveEstimatorRegistry).status)
      .toBe("invalid_record");
    expect(verifyGovernanceEstimateRecord({ estimatorId: 7 }, defaultProgressiveEstimatorRegistry).status)
      .toBe("invalid_record");
    const bad = asRaw(record);
    delete (bad as Partial<ReplayableRecord>).sourceEventIds;
    expect(verifyGovernanceEstimateRecord(bad, defaultProgressiveEstimatorRegistry).status)
      .toBe("invalid_record");
  });

  it("does not throw on accessor-backed or Proxy records", () => {
    const accessor = Object.defineProperty({}, "layer", {
      enumerable: true,
      get() { throw new Error("accessor boom"); },
    });
    expect(() => verifyGovernanceEstimateRecord(accessor, defaultProgressiveEstimatorRegistry)).not.toThrow();

    const proxy = new Proxy({}, { get() { throw new Error("proxy boom"); } });
    expect(() => verifyGovernanceEstimateRecord(proxy, defaultProgressiveEstimatorRegistry)).not.toThrow();
  });

  it("is stable across repeated deterministic projections", () => {
    const first = projectFixture();
    const second = projectFixture();
    expect(first.outputFingerprint).toBe(second.outputFingerprint);
    expect(first.determinism).toEqual(second.determinism);
    expect(canonicalizeEstimatorValue(first.value)).toBe(canonicalizeEstimatorValue(second.value));
  });

  it("returns mutation-isolated input/config/value clones", () => {
    const first = projectFixture();
    first.input.agentRole = "expert";
    first.config.defaultRoleInertia = 0.9;
    first.value.inertia.estimate = 0.05;

    const second = projectFixture();
    expect(second.input.agentRole).toBe("analyst");
    expect(second.config.defaultRoleInertia).toBe(0.4);
    expect(second.value.inertia.estimate).not.toBe(0.05);
    expect(second.inputFingerprint).toBe(projectFixture().inputFingerprint);
  });
});

describe("verifyRawRunData (run-level verifier)", () => {
  it("keeps record counts self-consistent: recordCount === Σ counts", () => {
    const ok = verifyRawRunData("ok.json", makeRawData([
      { round: 1, agentId: "a", record: asRaw(projectFixture()) },
      { round: 2, agentId: "b", record: asRaw(projectFixture()) },
    ]));
    const sum = Object.values(ok.counts).reduce((s, v) => s + v, 0);
    expect(ok.recordCount).toBe(2);
    expect(sum).toBe(ok.recordCount);
    expect(ok.counts.verified).toBe(2);
  });

  it("flags duplicate (round, agentId) pairs as a run issue without corrupting counts", () => {
    const result = verifyRawRunData("dup.json", makeRawData([
      { round: 1, agentId: "a", record: asRaw(projectFixture()) },
      { round: 1, agentId: "a", record: asRaw(projectFixture()) },
    ]));
    expect(result.runIssues.some(i => i.code === "duplicate_entry")).toBe(true);
    expect(result.recordCount).toBe(2);
    expect(result.counts.verified).toBe(2);
    expect(result.counts.invalid_record).toBe(0);
  });

  it("rejects an invalid round and an invalid agentId as run issues", () => {
    const result = verifyRawRunData("id.json", {
      rawSchemaVersion: "2.0",
      governanceEstimateHistory: [
        { round: -1, agentId: "a", record: asRaw(projectFixture()) },
        { round: 1, agentId: "", record: asRaw(projectFixture()) },
        { round: 1.5, agentId: "c", record: asRaw(projectFixture()) },
      ],
    });
    expect(result.runIssues.filter(i => i.code === "invalid_round")).toHaveLength(2);
    expect(result.runIssues.filter(i => i.code === "invalid_agent_id")).toHaveLength(1);
    // 记录级仍各自 verified：身份问题不计入记录级 counts。
    expect(result.counts.verified).toBe(3);
  });

  it("flags a progressive record name that does not match the outer identity", () => {
    const tampered = asRaw(projectFixture());
    (tampered as unknown as { name: string }).name = "evil:wrong:name";
    const result = verifyRawRunData("name.json", makeRawData([
      { round: 1, agentId: "a", record: tampered },
    ]));
    expect(result.runIssues.some(i => i.code === "name_mismatch")).toBe(true);
    // 记录本身仍可重放（name 不参与指纹），但 provenance 不一致被标记。
    expect(result.counts.verified).toBe(1);
  });

  it("flags a record whose input.round has been re-attributed to another round", () => {
    const tampered = asRaw(projectFixture());
    (tampered.input as ProgressiveEstimatorInput).round = 7; // 外层仍是 round 1
    const result = verifyRawRunData("reattrib-round.json", makeRawData([
      { round: 1, agentId: "a", record: tampered },
    ]));
    // 记录级 input_fingerprint mismatch（round 受指纹保护）+ run-level 归属校验。
    expect(result.runIssues.some(i => i.code === "input_round_mismatch")).toBe(true);
    expect(result.counts.mismatch).toBe(1);
  });

  it("flags a record whose input.agentId has been re-attributed to another agent", () => {
    const tampered = asRaw(projectFixture());
    (tampered.input as ProgressiveEstimatorInput).agentId = "b"; // 外层仍是 a
    const result = verifyRawRunData("reattrib-agent.json", makeRawData([
      { round: 1, agentId: "a", record: tampered },
    ]));
    // agentId 受 inputFingerprint 保护（记录级）+ 归属校验（run-level）。
    expect(result.runIssues.some(i => i.code === "agent_id_mismatch")).toBe(true);
    expect(result.counts.mismatch).toBe(1);
  });

  it("flags a round that exceeds the run totalRounds", () => {
    const result = verifyRawRunData("bounds.json", {
      rawSchemaVersion: "2.0",
      totalRounds: 3,
      governanceEstimateHistory: [{ round: 5, agentId: "a", record: asRaw(projectFixture()) }],
    });
    expect(result.runIssues.some(i => i.code === "round_out_of_range")).toBe(true);
  });

  it("does not apply the progressive_icl name rule to non-progressive estimators", () => {
    const custom = asRaw(projectFixture());
    (custom as unknown as { estimatorId: string }).estimatorId = "other.estimator";
    (custom as unknown as { name: string }).name = "arbitrary:name";
    const result = verifyRawRunData("custom.json", makeRawData([
      { round: 1, agentId: "a", record: custom },
    ]));
    expect(result.runIssues.some(i => i.code === "name_mismatch")).toBe(false);
  });

  it("keeps schema-1 records parseable but marks them legacy_unverifiable", () => {
    const result = verifyRawRunData("legacy.json", makeRawData([
      { round: 1, agentId: "a", record: makeLegacyRecord() },
    ], "1.0"));
    expect(result.schemaVersion).toBe("1.0");
    expect(result.counts.legacy_unverifiable).toBe(1);
    expect(result.counts.verified).toBe(0);
  });

  it("flags mixed estimator versions inside one schema-2 run as a run issue", () => {
    const second = asRaw(projectFixture());
    second.estimatorVersion = "2.0.0";
    const result = verifyRawRunData("mixed.json", makeRawData([
      { round: 1, agentId: "a", record: asRaw(projectFixture()) },
      { round: 2, agentId: "a", record: second },
    ]));
    expect(result.runIssues.some(i => i.code === "mixed_estimator")).toBe(true);
    expect(result.recordCount).toBe(2);
    expect(result.counts.verified).toBe(1);
    expect(result.counts.unsupported_estimator).toBe(1);
  });

  it("schema-3 retains schema-2 estimator replay invariants", () => {
    const second = asRaw(projectFixture());
    second.estimatorVersion = "2.0.0";
    const result = verifyRawRunData("mixed-v3.json", makeRawData([
      { round: 1, agentId: "a", record: asRaw(projectFixture()) },
      { round: 2, agentId: "a", record: second },
    ], "3.0"));
    expect(result.runIssues.some(i => i.code === "mixed_estimator")).toBe(true);
  });

  it("returns an absent-style result for data with no history", () => {
    const result = verifyRawRunData("none.json", { runId: "x" });
    expect(result.recordCount).toBe(0);
    expect(Object.values(result.counts).reduce((s, v) => s + v, 0)).toBe(0);
  });

  it("never throws on malformed or hostile inputs", () => {
    expect(() => verifyRawRunData("null.json", null)).not.toThrow();
    expect(() => verifyRawRunData("scalar.json", 42)).not.toThrow();
    const hostile = new Proxy({}, { get() { throw new Error("hostile"); } });
    expect(() => verifyRawRunData("hostile.json", hostile)).not.toThrow();
  });

  it("aggregates counts and run issues across files", () => {
    const legacyResult = verifyRawRunData("a.json", makeRawData([
      { round: 1, agentId: "a", record: makeLegacyRecord() },
    ], "1.0"));
    const verifiedResult = verifyRawRunData("b.json", makeRawData([
      { round: 1, agentId: "a", record: asRaw(projectFixture()) },
    ]));
    const dupResult = verifyRawRunData("c.json", makeRawData([
      { round: 1, agentId: "a", record: asRaw(projectFixture()) },
      { round: 1, agentId: "a", record: asRaw(projectFixture()) },
    ]));
    const summary = aggregateReplayResults([legacyResult, verifiedResult, dupResult]);
    expect(summary.totals.legacy_unverifiable).toBe(1);
    expect(summary.totals.verified).toBe(3);
    expect(summary.totalFiles).toBe(3);
    expect(summary.totalRecords).toBe(4);
    expect(summary.totalRunIssues).toBe(1);
  });
});

describe("verify_replay traversal", () => {
  it("collects JSON files recursively, excludes derived files, and sorts by code point", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-scan-"));
    try {
      fs.mkdirSync(path.join(dir, "sub"));
      fs.writeFileSync(path.join(dir, "Run1.json"), "{}");
      fs.writeFileSync(path.join(dir, "run2.json"), "{}");
      fs.writeFileSync(path.join(dir, "raw_summary.json"), "{}");
      fs.writeFileSync(path.join(dir, "err.error.json"), "{}");
      fs.writeFileSync(path.join(dir, "run.assignment.json"), "{}");
      fs.writeFileSync(path.join(dir, "sub", "z.json"), "{}");
      fs.writeFileSync(path.join(dir, "sub", "a.json"), "{}");

      const files = collectJsonFiles(dir);
      const relative = files.map(f => path.relative(dir, f).replace(/\\/g, "/"));
      expect(relative).toEqual(["Run1.json", "run2.json", "sub/a.json", "sub/z.json"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts a single file target and excludes derived single files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-single-"));
    try {
      const file = path.join(dir, "one.json");
      const derived = path.join(dir, "raw_summary.json");
      fs.writeFileSync(file, "{}");
      fs.writeFileSync(derived, "{}");
      expect(collectJsonFiles(file)).toEqual([file]);
      expect(collectJsonFiles(derived)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("manifest/CLI replay status consistency", () => {
  it("derives manifest statuses from the shared run-level verifier", () => {
    const ok = verifyRawRunData("ok.json", makeRawData([
      { round: 1, agentId: "a", record: asRaw(projectFixture()) },
    ]));
    expect(deriveReplayStatus(ok)).toBe("verified");

    const legacy = verifyRawRunData("legacy.json", makeRawData([
      { round: 1, agentId: "a", record: makeLegacyRecord() },
    ], "1.0"));
    expect(deriveReplayStatus(legacy)).toBe("legacy_unverifiable");

    const dup = verifyRawRunData("dup.json", makeRawData([
      { round: 1, agentId: "a", record: asRaw(projectFixture()) },
      { round: 1, agentId: "a", record: asRaw(projectFixture()) },
    ]));
    expect(deriveReplayStatus(dup)).toBe("mixed");

    const absent = verifyRawRunData("absent.json", { runId: "x" });
    expect(deriveReplayStatus(absent)).toBe("absent");
  });

  it("generate_manifest reuses the shared verifier and derivation (no weaker duplicate)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "experiments/campaign/generate_manifest.ts"),
      "utf8",
    );
    expect(src).toContain("verifyRawRunData");
    expect(src).toContain("deriveReplayStatus");
    expect(src).not.toMatch(/verifyGovernanceEstimateRecord\s*\(/);
  });
});

describe("Runner current-schema write paths", () => {
  it("emits rawSchemaVersion 4.0 on the swarmalpha protocol path", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-run-"));
    try {
      const config: ExperimentConfig = {
        id: "t_replay_run",
        hypothesis: "H",
        title: "T",
        scenario: "ma",
        runtimeModes: ["belief"],
        governanceMode: "none",
        agentCount: 2,
        maxRounds: 1,
        runsPerSeed: 1,
        seeds: [7],
        llmModel: "deepseek-chat",
        temperature: 0.7,
        isMain: false,
        description: "replay test",
      };
      await runSingle(config, "belief", 7, 0, outDir);
      const written = JSON.parse(
        fs.readFileSync(path.join(outDir, "t_replay_run_belief_seed7_run0.json"), "utf8"),
      );
      expect(written.rawSchemaVersion).toBe("4.0");
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("emits rawSchemaVersion 4.0 on the hiddenbench protocol path", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-hb-"));
    try {
      const config: ExperimentConfig = {
        id: "t_replay_hb",
        hypothesis: "H",
        title: "T",
        scenario: "ma",
        runtimeModes: ["native_cognitive"],
        governanceMode: "none",
        agentCount: 2,
        maxRounds: 1,
        runsPerSeed: 1,
        seeds: [7],
        llmModel: "deepseek-chat",
        temperature: 0.7,
        isMain: false,
        description: "replay hiddenbench test",
        protocol: "hiddenbench",
      };
      await runSingle(config, "native_cognitive", 7, 0, outDir);
      const written = JSON.parse(
        fs.readFileSync(path.join(outDir, "t_replay_hb_native_cognitive_seed7_run0.json"), "utf8"),
      );
      expect(written.rawSchemaVersion).toBe("4.0");
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("defines the shared schema constant as 4.0", () => {
    expect(RAW_SCHEMA_VERSION).toBe("4.0");
  });
});

describe("CC-2 governance study contract plumbing", () => {
  const badDeclaration = {
    id: "swarmalpha.study.bad",
    version: "not-semver",
  } as unknown as GovernanceStudyContract;

  it("emits malformed_governance_study_contract for a malformed declaration", () => {
    const result = verifyRawRunData("bad-study.json", {
      runId: "x",
      rawSchemaVersion: "4.0",
      governanceStudy: badDeclaration,
    });
    expect(result.runIssues.some(i => i.code === "malformed_governance_study_contract")).toBe(true);
  });

  it("treats an explicit null declaration as malformed rather than absent", () => {
    const result = verifyRawRunData("null-study.json", {
      runId: "x",
      rawSchemaVersion: "4.0",
      governanceStudy: null,
    });
    expect(result.runIssues.some(i => i.code === "malformed_governance_study_contract")).toBe(true);
  });

  it("accepts a valid declaration without a run issue", () => {
    const result = verifyRawRunData("ok-study.json", {
      runId: "x",
      rawSchemaVersion: "4.0",
      governanceStudy: validStudyContract(),
    });
    expect(result.runIssues.filter(i => i.code === "malformed_governance_study_contract")).toHaveLength(0);
  });

  it("keeps a schema-4.0 artifact without a declaration readable and undeclared", () => {
    const result = verifyRawRunData("undeclared.json", { runId: "x", rawSchemaVersion: "4.0" });
    expect(result.schemaVersion).toBe("4.0");
    // No structural error and no confirmatory inference from explicit absence.
    expect(result.runIssues.filter(i => i.code === "malformed_governance_study_contract")).toHaveLength(0);
    expect(result.runIssues.filter(i => /confirmatory|governance_study/i.test(i.code))).toHaveLength(0);
  });

  it("rejects a malformed declaration before any mock LLM call on the standard path", async () => {
    hoisted.FakeDiscussionEngine.runCallCount = 0;
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-study-bad-"));
    try {
      const config: ExperimentConfig = {
        id: "t_study_bad",
        hypothesis: "H",
        title: "T",
        scenario: "ma",
        runtimeModes: ["belief"],
        governanceMode: "none",
        agentCount: 2,
        maxRounds: 1,
        runsPerSeed: 1,
        seeds: [7],
        llmModel: "deepseek-chat",
        temperature: 0.7,
        isMain: false,
        description: "malformed study",
        governanceStudy: badDeclaration,
      };
      await expect(runSingle(config, "belief", 7, 0, outDir)).rejects.toThrow("governanceStudy.version");
      expect(hoisted.FakeDiscussionEngine.runCallCount).toBe(0);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("rejects a malformed declaration before the mock hiddenbench protocol is called", async () => {
    hoisted.hbCallCount = 0;
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-study-hb-bad-"));
    try {
      const config: ExperimentConfig = {
        id: "t_study_hb_bad",
        hypothesis: "H",
        title: "T",
        scenario: "ma",
        runtimeModes: ["native_cognitive"],
        governanceMode: "none",
        agentCount: 2,
        maxRounds: 1,
        runsPerSeed: 1,
        seeds: [7],
        llmModel: "deepseek-chat",
        temperature: 0.7,
        isMain: false,
        description: "malformed study hiddenbench",
        protocol: "hiddenbench",
        governanceStudy: badDeclaration,
      };
      await expect(runSingle(config, "native_cognitive", 7, 0, outDir)).rejects.toThrow("governanceStudy.version");
      expect(hoisted.hbCallCount).toBe(0);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("rejects an explicit malformed confirmatory study before any mock LLM on the standard path", async () => {
    hoisted.FakeDiscussionEngine.runCallCount = 0;
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-confirm-bad-"));
    const malformedConfirmatory: GovernanceStudyContract = {
      ...validStudyContract(),
      inferenceIntent: "confirmatory",
      preregistrationRef: { id: "swarmalpha.prereg.cc2-plumbing-test", version: "1.0.0" },
      frozenAt: "2026-08-09T00:00:00.000Z",
      primaryAssignmentUnit: "run",
      // primaryAssignmentDesign deliberately omitted: confirmatory requires it.
    };
    try {
      const config: ExperimentConfig = {
        id: "t_confirm_bad",
        hypothesis: "H",
        title: "T",
        scenario: "ma",
        runtimeModes: ["belief"],
        governanceMode: "none",
        agentCount: 2,
        maxRounds: 1,
        runsPerSeed: 1,
        seeds: [7],
        llmModel: "deepseek-chat",
        temperature: 0.7,
        isMain: false,
        description: "malformed confirmatory study",
        governanceStudy: malformedConfirmatory,
      };
      await expect(runSingle(config, "belief", 7, 0, outDir))
        .rejects.toThrow("frozen Stage-1 assignment design");
      expect(hoisted.FakeDiscussionEngine.runCallCount).toBe(0);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("rejects an explicit malformed confirmatory study before the mock hiddenbench protocol", async () => {
    hoisted.hbCallCount = 0;
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-confirm-hb-bad-"));
    const malformedConfirmatory: GovernanceStudyContract = {
      ...validStudyContract(),
      inferenceIntent: "confirmatory",
      preregistrationRef: { id: "swarmalpha.prereg.cc2-plumbing-test", version: "1.0.0" },
      frozenAt: "2026-08-09T00:00:00.000Z",
      primaryAssignmentUnit: "run",
      // primaryAssignmentDesign deliberately omitted: confirmatory requires it.
    };
    try {
      const config: ExperimentConfig = {
        id: "t_confirm_hb_bad",
        hypothesis: "H",
        title: "T",
        scenario: "ma",
        runtimeModes: ["native_cognitive"],
        governanceMode: "none",
        agentCount: 2,
        maxRounds: 1,
        runsPerSeed: 1,
        seeds: [7],
        llmModel: "deepseek-chat",
        temperature: 0.7,
        isMain: false,
        description: "malformed confirmatory study hiddenbench",
        protocol: "hiddenbench",
        governanceStudy: malformedConfirmatory,
      };
      await expect(runSingle(config, "native_cognitive", 7, 0, outDir))
        .rejects.toThrow("frozen Stage-1 assignment design");
      expect(hoisted.hbCallCount).toBe(0);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("round-trips the validated declaration into raw data on the standard path", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-study-ok-"));
    try {
      const contract = validStudyContract();
      const config: ExperimentConfig = {
        id: "t_study_ok",
        hypothesis: "H",
        title: "T",
        scenario: "ma",
        runtimeModes: ["belief"],
        governanceMode: "none",
        agentCount: 2,
        maxRounds: 1,
        runsPerSeed: 1,
        seeds: [7],
        llmModel: "deepseek-chat",
        temperature: 0.7,
        isMain: false,
        description: "study round-trip",
        governanceStudy: contract,
      };
      await runSingle(config, "belief", 7, 0, outDir);
      const written = JSON.parse(
        fs.readFileSync(path.join(outDir, "t_study_ok_belief_seed7_run0.json"), "utf8"),
      );
      expect(written.governanceStudy).toEqual(contract);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("round-trips the validated declaration into raw data on the hiddenbench path", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-study-hb-ok-"));
    try {
      const contract = validStudyContract();
      const config: ExperimentConfig = {
        id: "t_study_hb_ok",
        hypothesis: "H",
        title: "T",
        scenario: "ma",
        runtimeModes: ["native_cognitive"],
        governanceMode: "none",
        agentCount: 2,
        maxRounds: 1,
        runsPerSeed: 1,
        seeds: [7],
        llmModel: "deepseek-chat",
        temperature: 0.7,
        isMain: false,
        description: "study round-trip hiddenbench",
        protocol: "hiddenbench",
        governanceStudy: contract,
      };
      await runSingle(config, "native_cognitive", 7, 0, outDir);
      const written = JSON.parse(
        fs.readFileSync(path.join(outDir, "t_study_hb_ok_native_cognitive_seed7_run0.json"), "utf8"),
      );
      expect(written.governanceStudy).toEqual(contract);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("verify_replay CLI exit codes (subprocess)", () => {
  const ROOT = process.cwd();

  function runCli(target: string, flags: string[] = []): { status: number; stdout: string } {
    const flagArgs = flags.length > 0 ? ` ${flags.join(" ")}` : "";
    try {
      const stdout = execSync(
        `npx --no-install tsx experiments/campaign/verify_replay.ts "${target}"${flagArgs}`,
        { cwd: ROOT, encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] },
      );
      return { status: 0, stdout };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return { status: e.status ?? 1, stdout: `${e.stdout ?? ""}${e.stderr ?? ""}` };
    }
  }

  it("exits non-zero and reports absent for a file with zero records", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-cli-absent-"));
    try {
      const file = path.join(dir, "empty.json");
      fs.writeFileSync(file, JSON.stringify({ runId: "empty", rawSchemaVersion: "2.0" }));
      const { status, stdout } = runCli(file);
      expect(status).not.toBe(0);
      expect(stdout).toMatch(/absent/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it("exits 0 for a verified fixture and non-zero after an output value tamper", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-cli-ok-"));
    try {
      const file = path.join(dir, "ok.json");
      const data = makeRawData([
        { round: 1, agentId: "a", record: asRaw(projectFixture()) },
      ]);
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      expect(runCli(file).status).toBe(0);

      (data.governanceEstimateHistory as Array<{ record: ReplayableRecord }>)[0]
        .record.value.inertia.estimate = 0.42; // 改值不改指纹（≠ 原始 0.5）
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      const tampered = runCli(file);
      expect(tampered.status).not.toBe(0);
      expect(tampered.stdout).toMatch(/output_value|output_fingerprint/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it("exits non-zero for a name/identity mismatch and zero with --allow-legacy-unverifiable only for legacy", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-cli-name-"));
    try {
      const file = path.join(dir, "name.json");
      const tampered = asRaw(projectFixture());
      (tampered as unknown as { name: string }).name = "evil:wrong:name";
      fs.writeFileSync(file, JSON.stringify(makeRawData([
        { round: 1, agentId: "a", record: tampered },
      ]), null, 2));
      const { status, stdout } = runCli(file);
      expect(status).not.toBe(0);
      expect(stdout).toMatch(/name_mismatch/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it("accepts absent with --allow-absent and prints the explicit warning", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-cli-absent-ok-"));
    try {
      const file = path.join(dir, "empty.json");
      fs.writeFileSync(file, JSON.stringify({ runId: "empty", rawSchemaVersion: "2.0" }));
      const { status, stdout } = runCli(file, ["--allow-absent"]);
      expect(status).toBe(0);
      expect(stdout).toMatch(/accepted by --allow-absent/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it("still fails an empty directory even with --allow-absent", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-cli-empty-dir-"));
    try {
      const { status } = runCli(dir, ["--allow-absent"]);
      expect(status).not.toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it("still fails invalid JSON even with --allow-absent", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-cli-bad-json-"));
    try {
      const file = path.join(dir, "bad.json");
      fs.writeFileSync(file, "this is not json");
      const { status, stdout } = runCli(file, ["--allow-absent"]);
      expect(status).not.toBe(0);
      expect(stdout).toMatch(/invalid_json|not parseable/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it("still fails a mismatch even with --allow-absent", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-cli-mismatch-absent-"));
    try {
      const file = path.join(dir, "tampered.json");
      const tampered = asRaw(projectFixture());
      tampered.value.inertia.estimate = 0.42;
      fs.writeFileSync(file, JSON.stringify(makeRawData([
        { round: 1, agentId: "a", record: tampered },
      ]), null, 2));
      expect(runCli(file, ["--allow-absent"]).status).not.toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it("does not let --allow-absent release legacy_unverifiable records", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-cli-legacy-absent-"));
    try {
      const file = path.join(dir, "legacy.json");
      fs.writeFileSync(file, JSON.stringify(makeRawData([
        { round: 1, agentId: "a", record: makeLegacyRecord() },
      ], "1.0"), null, 2));
      // 仅 --allow-absent：legacy 记录使 recordCount > 0，不放行。
      expect(runCli(file, ["--allow-absent"]).status).not.toBe(0);
      // 组合 --allow-legacy-unverifiable：各自放行各自状态 → exit 0。
      expect(runCli(file, ["--allow-absent", "--allow-legacy-unverifiable"]).status).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it("keeps the two flags independent when combined on an absent file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-cli-flags-"));
    try {
      const file = path.join(dir, "empty.json");
      fs.writeFileSync(file, JSON.stringify({ runId: "empty" }));
      const { status, stdout } = runCli(file, ["--allow-absent", "--allow-legacy-unverifiable"]);
      expect(status).toBe(0);
      expect(stdout).toMatch(/accepted by --allow-absent/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});

describe("replay result on a registry that is not the default", () => {
  it("verifies against a caller-supplied registry snapshot", () => {
    const registry = new GovernanceEstimatorRegistry([progressiveEstimatorContract]).seal();
    const result = verifyGovernanceEstimateRecord(asRaw(projectFixture()), registry);
    expect(result.status).toBe("verified");
  });
});

describe("replayVerifier module contract", () => {
  it("has no main entry, no process.exit, and no top-level file reads", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "experiments/campaign/replayVerifier.ts"),
      "utf8",
    );
    // 只匹配实际调用（`process.exit(`），避免命中注释里的文档字符串。
    expect(src).not.toMatch(/process\.exit\s*\(/);
    expect(src).not.toMatch(/function\s+main\s*\(/);
    expect(src).not.toMatch(/readFileSync|writeFileSync|readdirSync|statSync/);
  });

  it("is importable without triggering CLI side effects", () => {
    // 顶层 import 已在本测试文件执行且未触发 process.exit；此处确认导出可用。
    expect(typeof verifyRawRunData).toBe("function");
    expect(typeof deriveReplayStatus).toBe("function");
  });
});

describe("WP2 treatment lifecycle verification", () => {
  const assignment = createRunAssignment({
    id: "asn:r1",
    unitId: "r1",
    stratum: { taskId: "t", model: "m", seed: 1, runIndex: 0 },
    arm: "diagnostic_governance",
    policyId: "swarmalpha.diagnostic",
    policyVersion: "1.0.0",
    masterSeed: 42,
    assignedAt: "2026-08-09T00:00:00Z",
  });

  const defaultOutcome = {
    runAssignmentId: "asn:r1",
    evaluationContractRef: { id: "swarmalpha.categorical.ranking", version: "1.0.0" },
    quality: 0.8,
    cost: { totalTokens: 100 },
    status: "scored",
  };

  function appliedReceipt(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: "rcpt:1",
      assignmentId: "asn:r1",
      actionType: "force_reflection",
      interventionId: "intv:1",
      status: "applied",
      appliedAtRound: 2,
      plannedWindow: { startRound: 2, endRound: 5 },
      windowContractRef: { id: "test.window", version: "1" },
      effectiveWindow: { startRound: 2, endRound: 5 },
      targetAgentIds: ["a1"],
      sourceEventIds: [],
      ...over,
    };
  }

  function makeLifecycleRun(over: Record<string, unknown>): Record<string, unknown> {
    return {
      runId: "r1",
      rawSchemaVersion: "4.0",
      totalRounds: 5,
      treatmentAssignment: assignment,
      assignmentManifest: {
        path: "r1.assignment.json",
        sha256: "a".repeat(64),
        reused: false,
        assignmentId: "asn:r1",
      },
      interventions: [{ id: "intv:1", round: 2, type: "force_reflection", applied: true }],
      governanceIssues: [],
      applicationReceipts: [{
        id: "rcpt:no-action", assignmentId: "asn:r1", actionType: "no_action",
        status: "inapplicable", effectiveWindow: null, targetAgentIds: [], sourceEventIds: [],
      }],
      proximalOutcomes: [],
      taskOutcome: defaultOutcome,
      ...over,
    };
  }

  it("schema 4.0 without a treatment assignment fails closed", () => {
    const result = verifyRawRunData("x.json", makeLifecycleRun({ treatmentAssignment: undefined }));
    expect(result.runIssues.some(i => i.code === "missing_treatment_assignment")).toBe(true);
  });

  it("schema 4.0 requires explicit receipts, proximal array, task outcome, and manifest reference", () => {
    const result = verifyRawRunData("x.json", {
      runId: "r1",
      rawSchemaVersion: "4.0",
      totalRounds: 5,
      treatmentAssignment: assignment,
      applicationReceipts: "garbage",
    });
    expect(result.runIssues.some(i => i.code === "missing_application_receipts")).toBe(true);
    expect(result.runIssues.some(i => i.code === "missing_proximal_outcomes")).toBe(true);
    expect(result.runIssues.some(i => i.code === "missing_task_outcome")).toBe(true);
    expect(result.runIssues.some(i => i.code === "missing_assignment_manifest_ref")).toBe(true);
  });

  it("rejects malformed assignment probability provenance", () => {
    const malformed = structuredClone(assignment);
    malformed.assignmentProbability = 0.5;
    const result = verifyRawRunData("x.json", makeLifecycleRun({ treatmentAssignment: malformed }));
    expect(result.runIssues.some(i => i.code === "malformed_treatment_assignment")).toBe(true);
  });

  it("rejects a manifest reference linked to a different assignment", () => {
    const result = verifyRawRunData("x.json", makeLifecycleRun({
      assignmentManifest: {
        path: "r1.assignment.json",
        sha256: "a".repeat(64),
        reused: false,
        assignmentId: "asn:other",
      },
    }));
    expect(result.runIssues.some(i => i.code === "manifest_assignment_mismatch")).toBe(true);
  });

  it("flags a dangling assignmentId on an application receipt", () => {
    const result = verifyRawRunData("x.json", makeLifecycleRun({
      applicationReceipts: [appliedReceipt({ assignmentId: "asn:WRONG" })],
    }));
    expect(result.runIssues.some(i => i.code === "dangling_assignment_id")).toBe(true);
  });

  it("flags dangling intervention and governance-event links", () => {
    const result = verifyRawRunData("x.json", makeLifecycleRun({
      applicationReceipts: [appliedReceipt({
        interventionId: "intv:missing",
        sourceEventIds: ["issue:missing"],
      })],
    }));
    expect(result.runIssues.some(i => i.code === "dangling_intervention_id")).toBe(true);
    expect(result.runIssues.some(i => i.code === "dangling_source_event_id")).toBe(true);
  });

  it("requires exactly one proximal record for every applied receipt", () => {
    const result = verifyRawRunData("x.json", makeLifecycleRun({
      applicationReceipts: [appliedReceipt()],
      proximalOutcomes: [],
    }));
    expect(result.runIssues.some(i => i.code === "missing_proximal_outcome_for_applied_receipt")).toBe(true);
  });

  it("flags duplicate receipt ids", () => {
    const receipt = appliedReceipt();
    const result = verifyRawRunData("x.json", makeLifecycleRun({
      applicationReceipts: [receipt, { ...receipt }],
    }));
    expect(result.runIssues.some(i => i.code === "duplicate_receipt_id")).toBe(true);
  });

  it("flags an effectiveWindow that exceeds totalRounds", () => {
    const result = verifyRawRunData("x.json", makeLifecycleRun({
      applicationReceipts: [appliedReceipt({ effectiveWindow: { startRound: 2, endRound: 9 } })],
    }));
    expect(result.runIssues.some(i => i.code === "window_out_of_range")).toBe(true);
  });

  it("flags a proximal window that differs from its receipt contract", () => {
    const result = verifyRawRunData("x.json", makeLifecycleRun({
      applicationReceipts: [appliedReceipt()],
      proximalOutcomes: [{
        id: "prox:1",
        applicationReceiptId: "rcpt:1",
        window: { startRound: 3, endRound: 5 },
        metricContractRefs: [{ id: "test.metric", version: "1" }],
        values: { meanConfidence: 0.7 },
      }],
    }));
    expect(result.runIssues.some(i => i.code === "proximal_window_mismatch")).toBe(true);
  });

  it("flags a task outcome whose runAssignmentId does not match the assignment", () => {
    const result = verifyRawRunData("x.json", makeLifecycleRun({
      taskOutcome: {
        runAssignmentId: "asn:WRONG",
        evaluationContractRef: { id: "swarmalpha.categorical.ranking", version: "1.0.0" },
        quality: 0.8,
        cost: { totalTokens: 100 },
        status: "scored",
      },
    }));
    expect(result.runIssues.some(i => i.code === "task_outcome_assignment_mismatch")).toBe(true);
  });

  it("accepts a consistent schema-4.0 lifecycle chain", () => {
    const result = verifyRawRunData("x.json", makeLifecycleRun({
      applicationReceipts: [appliedReceipt()],
      proximalOutcomes: [{
        id: "prox:1",
        applicationReceiptId: "rcpt:1",
        window: { startRound: 2, endRound: 5 },
        metricContractRefs: [{ id: "test.metric", version: "1" }],
        values: { meanConfidence: 0.7 },
      }],
    }));
    expect(result.runIssues).toEqual([]);
  });
});
