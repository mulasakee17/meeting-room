# Operational Outcome Vertical Slice — Gap Audit

Date: 2026-08-10
Purpose: fact inventory + adversarial test spec for the next high-risk core
implementation (Codex-owned). No core is implemented here.
Budget ceiling: USD 2.00 (unused; no paid or real LLM run).

Highest authority theory:
`docs/theory/SWARMALPHA_V6_THEORY_CLOSURE_2026-08-10.md` (§4.2, §6, §11).

This document is grounded in the current working tree, not in historical
completion claims. Every "exists" statement below was verified against code.

---

## 0. Executive summary

- **The theory now requires an ITT primary endpoint — operational pooled Brier
  loss — that the frozen code does not implement.** Current
  `FinalClaimOutcome.pooledProperLoss` is an answered-only (available-case) pool
  and must be demoted to a secondary/sensitivity result (§4.2).
- **π0 (claim-specific frozen reference distribution) does not exist anywhere in
  code.** Its canonical owner and its missingness-estimand semantics are
  un-decided — these are stop conditions that must return to Codex (see §7).
- **A dual scalar authority already exists at the schema-5 boundary**:
  `taskOutcome` (pooled-decision accuracy) is the only schema-5 scalar today;
  operational pooled Brier is required as the primary ITT endpoint. Their
  relationship is undefined and must be decided, not invented here.
- **The thin production vertical slice is almost entirely un-wired**: the
  Runner still writes schema 4, uses legacy `createRunAssignment`, never calls
  `preparePrimaryAssignedRunV1`, and never runs final private elicitation.
  Kernel objects and verifiers exist for most pieces; the Runner is the missing
  bridge.
- **Stop/go**: STOP for implementation. This audit returns four decisions to
  Codex (π0 owner, missingness estimand, schema-5 scalar relationship, Runner
  lifecycle change) and leaves the test matrix as a spec only.

---

## 1. Operational outcome gap

Theory §4.2:

```text
p̃_i = reported probability,  if terminal status = answered
     = π0,c,                  if terminal status = abstained/invalid/unavailable
p_operational = (1 / N_registered) Σ_i p̃_i
```

Four terminal statuses stay distinct; the numeric fallback is the operational
estimand, not a semantic collapse.

### Q1. Exact computation semantics of `FinalClaimOutcome.pooledProperLoss`

In `src/lib/experimentation/finalOutcome.ts` → `computeClaimOutcomes`
(lines 554–627):

- `reports` = one `BeliefReport` per expected agent **only when that agent's
  terminal record has a report for the claim** (non-answered records carry empty
  `reports`), i.e. **answered-only**.
- `pooledBelief = equalWeightLinearPool({ claim, latestReports: reports,
  abstainedAgentIds: missingAgentIds })` where `missingAgentIds =
  expectedAgentIds - answeredAgentIds` (the union of all non-answered).
- `pooledProperLoss = pooledBelief.status === "available"
  ? scoreBeliefReport(claim, { claimId, value: pooledBelief.value, stake: 0 },
  resolution, registry).properLoss : null`.

So `pooledProperLoss` = proper loss of the equal-weight linear pool over
**answered reports only**, with every non-answered agent excluded (passed as
abstained). It is an available-case pooled loss.

### Q2. How `missingAgentIds`, `excludedAgentIdsByStatus`, `abstainedAgentIds` enter aggregation

- `missingAgentIds` = all non-answered expected agents (status-undifferentiated)
  → passed as `abstainedAgentIds` to `equalWeightLinearPool` (which only
  asserts they have no active report, then excludes them).
- `excludedAgentIdsByStatus = { abstained, invalid, unavailable }` is computed
  from record statuses but is **informational only** — it never enters scoring
  or pooling.
- `reportCoverage = reports.length / expectedAgentIds.length`.

Conclusion: the status breakdown is recorded and reported, but the **pool
cannot distinguish abstained/invalid/unavailable** — all are treated identically
as "not answered" and excluded. There is no π0 imputation anywhere.

### Q3. Does the current implementation exclude non-answered agents instead of pooling at π0?

**Yes.** Non-answered agents are excluded from the pool entirely. No reference
distribution is substituted. This is precisely the answered-only pool the theory
demotes to secondary.

### Q4. If every agent is non-answered

