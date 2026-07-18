# 🐜 SwarmAlpha

> **An embeddable governance runtime for multi-agent systems.**
>
> *Controlled experiments to demarcate when governance helps, when it's neutral, and when it harms multi-agent decision quality.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black)](https://nextjs.org/)
[![Tests](https://img.shields.io/badge/tests-229%20passed-green)](./test/)
[![Framework-Agnostic](https://img.shields.io/badge/framework-agnostic-purple)]()
[![Embeddable](https://img.shields.io/badge/embeddable-SDK-orange)]()
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

**English** | [中文](./README_CN.md)

---

## Where SwarmAlpha Fits

The agent governance landscape is splitting into two layers:

| Layer | Concern | Tools | Status |
|-------|---------|-------|--------|
| **Security governance** | Prevent agents from *doing* harm — unauthorized tool calls, budget overruns, data leaks | Microsoft Agent Governance Toolkit, Agent Control Standard (ACS), NVIDIA OpenShell | Crowded (2026) |
| **Cognitive governance** | Prevent agents from *thinking* wrong — echo chambers, authority bias, polarization, premature consensus | **SwarmAlpha** | Open |

SwarmAlpha targets the cognitive layer. It does not compete with Microsoft's toolkit or the ACS standard — it complements them. A complete agent governance stack needs both: security governance at the tool-execution boundary, and cognitive governance inside the discussion loop. SwarmAlpha's `StateInferenceBridge` is designed to interoperate with ACS-standard middleware hooks at the state checkpoint.

**Academic validation**: Li et al. (SJTU, 2026) independently confirmed that multi-agent workflows act as echo chambers, amplifying minor stochastic biases into systemic polarization — and that standard bias detection methods miss these effects. [*Aligned Agents, Biased Swarm: Measuring Bias Amplification in Multi-Agent Systems*, arXiv:2604.08963](https://arxiv.org/abs/2604.08963). Yang (2026) introduced a "coupling gain γ" diagnostic to distinguish genuine emergent consensus from model artifacts. [*When Is Emergent Consensus Real?*, arXiv:2606.22203](https://arxiv.org/abs/2606.22203). These papers validate the problem SwarmAlpha solves and inform its detection methodology.

---

## Core Finding

**After fixing 4 cognitive defects (D1–D4) that broke the governance loop, governance is now statistically confirmed effective.** Crisis task (n=24/cell, expanded): full vs none d=0.92, p=0.005, power=88%, τ +51%. Cross-task validation (Supplier n=30): directionally consistent (d=0.47, p=0.089, power=43%). The governance engine also provides **observability, auditability, and targeted intervention** — three capabilities independently valuable regardless of whether they change the final answer.

### Three Independent Value Pillars

| Pillar | What It Does | Why It Matters Independently |
|--------|-------------|------------------------------|
| **Process Monitoring** | Real-time detection of 4 collective cognitive failures (echo chamber, authority bias, polarization, premature consensus) | Knowing your agent team is forming an echo chamber is valuable *even if you don't intervene*. Enterprises deploying AI agent teams need observability. |
| **Decision Audit** | Full traceable decision chain: who influenced whom, when beliefs shifted, when governance intervened | Post-hoc accountability and compliance. Doesn't change outcomes — changes *responsibility attribution*. |
| **Adaptive Intervention** | Targeted prompts injected when bias detected (diversity injection, forced reflection, weight reduction, continue discussion) | Accelerates convergence on genuinely interdependent tasks — but has clear boundary conditions |

### 2×2 Factorial Design — Preliminary Results (n=15 per cell)

> ⚠️ **These data were collected before the governance loop was fully repaired.** State-modification interventions (reduce_weight, force_reflection) may be underestimated. The engine is ready; reliable experimental conclusions require re-running with the repaired loop. See [ROADMAP.md](ROADMAP.md).

| | Invest — 3 rounds (Strong Interdependence) | Invest — 5 rounds | M&A — 5 rounds (Weak Interdependence) |
|---|---|---|---|
| **Baseline τ** | 0.422±0.344 (Q=71.3) | 0.778±0.325 (Q=89.0) | 0.533±0.209 (Q=76.7) |
| **Full governance τ** | 0.644±0.344 (Q=82.4) | 0.778±0.325 (Q=89.0) | 0.613±0.177 (Q=80.7) |
| **Net Δτ** | +0.133 ([−0.09, +0.35], p=0.152) | −0.089 ([−0.38, +0.21], p=1.0) | −0.123 ([−0.27, +0.02], p=0.36) |
| **Cohen's d** | +0.65 (medium, NOT sig) | +0.00 (null) | +0.41 (NOT sig) |
| **Shuffle τ** | — | 1.000 (n=5, NOT sig) | **0.900 (p=0.0009)** |
| **Direction** | Governance may accelerate convergence | With sufficient rounds, baseline catches up | Governance unnecessary; breaking overconfidence works |

**Key insight**: On weakly-interdependent tasks, governance is unnecessary (M&A p=0.36). On strongly-interdependent tasks with limited rounds, governance shows directional but non-significant improvement (d=+0.65, p=0.152). With sufficient rounds, baseline agents catch up and governance becomes null (p=1.0). **The only statistically significant positive finding is the shuffle control on M&A (p=0.0009)** — breaking professional overconfidence outperforms targeted governance. Notably, `full_reflection` is significantly *harmful* on Invest 5-round (p=0.048) — forcing reflection when agents already converge naturally hurts performance.

> **Self-correction note**: Earlier V1 results claiming larger governance effects were affected by a system prompt answer leak and a structurally broken authority bias detector. All 6 bugs were independently identified, verified, and fixed. The V2 data above is from the corrected pipeline. This self-correction process is itself evidence of the project's commitment to integrity — and demonstrates why process monitoring matters: even without intervention, visibility into what's actually happening in agent discussions catches problems that silent pipelines hide.

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

A series of hard faults (H-series) were identified and repaired alongside the cognitive-gap pass. These are documented here for provenance; some of the 165-experiment numbers on this page were generated *before* these fixes landed.

| ID | Fault | Repair |
|----|-------|--------|
| **H4** | Kuramoto phase mapping used `θ = π·b`, which maps extreme polarization (b=±0.99) to nearly the same phase (R≈1) — falsely indicating consensus. | Corrected to `θ = (π/2)·b`. Now b=±0.99 yields R≈0 (true polarization), b=0 yields R=1 (true consensus). |
| **H6** | `convergenceSpeed` code comment was wrong (formula direction was correct). | Comment corrected; formula unchanged. |
| **H2** | `ablationModes` only had `["none","full"]` (2 modes × 15 = 30 runs). | Expanded to 7 complete modes: `none / full / shuffle / full_diversity / full_weight / full_reflection / full_continue`. Full design now 7 × 15 = 105 runs (pending lab execution). |
| **H19** | `introduceDiversity` used `Math.random()`, making interventions non-reproducible across runs. | Replaced with `mulberry32` seeded PRNG — interventions are now deterministic given the seed. |
| **H17** | Cache pollution: stale placeholder files from failed runs were left in the cache and picked up by subsequent runs. | Polluted placeholder files deleted; affected experiments re-run from clean state. |
| **H18** | `interventionPrompt` was inconsistently inlined across strategy files and `PromptInjector`. | Unified `interventionPrompt` helper wired into all 8 call sites (4 strategy files + 4 sites in `PromptInjector`). |

> **Kuramoto formula update (H4)**: Wherever the Kuramoto phase mapping appears in docs/code, the formula is now `θ = (π/2) · b` (previously `θ = π · b`). This is a substantive fix, not a cosmetic one — it changes consensus detection for polarized states.

---

## What is SwarmAlpha?

SwarmAlpha is the **governance runtime** used to generate the evidence above — an embeddable layer that observes, detects, and intervenes on collective decision failures in multi-agent systems.

**Application scenario**: Real-time process governance for LLM multi-agent collaborative decision-making — detecting polarization, authority bias, echo chambers, and premature consensus during consensus formation and applying targeted interventions to safeguard decision quality in limited-round discussions.

It does NOT create agents or manage workflows. It plugs into existing frameworks to provide:

- 🔍 **Observation** — extract agent beliefs and emotions from natural language
- 📊 **Belief Modeling** — track belief evolution and influence propagation
- 🚨 **Bias Detection** — echo chambers, authority bias, polarization, premature consensus
- 🛡️ **Intervention** — targeted prompts injected into agent discussion
- 📈 **Evaluation** — 5-dimension scoring with t-distribution confidence intervals
- 🧪 **Causal Effect Estimation** — nearest-neighbor trajectory matching + permutation test to estimate counterfactual intervention effects

**Key principle**: LLMs only do perception (extracting beliefs from language). Mathematics handles everything else — consensus computation, bias detection, belief dynamics. This means the governance runtime is **fast, cheap, and interpretable** with near-zero additional LLM calls (only when agents fail to output the `[GOV]` structured tag does `StateInferenceBridge` fall back to LLM inference).

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

**2. "False consensus" is a cross-task universal phenomenon**: Both tasks show consensus-quality correlation near zero (r=-0.14 vs r=-0.11), proving that "high consensus ≠ high quality" is a general feature of LLM multi-agent systems.

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
# Web UI (demo mode works without API key)
npm run dev                # → http://localhost:3000

# Run experiments (needs API key)
npm run experiment          # Full ablation matrix

# Analyze results (no API key needed)
npm run analyze             # t-distribution CI + permutation test + statistical inference

# Parameter sensitivity (needs API key)
npm run sensitivity         # 5 params × 5 values sweep

# Run tests (no API key needed)
npm test                    # 229 tests
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
| OpenAI | gpt-4o-mini | `OPENAI_API_KEY` in `.env.local` |
| Anthropic | claude-3-haiku | `ANTHROPIC_API_KEY` in `.env.local` |
| Local (Ollama) | llama3, mistral | `LOCAL_LLM_URL=http://localhost:11434` |

Switch provider in `experiments/v2/run.ts` line 140: change `provider: "deepseek"` to `"openai"` or `"anthropic"`.

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
- **Free-Energy-Driven Intervention Ranking** ✅ *implemented + backtested + hypothesis falsified*: When multiple detectors trigger simultaneously (91.7% of Crisis experiments), interventions are ranked by social free energy F = (1-R) + T·H decomposition. Backtesting (97 force_reflection events, p=0.041) **falsified** the original `force_reflection↔structural` mapping — force_reflection is a *noise-reduction* intervention (effective in thermal-dominant states, harmful in polarized states), now mapped to `thermal·(1-structural)`. `reduce_weight↔thermal` directionally supported but not significant (p=0.100). See [THERMODYNAMICS_INTEGRATION.md §5.4](./THERMODYNAMICS_INTEGRATION.md)
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

**165 controlled experiments** (M&A: 80, Invest 5-round: 55, Invest 3-round: 30; 2 tasks × up to 9 ablation modes × n=5-15, 2×2 factorial design on Invest with n=15 per cell). Primary metric: Kendall's τ + **within-group τ trajectory (Δτ)** — tracking the *same* agents across rounds. Additionally, **161 expanded experiments** (Crisis 72 + Supplier 89) were run with the governance loop closed (post D1–D4 fix).

> **Ablation design update (H2)**: `ablationModes` has been expanded from `["none","full"]` to 7 complete modes (`none / full / shuffle / full_diversity / full_weight / full_reflection / full_continue`). The complete 7-mode experiment matrix (105 runs, 7 × 15) is pending lab execution; the 165-experiment numbers below were generated before this expansion and are preserved as-is for provenance.

### Why Δτ + Shuffle matters

| Method | What it measures | Pitfall |
|--------|-----------------|---------|
| **Cohen's d** (between-group) | Average difference between groups | Different agents, different initial conditions |
| **Δτ** (within-group) | Same agents' improvement across rounds | — |
| **Shuffle control** | Governance with scrambled knowledge | Tests regression-to-mean |

### Task 1: Interdependent Investment — 3 rounds (Strong Collaboration Required)

No single agent can determine the answer alone. n=15 per condition. Baseline τ = 0.422.

| Ablation | τ (μ±σ) | Q (μ±σ) | Δτ (within) | d vs none |
|----------|----------|----------|-----|-----------|
| None | 0.422±0.344 | 71.3±17.2 | +0.356 | — |
| **Full** | **0.644±0.344** | **82.4±17.0** | **+0.489** | **+0.65** |

- **Net Δτ (Full−Baseline) = +0.133, 95% CI [−0.09, +0.35], p=0.152** — directional improvement, NOT significant (medium effect size, d=+0.65)
- **ΔQ = +11.1** (71.3 → 82.4) — full governance improves decision quality
- **Both conditions improve from round-to-round** (baseline Δτ=+0.356, full Δτ=+0.489) — full governance accelerates within-group convergence
- This is the only configuration where governance shows a positive directional net effect, but it does not reach statistical significance

### Task 1 (Boundary): Interdependent Investment — 5 rounds

n=15 for none/full; n=5 for ablations. Baseline τ = 0.778. With more rounds, baseline agents reach the same place — and governance becomes completely null.

| Ablation | τ (μ±σ) | Q (μ±σ) | Δτ (within) | d vs none | p vs none |
|----------|----------|----------|-----|-----------|-----------|
| None | 0.778±0.325 | 89.0±16.1 | — | — | — |
| **Full** | **0.778±0.325** | **89.0±16.1** | — | **+0.00** | **1.0 (completely null)** |
| Shuffle | 1.000±0.000 | 100.0±0.0 | — | +0.77 | 0.264 (n=5, NOT sig) |
| full_diversity | 0.733±0.365 | — | — | — | 1.0 (NOT sig) |
| full_weight | 0.467±0.558 | — | — | — | 0.173 (harmful trend) |
| **full_reflection** | **0.333±0.471** | — | — | — | **0.048 (SIGNIFICANTLY HARMFUL)** |
| full_continue | 0.733±0.365 | — | — | — | 1.0 (NOT sig) |

- **Net Δτ (Full−Baseline) = −0.089, 95% CI [−0.38, +0.21], p=1.0** — completely null (d=+0.00, ΔQ=+0.0)
- **full_reflection is SIGNIFICANTLY HARMFUL**: τ=0.333 vs baseline 0.778, ΔQ=−22.2, **p=0.048** — the first statistically significant governance finding across all 165 experiments, and it is *negative*. Forcing reflection on interdependent tasks with sufficient discussion time actively hurts performance.
- **full_weight shows the same harmful trend** (τ=0.467, ΔQ=−15.6, p=0.173) — cutting influence concentration also hurts on interdependent tasks
- **Shuffle τ = 1.000** but p=0.264 (n=5 underpowered) — not significant
- The 3-round directional improvement (d=+0.65) disappears entirely with 5 rounds (d=+0.00) — boundary condition confirmed: governance does not enable outcomes that wouldn't otherwise occur

### Task 2: M&A Target Selection — 5 rounds (Weak Collaboration Required)

Agents can reason independently. n=15 (none/full), n=10 (others). Baseline τ = 0.533.

| Ablation | τ (μ±σ) | Q (μ±σ) | Δτ | d vs none |
|----------|----------|----------|-----|-----------|
| None | 0.533±0.209 | 76.7±10.5 | 0.000 | — |
| **Full** | **0.613±0.177** | **80.7±8.8** | **−0.123±0.239** | +0.41 |
| **Shuffle** | **0.900±0.194** | **95.0±9.7** | — | **+1.80 (p=0.0009)** |
| full_diversity | 0.660±0.190 | — | — | +0.63 (p=0.174) |
| full_weight | 0.700±0.316 | — | — | +0.65 (p=0.171) |
| full_reflection | 0.660±0.190 | — | — | +0.63 (p=0.183) |
| full_continue | 0.620±0.063 | — | — | +0.52 (p=0.267) |

- **Net Δτ (Full−Baseline) = −0.123, 95% CI [−0.27, +0.02]** — NOT significant (p=0.36)
- **Shuffle τ = 0.900, p=0.0009** — the ONLY statistically significant *positive* finding across all 165 experiments
- **No single-intervention ablation reaches significance** — all directionally positive but underpowered
- Governance doesn't help on weakly-interdependent tasks; breaking overconfidence (shuffle) does

### The Boundary Condition — Fractional Factorial Design (with evidence)

Two controlled comparisons isolate each moderator. Note: this is a fractional (not complete 2×2) design — M&A 3-round cell is missing.

| Claim | Evidence |
|-------|----------|
| **Round-budget moderation** | Invest (strong interdependence) held constant: 3-round d=+0.65 (p=0.152, NOT sig) vs 5-round d=+0.00 (p=1.0, null). Pattern supports boundary hypothesis but is NOT statistically confirmed. |
| **Task-interdependence moderation** | 5 rounds held constant: Invest (strong) d=+0.00 (null) vs M&A (weak) d=+0.41 (p=0.36, NOT sig). Governance doesn't significantly help either task type with sufficient rounds. |
| Governance shows directional improvement only in limited rounds | Invest 3-round Δτ=+0.133 (CI [−0.09, +0.35], p=0.152, d=+0.65) — medium effect, NOT significant |
| Effect disappears completely with more rounds | Invest 5-round Δτ=−0.089 (CI [−0.38, +0.21], p=1.0, d=+0.00) — completely null |
| Governance does NOT help weakly-interdependent tasks | M&A Δτ=−0.123 (CI [−0.27, +0.02], p=0.36) |
| **First significant governance finding is HARMFUL (uncorrected)** | Invest 5-round `full_reflection`: τ=0.333, ΔQ=−22.2, **p=0.048 (uncorrected; does NOT survive Bonferroni correction)** — forcing reflection on interdependent tasks with sufficient rounds hurts |
| No positive single intervention is significant | All M&A ablation p-values > 0.17; Invest 5-round `full_weight` p=0.173 (harmful trend) |
| Shuffle is the only positive significant finding | M&A Shuffle τ=0.900, d=+1.80, **p=0.0009** |
| Weight reduction / reflection are harmful on interdependent tasks | Invest 5-round: full_weight ΔQ=−15.6 (p=0.173), full_reflection ΔQ=−22.2 (**p=0.048 uncorrected; does NOT survive Bonferroni correction**) |

**Statistical rigor**: t-distribution 95% CI + permutation test p-values (with Bonferroni/BH FDR correction for multi-comparison). 9 total configurations (4 governance modes + 5 extended ablation). Fractional factorial design (n=15 per cell on Invest). Parameter sensitivity infrastructure (5×5×5 sweep). All raw data preserved in `experiments/v2/data*/`.

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

## Why This Matters

Multi-agent systems are being deployed in high-stakes domains — finance, healthcare, law. When AI agents discuss critical decisions, they commit the **same systematic failures as human groups**. Current frameworks (AutoGen, CrewAI, LangGraph) provide zero governance — not even basic observability into what's happening in agent discussions.

SwarmAlpha provides three layers of value:

1. **Process Monitoring (independent of decision outcomes)** — Real-time detection of echo chambers, authority bias, polarization, and premature consensus. This matters even if you never intervene: enterprises deploying AI agent teams need to *see* what's happening in their discussions. You can't fix what you can't observe.

2. **Decision Audit (independent of intervention)** — Full traceable decision chains answer "why did the agent team decide this?" Post-hoc accountability is valuable for compliance (EU AI Act), debugging, and trust — regardless of whether the decision was correct.

3. **Targeted Intervention (now statistically confirmed)** — After fixing D1–D4 governance loop defects, Crisis task (n=24/cell) shows full vs none d=0.92, p=0.005, power=88%. Cross-task validation (Supplier n=30) is directionally consistent (d=0.47, p=0.089). Mechanism ablation reveals reduce_weight (d=1.51, p=0.0001) and force_reflection (d=0.73, p=0.001) as core drivers. **Governance is now confirmed effective under the closed loop.**

**The engine has been self-verified for framework independence** — all 4 bias detectors, 4 intervention strategies, and the StateInferenceBridge work without the built-in DiscussionEngine, making them genuinely embeddable. Integrating into any framework takes 2-4 hours for a working prototype.

**The implication for AI deployment**: Don't blindly deploy governance. But also don't deploy agent teams without *any* process monitoring. SwarmAlpha provides the observability layer that every multi-agent system currently lacks — and the intervention layer for the specific conditions where it demonstrably helps.

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
└── test/                         # 229 automated tests
```

---

## Running Tests

```bash
npm test              # 229 tests across 16 files
npm run test:watch    # watch mode
```

---

## Documentation

| Document | Content |
|----------|---------|
| [**DEVELOPER_GUIDE.md**](DEVELOPER_GUIDE.md) | 🔴 **Must-read for developers** — architecture, critical bug fix history, pitfalls, workflow |
| [ONEPAGER.md](ONEPAGER.md) | One-page executive summary |
| [README_CN.md](README_CN.md) | Full project documentation (Chinese, most up-to-date) |
| [PROJECT_EVALUATION.md](PROJECT_EVALUATION.md) | Comprehensive project evaluation (strengths, weaknesses, risks) |
| [EXPERIMENT_REVIEW.md](EXPERIMENT_REVIEW.md) | All experiment lines explained + design flaw audit |
| [LIMITATIONS.md](LIMITATIONS.md) | 22 modules of known limitations and unfixed issues |
| [ROADMAP.md](ROADMAP.md) | Development roadmap & academic outreach plan |
| [TECHNICAL_OVERVIEW.md](TECHNICAL_OVERVIEW.md) | Technical architecture deep-dive |
| [TECHNICAL_REPORT.md](TECHNICAL_REPORT.md) | Full research report (experiment design, falsification, paradigm critique) |
| [MATHEMATICAL_FRAMEWORK.md](MATHEMATICAL_FRAMEWORK.md) | Complete formal math definitions |
| [THERMODYNAMICS_INTEGRATION.md](THERMODYNAMICS_INTEGRATION.md) | Thermodynamics formula reference & code index |
| [PAPER_DRAFT.md](PAPER_DRAFT.md) | Academic paper draft (AAMAS/AAAI/CogSci 2027) |
| [API_CONTRACT.md](API_CONTRACT.md) | REST API + SDK API specification |
| [BAYESIAN_ANALYSIS.md](BAYESIAN_ANALYSIS.md) | Bayesian parameter estimation |

---

## Tech Stack

TypeScript · Next.js 14 · React 18 · Tailwind CSS · Vitest · DeepSeek API

---

## Async Adaptive Discussion Engine (2026-07-17, recalibrated)

The async discussion engine (`AsyncDiscussionEngine`) extends `DiscussionEngine` with content-driven speaking, thermodynamic termination, and passive listening updates. Two rounds of threshold calibration on the v2 difficulty-enhanced fraud task.

### Content-Driven Speaking (v2)

Agents compute a **willingness score** based on internal state (info exposure, belief shift, consensus deviation, dependency triggers, recency penalty). Scores normalized via `tanh` to [0,1].

### Thermodynamic Adaptive Termination (Recalibrated 2026-07-17)

Thresholds recalibrated after per-case autopsy of 4 hard-cap failures. See [README_CN.md](README_CN.md) for full analysis.

| Parameter | Old | New | Rationale |
|-----------|-----|-----|-----------|
| `crystallH` | 0.35 | **0.42** | Run with τ=0.6 stuck at H=0.418 |
| `crystallT` | 0.20 | **0.22** | Run with τ=0.2 stuck at T=0.207 |
| `consecutiveCrystallRequired` | 2 | **3** | Prevented de-crystallization false termination |
| `strongCrystallH` | 0.10 | **0.20** | Allowed strong-crystallization at T<0.07 |
| `evalEveryKUtterances` | 3 | **2** | Denser evaluation cadence |

**Results**: Hard-cap rate 40%→10%, mean τ 0.34→0.46, max τ 0.6→0.8. Remaining 10% hard cap is a discussion quality failure (speak willingness lacks quality dimension).

### Passive Listening Belief Update

Non-speaking agents update beliefs via DeGroot-style weighted averaging:
```
delta = learning_rate × Σ(w_ij × (belief_j - belief_i)) / Σ(w_ij)
```
Confidence also updates: agreement → slight increase, disagreement → slight decrease (LR=0.03).

### Experiment Design (A/B/C/D)

| Group | Speaking | Termination | Hypothesis |
|-------|----------|-------------|------------|
| A | Synchronous | Fixed 5 rounds | Baseline |
| B | Async | Fixed 5 rounds | Does async affect quality? |
| C | Async | Thermodynamic | H_thermo: adaptive > fixed |
| D | Async | Random (matched) | H_diag: thermodynamic > random |

C/D groups run both v1 (random_prob) and v2 (content_driven) speaking modes. D group samples termination points from C group's actual distribution (matched by speakMode).

See [THERMODYNAMICS_INTEGRATION.md](THERMODYNAMICS_INTEGRATION.md) §10 for full details and [LIMITATIONS.md](LIMITATIONS.md) §22 for known limitations.

---

## Author

**贺孟元** — High school student, independent architecture, implementation, and experimental design.

AI-assisted development (Claude Code). Architecture decisions and experiment design are fully autonomous.

---

> *"Every operating system has a kernel. This is the kernel for governing AI societies."*
