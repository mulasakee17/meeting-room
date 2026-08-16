# SwarmAlpha Current Route and Methodology

Status: **CURRENT RESEARCH AUTHORITY**  
Date: 2026-08-14  
Purpose: answer what the project is solving now, how it studies the problem, what the evidence says, and what work is authorized next.

> **2026-08-14 execution update:** the zero-cost social-thermodynamic audit has completed with `STOP` for the degenerate `H_E/kappa V1` macrostate, `DEFER` for response evidence, and `NO-GO` for policy authorization. Sections 6–8 below preserve the audited hypothesis and stop logic but are no longer the active execution order. The current integrated execution authority is `docs/plans/SWARMALPHA_INTEGRATED_RESEARCH_EXECUTION_GUIDE_2026-08-14.md`, which freezes verifier/detector expansion and reactivates one minimal non-destructive information-action screen using the existing V6 authority layer.

This document is the current research entry point. It does not replace object-level architecture contracts or experiment result reports. When a claim conflicts with implementation or replayable artifacts, follow `docs/REASONING_PROTOCOL.md` and the stronger evidence.

## 1. Current route in one sentence

> SwarmAlpha studies whether observable micro-level reports and information flow can define a low-dimensional collective state that predicts when a truth-blind information intervention will help, do nothing, or harm independently evaluated multi-agent decision quality.

The current paper is not trying to prove a universal governance system, a literal physical thermodynamics, or access to latent belief. It is testing a narrower micro-to-meso response hypothesis with an auditable randomized experiment.

## 2. Practical problem

In a real multi-agent collaboration, the correct answer is normally unavailable when the system must decide whether to:

- continue discussion;
- request independent verification;
- introduce new evidence;
- protect a minority position;
- consult another model/tool/person;
- stop and act.

Simple majority, consensus, or reported confidence cannot solve this reliably. A group can agree and be wrong; several agents can repeat one source; a high-confidence report can be poorly calibrated; an intervention can disturb a correct group.

SwarmAlpha therefore asks two linked questions:

1. **State question:** what observable collective state is the group in before action?
2. **Response question:** in that state, what is the expected quality and cost effect of a particular information action?

The second question is conditional. The project no longer assumes one governance action is beneficial on average in every state.

## 3. Current empirical reality

### Implemented and tested

- architecture-enforced categorical probability reports and evidence/provenance events;
- event identity, exposure, supersession, treatment assignment, action lifecycle, and deterministic replay;
- public-only verification delivery with apply/sham/holdout Stage-2 randomization;
- independent final private elicitation;
- post-action claim resolution and pooled multiclass Brier outcome;
- schema-5 execution artifacts and 96/96 heldout replay.

### Observed

- the earlier verdict development/continuation batch produced a favorable exploratory apply-minus-holdout direction, but its combined interval crossed zero;
- a frozen 96-run task-heldout replication produced `apply - holdout Brier = +0.0985`, with 95% interval `[-0.3697, +0.7424]`;
- this failed the frozen directional and interval gates and is `DEFER`;
- a separate four-feature task-heldout failure predictor performed worse than the constant baseline and is also `DEFER`;
- the current certainty-plus-lineage eligibility rule varies sharply across tasks;
- 19/30 heldout apply verdicts were `insufficient_evidence`.

### Not established

- general governance efficacy;
- task-invariant detector validity;
- measurement of latent belief or understanding;
- a state-conditioned policy advantage;
- physical-law status for social thermodynamic quantities;
- cross-model, cross-prompt, cross-benchmark generalization;
- production value in a real organization.

The engineering experiment succeeded. The generic verification-benefit hypothesis did not replicate. That distinction is the starting point of the current route.

## 4. Methodological identity

The project uses an **auditable micro-to-meso response methodology**:

```text
frozen elicitation instrument
-> explicit reports and evidence events
-> deterministic pre-action state projection
-> randomized information action
-> post-action state transition
-> independent private outcome
-> development-to-heldout falsification
```

It combines four traditions without conflating them:

- measurement theory: a report is an instrument-conditioned observation, not the latent construct;
- multi-agent dynamics: individual reports and exposures generate a collective state;
- causal experiment design: action effects require randomization and independent outcomes;
- social thermodynamics: macro order, activity, evidence entropy, concentration, and response summarize collective dynamics.

Social thermodynamics is the organizing scientific lens. Audit/replay is the experimental reliability layer. Governance is the intervention being tested. None can substitute for the others.

## 5. Core methodological principles

### 5.1 The prompt is part of the instrument

