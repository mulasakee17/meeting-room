# Primary Arm Execution V1

Date: 2026-08-10

Status: implemented and validated at the kernel level, and enforced as a
required schema-5 carrier authority. **Not wired into the production Runner.**
`RAW_SCHEMA_VERSION` remains `"4.0"`; the Runner does not yet execute an
assigned arm, run the final private elicitation, emit schema 5, or publish a
detached commitment.

Implementation:

- `src/lib/experimentation/primaryAssignmentExecution.ts` — exact-ref execution
  registry and pre-provider binding;
- `src/lib/experimentation/primaryArmExecutionStore.ts` — local atomic no-replace
  binding publication;
- `experiments/campaign/primaryAssignedRun.ts` — production pre-provider
  preparation boundary (imported by tests; not invoked by the Runner).

## 1. Execution registry

`PrimaryArmExecutionRegistryV1` is a frozen lookup table from randomized arm
identity (`armRef`) to executable snapshots. Arm labels have no runtime meaning:
exact versioned refs are the only keys.

- `studyRef`, `designRef`, `designHash` bind the registry to one frozen study
  design; a registry for another design or study is rejected.
- `entries` must cover every design arm exactly once and **follow the frozen
  design's arm order** (order is part of the commitment).
- Each entry carries `implementationRef`, `implementationConfig`,
  `implementationConfigHash`, `budgetContractRef`, `budgetContract`,
  `budgetContractHash`. The config/budget payload hashes are recomputed on
  validation; a payload that differs from its declared hash is rejected.
- Payloads must be plain, replayable JSON: cycles, sparse arrays, non-finite
  numbers, functions, and class instances are rejected. Credential-like keys
  (`api_key`, `secret`, `password`, `authorization`, `credential`,
  `access_token`, `refresh_token`, case-insensitive, nested) are rejected so a
  payload never persists a secret.

## 2. Binding

`PrimaryArmExecutionBindingV1` is the pre-provider record proving **which frozen
implementation** was resolved from the Stage-1 draw. It is not evidence that
delivery or compliance occurred.

- It binds the run, assignment id, assigned `armRef`, and assignment probability
  to the manifest and registry via hashes (`primaryAssignmentManifestHash`,
  `registryHash`).
- It resolves the assigned arm to exactly one registry entry and copies the
  frozen implementation/budget snapshot plus their hashes.
- A self-consistent binding whose payload differs from the registry (even with a
  recomputed `contentHash`) is rejected.
- `resolvedAt` must not precede the assignment manifest.

## 3. Local store

`loadOrCreatePrimaryArmExecutionBindingV1` / `readPrimaryArmExecutionBindingV1`
provide:

- **atomic no-replace publication** (`open("wx")` + `fsync` + `link`), so a
  partial or concurrent binding cannot overwrite the authoritative path;
- **retry identity**: an exact retry reuses the persisted binding and never
  invokes the create path; a changed registry/design is rejected, not rebound;
- **fail-closed reads**: malformed persisted JSON throws and is never
  overwritten;
- run-id sanitization (no path traversal) and a hash suffix that keeps
  distinct run ids distinct even when their sanitized stems collide.

Local hashes and no-replace files prove **internal consistency and retry
identity**, not external authenticity. A fully self-consistent replacement of
the whole assignment/registry/binding is detectable only with an external
manifest/hash/signature commitment, which is not implemented.

## 4. Pre-provider preparation boundary

`preparePrimaryAssignedRunV1` (in `experiments/campaign/primaryAssignedRun.ts`)
is the production pre-provider boundary. Callers must invoke it before
constructing any provider-backed engine:

- persists the Stage-1 assignment manifest (create or reuse, never redraw);
- rejects a retry whose `masterSeed` or `stratum` changed, and rejects a
  changed registry/design;
- when the assignment already exists but the execution binding does not, it
  rebuilds only the deterministic binding and never redraws the assignment;
- returns the frozen `implementationConfig` and `budgetContract` as the only
  permitted execution inputs for the selected arm.

The Runner does not yet call this boundary; wiring is future work.
