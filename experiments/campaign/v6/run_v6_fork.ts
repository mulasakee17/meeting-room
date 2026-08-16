/**
 * V6 fork experiment — minimal, self-contained runner.
 *
 * Round 1 runs ONCE per (task, seed); the identical round-1 state is then forked
 * into 5 arms differing only in what is injected before round 2:
 *   CONTROL (none), SUPPORTS (all confirming), ATTACKS (all disconfirming),
 *   RANDOM (K random), ALL (all evidence).
 *
 * SUPPORTS / ATTACKS / ALL disclose the FULL deduplicated pool so that evidence
 * direction is the ONLY variable between SUPPORTS and ATTACKS. RANDOM is the
 * information-quantity arm: K evidence items, seeded shuffle (frozen salt).
 * Capping SUPPORTS/ATTACKS by K was removed because a contentHash dict-order cap
 * silently drops decisive disconfirming evidence (task-45 "Beta support-beam
 * crack") and confounds direction with truncation.
 *
 * Reuses adapters/parsers/state quantities; does NOT touch the governance
 * decision engine (the fork IS the randomization). Output: flat JSONL rows.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { createHiddenBenchTaskProjectionV1, HIDDENBENCH_OFFICIAL_SOURCE_V1 } from "./hiddenBenchTaskAdapter";
import { CROSS_EVIDENCE_EXCHANGE_TASK_IDS } from "./run_v6_cross_evidence_exchange";
import { createV6HiddenBenchSmokeFixtureV1 } from "./v6HiddenBenchSmokeFixture";
import { createV6Adapters, type SingleAttemptTextInvoker } from "./providerAdapters";
import { createDeepSeekSingleAttemptInvoker } from "./deepseekSingleAttemptInvoker";
import { parseBeliefResponse, createEvidenceAndReferences, resolveV6AuditableRawRunPath, type V6DiscussionRequestV1, type V6PublicTranscriptEntry } from "./productionVerticalSlice";
import { computeAlignmentR, computeEvidenceDiversityHE } from "./analyze_v6_social_thermodynamic_response";
import { selectAllEvidenceV1, buildDisclosedEvidenceMessageV1, type RoundOneReportV1, type RegisteredEvidenceV1 } from "./crossEvidenceExchangeSelectorsV1";
import { V6ProviderCallBudget, createMeteredSingleAttemptInvoker } from "./run_v6_smoke";
import { FINAL_ELICITATION_ADAPTER_REQUEST_V1 } from "../../../src/lib/experimentation/finalElicitationAdapter";
import {
  FINAL_ELICITATION_RESPONSE_SCHEMA_V1,
  buildFinalElicitationPrompt,
  createFinalElicitationContract,
  type FinalElicitationContractV1,
  type FinalElicitationViewV1,
} from "../../../src/lib/experimentation/finalOutcome";
import { safeJsonParse } from "../../../src/lib/utils/jsonUtils";

export const FORK_ARMS = ["CONTROL", "SUPPORTS", "ATTACKS"] as const;
export type ForkArm = typeof FORK_ARMS[number];

const PROTOCOL = "epistemic_governance_v1" as const;
const DISCUSSION_REQUEST_REF = Object.freeze({ id: "swarmalpha.v6.discussion-request", version: "1.0.0" });
const FINAL_MODEL_REF = Object.freeze({ id: "deepseek:deepseek-chat", version: "1.0.0" });
const FINAL_INVOCATION = Object.freeze({ temperature: 0, maxTokens: 256 });

function sha256Text(s: string): string { return `sha256:${createHash("sha256").update(s, "utf8").digest("hex")}`; }
function mean(xs: number[]): number { return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0; }

/**
 * Deterministic per-(task, forkSeed) provider sampling seed. DESIGN INTENT: make
 * round-1 sampling differ across (task, forkSeed) so the fork has real
 * round-1-state diversity to stratify on. FACT: DeepSeek temperature 0 may or
 * may not honor `seed` (greedy decoding can ignore it); a seed-sensitivity probe
 * must confirm cross-seed round-1 variation before FORK_SEEDS > 1 is meaningful.
 */
function providerSeedFor(taskId: number, forkSeed: number): number {
  return (taskId * 7919 + forkSeed * 104729) >>> 0;
}

/**
 * Frozen round-1 state fingerprint, shared by the fork runner and the
 * seed-sensitivity probe so both observe the identical state identity.
 */
function computeRound1StateHash(
  reports: Array<{ agentId: string; probabilities: Record<string, number> }>,
  hashes: string[],
): string {
  return sha256Text(JSON.stringify({
    reports: reports.map(r => ({ a: r.agentId, p: r.probabilities })),
    hashes: [...hashes].sort(),
  }));
}

function maxPairwiseTV(probs: Record<string, number>[]): number {
  if (probs.length < 2) return 0;
  let best = 0;
  for (let i = 0; i < probs.length; i++) for (let j = i + 1; j < probs.length; j++) {
    const keys = new Set([...Object.keys(probs[i]), ...Object.keys(probs[j])]);
    let tv = 0; for (const k of keys) tv += Math.abs((probs[i][k] ?? 0) - (probs[j][k] ?? 0));
    best = Math.max(best, 0.5 * tv);
  }
  return best;
}

function alignmentOf(probs: Record<string, number>[], options: string[]): number | null {
  return computeAlignmentR(probs.map(p => options.map(o => p[o] ?? 0)));
}

function evidenceDiversity(contentHashes: string[]): number | null {
  if (contentHashes.length === 0) return null;
  const counts = new Map<string, number>();
  for (const h of contentHashes) counts.set(h, (counts.get(h) ?? 0) + 1);
  return computeEvidenceDiversityHE([...counts.values()]);
}

