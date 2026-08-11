# Claude Code Handoff: F4 Edge and F5 Prep

Date: 2026-08-10

This handoff is a **standalone prompt**. It begins only after Codex has
implemented and verified the F4 deterministic core and the schema-5 carrier gate
(see `docs/architecture/FINAL_PRIVATE_OUTCOME_V1.md`). Your entire scope is
**adversarial test expansion** and **mechanical documentation truth sync**. You
do not implement, wire, redesign, or fix anything.

## Your role

You are Claude Code operating under a strict file allowlist. Read widely, but
write only in the files listed under "Allowed files". Do not modify production
code, tests outside the allowlist, configuration, or git state. If you find a
red-zone defect (defined below), stop that line of work and report it; do not
attempt a source fix.

## Verified semantic baseline (read this, do not redesign it)

- `FinalElicitationContractV1` freezes timing `post_discussion_pre_resolution`,
  privacy `isolated_per_agent`, no discussion re-entry, truth forbidden until
  elicitation closes, `explicit_terminal_record` missingness, `requireAllClaims`
  true, equal-weight linear pool, abstain-on-tie.
- `agentOrderPolicy` is `precommitted_exact_order`; record sequence must match
  the exact expected-agent order supplied before elicitation.
- `FinalOutcomeSession` requires exactly one terminal record per expected agent:
  `answered` | `abstained` | `invalid` | `unavailable`. Missing is never imputed
  as zero. State order: discussion completed → terminal elicitation records →
  elicitation closed → authorized resolution → scoring completed. The
  `scoringTask` lives in a JavaScript private field and is released to the
  resolver only after closure.
- The prompt accepts binary and categorical claim-relative probabilities only
  through the registered belief contracts. Parse provenance is `strict_json` /
  `code_fence_json` / `none`. IDs are canonical
  (`final-response:${runId}:${agentId}`,
  `final-report:${runId}:${agentId}:${claimId}`).
- `FinalOutcomeArtifactV1` replay recomputes individual proper losses,
  equal-weight pooled belief, pooled decision, pooled proper loss, coverage, and
  status-separated exclusions. Field name is `pooledDecisionMatchesResolution`,
  deliberately not `correct`: it proves consistency with the recorded authorized
  resolution, not external oracle truth.
- `projectFinalOutcomeTaskRecord` is the sole schema-5 scalar: pooled-decision
  accuracy across registered claims; ties/unavailable make it `unresolved`.
  `TaskOutcomeRecord` carries `sourceFinalOutcomeRef`.
- `experiments/campaign/types.ts` makes `finalOutcome` and `taskOutcome`
  required on `AuditableRawRunDataV5`; `replayVerifier.ts` emits stable schema-5
  issue codes (`missing_final_outcome`, `malformed_final_outcome`, `final_outcome_run_mismatch`,
  `missing_task_outcome`, `malformed_task_outcome`, `task_outcome_final_source_mismatch`,
  `task_outcome_final_evaluation_mismatch`, `task_outcome_final_projection_mismatch`).
- Honest status: F4 deterministic/core and the schema-5 carrier gate are
  complete. The production Runner still emits schema 4, does not run the common
  final private elicitation, and does not emit schema 5. There is no production
  agent-specific elicitation adapter and no detached truth/manifest commitment.
  Production G-O/G-V is NOT complete. External truth authenticity remains F8.

## Allowed files (the only files you may write)

- `test/final-outcome.test.ts`
- `test/governance-audit-trail.test.ts`
- `test/governance-estimator-replay.test.ts`
- `docs/architecture/FINAL_PRIVATE_OUTCOME_V1.md`
- `docs/plans/SWARMALPHA_V6_EXECUTION_PROGRESS.md`

You may read any file, but write only in these five. `docs/architecture/
FINAL_PRIVATE_OUTCOME_V1.md` may be edited only for factual correction or truth
sync; do not add new claims that are not already supported by the implemented
core and tests.

## Forbidden

- Do not modify `src/**`, `experiments/campaign/**` (including `Runner.ts`),
  configuration, or any other test file.
- Do not change schemas, versions, or any assertion that currently fails closed
  (do not weaken `missing_*`, `final_outcome_*`, or `task_outcome_*` checks).
- Do not add or modify any source-level API surface.
- Do not run paid or real LLM calls. Everything here is deterministic.
- Do not run `git reset`, `git clean`, or `git commit`.
- Do not claim production G-O/G-V or production integration is complete, and do
  not imply the deterministic core is a confirmatory experiment.

## Work package A — adversarial test expansion

Primary target: `test/final-outcome.test.ts`. Add tests only for behavior the
implemented core actually has. Do not add tests for unimplemented behavior. Do
not add tests that require production wiring. Suggested matrix (expand each
independently):

**A.1 Lifecycle ordering**
- record / close / resolve / score out of order each fail.
- close before every expected agent has a terminal record fails.
- resolve before close fails; score before resolve fails.
- artifact unavailable before scoring completes.

