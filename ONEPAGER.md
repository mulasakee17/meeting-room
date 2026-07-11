# SwarmAlpha — One-Page Summary

> **An Embeddable Governance Runtime for Multi-Agent Systems**
>
> Improving Collective Decision Quality via Quantifiable Adaptive Governance

---

## The Problem

LLM multi-agent systems (AutoGen, CrewAI, etc.) are being deployed in high-stakes scenarios — finance, healthcare, law. But they commit the **same systematic decision errors** as human groups:

| Bias | Symptom | Consequence |
|------|---------|-------------|
| **Premature Consensus** | Agreement in round 1, critical info never discussed | Sub-optimal decisions |
| **Authority Bias** | One overconfident agent dominates the rest | Herd-following errors |
| **Echo Chamber** | Similar-minded agents confirm each other | Collective blind spots |
| **Group Polarization** | Divergence hardens into deadlock | Decision paralysis |

**No existing framework detects or intervenes on these failures.**

---

## What We Built

SwarmAlpha is **not another multi-agent framework**. It's an **embeddable governance runtime** — a drop-in layer that enhances existing frameworks rather than replacing them.

```
Without SwarmAlpha:
  AutoGen/CrewAI → Agents discuss → Vote → Done  (no quality check)

With SwarmAlpha:
  AutoGen/CrewAI → Agents discuss → [Governance Runtime: observe → detect → intervene] → Quality-evaluated decision
```

### Three Core Components

1. **Governance Runtime** — Framework-agnostic engine that monitors 4 failure modes in real time and triggers targeted interventions
2. **5-Dimension Evaluation** — Statistically-grounded scoring (Consensus, Reliability, Dispersion, Stability, Influence Analysis) — not just "was it right?"
3. **Decision Trace** — Full auditable decision chain: who influenced whom, why beliefs shifted, when governance intervened

### Key Innovation: LLM Perception / Math Evolution Separation

LLMs only extract beliefs and emotions from natural language. All governance logic (consensus computation, bias detection, belief dynamics) uses pure mathematics. Result: **fast, cheap, interpretable** — deployable as a lightweight plugin with zero additional LLM calls.

---

## Experimental Evidence (140 controlled experiments)

2 tasks × 7 ablation modes × n=10-15. Primary metric: Kendall's τ + within-group Δτ. Bootstrap 95% CI (10k resamples).

### Interdependent Investment Task
*(No single agent can determine the answer alone.)*

| Ablation | τ | Δτ | Key finding |
|----------|------|-----|-------------|
| None | 0.022 | +0.40 | Baseline: near-random |
| **Full** | **0.556** | **+0.84** ✓ | Governance works (CI [+0.27, +1.38]) |
| Shuffle | 0.000 | −0.33 | Knowledge scramble → collapse → **rules out regression-to-mean** |
| **full_diversity** | **0.667** | **+1.13** ★ | **Only significant single intervention (p=0.003)** |
| full_reflection | 0.333 | +0.67 | Directional, not significant (p=0.39) |
| full_continue | 0.200 | +0.67 | "More rounds" recovers <40% (p=0.64) |
| full_weight | −0.267 | +0.07 | **Harmful** — cutting influence destroys unique info |

### M&A Target Selection
*(Agents can perform reasonably without collaboration.)*

| Ablation | τ | Δτ | Key finding |
|----------|------|-----|-------------|
| None | 0.533 | 0.00 | Baseline: already decent |
| **Full** | **0.613** | **−0.12** ✗ | Governance doesn't help (p=0.28) |
| Shuffle | **0.900** | −0.11 | Cognitive conflict > governance (counterintuitive) |
| full_continue | 0.620 | −0.14 | Nearly identical to full |

**Three conclusions, each with direct evidence**:

1. **Governance has a boundary condition** — Works on interdependent tasks (Δτ=+0.84), doesn't on weakly-interdependent (Δτ=−0.12, p=0.28)
2. **Introduce diversity is the key mechanism** — Only full_diversity is statistically significant (p=0.003); weight reduction is actively harmful (τ=−0.267); more rounds and reflection don't help alone
3. **Breaking overconfidence outperforms governance on easy tasks** — M&A Shuffle τ=0.900 > Full τ=0.613: scrambled data breaks professional overconfidence, forcing agents to listen

---

## Technical Highlights

| Feature | Description |
|---------|-------------|
| **Framework-Agnostic** | Works with AutoGen, CrewAI, LangGraph, or custom frameworks via adapter pattern |
| **Embeddable SDK** | `import { GovernanceRuntime } from "@/runtime"` — one class, zero framework deps |
| **Adaptive Governance** | Thresholds auto-calibrate per task; intervention dosage scales with severity |
| **Cross-Examination** | Adversarial debate engine: splits agents into PRO/CON camps, synthesizes verdict |
| **7 Ablation Modes** | Full + shuffle control + 4 single-intervention modes isolate which mechanism matters |
| **Bootstrap Inference** | 95% CI + p-values (10k resamples, deterministic seed) on all key comparisons |
| **Parameter Sensitivity** | One-at-a-time sweep over 5 governance parameters verifies robustness |
| **Dropout Sensitivity** | Agent dropout analysis measures outcome sensitivity to each agent's presence |
| **Multi-LLM Support** | DeepSeek / OpenAI / Anthropic / Local (Ollama) — unified interface |
| **Extensible Detection** | Custom bias detectors via `registerDetector()` — no core engine changes needed |
| **Shared Utilities** | Registry/JSON/stats modules eliminate code duplication across the codebase |
| **112 Automated Tests** | All core modules covered, 11 test files |
| **Demo Mode** | Zero-config, no API key needed — instant visualization |

---

## Integration Example

```typescript
import { GovernanceRuntime, CustomAdapter } from "@/runtime";

// Wrap your existing agent system
const runtime = new GovernanceRuntime({ maxRounds: 5, governanceMode: "full" });
const adapter = new CustomAdapter();

for (const round of discussion) {
  const messages = adapter.adaptMessages(round.rawMessages, round.number);
  const result = runtime.processRound(messages);

  if (result.hasIntervention) {
    await adapter.applyIntervention(result.interventions[0], agentContext);
  }
}

const evaluation = runtime.getSessionResult(finalDecision);
// → { overallScore: 82, grade: "good", dimensions: {...}, governance: {...} }
```

---

## Who Built This

**贺孟元** — High school student. Independent architecture design, implementation (~13,000 lines TypeScript), experiment design, and data analysis.

AI-assisted coding (Claude Code). Architecture decisions and experiment design are fully autonomous.

- **GitHub**: [github.com/mulasakee17/swarmalpha](https://github.com/mulasakee17/swarmalpha)
- **Tech Stack**: TypeScript + Next.js + DeepSeek API + Vitest

---

## Roadmap

- **Short-term**: Run parameter sensitivity sweep + GPT-4o cross-model validation (n=5)
- **Medium-term**: Python SDK for native AutoGen/CrewAI integration; formalize governance theory
- **Statistical**: Bootstrap BCa correction; power analysis for sample size planning

## Long-Term Vision: Agent Society Governance Infrastructure

> *"Not a framework for building agents. An operating system for governing them."*

As multi-agent systems scale from 5-agent discussions to 500-agent organizational ecosystems, the core challenge shifts from task completion to **emergent outcome trustworthiness**:

- Echo chambers → information cartels
- Authority bias → power monopolization
- Premature consensus → institutional groupthink

SwarmAlpha's observe→model→detect→intervene→evaluate loop is agent-count-agnostic and framework-agnostic — the minimal viable kernel of a future governance operating system for AI societies.
- **Long-term**: Multi-agent governance as industry standard (EU AI Act compliance)

---

> *"Not replacing how agents decide — ensuring what they decide holds up to scrutiny."*
