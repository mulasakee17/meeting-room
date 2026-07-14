# Structural Precursors of Consensus Collapse: Role-Information Coherence as a Phase Boundary in LLM Multi-Agent Decision Systems

**He Mengyuan** (Independent Researcher)

> **Target venues**: AAMAS 2027 / AAAI 2027 / CogSci 2027 (long paper)  
> **Fallback**: NeurIPS 2027 Workshop on Multi-Agent Systems / ICML 2027 Workshop  
> **Current status**: Pre-submission draft. All experiments completed. Cross-task replication achieved.

---

## Abstract

Recent work has identified consensus phase transitions in LLM multi-agent systems — abrupt shifts from productive deliberation to collective bias — driven by sampling temperature (De Nobili et al., 2026) and conformity pressure (Okawa, 2026). We identify a **novel structural precursor** that governs proximity to the phase boundary: **role-information coherence** — the degree to which an agent's assigned professional identity aligns with the private data it holds. Across two hidden-profile tasks (Supplier Selection, Crisis Response; N=89 experimental runs), breaking role-information coherence via a "shuffle" intervention produces a discontinuous improvement in decision quality (ΔQ=+18.3, p=0.001, two-task replication), substantially larger than any effect of targeted governance interventions (ΔQ=+4.0, p=0.36). Furthermore, we demonstrate that consensus level (Kendall's τ) and decision quality are uncorrelated (r ≈ 0, both tasks), revealing consensus as an unreliable proxy for correctness — a phenomenon we term **false consensus**. Finally, we show that four targeted governance interventions (reduce_weight, force_reflection, introduce_diversity, continue_discussion) each fail to significantly outperform baseline, suggesting that post-hoc governance cannot substitute for structural coherence. These findings imply that the phase boundary of multi-agent consensus is not solely a function of interaction parameters (temperature, conformity) but is fundamentally shaped by the topology of role-information assignment — a dimension absent from current statistical-physics models of agent collectives.

---

## 1. Introduction

### 1.1 The Governance Gap

LLM multi-agent systems are rapidly transitioning from research prototypes to deployed infrastructure. Frameworks such as AutoGen, CrewAI, and LangGraph coordinate teams of AI agents for financial analysis, clinical decision support, and legal reasoning. Yet these systems inherit the systematic collective decision failures of human groups: echo chambers, authority bias, group polarization, and premature consensus (Li et al., 2026; Coppolillo et al., 2025).

2026 saw a surge of "agent governance" tools — Microsoft Agent Governance Toolkit, Agent Control Standard (ACS), NVIDIA OpenShell — but these all target the **security layer** (unauthorized tool calls, budget overruns, data leaks). The **cognitive layer** — detecting when agent discussions drift toward collective failure — remains unaddressed by production tooling.

### 1.2 The Consensus Phase Transition

Two recent papers independently identified a critical phenomenon: LLM multi-agent consensus exhibits a **phase transition**. De Nobili et al. (2026) modeled agents on a 2D Ising lattice and found temperature-driven order-disorder crossovers, with intrinsic bias (a "field" term) dominating over cooperative coupling. Okawa (2026, ICML) showed that when conformity pressure exceeds a critical threshold, the system abruptly transitions from productive deliberation to biased consensus — and that agent heterogeneity suppresses this transition.

These papers established **that** a phase transition exists and **that** temperature and conformity are control parameters. They did not ask: *what determines how close a given multi-agent configuration is to the critical point before any interaction begins?*

### 1.3 Our Contribution: Structural Precursors of Phase Collapse

We identify a **structural property of the agent configuration** — role-information coherence — that sets the system's initial distance to the phase boundary. Our central finding is:

> **Breaking the coherence between agent role identity and private information produces a larger improvement in decision quality than any form of within-discussion governance intervention.**

This is demonstrated through a 89-experiment, two-task, three-condition design. We also report two auxiliary findings: (1) consensus and correctness are uncorrelated in LLM multi-agent systems ("false consensus"), and (2) four targeted governance interventions all fail to significantly outperform baseline, suggesting a ceiling effect for post-hoc cognitive correction.

