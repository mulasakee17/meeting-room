# Final Private Outcome V1

Date: 2026-08-10

Status: implemented and validated at the deterministic core level, and enforced
as a required schema-5 carrier field. **Not wired into the production Runner.**
`RAW_SCHEMA_VERSION` remains `"4.0"`; no production path emits schema 5, runs the
common final private elicitation, or holds a detached truth/manifest commitment.
A truth-free per-agent adapter boundary
(`src/lib/experimentation/finalElicitationAdapter.ts`) and its collection
provenance artifact exist as a **kernel artifact only**; the production Runner
does not yet invoke them, and the collection is not a schema-5 requirement until
F8. This document is a factual statement of the implemented core, not a claim of
experimental validity.

Implementation: `src/lib/experimentation/finalOutcome.ts` and
`src/lib/experimentation/finalElicitationAdapter.ts`, exported from
`src/lib/experimentation/index.ts`.

## 1. Scientific purpose

The core scientific question requires an outcome measured after a group
discussion but independent of any correctness feedback the agents could use to
reverse-engineer the answer. The final private outcome module provides that
measurement for every arm under one shared output contract:

- it elicits each agent's final, claim-relative probability **after** the
  discussion is complete and **before** any resolution/scoring;
- it keeps each agent's response **private** to that agent (never re-enters the
  discussion, never shown to other agents);
- it forbids the truth from reaching any agent until the elicitation closes;
- it records missingness (abstention, parse failure, provider failure, timeout)
  explicitly as terminal states, never imputes a missing report as zero or as
  any other value.

This gives a common, architecture-recorded, privacy-isolated measurement surface
that is comparable across arms without leaking the resolution into the
discussion phase.

## 2. Non-claims

- This is a **report**, not a claim about latent agent belief or mental state
  ("report is not mind").
- A recorded proper loss is a **computed quantity**, not evidence that the agent
  or the group is calibrated.
- `pooledDecisionMatchesResolution` is a **structural consistency check** with
  the recorded authorized resolution, not a claim that the group's decision is
  externally correct.
- A replayable artifact proves **internal self-consistency**, not authenticity;
  a fully forged but internally consistent artifact is not detectable by replay
  alone (external commitment is a separate, still-open concern).
- The deterministic core gate is not a paid or confirmatory experiment. No real
  or paid LLM run was performed for the verified core.

## 3. Lifecycle

`FinalOutcomeSession` is a single-writer state machine. Authoritative order:

```text
discussion completed  ->  terminal elicitation records
  ->  elicitation closed  ->  authorized resolution  ->  scoring completed
```

State names: `elicitation_open` → `elicitation_closed` → `resolved` → `scored`.

- **discussion completed** (`sequence: 0`): the session constructor receives the
  discussion's end time and total rounds.
- **terminal elicitation records**: one and only one record per expected agent
  is recorded (answered, abstained, invalid, or unavailable). Each record is
  timestamped at or after the discussion-completed time.
- **elicitation closed**: requires exactly one terminal record per expected
  agent; missing any agent fails closed. The close timestamp must not precede
  any record.
- **authorized resolution**: happens only after closure. The scoring task is
  held in a JavaScript private field and is passed to the resolver only after
  every expected agent has a terminal record and the elicitation has closed.
- **scoring completed**: individual proper losses, pooled belief, pooled
  decision, pooled proper loss, coverage, and status-separated exclusions are
  computed, and the scored artifact is released.

## 4. Contract

`FinalElicitationContractV1` freezes the measurement invariants:

- `timing: "post_discussion_pre_resolution"` — measurement occurs after
  discussion, before resolution.
- `privacy: "isolated_per_agent"` — each agent's response is private.
- `feedback: "measurement_only_no_discussion_reentry"` — responses do not re-enter
  the discussion and no correctness feedback is given at elicitation time.
- `truthAccess: "forbidden_until_elicitation_closed"` — scoring truth is
  unreachable until closure.
- `missingnessPolicy: "explicit_terminal_record"` — every agent ends in one
  explicit terminal state.
- `agentOrderPolicy: "precommitted_exact_order"` — the exact isolated-agent
  elicitation order is fixed before measurement and enforced by the session.