function evidenceReuse(contentHashes: string[]): number | null {
  if (contentHashes.length === 0) return null;
  return 1 - new Set(contentHashes).size / contentHashes.length;
}

interface EvidenceItem {
  evidenceId: string; agentId: string; content: string; contentHash: string; relation: "supports" | "attacks";
}
interface RoundReport {
  agentId: string; probabilities: Record<string, number>; message: string; contentHashes: string[]; contents: string[];
}

interface DisclosureOutput {
  message: string | null; count: number; poolSize: number; tokens: number;
  coveredOptionIds: string[]; sourceAgentCount: number;
}

function buildDisclosure(arm: ForkArm, input: {
  reports: RoundOneReportV1[];
  registry: Map<string, RegisteredEvidenceV1>;
  options: string[];
}): DisclosureOutput {
  if (arm === "CONTROL") return { message: null, count: 0, poolSize: 0, tokens: 0, coveredOptionIds: [], sourceAgentCount: 0 };
  const relations: ReadonlyArray<"supports" | "attacks"> = arm === "SUPPORTS" ? ["supports"] : ["attacks"];
  // Full deduplicated pool, no K cap: direction must be the only variable.
  // A K cap by contentHash dict-order would silently drop decisive disconfirming
  // evidence (task-45 "Beta support-beam crack" was capped out and flipped the arm).
  const items = selectAllEvidenceV1({ reports: input.reports, evidenceRegistry: input.registry, relations });
  const poolSize = items.length;
  if (items.length === 0) return { message: null, count: 0, poolSize, tokens: 0, coveredOptionIds: [], sourceAgentCount: 0 };
  const message = buildDisclosedEvidenceMessageV1(items);
  // Option-coverage proxy: exact case-insensitive option-name substring in the
  // disclosed message. Coarse by design (R2): recorded, not force-matched, and
  // not an identity-verified coverage claim.
  const coveredOptionIds = input.options.filter(o => message.toLowerCase().includes(o.toLowerCase()));
  const sourceAgentCount = new Set(items.flatMap(item => item.sourceAgentIds)).size;
  return { message, count: items.length, poolSize, tokens: message.length, coveredOptionIds, sourceAgentCount };
}

export interface ForkRow {
  taskId: number; seed: number; model: string; round1StateHash: string; arm: ForkArm;
  // Intervention (disclosure) record.
  disclosedEvidenceCount: number; disclosedPoolSize: number;
  disclosedTokenCount: number; disclosedCoveredOptionIds: string[];
  disclosedCoveredOptionCount: number; disclosedSourceAgentCount: number;
  // Round-1 epistemic state.
  alignmentR: number | null; maxPairwiseTV: number; evidenceReuse: number | null; evidenceDiversity: number | null;
  // Round-2 state + transition.
  round2Belief: Record<string, number> | null; round2AlignmentR: number | null; round2MaxPairwiseTV: number | null;
  evidenceReuseR2: number | null; evidenceDiversityR2: number | null;
  beliefShiftR1ToR2: number | null;
  // Final outcome.
  finalBrier: number | null; finalAccuracy: number | null; finalBelief: Record<string, number> | null;
  finalReportedCount: number;
  resolvedOption: string | null;
  // Full-trace side channels (F2; not core statistics).
  round1AgentBeliefs: Record<string, number>[];
  round2AgentBeliefs: Record<string, number>[];
  round2EvidenceContentHashes: string[][];
  finalAgentBeliefs: Record<string, number>[];
  // Evidence source text (for post-hoc SCDG / semantic-dependence analysis).
  round1EvidenceContents: string[][];
  round2EvidenceContents: string[][];
}

