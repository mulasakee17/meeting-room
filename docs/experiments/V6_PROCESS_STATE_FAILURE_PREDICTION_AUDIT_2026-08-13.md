# V6 Process-State Failure Prediction Audit

Date: 2026-08-13  
Status: **EXPLORATORY EXISTING-ARTIFACT AUDIT; gate = DEFER**

## 1. Question

Can observable state after round 1, but before any governance action, predict final collective decision loss on held-out tasks?

This audit tests prediction, not intervention efficacy. It does not treat an LLM report as latent belief, and it does not use ground truth online.

## 2. Timing and population

**FACT** — The primary population contains 40 `explicit_belief_v1` B-arm runs covering 20 HiddenBench task clusters from the frozen 2026-08-12 batch. These runs were not selected by the governance eligibility rule.

**FACT** — Features are extracted only from round-1 categorical belief reports:

1. valid-report coverage over the registered roster;
2. mean reported certainty, defined as mean maximum reported probability;
3. mean pairwise total variation between agent probability vectors;
4. top-two margin of the equal-weight round-1 pooled distribution.

The primary outcome is final operational pooled multiclass Brier loss after discussion and private final elicitation. The auxiliary label is whether the final pooled decision fails to match the resolution; an abstention/tie is retained as unresolved failure and separately visible through decision status.

Ground truth and final outcomes are not inputs to feature extraction, model fitting at decision time, action assignment, prompts, or provider calls. Resolution is used only after the run for evaluator-side outcome construction.

## 3. Frozen analysis used by the audit

- validation: leave one task cluster out;
- models: training-fold mean, one-feature ridge on certainty, one-feature ridge on disagreement, and four-feature ridge process state;
- ridge penalty: fixed at 1, no tuning;
- primary metric: out-of-fold mean squared error on pooled Brier;
- uncertainty: paired 10,000-draw task-cluster bootstrap of squared-error improvement;
- positive improvement means the left model has lower MSE;
- gate: at least 30 runs and 15 clusters, and process-state improvement point estimate and 95% interval above zero against constant, confidence-only, and disagreement-only.

The implementation is `experiments/campaign/v6/analyze_v6_process_state_failure_prediction.ts`; deterministic boundary tests are in `test/v6-process-state-failure-prediction.test.ts`.

## 4. Results

**FACT** — Primary sample: 40 runs, 20 task clusters, 18 final decision failures/unresolved outcomes.

| model | task-held-out MSE | MAE | auxiliary failure AUROC |
|---|---:|---:|---:|
| constant | 0.3087 | 0.4665 | not interpreted |
| confidence-only | 0.4169 | 0.5120 | 0.3725 |
| disagreement-only | 0.3556 | 0.4952 | 0.0593 |
| four-feature process state | 0.5127 | 0.5471 | 0.3409 |

| proposed comparison | MSE improvement | task-cluster bootstrap 95% interval |
|---|---:|---:|
| process state vs constant | -0.2041 | [-0.5050, 0.0002] |
| process state vs confidence-only | -0.0958 | [-0.2212, 0.0030] |
| process state vs disagreement-only | -0.1571 | [-0.4338, 0.0249] |

All three predictive-increment gates fail. Status: **DEFER**.

**FACT** — A secondary, non-gating transport check trained on the B arm and evaluated on 11 eligibility-selected G holdouts (8 task clusters) yielded process-state MSE 0.4533 and auxiliary AUROC 0.7083. This sample is selected by the old eligibility rule and is too small to serve as an unbiased replacement for the primary population.

## 5. Interpretation and decision

**INFERENCE** — The current four coarse summaries do not support the claim that SwarmAlpha can reliably locate collective failure on unseen tasks. In this audit, adding them is worse than predicting the training-fold mean.

This result does not prove that process state is useless. It shows that the present representation and sample do not qualify for control. Likely missing information includes evidence overlap/source correlation, minority strength, task structure, and evidence-claim conflict; these are hypotheses for a prospectively frozen representation, not post-hoc positive results.

**DECISION** — Do not implement or deploy a selective router on these four features. Do not execute the pre-discussion source-disclosure screen as if it tested post-round-1 selection. The next paid study, if authorized, must randomize one already implemented post-round-1 action independently of the state, use fresh task clusters, and separate risk prediction from treatment-benefit estimation. A later policy evaluation must compare frozen selective allocation with `never`, `always`, `confidence-threshold`, and matched-rate random allocation on independent tasks.

## 6. Claim ceiling

This audit supports only a reproducible negative qualification result on existing DeepSeek/HiddenBench artifacts. It establishes neither general measurement invalidity nor governance efficacy, latent-belief access, causal treatment heterogeneity, or a cost-quality frontier advantage.
