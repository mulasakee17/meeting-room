# SwarmAlpha Social-Thermodynamic Response Research Contract V1

Status: **NORMATIVE RESEARCH CONTRACT — definitions and zero-provider analysis only**  
Date: 2026-08-14  
Scope: the near-term paper and the reuse of existing V6 artifacts. This document does not authorize a new runtime, schema, detector, paid experiment, or physical-law claim.

## 0. Decision

SwarmAlpha restores social thermodynamics as its principal scientific lens, but not the historical claim that one heuristic quantity such as `F = U - T*H` is a physical free energy or a sufficient control signal.

The project will study a smaller and falsifiable question:

> In a multi-agent deliberation where ground truth is unavailable at action time, can observable micro-level reports and information flow define a low-dimensional collective state that predicts when an information intervention helps, does nothing, or harms final decision quality?

The corresponding near-term paper question is:

> Do observable mesoscopic states predict when independent verification helps or harms LLM agent collectives?

The research object is therefore a response system:

```text
prompt-conditioned reports and evidence flow
-> pre-action microstate
-> collective mesostate
-> randomized information intervention
-> post-action state transition
-> independently scored final outcome
```

The existing V6 audit, randomization, final-private-elicitation, operational-outcome, and replay layers remain experimental infrastructure. They are not themselves the scientific contribution and must not be expanded for this work unless a missing field makes the primary analysis impossible.

## 1. Evidence that motivates the change

### FACT

1. The V6 verdict development batch produced a favorable exploratory apply-minus-holdout pooled-Brier direction, with a task-cluster bootstrap interval of `[-0.5813, 0.0033]`; the interval crossed zero.
2. The frozen task-heldout replication completed 96/96 runs with no missing artifact or replay failure.
3. In that replication, eligible-event `mean(Brier | apply) - mean(Brier | holdout) = +0.0985`; lower is better. The 95% task-cluster bootstrap interval was `[-0.3697, +0.7424]`.
4. The task-heldout replication therefore failed its frozen directional and interval gates. It did not establish benefit and did not establish harm.
5. Eligibility varied substantially by task: one frozen task produced no eligible event, while other tasks produced many. The current selector is therefore not empirically established as a task-invariant risk construct.
6. Of 30 apply events, the verifier returned 19 `insufficient_evidence`, 7 `contradicted`, and 4 `supported` verdicts. A verdict carrier is not automatically a high-information intervention.
7. Historical scalar-belief `R/T/H` variables were strongly coupled because they were transformations of the same dispersion signal. Historical free-energy-based intervention ordering did not improve decision quality in its recorded A/B test.
8. The current V6 artifacts contain categorical belief-report events, evidence registrations with provenance/content hashes, exposure events, randomized intervention identity, final private elicitation, resolution, and proper-loss outcome. They can support a read-only state-response analysis without new provider calls.

### INFERENCE

The reversal between development and heldout batches is consistent with at least three explanations: sampling variation, task-dependent verifier quality, or state-dependent treatment response. The aggregate result alone does not identify which explanation is correct.

The current certainty-plus-lineage rule is a local event selector. It is not a model of the collective state. Treating its failure as a failure of every social-thermodynamic account would therefore be invalid.

### HYPOTHESIS

An information intervention has heterogeneous effects across pre-action collective states. In particular, independent verification may be more useful when reported beliefs are highly aligned but rest on concentrated or duplicated evidence, and may be neutral or harmful when the group is already correct, evidence-rich, or easily perturbed.

This hypothesis remains untested until the development-to-heldout analysis in Section 7 is completed without outcome-driven threshold search.

## 2. Ontological and authority boundary

SwarmAlpha does not read an agent's latent mental state. It observes outputs produced under a frozen interaction and elicitation contract.

The following categories must remain distinct:

| Category | Example | Authority |
|---|---|---|
| Prompt-conditioned report | categorical probability vector, report text | observation under a named instrument |
| Audited information-flow record | evidence content hash, provenance, exposure, supersession | architecture-recorded event |
| Derived behavior | probability revision, persistence, alignment, entropy | deterministic projection |
| Randomized treatment | apply, sham, holdout | causal design authority |
| Outcome | final-private pooled Brier, task accuracy | evaluator-only after action |
| Latent construct | true confidence, actual understanding, internal belief | not observed |

No report or deterministic projection obtains control authority merely because it is replayable. No thermodynamic analogy establishes construct validity.