`reports = []` → `pooledBelief.status = "unavailable"` (reason
`no_active_reports`) → `pooledDecision` = abstained (`pool_unavailable`) →
`pooledProperLoss = null`, `pooledDecisionMatchesResolution = null`,
`meanIndividualProperLoss = null`, `reportCoverage = 0`.
`projectFinalOutcomeTaskRecord` → `fullyObserved = false` → `taskOutcome.status
= "unresolved"`, `quality = null`.

Under the operational estimand, an all-unanswered run would instead produce
`p_operational = π0` for every claim and a finite operational Brier against the
resolution. The current code returns `null`/`unresolved`.

### Q5. Which contract/function computes binary vs categorical proper loss

`scoreBeliefReport(claim, report, resolution, registry)`
(`src/lib/epistemic/scoring.ts:29`) delegates to
`contract.properLoss(claim, report.value, resolution)` on the registered belief
contract:
- binary: `(p - [resolution.outcome ? 1 : 0])^2`
  (`src/lib/epistemic/contracts.ts`, `binaryContract.properLoss`);
- categorical: `Σ_k (p_k - 1[y=k])^2` over canonical options
  (`categoricalContract.properLoss`).

The registry is `defaultBeliefContractRegistry` (or an injected registry,
snapshot-sealed in `FinalOutcomeSession`).

### Q6. Most plausible authoritative owner of π0

Candidates (order of naturalness, not a decision):

1. **`GovernanceStudyContract`** — frozen pre-assignment, already anchors the
   Stage-1 design + preregistration; a claim-indexed `π0` map (or a
   `referenceDistributionRef` per claim) could live here. Matches the theory's
   "frozen before assignment" requirement.
2. **`FinalElicitationContractV1`** — the outcome contract already freezes
   `aggregationRef`/`decisionRef`; per-claim π0 could be added alongside.
   Smallest change surface at the outcome layer, but the study (not the
   measurement contract) is the natural pre-assignment owner.
3. **A new versioned `OperationalEstimandContract`** (does not exist) referenced
   by the study — cleanest separation (estimand ≠ protocol), largest surface.
4. **`EpistemicClaim` itself** (claim-owned prior) — conflates task definition
   with measurement design; weakest choice.

The quantity registry (`src/lib/epistemic/quantityContracts.ts`) could register
π0 as a versioned quantity, but registry lookup alone does not make it the
frozen owner.

### Q7. Which artifacts can already hold π0; which cannot

- `GovernanceStudyContract` — **can** (new optional field), frozen pre-assignment.
- `FinalElicitationContractV1` — **can** (new optional per-claim ref).
- `PrimaryAssignmentDesignV1` — technically can carry a ref, but it is arm- and
  design-scoped; π0 is claim-scoped. Not natural.
- `FinalOutcomeArtifactV1` — **must carry the π0 actually used** (for replay),
  but must NOT be the definitional owner (it is the output; post-hoc replacement
  risk).
- **Nothing today can hold π0** — the concept does not exist in the codebase.

### Q8. Construct operational parts before or after resolution

- π0 is **frozen before assignment** (definitional, not derived).
- The mapping `p̃_i = answered ? report : π0` is a pure function of terminal
  records + frozen π0 and can be computed **before resolution**.
- The operational Brier loss needs resolution `y` → **after resolution**.
- Theory causal order (§6.5): terminal private reports → resolution → operational
  outcome `Y`. So pool construction is pre-resolution; the loss is post-resolution.

### Q9. How to prevent post-hoc replacement of π0 / records / resolution / pooled result

- π0: freeze in a versioned contract referenced by the study; artifact carries
  the ref; verifier cross-checks the artifact's claimed π0 against the frozen
  contract (ref + canonical value match).
- Terminal records: already replay-safe (`validateFinalOutcomeArtifact` reparses
  `rawResponse` and requires status/parse/diagnostic/reports to match).
- Resolution: already replay-safe (metadata match, sequence, resolverId).
- Pooled result: `validateFinalOutcomeArtifact` recomputes `computeClaimOutcomes`
  and compares `stableJson`. **If π0 enters `computeClaimOutcomes`, the frozen π0
  must become a replay input** (pass it explicitly), otherwise the recompute
  would use a replaced π0.
- Operational Brier persisted at the schema-5 boundary must be re-derivable from
  the artifact + frozen π0; the verifier must cross-check, not trust the persisted
  scalar.

### Q10. Can the schema-5 verifier validate this outcome today

**Partially, and only the current answered-only artifact.** `replayVerifier.ts`
(`verifyFinalOutcomeV5`-style gate) validates `finalOutcome` presence/shape/run
mismatch and the `taskOutcome` source/evaluation/projection. It knows nothing
about π0 or an operational pooled Brier. A π0-based operational endpoint would
require new stable issue codes and a new cross-check (currently absent).