**A.2 Record admission**
- duplicate agent record fails; unexpected (non-expected) agent fails.
- record after close fails.

**A.3 Missingness / terminal status**
- `abstained`, each `invalid` diagnostic code, and each `unavailable` code
  (`provider_error`, `timeout`, `adapter_unavailable`) produce empty `reports`
  and mark every claim missing.
- a missing claim is never imputed: verify the claim is absent from answered
  sets, never a zero-valued report.

**A.4 Parse provenance**
- strict-JSON success records `strict_json`; code-fence JSON records
  `code_fence_json`; unparseable records `none` with `invalid_json`.
- persisted raw responses must reparse to the stored status, diagnostic,
  missingness, and normalized reports.

**A.5 Contract invariants**
- wrong timing / privacy / feedback / truthAccess / missingnessPolicy /
  `requireAllClaims` / aggregationRef / decisionRef all fail.
- unsorted or non-unique `claimIds` fail.
- claim set must exactly match `contract.claimIds`.

**A.6 Response shape**
- `duplicate_claim`, `unknown_claim`, `missing_claim`, `invalid_belief_value`,
  `invalid_response_shape` each fail as `invalid` with all claims missing.

**A.7 View truth firewall**
- a `FinalElicitationViewV1` carrying a scoring truth key is rejected
  (`containsForbiddenTruthKey`).

**A.8 Artifact validation**
- canonical ID / sequence violations fail.
- answered records must cover every claim with no missingness; non-answered
  records must explicitly mark every claim missing.
- closure → resolution → scoring sequence and timestamp ordering fail when
  violated.
- resolution `resolverId` / `resolvedAt` mismatch fails.
- records count must equal expected agent count.

**A.9 Score / aggregation semantics**
- mean individual proper loss is `null` when no agent answered.
- pooled proper loss is `null` when the pool is unavailable.
- `pooledDecisionMatchesResolution` is `null` on tie / unavailable, and `true` /
  `false` only when decided (never called `correct`).

**A.10 Scalar projection**
- `projectFinalOutcomeTaskRecord` yields `unresolved` on any undecided pooled
  decision; `sourceFinalOutcomeRef` points at the producing artifact; quality is
  the proportion of decided matches.

**A.11 Replay**
- single-field score/sequence/identity tampering is rejected when the artifact
  no longer replays. Do not claim replay detects a coherent forgery that changes
  both a resolution and every derived score; detached authenticity is F8.

Secondary target: `test/governance-estimator-replay.test.ts` and
`test/governance-audit-trail.test.ts` — only mechanical sync if a schema-5
final-outcome assertion needs updating to the new required fields. Do not add
new red-zone bypass tests.

## Work package B — mechanical documentation truth sync

- Update `docs/plans/SWARMALPHA_V6_EXECUTION_PROGRESS.md` only by adding a dated
  addendum that records implemented facts and honest status. Do not rewrite
  history or remove prior addenda.
- Correct `docs/architecture/FINAL_PRIVATE_OUTCOME_V1.md` only where it
  contradicts the implemented core or verified tests. Do not add speculative
  claims.

## Commands (run from repo root, all deterministic)

- `npx tsc --noEmit` — must pass.
- `npx vitest run test/final-outcome.test.ts` — must pass.
- `npx vitest run` (full suite) — must pass (focused baseline is 3 files /
  137 passed; final-outcome currently 11 tests; full baseline is 56 files /
  1139 passed / 3 skipped).
- `npm run build` — must pass.
- `git diff --check` — must pass (whitespace only; do not commit).

## Stop conditions

Stop and report immediately, without attempting a source fix, if any of these
occur:

- A red-zone defect: the core fails to enforce one of the frozen invariants
  listed above (e.g. a missing claim is imputed, truth leaks pre-closure, a
  non-terminal missingness state is accepted, sequence/timestamp ordering can be
  violated, `pooledDecisionMatchesResolution` is mislabeled as correctness).
  Report with a minimal reproduction (a small failing test or a code snippet
  plus the observed vs expected output) and the affected file/line. Do not fix
  it and do not work around it in tests.
- A test you write requires production wiring or a source change to pass. Do not
  force it; report it.
- The full suite or build regresses for any reason. Report before continuing.

## Final report format

When finished (or when stopped), report:

1. **Files changed** — list each allowed file and a one-line description of the
   change.
2. **Tests added** — count of new `it`/`test` cases per file, grouped by matrix
   item (A.1–A.11 / B).
3. **Command results** — copy the four command outcomes (`tsc`, focused vitest,
   full vitest, `npm run build`, `git diff --check`).
4. **Red-zone defects found** — none, or for each: minimal reproduction,
   affected file/line, observed vs expected.
5. **Honest status line** — confirm: F4 deterministic/core and schema-5 carrier
   gate complete; production Runner still schema 4, no production elicitation
   adapter, no detached truth commitment; production G-O/G-V not complete; no
   paid or real LLM run.
