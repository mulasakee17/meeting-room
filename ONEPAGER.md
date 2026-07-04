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

## Experimental Evidence (80+ controlled experiments)

2 tasks × 4 ablation modes × 10+ repetitions × statistical tests (t-test + Cohen's d)

| Finding | Evidence |
|---------|----------|
| Precision is prerequisite for intervention | Random intervention degrades quality |
| Premature consensus is the dominant failure | 83-93% of all detections |
| Governance is conditional, not always-on | Intervenes when info is asymmetric; stays silent when LLMs have prior knowledge |
| No Hawthorne effect | Detect-only groups show no behavioral change |

**Core insight**: The governance runtime is a **conditional diagnostic system**, not an always-on optimizer.

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
- **Long-term**: Multi-agent governance as industry standard (EU AI Act compliance)

---

> *"Not replacing how agents decide — ensuring what they decide holds up to scrutiny."*
