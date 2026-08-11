# Claude Code Handoff: Schema 5 Edge Tests, Documentation, and Scope Map

Date: 2026-08-09

This handoff begins only after Codex has implemented the governance audit core.
It deliberately excludes the production governance bridge.

## Verified semantic baseline

The following now exist and must not be redesigned:

- preregistered per-action assignment allocations inside `GovernancePolicyContract`;
- deterministic eligible-event assignment bound to policy, candidate-set hash,
  allocation probabilities, and seed namespace;
- content-addressed source events and versioned observation records;
- diagnosis → eligibility decision → assignment → closing decision cross-links;
- action instances containing the selected parameters and expected costs;
- explicit right-censoring as a terminal lifecycle state;
- structural audit replay distinct from executable decision replay;
- a reserved schema 5 carrier that is validated but not emitted by the current
  Runner; `RAW_SCHEMA_VERSION` must remain `4.0`.

## Red zone

Read but do not modify:

- `src/lib/governance/**`
- `src/lib/epistemic/**`
- `src/lib/experimentation/governanceStudy.ts`
- `src/lib/experimentation/governanceAuditTrail.ts`
- `experiments/campaign/pipeline/Runner.ts`
- `experiments/campaign/studyContractGuard.ts`

Do not run paid LLM calls, bump the current writer to schema 5, create production
diagnosis adapters, or weaken `governance_decision_replay_required`.

## CC-3A: schema 5 adversarial carrier tests

Allowed files:

- `test/governance-audit-trail.test.ts`
- `test/governance-estimator-replay.test.ts`
- optionally one new focused test file

Add tests only for:

- `governanceStudy: null` and `governanceAuditTrail: null` fail closed;
- audit/run ID mismatch;
- raw study/audit study mismatch;
- wrong `artifactSchemaRef` for schema 5;
- open audit trail rejected as a successful schema 5 raw run;
- wrong/missing executable rule registry prevents confirmatory decision replay;
- exploratory schema 5 may stop at sealed structural replay but must retain that
  exact status instead of claiming decision replay;
- probability-vector tampering remains rejected even when seed, draw, assigned
  arm, and recorded probability are recomputed self-consistently.

If a test exposes a red-zone defect, stop and report the minimal reproduction.

## CC-3B: documentation truth synchronization

Allowed files:

- `docs/plans/SWARMALPHA_V6_EXECUTION_PROGRESS.md`
- `docs/plans/SWARMALPHA_V6_EXECUTION_MASTERPLAN.md`
- one new document under `docs/architecture/`

Document the exact chain and verification levels. Explicitly state:

- schema 5 is reserved/validated but not emitted by production Runner;
- structural replay does not recompute observation projections, diagnoses, or
  eligibility rules;
- decision replay recomputes eligibility decisions from stored diagnoses using
  version-matched executable rules;
- neither level detects a completely forged artifact without an external
  manifest/hash/signature commitment;
- no confirmatory or paid experiment has run.

Never write “P0 complete”, “production ready”, or “causal effect established”.

## CC-3C: repository scope map — no file moves

Allowed output only:

- `docs/plans/REPOSITORY_SCOPE_MAP_2026-08-09.md`

Use `rg --files` and imports to classify, without changing or deleting files:

1. paper-critical kernel;
2. production-bridge candidates;
3. legacy/read-only compatibility;
4. active exploratory experiment scripts;
5. one-off debug/probe scripts;
6. generated artifacts or documentation drift.

For every proposed quarantine/move, provide current path, proposed destination,
import/reference count, risk, and whether git history preserves recovery. Do not
perform the move. The purpose is to reduce cognitive surface, not delete history.

## Final QA

```powershell
git diff --check
npx tsc --noEmit
npx vitest run test/governance-audit-trail.test.ts test/governance-estimator-replay.test.ts
npx vitest run
npm run build
git status --short
```

Stop after the report. Do not commit unless explicitly requested.
