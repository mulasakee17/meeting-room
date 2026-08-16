# SwarmAlpha Active Research Surface

Status: normative repository navigation map
Date: 2026-08-14

This document identifies the current research authority. It is a navigation
contract, not evidence that the proposed measurements or interventions are
empirically valid. When an older README, plan, or script conflicts with current
implementation and replayable artifacts, follow the evidence hierarchy in
[`REASONING_PROTOCOL.md`](REASONING_PROTOCOL.md).

## 1. Current research question

**HYPOTHESIS** — Under a strict online/offline truth firewall, observable
pre-action micro-level reports and information flow may define a low-dimensional
collective state that predicts when an independently randomized information
intervention helps, does nothing, or harms final decision quality.

The current empirical priority is the zero-provider social-thermodynamic
response audit defined by
[`theory/SOCIAL_THERMODYNAMIC_RESPONSE_RESEARCH_CONTRACT_V1.md`](theory/SOCIAL_THERMODYNAMIC_RESPONSE_RESEARCH_CONTRACT_V1.md).
The frozen task-heldout verification replication is `DEFER`: observed
apply-minus-holdout pooled Brier was `+0.0985`, opposite the favorable
development direction, with interval `[-0.3697, +0.7424]`. The earlier
four-feature failure predictor is also `DEFER`. Therefore no process-state
predictor, thermodynamic projection, active-information kernel, or selective
router has control permission.

The current route and methodological boundaries are summarized in
[`research/CURRENT_ROUTE_AND_METHODOLOGY.md`](research/CURRENT_ROUTE_AND_METHODOLOGY.md).

## 2. Authoritative path

```text
Research and measurement contracts
  -> epistemic / governance / experimentation kernels
  -> V6 schema-5 vertical slice
  -> Measurement Validity authority and runner
  -> frozen experiment plan
  -> replay and analysis
```

| Role | Authoritative location | Current status |
|---|---|---|
| reasoning discipline | `docs/REASONING_PROTOCOL.md` | normative |
| current route/methodology | `docs/research/CURRENT_ROUTE_AND_METHODOLOGY.md` | current research authority |
| strategic scope | `docs/strategy/SWARMALPHA_WHITEPAPER_V1.md` | long-term design narrative; not current empirical status |
| active research contract | `docs/theory/SOCIAL_THERMODYNAMIC_RESPONSE_RESEARCH_CONTRACT_V1.md` | current hypothesis, state, response, and stop/go boundary |
| future heterogeneous-governance contract | `docs/theory/HETEROGENEOUS_EPISTEMIC_GOVERNANCE_RESEARCH_CONTRACT_V1.md` | future hypothesis; does not govern the first-paper experiment |
| epistemic state kernel | `src/lib/epistemic/` | implemented and deterministically tested; not direct access to latent belief |
| governance control kernel | `src/lib/governance/` | implemented and deterministically tested; empirical efficacy not established |
| truth-blind active information kernel | `src/lib/governance/activeInformationGovernance.ts` | core semantics implemented; adversarial tests + deterministic offline fixture (`experiments/campaign/v6/truthBlindPolicyFixtureV1.ts`) added; no production Runner connection or empirical validity |
| experimental authority | `src/lib/experimentation/` | implemented and replay-oriented |
| V6 execution | `experiments/campaign/v6/` | current schema-5 execution path |
| measurement validity | `experiments/campaign/measurement/` | authority, analysis, runner, and development wiring implemented |
| run-level replay | `experiments/campaign/replayVerifier.ts` and `verify_replay.ts` | current verifier/CLI |
| current tests | V6, governance, epistemic, experimentation, and measurement tests under `test/` | deterministic evidence about implementation invariants |

## 3. Authority classes

### CURRENT

Safe default reading and modification surface:

- `src/lib/epistemic/`
- the contract/decision/audit parts of `src/lib/governance/`
- `src/lib/experimentation/`
- `experiments/campaign/v6/`
- `experiments/campaign/measurement/`
- current architecture, theory, strategy, and experiment-result documents
- tests directly covering those areas

### LEGACY_READ_ONLY

Preserved for provenance, comparison, and old-artifact replay. These paths are
not current V6 authority and must not silently supply confirmatory evidence:

