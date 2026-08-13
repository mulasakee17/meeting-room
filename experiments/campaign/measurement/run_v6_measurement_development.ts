/**
 * Development-only V6 -> Measurement runner.
 *
 * Default `--plan` is pure and creates no artifacts. `--mock` is the only
 * execution mode and uses a deterministic local invoker. There is deliberately
 * no real-provider flag in this CLI.
 */

import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  SingleAttemptTextInvokeRequest,
  SingleAttemptTextInvoker,
} from "../v6/providerAdapters";
import {
  createV6MeasurementDevelopmentPlanV1,
  defaultV6MeasurementDevelopmentOutputDir,
  runV6MeasurementDevelopmentV1,
} from "./v6MeasurementDevelopment";

export interface V6MeasurementDevelopmentArgsV1 {
  mode: "plan" | "mock" | "replay";
  outputDir: string;
  expectedResultIndexContentHash?: string;
}

export function parseV6MeasurementDevelopmentArgsV1(
  argv: readonly string[],
): V6MeasurementDevelopmentArgsV1 {
  let mode: V6MeasurementDevelopmentArgsV1["mode"] = "plan";
  let outputDir = defaultV6MeasurementDevelopmentOutputDir();
  let expectedResultIndexContentHash: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--plan") mode = "plan";
    else if (arg === "--mock") mode = "mock";
    else if (arg === "--replay") {
      mode = "replay";
      expectedResultIndexContentHash = argv[++index];
      if (!/^sha256:[0-9a-f]{64}$/.test(expectedResultIndexContentHash ?? "")) {
        throw new Error("--replay requires a sha256 result-index content hash");
      }
    } else if (arg === "--output-dir") {
      const value = argv[++index];
      if (!value || value.trim().length === 0) throw new Error("--output-dir requires a path");
      outputDir = path.resolve(value);
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return { mode, outputDir, ...(expectedResultIndexContentHash ? { expectedResultIndexContentHash } : {}) };
}

export function createDeterministicMeasurementMockInvokerV1(): SingleAttemptTextInvoker {
  return {
    async invoke(request: Readonly<SingleAttemptTextInvokeRequest>) {
      const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
      if (request.requestId.startsWith("final:")) {
        return {
          rawContent: JSON.stringify({
            status: "answered",
            reports: [{
              claimId: "claim:v6-smoke-route-viable",
              value: { kind: "binary", probability: 0.4 },
            }],
          }),
          usage,
        };
      }
      return {
        rawContent: JSON.stringify({
          message: "Deterministic wiring-only public report.",
          belief: { kind: "binary", probability: 0.6 },
          evidence: [],
        }),
        usage,
      };
    },
  };
}

export async function main(argv: readonly string[]): Promise<number> {
  const args = parseV6MeasurementDevelopmentArgsV1(argv);
  const plan = createV6MeasurementDevelopmentPlanV1();
  if (args.mode === "plan") {
    console.log(JSON.stringify({
      purpose: plan.purpose,
      outputDir: args.outputDir,
      designContentHash: plan.design.contentHash,
      freezeContentHash: plan.freeze.contentHash,
      cells: plan.cells.map(cell => ({
        cellId: cell.cellId,
        runId: cell.runId,
        protocol: cell.protocol,
        plannedProviderCalls: cell.plannedProviderCalls,
        estimatedTokens: cell.estimatedTokens,
      })),
      maxProviderCalls: plan.maxProviderCalls,
      maxTotalTokens: plan.maxTotalTokens,
      claimsAuthorized: ["wiring", "internal replay", "exact retry"],
      claimsForbidden: ["measurement validity", "governance effect", "held-out evidence"],
    }, null, 2));
    return 0;
  }

  const invoker = args.mode === "mock"
    ? createDeterministicMeasurementMockInvokerV1()
    : {
        async invoke(): Promise<never> {
          throw new Error("provider boundary must be unreachable during exact replay");
        },
      } satisfies SingleAttemptTextInvoker;
  const result = await runV6MeasurementDevelopmentV1({
    outputDir: args.outputDir,
    invoker,
    plan,
    ...(args.expectedResultIndexContentHash
      ? { expectedExistingResultIndexContentHash: args.expectedResultIndexContentHash }
      : {}),
  });
  console.log(JSON.stringify({
    purpose: plan.purpose,
    reused: result.reused,
    executedCellCount: result.executedCellCount,
    providerCallCount: result.providerCallCount,
    providerTokenCount: result.providerTokenCount,
    resultIndexContentHash: result.resultIndex.contentHash,
  }, null, 2));
  return 0;
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    code => { process.exitCode = code; },
    error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
