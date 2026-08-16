/**
 * Post-round-1 action discovery — experiment-only always-eligible fixture.
 *
 * The vertical slice only randomizes apply/sham/holdout after the
 * HIGH_CERTAINTY_LOW_LINEAGE rule; that would confidence-select the discovery
 * sample. This fixture injects, WITHOUT modifying the production slice or any
 * schema:
 *   - an always-eligible rule (eligible whenever a valid round-1 report was
 *     monitored; no certainty threshold, no lineage check);
 *   - a cloned verification-request intervention contract (same actionRef,
 *     but authorizing only this discovery rule);
 *   - a study whose governance policy points eligibilityRuleRefs at this rule.
 *
 * A mock feasibility probe confirmed that a low-certainty round-1 report still
 * triggers an eligible event + V2 apply/sham/holdout delivery. This is
 * experiment-level wiring only; it is not confirmatory task-bank admission.
 */

import { createV6HiddenBenchSmokeFixtureV1 } from "./v6HiddenBenchSmokeFixture";
import type { V6HiddenBenchSmokeFixtureV1 } from "./v6HiddenBenchSmokeFixture";
import {
  validateInterventionContract,
  type GovernanceEligibilityRule,
  type InterventionContract,
} from "../../../src/lib/governance";

export const ALWAYS_ELIGIBLE_DISCOVERY_RULE_REF = Object.freeze({
  id: "swarmalpha.rule.always-eligible-randomized-discovery",
  version: "1.0.0",
});

export const ACTION_DISCOVERY_PROFILE = "mechanism-verdict-v2-v1" as const;
export const ACTION_DISCOVERY_VERIFIER_ID = "verifier:action-discovery";

const HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_ID = "swarmalpha.risk.high-certainty-insufficient-lineage";
const VERIFICATION_REQUEST_ACTION_REF = Object.freeze({ id: "swarmalpha.action.verification-request", version: "2.0.0" });

function stringAttribute(diagnosis: { attributes: Record<string, unknown> }, key: string): string {
  const value = diagnosis.attributes[key];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`discovery diagnosis ${key} must be non-empty`);
  return value;
}
function booleanAttribute(diagnosis: { attributes: Record<string, unknown> }, key: string): boolean {
  const value = diagnosis.attributes[key];
  if (typeof value !== "boolean") throw new Error(`discovery diagnosis ${key} must be boolean`);
  return value;
}

/**
 * Always-eligible for any G run that produced a monitored round-1 report. The
 * slice only builds the diagnosis when firstRoundReports.length > 0, so a run
 * with no valid round-1 report is naturally ineligible. No certainty threshold,
 * no lineage gate, no outcome/resolution read.
 */
export function createAlwaysEligibleDiscoveryRuleV1(): GovernanceEligibilityRule {
  return {
    ...ALWAYS_ELIGIBLE_DISCOVERY_RULE_REF,
    config: { note: "experiment-only always-eligible; no certainty threshold; no lineage gate" },
    evaluate(context) {
      const diagnosis = context.diagnoses.find(candidate =>
        candidate.diagnosisRef.id === HIGH_CERTAINTY_LOW_LINEAGE_DIAGNOSIS_ID);
      if (!diagnosis) {
        return { ruleRef: ALWAYS_ELIGIBLE_DISCOVERY_RULE_REF, eligible: false, reason: "Required diagnosis is absent (no valid round-1 report).", sourceDiagnosisIds: [] };
      }
      const claimId = stringAttribute(diagnosis, "claimId");
      stringAttribute(diagnosis, "beliefReportId");
      stringAttribute(diagnosis, "beliefKind");
      if (booleanAttribute(diagnosis, "claimResolved")) {
        return { ruleRef: ALWAYS_ELIGIBLE_DISCOVERY_RULE_REF, eligible: false, reason: "Claim is already resolved.", sourceDiagnosisIds: [diagnosis.id] };
      }
      if (!booleanAttribute(diagnosis, "verifierAvailable")) {
        return { ruleRef: ALWAYS_ELIGIBLE_DISCOVERY_RULE_REF, eligible: false, reason: "Verifier is unavailable.", sourceDiagnosisIds: [diagnosis.id] };
      }
      if (diagnosis.targetIds.length !== 1) throw new Error("discovery diagnosis must target exactly one agent");
      return {
        ruleRef: ALWAYS_ELIGIBLE_DISCOVERY_RULE_REF,
        eligible: true,
        reason: "always-eligible discovery: a valid round-1 report was monitored",
        sourceDiagnosisIds: [diagnosis.id],
        candidate: {
          actionRef: { ...VERIFICATION_REQUEST_ACTION_REF },
          targetIds: [...diagnosis.targetIds],
          sourceDiagnosisIds: [diagnosis.id],
          priority: 100,
          parameters: { claimId, verifierId: ACTION_DISCOVERY_VERIFIER_ID, matchedTokenBudget: 300 },
          expectedCost: { modelCalls: 1, tokenBudget: 300 },
          rationale: "randomized action discovery; no certainty assumption about the round-1 population",
        },
      };
    },
  };
}

/** Clone of the verification-request intervention contract that authorizes only the discovery rule. */
export function createActionDiscoveryApplyActionV1(): InterventionContract {
  const base = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId: 5, profile: ACTION_DISCOVERY_PROFILE });
  const apply = structuredClone(base.interventionContracts[0]) as InterventionContract;
  apply.eligibilityRuleRefs = [structuredClone(ALWAYS_ELIGIBLE_DISCOVERY_RULE_REF)];
  validateInterventionContract(apply);
  return apply;
}

export interface ActionDiscoveryFixtureV1 {
  base: V6HiddenBenchSmokeFixtureV1;
  rule: GovernanceEligibilityRule;
  applyAction: InterventionContract;
  study: V6HiddenBenchSmokeFixtureV1["study"];
  interventionContracts: InterventionContract[];
}

/** Build the always-eligible experiment fixture for one source task. */
export function createActionDiscoveryFixtureV1(sourceTaskId: number): ActionDiscoveryFixtureV1 {
  const base = createV6HiddenBenchSmokeFixtureV1({ sourceTaskId, profile: ACTION_DISCOVERY_PROFILE });
  const rule = createAlwaysEligibleDiscoveryRuleV1();
  const applyAction = createActionDiscoveryApplyActionV1();
  const study = structuredClone(base.study) as typeof base.study;
  const policy = structuredClone(base.study.governancePolicy) as typeof base.study.governancePolicy | undefined;
  if (!policy) throw new Error("action discovery base study lacks a governance policy");
  policy.eligibilityRuleRefs = [structuredClone(ALWAYS_ELIGIBLE_DISCOVERY_RULE_REF)];
  study.governancePolicy = policy;
  const sham = structuredClone(base.interventionContracts[1]) as InterventionContract;
  return { base, rule, applyAction, study, interventionContracts: [applyAction, sham] };
}