Ground truth may be used after final elicitation to resolve the claim and score outcome quality. It must not enter the pre-action state, treatment assignment, verifier request, or delivery payload. A raw artifact may contain a post-outcome resolution record; truth-firewall validity is a temporal and information-access property, not a claim that the final artifact contains no resolved value.

## 3. Five-dimensional observable microstate

The historical five dimensions are retained as a research basis, with repaired semantics. They form an **observable cognitive microstate**, not a latent cognitive state:

\[
X_{i,t} = (P_{i,t}, E_{i,t}, C_{i,t}, I_{i,t}, S_{i,t}).
\]

### 3.1 Reported position `P`

For a registered categorical claim with canonical option set `O = {o_1,...,o_K}`:

\[
P_{i,t}=(p_{i,t,1},...,p_{i,t,K}),\quad p_{i,t,k}\ge 0,\quad \sum_k p_{i,t,k}=1.
\]

`P` is read from the architecture-enforced belief report. It is a prompt-conditioned declared distribution. It is not utility unless the task contract explicitly elicits utility, and it is not a direct observation of an internal belief.

Historical `Utility` code remains reusable as a vector container and adapter surface. The near-term categorical analysis must use the registered probability coordinates rather than silently reinterpret them as cardinal utility.

### 3.2 Evidence state `E`

`E` is a structured set, not one scalar:

\[
E_{i,t}=\{(h_j,\ell_j,s_j,r_j)\}_{j=1}^{m},
\]

where `h` is a content hash, `ell` an optional lineage identity, `s` a recorded source identity, and `r` a declared supports/attacks relation.

Current V6 evidence registrations and report-to-evidence references are the preferred authority. The following historical quantities are not automatically valid:

- self-reported evidence quality is not source reliability;
- `|items| / defaultGlobalPoolSize` is not task-independent coverage;
- the number of evidence strings is not the number of independent sources;
- support entropy is not evidence sufficiency or truth coverage.

If provenance or a canonical content/lineage identity is absent, independence-dependent evidence quantities are `missing`; they must not fall back to raw string count.

### 3.3 Reported concentration `C`

For categorical reports, the minimal concentration statistic is:

\[
C_{i,t}=\max_k p_{i,t,k}.
\]

Optional top-two margin and normalized entropy may be reported alongside it. None is the full uncertainty geometry. `C` is a property of the emitted probability vector under the prompt contract, not calibrated correctness probability.

The observed overconfidence in the V6 exploratory batch makes `C` a candidate miscalibration signal, not a default trust weight.

### 3.4 Behavioral persistence `I`

When two comparable pre/post reports exist:

\[
I^{obs}_{i,t\rightarrow t+1}=1-\operatorname{TV}(P_{i,t},P_{i,t+1}),
\]

where `TV(p,q)=0.5*sum_k |p_k-q_k|`.

This is observed persistence for one transition. It is not a stable personality trait. Role priors, prompt resistance, and prior discussion history must not be mixed into the same value without a separately identified model.

With only one pre-action report, pre-action inertia is unavailable. A post-action revision may be analyzed as a mediator but cannot be used as a pre-action treatment selector in the same run.

### 3.5 Susceptibility `S`

The historical shortcut `(1-I)*(1-C)` is not an identified susceptibility measure. A single agent's observed revision after exposure is also not its causal susceptibility because the counterfactual revision is unobserved.

Near-term V1 therefore defines susceptibility at the population or state-stratum level:

\[
\chi(s)=E[Y\mid do(A=apply),S_0=s]-E[Y\mid do(A=holdout),S_0=s],
\]

where `Y` is final pooled Brier and lower is better. Negative `chi(s)` indicates benefit from apply in state `s`.

Individual revision magnitude remains a mediator. It must not be relabeled individual causal susceptibility.

## 4. Collective mesostate

The near-term analysis uses the smallest set of macro variables that current artifacts can support. It does not revive a universal scalar free energy.

### 4.1 Alignment order parameter `R`

For `N` categorical probability reports at the same pre-action round:

\[
R_t=1-\frac{2}{N(N-1)}\sum_{i<j}JSD_2(P_{i,t},P_{j,t}).
\]

Base-2 Jensen-Shannon divergence is bounded in `[0,1]`, so `R` is also in `[0,1]`. High `R` means emitted distributions are similar. It does not imply correctness or healthy consensus.

### 4.2 Update activity `T`

For comparable consecutive reports:

