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

**Four governance modes**: none (baseline), detect-only, random-intervene (ablation), full (targeted detection + adaptive intervention).

**Five-dimension evaluation**: Consensus, Reliability, Dispersion, Stability, and Influence Analysis — all with statistical grounding (Cronbach's α, Cohen's d, bootstrap confidence intervals).

---

## Results

120 controlled experiments across 2 tasks × 4 ablation modes × n=15, with Kendall's τ and within-group τ trajectory (Δτ) as primary metrics:

- **Causal evidence on interdependent tasks**: Governance lifts τ from 0.022→0.556 (Δτ=+0.84, d=+0.71). Same agents improve across rounds — not a between-group artifact.
- **Boundary condition on weakly-interdependent tasks**: Between-group d=+0.58, but within-group Δτ=−0.12. Governance does not causally improve discussions when agents already perform well alone.
- **Methodological contribution**: Standard between-group effect sizes overstate governance impact. Within-group trajectory analysis reveals when effects are causal vs. artifacts of initial conditions.

---

## Technical Summary

| | |
|---|---|
| **Code** | ~13,000 lines TypeScript, 124 automated tests |
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