### Q11. Which existing types/fields could form a second authority

- `TaskOutcomeRecord` at the schema-5 boundary is the **pooled-decision
  accuracy** scalar. If operational pooled Brier also becomes a persisted schema-5
  scalar without a defined relationship, there are **two outcome scalars** claiming
  authority. The theory says accuracy is secondary (§4.3.1) and Brier is primary.
- `meanIndividualProperLoss` / answered-only `pooledProperLoss` are in the
  artifact; if any analysis path treats them as the primary ITT result, that is
  the dual-authority risk the theory names.
- Legacy `applicationReceipts`/`proximalOutcomes` are already forbidden on
  schema 5 (no second authority there).

### Q12. Three implementation-location options (compare boundaries/risk only)

| Option | Boundary | Risk |
|---|---|---|
| **A. Extend `FinalOutcomeSession`/`computeClaimOutcomes`** to also emit an operational pool + Brier (π0 passed as a frozen input; artifact carries `pi0Ref`). | Single outcome chain; replay covers it; smallest end-to-end. | Touches the frozen outcome contract (theory allows "or equivalently modify the frozen outcome contract"); π0 must be a replay input; answered-only fields must be kept and explicitly marked secondary. |
| **B. New versioned `operationalOutcome.ts` analyzer** consuming `FinalOutcomeArtifact` + frozen π0 contract + resolution → operational Brier artifact; keep `FinalOutcome` frozen. | No contract change; versioned analyzer; answered-only stays untouched. | New artifact + new verifier cross-check; second-authority risk unless wired as THE primary scalar; needs a persisted operational result. |
| **C. π0 anchored in `GovernanceStudyContract` + a thin projection at the schema-5 boundary** only. | π0 owner is the study (frozen pre-assignment), matching theory. | Projection-only (no persisted pooled operational value); verifier must recompute; study-contract change. |

Codex decides A/B/C; this audit does not.

---

## 2. Thin production vertical slice

Target order (theory §11 V1): frozen study → Stage-1 assignment → arm execution
binding → one task adapter → T/B/G execution → final private elicitation →
elicitation close → resolution → operational scoring → schema-5 artifact →
replay verification.

Legend: **K** = kernel implemented; **P** = production wired (Runner calls);
**C** = schema carrier defined; **V** = verifier validates; **F** = test fixture
only; **D** = documented but no code.

| Step | Current production entry | Existing objects | Runner calls it? | Inputs | Outputs | Next consumer | Missing bridge | Dual authority | Timing risk |
|---|---|---|---|---|---|---|---|---|---|
| Frozen study | none | `GovernanceStudyContract` + validator (**K**) | No | — | study object | guard/verifier | Runner never constructs/validates a study | none | — |
| Stage-1 assignment | `preparePrimaryAssignedRunV1` (`experiments/campaign/primaryAssignedRun.ts`, **K/F**) | `PrimaryAssignmentV1`, manifest store (**K**) | **No** — Runner uses legacy `createRunAssignment` (`Runner.ts:370,525`) | study + design + stratum + masterSeed | manifest (+ file) | binding resolver / schema-5 carrier | Runner switch to `preparePrimaryAssignedRunV1` | legacy `treatmentAssignment` vs Stage-1 manifest (**resolved by schema-5 gate**) | must precede provider; currently not invoked |
| Arm execution binding | `resolvePrimaryArmExecutionBindingV1` + binding store (**K/F**) | `PrimaryArmExecutionRegistryV1`, `PrimaryArmExecutionBindingV1` (**K**) | **No** | manifest + registry | binding (+ file) | Runner execution config | Runner wiring; registry construction from study design | none (single authority) | binding must precede provider |
| One task adapter | none | `tasks/legacyAdapter.ts` (**K**, used by Runner); `hiddenbench/adapter.ts` | Runner uses `taskConfigToBundle` | task config | `PromptTask` + `scoringTask` | Runner prompt/scoring | a production source-event/observation adapter (F6) | legacy task config → bundle (single path) | truth isolation (WP1) enforced at loader |
| T/B/G execution | `engine.run` (legacy `DiscussionEngine`/`NativeCognitiveEngine`) (**P**) | discussion engine, governance engine | **Yes** (`Runner.ts:649`) | agents + task | round results | elicitation | B arm forces per-round claim+prob+evidence; G enables frozen eligibility | legacy governance engine vs kernel decision engine (**not connected**) | governance actions are legacy, not schema-5 auditable |
| Final private elicitation | `collectFinalElicitationV1` + adapter (**K/F**) | `FinalOutcomeSession`, `FinalElicitationCollectionArtifactV1` (**K**) | **No** | agent views + contract + claims | collection artifact | outcome session | Runner never builds views nor calls collector | collection is optional/reserved (F8), not yet schema-5 | must follow discussion completion; truth-free request (verified) |
| Elicitation close | `session.closeElicitation` (**K**) | — | **No** | terminal records | closed session | resolution | Runner wiring | none | close requires all terminal records |
| Resolution | `session.resolveClaims` (**K**) | `ClaimResolution` (**K**) | **No** | scoring task (private field) | resolutions | scoring | Runner wiring | none | resolution after close only (enforced) |
| Operational scoring | **does not exist** | answered-only `pooledProperLoss` (**K**) | — | — | — | — | π0 + operational pool (Part 1) | answered-only vs operational (unresolved) | loss only after resolution |
| Schema-5 artifact | **no writer** | `AuditableRawRunDataV5` (**C**), verifier gates (**V**) | **No** | all carriers | schema-5 raw | replay | schema-5 writer + atomic persistence (F8) | legacy treatment fields forbidden on schema 5 (**V**) | verifier cross-checks Stage-1 + finalOutcome + taskOutcome |
| Replay verification | `verifyRawRunData` (**V**) | Stage-1 gate, final-outcome gate (**V**) | verify CLI only | raw file | issues/status | analysis | operational-outcome cross-check (absent) | — | — |

