# SwarmAlpha

> **A research platform for cognitive measurement of multi-agent deliberation — social thermodynamics as a runtime diagnostic layer, with governance intervention as future work.**

[![Tests](https://img.shields.io/badge/tests-630-green)](./test/)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

**English** | [中文](./README_CN.md)

---

## 1. What is SwarmAlpha?

SwarmAlpha is a **research platform for measuring collective cognitive states in multi-agent deliberation**. It does NOT build agents or manage workflows. Instead, it provides a measurement layer that observes agent discussions, quantifies collective cognitive states, and detects failure modes — all with **zero additional LLM calls** (mathematics handles everything; LLMs only do perception).

**Current focus**: measurement and diagnostics. Governance intervention is implemented and validated at smoke-test level. Our v2.0 interventions (reduce_weight, force_reflection) proved destructive ($\Delta\tau = -0.267$). v2.1 non-destructive interventions (inject_evidence, rebalance_attention) re-tested on 2026-07-25 yielded $\Delta\tau = 0.000$ (smoke test, N=6; earlier $+0.533$ not reproduced and retracted). Full-scale validation is in progress.

**Long-term vision**: the governance layer above the [A2A protocol](https://github.com/google/A2A), as described in [AGENT_SOCIETY_VISION.md](AGENT_SOCIETY_VISION.md).

---

## 2. Core Findings: Measurement Reveals Governance Boundary Conditions

After fixing 4 cognitive defects (D1–D4) that broke the governance loop, 169 closed-loop experiments across 2 tasks, plus a cognitive governance smoke test, reveal:

| Condition | When Governance Works | When It's Neutral | When It's Harmful |
|---|---|---|---|
| **Hard tasks** (Crisis, baseline τ=0.41) | ✅ d=0.92, p=0.0038, τ +51% | — | — |
| **Easy tasks** (Supplier, baseline τ=0.68) | — | ⚠️ d=0.47, p=0.086 (underpowered, 43%) | Ceiling effect: shuffle d=0.09 |
| **Structural intervention** (shuffle) | ✅ d=1.44 on Crisis (p<0.001) | d=0.09 on Supplier (easy task) | — |
| **Cognitive governance** (E9 Smoke Test) | — | — | ❌ Δτ = −0.267: reduce_weight suppresses key info, force_reflection backfires |
| **Procedural intervention** (force_reflection) | ⚠️ 79.4% (27/34, uncontrolled, non-causal) | — | ⚠️ Backfire in polarized states (F-decomposition analysis) |
| **Intervention count** | — | — | r=−0.55 with decision quality (dependency-chain cascades) |

**Three cross-task findings** (169 experiments, Crisis 80 + Supplier 89):

1. **Weak consensus-quality correlation** — across all tasks (N=169, p=0.20, not significant), consensus level (R) and decision quality (τ) are largely uncorrelated (r≈−0.10). High agreement does not reliably indicate a good decision.
2. **Structural > procedural** — Re-assigning agent knowledge (shuffle d=1.44) dominates in-discussion interventions (governance d=0.92) on hard tasks.
3. **Task difficulty is the master switch** — Governance effectiveness is bounded by task difficulty (ceiling effect on easy tasks, significant on hard tasks).

**Current priority: intervention stabilization.** The cognitive governance smoke test (E9, N=6 runs) showed that current interventions are destructive. We are replacing `reduce_weight` and `force_reflection` with non-destructive alternatives (`inject_evidence`, `rebalance_attention`, structural `shuffle`) that change information flow rather than belief weights. See [future.md](future.md) for the stabilization roadmap.

**v6 status (2026-07-31):** The development mainline has moved to the v6 cognitive governance path — `NativeCognitiveEngine` with a five-dimensional cognitive state (Utility/Evidence/Inertia/Confidence/Susceptibility), δ-diagnosis (detects contradictions between observable signals, no ground truth required), and non-destructive interventions (inject_evidence, rebalance_attention, shuffle_knowledge). An optional asynchronous semantic tool (SemanticTool) performs evidence dedup and gap analysis via LLM. The E9 four-group experiment (A none / B δ / C δ+SemanticTool / D legacy detectors, 200 runs total) is designed; a single Pilot A/B run (2026-07-30) showed Δτ=+0.071 with no statistical significance. See [SOT.md](docs/SOT.md) and [ROADMAP_V6.md](docs/roadmap/ROADMAP_V6.md).

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
npm test              # 633 tests (630 passed, 3 network-dependent skipped)
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

## 4. Measurement Runtime — Capabilities

| Capability | Description | Status |
|---|---|---|
| **7 Bias Detectors** | Echo chamber, authority bias, polarization, premature consensus + 3 MAST detectors (information withholding, ignored input, reasoning-action mismatch) | ✅ Built-in; MAST detectors not yet experimentally triggered |
| **3 Non-destructive Interventions** (v2.1 active) | inject_evidence, rebalance_attention, shuffle_knowledge — change information flow, not belief weights | ✅ Built-in; Δτ=0.000 (smoke test, N=6, +0.533 retracted) |
| **4 Deprecated Interventions** (v2.0) | reduce_weight, force_reflection, introduce_diversity, continue_discussion — destructive (Δτ=−0.267) | ⚠️ Disabled by default |
| **4 Governance Modes** | none / detect-only / full / random-intervene + 5 extended ablation modes (shuffle, full_diversity, etc.) | ✅ Built-in |
| **5-Dimension Evaluation** | Consensus, reliability, dispersion, stability, influence analysis | ✅ Built-in; weights are heuristic |
| **Cross-Examination Engine** | PRO/CON camps → adversarial debate → verdict synthesis | ✅ Built-in + unit-tested |
| **Causal Effect Estimation** | Nearest-neighbor trajectory matching + permutation test + bootstrap CI | ✅ Built-in |
| **Audit Infrastructure** | SHA-256 manifest + third-party verifiable governance trace (detectionMetrics, effectMetrics, parameters) | ✅ Built-in; 1 experiment with full audit fields |
| **Custom Detector API** | Register new bias detectors without modifying core engine | ✅ Built-in |
| **Scalable Topology** | Flat → Grouped → Committee discussion structures | 🔧 GroupedTopology implemented, not yet tested |
| **Adaptive Thresholds** | Auto-calibrate detection thresholds from task context | 🔧 Implemented, not yet experimentally validated |
| **Adaptive Dosage** | Intervention strength scales with deviation severity | 🔧 Implemented, not yet experimentally validated |

---

## 5. Key Experimental Evidence

**169 closed-loop experiments** (manifest-verified 2026-07-23) across 2 tasks, 3 conditions, 9 governance configurations. Total 573 JSON files (incl. 85 deprecated lunar_survival + 318 broken-loop provenance).

### Dual-Task Comparison (Primary Evidence)

| Metric | Crisis (hard, n=24/cell) | Supplier (easy, n=30/cell) | Cross-Task |
|--------|--------------------------|----------------------------|------------|
| **none** τ | 0.408 ± 0.182 | 0.680 ± 0.186 | — |
| **full** τ | 0.617 ± 0.263 | 0.767 ± 0.183 | — |
| **shuffle** τ | 0.717 ± 0.243 | 0.697 ± 0.204 | Task-dependent |
| **Governance Δτ** | **+0.209** | **+0.087** | ✅ Direction consistent |
| **Governance d** | 0.92 (p=0.0038) | 0.47 (p=0.086) | ✅ Direction consistent |
| **Power** | 88% ✅ | 43% ⚠️ | Supplier needs n=72 for 80% |
| **Consensus-Quality r** | −0.137 | −0.107 | ✅ Both ≈ 0 |

**Async engine** (thermodynamic termination): C group τ=0.64 vs B group τ=0.42, d=1.09, p=0.028. Cross-model: Zhipu C group τ=0.680 (+6.3% vs DeepSeek).

**Conclusion**: Governance improves decision quality on hard tasks (statistically confirmed), shows direction-consistent improvement on easy tasks (underpowered), and has clear boundary conditions — task difficulty is the master switch. Structural rearrangement (shuffle) can dominate procedural governance. Intervention count is negatively correlated with decision quality (r=−0.55), suggesting dependency-chain backfire risk.

> Full experiment data, statistical methods, and per-intervention breakdown in [TECHNICAL_REPORT.md](docs/archive/paper/TECHNICAL_REPORT.md) (archived). Causal effect estimation in [experiments/v2/causalAnalysis.ts](experiments/v2/causalAnalysis.ts).

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
│   ├── governance/       # 7 bias detectors + 3 active + 4 deprecated interventions
│   ├── evaluation/       # 5-dimension scoring engine
│   ├── observation/      # LLM output parsing
│   ├── inference/        # Belief evolution computation
│   ├── discussion/       # Sync + async multi-round engines
│   ├── analysis/         # Causal effect estimation (trajectory matching)
│   ├── llm/              # Multi-provider LLM abstraction
│   └── utils/            # Shared utilities (PRNG, JSON, stats)
experiments/v2/           # 573 JSON files (169 closed-loop) + analysis scripts + audit tools
test/                     # 633 automated tests (630 passed, 3 skipped)
```

### Document Index

**For professors / reviewers (5-minute path)**:

| Order | Document | Content |
|-------|----------|---------|
| 0th | [docs/PROFESSOR_GUIDE.md](docs/PROFESSOR_GUIDE.md) | Project overview & collaboration guide for professors |
| 1st | [docs/SOT.md](docs/SOT.md) | Single source of truth — all verified numbers |
| 2nd | [docs/paper/LIMITATIONS.md](docs/paper/LIMITATIONS.md) | Known boundaries — scientific honesty |
| 3rd | [docs/paper/PAPER_DRAFT.md](docs/paper/PAPER_DRAFT.md) | Academic paper draft (English) |
| 4th | [docs/paper/PAPER_PROFESSOR_VERSION.md](docs/paper/PAPER_PROFESSOR_VERSION.md) | Academic paper draft (Chinese, numbers synced) |

**For developers**:

| Document | Content |
|----------|---------|
| [docs/research/EXPERIMENT_DESIGN.md](docs/research/EXPERIMENT_DESIGN.md) | Technical route: speech willingness formula, DeGroot update, statistical methods |
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | SDK integration guide |
| [docs/GOVERNANCE_DESIGN.md](docs/GOVERNANCE_DESIGN.md) | Governance engine design |

**Deep dive**:

| Document | Content |
|----------|---------|
| [docs/research/THEORY.md](docs/research/THEORY.md) | Theoretical analysis: R, T, H, F derivations, intervention fixed-point analysis |
| [docs/roadmap/future.md](docs/roadmap/future.md) | Future roadmap: non-destructive intervention stabilization, Phase 3 society simulation |
| [docs/architecture/AGENT_SOCIETY_VISION.md](docs/architecture/AGENT_SOCIETY_VISION.md) | Long-term vision: governance substrate for agent society |
| [docs/paper/PAPER_PROFESSOR_VERSION.md](docs/paper/PAPER_PROFESSOR_VERSION.md) | Chinese paper version |
| [README_CN.md](README_CN.md) | Full project documentation in Chinese |

**Archived documents** (historical, in `docs/archive/`): ONEPAGER, PROJECT_STATUS, ROADMAP, ARCHITECTURE_V3, DEVELOPER_GUIDE, THEORY_FREEZE_REPORT, THEORY_VALIDATION_REPORT, EXPERIMENT_READINESS_REPORT, SCIENTIFIC_CAMPAIGN_UNLOCK_REPORT, EXPERIMENTAL_CAMPAIGN_PLAN, paper_audit_report, project_optimization_audit, RESEARCH_PLATFORM_ROADMAP, ARCHITECTURE_FREEZE_REPORT.

---

## 8. Known Limitations & Honest Declarations

### What this project does NOT claim

- **Not a production system** — 169 closed-loop experiments, single-digit sample sizes per cell. Statistical significance ≠ practical reliability.
- **Not a multi-framework adapter** — All experiments use the built-in `CustomAgent`. AutoGenAdapter is a demo only. CrewAI/LangGraph are removed from roadmap.
- **Not a safety tool** — Detects cognitive biases, not security threats. Does not prevent agents from executing harmful actions.
- **Not empirically calibrated** — Adaptive thresholds/dosage exist in code but have zero experimental validation. Evaluation weights are heuristic.
- **Governance interventions are not production-ready** — Cognitive governance smoke test showed Δτ = −0.267 (governance made decisions worse). Current interventions (reduce_weight, force_reflection) are destructive; replacement with non-destructive alternatives is in progress.

### Key limitations (see [LIMITATIONS.md](LIMITATIONS.md) for all 25 sections)

| Limitation | Impact | Mitigation |
|---|---|---|
| Single-model bias (169 closed-loop all DeepSeek) | Findings may not generalize | 54 cross-model runs (Zhipu/Qwen) show directional consistency |
| Small sample (n=24–30/cell) | Limited statistical power | Supplier task at 43% power; needs n=72 for 80% |
| Only 2 tasks | Task diversity limited | 3rd task planned for lab execution |
| 120 historical experiments with broken governance loop | Confounds early conclusions | Explicitly labeled as provisional; 169 closed-loop runs are primary evidence |
| MAST detectors (FM-2.4/2.5/2.6) never triggered in experiments | 0 empirical validation | Requires v2 trace experiments with audit fields |
| 1 experiment with full audit fields (detectionMetrics + effectMetrics) | Audit infrastructure sample insufficient | Needs 10+ new experiments for statistical meaning |
| `full_reflection` p=0.048 finding was RETRACTED | Obtained under broken loop (D1–D4) | Crisis re-validation: 79.4% (27/34, uncontrolled, non-causal), direction reversed |
| **Cognitive governance interventions destructive** (E9 Smoke Test) | Δτ = −0.267 on Supplier task | Replacing reduce_weight & force_reflection with non-destructive alternatives (inject_evidence, rebalance_attention, structural shuffle) |

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

**Implication**: The 120 historical experiments were collected while all four gaps were present. State-modification interventions (reduce_weight, force_reflection) never reached agent perception. The prior "governance is ineffective" conclusion was a loop artifact. See [TECHNICAL_REPORT.md §2](docs/archive/paper/TECHNICAL_REPORT.md) (archived) for the full analysis.

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

Full ablation tables in [TECHNICAL_REPORT.md §2.5](docs/archive/paper/TECHNICAL_REPORT.md) (archived).

</details>

<details>
<summary><b>Click to expand: Async Adaptive Discussion Engine</b></summary>

The async engine (`AsyncDiscussionEngine`) introduces three innovations:

1. **Content-driven speaking** — Willingness score from 5 factors (info exposure ×0.6, belief shift, consensus deviation, dependency triggers, recency penalty −0.5)
2. **Thermodynamic termination** — Discussion ends at crystallized state (R>0.85, T<0.22, H<0.42, sustained 3 evals)
3. **Passive listening** — Non-speaking agents update beliefs via DeGroot averaging

**Key result**: C group (thermodynamic) τ=0.64 vs B group (fixed) τ=0.42, d=1.09, p=0.028. Cross-model: Zhipu C τ=0.680 (+6.3%). Full details in [EXPERIMENT_DESIGN.md](EXPERIMENT_DESIGN.md).

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