/**
 * Cross-evidence exchange — experiment-side governance (disagreement rule,
 * intervention contract, and selector wiring). Zero provider cost: the exchange
 * is a deterministic evidence-injection computed from round-1 reports.
 *
 * Frozen design (owner 2026-08-15): 有治理 vs 无治理 2-arm ITT. In the governance
 * arm, a run is eligible when the round-1 max pairwise total variation is at or
 * above a frozen threshold (0.8). The exchange then surfaces each side's
 * registered supporting evidence to the group as an auditable governance message.
 */

import {
  CROSS_EVIDENCE_EXCHANGE_ACTION_REF,
  HIGH_DISAGREEMENT_DIAGNOSIS_REF,
  type CrossEvidenceSelectorInputV1,
  type CrossEvidenceSelectorV1,
} from "./productionVerticalSlice";
import {
  buildAllDisconfirmingEvidenceMessageV1,
  buildCrossEvidenceMessageV1,
  selectAllDisconfirmingEvidenceV1,
  selectCrossEvidenceV1,
  selectMaxDisagreementPairV1,
} from "./crossEvidenceExchangeSelectorsV1";
import { VERIFICATION_REQUEST_V2 } from "../../../src/lib/governance/standardEpistemicActions";
import { validateInterventionContract, type GovernanceEligibilityRule, type InterventionContract } from "../../../src/lib/governance";

export const DISAGREEMENT_EXCHANGE_RULE_REF = Object.freeze({
  id: "swarmalpha.rule.disagreement-cross-evidence-exchange",
  version: "1.0.0",
});
/** Frozen no-governance control: never eligible, so the exchange never fires. */
export const ALWAYS_INELIGIBLE_EXCHANGE_RULE_REF = Object.freeze({
  id: "swarmalpha.rule.always-ineligible-cross-evidence-exchange",
  version: "1.0.0",
});
export const DISAGREEMENT_EXCHANGE_THRESHOLD = 0.8;

function numberAttribute(diagnosis: { attributes: Record<string, unknown> }, key: string): number {
  const value = diagnosis.attributes[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`disagreement diagnosis ${key} must be a finite number`);
  return value;
}
function stringAttribute(diagnosis: { attributes: Record<string, unknown> }, key: string): string {
  const value = diagnosis.attributes[key];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`disagreement diagnosis ${key} must be non-empty`);
  return value;
}

/**
 * Eligible when the round-1 aggregate max pairwise total variation is at or
 * above the frozen threshold. The candidate is the zero-cost cross-evidence
 * exchange, targeting the monitoring-selected report's agent (the delivery is a
 * group-visible governance message; the selector picks the max-TV pair).
 */
export function createDisagreementExchangeRuleV1(threshold = DISAGREEMENT_EXCHANGE_THRESHOLD): GovernanceEligibilityRule {
  return {
    ...DISAGREEMENT_EXCHANGE_RULE_REF,
    config: { note: `experiment-side disagreement exchange; max pairwise TV >= ${threshold}; zero provider cost` },
    evaluate(context) {
      const diagnosis = context.diagnoses.find(candidate =>
        candidate.diagnosisRef.id === HIGH_DISAGREEMENT_DIAGNOSIS_REF.id);
      if (!diagnosis) {
        return { ruleRef: DISAGREEMENT_EXCHANGE_RULE_REF, eligible: false, reason: "Required disagreement diagnosis is absent.", sourceDiagnosisIds: [] };
      }
      const maxTV = numberAttribute(diagnosis, "maxPairwiseTV");
      if (maxTV < threshold) {
        return { ruleRef: DISAGREEMENT_EXCHANGE_RULE_REF, eligible: false, reason: `Max pairwise TV below disagreement threshold (${maxTV.toFixed(3)} < ${threshold}).`, sourceDiagnosisIds: [diagnosis.id] };
      }
      return {
        ruleRef: DISAGREEMENT_EXCHANGE_RULE_REF,
        eligible: true,
        reason: `Max pairwise TV at or above disagreement threshold (${maxTV.toFixed(3)} >= ${threshold}).`,
        sourceDiagnosisIds: [diagnosis.id],
        candidate: {
          actionRef: structuredClone(CROSS_EVIDENCE_EXCHANGE_ACTION_REF),
          targetIds: [...diagnosis.targetIds],
          sourceDiagnosisIds: [diagnosis.id],
          priority: 100,
          parameters: { claimId: stringAttribute(diagnosis, "claimId"), matchedTokenBudget: 0 },
          expectedCost: { modelCalls: 0, tokenBudget: 0 },
          rationale: "cross-evidence exchange on strong round-1 disagreement; deterministic, zero provider cost",
        },
      };
    },
  };
}

/**
 * Intervention contract authorizing the disagreement rule and the exchange
 * action. Cloned from the frozen verification contract so all governance
 * contract fields are valid; re-authorized to the disagreement rule, zero cost.
 * Pass an alternative `eligibilityRuleRef` only to build the matched
 * always-ineligible control (identical action, arms, and cost; the sole
 * difference is which rule is authorized to fire it).
 */
