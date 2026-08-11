# Claude Code Handoff — F5 Edge Tests and Truth Synchronization

Date: 2026-08-10  
Budget ceiling: **USD 2.00 total**  
Role boundary: Codex owns semantics and production code. Claude Code may add
bounded adversarial tests and synchronize factual documentation only.

## 1. Objective

Review the already-implemented F5 core without redesigning it:

1. Stage-1 assignment resolves an exact randomized `armRef` to one frozen
   implementation/budget snapshot before any provider call.
2. Retry reuses the exact assignment and execution binding, but rejects a
   changed `masterSeed`, stratum, study, design, registry, or run identity.
3. Schema 5 has one treatment authority: the new Stage-1 manifest/registry/
   binding plus the governance audit trail. Schema-4 treatment fields are
   forbidden even when their values are `null` or empty.
4. Final private elicitation uses a truth-free, per-agent adapter boundary,
   supports heterogeneous model bindings, forbids retries, maps failures to
   explicit terminal missingness, and produces a self-addressed collection
   provenance artifact.
5. Do not claim that the current production Runner emits schema 5. It still
   writes schema 4. The pre-provider preparation boundary exists, but the
   schema-5 writer, provider adapter, governance delivery, and detached
   commitment remain future work.

## 2. Allowed files

You may modify only:

- `test/primary-assignment-execution.test.ts`
- `test/final-elicitation-adapter.test.ts`
- `test/governance-audit-trail.test.ts`
- `test/governance-estimator-replay.test.ts`
- `docs/architecture/PRIMARY_ASSIGNMENT_V1.md`
- `docs/architecture/FINAL_PRIVATE_OUTCOME_V1.md`
- `docs/architecture/GOVERNANCE_AUDIT_TRAIL_V1.md`
- `docs/plans/SWARMALPHA_V6_EXECUTION_PROGRESS.md`
- `docs/plans/SWARMALPHA_V6_FINAL_INTEGRATED_PLAN_2026-08-10.md`
- optionally create `docs/architecture/PRIMARY_ARM_EXECUTION_V1.md`

Do not modify any other file. In particular, all of the following are red zone:

- `src/lib/**`
- `experiments/campaign/types.ts`
- `experiments/campaign/replayVerifier.ts`
- `experiments/campaign/primaryAssignedRun.ts`
- `experiments/campaign/pipeline/Runner.ts`
- schema constants, production adapters, CLI behavior, configs, manifests, or
  generated experiment data

## 3. Required test work

Add focused adversarial coverage only where not already covered. Prefer small
fixture helpers over copy-pasted full artifacts.

### A. Stage-1 execution registry and binding

Cover at least:

- registry entries reordered relative to frozen design arms -> reject;
- duplicate/missing/extra arm entries -> reject;
- implementation ref, budget ref, config hash, budget hash mismatch -> reject;
- nested credential-like config keys, cycles, sparse arrays, `NaN`, infinity,
  functions, class instances -> reject;
- tampered binding whose own `contentHash` is recomputed but whose selected
  implementation differs from the registry -> reject;
- registry from another study or design -> reject;
- binding timestamp before assignment manifest -> reject;
- returned snapshots are deep-clone isolated;
- path traversal and sanitized-stem collision behavior for the execution store;
- mutation of returned objects does not alter persisted content.

### B. Retry identity

Cover at least:

- exact retry reuses both files and never invokes the clock/create path;
- same `runId` with changed `masterSeed` -> reject, not redraw;
- same `runId` with changed stratum -> reject, not redraw;
- same `runId` with changed registry/design -> reject;
- partial state where assignment exists but execution binding does not: rebuild
  only the deterministic binding, never redraw assignment;
- malformed existing JSON fails closed and is never overwritten.

### C. Schema-5 single authority

Cover stable issue codes for:

- missing `primaryAssignmentManifest`;
- missing `primaryArmExecutionRegistry`;
- missing `primaryArmExecution`;
- malformed/self-consistently forged Stage-1 chain;
- run mismatch, study mismatch, task-outcome assignment mismatch;
- execution binding resolved after audit trail creation;
- each legacy field present on schema 5 (`treatmentAssignment`,
  `assignmentManifest`, `applicationReceipts`, `proximalOutcomes`), including
  `null` and empty values -> `schema5_legacy_treatment_authority_present`;
- schema 4 remains readable under its existing lifecycle rules.

Do not weaken old assertions just to accommodate new issues. Upgrade shared
schema-5 fixtures to contain a valid Stage-1 chain where the test expects an
otherwise valid carrier.