export async function runFork(input: {
  taskId: number; seed: number; model: string; invoker: SingleAttemptTextInvoker; outputDir?: string;
}): Promise<ForkRow[]> {
  const projection = createHiddenBenchTaskProjectionV1({ sourceTaskId: input.taskId });
  const task = projection.adapter.task;
  const claim = task.claim;
  const options = [...claim.options];
  const agents = task.agents;
  const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: input.taskId, profile: "mechanism-verdict-v2-v1" });
  const adapters = createV6Adapters({
    discussionContract: fixture.discussionContract,
    verificationContract: fixture.verificationContract,
    finalContract: fixture.finalContract,
    invoker: input.invoker,
  });
  const runId = `fork:task-${input.taskId}:seed-${input.seed}`;
  const signal = new AbortController().signal;
  const providerSeed = providerSeedFor(input.taskId, input.seed);

  // ---- Round 1 (run once) ----
  const transcript: V6PublicTranscriptEntry[] = [];
  const reports: RoundReport[] = [];
  const evidence: EvidenceItem[] = [];
  for (let idx = 0; idx < agents.length; idx++) {
    const agent = agents[idx];
    const binding = fixture.discussionContract.agentBindings[idx];
    const request: V6DiscussionRequestV1 = {
      requestSchemaRef: structuredClone(DISCUSSION_REQUEST_REF),
      requestId: `discussion:${runId}:r1:${agent.agentId}`,
      runId, taskId: task.id, agentId: agent.agentId, round: 1, protocol: PROTOCOL,
      publicContext: task.publicContext, ownPrivateInformation: agent.privateInformation,
      claim: structuredClone(claim), visibleTranscript: [],
      responseContract: "belief_json_v1", modelRef: structuredClone(binding.modelRef), invocationConfig: { ...structuredClone(binding.invocationConfig), seed: providerSeed },
    };
    const result = await adapters.discussionAdapter.respond(request, signal);
    if (result.status !== "response") continue;
    const parsed = parseBeliefResponse(result.rawResponse, claim);
    if (!parsed.ok) continue;
    const bundle = createEvidenceAndReferences({ runId, round: 1, agentId: agent.agentId, parsed: parsed.parsed, createdAt: new Date().toISOString() });
    const probs = parsed.parsed.value.kind === "categorical" ? parsed.parsed.value.probabilities : {};
    const hashes = bundle.evidence.map(e => e.provenance.contentHash);
    reports.push({ agentId: agent.agentId, probabilities: probs, message: parsed.parsed.message, contentHashes: hashes, contents: bundle.evidence.map(e => e.content) });
    for (let i = 0; i < bundle.evidence.length; i++) {
      const e = bundle.evidence[i];
      const relation = bundle.references[i]?.relation ?? "supports";
      evidence.push({ evidenceId: e.id, agentId: agent.agentId, content: e.content, contentHash: e.provenance.contentHash, relation });
    }
    transcript.push({ round: 1, agentId: agent.agentId, content: parsed.parsed.message, source: "agent" });
  }

  // Registry + reports shaped for the shared cross-evidence selectors (reuse).
  const registry: Map<string, RegisteredEvidenceV1> = new Map(
    evidence.map(e => [e.evidenceId, { evidenceId: e.evidenceId, content: e.content, contentHash: e.contentHash }]),
  );
  const round1Reports: RoundOneReportV1[] = reports.map(r => ({
    agentId: r.agentId,
    probabilities: r.probabilities,
    evidenceRefs: evidence.filter(e => e.agentId === r.agentId).map(e => ({ evidenceId: e.evidenceId, relation: e.relation })),
  }));

  const allHashes = reports.flatMap(r => r.contentHashes);
  const state = {
    alignmentR: alignmentOf(reports.map(r => r.probabilities), options),
    maxPairwiseTV: maxPairwiseTV(reports.map(r => r.probabilities)),
    evidenceReuse: evidenceReuse(allHashes),
    evidenceDiversity: evidenceDiversity(allHashes),
  };
  const stateHash = computeRound1StateHash(reports, allHashes);
  // Round-1 pooled belief + per-agent trace (shared across all 5 arms).
  const round1AgentBeliefs: Record<string, number>[] = reports.map(r => r.probabilities);
  const round1PooledBelief: Record<string, number> = {};
  for (const o of options) round1PooledBelief[o] = mean(round1AgentBeliefs.map(p => p[o] ?? 0));

  // ---- Resolve (the correct answer is the task's frozen outcome) ----
  const resolvedOption = task.outcome;
  const finalContract: FinalElicitationContractV1 = createFinalElicitationContract({
    id: "swarmalpha.final-elicitation.v6-categorical-production",
    version: "1.0.0",
    claimIds: [claim.id],
  });

  // ---- Fork 5 arms ----
  const rows: ForkRow[] = [];
  for (const arm of FORK_ARMS) {
    const disclosure = buildDisclosure(arm, { reports: round1Reports, registry, options });
    const transcript2 = [...transcript];
    if (disclosure.message) transcript2.push({ round: 2, agentId: "governance", content: disclosure.message, source: "governance" });

    const round2: RoundReport[] = [];
    for (let idx = 0; idx < agents.length; idx++) {
      const agent = agents[idx];
      const binding = fixture.discussionContract.agentBindings[idx];
      const request: V6DiscussionRequestV1 = {
        requestSchemaRef: structuredClone(DISCUSSION_REQUEST_REF),
        requestId: `discussion:${runId}:${arm}:r2:${agent.agentId}`,
        runId, taskId: task.id, agentId: agent.agentId, round: 2, protocol: PROTOCOL,
        publicContext: task.publicContext, ownPrivateInformation: agent.privateInformation,
        claim: structuredClone(claim), visibleTranscript: structuredClone(transcript2),
        responseContract: "belief_json_v1", modelRef: structuredClone(binding.modelRef), invocationConfig: { ...structuredClone(binding.invocationConfig), seed: providerSeed },
      };
      const result = await adapters.discussionAdapter.respond(request, signal);
      if (result.status !== "response") continue;
      const parsed = parseBeliefResponse(result.rawResponse, claim);
      if (!parsed.ok) continue;
      const probs = parsed.parsed.value.kind === "categorical" ? parsed.parsed.value.probabilities : {};
      const bundle2 = createEvidenceAndReferences({ runId, round: 2, agentId: agent.agentId, parsed: parsed.parsed, createdAt: new Date().toISOString() });
      round2.push({ agentId: agent.agentId, probabilities: probs, message: parsed.parsed.message, contentHashes: bundle2.evidence.map(e => e.provenance.contentHash), contents: bundle2.evidence.map(e => e.content) });
    }

    // Final private elicitation via the slice's formal prompt instrument.
    const finalProbs: Record<string, number>[] = [];
    const finalTranscript: V6PublicTranscriptEntry[] = [...transcript2, ...round2.map(r => ({ round: 2 as const, agentId: r.agentId, content: r.message, source: "agent" as const }))];
    for (let idx = 0; idx < agents.length; idx++) {
      const agent = agents[idx];
      const view: FinalElicitationViewV1 = {
        publicContext: task.publicContext,
        ownPrivateInformation: agent.privateInformation,
        discussionTranscript: finalTranscript.map(t => ({ round: t.round, agentId: t.agentId, content: t.content })),
      };
      const finalPrompt = buildFinalElicitationPrompt({ view, contract: finalContract, claims: [claim] });
      const result = await adapters.finalElicitationAdapter.elicit({
        requestSchemaRef: FINAL_ELICITATION_ADAPTER_REQUEST_V1,
        runId: `${runId}:${arm}`, agentId: agent.agentId, sequence: idx + 1, prompt: finalPrompt,
        responseSchemaRef: FINAL_ELICITATION_RESPONSE_SCHEMA_V1,
        modelRef: structuredClone(FINAL_MODEL_REF), invocationConfig: { ...structuredClone(FINAL_INVOCATION), seed: providerSeed },
      }, signal);
      if (result.status !== "response") continue;
      const j = safeJsonParse<{ status?: string; reports?: Array<{ claimId?: string; value?: { kind?: string; probabilities?: Record<string, number> } }> }>(result.rawResponse);
      const report = j?.reports?.[0];
      if (j?.status === "answered" && report?.value?.kind === "categorical" && report.value.probabilities) {
        finalProbs.push(report.value.probabilities);
      }
    }

    // Round-2 pooled belief + trace (full transition leg: round1 -> round2 -> final).
    let round2Belief: Record<string, number> | null = null;
    if (round2.length > 0) {
      round2Belief = {};
      for (const o of options) round2Belief[o] = mean(round2.map(r => r.probabilities[o] ?? 0));
    }
    const round2AgentBeliefs: Record<string, number>[] = round2.map(r => r.probabilities);
    const round2EvidenceContentHashes: string[][] = round2.map(r => r.contentHashes);
    const allR2Hashes = round2.flatMap(r => r.contentHashes);
    const evidenceReuseR2 = evidenceReuse(allR2Hashes);
    const evidenceDiversityR2 = evidenceDiversity(allR2Hashes);
    const beliefShiftR1ToR2: number | null = round2Belief
      ? options.reduce((s, o) => s + Math.abs((round2Belief![o] ?? 0) - (round1PooledBelief[o] ?? 0)), 0) * 0.5
      : null;

    let finalBelief: Record<string, number> | null = null;
    let finalBrier: number | null = null;
    let finalAccuracy: number | null = null;
    if (finalProbs.length > 0 && resolvedOption) {
      finalBelief = {};
      for (const o of options) finalBelief[o] = mean(finalProbs.map(p => p[o] ?? 0));
      const argmax = options.reduce((best, o) => (finalBelief![o] > (finalBelief![best] ?? -1) ? o : best), options[0]);
      finalAccuracy = argmax === resolvedOption ? 1 : 0;
      finalBrier = options.reduce((s, o) => s + (finalBelief![o] - (o === resolvedOption ? 1 : 0)) ** 2, 0);
    }

    rows.push({
      taskId: input.taskId, seed: input.seed, model: input.model, round1StateHash: stateHash, arm,
      disclosedEvidenceCount: disclosure.count, disclosedPoolSize: disclosure.poolSize,
      disclosedTokenCount: disclosure.tokens, disclosedCoveredOptionIds: disclosure.coveredOptionIds,
      disclosedCoveredOptionCount: disclosure.coveredOptionIds.length, disclosedSourceAgentCount: disclosure.sourceAgentCount,
      alignmentR: state.alignmentR, maxPairwiseTV: state.maxPairwiseTV, evidenceReuse: state.evidenceReuse, evidenceDiversity: state.evidenceDiversity,
      round2Belief, round2AlignmentR: alignmentOf(round2.map(r => r.probabilities), options),
      round2MaxPairwiseTV: maxPairwiseTV(round2.map(r => r.probabilities)),
      evidenceReuseR2, evidenceDiversityR2, beliefShiftR1ToR2,
      finalBrier, finalAccuracy, finalBelief, finalReportedCount: finalProbs.length, resolvedOption,
      round1AgentBeliefs, round2AgentBeliefs, round2EvidenceContentHashes, finalAgentBeliefs: finalProbs,
      round1EvidenceContents: reports.map(r => r.contents), round2EvidenceContents: round2.map(r => r.contents),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Seed-sensitivity probe: does provider `seed` actually change round-1 sampling
// at temperature 0? Zero-cost in mock; real DeepSeek via `--probe-seed`.
// ---------------------------------------------------------------------------

export interface SeedSensitivityProbeRun {
  taskId: number;
  seed: number;
  providerSeed: number;
  round1StateHash: string;
  /** sha256 of all raw responses — detects verbatim drift even when belief vectors coincide. */
  responseSignature: string;
}

export interface SeedSensitivityProbeResult {
  perRun: SeedSensitivityProbeRun[];
  perTask: Array<{ taskId: number; distinctStateHashes: number; distinctResponseSignatures: number }>;
  anySeedVariation: boolean;
  conclusion: "seed_variation_confirmed" | "no_seed_variation" | "inconclusive";
}

/**
 * Run ONLY round 1 for one (task, seed) and return the same state fingerprint the
 * fork runner uses. Mirrors runFork's round-1 request construction exactly so the
 * probe's conclusion transfers to the fork; the raw responses are also recorded.
 */
async function runForkRound1Probe(input: {
  taskId: number;
  seed: number;
  invoker: SingleAttemptTextInvoker;
}): Promise<SeedSensitivityProbeRun> {
  const projection = createHiddenBenchTaskProjectionV1({ sourceTaskId: input.taskId });
  const task = projection.adapter.task;
  const claim = task.claim;
  const agents = task.agents;
  const fixture = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: input.taskId, profile: "mechanism-verdict-v2-v1" });
  const adapters = createV6Adapters({
    discussionContract: fixture.discussionContract,
    verificationContract: fixture.verificationContract,
    finalContract: fixture.finalContract,
    invoker: input.invoker,
  });
  const runId = `fork:task-${input.taskId}:seed-${input.seed}`;
  const providerSeed = providerSeedFor(input.taskId, input.seed);
  const signal = new AbortController().signal;

  const reports: Array<{ agentId: string; probabilities: Record<string, number> }> = [];
  const hashes: string[] = [];
  const rawResponses: string[] = [];
  for (let idx = 0; idx < agents.length; idx++) {
    const agent = agents[idx];
    const binding = fixture.discussionContract.agentBindings[idx];
    const request: V6DiscussionRequestV1 = {
      requestSchemaRef: structuredClone(DISCUSSION_REQUEST_REF),
      requestId: `discussion:${runId}:r1:${agent.agentId}`,
      runId, taskId: task.id, agentId: agent.agentId, round: 1, protocol: PROTOCOL,
      publicContext: task.publicContext, ownPrivateInformation: agent.privateInformation,
      claim: structuredClone(claim), visibleTranscript: [],
      responseContract: "belief_json_v1", modelRef: structuredClone(binding.modelRef), invocationConfig: { ...structuredClone(binding.invocationConfig), seed: providerSeed },
    };
    const result = await adapters.discussionAdapter.respond(request, signal);
    if (result.status !== "response") { rawResponses.push(`<${result.status}>`); continue; }
    rawResponses.push(result.rawResponse);
    const parsed = parseBeliefResponse(result.rawResponse, claim);
    if (!parsed.ok) continue;
    const bundle = createEvidenceAndReferences({ runId, round: 1, agentId: agent.agentId, parsed: parsed.parsed, createdAt: new Date().toISOString() });
    const probs = parsed.parsed.value.kind === "categorical" ? parsed.parsed.value.probabilities : {};
    reports.push({ agentId: agent.agentId, probabilities: probs });
    hashes.push(...bundle.evidence.map(e => e.provenance.contentHash));
  }
  return {
    taskId: input.taskId,
    seed: input.seed,
    providerSeed,
    round1StateHash: computeRound1StateHash(reports, hashes),
    responseSignature: sha256Text(rawResponses.join("\n<separator>\n")),
  };
}

export async function probeForkSeedSensitivity(input: {
  taskIds: readonly number[];
  seeds: readonly number[];
  invoker: SingleAttemptTextInvoker;
}): Promise<SeedSensitivityProbeResult> {
  const perRun: SeedSensitivityProbeRun[] = [];
  for (const taskId of input.taskIds) {
    for (const seed of input.seeds) {
      perRun.push(await runForkRound1Probe({ taskId, seed, invoker: input.invoker }));
    }
  }
  const perTask = input.taskIds.map(taskId => {
    const runs = perRun.filter(r => r.taskId === taskId);
    return {
      taskId,
      distinctStateHashes: new Set(runs.map(r => r.round1StateHash)).size,
      distinctResponseSignatures: new Set(runs.map(r => r.responseSignature)).size,
    };
  });
  const anySeedVariation = perTask.some(t => t.distinctStateHashes > 1);
  const conclusion: SeedSensitivityProbeResult["conclusion"] = input.seeds.length < 2
    ? "inconclusive"
    : anySeedVariation
      ? "seed_variation_confirmed"
      : "no_seed_variation";
  return { perRun, perTask, anySeedVariation, conclusion };
}

// ---------------------------------------------------------------------------
// Frozen fork design: plan + JSONL manifest + deterministic replay.
// ---------------------------------------------------------------------------

export const FORK_EXPERIMENT_REF = Object.freeze({
  id: "swarmalpha.experiment.v6-fork-v1",
  version: "3.0.0",
});
export const FORK_PROFILE = "fork-v1" as const;
/**
 * Development criterion (frozen): any HiddenBench task whose ATTACKS/SUPPORTS
 * fork outcome has been human-inspected, compared, or used to form the current
 * direction hypothesis is development. Currently identical to the
 * cross-evidence-exchange task set (20 tasks, incl. historical task39/task45).
 */
export const FORK_DEVELOPMENT_TASK_IDS: readonly number[] = [...CROSS_EVIDENCE_EXCHANGE_TASK_IDS];

/**
 * Confirmatory set: every pinned HiddenBench task NOT in the development set.
 * Frozen = 65 − 20 = 45 unseen tasks. Membership must not change after the
 * confirmatory run starts; any treatment/estimand change requires a new version.
 */
export const FORK_CONFIRMATORY_TASK_IDS: readonly number[] = (() => {
  const development = new Set(FORK_DEVELOPMENT_TASK_IDS);
  return Array.from({ length: HIDDENBENCH_OFFICIAL_SOURCE_V1.taskCount }, (_, i) => i + 1)
    .filter(id => !development.has(id));
})();
/**
 * v3 POST-HOC multi-seed replication seed policy: 2 seeds [0, 1].
 * The seed probe confirmed provider `seed` does vary round-1 realization. The
 * original confirmatory (v2, experimentRef 2.0.0) froze FORK_SEEDS=[0] and its
 * numbers are already published; v3 adds seed=1 as a post-hoc replication so the
 * cross-seed task-level effect and a (weak) within-task detector check become
 * observable. seed=0 is reused byte-for-byte from v2, not re-run.
 */
export const FORK_SEEDS: readonly number[] = [0, 1];
export const FORK_MODEL = "deepseek:deepseek-chat";
export const FORK_PLAN_CREATED_AT = "2026-08-16T00:00:00.000Z";
export const FORK_OUTPUT_DIR = path.resolve(
  process.cwd(),
  "experiments/campaign/pilot_output/v6-fork-confirmatory-v3-20260816",
);
export const FORK_PLAN_PATH = path.resolve(
  process.cwd(),
  "experiments/campaign/v6/v6_fork_confirmatory_v3.plan.json",
);
/** `--execute` is fail-closed while true. Confirmatory v2 is owner-approved; `RUN_AUTHORIZED=yes` still gates the run. */
export const FORK_DISABLED = false;

export const FORK_CONFIRMATORY_MANIFEST_REF = Object.freeze({
  id: "swarmalpha.experiment.v6-fork-confirmatory-manifest",
  version: "3.0.0",
});
export const FORK_CONFIRMATORY_MANIFEST_PATH = path.resolve(
  process.cwd(),
  "experiments/campaign/v6/v6_fork_confirmatory_v3.manifest.json",
);

export interface ForkConfirmatoryManifest {
  manifestSchemaRef: { id: string; version: string };
  experimentRef: { id: string; version: string };
  developmentCriterion: string;
  developmentTaskIds: number[];
  confirmatoryTaskIds: number[];
  taskIdsHash: string;
  model: string;
  temperature: number;
  arms: ForkArm[];
  seedPolicy: string;
  h1: string;
  h2: string;
  brierDefinition: string;
  bootstrapMethod: string;
  bootstrapRepetitions: number;
  tokenDiagnosticPolicy: string;
  selectorRef: { id: string; version: string };
  analyzerRef: { id: string; version: string };
  frozenAt: string;
  contentHash: string;
}

export function buildForkConfirmatoryManifest(frozenAt: string = FORK_PLAN_CREATED_AT): ForkConfirmatoryManifest {
  const body: Omit<ForkConfirmatoryManifest, "contentHash"> = {
    manifestSchemaRef: { ...FORK_CONFIRMATORY_MANIFEST_REF },
    experimentRef: { ...FORK_EXPERIMENT_REF },
    developmentCriterion:
      "any HiddenBench task whose ATTACKS/SUPPORTS fork outcome has been human-inspected, compared, or used to form the current direction hypothesis",
    developmentTaskIds: [...FORK_DEVELOPMENT_TASK_IDS],
    confirmatoryTaskIds: [...FORK_CONFIRMATORY_TASK_IDS],
    taskIdsHash: sha256Text(JSON.stringify({
      development: [...FORK_DEVELOPMENT_TASK_IDS],
      confirmatory: [...FORK_CONFIRMATORY_TASK_IDS],
    })),
    model: FORK_MODEL,
    temperature: 0,
    arms: [...FORK_ARMS],
    seedPolicy:
      "v3 POST-HOC replication: 2 seeds (FORK_SEEDS=[0,1]); seed=0 reused byte-for-byte from v2, seed=1 run fresh; provider seed derived per (task, forkSeed); cross-seed task-level effect and a weak (2-run/task) within-task detector check are the v3 estimands",
    h1: "delta_dir = Brier_ATTACKS - Brier_SUPPORTS (negative = ATTACKS better); primary",
    h2: "delta_disc = Brier_ATTACKS - Brier_CONTROL (negative = ATTACKS better); key secondary",
    brierDefinition:
      "multiclass Brier sum over committed canonical options vs frozen task outcome, pooled over final private belief reports",
    bootstrapMethod:
      "task-cluster bootstrap; resample unit = task; within-task paired deltas averaged across seeds before task-level effect",
    bootstrapRepetitions: 10_000,
    tokenDiagnosticPolicy:
      "record-only; never truncate/rewrite evidence; run ATTACKS-vs-SUPPORTS token imbalance diagnostic on development tasks before confirmatory; add a full-item token-budget selector only if a systematic imbalance is observed",
    selectorRef: { id: "swarmalpha.selector.fork-disclosure-v1", version: "1.0.0" },
    analyzerRef: { id: "swarmalpha.analyzer.fork-v1", version: "1.0.0" },
    frozenAt,
  };
  return { ...body, contentHash: hashCanonical(body) };
}

function canonicalize(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value as object)) throw new Error("cannot canonicalize a cyclic value");
  const next = new Set(ancestors);
  next.add(value as object);
  if (Array.isArray(value)) return value.map(entry => canonicalize(entry, next));
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map(key => [key, canonicalize(record[key], next)]));
}
function hashCanonical(value: unknown): string {
  return sha256Text(JSON.stringify(canonicalize(value)));
}

