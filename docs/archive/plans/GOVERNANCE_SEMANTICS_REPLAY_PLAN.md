# Governance semantics consolidation and exact replay plan

Status: implementation handoff

Base commit: `005ae08`

Priority: paper integrity > reproducibility > compatibility > convenience

Execution model: one bounded batch and one commit at a time; stop after every batch for review

## 1. Objective

Complete the next reproducibility and semantic-consolidation layer without changing unrelated governance behavior:

1. make every persisted governance estimate exactly replayable from its own record;
2. separate behavioral susceptibility from the DeGroot update coefficient;
3. replace duplicated hidden role tables with explicit, versioned policies while preserving current defaults;
4. prevent legacy or semantically mixed experiment data from silently entering paper metrics.

This work must improve auditability. It must not manufacture evidence, retrofit causal meaning, or silently change historical results.

## 2. Frozen semantic decisions

These decisions are not open design questions during implementation.

### 2.1 Two quantities, not one susceptibility

`behavioralSusceptibility` means the observed exposure-response estimate:

```text
timesRespondedAfterExposure / timesExposed
```

It is emitted by `ProgressiveEstimator`, carries estimator confidence, and is unusable below the configured exposure threshold. It is a governance estimate derived from behavioral counters. It is not a causal effect.

`socialUpdateGain` means the operational DeGroot mixing coefficient:

```text
max((1 - inertia) * (1 - confidence), 0.05)
```

It controls how much another agent's expressed utility enters a local update. It is a policy/model coefficient, not an empirically observed susceptibility estimate.

The system MUST NOT fall back from one quantity to the other. A missing or unusable behavioral estimate remains missing/unusable. `socialUpdateGain` may still be computed because it has a different purpose.

The existing `susceptibility` field/function may remain temporarily as a deprecated compatibility alias, but every new internal consumer and every new experiment record must use one of the two explicit names.

### 2.2 Historical defaults remain reproducible

The two current role tables are not to be merged by choosing whichever values look better:

- the larger table in `cognitiveState.ts` is the legacy post-hoc policy;
- the smaller table in `ProgressiveEstimator.ts` is the progressive estimator v1 policy.

They must become two explicitly named and versioned policies using one shared resolver. Existing call sites retain their current policy by default, so current numeric behavior is unchanged. A neutral policy may be added for future experiments but MUST NOT become the default in this change.

### 2.3 Exact replay requires the actual estimator input

`inputFingerprint` alone is insufficient for replay. Do not reconstruct estimator input from `cognitiveTrajectory`: that snapshot currently omits behavior counters, stated openness, role, confidence source fields, and exact utility history.

Every new `GovernanceEstimate` record must therefore persist its canonicalized input snapshot in addition to the fingerprint. Replay uses that stored input, stored full config, exact estimator id/version, source event ids, and stored output.

### 2.4 Old data is not silently upgraded

Records without an input snapshot are `legacy_unverifiable`, not verified and not corrupt by definition. New CLI verification must return a non-zero status unless the caller explicitly allows legacy-unverifiable records. No code may invent missing inputs from approximate trajectory data.

### 2.5 Experiment metrics fail closed on semantic mixing

The existing campaign `CognitiveStateSnapshot.susceptibility` can contain behavioral estimates in some rounds and formula-derived values in other rounds. It is a mixed quantity and cannot support a clean paper claim.

New schema records must store the two quantities separately. New analysis must not consume the mixed field. Existing datasets may be read for compatibility but must be marked legacy/mixed and excluded from new confirmatory metrics.

## 3. Global constraints

- Work from `005ae08`; inspect `git status --short` before each batch.
- Do not touch or stage unrelated untracked files under `docs/` or `experiments/campaign/`.
- Never use `git add -A` or `git add .`; stage only named files.
- Do not modify `.env*`, provider configuration, credentials, model settings, prompts, benchmark answers, or generated experiment output.
- Do not modify estimator v1 numeric formulas or default parameter values.
- Do not relabel telemetry as probability, verified evidence, calibration, ground truth, or causal influence.
- Do not weaken fail-closed behavior to make tests pass.
- Do not regenerate experiment data in this implementation task.
- Every batch must pass `npx tsc --noEmit` and its targeted tests before commit.
- After all batches, run `npm test -- --run` and `npm run build`.

## 4. Batch A — persist exact inputs and implement replay verification

Risk: medium. This changes an audit record and raw-data schema, not estimator mathematics.

Suggested commit: `feat: add exact governance estimate replay`

### 4.1 Allowed files

