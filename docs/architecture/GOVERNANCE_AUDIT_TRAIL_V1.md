# Governance Audit Trail V1

Date: 2026-08-09

Status: reserved/validated carrier. The production Runner still writes schema 4;
schema 5.0 is not emitted by any current production path.

This document describes what the audit-trail carrier is, what each verification
level proves, and what it deliberately does not prove. It is a factual
statement of the implemented core
(`src/lib/experimentation/governanceAuditTrail.ts`,
`src/lib/experimentation/governanceAuditTrailBuilder.ts`, and the governance
kernels), not a design intent or a claim of experimental validity.

## 1. The authoritative governance chain

A schema 5 carrier ties a run to one append-only, cross-linked chain:

```text
hashed source event
→ versioned observation (descriptive projection, no control permission)
→ diagnosis (versioned interpretation, `sourceObservationIds` link back)
→ awaiting-assignment eligibility decision
→ preregistered event assignment (bound to canonical unit + candidate-set hash)
→ closing decision (held_out / selected / ...)
→ parameterized action instance (selected parameters + expected cost)
→ delivery / compliance observation
→ completed / censored / failed / held_out  (terminal lifecycle states)
```

Facts:

- Every source event is content-addressed; the recorded `contentHash` must
  equal a canonical hash of `eventRef + kind + round + payload`.
- Every observation, diagnosis, decision, assignment, action instance, and
  lifecycle transition cross-references earlier records by stable id. A
  reference to a record that does not exist, or to a record with a later round
  than the referencing record, fails validation. Timestamps are additionally
  constrained: each record must lie within the audit window
  (`createdAt`…`sealedAt`) and must not precede the records it references.
- `censored` is an explicit terminal action state for runs that end before a
  planned observation window closes. It is distinct from `completed` and
  `failed`; a censoring transition must record a censoring observation.
- `completed` means the declared observation window closed; it never means the
  action was effective.

## 2. Randomization-unit normalization

Two kinds of draw are distinguished, and both are bound to a canonical
randomization-unit identity:

- A **run-level** draw is fixed for a given `runId` + action family + design +
  probability vector. Its derived seed does **not** include the eligible
  candidate-set hash, so within one run the arm stays stable even if the
  candidate set changes from event to event.
- An **eligible-event** draw is bound to the normalized event unit
  (`runId:eligible:<eligibilityDecisionId>`) **and** to the candidate-set hash.
  A change in the eligibility decision (or its candidate identity) produces a
  new unit and a new draw.

The `unitId` is derived from `runId`, `unitKind`, and `eligibilityDecisionId`;
it is **not** accepted from the caller. This prevents a caller from redrawing
an event by choosing a unit id until a preferred arm appears. The audit
validator re-derives the expected `unitId` and rejects any assignment whose
stored `unitId` differs, even if `derivedSeed`/`randomDraw`/`assignedArm` are
recomputed self-consistently.

The seed commitment changes whenever `actionRef`, `seedNamespace`, the
probability vector, or the arm order changes. A deterministic `apply`-seeking
loop over `masterSeed` is a test-fixture convenience only; production must not
redraw by changing the master seed.

## 3. GovernanceAuditTrailBuilder semantics

`GovernanceAuditTrailBuilder` is the runtime construction boundary for an
audit artifact:

- **In-process append-only**: each `commit` stages a deep clone, appends the
  batch in fixed topological order (source → observation → diagnosis → decision
  → assignment → action instance → transition), and validates the whole staged
  trail before making it visible. Any corrupt record rejects the entire batch.
- **Batch atomicity**: a failed commit leaves the builder state identical to the
  prior snapshot; a returned snapshot is an isolated clone, so mutating it does
  not affect the builder.
- **Sealed immutability**: after `seal`, the trail is immutable; further
  `commit` or `seal` calls are rejected.

The builder provides **process-internal** batch atomicity only. It does not
provide durable-storage atomicity, external authenticity, or tamper-proofing;
those belong to a separate artifact store that is not implemented.

## 4. The four replay states

Verification returns exactly one status:

| status | meaning |
|---|---|
| `open_structural_replay_verified` | open trail; hashes/structure/references/assignment/lifecycle all verified; executable rules not run |
| `sealed_structural_replay_verified` | sealed trail; structural verification plus sealed-trail invariants (exactly one closing decision per assignment, one action instance per decided action, terminal lifecycle) |
| `open_decision_replay_verified` | open trail; structural verification plus executable decision replay against version-matched rules |
| `sealed_decision_replay_verified` | sealed trail; structural verification plus executable decision replay |

The four are mutually exclusive and are the only verification levels. A
confirmatory schema 5 carrier that has not undergone decision replay fails
closed with `governance_decision_replay_required`; it must never be reported as
a decision-replayed success.

## 5. Structural replay scope

Structural replay verifies:

- content hashes;
- record structure and canonical replayable values;
- cross-record references and round ordering (no future source events /
  observations / diagnoses);
- timestamp ordering within the audit window and against referenced records;
- preregistered per-action probability tables in the policy `assignmentDesign`;
- the deterministic assignment draw (derived seed, random draw, assigned arm,
  recorded probability) against the preregistered vector;
- the canonical randomization-unit identity (`unitId` re-derived from `runId` +
  `unitKind` + `eligibilityDecisionId`);
- rule-config snapshots and decision/assignment consistency;
- action-instance parameter/cost/actionRef/targetIds consistency with the
  recorded decision;
- the action lifecycle transition chain.

Structural replay does **not** recompute:

- observation projections;
- diagnosis interpretations;
- eligibility-rule decisions.

It therefore cannot detect an internally consistent but wrongly projected
observation or a misdiagnosis.

Limitation: structural replay validates the **final** structure of the
artifact. It cannot, by itself, prove that the artifact was actually generated
historically in append-only order (for example, that a builder truly appended
records one batch at a time). That property is enforced at write time by the
builder; replay only sees the finished structure.

## 6. Decision replay scope

Decision replay:

- requires an executable rule registry that exactly matches the study policy
  by `id@version`;
- checks every rule snapshot `config` against the executable rule config;
- re-executes `GovernanceDecisionEngine.decide` for each stored decision using
  the stored diagnoses, budget, and assignment;
- fails closed on any mismatch between the replayed and the stored decision.

Decision replay proves that the recorded decisions are reproducible from the
recorded diagnoses **given the supplied rule implementations**. It does not
re-derive the diagnoses themselves.

## 7. Diagnosis construct validity is not re-proven

Even when decision replay passes, nothing in the carrier re-establishes that
the stored diagnosis is a valid measurement of the construct it names.
Construct validity must be argued separately (measurement reliability,
calibration artifact, domain); replay only checks that the records are
internally consistent and reproducible.

## 8. Schema 5 is reserved/validated, not emitted

`RawSchemaVersion` recognizes the reserved `5.0`, and a `GovernanceAuditTrail`
carrier can be validated. The production Runner still writes
`RAW_SCHEMA_VERSION = "4.0"`. No current production path emits schema 5, and no
`governanceStudy` / `governanceAuditTrail` declaration is inferred from
`isMain`, `governanceMode`, arm names, filenames, or descriptions.

Schema-5 replay requires **two independent authority gates** that are both
separate from this audit trail: a Stage-1 primary-assignment gate
(`primaryAssignmentManifest` + `primaryArmExecutionRegistry` +
`primaryArmExecution`, which cross-check the run, study, audit-trail open time,
and task outcome, and reject schema-4 treatment authorities; see
`docs/architecture/PRIMARY_ARM_EXECUTION_V1.md`), and a final-outcome gate
(`finalOutcome` + matching `taskOutcome`; see
`docs/architecture/FINAL_PRIVATE_OUTCOME_V1.md`). `AuditableRawRunDataV5`
requires all of them and forbids schema-4 treatment fields at compile time.

## 9. No confirmatory or paid experiment has run

No paid LLM pilot or confirmatory experiment has been run. The audit-trail core
is exercised only by deterministic fixtures and mock-injected tests.

## 10. A fully forged artifact is not detectable by replay alone

Replay verification proves internal self-consistency against the carrier's own
declared contracts. An artifact that is fully forged but internally consistent
(hashes recomputed, references rewired, draws redrawn within the design) cannot
be distinguished from a genuine run by replay alone. Identifying it requires an
external commitment: a manifest/hash/signature captured before or independent
of the artifact. **No such external manifest/hash/signature commitment is
implemented.** This limitation is deliberate and documented.
