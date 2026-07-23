# SwarmAlpha

> **A research platform for cognitive governance of multi-agent systems — observation, bias detection, intervention, and evaluation as an independent layer above the A2A protocol.**

[![Tests](https://img.shields.io/badge/tests-310-green)](./test/)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

**English** | [中文](./README_CN.md)

---

## 1. What is SwarmAlpha?

SwarmAlpha is a **research platform for multi-agent cognitive governance**. It does NOT build agents or manage workflows. Instead, it provides a governance layer that observes agent discussions, detects collective cognitive failures, and intervenes — all with **zero additional LLM calls** (mathematics handles everything; LLMs only do perception).

**Long-term vision**: the governance layer above the [A2A protocol](https://github.com/google/A2A), as described in [AGENT_SOCIETY_VISION.md](AGENT_SOCIETY_VISION.md).

---

## 2. Core Findings: Governance Boundary Conditions

After fixing 4 cognitive defects (D1–D4) that broke the governance loop, 169 closed-loop experiments across 2 tasks reveal:

| Condition | When Governance Works | When It's Neutral | When It's Harmful |
|---|---|---|---|
| **Hard tasks** (Crisis, baseline τ=0.41) | ✅ d=0.92, p=0.005, τ +51% | — | — |
| **Easy tasks** (Supplier, baseline τ=0.68) | — | ⚠️ d=0.47, p=0.089 (underpowered, 43%) | Ceiling effect: shuffle d=0.09 |
| **Structural intervention** (shuffle) | ✅ d=1.44 on Crisis (p<0.001) | d=0.09 on Supplier (easy task) | — |
| **Procedural intervention** (force_reflection) | ✅ 79.4% effective (27/34 events) | — | ⚠️ Backfire in polarized states (F-decomposition analysis) |
| **Intervention count** | — | — | r=−0.55 with decision quality (dependency-chain cascades) |

**Three cross-task findings** (169 experiments, Crisis 80 + Supplier 89):

1. **False consensus** — consensus-quality correlation r≈−0.10 across all tasks. "High agreement" does not mean "good decision."
2. **Structural > procedural** — Re-assigning agent knowledge (shuffle d=1.44) dominates in-discussion interventions (governance d=0.92) on hard tasks.
3. **Task difficulty is the master switch** — Governance effectiveness is bounded by task difficulty (ceiling effect on easy tasks, significant on hard tasks).

> **Historical note**: 120 earlier experiments were collected with a broken governance loop (D1–D4). The prior "governance is ineffective" conclusion was a loop artifact. These data are retained for provenance but explicitly labeled as provisional. The 169 closed-loop runs above are the primary evidence.

---

## 3. Quick Start

### Install & Configure

```bash
git clone https://github.com/mulasakee17/meeting-room.git
cd meeting-room
npm install
cp .env.local.example .env.local
# Edit .env.local — add at least one API key (DeepSeek recommended, ~$0.01/run)
```

### Run in 30 Seconds

```bash
npm run demo          # Pure local governance engine demo (no API key)
npm run dev           # Web UI at http://localhost:3000 (demo mode works offline)
npm test              # 310 tests (307 passed, 3 network-dependent skipped)
```

### Run Experiments

```bash
npm run experiment    # Full ablation matrix (needs API key)
npm run analyze       # Statistical analysis of results (no API key)
npx tsx experiments/v2/verify_audit.ts   # Third-party audit verification (no API key)
```

### Use as an SDK

```typescript
import { GovernanceRuntime } from "@/runtime";

const runtime = new GovernanceRuntime({ maxRounds: 5, governanceMode: "full" });
const result = runtime.processRound(messages);
if (result.hasIntervention) {
  await applyInterventionToYourAgents(result.interventions[0]);
}
```

| Provider | Model | Cost/run |
|----------|-------|----------|
| DeepSeek (default) | deepseek-chat | ~$0.01 |
| Zhipu | glm-4-flash | ~$0.01 |
| OpenAI | gpt-4o-mini | ~$0.10 |
| Local (Ollama) | llama3, mistral | Free |

---

## 4. Governance Runtime — Capabilities

| Capability | Description | Status |
|---|---|---|
| **7 Bias Detectors** | Echo chamber, authority bias, polarization, premature consensus + 3 MAST detectors (information withholding, ignored input, reasoning-action mismatch) | ✅ Built-in; MAST detectors not yet experimentally triggered |
| **4 Intervention Strategies** | Reduce weight, force reflection, introduce diversity, continue discussion; ranked by free-energy decomposition F=(1−R)+T·H | ✅ Built-in; diversity & continue disabled by default (low effectiveness) |
| **4 Governance Modes** | none / detect-only / full / random-intervene + 5 extended ablation modes (shuffle, full_diversity, etc.) | ✅ Built-in |
| **Adaptive Thresholds** | Auto-calibrate detection thresholds from task context | 🔧 Implemented, not yet experimentally validated |
| **Adaptive Dosage** | Intervention strength scales with deviation severity | 🔧 Implemented, not yet experimentally validated |
| **5-Dimension Evaluation** | Consensus, reliability, dispersion, stability, influence analysis | ✅ Built-in; weights are heuristic |
| **Cross-Examination Engine** | PRO/CON camps → adversarial debate → verdict synthesis | ✅ Built-in + unit-tested |
| **Causal Effect Estimation** | Nearest-neighbor trajectory matching + permutation test + bootstrap CI | ✅ Built-in |
| **Audit Infrastructure** | SHA-256 manifest + third-party verifiable governance trace (detectionMetrics, effectMetrics, parameters) | ✅ Built-in; 1 experiment with full audit fields |
| **Custom Detector API** | Register new bias detectors without modifying core engine | ✅ Built-in |
| **Scalable Topology** | Flat → Grouped → Committee discussion structures | 🔧 GroupedTopology implemented, not yet tested |

---

## 5. Key Experimental Evidence

**445 controlled experiments** (manifest-verified 2026-07-23) across 2 tasks, 3 conditions, 9 governance configurations.

### Dual-Task Comparison (Primary Evidence)

| Metric | Crisis (hard, n=24/cell) | Supplier (easy, n=30/cell) | Cross-Task |
|--------|--------------------------|----------------------------|------------|
| **none** τ | 0.408 ± 0.182 | 0.680 ± 0.186 | — |
| **full** τ | 0.617 ± 0.263 | 0.767 ± 0.183 | — |
| **shuffle** τ | 0.717 ± 0.243 | 0.697 ± 0.204 | Task-dependent |
| **Governance Δτ** | **+0.209** | **+0.087** | ✅ Direction consistent |
| **Governance d** | 0.92 (p=0.005) | 0.47 (p=0.089) | ✅ Direction consistent |
| **Power** | 88% ✅ | 43% ⚠️ | Supplier needs n=72 for 80% |
| **Consensus-Quality r** | −0.137 | −0.107 | ✅ Both ≈ 0 |

**Async engine** (thermodynamic termination): C group τ=0.64 vs B group τ=0.42, d=1.09, p=0.028. Cross-model: Zhipu C group τ=0.76 (+18.8% vs DeepSeek).

**Conclusion**: Governance improves decision quality on hard tasks (statistically confirmed), shows direction-consistent improvement on easy tasks (underpowered), and has clear boundary conditions — task difficulty is the master switch. Structural rearrangement (shuffle) can dominate procedural governance. Intervention count is negatively correlated with decision quality (r=−0.55), suggesting dependency-chain backfire risk.

> Full experiment data, statistical methods, and per-intervention breakdown in [TECHNICAL_REPORT.md](TECHNICAL_REPORT.md). Causal effect estimation in [experiments/v2/causalAnalysis.ts](experiments/v2/causalAnalysis.ts).

---

## 6. Architecture

```
┌──────────────────────────────────────────────┐
│   Multi-Agent Discussion (Custom / A2A*)       │
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
│   │  Bias Detection (7 types)            │    │
│   │     ↓                                │    │
│   │  Free-Energy Intervention Ranking    │    │
│   │     ↓                                │    │
│   │  Decision Evaluation (5 dimensions)  │    │
│   └─────────────────────────────────────┘    │
│                                               │
│  Framework-Agnostic · Embeddable · Reproducible│
└──────────────────────────────────────────────┘
```

---

## 7. Project Structure & Documentation

```
src/
├── runtime/              # Embeddable Governance Runtime (SDK)
├── lib/
│   ├── governance/       # 7 bias detectors + 4 intervention strategies
│   ├── evaluation/       # 5-dimension scoring engine
│   ├── observation/      # LLM output parsing
│   ├── inference/        # Belief evolution computation
│   ├── discussion/       # Sync + async multi-round engines
│   ├── analysis/         # Causal effect estimation (trajectory matching)
│   ├── llm/              # Multi-provider LLM abstraction
│   └── utils/            # Shared utilities (PRNG, JSON, stats)
experiments/v2/           # 445 experiments + analysis scripts + audit tools
test/                     # 310 automated tests
```

### Document Index

**For professors / reviewers (5-minute path)**:

| Order | Document | Content |
|-------|----------|---------|
| 1st | [ONEPAGER.md](ONEPAGER.md) | 3-minute overview: positioning, problem, key findings |
| 2nd | [LIMITATIONS.md](LIMITATIONS.md) | 25 sections of known boundaries — scientific honesty |
| 3rd | [PAPER_DRAFT.md](PAPER_DRAFT.md) | Academic paper draft with 13 formal findings |
| 4th | [TECHNICAL_REPORT.md](TECHNICAL_REPORT.md) | Full research report: design, D1-D4 critique, Bayesian reanalysis |

**For developers**:

| Document | Content |
|----------|---------|
| [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) | Architecture, API contracts, bug fix history, extension guide |
| [EXPERIMENT_DESIGN.md](EXPERIMENT_DESIGN.md) | Technical route: speech willingness formula, DeGroot update, statistical methods |
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | SDK integration guide |

**Deep dive**:

| Document | Content |
|----------|---------|
| [THEORY.md](THEORY.md) | Theoretical analysis: R, T, H, F derivations, intervention fixed-point analysis |
| [ROADMAP.md](ROADMAP.md) | Development roadmap, academic outreach plan, self-assessment |
| [AGENT_SOCIETY_VISION.md](AGENT_SOCIETY_VISION.md) | Long-term vision: governance substrate for agent society |
| [PAPER_PROFESSOR_VERSION.md](PAPER_PROFESSOR_VERSION.md) | Professor-specific paper version |
| [README_CN.md](README_CN.md) | Full project documentation in Chinese |

---

## 8. Known Limitations & Honest Declarations

### What this project does NOT claim

- **Not a production system** — 445 experiments, single-digit sample sizes per cell. Statistical significance ≠ practical reliability.
- **Not a multi-framework adapter** — All experiments use the built-in `CustomAgent`. AutoGenAdapter is a demo only. CrewAI/LangGraph are removed from roadmap.
- **Not a safety tool** — Detects cognitive biases, not security threats. Does not prevent agents from executing harmful actions.
- **Not empirically calibrated** — Adaptive thresholds/dosage exist in code but have zero experimental validation. Evaluation weights are heuristic.

### Key limitations (see [LIMITATIONS.md](LIMITATIONS.md) for all 25 sections)

| Limitation | Impact | Mitigation |
|---|---|---|
| Single-model bias (391/445 DeepSeek) | Findings may not generalize | 54 cross-model runs (Zhipu/Qwen) show directional consistency |
| Small sample (n=24–30/cell) | Limited statistical power | Supplier task at 43% power; needs n=72 for 80% |
| Only 2 tasks | Task diversity limited | 3rd task planned for lab execution |
| 120 historical experiments with broken governance loop | Confounds early conclusions | Explicitly labeled as provisional; 169 closed-loop runs are primary evidence |
| MAST detectors (FM-2.4/2.5/2.6) never triggered in experiments | 0 empirical validation | Requires v2 trace experiments with audit fields |
| 1 experiment with full audit fields (detectionMetrics + effectMetrics) | Audit infrastructure sample insufficient | Needs 10+ new experiments for statistical meaning |
| `full_reflection` p=0.048 finding was RETRACTED | Obtained under broken loop (D1–D4) | Crisis re-validation: 79.4% effective (27/34), direction reversed |

### Academic integrity

- All experimental data are preserved in `experiments/v2/data*/` and verifiable via SHA-256 manifest (`audit_manifest.json`)
- Third-party audit: `npx tsx experiments/v2/verify_audit.ts` verifies file integrity and detection logic consistency
- All statistical methods use deterministic PRNG seeds (PERMUTATION_SEED=42, BOOTSTRAP_SEED=42+0x5EED) for reproducibility
- No statistics in this document are fabricated — every number is traceable to raw data or source code

---

## 9. Author & License

**Author**: 贺孟元 — independent architecture, implementation, and experimental design.

**License**: MIT — see [LICENSE](LICENSE) for details.

**Tech Stack**: TypeScript · Next.js 14 · React 18 · Tailwind CSS · Vitest · DeepSeek / Zhipu / Qwen API

---

## Appendix: Detailed History

The following sections are preserved for provenance but are not essential for first-time readers. They document the project's self-correction process — arguably the most valuable research contribution.

<details>
<summary><b>Click to expand: Cognitive Gap Diagnosis & Repair (D1–D4)</b></summary>

A diagnostic pass identified four root cognitive gaps in the multi-agent discussion paradigm:

| # | Cognitive Gap | Symptom | Repair |
|---|---------------|---------|--------|
| **D1** | State awareness missing | `buildPrompt` did not inject belief/confidence → interventions invisible to LLM | Prompt now injects current state |
| **D2** | No conversation history | Agents couldn't see their own prior statements | Personalized memory: own history + @-mentions |
| **D3** | Synchronous turn-taking | `Promise.all` → agents couldn't see same-round peers | Sequential `for` loop |
| **D4** | Fabricated influence network | Edges inferred from numeric belief differences → phantom graph | Edges built only from explicit `referencedAgents` |

**Implication**: The 120 historical experiments were collected while all four gaps were present. State-modification interventions (reduce_weight, force_reflection) never reached agent perception. The prior "governance is ineffective" conclusion was a loop artifact. See [TECHNICAL_REPORT.md §2](TECHNICAL_REPORT.md) for the full analysis.

</details>

<details>
<summary><b>Click to expand: Hard-Fault Fixes (H-series)</b></summary>

Six hard faults (H2, H4, H6, H17, H18, H19) were identified and repaired. Notable: H4 corrected the Kuramoto phase mapping from θ=π·b to θ=(π/2)·b — a substantive fix that changes consensus detection for polarized states. Full table in [DEVELOPER_GUIDE.md §5.3](DEVELOPER_GUIDE.md#53-数学-bug).

</details>

<details>
<summary><b>Click to expand: Historical 120-Experiment Summary</b></summary>

These experiments were collected *before* the D1–D4 governance-loop fix. Preserved as provenance; not the primary evidence.

- **Invest 3-round**: governance d=+0.65 (p=0.152, NOT sig)
- **Invest 5-round**: governance d=+0.00 (p=1.0) — completely null
- **M&A 5-round**: governance d=+0.41 (p=0.36); **shuffle d=+1.80 (p=0.0009)**
- **`full_reflection` on Invest 5-round**: p=0.048 (uncorrected) — ⚠️ RETRACTED (broken loop)

Full ablation tables in [TECHNICAL_REPORT.md §2.5](TECHNICAL_REPORT.md).

</details>

<details>
<summary><b>Click to expand: Async Adaptive Discussion Engine</b></summary>

The async engine (`AsyncDiscussionEngine`) introduces three innovations:

1. **Content-driven speaking** — Willingness score from 5 factors (info exposure ×0.6, belief shift, consensus deviation, dependency triggers, recency penalty −0.5)
2. **Thermodynamic termination** — Discussion ends at crystallized state (R>0.85, T<0.22, H<0.42, sustained 3 evals)
3. **Passive listening** — Non-speaking agents update beliefs via DeGroot averaging

**Key result**: C group (thermodynamic) τ=0.64 vs B group (fixed) τ=0.42, d=1.09, p=0.028. Cross-model: Zhipu C τ=0.76 (+18.8%). Full details in [EXPERIMENT_DESIGN.md](EXPERIMENT_DESIGN.md).

</details>

<details>
<summary><b>Click to expand: Causal Effect Estimation</b></summary>

Nearest-neighbor trajectory matching (k=5) + inverse-distance-weighted counterfactual + 10000-permutation test + 10000-iteration bootstrap CI. On historical 120-experiment data:

| Group | n_trt | Effect | 95% CI | d | p |
|---|---|---|---|---|---|
| Invest 3-round | 15 | +0.193 | [+0.01, +0.37] | 0.69 | 0.199 |
| Invest 5-round | 15 | −0.111 | [−0.27, +0.04] | −0.49 | 0.414 |
| M&A 5-round | 15 | +0.135 | [+0.07, +0.20] | 0.96 | 0.067 |

Note: data predates D1–D4 fix. See [src/lib/analysis/causalEffect.ts](src/lib/analysis/causalEffect.ts).

</details>