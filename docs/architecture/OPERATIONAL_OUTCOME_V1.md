# Operational Outcome V1

Date: 2026-08-10

Status: **kernel, schema-5 verification, and the dedicated v6 reference slice are wired; the legacy campaign Runner is not.** The operational pooled-Brier
estimand and its self-addressed artifact exist and are replay-validated at the
kernel level. Schema-5 now requires and cross-replays the analysis unit and
operational outcome. The dedicated binary v6 slice produces them; the general
legacy campaign Runner does not. There is no external commitment.

Authority: `docs/theory/SWARMALPHA_V6_THEORY_CLOSURE_2026-08-10.md` (§4.2),
`src/lib/experimentation/operationalOutcome.ts`.

## 1. Research question and why answered-only is selection

The first-paper ITT endpoint is the operational pooled Brier loss: what did the
**whole assigned protocol** produce, averaged over every pre-registered agent,
when agents who could not produce a valid final probability fall back to a
frozen uninformative reference?

An answered-only pool silently redefines the estimand to "agents who happened to
answer". Because missingness can be treatment-dependent (a governance arm may
change response quality or provoke refusal), dropping non-answered agents turns a
post-treatment variable (missingness) into a sample-selection rule, which breaks
assignment-based ITT identification.

## 2. Five authority objects

| Object | Role | State |
|---|---|---|
| `OperationalAnalysisUnitV1` | pre-assignment commitment: runId, taskId, studyRef, primary claim, ordered unique `expectedAgentIds`, `committedAt`; content-hashed | kernel |
| Stage-1 estimand ref | `PrimaryAssignmentDesignV1.primaryEstimandRef` must equal `swarmalpha.estimand.operational-pooled-brier@1.0.0` | kernel (design + manifest commit it) |
| `FinalOutcomeArtifactV1` | answered/abstained/invalid/unavailable terminal records + resolution + answered-only scores | kernel |
| `OperationalOutcomeArtifactV1` | ITT pooled Brier projection bound to analysis-unit hash, manifest hash, assigned arm, final-outcome hash | kernel |
| schema carrier | schema-5 requires `operationalAnalysisUnit` + `operationalOutcome`; verifier checks source binding, primary estimand and deterministic replay | carrier/verifier kernel |

## 3. Estimand and formulas

Estimand contract: `OPERATIONAL_POOLED_BRIER_ESTIMAND_V1`
(`swarmalpha.estimand.operational-pooled-brier@1.0.0`). V1 freezes:

- `analysisUnit: "run"`, `analysisPopulation: "intention_to_treat"`;
- `claimSelection: "exactly_one_registered_claim"` (one primary binary or
  categorical claim per run);
- `referenceDistributionPolicy: "uniform_over_registered_outcomes"` — π0 is
  **derived deterministically from the registered claim**, never caller-supplied:
  binary → `0.5`; categorical with K options → `1/K` per option in canonical
  registered order;
- `missingnessPolicy: "reference_distribution_for_non_answered"`;
- `poolingPolicy: "equal_weight_registered_agents"` (denominator =
  `N_registered`, never shrinks);
- `properLossPolicy: "registered_claim_contract"` (binary/categorical Brier).

Per agent `i`:

```text
p̃_i = reported final probability,        if terminal status = answered
     = π0 (uniform reference),            if terminal status = abstained/invalid/unavailable
p_operational = (1 / N_registered) Σ_i p̃_i
```

Operational proper loss (resolution `y`):

```text
binary:      L = (p_operational − y)²
categorical: L = Σ_k (p_operational,k − 1[y = k])²
```

`primaryMetric` = `{ metricRef: <estimand id>, value: L, direction: "lower_is_better" }`.

## 4. Four terminal statuses: same number, different meaning

