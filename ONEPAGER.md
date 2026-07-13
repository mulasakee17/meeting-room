# SwarmAlpha — One-Page Summary

> **An Embeddable Governance Runtime for Multi-Agent Systems**
>
> *Process monitoring, decision audit, and adaptive intervention — three independent value pillars for AI agent collectives.*
>
> **Application scenario**: Real-time process governance for LLM multi-agent collaborative decision-making — detecting polarization, authority bias, echo chambers, and premature consensus during consensus formation and applying targeted interventions to safeguard decision quality in limited-round discussions.

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

SwarmAlpha is **not another multi-agent framework**. It's an **embeddable governance runtime** — a drop-in layer that provides three independent value dimensions:

**1. Process Monitoring** — Real-time detection of 4 collective cognitive failures (echo chamber, authority bias, polarization, premature consensus). Value is independent of intervention: knowing your agent team is forming an echo chamber matters even if you choose not to act.

**2. Decision Audit** — Full traceable chain: who influenced whom, when beliefs shifted, when governance intervened. Post-hoc accountability for compliance and debugging, regardless of whether the final decision was correct.

**3. Adaptive Intervention** — Targeted prompts injected when bias is detected (diversity injection, weight reduction, forced reflection, continue discussion). Helpful under specific boundary conditions, not a universal upgrade.

```
Without SwarmAlpha:
  Agents discuss → Vote → Done  (no visibility, no audit, no intervention)

With SwarmAlpha:
  Agents discuss → [Monitor → Detect → Audit → Intervene?] → Auditable decision
```

### Key Innovation: LLM Perception / Math Evolution Separation

LLMs only extract beliefs and emotions from natural language. All governance logic (consensus computation, bias detection, belief dynamics) uses pure mathematics. Result: **fast, cheap, interpretable** — deployable as a lightweight plugin with zero additional LLM calls.

### Independent Audit Result

The core governance engine (all 4 detectors, 4 intervention strategies, adaptive thresholds) has been verified to work **without the built-in DiscussionEngine**. Integration into any framework requires only: (1) append belief-extraction tags to agent prompts, (2) adapt messages via `StateInferenceBridge`, (3) call `processRound()`, (4) inject intervention prompts. Working prototype per framework: 2-4 hours.

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

## Experimental Evidence (165 controlled experiments)

2×2 factorial design (Task interdependence × Round budget, n=15/cell). Primary metric: Kendall's τ + within-group Δτ. t-distribution 95% CI + permutation test p-values.

### 2×2 Factorial — Core Results

| | Invest — 3 rounds | Invest — 5 rounds | M&A — 5 rounds |
|---|---|---|---|
| **Baseline τ** | 0.422±0.344 (Q=71.3) | 0.778±0.325 (Q=89.0) | 0.533±0.209 (Q=76.7) |
| **Full governance τ** | 0.644±0.344 (Q=82.4) | 0.778±0.325 (Q=89.0) | 0.613±0.177 (Q=80.7) |
| **Net Δτ** | +0.133 (p=0.152, NOT sig) | −0.089 (p=1.0, null) | −0.123 (p=0.36, NOT sig) |
| **Cohen's d** | +0.65 (medium, NOT sig) | +0.00 (null) | +0.41 (NOT sig) |
| **Key finding** | Directional improvement only | Null; reflection HARMFUL (p=0.048) | Shuffle beats all (p=0.0009) |

**Three conclusions**:

1. **Governance shows directional improvement only under specific conditions** — 3-round Invest has d=+0.65 (p=0.152, NOT sig). With 5 rounds, baseline agents catch up and governance becomes completely null (d=+0.00).
2. **The engine's value extends beyond decision quality improvement** — Process monitoring and decision audit are independently valuable. Enterprises that deploy AI agent teams need to see what's happening in discussions, trace who influenced whom, and comply with audit requirements — regardless of whether interventions change the final answer.
3. **Breaking overconfidence is the only robust positive** — M&A Shuffle τ=0.900 (p=0.0009). On weakly-interdependent tasks, scrambling data forces agents to listen — outperforming targeted governance.

