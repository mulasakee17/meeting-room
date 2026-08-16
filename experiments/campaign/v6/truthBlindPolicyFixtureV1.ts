/**
 * Truth-blind online policy — deterministic offline fixture (zero provider).
 *
 * Strict two-sided information isolation:
 *   - `TruthBlindPolicyVisiblePacketV1` carries ONLY the online-visible inputs:
 *     the truth-blind risk, the eligible candidates, the budget, and the frozen
 *     policy id. It never carries outcome / truth / correctAnswer / resolver /
 *     loss.
 *   - `TruthBlindEvaluatorOnlyEnvelopeV1` is built only AFTER the decision
 *     completes, from a synthetic outcome and a frozen utility contract. Its
 *     `preActionReferenceLoss` is the pre-action pooled loss — a reference only,
 *     never a governance-effect comparison. The envelope is never passed into
 *     the selection path and never captured by a closure the selection path
 *     could read.
 *
 * Four frozen scenarios exercise eligibility -> source-novelty arbitration.
 * certainty-only, disagreement-only, and random comparators are computed by
 * deterministic baseline functions (random uses a frozen, replayable seed).
 *
 * Everything here is a DETERMINISTIC FIXTURE — it claims no experiment result,
 * no accuracy gain, and no governance efficacy.
 */

import { createHash } from "node:crypto";
import {
  SOURCE_NOVELTY_ACTION_POLICY_V1,
  evaluateActiveInformationEligibilityV1,
  projectOnlineEpistemicRiskV1,
  selectEligibleTruthBlindInformationActionV1,
  type ActiveInformationActionCandidateV1,
  type ActiveInformationEligibilityDecisionV1,
  type ActiveInformationEligibilityPolicyV1,
  type OnlineEpistemicRiskV1,
  type TruthBlindActionDecisionV1,
} from "../../../src/lib/governance";
import {
  projectCollectiveEpistemicStateV1,
  type BeliefReport,
  type EpistemicClaim,
  type EpistemicEvidence,
} from "../../../src/lib/epistemic";
import { mulberry32 } from "../../../src/lib/utils/statsUtils";

export const TRUTH_BLIND_POLICY_FIXTURE_LABEL = "DETERMINISTIC FIXTURE" as const;
export const TRUTH_BLIND_POLICY_FIXTURE_UTILITY_CONTRACT = Object.freeze({
  id: "swarmalpha.utility.binary-proper-loss",
  version: "1.0.0",
});

export interface TruthBlindPolicyVisiblePacketV1 {
  policyRef: { id: string; version: string };
  risk: OnlineEpistemicRiskV1;
  candidates: ActiveInformationActionCandidateV1[];
  availableBudget: { computeUnits: number; latencyUnits: number };
  contentHash: string;
}

export interface TruthBlindEvaluatorOnlyEnvelopeV1 {
  claimId: string;
  syntheticOutcome: boolean;
  utilityContractRef: { id: string; version: string };
  observedDecisionHash: string;
  /** Pre-action pooled reference loss; never a governance-effect comparison. */
  preActionReferenceLoss: number;
}

export type TruthBlindPolicyBaselineKind = "certainty_only" | "disagreement_only" | "random";

export interface TruthBlindPolicyFixtureScenarioV1 {
  scenarioId: string;
  label: typeof TRUTH_BLIND_POLICY_FIXTURE_LABEL;
  policyVisiblePacket: TruthBlindPolicyVisiblePacketV1;
  eligibility: ActiveInformationEligibilityDecisionV1;
  decision: TruthBlindActionDecisionV1;
  evaluatorOnlyEnvelope: TruthBlindEvaluatorOnlyEnvelopeV1;
  baseline: {
    kind: TruthBlindPolicyBaselineKind;
    selectedActionId: string | null;
    randomSeed?: number;
  };
}

