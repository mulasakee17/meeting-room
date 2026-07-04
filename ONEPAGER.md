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

## Experimental Evidence (45 controlled experiments)

M&A Hidden Profile task × 3 ablation groups × n=15. Primary metric: Kendall's τ.

| Ablation | Decision Quality | τ | Interventions | d vs none |
|----------|-----------------|----|--------------|-----------|
| None | 76.7±10.5 | 0.533 | — | — |
| Detect‑only | 74.0±14.5 | 0.480 | 0 | −0.21 |
| **Full governance** | **81.3±10.6** | **0.627** | **33** | **+0.44** |

**Core result**: Information-layer governance produces a real, directionally positive effect (d = +0.44). All 33 interventions injected targeted prompts into agent discussion — genuine causal evidence, modest but not inflated.

---

## Technical Highlights

| Feature | Description |
|---------|-------------|
| **Framework-Agnostic** | Works with AutoGen, CrewAI, LangGraph, or custom frameworks via adapter pattern |
| **Embeddable SDK** | `import { GovernanceRuntime } from "@/runtime"` — one class, zero framework deps |
| **Adaptive Governance** | Thresholds auto-calibrate per task; intervention dosage scales with severity |
| **Cross-Examination** | Adversarial debate engine: splits agents into PRO/CON camps, synthesizes verdict |
| **Causal Inference** | Counterfactual dropout analysis distinguishes correlation from causation |
| **Multi-LLM Support** | DeepSeek / OpenAI / Anthropic / Local (Ollama) — unified interface |
| **124 Automated Tests** | All core modules covered, 12 test files |
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

- **Short-term**: Complete 3-task full ablation matrix + GPT-4o cross-model validation
- **Medium-term**: Python SDK for native AutoGen/CrewAI integration; formalize governance theory

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