\[
T_{t\rightarrow t+1}=\frac{1}{N}\sum_i TV(P_{i,t},P_{i,t+1}).
\]

`T` is normalized update activity. It is not provider sampling temperature and is not a physical temperature.

The present heldout protocol has only one pre-action discussion round. Therefore no pre-action temporal `T` exists for treatment selection in those runs. Round-1-to-final or round-1-to-round-2 `T` is post-treatment and may only be used as a mediator or response variable.

### 4.3 Evidence diversity `H_E`

Let a canonical evidence identity be a genuinely item-specific `lineageId` when valid, otherwise the exact registered content hash. Coarse labels such as `private` or `shared` describe visibility and are not item identities; they must fall back to content hash rather than merging unrelated evidence. Let `q_j` be the share of report-to-evidence references assigned to identity `j` in the pre-action state. When at least two valid identities exist:

\[
H_E=-\frac{\sum_j q_j\log_2 q_j}{\log_2 m}.
\]

`H_E` measures diversity of represented evidence identities. It does not measure evidence quality, completeness, or independence when common-origin evidence has not been identified. If canonical identity cannot be formed, `H_E` is missing.

### 4.4 Evidence-origin concentration `G_E`

Where an original source can be resolved for canonical evidence identities, `G_E` is the Gini coefficient of reference mass across those sources. It is an evidence-origin concentration statistic, not causal social influence or fairness.

If original-source attribution cannot be reconstructed, `G_E` is missing. Uniform protocol exposure counts must not be presented as observed influence.

### 4.5 Crystallization index `Kappa`

One theory-motivated descriptive composite is allowed:

\[
\kappa_t=R_t(1-H_{E,t}).
\]

High `kappa` means high reported alignment supported by a concentrated set of evidence identities. It is called a crystallization index, not free energy, truth risk, or false-consensus probability.

`kappa` receives no runtime control authority in V1. Its usefulness must be tested by out-of-sample response heterogeneity.

## 5. Intervention as an external information field

The existing randomized action is retained:

- `apply`: deliver a public-only independent verification verdict;
- `holdout`: eligible event receives no governance action;
- `sham`: matched control without verdict authority, secondary only.

The primary causal contrast remains apply minus holdout among eligible events. Sham helps diagnose attention and carrier effects but is not a complete placebo for all language-mediated effects.

The intervention does not modify stored belief weights. Its mechanism is exposure to an additional public information object. Whether that object contains useful information is an empirical mediator question, not guaranteed by the action label.

## 6. Minimal causal and descriptive questions

### RQ1 — State qualification

Do pre-action `R`, `H_E`, and `kappa` reproduce deterministically and vary across runs/tasks without collapsing into the same scalar?

This is measurement characterization. It is not detector validation.

### RQ2 — Response heterogeneity

Does apply-minus-holdout final Brier vary with pre-action `kappa` in the same direction across development and task-heldout batches?

Primary hypothesis:

\[
\chi(high\text{-}\kappa) < \chi(low\text{-}\kappa).
\]

The stronger claim `chi(high-kappa) < 0` is tested separately. A relative interaction may exist even when neither stratum establishes benefit.

### RQ3 — Mechanism decomposition

When apply helps or harms, is the difference associated with:

1. verifier informativeness;
2. movement of probability mass toward or away from the resolved option;
3. evidence diversity change;
4. invalid/unavailable final reports;
5. task-specific floor or ceiling effects?

These are exploratory mediator analyses. Conditioning on the realized verdict or post-action revision does not identify a new causal treatment effect.

### RQ4 — Policy authorization

No state-conditioned runtime policy is authorized by V1. It becomes a candidate only if a state-response relationship defined on the development batch preserves sign and useful support on the untouched task-heldout projection.

## 7. Development-to-heldout analysis contract

The next work uses existing artifacts and zero provider calls.

### 7.1 Dataset roles

- The existing exploratory and continuation verdict batches are the **development source**.
- The 96-run frozen task-heldout replication is the **evaluation source**.
- No task, run, seed, arm, threshold, or outcome is removed because it weakens the hypothesis.
- The aggregate heldout result has already been observed. Any new state-stratified analysis must be labeled secondary and must not be called pristine confirmatory evidence.

### 7.2 Allowed state information

Only events recorded before the eligibility decision and Stage-2 assignment may enter `S_0`.

Allowed examples:

- round-1 categorical belief reports;
- round-1 report-to-evidence references;
- evidence registrations and provenance available by the cutoff;
- option count and frozen task identity.

