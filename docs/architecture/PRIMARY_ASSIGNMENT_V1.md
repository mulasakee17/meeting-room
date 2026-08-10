# Stage-1 Primary Assignment V1

Date: 2026-08-10

Status: implemented and validated at the kernel level, **not wired into the
production Runner**. `RAW_SCHEMA_VERSION` remains `"4.0"`; no production path
emits schema 5 or uses this module.

This document describes the Stage-1 primary assignment module
(`src/lib/experimentation/primaryAssignment.ts`,
`src/lib/experimentation/primaryAssignmentManifestStore.ts`) and its current
boundaries. It is a factual statement, not a claim of experimental validity.

## 1. Stage-1 vs Stage-2

- **Stage 1 — primary architecture assignment.** The experiment unit is the
  **run**. It randomizes a run to a named architecture arm (e.g. text baseline /
  explicit belief / epistemic governance) and supports the paper's run-level
  ITT / architecture effect. Current objects:
  `GovernanceStudyContract.primaryAssignmentDesign`,
  `PrimaryAssignmentDesignV1`, `PrimaryAssignmentRecordV1`,
  `PrimaryAssignmentManifestV1`.
- **Stage 2 — eligible-event micro-randomization.** The experiment unit is the
  **eligible event**. It randomizes an event to apply / holdout / sham and
  supports mechanism / local mediator / exploratory event effects. Current
  objects: `GovernancePolicyContract.assignmentDesign`,
  `GovernanceEventAssignment`, `GovernanceDecisionRecord`, action lifecycle.
  `eligibleEventEstimand` must remain `exploratory_only`.

The two stages are deliberately separate types and records.

## 2. PrimaryAssignmentDesignV1 fields

- `id` / `version` — design identity (semver).
- `schemaVersion` — must be `"1.0.0"`.
- `preregistrationRef` — the design's preregistration; must match the study.
- `unit` — must be `"run"` (Stage-1 v1 supports run units only).
- `assignmentAlgorithmRef` — must equal
  `swarmalpha.primary-assignment.sha256-mulberry32@1.0.0`.
- `seedNamespace` — non-empty namespacing for the seed commitment.
- `arms` — at least two arms, each with `armRef`, `allocationProbability`
  (0,1], `implementationRef`, `implementationConfigHash`, `budgetContractRef`,
  `budgetContractHash`; arm refs unique, probabilities sum to 1.
- `stratification` — `fields` (canonically sorted unique non-empty strings),
  `missingFieldPolicy: "reject"`, `extraFieldPolicy: "reject"`.
- `analysisPopulation` — must be `"intention_to_treat"`.
- `primaryEstimandRef` — versioned estimand ref.
- `retryPolicy` — must be `"reuse_assignment"`.

## 3. Seed commitment inputs

The derived seed is a sha256 digest of the canonical JSON of:

```text
masterSeed | runId | studyRef | designRef (id+version) | designHash |
assignmentAlgorithmRef | seedNamespace | stratum | ordered arm vector
```

`designHash` is itself the canonical hash of the whole frozen design, so any
change to the design (arms, probabilities, hashes, namespace, policies) changes
the commitment.

## 4. Arm order is part of the design

The ordered arm vector is inside the seed commitment. Reordering the arms of a
design changes the derived seed and therefore the draw. Two designs that differ
only by arm order are different designs.

## 5. Intention-to-treat is the only allowed v1 analysis population

`analysisPopulation` must be `"intention_to_treat"`. There is no per-protocol or
as-treated option in v1. Assignment failure does not justify removing a run
from the analysis population.

## 6. `group` is currently fail-closed

`PrimaryAssignmentDesignV1.unit` only accepts `"run"`; a runtime-forged
`"group"` is rejected. `GovernanceStudyContract.primaryAssignmentUnit ===
"group"` is rejected. No group randomization unit, carrier, or runtime exists.

## 7. Retry reuse / no redraw

`retryPolicy` must be `"reuse_assignment"`. `loadOrCreatePrimaryAssignmentManifestV1`
returns the existing manifest on retry and never invokes the `createManifest`
callback again; a different frozen study design is rejected rather than
redrawn or overwritten.

## 8. Atomic no-replace publication is local only

The store publishes via `open("wx")` + `fsync` + `link` (no-replace) so a
partial or concurrent manifest cannot silently overwrite the authoritative path.
This guarantees **local file publication** only. It does not provide external
authenticity, a signature, or tamper-proofing.

## 9. Config/budget hashes are frozen references only

