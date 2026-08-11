# Claude Code handoff: confirmatory guardrails close-out

Status: ready for bounded low-risk implementation after Codex core changes
Owner of architecture/final acceptance: Codex
Implementer for this handoff: Claude Code / DeepSeek

## 1. Objective

Finish the mechanical close-out after Codex implemented the high-risk E6/E8
confirmatory-analysis state machine and fail-closed consumers.

Do not redesign the analysis. Your work is limited to:

1. runtime validation for externally constructed role-prior policies;
2. adversarial and regression tests for the already-implemented contracts;
3. synchronization of the two approved documentation files;
4. running and reporting the complete validation suite.

Do not commit. Codex will review the diff and decide what is staged.

## 2. Current architectural decisions — fixed, do not change

The shared confirmatory status set is:

```ts
"computed" | "insufficient_data" | "legacy_mixed_excluded" | "invalid_data"
```

Only `computed` may carry or expose inferential quantities.

- `usable=false` is expected measurement missingness. It is counted and may be
  excluded when enough valid data remain.
- malformed schema-2 data is a broken data contract. One malformed observation
  invalidates the entire confirmatory result; it MUST NOT be silently selected
  around.
- E6 confirmatory inference uses per-run paired bootstrap only. The old
  snapshot-level Fisher-z fallback is prohibited.
- E6 requires at least five usable snapshots in each eligible run and at least
  two eligible runs.
- E8 keeps `MIN_TRANSITIONS_FOR_MEDIATION = 3` and the existing identifiability
  checks. Do not change the threshold, regression, bootstrap, or estimand.
- non-`computed` E6/E8 results must not produce a scientific figure, p-value
  table, effect-size claim, or hypothesis-confirming summary.
- role policy extraction must preserve all current numeric outputs and the
  existing estimator fingerprints.

If a test appears to require changing one of these decisions, stop and report
the exact fixture and failure. Do not change the decision.

## 3. Allowed files

You may edit only:

- `src/lib/agent/roleInertiaPrior.ts`
- `test/role-inertia-prior.test.ts`
- `test/susceptibility-split.test.ts`
- `test/statistical-test-significance.test.ts`
- optionally one new test file:
  `test/confirmatory-analysis-guards.test.ts`
- `docs/architecture/EPISTEMIC_QUANTITY_SEMANTICS.md`
- `docs/experiments/REPLAY_VERIFICATION.md`

Read-only references:

- `experiments/campaign/types.ts`
- `experiments/campaign/pipeline/MetricComputer.ts`
- `experiments/campaign/pipeline/StatisticalTest.ts`
- `experiments/campaign/pipeline/FigureGenerator.ts`
- `experiments/campaign/pipeline/ReportGenerator.ts`
- `src/lib/thermodynamics/ProgressiveEstimator.ts`
- `docs/plans/GOVERNANCE_SEMANTICS_REPLAY_PLAN.md`

Do not edit any read-only reference. If a new test exposes a core defect there,
stop and report it to Codex.

Do not read or modify `.env*`, credentials, raw experiment datasets, debug run
scripts, unrelated docs, or generated output directories.

## 4. Task A — fail-closed role policy validation

In `roleInertiaPrior.ts`, extract one side-effect-free validator and use it from
both `createRoleInertiaPriorPolicy` and `resolveRoleInertiaPrior`.

The resolver must reject a structurally constructed policy that violates any
of the following:

- policy is a non-null object;
- `id` and `version` are non-empty strings;
- `defaultInertia` is finite and in `[0,1]`;
- `rules` is an array;
- every rule is an object;
- every `keywords` value is a non-empty array of non-empty strings;
- every rule inertia is finite and in `[0,1]`.

Constraints:

- validation must not mutate, sort, freeze, lowercase, or normalize caller data;
- preserve first-match behavior;
- preserve the exact three built-in policies;
- do not add a policy id to progressive estimator v1 config;
- do not change any golden fingerprint.

Add direct resolver tests using hand-built invalid objects, including `NaN`,
`Infinity`, out-of-range values, non-array rules, null rules, empty keyword
arrays, non-string keywords, and empty id/version.

## 5. Task B — adversarial confirmatory-analysis tests

Prefer a new `test/confirmatory-analysis-guards.test.ts` with small local raw-run
fixture builders. Do not use real experiment data.

### E6 required cases

1. One malformed schema-2 snapshot plus otherwise sufficient valid data returns:
   - `status === "invalid_data"`;
   - no correlation matrix or inferential numeric fields;
   - `malformedObservationCount > 0`.
2. Missing `behavioralSusceptibilityUsable`, missing estimate/confidence,
   `NaN`, `Infinity`, values outside `[0,1]`, or
   `susceptibility !== socialUpdateGain` are malformed.
