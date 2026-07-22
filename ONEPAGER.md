# SwarmAlpha — One-Page Summary

> **The first open-source cognitive governance runtime for multi-agent systems.**
>
> *Security governance prevents agents from doing harm. Cognitive governance prevents agents from thinking wrong. The agent governance stack needs both.*
>
> **Positioning**: Complementary to Microsoft Agent Governance Toolkit / Agent Control Standard (ACS). They handle tool-execution safety; SwarmAlpha handles discussion-process health — detecting echo chambers, authority bias, polarization, and premature consensus during LLM agent collaboration. Validated by independent academic evidence: Li et al. (SJTU, 2026) confirmed MAS echo chambers amplify bias undetected by standard methods [arXiv:2604.08963](https://arxiv.org/abs/2604.08963). ACS-compatible via `StateInferenceBridge` at the state checkpoint.

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

LLMs only extract beliefs and emotions from natural language. All governance logic (consensus computation, bias detection, belief dynamics) uses pure mathematics. Result: **fast, cheap, interpretable** — deployable as a lightweight plugin with near-zero additional LLM calls (only when agents fail to output the `[GOV]` structured tag does `StateInferenceBridge` fall back to LLM inference).

### Framework Independence Verification

The core governance engine (all 4 detectors, 4 intervention strategies, adaptive thresholds) has been self-verified to work **without the built-in DiscussionEngine**. Integration into any framework requires only: (1) append belief-extraction tags to agent prompts, (2) adapt messages via `StateInferenceBridge`, (3) call `processRound()`, (4) inject intervention prompts. Working prototype per framework: 2-4 hours.

### Cognitive Defect Diagnosis of the Multi-Agent Discussion Paradigm

A deeper architectural review diagnosed **4 root cognitive defects** in the prevailing multi-agent discussion paradigm — and all 4 have been fixed:

| Defect | Symptom | Fix |
|--------|---------|-----|
| **D1: Missing state awareness** | `buildPrompt` did not inject `belief`/`confidence` into agent prompts — agents spoke without knowing their own or others' current state | Belief & confidence now injected into every prompt |
| **D2: No conversation history** | Only a global summary was passed; agents had no personalized memory of prior exchanges | Per-agent personalized memory added |
| **D3: Synchronous scripted turns** | `Promise.all` made agents speak simultaneously, reading from pre-written scripts rather than responding to each other | Replaced with sequential speaking order (agents hear prior turns) |
| **D4: Fabricated influence network** | Influence edges were inferred from numerical differences rather than explicit citations | Influence graph now built only from explicit references |

**Critical implication (updated 2026-07-14, expanded)**: These 4 defects meant the governance loop was *broken* during all 165 prior experiments — agents could not actually perceive, remember, respond to, or influence one another. **The defects have since been fixed (2026-07-12), and the experiments were re-run on a Crisis task (2026-07-14, expanded to n=24/cell, 72 runs) with the loop closed** — statistically confirming full vs none d=0.92, p=0.005, power=88%, τ +51%. The prior "governance is ineffective" conclusions were artifacts of the broken loop, not intrinsic to governance. Diagnosing *why* governance appeared ineffective is itself the research value.

---

## Experimental Evidence

**161 experiments across 2 tasks (Crisis 72 + Supplier 89), 3 conditions (none/full/shuffle).** Primary metric: Kendall's τ + within-group Δτ. t-distribution 95% CI + permutation test p-values.

### 2026-07-14 Cross-Task Validation (Primary Evidence, Expanded)

After fixing 4 cognitive defects (D1–D4), **161 experiments across 2 independent tasks** were run with the governance loop closed:

| | Crisis — 3 rounds (n=24/cell) | Supplier — 3 rounds (n=30/30/29*) |
|---|---|---|
| **Baseline τ** | 0.408 ± 0.182 (Q=72.2) | 0.680 ± 0.186 (Q=82.0) |
| **Full governance τ** | **0.617 ± 0.263** (Q=81.1) | **0.767 ± 0.183** (Q=91.0) |
| **Shuffle τ** | **0.717 ± 0.243** (Q=85.6) | 0.697 ± 0.204 (Q=84.0) |
| **d vs none** | **+0.92** (p=0.005) / **+1.44** (p<0.001) | **+0.47** (p=0.089) / +0.09 (ns) |
| **Power** | 88% ✅ | 43% ⚠️ |

> *\*Supplier shuffle n=29 (1 run crashed due to API error; 89/90 experiments completed).*

**Four cross-task conclusions**:

1. **Governance is statistically confirmed effective** — Crisis d=0.92, p=0.005, power=88%. Supplier directionally consistent (d=0.47) but underpowered (43%, needs n=72 for 80%).
2. **"False consensus" replicates across tasks** — consensus-quality r ≈ 0 in both tasks (-0.14 / -0.11), proving this is a general LLM multi-agent property.
3. **Shuffle control has boundary conditions** — effective on hard tasks (Crisis d=1.44, p<0.001), ineffective on easier tasks (Supplier d=0.09, p=0.78) due to ceiling effect (baseline already near full level).
4. **Mechanism ablation is direction-consistent** — reduce_weight (Crisis d=1.51, p=0.0001) and force_reflection (Crisis d=0.73, p=0.001) drive the effect; both d>0 in Supplier.

**Three primary results (Crisis, loop-closed, expanded)**:

1. **Governance is statistically confirmed effective** — full vs none d=0.92, p=0.005, power=88%, τ +51%. The prior "governance is ineffective" finding was an artifact of the broken loop, not intrinsic to governance.
2. **Shuffle is strongest on hard tasks** — d=1.44 on Crisis. shuffle represents the theoretical ceiling of *information exchange* (all agents access all expertise), not the ceiling of agent collaboration.
3. **Intervention cost-benefit analyzed** (Crisis task, n=24) — 89 interventions, 47 effective (52.8%). `force_reflection` most reliable (79.4%), `reduce_weight` best cost-efficiency (+0.389 τ); `introduce_diversity` (9.1%) and `continue_discussion` (0%, harmful) now disabled by default.

### Historical Data (Broken-Loop, Retained as Provenance Only)

165 of 416 runs were collected *before* the D1–D4 cognitive defects were fixed — the governance loop was severed. These data are retained for provenance in [TECHNICAL_REPORT.md](TECHNICAL_REPORT.md). **The 161 closed-loop runs (Crisis 72 + Supplier 89) above are the primary evidence.**

The loop-fix (D1–D4) is itself a research contribution: identifying *why* governance appeared ineffective — agents could not perceive, remember, respond to, or influence one another — is more valuable than any single p-value.

> **Self-correction**: V1 results were affected by a system prompt answer leak and a broken authority bias detector. All 6 bugs independently identified, verified, and fixed. V2 data above is from the corrected pipeline. The 2026-07-14 Crisis re-validation is the first experiment run with the loop *actually closed*.

---

## Technical Highlights

| Feature | Description |
|---------|-------------|
| **Framework-Agnostic SDK** | `import { GovernanceRuntime } from "@/runtime"` — zero framework deps. StateInferenceBridge enables integration with AutoGen/CrewAI/LangGraph in 2-4 hours |
| **Extensible Detection** | Custom bias detectors via `registerDetector()` — recently closed the "custom detector → intervention" architecture gap (see [docs/GOVERNANCE_DESIGN.md](docs/GOVERNANCE_DESIGN.md)) |
| **6 Hard Fixes (H-series)** | H4 Kuramoto mapping corrected (θ=π·b → θ=(π/2)·b); H19 seeded PRNG for reproducibility; H17 cache pollution eliminated; H18 interventionPrompt unified. Full audit in [LIMITATIONS.md](LIMITATIONS.md) §19 |
| **Statistical Rigor** | Permutation test p-values (with (count+1)/(n+1) correction) + t-distribution 95% CI + Cohen's d_z + non-central-t power analysis + causal effect estimation (k=5 nearest-neighbor trajectory matching) |
| **Free-Energy Ranking** | Social free energy F=(1-R)+T·H decomposition drives intervention priority. Backtest falsified original force_reflection↔structural mapping (p=0.041), corrected to thermal·(1-structural) |
| **310 Automated Tests** | 18 test files, 307 passing, 3 network-dependent skipped. Including 13 MAST detector tests and 28 causal-effect tests |

> Full feature inventory (adaptive thresholds, cross-examination, dropout sensitivity, multi-LLM support, etc.) in [TECHNICAL_REPORT.md](TECHNICAL_REPORT.md).

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
| **Adaptive modules** | 🔧 Unvalidated | Adaptive thresholds & dosage implemented + unit-tested, but not used in 326 experiments |
| **Topology** | 🔧 Unvalidated | Only FlatTopology (5 agents) tested; Grouped/Committee implemented but untested |
| **Evaluation weights** | ⚠️ Heuristic | 5-dimension weights (0.20/0.25/0.20/0.17/0.18) not data-driven; equal-weight robustness check planned |
| **Single model** | ⚠️ DeepSeek only | Cross-model generalization untested |
| **Supplier underpowered** | ⚠️ 43% power | Supplier d=0.47, p=0.089 — directionally consistent but needs n=72 for 80% power |
| **Shuffle boundary** | ⚠️ Task-dependent | Shuffle effective on hard tasks (Crisis d=1.44), ineffective on easy tasks (Supplier d=0.09) due to ceiling effect |
| **Sensitivity ≠ causality** | ✅ Honest | Dropout analysis explicitly labeled as sensitivity diagnostic, not causal identification |

---

## Who Built This

**贺孟元** — High school student. Independent architecture design, implementation (~33,000 lines TypeScript), experiment design, and data analysis.

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