- `experiments/v2/`
- `experiments/lunar_survival/`
- `src/lib/discussion/asyncEngine.ts`
- legacy governance/runtime and social-thermodynamic execution paths
- `experiments/campaign/run_e12*.ts` and corresponding historical analyses

Legacy code still imports shared `src` modules. It is therefore historically
isolated but not a self-contained package that can be moved to another
repository without dependency work.

### SCRATCH_CANDIDATE

One-off `debug_*`, `probe_*`, and obsolete inspection scripts under
`experiments/campaign/` are candidates for physical quarantine. Do not infer
that every `analyze_*` or `verify_*` script is disposable: the current replay
CLI and recorded V6 analyses remain authoritative consumers.

The current V6/Measurement change set was committed as `6eae9a3`. After a
zero-reference audit, 15 `debug_*.ts` scripts were moved to
`experiments/campaign/scratch/`; cited audit/protocol probes remain in place.
Further physical moves still require the same importer and evidence-reference
audit.

### DEMO_OR_PRODUCT_PROTOTYPE

- `src/app/`
- `src/runtime/`
- framework/demo adapters

These may illustrate earlier product ambitions. They are not evidence for the
current paper and are not the default research runtime.

### ACTIVE_THEORY_AND_FUTURE_EXTENSIONS

Social thermodynamics is now the active scientific lens for a zero-provider
state-response audit. Existing legacy entropy/temperature/free-energy
implementations are not automatically valid constructs or control signals. The
current relationship is:

```text
auditable pre-action microstate
  -> frozen macro projection
  -> randomized intervention response
  -> development-to-heldout falsification
  -> optional one-pilot permission
```

Until those gates pass, `R/T/H_E/G_E/kappa` are descriptive or exploratory
only. No universal free-energy score is authorized.

The earlier no-ground-truth and heterogeneous-governance contracts remain
supporting/future theory. The active contract is
[`theory/SOCIAL_THERMODYNAMIC_RESPONSE_RESEARCH_CONTRACT_V1.md`](theory/SOCIAL_THERMODYNAMIC_RESPONSE_RESEARCH_CONTRACT_V1.md).
Declared or verified-distinct source identity is not statistical independence,
and public-only reanalysis is not independent verification.

## 4. Supported commands

Current, zero-provider defaults:

```bash
npm run measurement:plan
npm run measurement:mock
npm run verify:replay -- <artifact-or-directory>
npm run test:measurement
npm run test:v6
```

`measurement:mock` writes development artifacts and proves wiring/replay only.
It is not measurement-validity evidence.

Current V6 smoke planning/execution CLI:

```bash
npm run v6:smoke -- --dry-run
```

Real provider execution always requires an explicit execution flag or a
dedicated frozen experiment runner. No generic current command is allowed to
silently fall back to a legacy paid experiment.

Historical commands are namespaced:

```bash
npm run legacy:v2:run
npm run legacy:v2:analyze
npm run legacy:v2:sensitivity
npm run legacy:demo
```

Their outputs remain historical/exploratory unless a current contract explicitly
admits and replays them.

## 5. Repository split policy

**Current decision:** retain one research repository.

Do not split V6, Measurement Validity, epistemic contracts, governance
contracts, and replay into separate repositories. They share one paper-level
evidence chain and should be pinned by one commit.

A future split is permitted only after all of the following hold:

1. the current V6/Measurement working tree is committed and reproducible;
2. public kernel APIs and schema-version policy are frozen;
3. legacy imports of shared `src` code are inventoried or vendored;
4. one commit/tag can still reconstruct every paper artifact;
5. secret scanning and license checks pass;
6. cross-repository CI and compatibility ownership are explicit.

The preferred future topology is at most:

- `swarmalpha-research` — current kernel, V6, measurement, experiments, paper;
- `swarmalpha-legacy-experiments` — read-only history and manifests;
- optional `swarmalpha-demo` — UI/product prototype.

It is not one live repository per historical engine version.

## 6. Claim ceiling

The current repository supports claims about implemented contracts,
deterministic replay, artifact integrity within the repository, preliminary
measurement characterization, and exploratory observations under recorded
conditions.

It does not yet establish general measurement validity, general governance
efficacy, source-error independence, latent-belief access, tamper-proof external
provenance, marginal cognitive value, or a universal runtime for heterogeneous
intelligence.
