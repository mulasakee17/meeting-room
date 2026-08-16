/**
 * Measurement Validity Development Pilot v1 — CLI.
 *
 *   --plan                Day-1 review-pending summary (no provider call, no
 *                         credential read, no plan JSON written).
 *   --plan --review-decisions <file.json>
 *                         Build both frozen Study N + Study E plans from owner
 *                         accepted review decisions; write the no-replace plan
 *                         JSON; print hashes + budget. Fails closed on any
 *                         missing/unsafe decision.
 *   --mock --study n|e --output-dir <dir>
 *                         Deterministic mock execution (no real provider).
 *   --replay <resultIndexContentHash> --study n|e --output-dir <dir>
 *                         Zero-call exact replay against a sealed result index.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { SingleAttemptTextInvoker } from "../v6/providerAdapters";
import {
  buildMeasurementPilotStudyPlanV1,
  clearMeasurementPilotFixtureCacheV1,
  defaultMeasurementPilotOutputDirV1,
  runMeasurementPilotV1,
  writeMeasurementPilotPlanJsonV1,
  type MeasurementPilotReviewDecisionsV1,
  type MeasurementPilotStudyKind,
} from "./measurementPilotExecutionV1";
import { createMeasurementPilotTaskBankV1 } from "./measurementPilotTaskBankV1";

export interface MeasurementPilotArgsV1 {
  mode: "plan" | "mock" | "replay";
  study: MeasurementPilotStudyKind;
  outputDir: string;
  reviewDecisionsPath?: string;
  resultIndexContentHash?: string;
}

export function parseMeasurementPilotArgsV1(argv: readonly string[]): MeasurementPilotArgsV1 {
  let mode: MeasurementPilotArgsV1["mode"] = "plan";
  let study: MeasurementPilotStudyKind = "nuisance";
  let outputDir = "";
  let reviewDecisionsPath: string | undefined;
  let resultIndexContentHash: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--plan") mode = "plan";
    else if (arg === "--mock") mode = "mock";
    else if (arg === "--replay") {
      mode = "replay";
      resultIndexContentHash = argv[++index];
      if (!/^sha256:[0-9a-f]{64}$/.test(resultIndexContentHash ?? "")) {
        throw new Error("--replay requires a sha256 result-index content hash");
      }
    } else if (arg === "--study") {
      const value = argv[++index];
      if (value !== "n" && value !== "e") throw new Error("--study must be n (nuisance) or e (evidence)");
      study = value === "n" ? "nuisance" : "evidence";
    } else if (arg === "--output-dir") {
      const value = argv[++index];
      if (!value || value.trim().length === 0) throw new Error("--output-dir requires a path");
      outputDir = path.resolve(value);
    } else if (arg === "--review-decisions") {
      const value = argv[++index];
      if (!value || value.trim().length === 0) throw new Error("--review-decisions requires a JSON path");
      reviewDecisionsPath = path.resolve(value);
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return {
    mode,
    study,
    outputDir: outputDir || defaultMeasurementPilotOutputDirV1(study),
    ...(reviewDecisionsPath ? { reviewDecisionsPath } : {}),
    ...(resultIndexContentHash ? { resultIndexContentHash } : {}),
  };
}

function loadReviewDecisions(p: string): MeasurementPilotReviewDecisionsV1 {
  const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as MeasurementPilotReviewDecisionsV1;
  if (!Array.isArray(parsed) || parsed.some(decision =>
    typeof decision !== "object" || decision.accepted !== true
    || typeof decision.variantId !== "string" || decision.variantId.length === 0
    || typeof decision.reviewedAt !== "string")) {
    throw new Error("review decisions must be an array of {variantId, accepted:true, reviewedAt, note?}");
  }
  return parsed;
}

function printPendingReview(bank: ReturnType<typeof createMeasurementPilotTaskBankV1>): void {
  console.log(JSON.stringify({
    mode: "plan",
    state: "review_pending",
    profile: bank.profile,
    candidateOrder: bank.candidateOrder,
    clusterCount: bank.clusterCount,
    requiredClusters: 20,
    insufficientClusterSupport: bank.insufficientClusterSupport,
    contentHash: bank.contentHash,
    clusters: bank.clusters.map(cluster => ({
      clusterId: cluster.clusterId,
      sourceTaskId: cluster.sourceTaskId,
      baseTaskId: cluster.baseTaskId,
      syntacticLeakageGroupId: cluster.syntacticLeakageGroupId,
      paraphraseVariant: cluster.paraphraseCandidate?.variantId,
      permutationVariant: cluster.permutationCandidate?.variantId,
      evidenceVariants: cluster.evidenceCandidates.map(candidate => candidate.variantId),
      designatedTargetIsResolution: cluster.truth.designatedTargetIsResolution,
    })),
    claimsAuthorized: ["review pending; no provider call; no plan JSON written"],
    claimsForbidden: ["measurement validity", "governance effect", "held-out evidence", "self-issued accepted review"],
  }, null, 2));
}

function optionsFromPrompt(prompt: string): string[] {
  // The V6 categorical discussion/final prompt lists canonical options as
  // "...exactly these canonical options in this order and sum to 1: A | B | C."
  const match = /canonical options in this order and sum to 1: ([^.]+)\./.exec(prompt);
  if (!match) return ["A", "B", "C"];
  const options = match[1].split("|").map(option => option.trim()).filter(Boolean);
  return options.length >= 2 ? options : ["A", "B", "C"];
}

function categoricalProbabilities(options: string[], firstIndex: number): Record<string, number> {
  const n = options.length;
  const probabilities: Record<string, number> = {};
  options.forEach((option, index) => {
    probabilities[option] = index === firstIndex ? 0.6 : 0.4 / (n - 1);
  });
  return probabilities;
}

function createMockInvoker(_bank: ReturnType<typeof createMeasurementPilotTaskBankV1>): SingleAttemptTextInvoker {
  return {
    async invoke(request) {
      const usage = { promptTokens: 5, completionTokens: 5, totalTokens: 10 };
      const options = optionsFromPrompt(request.userPrompt);
      if (request.requestId.startsWith("final:")) {
        return {
          rawContent: JSON.stringify({
            status: "answered",
            reports: [{ claimId: "claim:pilot-mock", value: { kind: "categorical", probabilities: categoricalProbabilities(options, 0) } }],
          }),
          usage,
        };
      }
      return {
        rawContent: JSON.stringify({
          message: "Deterministic measurement-pilot mock report.",
          belief: { kind: "categorical", probabilities: categoricalProbabilities(options, 0) },
          evidence: [],
        }),
        usage,
      };
    },
  };
}

export async function main(argv: readonly string[]): Promise<number> {
  const args = parseMeasurementPilotArgsV1(argv);
  const bank = createMeasurementPilotTaskBankV1();
  if (args.mode === "plan" && !args.reviewDecisionsPath) {
    printPendingReview(bank);
    return 0;
  }
  const decisions = args.reviewDecisionsPath ? loadReviewDecisions(args.reviewDecisionsPath) : [];
  const assignedAt = "2026-08-14T00:00:00.000Z";
  const freezeAt = "2026-08-14T00:00:05.000Z";
  const providerBoundary = "2026-08-14T00:00:10.000Z";
  const nuisance = buildMeasurementPilotStudyPlanV1({
    bank, decisions, studyKind: "nuisance",
    assignedAt, freezeAt, firstProviderAtBoundary: providerBoundary,
    bootstrapSeed: "measurement-pilot-n-v1",
  });
  const evidence = buildMeasurementPilotStudyPlanV1({
    bank, decisions, studyKind: "evidence",
    assignedAt, freezeAt, firstProviderAtBoundary: providerBoundary,
    bootstrapSeed: "measurement-pilot-e-v1",
  });
  if (args.mode === "plan") {
    const planJson = writeMeasurementPilotPlanJsonV1({ nuisance, evidence });
    console.log(JSON.stringify({
      mode: "plan",
      state: "frozen",
      planContentHash: planJson.contentHash,
      nuisance: { designContentHash: nuisance.design.contentHash, freezeContentHash: nuisance.freeze.contentHash, cells: nuisance.cells.length, plannedCalls: nuisance.maxProviderCalls },
      evidence: { designContentHash: evidence.design.contentHash, freezeContentHash: evidence.freeze.contentHash, cells: evidence.cells.length, plannedCalls: evidence.maxProviderCalls },
      hardCaps: { maxProviderCalls: 2400, maxTotalTokens: 3_000_000 },
    }, null, 2));
    return 0;
  }
  const study = args.study === "nuisance" ? nuisance : evidence;
  clearMeasurementPilotFixtureCacheV1();
  const invoker = args.mode === "mock"
    ? createMockInvoker(bank)
    : { async invoke(): Promise<never> { throw new Error("provider boundary must be unreachable during exact replay"); } } satisfies SingleAttemptTextInvoker;
  const result = await runMeasurementPilotV1({
    study,
    outputDir: args.outputDir,
    invoker,
    ...(args.resultIndexContentHash ? { expectedExistingResultIndexContentHash: args.resultIndexContentHash } : {}),
  });
  console.log(JSON.stringify({
    study: args.study,
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
