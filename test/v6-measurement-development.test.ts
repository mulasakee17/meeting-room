/** Deterministic tests only: no network, credentials, or paid provider calls. */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveMeasurementValidityResultIndexV1Path } from "../experiments/campaign/measurement/measurementValidity";
import {
  createV6MeasurementDevelopmentPlanV1,
  runV6MeasurementDevelopmentV1,
  V6_MEASUREMENT_DEVELOPMENT_PURPOSE,
} from "../experiments/campaign/measurement/v6MeasurementDevelopment";
import {
  createDeterministicMeasurementMockInvokerV1,
  main,
  parseV6MeasurementDevelopmentArgsV1,
} from "../experiments/campaign/measurement/run_v6_measurement_development";
import type { SingleAttemptTextInvoker } from "../experiments/campaign/v6/providerAdapters";
import { resolveV6AuditableRawRunPath } from "../experiments/campaign/v6/productionVerticalSlice";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v6-measurement-dev-"));
  tempDirs.push(dir);
  return dir;
}

describe("V6 measurement development wiring", () => {
  it("freezes two exact-repeat explicit-belief cells and no scientific condition", () => {
    const first = createV6MeasurementDevelopmentPlanV1();
    const second = createV6MeasurementDevelopmentPlanV1();
    expect(second).toEqual(first);
    expect(first.purpose).toBe(V6_MEASUREMENT_DEVELOPMENT_PURPOSE);
    expect(first.design.measurementRole).toBe("measurement_development");
    expect(first.design.instrumentKind).toBe("in_process_explicit");
    expect(first.design.variants.map(variant => variant.condition)).toEqual(["exact_repeat", "exact_repeat"]);
    expect(first.cells.map(cell => cell.protocol)).toEqual(["explicit_belief_v1", "explicit_belief_v1"]);
    expect(first.maxProviderCalls).toBe(12);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("defaults to a pure plan with zero artifact creation", async () => {
    const parent = tmpDir();
    const outputDir = path.join(parent, "absent-output");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(parseV6MeasurementDevelopmentArgsV1([]).mode).toBe("plan");
    await expect(main(["--plan", "--output-dir", outputDir])).resolves.toBe(0);
    expect(fs.existsSync(outputDir)).toBe(false);
    expect(log).toHaveBeenCalledOnce();
    const printed = JSON.parse(String(log.mock.calls[0][0])) as Record<string, unknown>;
    expect(printed.purpose).toBe(V6_MEASUREMENT_DEVELOPMENT_PURPOSE);
    expect(printed.claimsForbidden).toEqual(["measurement validity", "governance effect", "held-out evidence"]);
  });

  it("executes the complete mock chain, independently replays sources, and accounts every call", async () => {
    const outputDir = tmpDir();
    const plan = createV6MeasurementDevelopmentPlanV1();
    const base = createDeterministicMeasurementMockInvokerV1();
    let calls = 0;
    const invoker: SingleAttemptTextInvoker = {
      async invoke(request, signal) {
        calls += 1;
        return base.invoke(request, signal);
      },
    };
    const result = await runV6MeasurementDevelopmentV1({ outputDir, invoker, plan });
    expect(result.reused).toBe(false);
    expect(result.executedCellCount).toBe(2);
    expect(result.providerCallCount).toBe(12);
    expect(result.providerTokenCount).toBe(120);
    expect(calls).toBe(12);
    expect(result.resultIndex.cells.map(cell => cell.status)).toEqual(["valid", "valid"]);
    for (const cell of plan.cells) {
      expect(fs.existsSync(resolveV6AuditableRawRunPath(outputDir, cell.runId))).toBe(true);
    }
  });

  it("exactly reuses a sealed result with zero provider reachability", async () => {
    const outputDir = tmpDir();
    const plan = createV6MeasurementDevelopmentPlanV1();
    const first = await runV6MeasurementDevelopmentV1({
      outputDir,
      invoker: createDeterministicMeasurementMockInvokerV1(),
      plan,
    });
    const forbidden = vi.fn(async () => { throw new Error("provider must not be called"); });
    const replay = await runV6MeasurementDevelopmentV1({
      outputDir,
      invoker: { invoke: forbidden },
      plan,
      expectedExistingResultIndexContentHash: first.resultIndex.contentHash,
    });
    expect(replay.reused).toBe(true);
    expect(replay.executedCellCount).toBe(0);
    expect(replay.providerCallCount).toBe(0);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("detects byte-level raw artifact drift during independent exact replay", async () => {
    const outputDir = tmpDir();
    const plan = createV6MeasurementDevelopmentPlanV1();
    const first = await runV6MeasurementDevelopmentV1({
      outputDir,
      invoker: createDeterministicMeasurementMockInvokerV1(),
      plan,
    });
    const rawPath = resolveV6AuditableRawRunPath(outputDir, plan.cells[0].runId);
    fs.appendFileSync(rawPath, "\n", "utf8");
    await expect(runV6MeasurementDevelopmentV1({
      outputDir,
      invoker: { invoke: async () => { throw new Error("unreachable"); } },
      plan,
      expectedExistingResultIndexContentHash: first.resultIndex.contentHash,
    })).rejects.toThrow(/source hashes do not match/);
  });

  it("refuses raw-run-only cross-process resume before any provider call", async () => {
    const outputDir = tmpDir();
    const plan = createV6MeasurementDevelopmentPlanV1();
    const first = await runV6MeasurementDevelopmentV1({
      outputDir,
      invoker: createDeterministicMeasurementMockInvokerV1(),
      plan,
    });
    const indexPath = resolveMeasurementValidityResultIndexV1Path(
      outputDir,
      plan.resultIndexRef,
      first.resultIndex.contentHash,
    );
    fs.rmSync(indexPath);
    const invoke = vi.fn(async () => { throw new Error("unreachable"); });
    await expect(runV6MeasurementDevelopmentV1({
      outputDir,
      invoker: { invoke },
      plan,
    })).rejects.toThrow(/cross_process_resume_forbidden/);
    expect(invoke).not.toHaveBeenCalled();
  });
});