### Timing risks in the current code

- **pre-provider**: `preparePrimaryAssignedRunV1` exists but is never called; the
  legacy manifest path (`loadOrCreateRunAssignmentManifest`) IS persisted before
  `engine.run`/`runHiddenBenchProtocol` (`Runner.ts` ordering is already correct
  for the legacy path). Switching to Stage-1 must preserve manifest-before-provider.
- **truth firewall**: `scoreHiddenBenchTranscript` receives `scoringTask` only
  after protocol execution (WP1, verified); final elicitation request is
  truth-free (verified in `final-elicitation-adapter.test.ts`).
- **assignment-before-execution**: legacy path creates assignment before
  `engine.run`; Stage-1 binding must be resolved before any provider call — no
  Runner code does this yet.

---

## 3. Adversarial test specs (spec only — no tests written)

### A. Operational pool

| # | Test name | Minimal fixture | Tamper / condition | Expected result | Stable issue code (suggested) | Public boundary | Red-zone? |
|---|---|---|---|---|---|---|---|
| A1 | partial answered + abstained | one claim, 3 expected agents: 2 answered, 1 abstained | assert operational pool uses answered=actual, abstained=π0, denominator=3 | `p_operational=(p1+p2+π0)/3`; finite operational Brier; statuses still distinct | `operational_pool_mismatch` | operational analyzer / outcome contract | yes (new core) |
| A2 | invalid and unavailable keep distinct identity | 1 invalid, 1 unavailable, 1 answered | assert invalid≠unavailable in pool composition report while both fall back to π0 numerically | excluded sets stay separate; numeric fallback identical | `operational_status_collapse` | operational analyzer | yes |
| A3 | π0 not frozen | no π0 registered for claim | construct operational artifact | fail closed | `missing_operational_prior` | study/estimand contract validator | yes |
| A4 | π0 inconsistent with claim outcome space | binary claim + 3-outcome categorical π0 | validate | reject | `operational_prior_space_mismatch` | π0 validator | yes |
| A5 | π0 replaced after assignment | frozen π0 in study; artifact claims different π0 | verify | reject | `operational_prior_replaced` | schema-5 operational gate | yes |
| A6 | categorical π0 key order/content tampered | categorical π0; reorder keys or change a mass | replay | reject | `operational_prior_tampered` | operational replay | yes |
| A7 | all-unanswered run | 0 answered, N registered | assert `p_operational=π0` per claim; Brier finite | finite operational Brier; not null/unresolved | `operational_all_unanswered` | operational analyzer | yes |
| A8 | answered-only vs operational not conflated | one run; both computed | assert two fields distinct; answered-only marked secondary | two scalars with distinct names/refs | `operational_secondary_confusion` | outcome contract / verifier | yes |
| A9 | outcome references other run/study/assignment | artifact with mismatched runId/studyRef/assignmentId | schema-5 verify | reject | `operational_outcome_run_mismatch` (and study/assignment variants) | schema-5 gate | yes |
| A10 | treatment-dependent missingness must not shrink registered denominator | 1 agent unavailable due to governance action; N registered | assert denominator stays N_registered | pool unchanged denominator | `operational_denominator_shrunk` | operational analyzer | yes |

