# SwarmAlpha: An Embeddable Governance Runtime for Multi-Agent Systems

**He Mengyuan** | High School Student, Grade 10 | Independent Researcher

---

## Problem

LLM multi-agent systems (AutoGen, CrewAI, LangGraph) are being deployed in high-stakes domains — finance, healthcare, law. When five AI agents discuss a decision, they commit the **same systematic failures as human groups**: premature consensus (agreement before critical information surfaces), authority bias (one overconfident agent dominates), echo chambers (similar-minded agents confirm each other), and group polarization (divergence hardens into deadlock).

**No existing framework detects or intervenes on these failures.** Current research focuses on making agent debates more accurate — not on whether the debate process itself is healthy.

---

## Approach

SwarmAlpha is an **embeddable governance runtime** — a drop-in layer that plugs into any multi-agent framework to observe, detect, and intervene on collective decision failures.

**Core architecture**: LLMs only perform perception (extracting beliefs and emotions from natural language). All governance logic — consensus computation, bias detection, belief dynamics — uses pure mathematics (Kuramoto synchronization, Gini coefficient, bimodality coefficient, Cronbach's α). This means the runtime operates as a **lightweight plugin** with zero additional LLM calls.

**Seven ablation modes**: none (baseline), full, shuffle (placebo test / identification strategy — scrambles agent knowledge to rule out regression-to-mean), and four single-intervention modes isolating individual governance mechanisms. t-distribution 95% CI + permutation test p-values on all key comparisons.

**Five-dimension evaluation**: Consensus, Reliability, Dispersion, Stability, and Influence Analysis — all with statistical grounding (Cronbach's α, Cohen's d, t-distribution confidence intervals, parameter sensitivity analysis).

---

## Results

165 controlled experiments across 2 tasks (M&A: 5 rounds, n=15 for none/full, n=10 for others; Invest: 5-round n=15 for none/full & n=5 for others, 3-round n=15 with none & full only — a 2×2 factorial design on round count × governance), with Kendall's τ, within-group τ trajectory (Δτ), shuffle control, and single-intervention ablation. Statistical inference via t-distribution 95% CI + permutation test p-values.

### Primary Findings

- **2×2 factorial design reveals round moderation**: The 2×2 design (3-round vs 5-round × none vs full, n=15 per cell) is the key methodological contribution. On 3-round Invest, full governance shows a medium effect (d=+0.65, p=0.152, Net Δτ=+0.133, 95% CI [−0.09, +0.35]) — suggestive but not significant. On 5-round Invest, full governance shows zero effect (τ=0.778 vs 0.778, d=+0.00, p=1.0 — identical to baseline). The pattern: governance has directional benefit in limited rounds but zero effect with sufficient rounds. No positive governance effect reaches significance across all 165 experiments.

- **The only significant governance effect is HARMFUL**: On 5-round Invest, full_reflection (n=5) produces τ=0.333, ΔQ=−22.2, p=0.048 — significantly harmful, the first and only statistically significant governance effect. full_weight (τ=0.467, ΔQ=−15.6, p=0.173) shows a harmful trend. This honest negative finding clarifies the boundary conditions under which governance adds value: not all interventions help, and some actively harm.

- **Shuffle control is the strongest positive finding**: On M&A, shuffle (scrambled agent knowledge) produces τ=0.900±0.194, d=+1.80, p=0.0009 — the only statistically significant *positive* result across all 165 experiments. Agents already know all 5 companies; unfamiliar data breaks their professional overconfidence, forcing them to listen to each other. On weakly-interdependent tasks, breaking overconfidence outperforms targeted governance intervention. Single-intervention ablations on M&A (full_diversity p=0.174, full_weight p=0.171, full_reflection p=0.183, full_continue p=0.267) none reach significance — no single governance mechanism drives the effect.

### Methodological Contribution

The 2×2 factorial design (3-round vs 5-round × none vs full, n=15 per cell) is the key methodological contribution — it isolates the round-count moderation effect that between-group comparisons alone missed. Standard Cohen's d showed 3-round Invest with a medium effect (d=+0.65, p=0.152) while 5-round Invest showed zero effect (d=+0.00, p=1.0), confirming that governance's marginal value diminishes with sufficient discussion rounds. The shuffle control — designed to rule out regression-to-mean — instead became the strongest positive finding (M&A p=0.0009). Critically, the only statistically significant governance effect was HARMFUL: full_reflection on 5-round Invest (p=0.048). This combination — 2×2 factorial design + Δτ + shuffle + single-intervention ablation + permutation test — provides a template for rigorous evaluation even when the primary hypothesis is not supported. The honest null-to-harmful result on governance is itself a contribution: it clarifies the boundary conditions under which governance adds value.

---

## Technical Summary

| | |
|---|---|
| **Code** | ~13,000 lines TypeScript, 149 automated tests |
| **Architecture** | Strategy pattern + Adapter pattern + Dependency Injection + Event Bus |
| **Math** | Full formal framework: 13 sections, complete LaTeX |
| **Models** | DeepSeek-V3 (primary), OpenAI, Anthropic, Local (Ollama) |
| **Integrations** | Framework-agnostic adapter layer; Custom (full), AutoGen (TypeScript bridge, Python sidecar needed), CrewAI/LangGraph (planned) |
| **Stack** | Next.js 14, TypeScript 5.5, Vitest, Tailwind CSS |

---

## Honest Limitations

- **Parameter calibration**: 16 belief-update constants are hand-tuned, not empirically calibrated. Parameter sensitivity infrastructure exists (`experiments/v2/sensitivity.ts`) but has not been systematically run.
- **Adaptive modules**: Adaptive thresholds and adaptive dosage are implemented, unit-tested, and integrated into GovernanceRuntime (config-gated, default off). The 165 prior experiments used fixed parameters; adaptive modules are not yet experimentally validated.
- **Topology**: Only `FlatTopology` (5 agents) is experimentally validated. `GroupedTopology` and `CommitteeTopology` are implemented but untested.
- **Evaluation weights**: The 5-dimension weights (0.20/0.25/0.20/0.17/0.18) are heuristic, not data-driven. Equal-weight robustness check is planned.
- **Single-model validation**: All experiments use DeepSeek-V3 only. Cross-model generalization is untested.
- **Sensitivity vs. causality**: The dropout analysis module (`sensitivityTrace.ts`) is explicitly a sensitivity diagnostic, not a causal identification method. SUTVA violations are documented in code comments.

---

## Long-Term Vision

As multi-agent systems scale from 5-agent discussion rooms to 500-agent organizational ecosystems, the core challenge shifts from task completion to **emergent outcome trustworthiness**. Echo chambers become information cartels. Authority bias becomes power monopolization. SwarmAlpha's observe → model → detect → intervene → evaluate loop is agent-count-agnostic and framework-agnostic — the minimal viable kernel of a future **governance operating system for AI agent societies**.

> *"Not a framework for building agents. An operating system for governing them."*

---

## About the Author

Independent project by a 10th-grade student. Architecture design, experiment design, mathematical framework, and research direction are fully autonomous. All code generated via AI-assisted development (Claude Code). Completed in 15 days.

**GitHub**: [github.com/mulasakee17/swarmalpha](https://github.com/mulasakee17/swarmalpha)