function canonicalize(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("fixture values must be finite");
    return value;
  }
  if (typeof value !== "object") throw new Error("fixture values must be JSON data");
  if (ancestors.has(value)) throw new Error("fixture values must not contain cycles");
  const next = new Set(ancestors);
  next.add(value);
  if (Array.isArray(value)) return value.map(entry => canonicalize(entry, next));
  const object = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(object).sort().map(key => [key, canonicalize(object[key], next)]));
}
function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
function hashCanonical(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value), "utf8").digest("hex")}`;
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

const FIXTURE_CLAIM: EpistemicClaim = {
  id: "claim:truth-blind-fixture",
  proposition: "The critical operation should proceed as proposed.",
  domain: "fixture",
  createdAt: "2026-08-13T00:00:00.000Z",
  resolutionPolicy: { kind: "binary", resolverId: "offline-synthetic-only" },
};

const FIXTURE_ELIGIBILITY_POLICY: ActiveInformationEligibilityPolicyV1 = Object.freeze({
  id: "swarmalpha.policy.eligibility.source-novelty-fixture",
  version: "1.0.0",
  authority: "randomized_experiment_only",
  sourceConcentrationThreshold: 0.8,
  disagreementThreshold: 0.5,
  promptSensitivityThreshold: 0.5,
});

function evidence(id: string, lineageId: string): EpistemicEvidence {
  return {
    id, content: id, createdAt: "2026-08-13T00:00:00.000Z",
    provenance: { sourceKind: "dataset", sourceId: `source:${id}`, contentHash: `sha256:${id}`, lineageId },
  };
}

function report(id: string, agentId: string, probability: number, evidenceId: string): BeliefReport {
  return {
    id, claimId: FIXTURE_CLAIM.id, agentId, round: 1,
    value: { kind: "binary", probability }, evidence: [{ evidenceId, relation: "supports" }], stake: 0,
    createdAt: "2026-08-13T00:00:01.000Z",
  };
}

function candidate(input: Partial<ActiveInformationActionCandidateV1> & { id: string }): ActiveInformationActionCandidateV1 {
  const { id, ...overrides } = input;
  return {
    id, claimId: FIXTURE_CLAIM.id, eligibilityDecisionId: "eligibility:fixture-1",
    actionRef: { id: "action:fixture", version: "1.0.0" },
    targetIds: [`target:${id}`], sourceDistinctness: "unknown_relation",
    sourceRelationRefs: [], informationAccess: "new_external_observation",
    expectedObservationKinds: ["evidence"], cost: { computeUnits: 1, latencyUnits: 1 },
    available: true, ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Deterministic baselines (operate on the packet only; never on truth)
// ---------------------------------------------------------------------------

export function certaintyOnlyBaselineV1(input: {
  risk: OnlineEpistemicRiskV1;
  candidates: ActiveInformationActionCandidateV1[];
  availableBudget: { computeUnits: number; latencyUnits: number };
  certaintyThreshold: number;
}): { selectedActionId: string | null } {
  const disagreement = input.risk.dimensions.promptConditionedDisagreement;
  // Legacy certainty-triggered rule: act only when the group's reported
  // certainty is low (high disagreement); otherwise abstain.
  const certaintyLow = disagreement.status === "available" && disagreement.value >= input.certaintyThreshold;
  if (!certaintyLow) return { selectedActionId: null };
  const admissible = input.candidates
    .filter(candidate => candidate.available
      && candidate.cost.computeUnits <= input.availableBudget.computeUnits
      && candidate.cost.latencyUnits <= input.availableBudget.latencyUnits)
    .sort((a, b) => a.cost.computeUnits - b.cost.computeUnits || a.id.localeCompare(b.id));
  return { selectedActionId: admissible[0]?.id ?? null };
}

export function disagreementOnlyBaselineV1(input: {
  risk: OnlineEpistemicRiskV1;
  candidates: ActiveInformationActionCandidateV1[];
  availableBudget: { computeUnits: number; latencyUnits: number };
  disagreementThreshold: number;
}): { selectedActionId: string | null } {
  const disagreement = input.risk.dimensions.promptConditionedDisagreement;
  if (disagreement.status !== "available" || disagreement.value < input.disagreementThreshold) {
    return { selectedActionId: null };
  }
  const admissible = input.candidates
    .filter(candidate => candidate.available
      && candidate.cost.computeUnits <= input.availableBudget.computeUnits
      && candidate.cost.latencyUnits <= input.availableBudget.latencyUnits)
    .sort((a, b) => a.cost.computeUnits - b.cost.computeUnits || a.id.localeCompare(b.id));
  return { selectedActionId: admissible[0]?.id ?? null };
}

export function randomComparatorBaselineV1(input: {
  seed: number;
  candidates: ActiveInformationActionCandidateV1[];
  availableBudget: { computeUnits: number; latencyUnits: number };
}): { selectedActionId: string | null } {
  const admissible = input.candidates.filter(candidate => candidate.available
    && candidate.cost.computeUnits <= input.availableBudget.computeUnits
    && candidate.cost.latencyUnits <= input.availableBudget.latencyUnits);
  if (admissible.length === 0) return { selectedActionId: null };
  const rng = mulberry32(input.seed >>> 0);
  const draw = Math.floor(rng() * admissible.length);
  return { selectedActionId: admissible[draw].id };
}

// ---------------------------------------------------------------------------
// Scenario construction
// ---------------------------------------------------------------------------

interface ScenarioInputV1 {
  scenarioId: string;
  lineages: string[];
  reportProbabilities: number[];
  consequenceLevel: "low" | "moderate" | "high" | "critical";
  candidates: ActiveInformationActionCandidateV1[];
  availableBudget: { computeUnits: number; latencyUnits: number };
  syntheticOutcome: boolean;
  baseline: {
    kind: TruthBlindPolicyBaselineKind;
    randomSeed?: number;
  };
}

function baselineResult(
  input: ScenarioInputV1,
  risk: OnlineEpistemicRiskV1,
  eligibleCandidates: ActiveInformationActionCandidateV1[],
): { selectedActionId: string | null } {
  if (input.baseline.kind === "certainty_only") {
    return certaintyOnlyBaselineV1({
      risk, candidates: eligibleCandidates, availableBudget: input.availableBudget, certaintyThreshold: 0.7,
    });
  }
  if (input.baseline.kind === "disagreement_only") {
    return disagreementOnlyBaselineV1({
      risk, candidates: eligibleCandidates, availableBudget: input.availableBudget, disagreementThreshold: 0.5,
    });
  }
  return randomComparatorBaselineV1({
    seed: input.baseline.randomSeed ?? 0,
    candidates: eligibleCandidates,
    availableBudget: input.availableBudget,
  });
}

function buildScenario(input: ScenarioInputV1): TruthBlindPolicyFixtureScenarioV1 {
  const items = input.lineages.map((lineage, index) => evidence(`e${index}`, lineage));
  const reports = input.reportProbabilities.map((probability, index) =>
    report(`r${index}`, `a${index}`, probability, `e${index}`));
  const collectiveState = projectCollectiveEpistemicStateV1({
    claim: FIXTURE_CLAIM, reports, evidence: items, exposures: [], asOfRound: 1,
  });
  const risk = projectOnlineEpistemicRiskV1({
    collectiveState,
    consequence: { level: input.consequenceLevel, contractRef: { id: "contract:fixture-stakes", version: "1.0.0" } },
  });

  // Eligibility: only candidates matching a frozen risk reason enter arbitration.
  const eligibility = evaluateActiveInformationEligibilityV1({
    id: "eligibility:fixture-1",
    risk,
    candidates: input.candidates,
    policy: FIXTURE_ELIGIBILITY_POLICY,
    sourceRelationAuthorityIds: [...new Set(input.candidates.flatMap(candidate => candidate.sourceRelationRefs))],
  });
  const eligibleCandidates = input.candidates.filter(candidate =>
    eligibility.eligibleCandidateIds.includes(candidate.id));

  const decision = selectEligibleTruthBlindInformationActionV1({
    risk,
    candidates: input.candidates,
    eligibility,
    availableBudget: input.availableBudget,
  });

  const packetBody = {
    policyRef: { id: SOURCE_NOVELTY_ACTION_POLICY_V1.id, version: SOURCE_NOVELTY_ACTION_POLICY_V1.version },
    risk,
    candidates: eligibleCandidates,
    availableBudget: input.availableBudget,
  };
  const policyVisiblePacket: TruthBlindPolicyVisiblePacketV1 = {
    ...packetBody, contentHash: hashCanonical(packetBody),
  };

  // Evaluator-only reveal happens strictly after the decision; the synthetic
  // outcome and utility contract never touch the selection path above.
  const pooled = reports.reduce((sum, r) => sum + (r.value as { probability: number }).probability, 0) / reports.length;
  const preActionReferenceLoss = (pooled - (input.syntheticOutcome ? 1 : 0)) ** 2;
  const evaluatorOnlyEnvelope: TruthBlindEvaluatorOnlyEnvelopeV1 = {
    claimId: FIXTURE_CLAIM.id,
    syntheticOutcome: input.syntheticOutcome,
    utilityContractRef: { ...TRUTH_BLIND_POLICY_FIXTURE_UTILITY_CONTRACT },
    observedDecisionHash: decision.contentHash,
    preActionReferenceLoss,
  };
  const baseline = baselineResult(input, risk, eligibleCandidates);
  return deepFreeze({
    scenarioId: input.scenarioId,
    label: TRUTH_BLIND_POLICY_FIXTURE_LABEL,
    policyVisiblePacket,
    eligibility,
    decision,
    evaluatorOnlyEnvelope,
    baseline: {
      kind: input.baseline.kind,
      selectedActionId: baseline.selectedActionId,
      ...(input.baseline.randomSeed !== undefined ? { randomSeed: input.baseline.randomSeed } : {}),
    },
  });
}

export function createTruthBlindPolicyFixtureV1(): TruthBlindPolicyFixtureScenarioV1[] {
  const sharedLineage = ["lineage:shared", "lineage:shared"];
  const distinctLineage = ["lineage:a", "lineage:b"];
  const scenarios: ScenarioInputV1[] = [
    {
      scenarioId: "scenario-a-shared-lineage-new-observation",
      lineages: sharedLineage, reportProbabilities: [0.9, 0.85], consequenceLevel: "moderate",
      candidates: [
        candidate({ id: "reanalysis", sourceDistinctness: "same_declared_lineage", sourceRelationRefs: ["relation:shared"], informationAccess: "public_reanalysis_only", expectedObservationKinds: ["belief_report"], cost: { computeUnits: 0, latencyUnits: 0 } }),
        candidate({ id: "new-observation", sourceDistinctness: "verified_distinct_identity", sourceRelationRefs: ["verification:ext"], informationAccess: "new_external_observation", cost: { computeUnits: 3, latencyUnits: 3 } }),
      ],
      availableBudget: { computeUnits: 3, latencyUnits: 3 },
      syntheticOutcome: true,
      baseline: { kind: "certainty_only" },
    },
    {
      scenarioId: "scenario-b-high-disagreement-sources-distinct",
      lineages: distinctLineage, reportProbabilities: [0.95, 0.15], consequenceLevel: "moderate",
      candidates: [
        candidate({ id: "second-tool", sourceDistinctness: "verified_distinct_identity", sourceRelationRefs: ["verification:t2"], informationAccess: "new_external_observation", expectedObservationKinds: ["evidence"], cost: { computeUnits: 2, latencyUnits: 2 } }),
        candidate({ id: "first-tool", sourceDistinctness: "verified_distinct_identity", sourceRelationRefs: ["verification:t1"], informationAccess: "new_external_observation", expectedObservationKinds: ["evidence"], cost: { computeUnits: 2, latencyUnits: 2 } }),
      ],
      availableBudget: { computeUnits: 2, latencyUnits: 2 },
      syntheticOutcome: false,
      baseline: { kind: "disagreement_only" },
    },
    {
      scenarioId: "scenario-c-high-consequence-all-over-budget",
      lineages: distinctLineage, reportProbabilities: [0.8, 0.7], consequenceLevel: "critical",
      candidates: [
        candidate({ id: "expensive-tool", sourceDistinctness: "verified_distinct_identity", sourceRelationRefs: ["verification:exp"], informationAccess: "new_external_observation", expectedObservationKinds: ["evidence"], cost: { computeUnits: 20, latencyUnits: 20 } }),
      ],
      availableBudget: { computeUnits: 5, latencyUnits: 5 },
      syntheticOutcome: true,
      baseline: { kind: "random", randomSeed: 17 },
    },
    {
      scenarioId: "scenario-d-cheap-reanalysis-vs-new-tool",
      lineages: sharedLineage, reportProbabilities: [0.8, 0.8], consequenceLevel: "moderate",
      candidates: [
        candidate({ id: "free-reanalysis", sourceDistinctness: "declared_distinct_identity", sourceRelationRefs: ["relation:r"], informationAccess: "public_reanalysis_only", expectedObservationKinds: ["belief_report"], cost: { computeUnits: 0, latencyUnits: 0 } }),
        candidate({ id: "new-tool", sourceDistinctness: "declared_distinct_identity", sourceRelationRefs: ["relation:r"], informationAccess: "new_external_observation", expectedObservationKinds: ["evidence"], cost: { computeUnits: 4, latencyUnits: 4 } }),
      ],
      availableBudget: { computeUnits: 4, latencyUnits: 4 },
      syntheticOutcome: true,
      baseline: { kind: "random", randomSeed: 5 },
    },
  ];
  return scenarios.map(buildScenario);
}