### B. Runner timing

| # | Test name | Minimal fixture | Condition | Expected result | Stable issue code (suggested) | Public boundary | Red-zone? |
|---|---|---|---|---|---|---|---|
| B1 | provider before assignment/binding | config + mock LLM; Stage-1 manifest absent | run | fail before any provider call | `provider_before_stage1_assignment` | Runner guard | yes |
| B2 | final elicitation before discussion completion | session with requestedAt < discussionCompletedAt | collect | reject | `final_elicitation_before_discussion` | collect boundary (exists) | yes |
| B3 | resolution before all terminal records | close with missing agent | reject | fail closed | `resolution_before_terminal_records` | `FinalOutcomeSession.closeElicitation` | yes |
| B4 | scoring before resolution | session.score while `resolved` | reject | throw | `scoring_before_resolution` | `FinalOutcomeSession.score` | yes |
| B5 | schema-5 artifact missing operational outcome | schema-5 carrier without operational Brier | verify | issue | `missing_operational_outcome` | schema-5 gate | yes |
| B6 | retry redraws / changes arm or π0 | retry after assignment persisted; different masterSeed/stratum/π0 | run | reject, never redraw/switch | `retry_redraw` / `retry_prior_switch` | `preparePrimaryAssignedRunV1` + operational store | yes |
| B7 | legacy treatment/outcome + schema-5 both authoritative | schema-5 carrier with legacy `treatmentAssignment`/`taskOutcome` fields | verify | reject | `schema5_legacy_treatment_authority_present` (exists) + new outcome variant | schema-5 gate | yes |
| B8 | artifact written halfway then fails | store crash mid-write (temp file only) | read authoritative path | not authoritative; temp ignored | `partial_artifact_not_authoritative` | store read | yes |
| B9 | replay uses wrong rule/contract registry | replay with different rule refs / contract registry | replay | reject | `replay_registry_mismatch` | decision/outcome replay | yes |
| B10 | truth or other-agent private view leaks into elicitation request | agent A request contains groundTruth / agent B private view | collect | request truth-free; prompt has no B view | `elicitation_truth_leak` / `elicitation_private_view_leak` | `collectFinalElicitationV1` request | yes |

Note: several B cases already have coverage (B2/B3/B4 partially in
`final-outcome.test.ts`; B7 in `governance-audit-trail.test.ts`). The matrix
above is the full spec; duplicates should be avoided where coverage exists.

---

## 4. Minimal file surface (candidate — Codex decides)

**Candidate new/modified production files (each one responsibility):**
- `src/lib/experimentation/operationalOutcome.ts` (or modify
  `finalOutcome.ts` per Part-1 option A) — π0-aware operational pool + Brier;
  replayable.
- `src/lib/experimentation/operationalEstimand.ts` (option B/C) — versioned
  estimand contract carrying per-claim π0 + missingness policy.
- `src/lib/experimentation/governanceStudy.ts` — anchor frozen π0/estimand ref
  (only if Codex picks study as owner).
- `experiments/campaign/pipeline/Runner.ts` — switch legacy assignment to
  `preparePrimaryAssignedRunV1`; invoke final elicitation; construct agent views.
- `experiments/campaign/replayVerifier.ts` — operational-outcome cross-check +
  new issue codes.
- `experiments/campaign/types.ts` — schema-5 operational scalar field (only if
  persisted).

**Must remain read-only (until Codex decides):**
- `src/lib/epistemic/{aggregation,contracts,scoring}.ts` — proper-loss math.
- `src/lib/experimentation/finalOutcome.ts` — frozen outcome contract semantics
  (π0 change must be a versioned extension or explicit decision).

**Minimal public API candidates (not a decision):**
- `deriveOperationalPool(records, pi0Map, expectedAgentIds): {p̃_i, p_operational}`
- `operationalPooledBrier(p_operational, resolution): number`
- `validateOperationalPrior(pi0Map, claims): void`
- verifier cross-check `verifyOperationalOutcome(artifact, frozenPi0): void`

**Decisions Codex must own:**
1. π0 canonical owner (study vs outcome contract vs new estimand contract);
2. missingness estimand (π0 fallback semantics — uniform vs frozen design prior;
   categorical key order canonicalization);