export interface ForkRunPlanV1 {
  runId: string;
  taskId: number;
  seed: number;
  order: number;
}

export interface ForkPlanV1 {
  experimentRef: { id: string; version: string };
  profile: string;
  taskIds: number[];
  seeds: number[];
  arms: ForkArm[];
  model: string;
  agentCount: number;
  plannedProviderCallsPerRun: number;
  runs: ForkRunPlanV1[];
  totalRuns: number;
  totalPlannedProviderCalls: number;
  createdAt: string;
  contentHash: string;
}

export function forkRunId(taskId: number, seed: number): string {
  return `run:fork-v1:task-${taskId}:seed-${seed}`;
}

export function buildForkPlanV1(
  taskIds: readonly number[] = FORK_CONFIRMATORY_TASK_IDS,
  seeds: readonly number[] = FORK_SEEDS,
): ForkPlanV1 {
  const runs: ForkRunPlanV1[] = [];
  for (const taskId of taskIds) {
    for (const seed of seeds) {
      runs.push({ runId: forkRunId(taskId, seed), taskId, seed, order: 0 });
    }
  }
  runs.forEach((run, index) => { run.order = index + 1; });
  const agentCount = taskIds.length > 0
    ? createHiddenBenchTaskProjectionV1({ sourceTaskId: taskIds[0] }).adapter.task.agents.length
    : 0;
  // round-1 once (agentCount) + 3 arms × (round-2 agentCount + final agentCount).
  const plannedProviderCallsPerRun = agentCount + FORK_ARMS.length * agentCount * 2;
  const body: Omit<ForkPlanV1, "contentHash"> = {
    experimentRef: { ...FORK_EXPERIMENT_REF },
    profile: FORK_PROFILE,
    taskIds: [...taskIds],
    seeds: [...seeds],
    arms: [...FORK_ARMS],
    model: FORK_MODEL,
    agentCount,
    plannedProviderCallsPerRun,
    runs,
    totalRuns: runs.length,
    totalPlannedProviderCalls: runs.length * plannedProviderCallsPerRun,
    createdAt: FORK_PLAN_CREATED_AT,
  };
  return { ...body, contentHash: hashCanonical(body) };
}

