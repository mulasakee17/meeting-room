# SwarmAlpha v6 Production Vertical Slice v1

Status date: 2026-08-10

## 1. What is implemented

`experiments/campaign/v6/productionVerticalSlice.ts` is the first complete,
provider-injectable v6 execution path. It intentionally does not modify the
legacy schema-4 `Runner`.

The frozen scope is one distributed-information binary claim, two discussion
rounds, a precommitted agent roster, and three Stage-1 protocols:

- `text_communication_v1` (T): public free-text discussion;
- `explicit_belief_v1` (B): public message plus an architecture-parsed binary
  probability and declared evidence;
- `epistemic_governance_v1` (G): B plus one preregistered, randomized
  verification opportunity.

The successful path is:

1. validate the auditable study, frozen Stage-1 design, exact task family,
   adapters, registry and rule registry; confirmatory-only restrictions remain
   the responsibility of `validateGovernanceStudyContract`;
2. atomically publish the analysis-unit commitment before assignment;
3. atomically create/reuse the Stage-1 assignment and exact arm binding;
4. execute the assigned protocol through a truth-free discussion adapter;
5. append B/G evidence, reports and architecture-observed exposures to an
   `EpistemicLedger`;
6. for G, construct source event -> observation -> diagnosis -> eligibility
   decision -> eligible-event assignment -> closing decision -> action instance
   -> delivery/compliance terminal transitions;
7. collect an arm-invariant private final elicitation after discussion and
   before resolution;
8. resolve and score, then compute the registered-agent ITT operational pooled
   Brier loss;
9. assemble schema 5, verify structural/decision/outcome replay, atomically
   publish it without replacement, read it back, and verify again.

## 2. Authority and replay boundaries

The Stage-1 manifest is the only primary arm authority. The exact protocol and
budget come from its execution binding; arm labels have no runtime meaning.

The interaction trace commits:

- discussion adapter/model/config snapshots;
- one terminal request record per agent per round;
- request hashes replayed from task-private views, public transcript and frozen
  adapter bindings;
- public messages;
- append-only epistemic events;
- the verification adapter/model/config for G.

For delivered governance actions, the audit source event commits the exact
verification request hash and public result. The persisted reader cross-checks
that result against the action, diagnosis, triggering report and public
transcript.

The final-elicitation prompt hashes are reconstructed from the task-private
view and the committed interaction trace. This prevents a self-consistent
final-outcome artifact from silently measuring a different transcript.

`taskOutcome` is secondary pooled-decision accuracy. The Stage-1
`primaryEstimandRef` and `operationalOutcome.primaryMetric` remain the only
primary scalar declaration.

## 3. Fail-closed behavior

- An existing Stage-1 assignment without an earlier analysis-unit artifact is
  rejected before provider calls.
- Existing analysis unit, assignment, binding and completed raw run are
  immutable retry inputs.
- A completed exact retry returns the verified artifact without provider calls.
- Unsupported protocol/config/budget fields are rejected.
- Credentials cannot be persisted in invocation configs.
- Provider failure/timeout becomes explicit terminal missingness or a failed
  governance action; it is not converted to success.
- Compliance is architecture-observed from completion of the assigned delivery
  request. The verifier model cannot supply the compliance bit, and delivery
  compliance is not intervention effectiveness.
- Final-elicitation provider usage is committed in its collection artifact and
  included in run-level token/latency totals.
- Budget-control failures are fatal execution halts, not ordinary missingness;
  they escape all three adapters and prevent publication of a completed raw run.
- A raw artifact is not published until all internal replay checks pass.

## 3A. Engineering smoke boundary

`npm run smoke:v6` is dry-run by default. It validates and prints one planned
T/B/G protocol-coverage run, performs no network request, reads no credential,
and writes no artifact. `--execute` explicitly selects the DeepSeek
single-attempt primitive. That primitive performs one fetch with no retry,
repair, or provider fallback and propagates cancellation.

The smoke study has `inferenceIntent: "engineering"`. Its helper deliberately
selects deterministic Stage-1 seeds to cover T/B/G and a frozen eligible-event
seed that exercises G delivery/compliance. These outputs are therefore
forbidden as confirmatory randomized evidence. Reported provider usage is the
accounting authority. Printed token values are planning estimates only; each
call has a frozen provider-side completion cap, and a token-cap overshoot is
bounded to the final single attempt that reveals its usage.

For an eligible-event sham assignment, the matched provider call receives no
claim, target message, or task context. Its authored content is discarded and
the architecture publishes a fixed neutral no-new-evidence message. This keeps
resource/attention matching from being mislabeled active verification.

The default output is under ignored `experiments/campaign/pilot_output/`.
Incomplete pre-assignment artifacts fail closed and require a fresh run id;
completed exact retries make zero provider calls.

## 4. Verified evidence

On 2026-08-10:

- focused vertical-slice tests: 4 passed;
- focused kernel regression: 8 files / 230 passed;
- full suite: 60 files / 1227 passed / 3 skipped;
- `npx tsc --noEmit`: passed;
- `npm run build`: passed.

The later smoke-boundary hardening added deterministic tests for single-attempt
fetch behavior, external cancellation, provider request format, architectural
compliance, final usage accounting, dry-run caps, actual call/token caps, and
fatal no-artifact budget stops. No real or paid LLM call was made. All execution
tests use mocked fetch or deterministic injected adapters.

Final hardening snapshot on 2026-08-10: focused smoke/provider slice 3 files /
27 passed; full suite 63 files / 1256 passed / 3 skipped; `npx tsc --noEmit`, `git diff --check`,
`npm run build`, and the default `npm run smoke:v6 -- --dry-run` all passed.

## 5. What this does not establish

This is a reference production path, not platform-wide production readiness.
It does not establish:

- external authenticity, detached task commitments, signatures or tamper-proof
  history;
- correctness or construct validity of agent-declared evidence/lineage;
- a causal effect of governance;
- an eligible-event causal estimand (it remains exploratory under interference);
- generality beyond the frozen binary task adapter;
- exactly-once provider execution after a mid-run process crash;
- a paid-provider pilot or a confirmatory dataset.

The raw schema verifier can replay carried artifacts without task-private
inputs, but full discussion/final-prompt provenance replay additionally needs
the original task bundle. That boundary is deliberate and must not be hidden in
paper claims.

## 6. Low-risk follow-up suitable for Claude Code

Allowed work, after Codex review:

1. Mechanically split the current single-authority implementation into
   `contracts.ts`, `interactionTrace.ts`, `artifactStore.ts`, and `runner.ts`
   without changing exports or behavior. The current monolith is deliberate
   during semantic closure but should not remain the long-term maintenance
   shape.
2. Add adversarial tests for malformed adapter results, timeouts, corrupted
   completed artifacts, prompt/request self-consistent tampering, budget
   exhaustion, and no-replace publication races.
3. Synchronize progress documentation using only the claims in this file.

Stop and return to Codex if a change touches estimator semantics, assignment
identity, outcome construction, governance decision/action semantics, schema-5
authority, or task-truth timing.