3. relationship between answered-only scalar, pooled-decision-accuracy scalar,
   and operational Brier at the schema-5 boundary (single authority);
4. Runner lifecycle change (which entry points call the Stage-1 + elicitation
   chain; whether schema-5 writer is part of this slice or F8).

**Claude Code can pick up afterwards:** adversarial tests per §3 (once the
public boundary is frozen), doc sync, deterministic fixtures.

---

## 5. Report

### 5.1 Proposed invariants

1. `π0` is frozen before assignment and has exactly one definitional owner; the
   artifact records the ref used.
2. `p_operational` uses `N_registered` as denominator regardless of terminal
   status distribution (no treatment-dependent denominator shrinkage).
3. Answered/abstained/invalid/unavailable remain distinct identities in all
   reported fields; only the operational numeric fallback is identical.
4. Operational Brier is the primary ITT scalar; answered-only pooled loss and
   pooled-decision accuracy are secondary/sensitivity, never conflated.
5. Everything operational is replayable from frozen π0 + terminal records +
   resolution; a replaced π0/record/resolution/pool fails replay.
6. No truth or other-agent private view reaches any provider request.
7. No retry may redraw the assignment, switch the arm, or change π0.
8. Schema 5 carries exactly one treatment authority and one primary outcome
   scalar.

### 5.2 Code-grounded facts

- `pooledProperLoss` is answered-only available-case (`finalOutcome.ts:591-604`).
- Non-answered agents are excluded, never imputed with π0 (`missingAgentIds` →
  `abstainedAgentIds`, lines 574, 591-596).
- No π0 / operational pool anywhere in `src/`, `experiments/`, `test/`,
  `docs/` (verified by search; only the unrelated "operational control" strings
  exist in governance/quantity contracts).
- Runner uses `createRunAssignment` (legacy, probability-1 single arm) and never
  calls `preparePrimaryAssignedRunV1` or any final-elicitation function
  (`Runner.ts:370,525,649`).
- Schema-5 verifier gates Stage-1 + finalOutcome + taskOutcome
  (`replayVerifier.ts:344-432`, final-outcome gate) but has no operational
  cross-check.
- `AuditableRawRunDataV5` requires Stage-1 objects + finalOutcome + taskOutcome
  and forbids schema-4 treatment fields (`types.ts:417-445`).

### 5.3 Theory/code mismatches

1. Theory §4.2 requires ITT operational Brier with π0 fallback; code implements
   answered-only available-case only.
2. Theory §4.2 says answered-only/completed-case must be reported as
   sensitivity; code has no sensitivity designation.
3. Theory §4.3.1 lists pooled-decision accuracy as secondary; code exposes it as
   the only schema-5 scalar (`projectFinalOutcomeTaskRecord`).
4. Theory §11 V1 vertical slice (Runner → elicitation → resolution → schema-5)
   is un-wired; only kernel + verifier exist.

### 5.4 Red-zone decisions returned to Codex

1. **π0 canonical owner** (stop condition: "必须决定 π0 的规范所有者").
2. **Missingness estimand** (stop condition: "必须决定 missingness estimand").
3. **Schema-5 outcome scalar relationship** (dual authority found: answered-only
   `pooledProperLoss` / `taskOutcome` accuracy / required operational Brier —
   stop condition: "发现双重 outcome authority").
4. **Runner lifecycle change** (stop condition: "必须改变 Runner 生命周期").

### 5.5 Stop/go

**STOP for implementation.** This work package is spec + inventory only. The
four decisions above must be made by Codex before any core change. No core was
modified.

### 5.6 Verification commands and results (read-only)

- `git diff --check` → exit 0 (existing LF→CRLF warnings only).
- `npx tsc --noEmit` → pass (exit 0).
- No `vitest` run was required by this work package; no tests were changed.

### 5.7 git status summary

Working tree is dirty with pre-existing user/Codex changes (119 entries):
modified campaign/source files, untracked docs/plans and docs/architecture
addenda, and the F5-era test files. Only the file written by this work package is
`docs/plans/OPERATIONAL_OUTCOME_VERTICAL_SLICE_GAP_AUDIT_2026-08-10.md`.

### Declarations

- No file outside the single allowlisted output was modified.
- No production code or test was modified.
- No real or paid LLM was run.
- No `git add`/`commit`/`reset`/`checkout`/`clean` was executed.
- Decisions returned to Codex: π0 owner, missingness estimand, schema-5 outcome
  scalar authority, Runner lifecycle change (see §5.4).