`abstained`, `invalid`, and `unavailable` all contribute `π0` numerically, but
their identities are preserved and counted separately
(`terminalStatusCounts`, per-contribution `terminalStatus`). The identical
numeric fallback defines the operational estimand ("the assigned protocol falls
back to the pre-registered baseline when it cannot produce a prediction"); it is
not a semantic collapse of the four statuses.

## 5. Lifecycle and time order

```text
frozen study + Stage-1 design (primaryEstimandRef = operational Brier)
→ analysis unit committed (claim + roster frozen, before assignment)
→ Stage-1 assignment (manifest created)
→ T/B/G execution
→ discussion completed
→ final private elicitation (terminal records)
→ elicitation closed
→ resolution (truth firewall)
→ final-outcome scoring completed
→ operational outcome computed
→ schema-5 artifact (produced by the dedicated v6 binary slice, not legacy Runner)
```

Enforced orderings (kernel): analysis-unit `committedAt` ≤ assignment
`assignedAt`; primary claim `createdAt` ≤ `committedAt`; manifest `createdAt` ≤
discussion `completedAt`; operational `computedAt` ≥ final-outcome
`scoringCompleted.completedAt`.

## 6. Hash / replay binding

- Analysis-unit contentHash commits run/task/study/claim/roster/committedAt.
- The operational artifact binds: `primaryAssignmentId`, `assignedArmRef`,
  `primaryAssignmentManifestHash`, `analysisUnitHash`,
  `sourceFinalOutcomeHash`, `computedAt`, the frozen estimand contract, the
  claim outcome (counts, reference distribution, contributions, pooled belief,
  operational loss), and `primaryMetric`.
- Validation replays from the frozen study + manifest + analysis unit + final
  outcome. A self-consistent rehash of a tampered field does **not** survive:
  the artifact must equal the deterministic recomputation
  (`validateOperationalOutcomeArtifactV1`).

## 7. Three scalars, three roles

| Scalar | Role |
|---|---|
| `FinalClaimOutcome.pooledProperLoss` (answered-only) | secondary/sensitivity; unchanged, not renamed |
| `TaskOutcomeRecord.quality` (pooled-decision accuracy) | **required** secondary accuracy projection on schema 5 — not a legacy field, not the primary estimand |
| `OperationalOutcomeArtifactV1.primaryMetric.value` (operational pooled Brier) | **primary ITT metric** |

`taskOutcome` must remain present on schema 5 (verified with
`FINAL_OUTCOME_TASK_EVALUATION_V1`); it is a secondary accuracy projection and
is **not** a legacy treatment authority, so it is not flagged by the legacy
authority ban. The three scalars must never be treated as interchangeable; only
the operational Brier defines the ITT endpoint.

## 8. Current implementation state

- **dedicated v6 binary slice**: yes — it builds the pre-assignment unit, runs
  final elicitation, computes the operational outcome, and publishes schema 5.
- **kernel**: yes — operationalOutcome.ts implemented + adversarial-tested
  (analysis-unit contract, frozen estimand, missingness semantics, source
  binding, deterministic replay).
- **legacy campaign Runner**: no — it does not build an analysis unit, run final
  elicitation, or compute an operational outcome.
- **schema-5 carrier/verifier**: yes — `AuditableRawRunDataV5` requires the
  analysis unit and operational outcome; replay emits stable missing/malformed/
  run/source/estimand/replay issue codes.
- **external commitment**: no — no detached manifest/hash/signature.

## 8A. Stable schema-5 issue codes

| code | meaning |
|---|---|
| `missing_operational_analysis_unit` | schema 5 lacks `operationalAnalysisUnit` (including `null`) |
| `malformed_operational_analysis_unit` | analysis unit fails structural validation (schema ref, time, claim, roster, contentHash) |
| `operational_analysis_unit_run_mismatch` | analysis-unit `runId` differs from `RawRunData.runId` |
| `missing_operational_outcome` | schema 5 lacks `operationalOutcome` (including `null`) |
| `malformed_operational_outcome` | operational artifact fails structural/ordering validation |
| `operational_outcome_run_mismatch` | operational artifact `runId` differs from `RawRunData.runId` |
| `operational_outcome_source_mismatch` | `analysisUnitHash` / `primaryAssignmentManifestHash` / `sourceFinalOutcomeHash` does not match a carried artifact |
| `operational_primary_estimand_mismatch` | Stage-1 `primaryEstimandRef` or `primaryMetric.metricRef` does not identify operational pooled Brier |
| `operational_outcome_replay_mismatch` | self-consistent rehash of a claim-outcome/metric field fails deterministic replay |

These codes are frozen; they are not renamed or merged.

## 9. Claim ceiling

Schema-5 verification proves **internal replay** only: it cross-checks the
analysis unit, source bindings, primary estimand, and the deterministic
recomputation of the operational artifact. It does **not** claim:
tamper-proofing, external authenticity, measurement validity, governance
effectiveness, or access to latent belief. No `production-ready`,
`confirmatory-ready`, or `causal effect established` statement is supported.

## 10. Remaining generalization boundary

- Generalize the dedicated binary slice through versioned task adapters without
  weakening pre-assignment commitment, the truth firewall, or single-authority
  replay.
- Add detached external commitment only if claims require artifact authenticity
  beyond internal replay.