### D. Final elicitation adapter

Cover at least:

- heterogeneous per-agent `modelRef`/config follows exact precommitted order;
- missing, duplicate, extra, or reordered agent bindings -> reject before call;
- extra/missing private views -> reject before call;
- request contains no scoring truth, resolution function, other-agent private
  view, mutable discussion engine, or credentials;
- nested/case-varied credential-like keys -> reject;
- request time before discussion completion and noncanonical timestamps ->
  reject;
- thrown provider error, malformed adapter result, explicit unavailable result,
  and timeout/abort -> exactly one terminal missingness record per agent;
- no retry after invalid response, timeout, or provider error;
- collection `contentHash`, prompt hash, record id/order/status tampering ->
  reject;
- collection/outcome cross-check rejects mismatched run, contract, agent,
  timestamp, status, diagnostic, or final-response id;
- collection remains a kernel artifact only: do not make it schema-5-required
  in this work package. That migration belongs to F8.

Avoid flaky sleeps. For timeout coverage, have the fake adapter resolve or
observe the supplied `AbortSignal`; use the smallest deterministic fake timer
mechanism supported by Vitest.

## 4. Documentation synchronization

Update the allowlisted documents to state exactly:

- `primaryAssignment.ts`: deterministic Stage-1 draw kernel;
- `primaryAssignmentManifestStore.ts`: local atomic no-replace assignment
  publication;
- `primaryAssignmentExecution.ts`: exact-ref execution registry and binding,
  payload/budget hash verification, canonical design order, credential-key
  rejection;
- `primaryArmExecutionStore.ts`: local atomic no-replace binding publication;
- `primaryAssignedRun.ts`: production pre-provider preparation boundary;
- `finalElicitationAdapter.ts`: truth-free per-agent provider boundary and
  collection provenance artifact;
- schema-5 replay now requires and cross-checks the Stage-1
  manifest/registry/binding and rejects legacy treatment authorities;
- `AuditableRawRunDataV5` requires Stage-1 objects and forbids schema-4
  treatment fields at compile time;
- `RAW_SCHEMA_VERSION` remains `"4.0"`;
- the production Runner does not yet execute assigned arms, run final private
  elicitation, emit schema 5, or publish detached commitments;
- local hashes/no-replace files prove internal consistency and retry identity,
  not external authenticity;
- `finalElicitationCollection` is currently an optional/reserved carrier, not a
  schema-5 verifier requirement until F8.

Remove stale statements that say no final elicitation adapter boundary exists
or that schema 5 does not validate Stage-1. Replace them with the narrower
remaining gaps above. Do not use `production-ready`, `confirmatory-ready`,
`causal effect established`, `tamper-proof`, or equivalent language.

## 5. Stop conditions

Stop immediately and report a minimal reproducer without editing production
code if you find any of the following:

- assignment can be redrawn or arm-switched for the same run identity;
- runtime payload can differ from its design commitment and still validate;
- schema 5 accepts both old and new treatment authorities;
- adapter can receive scoring truth through its typed request;
- one agent can receive another agent's private view;
- resolution/scoring can occur before all terminal elicitation records exist;
- public type/schema semantics would need to change;
- any required fix touches a red-zone file.

Do not “optimize” around a red-zone defect. Return it to Codex.

## 6. Validation commands

Run in this order:

```powershell
git diff --check
npx tsc --noEmit
npx vitest run test/primary-assignment-execution.test.ts test/final-elicitation-adapter.test.ts test/governance-audit-trail.test.ts test/governance-estimator-replay.test.ts test/final-outcome.test.ts test/primary-assignment.test.ts
npx vitest run --reporter=dot
npm run build
git status --short
```

Current Codex baseline before your work:

- focused core: 4 files / 76 passed;
- full suite: 58 files / 1147 passed / 3 skipped;
- `npx tsc --noEmit`: pass;
- `git diff --check`: pass (existing CRLF warnings only);
- `npm run build`: pass;
- no real or paid LLM experiment was run.

## 7. Final report format

Return:

1. files changed, grouped by tests/docs;
2. every new test and the invariant it protects;
3. exact focused/full/build results and durations;
4. any red-zone defect with minimal reproducer;
5. deviations from this guide;
6. explicit statement that no production code/schema constant/paid experiment
   was changed or run;
7. remaining blockers for F6/F7/F8.

Do not commit, move, delete, reset, checkout, clean, or reformat unrelated
files.