export interface ForkManifestFileV1 {
  runId: string;
  taskId: number;
  seed: number;
  fileName: string;
  rowCount: number;
  contentHash: string;
}

export interface ForkManifestV1 {
  manifestSchemaRef: { id: string; version: string };
  experimentRef: { id: string; version: string };
  profile: string;
  taskIds: number[];
  seeds: number[];
  arms: ForkArm[];
  model: string;
  files: ForkManifestFileV1[];
  totalRuns: number;
  totalRows: number;
  createdAt: string;
  contentHash: string;
}

export const FORK_MANIFEST_SCHEMA_REF = Object.freeze({
  id: "swarmalpha.experiment.v6-fork-manifest",
  version: "1.0.0",
});

function forkRunPath(outputDir: string, runId: string): string {
  // Reuse the auditable raw-run path stem (collision-free: sanitized stem + sha256
  // suffix), swapping only the extension for the fork's flat JSONL row file.
  return resolveV6AuditableRawRunPath(outputDir, runId).replace(/\.raw-run\.v5\.json$/, ".jsonl");
}

function readForkRows(filePath: string): ForkRow[] {
  const text = fs.readFileSync(filePath, "utf8");
  return text.split("\n").filter(line => line.trim().length > 0).map(line => JSON.parse(line) as ForkRow);
}