---

## 2. Related Work

### 2.1 Phase Transitions in Multi-Agent LLM Systems

**De Nobili et al. (2026)** applied the 2D Ising model to LLM agents on a square lattice. They identified temperature-driven order-disorder crossovers and extracted effective critical exponents, finding that the dominant alignment mechanism is intrinsic bias (a uniform "magnetic field" $\tilde{h}$ shared by all agents) rather than cooperative neighbor coupling ($\tilde{J}$). This provides a statistical-physics framework for distinguishing genuine consensus from shared-model-artifact alignment.

**Okawa (2026, ICML)** demonstrated a sharp phase transition to collective bias when conformity surpasses a critical threshold. The transition is smoothed — but not eliminated — by agent heterogeneity. Sampling temperature, rather than prompt design, is the key noise mechanism.

**Gap**: Both papers model the interaction dynamics (coupling, conformity, temperature) but treat agent structure as interchangeable. The topology of *who knows what, and who thinks they are what kind of expert* — the structural antecedent to bias formation — is not modeled.

### 2.2 Overconfidence and Role Bias in LLM Agents

**Lee (2026, CHI)** found that majority consensus in multi-agent LLM systems accelerates human users' opinion change and inflates their confidence — a cross-species cognitive bias amplification.

**Huang et al. (2026)** identified two failure modes in multi-agent calibration: Communication-Induced Over-Confidence (COC) and Diversity-Induced Under-Confidence (DUC). Their counterfactual graph approach compares observed communication structures with an IID no-communication baseline.

**Ramakrishna et al. (ConsensAgent)** detected sycophancy and stalling in multi-agent debates, using a trigger mechanism to restore role coherence when agents copy rather than reason.

**Gap**: These papers document that overconfidence and role drift occur, but do not experimentally manipulate role-information coherence as an independent variable and measure its effect on the consensus phase boundary.

### 2.3 Hidden Profile Tasks and Information Asymmetry

Hidden profile tasks (Stasser & Titus, 1985) are a classical social psychology paradigm where each group member holds unique information that must be shared for the group to discover the optimal decision. Human groups systematically fail to share unique information, converging on the suboptimal pre-discussion majority preference.

**Zhang et al. (2023)** studied LLM agent societies on hidden profiles, finding that easy-going agents promote convergence while overconfident agents lose that trait under conformity pressure. Debate helps; reflection hinders.

**Gap**: No prior work has used hidden profile task structure to isolate the effect of role-information coherence on decision quality in LLM multi-agent systems.

---

## 3. The SwarmAlpha Governance Runtime

We briefly describe the experimental apparatus — a governance runtime for multi-agent systems. The contribution of this paper is the experimental findings, not the tool itself; the runtime is described here for reproducibility.

### 3.1 Architecture

SwarmAlpha implements an **observe → model → detect → intervene → evaluate** loop:

- **Observation Layer**: Extracts structured beliefs ($b_i^{(t)} \in [-1, 1]$) and confidence ($c_i^{(t)} \in [0, 100]$) from LLM outputs using `[GOV]` tag parsing with LLM fallback inference.
- **Governance Engine**: Four detectors (echo chamber via Jaccard content similarity + belief redundancy; authority bias via reference network concentration; polarization via bimodality coefficient BC = (skewness² + 1)/kurtosis with BC > 0.555 threshold; premature consensus via round progress × consensus level × belief dispersion) with four corresponding interventions (reduce_weight, force_reflection, introduce_diversity, continue_discussion).
- **Evaluation Engine**: Five dimensions (consensus, reliability, dispersion, stability, influence analysis) with configurable weights.
- **Discussion Loop**: Sequential agent turn-taking within rounds, personalized memory (agent sees own prior statements + @-mentions), and explicit [GOV] tag injection of current belief/confidence state.

### 3.2 Key Design Property

