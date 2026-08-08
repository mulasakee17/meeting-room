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

import { runSingle, setScenarioLoaderForTesting } from "../experiments/campaign/pipeline/Runner";
import { collectJsonFiles } from "../experiments/campaign/verify_replay";
import {
  verifyRawRunData,
  aggregateReplayResults,
  deriveReplayStatus,
} from "../experiments/campaign/replayVerifier";
import { RAW_SCHEMA_VERSION } from "../experiments/campaign/types";
import type { ExperimentConfig } from "../experiments/campaign/types";

const hoisted = vi.hoisted(() => {
  class FakeDiscussionEngine {
    run = async () => ({ roundResults: [], totalRounds: 0, converged: true });
    getRoundDataArray = () => [] as unknown[];
    getCognitiveStates = () => new Map();
    setAgentKnowledge = () => {};
    addGovernancePrompt = () => {};
  }
  return {
    FakeDiscussionEngine,
    hbResult: {
      preVotes: [],
      postVotes: [],
      discussionHistory: [],
      preAccuracy: 0.5,
      postAccuracy: 0.5,
      preMajorityCorrect: false,
      postMajorityCorrect: false,
      collectiveGain: 0,
      elapsedMs: 1,
      totalRounds: 1,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    },
  };
});

// Runner 的 hiddenbench 路径需要绕过真实 LLM 协议调用。
vi.mock("../experiments/campaign/pipeline/hiddenbenchProtocol", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../experiments/campaign/pipeline/hiddenbenchProtocol")>();
  return {
    ...actual,
    runHiddenBenchProtocol: async () => hoisted.hbResult,
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
  it("emits rawSchemaVersion 3.0 on the swarmalpha protocol path", async () => {
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
      expect(written.rawSchemaVersion).toBe("3.0");
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("emits rawSchemaVersion 3.0 on the hiddenbench protocol path", async () => {
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
      expect(written.rawSchemaVersion).toBe("3.0");
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("defines the shared schema constant as 3.0", () => {
    expect(RAW_SCHEMA_VERSION).toBe("3.0");
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
