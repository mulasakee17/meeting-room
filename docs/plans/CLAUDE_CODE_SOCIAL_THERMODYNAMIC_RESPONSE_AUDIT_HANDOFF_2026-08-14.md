# Claude Code Handoff — Social-Thermodynamic Response Audit V1

Status: **AUTHORIZED BOUNDED IMPLEMENTATION — zero provider calls**  
Owner theory/validity contract: `docs/theory/SOCIAL_THERMODYNAMIC_RESPONSE_RESEARCH_CONTRACT_V1.md`

## 1. Objective

Implement one read-only analysis over existing V6 verdict artifacts to test whether a simple pre-action collective state is associated with heterogeneous apply-versus-holdout response.

This is not a runtime feature. Do not add a detector, policy, schema, artifact authority, prompt, task, or provider call.

The analysis must answer:

1. Can round-1 categorical reports and evidence registrations deterministically reconstruct `R`, `H_E`, and `kappa = R*(1-H_E)`?
2. Does a development-defined high/low `kappa` split preserve a different apply-minus-holdout Brier response on the task-heldout batch?
3. Does the existing apply mechanism fail because the verdict is mostly non-informative, because probability mass moves away from truth, or because state support is insufficient?

## 2. Allowed files

You may create only:

1. `experiments/campaign/v6/analyze_v6_social_thermodynamic_response.ts`
2. `test/v6-social-thermodynamic-response.test.ts`
3. `docs/experiments/V6_SOCIAL_THERMODYNAMIC_RESPONSE_AUDIT_2026-08-14.md`

You may read, but not modify:

- `docs/theory/SOCIAL_THERMODYNAMIC_RESPONSE_RESEARCH_CONTRACT_V1.md`
- `experiments/campaign/v6/analyze_v6_verdict_combined_exploratory.ts`
- `experiments/campaign/v6/analyze_v6_verdict_task_heldout_replication.ts`
- the verdict plan JSON files in `experiments/campaign/v6/`
- verdict raw-run directories under `experiments/campaign/pilot_output/`
- the relevant epistemic/final-outcome TypeScript types needed to avoid invented shapes.

Stop and return a minimal report if the required analysis cannot be implemented inside this whitelist.

## 3. Absolute prohibitions

- No real or paid LLM/provider call.
- No `.env` or credential access.
- No modification of `src/**`, runtime, schema, prompts, fixtures, task data, plans, manifests, or existing artifacts.
- No movement/deletion/reformatting of existing files.
- No threshold search against heldout outcomes.
- No new feature family, machine-learning dependency, router, policy, or online control.
- No claim of physical free energy, latent belief, detector validity, governance efficacy, or confirmatory evidence.
- No silent fallback from missing evidence identity to raw evidence count.
- No git add/commit/reset/checkout/clean.

## 4. Exact source roles

### Development source

Reuse the exact run discovery/deduplication rules already implemented by `analyze_v6_verdict_combined_exploratory.ts` for the exploratory + continuation verdict batches. Do not count retry/remainder/background copies twice.

### Heldout source

Use only the 96 planned runs in `v6_verdict_task_heldout_replication_v1.plan.json` and the corresponding raw-run directory. Require 96/96 identities and no extras.

### Population

Primary response analysis uses eligible `apply` and `holdout` events only. `sham` is secondary. `ineligible` runs may characterize state distribution but must not enter the randomized primary contrast.

## 5. Pre-action cutoff and field projection

Derive the cutoff from the authoritative Stage-2 assignment `assignedAt`. Do not hard-code a round number without also checking event timestamps.

Allowed pre-action state inputs must be strictly earlier than `assignedAt`:

- `v6InteractionTrace.epistemicEvents[type=belief_reported].report`;
- registered categorical claim/options identity;
- `epistemicEvents[type=evidence_registered].evidence`;
- report evidence references and registered provenance/content hashes;
- task/run identity.

The resolved outcome, final elicitation, arm, verification event, round-2 report, operational outcome, and task outcome must not be accessible to the state-projection function. Design the public function so it accepts a pre-action projection rather than the whole artifact if practical.

Use post-action fields only after state computation for response/outcome analysis.

## 6. Frozen formulas

### 6.1 Alignment `R`

For all valid round-1 reports over the same canonical options:

`R = 1 - mean_pairwise(JSD_base2(p_i, p_j))`.

Requirements:

- JSD is base 2 and bounded `[0,1]`;
- option ordering must not affect the value;
- duplicate/missing agents or invalid distributions fail closed;
- one-agent state is unsupported, not `R=1` by convenience.

### 6.2 Evidence diversity `H_E`

For every evidence reference in the included reports, bind exactly one registered evidence object. Canonical evidence identity is:

1. non-empty item-specific `provenance.lineageId`, when present and semantically usable;
2. otherwise exact `provenance.contentHash`.

The observed coarse values `private` and `shared` are visibility/category labels, not item-specific lineage identities. Do not merge unrelated evidence under those labels; use content hash for those records.

Let `q_j` be the fraction of evidence references assigned to identity `j`:

`H_E = -sum(q_j*log2(q_j))/log2(m)` for `m >= 2`.