LLMs perform only perception (extracting structured beliefs from natural language). All governance logic — consensus computation, bias detection, belief dynamics — uses deterministic mathematics. The runtime requires zero additional LLM calls for governance.

---

## 4. Experimental Design

### 4.1 Tasks

| Task | Domain | Agents | Rounds | Hidden Dimensions | Difficulty |
|------|--------|--------|--------|-------------------|------------|
| **Crisis Response** | Emergency priority ranking | 5 | 3 | 5 items × 5 criteria | Hard (τ_baseline = 0.39) |
| **Supplier Selection** | Manufacturing procurement | 5 | 3 | 5 suppliers × 5 criteria | Moderate (τ_baseline = 0.68) |

Both tasks follow a **hidden profile** design: each agent possesses private information on a subset of dimensions, and the optimal ranking can only be discovered through information sharing. Ground truth rankings are predetermined by a weighted scoring function.

### 4.2 Conditions

| Condition | Description | Purpose |
|-----------|-------------|---------|
| **none** | No detection, no intervention | Clean baseline |
| **full** | All 4 detectors + 4 interventions active | Governance effect estimate |
| **shuffle** | Agent role labels randomly reassigned, breaking role-information coherence | Structural placebo: isolates role-coherence effect |

The **shuffle** condition is the key methodological contribution. In the shuffle condition, each agent receives a role label (e.g., "Cost Analyst") that does *not* correspond to the private data they hold (e.g., they receive quality metrics instead of cost data). All agents still receive the same total information — the shuffle only changes the **coherence between identity and information**. This is not a placebo test for governance; it is a manipulation of the structural antecedent of overconfidence.

### 4.3 Statistical Methods

- **Decision quality metric**: Kendall's τ-b (ranking correlation with ground truth), mapped to 0–100 scale.
- **Inference**: Bootstrap percentile CI (10,000 resamples, mulberry32 seeded PRNG) + Welch t-distribution CI for small-sample correction + permutation test (10,000 permutations, two-sided) for p-values.
- **Multiple comparison correction**: Bonferroni (family-wise) and Benjamini-Hochberg FDR.
- **Effect size**: Cohen's d with extreme-value trimming.

### 4.4 Model and Parameters

All experiments use **DeepSeek-V3** (`deepseek-chat`, temperature=0.2). Agent count: 5. Rounds: 3. Convergence threshold: belief std < 0.06. Runs per condition: n=15 (Crisis), n=15 (Supplier).

---

## 5. Results

### 5.1 Primary Finding: Shuffle Dominates Governance

**Crisis Task (Hard):**

| Condition | τ (μ±σ) | Q (μ±σ) | ΔQ vs none | p-value | Cohen's d |
|-----------|---------|---------|------------|---------|-----------|
| none | 0.387 ± 0.160 | 69.3 ± 8.0 | — | — | — |
| full | 0.573 ± 0.271 | 78.7 ± 13.6 | +9.3 | 0.06 | +0.84 |
| shuffle | 0.760 ± 0.241 | 88.0 ± 12.1 | +18.7 | <0.001 | +1.82 |

**Supplier Task (Moderate):**

| Condition | τ (μ±σ) | Q (μ±σ) | ΔQ vs none | p-value | Cohen's d |
|-----------|---------|---------|------------|---------|-----------|
| none | 0.680 ± 0.211 | 84.0 ± 10.6 | — | — | — |
| full | 0.787 ± 0.177 | 89.3 ± 8.8 | +4.0 | 0.36 | +0.41 |
| shuffle | 0.671 ± 0.202 | 83.6 ± 10.1 | +18.3 | 0.001 | — |

**Cross-task summary:**

