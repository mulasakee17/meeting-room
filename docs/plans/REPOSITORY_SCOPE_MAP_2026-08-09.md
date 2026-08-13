# Repository Scope Map

> Execution update (2026-08-13): after the current V6/Measurement baseline was
> committed as `6eae9a3`, the 15 zero-reference `experiments/campaign/debug_*.ts`
> scripts were moved to `experiments/campaign/scratch/` with relative imports
> repaired. Other probe/explore/measure/check scripts remain in place because
> several are cited by audit or protocol documents. The tables below preserve
> the original 2026-08-09 audit snapshot.

Date: 2026-08-09

Purpose: reduce cognitive surface before the confirmatory campaign. No files are
moved here; this map only classifies and recommends. Git history preserves
recovery for any future move.

Counting method: `rg --files` + targeted `rg -l` import searches over `*.ts`,
excluding `node_modules`, `experiments/**/output/**`, and `experiments/**/data*/**`
unless stated. Reference counts include tests and are lower bounds.

## 1. High-level volume

| area | files | note |
|---|---|---|
| `src/lib` | 104 | kernel + legacy + speculative layers |
| `experiments/campaign` (code, excl. output) | ~90 | runner, verifier, configs, run/analyze/debug scripts |
| `experiments/campaign/output` | 374 | generated artifacts; 48 of them are still tracked in git despite `.gitignore` |
| `experiments/v2` (code, excl. data) | ~70 | legacy experiment framework + 62 analysis scripts |
| `experiments/v2` `data*` json | 485 | raw artifacts; 424 tracked in git despite `.gitignore` |
| `experiments/lunar_survival` | ~18 + 85 data | legacy demo + raw runs |
| `test` | 51 | unit tests (vitest) |
| `docs` | ~30 | plans + reports + architecture |
| repo total tracked | 889 | |

The repository's cognitive surface is dominated by generated artifacts and
legacy experiment code, not by the v6 kernel.

## 2. Category 1 — paper-critical kernel (retain in place)

These implement the v6 research candidate and are covered by the current
test suite. Moving them has no benefit and high risk.

| path | refs | note |
|---|---|---|
| `src/lib/governance/controlContracts.ts` | high (via `@/lib/governance`, ~26 files) | types + validators; foundation of everything |
| `src/lib/governance/decisionEngine.ts` | high | `GovernanceDecisionEngine` |
| `src/lib/governance/eventAssignment.ts` | high | preregistered deterministic assignment |
| `src/lib/governance/actionLifecycle.ts` | high | append-only action ledger + `censored` |
| `src/lib/governance/standardEpistemicActions.ts` | high | minimal opt-in actions |
| `src/lib/governance/epistemicEligibilityRules.ts` | high | versioned rules |
| `src/lib/epistemic/{ledger,aggregation,evidenceGraph,replay,contracts,types,semantics,scoring,resolver,estimators,legacyAdapters,index}.ts` | 1–4 direct refs each, high via barrel | evidence/aggregation kernel |
| `src/lib/experimentation/{assignment,lifecycle,manifest,governanceStudy,governanceAuditTrail,baseline,alpha,blockRunner,index}.ts` | 3–9 refs each | WP2/WP3 + schema 5 carrier |
| `src/lib/experiment-contracts/*` | contracts.ts 12 | task/truth firewall |
| `src/lib/monitoring/*` | contracts.ts 12 | versioned signals |
| `src/lib/thermodynamics/{ProgressiveEstimator,computeDelta,MeasurementLayer,TerminationDecider,EvidencePool,index}.ts` | 1–14 refs | estimator + monitoring runtime |
| `src/lib/observation/*` | 5 files | observation projection primitives |
| `src/lib/agent/{cognitiveState,roleInertiaPrior}.ts` | — | cognitive state math |

Recommendation: **retain** all. Read/replay compatibility: n/a (kept in place).

## 3. Category 2 — production-bridge candidates

The pieces that turn kernels into runs. These are the next Codex work surface.