export function createCrossEvidenceExchangeContractV1(
  eligibilityRuleRef: { id: string; version: string } = DISAGREEMENT_EXCHANGE_RULE_REF,
): InterventionContract {
  const contract = structuredClone(VERIFICATION_REQUEST_V2) as InterventionContract;
  contract.id = CROSS_EVIDENCE_EXCHANGE_ACTION_REF.id;
  contract.version = CROSS_EVIDENCE_EXCHANGE_ACTION_REF.version;
  contract.label = "Cross-evidence exchange";
  contract.family = "information_exposure";
  contract.deliveryMode = "prompt";
  contract.parameterContract = {
    required: ["claimId", "matchedTokenBudget"],
    allowed: ["claimId", "matchedTokenBudget"],
  };
  contract.eligibilityRuleRefs = [structuredClone(eligibilityRuleRef)];
  contract.mediators = [{
    metricRef: { id: "swarmalpha.metric.cross-evidence-uptake", version: "1.0.0" },
    expectedDirection: "increase",
    window: { startOffset: 0, endOffset: 1 },
  }];
  contract.contraindicationCodes = ["claim_resolved"];
  contract.conflictsWithActionIds = [];
  contract.costDimensions = ["modelCalls", "tokenBudget"];
  contract.randomization = {
    unit: "eligible_event",
    applyArm: "exchange",
    holdoutArm: "holdout",
  };
  validateInterventionContract(contract);
  return contract;
}

/**
 * Matched no-governance control rule. Regardless of round-1 disagreement or any
 * other diagnosis, this never returns eligible, so the vertical slice never
 * forms an eligible event and the cross-evidence exchange never fires. It is the
 * sole runtime difference between the governance and no-governance arms.
 */
export function createAlwaysIneligibleExchangeRuleV1(): GovernanceEligibilityRule {
  return {
    ...ALWAYS_INELIGIBLE_EXCHANGE_RULE_REF,
    config: { note: "experiment-only always-ineligible; never triggers the cross-evidence exchange" },
    evaluate() {
      return {
        ruleRef: ALWAYS_INELIGIBLE_EXCHANGE_RULE_REF,
        eligible: false,
        reason: "cross-evidence-exchange no-governance arm never triggers an exchange",
        sourceDiagnosisIds: [],
      };
    },
  };
}

/**
 * Shared wiring: select the max-disagreement pair, resolve its registered
 * evidence, and build the auditable message for a frozen relation. Returns null
 * only when the round-1 state cannot form a pair (fail closed); the disagreement
 * rule guarantees >=2 categorical reports when eligible.
 */
function selectAndBuildForRelation(
  input: CrossEvidenceSelectorInputV1,
  relation: "supports" | "attacks",
): string | null {
  const pair = selectMaxDisagreementPairV1(input.round1Reports);
  if (!pair) return null;
  const evidenceRegistry = new Map<string, { evidenceId: string; content: string; contentHash: string }>();
  for (const report of input.round1Reports) {
    for (const ref of report.evidenceRefs) {
      if (evidenceRegistry.has(ref.evidenceId)) continue;
      const item = input.getEvidence(ref.evidenceId);
      if (item) evidenceRegistry.set(ref.evidenceId, { evidenceId: ref.evidenceId, content: item.content, contentHash: item.contentHash });
    }
  }
  const selection = selectCrossEvidenceV1({
    reports: input.round1Reports,
    evidenceRegistry,
    pair,
    relation,
  });
  return buildCrossEvidenceMessageV1({
    agentA: selection.agentA,
    agentB: selection.agentB,
    aEvidence: selection.aEvidence,
    bEvidence: selection.bEvidence,
    aTop: selection.aTop,
    bTop: selection.bTop,
    relation,
  });
}

/** Confirming selector (original exchange): surfaces each side's `supports` evidence. */
export function createCrossEvidenceSelectorV1(): CrossEvidenceSelectorV1 {
  return (input: CrossEvidenceSelectorInputV1): string | null => selectAndBuildForRelation(input, "supports");
}

/** Disconfirming selector (upgraded): surfaces ALL agents' `attacks` evidence, deduplicated by content hash. */
export function createDisconfirmingEvidenceSelectorV1(): CrossEvidenceSelectorV1 {
  return (input: CrossEvidenceSelectorInputV1): string | null => {
    const evidenceRegistry = new Map<string, { evidenceId: string; content: string; contentHash: string }>();
    for (const report of input.round1Reports) {
      for (const ref of report.evidenceRefs) {
        if (evidenceRegistry.has(ref.evidenceId)) continue;
        const item = input.getEvidence(ref.evidenceId);
        if (item) evidenceRegistry.set(ref.evidenceId, { evidenceId: ref.evidenceId, content: item.content, contentHash: item.contentHash });
      }
    }
    const items = selectAllDisconfirmingEvidenceV1({ reports: input.round1Reports, evidenceRegistry });
    if (items.length === 0) return null;
    return buildAllDisconfirmingEvidenceMessageV1(items);
  };
}
