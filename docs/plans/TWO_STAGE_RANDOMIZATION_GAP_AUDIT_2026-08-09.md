# Two-Stage Randomization Gap Audit

Date: 2026-08-09

This is a **read-only factual inventory**, not an implementation task. It
distinguishes the two randomization stages the paper needs, maps each to the
current code, and lists the gaps that still block schema-5 production emission,
a confirmatory pilot, and causal claims in the AAMAS paper.

Lines cite the current working tree.

---

## Stage 1 — primary architecture assignment

- Experiment unit: **run**. `GovernanceStudyContract.primaryAssignmentUnit` is
  optional and accepts `"run" | "group"`
  ([src/lib/experimentation/governanceStudy.ts:38](src/lib/experimentation/governanceStudy.ts#L38)),
  but see Q6 below for group.
- Typical arms: Baseline / Belief State / Epistemic Governance — realized in the
  baseline ladder as `partial_individual`, `independent_ensemble`,
  `vanilla_interaction`, `random_governance`, `diagnostic_governance`,
  `epistemic_governance`, `full_information_oracle`,
  `cost_matched_strong_baseline` (see `src/lib/experimentation/baseline.ts`,
  `TREATMENT_ARMS` in `src/lib/experimentation/assignment.ts:17`).
- Target: run-level ITT / architecture effect.
- Current objects: `GovernanceStudyContract.primaryAssignmentUnit`,
  `TreatmentAssignment`, `RunAssignmentManifest`, `TaskOutcomeRecord`.

## Stage 2 — eligible-event micro-randomization

- Experiment unit: **eligible event** (some action contracts declare `run`; the
  standard epistemic actions are `eligible_event`).
- Arms: `apply` / `holdout` / `sham`.
- Target: mechanism / local mediator / exploratory event-level effects.
- Current objects: `GovernancePolicyContract.assignmentDesign`
  ([src/lib/governance/controlContracts.ts:169-177](src/lib/governance/controlContracts.ts#L169-L177)),
  `GovernanceEventAssignment`
  ([src/lib/governance/eventAssignment.ts:21-41](src/lib/governance/eventAssignment.ts#L21-L41)),
  `GovernanceDecisionRecord`, `GovernanceActionInstance` / lifecycle.
- `eligibleEventEstimand` must remain `exploratory_only` (enforced by
  `validateGovernanceStudyContract` in `src/lib/experimentation/governanceStudy.ts`).

---

## Findings

### Q1. Is the primary assignment bound to concrete arms/probabilities/designRef inside `GovernanceStudyContract`?

**No** for the legacy `TreatmentAssignment@2.0.0` path: it carries
`preregistrationRef`, `primaryAssignmentUnit`, and `governancePolicy`, but no
Stage-1 arm list or probability vector; arm/probability live inside the
persisted `TreatmentAssignment`, linked to the study only through
`policyId`/`policyVersion` and the manifest
([assignment.ts:21-43](src/lib/experimentation/assignment.ts#L21-L43)).

**Update (2026-08-10):** Stage-1 PrimaryAssignment v1 freezes the arm list,
probabilities, designRef, seed namespace, and preregistration inside
`GovernanceStudyContract.primaryAssignmentDesign`
([governanceStudy.ts:49](src/lib/experimentation/governanceStudy.ts#L49)),
with confirmatory studies requiring that design and a study/design
preregistration match. See `docs/architecture/PRIMARY_ASSIGNMENT_V1.md`. The
legacy `TreatmentAssignment@2.0.0` path is unchanged.

### Q2. Can the `TreatmentAssignment` seed be fully replayed from the raw master seed and frozen design?

The answer now depends on which record you mean:

- **Legacy `TreatmentAssignment@2.0.0`** can only **mechanically replay** the
  recorded `derived seed` + recorded probability vector → recorded draw. It
  cannot be re-derived from a frozen design + raw master seed alone, because the
  master seed is **not** stored and the vector is not frozen inside the study
  contract. (`deriveUnitSeed(masterSeed, unitId, policyVersion)` +
  `assignArm(seed, eligibleArms, probabilities)` are deterministic given those
  recorded inputs; `validateTreatmentAssignment` replays and fails on mismatch
  ([assignment.ts:50-94](src/lib/experimentation/assignment.ts#L50-L94),
  [assignment.ts:184-187](src/lib/experimentation/assignment.ts#L184-L187)).)
- **`PrimaryAssignmentV1`** can replay the **full seed and draw** from the
  explicit `masterSeed` + the frozen `PrimaryAssignmentDesignV1` (study ref,
  design hash, seed namespace, stratum, ordered arm vector). The master seed is
  part of the record and the design is frozen in the study contract
  ([primaryAssignment.ts:224-252](src/lib/experimentation/primaryAssignment.ts#L224-L252),
  [primaryAssignment.ts:362-379](src/lib/experimentation/primaryAssignment.ts#L362-L379)).
- The **local self-addressed manifest** detects local tampering (changed
  assignment, design snapshot, or content hash) and retry redraws, but only
  because it is content-hashed and validated against the frozen study design
  ([primaryAssignment.ts:414-441](src/lib/experimentation/primaryAssignment.ts#L414-L441)).
- **Without an external commitment**, a fully self-consistent replacement of the
  whole study + design + assignment + manifest still cannot be distinguished
  from a genuine artifact. The schema-5 verifier does **not** currently
  cross-check the Stage-1 manifest or primary assignment (see Q4).

### Q3. Is the current Runner assignment real randomization or a config-decided single-arm probability 1?

**Config-decided single-arm probability 1 — not real randomization.** The
standard path picks the arm from `governanceMode`
([Runner.ts:522-524](experiments/campaign/pipeline/Runner.ts#L522-L524)) and
calls `createRunAssignment`, which draws with `assignArm(unitSeed, [input.arm],
{ [input.arm]: 1 })`
([assignment.ts:241-243](src/lib/experimentation/assignment.ts#L241-L243)) —
probability 1.0 on one eligible arm. The hiddenbench path likewise assigns
`vanilla_interaction` at probability 1
([Runner.ts:374-380](experiments/campaign/pipeline/Runner.ts#L374-L380)). So the
current writer is a fixed-condition assignment, honestly recorded, not a
randomized primary draw.

### Q4. Does the schema-5 verifier validate the primary assignment, manifest, and task outcome?

**No.** `verifyGovernanceAuditTrailV5`
([replayVerifier.ts:323](experiments/campaign/replayVerifier.ts#L323)) validates
study + trail + runId + schema ref + (optionally) decision replay only. The WP2
lifecycle verifier (`verifyGovernanceLifecycle`) is **gated on schema 4.0** and
returns early for 5.0
([replayVerifier.ts:390](experiments/campaign/replayVerifier.ts#L390)), so
`treatmentAssignment`, `assignmentManifest`, `applicationReceipts`, and
`taskOutcome` are not checked on a schema-5 carrier.

### Q5. Does `AuditableRawRunDataV5` force `taskOutcome` in type and runtime?

**No.** `AuditableRawRunDataV5` is an `Omit<RawRunData, ...> & {...}` that only
narrows `rawSchemaVersion`, `governanceStudy`, `governanceAuditTrail`
([types.ts:400-407](experiments/campaign/types.ts#L400-L407)). `taskOutcome`
remains optional (inherited `taskOutcome?: TaskOutcomeRecord`,
[types.ts:246](experiments/campaign/types.ts#L246)). There is no runtime check
either (Q4). The type is a compile-time carrier, not an enforcing schema.

### Q6. Is `primaryAssignmentUnit = "group"` backed by a carrier/runtime?

**No.** `TreatmentAssignment.unitKind` accepts only `"run" | "eligible_event"`
([assignment.ts:25](src/lib/experimentation/assignment.ts#L25),
[assignment.ts:105](src/lib/experimentation/assignment.ts#L105)). There is no
group unit in `deriveUnitSeed`, the manifest (`validateRunAssignmentManifest`
requires `assignment.unitId === manifest.runId`,
[manifest.ts:93](src/lib/experimentation/manifest.ts#L93)), the Runner, or the
audit trail. `"group"` exists only as an accepted label in the study contract
([governanceStudy.ts:38](src/lib/experimentation/governanceStudy.ts#L38)) and a
confirmatory requirement
([governanceStudy.ts:114-116](src/lib/experimentation/governanceStudy.ts#L114-L116)).
No group carrier exists.

### Q7. Is the final task outcome from an independent private elicitation after discussion?

**No.** `TaskOutcomeRecord` is declared as "scored after discussion"
([lifecycle.ts:60](src/lib/experimentation/lifecycle.ts#L60)), and the Runner
derives `finalRanking`/`finalAccuracy` from the **last-round discussion
opinions** (`lastRound.opinions`, `allItemBeliefs`
[Runner.ts:665-703](experiments/campaign/pipeline/Runner.ts#L665-L703)), not from
a separate private final probability elicitation. There is no independent
post-discussion private elicitation step in the current writer.

### Q8. Is there a dual-authority risk between legacy receipts and schema-5 action instances?

**Yes, latent.** `RawRunData.applicationReceipts`
([types.ts:243-246](experiments/campaign/types.ts#L243-L246)) is a schema-4
record of intervention application; the schema-5 carrier instead carries
`GovernanceActionInstance` + `GovernanceActionTransition` inside the trail. If a
schema-5 raw artifact also populated `applicationReceipts` (it is not excluded
by `AuditableRawRunDataV5`), the two records would describe the same actions
with two different authorities. Nothing currently reconciles them. The risk is
latent because no production path emits schema 5 yet.

### Q9. Which gaps block each downstream goal?

**Schema-5 production emission:**
- Stage-1 primary assignment / manifest / task outcome are not carried into, or
  verified against, the schema-5 carrier (Q4, Q5).
- No production adapter produces source events / observations / diagnoses, and
  no production path builds + seals a trail via `GovernanceAuditTrailBuilder`.
- No external manifest/hash/signature commitment exists
  (see `GOVERNANCE_AUDIT_TRAIL_V1.md` §10).

**Confirmatory pilot:**
- Confirmatory schema 5 requires `governance_decision_replay_required` to be
  resolved by a production rule-registry loader (`replayVerifier.ts:364-370`).
- Stage-1 is a fixed-condition assignment, not a randomized primary draw (Q3);
  confirmatory ITT needs a real primary randomization unit.
- Final outcome is not an independent private elicitation (Q7).

**Causal claims in the AAMAS paper:**
- Stage-2 eligible-event estimates remain subject to repeated events,
  time-varying confounding, and within-run interference; `eligibleEventEstimand`
  must stay `exploratory_only`. Run/group-level primary assignment is the only
  unit that can support ITT claims, and it is not yet randomized or carrier-bound
  (Q1, Q3).
- Group-level analysis has no implementation (Q6).
- `TaskOutcomeRecord` may be scored from a non-private final ranking (Q7).

---

## Conclusions

1. **The schema-5 audit core being verifiable does not mean two-stage
   randomization is identifiable.** Structural replay proves internal
   consistency of the recorded Stage-2 chain; it does not establish that Stage-1
   assignment was randomized, that the final outcome came from an independent
   elicitation, or that Stage-2 effects are causal.
2. **The Runner should not write schema 5 until the Stage-1 contract, final
   outcome, and carrier linkage are frozen** (Q1, Q4, Q5, Q7). The current
   writer must remain on schema 4 (`RAW_SCHEMA_VERSION = "4.0"`).
3. **Stage-2 results are exploratory only**, limited by repeated events,
   time-varying confounds, and interference within a run.

## Owner-decision items (not implemented here)

- Whether to freeze Stage-1 arms/probabilities/designRef inside the study
  contract (new schema field) or keep them in the assignment manifest only.
- Whether `taskOutcome` must come from a separate private final elicitation.
- Whether/when to implement a `group` randomization unit.
- Whether to add a schema-5 verifier gate for primary assignment + manifest +
  task outcome.
