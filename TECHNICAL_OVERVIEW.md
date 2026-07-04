# SwarmAlpha Technical Architecture

> **An Embeddable Governance Runtime — Deep Technical Overview**
>
> Updated: 2026-07-04 | Version: V3 Governance Runtime

---

## 1. Project Positioning

SwarmAlpha is an **embeddable governance runtime** for LLM multi-agent systems. It does NOT create agents, manage workflows, or handle tool calling. Instead, it plugs into existing frameworks (AutoGen, CrewAI, LangGraph, or custom systems) as a **governance layer** that:

- Observes agent discussions in real time
- Models belief evolution and influence propagation
- Detects 4 types of collective decision failures
- Intervenes with adaptive, targeted governance actions
- Evaluates decision quality across 5 statistically-grounded dimensions

**Core insight**: LLM multi-agent systems suffer the same decision failures as human groups — but no existing framework detects or intervenes. SwarmAlpha fills this gap.

**Key architectural principle**: LLMs only do perception (extracting beliefs/emotions from language). Mathematics handles evolution (consensus, bias detection, belief dynamics). This means the governance runtime can run as a **lightweight plugin** without additional LLM calls.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                 Your Multi-Agent Framework                │
│         (AutoGen / CrewAI / LangGraph / Custom)           │
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
│   │   structured data) │   Bayesian inference)       │      │
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
│   │          │ · Causal tracing   │                   │      │
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
| Echo Chamber | Info redundancy = (1-σ)×0.5 + Jaccard similarity×0.5 | 0.70 |
| Authority Bias | Dominant agent's message share | 0.40 |
| Polarization | Belief standard deviation | 0.50 |
| Premature Consensus | Round progress < 0.5 ∧ consensus > 0.7 ∧ σ < 0.15 | 0.50 |

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
- **Causal Tracing**: Counterfactual dropout → ATE estimation → causal graph (distinguishes correlation from causation)

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

`experiments/lunar_survival/` — Hidden Profile experiment framework:
- 2 tasks (Lunar Survival, M&A) + 1 planned (Urban Planning)
- 4 ablation modes × 10+ repetitions = 80+ experiments
- Statistical analysis: independent samples t-test + Cohen's d
- Raw data preservation for reproducibility

---

## 8. Test Coverage

| Module | Tests | Files |
|--------|-------|-------|
| Governance Engine | 12 | governance.test.ts |
| Evaluation Engine | 12 | evaluation.test.ts |
| Discussion Engine | 12 | discussion.test.ts |
| Cross-Examination | 8 | cross-examination.test.ts |
| Adaptive Thresholds + Causal | 11 | adaptive-thresholds.test.ts |
| Adaptive Dosage | 6 | adaptive-dosage.test.ts |
| Interventions | 9 | interventions.test.ts |
| LLM Providers | 14 | llm-providers.test.ts |
| Benchmarks | 14 | benchmarks.test.ts |
| Runtime (Observation + Inference) | 3 | runtime.test.ts |
| Security | 13 | security.test.ts |
| Frontend | 14 | frontend.test.tsx |
| **Total** | **124** | **12 files** |

---

## 9. Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime SDK | TypeScript 5.5 (zero framework dependencies) |
| Web Framework | Next.js 14.2 (App Router) |
| Frontend | React 18.3 + Tailwind CSS 3.4 |
| Testing | Vitest 4.1 + Testing Library |
| LLM | DeepSeek-V3 (primary), OpenAI, Anthropic, Local |
| Mathematics | Kuramoto synchronization, Bayesian inference, information entropy, Gini coefficient, Cronbach's α |

---

> **Code**: ~13,000 TypeScript | **Tests**: 124 | **Experiments**: 80+ | **Docs**: 5 core documents