An explicit probability vector is conditioned on task, prompt, option coordinates, model, interaction history, and parser contract. Changing the prompt changes the measurement condition.

Therefore the system does not call the report an internal belief. It records the instrument contract and asks whether derived relations are stable enough to predict outcomes or intervention response.

Prompt robustness remains a measurement-validity question. It is not solved by replay.

### 5.2 Self-report, audited event, derived state, and outcome are separate

| Layer | Examples | Permitted interpretation |
|---|---|---|
| report | probability vector, public explanation | what the model emitted under the instrument |
| audited event | evidence hash, provenance, exposure, assignment | what the architecture recorded |
| derived state | alignment, update magnitude, entropy, concentration | deterministic property of recorded events |
| latent construct | true confidence, understanding, internal belief | unobserved |
| outcome | final pooled Brier, accuracy, cost | evaluator-side decision quality/cost |

No quantity gains control authority merely because it is structured or replayable.

### 5.3 Microstate before macrostate

The repaired five-dimensional observable microstate is:

\[
X_{i,t}=(P_{i,t},E_{i,t},C_{i,t},I_{i,t},S_{i,t}).
\]

- `P`: reported categorical probability/preference vector;
- `E`: evidence identities, relations, provenance, and exposure;
- `C`: concentration/calibration properties of the report;
- `I`: observed cross-round persistence, not a personality essence;
- `S`: susceptibility, defined causally at a population/state level from randomized response.

Historical Utility containers may be reused, but categorical probabilities are not silently renamed cardinal utility. Historical Evidence coverage/quality heuristics and `(1-I)*(1-C)` susceptibility do not enter the current authority path.

### 5.4 Macro variables describe collective organization

The smallest current macro projection is:

- `R`: alignment from pairwise base-2 Jensen-Shannon divergence;
- `T`: cross-round update activity from total variation;
- `H_E`: entropy of represented canonical evidence identities;
- `G_E`: concentration of evidence-origin reference mass when origin is reconstructable;
- `kappa = R*(1-H_E)`: descriptive crystallization index.

High alignment is not correctness. High evidence entropy is not evidence quality. `kappa` is not false-consensus probability and has no runtime control permission.

The heldout protocol has one pre-action discussion round. It can support pre-action `R/H_E/kappa`; it cannot support a pre-action temporal `T`. Round-1-to-final update activity is post-treatment and may only be treated as a mediator/response.

### 5.5 Intervention is an external information field

The current action is a public-only verification object:

- apply: deliver verification verdict;
- holdout: eligible but no action;
- sham: matched carrier without verdict authority, secondary diagnostic.

The action label does not guarantee useful information. Verifier informativeness, delivery, uptake, and final quality are separate links.

### 5.6 Ground truth is evaluator-only and time-bounded

Ground truth must not enter:

- pre-action state;
- eligibility diagnosis;
- assignment;
- verification request/delivery;
- final private elicitation request.

After action and final elicitation, resolution may be recorded and used to score Brier/accuracy and replay the analysis. The firewall is temporal/informational, not a promise that the final artifact never contains a resolved value.

This matches practical learning: online decisions can be truth-blind while later outcomes, human review, or delayed resolution train and evaluate governance policy.

### 5.7 Randomization separates response from correlation

State variables may correlate with failure without identifying which action helps. Treatment assignment therefore remains randomized among eligible events.

The primary causal contrast is apply minus holdout final pooled Brier. State-conditioned susceptibility is:

\[
\chi(s)=E[Y\mid do(apply),S_0=s]-E[Y\mid do(holdout),S_0=s].
\]

Negative `chi` favors apply because lower Brier is better. An individual Agent's single observed revision is a mediator, not its individual causal susceptibility.

### 5.8 Development defines; heldout tries to falsify

Development artifacts may define one simple state projection and one outcome-blind split. The same definition is then applied unchanged to heldout artifacts.

No result-driven task removal, threshold search, feature expansion, seed replacement, or subgroup rescue is permitted. If the heldout direction fails, the hypothesis stops rather than accumulating dimensions until it becomes positive.

### 5.9 Outcome quality is independent of intermediate dynamics

Consensus, entropy, stability, influence distribution, or crystallization may explain dynamics. They do not establish better collective intelligence.

The required chain is:

```text
intervention
-> changed information/dynamics
-> independently evaluated final quality
```

The last arrow cannot be replaced by a nicer-looking state trajectory.

### 5.10 Minimalism is a validity constraint

Every added construct, feature, baseline, or engineering layer increases researcher degrees of freedom. Near-term work therefore prefers:

- existing artifacts over new provider runs;
- deterministic projections over new LLM judges;
- one theory-motivated composite over feature search;
- apply/holdout as the primary contrast;
- tables over dashboards;
- a falsified hypothesis over an unfalsifiable platform narrative.

Engineering complexity is justified only when it closes a specific missing link in the research question.

## 6. Current hypothesis and analysis

The current hypothesis is not “verification works.” It is:

> Verification response is heterogeneous across pre-action collective states; it should be more useful in highly aligned groups whose reports reuse a concentrated evidence base than in other states.

The first test reuses existing artifacts and makes zero provider calls:

1. reconstruct round-1 reports and evidence identities before assignment;
2. compute `R`, `H_E`, and `kappa`;
3. define the `kappa` split using the development median without reading assignment or outcome;
4. apply the frozen split to the 96-run heldout batch;
5. compare apply/holdout Brier within high and low strata;
6. inspect verifier informativeness and probability movement as exploratory mediators;
7. stop if the state-response direction does not preserve.

This is a secondary task-heldout analysis because the aggregate heldout result is already known. It cannot be called pristine confirmation.

## 7. Current route

### Stage 0 — Reliable experimental instrument: complete for the tested V6 slice

Explicit reports, evidence events, randomization, action lifecycle, private final outcome, proper loss, and replay exist and have executed end to end.

### Stage 1 — Zero-cost social-thermodynamic response audit: active

Determine whether existing artifacts support non-degenerate `R/H_E/kappa` and whether the development-defined response hypothesis transports to heldout tasks.

No runtime or schema modification is authorized.

### Stage 2 — One minimal state-conditioned pilot: conditional

Authorized only if Stage 1 preserves direction with adequate support and identifies a plausible information-action mechanism. It must reuse the existing vertical slice and compare the smallest necessary arms.

If Stage 1 fails, do not run this pilot.

### Stage 3 — Paper closure

The first paper should report:

1. the observable micro-to-meso state formulation;
2. the auditable truth-blind randomized response method;
3. the positive, null, or negative development-to-heldout result;
4. mechanism diagnostics and limits;
5. the platform as enabling infrastructure, not the central efficacy claim.

### Later — Heterogeneous intelligence governance

Only after a state-conditioned response relationship replicates should alternative models, tools, retrieval systems, humans, stopping, or budgets become different external fields/actions. Marginal cognitive value, principal-aware Agent societies, reputation, Web3, and universal routing remain future work.

## 8. Stop/go rules

### Continue to a minimal pilot only if

- state projection is complete and temporally valid;
- macro variables do not collapse into one quantity;
- heldout high/low strata contain usable randomized arm support;
- the state-response direction preserves out of development;
- no post-treatment field enters the selector;
- a concrete action failure/success mechanism is identifiable.

### Stop the current hypothesis if

- evidence identity cannot be reconstructed without heuristic substitution;
- the macro projection is degenerate;
- the heldout interaction reverses or disappears;
- apparent benefit requires task/seed/threshold selection;
- the only positive change is consensus/stability without final-quality improvement.

## 9. Project scope after this consolidation

### Current paper scope

LLM multi-agent collectives, categorical hidden-profile decisions, observable state, randomized public-only verification, and independent final proper loss.

### Reusable platform scope

Claim/report/evidence/exposure identity, randomization, action lifecycle, final elicitation, outcome, replay, and pluggable state projections/actions.

### Long-term scientific scope

State and response laws for heterogeneous Agent societies under partial information, correlated error, authority, cost, and delayed resolution.

The first scope must succeed scientifically before the third is claimed as an implemented platform.

## 10. Authoritative supporting documents

- reasoning discipline: `docs/REASONING_PROTOCOL.md`;
- active theory contract: `docs/theory/SOCIAL_THERMODYNAMIC_RESPONSE_RESEARCH_CONTRACT_V1.md`;
- current implementation map: `docs/ACTIVE_RESEARCH_SURFACE.md`;
- task-heldout fact report: `docs/experiments/V6_VERDICT_TASK_HELDOUT_REPLICATION_RESULTS_2026-08-13.md`;
- negative prediction qualification: `docs/experiments/V6_PROCESS_STATE_FAILURE_PREDICTION_AUDIT_2026-08-13.md`;
- V6 execution architecture: `docs/architecture/V6_PRODUCTION_VERTICAL_SLICE_V1.md`;
- long-term strategic vision: `docs/strategy/SWARMALPHA_WHITEPAPER_V1.md`.

Plans, handoffs, older paper drafts, legacy thermodynamics code, and archived roadmaps are not current empirical authority.
