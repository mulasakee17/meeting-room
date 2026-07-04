# 🐜 SwarmAlpha

> **An Embeddable Governance Runtime for Multi-Agent Systems**
>
> Improving Collective Decision Quality via Quantifiable Adaptive Governance
>
> *SwarmAlpha enhances existing multi-agent systems rather than replacing them.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black)](https://nextjs.org/)
[![Tests](https://img.shields.io/badge/tests-124%20passed-green)](./test/)
[![Framework-Agnostic](https://img.shields.io/badge/framework-agnostic-purple)]()
[![Embeddable](https://img.shields.io/badge/embeddable-SDK-orange)]()
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

---

## What is SwarmAlpha?

SwarmAlpha is an **embeddable governance runtime** that continuously observes, analyzes, governs, and evaluates collective decision-making processes in multi-agent systems.

It does NOT create agents, manage workflows, or handle tool calling. Instead, it plugs into existing multi-agent frameworks (AutoGen, CrewAI, LangGraph, or custom systems) to provide a **real-time governance layer** that:

- 🔍 **Observes** agent discussions in real time
- 📊 **Models** belief evolution and influence propagation
- 🚨 **Detects** systemic decision failures (premature consensus, authority bias, echo chambers, group polarization)
- 🛡️ **Intervenes** with adaptive, targeted governance actions
- 📈 **Evaluates** decision quality across 5 statistically-grounded dimensions

> *"Not replacing how agents decide — ensuring what they decide holds up to scrutiny."*

---

## Why Governance Matters

When 5 AI agents discuss a problem, they fall into the same traps as human groups:

| Failure Mode | What Happens | Impact |
|-------------|-------------|--------|
| **Premature Consensus** | Agreement in round 1 without exploring critical information | Sub-optimal decisions |
| **Authority Bias** | One overconfident agent dominates the group | Herd-following errors |
| **Echo Chamber** | Similar-minded agents mutually confirm biases | Collective blind spots |
| **Group Polarization** | Divergence hardens into deadlock | Decision paralysis |

**No existing multi-agent framework detects or intervenes on these failures.** SwarmAlpha fills this gap — as a drop-in governance layer.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│   Your Multi-Agent Framework                  │
│   (AutoGen / CrewAI / LangGraph / Custom)     │
│                                               │
│   Agent 1    Agent 2    Agent 3    ...        │
│      │           │          │                  │
│      └───────────┴──────────┘                  │
│                  │                             │
│          Discussion Stream                     │
│                  │                             │
├──────────────────┼──────────────────────────┤
│   SwarmAlpha Governance Runtime               │
│                                               │
│   ┌─────────────────────────────────────┐    │
│   │  Observation → Belief Modeling       │    │
│   │     ↓                                │    │
│   │  Bias Detection (4 types)            │    │
│   │     ↓                                │    │
│   │  Adaptive Governance (intervention)  │    │
│   │     ↓                                │    │
│   │  Decision Evaluation (5 dimensions)  │    │
│   └─────────────────────────────────────┘    │
│                                               │
│   Framework-Agnostic · Embeddable · Adaptive  │
└──────────────────────────────────────────────┘
```

**Key principle**: LLMs only do perception (extracting beliefs/emotions from language). Mathematics handles evolution (consensus computation, bias detection, belief dynamics). This makes the governance runtime **fast, cheap, and interpretable** — it can run as a lightweight plugin without additional LLM calls.

---

## Quick Start

### Use as an Embeddable SDK

```typescript
import { GovernanceRuntime, CustomAdapter } from "@/runtime";

// 1. Create the governance runtime
const runtime = new GovernanceRuntime({
  maxRounds: 5,
  governanceMode: "full",
});

// 2. Adapt your framework's messages
const adapter = new CustomAdapter();
const messages = adapter.adaptMessages(yourFrameworkMessages, roundNumber);

// 3. Process a round — governance observes, detects, intervenes
const result = runtime.processRound(messages);

if (result.hasIntervention) {
  // 4. Apply interventions back to your agents
  await adapter.applyIntervention(result.interventions[0], agentContext);
}

// 5. Get the final decision quality evaluation
const sessionResult = runtime.getSessionResult(finalDecision);
console.log(`Decision quality: ${sessionResult.evaluation.overallScore}/100`);
```

### Use as a Research Platform

```bash
git clone git@github.com:mulasakee17/swarmalpha.git
cd swarmalpha
npm install
cp .env.local.example .env.local  # Add your DEEPSEEK_API_KEY
npm run dev                         # Open http://localhost:3000
```

**Demo mode** requires no API key — just click "Run Comparison" to see the governance runtime in action.

---

## The Governance Runtime

### 4 Governance Modes

| Mode | Detection | Intervention | Use Case |
|------|-----------|-------------|----------|
| `none` | ❌ | ❌ | Baseline comparison |
| `detect-only` | ✅ | ❌ | Hawthorne effect testing |
| `random-intervene` | ❌ | ✅ Random | Ablation: "is precision necessary?" |
| `full` | ✅ | ✅ Targeted | Production use |

### Adaptive Governance

Thresholds and intervention strength adapt to task context:

- **Adaptive Thresholds**: Run a calibration discussion → measure convergence speed, base redundancy, influence concentration → auto-scale detection thresholds per task
- **Adaptive Dosage**: Intervention strength scales with deviation severity, information coverage, and historical intervention effectiveness
- **Cross-Examination Engine**: When agents disagree, automatically split into PRO/CON camps, run adversarial debate, synthesize verdict with minority report

### 5-Dimension Decision Evaluation

| Dimension | What It Measures | Weight |
|-----------|-----------------|--------|
| **Consensus** | Kuramoto order parameter + belief variance + trajectory | 20% |
| **Reliability** | Cross-round Cronbach's α + cross-validation + repeatability | 25% |
| **Dispersion** | Cross-agent belief/confidence variance + round variability | 20% |
| **Stability** | Round consistency + time-series smoothness | 17% |
| **Influence Analysis** | Gini coefficient + network centrality + influence paths | 18% |

---

## Framework Compatibility

SwarmAlpha is **framework-agnostic**. It works with any multi-agent system through a standardized adapter interface:

| Framework | Adapter | Status |
|-----------|---------|--------|
| **Custom** (built-in) | `CustomAdapter` | ✅ Full integration |
| **AutoGen** (Microsoft) | `AutoGenAdapter` | 🔧 TypeScript bridge (Python sidecar needed for full integration) |
| **CrewAI** | Planned | 🗓️ Roadmap |
| **LangGraph** | Planned | 🗓️ Roadmap |

Each adapter translates framework-native messages into the standard `DiscussionMessage` format and applies governance interventions back to the framework.

---

## Experimental Validation

**45 controlled experiments** (M&A Hidden Profile task, 3 ablation groups × n=15) with Kendall's τ rank correlation replacing keyword-matching as the primary metric. **Information-layer interventions** — governance generates targeted prompts injected into agent discussion, rather than silently modifying internal model parameters.

| Ablation | Q (μ±σ) | Kendall's τ | Interventions | d vs none |
|----------|---------|-------------|---------------|-----------|
| None (baseline) | 76.7±10.5 | 0.533 | — | — |
| Detect‑only | 74.0±14.5 | 0.480 | 0 | −0.21 |
| **Full governance** | **81.3±10.6** | **0.627** | **33** | **+0.44** |

**Key finding**: Information-layer governance produces a real, directionally positive effect (d = +0.44). All 33 interventions were `continue_discussion` — detecting premature consensus and injecting undiscussed agent-unique knowledge into the next round. Effect is genuine but modest; prompt strength and intervention diversity are areas for further optimization.

[Full experiment data →](experiments/v2/data/) · [Analysis script →](experiments/v2/analyze.ts)

---

## Vision: Agent Society Governance Infrastructure

SwarmAlpha today governs 5-agent discussions. Tomorrow, it governs 500-agent societies.

As multi-agent systems scale from discussion rooms to organizational ecosystems — pricing agents, supply-chain agents, risk agents, customer-service agents constantly interacting, competing, and cooperating — the bottleneck shifts from *"can agents complete tasks?"* to *"can we trust the emergent outcomes?"*

Systemic failures scale with agent count: echo chambers become information cartels. Authority bias becomes power monopolization. Premature consensus becomes institutional groupthink. **No existing framework addresses governance at this level — because no framework was designed for it.**

SwarmAlpha's architecture is the minimal viable kernel for this future:

| Layer | Today (5 agents) | Tomorrow (500 agents) |
|-------|-----------------|----------------------|
| **Observation** | Discussion messages | Inter-agent transactions, information flows |
| **Belief/Influence** | Discussion-round belief tracking | Continuous social graph dynamics |
| **Bias Detection** | 4 discussion biases | Social-level failures: monopoly, segregation, collusion |
| **Intervention** | Per-round targeted action | Continuous institutional governance |
| **Evaluation** | 5-dimension decision quality | Societal health metrics |

The core loop — observe → model → detect → intervene → evaluate — is framework-agnostic and agent-count-agnostic. The governance runtime doesn't care whether it's monitoring 5 agents or 500.

> *"Not a framework for building agents. An operating system for governing them."*

---

## Project Structure

```
src/
├── runtime/                      # 🆕 Embeddable Governance Runtime (SDK)
│   ├── GovernanceRuntime.ts      # Core governance orchestrator
│   ├── types.ts                  # Framework-agnostic types
│   ├── index.ts                  # Public API entry point
│   └── adapters/                 # Framework bridges
│       ├── CustomAdapter.ts      # Built-in agent framework
│       └── AutoGenAdapter.ts     # AutoGen bridge
├── lib/
│   ├── governance/               # Bias detectors + intervention strategies
│   ├── evaluation/               # 5-dimension scoring engine
│   ├── observation/              # LLM output parsing
│   ├── inference/                # Belief evolution computation
│   ├── discussion/               # Built-in multi-round discussion engine
│   ├── llm/                      # Multi-provider LLM abstraction
│   ├── benchmarks/               # Benchmark framework
│   └── security/                 # Rate limiting + input validation
├── app/                          # Next.js web UI + REST API
│   ├── page.tsx                  # Demo/Live comparison view
│   └── api/v3/                   # API endpoints
experiments/                      # Hidden Profile experiment framework
└── test/                         # 124 automated tests
```

---

## Running Tests

```bash
npx vitest run          # 124 tests across 12 files
npx vitest              # watch mode
```

---

## Documentation

| Document | Content |
|----------|---------|
| [ONEPAGER.md](ONEPAGER.md) | One-page executive summary |
| [TECHNICAL_OVERVIEW.md](TECHNICAL_OVERVIEW.md) | Deep technical architecture |
| [API_CONTRACT.md](API_CONTRACT.md) | REST API + SDK API specification |
| [MATHEMATICAL_FRAMEWORK.md](MATHEMATICAL_FRAMEWORK.md) | Complete formal math definitions |
| [experiments/lunar_survival/REPORT.md](experiments/lunar_survival/REPORT.md) | Ablation experiment report |

---

## Tech Stack

TypeScript · Next.js 14 · React 18 · Tailwind CSS · Vitest · DeepSeek API

---

## Author

**贺孟元** — High school student, independent architecture, implementation, and experimental design.

AI-assisted development (Claude Code). Architecture decisions and experiment design are fully autonomous.

---

> *"Not replacing how agents decide — ensuring what they decide holds up to scrutiny."*