export async function runForkExecute(input: {
  plan: ForkPlanV1;
  invoker: SingleAttemptTextInvoker;
  outputDir?: string;
  taskIds?: readonly number[];
  seeds?: readonly number[];
}): Promise<{ runs: number; reused: number; rows: number; calls: number; tokens: number }> {
  const outputDir = input.outputDir ?? FORK_OUTPUT_DIR;
  fs.mkdirSync(outputDir, { recursive: true });
  const taskSet = input.taskIds ? new Set(input.taskIds) : null;
  const seedSet = input.seeds ? new Set(input.seeds) : null;
  const ordered = input.plan.runs
    .filter(run => (taskSet === null || taskSet.has(run.taskId)) && (seedSet === null || seedSet.has(run.seed)))
    .sort((a, b) => a.order - b.order);

  // Budget + metered invoker (reuse the v6 smoke accounting path).
  const budget = new V6ProviderCallBudget(
    input.plan.totalPlannedProviderCalls,
    input.plan.totalPlannedProviderCalls * 6_000,
  );
  const metered = createMeteredSingleAttemptInvoker(input.invoker, budget);

  const files: ForkManifestFileV1[] = [];
  let reused = 0;
  let totalRows = 0;
  for (const run of ordered) {
    const filePath = forkRunPath(outputDir, run.runId);
    if (fs.existsSync(filePath)) {
      const existing = readForkRows(filePath);
      if (existing.length !== FORK_ARMS.length) {
        throw new Error(`resume_conflict: ${run.runId} has ${existing.length} rows, expected ${FORK_ARMS.length}`);
      }
      files.push({
        runId: run.runId, taskId: run.taskId, seed: run.seed, fileName: path.basename(filePath),
        rowCount: existing.length, contentHash: sha256Text(fs.readFileSync(filePath, "utf8")),
      });
      reused += 1;
      totalRows += existing.length;
      continue;
    }
    budget.assertCanStartRun(input.plan.plannedProviderCallsPerRun, input.plan.plannedProviderCallsPerRun * 6_000);
    const rows = await runFork({ taskId: run.taskId, seed: run.seed, model: input.plan.model, invoker: metered });
    const text = `${rows.map(row => JSON.stringify(row)).join("\n")}\n`;
    fs.writeFileSync(filePath, text, { flag: "wx" });
    files.push({
      runId: run.runId, taskId: run.taskId, seed: run.seed, fileName: path.basename(filePath),
      rowCount: rows.length, contentHash: sha256Text(text),
    });
    totalRows += rows.length;
    console.log(`  completed ${run.runId} rows=${rows.length} (${reused > 0 ? `${reused} reused, ` : ""}${files.length}/${ordered.length})`);
  }

  const manifestBody: Omit<ForkManifestV1, "contentHash"> = {
    manifestSchemaRef: { ...FORK_MANIFEST_SCHEMA_REF },
    experimentRef: { ...FORK_EXPERIMENT_REF },
    profile: FORK_PROFILE,
    taskIds: [...input.plan.taskIds],
    seeds: [...input.plan.seeds],
    arms: [...FORK_ARMS],
    model: input.plan.model,
    files: files.sort((a, b) => a.runId.localeCompare(b.runId)),
    totalRuns: ordered.length,
    totalRows,
    createdAt: new Date().toISOString(),
  };
  const manifest: ForkManifestV1 = { ...manifestBody, contentHash: hashCanonical(manifestBody) };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { runs: ordered.length, reused, rows: totalRows, calls: budget.callCount, tokens: budget.tokenCount };
}

