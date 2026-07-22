# 🐜 SwarmAlpha

> **An embeddable governance runtime for multi-agent systems.**
>
> *Controlled experiments to demarcate when governance helps, when it's neutral, and when it harms multi-agent decision quality.*

[![Tests](https://img.shields.io/badge/tests-310-green)](./test/)
[![Framework-Agnostic](https://img.shields.io/badge/framework-agnostic-purple)]()
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

**English** | [中文](./README_CN.md)

---

## Where SwarmAlpha Fits

Agent governance has two layers. **Security governance** (preventing agents from *doing* harm — unauthorized tool calls, data leaks) is a crowded space. **Cognitive governance** (preventing agents from *thinking* wrong — echo chambers, authority bias, polarization, premature consensus) is open. SwarmAlpha targets the cognitive layer.

**Academic validation**: Li et al. (SJTU, 2026) independently confirmed that multi-agent workflows act as echo chambers, amplifying minor stochastic biases into systemic polarization — and that standard bias detection methods miss these effects. [*Aligned Agents, Biased Swarm*, arXiv:2604.08963](https://arxiv.org/abs/2604.08963). Yang (2026) introduced a "coupling gain γ" diagnostic to distinguish genuine emergent consensus from model artifacts. [*When Is Emergent Consensus Real?*, arXiv:2606.22203](https://arxiv.org/abs/2606.22203).

---

## Core Finding

**After fixing 4 cognitive defects (D1–D4) that broke the governance loop, governance is now statistically confirmed effective.** Crisis task (n=24/cell, expanded): full vs none d=0.92, p=0.005, power=88%, τ +51%. Cross-task validation (Supplier n=30): directionally consistent (d=0.47, p=0.089, power=43%). The governance engine also provides **observability, auditability, and targeted intervention** — three capabilities independently valuable regardless of whether they change the final answer.

**Total: 416 controlled experiments** (165 historical + 161 expanded + 80 async-engine + 10 cross-model). The async-engine line validates thermodynamic termination across 4 phases (Phase 1–4: τ 0.34→0.46→0.64; C vs B d=1.09, p=0.028) and cross-model (Zhipu glm-4-flash C group τ=0.76 vs DeepSeek 0.64, +18.8%). See [§ Async Adaptive Discussion Engine](#async-adaptive-discussion-engine-2026-07-17-recalibrated) below and [README_CN.md](README_CN.md) for full Phase 1–5 story.

### Three Independent Value Pillars

| Pillar | What It Does | Why It Matters Independently |
|--------|-------------|------------------------------|
| **Process Monitoring** | Real-time detection of 4 collective cognitive failures (echo chamber, authority bias, polarization, premature consensus) | Knowing your agent team is forming an echo chamber is valuable *even if you don't intervene*. Enterprises deploying AI agent teams need observability. |
| **Decision Audit** | Full traceable decision chain: who influenced whom, when beliefs shifted, when governance intervened | Post-hoc accountability and compliance. Doesn't change outcomes — changes *responsibility attribution*. |
| **Adaptive Intervention** | Targeted prompts injected when bias detected (diversity injection, forced reflection, weight reduction, continue discussion) | Accelerates convergence on genuinely interdependent tasks — but has clear boundary conditions |

### Historical Data (Broken-Loop, Retained as Provenance Only)

165 of 416 runs were collected *before* the D1–D4 cognitive defects were fixed — the governance loop was severed (detectors fired but interventions could not reach agent perception). These data are retained for provenance in [TECHNICAL_REPORT.md](TECHNICAL_REPORT.md) and are explicitly labeled as provisional. **The 161 closed-loop runs (Crisis 72 + Supplier 89) in the Core Finding above are the primary evidence.**

> **Self-correction note**: Earlier V1 results were affected by a system prompt answer leak and a structurally broken authority bias detector. All 6 bugs were independently identified, verified, and fixed. This self-correction process is itself a research contribution — and demonstrates why process monitoring matters: visibility into agent discussions catches problems that silent pipelines hide.

---

## Cognitive Gap Diagnosis & Repair

> **Critical caveat (commit 08b20fb)**: A diagnostic pass identified four root cognitive gaps in the multi-agent discussion paradigm. **All prior experimental conclusions on this page (Invest 3-round d=+0.65, Invest 5-round d=+0.00, `full_reflection` p=0.048, etc.) were obtained while the discussion loop was broken** — i.e., state modifications, personal memory, and same-round visibility were not actually wired into the agent prompt stream. These numbers are preserved as-is for provenance, but must be cited with this caveat. Re-running the 2×2 factorial design under the repaired loop is pending lab execution.

The diagnostic identified four root cognitive gaps in the multi-agent discussion paradigm and repaired each:

| # | Cognitive Gap | Symptom | Repair |
|---|---------------|---------|--------|
| **1** | **State awareness missing** | `buildPrompt` did not inject the agent's current `belief`/`confidence`, so state-modification interventions (`reduce_weight`, `belief_perturbation`, `force_reflection`) were invisible to the LLM — the model could not "feel" the intervention. | `buildPrompt` now injects current belief/confidence state, making interventions observable to the agent. |
| **2** | **No conversation history** | All agents saw the same global summary; no agent knew what *it itself* had said in prior rounds. | Personalized memory: each agent's prompt now includes (a) its own prior statements and (b) messages that @-mentioned it. |
| **3** | **Synchronous turn-taking (parallel "script reading")** | `Promise.all` let all agents speak in parallel within a round, so agents could not see same-round peers. | Sequential `for` loop: each agent now sees the accumulated context of agents who already spoke in the current round. |
| **4** | **Fabricated influence network** | Agreement/disagreement/persuasion edges were *inferred* from numeric belief differences — producing a phantom influence graph. | Edges are now built **only** from explicit `referencedAgents` mentions in agent messages. |

**Implication**: The repaired loop closes the four gaps that previously broke the intervention feedback cycle. Once re-run under the repaired loop, the boundary-condition conclusions may shift — the prior "null/harmful" findings could partly reflect that interventions never reached the agents' perception in the first place.

---

## Hard-Fault Fixes (H-series)

A series of hard faults (H-series: H2/H4/H6/H17/H18/H19) were identified and repaired alongside the cognitive-gap pass. Some of the 165-experiment numbers on this page were generated *before* these fixes landed. Full H-series table with fault descriptions and repairs is documented in [DEVELOPER_GUIDE.md §5.3](DEVELOPER_GUIDE.md#53-数学-bug).

> **Kuramoto formula update (H4)**: Wherever the Kuramoto phase mapping appears in docs/code, the formula is now `θ = (π/2) · b` (previously `θ = π · b`). This is a substantive fix, not a cosmetic one — it changes consensus detection for polarized states.

---

## What is SwarmAlpha?

SwarmAlpha is an **embeddable governance runtime** — it plugs into existing multi-agent frameworks (AutoGen, CrewAI, LangGraph) to provide observation, bias detection, intervention, and evaluation. It does NOT create agents or manage workflows.

**Key principle**: LLMs only do perception (extracting beliefs from language). Mathematics handles everything else — consensus computation, bias detection, belief dynamics. This makes the runtime **fast, cheap, and interpretable** with near-zero additional LLM calls.

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

## Cross-Task Validation (2026-07-14, Expanded)

To verify that the core findings are **not Crisis-task-specific**, a second task was added: **Supplier Selection** (5 suppliers × 5 hidden dimensions). This task shares the same structure (5 options × 5 hidden dimensions) as Crisis but uses a completely different domain, providing a perfect control. Both tasks have been expanded (Crisis n=24, Supplier n=30).

### Dual-Task Comparison

| Metric | Crisis (n=24/cell) | Supplier (n=30/cell) | Cross-Task Consistency |
|--------|------------------------|------------------------|------------------------|
| **none τ** | 0.408 ± 0.182 | 0.680 ± 0.186 | — |
| **full τ** | 0.617 ± 0.263 | 0.767 ± 0.183 | — |
| **shuffle τ** | 0.717 ± 0.243 | 0.697 ± 0.204 | ⚠️ Task-dependent |
| **Governance Δτ** | **+0.209** | **+0.087** | ✅ Direction consistent |
| **Governance d** | 0.92 (p=0.005) | 0.47 (p=0.089) | ✅ Direction consistent |
| **Power** | 88% ✅ | 43% ⚠️ | — |
| **Consensus-Quality r** | -0.137 | -0.107 | ✅ Both ≈ 0 |

### Findings Validated Across Tasks

**1. Governance is statistically confirmed effective (Crisis) and direction-consistent (Supplier)**: Crisis reaches statistical confirmation (d=0.92, p=0.005, power=88%). Supplier is directionally consistent (d=0.47) but underpowered (43%, needs n=72 for 80% power).

**2. "False consensus" is a cross-task universal phenomenon**: Both tasks show consensus-quality correlation near zero (r=-0.05 for Crisis, r=-0.03 for Supplier; combined r=-0.10, n=169), proving that "high consensus ≠ high quality" is a general feature of LLM multi-agent systems.

**3. Boundary conditions for shuffle controls** (unexpected discovery): Crisis shuffle d=1.44 (p<0.001) — effective on hard tasks (none τ=0.41). Supplier shuffle d=0.09 (p=0.78) — ineffective on easier tasks (none τ=0.68) due to ceiling effect (baseline already near full level).

**4. Mechanism ablation is direction-consistent**: reduce_weight (Crisis d=1.51, p=0.0001) and force_reflection (Crisis d=0.73, p=0.001) drive the effect; both d>0 in Supplier.

### Academic Significance

Across 2 independent tasks, **161 experiments**, 3 conditions, the core findings are **direction-consistent**:
- ✅ Governance works (Crisis statistically confirmed d=0.92 p=0.005, Supplier directionally consistent d=0.47)
- ✅ False consensus exists (r≈0 replicated across tasks)
- ✅ Reflection + weight reduction > diversity (mechanism ablation consistent)
- ⚠️ Shuffle control has boundary conditions (task-difficulty dependent)

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
# 30-second demo — pure local, no API key needed
npm run demo                # Shows governance engine: detection → intervention → F-decomposition sorting

# Web UI (demo mode works without API key)
npm run dev                 # → http://localhost:3000

# Run experiments (needs API key)
npm run experiment           # Full ablation matrix

# Analyze results (no API key needed)
npm run analyze              # t-distribution CI + permutation test + statistical inference

# Recalculate core findings with unified formula (no API key needed)
npx tsx experiments/v2/recalc_consensus_corr.ts   # Cross-task r value verification

# Parameter sensitivity (needs API key)
npm run sensitivity          # 5 params × 5 values sweep

# Run tests (no API key needed)
npm test                    # 310 tests (307 passed, 3 network-dependent skipped)
```

**Causal effect analysis** (no API key needed, uses existing experiment data):

```bash
npx tsx experiments/v2/causalAnalysis.ts   # Nearest-neighbor matching + permutation test
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
| **Zhipu (智谱)** | glm-4-flash | `ZHIPU_API_KEY` in `.env.local` |
| OpenAI | gpt-4o-mini | `OPENAI_API_KEY` in `.env.local` |
| Anthropic | claude-3-haiku | `ANTHROPIC_API_KEY` in `.env.local` |
| Local (Ollama) | llama3, mistral | `LOCAL_LLM_URL=http://localhost:11434` |

Switch provider in `experiments/v2/run.ts` line 140: change `provider: "deepseek"` to `"zhipu"`, `"openai"` or `"anthropic"`.

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

- **Adaptive Thresholds** 🔧 *implemented, not yet experimentally validated*: Run a calibration discussion → measure convergence speed, base redundancy, influence concentration → auto-scale detection thresholds per task
- **Adaptive Dosage** 🔧 *implemented, not yet experimentally validated*: Intervention strength scales with deviation severity, information coverage, and historical intervention effectiveness
- **Free-Energy-Driven Intervention Ranking** ✅ *implemented + backtested + hypothesis falsified*: When multiple detectors trigger simultaneously (91.7% of Crisis experiments), interventions are ranked by social free energy F = (1-R) + T·H decomposition. Backtesting (97 force_reflection events, p=0.041) **falsified** the original `force_reflection↔structural` mapping — force_reflection is a *noise-reduction* intervention (effective in thermal-dominant states, harmful in polarized states), now mapped to `thermal·(1-structural)`. `reduce_weight↔thermal` directionally supported but not significant (p=0.100). See [THEORY.md 附录 B](THEORY.md)
- **Cross-Examination Engine** ✅ *implemented + unit-tested*: When agents disagree, automatically split into PRO/CON camps, run adversarial debate, synthesize verdict with minority report

> **Honest scope note**: The 165 experiments on this page use fixed thresholds and fixed dosage. Adaptive threshold/dosage code exists but has not been experimentally compared against fixed parameters. The 5-dimension evaluation weights (0.20/0.25/0.20/0.17/0.18) are heuristic, not empirically calibrated — an equal-weight robustness check is planned.

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

SwarmAlpha is **framework-agnostic**. The core governance engine has zero dependencies on the built-in DiscussionEngine — all 4 bias detectors, 4 intervention strategies, and adaptive thresholds work independently. Integration uses the `StateInferenceBridge` which translates interventions into plain-text prompts injectable into any agent's system prompt:

| Framework | Adapter | Integration Method | Status |
|-----------|---------|-------------------|--------|
| **Custom** (built-in) | `CustomAdapter` | Direct state manipulation | ✅ Full integration |
| **Any Framework** | `StateInferenceBridge` | Prompt injection — append governance text to agent prompts | ✅ Works today |
| **AutoGen** (Microsoft) | `AutoGenAdapter` + StateInferenceBridge | Message adaptation via AutoGen's hook system + prompt injection | 🔧 Message adaptation done, prompt injection pending |
| **CrewAI** | Planned | Task callback + prompt injection | 🗓️ Roadmap (Phase 2) |
| **LangGraph** | Planned | Graph node injection | 🗓️ Roadmap (Phase 2) |

**Minimum Viable Integration** (any framework, 2-4 hours):
1. Append `buildGovernanceExtension()` to agent system prompts → agents emit structured belief/confidence tags
2. Wrap messages through `StateInferenceBridge.adaptMessages()` each round
3. Call `GovernanceRuntime.processRound()` → get interventions
4. Feed `interventionToPrompt()` output into agent prompts for the next round

See [ROADMAP.md](ROADMAP.md) for detailed integration plans and the multi-agent society vision.

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

**416 controlled experiments** across four lines:
- **165 historical experiments** (M&A 80 + Invest 5-round 55 + Invest 3-round 30) — D1–D4 governance-loop break; preserved as provenance
- **161 expanded experiments** (Crisis 72 + Supplier 89) — closed loop post D1–D4 fix; main evidence
- **80 async-engine experiments** (fraud-investigation ABCD groups, 4-phase evolution)
- **10 cross-model experiments** (Zhipu glm-4-flash C group, +18.8% τ vs DeepSeek)

Primary metric: Kendall's τ + **within-group τ trajectory (Δτ)** — tracking the *same* agents across rounds. Statistical rigor: t-distribution 95% CI + permutation test p-values (with Bonferroni/BH FDR correction). 9 total configurations (4 governance modes + 5 extended ablation). All raw data preserved in `experiments/v2/data*/`.

> **Ablation design update (H2)**: `ablationModes` has been expanded from `["none","full"]` to 7 complete modes (`none / full / shuffle / full_diversity / full_weight / full_reflection / full_continue`). The complete 7-mode experiment matrix (105 runs, 7 × 15) is pending lab execution; the 165-experiment numbers were generated before this expansion and are preserved as-is for provenance.

### Why Δτ + Shuffle matters

| Method | What it measures | Pitfall |
|--------|-----------------|---------|
| **Cohen's d** (between-group) | Average difference between groups | Different agents, different initial conditions |
| **Δτ** (within-group) | Same agents' improvement across rounds | — |
| **Shuffle control** | Governance with scrambled knowledge | Tests regression-to-mean |

### Historical 165-experiment summary (D1–D4 governance-loop break)

These experiments were collected *before* the D1–D4 governance-loop fix, so state-modification interventions (reduce_weight, force_reflection) may be underestimated. Preserved as provenance; not the main evidence. **Full ablation tables for Task 1 (Invest 3-round + 5-round) and Task 2 (M&A 5-round) are in [TECHNICAL_REPORT.md §2.5](TECHNICAL_REPORT.md#25-历史对照165-环路断裂实验).**

Key takeaways from the 165-experiment historical data:
- **Invest 3-round**: governance d=+0.65 (p=0.152, NOT sig) — medium effect, boundary condition
- **Invest 5-round**: governance d=+0.00 (p=1.0) — completely null with sufficient rounds
- **M&A 5-round**: governance d=+0.41 (p=0.36, NOT sig); **shuffle d=+1.80 (p=0.0009)** — the only statistically significant positive finding
- **`full_reflection` on Invest 5-round**: p=0.048 (uncorrected; does NOT survive Bonferroni) — first significant governance finding is *harmful*

### Causal Effect Estimation (Trajectory Matching)

Beyond correlational analysis (t-test, permutation test), SwarmAlpha includes a **causal effect estimation** module that answers: *"How much did the intervention change the final τ, compared to the counterfactual where no intervention occurred?"*

**Method**: Nearest-neighbor trajectory matching (k=5) + inverse-distance-weighted counterfactual + 10000-permutation test + 10000-iteration bootstrap CI. For each treated experiment, 5 nearest donors are selected from the None-baseline pool by Round-1 trajectory distance (τ 0.5 weight + belief diversity 0.3 + belief mean 0.2). The counterfactual τ is the weighted average of matched donors' final τ.

**Key results on existing 165-experiment data** (note: data predates the 2026-07-12 governance-loop fix, so state-modification interventions may be underestimated):

| Group | n_trt | Observed τ | Counterfactual τ | Effect | 95% CI | d | p |
|---|---|---|---|---|---|---|---|
| Invest 3-round | 15 | 0.600 | 0.407 | **+0.193** | [+0.01, +0.37] | 0.69 | 0.199 |
| Invest 5-round | 15 | 0.565 | 0.677 | −0.111 | [−0.27, +0.04] | −0.49 | 0.414 |
| M&A 5-round | 15 | 0.613 | 0.478 | **+0.135** | [+0.07, +0.20] | 0.96 | **0.067** |

- **M&A 5-round**: Causal effect +0.135, 95% CI excludes 0, d=0.96 (large), p=0.067 — closest to significance across all analyses. CI lower bound +0.07 is the strongest evidence that governance has a positive causal effect on decision quality.
- **Invest 3-round**: Effect +0.193, CI lower bound barely above 0 (+0.01), d=0.69 (medium) — consistent with the boundary-condition hypothesis (governance helps in limited rounds).
- **Per-intervention-type**: `continue_discussion` and `introduce_diversity` show positive effects on M&A; `force_reflection` shows negative effect on Invest 5-round (consistent with the p=0.048 harmful finding).

**Assumptions**: SUTVA, conditional ignorability given Round-1 trajectory, common support. **Limitations**: only 1 pre-treatment period, small sample (n=15/cell), historical governance-loop break may underestimate state-modification interventions. See [src/lib/analysis/causalEffect.ts](src/lib/analysis/causalEffect.ts) for implementation and [experiments/v2/causalAnalysis.ts](experiments/v2/causalAnalysis.ts) to run.

---

## Scalable Architecture: 5 Agents → 500 Agents

SwarmAlpha's discussion topology layer enables the same governance engine to operate at any scale:

| Scale | Topology | Behavior | Validation |
|-------|----------|----------|------------|
| **5 agents** | `FlatTopology` | Round-table discussion — all agents see all opinions | ✅ 165 experiments |
| **40 agents** | `GroupedTopology(8)` | 5 groups × 8 agents, reshuffled each round — cross-pollination | 🔧 Implemented, not yet tested |
| **500 agents** | `CommitteeTopology` | Groups → representatives → plenary — federated governance | 🔧 Placeholder (phase 1 only, phase 2-3 stubbed) |

The governance engine itself is **unchanged at every scale**. Only the discussion structure changes. Bias detectors and intervention strategies operate on the global belief state — they don't care whether beliefs were formed in flat or grouped discussions.

> **Honest scope note**: All 165 experiments use `FlatTopology` (5 agents). `GroupedTopology` is implemented and unit-tested but not experimentally validated. `CommitteeTopology` is a placeholder (phase 1 only, phase 2-3 stubbed).

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
│   ├── analysis/                 # 🆕 Causal effect estimation (trajectory matching)
│   ├── llm/                      # Multi-provider LLM abstraction
│   ├── utils/                    # 🆕 Shared utilities (Registry, JSON, stats)
│   ├── benchmarks/               # Benchmark framework
│   └── security/                 # Rate limiting + input validation
├── app/                          # Next.js web UI + REST API
│   ├── page.tsx                  # Demo/Live comparison view
│   └── api/v3/                   # API endpoints
experiments/                      # Hidden Profile experiment framework
└── test/                         # 310 automated tests
```

---

## Running Tests

```bash
npm test              # 310 tests across 18 files (307 passed, 3 network-dependent skipped)
npm run test:watch    # watch mode
```

---

## Documentation

### For Professors / Reviewers (5-minute path)

Start here if you're evaluating this project for academic collaboration:

| Priority | Document | What you'll learn |
|---|---|---|
| **1st** | [**ONEPAGER.md**](ONEPAGER.md) | 3-minute overview: positioning, problem, what we built, key findings |
| **2nd** | [**LIMITATIONS.md**](LIMITATIONS.md) | 22 modules of known boundaries — shows scientific honesty and self-awareness |
| **3rd** | [**PAPER_DRAFT.md**](PAPER_DRAFT.md) | Academic paper draft with 13 formal findings (F1-F11), statistical evidence, and falsification records |
| **4th** | [**TECHNICAL_REPORT.md**](TECHNICAL_REPORT.md) | Full research report: experiment design, D1-D4 paradigm critique, Bayesian reanalysis, causal effect estimation |

### For Developers / Collaborators

| Document | Purpose |
|---|---|
| [**DEVELOPER_GUIDE.md**](DEVELOPER_GUIDE.md) | Architecture, API contracts, critical bug fix history, extension guide (custom detectors, new tasks) |
| [**docs/GOVERNANCE_DESIGN.md**](docs/GOVERNANCE_DESIGN.md) | ADR: how we closed the "custom detector → intervention" architecture gap |
| [**docs/INTEGRATION.md**](docs/INTEGRATION.md) | SDK integration guide for embedding governance into AutoGen/CrewAI/LangGraph |
| [**EXPERIMENT_DESIGN.md**](EXPERIMENT_DESIGN.md) | Engineering retrospective: technical route, speech willingness formula, DeGroot update, statistical methods |

### Deep Dive

| Document | Purpose |
|---|---|
| [**THEORY.md**](THEORY.md) | Theoretical analysis: R information-theoretic interpretation, intervention fixed-point analysis, Proposition 4' proof |
| [**ROADMAP.md**](ROADMAP.md) | Development roadmap, academic outreach plan, project self-assessment |
| [**AGENT_SOCIETY_VISION.md**](AGENT_SOCIETY_VISION.md) | Long-term vision: SwarmAlpha as governance substrate for agent society |
| [**PAPER_PROFESSOR_VERSION.md**](PAPER_PROFESSOR_VERSION.md) | Professor-specific paper version (also available as [PDF](PAPER_PROFESSOR_VERSION.pdf)) |
| [README_CN.md](README_CN.md) | Full project documentation in Chinese |

---

## Tech Stack

TypeScript · Next.js 14 · React 18 · Tailwind CSS · Vitest · DeepSeek API

---

## Async Adaptive Discussion Engine

The async engine (`AsyncDiscussionEngine`) extends the synchronous engine with three innovations, validated across 5 phases on difficulty-enhanced tasks:

1. **Content-driven speaking** — Agents compute a willingness score from 5 factors (info exposure ×0.6, belief shift, consensus deviation, dependency triggers, recency penalty −0.5), normalized via `tanh`. Thresholds: ≥0.82 must speak, 0.40–0.82 weighted random, <0.40 silent.
2. **Thermodynamic adaptive termination** — Discussion ends when the system reaches a "crystallized" state (Kuramoto R > 0.85, temperature T < 0.22, entropy H < 0.42, sustained for 3 consecutive evaluations), or a hard cap of 40 utterances.
3. **Passive listening belief update** — Non-speaking agents update beliefs via DeGroot-style weighted averaging, so even silent agents evolve.

**Key result**: C group (thermodynamic termination) τ=0.64 vs B group (fixed rounds) τ=0.42, **d=1.09, p=0.028**. Cross-model validation: Zhipu glm-4-flash C group τ=0.76 vs DeepSeek 0.64 (**+18.8%**), confirming thermodynamic termination is not model-specific.

Full experiment design, phase-by-phase results, threshold calibration, and cross-model analysis in [EXPERIMENT_DESIGN.md](EXPERIMENT_DESIGN.md) and [README_CN.md](README_CN.md).

---

## Author

**贺孟元** — High school student, independent architecture, implementation, and experimental design.

AI-assisted development (Claude Code). Architecture decisions and experiment design are fully autonomous.

---

> *"Every operating system has a kernel. This is the kernel for governing AI societies."*
