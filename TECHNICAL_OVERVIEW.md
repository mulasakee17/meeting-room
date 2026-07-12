# SwarmAlpha Technical Architecture

> **An Embeddable Governance Runtime — Deep Technical Overview**
>
> Updated: 2026-07-12 | Version: V3.2 Governance Runtime (t-distribution CI + permutation test + adaptive modules)

---

## 1. Project Positioning

SwarmAlpha is an **embeddable governance runtime** for LLM multi-agent systems. It does NOT create agents, manage workflows, or handle tool calling. Instead, it plugs into existing frameworks (custom systems fully supported; AutoGen via TypeScript bridge; CrewAI/LangGraph planned) as a **governance layer** that:

- Observes agent discussions in real time
- Models belief evolution and influence propagation
- Detects 4 types of collective decision failures
- Intervenes with adaptive, targeted governance actions
- Evaluates decision quality across 5 dimensions (consensus, reliability, dispersion, stability, influence analysis)

**Core insight**: LLM multi-agent systems suffer the same decision failures as human groups — but no existing framework detects or intervenes. SwarmAlpha fills this gap.

**Key architectural principle**: LLMs only do perception (extracting beliefs/emotions from language). Mathematics handles evolution (consensus, bias detection, belief dynamics). This means the governance runtime can run as a **lightweight plugin** without additional LLM calls.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                 Your Multi-Agent Framework                │
│         (Custom / AutoGen / CrewAI* / LangGraph*)         │
│                                                          │
│  Agent A    Agent B    Agent C    Agent D    Agent E      │
│     │          │          │          │          │          │
│     └──────────┴──────────┴──────────┴──────────┘          │
│                        │                                   │
│                Discussion Stream                           │
│                        │                                   │
├────────────────────────┼──────────────────────────────────┤
│          SwarmAlpha Governance Runtime                     │
│                        │                                   │
│   ┌────────────────────┼──────────────────────────┐      │
│   │  Observation Layer │  Inference Layer           │      │
│   │  (LLM output →     │  (Belief evolution via      │      │
│   │   structured data) │   rule-based update)        │      │
│   │         │          │         │                    │      │
│   │         └──────────┴─────────┘                    │      │
│   │                    │                              │      │
│   │          ┌─────────┴─────────┐                    │      │
│   │          │  Governance Engine │                    │      │
│   │          │  · Echo Chamber   │                    │      │
│   │          │  · Authority Bias │                    │      │
│   │          │  · Polarization   │                    │      │
│   │          │  · Premature      │                    │      │
│   │          │    Consensus      │                    │      │
│   │          └─────────┬─────────┘                    │      │
│   │                    │                              │      │
│   │          ┌─────────┴─────────┐                    │      │
│   │          │ Adaptive Governance│                   │      │
│   │          │ · Threshold calib. │                   │      │
│   │          │ · Dosage tuning    │                   │      │
│   │          │ · Cross-examination│                   │      │
│   │          │ · Dropout sensitivity│                   │      │
│   │          └─────────┬─────────┘                    │      │
│   │                    │                              │      │
│   │          ┌─────────┴─────────┐                    │      │
│   │          │ Evaluation Engine │                    │      │
│   │          │ · Consensus       │                    │      │
│   │          │ · Reliability     │                    │      │
│   │          │ · Dispersion      │                    │      │
│   │          │ · Stability       │                    │      │
│   │          │ · Influence       │                    │      │
│   │          │   Analysis        │                    │      │
│   │          └───────────────────┘                    │      │
│   └───────────────────────────────────────────────────┘      │
│                                                          │
│   Framework-Agnostic · Embeddable · Research-Ready        │
└──────────────────────────────────────────────────────────┘
```

> *\* CrewAI/LangGraph adapters are planned (roadmap). Currently only Custom (full) and AutoGen (TypeScript bridge) are implemented.*

### Two Modes, One Runtime

| Mode | Description | Use Case |
|------|-------------|----------|
| **Embedded SDK** | `import { GovernanceRuntime }` — use as a library in any TypeScript project | Production multi-agent systems |
| **Research Platform** | Next.js app with REST API, UI, experiments | Academic research, ablation studies |

Both modes share the same governance engine. The research platform is built ON TOP of the runtime SDK.

---

## 3. Governance Runtime SDK (`src/runtime/`)

The embeddable core. Zero dependencies on Next.js, React, or API routes.

### 3.1 `GovernanceRuntime` — Main Entry Point

```typescript
class GovernanceRuntime {
  constructor(config: RuntimeConfig)
  processRound(messages: DiscussionMessage[]): GovernanceRoundResult
  onMessage(message: DiscussionMessage): void              // streaming mode
  evaluate(decisions, agents, history, finalDecision): EvaluationResult
  evaluateFromState(finalDecision): EvaluationResult
  getSessionResult(finalDecision): GovernanceSessionResult
  getState(): GovernanceRuntimeState
  onBiasDetected(handler): void
  onIntervention(handler): void
  onRoundComplete(handler): void
  reset(): void
}
```

### 3.2 Framework Adapters (`src/runtime/adapters/`)

Each adapter bridges an external framework into the governance runtime:

```typescript
interface FrameworkAdapter {
  readonly framework: string
  adaptMessages(raw: FrameworkMessage[], round: number): DiscussionMessage[]
  applyIntervention(intervention: Intervention, context: unknown): Promise<boolean>
  extractBeliefs(context: unknown): AgentBelief[]
}
```

| Adapter | Framework | Integration |
|---------|-----------|-------------|
| `CustomAdapter` | Built-in CustomAgent | ✅ Full — direct agent state manipulation |
| `AutoGenAdapter` | Microsoft AutoGen | 🔧 HTTP bridge (Python sidecar needed) |
| CrewAI / LangGraph | (Planned) | 🗓️ Roadmap |

---

## 4. Core Modules

### 4.1 Observation Layer (`src/lib/observation/`)

Parses LLM outputs into structured `AgentOpinion` objects:
- Extracts `reasoning`, `evidence`, `belief`, `confidence`, `referencedAgents`
- 4-layer fault-tolerant JSON parsing (code fence removal → JSON parse → regex extraction → fallback)

### 4.2 Inference Layer (`src/lib/inference/`)

Computes belief evolution using 3 forces:
1. **Peer mean pull** — high-confidence peers pull stronger
2. **Majority effect** — group majority biases individual beliefs
3. **Influence diffusion** — each graph edge exerts type-weighted pull

### 4.3 Governance Engine (`src/lib/governance/`)

#### 4 Bias Detectors

| Bias | Metric | Default Threshold |
|------|--------|------------------|
| Echo Chamber | Info redundancy = (1-σ)×0.5 + Jaccard similarity×0.5 | 0.50 |
| Authority Bias | Dominant agent's message share | 0.25 |
| Polarization | Belief standard deviation | 0.30 |
| Premature Consensus | Round progress < 0.35 ∧ consensus > 0.55 ∧ σ < 0.20 | 0.35 |

#### 4 Intervention Strategies

| Intervention | Trigger | Mathematical Effect |
|-------------|---------|-------------------|
| `reduce_weight` | Authority bias | W(i*→j) ← W(i*→j) × 0.5 |
| `introduce_diversity` | Echo chamber | bᵢ ← bᵢ + εᵢ, εᵢ ~ U(-0.3, 0.3) |
| `force_reflection` | Polarization | bᵢ ← bᵢ + (b̄ − bᵢ) × 0.2 |
| `continue_discussion` | Premature consensus | T_max ← T_max + ⌈T_max × (θ − ρ_t)⌉ |

#### Adaptive Extensions

- **Adaptive Thresholds**: Auto-calibrate per task via calibration discussion → baseline metrics → threshold scaling
- **Adaptive Dosage**: Intervention strength = f(severity, information_coverage, history_effectiveness)
- **Cross-Examination**: Splits agents into PRO/CON camps → adversarial debate → synthetic verdict + minority report
- **Dropout Sensitivity**: Agent dropout → effect estimation → sensitivity graph (measures outcome sensitivity to each agent)

#### Custom Detector Registration

The governance engine supports extensible bias detection via `registerDetector()`:

```typescript
engine.registerDetector({
  type: "groupthink",
  detect(agentBeliefs, messages, config): DetectorResult {
    return { detected: true, severity: "medium", description: "..." };
  },
});
```

Custom detectors run after the 4 built-in detectors in `diagnose()`, and results are merged into `GovernanceResult.otherIssues`. This allows domain-specific bias detection without modifying the core engine.

#### Shared Utilities (`src/lib/utils/`)

Cross-cutting utilities extracted to eliminate code duplication:

| Module | Purpose |
|--------|---------|
| `Registry<K,V>` | Generic registry base class (used by AdapterRegistry, StrategyRegistry) |
| `jsonUtils.ts` | Unified JSON parsing: `stripCodeFences`, `safeJsonParse`, `extractNumber/String/Array` |
| `statsUtils.ts` | Statistical helpers: `mean`, `std`, `sampleStd`, `variance`, `normalize`, `round` |
| `interventionPrompt.ts` | Unified intervention prompt header/footer formatting |

### 4.4 Evaluation Engine (`src/lib/evaluation/`)

5-dimension scoring with statistical grounding:

| Dimension | Formula | Weight |
|-----------|---------|--------|
| Consensus | Kuramoto order parameter + σ + agreement rate + trajectory | 20% |
| Reliability | Cronbach's α (cross-round) + cross-validation + repeatability | 25% |
| Dispersion | Belief/confidence variance + round variability | 20% |
| Stability | Round consistency + time-series smoothness | 17% |
| Influence Analysis | Gini coefficient + network centrality + influence paths | 18% |

### 4.5 Discussion Engine (`src/lib/discussion/`)

The built-in multi-round agent discussion orchestrator. Serves as both:
- **A demonstration framework** — shows how the governance runtime integrates
- **The research platform's execution engine** — runs controlled experiments

Can optionally delegate governance to an external `GovernanceRuntime` (SDK mode) or use its internal `GovernanceEngine` directly (standalone mode).

---

## 5. LLM Provider Abstraction

Unified multi-provider interface:

| Provider | Models | Features |
|----------|--------|----------|
| DeepSeek | deepseek-chat, deepseek-reasoner | JSON mode, default |
| OpenAI | gpt-4o-mini, gpt-4o, gpt-4-turbo, gpt-3.5-turbo | JSON mode |
| Anthropic | claude-3-haiku/sonnet/opus | Messages API |
| Local | llama3, mistral, qwen2 | Ollama compatible |

4-layer fault-tolerant response parsing with error classification (TIMEOUT/NETWORK/API_ERROR/PARSE_ERROR/AUTH_ERROR/RATE_LIMIT/INVALID_RESPONSE).

---

## 6. Security

| Component | Feature |
|-----------|---------|
| Rate Limiting | Token bucket, 6 presets (strict/standard/relaxed/hourly/daily/experiment) |
| Input Validation | XSS, SQL injection, command injection, path traversal detection |
| Security Headers | CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |

---

## 7. Experiment Infrastructure

`experiments/v2/` — Two-task experiment framework with full ablation matrix:

| Task | Interdependence | Baseline τ | Full τ | Shuffle τ | Δτ (Full) | Key Finding |
|------|----------------|-----------|--------|-----------|-------------|-------------|
| **Invest (3-round, n=15)** | Strong | 0.422 | 0.644 | — | +0.133 (p=0.152, d=+0.65) | Medium effect, NOT sig — 2×2 design shows round moderation |
| **Invest (5-round, n=15)** | Strong | 0.778 | 0.778 | 1.000 | +0.00 (p=1.0, d=+0.00) | Zero effect at ceiling — 2×2 design confirms round moderation |
| **M&A (n=15/10)** | Weak | 0.533 | 0.613 | **0.900** | −0.12 (p=0.36) | Shuffle > Full: breaking overconfidence forces listening |

- **165 experiments** (M&A 80 + Invest 5-round 55 + Invest 3-round 30)
- **7 ablation modes**: none, full, shuffle (regression-to-mean control), 4 single-intervention (full_diversity/weight/reflection/continue)
- **Primary metric**: Kendall's τ + within-group τ trajectory (Δτ)
- **Controls**: Shuffle control (scrambled knowledge) + single-intervention ablation (which mechanism matters?)
- **Statistical inference**: t-distribution 95% CI (small-sample correct) + permutation test p-values (Fisher-Yates shuffle, 10,000 permutations)
- **Parameter sensitivity**: One-at-a-time sweep over 5 governance parameters (125 configs, n=5 each, infrastructure ready)
- All raw JSON preserved in `experiments/v2/data/` (M&A), `experiments/v2/data_invest/` (Invest 5-round), and `experiments/v2/data_invest_3round/` (Invest 3-round)

### Key experimental findings

1. **2×2 factorial design confirms round moderation**: The 2×2 design (3-round vs 5-round × none vs full, n=15 per cell) shows 3-round Invest with a medium effect (d=+0.65, p=0.152, Net Δτ=+0.133, CI [−0.09, +0.35]) and 5-round Invest with zero effect (d=+0.00, p=1.0) — governance has directional benefit in limited rounds but zero effect with sufficient rounds
2. **full_reflection significantly harmful (p=0.048)**: On 5-round Invest, full_reflection (n=5) produces τ=0.333, ΔQ=−22.2, p=0.048 — the first and only statistically significant governance effect, and it is HARMFUL. full_weight (τ=0.467, ΔQ=−15.6, p=0.173) shows a harmful trend
3. **No positive governance effect reaches significance**: Across all full-vs-none comparisons (M&A p=0.36; Invest 3-round p=0.152; Invest 5-round p=1.0), no governance configuration produces a statistically significant improvement at p<0.05
4. **Shuffle control (M&A) is the strongest positive finding**: τ=0.900 vs baseline 0.533, d=+1.80, **p=0.0009** (significant) — scrambling agent knowledge forces listening, outperforming targeted governance on this weakly-interdependent task
5. **Single-intervention ablation (M&A)**: None significant — full_diversity (p=0.174), full_weight (p=0.171, τ=0.700), full_reflection (p=0.183), full_continue (p=0.267) — no single mechanism dominates

`experiments/lunar_survival/` — Legacy V1 framework (80+ experiments, keyword-matching metric)

---

## 8. Test Coverage

| Module | Tests | File |
|--------|-------|-------|
| Governance Engine | 12 | governance.test.ts |
| Evaluation Engine | 12 | evaluation.test.ts |
| Discussion Engine | 12 | discussion.test.ts |
| Cross-Examination | 8 | cross-examination.test.ts |
| Adaptive Thresholds | 9 | adaptive-thresholds.test.ts |
| Adaptive Dosage | 6 | adaptive-dosage.test.ts |
| Interventions | 9 | interventions.test.ts |
| Benchmarks | 14 | benchmarks.test.ts |
| Runtime | 3 | runtime.test.ts |
| Security | 13 | security.test.ts |
| Frontend | 14 | frontend.test.tsx |
| LLM Providers | 12 | llm-providers.test.ts |
| Stats Utils | 11 | stats-utils.test.ts |
| Adapters | 10 | adapters.test.ts |
| Pipeline | 4 | pipeline.test.ts |
| **Total** | **149** | **15 files** |

---

## 9. Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime SDK | TypeScript 5.5 (zero framework dependencies) |
| Web Framework | Next.js 14.2 (App Router) |
| Frontend | React 18.3 + Tailwind CSS 3.4 |
| Testing | Vitest 4.1 + Testing Library |
| LLM | DeepSeek-V3 (primary), OpenAI, Anthropic, Local |
| Mathematics | Kuramoto synchronization, Gini coefficient, bimodality coefficient, Cronbach's α, Kendall's τ |

---

## 10. Long-Term Vision: Agent Society Governance

The governance runtime's architecture is inherently scalable. The core loop — observe → model → detect → intervene → evaluate — is agnostic to agent count and framework. As multi-agent systems evolve from small discussion groups to organizational-scale agent ecosystems, the same governance primitives apply:

| Scale | 5 Agents | 500 Agents |
|-------|---------|-----------|
| **Observation** | Discussion messages per round | Continuous inter-agent transaction streams |
| **Belief Model** | Per-round belief vectors | Dynamic social graph with evolving positions |
| **Failure Modes** | 4 discussion biases | Social-level failures: monopoly, segregation, systemic collusion |
| **Intervention** | Per-round targeted action | Continuous institutional governance policies |
| **Evaluation** | Decision quality (5 dims) | Societal health metrics |

SwarmAlpha's framework-agnostic adapter layer, LLM/mathematics separation, and event-driven architecture make it the **minimal viable kernel** of a future governance operating system for AI agent societies.

> *"Not a framework for building agents. An operating system for governing them."*

---

> **Code**: ~13,000 TypeScript | **Tests**: 149 | **Experiments**: 165 | **Docs**: 5 core documents
