# Social Thermodynamics and Cognitive-State Consistency Diagnosis for LLM Multi-Agent Governance

**He Mengyuan** (Independent Researcher, Songshan Lake Future School)

> **Target venues**: arXiv preprint → AAMAS 2027 / AAAI 2027 / ICML 2027 Workshop on Multi-Agent Systems
> **Status**: Pre-submission draft. The v6 cognitive governance framework is implemented and unit-tested; historical method validation (169 closed-loop runs) is complete; the current v6 experiment (E9, 200 runs) is at Pilot stage. This paper's narrative is organized around the v6 mainline, with historical evidence explicitly labeled as method validation rather than current-system evidence.
>
> **v6 note (2026-08-01)**: Pilot A/B re-run on 2026-08-01 (B group: 5 rounds, 16 interventions, δ-diagnosis firing polarization/1D-mask, τ=0.643). Original Pilot records (0.786/+0.215, 14 interventions) were from the 2026-07-30 code version and are not reproducible on current code. Pilot is single-run (seed 42) and is not treated as statistical evidence.
> **Code**: [github.com/mulasakee17/swarmalpha](https://github.com/mulasakee17/swarmalpha)

---

## Abstract

LLM multi-agent systems lack a principled, runtime-detectable signal for identifying when group deliberation drifts toward collective cognitive failure. We propose the **v6 cognitive governance framework**, whose core design is: **(i)** agents directly output a five-dimensional cognitive state (Utility, Evidence, Inertia, Confidence, Susceptibility), eliminating the circular reasoning of post-hoc cognitive inference; **(ii)** detection uses **consistency diagnosis** (δ-signals that compare self-reported vs. observed behavior, requiring no ground truth); **(iii)** intervention is **non-destructive**—changing information flow rather than belief weights; **(iv)** a **social-thermodynamic measurement layer** (decoupled $F = U - T\cdot S$) provides collective-state signals. Cost is layered: deterministic mathematics handles the large majority of rounds (design target ~95%, zero additional LLM calls; actual trigger rate pending E9), with an LLM semantic sensor (SemanticTool) invoked only on anomalous rounds.

Historical method validation (169 closed-loop runs, Crisis 80 + Supplier 89) establishes: consensus level and decision quality are nearly uncorrelated ($r \approx -0.10$, $p=0.20$, not significant—an exploratory observation that **questions** the "convergence implies correctness" assumption, not a refutation); breaking role-information coherence ($d=1.44$) outperforms in-discussion governance ($d=0.92$); destructive interventions are harmful ($\Delta\tau=-0.267$), motivating the non-destructive design. The current v6 Pilot (single run, seed 42) verifies the δ→intervention chain (B group: 5 rounds, 16 non-destructive interventions, τ=0.643 vs A group 0.571), with the full E9 experiment (4 groups × 50 runs = 200 runs) pending. The framework provides an engineering foundation for multi-agent cognitive governance that is reproducible, cost-layered, and honest about its evidence boundaries.

---

## 1. Introduction

### 1.1 The Cognitive Governance Gap

LLM multi-agent frameworks (AutoGen, CrewAI, LangGraph) increasingly coordinate teams of agents for complex decisions, inheriting collective failure modes familiar from social psychology: echo chambers, authority bias, group polarization, premature consensus. The MAST taxonomy (Cemri et al., 2025) catalogued 14 failure modes across 1,600 traces but explicitly deferred detection and intervention to future work. Production governance tools (Microsoft Agent Governance Toolkit, NVIDIA OpenShell, OWASP Agentic Top 10) address the security layer (unauthorized tool calls, budget overruns, prompt injection) but not the cognitive layer—detecting *during* discussion that the group is drifting toward biased consensus. The cognitive layer remains unaddressed by both academic taxonomies and production tooling.

### 1.2 Our Design Decisions

This work responds with three design decisions that distinguish it from prior work:

1. **State representation**: agents output a five-dimensional cognitive state rather than a single scalar belief—eliminating the circular reasoning of post-hoc inference from behavior.
2. **Detection**: consistency diagnosis (δ-signals comparing observable-signal contradictions) replaces heuristic threshold judgment—requiring no ground truth.
3. **Intervention principle**: change information flow, not belief weights—avoiding the cascading backfire of destructive interventions (historically observed, §4.1).

### 1.3 Why "Measure First, Govern Later"

Historical data (§5, F1) provide evidence **questioning** the "convergence implies correctness" assumption: consensus and decision quality are nearly uncorrelated ($r\approx-0.10$, $p=0.20$, not significant—exploratory). A governance system optimizing only for convergence may be optimizing the wrong objective. Therefore: **without a reliable measurement signal, intervention is blind.** This motivates the measurement-first philosophy.

---

## 2. Related Work

### 2.1 Statistical Physics of Opinion Dynamics

The Kuramoto model was adapted to opinion dynamics by Pluchino et al. (2004), with explosive transitions between bipolarization and consensus studied by Pradhan and Ujjwal (2025). Thermodynamic concepts have been applied socially by Tsekov ("Social Thermodynamics 2.0"), López-Corona et al. (Helmholtz free energy for cooperation), Tomé et al. (stochastic thermodynamics of opinion formation), and Galam (zero-temperature Ising for echo chambers). These works treat phase variables as descriptive quantities; our contribution is engineering them into a deployable runtime with a decoupled, cognitive-state-based measurement layer (§3.6).

### 2.2 Multi-Agent Bias Detection and Failure Taxonomy

MAST is descriptive; detection and intervention are deferred. CoBRA (Liu et al.) found natural-language descriptions cannot consistently control bias across models—motivating our mathematical, interpretable detection metrics. Nudo et al. documented "generative exaggeration" (LLM agents amplify polarization). Regarding consensus-quality, Du et al. introduced multi-agent debate assuming convergence→correctness; our observation ($r\approx-0.10$, exploratory) questions this assumption's universality, consistent with Free-MAD (Cui et al.) and the PID framework (Riedl). Jin et al. quantified authority bias (37.1% of variance); Liang et al. identified Degeneration-of-Thought.

### 2.3 Cognitive State and Speaker Selection

AutoGen's SelectorGroupChat uses a centralized LLM selector (one extra LLM call per turn); LangChain uses decentralized bidding. Our historical path proposed a five-factor speech-willingness formula (fully decentralized, closed-form, zero extra LLM cost), but in the v6 mainline, speech selection is **not** the focus—v6 uses synchronous fixed rounds, focusing on governance rather than turn-taking. v6 differs from the TBS framework (Yang et al.) in that agents directly output cognitive state rather than an orchestrator coordinating intentions.

---

## 3. System Design: v6 Cognitive Governance Framework

### 3.1 Overall Architecture

SwarmAlpha v6 implements a five-stage loop: **observe → model → detect → intervene → evaluate**. The core flow:

```
LLM (perception) → 5D cognitive state → δ consistency diagnosis → non-destructive intervention → thermo measurement
     ↑                                                                                                  ↓
     └──────────────────────────── LLM semantic sensor (SemanticTool, optional) ←─────────────────────────┘
```

- **Determinism first**: design target ~95% of rounds handled by deterministic mathematics (zero extra LLM calls; actual trigger rate pending E9).
- **LLM fallback**: SemanticTool invoked only on δ-flagged anomalous rounds (LLM as semantic sensor, not decision-maker).

### 3.2 Five-Dimensional Cognitive State

Agents directly output three dimensions; the system computes the rest:

| Dim | Symbol | Source | Meaning |
|-----|--------|--------|---------|
| Utility | $U$ | LLM native | preference vector over options |
| Evidence | $E$ | LLM native (coverage/quality) + system (diversity) | information state |
| Confidence | $C$ | LLM native (self-reported) | stated confidence (0-100) |
| Inertia | $I$ | system | resistance to change (role + refutation + decay) |
| Susceptibility | $\Lambda$ | system | $(1-I)(1-C)$, response probability |

*Honesty note*: the system computes inertia, susceptibility, **and** evidence diversity (derived from evidence categories, `cognitiveState.ts:524`)—system post-processing is reduced but not fully eliminated. Confidence `overall` is directly the LLM self-report (`confidence/100`, `cognitiveState.ts:338`).

### 3.3 δ Consistency Diagnosis (No Ground Truth)

Traditional detectors require defining "what is anomalous" (ground truth). δ-diagnosis compares contradictions between observable signals:

| δ-signal | Detects |
|----------|---------|
| $\delta_{polarization}$ | severe utility-vector divergence |
| $\delta_{1D\_mask}$ | scalar consensus masking vector divergence |
| $\delta_{evidence\_silence}$ | evidence systematically ignored |
| $\delta_{confidence\_gap}$ | self-reported high confidence but utility deviates from group |
| $\delta_{stance\_flip}$ | stance reversal |
| $\delta_{no\_response}$ | no response after intervention |
| $\delta_{concentration}$ | inertia over-concentrated |
| $\delta_{consistency}$ | stance change contradicts inertia |

Adaptive threshold: `effective = base + (1−minConfidence) × safetyMargin` (`computeDelta.ts:118`)—lower confidence → more conservative threshold. Pilot verification: B group's first round fired $\delta_{polarization}$ (pairwise cosine 0.643 ≥ 0.15) and $\delta_{1D\_mask}$ (scalar R=0.68 but vector divergence 0.643), confirming the chain.

### 3.4 Non-Destructive Intervention

Motivated by the historical harm of destructive interventions ($\Delta\tau=-0.267$, §4.1), v6 changes **information flow** rather than belief weights:

- **inject_evidence**: inject ignored private evidence (suppresses no one)
- **rebalance_attention**: reorder speaking so marginalized agents speak first
- **shuffle_knowledge**: structural knowledge rearrangement (historically strongest, $d=1.44$)

*Evidence status*: ⚠️ design direction supported by historical failure; v2.1 interventions lack statistical validation (smoke test $N=6$, $\Delta\tau=0.000$; earlier $+0.533$ retracted).

### 3.5 SemanticTool (LLM Semantic Sensor)

LLM as a semantic sensor in the mathematical engine's hands (not a decision-maker): evidence semantic dedup, information-gap analysis, intervention-text generation. Layered cost: δ handles ~95% of rounds (zero cost); SemanticTool fires only on anomalous rounds (pay-as-you-go). *Evidence status*: 🔧 implemented; C-group link pending E9.

### 3.6 Social-Thermodynamic Measurement

**Historical definition**: $F=(1-R)+T\cdot H$ (R: Kuramoto order, T: std, H: Shannon entropy).

**⚠️ Empirical falsification (2026-07-28)**: the two components of historical $F$ are strongly correlated ($r=0.9175$), and $R/T/H$ collapse to one effective dimension (regression $F\approx0.019+2.014(1-R)$, $R^2=0.955$).

**v6 correction**: based on the 5D cognitive-state vector, use $F = U - T\cdot S$ (U: utility L1 norm, T: temporal fluctuation, S: distribution entropy). $U$ and the product $T\cdot S$ decouple ($|r|=0.274$, [THEORY.md §0.1]), a major improvement over $r=0.917$; **however, $U$ and $S$ components remain correlated ($r=-0.79$)—the decoupling is partial, not full independence**. Reframing: the historical collapse itself is a finding—MAS small groups differ from physical systems in that DeGroot belief updating couples alignment and convergence.

### 3.7 Historical Path (Comparison Baseline)

Two earlier contributions are downgraded to historical/comparison baselines in the v6 mainline:
- **Seven bias detectors** (4 classical + 3 MAST-aligned): superseded by δ-diagnosis; the 3 MAST detectors have zero empirical triggers (implementation + unit-test level contribution).
- **Five-factor speech-willingness formula**: historical contribution of the async path (`asyncEngine.ts`, frozen); the v6 sync path does not use it.

---

## 4. Experiments and Evidence

> ⚠️ Two sets of evidence from different eras: **§4.1 is historical method validation (old path); §4.2 is the current v6 experiment (Pilot; full run pending)**. Historical evidence is not presented as v6 evidence.

### 4.1 Historical Method Validation (169 Closed-Loop Runs, Old Path)

**Setup**: Crisis (hard, baseline τ=0.41) + Supplier (moderate, baseline τ=0.68), 5-agent ranking tasks, conditions none/full/shuffle, model DeepSeek-V3 (single model), n=24–30/group, 169 closed-loop = Crisis 80 + Supplier 89.

**Key results**:

| Result | Value | Evidence strength |
|--------|-------|-------------------|
| Governance effective on hard task | Crisis full d=0.92, p=0.0038, 88% power | ✅ audit-verified |
| Structural > procedural | shuffle d=1.44 vs governance d=0.92 | ✅ number verified; post-hoc, not pre-registered |
| Consensus-quality weak | r≈−0.10, p=0.20, not significant | ✅ honestly exploratory |
| Intervention backfire | r=−0.55 (intervention count-quality) | ⚠️ anecdotal (N=10, failure n=2) |
| Destructive interventions harmful | Δτ=−0.267 | ✅ motivates v6 non-destructive design |

**Significance for v6**: these experiments provide (i) the "consensus≠correctness" methodological basis (§5 F1), (ii) the motivation for non-destructive intervention (destructive harm), (iii) evidence that structural rearrangement (shuffle) is the strongest lever.

### 4.2 Current v6 Experiment (E9, Pilot + Plan)

**Design**: four groups A (none) / B (δ governance) / C (δ+SemanticTool) / D (old detectors), university task, planned 200 runs (4 × 50).

**Pilot A/B (single run, seed 42, re-run 2026-08-01)**:

| Group | τ | Rounds | Interventions |
|-------|-----|--------|---------------|
| A (none) | 0.571 | 5 | 0 |
| B (δ) | 0.643 | 5 | 16 |

Δτ=+0.071, **single-run, no statistical significance**—verifies only the chain: δ-diagnosis fires on round 1 (polarization/1D-mask), 16 non-destructive interventions generated. **C/D groups pending**, full 200 runs pending.

**Statistics** (`e9_v6_comparison.ts`): B−A is the sole confirmatory (primary) comparison; others exploratory; significance = Bootstrap CI same-sign; B vs D uses non-inferiority (margin=0.1).

---

## 5. Findings

**F1 (methodological basis): consensus ≠ correctness—but the evidence is exploratory.**
$r\approx-0.10$ ($p=0.20$, not significant) **questions** (does not refute) the universality of the "convergence implies correctness" assumption. If consensus is unrelated to correctness, a governance system optimizing only consensus may be optimizing the wrong objective.

**F2 (historical): structural rearrangement > procedural governance.**
shuffle ($d=1.44$) outperforms in-discussion governance ($d=0.92$); post-hoc, not pre-registered, single model.

**F3 (historical): destructive interventions are harmful; backfire risk.**
$\Delta\tau=-0.267$; intervention count negatively correlated with quality ($r=-0.55$, anecdotal)—motivating the v6 non-destructive design.

**F4 (current, exploratory): δ-governance chain is functional.**
Pilot B group: 16 interventions, δ-diagnosis firing normally, Δτ=+0.071 (single-run, not statistical evidence).

---

## 6. Limitations and Future Work

**Current limitations**:
1. **Single model**: historical 169 closed-loop runs all DeepSeek-V3; cross-model pilot confounded by code version (F16 downgraded).
2. **Few tasks**: 2 historical + 1 v6 task; top venues expect 5+.
3. **Evidence layering**: historical evidence (169 runs) ≠ v6 evidence (only Pilot).
4. **Detectors**: 3 MAST detectors zero empirical triggers; echo chamber detector judged ineffective (separation=0).
5. **F-decomposition ranking falsified** ($d_z=-0.354$), retained as design principle only.
6. **Intervention judgment**: historical "effectiveness rates" based on uncontrolled belief-move (E10), not causal evidence.
7. **Theory**: 4 of 8 propositions proven, 4 conjectures (AI-assisted proofs pending human verification).

**Future work**: E9 full run (200 runs, validating the four groups) → same-code-version cross-model replication → third task → detector empirical calibration → theoretical formalization.

---

## 7. Conclusion

We propose the v6 cognitive governance framework—five-dimensional cognitive state representation, δ consistency diagnosis, non-destructive intervention, and a decoupled social-thermodynamic measurement layer—with layered LLM usage (design target ~95% of rounds at zero extra cost). Historical method validation (169 closed-loop runs) establishes "consensus≠correctness" and the non-destructive intervention direction; the current Pilot verifies the δ→intervention chain; the full E9 experiment is pending. Framework, code, and data are open-source; we welcome collaboration and critical replication.

---

## References

1. Cemri, M., et al. Why Do Multi-Agent LLM Systems Fail? arXiv:2503.13657, 2025.
2. OWASP. Top 10 for Agentic Applications for 2026. 2025.
3. Pluchino, A., et al. Changing Opinions in a Changing World. IJMPC, 2004.
4. Pradhan, S., Ujjwal, S. R. Diversity mitigates polarization and consensus. arXiv:2509.19860, 2025.
5. Tsekov, R. Social Thermodynamics 2.0. arXiv:2307.05984, 2023.
6. López-Corona, O., et al. Measuring social complexity and the emergence of cooperation. arXiv:1502.05741, 2015.
7. Tomé, T., et al. Stochastic thermodynamics of opinion dynamics. arXiv:2212.07268, 2022.
8. Galam, S. Echo Chambers and Random Polarization. arXiv:2410.02582, 2024.
9. Liu, X., et al. CoBRA: Programming Cognitive Bias in Social Agents. CHI 2026.
10. Nudo, J., et al. Generative Exaggeration in LLM Social Agents. arXiv:2507.00657, 2025.
11. Du, Y., et al. Improving Factuality through Multiagent Debate. ICML 2024.
12. Cui, Y., et al. Free-MAD: Consensus-Free Multi-Agent Debate. arXiv:2509.11035, 2025.
13. Riedl, C. Emergent Coordination in Multi-Agent Language Models. ICLR 2026.
14. Jin, Y., et al. AgentReview: Exploring Peer Review Dynamics with LLM Agents. EMNLP 2024.
15. Liang, T., et al. Encouraging Divergent Thinking through Multi-Agent Debate. EMNLP 2024.
16. Wu, Q., et al. AutoGen: Enabling Next-Gen LLM Applications. arXiv:2308.08155, 2023.
17. Yang, K., et al. Think-Before-Speak. KDD'26 Workshop, 2026.
