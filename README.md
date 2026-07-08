# 🐜 SwarmAlpha

> **Experimental evidence that LLM agent collectives need governance — but only when they genuinely need to collaborate.**
>
> *First controlled demonstration with statistical rigor of a boundary condition for AI governance deployment.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black)](https://nextjs.org/)
[![Tests](https://img.shields.io/badge/tests-124%20passed-green)](./test/)
[![Framework-Agnostic](https://img.shields.io/badge/framework-agnostic-purple)]()
[![Embeddable](https://img.shields.io/badge/embeddable-SDK-orange)]()
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

---

## Core Finding

**Governance improves LLM agent decision quality — but only when task interdependence is high.**

| | Interdependent Task | Weakly-Interdependent Task |
|---|---|---|
| **Without governance** | τ = 0.022 (near-random) | τ = 0.533 (already decent) |
| **With governance** | τ = 0.556, Δτ = **+0.84** ✓ | τ = 0.640, Δτ = **−0.12** ✗ |
| **Conclusion** | Governance is essential | Governance adds noise |

This boundary condition was revealed by a novel methodology — **within-group trajectory analysis (Δτ)** — that distinguishes genuine governance effects from between-group artifacts. Standard effect sizes (Cohen's d) showed *both* tasks improving (+0.71 and +0.58). Only Δτ exposed the truth: governance improves the discussion trajectory only when agents *genuinely need* each other's information.

> **Key insight**: Between-group effect sizes overstate governance impact. You can't tell if governance works by comparing different groups of agents — you must track the *same* agents across discussion rounds. This methodological distinction is itself a contribution.

---

## What is SwarmAlpha?

SwarmAlpha is the **governance runtime** used to generate the evidence above — an embeddable layer that observes, detects, and intervenes on collective decision failures in multi-agent systems.

It does NOT create agents or manage workflows. It plugs into existing frameworks to provide:

- 🔍 **Observation** — extract agent beliefs and emotions from natural language
- 📊 **Belief Modeling** — track belief evolution and influence propagation
- 🚨 **Bias Detection** — echo chambers, authority bias, polarization, premature consensus
- 🛡️ **Intervention** — targeted prompts injected into agent discussion
- 📈 **Evaluation** — 5-dimension scoring with bootstrap confidence intervals

**Key principle**: LLMs only do perception (extracting beliefs from language). Mathematics handles everything else — consensus computation, bias detection, belief dynamics. This means the governance runtime is **fast, cheap, and interpretable** with zero additional LLM calls.

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
│**Framework-Agnostic · Embeddable · Adaptive · Scalable**  │
└──────────────────────────────────────────────┘
```

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

### 4 Governance Modes + Extended Ablations

| Mode | Detection | Intervention | Use Case |
|------|-----------|-------------|----------|
| `none` | ❌ | ❌ | Baseline comparison |
| `detect-only` | ✅ | ❌ | Hawthorne effect testing |
| `random-intervene` | ❌ | ✅ Random | Ablation: "is precision necessary?" |
| `full` | ✅ | ✅ Targeted | Production use |
| **Extended** | | | |
| `shuffle` | ✅ | ✅ | Regression-to-mean control: scrambled agent knowledge |
| `full_diversity` | Echo chamber only | Diversity only | Single-intervention ablation |
| `full_weight` | Authority bias only | Weight reduction only | Single-intervention ablation |
| `full_reflection` | Polarization only | Reflection only | Single-intervention ablation |
| `full_continue` | Premature consensus only | Continue discussion only | Single-intervention ablation |

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

## Experimental Evidence

**120 controlled experiments** (2 tasks × 7 ablation modes × n=15). Primary metric: Kendall's τ for ranking accuracy. Key innovation: **within-group τ trajectory (Δτ)** — tracking the *same* agents across rounds, not just comparing group averages.

### Why Δτ matters

| Method | What it measures | Problem |
|--------|-----------------|---------|
| **Cohen's d** (between-group) | Average difference between governance and baseline groups | Different agents have different initial conditions — can't isolate governance effect |
| **Δτ** (within-group trajectory) | How much the *same* agents improve from round 1 to final round | Isolates governance effect from random variation |

> Both our tasks showed **positive Cohen's d** (+0.71 and +0.58). Only Δτ revealed they went in **opposite directions** (+0.84 vs −0.12). If we had only reported d, we would have falsely claimed governance helps in both cases.

### Task 1: Interdependent Investment (Strong Collaboration Required)

No single agent can determine the correct answer alone — each holds 1/5 of the financial metrics. Baseline τ = 0.022 (near-random guessing).

| Ablation | τ (μ±σ) | Δτ (within-group) | d vs none |
|----------|----------|-------------------|-----------|
| None | 0.022±0.791 | +0.40 | — |
| **Full governance** | **0.556±0.698** | **+0.84** | +0.71 |

**Δτ = +0.84, 95% CI [+0.27, +1.38]** — statistically significant. Governance more than doubles ranking accuracy by forcing agents to share their private information before converging.

### Task 2: M&A Target Selection (Weak Collaboration Required)

Agents can reason independently from their own expertise. Baseline τ = 0.533 — already performing well without collaboration.

| Ablation | τ (μ±σ) | Δτ (within-group) | d vs none |
|----------|----------|-------------------|-----------|
| None | 0.533±0.209 | 0.00 | — |
| **Full governance** | **0.640±0.155** | **−0.12** | +0.58 |

**Δτ = −0.12, 95% CI [−0.25, −0.02]** — significantly *negative*. Governance interventions that force reflection and extend discussion actually degrade performance when agents already know what they're doing. Full vs None between-group ΔQ=+4.0, p=0.267 — not significant.

### The Boundary Condition

| | Task 1 (Interdependent) | Task 2 (Weakly-Interdependent) |
|---|---|---|
| **When does governance help?** | ✅ When no agent can solo | ❌ When agents already perform well |
| **Why?** | Governance surfaces hidden information | Governance adds noise to an efficient process |
| **Implication** | Deploy governance where collaboration is essential | Skip governance where agents are self-sufficient |

**Statistical rigor**: All CIs are percentile bootstrap (10,000 resamples, deterministic mulberry32 RNG). Parameter sensitivity infrastructure (5 parameters × 5 values × 5 runs) verifies results are not driven by specific hyperparameter choices. Shuffle control rules out regression-to-mean.

[Full experiment data →](experiments/v2/data/) · [Invest task data →](experiments/v2/data_invest/) · [Analysis script →](experiments/v2/analyze.ts) · [Sensitivity analysis →](experiments/v2/sensitivity.ts)

---

## Why This Matters

Multi-agent systems are being deployed in high-stakes domains — finance, healthcare, law. When five AI agents discuss a critical decision, they commit the **same systematic failures as human groups**. Current frameworks (AutoGen, CrewAI, LangGraph) provide zero governance.

SwarmAlpha demonstrates that:
1. **Governance is necessary** — ungoverned agents fail to integrate distributed information (τ=0.022)
2. **Governance has boundaries** — when agents are already competent, interventions degrade performance
3. **You can't measure governance impact with simple group averages** — our Δτ methodology is necessary to distinguish real effects from statistical artifacts

**The implication for AI deployment**: Don't add governance to every multi-agent system. Measure task interdependence first. Deploy governance where agents *genuinely need* each other. Skip it where they don't.

---

## Scalable Architecture: 5 Agents → 500 Agents

SwarmAlpha's discussion topology layer enables the same governance engine to operate at any scale:

| Scale | Topology | Behavior |
|-------|----------|----------|
| **5 agents** | `FlatTopology` | Round-table discussion — all agents see all opinions |
| **40 agents** | `GroupedTopology(8)` | 5 groups × 8 agents, reshuffled each round — cross-pollination |
| **500 agents** | `CommitteeTopology` | Groups → representatives → plenary — federated governance |

The governance engine itself is **unchanged at every scale**. Only the discussion structure changes. Bias detectors and intervention strategies operate on the global belief state — they don't care whether beliefs were formed in flat or grouped discussions.

```typescript
// Scale to 40 agents with one config line:
const engine = new DiscussionEngine({
  governanceMode: "full",
  topology: new GroupedTopology(8),  // ← the only change needed
});
```

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
| [RESEARCH_STATEMENT.md](RESEARCH_STATEMENT.md) | Research contribution & experiment results |
| [experiments/v2/analyze.ts](experiments/v2/analyze.ts) | Bootstrap CI analysis script |
| [experiments/v2/sensitivity.ts](experiments/v2/sensitivity.ts) | Parameter sensitivity sweep |

---

## Tech Stack

TypeScript · Next.js 14 · React 18 · Tailwind CSS · Vitest · DeepSeek API

---

## Author

**贺孟元** — High school student, independent architecture, implementation, and experimental design.

AI-assisted development (Claude Code). Architecture decisions and experiment design are fully autonomous.

---

> *"Not replacing how agents decide — ensuring what they decide holds up to scrutiny."*