| path | refs | move risk | note |
|---|---|---|---|
| `experiments/campaign/pipeline/Runner.ts` | 5 | high (red-zone, dynamic `require` below) | the active schema-4 writer |
| `experiments/campaign/pipeline/hiddenbenchProtocol.ts` | 3 | medium | reference protocol |
| `experiments/campaign/replayVerifier.ts` | 2 | medium | run-level replay + schema-5 carrier |
| `experiments/campaign/verify_replay.ts` | 1 (self/CLI) | low | replay CLI |
| `experiments/campaign/generate_manifest.ts` | 1 | low | audit manifest CLI |
| `experiments/campaign/studyContractGuard.ts` | 0 | low | CC-2 guard leaf |
| `experiments/campaign/types.ts` | 4 | high | `ExperimentConfig` / `RawRunData` / schema constants |
| `src/lib/discussion/nativeCognitiveEngine.ts` | via `@/lib/discussion` | high | native engine; Runner imports it |
| `src/lib/adapters/custom.ts` | 1 (Runner) | medium | `CustomAgent` used by Runner's `createAgents` |

Dynamic-reference risk: `Runner.ts:loadScenario` uses `require(...)` for
`../../lunar_survival/config`, `../../v2/task_{crisis,crisis_v2,supplier,invest,er_triage}`,
`../tasks/task_{university,optimized}`, and `../tasks/hiddenbench/adapter`.
Moving any of those task modules changes the Runner's resolve path and breaks
the running binary. Any future move must rewrite `loadScenario` first.

Recommendation: **retain** in place for now; treat as the CC-4/Codex bridge
surface. `studyContractGuard.ts` and `verify_replay.ts` are safe to relocate
inside `experiments/campaign/` if desired (low risk), but there is no current
reason to.

## 4. Category 3 — legacy/read-only compatibility

Old governance/discussion engines that must stay readable and replayable but
must not become the v6 confirmatory path.

| path | refs | move risk | recommendation |
|---|---|---|---|
| `src/lib/governance/index.ts` (legacy `GovernanceEngine`) | 11 files reference `GovernanceEngine` | **high** — the same barrel also re-exports the new kernel | retain in place; keep read-only |
| `src/lib/governance/{types,feedbackChannel,interventions/*,adaptiveThresholds,adaptiveDosage,cognitiveDetectors,cognitiveInterventions,interventionPrompt,systemDesignDetectors,taskVerificationDetectors}.ts` | referenced by tests + legacy engine + `MeasurementLayer`/`computeDelta` | medium | retain in place; quarantine from v6 default path (already the semantic stance) |
| `src/lib/discussion/{index,asyncEngine,crossExamination,decisionTrace,sensitivityTrace,eventTracker,influence,influenceUtils,interactionGraph,memory,topology,types}.ts` | `DiscussionEngine` referenced by ~15 files (lunar_survival, v2, tests, Runner belief path) | medium | retain; Runner's belief path still uses `DiscussionEngine` |
| `src/lib/discussion-types/*` | legacy types | low | retain; owner-decision on deletion |
| `src/runtime/**` (GovernanceRuntime + adapters) | legacy runtime bridge | medium | **owner-decision** — unused by v6 main chain; candidate for quarantine after confirming nothing imports it in production |
| `src/lib/adapters/autogen.ts` | legacy | low | quarantine candidate |

Read/replay compatibility must be preserved for any legacy artifact that the
replay tooling reads (schema 1–4 raw files, `lunar_survival/data`, `v2/data*`).

Recommendation: **retain + quarantine semantics** (keep files, keep replay, do
not wire into v6 confirmatory). Do not move `governance/index.ts`.

## 5. Category 4 — active exploratory experiment scripts

Still used for mechanism pilots and HiddenBench exploration; not confirmatory.

| path | note |
|---|---|
| `experiments/campaign/configs/*` (14) | per-experiment configs |
| `experiments/campaign/run_*.ts` (8), `run_all.ts`, `pilot_v6.ts`, `dry_run.ts`, `generate_mock_data.ts` | experiment drivers |
| `experiments/campaign/pipeline/{MetricComputer,ReportGenerator,FigureGenerator,CampaignSummarizer,StatisticalTest}.ts` | post-processing |
| `experiments/campaign/tasks/{legacyAdapter,hiddenbench/adapter,task_optimized,task_university}.ts` | task loaders (some under Runner dynamic `require`) |
| `experiments/v2` top-level `*.ts` (62) | legacy framework + analysis |

Move risk: medium for anything referenced by `loadScenario` (see dynamic
`require`); low otherwise. Recommendation: **retain** for the current pilot
phase; archive-after-paper.

## 6. Category 5 — one-off debug/probe scripts

Leaf entry scripts; zero importers; no dynamic risk; high clutter.

