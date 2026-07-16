# SwarmAlpha: An Embeddable Governance Runtime for Multi-Agent Systems

**He Mengyuan** | High School Student, Grade 10 | Independent Researcher

---

## Problem

LLM multi-agent systems (AutoGen, CrewAI, LangGraph) are being deployed in high-stakes domains — finance, healthcare, law. When five AI agents discuss a decision, they commit the **same systematic failures as human groups**: premature consensus (agreement before critical information surfaces), authority bias (one overconfident agent dominates), echo chambers (similar-minded agents confirm each other), and group polarization (divergence hardens into deadlock).

**Independent academic evidence confirms this is real.** Li et al. (SJTU, 2026) demonstrated that multi-agent workflows act as echo chambers, amplifying minor stochastic biases into systemic polarization — and that standard bias detection methods (questionnaires, binary benchmarks) systematically miss these conversational biases [*Aligned Agents, Biased Swarm*, arXiv:2604.08963](https://arxiv.org/abs/2604.08963). Coppolillo et al. (2025) observed significant stance shifts in LLM echo chambers that went undetected by state-of-the-art bias detection [*Unmasking Conversational Bias in AI Multiagent Systems*, arXiv:2501.14844](https://arxiv.org/abs/2501.14844). Yang (2026) showed that emergent consensus in LLM agent societies may be a model artifact rather than genuine agreement, requiring careful diagnostic separation [*When Is Emergent Consensus Real?*, arXiv:2606.22203](https://arxiv.org/abs/2606.22203).

**No existing framework detects or intervenes on these failures.** The agent governance tools that emerged in 2026 — Microsoft Agent Governance Toolkit, Agent Control Standard (ACS), NVIDIA OpenShell, ValidMind Atryum — all target the **security layer**: preventing unauthorized tool calls, budget overruns, data leaks. They do not address **cognitive governance**: detecting when agent discussions form echo chambers, defer to authority, polarize, or converge prematurely. SwarmAlpha fills this gap as the first open-source cognitive governance runtime.

---

## Approach

SwarmAlpha is an **embeddable governance runtime** — a drop-in layer that plugs into any multi-agent framework to observe, detect, and intervene on collective decision failures.

**Core architecture**: LLMs only perform perception (extracting beliefs and emotions from natural language). All governance logic — consensus computation, bias detection, belief dynamics — uses pure mathematics (Kuramoto synchronization, Gini coefficient, bimodality coefficient, Cronbach's α). This means the runtime operates as a **lightweight plugin** with zero additional LLM calls. Unlike security-focused governance tools (Microsoft Agent Governance Toolkit, ACS) that use deterministic policy engines (OPA Rego, Cedar), SwarmAlpha uses a hybrid architecture: LLM for perception, mathematics for reasoning — the first such architecture for cognitive agent governance.

**Standards compatibility**: `StateInferenceBridge` interoperates with [ACS](https://agentcontrolstandard.ai) middleware hooks. Cognitive governance (SwarmAlpha) and security governance (ACS-compliant tools) are complementary layers.

**Experimental design**: 7 ablation modes (none/full/shuffle + 4 single-intervention), 5-dimension evaluation (Consensus/Reliability/Dispersion/Stability/Influence), t-distribution 95% CI + permutation test p-values. Full architectural details in [README.md](README.md).

---

## Results

**161 experiments across 2 tasks** (Crisis 72 + Supplier 89), with governance loop closed (post D1–D4 fix). Additionally, 165 historical experiments (broken loop) retained as controls.

### Primary Evidence (Loop Closed, Expanded)

| Mode | Crisis τ (n=24) | Supplier τ (n=30) | Crisis d/p | Supplier d/p |
|------|----------|------------|------------|--------------|
| none | 0.408 ± 0.182 | 0.680 ± 0.186 | — | — |
| full | 0.617 ± 0.263 | 0.767 ± 0.183 | **0.92 / 0.005** | 0.47 / 0.089 |
| shuffle | 0.717 ± 0.243 | 0.697 ± 0.204 | **1.44 / <0.001** | 0.09 / 0.78 |
| Power | 88% ✅ | 43% ⚠️ | | |

**Four cross-task findings** (detailed data in [README.md](README.md#core-finding)):
1. **Governance statistically confirmed effective** — Crisis d=0.92, p=0.005, power=88%
2. **"False consensus" replicates** — consensus-quality r ≈ 0 in both tasks (agreement ≠ correctness)
3. **Shuffle has boundary conditions** — effective on hard tasks (Crisis), null on easy tasks (Supplier, ceiling effect)
4. **Mechanism ablation direction-consistent** — reduce_weight (d=1.51) and force_reflection (d=0.73) drive the effect

### Historical Controls (Broken Loop — 165 experiments)

> ⚠️ These 165 experiments were run while the governance loop was severed (D1–D4 unfixed). Retained only as historical controls.

- 2×2 factorial design (3-round vs 5-round × none vs full): 3-round Invest d=+0.65 (not sig); 5-round Invest d=+0.00 (null)
- Only significant governance effect was **harmful**: full_reflection on 5-round Invest (p=0.048)
- Shuffle on M&A: d=+1.80, p=0.0009 (the only significant positive result under broken loop)

### Methodological Contribution: Cognitive Defect Diagnosis

The 2×2 factorial design isolates round-count moderation that between-group comparisons missed. The shuffle control — designed to rule out regression-to-mean — became the strongest positive finding. The honest null-to-harmful result on governance (under broken loop) is itself a contribution: it clarifies boundary conditions.

A second methodological contribution is the **diagnosis of 4 root cognitive defects** in the multi-agent discussion paradigm, answering *why governance appeared ineffective*: agents could not perceive their own state (D1), remember prior exchanges (D2), respond to each other (D3), or truly influence one another (D4). Fixing all 4 defects **closes the governance loop**. The diagnosis report (`docs/archive/PROJECT_DEEP_ANALYSIS.md`) provides a complete hard-defect inventory (7 hard fixes: H4 Kuramoto mapping, H6 convergenceSpeed, H2 ablationModes, H19 seeded PRNG, H17 cache pollution, H18 interventionPrompt unification). Articulating *why governance was ineffective* as a falsifiable architectural diagnosis — rather than a hand-wavy excuse — is itself a research contribution.

---

## Technical Summary

| | |
|---|---|
| **Code** | ~13,000 lines TypeScript, 229 automated tests |
| **Architecture** | Strategy pattern + Adapter pattern + Dependency Injection + Event Bus |
| **Math** | Full formal framework: 13 sections, complete LaTeX |
| **Models** | DeepSeek-V3 (primary), OpenAI, Anthropic, Local (Ollama) |
| **Integrations** | Framework-agnostic adapter layer; Custom (full), AutoGen (TypeScript bridge, Python sidecar needed), CrewAI/LangGraph (planned) |
| **Stack** | Next.js 14, TypeScript 5.5, Vitest, Tailwind CSS |
| **Free-Energy Ranking** | Social thermodynamics F=(1-R)+T·H decomposition drives intervention priority (91.7% of Crisis runs have multiple detectors triggering). Backtest falsified original force_reflection↔structural mapping (p=0.041), corrected to thermal·(1-structural) |

---

## Honest Limitations

- **Parameter calibration**: 16 belief-update constants are hand-tuned, not empirically calibrated. Parameter sensitivity infrastructure exists (`experiments/v2/sensitivity.ts`) but has not been systematically run.
- **Adaptive modules**: Adaptive thresholds and adaptive dosage are implemented, unit-tested, and integrated into GovernanceRuntime (config-gated, default off). The 165 prior experiments used fixed parameters; adaptive modules are not yet experimentally validated.
- **Topology**: Only `FlatTopology` (5 agents) is experimentally validated. `GroupedTopology` and `CommitteeTopology` are implemented but untested.
- **Evaluation weights**: The 5-dimension weights (0.20/0.25/0.20/0.17/0.18) are heuristic, not data-driven. Equal-weight robustness check is planned.
- **Single-model validation**: All experiments use DeepSeek-V3 only. Cross-model generalization is untested.
- **Sensitivity vs. causality**: The dropout analysis module (`sensitivityTrace.ts`) is explicitly a sensitivity diagnostic, not a causal identification method. SUTVA violations are documented in code comments.

---

## Future Work

- **Supplier expansion to n=72**: Supplier is currently at n=30/cell (power=43%). Expanding to n=72/cell would achieve 80% power and potentially confirm p<0.05. This is the highest-priority next experiment.
- **Full 7-mode ablation experiment (105 runs)**: `ablationModes` has been expanded from 2 implemented modes to 7 (none, full, shuffle, full_diversity, full_weight, full_reflection, full_continue). The complete 105-run factorial experiment (7 modes × 2 tasks × multiple round-counts × n≥5) is pending lab execution. The 2026-07-14 Crisis re-validation (72 runs, none/full/shuffle × 24) is a first step toward this — single-intervention modes remain pending under the closed loop.
- **Cross-model validation**: All 326 experiments (165 historical + 161 expanded) used DeepSeek-V3 only. Re-running the core 2×2 factorial design on GPT-4o / Claude / local models (n=5 minimum) to test generalization. The loop-fix makes this especially important — the 4 cognitive defects may have masked model-dependent governance effects.
- **Remaining aspirational intervention types**: The codebase currently implements 4 intervention types (`reduce_weight`, `force_reflection`, `introduce_diversity`, `continue_discussion`) plus `none` (observation mode) in a closed `InterventionType` union. Three additional types (`break_connections`, `introduce_dissent`, `pair_opposites`) were designed but never implemented — they exist only as aspirational notes. Implementing and ablating these would complete the intervention design space and test whether *structural* interventions (breaking connections, pairing opposites) outperform *content* interventions (reflection, reweighting). Note: `introduce_diversity` and `continue_discussion` are now disabled by default based on the Crisis cost-benefit analysis (9.1% and 0% effective respectively).

---

## Long-Term Vision

As multi-agent systems scale from 5-agent discussion rooms to 500-agent organizational ecosystems, the core challenge shifts from task completion to **emergent outcome trustworthiness**. Echo chambers become information cartels. Authority bias becomes power monopolization. SwarmAlpha's observe → model → detect → intervene → evaluate loop is agent-count-agnostic and framework-agnostic — the minimal viable kernel of a future **governance operating system for AI agent societies**.

> *"Not a framework for building agents. An operating system for governing them."*

---

## About the Author

Independent project by a 10th-grade student. Architecture design, experiment design, mathematical framework, and research direction are fully autonomous. All code generated via AI-assisted development (Claude Code). Completed in 15 days.

**GitHub**: [github.com/mulasakee17/swarmalpha](https://github.com/mulasakee17/swarmalpha)