- `src/lib/epistemic/semantics.ts`
- `src/lib/epistemic/estimators.ts`
- `src/lib/epistemic/index.ts`
- new `src/lib/epistemic/replay.ts`
- `src/lib/thermodynamics/ProgressiveEstimator.ts` only for type propagation if required
- `experiments/campaign/types.ts`
- `experiments/campaign/pipeline/Runner.ts`
- new `experiments/campaign/verify_replay.ts`
- `experiments/campaign/generate_manifest.ts` only for additive replay metadata
- `package.json` only for one new script
- relevant existing tests and new `test/governance-estimator-replay.test.ts`

Do not edit documentation in this batch.

### 4.2 Record contract

Generalize the record without losing existing type safety:

```ts
interface GovernanceEstimate<Output = unknown, Input = unknown, Config extends object = object> {
  // existing fields remain
  input: Input;
  config: Config;
  value: Output;
}
```

`GovernanceEstimatorRegistry.project()` must:

1. validate input and config;
2. canonical-clone and freeze the values used for execution;
3. compute input/config fingerprints from those exact canonical values;
4. execute and validate the output;
5. return a fresh canonical clone of `input`, `config`, and `value` so caller mutation cannot alter registry internals;
6. preserve sorted unique `sourceEventIds` and exact determinism metadata.

Do not persist only an encoded JSON string. Persist structured JSON-compatible input so third parties can inspect and replay it.

### 4.3 Raw schema version

Add an additive field to newly written campaign data:

```ts
rawSchemaVersion?: "1.0" | "2.0";
```

The field remains optional in the TypeScript reader for old fixtures. Both Runner write paths must emit `"2.0"`. Schema 2.0 means governance estimate records, when present, contain exact input snapshots.

Do not rewrite old files or infer a schema version from their timestamps.

### 4.4 Replay library

Add a pure verification API in `src/lib/epistemic/replay.ts`. It must not read files or call `process.exit`.

Recommended result shape:

```ts
type ReplayStatus =
  | "verified"
  | "mismatch"
  | "legacy_unverifiable"
  | "unsupported_estimator"
  | "invalid_record";

interface GovernanceReplayResult {
  status: ReplayStatus;
  estimatorId?: string;
  estimatorVersion?: string;
  name?: string;
  mismatches: Array<
    | "input_fingerprint"
    | "config_fingerprint"
    | "output_fingerprint"
    | "output_value"
    | "determinism"
  >;
  message?: string;
}
```

Verification algorithm:

1. validate the minimum record shape without invoking getters or accepting non-JSON state;
2. if `input` is absent, return `legacy_unverifiable`;
3. resolve exact `estimatorId + estimatorVersion`; never choose latest and never downgrade;
4. recompute through `registry.project()` using stored name, input, config, and source ids;
5. compare recomputed input/config/output fingerprints with stored fingerprints;
6. compare canonicalized recomputed output with canonicalized stored value;
7. compare determinism metadata exactly;
8. return all observed mismatches, not only the first one;
9. catch malformed records and return `invalid_record`; do not throw for untrusted JSON.

For deterministic and seeded contracts, run the projection twice with the same stored input/config and require identical output fingerprints. This is a runtime invariant check, not a proof of determinism.

### 4.5 Replay CLI

Create a thin CLI:

```text
npm run verify:replay -- <raw-file-or-directory>
```

Requirements:

- accept exactly one JSON file or recursively scan a directory;
- sort paths by code-point order, not locale-sensitive order;
- ignore known derived summaries and `.error.json` files;
- parse with `safeJsonParse`;
- verify every `governanceEstimateHistory` record using the default progressive registry;
- validate uniqueness of `(round, agentId)` and stable name/id/version fields;
- print counts for verified, mismatch, legacy-unverifiable, unsupported, and invalid;
- print compact file/round/agent diagnostics for failures;
- exit 0 only when all discovered records are verified;
- optionally accept `--allow-legacy-unverifiable`, which still reports legacy records but permits exit 0 if there are no other failures;
- never modify the raw files.

Keep file traversal and report aggregation in exported functions so tests do not spawn subprocesses unnecessarily.

### 4.6 Manifest integration

If `generate_manifest.ts` is changed, add only additive metadata:

- `rawSchemaVersion`
- `governanceEstimateCount`
- `governanceReplayStatus`: `verified | mixed | legacy_unverifiable | absent`

Manifest generation may call the pure replay library. It must not hide mismatch details or label unsupported versions verified. Preserve existing SHA-256 behavior.

### 4.7 Required tests