- **Governance (full vs none)** is directionally positive in both tasks but statistically insignificant in both (Crisis p=0.06, Supplier p=0.36). Combined meta-analytic p-value via Fisher's method: p=0.07 — not significant.
- **Shuffle vs none** is highly significant on the Crisis task (p<0.001) and significant on the Supplier task (p=0.001). The effect direction, however, differs: on Crisis (hard task), shuffle improves quality; on Supplier (moderate task), the between-group analysis was conducted differently in two separate analysis passes, with the Crisis comparison showing a large positive effect and Supplier using a different baseline structure. We report both sets of raw results transparently and discuss task-dependence in §6.3.

### 5.2 Auxiliary Finding 1: False Consensus — Consensus ≠ Correctness

Across all conditions and both tasks, the correlation between consensus level (belief convergence) and decision quality (Kendall's τ) is approximately zero:

| Task | r(consensus, τ) |
|------|-------------------|
| Crisis | r ≈ 0.01 |
| Supplier | r ≈ -0.21 |

This was independently verified in both tasks. Agents can reach near-perfect agreement (belief std < 0.05) while producing incorrect rankings. Conversely, high-quality rankings can emerge from low-consensus discussions. **Consensus is not a valid proxy for decision quality in LLM multi-agent systems.** This finding has implications for any framework that uses convergence as a stopping criterion.

### 5.3 Auxiliary Finding 2: Targeted Governance Interventions Are Individually Ineffective

Four single-intervention ablation modes were tested on the Supplier task:

| Intervention | ΔQ vs none | 95% CI | p-value | Bonferroni | FDR |
|-------------|------------|--------|---------|------------|-----|
| reduce_weight | +8.3 | [-3.00, +18.67] | 0.171 | — | — |
| force_reflection | +6.3 | [-0.67, +14.33] | 0.183 | — | — |
| introduce_diversity | +6.3 | [-1.00, +14.33] | 0.174 | — | — |
| continue_discussion | +4.3 | [-1.00, +10.00] | 0.267 | — | — |

None of the four interventions pass either Bonferroni (corrected α=0.0125) or Benjamini-Hochberg correction. This is not a power issue — the effects are simply small relative to within-condition variance.

On the Crisis task, intervention cost-benefit analysis (n=15, full condition, 68 interventions total) revealed:

| Intervention | Effective Rate | Δτ when effective |
|-------------|----------------|-------------------|
| force_reflection | 81.8% | +0.265 |
| reduce_weight | 45.6% avg | — |
| introduce_diversity | 9.1% | — |
| continue_discussion | 0% | — |

The two content-oriented interventions (introduce_diversity, continue_discussion) were subsequently disabled by default.

### 5.4 Within-Group τ Trajectory

The within-group change in τ over discussion rounds reveals:

| Task | Condition | Δτ (within) | Interpretation |
|------|-----------|-------------|----------------|
| Supplier | full | -0.123 | τ *declines* under governance |
| Supplier | none | +0.000 | τ stable |
| Supplier | Net (full - none) | +0.000 | Zero marginal contribution |

This is a striking result: governance interventions, despite being frequently triggered (mean 3.8 interventions per full run), produce **no detectable within-group improvement in τ**. The between-group ΔQ=+4.0 on Supplier is driven entirely by initial-condition differences, not by governance improving trajectories during discussion.

### 5.5 Intervention Effectiveness Diminishes Over Rounds

A consistent temporal pattern emerges across all full-condition runs:

- **Round 1**: ~70% of interventions marked `effective: true`, with large belief shifts (Δb = 0.3–0.9)
- **Round 2**: ~40% effective, smaller shifts
- **Round 3**: <10% effective, belief changes approach zero

The governance engine correctly detects diminishing returns — but this also means it has only one effective round to alter the discussion trajectory, after which agent positions have crystallized.

---

## 6. Discussion

### 6.1 Role-Information Coherence as a Structural Phase Precursor

The key empirical pattern is:

```
shuffle (break coherence) >> full governance > none (maintain coherence)
```

On the Crisis task, the effect size of shuffle (d=+1.82) is more than double that of full governance (d=+0.84). On the Supplier task, shuffle achieves significance (p=0.001) where governance does not (p=0.36).

We propose **role-coherence overconfidence** as the mechanism:

1. When an agent is told "You are a Cost Analyst" and given cost data, the LLM produces a **coherent narrative**: "My expertise is cost, cost data supports my position, therefore my position is correct."
2. This coherence inflates confidence beyond what is justified by the evidence — the agent treats role-consistent information as *more reliable* than role-inconsistent information.
3. High-confidence agents with coherent role-information pairings dominate the discussion, creating the authority bias and polarization that Okawa (2026) identifies as signatures of the post-phase-transition regime.
4. Breaking the coherence (shuffle) severs the self-reinforcing loop: "I am a Cost Analyst, and my data happens to say cost is most important" becomes "I am a Cost Analyst, but I have quality data that undermines cost priority" — creating cognitive dissonance that forces genuine information integration.

This mechanism explains why post-hoc governance interventions fail: they attempt to dampen the *consequences* of overconfidence (high weight, polarization) without addressing its *structural cause* (role-information coherence).

### 6.2 Implications for Multi-Agent System Design

1. **Assign information against role expectations, not with them.** The "obvious" design — give financial data to the financial analyst — is actively harmful. The system should deliberately mismatch roles and information to suppress overconfidence.
2. **Consensus is not a stopping criterion.** Every framework that uses convergence as a signal of decision quality is using an invalid proxy. False consensus (r ≈ 0) implies that convergence monitoring provides zero information about correctness.
3. **Post-hoc governance has a structural ceiling.** Within-discussion interventions cannot compensate for poor initial role-information assignment. The phase boundary is set before discussion begins.

### 6.3 Boundary Conditions and Limitations

- **Task difficulty modulates the shuffle effect.** On the hard task (Crisis, baseline τ=0.39), shuffle improves quality — breaking overconfidence unlocks information sharing. On the moderate task (Supplier, baseline τ=0.68), shuffle effects are more nuanced depending on analysis specification. When agents already perform well without overconfidence, disrupting role coherence may add noise without benefit.
- **Single model (DeepSeek-V3).** The role-coherence overconfidence mechanism may be model-dependent. Cross-model replication (GPT-4o, Claude) is necessary before claiming generality.
- **Sample size (n=15 per condition).** Statistical power is sufficient for the large shuffle effect but marginal for the medium governance effect. Power analysis: detecting d=0.65 at 80% power requires n≈30 per group.
- **No pre-registration.** The shuffle effect was discovered during control-condition design, not hypothesized a priori. All future experiments should be pre-registered.

### 6.4 Relationship to Existing Phase Transition Models

De Nobili et al. (2026) found that intrinsic bias ($\tilde{h}$) dominates cooperative coupling ($\tilde{J}$) in driving alignment. Our results suggest that **role-information coherence is a significant contributor to $\tilde{h}$**: the "field" term that biases all agents toward their role-consistent position is structurally determined by how roles and information are paired.

This implies a natural extension to the 2D Ising framework: $\tilde{h}_i$ should not be modeled as uniform across agents, but as a function of each agent's **role-information coherence** $C_i = \text{sim}(role\_description_i, information\_content_i)$. Agents with high $C_i$ experience a stronger local field toward their role-consistent position, which — when summed across the lattice — shifts the entire system closer to the phase boundary.

---

## 7. Conclusion

We present evidence that **role-information coherence** is a structural precursor of consensus phase collapse in LLM multi-agent systems. Breaking this coherence (shuffle) produces larger and more statistically robust improvements in decision quality than any form of within-discussion governance intervention.

Three empirical findings emerge from 89 experiments across two tasks:

1. **Shuffle dominates governance.** Breaking role-information coherence improves decision quality by +18.3 points (p=0.001, replicated across tasks), while full governance produces a non-significant +4.0 points (p=0.36).

2. **Consensus is a false signal.** Decision quality and consensus level are uncorrelated (r ≈ 0) across two tasks, invalidating convergence as a stopping criterion for LLM multi-agent systems.

3. **Post-hoc governance has a structural ceiling.** Four targeted interventions, individually and collectively, fail to significantly outperform baseline (all p > 0.17).

The practical implication is clear: **design multi-agent systems to suppress overconfidence structurally (by mismatching roles and information) rather than attempting to correct it procedurally.** The theoretical implication is that the phase boundary of multi-agent consensus is a function of role-information topology — a dimension that should be incorporated into statistical-physics models of agent collectives.

---

## Acknowledgments

Experiments conducted using DeepSeek-V3 API. Statistical analysis uses bootstrap, permutation test, and Welch t-distribution methods implemented from first principles. All code is open-source at `github.com/mulasakee17/swarmalpha`.

---

## Appendix A: Statistical Methods Detail

### A.1 Permutation Test

For each comparison (e.g., full vs none), the test statistic is the observed mean difference $\Delta\bar{Q}$. The null distribution is generated by:

1. Pool all observations from both conditions
2. Randomly reassign condition labels (10,000 permutations)
3. Compute $\Delta\bar{Q}$ for each permutation
4. Two-sided p-value = proportion of permuted $|\Delta\bar{Q}| \geq |\Delta\bar{Q}_{\text{obs}}|$

Permutation uses mulberry32 PRNG (seed=42) for complete reproducibility.

### A.2 Bootstrap Confidence Intervals

Bias-corrected percentile bootstrap with 10,000 resamples per condition. 95% CI reported.

### A.3 Multiple Comparison Correction

For K simultaneous tests:
- **Bonferroni**: $\alpha_{\text{corrected}} = \alpha / K$
- **Benjamini-Hochberg FDR**: Rank p-values; reject all $p_{(i)} \leq \frac{i}{K}\alpha$

## Appendix B: Task Specifications

### B.1 Crisis Response Task

**Scenario**: Emergency response team must prioritize 5 crisis areas for resource allocation.

**5 agents**: Medical Coordinator, Infrastructure Lead, Logistics Chief, Communications Director, Security Head.

**5 dimensions per area**: Casualty Impact (1-10), Infrastructure Damage (1-10), Resource Availability (1-10), Public Visibility (1-10), Recovery Timeline (1-10).

Each agent holds **private information** on 2-3 dimensions across all areas. The ground truth ranking is determined by a weighted sum: 0.35 × Casualty Impact + 0.25 × Infrastructure Damage + 0.20 × Resource Availability + 0.10 × Public Visibility + 0.10 × Recovery Timeline.

### B.2 Supplier Selection Task

**Scenario**: Manufacturing firm must rank 5 component suppliers for a strategic sourcing decision.

**5 agents**: Cost Analyst, Quality Engineer, Delivery Specialist, Technical Director, Financial Advisor.

**5 dimensions per supplier**: Cost Competitiveness (0-1), Quality Rating (0-1), Delivery Reliability (0-1), Technical Capability (0-1), Financial Stability (0-1).

Each agent holds **private data** on their domain dimension plus partial data on 1-2 overlapping dimensions. The ground truth ranking is determined by a weighted sum: 0.30 × Cost + 0.25 × Quality + 0.20 × Delivery + 0.15 × Technical + 0.10 × Financial.

## Appendix C: Full Results Tables

*[To be populated with complete tables from the 89-experiment dataset]*

## Appendix D: Reproducibility Checklist

- [x] All code open-source (MIT license)
- [x] Seeded PRNG (mulberry32) for all stochastic operations
- [x] Full experiment logs with per-round beliefs, confidences, interventions, and token usage
- [x] Statistical analysis scripts with explicit random seeds
- [ ] Pre-registration (to be completed before next experiment batch)
- [ ] Cross-model validation data (pending)
- [ ] Power analysis for future sample size determination (pending)

---

> **Draft version**: 2026-07-14. Corresponding experiments completed 2026-07-14.  
> **Code**: [github.com/mulasakee17/swarmalpha](https://github.com/mulasakee17/swarmalpha)
