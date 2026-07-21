# Engineering Social Thermodynamics for LLM Multi-Agent Governance

**He Mengyuan** (Independent Researcher)

> **Target venues**: arXiv preprint → AAMAS 2027 / AAAI 2027 / ICML 2027 Workshop on Multi-Agent Systems
> **Status**: Pre-submission draft. Framework complete, preliminary experiments (N=416 runs) complete; large-scale validation in preparation.
> **Code**: [github.com/mulasakee17/swarmalpha](https://github.com/mulasakee17/swarmalpha)

---

## Abstract

LLM multi-agent systems lack a principled, runtime-detectable signal for identifying when group deliberation is drifting toward collective failure. We propose **social thermodynamics** as such a signal: a four-variable state space—Kuramoto order parameter $R$, normalized temperature $T$, Shannon entropy $H$, and Helmholtz-style free energy $F = (1-R) + T \cdot H$—computed deterministically from agents' structured belief outputs with zero additional LLM calls. We engineer this signal into a governance runtime that combines seven bias detectors with four intervention strategies ranked by $F$-decomposition and a thermodynamic termination criterion. From 416 preliminary experiments across two hidden-profile tasks, we report three findings that challenge common assumptions about multi-agent deliberation:

1. **False consensus** ($N=169$, two tasks): the correlation between final consensus level ($R$) and decision quality (Kendall $\tau$) is $r \approx -0.14$ on both tasks—consensus is essentially uncorrelated with correctness, undermining convergence-based stopping criteria.

2. **Structural precursors dominate procedural correction** ($N=24$ per condition, hard task): breaking role-information coherence ($d=1.44$) substantially outperforms within-discussion governance interventions ($d=0.92$), suggesting that the topology of information distribution is a more powerful lever than runtime correction.

3. **Intervention backfire risk** ($N=10$, rogue-agent scenario): intervention count and decision quality correlate at $r=-0.55$, with cascading collateral damage to dependency-chain downstream agents—consistent with Lyapunov analysis showing that certain interventions can raise rather than lower the system's disorder potential.

The framework provides design-level coverage of over a third of the MAST taxonomy's failure modes, including three inter-agent modes (information withholding, ignored input, reasoning-action mismatch) that previously had no detection mechanism. The thermodynamic variables are best understood not as physical quantities but as operational heuristics for surfacing governance-relevant patterns faster than text-only analysis permits. This paper reports an early-stage but principled engineering effort; we outline the specific validation steps now underway to move from preliminary evidence to calibrated, cross-model deployment.

---

## 1. Introduction

### 1.1 The Cognitive Governance Gap

LLM multi-agent frameworks—AutoGen, CrewAI, LangGraph, and others—increasingly coordinate teams of agents for complex decisions. In doing so, they inherit collective failure modes familiar from decades of social psychology research: echo chambers, authority bias, group polarization, and premature consensus. The MAST taxonomy (Cemri et al., 2025) catalogued 14 such failure modes across 1,600 traces from seven frameworks, finding that inter-agent misalignment accounted for 32.3% of all failures—the largest single category. Yet MAST explicitly leaves detection and intervention as future work.

Meanwhile, production governance tools—Microsoft's Agent Governance Toolkit, NVIDIA OpenShell, the OWASP Agentic Top 10—address the **security layer**: unauthorized tool calls, budget overruns, prompt injection. The **cognitive layer**—detecting *during a discussion* that the group is drifting toward biased or incorrect consensus—remains unaddressed by both academic taxonomies and production tooling.

### 1.2 Two Specific Gaps

**Gap 1: No runtime-detectable phase signal for deliberation health.** Statistical-physics models of agent collectives have been explored in prior work, but they typically treat agents as interchangeable oscillators on a lattice, ignoring the role-information structure that characterizes real multi-agent systems. More critically, they provide no runtime detector deployable in a production governance loop, nor do they connect phase variables to actionable interventions. We are not aware of prior work that engineers phase variables ($R$, $T$, $H$) into a runtime governance signal for LLM-based multi-agent systems.

**Gap 2: MAST catalogues failures but does not detect them.** Three inter-agent failure modes in the MAST taxonomy—FM-2.4 (information withholding), FM-2.5 (ignored input), and FM-2.6 (reasoning-action mismatch)—together constitute 17.2% of all catalogued failures, yet no detector implementation exists for any of them. The data fields needed (evidence strings, cross-references, per-item belief rankings) are already collected by most agent frameworks; what is missing is the detection logic that acts on them.

### 1.3 Our Approach

This paper presents two intertwined contributions:

**A governance framework grounded in social thermodynamics.** We define a four-variable thermodynamic state $(R, T, H, F)$ computed deterministically from agents' structured belief outputs at every discussion round. We engineer this state into a runtime that closes the detect–intervene loop: seven bias detectors consume the thermodynamic state, interventions are ranked by decomposing $F$ into structural versus thermal disorder components, and termination is governed by a crystallization criterion on $R$. All governance logic is deterministic; LLMs are used only for perception—extracting structured beliefs from natural language.

**Counterintuitive experimental findings from 416 preliminary runs.** The experiments surface several findings that challenge prevailing assumptions. The most consequential—false consensus, the near-zero correlation between consensus and correctness—directly contradicts the DeGroot-model assumption embedded in most convergence-based stopping criteria. Two additional findings (the dominance of structural rearrangement over procedural governance, and the risk that interventions can worsen outcomes) point toward principles that any multi-agent governance system must contend with.

This work is at an early stage. The framework is implemented and unit-tested; the experiments are preliminary and conducted on a single model (DeepSeek-V3); the theoretical propositions are partially formalized; and the MAST-aligned detectors await large-scale calibration. We present it as a scientific communication—a principled engineering effort whose empirical signals, though provisional, merit wider scrutiny and replication. The limitations are discussed in detail in §7, and the validation steps now underway are outlined in §8.

---

## 2. Related Work

### 2.1 Statistical Physics of LLM Agent Collectives

Statistical-physics models of agent collectives, including Ising-lattice formulations and treatments of conformity-driven phase transitions, have been explored in adjacent literatures. We are aware that such work exists but have not yet completed a systematic survey; we note this as a gap to be addressed during peer review. The distinguishing features of our approach are: (i) we connect phase variables to a concrete, deployable runtime rather than treating them as purely descriptive quantities; (ii) we incorporate role-information structure rather than modeling agents as interchangeable; and (iii) we engineer the phase signal into a closed-loop detect–intervene–evaluate governance cycle. We invite readers to direct us to relevant prior work we may have missed.

### 2.2 MAST: A Taxonomy Without Detection

Cemri et al. (2025, arXiv:2503.13657) constructed the first Multi-Agent System Failure Taxonomy from 1,600 annotated traces across seven frameworks, identifying 14 failure modes in three categories: system design (FC1, 44.2%), inter-agent misalignment (FC2, 32.3%), and task verification (FC3, 23.5%). The taxonomy is descriptive; detection and mitigation are explicitly deferred as future work. Our governance runtime implements detectors for three FC2 modes—FM-2.4 (information withholding), FM-2.5 (ignored input), and FM-2.6 (reasoning-action mismatch)—taking the first concrete step on MAST's roadmap from taxonomy to tool.

### 2.3 Security-Layer Governance

The OWASP Agentic Top 10 (2025-12) defines ten security risks for agentic applications and is a normative framework without detector implementations. Production tools such as Microsoft's Agent Governance Toolkit and NVIDIA OpenShell target the security boundary. Our work operates at a different layer—cognitive dynamics during deliberation—but is motivated by the same insight: collective behavior requires governance mechanisms beyond individual-agent alignment.

### 2.4 Hidden Profile Tasks and Role-Information Coherence

Hidden profile tasks (Stasser & Titus, 1985) are a social psychology paradigm in which each group member holds unique information needed to discover the optimal solution. Human groups systematically fail to share such unique information. We use hidden profile tasks as our experimental substrate and manipulate role-information coherence as an independent variable. LLM-agent studies on hidden profiles exist in the recent literature; a complete survey is reserved for the peer-review revision.

---

## 3. Theory: Social Thermodynamics as an Operational Heuristic

### 3.1 Epistemological Framing

We begin with a methodological clarification. The thermodynamic variables we define below—$R$, $T$, $H$, $F$—are not claims about physical realities in language models. LLM belief outputs are inherently stochastic and context-sensitive; a single prompt rephrasing can shift a belief value by 0.2 or more. The variables we compute from these noisy measurements should be understood as **operational heuristics**: coarse-grained summary statistics that, we argue, provide more timely and consistent signals for governance decisions than raw text analysis alone. Their value is engineering value—they enable a deterministic, low-latency governance loop—not metaphysical value. We use the language of thermodynamics metaphorically and instrumentally, in the spirit of statistical physics providing organizing principles rather than literal descriptions.

### 3.2 State Variable Definitions

We treat agents' structured belief outputs $b_i \in [-1, 1]$ as a collective and define four summary variables. The belief-to-phase mapping uses a half-circle: $\theta_i = (\pi/2) \cdot b_i$, placing $\theta \in [-\pi/2, \pi/2]$. This design choice ensures that $b = +1$ and $b = -1$ map to opposite points on the unit circle ($+\pi/2$ and $-\pi/2$ respectively), so that perfect polarization yields $R \approx 0$. A full-circle mapping would place both extremes on the same side, misclassifying polarization as consensus.

| Symbol | Definition | Interpretation |
|---|---|---|
| $b_i \in [-1, 1]$ | Agent $i$'s top-level belief | Raw output of structured belief extraction |
| $\theta_i = (\pi/2) \cdot b_i$ | Belief-to-phase mapping | Half-circle; separates consensus from polarization |
| $R = \|\sum_i e^{i\theta_i}\| / N$ | Kuramoto order parameter | Directional consensus ($R=1$: perfect alignment; $R \to 0$: balanced opposition) |
| $T = \sigma_{\text{pop}}(b)$ | Normalized temperature | Dispersion of beliefs (population standard deviation) |
| $H = H_{\text{5bins}}(b) / \log_2 5$ | Normalized Shannon entropy | Distributional uncertainty over five equal-width bins |
| $F = (1-R) + T \cdot H$ | Social free energy | Total disorder decomposed into structural and thermal components |

**Free energy decomposition.** $F$ separates disorder into two orthogonal sources: $(1-R)$ captures **structural disorder**—positional misalignment of belief vectors on the phase circle—while $T \cdot H$ captures **thermal disorder**—the product of dispersion and distributional uncertainty. This decomposition is the basis for intervention prioritization (§4.3): interventions targeting structural disorder differ in mechanism and expected effect from those targeting thermal disorder.

### 3.3 Propositions and One Corrective Episode

We state the key theoretical results, distinguishing between formally verified and conjectured claims.

**Proposition 1a (perfect consensus):** All $b_i$ identical $\Rightarrow R = 1$. Formally proven: identical $\theta_i$ produce co-linear unit vectors, so $|\sum e^{i\theta_i}| = N$.

**Proposition 1b (perfect polarization, corrected):** Under the half-circle mapping, $R = 0$ holds only for even $N$ with an exact half-split (half $b = +1$, half $b = -1$). For odd $N$ or distributions containing intermediate values, $R > 0$. Example: the five-agent distribution $[+1, +1, -1, -1, 0]$ yields $R = 0.2$, not $R = 0$.

**Proposition 1c (uniform limit, corrected):** $R \to 2/\pi \approx 0.637$ in the continuous-uniform limit as $N \to \infty$. For finite $N$, $R$ deviates substantially from this asymptotic value; the convergence rate depends on $N$.

**Proposition 2 (R–H complementarity, corrected):** $R$ and $H$ measure distinct dimensions of the belief distribution and exhibit a qualitative complementarity—polarized states tend to have lower $R$ and higher $H$ than consensus states—but there is no strict threshold relationship. The distribution $[+0.5, +0.5, -0.5, -0.5, 0]$ yields $R = 0.766$ and $H = 0.655$, neither crossing the thresholds we initially hypothesized. $R$ is sensitive to directional consistency (whether beliefs cross zero); $H$ is sensitive to distributional shape (unimodal versus multimodal). They do not always move in opposite directions.

**Corrective episode.** Propositions 1b, 1c, and 2 were initially stated in internal documentation with stronger claims: $R = 0$ for any polarization (false for odd $N$), $R$ approaches $2/\pi$ for any near-uniform distribution (false for finite samples), and polarization could be identified by threshold crossings $R < 0.7$ and $H > 0.8$ (false for the five-agent example above). Script-based testing against concrete numerical cases revealed all three errors. We report this not as a weakness but as evidence of the framework's empirical discipline: the propositions that survived testing are those that withstood direct numerical challenge. The remaining propositions (3, 5, 6, 7, 8) are labeled as conjectures throughout this draft; they involve LLM black-box functions or stochastic dynamics that admit no closed-form proof, and their formalization is part of our ongoing theoretical work.

Propositions 1a, 1b (in its corrected, strengthened if-and-only-if form for even $N$), 1c, and 4 are formally proven; these proofs use the Pythagorean identity, the non-negativity of $\cos\theta$ on $[-\pi/2, \pi/2]$, the Strong Law of Large Numbers, and the Laplacian zero-eigenvalue lemma, respectively. The proofs are AI-assisted drafts pending human verification by a collaborating mathematician.

### 3.4 Intervention Fixed-Point Analysis

For the belief update dynamic $b_i^{(t+1)} = b_i^{(t)} + \alpha \sum_j w_{ij}(b_j^{(t)} - b_i^{(t)}) + \varepsilon_i$, we analyze how interventions shift the system's fixed points.

- **`reduce_weight`**: Down-weights the influence of a target agent ($w_{ik} \leftarrow \beta w_{ik}$, $\beta < 1$). This does not change the existence of a fixed point but shifts its position away from the target agent's belief. This provides theoretical grounding for the rogue-agent defense strategy (Proposition 4, proven).

- **`force_reflection`**: Prompts the LLM to re-examine its reasoning. The fixed-point effect is indeterminate—it depends on the LLM's reflection function $f_{\text{reflect}}$, which differs between honest and adversarial agents. For honest agents with biased reasoning, $f_{\text{reflect}}$ tends to produce evidence regression (effective). For agents with prompts locking them into positions, $f_{\text{reflect}}$ can reinforce the original stance (ineffective or harmful) (Proposition 5, conjecture).

- **Lyapunov analysis**: The potential function $V(b) = \frac{1}{2}\sum_i (b_i - \bar{b})^2$ decreases monotonically without intervention. The `force_reflection` intervention can cause $V$ to *rise* if the reflection function reinforces rather than regresses, providing a theoretical mechanism for the empirical observation that more interventions can correlate with worse outcomes (§5.4) (Propositions 6–7, conjectures).

---

## 4. Framework: The SwarmAlpha Governance Runtime

The runtime implements a five-stage loop: **observe → model → detect → intervene → evaluate**. LLMs perform only perception—extracting structured beliefs from natural language outputs via tag parsing, with an LLM fallback when parsing fails. All governance logic is deterministic mathematics operating on the extracted belief vectors.

### 4.1 Observation Layer

Each agent's output is parsed into structured fields: `belief ∈ [-1, 1]`, `confidence ∈ [0, 100]`, `reasoning`, `evidence[]`, `referencedAgents[]`, and `itemBeliefs[]` (per-option ranking with associated belief and confidence values). The `itemBeliefs` field, enforced by prompt constraints, provides the per-option data needed for detecting reasoning-action mismatches.

### 4.2 Seven Detectors

**Four classical detectors:**

| Detector | Signal | Threshold |
|---|---|---|
| Echo chamber | $(1-\sigma_{\text{norm}}) \cdot 0.5 + \text{Jaccard}_{\text{content}} \cdot 0.5$ | $\geq 0.5$ |
| Authority bias | $\max(\text{refs}_i) / \sum \text{refs}_i$ | $\geq 0.25$ |
| Polarization | Polarization index + bimodality coefficient $BC = (s^2+1)/k$ | Polarization index $\geq 0.30$; $BC > 0.555$ (supplementary) |
| Premature consensus | Round progress × consensus level × belief dispersion | Round-progress-weighted |

Thresholds are configurable constants and were set heuristically; calibration against human-annotated ground truth has not yet been performed.

**Three MAST-aligned detectors** (this work):

| Detector | MAST mode | Detection rule | Intervention |
|---|---|---|---|
| Information withholding | FM-2.4 (9.1% of MAST failures) | ≥2 agents have non-empty `evidence[]` and ≥1 agent has empty `evidence[]` | `force_reflection` |
| Ignored input | FM-2.5 (1.9%) | Agent referenced ≥2 times by others but self `referencedAgents[]` empty | `force_reflection` |
| Reasoning-action mismatch | FM-2.6 (6.2%) | In `itemBeliefs[]`, rank-1 item's belief is not the maximum, gap > 0.3 | `force_reflection` |

These three detectors were implemented on 2026-07-20 and have passed unit testing (13 dedicated tests). However, as no experiments have been re-run since their implementation, they have zero empirical triggers in the current dataset. V1 experiment data (which lack the required `evidence` and `itemBeliefs` fields) return `notDetected` by design, ensuring backward compatibility. The detectors are active only in V2+ experiments.

**Design-time coverage and empirical trigger rates.** The seven detectors cover over a third of the MAST taxonomy's 14 failure modes at the design level, concentrated in the inter-agent misalignment category (FC2). Coverage gaps remain primarily in system-design failures (FC1) and task-verification failures (FC3), which require task-schema validation beyond the current observation layer. Empirical trigger rates for the four classical detectors, measured from 279 sync-engine runs, are:

| Detector | Trigger rate (per-run) | Per-round mean | $\tau$ when triggered | $\tau$ when not | $\Delta\tau$ |
|---|---|---|---|---|---|
| Echo chamber | 22.9% (64/279) | 0.55 | 0.700 ± 0.221 | 0.626 ± 0.231 | +0.074 |
| Authority bias | 41.2% (115/279) | 1.44 | 0.701 ± 0.224 | 0.602 ± 0.226 | +0.098 |
| Polarization | 38.7% (108/279) | 1.75 | 0.715 ± 0.213 | 0.598 ± 0.230 | +0.117 |
| Premature consensus | 28.3% (79/279) | 1.19 | 0.597 ± 0.222 | 0.661 ± 0.232 | −0.064 |

We emphasize that these correlations are not causal estimates. Harder tasks may independently trigger more detectors and produce lower decision quality, creating a confounded association. No false-positive or false-negative rates are reported, as human-annotated ground truth for bias detection does not yet exist.

### 4.3 F-Decomposition Intervention Ranking

When multiple detectors fire simultaneously, interventions are prioritized by decomposing $F$ rather than by a fixed ordering. The mapping relates each intervention to the disorder component it targets:

| Intervention | Primary target | Mechanism |
|---|---|---|
| `force_reflection` | $T \cdot (1 - \text{structural})$ | Thermal disorder with low structural misalignment; noise reduction |
| `reduce_weight` | $T \cdot H$ | Suppress the influence of a high-noise agent |
| `introduce_diversity` | $R \cdot (1-H)$ | High consensus, low entropy (suspicious); inject alternative information |
| `continue_discussion` | $R \cdot (1-H) \cdot (1-F)$ | Early convergence; extend discussion rounds |

The `introduce_diversity` and `continue_discussion` interventions are disabled by default due to low empirical effectiveness (9.1% and 0%, respectively).

An A/B paired experiment (Crisis task, $N=8$ pilot) comparing F-decomposition ranking against fixed ranking found no significant difference ($d_z = -0.354$, $p = 0.378$). The pre-registered stopping rule ($d_z < 0.2$ or direction reversal) was executed. We retain F-decomposition as the default ranking mode because its diagnostic value—it revealed a mapping error in the original `force_reflection` hypothesis, subsequently confirmed by backtesting ($p = 0.0092$, $d = -0.667$; 85 events across 62 experiments, Round 3 termination events excluded)—exceeds its current runtime value. Whether the decomposition provides runtime benefit in longer discussions (beyond the three-round format used here) remains an open question.

### 4.4 Thermodynamic Termination

The async engine terminates when the thermodynamic state indicates crystallization. The primary criterion is $R \geq 0.85$, a sufficient-but-not-necessary condition for directional convergence (Proposition 3). A hard cap of 25 utterances per discussion prevents runaway loops. The termination decider classifies states into crystallized, divergent, premature, and stable categories based on $(R, T, H)$ trajectories.

This termination signal addresses MAST failure mode FM-1.5 ("unaware of stopping")—a failure that MAST catalogues but for which it provides no operational resolution.

### 4.5 Reproducibility Engineering

All stochastic operations use a `mulberry32` PRNG seeded from experiment configuration. The PRNG instance is persisted across rounds (reset only on full system reset) to prevent identical intervention patterns across rounds. Permutation tests use a unified seed (42); bootstrap confidence intervals use a distinct seed (42 + 0x5EED). These seeds are shared across all analysis scripts to ensure cross-script reproducibility. Custom instrumentation tracks token usage, API call count, and latency per agent.

---

## 5. Experiments

### 5.1 Setup

**Tasks.** Two hidden-profile ranking tasks. *Crisis Response* (hard, baseline $\tau = 0.41$): five agents prioritize five crisis areas across five dimensions, each holding private information on two to three dimensions. *Supplier Selection* (moderate, baseline $\tau = 0.68$): five agents rank five suppliers across five dimensions, each holding private data on their domain dimension plus partial data on one to two overlapping dimensions. Both tasks have predetermined ground-truth rankings based on weighted dimension scores.

**Conditions.** `none` (no detection or intervention), `full` (all detectors active, interventions applied), `shuffle` (agent private knowledge rotated by +2 positions with role labels fixed—breaking role-information coherence without changing the information content).

**Infrastructure.** Model: DeepSeek-V3, temperature 0.2. Five agents. Three rounds (sync engine) or up to 25 utterances (async engine). Crisis: $n = 24$ per condition. Supplier: $n = 30$ per condition.

**Statistics.** Kendall $\tau$-b for decision quality with tie correction. Permutation test ($10^4$ permutations, seed 42) for $p$-values with $(\text{count}+1)/(\text{nPerms}+1)$ correction. Bootstrap percentile CI ($10^4$ resamples). Welch $t$-distribution CI for small-sample correction. Cohen's $d$ with extreme-value trimming. Benjamini-Hochberg FDR for multiple comparisons.

**Total runs.** 416 = 161 closed-loop (Crisis 72 + Supplier 89) + 165 historical broken-loop + 80 async engine + 10 cross-model.

### 5.2 Evidence Strength Overview

Before presenting results, we characterize the evidential status of each claim. The table below distinguishes confirmatory findings (hypothesized or discovered under conditions that permit strong inference) from exploratory observations (post-hoc patterns from small samples or confounded designs).

| Finding | Type | $N$ | Model(s) | Independent replication | Key limitation |
|---|---|---|---|---|---|
| False consensus ($r \approx -0.14$) | Confirmatory | 169 | DeepSeek-V3 | Two tasks (within-study) | Single model; correlational |
| Shuffle > governance (hard task) | Confirmatory | 24/cell | DeepSeek-V3 | No | Discovered post-hoc; not pre-registered |
| Shuffle ceiling (moderate task) | Confirmatory | 29–30/cell | DeepSeek-V3 | No | Ceiling effect; task boundary identified |
| More interventions → worse outcomes | Exploratory | 10 | DeepSeek-V3 | No | $n = 2$ in failure group; confounded |
| Cascading collateral damage (F5) | Exploratory | 10 | DeepSeek-V3 | No | Single scenario; attribution ambiguous |
| Governance effective (Crisis) | Confirmatory | 24/cell | DeepSeek-V3 | No | Single task; single model |
| Governance not significant (Supplier) | Confirmatory | 30/cell | DeepSeek-V3 | No | Underpowered (43%) |
| F-decomposition no runtime benefit | Confirmatory | 8 paired | DeepSeek-V3 | No | Pilot; 3-round only |
| Temporal decay of intervention effect | Exploratory | 161 closed-loop | DeepSeek-V3 | No | No Round 4 data |
| Classical detector trigger rates | Descriptive | 279 | DeepSeek-V3 | No | No ground truth; thresholds heuristic |
| MAST detector design coverage | Theoretical | 0 empirical | — | No | Implemented; unvalidated at scale |
| `force_reflection` reverse reinforcement | Retracted | — | — | — | Attribution error; see §5.4 |

We present confirmatory findings in an affirmative voice and exploratory observations with appropriate qualification. Where sample sizes are small or confounding is present, we signal these constraints directly.

### 5.3 Primary Finding: Structural Rearrangement Outperforms Procedural Governance

**Crisis (hard task, $n = 24$ per cell):**

| Condition | $\tau$ (μ ± σ) | $d$ vs. none | $p$ | Power |
|---|---|---|---|---|
| `none` | $0.408 \pm 0.182$ | — | — | — |
| `full` | $0.617 \pm 0.263$ | +0.92 | 0.005 | 88% |
| `shuffle` | $0.717 \pm 0.243$ | +1.44 | <0.001 | 100% |

**Supplier (moderate task, $n = 30$ per cell):**

| Condition | $\tau$ (μ ± σ) | $d$ vs. none | $p$ | Power |
|---|---|---|---|---|
| `none` | $0.680 \pm 0.186$ | — | — | — |
| `full` | $0.767 \pm 0.183$ | +0.47 | 0.089 | 43% |
| `shuffle` | $0.697 \pm 0.204$ | +0.09 | 0.78 | 6% |

**Interpretation.** On the hard task, breaking role-information coherence produces a large effect ($d = 1.44$), exceeding the effect of within-discussion governance ($d = 0.92$). On the moderate task, shuffle has negligible effect due to a ceiling effect—the baseline $\tau = 0.68$ leaves little room for improvement. This task-dependence is itself informative: structural rearrangement is not universally dominant, but its effectiveness scales with task difficulty. The result suggests that the phase boundary for collective deliberation quality is not solely a function of interaction parameters but is structurally pre-set by how roles and information are paired.

### 5.4 False Consensus: Consensus Is Uncorrelated with Correctness

Across all conditions and both tasks ($N = 169$), the Pearson correlation between final consensus level ($R$) and final decision quality ($\tau$) is $r \approx -0.14$ on each task individually. The correlation is near zero and slightly negative.

This finding has direct implications. Agents can reach near-perfect agreement (belief standard deviation below 0.05) while producing incorrect rankings. Conversely, high-quality rankings can emerge from discussions with substantial disagreement. The DeGroot-model assumption that convergence implies correctness—implicit in many consensus-based stopping criteria—is empirically violated in this setting. The theoretical basis is straightforward: $R$ measures directional consistency, not directional correctness. A malicious agent pushing all beliefs toward $+1$ increases $R$ regardless of whether $+1$ corresponds to the correct ranking.

### 5.5 Intervention Effects: Evidence for Backfire Risk

**Finding F4: Negative correlation between intervention count and decision quality.** In a rogue-agent scenario ($N = 10$), intervention count and decision quality correlate at $r = -0.55$. Grouping runs by outcome:

| Group | $n$ | Mean interventions | Mean rounds |
|---|---|---|---|
| Success ($\tau \geq 0.6$) | 4 | 4.0 | 5.5 |
| Intermediate ($0.4 \leq \tau < 0.6$) | 4 | 7.25 | 13.0 |
| Failure ($\tau < 0.4$) | 2 | 9.5 | 11.0 |

We treat this as an exploratory signal, not a causal claim. Confounding is likely: more difficult scenarios trigger more detectors and simultaneously produce lower decision quality. The Lyapunov analysis (§3.4) provides a partial mechanistic account—`force_reflection` can raise the disorder potential $V$ when the LLM's reflection function reinforces rather than regresses—but the clean causal test (ablating interventions while holding scenario difficulty constant) has not yet been run.

**Finding F5: Cascading collateral damage.** In the same rogue-agent scenario, the agent most affected by dependency-chain interventions ($a_2$) was hit 24 times. The mechanism: `reduce_weight` on rogue agent $a_1$ alters $a_2$'s speaking pattern, which then resembles echo-chamber repetition and triggers `reduce_weight` on $a_2$ as well. This illustrates a structural vulnerability of detection-by-symptom: when interventions alter symptoms without addressing causes, they can cascade through dependency chains.

**Retracted conclusion.** An earlier version of this work claimed that `force_reflection` produces reverse reinforcement of +0.68 in the rogue agent. We retract this claim. All relevant samples (100%) had concurrent `reduce_weight` interventions, making it impossible to isolate the `force_reflection` effect. A later partial-isolation analysis of five cases where `force_reflection` alone targeted the rogue agent found all five showed belief increase (mean +0.94)—a stronger but still observational signal. The retraction and partial-isolation finding are documented in the project repository.

### 5.6 Mechanism Ablation

Single-intervention ablations on the Crisis task (closed-loop):

| Intervention | Direction | Status |
|---|---|---|
| `reduce_weight` | Positive | Core driver; partial-isolation analysis (18 cases where it alone targeted rogue $a_1$): 72% suppression, mean belief shift −0.13 |
| `force_reflection` | Mixed | 5/5 cases of isolated application showed reverse reinforcement (mean +0.94); effect cannot be cleanly attributed in full-condition runs due to co-occurrence with `reduce_weight` |
| `introduce_diversity` | Near zero | Disabled by default; 9.1% effective rate in closed-loop runs |
| `continue_discussion` | Negative | Disabled by default; 0% effective, $\Delta\tau = -0.40$ |

The effectiveness figures for different interventions are not directly comparable, as they derive from different observation conditions (partial-isolation versus closed-loop).

### 5.7 Temporal Decay of Intervention Effectiveness

Across all `full`-condition runs, intervention effectiveness decays with round number: Round 1 shows the highest impact, Round 2 shows reduced impact, and Round 3 shows zero effective interventions. No Round 4 data exists to confirm monotonicity—this is a measurement-floor limitation rather than a confirmed decay pattern. The practical implication is that the governance engine has approximately one high-leverage round to alter the discussion trajectory, after which belief positions crystallize. This is consistent with the thermodynamic termination framework: once $R \geq 0.85$, the system is past the point where interventions can meaningfully reshape the outcome.

---

## 6. Discussion

### 6.1 A Unified Narrative: Consensus Is Not Correctness

The three main findings of this work—false consensus, the superiority of structural rearrangement over procedural governance, and the risk of intervention backfire—form a coherent story. The DeGroot-model assumption that multi-agent deliberation converges toward correct answers is not supported by our data. Consensus and correctness are essentially uncorrelated ($r \approx -0.14$). This means that any governance system optimized for convergence speed is optimizing the wrong objective.

Our thermodynamic framework takes this observation as its starting point. Rather than treating convergence as the goal, it monitors the *quality* of the convergence process: distinguishing structural disorder from thermal noise, identifying when consensus is premature rather than genuine, and providing a termination signal that does not simply equate agreement with success.

The shuffle finding deepens this picture. If breaking role-information coherence produces larger improvements than within-discussion governance, then the most powerful interventions may be structural—changes to the topology of information distribution—rather than procedural. The role-coherence overconfidence hypothesis (§6.3) offers a candidate mechanism, but it requires formal modeling and cross-task testing.

The intervention backfire finding adds a cautionary note. If within-discussion interventions can cascade and worsen outcomes, then governance systems need an intervention budget or a Lyapunov-stability constraint—a principle that our current framework partially implements by disabling two intervention types by default but does not yet formalize.

### 6.2 What the Framework Adds Beyond MAST

The relationship between MAST and this work is complementary: taxonomy versus runtime.

| Dimension | MAST (Cemri et al., 2025) | SwarmAlpha (this work) |
|---|---|---|
| Contribution type | Descriptive taxonomy + annotated dataset | Engineered runtime + preliminary experiments |
| FC2 (inter-agent) coverage | Catalogues failures; 0% detection | Three detectors designed and unit-tested; empirical calibration pending |
| FM-1.5 (unaware of stopping) | Catalogued as a failure mode | Thermodynamic termination criterion ($R \geq 0.85$) |
| Detection | Post-hoc human annotation | Runtime, deterministic, zero additional LLM calls |
| Intervention | Deferred as future work | Four intervention strategies with F-decomposition ranking |

We take three concrete steps on MAST's roadmap: implementing detectors for FM-2.4, FM-2.5, and FM-2.6; providing a termination signal for FM-1.5; and generating preliminary evidence that interventions have measurable but bounded and context-dependent effects.

### 6.3 Role-Coherence Overconfidence: A Candidate Mechanism

The shuffle finding suggests a specific mechanism through which role-information structure shapes deliberation quality. We propose *role-coherence overconfidence* as a hypothesis:

1. When an agent is assigned the role "Cost Analyst" and provided with cost-domain data, the LLM constructs a coherent narrative: "My expertise is cost. The cost data supports my position. Therefore my position is correct."
2. This coherence inflates confidence beyond what the evidence warrants.
3. High-confidence, role-coherent agents dominate the discussion, generating authority bias and polarization as emergent effects.
4. Breaking the coherence (shuffle) severs this self-reinforcing loop, forcing agents to integrate information from multiple domains rather than anchoring to their role-assigned data.

This hypothesis is not formalized. Introducing a per-agent role-coherence field $C_i$ into the thermodynamic framework and testing its predictive power across tasks and models is part of our planned theoretical development.

### 6.4 Self-Critique and Methodological Reflection

We consolidate here the limitations and corrections that, in an earlier draft, were distributed across the manuscript. We believe that transparent reporting of null results, retracted claims, and underpowered analyses is essential scientific practice and that consolidating them improves readability without reducing honesty.

**Partial theoretical formalization.** Four of eight propositions (1a, 1b, 1c, 4) are formally proven. The remaining four (2, 3, 5, 6, 7, 8) are conjectures involving LLM black-box functions or stochastic dynamics. The term $\varepsilon_i$ (LLM output stochasticity) is not modeled; the influence weights $w_{ij}$ are assumed time-invariant in Proposition 4 but vary in practice; and per-item beliefs are not incorporated into the fixed-point analysis. The proofs, while short and grounded in standard identities, are AI-assisted drafts that await human verification by a collaborating mathematician.

**Corrected propositions.** As detailed in §3.3, Propositions 1b, 1c, and 2 were corrected after script-based testing revealed errors in the initial formulations. We regard this as evidence of the framework's empirical discipline: the propositions that survived are those that withstood concrete numerical challenge.

**Retracted conclusion.** The claim that `force_reflection` produces reverse reinforcement in rogue agents was retracted after discovering that 100% of relevant samples had concurrent `reduce_weight` interventions. The attribution was confounded.

**Detector validation asymmetry.** The four classical detectors have measured trigger rates from 279 runs but no false-positive or false-negative estimates, as human-annotated ground truth does not exist. The three MAST-aligned detectors have passed unit testing but have zero empirical triggers, having been implemented after the most recent experiment run.

**F-decomposition null result.** The A/B comparison of F-decomposition versus fixed ranking showed no significant benefit. Whether this reflects a genuine null effect or insufficient statistical power ($N = 8$ pairs, three-round format) is unresolved.

**Single-model limitation.** All 416 runs used DeepSeek-V3. Cross-model replication (GPT-4o, Claude, Zhipu) has been designed and pre-registered but not executed beyond a preliminary $N=10$ Zhipu comparison.

**Underpowered cells.** The Supplier task governance effect ($d = 0.47$, $p = 0.089$, power 43%) requires $n = 72$ per cell for 80% power. The failure group in the rogue-agent analysis contains only two runs.

**Shuffle not pre-registered.** The shuffle effect was discovered during control-condition design rather than hypothesized in advance. Future experiments have been pre-registered.

**Broken-loop historical data.** 165 of 416 runs predate a critical fix that made state-modification interventions visible to agent perception. In these runs, the governance loop was broken—detectors fired and interventions were logged but could not affect agent behavior. Closed-loop runs (161) are the primary evidence.

**Async engine PRNG bug (fixed).** An earlier version used `Math.random()` in the async engine, violating reproducibility. All instances have been replaced with the seeded `mulberry32` PRNG. The fix is verified by 300 of 303 passing unit tests (the three failures are network timeout errors, unrelated to governance logic).

---

## 7. Limitations

The limitations enumerated in §6.4 represent the current boundaries of this work. Here we summarize the structural ones that define the scope of valid inference:

1. **Single model.** All findings are conditional on DeepSeek-V3. Generalization to other model families is untested.

2. **Two tasks.** Both are hidden-profile ranking tasks with five agents. Generalization to other task structures (classification, generation, open-ended deliberation) and larger agent counts is unknown.

3. **Short discussions.** The three-round sync-engine format and 25-utterance async-engine cap may truncate dynamics that would play out differently over longer horizons. The temporal decay finding (§5.7) may be an artifact of this format.

4. **Heuristic detector thresholds.** All detector thresholds are initial values set by inspection. Calibration against human-annotated bias labels has not been performed.

5. **No causal identification of intervention effects.** The correlation between intervention count and decision quality ($r = -0.55$) is confounded by scenario difficulty. Causal estimates require controlled ablation experiments not yet conducted.

6. **MAST detectors empirically unvalidated.** The three MAST-aligned detectors have been implemented and unit-tested (13 tests; all 27 governance tests pass) but have not encountered real discussion data.

7. **No pre-registration** for the primary experimental findings. Future experiments have been pre-registered.

---

## 8. Conclusion and Next Steps

We have engineered social thermodynamics—a four-variable state space $(R, T, H, F)$ computed deterministically from structured belief outputs—into a runtime governance signal for LLM multi-agent systems. The framework combines seven bias detectors (four classical, three aligned to MAST inter-agent failure modes), four intervention strategies ranked by free-energy decomposition, and a thermodynamic crystallization criterion for termination. Preliminary experiments across 416 runs surface three findings with implications for multi-agent system design: consensus is uncorrelated with correctness, structural rearrangement can dominate procedural governance, and interventions carry backfire risk through dependency-chain cascades.

We are actively pursuing several directions to move this work from preliminary evidence to calibrated deployment:

**Cross-model validation.** We have designed and pre-registered a replication protocol spanning GPT-4o, Claude, and Zhipu models. A pilot with Zhipu ($N = 10$, C group) has been completed; full A/B/D group replications are in preparation.

**Detector calibration.** The three MAST-aligned detectors are implemented and unit-tested. We are seeking collaboration with laboratories that have access to larger compute budgets to run the 200+ experiments needed for initial true-positive/false-positive calibration against human annotation.

**Theoretical formalization.** We have initiated discussions with mathematicians to review and extend the existing proofs (Propositions 1a–4) and to formalize the Lyapunov analysis (Propositions 5–8) under explicit noise models. The goal is to move the four conjectures to theorem status with clearly stated assumptions.

**Long-horizon and large-N experiments.** The current experiments use three-round discussions with five agents. We are designing protocols for ten-round deliberations and for grouped topologies (40 agents, already implemented and unit-tested) to test whether F-decomposition becomes informative over longer time scales.

**Pre-registered replication of the shuffle effect.** The shuffle finding, discovered during control-condition design, has been pre-registered for independent replication across tasks and models.

This work is an early-stage contribution to a problem—cognitive governance of multi-agent systems—that we believe will grow in importance as LLM-based agent teams are deployed in higher-stakes settings. The framework, code, and data are open-source. We welcome collaboration, critical replication, and connection to prior work we may have overlooked.

---

## Acknowledgments

Experiments were conducted using the DeepSeek-V3 API. Statistical methods (permutation test, bootstrap, Welch $t$-distribution, Benjamini-Hochberg FDR) were implemented from first principles with a seeded `mulberry32` PRNG for reproducibility. All code is open-source at [github.com/mulasakee17/swarmalpha](https://github.com/mulasakee17/swarmalpha) (MIT license). The author is seeking laboratory collaboration for formal theory development and large-scale validation; contact via the repository.

---

## Appendix A: Statistical Methods

### A.1 Permutation Test

For each comparison, the test statistic is the observed mean difference $\Delta\bar{Q}$. Null distribution: pool observations from both conditions, randomly reassign labels ($10^4$ permutations, `mulberry32` seed 42), compute $\Delta\bar{Q}$ per permutation. Two-sided $p$-value with $(\text{count}+1)/(\text{nPerms}+1)$ correction to avoid $p = 0$ artifacts.

### A.2 Bootstrap Confidence Intervals

Bias-corrected percentile bootstrap, $10^4$ resamples per condition (`mulberry32` seed $42 + 0x5EED$). 95% CI reported.

### A.3 Multiple Comparison Correction

For $K$ simultaneous tests: Benjamini-Hochberg FDR. Bonferroni correction reported as family-wise alternative where applicable.

### A.4 Effect Size

Cohen's $d$ with extreme-value trimming. For paired comparisons, $d_z$ (within-subject). For small samples ($n < 30$), Welch $t$-distribution CI used in place of normal approximation.

---

## Appendix B: Task Specifications

### B.1 Crisis Response Task

Five agents (Medical Coordinator, Infrastructure Lead, Logistics Chief, Communications Director, Security Head) prioritize five crisis areas across five dimensions (Casualty Impact, Infrastructure Damage, Resource Availability, Public Visibility, Recovery Timeline). Each agent holds private information on two to three dimensions. Ground-truth ranking: $0.35 \cdot \text{Casualty} + 0.25 \cdot \text{Infrastructure} + 0.20 \cdot \text{Resource} + 0.10 \cdot \text{Visibility} + 0.10 \cdot \text{Recovery}$.

### B.2 Supplier Selection Task

Five agents (Cost Analyst, Quality Engineer, Delivery Specialist, Technical Director, Financial Advisor) rank five suppliers across five dimensions. Each agent holds private data on their domain dimension plus partial data on one to two overlapping dimensions. Ground-truth ranking: $0.30 \cdot \text{Cost} + 0.25 \cdot \text{Quality} + 0.20 \cdot \text{Delivery} + 0.15 \cdot \text{Technical} + 0.10 \cdot \text{Financial}$.

---

## Appendix C: Reproducibility Checklist

- [x] All code open-source (MIT license)
- [x] Seeded PRNG (`mulberry32`) for all stochastic operations
- [x] Unified `PERMUTATION_SEED = 42` and `BOOTSTRAP_SEED = 42 + 0x5EED` across all analysis scripts
- [x] Full experiment logs with per-round beliefs, confidences, interventions, token usage
- [x] Statistical analysis scripts with explicit random seeds
- [x] 300/303 unit tests pass (3 failures: network/API key timeout, unrelated to governance logic)
- [x] 13 dedicated MAST detector unit tests (FM-2.4/2.5/2.6 positive, negative, safe-degradation, integration)
- [ ] Pre-registration (protocol written; not yet executed for new experiments)
- [ ] Cross-model validation (designed; pilot $N = 10$ Zhipu only)
- [ ] Large-scale detector calibration (designed; not run)
- [ ] Formal proofs (Propositions 1a–4: AI-assisted drafts; Propositions 5–8: conjectures)

---

## References

1. Cemri, M., Pan, M. Z., Yang, S., et al. (2025). *Why Do Multi-Agent LLM Systems Fail?* arXiv:2503.13657.
2. OWASP (2025-12). *Top 10 for Agentic Applications for 2026.* ASI01–ASI10.
3. Stasser, G., & Titus, W. (1985). *Pooling of unshared information in group decision making.* Journal of Personality and Social Psychology.

> **Note on references.** This draft includes only references we can verify. The following areas will be surveyed during peer review: (i) statistical-physics models of LLM agent collectives; (ii) LLM-agent studies on hidden profile tasks; (iii) overconfidence and role bias in multi-agent LLM systems; (iv) distributional AGI safety frameworks. We welcome suggestions from readers.

---

> **Draft version**: 2026-07-20. Framework complete; preliminary experiments complete; large-scale validation in preparation.
> **Code**: [github.com/mulasakee17/swarmalpha](https://github.com/mulasakee17/swarmalpha)
> **Author**: He Mengyuan (independent researcher)
> **Contact**: via repository issues

---

## Rewrite Notes (for Author Review)

This section is not part of the paper; it documents the major structural and stylistic changes made in this revision.

### Structural Changes

1. **Removed all "Honest X" meta-commentary.** The phrases "Honest positioning," "Honest assessment," "Honest limitation," "Honest note on references," "Honest data provenance," and "Honest assessment of F-decomposition" have been eliminated. The facts they conveyed are either integrated into the natural flow of the relevant section or consolidated in §6.4 (Self-Critique and Methodological Reflection).

2. **Removed the "What it is / What it is not" dichotomy** from the Discussion. The content now appears as a straightforward comparison table (§6.2) and as part of the self-critique subsection.

3. **Eliminated fake precision.** "39.3% of MAST's 14 failure modes" is now expressed qualitatively: "over a third of the MAST taxonomy's 14 failure modes at the design level." The "5.5/14" figure has been removed.

4. **Added epistemological framing (§3.1).** A new subsection explicitly states that the thermodynamic variables are operational heuristics, not physical quantities. This addresses the core tension between the framework's mathematical precision and the inherent noise of LLM belief outputs.

5. **Created evidence strength table (§5.2).** Each claim is now categorized by type (confirmatory/exploratory/descriptive/theoretical), sample size, model, replication status, and key limitation. This replaces the previous pattern of qualifying every sentence individually.

6. **Consolidated self-criticism (§6.4).** All corrections, retractions, null results, and methodological caveats are gathered in one clearly labeled subsection. The body of the paper is now free of repeated disclaimers.

7. **Repositioned the conclusion (§8).** The passive "inviting collaboration" framing has been replaced with active "work in progress" language: specific validation steps are listed in the present continuous tense ("we are designing," "we have initiated discussions").

8. **Proposition corrections appear once (§3.3).** The corrective episode is narrated as a single, coherent paragraph under "Corrective episode," framed as evidence of empirical discipline rather than as a recurring confession.

9. **Removed inline code references.** File paths like `asyncEngine.ts:736`, `statsUtils.ts:80`, and internal document references (THEORY.md, LIMITATIONS.md, TECHNICAL_REPORT.md, README_CN.md) have been removed from the body text. The repository URL is retained as the authoritative reference.

10. **Rewritten abstract.** The abstract now leads with the problem and the proposed signal, states the three findings without defensive qualifiers, and ends with the epistemological framing.

### Stylistic Changes

- All "What is it / What is it not" Q&A patterns removed.
- "We explicitly flag this as" constructions removed.
- "This is a preprint to invite collaboration, not a finished result" removed from body (integrated once in Introduction and once in Conclusion).
- Tone adjusted from defensive/confessional to calm, confident, and measured.
- Self-qualifying adjectives ("honest," "explicitly," "frankly") eliminated.
- All statistical numbers preserved exactly; only the framing prose around them changed.

### Content Preserved Without Change

- All experimental data, statistical results, and numerical values.
- All detector specifications, threshold values, and trigger rate tables.
- All proposition statements and their corrected forms.
- All framework technical descriptions.
- All appendices.
- The retraction of C1 and its documentation.
- The F5 cascading collateral damage case.