- valid record round-trips and returns `verified`;
- altered input with stale fingerprint is detected;
- altered config is detected;
- altered output value/fingerprint is detected;
- missing input returns `legacy_unverifiable`;
- unknown exact version returns `unsupported_estimator`;
- repeated deterministic projection is stable;
- returned record input/config/value are mutation-isolated;
- directory traversal and report ordering are deterministic;
- duplicate `(round, agentId)` fails;
- Runner emits schema 2.0 in both applicable write paths;
- existing schema-1 fixtures still parse but are not called replay-verified.

### 4.8 Batch-A stop conditions

Stop without guessing if:

- exact replay would require reconstructing an omitted field;
- a caller relies on mutating returned governance records;
- a test requires changing estimator v1 output;
- replay requires reading secrets or calling an LLM.

Report the blocker with file and line references.

## 5. Batch B — split behavioral susceptibility from social update gain

Risk: medium-high. The names affect detectors and experiment analysis, so follow the frozen definitions exactly.

Suggested commit: `refactor: separate susceptibility from update gain`

### 5.1 Allowed files

- `src/lib/agent/cognitiveState.ts`
- `src/lib/governance/types.ts`
- `src/lib/governance/cognitiveDetectors.ts`
- `src/lib/thermodynamics/MeasurementLayer.ts`
- `src/lib/thermodynamics/computeDelta.ts` only if names/comments require clarification
- `src/lib/discussion/nativeCognitiveEngine.ts`
- `src/runtime/GovernanceRuntime.ts`
- `experiments/campaign/types.ts`
- `experiments/campaign/pipeline/Runner.ts`
- `experiments/campaign/pipeline/MetricComputer.ts`
- `experiments/campaign/pipeline/StatisticalTest.ts` only for fail-closed legacy handling
- directly relevant tests

Do not change the ProgressiveEstimator exposure-response formula in this batch.

### 5.2 Runtime API

Introduce:

```ts
computeSocialUpdateGain(inertia, confidence): number
```

It must return the exact current formula and floor, preserving `updateUtility` numerics.

Retain:

```ts
/** @deprecated Use computeSocialUpdateGain. */
computeSusceptibility(...): number
```

as a temporary exact alias only. New internal code must not call it.

Extend `CognitiveGovernanceState` additively:

```ts
socialUpdateGain: number;
behavioralSusceptibility?: {
  estimate: number;
  confidence: number;
  usable: boolean;
};
/** @deprecated compatibility alias of socialUpdateGain */
susceptibility: number;
```

For compatibility with external callers, detectors may read `socialUpdateGain ?? susceptibility`, but all built-in state builders must populate both explicit fields. `susceptibility` must always equal `socialUpdateGain`; it must never switch to the behavioral estimate.

### 5.3 Consumer routing

- `updateUtility`: use `computeSocialUpdateGain`.
- `MeasurementLayer.buildDetectorInput`: expose social update gain and the separate behavioral estimate. Remove the current behavioral-then-formula fallback.
- `NativeCognitiveEngine.buildGovernanceStateMap`: use the same helper, including the 0.05 floor; remove the duplicated inline formula.
- `GovernanceRuntime.buildCognitiveGovernanceStates`: use the same helper; remove duplication.
- authority-bias/asymmetry detector: consume `socialUpdateGain`, because it models relative openness to social updating.
- delta unresponsive-to-exposure diagnosis: continue consuming only `ProgressiveEstimates.susceptibility` and require `usable`; never substitute social update gain.
- intervention confidence gating: continue consuming the behavioral estimator confidence where it explicitly asks for susceptibility estimator confidence.

If result types expose `susceptibilityAsymmetry`, add `socialUpdateGainAsymmetry` as the primary name and retain the old field as a deprecated equal-valued alias for one compatibility cycle.

### 5.4 Campaign schema

For schema 2.0 snapshots add:

```ts
socialUpdateGain: number;
behavioralSusceptibilityEstimate: number;
behavioralSusceptibilityConfidence: number;
behavioralSusceptibilityUsable: boolean;
/** @deprecated schema-1 compatibility; equals socialUpdateGain in schema 2.0 */
susceptibility: number;
```

Never populate the schema-2 deprecated field with a round-dependent mixture.

### 5.5 E8 and paper-safety rule

The existing E8 mediation series is semantically mixed and may be mechanically coupled to inertia. Do not silently preserve the old claim.

For schema 2.0:

- the confirmatory susceptibility series may use only `behavioralSusceptibilityEstimate` where `behavioralSusceptibilityUsable === true`;
- report the usable observation count and exposure-selection rule;
- do not substitute `socialUpdateGain` for missing behavioral estimates;
- if the existing metric/result type cannot express insufficient data honestly, return the project's existing not-applicable/insufficient-data form or stop and report the required type change;
- do not combine schema-1 mixed values with schema-2 behavioral values in one estimate.

For schema 1.0 or missing version:

- preserve loading compatibility;
- label the old series `legacy_mixed_susceptibility`;
- exclude it from new confirmatory aggregation and significance claims.

Do not redesign the mediation model, thresholds, bootstrap procedure, or paper hypothesis. If those changes are necessary, stop for Codex review.

### 5.6 Required tests

- old updateUtility numeric fixtures remain byte-for-byte/equality stable;
- `computeSusceptibility` equals `computeSocialUpdateGain` and is used nowhere new;
- unusable behavioral susceptibility never becomes a formula value;
- detector input contains both quantities with distinct provenance/meaning;
- native engine, MeasurementLayer, and GovernanceRuntime compute identical social update gain including the 0.05 floor;
- authority detector uses social update gain;
- delta exposure diagnosis requires usable behavioral susceptibility;
- schema-2 snapshots never contain the historical mixed behavior;
- schema-1 data is marked legacy and excluded from new confirmatory E8 aggregation;
- no new field is described as probability or causal effect.

### 5.7 Batch-B stop conditions

Stop and report if a passing test requires:

- treating the two quantities as interchangeable;
- silently changing an experimental hypothesis;
- recomputing or rewriting historical raw data;
- deleting the compatibility alias immediately;
- changing estimator v1 parameters.

## 6. Batch C — make role priors explicit and versioned

Risk: low-medium if numeric defaults are preserved.

Suggested commit: `refactor: version role inertia prior policies`

### 6.1 Allowed files

- new `src/lib/agent/roleInertiaPrior.ts`
- `src/lib/agent/cognitiveState.ts`
- `src/lib/agent/index.ts` if an export is required
- `src/lib/thermodynamics/ProgressiveEstimator.ts`
- targeted tests, preferably new `test/role-inertia-prior.test.ts`

Do not modify detector thresholds, evidence formulas, or experiment configurations.

### 6.2 Policy model

Implement an immutable data-only policy:

```ts
interface RoleInertiaPriorPolicy {
  readonly id: string;
  readonly version: string;
  readonly defaultInertia: number;
  readonly rules: ReadonlyArray<{
    readonly keywords: readonly string[];
    readonly inertia: number;
  }>;
}
```

Provide exactly three named policies:

1. `legacy-posthoc@1.0.0`: exact current large table and fallback 0.4;
2. `progressive-icl@1.0.0`: exact current small table and fallback 0.4;
3. `neutral@1.0.0`: no keyword rules and fallback 0.5, future explicit opt-in only.

Add one resolver:

```ts
resolveRoleInertiaPrior(role: string, policy: RoleInertiaPriorPolicy): number
```

Requirements:

- validate finite values in `[0,1]`;
- reject empty ids, versions, and keywords;
- preserve first-match ordering;
- use locale-independent lowercase matching;
- deep-freeze exported policies;
- never mutate or sort the caller's rules;
- do not add fuzzy matching, embeddings, LLM calls, or task-specific inference.

### 6.3 Integration

- remove the private duplicate tables from both existing files;
- `updateInertia` accepts an optional policy argument defaulting to `legacy-posthoc@1.0.0`;
- legacy initialization uses the same legacy policy;
- ProgressiveEstimator defaults are populated from `progressive-icl@1.0.0` so the serialized config and fingerprint remain numerically identical;
- custom ProgressiveEstimator config continues to work because the full rules remain in its recorded config;
- do not add a policy id to estimator v1 config if that changes its recorded default config fingerprint. A future estimator version can make the policy id part of the formal schema.

### 6.4 Required tests

- table-driven assertions for every current keyword and fallback in both historical policies;
- overlapping keywords preserve first-match order;
- Chinese and English matching remains unchanged;
- caller mutation cannot alter an exported policy;
- invalid policies fail closed;
- all existing inertia estimator snapshots remain equal;
- `inputFingerprint`, `configFingerprint`, and `outputFingerprint` for an existing fixed fixture remain unchanged from a golden value captured before refactor;
- neutral policy is opt-in and not used by default.

### 6.5 Batch-C stop conditions

Stop if extraction changes any default inertia output or existing estimator fingerprint. Report the exact before/after fixture instead of updating the golden value.