/** Deterministic replay: recompute file + manifest hashes and report mismatches. */
export function verifyForkOutput(outputDir: string = FORK_OUTPUT_DIR): { ok: boolean; detail: string } {
  const manifestPath = path.join(outputDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, detail: "manifest.json missing" };
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ForkManifestV1;
  const problems: string[] = [];
  for (const file of manifest.files) {
    const filePath = path.join(outputDir, file.fileName);
    if (!fs.existsSync(filePath)) { problems.push(`missing file: ${file.fileName}`); continue; }
    const contentHash = sha256Text(fs.readFileSync(filePath, "utf8"));
    if (contentHash !== file.contentHash) problems.push(`hash mismatch: ${file.fileName}`);
    const rows = readForkRows(filePath);
    if (rows.length !== FORK_ARMS.length) problems.push(`row count ${rows.length}: ${file.fileName}`);
    const hashes = new Set(rows.map(row => row.round1StateHash));
    if (hashes.size !== 1) problems.push(`round-1 state hash not shared across arms: ${file.fileName}`);
  }
  const { contentHash: _recorded, ...manifestBody } = manifest;
  const recomputed = hashCanonical(manifestBody);
  if (recomputed !== manifest.contentHash) problems.push("manifest contentHash mismatch");
  return { ok: problems.length === 0, detail: problems.length === 0 ? `verified ${manifest.files.length} files` : problems.join("; ") };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function runPlan(): number {
  const plan = buildForkPlanV1();
  if (fs.existsSync(FORK_PLAN_PATH)) {
    const existing = JSON.parse(fs.readFileSync(FORK_PLAN_PATH, "utf8")) as ForkPlanV1;
    if (existing.contentHash !== plan.contentHash) throw new Error("fork-plan-no-replace-conflict");
  } else {
    fs.mkdirSync(path.dirname(FORK_PLAN_PATH), { recursive: true });
    fs.writeFileSync(FORK_PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
  }
  console.log(JSON.stringify({
    mode: "plan", contentHash: plan.contentHash, runs: plan.totalRuns,
    callsPerRun: plan.plannedProviderCallsPerRun, totalCalls: plan.totalPlannedProviderCalls,
    outputDir: FORK_OUTPUT_DIR,
  }, null, 2));
  return 0;
}

async function runExecute(): Promise<number> {
  if (FORK_DISABLED) {
    console.error("execute_blocked: fork-v1 design is not yet owner-approved; re-freeze the plan before --execute");
    return 6;
  }
  if (process.env.RUN_AUTHORIZED !== "yes") { console.error("execute_blocked: RUN_AUTHORIZED=yes not present"); return 5; }
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  if (!process.env.DEEPSEEK_API_KEY) { console.error("deepseek_api_key_unavailable"); return 3; }
  const plan = buildForkPlanV1();
  return runForkExecute({ plan, invoker: createDeepSeekSingleAttemptInvoker() })
    .then(({ runs, reused, rows, calls, tokens }) => { console.log(JSON.stringify({ runs, reused, rows, calls, tokens })); return 0; })
    .catch(error => { console.error(error instanceof Error ? error.message : String(error)); return 4; });
}

function runReplay(): number {
  const result = verifyForkOutput();
  console.log(JSON.stringify({ mode: "replay", ok: result.ok, detail: result.detail }, null, 2));
  return result.ok ? 0 : 1;
}

/** Real-provider seed-sensitivity probe (2 tasks x 2 seeds = 16 round-1 calls). */
async function runProbeSeed(): Promise<number> {
  if (process.env.RUN_AUTHORIZED !== "yes") { console.error("probe_blocked: RUN_AUTHORIZED=yes not present"); return 5; }
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  if (!process.env.DEEPSEEK_API_KEY) { console.error("deepseek_api_key_unavailable"); return 3; }
  const result = await probeForkSeedSensitivity({
    taskIds: [13, 39],
    seeds: [0, 1],
    invoker: createDeepSeekSingleAttemptInvoker(),
  });
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

/** Write the frozen confirmatory manifest (fail-closed on hash conflict). */
function runFreezeManifest(): number {
  const manifest = buildForkConfirmatoryManifest();
  if (fs.existsSync(FORK_CONFIRMATORY_MANIFEST_PATH)) {
    const existing = JSON.parse(fs.readFileSync(FORK_CONFIRMATORY_MANIFEST_PATH, "utf8")) as ForkConfirmatoryManifest;
    if (existing.contentHash !== manifest.contentHash) throw new Error("fork-manifest-no-replace-conflict");
  } else {
    fs.writeFileSync(FORK_CONFIRMATORY_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  }
  console.log(JSON.stringify({
    mode: "freeze-manifest",
    contentHash: manifest.contentHash,
    developmentTasks: manifest.developmentTaskIds.length,
    confirmatoryTasks: manifest.confirmatoryTaskIds.length,
  }, null, 2));
  return 0;
}

async function main(): Promise<number> {
  if (process.argv.includes("--plan")) return runPlan();
  if (process.argv.includes("--execute")) return runExecute();
  if (process.argv.includes("--replay")) return runReplay();
  if (process.argv.includes("--probe-seed")) return runProbeSeed();
  if (process.argv.includes("--freeze-manifest")) return runFreezeManifest();
  console.error("usage: --plan | --execute | --replay | --probe-seed | --freeze-manifest");
  return 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 4;
  });
}
