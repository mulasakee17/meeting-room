# SwarmAlpha: An Embeddable Governance Runtime for Multi-Agent Systems

**He Mengyuan** | High School Student, Grade 10 | Independent Researcher

---

## Problem

LLM multi-agent systems (AutoGen, CrewAI, LangGraph) are being deployed in high-stakes domains — finance, healthcare, law. When five AI agents discuss a decision, they commit the **same systematic failures as human groups**: premature consensus (agreement before critical information surfaces), authority bias (one overconfident agent dominates), echo chambers (similar-minded agents confirm each other), and group polarization (divergence hardens into deadlock).

**No existing framework detects or intervenes on these failures.** Current research focuses on making agent debates more accurate — not on whether the debate process itself is healthy.

---

## Approach

SwarmAlpha is an **embeddable governance runtime** — a drop-in layer that plugs into any multi-agent framework to observe, detect, and intervene on collective decision failures.

**Core architecture**: LLMs only perform perception (extracting beliefs and emotions from natural language). All governance logic — consensus computation, bias detection, belief dynamics — uses pure mathematics (Kuramoto synchronization, Bayesian inference, information entropy, Gini coefficient). This means the runtime operates as a **lightweight plugin** with zero additional LLM calls.

**Seven ablation modes**: none (baseline), full, shuffle (regression-to-mean control), and four single-intervention modes isolating individual governance mechanisms. Bootstrap 95% CI + p-values on all key comparisons.

**Five-dimension evaluation**: Consensus, Reliability, Dispersion, Stability, and Influence Analysis — all with statistical grounding (Cronbach's α, Cohen's d, bootstrap confidence intervals, parameter sensitivity analysis).

---

## Results

140 controlled experiments across 2 tasks × 7 ablation modes × n=10-15, with Kendall's τ, within-group τ trajectory (Δτ), shuffle control, and single-intervention ablation. Statistical inference via bootstrap 95% CI (10k resamples).

### Primary Findings

- **Governance has a boundary condition**: On interdependent tasks (Invest), governance lifts τ from 0.022→0.556 (Δτ=+0.84, 95% CI [+0.27, +1.38]). On weakly-interdependent tasks (M&A), Δτ=−0.12 (95% CI [−0.25, −0.02]), Full vs None ΔQ=+4.0, p=0.280 — not significant.

- **Shuffle control excludes regression-to-mean**: With scrambled agent knowledge, Invest τ drops to 0.000 despite full governance. Governance improvement requires coherent information integration, not just "discussing more." On M&A, shuffle τ=0.900 actually *exceeds* full governance τ=0.613 — agents already know all 5 companies; unfamiliar data (from shuffle) breaks their professional overconfidence, forcing them to listen more to each other. On weakly-interdependent tasks, reducing overconfidence outperforms targeted governance intervention.

- **Single-intervention ablation identifies the key mechanism**: On Invest, only `full_diversity` (echo chamber → diversity injection) is statistically significant (τ=0.667, ΔQ=+32.2, p=0.003), slightly exceeding full governance. `full_weight` (authority bias → weight reduction) is actively harmful (τ=−0.267) — cutting a dominant agent's influence on interdependent tasks destroys unique information. `full_reflection` (τ=0.333) and `full_continue` (τ=0.200) are directionally positive but not significant alone. The mechanism is precise: surface hidden information via diversity injection, not more rounds or forced reflection.

### Methodological Contribution

Standard between-group effect sizes (Cohen's d) showed both tasks improving (+0.71 and +0.58). Only within-group Δτ revealed they went in opposite directions. Shuffle control validates that the effect is genuine, not regression-to-mean. This combination — Δτ + shuffle + single-intervention ablation + bootstrap CI — provides a template for rigorous evaluation of multi-agent governance systems.

---

## Technical Summary

| | |
|---|---|
| **Code** | ~18,400 lines TypeScript, 112 automated tests |
| **Architecture** | Strategy pattern + Adapter pattern + Dependency Injection + Event Bus |
| **Math** | Full formal framework: 13 sections, complete LaTeX |
| **Models** | DeepSeek-V3 (primary), OpenAI, Anthropic, Local (Ollama) |
| **Integrations** | Framework-agnostic adapter layer; Custom, AutoGen, CrewAI, LangGraph |
| **Stack** | Next.js 14, TypeScript 5.5, Vitest, Tailwind CSS |

---

## Long-Term Vision

As multi-agent systems scale from 5-agent discussion rooms to 500-agent organizational ecosystems, the core challenge shifts from task completion to **emergent outcome trustworthiness**. Echo chambers become information cartels. Authority bias becomes power monopolization. SwarmAlpha's observe → model → detect → intervene → evaluate loop is agent-count-agnostic and framework-agnostic — the minimal viable kernel of a future **governance operating system for AI agent societies**.

> *"Not a framework for building agents. An operating system for governing them."*

---

## About the Author

Independent project by a 10th-grade student. Architecture design, experiment design, mathematical framework, and research direction are fully autonomous. All code generated via AI-assisted development (Claude Code). Completed in 15 days.

**GitHub**: [github.com/mulasakee17/swarmalpha](https://github.com/mulasakee17/swarmalpha)