Forbidden examples:

- verification result or action arm;
- round-2/final report;
- final elicitation status;
- resolution/outcome/Brier/accuracy;
- any event recorded after assignment.

### 7.3 Minimal analysis sequence

1. Reconstruct the pre-action reports and evidence graph and fail closed on temporal ambiguity.
2. Calculate `R`, `H_E`, optional `G_E`, and `kappa` without outcome access.
3. Characterize missingness, task distribution, and pairwise dependence among macro variables.
4. Use the development source to freeze one high/low `kappa` split. The preferred simple rule is the development median, computed without treatment outcome; no threshold search is allowed.
5. Apply the exact split to heldout artifacts.
6. Within high and low strata, report apply/holdout counts, task coverage, mean pooled Brier, difference, and deterministic task-cluster uncertainty.
7. Report the interaction contrast `Delta_high - Delta_low`. Do not claim benefit unless the high-state apply-minus-holdout estimate itself is negative with adequate support and uncertainty excluding zero under the frozen gate.
8. Run the mechanism decomposition as explicitly exploratory.

### 7.4 Fail-closed conditions

The analysis must stop rather than substitute a heuristic if any of the following occurs:

1. a pre-action report cannot be bound to exactly one canonical claim/options contract;
2. an event used in `S_0` is not strictly earlier than assignment;
3. report probabilities are invalid or option coordinates drift;
4. an evidence reference cannot be bound to a registered evidence identity when computing evidence quantities;
5. development and heldout artifacts use incompatible report, task, action, or outcome contracts.

Missing `H_E` or `G_E` is reported as missing. Raw evidence count, report count, or exposure count must not silently replace it.

## 8. What is deliberately not being built

This contract does not authorize:

- a new social-thermodynamics runtime;
- a new raw schema or artifact authority;
- online threshold adaptation;
- a learned router or Marginal Cognitive Value engine;
- Web3 reputation/stake;
- a universal `F` score;
- physical units, equilibrium assumptions, or a conservation law;
- a new provider experiment before the zero-cost audit is reviewed;
- a claim that five dimensions are complete or latent;
- a claim that consensus, entropy, or stability is decision quality.

Existing legacy thermodynamics modules remain historical/compatibility code. Near-term results come from a read-only projection over V6 evidence, belief, treatment, and outcome artifacts.

## 9. Decision gate after the zero-cost audit

### GO to one minimal state-conditioned pilot

Only if all are true:

1. pre-action state reconstruction is sufficiently complete and replayable;
2. `R` and `H_E` do not collapse into one effective quantity;
3. the development-defined `kappa` split has usable apply and holdout support in heldout tasks;
4. response heterogeneity preserves the hypothesized direction on heldout data;
5. the mechanism audit identifies a plausible, deliverable information action;
6. no result requires post-treatment information in the selector.

### DEFER

If support is insufficient or uncertainty is wide, retain social thermodynamics as a descriptive program and do not deploy a state-conditioned policy.

### STOP the current hypothesis

If the heldout direction contradicts the development state-response hypothesis, or if macro variables are degenerate/unreconstructable, report the falsification. Do not add dimensions or search thresholds until the result becomes favorable.

## 10. Paper and platform roles

### Near-term paper

The paper may claim an auditable method for relating observable collective state to randomized information-intervention response, plus whatever development-to-heldout evidence is actually obtained.

It must not claim a physical social thermodynamics, generic governance efficacy, latent-belief measurement, or production-ready routing.

### Platform

SwarmAlpha remains a governance experiment runtime. Its reusable platform contribution is the separation of observation, state projection, randomization, action delivery, private outcome, and replay.

### Long-term design intent

If state-conditioned response replicates, verification, tools, models, minority protection, and stopping decisions can become alternative external fields. Heterogeneous-intelligence governance and marginal cognitive value then become extensions of an empirically qualified response model rather than a new speculative engine.

## 11. Responsibility split

Codex owns:

- construct definitions and authority boundaries;
- causal estimands and analysis validity;
- high-risk interpretation and stop/go decisions;
- final paper claims.

Claude Code/DeepSeek may perform only bounded work after this contract is frozen:

- mechanical JSON-path inventory;
- one read-only analysis script over named artifact directories;
- deterministic fixtures and adversarial tests;
- factual result-table generation and documentation synchronization.

Delegated work must not modify runtime, schema, prompts, tasks, provider adapters, treatment assignment, artifacts, or this research contract without Codex review.
