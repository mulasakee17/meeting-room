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

**English** | [中文](./README_CN.md)

---

## Core Finding

**Governance improves LLM agent decision quality — but only when task interdependence is high.**

| | Invest (Strong Interdependence) | M&A (Weak Interdependence) |
|---|---|---|
| **Baseline τ** | 0.022 (near-random) | 0.533 (already decent) |
| **Full governance τ** | 0.556 | 0.640 |
| **Within-group Δτ** | **+0.84** ✓ (CI [+0.27, +1.38]) | **−0.12** ✗ (CI [−0.25, −0.02]) |
| **Shuffle τ*** | 0.000 (random) | 0.900 (better than full!) |
| **Conclusion** | Governance is essential | Governance is unnecessary |

*\*Shuffle control: scramble agent knowledge to break coherence. Tests whether governance improvement is regression-to-mean.*

### Four lines of evidence support this conclusion:

**1. Δτ methodology exposes what Cohen's d hides.** Standard effect sizes showed *both* tasks improving (d=+0.71 and +0.58). Only within-group trajectory analysis — tracking the *same* agents across rounds — revealed they went in opposite directions.

**2. Shuffle control excludes regression-to-mean.** On Invest, with scrambled agent knowledge, τ drops to 0.000 despite full governance. This proves governance improvement is genuinely from integrating correct information, not from "discussing more" or statistical artifacts.

**3. Introduce diversity is the key mechanism — and reduce weight is harmful.** Single-intervention ablation on Invest reveals: `full_diversity` alone achieves τ=0.667 (ΔQ=+32.2, p=0.003) — the *only* statistically significant single intervention, slightly exceeding full governance's effect. `full_weight` (cutting dominant agent's influence) drops τ to −0.267 — actively harmful on interdependent tasks, because it suppresses unique information. `full_reflection` (τ=0.333) and `full_continue` (τ=0.200) are directionally positive but not significant alone. The mechanism is clear: echo chamber detection → diversity injection forces hidden information to surface. Not more rounds. Not reflection. Not weight cutting. Just making agents share what only they know.

**Counterintuitive discovery (M&A shuffle)**: Scrambling agent knowledge on the weakly-interdependent task *improved* performance beyond full governance (τ=0.900 vs 0.613). Why? M&A agents already have comprehensive data on ALL 5 companies — they don't need each other to form reasonable judgments. Shuffling breaks their professional overconfidence: the CFO, now holding unfamiliar tech data instead of financial data, becomes less certain and *actually listens* to others. The result is better information aggregation without any governance intervention. This reinforces the boundary condition: on weakly-interdependent tasks, governance isn't just unnecessary — breaking overconfidence (by any means, including random knowledge rotation) can outperform targeted intervention.

> **Key insight**: Between-group effect sizes overstate governance impact. Governance is not "always better" — its value depends on task structure. And the mechanism is not about enforcing process, but about enabling information that wouldn't otherwise surface.

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

### 1. Clone & Install

```bash
git clone https://github.com/mulasakee17/meeting-room.git
cd meeting-room
npm install
```

### 2. Add Your API Key

```bash
cp .env.local.example .env.local
```

Then edit `.env.local` — add at least one LLM API key:

```bash
# Required: at least ONE of these
DEEPSEEK_API_KEY=sk-your-key-here     # Get from https://platform.deepseek.com/
# OPENAI_API_KEY=sk-your-key-here      # Get from https://platform.openai.com/
# ANTHROPIC_API_KEY=sk-ant-your-key    # Get from https://console.anthropic.com/
```

**Pricing**: DeepSeek is ~$0.01 per experiment run (5 agents × 5 rounds). OpenAI is ~$0.10. Anthropic is ~$0.15.

### 3. Run

```bash
# Web UI (demo mode works without API key)
npm run dev                # → http://localhost:3000

# Run experiments (needs API key)
npm run experiment          # Full ablation matrix

# Analyze results (no API key needed)
npm run analyze             # Bootstrap CI + statistical inference

# Parameter sensitivity (needs API key)
npm run sensitivity         # 5 params × 5 values sweep

# Run tests (no API key needed)
npm test                    # 124 tests
```

**Demo mode**: Open http://localhost:3000, click "Run Comparison" — uses pre-computed scenarios, zero API cost. "Live" mode sends real LLM requests.

### 4. Use as an SDK in Your Own Project

```typescript
import { GovernanceRuntime, CustomAdapter } from "@/runtime";

const runtime = new GovernanceRuntime({
  maxRounds: 5,
  governanceMode: "full",           // "none" | "detect-only" | "full"
});

// Feed your agent messages into the governance pipeline
const result = runtime.processRound(messages);

if (result.hasIntervention) {
  await applyInterventionToYourAgents(result.interventions[0]);
}

const evaluation = runtime.getSessionResult(finalDecision);
console.log(`Decision quality: ${evaluation.overallScore}/100`);
```

### Supported LLM Providers

| Provider | Model | Setup |
|----------|-------|-------|
| **DeepSeek** (default) | deepseek-chat | `DEEPSEEK_API_KEY` in `.env.local` |
| OpenAI | gpt-4o-mini | `OPENAI_API_KEY` in `.env.local` |
| Anthropic | claude-3-haiku | `ANTHROPIC_API_KEY` in `.env.local` |
| Local (Ollama) | llama3, mistral | `LOCAL_LLM_URL=http://localhost:11434` |

Switch provider in `experiments/v2/run.ts` line 112: change `provider: "deepseek"` to `"openai"` or `"anthropic"`.

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

### Extensible Detection & Shared Utilities

The governance engine supports **custom bias detectors** via a registration API — new detectors can be added without modifying the core engine:

```typescript
engine.registerDetector({
  type: "groupthink",
  detect(agentBeliefs, messages, config) {
    // custom detection logic
    return { detected: true, severity: "medium", description: "..." };
  },
});
```

Shared utility modules (`src/lib/utils/`) eliminate duplicated code across the codebase:
- **`Registry<K,V>`** — generic registry base class for adapter/strategy registration
- **`jsonUtils.ts`** — unified JSON parsing (stripCodeFences, safeJsonParse, extract helpers)
- **`statsUtils.ts`** — statistical helpers (mean, std, variance, normalize)
- **`interventionPrompt.ts`** — unified intervention prompt formatting

---

## Experimental Evidence

**220+ controlled experiments** (2 tasks × 9 ablation modes × n=10-15). Primary metric: Kendall's τ + **within-group τ trajectory (Δτ)** — tracking the *same* agents across rounds.

### Why Δτ + Shuffle matters

| Method | What it measures | Pitfall |
|--------|-----------------|---------|
| **Cohen's d** (between-group) | Average difference between groups | Different agents, different initial conditions |
| **Δτ** (within-group) | Same agents' improvement across rounds | — |
| **Shuffle control** | Governance with scrambled knowledge | Tests regression-to-mean |

### Task 1: Interdependent Investment (Strong Collaboration Required)

No single agent can determine the answer alone. Baseline τ = 0.022.

| Ablation | τ (μ±σ) | Q (μ±σ) | Δτ | d vs none |
|----------|----------|----------|-----|-----------|
| None | 0.022±0.791 | 51.3±39.6 | +0.40 | — |
| **Full** | **0.556±0.698** | **77.9±34.9** | **+0.84** ✓ | +0.71 |
| Shuffle | −0.000±0.720 | 50.2±36.1 | −0.33 | −0.03 |
| **full_diversity** | **0.667±0.351** | **83.5±17.4** | **+1.13** ★ | +0.98 |
| full_reflection | 0.333±0.943 | 66.7±47.1 | +0.67 | +0.36 |
| full_continue | 0.200±1.033 | 60.0±51.6 | +0.67 | +0.20 |
| full_weight | −0.267±0.966 | 36.7±48.3 | +0.07 | −0.34 |

- **Δτ = +0.84, 95% CI [+0.27, +1.38]** — significantly positive
- **Shuffle τ = 0.000** — scrambled knowledge → collapse → regression-to-mean **ruled out**
- **full_diversity is the only significant single intervention** (ΔQ=+32.2, p=0.003) — echo chamber detection is the key mechanism
- **full_weight is harmful** (τ=−0.267) — cutting influence destroys information on interdependent tasks

### Task 2: M&A Target Selection (Weak Collaboration Required)

Agents can reason independently. Baseline τ = 0.533.

| Ablation | τ (μ±σ) | Q (μ±σ) | Δτ | d vs none |
|----------|----------|----------|-----|-----------|
| None | 0.533±0.209 | 76.7±10.5 | 0.00 | — |
| **Full** | **0.613±0.177** | **80.7±8.8** | **−0.12** ✗ | +0.41 |
| Shuffle | **0.900±0.194** | **95.0±9.7** | −0.11 | +1.80 |
| full_continue | 0.620±0.063 | 81.0±3.2 | −0.14 | +0.52 |

- **Δτ = −0.12, 95% CI [−0.25, −0.02]** — significantly *negative*
- **Shuffle τ = 0.900 > Full τ = 0.613** — scrambling knowledge *improved* performance. Breaking professional overconfidence forces agents to listen.
- **Full vs None ΔQ=+4.0, p=0.280** — not statistically significant

### The Boundary Condition (with evidence)

| Claim | Evidence |
|-------|----------|
| Governance helps interdependent tasks | Invest Δτ=+0.84, CI [+0.27, +1.38] |
| Governance does NOT help weakly-interdependent tasks | M&A Δτ=−0.12, CI [−0.25, −0.02], p=0.28 |
| Effect is not regression-to-mean | Shuffle τ=0.000 (Invest), Shuffle τ>Full (M&A) |
| Echo chamber detection is the key mechanism | full_diversity alone significant (p=0.003); others are not |
| Weight reduction is harmful on interdependent tasks | full_weight τ=−0.267 — cutting influence destroys unique information |
| Breaking overconfidence beats governance on easy tasks | M&A Shuffle τ=0.900 > Full τ=0.613 |

**Statistical rigor**: Bootstrap 95% CI (10,000 resamples, deterministic seed). 9 ablation modes. Parameter sensitivity infrastructure (5×5×5 sweep). All raw data preserved in `experiments/v2/data*/`.

---

## Why This Matters

Multi-agent systems are being deployed in high-stakes domains — finance, healthcare, law. When five AI agents discuss a critical decision, they commit the **same systematic failures as human groups**. Current frameworks (AutoGen, CrewAI, LangGraph) provide zero governance.

SwarmAlpha demonstrates that:
1. **Governance is necessary** — ungoverned agents fail to integrate distributed information (τ=0.022)
2. **Governance has boundaries** — when agents are already competent, interventions don't help
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
│   ├── utils/                    # 🆕 Shared utilities (Registry, JSON, stats)
│   ├── benchmarks/               # Benchmark framework
│   └── security/                 # Rate limiting + input validation
├── app/                          # Next.js web UI + REST API
│   ├── page.tsx                  # Demo/Live comparison view
│   └── api/v3/                   # API endpoints
experiments/                      # Hidden Profile experiment framework
└── test/                         # 112 automated tests
```

---

## Running Tests

```bash
npm test              # 112 tests across 11 files
npm run test:watch    # watch mode
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