- `requireAllClaims: true` — an answered response must cover every registered
  claim; partial coverage is rejected.
- `aggregationRef` — `EQUAL_WEIGHT_LINEAR_POOL_V1`.
- `decisionRef` — `ABSTAIN_ON_TIE_DECISION_V1` (abstain on exact tie).

The `FinalElicitationViewV1` is deliberately agent-specific: only that agent's
public context, own private information, and the discussion transcript. A
recursive truth-leak check rejects any view carrying a scoring key.

The prompt accepts **binary** and **categorical** claim-relative probability
values only, and only through the registered belief contracts
(`defaultBeliefContractRegistry`). Unregistered or unsupported claim kinds fail
closed. JSON responses are parsed with strict-JSON first, then code-fence JSON;
parse provenance (`strict_json` / `code_fence_json` / `none`) is recorded.
Report and response IDs are runtime-generated canonical IDs
(`final-report:${runId}:${agentId}:${claimId}`,
`final-response:${runId}:${agentId}`).
Replay reparses each preserved `rawResponse` and requires its status,
diagnostic, missingness, and normalized reports to match the stored projection.

## 5. Response and missingness semantics

`FinalElicitationRecord.status` is one of:

- `answered` — a valid, complete response covering every registered claim;
  `diagnosticCode` must be `none`, `missingClaimIds` empty.
- `abstained` — explicit `{"status":"abstained"}`; every claim is marked missing.
- `invalid` — parse failure or contract violation (`invalid_json`,
  `invalid_response_shape`, `duplicate_claim`, `unknown_claim`,
  `missing_claim`, `invalid_belief_value`); partial reports are discarded, so
  every claim is marked missing in the terminal record.
- `unavailable` — `provider_error`, `timeout`, or `adapter_unavailable`; every
  claim is marked missing.

A missing claim is **never imputed as zero** and never as any value. Missingness
flows into aggregation only as explicit abstention/exclusion, and the scalar
task projection becomes `unresolved` when any pooled decision is undecided.

`FinalOutcomeSession.recordRawResponse` / `recordUnavailable` require that the
session is still `elicitation_open` and that the agent is a new, expected agent;
duplicate or unexpected agents fail closed.

## 6. Score and aggregation semantics

For each claim:

- **individual proper losses**: recomputed with the registered belief contracts
  and the recorded resolution; any non-finite loss fails closed.
- **mean individual proper loss**: `null` when no agent answered (never 0).
- **pooled belief**: equal-weight linear pool over answered agents, with
  abstained/unavailable agents excluded explicitly. If the pool is unavailable,
  the pooled proper loss is `null`.
- **pooled decision**: derived via `ABSTAIN_ON_TIE_DECISION_V1`; exact ties
  abstain.
- **coverage**: `reportCoverage = answered / expected` (a number, not a claim of
  correctness).
- **`pooledDecisionMatchesResolution`**: `true` / `false` only when the pooled
  decision is decided; `null` when it abstains or is unavailable. This is
  deliberately not named `correct`: it proves consistency with the **recorded
  authorized resolution**, not external oracle truth. External truth
  authenticity remains an open F8 concern.

## 7. Replay guarantees and non-guarantees

`validateFinalOutcomeArtifact` recomputes the claim outcomes (individual proper
losses, pooled belief, pooled decision, pooled proper loss, coverage,
status-separated exclusions) from the elicitation records and resolutions and
rejects any artifact whose recomputed claim outcomes differ. It also verifies:

- canonical, stable ordering of claims, expected agents, and records;
- exactly one terminal record per expected agent with canonical IDs/sequence;
- answered records cover every claim; non-answered records explicitly mark every
  claim missing;
- the closure → resolution → scoring sequence and timestamp ordering;
- resolution metadata matches each claim's `resolverId` and the recorded
  resolution time.

Guarantee: replay proves **internal consistency and ordering**.

Non-guarantee: replay does **not** prove authenticity or that the recorded
resolution is the externally correct truth. That requires a detached
manifest/hash/signature commitment, which is not implemented.