For exactly one valid identity, `H_E=0`. For zero valid evidence references, `H_E=null`, not zero.

This is represented-evidence identity entropy, not quality, coverage, truth, independence proof, or sufficiency.

### 6.3 Crystallization index

`kappa = R*(1-H_E)` only when both inputs are finite.

It is a descriptive index with no control authority.

### 6.4 Post-action response

Compute, without feeding these values into state projection:

- final pooled Brier from `operationalOutcome.primaryMetric.value`;
- pre-action pooled categorical distribution by equal-weight averaging the valid round-1 reports;
- change in probability mass on the later resolved option: `finalPTruth - prePTruth`;
- change in pooled Brier from pre-action to final;
- final invalid/abstained/unavailable counts;
- apply verdict enum and explanation availability.

For apply only, optionally calculate **outcome-direction concordance**:

- `supported` is concordant when the selected report's top option equals the later resolution;
- `contradicted` is concordant when the selected report's top option differs from the later resolution;
- `insufficient_evidence` is unscored.

Do not call this verifier accuracy: the verdict evaluates a public claim/message and may not be equivalent to the top-option proposition.

## 7. Development-to-heldout rule

1. Reconstruct all development pre-action states without outcome access.
2. Define `kappaCut` as the median of finite development `kappa` values among all eligible events before separating apply/sham/holdout. The median calculation must not read treatment assignment or outcomes.
3. Freeze that numeric cut in the analysis result object for the current execution; do not write it into runtime or config.
4. Apply the exact cut to heldout events:
   - `low`: `kappa < kappaCut`;
   - `high`: `kappa >= kappaCut`.
5. For each stratum report apply/holdout `n`, task count, mean final Brier, and apply-minus-holdout difference.
6. Report interaction contrast: `Delta_high - Delta_low`.
7. Reuse or minimally adapt the deterministic task-cluster bootstrap convention from the heldout analyzer. Report valid fraction. Do not invent a new asymptotic p-value with only a few task clusters.

No stratum supports a benefit statement unless its apply-minus-holdout point estimate is negative, its uncertainty upper bound is below zero, both arms have at least 10 events and 6 task clusters, and all artifacts are present/replay-qualified. Otherwise label it `DEFER`.

Because the heldout aggregate was already inspected before this secondary analysis, even a passing stratum remains **secondary task-heldout evidence**, not confirmatory evidence.

## 8. Required mechanism tables

Produce compact tables for:

1. state completeness and missing reasons by dataset/task;
2. correlations among `R`, `H_E`, and `kappa` to expose collapse;
3. apply/holdout/sham response by high/low `kappa`;
4. apply verdict distribution and outcome-direction concordance;
5. pre-to-final truth-mass and Brier movement by arm/verdict;
6. task-level apply-minus-holdout response, clearly marked descriptive when sparse.

Do not add plots unless a table cannot communicate the result.

## 9. Fail-closed conditions

At minimum test:

1. post-assignment evidence/report cannot enter pre-action state;
2. option order permutation preserves `R`, while option identity drift rejects;
3. missing/extra/duplicate agent report rejects a state snapshot;
4. dangling or multiply bound evidence reference rejects `H_E`;
5. zero evidence returns `H_E=null`, not zero;
6. final outcome or resolution mutation does not alter `R/H_E/kappa`;
7. development outcome mutation does not alter `kappaCut`;
8. duplicate physical artifact/run identity is rejected or deterministically deduplicated only by the already-authoritative combined-run rule;
9. heldout missing run rejects full analysis;
10. synthetic state strata reproduce hand-calculated response differences and DEFER gates.

Use deterministic fixtures only. No sleeps, network, random unseeded bootstrap, or whole-file snapshots.

## 10. Result document discipline

The result document must begin with one of:

- `STATE-RESPONSE SIGNAL PRESERVED — secondary evidence only`;
- `DEFER — insufficient support/uncertainty`;
- `STATE-RESPONSE HYPOTHESIS NOT PRESERVED`;
- `STOP — projection or authority failure`.

Separate FACT / INFERENCE / HYPOTHESIS / LIMITATION. Include exact counts, missingness, formulas, cutoff, estimates, intervals, artifact locations, and commands.

If the state-response direction fails heldout, say so directly. Do not create a new composite, threshold, or subgroup.

## 11. Acceptance commands

Run:

```text
git diff --check
npx tsc --noEmit
npx vitest run test/v6-social-thermodynamic-response.test.ts
npx vitest run
npm run build
```

If the known `uv_os_get_passwd ENOMEM` machine-resource failure occurs, record it accurately, retry once with reduced concurrency if available, and do not skip or relabel a deterministic failure.

## 12. Final report back to Codex

Return:

1. exact modified files;
2. each test and invariant;
3. exact development/heldout counts and state missingness;
4. `R/H_E/kappa` dependence;
5. frozen development median cut;
6. high/low heldout arm counts, effects, intervals, and DEFER gates;
7. mechanism tables;
8. any red-zone issue or deviation;
9. explicit declaration of zero provider calls, zero credential access, and zero git writes.
