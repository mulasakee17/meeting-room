# Claude Code Handoff: Governance Plumbing and Edge Hardening

Date: 2026-08-09

Owner of theory, contracts, and final review: Codex

Executor scope: Claude Code / DeepSeek, bounded medium-to-low-risk work only

## 1. Read this first

The high-risk semantic kernel has already been implemented. Your job is not to
redesign it. Your job is to add edge tests, carry its study declaration through
the existing campaign artifacts, synchronize documentation, and report any
semantic conflict instead of resolving it by invention.

The worktree is intentionally dirty and contains user-owned work. Never run
`git reset`, `git checkout --`, bulk formatters, cleanup scripts, or broad search
and replace. Do not stage or commit files outside the active work package.

Current verified baseline before this handoff:

- `npx tsc --noEmit`: pass
- focused governance/epistemic tests: 6 files, 40 passed
- full suite: 49 files, 954 passed, 3 skipped
- `npm run build`: pass
- no paid model experiment is authorized by this guide

## 2. Semantic laws that must not change

1. A descriptive risk signal is not a causal diagnosis and has no control
   permission.
2. An experimental candidate may control only inside the exact matching
   preregistered randomized policy.
3. Operational control requires calibrated evidence in a declared domain.
4. Eligibility, random assignment, policy selection, queueing, delivery,
   compliance observation, completion, and effectiveness are different facts.
5. `completed` means the observation window closed; it never means effective.
6. Dependence/lineage does not imply falsehood. Verification does not mutate the
   original evidence record.
7. Missing evidence, lineage, assignment, or required replay data fails closed;
   it is never imputed as confidence 1, independence, delivery, or success.
8. Equal-weight pooling ignores confidence, stake, and reputation by design.
9. Lineage-capped pooling uses the tightest dependency constraint so every
   lineage obeys its declared aggregate weight cap.
10. Legacy governance is read/replay compatible but cannot support a
    confirmatory governance claim.
11. Run/group assignment is the primary confirmatory unit. Eligible-event
    effects remain exploratory until interference is explicitly modelled.
12. Web3 reputation/stake/settlement remains deferred and default-off.

If a requested change conflicts with any item above, stop and report the exact
file, line, failing test, and proposed alternatives. Do not choose a new meaning.

## 3. Red-zone files

Do not modify these files in this handoff:

- `src/lib/governance/controlContracts.ts`
- `src/lib/governance/decisionEngine.ts`
- `src/lib/governance/actionLifecycle.ts`
- `src/lib/governance/standardEpistemicActions.ts`
- `src/lib/governance/epistemicEligibilityRules.ts`
- `src/lib/epistemic/aggregation.ts`
- `src/lib/epistemic/evidenceGraph.ts`
- `src/lib/epistemic/ledger.ts`
- `src/lib/discussion/index.ts`
- `src/lib/experimentation/governanceStudy.ts`

You may read them. If a test exposes a defect in a red-zone file, stop after
capturing a minimal failing test or a precise reproduction. Codex owns the fix.

## 4. Work package CC-1: adversarial edge tests

Risk: low. Complete and verify this package before CC-2.

Allowed files:

- `test/governance-control-core.test.ts`
- `test/epistemic-governance-policy.test.ts`
- `test/epistemic-aggregation.test.ts`
- `test/epistemic-evidence-graph.test.ts`
- `test/governance-study-contract.test.ts`
- optionally one new `test/governance-runtime-validation.test.ts`

Add table-driven tests for the still-uncovered contract edges:

- invalid runtime values for intervention family, target kind, delivery mode,
  compliance observability, mediator direction, randomization unit, policy
  control mode, arbitration, and online adaptation;
- partial/missing diagnosis observations without named `missingFields`;
- a randomized policy without preregistration;
- a secondary action candidate whose randomization unit is incompatible with
  the recorded assignment; it must not be selected;
- duplicated candidates emitted by different rules: deterministic arbitration
  must retain the higher-priority candidate;
- malformed evidence relation basis/kind and verification kind/verdict;
- bad multi-event evidence and lifecycle batches remain atomic;
- categorical exact ties abstain without option-order advantage;
- legacy Study Contract plus `confirmatory` intent fails closed;
- confirmatory Study Contract with a mutable/exploratory policy fails closed.

Do not weaken assertions to match current behavior. If a red-zone defect is
found, stop this package and report it.

Acceptance:

