# Operational Outcome Wiring — Gap Audit and Test Spec

Date: 2026-08-10
Purpose: document-truth check of `docs/architecture/OPERATIONAL_OUTCOME_V1.md`
plus a read-only wiring gap audit and adversarial test spec for its §10 items.
No production code is implemented here. Codex owns the wiring design.

## Part 1 — Document ↔ code truth check

Verified against the working tree (read-only):

| Doc §claim | Code evidence | Verdict |
|---|---|---|
| §2 `OperationalAnalysisUnitV1` is kernel | `src/lib/experimentation/operationalOutcome.ts` (create/validate/hash) | TRUE |
| §2 `PrimaryAssignmentDesignV1.primaryEstimandRef` must equal the estimand | `createOperationalOutcomeArtifactV1` `refsEqual(estimandRef, …)` | TRUE |
| §2 schema carrier not wired | no `operationalOutcome` reference in `experiments/campaign/types.ts` / `replayVerifier.ts` / `Runner.ts` | TRUE |
| §3 binary π0 = 0.5; categorical π0 = 1/K in registered order | `deriveOperationalReferenceDistributionV1` (0.5; `1/claim.options.length` over `claim.options`) | TRUE |
| §3 pooling = equal-weight over all registered agents | `averageBeliefs` over all contributions; denominator `expectedAgentIds.length` | TRUE |
| §3 Brier via registered claim contract | `scoreBeliefReport` → `contract.properLoss` | TRUE |
| §4 four statuses preserved, same numeric fallback | `terminalStatusCounts`, per-contribution `terminalStatus` + `valueSource` | TRUE |
| §5 orderings (committedAt≤assignedAt; claim createdAt≤committedAt; manifest createdAt≤discussion completed; computedAt≥scoring completed) | `createOperationalOutcomeArtifactV1` lines 429/433/439/443; `validateOperationalAnalysisUnitV1` claim-createdAt check | TRUE |
| §6 hash/replay binding; self-rehash does not survive | `validateOperationalOutcomeArtifactV1` recomputes via `createOperationalOutcomeArtifactV1` + `stableJson` | TRUE |
| §7 three scalars and roles | `FinalClaimOutcome.pooledProperLoss` (answered-only), `projectFinalOutcomeTaskRecord` (accuracy), `primaryMetric` (operational Brier) | TRUE |
| §8 kernel yes | implemented + `test/operational-outcome.test.ts` (29 tests) | TRUE |
| §8 Runner no | Runner never imports `operationalOutcome` | TRUE |
| §8 schema-5 carrier no | carrier/verifier have no field/code | TRUE |
| §8 external commitment no | no detached commitment module exists | TRUE |

**Result:** `OPERATIONAL_OUTCOME_V1.md` is factually accurate. No correction
needed. Its §10 items are un-wired, as stated.

## Part 2 — §10 wiring gap audit

Legend: **K** kernel, **F** test fixture only, **P** production wired, **C**
carrier defined, **V** verifier, **missing** no code.

| §10 item | Current entry | Existing objects | Runner calls? | Inputs | Outputs | Next consumer | Missing bridge | Dual authority | Timing risk |
|---|---|---|---|---|---|---|---|---|---|
| 1. Analysis-unit production entry | none | `OperationalAnalysisUnitV1` + create/validate/hash (**K/F**) | No | runId, taskId, studyRef, primary claim, roster, committedAt | analysis unit | `createOperationalOutcomeArtifactV1` | a pre-assignment hook in the study/assignment preparation; **no analysis-unit store exists** | none today | must precede Stage-1 assignment; claim+roster must be the SAME ones that later feed elicitation (drift breaks replay) |
| 2. Production final-elicitation path | `collectFinalElicitationV1` (**K/F**) | `FinalElicitationViewV1`, adapter contract, collection artifact, `FinalOutcomeSession` | No | per-agent views + contract + claims | collection artifact → session | resolution | Runner builds views from real run data (public/private info + transcript); persists collection; feeds session | collection optional/reserved (F8) | after discussion completed, before resolution; truth-free request (verified) |
| 3. Schema-5 carrier carries + verifies operational outcome | none | `OperationalOutcomeArtifactV1` (**K**) | No | artifact | schema-5 field | verifier/analysis | add carrier field + verifier gate (new issue codes) | `taskOutcome` (accuracy) vs `operationalOutcome` (Brier) — must mark which is primary | computedAt ≥ final-outcome scoring; before schema-5 write |
| 4. Verifier cross-check replay | none | `validateOperationalOutcomeArtifactV1` (**K**) | No | artifact + frozen inputs | verified/issue | analysis | verifier recomputes operational metric from frozen study+manifest+unit+final outcome | n/a | must reject self-rehash (already kernel-tested) |

### Key risks for Codex

1. **Roster/claim drift**: the analysis-unit `expectedAgentIds`/`primaryClaim`
   must be byte-identical to those later used by `FinalOutcomeSession`. Any
   production bridge that builds them from two different sources (task adapter
   vs elicitation adapter) will produce non-replayable artifacts.
2. **π0 source**: π0 must be derived from the SAME registered claim object
   (canonical options) that enters the artifact; the bridge must not reconstruct
   the claim from a different source.