## 7. Batch D — documentation and audit synchronization

Risk: low. Perform only after A-C are accepted.

Suggested commit: `docs: document replay and split susceptibility semantics`

Allowed targets only:

- `docs/architecture/EPISTEMIC_QUANTITY_SEMANTICS.md`
- optionally one new `docs/experiments/REPLAY_VERIFICATION.md`

Required content:

- exact replay inputs and CLI usage;
- schema 1 versus schema 2 handling;
- behavioral susceptibility versus social update gain definitions;
- why fallback and mixed E8 data are prohibited;
- named role-policy versions and unchanged historical defaults;
- explicit limitations: deterministic declaration is not proof, evidence telemetry is not verification, behavioral response is not causal effect;
- current test/build counts from actual command output only.

Do not edit roadmap, paper claims, README, or unrelated technical documentation in this batch.

## 8. Final validation checklist

Run in this order:

```powershell
npx tsc --noEmit
npx vitest run test/governance-estimator-registry.test.ts test/governance-estimator-replay.test.ts test/governance-runtime-estimator.test.ts test/cognitive-state.test.ts test/cognitive-detectors.test.ts test/delta-diagnosis.test.ts test/measurement-layer.test.ts test/native-cognitive-engine.test.ts test/pipeline.test.ts
npm test -- --run
npm run build
git diff --check
git status --short
```

Then perform one synthetic replay:

1. construct or use a test fixture with a schema-2 `governanceEstimateHistory`;
2. verify it successfully;
3. alter one stored output value without changing its fingerprint;
4. verify that the CLI exits non-zero and names `output_value` or `output_fingerprint`;
5. restore/remove only that disposable fixture.

The final report must list:

- commits created;
- exact files changed per batch;
- tests/build results;
- any compatibility aliases retained;
- any legacy data now excluded from confirmatory analysis;
- unresolved risks, especially E8 sample selection and lack of a verified evidence oracle.

## 9. Recommended Claude Code execution prompts

Use a fresh Claude Code context for each batch. Do not ask one session to implement all four batches.

### Prompt A

```text
Implement Batch A only from docs/plans/GOVERNANCE_SEMANTICS_REPLAY_PLAN.md at base commit 005ae08. Read only section 1-4, the files listed in 4.1, and their directly imported types. Do not edit documentation or unrelated files. Preserve estimator v1 numerical behavior. Add exact input persistence, schema-2 writes, the pure replay verifier, CLI, and required tests. Run the targeted tests and typecheck. Show git diff --stat and git diff --check. Do not commit until the user reviews the diff. Stop on every stop condition in section 4.8.
```

### Prompt B

```text
After Batch A is reviewed and committed, implement Batch B only from docs/plans/GOVERNANCE_SEMANTICS_REPLAY_PLAN.md. The semantic definitions in section 2.1 and routing rules in section 5 are fixed. Separate behavioralSusceptibility from socialUpdateGain, remove all internal fallback between them, preserve the deprecated compatibility alias, make schema-2 snapshots non-mixed, and make new E8 analysis fail closed on schema-1/mixed data. Do not redesign the mediation model or change estimator parameters. Run the listed targeted tests and typecheck. Do not commit until review.
```

### Prompt C

```text
After Batch B is reviewed and committed, implement Batch C only from docs/plans/GOVERNANCE_SEMANTICS_REPLAY_PLAN.md. Extract the two current role tables into explicit immutable versioned policies and one shared resolver. Preserve both historical tables, defaults, first-match behavior, all numeric outputs, and existing estimator fingerprints. Add the neutral policy as future opt-in only. Run golden and targeted tests. If any default output or fingerprint changes, stop instead of updating the expected value. Do not commit until review.
```

### Prompt D

```text
After Batches A-C are reviewed and committed, perform Batch D only from docs/plans/GOVERNANCE_SEMANTICS_REPLAY_PLAN.md. Edit only the two allowed documentation targets. Derive validation counts from actual command output. Do not broaden claims beyond implemented behavior. Then run the complete final validation checklist and report any failure without modifying unrelated code.
```

## 10. Review ownership

Claude Code may implement the bounded batches, but acceptance remains a separate review step. In particular, do not merge or publish the result until a reviewer confirms:

- stored input is sufficient for exact replay;
- no estimator version silently changed semantics;
- no new fallback mixes the two susceptibility meanings;
- E8 does not combine legacy mixed and schema-2 behavioral values;
- role-policy extraction preserved golden fingerprints;
- only intended files were staged.