```powershell
npx tsc --noEmit
npx vitest run test/governance-control-core.test.ts test/epistemic-governance-policy.test.ts test/epistemic-aggregation.test.ts test/epistemic-evidence-graph.test.ts test/governance-study-contract.test.ts
```

## 5. Work package CC-2: Study Contract campaign plumbing

Risk: medium but mechanical. Do not start until CC-1 is green.

Allowed files:

- `experiments/campaign/types.ts`
- `experiments/campaign/pipeline/Runner.ts`
- `experiments/campaign/replayVerifier.ts`
- one new `experiments/campaign/studyContractGuard.ts` if useful
- `test/governance-estimator-replay.test.ts`
- `test/experimentation.test.ts`
- one new focused test file

Required behavior:

1. Add optional `governanceStudy?: GovernanceStudyContract` to
   `ExperimentConfig` and `RawRunData`.
2. When a config provides it, call `validateGovernanceStudyContract` before any
   LLM/provider invocation in both Runner paths.
3. Persist an exact structured clone of the validated contract in `RawRunData`.
4. Replay validation must validate the contract when present and emit a stable,
   explicit issue code such as `malformed_governance_study_contract` on failure.
5. A missing contract in schema 1.0-4.0 remains readable legacy data. It is not
   a replay structural error and must never be inferred as confirmatory.
6. Do not reinterpret historical `isMain`. It is a campaign selection/display
   flag, not an inference-intent declaration.
7. Do not infer a Study Contract from `governanceMode`, arm name, filenames, or
   descriptions. Explicit absence remains legacy/undeclared.
8. Do not bump `RAW_SCHEMA_VERSION` in this package. Schema 5.0 is reserved for
   the future authoritative audit-trail bridge.
9. Do not connect legacy detector actions to the new decision engine.
10. Add tests proving validation happens before an injected mock LLM is called,
    the exact declaration round-trips into raw data, malformed declarations fail
    replay, and schema 4.0 artifacts without a declaration remain readable but
    undeclared.

Acceptance:

```powershell
npx tsc --noEmit
npx vitest run test/experimentation.test.ts test/governance-estimator-replay.test.ts
```

## 6. Work package CC-3: documentation truth synchronization

Risk: low. Do this only after CC-2 is green.

Allowed files:

- `docs/plans/SWARMALPHA_V6_EXECUTION_PROGRESS.md`
- `docs/plans/SWARMALPHA_V6_EXECUTION_MASTERPLAN.md`
- optionally one new document under `docs/architecture/`

Document only verified facts:

- the contract/decision/lifecycle/evidence/aggregation kernels exist;
- round-local report indexes now commit atomically with the epistemic ledger;
- the legacy campaign still is not the authoritative epistemic-governance path;
- Study Contract plumbing records claim eligibility but does not itself provide
  a governance audit trail;
- schema 5.0, production diagnosis adapters, eligible-event assignment,
  delivery adapters, mediator extraction, and confirmatory analysis remain open;
- no paid pilot or confirmatory result exists;
- Web3 mechanisms remain future work.

Do not write “P0 complete”, “production ready”, “causal effect established”,
“general across tasks”, or “AAMAS ready”. Preserve UTF-8 encoding.

## 7. Work package CC-4: final QA and handback

Run:

```powershell
git diff --check
npx tsc --noEmit
npx vitest run
npm run build
git status --short
```

Report:

- files changed per work package;
- exact test file/count results and build result;
- any flaky test separately from deterministic failures;
- all deviations from this guide;
- remaining red-zone work, without implementing it.

Do not stage or commit unless the user explicitly asks. If asked to commit, use
one commit per completed package and stage only that package's whitelist.

## 8. Stop boundary: return these tasks to Codex

The following are high-risk and must not be implemented by Claude Code under
this guide:

1. schema 5.0 authoritative `GovernanceAuditTrail` and cross-record replay
   invariants;
2. production mapping from task-specific observations to versioned diagnoses;
3. connecting `GovernanceDecisionEngine` to the campaign's
   `epistemic_governance` arm;
4. real eligible-event apply/holdout/sham assignment and interference policy;
5. delivery/compliance adapters and action-instance creation rules;
6. mediator contracts, final private elicitation, resolution, scoring, and
   causal estimands;
7. calibration thresholds or any paid experiment design;
8. reputation, stake, settlement, Sybil penalties, or Web3 behavior.

The next Codex review should occur immediately after CC-2, before any schema 5
or production engine bridge work.