## 8. Schema-5 linkage

`projectFinalOutcomeTaskRecord` is the sole schema-5 scalar projection of the
final outcome: pooled-decision accuracy across the artifact's registered claims
(equal-weight, non-tied). When any pooled decision is undecided (tie or
unavailable), `quality` is `null` and `status` is `unresolved`; otherwise it is
the proportion of decided pooled decisions matching the recorded resolution and
`status` is `scored`. The returned `TaskOutcomeRecord` carries
`sourceFinalOutcomeRef` pointing at the producing artifact.

`experiments/campaign/types.ts` now makes `finalOutcome` and `taskOutcome`
**required** on `AuditableRawRunDataV5`. `replayVerifier.ts` emits stable
schema-5 issue codes for missing/malformed artifacts and run mismatch
(`missing_final_outcome`, `malformed_final_outcome`,
`final_outcome_run_mismatch`, `missing_task_outcome`, `malformed_task_outcome`,
`task_outcome_final_source_mismatch`,
`task_outcome_final_evaluation_mismatch`, `task_outcome_final_projection_mismatch`).
These make schema 5 fail closed unless a valid final outcome and a matching task
projection are present.

## 8A. Truth-free per-agent adapter boundary and collection

`finalElicitationAdapter.ts` provides a kernel adapter boundary that keeps the
provider call free of measurement pollution:

- `FinalElicitationAdapterContractV1` precommits per-agent `modelRef` +
  `invocationConfig` in exact order, forbids retries (`retryPolicy: "none"`),
  and requires `sequential_precommitted` execution. Credential-like config keys
  (nested, case-varied) are rejected.
- `FinalElicitationAdapterRequestV1` carries only the run id, agent id,
  sequence, prompt, response schema ref, model ref, and invocation config. It
  contains no scoring truth, resolution function, other agent's private view,
  mutable discussion engine, or credentials.
- `collectFinalElicitationV1` executes each binding in precommitted order,
  requires the session to be `elicitation_open`, and maps every provider
  outcome (response, malformed result, explicit unavailable, timeout, thrown
  error) to exactly one terminal record per agent — never retrying and never
  imputing.
- `FinalElicitationCollectionArtifactV1` is a self-addressed provenance artifact
  (run, contract ref, adapter contract, ordered records, `contentHash`). Its
  records carry `promptHash`, `finalResponseRecordId`, `status`, and
  `diagnosticCode`, and cross-check against the final outcome artifact.

**Status:** the collection is an **optional/reserved carrier**, not a schema-5
verifier requirement until F8. It exists as a kernel artifact and is exercised
by tests only.

## 9. Extension rules

- New claim kinds require a registered belief contract; the final prompt and
  validation reject unsupported kinds.
- Aggregation and decision rules are referenced by frozen contract refs
  (`EQUAL_WEIGHT_LINEAR_POOL_V1`, `ABSTAIN_ON_TIE_DECISION_V1`); changing them is
  a versioned contract change, not a silent default.
- The scalar task projection is the only schema-5 scalar; proper losses remain
  claim-level primary measurements.
- Any future reweighting, confidence weighting, or non-equal aggregation must
  enter as a new versioned contract and must not become the default without
  justification.

## 10. Remaining blockers

- Production Runner still emits schema 4; it does not run the common final
  private elicitation and does not emit schema 5.
- The truth-free adapter boundary and collection artifact exist as a kernel, but
  the production wiring is not done: constructing `FinalElicitationViewV1` from
  a real run's private information, invoking `collectFinalElicitationV1` from
  the Runner, and persisting the collection are unimplemented. The collection is
  not yet a schema-5 verifier requirement (deferred to F8).
- No detached truth/manifest commitment exists, so recorded resolution
  authenticity remains an F8 concern.
- Production `G-O`/`G-V` must not be described as complete until the Runner
  actually performs the private elicitation and emits schema 5.

## Verification snapshot (focused)

- `npx tsc --noEmit`: pass
- focused suite (F5): 6 files / 222 passed
- full suite / build: confirmed in final QA
- `git diff --check`: pass (line-ending warnings only)
- no real or paid LLM run
