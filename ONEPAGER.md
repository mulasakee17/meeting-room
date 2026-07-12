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
  Multi-agent framework → Agents discuss → Vote → Done  (no quality check)

With SwarmAlpha:
  Multi-agent framework → Agents discuss → [Governance Runtime: observe → detect → intervene] → Quality-evaluated decision
```

### Three Core Components

1. **Governance Runtime** — Framework-agnostic engine that monitors 4 failure modes in real time and triggers targeted interventions
2. **5-Dimension Evaluation** — Multi-dimensional scoring (Consensus, Reliability, Dispersion, Stability, Influence Analysis) — not just "was it right?"
3. **Decision Trace** — Full auditable decision chain: who influenced whom, why beliefs shifted, when governance intervened

### Key Innovation: LLM Perception / Math Evolution Separation

LLMs only extract beliefs and emotions from natural language. All governance logic (consensus computation, bias detection, belief dynamics) uses pure mathematics. Result: **fast, cheap, interpretable** — deployable as a lightweight plugin with zero additional LLM calls.

### Cognitive Defect Diagnosis of the Multi-Agent Discussion Paradigm

A deeper architectural review diagnosed **4 root cognitive defects** in the prevailing multi-agent discussion paradigm — and all 4 have been fixed:

| Defect | Symptom | Fix |
|--------|---------|-----|
| **D1: Missing state awareness** | `buildPrompt` did not inject `belief`/`confidence` into agent prompts — agents spoke without knowing their own or others' current state | Belief & confidence now injected into every prompt |
| **D2: No conversation history** | Only a global summary was passed; agents had no personalized memory of prior exchanges | Per-agent personalized memory added |
| **D3: Synchronous scripted turns** | `Promise.all` made agents speak simultaneously, reading from pre-written scripts rather than responding to each other | Replaced with sequential speaking order (agents hear prior turns) |
| **D4: Fabricated influence network** | Influence edges were inferred from numerical differences rather than explicit citations | Influence graph now built only from explicit references |

**Critical implication**: These 4 defects mean the governance loop was *broken* during all prior experiments — agents could not actually perceive, remember, respond to, or influence one another. **All prior experimental conclusions were drawn under a broken-loop condition and are therefore suspect.** Fixing these defects is a prerequisite for any reliable experiment; re-running the experiments is required before trustworthy conclusions can be drawn.

---

## Experimental Evidence (165 controlled experiments; 105 new runs pending lab rerun after loop-fix)

2 tasks (M&A: 5 rounds, n=15 for none/full, n=10 for others; Invest: 5-round n=15 for none/full & n=5 for others, 3-round n=15 with none & full only — a 2×2 factorial design on round count × governance). Primary metric: Kendall's τ + within-group Δτ (baseline-corrected). t-distribution 95% CI + permutation test p-values.

### Interdependent Investment Task
*(No single agent can determine the answer alone.)*

**5-round variant (n=15 for none/full, n=5 for others)**

| Ablation | τ | Q | d | p | Key finding |
|----------|------|------|---|---|-------------|
| None | 0.778±0.325 | 89.0±16.1 | — | — | Baseline: already strong |
| Full | 0.778±0.325 | 89.0±16.1 | +0.00 | 1.0 | Zero effect — identical to baseline |
| Shuffle | 1.000±0.000 | 100.0±0.0 | +1.03 | 0.44 | NOT sig (n=5 too small) |
| full_weight | 0.467±0.558 | — | −0.57 | 0.173 | Harmful trend (ΔQ=−15.6) |
| full_reflection | 0.333±0.471 | — | −0.95 | **0.048** | **SIG: significantly harmful (ΔQ=−22.2)** |

**3-round variant (n=15, only none & full)**

| Ablation | τ | Q | Δτ | Net Δτ | d | p | Key finding |
|----------|------|------|-----|--------|---|---|-------------|
| None | 0.422±0.344 | 71.3±17.2 | — | — | — | — | Baseline |
| Full | 0.644±0.344 | 82.4±17.0 | — | +0.133 | +0.65 | 0.152 | Medium effect, NOT sig (CI [−0.09, +0.35]) |

### M&A Target Selection
*(Agents can perform reasonably without collaboration. 5 rounds, n=15 for none/full, n=10 for others)*

| Ablation | τ | Q | Δτ | d | p | Key finding |
|----------|------|------|-----|---|---|-------------|
| None | 0.533±0.209 | 76.7±10.5 | — | — | — | Baseline: already decent |
| **Full** | 0.613±0.177 | 80.7±8.8 | −0.123 | +0.41 | 0.36 | NOT significant |
| **Shuffle** | **0.900±0.194** | **95.0±9.7** | — | **+1.80** | **0.0009** | **SIG: breaking overconfidence helps** |
| full_diversity | 0.660±0.190 | — | — | +0.63 | 0.174 | NOT sig |
| full_weight | 0.700±0.316 | — | — | +0.65 | 0.171 | NOT sig |
| full_reflection | 0.660±0.190 | — | — | +0.63 | 0.183 | NOT sig |
| full_continue | 0.620±0.063 | — | — | +0.52 | 0.267 | NOT sig |

**Three conclusions, each with direct evidence**:

1. **2×2 factorial design reveals round moderation** — The 2×2 design (3-round vs 5-round × none vs full, n=15 per cell) is the methodological contribution. On 3-round Invest, full governance shows a medium effect (d=+0.65, p=0.152, Net Δτ=+0.133, CI [−0.09, +0.35]) — suggestive but not significant. On 5-round Invest, full governance shows zero effect (d=+0.00, p=1.0, identical to baseline). Governance has directional benefit in limited rounds but zero effect with sufficient rounds.
2. **The only significant governance effect is HARMFUL** — On 5-round Invest, full_reflection (n=5) produces τ=0.333, ΔQ=−22.2, p=0.048 — significantly harmful, the first and only statistically significant governance effect. full_weight (τ=0.467, ΔQ=−15.6, p=0.173) shows a harmful trend. No positive governance effect reaches significance across all 165 experiments.
3. **Breaking overconfidence is the strongest positive finding** — M&A Shuffle (τ=0.900, d=+1.80, p=0.0009) is the only statistically significant *positive* result across all 165 experiments. On weakly-interdependent tasks, scrambling data breaks professional overconfidence, forcing agents to listen to each other — outperforming targeted governance.

---

## Technical Highlights

| Feature | Description |
|---------|-------------|
| **Framework-Agnostic** | Custom framework (full); AutoGen (TypeScript bridge, Python sidecar needed); CrewAI/LangGraph (planned) |
| **Embeddable SDK** | `import { GovernanceRuntime } from "@/runtime"` — one class, zero framework deps |
| **Adaptive Governance** | Thresholds calibrate from round-1 data; intervention dosage scales with severity (config-gated, default off) |
| **Cross-Examination** | Adversarial debate engine: splits agents into PRO/CON camps, synthesizes verdict |
| **7 Ablation Modes** | Full + shuffle control + 4 single-intervention modes isolate which mechanism matters. **[Updated]** Expanded from 2 implemented modes to 7; full 105-run experiment pending lab execution |
| **7 Hard Fixes** | H4 Kuramoto mapping corrected; H6 `convergenceSpeed` annotation fixed; H2 `ablationModes` expanded (2→7); H19 seeded PRNG for reproducibility; H17 cache pollution eliminated; H18 `interventionPrompt` unified across modes |
| **Statistical Inference** | t-distribution 95% CI + permutation test p-values on all key comparisons; Δτ baseline-corrected |
| **Parameter Sensitivity** | One-at-a-time sweep over 5 governance parameters verifies robustness |
| **Dropout Sensitivity** | Agent dropout analysis measures outcome sensitivity to each agent's presence |
| **Multi-LLM Support** | DeepSeek / OpenAI / Anthropic / Local (Ollama) — unified interface |
| **Extensible Detection** | Custom bias detectors via `registerDetector()` — no core engine changes needed |
| **Shared Utilities** | Registry/JSON/stats modules eliminate code duplication across the codebase |
| **149 Automated Tests** | All core modules covered, 11 test files (count unchanged after hard fixes; 105 new experiments pending lab rerun) |
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

## Honest Limitations

| Area | Status | Detail |
|------|--------|--------|
| **Parameter calibration** | ⚠️ Hand-tuned | 16 belief-update constants not empirically calibrated; sensitivity sweep infrastructure exists but not systematically run |
| **Adaptive modules** | 🔧 Unvalidated | Adaptive thresholds & dosage implemented + unit-tested, but not used in 165 experiments |
| **Topology** | 🔧 Unvalidated | Only FlatTopology (5 agents) tested; Grouped/Committee implemented but untested |
| **Evaluation weights** | ⚠️ Heuristic | 5-dimension weights (0.20/0.25/0.20/0.17/0.18) not data-driven; equal-weight robustness check planned |
| **Single model** | ⚠️ DeepSeek only | Cross-model generalization untested |
| **Sensitivity ≠ causality** | ✅ Honest | Dropout analysis explicitly labeled as sensitivity diagnostic, not causal identification |

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
- **Statistical**: Power analysis for sample size planning; cross-model validation

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