`implementationConfigHash` / `budgetContractHash` are sha256 commitments to the
arm's configuration and budget contract **as declared in the design**. The
production Runner does **not** yet verify that the actual runtime configuration
and budget match these hashes. They bind the design to declared snapshots, not
to a live runtime check.

## 10. Schema 5 now requires and cross-checks the Stage-1 primary assignment

The schema-5 carrier verifier (`experiments/campaign/replayVerifier.ts`) now
requires `primaryAssignmentManifest`, `primaryArmExecutionRegistry`, and
`primaryArmExecution` on a schema-5 run and cross-checks them against the run,
the study, the audit-trail open time, and the task outcome. Stable issue codes
include `missing_primary_assignment_manifest`,
`missing_primary_arm_execution_registry`, `missing_primary_arm_execution_binding`,
`malformed_primary_assignment_chain`, `primary_assignment_run_mismatch`,
`primary_assignment_study_mismatch`, `primary_assignment_after_audit_open`,
`task_outcome_primary_assignment_mismatch`, and
`schema5_legacy_treatment_authority_present` (schema-4 treatment fields are
forbidden on schema 5 even when `null`/empty). `AuditableRawRunDataV5` requires
the Stage-1 objects and `finalOutcome`/`taskOutcome`, and forbids schema-4
treatment fields at compile time (`?: never`).

## 11. Execution registry and binding

Stage-1 assignment resolves to an exact frozen implementation/budget snapshot
via `primaryAssignmentExecution.ts` and persists the binding via
`primaryArmExecutionStore.ts`; the pre-provider boundary is
`experiments/campaign/primaryAssignedRun.ts`. See
`docs/architecture/PRIMARY_ARM_EXECUTION_V1.md`.

## 12. The production Runner still does not use this module

The Runner still creates a legacy config-decided `TreatmentAssignment`
(single arm, probability 1). `PrimaryAssignmentV1` and the execution
registry/binding are validated at the kernel level and exercised by tests and
the schema-5 verifier only. Wiring the Runner is future work.

## 13. No readiness claims

None of the above is `production-ready`, `confirmatory-ready`, or evidence of a
`causal effect established`. The module is a validated kernel and a
self-addressed pre-call artifact; the causal claims of the paper require the
wiring below plus a real randomized primary draw and an independent final
outcome.

## 12. Private final elicitation is not implemented

There is no separate private post-discussion probability elicitation. The
current `TaskOutcomeRecord` derives from the final discussion opinions, not an
independent private elicitation.

## 13. No readiness claims

None of the above is `production-ready`, `confirmatory-ready`, or evidence of a
`causal effect established`. The module is a validated kernel and a self-addressed
pre-call manifest; the causal claims of the paper require the wiring below plus
a real randomized primary draw and an independent final outcome.

---

## CC-5C wiring inventory (read-only, updated 2026-08-10)

Status after F5:

1. **`experiments/campaign/types.ts`** — **done**: `AuditableRawRunDataV5` now
   requires `primaryAssignmentManifest`, `primaryArmExecutionRegistry`,
   `primaryArmExecution`, `finalOutcome`, and `taskOutcome`, and forbids schema-4
   treatment fields at compile time (`?: never`).
2. **`experiments/campaign/replayVerifier.ts`** — **done**: the schema-5 verifier
   now validates and cross-checks the Stage-1 manifest/registry/binding, rejects
   legacy treatment authorities, and (with F4) requires a valid final outcome
   and task projection.
3. **`experiments/campaign/pipeline/Runner.ts`** — **not done**: still uses the
   legacy config-decided single-arm `TreatmentAssignment`; does not call
   `preparePrimaryAssignedRunV1`.
4. **`experiments/campaign/studyContractGuard.ts`** — **not done**: validates the
   study contract only; it does not create or persist a Stage-1 manifest.
5. **schema-5 artifact store / detached commitment** — **not done**: no external
   manifest/hash/signature commitment exists.
6. **final private elicitation production wiring** — **not done**: the adapter
   boundary and collection artifact exist as a kernel, but the Runner does not
   invoke them and the collection is not a schema-5 requirement until F8.

Wiring that remains must still satisfy:

1. The manifest and binding are persisted **before any provider call**.
2. `assignedArmRef` decides the runtime; the runtime arm must not be chosen by
   config independently of the draw.
3. The actual runtime configuration and budget must be verified against the
   design's `implementationConfigHash` / `budgetContractHash`.
4. A retry must read the existing manifest/binding and never redraw.
5. An assignment failure must remain in the analysis under ITT and must not be
   dropped.