> **Self-correction**: V1 results were affected by a system prompt answer leak and a broken authority bias detector. All 6 bugs independently identified, verified, and fixed. V2 data above is from the corrected pipeline.

---

## Technical Highlights

| Feature | Description |
|---------|-------------|
| **Framework-Agnostic** | Core engine audited: zero deps on DiscussionEngine. StateInferenceBridge enables prompt-injection integration with any framework in 2-4 hours |
| **Embeddable SDK** | `import { GovernanceRuntime } from "@/runtime"` — one class, zero framework deps |
| **Adaptive Governance** | Thresholds calibrate from round-1 data; intervention dosage scales with severity (config-gated, default off) |
| **Cross-Examination** | Adversarial debate engine: splits agents into PRO/CON camps, synthesizes verdict |
| **7 Ablation Modes** | Full + shuffle control + 4 single-intervention modes isolate which mechanism matters. **[Updated]** Expanded from 2 implemented modes to 7; full 105-run experiment pending lab execution |
| **7 Hard Fixes** | H4 Kuramoto mapping corrected; H6 `convergenceSpeed` annotation fixed; H2 `ablationModes` expanded (2→7); H19 seeded PRNG for reproducibility; H17 cache pollution eliminated; H18 `interventionPrompt` unified across modes |
| **Causal Effect Estimation** | 🆕 Nearest-neighbor trajectory matching (k=5) + 10000-permutation test + bootstrap CI — estimates counterfactual intervention effects, not just correlations. M&A 5-round shows +0.135 effect (d=0.96, p=0.067, CI excludes 0) |
| **Statistical Inference** | t-distribution 95% CI + permutation test p-values on all key comparisons; Δτ baseline-corrected |
| **Parameter Sensitivity** | One-at-a-time sweep over 5 governance parameters verifies robustness |
| **Dropout Sensitivity** | Agent dropout analysis measures outcome sensitivity to each agent's presence |
| **Multi-LLM Support** | DeepSeek / OpenAI / Anthropic / Local (Ollama) — unified interface |
| **Extensible Detection** | Custom bias detectors via `registerDetector()` — no core engine changes needed |
| **Shared Utilities** | Registry/JSON/stats modules eliminate code duplication across the codebase |
| **209 Automated Tests** | All core modules covered, 13 test files (including 28 causal-effect tests; 105 new experiments pending lab rerun) |
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

See [ROADMAP.md](ROADMAP.md) for the full development plan with timelines, academic outreach strategy, and risk assessment. Summary:

| Phase | Timeline | Focus |
|-------|----------|-------|
| **Phase 1** | This week | Stabilize code + unify documentation narrative |
| **Phase 2** | 1-2 weeks | Process monitoring demo (static audit report) + framework adapters (AutoGen, CrewAI) |
| **Phase 3** | 2-4 weeks | Multi-agent society experiments (50-500 agents, information propagation, governance structure comparison) |
| **Phase 4** | Parallel to Phase 3 | Academic outreach — target labs at Tsinghua AIR, Shanghai AI Lab, PKU CFCS |
| **Phase 5** | 3-6 months | Python SDK, formal paper (AAMAS/NeurIPS Workshop target), open source community |

## Long-Term Vision: Agent Society Governance Infrastructure

> *"Not a framework for building agents. An operating system for governing them."*

As multi-agent systems scale from 5-agent discussions to 500-agent organizational ecosystems, the core challenge shifts from task completion to **emergent outcome trustworthiness**:

- Echo chambers → information cartels
- Authority bias → power monopolization
- Premature consensus → institutional groupthink

SwarmAlpha's observe→model→detect→intervene→evaluate loop is agent-count-agnostic and framework-agnostic — the minimal viable kernel of a future governance operating system for AI societies. Everyone is building how to simulate agent societies. No one is building how to govern them.

---

> *"Not replacing how agents decide — ensuring what they decide holds up to scrutiny."*