3. `usable=false` is counted as unusable, not malformed.
4. Schema-1-only input returns `legacy_mixed_excluded` and no inferential fields.
5. Fewer than two eligible runs returns `insufficient_data`.
6. Two valid runs with at least five valid snapshots each return `computed`.
7. A computed result and `JSON.stringify(result)` contain no `NaN`, `Infinity`,
   or values that serialize unexpectedly as `null`.
8. Correlations stay within `[-1,1]`; perfect collinearity produces finite,
   explicitly capped VIF rather than Infinity.

### E8 required cases

1. One malformed transition plus at least three otherwise identifiable valid
   transitions returns `invalid_data`, never `computed`.
2. Missing usability, estimate/confidence, non-finite values, out-of-range
   values, invalid/duplicate round ordering, non-finite utility entries, or
   a broken `susceptibility === socialUpdateGain` invariant are malformed.
3. `usable=false` is counted as unusable and may yield `insufficient_data`.
4. Schema-1-only transitions return `legacy_mixed_excluded`.
5. Fewer than three usable transitions or an unidentifiable design returns
   `insufficient_data` without effects or CI.
6. A valid identifiable fixture returns `computed` and every persisted number
   is finite.

### Consumer required cases

1. `runTests` maps all non-`computed` E6/E8 states to:
   - `significant === false`;
   - `pValue === 1`;
   - `analysisStatus` equal to the source status;
   - an explicit no-confirmatory-claim conclusion.
2. A forged `computed` E6 object missing bootstrap data fails closed as
   `invalid_data`; it must not use Fisher-z.
3. Existing computed bootstrap tests remain unchanged numerically.

If FigureGenerator/ReportGenerator need direct tests but their useful helpers
are private, test through their existing public entry points. Do not export new
production helpers merely to make testing easier.

## 6. Task C — documentation synchronization

Update only the two allowed docs after tests pass.

Required statements:

- both E6 and E8 expose the four confirmatory statuses;
- any malformed schema-2 observation makes the whole corresponding analysis
  `invalid_data`;
- unusable behavioral estimates are expected missingness and are counted
  separately;
- E6 uses per-run paired bootstrap only and requires at least two eligible runs;
- the snapshot-level Fisher-z fallback is not confirmatory and has been removed;
- non-`computed` results produce no confirmatory statistic, figure, or paper
  claim;
- E6's observation unit is a snapshot; E8's observation unit is a transition;
- `sourceEventIds` canonicality is still not provenance authenticity.

Update validation counts only from the final command output. Do not estimate or
copy an earlier count.

## 7. Frozen regression values

These must remain exactly unchanged:

```text
inputFingerprint:
sha256:01f3081a8826cf7b08bb839bcc9b0ffd13fc6d5342c3c7aeddc821559e8b9a09

configFingerprint:
sha256:2ef661878f8b02240cc632bdfba294c14d2fa317e6af7e730c73b26766da8eda

outputFingerprint:
sha256:01235c4bc4653c109c6293d94b7146a55936bb57855ebe1f36c0d817ce23da4c
```

If any changes, stop. Do not update the expected hashes.

## 8. Validation commands

Run in this order:

```powershell
npx tsc --noEmit
npx vitest run test/confirmatory-analysis-guards.test.ts test/susceptibility-split.test.ts test/statistical-test-significance.test.ts test/role-inertia-prior.test.ts test/governance-estimator-replay.test.ts
npx vitest run
npm run build
git diff --check
git status --short
```

If the optional new test file was not created, omit it from the targeted command.

The known historical `llm-providers.test.ts` dynamic-import mock race may be
reported if it appears once. Re-run that file independently three times and then
one full suite. Do not modify provider code in this task unless the failure is
deterministically caused by the allowed changes.

## 9. Stop conditions

Stop without widening scope if any fix would require:

- editing MetricComputer, StatisticalTest, FigureGenerator, ReportGenerator, or
  campaign types;
- changing E6/E8 formulas, thresholds, bootstrap logic, or observation units;
- changing estimator v1 input/config/output or any fingerprint;
- accepting malformed data by exclusion and continuing to `computed`;
- restoring Fisher-z fallback;
- editing historical raw data;
- touching unrelated untracked files;
- weakening a test to make it pass.

## 10. Final report format

Return only:

1. files changed;
2. behavior matrix for E6/E8 status cases;
3. role-policy validation cases added;
4. exact targeted/full test and build output counts;
5. golden fingerprint result;
6. `git diff --check` result;
7. unresolved findings or stop conditions encountered.

Do not commit. Codex performs final review and staging.