| path | count |
|---|---|
| `experiments/campaign/debug_*.ts` | 15 |
| `experiments/campaign/{probe_*,explore_*,measure_*,check_*,verify_*,analyze_*}*.ts` | ~12 |
| `experiments/campaign/{analyze_F_decomposition,analyze_f_decoupling_verification,verify_causal_chain}.ts` | 3 |
| `experiments/v2/_verify_*.ts`, `verifyBlindSpot.ts`, `verifyFindings.ts`, `verify_audit.ts`, `verify_self_contamination.ts`, `verify_findings_9_10.ts`, `backtest_weight_assumption.ts`, `grid_search_thresholds.ts`, `quality_factor_validation.ts`, etc. | ~15 |

Recommendation: **quarantine** into `experiments/campaign/scratch/` and
`experiments/v2/scratch/` (or a `_archive/` sibling) after the paper; move risk
low (no importers); git history preserves recovery. Do not delete.

## 7. Category 6 — generated artifacts and documentation drift

The largest share of repository bytes. Regenerable; a few are still tracked.

| path | files | tracked? | recommendation |
|---|---|---|---|
| `experiments/campaign/output/**` | 374 | 48 still tracked (pre-`.gitignore`) | archive-after-paper; untrack the 48 via `git rm --cached` (owner decision, do not execute here) |
| `experiments/campaign/pilot_output/**` | 2 | untracked | archive-after-paper |
| `experiments/v2/data*/**` | 485 | 424 tracked | keep the manifest/summary; archive the bulk; untrack decision is owner's |
| `experiments/v2/results/**` | 12 | untracked | archive-after-paper |
| `experiments/lunar_survival/data/**` | 85 | — | keep as legacy replay corpus |
| `experiments/v2/audit_manifest.json`, `audit_report.json` | 2 | — | keep while audit tooling exists |
| docs old WP snapshots inside `SWARMALPHA_V6_EXECUTION_PROGRESS.md` / `MASTERPLAN.md` | — | — | documentation drift: superseded snapshots remain as history; authoritative addenda already added to the top |

Recommendation: **archive-after-paper**; no delete. Untracking generated
artifacts (not deleting files) is a separate owner decision.

## 8. Category 7 — unknown / requires owner decision

| path | issue | recommendation |
|---|---|---|
| `src/lib/analysis/causalEffect.ts` | masterplan itself flags the name/claim as too strong | **owner-decision**: downgrade to exploratory sensitivity analysis or quarantine |
| `src/lib/security/*` | rateLimit/validation — future-facing | owner-decision (no v6 main-chain consumer) |
| `src/lib/inference/*` | speculative | owner-decision |
| `src/lib/evaluation/*` | unclear paper fit | owner-decision |
| `src/lib/benchmarks/financial.ts` | no v6 main-chain consumer | owner-decision |
| `src/lib/demo-data.ts` | demo | owner-decision / quarantine |
| `src/runtime/**` | legacy runtime bridge | owner-decision / quarantine (see §4) |
| `experiments/demo.ts` | demo | quarantine candidate |

## 9. Isolated-but-not-moved recommendation summary

Highest-value, lowest-risk isolation (do **not** execute here):

1. `experiments/campaign/debug_*.ts`, `probe_*`, `explore_*`, `measure_*`,
   `check_*`, `verify_*`, `analyze_*` → `experiments/campaign/scratch/`
   (quarantine; 0 importers; git preserves recovery).
2. `experiments/v2/_verify_*.ts` and single-purpose verification scripts →
   `experiments/v2/scratch/` (same reasoning).
3. `src/runtime/**`, `src/lib/adapters/autogen.ts`, `src/lib/demo-data.ts`,
   `experiments/demo.ts` → `_archive/` after confirming no production importer
   (owner-decision first).
4. Generated artifacts (`experiments/campaign/output/**`,
   `experiments/v2/data*/**`) → keep for replay/audit, untrack from git later
   (`git rm --cached`, owner decision), never delete the corpus while the
   paper's analysis depends on it.
5. Do **not** move `src/lib/governance/index.ts` (legacy + new kernel share the
   barrel), `Runner.ts` (dynamic `require` of task modules), or any
   task/scenario module referenced by `loadScenario`.

## 10. Method note

Reference counts are static lower bounds. The only dynamic-reference risk
identified is `Runner.loadScenario`'s `require(...)` of scenario/task modules,
which must be treated as pinned. All other modules resolve statically and are
safe to relocate with an import-path rewrite plus a full test run.