3. **Dual scalar authority**: schema-5 currently carries `taskOutcome`
   (accuracy). Adding `operationalOutcome` (Brier) without marking the primary
   relationship would re-open the dual-authority issue (theory §4.2).
4. **Pre-assignment timing**: the analysis-unit commitment must land before the
   Stage-1 manifest; the Runner's manifest-first rule is the natural anchor.

## Part 3 — Adversarial test specs (spec only, no code)

### W1. Analysis-unit production bridge

| # | Test | Fixture | Condition | Expected | Issue code (suggested) | Boundary | Red-zone? |
|---|---|---|---|---|---|---|---|
| W1.1 | unit committed after assignment | valid unit + manifest | committedAt > assignedAt | reject | `analysis_unit_after_assignment` | production entry | yes |
| W1.2 | unit roster ≠ elicitation roster | unit with agents [a,b], session expects [a,b,c] | create artifact | reject | `analysis_unit_roster_mismatch` | operational replay | yes |
| W1.3 | unit claim ≠ session claim | unit primaryClaim differs from session claim | create artifact | reject | `analysis_unit_claim_mismatch` | operational replay | yes |
| W1.4 | unit not persisted before provider | run without persisted unit | provider call | fail before provider | `analysis_unit_missing_pre_provider` | Runner guard | yes |
| W1.5 | unit store tamper self-rehash | persisted unit edited + hash recomputed | replay | reject | `analysis_unit_store_tampered` | store read | yes |

### W2. Production elicitation path

| # | Test | Fixture | Condition | Expected | Issue code (suggested) | Boundary | Red-zone? |
|---|---|---|---|---|---|---|---|
| W2.1 | elicitation before discussion complete | session requestedAt < completedAt | collect | reject | `final_elicitation_before_discussion` | collect (exists) | yes |
| W2.2 | view leaks another agent's private info | agent A view contains B's private string | collect | prompt truth/private-free | `elicitation_private_view_leak` | request | yes |
| W2.3 | adapter order ≠ precommitted roster | adapter bindings reordered | collect | reject before call | `adapter_order_mismatch` | collect | yes |
| W2.4 | provider timeout/abort | never-resolving adapter, short timeout | collect | exactly one unavailable/timeout record | n/a | collect | yes |
| W2.5 | resolution before all terminal records | close with missing agent | close | reject | `resolution_before_terminal_records` | session.close | yes |

### W3. Schema-5 carrier

| # | Test | Fixture | Condition | Expected | Issue code (suggested) | Boundary | Red-zone? |
|---|---|---|---|---|---|---|---|
| W3.1 | missing operational outcome | schema-5 carrier without it | verify | issue | `missing_operational_outcome` | schema-5 gate | yes |
| W3.2 | malformed operational outcome | carrier with tampered artifact | verify | issue | `malformed_operational_outcome` | schema-5 gate | yes |
| W3.3 | operational run mismatch | artifact runId ≠ carrier runId | verify | issue | `operational_outcome_run_mismatch` | schema-5 gate | yes |
| W3.4 | operational source mismatch | artifact sourceFinalOutcomeHash ≠ carried final outcome | verify | issue | `operational_outcome_source_mismatch` | schema-5 gate | yes |
| W3.5 | primary vs secondary conflation | carrier where accuracy treated as primary | verify/report | must mark Brier primary | `operational_primary_conflation` | schema-5 gate / analysis | yes |
| W3.6 | legacy outcome + operational both | legacy taskOutcome + operationalOutcome | verify | reject legacy authority | `schema5_legacy_treatment_authority_present` (exists) | schema-5 gate | yes |

### W4. Verifier cross-check replay

| # | Test | Fixture | Condition | Expected | Issue code (suggested) | Boundary | Red-zone? |
|---|---|---|---|---|---|---|---|
| W4.1 | metric tamper + self-rehash | artifact primaryMetric edited + contentHash recomputed | verify | reject | `operational_outcome_replay_mismatch` | verifier cross-check | yes |
| W4.2 | contributions tamper + self-rehash | contribution value edited + rehash | verify | reject | `operational_outcome_replay_mismatch` | verifier cross-check | yes |
| W4.3 | frozen π0 changed after run | verifier uses different π0 than artifact | verify | reject | `operational_prior_drift` | verifier cross-check | yes |

## Part 4 — Stop/go

**STOP for implementation.** All wiring is Codex-owned (OPERATIONAL_OUTCOME_V1.md
§10). Decisions required from Codex:

1. Where the analysis unit is built/persisted (new store vs carrier) and who
   anchors pre-assignment timing.
2. How `taskOutcome` (accuracy) and `operationalOutcome` (Brier) coexist on the
   schema-5 carrier with a declared primary.
3. Whether the production elicitation path reuses `collectFinalElicitationV1`
   as-is or needs a thin Runner adapter.
4. New schema-5 issue-code set for the operational gate.

Claude Code can subsequently pick up: the adversarial tests above (once the
public boundary is frozen), doc sync, and deterministic fixtures.

## Verification (read-only, this work package)

- `git diff --check` → exit 0 (existing CRLF warnings only).
- `npx tsc --noEmit` → pass.
- No test was changed; no production file was changed; only this document was
  written.
